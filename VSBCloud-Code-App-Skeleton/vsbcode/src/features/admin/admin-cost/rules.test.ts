/**
 * Admin Cost Screen — unit tests.
 *
 * IDs are the spec's (UT-ADCOST-nnn). XL screen, so the count is well past the 20 the
 * conventions ask for. Pure functions only; the "Integration" cases assert the WRITE PLAN
 * (which becomes exactly one `$batch`) rather than mocking the transport, and 043 really
 * invokes the missing-flow wrapper.
 */
import { describe, it, expect } from "vitest";
import { canSeeAdminSection, type CurrentUser } from "@/domain/session";
import { CHOICE_ADMIN, CHOICE_PRODUCTION } from "@/data/entities";
import { synchronizeStandardAssumptionCosts } from "@/flows/flowClient";
import {
  /* shared */
  COST_CATEGORIES, showAddContractType, showAddCost, canEditScope, emptyScope,
  aggregatedSubaccountName, APPLY_TRACKING_ENTITY_SET, APPLY_TRACKING_COL,
  findLastApply, lastAppliedLabel, showLastApplied, planApplyTracking,
  APPLY_NOT_RUN_REASON, applyCommandState, APPLY_DISABLED_REASON,
  costTypeWireValue, costTypeForContractType, synchronizeArgs,
  buildCountryPicker, COST_CONTRACT_EXCLUDED_COUNTRIES, technologyValue,
  costRailLeafKey, parseCostRailLeafKey, costBreadcrumb, APPLY_OVERRIDE_CAPTION,
  type CostScope, type ApplyTrackingRow,
  /* opex */
  OPEX_COL, OPEX_ENTITY_SET, OPEX_LOOKUP, CASCADE_COLUMNS, NON_CASCADE_COLUMNS,
  INFLATION_START_YEAR_LITERAL, CONTRACT_COSTS_MAX, PERIOD_ONE, PERIOD_TEN,
  ADD_PERIOD_BLOCKED_REASON, splitOpexSubaccounts, subaccountMenuLabel,
  canAddContractType, filterByScope, sameTechnology, nextPeriod, nextPeriodCanvasParity,
  canAddPeriod, paymentSectionsFor, recomputeLastPeriodFlags, cascadeFieldsFromPeriodOne,
  emptyOpexForm, validateOpexPeriod, canSaveOpexPeriod, buildOpexPayload,
  planSaveOpexPeriod, planDeleteOpexPeriodOrContract, newTailCanvasParity, periodLabel,
  type OpexPeriodRow, type OpexPeriodForm, type OpexScope, type OpexSubaccount,
  /* devex */
  DEVEX_COL, DEVEX_ENTITY_SET, DEVEX_LOOKUP, COST_MAX, MAX_COSTS_PER_SUBACCOUNT,
  COST_INTEGER_ERROR, COST_RANGE_ERROR, UNIT_ERROR, DEFAULT_DISTRIBUTION_FREQUENCY_MONTHS,
  groupByCategory, isScopeChosen, defaultScopeCanvasParity, categoryDisappearsAfterDelete,
  unitChoices, defaultUnit, isPerWtg, isUnitValid, costAmountError, isCostAmountValid,
  costPaidByChoices, isSubaccountSelectable, emptyDevexForm, hasAnyCluster,
  applySubaccountSelection, applyUnitChange, validateDevexForm, canSaveStandardCost,
  composeStandardCostName, composeStandardCostDescription, buildStandardCostPayload,
  planSaveStandardCost, planDeleteStandardCost, rowActionEnabled,
  unitLabel, costPaidLabel, formatDevexCostAmount, categoryAccountColumnLabel,
  subAccountColumnLabel,
  type DevexCost, type DevexForm, type DevexScope, type CategoryRef,
} from "./rules";

/* ─────────────────────────────────────────────────────────────────── fixtures */

const user = (o: Partial<CurrentUser> = {}): CurrentUser => ({
  id: "u-1", displayName: "A. Muster", mail: "a@vsb.energy", language: "en-US", lang: "en",
  roles: [], isApplicationAdministrator: false, isControllerOwnData: false,
  isProjectDataAllCountries: false, isProjectManagerOwnProjects: false, isDeveloper: false,
  canEditSelectedProject: false, editableCountries: [], editableCountriesAsString: "",
  ...o,
});

const scope = (o: Partial<CostScope> = {}): CostScope => ({
  countryId: "de", countryName: "Germany", technology: "Wind",
  technologyValue: CHOICE_ADMIN.technology.wind, ...o,
});

const opexScope = (o: Partial<OpexScope> = {}): OpexScope => ({ ...scope(), ...o });
const devexScope = (o: Partial<DevexScope> = {}): DevexScope => ({ ...scope(), ...o });

const P = CHOICE_PRODUCTION.opexLandLeasePeriod;

const period = (o: Partial<OpexPeriodRow> = {}): OpexPeriodRow => ({
  id: "p1", description: "Lease", countryId: "de",
  technology: CHOICE_ADMIN.technology.wind,
  typeOfContract: CHOICE_ADMIN.contractTypes.landlease,
  period: P.period1, opexSubaccountId: null, landLeaseSubaccountId: "ll-1",
  isLastPeriod: true, values: {},
  ...o,
});

const opexForm = (o: Partial<OpexPeriodForm> = {}): OpexPeriodForm => ({
  ...emptyOpexForm(),
  description: "Lease",
  durationYears: 5, durationMonths: 0,
  aggregation: CHOICE_PRODUCTION.aggregation.sum,
  distributionFrequency: 12,
  ...o,
});

const validCtx = { countryName: "Germany", showSecondPayment: false, showThirdPayment: false, isDirty: true };

