/**
 * Land Lease Costs Screen — unit tests.
 *
 * IDs are `UT-LAND-nnn`, one id per case. Where a case was ported from the harness skeleton
 * (`VSBCloud-Code-App-Skeleton/vsbcode/src/features/cost/land-lease/rules.test.ts`) the
 * skeleton's own id is cited on the case, so the two suites can be diffed. Cases that exist
 * only because the canvas says something the skeleton does not are marked `canvas-only`.
 *
 * The rules that most need pinning, in order: `writesContractHeader` (Period 1 owns the
 * header), `nextPeriod` (the corrected Period-9 cap), `deleteDialog` (the skeleton's bodies
 * were invented), `LEASE_NUMERIC_SPEC` (the skeleton's rate ceilings were 10x too high) and
 * `canSaveLandLease` (the skeleton implemented a twentieth of it).
 */
import { describe, expect, it } from "vitest";
import {
  LAND_LEASE_PERIOD, OPEX_LAND_LEASE_PERIOD, LAND_LEASE_AGGREGATION, LAND_LEASE_SECURED,
  TYPE_OF_CONTRACT, TECHNOLOGY, LEASE_MSG, LEASE_LABELS, LEASE_NUMERIC_SPEC, LEASE_BIND,
  LEASE_COST_COL, LEASE_PERIOD_COL, LEASE_ALLOC_COL, LEASE_ENTITY_SET, LEASE_STANDARD_STAMP,
  LAND_LEASE_COLUMNS, LEASE_DESCRIPTION_MAX_LENGTH, DURATION_YEAR_OPTIONS,
  DURATION_MONTH_OPTIONS, clearsSelectionAfterSave, leaseSaveError, landLeaseColumns,
  orderedSubaccounts, toggleFold, periodNumber, periodValue, periodLabel, isPeriodOne,
  nextPeriod, nextPeriodCanvasParity, buildContracts, contractsForSubaccount, firstPeriod,
  lastPeriod, lastPeriodByName, firstPeriodHasRate, subaccountPeriodRows,
  addMonths, addDays, leasePeriodEnd, formatLeaseDate, formatFixCosts, formatEurPerMw,
  formatEurPerWtg, formatEurPerMwh, formatPercentOfRevenues, formatPercentOfRevenuesScaled,
  formatInflationPercent, formatDurationYears, formatDurationMonths,
  formatDurationYearsSingular, formatDurationMonthsSingular,
  securedCell, allocationCell, otpCell, inflationProfileCell, toLeaseGridRow,
  isStandardPeriodName, isStandardPeriodNameLower,
  toggleLeaseSelection, toggleLeaseSelectionCanvasParity, NO_LEASE_SELECTION,
  writesContractHeader, headerEditable, landLeaseCostName, leasePanelTitle, nextPeriodName,
  resolveStartDate, resetStartDateVisible, resetStartDate,
  defaultDurationMonths, defaultDurationYears, defaultAggregation, defaultCurrencyCode,
  currencyEditable, defaultDistributionFrequency, durationYearLabel, durationMonthLabel,
  durationYearLabelCanvasParityDefault,
  generatorOptions, allocationVisible, allocationPickerVisibleCanvasParityTxt,
  allocationEditable, defaultAllocatedGenerators, allWtgSelected, allWtgSelectedCanvasParity,
  diffAllocation, allocationName,
  oneTimePaymentPayload, oneTimePaymentChecked, showSecondPayment, showThirdPayment,
  addPaymentButton, securedValue, securedChecked,
  inflationSectionVisible, areaInflationVisible, inflationProfileLabel,
  countryInflationDisplay, inflationStartYearDefault, inflationStartYearFromCod,
  resolveInflationProfileValue,
  validateLeaseNumber, validateDueDate, validateInflationStartYear, validateInflationProfile,
  validateLeaseDescription, validateStartDate, startDateErrorVisibleCanvasParity,
  landLeaseFormFrom, emptyLandLeaseForm, formHasAnyRate, periodHasAnyRate, leaseFieldErrors,
  hintVisible, additionalPeriodsWarningVisible, canSaveLandLease,
  buildCostPayload, buildPeriodPayload, buildAllocationPayload, planLeaseSave, bindParent,
  planLeaseDelete, deleteDialog,
  isStandardLocked, leaseCommands, leaseCommandGates,
  leaseAssumptionQuery, mapAssumptionPeriod, mapAssumptionPeriodStrict, mapAggregation,
  mapSecured, mapAllWtgAllocated, roundTwoDecimals, resolveStandardInflationProfile,
  planStandardAllocation, standardPeriodStarts, planStandardImport,
  type LeaseCostRow, type LeasePeriodRow, type LeaseAllocationRow, type LeaseAssumptionRow,
  type LeaseProjectContext, type LandLeaseForm, type GeneratorOption, type LeaseCommandArgs,
  type LeaseWrite,
} from "./landLeaseRules";

/** `LeaseWrite` is a discriminated union; a delete carries no payload. Narrow, don't cast. */
function payloadOf(w: LeaseWrite | undefined): Record<string, unknown> {
  if (!w || w.op === "delete") throw new Error(`expected a write with a payload, got ${w?.op}`);
  return w.payload;
}

/** The `parentRef` marker, which `delete` also lacks. */
function parentRefOf(w: LeaseWrite | undefined): string | undefined {
  if (!w || w.op === "delete") return undefined;
  return w.parentRef;
}

/* ───────────────────────────────────────────────────────────────────── fixtures */

function cost(over: Partial<LeaseCostRow> = {}): LeaseCostRow {
  return {
    id: "cost-1", name: "Windpark A-Leaseholders-Owner B", description: "Owner B",
    subaccountId: "sub-1", landOwner: "Owner B", currencyId: "cur-eur", currencyName: "Euro",
    secured: LAND_LEASE_SECURED.no, allWtgAllocated: false,
    isStandardContract: false, isStartDateStandardAssumption: false,
    amountOneTimePayment: null, amountOneTimePayment2: null, amountOneTimePayment3: null,
    dueDateOneTimePayment: null, dueDateOneTimePayment2: null, dueDateOneTimePayment3: null,
    useInflationProfile: false, useCountryInflationProfile: false, inflationProfile: null,
    inflationCountryArea: null, inflationStartYear: null, createdOn: "2025-01-01T00:00:00Z",
    ...over,
  };
}

function period(over: Partial<LeasePeriodRow> = {}): LeasePeriodRow {
  return {
    id: "per-1", name: "Owner B", projectCostId: "cost-1",
    period: LAND_LEASE_PERIOD.period1, startDate: "2027-01-01",
    durationYears: 5, durationMonths: 0, fixedCosts: 1000, percentOfRevenues: null,
    eurPerMwh: null, eurPerMw: null, eurPerWtg: null,
    aggregation: LAND_LEASE_AGGREGATION.sum, distributionFrequency: 12,
    ...over,
  };
}

const alloc = (over: Partial<LeaseAllocationRow> = {}): LeaseAllocationRow =>
  ({ id: "a-1", projectCostId: "cost-1", generatorInProjectId: "G1", ...over });

function assumption(over: Partial<LeaseAssumptionRow> = {}): LeaseAssumptionRow {
  return {
    id: "sa-1", subaccountId: "sub-1", subaccountName: "Leaseholders",
    name: "Standard Lease Holder", description: "Standard Lease Holder",
    period: OPEX_LAND_LEASE_PERIOD.period1,
    durationYears: 5, durationMonths: 0, aggregation: LAND_LEASE_AGGREGATION.sum,
    currencyId: "cur-eur", secured: true, allWtgAllocated: false,
    fixCosts: 1000, percentOfRevenues: null, eurPerMwh: null, eurPerMw: null, eurPerWtg: null,
    amountOneTimePayment: null, amountOneTimePayment2: null, amountOneTimePayment3: null,
    dueDateOneTimePayment: null, dueDateOneTimePayment2: null, dueDateOneTimePayment3: null,
    distributionFrequency: 12, useInflationProfile: false, useCountryInflationProfile: false,
    inflationProfile: null, inflationCountryArea: null,
    ...over,
  };
}

const ctx = (over: Partial<LeaseProjectContext> = {}): LeaseProjectContext => ({
  projectId: "proj-1", projectName: "Windpark A", owningBusinessUnitId: "bu-1",
  countryId: "country-de", countryName: "Germany", isoCurrencyCode: "EUR",
  technology: TECHNOLOGY.wind, codDate: "2027-04-01", areaWithRegion: null,
  ...over,
});

function form(over: Partial<LandLeaseForm> = {}): LandLeaseForm {
  return {
    description: "Owner B", startDate: "2027-01-01", durationYears: 5, durationMonths: 0,
    currencyId: "cur-eur",
    fixedCosts: "1000.00", percentOfRevenues: "", eurPerMwh: "", eurPerMw: "", eurPerWtg: "",
    aggregation: LAND_LEASE_AGGREGATION.sum, distributionFrequency: 12,
    securedChecked: false, allWtgAllocated: false, allocatedGeneratorIds: ["G1"],
    inflationChecked: false, countryInflationChecked: false,
    inflationStartYear: "2028", inflationProfile: "", inflationCountryArea: null,
    oneTimePaymentsOn: false,
    payments: { dueDate: "", amount: "", dueDate2: "", amount2: "", dueDate3: "", amount3: "" },
    showSecondPayment: false, showThirdPayment: false, isStartDateStandardAssumption: false,
    ...over,
  };
}

const gen = (id: string, name: string, order = 1): GeneratorOption =>
  ({ id, name, label: `${name} - Active`, order, kind: "wtg" });

const perms = {
  canCreateCost: true, canCreatePeriod: true, canEditRecord: true, canDeleteRecord: true,
};

const saveCtx = (over: Partial<Parameters<typeof canSaveLandLease>[0]> = {}) => ({
  form: form(),
  selectedCost: cost(),
  selectedPeriod: period(),
  contract: null,
  panelState: "Edit" as const,
  technology: TECHNOLOGY.wind,
  countryName: "Germany",
  ...over,
});

/* ══════════════════════════════════════════════════ option sets and provenance ══ */

describe("Land Lease — option sets, verified against the org", () => {
  it("UT-LAND-001 the Land Lease period choice runs 1..9 and stops there", () => {
    expect(Object.values(LAND_LEASE_PERIOD)).toEqual([
      952850000, 952850001, 952850002, 952850003, 952850004,
      952850005, 952850006, 952850007, 952850008,
    ]);
    // The assumptions side has TEN — the extra value is why rule 14 exists.
    expect(OPEX_LAND_LEASE_PERIOD.period10).toBe(952850009);
    expect(Object.values(OPEX_LAND_LEASE_PERIOD)).toHaveLength(10);
  });

  it("UT-LAND-002 Secured is a choice whose Yes is the LOW value", () => {
    // Ported from skeleton "Secured is written as a Yes/No CHOICE, not a boolean".
    expect(LAND_LEASE_SECURED.yes).toBe(952850000);
    expect(LAND_LEASE_SECURED.no).toBe(952850001);
    expect(securedValue(true)).toBe(LAND_LEASE_SECURED.yes);
    expect(securedValue(false)).toBe(LAND_LEASE_SECURED.no);
  });

  it("UT-LAND-003 aggregation is shared verbatim with the assumptions table", () => {
    expect(LAND_LEASE_AGGREGATION).toEqual({ sum: 952850000, max: 952850001, min: 952850002 });
    expect(TYPE_OF_CONTRACT.landlease).toBe(952850000);
    // BoP sits in a different band entirely; a naive +1 walk over the set would be wrong.
    expect(TYPE_OF_CONTRACT.bop).toBe(128470001);
    expect(TECHNOLOGY.wind).toBe(952850000);
    expect(TECHNOLOGY.pv).toBe(952850001);
  });

  it("UT-LAND-004 every create binds the owning business unit by its WRITE form", () => {
    // docs/01-BUGS-FOUND.md S-5 — the skeleton omits this on vsb_landleaseallocationwtgs.
    const payload = buildAllocationPayload({
      ctx: ctx(),
      cost: { id: "cost-1", landOwner: "Owner B", description: "Owner B" },
      generator: gen("G1", "WTG_1"),
    });
    expect(payload["owningbusinessunit@odata.bind"]).toBe("/businessunits(bu-1)");
    expect(payload).not.toHaveProperty("_owningbusinessunit_value");
    expect(LEASE_BIND.owningBusinessUnit.nav).toBe("owningbusinessunit");
    // Lookups use the navigation property, never the read form.
    expect(payload["vsb_ProjectCost@odata.bind"]).toBe("/vsb_landleaseprojectcosts(cost-1)");
    expect(payload["vsb_GeneratorInProject@odata.bind"]).toBe("/vsb_generatorinprojects(G1)");
    expect(LEASE_ALLOC_COL.cost).toBe("_vsb_projectcost_value");
  });
});

/* ═══════════════════════════════════════════════════════ cards, contracts, rows ══ */

