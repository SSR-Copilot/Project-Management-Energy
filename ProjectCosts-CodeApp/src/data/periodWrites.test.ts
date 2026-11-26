/**
 * `periodWrites.ts` — the O&M / Other OPEX / Land Lease save, delete and standard-contract seed.
 *
 * These exist because the first pass at these screens wrote every period as a standalone row.
 * The canvas does not: a cost is a CHAIN, and three of its rules are destructive when they are
 * missing rather than merely absent —
 *
 *   · a HEAD's inflation/threshold/align/external cascade onto its periods, so an edit that
 *     skips the cascade leaves period 3 on last year's inflation profile and the model silently
 *     disagrees with the screen;
 *   · deleting a head deletes its whole chain, so a delete that skips it strands orphan rows
 *     that no card shows and nothing can reach again;
 *   · a Land Lease sub-account holds MANY contracts (measured: twelve under `Locations` on one
 *     project), so "find the one header for this location" patched a header at random.
 *
 * Every id in the fixtures is a real VSBCloud_Dev GUID — `lookupEq`/`guid` reject anything else,
 * and it keeps the tests tied to the rows the behaviour was measured on:
 *
 *   Quellendorf I   `ac3168e6-2b7c-ef11-ac20-6045bda08851`  three O&M chains of five periods
 *   Project New Data `910d8ed0-282a-ef11-840a-6045bd9e5ce7`  27 Land Lease headers, 12 under
 *                                                            `Locations`
 *
 * `UT-PWRITE-###` is its own series: `UT-BOOK-###` in `costBook.test.ts` numbers the READ side,
 * and the round-trip cases below drive one into the other rather than belonging to either.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CostPeriod } from "@/features/cost/costing/model";

/* ═════════════════════════════════════════════════════════════════ harness ══ */

/** `fetchAll` results by the label its caller passes — every query in the module is named. */
let rowsByLabel: Record<string, unknown[]> = {};
/** The options every `fetchAll` was called with, by label, so a test can assert the query. */
let queriedBy: Record<string, unknown[]> = {};

/** Every write, in order, as `{ op, table, id, fields }`. ORDER is asserted, not just membership. */
interface Write { op: "create" | "update" | "delete"; table: string; id?: string; fields?: Record<string, unknown> }
let writes: Write[] = [];

/** New ids handed back by the fakes, per table, so a chain's rows are distinguishable. */
const NEW_ID: Record<string, string[]> = {};
const nextId = (table: string) => NEW_ID[table]?.shift() ?? `${table}-new`;

/** Entity set -> the table key the service doubles record under, for deletes that go through `deleteRecord` (CA-27). */
const DELETE_TABLE: Record<string, string> = {
  vsb_opexprojectcosts: "opex", vsb_landleaseprojectcosts: "llcost",
  vsb_landleaseperiods: "llperiod", vsb_landleaseallocationwtgs: "llalloc",
};
/** Ids whose delete Dataverse refuses: `deleteRecord` then throws, as the real one does on `{ success: false }`. */
let refusedDeletes = new Set<string>();
/** Ids whose update the service answers with { success: false }. */
const failingUpdates = new Set<string>();

vi.mock("./client", () => ({
  fetchAll: async (label: string, _page: unknown, options: unknown) => {
    (queriedBy[label] ??= []).push(options);
    return rowsByLabel[label] ?? [];
  },
  deleteRecord: async (operation: string, entitySet: string, id: string) => {
    if (refusedDeletes.has(id)) throw new Error(`${operation} failed: refused`);
    writes.push({ op: "delete", table: DELETE_TABLE[entitySet] ?? entitySet, id });
  },
  // dvopt CB-03: the app's deletes go through `deleteIfExists`; with no 404 in this double it is `deleteRecord`.
  deleteIfExists: async (operation: string, entitySet: string, id: string) => {
    if (refusedDeletes.has(id)) throw new Error(`${operation} failed: refused`);
    writes.push({ op: "delete", table: DELETE_TABLE[entitySet] ?? entitySet, id });
  },
}));
// dvopt CB-01 / CB-14: the existence guard and the stable-id read-back are tested in costUpdateGuard.test.ts / periodWrites.dvopt.test.ts.
const guard = vi.hoisted(() => ({
  /** Every existence read: [operation, entitySet, ids]. */
  reads: [] as [string, string, string[]][],
  /** Ids the double reports as deleted by someone else. */
  missing: new Set<string>(),
  /** Ids whose retried create the read-back finds already there. */
  landed: new Set<string>(),
}));
vi.mock("./costUpdateGuard", async () => {
  const { RecordGoneError } = await import("@/platform/errors");
  return {
    assertRowsExist: async (operation: string, entitySet: string, ids: string[]) => {
      guard.reads.push([operation, entitySet, [...ids]]);
      const gone = ids.find((id) => guard.missing.has(id));
      if (gone) throw new RecordGoneError(operation, entitySet, gone);
    },
    rowExists: async (_operation: string, _entitySet: string, id: string) => guard.landed.has(id),
  };
});

/** A generated service double that records what it was asked to write. */
function service(table: string, idColumn: string) {
  return {
    getAll: async () => ({ success: true, data: [] }),
    create: async (fields: Record<string, unknown>) => {
      const id = nextId(table);
      writes.push({ op: "create", table, id, fields });
      return { success: true, data: { [idColumn]: id } };
    },
    update: async (id: string, fields: Record<string, unknown>) => {
      if (failingUpdates.has(id)) return { success: false, error: new Error("refused") };
      writes.push({ op: "update", table, id, fields });
      return { success: true, data: {} };
    },
    delete: async (id: string) => {
      writes.push({ op: "delete", table, id });
      return { success: true, data: {} };
    },
  };
}

vi.mock("@/generated/services/Vsb_opexprojectcostsService", () => ({
  Vsb_opexprojectcostsService: service("opex", "vsb_opexprojectcostid"),
}));
vi.mock("@/generated/services/Vsb_landleaseprojectcostsService", () => ({
  Vsb_landleaseprojectcostsService: service("llcost", "vsb_landleaseprojectcostid"),
}));
vi.mock("@/generated/services/Vsb_landleaseperiodsService", () => ({
  Vsb_landleaseperiodsService: service("llperiod", "vsb_landleaseperiodid"),
}));
vi.mock("@/generated/services/Vsb_landleaseallocationwtgsService", () => ({
  Vsb_landleaseallocationwtgsService: service("llalloc", "vsb_landleaseallocationwtgid"),
}));
vi.mock("@/generated/services/Vsb_opexaccountsService", () => ({
  Vsb_opexaccountsService: service("opexaccount", "vsb_opexaccountid"),
}));
vi.mock("@/generated/services/Vsb_opexsubaccountsService", () => ({
  Vsb_opexsubaccountsService: service("opexsub", "vsb_opexsubaccountid"),
}));
vi.mock("@/generated/services/Vsb_landleasesubaccountsService", () => ({
  Vsb_landleasesubaccountsService: service("llsub", "vsb_landleasesubaccountid"),
}));
vi.mock("@/generated/services/Vsb_devicetypesinprojectsService", () => ({
  Vsb_devicetypesinprojectsService: service("device", "vsb_devicetypesinprojectid"),
}));
vi.mock("@/generated/services/Vsb_generatortypeinprojectsService", () => ({
  Vsb_generatortypeinprojectsService: service("gen", "vsb_generatortypeinprojectid"),
}));
vi.mock("@/generated/services/Vsb_pvmoduletypeinprojectsService", () => ({
  Vsb_pvmoduletypeinprojectsService: service("pv", "vsb_pvmoduletypeinprojectid"),
}));
vi.mock("@/generated/services/Vsb_opexlandleasestandardassumptionsesService", () => ({
  Vsb_opexlandleasestandardassumptionsesService:
    service("assumption", "vsb_opexlandleasestandardassumptionsid"),
}));
vi.mock("@/generated/services/TransactioncurrenciesService", () => ({
  TransactioncurrenciesService: service("currency", "transactioncurrencyid"),
}));
vi.mock("@/generated/services/Vsb_countryinflationprofilesService", () => ({
  Vsb_countryinflationprofilesService: service("inflation", "vsb_countryinflationprofileid"),
}));

