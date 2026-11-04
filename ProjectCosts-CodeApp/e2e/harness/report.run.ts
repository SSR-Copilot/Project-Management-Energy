/**
 * Phase 3 of a parity run (D80): the `report` Playwright project, for any screen (`PARITY_SCREEN`). No browser and no page
 * fixture: it reads the recorded fact files, compares them offline (`compare.ts`), writes `<runDir>/summary.json` and
 * `<runDir>/summary.md` (`summary.ts`), and in `full` mode promotes this run's Canvas facts to the cached reference when no
 * Canvas lane test failed.
 *
 *   Canvas facts   full mode: `<runDir>/facts/canvas`; compare mode: the cached reference `e2e/reference/<screen>/facts/canvas`
 *   code facts     `<runDir>/facts/code`
 *   timings        `<runDir>/timings.json` (the harness reporter); missing -> no lane rows
 *   run metadata   `<runDir>/run.json` (preflight): `startedAt`, `canvasVersion`, `fingerprint`
 *
 * It passes even when there are new differences: `run.mjs` reads `summary.json` and sets the exit code. It fails only when
 * the run cannot be read at all (no manifest, a malformed fact file), so a broken recording never reads as "no differences".
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "@playwright/test";
import type { FactFile, TestTiming } from "./contract";
import { compareRun } from "./compare";
import { LANES, runEnv } from "./env";
import { COMMON_ARTEFACTS, budgetFor, loadManifest } from "./screens";
import { promoteReference, readFacts, referenceDir, runJson } from "./store";
import { buildSummary, renderSummary } from "./summary";

interface RunMeta { startedAt?: string; canvasVersion?: string; fingerprint?: Record<string, number | string> }

/** `<runDir>/timings.json`: an array of `TestTiming` (or `{ timings: [...] }`); missing or unreadable gives []. */
function readTimings(runDir: string): TestTiming[] {
  const file = join(runDir, "timings.json");
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    const list = Array.isArray(parsed) ? parsed : (parsed as { timings?: unknown } | null)?.timings;
    return Array.isArray(list) ? (list as TestTiming[]).filter((t) => t && typeof t.lane === "string" && typeof t.title === "string") : [];
  } catch {
    console.log(`[parity] ${file} is unreadable: lane timings left out`);
    return [];
  }
}

test("report: compare the recorded facts and write summary.md", async () => {
  test.setTimeout(10 * 60_000);
  const env = runEnv();
  const manifest = await loadManifest(env.screen);

  // Compare mode records the code app only: the Canvas side is the cached reference.
  const canvasDir = env.mode === "full" ? env.runDir : referenceDir(env.screen);
  const canvas: FactFile[] = readFacts(canvasDir, "canvas");
  const code: FactFile[] = readFacts(env.runDir, "code");
  const timings = readTimings(env.runDir);
  const run = runJson<RunMeta>(env) ?? {};

  const startedMs = run.startedAt ? Date.parse(run.startedAt) : Number.NaN;
  const startedAt = Number.isFinite(startedMs) ? run.startedAt! : new Date().toISOString();
  const wallClockMs = Number.isFinite(startedMs) ? Math.max(0, Date.now() - startedMs) : 0;
  const { diffs, notCaptured } = compareRun({ manifest, canvas, code, extraArtefacts: COMMON_ARTEFACTS, env: process.env });
  const budgets = Object.fromEntries(LANES.map((lane) => [lane, budgetFor(manifest, lane)]));
  const summary = buildSummary({
    screen: env.screen, runId: env.runId, mode: env.mode, tier: env.tier, startedAt, wallClockMs, timings, budgets, diffs, notCaptured,
  });

  mkdirSync(env.runDir, { recursive: true });
  const jsonPath = join(env.runDir, "summary.json");
  const mdPath = join(env.runDir, "summary.md");
  writeFileSync(jsonPath, `${JSON.stringify(summary, null, 1)}\n`, "utf8");
  writeFileSync(mdPath, renderSummary(summary), "utf8");

  const c = summary.counts;
  console.log(`[parity] summary: ${mdPath}`);
  console.log(`[parity] ${env.screen}: new ${c.new}, stale ${c.stale}, not-captured ${c["not-captured"]}, known ${c.known}, artefact ${c.artefact}; `
    + `manifest entries not captured ${notCaptured.length}; flaky ${summary.flaky.length}; facts canvas ${canvas.length}, code ${code.length}`);

  // Promote only a complete Canvas recording: full mode, Canvas facts present, no Canvas lane test failed. A flaky test counts
  // as passed here (its re-run recorded the facts); it is still listed as flaky in the summary.
  if (env.mode === "full") {
    const canvasFailed = summary.lanes.filter((l) => l.lane.includes("canvas")).reduce((n, l) => n + l.failed, 0);
    if (canvas.length > 0 && canvasFailed === 0) {
      const ref = promoteReference(env, run.canvasVersion ?? manifest.canvasVersion, run.fingerprint ?? {});
      console.log(`[parity] Canvas reference promoted for ${env.screen}: ${ref}`);
    } else {
      console.log(`[parity] Canvas reference NOT promoted: ${canvas.length ? `${canvasFailed} Canvas lane test(s) failed` : "no Canvas facts recorded"}`);
    }
  }
});
