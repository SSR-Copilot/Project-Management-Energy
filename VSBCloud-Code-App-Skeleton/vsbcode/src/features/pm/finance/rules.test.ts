/**
 * Project Finance Screen — unit tests.
 *
 * IDs are the spec's (`UT-FIN-nnn`). Band XL, weighted to Calculation, because every
 * number on this screen sizes debt.
 *
 * COVERAGE. This block used to carry two id lists headed "cases the spec lists that are
 * NOT here". They read as coverage and were not: five of the fifteen ids they named sit on
 * no `it()` in this repo at all, and the other ten do have their own case below — so the
 * lists are gone rather than patched. What is true, without an id list to misread:
 *  - The pure cores of the Integration / Error cases are pinned here under their own ids —
 *    `sliceDebtAssumptions`, `planSeeds` and its idempotence, `totalDevexCapex`,
 *    `trancheDeletePlan`. The HTTP wiring in `hooks.ts` has no test.
 *  - The predicates behind the Rendering / Binding cases are tested directly:
 *    `MSG.vatPreliminary`, `bankDisplayName`, `trancheDisplayName`, `formatUpfrontFee`,
 *    `fieldDefault` / `baseRateDefault`. No case here renders a component.
 */
import { describe, it, expect } from "vitest";
import { CHOICE_FINANCE } from "@/data/entities";
import {
  CATEGORY_ORDER, buildCategoryMap, sliceDebtAssumptions, DEBT_TYPES,
  debtText, debtValue, debtPercent, DEBT_CATEGORY, DSRA_CATEGORY, DECOMMISSIONING_CATEGORY,
  decodeDrawdown, decodeCommitmentFee, decodeEnergyYieldDebtSizing, decodeRepaymentProfile,
  decodeSpotCurve, decodeBaseRate, decodeDsraBaseRate, decodeCostType, decodeDsraType,
  swapRateForYear, SWAP_RATE_LAST_YEAR,
  buildSeniorDebtStandard, financialClose, buildDsraStandard, marginDsraCanvasParity,
  buildDecommissioningStandard,
  parseStandardFlags, serialiseStandardFlags,
  DEFAULT_DECOMMISSIONING_FLAGS, DEFAULT_DSRA_FLAGS, DEFAULT_SENIOR_DEBT_FLAGS,
  totalDevexCapex, shareholderLoan, freeEquityLabel, freeEquityCap, validateFreeEquity,
  applyFinancingOptionCascade, toggleTrancheStatus, toggleDsraStatus,
  financingOptionOnVisit, unconditionalDebtFinancingCanvasParity,
  buildUniqueKey, isDuplicateTranche, standardAssumptionConflict,
  parseDscr, formatDscr, validateDscr,
  regenerateRepaymentYears, repaymentDiff, validateRepaymentAmount,
  stepUpToStorage, stepUpFromStorage, stepUpScheduleValid, stepUpYearOptions,
  stepUpAddEnabled, stepUpRemoveEnabled, validateStepUpMargin, stepUpWrites,
  defaultEndOfDebtServiceSavings, validateEndOfDebtServiceSavings,
  packMMYY, unpackMMYY, padMMYY, mmyyLabel, yearMonthLabel, dsrfOnlyFields, validateDsraMargin,
  totalDecommissioningCost, endDateOfSaving, fmtDateDots, validateDecommissioningValue,
  validateCostOfGuarantee, validateVatBankMargin, validateVatFacilityAmount, canSaveVatFinancing,
  validateRateField, validateHedging, validateUpfrontFee, validateFixedAmount,
  validateYearMonthPair, validateTenorAgainstRepaymentStart, canSaveSeniorDebtTranche,
  seniorDebtCommandBar, categoryCommandBar,
  bankDisplayName, OTHER_BANK_SENTINEL, trancheDisplayName, formatUpfrontFee,
  fieldDefault, baseRateDefault, planSeeds, resetOnTrancheStatusChange, trancheDeletePlan,
  trancheStatusOptionDisabled, TRANCHE_FORM_LABEL, baseRateOptions, BASE_RATE_OPTION_LABEL,
  isPageLocked, MSG,
  type DebtAssumptionRow, type FinanceProject, type FinancingCategory,
  type SeniorDebtFormState, type StepUpRow, type RepaymentRow, type TrancheRow,
  type FinancingInputStatus, type DecommissioningFlags,
} from "./rules";

/* ═══════════════════════════════════════════════════════════════════ fixtures ═══ */

const d = (s: string) => new Date(`${s}T00:00:00`);

const project = (over: Partial<FinanceProject> = {}): FinanceProject => ({
  id: "P1",
  projectIdText: "DE-0001",
  projectName: "Windpark Nord",
  countryName: "Germany",
  countryCode: "DE",
  technology: "Wind",
  areaName: null,
  cod: d("2028-01-01"),
  fid: d("2026-06-30"),
  construction: d("2027-03-01"),
  legallyBindingPermits: d("2026-01-15"),
  applicationSubmitted: d("2025-05-01"),
  projectDevelopmentStarted: d("2024-02-01"),
  feasibilityStudies: d("2023-01-01"),
  netYieldP50: 120_000,
  totalCapacity: 50,
  endDate: d("2055-12-31"),
  clusterStateName: "Cluster 4",
  owningBusinessUnitId: "bu-1",
  financingOptions: null,
  ...over,
});

const r = (
  debttype: string, category: string, wind: string | null, pv: string | null,
): DebtAssumptionRow => ({ country: "Germany", debttype, category, wind, pv });

const debtRows: DebtAssumptionRow[] = [
  r("debt facility", DEBT_CATEGORY.bankMarginConstruction, "0.0185", "0.0150"),
  r("debt facility", DEBT_CATEGORY.bankMarginOperation, "0.0165", "0.0140"),
  r("debt facility", DEBT_CATEGORY.swapRate2025, "0.0250", "0.0250"),
  r("debt facility", DEBT_CATEGORY.swapRate2026, "0.0260", "0.0260"),
  r("debt facility", DEBT_CATEGORY.swapRate2027, "0.0270", "0.0270"),
  r("debt facility", DEBT_CATEGORY.swapRate2028, "0.0280", "0.0280"),
  r("debt facility", DEBT_CATEGORY.swapRate2029, "0.0290", "0.0290"),
  r("debt facility", DEBT_CATEGORY.swapRate2030, "0.0300", "0.0300"),
  r("debt facility", DEBT_CATEGORY.loanTenor, "18", "15"),
  r("debt facility", DEBT_CATEGORY.commitmentFeeDefault, "percentage_margin", "percentage"),
  r("debt facility", DEBT_CATEGORY.upFrontFee, "0.0125", "0.0100"),
  r("debt facility", DEBT_CATEGORY.hedging, "0.85", "0.80"),
  r("debt facility", DEBT_CATEGORY.maxGearing, "80", "75"),
  r("debt facility", DEBT_CATEGORY.drawdown, "equity_first", "pro_rata"),
  r("debt facility", DEBT_CATEGORY.repaymentFreq, "2", "2"),
  r("debt facility", DEBT_CATEGORY.fixedInterestRateTime, "120", "120"),
  r("debt facility", DEBT_CATEGORY.commitmentFeeFreePeriod, "6", "6"),
  r("debt facility", DEBT_CATEGORY.commitmentFee, "0.35", "0.35"),
  r("debt facility", DEBT_CATEGORY.commitmentFeePercentageOfMargin, "0.35", "0.35"),
  r("debt facility", DEBT_CATEGORY.repaymentStartAfterCod, "6", "6"),
  r("debt facility", DEBT_CATEGORY.repaymentProfile, "dscr_sculped", "straight_line"),
  r("debt facility", DEBT_CATEGORY.monthsFromCluster5ToFc, "-3", "-3"),
  r("debt facility", DEBT_CATEGORY.baserate, "EURIBOR 6M", "EURIBOR 3M"),
  r("debt facility", DEBT_CATEGORY.spotCurveDebtSizing, "low_curve", "central_curve"),
  r("debt facility", DEBT_CATEGORY.energyYieldDebtSizing, "p90", "p50"),
  r("DSCR", DEBT_CATEGORY.dscrContracted, "1.15", "1.20"),
  r("DSCR", DEBT_CATEGORY.dscrUncontracted, "1.35", "1.40"),
];

const dsraRows: DebtAssumptionRow[] = [
  r("DSRA_DSRF", DSRA_CATEGORY.defaultType, "dsrf", "dsra"),
  r("DSRA_DSRF", DSRA_CATEGORY.marginDsrf, "0.0125", "0.0125"),
  r("DSRA_DSRF", DSRA_CATEGORY.commitmentFee, "0.0035", "0.0035"),
  r("DSRA_DSRF", DSRA_CATEGORY.baseRateDsra, "EURIBOR 6M", "SONIA 3M"),
  r("DSRA_DSRF", DSRA_CATEGORY.baseRateDsrf, "WIBOR 3M", "EURIBOR 3M"),
  r("DSRA_DSRF", DSRA_CATEGORY.durationOfFutureDebtService, "6", "6"),
  r("DSRA_DSRF", DSRA_CATEGORY.commitmentFeeFreePeriod, "2", "2"),
  r("DSRA_DSRF", DSRA_CATEGORY.upFrontFee, "0.0050", "0.0050"),
  r("DSRA_DSRF", DSRA_CATEGORY.percentageOfFutureDebtService, "1.0", "1.0"),
];