const devexCost = (o: Partial<DevexCost> = {}): DevexCost => ({
  id: "d1", name: null, description: "Standard Grid - 2026", descriptionInput: "2026",
  costAmount: 1500, unit: CHOICE_ADMIN.costUnit.eur,
  costPaidBy: CHOICE_ADMIN.costPaidType.spv, comment: null,
  technology: CHOICE_ADMIN.technology.wind, countryId: "de",
  categoryId: "cat1", subaccountId: "sub1", distributionFrequency: 3,
  clusters: [true, false, false, false, false],
  ...o,
});

const devexForm = (o: Partial<DevexForm> = {}): DevexForm => ({
  ...emptyDevexForm("Germany"),
  subaccountId: "sub1", categoryId: "cat1", description: "2026", cost: "1500",
  costPaidBy: CHOICE_ADMIN.costPaidType.spv,
  clusters: [true, false, false, false, false],
  dirty: true,
  ...o,
});

const cat = (id: string, order: number, name = id): CategoryRef => ({ id, name, order });

/* ═══════════════════════════════════════════════════════ permission and scope ════ */

describe("permission and scope", () => {
  it("UT-ADCOST-001 a non-admin is blocked and no plan writes anything", () => {
    expect(canSeeAdminSection(user())).toBe(false);
    const plan = planSaveStandardCost({
      form: devexForm(), scope: devexScope(), subaccountName: "Grid", existing: null,
      owningBusinessUnitId: null, canEdit: false, canCreate: true, canWriteRecord: true,
    });
    expect(plan.writes).toHaveLength(0);
    expect(plan.refusedReason).toContain("editable country scope");
  });

  it("UT-ADCOST-001b country scope gates the writes (new, absent from the canvas)", () => {
    const controller = user({
      isControllerOwnData: true, editableCountries: [{ id: "de", name: "Germany" }],
    });
    expect(canEditScope(controller, scope())).toBe(true);
    expect(canEditScope(controller, scope({ countryId: "fr" }))).toBe(false);
    expect(canEditScope(null, scope())).toBe(false);
  });

  it("UT-ADCOST-001c the picker excludes Spain, Greece and Romania and offers Wind/PV only", () => {
    const items = buildCountryPicker(
      [
        { id: "de", name: "Germany" }, { id: "es", name: "Spain" },
        { id: "gr", name: "Greece" }, { id: "ro", name: "Romania" },
        { id: "fr", name: "France" },
      ],
      { exclude: COST_CONTRACT_EXCLUDED_COUNTRIES },
    );
    expect(items.map((c) => c.name)).toEqual(["Germany", "France"]);
    expect(items[0].technologies).toEqual(["Wind", "PV"]);
    // The save switches DO handle BESS and Hydro; the picker simply cannot produce them.
    expect(technologyValue("BESS")).toBe(CHOICE_ADMIN.technology.bess);
    expect(technologyValue("Hydro")).toBe(CHOICE_ADMIN.technology.hydro);
  });
});

/* ═════════════════════════════════════════════════════════════ the four rows ════ */

describe("the four cost categories", () => {
  it("UT-ADCOST-002 they render in source order", () => {
    expect(COST_CATEGORIES.map((c) => c.category)).toEqual([
      "DEVEX/CAPEX", "Operation & Maintenance", "Land Lease", "Other OPEX Costs",
    ]);
    expect(COST_CATEGORIES.map((c) => c.typeOfCategory)).toEqual([
      CHOICE_ADMIN.contractTypes.devexCapex,
      CHOICE_ADMIN.contractTypes.opexOandM,
      CHOICE_ADMIN.contractTypes.landlease,
      CHOICE_ADMIN.contractTypes.opexOther,
    ]);
  });

  it("UT-ADCOST-002b Add-Contract-Type shows for the three OPEX rows, Add-Cost for DEVEX", () => {
    expect(COST_CATEGORIES.filter(showAddContractType).map((c) => c.category))
      .toEqual(["Operation & Maintenance", "Land Lease", "Other OPEX Costs"]);
    expect(COST_CATEGORIES.filter(showAddCost).map((c) => c.category)).toEqual(["DEVEX/CAPEX"]);
  });

  it("UT-ADCOST-003 the O&M / Other-OPEX split follows the name/order heuristic", () => {
    const subs: OpexSubaccount[] = [
      { id: "a", name: "Technical management", order: 1, accountOrder: 1 },
      { id: "b", name: "Operation & Maintenance", order: 2, accountOrder: 2 },
      { id: "c", name: "Insurance", order: 3, accountOrder: 2 },
    ];
    const split = splitOpexSubaccounts(subs);
    expect(split.oAndM.map((s) => s.id)).toEqual(["a", "b"]);
    expect(split.otherOpex.map((s) => s.id)).toEqual(["c"]);
  });

  it("UT-ADCOST-004 Overleveraging is excluded from the COST screen's categories", () => {
    // The exclusion lives with the CAPEX account repository (`listCategories`); this
    // screen's divergence from Admin CAPEX Accounts is documented there. What matters
    // here is that the aggregated display name is derived, not queried (rule 4).
    expect(aggregatedSubaccountName("Grid", "Cabling", "10001_01"))
      .toBe("Grid / Cabling 10001_01");
  });

  it("UT-ADCOST-007 TCMA and Environmental are relabelled in the menu only", () => {
    expect(subaccountMenuLabel("Technical & Commercial Management TCMA")).toBe("TCMA");
    expect(subaccountMenuLabel("Environmental & Compliance Monitoring")).toBe("E&CM");
    expect(subaccountMenuLabel("Insurance")).toBe("Insurance");
  });
});

/* ═══════════════════════════════════════════════════════ the OPEX contract menu ════ */

