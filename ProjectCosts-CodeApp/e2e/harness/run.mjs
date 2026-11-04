/**
 * The one-hour parity harness: the runner (D80; plan `ProjectDocs/app-docs/e2e/PARITY-ONE-HOUR-PLAN.md`).
 *
 *   node e2e/harness/run.mjs --screen <slug>|a,b|all [--mode full|compare] [--tier smoke|read|full] [--lanes N] [--no-rerun]
 *   npm run parity / parity:compare / parity:smoke  (pass more flags after `--`)
 *
 * The screen is required: `--screen`, else `PARITY_SCREEN`. Neither set, the runner stops at once with
 * "set PARITY_SCREEN (or --screen) to one of: <screens on disk>" (`runPlan.mjs` resolveScreens).
 *
 * Screen-agnostic: `--screen all` is every folder `e2e/screens/<slug>/` with a `manifest.ts`, found on disk (no TypeScript
 * is imported to list them). Screens run ONE AFTER ANOTHER, each with `PARITY_SCREEN` set and its own run folder:
 *
 *   batch id     local YYYYMMDD-HHmm, made unique (`-2`, `-3`, ...); it is every screen's `PARITY_RUN_ID`;
 *                `e2e/runs/latest.json` names the batch and the screen in progress
 *   screen run   `e2e/runs/<batch>/<slug>/` (the `env.ts` run folder): facts, timings, run.json, summary, last-run files
 *   phase 1      preflight + read lanes (compare mode: code lanes only; smoke tier: code-A `--grep @smoke`), plus the write
 *                lanes when tier full and both sandbox projects are set (`writesInParallel`)
 *   phase 2      tier full, not parallel: the write lanes, `--no-deps` (compare mode: write-code only)
 *   re-run pass  unless --no-rerun: every test that failed (or did not run) in phases 1 and 2, once, with PARITY_RERUN=1 so
 *                the reporter records it as retry 1 (flaky when it passes then)
 *   phase 3      `--project report --no-deps`: offline comparison, summary.md / summary.json. Always runs, even after the
 *                deadline or a failed preflight, with its own 5 minutes
 *   index        `e2e/runs/<batch>/index.md`: one row per screen (verdict, wall clock, counts, phase times, link)
 *
 * The re-run pass uses Playwright's own `--last-failed` (checked against @playwright/test 1.64.1): each phase writes its
 * last-run file to `<runDir>/last-run.<phase>.json` (`PLAYWRIGHT_LAST_RUN_OUTPUT_FILE`), the runner merges their
 * `failedTests` ids into `<runDir>/last-run.rerun.json`, and the pass runs `--last-failed --last-failed-file <that file>`.
 * A single last-run file in the output folder would only hold the LAST phase's failures, and each phase empties its output
 * folder, so the files are kept outside it. Test ids are stable across the phases (same config, file, title and project).
 *
 * Deadline: 60 minutes per screen. A phase still running then is killed (its whole process tree) and the screen goes on to
 * the report. Exit code 1 when any screen failed its preflight, hit the deadline, has no summary, has a failed (not flaky)
 * test, or has new or stale differences; else 0.
 *
 * A project variable that is set but is not a GUID stops the batch before anything starts. A missing read project does not:
 * a screen without a project (Application Settings) needs none, and a project-scoped screen's preflight stops at step 0,
 * naming the variable, before it opens a page.
 *
 * The test project is ASKED FOR at the start of every run on an interactive terminal (`askProjects`; user requirement,
 * 3 Nov 2026), never taken from an earlier run or a file. A non-interactive run reads the environment variables instead.
 *
 * Project ids come only from the prompt or the environment and are never printed: the child processes inherit them, and only the run
 * settings (`PARITY_SCREEN`, `PARITY_RUN_ID`, `PARITY_MODE`, `PARITY_TIER`, `PARITY_LANES`, `PARITY_PHASE`,
 * `PARITY_STARTED_AT`, `PARITY_RERUN`) are added. Windows: the children run through the shell (`npx` is `npx.cmd`).
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  commandLine, elapsed, exitCode, hasReadProject, maskId, mergeFailed, newRunId, parseArgs, phasePlan, phaseTimeout,
  playwrightArgs, preflightFailed, PROJECT_PROMPTS, projectVarsProblem, readProjectAnswer, renderRunTable, resolveScreens,
  SCREEN_DEADLINE_MS, screenRunPath, screensFromListing,
  screenVerdict, summaryLink, uniqueRunId, USAGE, writesInParallel,
} from "./runPlan.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUNS = join(ROOT, "e2e", "runs");
const SCREENS = join(ROOT, "e2e", "screens");
const WIN = process.platform === "win32";

const log = (msg) => console.log(`[parity] ${msg}`);
/** A path relative to the repo root with forward slashes: no spaces from the checkout path reach the command line. */
const rel = (p) => relative(ROOT, p).split("\\").join("/");

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** `e2e/screens/*` as { name, files } (file names only). */
function screenListing() {
  if (!existsSync(SCREENS)) return [];
  return readdirSync(SCREENS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ name: d.name, files: readdirSync(join(SCREENS, d.name)) }));
}

