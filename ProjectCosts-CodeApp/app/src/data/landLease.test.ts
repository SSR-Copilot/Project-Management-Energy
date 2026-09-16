/**
 * `landLease.ts` — the Cost module's ONE Land Lease reader and its write executor.
 *
 * It moved here from `features/land-lease/hooks.ts`, where it bypassed `costRepository` — the
 * thing that file's own header calls "the Cost module's single data boundary". The tests below
 * pin the three things the shared cost book's old Land Lease path lost, because those three are
 * why a second reader existed at all:
 *
 *   1. money is NULLABLE — a stored `0` and a blank are different answers;
 *   2. `vsb_landowner` and the six one-time-payment columns are selected;
 *   3. `vsb_landleaseallocationwtgs` is read, and `loadLeaseGenerators` supplies the picker.
 *
 * `UT-LLDATA-###` is its own series.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let rowsByLabel: Record<string, unknown[]> = {};
let queriedBy: Record<string, unknown[]> = {};
interface Write { op: string; table: string; id?: string; payload?: Record<string, unknown> }
let writes: Write[] = [];
const NEW_ID: Record<string, string[]> = {};

vi.mock("./client", () => ({
  fetchAll: async (label: string, _page: unknown, options: unknown) => {
    (queriedBy[label] ??= []).push(options);
    return rowsByLabel[label] ?? [];
  },
}));

function service(table: string, idColumn: string) {
  return {
    getAll: async () => ({ success: true, data: [] }),
    create: async (payload: Record<string, unknown>) => {
      const id = NEW_ID[table]?.shift() ?? `${table}-new`;
      writes.push({ op: "create", table, id, payload });
      return { success: true, data: { [idColumn]: id } };
    },
    update: async (id: string, payload: Record<string, unknown>) => {
      writes.push({ op: "update", table, id, payload });
      return { success: true, data: {} };
    },
    delete: async (id: string) => {
      writes.push({ op: "delete", table, id });
      return { success: true, data: {} };
    },
  };
}

vi.mock("@/generated/services/Vsb_landleaseprojectcostsService", () => ({
  Vsb_landleaseprojectcostsService: service("cost", "vsb_landleaseprojectcostid"),
}));
vi.mock("@/generated/services/Vsb_landleaseperiodsService", () => ({
  Vsb_landleaseperiodsService: service("period", "vsb_landleaseperiodid"),
}));
vi.mock("@/generated/services/Vsb_landleaseallocationwtgsService", () => ({
  Vsb_landleaseallocationwtgsService: service("alloc", "vsb_landleaseallocationwtgid"),
}));
vi.mock("@/generated/services/Vsb_landleasesubaccountsService", () => ({
  Vsb_landleasesubaccountsService: service("sub", "vsb_landleasesubaccountid"),
}));
vi.mock("@/generated/services/Vsb_generatorinprojectsService", () => ({
  Vsb_generatorinprojectsService: service("gip", "vsb_generatorinprojectid"),
}));
vi.mock("@/generated/services/Vsb_generatortypeinprojectsService", () => ({
  Vsb_generatortypeinprojectsService: service("gtip", "vsb_generatortypeinprojectid"),
}));
vi.mock("@/generated/services/Vsb_pvmoduletypeinprojectsService", () => ({
  Vsb_pvmoduletypeinprojectsService: service("pvtip", "vsb_pvmoduletypeinprojectid"),
}));
vi.mock("@/generated/services/Vsb_opexlandleasestandardassumptionsesService", () => ({
  Vsb_opexlandleasestandardassumptionsesService:
    service("assumption", "vsb_opexlandleasestandardassumptionsid"),
}));
vi.mock("@/generated/services/Vsb_countryinflationprofilesService", () => ({
  Vsb_countryinflationprofilesService: service("cip", "vsb_countryinflationprofileid"),
}));
vi.mock("@/generated/services/TransactioncurrenciesService", () => ({
  TransactioncurrenciesService: service("currency", "transactioncurrencyid"),
}));

const {
  applyLeaseWrites, loadCountryInflation, loadCurrencies, loadLeaseAssumptions, loadLeaseBook,
  loadLeaseGenerators,
} = await import("./landLease");
const { LEASE_ENTITY_SET } = await import("@/features/periods/landLeaseRules");

/** Real VSBCloud_Dev ids — `guid()` rejects anything that is not a GUID. */
const PROJECT_NEW_DATA = "910d8ed0-282a-ef11-840a-6045bd9e5ce7";
const LOCATIONS = "cfc603b0-d2d0-ee11-9079-000d3abd8704";
const HDR_COST101 = "6f189e32-3c0a-f011-bae2-6045bd882926";
const HDR_EMPTY = "a597c465-440a-f011-bae2-6045bd882926";
const EURO = "b8b1e37d-1f57-ea11-a811-000d3a4a9d2f";
const GERMANY = "1cf4a2b6-d2d0-ee11-9079-000d3ab6fed7";

