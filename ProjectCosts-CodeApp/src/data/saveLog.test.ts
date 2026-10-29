import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_MESSAGE, MAX_TABLE_ROWS, emitSaveLog, errorChainLines, failureSection, gateTail, inStartOrder,
  groupsText, messageOf, plural, rawErrorSection, requestsSection, rootMessageOf, stepsSection, type SaveLogStep,
} from "./saveLog";
import { bulk501WarningLine, createRequestMeter, formatMs } from "./bulkSend";
import { createGate } from "./concurrency";
import { DataError } from "@/platform/errors";

const GUID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

afterEach(() => vi.restoreAllMocks());

describe("saveLog — pure builders (D58)", () => {
  it("UT-SAVELOG-001 formatMs: exact ms with a thousands separator, decimals on request", () => {
    expect(formatMs(980)).toBe("980 ms");
    expect(formatMs(1916.4)).toBe("1,916 ms");
    expect(formatMs(10_740)).toBe("10,740 ms");
    expect(formatMs(4.24, 1)).toBe("4.2 ms");
    expect(formatMs(1234.56, 1)).toBe("1,234.6 ms");
    expect(formatMs(0.04, 1)).toBe("0.0 ms");
    expect(formatMs(Number.NaN)).toBe("n/a");
  });

  it("UT-SAVELOG-002 plural: singular for exactly 1, separators on counts", () => {
    expect(plural(1, "request")).toBe("1 request");
    expect(plural(0, "request")).toBe("0 requests");
    expect(plural(2, "row")).toBe("2 rows");
    expect(plural(1200, "row")).toBe("1,200 rows");
    expect(plural(3, "entry", "entries")).toBe("3 entries");
  });

  it("UT-SAVELOG-003 messageOf replaces every GUID, collapses whitespace and cuts long text", () => {
    expect(messageOf(new Error(`vsb_capexcost With Id = ${GUID} Does Not Exist`)))
      .toBe("vsb_capexcost With Id = <id> Does Not Exist");
    expect(messageOf(`a\n  b ${GUID.toUpperCase()}`)).toBe("a b <id>");
    const long = messageOf("x".repeat(MAX_MESSAGE + 50));
    expect(long).toHaveLength(MAX_MESSAGE + 3);
    expect(long.endsWith("...")).toBe(true);
    expect(messageOf(42)).toBe("42");
    const hostile = { toString: () => { throw new Error("no"); } };
    expect(messageOf(hostile)).toBe("unreadable error");
  });

  it("UT-SAVELOG-004 errorChainLines walks the cause chain with names and HTTP statuses, scrubbed", () => {
    const inner = new DataError(`Principal user (Id=${GUID}) is missing prvDelete`, undefined, 403);
    const outer = new Error("delete costs failed", { cause: inner });
    const lines = errorChainLines(outer);
    expect(lines[0]).toBe("Error: delete costs failed");
    expect(lines[1]).toMatch(/^caused by DataError \(HTTP 403\): .*Principal user \(Id=<id>\) is missing prvDelete/);
    expect(lines.join(" ")).not.toContain(GUID);
    expect(rootMessageOf(outer)).toMatch(/^DataError \(HTTP 403\): /);
    expect(errorChainLines("plain")).toEqual(["string: plain"]);
  });

  it("UT-SAVELOG-014 the SDK's plain { message, status } refusal reads as a Dataverse error, not [object Object]", () => {
    const plain = { message: `vsb_capexcost With Id = ${GUID} Does Not Exist`, status: 404 };
    expect(messageOf(plain)).toBe("vsb_capexcost With Id = <id> Does Not Exist");
    expect(errorChainLines(new Error("outer", { cause: plain }))[1])
      .toBe("caused by Dataverse error (HTTP 404): vsb_capexcost With Id = <id> Does Not Exist");
    expect(messageOf({ other: 1 })).toBe("[object Object]");
  });

  it("UT-SAVELOG-005 errorChainLines stops after 8 links on a cyclic chain", () => {
    const a = new Error("a") as Error & { cause?: unknown };
    a.cause = a;
    expect(errorChainLines(a)).toHaveLength(8);
  });

  it("UT-SAVELOG-006 inStartOrder sorts by start time, stable, steps without a start last", () => {
    const steps = [{ label: "c", startMs: 50 }, { label: "x" }, { label: "a", startMs: 0 }, { label: "b", startMs: 0 }];
    expect(inStartOrder(steps).map((s) => s.label)).toEqual(["a", "b", "c", "x"]);
  });

  it("UT-SAVELOG-007 stepsSection: one row per step in start order, readable durations and results", () => {
    const steps: SaveLogStep[] = [
      { label: "upsert costs (new contracts)", startMs: 1402, ms: 499, requests: 1, detail: "create 1 bulk [498 ms]", status: "ok" },
      { label: "upsert contracts", startMs: 2, ms: 1400, requests: 2, status: "ok" },
      { label: "delete costs", requests: 3, status: "deferred" },
      { label: "reconcile totals", startMs: 3000, ms: 10, status: "failed" },
    ];
    const s = stepsSection(steps);
    expect(s.title).toBe("Steps (start order)");
    expect(s.table?.map((r) => r.Step)).toEqual(["upsert contracts", "upsert costs (new contracts)", "reconcile totals", "delete costs"]);
    expect(s.table?.[0]).toEqual({ Step: "upsert contracts", Started: "2 ms", Took: "1.4 s", Requests: 2, How: "–", Result: "ok" });
    expect(s.table?.[2]?.Result).toBe("FAILED");
    expect(s.table?.[3]).toMatchObject({ Started: "–", Took: "–", Requests: 3, Result: "in the background" });
  });

  it("UT-SAVELOG-008 stepsSection caps the table and says how many more", () => {
    const steps = Array.from({ length: MAX_TABLE_ROWS + 7 }, (_, i): SaveLogStep => ({ label: `s${i}`, startMs: i, ms: 1, status: "ok" }));
    const s = stepsSection(steps);
    expect(s.table).toHaveLength(MAX_TABLE_ROWS);
    expect(s.lines).toEqual(["… and 7 more steps"]);
  });

  it("UT-SAVELOG-009 gateTail: this save's peak and stats in exact ms; the shared peak only when higher", () => {
    const m = { ...createRequestMeter(), count: 4, totalMs: 4960, maxMs: 1900, peak: 4, sharedPeak: 4 };
    expect(gateTail(m)).toBe("gate peak 4/16, req avg 1,240 ms max 1,900 ms");
    expect(gateTail({ ...m, sharedPeak: 6 })).toBe("gate peak 4/16, req avg 1,240 ms max 1,900 ms, shared gate peak 6/16");
    expect(gateTail(createRequestMeter())).toBe("gate peak 0/16, req avg 0 ms max 0 ms");
  });

  it("UT-SAVELOG-010 requestsSection says it in words, with the shared gate only when it differs", () => {
    const m = { ...createRequestMeter(), count: 5, totalMs: 6200, maxMs: 1900, peak: 4, sharedPeak: 4 };
    expect(requestsSection(m).lines).toEqual([
      "Write requests of this save: 5; at most 4 of 16 in flight at once",
      "Time per write request (inside the gate, queueing excluded): average 1.2 s, slowest 1.9 s",
    ]);
    expect(requestsSection({ ...m, sharedPeak: 7 }, ["extra"]).lines.slice(2))
      .toEqual(["Shared write gate: up to 7 of 16 in flight, other work included", "extra"]);
    expect(requestsSection(createRequestMeter()).lines[1]).toBe("Time per write request: none sent");
  });

  it("UT-SAVELOG-011 failureSection lists completed, failed and unsent steps, then the readable chain", () => {
    const error = new Error("costs failed", { cause: new DataError(`row ${GUID} gone`, undefined, 404) });
    const s = failureSection(error, [
      { label: "costs", startMs: 0, status: "failed" },
      { label: "contract update", startMs: 0, status: "ok" },
      { label: "cost deletes", status: "skipped" },
    ], ["Phase: 2"]);
    expect(s.lines.slice(0, 5)).toEqual([
      "Steps completed: contract update",
      "Steps failed: costs",
      "Not sent: cost deletes",
      "Phase: 2",
      "Error: Error: costs failed",
    ]);
    expect(s.lines[5]).toMatch(/^ {2}caused by DataError \(HTTP 404\): row <id> gone/);
    expect(s.lines).toHaveLength(6);
  });

  it("UT-SAVELOG-012 bulk501WarningLine keeps the original text first, then what happens next", () => {
    expect(bulk501WarningLine("UpdateMultiple", "upsert costs (update)", 1)).toBe(
      "UpdateMultiple answered 501 Not Implemented; upsert costs (update) continues row by row. "
      + "Nothing of it was written by the refused request; 1 row goes out as one PATCH each, and this tab "
      + "keeps sending UpdateMultiple rows one by one while its session flag is set (until the tab closes).",
    );
    expect(bulk501WarningLine("CreateMultiple", "x (create)", 1200)).toContain("1,200 rows go out");
  });

  it("UT-SAVELOG-013 a gate's inFlight() counts the tasks holding a slot (measurement only)", async () => {
    const gate = createGate(2);
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    const tasks = [gate(() => held), gate(() => held), gate(() => held)];
    await Promise.resolve();
    expect(gate.inFlight()).toBe(2);
    release();
    await Promise.all(tasks);
    expect(gate.inFlight()).toBe(0);
  });
});

