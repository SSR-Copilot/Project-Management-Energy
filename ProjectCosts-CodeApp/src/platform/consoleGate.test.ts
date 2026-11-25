import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HELD_MAX, applyEnvironmentName, consoleIsOpen, consoleOutput, heldLineCount, isProductionEnvironment,
  openConsoleGateForTests, resetConsoleGate,
} from "./consoleGate";
import {
  actionLog, beginAction, flushDataLog, logAction, logData, logError, logHttp, loggedCall, resetRequestLog,
} from "./requestLog";
import { clearTraces, trace, traces } from "./telemetry";
import { emitSaveLog } from "@/data/saveLog";

/** Every console method the app uses, spied; nothing reaches the real console. */
const METHODS = ["info", "warn", "error", "groupCollapsed", "groupEnd", "table"] as const;
type Spies = Record<(typeof METHODS)[number], ReturnType<typeof vi.spyOn>>;
let spies: Spies;
const printedCalls = (): number => METHODS.reduce((n, m) => n + spies[m].mock.calls.length, 0);
const infoLines = (): string[] => spies.info.mock.calls.map((c: unknown[]) => String(c[0]));

beforeEach(() => {
  resetRequestLog();
  clearTraces();
  spies = Object.fromEntries(
    METHODS.map((m) => [m, vi.spyOn(console, m).mockImplementation(() => undefined)]),
  ) as Spies;
  resetConsoleGate(); // the environment is not known yet
});

afterEach(() => {
  openConsoleGateForTests();
  vi.restoreAllMocks();
});

/** One of every kind of line the app prints, through the real loggers. */
function printEverything(): void {
  logHttp({ url: "https://org.crm4.dynamics.com/api/data/v9.2/vsb_projects?$select=vsb_name", method: "GET", statusCode: 200, duration: 312 });
  logHttp({ url: "/api/data/v9.2/vsb_costs(1)", method: "PATCH", statusCode: 403, duration: 40 });
  logData({ kind: "read", target: "Load projects", rows: 5, ms: 10, ok: true });
  logData({ kind: "delete", target: "vsb_costs", ms: 5, ok: false, error: "403" });
  flushDataLog();
  logAction("Add Cost from Table save: 3 requests");
  logAction("Application Insights OFF", "warn");
  logError("Could not load", "403 Forbidden");
  const end = beginAction("Mutation @ /costs");
  end(true);
  beginAction("Query @ /")(false);
  trace("error", "A write failed", new Error("root cause"));
  trace("critical", "Unhandled error: x");
  emitSaveLog({
    summary: "Save: 3 requests",
    sections: [{ title: "Requests", lines: ["a", "b"], table: [{ step: "1", ms: 5 }] }, { title: "Raw error (for support)", lines: [], raw: new Error("boom") }],
  });
}

describe("console gate (D164)", () => {
  it("UT-CONGATE-001 only vsb_EnvironmentName Prod counts as production, in any letter case, spaces ignored", () => {
    for (const name of ["Prod", "prod", "PROD", " Prod ", "\tprod\n"]) expect(isProductionEnvironment(name), name).toBe(true);
    for (const name of ["Production", "Prod2", "Pre-Prod", "NonProd", "Dev", "QA", "Test", "", "   ", undefined, null]) {
      expect(isProductionEnvironment(name), String(name)).toBe(false);
    }
  });

  it("UT-CONGATE-002 while the environment is unknown nothing is printed, and every line is held", () => {
    consoleOutput("info", "one");
    consoleOutput("warn", "two");
    consoleOutput("error", "three");
    expect(printedCalls()).toBe(0);
    expect(heldLineCount()).toBe(3);
    expect(consoleIsOpen()).toBe(false);
  });

  it("UT-CONGATE-003 a non-Prod answer prints what was held once, in order, with each level, then prints at once", () => {
    consoleOutput("info", "one");
    consoleOutput("warn", "two");
    consoleOutput("groupCollapsed", "section");
    consoleOutput("table", [{ a: 1 }]);
    consoleOutput("groupEnd");
    consoleOutput("error", "three");
    const order: string[] = [];
    for (const m of METHODS) spies[m].mockImplementation((...a: unknown[]) => { order.push(`${m}:${a.length ? JSON.stringify(a[0]) : ""}`); });
    applyEnvironmentName("QA");
    expect(order).toEqual(['info:"one"', 'warn:"two"', 'groupCollapsed:"section"', 'table:[{"a":1}]', "groupEnd:", 'error:"three"']);
    expect(heldLineCount()).toBe(0);
    expect(consoleIsOpen()).toBe(true);
    consoleOutput("info", "later");
    expect(order.at(-1)).toBe('info:"later"');
    applyEnvironmentName("QA"); // the same answer again prints nothing twice
    expect(order).toHaveLength(7);
  });

  it("UT-CONGATE-004 a Prod answer discards what was held and nothing is ever printed again", () => {
    consoleOutput("info", "held before the answer");
    applyEnvironmentName("Prod");
    expect(heldLineCount()).toBe(0);
    expect(consoleIsOpen()).toBe(false);
    consoleOutput("info", "x");
    consoleOutput("warn", "y");
    consoleOutput("error", "z");
    consoleOutput("table", [{ a: 1 }]);
    expect(printedCalls()).toBe(0);
    expect(heldLineCount()).toBe(0);
  });

  it("UT-CONGATE-005 Prod is final for the page: a later non-Prod answer does not reopen the console", () => {
    applyEnvironmentName("Prod");
    applyEnvironmentName("Dev");
    applyEnvironmentName(undefined);
    consoleOutput("error", "must stay silent");
    expect(consoleIsOpen()).toBe(false);
    expect(printedCalls()).toBe(0);
  });

  it("UT-CONGATE-006 an environment without the variable (undefined or empty) is not Prod, so it prints", () => {
    consoleOutput("info", "held");
    applyEnvironmentName(undefined);
    expect(infoLines()).toEqual(["held"]);
    resetConsoleGate();
    consoleOutput("info", "held 2");
    applyEnvironmentName("");
    expect(infoLines()).toEqual(["held", "held 2"]);
  });

  it("UT-CONGATE-007 the held lines are bounded: the oldest are dropped first", () => {
    for (let i = 0; i < HELD_MAX + 25; i += 1) consoleOutput("info", `line ${i}`);
    expect(heldLineCount()).toBe(HELD_MAX);
    applyEnvironmentName("Dev");
    const lines = infoLines();
    expect(lines).toHaveLength(HELD_MAX);
    expect(lines[0]).toBe("line 25");
    expect(lines.at(-1)).toBe(`line ${HELD_MAX + 24}`);
  });

  it("UT-CONGATE-008 a console method that throws does not stop the held lines or the caller", () => {
    spies.info.mockImplementation(() => { throw new Error("console broken"); });
    consoleOutput("info", "a");
    consoleOutput("warn", "b");
    expect(() => applyEnvironmentName("Dev")).not.toThrow();
    expect(spies.warn).toHaveBeenCalledWith("b");
  });
});

