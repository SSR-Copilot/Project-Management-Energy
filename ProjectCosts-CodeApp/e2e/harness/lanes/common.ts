/**
 * What the generic lanes share (D80, plan section 5a). Not a lane file itself (`*.lane.ts` are).
 *
 * How a generic lane is laid out: a lane file declares, for EACH app, one serial describe of one layer; every test title
 * ends with the lane tag of that layer and app (`laneFor`, e.g. "visual: card-open @canvas-A"). The harness config
 * (`playwright.harness.config.ts`) has one Playwright project per lane that greps its tag and sets the worker options
 * `kind` / `target` in its `use`, so the canvas tests of a file run in a canvas project and the code tests in a code one.
 * `laneTest.use({ kind })` cannot express this: Playwright refuses a worker option inside a describe, and one file serves
 * both apps. `laneCase` checks the pairing at run time instead.
 *
 * The manifest is read at COLLECTION time (top-level await in each lane file), from `PARITY_SCREEN` only: `runEnv()`
 * writes the run id file, which `--list` should not.
 */
import type { Browser } from "@playwright/test";
import type { AppHandle, Kind, RunEnv, ScreenManifest } from "../contract";
import { appName } from "../readers";
import { loadManifest, selectedScreen } from "../screens";
import { laneTest, type RecordFact } from "../session";

export const KINDS: readonly Kind[] = ["canvas", "code"];

/** The manifest of `PARITY_SCREEN` (required; `selectedScreen` names the screens when it is missing), for declaring the lanes' tests. */
export function collectManifest(): Promise<ScreenManifest> {
  return loadManifest(selectedScreen());
}

/**
 * Why a test that WRITES TO DEV does not run, or null: it runs only with `PARITY_WRITE=1`, and only in the full tier. The
 * one rule for the generic flows lane and any screen's own write lane (e.g. Land Lease's standard import).
 */
export function writeSkip(vars: Readonly<Record<string, string | undefined>> = process.env): string | null {
  if (vars.PARITY_WRITE?.trim() !== "1") return 'PARITY_WRITE is not "1": the write flows change DEV data and run only when asked';
  const tier = vars.PARITY_TIER?.trim();
  if (tier === "smoke" || tier === "read") return `PARITY_TIER=${tier}: the write flows run in the full tier only`;
  return null;
}

/** What a lane test body gets. */
export interface LaneFixtures { app: AppHandle; record: RecordFact; env: RunEnv; kind: Kind; browser: Browser }

/**
 * Why every test of `kind` is skipped in this run, or null. Compare mode records the code app only (the Canvas side is
 * the cached reference); `run.mjs` does not start the Canvas lanes then, this keeps a hand-started run honest too.
 */
export function kindSkip(kind: Kind, vars: Readonly<Record<string, string | undefined>> = process.env): string | null {
  if (kind === "canvas" && vars.PARITY_MODE?.trim() === "compare") return "compare mode: the Canvas side is the cached reference";
  return null;
}

type LaneBody = (fx: LaneFixtures) => Promise<void>;
type TestDetails = { annotation?: { type: string; description?: string }[] };
type Declare = (title: string, details: TestDetails, body: LaneBody) => void;

/**
 * One lane test, declared IN THE LANE FILE (Playwright takes a test's location from the line that calls `laneTest`, so
 * a report points at the lane file, not here):
 *
 *   const c = laneCase(kind, title, skip);
 *   c.declare(...c.args, c.body(async ({ app, record }) => { ... }));
 *
 * `declare` is `laneTest.skip` when `skip` names a reason (declared skipped: no fixture, no browser opened, the reason as
 * an annotation), else `laneTest`. `body` checks that the project runs the app the test is for, then runs `fn`.
 */
export function laneCase(kind: Kind, title: string, skip: string | null): {
  declare: Declare; args: readonly [string, TestDetails]; body: (fn: (fx: LaneFixtures) => Promise<void>) => LaneBody;
} {
  return {
    declare: (skip ? laneTest.skip : laneTest) as unknown as Declare,
    args: [title, skip ? { annotation: [{ type: "skip", description: skip }] } : {}],
    body: (fn) => async ({ app, record, env, kind: projectKind, browser }) => {
      if (projectKind !== kind) {
        throw new Error(`"${title}" drives ${appName(kind)} but runs in a ${projectKind} project: run lanes through e2e/harness/playwright.harness.config.ts`);
      }
      await fn({ app, record, env, kind, browser });
    },
  };
}

/**
 * The describe of one layer for one app, titled with the screen, layer and app. `mode: "default"` (the default since the
 * first live run, 3 Nov 2026): the tests still run in order on the lane's ONE worker (`workers: 1` per lane project), but a
 * failed state no longer skips every later one. In serial mode one failure cost a whole lane's coverage (canvas-A lost 10
 * visual states, code-B every validation group). After a failure Playwright starts a new worker, which reopens the screen.
 * `mode: "serial"` stays available for tests that truly depend on the one before.
 */
export function laneDescribe(manifest: Pick<ScreenManifest, "title">, layer: string, kind: Kind, body: () => void, mode: "serial" | "default" = "default"): void {
  laneTest.describe(`${manifest.title}: ${layer}, ${appName(kind)}`, () => {
    laneTest.describe.configure({ mode });
    body();
  });
}

/** A short error text for a report line. */
export const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e)).split("\n")[0]!.slice(0, 240);