describe("saveLog — emitSaveLog", () => {
  const report = {
    summary: "Add Cost from Table save: 1,916 ms, 5 requests (…)",
    sections: [
      { title: "Steps (start order)", lines: ["note"], table: [{ Step: "plan", Took: "2 ms" }] },
      rawErrorSection(new Error("raw")),
    ],
  };

  it("UT-SAVELOG-020 prints the summary, then collapsed groups with tables and the raw error", () => {
    const calls: string[] = [];
    vi.spyOn(console, "info").mockImplementation((t: unknown) => { calls.push(`info:${String(t)}`); });
    vi.spyOn(console, "groupCollapsed").mockImplementation((t: unknown) => { calls.push(`group:${String(t)}`); });
    vi.spyOn(console, "groupEnd").mockImplementation(() => { calls.push("end"); });
    vi.spyOn(console, "table").mockImplementation(() => { calls.push("table"); });
    vi.spyOn(console, "error").mockImplementation((e: unknown) => { calls.push(`error:${(e as Error).message}`); });
    emitSaveLog(report);
    expect(calls).toEqual([
      "info:Add Cost from Table save: 1,916 ms, 5 requests (…)",
      "group:Steps (start order)", "info:note", "table", "end",
      "group:Raw error (for support)", "error:raw", "end",
    ]);
  });

  it("UT-SAVELOG-021 without groups or tables everything goes out as indented plain lines", () => {
    const lines: string[] = [];
    vi.spyOn(console, "info").mockImplementation((t: unknown) => { lines.push(String(t)); });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const original = { groupCollapsed: console.groupCollapsed, table: console.table };
    try {
      (console as { groupCollapsed?: unknown }).groupCollapsed = undefined;
      (console as { table?: unknown }).table = undefined;
      emitSaveLog(report);
    } finally {
      console.groupCollapsed = original.groupCollapsed;
      console.table = original.table;
    }
    expect(lines).toEqual([
      "Add Cost from Table save: 1,916 ms, 5 requests (…)",
      "  Steps (start order):", "    note", "    Step: plan | Took: 2 ms",
      "  Raw error (for support):",
    ]);
  });

  it("UT-SAVELOG-022 never throws, and a throwing group still closes and the next one prints", () => {
    const lines: string[] = [];
    let ended = 0;
    vi.spyOn(console, "info").mockImplementation((t: unknown) => {
      if (String(t) === "note") throw new Error("console broke");
      lines.push(String(t));
    });
    vi.spyOn(console, "groupCollapsed").mockImplementation(() => undefined);
    vi.spyOn(console, "groupEnd").mockImplementation(() => { ended += 1; });
    vi.spyOn(console, "error").mockImplementation(() => { throw new Error("also broke"); });
    expect(() => emitSaveLog(report)).not.toThrow();
    expect(lines[0]).toBe(report.summary);
    expect(ended).toBe(2);
    vi.spyOn(console, "info").mockImplementation(() => { throw new Error("all broke"); });
    expect(() => emitSaveLog(report)).not.toThrow();
  });

  it("UT-SAVELOG-023 a builder is run inside the guard: a throwing builder never escapes", () => {
    const lines: string[] = [];
    vi.spyOn(console, "info").mockImplementation((t: unknown) => { lines.push(String(t)); });
    expect(() => emitSaveLog(() => { throw new Error("builder broke"); })).not.toThrow();
    emitSaveLog(() => ({ summary: "built", sections: [] }));
    expect(lines).toEqual(["built"]);
  });
});

describe("saveLog — shared step text (D58 review)", () => {
  it("UT-SAVELOG-030 groupsText: each group readable, extras appended, empty when nothing", () => {
    expect(groupsText([
      { action: "create", rows: 12, requests: 1, failed: false, path: "bulk", durations: [1400] },
      { action: "update", rows: 1, failed: true, path: "per-row after 501", durations: [] },
    ], ["2 unchanged skipped", ""])).toBe(
      "create 12 rows: 1 request, bulk [1.4 s]; update 1 row: FAILED, per-row after 501; 2 unchanged skipped",
    );
    expect(groupsText([])).toBe("nothing to send");
    expect(groupsText([], ["1 read, 0 deleted"])).toBe("1 read, 0 deleted");
  });

  it("UT-SAVELOG-031 requestsSection names whose requests they are", () => {
    const m = { ...createRequestMeter(), count: 1, totalMs: 10, maxMs: 10, peak: 1, sharedPeak: 1 };
    expect(requestsSection(m).lines[0]).toBe("Write requests of this save: 1; at most 1 of 16 in flight at once");
    expect(requestsSection(m, [], "the background reconcile").lines[0])
      .toBe("Write requests of the background reconcile: 1; at most 1 of 16 in flight at once");
  });
});