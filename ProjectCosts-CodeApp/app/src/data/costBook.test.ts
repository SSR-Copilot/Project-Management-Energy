/**
 * `loadCostAccounts` — the CAPEX chart of accounts.
 *
 * These exist because of a real failure. The first implementation derived the category from the
 * `vsb_accountcategory` picklist. Measured against VSBCloud_Dev on 15 Sep, **77 of 80 accounts
 * have that column empty** and the other 3 are `BoP`, so every account was dropped and the CAPEX
 * grid rendered nothing at all. The fixture below is the SHAPE OF THE REAL DATA, so the same
 * mistake cannot be made again without a red test.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CATEGORIES } from "@/features/costing/model";
import type { LeaseCostRow, LeasePeriodRow } from "@/features/periods/landLeaseRules";

/** One row as the generated service returns it. */
interface Row {
  vsb_capexaccountlistid: string;
  vsb_number?: string;
  vsb_name?: string;
  vsb_order?: number;
  _vsb_parentaccount_value?: string;
  vsb_accountcategory?: number;
}

let rows: Row[] = [];

/**
 * `fetchAll` by the label its caller passes.
 *
 * Every loader in `costBook.ts` names its query, so the round-trip test below can hand
 * `loadCostLines` a contract row and its cost rows separately. Anything not overridden falls
 * back to `rows`, which is what the account-tree tests have always used.
 */
let rowsByLabel: Record<string, unknown[]> = {};

/** The field bag the last `saveCostLine` sent to Dataverse. */
let saved: Record<string, unknown> = {};

/**
 * Every delete any write path issued, in order, as `table:id`.
 *
 * ORDER is the point, not just membership: `deleteCostLine` has to take a contract's children
 * before the contract itself, or an interrupted delete strands rows against a parent that is
 * already gone.
 */
let deleted: string[] = [];

/**
 * Every `vsb_costpaid` patch a write path issued.
 *
 * Separate from `deleted` because the relink reset is the one place a SAVE touches the paid
 * flag: `saveCostLine` also patches `vsb_cost` on the same table, and a test that counted all
 * updates could not tell the two apart.
 */
let costPaidUpdates: { id: string; paid: unknown }[] = [];

/** The options every `fetchAll` was called with, by label — so a test can assert the query. */
let queriedBy: Record<string, unknown[]> = {};

vi.mock("./client", () => ({
  fetchAll: async (label: string, _page: unknown, options: unknown) => {
    (queriedBy[label] ??= []).push(options);
    return rowsByLabel[label] ?? rows;
  },
}));

vi.mock("@/generated/services/Vsb_capexaccountlistsService", () => ({
  Vsb_capexaccountlistsService: { getAll: async () => ({ success: true, data: [] }) },
}));
vi.mock("@/generated/services/Vsb_capexprojectcontractsService", () => ({
  Vsb_capexprojectcontractsService: {
    getAll: async () => ({ success: true, data: [] }),
    create: async (fields: Record<string, unknown>) => {
      saved = fields;
      return { success: true, data: { vsb_capexprojectcontractid: "contract-1" } };
    },
    update: async (_id: string, fields: Record<string, unknown>) => {
      saved = fields;
      return { success: true, data: {} };
    },
    delete: async (id: string) => {
      deleted.push(`contract:${id}`);
      return { success: true, data: {} };
    },
  },
}));
vi.mock("@/generated/services/Vsb_capexcostsService", () => ({
  Vsb_capexcostsService: {
    getAll: async () => ({ success: true, data: [] }),
    create: async () => ({ success: true, data: { vsb_capexcostid: "cost-new" } }),
    update: async (id: string, fields: Record<string, unknown>) => {
      if ("vsb_costpaid" in fields) costPaidUpdates.push({ id, paid: fields.vsb_costpaid });
      return { success: true, data: {} };
    },
    delete: async (id: string) => {
      deleted.push(`cost:${id}`);
      return { success: true, data: {} };
    },
  },
}));
vi.mock("@/generated/services/Vsb_capexcommentsesService", () => ({
  Vsb_capexcommentsesService: {
    getAll: async () => ({ success: true, data: [] }),
    create: async () => ({ success: true, data: { vsb_capexcommentsid: "comment-new" } }),
    update: async () => ({ success: true, data: {} }),
    delete: async (id: string) => {
      deleted.push(`comment:${id}`);
      return { success: true, data: {} };
    },
  },
}));

vi.mock("@/generated/services/Vsb_landleaseprojectcostsService", () => ({
  Vsb_landleaseprojectcostsService: { getAll: async () => ({ success: true, data: [] }) },
}));

vi.mock("@/generated/services/Vsb_landleaseperiodsService", () => ({
  Vsb_landleaseperiodsService: { getAll: async () => ({ success: true, data: [] }) },
}));
vi.mock("@/generated/services/Vsb_landleasesubaccountsService", () => ({
  Vsb_landleasesubaccountsService: { getAll: async () => ({ success: true, data: [] }) },
}));
vi.mock("@/generated/services/Vsb_opexsubaccountsService", () => ({
  Vsb_opexsubaccountsService: { getAll: async () => ({ success: true, data: [] }) },
}));
vi.mock("@/generated/services/Vsb_opexprojectcostsService", () => ({
  Vsb_opexprojectcostsService: { getAll: async () => ({ success: true, data: [] }) },
}));
vi.mock("@/generated/services/Vsb_devicetypesinprojectsService", () => ({
  Vsb_devicetypesinprojectsService: { getAll: async () => ({ success: true, data: [] }) },
}));
vi.mock("@/generated/services/Vsb_projectstatesService", () => ({
  Vsb_projectstatesService: { getAll: async () => ({ success: true, data: [] }) },
}));
vi.mock("@/generated/services/Vsb_milestonesstandardassumptionsesService", () => ({
  Vsb_milestonesstandardassumptionsesService: {
    getAll: async () => ({ success: true, data: [] }),
  },
}));

vi.mock("@/generated/services/Vsb_countryinflationprofilesService", () => ({
  Vsb_countryinflationprofilesService: { getAll: async () => ({ success: true, data: [] }) },
}));
vi.mock("@/generated/services/TransactioncurrenciesService", () => ({
  TransactioncurrenciesService: { getAll: async () => ({ success: true, data: [] }) },
}));

const {
  contractLabel, loadCapexTotals, loadCapexCategories, loadCostAccounts, loadCostBook,
  loadCostLines, loadCountryInflationAreas, loadLandLeaseContracts,
  loadMilestoneDurations, loadProjectStates, resolvePayer,
  loadLandLeaseCostFlags, linkOpexChains, mapOpexRow, mapLandLeasePeriodRow, groupAllocations,
  AGGREGATION_VALUE, readAggregation, writeAggregation,
} = await import("./costBook");
const { deleteCostLine, saveCostLine } = await import("./capexWrites");

/**
 * The real VSBCloud_Dev hierarchy, transcribed from `pac org fetch`. Note that
 * `vsb_accountcategory` is absent on every row — that is not an omission in the fixture, it is
 * what the environment actually contains.
 */
function realShapedRows(): Row[] {
  return [
    { vsb_capexaccountlistid: "root", vsb_number: "00001", vsb_name: "Root" },
    // Level 1 — children of Root.
    { vsb_capexaccountlistid: "c0", vsb_number: "10000", vsb_name: "Wind Turbine / Panels", vsb_order: 1, _vsb_parentaccount_value: "root" },
    { vsb_capexaccountlistid: "c1", vsb_number: "10001", vsb_name: "Development Expenses", vsb_order: 2, _vsb_parentaccount_value: "root" },
    { vsb_capexaccountlistid: "c6", vsb_number: "10006", vsb_name: "Overleveraging", vsb_order: 4, _vsb_parentaccount_value: "root" },
    // `BoP` hangs off nothing at all.
    { vsb_capexaccountlistid: "bop", vsb_number: "10005", vsb_name: "BoP" },
    // Level 2 and level 3.
    { vsb_capexaccountlistid: "80000", vsb_number: "80000", vsb_name: "Turbine / PV Supply Agreement", vsb_order: 1, _vsb_parentaccount_value: "c0" },
    { vsb_capexaccountlistid: "80000_0", vsb_number: "80000_0", vsb_name: "Turbine / PV Supply Agreement", vsb_order: 1, _vsb_parentaccount_value: "80000" },
    { vsb_capexaccountlistid: "80001", vsb_number: "80001", vsb_name: "Additional WTG / PV Costs", vsb_order: 2, _vsb_parentaccount_value: "c0" },
    { vsb_capexaccountlistid: "80001_0", vsb_number: "80001_0", vsb_name: "Additional WTG / PV Costs", vsb_order: 1, _vsb_parentaccount_value: "80001" },
    { vsb_capexaccountlistid: "81000", vsb_number: "81000", vsb_name: "External planning costs (DEVEX)", vsb_order: 1, _vsb_parentaccount_value: "c1" },
    { vsb_capexaccountlistid: "81000_0", vsb_number: "81000_0", vsb_name: "Design works (DEVEX)", vsb_order: 1, _vsb_parentaccount_value: "81000" },
    // Under Overleveraging — must never reach the grid.
    { vsb_capexaccountlistid: "83000", vsb_number: "83000", vsb_name: "Overleveraging", vsb_order: 1, _vsb_parentaccount_value: "c6" },
  ];
}

beforeEach(() => { rows = realShapedRows(); });

