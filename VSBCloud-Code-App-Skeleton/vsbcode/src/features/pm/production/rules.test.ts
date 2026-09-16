/**
 * Project Production Screen — unit tests.
 *
 * IDs are the spec's (`UT-PROD-nnn`). Band XL, weighted to Calculation.
 *
 * COVERAGE. This block used to carry two id lists headed "cases the spec lists that are
 * NOT here". They read as coverage and were not: three of the fourteen ids they named sit
 * on no `it()` in this repo at all, and the other eleven do have their own case below — so
 * the lists are gone rather than patched. What is true, without an id list to misread:
 *  - The pure cores of the Integration / Error cases are pinned here under their own ids —
 *    the seasonality payload, the negative-price diff, the revenue sync, the recalculation
 *    flag set, the Fabric locale parser. The HTTP wiring in `hooks.ts` has no test beyond
 *    the permission guards at the bottom of this file.
 *  - The predicates behind the Rendering / Binding cases are tested directly: `pageLock`,
 *    `commandBarState`, the derived-field fallbacks, `NEW_YIELD_DEFAULTS`.
 */
import { describe, it, expect } from "vitest";
import { CHOICE_PRODUCTION } from "@/data/entities";
import { calculateUncertaintyCanvasParity, uncertaintyFrom } from "@/domain/yieldStats";
import {
  pageLock, isPageLocked, commandBarState,
  derivedP75, derivedP90, totalLossesPct, NEW_YIELD_DEFAULTS, deriveYieldFields, radioFields,
  supersededInternalYields, projectYieldTotals, projectYieldFields,
  buildSeasonalityRows, applyMonthEdit, seasonalityTotal, isSeasonalityValid,
  serialiseStandardValuesJson, deserialiseStandardValuesJson, seasonalityFields,
  buildNegativePriceRows, planNegativePriceWrites, negativePriceFields,
  syncRevenueNegativePrices, decimalSeparatorFor, parseFabricNumber, normaliseAmount,
  validateTotalLosses, validateUncertainty, validateNetYieldP50, validateNetYieldP75,
  validateNetYieldP90, validateCellPercent, canSaveYield, hasUnsavedChanges,
  shouldGenerate, inflationStartYear, resolveInflation, toLandLeasePeriod,
  buildLandLeaseContracts, buildOpexContracts, markForCapexRecalculationFields,
  SUMMARY_LABELS, fmtSummaryValue, productionRowLabel, productionStatusLabel,
  resetNegativePriceRow, fmtPercentTotal,
  MSG, PROJECT_YIELD_COL, SEASONALITY_COL, NEGATIVE_PRICE_COL,
  type ProductionProject, type EnergyYieldRow, type RevenueRow, type SeasonalityRow,
  type StandardAssumption, type YieldFormState, type YieldFormInput,
} from "./rules";
import {
  saveEnergyYield, deleteEnergyYield, setYieldStatus, recalculateProject, editDenial,
  type SaveYieldPayload, type DeleteYieldPayload, type RecalculatePayload,
} from "./hooks";

/* ═══════════════════════════════════════════════════════════════════ fixtures ═══ */

const project = (over: Partial<ProductionProject> = {}): ProductionProject => ({
  id: "p1",
  projectIdText: "DE-0001",
  projectName: "Windpark Nord",
  countryId: "c1",
  technology: 952850000,
  totalCapacity: 22.4,
  endDate: "2055-12-31",
  cod: "2028-09-01",
  netYieldP50: 12_000,
  standardCostCreated: false,
  owningBusinessUnitId: "bu-1",
  ...over,
});

const yieldRow = (over: Partial<EnergyYieldRow> = {}): EnergyYieldRow => ({
  id: "y1",
  description: "Internal WTG 2028",
  type: CHOICE_PRODUCTION.yieldType.wtg,
  assessment: CHOICE_PRODUCTION.yieldAssessment.internal,
  allocation: CHOICE_PRODUCTION.yieldAllocation.wholePlant,
  windSpeed: 7,
  irradiation: null,
  grossYield: 12_000,
  totalLosses: 15,
  netYieldP50: 10_200,
  uncertainty: 10,
  netYieldP75: 9_326,
  netYieldP90: 8_718,
  considerSeasonality: false,
  considerNegativePrices: false,
  status: 0,
  ...over,
});

const revenue = (over: Partial<RevenueRow> = {}): RevenueRow => ({
  id: "r1",
  description: "PPA",
  considerNegativePrices: false,
  manualOverride: false,
  ...over,
});

const twelveStandard = (value: number) =>
  Array.from({ length: 12 }, (_, i) => ({ month: i + 1, pv: value, wtg: value }));

const assumption = (over: Partial<StandardAssumption> = {}): StandardAssumption => ({
  id: "a1",
  name: "LL Standard",
  description: "A Land lease",
  period: CHOICE_PRODUCTION.opexLandLeasePeriod.period1,
  typeOfContract: CHOICE_PRODUCTION.typeOfContract.landlease,
  landLeaseSubaccountId: "lls1",
  landLeaseSubaccountName: "Land lease",
  opexSubaccountId: null,
  currencyId: "cur1",
  secured: true,
  allWtgAllocated: false,
  fixCosts: 1000,
  ofRevenues: 2,
  eurMw: 1,
  eurMwh: 2,
  eurWtg: 3,
  aggregation: CHOICE_PRODUCTION.aggregation.sum,
  durationInYears: 2,
  durationInMonths: 6,
  distributionFrequency: 12,
  amountOneTimePayment: 1_234.5678,
  amountOneTimePayment2: null,
  amountOneTimePayment3: null,
  dueDateOneTimePayment: "2029-01-01",
  dueDateOneTimePayment2: null,
  dueDateOneTimePayment3: null,
  useInflationProfile: true,
  useCountryInflationProfile: false,
  inflationProfile: 1.8,
  inflationCountryArea: "DE",
  alignWithProjectDuration: false,
  externalContract: false,
  threshold: false,
  thresholdType: null,
  thresholdIndividual: null,
  ...over,
});

