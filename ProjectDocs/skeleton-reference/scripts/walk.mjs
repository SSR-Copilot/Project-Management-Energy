#!/usr/bin/env node
/**
 * G-WALK — build the app, serve it, and walk every screen in mock mode.
 *
 * `scripts/scenario.mjs` is the walk itself. This wrapper exists because that script needs
 * three things it cannot arrange for itself — a browser, a build, and a server — and running
 * it without them produces `ERR_MODULE_NOT_FOUND`, which tells a developer nothing about
 * what to do next.
 *
 * WHY PLAYWRIGHT IS NOT A DEPENDENCY. It would put a ~150 MB browser download in every
 * developer's `npm install`, for one script most of them will never run. So it is installed
 * outside the lockfile, by CI in its own job and by a developer when they want the walk. This
 * wrapper detects its absence and prints the one command that fixes it.
 *
 * WHAT THE WALK CATCHES that nothing else does: the app being wrong when you move through it
 * rather than when you render one screen. The reason it exists is a specific incident —
 * `+ Add Project` navigated straight into the `RequireProject` guard, so the app's only
 * create path was unreachable while every one of the unit tests passed.
 *
 * USAGE
 *   node scripts/walk.mjs              build if needed, serve, walk
 *   node scripts/walk.mjs --no-build   reuse an existing dist/
 *   node scripts/walk.mjs --url <u>    walk something already being served, no build, no serve
 *   node scripts/walk.mjs --port 4176  serve on a different port
 *
 * EXIT CODES  0 no problems · 1 the walk found problems (count is scenario.mjs's own exit)
 *             2 bad usage · 3 a precondition is missing, with the command that fixes it
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const value = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };

if (flag("--help") || flag("-h")) {
  console.log(process.argv[1] ? "See the header of scripts/walk.mjs" : "");
  console.log(`
G-WALK — build, serve, and walk every screen in mock mode.

  node scripts/walk.mjs              build if needed, serve, walk
  node scripts/walk.mjs --no-build   reuse an existing dist/
  node scripts/walk.mjs --url <u>    walk an already-served app
  node scripts/walk.mjs --port 4176  serve on a different port
`);
  process.exit(0);
}
for (const a of argv) {
  if (a.startsWith("--") && !["--help", "-h", "--no-build", "--url", "--port"].includes(a)
      && argv[argv.indexOf(a) - 1] !== "--url" && argv[argv.indexOf(a) - 1] !== "--port") {
    console.error(`unknown argument ${a} — see --help`);
    process.exit(2);
  }
}

/* ────────────────────────────────────────────────────────── preconditions ─── */

/*
 * Probe with a real dynamic import, not `require.resolve`. They disagree in exactly the case
 * that matters: a globally installed playwright is on the CJS resolution path, so
 * `require.resolve` succeeds, while the ESM `import "playwright"` inside `scenario.mjs`
 * still fails. Testing with the same mechanism the consumer uses is the only test worth
 * having.
 */
try {
  await import("playwright");
} catch {
  console.error("G-WALK cannot run: playwright is not installed.\n");
  console.error("  It is deliberately not a dependency of this package — a browser download");
  console.error("  in every developer's install, for one script, is a bad trade.\n");
  console.error("  Install it outside the lockfile:\n");
  console.error("      npm i -D --no-save playwright && npx playwright install chromium\n");
  process.exit(3);
}

const externalUrl = value("--url");
const port = value("--port", "4176");
const url = externalUrl ?? `http://127.0.0.1:${port}`;

if (!externalUrl && !flag("--no-build") && !existsSync(join(ROOT, "dist/index.html"))) {
  console.log("G-WALK: no dist/, building first");
  const b = spawnSync("npm", ["run", "build"], { cwd: ROOT, stdio: "inherit" });
  if (b.status !== 0) { console.error("G-WALK: the build failed, so there is nothing to walk"); process.exit(3); }
}
if (!externalUrl && !existsSync(join(ROOT, "dist/index.html"))) {
  console.error("G-WALK: --no-build was given but dist/index.html does not exist");
  process.exit(3);
}

/* ──────────────────────────────────────────────────────────────── the walk ─── */

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function reachable(u) {
  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(2000) });
    return res.ok || res.status === 304;
  } catch { return false; }
}

let server;
if (!externalUrl) {
  server = spawn("npx", ["vite", "preview", "--port", port, "--host", "127.0.0.1"],
    { cwd: ROOT, stdio: "ignore", detached: false });
  process.on("exit", () => { try { server.kill(); } catch { /* already gone */ } });
}

let up = false;
for (let i = 0; i < 25; i += 1) {
  if (await reachable(url)) { up = true; break; }
  await wait(1000);
}
if (!up) {
  console.error(`G-WALK: nothing is answering at ${url} after 25s`);
  try { server?.kill(); } catch { /* ignore */ }
  process.exit(3);
}

const walk = spawnSync(process.execPath, [join(ROOT, "scripts/scenario.mjs")], {
  cwd: ROOT,
  stdio: "inherit",
  env: { ...process.env, APP_URL: url },
});
try { server?.kill(); } catch { /* ignore */ }

// scenario.mjs exits with its problem count; anything non-zero is a failure.
process.exit(walk.status === 0 ? 0 : 1);
