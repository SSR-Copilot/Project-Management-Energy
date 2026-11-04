/**
 * The run summary (`summary.ts`, D80): lane budgets, flaky tests, the order of the class sections, the batch index. Pure.
 */
import { describe, expect, it } from "vitest";
import type { ClassedDiff, TestTiming } from "./contract";
import { buildSummary, cell, laneSummaries, renderIndex, renderSummary, type SummaryInput } from "./summary";

const MIN = 60_000;
const t = (lane: string, title: string, status: string, ms: number, retry = 0): TestTiming => ({ lane, title, status, ms, retry });

function input(over: Partial<SummaryInput> = {}): SummaryInput {
  return {
    screen: "land-lease", runId: "20261103-1712", mode: "full", tier: "full", startedAt: "2026-11-03T17:12:00.000Z",
    wallClockMs: 42 * MIN, timings: [], budgets: {}, diffs: [], notCaptured: [], ...over,
  };
}

const diff = (cls: ClassedDiff["cls"], key: string, over: Partial<ClassedDiff> = {}): ClassedDiff => ({ key, layer: "gates", cls, canvas: true, code: false, ...over });

describe("laneSummaries / buildSummary", () => {
  it("UT-PHSUM-001 lanes come from the timings, sorted by name, with test count and summed time", () => {
    const { lanes } = laneSummaries([t("code-A", "x", "passed", 1000), t("canvas-A", "y", "passed", 2000), t("canvas-A", "z", "passed", 3000)], {});
    expect(lanes.map((l) => [l.lane, l.tests, l.ms])).toEqual([["canvas-A", 2, 5000], ["code-A", 1, 1000]]);
  });

  it("UT-PHSUM-002 over budget only above budget x 1.2 minutes; a lane without a budget is never over", () => {
    const budgets = { "canvas-A": 10, "canvas-B": 10, "code-A": 0 };
    const { lanes } = laneSummaries([
      t("canvas-A", "a", "passed", 12 * MIN),
      t("canvas-B", "b", "passed", 12 * MIN + 1),
      t("code-A", "c", "passed", 999 * MIN),
      t("code-B", "d", "passed", 999 * MIN),
    ], budgets);
    expect(lanes.map((l) => [l.lane, l.budgetMs, l.overBudget])).toEqual([
      ["canvas-A", 10 * MIN, false],
      ["canvas-B", 10 * MIN, true],
      ["code-A", 0, false],
      ["code-B", 0, false],
    ]);
  });

  it("UT-PHSUM-003 flaky = failed (or timed out) on the first attempt and passed on retry 1; never counted as failed", () => {
    const { lanes, flaky } = laneSummaries([
      t("code-B", "flaky one", "failed", 100, 0), t("code-B", "flaky one", "passed", 100, 1),
      t("code-B", "flaky two", "timedOut", 100, 0), t("code-B", "flaky two", "passed", 100, 1),
      t("code-B", "broken", "failed", 100, 0), t("code-B", "broken", "failed", 100, 1),
      t("code-B", "skipped", "skipped", 0, 0),
      t("code-B", "fine", "passed", 100, 0),
    ], {});
    expect(lanes[0]).toMatchObject({ lane: "code-B", tests: 5, failed: 1, flaky: 2, ms: 700 });
    expect(flaky).toEqual([{ lane: "code-B", title: "flaky one" }, { lane: "code-B", title: "flaky two" }]);
  });

  it("UT-PHSUM-004 buildSummary counts every class (zero included) and keeps the run identity", () => {
    const s = buildSummary(input({ diffs: [diff("new", "a"), diff("new", "b"), diff("known", "c"), diff("not-captured", "d")], notCaptured: ["ux.zoom: recorded by neither app"] }));
    expect(s.counts).toEqual({ "new": 2, "stale": 0, "not-captured": 1, "known": 1, "artefact": 0 });
    expect(s).toMatchObject({ screen: "land-lease", runId: "20261103-1712", mode: "full", tier: "full", notCaptured: ["ux.zoom: recorded by neither app"] });
  });
});