beforeEach(() => {
  rowsByLabel = {};
  queriedBy = {};
  writes = [];
  for (const key of Object.keys(NEW_ID)) delete NEW_ID[key];
});

describe("loadLeaseBook", () => {
  const baseRows = () => ({
    "list Land Lease subaccounts": [
      { vsb_landleasesubaccountid: LOCATIONS, vsb_name: "Locations", vsb_order: 1 },
    ],
    "list Land Lease project costs": [
      {
        vsb_landleaseprojectcostid: HDR_COST101,
        _vsb_subaccount_value: LOCATIONS,
        _vsb_currency_value: EURO,
        vsb_name: "Project New Data-Locations-Cost 101",
        vsb_description: "Cost 101",
        vsb_landowner: "Schmidt",
        vsb_secured: 952850000,
        vsb_allwtgallocated: false,
        vsb_amountonetimepayment: 10_000,
        vsb_amountonetimepayment2: 2_500,
        vsb_duedateonetimepayment: "12/2025",
        vsb_duedateonetimepayment2: "12/2026",
        vsb_useinflationprofile: true,
        vsb_inflationstartyear: 2033,
        createdon: "2025-02-01T00:00:00Z",
      },
    ],
    "list Land Lease periods": [
      {
        vsb_landleaseperiodid: "p-1",
        _vsb_projectcost_value: HDR_COST101,
        vsb_name: "Cost 101",
        vsb_period: 952850000,
        vsb_startdate: "2032-07-16T00:00:00Z",
        vsb_landleasedurationyears: 20,
        vsb_landleasedurationmonths: 0,
        vsb_fixedcosts: 5_000,
        vsb_ofrevenues: 0,
        vsb_aggregation: 952850000,
        vsb_distributionfrequency: 12,
      },
    ],
    "list Land Lease WTG allocations": [
      { vsb_landleaseallocationwtgid: "alloc-1", _vsb_projectcost_value: HDR_COST101,
        _vsb_generatorinproject_value: "gen-1" },
    ],
    "list transaction currencies for Land Lease": [
      { transactioncurrencyid: EURO, currencyname: "Euro", isocurrencycode: "EUR" },
    ],
  });

  it("UT-LLDATA-001 keeps a blank money column BLANK and a stored zero ZERO", async () => {
    /*
     * `landLeaseRules`' `formatGrouped` prints a stored `0` and BLANKS a null, and
     * `firstPeriodHasRate` — the `Add Period` gate — asks whether any of the five rates is
     * non-blank. MEASURED, VSBCloud_Dev 16 Sep: of 517 `vsb_landleaseperiods` rows only 173
     * carry `vsb_fixedcosts`, 102 `vsb_ofrevenues`, 23 `vsb_eurmwh`, 11 `vsb_eurmw` and 269
     * `vsb_eurwtg` — so a `?? 0` prints `0` in five columns the canvas leaves empty on the large
     * majority of rows, and pins that gate open.
     */
    rowsByLabel = baseRows();
    const book = await loadLeaseBook(PROJECT_NEW_DATA);
    const period = book.periods[0];
    expect(period?.fixedCosts).toBe(5_000);
    expect(period?.percentOfRevenues).toBe(0);
    expect(period?.eurPerMwh).toBeNull();
    expect(period?.eurPerMw).toBeNull();
    expect(period?.eurPerWtg).toBeNull();
  });

  it("UT-LLDATA-002 selects the Land Owner and all six one-time-payment columns", async () => {
    /*
     * MEASURED, 16 Sep: 12 of 416 headers carry a Land Owner, 27 a first amount, 2 a second, 2 a
     * third and 29 a first due date. The due dates are FREE TEXT in `MM/YYYY`, verified on the
     * org — live values read `"12/2025"` — so they are carried as strings, not parsed as dates.
     */
    rowsByLabel = baseRows();
    const select = (o: unknown) => (o as { select: string[] }).select;
    const book = await loadLeaseBook(PROJECT_NEW_DATA);

    for (const column of [
      "vsb_landowner",
      "vsb_amountonetimepayment", "vsb_amountonetimepayment2", "vsb_amountonetimepayment3",
      "vsb_duedateonetimepayment", "vsb_duedateonetimepayment2", "vsb_duedateonetimepayment3",
    ]) {
      expect(select(queriedBy["list Land Lease project costs"]?.[0])).toContain(column);
    }
    expect(book.costs[0]).toMatchObject({
      landOwner: "Schmidt",
      amountOneTimePayment: 10_000,
      amountOneTimePayment2: 2_500,
      amountOneTimePayment3: null,
      dueDateOneTimePayment: "12/2025",
      dueDateOneTimePayment2: "12/2026",
      dueDateOneTimePayment3: null,
    });
  });

  it("UT-LLDATA-003 reads the contract's WTG allocations", async () => {
    // Nothing read `vsb_landleaseallocationwtgs` at all before, so the picker had no options and
    // `canSaveLandLease`'s PV/Wind allocation clause could only be met by "allocate to all".
    rowsByLabel = baseRows();
    const book = await loadLeaseBook(PROJECT_NEW_DATA);
    expect(book.allocations).toEqual([
      { id: "alloc-1", projectCostId: HDR_COST101, generatorInProjectId: "gen-1" },
    ]);
  });

  it("UT-LLDATA-004 scopes the period query server-side by the header ids", async () => {
    // `OnVisible` (`PA:14`) does the join CLIENT-side —
    // `'Project Cost'.'Land Lease Project Cost' in colLandLeaseProjectCosts…` — which is a
    // delegation workaround and silently truncates at 2,000 rows.
    rowsByLabel = baseRows();
    await loadLeaseBook(PROJECT_NEW_DATA);
    const filter = (queriedBy["list Land Lease periods"]?.[0] as { filter: string }).filter;
    expect(filter).toContain(`_vsb_projectcost_value eq ${HDR_COST101}`);
  });

  it("UT-LLDATA-005 returns a header with no periods rather than dropping it", async () => {
    // "Add Contract Type" creates a header and its first period may never be filled in —
    // measured 16 Sep, 19 of Project New Data's 27 headers are in exactly that state.
    rowsByLabel = {
      ...baseRows(),
      "list Land Lease project costs": [
        { vsb_landleaseprojectcostid: HDR_EMPTY, _vsb_subaccount_value: LOCATIONS,
          vsb_description: "Trecjjj" },
      ],
      "list Land Lease periods": [],
      "list Land Lease WTG allocations": [],
    };
    const book = await loadLeaseBook(PROJECT_NEW_DATA);
    expect(book.costs).toHaveLength(1);
    expect(book.periods).toEqual([]);
  });
});

