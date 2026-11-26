/**
 * Costs settings reads, once per table and scope (dvopt AD-09, AD-12; `ADMIN_SCOPE_READS_ONCE`), and the OPEX deletes that
 * treat "already gone" as done (AD-05). Old code is the oracle. UT-ADCOST-ONCE-nnn.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@microsoft/power-apps/data", () => ({ getClient: () => ({}) }));

type Raw = Record<string, unknown>;
let rows: Raw[] = [];
let chartRows: Raw[] = [];
let hierarchyRows: Raw[] = [];
let calls: { label: string; options: { select?: string[]; filter?: string } }[] = [];
let chartReads = 0;
let deleteScript: Record<string, number> = {};
let deleted: string[] = [];

vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  fetchAll: async (label: string, _page: unknown, options: { select?: string[]; filter?: string }) => {
    calls.push({ label, options });
    if (label === "list CAPEX account hierarchy") return hierarchyRows;
    if (label === "list contract periods") return rows.map((r) => ({ vsb_opexlandleasestandardassumptionsid: r["vsb_opexlandleasestandardassumptionsid"], vsb_period: r["vsb_period"], vsb_islastperiod: r["vsb_islastperiod"] }));
    // The server applies the statecode condition of the filter; the single combined read has none.
    const f = options.filter ?? "";
    if (/statecode eq 0/.test(f)) return rows.filter((r) => r["statecode"] === 0);
    if (/statecode ne 0/.test(f)) return rows.filter((r) => r["statecode"] !== 0);
    return rows;
  },
  deleteRecord: async (operation: string, _table: string, id: string) => {
    const code = deleteScript[id];
    if (code) {
      const { DataError } = await import("@/platform/errors");
      throw new DataError(operation, { message: `HTTP ${code}`, status: code }, code);
    }
    deleted.push(id);
  },
}));
vi.mock("./capexChart", () => ({ loadCapexChartRows: async () => { chartReads += 1; return chartRows; } }));
vi.mock("./adminRowWrites", async (importOriginal) => ({ ...(await importOriginal<typeof import("./adminRowWrites")>()) }));
vi.mock("@/generated/services/Vsb_capexaccountlistsService", () => ({ Vsb_capexaccountlistsService: { getAll: vi.fn() } }));
vi.mock("@/generated/services/Vsb_landleasesubaccountsService", () => ({ Vsb_landleasesubaccountsService: { getAll: vi.fn() } }));
vi.mock("@/generated/services/Vsb_opexsubaccountsService", () => ({ Vsb_opexsubaccountsService: { getAll: vi.fn() } }));
vi.mock("@/generated/services/Vsb_opexaccountsService", () => ({ Vsb_opexaccountsService: { getAll: vi.fn() } }));
vi.mock("@/generated/services/TransactioncurrenciesService", () => ({ TransactioncurrenciesService: { getAll: vi.fn() } }));
vi.mock("@/generated/services/Vsb_countryinflationprofilesService", () => ({ Vsb_countryinflationprofilesService: { getAll: vi.fn() } }));
vi.mock("@/generated/services/Vsb_spvdevcomappingcapexdevexesService", () => ({ Vsb_spvdevcomappingcapexdevexesService: { getAll: vi.fn() } }));
vi.mock("@/generated/services/Vsb_devexcapexstandardassumptionsesService", () => ({ Vsb_devexcapexstandardassumptionsesService: { getAll: vi.fn() } }));
vi.mock("@/generated/services/Vsb_opexlandleasestandardassumptionsesService", () => ({ Vsb_opexlandleasestandardassumptionsesService: { getAll: vi.fn() } }));

import { ADMIN_OPT } from "./adminFlags";
import { periodChoice, type CostTechnology } from "@/domain/costStandards";
import {
  deleteOpexContract, deleteOpexPeriod, listInactiveOpexRows, listOpexPeriods, listOpexScopeRows, loadCapexHierarchy,
} from "./adminCost";

const DEFAULTS = { ...ADMIN_OPT };
const G = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const SCOPE = { countryId: G(1), technology: 952850000 as CostTechnology };
const PK = "vsb_opexlandleasestandardassumptionsid";

const opexRow = (n: number, statecode: number, extra: Raw = {}): Raw => ({
  [PK]: G(100 + n), vsb_description: `Contract ${n}`, vsb_typeofcontract: 1, vsb_period: periodChoice(n % 3 + 1), vsb_islastperiod: n % 2 === 0,
  _vsb_country_value: G(1), vsb_technology: 952850000, _vsb_landleasesubaccount_value: G(7), _vsb_opexsubaccount_value: null,
  _vsb_currency_value: G(8), vsb_startdatestring: "01/2026", vsb_durationinyears: 5, vsb_fixcosts: n * 10, vsb_secured: n % 2 === 0,
  statecode, ...extra,
});

beforeEach(() => {
  Object.assign(ADMIN_OPT, DEFAULTS);
  rows = []; chartRows = []; hierarchyRows = []; calls = []; chartReads = 0; deleteScript = {}; deleted = [];
});
afterEach(() => { Object.assign(ADMIN_OPT, DEFAULTS); });

describe("AD-09 one OPEX read per scope", () => {
  it("UT-ADCOST-ONCE-001 differential: the combined read gives exactly the active rows listOpexPeriods and the hidden rows listInactiveOpexRows gave", async () => {
    rows = [opexRow(1, 0), opexRow(2, 1), opexRow(3, 0), opexRow(4, 1), opexRow(5, 0), opexRow(6, 2)];
    const oldActive = await listOpexPeriods(SCOPE);
    const oldInactive = await listInactiveOpexRows(SCOPE);
    calls = [];
    const once = await listOpexScopeRows(SCOPE);
    expect(once.active).toEqual(oldActive);
    expect(once.inactive).toEqual(oldInactive);
    expect(once.active).toHaveLength(3);
    expect(once.inactive).toHaveLength(3);
  });

  it("UT-ADCOST-ONCE-002 it is ONE request on the table, with $select (the screen columns plus statecode) and the scope filter only", async () => {
    rows = [opexRow(1, 0)];
    await listOpexScopeRows(SCOPE);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.options.select).toContain("statecode");
    expect(calls[0]!.options.select).toContain("vsb_fixcosts");
    expect(calls[0]!.options.filter).not.toMatch(/statecode/);
    expect(calls[0]!.options.filter).toContain(G(1));
  });

  it("UT-ADCOST-ONCE-003 an empty scope gives two empty lists", async () => {
    expect(await listOpexScopeRows(SCOPE)).toEqual({ active: [], inactive: [] });
  });
});

describe("AD-12 the CAPEX hierarchy from the shared chart read", () => {
  const acc = (id: number, number: string, name: string, order: number | null, parent: number | null): Raw => ({
    vsb_capexaccountlistid: G(id), vsb_number: number, vsb_name: name, vsb_order: order, _vsb_parentaccount_value: parent === null ? null : G(parent),
    vsb_accountcategory: null,
  });
  const tree = [
    acc(1, "00001", "CAPEX", 1, null),
    acc(2, "10000", "Cat B", 2, 1), acc(3, "20000", "Cat A", 1, 1), acc(4, "30000", "Overleveraging", 3, 1),
    acc(5, "10100", "Acc 2", 2, 2), acc(6, "10200", "Acc 1", 1, 2), acc(7, "20100", "Acc X", null, 3),
    acc(8, "10101", "Sub 2", 2, 5), acc(9, "10102", "Sub 1", 1, 5), acc(10, "40100", "Hidden", 1, 4),
  ];

  it("UT-ADCOST-ONCE-004 differential: the hierarchy built from the chart rows (any order) equals the one built from the own read", async () => {
    hierarchyRows = tree;
    ADMIN_OPT.ADMIN_SCOPE_READS_ONCE = false;
    const own = await loadCapexHierarchy();
    expect(calls.map((c) => c.label)).toEqual(["list CAPEX account hierarchy"]);
    for (const order of [tree, [...tree].reverse(), [...tree].sort((a, b) => String(a["vsb_number"]).localeCompare(String(b["vsb_number"])))]) {
      chartRows = order; calls = []; chartReads = 0;
      ADMIN_OPT.ADMIN_SCOPE_READS_ONCE = true;
      const shared = await loadCapexHierarchy();
      expect(shared).toEqual(own);
      expect(chartReads).toBe(1);
      expect(calls).toEqual([]);
    }
    expect(own.categories.map((c) => c.name)).toEqual(["Cat A", "Cat B"]);
    expect(own.subaccounts).toHaveLength(2);
  });

  it("UT-ADCOST-ONCE-005 a chart without the root account gives the empty hierarchy, as the own read did", async () => {
    chartRows = tree.slice(1);
    expect(await loadCapexHierarchy()).toEqual({ categories: [], accounts: [], subaccounts: [] });
  });
});

describe("AD-05 OPEX deletes: already gone is done", () => {
  it("UT-ADCOST-ONCE-006 a contract delete whose period rows were already deleted by another admin completes and counts them", async () => {
    rows = [opexRow(1, 0, { vsb_period: periodChoice(1) }), opexRow(2, 0, { vsb_period: periodChoice(2) }), opexRow(3, 0, { vsb_period: periodChoice(3) })];
    deleteScript = { [G(103)]: 404 };
    const result = await deleteOpexContract({ ...SCOPE, subaccountId: G(7), type: 1, isLandLease: true } as never);
    expect(result.deleted).toBe(3);
    expect(deleted).toEqual([G(102), G(101)]);
  });

  it("UT-ADCOST-ONCE-007 a 403 still stops the contract delete as a partial delete", async () => {
    rows = [opexRow(1, 0, { vsb_period: periodChoice(1) }), opexRow(2, 0, { vsb_period: periodChoice(2) })];
    deleteScript = { [G(102)]: 403 };
    await expect(deleteOpexContract({ ...SCOPE, subaccountId: G(7), type: 1, isLandLease: true } as never)).rejects.toMatchObject({ name: "ContractDeleteError" });
    expect(deleted).toEqual([]);
  });

  it("UT-ADCOST-ONCE-008 with ADMIN_DELETE_ALREADY_GONE_OK off a 404 stops the delete again", async () => {
    ADMIN_OPT.ADMIN_DELETE_ALREADY_GONE_OK = false;
    rows = [opexRow(1, 0, { vsb_period: periodChoice(1) }), opexRow(2, 0, { vsb_period: periodChoice(2) })];
    deleteScript = { [G(102)]: 404 };
    await expect(deleteOpexContract({ ...SCOPE, subaccountId: G(7), type: 1, isLandLease: true } as never)).rejects.toMatchObject({ name: "ContractDeleteError" });
  });

  it("UT-ADCOST-ONCE-009 deleteOpexPeriod is exported and refuses a missing period before any delete (unchanged guard)", async () => {
    rows = [];
    await expect(deleteOpexPeriod(G(555), { ...SCOPE, subaccountId: G(7), type: 1, isLandLease: true } as never)).rejects.toThrow(/no longer exists/);
    expect(deleted).toEqual([]);
  });
});