const {
  addStandardContract, deletePeriod, opexStandardName, savePeriod,
} = await import("./periodWrites");
const { standardCostName } = await import("@/features/cost/periods/opexRules");
const { mapOpexRow } = await import("./costBook");
const { invalidateCurrencies } = await import("./currencies");
const { resetStableCreateIds } = await import("./stableCreateId");
const { RecordGoneError } = await import("@/platform/errors");

/* ══════════════════════════════════════════════════════════════ fixtures ══ */

const QUELLENDORF = "ac3168e6-2b7c-ef11-ac20-6045bda08851";
const GERMANY = "1cf4a2b6-d2d0-ee11-9079-000d3ab6fed7";
const BUSINESS_UNIT = "7f4aade5-2b7c-ef11-ac20-000d3a466ab7";
const EURO = "b8b1e37d-1f57-ea11-a811-000d3a4a9d2f";

/** The real O&M sub-account and one of Quellendorf's three device types. */
const OM_ACCOUNT = "3a1e4d8f-1f57-ea11-a811-000d3a4a9d21";
const OTHER_ACCOUNT = "3a1e4d8f-1f57-ea11-a811-000d3a4a9d22";
const OM_SUBACCOUNT = "61a30faa-b7e1-eddc-a5b5-fc1376f538f5";
const OTHER_SUBACCOUNT = "a24d0c2b-ed2a-ee52-ac21-b4b2eb73e752";
const GENERATOR_TYPE = "367d82b9-0643-e55f-b768-0436342290ba";
const DEVICE_WTG_1630 = "1b1cb4ed-0b64-effb-b30b-6212d05ad0ff";

const CTX = {
  projectId: QUELLENDORF,
  owningBusinessUnitId: BUSINESS_UNIT,
  projectName: "Quellendorf I",
};

/** The reference tables `resolveOpexGroupTarget` walks, as VSBCloud_Dev has them. */
function opexReferenceRows() {
  return {
    // OPT-11 (B3): the save-time currency lookup now reads the shared currency table (ACTIVE view), under the shared read's label.
    "list transaction currencies (Cost reads)": [{ transactioncurrencyid: EURO, currencyname: "Euro" }],
    "list OPEX accounts": [
      { vsb_opexaccountid: OM_ACCOUNT, vsb_name: "Operation & Maintenance", vsb_order: 1 },
      { vsb_opexaccountid: OTHER_ACCOUNT, vsb_name: "Other OPEX Costs", vsb_order: 2 },
    ],
    "list OPEX subaccounts for a period save": [
      { vsb_opexsubaccountid: OM_SUBACCOUNT, vsb_name: "Operation & Maintenance", vsb_order: 1,
        _vsb_account_value: OM_ACCOUNT },
      { vsb_opexsubaccountid: OTHER_SUBACCOUNT, vsb_name: "Insurance", vsb_order: 1,
        _vsb_account_value: OTHER_ACCOUNT },
    ],
    "list generator types in project for a period save": [
      { vsb_generatortypeinprojectid: GENERATOR_TYPE },
    ],
    "list PV module types in project for a period save": [],
    "list device types in project for a period save": [
      { vsb_devicetypesinprojectid: DEVICE_WTG_1630, vsb_name: "WTG-1630" },
    ],
  };
}

const OM_PERIOD: CostPeriod = {
  id: "draft",
  group: "WTG-1630",
  mode: "om",
  description: "Initialized O&M Contract",
  startDate: "2023-03-24",
  years: 5,
  months: 0,
  currency: "Euro",
  fixed: 12_000,
  revenue: 0,
  perMwh: 4.1,
  perMw: 0,
  perWtg: 67_500,
  aggregation: "SUM",
  frequency: 1,
  inflation: true,
  countryInflation: false,
  inflationYear: 2024,
  inflationPercent: 2,
  inflationCountryArea: "",
  threshold: false,
  align: true,
  external: false,
  standard: false,
  isStartDateStandard: false,
};

const created = (table: string) => writes.find((w) => w.op === "create" && w.table === table);
const fieldsOf = (w: Write | undefined) => (w?.fields ?? {}) as Record<string, unknown>;

beforeEach(() => {
  // B2 (OPT-07b/c): the currency table and the chart are read through short-lived shared reads; each case starts with them empty.
  invalidateCurrencies();
  rowsByLabel = {};
  queriedBy = {};
  writes = [];
  failingUpdates.clear();
  guard.reads.length = 0;
  guard.missing.clear();
  guard.landed.clear();
  resetStableCreateIds();
  for (const key of Object.keys(NEW_ID)) delete NEW_ID[key];
});

/* ══════════════════════════════════════════════════════ O&M / Other OPEX ══ */