const form = (over: Partial<YieldFormState> = {}): YieldFormState => ({
  description: "Assessment",
  windSpeed: "7",
  irradiation: "",
  grossYield: "12000",
  totalLosses: "15",
  netP50: "10200",
  uncertainty: "10",
  netP75: "9326",
  netP90: "8718",
  allocationInput: "Input Gross Yield",
  lossesInput: "Input losses",
  uncertaintyInput: "Input Uncertainty",
  allocation: "Whole plant",
  considerSeasonality: false,
  considerNegativePrices: false,
  dirty: new Set<string>(),
  ...over,
});

const input = (over: Partial<YieldFormInput> = {}): YieldFormInput => ({
  grossYield: 1_500,
  netP50: 1_275,
  netP75: 1_190,
  netP90: 1_110,
  totalLosses: 15,
  uncertainty: 10,
  windSpeed: 7,
  irradiation: null,
  ...over,
});

/* ══════════════════════════════════════════════════════════ lock and gating ════ */

describe("page lock and command bar", () => {
  it("UT-PROD-001 lists all three prerequisites", () => {
    const p = project({ projectIdText: null, endDate: null, totalCapacity: 0 });
    expect(pageLock(p)).toEqual(["• General", "• Milestones", "• Generator"]);
    expect(isPageLocked(p)).toBe(true);
    expect(pageLock(project())).toEqual([]);
    expect(isPageLocked(project())).toBe(false);
  });

  it("UT-PROD-002 every command is disabled at zero capacity", () => {
    const st = commandBarState({
      canEdit: true, project: project({ totalCapacity: 0 }), selected: yieldRow(),
    });
    expect(Object.values(st).every((c) => c.enabled === false)).toBe(true);
    // …and with capacity they are all enabled again.
    const ok = commandBarState({ canEdit: true, project: project(), selected: yieldRow() });
    expect(Object.values(ok).every((c) => c.enabled === true)).toBe(true);
  });

  it("UT-PROD-003 Edit visibility follows the yield type", () => {
    const pvSel = commandBarState({
      canEdit: true, project: project(),
      selected: yieldRow({ type: CHOICE_PRODUCTION.yieldType.pv }),
    });
    expect(pvSel.editProductionPV.visible).toBe(true);
    expect(pvSel.editProductionWTG.visible).toBe(false);
  });

  it("UT-PROD-004 Activate is hidden while the yield is already active", () => {
    const active = commandBarState({
      canEdit: true, project: project(), selected: yieldRow({ status: 0 }),
    });
    expect(active.activateProdItem.visible).toBe(false);
    expect(active.deactivateProdItem.visible).toBe(true);
    const inactive = commandBarState({
      canEdit: true, project: project(), selected: yieldRow({ status: 1 }),
    });
    expect(inactive.activateProdItem.visible).toBe(true);
    expect(inactive.deactivateProdItem.visible).toBe(false);
    // With no selection BOTH are hidden — the canvas conjoins `!IsBlank(Status)`.
    const none = commandBarState({ canEdit: true, project: project(), selected: null });
    expect(none.activateProdItem.visible).toBe(false);
    expect(none.deactivateProdItem.visible).toBe(false);
    expect(none.deleteProductionItem.visible).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════ yield maths ════ */

describe("p75 / p90 derivation", () => {
  it("UT-PROD-005 p75 from p50 and a 10 % uncertainty", () => {
    expect(derivedP75(10_000, 10)).toBe(9_326);
  });

  it("UT-PROD-006 p90 from p50 and a 10 % uncertainty", () => {
    expect(derivedP90(10_000, 10)).toBe(8_718);
  });

  it("UT-PROD-007 non-numeric input yields no value (the -1 sentinel never leaks)", () => {
    expect(derivedP75("abc", 10)).toBeUndefined();
    expect(derivedP90("abc", 10)).toBeUndefined();
    expect(derivedP75(10_000, "")).toBeUndefined();
  });

  it("UT-PROD-008 zero uncertainty leaves p50 unchanged", () => {
    expect(derivedP75(5_000, 0)).toBe(5_000);
    expect(derivedP90(5_000, 0)).toBe(5_000);
  });

  it("SOURCE DEFECT (ambiguity 2): calculateUncertainty is wrong; the inverse is not", () => {
    // The shipped canvas formula, by operator precedence, is
    // Round(p50 - ((p75/p50) * 0.674490), 1) — i.e. it returns something the SIZE OF p50
    // where an uncertainty fraction was intended. Dimensionally wrong, and latent because
    // both call sites are commented out.
    expect(calculateUncertaintyCanvasParity(10_000, 9_326)).toBe(9_999.4);
    // The corrected inverse of p75 = p50 + z*(p50*u) recovers the 10 % that produced it.
    expect(uncertaintyFrom(10_000, { p75: 9_326 })).toBeCloseTo(0.1, 3);
    // Both call sites are commented out in the canvas, so nothing on this screen uses it.
  });

  it("UT-PROD-010 total losses derived from gross and p50", () => {
    expect(totalLossesPct(12_000, 10_200)).toBeCloseTo(15, 10);
    // A blank or zero gross yield cannot produce a figure (the canvas guards on it).
    expect(totalLossesPct(0, 10_200)).toBeUndefined();
    expect(totalLossesPct(null, 10_200)).toBeUndefined();
  });

  it("UT-PROD-011 negative derived losses raise the gross-yield message", () => {
    const derived = totalLossesPct(9_000, 10_000);
    expect(derived).toBeLessThan(0);
    expect(validateTotalLosses(String(derived), { derived: true })).toBe(MSG.grossYieldOrder);
  });

  it("UT-PROD-012 a new form opens with losses 15 and uncertainty 10", () => {
    expect(NEW_YIELD_DEFAULTS).toEqual({ totalLosses: 15, uncertainty: 10 });
  });
});

describe("allocation modes", () => {
  it("UT-PROD-013 'Each turbine' multiplies the four yield fields", () => {
    const out = deriveYieldFields(input(), "Each turbine", 8);
    expect(out.grossYield).toBe(12_000);
    expect(out.netP50).toBe(10_200);
    expect(out.netP75).toBe(9_520);
    expect(out.netP90).toBe(8_880);
  });

  it("UT-PROD-014 'Each turbine' blanks losses and uncertainty", () => {
    const out = deriveYieldFields(input(), "Each turbine", 8);
    expect(out.totalLosses).toBeUndefined();
    expect(out.uncertainty).toBeUndefined();
  });

  it("UT-PROD-015 'Whole plant' passes values through untouched", () => {
    const out = deriveYieldFields(input(), "Whole plant", 8);
    expect(out.grossYield).toBe(1_500);
    expect(out.netP50).toBe(1_275);
    expect(out.totalLosses).toBe(15);
    expect(out.uncertainty).toBe(10);
  });

  it("UT-PROD-008b the radio → option-set mapping writes VALUES, not the typo'd labels", () => {
    expect(
      radioFields({
        allocationInput: "Input Irradiation",
        lossesInput: "Input losses",
        uncertaintyInput: "Input Uncertainty",
      }),
    ).toEqual({
      vsb_productionallocation: false,
      vsb_productionlossesp50: false,
      vsb_productionuncertaintyp75andp90: false,
    });
    expect(
      radioFields({
        allocationInput: "Input Gross Yield",
        lossesInput: "Input Net Yield p50",
        uncertaintyInput: "Input Net Yield p75/p90",
      }),
    ).toEqual({
      vsb_productionallocation: true,
      vsb_productionlossesp50: true,
      vsb_productionuncertaintyp75andp90: true,
    });
  });

  it("UT-PROD-016 an external assessment deactivates the internals of the SAME type", () => {
    const yields = [
      yieldRow({ id: "w1" }),
      yieldRow({ id: "w2" }),
      yieldRow({ id: "pv1", type: CHOICE_PRODUCTION.yieldType.pv }),
      yieldRow({ id: "w3", status: 1 }),
      yieldRow({
        id: "w4", assessment: CHOICE_PRODUCTION.yieldAssessment.external,
      }),
    ];
    expect(
      supersededInternalYields({
        assessment: CHOICE_PRODUCTION.yieldAssessment.external,
        type: CHOICE_PRODUCTION.yieldType.wtg,
        yields,
        savedId: "new",
      }),
    ).toEqual(["w1", "w2"]);
    // An internal save supersedes nothing.
    expect(
      supersededInternalYields({
        assessment: CHOICE_PRODUCTION.yieldAssessment.internal,
        type: CHOICE_PRODUCTION.yieldType.wtg,
        yields,
      }),
    ).toEqual([]);
  });
});

/* ══════════════════════════════════════════════════════════ project roll-up ════ */

describe("project yield roll-up", () => {
  it("UT-PROD-017 the roll-up is the SUM of two averages", () => {
    const wtg = [
      yieldRow({ id: "a", netYieldP50: 10_000 }),
      yieldRow({ id: "b", netYieldP50: 12_000 }),
    ];
    const pv = [
      yieldRow({ id: "c", type: CHOICE_PRODUCTION.yieldType.pv, netYieldP50: 3_000 }),
    ];
    expect(projectYieldTotals(wtg, pv).netP50).toBe(14_000);
  });

  it("UT-PROD-018 an empty side contributes zero", () => {
    const totals = projectYieldTotals([yieldRow({ netYieldP50: 10_000 })], []);
    expect(totals.netP50).toBe(10_000);
    expect(totals.irradiation).toBe(0);
  });

  it("UT-PROD-019 wind speed averages the WTG side only", () => {
    const totals = projectYieldTotals(
      [yieldRow({ id: "a", windSpeed: 6.5 }), yieldRow({ id: "b", windSpeed: 7.5 })],
      [yieldRow({ id: "c", type: CHOICE_PRODUCTION.yieldType.pv, windSpeed: 99 })],
    );
    expect(totals.windSpeed).toBeCloseTo(7.0, 10);
  });

  it("UT-PROD-020 only active yields count", () => {
    const totals = projectYieldTotals(
      [
        yieldRow({ id: "a", netYieldP50: 10_000 }),
        yieldRow({ id: "b", netYieldP50: 99_999, status: 1 }),
      ],
      [],
    );
    expect(totals.netP50).toBe(10_000);
  });

  it("the roll-up payload targets the metadata column names", () => {
    const fields = projectYieldFields(projectYieldTotals([yieldRow()], []));
    expect(Object.keys(fields).sort()).toEqual(
      [
        PROJECT_YIELD_COL.grossYield, PROJECT_YIELD_COL.windSpeed,
        PROJECT_YIELD_COL.netYieldP50, PROJECT_YIELD_COL.netYieldP75,
        PROJECT_YIELD_COL.netYieldP90, PROJECT_YIELD_COL.irradiation,
      ].sort(),
    );
  });
});

/* ═════════════════════════════════════════════════════════════ seasonality ════ */

describe("seasonality", () => {
  it("UT-PROD-021 twelve rows are seeded from the Fabric standard", () => {
    const rows = buildSeasonalityRows(
      twelveStandard(8.5).map((r, i) => ({ ...r, wtg: i + 1, pv: 100 - i })),
      "WTG",
    );
    expect(rows).toHaveLength(12);
    expect(rows.every((r) => r.isStandard)).toBe(true);
    expect(rows[0]).toMatchObject({ id: 1, month: "January", value: 1 });
    expect(rows[11]).toMatchObject({ id: 12, month: "December", value: 12 });
  });

  it("UT-PROD-030 WTG reads the Wind column, PV the PV column", () => {
    const std = [{ month: 1, pv: 4.5, wind: 2.1 }];
    // (`buildSeasonalityRows` uses `wtg`; the negative-price builder uses `wind`.)
    expect(buildNegativePriceRows(2030, std.map((s) => ({ year: 2030, pv: s.pv, wind: s.wind })), "WTG")[0].reductionValue).toBe(2.1);
    expect(buildNegativePriceRows(2030, std.map((s) => ({ year: 2030, pv: s.pv, wind: s.wind })), "PV")[0].reductionValue).toBe(4.5);
  });

  it("UT-PROD-022 editing one month clears EVERY standard flag", () => {
    const rows = buildSeasonalityRows(twelveStandard(8.5), "WTG");
    const edited = applyMonthEdit(rows, 3, 9.1);
    expect(edited.every((r) => r.isStandard === false)).toBe(true);
    expect(edited.find((r) => r.id === 3)?.value).toBe(9.1);
    expect(edited.find((r) => r.id === 4)?.value).toBe(8.5);
  });

  it("UT-PROD-023 the twelve months must total 100", () => {
    const rows: SeasonalityRow[] = buildSeasonalityRows(twelveStandard(0), "WTG").map(
      (r, i) => ({ ...r, value: i === 0 ? 99.4 : 0 }),
    );
    expect(seasonalityTotal(rows)).toBeCloseTo(99.4, 10);
    expect(isSeasonalityValid(rows)).toBe(false);
    const ok = rows.map((r, i) => ({ ...r, value: i === 0 ? 100 : 0 }));
    expect(isSeasonalityValid(ok)).toBe(true);
    // Round(total, 1) === 100 — so 99.96 rounds INTO validity, as the canvas does.
    const rounded = rows.map((r, i) => ({ ...r, value: i === 0 ? 99.96 : 0 }));
    expect(isSeasonalityValid(rounded)).toBe(true);
  });

  it("UT-PROD-024 the cell regex is locale-aware", () => {
    expect(decimalSeparatorFor("de-DE")).toBe(",");
    expect(decimalSeparatorFor("en-US")).toBe(".");
    expect(validateCellPercent("8,25", "de-DE")).toBe(MSG.cellRange);
    expect(validateCellPercent("7,5", "de-DE")).toBeNull();
    expect(validateCellPercent("7.5", "en-US")).toBeNull();
    expect(validateCellPercent("7.55", "en-US")).toBe(MSG.cellRange);
    expect(validateCellPercent("100", "en-US")).toBeNull();
    expect(validateCellPercent("100.0", "en-US")).toBeNull();
    expect(validateCellPercent("101", "en-US")).toBe(MSG.cellRange);
    expect(validateCellPercent("", "en-US")).toBe(MSG.cellEmpty);
  });

  it("UT-PROD-027 the Standard Values JSON round-trips", () => {
    const rows = buildSeasonalityRows(twelveStandard(8.5), "WTG").map((r) =>
      [1, 4, 7].includes(r.id) ? { ...r, isStandard: false } : r,
    );
    const json = serialiseStandardValuesJson(rows);
    expect(JSON.parse(json)).toMatchObject({
      Jan: false, Feb: true, Mar: true, Apr: false, Jul: false, Dec: true,
    });
    expect(deserialiseStandardValuesJson(json)).toEqual(
      rows.map((r) => r.isStandard),
    );
    // Malformed or missing JSON degrades to "nothing is standard".
    expect(deserialiseStandardValuesJson(null)).toEqual(Array(12).fill(false));
    expect(deserialiseStandardValuesJson("{oops")).toEqual(Array(12).fill(false));
  });

  it("UT-PROD-025 the seasonality payload names the row and the twelve columns", () => {
    const rows = buildSeasonalityRows(twelveStandard(8.5), "WTG");
    const fields = seasonalityFields({ rows, yieldDescription: "Internal WTG 2028" });
    expect(fields[SEASONALITY_COL.name]).toBe("Seasonality - Internal WTG 2028");
    for (const col of SEASONALITY_COL.months) expect(fields[col]).toBe(8.5);
    expect(fields[SEASONALITY_COL.standardValuesJson]).toContain('"Jan":true');
  });
});

/* ═══════════════════════════════════════════════════════ negative prices ════ */

describe("negative prices", () => {
  it("UT-PROD-028 the curve spans 15 years from the COD year", () => {
    const rows = buildNegativePriceRows(2028, [], "WTG");
    expect(rows).toHaveLength(15);
    expect(rows[0].year).toBe(2028);
    expect(rows[14].year).toBe(2042);
  });

  it("UT-PROD-029 a missing standard year defaults to 0 and is not standard", () => {
    const rows = buildNegativePriceRows(
      2028,
      [{ year: 2028, pv: 1, wind: 2 }],
      "WTG",
    );
    expect(rows[0]).toMatchObject({ reductionValue: 2, standardAssumption: true });
    const y2041 = rows.find((r) => r.year === 2041)!;
    expect(y2041.reductionValue).toBe(0);
    expect(y2041.standardAssumption).toBe(false);
  });

  it("UT-PROD-031 only the changed year is written back", () => {
    const current = buildNegativePriceRows(2028, [], "WTG").slice(0, 3).map((r) =>
      r.year === 2029 ? { ...r, reductionValue: 4.5 } : r,
    );
    const stored = [
      { id: "n28", year: 2028, reduction: 0, isStandard: false },
      { id: "n29", year: 2029, reduction: 0, isStandard: false },
      { id: "n30", year: 2030, reduction: 0, isStandard: false },
    ];
    const plan = planNegativePriceWrites(current, stored);
    expect(plan.upserts).toEqual([
      { id: "n29", year: 2029, reduction: 4.5, isStandard: false },
    ]);
    expect(plan.deletes).toEqual([]);
  });

  it("stored years the curve no longer covers are removed", () => {
    const current = buildNegativePriceRows(2030, [], "WTG");
    const stored = [
      { id: "old", year: 2028, reduction: 1, isStandard: false },
      { id: "keep", year: 2030, reduction: 0, isStandard: false },
    ];
    const plan = planNegativePriceWrites(current, stored);
    expect(plan.deletes).toEqual(["old"]);
    expect(plan.upserts.some((u) => u.year === 2030)).toBe(false);
  });

  it("the per-year payload matches `Negative Price - <year>`", () => {
    expect(negativePriceFields({ year: 2031, reduction: 3.2, isStandard: true })).toEqual({
      [NEGATIVE_PRICE_COL.name]: "Negative Price - 2031",
      [NEGATIVE_PRICE_COL.year]: 2031,
      [NEGATIVE_PRICE_COL.reduction]: 3.2,
      [NEGATIVE_PRICE_COL.isStandard]: true,
    });
  });

  it("UT-PROD-033 the revenue sync turns contracts OFF when no yield uses them", () => {
    const flips = syncRevenueNegativePrices({
      activeYields: [yieldRow({ considerNegativePrices: false })],
      revenues: [
        revenue({ id: "r1", considerNegativePrices: true }),
        revenue({ id: "r2", considerNegativePrices: true }),
        revenue({ id: "r3", considerNegativePrices: true }),
      ],
    });
    expect(flips).toEqual([
      { id: "r1", considerNegativePrices: false },
      { id: "r2", considerNegativePrices: false },
      { id: "r3", considerNegativePrices: false },
    ]);
  });

  it("UT-PROD-034 the revenue sync turns contracts ON when a yield uses them", () => {
    const flips = syncRevenueNegativePrices({
      activeYields: [yieldRow({ considerNegativePrices: true })],
      revenues: [
        revenue({ id: "r1", considerNegativePrices: false }),
        revenue({ id: "r2", considerNegativePrices: false }),
      ],
    });
    expect(flips.map((f) => f.considerNegativePrices)).toEqual([true, true]);
  });

  it("UT-PROD-035 manual-override contracts are never touched", () => {
    const flips = syncRevenueNegativePrices({
      activeYields: [yieldRow({ considerNegativePrices: false })],
      revenues: [
        revenue({ id: "r1", considerNegativePrices: true }),
        revenue({ id: "r2", considerNegativePrices: true, manualOverride: true }),
      ],
    });
    expect(flips.map((f) => f.id)).toEqual(["r1"]);
  });

  it("UT-PROD-036/037 an INACTIVE negative-price yield does not keep contracts on", () => {
    // The same pure function serves delete and deactivate: only ACTIVE yields count.
    const flips = syncRevenueNegativePrices({
      activeYields: [yieldRow({ considerNegativePrices: true, status: 1 })],
      revenues: [revenue({ id: "r1", considerNegativePrices: true })],
    });
    expect(flips).toEqual([{ id: "r1", considerNegativePrices: false }]);
  });
});

/* ═══════════════════════════════════════════════════════ Fabric parsing ════ */

describe("Fabric and locale handling", () => {
  it("UT-PROD-057 assumption parsing is locale-safe", () => {
    expect(parseFabricNumber("0.075", "en-US") * 100).toBeCloseTo(7.5, 10);
    expect(parseFabricNumber("0.075", "de-DE") * 100).toBeCloseTo(7.5, 10);
    expect(parseFabricNumber(null, "de-DE")).toBe(0);
    expect(parseFabricNumber("", "en-US")).toBe(0);
    expect(parseFabricNumber(0.075, "de-DE")).toBe(0.075);
  });

  it("UT-PROD-046 one-time payment amounts are normalised to 2 dp", () => {
    expect(normaliseAmount(1_234.5678)).toBe(1_234.57);
    expect(normaliseAmount(null)).toBe(0);
    expect(normaliseAmount(2.005)).toBe(2.01);
  });
});

/* ═════════════════════════════════════════════════════════════ validation ════ */

describe("field validation", () => {
  it("UT-PROD-050 Save is blocked when p90 exceeds p75", () => {
    expect(
      validateNetYieldP90("9000", { mode: "Input Net Yield p75/p90", p75: "8000" }),
    ).toBe(MSG.p90BelowP75);
    expect(
      validateNetYieldP90("7000", { mode: "Input Net Yield p75/p90", p75: "8000" }),
    ).toBeNull();
    expect(
      canSaveYield({
        form: form({
          uncertaintyInput: "Input Net Yield p75/p90", netP75: "8000", netP90: "9000",
        }),
        technology: "WTG",
        seasonality: [],
        negativePrices: [],
      }),
    ).toBe(false);
  });

  it("UT-PROD-051 a negative computed p90 raises the uncertainty message", () => {
    // mode Input Uncertainty, p50 = 100, u = 200 % ⇒ p90 = 100 + (-1.281551 * 200) < 0
    const p90 = derivedP90(100, 200)!;
    expect(p90).toBeLessThan(0);
    expect(validateNetYieldP90(String(p90), { mode: "Input Uncertainty", p75: "" })).toBe(
      MSG.negativeYield,
    );
    expect(validateNetYieldP75(String(p90), { mode: "Input Uncertainty", p50: "100" })).toBe(
      MSG.negativeYield,
    );
  });

  it("UT-PROD-052 p50 must be a whole number within range", () => {
    expect(validateNetYieldP50("10000.5")).toBe(MSG.p50Integer);
    expect(validateNetYieldP50("2500000")).toBe(MSG.p50Range);
    expect(validateNetYieldP50("10000")).toBeNull();
    expect(validateNetYieldP50("")).toBeNull();
  });

  it("UT-PROD-053 uncertainty is one decimal within 0…100", () => {
    expect(validateUncertainty("10.25")).toBe(MSG.oneDecimal);
    expect(validateUncertainty("150")).toBe(MSG.uncertaintyRange);
    expect(validateUncertainty("10.5")).toBeNull();
  });

  it("SOURCE DEFECT: the total-losses 0–100 branch shows the gross-yield message", () => {
    // The `"Please select a value between 0 and 100."` string is commented out in the
    // canvas, so the out-of-range case reuses the ordering message. Reproduced verbatim.
    expect(validateTotalLosses("120", { derived: false })).toBe(MSG.grossYieldOrder);
    expect(validateTotalLosses("15.25", { derived: false })).toBe(MSG.oneDecimal);
    expect(validateTotalLosses("15.2", { derived: false })).toBeNull();
  });

  it("UT-PROD-075 p75 must be below p50 in manual mode", () => {
    expect(
      validateNetYieldP75("11000", { mode: "Input Net Yield p75/p90", p50: "10200" }),
    ).toBe(MSG.p75BelowP50);
    expect(
      validateNetYieldP75("9326", { mode: "Input Net Yield p75/p90", p50: "10200" }),
    ).toBeNull();
  });

  it("UT-PROD-054 Save is blocked when the chosen mode's inputs are blank", () => {
    expect(
      canSaveYield({
        form: form({ lossesInput: "Input losses", grossYield: "" }),
        technology: "WTG", seasonality: [], negativePrices: [],
      }),
    ).toBe(false);
    expect(
      canSaveYield({
        form: form({ uncertaintyInput: "Input Net Yield p75/p90", netP90: "" }),
        technology: "WTG", seasonality: [], negativePrices: [],
      }),
    ).toBe(false);
    // A blank description or wind speed also blocks it.
    expect(
      canSaveYield({
        form: form({ description: "" }), technology: "WTG",
        seasonality: [], negativePrices: [],
      }),
    ).toBe(false);
    expect(
      canSaveYield({
        form: form({ windSpeed: "" }), technology: "WTG",
        seasonality: [], negativePrices: [],
      }),
    ).toBe(false);
    // …and a PV panel does not demand a wind speed.
    expect(
      canSaveYield({
        form: form({ windSpeed: "" }), technology: "PV",
        seasonality: [], negativePrices: [],
      }),
    ).toBe(true);
  });

  it("UT-PROD-055 Save is blocked on an invalid negative-price row", () => {
    expect(
      canSaveYield({
        form: form({ considerNegativePrices: true }),
        technology: "WTG", seasonality: [],
        negativePrices: [{ value: "abc" }],
      }),
    ).toBe(false);
    expect(
      canSaveYield({
        form: form({ considerNegativePrices: true }),
        technology: "WTG", seasonality: [],
        negativePrices: [{ value: "4.5" }],
      }),
    ).toBe(true);
  });

  it("UT-PROD-023b Save is blocked while seasonality does not total 100", () => {
    const rows = buildSeasonalityRows(twelveStandard(1), "WTG");
    expect(
      canSaveYield({
        form: form({ considerSeasonality: true }),
        technology: "WTG", seasonality: rows, negativePrices: [],
      }),
    ).toBe(false);
  });

  it("UT-PROD-056 the unsaved-changes guard fires on any dirty field", () => {
    expect(hasUnsavedChanges(new Set())).toBe(false);
    expect(hasUnsavedChanges(new Set(["netP50"]))).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════ standard contracts ════ */

describe("standard contract generation", () => {
  it("UT-PROD-038 generation is one-shot", () => {
    expect(shouldGenerate(project({ netYieldP50: 12_000, standardCostCreated: false }))).toBe(true);
    expect(shouldGenerate(project({ netYieldP50: 12_000, standardCostCreated: true }))).toBe(false);
  });

  it("UT-PROD-039 nothing is generated at zero p50", () => {
    expect(shouldGenerate(project({ netYieldP50: 0, standardCostCreated: false }))).toBe(false);
    expect(shouldGenerate(project({ netYieldP50: null, standardCostCreated: false }))).toBe(false);
  });

  it("UT-PROD-040 land lease is skipped when standard contracts already exist", () => {
    const out = buildLandLeaseContracts({
      project: project(),
      assumptions: [assumption()],
      existingStandardCosts: [{ id: "existing" }],
      generators: [],
      countryProfile: null,
    });
    expect(out).toEqual({ costs: [], periods: [], allocations: [] });
  });

  it("UT-PROD-041 the inflation start year is COD year + 1", () => {
    expect(inflationStartYear("2028-09-01")).toBe(2029);
    expect(inflationStartYear(null)).toBeNull();
    const out = buildLandLeaseContracts({
      project: project(),
      assumptions: [assumption()],
      existingStandardCosts: [],
      generators: [],
      countryProfile: null,
    });
    expect(out.costs[0].fields["vsb_inflationstartyear"]).toBe(2029);
  });

  it("UT-PROD-042 the country profile wins when both flags are Yes", () => {
    expect(
      resolveInflation({
        assumption: {
          useInflationProfile: true, useCountryInflationProfile: true, inflationProfile: 1.8,
        },
        countryProfile: 2.1,
      }),
    ).toBe(2.1);
  });

  it("UT-PROD-043 the assumption's own profile is used when the country flag is No", () => {
    expect(
      resolveInflation({
        assumption: {
          useInflationProfile: true, useCountryInflationProfile: false, inflationProfile: 1.8,
        },
        countryProfile: 2.1,
      }),
    ).toBe(1.8);
  });

  it("UT-PROD-044 no inflation at all when the profile flag is off", () => {
    expect(
      resolveInflation({
        assumption: {
          useInflationProfile: false, useCountryInflationProfile: true, inflationProfile: 1.8,
        },
        countryProfile: 2.1,
      }),
    ).toBeUndefined();
  });

  it("UT-PROD-045 AllWTGAllocated creates one allocation per turbine", () => {
    const out = buildLandLeaseContracts({
      project: project(),
      assumptions: [assumption({ allWtgAllocated: true, description: "Field A" })],
      existingStandardCosts: [],
      generators: Array.from({ length: 6 }, (_, i) => ({
        id: `w${i + 1}`, name: `WTG WPN_${i + 1}`,
      })),
      countryProfile: null,
      landOwnerByAssumption: { a1: "Meyer" },
    });
    expect(out.allocations).toHaveLength(6);
    expect(out.allocations[0].name).toBe("Meyer-Field A-WTG WPN_1");
    // A non-allocated assumption produces no allocation rows.
    const none = buildLandLeaseContracts({
      project: project(),
      assumptions: [assumption({ allWtgAllocated: false })],
      existingStandardCosts: [],
      generators: [{ id: "w1", name: "WTG WPN_1" }],
      countryProfile: null,
    });
    expect(none.allocations).toEqual([]);
  });

  it("UT-PROD-046b the generated cost is stamped as standard and 2-dp normalised", () => {
    const out = buildLandLeaseContracts({
      project: project(),
      assumptions: [assumption()],
      existingStandardCosts: [],
      generators: [],
      countryProfile: null,
    });
    const f = out.costs[0].fields;
    expect(f["vsb_amountonetimepayment"]).toBe(1_234.57);
    expect(f["vsb_isstandardcontract"]).toBe(true);
    expect(f["vsb_isstartdatestandardassumption"]).toBe(true);
    // Secured translates from the Yes/No two-option to the Land Lease Secured picklist.
    expect(f["vsb_secured"]).toBe(CHOICE_PRODUCTION.landLeaseSecured.yes);
  });

  it("the land-lease period chain starts at COD and restarts at each Period 1", () => {
    const out = buildLandLeaseContracts({
      project: project(),
      assumptions: [
        assumption({
          id: "p1", description: "A", period: CHOICE_PRODUCTION.opexLandLeasePeriod.period1,
          durationInYears: 2, durationInMonths: 6,
        }),
        assumption({
          id: "p2", description: "B", period: CHOICE_PRODUCTION.opexLandLeasePeriod.period2,
          durationInYears: 5, durationInMonths: 0,
        }),
      ],
      existingStandardCosts: [],
      generators: [],
      countryProfile: null,
    });
    expect(out.costs).toHaveLength(1);
    expect(out.periods).toHaveLength(2);
    expect(out.periods[0].startDate.toISOString().slice(0, 10)).toBe("2028-09-01");
    // Period 2 = period 1 start + (2y * 12 + 6m) = 30 months.
    expect(out.periods[1].startDate.toISOString().slice(0, 10)).toBe("2031-03-01");
  });

  it("the Opex→Land-Lease period option-set translation is positional", () => {
    expect(toLandLeasePeriod(CHOICE_PRODUCTION.opexLandLeasePeriod.period1)).toBe(
      CHOICE_PRODUCTION.landLeasePeriod.period1,
    );
    expect(toLandLeasePeriod(CHOICE_PRODUCTION.opexLandLeasePeriod.period9)).toBe(
      CHOICE_PRODUCTION.landLeasePeriod.period9,
    );
    // `Opex & Land Lease Period` has a Period 10; `Land Lease Period` does not. The canvas
    // Switch has no arm for it and falls through to Period 1.
    expect(toLandLeasePeriod(CHOICE_PRODUCTION.opexLandLeasePeriod.period10)).toBe(
      CHOICE_PRODUCTION.landLeasePeriod.period1,
    );
    expect(toLandLeasePeriod(null)).toBe(CHOICE_PRODUCTION.landLeasePeriod.period1);
  });

  it("UT-PROD-047 O&M period 2 chains from period 1", () => {
    const rows = buildOpexContracts({
      project: project(),
      assumptions: [
        assumption({
          id: "o1", typeOfContract: CHOICE_PRODUCTION.typeOfContract.opexOandM,
          description: "A O&M", period: CHOICE_PRODUCTION.opexLandLeasePeriod.period1,
          durationInYears: 2, durationInMonths: 6,
        }),
        assumption({
          id: "o2", typeOfContract: CHOICE_PRODUCTION.typeOfContract.opexOandM,
          description: "B O&M", period: CHOICE_PRODUCTION.opexLandLeasePeriod.period2,
          durationInYears: 5, durationInMonths: 0,
        }),
      ],
      existingStandardCosts: [],
      deviceTypes: [{ id: "d1" }],
      oAndMSubaccountName: "Operation & Maintenance",
      countryProfile: null,
    });
    const period1 = rows.find((r) => r.kind === "opexCost")!;
    const period2 = rows.find((r) => r.kind === "opexPeriod")!;
    expect(period1.startDate.toISOString().slice(0, 10)).toBe("2028-09-01");
    expect(period2.startDate.toISOString().slice(0, 10)).toBe("2031-03-01");
    expect(period2.parentDeviceTypeInProjectId).toBe("d1");
  });

  it("O&M generates one row set per device type in project", () => {
    const rows = buildOpexContracts({
      project: project(),
      assumptions: [
        assumption({
          typeOfContract: CHOICE_PRODUCTION.typeOfContract.opexOandM,
          period: CHOICE_PRODUCTION.opexLandLeasePeriod.period1,
        }),
      ],
      existingStandardCosts: [],
      deviceTypes: [{ id: "d1" }, { id: "d2" }, { id: "d3" }],
      oAndMSubaccountName: "Operation & Maintenance",
      countryProfile: null,
    });
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.deviceTypeInProjectId)).toEqual(["d1", "d2", "d3"]);
    // Existing standard O&M contracts skip generation entirely.
    expect(
      buildOpexContracts({
        project: project(),
        assumptions: [assumption({ typeOfContract: CHOICE_PRODUCTION.typeOfContract.opexOandM })],
        existingStandardCosts: [{ id: "x" }],
        deviceTypes: [{ id: "d1" }],
        oAndMSubaccountName: "O&M",
        countryProfile: null,
      }),
    ).toEqual([]);
  });

  it("land-lease generation only reads Landlease contract types", () => {
    const out = buildLandLeaseContracts({
      project: project(),
      assumptions: [
        assumption({ id: "ll", typeOfContract: CHOICE_PRODUCTION.typeOfContract.landlease }),
        assumption({ id: "om", typeOfContract: CHOICE_PRODUCTION.typeOfContract.opexOandM }),
      ],
      existingStandardCosts: [],
      generators: [],
      countryProfile: null,
    });
    expect(out.costs).toHaveLength(1);
    expect(out.costs[0].assumptionId).toBe("ll");
  });
});

/* ═════════════════════════════════════════════════ the recalculation handoff ════ */

describe("recalculation handoff", () => {
  it("UT-PROD-048/049 the flags are written; no flow is invoked", () => {
    /*
     * `SynchroniseRecalculationCapexStandardCost` is commented out at
     * `Project Production Screen.pa.yaml:9082`, absent from `sol/Workflows/` and absent
     * from `References/DataSources.json`. Nothing in this feature imports
     * `@/flows/flowClient`; the handoff IS this four-column PATCH.
     */
    expect(markForCapexRecalculationFields()).toEqual({
      [PROJECT_YIELD_COL.initialP50Trigger]: true,
      [PROJECT_YIELD_COL.capexStandardContractsCreated]: false,
      [PROJECT_YIELD_COL.capexStandardCostsCreated]: false,
      [PROJECT_YIELD_COL.bopStandardContractsCreated]: false,
    });
    expect(Object.keys(markForCapexRecalculationFields())).toHaveLength(4);
  });

  it("UT-PROD-058 a Fabric failure degrades to zero-valued rows", () => {
    // An empty standard table (the graceful-degradation state) still yields 12 usable
    // seasonality rows and 15 usable negative-price rows.
    const season = buildSeasonalityRows([], "WTG");
    expect(season).toHaveLength(12);
    expect(season.every((r) => r.value === 0)).toBe(true);
    const negative = buildNegativePriceRows(2028, [], "PV");
    expect(negative).toHaveLength(15);
    expect(negative.every((r) => r.reductionValue === 0 && !r.standardAssumption)).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════ GUIDE q12–q16 ════ */

describe("UT-PROD the summary grid's labels and blanking (GUIDE q12)", () => {
  it("carries the six labels verbatim, units included, in the screenshot's order", () => {
    expect(Object.values(SUMMARY_LABELS)).toEqual([
      "Gross Yield [MWh]",
      "Wind Speed at Hub Height [m/s]",
      "Irradiation [kWh/kWp]",
      "Net Yield p50 [MWh]",
      "Net Yield p75 [MWh]",
      "Net Yield p90 [MWh]",
    ]);
  });

  it("a zero total (no contributing yield) renders blank, not \"0\"", () => {
    expect(fmtSummaryValue(0, 0)).toBe("—");
    expect(fmtSummaryValue(0, 1)).toBe("—");
    expect(fmtSummaryValue(null, 0)).toBe("—");
    expect(fmtSummaryValue(undefined, 1)).toBe("—");
  });

  it("a real total is formatted through fmtMwh / fmtOneDecimal", () => {
    expect(fmtSummaryValue(1000, 0)).toBe("1,000");
    expect(fmtSummaryValue(2, 1)).toBe("2.0");
    expect(fmtSummaryValue(850, 0)).toBe("850");
  });
});

describe("UT-PROD the collapsed record row (GUIDE q12/q13)", () => {
  it("labels the row \"Production - {description}\"", () => {
    expect(productionRowLabel("WTG Desc 500")).toBe("Production - WTG Desc 500");
    expect(productionRowLabel(null)).toBe("Production - ");
  });

  it("the status chip reads Active/Inactive, independent of the Internal/External chip", () => {
    expect(productionStatusLabel(0)).toBe("Active");
    expect(productionStatusLabel(1)).toBe("Inactive");
  });
});

describe("UT-PROD per-row Negative Price reset (GUIDE q16)", () => {
  it("restores the standard value and re-marks the row a calculated default", () => {
    const rows = buildNegativePriceRows(2031, [{ year: 2032, pv: 1, wind: 4.4 }], "WTG").map(
      (r) => (r.year === 2032 ? { ...r, reductionValue: 9.9, standardAssumption: false } : r),
    );
    const reset = resetNegativePriceRow(rows, 2032);
    expect(reset.find((r) => r.year === 2032)).toMatchObject({
      reductionValue: 4.4,
      standardAssumption: true,
    });
    // Every other row is untouched.
    expect(reset.find((r) => r.year === 2031)).toEqual(rows.find((r) => r.year === 2031));
  });
});

describe("UT-PROD the Total Sum [%] formatting (GUIDE q16)", () => {
  it("drops a trailing .0 the way the recording shows it", () => {
    expect(fmtPercentTotal(100)).toBe("100");
    expect(fmtPercentTotal(100.04)).toBe("100");
    expect(fmtPercentTotal(99.94)).toBe("99.9");
    expect(fmtPercentTotal(0)).toBe("0");
  });
});

/* ══════════════════════════════════════════════════════════ permission guards ═══ */

/**
 * Mirrors `UT-GRIDOP-027` on the Grid Operator screen. Every write path on this screen
 * previously issued its requests with no permission check at all — the only gate was the
 * command bar's `disabled` prop, which is a UI convenience and not an authorisation
 * boundary. `canEdit` is `useProjectContext().canEdit`, i.e. the server's own answer; the
 * refusal happens before anything is issued, which is why these cases can assert against
 * real repos without a transport mock: nothing reaches one.
 */
describe("UT-PROD permission guards", () => {
  const savePayload = (canEdit: boolean): SaveYieldPayload => ({
    project: project(),
    canEdit,
    technology: "WTG",
    existing: null,
    description: "Internal WTG 2028",
    assessment: CHOICE_PRODUCTION.yieldAssessment.internal,
    allocation: "Whole plant",
    modes: {
      allocationInput: "Input Gross Yield",
      lossesInput: "Input losses",
      uncertaintyInput: "Input Uncertainty",
    },
    input: {
      grossYield: 50_000, netP50: 45_000, netP75: 42_000, netP90: 40_000,
      totalLosses: 10, uncertainty: 8, windSpeed: 7, irradiation: null,
    },
    turbineCount: 5,
    considerSeasonality: false,
    considerNegativePrices: false,
    seasonality: [],
    seasonalityRecordId: null,
    negativePrices: [],
    storedNegativePrices: [],
    allYields: [],
    revenues: [],
  });

  const rowPayload = (canEdit: boolean): DeleteYieldPayload => ({
    project: project(),
    canEdit,
    row: yieldRow(),
    allYields: [yieldRow()],
    revenues: [],
  });

  const recalcPayload = (canEdit: boolean): RecalculatePayload => ({
    project: project(),
    canEdit,
    activeWtg: [],
    activePv: [],
    generators: [],
    oAndMSubaccountId: null,
    oAndMSubaccountName: "Operation & Maintenance",
  });

  it("UT-PROD-076 a yield save without permission is refused before any request", async () => {
    const res = await saveEnergyYield(savePayload(false));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.status).toBe(403);
      expect(res.error.kind).toBe("permission");
      expect(res.error.source).toBe("production/saveYield");
    }
  });

  it("UT-PROD-077 a yield delete without permission is refused before any request", async () => {
    const res = await deleteEnergyYield(rowPayload(false));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.status).toBe(403);
      expect(res.error.source).toBe("production/deleteYield");
    }
  });

  it("UT-PROD-078 an activate/deactivate without permission is refused before any request", async () => {
    for (const nextStatus of [0, 1] as const) {
      const res = await setYieldStatus({ ...rowPayload(false), nextStatus });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.status).toBe(403);
        expect(res.error.source).toBe("production/setYieldStatus");
      }
    }
  });

  it("UT-PROD-079 the project recalculation without permission is refused before any request", async () => {
    // This is the one that mattered most: it writes the yield roll-up onto `Projects`,
    // generates the standard land-lease and O&M contracts, and sets the four CAPEX
    // recalculation flags.
    const res = await recalculateProject(recalcPayload(false));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.status).toBe(403);
      expect(res.error.source).toBe("production/recalculate");
    }
  });

  it("UT-PROD-080 every mutation path carries the guard — none is reachable without canEdit", async () => {
    // The regression case: a new write path that forgets `editDenial` fails here.
    const refusals = await Promise.all([
      saveEnergyYield(savePayload(false)),
      deleteEnergyYield(rowPayload(false)),
      setYieldStatus({ ...rowPayload(false), nextStatus: 1 }),
      recalculateProject(recalcPayload(false)),
    ]);
    expect(refusals.map((r) => r.ok)).toEqual([false, false, false, false]);
    for (const r of refusals) {
      if (!r.ok) expect(r.error.message).toBe("You do not have permission to edit this project.");
    }
  });

  it("UT-PROD-081 the guard passes a permitted user through to the write path", () => {
    // Asserted at the type/decision level rather than by issuing requests: the guard is the
    // only thing between the payload and the repos, and `canEdit: true` clears it.
    expect(editDenial(true, "production/saveYield")).toBeNull();
    expect(editDenial(false, "production/saveYield")?.status).toBe(403);
  });
});
