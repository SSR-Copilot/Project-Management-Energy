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
import type { CostPeriod } from "@/features/costing/model";

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

vi.mock("./client", () => ({
  fetchAll: async (label: string, _page: unknown, options: unknown) => {
    (queriedBy[label] ??= []).push(options);
    return rowsByLabel[label] ?? [];
  },
}));

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
  addStandardContract, deletePeriod, nextLandLeaseSlot, savePeriod,
} = await import("./periodWrites");
const { mapOpexRow, mapLandLeasePeriodRow } = await import("./costBook");
const { loadLeaseBook } = await import("./landLease");

/* ══════════════════════════════════════════════════════════════ fixtures ══ */

const QUELLENDORF = "ac3168e6-2b7c-ef11-ac20-6045bda08851";
const PROJECT_NEW_DATA = "910d8ed0-282a-ef11-840a-6045bd9e5ce7";
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

/** Two of the twelve `Locations` headers on Project New Data. */
const LOCATIONS = "cfc603b0-d2d0-ee11-9079-000d3abd8704";
const HDR_COST101 = "6f189e32-3c0a-f011-bae2-6045bd882926";

const CTX = {
  projectId: QUELLENDORF,
  owningBusinessUnitId: BUSINESS_UNIT,
  projectName: "Quellendorf I",
};