describe("loadCostAccounts", () => {
  it("UT-BOOK-001 returns accounts even though vsb_accountcategory is empty on every row", async () => {
    // The regression test for the bug that shipped: filtering on the picklist emptied the grid.
    expect(rows.every((r) => r.vsb_accountcategory === undefined)).toBe(true);
    await expect(loadCostAccounts()).resolves.not.toHaveLength(0);
  });

  it("UT-BOOK-002 maps the category from the level-1 ancestor", async () => {
    const accounts = await loadCostAccounts();
    const byId = new Map(accounts.map((a) => [a.id, a]));

    expect(byId.get("80000")?.category).toBe(CATEGORIES.indexOf("Wind Turbine / Panels"));
    expect(byId.get("80000_0")?.category).toBe(CATEGORIES.indexOf("Wind Turbine / Panels"));
    expect(byId.get("81000_0")?.category).toBe(CATEGORIES.indexOf("Development Expenses"));
  });

  it("UT-BOOK-003 makes level 2 an account and level 3 its subaccount", async () => {
    const accounts = await loadCostAccounts();
    const byId = new Map(accounts.map((a) => [a.id, a]));

    expect(byId.get("80000")?.parentId).toBeUndefined();
    expect(byId.get("80000_0")?.parentId).toBe("80000");
  });

  it("UT-BOOK-004 drops Overleveraging and BoP entirely", async () => {
    const accounts = await loadCostAccounts();
    const ids = new Set(accounts.map((a) => a.id));

    expect(ids.has("83000")).toBe(false);
    expect(ids.has("bop")).toBe(false);
    // And the category rows themselves are not accounts.
    expect(ids.has("c0")).toBe(false);
    expect(ids.has("root")).toBe(false);
  });

  it("UT-BOOK-005 keeps each subaccount next to its parent account", async () => {
    // `gridRows` emits rows in array order, so an account and its subaccounts being adjacent
    // is what puts them together in the grid.
    const accounts = await loadCostAccounts();
    expect(accounts.map((a) => a.id)).toEqual([
      "80000", "80000_0", "80001", "80001_0", "81000", "81000_0",
    ]);
  });

  it("UT-BOOK-006 returns nothing when the root account is missing, rather than guessing", async () => {
    rows = rows.filter((r) => r.vsb_number !== "00001");
    await expect(loadCostAccounts()).resolves.toEqual([]);
  });

  it("UT-BOOK-007 orders by vsb_order, then by number", async () => {
    const first = rows.find((r) => r.vsb_capexaccountlistid === "80000") as Row;
    const second = rows.find((r) => r.vsb_capexaccountlistid === "80001") as Row;
    first.vsb_order = 9;
    second.vsb_order = 1;

    const accounts = await loadCostAccounts();
    expect(accounts.map((a) => a.id).slice(0, 4)).toEqual([
      "80001", "80001_0", "80000", "80000_0",
    ]);
  });
});

describe("contractLabel", () => {
  // The grid showed blank contract names because the mapping read `vsb_description` only.
  // Measured on VSBCloud_Dev: `vsb_description` is empty on every contract in the project and
  // the real text lives in `vsb_name`.
  it("UT-BOOK-008 falls back to vsb_name when the description is absent", () => {
    expect(contractLabel(undefined, "Gesamt (CAPEX_after_FID) (59018_0_47110101)"))
      .toBe("Gesamt (CAPEX_after_FID) (59018_0_47110101)");
  });

  it("UT-BOOK-009 falls back when the description is blank or whitespace, not just null", () => {
    expect(contractLabel("", "Test 100")).toBe("Test 100");
    expect(contractLabel("   ", "Test 100")).toBe("Test 100");
  });

  it("UT-BOOK-010 prefers the description when it has content", () => {
    expect(contractLabel("Turbine supply", "Test 100")).toBe("Turbine supply");
  });

  it("UT-BOOK-011 returns an empty string when neither is set, rather than undefined", () => {
    // The grid renders this straight into a cell; `undefined` would print as "undefined".
    expect(contractLabel(undefined, undefined)).toBe("");
  });
});

describe("resolvePayer", () => {
  // `Coalesce(contract.'Cost Type', mapping.'DevCo/SPV')` — CapexScreenCode.txt:7196.
  // Measured live: `vsb_costtype` is set on the project's contracts, but a blank must fall
  // through to the sub-account mapping rather than silently reading as SPV.
  it("UT-BOOK-012 uses the contract's own cost type when it is set", () => {
    expect(resolvePayer(952850001, "SPV")).toBe("DevCo");
    expect(resolvePayer(952850002, "DevCo")).toBe("SPV");
  });

  it("UT-BOOK-013 falls back to the sub-account mapping when the cost type is blank", () => {
    expect(resolvePayer(undefined, "DevCo")).toBe("DevCo");
    expect(resolvePayer(undefined, "SPV")).toBe("SPV");
  });

  it("UT-BOOK-014 falls back to the mapping for the None option too", () => {
    // 952850000 is `None`, which is not a payer — it must not read as SPV by accident.
    expect(resolvePayer(952850000, "DevCo")).toBe("DevCo");
  });

  it("UT-BOOK-015 defaults to SPV only when neither is known", () => {
    expect(resolvePayer(undefined, undefined)).toBe("SPV");
  });
});

describe("loadLandLeaseCostFlags", () => {
  // `LandLeaseCostScreenCode.txt:1050-1063` / `:1001-1014` — the Allocation and OTP columns'
  // source fields, read straight off the Land Lease Project Cost header.
  const PROJECT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  interface FlagRow {
    vsb_landleaseprojectcostid: string;
    vsb_allwtgallocated?: boolean;
    vsb_duedateonetimepayment?: string;
    vsb_amountonetimepayment?: number;
  }

  /**
   * The header rows, under the ONE Land Lease reader's query label.
   *
   * `loadLandLeaseCostFlags` reads through `loadLeaseBook` (`./landLease.ts`) rather than
   * issuing a second, narrower header query of its own — see `costBook.ts`'s Land Lease block.
   */
  const setRows = (flagRows: FlagRow[]) => {
    rowsByLabel = { "list Land Lease project costs": flagRows };
    rows = [];
  };

  // Real-shaped ids: `loadLeaseBook` scopes its period and allocation queries by the header ids
  // the first query returned, and `guid()` rejects anything that is not a GUID.
  const H1 = "6f189e32-3c0a-f011-bae2-6045bd882926";
  const H2 = "29377394-d40a-f011-bae2-6045bd882926";
  const H3 = "a597c465-440a-f011-bae2-6045bd882926";

  it("UT-BOOK-016 keys the flags by the header id a period's Project Cost points at", async () => {
    setRows([
      {
        vsb_landleaseprojectcostid: H1, vsb_allwtgallocated: true,
        vsb_duedateonetimepayment: "2027-01-01", vsb_amountonetimepayment: 500,
      },
      { vsb_landleaseprojectcostid: H2, vsb_allwtgallocated: false },
    ]);

    const flags = await loadLandLeaseCostFlags(PROJECT_ID);
    expect(flags.get(H1)).toEqual({ allWtgAllocated: true, hasOneTimePayment: true });
    expect(flags.get(H2)).toEqual({ allWtgAllocated: false, hasOneTimePayment: false });
  });

  it("UT-BOOK-017 requires BOTH the due date and the amount for OTP, not either alone", async () => {
    // Same guard the canvas uses: `Not(IsBlank(Due Date)) && Not(IsBlank(Amount))`.
    setRows([
      { vsb_landleaseprojectcostid: H1, vsb_duedateonetimepayment: "2027-01-01" },
      { vsb_landleaseprojectcostid: H2, vsb_amountonetimepayment: 500 },
      { vsb_landleaseprojectcostid: H3 },
    ]);

    const flags = await loadLandLeaseCostFlags(PROJECT_ID);
    expect(flags.get(H1)?.hasOneTimePayment).toBe(false);
    expect(flags.get(H2)?.hasOneTimePayment).toBe(false);
    expect(flags.get(H3)?.hasOneTimePayment).toBe(false);
  });

  it("UT-BOOK-018 treats an unset AllWTGAllocated as false, not as missing", async () => {
    setRows([{ vsb_landleaseprojectcostid: H1 }]);

    const flags = await loadLandLeaseCostFlags(PROJECT_ID);
    expect(flags.get(H1)?.allWtgAllocated).toBe(false);
  });
});

describe("mapOpexRow", () => {
  // `vsb_opexprojectcosts` — both O&M and Other OPEX rows are this same table; the mapper takes
  // the mode and the already-resolved group name (device or sub-account) as arguments, since
  // both are derived from OTHER tables the loader has already joined by the time it calls this.
  const BASE_ROW = {
    vsb_opexprojectcostid: "row-1",
    vsb_description: "Turbine service contract",
    vsb_startdate: "2027-08-30T00:00:00Z",
    vsb_opexprojectdurationyears: 5,
    vsb_opexprojectdurationmonths: 3,
    // NOT `vsb_currencyname`: that is the FetchXML-era lookup alias, not a Web API property, and
    // it read back EMPTY on every row on VSBCloud_Dev. The loader resolves `_vsb_currency_value`
    // against `transactioncurrencies` and hands the NAME to this mapper.
    _vsb_currency_value: "b8b1e37d-1f57-ea11-a811-000d3a4a9d2f",
    vsb_fixcosts: 12_000,
    vsb_ofrevenues: 2.5,
    vsb_eurmwh: 4.1,
    vsb_eurmw: 0,
    vsb_eurwtg: 67_500,
    vsb_aggregation: AGGREGATION_VALUE.sum,
    vsb_distributionfrequency: 1,
    vsb_threshold: true,
    vsb_useinflationprofile: true,
    vsb_usecountryinflationprofile: false,
    vsb_inflationprofile: 2,
    vsb_inflationstartyear: 2028,
    vsb_alignwithprojectduration: true,
    vsb_externalcontract: false,
    vsb_isstandardcontract: false,
  };

  it("UT-BOOK-019 maps a plain OPEX row into a sane CostPeriod", () => {
    const period = mapOpexRow(BASE_ROW, "V150-6.0", "om", "Euro");

    expect(period).toMatchObject({
      id: "row-1",
      group: "V150-6.0",
      mode: "om",
      description: "Turbine service contract",
      // The date-only field arrives with a time component; only the date survives.
      startDate: "2027-08-30",
      years: 5,
      months: 3,
      currency: "Euro",
      fixed: 12_000,
      perWtg: 67_500,
      aggregation: "SUM",
      threshold: true,
      inflation: true,
      countryInflation: false,
      inflationPercent: 2,
      inflationYear: 2028,
      align: true,
      external: false,
      standard: false,
    });
  });

  it("UT-BOOK-020 reads the MAX aggregation choice, not just SUM", () => {
    const period = mapOpexRow(
      { ...BASE_ROW, vsb_aggregation: AGGREGATION_VALUE.max }, "Other OPEX Sub", "other",
    );
    expect(period.aggregation).toBe("MAX");
    expect(period.mode).toBe("other");
  });

  it("UT-BOOK-021 defaults every absent numeric/boolean field rather than leaving it undefined", () => {
    const period = mapOpexRow(
      { vsb_opexprojectcostid: "bare" }, "Some Group", "om",
    );
    expect(period).toMatchObject({
      description: "", startDate: "", years: 0, months: 0, currency: "",
      // The five MONEY columns default to NULL, not 0: `'Fix Costs': Value(txt.Value)` and
      // `Value("")` is `Blank()`, so an unset column means the user typed nothing.
      fixed: null, revenue: null, perMwh: null, perMw: null, perWtg: null,
      aggregation: "SUM", frequency: 1,
      inflation: false, countryInflation: false, inflationYear: 0, inflationPercent: 0,
      threshold: false, align: false, external: false, standard: false,
    });
    // O&M/Other OPEX periods never carry the Land Lease-only flags.
    expect(period.allWtgAllocated).toBeUndefined();
    expect(period.hasOneTimePayment).toBeUndefined();
  });

  it("UT-BOOK-072 reads the MIN aggregation choice rather than collapsing it to SUM", () => {
    // MEASURED, VSBCloud_Dev 16 Sep: FOUR live `vsb_opexprojectcosts` rows carry MIN
    // (`Test - 2`, `Test - 4`, `Test O&M Contract N149-5.7 Period 3`, `CCC`) against 952 SUM and
    // 18 MAX. While the union was `"SUM" | "MAX"` those four read back as SUM and a save
    // rewrote them.
    expect(
      mapOpexRow({ ...BASE_ROW, vsb_aggregation: AGGREGATION_VALUE.min }, "g", "om").aggregation,
    ).toBe("MIN");
    expect(readAggregation(AGGREGATION_VALUE.min)).toBe("MIN");
    expect(readAggregation(AGGREGATION_VALUE.max)).toBe("MAX");
    expect(readAggregation(AGGREGATION_VALUE.sum)).toBe("SUM");
    // An option value the org does not have is the column's own default, not a crash.
    expect(readAggregation(999)).toBe("SUM");
    expect(readAggregation(undefined)).toBe("SUM");
  });

  it("UT-BOOK-073 writes back exactly the value it read, for all three choices", () => {
    for (const value of [AGGREGATION_VALUE.sum, AGGREGATION_VALUE.max, AGGREGATION_VALUE.min]) {
      expect(writeAggregation(readAggregation(value))).toBe(value);
    }
  });

  it("UT-BOOK-074 maps the threshold TYPE and the Individual figure, which are two columns", () => {
    // MEASURED, 16 Sep: all 8 rows with a threshold have `vsb_thresholdindividual` 222.00 while
    // `vsb_eurmwh` is 33.00 or 990.00 — they are not the same number and never were. Both were
    // `$select`ed and then dropped, so a p75/p90 choice read back as Individual and the
    // Individual figure read back as EUR/MWh.
    const period = mapOpexRow(
      {
        ...BASE_ROW,
        vsb_threshold: true,
        vsb_thresholdtype: 952850000,
        vsb_thresholdindividual: 222,
        vsb_eurmwh: 33,
      },
      "g", "om",
    );
    expect(period.thresholdType).toBe(952850000);
    expect(period.thresholdIndividual).toBe(222);
    expect(period.perMwh).toBe(33);
  });
});

