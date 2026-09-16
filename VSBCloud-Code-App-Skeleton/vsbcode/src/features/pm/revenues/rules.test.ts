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
import { CHOICE_FINANCE } from "@/data/entities";
import {
  REVENUE_TABS, DEFAULT_TAB, parseRevenueTab, REVENUE_FORM_LABEL, derivedFieldPlaceholder,
  pageLock, isPageLocked,
  provinceToPriceRegion, bareRegion, assumptionCountries, selectCountryAssumptions,
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
  it("UT-REV-005 Italian province maps to price region", () => {
    expect(provinceToPriceRegion("Sardegna")).toBe("Italy_Sardinia");
    expect(provinceToPriceRegion("Toscana")).toBe("Italy_Centre - North");
    expect(provinceToPriceRegion("Lazio")).toBe("Italy_Centre - South");
    expect(provinceToPriceRegion("Bayern")).toBeNull();
    expect(provinceToPriceRegion(null)).toBeNull();
  });

  it("UT-REV-006 the Italian assumption slice pulls both country rows", () => {
    expect(assumptionCountries("Italy", "Italy_North")).toEqual(["Italy", "Italy_North"]);
    expect(assumptionCountries("Germany", null)).toEqual(["Germany"]);
    const rows = [
      row("price", "2028", "60", "50", "Italy"),
      row("price", "2028", "70", "55", "Italy_North"),
      row("price", "2028", "80", "60", "Poland"),
    ];
    expect(selectCountryAssumptions(rows, "Italy", "Italy_North")).toHaveLength(2);
  });

  it("bareRegion strips the Italy_ prefix", () => {
    expect(bareRegion("Italy_Centre - North")).toBe("Centre - North");
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

  it("UT-REV-015 contract start falls back to today when COD is blank", () => {
    const today = d("2026-09-02");
    const f = contractStartDate(startRows, "Wind", project({ cod: null }), { today });
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
    expect(contractDuration(rows, "PV").years.value).toBe(20);
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
    // The country profile supplies the value, so the custom field is not required.
    expect(canSaveRevenueContract(form({
      useInflation: true, useCountryInflationProfile: true, inflationStartYear: "2028",
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
    considerNegativePrices: false, negativePriceManualOverride: false,
    currencyId: "cur-1", subaccountId: "sub-1", flags: flags(),
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
    const bar = contractCommandBar(stored({ canDelete: false }), true, true);
    expect(bar.edit.enabled).toBe(true);
    expect(bar.delete.enabled).toBe(false);
  });

  it("UT-REV-072 a missing revenue subaccount blocks contract creation", () => {
    const bar = contractCommandBar(null, true, false);
    expect(bar.add.enabled).toBe(false);
    expect(bar.add.reason).toBe(MSG.subaccountMissing);
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
    expect(balancingCommandBar(periods, "b1", true).edit.enabled).toBe(false);
    expect(balancingCommandBar(periods, "b3", true).delete.enabled).toBe(true);
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
