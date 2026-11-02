/**
 * P0.1 / WS-E — the Add Cost from Table Save's client timeline (`./saveTimeline.ts`) and the
 * deferred prepare log (`deferSaveLog`, `@/data/saveLog`). Measurement only: these pin the line's
 * wording, when it prints, and that nothing here can throw into a Save.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deferSaveLog, emitSaveLog } from "@/data/saveLog";
import {
  PAINT_TIMEOUT_MS, addCostSaveTimeline, clientTimelineReport, type ClientTimeline,
} from "./saveTimeline";

/** A painted Save: 9 ms to the first request, 1,607 ms on the network, painted 180 ms later. */
const painted = (): ClientTimeline => ({
  points: {
    click: 1000, prepared: 1004, prepareLog: 1010, firstWrite: 1009, resolved: 2616, returned: 2617,
    navigated: 2618, painted: 2796,
  },
  durations: { prepareMs: 4.2, prepareLogMs: 12, onSuccessMs: 8.1, patchMs: 6 },
  end: "painted",
});

describe("clientTimelineReport (pure)", () => {
  it("UT-ACPERF-001 a painted Save: click→first request, the network part, resolve→painted, the deferred log", () => {
    expect(clientTimelineReport(painted()).summary).toBe(
      "Add Cost from Table client: click→first request 9 ms (prepare 4.2 ms, then 5.0 ms), "
        + "first request→resolved 1,607 ms, resolve→CAPEX painted 180 ms "
        + "(onSuccess 8.1 ms, patch 6.0 ms, navigate→paint 178 ms); prepare log 12.0 ms, after the first request",
    );
  });

  it("UT-ACPERF-002 stayed on the sheet (blockedByPastCosts): no paint part", () => {
    const t: ClientTimeline = {
      points: { click: 0, prepared: 4, firstWrite: 9, resolved: 1616, returned: 1618 },
      durations: { onSuccessMs: 2, patchMs: 1 },
      end: "stayed",
    };
    const { summary } = clientTimelineReport(t);
    expect(summary).toBe(
      "Add Cost from Table client: click→first request 9 ms (then 5.0 ms), first request→resolved 1,607 ms, "
        + "resolve→screen 2 ms (onSuccess 2.0 ms, patch 1.0 ms); stayed on the sheet, no CAPEX paint",
    );
    expect(summary).not.toMatch(/painted/);
  });

  it("UT-ACPERF-003 the grid never painted: the timeout is named, no paint figure", () => {
    const t = painted();
    delete t.points.painted;
    t.end = "paintTimeout";
    expect(clientTimelineReport(t).summary).toContain(
      "resolve→CAPEX painted: not within 10,000 ms (onSuccess 8.1 ms, patch 6.0 ms)",
    );
  });

  it("UT-ACPERF-004 a failed Save with no request recorded: one click→failed part", () => {
    const t: ClientTimeline = {
      points: { click: 0, prepared: 3, returned: 250 }, durations: { prepareMs: 3 }, end: "failed",
    };
    expect(clientTimelineReport(t).summary).toBe(
      "Add Cost from Table client: click→failed 250 ms (no write request recorded; prepare 3.0 ms)",
    );
    const withRequest: ClientTimeline = { ...t, points: { ...t.points, firstWrite: 8 } };
    expect(clientTimelineReport(withRequest).summary).toBe(
      "Add Cost from Table client: click→first request 8 ms (prepare 3.0 ms, then 5.0 ms), save failed 250 ms after the click",
    );
  });

  it("UT-ACPERF-005 the Client timeline group: the steps in start order, from the click", () => {
    const [section] = clientTimelineReport(painted()).sections;
    expect(section!.title).toBe("Client timeline (from the click)");
    expect(section!.table!.map((r) => [r.Step, r.Started, r.Took])).toEqual([
      ["click → prepare done", "0 ms", "4 ms"],
      ["prepare done → first write request", "4 ms", "5 ms"],
      ["first write request → Save resolved", "9 ms", "1.6 s"],
      ["prepare log (deferred)", "10 ms", "12 ms"],
      ["onSuccess (book patch, invalidations)", "1.6 s", "8 ms"],
      ["resolved → back on the screen", "1.6 s", "1 ms"],
      ["back on the screen → navigate", "1.6 s", "1 ms"],
      ["navigate → DEVEX/CAPEX painted", "1.6 s", "178 ms"],
    ]);
    // A failed Save names its last step as failed; nothing after it is invented.
    const failed = clientTimelineReport({
      points: { click: 0, prepared: 3, firstWrite: 8, returned: 250 }, durations: {}, end: "failed",
    }).sections[0]!.table!;
    expect(failed.map((r) => [r.Step, r.Result])).toEqual([
      ["click → prepare done", "ok"],
      ["prepare done → first write request", "ok"],
      ["first write request → Save failed", "FAILED"],
    ]);
  });

  it("UT-ACPERF-006 a prepare log that printed before the first request is flagged", () => {
    const t = painted();
    t.points.prepareLog = 1005;
    expect(clientTimelineReport(t).summary).toMatch(/; prepare log 12\.0 ms, BEFORE the first request$/);
    delete t.durations.prepareLogMs;
    expect(clientTimelineReport(t).summary).not.toMatch(/prepare log/);
  });
});

