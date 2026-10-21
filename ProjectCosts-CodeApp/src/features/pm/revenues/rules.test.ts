/**
 * Project Revenues Screen — unit tests.
 *
 * IDs are the spec's (`UT-REV-nnn`). Band XL, weighted to Calculation, because every
 * number on this screen feeds an investment decision.
 *
 * COVERAGE. This block used to carry two id lists headed "cases the spec lists that are
 * NOT here". They read as coverage and were not: six of the thirteen ids they named sit on
 * no `it()` in this repo at all, and the other seven do have their own case below — so the
 * lists are gone rather than patched. What is true, without an id list to misread:
 *  - The pure cores of the Binding / Integration / Error / Permission cases are pinned here
 *    under their own ids — `REVENUE_TABS`, `assumptionCountries`, `countryInflationValue`
 *    with the area term, `contractCommandBar`, `buildRevenuePayload`. The HTTP wiring in
 *    `hooks.ts` has no test.
 *  - The dialog / panel-lifecycle predicates are tested directly:
 *    `needsIndividualVolumesConfirmation`, `MSG.subaccountMissing` through
 *    `contractCommandBar`, `canSaveRevenueContract` with `formDirty = false`.
 */
import { describe, it, expect } from "vitest";
import { CHOICE, CHOICE_FINANCE } from "@/data/dataverseNames";
import { Vsb_projectrevenuesvsb_hedgetype, Vsb_projectrevenuesvsb_label } from "@/generated/models/Vsb_projectrevenuesModel";
import { Vsb_balancingpricesvsb_periods } from "@/generated/models/Vsb_balancingpricesModel";
import {
  REVENUE_TABS, DEFAULT_TAB, parseRevenueTab, REVENUE_FORM_LABEL, derivedFieldPlaceholder,
  pageLock, isPageLocked,
  provinceToPriceRegion, bareRegion, assumptionScope, inAssumptionScope, assumptionCountriesCanvas709,
  selectCountryAssumptions, pricePoolFor,
  assumptionNumber, techColumn, standardAssumptionExists, subContractTypeChange,
  descriptionFor, dropStandardPrefix, revenueTypePrefix,
  revenueCurrencyCode, assumptionEngineCurrencyCode,
  contractStartDate, contractDuration, contractEndDate, endDateWithGuard, endDateIsStandard,
  durationYearOptions, durationMonthOptions,
  priceForYear, priceForYearCanvasParity, p90Price, correctionFactorDefault,
  showsGermanFitBlock, germanFitTariff, tariffDisplay, tariffIsStandard,
  inflation, inflationStartYearFrom, countryInflationValue, applyCountryInflation,
  negativePriceState, flipNegativePrice,
  hedgeTypeOptions, resetOnHedgeTypeChange, generateVolumeRows, volumeRowLabel,
  validationMonths, overlappingHedgePercent, validateHedgedVolume, hedgeExceededMessage,
  nextPeriodValue, balancingPeriodName, firstPeriodStart, nextPeriodStart, newestPeriod,
  isNewestPeriod, showsShiftOfCod, balancingMonthOptions, balancingEndDate,
  validateTariff, validateBiddingPrice, validateCorrectionFactor,
  validateHedgedVolumePercent, validateVolumeMwh, validateInflationProfile,
  validateInflationStartYear, validateDescription, validateBalancingPrice,
  validateShiftOfCod, shiftOfCodMessageRuleCanvasParity,
  canSaveRevenueContract, needsIndividualVolumesConfirmation,
  buildRevenuePayload, revenueContractName, allValuesStandard, durationCellIsStandard,
  contractCommandBar, balancingCommandBar, rehydrateForEdit, hedgeTypeFromValue,
  field, overrideField, ALL_STANDARD_FLAG_KEYS, MSG,
  type AssumptionRow, type RevenueProject, type StandardFlags, type RevenueFormState,
  type BalancingPeriod, type OverlappingContract, type StoredRevenueContract,
  type HedgeState,
  NOTHING_STANDARD, revenuePanelStandard, validateSiteQuality, balancingYearOptions, balancingClusterReached, planSaveBalancing,
  planDeleteBalancing, REVENUE_SCREEN_TEXT, buildStandardFlags, buildStandardFlagsCanvasParity,
  planSaveContract, planDeleteContract, saveContractJob, deleteContractJob, saveBalancingJob,
  deleteBalancingJob, SPINNER, newContractForm, applyRevenueEngine, standardHedgedVolume, editField,
  shownDescription, withTerm, tariffP90Text, standardFromStored, editContractForm,
  toggleCountryInflation, changeInflationStartYear, sameInflationArea,
  countryInflationValueCanvasParity, resyncNegativePrice, fmtCardDate, fmtTariffCell,
  fmtSiteQualityCell, fmtHedgeCell, inflationCell, inflationCellCaption, showsAreaCell, sortContracts,
  contractCardFields, contractCardTitle, cardTariffPriceCaption, toggleContractFold, unfoldContract,
  CONTRACT_CARD_CONTROL, type CardField, type ContractCardContext,
  touchField, editFieldIfValid, resetStartToCod, negativePriceDisplayMode, showsCountryInflationToggle,
  hedgePercentForCheck, engineEndDate, fmtTwoDecimals,
} from "./rules";

/* ═══════════════════════════════════════════════════════════════════ fixtures ═══ */

const d = (s: string) => new Date(`${s}T00:00:00`);

const project = (over: Partial<RevenueProject> = {}): RevenueProject => ({
  id: "p1",
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
  ...over,
});

const row = (
  valuetype: string, category: string, wind: string | null, pv: string | null,
  country = "Germany",
): AssumptionRow => ({ country, valuetype, category, wind, pv });

const flags = (over: Partial<StandardFlags> = {}): StandardFlags => ({
  biddingPrice: true, contractDurationYears: true, contractDurationMonths: true,
  contractStartDate: true, contractEndDate: true, tariffPrice: true, tariffPriceP90: true,
  useInflationProfile: true, useCustomInflation: true, inflationProfileYear: true,
  customInflationProfile: true, hedgedVolume: true, correctionFactor: true,
  correctionFactorP90: true, ...over,
});

const hedge = (over: Partial<HedgeState> = {}): HedgeState => ({
  type: "percentage",
  percentage: field("70"),
  fixed: { ...field(""), initialState: true },
  individual: [],
  ...over,
});

const form = (over: Partial<RevenueFormState> = {}): RevenueFormState => ({
  mode: "New", formDirty: true, contractId: null, subaccountId: "sub-1",
  revenueTypeLabel: "PPA", description: "PPA Germany", currencyCode: "EUR",
  tariff: "65.00", tariffP90: "", biddingPrice: "", siteQuality: "", siteQualityP90: "",
  correctionFactor: "", correctionFactorP90: "",
  startDate: d("2028-01-01"), endDate: d("2043-06-30"),
  durationYears: 15, durationMonths: 6,
  hedge: hedge(),
  useInflation: false, useCountryInflationProfile: false,
  inflationProfile: "", inflationStartYear: "",
  considerNegativePrices: false, negativePriceManualOverride: false,
  isStandardContract: false, showsGermanFitBlock: false,
  technology: "Wind", country: "Germany", netYieldP50: 120_000,
  std: NOTHING_STANDARD,
  ...over,
});

/* ═══════════════════════════════════════════════════════ tabs and page lock ════ */

describe("tabs and page lock", () => {
  it("UT-REV-002 tab list is fixed and defaults to Contracted Revenue", () => {
    expect(REVENUE_TABS).toEqual(["Contracted Revenue", "Balancing Price"]);
    expect(DEFAULT_TAB).toBe("Contracted Revenue");
  });

  it("UT-REV-003 page lock shows when Net Yield p50 is zero", () => {
    const p = project({ netYieldP50: 0, clusterStateName: "Ready" });
    expect(isPageLocked(p)).toBe(true);
    expect(pageLock(p)).toContain("• Production");
  });

  it("UT-REV-004 page lock clears when all five prerequisites are met", () => {
    expect(isPageLocked(project({ clusterStateName: "Approved" }))).toBe(false);
  });

  it("GUIDE q25 parseRevenueTab reads ?tab=, defaulting anything unrecognised", () => {
    expect(parseRevenueTab("Balancing Price")).toBe("Balancing Price");
    expect(parseRevenueTab("Contracted Revenue")).toBe("Contracted Revenue");
    expect(parseRevenueTab(null)).toBe("Contracted Revenue");
    expect(parseRevenueTab("nonsense")).toBe("Contracted Revenue");
  });

  it("UT-REV-004b a Draft cluster state alone locks the page", () => {
    expect(isPageLocked(project({ clusterStateName: "Draft" }))).toBe(true);
  });
});

/* ═══════════════════════════════════ GUIDE q25 — Add Revenue Contract panel ════ */

describe("GUIDE q25 — Add Revenue Contract panel", () => {
  it("field labels are verbatim from the recording", () => {
    expect(REVENUE_FORM_LABEL.currency).toBe("Currency");
    expect(REVENUE_FORM_LABEL.contractStartDate).toBe("Contract Start Date");
    expect(REVENUE_FORM_LABEL.contractDuration).toBe("Contract Duration");
    expect(REVENUE_FORM_LABEL.contractEndDate).toBe("Contract End Date");
    expect(REVENUE_FORM_LABEL.inflationProfile).toBe("Inflation Profile");
    expect(REVENUE_FORM_LABEL.countryInflationProfile).toBe("Country Inflation Profile");
    expect(REVENUE_FORM_LABEL.inflationStartYear).toBe("Inflation Start Year");
    expect(REVENUE_FORM_LABEL.inflationStartYearPlaceholder).toBe("YYYY");
    expect(REVENUE_FORM_LABEL.considerNegativePrices).toBe("Consider Negative Prices");
    expect(REVENUE_FORM_LABEL.provideHedgeVolumeIn).toBe("Provide Hedge Volume in");
  });

  it("tariffPrice embeds the project's currency code in brackets", () => {
    expect(REVENUE_FORM_LABEL.tariffPrice("EUR")).toBe("Tariff / Price [EUR/MWh]");
    expect(REVENUE_FORM_LABEL.tariffPrice("PLN")).toBe("Tariff / Price [PLN/MWh]");
    expect(REVENUE_FORM_LABEL.tariffPrice(null)).toBe("Tariff / Price [/MWh]");
  });

  it("derivedFieldPlaceholder shows a system default (Euro, Germany) as placeholder text, "
    + "never a typed value — the recording renders both in placeholder grey", () => {
    expect(derivedFieldPlaceholder("Euro")).toBe("Euro");
    expect(derivedFieldPlaceholder("Germany")).toBe("Germany");
    expect(derivedFieldPlaceholder(null)).toBe("");
  });
});

/* ═════════════════════════════════════════════════════════════ italy region ════ */

describe("Italian price regions", () => {
  it("UT-REV-005 Italian province maps to price region (1.21.753 zone spelling)", () => {
    expect(provinceToPriceRegion("Sardegna")).toBe("Italy_Sardinia");
    expect(provinceToPriceRegion("Toscana")).toBe("Italy_Centre-North");
    expect(provinceToPriceRegion("Lazio")).toBe("Italy_Centre-South");
    expect(provinceToPriceRegion("Bayern")).toBeNull();
    expect(provinceToPriceRegion(null)).toBeNull();
  });

  it("UT-REV-006 the Italian assumption slice is every row whose country starts with Italy", () => {
    expect(assumptionScope("Italy")).toEqual({ kind: "prefix", prefix: "Italy" });
    expect(assumptionScope("Germany")).toEqual({ kind: "equals", country: "Germany" });
    expect(assumptionScope(null)).toEqual({ kind: "none" });
    const rows = [
      row("price", "2028", "60", "50", "Italy"),
      row("price", "2028", "70", "55", "Italy_North"),
      row("price", "2028", "75", "58", "Italy_Centre-South"),
      row("price", "2028", "80", "60", "Poland"),
    ];
    // 1.21.709 took exactly two countries; 1.21.753 takes every Italy* zone.
    expect(selectCountryAssumptions(rows, "Italy")).toHaveLength(3);
    expect(selectCountryAssumptions(rows, "Poland")).toHaveLength(1);
    expect(inAssumptionScope("Italy_Sicily", assumptionScope("Italy"))).toBe(true);
    expect(inAssumptionScope("Germany", assumptionScope("Italy"))).toBe(false);
    expect(assumptionCountriesCanvas709("Italy", "Italy_North")).toEqual(["Italy", "Italy_North"]);
  });

  it("UT-REV-074 an Italian project prices from its own zone only", () => {
    const rows = [
      row("price", "2028", "60", "50", "Italy"),
      row("price", "2028", "70", "55", "Italy_North"),
      row("price", "2028", "75", "58", "Italy_Centre-South"),
      row("revenuetype", "", "ppa", "ppa", "Italy"),
    ];
    const pool = pricePoolFor(rows, "Italy", "Italy_Centre-South");
    expect(pool.map((r) => r.country)).toEqual(["Italy_Centre-South"]);
    expect(pricePoolFor(rows, "Italy", null)).toEqual([]);
    // Outside Italy every price row of the slice counts.
    const pl = [row("price", "2028", "80", "60", "Poland"), row("price", "2029", "81", "61", "Poland")];
    expect(pricePoolFor(pl, "Poland", null)).toHaveLength(2);
  });

  it("UT-REV-075 SOURCE DEFECT 1.21.753-1: the canvas exact-year lookup cannot match outside Italy", () => {
    const pl = [row("price", "2027", "80", "60", "Poland"), row("price", "2028", "90", "70", "Poland")];
    // Intended: the exact year wins.
    expect(priceForYear(pl, "Wind", 2028)).toBe(90);
    // Canvas 1.21.753: `country = locAreaWithRegion` is false for a blank region, so the
    // exact branch is skipped and the year-vs-price fallback picks a row instead.
    const parity753 = priceForYearCanvasParity(pl, "Wind", 2028, "en-US", null);
    const parity709 = priceForYearCanvasParity(pl, "Wind", 2028, "en-US");
    expect(parity709).toBe(90);
    expect(parity753).not.toBeNull();
    // Italy still finds its exact zone-year row under the parity rule.
    const it2028 = [row("price", "2028", "75", "58", "Italy_Centre-South")];
    expect(priceForYearCanvasParity(it2028, "Wind", 2028, "en-US", "Italy_Centre-South")).toBe(75);
  });

  it("bareRegion strips the Italy_ prefix", () => {
    expect(bareRegion("Italy_Centre-North")).toBe("Centre-North");
  });
});