describe("saveOpexPeriod", () => {
  beforeEach(() => { rowsByLabel = { ...opexReferenceRows() }; });

  it("UT-PWRITE-001 creates a chain HEAD with no Parent Cost and the canvas' name", async () => {
    NEW_ID.opex = ["9d3168e6-2b7c-ef11-ac20-6045bda08851"];
    const saved = await savePeriod(CTX, OM_PERIOD, true);

    const fields = fieldsOf(created("opex"));
    // `subaccount.Name & "-" & device.Name & "-" & Description` — the O&M branch of
    // `OpexCostScreenCode.txt:8695`. The chain's read order is `Sort(children, Name)` over this
    // exact string, so the composition is load-bearing, not cosmetic.
    expect(fields.vsb_name).toBe("Operation & Maintenance-WTG-1630-Initialized O&M Contract");
    expect(fields["vsb_Project@odata.bind"]).toBe(`/vsb_projects(${QUELLENDORF})`);
    expect(fields["vsb_Subaccount@odata.bind"]).toBe(`/vsb_opexsubaccounts(${OM_SUBACCOUNT})`);
    expect(fields["vsb_DeviceTypeInProject@odata.bind"])
      .toBe(`/vsb_devicetypesinprojects(${DEVICE_WTG_1630})`);
    // `ProjectDocs/instructions/CONVENTIONS.md` rule 4 — every create on project data binds the owning business unit.
    expect(fields["owningbusinessunit@odata.bind"]).toBe(`/businessunits(${BUSINESS_UNIT})`);
    // A head has no parent, and a null `@odata.bind` in a CREATE body is not "no link" — it is
    // an error. The key must be absent.
    expect(fields).not.toHaveProperty("vsb_ParentCost@odata.bind");

    expect(saved.contractId).toBe("9d3168e6-2b7c-ef11-ac20-6045bda08851");
    expect(saved.periodIndex).toBe(1);
  });

  it("UT-PWRITE-002 links a later period to the chain HEAD, not to its predecessor", async () => {
    const HEAD = "9d3168e6-2b7c-ef11-ac20-6045bda08851";
    const P2 = "cf6ea3de-0787-ebb6-bade-d45204e617ed";
    NEW_ID.opex = ["7db92415-8111-e7ee-bd6c-032eeb14100b"];
    // Period 2 already exists under the head; this is period 3, and its parent is still the HEAD.
    rowsByLabel["list OPEX chain children"] = [
      { vsb_opexprojectcostid: P2, vsb_name: "Operation & Maintenance-WTG-1630-Initialized O&M Contract - 2" },
      { vsb_opexprojectcostid: "7db92415-8111-e7ee-bd6c-032eeb14100b",
        vsb_name: "Operation & Maintenance-WTG-1630-Initialized O&M Contract - 3" },
    ];

    const saved = await savePeriod(
      CTX,
      { ...OM_PERIOD, description: "Initialized O&M Contract - 3", parentId: HEAD, contractId: HEAD },
      true,
    );

    expect(fieldsOf(created("opex"))["vsb_ParentCost@odata.bind"])
      .toBe(`/vsb_opexprojectcosts(${HEAD})`);
    expect(saved.contractId).toBe(HEAD);
    // Read back from the chain rather than assumed: the slot follows `vsb_name` ordering.
    expect(saved.periodIndex).toBe(3);
  });

  it("UT-PWRITE-003 cascades the eleven contract-level fields from a head onto every period", async () => {
    /*
     * `OpexCostScreenCode.txt:8695` — after the head's own Patch,
     * `ForAll(Filter(costs, 'Parent Cost' = saved), Patch(child, {Use Inflation Profile, Use
     * Country Inflation Profile, Inflation Profile, Inflation Start Year, Inflation Country Area,
     * Threshold, Threshold individual, Threshold Type, Align With Project Duration,
     * External Contract?}))`. Dates, durations and money are per period and must NOT cascade.
     */
    const HEAD = "9d3168e6-2b7c-ef11-ac20-6045bda08851";
    rowsByLabel["list OPEX chain children"] = [
      { vsb_opexprojectcostid: "child-b", vsb_name: "…- 3" },
      { vsb_opexprojectcostid: "child-a", vsb_name: "…- 2" },
    ];

    await savePeriod(
      CTX,
      { ...OM_PERIOD, id: HEAD, inflationPercent: 3.5, align: false, external: true },
      false,
    );

    const cascades = writes.filter((w) => w.op === "update" && w.id?.startsWith("child-"));
    expect(cascades.map((w) => w.id)).toEqual(["child-a", "child-b"]);
    for (const c of cascades) {
      expect(c.fields).toEqual({
        vsb_useinflationprofile: true,
        vsb_usecountryinflationprofile: false,
        vsb_inflationprofile: 3.5,
        vsb_inflationstartyear: 2024,
        vsb_inflationcountryarea: null,
        vsb_threshold: false,
        vsb_thresholdindividual: null,
        vsb_thresholdtype: null,
        // Edited canvas: the saved row's flag is copied too (eleven fields).
        vsb_isstartdatestandardassumption: false,
        vsb_alignwithprojectduration: false,
        vsb_externalcontract: true,
      });
      // The per-period columns are deliberately absent — a cascade must not move a child's dates.
      expect(c.fields).not.toHaveProperty("vsb_startdate");
      expect(c.fields).not.toHaveProperty("vsb_fixcosts");
    }
  });

  it("UT-PWRITE-004 clears Threshold Type and Threshold individual when the toggle goes off", async () => {
    // Omitting the two columns — which is what this did — leaves an Individual threshold on a
    // row the user has just switched off, and the cascade then copies it onto the whole chain.
    await savePeriod(CTX, { ...OM_PERIOD, id: QUELLENDORF, threshold: false }, false);
    const fields = fieldsOf(writes.find((w) => w.op === "update" && w.table === "opex"));
    expect(fields.vsb_threshold).toBe(false);
    expect(fields.vsb_thresholdtype).toBeNull();
    expect(fields.vsb_thresholdindividual).toBeNull();

    writes = [];
    await savePeriod(
      CTX,
      {
        ...OM_PERIOD, id: QUELLENDORF, threshold: true,
        thresholdType: 952850001, thresholdIndividual: 222, perMwh: 33,
      },
      false,
    );
    const on = fieldsOf(writes.find((w) => w.op === "update" && w.table === "opex"));
    /*
     * The PANEL'S OWN two controls. `rdg_…_Threshold.Items` is `Choices(Thresholds)` (`:8302`)
     * and the save writes `.Selected.Value` — p90 here — where this used to hard-code
     * `Individual`; and `'Threshold individual': Value(txt_…_Threshold_Individual.Value)`
     * (`:8695`) is its own column, where this used to copy `vsb_eurmwh`.
     *
     * Measured on VSBCloud_Dev, 16 Sep: all 8 live rows with a threshold hold
     * `vsb_thresholdindividual` 222.00 against a `vsb_eurmwh` of 33.00 or 990.00, so the old
     * copy would have destroyed the stored threshold on every one of them.
     */
    expect(on.vsb_thresholdtype).toBe(952850001);
    expect(on.vsb_thresholdindividual).toBe(222);
    expect(on.vsb_eurmwh).toBe(33);
  });

  it("UT-PWRITE-040 composes Name from the RAW description, adds Time Zone 4 and never writes Is Standard Contract", async () => {
    // FT-BR-OPEX-073 (run 3): `Name: … & txt_Description.Value` (raw), `Description: Trim(…)`,
    // `'Time Zone Rule Version Number': 4`, and no `'Is Standard Contract?'` in the Patch.
    NEW_ID.opex = ["9d3168e6-2b7c-ef11-ac20-6045bda08851"];
    await savePeriod(
      CTX, { ...OM_PERIOD, description: "Initialized O&M Contract", rawDescription: "Initialized O&M Contract " },
      true,
    );
    const f = fieldsOf(created("opex"));
    expect(f.vsb_name).toBe("Operation & Maintenance-WTG-1630-Initialized O&M Contract ");
    expect(f.vsb_description).toBe("Initialized O&M Contract");
    expect(f.timezoneruleversionnumber).toBe(4);
    expect(f).not.toHaveProperty("vsb_isstandardcontract");
    // The cascade stays ten columns.
    expect(Object.keys(f)).toContain("vsb_isstartdatestandardassumption");
  });

  it("UT-PWRITE-043 keeps the reset Threshold Type and Individual value when the toggle is off", async () => {
    // FT-BR-OPEX-079 (run 3): `'Threshold Type': rdg.Selected.Value`, `'Threshold individual':
    // Value(txt.Value)` are written whatever `Threshold` says.
    await savePeriod(
      CTX,
      { ...OM_PERIOD, id: QUELLENDORF, threshold: false, thresholdType: 952850002, thresholdIndividual: 12.5 },
      false,
    );
    const f = fieldsOf(writes.find((w) => w.op === "update" && w.table === "opex"));
    expect(f.vsb_threshold).toBe(false);
    expect(f.vsb_thresholdtype).toBe(952850002);
    expect(f.vsb_thresholdindividual).toBe(12.5);
  });

  /* ── Edited canvas (6 Nov 2026): the Save re-chains the periods that follow ── */

  const HEAD_ID = "9d3168e6-2b7c-ef11-ac20-6045bda08851";
  const chainPeriod = (id: string, startDate: string, years: number, parentId?: string): CostPeriod =>
    ({ ...OM_PERIOD, id, startDate, years, months: 0, parentId, contractId: HEAD_ID });
  const book = [
    chainPeriod(HEAD_ID, "2027-01-01", 1),
    chainPeriod("p2", "2028-01-01", 1, HEAD_ID),
    chainPeriod("p3", "2029-01-01", 1, HEAD_ID),
  ];

  it("UT-PWRITE-044 an edited start date or duration re-chains the following periods, one PATCH each", async () => {
    const warnings: string[] = [];
    const before = book[0]!;
    await savePeriod(CTX, { ...before, years: 2 }, false, { before, bookPeriods: book, warnings });
    const moves = writes.filter((w) => w.op === "update" && (w.id === "p2" || w.id === "p3"));
    expect(moves.map((w) => [w.id, w.fields])).toEqual([
      ["p2", { vsb_startdate: "2029-01-01" }],
      ["p3", { vsb_startdate: "2030-01-01" }],
    ]);
    expect(warnings).toEqual([]);
  });

  it("UT-PWRITE-045 no re-chain on an Add, an unchanged start/duration, or without the screen's extras", async () => {
    const before = book[0]!;
    await savePeriod(CTX, { ...before, fixed: 1 }, false, { before, bookPeriods: book });
    expect(writes.filter((w) => w.id === "p2" || w.id === "p3")).toEqual([]);
    await savePeriod(CTX, { ...before, years: 2 }, false);
    expect(writes.filter((w) => w.id === "p2" || w.id === "p3")).toEqual([]);
    NEW_ID.opex = ["7db92415-8111-e7ee-bd6c-032eeb14100b"];
    await savePeriod(CTX, { ...book[2]!, id: "new", years: 3, parentId: HEAD_ID }, true,
      { before: null, bookPeriods: book });
    expect(writes.filter((w) => w.id === "p2" || w.id === "p3")).toEqual([]);
  });

  it("UT-PWRITE-046 a failed re-chain PATCH is reported as the canvas' Notify text and the save goes on", async () => {
    const warnings: string[] = [];
    const before = book[0]!;
    failingUpdates.add("p2");
    const saved = await savePeriod(CTX, { ...before, years: 2 }, false, { before, bookPeriods: book, warnings });
    expect(saved.id).toBe(HEAD_ID);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(
      /^Error: the start dates of the following periods could not be updated\. Internal error: originated on Save\. Message: /,
    );
    // The other period is still moved.
    expect(writes.some((w) => w.id === "p3" && w.fields?.vsb_startdate === "2030-01-01")).toBe(true);
  });

  it("UT-PWRITE-047 a failed child cascade is reported and the save continues; without a sink it still throws", async () => {
    rowsByLabel["list OPEX chain children"] = [{ vsb_opexprojectcostid: "child-a", vsb_name: "…- 2" }];
    failingUpdates.add("child-a");
    const warnings: string[] = [];
    await savePeriod(CTX, { ...OM_PERIOD, id: HEAD_ID }, false, { before: null, bookPeriods: [], warnings });
    expect(warnings[0]).toMatch(/^Error: the child periods could not be updated\. Internal error: originated on Save\. Message: /);
    await expect(savePeriod(CTX, { ...OM_PERIOD, id: HEAD_ID }, false)).rejects.toThrow(/child periods could not be updated/);
  });
  it("UT-PWRITE-048 a Blank Start Date flag stays Blank on the row and on the cascade, never false", async () => {
    // Canvas Save: `IsStartDateStandardAssumption: Coalesce(parent flag, locIsStartDateStandardAssumption)`;
    // for a root whose stored flag is Blank both are Blank, and the cascade copies the saved row's value.
    rowsByLabel["list OPEX chain children"] = [{ vsb_opexprojectcostid: "child-a", vsb_name: "x- 2" }];
    await savePeriod(CTX, { ...OM_PERIOD, id: HEAD_ID, isStartDateStandard: null }, false);
    const upd = writes.filter((w) => w.op === "update" && w.table === "opex");
    expect(fieldsOf(upd[0])).toHaveProperty("vsb_isstartdatestandardassumption", null);
    const cascade = writes.find((w) => w.op === "update" && w.id === "child-a");
    expect(fieldsOf(cascade)).toHaveProperty("vsb_isstartdatestandardassumption", null);
    // An explicit No and Yes are still written as they are.
    writes = [];
    await savePeriod(CTX, { ...OM_PERIOD, id: HEAD_ID, isStartDateStandard: false }, false);
    expect(fieldsOf(writes.find((w) => w.op === "update" && w.table === "opex")))
      .toHaveProperty("vsb_isstartdatestandardassumption", false);
  });
  it("UT-PWRITE-049 an Edit re-binds the owning business unit, as the canvas' unconditional Patch (D123)", async () => {
    // `'Owning Business Unit': gblSelectedProject.'Besitzer (Unternehmenseinheit)'` (`:8794`) — on every save.
    await savePeriod(CTX, { ...OM_PERIOD, id: HEAD_ID }, false);
    const upd = writes.find((w) => w.op === "update" && w.table === "opex" && w.id === HEAD_ID);
    expect(fieldsOf(upd)["owningbusinessunit@odata.bind"]).toBe(`/businessunits(${BUSINESS_UNIT})`);
    // Without a business unit in the context nothing is bound (no empty `@odata.bind`).
    writes = [];
    await savePeriod({ ...CTX, owningBusinessUnitId: undefined }, { ...OM_PERIOD, id: HEAD_ID }, false);
    expect(fieldsOf(writes.find((w) => w.op === "update" && w.table === "opex")))
      .not.toHaveProperty("owningbusinessunit@odata.bind");
  });
  it("UT-PWRITE-023 defaults the threshold type to Individual only when the panel sent none", async () => {
    // 952850002 "Individual", measured in `stringmap` on 16 Sep — the value all 8 live rows hold.
    await savePeriod(
      CTX,
      { ...OM_PERIOD, id: QUELLENDORF, threshold: true, thresholdIndividual: 12 },
      false,
    );
    const fields = fieldsOf(writes.find((w) => w.op === "update" && w.table === "opex"));
    expect(fields.vsb_thresholdtype).toBe(952850002);
    expect(fields.vsb_thresholdindividual).toBe(12);
  });

  it("UT-PWRITE-024 writes all three aggregation choices, MIN included", async () => {
    // `Aggregation: drp_…_Aggregation.Selected.Value` over `Choices('Opex Aggregation')`.
    // Four live rows carry MIN; `MAX ? max : sum` rewrote every one of them to SUM on save.
    for (const [union, value] of [["SUM", 952850000], ["MAX", 952850001], ["MIN", 952850002]] as const) {
      writes = [];
      await savePeriod(CTX, { ...OM_PERIOD, id: QUELLENDORF, aggregation: union }, false);
      const fields = fieldsOf(writes.find((w) => w.op === "update" && w.table === "opex"));
      expect(fields.vsb_aggregation).toBe(value);
    }
  });

  it("UT-PWRITE-025 stores a blank rate as null, not as zero", async () => {
    // `'Fix Costs': Value(txt.Value)` and `Value("")` is `Blank()`. Writing 0 invents a figure
    // the user never typed, and on Land Lease it also prints `0` in a cell the canvas leaves
    // empty.
    await savePeriod(
      CTX,
      { ...OM_PERIOD, id: QUELLENDORF, fixed: null, revenue: 0, perMwh: null, perMw: null, perWtg: null },
      false,
    );
    const fields = fieldsOf(writes.find((w) => w.op === "update" && w.table === "opex"));
    expect(fields.vsb_fixcosts).toBeNull();
    expect(fields.vsb_eurmwh).toBeNull();
    // A STORED zero is still stored — blank and zero are different answers.
    expect(fields.vsb_ofrevenues).toBe(0);
  });

  it("UT-PWRITE-005 writes vsb_inflationcountryarea only while the country toggle is on", async () => {
    /*
     * The column the first pass never wrote at all. A TEXT column, not a lookup: measured
     * 16 Sep, 982 OPEX rows hold "North" and "Centre - North", 978 blank. The canvas writes
     * `If(countryToggle, areaDropdown.Selected.Value, Blank())` and takes the dropdown's Items
     * from `Distinct(Filter('Country Inflation Profiles', Country = project's country).Area)`.
     */
    await savePeriod(
      CTX,
      { ...OM_PERIOD, id: QUELLENDORF, countryInflation: true, inflationCountryArea: "Centre - North" },
      false,
    );
    let fields = fieldsOf(writes.find((w) => w.op === "update" && w.table === "opex"));
    expect(fields.vsb_inflationcountryarea).toBe("Centre - North");
    /*
     * The RESOLVED country percentage is stored, not blanked. `'Inflation Profile'` is
     * `If(tgl_InflationProfile.Checked, Value(txt_InflationProfile.Value), Blank())` (`:8695`),
     * gated on the INFLATION toggle alone — and `txt_…_InflationProfile`, though hidden while the
     * country toggle is on, still evaluates its `Value` to
     * `Max(LookUp('Country Inflation Profiles', country && year [&& area]).Inflation, 0)`
     * (`:7822-7847`). The screen resolves that figure and hands it over as `inflationPercent`.
     */
    expect(fields.vsb_inflationprofile).toBe(OM_PERIOD.inflationPercent);

    writes = [];
    await savePeriod(
      CTX,
      { ...OM_PERIOD, id: QUELLENDORF, countryInflation: false, inflationCountryArea: "Centre - North" },
      false,
    );
    fields = fieldsOf(writes.find((w) => w.op === "update" && w.table === "opex"));
    expect(fields.vsb_inflationcountryarea).toBeNull();
  });

  it("UT-PWRITE-006 names an Other OPEX row after its ACCOUNT and sub-account, with no device", async () => {
    // `account.Name & "-" & subaccount.Name & "-" & Description` — the other branch of `:8695`.
    NEW_ID.opex = ["9d3168e6-2b7c-ef11-ac20-6045bda08852"];
    await savePeriod(
      CTX, { ...OM_PERIOD, mode: "other", group: "Insurance", description: "Broker fee" }, true,
    );
    const fields = fieldsOf(created("opex"));
    expect(fields.vsb_name).toBe("Other OPEX Costs-Insurance-Broker fee");
    expect(fields["vsb_Subaccount@odata.bind"]).toBe(`/vsb_opexsubaccounts(${OTHER_SUBACCOUNT})`);
    expect(fields).not.toHaveProperty("vsb_DeviceTypeInProject@odata.bind");
  });
});

