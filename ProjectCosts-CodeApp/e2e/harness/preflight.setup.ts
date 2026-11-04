/**
 * The parity harness preflight (D80, plan section 1, about 3 minutes): the `preflight` Playwright project, which every lane
 * depends on. It stops a run at minute 0 instead of letting lanes fail one by one later. Screen-agnostic: the screen is
 * `PARITY_SCREEN`, loaded through its manifest; nothing here names a screen.
 *
 *   0. settings   `runEnv()`: a wrong or missing variable fails here, naming the variable (never a value)
 *   1. servers    http://localhost:3000 (npm run dev) and :8080 (pac code run) answer within 5 s
 *   2. reference  compare mode (not smoke): a cached Canvas reference exists for the screen (checked again after step 4)
 *   3. sessions   the saved sessions still sign in: the code app (always) and the Canvas (full mode, not smoke). A page that
 *                 lands on login.microsoftonline.com fails within 45 s with "run npm run e2e:auth:codeapp / e2e:auth:canvas".
 *                 The Canvas opened is the screen's own canvas app: the Cost canvas for `cost`, the PM canvas otherwise.
 *   4. fingerprint  the code app opens the screen (`openers.ts` openScreen, on the read project, or none for a screen
 *                 without a project) and reads `manifest.fingerprint`, else `data.ts` defaultFingerprint
 *   5. reference  compare mode (not smoke): the reference's canvas version and fingerprint match, else "re-record the
 *                 Canvas: PARITY_MODE=full"
 *   6. run.json   { runId, screen, mode, tier, canvasVersion, fingerprint, startedAt, writesInParallel } (merged into an
 *                 existing run.json). `startedAt` is `PARITY_STARTED_AT` from run.mjs, so the summary's wall clock covers
 *                 the whole screen run.
 *
 * Steps 3 and 4 run the two apps side by side. No project id is written or printed.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { STORAGE_STATE, VIEWPORT } from "../lib/browser";
import { CANVAS_COST_URL } from "../lib/appFrame";
import { CANVAS_FRAME, CANVAS_PM_URL, pressSignIn } from "../lib/parity";
import type { Kind, ScreenManifest } from "./contract";
import { defaultFingerprint } from "./data";
import { REPO_ROOT, requireProjectId, runEnv } from "./env";
import { openScreen } from "./openers";
import {
  canvasAppFor, isLoginUrl, loginVerdict, needsCanvas, needsReference, referenceProblem, serverProblem, sessionMessage,
  startedAtOf,
} from "./preflightChecks";
import { loadManifest } from "./screens";
import { readReferenceMeta, runJson, writeRunJson } from "./store";
import { enableCodeHook } from "./waits";

/** The whole preflight; the plan's budget is 3 minutes, the cap leaves room for a slow Canvas player. */
const PREFLIGHT_TIMEOUT_MS = 4 * 60_000;
/** The Canvas player shows its first controls within this time on a valid session. */
const CANVAS_READY_MS = 150_000;
/** A sign-in field on the Microsoft page: the session is gone. */
const LOGIN_PROMPT = "input[name='loginfmt'], input[type='password'], #tilesHolder";

async function newContext(browser: Browser, kind: Kind): Promise<BrowserContext> {
  const file = join(REPO_ROOT, STORAGE_STATE[kind]);
  if (!existsSync(file)) throw new Error(sessionMessage(kind, `no saved session at ${STORAGE_STATE[kind]}`));
  const context = await browser.newContext({ storageState: file, viewport: { ...VIEWPORT } });
  if (kind === "code") await enableCodeHook(context);
  return context;
}

/**
 * Polls `page` until `ready()` is true; throws `sessionMessage` when the page sticks on the Microsoft sign-in host
 * (`loginVerdict`), or a load message after `readyMs`. `stop()` ends the watch quietly (the caller's own wait finished).
 */
async function watchSession(
  page: Page, kind: Kind, readyMs: number, ready: () => Promise<boolean>, stopped: () => boolean = () => false,
): Promise<void> {
  const startedMs = Date.now();
  let onLoginSinceMs: number | null = null;
  for (;;) {
    if (stopped() || await ready()) return;
    const onLogin = isLoginUrl(page.url()) || page.frames().some((f) => isLoginUrl(f.url()));
    onLoginSinceMs = onLogin ? (onLoginSinceMs ?? Date.now()) : null;
    const promptVisible = onLogin && await page.locator(LOGIN_PROMPT).first().isVisible().catch(() => false);
    if (loginVerdict({ onLogin, promptVisible, onLoginSinceMs, nowMs: Date.now(), startedMs })) {
      throw new Error(sessionMessage(kind, "the page stays on login.microsoftonline.com"));
    }
    if (Date.now() - startedMs > readyMs) {
      throw new Error(`The ${kind === "code" ? "code app" : "Canvas"} did not load within ${Math.round(readyMs / 1000)} s (not a sign-in page)`);
    }
    if (kind === "canvas") await pressSignIn(page);
    await page.waitForTimeout(1_000);
  }
}

