/**
 * The one-hour parity harness: Playwright config (D80; plan `ProjectDocs/app-docs/e2e/PARITY-ONE-HOUR-PLAN.md`).
 *
 * Run it through `node e2e/harness/run.mjs` (npm run parity), which sets the run id, the phase and the screen and runs the
 * phases one after the other. By hand: `npx playwright test -c e2e/harness/playwright.harness.config.ts --list`.
 *
 * Projects:
 *   preflight      servers up, sessions valid, data fingerprint, run.json (`preflight.setup.ts`); every lane depends on it
 *   canvas-A/B/C   read lanes on the Canvas      } one lane = one serial describe tagged `@<lane>`, selected by `grep`;
 *   code-A/B       read lanes on the code app    } the files are the generic lanes `e2e/harness/lanes/*.lane.ts` plus
 *   write-canvas   write lane, Canvas            } `e2e/screens/<PARITY_SCREEN>/*.lane.ts` of the SELECTED screen only
 *   write-code     write lane, code app          }
 *   report         offline comparison and summary (`report.run.ts`), plus `e2e/screens/<PARITY_SCREEN>/*.report.ts`; no browser
 *   sweep          by hand only: deletes the PW- rows an earlier run left (`sweep.run.ts`, PARITY_SWEEP_TAG)
 *
 * Screen-agnostic: nothing here names a screen. `PARITY_SCREEN` picks the screen folder whose own lanes are added. It is
 * REQUIRED (there is no default screen): unset, the config prints one line, "set PARITY_SCREEN to one of: <screens on
 * disk>", and exits with code 1 before any test file is loaded, so `--list` shows that line and no stack trace.
 *
 * One lane = one worker: every lane project has `workers: 1` (a project option since @playwright/test 1.52), so a lane's
 * files run one after the other on one worker, in alphabetical path order (Playwright's order for a project's files with
 * `fullyParallel: false`). The generic lane files are named in `screens.ts` LANE_LAYER_ORDER (`1-visual` ... `6-platform`,
 * platform last, pinned by UT-PHSCR-007); a screen's own lane files sort after them and do not rely on their position.
 * The global `workers` is the lane count (+2 when the write lanes run beside the read lanes), so the lanes run side by side.
 *
 * Output per run and per phase (`PARITY_PHASE`, set by run.mjs), so a later phase never clears an earlier one's traces:
 *   <runDir>/pw-output/<phase>/        traces and screenshots (Playwright empties this folder when the phase starts)
 *   <runDir>/playwright.<phase>.json   the json report (`playwright.json` when no phase is set)
 *   <runDir>/timings.json              every test's lane, status and time, appended by `reporter.ts`
 *
 * Without a read project in the environment (e.g. `--list`), the config still loads; the preflight test then fails with the
 * exact variable to set. Any other bad setting (PARITY_MODE, PARITY_LANES, ...) falls back to a placeholder run folder here
 * and is reported by the preflight, naming the variable.
 */
import { join } from "node:path";
import { defineConfig, type PlaywrightTestOptions, type PlaywrightWorkerOptions, type Project } from "@playwright/test";
import { BROWSER_USE, STORAGE_STATE } from "../lib/browser";
import type { Kind, Lane } from "./contract";
import { LANES, listScreens, REPO_ROOT, runEnv, screenRequired } from "./env";

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** `PARITY_SCREEN`, or a one-line message and exit 1 (see the header): a run without a screen cannot mean anything. */
function requiredScreen(): string {
  const screen = process.env.PARITY_SCREEN?.trim();
  if (!screen || !SLUG.test(screen)) {
    const why = screen ? `PARITY_SCREEN must be a lower-case slug (got "${screen}"); ` : "";
    console.error(`[parity] ${why}${screenRequired(listScreens())}`);
    process.exit(1);
  }
  return screen;
}