describe("deleteOpexPeriod", () => {
  beforeEach(() => { rowsByLabel = { ...opexReferenceRows() }; });

  it("UT-PWRITE-007 deletes a head's children FIRST, then the head", async () => {
    /*
     * `:8861-8874` — `If(IsBlank('Parent Cost'), RemoveIf(Or('Parent Cost' = X, id = X)), …)`.
     * Children first so an interrupted delete leaves a shorter chain (which the screen renders
     * and the user can finish) rather than orphan rows pointing at a head that is already gone.
     */
    const HEAD = "9d3168e6-2b7c-ef11-ac20-6045bda08851";
    rowsByLabel["list OPEX chain children"] = [
      { vsb_opexprojectcostid: "child-b", vsb_name: "…- 3" },
      { vsb_opexprojectcostid: "child-a", vsb_name: "…- 2" },
    ];

    await deletePeriod({ ...OM_PERIOD, id: HEAD, contractId: HEAD, periodIndex: 1 });

    expect(writes.map((w) => `${w.op}:${w.id}`))
      .toEqual(["delete:child-a", "delete:child-b", `delete:${HEAD}`]);
  });

  it("UT-PWRITE-008 deletes a later period alone", async () => {
    const P3 = "7db92415-8111-e7ee-bd6c-032eeb14100b";
    rowsByLabel["list OPEX chain children"] = [];
    await deletePeriod({
      ...OM_PERIOD, id: P3, parentId: QUELLENDORF, contractId: QUELLENDORF, periodIndex: 3,
    });
    expect(writes.map((w) => `${w.op}:${w.id}`)).toEqual([`delete:${P3}`]);
  });
});

