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
import { CHOICE_FINANCE } from "@/data/dataverseNames";
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
  seniorDebtCommandBar, categoryCommandBar, dsraCardToggle, DSRA_TOGGLE_LABEL,
  bankDisplayName, OTHER_BANK_SENTINEL, trancheDisplayName, formatUpfrontFee,
  fieldDefault, baseRateDefault, planSeeds, resetOnTrancheStatusChange, trancheDeletePlan,
  trancheStatusRadioDisabled, TRANCHE_FORM_LABEL, baseRateOptions, BASE_RATE_OPTION_LABEL,
  isPageLocked, MSG,
  type DebtAssumptionRow, type FinanceProject, type FinancingCategory,
  type SeniorDebtFormState, type StepUpRow, type RepaymentRow, type TrancheRow,
  type FinancingInputStatus, type DecommissioningFlags, type VatForm,
} from "./rules";
import {
  categoryCommandLabel, categoryToggleDialog, trancheActionDialog, dsraToggleDialog,
  durationOptionName, durationRange, toDebtTech, currencySuffix,
} from "./rules";
import {
  CARD_FORMAT, FINANCE_SCREEN_TEXT, INPUT_COL, NOTIFY, SPINNER, STATUS_REASON,
  applyDsraTypeChange, applyTrancheStatusChange, canSaveDecommissioning, canSaveDsra, canSeedStepUp,
  categoryToggleSpinner, commitmentFeeFreePeriodLabel, commitmentFeeOptionDefault,
  dateOfExpiryMessageCanvasParity, decommissioningDurationLabel, drawdownDefault,
  drawdownDefaultCanvasParity, dsraCommitmentFeeMonthsDefault, dsraDurationMonthsCanvasParity,
  dsraPeriodLabel, dsraToggleSpinner, energyYieldDefault, firstStepUpRow, fmtCard, fmtLongDate,
  inputStatus, isTrancheFolded, openDecommissioningForm, openDsraForm, openEquityForm,
  openTrancheForm, openVatForm, planCategoryToggle, planDecommissioningSave, planDsraSave,
  planDsraToggle, planEquitySave, planFinancingOption, planFinancingOptionOnVisit, planTrancheDelete,
  planTrancheSave, planTrancheToggle, planVatSave, repaymentProfileDefault, repaymentRowsOf,
  seedJobs, seedWrite, seedsAllowed, shareholderLoanCanvasParity, spotCurveDefault,
  stepUpRowsOf, stepUpWritesCanvasParity, toggleCategoryFold, toggleCategoryStatus,
  trancheSaveJob, trancheToggleJob, validateDateOfExpiry, validateDateOfIssue,
  validateCommitmentFeeValue, validateDsraUpfrontFee, validatePofds, validateStartDateOfSaving, vatBaseRateDefault,
  financeCardStandard, trancheFinancialCloseIsStandard,
  FIN_LABEL, PANEL_MAX_LENGTH, shareholderLoanToSave, shouldRegenerateRepayments,
  stepUpPeriodChangeAllowed, trancheFormTitle, trancheMonthDefault, trancheRecord,
  type DecommissioningForm, type DsraForm, type FinancingInputRow,
} from "./rules";
import {
  Vsb_financinginputsstatecode, Vsb_financinginputsstatuscode, Vsb_financinginputsvsb_baserate,
  Vsb_financinginputsvsb_commitmentfee, Vsb_financinginputsvsb_costsofdecommissioning,
  Vsb_financinginputsvsb_drawdown, Vsb_financinginputsvsb_dsradsrforiginalstatusactive,
  Vsb_financinginputsvsb_energyyielddebtsizing, Vsb_financinginputsvsb_fixedamount,
  Vsb_financinginputsvsb_freeequity, Vsb_financinginputsvsb_gearing,
  Vsb_financinginputsvsb_repaymentprofile, Vsb_financinginputsvsb_spotcurvedebtsizing,
  Vsb_financinginputsvsb_tranchestatus, Vsb_financinginputsvsb_typedsradrsf,
  Vsb_financinginputsvsb_upfrontfee, Vsb_financinginputsvsb_vatfacilityamount,
  type Vsb_financinginputsBase,
} from "@/generated/models/Vsb_financinginputsModel";
import { Vsb_projectsvsb_financingoptions } from "@/generated/models/Vsb_projectsModel";

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