const decRows: DebtAssumptionRow[] = [
  r("decommissioning costs", DECOMMISSIONING_CATEGORY.amountPerTurbine, "60000", "0"),
  r("decommissioning costs", DECOMMISSIONING_CATEGORY.amountTotal, "800000", "500000"),
  r("decommissioning costs", DECOMMISSIONING_CATEGORY.baseRateSavings, "EURIBOR 3M", "EURIBOR 3M"),
  r("decommissioning costs", DECOMMISSIONING_CATEGORY.costType, "total", "per_turbine"),
  r("decommissioning costs", DECOMMISSIONING_CATEGORY.durationSaving, "15", "15"),
  r("decommissioning costs", DECOMMISSIONING_CATEGORY.guaranteeCosts, "0.012", "0.012"),
  r("decommissioning costs", DECOMMISSIONING_CATEGORY.guaranteeForLandOwners, "yes", "no"),
  r("decommissioning costs", DECOMMISSIONING_CATEGORY.marginSavings, "0.5", "0.5"),
];

const categories: FinancingCategory[] = [
  { id: "c1", name: "Equity", order: 1 },
  { id: "c2", name: "VAT-Financing", order: 2 },
  { id: "c3", name: "Senior Debt", order: 3 },
  { id: "c4", name: "DSRA/DSRF", order: 4 },
  { id: "c5", name: "Decommissioning", order: 5 },
  { id: "c6", name: "Cash Sweep", order: 6 },
];

const stdAt = (year: number) =>
  buildSeniorDebtStandard(debtRows, "wind", project(), { today: d(`${year}-06-01`) });

const stepUp = (id: number, durationYY: number | null, margin: string): StepUpRow =>
  ({ id, durationYY, margin, valid: true });

const seniorForm = (over: Partial<SeniorDebtFormState> = {}): SeniorDebtFormState => ({
  formDirty: true, isSaving: false, trancheId: null,
  trancheStatus: CHOICE_FINANCE.trancheStatus.termSheet,
  bankId: "B7", bankName: "NordLB", otherBankName: "", kfwEnabled: false, kfwValue: null,
  financialClose: d("2026-12-01"), tenorYears: 15, tenorMonths: 0,
  drawdown: CHOICE_FINANCE.drawdown.proRata, gearing: CHOICE_FINANCE.gearing.debtSizing,
  fixedAmountOption: CHOICE_FINANCE.fixedAmount.percentOfCapex, fixedAmountValue: "",
  repaymentProfile: CHOICE_FINANCE.repaymentProfile.straightLine,
  startRepaymentYears: 1, startRepaymentMonths: 0, frequencyOfRepayment: 2,
  hedging: "85.0", upfrontFeeOption: CHOICE_FINANCE.upfrontFee.percentageOfDebt,
  upfrontFeeValue: "1.25",
  commitmentFeeOption: CHOICE_FINANCE.commitmentFee.percentageOfMargin,
  commitmentFeeValue: "0.35", commitmentFeePeriodYears: 1, commitmentFeePeriodMonths: 0,
  swapMargin: "0.10",
  bankMarginConstruction: "1.85", bankMarginOperational: "1.65",
  fixedInterestRateYears: 10, fixedInterestRateMonths: 0,
  swapAfterFixedPeriod: false, bankRate: "",
  baseRate: CHOICE_FINANCE.baseRate.euribor3M, swapRate: "",
  dscrContracted: "1.15x", dscrUncontracted: "1.35x",
  stepUpEnabled: false, stepUpRows: [], repaymentRows: [],
  country: "Germany", otherTranches: [], projectId: "P1",
  ...over,
});

/* ══════════════════════════════════════════════════════════ categories/slices ══ */