/** Kills a child and everything it started (Windows: the shell, npx, Playwright and its workers and browsers). */
function killTree(child) {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (WIN) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else {
    try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
  }
}

/** The phase running now, so Ctrl+C stops its whole tree too (POSIX runs it in its own process group). */
let current = null;
process.on("SIGINT", () => {
  if (current) killTree(current);
  process.exit(130);
});

/** Runs `npx <args>` from the repo root; resolves { code, killed } (killed: the timeout ended it). */
function runNpx(args, env, timeoutMs) {
  return new Promise((done) => {
    const line = commandLine("npx", args);
    log(`  $ ${line}`);
    const child = spawn(line, { cwd: ROOT, env, shell: true, stdio: "inherit", detached: !WIN });
    current = child;
    let killed = false;
    const timer = setTimeout(() => { killed = true; log(`  deadline: stopping the phase after ${elapsed(timeoutMs)}`); killTree(child); }, timeoutMs);
    const finish = (code) => { clearTimeout(timer); current = null; done({ code, killed }); };
    child.on("error", (e) => { log(`  could not start: ${e.message}`); finish(null); });
    child.on("close", (code) => finish(code));
  });
}

async function runScreen(screen, ctx) {
  // Every screen of the batch has the batch id as its run id; env.ts puts it in its own `<runId>/<screen>` folder.
  const runId = ctx.batchId;
  const runDir = join(RUNS, ...screenRunPath(ctx.batchId, screen).split("/"));
  mkdirSync(runDir, { recursive: true });
  writeJson(join(RUNS, "latest.json"), { runId, batchId: ctx.batchId, screen, screens: ctx.screens });

  const started = Date.now();
  const deadline = started + ctx.deadlineMs;
  const base = { ...process.env };
  delete base.PARITY_RERUN;
  Object.assign(base, {
    PARITY_SCREEN: screen,
    PARITY_RUN_ID: runId,
    PARITY_MODE: ctx.args.mode,
    PARITY_TIER: ctx.args.tier,
    PARITY_STARTED_AT: new Date(started).toISOString(),
  });
  if (ctx.args.lanes !== undefined) base.PARITY_LANES = String(ctx.args.lanes);

  log(`screen ${screen}: run ${runId}, mode ${ctx.args.mode}, tier ${ctx.args.tier}, writes ${ctx.parallel ? "beside" : "after"} the read lanes`);
  const result = { screen, runId, phases: [], preflightFailed: false, timedOut: false, summary: null, wallClockMs: 0 };
  const lastRunFiles = [];

  for (const phase of phasePlan({ mode: ctx.args.mode, tier: ctx.args.tier, parallel: ctx.parallel, rerun: ctx.args.rerun })) {
    const t0 = Date.now();
    const skip = (why) => { log(`${screen} ${phase.label}: skipped (${why})`); result.phases.push({ name: phase.name, ms: 0, skipped: true }); };

    if (!phase.report && (result.preflightFailed || result.timedOut)) { skip(result.preflightFailed ? "preflight failed" : "deadline reached"); continue; }
    const timeoutMs = phaseTimeout(phase, t0, deadline);
    if (timeoutMs <= 0) { result.timedOut = true; skip("deadline reached"); continue; }

    const env = { ...base, PARITY_PHASE: phase.name };
    let args;
    if (phase.rerun) {
      const ids = mergeFailed(lastRunFiles.map(readJson));
      if (!ids.length) { skip("nothing failed"); continue; }
      const file = join(runDir, "last-run.rerun.json");
      writeJson(file, { status: "failed", failedTests: ids });
      env.PARITY_RERUN = "1";
      env.PLAYWRIGHT_LAST_RUN_OUTPUT_FILE = rel(file);
      args = playwrightArgs(phase, { lastFailedFile: rel(file) });
      log(`${screen} ${phase.label}: ${ids.length} test(s)`);
    } else {
      const file = join(runDir, `last-run.${phase.name}.json`);
      if (!phase.report) lastRunFiles.push(file);
      env.PLAYWRIGHT_LAST_RUN_OUTPUT_FILE = rel(file);
      args = playwrightArgs(phase);
      log(`${screen} ${phase.label}`);
    }

    const { code, killed } = await runNpx(args, env, timeoutMs);
    const ms = Date.now() - t0;
    if (killed && !phase.report) result.timedOut = true;
    result.phases.push({ name: phase.name, ms, exitCode: code });
    log(`${screen} ${phase.label}: ${elapsed(ms)}, exit ${code ?? "none"}${killed ? " (killed at the deadline)" : ""}`);

    if (phase.name === "phase1") {
      result.preflightFailed = preflightFailed(readJson(join(runDir, "timings.json")));
      if (result.preflightFailed) log(`${screen}: the preflight failed; see its error above. Only the report runs now.`);
    }
  }

  result.wallClockMs = Date.now() - started;
  result.summary = readJson(join(runDir, "summary.json"));
  const v = screenVerdict(result);
  log(`${screen}: ${v.ok ? "pass" : `FAIL (${v.reasons.join("; ")})`} in ${elapsed(result.wallClockMs)}${result.summary ? `; ${rel(join(runDir, "summary.md"))}` : ""}`);
  return result;
}