/**
 * `mapLandLeasePeriodRow` now takes the rows `loadLeaseBook` (`./landLease.ts`) produces, not a
 * second, narrower query's raw Dataverse shape. That is the point of the change: there is ONE
 * Land Lease reader, so the money columns arrive already null-correct and the header already
 * carries its Land Owner, its three one-time payments and its WTG allocations.
 */
describe("mapLandLeasePeriodRow", () => {
  const PERIOD_ROW: LeasePeriodRow = {
    id: "period-1",
    projectCostId: "header-1",
    // The canvas table's Description column is `Text: =ThisItem.Name` — the PERIOD's name, which
    // is what carries the `… - 2` chain numbering. The header's description is the CONTRACT name.
    name: "Location lease contract - 2",
    period: 952850001,
    startDate: "2027-01-01",
    durationYears: 10,
    durationMonths: 0,
    fixedCosts: 5_000,
    // A STORED zero and a BLANK, side by side, because the grid prints the first and blanks the
    // second — `?? 0` used to make them indistinguishable.
    percentOfRevenues: 0,
    eurPerMwh: null,
    eurPerMw: 1_200,
    eurPerWtg: null,
    aggregation: AGGREGATION_VALUE.sum,
    distributionFrequency: 12,
  };
  const HEADER: LeaseCostRow = {
    id: "header-1",
    name: "Project-Leaseholders-Location lease contract",
    subaccountId: "sub-1",
    description: "Location lease contract",
    landOwner: "Schmidt",
    currencyId: "6b1e4d8f-1f57-ea11-a811-000d3a4a9d2f",
    currencyName: "Polish Zloty",
    secured: 952850000,
    allWtgAllocated: true,
    isStandardContract: false,
    isStartDateStandardAssumption: false,
    amountOneTimePayment: 10_000,
    amountOneTimePayment2: 2_500,
    amountOneTimePayment3: null,
    dueDateOneTimePayment: "06/2027",
    dueDateOneTimePayment2: "06/2028",
    dueDateOneTimePayment3: null,
    useInflationProfile: true,
    useCountryInflationProfile: true,
    inflationProfile: 3,
    inflationCountryArea: null,
    inflationStartYear: 2029,
    createdOn: "2025-01-01T00:00:00Z",
  };

  it("UT-BOOK-022 pulls currency and inflation off the HEADER, not the period row", () => {
    const period = mapLandLeasePeriodRow(PERIOD_ROW, HEADER, "Leaseholders", "Polish Zloty");

    expect(period).toMatchObject({
      id: "period-1",
      group: "Leaseholders",
      mode: "land",
      // The PERIOD's `vsb_name`, which is what the canvas table shows …
      description: "Location lease contract - 2",
      // … while the header's description is the CONTRACT this period belongs to.
      contractName: "Location lease contract",
      contractId: "header-1",
      periodIndex: 2,
      currency: "Polish Zloty",
      inflation: true,
      countryInflation: true,
      inflationPercent: 3,
      inflationYear: 2029,
      // Land Lease has no threshold/align/external columns at all.
      threshold: false,
      align: false,
      external: false,
      secured: true,
      allWtgAllocated: true,
      hasOneTimePayment: true,
    });
  });

  it("UT-BOOK-023 defaults every header-sourced field when the header failed to join", () => {
    const period = mapLandLeasePeriodRow(PERIOD_ROW, undefined, "Unassigned Location");
    expect(period).toMatchObject({
      contractName: "", currency: "", inflation: false, countryInflation: false,
      secured: false, allWtgAllocated: false, hasOneTimePayment: false,
    });
    // The period's OWN fields still come through even with no header.
    expect(period.description).toBe("Location lease contract - 2");
    expect(period.fixed).toBe(5_000);
    expect(period.perMw).toBe(1_200);
  });

  it("UT-BOOK-024 requires BOTH the due date and the amount for OTP, same as the header flags", () => {
    const period = mapLandLeasePeriodRow(
      PERIOD_ROW, { ...HEADER, amountOneTimePayment: null }, "Leaseholders",
    );
    expect(period.hasOneTimePayment).toBe(false);
  });

  it("UT-BOOK-068 keeps a BLANK rate blank and a STORED zero zero", () => {
    // `landLeaseRules.formatGrouped` prints a stored `0` and blanks a null, and
    // `firstPeriodHasRate` — the `Add Period` gate — asks whether any rate is non-blank. The
    // `?? 0` this replaces printed `0` in five columns the canvas leaves empty on the majority of
    // rows (measured: 344 of 517 have no Fix Costs, 494 no EUR/MWh) and pinned that gate open.
    const period = mapLandLeasePeriodRow(PERIOD_ROW, HEADER, "Leaseholders");
    expect(period.revenue).toBe(0);
    expect(period.perMwh).toBeNull();
    expect(period.perWtg).toBeNull();
    expect(period.fixed).toBe(5_000);
  });

  it("UT-BOOK-069 carries the header's Land Owner and all three one-time payments", () => {
    // None of the seven columns was selected or mapped before, so the panel's whole One-Time
    // Payment section had no source.
    const period = mapLandLeasePeriodRow(PERIOD_ROW, HEADER, "Leaseholders");
    expect(period).toMatchObject({
      landOwner: "Schmidt",
      amountOneTimePayment: 10_000,
      amountOneTimePayment2: 2_500,
      amountOneTimePayment3: null,
      dueDateOneTimePayment: "06/2027",
      dueDateOneTimePayment2: "06/2028",
      dueDateOneTimePayment3: null,
    });
  });

  it("UT-BOOK-070 carries the contract's WTG allocations onto every period under it", () => {
    const period = mapLandLeasePeriodRow(
      PERIOD_ROW, HEADER, "Leaseholders", "Euro", ["gen-1", "gen-2"],
    );
    expect(period.allocatedGeneratorIds).toEqual(["gen-1", "gen-2"]);
    // No allocations is an EMPTY list, not `undefined` — `undefined` means "the caller has no
    // opinion" to `saveLandLeasePeriod`, which then leaves the allocation rows alone.
    expect(mapLandLeasePeriodRow(PERIOD_ROW, HEADER, "Leaseholders").allocatedGeneratorIds)
      .toEqual([]);
  });
});

describe("groupAllocations", () => {
  it("UT-BOOK-071 groups the allocation rows by header, ids ascending", () => {
    // Ascending so two reads of the same set produce the same array and `useCostBook`'s save
    // diff does not see a change where there is none.
    const grouped = groupAllocations([
      { id: "a1", projectCostId: "h1", generatorInProjectId: "g2" },
      { id: "a2", projectCostId: "h1", generatorInProjectId: "g1" },
      { id: "a3", projectCostId: "h2", generatorInProjectId: "g3" },
      // A row with no header or no generator is not an allocation of anything.
      { id: "a4", projectCostId: null, generatorInProjectId: "g4" },
      { id: "a5", projectCostId: "h2", generatorInProjectId: null },
    ]);
    expect(grouped.get("h1")).toEqual(["g1", "g2"]);
    expect(grouped.get("h2")).toEqual(["g3"]);
    expect(grouped.size).toBe(2);
  });
});

/* ════════════════════════════════════════════════════════ the period chain ══ */

