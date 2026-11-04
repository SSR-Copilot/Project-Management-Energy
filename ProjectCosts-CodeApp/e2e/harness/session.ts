/**
 * The parity harness: lane fixtures (D80, plan sections 2 and 4). Screen-agnostic: the screen comes from `PARITY_SCREEN`
 * through its manifest (`screens.ts` `loadManifest`); nothing here knows a screen.
 *
 * A lane is ONE serial describe on ONE worker, so everything expensive is worker-scoped and happens once per lane:
 *
 *   options  kind     "canvas" | "code"   which app the lane drives. Default: the Playwright project's `metadata.kind`
 *                                         (`playwright.harness.config.ts` sets it per lane project), else "canvas" for a
 *                                         project named canvas-* / write-canvas, else "code"
 *            target   "read" | "write"    which project it opens (`env.ts` `requireProjectId`). Default: "write" for a
 *                                         project named write-*, else "read"
 *            Either can be set with `laneTest.use({ kind: "canvas" })` at the top level of a lane file (worker options cannot
 *            be set inside a describe), or in a project's `use`.
 *   worker   env       `runEnv()`
 *            manifest  `loadManifest(env.screen)`
 *            app       ONE browser context + page for the lane, from the saved session (`lib/browser.ts` STORAGE_STATE),
 *                      the shared viewport and action timeout (`lib/browser.ts` BROWSER_USE; a context built in a worker
 *                      fixture does not inherit `use`), and the code app's idle hook on (`waits.ts` `enableCodeHook`). The
 *                      screen is opened once (`openers.ts` `openScreen`); `reset()` returns to rest without a reload
 *                      (`manifest.reset`, else `readers.ts` `resetToRest`), `reload()` opens the screen again and updates
 *                      `app.frame` in place (the handle object stays the same, so a test can keep it). Closed at worker end.
 *            laneClock {lane, startedAt} of the lane now running in this worker
 *   test     budget    (auto) before each test: the lane's elapsed time against `budgetFor(manifest, lane)` + 20 %; over it,
 *                      the test gets an "over-budget" annotation and a console warning (the lane goes on; the summary
 *                      names it; run.mjs keeps the hard deadline)
 *            shot      (auto) a screenshot of the lane's page attached to a failed test (Playwright's `trace` and
 *                      `screenshot` options cover test-scoped contexts only, not this worker-scoped one)
 *            record    record(layer, key, data): `store.ts` `writeFact` for this lane's app; returns the file path
 *
 * The lane of a test is its `@<lane>` tag (title path or `tag` option), else the Playwright project name. The lane clock
 * survives a worker restart (Playwright starts a new worker after a failure) because it is kept in
 * `<runDir>/lanes/<lane>.clock.json`, keyed by the runner process: a later Playwright invocation (the re-run pass) starts a
 * fresh clock.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test as base, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { BROWSER_USE, STORAGE_STATE } from "../lib/browser";
import type { AppHandle, Kind, Lane, Layer, RunEnv, ScreenManifest } from "./contract";
import { laneOf, overBudget, REPO_ROOT, requireProjectId, runEnv, type ProjectTarget } from "./env";
import { openScreenReady } from "./openers";
import { resetToRest } from "./readers";
import { budgetFor, loadManifest } from "./screens";
import { laneStartedAt, writeFact } from "./store";
import { enableCodeHook, settle } from "./waits";

export { expect };

/** Opening a screen on the Canvas player can take minutes (the sign-in retries in `lib/appFrame.ts`). */
const OPEN_TIMEOUT_MS = 6 * 60_000;
/**
 * A freshly opened screen's first loads get as long as its rest marker does (`openers.ts` READY_TIMEOUT_MS): with five
 * sessions starting at once, the code app stayed busy for more than 30 s (live run 14, 4 Nov 2026).
 */
const FIRST_SETTLE_MS = 90_000;

export interface LaneClock { lane: string; startedAt: number }
export type RecordFact = (layer: Layer, key: string, data: unknown) => string;

interface WorkerFixtures {
  kind: Kind;
  target: ProjectTarget;
  env: RunEnv;
  manifest: ScreenManifest;
  app: AppHandle;
  laneClock: LaneClock;
}
interface TestFixtures {
  budget: void;
  shot: void;
  record: RecordFact;
}

