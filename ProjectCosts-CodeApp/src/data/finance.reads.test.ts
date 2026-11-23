/**
 * UT-FIN-OPT-0xx — two Finance reads (optimization programme B5a, OPT-08a and OPT-07e).
 *
 * BEFORE (unmodified tree), recorded with these fakes:
 *  - `loadTotalDevexCapex`: the CAPEX costs read selected `vsb_capexcostid` (never used) and sent no `maxPageSize` (500 per page);
 *  - `countActiveTurbines`: read the types, then EVERY turbine (all columns of `listProjectTurbines`) and counted `status === 0` in
 *    the browser.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  calls: [] as { label: string; options: Record<string, unknown> }[],
  contracts: [] as Record<string, unknown>[],
  costs: [] as Record<string, unknown>[],
  turbines: [] as Record<string, unknown>[],
  types: [] as { id: string }[],
  turbineReads: 0,
}));

vi.mock("./client", () => ({
  fetchAll: async (label: string, _page: unknown, options: Record<string, unknown>) => {
    h.calls.push({ label, options });
    if (label === "load the project's CAPEX contracts") return h.contracts;
    if (label === "load the project's CAPEX costs") return h.costs;
    if (label === "count the project's active turbines") {
      // The fake server applies the `statecode eq 0` clause it is sent.
      return String(options.filter).includes("statecode eq 0") ? h.turbines.filter((t) => t.statecode === 0) : h.turbines;
    }
    return [];
  },
  fetchPage: async () => [],
}));
vi.mock("./generators", () => ({
  listGeneratorTypes: async () => h.types,
  listProjectTurbines: async () => { h.turbineReads += 1; return h.turbines.map((t) => ({ ...t, status: t.statecode })); },
}));

import { countActiveTurbines, loadTotalDevexCapex } from "./finance";

const PID = "11111111-1111-1111-1111-111111111111";
const g = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

beforeEach(() => {
  h.calls = []; h.turbineReads = 0;
  h.contracts = [{ vsb_capexprojectcontractid: g(1) }, { vsb_capexprojectcontractid: g(2) }];
  h.costs = [
    { vsb_capexcostid: "x1", _vsb_contract_value: g(1), vsb_cost: 100 },
    { vsb_capexcostid: "x2", _vsb_contract_value: g(2), vsb_cost: 50.5 },
    { vsb_capexcostid: "x3", _vsb_contract_value: g(9), vsb_cost: 7 },
  ];
  h.types = [{ id: g(11) }, { id: g(12) }];
  h.turbines = [{ statecode: 0 }, { statecode: 1 }, { statecode: 0 }, { statecode: 0 }, { statecode: 1 }];
});

describe("loadTotalDevexCapex (OPT-08a)", () => {
  it("UT-FIN-OPT-001 the costs read selects only the contract and the cost and asks for 5000 rows a page (BEFORE: also vsb_capexcostid, 500 a page); no ACTIVE filter (the canvas formula has none)", async () => {
    const total = await loadTotalDevexCapex(PID, true);
    const read = h.calls.find((c) => c.label === "load the project's CAPEX costs")!;
    expect(read.options.select).toEqual(["_vsb_contract_value", "vsb_cost"]);
    expect(read.options.maxPageSize).toBe(5000);
    expect(String(read.options.filter)).not.toContain("statecode");
    expect(total).toBe(150.5);
  });

  it("UT-FIN-OPT-002 the sum is unchanged: costs of other contracts are ignored, a null cost counts as 0 (differential against the old sum)", async () => {
    h.costs.push({ _vsb_contract_value: g(1), vsb_cost: null });
    expect(await loadTotalDevexCapex(PID, true)).toBe(150.5);
    expect(await loadTotalDevexCapex(PID, false)).toBe(150.5);
  });

  it("UT-FIN-OPT-003 a project with no contracts reads no costs and totals 0", async () => {
    h.contracts = [];
    expect(await loadTotalDevexCapex(PID)).toBe(0);
    expect(h.calls.some((c) => c.label === "load the project's CAPEX costs")).toBe(false);
  });
});

describe("countActiveTurbines (OPT-07e)", () => {
  it("UT-FIN-OPT-010 the count is the same as the old browser-side count of statecode 0 (3 of 5); the filter is sent to the server and only the id is selected", async () => {
    const n = await countActiveTurbines(PID);
    expect(n).toBe(3);
    expect(h.turbineReads).toBe(0); // BEFORE: the whole turbine read (every column, every row) ran once
    const read = h.calls.find((c) => c.label === "count the project's active turbines")!;
    expect(String(read.options.filter)).toContain("statecode eq 0");
    expect(read.options.select).toEqual(["vsb_generatorinprojectid"]);
  });

  it("UT-FIN-OPT-011 no generator types means 0 turbines and no turbine read", async () => {
    h.types = [];
    expect(await countActiveTurbines(PID)).toBe(0);
    expect(h.calls.some((c) => c.label === "count the project's active turbines")).toBe(false);
  });
});