describe("categories and assumption slices", () => {
  it("UT-FIN-001 categories are keyed by Order, not by name", () => {
    const map = buildCategoryMap(categories);
    expect(map.equity?.order).toBe(1);
    expect(map.vatFinancing?.order).toBe(2);
    expect(map.seniorDebt?.order).toBe(3);
    expect(map.dsraDsrf?.order).toBe(4);
    expect(map.decommissioning?.order).toBe(5);
    expect(map.cashSweep?.order).toBe(6);
    expect(CATEGORY_ORDER.dsraDsrf).toBe(4);
    expect(CATEGORY_ORDER.decommissioning).toBe(5);
  });

  it("a shuffled category list still maps by order", () => {
    const map = buildCategoryMap([...categories].reverse());
    expect(map.equity?.id).toBe("c1");
    expect(map.seniorDebt?.id).toBe("c3");
  });

  it("UT-FIN-002 debt assumptions are sliced by debttype", () => {
    const all = [...debtRows, ...dsraRows, ...decRows];
    const s = sliceDebtAssumptions(all);
    expect(s.debt.every((x) => DEBT_TYPES.debt.includes(x.debttype as never))).toBe(true);
    expect(s.debt).toHaveLength(debtRows.length);
    expect(s.decommissioning).toHaveLength(decRows.length);
    expect(s.dsra).toHaveLength(dsraRows.length);
  });

  it("UT-FIN-003 the technology selects the assumption column", () => {
    expect(debtValue(debtRows, DEBT_CATEGORY.loanTenor, "wind")).toBe(18);
    expect(debtValue(debtRows, DEBT_CATEGORY.loanTenor, "pv")).toBe(15);
    expect(debtText(debtRows, DEBT_CATEGORY.loanTenor, "other")).toBeNull();
  });

  it("UT-FIN-004 percentage assumptions are scaled by 100", () => {
    expect(debtPercent(debtRows, DEBT_CATEGORY.bankMarginConstruction, "wind")).toBeCloseTo(1.85, 10);
    expect(stdAt(2027).bankMarginConstruction).toBeCloseTo(1.85, 10);
    expect(stdAt(2027).bankMarginOperation).toBeCloseTo(1.65, 10);
  });

  it("UT-FIN-005 comma-decimal assumption values parse in a non-English locale", () => {
    const s = buildSeniorDebtStandard(debtRows, "wind", project(), {
      today: d("2027-06-01"), language: "de-DE",
    });
    expect(Number.isNaN(s.hedging)).toBe(false);
    expect(s.hedging).toBeCloseTo(85, 10);
  });

  it("a missing percent row stays NaN before the seed floors it, never a silent 0", () => {
    expect(Number.isNaN(debtPercent([], DEBT_CATEGORY.hedging, "wind"))).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════ senior debt standard ══ */

describe("senior-debt standard assumption (rules 3–6)", () => {
  it("UT-FIN-006 financial close = cluster-5 date + months offset", () => {
    expect(financialClose(d("2027-03-01"), -3)).toEqual(d("2026-12-01"));
    expect(stdAt(2027).financialClose).toEqual(d("2026-12-01"));
    expect(financialClose(null, -3)).toBeNull();
  });

  it("UT-FIN-007 the swap rate is selected by the current year", () => {
    expect(stdAt(2027).swapRate).toBeCloseTo(2.7, 10);
    expect(stdAt(2025).swapRate).toBeCloseTo(2.5, 10);
    expect(stdAt(2030).swapRate).toBeCloseTo(3.0, 10);
  });

  it("UT-FIN-008 SOURCE DEFECT: the swap rate has no fallback beyond 2030", () => {
    expect(SWAP_RATE_LAST_YEAR).toBe(2030);
    expect(swapRateForYear(debtRows, "wind", 2031)).toBeNull();
    expect(swapRateForYear(debtRows, "wind", 2024)).toBeNull();
    expect(stdAt(2031).swapRate).toBeNull();
  });

  it("UT-FIN-009 enum decoding from SQL strings", () => {
    const s = stdAt(2027);
    expect(s.drawdown).toBe(CHOICE_FINANCE.drawdown.equityFirst);
    expect(s.repaymentProfile).toBe(CHOICE_FINANCE.repaymentProfile.dscrSculpted);
    expect(s.spotCurveDebtSizing).toBe(CHOICE_FINANCE.spotCurve.lowCurve);
    expect(s.energyYieldDebtSizing).toBe(CHOICE_FINANCE.energyYieldDebtSizing.p90);
    expect(s.commitmentFeeDefault).toBe(CHOICE_FINANCE.commitmentFee.percentageOfMargin);
  });

  it("UT-FIN-010 unknown enum strings take the documented default", () => {
    expect(decodeDrawdown("whatever")).toBe(CHOICE_FINANCE.drawdown.proRata);
    expect(decodeSpotCurve("whatever")).toBe(CHOICE_FINANCE.spotCurve.averageLowCentralCurve);
    expect(decodeCommitmentFee("whatever")).toBe(CHOICE_FINANCE.commitmentFee.percentage);
    expect(decodeCostType("whatever")).toBe(CHOICE_FINANCE.costsOfDecommissioning.perTurbine);
    expect(decodeDsraType("whatever")).toBe(CHOICE_FINANCE.dsraDsrfType.dsra);
    // These two Switches have NO default arm in the canvas — blank, not a fallback.
    expect(decodeEnergyYieldDebtSizing("whatever")).toBeNull();
    expect(decodeRepaymentProfile("whatever")).toBeNull();
  });

  it("UT-FIN-011 the base rate matches case-insensitively", () => {
    expect(decodeBaseRate("EURIBOR 6M")).toBe(CHOICE_FINANCE.baseRate.euribor6M);
    expect(decodeBaseRate("wibor 3m")).toBe(CHOICE_FINANCE.baseRate.wibor3M);
    expect(decodeBaseRate("SONIA 3M")).toBeNull();
    expect(stdAt(2027).baserate).toBe(CHOICE_FINANCE.baseRate.euribor6M);
  });

  it("the 27-field record carries every category the canvas looks up", () => {
    const s = stdAt(2027);
    expect(s.loanTenor).toBe(18);
    expect(s.maxGearing).toBe(80);
    expect(s.repaymentFreq).toBe(2);
    expect(s.fixedInterestRateTime).toBe(120);
    expect(s.commitmentFeeFreePeriod).toBe(6);
    expect(s.repaymentStartAfterCod).toBe(6);
    expect(s.monthsFromCluster5ToFc).toBe(-3);
    expect(s.upFrontFee).toBeCloseTo(1.25, 10);
    expect(s.commitmentFeePercentageOfMargin).toBeCloseTo(35, 10);
    // DSCRs are locale-parsed but NOT scaled by 100.
    expect(s.dscrContracted).toBeCloseTo(1.15, 10);
    expect(s.dscrUncontracted).toBeCloseTo(1.35, 10);
  });
});

/* ══════════════════════════════════════════════════════════════ DSRA / DSRF ════ */

describe("DSRA/DSRF standard assumption (rule 7)", () => {
  it("UT-FIN-012 the DSRA base rate falls back to Euribor 3M", () => {
    expect(decodeDsraBaseRate("SONIA 3M")).toBe(CHOICE_FINANCE.baseRate.euribor3M);
    expect(buildDsraStandard(dsraRows, "pv").baseRateDsra).toBe(CHOICE_FINANCE.baseRate.euribor3M);
    expect(buildDsraStandard(dsraRows, "wind").baseRateDsra).toBe(CHOICE_FINANCE.baseRate.euribor6M);
  });

  it("SOURCE DEFECT: MarginDSRA reads the DSRF category in the canvas", () => {
    // No `"margin dsra"` row exists anywhere, so the corrected reader falls back to the
    // DSRF value and matches the shipped result exactly.
    expect(marginDsraCanvasParity(dsraRows, "wind")).toBeCloseTo(1.25, 10);
    expect(buildDsraStandard(dsraRows, "wind").marginDsra).toBeCloseTo(1.25, 10);
    // Once a real DSRA row exists the two diverge — and DSRA may be negative, DSRF not.
    const withDsra = [...dsraRows, r("DSRA_DSRF", DSRA_CATEGORY.marginDsra, "-0.0250", "-0.0250")];
    expect(buildDsraStandard(withDsra, "wind").marginDsra).toBeCloseTo(-2.5, 10);
    expect(marginDsraCanvasParity(withDsra, "wind")).toBeCloseTo(1.25, 10);
    expect(buildDsraStandard(withDsra, "wind", { canvasParityMarginDsra: true }).marginDsra)
      .toBeCloseTo(1.25, 10);
  });

  it("percent-typed DSRA fields are scaled by 100 and the duration stays a string", () => {
    const s = buildDsraStandard(dsraRows, "wind");
    expect(s.type).toBe(CHOICE_FINANCE.dsraDsrfType.dsrf);
    expect(s.commitmentFee).toBeCloseTo(0.35, 10);
    expect(s.upFrontFee).toBeCloseTo(0.5, 10);
    expect(s.percentageOfFutureDebtService).toBeCloseTo(100, 10);
    expect(s.durationOfFutureDebtService).toBe("6");
    expect(s.commitmentFeeFreePeriod).toBe(2);
  });

  it("UT-FIN-018 / UT-FIN-076 DSRF-only fields are nulled when the type is DSRA", () => {
    const values = {
      commitmentFeeValue: 0.35, commitmentFeePeriodYear: 2,
      commitmentFeePeriodMonth: 0, upfrontFeeValue: 0.5,
    };
    expect(dsrfOnlyFields(CHOICE_FINANCE.dsraDsrfType.dsrf, values)).toEqual(values);
    expect(dsrfOnlyFields(CHOICE_FINANCE.dsraDsrfType.dsra, values)).toEqual({
      commitmentFeeValue: null, commitmentFeePeriodYear: null,
      commitmentFeePeriodMonth: null, upfrontFeeValue: null,
    });
  });

  it("UT-FIN-075 the DSRA margin allows a negative value only for DSRA", () => {
    expect(validateDsraMargin("-2.5", CHOICE_FINANCE.dsraDsrfType.dsra).valid).toBe(true);
    expect(validateDsraMargin("-2.5", CHOICE_FINANCE.dsraDsrfType.dsrf).valid).toBe(false);
    expect(validateDsraMargin("10.5", CHOICE_FINANCE.dsraDsrfType.dsra).valid).toBe(false);
    expect(validateDsraMargin("1.255", CHOICE_FINANCE.dsraDsrfType.dsra).valid).toBe(false);
  });

  it("UT-FIN-071 end-of-savings default uses the longest ACTIVE tranche", () => {
    const end = defaultEndOfDebtServiceSavings(d("2028-01-01"), [
      { tenorYears: 15, tenorMonths: 0, status: CHOICE_FINANCE.status.active },
      { tenorYears: 18, tenorMonths: 6, status: CHOICE_FINANCE.status.inactive },
      { tenorYears: 16, tenorMonths: 3, status: CHOICE_FINANCE.status.active },
    ]);
    // 16y 3m = 195 months → 2044-04-01 − 1 day.
    expect(end).toEqual(d("2044-03-31"));
    expect(defaultEndOfDebtServiceSavings(null, [])).toBeNull();
    expect(defaultEndOfDebtServiceSavings(d("2028-01-01"), [])).toBeNull();
  });

  it("UT-FIN-072 end-of-savings may not precede COD", () => {
    expect(validateEndOfDebtServiceSavings(d("2027-12-31"), d("2028-01-01")))
      .toEqual({ valid: false, message: MSG.endOfSavingsBeforeCod });
    expect(validateEndOfDebtServiceSavings(d("2028-01-01"), d("2028-01-01")).valid).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════════ MMYY ══════ */

describe("MMYY packing (rule 29)", () => {
  it("UT-FIN-073 MMYY packing round-trips", () => {
    expect(packMMYY(6, 15)).toBe("0615");
    expect(unpackMMYY("0615")).toEqual({ months: 6, years: 15 });
    expect(unpackMMYY(packMMYY(11, 3))).toEqual({ months: 11, years: 3 });
  });

  it("the shared @/domain/dates encoding agrees for every real month", () => {
    for (let m = 1; m <= 12; m += 1) {
      for (const y of [0, 1, 9, 15, 99]) {
        expect(unpackMMYY(packMMYY(m, y))).toEqual({ months: m, years: y });
      }
    }
  });

  it("a zero-month duration has no date equivalent and is padded directly", () => {
    expect(packMMYY(0, 1)).toBe("0001");
    expect(unpackMMYY("0001")).toEqual({ months: 0, years: 1 });
  });

  it("UT-FIN-074 the MMYY label formats singular and plural", () => {
    expect(mmyyLabel("0115")).toBe("15 Years 1 Month");
    expect(mmyyLabel("0001")).toBe("1 Year 0 Months");
    expect(mmyyLabel(null)).toBe("0 Years 0 Months");
  });

  it("the seed zero-pads the raw SQL duration to four characters", () => {
    expect(padMMYY("6")).toBe("0006");
    expect(padMMYY("15")).toBe("0015");
    expect(padMMYY(null)).toBe("0000");
  });

  it("UT-FIN-035b the year/month label pads and pluralises, treating 0 as singular", () => {
    expect(yearMonthLabel(15, 6)).toBe("15 Years 06 Months");
    expect(yearMonthLabel(1, 1)).toBe("01 Year 01 Month");
    expect(yearMonthLabel(0, 0)).toBe("00 Year 00 Month");
  });
});

/* ════════════════════════════════════════════════════════════ decommissioning ══ */

describe("decommissioning (rules 8, 30, 31)", () => {
  it("UT-FIN-019 the seed picks total vs per-turbine", () => {
    const s = buildDecommissioningStandard(decRows, "wind", project());
    expect(s.costType).toBe(CHOICE_FINANCE.costsOfDecommissioning.total);
    expect(s.amountTotal).toBe(800_000);
    const pv = buildDecommissioningStandard(decRows, "pv", project());
    expect(pv.costType).toBe(CHOICE_FINANCE.costsOfDecommissioning.perTurbine);
    expect(pv.amountPerTurbine).toBe(0);
  });

  it("the decommissioning record carries the three project dates and the 00-prefixed duration", () => {
    const s = buildDecommissioningStandard(decRows, "wind", project());
    expect(s.dateIssue).toEqual(d("2027-03-01"));
    expect(s.expiry).toEqual(d("2055-12-31"));
    expect(s.startSaving).toEqual(d("2028-01-01"));
    expect(s.durationSaving).toBe("0015");
    expect(s.guaranteeCosts).toBeCloseTo(1.2, 10);
  });

  it("UT-FIN-077 the per-turbine cost multiplies by the active turbine count", () => {
    expect(totalDecommissioningCost(
      CHOICE_FINANCE.costsOfDecommissioning.perTurbine, 60_000, 12,
    )).toBe(720_000);
  });

  it("UT-FIN-078 a total cost is used as-is", () => {
    expect(totalDecommissioningCost(
      CHOICE_FINANCE.costsOfDecommissioning.total, 800_000, 12,
    )).toBe(800_000);
  });

  it("UT-FIN-102 no turbines and no value yields 0, not NaN", () => {
    expect(totalDecommissioningCost(
      CHOICE_FINANCE.costsOfDecommissioning.perTurbine, null, 0,
    )).toBe(0);
  });

  it("UT-FIN-079 the cost cap depends on mode and country", () => {
    const total = CHOICE_FINANCE.costsOfDecommissioning.total;
    const per = CHOICE_FINANCE.costsOfDecommissioning.perTurbine;
    expect(validateDecommissioningValue("12000000", total, "Germany").valid).toBe(false);
    expect(validateDecommissioningValue("900000", per, "Germany").valid).toBe(true);
    expect(validateDecommissioningValue("12000000", total, "Poland").valid).toBe(true);
    expect(validateDecommissioningValue("1200.5", total, "Poland").valid).toBe(false);
  });

  it("UT-FIN-080 the end date of saving = start + months + years − 1 day", () => {
    const end = endDateOfSaving(d("2028-01-01"), 6, 15);
    expect(end).toEqual(d("2043-06-30"));
    expect(fmtDateDots(end)).toBe("30.06.2043");
    expect(endDateOfSaving(null, 6, 15)).toBeNull();
  });

  it("the cost of guarantee is one decimal, 0…9.9", () => {
    expect(validateCostOfGuarantee("1.2").valid).toBe(true);
    expect(validateCostOfGuarantee("9.9").valid).toBe(true);
    expect(validateCostOfGuarantee("10").valid).toBe(false);
    expect(validateCostOfGuarantee("1.25").valid).toBe(false);
  });
});

/* ═════════════════════════════════════════════════════════════ standard flags ══ */

describe("JSON standardness blobs (rule 11)", () => {
  it("UT-FIN-021 standard flags round-trip through JSON with exact key names", () => {
    const json = serialiseStandardFlags(DEFAULT_DECOMMISSIONING_FLAGS);
    const parsed = parseStandardFlags(json, DEFAULT_DECOMMISSIONING_FLAGS);
    expect(parsed).toEqual(DEFAULT_DECOMMISSIONING_FLAGS);
    const mutated: DecommissioningFlags = { ...parsed, CostofGuarantee: false };
    const again = parseStandardFlags(serialiseStandardFlags(mutated), DEFAULT_DECOMMISSIONING_FLAGS);
    expect(again.CostofGuarantee).toBe(false);
    expect(again.CostsofDecommissioningValue).toBe(true);
    expect(Object.keys(again).sort()).toEqual(Object.keys(DEFAULT_DECOMMISSIONING_FLAGS).sort());
  });

  it("the blob is written as a single-element ARRAY, as JSON(Table({…})) produces", () => {
    expect(serialiseStandardFlags(DEFAULT_SENIOR_DEBT_FLAGS)).toBe('[{"FinancialCloseDate":true}]');
  });

  it("UT-FIN-022 missing or malformed JSON yields all-false flags without throwing", () => {
    expect(parseStandardFlags(null, DEFAULT_DSRA_FLAGS).locIsStandardType).toBe(false);
    expect(() => parseStandardFlags("{", DEFAULT_DSRA_FLAGS)).not.toThrow();
    const broken = parseStandardFlags("{", DEFAULT_DSRA_FLAGS);
    expect(Object.values(broken).every((v) => v === false)).toBe(true);
    expect(Object.keys(broken)).toHaveLength(9);
  });

  it("Boolean() coercion accepts the string and numeric truthies the canvas would", () => {
    const parsed = parseStandardFlags(
      '[{"FinancialCloseDate":"true"}]', DEFAULT_SENIOR_DEBT_FLAGS,
    );
    expect(parsed.FinancialCloseDate).toBe(true);
  });
});

/* ═════════════════════════════════════════════════════════════════════ equity ══ */

describe("equity and CAPEX (rules 12–14)", () => {
  it("UT-FIN-023 total DEVEX/CAPEX sums the project's contracts only", () => {
    const costs = [
      { contractId: "a1", cost: 100 }, { contractId: "a2", cost: 250 },
      { contractId: "b1", cost: 999 },
    ];
    expect(totalDevexCapex(["a1", "a2"], costs)).toBe(350);
  });

  it("UT-FIN-024 total CAPEX is 0 when the project has no contracts", () => {
    expect(totalDevexCapex([], [{ contractId: "a1", cost: 100 }])).toBe(0);
  });

  it("UT-FIN-025 shareholder loan in percentage mode", () => {
    expect(shareholderLoan("percentage", "12.5", 0)).toBe(87.5);
  });

  it("UT-FIN-026 shareholder loan in fixed mode", () => {
    expect(shareholderLoan("fixed", "4000000", 10_000_000)).toBe(6_000_000);
  });

  it("UT-FIN-027 shareholder loan floors at zero", () => {
    expect(shareholderLoan("fixed", "12000000", 10_000_000)).toBe(0);
  });

  it("UT-FIN-028 invalid free equity falls back to total CAPEX", () => {
    expect(shareholderLoan("fixed", "abc", 10_000_000)).toBe(10_000_000);
  });

  it("UT-FIN-029 the fixed cap is country-specific", () => {
    expect(freeEquityCap("Poland")).toBe(500_000_000);
    expect(freeEquityCap("Germany")).toBe(100_000_000);
    expect(validateFreeEquity("400000000", "fixed", "Poland", 900_000_000).valid).toBe(true);
    expect(validateFreeEquity("400000000", "fixed", "Germany", 900_000_000).valid).toBe(false);
  });

  it("UT-FIN-030 free equity may not exceed total CAPEX", () => {
    expect(validateFreeEquity("6000000", "fixed", "Germany", 5_000_000))
      .toEqual({ valid: false, message: MSG.freeEquityAboveCapex });
  });

  it("UT-FIN-031 the percentage mode accepts two decimals only", () => {
    expect(validateFreeEquity("12.5", "percentage", "Germany", 0).valid).toBe(true);
    expect(validateFreeEquity("12.55", "percentage", "Germany", 0).valid).toBe(true);
    expect(validateFreeEquity("12.555", "percentage", "Germany", 0).valid).toBe(false);
    expect(validateFreeEquity("120", "percentage", "Germany", 0).valid).toBe(false);
  });

  it("the unit label switches on mode and country", () => {
    expect(freeEquityLabel("percentage", "Poland")).toBe("[%]");
    expect(freeEquityLabel("fixed", "Poland")).toBe("[PLN]");
    expect(freeEquityLabel("fixed", "Germany")).toBe("[EUR]");
  });
});

/* ═══════════════════════════════════════════════════════════════ status cascade ═ */

describe("financing-option cascade (rules 15–16)", () => {
  const inputs: FinancingInputStatus[] = [
    {
      id: "vat", categoryOrder: 2, status: CHOICE_FINANCE.status.active,
      trackStatusActive: null, isDeactivatedByButton: CHOICE_FINANCE.yesNo.no,
      dsraOriginalStatusActive: null,
    },
    {
      id: "sdX", categoryOrder: 3, status: CHOICE_FINANCE.status.active,
      trackStatusActive: CHOICE_FINANCE.yesNo.no, isDeactivatedByButton: null,
      dsraOriginalStatusActive: null,
    },
    {
      id: "sdY", categoryOrder: 3, status: CHOICE_FINANCE.status.inactive,
      trackStatusActive: CHOICE_FINANCE.yesNo.yes, isDeactivatedByButton: null,
      dsraOriginalStatusActive: null,
    },
    {
      id: "dsra", categoryOrder: 4, status: CHOICE_FINANCE.status.active,
      trackStatusActive: null, isDeactivatedByButton: null,
      dsraOriginalStatusActive: CHOICE_FINANCE.dsraOriginalStatusActive.yes,
    },
  ];

  it("UT-FIN-032 switching to All Equity deactivates every debt input", () => {
    const out = applyFinancingOptionCascade(inputs, CHOICE_FINANCE.financingOptions.allEquity);
    expect(out.every((o) => o.status === CHOICE_FINANCE.status.inactive)).toBe(true);
    expect(out.map((o) => o.id)).toEqual(["vat", "sdX", "sdY", "dsra"]);
  });

  it("UT-FIN-033 switching back to Debt Financing restores the remembered statuses", () => {
    const out = applyFinancingOptionCascade(inputs, CHOICE_FINANCE.financingOptions.debtFinancing);
    const by = Object.fromEntries(out.map((o) => [o.id, o.status]));
    expect(by.sdX).toBe(CHOICE_FINANCE.status.inactive);
    expect(by.sdY).toBe(CHOICE_FINANCE.status.active);
    expect(by.dsra).toBe(CHOICE_FINANCE.status.active);
  });

  it("UT-FIN-034 a VAT input deactivated by button is not re-activated by the option switch", () => {
    const withFlag = inputs.map((i) =>
      i.id === "vat"
        ? { ...i, isDeactivatedByButton: CHOICE_FINANCE.yesNo.yes, status: CHOICE_FINANCE.status.inactive }
        : i);
    const out = applyFinancingOptionCascade(withFlag, CHOICE_FINANCE.financingOptions.debtFinancing);
    expect(out.find((o) => o.id === "vat")).toBeUndefined();
  });

  it("UT-FIN-035 a manual deactivate records the memory flags", () => {
    expect(toggleTrancheStatus({ status: CHOICE_FINANCE.status.active })).toEqual({
      status: CHOICE_FINANCE.status.inactive,
      trackStatusActive: CHOICE_FINANCE.yesNo.yes,
      isDeactivatedByButton: CHOICE_FINANCE.yesNo.yes,
    });
    expect(toggleTrancheStatus({ status: CHOICE_FINANCE.status.inactive })).toEqual({
      status: CHOICE_FINANCE.status.active,
      trackStatusActive: CHOICE_FINANCE.yesNo.no,
    });
  });

  it("the DSRA equivalent uses its own 952850000-band memory column", () => {
    expect(toggleDsraStatus({ status: CHOICE_FINANCE.status.active }).dsraOriginalStatusActive)
      .toBe(CHOICE_FINANCE.dsraOriginalStatusActive.yes);
    expect(toggleDsraStatus({ status: CHOICE_FINANCE.status.inactive }).dsraOriginalStatusActive)
      .toBe(CHOICE_FINANCE.dsraOriginalStatusActive.no);
  });

  it("SOURCE DEFECT: OnVisible would overwrite All Equity on every visit; guarded", () => {
    expect(financingOptionOnVisit(null)).toBe(CHOICE_FINANCE.financingOptions.debtFinancing);
    expect(financingOptionOnVisit(CHOICE_FINANCE.financingOptions.allEquity)).toBeNull();
    expect(financingOptionOnVisit(CHOICE_FINANCE.financingOptions.debtFinancing)).toBeNull();
    // Canvas parity: unconditional, whatever the user chose.
    expect(unconditionalDebtFinancingCanvasParity())
      .toBe(CHOICE_FINANCE.financingOptions.debtFinancing);
  });
});

/* ═══════════════════════════════════════════════════════════════ tranche key ═══ */

describe("tranche identity (rules 17–18)", () => {
  it("UT-FIN-041 the unique key for the standard tranche", () => {
    expect(buildUniqueKey({
      projectId: "P1", statusLabel: "Standard Assumption", bankName: null, bankId: null,
      otherBankName: null, kfwEnabled: false, kfwValue: null,
    })).toBe("P1-SeniorDebt-StandardAssumption");
  });

  it("UT-FIN-042 the unique key for a term sheet with a known bank and no KfW", () => {
    expect(buildUniqueKey({
      projectId: "P1", statusLabel: "Term Sheet", bankName: "NordLB", bankId: "B7",
      otherBankName: null, kfwEnabled: false, kfwValue: null,
    })).toBe("P1-SeniorDebt-termsheet-bank-B7-nokfw");
  });

  it("UT-FIN-043 the unique key for the Other bank and a KfW tranche", () => {
    expect(buildUniqueKey({
      projectId: "P1", statusLabel: "Credit Agreement", bankName: "Other", bankId: "B0",
      otherBankName: " Landes Bank ", kfwEnabled: true, kfwValue: "10 / 2 / 10",
    })).toBe("P1-SeniorDebt-creditagreement-other-landesbank-kfw-10/2/10");
  });

  it("a KfW toggle with no value falls back to the blank sentinel", () => {
    expect(buildUniqueKey({
      projectId: "P1", statusLabel: "Term Sheet", bankName: "NordLB", bankId: "B7",
      otherBankName: null, kfwEnabled: true, kfwValue: null,
    })).toBe("P1-SeniorDebt-termsheet-bank-B7-kfw-blank");
  });

  it("UT-FIN-044 a duplicate tranche is detected before any write", () => {
    const existing = [{ id: "t1", uniqueKeyString: "P1-SeniorDebt-termsheet-bank-B7-nokfw" }];
    expect(isDuplicateTranche("P1-SeniorDebt-termsheet-bank-B7-nokfw", existing, null)).toBe(true);
    expect(MSG.duplicateTranche).toBe("Same senior debt tranche already exists for this project.");
  });

  it("UT-FIN-045 editing the tranche that owns the key is not a collision", () => {
    const existing = [{ id: "t1", uniqueKeyString: "P1-SeniorDebt-termsheet-bank-B7-nokfw" }];
    expect(isDuplicateTranche("P1-SeniorDebt-termsheet-bank-B7-nokfw", existing, "t1")).toBe(false);
  });

  it("UT-FIN-047 a second Standard Assumption tranche is blocked", () => {
    const tranches = [
      { id: "t1", trancheStatus: CHOICE_FINANCE.trancheStatus.standardAssumption },
      { id: "t2", trancheStatus: CHOICE_FINANCE.trancheStatus.termSheet },
    ];
    expect(standardAssumptionConflict(
      CHOICE_FINANCE.trancheStatus.standardAssumption, tranches, null,
    )).toBe(true);
    expect(standardAssumptionConflict(
      CHOICE_FINANCE.trancheStatus.standardAssumption, tranches, "t1",
    )).toBe(false);
    expect(standardAssumptionConflict(
      CHOICE_FINANCE.trancheStatus.termSheet, tranches, null,
    )).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════ DSCR ═══ */

describe("DSCR (rule 20)", () => {
  it("UT-FIN-048 DSCR is stored as a decimal", () => {
    expect(parseDscr("1.35x")).toBe(1.35);
    expect(parseDscr("2.50x")).toBe(2.5);
  });

  it("UT-FIN-049 DSCR display re-appends the suffix and blanks cleanly", () => {
    expect(formatDscr(1.35)).toBe("1.35x");
    expect(formatDscr(null)).toBe("");
    expect(formatDscr(undefined)).toBe("");
  });

  it("UT-FIN-050 DSCR regex bounds", () => {
    expect(validateDscr("0.99x").valid).toBe(false);
    expect(validateDscr("1.00x").valid).toBe(true);
    expect(validateDscr("2.50x").valid).toBe(true);
    expect(validateDscr("2.51x").valid).toBe(false);
    expect(validateDscr("1.5x").valid).toBe(false);
    expect(validateDscr("1.50").valid).toBe(false);
  });

  it("UT-FIN-051 the DSCR regex uses a comma in a non-English locale", () => {
    expect(validateDscr("1,35x", "de-DE").valid).toBe(true);
    expect(validateDscr("1.35x", "de-DE").valid).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════ repayment profile ══ */

describe("repayment profile (rules 21–22)", () => {
  const cod = d("2028-06-01");

  it("UT-FIN-052 repayment years derive from COD, start and tenor", () => {
    const rows = regenerateRepaymentYears(cod, 1, 0, 15, 0);
    expect(rows).toHaveLength(15);
    expect(rows[0]!.year).toBe(2029);
    expect(rows[14]!.year).toBe(2043);
  });

  it("UT-FIN-053 values carry over by POSITION on a tenor change", () => {
    const initial: RepaymentRow[] = [2029, 2030, 2031, 2032, 2033].map((year, i) => ({
      year, value: String((i + 1) * 10), valid: true, dirty: false, repaymentAmountRecordId: null,
    }));
    const shorter = regenerateRepaymentYears(cod, 1, 0, 3, 0, initial);
    expect(shorter.map((r) => r.year)).toEqual([2029, 2030, 2031]);
    expect(shorter.map((r) => r.value)).toEqual(["10", "20", "30"]);
  });

  it("UT-FIN-054 values shift onto new years when the start year moves", () => {
    const initial: RepaymentRow[] = [2029, 2030, 2031].map((year, i) => ({
      year, value: String((i + 1) * 10), valid: true, dirty: false, repaymentAmountRecordId: null,
    }));
    const moved = regenerateRepaymentYears(cod, 2, 0, 4, 0, initial);
    expect(moved.map((r) => r.year)).toEqual([2030, 2031, 2032]);
    expect(moved.map((r) => r.value)).toEqual(["10", "20", "30"]);
  });

  it("UT-FIN-055 a degenerate term produces no rows and no negative Sequence", () => {
    expect(regenerateRepaymentYears(cod, 5, 0, 3, 0)).toEqual([]);
    expect(regenerateRepaymentYears(null, 1, 0, 15, 0)).toEqual([]);
  });

  it("UT-FIN-056 regenerated rows re-link to existing Dataverse records", () => {
    const existing = [{ year: 2029, id: "ra1" }, { year: 2030, id: "ra2" }];
    const rows = regenerateRepaymentYears(cod, 1, 0, 5, 0, [], existing);
    expect(rows[0]!.repaymentAmountRecordId).toBe("ra1");
    expect(rows[1]!.repaymentAmountRecordId).toBe("ra2");
    expect(rows[2]!.repaymentAmountRecordId).toBeNull();
  });

  it("UT-FIN-057 repayment rows are written only for the Individual profile", () => {
    const stored = [2029, 2030, 2031, 2032, 2033].map((year, i) => ({ id: `s${i}`, year }));
    const diff = repaymentDiff(CHOICE_FINANCE.repaymentProfile.straightLine, [], stored);
    expect(diff.toDelete).toHaveLength(5);
    expect(diff.toUpsert).toHaveLength(0);
  });

  it("UT-FIN-058 the Individual profile deletes only orphaned years", () => {
    const stored = [2029, 2030, 2031, 2032, 2033, 2034, 2035].map((year) => ({ id: `s${year}`, year }));
    const rows: RepaymentRow[] = [2029, 2030, 2031, 2032].map((year) => ({
      year, value: "1000", valid: true, dirty: true, repaymentAmountRecordId: null,
    }));
    const diff = repaymentDiff(CHOICE_FINANCE.repaymentProfile.individual, rows, stored);
    expect(diff.toDelete).toEqual(["s2033", "s2034", "s2035"]);
    expect(diff.toUpsert).toHaveLength(4);
    expect(diff.toUpsert[0]).toMatchObject({ year: 2029, amount: 1000, name: "2029 - Value", recordId: "s2029" });
  });

  it("UT-FIN-059 repayment amount validation", () => {
    expect(validateRepaymentAmount("1000.5", "Germany").valid).toBe(false);
    expect(validateRepaymentAmount("1000", "Germany").valid).toBe(true);
    expect(validateRepaymentAmount("200000000", "Germany").valid).toBe(false);
    expect(validateRepaymentAmount("200000000", "Poland").valid).toBe(true);
    expect(validateRepaymentAmount("", "Germany").valid).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════ step-up margins ═══ */

describe("step-up bank margins (rules 23–26)", () => {
  const rows = [stepUp(1, 5, "1.25"), stepUp(2, 10, "1.50")];

  it("UT-FIN-061 step-up margins convert to durations on save", () => {
    const stored = stepUpToStorage(rows);
    expect(stored[0]).toMatchObject({ order: 1, startYear: 1, duration: 5, margin: 1.25 });
    expect(stored[1]).toMatchObject({ order: 2, startYear: 5, duration: 5, margin: 1.5 });
  });

  it("UT-FIN-062 step-up margins convert back to boundaries on load", () => {
    const back = stepUpFromStorage(stepUpToStorage(rows));
    expect(back[0]!.durationYY).toBe(5);
    expect(back[1]!.durationYY).toBe(10);
  });

  it("UT-FIN-063 the schedule must end exactly at the FIR duration", () => {
    expect(stepUpScheduleValid(rows, 10)).toBe(true);
    expect(stepUpScheduleValid([stepUp(1, 5, "1.25"), stepUp(2, 8, "1.5")], 10)).toBe(false);
    expect(stepUpScheduleValid([], 10)).toBe(false);
    expect(MSG.stepUpDuration)
      .toBe("Step-up Bank Margin duration must be equal to the Fixed Interest Rate duration");
  });

  it("UT-FIN-064 duplicate step-up end years are rejected", () => {
    expect(stepUpScheduleValid([stepUp(1, 10, "1.25"), stepUp(2, 10, "1.5")], 10)).toBe(false);
  });

  it("UT-FIN-065 the year picker offers only years after the previous period", () => {
    expect(stepUpYearOptions(4, 10)).toEqual([5, 6, 7, 8, 9, 10]);
    expect(stepUpYearOptions(null, 3)).toEqual([1, 2, 3]);
    expect(stepUpYearOptions(4, null)).toEqual([]);
    expect(stepUpYearOptions(null, 3)).not.toContain(0);
  });

  it("UT-FIN-066 add-period is disabled until the current row is complete", () => {
    expect(stepUpAddEnabled([stepUp(1, 5, "")], 10, false)).toBe(false);
    expect(stepUpAddEnabled([stepUp(1, null, "1.25")], 10, false)).toBe(false);
    expect(stepUpAddEnabled([stepUp(1, 5, "1.25")], 10, false)).toBe(true);
  });

  it("UT-FIN-067 add-period is disabled once the schedule reaches the FIR duration", () => {
    expect(stepUpAddEnabled(rows, 10, false)).toBe(false);
    expect(stepUpAddEnabled(rows, 10, true)).toBe(false);
  });

  it("UT-FIN-068 remove-period is disabled with a single row", () => {
    expect(stepUpRemoveEnabled([stepUp(1, 5, "1.25")], false)).toBe(false);
    expect(stepUpRemoveEnabled(rows, false)).toBe(true);
    expect(stepUpRemoveEnabled(rows, true)).toBe(false);
  });

  it("UT-FIN-069 step-up rows are deleted when the toggle is turned off", () => {
    const stored = stepUpToStorage(rows).map((s, i) => ({ ...s, id: `su${i}` }));
    const off = stepUpWrites(false, rows, stored);
    expect(off.toDelete).toEqual(["su0", "su1"]);
    expect(off.toUpsert).toHaveLength(0);
    const on = stepUpWrites(true, rows, stored);
    expect(on.toUpsert).toHaveLength(2);
  });

  it("UT-FIN-070 step-up margin validation", () => {
    expect(validateStepUpMargin("1.25").valid).toBe(true);
    expect(validateStepUpMargin("1.256").valid).toBe(false);
    expect(validateStepUpMargin("101").valid).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════ the VAT ═══ */

describe("VAT financing", () => {
  it("UT-FIN-015 the VAT base rate is country-specific on seed", () => {
    const seedsPL = planSeeds(
      project({ countryName: "Poland" }), buildCategoryMap(categories), [],
      stdAt(2027), buildDsraStandard(dsraRows, "wind"),
      buildDecommissioningStandard(decRows, "wind", project()),
    );
    const vatPL = seedsPL.find((s) => s.category === "vatFinancing")!;
    expect(vatPL.fields.baseRate).toBe(CHOICE_FINANCE.baseRate.wibor3M);
    expect(vatPL.fields.bankMargin).toBe(1.5);

    const seedsDE = planSeeds(
      project(), buildCategoryMap(categories), [],
      stdAt(2027), buildDsraStandard(dsraRows, "wind"),
      buildDecommissioningStandard(decRows, "wind", project()),
    );
    const vatDE = seedsDE.find((s) => s.category === "vatFinancing")!;
    expect(vatDE.fields.baseRate).toBe(CHOICE_FINANCE.baseRate.euribor3M);
    expect(vatDE.fields.bankMargin).toBe(1.5);
  });

  it("UT-FIN-081 Calculated mode shows the preliminary note and needs no amount", () => {
    expect(MSG.vatPreliminary)
      .toBe("Preliminary - final numbers will apply after calculation of plant");
    expect(validateVatFacilityAmount(
      "", CHOICE_FINANCE.vatFacilityAmount.calculated, "Germany",
    ).valid).toBe(true);
    expect(canSaveVatFinancing(
      "", CHOICE_FINANCE.vatFacilityAmount.calculated, "1.5", "Germany", true,
    )).toBe(true);
  });

  it("UT-FIN-082 Individual mode requires an amount", () => {
    expect(canSaveVatFinancing(
      "", CHOICE_FINANCE.vatFacilityAmount.individual, "1.5", "Germany", true,
    )).toBe(false);
    expect(canSaveVatFinancing(
      "5000000", CHOICE_FINANCE.vatFacilityAmount.individual, "1.5", "Germany", true,
    )).toBe(true);
  });

  it("UT-FIN-083 the VAT bank margin cap", () => {
    expect(validateVatBankMargin("10").valid).toBe(true);
    expect(validateVatBankMargin("10.5")).toEqual({ valid: false, message: MSG.vatBankMargin });
    expect(validateVatBankMargin("1.555").valid).toBe(false);
  });

  it("a dirty flag is still required to save", () => {
    expect(canSaveVatFinancing(
      "", CHOICE_FINANCE.vatFacilityAmount.calculated, "1.5", "Germany", false,
    )).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════ command bars ═══ */

describe("command bars", () => {
  const tranche = (over: Partial<TrancheRow> = {}): TrancheRow => ({
    id: "t1", trancheStatus: CHOICE_FINANCE.trancheStatus.termSheet,
    status: CHOICE_FINANCE.status.active, canEdit: true, canDelete: true, ...over,
  });

  it("UT-FIN-036 the last active tranche cannot be deactivated", () => {
    const one = [tranche()];
    expect(seniorDebtCommandBar(one, one[0]!, true).deactivate.enabled).toBe(false);
    const two = [tranche(), tranche({ id: "t2" })];
    expect(seniorDebtCommandBar(two, two[0]!, true).deactivate.enabled).toBe(true);
  });

  it("UT-FIN-037 Add Tranche is disabled when only the standard tranche exists", () => {
    const only = [tranche({ trancheStatus: CHOICE_FINANCE.trancheStatus.standardAssumption })];
    expect(seniorDebtCommandBar(only, null, true).add.enabled).toBe(false);
  });

  it("UT-FIN-038 Add Tranche is enabled once a second tranche exists", () => {
    const two = [
      tranche({ id: "t0", trancheStatus: CHOICE_FINANCE.trancheStatus.standardAssumption }),
      tranche({ id: "t1" }),
    ];
    expect(seniorDebtCommandBar(two, null, true).add.enabled).toBe(true);
    expect(seniorDebtCommandBar(two, null, false).add.enabled).toBe(false);
  });

  it("UT-FIN-039 Delete is disabled for Credit Agreement and Standard Assumption", () => {
    const three = [
      tranche({ id: "t0", trancheStatus: CHOICE_FINANCE.trancheStatus.standardAssumption }),
      tranche({ id: "t1", trancheStatus: CHOICE_FINANCE.trancheStatus.creditAgreement }),
      tranche({ id: "t2" }),
    ];
    expect(seniorDebtCommandBar(three, three[0]!, true).delete.enabled).toBe(false);
    expect(seniorDebtCommandBar(three, three[1]!, true).delete.enabled).toBe(false);
    expect(seniorDebtCommandBar(three, three[2]!, true).delete.enabled).toBe(true);
    // A single input can never be deleted, whatever its status.
    expect(seniorDebtCommandBar([three[2]!], three[2]!, true).delete.enabled).toBe(false);
  });

  it("UT-FIN-040 Edit is disabled on an inactive tranche and Activate becomes visible", () => {
    const two = [tranche(), tranche({ id: "t2", status: CHOICE_FINANCE.status.inactive })];
    const bar = seniorDebtCommandBar(two, two[1]!, true);
    expect(bar.edit.enabled).toBe(false);
    expect(bar.activate.visible).toBe(true);
    expect(bar.deactivate.visible).toBe(false);
  });

  it("the category command bar only offers activate/deactivate for Orders 2 and 5", () => {
    expect(categoryCommandBar(2, CHOICE_FINANCE.status.active, true).deactivate.visible).toBe(true);
    expect(categoryCommandBar(5, CHOICE_FINANCE.status.inactive, true).activate.visible).toBe(true);
    expect(categoryCommandBar(3, CHOICE_FINANCE.status.active, true).deactivate.visible).toBe(false);
    expect(categoryCommandBar(1, CHOICE_FINANCE.status.active, true).activate.visible).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════ save gating ═══ */

describe("senior-debt save gating", () => {
  it("UT-FIN-096 save is disabled until the form is dirty", () => {
    expect(canSaveSeniorDebtTranche(seniorForm({ formDirty: false }))).toBe(false);
    expect(canSaveSeniorDebtTranche(seniorForm())).toBe(true);
  });

  it("UT-FIN-046 save is re-entrancy guarded", () => {
    expect(canSaveSeniorDebtTranche(seniorForm({ isSaving: true }))).toBe(false);
    expect(canSaveSeniorDebtTranche(seniorForm({ isSaving: false }))).toBe(true);
  });

  it("UT-FIN-089 a 0/0 tenor is rejected", () => {
    expect(validateYearMonthPair(0, 0)).toEqual({ valid: false, message: MSG.tenorZero });
    expect(validateYearMonthPair(0, 6).valid).toBe(true);
    expect(canSaveSeniorDebtTranche(seniorForm({ tenorYears: 0, tenorMonths: 0 }))).toBe(false);
  });

  it("UT-FIN-090 the Individual profile rejects a tenor shorter than the repayment start", () => {
    expect(validateTenorAgainstRepaymentStart(
      CHOICE_FINANCE.repaymentProfile.individual, 3, 5,
    )).toEqual({ valid: false, message: MSG.tenorShorterThanStart });
    expect(validateTenorAgainstRepaymentStart(
      CHOICE_FINANCE.repaymentProfile.straightLine, 3, 5,
    ).valid).toBe(true);
  });

  it("UT-FIN-091 fixed-amount units switch with the option", () => {
    const pct = CHOICE_FINANCE.fixedAmount.percentOfCapex;
    const fix = CHOICE_FINANCE.fixedAmount.fixedValue;
    expect(validateFixedAmount("85.5", pct, "Germany").valid).toBe(true);
    expect(validateFixedAmount("85.55", pct, "Germany").valid).toBe(false);
    expect(validateFixedAmount("1500000000", fix, "Germany").valid).toBe(false);
    expect(validateFixedAmount("1500000000", fix, "Poland").valid).toBe(true);
  });

  it("UT-FIN-092 DSCR fields are only required for Debt Sizing gearing", () => {
    expect(canSaveSeniorDebtTranche(seniorForm({
      gearing: CHOICE_FINANCE.gearing.fixedAmount,
      fixedAmountValue: "85.5", dscrContracted: "", dscrUncontracted: "",
    }))).toBe(true);
    expect(canSaveSeniorDebtTranche(seniorForm({ dscrContracted: "" }))).toBe(false);
  });

  it("UT-FIN-093 a bank name is required when the bank is Other", () => {
    expect(canSaveSeniorDebtTranche(seniorForm({
      bankName: "Other", bankId: null, otherBankName: "",
    }))).toBe(false);
    expect(canSaveSeniorDebtTranche(seniorForm({
      bankName: "Other", bankId: null, otherBankName: "Landes Bank",
    }))).toBe(true);
  });

  it("UT-FIN-094 a KfW value is required when the KfW toggle is on", () => {
    expect(canSaveSeniorDebtTranche(seniorForm({ kfwEnabled: true, kfwValue: null }))).toBe(false);
    expect(canSaveSeniorDebtTranche(seniorForm({ kfwEnabled: true, kfwValue: "10/2/10" }))).toBe(true);
  });

  it("UT-FIN-095 swap rate and bank rate are required when Swap After Fixed Period is on", () => {
    expect(canSaveSeniorDebtTranche(seniorForm({ swapAfterFixedPeriod: true }))).toBe(false);
    expect(canSaveSeniorDebtTranche(seniorForm({
      swapAfterFixedPeriod: true, bankRate: "2.50", swapRate: "2.70",
    }))).toBe(true);
  });

  it("UT-FIN-060 save is blocked while any repayment row is invalid", () => {
    const rows: RepaymentRow[] = [
      { year: 2029, value: "1000", valid: true, dirty: true, repaymentAmountRecordId: null },
      { year: 2030, value: "", valid: false, dirty: true, repaymentAmountRecordId: null },
    ];
    expect(canSaveSeniorDebtTranche(seniorForm({
      repaymentProfile: CHOICE_FINANCE.repaymentProfile.individual, repaymentRows: rows,
    }))).toBe(false);
    const good = rows.map((r) => ({ ...r, value: "1000", valid: true }));
    expect(canSaveSeniorDebtTranche(seniorForm({
      repaymentProfile: CHOICE_FINANCE.repaymentProfile.individual, repaymentRows: good,
    }))).toBe(true);
  });

  it("an incomplete step-up schedule blocks the save", () => {
    expect(canSaveSeniorDebtTranche(seniorForm({
      stepUpEnabled: true, stepUpRows: [stepUp(1, 8, "1.25")],
    }))).toBe(false);
    expect(canSaveSeniorDebtTranche(seniorForm({
      stepUpEnabled: true, stepUpRows: [stepUp(1, 5, "1.25"), stepUp(2, 10, "1.5")],
    }))).toBe(true);
  });

  it("a second Standard Assumption tranche blocks the save", () => {
    expect(canSaveSeniorDebtTranche(seniorForm({
      trancheStatus: CHOICE_FINANCE.trancheStatus.standardAssumption,
      otherTranches: [{
        id: "t9", trancheStatus: CHOICE_FINANCE.trancheStatus.standardAssumption,
        uniqueKeyString: "P1-SeniorDebt-StandardAssumption",
      }],
    }))).toBe(false);
  });

  it("the rate, hedging, upfront and commitment-fee validators are all wired in", () => {
    expect(validateRateField("10.5").valid).toBe(false);
    expect(validateHedging("85.55").valid).toBe(false);
    expect(validateUpfrontFee("101", CHOICE_FINANCE.upfrontFee.percentageOfDebt, "Germany").valid)
      .toBe(false);
    expect(canSaveSeniorDebtTranche(seniorForm({ bankMarginConstruction: "10.5" }))).toBe(false);
    expect(canSaveSeniorDebtTranche(seniorForm({ hedging: "85.55" }))).toBe(false);
    expect(canSaveSeniorDebtTranche(seniorForm({ upfrontFeeValue: "101" }))).toBe(false);
    expect(canSaveSeniorDebtTranche(seniorForm({ commitmentFeeValue: "" }))).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════ display ═══ */

describe("display rules (32–36)", () => {
  const banks = [{ id: "B7", bankname: "NordLB" }, { id: "B8", bankname: "Commerz" }];

  it("UT-FIN-084 the bank-name sentinel resolves to the free-text name", () => {
    expect(bankDisplayName(OTHER_BANK_SENTINEL, "Landes Bank", banks)).toBe("Landes Bank");
    expect(bankDisplayName("B7", null, banks)).toBe("NordLB");
    expect(bankDisplayName("B9", null, banks)).toBe("");
  });

  it("UT-FIN-085 the tranche display name includes the KfW value", () => {
    expect(trancheDisplayName(CHOICE_FINANCE.trancheStatus.termSheet, "NordLB", true, "10/2/10"))
      .toBe("Term Sheet - *NordLB* - 10/2/10");
    expect(trancheDisplayName(CHOICE_FINANCE.trancheStatus.creditAgreement, "NordLB", false, null))
      .toBe("Credit Agreement - *NordLB*");
    expect(trancheDisplayName(CHOICE_FINANCE.trancheStatus.standardAssumption, "", false, null))
      .toBe("Standard Assumptions");
  });

  it("UT-FIN-086 the upfront fee formatting depends on its option", () => {
    expect(formatUpfrontFee(CHOICE_FINANCE.upfrontFee.percentageOfDebt, 1.25)).toBe("1.3");
    expect(formatUpfrontFee(CHOICE_FINANCE.upfrontFee.fixed, 1_250_000)).toBe("1,250,000");
    expect(formatUpfrontFee(CHOICE_FINANCE.upfrontFee.fixed, null)).toBe("");
  });

  it("UT-FIN-087 form defaults fall back to the standard tranche, then to the country rate", () => {
    expect(fieldDefault(5, 10)).toBe(5);
    expect(fieldDefault(null, 10)).toBe(10);
    expect(fieldDefault(null, null)).toBeNull();
    expect(baseRateDefault(null, null, "Poland")).toBe(CHOICE_FINANCE.baseRate.wibor3M);
    expect(baseRateDefault(null, null, "Germany")).toBe(CHOICE_FINANCE.baseRate.euribor3M);
    expect(baseRateDefault(null, CHOICE_FINANCE.baseRate.euribor6M, "Poland"))
      .toBe(CHOICE_FINANCE.baseRate.euribor6M);
  });
});

/* ═══════════════════════════════════════════════════════════════════ seeding ═══ */

describe("seeding (rule 10)", () => {
  const map = buildCategoryMap(categories);
  const std = stdAt(2027);
  const dsra = buildDsraStandard(dsraRows, "wind");
  const dec = buildDecommissioningStandard(decRows, "wind", project());

  it("UT-FIN-013 the equity input is seeded once with the documented defaults", () => {
    const seeds = planSeeds(project(), map, [], std, dsra, dec);
    const eq = seeds.find((s) => s.category === "equity")!;
    expect(eq.fields.freeEquity).toBe(CHOICE_FINANCE.freeEquity.percentage);
    expect(eq.fields.freeEquityValue).toBe(10);
    expect(eq.fields.shareholderLoanValue).toBe(90);
    expect(eq.uniqueKeyString).toBe("P1-Equity");
    expect(eq.name).toBe("Windpark Nord-Equity");
  });

  it("UT-FIN-014 seeding is idempotent — nothing is written when all five rows exist", () => {
    const seeds = planSeeds(project(), map, ["c1", "c2", "c3", "c4", "c5"], std, dsra, dec);
    expect(seeds).toEqual([]);
  });

  it("only the missing categories are planned", () => {
    const seeds = planSeeds(project(), map, ["c1", "c3"], std, dsra, dec);
    expect(seeds.map((s) => s.category)).toEqual(["vatFinancing", "dsraDsrf", "decommissioning"]);
  });

  it("UT-FIN-016 the senior-debt seed carries the full standard assumption", () => {
    const sd = planSeeds(project(), map, [], std, dsra, dec)
      .find((s) => s.category === "seniorDebt")!;
    expect(sd.fields.trancheStatus).toBe(CHOICE_FINANCE.trancheStatus.standardAssumption);
    expect(sd.fields.gearing).toBe(CHOICE_FINANCE.gearing.debtSizing);
    expect(sd.fields.upfrontFee).toBe(CHOICE_FINANCE.upfrontFee.percentageOfDebt);
    expect(sd.fields.trackStatusActive).toBe(CHOICE_FINANCE.yesNo.yes);
    expect(sd.fields.swapAfterFixedPeriod).toBe(CHOICE_FINANCE.yesNo.no);
    expect(sd.fields.stepUpBankMargin).toBe(CHOICE_FINANCE.yesNo.no);
    expect(sd.fields.isFolded).toBe(CHOICE_FINANCE.isFolded.true);
    expect(sd.uniqueKeyString).toBe("P1-SeniorDebt-StandardAssumption");
    expect(sd.fields.seniorDebtStandardAssumptionJson).toBe('[{"FinancialCloseDate":true}]');
    expect(sd.fields.tenorDurationYear).toBe(18);
    expect(sd.fields.tenorDurationMonth).toBe(0);
    expect(sd.fields.financialClose).toEqual(d("2026-12-01"));
  });

  it("UT-FIN-017 the DSRA seed's end-of-savings = COD + tenor × 12 months − 1 day", () => {
    const ds = planSeeds(project(), map, [], std, dsra, dec)
      .find((s) => s.category === "dsraDsrf")!;
    // COD 2028-01-01 + 18×12 months = 2046-01-01, minus one day.
    expect(ds.fields.endOfDebtServiceSavings).toEqual(d("2045-12-31"));
    expect(ds.fields.durationOfFutureDebtServiceMmyy).toBe("0006");
  });

  it("UT-FIN-104 the DSRA seed nulls the DSRF-only fields when the type is DSRA", () => {
    const dsraType = buildDsraStandard(
      dsraRows.map((x) => (x.category === DSRA_CATEGORY.defaultType ? { ...x, wind: "dsra" } : x)),
      "wind",
    );
    const ds = planSeeds(project(), map, [], std, dsraType, dec)
      .find((s) => s.category === "dsraDsrf")!;
    expect(ds.fields.typeDsraDsrf).toBe(CHOICE_FINANCE.dsraDsrfType.dsra);
    expect(ds.fields.commitmentFeeValue).toBeNull();
    expect(ds.fields.commitmentFeePeriodYear).toBeNull();
    expect(ds.fields.upfrontFeeValue).toBeNull();
    // The canvas writes 0 for the month, not Blank().
    expect(ds.fields.commitmentFeePeriodMonth).toBe(0);
  });

  it("UT-FIN-019b the decommissioning seed picks the total vs per-turbine amount", () => {
    const total = planSeeds(project(), map, [], std, dsra, dec)
      .find((s) => s.category === "decommissioning")!;
    expect(total.fields.costsOfDecommissioningValue).toBe(800_000);
    const perTurbine = planSeeds(
      project(), map, [], std, dsra, buildDecommissioningStandard(decRows, "pv", project()),
    ).find((s) => s.category === "decommissioning")!;
    expect(perTurbine.fields.costsOfDecommissioningValue).toBe(0);
  });

  it("UT-FIN-088 switching to Standard Assumption resets the form", () => {
    const reset = resetOnTrancheStatusChange(
      CHOICE_FINANCE.trancheStatus.standardAssumption, std,
    );
    expect(reset.selectedTrancheId).toBeNull();
    expect(reset.standardApplies).toBe(true);
    expect(reset.financialCloseToShow).toEqual(d("2026-12-01"));
    expect(reset.isFinancialCloseDateStandard).toBe(true);
    expect(resetOnTrancheStatusChange(CHOICE_FINANCE.trancheStatus.termSheet, std).standardApplies)
      .toBe(false);
  });

  it("UT-FIN-098 deleting a tranche cascades to repayments and step-ups", () => {
    const plan = trancheDeletePlan(
      "t1",
      [{ id: "su1", financingInputId: "t1" }, { id: "su2", financingInputId: "t2" }],
      [{ id: "ra1", financingInputId: "t1" }, { id: "ra2", financingInputId: "t1" }],
    );
    expect(plan.stepUpIds).toEqual(["su1"]);
    expect(plan.repaymentIds).toEqual(["ra1", "ra2"]);
    expect(plan.trancheId).toBe("t1");
  });
});

/* ═════════════════════════════════════════════════════════════════ page lock ═══ */

describe("page lock", () => {
  it("UT-FIN-099 the page lock matches the Revenues screen exactly", () => {
    expect(isPageLocked(project({ clusterStateName: "Draft" }))).toBe(true);
    expect(isPageLocked(project({ clusterStateName: "Approved" }))).toBe(false);
    expect(isPageLocked(project({ netYieldP50: 0, clusterStateName: "Approved" }))).toBe(true);
  });
});

/* ═══════════════════════════════════════ GUIDE q26 — Edit Tranche panel ════ */

describe("GUIDE q26 — Edit Tranche panel", () => {
  it("Standard Assumption and Term Sheet grey out once Credit Agreement is selected", () => {
    const CA = CHOICE_FINANCE.trancheStatus.creditAgreement;
    const SA = CHOICE_FINANCE.trancheStatus.standardAssumption;
    const TS = CHOICE_FINANCE.trancheStatus.termSheet;
    expect(trancheStatusOptionDisabled(CA, SA)).toBe(true);
    expect(trancheStatusOptionDisabled(CA, TS)).toBe(true);
    expect(trancheStatusOptionDisabled(CA, CA)).toBe(false);
  });

  it("no option is disabled while Standard Assumption or Term Sheet is selected", () => {
    const SA = CHOICE_FINANCE.trancheStatus.standardAssumption;
    const TS = CHOICE_FINANCE.trancheStatus.termSheet;
    const CA = CHOICE_FINANCE.trancheStatus.creditAgreement;
    for (const selected of [SA, TS, null]) {
      for (const option of [SA, TS, CA]) {
        expect(trancheStatusOptionDisabled(selected, option)).toBe(false);
      }
    }
  });

  it("field labels are verbatim from the recording", () => {
    expect(TRANCHE_FORM_LABEL.status).toBe("Status");
    expect(TRANCHE_FORM_LABEL.kfwTranche).toBe("KfW-Tranche");
    expect(TRANCHE_FORM_LABEL.financialClose).toBe("Financial Close");
    expect(TRANCHE_FORM_LABEL.tenor).toBe("Tenor [Years after COD]");
    expect(TRANCHE_FORM_LABEL.drawdown).toBe("Drawdown");
    expect(TRANCHE_FORM_LABEL.dscr).toBe("DSCR");
    expect(TRANCHE_FORM_LABEL.dscrContracted).toBe("Contracted");
    expect(TRANCHE_FORM_LABEL.upfrontFee).toBe("Upfront Fee");
    expect(TRANCHE_FORM_LABEL.upfrontFeeValue).toBe("Upfront fee [%]");
    expect(TRANCHE_FORM_LABEL.commitmentFee).toBe("Commitment Fee");
    expect(TRANCHE_FORM_LABEL.commitmentFeeValue).toBe("Commitment Fee [%]");
    expect(TRANCHE_FORM_LABEL.commitmentFeeFreePeriod).toBe("Commitment Fee Free Period");
    expect(TRANCHE_FORM_LABEL.interestRate).toBe("Interest Rate");
    expect(TRANCHE_FORM_LABEL.baseRate).toBe("Base Rate");
    expect(TRANCHE_FORM_LABEL.swapRate).toBe("Swap Rate [%]");
    expect(TRANCHE_FORM_LABEL.bankMarginConstruction).toBe("Bank Margin - Construction Phase [%]");
  });

  it("Base Rate offers Euribor terms outside Poland and Wibor terms in Poland", () => {
    expect(baseRateOptions("Germany")).toEqual([
      CHOICE_FINANCE.baseRate.euribor1M,
      CHOICE_FINANCE.baseRate.euribor3M,
      CHOICE_FINANCE.baseRate.euribor6M,
    ]);
    expect(baseRateOptions("Poland")).toEqual([
      CHOICE_FINANCE.baseRate.wibor1M,
      CHOICE_FINANCE.baseRate.wibor3M,
      CHOICE_FINANCE.baseRate.wibor6M,
    ]);
  });

  it("Base Rate option labels match the recording's verbatim text", () => {
    expect(BASE_RATE_OPTION_LABEL[CHOICE_FINANCE.baseRate.euribor1M]).toBe("Euribor 1M");
    expect(BASE_RATE_OPTION_LABEL[CHOICE_FINANCE.baseRate.euribor3M]).toBe("Euribor 3M");
    expect(BASE_RATE_OPTION_LABEL[CHOICE_FINANCE.baseRate.euribor6M]).toBe("Euribor 6M");
  });
});