/** The app a project drives when no lane file says: `metadata.kind`, else the project name, else "code". */
function kindOfProject(project: { name: string; metadata?: Record<string, unknown> }): Kind {
  const k = project.metadata?.kind;
  if (k === "canvas" || k === "code") return k;
  return /^(canvas-|write-canvas$)/.test(project.name) ? "canvas" : "code";
}

export async function newLaneContext(kind: Kind, browser: Browser): Promise<BrowserContext> {
  const storageState = join(REPO_ROOT, STORAGE_STATE[kind]);
  if (!existsSync(storageState)) {
    const script = kind === "code" ? "e2e:auth:codeapp" : "e2e:auth:canvas";
    throw new Error(`No saved ${kind} session (${STORAGE_STATE[kind]}): run npm run ${script} first`);
  }
  const context = await browser.newContext({ storageState, viewport: BROWSER_USE.viewport });
  if (BROWSER_USE.actionTimeout) context.setDefaultTimeout(BROWSER_USE.actionTimeout);
  if (kind === "code") await enableCodeHook(context);
  return context;
}

export const laneTest = base.extend<TestFixtures, WorkerFixtures>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures take a destructured fixture object
  kind: [async ({}, use, workerInfo) => { await use(kindOfProject(workerInfo.project)); }, { scope: "worker", option: true }],
  // eslint-disable-next-line no-empty-pattern
  target: [async ({}, use, workerInfo) => { await use(workerInfo.project.name.startsWith("write-") ? "write" : "read"); },
    { scope: "worker", option: true }],

  // eslint-disable-next-line no-empty-pattern
  env: [async ({}, use) => { await use(runEnv()); }, { scope: "worker" }],

  manifest: [async ({ env }, use) => { await use(await loadManifest(env.screen)); }, { scope: "worker" }],

  app: [async ({ browser, kind, target, env, manifest }, use) => {
    const projectId = requireProjectId(env, manifest, target, kind);
    const context = await newLaneContext(kind, browser);
    try {
      const page: Page = await context.newPage();
      const app: AppHandle = {
        kind,
        page,
        frame: await openScreenReady(kind, page, manifest, projectId),
        async reset() {
          if (manifest.reset) await manifest.reset(app.kind, app.page, app.frame);
          else await resetToRest(app, manifest);
          await settle(app);
        },
        async reload() {
          app.frame = await openScreenReady(app.kind, app.page, manifest, projectId);
          await settle(app, { timeoutMs: FIRST_SETTLE_MS });
        },
      };
      await settle(app, { timeoutMs: FIRST_SETTLE_MS });
      await use(app);
    } finally {
      await context.close().catch(() => {});
    }
  }, { scope: "worker", timeout: OPEN_TIMEOUT_MS }],

  // eslint-disable-next-line no-empty-pattern
  laneClock: [async ({}, use) => { await use({ lane: "", startedAt: Date.now() }); }, { scope: "worker" }],

  budget: [async ({ env, manifest, laneClock }, use, testInfo) => {
    const lane = laneOf(testInfo);
    if (laneClock.lane !== lane) {
      laneClock.lane = lane;
      laneClock.startedAt = laneStartedAt(env.runDir, lane, process.ppid);
    }
    const over = overBudget(lane, Date.now() - laneClock.startedAt, budgetFor(manifest, lane as Lane));
    // A WARNING, not a failure (changed after the first live run, 3 Nov 2026): failing every later test of an over-budget
    // lane threw away its coverage. The summary still marks the lane "over budget", and run.mjs keeps the hard
    // 60-minute deadline per screen.
    if (over) {
      testInfo.annotations.push({ type: "over-budget", description: over });
      console.warn(`[harness] ${over}`);
    }
    await use();
  }, { auto: true }],

  shot: [async ({ app }, use, testInfo) => {
    await use();
    if (testInfo.status !== testInfo.expectedStatus && !app.page.isClosed()) {
      const body = await app.page.screenshot({ timeout: 10_000 }).catch(() => null);
      if (body) await testInfo.attach(`${app.kind}-on-failure`, { body, contentType: "image/png" });
    }
  }, { auto: true }],

  record: async ({ env, kind }, use) => {
    await use((layer, key, data) => writeFact(env, kind, layer, key, data));
  },
});