describe("loadLeaseGenerators", () => {
  it("UT-LLDATA-006 resolves generators through the polymorphic type lookup", async () => {
    /*
     * `colGeneratorsInProject` (`PA:14`). A `GeneratorInProjects` row reaches its project only
     * through the POLYMORPHIC `ModuleTypeInProject` lookup, which points either at a
     * `GeneratorTypeInProjects` row (a WTG) or a `PVModuleTypeInProjects` row (a PV string), so
     * both type tables are resolved first and the generators filtered by the ids they yield.
     */
    const GEN_TYPE = "367d82b9-0643-e55f-b768-0436342290ba";
    const PV_TYPE = "61a30faa-b7e1-eddc-a5b5-fc1376f538f5";
    rowsByLabel = {
      "list generator types in project for Land Lease": [
        { vsb_generatortypeinprojectid: GEN_TYPE },
      ],
      "list PV module types in project for Land Lease": [
        { vsb_pvmoduletypeinprojectid: PV_TYPE, vsb_label: "JinkoSolar 555W" },
      ],
      "list generators in project for Land Lease": [
        { vsb_generatorinprojectid: "g2", vsb_name: "WTG 111_2", statecode: 0,
          _vsb_moduletypeinprojectid_value: GEN_TYPE },
        { vsb_generatorinprojectid: "g1", vsb_name: "WTG 111_1", statecode: 0,
          _vsb_moduletypeinprojectid_value: GEN_TYPE },
        { vsb_generatorinprojectid: "pv1", vsb_name: "PV String 1",
          _vsb_moduletypeinprojectid_value: PV_TYPE },
      ],
    };
    const options = await loadLeaseGenerators(PROJECT_NEW_DATA);
    // `$"{Name} - {Status}"` for a WTG; the PV module type's `Label` for a PV row.
    expect(options.find((o) => o.id === "g1")?.label).toBe("WTG 111_1 - Active");
    expect(options.find((o) => o.id === "pv1")?.label).toBe("JinkoSolar 555W");
  });

  it("UT-LLDATA-007 asks for no generators at all on a project with no types", async () => {
    await expect(loadLeaseGenerators(PROJECT_NEW_DATA)).resolves.toEqual([]);
    expect(queriedBy["list generators in project for Land Lease"]).toBeUndefined();
  });
});