const vatForm = (over: Partial<VatForm> = {}): VatForm => ({
  baseRate: CHOICE_FINANCE.baseRate.euribor3M, bankMargin: "1.5",
  mode: CHOICE_FINANCE.vatFacilityAmount.calculated, amount: "",
  flags: { locIsStandardBaseRate: true, locIsStandardBankMargin: true }, ...over,
});

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
  // `swapRate` is `txt_SeniorDebtData_SwapMargin` (always required); `swapMargin` / `bankRate`
  // are `txt_SeniorDebtData_SwapRate` / `…_BankMargin` (required only under Swap After, D34).
  swapMargin: "",
  bankMarginConstruction: "1.85", bankMarginOperational: "1.65",
  fixedInterestRateYears: 10, fixedInterestRateMonths: 0,
  swapAfterFixedPeriod: false, bankRate: "",
  baseRate: CHOICE_FINANCE.baseRate.euribor3M, swapRate: "2.70",
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
    // `If(… <= 1, " Year", " Years")` — zero is singular too (corrected D34).
    expect(mmyyLabel("0115")).toBe("15 Years 1 Month");
    expect(mmyyLabel("0001")).toBe("1 Year 0 Month");
    expect(mmyyLabel(null)).toBe("0 Year 0 Month");
    expect(mmyyLabel("0602")).toBe("2 Years 6 Months");
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

  it("UT-FIN-035 a manual deactivate records the memory flags EQUAL to the new status (corrected D34)", () => {
    // `'Track Status Active?': If(Active, No, Yes)`, `'Is Deactivated By Button': If(Active, Yes, <kept>)`.
    expect(toggleTrancheStatus({ status: CHOICE_FINANCE.status.active })).toEqual({
      status: CHOICE_FINANCE.status.inactive,
      trackStatusActive: false,
      isDeactivatedByButton: true,
    });
    expect(toggleTrancheStatus({ status: CHOICE_FINANCE.status.inactive })).toEqual({
      status: CHOICE_FINANCE.status.active,
      trackStatusActive: true,
    });
  });

  it("the DSRA equivalent writes its own 952850000-band memory column, nothing else (corrected D34)", () => {
    expect(toggleDsraStatus({ status: CHOICE_FINANCE.status.active })).toEqual({
      status: CHOICE_FINANCE.status.inactive,
      dsraOriginalStatusActive: CHOICE_FINANCE.dsraOriginalStatusActive.no,
    });
    expect(toggleDsraStatus({ status: CHOICE_FINANCE.status.inactive })).toEqual({
      status: CHOICE_FINANCE.status.active,
      dsraOriginalStatusActive: CHOICE_FINANCE.dsraOriginalStatusActive.yes,
    });
  });

  it("a deactivated tranche comes back Inactive, an activated one Active, after All Equity → Debt Financing", () => {
    const tranche = { id: "t", categoryOrder: CATEGORY_ORDER.seniorDebt, isDeactivatedByButton: null, dsraOriginalStatusActive: null };
    const off = toggleTrancheStatus({ status: CHOICE_FINANCE.status.active });
    const on = toggleTrancheStatus({ status: CHOICE_FINANCE.status.inactive });
    const back = (track: boolean) => applyFinancingOptionCascade(
      [{ ...tranche, status: CHOICE_FINANCE.status.inactive, trackStatusActive: track }],
      CHOICE_FINANCE.financingOptions.debtFinancing,
    )[0]!.status;
    expect(back(off.trackStatusActive)).toBe(CHOICE_FINANCE.status.inactive);
    expect(back(on.trackStatusActive)).toBe(CHOICE_FINANCE.status.active);
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
    expect(canSaveVatFinancing(vatForm({ mode: CHOICE_FINANCE.vatFacilityAmount.calculated }), "Germany")).toBe(true);
  });

  it("UT-FIN-082 Individual mode requires an amount", () => {
    const individual = CHOICE_FINANCE.vatFacilityAmount.individual;
    expect(canSaveVatFinancing(vatForm({ mode: individual, amount: "" }), "Germany")).toBe(false);
    expect(validateVatFacilityAmount("", individual, "Germany").message).toBe("Input can not be blank");
    expect(canSaveVatFinancing(vatForm({ mode: individual, amount: "5000000" }), "Germany")).toBe(true);
    expect(validateVatFacilityAmount("150000000", individual, "Germany").message)
      .toBe("Numeric value must be between 0 and 100000000");
  });

  it("UT-FIN-083 the VAT bank margin cap", () => {
    expect(validateVatBankMargin("10").valid).toBe(true);
    expect(validateVatBankMargin("10.5")).toEqual({ valid: false, message: MSG.vatBankMargin });
    expect(validateVatBankMargin("1.555").valid).toBe(false);
  });

  it("the VAT Save has no dirty term; it needs a base rate, a margin and a mode (Y:8632)", () => {
    expect(canSaveVatFinancing(vatForm({ baseRate: null }), "Germany")).toBe(false);
    expect(canSaveVatFinancing(vatForm({ bankMargin: "" }), "Germany")).toBe(false);
    expect(canSaveVatFinancing(vatForm({ mode: null }), "Germany")).toBe(false);
    expect(canSaveVatFinancing(vatForm(), "Germany")).toBe(true);
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

  it("UT-FIN-105 the DSRA/DSRF card carries its own Activate/Deactivate (canvas 1.21.753)", () => {
    expect(dsraCardToggle(4, CHOICE_FINANCE.status.active, true))
      .toEqual({ visible: true, enabled: true, label: DSRA_TOGGLE_LABEL.deactivate });
    expect(dsraCardToggle(4, CHOICE_FINANCE.status.inactive, false))
      .toEqual({ visible: true, enabled: false, label: DSRA_TOGGLE_LABEL.activate });
    expect(dsraCardToggle(2, CHOICE_FINANCE.status.active, true).visible).toBe(false);
    // The category command bar still does not offer it for Order 4.
    expect(categoryCommandBar(4, CHOICE_FINANCE.status.active, true).deactivate.visible).toBe(false);
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

  it("UT-FIN-092 DSCR fields are only required for Debt Sizing gearing; their errors count always", () => {
    expect(canSaveSeniorDebtTranche(seniorForm({
      gearing: CHOICE_FINANCE.gearing.fixedAmount,
      fixedAmountValue: "85.5", dscrContracted: "", dscrUncontracted: "",
    }))).toBe(true);
    expect(canSaveSeniorDebtTranche(seniorForm({ dscrContracted: "" }))).toBe(false);
    // An invalid DSCR blocks even under Fixed Amount (the error label is checked regardless).
    expect(canSaveSeniorDebtTranche(seniorForm({
      gearing: CHOICE_FINANCE.gearing.fixedAmount, fixedAmountValue: "85.5", dscrContracted: "3.00x",
    }))).toBe(false);
  });

  it("UT-FIN-093 a bank name is required when the bank is Other", () => {
    expect(canSaveSeniorDebtTranche(seniorForm({
      bankName: "Other", bankId: OTHER_BANK_SENTINEL, otherBankName: "",
    }))).toBe(false);
    expect(canSaveSeniorDebtTranche(seniorForm({
      bankName: "Other", bankId: OTHER_BANK_SENTINEL, otherBankName: "Landes Bank",
    }))).toBe(true);
    // DIVERGENCE (D34): the bank is checked by its stored id (the names are Fabric SQL).
    expect(canSaveSeniorDebtTranche(seniorForm({ bankId: null, bankName: null }))).toBe(false);
    expect(canSaveSeniorDebtTranche(seniorForm({ bankName: null }))).toBe(true);
  });

  it("UT-FIN-094 a KfW value is required when the KfW toggle is on", () => {
    expect(canSaveSeniorDebtTranche(seniorForm({ kfwEnabled: true, kfwValue: null }))).toBe(false);
    expect(canSaveSeniorDebtTranche(seniorForm({ kfwEnabled: true, kfwValue: "10/2/10" }))).toBe(true);
  });

  it("UT-FIN-095 the swap fields follow the canvas' crossed names (corrected D34)", () => {
    // `txt_SeniorDebtData_SwapMargin` (Swap Rate) is ALWAYS required …
    expect(canSaveSeniorDebtTranche(seniorForm({ swapRate: "" }))).toBe(false);
    // … `txt_SeniorDebtData_SwapRate` (Swap Margin) and `…_BankMargin` (Bank Rate) only under Swap After.
    expect(canSaveSeniorDebtTranche(seniorForm({ swapAfterFixedPeriod: true }))).toBe(false);
    expect(canSaveSeniorDebtTranche(seniorForm({ swapAfterFixedPeriod: true, bankRate: "2.50" }))).toBe(false);
    expect(canSaveSeniorDebtTranche(seniorForm({
      swapAfterFixedPeriod: true, bankRate: "2.50", swapMargin: "0.10",
    }))).toBe(true);
  });

  it("UT-FIN-095b an Individual profile with no repayment rows can be saved, as the canvas", () => {
    expect(canSaveSeniorDebtTranche(seniorForm({
      repaymentProfile: CHOICE_FINANCE.repaymentProfile.individual, repaymentRows: [],
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

describe("Edit Tranche panel", () => {
  it("the whole Status radio is disabled for a STORED Credit Agreement tranche (canvas, D34)", () => {
    expect(trancheStatusRadioDisabled(CHOICE_FINANCE.trancheStatus.creditAgreement)).toBe(true);
  });

  it("the Status radio is enabled for every other stored status and for a new tranche", () => {
    expect(trancheStatusRadioDisabled(CHOICE_FINANCE.trancheStatus.standardAssumption)).toBe(false);
    expect(trancheStatusRadioDisabled(CHOICE_FINANCE.trancheStatus.termSheet)).toBe(false);
    expect(trancheStatusRadioDisabled(null)).toBe(false);
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

  it("Base Rate offers the three Euribor terms outside Poland and all SIX in Poland (canvas, D34)", () => {
    expect(baseRateOptions("Germany")).toEqual([
      CHOICE_FINANCE.baseRate.euribor1M,
      CHOICE_FINANCE.baseRate.euribor3M,
      CHOICE_FINANCE.baseRate.euribor6M,
    ]);
    expect(baseRateOptions("Poland")).toEqual([
      CHOICE_FINANCE.baseRate.euribor1M, CHOICE_FINANCE.baseRate.euribor3M, CHOICE_FINANCE.baseRate.euribor6M,
      CHOICE_FINANCE.baseRate.wibor1M, CHOICE_FINANCE.baseRate.wibor3M, CHOICE_FINANCE.baseRate.wibor6M,
    ]);
  });

  it("Base Rate option labels match the recording's verbatim text", () => {
    expect(BASE_RATE_OPTION_LABEL[CHOICE_FINANCE.baseRate.euribor1M]).toBe("Euribor 1M");
    expect(BASE_RATE_OPTION_LABEL[CHOICE_FINANCE.baseRate.euribor3M]).toBe("Euribor 3M");
    expect(BASE_RATE_OPTION_LABEL[CHOICE_FINANCE.baseRate.euribor6M]).toBe("Euribor 6M");
  });
});

/* ═══════════════════════════════════════════════════════════════ screen captions ══ */

describe("UT-FIN screen captions (UI-only rebuild)", () => {
  it("UT-FIN-801 categoryCommandLabel follows Switch(Order, 1, Equity, 2, Tranche, Name)", () => {
    expect(categoryCommandLabel("edit", CATEGORY_ORDER.equity, "x")).toBe("Edit Equity");
    expect(categoryCommandLabel("activate", CATEGORY_ORDER.vatFinancing, "x")).toBe("Activate Tranche");
    expect(categoryCommandLabel("deactivate", CATEGORY_ORDER.decommissioning, "Decommissioning Costs"))
      .toBe("Deactivate Decommissioning Costs");
  });

  it("UT-FIN-802 categoryToggleDialog: title by Order, description by Name", () => {
    const active = CHOICE_FINANCE.status.active;
    const inactive = CHOICE_FINANCE.status.inactive;
    expect(categoryToggleDialog(active, CATEGORY_ORDER.decommissioning, "Decommissioning Costs")).toEqual({
      title: "Deactivate Decommissioning Cost",
      description: "Are you sure you want to deactivate Decommissioning Cost?",
      confirmText: "Deactivate",
    });
    expect(categoryToggleDialog(inactive, CATEGORY_ORDER.vatFinancing, "VAT Financing")).toEqual({
      title: "Activate Tranche",
      description: "Are you sure you want to activate tranche for VAT Financing Input?",
      confirmText: "Activate",
    });
  });

  it("UT-FIN-803 trancheActionDialog keeps the canvas 'Trache' typo and the quoted name", () => {
    expect(trancheActionDialog("activation", CHOICE_FINANCE.status.active, "Standard Assumptions")).toEqual({
      title: "Deactivate Trache",
      description: 'Are you sure you want to Deactivate "Standard Assumptions" tranche?',
    });
    expect(trancheActionDialog("deletion", CHOICE_FINANCE.status.active, "Term Sheet - *KfW*")).toEqual({
      title: "Delete Tranche",
      description: 'Are you sure you want to Delete "Term Sheet - *KfW*" tranche?',
    });
  });

  it("UT-FIN-804 dsraToggleDialog", () => {
    expect(dsraToggleDialog(CHOICE_FINANCE.status.inactive)).toEqual({
      title: "Activate DSRA/DSRF...",
      description: "Are you sure you want to activate DSRA/DSRF ?",
    });
  });

  it("UT-FIN-805 duration option names: 0 and 1 are singular", () => {
    expect(durationOptionName(0, "year")).toBe("0 year");
    expect(durationOptionName(1, "month")).toBe("1 month");
    expect(durationOptionName(25, "year")).toBe("25 years");
    expect(durationRange(3)).toEqual([0, 1, 2, 3]);
  });

  it("UT-FIN-806 toDebtTech and currencySuffix", () => {
    expect(toDebtTech("Wind")).toBe("wind");
    expect(toDebtTech("PV")).toBe("pv");
    expect(toDebtTech("Other")).toBe("other");
    expect(currencySuffix("Poland")).toBe("[PLN]");
    expect(currencySuffix(null)).toBe("[EUR]");
  });
});

/* ═══════════════════════════════════════════════════════ D34 — connected screen ══ */

const row = (
  id: string, categoryOrder: number, raw: Record<string, unknown> = {}, status: number = CHOICE_FINANCE.status.active,
): FinancingInputRow => ({
  id, name: id, categoryId: `c${categoryOrder}`, categoryOrder, uniqueKeyString: null, status, raw,
  canEdit: true, canDelete: true,
});

const write = (plan: { writes: { data?: Record<string, unknown> }[] }, i = 0): Record<string, unknown> =>
  plan.writes[i]!.data ?? {};

describe("D34 — option values pinned to the generated enums", () => {
  it("UT-FIN-200 the Financing Inputs two-option columns are booleans, and CHOICE_FINANCE carries booleans", () => {
    const sample: Pick<Vsb_financinginputsBase, "vsb_isfolded" | "vsb_kfwtranche" | "vsb_trackstatusactive" | "vsb_isdeactivatedbybutton" | "vsb_stepupbankmargin" | "vsb_swapafterfixedperiod"> = {
      vsb_isfolded: CHOICE_FINANCE.isFolded.true,
      vsb_kfwtranche: CHOICE_FINANCE.yesNo.yes,
      vsb_trackstatusactive: CHOICE_FINANCE.yesNo.no,
      vsb_isdeactivatedbybutton: CHOICE_FINANCE.yesNo.yes,
      vsb_stepupbankmargin: CHOICE_FINANCE.yesNo.no,
      vsb_swapafterfixedperiod: CHOICE_FINANCE.yesNo.no,
    };
    expect(sample.vsb_isfolded).toBe(true);
    expect(CHOICE_FINANCE.yesNo).toEqual({ yes: true, no: false });
  });

  it("UT-FIN-201 every Financing Inputs option set matches the pac-generated enum", () => {
    const keys = (o: object) => Object.keys(o).map(Number).sort();
    const vals = (o: object) => Object.values(o).map(Number).sort();
    expect(vals(CHOICE_FINANCE.baseRate)).toEqual(keys(Vsb_financinginputsvsb_baserate));
    expect(vals(CHOICE_FINANCE.commitmentFee)).toEqual(keys(Vsb_financinginputsvsb_commitmentfee));
    expect(vals(CHOICE_FINANCE.costsOfDecommissioning)).toEqual(keys(Vsb_financinginputsvsb_costsofdecommissioning));
    expect(vals(CHOICE_FINANCE.drawdown)).toEqual(keys(Vsb_financinginputsvsb_drawdown));
    expect(vals(CHOICE_FINANCE.dsraOriginalStatusActive)).toEqual(keys(Vsb_financinginputsvsb_dsradsrforiginalstatusactive));
    expect(vals(CHOICE_FINANCE.energyYieldDebtSizing)).toEqual(keys(Vsb_financinginputsvsb_energyyielddebtsizing));
    expect(vals(CHOICE_FINANCE.fixedAmount)).toEqual(keys(Vsb_financinginputsvsb_fixedamount));
    expect(vals(CHOICE_FINANCE.freeEquity)).toEqual(keys(Vsb_financinginputsvsb_freeequity));
    expect(vals(CHOICE_FINANCE.gearing)).toEqual(keys(Vsb_financinginputsvsb_gearing));
    expect(vals(CHOICE_FINANCE.repaymentProfile)).toEqual(keys(Vsb_financinginputsvsb_repaymentprofile));
    expect(vals(CHOICE_FINANCE.spotCurve)).toEqual(keys(Vsb_financinginputsvsb_spotcurvedebtsizing));
    expect(vals(CHOICE_FINANCE.trancheStatus)).toEqual(keys(Vsb_financinginputsvsb_tranchestatus));
    expect(vals(CHOICE_FINANCE.dsraDsrfType)).toEqual(keys(Vsb_financinginputsvsb_typedsradrsf));
    expect(vals(CHOICE_FINANCE.upfrontFee)).toEqual(keys(Vsb_financinginputsvsb_upfrontfee));
    expect(vals(CHOICE_FINANCE.vatFacilityAmount)).toEqual(keys(Vsb_financinginputsvsb_vatfacilityamount));
    expect(vals(CHOICE_FINANCE.financingOptions)).toEqual(keys(Vsb_projectsvsb_financingoptions));
    expect(vals(CHOICE_FINANCE.status)).toEqual(keys(Vsb_financinginputsstatecode));
    expect(vals(STATUS_REASON)).toEqual(keys(Vsb_financinginputsstatuscode));
    // Names, not only values: DSRF is the lower value, Per Turbine the lower value.
    expect(Vsb_financinginputsvsb_typedsradrsf[CHOICE_FINANCE.dsraDsrfType.dsrf]).toBe("DSRF");
    expect(Vsb_financinginputsvsb_costsofdecommissioning[CHOICE_FINANCE.costsOfDecommissioning.perTurbine]).toBe("PerTurbine");
    expect(Vsb_financinginputsvsb_repaymentprofile[CHOICE_FINANCE.repaymentProfile.individual]).toBe("Individual");
    expect(Vsb_projectsvsb_financingoptions[CHOICE_FINANCE.financingOptions.allEquity]).toBe("AllEquity");
  });
});

describe("D34 — verbatim validation texts", () => {
  it("UT-FIN-202 free equity: blank, percentage, range (unformatted cap) and the CAPEX texts", () => {
    const pct = "percentage", fix = "fixed";
    expect(validateFreeEquity("", pct, "Germany", 0).message).toBe("Input must not be blank");
    expect(validateFreeEquity("100.5", pct, "Germany", 0).message).toBe("Number from 0 to 100, with up to two decimal places");
    expect(validateFreeEquity("12.5", pct, "Germany", 0).valid).toBe(true);
    expect(validateFreeEquity("1.5", fix, "Germany", 1000).message).toBe("Numeric value in range 0 to 100000000");
    expect(validateFreeEquity("600000000", fix, "Poland", 0).message).toBe("Numeric value in range 0 to 500000000");
    expect(validateFreeEquity("2000", fix, "Germany", 1000).message).toBe("Free Equity must not be higher than Total CAPEX.");
    expect(validateFreeEquity("500", fix, "Germany", 1000).valid).toBe(true);
  });

  it("UT-FIN-203 senior-debt field texts", () => {
    expect(validateHedging("").message).toBe("Value must be in range 0 to 100 with max one decimal.");
    expect(validateHedging("80.5").valid).toBe(true);
    expect(validateRateField("10.5").message).toBe("value must be in range 0 to 10 with max two decimal.");
    expect(validateCommitmentFeeValue("100.123").message).toBe("Value must be in a range 0 to 100 with maximum two decimal place.");
    expect(validateUpfrontFee("101", CHOICE_FINANCE.upfrontFee.percentageOfDebt, "Germany").message)
      .toBe("value must be in range 0 to 100 with max two decimal.");
    expect(validateUpfrontFee("1.5", CHOICE_FINANCE.upfrontFee.fixed, "Poland").message)
      .toBe("value must be integer in range 0 to 5,000,000,000 without decimal.");
    expect(validateFixedAmount("85.55", CHOICE_FINANCE.fixedAmount.percentOfCapex, "Germany").message)
      .toBe("value must be in range 0 to 100 with max one decimal.");
    expect(validateFixedAmount("1.5", CHOICE_FINANCE.fixedAmount.fixedValue, "Germany").message)
      .toBe("value must be integer in range 0 to 1,000,000,000.");
    expect(validateRepaymentAmount("", "Germany").message)
      .toBe("value must be numeric in range 0 to 100,000,000 without decimal place.");
    expect(validateRepaymentAmount("1.5", "Poland").message)
      .toBe("value must be numeric in range 0 to 500,000,000 without decimal place.");
    expect(validateStepUpMargin("1.555").message).toBe("Numeric value with only two decimal is allowed");
    expect(validateDscr("3.00x").message).toBe("Enter a value between 1.00x and 2.50x with 2 decimals.");
    expect(validateDscr("3,00x", "de-DE").message).toBe("Enter a value between 1,00x and 2,50x with 2 decimals.");
  });

  it("UT-FIN-204 VAT, decommissioning and DSRA/DSRF texts", () => {
    expect(validateVatBankMargin("1.555").message).toBe("Numeric value with maximum of two decimals");
    expect(validateVatBankMargin("11").message).toBe("Please ensure Bank margin can be maximum 10");
    expect(validateDecommissioningValue("1.5", CHOICE_FINANCE.costsOfDecommissioning.total, "Germany").message)
      .toBe("Numeric value must be integer without decimal.");
    expect(validateDecommissioningValue("20000000", CHOICE_FINANCE.costsOfDecommissioning.total, "Germany").message)
      .toBe("Value must be in range 0 to 10,000,000");
    expect(validateDecommissioningValue("2000000", CHOICE_FINANCE.costsOfDecommissioning.perTurbine, "Germany").message)
      .toBe("Value must be in range 0 to 1,000,000");
    expect(validateCostOfGuarantee("").message).toBe("Numeric value with maximum of one decimal in range 0 to 9.9");
    expect(validateCostOfGuarantee("10").valid).toBe(false);
    expect(validateCostOfGuarantee("9.9").valid).toBe(true);
    expect(validateCostOfGuarantee("", "de-DE").message).toBe("Numeric value with maximum of one decimal in range 0 to 9,9");
    expect(validateDsraMargin("-6", CHOICE_FINANCE.dsraDsrfType.dsra).message)
      .toBe("Value must be in a range -5 to 10 with maximum two decimal place.");
    expect(validateDsraMargin("-1", CHOICE_FINANCE.dsraDsrfType.dsrf).message)
      .toBe("Value must be in a range 0 to 10 with maximum two decimal place.");
    expect(validateDsraMargin("-1", CHOICE_FINANCE.dsraDsrfType.dsra).valid).toBe(true);
    expect(validateDsraUpfrontFee("11").message).toBe("Value must be in a range 0 to 10 with maximum two decimal place.");
    expect(validatePofds("50.55").message).toBe("Value must be in a range 0 to 100 with maximum one decimal place.");
    expect(validatePofds("50.5").valid).toBe(true);
  });

  it("UT-FIN-205 the six decommissioning date checks (S21)", () => {
    const p = project();
    expect(validateDateOfIssue(d("2025-12-31"), p).message).toBe("Date of Issue must not be earlier than the cluster 4.");
    expect(validateDateOfIssue(d("2056-01-01"), p).message).toBe("Date of Issue must not be later than the Project End Date.");
    expect(validateDateOfIssue(d("2027-03-01"), p).valid).toBe(true);
    expect(validateStartDateOfSaving(d("2027-12-31"), d("2027-03-01"), p).message).toBe("Start Date of Saving must not be earlier than the COD.");
    expect(validateStartDateOfSaving(d("2056-01-01"), d("2027-03-01"), p).message).toBe("Start Date of Saving must not be later than the Project End Date.");
    expect(validateStartDateOfSaving(d("2028-01-01"), d("2029-01-01"), p).message).toBe("Start Date of Saving must be later than Date of Issue.");
    expect(validateDateOfExpiry(d("2027-12-31"), d("2027-03-01"), p).message).toBe("Date of Expiry must not be earlier than the COD Date");
    expect(validateDateOfExpiry(d("2056-01-01"), d("2027-03-01"), p).message).toBe("Date of Expiry must not be later than the Project End Date.");
    expect(validateDateOfExpiry(d("2029-01-01"), d("2029-06-01"), p).message).toBe("Date of Expiry must be later than the Date of Issue.");
    expect(validateDateOfExpiry(d("2055-12-31"), d("2027-03-01"), p).valid).toBe(true);
  });

  it("UT-FIN-206 SOURCE DEFECT: an expiry ON the issue date shows its message (canvas: visible, blank text)", () => {
    const p = project();
    expect(validateDateOfExpiry(d("2029-01-01"), d("2029-01-01"), p)).toEqual({ valid: false, message: MSG.expiryBeforeIssue });
    expect(dateOfExpiryMessageCanvasParity(d("2029-01-01"), d("2029-01-01"), p)).toBe("");
  });
});

describe("D34 — panel save gates", () => {
  const decom = (over: Partial<DecommissioningForm> = {}): DecommissioningForm => ({
    costType: CHOICE_FINANCE.costsOfDecommissioning.total, value: "800000", guarantee: "1.2",
    dateOfIssue: d("2027-03-01"), startDateOfSaving: d("2028-01-01"), dateOfExpiry: d("2055-12-31"),
    years: 15, months: 0, flags: { ...DEFAULT_DECOMMISSIONING_FLAGS }, dirty: true, ...over,
  });
  const dsra = (over: Partial<DsraForm> = {}): DsraForm => ({
    type: CHOICE_FINANCE.dsraDsrfType.dsra, commitmentFee: "", cfYears: null, cfMonths: null,
    baseRate: CHOICE_FINANCE.baseRate.euribor3M, margin: "1.25", upfrontFee: "", percentage: "100.0",
    durYears: 0, durMonths: 6, endOfSavings: d("2045-12-31"), flags: { ...DEFAULT_DSRA_FLAGS }, ...over,
  });

  it("UT-FIN-207 the Decommissioning Save follows the canvas DisplayMode term for term (S19)", () => {
    const p = project();
    expect(canSaveDecommissioning(decom(), p, "Germany")).toBe(true);
    expect(canSaveDecommissioning(decom({ dirty: false }), p, "Germany")).toBe(false);
    expect(canSaveDecommissioning(decom({ guarantee: "" }), p, "Germany")).toBe(false);
    expect(canSaveDecommissioning(decom({ months: null }), p, "Germany")).toBe(false);
    expect(canSaveDecommissioning(decom({ years: 0, months: 0 }), p, "Germany")).toBe(false);
    expect(canSaveDecommissioning(decom({ years: 35 }), p, "Germany")).toBe(false); // ends after End Date
    expect(canSaveDecommissioning(decom({ dateOfIssue: d("2025-01-01") }), p, "Germany")).toBe(false);
    expect(canSaveDecommissioning(decom({ dateOfExpiry: d("2027-03-01") }), p, "Germany")).toBe(false);
  });

  it("UT-FIN-208 the DSRA/DSRF Save follows the canvas DisplayMode (S20)", () => {
    const cod = d("2028-01-01");
    expect(canSaveDsra(dsra(), cod)).toBe(true);
    expect(canSaveDsra(dsra({ margin: "" }), cod)).toBe(false);
    expect(canSaveDsra(dsra({ baseRate: null }), cod)).toBe(false);
    expect(canSaveDsra(dsra({ percentage: "100.55" }), cod)).toBe(false);
    expect(canSaveDsra(dsra({ durYears: 0, durMonths: 0 }), cod)).toBe(false);
    expect(canSaveDsra(dsra({ endOfSavings: d("2027-01-01") }), cod)).toBe(false);
    const dsrf = CHOICE_FINANCE.dsraDsrfType.dsrf;
    expect(canSaveDsra(dsra({ type: dsrf }), cod)).toBe(false);
    expect(canSaveDsra(dsra({ type: dsrf, upfrontFee: "0.5", commitmentFee: "0.35", margin: "1.25" }), cod)).toBe(true);
    expect(canSaveDsra(dsra({ type: dsrf, upfrontFee: "11", commitmentFee: "0.35" }), cod)).toBe(false);
  });
});

describe("D34 — SOURCE DEFECTs fixed (each with its canvas twin)", () => {
  it("UT-FIN-209 the percentage Shareholder Loan is computed for a decimal free equity", () => {
    expect(shareholderLoan("percentage", "12.5", 0)).toBe(87.5);
    expect(shareholderLoanCanvasParity("percentage", "12.5", 0)).toBeNull();
    expect(shareholderLoanCanvasParity("percentage", "10", 0)).toBe(90);
    expect(shareholderLoan("fixed", "300", 1000)).toBe(700);
    expect(shareholderLoan("fixed", "x", 1000)).toBe(1000);
  });

  it("UT-FIN-210 Remove Last Period deletes the removed stored step-up row; the canvas kept it", () => {
    const stored = [
      { id: "s1", order: 1, startYear: 1, duration: 5, margin: 1.25 },
      { id: "s2", order: 2, startYear: 5, duration: 5, margin: 1.5 },
    ];
    const rows = [stepUp(1, 10, "1.25")];
    expect(stepUpWrites(true, rows, stored).toDelete).toEqual(["s2"]);
    expect(stepUpWritesCanvasParity(true, rows, stored).toDelete).toEqual([]);
    // Both upsert row 1 onto the stored row of the same Order.
    expect(stepUpWritesCanvasParity(true, rows, stored).toUpsert[0]!.id).toBe("s1");
    expect(stepUpWrites(false, rows, stored).toDelete).toEqual(["s1", "s2"]);
  });

  it("UT-FIN-211 a stored Pro Rata drawdown reopens as Pro Rata; the canvas 'Pro Rate' made it Equity First", () => {
    expect(drawdownDefault(CHOICE_FINANCE.drawdown.proRata, null)).toBe(CHOICE_FINANCE.drawdown.proRata);
    expect(drawdownDefaultCanvasParity(CHOICE_FINANCE.drawdown.proRata, null)).toBe(CHOICE_FINANCE.drawdown.equityFirst);
    expect(drawdownDefault(null, null)).toBe(CHOICE_FINANCE.drawdown.equityFirst);
    // The other radio defaults keep the canvas fallbacks.
    expect(energyYieldDefault(null, null)).toBe(CHOICE_FINANCE.energyYieldDebtSizing.p90);
    expect(spotCurveDefault(null, null)).toBe(CHOICE_FINANCE.spotCurve.lowCurve);
    expect(repaymentProfileDefault(null, null)).toBe(CHOICE_FINANCE.repaymentProfile.dscrSculpted);
    expect(commitmentFeeOptionDefault(null, null)).toBe(CHOICE_FINANCE.commitmentFee.percentageOfMargin);
  });

  it("UT-FIN-212 the DSRA duration reopens with the stored months; the canvas forced 0", () => {
    const f = openDsraForm(row("dsra", 4, { [INPUT_COL.durationOfFutureDebtServiceMmyy]: "0602" }));
    expect(f.durMonths).toBe(6);
    expect(f.durYears).toBe(2);
    expect(dsraDurationMonthsCanvasParity()).toBe(0);
  });
});

describe("D34 — write plans", () => {
  it("UT-FIN-213 the category toggle writes the status pair and blanks 'Is Deactivated By Button' on activate", () => {
    expect(toggleCategoryStatus({ status: CHOICE_FINANCE.status.active }))
      .toEqual({ status: CHOICE_FINANCE.status.inactive, isDeactivatedByButton: true });
    expect(toggleCategoryStatus({ status: CHOICE_FINANCE.status.inactive }))
      .toEqual({ status: CHOICE_FINANCE.status.active, isDeactivatedByButton: null });
    const plan = planCategoryToggle(row("vat", 2));
    expect(plan.writes[0]).toMatchObject({ op: "update", entitySet: "vsb_financinginputs", id: "vat" });
    expect(write(plan)).toEqual({ statecode: 1, statuscode: 2, vsb_isdeactivatedbybutton: true });
    expect(planCategoryToggle(null).refusedReason).toBe(FINANCE_SCREEN_TEXT.noInput);
  });

  it("UT-FIN-214 the tranche and DSRA toggles write the canvas columns only", () => {
    expect(write(planTrancheToggle(row("t", 3)))).toEqual({
      statecode: 1, statuscode: 2, vsb_trackstatusactive: false, vsb_isdeactivatedbybutton: true,
    });
    expect(write(planTrancheToggle(row("t", 3, {}, CHOICE_FINANCE.status.inactive)))).toEqual({
      statecode: 0, statuscode: 1, vsb_trackstatusactive: true,
    });
    expect(write(planDsraToggle(row("d", 4)))).toEqual({
      statecode: 1, statuscode: 2, vsb_dsradsrforiginalstatusactive: CHOICE_FINANCE.dsraOriginalStatusActive.no,
    });
  });

  it("UT-FIN-215 the financing option writes the project, then VAT, the tranches and the DSRA/DSRF, in that order", () => {
    const inputs = [
      row("dsra", 4, { [INPUT_COL.dsraOriginalStatusActive]: CHOICE_FINANCE.dsraOriginalStatusActive.yes }),
      row("t1", 3, { [INPUT_COL.trackStatusActive]: true }),
      row("vat", 2, { [INPUT_COL.isDeactivatedByButton]: null }),
      row("t2", 3, { [INPUT_COL.trackStatusActive]: false }),
      row("eq", 1),
    ];
    const plan = planFinancingOption(project(), CHOICE_FINANCE.financingOptions.allEquity, inputs);
    expect(plan.writes.map((w) => w.id)).toEqual(["P1", "vat", "t1", "t2", "dsra"]);
    expect(plan.writes[0]).toMatchObject({ entitySet: "vsb_projects", data: { vsb_financingoptions: CHOICE_FINANCE.financingOptions.allEquity } });
    expect(plan.writes.slice(1).every((w) => w.data?.statecode === CHOICE_FINANCE.status.inactive)).toBe(true);
    const back = planFinancingOption(project(), CHOICE_FINANCE.financingOptions.debtFinancing, inputs);
    expect(back.writes.map((w) => w.data?.statecode)).toEqual([undefined, 0, 0, 1, 0]);
  });

  it("UT-FIN-216 OnVisible writes 'Debt Financing' only while the column is blank (SOURCE DEFECT 2)", () => {
    expect(write(planFinancingOptionOnVisit(project())!)).toEqual({ vsb_financingoptions: CHOICE_FINANCE.financingOptions.debtFinancing });
    expect(planFinancingOptionOnVisit(project({ financingOptions: CHOICE_FINANCE.financingOptions.allEquity }))).toBeNull();
  });

  it("UT-FIN-217 without Fabric SQL only the Equity and VAT seeds are created; each a create with the canvas columns", () => {
    const seeds = planSeeds(project(), buildCategoryMap(categories), [], stdAt(2027),
      buildDsraStandard(dsraRows, "wind"), buildDecommissioningStandard(decRows, "wind", project()));
    expect(seedsAllowed(seeds, false).map((x) => x.category)).toEqual(["equity", "vatFinancing"]);
    expect(seedsAllowed(seeds, true)).toHaveLength(5);
    const w = seedWrite(seeds[0]!, project());
    expect(w).toMatchObject({ op: "create", entitySet: "vsb_financinginputs" });
    expect(w.data).toEqual({
      vsb_name: "Windpark Nord-Equity", vsb_uniquekeystring: "P1-Equity",
      "vsb_Project@odata.bind": "/vsb_projects(P1)", "vsb_FinancingCategory@odata.bind": "/vsb_financingcategories(c1)",
      vsb_freeequity: CHOICE_FINANCE.freeEquity.percentage, vsb_freeequityvalue: 10, vsb_shareholderloanvalue: 90,
      vsb_isstandardvalue: '[{"locIsStandardFreeEquity":true,"locIsStandardShareholderLoan":true}]',
      "owningbusinessunit@odata.bind": "/businessunits(bu-1)",
    });
    const jobs = seedJobs(seedsAllowed(seeds, false), project());
    expect(jobs[1]!.errorText!("boom")).toBe("Error while creating VAT-Financing financing input: boom");
    expect(NOTIFY.seed("dsraDsrf", "x")).toBe("Error while creating Debt Service Reserve Account / Facility financing input: x");
  });

  it("UT-FIN-218 the Equity Save writes the flags JSON for Percentage and Blank for Fixed Value, no owner", () => {
    const eq = row("eq", 1);
    const pct = planEquitySave({ project: project(), row: eq, form: { mode: "percentage", value: "12.5", flags: { locIsStandardFreeEquity: false, locIsStandardShareholderLoan: false } }, totalCapex: 0 });
    expect(write(pct)).toEqual({
      vsb_name: "Windpark Nord-Equity", "vsb_FinancingCategory@odata.bind": "/vsb_financingcategories(c1)",
      vsb_freeequity: CHOICE_FINANCE.freeEquity.percentage, vsb_freeequityvalue: 12.5, vsb_shareholderloanvalue: 87.5,
      "vsb_Project@odata.bind": "/vsb_projects(P1)",
      vsb_isstandardvalue: '[{"locIsStandardFreeEquity":false,"locIsStandardShareholderLoan":false}]',
    });
    const fixed = planEquitySave({ project: project(), row: eq, form: { mode: "fixed", value: "300", flags: { locIsStandardFreeEquity: false, locIsStandardShareholderLoan: false } }, totalCapex: 1000 });
    expect(write(fixed).vsb_isstandardvalue).toBeNull();
    expect(write(fixed).vsb_shareholderloanvalue).toBe(700);
    expect(planEquitySave({ project: project(), row: null, form: openEquityForm(null), totalCapex: 0 }).refusedReason).toBe(FINANCE_SCREEN_TEXT.noInput);
  });

  it("UT-FIN-219 the VAT, Decommissioning and DSRA/DSRF Saves write the canvas columns", () => {
    const vat = planVatSave({ project: project(), row: row("vat", 2), form: vatForm({ amount: "500" }) });
    expect(write(vat)).toMatchObject({
      vsb_name: "Windpark Nord-VAT-Financing", vsb_baserate: CHOICE_FINANCE.baseRate.euribor3M, vsb_bankmargin: 1.5,
      vsb_vatfacilityamount: CHOICE_FINANCE.vatFacilityAmount.calculated, vsb_vatfacilityamountvalue: 500,
      vsb_isstandardvalue: '[{"locIsStandardBaseRate":true,"locIsStandardBankMargin":true}]',
    });
    const dec = planDecommissioningSave({ row: row("dec", 5), form: {
      costType: CHOICE_FINANCE.costsOfDecommissioning.perTurbine, value: "60000", guarantee: "1.2",
      dateOfIssue: d("2027-03-01"), startDateOfSaving: d("2028-01-01"), dateOfExpiry: d("2055-12-31"),
      years: 15, months: 6, flags: { ...DEFAULT_DECOMMISSIONING_FLAGS, CostofGuarantee: false }, dirty: true,
    } });
    expect(write(dec)).toEqual({
      vsb_costsofdecommissioning: CHOICE_FINANCE.costsOfDecommissioning.perTurbine, vsb_costsofdecommissioningvalue: 60000,
      vsb_costofguarantee: 1.2, vsb_dateofissue: "2027-03-01", vsb_startdateofsaving: "2028-01-01",
      vsb_dateofexpiry: "2055-12-31", vsb_durationofsaving: "0615",
      vsb_decommissioningstandardassumptionjson: serialiseStandardFlags({ ...DEFAULT_DECOMMISSIONING_FLAGS, CostofGuarantee: false }),
    });
    const dsraPlan = planDsraSave({ project: project(), row: row("dsra", 4), form: {
      type: CHOICE_FINANCE.dsraDsrfType.dsra, commitmentFee: "0.35", cfYears: 2, cfMonths: 0,
      baseRate: CHOICE_FINANCE.baseRate.euribor6M, margin: "-1.5", upfrontFee: "0.5", percentage: "100.0",
      durYears: 0, durMonths: 6, endOfSavings: d("2045-12-31"), flags: { ...DEFAULT_DSRA_FLAGS },
    } });
    expect(write(dsraPlan)).toMatchObject({
      vsb_name: "Windpark Nord-DSRF/DSRA", vsb_typedsradrsf: CHOICE_FINANCE.dsraDsrfType.dsra, vsb_margin: -1.5,
      vsb_commitmentfeevalue: null, vsb_commitmentfeeperiodyear: null, vsb_commitmentfeeperiodmonth: null,
      vsb_upfrontfeevalue: null, vsb_percentageoffuturedebtservice: 100, vsb_endofdebtservicesavings: "2045-12-31",
      vsb_durationoffuturedebtservicemmyy: "0600", "owningbusinessunit@odata.bind": "/businessunits(bu-1)",
    });
  });

  it("UT-FIN-220 a new tranche: create with the canvas columns, children bound to @created#0", () => {
    const form = seniorForm({
      repaymentProfile: CHOICE_FINANCE.repaymentProfile.individual,
      repaymentRows: [{ year: 2029, value: "1000", valid: true, dirty: true, repaymentAmountRecordId: null }],
      stepUpEnabled: true, stepUpRows: [stepUp(1, 10, "1.25")],
      swapAfterFixedPeriod: true, swapMargin: "0.10", bankRate: "2.50", financialCloseStandard: true,
      energyYield: CHOICE_FINANCE.energyYieldDebtSizing.p75, spotCurve: CHOICE_FINANCE.spotCurve.centralCurve,
    });
    const plan = planTrancheSave({ form, project: project(), seniorDebtCategoryId: "c3", duplicateIds: [], storedRepayments: [], storedStepUps: [] });
    expect(plan.writes.map((w) => `${w.op}:${w.entitySet}`)).toEqual([
      "create:vsb_financinginputs", "create:vsb_financinginputsrepaymentamounts", "create:vsb_financinginputstepupmarginses",
    ]);
    expect(write(plan)).toMatchObject({
      vsb_name: "Windpark Nord - Senior Debt", vsb_bank: "B7", vsb_otherbankname: null, vsb_kfwtranche: false,
      vsb_kfwtranchevalue: null, vsb_financialclose: "2026-12-01", vsb_dscrcontracteddecimal: 1.15,
      vsb_swapmargin: 0.1, vsb_bankrate: 2.5, vsb_swaprate: 2.7, vsb_isfolded: true, vsb_trackstatusactive: true,
      vsb_energyyielddebtsizing: CHOICE_FINANCE.energyYieldDebtSizing.p75,
      vsb_seniordebtstandardassumptionjson: '[{"FinancialCloseDate":true}]',
      vsb_uniquekeystring: "P1-SeniorDebt-termsheet-bank-B7-nokfw",
      "owningbusinessunit@odata.bind": "/businessunits(bu-1)", "vsb_FinancingCategory@odata.bind": "/vsb_financingcategories(c3)",
    });
    expect(write(plan, 1)).toMatchObject({
      vsb_name: "2029 - Value", vsb_repaymentamount: 1000, vsb_repaymentyear: "2029",
      "vsb_FinancingInput@odata.bind": "/vsb_financinginputs(@created#0)",
    });
    expect(write(plan, 2)).toMatchObject({
      vsb_name: "10 - Value", vsb_duration: 10, vsb_margin: 1.25, vsb_startyear: 1, vsb_order: 1,
      "vsb_FinancingInput@odata.bind": "/vsb_financinginputs(@created#0)",
    });
  });

  it("UT-FIN-221 an edited tranche keeps its Track Status, deletes the repayments of a non-Individual profile, and refuses a duplicate", () => {
    const form = seniorForm({ trancheId: "t1", trackStatusActive: false, financialCloseStandard: false });
    const stored = [{ id: "r1", year: 2029, financingInputId: "t1" }, { id: "r9", year: 2029, financingInputId: "other" }];
    const plan = planTrancheSave({ form, project: project(), seniorDebtCategoryId: "c3", duplicateIds: ["t1"], storedRepayments: stored, storedStepUps: [] });
    expect(plan.writes.map((w) => `${w.op}:${w.id}`)).toEqual(["update:t1", "delete:r1"]);
    expect(write(plan)).toMatchObject({ vsb_trackstatusactive: false, vsb_seniordebtstandardassumptionjson: null });
    const dup = planTrancheSave({ form, project: project(), seniorDebtCategoryId: "c3", duplicateIds: ["t2"], storedRepayments: [], storedStepUps: [] });
    expect(dup.refusedReason).toBe("Same senior debt tranche already exists for this project.");
    expect(trancheSaveJob(async () => dup).errorText!("x")).toBe("Error while saving Senior Debt tranche: x");
  });

  it("UT-FIN-222 the tranche Delete removes step-ups, then repayments, then the tranche", () => {
    const plan = planTrancheDelete("t1",
      [{ id: "s1", financingInputId: "t1" }, { id: "s2", financingInputId: "x" }],
      [{ id: "r1", financingInputId: "t1" }]);
    expect(plan.writes.map((w) => `${w.entitySet}:${w.id}`)).toEqual([
      "vsb_financinginputstepupmarginses:s1", "vsb_financinginputsrepaymentamounts:r1", "vsb_financinginputs:t1",
    ]);
    expect(trancheToggleJob(plan).errorText!("Denied")).toBe("Denied : Error Occured while Tranche Status change");
  });

  it("UT-FIN-223 the spinner texts are the canvas ones", () => {
    expect(categoryToggleSpinner(CHOICE_FINANCE.status.active, CATEGORY_ORDER.decommissioning)).toBe("Please wait, Deactivating Decommissioning Cost...");
    expect(categoryToggleSpinner(CHOICE_FINANCE.status.inactive, CATEGORY_ORDER.vatFinancing)).toBe("Please wait, Activating tranche...");
    expect(dsraToggleSpinner(CHOICE_FINANCE.status.active)).toBe("Please wait, deactivating DSRA/DSRF...");
    expect(dsraToggleSpinner(CHOICE_FINANCE.status.inactive)).toBe("Please wait, activating DSRA/DSRF...");
    expect(SPINNER).toEqual({
      saving: "Please wait, Saving...", equity: "Saving Financing Input for Equity...",
      vat: "Saving Financing Input for VAT Financing...", decommissioning: "Saving Financing Input for Decommissioning Costs...",
      dsra: "Please wait, saving...",
    });
  });
});

describe("D34 — panel opening and form behaviour", () => {
  it("UT-FIN-224 Add Tranche opens dirty with the standard; Edit opens clean with the stored values and FC flag", () => {
    const add = openTrancheForm({ existing: null, project: project(), standard: stdAt(2027), banks: [], tranches: [] });
    expect(add.formDirty).toBe(true);
    expect(add.financialCloseStandard).toBe(true);
    expect(add.tenorYears).toBe(18);
    expect(add.hedging).toBe("85.0");
    const stored = row("t1", 3, {
      [INPUT_COL.trancheStatus]: CHOICE_FINANCE.trancheStatus.creditAgreement, [INPUT_COL.bank]: OTHER_BANK_SENTINEL,
      [INPUT_COL.otherBankName]: "Landesbank", [INPUT_COL.drawdown]: CHOICE_FINANCE.drawdown.proRata,
      [INPUT_COL.swapRate]: 2.7, [INPUT_COL.hedging]: 80, [INPUT_COL.financialClose]: "2027-01-31",
      [INPUT_COL.seniorDebtStandardAssumptionJson]: '[{"FinancialCloseDate":true}]', [INPUT_COL.trackStatusActive]: false,
    });
    const edit = openTrancheForm({ existing: stored, project: project(), standard: stdAt(2027), banks: [], tranches: [stored] });
    expect(edit.formDirty).toBe(false);
    expect(edit.storedTrancheStatus).toBe(CHOICE_FINANCE.trancheStatus.creditAgreement);
    expect(edit.bankName).toBe("Other");
    expect(edit.drawdown).toBe(CHOICE_FINANCE.drawdown.proRata);
    expect(edit.swapRate).toBe("2.7");
    expect(edit.hedging).toBe("80.0");
    expect(edit.financialClose).toEqual(d("2027-01-31"));
    expect(edit.financialCloseStandard).toBe(true);
    expect(edit.trackStatusActive).toBe(false);
    expect(edit.tenorYears).toBeNull(); // Edit blanks the standard
    expect(edit.otherTranches).toEqual([]);
  });

  it("UT-FIN-225 changing the tranche status to Standard Assumption re-applies the standard and resets the FC flag", () => {
    const form = { ...seniorForm({ trancheId: "t1", hedging: "50.0" }), financialCloseStandard: false };
    const next = applyTrancheStatusChange({ form, next: CHOICE_FINANCE.trancheStatus.standardAssumption, project: project(), standard: stdAt(2027), banks: [], tranches: [] });
    expect(next.trancheStatus).toBe(CHOICE_FINANCE.trancheStatus.standardAssumption);
    expect(next.trancheId).toBe("t1");
    expect(next.hedging).toBe("85.0");
    expect(next.formDirty).toBe(true);
    expect(next.financialCloseStandard).toBe(true);
    const ts = applyTrancheStatusChange({ form, next: CHOICE_FINANCE.trancheStatus.creditAgreement, project: project(), standard: stdAt(2027), banks: [], tranches: [] });
    expect(ts.hedging).toBe("50.0");
    expect(ts.financialCloseStandard).toBe(true);
  });

  it("UT-FIN-226 the VAT base rate default: Poland Wibor 3M always, else Euribor 3M while standard, else stored", () => {
    const std = { locIsStandardBaseRate: true, locIsStandardBankMargin: true };
    const own = { locIsStandardBaseRate: false, locIsStandardBankMargin: true };
    expect(vatBaseRateDefault("Poland", own, CHOICE_FINANCE.baseRate.wibor6M)).toBe(CHOICE_FINANCE.baseRate.wibor3M);
    expect(vatBaseRateDefault("Germany", std, CHOICE_FINANCE.baseRate.euribor6M)).toBe(CHOICE_FINANCE.baseRate.euribor3M);
    expect(vatBaseRateDefault("Germany", own, CHOICE_FINANCE.baseRate.euribor6M)).toBe(CHOICE_FINANCE.baseRate.euribor6M);
    expect(openVatForm(row("vat", 2, { [INPUT_COL.isStandardValue]: '[{"locIsStandardBaseRate":false,"locIsStandardBankMargin":true}]', [INPUT_COL.baseRate]: CHOICE_FINANCE.baseRate.euribor1M }), "Germany").baseRate)
      .toBe(CHOICE_FINANCE.baseRate.euribor1M);
  });

  it("UT-FIN-227 the DSRA Type change re-standardises with Fabric SQL and only changes the type without it", () => {
    const f = openDsraForm(row("dsra", 4, { [INPUT_COL.margin]: 1.1, [INPUT_COL.dsraStandardAssumptionsJson]: "[]" }));
    const end = d("2045-12-31");
    const without = applyDsraTypeChange(f, CHOICE_FINANCE.dsraDsrfType.dsrf, null, end);
    expect(without.type).toBe(CHOICE_FINANCE.dsraDsrfType.dsrf);
    expect(without.margin).toBe("1.1");
    expect(without.flags.locIsStandardMargin).toBe(false);
    expect(without.endOfSavings).toEqual(end);
    const withStd = applyDsraTypeChange(f, CHOICE_FINANCE.dsraDsrfType.dsrf, buildDsraStandard(dsraRows, "wind"), end);
    expect(withStd.margin).toBe("1.25");
    expect(withStd.flags).toEqual(DEFAULT_DSRA_FLAGS);
    expect(withStd.durYears).toBe(6);
  });

  it("UT-FIN-228 the decommissioning and DSRA panels open with the stored values", () => {
    const dec = openDecommissioningForm(row("dec", 5, {
      [INPUT_COL.costOfGuarantee]: 1.2, [INPUT_COL.durationOfSaving]: "0015", [INPUT_COL.dateOfIssue]: "2027-03-01",
      [INPUT_COL.decommissioningStandardAssumptionJson]: '[{"CostofGuarantee":true}]',
    }));
    expect(dec).toMatchObject({ guarantee: "1.2", years: 15, months: 0, dateOfIssue: d("2027-03-01"), dirty: false });
    expect(dec.flags.CostofGuarantee).toBe(true);
    expect(dec.flags.DateofIssue).toBe(false);
    const dsra = openDsraForm(row("dsra", 4, {
      [INPUT_COL.commitmentFeePeriodMonth]: 3, [INPUT_COL.dsraStandardAssumptionsJson]: '[{"locIsStandardCommitmentFeeFreeDuration":true}]',
    }));
    expect(dsra.cfMonths).toBe(0); // `If(standardFlag, 0, stored)`
    expect(dsraCommitmentFeeMonthsDefault({ ...DEFAULT_DSRA_FLAGS, locIsStandardCommitmentFeeFreeDuration: false }, 3)).toBe(3);
  });

  it("UT-FIN-229 folding a category folds every input of it; a tranche folds as stored until toggled", () => {
    const t = row("t1", 3, { [INPUT_COL.isFolded]: false });
    const r1 = toggleCategoryFold(new Set([3]), 3, new Map(), [t, row("eq", 1)]);
    expect(r1.folded.has(3)).toBe(false);
    expect(r1.trancheFolded.get("t1")).toBe(true);
    expect(r1.trancheFolded.has("eq")).toBe(false);
    expect(isTrancheFolded(t, new Map())).toBe(false);
    expect(isTrancheFolded(t, new Map([["t1", true]]))).toBe(true);
  });

  it("UT-FIN-230 the step-up toggle seeds row 1 only with a valid FIR", () => {
    expect(canSeedStepUp(10, 0)).toBe(true);
    expect(canSeedStepUp(null, 0)).toBe(false);
    expect(canSeedStepUp(0, 0)).toBe(false);
    expect(firstStepUpRow()).toEqual({ id: 1, durationYY: null, margin: "", valid: false, recordId: null });
  });

  it("UT-FIN-231 the stored rows of a tranche become the panel rows", () => {
    expect(repaymentRowsOf("t1", [
      { id: "b", financingInputId: "t1", year: 2030, amount: 5 }, { id: "a", financingInputId: "t1", year: 2029, amount: 4 },
      { id: "c", financingInputId: "x", year: 2029, amount: 1 },
    ]).map((r) => r.year)).toEqual([2029, 2030]);
    expect(stepUpRowsOf("t1", [{ id: "s1", financingInputId: "t1", order: 1, startYear: 1, duration: 5, margin: 1.25 }]))
      .toEqual([{ id: 1, durationYY: 5, margin: "1.25", valid: true, recordId: "s1" }]);
  });

  it("UT-FIN-232 inputStatus reads the boolean memory columns", () => {
    expect(inputStatus(row("t", 3, { [INPUT_COL.trackStatusActive]: true, [INPUT_COL.isDeactivatedByButton]: false })))
      .toMatchObject({ trackStatusActive: true, isDeactivatedByButton: false, dsraOriginalStatusActive: null });
  });
});

describe("D34 — card formats", () => {
  it("UT-FIN-233 the card texts follow the canvas formats (U2–U6)", () => {
    expect(fmtCard(80, CARD_FORMAT.hedging)).toBe("80.0");
    expect(fmtCard(1.5, CARD_FORMAT.rate)).toBe("1.5");
    expect(fmtCard(1.555, CARD_FORMAT.rate)).toBe("1.56");
    expect(fmtCard(1, CARD_FORMAT.costOfGuarantee)).toBe("1.0");
    expect(fmtCard(1234567, CARD_FORMAT.amount)).toBe("1,234,567");
    expect(fmtLongDate(d("2026-10-20"), "en-US")).toBe("Tuesday, October 20, 2026");
    expect(commitmentFeeFreePeriodLabel(1, null)).toBe("");
    expect(commitmentFeeFreePeriodLabel(1, 6)).toBe("01 Year 06 Months");
    expect(dsraPeriodLabel(2, 0)).toBe("2 Years 0 Month ");
    expect(dsraPeriodLabel(1, 6)).toBe("1 Year 6 Months");
    expect(decommissioningDurationLabel("0015")).toBe("15 Years 0 Months");
  });
});

describe("rule 20 — standard-assumption styling of the display cards", () => {
  it("UT-FIN-911 each card re-parses its own JSON column; a missing blob styles nothing", () => {
    const std = financeCardStandard({
      equity: row("eq", 1, { [INPUT_COL.isStandardValue]: '[{"locIsStandardFreeEquity":true,"locIsStandardShareholderLoan":false}]' }),
      vat: row("vat", 2, { [INPUT_COL.isStandardValue]: '[{"locIsStandardBaseRate":false,"locIsStandardBankMargin":true}]' }),
      decommissioning: row("dec", 5, { [INPUT_COL.decommissioningStandardAssumptionJson]: '[{"CostsofDecommissioningValue":true,"DateofIssue":"true"}]' }),
      dsra: null,
    });
    expect(std.equity).toEqual({ locIsStandardFreeEquity: true, locIsStandardShareholderLoan: false });
    expect(std.vat).toEqual({ locIsStandardBaseRate: false, locIsStandardBankMargin: true });
    expect(std.decommissioning.CostsofDecommissioningValue).toBe(true);
    expect(std.decommissioning.DateofIssue).toBe(true);
    expect(std.decommissioning.CostofGuarantee).toBe(false);
    expect(Object.values(std.dsra).every((v) => v === false)).toBe(true);
  });

  it("UT-FIN-912 the tranche card's Financial Close reads 'Senior Debt Standard Assumption JSON'.FinancialCloseDate", () => {
    expect(trancheFinancialCloseIsStandard(row("t", 3, { [INPUT_COL.seniorDebtStandardAssumptionJson]: '[{"FinancialCloseDate":true}]' }))).toBe(true);
    expect(trancheFinancialCloseIsStandard(row("t", 3, { [INPUT_COL.seniorDebtStandardAssumptionJson]: '{"FinancialCloseDate":false}' }))).toBe(false);
    expect(trancheFinancialCloseIsStandard(row("t", 3))).toBe(false);
  });
});

/* ════════════════════════════════════════ validation audit (21 Oct 2026) ══ */


describe("FINANCE-VALIDATION-AUDIT fixes (21 Oct 2026)", () => {
  it("UT-FIN-234 the Equity Save stores the Fixed Value loan as shown (whole units); Percentage stays exact", () => {
    expect(shareholderLoanToSave("fixed", "300", 1000.6)).toBe(701);
    expect(shareholderLoan("fixed", "300", 1000.6)).toBeCloseTo(700.6);
    expect(shareholderLoanToSave("percentage", "12.5", 0)).toBe(87.5);
    expect(shareholderLoanToSave("percentage", "", 0)).toBeNull();
    const plan = planEquitySave({
      project: project(), row: row("eq", 1),
      form: { mode: "fixed", value: "300", flags: { locIsStandardFreeEquity: false, locIsStandardShareholderLoan: false } },
      totalCapex: 1000.6,
    });
    expect(write(plan).vsb_shareholderloanvalue).toBe(701);
  });

  it("UT-FIN-235 the Fixed Amount option is blank on Add and the stored one on Edit; a blank option shows no error", () => {
    const add = openTrancheForm({ existing: null, project: project(), standard: stdAt(2027), banks: [], tranches: [] });
    expect(add.fixedAmountOption).toBeNull();
    const edit = openTrancheForm({
      existing: row("t1", 3, { [INPUT_COL.fixedAmount]: CHOICE_FINANCE.fixedAmount.fixedValue, [INPUT_COL.fixedAmountValue]: 5000000 }),
      project: project(), standard: null, banks: [], tranches: [],
    });
    expect(edit.fixedAmountOption).toBe(CHOICE_FINANCE.fixedAmount.fixedValue);
    expect(edit.fixedAmountValue).toBe("5000000");
    expect(validateFixedAmount("12.34", null, "Germany").valid).toBe(true);
    expect(validateFixedAmount("12.34", CHOICE_FINANCE.fixedAmount.percentOfCapex, "Germany").valid).toBe(false);
    expect(trancheRecord(seniorForm({ fixedAmountOption: null }), project(), "c3")[INPUT_COL.fixedAmount]).toBeNull();
  });

  it("UT-FIN-236 a blank month reads 0 once its years are set (the four tranche month dropdowns)", () => {
    expect(trancheMonthDefault(null, null, 5)).toBe(0);
    expect(trancheMonthDefault(null, null, null)).toBeNull();
    expect(trancheMonthDefault(3, 0, 5)).toBe(3);
    expect(trancheMonthDefault(null, 6, null)).toBe(6);
    const edit = openTrancheForm({
      existing: row("t1", 3, { [INPUT_COL.tenorDurationYear]: 15, [INPUT_COL.fixedInterestRateYear]: 10 }),
      project: project(), standard: null, banks: [], tranches: [],
    });
    expect(edit.tenorMonths).toBe(0);
    expect(edit.fixedInterestRateMonths).toBe(0);
    expect(edit.startRepaymentMonths).toBeNull();
  });

  it("UT-FIN-237 a status change to/from Standard Assumption blanks the selection: title, Track Status and later changes", () => {
    const form = { ...seniorForm({ trancheId: "t1", hedging: "50.0", trancheStatus: CHOICE_FINANCE.trancheStatus.standardAssumption }),
      storedTrancheStatus: CHOICE_FINANCE.trancheStatus.standardAssumption, trackStatusActive: false };
    expect(trancheFormTitle(form)).toBe("Edit Tranche");
    const ts = applyTrancheStatusChange({ form, next: CHOICE_FINANCE.trancheStatus.termSheet, project: project(), standard: stdAt(2027), banks: [], tranches: [] });
    expect(ts.trancheId).toBe("t1");
    expect(ts.storedTrancheStatus).toBeNull();
    expect(ts.trackStatusActive).toBeNull();
    expect(trancheFormTitle(ts)).toBe(FIN_LABEL.addTrancheTitle);
    expect(trancheRecord(ts, project(), "c3")[INPUT_COL.trackStatusActive]).toBe(true);
    // Term Sheet → Credit Agreement is now the plain third branch: the typed values stay.
    const typed = { ...ts, hedging: "77.0" };
    const ca = applyTrancheStatusChange({ form: typed, next: CHOICE_FINANCE.trancheStatus.creditAgreement, project: project(), standard: stdAt(2027), banks: [], tranches: [] });
    expect(ca.hedging).toBe("77.0");
    expect(trancheFormTitle({ trancheId: null })).toBe("Add Tranche");
  });

  it("UT-FIN-238 the repayment schedule is rebuilt only for Individual with all four dropdowns set", () => {
    const f = { repaymentProfile: CHOICE_FINANCE.repaymentProfile.individual, tenorYears: 15, tenorMonths: 0, startRepaymentYears: 1, startRepaymentMonths: 0 };
    expect(shouldRegenerateRepayments(f)).toBe(true);
    expect(shouldRegenerateRepayments({ ...f, startRepaymentMonths: null })).toBe(false);
    expect(shouldRegenerateRepayments({ ...f, tenorYears: null })).toBe(false);
    expect(shouldRegenerateRepayments({ ...f, repaymentProfile: CHOICE_FINANCE.repaymentProfile.straightLine })).toBe(false);
  });

  it("UT-FIN-239 Add Step-Up Period is disabled with no row; Add / Remove need the FIR years AND months", () => {
    expect(stepUpAddEnabled([], 10, false)).toBe(false);
    expect(stepUpPeriodChangeAllowed(10, 0)).toBe(true);
    expect(stepUpPeriodChangeAllowed(10, null)).toBe(false);
    expect(stepUpPeriodChangeAllowed(null, 0)).toBe(false);
    expect(stepUpPeriodChangeAllowed(0, 0)).toBe(false);
    expect(canSeedStepUp(10, null)).toBe(true); // the toggle's OnCheck ignores the months (commented out)
  });

  it("UT-FIN-240 a stored step-up margin reopens as Text(Margin, \"##0.00\")", () => {
    expect(stepUpFromStorage([{ order: 1, startYear: 1, duration: 5, margin: 1.5 }])[0]!.margin).toBe("1.50");
    expect(stepUpFromStorage([{ order: 1, startYear: 1, duration: 5, margin: 1.25 }])[0]!.margin).toBe("1.25");
  });

  it("UT-FIN-241 the panel MaxLength values and placeholders are the canvas ones", () => {
    expect(PANEL_MAX_LENGTH).toEqual({ freeEquity: 9, vatBankMargin: 6, vatFacilityAmount: 20, decommissioningValue: 15, other: 20 });
    expect([FIN_LABEL.findBank, FIN_LABEL.yearPlaceholder, FIN_LABEL.monthPlaceholder]).toEqual(["Find Bank", "Year", "Month"]);
  });
});