/* ═══════════════════════════════════════════════════════════ locale parsing ════ */

describe("locale-sensitive assumption parsing (rule 12)", () => {
  it("parses an invariant SQL decimal in English", () => {
    expect(assumptionNumber("0.021", "en-GB")).toBeCloseTo(0.021, 10);
  });

  it("re-points the separator before Value() on a non-English client", () => {
    expect(assumptionNumber("0.021", "de-DE")).toBeCloseTo(0.021, 10);
    expect(assumptionNumber("73.5", "fr-FR")).toBeCloseTo(73.5, 10);
  });

  it("returns NaN for a blank column rather than 0", () => {
    expect(Number.isNaN(assumptionNumber(null))).toBe(true);
    expect(Number.isNaN(assumptionNumber(""))).toBe(true);
  });

  it("techColumn reads the wind/pv column and blanks anything else", () => {
    const r = row("price", "2028", "60", "50");
    expect(techColumn(r, "Wind")).toBe("60");
    expect(techColumn(r, "PV")).toBe("50");
    expect(techColumn(r, "Other")).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════ standard assumption ════ */

describe("standard-assumption gate and description", () => {
  const rows = [row("revenuetype", "", "ppa", "fit")];

  it("UT-REV-007 standard assumption exists only when the tech column matches the label", () => {
    expect(standardAssumptionExists(rows, "Wind", "PPA")).toBe(true);
    expect(standardAssumptionExists(rows, "Wind", "FiT")).toBe(false);
    expect(standardAssumptionExists(rows, "PV", "FiT")).toBe(true);
    expect(standardAssumptionExists(rows, "PV", null)).toBe(false);
  });

  it("UT-REV-008 description for German FiT", () => {
    expect(descriptionFor({
      country: "Germany", region: null, revenueTypeLabel: "FiT",
      standardAssumptionExists: true, allValuesStandard: true,
    })).toBe("Standard EEG Germany");
  });

  it("UT-REV-009 description for French FiT", () => {
    expect(descriptionFor({
      country: "France", region: null, revenueTypeLabel: "FiT",
      standardAssumptionExists: true, allValuesStandard: true,
    })).toBe("Standard CfD France");
  });

  it("UT-REV-010 description for Italy carries the region", () => {
    expect(descriptionFor({
      country: "Italy", region: "Italy_Sicily", revenueTypeLabel: "PPA",
      standardAssumptionExists: true, allValuesStandard: true,
    })).toBe("Standard PPA Italy - Sicily");
  });

  it("UT-REV-011 a non-standard contract drops the Standard prefix", () => {
    const withPrefix = descriptionFor({
      country: "Germany", region: null, revenueTypeLabel: "PPA",
      standardAssumptionExists: true, allValuesStandard: true,
    });
    expect(withPrefix).toBe("Standard PPA Germany");
    expect(descriptionFor({
      country: "Germany", region: null, revenueTypeLabel: "PPA",
      standardAssumptionExists: true, allValuesStandard: false,
    })).toBe("PPA Germany");
    expect(dropStandardPrefix(withPrefix)).toBe("PPA Germany");
  });

  it("revenueTypePrefix is country-specific only for FiT", () => {
    expect(revenueTypePrefix("Germany", "PPA")).toBe("PPA ");
    expect(revenueTypePrefix("France", "FiT")).toBe("CfD ");
  });

  it("rule 5: the regime change swaps the type token once the milestone is late", () => {
    const rows5 = [
      row("change_revenuetype", "issubcontract_type_depending_on_reference_date", "true", "true"),
      row("change_revenuetype", "subcontract_type_after_decision_year", "cfd", "cfd"),
      row("change_revenuetype", "subcontract_type_decision_year_up", "2026", "2026"),
      row("change_revenuetype", "subcontract_type_reference_date", "finalinvestmentdecision", "x"),
    ];
    // FID 2026-06-30 is AFTER 2026-01-01, so DateDiff(actual, decision) < 0 → sub-type wins.
    const change = subContractTypeChange(rows5, "Wind", project());
    expect(change.dependsOnReferenceDate).toBe(true);
    expect(change.typeAfterDecisionYear).toBe("CfD ");
    expect(change.applies).toBe(true);
    expect(descriptionFor({
      country: "Germany", region: null, revenueTypeLabel: "FiT",
      standardAssumptionExists: true, allValuesStandard: true, change,
    })).toBe("Standard CfD Germany");
  });

  it("rule 5: an early milestone keeps the selected type", () => {
    const rows5 = [
      row("change_revenuetype", "issubcontract_type_depending_on_reference_date", "true", "true"),
      row("change_revenuetype", "subcontract_type_after_decision_year", "cfd", "cfd"),
      row("change_revenuetype", "subcontract_type_decision_year_up", "2030", "2030"),
      row("change_revenuetype", "subcontract_type_reference_date", "finalinvestmentdecision", "x"),
    ];
    const change = subContractTypeChange(rows5, "Wind", project());
    expect(change.applies).toBe(false);
    expect(descriptionFor({
      country: "Germany", region: null, revenueTypeLabel: "FiT",
      standardAssumptionExists: true, allValuesStandard: true, change,
    })).toBe("Standard EEG Germany");
  });
});

/* ═══════════════════════════════════════════════════════════════════ currency ══ */

describe("currency (source ambiguity 7)", () => {
  it("the control default wins: Poland gets PLN, everyone else EUR", () => {
    expect(revenueCurrencyCode("Poland")).toBe("PLN");
    expect(revenueCurrencyCode("Germany")).toBe("EUR");
  });

  it("canvas parity: the assumption engine is hard-coded EUR on every branch", () => {
    expect(assumptionEngineCurrencyCode()).toBe("EUR");
  });
});

/* ════════════════════════════════════════════════════════ dates and duration ═══ */

describe("contract dates and duration", () => {
  const startRows = [row("contractstart", "", "operationstartdatecod", "operationstartdatecod")];

  it("UT-REV-012 contract end date = start + years + months − 1 day", () => {
    expect(contractEndDate(d("2027-04-01"), 15, 6)).toEqual(d("2042-09-30"));
  });

  it("UT-REV-013 a zero-length term collapses the end date to the start date", () => {
    expect(endDateWithGuard(d("2027-04-01"), 0, 0)).toEqual(d("2027-04-01"));
    expect(endDateWithGuard(d("2027-04-01"), 15, 6)).toEqual(d("2042-09-30"));
  });

  it("UT-REV-014 contract start date defaults to COD and is flagged standard", () => {
    const f = contractStartDate(startRows, "Wind", project());
    expect(f.value).toEqual(d("2028-01-01"));
    expect(f.isStandard).toBe(true);
  });

  it("UT-REV-015 a standard that references COD falls back to today when COD is blank", () => {
    // Audit 20 Oct 2026: `recProjectCODDate` (COD, else Today()) applies only when a standard exists.
    const today = d("2026-09-02");
    const f = contractStartDate(startRows, "Wind", project({ cod: null }), { today, standardAssumptionExists: true });
    expect(f.value).toEqual(today);
  });

  it("source ambiguity 5: the standard flag is hard-coded true; the corrected form is opt-in", () => {
    const canvas = contractStartDate(startRows, "Wind", project(), { standardAssumptionExists: false });
    expect(canvas.isStandard).toBe(true);
    const corrected = contractStartDate(startRows, "Wind", project(), {
      standardAssumptionExists: false, hardCodedStandardFlag: false,
    });
    expect(corrected.isStandard).toBe(false);
  });

  it("UT-REV-010b duration comes from the assumptions and the pickers are 0–35 / 0–11", () => {
    const rows = [
      row("contractdurationyear", "", "15", "20"),
      row("contractdurationmonth", "", "6", "0"),
    ];
    const dur = contractDuration(rows, "Wind", { standardAssumptionExists: true });
    expect(dur.years.value).toBe(15);
    expect(dur.months.value).toBe(6);
    expect(contractDuration(rows, "PV", { standardAssumptionExists: true }).years.value).toBe(20);
    expect(durationYearOptions()).toHaveLength(36);
    expect(durationYearOptions()[35]).toBe(35);
    expect(durationMonthOptions()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("the end-date flag is the conjunction of start, years and months", () => {
    expect(endDateIsStandard(field(d("2028-01-01")), field(15), field(6))).toBe(true);
    expect(endDateIsStandard(field(d("2028-01-01")), field(15, false), field(6))).toBe(false);
  });
});

/* ═════════════════════════════════════════════════════════════════ price curve ══ */

describe("price curve (rule 11 / source ambiguity 1)", () => {
  const curve = [
    row("price", "2025", "50", "40"),
    row("price", "2026", "55", "42"),
    row("price", "2027", "60", "44"),
    row("price", "2028", "65", "46"),
    row("price", "2029", "70", "48"),
    row("price", "2030", "75", "50"),
  ];

  it("UT-REV-016 the price is picked for the exact COD year", () => {
    expect(priceForYear(curve, "Wind", 2028)).toBe(65);
    expect(priceForYear(curve, "PV", 2028)).toBe(46);
  });

  it("UT-REV-017 the fallback clamps above the last year and never throws", () => {
    expect(() => priceForYear(curve, "Wind", 2033)).not.toThrow();
    expect(priceForYear(curve, "Wind", 2033)).toBe(75);
    expect(priceForYear(curve, "Wind", 2020)).toBe(50);
  });

  it("the intended fallback picks the nearest YEAR when the curve has a gap", () => {
    const gapped = [
      row("price", "2025", "50", "40"),
      row("price", "2031", "90", "60"),
    ];
    expect(priceForYear(gapped, "Wind", 2026)).toBe(50);
    expect(priceForYear(gapped, "Wind", 2030)).toBe(90);
  });

  it("SOURCE DEFECT regression: the canvas fallback compares prices to years", () => {
    // 2033 is greater than every price in the curve (50…75), so the canvas clamps to the
    // LAST price rather than selecting by year. Pinned so the defect cannot regress
    // silently if someone re-enables the parity path.
    expect(priceForYearCanvasParity(curve, "Wind", 2033)).toBe(75);
    // A COD year of 2028 with no exact row lands *inside* the price range and is ranked
    // by |price − 2028|, which always selects the most expensive row.
    const noExact = curve.filter((r) => r.category !== "2028");
    expect(priceForYearCanvasParity(noExact, "Wind", 2028)).toBe(75);
    // The intended rule picks a neighbouring YEAR instead — 2027 and 2029 are both one
    // year away, and the canvas secondary sort (`"pv", SortOrder.Descending`) breaks the
    // tie on the higher price, so 2029's 70 wins over 2027's 60.
    expect(priceForYear(noExact, "Wind", 2028)).toBe(70);
    // With no tie the nearest year wins outright.
    expect(priceForYear(noExact.filter((r) => r.category !== "2029"), "Wind", 2028)).toBe(60);
  });

  it("UT-REV-018 the p90 price is blank for PV", () => {
    expect(p90Price(curve, "PV", 2028)).toBeNull();
    expect(p90Price(curve, "Wind", 2028)).toBe(65);
  });

  it("an empty curve yields null rather than a First() on an empty table", () => {
    expect(priceForYear([], "Wind", 2028)).toBeNull();
    expect(priceForYearCanvasParity([], "Wind", 2028)).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════ german FiT ═════ */

describe("German wind FiT tariff (rule 15)", () => {
  it("UT-REV-019 tariff = bidding price × correction factor, two decimals", () => {
    expect(germanFitTariff(73.5, 0.912)).toBe("67.03");
    expect(germanFitTariff(70, 1)).toBe("70.00");
  });

  it("UT-REV-020 the tariff is not a product for PV", () => {
    expect(showsGermanFitBlock("Germany", "FiT", "PV")).toBe(false);
    expect(showsGermanFitBlock("Germany", "FiT", "Wind")).toBe(true);
    expect(showsGermanFitBlock("Germany", "PPA", "Wind")).toBe(false);
    expect(showsGermanFitBlock("France", "FiT", "Wind")).toBe(false);
    expect(tariffDisplay(false, 73.5, 0.912, 63.8)).toBe("63.80");
    expect(tariffDisplay(true, 73.5, 0.912, 63.8)).toBe("67.03");
  });

  it("UT-REV-021 correction factors default to 1", () => {
    expect(correctionFactorDefault()).toEqual({ value: 1, standardValue: 1, isStandard: true });
  });

  it("UT-REV-055 tariff standardness is a conjunction for German FiT", () => {
    const price = field(70);
    const correction = overrideField(field(1), 0.9);
    expect(correction.isStandard).toBe(false);
    expect(tariffIsStandard(true, price, correction)).toBe(false);
    // Outside the German block the correction factor is irrelevant.
    expect(tariffIsStandard(false, price, correction)).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════════ inflation ══ */

describe("inflation (rules 16–17)", () => {
  const rows = [
    row("inflation", "useinflation", "true", "true"),
    row("inflation", "usecountryinflation", "false", "false"),
    row("inflation", "inflationprofile", "0.021", "0.018"),
    row("inflation", "inflationstartyear", "finalinvestmentdecision", "operationstartdatecod"),
  ];

  it("UT-REV-022 the inflation custom value is scaled by 100", () => {
    expect(inflation(rows, "Wind", project()).customValue.value).toBeCloseTo(2.1, 10);
    expect(inflation(rows, "PV", project()).customValue.value).toBeCloseTo(1.8, 10);
  });

  it("UT-REV-023 the inflation start year maps from the named milestone", () => {
    expect(inflation(rows, "Wind", project()).startYear.value).toBe(2026);
    expect(inflation(rows, "PV", project()).startYear.value).toBe(2028);
    expect(inflationStartYearFrom(project(), "construction")).toBe(2027);
    expect(inflationStartYearFrom(project(), "legallybindingpermits")).toBe(2026);
    expect(inflationStartYearFrom(project(), null)).toBe(0);
  });

  it("the four parts are all read: toggle, country toggle, custom value, start year", () => {
    const infl = inflation(rows, "Wind", project(), { standardAssumptionExists: true });
    expect(infl.useInflation.value).toBe(true);
    expect(infl.useCountryProfile.value).toBe(false);
    expect(infl.startYearKey).toBe("finalinvestmentdecision");
    expect(infl.useInflation.isStandard).toBe(true);
  });

  it("UT-REV-024 the country inflation toggle replaces the value and clears standardness", () => {
    const profiles = [{ countryCode: "DE", year: 2030, inflation: 2.4, area: null }];
    const base = inflation(rows, "Wind", project(), { standardAssumptionExists: true });
    const withYear = { ...base, startYear: { ...base.startYear, value: 2030 } };
    const next = applyCountryInflation(withYear, profiles, "DE", null);
    expect(next.customValue.value).toBe(2.4);
    expect(next.customValue.isStandard).toBe(false);
    expect(next.useCountryProfile.value).toBe(true);
  });

  it("UT-REV-025 the Italian country inflation lookup includes the area", () => {
    const profiles = [
      { countryCode: "IT", year: 2030, inflation: 1.9, area: "South" },
      { countryCode: "IT", year: 2030, inflation: 2.7, area: "North" },
    ];
    expect(countryInflationValue(profiles, "IT", 2030, "Italy_North")).toBe(2.7);
    // The toggle's own OnCheck handler omits the area branch — canvas asymmetry.
    expect(countryInflationValue(profiles, "IT", 2030, "Italy_North", false)).toBe(1.9);
  });

  it("UT-REV-026 a missing country inflation row yields 0 (the Max(…, 0) floor)", () => {
    expect(countryInflationValue([], "DE", 2030, null)).toBe(0);
    expect(countryInflationValue(
      [{ countryCode: "DE", year: 2030, inflation: -1.2, area: null }], "DE", 2030, null,
    )).toBe(0);
  });
});

/* ═══════════════════════════════════════════════════════════ negative prices ═══ */

describe("negative-price toggle (rule 18)", () => {
  const rows = (active: string, sync: string, initial: string) => [
    row("consider_negtive_prices_active", "FiT", active, active),
    row("standard_sync", "FiT", sync, sync),
    row("initial_state_toggle", "FiT", initial, initial),
  ];

  it("UT-REV-027 disabled when no active negative-price energy yield exists", () => {
    const s = negativePriceState(rows("true", "true", "On"), "Wind", "FiT", false);
    expect(s.displayMode).toBe("disabled");
  });

  it("UT-REV-028 syncs to production when standard_sync is true", () => {
    const s = negativePriceState(rows("true", "true", "Off"), "Wind", "FiT", true);
    expect(s.toggleState).toBe(true);
    expect(s.manualOverride).toBe(false);
    expect(s.displayMode).toBe("edit");
  });

  it("UT-REV-029 uses the initial state when standard_sync is false", () => {
    const s = negativePriceState(rows("true", "false", "On"), "Wind", "FiT", false);
    expect(s.toggleState).toBe(true);
  });

  it("UT-REV-030 a manual flip sets NegativePriceManualOverride", () => {
    const s = flipNegativePrice(negativePriceState(rows("true", "true", "On"), "Wind", "FiT", true), false);
    expect(s.toggleState).toBe(false);
    expect(s.manualOverride).toBe(true);
    const payload = buildRevenuePayload(
      form({ considerNegativePrices: s.toggleState, negativePriceManualOverride: s.manualOverride }),
      project(), flags(),
    );
    expect(payload.negativePriceManualOverride).toBe(true);
    expect(payload.considerNegativePrices).toBe(false);
  });

  it("the category keys off the revenue label, so PPA rows do not answer for FiT", () => {
    const s = negativePriceState(rows("true", "true", "On"), "Wind", "PPA", true);
    expect(s.displayMode).toBe("disabled");
  });
});

/* ═══════════════════════════════════════════════════════════════════ hedging ═══ */

describe("hedging modes (rules 19–23)", () => {
  it("UT-REV-031 Individual Volumes is hidden until the term is known", () => {
    expect(hedgeTypeOptions(null, 15, 6)).toEqual(["percentage", "fixed"]);
    expect(hedgeTypeOptions(d("2028-01-01"), 15, 6)).toEqual(["percentage", "fixed", "individual"]);
  });

  it("UT-REV-032 individual volume rows for a multi-year contract", () => {
    const rows = generateVolumeRows(d("2027-04-01"), d("2030-03-31"));
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ year: 2027, startDate: d("2027-04-01"), endDate: d("2027-12-31") });
    expect(rows[1]).toMatchObject({ year: 2028, startDate: d("2028-01-01"), endDate: d("2028-12-31") });
    expect(rows[3]).toMatchObject({ year: 2030, startDate: d("2030-01-01"), endDate: d("2030-03-31") });
    expect(rows.every((r) => r.initialState && r.value === "")).toBe(true);
  });

  it("UT-REV-033 a single-calendar-year contract yields one row spanning the exact term", () => {
    const rows = generateVolumeRows(d("2027-04-01"), d("2027-11-30"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ year: 2027, startDate: d("2027-04-01"), endDate: d("2027-11-30") });
  });

  it("UT-REV-034 the row label shows the bare year only for full calendar years", () => {
    const rows = generateVolumeRows(d("2027-04-01"), d("2030-03-31"));
    expect(rows.map(volumeRowLabel)).toEqual([
      "01.04.2027 - 31.12.2027", "2028", "2029", "01.01.2030 - 31.03.2030",
    ]);
  });

  it("UT-REV-035 changing the term regenerates the volume rows from scratch", () => {
    const filled = generateVolumeRows(d("2028-01-01"), d("2042-12-31"))
      .map((r) => ({ ...r, value: "8000", initialState: false }));
    const next = resetOnHedgeTypeChange(
      hedge({ type: "individual", individual: filled }),
      "individual",
      { start: d("2028-01-01"), end: d("2037-12-31") },
    );
    expect(next.individual).toHaveLength(10);
    expect(next.individual.every((r) => r.initialState && r.value === "")).toBe(true);
  });

  it("switching hedge type blanks the other two collections", () => {
    const start = hedge({ type: "percentage", percentage: field("70") });
    const toFixed = resetOnHedgeTypeChange(start, "fixed", { start: null, end: null });
    expect(toFixed.percentage.value).toBe("");
    expect(toFixed.individual).toEqual([]);
  });

  it("validationMonths spans both endpoints inclusively", () => {
    expect(validationMonths(d("2028-01-01"), d("2028-06-30"))).toHaveLength(6);
    expect(validationMonths(d("2028-01-01"), d("2028-01-31"))).toHaveLength(1);
  });

  it("UT-REV-036 hedged-volume validation passes at exactly 100 %", () => {
    const overlapping: OverlappingContract[] = [
      { id: "c1", startDate: d("2027-01-01"), endDate: d("2035-12-31"), hedgedVolume: 60 },
    ];
    const r = validateHedgedVolume(
      { startDate: d("2028-01-01"), endDate: d("2028-12-31"), hedgedVolume: 40 }, overlapping,
    );
    expect(r.ok).toBe(true);
  });

  it("UT-REV-037 validation fails above 100 % and reports the range", () => {
    const overlapping: OverlappingContract[] = [
      { id: "c1", startDate: d("2028-01-01"), endDate: d("2028-06-30"), hedgedVolume: 60 },
    ];
    const r = validateHedgedVolume(
      { startDate: d("2027-06-01"), endDate: d("2029-06-30"), hedgedVolume: 50 }, overlapping,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.from.getFullYear()).toBe(2028);
      expect(r.from.getMonth()).toBe(0);
      expect(r.to.getMonth()).toBe(5);
      expect(r.message).toBe(hedgeExceededMessage(r.from, r.to));
      expect(r.message).toContain("From  01.2028  to  06.2028.");
    }
  });

  it("UT-REV-038 validation excludes the contract being edited", () => {
    const r = validateHedgedVolume(
      { startDate: d("2028-01-01"), endDate: d("2030-12-31"), hedgedVolume: 70 }, [],
    );
    expect(r.ok).toBe(true);
  });

  it("UT-REV-039 the overlap test uses month boundaries, not exact dates", () => {
    const overlapping: OverlappingContract[] = [
      { id: "c1", startDate: d("2028-01-15"), endDate: d("2028-01-20"), hedgedVolume: 80 },
    ];
    expect(overlappingHedgePercent(overlapping, d("2028-01-01"))).toBe(80);
    const r = validateHedgedVolume(
      { startDate: d("2028-01-01"), endDate: d("2028-01-31"), hedgedVolume: 30 }, overlapping,
    );
    expect(r.ok).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════ validation ════ */

describe("field validation", () => {
  it("UT-REV-040 fixed volume rejects decimals", () => {
    expect(validateVolumeMwh("1234.5", 120_000)).toEqual({ valid: false, message: MSG.noDecimals });
    expect(validateVolumeMwh("1234", 120_000).valid).toBe(true);
  });

  it("UT-REV-041 fixed volume may not exceed Net Yield p50", () => {
    expect(validateVolumeMwh("130000", 120_000))
      .toEqual({ valid: false, message: MSG.exceedsNetYield });
  });

  it("UT-REV-042 a blank Net Yield p50 floors the cap at zero", () => {
    expect(validateVolumeMwh("1", null).valid).toBe(false);
    expect(validateVolumeMwh("0", null).valid).toBe(true);
  });

  it("UT-REV-043 the tariff range is 750 for Poland and 150 elsewhere", () => {
    expect(validateTariff("600", "Poland").valid).toBe(true);
    expect(validateTariff("600", "Germany")).toEqual({
      valid: false, message: "Please select a value between 0 and 150.",
    });
  });

  it("UT-REV-044 the tariff error is suppressed when the field is disabled", () => {
    expect(validateTariff("600", "Germany", true).valid).toBe(true);
  });

  it("UT-REV-045 correction factor bounds and decimal places", () => {
    expect(validateCorrectionFactor("0.4").valid).toBe(false);
    expect(validateCorrectionFactor("0.5").valid).toBe(true);
    expect(validateCorrectionFactor("2").valid).toBe(true);
    expect(validateCorrectionFactor("2.1").valid).toBe(false);
    expect(validateCorrectionFactor("1.2345").valid).toBe(false);
    expect(validateCorrectionFactor("1,2", "de-DE").valid).toBe(true);
    expect(validateCorrectionFactor("0.4").message).toBe("Please select a value between 0.5 and 2");
    expect(validateCorrectionFactor("0,4", "de-DE").message)
      .toBe("Please select a value between 0,5 and 2");
  });

  it("UT-REV-046 the balancing-price range is country-specific", () => {
    expect(validateBalancingPrice("-30", "Poland").valid).toBe(false);
    expect(validateBalancingPrice("40", "Poland").valid).toBe(true);
    expect(validateBalancingPrice("-10", "Germany").valid).toBe(false);
    expect(validateBalancingPrice("7", "Germany").valid).toBe(true);
    expect(validateBalancingPrice("7.123", "Germany").valid).toBe(false);
  });

  it("UT-REV-047 the inflation start year must be four digits", () => {
    expect(validateInflationStartYear("27").valid).toBe(false);
    expect(validateInflationStartYear("2027").valid).toBe(true);
    expect(validateInflationStartYear("20270").valid).toBe(false);
  });

  it("UT-REV-048 a non-standard contract may not claim to be standard", () => {
    expect(validateDescription("Standard PPA Germany", false).valid).toBe(false);
    expect(validateDescription("Standard PPA Germany", true).valid).toBe(true);
    expect(validateDescription("PPA Germany", false).valid).toBe(true);
  });

  it("hedged volume [%] accepts one decimal in range", () => {
    expect(validateHedgedVolumePercent("70.5").valid).toBe(true);
    expect(validateHedgedVolumePercent("70.55").valid).toBe(false);
    expect(validateHedgedVolumePercent("101").valid).toBe(false);
  });

  it("bidding price and inflation profile use their own decimal rules", () => {
    expect(validateBiddingPrice("73.50").valid).toBe(true);
    expect(validateBiddingPrice("73.505").valid).toBe(false);
    expect(validateBiddingPrice("101").valid).toBe(false);
    expect(validateInflationProfile("2.10").valid).toBe(true);
    expect(validateInflationProfile("2.105").valid).toBe(false);
  });

  it("source ambiguity 4: the Shift-of-COD bounds disagree; the inclusive rule wins", () => {
    expect(validateShiftOfCod("0").valid).toBe(true);
    expect(validateShiftOfCod("24").valid).toBe(true);
    expect(validateShiftOfCod("25").valid).toBe(false);
    expect(validateShiftOfCod("-1").valid).toBe(false);
    expect(validateShiftOfCod("3.5").valid).toBe(false);
    // Canvas parity: the message rule calls 0 and 24 invalid while the visibility rule
    // never shows the error for them.
    expect(shiftOfCodMessageRuleCanvasParity("0")).toBe(true);
    expect(shiftOfCodMessageRuleCanvasParity("24")).toBe(true);
    expect(shiftOfCodMessageRuleCanvasParity("12")).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════ save gating ═══ */

describe("save gating", () => {
  it("UT-REV-049 save is disabled until the form is dirty", () => {
    expect(canSaveRevenueContract(form({ formDirty: false }))).toBe(false);
    expect(canSaveRevenueContract(form())).toBe(true);
  });

  it("UT-REV-050 save is disabled while an individual volume row is untouched", () => {
    const rows = generateVolumeRows(d("2028-01-01"), d("2030-12-31"));
    const partly = rows.map((r, i) => (i < 2 ? { ...r, value: "8000", initialState: false } : r));
    expect(canSaveRevenueContract(form({
      hedge: hedge({ type: "individual", individual: partly }),
    }))).toBe(false);
    const all = rows.map((r) => ({ ...r, value: "8000", initialState: false }));
    expect(canSaveRevenueContract(form({
      hedge: hedge({ type: "individual", individual: all }),
    }))).toBe(true);
  });

  it("UT-REV-051 save is enabled for a complete German wind FiT contract", () => {
    expect(canSaveRevenueContract(form({
      revenueTypeLabel: "FiT", description: "EEG Germany", showsGermanFitBlock: true,
      biddingPrice: "73.50", correctionFactor: "0.912", siteQuality: "85.00",
      tariffP90: "60.00", correctionFactorP90: "0.850", siteQualityP90: "80.00",
    }))).toBe(true);
  });

  it("the German FiT branch blocks a missing correction factor", () => {
    expect(canSaveRevenueContract(form({
      revenueTypeLabel: "FiT", description: "EEG Germany", showsGermanFitBlock: true,
      biddingPrice: "73.50", correctionFactor: "",
      tariffP90: "60.00", correctionFactorP90: "0.850", siteQualityP90: "80.00",
    }))).toBe(false);
  });

  it("the inflation branch requires a start year and a profile when the toggle is on", () => {
    expect(canSaveRevenueContract(form({ useInflation: true }))).toBe(false);
    expect(canSaveRevenueContract(form({
      useInflation: true, inflationStartYear: "2028", inflationProfile: "2.10",
    }))).toBe(true);
    // D33: the canvas requires the profile text even with the country toggle on — it then holds
    // the looked-up country value.
    expect(canSaveRevenueContract(form({
      useInflation: true, useCountryInflationProfile: true, inflationStartYear: "2028",
    }))).toBe(false);
    expect(canSaveRevenueContract(form({
      useInflation: true, useCountryInflationProfile: true, inflationStartYear: "2028", inflationProfile: "2.4",
    }))).toBe(true);
  });

  it("a description claiming to be standard blocks a non-standard contract", () => {
    expect(canSaveRevenueContract(form({ description: "Standard PPA Germany" }))).toBe(false);
    expect(canSaveRevenueContract(form({
      description: "Standard PPA Germany", isStandardContract: true,
    }))).toBe(true);
  });

  it("UT-REV-059 Individual Volumes needs one extra confirmation", () => {
    expect(needsIndividualVolumesConfirmation("individual")).toBe(true);
    expect(needsIndividualVolumesConfirmation("percentage")).toBe(false);
    expect(MSG.individualVolumesConfirm).toContain("individual volumes");
  });
});

/* ══════════════════════════════════════════════════════════════ save payload ═══ */

describe("save payload (rules 24–25)", () => {
  it("UT-REV-052 hidden numeric fields persist as 0", () => {
    const p = buildRevenuePayload(
      form({
        country: "France", revenueTypeLabel: "PPA", showsGermanFitBlock: false,
        biddingPrice: "73.50", siteQuality: "85", siteQualityP90: "80",
        correctionFactor: "0.912", correctionFactorP90: "0.85",
      }),
      project({ countryName: "France" }), flags(),
    );
    expect(p.biddingPrice).toBe(0);
    expect(p.siteQuality).toBe(0);
    expect(p.siteQualityP90).toBe(0);
    expect(p.correctionFactor).toBe(0);
    expect(p.correctionFactorP90).toBe(0);
  });

  it("UT-REV-053 turning inflation off zeroes the inflation fields", () => {
    const p = buildRevenuePayload(
      form({
        useInflation: false, useCountryInflationProfile: true,
        inflationProfile: "2.10", inflationStartYear: "2028",
      }),
      project(), flags(),
    );
    expect(p.inflationStartYear).toBe(0);
    expect(p.useCountryInflationProfile).toBe(false);
    expect(p.inflationProfile).toBe(0);
  });

  it("UT-REV-054 the hedge type governs which volume column is written", () => {
    const pct = buildRevenuePayload(
      form({ hedge: hedge({ type: "percentage", percentage: field("70") }) }), project(), flags(),
    );
    expect(pct.hedgedVolume).toBe(70);
    expect(pct.fixedContractedMwhPa).toBeNull();
    expect(pct.hedgeType).toBe(CHOICE_FINANCE.hedgingType.hedgedVolumePercent);

    const fixed = buildRevenuePayload(
      form({
        hedge: hedge({
          type: "fixed", fixed: { ...field("90000"), initialState: false },
        }),
      }), project(), flags(),
    );
    expect(fixed.hedgedVolume).toBe(0);
    expect(fixed.fixedContractedMwhPa).toBe(90_000);

    const rows = generateVolumeRows(d("2028-01-01"), d("2030-12-31"))
      .map((r) => ({ ...r, value: "8000", initialState: false }));
    const indiv = buildRevenuePayload(
      form({ hedge: hedge({ type: "individual", individual: rows }) }), project(), flags(),
    );
    expect(indiv.hedgedVolume).toBe(0);
    expect(indiv.fixedContractedMwhPa).toBeNull();
    expect(indiv.individualVolumes).toHaveLength(3);
  });

  it("UT-REV-056 the contract name is composed from project, label and description", () => {
    expect(revenueContractName("Windpark Nord", "PPA", "Standard PPA Germany"))
      .toBe("Windpark Nord-PPA-Standard PPA Germany");
    const p = buildRevenuePayload(
      form({ revenueTypeLabel: "PPA", description: "Standard PPA Germany", isStandardContract: true }),
      project(), flags(),
    );
    expect(p.name).toBe("Windpark Nord-PPA-Standard PPA Germany");
    expect(p.label).toBe(CHOICE_FINANCE.revenueLabel.ppa);
  });

  it("all fourteen standard-assumption flags round-trip on the payload", () => {
    expect(ALL_STANDARD_FLAG_KEYS).toHaveLength(14);
    const f = flags({ correctionFactor: false, hedgedVolume: false });
    const p = buildRevenuePayload(form(), project(), f);
    expect(p.flags).toEqual(f);
    expect(allValuesStandard(flags())).toBe(true);
    expect(allValuesStandard(f)).toBe(false);
  });

  it("UT-REV-060 the duration cell is styled standard only when BOTH flags are set", () => {
    expect(durationCellIsStandard(flags())).toBe(true);
    expect(durationCellIsStandard(flags({ contractDurationMonths: false }))).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════ edit rehydration ═══ */

describe("editing an existing contract (rule 27)", () => {
  const stored = (over: Partial<StoredRevenueContract> = {}): StoredRevenueContract => ({
    id: "r1", name: "n", description: "Standard EEG Germany",
    label: CHOICE_FINANCE.revenueLabel.fit,
    tariffPrice: 63.8, tariffPriceP90: null, biddingPrice: 70, siteQuality: null,
    siteQualityP90: null, correctionFactor: 0.912, correctionFactorP90: null,
    contractStartDate: d("2028-01-01"), contractEndDate: d("2043-06-30"),
    contractDurationYears: 15, contractDurationMonths: 6,
    hedgeType: CHOICE_FINANCE.hedgingType.hedgedVolumePercent, hedgedVolume: 70,
    fixedContractedMwhPa: null, useInflationProfile: false,
    useCountryInflationProfile: false, inflationProfile: null, inflationStartYear: null,
    inflationCountryArea: null,
    considerNegativePrices: false, negativePriceManualOverride: false,
    currencyId: "cur-1", currencyName: "Euro", subaccountId: "sub-1", flags: flags(),
    createdOn: "2026-01-01T00:00:00Z",
    canEdit: true, canDelete: true, isFolded: false, ...over,
  });

  it("UT-REV-061 edit reads the price from the bidding column for German wind FiT", () => {
    const r = rehydrateForEdit(stored(), "Germany", "Wind");
    expect(r.price).toBe(70);
    expect(r.showsGermanFitBlock).toBe(true);
    expect(r.isStandardContract).toBe(true);
  });

  it("edit reads the tariff column outside the German FiT block", () => {
    const r = rehydrateForEdit(stored({ label: CHOICE_FINANCE.revenueLabel.ppa }), "Germany", "Wind");
    expect(r.price).toBe(63.8);
    expect(r.showsGermanFitBlock).toBe(false);
  });

  it("hedgeTypeFromValue maps the 1/2/3 option-set values", () => {
    expect(hedgeTypeFromValue(CHOICE_FINANCE.hedgingType.hedgedVolumePercent)).toBe("percentage");
    expect(hedgeTypeFromValue(CHOICE_FINANCE.hedgingType.fixedVolumePerYear)).toBe("fixed");
    expect(hedgeTypeFromValue(CHOICE_FINANCE.hedgingType.individualVolumes)).toBe("individual");
    expect(hedgeTypeFromValue(null)).toBe("percentage");
  });

  it("UT-REV-062 the row command bar reflects server permissions, not roles", () => {
    const bar = contractCommandBar(stored({ canDelete: false }), false);
    expect(bar.edit.enabled).toBe(true);
    expect(bar.delete.enabled).toBe(false);
  });

  it("UT-REV-072 a missing revenue subaccount blocks the Save, not Add Contract (S4, D33)", () => {
    // Canvas: Add Contract is gated on Draft / lock only; the subaccount error is shown in the panel.
    const bar = contractCommandBar(null, false);
    expect(bar.add.enabled).toBe(true);
    expect(bar.add.reason).toBeUndefined();
    expect(contractCommandBar(null, true).add.enabled).toBe(false);
    expect(canSaveRevenueContract(form({ subaccountId: null }))).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════ balancing prices ═══ */

describe("balancing-price periods (rules 28–30)", () => {
  const period = (over: Partial<BalancingPeriod> = {}): BalancingPeriod => ({
    id: "b1", name: "Balancing Price 1", periods: CHOICE_FINANCE.periods.period1,
    price: 5, startDate: d("2028-09-01"), endDate: d("2030-12-31"),
    durationYears: 2, durationMonths: 4, shiftOfCodMonths: 3,
    createdOn: "2026-01-01T00:00:00Z", ...over,
  });

  it("UT-REV-063 balancing periods are auto-numbered", () => {
    expect(nextPeriodValue(0)).toBe(CHOICE_FINANCE.periods.period1);
    expect(nextPeriodValue(2)).toBe(CHOICE_FINANCE.periods.period3);
    expect(nextPeriodValue(9)).toBe(CHOICE_FINANCE.periods.period10);
    expect(nextPeriodValue(10)).toBeNull();
    expect(balancingPeriodName(3)).toBe("Balancing Price 3");
  });

  it("UT-REV-064 a new period starts the day after the previous one ends", () => {
    const periods = [
      period({ id: "b1", endDate: d("2030-12-31"), createdOn: "2026-01-01T00:00:00Z" }),
      period({ id: "b2", endDate: d("2032-12-31"), createdOn: "2026-02-01T00:00:00Z" }),
    ];
    expect(nextPeriodStart(periods)).toEqual(d("2033-01-01"));
    expect(newestPeriod(periods)?.id).toBe("b2");
  });

  it("UT-REV-065 the first period start = COD shifted by N months", () => {
    expect(firstPeriodStart(d("2028-06-01"), 3)).toEqual(d("2028-09-01"));
    expect(firstPeriodStart(null, 3)).toBeNull();
    expect(showsShiftOfCod(0)).toBe(true);
    expect(showsShiftOfCod(1)).toBe(false);
  });

  it("UT-REV-066 only the newest balancing period is editable", () => {
    const periods = [
      period({ id: "b1", createdOn: "2026-01-01T00:00:00Z" }),
      period({ id: "b2", createdOn: "2026-02-01T00:00:00Z" }),
      period({ id: "b3", createdOn: "2026-03-01T00:00:00Z" }),
    ];
    expect(isNewestPeriod(periods, "b3")).toBe(true);
    expect(isNewestPeriod(periods, "b1")).toBe(false);
    expect(balancingCommandBar(periods, "b1", 4).edit.enabled).toBe(false);
    expect(balancingCommandBar(periods, "b3", 4).delete.enabled).toBe(true);
  });

  it("UT-REV-067 balancing duration months exclude 0 when years is 0", () => {
    expect(balancingMonthOptions(0)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(balancingMonthOptions(2)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("UT-REV-068 the balancing period end date", () => {
    expect(balancingEndDate(d("2033-01-01"), 2, 6)).toEqual(d("2035-06-30"));
  });
});

/* ═══════════════════════════════════════════════════════════════════ helpers ═══ */

describe("field helpers", () => {
  it("overriding a field clears its standard flag but keeps the standard value", () => {
    const f = field(65, true, 65);
    const o = overrideField(f, 70);
    expect(o).toEqual({ value: 70, standardValue: 65, isStandard: false });
  });

  it("UT-REV-071 a project with no revenue contracts renders without a First() on empty", () => {
    expect(newestPeriod([])).toBeNull();
    expect(nextPeriodStart([])).toBeNull();
    expect(generateVolumeRows(d("2030-01-01"), d("2029-01-01"))).toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════ D33 — connected build ═══ */

describe("D33 — option values pinned to the generated enums", () => {
  it("UT-REV-120 Hedging Type is 1 / 2 / 3, and CHOICE has no stale copy", () => {
    expect(Vsb_projectrevenuesvsb_hedgetype[CHOICE_FINANCE.hedgingType.hedgedVolumePercent]).toBe("HedgedVolume___");
    expect(Vsb_projectrevenuesvsb_hedgetype[CHOICE_FINANCE.hedgingType.fixedVolumePerYear]).toBe("FixedVolumep_a__MWh_");
    expect(Vsb_projectrevenuesvsb_hedgetype[CHOICE_FINANCE.hedgingType.individualVolumes]).toBe("IndividualVolumes");
    expect(Object.keys(Vsb_projectrevenuesvsb_hedgetype).map(Number).sort())
      .toEqual(Object.values(CHOICE_FINANCE.hedgingType).sort());
    // The wrong `CHOICE.hedgingType.individualVolumes = 952850001` is gone (D33).
    expect("hedgingType" in CHOICE).toBe(false);
  });

  it("UT-REV-121 Revenue Labels and Periods match the generated enums", () => {
    expect(Vsb_projectrevenuesvsb_label[CHOICE_FINANCE.revenueLabel.fit]).toBe("FiT");
    expect(Vsb_projectrevenuesvsb_label[CHOICE_FINANCE.revenueLabel.ppa]).toBe("PPA");
    Object.values(CHOICE_FINANCE.periods).forEach((v, i) => {
      expect(Vsb_balancingpricesvsb_periods[v as keyof typeof Vsb_balancingpricesvsb_periods]).toBe(`Period${i + 1}`);
    });
  });
});

describe("D33 — verbatim canvas texts", () => {
  it("UT-REV-100 the numeric error texts are the canvas ones", () => {
    expect(validateTariff("abc", "Germany").message).toBe("Numeric value without decimals");
    expect(validateBiddingPrice("73.505").message).toBe("Numeric value with maximum of two decimals");
    expect(validateSiteQuality("x").message).toBe("Numeric value with maximum of two decimals");
    expect(validateCorrectionFactor("1.2345").message).toBe("Numeric value with maximum of three decimals");
    expect(validateHedgedVolumePercent("70.55").message).toBe("Numeric value with maximum of one decimals");
    expect(validateInflationProfile("2.105").message).toBe("Numeric value with maximum of two decimals.");
    expect(validateShiftOfCod("3.5").message).toBe("Numeric value without decimals");
  });

  it("UT-REV-101 the balancing-price range texts are the canvas ones", () => {
    expect(validateBalancingPrice("-30", "Poland").message).toBe("Value must be between -25 and +50.");
    expect(validateBalancingPrice("-10", "Germany").message).toBe("Value must be between -5 and +10.");
    expect(validateBalancingPrice("7.123", "Germany").message).toBe("Numeric value with maximum of two decimals");
  });

  it("UT-REV-102 the description error is the canvas label text", () => {
    expect(validateDescription("standard deal", false).message).toBe("Standard is applicable only for system-prefilled contracts.");
  });

  it("UT-REV-103 the fifth lock bullet is the canvas text (D15 f)", () => {
    expect(pageLock(project({ clusterStateName: "Draft" }))).toContain("• Change the project status from Draft");
    expect(pageLock(project({ clusterStateName: null }))).not.toContain("• Cluster State");
  });

  it("UT-REV-104 Valle d’Aosta maps with the canvas apostrophe (U+2019) and with U+0027", () => {
    expect(provinceToPriceRegion("Valle d’Aosta")).toBe("Italy_North");
    expect(provinceToPriceRegion("Valle d'Aosta")).toBe("Italy_North");
  });
});

describe("D33 — balancing rules", () => {
  it("UT-REV-105 the year list is 0…30 (D15 g)", () => {
    const years = balancingYearOptions();
    expect(years[0]).toBe(0);
    expect(years[years.length - 1]).toBe(30);
    expect(years).toHaveLength(31);
  });

  it("UT-REV-106 Shift of COD shows for a new first period and while editing the sole period", () => {
    expect(showsShiftOfCod(0)).toBe(true);
    expect(showsShiftOfCod(1, true)).toBe(true);
    expect(showsShiftOfCod(1, false)).toBe(false);
    expect(showsShiftOfCod(2, true)).toBe(false);
  });

  it("UT-REV-107 Add Balancing Price needs Cluster State Order >= 4 and fewer than 10 periods", () => {
    expect(balancingCommandBar([], null, 3).add.enabled).toBe(false);
    expect(balancingCommandBar([], null, null).add.enabled).toBe(false);
    expect(balancingCommandBar([], null, 4).add.enabled).toBe(true);
    const ten = Array.from({ length: 10 }, (_, i) => ({
      id: `b${i}`, name: "", periods: 0, price: 1, startDate: null, endDate: null,
      durationYears: 1, durationMonths: 0, shiftOfCodMonths: null, createdOn: `2026-01-${10 + i}`,
    }));
    expect(balancingCommandBar(ten, null, 5).add.enabled).toBe(false);
    expect(balancingClusterReached(4)).toBe(true);
    expect(balancingCommandBar(ten, "b9", 5).edit.reason).toBeUndefined();
  });

  const bp = (over: Partial<BalancingPeriod> = {}): BalancingPeriod => ({
    id: "b1", name: "Balancing Price 1", periods: CHOICE_FINANCE.periods.period1,
    price: 5, startDate: d("2028-09-01"), endDate: d("2030-12-31"),
    durationYears: 2, durationMonths: 4, shiftOfCodMonths: 3, createdOn: "2026-01-01", ...over,
  });

  it("UT-REV-108 a new first period: name 1, Period 1, the shift, no dates, the project's owner", () => {
    const plan = planSaveBalancing({
      form: { id: null, price: "4.5", years: 2, months: 4, shift: "3" }, periods: [], project: project(),
    });
    expect(plan.writes).toHaveLength(1);
    const w = plan.writes[0]!;
    expect(w).toMatchObject({ op: "create", entitySet: "vsb_balancingprices" });
    expect(w.data).toEqual({
      vsb_name: "Balancing Price 1",
      "vsb_Project@odata.bind": "/vsb_projects(p1)",
      vsb_periods: CHOICE_FINANCE.periods.period1,
      vsb_shiftofcoddatemonths: 3,
      vsb_contractdurationyear: 2,
      vsb_contractdurationmonth: 4,
      vsb_balancingpriceeurpln: 4.5,
      "owningbusinessunit@odata.bind": "/businessunits(bu-1)",
    });
  });

  it("UT-REV-109 SOURCE DEFECT: the canvas balancing create writes no owner (parity twin)", () => {
    const plan = planSaveBalancing({
      form: { id: null, price: "4.5", years: 2, months: 4, shift: "" }, periods: [], project: project(),
      ownerCanvasParity: true,
    });
    expect(plan.writes[0]!.data).not.toHaveProperty("owningbusinessunit@odata.bind");
    expect(plan.writes[0]!.data!.vsb_shiftofcoddatemonths).toBeNull();
  });

  it("UT-REV-110 a later period: name n+1, the next Period, no shift; an edit keeps its Period and owner", () => {
    const periods = [bp(), bp({ id: "b2", periods: CHOICE_FINANCE.periods.period2, createdOn: "2026-02-01" })];
    const add = planSaveBalancing({ form: { id: null, price: "1", years: 1, months: 0, shift: "7" }, periods, project: project() });
    expect(add.writes[0]!.data).toMatchObject({
      vsb_name: "Balancing Price 3", vsb_periods: CHOICE_FINANCE.periods.period3, vsb_shiftofcoddatemonths: null,
    });
    const edit = planSaveBalancing({ form: { id: "b2", price: "2", years: 1, months: 0, shift: "" }, periods, project: project() });
    expect(edit.writes[0]).toMatchObject({ op: "update", id: "b2" });
    expect(edit.writes[0]!.data).toMatchObject({ vsb_name: "Balancing Price 2", vsb_periods: CHOICE_FINANCE.periods.period2 });
    expect(edit.writes[0]!.data).not.toHaveProperty("owningbusinessunit@odata.bind");
    const sole = planSaveBalancing({ form: { id: "b1", price: "2", years: 1, months: 0, shift: "5" }, periods: [bp()], project: project() });
    expect(sole.writes[0]!.data!.vsb_shiftofcoddatemonths).toBe(5);
  });

  it("UT-REV-111 balancing delete is one delete; refusals send nothing", () => {
    expect(planDeleteBalancing(bp()).writes).toEqual([
      { op: "delete", entitySet: "vsb_balancingprices", id: "b1", reason: "delete the balancing price" },
    ]);
    expect(planDeleteBalancing(null).writes).toHaveLength(0);
    expect(planSaveBalancing({ form: { id: null, price: "1", years: 1, months: 0, shift: "" }, periods: [], project: null }).refusedReason)
      .toBe(REVENUE_SCREEN_TEXT.noProject);
  });
});

describe("D33 — contract save", () => {
  it("UT-REV-112 the canvas Save gate: Site Quality p90 may be blank; an invalid Site Quality p50 blocks", () => {
    const german = form({
      revenueTypeLabel: "FiT", description: "EEG Germany", showsGermanFitBlock: true,
      biddingPrice: "73.50", correctionFactor: "0.912", correctionFactorP90: "0.850", siteQualityP90: "",
    });
    expect(canSaveRevenueContract(german)).toBe(true);
    expect(canSaveRevenueContract({ ...german, siteQuality: "abc" })).toBe(false);
    expect(canSaveRevenueContract({ ...german, siteQualityP90: "101" })).toBe(false);
    expect(canSaveRevenueContract(form({ description: "   " }))).toBe(false);
  });

  it("UT-REV-113 SQ p90 / CF p90 are written only for German wind FiT; a German Hybrid FiT writes 0", () => {
    const hybrid = form({
      technology: "Other", revenueTypeLabel: "FiT", showsGermanFitBlock: true,
      biddingPrice: "70", siteQuality: "85", siteQualityP90: "80", correctionFactor: "0.9", correctionFactorP90: "0.8",
    });
    const p = buildRevenuePayload(hybrid, project({ technology: "Other" }), flags());
    expect(p.biddingPrice).toBe(70);
    expect(p.siteQuality).toBe(85);
    expect(p.siteQualityP90).toBe(0);
    expect(p.correctionFactorP90).toBe(0);
    const wind = buildRevenuePayload({ ...hybrid, technology: "Wind" }, project(), flags());
    expect(wind.siteQualityP90).toBe(80);
    expect(wind.correctionFactorP90).toBe(0.8);
  });

  it("UT-REV-114 the payload carries the project's Area and owner; a blank visible number is null", () => {
    const p = buildRevenuePayload(
      form({ revenueTypeLabel: "FiT", showsGermanFitBlock: true, biddingPrice: "70", siteQuality: "" }),
      project({ areaName: "Lazio" }), flags(),
    );
    expect(p.inflationCountryArea).toBe("Lazio");
    expect(p.owningBusinessUnitId).toBe("bu-1");
    expect(p.siteQuality).toBeNull();
  });

  it("UT-REV-115 the fourteen flags follow the canvas terms", () => {
    const f = form({
      showsGermanFitBlock: true, revenueTypeLabel: "FiT", useInflation: true,
      std: {
        ...NOTHING_STANDARD, price: true, correctionFactor: false, biddingPrice: true,
        hedgedVolume: true, inflationValue: true, correctionFactorP90: true, priceP90: true,
      },
    });
    const flagsOut = buildStandardFlags(f);
    expect(flagsOut.tariffPrice).toBe(false); // price AND correction factor for German FiT
    expect(flagsOut.biddingPrice).toBe(true);
    expect(flagsOut.hedgedVolume).toBe(true);
    expect(flagsOut.customInflationProfile).toBe(true);
    expect(flagsOut.correctionFactorP90).toBe(true);
    expect(flagsOut.tariffPriceP90).toBe(true);
    expect(buildStandardFlags({ ...f, hedge: hedge({ type: "fixed" }) }).hedgedVolume).toBe(false);
    expect(buildStandardFlags({ ...f, showsGermanFitBlock: false }).biddingPrice).toBe(false);
  });

  it("UT-REV-116 SOURCE DEFECT: 'Is Use Custom Inflation' tests the standard VALUE in the canvas", () => {
    const f = form({ std: { ...NOTHING_STANDARD, useCountryInflation: false, useCountryInflationStandardValue: true } });
    expect(buildStandardFlags(f).useCustomInflation).toBe(false);
    expect(buildStandardFlagsCanvasParity(f).useCustomInflation).toBe(true);
  });

  it("UT-REV-117 a new contract: one create, then its individual volumes bound to the created row", () => {
    const rows = generateVolumeRows(d("2028-07-01"), d("2029-06-30")).map((r) => ({ ...r, value: "8000", initialState: false }));
    const plan = planSaveContract({
      form: form({ hedge: hedge({ type: "individual", individual: rows }) }),
      project: project(), currencyId: "cur-1", storedVolumeIds: ["old"],
    });
    expect(plan.writes.map((w) => `${w.op}:${w.entitySet}`)).toEqual([
      "create:vsb_projectrevenues",
      "create:vsb_revenueindividualhedgevolumes",
      "create:vsb_revenueindividualhedgevolumes",
    ]);
    const c = plan.writes[0]!.data!;
    expect(c["vsb_Project@odata.bind"]).toBe("/vsb_projects(p1)");
    expect(c["vsb_Subaccount@odata.bind"]).toBe("/vsb_revenuesubaccounts(sub-1)");
    expect(c["vsb_Currency@odata.bind"]).toBe("/transactioncurrencies(cur-1)");
    expect(c["owningbusinessunit@odata.bind"]).toBe("/businessunits(bu-1)");
    expect(c.vsb_hedgetype).toBe(3);
    expect(c.vsb_contractstartdate).toBe("2028-01-01");
    expect(c.vsb_istarrifpricestandardassumption).toBe(false);
    expect(plan.writes[1]!.data).toEqual({
      vsb_year: 2028,
      "vsb_RevenueContract@odata.bind": "/vsb_projectrevenues(@created#0)",
      vsb_startdate: "2028-07-01",
      vsb_enddate: "2028-12-31",
      "owningbusinessunit@odata.bind": "/businessunits(bu-1)",
      vsb_individualcontractedmwhpa: 8000,
    });
  });

  it("UT-REV-118 an edit: update, then delete EVERY stored volume (any hedge type), then the new rows", () => {
    const pct = planSaveContract({
      form: form({ mode: "Edit", contractId: "r1" }), project: project(), currencyId: "cur-1", storedVolumeIds: ["v1", "v2"],
    });
    expect(pct.writes.map((w) => `${w.op}:${w.id ?? ""}`)).toEqual(["update:r1", "delete:v1", "delete:v2"]);
    const rows = generateVolumeRows(d("2028-01-01"), d("2028-12-31")).map((r) => ({ ...r, value: "5", initialState: false }));
    const ind = planSaveContract({
      form: form({ mode: "Edit", contractId: "r1", hedge: hedge({ type: "individual", individual: rows }) }),
      project: project(), currencyId: "cur-1", storedVolumeIds: ["v1"],
    });
    expect(ind.writes.map((w) => w.op)).toEqual(["update", "delete", "create"]);
    expect(ind.writes[2]!.data!["vsb_RevenueContract@odata.bind"]).toBe("/vsb_projectrevenues(r1)");
  });

  it("UT-REV-119 refusals and the contract delete", () => {
    expect(planSaveContract({ form: form(), project: null, currencyId: "c", storedVolumeIds: [] }).refusedReason).toBe(REVENUE_SCREEN_TEXT.noProject);
    expect(planSaveContract({ form: form({ subaccountId: null }), project: project(), currencyId: "c", storedVolumeIds: [] }).refusedReason).toBe(REVENUE_SCREEN_TEXT.noSubaccount);
    expect(planSaveContract({ form: form(), project: project(), currencyId: null, storedVolumeIds: [] }).refusedReason).toBe(REVENUE_SCREEN_TEXT.noCurrency);
    const del = planDeleteContract({ id: "r1" } as StoredRevenueContract);
    // The volumes go by `CascadeDelete: Cascade` — the app does not delete them itself.
    expect(del.writes).toEqual([{ op: "delete", entitySet: "vsb_projectrevenues", id: "r1", reason: "delete the revenue contract" }]);
  });

  it("UT-REV-122 the jobs carry the canvas spinner and error texts", () => {
    const job = saveContractJob(async () => ({ writes: [], log: [] }));
    expect(job.progress).toBe("Please wait, saving...");
    expect(job.errorText!("boom")).toBe("Error: Contract could not be saved correctly. Internal error: originated on vsb_projectrevenues. Message: boom");
    expect(deleteContractJob(null).progress).toBe("Deleting Contract...");
    expect(saveBalancingJob({ writes: [], log: [] }).errorText!("x")).toContain("originated on vsb_balancingprices.");
    expect(deleteBalancingJob(null).progress).toBe("Please wait, deleting...");
    expect(SPINNER.validatingHedge).toBe("Validating Hedged Volume...");
  });
});

describe("D33 — the contract form", () => {
  it("UT-REV-123 Add Contract opens with an empty Type and nothing derived (B3)", () => {
    const f = newContractForm(project(), "sub-1");
    expect(f.revenueTypeLabel).toBeNull();
    expect(f.tariff).toBe("");
    expect(f.startDate).toBeNull();
    expect(f.hedge.type).toBe("percentage");
    expect(f.formDirty).toBe(false);
    expect(f.currencyCode).toBe("EUR");
  });

  it("UT-REV-124 with no Fabric rows the engine derives nothing standard", () => {
    const f = applyRevenueEngine({
      project: project(), rows: [], region: null, label: "PPA", productionExists: false,
      subaccountId: "sub-1", profiles: [], today: d("2026-10-20"),
    });
    expect(f.description).toBe("PPA Germany");
    expect(f.isStandardContract).toBe(false);
    expect(f.tariff).toBe("");
    expect(f.hedge.percentage.value).toBe("");
    expect(f.std.price).toBe(false);
    expect(f.std.hedgedVolume).toBe(false);
    expect(f.formDirty).toBe(true);
  });

  it("UT-REV-125 the standard hedged volume comes from valuetype hedgedvolume (B4)", () => {
    const rows = [row("hedgedvolume", "", "80", "60")];
    expect(standardHedgedVolume(rows, "Wind", true)).toEqual({ value: "80", standardValue: "80", isStandard: true });
    expect(standardHedgedVolume(rows, "PV", true).value).toBe("60");
    expect(standardHedgedVolume(rows, "Wind", false)).toEqual({ value: "", standardValue: "", isStandard: false });
  });

  it("UT-REV-126 any field change makes the contract non-standard and drops every \"Standard \" (B8)", () => {
    const f = form({ description: "Standard PPA Germany", isStandardContract: true, formDirty: false });
    const next = editField(f, { tariff: "70" }, { price: false });
    expect(next.isStandardContract).toBe(false);
    expect(next.description).toBe("PPA Germany");
    expect(next.formDirty).toBe(true);
    expect(shownDescription("Standard PPA Standard X", false)).toBe("PPA X");
    expect(shownDescription("Standard PPA", true)).toBe("Standard PPA");
  });

  it("UT-REV-127 a new start date sets the inflation start year and regenerates individual volumes (B9-B11)", () => {
    const rows = generateVolumeRows(d("2028-01-01"), d("2030-12-31")).map((r) => ({ ...r, value: "1", initialState: false }));
    const f = form({ hedge: hedge({ type: "individual", individual: rows }) });
    const next = withTerm(f, { startDate: d("2029-03-01") }, { contractStartDate: false });
    expect(next.inflationStartYear).toBe("2029");
    expect(next.endDate).toEqual(d("2044-08-31"));
    expect(next.hedge.individual[0]!.year).toBe(2029);
    expect(next.hedge.individual.every((r) => r.initialState)).toBe(true);
    const reset = withTerm(f, { startDate: d("2029-03-01"), inflationYearFromStart: false }, { contractStartDate: true });
    expect(reset.inflationStartYear).toBe("");
    expect(reset.std.contractStartDate).toBe(true);
  });

  it("UT-REV-128 Tariff p90 = Bidding × CF p90 for Germany FiT, else the p50 tariff (B12)", () => {
    expect(tariffP90Text("Germany", "FiT", "70", "0.850", "63.84")).toBe("59.50");
    expect(tariffP90Text("France", "PPA", "", "", "65")).toBe("65.00");
    expect(tariffP90Text("France", "PPA", "", "", "")).toBe("");
  });

  it("UT-REV-129 the edit form reads each field's standardness off its stored flag", () => {
    const c = {
      id: "r1", name: "n", description: "EEG Germany", label: CHOICE_FINANCE.revenueLabel.fit,
      tariffPrice: 63.84, tariffPriceP90: 59.5, biddingPrice: 70, siteQuality: 85, siteQualityP90: null,
      correctionFactor: 0.912, correctionFactorP90: 0.85, contractStartDate: d("2028-01-01"),
      contractEndDate: d("2047-12-31"), contractDurationYears: 20, contractDurationMonths: 0,
      hedgeType: CHOICE_FINANCE.hedgingType.fixedVolumePerYear, hedgedVolume: 0, fixedContractedMwhPa: 9000,
      useInflationProfile: false, useCountryInflationProfile: false, inflationProfile: 0, inflationStartYear: 0,
      inflationCountryArea: null, considerNegativePrices: false, negativePriceManualOverride: false,
      currencyId: "c", currencyName: "Euro", subaccountId: "s",
      flags: flags({ tariffPrice: false, hedgedVolume: true }), createdOn: "", canEdit: true, canDelete: true, isFolded: false,
    } satisfies StoredRevenueContract;
    const std = standardFromStored(c, "Germany", "Wind");
    expect(std.price).toBe(true); // German FiT → the bidding flag
    expect(std.contractEndDate).toBe(false);
    expect(std.hedgedVolume).toBe(false); // fixed type
    expect(std.useCountryInflationStandardValue).toBe(false);
    const f = editContractForm({ contract: c, project: project(), volumes: [] });
    expect(f.mode).toBe("Edit");
    expect(f.hedge.fixed).toMatchObject({ value: "9000", initialState: false });
    expect(f.tariffP90).toBe("59.50");
    expect(f.showsGermanFitBlock).toBe(true);
  });

  it("UT-REV-130 the country toggle looks the value up (no Area); the start year re-looks it up (Italy adds Area)", () => {
    const profiles = [
      { countryCode: "IT", year: 2030, inflation: 1.9, area: "Centre - North" },
      { countryCode: "IT", year: 2030, inflation: 2.7, area: "North" },
    ];
    const f = form({ country: "Italy", useInflation: true, inflationStartYear: "2030" });
    const on = toggleCountryInflation(f, true, profiles, "IT");
    expect(on.inflationProfile).toBe("1.90"); // `Text(rec, "0.00")` (audit 20 Oct 2026)
    expect(on.std.inflationValue).toBe(false);
    expect(toggleCountryInflation(on, false, profiles, "IT").inflationProfile).toBe("");
    const year = changeInflationStartYear(on, "2030", profiles, "IT", "Italy_North");
    expect(year.inflationProfile).toBe("2.70");
  });

  it("UT-REV-131 DIVERGENCE: the Area term ignores the spaces around the hyphen", () => {
    const profiles = [{ countryCode: "IT", year: 2030, inflation: 2.2, area: "Centre - North" }];
    expect(sameInflationArea("Centre - North", "Centre-North")).toBe(true);
    expect(countryInflationValue(profiles, "IT", 2030, "Italy_Centre-North")).toBe(2.2);
    expect(countryInflationValueCanvasParity(profiles, "IT", 2030, "Italy_Centre-North")).toBe(0);
  });

  it("UT-REV-132 re-sync clears the negative-price override", () => {
    const f = form({ considerNegativePrices: true, negativePriceManualOverride: true });
    const next = resyncNegativePrice(f, { displayMode: "edit", toggleState: false, manualOverride: false });
    expect(next.considerNegativePrices).toBe(false);
    expect(next.negativePriceManualOverride).toBe(false);
  });
});

describe("rule 20 — the panel's standard-assumption styling", () => {
  it("UT-REV-913 every panel field follows its own canvas flag; nothing is styled for a hand-typed contract", () => {
    expect(Object.values(revenuePanelStandard(form())).every((v) => v === false)).toBe(true);
    const all = revenuePanelStandard(form({
      isStandardContract: true,
      std: { ...NOTHING_STANDARD, contractStartDate: true, contractEndDate: true, biddingPrice: true,
        correctionFactor: true, correctionFactorP90: true, price: true, inflationStartYear: true,
        inflationValue: true, hedgedVolume: true },
    }));
    expect(Object.values(all).every((v) => v === true)).toBe(true);
    const one = revenuePanelStandard(form({ std: { ...NOTHING_STANDARD, inflationValue: true } }));
    expect(one.inflationProfile).toBe(true);
    expect(one.inflationStartYear).toBe(false);
  });

  it("UT-REV-914 tariff: German FiT needs price AND correction p50 standard; p90 reads locRevenuePrice as the canvas does", () => {
    const priceOnly = { ...NOTHING_STANDARD, price: true };
    expect(revenuePanelStandard(form({ std: priceOnly })).tariff).toBe(true);
    expect(revenuePanelStandard(form({ showsGermanFitBlock: true, std: priceOnly })).tariff).toBe(false);
    const fit = revenuePanelStandard(form({ showsGermanFitBlock: true, std: { ...priceOnly, correctionFactor: true } }));
    expect(fit.tariff).toBe(true);
    expect(fit.tariffP90).toBe(true);
  });

  it("UT-REV-915 an edit clears the styling (editField drops isStandardContract; the field's flag goes false)", () => {
    const std = form({ isStandardContract: true, std: { ...NOTHING_STANDARD, biddingPrice: true } });
    const edited = editField(std, { biddingPrice: "70" }, { biddingPrice: false });
    expect(revenuePanelStandard(edited).description).toBe(false);
    expect(revenuePanelStandard(edited).biddingPrice).toBe(false);
  });
});

describe("D33 — grid formats", () => {
  it("UT-REV-133 dates dd.mm.yyyy, tariff #,##0.00, site quality # / #0.0#", () => {
    expect(fmtCardDate(d("2028-03-05"))).toBe("05.03.2028");
    expect(fmtCardDate(null)).toBe("");
    expect(fmtTariffCell(1234.5)).toBe("1,234.50");
    expect(fmtSiteQualityCell(85)).toBe("85");
    expect(fmtSiteQualityCell(85.25)).toBe("85.25");
    expect(fmtSiteQualityCell(85.5)).toBe("85.5");
  });

  it("UT-REV-134 the hedged-volume cell: \"x %\", \"#,##0 MWh\", blank for Individual Volumes", () => {
    expect(fmtHedgeCell({ hedgeType: 1, hedgedVolume: 70, fixedContractedMwhPa: null })).toBe("70 %");
    expect(fmtHedgeCell({ hedgeType: 1, hedgedVolume: 70.5, fixedContractedMwhPa: null })).toBe("70.5 %");
    expect(fmtHedgeCell({ hedgeType: 2, hedgedVolume: 0, fixedContractedMwhPa: 90000 })).toBe("90,000 MWh");
    expect(fmtHedgeCell({ hedgeType: 3, hedgedVolume: 0, fixedContractedMwhPa: null })).toBe("");
  });

  it("UT-REV-135 the inflation cell and its caption; the Area cell for Italy with the country profile", () => {
    expect(inflationCell({ useCountryInflationProfile: false, inflationProfile: 2.1 }, "Germany", null)).toBe("2.10 ");
    expect(inflationCell({ useCountryInflationProfile: true, inflationProfile: 0 }, "Germany", null)).toBe("Germany");
    expect(inflationCell({ useCountryInflationProfile: true, inflationProfile: 0 }, "Italy", "Italy_South")).toBe(" Italy - South");
    expect(inflationCellCaption(false)).toBe("Inflation Profile [%]");
    expect(showsAreaCell("Italy", { useCountryInflationProfile: true })).toBe(true);
    expect(showsAreaCell("Italy", { useCountryInflationProfile: false })).toBe(false);
  });

  it("UT-REV-136 contracts and periods are sorted by Created On", () => {
    const a = { createdOn: "2026-02-01" } as StoredRevenueContract;
    const b = { createdOn: "2026-01-01" } as StoredRevenueContract;
    expect(sortContracts([a, b])[0]).toBe(b);
  });
});

/* ═══════════════════════════════════════════════════════ contract card gallery (D33 V6) */

describe("UT-REV the contract card gallery (D33 V6)", () => {
  const F = "txt_ProjectRevenues_DisplayProjectBodyRightContent_GridContracts_CardBody_Fields_";
  const card = (over: Partial<StoredRevenueContract> = {}): StoredRevenueContract => ({
    id: "r1", name: "n", description: "Standard EEG Germany",
    label: CHOICE_FINANCE.revenueLabel.fit,
    tariffPrice: 1063.8, tariffPriceP90: 60.5, biddingPrice: 70, siteQuality: 85,
    siteQualityP90: 82.25, correctionFactor: 0.912, correctionFactorP90: 0.9,
    contractStartDate: d("2028-01-01"), contractEndDate: d("2043-06-30"),
    contractDurationYears: 15, contractDurationMonths: 1,
    hedgeType: CHOICE_FINANCE.hedgingType.hedgedVolumePercent, hedgedVolume: 70,
    fixedContractedMwhPa: null, useInflationProfile: true,
    useCountryInflationProfile: false, inflationProfile: 2, inflationStartYear: 2029,
    inflationCountryArea: null,
    considerNegativePrices: false, negativePriceManualOverride: false,
    currencyId: "cur-1", currencyName: "Euro", subaccountId: "sub-1", flags: flags(),
    createdOn: "2026-01-01T00:00:00Z",
    canEdit: true, canDelete: true, isFolded: false, ...over,
  });
  const ctx = (over: Partial<ContractCardContext> = {}): ContractCardContext => ({
    country: "Germany", technology: "Wind", currencyName: "Euro", region: null, ...over,
  });
  const keys = (fields: CardField[]) => fields.map((f) => f.key);
  const val = (fields: CardField[], key: string, i = 0) => fields.find((f) => f.key === key)!.values[i]!;

  it("UT-REV-137 German wind FiT shows every tile in canvas order, with the canvas formats", () => {
    const fields = contractCardFields(card(), ctx());
    expect(keys(fields)).toEqual([
      "currency", "contractStartDate", "contractDuration", "contractEndDate", "biddingPrice",
      "inflationProfile", "inflationStartYear", "siteQuality", "siteQualityP90", "correctionFactor",
      "correctionFactorP90", "tariffPrice", "tariffPriceP90", "hedgedVolumeType", "hedgedVolume",
    ]);
    expect(val(fields, "contractStartDate").text).toBe("01.01.2028");
    expect(val(fields, "contractDuration", 0).text).toBe("15 years");
    expect(val(fields, "contractDuration", 1).text).toBe("1 month");
    expect(val(fields, "biddingPrice").text).toBe("70.00");
    expect(val(fields, "inflationProfile").text).toBe("2.00 ");
    expect(val(fields, "siteQualityP90").text).toBe("82.25");
    expect(val(fields, "correctionFactor").text).toBe("0.912");
    expect(val(fields, "correctionFactorP90").text).toBe("0.900");
    expect(val(fields, "tariffPrice").text).toBe("1,063.80");
    expect(val(fields, "hedgedVolume").text).toBe("70 %");
    expect(fields.find((f) => f.key === "tariffPrice")!.caption).toBe("Tariff / Price p50 [EUR/MWh]");
    expect(fields.find((f) => f.key === "siteQuality")!.caption).toBe("Site Quality p50");
    expect(contractCardTitle(card())).toBe("FiT - Standard EEG Germany");
  });

  it("UT-REV-138 outside the German FiT block only the common tiles show; Poland and Italy captions and Area", () => {
    const fr = contractCardFields(card({ label: CHOICE_FINANCE.revenueLabel.ppa }), ctx({ country: "France" }));
    expect(keys(fr)).toEqual([
      "currency", "contractStartDate", "contractDuration", "contractEndDate", "inflationProfile",
      "tariffPrice", "hedgedVolumeType", "hedgedVolume",
    ]);
    // `$"Tariff / Price {If(…, "p50")} [EUR/MWh]"` keeps its double space.
    expect(fr.find((f) => f.key === "tariffPrice")!.caption).toBe("Tariff / Price  [EUR/MWh]");
    expect(cardTariffPriceCaption("Poland", false)).toBe("Tariff / Price [PLN/MWh]");
    // German PV FiT: no FiT tiles, no p90 tiles.
    expect(keys(contractCardFields(card(), ctx({ technology: "PV" })))).not.toContain("biddingPrice");
    const italy = contractCardFields(card({ label: CHOICE_FINANCE.revenueLabel.ppa, useCountryInflationProfile: true,
      inflationCountryArea: "Centre-North" }), ctx({ country: "Italy", region: "Italy_South" }));
    expect(keys(italy)).toContain("area");
    expect(val(italy, "area").text).toBe("Centre-North");
    expect(val(italy, "inflationProfile").text).toBe(" Italy - South");
    expect(italy.find((f) => f.key === "inflationProfile")!.caption).toBe("Inflation Profile");
    // No custom profile value: `Text(Blank(), "#0.00 ")` is "".
    expect(val(contractCardFields(card({ inflationProfile: null }), ctx()), "inflationProfile").text).toBe("");
  });

  it("UT-REV-139 the value colours follow the canvas FontColor / FontItalic pairs, Area and Hedge Type quirks included", () => {
    const none = flags({
      biddingPrice: false, contractDurationYears: false, contractDurationMonths: false, contractStartDate: false,
      contractEndDate: false, tariffPrice: false, tariffPriceP90: false, customInflationProfile: false,
      hedgedVolume: false, correctionFactor: false, correctionFactorP90: false,
    });
    const plain = contractCardFields(card({ flags: none }), ctx());
    expect(val(plain, "currency").tone).toBe("standard"); // unconditional in the canvas (FontItalic: =true)
    expect(val(plain, "contractStartDate").tone).toBe("plain");
    const std = contractCardFields(card(), ctx());
    expect(val(std, "contractStartDate").tone).toBe("standard");
    expect(val(std, "biddingPrice").tone).toBe("standard");
    expect(val(std, "correctionFactorP90").tone).toBe("standard");
    // D35: their canvas TextInputs set FontItalic on the same flag too (corrected from blue only)
    expect(val(std, "tariffPrice").tone).toBe("standard");
    expect(val(std, "tariffPriceP90").tone).toBe("standard");
    expect(val(std, "inflationProfile").tone).toBe("standard");
    expect(val(std, "hedgedVolumeType").tone).toBe("standard");
    expect(val(std, "siteQuality").tone).toBe("plain");
    expect(val(std, "hedgedVolume").tone).toBe("standard");
    // the duration needs both flags
    expect(val(contractCardFields(card({ flags: flags({ contractDurationMonths: false }) }), ctx()), "contractDuration").tone).toBe("plain");
    // Area follows the tariff p90 flag (canvas copy-paste)
    const area = (p90: boolean) => val(contractCardFields(card({ useCountryInflationProfile: true, inflationCountryArea: "Sud",
      flags: flags({ tariffPriceP90: p90 }) }), ctx({ country: "Italy" })), "area").tone;
    expect([area(true), area(false)]).toEqual(["standard", "plain"]);
    // the Hedged Volume Type value carries the Hedged Volume AccessibleLabel
    const type = val(std, "hedgedVolumeType");
    expect([type.control, type.accessibleLabel]).toEqual([`${F}HedgedVolume_2`, `${F}HedgedVolume_1`]);
    expect(type.text).toBe("Hedged Volume [%]");
    // Individual Volumes: no Hedged Volume tile; fixed: "#,##0 MWh", not blue (the % type only)
    const ind = contractCardFields(card({ hedgeType: CHOICE_FINANCE.hedgingType.individualVolumes }), ctx());
    expect(keys(ind)).not.toContain("hedgedVolume");
    const fixed = contractCardFields(card({ hedgeType: CHOICE_FINANCE.hedgingType.fixedVolumePerYear, fixedContractedMwhPa: 90000 }), ctx());
    expect([val(fixed, "hedgedVolume").text, val(fixed, "hedgedVolume").tone]).toEqual(["90,000 MWh", "plain"]);
  });

  it("UT-REV-140 the fold chevrons flip IsFolded; a saved card is unfolded; blank durations stay blank", () => {
    const a = toggleContractFold(new Set(), "r1");
    expect(a.has("r1")).toBe(true);
    expect(toggleContractFold(a, "r1").has("r1")).toBe(false);
    expect(unfoldContract(a, "r1").has("r1")).toBe(false);
    expect(unfoldContract(a, null).has("r1")).toBe(true);
    const f = contractCardFields(card({ contractDurationYears: null, contractDurationMonths: 0 }), ctx());
    expect([val(f, "contractDuration", 0).text, val(f, "contractDuration", 1).text]).toEqual(["", "0 month"]);
    expect(CONTRACT_CARD_CONTROL.gallery).toBe("gal_ProjectRevenues_DisplayProjectBodyRightContent_GridContracts_1");
  });
});

/* ═══════════════════════════════════════ PO validation audit (20 Oct 2026) ═══ */

describe("PO validation audit — the contract panel's Power Fx, term for term (20 Oct 2026)", () => {
  const stored = (over: Partial<StoredRevenueContract> = {}): StoredRevenueContract => ({
    id: "r9", name: "n", description: "Standard EEG Germany", label: CHOICE_FINANCE.revenueLabel.fit,
    tariffPrice: 99, tariffPriceP90: 99, biddingPrice: 62.345, siteQuality: 0, siteQualityP90: 1.5,
    correctionFactor: null, correctionFactorP90: 0.85, contractStartDate: d("2033-06-05"),
    contractEndDate: d("2053-06-04"), contractDurationYears: 20, contractDurationMonths: 0,
    hedgeType: CHOICE_FINANCE.hedgingType.hedgedVolumePercent, hedgedVolume: 12.255, fixedContractedMwhPa: null,
    useInflationProfile: false, useCountryInflationProfile: false, inflationProfile: 2.1, inflationStartYear: 0,
    inflationCountryArea: null, considerNegativePrices: false, negativePriceManualOverride: false,
    currencyId: "c", currencyName: "Euro", subaccountId: "s", flags: flags(), createdOn: "",
    canEdit: true, canDelete: true, isFolded: false, ...over,
  });

  it("UT-REV-141 with no standard the engine's start date is the COD (blank COD stays blank), not today", () => {
    const today = d("2026-10-20");
    expect(contractStartDate([], "Wind", project(), { today }).value).toEqual(d("2028-01-01"));
    expect(contractStartDate([], "Wind", project({ cod: null }), { today }).value).toBeNull();
    // With a standard: PV / Wind and a non-COD reference → blank; another technology → today.
    const other = [row("contractstart", "", "finalinvestmentdecision", "finalinvestmentdecision")];
    expect(contractStartDate(other, "Wind", project(), { today, standardAssumptionExists: true }).value).toBeNull();
    expect(contractStartDate(other, "Other", project(), { today, standardAssumptionExists: true }).value).toEqual(today);
  });

  it("UT-REV-142 with no standard the durations are blank and the end date is the start date", () => {
    const f = applyRevenueEngine({
      project: project(), rows: [], region: null, label: "PPA", productionExists: false,
      subaccountId: "sub-1", profiles: [], today: d("2026-10-20"),
    });
    expect(f.startDate).toEqual(d("2028-01-01"));
    expect(f.durationYears).toBeNull();
    expect(f.durationMonths).toBeNull();
    expect(f.endDate).toEqual(d("2028-01-01"));
    expect(f.std.contractStartDate).toBe(true); // ambiguity 5, hard-coded
    expect(f.std.contractEndDate).toBe(false);
  });

  it("UT-REV-143 the engine's end date has no one-day guard; a non-standard term is the start date", () => {
    const start = field<Date | null>(d("2028-01-01"), true);
    expect(engineEndDate(start, field<number | null>(0, true), field<number | null>(0, true))).toEqual(d("2027-12-31"));
    expect(engineEndDate(start, field<number | null>(20, false), field<number | null>(0, true))).toEqual(d("2028-01-01"));
    expect(engineEndDate(field<Date | null>(null, true), field<number | null>(1, true), field<number | null>(0, true))).toBeNull();
  });

  it("UT-REV-144 the custom inflation profile is Text(…, 0.00): a contract with no standard shows 0.00", () => {
    const f = applyRevenueEngine({
      project: project(), rows: [], region: null, label: "PPA", productionExists: false,
      subaccountId: "sub-1", profiles: [],
    });
    expect(f.inflationProfile).toBe("0.00");
    expect(fmtTwoDecimals(2.125)).toBe("2.13");
    expect(fmtTwoDecimals(null)).toBe("");
  });

  it("UT-REV-145 picking the years fills blank months with 0, and either picker un-standardises both", () => {
    const f = form({ durationYears: null, durationMonths: null, std: { ...NOTHING_STANDARD, contractDurationYears: true, contractDurationMonths: true } });
    const y = withTerm(f, { durationYears: 20 }, {});
    expect(y.durationMonths).toBe(0);
    expect(y.std.contractDurationYears).toBe(false);
    expect(y.std.contractDurationMonths).toBe(false);
    const m = withTerm({ ...f, durationYears: 5 }, { durationMonths: 3 }, {});
    expect(m.std.contractDurationYears).toBe(false);
    expect(m.durationYears).toBe(5);
  });

  it("UT-REV-146 a new start date with blank years or months leaves the end date blank once the term is longer than a day", () => {
    const f = form({ durationYears: null, durationMonths: 6 });
    expect(withTerm(f, { startDate: d("2029-01-01") }, { contractStartDate: false }).endDate).toBeNull();
    const zero = form({ durationYears: null, durationMonths: 0 });
    expect(withTerm(zero, { startDate: d("2029-01-01") }, { contractStartDate: false }).endDate).toEqual(d("2029-01-01"));
  });

  it("UT-REV-147 Reset to COD keeps the contract standard and derives the end date's standardness", () => {
    const f = form({
      description: "Standard PPA Germany", isStandardContract: true, startDate: d("2030-05-01"),
      durationYears: 15, durationMonths: 0, inflationStartYear: "2030",
      std: { ...NOTHING_STANDARD, contractDurationYears: true, contractDurationMonths: true },
    });
    const r = resetStartToCod(f, project(), []);
    expect(r.startDate).toEqual(d("2028-01-01"));
    expect(r.endDate).toEqual(d("2042-12-31"));
    expect(r.isStandardContract).toBe(true);
    expect(r.description).toBe("Standard PPA Germany");
    expect(r.std.contractStartDate).toBe(true);
    expect(r.std.contractEndDate).toBe(true);
    expect(r.inflationStartYear).toBe("2030");
    expect(r.formDirty).toBe(true);
    const short = resetStartToCod({ ...f, durationYears: 0 }, project(), []);
    expect(short.endDate).toEqual(d("2028-01-01"));
    expect(short.std.contractEndDate).toBe(false);
  });

  it("UT-REV-148 Site Quality, volumes and the negative-price toggle only mark the form dirty", () => {
    const f = form({ description: "Standard PPA Germany", isStandardContract: true, formDirty: false });
    const t = touchField(f, { siteQuality: "80" });
    expect(t.isStandardContract).toBe(true);
    expect(t.description).toBe("Standard PPA Germany");
    expect(t.formDirty).toBe(true);
    const re = resyncNegativePrice(f, { displayMode: "edit", toggleState: true, manualOverride: false });
    expect(re.isStandardContract).toBe(true);
    expect(re.considerNegativePrices).toBe(true);
  });

  it("UT-REV-149 Bidding / Inflation / Hedged % keep their standardness while their value is invalid", () => {
    const f = form({ description: "Standard PPA Germany", isStandardContract: true, std: { ...NOTHING_STANDARD, hedgedVolume: true } });
    const bad = editFieldIfValid(f, validateHedgedVolumePercent("12.55").valid, { hedge: hedge({ percentage: field("12.55") }) }, { hedgedVolume: false });
    expect(bad.std.hedgedVolume).toBe(true);
    expect(bad.isStandardContract).toBe(true);
    expect(bad.hedge.percentage.value).toBe("12.55");
    const good = editFieldIfValid(f, validateHedgedVolumePercent("12.5").valid, { hedge: hedge({ percentage: field("12.5") }) }, { hedgedVolume: false });
    expect(good.std.hedgedVolume).toBe(false);
    expect(good.isStandardContract).toBe(false);
  });

  it("UT-REV-150 the start year re-looks the country value up on every change; an invalid year keeps its standardness", () => {
    const profiles = [{ countryCode: "DE", year: 2030, inflation: 2.04, area: null }];
    const f = form({ useInflation: true, useCountryInflationProfile: true, inflationStartYear: "2030", inflationProfile: "2.04",
      isStandardContract: true, std: { ...NOTHING_STANDARD, inflationStartYear: true, inflationValue: true } });
    const partial = changeInflationStartYear(f, "203", profiles, "DE", null);
    expect(partial.inflationProfile).toBe("0.00");
    expect(partial.std.inflationStartYear).toBe(true);
    expect(partial.std.inflationValue).toBe(false);
    expect(partial.isStandardContract).toBe(true);
    const full = changeInflationStartYear(f, "2030", profiles, "DE", null);
    expect(full.inflationProfile).toBe("2.04");
    expect(full.std.inflationStartYear).toBe(false);
    expect(full.isStandardContract).toBe(false);
  });

  it("UT-REV-151 the edit form uses the canvas Value formats", () => {
    const f = editContractForm({ contract: stored(), project: project(), volumes: [] });
    expect(f.correctionFactor).toBe("1.000"); // blank → "1.000"
    expect(f.correctionFactorP90).toBe("0.850");
    expect(f.biddingPrice).toBe("62.35");
    expect(f.tariff).toBe("62.35"); // German FiT: Bidding × CF, not the stored 99
    expect(f.siteQuality).toBe(""); // Text(0, "#")
    expect(f.siteQualityP90).toBe("1.5");
    expect(f.hedge.percentage.value).toBe("12.26"); // "#0.0#"
    expect(f.inflationProfile).toBe("2.10");
    expect(f.inflationStartYear).toBe("0");
    const ppa = editContractForm({ contract: stored({ label: CHOICE_FINANCE.revenueLabel.ppa, hedgedVolume: 50 }), project: project(), volumes: [] });
    expect(ppa.tariff).toBe("99.00");
    expect(ppa.hedge.percentage.value).toBe("50");
  });

  it("UT-REV-152 switching an edited contract's country toggle off brings the stored profile back", () => {
    const f = editContractForm({ contract: stored({ useInflationProfile: true }), project: project(), volumes: [] });
    const profiles = [{ countryCode: "DE", year: 0, inflation: 1.5, area: null }];
    const on = toggleCountryInflation(f, true, profiles, "DE");
    expect(on.inflationProfile).toBe("1.50");
    expect(toggleCountryInflation(on, false, profiles, "DE").inflationProfile).toBe("2.10");
    expect(toggleCountryInflation({ ...on, mode: "New" }, false, profiles, "DE").inflationProfile).toBe("");
  });

  it("UT-REV-153 the negative-price toggle is editable on a new contract until a Type is chosen", () => {
    const disabled = { displayMode: "disabled" as const };
    expect(negativePriceDisplayMode({ mode: "New", revenueTypeLabel: null }, disabled)).toBe("edit");
    expect(negativePriceDisplayMode({ mode: "New", revenueTypeLabel: "PPA" }, disabled)).toBe("disabled");
    expect(negativePriceDisplayMode({ mode: "Edit", revenueTypeLabel: "FiT" }, { displayMode: "edit" })).toBe("edit");
  });

  it("UT-REV-154 the Country Inflation Profile toggle is seen only with the inflation toggle on", () => {
    expect(showsCountryInflationToggle({ useInflation: false })).toBe(false);
    expect(showsCountryInflationToggle({ useInflation: true })).toBe(true);
  });

  it("UT-REV-155 the 100 % check reads the hedged volume with the locale's Value()", () => {
    expect(hedgePercentForCheck("12,5", "de-DE")).toBe(12.5);
    expect(hedgePercentForCheck("12.5")).toBe(12.5);
    expect(hedgePercentForCheck("")).toBe(0);
  });
});
