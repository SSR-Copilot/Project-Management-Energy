import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consoleIsOpen, heldLineCount, openConsoleGateForTests, resetConsoleGate } from "@/platform/consoleGate";
import { logAction } from "@/platform/requestLog";

const DEF = "11111111-1111-4111-8111-111111111111";
const DEF_OTHER = "22222222-2222-4222-8222-222222222222";

/** What the two reads of `loadEnvironmentVariables` return, by their labels (the same pattern as `addCostSheet.test.ts`). */
const rows = vi.hoisted(() => ({ definitions: [] as unknown[], values: [] as unknown[], failDefinitions: false }));

vi.mock("./client", () => ({
  fetchAll: async (label: string) => {
    if (label === "list environment variable definitions") {
      if (rows.failDefinitions) throw new Error("403 Forbidden");
      return rows.definitions;
    }
    return rows.values;
  },
}));

import { loadEnvironmentVariables } from "./project";

let info: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  rows.definitions = [
    { environmentvariabledefinitionid: DEF, schemaname: "vsb_EnvironmentName", defaultvalue: "Dev" },
    { environmentvariabledefinitionid: DEF_OTHER, schemaname: "vsb_AppVersion", defaultvalue: "1.0" },
  ];
  rows.values = [];
  rows.failDefinitions = false;
  info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  resetConsoleGate();
});

afterEach(() => {
  openConsoleGateForTests();
  vi.restoreAllMocks();
});

describe("loadEnvironmentVariables tells the console gate which environment this is (D164)", () => {
  it("UT-CONGATE-020 the value row Prod wins over the default and silences the console for good", async () => {
    rows.values = [{ _environmentvariabledefinitionid_value: DEF, value: "Prod" }];
    logAction("held before the answer");
    const vars = await loadEnvironmentVariables();
    expect(vars.vsb_EnvironmentName).toBe("Prod");
    expect(consoleIsOpen()).toBe(false);
    expect(heldLineCount()).toBe(0);
    logAction("after the answer");
    expect(info).not.toHaveBeenCalled();
  });

  it("UT-CONGATE-021 the default value alone can make an environment Prod", async () => {
    rows.definitions = [{ environmentvariabledefinitionid: DEF, schemaname: "vsb_EnvironmentName", defaultvalue: "prod" }];
    await loadEnvironmentVariables();
    logAction("x");
    expect(consoleIsOpen()).toBe(false);
    expect(info).not.toHaveBeenCalled();
  });

  it("UT-CONGATE-022 any other value (QA, Dev, Test) opens the console and prints what was held, then the new lines", async () => {
    rows.values = [{ _environmentvariabledefinitionid_value: DEF, value: "QA" }];
    logAction("held before the answer");
    await loadEnvironmentVariables();
    expect(consoleIsOpen()).toBe(true);
    logAction("after the answer");
    expect(info.mock.calls.map((c: unknown[]) => String(c[0]))).toEqual([
      "[VSB] ACTION held before the answer",
      "[VSB] ACTION after the answer",
    ]);
  });

  it("UT-CONGATE-023 a Prod value row beats a non-Prod default, and a non-Prod row beats a Prod default", async () => {
    rows.definitions = [{ environmentvariabledefinitionid: DEF, schemaname: "vsb_EnvironmentName", defaultvalue: "Prod" }];
    rows.values = [{ _environmentvariabledefinitionid_value: DEF, value: "Dev" }];
    await loadEnvironmentVariables();
    expect(consoleIsOpen()).toBe(true);
  });

  it("UT-CONGATE-024 an environment that has no vsb_EnvironmentName at all is not Prod, so it prints", async () => {
    rows.definitions = [{ environmentvariabledefinitionid: DEF_OTHER, schemaname: "vsb_AppVersion", defaultvalue: "1.0" }];
    await loadEnvironmentVariables();
    expect(consoleIsOpen()).toBe(true);
    rows.definitions = [];
    resetConsoleGate();
    await loadEnvironmentVariables(); // no definition rows at all (the early return)
    expect(consoleIsOpen()).toBe(true);
  });

  it("UT-CONGATE-025 a failed read leaves the answer unknown: nothing is printed until a read succeeds", async () => {
    rows.failDefinitions = true;
    logAction("held");
    await expect(loadEnvironmentVariables()).rejects.toThrow("403 Forbidden");
    expect(consoleIsOpen()).toBe(false);
    expect(info).not.toHaveBeenCalled();
    expect(heldLineCount()).toBe(1);
    rows.failDefinitions = false;
    rows.values = [{ _environmentvariabledefinitionid_value: DEF, value: "Dev" }];
    await loadEnvironmentVariables();
    expect(info.mock.calls.map((c: unknown[]) => String(c[0]))).toEqual(["[VSB] ACTION held"]);
  });
});