/** The settings the config needs (see the header). Project ids are not needed here and not read. */
function configEnv(screen: string): { screen: string; runDir: string; lanes: number; writesInParallel: boolean } {
  try {
    const e = runEnv();
    return { screen: e.screen, runDir: e.runDir, lanes: e.lanes, writesInParallel: e.writesInParallel };
  } catch {
    const lanes = Number(process.env.PARITY_LANES);
    return {
      screen,
      runDir: join(REPO_ROOT, "e2e", "runs", "_unconfigured"),
      lanes: Number.isInteger(lanes) && lanes >= 1 && lanes <= 20 ? lanes : 5,
      writesInParallel: false,
    };
  }
}

const env = configEnv(requiredScreen());
const phase = process.env.PARITY_PHASE?.trim().replace(/[^A-Za-z0-9_-]/g, "") || "";
const E2E = join(REPO_ROOT, "e2e");
const SEP = "[\\\\/]";
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The lane files: the generic lanes, and the selected screen's own lanes (never another screen's). */
const LANE_FILES: RegExp[] = [
  new RegExp(`${SEP}e2e${SEP}harness${SEP}lanes${SEP}[^\\\\/]+\\.lane\\.ts$`),
  new RegExp(`${SEP}e2e${SEP}screens${SEP}${escapeRe(env.screen)}${SEP}[^\\\\/]+\\.lane\\.ts$`),
];

/** The selected screen's report hooks (run in the `report` project, after every lane). */
const SCREEN_REPORT_FILES: RegExp[] = [new RegExp(`${SEP}e2e${SEP}screens${SEP}${escapeRe(env.screen)}${SEP}[^\\\\/]+\\.report\\.ts$`)];

/** `session.ts` laneTest's worker options, set per project so a generic lane file serves both apps. */
interface LaneOptions { kind: Kind; target: "read" | "write" }

function laneProject(lane: Lane): Project<PlaywrightTestOptions, PlaywrightWorkerOptions & LaneOptions> {
  const kind: Kind = lane.startsWith("canvas") || lane === "write-canvas" ? "canvas" : "code";
  const target = lane.startsWith("write") ? "write" : "read";
  return {
    name: lane,
    testDir: E2E,
    testMatch: LANE_FILES,
    grep: new RegExp(`@${lane}\\b`),
    // One lane = one worker: the lane's files run one after another, in file order (see the header).
    workers: 1,
    dependencies: ["preflight"],
    metadata: { kind, lane, target },
    // `storageState` too, for a lane test that uses Playwright's own `page`; laneTest builds its own context from `kind`.
    use: { kind, target, storageState: join(REPO_ROOT, STORAGE_STATE[kind]) },
  };
}

export default defineConfig<object, LaneOptions>({
  // One worker per read lane, plus the two write lanes when they run beside phase 1 (each app on its own sandbox project).
  workers: env.lanes + (env.writesInParallel ? 2 : 0),
  fullyParallel: false,
  // No inline retry: run.mjs re-runs the failed tests once at the end, and a test that passes only then is reported flaky.
  retries: 0,
  timeout: 10 * 60_000,
  expect: { timeout: 15_000 },
  outputDir: join(env.runDir, "pw-output", phase || "default"),
  reporter: [
    ["list"],
    ["json", { outputFile: join(env.runDir, phase ? `playwright.${phase}.json` : "playwright.json") }],
    ["./reporter.ts", { runDir: env.runDir }],
  ],
  use: {
    ...BROWSER_USE,
    headless: true,
    video: "off",
    trace: "retain-on-first-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "preflight", testDir: join(E2E, "harness"), testMatch: /preflight\.setup\.ts$/ },
    ...LANES.map(laneProject),
    // The generic report, plus the selected screen's own report hooks (`e2e/screens/<PARITY_SCREEN>/*.report.ts`): checks
    // over the recorded facts that only that screen has (e.g. Land Lease's rule-map corrections). No browser.
    { name: "report", testDir: E2E, testMatch: [new RegExp(`${SEP}e2e${SEP}harness${SEP}report\\.run\\.ts$`), ...SCREEN_REPORT_FILES] },
    // By hand only (`npm run parity:sweep`): the PW- rows an earlier run left on DEV (`sweep.run.ts`). No dependency.
    { name: "sweep", testDir: join(E2E, "harness"), testMatch: /sweep\.run\.ts$/ },
  ],
});