/**
 * The `Parent Cost` chain — the model the first pass at these screens did not port at all.
 *
 * The fixture is REAL DATA. Quellendorf I (`ac3168e6-2b7c-ef11-ac20-6045bda08851`, project
 * number 9999509) in VSBCloud_Dev, read with `pac org fetch` on 16 Sep: three O&M chains, one
 * per WTG type, each a head called `Initialized O&M Contract` plus four children called
 * `Initialized O&M Contract - 2` … `- 5`, every child's `vsb_parentcost` pointing at ITS HEAD
 * and not at the period before it. 15 rows, 12 of them children.
 *
 * Getting this wrong is not cosmetic. Treating every row as a standalone sibling — which is what
 * the loader did — makes a five-period contract look like five contracts, offers Delete on all
 * of them, and lets an edit to period 3 skip the cascade the canvas performs onto periods 2..5.
 */
describe("linkOpexChains", () => {
  const head = (id: string, device: string) => ({
    vsb_opexprojectcostid: id,
    vsb_name: "Quellendorf I-Initialized O&M Contract",
    vsb_description: "Initialized O&M Contract",
    _vsb_devicetypeinproject_value: device,
  });
  const child = (id: string, headId: string, device: string, n: number) => ({
    vsb_opexprojectcostid: id,
    vsb_name: `Quellendorf I-Initialized O&M Contract - ${n}`,
    vsb_description: `Initialized O&M Contract - ${n}`,
    _vsb_parentcost_value: headId,
    _vsb_devicetypeinproject_value: device,
  });

  it("UT-BOOK-060 numbers a chain head 1 and its children 2..N in Name order", () => {
    // Deliberately shuffled: the canvas orders by `Name` ascending
    // (`OpexCostScreenCode.txt:558-565`), not by the order rows arrive in.
    const places = linkOpexChains([
      child("c4", "h1", "wtg-1630", 4),
      head("h1", "wtg-1630"),
      child("c2", "h1", "wtg-1630", 2),
      child("c5", "h1", "wtg-1630", 5),
      child("c3", "h1", "wtg-1630", 3),
    ]);

    expect(places.get("h1")).toEqual({
      contractId: "h1", contractName: "Initialized O&M Contract", periodIndex: 1,
    });
    expect(["c2", "c3", "c4", "c5"].map((id) => places.get(id)?.periodIndex)).toEqual([2, 3, 4, 5]);
    // Every period of a chain reports the SAME contract, which is what lets the screen show one
    // cost with five periods instead of five costs.
    for (const id of ["h1", "c2", "c3", "c4", "c5"]) {
      expect(places.get(id)?.contractId).toBe("h1");
      expect(places.get(id)?.contractName).toBe("Initialized O&M Contract");
    }
  });

  it("UT-BOOK-061 keeps three device chains apart", () => {
    const places = linkOpexChains([
      head("h1630", "wtg-1630"), child("c1630", "h1630", "wtg-1630", 2),
      head("h1632", "wtg-1632"), child("c1632", "h1632", "wtg-1632", 2),
      head("h1645", "wtg-1645"), child("c1645", "h1645", "wtg-1645", 2),
    ]);
    expect(places.get("c1630")?.contractId).toBe("h1630");
    expect(places.get("c1632")?.contractId).toBe("h1632");
    expect(places.get("c1645")?.contractId).toBe("h1645");
    // All three are period 2 of their own contract — the index is per chain, not per project.
    expect(["c1630", "c1632", "c1645"].map((id) => places.get(id)?.periodIndex))
      .toEqual([2, 2, 2]);
  });

  it("UT-BOOK-062 promotes an ORPHAN to its own contract rather than dropping it", () => {
    // Reachable in real data: the loader filters `statecode eq 0`, so a deactivated head leaves
    // its children pointing at a row this query never returned. A dropped cost row is the exact
    // failure this codebase has already had once, so the orphan stays visible and editable.
    const places = linkOpexChains([child("orphan", "gone", "wtg-1630", 2)]);
    expect(places.get("orphan")).toEqual({
      contractId: "orphan", contractName: "Initialized O&M Contract - 2", periodIndex: 1,
    });
  });
});

/* ═══════════════════════════════════════════════════════ the period loaders ══ */

/**
 * `loadCostBook(projectId)` with no category — what the three period screens actually call.
 *
 * The queries here are asserted, not just their results: two of the columns this used to ask
 * for were wrong in ways that are invisible until a user opens the screen.
 */
describe("loadPeriods", () => {
  // Real VSBCloud_Dev ids: `lookupEq`/`guid` reject anything that is not a GUID.
  const QUELLENDORF = "ac3168e6-2b7c-ef11-ac20-6045bda08851";
  const PROJECT_NEW_DATA = "910d8ed0-282a-ef11-840a-6045bd9e5ce7";
  const EURO = "b8b1e37d-1f57-ea11-a811-000d3a4a9d2f";
  const ZLOTY = "6b1e4d8f-1f57-ea11-a811-000d3a4a9d2f";
  // `Locations`, order 1 — a REAL `vsb_landleasesubaccounts` row, not a pseudo-header.
  const LOCATIONS = "cfc603b0-d2d0-ee11-9079-000d3abd8704";
  const LEASEHOLDERS = "ec862e59-d3d0-ee11-9079-000d3ab6f27e";
  const OM_SUB = "61a30faa-b7e1-eddc-a5b5-fc1376f538f5";
  // Two of the twelve `Locations` headers on Project New Data, by their real ids.
  const HDR_COST101 = "6f189e32-3c0a-f011-bae2-6045bd882926";
  const HDR_TEST1002 = "29377394-d40a-f011-bae2-6045bd882926";
  const HDR_EMPTY = "a597c465-440a-f011-bae2-6045bd882926";

  beforeEach(() => { rows = []; rowsByLabel = {}; queriedBy = {}; });

  it("UT-BOOK-063 never asks for vsb_currencyname, and resolves the currency lookup instead", async () => {
    /*
     * `vsb_currencyname` is the FetchXML-era lookup alias, not a Web API property. Measured on
     * VSBCloud_Dev, 16 Sep: `pac org fetch` for `vsb_currencyname` returns rows with the column
     * EMPTY, while `vsb_currency` on the same rows returns "Euro". `$select`ing it is at best a
     * blank Currency column on every period and at worst a 400 that fails the whole screen.
     */
    rowsByLabel = {
      "list OPEX project costs": [
        { vsb_opexprojectcostid: "h1", vsb_description: "Service", _vsb_currency_value: EURO,
          _vsb_subaccount_value: OM_SUB },
      ],
      "list OPEX subaccounts": [{ vsb_opexsubaccountid: OM_SUB, vsb_name: "Other Sub" }],
      "list transaction currencies for periods": [
        { transactioncurrencyid: EURO, currencyname: "Euro" },
      ],
    };

    const book = await loadCostBook(QUELLENDORF);

    const asked = queriedBy["list OPEX project costs"] ?? [];
    const select = (asked[0] as { select: string[] }).select;
    expect(select).not.toContain("vsb_currencyname");
    expect(select).toContain("_vsb_currency_value");
    expect(select).toContain("_vsb_parentcost_value");
    expect(select).toContain("vsb_inflationcountryarea");
    expect(book.periods[0]?.currency).toBe("Euro");
  });

  it("UT-BOOK-064 returns OPEX periods in the canvas gallery order", async () => {
    /*
     * `Sort(Sort(rows, 'Start Date', Ascending), Description, Ascending)`
     * (`OpexCostScreenCode.txt:1452-1464`). Power Fx's `Sort` is stable, so DESCRIPTION is the
     * outer key and start date only breaks its ties — which is the opposite of what
     * "sorted by start date" would produce, and reorders a whole card.
     */
    rowsByLabel = {
      "list OPEX project costs": [
        { vsb_opexprojectcostid: "b", vsb_description: "Beta", vsb_startdate: "2020-01-01",
          _vsb_subaccount_value: OM_SUB },
        { vsb_opexprojectcostid: "a2", vsb_description: "Alpha", vsb_startdate: "2031-01-01",
          _vsb_subaccount_value: OM_SUB },
        { vsb_opexprojectcostid: "a1", vsb_description: "Alpha", vsb_startdate: "2026-01-01",
          _vsb_subaccount_value: OM_SUB },
      ],
      "list OPEX subaccounts": [{ vsb_opexsubaccountid: OM_SUB, vsb_name: "Other Sub" }],
    };

    const book = await loadCostBook(QUELLENDORF);
    expect(book.periods.map((p) => p.id)).toEqual(["a1", "a2", "b"]);
  });

  it("UT-BOOK-065 keeps two Land Lease contracts under ONE sub-account apart", async () => {
    /*
     * Measured on Project New Data (`910d8ed0-…`), 16 Sep: TWELVE `vsb_landleaseprojectcosts`
     * headers under the single `Locations` sub-account. `group` therefore cannot identify a
     * contract, which is why every period carries `contractId` — and why a save that looked up
     * "the one header for this location" was picking one of twelve at random.
     */
    rowsByLabel = {
      "list Land Lease subaccounts": [
        { vsb_landleasesubaccountid: LOCATIONS, vsb_name: "Locations" },
      ],
      // `loadLandLeasePeriods` reads through `loadLeaseBook` (`./landLease.ts`), so these are
      // that reader's query labels — there is only one Land Lease reader now.
      "list Land Lease project costs": [
        { vsb_landleaseprojectcostid: HDR_COST101, _vsb_subaccount_value: LOCATIONS,
          vsb_description: "Cost 101", _vsb_currency_value: ZLOTY, vsb_secured: 952850000 },
        { vsb_landleaseprojectcostid: HDR_TEST1002, _vsb_subaccount_value: LOCATIONS,
          vsb_description: "Test 1002", vsb_allwtgallocated: true },
      ],
      "list Land Lease periods": [
        { vsb_landleaseperiodid: "p-a1", _vsb_projectcost_value: HDR_COST101,
          vsb_name: "Cost 101", vsb_period: 952850000, vsb_startdate: "2027-01-01" },
        { vsb_landleaseperiodid: "p-b1", _vsb_projectcost_value: HDR_TEST1002,
          vsb_name: "Test 1002", vsb_period: 952850000, vsb_startdate: "2027-01-01" },
        { vsb_landleaseperiodid: "p-b2", _vsb_projectcost_value: HDR_TEST1002,
          vsb_name: "Test 1002 - 2", vsb_period: 952850001, vsb_startdate: "2032-01-01" },
      ],
      "list transaction currencies for Land Lease": [
        { transactioncurrencyid: ZLOTY, currencyname: "Polish Zloty" },
      ],
      "list Land Lease WTG allocations": [
        { vsb_landleaseallocationwtgid: "alloc-1", _vsb_projectcost_value: HDR_TEST1002,
          _vsb_generatorinproject_value: "gen-2" },
        { vsb_landleaseallocationwtgid: "alloc-2", _vsb_projectcost_value: HDR_TEST1002,
          _vsb_generatorinproject_value: "gen-1" },
      ],
    };

    const book = await loadCostBook(PROJECT_NEW_DATA);
    const byId = new Map(book.periods.map((p) => [p.id, p]));

    expect(byId.get("p-a1")?.contractId).toBe(HDR_COST101);
    expect(byId.get("p-b1")?.contractId).toBe(HDR_TEST1002);
    expect(byId.get("p-b2")?.contractId).toBe(HDR_TEST1002);
    // All three sit on the SAME card, and only `contractId` tells them apart.
    expect(new Set(book.periods.map((p) => p.group))).toEqual(new Set(["Locations"]));
    expect(byId.get("p-b2")?.periodIndex).toBe(2);
    // Header-owned fields follow the header the period actually belongs to.
    expect(byId.get("p-a1")?.currency).toBe("Polish Zloty");
    expect(byId.get("p-a1")?.secured).toBe(true);
    expect(byId.get("p-b1")?.currency).toBe("");
    expect(byId.get("p-b1")?.allWtgAllocated).toBe(true);
    // The contract's WTG allocations reach every period under it, ids ascending. Nothing read
    // `vsb_landleaseallocationwtgs` at all before, so the picker had no options and the PV/Wind
    // allocation clause of `canSaveLandLease` could only be met by "allocate to all".
    expect(byId.get("p-b1")?.allocatedGeneratorIds).toEqual(["gen-1", "gen-2"]);
    expect(byId.get("p-b2")?.allocatedGeneratorIds).toEqual(["gen-1", "gen-2"]);
    expect(byId.get("p-a1")?.allocatedGeneratorIds).toEqual([]);
  });

  it("UT-BOOK-066 reports a Land Lease contract that has no periods yet", async () => {
    /*
     * "Add Contract Type" creates a header, and the first period is saved with it — but a header
     * whose periods were all deleted stays, and 19 of Project New Data's 27 headers are in
     * exactly that state today. The book's `periods` cannot show them, so the screen gets them
     * from `loadLandLeaseContracts`.
     */
    rowsByLabel = {
      "list Land Lease subaccounts": [
        { vsb_landleasesubaccountid: LEASEHOLDERS, vsb_name: "Leaseholders" },
      ],
      "list Land Lease project costs": [
        { vsb_landleaseprojectcostid: HDR_EMPTY, _vsb_subaccount_value: LEASEHOLDERS,
          vsb_description: "Trecjjj", vsb_secured: 952850000, vsb_allwtgallocated: true,
          vsb_duedateonetimepayment: "2027-06-01", vsb_amountonetimepayment: 10_000 },
      ],
    };

    await expect(loadLandLeaseContracts(PROJECT_NEW_DATA)).resolves.toEqual([{
      id: HDR_EMPTY,
      group: "Leaseholders",
      name: "Trecjjj",
      standard: false,
      secured: true,
      allWtgAllocated: true,
      hasOneTimePayment: true,
    }]);
  });

  it("UT-BOOK-067 lists the country's inflation AREAS, deduped and sorted", async () => {
    // `Distinct(Filter('Country Inflation Profiles', Country = project's country).Area, Area)` —
    // `OpexCostScreenCode.txt:7622`. One row per YEAR, so the same area repeats many times; the
    // live values are exactly these two strings (`vsb_inflationcountryarea` on 4 of 982 rows).
    rowsByLabel = {
      "list country inflation areas": [
        { vsb_countryinflationprofileid: "1", vsb_area: "North" },
        { vsb_countryinflationprofileid: "2", vsb_area: "Centre - North" },
        { vsb_countryinflationprofileid: "3", vsb_area: "North" },
        { vsb_countryinflationprofileid: "4", vsb_area: "" },
      ],
    };
    await expect(loadCountryInflationAreas("0d3a466a-2b7c-ef11-ac20-000d3a466ab7"))
      .resolves.toEqual(["Centre - North", "North"]);
    // No country selected means no query at all, not a query for every area in the org.
    await expect(loadCountryInflationAreas(undefined)).resolves.toEqual([]);
    expect(queriedBy["list country inflation areas"]).toHaveLength(1);
  });
});