describe("loadCountryInflation", () => {
  it("UT-LLDATA-008 returns every year and every Area for the country", async () => {
    // MEASURED 16 Sep: Italy carries SEVEN rows per year, one per price zone; every other
    // country exactly one per year with `vsb_area` blank. Both period screens resolve their
    // percentage against this, through `opexRules.countryInflationPercent`.
    rowsByLabel = {
      "list country inflation profiles": [
        { vsb_countryinflationprofileid: "1", vsb_year: 2027, vsb_area: "North", vsb_inflation: 2 },
        { vsb_countryinflationprofileid: "2", vsb_year: 2027, vsb_inflation: 1.8 },
      ],
    };
    await expect(loadCountryInflation(GERMANY)).resolves.toEqual([
      { year: 2027, area: "North", inflation: 2 },
      { year: 2027, area: "", inflation: 1.8 },
    ]);
  });
});

describe("loadCurrencies / loadLeaseAssumptions", () => {
  it("UT-LLDATA-009 does NOT filter currencies by statecode", async () => {
    // A contract pointing at a since-deactivated currency must still show the name it was saved
    // with — the same rule `costBook.loadCurrencyNames` states.
    rowsByLabel = {
      "list transaction currencies for Land Lease": [
        { transactioncurrencyid: EURO, currencyname: "Euro", isocurrencycode: "EUR" },
      ],
    };
    await expect(loadCurrencies()).resolves.toEqual([{ id: EURO, name: "Euro", code: "EUR" }]);
    expect((queriedBy["list transaction currencies for Land Lease"]?.[0] as { filter?: string })
      .filter).toBeUndefined();
  });

  it("UT-LLDATA-010 keeps the assumptions in Description order and their money nullable", async () => {
    // `$orderby` is load-bearing: defect LL-D8 depends on it, because `standardPeriodStarts`
    // chains the start dates in the order the rows arrive.
    rowsByLabel = {
      "list Land Lease standard assumptions": [
        { vsb_opexlandleasestandardassumptionsid: "a1", vsb_description: "Standard Lease",
          vsb_period: 952850000, vsb_fixcosts: 0 },
      ],
    };
    const rows = await loadLeaseAssumptions(GERMANY, 952850000);
    expect(rows[0]).toMatchObject({ description: "Standard Lease", fixCosts: 0, eurPerMwh: null });
    expect((queriedBy["list Land Lease standard assumptions"]?.[0] as { orderBy: string[] })
      .orderBy).toEqual(["vsb_description asc"]);
  });
});

describe("applyLeaseWrites", () => {
  it("UT-LLDATA-011 runs the plan IN ORDER and resolves a create's id into the next write", async () => {
    /*
     * There is no `$batch` — `convertOptionsToQueryString` in `@microsoft/power-apps` serialises
     * only `$select/$filter/$orderby/$top/$skip/$count/$skiptoken` and the SDK exposes no
     * changeset — so a plan runs sequentially and `bindParent` substitutes the id an earlier
     * create returned. The ORDER is the canvas' own: the parent first, then its children.
     */
    NEW_ID.cost = [HDR_COST101];
    const result = await applyLeaseWrites([
      { op: "create", entitySet: LEASE_ENTITY_SET.cost, ref: "cost",
        payload: { vsb_description: "Cost 101" } },
      { op: "create", entitySet: LEASE_ENTITY_SET.period, parentRef: "cost",
        parentNav: "vsb_ProjectCost", parentEntitySet: "vsb_landleaseprojectcosts",
        payload: { vsb_name: "Cost 101" } },
    ] as never);

    expect(writes.map((w) => `${w.op}:${w.table}`)).toEqual(["create:cost", "create:period"]);
    expect(writes[1]?.payload?.["vsb_ProjectCost@odata.bind"])
      .toBe(`/vsb_landleaseprojectcosts(${HDR_COST101})`);
    expect(result.createdIds.cost).toBe(HDR_COST101);
  });

  it("UT-LLDATA-012 refuses to POST a row whose parent id never arrived", async () => {
    // A write still carrying an unresolved `parentRef` is a planner or caller bug. Posting it
    // would create an ORPHAN row — the stranded-row failure `docs/01-BUGS-FOUND.md` S-5 records.
    await expect(applyLeaseWrites([
      { op: "create", entitySet: LEASE_ENTITY_SET.period, parentRef: "missing",
        parentNav: "vsb_ProjectCost", parentEntitySet: "vsb_landleaseprojectcosts",
        payload: {} },
    ] as never)).rejects.toThrow(/parent id/);
    expect(writes).toEqual([]);
  });

  it("UT-LLDATA-013 deletes without needing a payload, and rejects an unknown entity set", async () => {
    await applyLeaseWrites([
      { op: "delete", entitySet: LEASE_ENTITY_SET.allocation, id: "alloc-1" },
    ] as never);
    expect(writes).toEqual([{ op: "delete", table: "alloc", id: "alloc-1" }]);

    await expect(applyLeaseWrites([
      { op: "delete", entitySet: "vsb_somethingelse", id: "x" },
    ] as never)).rejects.toThrow(/No writer/);
  });
});