/** index.md: the runner's table, then `summary.ts` renderIndex when Node can import it (type stripping, Node 22.6+). */
async function writeIndex(batchId, results) {
  const dir = join(RUNS, batchId);
  mkdirSync(dir, { recursive: true });
  let md = renderRunTable(batchId, results);
  const summaries = results.map((r) => r.summary).filter(Boolean);
  if (summaries.length) {
    try {
      const { renderIndex } = await import(pathToFileURL(join(ROOT, "e2e", "harness", "summary.ts")).href);
      md += `\n${renderIndex(summaries, (s) => summaryLink(s.screen)).replace(/^# .*$/m, "## Differences per screen")}`;
    } catch (e) {
      md += `\n(The difference table is missing: e2e/harness/summary.ts could not be imported from plain Node: ${e.message})\n`;
    }
  }
  const path = join(dir, "index.md");
  writeFileSync(path, md, "utf8");
  return path;
}

/**
 * Asks for the test project (and the write projects) at the start of every run, on an interactive terminal. The answers
 * go into this process's environment only, which the phases inherit; they are never written to a file or printed (the
 * console shows them masked). A non-interactive run keeps whatever the environment variables say.
 */
async function askProjects() {
  if (!process.stdin.isTTY) {
    log("not an interactive terminal: the project ids come from PARITY_READ_PROJECT_ID / PARITY_WRITE_PROJECT_*");
    return;
  }
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    let readProject;
    for (const p of PROJECT_PROMPTS) {
      for (;;) {
        const r = readProjectAnswer(await rl.question(`[parity] ${p.question}: `), { name: p.name, readProject });
        if (r.error) { log(r.error); continue; }
        if (r.value === undefined) delete process.env[p.name];
        else process.env[p.name] = r.value;
        if (p.name === "PARITY_READ_PROJECT_ID") readProject = r.value;
        log(`  ${p.name} = ${maskId(r.value)}`);
        break;
      }
    }
  } finally {
    rl.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2), { screen: process.env.PARITY_SCREEN });
  if (args.help) { console.log(USAGE); return 0; }
  await askProjects();
  const problem = projectVarsProblem(process.env);
  if (problem) throw new Error(problem);
  const screens = resolveScreens(args.screens, screensFromListing(screenListing()));
  if (!hasReadProject(process.env)) {
    log("no PARITY_READ_PROJECT_ID set: a project-scoped screen stops at its preflight; screens without a project run");
  }

  mkdirSync(RUNS, { recursive: true });
  const batchId = uniqueRunId(newRunId(new Date()), readdirSync(RUNS));
  const parallel = args.tier === "full" && writesInParallel(process.env);
  const ctx = { args, screens, batchId, parallel, deadlineMs: SCREEN_DEADLINE_MS };
  log(`batch ${batchId}: ${screens.length} screen(s): ${screens.join(", ")}`);

  const batchStart = Date.now();
  const results = [];
  for (const screen of screens) results.push(await runScreen(screen, ctx));

  const index = await writeIndex(batchId, results);
  const code = exitCode(results);
  log(`batch ${batchId}: ${elapsed(Date.now() - batchStart)}; ${rel(index)}; exit ${code}`);
  return code;
}

main().then((code) => process.exit(code), (e) => {
  console.error(`[parity] ${e.message}`);
  process.exit(1);
});