/** Step 3, Canvas: the screen's canvas app starts and shows controls. The lanes open their own pages; this one is closed. */
async function checkCanvasSession(browser: Browser, manifest: ScreenManifest): Promise<void> {
  const context = await newContext(browser, "canvas");
  try {
    const page = await context.newPage();
    await page.goto(canvasAppFor(manifest.open.app) === "cost" ? CANVAS_COST_URL : CANVAS_PM_URL);
    const app = page.frameLocator(CANVAS_FRAME);
    const ready = async () => (await app.locator("[data-control-name]").count().catch(() => 0)) > 0;
    try {
      await watchSession(page, "canvas", CANVAS_READY_MS, ready);
    } catch (e) {
      // The player can stick on "Fetching your app ..." (live run 11, 4 Nov 2026); one reload usually gets it through. A
      // sign-in problem is not retried: that needs a person (`npm run e2e:auth:canvas`).
      if (/sign-in|login\.microsoftonline/i.test(String(e))) throw e;
      console.warn(`[parity] preflight: ${String(e).split("\n")[0]}; reloading the Canvas once`);
      await page.reload();
      await watchSession(page, "canvas", CANVAS_READY_MS, ready);
    }
  } finally {
    await context.close().catch(() => {});
  }
}

/** Steps 3 and 4, code app: opens the screen (its own waits) while watching for the sign-in page, then reads the fingerprint. */
async function codeFingerprint(browser: Browser, manifest: ScreenManifest, projectId: string | null): Promise<Record<string, number | string>> {
  const context = await newContext(browser, "code");
  try {
    const page = await context.newPage();
    let done = false;
    const opened = openScreen("code", page, manifest, projectId).finally(() => { done = true; });
    opened.catch(() => {}); // when the watch throws first, the open's own failure is not reported twice
    await Promise.race([
      opened,
      // Only the sign-in host fails here; how long the screen takes to load is the opener's business.
      watchSession(page, "code", PREFLIGHT_TIMEOUT_MS, async () => false, () => done),
    ]);
    await opened;
    return manifest.fingerprint ? await manifest.fingerprint(page, projectId) : await defaultFingerprint(page, manifest, projectId);
  } finally {
    await context.close().catch(() => {});
  }
}

test("preflight: servers, sessions, data fingerprint, run.json", async ({ browser }) => {
  test.setTimeout(PREFLIGHT_TIMEOUT_MS);
  const started = Date.now();
  const step = (name: string) => console.log(`[parity] preflight ${name} (${Math.round((Date.now() - started) / 1000)} s)`);

  // 0. Settings, and the manifest of the selected screen.
  const env = runEnv();
  const manifest = await loadManifest(env.screen);
  const projectId = requireProjectId(env, manifest, "read");
  const previous = runJson<Record<string, unknown>>(env) ?? {};
  const startedAt = startedAtOf(process.env.PARITY_STARTED_AT, previous.startedAt, new Date());
  step(`screen ${env.screen}, mode ${env.mode}, tier ${env.tier}, writes ${env.writesInParallel ? "beside" : "after"} the read lanes`);

  // 1. Servers.
  const down = await serverProblem((url, init) => fetch(url, init));
  if (down) throw new Error(down);
  step("servers answer");

  // 2. A compare run needs a cached Canvas reference: fail before any browser starts.
  const checkReference = needsReference(env.mode, env.tier);
  if (checkReference) {
    const missing = referenceProblem(env.screen, readReferenceMeta(env.screen), manifest.canvasVersion);
    if (missing) throw new Error(missing);
  }

  // 3 + 4. Sessions and the fingerprint, both apps at once.
  const [fingerprint] = await Promise.all([
    codeFingerprint(browser, manifest, projectId),
    needsCanvas(env.mode, env.tier) ? checkCanvasSession(browser, manifest) : Promise.resolve(),
  ]);
  step(`sessions valid; fingerprint ${Object.keys(fingerprint).length} value(s)`);

  // 5. The reference still matches the canvas version and the data.
  if (checkReference) {
    const stale = referenceProblem(env.screen, readReferenceMeta(env.screen), manifest.canvasVersion, fingerprint);
    if (stale) throw new Error(stale);
    step("cached Canvas reference matches");
  }

  // 6. run.json.
  writeRunJson(env, {
    ...previous,
    runId: env.runId,
    screen: env.screen,
    mode: env.mode,
    tier: env.tier,
    canvasVersion: manifest.canvasVersion,
    fingerprint,
    startedAt,
    writesInParallel: env.writesInParallel,
  });
  step("run.json written");
});