/* ══════════════════════════════════════════════════════════════ round trip ══ */

/**
 * Save -> reload, through the real write path and the real read path.
 *
 * This is the test the reported bug needed and did not have. `saveCostLine` simply never put
 * `vsb_byclusterjson` or `vsb_bystartenddatejson` in its field bag, so the Select Cluster and
 * Start/End Date controls had nowhere to persist; and `loadCostLines` scanned the cluster JSON
 * with a bare `\d+` regex, which matched the digits in the KEY names and read every populated
 * contract back as all five clusters. Either defect alone looks to the user like "the panel is
 * not saving". Asserting the columns in isolation would not have caught the pair — only driving
 * the write's own output back into the reader does.
 */
describe("Add/Edit Costs panel round trip", () => {
  // `lookupEq`/`guid` reject anything that is not a real GUID, so the fixture ids are real ones.
  // The project is Wirmighausen in VSBCloud_Dev.
  const PROJECT_ID = "9f5aade5-2b7c-ef11-ac20-000d3a466ab7";
  const SUBACCOUNT_ID = "11111111-2222-3333-4444-555555555555";
  const CONTRACT_ID = "66666666-7777-8888-9999-aaaaaaaaaaaa";

  const CLUSTER_LINE = {
    id: CONTRACT_ID,
    accountId: SUBACCOUNT_ID,
    description: "Grid connection works",
    payer: "DevCo" as const,
    depreciation: true,
    vat: false,
    standard: false,
    distribution: "equal" as const,
    equalMode: "cluster" as const,
    distributionScheme: "percent" as const,
    startDate: "",
    endDate: "",
    frequency: 3,
    clusters: [2, 4],
    payments: [],
    comments: [],
    totalCost: 1_000,
  };

  /** `Project States`, real ids and orders from VSBCloud_Dev (16 Sep). */
  const CLUSTER_2 = "d25492de-d18e-ef11-ac21-000d3a4c04ca";
  const CLUSTER_3 = "6335fbe4-d18e-ef11-ac20-7c1e527110be";
  const projectStateRows = () => [
    { vsb_projectstateid: "b133498e-78ef-ef11-be20-000d3a22ea8e", vsb_name: "Draft", vsb_order: 0 },
    { vsb_projectstateid: CLUSTER_2, vsb_name: "Cluster 2", vsb_order: 2 },
    { vsb_projectstateid: CLUSTER_3, vsb_name: "Cluster 3", vsb_order: 3 },
  ];

  /**
   * What Dataverse does with a write payload before the next read sees it.
   *
   * `vsb_LinkedCluster@odata.bind` is the WRITE form; the reader gets
   * `_vsb_linkedcluster_value`. A round trip that skipped this step would be asserting that our
   * writer and our reader agree on a key neither side actually exchanges. `null` disassociates,
   * i.e. the read form comes back absent.
   */
  function applyBinds(fields: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (!key.endsWith("@odata.bind")) { out[key] = value; continue; }
      if (key !== "vsb_LinkedCluster@odata.bind") continue;
      const id = typeof value === "string"
        ? /\(([^)]+)\)/.exec(value)?.[1]
        : undefined;
      if (id) out._vsb_linkedcluster_value = id;
    }
    return out;
  }

  /** Feeds whatever `saveCostLine` wrote back through `loadCostLines`. */
  async function reload(fields: Record<string, unknown>) {
    rowsByLabel = {
      "list CAPEX project contracts": [{
        vsb_capexprojectcontractid: CONTRACT_ID,
        _vsb_account_value: SUBACCOUNT_ID,
        ...applyBinds(fields),
      }],
      "list CAPEX costs for the cost book": [],
      "list project states": projectStateRows(),
    };
    const lines = await loadCostLines(PROJECT_ID, [SUBACCOUNT_ID]);
    return lines[0]!;
  }

  beforeEach(() => {
    saved = {};
    rowsByLabel = {};
    deleted = [];
    costPaidUpdates = [];
  });

  it("UT-BOOK-025 a cluster selection survives save and reload", async () => {
    await saveCostLine({
      line: CLUSTER_LINE, accountId: SUBACCOUNT_ID, projectId: PROJECT_ID, isNew: true,
      payments: [{ year: 2026, month: 1, amount: 1_000 }],
    });

    // The column is written at all — the whole of the reported defect.
    expect(saved.vsb_byclusterjson)
      .toBe('[{"Cluster1":false,"Cluster2":true,"Cluster3":false,"Cluster4":true,"Cluster5":false}]');

    const line = await reload(saved);
    expect(line.clusters).toEqual([2, 4]);
    expect(line.equalMode).toBe("cluster");
  });

  it("UT-BOOK-026 a start/end date pair survives save and reload", async () => {
    await saveCostLine({
      line: {
        ...CLUSTER_LINE,
        equalMode: "dates", clusters: [],
        startDate: "2025-04-01", endDate: "2027-07-31",
      },
      accountId: SUBACCOUNT_ID, projectId: PROJECT_ID, isNew: true,
      payments: [{ year: 2025, month: 4, amount: 1_000 }],
    });

    expect(saved.vsb_bystartenddatejson)
      .toBe('[{"StartDate":"04/2025","EndDate":"07/2027"}]');

    const line = await reload(saved);
    // The stored pair carries no day, so it reloads on the first of each month.
    expect(line.startDate).toBe("2025-04-01");
    expect(line.endDate).toBe("2027-07-01");
    expect(line.equalMode).toBe("dates");
    expect(line.clusters).toEqual([]);
  });

  it("UT-BOOK-027 the distribution scheme survives save and reload", async () => {
    await saveCostLine({
      line: { ...CLUSTER_LINE, distribution: "individual", distributionScheme: "percent" },
      accountId: SUBACCOUNT_ID, projectId: PROJECT_ID, isNew: true,
      payments: [{ year: 2026, month: 1, amount: 1_000 }],
    });
    expect((await reload(saved)).distributionScheme).toBe("percent");

    await saveCostLine({
      line: { ...CLUSTER_LINE, distribution: "individual", distributionScheme: "absolute" },
      accountId: SUBACCOUNT_ID, projectId: PROJECT_ID, isNew: true,
      payments: [{ year: 2026, month: 1, amount: 1_000 }],
    });
    expect((await reload(saved)).distributionScheme).toBe("absolute");
  });

  it("UT-BOOK-028 the description, frequency and toggles survive too", async () => {
    await saveCostLine({
      line: CLUSTER_LINE, accountId: SUBACCOUNT_ID, projectId: PROJECT_ID, isNew: true,
      payments: [{ year: 2026, month: 1, amount: 1_000 }],
    });
    const line = await reload(saved);
    expect(line).toMatchObject({
      description: "Grid connection works",
      frequency: 3,
      payer: "DevCo",
      depreciation: true,
      vat: false,
      totalCost: 1_000,
    });
  });

  it("UT-BOOK-029 stores the Average Payment the canvas stores", async () => {
    // `RoundDown('Total Cost' / locNumPayments, 0)` — 1000 over 3 months is 333, the
    // rounded-down base, while the months themselves are paid 333/333/334.
    await saveCostLine({
      line: CLUSTER_LINE, accountId: SUBACCOUNT_ID, projectId: PROJECT_ID, isNew: true,
      payments: [
        { year: 2026, month: 1, amount: 333 },
        { year: 2026, month: 2, amount: 333 },
        { year: 2026, month: 3, amount: 334 },
      ],
    });
    expect(saved.vsb_averagepayment).toBe("333");
  });

  it("UT-BOOK-030 a tombstoned month is not counted as a payment", async () => {
    // `amount: null` is a month being deleted, so it must not dilute the average.
    await saveCostLine({
      line: CLUSTER_LINE, accountId: SUBACCOUNT_ID, projectId: PROJECT_ID, isNew: true,
      payments: [
        { year: 2026, month: 1, amount: 500 },
        { year: 2026, month: 2, amount: 500 },
        { id: "cost-old", year: 2026, month: 3, amount: null },
      ],
    });
    expect(saved.vsb_averagepayment).toBe("500");
  });

  it("UT-BOOK-031 an individual contract writes neither JSON column", async () => {
    // The canvas' individual-distribution Patch (`CapexScreenCode.txt:963`) sets neither, and
    // the panel shows no cluster or date controls in that mode — writing them would invent a
    // selection the user never made.
    await saveCostLine({
      line: { ...CLUSTER_LINE, distribution: "individual" },
      accountId: SUBACCOUNT_ID, projectId: PROJECT_ID, isNew: true,
      payments: [{ year: 2026, month: 1, amount: 1_000 }],
    });
    expect(saved).not.toHaveProperty("vsb_byclusterjson");
    expect(saved).not.toHaveProperty("vsb_bystartenddatejson");
  });

  /* ── Link to Milestone ──────────────────────────────────────────────────
   *
   * `'Linked Cluster': If(Selected.Name <> "None", Selected, Blank())`, written on every save
   * in both distribution branches (`CapexScreenCode.txt:17413` / `:17526`). The column was
   * absent from the field bag entirely, so the dropdown had nowhere to persist — the same shape
   * of defect the two JSON columns above had.
   *
   * The live fixture is contract `ddf8dce1-498f-f111-8076-000d3a284664` on "Revenue test
   * project 29 oct": Equal Distribution by start/end date, SPV, `Linked Cluster` = "Cluster 2"
   * (Order 2), on a project whose own `Cluster State` is "Cluster 1". One of the 31 contracts
   * in VSBCloud_Dev that carry a link.
   */

  it("UT-BOOK-054 a milestone link survives save and reload", async () => {
    await saveCostLine({
      line: {
        ...CLUSTER_LINE,
        equalMode: "dates", clusters: [],
        startDate: "2026-06-01", endDate: "2026-12-01",
        linkedClusterId: CLUSTER_2, linkedClusterName: "Cluster 2", linkedClusterOrder: 2,
      },
      accountId: SUBACCOUNT_ID, projectId: PROJECT_ID, isNew: false,
      payments: [{ year: 2026, month: 6, amount: 1_000 }],
    });

    // The write form, never `_vsb_linkedcluster_value` — `docs/CONVENTIONS.md`.
    expect(saved["vsb_LinkedCluster@odata.bind"])
      .toBe(`/vsb_projectstates(${CLUSTER_2})`);

    const line = await reload(saved);
    expect(line.linkedClusterId).toBe(CLUSTER_2);
    expect(line.linkedClusterName).toBe("Cluster 2");
    expect(line.linkedClusterOrder).toBe(2);
  });

  it("UT-BOOK-055 selecting None clears an existing link", async () => {
    // The `Blank()` half. Omitting the column — which is what this used to do — leaves the old
    // link in place, so "None" would appear to do nothing at all.
    await saveCostLine({
      line: {
        ...CLUSTER_LINE,
        equalMode: "dates", clusters: [],
        linkedClusterId: undefined, linkedClusterName: undefined, linkedClusterOrder: undefined,
      },
      accountId: SUBACCOUNT_ID, projectId: PROJECT_ID, isNew: false,
      payments: [{ year: 2026, month: 6, amount: 1_000 }],
    });

    expect(saved["vsb_LinkedCluster@odata.bind"]).toBeNull();

    const line = await reload(saved);
    expect(line.linkedClusterId).toBeUndefined();
    expect(line.linkedClusterName).toBeUndefined();
    expect(line.linkedClusterOrder).toBeUndefined();
  });

  it("UT-BOOK-056 sends no null @odata.bind in a create body", async () => {
    // A brand-new row has nothing to disassociate, and a null where OData expects an entity
    // reference is not a "clear this lookup" instruction — the same split `saveComment` makes.
    await saveCostLine({
      line: CLUSTER_LINE, accountId: SUBACCOUNT_ID, projectId: PROJECT_ID, isNew: true,
      payments: [{ year: 2026, month: 1, amount: 1_000 }],
    });
    expect(saved).not.toHaveProperty("vsb_LinkedCluster@odata.bind");
  });

  it("UT-BOOK-057 binds the link on a create that has one", async () => {
    await saveCostLine({
      line: { ...CLUSTER_LINE, linkedClusterId: CLUSTER_3, linkedClusterName: "Cluster 3", linkedClusterOrder: 3 },
      accountId: SUBACCOUNT_ID, projectId: PROJECT_ID, isNew: true,
      payments: [{ year: 2026, month: 1, amount: 1_000 }],
    });
    expect(saved["vsb_LinkedCluster@odata.bind"])
      .toBe(`/vsb_projectstates(${CLUSTER_3})`);
    expect((await reload(saved)).linkedClusterOrder).toBe(3);
  });

  it("UT-BOOK-058 clears paid months and payment-date comments on an accepted relink", async () => {
    /*
     * The canvas' `OnConfirm` (`CapexScreenCode.txt:19906-19925`) — `UpdateIf('CAPEX Costs',
     * … && 'Cost Paid' = true, {'Cost Paid': false})` then `RemoveIf('Capex Comments', … &&
     * 'Comment Type' = 'Comments to payment date')`. It is what the dialog's third bullet
     * promises, so the save has to carry it out.
     */
    rowsByLabel = {
      "list CAPEX comments": [
        { vsb_capexcommentsid: "cmt-general", _vsb_capexcontract_value: CONTRACT_ID, vsb_commenttype: 1 },
        { vsb_capexcommentsid: "cmt-payment", _vsb_capexcontract_value: CONTRACT_ID, vsb_commenttype: 2 },
      ],
    };
    await saveCostLine({
      line: {
        ...CLUSTER_LINE,
        linkedClusterId: CLUSTER_3, linkedClusterName: "Cluster 3", linkedClusterOrder: 3,
        payments: [
          { id: "cost-paid", year: 2026, month: 1, amount: 500, paid: true },
          { id: "cost-unpaid", year: 2026, month: 2, amount: 500, paid: false },
        ],
      },
      accountId: SUBACCOUNT_ID, projectId: PROJECT_ID, isNew: false,
      payments: [
        { id: "cost-paid", year: 2026, month: 1, amount: 500 },
        { id: "cost-unpaid", year: 2026, month: 2, amount: 500 },
      ],
      resetPaidAndPaymentDateComments: true,
    });

    // Only the PAID month is patched, and only the payment-date comment is removed.
    expect(costPaidUpdates).toEqual([{ id: "cost-paid", paid: false }]);
    expect(deleted).toEqual(["comment:cmt-payment"]);
  });

  it("UT-BOOK-059 touches nothing when the relink was not confirmed", async () => {
    rowsByLabel = {
      "list CAPEX comments": [
        { vsb_capexcommentsid: "cmt-payment", _vsb_capexcontract_value: CONTRACT_ID, vsb_commenttype: 2 },
      ],
    };
    await saveCostLine({
      line: {
        ...CLUSTER_LINE,
        payments: [{ id: "cost-paid", year: 2026, month: 1, amount: 500, paid: true }],
      },
      accountId: SUBACCOUNT_ID, projectId: PROJECT_ID, isNew: false,
      payments: [{ id: "cost-paid", year: 2026, month: 1, amount: 500 }],
    });
    expect(costPaidUpdates).toEqual([]);
    expect(deleted).toEqual([]);
  });
});