/* ── the store ─────────────────────────────────────────────────────────────── */

describe("addCostSaveTimeline (store)", () => {
  let lines: string[];
  beforeEach(() => {
    vi.useFakeTimers();
    lines = [];
    vi.spyOn(console, "info").mockImplementation((t: unknown) => { lines.push(String(t)); });
    vi.spyOn(console, "groupCollapsed").mockImplementation(() => undefined);
    vi.spyOn(console, "groupEnd").mockImplementation(() => undefined);
    vi.spyOn(console, "table").mockImplementation(() => undefined);
    addCostSaveTimeline.cancel();
  });
  afterEach(() => {
    addCostSaveTimeline.cancel();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  const client = () => lines.filter((l) => l.startsWith("Add Cost from Table client:"));

  /** A Save up to the navigation, at fixed times that end just before now (the paint reads the clock). */
  const throughNavigate = () => {
    const t0 = performance.now() - 1618;
    addCostSaveTimeline.begin(t0);
    addCostSaveTimeline.mark("prepared", t0 + 4);
    addCostSaveTimeline.measure("prepareMs", 4);
    addCostSaveTimeline.mark("firstWrite", t0 + 9);
    addCostSaveTimeline.mark("resolved", t0 + 1616);
    addCostSaveTimeline.mark("returned", t0 + 1617);
    addCostSaveTimeline.awaitPaint(t0 + 1618);
  };

  it("UT-ACPERF-010 prints once, on the frame after the CAPEX grid showed, not before", () => {
    throughNavigate();
    expect(client()).toEqual([]);
    addCostSaveTimeline.capexShown();
    expect(client()).toEqual([]); // the paint has not happened yet
    vi.advanceTimersByTime(20); // one frame (a faked rAF runs at 16 ms), then one task
    expect(client()).toHaveLength(1);
    expect(client()[0]).toMatch(/^Add Cost from Table client: click→first request 9 ms .*resolve→CAPEX painted \d+ ms \(navigate→paint \d+ ms\)$/);
    // A later commit of the CAPEX grid is an ordinary one: no second line.
    addCostSaveTimeline.capexShown();
    vi.advanceTimersByTime(PAINT_TIMEOUT_MS);
    expect(client()).toHaveLength(1);
  });

  it("UT-ACPERF-011 no paint: prints after PAINT_TIMEOUT_MS, not earlier", () => {
    throughNavigate();
    vi.advanceTimersByTime(PAINT_TIMEOUT_MS - 1);
    expect(client()).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(client()).toHaveLength(1);
    expect(client()[0]).toContain("resolve→CAPEX painted: not within 10,000 ms");
  });

  it("UT-ACPERF-012 the first mark wins; without a timeline every call is a no-op", () => {
    addCostSaveTimeline.mark("firstWrite", 5); // nothing begun
    addCostSaveTimeline.capexShown();
    addCostSaveTimeline.end("stayed");
    vi.advanceTimersByTime(PAINT_TIMEOUT_MS);
    expect(client()).toEqual([]);

    addCostSaveTimeline.begin(0);
    addCostSaveTimeline.mark("firstWrite", 9);
    addCostSaveTimeline.mark("firstWrite", 500); // a later upsert of the same Save
    addCostSaveTimeline.mark("resolved", 20);
    addCostSaveTimeline.mark("returned", 21);
    addCostSaveTimeline.end("stayed");
    expect(client()).toHaveLength(1);
    expect(client()[0]).toMatch(/^Add Cost from Table client: click→first request 9 ms, first request→resolved 11 ms, /);
  });

  it("UT-ACPERF-013 never throws: a throwing console or clock leaves the Save alone", () => {
    vi.spyOn(console, "info").mockImplementation(() => { throw new Error("console broke"); });
    expect(() => { throughNavigate(); addCostSaveTimeline.capexShown(); vi.advanceTimersByTime(20); }).not.toThrow();
    const now = vi.spyOn(performance, "now").mockImplementation(() => { throw new Error("clock broke"); });
    expect(() => {
      addCostSaveTimeline.begin();
      addCostSaveTimeline.mark("prepared");
      addCostSaveTimeline.awaitPaint();
      addCostSaveTimeline.end("failed");
    }).not.toThrow();
    now.mockRestore();
  });

  it("UT-ACPERF-014 a new click while one waits for its paint prints the old one as superseded", () => {
    throughNavigate();
    addCostSaveTimeline.begin(5000);
    expect(client()).toHaveLength(1);
    expect(client()[0]).toContain("not finished: superseded by a newer Save");
    // The old timeout does not end the new timeline.
    vi.advanceTimersByTime(PAINT_TIMEOUT_MS);
    expect(client()).toHaveLength(1);
  });

  it("UT-ACPERF-015 cancel (a Save that sent nothing) prints no line", () => {
    addCostSaveTimeline.begin(0);
    addCostSaveTimeline.mark("prepared", 3);
    addCostSaveTimeline.cancel();
    addCostSaveTimeline.end("failed");
    vi.advanceTimersByTime(PAINT_TIMEOUT_MS);
    expect(client()).toEqual([]);
  });
});

/* ── the deferred prepare log (WS-E) ─────────────────────────────────────── */

describe("deferSaveLog (WS-E)", () => {
  let lines: string[];
  beforeEach(() => {
    vi.useFakeTimers();
    lines = [];
    vi.spyOn(console, "info").mockImplementation((t: unknown) => { lines.push(String(t)); });
    vi.spyOn(console, "groupCollapsed").mockImplementation(() => undefined);
    vi.spyOn(console, "groupEnd").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  const report = (summary: string) => ({ summary, sections: [] });

  it("UT-ACPERF-020 prints one task later, not synchronously, and reports when and how long", () => {
    const emitted = vi.fn();
    deferSaveLog(() => report("prepare"), emitted);
    expect(lines).toEqual([]);
    vi.advanceTimersByTime(0);
    expect(lines).toEqual(["prepare"]);
    expect(emitted).toHaveBeenCalledTimes(1);
    expect(typeof emitted.mock.calls[0]![0]).toBe("number");
    expect(emitted.mock.calls[0]![1]).toBeGreaterThanOrEqual(0);
  });

  it("UT-ACPERF-021 a save line emitted before the timer still follows it, and it prints once", () => {
    deferSaveLog(() => report("prepare"));
    emitSaveLog(report("save failed")); // a plan refused within the same tick
    expect(lines).toEqual(["prepare", "save failed"]);
    vi.advanceTimersByTime(0);
    expect(lines).toEqual(["prepare", "save failed"]);
  });

  it("UT-ACPERF-022 several deferred reports print oldest first, however they are flushed", () => {
    deferSaveLog(() => report("a"));
    deferSaveLog(() => report("b"));
    emitSaveLog(report("c"));
    deferSaveLog(() => report("d"));
    vi.advanceTimersByTime(0);
    expect(lines).toEqual(["a", "b", "c", "d"]);
  });

  it("UT-ACPERF-023 never throws: a throwing builder, callback or timer", () => {
    expect(() => deferSaveLog(() => { throw new Error("builder broke"); }, () => { throw new Error("cb broke"); })).not.toThrow();
    expect(() => vi.advanceTimersByTime(0)).not.toThrow();
    const timer = vi.spyOn(globalThis, "setTimeout").mockImplementation(() => { throw new Error("no timer"); });
    expect(() => deferSaveLog(() => report("now"))).not.toThrow();
    timer.mockRestore();
    expect(lines).toEqual(["now"]); // printed at once rather than never
    emitSaveLog(report("next"));
    expect(lines).toEqual(["now", "next"]);
  });
});