describe("renderSummary", () => {
  it("UT-PHSUM-005 sections in review order: new, stale, not-captured, known, artefact; then not captured and flaky", () => {
    const md = renderSummary(buildSummary(input({ diffs: [diff("artefact", "z"), diff("known", "k"), diff("new", "n"), diff("stale", "s"), diff("not-captured", "c")] })));
    const at = (h: string) => md.indexOf(h);
    const order = ["## New differences", "## Stale known differences", "## Not captured by both apps", "## Known differences", "## Tool artefacts",
      "## Manifest entries not recorded by both apps", "## Flaky tests"].map(at);
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(at("## Lanes")).toBeLessThan(order[0]!);
    expect(md).toContain("| Key | Canvas | Code app | Note |");
  });

  it("UT-PHSUM-006 values are shortened to 80 characters, one line, pipes escaped", () => {
    const long = "x".repeat(200);
    expect(cell(long)).toHaveLength(80);
    expect(cell(long).endsWith("…")).toBe(true);
    expect(cell("a|b\nc")).toBe("a\\|b c");
    expect(cell({ a: 1 })).toBe('{"a":1}');
    expect(cell(undefined)).toBe("");
    const md = renderSummary(buildSummary(input({ diffs: [diff("new", "k", { canvas: long, code: null })] })));
    expect(md).toContain(`| k | ${"x".repeat(79)}… | null |`);
  });

  it("UT-PHSUM-007 the wall clock is shown against 60 minutes; a run over the hour says so", () => {
    expect(renderSummary(buildSummary(input({ wallClockMs: 42 * MIN + 5000 })))).toContain("- Wall clock: 42 min 5 s of 60 min (within the hour)");
    expect(renderSummary(buildSummary(input({ wallClockMs: 61 * MIN })))).toContain("(**over the hour**)");
  });

  it("UT-PHSUM-008 the lanes table marks a lane over budget, and the flaky list names each flaky test", () => {
    const md = renderSummary(buildSummary(input({
      budgets: { "canvas-B": 5 },
      timings: [t("canvas-B", "validation @canvas-B", "failed", 4 * MIN, 0), t("canvas-B", "validation @canvas-B", "passed", 4 * MIN, 1)],
    })));
    expect(md).toContain("| canvas-B | 1 | 0 | 1 | 8 min 0 s | 5 min 0 s | **yes** |");
    expect(md).toContain("- Lanes over budget: canvas-B");
    expect(md).toContain("- canvas-B: validation @canvas-B");
  });
});

describe("renderIndex", () => {
  it("UT-PHSUM-009 one row per screen with its counts, the hour, flaky and lanes over budget, linked to its summary.md", () => {
    const a = buildSummary(input({ diffs: [diff("new", "a"), diff("stale", "b")] }));
    const b = buildSummary(input({
      screen: "opex", runId: "20261103-1830", mode: "compare", tier: "read", wallClockMs: 65 * MIN,
      budgets: { "code-A": 1 }, timings: [t("code-A", "x", "passed", 2 * MIN)],
    }));
    const md = renderIndex([a, b]);
    expect(md).toContain("| [land-lease](20261103-1712/summary.md) | 20261103-1712 | full | full | 42 min 0 s | yes | 1 | 1 | 0 | 0 | 0 | 0 | none |");
    expect(md).toContain("| [opex](20261103-1830/summary.md) | 20261103-1830 | compare | read | 65 min 0 s | **no** | 0 | 0 | 0 | 0 | 0 | 0 | code-A |");
    expect(md).toContain("- Screens: 2");
    expect(renderIndex([a], (s) => `../runs/${s.runId}/summary.md`)).toContain("(../runs/20261103-1712/summary.md)");
  });

  it("UT-PHSUM-010 an empty batch renders 'No runs.'", () => {
    expect(renderIndex([])).toContain("No runs.");
  });
});