/* ══════════════════════════════════════════════════════════ Summary tab ══ */

/**
 * `loadCapexTotals` — and the ASYMMETRY it is half of.
 *
 * The canvas uses two different sources for what looks like the same number, and both screens
 * have to match their own:
 *
 *   - Summary tile  `Max(Sum(Filter(colCapexCosts, Contract in …), Cost), 0)` — the MONTHLY COST
 *                   ROWS (`Capex Costs Screen.pa.yaml:2472-2504`, `CapexScreenCode.txt:642`).
 *   - Grid row      `Coalesce(C.'Total Cost', Sum(costs), 0)` — the STORED `vsb_totalcost`
 *                   (`:1536-1546`, pinned by `UT-GRID-012`/`013` in `gridRows.test.ts`).
 *
 * These tests exist to stop a future "let's make these consistent" change: making the Summary
 * read `vsb_totalcost`, or the grid read the cost rows, is a REGRESSION against the canvas even
 * though it would look tidier. The fixture numbers are the live ones from Wirmighausen on
 * 16 Sep 2026, where the two sources differ by 2,999.46 across the project.
 */
describe("loadCapexTotals", () => {
  const PROJECT_ID = "9f5aade5-2b7c-ef11-ac20-000d3a466ab7";
  const WIND = CATEGORIES.indexOf("Wind Turbine / Panels");
  const DEVEX = CATEGORIES.indexOf("Development Expenses");

  // Real Wirmighausen contract ids — `lookupIn` runs every id through `guid()`, so a fixture
  // id has to be a real GUID, and these keep the tests tied to the rows they were measured on.
  const DESC = "59ab40f6-f2b0-f111-aaac-6045bd98c286";
  const GESAMT = "0e26387a-91f0-eba4-9f50-bde42fd015e7";
  const NEW_CONTRACT = "54b5d3fd-d9b0-f111-aaac-7ced8d15d85e";
  const NTES = "8daa681b-6cb1-f111-aaab-6045bd8ed8ff";

  /** A contract under one of the fixture's sub-accounts. */
  const contract = (id: string, accountId: string) => ({
    vsb_capexprojectcontractid: id,
    _vsb_account_value: accountId,
    // Present in the fixture precisely so the tests can prove it is NOT what is summed.
    vsb_totalcost: 0,
  });

  const costRow = (contractId: string, cost: number) => ({
    _vsb_contract_value: contractId, vsb_cost: cost,
  });

  beforeEach(() => { queriedBy = {}; });

  it("UT-BOOK-032 sums the monthly cost rows, not the contract's stored total", async () => {
    // "Desc" on Wirmighausen: `vsb_totalcost` 52,000 against cost rows of 55,000. The Summary
    // shows 55,000; the grid shows 52,000.
    rowsByLabel = {
      "list CAPEX accounts for the cost book": rows,
      "list CAPEX contract totals": [
        { ...contract(DESC, "81000_0"), vsb_totalcost: 52_000 },
      ],
      "sum CAPEX cost rows per contract": [
        costRow(DESC, 30_000), costRow(DESC, 25_000),
      ],
    };

    const totals = await loadCapexTotals(PROJECT_ID);
    expect(totals.find((t) => t.category === DEVEX)?.total).toBe(55_000);
  });

  it("UT-BOOK-033 keeps the fractional cost-row sum the stored total rounds away", async () => {
    // `Gesamt (59013_0_47110102)`: stored 3,162,000, rows 3,161,999.96. The Summary must show
    // the .96 — it is the sum of what is actually scheduled.
    rowsByLabel = {
      "list CAPEX accounts for the cost book": rows,
      "list CAPEX contract totals": [
        { ...contract(GESAMT, "81000_0"), vsb_totalcost: 3_162_000 },
      ],
      "sum CAPEX cost rows per contract": [costRow(GESAMT, 3_161_999.96)],
    };

    expect((await loadCapexTotals(PROJECT_ID)).find((t) => t.category === DEVEX)?.total)
      .toBe(3_161_999.96);
  });

  it("UT-BOOK-034 never asks Dataverse for vsb_totalcost at all", async () => {
    // Belt and braces for the asymmetry: the column is not even selected, so it cannot be
    // summed by accident.
    rowsByLabel = {
      "list CAPEX accounts for the cost book": rows,
      "list CAPEX contract totals": [contract(DESC, "81000_0")],
      "sum CAPEX cost rows per contract": [],
    };
    await loadCapexTotals(PROJECT_ID);

    const options = queriedBy["list CAPEX contract totals"]?.[0] as { select: string[] };
    expect(options.select).not.toContain("vsb_totalcost");
    // And the cost query stays narrow — two columns, nothing else.
    const costOptions = queriedBy["sum CAPEX cost rows per contract"]?.[0] as {
      select: string[]; maxPageSize: number;
    };
    expect(costOptions.select).toEqual(["_vsb_contract_value", "vsb_cost"]);
    expect(costOptions.maxPageSize).toBe(5000);
  });

  it("UT-BOOK-035 groups each contract's rows under its own category", async () => {
    rowsByLabel = {
      "list CAPEX accounts for the cost book": rows,
      "list CAPEX contract totals": [
        contract(NEW_CONTRACT, "80000_0"), contract(NTES, "81000_0"),
      ],
      "sum CAPEX cost rows per contract": [
        costRow(NEW_CONTRACT, 500), costRow(NTES, 300), costRow(NTES, 12_000),
      ],
    };

    const totals = await loadCapexTotals(PROJECT_ID);
    expect(totals.find((t) => t.category === WIND)?.total).toBe(500);
    expect(totals.find((t) => t.category === DEVEX)?.total).toBe(12_300);
    // Every category is reported, including the three with nothing in them.
    expect(totals).toHaveLength(CATEGORIES.length);
    expect(totals.filter((t) => t.total === 0)).toHaveLength(CATEGORIES.length - 2);
  });

  it("UT-BOOK-036 floors a negative category at zero, as Max(Sum(...), 0) does", async () => {
    rowsByLabel = {
      "list CAPEX accounts for the cost book": rows,
      "list CAPEX contract totals": [contract(NTES, "81000_0")],
      "sum CAPEX cost rows per contract": [costRow(NTES, 100), costRow(NTES, -900)],
    };

    expect((await loadCapexTotals(PROJECT_ID)).find((t) => t.category === DEVEX)?.total).toBe(0);
  });

  it("UT-BOOK-037 skips a contract whose account is outside the five categories", async () => {
    // `83000` hangs off Overleveraging, which `loadCostAccounts` drops. Its contract has no
    // tile to appear on, so it must not be counted — and must not be fetched for either.
    rowsByLabel = {
      "list CAPEX accounts for the cost book": rows,
      "list CAPEX contract totals": [
        contract(NTES, "81000_0"), contract(GESAMT, "83000"),
      ],
      "sum CAPEX cost rows per contract": [costRow(NTES, 42), costRow(GESAMT, 999)],
    };

    const totals = await loadCapexTotals(PROJECT_ID);
    expect(totals.find((t) => t.category === DEVEX)?.total).toBe(42);
    expect(totals.reduce((sum, t) => sum + t.total, 0)).toBe(42);

    const costOptions = queriedBy["sum CAPEX cost rows per contract"]?.[0] as { filter: string };
    expect(costOptions.filter).toContain(NTES);
    expect(costOptions.filter).not.toContain(GESAMT);
  });

  it("UT-BOOK-038 asks for no cost rows at all when the project has no contracts", async () => {
    rowsByLabel = {
      "list CAPEX accounts for the cost book": rows,
      "list CAPEX contract totals": [],
    };

    const totals = await loadCapexTotals(PROJECT_ID);
    expect(totals.every((t) => t.total === 0)).toBe(true);
    expect(queriedBy["sum CAPEX cost rows per contract"]).toBeUndefined();
  });
});