describe("every logger of the app obeys the gate (D164)", () => {
  it("UT-CONGATE-010 PROD: no HTTP, DATA, ACTION, ERROR line, no trace error and no save report reaches the console", () => {
    applyEnvironmentName("Prod");
    printEverything();
    expect(printedCalls()).toBe(0);
  });

  it("UT-CONGATE-011 PROD: lines produced BEFORE the answer arrived are never printed either", () => {
    printEverything(); // the start-up burst, environment still unknown
    expect(printedCalls()).toBe(0);
    expect(heldLineCount()).toBeGreaterThan(0);
    applyEnvironmentName("Prod");
    expect(printedCalls()).toBe(0);
    expect(heldLineCount()).toBe(0);
  });

  it("UT-CONGATE-012 PROD: a failing request wrapped by loggedCall still throws its own error and prints nothing", async () => {
    applyEnvironmentName("Prod");
    await expect(loggedCall("read", "vsb_projects", () => Promise.reject(new Error("403")))).rejects.toThrow("403");
    await expect(actionLog("Write @ /costs", () => Promise.reject(new Error("nope")))).rejects.toThrow("nope");
    flushDataLog();
    expect(printedCalls()).toBe(0);
  });

  it("UT-CONGATE-013 PROD: the in-memory trace buffer (Report a problem) still records errors, only the console line is gone", () => {
    applyEnvironmentName("Prod");
    trace("error", "A write failed", new Error("root cause"));
    trace("critical", "Unhandled error: x");
    expect(printedCalls()).toBe(0);
    expect(traces().map((t) => t.message)).toEqual(["A write failed", "Unhandled error: x"]);
  });

  it("UT-CONGATE-014 NOT PROD: every line prints exactly as before, held lines first, in the order they were produced", () => {
    logHttp({ url: "/api/data/v9.2/vsb_projects?$select=vsb_name", method: "GET", statusCode: 200, duration: 312, responseSize: 14540 });
    logAction("first");
    expect(printedCalls()).toBe(0);
    applyEnvironmentName("QA");
    expect(infoLines()).toEqual([
      "[VSB] HTTP GET vsb_projects?$select=vsb_name → 200 · 312 ms · 14.2 kB",
      "[VSB] ACTION first",
    ]);
    logData({ kind: "update", target: "vsb_costs", rows: 1, ms: 12, ok: true });
    flushDataLog();
    logError("Could not load", "403 Forbidden");
    expect(infoLines().at(-1)).toBe("[VSB] DATA update vsb_costs: 1 row, 12 ms");
    expect(String(spies.error.mock.calls[0]?.[0])).toMatch(/^\[VSB\] ERROR Could not load — 403 Forbidden @ /);
  });

  it("UT-CONGATE-015 NOT PROD: the save report prints its summary, its collapsed section, its table and its raw error", () => {
    applyEnvironmentName("Dev");
    emitSaveLog({
      summary: "Save: 3 requests",
      sections: [{ title: "Requests", lines: ["a"], table: [{ step: "1", ms: 5 }] }, { title: "Raw error (for support)", lines: [], raw: new Error("boom") }],
    });
    expect(infoLines()).toEqual(["[VSB] ACTION Save: 3 requests", "a"]);
    expect(spies.groupCollapsed.mock.calls.map((c: unknown[]) => c[0])).toEqual(["Requests", "Raw error (for support)"]);
    expect(spies.groupEnd).toHaveBeenCalledTimes(2);
    expect(spies.table).toHaveBeenCalledTimes(1);
    expect(spies.error).toHaveBeenCalledTimes(1);
  });

  it("UT-CONGATE-016 NOT PROD with an unknown answer yet: the save report is held whole and prints in one piece afterwards", () => {
    emitSaveLog({ summary: "Save: 1 request", sections: [{ title: "Requests", lines: ["a"] }] });
    expect(printedCalls()).toBe(0);
    applyEnvironmentName("QA");
    expect(infoLines()).toEqual(["[VSB] ACTION Save: 1 request", "a"]);
    expect(spies.groupCollapsed).toHaveBeenCalledTimes(1);
    expect(spies.groupEnd).toHaveBeenCalledTimes(1);
  });
});
