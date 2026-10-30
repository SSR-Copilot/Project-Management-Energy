import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DATA_BATCH_GAP_MS, SLOW_REQUEST_MS, SLOW_ACTION_MS, actionLog, logError, recentActions, beginAction, flushDataLog, logAction, logData, logHttp, loggedCall, resetRequestLog, shortUrl,
} from "./requestLog";

let info: ReturnType<typeof vi.spyOn>;
let warn: ReturnType<typeof vi.spyOn>;
const lines = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  resetRequestLog();
  info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("request log", () => {
  it("UT-REQLOG-001 an HTTP line carries method, short path, status, duration and size", () => {
    logHttp({ url: "https://org.crm4.dynamics.com/api/data/v9.2/vsb_projects?$select=vsb_name", method: "GET", statusCode: 200, duration: 312.4, responseSize: 14540 });
    expect(lines(info)).toEqual(["[VSB] HTTP GET vsb_projects?$select=vsb_name → 200 · 312 ms · 14.2 kB"]);
  });

  it("UT-REQLOG-002 a failed request is a warning", () => {
    logHttp({ url: "/api/data/v9.2/vsb_costs(1)", method: "PATCH", statusCode: 403, duration: 40 });
    expect(lines(warn)[0]).toMatch(/^\[VSB\] HTTP PATCH vsb_costs\(1\) → 403 · 40 ms$/);
    expect(info).not.toHaveBeenCalled();
  });

  it("UT-REQLOG-003 a long URL is cut and the host is dropped", () => {
    const text = shortUrl(`https://h/api/data/v9.2/t?$select=${"a,".repeat(200)}`, 60);
    expect(text).toHaveLength(60);
    expect(text.startsWith("t?$select=a,a")).toBe(true);
    expect(text.endsWith("…")).toBe(true);
  });

  it("UT-REQLOG-004 a DATA line shows rows, pages and time; one row is singular", () => {
    logData({ kind: "read", target: "Load projects", rows: 450, pages: 2, ms: 310.2, ok: true });
    logData({ kind: "update", target: "vsb_costs", rows: 1, ms: 12, ok: true });
    flushDataLog();
    expect(lines(info)).toEqual([
      "[VSB] DATA read Load projects: 450 rows, 2 pages, 310 ms",
      "[VSB] DATA update vsb_costs: 1 row, 12 ms",
    ]);
  });

  it("UT-REQLOG-005 a failed DATA call is a warning with its reason", () => {
    logData({ kind: "delete", target: "vsb_costs", ms: 5, ok: false, error: "403" });
    flushDataLog();
    expect(lines(warn)).toEqual(["[VSB] DATA delete vsb_costs: 0 rows, 5 ms, 1 FAILED (403)"]);
  });

  it("UT-REQLOG-006 an action sums the requests and rows made while it was open", () => {
    const end = beginAction("Write @ /project/generators");
    logHttp({ url: "/a", method: "GET", statusCode: 200, duration: 1 });
    logHttp({ url: "/b", method: "PATCH", statusCode: 500, duration: 1 });
    logData({ kind: "update", target: "vsb_generators", rows: 3, ms: 1, ok: true });
    end(true);
    const line = lines(info).at(-1)!;
    expect(line).toMatch(/^\[VSB\] ACTION Write @ \/project\/generators: \d+ ms, 2 requests \(1 failed\), 3 rows — update vsb_generators \[a\d+\]$/);
  });

  it("UT-REQLOG-007 requests after an action closed are not counted, and closing twice prints once", () => {
    const end = beginAction("A");
    end(true);
    end(false);
    logHttp({ url: "/x", method: "GET", statusCode: 200, duration: 1 });
    expect(lines(info).filter((l) => l.includes("ACTION"))).toHaveLength(1);
  });

  it("UT-REQLOG-008 actionLog logs success as info and failure as FAILED warning, and rethrows", async () => {
    await expect(actionLog("ok", async () => 5)).resolves.toBe(5);
    await expect(actionLog("bad", async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(lines(info).at(-1)).toMatch(/ACTION ok: \d+ ms, 0 requests, 0 rows \[a\d+\]$/);
    expect(lines(warn).at(-1)).toMatch(/ACTION bad: \d+ ms, 0 requests, 0 rows, FAILED \[a\d+\]$/);
  });

  it("UT-REQLOG-009 loggedCall counts rows from the result and logs a failure", async () => {
    await loggedCall("read", "vsb_x", async () => [1, 2, 3], (r) => r.length);
    await expect(loggedCall("create", "vsb_y", async () => { throw new Error("nope"); })).rejects.toThrow("nope");
    flushDataLog();
    expect(lines(info)[0]).toMatch(/^\[VSB\] DATA read vsb_x: 3 rows, \d+ ms$/);
    expect(lines(warn)[0]).toMatch(/^\[VSB\] DATA create vsb_y: 0 rows, \d+ ms, 1 FAILED \(nope\)$/);
  });

  it("UT-REQLOG-010 logAction adds the prefix; no row values ever appear in a line", () => {
    logAction("Add Cost from Table save: 5 ms");
    logData({ kind: "create", target: "vsb_costs", rows: 1, ms: 1, ok: true });
    flushDataLog();
    expect(lines(info)[0]).toBe("[VSB] ACTION Add Cost from Table save: 5 ms");
    expect(lines(info)[1]).not.toMatch(/\d{4,}/);
  });

  it("UT-REQLOG-011 a console that throws never breaks the caller", () => {
    info.mockImplementation(() => { throw new Error("console broken"); });
    expect(() => logHttp({ url: "/a", method: "GET", statusCode: 200, duration: 1 })).not.toThrow();
  });

  it("UT-REQLOG-012 many calls of one kind on one table print as ONE summary line", () => {
    for (let i = 0; i < 40; i += 1) logData({ kind: "delete", target: "vsb_capexcosts", rows: 1, ms: 500 + i, ok: true });
    logData({ kind: "delete", target: "vsb_capexprojectcontracts", rows: 1, ms: 1380, ok: true });
    flushDataLog();
    const out = lines(info);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatch(/^\[VSB\] DATA delete vsb_capexcosts: 40 rows, 40 calls, \d+ ms in total \(average 520 ms, slowest 539 ms\)$/);
    expect(out[1]).toBe("[VSB] DATA delete vsb_capexprojectcontracts: 1 row, 1,380 ms");
  });

  it("UT-REQLOG-013 a batch with a failure is one warning that counts the failures", () => {
    logData({ kind: "update", target: "vsb_costs", rows: 1, ms: 10, ok: true });
    logData({ kind: "update", target: "vsb_costs", ms: 10, ok: false, error: "403" });
    flushDataLog();
    expect(lines(warn)).toHaveLength(1);
    expect(lines(warn)[0]).toMatch(/^\[VSB\] DATA update vsb_costs: 1 row, 2 calls, \d+ ms in total .*, 1 FAILED \(403\)$/);
  });

  it("UT-REQLOG-014 the batch prints by itself after a quiet gap, and before its action line", () => {
    vi.useFakeTimers();
    try {
      logData({ kind: "read", target: "vsb_projects", rows: 5, ms: 1, ok: true });
      expect(lines(info)).toHaveLength(0);
      vi.advanceTimersByTime(DATA_BATCH_GAP_MS + 1);
      expect(lines(info)).toHaveLength(1);
      const end = beginAction("A");
      logData({ kind: "create", target: "vsb_x", rows: 1, ms: 1, ok: true });
      end(true);
      expect(lines(info).slice(1).map((l) => l.split(":")[0])).toEqual(["[VSB] DATA create vsb_x", "[VSB] ACTION A"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("UT-REQLOG-030 requests and data calls made inside an action carry its id, outside carry none", () => {
    logHttp({ url: "/before", method: "GET", statusCode: 200, duration: 1 });
    const end = beginAction("Write @ /x");
    logHttp({ url: "/inside", method: "PATCH", statusCode: 200, duration: 1 });
    logData({ kind: "update", target: "vsb_t", rows: 1, ms: 1, ok: true });
    end(true);
    const out = lines(info);
    expect(out[0]).toBe("[VSB] HTTP GET before → 200 · 1 ms");
    expect(out[1]).toBe("[VSB] HTTP PATCH inside → 200 · 1 ms [a1]");
    expect(out[2]).toBe("[VSB] DATA update vsb_t: 1 row, 1 ms [a1]");
    expect(out[3]).toMatch(/ACTION Write @ \/x: .* \[a1\]$/);
  });

  it("UT-REQLOG-031 overlapping actions list every open id, and ids are numbered in order", () => {
    const first = beginAction("A");
    const second = beginAction("B");
    logHttp({ url: "/both", method: "GET", statusCode: 200, duration: 1 });
    second(true);
    first(true);
    expect(lines(info)[0]).toBe("[VSB] HTTP GET both → 200 · 1 ms [a1,a2]");
  });

  it("UT-REQLOG-032 a request at or over the limit is a SLOW warning; just under is not", () => {
    logHttp({ url: "/ok", method: "GET", statusCode: 200, duration: SLOW_REQUEST_MS - 1 });
    logHttp({ url: "/slow", method: "GET", statusCode: 200, duration: SLOW_REQUEST_MS });
    expect(lines(info)).toEqual(["[VSB] HTTP GET ok → 200 · 2999 ms"]);
    expect(lines(warn)).toEqual([`[VSB] HTTP GET slow → 200 · ${SLOW_REQUEST_MS} ms · SLOW`]);
  });

  it("UT-REQLOG-033 a batch whose slowest call is over the limit is a SLOW warning", () => {
    logData({ kind: "read", target: "vsb_big", rows: 10, ms: SLOW_REQUEST_MS + 1, ok: true });
    flushDataLog();
    expect(lines(warn)[0]).toMatch(/^\[VSB\] DATA read vsb_big: 10 rows, 3,001 ms · SLOW$/);
  });

  it("UT-REQLOG-034 an action over the limit is a SLOW warning", () => {
    const spy = vi.spyOn(performance, "now");
    spy.mockReturnValueOnce(0);
    const end = beginAction("Slow one");
    spy.mockReturnValue(SLOW_ACTION_MS + 10);
    end(true);
    expect(lines(warn)[0]).toBe("[VSB] ACTION Slow one: 5010 ms, 0 requests, 0 rows · SLOW [a1]");
  });

  it("UT-REQLOG-035 logError prints a console error with cause and route; context adds the last actions", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const end = beginAction("Write @ /y");
    end(false);
    logError("Could not save generators", "HTTP 403: privilege missing (request abc)");
    logError("Unhandled error: boom", undefined, true);
    const out = lines(error);
    expect(out[0]).toMatch(/^\[VSB\] ERROR Could not save generators — HTTP 403: privilege missing \(request abc\) @ \//);
    expect(out[0]).not.toContain("last actions");
    expect(out[1]).toMatch(/^\[VSB\] ERROR Unhandled error: boom @ \/ · last actions: Write @ \/y FAILED$/);
  });

  it("UT-REQLOG-036 only the last five ended actions are remembered", () => {
    for (let i = 1; i <= 7; i += 1) beginAction(`n${i}`)(true);
    expect(recentActions()).toEqual(["n3 ok", "n4 ok", "n5 ok", "n6 ok", "n7 ok"]);
  });
});