/* ══════════════════════════════════════════════════════════════ Land Lease ══ */

/*
 * OPT-34 (B3): the slot-based Land Lease branch of this module (saveLandLeasePeriod, deleteLandLeasePeriod, addLandLeaseStandardContract and
 * their helpers) had no caller outside these tests: the Land Lease screen writes through `applyLeaseWrites` (`data/landLease.test.ts`,
 * `landLease.writes.test.ts`, `landLeaseRules.test.ts`) and, since B2, the OPEX book holds no Land Lease period. It was removed together
 * with the tests that pinned only it (UT-PWRITE-009 to 015, 019, 021, 026 to 029, 032). What stays is the refusal below.
 */
describe("a Land Lease period is not written through the OPEX period writes", () => {
  it("UT-PWRITE-050 savePeriod, deletePeriod and addStandardContract refuse mode \"land\" and send nothing (OPT-34)", async () => {
    const land = { ...OM_PERIOD, mode: "land" as const, group: "Locations" };
    await expect(savePeriod(CTX, land, true)).rejects.toThrow(/applyLeaseWrites/);
    await expect(savePeriod(CTX, land, false)).rejects.toThrow(/applyLeaseWrites/);
    await expect(deletePeriod(land)).rejects.toThrow(/applyLeaseWrites/);
    await expect(addStandardContract(CTX, { mode: "land", group: "Locations", codDate: "2027-03-24" })).rejects.toThrow(/applyLeaseWrites/);
    expect(writes).toEqual([]);
    expect(queriedBy).toEqual({});
  });
});

