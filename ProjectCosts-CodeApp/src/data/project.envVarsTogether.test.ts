/**
 * UT-BOOTENV-* — PB-08 (`ENV_VARS_TOGETHER`): the environment-variable definitions and values are read at the same time.
 * The data layer is faked with reads the test releases by hand, so the START ORDER (the wave count) is what is asserted, and the
 * old sequential path is the oracle for the result.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consoleIsOpen, openConsoleGateForTests, resetConsoleGate } from "@/platform/consoleGate";
import { bootDvopt, resetBootDvopt, setBootDvoptForTests } from "./bootDvoptFlags";

const DEF_NAME = "11111111-1111-4111-8111-111111111111";
const DEF_VERSION = "22222222-2222-4222-8222-222222222222";

const s = vi.hoisted(() => ({
  calls: [] as { label: string; filter: string }[],
  definitions: [] as unknown[],
  valuesById: [] as unknown[],
  valuesByName: [] as unknown[],
  failDefinitions: false,
  refuseByName: false,
  holdDefinitions: undefined as undefined | Promise<void>,
}));

vi.mock("./client", () => ({
  fetchAll: async (label: string, _call: unknown, options: { filter?: string }) => {
    const filter = options.filter ?? "";
    s.calls.push({ label, filter });
    if (label === "list environment variable definitions") {
      if (s.holdDefinitions) await s.holdDefinitions;
      if (s.failDefinitions) throw new Error("403 Forbidden");
      return s.definitions;
    }
    if (filter.includes("EnvironmentVariableDefinitionId/schemaname")) {
      if (s.refuseByName) throw new Error("400 Bad Request: the navigation path is not valid");
      return s.valuesByName;
    }
    return s.valuesById;
  },
}));

import { loadEnvironmentVariables } from "./project";

beforeEach(() => {
  s.calls.length = 0;
  s.definitions = [
    { environmentvariabledefinitionid: DEF_NAME, schemaname: "vsb_EnvironmentName", defaultvalue: "Dev" },
    { environmentvariabledefinitionid: DEF_VERSION, schemaname: "vsb_AppVersion", defaultvalue: "1.0" },
  ];
  const rows = [{ _environmentvariabledefinitionid_value: DEF_NAME, value: "QA" }];
  s.valuesById = rows;
  s.valuesByName = rows;
  s.failDefinitions = false;
  s.refuseByName = false;
  s.holdDefinitions = undefined;
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  resetConsoleGate();
  resetBootDvopt();
});
afterEach(() => {
  openConsoleGateForTests();
  resetBootDvopt();
  vi.restoreAllMocks();
});

describe("PB-08 the two environment-variable reads", () => {
  it("UT-BOOTENV-001 both reads start before the definitions answer (one wave, not two)", async () => {
    setBootDvoptForTests({ envVarsTogether: true }); // ships OFF at integration; this test exercises the switch ON (reset in afterEach)
    let release!: () => void;
    s.holdDefinitions = new Promise<void>((r) => { release = r; });
    const done = loadEnvironmentVariables();
    await new Promise((r) => setTimeout(r, 0));
    expect(s.calls.map((c) => c.label).sort()).toEqual([
      "list environment variable definitions", "list environment variable values",
    ]);
    expect(s.calls).toHaveLength(2);
    release();
    await done;
    expect(s.calls).toHaveLength(2); // no third read: the values were already there
  });

  it("UT-BOOTENV-002 the values read filters through the definition's schema name for the app's variable names only", async () => {
    setBootDvoptForTests({ envVarsTogether: true }); // ships OFF at integration; this test exercises the switch ON (reset in afterEach)
    await loadEnvironmentVariables();
    const values = s.calls.find((c) => c.label === "list environment variable values")!;
    expect(values.filter).toContain("EnvironmentVariableDefinitionId/schemaname eq 'vsb_EnvironmentName'");
    expect(values.filter).not.toContain("_environmentvariabledefinitionid_value eq");
  });

  it("UT-BOOTENV-003 the result equals the sequential path's (a value row wins over the default, a missing one keeps it)", async () => {
    setBootDvoptForTests({ envVarsTogether: true }); // ships OFF at integration; this test exercises the switch ON (reset in afterEach)
    const together = await loadEnvironmentVariables();
    setBootDvoptForTests({ envVarsTogether: false });
    s.calls.length = 0;
    const sequential = await loadEnvironmentVariables();
    expect(together).toEqual(sequential);
    expect(together).toEqual({ vsb_EnvironmentName: "QA", vsb_AppVersion: "1.0" });
    // OFF: definitions first, then the values by definition id (two waves), exactly as before.
    expect(s.calls.map((c) => c.label)).toEqual(["list environment variable definitions", "list environment variable values"]);
    expect(s.calls[1]!.filter).toContain(`_environmentvariabledefinitionid_value eq ${DEF_NAME}`);
  });

  it("UT-BOOTENV-004 a values read the server refuses falls back to the read by definition id, with the same result", async () => {
    setBootDvoptForTests({ envVarsTogether: true }); // ships OFF at integration; this test exercises the switch ON (reset in afterEach)
    s.refuseByName = true;
    const vars = await loadEnvironmentVariables();
    expect(vars).toEqual({ vsb_EnvironmentName: "QA", vsb_AppVersion: "1.0" });
    expect(s.calls).toHaveLength(3);
    expect(s.calls[2]!.filter).toContain(`_environmentvariabledefinitionid_value eq ${DEF_NAME}`);
  });

  it("UT-BOOTENV-005 a failed definitions read still fails the load, and the refused values read is not an unhandled rejection", async () => {
    s.failDefinitions = true;
    s.refuseByName = true;
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    await expect(loadEnvironmentVariables()).rejects.toThrow(/403/);
    await new Promise((r) => setTimeout(r, 10));
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    // D164: a failed read tells the console gate nothing (the lines stay held).
    expect(consoleIsOpen()).toBe(false);
  });

  it("UT-BOOTENV-006 no definitions found: no value is needed, the default-less result is empty and the gate is told", async () => {
    setBootDvoptForTests({ envVarsTogether: true }); // ships OFF at integration; this test exercises the switch ON (reset in afterEach)
    s.definitions = [];
    const vars = await loadEnvironmentVariables();
    expect(vars).toEqual({});
    expect(consoleIsOpen()).toBe(true);
    expect(s.calls.filter((c) => c.label === "list environment variable values")).toHaveLength(1); // the speculative one only
  });

  it("UT-BOOTENV-007 Prod from a value row silences the console, as on the sequential path (D164)", async () => {
    setBootDvoptForTests({ envVarsTogether: true }); // ships OFF at integration; this test exercises the switch ON (reset in afterEach)
    s.valuesByName = [{ _environmentvariabledefinitionid_value: DEF_NAME, value: "Prod" }];
    await loadEnvironmentVariables();
    expect(consoleIsOpen()).toBe(false);
  });

  it("UT-BOOTENV-008 the shipped default is OFF: the definitions are read first, then the values by definition id", async () => {
    expect(bootDvopt().envVarsTogether).toBe(false);
    const vars = await loadEnvironmentVariables();
    expect(vars).toEqual({ vsb_EnvironmentName: "QA", vsb_AppVersion: "1.0" });
    expect(s.calls.map((c) => c.label)).toEqual(["list environment variable definitions", "list environment variable values"]);
    expect(s.calls[1]!.filter).toContain(`_environmentvariabledefinitionid_value eq ${DEF_NAME}`);
    expect(s.calls[1]!.filter).not.toContain("EnvironmentVariableDefinitionId/schemaname");
  });
});