/* ════════════════════════════════════════════════════════ delete a line ══ */

/**
 * `deleteCostLine` — the canvas' `RemoveIf('Capex Comments', …)` half, which was missing.
 *
 * A deleted contract used to leave its whole comment thread in `vsb_capexcommentses`, pointing
 * at a contract and at cost rows that no longer existed.
 */
describe("deleteCostLine", () => {
  const CONTRACT_ID = "66666666-7777-8888-9999-aaaaaaaaaaaa";
  const OTHER_CONTRACT_ID = "11111111-7777-8888-9999-aaaaaaaaaaaa";

  const line = (payments: { id?: string; year: number; month: number }[]) => ({
    id: CONTRACT_ID,
    accountId: "11111111-2222-3333-4444-555555555555",
    description: "Grid connection works",
    payer: "SPV" as const,
    depreciation: true, vat: true, standard: false,
    distribution: "equal" as const, equalMode: "cluster" as const,
    distributionScheme: "absolute" as const,
    startDate: "", endDate: "", frequency: 1, clusters: [], comments: [],
    payments: payments.map((p) => ({ ...p, amount: 100, paid: false })),
  });

  beforeEach(() => { deleted = []; rowsByLabel = { "list CAPEX comments": [] }; });

  it("UT-BOOK-039 deletes the contract's comments, then its cost rows, then the contract", async () => {
    rowsByLabel = {
      "list CAPEX comments": [
        { vsb_capexcommentsid: "cm1", _vsb_capexcontract_value: CONTRACT_ID },
        { vsb_capexcommentsid: "cm2", _vsb_capexcontract_value: CONTRACT_ID },
      ],
    };

    await deleteCostLine(line([{ id: "cost-1", year: 2026, month: 1 }]));

    // Children before parents: a comment is a child of BOTH the cost row it hangs off and the
    // contract, so an interrupted delete leaves rows that are still reachable.
    expect(deleted).toEqual([
      "comment:cm1", "comment:cm2", "cost:cost-1", `contract:${CONTRACT_ID}`,
    ]);
  });

  it("UT-BOOK-040 deletes only the comments belonging to this contract", async () => {
    // `loadComments` filters server-side, but `planDeleteContract` filters again — a stray row
    // for another contract must never be dragged into this delete.
    rowsByLabel = {
      "list CAPEX comments": [
        { vsb_capexcommentsid: "mine", _vsb_capexcontract_value: CONTRACT_ID },
        { vsb_capexcommentsid: "theirs", _vsb_capexcontract_value: OTHER_CONTRACT_ID },
        { vsb_capexcommentsid: "orphan", _vsb_capexcontract_value: null },
      ],
    };

    await deleteCostLine(line([]));
    expect(deleted).toEqual(["comment:mine", `contract:${CONTRACT_ID}`]);
  });

  it("UT-BOOK-041 still deletes the contract when it has no comments", async () => {
    await deleteCostLine(line([{ id: "cost-1", year: 2026, month: 1 }, { year: 2026, month: 2 }]));
    // The second payment has no Dataverse id — nothing was ever written for it.
    expect(deleted).toEqual(["cost:cost-1", `contract:${CONTRACT_ID}`]);
  });
});

/* ══════════════════════════════════════════════════════ linked cluster ══ */

/**
 * `vsb_linkedcluster` — the contract's "Link to Milestone" selection, resolved through
 * `Project States`.
 *
 * Neither the column nor the lookup was read at all, which is why `contractSubLabel` could not
 * emit its `Link to Cluster N` segment and why `paidToggleNeedsConfirmation` — already wired
 * into `Screen.tsx` — could never return true.
 *
 * The fixture rows are the real VSBCloud_Dev `vsb_projectstate` table, measured 16 Sep: the
 * cluster rows are Order 1..6 and the table also holds Draft (0), Abandoned (8) and
 * Inactive/ On-hold (9), so "order" is not a row index.
 */