/* ══════════════════════════════════════════════════ Add Standard Contract ══ */

/**
 * `vsb_opexlandleasestandardassumptionses` — the catalogue the seeded chain is built from.
 *
 * `vsb_typeofcontract` measured 16 Sep: Landlease 952850000, Opex O&M 952850001,
 * Opex Other 952850002. `vsb_period` runs Period1 952850000 .. Period10 952850009.
 */
const assumption = (n: number, over: Record<string, unknown> = {}) => ({
  vsb_opexlandleasestandardassumptionsid: `a${n}`,
  vsb_name: "Standard O&M",
  vsb_description: n === 1 ? "Standard O&M" : `Standard O&M - ${n}`,
  vsb_period: 952850000 + (n - 1),
  _vsb_currency_value: EURO,
  vsb_durationinyears: 5,
  vsb_durationinmonths: 0,
  vsb_fixcosts: 1_000 * n,
  vsb_aggregation: 952850000,
  vsb_distributionfrequency: 1,
  vsb_useinflationprofile: true,
  vsb_usecountryinflationprofile: false,
  vsb_inflationprofile: 2,
  vsb_alignwithprojectduration: true,
  ...over,
});

describe("addStandardContract", () => {
  const ARGS = {
    mode: "om" as const,
    group: "WTG-1630",
    countryId: GERMANY,
    technology: 952850000,
    codDate: "2027-03-24",
    countryInflationPercent: 1.8,
  };

  beforeEach(() => { rowsByLabel = { ...opexReferenceRows() }; });

  it("UT-PWRITE-016 seeds a CHAIN from the assumptions, chaining the start dates", async () => {
    /*
     * `OpexCostScreenCode.txt:631-916` / `:3019-3300`: Period 1 starts at COD, and each later
     * period starts at the PREVIOUS period's start plus the previous period's duration —
     * `DateAdd(prev.'Start Date', prev.years * 12 + prev.months, TimeUnit.Months)`. Every row is
     * `Is Standard Contract? = Yes` and `IsStartDateStandardAssumption = Yes`, and only the first
     * has a blank `Parent Cost`.
     */
    rowsByLabel["check for an existing OPEX standard contract"] = [];
    rowsByLabel["list OPEX / Land Lease standard assumptions"] =
      [assumption(1), assumption(2), assumption(3)];
    NEW_ID.opex = [
      "9d3168e6-2b7c-ef11-ac20-6045bda08851",
      "cf6ea3de-0787-ebb6-bade-d45204e617ed",
      "7db92415-8111-e7ee-bd6c-032eeb14100b",
    ];

    const seeded = await addStandardContract(CTX, ARGS);

    expect(seeded.map((p) => p.startDate)).toEqual(["2027-03-24", "2032-03-24", "2037-03-24"]);
    expect(seeded.map((p) => p.periodIndex)).toEqual([1, 2, 3]);
    expect(new Set(seeded.map((p) => p.contractId)))
      .toEqual(new Set(["9d3168e6-2b7c-ef11-ac20-6045bda08851"]));

    const creates = writes.filter((w) => w.op === "create" && w.table === "opex");
    expect(creates).toHaveLength(3);
    expect(fieldsOf(creates[0])).not.toHaveProperty("vsb_ParentCost@odata.bind");
    for (const c of creates.slice(1)) {
      expect(fieldsOf(c)["vsb_ParentCost@odata.bind"])
        .toBe("/vsb_opexprojectcosts(9d3168e6-2b7c-ef11-ac20-6045bda08851)");
    }
    for (const c of creates) {
      expect(fieldsOf(c).vsb_isstandardcontract).toBe(true);
      expect(fieldsOf(c).vsb_isstartdatestandardassumption).toBe(true);
      // `'Inflation Start Year': recCODYear` — COD year + 1 on every seeded row.
      expect(fieldsOf(c).vsb_inflationstartyear).toBe(2028);
    }
  });

  it("UT-PWRITE-017 takes the COUNTRY's inflation when the assumption says to", async () => {
    // `Switch(true, useInflation && useCountryInflation, LookUp('Country Inflation Profiles',
    // Country = project's country && Year = recCODYear).Inflation, useInflation, own profile,
    // Blank())` — `:719-735`.
    rowsByLabel["check for an existing OPEX standard contract"] = [];
    rowsByLabel["list OPEX / Land Lease standard assumptions"] = [
      assumption(1, { vsb_usecountryinflationprofile: true, vsb_inflationcountryarea: "North" }),
    ];
    NEW_ID.opex = ["9d3168e6-2b7c-ef11-ac20-6045bda08851"];

    const [period] = await addStandardContract(CTX, ARGS);
    expect(period?.inflationPercent).toBe(1.8);
    expect(period?.countryInflation).toBe(true);
    // The country-area text goes with it, which is the one write path that fills that column
    // without a user ever touching the dropdown.
    expect(fieldsOf(created("opex")).vsb_inflationcountryarea).toBe("North");
  });

  it("UT-PWRITE-018 refuses when the scope already has a standard contract", async () => {
    // `If(CountRows(Filter(costs, project && 'Is Standard Contract?' = Yes && scope)) = 0, …)` —
    // the canvas simply does nothing; here it is an error, because a command that silently does
    // nothing reads as a broken button.
    rowsByLabel["check for an existing OPEX standard contract"] = [
      { vsb_opexprojectcostid: "existing" },
    ];
    await expect(addStandardContract(CTX, ARGS)).rejects.toThrow(/already has a standard contract/);
    expect(writes).toEqual([]);
  });

  it("UT-PWRITE-041 writes the canvas import's Name, COD year + 1, area and Blank profile on a no-inflation assumption", async () => {
    // FT-BR-OPEX-089 / 091 (run 3). `Name: "Operation & Maintenance" & "-" & locSelectedSubaccount.Name
    // & "-" & StandardAssumptionContract.Description` — no device name, RAW description; inflation
    // start year and area on every row; threshold copied whatever the toggle says.
    rowsByLabel["check for an existing OPEX standard contract"] = [];
    rowsByLabel["list OPEX / Land Lease standard assumptions"] = [
      assumption(1, {
        vsb_description: "Standard O&M ",
        vsb_useinflationprofile: false,
        vsb_inflationprofile: 5,
        vsb_inflationcountryarea: "North",
        vsb_threshold: false,
        vsb_thresholdtype: 952850001,
        vsb_thresholdindividual: 12.5,
      }),
    ];
    NEW_ID.opex = ["9d3168e6-2b7c-ef11-ac20-6045bda08851"];

    await addStandardContract(CTX, ARGS);
    const f = fieldsOf(created("opex"));
    expect(f.vsb_name).toBe("Operation & Maintenance-Operation & Maintenance-Standard O&M ");
    expect(f.vsb_name).toBe(standardCostName("om", "Operation & Maintenance", "Standard O&M "));
    expect(opexStandardName("other", "Insurance", "Standard X"))
      .toBe(standardCostName("other", "Insurance", "Standard X"));
    expect(f.vsb_description).toBe("Standard O&M");
    expect(f.vsb_inflationstartyear).toBe(2028);
    expect(f.vsb_inflationcountryarea).toBe("North");
    expect(f.vsb_inflationprofile).toBeNull();
    expect(f.vsb_thresholdtype).toBe(952850001);
    expect(f.vsb_thresholdindividual).toBe(12.5);
    expect(f).not.toHaveProperty("timezoneruleversionnumber");
  });

  it("UT-PWRITE-042 creates one contract per Period-1 assumption and parents the later periods on the first", async () => {
    rowsByLabel["check for an existing OPEX standard contract"] = [];
    rowsByLabel["list OPEX / Land Lease standard assumptions"] = [
      assumption(1, { vsb_description: "Standard A" }),
      assumption(1, { vsb_description: "Standard B" }),
      assumption(2, { vsb_description: "Standard A - 2" }),
    ];
    // Description order (the canvas `Sort(…, Description)`): A, A - 2, B.
    NEW_ID.opex = ["head-a", "p2", "head-b"];

    const seeded = await addStandardContract(CTX, ARGS);
    expect(seeded).toHaveLength(3);
    const creates = writes.filter((w) => w.op === "create" && w.table === "opex");
    expect(fieldsOf(creates[0])).not.toHaveProperty("vsb_ParentCost@odata.bind");
    expect(fieldsOf(creates[2])).not.toHaveProperty("vsb_ParentCost@odata.bind");
    expect(fieldsOf(creates[1])["vsb_ParentCost@odata.bind"]).toBe("/vsb_opexprojectcosts(head-a)");
    // Period 2 starts when the FIRST contract ends.
    expect(seeded[1]?.startDate).toBe("2032-03-24");
  });

});