/** The reference tables `resolveOpexGroupTarget` walks, as VSBCloud_Dev has them. */
function opexReferenceRows() {
  return {
    "list transaction currencies": [{ transactioncurrencyid: EURO, currencyname: "Euro" }],
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

const LAND_PERIOD: CostPeriod = {
  ...OM_PERIOD,
  mode: "land",
  group: "Locations",
  description: "Cost 101",
  contractName: "Cost 101",
  threshold: false,
  align: false,
  external: false,
  secured: true,
  allWtgAllocated: false,
};

const created = (table: string) => writes.find((w) => w.op === "create" && w.table === table);
const fieldsOf = (w: Write | undefined) => (w?.fields ?? {}) as Record<string, unknown>;

beforeEach(() => {
  rowsByLabel = {};
  queriedBy = {};
  writes = [];
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
    // `docs/CONVENTIONS.md` — every create on project data binds the owning business unit.
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

  it("UT-PWRITE-003 cascades the ten contract-level fields from a head onto every period", async () => {
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

/** The reference rows a Land Lease save walks. */
function landReferenceRows(header?: Record<string, unknown>) {
  return {
    "list transaction currencies": [{ transactioncurrencyid: EURO, currencyname: "Euro" }],
    "list Land Lease subaccounts for a period save": [
      { vsb_landleasesubaccountid: LOCATIONS, vsb_name: "Locations" },
    ],
    "read a Land Lease header": header ? [header] : [],
    "list Land Lease period slots": [],
  } as Record<string, unknown[]>;
}

describe("saveLandLeasePeriod", () => {
  const LAND_CTX = { ...CTX, projectId: PROJECT_NEW_DATA, projectName: "Project New Data" };

  it("UT-PWRITE-009 creates a CONTRACT plus its first period when there is no contractId", async () => {
    /*
     * "Add Contract Type" is not a new sub-account — `vsb_landleasesubaccounts` is nine rows of
     * shared reference data. The canvas command (`LandLeaseCostScreenCode.txt:388`) only opens
     * the panel; the SAVE creates a `vsb_landleaseprojectcosts` header
     * (`If(IsBlank(locSelectedLandLeaseCost), Defaults(…), …)`, `:5895`).
     */
    rowsByLabel = landReferenceRows();
    NEW_ID.llcost = [HDR_COST101];
    NEW_ID.llperiod = ["c41e4d8f-1f57-ea11-a811-000d3a4a9d2f"];

    const saved = await savePeriod(LAND_CTX, LAND_PERIOD, true);

    const header = fieldsOf(created("llcost"));
    expect(header.vsb_name).toBe("Project New Data-Locations-Cost 101");
    expect(header["vsb_Project@odata.bind"]).toBe(`/vsb_projects(${PROJECT_NEW_DATA})`);
    expect(header["vsb_Subaccount@odata.bind"]).toBe(`/vsb_landleasesubaccounts(${LOCATIONS})`);
    expect(header["owningbusinessunit@odata.bind"]).toBe(`/businessunits(${BUSINESS_UNIT})`);
    // `vsb_secured` is a REQUIRED picklist; Yes 952850000 / No 952850001, measured 16 Sep.
    expect(header.vsb_secured).toBe(952850000);

    const period = fieldsOf(created("llperiod"));
    // The period's `vsb_name` IS the Description column the table shows (`:1642`).
    expect(period.vsb_name).toBe("Cost 101");
    expect(period.vsb_period).toBe(952850000);
    expect(period["vsb_ProjectCost@odata.bind"]).toBe(`/vsb_landleaseprojectcosts(${HDR_COST101})`);
    expect(period["owningbusinessunit@odata.bind"]).toBe(`/businessunits(${BUSINESS_UNIT})`);
    // The header must exist before the period that points at it — there is no `$batch`.
    expect(writes.findIndex((w) => w.table === "llcost"))
      .toBeLessThan(writes.findIndex((w) => w.table === "llperiod"));

    expect(saved.contractId).toBe(HDR_COST101);
    expect(saved.periodIndex).toBe(1);
  });

  it("UT-PWRITE-010 leaves the contract ALONE when a later period is added", async () => {
    // `IsBlank(locSelectedLandLeaseCost) || locSelectedLandLeasePeriod.Period = 'Period 1'` —
    // on Add Period the canvas' selected period is Blank, so neither test passes and the header
    // is untouched. Patching it here let an "add period 3" rewrite the contract's currency.
    rowsByLabel = landReferenceRows({
      vsb_landleaseprojectcostid: HDR_COST101,
      vsb_allwtgallocated: true,
      vsb_secured: 952850000,
      vsb_duedateonetimepayment: "2027-06-01",
      vsb_amountonetimepayment: 10_000,
    });
    rowsByLabel["list Land Lease period slots"] = [
      { vsb_landleaseperiodid: "p1", vsb_period: 952850000 },
    ];
    NEW_ID.llperiod = ["d41e4d8f-1f57-ea11-a811-000d3a4a9d2f"];

    const saved = await savePeriod(
      LAND_CTX,
      { ...LAND_PERIOD, description: "Cost 101 - 2", contractId: HDR_COST101, currency: "" },
      true,
    );

    expect(writes.filter((w) => w.table === "llcost")).toEqual([]);
    expect(fieldsOf(created("llperiod")).vsb_period).toBe(952850001);
    expect(saved.periodIndex).toBe(2);
    // The header's flags come back on the saved period so the grid's Allocation/OTP/Secured
    // cells are right without a refetch.
    expect(saved.allWtgAllocated).toBe(true);
    expect(saved.hasOneTimePayment).toBe(true);
    expect(saved.secured).toBe(true);
  });

  it("UT-PWRITE-011 lets Period 1 own the contract's shared fields, and only Period 1", async () => {
    const header = {
      vsb_landleaseprojectcostid: HDR_COST101, vsb_secured: 952850001,
      vsb_allwtgallocated: false,
    };

    rowsByLabel = landReferenceRows(header);
    await savePeriod(
      LAND_CTX,
      {
        ...LAND_PERIOD, id: "p1", contractId: HDR_COST101, periodIndex: 1, currency: "Euro",
        // Renamed in the panel. The canvas writes the one Description box into BOTH the
        // contract's `Description` and the period's `Name` (`:5895`), so renaming Period 1
        // renames the contract — reading `contractName` back instead would make it a no-op.
        description: "Cost 101 renamed", contractName: "Cost 101",
      },
      false,
    );
    const patched = fieldsOf(writes.find((w) => w.op === "update" && w.table === "llcost"));
    expect(patched.vsb_description).toBe("Cost 101 renamed");
    expect(patched.vsb_name).toBe("Project New Data-Locations-Cost 101 renamed");
    expect(patched["vsb_Currency@odata.bind"]).toBe(`/transactioncurrencies(${EURO})`);
    expect(fieldsOf(writes.find((w) => w.op === "update" && w.table === "llperiod")).vsb_name)
      .toBe("Cost 101 renamed");

    writes = [];
    rowsByLabel = landReferenceRows(header);
    await savePeriod(
      LAND_CTX,
      { ...LAND_PERIOD, id: "p3", contractId: HDR_COST101, periodIndex: 3, currency: "Euro" },
      false,
    );
    expect(writes.filter((w) => w.table === "llcost")).toEqual([]);
    expect(writes.filter((w) => w.table === "llperiod").map((w) => w.op)).toEqual(["update"]);
  });

  it("UT-PWRITE-012 does not rewrite vsb_period on an edit", async () => {
    // `Period: If(locRightPanelState = "New", Switch(…), locSelectedLandLeasePeriod.Period)` —
    // an edit keeps the slot it already has, so a re-save cannot shuffle the chain.
    rowsByLabel = landReferenceRows({
      vsb_landleaseprojectcostid: HDR_COST101, vsb_secured: 952850001,
    });
    await savePeriod(
      LAND_CTX,
      { ...LAND_PERIOD, id: "p2", contractId: HDR_COST101, periodIndex: 2 },
      false,
    );
    const update = writes.find((w) => w.op === "update" && w.table === "llperiod");
    expect(update?.fields).not.toHaveProperty("vsb_period");
  });
});

describe("nextLandLeaseSlot", () => {
  it("UT-PWRITE-013 takes the predecessor's slot + 1, fills a gap, and stops at nine", () => {
    /*
     * `Switch(locParentLandLeasePeriod.Period, Period1, Period2, … Period8, Period9)`. The canvas
     * never collides because Add Period is only enabled on the LAST period (`:260-286`). This
     * additionally FILLS a gap left by a delete, which the canvas would not: handing out a
     * duplicate `vsb_period` makes two periods sort identically and the chain unreadable.
     */
    expect(nextLandLeaseSlot([], undefined)).toBe(1);
    expect(nextLandLeaseSlot([1], 2)).toBe(2);
    expect(nextLandLeaseSlot([1, 2, 3])).toBe(4);
    // 2 was deleted; the next period reuses it rather than becoming a fourth slot-4.
    expect(nextLandLeaseSlot([1, 3])).toBe(2);
    // A preferred slot that is already taken is ignored, not written over.
    expect(nextLandLeaseSlot([1, 2], 2)).toBe(3);
    expect(() => nextLandLeaseSlot([1, 2, 3, 4, 5, 6, 7, 8, 9]))
      .toThrow(/maximum of 9 periods/);
  });
});

describe("deleteLandLeasePeriod", () => {
  it("UT-PWRITE-014 deletes the whole contract from Period 1 — allocations, periods, header", async () => {
    /*
     * `:360-384` routes Delete on the slot, and Period 1 opens "Delete Land Lease?", whose
     * `OnConfirm` (`:6076-6087`) removes `Land Lease Allocation WTGS`, then `Land Lease Periods`,
     * then the `Land Lease Project Costs` row. The ALLOCATIONS go first: `docs/01-BUGS-FOUND.md`
     * S-5 records them as the table that gets missed, and a stranded allocation points at a
     * header that no longer exists.
     */
    rowsByLabel = {
      "list Land Lease WTG allocations to delete": [
        { vsb_landleaseallocationwtgid: "alloc-1" },
        { vsb_landleaseallocationwtgid: "alloc-2" },
      ],
      "list Land Lease periods to delete": [
        { vsb_landleaseperiodid: "p1" }, { vsb_landleaseperiodid: "p2" },
      ],
    };

    await deletePeriod({ ...LAND_PERIOD, id: "p1", contractId: HDR_COST101, periodIndex: 1 });

    expect(writes.map((w) => `${w.table}:${w.id}`)).toEqual([
      "llalloc:alloc-1", "llalloc:alloc-2", "llperiod:p1", "llperiod:p2", `llcost:${HDR_COST101}`,
    ]);
  });

  it("UT-PWRITE-015 deletes a later period alone and leaves the contract standing", async () => {
    await deletePeriod({ ...LAND_PERIOD, id: "p2", contractId: HDR_COST101, periodIndex: 2 });
    expect(writes).toEqual([{ op: "delete", table: "llperiod", id: "p2" }]);
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

  it("UT-PWRITE-019 seeds a Land Lease contract as one header plus Period1..N", async () => {
    // `LandLeaseCostScreenCode.txt:388` — one `Land Lease Project Costs` row carrying the
    // Secured / Allocation / one-time-payment values, then one `Land Lease Periods` row per
    // assumption, slotted in `Period` order.
    rowsByLabel = {
      ...landReferenceRows(),
      "check for an existing Land Lease standard contract": [],
      "list OPEX / Land Lease standard assumptions": [
        assumption(1, { vsb_secured: true, vsb_allwtgallocated: true,
          vsb_amountonetimepayment: 10_000, vsb_duedateonetimepayment: "06/2027" }),
        assumption(2),
      ],
    };
    NEW_ID.llcost = [HDR_COST101];
    NEW_ID.llperiod = [
      "c41e4d8f-1f57-ea11-a811-000d3a4a9d2f", "d41e4d8f-1f57-ea11-a811-000d3a4a9d2f",
    ];

    const seeded = await addStandardContract(
      { ...CTX, projectId: PROJECT_NEW_DATA, projectName: "Project New Data" },
      { ...ARGS, mode: "land", group: "Locations" },
    );

    const header = fieldsOf(created("llcost"));
    expect(header.vsb_isstandardcontract).toBe(true);
    expect(header.vsb_secured).toBe(952850000);
    expect(header.vsb_allwtgallocated).toBe(true);
    expect(header.vsb_amountonetimepayment).toBe(10_000);

    const periods = writes.filter((w) => w.op === "create" && w.table === "llperiod");
    expect(periods.map((w) => fieldsOf(w).vsb_period)).toEqual([952850000, 952850001]);
    expect(seeded.map((p) => p.startDate)).toEqual(["2027-03-24", "2032-03-24"]);
    expect(seeded.every((p) => p.contractId === HDR_COST101)).toBe(true);
    // Every seeded period reports the header's flags, so the grid is right before any refetch.
    expect(seeded.every((p) => p.secured === true && p.hasOneTimePayment === true)).toBe(true);
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

  /**
   * Drives a Land Lease save's OWN payloads back through the REAL loader.
   *
   * `loadLeaseBook` (`./landLease.ts`) is the app's only Land Lease reader and
   * `mapLandLeasePeriodRow` is its projection into the shared book, so feeding the created rows
   * back under that reader's query labels exercises both halves rather than hand-mapping the
   * payload — which is how the two halves drifted apart twice before.
   */
  async function reloadLandLease(args: {
    periodId: string;
    allocations?: Record<string, unknown>[];
  }) {
    const headerFields = fieldsOf(created("llcost"));
    const periodFields = fieldsOf(created("llperiod"));
    rowsByLabel = {
      "list Land Lease subaccounts": [
        { vsb_landleasesubaccountid: LOCATIONS, vsb_name: "Locations", vsb_order: 1 },
      ],
      "list Land Lease project costs": [
        { ...headerFields, vsb_landleaseprojectcostid: HDR_COST101,
          _vsb_subaccount_value: LOCATIONS, _vsb_currency_value: EURO },
      ],
      "list Land Lease periods": [
        { ...periodFields, vsb_landleaseperiodid: args.periodId,
          _vsb_projectcost_value: HDR_COST101 },
      ],
      "list Land Lease WTG allocations": args.allocations ?? [],
      "list transaction currencies for Land Lease": [
        { transactioncurrencyid: EURO, currencyname: "Euro", isocurrencycode: "EUR" },
      ],
    };
    const book = await loadLeaseBook(PROJECT_NEW_DATA);
    const period = book.periods[0];
    const header = book.costs[0];
    const allocated = book.allocations
      .filter((a) => a.projectCostId === HDR_COST101)
      .map((a) => a.generatorInProjectId as string)
      .sort();
    return mapLandLeasePeriodRow(
      period as never, header as never, "Locations", header?.currencyName ?? "", allocated,
    );
  }

  it("UT-PWRITE-021 a Land Lease period survives save and reload unchanged", async () => {
    rowsByLabel = landReferenceRows();
    NEW_ID.llcost = [HDR_COST101];
    const PERIOD_ID = "c41e4d8f-1f57-ea11-a811-000d3a4a9d2f";
    NEW_ID.llperiod = [PERIOD_ID];

    await savePeriod(
      { ...CTX, projectId: PROJECT_NEW_DATA, projectName: "Project New Data" },
      { ...LAND_PERIOD, description: "Cost 101", contractName: "Cost 101" },
      true,
    );

    const reloaded = await reloadLandLease({ periodId: PERIOD_ID });

    expect(reloaded).toMatchObject({
      // The DESCRIPTION column is the period's `vsb_name` …
      description: "Cost 101",
      // … and the contract name is the header's `vsb_description`.
      contractName: "Cost 101",
      contractId: HDR_COST101,
      periodIndex: 1,
      group: "Locations",
      currency: "Euro",
      years: 5, months: 0,
      fixed: 12_000, perMwh: 4.1, perWtg: 67_500,
      aggregation: "SUM", frequency: 1,
      inflation: true, countryInflation: false, inflationPercent: 2, inflationYear: 2024,
      secured: true,
      // Land Lease has no threshold/align/external columns, so they read back false whatever
      // the panel was showing.
      threshold: false, align: false, external: false,
    });
  });

  it("UT-PWRITE-026 a Land Owner and the three one-time payments survive the round trip", async () => {
    /*
     * The seven header columns the loader never selected and the writer never wrote, which made
     * the panel's whole One-Time Payment section cosmetic. Measured on VSBCloud_Dev, 16 Sep:
     * 12 of 416 headers carry a Land Owner, 27 a first amount, 2 a second, 2 a third and 29 a
     * first due date — and the due dates are FREE TEXT in `MM/YYYY`, not dates.
     */
    rowsByLabel = landReferenceRows();
    NEW_ID.llcost = [HDR_COST101];
    const PERIOD_ID = "c41e4d8f-1f57-ea11-a811-000d3a4a9d2f";
    NEW_ID.llperiod = [PERIOD_ID];

    await savePeriod(
      { ...CTX, projectId: PROJECT_NEW_DATA, projectName: "Project New Data" },
      {
        ...LAND_PERIOD,
        landOwner: "Schmidt",
        amountOneTimePayment: 10_000,
        amountOneTimePayment2: 2_500,
        amountOneTimePayment3: null,
        dueDateOneTimePayment: "06/2027",
        dueDateOneTimePayment2: "06/2028",
        dueDateOneTimePayment3: null,
      },
      true,
    );

    const header = fieldsOf(created("llcost"));
    expect(header.vsb_landowner).toBe("Schmidt");
    expect(header.vsb_amountonetimepayment).toBe(10_000);
    expect(header.vsb_duedateonetimepayment).toBe("06/2027");
    // A blank payment is written as an explicit null, so switching one off clears the column
    // rather than leaving the previous value behind.
    expect(header.vsb_amountonetimepayment3).toBeNull();
    expect(header.vsb_duedateonetimepayment3).toBeNull();

    const reloaded = await reloadLandLease({ periodId: PERIOD_ID });
    expect(reloaded).toMatchObject({
      landOwner: "Schmidt",
      amountOneTimePayment: 10_000,
      amountOneTimePayment2: 2_500,
      amountOneTimePayment3: null,
      dueDateOneTimePayment: "06/2027",
      dueDateOneTimePayment2: "06/2028",
      dueDateOneTimePayment3: null,
      // `LandLeaseCostScreenCode.txt:1010` — the OTP cell tests only the FIRST pair.
      hasOneTimePayment: true,
    });
  });

  it("UT-PWRITE-027 a blank Land Lease rate stays blank through the round trip", async () => {
    // `landLeaseRules.formatGrouped` prints a stored `0` and BLANKS a null, and
    // `firstPeriodHasRate` gates `Add Period` on "any rate non-blank" — so a `?? 0` anywhere on
    // this path printed `0` in five columns the canvas leaves empty and pinned that gate open.
    rowsByLabel = landReferenceRows();
    NEW_ID.llcost = [HDR_COST101];
    const PERIOD_ID = "c41e4d8f-1f57-ea11-a811-000d3a4a9d2f";
    NEW_ID.llperiod = [PERIOD_ID];

    await savePeriod(
      { ...CTX, projectId: PROJECT_NEW_DATA, projectName: "Project New Data" },
      { ...LAND_PERIOD, fixed: null, revenue: 0, perMwh: null, perMw: null, perWtg: null },
      true,
    );
    expect(fieldsOf(created("llperiod")).vsb_fixedcosts).toBeNull();

    const reloaded = await reloadLandLease({ periodId: PERIOD_ID });
    expect(reloaded.fixed).toBeNull();
    expect(reloaded.perMwh).toBeNull();
    expect(reloaded.perWtg).toBeNull();
    // A STORED zero is a different answer from blank and still reads back as zero.
    expect(reloaded.revenue).toBe(0);
  });

  it("UT-PWRITE-028 reconciles the contract's WTG allocations, creating before deleting", async () => {
    /*
     * `vsb_landleaseallocationwtgs` was written only on DELETE — nothing created, updated or
     * read one — so the WTG picker had no options and `canSaveLandLease`'s PV/Wind allocation
     * clause could only be met by "allocate to all". Creates run before deletes, so an
     * interruption leaves an OVER-allocated contract rather than a silently under-allocated one.
     */
    const GEN_1 = "11111111-1111-1111-1111-111111111111";
    const GEN_2 = "22222222-2222-2222-2222-222222222222";
    const GEN_3 = "33333333-3333-3333-3333-333333333333";
    const ALLOC_STALE = "44444444-4444-4444-4444-444444444444";

    rowsByLabel = {
      ...landReferenceRows({
        vsb_landleaseprojectcostid: HDR_COST101, vsb_secured: 952850000,
      }),
      // The contract already holds GEN_1 and a stale GEN_3.
      "list Land Lease WTG allocations to reconcile": [
        { vsb_landleaseallocationwtgid: "55555555-5555-5555-5555-555555555555",
          _vsb_projectcost_value: HDR_COST101, _vsb_generatorinproject_value: GEN_1 },
        { vsb_landleaseallocationwtgid: ALLOC_STALE,
          _vsb_projectcost_value: HDR_COST101, _vsb_generatorinproject_value: GEN_3 },
      ],
    };

    await savePeriod(
      { ...CTX, projectId: PROJECT_NEW_DATA, projectName: "Project New Data" },
      {
        ...LAND_PERIOD, id: "c41e4d8f-1f57-ea11-a811-000d3a4a9d2f",
        contractId: HDR_COST101, periodIndex: 1,
        allocatedGeneratorIds: [GEN_1, GEN_2],
      },
      false,
    );

    const allocWrites = writes.filter((w) => w.table === "llalloc");
    // GEN_1 is already there and is NOT rewritten; GEN_2 is created; GEN_3 is removed.
    expect(allocWrites.map((w) => w.op)).toEqual(["create", "delete"]);
    expect(fieldsOf(allocWrites[0])["vsb_GeneratorInProject@odata.bind"])
      .toBe(`/vsb_generatorinprojects(${GEN_2})`);
    expect(fieldsOf(allocWrites[0])["vsb_ProjectCost@odata.bind"])
      .toBe(`/vsb_landleaseprojectcosts(${HDR_COST101})`);
    // `docs/01-BUGS-FOUND.md` S-5 — the owning business unit is bound on this table too.
    expect(fieldsOf(allocWrites[0])["owningbusinessunit@odata.bind"])
      .toBe(`/businessunits(${BUSINESS_UNIT})`);
    expect(allocWrites[1]?.id).toBe(ALLOC_STALE);
  });

  it("UT-PWRITE-029 leaves the allocations alone when the caller has no opinion", async () => {
    // `undefined` is not `[]`: writing `[]` would DELETE every allocation on the contract, which
    // is the stranded/lost-allocation failure `docs/01-BUGS-FOUND.md` S-5 records.
    rowsByLabel = {
      ...landReferenceRows({
        vsb_landleaseprojectcostid: HDR_COST101, vsb_secured: 952850000,
      }),
      "list Land Lease WTG allocations to reconcile": [
        { vsb_landleaseallocationwtgid: "55555555-5555-5555-5555-555555555555",
          _vsb_projectcost_value: HDR_COST101,
          _vsb_generatorinproject_value: "11111111-1111-1111-1111-111111111111" },
      ],
    };

    await savePeriod(
      { ...CTX, projectId: PROJECT_NEW_DATA, projectName: "Project New Data" },
      {
        ...LAND_PERIOD, id: "c41e4d8f-1f57-ea11-a811-000d3a4a9d2f",
        contractId: HDR_COST101, periodIndex: 1,
      },
      false,
    );
    expect(writes.filter((w) => w.table === "llalloc")).toEqual([]);
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
      // Inflation off means both numbers are cleared, so they round-trip as zero and not as
      // whatever the row held before the toggle was turned off.
      inflationPercent: 0, inflationYear: 0,
      align: false,
    });
  });
});