describe("loadCostLines linked cluster", () => {
  const PROJECT_ID = "9f5aade5-2b7c-ef11-ac20-000d3a466ab7";
  const SUBACCOUNT_ID = "11111111-2222-3333-4444-555555555555";
  const CONTRACT_ID = "66666666-7777-8888-9999-aaaaaaaaaaaa";
  const CLUSTER_3 = "6335fbe4-d18e-ef11-ac20-7c1e527110be";
  const CLUSTER_5 = "50673cf1-d18e-ef11-ac21-000d3a4c04ca";

  const projectStateRows = () => [
    { vsb_projectstateid: CLUSTER_5, vsb_name: "Cluster 5", vsb_order: 5 },
    { vsb_projectstateid: "b133498e-78ef-ef11-be20-000d3a22ea8e", vsb_name: "Draft", vsb_order: 0 },
    { vsb_projectstateid: CLUSTER_3, vsb_name: "Cluster 3", vsb_order: 3 },
    { vsb_projectstateid: "9cdd1910-d28e-ef11-ac21-000d3a4c04ca", vsb_name: "Inactive/ On-hold", vsb_order: 9 },
  ];

  const contractRow = (linkedClusterId?: string) => ({
    vsb_capexprojectcontractid: CONTRACT_ID,
    _vsb_account_value: SUBACCOUNT_ID,
    vsb_name: "Individual distribution by absolute",
    vsb_distribution: 952850001,
    ...(linkedClusterId ? { _vsb_linkedcluster_value: linkedClusterId } : {}),
  });

  beforeEach(() => { rowsByLabel = {}; queriedBy = {}; });

  it("UT-BOOK-042 resolves the lookup to the Project States row's name and order", async () => {
    rowsByLabel = {
      "list CAPEX project contracts": [contractRow(CLUSTER_3)],
      "list CAPEX costs for the cost book": [],
      "list project states": projectStateRows(),
    };

    const line = (await loadCostLines(PROJECT_ID, [SUBACCOUNT_ID]))[0]!;
    expect(line.linkedClusterId).toBe(CLUSTER_3);
    expect(line.linkedClusterName).toBe("Cluster 3");
    expect(line.linkedClusterOrder).toBe(3);
  });

  it("UT-BOOK-043 selects the lookup column, without which nothing else here can work", async () => {
    rowsByLabel = {
      "list CAPEX project contracts": [contractRow(CLUSTER_3)],
      "list CAPEX costs for the cost book": [],
      "list project states": projectStateRows(),
    };
    await loadCostLines(PROJECT_ID, [SUBACCOUNT_ID]);

    const options = queriedBy["list CAPEX project contracts"]?.[0] as { select: string[] };
    expect(options.select).toContain("_vsb_linkedcluster_value");
  });

  it("UT-BOOK-044 leaves an unlinked contract blank and skips the Project States query", async () => {
    // 31 contracts in the whole org carry a link and none are on Wirmighausen, so the common
    // case must not pay for a round trip it cannot use.
    rowsByLabel = {
      "list CAPEX project contracts": [contractRow()],
      "list CAPEX costs for the cost book": [],
      "list project states": projectStateRows(),
    };

    const line = (await loadCostLines(PROJECT_ID, [SUBACCOUNT_ID]))[0]!;
    expect(line.linkedClusterId).toBeUndefined();
    expect(line.linkedClusterOrder).toBeUndefined();
    expect(queriedBy["list project states"]).toBeUndefined();
  });

  it("UT-BOOK-045 reads an id that no longer resolves as NOT linked", async () => {
    // The Project States row was deactivated, so `ACTIVE` filters it out. Carrying the id with
    // no order would render "Link to Cluster " with nothing after it.
    rowsByLabel = {
      "list CAPEX project contracts": [contractRow(CLUSTER_5)],
      "list CAPEX costs for the cost book": [],
      "list project states": projectStateRows().filter((s) => s.vsb_projectstateid !== CLUSTER_5),
    };

    const line = (await loadCostLines(PROJECT_ID, [SUBACCOUNT_ID]))[0]!;
    expect(line.linkedClusterId).toBeUndefined();
    expect(line.linkedClusterName).toBeUndefined();
    expect(line.linkedClusterOrder).toBeUndefined();
  });

  it("UT-BOOK-046 returns every project state in Order, clusters and non-clusters alike", async () => {
    rowsByLabel = { "list project states": projectStateRows() };
    const states = await loadProjectStates();
    expect(states.map((s) => s.order)).toEqual([0, 3, 5, 9]);
    expect(states.map((s) => s.name)).toEqual(["Draft", "Cluster 3", "Cluster 5", "Inactive/ On-hold"]);
  });
});

/* ══════════════════════════════════════════════ data-driven categories ══ */

/**
 * `loadCapexCategories` — the tab strip's labels as Dataverse has them.
 *
 * `SortByColumns(Filter(colCapexAccountCategoriesNew, Not(Name = "Overleveraging")), "vsb_order")`.
 * The hard-coded `CATEGORIES` matches it today; this is what stops a category added by an admin
 * from silently having no tab.
 */
describe("loadCapexCategories", () => {
  beforeEach(() => { rows = realShapedRows(); rowsByLabel = {}; });

  it("UT-BOOK-047 returns the level-1 names in vsb_order, minus Overleveraging", async () => {
    // The fixture deliberately has Overleveraging at order 4, BETWEEN the two real categories,
    // exactly as the live org does — so dropping it cannot be confused with truncating the tail.
    rows = [
      ...realShapedRows(),
      { vsb_capexaccountlistid: "c2", vsb_number: "10002", vsb_name: "Construction Expenses", vsb_order: 3, _vsb_parentaccount_value: "root" },
    ];
    await expect(loadCapexCategories()).resolves.toEqual([
      "Wind Turbine / Panels", "Development Expenses", "Construction Expenses",
    ]);
  });

  it("UT-BOOK-048 agrees with the hard-coded CATEGORIES it is replacing", async () => {
    rows = [
      { vsb_capexaccountlistid: "root", vsb_number: "00001", vsb_name: "Root" },
      // The live VSBCloud_Dev order, measured 16 Sep — note Overleveraging at 4, not last.
      { vsb_capexaccountlistid: "c0", vsb_number: "10000", vsb_name: "Wind Turbine / Panels", vsb_order: 1, _vsb_parentaccount_value: "root" },
      { vsb_capexaccountlistid: "c1", vsb_number: "10001", vsb_name: "Development Expenses", vsb_order: 2, _vsb_parentaccount_value: "root" },
      { vsb_capexaccountlistid: "c2", vsb_number: "10002", vsb_name: "Construction Expenses", vsb_order: 3, _vsb_parentaccount_value: "root" },
      { vsb_capexaccountlistid: "c6", vsb_number: "10006", vsb_name: "Overleveraging", vsb_order: 4, _vsb_parentaccount_value: "root" },
      { vsb_capexaccountlistid: "c3", vsb_number: "10003", vsb_name: "Substation / Grid Connection", vsb_order: 5, _vsb_parentaccount_value: "root" },
      { vsb_capexaccountlistid: "c4", vsb_number: "10004", vsb_name: "Other CAPEX", vsb_order: 6, _vsb_parentaccount_value: "root" },
      // BoP has no parent at all and is not a category.
      { vsb_capexaccountlistid: "bop", vsb_number: "10005", vsb_name: "BoP" },
    ];
    await expect(loadCapexCategories()).resolves.toEqual([...CATEGORIES]);
  });

  it("UT-BOOK-049 returns nothing when the 00001 root is missing, rather than guessing", async () => {
    rows = rows.filter((r) => r.vsb_number !== "00001");
    await expect(loadCapexCategories()).resolves.toEqual([]);
  });
});

/* ═══════════════════════════════════════════════ milestone assumptions ══ */

/**
 * `loadMilestoneDurations` — the row `synthesiseClusterDates` back-computes clusters 1–4 from.
 *
 * Fixture values are Germany/Wind in VSBCloud_Dev, measured 16 Sep
 * (`94cd9dcb-8123-ef11-840a-000d3aab6b54`).
 */
describe("loadMilestoneDurations", () => {
  const GERMANY = "9f5aade5-2b7c-ef11-ac20-000d3a466ab7";
  const WIND = 952850000;

  const germanyWind = {
    vsb_milestonesstandardassumptionsid: "94cd9dcb-8123-ef11-840a-000d3aab6b54",
    vsb_cluster1: 17, vsb_cluster2: 18, vsb_cluster3: 30, vsb_cluster4: 6, vsb_cluster5: 12,
    vsb_finalinvestmentdecision: 12,
  };

  beforeEach(() => { rowsByLabel = {}; queriedBy = {}; });

  it("UT-BOOK-050 filters on the average-duration row, the country and the technology", async () => {
    rowsByLabel = { "load milestone standard assumptions": [germanyWind] };
    await loadMilestoneDurations(GERMANY, WIND);

    const options = queriedBy["load milestone standard assumptions"]?.[0] as { filter: string };
    // Naming the row matters: the same six columns also hold "success rate [-]" as decimals
    // between 0 and 1, which would back-date the clusters by a fraction of a month.
    expect(options.filter).toContain("average duration [months]");
    expect(options.filter).toContain(`_vsb_country_value eq ${GERMANY}`);
    expect(options.filter).toContain(`vsb_technology eq ${WIND}`);
  });

  it("UT-BOOK-051 maps the six duration columns", async () => {
    rowsByLabel = { "load milestone standard assumptions": [germanyWind] };
    await expect(loadMilestoneDurations(GERMANY, WIND)).resolves.toEqual({
      cluster1: 17, cluster2: 18, cluster3: 30, cluster4: 6, cluster5: 12,
      finalInvestmentDecision: 12,
    });
  });

  it("UT-BOOK-052 asks nothing when the country or the technology is unknown", async () => {
    await expect(loadMilestoneDurations(undefined, WIND)).resolves.toBeUndefined();
    await expect(loadMilestoneDurations(GERMANY, undefined)).resolves.toBeUndefined();
    expect(queriedBy["load milestone standard assumptions"]).toBeUndefined();
  });

  it("UT-BOOK-053 returns undefined when no row matches — a Hydro project matches nothing", async () => {
    rowsByLabel = { "load milestone standard assumptions": [] };
    await expect(loadMilestoneDurations(GERMANY, 952850005)).resolves.toBeUndefined();
  });
});