/* ═══════════════════════════════════════════════════════════ round trips ══ */

/**
 * SAVE -> RELOAD, through the real write path and the real read mappers.
 *
 * This is the test the period screens did not have. Asserting the columns a save writes proves
 * only half of it: the read side has to find the same values in the same places, and the two
 * halves drifted apart in exactly that way twice — `vsb_currencyname` (written through
 * `vsb_Currency`, read from a column that does not exist) and the Land Lease Description
 * (written to the period's `vsb_name`, read from the header's `vsb_description`).
 */
describe("period round trip", () => {
  it("UT-PWRITE-020 an O&M period survives save and reload unchanged", async () => {
    rowsByLabel = { ...opexReferenceRows() };
    const HEAD = "9d3168e6-2b7c-ef11-ac20-6045bda08851";
    NEW_ID.opex = [HEAD];

    const source: CostPeriod = {
      ...OM_PERIOD,
      threshold: true,
      countryInflation: true,
      inflationCountryArea: "Centre - North",
      external: true,
      isStartDateStandard: true,
    };
    const saved = await savePeriod(CTX, source, true);
    const written = fieldsOf(created("opex"));

    // Drive the write's own output back through the loader's mapper, currency resolved the way
    // `loadOpexPeriods` resolves it (`_vsb_currency_value` -> `transactioncurrencies`).
    const reloaded = mapOpexRow(
      { ...written, vsb_opexprojectcostid: saved.id } as never,
      "WTG-1630",
      "om",
      "Euro",
      { contractId: saved.id, contractName: source.description, periodIndex: 1 },
    );

    expect(reloaded).toMatchObject({
      description: source.description,
      startDate: source.startDate,
      years: 5, months: 0,
      currency: "Euro",
      fixed: 12_000, perMwh: 4.1, perWtg: 67_500,
      aggregation: "SUM", frequency: 1,
      inflation: true, countryInflation: true,
      inflationYear: 2024,
      inflationCountryArea: "Centre - North",
      threshold: true, align: true, external: true, standard: false,
      isStartDateStandard: true,
      contractId: saved.id, periodIndex: 1,
    });
    // `parentId` is absent on a head, which is what makes it a head on the next delete.
    expect(reloaded.parentId).toBeUndefined();
  });

  it("UT-PWRITE-030 every aggregation choice survives save and reload, MIN included", async () => {
    /*
     * MEASURED, VSBCloud_Dev 16 Sep: 952 SUM · 18 MAX · **4 MIN**. While `CostPeriod.aggregation`
     * was `"SUM" | "MAX"` those four read back as SUM and the write map's `MAX ? max : sum`
     * stored SUM again — so opening and saving one of them silently changed the model's answer,
     * with no error anywhere.
     */
    for (const aggregation of ["SUM", "MAX", "MIN"] as const) {
      rowsByLabel = { ...opexReferenceRows() };
      writes = [];
      NEW_ID.opex = ["9d3168e6-2b7c-ef11-ac20-6045bda08851"];

      const saved = await savePeriod(CTX, { ...OM_PERIOD, aggregation }, true);
      const written = fieldsOf(created("opex"));
      const reloaded = mapOpexRow(
        { ...written, vsb_opexprojectcostid: saved.id } as never, "WTG-1630", "om",
      );
      expect(reloaded.aggregation).toBe(aggregation);
    }
  });

  it("UT-PWRITE-031 the threshold TYPE and the Individual figure survive save and reload", async () => {
    /*
     * Two separate columns, and both were lost. `vsb_thresholdtype` was hard-coded to
     * `Individual` on the way out and never mapped on the way in, so p75/p90 read back as
     * Individual; `vsb_thresholdindividual` was written from `vsb_eurmwh`, which on all 8 live
     * rows that carry a threshold is a DIFFERENT number (222.00 stored against 33.00 / 990.00).
     */
    for (const thresholdType of [952850000, 952850001, 952850002]) {
      rowsByLabel = { ...opexReferenceRows() };
      writes = [];
      NEW_ID.opex = ["9d3168e6-2b7c-ef11-ac20-6045bda08851"];

      const saved = await savePeriod(
        CTX,
        { ...OM_PERIOD, threshold: true, thresholdType, thresholdIndividual: 222, perMwh: 33 },
        true,
      );
      const written = fieldsOf(created("opex"));
      const reloaded = mapOpexRow(
        { ...written, vsb_opexprojectcostid: saved.id } as never, "WTG-1630", "om",
      );
      expect(reloaded.threshold).toBe(true);
      expect(reloaded.thresholdType).toBe(thresholdType);
      expect(reloaded.thresholdIndividual).toBe(222);
      // …and EUR/MWh is still its own, different number.
      expect(reloaded.perMwh).toBe(33);
    }

    // Switching the toggle off clears BOTH columns rather than leaving a stale threshold that
    // the chain cascade would then copy onto every period.
    rowsByLabel = { ...opexReferenceRows() };
    writes = [];
    NEW_ID.opex = ["9d3168e6-2b7c-ef11-ac20-6045bda08851"];
    const off = await savePeriod(CTX, { ...OM_PERIOD, threshold: false }, true);
    const reloadedOff = mapOpexRow(
      { ...fieldsOf(created("opex")), vsb_opexprojectcostid: off.id } as never, "WTG-1630", "om",
    );
    expect(reloadedOff.threshold).toBe(false);
    expect(reloadedOff.thresholdType).toBeUndefined();
    expect(reloadedOff.thresholdIndividual).toBeNull();
  });

  it("UT-PWRITE-022 an Other OPEX period survives save and reload unchanged", async () => {
    rowsByLabel = { ...opexReferenceRows() };
    NEW_ID.opex = ["9d3168e6-2b7c-ef11-ac20-6045bda08852"];

    const source: CostPeriod = {
      ...OM_PERIOD,
      mode: "other",
      group: "Insurance",
      description: "Broker fee",
      inflation: false,
      inflationPercent: 0,
      inflationYear: 0,
      align: false,
    };
    const saved = await savePeriod(CTX, source, true);
    const written = fieldsOf(created("opex"));

    const reloaded = mapOpexRow(
      { ...written, vsb_opexprojectcostid: saved.id } as never,
      "Insurance",
      "other",
      "Euro",
    );
    expect(reloaded).toMatchObject({
      mode: "other",
      group: "Insurance",
      description: "Broker fee",
      currency: "Euro",
      inflation: false, countryInflation: false,
      // Inflation off means both numbers are cleared, so they round-trip as blank and not as
      // whatever the row held before the toggle was turned off. D123: a blank % now reads back as
      // null (a stored 0.0 % stays 0); the start year still reads a blank as 0.
      inflationPercent: null, inflationYear: 0,
      align: false,
    });
  });
});