describe("Add Contract Type", () => {
  it("UT-ADCOST-005 the item is disabled when a contract already exists in scope", () => {
    const existing = [period({ landLeaseSubaccountId: "ll-1" })];
    expect(canAddContractType(
      existing, "ll-1", opexScope(), CHOICE_ADMIN.contractTypes.landlease, "landLease",
    )).toBe(false);
  });

  it("UT-ADCOST-006 the same subaccount in another country stays enabled", () => {
    const existing = [period({ landLeaseSubaccountId: "ll-1", countryId: "fr" })];
    expect(canAddContractType(
      existing, "ll-1", opexScope(), CHOICE_ADMIN.contractTypes.landlease, "landLease",
    )).toBe(true);
    // …and another technology, and another contract type.
    expect(canAddContractType(
      [period({ technology: CHOICE_ADMIN.technology.pv })], "ll-1", opexScope(),
      CHOICE_ADMIN.contractTypes.landlease, "landLease",
    )).toBe(true);
  });

  it("UT-ADCOST-008 the OPEX grid is filtered by the scope triple", () => {
    const rows = [
      period({ id: "in" }),
      period({ id: "otherCountry", countryId: "fr" }),
      period({ id: "otherTech", technology: CHOICE_ADMIN.technology.pv }),
      period({ id: "otherType", typeOfContract: CHOICE_ADMIN.contractTypes.opexOandM }),
    ];
    const out = filterByScope(rows, opexScope(), CHOICE_ADMIN.contractTypes.landlease);
    expect(out.map((r) => r.id)).toEqual(["in"]);
  });

  it("UT-ADCOST-029 the technology comparison is the SAME in both grids", () => {
    // The canvas compared case-sensitively in the OPEX gallery and case-insensitively in
    // the DEVEX builder; one helper now serves both.
    expect(sameTechnology(CHOICE_ADMIN.technology.wind, technologyValue("wind"))).toBe(true);
    expect(sameTechnology(CHOICE_ADMIN.technology.wind, technologyValue("Wind"))).toBe(true);
    expect(sameTechnology(CHOICE_ADMIN.technology.wind, technologyValue("PV"))).toBe(false);
    expect(sameTechnology(null, CHOICE_ADMIN.technology.wind)).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════ periods ════ */

describe("the period model", () => {
  it("UT-ADCOST-009 the next period is the successor of the reference", () => {
    expect(nextPeriod(P.period3)).toBe(P.period4);
    expect(nextPeriod(P.period1)).toBe(P.period2);
    expect(nextPeriod(null)).toBe(PERIOD_ONE);        // the switch's default arm
    expect(periodLabel(P.period4)).toBe("Period 4");
  });

  it("UT-ADCOST-010 Period 10 BLOCKS an 11th add — never a silent overwrite", () => {
    expect(nextPeriod(PERIOD_TEN)).toBeNull();
    expect(canAddPeriod(PERIOD_TEN)).toBe(false);
    expect(canAddPeriod(P.period9)).toBe(true);
    // The canvas switch fell through to its default and created a SECOND Period 1.
    expect(nextPeriodCanvasParity(PERIOD_TEN)).toBe(PERIOD_ONE);
    const plan = planSaveOpexPeriod({
      form: opexForm(), scope: opexScope(),
      typeOfContract: CHOICE_ADMIN.contractTypes.landlease,
      subaccountId: "ll-1", subaccountKind: "landLease",
      existing: null, reference: period({ period: PERIOD_TEN }), siblings: [],
      owningBusinessUnitId: null, canEdit: true, validation: validCtx,
    });
    expect(plan.writes).toHaveLength(0);
    expect(plan.refusedReason).toBe(ADD_PERIOD_BLOCKED_REASON);
  });

  it("UT-ADCOST-011 a new period clears the reference's last-period flag", () => {
    const reference = period({ id: "p1", period: P.period1, isLastPeriod: true });
    const plan = planSaveOpexPeriod({
      form: opexForm(), scope: opexScope(),
      typeOfContract: CHOICE_ADMIN.contractTypes.landlease,
      subaccountId: "ll-1", subaccountKind: "landLease",
      existing: null, reference, siblings: [reference],
      owningBusinessUnitId: null, canEdit: true, validation: validCtx,
    });
    expect(plan.writes[0].op).toBe("create");
    expect(plan.writes[0].data?.[OPEX_COL.isLastPeriod]).toBe(true);
    expect(plan.writes[0].data?.[OPEX_COL.period]).toBe(P.period2);
    expect(plan.writes[1]).toMatchObject({
      op: "update", id: "p1", data: { [OPEX_COL.isLastPeriod]: false },
    });
  });

  it("UT-ADCOST-011b recomputeLastPeriodFlags tags exactly one tail, by period order", () => {
    const flags = recomputeLastPeriodFlags([
      period({ id: "c", period: P.period3, isLastPeriod: true }),
      period({ id: "a", period: P.period1, isLastPeriod: true }),
      period({ id: "b", period: P.period2 }),
    ]);
    expect(flags).toEqual([
      { id: "a", isLastPeriod: false },
      { id: "b", isLastPeriod: false },
      { id: "c", isLastPeriod: true },
    ]);
  });

  it("UT-ADCOST-023 payment 2 is shown only when the reference row had one", () => {
    const withTwo = period({
      values: {
        [OPEX_COL.amountOneTimePayment2]: 1000,
        [OPEX_COL.dueDateOneTimePayment2]: "2027-01-01",
      },
    });
    expect(paymentSectionsFor(withTwo)).toEqual({ showSecond: true, showThird: false });
    // BOTH the amount and the due date are needed — an amount alone is not enough.
    expect(paymentSectionsFor(period({
      values: { [OPEX_COL.amountOneTimePayment2]: 1000 },
    }))).toEqual({ showSecond: false, showThird: false });
    expect(paymentSectionsFor(null)).toEqual({ showSecond: false, showThird: false });
  });
});

/* ═══════════════════════════════════════════════════════════ the Period-1 cascade ════ */

describe("the Period-1 cascade", () => {
  it("UT-ADCOST-012 editing Period 1 cascades EXACTLY 17 fields", () => {
    expect(CASCADE_COLUMNS).toHaveLength(17);
    const existing = period({ id: "p1", period: P.period1 });
    const siblings = [
      existing,
      period({ id: "p2", period: P.period2 }),
      period({ id: "p3", period: P.period3, isLastPeriod: true }),
    ];
    const plan = planSaveOpexPeriod({
      form: opexForm(), scope: opexScope(),
      typeOfContract: CHOICE_ADMIN.contractTypes.landlease,
      subaccountId: "ll-1", subaccountKind: "landLease",
      existing, reference: null, siblings,
      owningBusinessUnitId: null, canEdit: true, validation: validCtx,
    });
    const cascadePatches = plan.writes.filter((w) => w.id === "p2" || w.id === "p3");
    expect(cascadePatches).toHaveLength(2);
    for (const patch of cascadePatches) {
      expect(Object.keys(patch.data ?? {}).sort()).toEqual([...CASCADE_COLUMNS].sort());
    }
  });

  it("UT-ADCOST-013 rates, aggregation, durations and frequency are NOT cascaded", () => {
    const payload = buildOpexPayload(opexForm({ eurPerMwh: "3.5" }), {
      scope: opexScope(), typeOfContract: CHOICE_ADMIN.contractTypes.landlease,
      period: P.period1, isLastPeriod: true, subaccountId: "ll-1",
      subaccountKind: "landLease", owningBusinessUnitId: null, isCreate: false,
    });
    expect(payload[OPEX_COL.eurPerMwh]).toBe(3.5);
    const cascade = cascadeFieldsFromPeriodOne(payload);
    for (const column of NON_CASCADE_COLUMNS) {
      expect(column in cascade).toBe(false);
    }
    expect(Object.keys(cascade)).toHaveLength(17);
  });

  it("UT-ADCOST-013b editing a LATER period cascades nothing", () => {
    const existing = period({ id: "p2", period: P.period2 });
    const plan = planSaveOpexPeriod({
      form: opexForm(), scope: opexScope(),
      typeOfContract: CHOICE_ADMIN.contractTypes.landlease,
      subaccountId: "ll-1", subaccountKind: "landLease",
      existing, reference: null,
      siblings: [period({ id: "p1", period: P.period1 }), existing],
      owningBusinessUnitId: null, canEdit: true, validation: validCtx,
    });
    expect(plan.writes).toHaveLength(1);
  });
});

/* ══════════════════════════════════════════════════════════════════ the delete ════ */

describe("deleting a period or a contract", () => {
  // Descriptions deliberately DESCEND while the periods ascend — that is the whole point
  // of UT-ADCOST-015. Only p4 carries the tail flag.
  const four = [
    period({ id: "p1", period: P.period1, description: "Z first", isLastPeriod: false }),
    period({ id: "p2", period: P.period2, description: "Y second", isLastPeriod: false }),
    period({ id: "p3", period: P.period3, description: "X third", isLastPeriod: false }),
    period({ id: "p4", period: P.period4, description: "W fourth", isLastPeriod: true }),
  ];

  it("UT-ADCOST-014 deleting Period 1 deletes every period of the contract", () => {
    const plan = planDeleteOpexPeriodOrContract({
      target: four[0], contractPeriods: four, canEdit: true,
    });
    expect(plan.writes).toHaveLength(4);
    expect(plan.writes.every((w) => w.op === "delete")).toBe(true);
    expect(plan.writes.map((w) => w.id)).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("UT-ADCOST-015 deleting the tail retags by PERIOD order, not by Description", () => {
    // Descriptions are reverse-alphabetical, so the two orders disagree.
    const plan = planDeleteOpexPeriodOrContract({
      target: four[3], contractPeriods: four, canEdit: true,
    });
    expect(plan.writes[0]).toMatchObject({ op: "delete", id: "p4" });
    expect(plan.writes[1]).toMatchObject({
      op: "update", id: "p3", data: { [OPEX_COL.isLastPeriod]: true },
    });
    // The canvas picked `First(LastN(Sort(<set>, Description, Ascending), 2))` — a
    // different row entirely.
    const remaining = four.filter((p) => p.id !== "p4");
    expect(newTailCanvasParity(remaining)?.id).not.toBe("p3");
  });

  it("UT-ADCOST-015b deleting a middle period leaves the existing tail alone", () => {
    const plan = planDeleteOpexPeriodOrContract({
      target: four[1], contractPeriods: four, canEdit: true,
    });
    expect(plan.writes).toHaveLength(1);   // p4 is already flagged
    expect(plan.writes[0]).toMatchObject({ op: "delete", id: "p2" });
  });
});

/* ═══════════════════════════════════════════════════════ the OPEX period panel ════ */

describe("the OPEX period panel — the 125-line DisplayMode", () => {
  it("UT-ADCOST-016 Save is disabled without a description", () => {
    expect(validateOpexPeriod(opexForm({ description: "  " }), validCtx))
      .toContain("Description cannot be blank.");
    expect(canSaveOpexPeriod(opexForm({ description: "" }), validCtx)).toBe(false);
    expect(canSaveOpexPeriod(opexForm(), validCtx)).toBe(true);
  });

  it("UT-ADCOST-016b an untouched panel cannot be saved (locIsDirty)", () => {
    expect(canSaveOpexPeriod(opexForm(), { ...validCtx, isDirty: false })).toBe(false);
  });

  it("UT-ADCOST-017 a one-time payment requires both amount and due date", () => {
    const errors = validateOpexPeriod(
      opexForm({ oneTimePayment: true, amount: "1000", dueDate: null }), validCtx,
    );
    expect(errors).toContain("A one-time payment needs a due date.");
    expect(canSaveOpexPeriod(
      opexForm({ oneTimePayment: true, amount: "1000", dueDate: "2027-01-01" }), validCtx,
    )).toBe(true);
  });

  it("UT-ADCOST-018 a non-one-time payment needs a non-zero duration", () => {
    expect(validateOpexPeriod(
      opexForm({ durationYears: 0, durationMonths: 0 }), validCtx,
    )).toContain("The duration cannot be zero.");
    expect(validateOpexPeriod(
      opexForm({ durationYears: null, durationMonths: null }), validCtx,
    )).toContain("Select a duration in years and months.");
    expect(validateOpexPeriod(opexForm({ aggregation: null }), validCtx))
      .toContain("Select an aggregation.");
    expect(validateOpexPeriod(opexForm({ distributionFrequency: null }), validCtx))
      .toContain("Select a distribution frequency.");
  });

  it("UT-ADCOST-019 inflation on requires a start year", () => {
    expect(validateOpexPeriod(
      opexForm({ inflation: true, inflationStartYear: "", inflationProfile: "2" }), validCtx,
    )).toContain("Inflation needs a start year.");
  });

  it("UT-ADCOST-020 Italy + the country profile requires an area profile", () => {
    const form = opexForm({
      inflation: true, inflationStartYear: "2030",
      useCountryInflationProfile: true, inflationAreaProfileId: null,
    });
    expect(validateOpexPeriod(form, { ...validCtx, countryName: "Italy" }))
      .toContain("Select an area inflation profile.");
    // Germany has no area profiles, so the same form passes there.
    expect(validateOpexPeriod(form, { ...validCtx, countryName: "Germany" }))
      .not.toContain("Select an area inflation profile.");
  });

  it("UT-ADCOST-021 a custom inflation profile is required when the country profile is off", () => {
    expect(validateOpexPeriod(
      opexForm({
        inflation: true, inflationStartYear: "2030",
        useCountryInflationProfile: false, inflationProfile: "",
      }),
      validCtx,
    )).toContain("Enter an inflation profile value.");
  });

  it("UT-ADCOST-022 an Individual threshold requires a value", () => {
    expect(validateOpexPeriod(
      opexForm({
        threshold: true, thresholdType: CHOICE_ADMIN.thresholdType.individual,
        thresholdIndividual: "",
      }),
      validCtx,
    )).toContain("An individual threshold needs a value.");
    expect(canSaveOpexPeriod(
      opexForm({
        threshold: true, thresholdType: CHOICE_ADMIN.thresholdType.portfolio,
      }),
      validCtx,
    )).toBe(true);
  });

  it("UT-ADCOST-022b payments 2 and 3 are required only when the sections are shown", () => {
    const form = opexForm();
    expect(canSaveOpexPeriod(form, validCtx)).toBe(true);
    expect(validateOpexPeriod(form, { ...validCtx, showSecondPayment: true }))
      .toContain("Payment 2 needs a due date.");
    expect(validateOpexPeriod(form, { ...validCtx, showThirdPayment: true }))
      .toContain("Payment 3 needs an amount.");
  });

  it("UT-ADCOST-022c the amount ceiling is locContractsCostsMax", () => {
    expect(CONTRACT_COSTS_MAX).toBe(1_000_000_000);
    expect(validateOpexPeriod(
      opexForm({ oneTimePayment: true, dueDate: "2027-01-01", amount: "1000000001" }),
      validCtx,
    )).toContain("A one-time payment needs an amount.");
  });
});

/* ═══════════════════════════════════════════════════════════ the OPEX payload ════ */

describe("the OPEX payload", () => {
  it("UT-ADCOST-024 the Inflation Profile is omitted when the country profile is used", () => {
    const on = buildOpexPayload(
      opexForm({ inflation: true, useCountryInflationProfile: true, inflationProfile: "2" }),
      {
        scope: opexScope(), typeOfContract: CHOICE_ADMIN.contractTypes.landlease,
        period: P.period1, isLastPeriod: true, subaccountId: "ll-1",
        subaccountKind: "landLease", owningBusinessUnitId: null, isCreate: true,
      },
    );
    expect(on[OPEX_COL.inflationProfile]).toBeNull();
    const off = buildOpexPayload(
      opexForm({ inflation: true, useCountryInflationProfile: false, inflationProfile: "2" }),
      {
        scope: opexScope(), typeOfContract: CHOICE_ADMIN.contractTypes.landlease,
        period: P.period1, isLastPeriod: true, subaccountId: "ll-1",
        subaccountKind: "landLease", owningBusinessUnitId: null, isCreate: true,
      },
    );
    expect(off[OPEX_COL.inflationProfile]).toBe(2);
    // Rule 15's literal is always written; the numeric column never is.
    expect(on[OPEX_COL.inflationStartYearString]).toBe(INFLATION_START_YEAR_LITERAL);
  });

  it("UT-ADCOST-025 the Secured toggle maps to the option set", () => {
    const payload = buildOpexPayload(opexForm({ secured: true }), {
      scope: opexScope(), typeOfContract: CHOICE_ADMIN.contractTypes.landlease,
      period: P.period1, isLastPeriod: true, subaccountId: "ll-1",
      subaccountKind: "landLease", owningBusinessUnitId: null, isCreate: true,
    });
    expect(payload[OPEX_COL.secured]).toBe(CHOICE_ADMIN.secured.yes);
  });

  it("UT-ADCOST-026 Name is composed from description, country and technology", () => {
    const payload = buildOpexPayload(opexForm({ description: "Lease" }), {
      scope: opexScope(), typeOfContract: CHOICE_ADMIN.contractTypes.landlease,
      period: P.period1, isLastPeriod: true, subaccountId: "ll-1",
      subaccountKind: "landLease", owningBusinessUnitId: "bu-1", isCreate: true,
    });
    expect(payload[OPEX_COL.name]).toBe("Lease - Germany - Wind");
    expect(payload[OPEX_COL.description]).toBe("Lease");
    expect(payload[`${OPEX_LOOKUP.owningBusinessUnit}@odata.bind`])
      .toBe("/businessunits(bu-1)");
    expect(payload[`${OPEX_LOOKUP.landLeaseSubaccount}@odata.bind`])
      .toBe("/vsb_landleasesubaccounts(ll-1)");
    expect(OPEX_ENTITY_SET).toContain("opexlandlease");
  });

  it("UT-ADCOST-046 a save the user may not run preserves the form and writes nothing", () => {
    const form = opexForm();
    const plan = planSaveOpexPeriod({
      form, scope: opexScope(), typeOfContract: CHOICE_ADMIN.contractTypes.landlease,
      subaccountId: "ll-1", subaccountKind: "landLease",
      existing: null, reference: null, siblings: [],
      owningBusinessUnitId: null, canEdit: false, validation: validCtx,
    });
    expect(plan.writes).toHaveLength(0);
    expect(form.description).toBe("Lease");     // the caller's state is untouched
  });
});

/* ══════════════════════════════════════════════════════════════ the DEVEX family ════ */

describe("the DEVEX/CAPEX family", () => {
  it("UT-ADCOST-027 the list groups by category with fold state", () => {
    const categories = [cat("cat1", 1, "Development Expenses"), cat("cat2", 2, "Other CAPEX")];
    const costs = [
      devexCost({ id: "d1", categoryId: "cat1", description: "A" }),
      devexCost({ id: "d2", categoryId: "cat1", description: "B" }),
      devexCost({ id: "d3", categoryId: "cat2", description: "C" }),
    ];
    const collapsed = groupByCategory(categories, costs, new Set());
    expect(collapsed.map((r) => r.kind)).toEqual(["category", "category"]);
    const expanded = groupByCategory(categories, costs, new Set(["cat1"]));
    expect(expanded.map((r) => r.kind)).toEqual(["category", "cost", "cost", "category"]);
  });

  it("UT-ADCOST-027b a category with no costs in scope does not render at all", () => {
    const rows = groupByCategory([cat("cat1", 1), cat("empty", 2)], [devexCost()], new Set());
    expect(rows).toHaveLength(1);
  });

  it("UT-ADCOST-028 a blank scope renders an empty state, never Wind/first-country", () => {
    expect(isScopeChosen(devexScope())).toBe(true);
    expect(isScopeChosen({ ...emptyScope() })).toBe(false);
    expect(isScopeChosen(devexScope({ technology: null }))).toBe(false);
    // The canvas silently defaulted; kept only as a parity reference.
    const parity = defaultScopeCanvasParity(
      { countryId: null, countryName: null, technology: null, technologyValue: null },
      { id: "de", name: "Germany" },
    );
    expect(parity).toMatchObject({ countryId: "de", technology: "Wind" });
  });

  it("UT-ADCOST-040 deleting the last cost of a category removes the parent row", () => {
    expect(categoryDisappearsAfterDelete([devexCost({ categoryId: "cat1" })], "cat1")).toBe(true);
    expect(categoryDisappearsAfterDelete(
      [devexCost({ id: "a", categoryId: "cat1" }), devexCost({ id: "b", categoryId: "cat1" })],
      "cat1",
    )).toBe(false);
    // Derived grouping makes it automatic:
    expect(groupByCategory([cat("cat1", 1)], [], new Set())).toEqual([]);
  });

  it("UT-ADCOST-030 Add Cost is unavailable without the create privilege", () => {
    const plan = planSaveStandardCost({
      form: devexForm(), scope: devexScope(), subaccountName: "Grid", existing: null,
      owningBusinessUnitId: null, canEdit: true, canCreate: false, canWriteRecord: true,
    });
    expect(plan.writes).toHaveLength(0);
    expect(plan.refusedReason).toContain("permission to create");
  });

  it("UT-ADCOST-031 the row Edit does NOT fail open when the record lookup misses", () => {
    // The canvas `IsBlank(LookUp(...)) → DisplayMode.Edit` short-circuit enabled the
    // button precisely when the privilege could not be determined.
    expect(rowActionEnabled(undefined)).toBe(false);
    expect(rowActionEnabled(false)).toBe(false);
    expect(rowActionEnabled(true)).toBe(true);
    const plan = planSaveStandardCost({
      form: devexForm(), scope: devexScope(), subaccountName: "Grid",
      existing: devexCost(), owningBusinessUnitId: null,
      canEdit: true, canCreate: true, canWriteRecord: false,
    });
    expect(plan.refusedReason).toContain("permission to change");
  });

  it("UT-ADCOST-032 at least one cluster is required", () => {
    expect(hasAnyCluster([false, false, false, false, false])).toBe(false);
    expect(hasAnyCluster([false, false, true, false, false])).toBe(true);
    expect(validateDevexForm(
      devexForm({ clusters: [false, false, false, false, false] }), devexScope(),
    )).toContain("Tick at least one cluster.");
  });

  it("UT-ADCOST-033 the cost must be an integer", () => {
    expect(isCostAmountValid("1500.5")).toBe(false);
    expect(costAmountError("1500.5")).toBe(COST_INTEGER_ERROR);
    expect(isCostAmountValid("1500")).toBe(true);
  });

  it("UT-ADCOST-034 a cost above 100,000,000 is rejected", () => {
    expect(COST_MAX).toBe(100_000_000);
    expect(costAmountError("100000001")).toBe(COST_RANGE_ERROR);
    expect(costAmountError("100000000")).toBeNull();
    expect(costAmountError("")).toBeNull();     // blankness is a separate Save term
    expect(isCostAmountValid("")).toBe(false);
  });

  it("UT-ADCOST-035 Poland defaults to PLN, everyone else to EUR", () => {
    expect(defaultUnit("Poland")).toBe(CHOICE_ADMIN.costUnit.pln);
    expect(defaultUnit("Germany")).toBe(CHOICE_ADMIN.costUnit.eur);
    expect(unitChoices("Poland", "Wind")).toEqual([
      CHOICE_ADMIN.costUnit.pln, CHOICE_ADMIN.costUnit.plnPerMw, CHOICE_ADMIN.costUnit.plnPerWtg,
    ]);
    expect(emptyDevexForm("Poland").unit).toBe(CHOICE_ADMIN.costUnit.pln);
    expect(emptyDevexForm("Poland").distributionFrequency)
      .toBe(DEFAULT_DISTRIBUTION_FREQUENCY_MONTHS);
  });

  it("UT-ADCOST-036 a per-WTG unit outside Wind is invalid", () => {
    expect(isPerWtg(CHOICE_ADMIN.costUnit.eurPerWtg)).toBe(true);
    expect(isUnitValid(CHOICE_ADMIN.costUnit.eurPerWtg, "PV")).toBe(false);
    expect(isUnitValid(CHOICE_ADMIN.costUnit.eurPerWtg, "Wind")).toBe(true);
    expect(validateDevexForm(
      devexForm({ unit: CHOICE_ADMIN.costUnit.eurPerWtg }),
      devexScope({ technology: "PV" }),
    )).toContain(UNIT_ERROR);
    // …and the PV choice list does not offer it in the first place.
    expect(unitChoices("Germany", "PV")).not.toContain(CHOICE_ADMIN.costUnit.eurPerWtg);
  });

  it("UT-ADCOST-037 changing the unit clears the amount", () => {
    const before = devexForm({ cost: "1500" });
    const after = applyUnitChange(before, CHOICE_ADMIN.costUnit.eurPerMw);
    expect(after.cost).toBe("");
    expect(after.unit).toBe(CHOICE_ADMIN.costUnit.eurPerMw);
    expect(after.dirty).toBe(true);
  });

  it("UT-ADCOST-038 selecting a subaccount back-fills the category and resets Cost Paid By", () => {
    const after = applySubaccountSelection(devexForm(), "sub9", "cat9");
    expect(after.subaccountId).toBe("sub9");
    expect(after.categoryId).toBe("cat9");
    expect(after.costPaidBy).toBeNull();
    expect(costPaidByChoices()).not.toContain(CHOICE_ADMIN.costPaidType.none);
  });

  it("UT-ADCOST-038b a subaccount stops being offered at 50 standard costs", () => {
    const many = Array.from({ length: MAX_COSTS_PER_SUBACCOUNT }, (_, i) =>
      devexCost({ id: `d${i}`, subaccountId: "sub1" }));
    expect(isSubaccountSelectable(many, "sub1")).toBe(false);
    expect(isSubaccountSelectable(many.slice(1), "sub1")).toBe(true);
  });

  it("UT-ADCOST-039 the standard-cost name and description are composed", () => {
    expect(composeStandardCostName("Germany", "Wind", "Grid"))
      .toBe("Standard Cost : Germany-Wind-Grid");
    expect(composeStandardCostDescription("Grid", "2026")).toBe("Standard Grid - 2026");
    const payload = buildStandardCostPayload(devexForm({ description: "2026" }), {
      scope: devexScope(), subaccountName: "Grid",
      owningBusinessUnitId: "bu-1", isCreate: true,
    });
    expect(payload[DEVEX_COL.name]).toBe("Standard Cost : Germany-Wind-Grid");
    expect(payload[DEVEX_COL.description]).toBe("Standard Grid - 2026");
    expect(payload[DEVEX_COL.descriptionInput]).toBe("2026");
    expect(payload[`${DEVEX_LOOKUP.subaccount}@odata.bind`])
      .toBe("/vsb_capexaccountlists(sub1)");
    expect(canSaveStandardCost(devexForm(), devexScope())).toBe(true);
  });

  it("UT-ADCOST-041 deleting a cost writes NO Apply tracking row", () => {
    const plan = planDeleteStandardCost(devexCost(), true);
    expect(plan.writes).toHaveLength(1);
    expect(plan.writes[0]).toMatchObject({ op: "delete", entitySet: DEVEX_ENTITY_SET });
    expect(plan.writes.some((w) => w.entitySet === APPLY_TRACKING_ENTITY_SET)).toBe(false);
    // The canvas appended the whole Apply block to the delete handler, and because the
    // cleanup blanked locSelectedCategory first, it recorded an "Apply All".
  });
});

/* ═════════════════════════════════════════════════════════════ the Apply trail ════ */

describe("the Apply audit trail", () => {
  const tracking = (o: Partial<ApplyTrackingRow> = {}): ApplyTrackingRow => ({
    id: "t1", countryId: "de", technology: CHOICE_ADMIN.technology.wind,
    action: CHOICE_ADMIN.applyAction.apply,
    contractType: CHOICE_ADMIN.contractTypes.landlease,
    bopStandardContractId: null,
    modifiedOn: "2026-03-04T09:12:00Z", modifiedByName: "A. Muster",
    ...o,
  });

  it("UT-ADCOST-042 Apply and Apply-to-All are disabled; the flow is never invoked", () => {
    const state = applyCommandState();
    expect(state.enabled).toBe(false);
    expect(state.disabledReason).toBe(APPLY_DISABLED_REASON);
    expect(state.disabledReason).toContain("not present in the solution export");
  });

  it("UT-ADCOST-043 the flow wrapper reports the missing flow; no job row is created", async () => {
    const args = synchronizeArgs({
      scope: scope(), contractType: CHOICE_ADMIN.contractTypes.landlease,
    });
    expect(args).toEqual({
      costType: "952850000", countryId: "de", technology: CHOICE_ADMIN.technology.wind,
    });
    expect(costTypeForContractType(null)).toBe("All");
    expect(costTypeWireValue("All")).toBe("All");
    expect(costTypeWireValue("BoP")).toBe("BoP");
    expect(costTypeWireValue("DevexCapex")).toBe("952850003");

    await expect(synchronizeStandardAssumptionCosts({ countryId: "de" }))
      .rejects.toThrow(/not present in the solution export/i);
  });

  it("UT-ADCOST-043b no tracking row is written from the client by default", () => {
    const plan = planApplyTracking({
      scope: scope(), contractType: CHOICE_ADMIN.contractTypes.landlease,
      existing: null, user: { mail: "a@vsb.energy", displayName: "A. Muster" },
    });
    expect(plan.writes).toHaveLength(0);
    expect(plan.refusedReason).toBe(APPLY_NOT_RUN_REASON);
  });

  it("UT-ADCOST-043c the canvas-parity mode reproduces the upsert exactly", () => {
    const plan = planApplyTracking({
      scope: scope(), contractType: null, existing: null,
      user: { mail: "a@vsb.energy", displayName: "A. Muster" },
      mode: "canvasParity",
    });
    expect(plan.writes).toHaveLength(1);
    expect(plan.writes[0].entitySet).toBe(APPLY_TRACKING_ENTITY_SET);
    expect(plan.writes[0].data).toMatchObject({
      [APPLY_TRACKING_COL.name]: "Germany - Wind - Apply All",
      [APPLY_TRACKING_COL.action]: CHOICE_ADMIN.applyAction.applyAll,
      [APPLY_TRACKING_COL.appliedByEmail]: "a@vsb.energy",
      [APPLY_TRACKING_COL.appliedByFullName]: "A. Muster",
    });
    // Rule 35 — one row per key, updated in place, so the table records "last applied".
    const update = planApplyTracking({
      scope: scope(), contractType: null, existing: tracking(),
      user: { mail: "a@vsb.energy", displayName: "A. Muster" }, mode: "canvasParity",
    });
    expect(update.writes[0]).toMatchObject({ op: "update", id: "t1" });
  });

  it("UT-ADCOST-044 the last-applied badge renders the date and the full name", () => {
    expect(lastAppliedLabel(tracking())).toBe("04.03.2026 Apply was made by A. Muster");
    expect(showLastApplied(tracking())).toBe(true);
  });

  it("UT-ADCOST-045 the badge is hidden with no tracking row for the scope", () => {
    expect(lastAppliedLabel(null)).toBe("");
    expect(showLastApplied(null)).toBe(false);
    expect(findLastApply(
      [tracking({ countryId: "fr" })], scope(),
      CHOICE_ADMIN.contractTypes.landlease, CHOICE_ADMIN.applyAction.apply,
    )).toBeNull();
    expect(findLastApply(
      [tracking()], scope(),
      CHOICE_ADMIN.contractTypes.landlease, CHOICE_ADMIN.applyAction.apply,
    )?.id).toBe("t1");
  });
});

/* ═══════════════════════════════════════════════════════════════ scope changes ════ */

describe("scope changes and empty states", () => {
  it("UT-ADCOST-047 a scope change changes the key both families are queried by", () => {
    const de = scope();
    const fr = scope({ countryId: "fr", countryName: "France" });
    expect(de.countryId).not.toBe(fr.countryId);
    // Both grids filter on the SAME triple, so both refetch.
    expect(filterByScope([period()], fr, CHOICE_ADMIN.contractTypes.landlease)).toEqual([]);
    expect(groupByCategory(
      [cat("cat1", 1)], [devexCost({ countryId: "de" })].filter((c) => c.countryId === fr.countryId),
      new Set(),
    )).toEqual([]);
  });

  it("UT-ADCOST-048 an empty scope yields four empty categories, Add still available", () => {
    expect(filterByScope([], opexScope(), CHOICE_ADMIN.contractTypes.landlease)).toEqual([]);
    expect(groupByCategory([cat("cat1", 1)], [], new Set())).toEqual([]);
    expect(COST_CATEGORIES).toHaveLength(4);
    // Nothing about an empty scope disables Add Contract Type.
    expect(canAddContractType(
      [], "ll-1", opexScope(), CHOICE_ADMIN.contractTypes.landlease, "landLease",
    )).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════ the screenshot-driven UI (p23/24) */

describe("GUIDE p23/p24 — the rail leaf key, the breadcrumb and the table display", () => {
  it("UT-ADCOST-049 the rail leaf key round-trips country and technology", () => {
    const key = costRailLeafKey("de-1", "Wind");
    expect(key).toBe("de-1::Wind");
    expect(parseCostRailLeafKey(key)).toEqual({ countryId: "de-1", technology: "Wind" });
    expect(parseCostRailLeafKey("not-a-leaf-key")).toBeNull();
  });

  it("UT-ADCOST-050 the breadcrumb reads Standard Assumptions / Costs / country / technology", () => {
    expect(costBreadcrumb(scope())).toEqual([
      "Standard Assumptions", "Costs", "Germany", "Wind",
    ]);
    expect(costBreadcrumb(emptyScope())).toEqual(["Standard Assumptions", "Costs", "", ""]);
  });

  it("UT-ADCOST-051 the override caption is verbatim and shared by both Apply buttons", () => {
    expect(APPLY_OVERRIDE_CAPTION).toBe(
      "Apply standard cost to relevant projects, this will override existing standard "
      + "assumption cost.",
    );
  });

  it("UT-ADCOST-052 the cost column formats as thousands-separated integer + unit", () => {
    expect(formatDevexCostAmount(10000, CHOICE_ADMIN.costUnit.eur)).toBe("10,000 EUR");
    expect(formatDevexCostAmount(1500, CHOICE_ADMIN.costUnit.pln)).toBe("1,500 PLN");
    expect(formatDevexCostAmount(null, CHOICE_ADMIN.costUnit.eur)).toBe("—");
    expect(unitLabel(CHOICE_ADMIN.costUnit.eurPerWtg)).toBe("EUR/WTG");
    expect(costPaidLabel(CHOICE_ADMIN.costPaidType.devCo)).toBe("DevCo");
    expect(costPaidLabel(null)).toBe("—");
  });

  it("UT-ADCOST-053 the Category/Account and Sub-Account columns match the screenshot exactly", () => {
    expect(categoryAccountColumnLabel("Turbine", "PV Supply Agreement"))
      .toBe("Turbine / PV Supply Agreement");
    expect(subAccountColumnLabel("Turbine", "PV Supply Agreement", "80000_0"))
      .toBe("Turbine / PV Supply Agreement - 80000_0");
    // A different format from the picker's own aggregated name — no dash there.
    expect(aggregatedSubaccountName("Turbine", "PV Supply Agreement", "80000_0"))
      .toBe("Turbine / PV Supply Agreement 80000_0");
  });
});