describe("Land Lease — cards, contracts and periods", () => {
  it("UT-LAND-005 sub-accounts render in Order and start collapsed", () => {
    // Ported from skeleton UT-LEASE-001.
    const cards = orderedSubaccounts([
      { id: "b", name: "Distance and Rotor Overfly Areas", order: 2 },
      { id: "a", name: "Locations", order: 1 },
      { id: "c", name: "Other", order: 9 },
    ]);
    expect(cards.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(cards.every((c) => c.isFolded)).toBe(true);
  });

  it("UT-LAND-006 the chevron toggles exactly one card", () => {
    const cards = orderedSubaccounts([
      { id: "a", name: "Locations", order: 1 },
      { id: "b", name: "Other", order: 2 },
    ]);
    const after = toggleFold(cards, "a");
    expect(after[0]!.isFolded).toBe(false);
    expect(after[1]!.isFolded).toBe(true);
    expect(toggleFold(after, "a")[0]!.isFolded).toBe(true);
  });

  it("UT-LAND-007 periods are scoped to their contract", () => {
    // Ported from skeleton UT-LEASE-002.
    const contracts = buildContracts(
      [cost({ id: "c1" }), cost({ id: "c2" })],
      [
        period({ id: "p1", projectCostId: "c1" }),
        period({ id: "p2", projectCostId: "c1", period: LAND_LEASE_PERIOD.period2 }),
        period({ id: "p3", projectCostId: "c2" }),
      ],
    );
    expect(contracts[0]!.periods.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(contracts[1]!.periods.map((p) => p.id)).toEqual(["p3"]);
    expect(contractsForSubaccount(contracts, "sub-1")).toHaveLength(2);
    expect(contractsForSubaccount(contracts, "sub-9")).toHaveLength(0);
  });

  it("UT-LAND-008 periods sort by period NUMBER, and first/last read off that", () => {
    // Ported from skeleton "periods sort by their period NUMBER".
    const c = buildContracts([cost()], [
      period({ id: "p3", period: LAND_LEASE_PERIOD.period3 }),
      period({ id: "p1", period: LAND_LEASE_PERIOD.period1 }),
      period({ id: "p2", period: LAND_LEASE_PERIOD.period2 }),
    ])[0]!;
    expect(c.periods.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
    expect(lastPeriod(c)!.id).toBe("p3");
    expect(firstPeriod(c)!.id).toBe("p1");
    expect(lastPeriod({ cost: cost(), periods: [] })).toBeNull();
    expect(firstPeriod({ cost: cost(), periods: [] })).toBeNull();
  });

  it("UT-LAND-009 the period enum maps both ways and labels itself", () => {
    // Ported from skeleton "the period enum maps both ways".
    expect(periodNumber(LAND_LEASE_PERIOD.period1)).toBe(1);
    expect(periodNumber(LAND_LEASE_PERIOD.period9)).toBe(9);
    expect(periodNumber(null)).toBe(0);
    expect(periodNumber(123)).toBe(0);
    expect(periodValue(4)).toBe(LAND_LEASE_PERIOD.period4);
    expect(periodValue(10)).toBeNull();
    expect(periodValue(0)).toBeNull();
    expect(isPeriodOne(LAND_LEASE_PERIOD.period1)).toBe(true);
    expect(isPeriodOne(LAND_LEASE_PERIOD.period2)).toBe(false);
    // canvas-only: the delete dialog interpolates this label (LL:6028).
    expect(periodLabel(LAND_LEASE_PERIOD.period3)).toBe("Period 3");
    expect(periodLabel(null)).toBe("");
  });

  it("UT-LAND-010 the two notions of 'last period' genuinely disagree", () => {
    // canvas-only. SOURCE DEFECT LL-D4: Add Period sorts by Period (LL:262), Delete sorts by
    // Name (LL:370).
    const c = buildContracts([cost()], [
      period({ id: "p1", name: "Zulu", period: LAND_LEASE_PERIOD.period1 }),
      period({ id: "p2", name: "Alpha", period: LAND_LEASE_PERIOD.period2 }),
    ])[0]!;
    expect(lastPeriod(c)!.id).toBe("p2");
    expect(lastPeriodByName(c)!.id).toBe("p1");
    expect(lastPeriodByName({ cost: cost(), periods: [] })).toBeNull();
  });

  it("UT-LAND-011 the card's rows sort by Name, with Start Date only breaking ties", () => {
    // canvas-only: LL:919 nests Sort(Sort(…, 'Start Date'), Name) and the OUTER sort wins.
    const contracts = buildContracts(
      [cost({ id: "c1" }), cost({ id: "c2", subaccountId: "sub-2" })],
      [
        period({ id: "p1", projectCostId: "c1", name: "Beta", startDate: "2030-01-01" }),
        period({ id: "p2", projectCostId: "c1", name: "Alpha", startDate: "2031-01-01" }),
        period({ id: "p3", projectCostId: "c1", name: "Alpha", startDate: "2029-01-01" }),
        period({ id: "p4", projectCostId: "c2", name: "Aaa" }),
      ],
    );
    expect(subaccountPeriodRows(contracts, "sub-1").map((p) => p.id))
      .toEqual(["p3", "p2", "p1"]);
    expect(subaccountPeriodRows(contracts, "sub-2").map((p) => p.id)).toEqual(["p4"]);
  });
});

/* ══════════════════════════════════════════════ rule 2 · Period 1 owns the header ══ */

describe("Land Lease — Period 1 owns the contract header", () => {
  it("UT-LAND-012 the header is written when editing Period 1", () => {
    // Ported from skeleton UT-LEASE-003.
    expect(writesContractHeader(period({ period: LAND_LEASE_PERIOD.period1 }), false)).toBe(true);
  });

  it("UT-LAND-013 the header is NOT written when editing Period 2 or later", () => {
    // Ported from skeleton UT-LEASE-004.
    expect(writesContractHeader(period({ period: LAND_LEASE_PERIOD.period2 }), false)).toBe(false);
    expect(writesContractHeader(period({ period: LAND_LEASE_PERIOD.period9 }), false)).toBe(false);
  });

  it("UT-LAND-014 a brand-new contract always writes the header", () => {
    // Ported from skeleton UT-LEASE-005.
    expect(writesContractHeader(null, true)).toBe(true);
    expect(writesContractHeader(period({ period: LAND_LEASE_PERIOD.period3 }), true)).toBe(true);
  });

  it("UT-LAND-015 the header DisplayMode gate branches on the COST being blank", () => {
    // canvas-only: `period.Period = 'Period 1' || IsBlank(cost)`, eleven controls (LL:2196 …).
    expect(headerEditable(period({ period: LAND_LEASE_PERIOD.period1 }), cost())).toBe(true);
    expect(headerEditable(period({ period: LAND_LEASE_PERIOD.period2 }), cost())).toBe(false);
    expect(headerEditable(null, null)).toBe(true);
    // Add Period on an existing contract: cost present, period blank — header is LOCKED.
    expect(headerEditable(null, cost())).toBe(false);
    expect(allocationEditable(period({ period: LAND_LEASE_PERIOD.period2 }), cost())).toBe(false);
  });

  it("UT-LAND-016 the contract Name convention, untrimmed", () => {
    // Ported from skeleton UT-LEASE-006; the trailing space is what live rows carry.
    expect(landLeaseCostName("Windpark A", "Leaseholders", "Owner B"))
      .toBe("Windpark A-Leaseholders-Owner B");
    expect(landLeaseCostName("Project New Data ", "Location", "Test 1002"))
      .toBe("Project New Data -Location-Test 1002");
  });

  it("UT-LAND-017 editing Period 1 is titled 'Edit Contract', not 'Edit Period'", () => {
    // canvas-only: lbl_…_BodyHeader_1.Text, LL:2026.
    const t = (c: LeaseCostRow | null, p: LeasePeriodRow | null) =>
      leasePanelTitle({ selectedCost: c, selectedPeriod: p, subaccountName: "Leaseholders" });
    expect(t(null, null)).toBe("Add Contract - Leaseholders");
    expect(t(cost(), null)).toBe("Add Period - Leaseholders");
    expect(t(cost(), period({ period: LAND_LEASE_PERIOD.period2 })))
      .toBe("Edit Period - Leaseholders");
    expect(t(cost(), period({ period: LAND_LEASE_PERIOD.period1 })))
      .toBe("Edit Contract - Leaseholders");
  });
});

/* ══════════════════════════════════════ rules 7-8 · period progression and names ══ */

describe("Land Lease — period progression", () => {
  it("UT-LAND-018 the next period number increments", () => {
    // Ported from skeleton UT-LEASE-010.
    expect(nextPeriod(LAND_LEASE_PERIOD.period3)).toBe(LAND_LEASE_PERIOD.period4);
    expect(nextPeriod(null)).toBe(LAND_LEASE_PERIOD.period1);
    expect(nextPeriod(LAND_LEASE_PERIOD.period8)).toBe(LAND_LEASE_PERIOD.period9);
  });

  it("UT-LAND-019 Period 9 does NOT wrap, and the canvas twin still does", () => {
    // Ported from skeleton UT-LEASE-011. SOURCE DEFECT LL-D1.
    expect(nextPeriod(LAND_LEASE_PERIOD.period9)).toBeNull();
    expect(nextPeriodCanvasParity(LAND_LEASE_PERIOD.period9)).toBe(LAND_LEASE_PERIOD.period1);
    expect(nextPeriodCanvasParity(LAND_LEASE_PERIOD.period8)).toBe(LAND_LEASE_PERIOD.period9);
    expect(nextPeriodCanvasParity(null)).toBe(LAND_LEASE_PERIOD.period1);
  });

  it("UT-LAND-020 a numeric suffix in the parent's name auto-increments", () => {
    // Ported from skeleton UT-LEASE-012, with the condition's MEANING corrected — see
    // UT-LAND-021.
    expect(nextPeriodName("Lease - 3", false)).toBe("Lease - 4");
    expect(nextPeriodName("Lease - 9", false)).toBe("Lease - 10");
    expect(nextPeriodName("Standard LL Locations - 2", false))
      .toBe("Standard LL Locations - 3");
  });

  it("UT-LAND-021 a Period-1 parent always falls back to ' - 2'", () => {
    // Ported from skeleton UT-LEASE-013, INVERTED. SKELETON DIVERGENCE: the skeleton named
    // the flag `hasPeriod1Sibling`; the canvas `CountRows(...) = 0` compares the parent's own
    // primary key, so it means "the parent is not Period 1" (LL:388).
    expect(nextPeriodName("Lease", false)).toBe("Lease - 2");
    expect(nextPeriodName("Lease - 3", true)).toBe("Lease - 3 - 2");
    expect(nextPeriodName("Owner B", true)).toBe("Owner B - 2");
  });

  it("UT-LAND-022 Find-first truncation loses a repeated suffix", () => {
    // canvas-only. SOURCE DEFECT LL-D3: `Find` returns the FIRST match (LL:388).
    expect(nextPeriodName("A - 3 - 3", false)).toBe("A - 4");
    // A non-repeating name is unaffected.
    expect(nextPeriodName("A - 2 - 3", false)).toBe("A - 2 - 4");
  });

  it("UT-LAND-023 Period 1 must carry a rate before the chain can be extended", () => {
    // Ported from skeleton UT-LEASE-014's first half.
    const withRate = buildContracts([cost()], [period({ fixedCosts: 1000 })])[0]!;
    const noRate = buildContracts([cost()], [period({
      fixedCosts: null, percentOfRevenues: null,
      eurPerMw: null, eurPerMwh: null, eurPerWtg: null,
    })])[0]!;
    expect(firstPeriodHasRate(withRate)).toBe(true);
    expect(firstPeriodHasRate(noRate)).toBe(false);
    expect(firstPeriodHasRate({ cost: cost(), periods: [] })).toBe(false);
    // Any ONE of the five is enough.
    expect(firstPeriodHasRate(buildContracts([cost()], [period({
      fixedCosts: null, percentOfRevenues: null,
      eurPerMw: null, eurPerMwh: null, eurPerWtg: 67500,
    })])[0]!)).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════ grid cells and formats ══ */

describe("Land Lease — the grid", () => {
  it("UT-LAND-024 the header runs Description..OTP with no Threshold or Frequency", () => {
    // canvas-only: resolved from the X chain in LL:393-902. APP DIVERGENCE from BASE_COLUMNS.
    expect(LAND_LEASE_COLUMNS.map((c) => c.key)).toEqual([
      "description", "startDate", "durationYears", "durationMonths", "endDate", "currency",
      "inflationProfile", "fixCosts", "percentOfRevenues", "eurPerMwh", "eurPerMw",
      "eurPerWtg", "aggregation", "secured", "allocation", "otp",
    ]);
    expect(LAND_LEASE_COLUMNS.map((c) => c.key)).not.toContain("threshold");
    expect(LAND_LEASE_COLUMNS.map((c) => c.key)).not.toContain("frequency");
  });

  it("UT-LAND-025 the money headers interpolate the country currency, with two fallbacks", () => {
    // canvas-only: `"EUR"` on Fix Costs (LL:606) and `"Cur."` on the rates (LL:710).
    const pln = landLeaseColumns("PLN");
    expect(pln.find((c) => c.key === "fixCosts")!.label).toBe("Fix Costs p.a. [PLN]");
    expect(pln.find((c) => c.key === "eurPerMwh")!.label).toBe("PLN/MWh p.a.");
    const none = landLeaseColumns(null);
    expect(none.find((c) => c.key === "fixCosts")!.label).toBe("Fix Costs p.a. [EUR]");
    expect(none.find((c) => c.key === "eurPerWtg")!.label).toBe("Cur./WTG p.a.");
  });

  it("UT-LAND-026 the End Date is start + duration - one day", () => {
    // canvas-only: LL:1468.
    expect(leasePeriodEnd({ startDate: "2027-04-01", durationYears: 5, durationMonths: 0 }))
      .toBe("2032-03-31");
    expect(leasePeriodEnd({ startDate: "2027-04-01", durationYears: 0, durationMonths: 1 }))
      .toBe("2027-04-30");
    expect(leasePeriodEnd({ startDate: null, durationYears: 5, durationMonths: 0 })).toBe("");
    // Blank duration parts coerce to zero in Power Fx arithmetic.
    expect(leasePeriodEnd({ startDate: "2027-04-01", durationYears: null, durationMonths: null }))
      .toBe("2027-03-31");
  });

  it("UT-LAND-027 month arithmetic clamps to the end of the target month", () => {
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonths("2027-03-31", -1)).toBe("2027-02-28");
    expect(addMonths("2027-04-01", 60)).toBe("2032-04-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addMonths("", 1)).toBe("");
  });

  it("UT-LAND-028 the grid date is dd.mm.yy", () => {
    expect(formatLeaseDate("2027-08-30")).toBe("30.08.27");
    expect(formatLeaseDate("2030-01-05")).toBe("05.01.30");
    expect(formatLeaseDate(null)).toBe("");
    expect(formatLeaseDate("not-a-date")).toBe("");
  });

  it("UT-LAND-029 the grid never singularises a duration", () => {
    // canvas-only: LL:1518 / LL:1558 hard-code " years" and " months"; the PANEL dropdown
    // (LL:2635) does singularise, so the same number reads two ways.
    expect(formatDurationYears(1)).toBe("1 years");
    expect(formatDurationMonths(1)).toBe("1 months");
    expect(formatDurationYears(0)).toBe("0 years");
    expect(formatDurationYears(null)).toBe("");
    expect(formatDurationMonths(null)).toBe("");
    expect(formatDurationYearsSingular(1)).toBe("1 year");
    expect(formatDurationMonthsSingular(1)).toBe("1 month");
    expect(formatDurationYearsSingular(5)).toBe("5 years");
    expect(formatDurationMonthsSingular(null)).toBe("");
  });

  it("UT-LAND-030 each numeric column carries its own Power Fx format", () => {
    // canvas-only: LL:1332, LL:1136/1141, LL:1210, LL:1295.
    expect(formatFixCosts(1234567)).toBe("1,234,567");
    expect(formatFixCosts(1234.56)).toBe("1,235");
    expect(formatEurPerMw(67500)).toBe("67,500");
    expect(formatEurPerWtg(67500)).toBe("67,500");
    expect(formatEurPerMwh(1.4)).toBe("1.4");
    expect(formatEurPerMwh(1.45)).toBe("1.45");
    expect(formatEurPerMwh(2)).toBe("2.0");
    // A stored ZERO prints as "0" — Power Fx only blanks Blank(), not 0.
    expect(formatFixCosts(0)).toBe("0");
    expect(formatFixCosts(null)).toBe("");
    expect(formatEurPerMwh(undefined)).toBe("");
  });

  it("UT-LAND-031 the percentage columns are pinned to the non-scaling reading", () => {
    // SOURCE AMBIGUITY LL-A1 — both readings of `"…0.00 %"` are kept reachable.
    expect(formatPercentOfRevenues(20)).toBe("20.00 %");
    expect(formatPercentOfRevenuesScaled(20)).toBe("2,000.00 %");
    expect(formatPercentOfRevenues(null)).toBe("");
    expect(formatPercentOfRevenuesScaled(null)).toBe("");
    expect(formatInflationPercent(2)).toBe("2.0 %");
    expect(formatInflationPercent(null)).toBe("");
  });

  it("UT-LAND-032 the Secured cell shows the HEADER's choice label", () => {
    // canvas-only: LL:1246. APP DIVERGENCE — ./rules.ts renders `standard ? "Yes" : ""`.
    expect(securedCell(cost({ secured: LAND_LEASE_SECURED.yes }))).toBe("Yes");
    expect(securedCell(cost({ secured: LAND_LEASE_SECURED.no }))).toBe("No");
    expect(securedCell(cost({ secured: null }))).toBe("");
    expect(securedCell(null)).toBe("");
  });

  it("UT-LAND-033 the Allocation cell is never blank", () => {
    // VERIFIED against LL:1058, which the brief asked to confirm: If(AllWTGAllocated,"Yes","No").
    expect(allocationCell(cost({ allWtgAllocated: true }))).toBe("Yes");
    expect(allocationCell(cost({ allWtgAllocated: false }))).toBe("No");
    // A missing header is Blank(), which is falsy in Power Fx — still "No", never "".
    expect(allocationCell(null)).toBe("No");
  });

  it("UT-LAND-034 the OTP cell keys off the FIRST payment only", () => {
    // VERIFIED against LL:1010, which the brief asked to confirm.
    expect(otpCell(cost({ amountOneTimePayment: 1000, dueDateOneTimePayment: "04/2027" })))
      .toBe("Yes");
    expect(otpCell(cost({ amountOneTimePayment: 1000, dueDateOneTimePayment: null }))).toBe("No");
    expect(otpCell(cost({ amountOneTimePayment: null, dueDateOneTimePayment: "04/2027" })))
      .toBe("No");
    // Payments 2 and 3 are NOT consulted — a contract with only a 2nd payment reads "No".
    expect(otpCell(cost({
      amountOneTimePayment2: 500, dueDateOneTimePayment2: "04/2028",
    }))).toBe("No");
    expect(otpCell(null)).toBe("No");
  });

  it("UT-LAND-035 the Inflation Profile cell ignores 'Use Inflation Profile'", () => {
    // canvas-only: LL:1369 branches only on 'Use Country Inflation Profile'.
    const de = { countryName: "Germany", areaWithRegion: null };
    expect(inflationProfileCell(
      cost({ useCountryInflationProfile: true, inflationProfile: 2 }), de,
    )).toBe("Germany");
    expect(inflationProfileCell(
      cost({ useCountryInflationProfile: false, inflationProfile: 2 }), de,
    )).toBe("2.0 %");
    // Inflation OFF but a profile stored: the canvas still prints it. APP DIVERGENCE.
    expect(inflationProfileCell(
      cost({ useInflationProfile: false, useCountryInflationProfile: false, inflationProfile: 1.5 }),
      de,
    )).toBe("1.5 %");
    expect(inflationProfileCell(null, de)).toBe("");
  });

  it("UT-LAND-036 Italy renders as 'Italy - <area>'", () => {
    // canvas-only: LL:1380 and again in the panel at LL:4707.
    const it = { countryName: "Italy", areaWithRegion: "Italy_Nord" };
    expect(inflationProfileCell(cost({ useCountryInflationProfile: true }), it))
      .toBe("Italy - Nord");
    expect(countryInflationDisplay(it)).toBe("Italy - Nord");
    expect(countryInflationDisplay({ countryName: "Germany", areaWithRegion: null }))
      .toBe("Germany");
  });

  it("UT-LAND-037 a rendered row carries the description, the styling and all sixteen cells", () => {
    const row = toLeaseGridRow({
      period: period({ name: "Standard LL Locations", eurPerWtg: 67500 }),
      cost: cost({ secured: LAND_LEASE_SECURED.yes, allWtgAllocated: true }),
      ctx: { countryName: "Germany", areaWithRegion: null },
      selectedPeriodId: "per-1",
    });
    // The Description column shows the PERIOD's Name, not the header's description (LL:1642).
    expect(row.cells.description).toBe("Standard LL Locations");
    expect(row.standard).toBe(true);
    expect(row.bold).toBe(true);
    expect(row.selected).toBe(true);
    expect(row.cells.endDate).toBe("31.12.31");
    expect(row.cells.currency).toBe("Euro");
    expect(row.cells.aggregation).toBe("SUM");
    expect(row.cells.secured).toBe("Yes");
    expect(row.cells.allocation).toBe("Yes");
    expect(row.cells.otp).toBe("No");
    expect(Object.keys(row.cells)).toHaveLength(LAND_LEASE_COLUMNS.length);
  });

  it("UT-LAND-038 'Standard' is case-sensitive everywhere except the delete gate", () => {
    // canvas-only: LL:252/992 use StartsWith, LL:361 lower-cases first.
    expect(isStandardPeriodName("Standard LL Locations")).toBe(true);
    expect(isStandardPeriodName("standard LL Locations")).toBe(false);
    expect(isStandardPeriodNameLower("standard LL Locations")).toBe(true);
    expect(isStandardPeriodNameLower("Standard LL Locations")).toBe(true);
    expect(isStandardPeriodNameLower("Owner B")).toBe(false);
  });

  it("UT-LAND-039 clicking the selected row deselects it, and the canvas leaves a stale cost", () => {
    // canvas-only. SOURCE DEFECT LL-D5: LL:1744 never clears locSelectedLandLeaseCost.
    const selected = { subaccountId: "sub-1", periodId: "per-1", costId: "cost-1" };
    const row = { periodId: "per-1", costId: "cost-1", subaccountId: "sub-1" };
    expect(toggleLeaseSelection(selected, row)).toEqual(NO_LEASE_SELECTION);
    expect(toggleLeaseSelectionCanvasParity(selected, row))
      .toEqual({ subaccountId: null, periodId: null, costId: "cost-1" });
    const other = { periodId: "per-2", costId: "cost-2", subaccountId: "sub-2" };
    expect(toggleLeaseSelection(selected, other))
      .toEqual({ subaccountId: "sub-2", periodId: "per-2", costId: "cost-2" });
  });
});

/* ══════════════════════════════════════════════════════════════════ start date ══ */

describe("Land Lease — the start date", () => {
  it("UT-LAND-040 a new contract starts at the project COD", () => {
    // canvas-only: LL:2342, first arm.
    expect(resolveStartDate({
      workingDate: "2027-04-01", selectedCost: null, selectedPeriod: null,
      parentPeriod: null, panelState: "New", resetStartDate: false,
    })).toBe("2027-04-01");
  });

  it("UT-LAND-041 editing a period falls back to that period's stored date", () => {
    expect(resolveStartDate({
      workingDate: null, selectedCost: cost(), selectedPeriod: period({ startDate: "2029-06-01" }),
      parentPeriod: null, panelState: "Edit", resetStartDate: false,
    })).toBe("2029-06-01");
    // A date the user has touched wins over the stored one.
    expect(resolveStartDate({
      workingDate: "2031-01-01", selectedCost: cost(),
      selectedPeriod: period({ startDate: "2029-06-01" }),
      parentPeriod: null, panelState: "Edit", resetStartDate: false,
    })).toBe("2031-01-01");
  });

  it("UT-LAND-042 a new PERIOD chains off the end of its parent", () => {
    // canvas-only: LL:2355 — DateAdd(parent.Start, parent.years*12 + parent.months, Months).
    expect(resolveStartDate({
      workingDate: null, selectedCost: cost(), selectedPeriod: null,
      parentPeriod: period({ startDate: "2027-04-01", durationYears: 5, durationMonths: 3 }),
      panelState: "New", resetStartDate: false,
    })).toBe("2032-07-01");
    expect(resolveStartDate({
      workingDate: null, selectedCost: cost(), selectedPeriod: null,
      parentPeriod: null, panelState: "New", resetStartDate: false,
    })).toBeNull();
  });

  it("UT-LAND-043 the refresh icon snaps back to COD and re-stamps the standard flag", () => {
    // canvas-only: LL:2495-2517.
    expect(resetStartDateVisible(period({ period: LAND_LEASE_PERIOD.period1 }), cost()))
      .toBe(true);
    expect(resetStartDateVisible(period({ period: LAND_LEASE_PERIOD.period2 }), cost()))
      .toBe(false);
    expect(resetStartDate({
      codDate: "2027-04-01", selectedPeriod: period({ period: LAND_LEASE_PERIOD.period1 }),
      selectedCost: cost(),
    })).toEqual({
      workingDate: "2027-04-01", resetStartDate: true, isStartDateStandardAssumption: true,
    });
    expect(resetStartDate({
      codDate: "2027-04-01", selectedPeriod: period({ period: LAND_LEASE_PERIOD.period2 }),
      selectedCost: cost(),
    }).isStartDateStandardAssumption).toBe(false);
    expect(resetStartDate({ codDate: "2027-04-01", selectedPeriod: null, selectedCost: null })
      .isStartDateStandardAssumption).toBe(true);
  });

  it("UT-LAND-044 the blank-start-date error can never be seen in the canvas", () => {
    // canvas-only. SOURCE DEFECT LL-D6: Text and Visible are inverted (LL:2318-2324).
    expect(validateStartDate(null)).toBe(LEASE_MSG.startDateBlank);
    expect(validateStartDate("2027-04-01")).toBeNull();
    // The canvas shows the label only when a date IS picked, at which point it renders blank.
    expect(startDateErrorVisibleCanvasParity(null)).toBe(false);
    expect(startDateErrorVisibleCanvasParity("2027-04-01")).toBe(true);
  });
});

/* ══════════════════════════════════════════════ dropdowns, currency, aggregation ══ */

describe("Land Lease — panel dropdowns", () => {
  it("UT-LAND-045 duration offers 0..35 years and 0..11 months", () => {
    // canvas-only: Sequence(36) and Sequence(12), LL:2631 / LL:2577.
    expect(DURATION_YEAR_OPTIONS).toHaveLength(36);
    expect(DURATION_YEAR_OPTIONS[0]).toBe(0);
    expect(DURATION_YEAR_OPTIONS[35]).toBe(35);
    expect(DURATION_MONTH_OPTIONS).toHaveLength(12);
    expect(DURATION_MONTH_OPTIONS[11]).toBe(11);
    expect(durationYearLabel(1)).toBe("1 year");
    expect(durationYearLabel(0)).toBe("0 years");
    expect(durationMonthLabel(1)).toBe("1 month");
  });

  it("UT-LAND-046 the pre-selected year label is one step out of phase", () => {
    // canvas-only. SOURCE DEFECT LL-D2: DefaultSelectedItems compares `Value`, Items compares
    // `Value - 1` (LL:2619 vs LL:2635).
    expect(durationYearLabelCanvasParityDefault(0)).toBe("0 year");
    expect(durationYearLabelCanvasParityDefault(1)).toBe("1 years");
    expect(durationYearLabel(0)).toBe("0 years");
  });

  it("UT-LAND-047 months default to 0 only once a year has been chosen", () => {
    // canvas-only: LL:2548 — the third arm is Blank(), which is what makes the save gate's
    // `IsBlank(DurationMonths.Selected.Value)` reachable.
    expect(defaultDurationMonths(3, false)).toBe(3);
    expect(defaultDurationMonths(null, true)).toBe(0);
    expect(defaultDurationMonths(null, false)).toBeNull();
    expect(defaultDurationYears(5)).toBe(5);
    expect(defaultDurationYears(null)).toBeNull();
  });

  it("UT-LAND-048 aggregation defaults to SUM and currency is never editable", () => {
    // canvas-only: LL:3575 hard-codes 952850000 (verified = SUM); LL:2779 is Disabled.
    expect(defaultAggregation(null)).toBe(LAND_LEASE_AGGREGATION.sum);
    expect(defaultAggregation(LAND_LEASE_AGGREGATION.max)).toBe(LAND_LEASE_AGGREGATION.max);
    expect(defaultCurrencyCode("Poland")).toBe("PLN");
    expect(defaultCurrencyCode("Germany")).toBe("EUR");
    expect(defaultCurrencyCode(null)).toBe("EUR");
    expect(currencyEditable()).toBe(false);
  });

  it("UT-LAND-049 distribution frequency has no default at all", () => {
    // canvas-only: LL:3679 is a bare LookUp, so a period without one opens empty and blocks
    // the save.
    expect(defaultDistributionFrequency(3)).toBe(3);
    expect(defaultDistributionFrequency(null)).toBeNull();
  });
});

/* ═════════════════════════════════════════════════════ rules 9-12 · allocation ══ */

describe("Land Lease — WTG allocation", () => {
  it("UT-LAND-050 the allocation diff creates, updates and deletes", () => {
    // Ported from skeleton UT-LEASE-016, extended: the canvas Patch also REWRITES the rows it
    // keeps, which the skeleton's two-bucket diff does not express (LL:5895).
    const existing = [
      alloc({ id: "a1", generatorInProjectId: "G1" }),
      alloc({ id: "a2", generatorInProjectId: "G2" }),
    ];
    const diff = diffAllocation(existing, ["G2", "G3"]);
    expect(diff.toCreate).toEqual(["G3"]);
    expect(diff.toUpdate).toEqual([{ id: "a2", generatorInProjectId: "G2" }]);
    expect(diff.toDelete).toEqual(["a1"]);
  });

  it("UT-LAND-051 an empty selection deletes every allocation", () => {
    // Ported from skeleton "an empty selection deletes every allocation".
    expect(diffAllocation([alloc({ id: "a1" })], []))
      .toEqual({ toCreate: [], toUpdate: [], toDelete: ["a1"] });
    expect(diffAllocation([], ["G1"]))
      .toEqual({ toCreate: ["G1"], toUpdate: [], toDelete: [] });
    // A row with no generator can match nothing, so it is cleaned up.
    expect(diffAllocation([alloc({ id: "a9", generatorInProjectId: null })], ["G1"]).toDelete)
      .toEqual(["a9"]);
  });

  it("UT-LAND-052 allocate-to-all is a count comparison, guarded against an empty project", () => {
    // Ported from skeleton UT-LEASE-017 / UT-LEASE-018, plus the canvas' raw comparison.
    const all = ["G1", "G2", "G3", "G4", "G5"];
    expect(allWtgSelected(all, all)).toBe(true);
    expect(allWtgSelected(["G1", "G2"], all)).toBe(false);
    expect(allWtgSelected([], [])).toBe(false);
    // LL:3932 compares bare counts, so 0 = 0 sets the flag on a project with no generators.
    expect(allWtgSelectedCanvasParity([], [])).toBe(true);
  });

  it("UT-LAND-053 the allocation block is hidden for non-PV, non-Wind technology", () => {
    // Ported from skeleton UT-LEASE-020, with the comparison corrected. SKELETON DIVERGENCE:
    // the skeleton compares lower-cased STRINGS; Technology is an option set (PA:3863).
    expect(allocationVisible(TECHNOLOGY.wind)).toBe(true);
    expect(allocationVisible(TECHNOLOGY.pv)).toBe(true);
    expect(allocationVisible(TECHNOLOGY.bess)).toBe(false);
    expect(allocationVisible(TECHNOLOGY.hybrid)).toBe(false);
    expect(allocationVisible(null)).toBe(false);
  });

  it("UT-LAND-054 the newer export keeps the picker visible while allocate-to-all is on", () => {
    // canvas-only: PA:3904 REPLACED LL:3891's `Not(allWtgToggle.Checked)` with the technology
    // gate. Both readings pinned.
    expect(allocationPickerVisibleCanvasParityTxt(true)).toBe(false);
    expect(allocationPickerVisibleCanvasParityTxt(false)).toBe(true);
  });

  it("UT-LAND-055 the picker pre-selects everything once allocate-to-all is switched on", () => {
    // canvas-only: LL:3905.
    const gens = [gen("G1", "WTG_1", 1), gen("G2", "WTG_2", 2)];
    expect(defaultAllocatedGenerators(gens, [], true).map((g) => g.id)).toEqual(["G1", "G2"]);
    expect(defaultAllocatedGenerators(gens, [alloc({ generatorInProjectId: "G2" })], false)
      .map((g) => g.id)).toEqual(["G2"]);
    expect(defaultAllocatedGenerators(gens, [], false)).toEqual([]);
  });

  it("UT-LAND-056 the picker labels WTGs 'name - status' and sorts PV rows FIRST", () => {
    // Ported from skeleton "the picker labels generators `name - status`", with the ordering
    // corrected. SKELETON DIVERGENCE: the skeleton puts PV last; the canvas gives PV rows no
    // Order column at all, and Blank() sorts as 0 (LL:6, LL:3928).
    const opts = generatorOptions(
      [
        { id: "g10", name: "WTG_10", status: "Active" },
        { id: "g2", name: "WTG_2", status: "Inactive" },
      ],
      [{ id: "pv1", name: "PV_1", label: "PV module 500W" }],
    );
    expect(opts.map((o) => o.id)).toEqual(["pv1", "g2", "g10"]);
    expect(opts.find((o) => o.id === "g2")!.label).toBe("WTG_2 - Inactive");
    expect(opts.find((o) => o.id === "pv1")!.kind).toBe("pv");
    expect(generatorOptions([], [])).toEqual([]);
  });

  it("UT-LAND-057 the allocation Name leads with the land owner, blank or not", () => {
    // Ported from skeleton's `allocationName` assertion, plus the live-data shape.
    expect(allocationName("Owner B", "Owner B", "WTG_2")).toBe("Owner B-Owner B-WTG_2");
    // VERIFIED in Dataverse: standard imports never set a land owner, so rows read like this.
    expect(allocationName(null, "Standard LL Locations", "WTG 111_1"))
      .toBe("-Standard LL Locations-WTG 111_1");
  });
});

/* ══════════════════════════════════════════ rules 4-6 · the three one-time payments ══ */

describe("Land Lease — one-time payments", () => {
  it("UT-LAND-058 turning the toggle off blanks all six fields", () => {
    // Ported from skeleton UT-LEASE-007.
    const values = {
      dueDate: "04/2027", amount: "1000", dueDate2: "04/2028", amount2: "2000",
      dueDate3: "04/2029", amount3: "3000",
    };
    expect(oneTimePaymentPayload(false, values)).toEqual({
      dueDate: null, amount: null, dueDate2: null, amount2: null, dueDate3: null, amount3: null,
    });
    expect(oneTimePaymentPayload(true, values)).toEqual({
      dueDate: "04/2027", amount: 1000, dueDate2: "04/2028",
      amount2: 2000, dueDate3: "04/2029", amount3: 3000,
    });
  });

  it("UT-LAND-059 an empty amount box writes blank, not zero", () => {
    // canvas-only: `Value("")` is Blank() in Power Fx (LL:5895).
    const payload = oneTimePaymentPayload(true, {
      dueDate: "04/2027", amount: "1000", dueDate2: "", amount2: "",
      dueDate3: "", amount3: "",
    });
    expect(payload.amount2).toBeNull();
    expect(payload.dueDate2).toBeNull();
  });

  it("UT-LAND-060 the toggle is on only when BOTH halves of payment 1 are stored", () => {
    // canvas-only: LL:4734 — the same test the OTP column uses.
    expect(oneTimePaymentChecked(cost({
      amountOneTimePayment: 1000, dueDateOneTimePayment: "04/2027",
    }))).toBe(true);
    expect(oneTimePaymentChecked(cost({ amountOneTimePayment: 1000 }))).toBe(false);
    expect(oneTimePaymentChecked(null)).toBe(false);
  });

  it("UT-LAND-061 the 2nd and 3rd blocks appear only when BOTH their fields hold data", () => {
    // Ported from skeleton UT-LEASE-008.
    expect(showSecondPayment(cost({
      amountOneTimePayment2: 500, dueDateOneTimePayment2: null,
    }))).toBe(false);
    expect(showSecondPayment(cost({
      amountOneTimePayment2: 500, dueDateOneTimePayment2: "04/2028",
    }))).toBe(true);
    expect(showThirdPayment(cost({
      amountOneTimePayment3: null, dueDateOneTimePayment3: "04/2029",
    }))).toBe(false);
    expect(showThirdPayment(cost({
      amountOneTimePayment3: 500, dueDateOneTimePayment3: "04/2029",
    }))).toBe(true);
    expect(showSecondPayment(null)).toBe(false);
    expect(showThirdPayment(null)).toBe(false);
  });

  it("UT-LAND-062 the add-payment button hides behind the next block and needs the previous one", () => {
    // canvas-only: LL:5069 / LL:5425.
    const base = {
      showSecondPayment: false, showThirdPayment: false,
      previousAmount: "1000", previousDueDate: "04/2027",
      previousAmountError: false, previousDueDateError: false,
      selectedPeriod: period({ period: LAND_LEASE_PERIOD.period1 }), hasParentPeriod: false,
    };
    const b2 = addPaymentButton(2, base);
    expect(b2).toEqual({
      visible: true, enabled: true, label: LEASE_MSG.addOneTimePayment, icon: "Add",
    });
    // Once the block exists the button becomes its delete.
    expect(addPaymentButton(2, { ...base, showSecondPayment: true }).label)
      .toBe(LEASE_MSG.deleteOneTimePayment);
    // The second button disappears once the third block exists.
    expect(addPaymentButton(2, { ...base, showThirdPayment: true }).visible).toBe(false);
    // The third button only appears once the second block does.
    expect(addPaymentButton(3, base).visible).toBe(false);
    expect(addPaymentButton(3, { ...base, showSecondPayment: true }).visible).toBe(true);
    // An incomplete or invalid previous payment disables it.
    expect(addPaymentButton(2, { ...base, previousAmount: "" }).enabled).toBe(false);
    expect(addPaymentButton(2, { ...base, previousDueDateError: true }).enabled).toBe(false);
    // So does editing a period 2+ reached from a parent.
    expect(addPaymentButton(2, {
      ...base, selectedPeriod: period({ period: LAND_LEASE_PERIOD.period2 }),
      hasParentPeriod: true,
    }).enabled).toBe(false);
  });

  it("UT-LAND-063 the Secured toggle reads the choice with an explicit false fallback", () => {
    // canvas-only: LL:3825's three-arm If.
    expect(securedChecked(cost({ secured: LAND_LEASE_SECURED.yes }))).toBe(true);
    expect(securedChecked(cost({ secured: LAND_LEASE_SECURED.no }))).toBe(false);
    expect(securedChecked(cost({ secured: null }))).toBe(false);
    expect(securedChecked(null)).toBe(false);
  });

  it("UT-LAND-064 every payment label is transcribed, currency and all", () => {
    expect(LEASE_LABELS.oneTimePaymentDate(1)).toBe("One-Time Payment 1 Date");
    expect(LEASE_LABELS.oneTimePaymentDate(3)).toBe("One-Time Payment 3 Date");
    expect(LEASE_LABELS.dueDatePlaceholder).toBe("MM/YYYY");
    expect(LEASE_LABELS.oneTimePayment).toBe("One-Time Payment");
  });
});

/* ═════════════════════════════════════════════════════════════════════ inflation ══ */

describe("Land Lease — inflation", () => {
  it("UT-LAND-065 everything inflation hangs off one toggle", () => {
    expect(inflationSectionVisible(true)).toBe(true);
    expect(inflationSectionVisible(false)).toBe(false);
    expect(inflationProfileLabel(true)).toBe(LEASE_LABELS.countryInflationProfile);
    expect(inflationProfileLabel(false)).toBe(LEASE_LABELS.customInflationProfile);
  });

  it("UT-LAND-066 the Area dropdown exists for Italy alone", () => {
    // canvas-only: LL:4391.
    const a = (over: Partial<Parameters<typeof areaInflationVisible>[0]>) => areaInflationVisible({
      inflationChecked: true, countryInflationChecked: true, countryName: "Italy", ...over,
    });
    expect(a({})).toBe(true);
    expect(a({ countryName: "Germany" })).toBe(false);
    expect(a({ countryInflationChecked: false })).toBe(false);
    expect(a({ inflationChecked: false })).toBe(false);
  });

  it("UT-LAND-067 the inflation start year defaults to COD + 1", () => {
    // Ported from skeleton UT-LEASE-030's first assertion; LL:4299 and LL:388 agree.
    expect(inflationStartYearFromCod("2027-04-01")).toBe(2028);
    expect(inflationStartYearFromCod(null)).toBeNull();
    expect(inflationStartYearDefault(2035, "2027-04-01")).toBe(2035);
    expect(inflationStartYearDefault(null, "2027-04-01")).toBe(2028);
    expect(inflationStartYearDefault(null, null)).toBeNull();
  });

  it("UT-LAND-068 the profile box shows the stored value, or the country's, floored at zero", () => {
    // canvas-only: LL:4616's four arms, both wrapped in Max(..., 0).
    expect(resolveInflationProfileValue({
      selectedCost: cost({ inflationProfile: 1.5 }), countryInflationChecked: false,
      countryName: "Germany", countryProfile: 2.1,
    })).toBe(1.5);
    expect(resolveInflationProfileValue({
      selectedCost: cost({ inflationProfile: 1.5 }), countryInflationChecked: true,
      countryName: "Germany", countryProfile: 2.1,
    })).toBe(2.1);
    // A missing Country Inflation Profile row shows 0.0, not blank.
    expect(resolveInflationProfileValue({
      selectedCost: cost(), countryInflationChecked: true,
      countryName: "Germany", countryProfile: null,
    })).toBe(0);
    expect(resolveInflationProfileValue({
      selectedCost: null, countryInflationChecked: false,
      countryName: "Germany", countryProfile: 2.1,
    })).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════ validation ══ */

describe("Land Lease — field validation", () => {
  it("UT-LAND-069 the three rate ceilings are 100 million, not a billion", () => {
    // SKELETON DIVERGENCE: the skeleton's LEASE_RANGES puts all five at 1,000,000,000.
    // LL:3206 / LL:3338 / LL:3469 cap the rates at 100,000,000.
    expect(LEASE_NUMERIC_SPEC.eurPerMwh.max).toBe(100_000_000);
    expect(LEASE_NUMERIC_SPEC.eurPerMw.max).toBe(100_000_000);
    expect(LEASE_NUMERIC_SPEC.eurPerWtg.max).toBe(100_000_000);
    expect(LEASE_NUMERIC_SPEC.fixedCosts.max).toBe(1_000_000_000);
    expect(LEASE_NUMERIC_SPEC.amount.max).toBe(1_000_000_000);
    expect(LEASE_NUMERIC_SPEC.percentOfRevenues.max).toBe(10_000);
    expect(validateLeaseNumber("eurPerMw", "100000001"))
      .toBe("Please select a value between 0 and 100,000,000.0.");
    expect(validateLeaseNumber("eurPerMw", "100000000")).toBeNull();
  });

  it("UT-LAND-070 a decimal failure and a range failure give different wording", () => {
    // Ported from skeleton UT-LEASE-033.
    expect(validateLeaseNumber("eurPerMwh", "1.234")).toBe(LEASE_MSG.twoDecimal);
    expect(validateLeaseNumber("eurPerMwh", "1.23")).toBeNull();
    expect(validateLeaseNumber("fixedCosts", "1000000001"))
      .toBe("Value must be between 0 and 1,000,000,000.0.");
    // A blank box is valid everywhere; "required" is the Save gate's question.
    expect(validateLeaseNumber("fixedCosts", "")).toBeNull();
    expect(validateLeaseNumber("fixedCosts", null)).toBeNull();
  });

  it("UT-LAND-071 % of Revenues and the payment amounts word it their own way", () => {
    // canvas-only. SOURCE DEFECT LL-D10 / LL-D11: three different wordings for one check.
    expect(validateLeaseNumber("percentOfRevenues", "1.234"))
      .toBe(LEASE_MSG.percentTwoDecimal);
    expect(validateLeaseNumber("percentOfRevenues", "10001"))
      .toBe("Please select a value between 0 and 10,000.0.");
    expect(validateLeaseNumber("amount", "1.234")).toBe(LEASE_MSG.amountNotANumber);
    expect(LEASE_MSG.percentTwoDecimal).not.toBe(LEASE_MSG.twoDecimal);
    expect(LEASE_MSG.amountNotANumber).not.toBe(LEASE_MSG.twoDecimal);
  });

  it("UT-LAND-072 the due date must be MM/YYYY", () => {
    // Ported from skeleton UT-LEASE-009.
    expect(validateDueDate("2027-04")).toBe(LEASE_MSG.dueDateFormat);
    expect(validateDueDate("13/2027")).toBe(LEASE_MSG.dueDateFormat);
    expect(validateDueDate("4/2027")).toBe(LEASE_MSG.dueDateFormat);
    expect(validateDueDate("04/2027")).toBeNull();
    expect(validateDueDate("12/2025")).toBeNull();
    expect(validateDueDate("")).toBeNull();
    expect(validateDueDate(null)).toBeNull();
  });

  it("UT-LAND-073 the inflation start year is four digits and nothing else", () => {
    // canvas-only: LL:4276 has no range check at all.
    expect(validateInflationStartYear("2028")).toBeNull();
    expect(validateInflationStartYear("0000")).toBeNull();
    expect(validateInflationStartYear("28")).toBe(LEASE_MSG.inflationStartYearFormat);
    expect(validateInflationStartYear("20281")).toBe(LEASE_MSG.inflationStartYearFormat);
    expect(validateInflationStartYear("")).toBeNull();
  });

  it("UT-LAND-074 the custom inflation profile is one decimal, 0 to 100, and muted by the country toggle", () => {
    // canvas-only: LL:4552 — three distinct messages.
    expect(validateInflationProfile("2.0", false)).toBeNull();
    expect(validateInflationProfile("2.05", false)).toBe(LEASE_MSG.inflationProfileOneDecimal);
    expect(validateInflationProfile("101.0", false)).toBe(LEASE_MSG.inflationProfileRange);
    expect(validateInflationProfile("abc", false)).toBe(LEASE_MSG.inflationProfileOneDecimal);
    // Suppressed entirely while the field is read-only.
    expect(validateInflationProfile("101.0", true)).toBeNull();
    expect(validateInflationProfile("", false)).toBeNull();
  });

  it("UT-LAND-075 'standard' is reserved ANYWHERE in the description", () => {
    // canvas-only: LL:2178 uses Find, not StartsWith.
    expect(validateLeaseDescription("Standard lease"))
      .toBe(LEASE_MSG.descriptionStandardReserved);
    expect(validateLeaseDescription("Non-standard lease"))
      .toBe(LEASE_MSG.descriptionStandardReserved);
    expect(validateLeaseDescription("STANDARD"))
      .toBe(LEASE_MSG.descriptionStandardReserved);
    expect(validateLeaseDescription("Owner B")).toBeNull();
    expect(validateLeaseDescription("")).toBeNull();
    expect(LEASE_DESCRIPTION_MAX_LENGTH).toBe(55);
  });

  it("UT-LAND-076 hidden payment boxes raise no error", () => {
    // canvas-only: the error labels live inside containers gated on the toggle (LL:4780).
    const bad = {
      dueDate: "04/2027", amount: "1000",
      dueDate2: "nonsense", amount2: "1.234", dueDate3: "", amount3: "",
    };
    expect(leaseFieldErrors(form({
      oneTimePaymentsOn: true, showSecondPayment: false, payments: bad,
    }))).toEqual({});
    const shown = leaseFieldErrors(form({
      oneTimePaymentsOn: true, showSecondPayment: true, payments: bad,
    }));
    expect(shown.dueDate2).toBe(LEASE_MSG.dueDateFormat);
    expect(shown.amount2).toBe(LEASE_MSG.amountNotANumber);
    // Toggle off: nothing at all.
    expect(leaseFieldErrors(form({ oneTimePaymentsOn: false, payments: bad }))).toEqual({});
  });
});

/* ═══════════════════════════════════════════════════════════ the hint and warning ══ */

describe("Land Lease — the two blocking banners", () => {
  it("UT-LAND-077 a payment counts as a commercial figure only on Period 1", () => {
    // canvas-only: LL:5963's two arms.
    const bare = form({ fixedCosts: "" });
    expect(hintVisible({ form: bare, selectedCost: null, selectedPeriod: null })).toBe(true);
    const paid = form({
      fixedCosts: "", payments: {
        dueDate: "04/2027", amount: "1000", dueDate2: "", amount2: "", dueDate3: "", amount3: "",
      },
    });
    expect(hintVisible({ form: paid, selectedCost: null, selectedPeriod: null })).toBe(false);
    // On period 2+ only the five rates count.
    expect(hintVisible({
      form: paid, selectedCost: cost(),
      selectedPeriod: period({ period: LAND_LEASE_PERIOD.period2 }),
    })).toBe(true);
    expect(hintVisible({
      form: form({ fixedCosts: "", eurPerWtg: "67500.00" }),
      selectedCost: cost(), selectedPeriod: period({ period: LAND_LEASE_PERIOD.period2 }),
    })).toBe(false);
    expect(LEASE_MSG.atLeastOneFigure).toBe("Please fill in at least one commercial figure");
  });

  it("UT-LAND-078 clearing the rates off a non-last period is refused", () => {
    // canvas-only: LL:5802.
    const contract = buildContracts([cost()], [
      period({ id: "p1", period: LAND_LEASE_PERIOD.period1, fixedCosts: 1000 }),
      period({ id: "p2", period: LAND_LEASE_PERIOD.period2, fixedCosts: 500 }),
    ])[0]!;
    const cleared = form({ fixedCosts: "" });
    expect(additionalPeriodsWarningVisible({
      form: cleared, selectedPeriod: contract.periods[0]!, contract,
    })).toBe(true);
    // The LAST period may be cleared.
    expect(additionalPeriodsWarningVisible({
      form: cleared, selectedPeriod: contract.periods[1]!, contract,
    })).toBe(false);
    // Typing any rate back into the form withdraws the refusal.
    expect(additionalPeriodsWarningVisible({
      form: form({ fixedCosts: "1.00" }), selectedPeriod: contract.periods[0]!, contract,
    })).toBe(false);
    // A period that never had rates is not affected either.
    expect(additionalPeriodsWarningVisible({
      form: cleared,
      selectedPeriod: period({ fixedCosts: null }),
      contract,
    })).toBe(false);
    expect(LEASE_MSG.additionalPeriodsWarningHtml).toContain("<b>Warning:</b>");
  });

  it("UT-LAND-079 the five-rate predicate reads both the form and a stored period", () => {
    expect(formHasAnyRate(form({ fixedCosts: "1000.00" }))).toBe(true);
    expect(formHasAnyRate(form({ fixedCosts: "" }))).toBe(false);
    expect(formHasAnyRate(form({ fixedCosts: "", eurPerMw: "1.00" }))).toBe(true);
    expect(periodHasAnyRate(period({ fixedCosts: 1000 }))).toBe(true);
    expect(periodHasAnyRate(period({
      fixedCosts: null, percentOfRevenues: null,
      eurPerMwh: null, eurPerMw: null, eurPerWtg: null,
    }))).toBe(false);
    expect(periodHasAnyRate(null)).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════ save gate ══ */

describe("Land Lease — the save gate", () => {
  it("UT-LAND-080 the description is required", () => {
    // Ported from skeleton UT-LEASE-034. The canvas does NOT trim (LL:5880), so a
    // whitespace-only description passes clause A — and is then caught by nothing.
    expect(canSaveLandLease(saveCtx({ form: form({ description: "" }) }))).toBe(false);
    expect(canSaveLandLease(saveCtx())).toBe(true);
  });

  it("UT-LAND-081 any visible numeric error blocks the save", () => {
    // Ported from skeleton UT-LEASE-033's second half.
    expect(canSaveLandLease(saveCtx({ form: form({ eurPerMwh: "1.234" }) }))).toBe(false);
    expect(canSaveLandLease(saveCtx({ form: form({ eurPerMwh: "1.23" }) }))).toBe(true);
    expect(canSaveLandLease(saveCtx({ form: form({ description: "Standard lease" }) })))
      .toBe(false);
  });

  it("UT-LAND-082 a bad payment date blocks the save only while the toggle is on", () => {
    // Ported from skeleton "a bad one-time payment date blocks the save only while the toggle
    // is on".
    const bad = {
      dueDate: "2027-04", amount: "100", dueDate2: "", amount2: "", dueDate3: "", amount3: "",
    };
    expect(canSaveLandLease(saveCtx({
      form: form({ oneTimePaymentsOn: true, payments: bad }),
    }))).toBe(false);
    expect(canSaveLandLease(saveCtx({
      form: form({ oneTimePaymentsOn: false, payments: bad }),
    }))).toBe(true);
  });

  it("UT-LAND-083 the period block is required when there is no one-time payment", () => {
    // canvas-only: clause F's false arm (LL:5880).
    expect(canSaveLandLease(saveCtx({ form: form({ durationMonths: null }) }))).toBe(false);
    expect(canSaveLandLease(saveCtx({ form: form({ durationYears: null }) }))).toBe(false);
    // Zero years AND zero months is a zero-length period.
    expect(canSaveLandLease(saveCtx({
      form: form({ durationYears: 0, durationMonths: 0 }),
    }))).toBe(false);
    expect(canSaveLandLease(saveCtx({
      form: form({ durationYears: 0, durationMonths: 1 }),
    }))).toBe(true);
    expect(canSaveLandLease(saveCtx({ form: form({ distributionFrequency: null }) })))
      .toBe(false);
  });

  it("UT-LAND-084 aggregation and an allocation are required for PV and Wind only", () => {
    // canvas-only: PA:5947 wraps both in the technology gate.
    const noAlloc = form({ aggregation: null, allocatedGeneratorIds: [] });
    expect(canSaveLandLease(saveCtx({ form: noAlloc, technology: TECHNOLOGY.wind })))
      .toBe(false);
    expect(canSaveLandLease(saveCtx({ form: noAlloc, technology: TECHNOLOGY.bess })))
      .toBe(true);
    // Allocate-to-all satisfies the picker requirement without an explicit selection.
    expect(canSaveLandLease(saveCtx({
      form: form({ allocatedGeneratorIds: [], allWtgAllocated: true }),
      technology: TECHNOLOGY.wind,
    }))).toBe(true);
  });

  it("UT-LAND-085 a payment-only contract can be saved with no economics at all", () => {
    // canvas-only. SOURCE DEFECT LL-D7: clause F's TRUE arm requires nothing but the payment
    // (LL:5880), so this writes a Land Lease Periods row blank in every economic column.
    const paymentOnly = form({
      fixedCosts: "", durationYears: null, durationMonths: null,
      aggregation: null, distributionFrequency: null, allocatedGeneratorIds: [],
      oneTimePaymentsOn: true,
      payments: {
        dueDate: "04/2027", amount: "1000", dueDate2: "", amount2: "", dueDate3: "", amount3: "",
      },
    });
    expect(canSaveLandLease(saveCtx({
      form: paymentOnly, selectedCost: null, selectedPeriod: null, panelState: "New",
    }))).toBe(true);
    // Clause I is the canvas' own partial patch: typing ANY rate re-imposes the period block.
    expect(canSaveLandLease(saveCtx({
      form: { ...paymentOnly, fixedCosts: "1000.00" },
      selectedCost: null, selectedPeriod: null, panelState: "New",
    }))).toBe(false);
  });

  it("UT-LAND-086 a new period on an existing contract always needs the period block", () => {
    // canvas-only: clause I's inner "Changed for Having mandatory for New Period" arm.
    const thin = form({
      durationYears: null, durationMonths: null,
      aggregation: null, distributionFrequency: null,
      oneTimePaymentsOn: true,
      payments: {
        dueDate: "04/2027", amount: "1000", dueDate2: "", amount2: "", dueDate3: "", amount3: "",
      },
    });
    expect(canSaveLandLease(saveCtx({
      form: thin, selectedCost: cost(), selectedPeriod: null, panelState: "New",
    }))).toBe(false);
  });

  it("UT-LAND-087 an incomplete 2nd or 3rd payment block blocks the save", () => {
    // canvas-only: clauses G and H.
    const base = {
      dueDate: "04/2027", amount: "1000", dueDate2: "04/2028", amount2: "2000",
      dueDate3: "", amount3: "",
    };
    expect(canSaveLandLease(saveCtx({
      form: form({ oneTimePaymentsOn: true, showSecondPayment: true, payments: base }),
    }))).toBe(true);
    expect(canSaveLandLease(saveCtx({
      form: form({
        oneTimePaymentsOn: true, showSecondPayment: true,
        payments: { ...base, amount2: "" },
      }),
    }))).toBe(false);
    expect(canSaveLandLease(saveCtx({
      form: form({
        oneTimePaymentsOn: true, showSecondPayment: true, showThirdPayment: true,
        payments: base,
      }),
    }))).toBe(false);
  });

  it("UT-LAND-088 inflation adds three conditional requirements", () => {
    // canvas-only: clauses C, D and E.
    const infl = (over: Partial<LandLeaseForm> = {}) => form({
      inflationChecked: true, inflationStartYear: "2028", inflationProfile: "2.0", ...over,
    });
    expect(canSaveLandLease(saveCtx({ form: infl() }))).toBe(true);
    expect(canSaveLandLease(saveCtx({ form: infl({ inflationStartYear: "" }) }))).toBe(false);
    expect(canSaveLandLease(saveCtx({ form: infl({ inflationProfile: "" }) }))).toBe(false);
    // With the country toggle on the custom percentage is not required.
    expect(canSaveLandLease(saveCtx({
      form: infl({ countryInflationChecked: true, inflationProfile: "" }),
    }))).toBe(true);
    // Italy additionally needs an Area.
    expect(canSaveLandLease(saveCtx({
      form: infl({ countryInflationChecked: true, inflationProfile: "" }),
      countryName: "Italy",
    }))).toBe(false);
    expect(canSaveLandLease(saveCtx({
      form: infl({
        countryInflationChecked: true, inflationProfile: "", inflationCountryArea: "Nord",
      }),
      countryName: "Italy",
    }))).toBe(true);
  });

  it("UT-LAND-089 the additional-periods warning is itself a save block", () => {
    // canvas-only: clause J.
    const contract = buildContracts([cost()], [
      period({ id: "p1", period: LAND_LEASE_PERIOD.period1, fixedCosts: 1000 }),
      period({ id: "p2", period: LAND_LEASE_PERIOD.period2, fixedCosts: 500 }),
    ])[0]!;
    expect(canSaveLandLease(saveCtx({
      form: form({ fixedCosts: "", eurPerMw: "1.00" }),
      selectedPeriod: contract.periods[0]!, contract,
    }))).toBe(true);
    expect(canSaveLandLease(saveCtx({
      form: form({ fixedCosts: "" }),
      selectedPeriod: contract.periods[0]!, contract,
    }))).toBe(false);
  });

  it("UT-LAND-090 the save-failure wording is the canvas Notify text", () => {
    // Ported from skeleton UT-LEASE-038, with the string replaced. SKELETON DIVERGENCE: the
    // skeleton's `saveFailed` was invented; LL:5895 interpolates FirstError.
    expect(leaseSaveError.period("Patch", "boom"))
      .toBe("Error: Land Lease Period could not be saved correctly. Internal error: originated on Patch. Message: boom");
    expect(leaseSaveError.contract("Patch", "boom", " 400"))
      .toBe("Error: Land Lease Contract could not be saved correctly. Internal error: originated on Patch. Message: boom 400");
  });

  it("UT-LAND-091 the selection clears after a successful save", () => {
    // Ported from skeleton UT-LEASE-040.
    expect(clearsSelectionAfterSave).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════════ write plans ══ */

describe("Land Lease — the save write plan", () => {
  const planArgs = {
    form: form(),
    ctx: ctx(),
    subaccountId: "sub-1",
    subaccountName: "Leaseholders",
    selectedCost: cost(),
    selectedPeriod: period(),
    parentPeriod: null,
    existingAllocations: [alloc({ id: "a1", generatorInProjectId: "G1" })],
    generators: [gen("G1", "WTG_1", 1), gen("G2", "WTG_2", 2)],
    panelState: "Edit" as const,
  };

  it("UT-LAND-092 the header payload carries every header field and binds the project", () => {
    const p = buildCostPayload({
      form: form({ securedChecked: true }),
      ctx: ctx(), subaccountId: "sub-1", subaccountName: "Leaseholders",
    });
    expect(p[LEASE_COST_COL.name]).toBe("Windpark A-Leaseholders-Owner B");
    expect(p[LEASE_COST_COL.description]).toBe("Owner B");
    expect(p[LEASE_COST_COL.secured]).toBe(LAND_LEASE_SECURED.yes);
    expect(p["vsb_Project@odata.bind"]).toBe("/vsb_projects(proj-1)");
    expect(p["vsb_Subaccount@odata.bind"]).toBe("/vsb_landleasesubaccounts(sub-1)");
    expect(p["vsb_Currency@odata.bind"]).toBe("/transactioncurrencies(cur-eur)");
    expect(p["owningbusinessunit@odata.bind"]).toBe("/businessunits(bu-1)");
    // canvas-only: 'Land Owner' is commented out at the patch site and 'Is Standard Contract?'
    // is never written here — only the standard import sets it (LL:5895).
    expect(p).not.toHaveProperty(LEASE_COST_COL.landOwner);
    expect(p).not.toHaveProperty(LEASE_COST_COL.isStandardContract);
  });

  it("UT-LAND-093 the period payload always writes all five rates, so a blank box clears", () => {
    // canvas-only: the period Patch is unconditional and exhaustive (LL:5895).
    const p = buildPeriodPayload({
      form: form({ fixedCosts: "", eurPerWtg: "67500.00" }),
      ctx: ctx(), costId: "cost-1", panelState: "Edit",
      parentPeriod: null, selectedPeriod: period({ period: LAND_LEASE_PERIOD.period2 }),
    });
    expect(p[LEASE_PERIOD_COL.fixedCosts]).toBeNull();
    expect(p[LEASE_PERIOD_COL.eurPerWtg]).toBe(67500);
    expect(p[LEASE_PERIOD_COL.period]).toBe(LAND_LEASE_PERIOD.period2);
    expect(p[LEASE_PERIOD_COL.name]).toBe("Owner B");
    expect(p["vsb_ProjectCost@odata.bind"]).toBe("/vsb_landleaseprojectcosts(cost-1)");
    expect(p["owningbusinessunit@odata.bind"]).toBe("/businessunits(bu-1)");
  });

  it("UT-LAND-094 a new period takes the NEXT period value, and Period 9 refuses to wrap", () => {
    // canvas-only. SOURCE DEFECT LL-D1 in its write-plan form.
    const p = (parent: number, parity?: boolean) => buildPeriodPayload({
      form: form(), ctx: ctx(), costId: "cost-1", panelState: "New",
      parentPeriod: period({ period: parent }), selectedPeriod: null,
      canvasParityPeriodWrap: parity,
    })[LEASE_PERIOD_COL.period];
    expect(p(LAND_LEASE_PERIOD.period1)).toBe(LAND_LEASE_PERIOD.period2);
    expect(p(LAND_LEASE_PERIOD.period8)).toBe(LAND_LEASE_PERIOD.period9);
    expect(p(LAND_LEASE_PERIOD.period9)).toBeNull();
    expect(p(LAND_LEASE_PERIOD.period9, true)).toBe(LAND_LEASE_PERIOD.period1);
  });

  it("UT-LAND-095 editing Period 1 writes the header, the allocation diff and the period", () => {
    const plan = planLeaseSave(planArgs);
    expect(plan.writesHeader).toBe(true);
    expect(plan.createsPeriod).toBe(false);
    expect(plan.writes.map((w) => `${w.op}:${w.entitySet}`)).toEqual([
      "update:vsb_landleaseprojectcosts",
      "update:vsb_landleaseallocationwtgs",
      "update:vsb_landleaseperiods",
    ]);
  });

  it("UT-LAND-096 editing Period 2 writes the period ALONE", () => {
    // canvas-only: the whole header + allocation block is inside the Period-1 branch.
    const plan = planLeaseSave({
      ...planArgs,
      selectedPeriod: period({ id: "per-2", period: LAND_LEASE_PERIOD.period2 }),
      form: form({ allocatedGeneratorIds: [], allWtgAllocated: false }),
    });
    expect(plan.writesHeader).toBe(false);
    expect(plan.writes).toHaveLength(1);
    expect(plan.writes[0]!.entitySet).toBe(LEASE_ENTITY_SET.period);
    // Nothing touches the allocation, even though the form now selects nothing.
    expect(plan.writes.some((w) => w.entitySet === LEASE_ENTITY_SET.allocation)).toBe(false);
  });

  it("UT-LAND-097 allocate-to-all selects every generator in the plan", () => {
    const plan = planLeaseSave({
      ...planArgs,
      form: form({ allWtgAllocated: true, allocatedGeneratorIds: [] }),
    });
    const creates = plan.writes.filter(
      (w) => w.op === "create" && w.entitySet === LEASE_ENTITY_SET.allocation,
    );
    expect(creates).toHaveLength(1);
    expect(payloadOf(creates[0])["vsb_GeneratorInProject@odata.bind"])
      .toBe("/vsb_generatorinprojects(G2)");
    expect(plan.writes.filter((w) => w.op === "delete")).toHaveLength(0);
  });

  it("UT-LAND-098 a brand-new contract defers its child binds to the created id", () => {
    // `dataClient.batch` is not a changeset (CONVENTIONS rule 3), so the children carry a
    // parentRef the caller resolves rather than an OData `$id` reference.
    const plan = planLeaseSave({
      ...planArgs,
      selectedCost: null, selectedPeriod: null, existingAllocations: [], panelState: "New",
    });
    const header = plan.writes[0]!;
    expect(header.op).toBe("create");
    expect(header.op === "create" && header.ref).toBe("cost");
    const child = plan.writes.find((w) => w.entitySet === LEASE_ENTITY_SET.period)!;
    expect(parentRefOf(child)).toBe("cost");
    expect(payloadOf(child)).not.toHaveProperty("vsb_ProjectCost@odata.bind");

    const bound = bindParent(plan.writes, { cost: "new-cost-9" });
    const boundChild = bound.find((w) => w.entitySet === LEASE_ENTITY_SET.period)!;
    expect(payloadOf(boundChild)["vsb_ProjectCost@odata.bind"])
      .toBe("/vsb_landleaseprojectcosts(new-cost-9)");
    expect(boundChild).not.toHaveProperty("parentRef");
    // An unresolved ref is left alone so the caller fails loudly instead of orphaning a row.
    expect(bindParent(plan.writes, {}).find((w) => w.entitySet === LEASE_ENTITY_SET.period))
      .toEqual(child);
  });
});

/* ═════════════════════════════════════════════════════════ rule 18 · cascade delete ══ */

describe("Land Lease — delete", () => {
  const contract = buildContracts([cost()], [
    period({ id: "p1", period: LAND_LEASE_PERIOD.period1 }),
    period({ id: "p2", period: LAND_LEASE_PERIOD.period2 }),
    period({ id: "p3", period: LAND_LEASE_PERIOD.period3 }),
  ])[0]!;
  const allocations = [
    alloc({ id: "a1" }), alloc({ id: "a2" }), alloc({ id: "a3" }), alloc({ id: "a4" }),
    alloc({ id: "other", projectCostId: "cost-9" }),
  ];

  it("UT-LAND-099 deleting Period 2 removes only that period", () => {
    // Ported from skeleton UT-LEASE-021.
    const plan = planLeaseDelete(contract, contract.periods[1]!, allocations);
    expect(plan.kind).toBe("period");
    expect(plan.periodIds).toEqual(["p2"]);
    expect(plan.allocationIds).toEqual([]);
    expect(plan.costIds).toEqual([]);
    expect(plan.writes).toEqual([
      { op: "delete", entitySet: LEASE_ENTITY_SET.period, id: "p2" },
    ]);
  });

  it("UT-LAND-100 deleting Period 1 cascades allocations, then periods, then the cost", () => {
    // Ported from skeleton UT-LEASE-022, with the ORDER pinned — LL:6076-6087 removes
    // children first so an interrupted run never orphans a row.
    const plan = planLeaseDelete(contract, contract.periods[0]!, allocations);
    expect(plan.kind).toBe("contract");
    expect(plan.allocationIds).toEqual(["a1", "a2", "a3", "a4"]);
    expect(plan.periodIds).toEqual(["p1", "p2", "p3"]);
    expect(plan.costIds).toEqual(["cost-1"]);
    expect(plan.writes).toHaveLength(8);
    expect(plan.writes.map((w) => w.entitySet)).toEqual([
      LEASE_ENTITY_SET.allocation, LEASE_ENTITY_SET.allocation,
      LEASE_ENTITY_SET.allocation, LEASE_ENTITY_SET.allocation,
      LEASE_ENTITY_SET.period, LEASE_ENTITY_SET.period, LEASE_ENTITY_SET.period,
      LEASE_ENTITY_SET.cost,
    ]);
    // Another contract's allocations are untouched.
    expect(plan.allocationIds).not.toContain("other");
  });

  it("UT-LAND-101 both dialog bodies are interpolated, and the period one has a double space", () => {
    // SKELETON DIVERGENCE: the skeleton's two bodies ("This deletes the contract and all
    // related Periods?" / "This deletes only the selected period.") appear nowhere in the
    // canvas. LL:6028 and LL:6062 are transcribed instead.
    const p2 = deleteDialog(period({ period: LAND_LEASE_PERIOD.period2, name: "Owner B - 2" }));
    expect(p2.title).toBe("Delete Period?");
    expect(p2.body)
      .toBe('Are you sure that you want to permanently delete Period 2 expense in the "Owner B - 2"  Land Lease?');
    expect(p2.body).toContain('"  Land Lease?');

    const p1 = deleteDialog(period({ period: LAND_LEASE_PERIOD.period1, name: "Owner B" }));
    expect(p1.title).toBe("Delete Land Lease?");
    // The contract dialog names the PERIOD, not the header's description.
    expect(p1.body)
      .toBe('Are you sure that you want to permanently delete Land Lease "Owner B" and all related Periods?');
    expect(p1.confirmLabel).toBe("Delete");
    expect(p1.cancelLabel).toBe("Cancel");
  });
});

/* ═══════════════════════════════════════════════════════════════════ command bar ══ */

describe("Land Lease — the command bar", () => {
  const chain = buildContracts([cost()], [
    period({ id: "p1", period: LAND_LEASE_PERIOD.period1, name: "Owner B", fixedCosts: 1000 }),
    period({ id: "p2", period: LAND_LEASE_PERIOD.period2, name: "Owner B - 2" }),
    period({ id: "p3", period: LAND_LEASE_PERIOD.period3, name: "Owner B - 3" }),
  ])[0]!;

  const gates = (over: Partial<LeaseCommandArgs> = {}) => leaseCommandGates({
    subaccountId: "sub-1",
    isSelectedCard: true,
    selectedPeriod: chain.periods[2]!,
    selectedCost: chain.cost,
    contract: chain,
    costsInSubaccount: [chain.cost],
    hasMatchingAssumption: true,
    permissions: perms,
    ...over,
  });

  it("UT-LAND-102 all five commands are present, captioned as the canvas captions them", () => {
    const cmds = leaseCommands({
      subaccountId: "sub-1", isSelectedCard: true, selectedPeriod: null, selectedCost: null,
      contract: null, costsInSubaccount: [], hasMatchingAssumption: false, permissions: perms,
    });
    expect(cmds.map((c) => c.label)).toEqual([
      "Add Contract Type", "Add Period", "Add Standard Contract", "Edit", "Delete",
    ]);
    expect(cmds.map((c) => c.icon)).toEqual(["Add", "Add", "Add", "Edit", "Delete"]);
  });

  it("UT-LAND-103 Add Period needs a rate on Period 1", () => {
    // Ported from skeleton UT-LEASE-014.
    const noRate = buildContracts([cost()], [period({
      id: "p1", period: LAND_LEASE_PERIOD.period1,
      fixedCosts: null, percentOfRevenues: null,
      eurPerMw: null, eurPerMwh: null, eurPerWtg: null,
    })])[0]!;
    expect(gates({ contract: noRate, selectedPeriod: noRate.periods[0]! }).newLandLeasePeriodKey)
      .toBe(false);
    expect(gates().newLandLeasePeriodKey).toBe(true);
  });

  it("UT-LAND-104 Add Period only works on the last period, by PERIOD number", () => {
    // Ported from skeleton UT-LEASE-015.
    expect(gates({ selectedPeriod: chain.periods[1]! }).newLandLeasePeriodKey).toBe(false);
    expect(gates({ selectedPeriod: chain.periods[2]! }).newLandLeasePeriodKey).toBe(true);
    expect(gates({ selectedPeriod: null }).newLandLeasePeriodKey).toBe(false);
  });

  it("UT-LAND-105 Add Period is capped at Period 9, and the canvas twin is not", () => {
    // Ported from skeleton UT-LEASE-011b. SOURCE DEFECT LL-D1 — the canvas has NO cap.
    const nine = buildContracts([cost()], [
      period({ id: "p1", period: LAND_LEASE_PERIOD.period1, fixedCosts: 1 }),
      period({ id: "p9", period: LAND_LEASE_PERIOD.period9 }),
    ])[0]!;
    expect(gates({ contract: nine, selectedPeriod: nine.periods[1]! }).newLandLeasePeriodKey)
      .toBe(false);
    expect(gates({
      contract: nine, selectedPeriod: nine.periods[1]!, canvasParityPeriodWrap: true,
    }).newLandLeasePeriodKey).toBe(true);
  });

  it("UT-LAND-106 Add Standard Contract needs an assumption and an EMPTY sub-account", () => {
    // Ported from skeleton UT-LEASE-024 and UT-LEASE-025.
    expect(gates({ hasMatchingAssumption: false, costsInSubaccount: [] })
      .AddLandLeaseStandardContractKey).toBe(false);
    expect(gates({ hasMatchingAssumption: true, costsInSubaccount: [] })
      .AddLandLeaseStandardContractKey).toBe(true);
    expect(gates({ costsInSubaccount: [cost()] }).AddLandLeaseStandardContractKey).toBe(false);
  });

  it("UT-LAND-107 Add Contract Type is scoped to THIS card's selection only", () => {
    // Ported from skeleton UT-LEASE-039, with the scoping corrected. SKELETON DIVERGENCE: the
    // skeleton uses one global `nothingSelected`; LL:224 is
    // `If(selectedSubaccount = ThisItem, IsBlank(selectedPeriod), true)`, so a selection on a
    // DIFFERENT card does not block it.
    expect(gates({ costsInSubaccount: [], selectedPeriod: null }).newLandLeaseContractKey)
      .toBe(true);
    expect(gates({ costsInSubaccount: [] }).newLandLeaseContractKey).toBe(false);
    expect(gates({ costsInSubaccount: [], isSelectedCard: false }).newLandLeaseContractKey)
      .toBe(true);
    // A standard contract in the sub-account blocks it outright.
    expect(gates({
      costsInSubaccount: [cost({ isStandardContract: true })], selectedPeriod: null,
    }).newLandLeaseContractKey).toBe(false);
  });

  it("UT-LAND-108 standard rows are locked for edit and extension", () => {
    // Ported from skeleton UT-LEASE-031.
    const std = buildContracts([cost({ isStandardContract: true })], [
      period({ id: "p1", period: LAND_LEASE_PERIOD.period1, name: "Standard LL", fixedCosts: 1 }),
      period({ id: "p2", period: LAND_LEASE_PERIOD.period2, name: "Standard LL - 2" }),
    ])[0]!;
    expect(isStandardLocked(std, null)).toBe(true);
    expect(isStandardLocked(null, period({ name: "Standard lease" }))).toBe(true);
    expect(isStandardLocked(null, period({ name: "Owner B" }))).toBe(false);
    const g = gates({
      contract: std, selectedCost: std.cost, selectedPeriod: std.periods[1]!,
    });
    expect(g.EditLandLeasePeriodKey).toBe(false);
    expect(g.newLandLeasePeriodKey).toBe(false);
  });

  it("UT-LAND-109 a standard chain can only be deleted from Period 1", () => {
    // Ported from skeleton UT-LEASE-032.
    const std = buildContracts([cost({ isStandardContract: true })], [
      period({ id: "p1", period: LAND_LEASE_PERIOD.period1, name: "Standard LL", fixedCosts: 1 }),
      period({ id: "p3", period: LAND_LEASE_PERIOD.period3, name: "Standard LL - 3" }),
    ])[0]!;
    expect(gates({ contract: std, selectedCost: std.cost, selectedPeriod: std.periods[1]! })
      .deleteLandLeasePeriodKey).toBe(false);
    expect(gates({ contract: std, selectedCost: std.cost, selectedPeriod: std.periods[0]! })
      .deleteLandLeasePeriodKey).toBe(true);
  });

  it("UT-LAND-110 a non-standard period deletes from Period 1 or the last row BY NAME", () => {
    // canvas-only. SOURCE DEFECT LL-D4 — LL:370 sorts by Name where LL:262 sorts by Period.
    const odd = buildContracts([cost()], [
      period({ id: "p1", name: "Zulu", period: LAND_LEASE_PERIOD.period1, fixedCosts: 1 }),
      period({ id: "p2", name: "Alpha", period: LAND_LEASE_PERIOD.period2 }),
      period({ id: "p3", name: "Mike", period: LAND_LEASE_PERIOD.period3 }),
    ])[0]!;
    // "Zulu" sorts last by name AND is Period 1 — deletable twice over.
    expect(gates({ contract: odd, selectedPeriod: odd.periods[0]! }).deleteLandLeasePeriodKey)
      .toBe(true);
    // The real last period, "Mike" at Period 3, is REFUSED because "Zulu" sorts after it.
    expect(gates({ contract: odd, selectedPeriod: odd.periods[2]! }).deleteLandLeasePeriodKey)
      .toBe(false);
    // On a normally-named chain the two notions agree.
    expect(gates({ selectedPeriod: chain.periods[2]! }).deleteLandLeasePeriodKey).toBe(true);
    expect(gates({ selectedPeriod: chain.periods[1]! }).deleteLandLeasePeriodKey).toBe(false);
  });

  it("UT-LAND-111 every command honours its own privilege", () => {
    // Ported from skeleton UT-LEASE-035.
    expect(gates({ permissions: { ...perms, canEditRecord: false } }).EditLandLeasePeriodKey)
      .toBe(false);
    expect(gates({ permissions: { ...perms, canDeleteRecord: false } }).deleteLandLeasePeriodKey)
      .toBe(false);
    expect(gates({ permissions: { ...perms, canCreatePeriod: false } }).newLandLeasePeriodKey)
      .toBe(false);
    expect(gates({
      permissions: { ...perms, canCreateCost: false }, costsInSubaccount: [],
      selectedPeriod: null,
    }).newLandLeaseContractKey).toBe(false);
  });

  it("UT-LAND-112 commands do not leak across cards", () => {
    // Ported from skeleton UT-LEASE-036.
    const g = gates({ isSelectedCard: false });
    expect(g.EditLandLeasePeriodKey).toBe(false);
    expect(g.deleteLandLeasePeriodKey).toBe(false);
    expect(g.newLandLeasePeriodKey).toBe(false);
  });
});

/* ═══════════════════════════════════════════════ rules 13-17 · standard assumptions ══ */

describe("Land Lease — the standard-assumption import", () => {
  it("UT-LAND-113 the assumption query is country, technology, Landlease and sub-account", () => {
    // canvas-only: LL:296-304.
    expect(leaseAssumptionQuery(ctx(), "sub-1")).toEqual({
      countryId: "country-de",
      technology: TECHNOLOGY.wind,
      typeOfContract: TYPE_OF_CONTRACT.landlease,
      subaccountId: "sub-1",
      orderBy: "description asc",
    });
  });

  it("UT-LAND-114 the period and aggregation enums map across the two tables", () => {
    // Ported from skeleton UT-LEASE-027.
    expect(mapAssumptionPeriod(OPEX_LAND_LEASE_PERIOD.period3)).toBe(LAND_LEASE_PERIOD.period3);
    expect(mapAggregation(LAND_LEASE_AGGREGATION.max)).toBe(LAND_LEASE_AGGREGATION.max);
    expect(mapAggregation(LAND_LEASE_AGGREGATION.min)).toBe(LAND_LEASE_AGGREGATION.min);
    // A value outside the three Switch arms writes Blank(), not itself.
    expect(mapAggregation(999)).toBeNull();
    expect(mapAggregation(null)).toBeNull();
    expect(mapSecured(true)).toBe(LAND_LEASE_SECURED.yes);
    expect(mapSecured(false)).toBe(LAND_LEASE_SECURED.no);
    expect(mapAllWtgAllocated(true)).toBe(true);
  });

  it("UT-LAND-115 Period 10 has nowhere to go and falls to Period 1", () => {
    // Ported from skeleton UT-LEASE-027's second half. The same defect shape as LL-D1.
    expect(mapAssumptionPeriod(OPEX_LAND_LEASE_PERIOD.period10))
      .toBe(LAND_LEASE_PERIOD.period1);
    expect(mapAssumptionPeriod(999)).toBe(LAND_LEASE_PERIOD.period1);
    // The strict twin refuses instead, so a caller can choose.
    expect(mapAssumptionPeriodStrict(OPEX_LAND_LEASE_PERIOD.period10)).toBeNull();
    expect(mapAssumptionPeriodStrict(OPEX_LAND_LEASE_PERIOD.period3))
      .toBe(LAND_LEASE_PERIOD.period3);
  });

  it("UT-LAND-116 money is normalised to two decimals through text", () => {
    // Ported from skeleton UT-LEASE-028.
    expect(roundTwoDecimals(1234.5678)).toBe(1234.57);
    expect(roundTwoDecimals(1234.5)).toBe(1234.5);
    expect(roundTwoDecimals(null)).toBeNull();
    expect(roundTwoDecimals(undefined)).toBeNull();
  });

  it("UT-LAND-117 every WTG is allocated when the assumption says so", () => {
    // Ported from skeleton UT-LEASE-029 and UT-LEASE-037.
    const gens = ["G1", "G2", "G3"].map((id, i) => gen(id, `WTG_${i + 1}`, i + 1));
    expect(planStandardAllocation(true, gens)).toHaveLength(3);
    expect(planStandardAllocation(false, gens)).toHaveLength(0);
    expect(planStandardAllocation(true, [])).toEqual([]);
  });

  it("UT-LAND-118 the import's inflation profile resolves country, custom or blank", () => {
    // Ported from skeleton UT-LEASE-030.
    expect(resolveStandardInflationProfile({
      useInflationProfile: true, useCountryInflationProfile: true, inflationProfile: 1.5,
    }, 2.1)).toBe(2.1);
    expect(resolveStandardInflationProfile({
      useInflationProfile: true, useCountryInflationProfile: false, inflationProfile: 1.5,
    }, 2.1)).toBe(1.5);
    expect(resolveStandardInflationProfile({
      useInflationProfile: false, useCountryInflationProfile: true, inflationProfile: 1.5,
    }, 2.1)).toBeNull();
    expect(LEASE_STANDARD_STAMP.isStandardContract).toBe(true);
    expect(LEASE_STANDARD_STAMP.isStartDateStandardAssumption).toBe(true);
  });

  it("UT-LAND-119 the load chains the period start dates from COD", () => {
    // Ported from skeleton UT-LEASE-026.
    const starts = standardPeriodStarts("2027-04-01", [
      assumption({ id: "a1", period: OPEX_LAND_LEASE_PERIOD.period1, durationYears: 5 }),
      assumption({ id: "a2", period: OPEX_LAND_LEASE_PERIOD.period2, durationYears: 5 }),
      assumption({ id: "a3", period: OPEX_LAND_LEASE_PERIOD.period3, durationYears: 10 }),
    ]);
    expect(starts.map((s) => s.startDate))
      .toEqual(["2027-04-01", "2032-04-01", "2037-04-01"]);
    // Months add on top of years.
    expect(standardPeriodStarts("2027-04-01", [
      assumption({ id: "a1", period: OPEX_LAND_LEASE_PERIOD.period1, durationYears: 1, durationMonths: 3 }),
      assumption({ id: "a2", period: OPEX_LAND_LEASE_PERIOD.period2 }),
    ]).map((s) => s.startDate)).toEqual(["2027-04-01", "2028-07-01"]);
  });

  it("UT-LAND-120 the chain follows DESCRIPTION order, not period order", () => {
    // canvas-only. SOURCE DEFECT LL-D8 / SKELETON DIVERGENCE: the skeleton sorts by period
    // first and quietly repairs this; LL:388 iterates `Sort(..., Description, Ascending)`.
    const outOfOrder = [
      assumption({ id: "a2", period: OPEX_LAND_LEASE_PERIOD.period2, durationYears: 5 }),
      assumption({ id: "a1", period: OPEX_LAND_LEASE_PERIOD.period1, durationYears: 5 }),
    ];
    const starts = standardPeriodStarts("2027-04-01", outOfOrder);
    // Period 2 comes first, finds an EMPTY accumulator, and gets no start date at all.
    expect(starts[0]).toEqual({ id: "a2", period: OPEX_LAND_LEASE_PERIOD.period2, startDate: null });
    // Period 1 then RESETS the accumulator, so the chain is broken.
    expect(starts[1]!.startDate).toBe("2027-04-01");
    // Sorting by period before the call is how a caller opts out of the defect.
    const repaired = standardPeriodStarts(
      "2027-04-01", [...outOfOrder].sort((a, b) => a.period - b.period),
    );
    expect(repaired.map((s) => s.startDate)).toEqual(["2027-04-01", "2032-04-01"]);
  });

  it("UT-LAND-121 the import refuses when a standard contract already exists", () => {
    // canvas-only: `If(CountRows(recFilteredStandardContractsForProject) = 0, …)` (LL:388).
    const plan = planStandardImport({
      ctx: ctx(), subaccountId: "sub-1", subaccountName: "Leaseholders",
      assumptions: [assumption()],
      existingCostsInSubaccount: [cost({ isStandardContract: true })],
      generators: [], countryInflationProfile: null,
    });
    expect(plan.refused).toBe(true);
    expect(plan.writes).toEqual([]);
  });

  it("UT-LAND-122 the import creates one header per Period-1 assumption and one period per row", () => {
    const plan = planStandardImport({
      ctx: ctx(), subaccountId: "sub-1", subaccountName: "Leaseholders",
      assumptions: [
        assumption({ id: "a1", period: OPEX_LAND_LEASE_PERIOD.period1, durationYears: 5 }),
        assumption({
          id: "a2", period: OPEX_LAND_LEASE_PERIOD.period2,
          description: "Standard Lease Holder - 2", durationYears: 5,
        }),
      ],
      existingCostsInSubaccount: [], generators: [], countryInflationProfile: null,
    });
    expect(plan.refused).toBe(false);
    expect(plan.costCount).toBe(1);
    expect(plan.periodCount).toBe(2);
    expect(plan.allocationCount).toBe(0);

    const header = plan.writes[0]!;
    expect(header.entitySet).toBe(LEASE_ENTITY_SET.cost);
    expect(payloadOf(header)[LEASE_COST_COL.name])
      .toBe("Windpark A-Leaseholders-Standard Lease Holder");
    expect(payloadOf(header)[LEASE_COST_COL.isStandardContract]).toBe(true);
    expect(payloadOf(header)[LEASE_COST_COL.isStartDateStandardAssumption]).toBe(true);
    expect(payloadOf(header)[LEASE_COST_COL.secured]).toBe(LAND_LEASE_SECURED.yes);
    expect(payloadOf(header)[LEASE_COST_COL.inflationStartYear]).toBe(2028);
    expect(payloadOf(header)["owningbusinessunit@odata.bind"]).toBe("/businessunits(bu-1)");

    const periods = plan.writes.filter((w) => w.entitySet === LEASE_ENTITY_SET.period);
    expect(periods).toHaveLength(2);
    expect(payloadOf(periods[0])[LEASE_PERIOD_COL.period]).toBe(LAND_LEASE_PERIOD.period1);
    expect(payloadOf(periods[0])[LEASE_PERIOD_COL.startDate]).toBe("2027-04-01");
    expect(payloadOf(periods[1])[LEASE_PERIOD_COL.startDate]).toBe("2032-04-01");
    expect(parentRefOf(periods[0])).toBe("cost-0");
  });

  it("UT-LAND-123 an all-WTG assumption creates one allocation per generator, BU bound", () => {
    // docs/01-BUGS-FOUND.md S-5, and SOURCE DEFECT LL-D9 on the Name.
    const plan = planStandardImport({
      ctx: ctx(), subaccountId: "sub-1", subaccountName: "Leaseholders",
      assumptions: [assumption({ allWtgAllocated: true, description: "Standard LL Locations" })],
      existingCostsInSubaccount: [],
      generators: [gen("G1", "WTG 111_1", 1), gen("G2", "WTG 111_2", 2)],
      countryInflationProfile: null,
    });
    expect(plan.allocationCount).toBe(2);
    const allocs = plan.writes.filter((w) => w.entitySet === LEASE_ENTITY_SET.allocation);
    // VERIFIED in live Dataverse: the import never sets Land Owner, so the name leads with "-".
    expect(payloadOf(allocs[0])[LEASE_ALLOC_COL.name]).toBe("-Standard LL Locations-WTG 111_1");
    expect(payloadOf(allocs[0])["owningbusinessunit@odata.bind"]).toBe("/businessunits(bu-1)");
    expect(parentRefOf(allocs[0])).toBe("cost-0");
    // The parent ref resolves once the header id is known.
    const bound = bindParent(plan.writes, { "cost-0": "new-cost" });
    expect(payloadOf(bound.find((w) => w.entitySet === LEASE_ENTITY_SET.allocation))
      ["vsb_ProjectCost@odata.bind"]).toBe("/vsb_landleaseprojectcosts(new-cost)");
  });

  it("UT-LAND-124 a country-inflation assumption stamps the country profile at COD + 1", () => {
    const plan = planStandardImport({
      ctx: ctx(), subaccountId: "sub-1", subaccountName: "Leaseholders",
      assumptions: [assumption({
        useInflationProfile: true, useCountryInflationProfile: true, inflationProfile: 1.5,
      })],
      existingCostsInSubaccount: [], generators: [], countryInflationProfile: 2.1,
    });
    const header = plan.writes[0]!;
    expect(payloadOf(header)[LEASE_COST_COL.inflationProfile]).toBe(2.1);
    expect(payloadOf(header)[LEASE_COST_COL.useCountryInflationProfile]).toBe(true);
    expect(payloadOf(header)[LEASE_COST_COL.inflationStartYear]).toBe(2028);
  });

  it("UT-LAND-125 imported amounts are two-decimal normalised", () => {
    const plan = planStandardImport({
      ctx: ctx(), subaccountId: "sub-1", subaccountName: "Leaseholders",
      assumptions: [assumption({
        amountOneTimePayment: 1234.5678, dueDateOneTimePayment: "04/2027", fixCosts: 999.999,
      })],
      existingCostsInSubaccount: [], generators: [], countryInflationProfile: null,
    });
    expect(payloadOf(plan.writes[0])[LEASE_COST_COL.amount1]).toBe(1234.57);
    expect(payloadOf(plan.writes[0])[LEASE_COST_COL.dueDate1]).toBe("04/2027");
    const p = plan.writes.find((w) => w.entitySet === LEASE_ENTITY_SET.period)!;
    expect(payloadOf(p)[LEASE_PERIOD_COL.fixedCosts]).toBe(1000);
  });
});

/* ══════════════════════════════════════════════════════════════════ form round-trip ══ */

describe("Land Lease — the panel form", () => {
  it("UT-LAND-126 a new contract opens blank at COD with the standard flag cleared", () => {
    // canvas-only: the "newLandLeaseContractKey" arm (LL:388).
    const f = emptyLandLeaseForm(ctx());
    expect(f.description).toBe("");
    expect(f.startDate).toBe("2027-04-01");
    expect(f.inflationStartYear).toBe("2028");
    expect(f.aggregation).toBe(LAND_LEASE_AGGREGATION.sum);
    expect(f.distributionFrequency).toBeNull();
    expect(f.isStartDateStandardAssumption).toBe(false);
    expect(f.oneTimePaymentsOn).toBe(false);
    expect(canSaveLandLease(saveCtx({
      form: f, selectedCost: null, selectedPeriod: null, panelState: "New",
    }))).toBe(false);
  });

  it("UT-LAND-127 editing a period loads its rates through the canvas' text formats", () => {
    // canvas-only: LL:2988, LL:3105 block, LL:5004.
    const f = landLeaseFormFrom({
      cost: cost({
        secured: LAND_LEASE_SECURED.yes, amountOneTimePayment: 1000,
        dueDateOneTimePayment: "04/2027", inflationProfile: 2,
      }),
      period: period({ fixedCosts: 1000, percentOfRevenues: 20, eurPerMwh: 1.4 }),
      parentPeriod: null,
      allocations: [alloc({ generatorInProjectId: "G1" })],
      panelState: "Edit", workingDate: null, resetStartDate: false,
    });
    expect(f.fixedCosts).toBe("1000.00");
    // `If(Int(v) = v, Text(v, "#"), Text(v, "#0.0#"))` — an integer loses its decimals.
    expect(f.percentOfRevenues).toBe("20");
    expect(f.eurPerMwh).toBe("1.40");
    expect(f.securedChecked).toBe(true);
    expect(f.oneTimePaymentsOn).toBe(true);
    expect(f.payments.amount).toBe("1000.00");
    expect(f.inflationProfile).toBe("2.0");
    expect(f.allocatedGeneratorIds).toEqual(["G1"]);
    expect(f.startDate).toBe("2027-01-01");
  });

  it("UT-LAND-128 adding a period pre-fills the auto-numbered name and chains the date", () => {
    // canvas-only: LL:2206 reads locNewPeriodDesc, LL:2355 chains the start date.
    const f = landLeaseFormFrom({
      cost: cost(),
      period: null,
      parentPeriod: period({
        name: "Owner B", period: LAND_LEASE_PERIOD.period1,
        startDate: "2027-04-01", durationYears: 5, durationMonths: 0,
      }),
      allocations: [],
      panelState: "New", workingDate: null, resetStartDate: false,
    });
    expect(f.description).toBe("Owner B - 2");
    expect(f.startDate).toBe("2032-04-01");
  });

  it("UT-LAND-129 the standard-assumption start-date flag survives the round trip", () => {
    // canvas-only: LL:388 reads it into locIsStartDateStandardAssumption, LL:5895 writes it
    // straight back.
    const f = landLeaseFormFrom({
      cost: cost({ isStartDateStandardAssumption: true }),
      period: period(), parentPeriod: null, allocations: [],
      panelState: "Edit", workingDate: null, resetStartDate: false,
    });
    expect(f.isStartDateStandardAssumption).toBe(true);
    expect(buildCostPayload({
      form: f, ctx: ctx(), subaccountId: "sub-1", subaccountName: "Leaseholders",
    })[LEASE_COST_COL.isStartDateStandardAssumption]).toBe(true);
  });
});