/* ═══════════════════════════ dvopt: upsert guard (CB-01), 404 as done (CB-03), stable create id (CB-14) ══ */

describe("dvopt — OPEX guard, gone-as-done and stable ids", () => {
  const HEAD = "9d3168e6-2b7c-ef11-ac20-6045bda08851";
  const chain = (id: string, startDate: string, parentId?: string): CostPeriod =>
    ({ ...OM_PERIOD, id, startDate, years: 1, months: 0, parentId, contractId: HEAD });
  const chainBook = [chain(HEAD, "2027-01-01"), chain("p2", "2028-01-01", HEAD), chain("p3", "2029-01-01", HEAD)];
  beforeEach(() => { rowsByLabel = { ...opexReferenceRows() }; });

  it("UT-OPEXDVOPT-001 an Edit reads the row and the followers it re-chains in ONE read before any write", async () => {
    const before = chainBook[0]!;
    await savePeriod(CTX, { ...before, years: 2 }, false, { before, bookPeriods: chainBook });
    expect(guard.reads).toEqual([["update OPEX period", "vsb_opexprojectcosts", [HEAD, "p2", "p3"]]]);
    expect(writes.some((w) => w.op === "update" && w.id === HEAD)).toBe(true);
  });

  it("UT-OPEXDVOPT-002 a row another user deleted refuses the Edit with RecordGoneError and NOTHING is written", async () => {
    guard.missing.add(HEAD);
    await expect(savePeriod(CTX, { ...OM_PERIOD, id: HEAD }, false)).rejects.toBeInstanceOf(RecordGoneError);
    expect(writes).toEqual([]);
  });

  it("UT-OPEXDVOPT-003 a deleted FOLLOWER refuses the whole Edit before the row itself is patched", async () => {
    guard.missing.add("p3");
    const before = chainBook[0]!;
    await expect(savePeriod(CTX, { ...before, years: 2 }, false, { before, bookPeriods: chainBook }))
      .rejects.toBeInstanceOf(RecordGoneError);
    expect(writes).toEqual([]);
  });

  it("UT-OPEXDVOPT-004 an Add reads nothing to guard (a create is not an upsert)", async () => {
    NEW_ID.opex = ["7db92415-8111-e7ee-bd6c-032eeb14100b"];
    await savePeriod(CTX, OM_PERIOD, true);
    expect(guard.reads).toEqual([]);
    expect(writes.filter((w) => w.op === "create")).toHaveLength(1);
  });

  it("UT-OPEXDVOPT-005 the Edit writes are the same with the guard on as with the flags off (oracle = the old code path)", async () => {
    const before = chainBook[0]!;
    await savePeriod(CTX, { ...before, years: 2 }, false, { before, bookPeriods: chainBook });
    const guarded = writes.map((w) => [w.op, w.table, w.id, w.fields]);
    writes = [];
    guard.reads.length = 0;
    vi.resetModules();
    vi.doMock("./leaseOpexFlags", () => ({
      GONE_AS_DONE_LEASE_OPEX: false, LEASE_GUARD: false, OPEX_GUARD: false, COST_REFRESH_ON_FAILURE: false, STABLE_CREATE_IDS: false,
    }));
    const legacy = await import("./periodWrites");
    await legacy.savePeriod(CTX, { ...before, years: 2 }, false, { before, bookPeriods: chainBook });
    vi.doUnmock("./leaseOpexFlags");
    vi.resetModules();
    expect(guard.reads).toEqual([]); // OPEX_GUARD off: no read
    expect(writes.map((w) => [w.op, w.table, w.id, w.fields])).toEqual(guarded);
  });

  it("UT-OPEXDVOPT-006 a create carries a client id; the SAME save retried keeps it, and a landed create is read back, not repeated", async () => {
    const sent: string[] = [];
    const svc = (await import("@/generated/services/Vsb_opexprojectcostsService")).Vsb_opexprojectcostsService as unknown as {
      create: (f: Record<string, unknown>) => Promise<unknown>;
    };
    const realCreate = svc.create;
    let fail = true;
    svc.create = async (f) => {
      sent.push(String(f.vsb_opexprojectcostid));
      if (fail) return { success: false, error: new Error("gateway timeout") };
      return realCreate(f);
    };
    try {
      await expect(savePeriod(CTX, OM_PERIOD, true)).rejects.toThrow();
      expect(sent[0]).toMatch(/^[0-9a-f-]{36}$/);
      // The retry, the row did NOT land (the read-back finds nothing): the same id is sent again.
      await expect(savePeriod(CTX, OM_PERIOD, true)).rejects.toThrow();
      expect(sent[1]).toBe(sent[0]);
      // The retry where the earlier POST had landed: the read-back finds it and NOTHING is created again.
      guard.landed.add(sent[0]!);
      fail = false;
      const count = sent.length;
      const saved = await savePeriod(CTX, OM_PERIOD, true);
      expect(sent.length).toBe(count);
      expect(saved.id).toBe(sent[0]);
      expect(writes.filter((w) => w.op === "create")).toEqual([]);
    } finally {
      svc.create = realCreate;
    }
  });

  it("UT-OPEXDVOPT-007 deleting a chain goes through the gone-as-done delete: children, then the head", async () => {
    rowsByLabel["list OPEX chain children"] = [
      { vsb_opexprojectcostid: "child-b", vsb_name: "…- 3" },
      { vsb_opexprojectcostid: "child-a", vsb_name: "…- 2" },
    ];
    await deletePeriod({ ...OM_PERIOD, id: HEAD, contractId: HEAD, periodIndex: 1 });
    expect(writes.map((w) => `${w.op}:${w.id}`)).toEqual(["delete:child-a", "delete:child-b", `delete:${HEAD}`]);
  });
});
