/**
 * Project Revenues Screen — every business rule as a pure function.
 *
 * Canvas screen: `Project Revenues Screen` (PM app)
 *   289 controls · 11 769 lines of Power Fx · 122 substantive blocks · band XL
 *
 * Two tabs over one project: `Project Revenues` contracts (FiT / PPA / CfD, EEG in
 * Germany) and a chronological chain of `Balancing Prices` periods. The centre of the
 * screen is `drp_…_NewEditCost_BodyContent_Label_1.OnChange`, a 1 634-line handler that
 * derives a *standard assumption* for every field of a revenue contract from the
 * Fabric-linked `Assumptions Revenues SQL`, filtered by country (Italy first mapping its
 * province to a price region), read per technology out of the `wind` / `pv` string
 * columns. Each derivation below is one pure function over already-fetched rows.
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  - The `With({varLang: Lower(First(Split(Language(),"-")).Value)}, Switch(varLang, "en",
 *    Value(x), Value(Substitute(x, ".", ","))))` wrapper that appears ~40 times. It is
 *    ONE function here, `assumptionNumber`, taking `lang` explicitly so it is testable.
 *    Long term it disappears entirely: it exists only because the SQL columns are
 *    strings and the canvas has no server-side parse (spec implementation step 2).
 *  - The ~20 near-identical `UpdateContext({locRevenueX: {…, IsStandardAssumption:
 *    false}})` handlers. `overrideField` does it once.
 *  - The four copies of the end-date recomputation (`OnChange` of the start date, the
 *    duration years and the duration months, plus the assumption engine itself);
 *    `contractEndDate` + `endDateWithGuard`.
 *  - `colRevenueContractHedgedVolumeValidationMonths` and
 *    `…MonthsResults`, two collections rebuilt on every save so a `Sum(Filter(...))`
 *    could be evaluated once per month client-side. `validateHedgedVolume` takes the
 *    overlapping contracts (one server query) and returns the failing range directly.
 *  - `Select(btn_IndividualHedgeVolumeDuration_Recalculate)` used as a subroutine;
 *    `generateVolumeRows`.
 *  - The `Tarrif Price Standard Assumptions` table. It appears ONLY inside `/* … *\/`
 *    blocks in the canvas (source ambiguity 6) — the live formulas read prices from
 *    `Assumptions Revenues SQL`. Not carried over.
 *
 * SOURCE DEFECTS — each is commented at its rule, canvas behaviour kept reachable:
 *  1. ambiguity 1 — the price-curve clamp/nearest fallback compares PRICES to YEARS.
 *     `priceForYear` implements the intended nearest-*year* selection;
 *     `priceForYearCanvasParity` reproduces the shipped comparison verbatim.
 *  2. ambiguity 4 — Shift of COD bounds disagree between message (exclusive 0…24) and
 *     visibility (inclusive). `validateShiftOfCod` ports the visibility rule;
 *     `shiftOfCodMessageRuleCanvasParity` reproduces the message rule.
 *  3. ambiguity 5 — `locRevenueContractStartDate.IsStandardAssumption` is written as
 *     `/*recStandardAssumptionExists*\/true`. `contractStartDate` takes an explicit
 *     `hardCodedStandardFlag` switch, defaulting to the canvas `true`.
 *  4. ambiguity 7 — currency is hard-coded EUR in the assumption engine but the control
 *     default is PLN for Poland. Both are exposed; `revenueCurrencyCode` is the one the
 *     screen uses, and it resolves the conflict in favour of the control default.
 *
 * No flow is called from this screen. `brief.py` reports `FLOWS: none` and no `.Run(`
 * occurs in `Project Revenues Screen.pa.yaml`.
 */
import {
  parseNumber, isNumeric, isInteger, inRange, isDecimalWithPlaces, isValidCurrency,
  isBlank, langRoot, decimalSeparator, pfxRound, type Lang,
} from "@/domain/numeric";
import { addDays, addMonths, addYears } from "@/domain/dates";
import { CHOICE_FINANCE } from "@/data/entities";

/* ═════════════════════════════════════════════════════════════════════ types ════ */

/** `Switch(recTechnologyType, Technology.Wind, …, Technology.PV, …, Blank())`. */
export type Technology = "Wind" | "PV" | "Other";

/** One row of `Assumptions Revenues SQL`. `wind` / `pv` are SQL *strings*. */
export interface AssumptionRow {
  country: string;
  valuetype: string;
  category: string;
  wind: string | null;
  pv: string | null;
}

/**
 * The shape of every `locRevenue*` context variable:
 * `{Value, StandardAssumptionValue, IsStandardAssumption}`.
 */
export interface FieldWithStandard<T> {
  value: T;
  standardValue: T;
  isStandard: boolean;
}

export const field = <T,>(value: T, isStandard = true, standardValue: T = value):
  FieldWithStandard<T> => ({ value, standardValue, isStandard });

/**
 * The user overriding a field: `UpdateContext({locRevenueX: Patch(locRevenueX,
 * {Value: Self.Value, IsStandardAssumption: false})})`, repeated ~20 times.
 */
export const overrideField = <T,>(f: FieldWithStandard<T>, value: T): FieldWithStandard<T> =>
  ({ ...f, value, isStandard: false });

/** The project columns this screen reads off `gblRecordSelectedProject`. */
export interface RevenueProject {
  id: string;
  /** `'Project ID'` — a text column, part of the page-lock test. */
  projectIdText: string | null;
  projectName: string | null;
  countryName: string | null;
  /** `Country.Country` — the country *code* used by `Country Inflation Profiles`. */
  countryCode: string | null;
  technology: Technology;
  /** `'Area/State/Province'.Name` */
  areaName: string | null;
  cod: Date | null;
  fid: Date | null;
  construction: Date | null;
  legallyBindingPermits: Date | null;
  applicationSubmitted: Date | null;
  projectDevelopmentStarted: Date | null;
  feasibilityStudies: Date | null;
  netYieldP50: number | null;
  totalCapacity: number | null;
  endDate: Date | null;
  clusterStateName: string | null;
  owningBusinessUnitId: string | null;
}

export type RevenueTab = "Contracted Revenue" | "Balancing Price";

/** `colTabsValues` — a hard-coded two-item collection. */
export const REVENUE_TABS: readonly RevenueTab[] = ["Contracted Revenue", "Balancing Price"] as const;
/**
 * `Project Revenues Screen.OnVisible` — verbatim (the canvas literal is built in that behaviour
 * formula).
 */
export const DEFAULT_TAB: RevenueTab = "Contracted Revenue";

/**
 * GUIDE q25 — the tab survives a reload as a `?tab=` search param. Anything unrecognised
 * (missing, stale, hand-edited) falls back to the default tab rather than erroring.
 */
export function parseRevenueTab(raw: string | null | undefined): RevenueTab {
  return raw === "Balancing Price" ? "Balancing Price" : DEFAULT_TAB;
}

export type HedgeType = "percentage" | "fixed" | "individual";

/** `Choices('Hedging Type')` — 1 / 2 / 3, NOT the 952850000 band. */
export const HEDGE_TYPE_VALUE: Record<HedgeType, number> = {
  percentage: CHOICE_FINANCE.hedgingType.hedgedVolumePercent,
  fixed: CHOICE_FINANCE.hedgingType.fixedVolumePerYear,
  individual: CHOICE_FINANCE.hedgingType.individualVolumes,
};

export const HEDGE_TYPE_LABEL: Record<HedgeType, string> = {
  /** `lbl_ProjectRevenues_RightPanel_NewEditCost_BodyContent_HedgedVolume_1.Text` — verbatim. */
  percentage: "Hedged Volume [%]",
  /** `lbl_ProjectRevenues_RightPanel_NewEditCost_BodyContent_HedgedVolume_2.Text` — verbatim. */
  fixed: "Fixed Volume p.a. [MWh]",
  /**
   * @labels-not-in-corpus — the `'Hedging Type'`.`'Individual Volumes'` option-set label, owned
   * by Dataverse; the canvas renders the choice, it does not spell it out
   */
  individual: "Individual Volumes",
};

/**
 * GUIDE q25 — every verbatim label and placeholder in the "Add Revenue Contract" panel
 * that is not already covered by `HEDGE_TYPE_LABEL` or a validation message. Centralised
 * here so `Screen.tsx` never hand-types a string the recording shows.
 */
export const REVENUE_FORM_LABEL = {
  /**
   * `lbl_ProjectRevenues_DisplayProjectBodyRightContent_GridContracts_CardBody_Fields_Currency_1.Text`
   * — verbatim.
   */
  currency: "Currency",
  /**
   * `lbl_ProjectRevenues_DisplayProjectBodyRightContent_GridContracts_CardBody_Fields_ContractStartDate_1.Text`
   * — verbatim.
   */
  contractStartDate: "Contract Start Date",
  /** `lbl_ProjectBalancingPrice_Contract_Duration.Text` — verbatim. */
  contractDuration: "Contract Duration",
  /**
   * `lbl_ProjectRevenues_DisplayProjectBodyRightContent_GridContracts_CardBody_Fields_ContractEndDate_1.Text`
   * — verbatim.
   */
  contractEndDate: "Contract End Date",
  tariffPrice: (currencyCode: string | null): string => `Tariff / Price [${currencyCode ?? ""}/MWh]`,
  /**
   * `tgl_ProjectRevenues_RightPanel_NewEditCost_BodyContent_InflationProfile_1.Label` —
   * verbatim.
   */
  inflationProfile: "Inflation Profile",
  /**
   * `lbl_ProjectRevenues_RightPanel_NewEditCost_BodyContent_InflationProfile_1.Text` —
   * verbatim.
   */
  countryInflationProfile: "Country Inflation Profile",
  /**
   * `lbl_ProjectRevenues_DisplayProjectBodyRightContent_GridContracts_CardBody_Fields_InflationStartYear_1.Text`
   * — verbatim.
   */
  inflationStartYear: "Inflation Start Year",
  /**
   * `txt_ProjectRevenues_RightPanel_NewEditCost_BodyContent_InflationStartYear_1.Placeholder` —
   * verbatim.
   */
  inflationStartYearPlaceholder: "YYYY",
  /**
   * `tgl_ProjectRevenues_RightPanel_NewEditCost_BodyContent_Consider_Negative_prices.Label` —
   * verbatim.
   */
  considerNegativePrices: "Consider Negative Prices",
  /**
   * SPELLING CORRECTED — canvas
   * `lbl_ProjectRevenues_RightPanel_NewEditCost_BodyContent_HedgeType.Text` reads "Provide
   * Hedge Volume in " (one trailing space, it sat next to a dropdown). Trimmed here; the
   * wording is verbatim.
   */
  provideHedgeVolumeIn: "Provide Hedge Volume in",
} as const;

/**
 * GUIDE q25 — Currency and the read-only "Country Inflation Profile" field render their
 * system-derived default (`Euro`, the project's country) in placeholder-grey rather than
 * as typed black text — they are never user-entered on this panel. `Screen.tsx` renders
 * them as a disabled `Input` with `value=""` and this text as the `placeholder`, which is
 * the same convention `general-data` already uses for a field configured elsewhere.
 */
export const derivedFieldPlaceholder = (value: string | null): string => value ?? "";

/* ═════════════════════════════════════════════════════════════════ page lock ════ */

export const PAGE_LOCK_TITLE =
  "This page is locked. To unlock it, please complete the following sections:";

/**
 * Validation — `con_Milestones_Page_LockMessage_7.Visible`. Five prerequisites:
 * `IsBlank('Project ID')`, `IsBlank('End Date')`, `'Total Capacity' = 0 or blank`,
 * `'Net Yield p50' = 0 or blank`, `IsBlank('Cluster State'.Name) or = "Draft"`.
 *
 * The Finance screen carries the identical formula (`con_Milestones_Page_LockMessage_8`)
 * and imports this function rather than repeating it.
 */
export function pageLock(project: RevenueProject | null): string[] {
  if (!project) return [];
  const bullets: string[] = [];
  if (isBlank(project.projectIdText)) bullets.push("• General");
  if (!project.endDate) bullets.push("• Milestones");
  if (!project.totalCapacity) bullets.push("• Generator");
  if (!project.netYieldP50) bullets.push("• Production");
  if (isBlank(project.clusterStateName) || project.clusterStateName === "Draft") {
    bullets.push("• Cluster State");
  }
  return bullets;
}

export const isPageLocked = (p: RevenueProject | null): boolean =>
  p === null || pageLock(p).length > 0;

/* ══════════════════════════════════════════════════════════ italy price region ══ */

/**
 * Rule 2 — `locAreaWithRegion`, a 20-branch `Switch` over
 * `gblRecordSelectedProject.'Area/State/Province'.Name` (`OnVisible`).
 * Anything not listed is `Blank()`.
 */
/**
 * @labels-not-in-corpus — Italian price-zone DATA values; the canvas builds the same mapping in
 * `Project Revenues Screen.OnVisible` and sends it to Dataverse, it never draws it
 */
export const ITALY_PRICE_REGION: Readonly<Record<string, string>> = Object.freeze({
  Lazio: "Italy_Centre - South",
  Abruzzo: "Italy_Centre - South",
  Campania: "Italy_Centre - South",
  Umbria: "Italy_Centre - South",
  Marche: "Italy_Centre - North",
  Toscana: "Italy_Centre - North",
  Lombardia: "Italy_North",
  "Emilia Romagna": "Italy_North",
  "Valle d'Aosta": "Italy_North",
  Veneto: "Italy_North",
  "Friuli Venezia Giulia": "Italy_North",
  Piemonte: "Italy_North",
  "Trentino Alto Adige": "Italy_North",
  Liguria: "Italy_North",
  Puglia: "Italy_South",
  Molise: "Italy_South",
  Basilicata: "Italy_South",
  Sicilia: "Italy_Sicily",
  Calabria: "Italy_Calabria",
  Sardegna: "Italy_Sardinia",
});

export function provinceToPriceRegion(name: string | null | undefined): string | null {
  if (!name) return null;
  return ITALY_PRICE_REGION[name] ?? null;
}

/** `Substitute(locAreaWithRegion, "Italy_", "")` — the bare region name. */
export const bareRegion = (region: string | null): string =>
  (region ?? "").replace("Italy_", "");

/**
 * Rule 3 — the country slice. Italy takes two countries; everyone else takes one.
 * The `Filter(...)` becomes an OData `$filter` in `hooks.ts`; this is the same
 * predicate expressed over already-fetched rows so it can be unit-tested.
 */
export function assumptionCountries(countryName: string | null, region: string | null): string[] {
  if (countryName === "Italy" && region) return ["Italy", region];
  return countryName ? [countryName] : [];
}

export function selectCountryAssumptions(
  rows: readonly AssumptionRow[],
  countryName: string | null,
  region: string | null,
): AssumptionRow[] {
  const wanted = assumptionCountries(countryName, region);
  return rows.filter((r) => wanted.includes(r.country));
}

/* ════════════════════════════════════════════════════════ assumption plumbing ══ */

/** `Switch(recTechnologyType, Technology.Wind, wind, Technology.PV, pv, Blank())`. */
export function techColumn(row: AssumptionRow | undefined, tech: Technology): string | null {
  if (!row) return null;
  if (tech === "Wind") return row.wind;
  if (tech === "PV") return row.pv;
  return null;
}

/**
 * Rule 12 — locale-sensitive number parsing.
 *
 * `With({varLang: Lower(First(Split(Language(),"-")).Value)},
 *   Switch(varLang, "en", Value(x), Value(Substitute(x, ".", ","))))`
 *
 * The SQL columns are invariant strings with a `.` decimal point. On a non-English client
 * `Value()` would read `.` as a thousands separator, so the canvas re-points the
 * separator first. Reproduced exactly rather than "fixed", because the fix belongs
 * server-side (parse to `number` in the repository) not here.
 */
export function assumptionNumber(raw: string | null | undefined, language: Lang = "en-US"): number {
  if (raw === null || raw === undefined || raw === "") return NaN;
  if (langRoot(language) === "en") return parseNumber(raw, language);
  return parseNumber(String(raw).replace(/\./g, ","), language);
}

/** `LookUp(locCountryRelatedAssumptions, valuetype = v && category = c)`. */
export function lookupAssumption(
  rows: readonly AssumptionRow[], valuetype: string, category?: string,
): AssumptionRow | undefined {
  return rows.find(
    (r) => r.valuetype === valuetype && (category === undefined || r.category === category),
  );
}

export function assumptionText(
  rows: readonly AssumptionRow[], valuetype: string, category: string | undefined, tech: Technology,
): string | null {
  return techColumn(lookupAssumption(rows, valuetype, category), tech);
}

export function assumptionValue(
  rows: readonly AssumptionRow[], valuetype: string, category: string | undefined,
  tech: Technology, language: Lang = "en-US",
): number {
  return assumptionNumber(assumptionText(rows, valuetype, category, tech), language);
}

/* ═══════════════════════════════════════════════════ standard assumption gate ══ */

/**
 * Rule 4 — "does a standard assumption exist for this revenue type?"
 *
 * `recStandardAssumptionExistsRecord = LookUp('Assumptions Revenues SQL',
 *   And(country = …, valuetype = "revenuetype"))`, then the tech column is compared with
 * `Lower(Text(<Label dropdown>.Selected.Value))`. Every other derivation keys off this.
 */
export function standardAssumptionExists(
  rows: readonly AssumptionRow[], tech: Technology, revenueTypeLabel: string | null,
): boolean {
  if (!revenueTypeLabel) return false;
  const col = assumptionText(rows, "revenuetype", undefined, tech);
  if (col === null) return false;
  return col === revenueTypeLabel.toLowerCase();
}

/* ═══════════════════════════════════════════════════════════ regime change ═════ */

export type ReferenceDateKey =
  | "feasibilitystudies" | "projectdevelopmentstarted" | "applicationsubmitted"
  | "legallybindingpermits" | "construction" | "finalinvestmentdecision"
  | "operationstartdatecod";

export interface SubContractChange {
  /** `issubcontract_type_depending_on_reference_date` */
  dependsOnReferenceDate: boolean;
  /** `subcontract_type_after_decision_year` → `"FiT "` / `"CfD "` / `"PPA "` */
  typeAfterDecisionYear: string | null;
  /** `subcontract_type_decision_year_up` → `Date(y, 1, 1)` */
  decisionYearUpDate: Date | null;
  /** `subcontract_type_reference_date` */
  referenceDateKey: ReferenceDateKey | null;
  /** the project milestone the reference key resolves to */
  actualDate: Date | null;
  /** `DateDiff(actual, decisionYearUp, Days) < 0` — the sub-contract type wins */
  applies: boolean;
}

/** `Switch(recSubContractTypeReferenceDate, "feasibilitystudies", '1-Feasibility studies', …)`. */
export function referenceDateFor(project: RevenueProject, key: ReferenceDateKey | null): Date | null {
  switch (key) {
    case "feasibilitystudies": return project.feasibilityStudies;
    case "projectdevelopmentstarted": return project.projectDevelopmentStarted;
    case "applicationsubmitted": return project.applicationSubmitted;
    case "legallybindingpermits": return project.legallyBindingPermits;
    case "construction": return project.construction;
    case "finalinvestmentdecision": return project.fid;
    case "operationstartdatecod": return project.cod;
    default: return null;
  }
}

/**
 * Rule 5 — contract type can flip based on a milestone reference date.
 * `valuetype = "change_revenuetype"`; the sub-contract type is used for the description
 * when `DateDiff(actualDate, decisionYearUpDate, TimeUnit.Days) < 0` — i.e. the milestone
 * is LATER than 1 January of the decision year.
 */
export function subContractTypeChange(
  rows: readonly AssumptionRow[], tech: Technology, project: RevenueProject,
): SubContractChange {
  const depends =
    (assumptionText(rows, "change_revenuetype", "issubcontract_type_depending_on_reference_date", tech) ?? "")
      .toLowerCase() === "true";
  const after = (assumptionText(rows, "change_revenuetype", "subcontract_type_after_decision_year", tech) ?? "")
    .toLowerCase();
  const typeAfter = after === "fit" ? "FiT " : after === "cfd" ? "CfD " : after === "ppa" ? "PPA " : null;
  const yearRaw = assumptionText(rows, "change_revenuetype", "subcontract_type_decision_year_up", tech);
  const year = yearRaw === null ? NaN : Number(yearRaw);
  const decisionYearUpDate = Number.isFinite(year) && year > 0 ? new Date(year, 0, 1) : null;
  const key = (assumptionText(rows, "change_revenuetype", "subcontract_type_reference_date", tech) ??
    null) as ReferenceDateKey | null;
  const actualDate = depends ? referenceDateFor(project, key) : null;

  // `DateDiff(actual, decisionYearUp, Days) < 0` is blank-propagating in Power Fx; a
  // blank on either side makes the comparison false, so the selected type wins.
  const applies =
    depends && actualDate !== null && decisionYearUpDate !== null &&
    Math.round((decisionYearUpDate.getTime() - actualDate.getTime()) / 86_400_000) < 0;

  return {
    dependsOnReferenceDate: depends,
    typeAfterDecisionYear: typeAfter,
    decisionYearUpDate,
    referenceDateKey: key,
    actualDate,
    applies,
  };
}

/* ═══════════════════════════════════════════════════════════════ description ═══ */

/**
 * Rule 6 — the generated description.
 *
 * Non-Italy: `If(allStandard && exists, "Standard ")` &
 *   `Switch(true, Germany && FiT, "EEG ", France && FiT, "CfD ", Text(type) & " ")` &
 *   country.
 * Italy:     `If(allStandard && exists, "Standard ")` &
 *   `Text(type) & " Italy - " & Substitute(region, "Italy_", "")`.
 *
 * The type token is replaced by the sub-contract type when the regime change of rule 5
 * applies. NOTE the canvas's own double space in that case: the sub-contract token
 * carries a trailing space and the Italy branch adds `" Italy - "` on top of it. That is
 * user-visible and is reproduced, not silently trimmed.
 */
export function revenueTypePrefix(country: string | null, revenueTypeLabel: string | null): string {
  if (country === "Germany" && revenueTypeLabel === "FiT") return "EEG ";
  if (country === "France" && revenueTypeLabel === "FiT") return "CfD ";
  return `${revenueTypeLabel ?? ""} `;
}

export interface DescriptionInput {
  country: string | null;
  region: string | null;
  revenueTypeLabel: string | null;
  standardAssumptionExists: boolean;
  /** `recAllValuesStandardAssumption` — every derived field is still standard. */
  allValuesStandard: boolean;
  change?: SubContractChange;
}

export function descriptionFor(input: DescriptionInput): string {
  const { country, region, revenueTypeLabel, standardAssumptionExists: exists, allValuesStandard } = input;
  const change = input.change;
  const prefix = allValuesStandard && exists ? "Standard " : "";

  if (country === "Italy" && region) {
    const token = !change?.dependsOnReferenceDate
      ? (revenueTypeLabel ?? "")
      : change.applies
        ? (change.typeAfterDecisionYear ?? revenueTypeLabel ?? "")
        : (revenueTypeLabel ?? "");
    return `${prefix}${token} Italy - ${bareRegion(region)}`;
  }

  const typeToken = revenueTypePrefix(country, revenueTypeLabel);
  const body = revenueTypeLabel && exists
    ? (!change?.dependsOnReferenceDate
      ? typeToken
      : change.applies
        ? (change.typeAfterDecisionYear ?? typeToken)
        : typeToken)
    : typeToken;
  const tail = revenueTypeLabel ? (country ?? "") : "";
  return `${prefix}${body}${tail}`;
}

/**
 * Rule 11 (test UT-REV-011) — the "Standard " prefix is dropped the moment any field is
 * overridden, because `recAllValuesStandardAssumption` goes false.
 */
export const dropStandardPrefix = (description: string): string =>
  description.startsWith("Standard ") ? description.slice("Standard ".length) : description;

/* ══════════════════════════════════════════════════════════════════ currency ════ */

/**
 * SOURCE DEFECT (ambiguity 7) — the canvas has two disagreeing currency rules.
 *
 * `locRevenueCurrency` resolves to `LookUp(Currencies, 'Currency Code' = "EUR")` on EVERY
 * branch: the Poland and Romania branches are commented out. Meanwhile
 * `drp_…_Currency_1.DefaultSelectedItems` is
 * `If(Country.Name = "Poland", LookUp(Currencies,'Currency Code'="PLN"), … "EUR")`.
 * Which wins depends on control initialisation order, which cannot be determined
 * statically.
 *
 * WHAT WE DO: the control default wins. Poland gets PLN. The Poland-only tariff cap of
 * 750 (against 150 elsewhere) and the −25…+50 balancing-price range only make sense in
 * PLN, so a EUR-labelled Polish contract would be wrong by two orders of magnitude.
 * `assumptionEngineCurrencyCode` keeps the canvas engine value reachable.
 */
export const revenueCurrencyCode = (countryName: string | null): "EUR" | "PLN" =>
  countryName === "Poland" ? "PLN" : "EUR";

/** Canvas parity: `locRevenueCurrency` is EUR on every branch. */
export const assumptionEngineCurrencyCode = (): "EUR" => "EUR";

/* ═════════════════════════════════════════════════════════ dates and duration ══ */

/**
 * Rule 8 — contract start date defaults to COD.
 *
 * `valuetype = "contractstart"`; when the tech column is `"operationstartdatecod"` the
 * value is `'Operations start date (COD)'`, falling back to `Today()` when COD is blank.
 *
 * SOURCE DEFECT (ambiguity 5): `IsStandardAssumption` is written as
 * `/*recStandardAssumptionExists*\/true` — the real test is commented out, so a start
 * date is reported standard even for a revenue type that has no standard assumption, and
 * because the end-date flag is a conjunction that includes it, that flag inflates too.
 * `hardCodedStandardFlag` defaults to the canvas behaviour; pass `false` for the
 * corrected one.
 */
export function contractStartDate(
  rows: readonly AssumptionRow[],
  tech: Technology,
  project: RevenueProject,
  opts: { today?: Date; standardAssumptionExists?: boolean; hardCodedStandardFlag?: boolean } = {},
): FieldWithStandard<Date> {
  const today = opts.today ?? new Date();
  const hardCoded = opts.hardCodedStandardFlag ?? true;
  const ref = assumptionText(rows, "contractstart", undefined, tech);
  // `"operationstartdatecod"` is the only reference the canvas Switch has an arm for;
  // every other value (and a missing row) falls through to `Today()`.
  const value = ref === "operationstartdatecod" ? (project.cod ?? today) : today;
  const isStandard = hardCoded ? true : (opts.standardAssumptionExists ?? false);
  return field(value, isStandard);
}

/**
 * Rule 10 — duration comes from the assumptions:
 * `valuetype = "contractdurationyear"` and `"contractdurationmonth"`.
 */
export function contractDuration(
  rows: readonly AssumptionRow[], tech: Technology,
  opts: { standardAssumptionExists?: boolean; language?: Lang } = {},
): { years: FieldWithStandard<number>; months: FieldWithStandard<number> } {
  const lang = opts.language ?? "en-US";
  const isStandard = opts.standardAssumptionExists ?? false;
  const y = assumptionValue(rows, "contractdurationyear", undefined, tech, lang);
  const m = assumptionValue(rows, "contractdurationmonth", undefined, tech, lang);
  return {
    years: field(Number.isNaN(y) ? 0 : y, isStandard),
    months: field(Number.isNaN(m) ? 0 : m, isStandard),
  };
}

/** `drp_…_ContractDuration_Years_1.Items` — `ForAll(Sequence(36), {Value: Value-1})`. */
export const durationYearOptions = (): number[] => Array.from({ length: 36 }, (_, i) => i);
/** `drp_…_ContractDuration_Months_1.Items` — `Sequence(12)` starting at 0. */
export const durationMonthOptions = (): number[] => Array.from({ length: 12 }, (_, i) => i);

/**
 * Rule 9 — `DateAdd(DateAdd(DateAdd(start, years, Years), months, Months), -1, Days)`.
 */
export function contractEndDate(start: Date, years: number, months: number): Date {
  return addDays(addMonths(addYears(start, years), months), -1);
}

/**
 * The guard the three `OnChange` copies wrap it in:
 * `If(DateDiff(start, calculatedEnd, TimeUnit.Days) > 1, <use it>, <end = start>)`.
 */
export function endDateWithGuard(start: Date, years: number, months: number): Date {
  const end = contractEndDate(start, years, months);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  return days > 1 ? end : new Date(start.getTime());
}

/**
 * The end date is standard only when start, duration-years and duration-months all are.
 * (Inflated by defect 3 above, because the start-date flag is hard-coded `true`.)
 */
export const endDateIsStandard = (
  start: FieldWithStandard<Date>,
  years: FieldWithStandard<number>,
  months: FieldWithStandard<number>,
): boolean => start.isStandard && years.isStandard && months.isStandard;

/* ══════════════════════════════════════════════════════════════ price curve ════ */

/** `Filter(locCountryRelatedAssumptions, valuetype = "price")` — the curve, in table order. */
export const priceRows = (rows: readonly AssumptionRow[]): AssumptionRow[] =>
  rows.filter((r) => r.valuetype === "price");

/**
 * Rule 11 — price-curve lookup with clamp-and-nearest fallback, INTENDED behaviour.
 *
 * The exact-year branch is unambiguous: `LookUp(Filter(…, valuetype = "price" &&
 * category = Text(Year(COD))), true)` and take the tech column. The fallback is not —
 * see `priceForYearCanvasParity` and defect 1 at the top of this file. Here the year
 * lives in `category`, which is what makes the curve a curve: below the first year clamp
 * to the first price, above the last year clamp to the last, otherwise take the row whose
 * `category` year is nearest, breaking ties on the higher price (the canvas's
 * `"pv", SortOrder.Descending` secondary sort).
 */
export function priceForYear(
  rows: readonly AssumptionRow[], tech: Technology, codYear: number, language: Lang = "en-US",
): number | null {
  const prices = priceRows(rows);
  if (prices.length === 0) return null;

  const exact = prices.find((r) => r.category === String(codYear));
  if (exact) {
    const v = assumptionNumber(techColumn(exact, tech), language);
    return Number.isNaN(v) ? null : v;
  }

  const priceOf = (r: AssumptionRow) => assumptionNumber(techColumn(r, tech), language);
  const yearOf = (r: AssumptionRow) => Number(r.category);

  const first = prices[0]!;
  const last = prices[prices.length - 1]!;
  if (codYear < yearOf(first)) {
    const v = priceOf(first);
    return Number.isNaN(v) ? null : v;
  }
  if (codYear > yearOf(last)) {
    const v = priceOf(last);
    return Number.isNaN(v) ? null : v;
  }

  const ranked = [...prices].sort((a, b) => {
    const da = Math.abs(yearOf(a) - codYear);
    const db = Math.abs(yearOf(b) - codYear);
    if (da !== db) return da - db;
    return priceOf(b) - priceOf(a);
  });
  const v = priceOf(ranked[0]!);
  return Number.isNaN(v) ? null : v;
}

/**
 * SOURCE DEFECT (ambiguity 1) — the fallback as the canvas actually ships it.
 *
 * `If(Value(recYear) < Value(First(recFilteredPrices).pv), Value(First(…).pv),
 *     Value(recYear) > Value(Last(recFilteredPrices).pv), Value(Last(…).pv),
 *     First(SortByColumns(AddColumns(recFilteredPrices, Diff,
 *       Abs(Value(ThisRecord.pv) - Value(recYear))), "Diff", Ascending, "pv", Descending)).pv)`
 *
 * `recYear` is `Text(Year(COD))`; `.pv` / `.wind` are PRICES. The comparison and the
 * ranking therefore measure the distance between a year (≈2028) and a price (≈65) —
 * which always selects the most expensive row for any realistic curve. The year column
 * is `category`, which the fallback never reads. Kept reachable and pinned by a
 * regression test; flag to the product owner before switching a live environment.
 */
export function priceForYearCanvasParity(
  rows: readonly AssumptionRow[], tech: Technology, codYear: number, language: Lang = "en-US",
): number | null {
  const prices = priceRows(rows);
  if (prices.length === 0) return null;

  const exact = prices.find((r) => r.category === String(codYear));
  if (exact) {
    const v = assumptionNumber(techColumn(exact, tech), language);
    return Number.isNaN(v) ? null : v;
  }

  const priceOf = (r: AssumptionRow) => assumptionNumber(techColumn(r, tech), language);
  const first = priceOf(prices[0]!);
  const last = priceOf(prices[prices.length - 1]!);
  if (codYear < first) return Number.isNaN(first) ? null : first;
  if (codYear > last) return Number.isNaN(last) ? null : last;

  const ranked = [...prices].sort((a, b) => {
    const da = Math.abs(priceOf(a) - codYear);
    const db = Math.abs(priceOf(b) - codYear);
    if (da !== db) return da - db;
    return priceOf(b) - priceOf(a);
  });
  const v = priceOf(ranked[0]!);
  return Number.isNaN(v) ? null : v;
}

/**
 * Rule 13 — the p90 price only exists for wind. `locRevenuePriceP90` is a
 * `Switch(recTechnologyType, Technology.Wind, …, Blank())` with NO PV branch, so PV
 * projects get blank and the p90 field is not rendered.
 */
export function p90Price(
  rows: readonly AssumptionRow[], tech: Technology, codYear: number, language: Lang = "en-US",
): number | null {
  if (tech !== "Wind") return null;
  return priceForYear(rows, tech, codYear, language);
}

/**
 * Rule 14 — correction factors are seeded `{Value: 1, StandardAssumptionValue: 1,
 * IsStandardAssumption: true}`.
 */
export const correctionFactorDefault = (): FieldWithStandard<number> => field(1, true, 1);

/* ═════════════════════════════════════════════════════════════ german FiT ══════ */

/**
 * Rule 15 — the Bidding Price / Site Quality / Correction Factor block is visible only
 * for German wind FiT: `And(Country.Name = "Germany", Label = 'Revenue Labels'.FiT,
 * Technology <> Technology.PV)`.
 *
 * NOTE the test is `<> PV`, not `= Wind`: a Hybrid project in Germany on a FiT contract
 * shows the block. Reproduced.
 */
export const showsGermanFitBlock = (
  country: string | null, revenueTypeLabel: string | null, tech: Technology,
): boolean => country === "Germany" && revenueTypeLabel === "FiT" && tech !== "PV";

/**
 * Rule 15 — the tariff is a PRODUCT, not a typed value:
 * `Text(Value(BiddingPrice) * Value(CorrectionFactor), "0.00")`.
 * The p90 field uses `CorrectionFactor_p90` in the same product.
 */
export function germanFitTariff(biddingPrice: number, correctionFactor: number): string {
  const v = biddingPrice * correctionFactor;
  if (!Number.isFinite(v)) return "";
  return pfxRound(v, 2).toFixed(2);
}

/** `txt_…_TariffPrice_1.Default` — the product for German FiT, the plain price otherwise. */
export function tariffDisplay(
  showsBlock: boolean, biddingPrice: number, correctionFactor: number, price: number,
): string {
  return showsBlock
    ? germanFitTariff(biddingPrice, correctionFactor)
    : (Number.isFinite(price) ? pfxRound(price, 2).toFixed(2) : "");
}

/**
 * Rule 25 — tariff standardness is a CONJUNCTION when the German block is visible:
 * `And(locRevenuePrice.IsStandardAssumption, locRevenueCorrectionFactorP50.IsStandardAssumption)`.
 * Overriding the correction factor alone marks the tariff non-standard.
 */
export const tariffIsStandard = (
  showsBlock: boolean, price: FieldWithStandard<number>, correction: FieldWithStandard<number>,
): boolean => (showsBlock ? price.isStandard && correction.isStandard : price.isStandard);

export const tariffP90IsStandard = (
  showsBlock: boolean, priceP90: FieldWithStandard<number>, correctionP90: FieldWithStandard<number>,
): boolean => (showsBlock ? priceP90.isStandard && correctionP90.isStandard : priceP90.isStandard);

/* ══════════════════════════════════════════════════════════════════ inflation ══ */

export type InflationStartYearKey =
  | "operationstartdatecod" | "finalinvestmentdecision" | "construction" | "legallybindingpermits";

export interface InflationAssumption {
  /** `category = "useinflation"` */
  useInflation: FieldWithStandard<boolean>;
  /** `category = "usecountryinflation"` */
  useCountryProfile: FieldWithStandard<boolean>;
  /** `category = "inflationprofile"` — multiplied by 100 */
  customValue: FieldWithStandard<number>;
  /** `category = "inflationstartyear"` — mapped from a milestone to its year */
  startYear: FieldWithStandard<number>;
  startYearKey: InflationStartYearKey | null;
}

/** `Switch(<inflationstartyear>, "operationstartdatecod", Year(COD), …)`. */
export function inflationStartYearFrom(
  project: RevenueProject, key: InflationStartYearKey | null,
): number {
  const d =
    key === "operationstartdatecod" ? project.cod
      : key === "finalinvestmentdecision" ? project.fid
        : key === "construction" ? project.construction
          : key === "legallybindingpermits" ? project.legallyBindingPermits
            : null;
  return d ? d.getFullYear() : 0;
}

/**
 * Rule 16 — the four-part inflation model. `valuetype = "inflation"` with four
 * categories: `useinflation`, `usecountryinflation`, `inflationprofile` (×100 — the SQL
 * stores a fraction) and `inflationstartyear` (a milestone name).
 */
export function inflation(
  rows: readonly AssumptionRow[], tech: Technology, project: RevenueProject,
  opts: { standardAssumptionExists?: boolean; language?: Lang } = {},
): InflationAssumption {
  const lang = opts.language ?? "en-US";
  const std = opts.standardAssumptionExists ?? false;
  const use = (assumptionText(rows, "inflation", "useinflation", tech) ?? "").toLowerCase() === "true";
  const useCountry =
    (assumptionText(rows, "inflation", "usecountryinflation", tech) ?? "").toLowerCase() === "true";
  const raw = assumptionValue(rows, "inflation", "inflationprofile", tech, lang);
  const custom = Number.isNaN(raw) ? 0 : pfxRound(raw * 100, 10);
  const key = (assumptionText(rows, "inflation", "inflationstartyear", tech) ??
    null) as InflationStartYearKey | null;
  const startYear = inflationStartYearFrom(project, key);
  return {
    useInflation: field(use, std),
    useCountryProfile: field(useCountry, std),
    customValue: field(custom, std),
    startYear: field(startYear, std),
    startYearKey: key,
  };
}

export interface CountryInflationProfileRow {
  countryCode: string | null;
  year: number | null;
  inflation: number | null;
  /** `Area` — only Italy populates it. */
  area: string | null;
}

/**
 * Rule 17 — turning on the country inflation profile replaces the custom value with a
 * table lookup and marks it non-standard:
 * `Max(LookUp('Country Inflation Profiles', And(Country.Country = …, Year = …)).Inflation, 0)`.
 * For Italy the lookup additionally filters `Area = Substitute(locAreaWithRegion, "Italy_", "")`.
 *
 * NOTE the asymmetry in the source: `txt_…_InflationStartYear_1.OnChange` has the Italy
 * branch, `tgl_…_CountryInflationProfile_1.OnCheck` does not. `includeArea` exposes it.
 */
export function countryInflationValue(
  profiles: readonly CountryInflationProfileRow[],
  countryCode: string | null,
  year: number,
  region: string | null,
  includeArea = true,
): number {
  const area = includeArea && region ? bareRegion(region) : null;
  const hit = profiles.find(
    (p) => p.countryCode === countryCode && p.year === year && (area === null || p.area === area),
  );
  return Math.max(hit?.inflation ?? 0, 0);
}

/** Turning the toggle ON replaces the value AND clears standardness. */
export function applyCountryInflation(
  current: InflationAssumption,
  profiles: readonly CountryInflationProfileRow[],
  countryCode: string | null,
  region: string | null,
  includeArea = true,
): InflationAssumption {
  const value = countryInflationValue(profiles, countryCode, current.startYear.value, region, includeArea);
  return {
    ...current,
    useCountryProfile: { ...current.useCountryProfile, value: true, isStandard: false },
    customValue: { ...current.customValue, value, isStandard: false },
  };
}

/* ═══════════════════════════════════════════════════════════ negative prices ═══ */

export type DisplayMode = "edit" | "disabled";

export interface NegativePriceState {
  displayMode: DisplayMode;
  toggleState: boolean;
  manualOverride: boolean;
}

/**
 * Rule 18 — the negative-price toggle is driven by three assumption rows plus real
 * production data. All three are keyed by `category = "FiT" | "PPA"`:
 *   `consider_negtive_prices_active`  (note the canvas's spelling of "negtive")
 *   `initial_state_toggle`            → `"On"` / anything else
 *   `standard_sync`
 *
 * `DisplayMode = If(And(active = "true", productionExists), Edit, Disabled)` and
 * `ToggleState = If(standardSync, productionExists, initialState)`.
 *
 * `productionExists` is the `Energy Yields` existence test: `Status = Active` AND
 * `'Consider Negative Prices' = Yes`.
 */
export function negativePriceState(
  rows: readonly AssumptionRow[], tech: Technology, revenueTypeLabel: string | null,
  productionExists: boolean,
): NegativePriceState {
  const cat = revenueTypeLabel ?? "";
  const active =
    (assumptionText(rows, "consider_negtive_prices_active", cat, tech) ?? "").toLowerCase() === "true";
  const sync = (assumptionText(rows, "standard_sync", cat, tech) ?? "").toLowerCase() === "true";
  const initial = (assumptionText(rows, "initial_state_toggle", cat, tech) ?? "") === "On";
  return {
    displayMode: active && productionExists ? "edit" : "disabled",
    toggleState: sync ? productionExists : initial,
    manualOverride: false,
  };
}

/**
 * Rule 18 — a manual flip sets `ManualOverride: true`, persisted as
 * `NegativePriceManualOverride`.
 */
export const flipNegativePrice = (s: NegativePriceState, next: boolean): NegativePriceState =>
  ({ ...s, toggleState: next, manualOverride: true });

/* ═══════════════════════════════════════════════════════════════════ hedging ═══ */

/**
 * Rule 20 — the Individual Volumes option is hidden until the contract term is known.
 * `If(And(Not(IsBlank(start)), Not(IsBlank(years)), Not(IsBlank(months))),
 *    Choices('Hedging Type'), Filter(Choices('Hedging Type'), Value <> 'Individual Volumes'))`
 */
export function hedgeTypeOptions(
  start: Date | null, years: number | null, months: number | null,
): HedgeType[] {
  const known = start !== null && years !== null && months !== null;
  return known ? ["percentage", "fixed", "individual"] : ["percentage", "fixed"];
}

export interface HedgeState {
  type: HedgeType;
  percentage: FieldWithStandard<string>;
  fixed: FieldWithStandard<string> & { initialState: boolean };
  individual: IndividualVolumeRow[];
}

/**
 * Rule 19 — `rad_ProjectRevenue_HedgeType.OnChange` clears the collections belonging to
 * the types that were NOT chosen and, for Individual Volumes, regenerates the rows.
 */
export function resetOnHedgeTypeChange(
  state: HedgeState, next: HedgeType, term: { start: Date | null; end: Date | null },
): HedgeState {
  const blankPct = field("", true, state.percentage.standardValue);
  const blankFixed = { ...field("", true, state.fixed.standardValue), initialState: true };
  if (next === "percentage") return { ...state, type: next, fixed: blankFixed, individual: [] };
  if (next === "fixed") return { ...state, type: next, percentage: blankPct, individual: [] };
  return {
    ...state,
    type: next,
    percentage: blankPct,
    fixed: blankFixed,
    individual: term.start && term.end ? generateVolumeRows(term.start, term.end) : [],
  };
}

/* ──────────────────────────────────────────────────────── individual volumes ── */

export interface IndividualVolumeRow {
  year: number;
  startDate: Date;
  endDate: Date;
  /** the typed MWh value; `""` while untouched */
  value: string;
  /** `InitialState: true` — never edited, blocks Save */
  initialState: boolean;
  /** the existing Dataverse row this year maps to, when editing */
  recordId?: string | null;
}

/**
 * Rule 21 — one row per calendar year with partial first and last years.
 * `ForAll(Sequence(EndYear - StartYear + 1, StartYear, 1), {…})`.
 */
export function generateVolumeRows(start: Date, end: Date): IndividualVolumeRow[] {
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  const single = startYear === endYear;
  const n = endYear - startYear + 1;
  if (n <= 0) return [];
  return Array.from({ length: n }, (_, i) => {
    const year = startYear + i;
    const startDate = single ? start : year === startYear ? start : new Date(year, 0, 1);
    const endDate = single ? end : year === startYear ? new Date(year, 11, 31)
      : year === endYear ? end : new Date(year, 11, 31);
    return { year, startDate, endDate, value: "", initialState: true, recordId: null };
  });
}

const dd = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;

/**
 * Rule 21 — `txt_ProjectRevenue_RightPanel_IndividualVolume_Year.Default`: the bare year
 * only when the period is a FULL calendar year, otherwise `dd.mm.yyyy - dd.mm.yyyy`.
 */
export function volumeRowLabel(row: IndividualVolumeRow): string {
  const full =
    row.startDate.getMonth() === 0 && row.startDate.getDate() === 1 &&
    row.endDate.getMonth() === 11 && row.endDate.getDate() === 31 &&
    row.startDate.getFullYear() === row.endDate.getFullYear();
  return full ? String(row.year) : `${dd(row.startDate)} - ${dd(row.endDate)}`;
}

/* ──────────────────────────────────────────── month-by-month hedge validation ── */

export interface OverlappingContract {
  id: string;
  startDate: Date;
  endDate: Date;
  /** `'Hedged Volume'` in percent. */
  hedgedVolume: number;
}

export interface HedgeValidationOk { ok: true }
export interface HedgeValidationFail { ok: false; from: Date; to: Date; message: string }
export type HedgeValidationResult = HedgeValidationOk | HedgeValidationFail;

/**
 * Rule 22 — `colRevenueContractHedgedVolumeValidationMonths`:
 * `ForAll(Sequence(DateDiff(start, end, TimeUnit.Months) + 1) As MonthNumber,
 *   {Id: MonthNumber.Value, Value: DateAdd(start, MonthNumber.Value - 1, TimeUnit.Months)})`
 */
export function validationMonths(start: Date, end: Date): Date[] {
  const diff = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  const n = diff + 1;
  if (n <= 0) return [];
  return Array.from({ length: n }, (_, i) => addMonths(start, i));
}

const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

/**
 * Rule 22 — the per-month sum:
 * `Sum(Filter(varAllContractsInTimeframe, And('Contract Start Date' <= EOMonth(m,0),
 *   'Contract End Date' >= Date(Year(m), Month(m), 1))), 'Hedged Volume')`.
 * The overlap test is on MONTH boundaries, not exact dates.
 */
export function overlappingHedgePercent(
  contracts: readonly OverlappingContract[], month: Date,
): number {
  const eom = endOfMonth(month);
  const som = startOfMonth(month);
  return contracts
    .filter((c) => c.startDate.getTime() <= eom.getTime() && c.endDate.getTime() >= som.getTime())
    .reduce((sum, c) => sum + (Number.isFinite(c.hedgedVolume) ? c.hedgedVolume : 0), 0);
}

/**
 * `btn_ProjectRevenue_AddEdit_SaveFunctionality.OnSelect` — verbatim (the canvas literal is
 * built in that behaviour formula).
 */
export const HEDGE_EXCEEDED_HEADLINE = "Hedged Volume exceeds 100% in total in a specific timeframe.";

/** Rule 23 — the failure message is a date RANGE, not a list of months. */
export function hedgeExceededMessage(from: Date, to: Date): string {
  const mm = (d: Date) => `${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
  return `${HEDGE_EXCEEDED_HEADLINE}\nFrom  ${mm(from)}  to  ${mm(to)}.`;
}

/**
 * Rules 22–23 — the month-by-month cross-contract 100 % check.
 *
 * The canvas fetches `varAllContractsInTimeframe = Filter('Project Revenues', And(
 *   Project.Project = …, 'Contract Start Date' <= <new end>, 'Contract End Date' >= <new start>,
 *   'Project Revenue' <> locSelectedRevenueContract.'Project Revenue'))` — i.e. the contract
 * being edited is excluded — and then evaluates the `Sum(Filter(...))` above ONCE PER
 * MONTH, client-side, inside a `ForAll`. Here the caller passes the already-filtered set
 * (one server query with `$filter` on both date bounds and `ne` on the id) and the sum is
 * a fold. The test is strictly `> 100`, so exactly 100 % passes.
 */
export function validateHedgedVolume(
  newContract: { startDate: Date; endDate: Date; hedgedVolume: number },
  overlapping: readonly OverlappingContract[],
): HedgeValidationResult {
  const months = validationMonths(newContract.startDate, newContract.endDate);
  const failed = months.filter(
    (m) => overlappingHedgePercent(overlapping, m) + newContract.hedgedVolume > 100,
  );
  if (failed.length === 0) return { ok: true };
  const sorted = [...failed].sort((a, b) => a.getTime() - b.getTime());
  const from = sorted[0]!;
  const to = sorted[sorted.length - 1]!;
  return { ok: false, from, to, message: hedgeExceededMessage(from, to) };
}

/** Rule 22 — the server-side replacement for `varAllContractsInTimeframe`. */
export function overlapFilterBounds(
  newStart: Date, newEnd: Date, excludeId: string | null,
): { startBefore: Date; endAfter: Date; excludeId: string | null } {
  return { startBefore: newEnd, endAfter: newStart, excludeId };
}

/* ══════════════════════════════════════════════════════════ balancing prices ═══ */

export interface BalancingPeriod {
  id: string;
  name: string;
  /** the `Periods` option-set value */
  periods: number;
  price: number | null;
  startDate: Date | null;
  endDate: Date | null;
  durationYears: number | null;
  durationMonths: number | null;
  shiftOfCodMonths: number | null;
  createdOn: string;
}

const PERIOD_VALUES = [
  CHOICE_FINANCE.periods.period1, CHOICE_FINANCE.periods.period2, CHOICE_FINANCE.periods.period3,
  CHOICE_FINANCE.periods.period4, CHOICE_FINANCE.periods.period5, CHOICE_FINANCE.periods.period6,
  CHOICE_FINANCE.periods.period7, CHOICE_FINANCE.periods.period8, CHOICE_FINANCE.periods.period9,
  CHOICE_FINANCE.periods.period10,
] as const;

/**
 * Rule 28 — `Periods` is `Period 1` when the collection is empty, the existing value on
 * edit, and otherwise `Switch(CountRows(col), 1, Period 2, … 9, Period 10)`.
 * Above nine existing periods the `Switch` has no arm and yields blank.
 */
export function nextPeriodValue(existingCount: number): number | null {
  if (existingCount <= 0) return PERIOD_VALUES[0];
  return PERIOD_VALUES[existingCount] ?? null;
}

/** Rule 28 — `Name = "Balancing Price " & <n>`. */
export const balancingPeriodName = (index: number): string => `Balancing Price ${index}`;

/** Rule 28 — the first period's start is `DateAdd(COD, <shift>, TimeUnit.Months)`. */
export function firstPeriodStart(cod: Date | null, shiftMonths: number): Date | null {
  if (!cod) return null;
  return addMonths(cod, Number.isFinite(shiftMonths) ? shiftMonths : 0);
}

/**
 * Rule 28 — a later period starts the day after the previous one ends:
 * `DateAdd(Last(Sort(col,'Created On',Ascending)).'End Date Balancing Contract', 1, TimeUnit.Days)`.
 */
export function nextPeriodStart(periods: readonly BalancingPeriod[]): Date | null {
  const last = newestPeriod(periods);
  if (!last?.endDate) return null;
  return addDays(last.endDate, 1);
}

/** `Last(Sort(colProjectBalancingPriceContracts, 'Created On', SortOrder.Ascending))`. */
export function newestPeriod(periods: readonly BalancingPeriod[]): BalancingPeriod | null {
  if (periods.length === 0) return null;
  return [...periods].sort((a, b) => a.createdOn.localeCompare(b.createdOn))[periods.length - 1]!;
}

/** Rule 29 — only the newest period may be edited or deleted. */
export const isNewestPeriod = (periods: readonly BalancingPeriod[], id: string): boolean =>
  newestPeriod(periods)?.id === id;

/** Rule 28 — only the FIRST period may carry a `'Shift of COD Date [Months]'`. */
export const showsShiftOfCod = (existingCount: number): boolean => existingCount === 0;

/**
 * Rule 30 — `Sequence(If(years = 0, 11, 12), If(years = 0, 1, 0))`: with zero years the
 * month list starts at 1, so a zero-length period cannot be created.
 */
export function balancingMonthOptions(years: number): number[] {
  const count = years === 0 ? 11 : 12;
  const from = years === 0 ? 1 : 0;
  return Array.from({ length: count }, (_, i) => from + i);
}

/**
 * Rule 30 — `DateAdd(DateAdd(start, Sum(years*12, months), TimeUnit.Months), -1, TimeUnit.Days)`.
 * NOTE this is months-only arithmetic, unlike the revenue contract's years-then-months.
 */
export function balancingEndDate(start: Date, years: number, months: number): Date {
  return addDays(addMonths(start, years * 12 + months), -1);
}

/** `colYearsForBalancingPriceDuration` — the same 0…35 list as the contract picker. */
export const balancingYearOptions = (): number[] => durationYearOptions();

/* ══════════════════════════════════════════════════════════════ validation ═════ */

export interface ValidationResult { valid: boolean; message: string }
const ok: ValidationResult = { valid: true, message: "" };
const bad = (message: string): ValidationResult => ({ valid: false, message });

export const MSG = {
  /**
   * NEW — no canvas equivalent: no canvas string carries this text; the canvas numeric errors
   * here read "Numeric value with maximum of …"
   */
  numeric: "Numeric value expected",
  /**
   * `lbl_ProjectRevenues_RightPanel_NewEditCost_BodyContent_FixedVolume_ErrorMessage.Text` —
   * verbatim.
   */
  noDecimals: "Number with no decimals",
  /**
   * `lbl_ProjectRevenues_RightPanel_NewEditCost_BodyContent_FixedVolume_ErrorMessage.Text` —
   * verbatim.
   */
  exceedsNetYield: "The Hedged Volume may not exceed the project's Net Yield p50",
  /**
   * `lbl_ProjectRevenues_RightPanel_NewEditCost_BodyContent_InflationStartYear_ErrorMessage_1.Text`
   * — verbatim.
   */
  yearFormat: "Year value must be in format YYYY.",
  /**
   * NEW — no canvas equivalent: the code app refuses the reserved "standard" description on a
   * non-standard contract; the canvas only hid a label
   */
  standardDescription:
    "A contract that is not based on standard assumptions may not be described as standard.",
  /**
   * `lbl_ProjectRevenues_RightPanel_NewEditCost_BodyContent_BiddingPrice_ErrorMessage_3.Text` —
   * verbatim.
   */
  shiftOfCod: "Value must be between 0 and 24.",
  /**
   * INTERPOLATED — canvas `btn_Revenue_AddContract.OnSelect` builds this from "Revenue
   * Subaccount cannot be empty! " + " Write to support team." (its `{Char(10)}` is the `\n`
   * here).
   */
  subaccountMissing: "Revenue Subaccount cannot be empty! \n Write to support team.",
  /** `cmp_PopUp_Confirmation_PopUp_AddEdit_Individual_Volume.Description` — verbatim. */
  individualVolumesConfirm:
    "You are using individual volumes. Please confirm that the volumes for each partial year is in line with the expected production.",
} as const;

const between = (min: number, max: number, lang: Lang) => {
  const sep = decimalSeparator(lang);
  const fmt = (n: number) => String(n).replace(".", sep);
  return `Please select a value between ${fmt(min)} and ${fmt(max)}.`;
};

/**
 * Validation — Tariff / Price: numeric, `>= 0` and
 * `<= If(Country.Name = "Poland", 750, 150)`. The error is suppressed when the input is
 * `DisplayMode.Disabled` (the German wind FiT computed field).
 */
export function validateTariff(
  text: string, country: string | null, disabled = false, lang: Lang = "en-US",
): ValidationResult {
  if (disabled) return ok;
  if (isBlank(text)) return ok;
  const max = country === "Poland" ? 750 : 150;
  if (!isNumeric(text, lang)) return bad(MSG.numeric);
  return inRange(text, 0, max, lang) ? ok : bad(between(0, max, lang));
}

/** Validation — Bidding Price / Site Quality (p50 and p90): `IsValidCurrency` and 0…100. */
export function validateBiddingPrice(text: string, lang: Lang = "en-US"): ValidationResult {
  if (isBlank(text)) return ok;
  if (!isValidCurrency(text, lang)) return bad(MSG.numeric);
  return inRange(text, 0, 100, lang) ? ok : bad(between(0, 100, lang));
}
export const validateSiteQuality = validateBiddingPrice;

/**
 * Validation — Correction Factor (p50 and p90): `IsThreeDecimal` and 0.5…2, message
 * `$"Please select a value between {If(StartsWith(Language(),"en"),"0.5","0,5")} and 2"`.
 */
export function validateCorrectionFactor(text: string, lang: Lang = "en-US"): ValidationResult {
  if (isBlank(text)) return ok;
  const sep = decimalSeparator(lang);
  const msg = `Please select a value between ${sep === "." ? "0.5" : "0,5"} and 2`;
  if (!isDecimalWithPlaces(text, 3, lang)) return bad(msg);
  return inRange(text, 0.5, 2, lang) ? ok : bad(msg);
}

/** Validation — Hedged Volume [%]: `IsOneDecimal` and 0…100. */
export function validateHedgedVolumePercent(text: string, lang: Lang = "en-US"): ValidationResult {
  if (isBlank(text)) return ok;
  if (!isDecimalWithPlaces(text, 1, lang)) return bad(MSG.numeric);
  return inRange(text, 0, 100, lang) ? ok : bad(between(0, 100, lang));
}

/**
 * Validation — Fixed Volume p.a. [MWh] and each Individual Volume:
 * `IsMatch(Trim(text), "^[0-9]+$")` and
 * `<= Coalesce(IfError(Value('Net Yield p50'), Blank()), 0)`.
 * NOTE the `Coalesce(…, 0)` floor: a blank Net Yield p50 caps every volume at zero.
 */
export function validateVolumeMwh(text: string, netYieldP50: number | null): ValidationResult {
  if (isBlank(text)) return ok;
  if (!/^[0-9]+$/.test(text.trim())) return bad(MSG.noDecimals);
  const cap = netYieldP50 ?? 0;
  return Number(text.trim()) <= cap ? ok : bad(MSG.exceedsNetYield);
}

/** Validation — Inflation Profile [%]: `IsTwoDecimal` and 0…100. */
export function validateInflationProfile(text: string, lang: Lang = "en-US"): ValidationResult {
  if (isBlank(text)) return ok;
  if (!isDecimalWithPlaces(text, 2, lang)) return bad(MSG.numeric);
  return inRange(text, 0, 100, lang) ? ok : bad(between(0, 100, lang));
}

/** Validation — Inflation Start Year: `IsMatch(value, "^\\d{4}$")`. */
export function validateInflationStartYear(text: string): ValidationResult {
  if (isBlank(text)) return ok;
  return /^\d{4}$/.test(text) ? ok : bad(MSG.yearFormat);
}

/**
 * Validation — a non-standard contract may not be described as standard.
 * `lbl_…_Description_ErrorMessage_1.Visible` fires when `locStandardAssumtionContract =
 * false` and the text starts with / contains `"standard"` (case-insensitive).
 */
export function validateDescription(text: string, isStandardContract: boolean): ValidationResult {
  if (isStandardContract) return ok;
  return text.toLowerCase().includes("standard") ? bad(MSG.standardDescription) : ok;
}

/**
 * Validation — Balancing Price [EUR/MWh]: locale-aware two-decimal regex plus range
 * `-25…+50` for Poland and `-5…+10` otherwise.
 */
export function validateBalancingPrice(
  text: string, country: string | null, lang: Lang = "en-US",
): ValidationResult {
  if (isBlank(text)) return ok;
  const sep = decimalSeparator(lang);
  const rx = new RegExp(`^[-+]?\\d+(${sep === "." ? "\\." : ","}\\d{1,2})?$`);
  if (!rx.test(text)) return bad(MSG.numeric);
  const [min, max] = country === "Poland" ? [-25, 50] : [-5, 10];
  return inRange(text, min, max, lang) ? ok : bad(between(min, max, lang));
}

/**
 * SOURCE DEFECT (ambiguity 4) — Shift of COD Date [Months].
 *
 * The canvas message label says `"Value must be between 0 and 24."` and its `.Text` fires
 * on `Not(And(v > 0, v < 24))` — EXCLUSIVE. Its `.Visible` fires on `Or(v < 0, v > 24)` —
 * INCLUSIVE. `0` and `24` are therefore accepted by the rule that actually shows the
 * error and rejected by the rule that writes its text.
 *
 * WHAT WE DO: the visibility rule wins (inclusive 0…24) — it is the one that decides
 * whether the user is blocked, and 0 months ("start at COD") is obviously legitimate.
 * `shiftOfCodMessageRuleCanvasParity` keeps the exclusive test reachable.
 */
export function validateShiftOfCod(text: string, lang: Lang = "en-US"): ValidationResult {
  if (isBlank(text)) return ok;
  if (!isInteger(text, lang)) return bad(MSG.numeric);
  const v = parseNumber(text, lang);
  return v < 0 || v > 24 ? bad(MSG.shiftOfCod) : ok;
}

/** Canvas parity: the exclusive test behind the message text. */
export function shiftOfCodMessageRuleCanvasParity(text: string, lang: Lang = "en-US"): boolean {
  if (isBlank(text)) return false;
  if (!isInteger(text, lang)) return true;
  const v = parseNumber(text, lang);
  return !(v > 0 && v < 24);
}

/* ═════════════════════════════════════════════════════════════ save gating ═════ */

export interface RevenueFormState {
  mode: "New" | "Edit";
  formDirty: boolean;
  contractId: string | null;
  subaccountId: string | null;
  revenueTypeLabel: string | null;
  description: string;
  currencyCode: string | null;
  tariff: string;
  tariffP90: string;
  biddingPrice: string;
  siteQuality: string;
  siteQualityP90: string;
  correctionFactor: string;
  correctionFactorP90: string;
  startDate: Date | null;
  endDate: Date | null;
  durationYears: number | null;
  durationMonths: number | null;
  hedge: HedgeState;
  useInflation: boolean;
  useCountryInflationProfile: boolean;
  inflationProfile: string;
  inflationStartYear: string;
  considerNegativePrices: boolean;
  negativePriceManualOverride: boolean;
  /** `locStandardAssumtionContract` — set from `StartsWith(Lower(description), "standard")`. */
  isStandardContract: boolean;
  showsGermanFitBlock: boolean;
  technology: Technology;
  country: string | null;
  netYieldP50: number | null;
}

/**
 * Validation — `pcf_…_Save_1.DisplayMode`, ported term for term.
 *
 * Requires: a subaccount; no visible tariff error; non-blank Label, Description, Currency,
 * Tariff, Start Date, Duration Years, Duration Months, End Date; a hedge-type-specific
 * branch; the German FiT branch; the inflation branch; and finally `formDirty`.
 */
export function canSaveRevenueContract(
  form: RevenueFormState, lang: Lang = "en-US",
): boolean {
  if (!form.formDirty) return false;
  if (isBlank(form.subaccountId)) return false;
  if (isBlank(form.revenueTypeLabel)) return false;
  if (isBlank(form.description)) return false;
  if (isBlank(form.currencyCode)) return false;
  if (isBlank(form.tariff)) return false;
  if (!form.startDate || !form.endDate) return false;
  if (form.durationYears === null || form.durationMonths === null) return false;

  if (!validateDescription(form.description, form.isStandardContract).valid) return false;
  if (!validateTariff(form.tariff, form.country, form.showsGermanFitBlock, lang).valid) return false;

  // Hedge-type-specific branch.
  if (form.hedge.type === "percentage") {
    if (isBlank(form.hedge.percentage.value)) return false;
    if (!validateHedgedVolumePercent(form.hedge.percentage.value, lang).valid) return false;
  } else if (form.hedge.type === "fixed") {
    if (isBlank(form.hedge.fixed.value)) return false;
    if (form.hedge.fixed.initialState) return false;
    if (!validateVolumeMwh(form.hedge.fixed.value, form.netYieldP50).valid) return false;
  } else {
    if (form.hedge.individual.length === 0) return false;
    if (form.hedge.individual.some((r) => isBlank(r.value) || r.initialState)) return false;
    if (form.hedge.individual.some((r) => !validateVolumeMwh(r.value, form.netYieldP50).valid)) {
      return false;
    }
  }

  // German FiT branch: Bidding Price + Correction Factor and, for wind, the p90 trio.
  if (form.showsGermanFitBlock) {
    if (isBlank(form.biddingPrice) || isBlank(form.correctionFactor)) return false;
    if (!validateBiddingPrice(form.biddingPrice, lang).valid) return false;
    if (!validateCorrectionFactor(form.correctionFactor, lang).valid) return false;
    if (form.technology === "Wind") {
      if (isBlank(form.tariffP90) || isBlank(form.correctionFactorP90) || isBlank(form.siteQualityP90)) {
        return false;
      }
      if (!validateCorrectionFactor(form.correctionFactorP90, lang).valid) return false;
      if (!validateSiteQuality(form.siteQualityP90, lang).valid) return false;
    }
    if (!isBlank(form.siteQuality) && !validateSiteQuality(form.siteQuality, lang).valid) return false;
  }

  // Inflation branch.
  if (form.useInflation) {
    if (!validateInflationStartYear(form.inflationStartYear).valid) return false;
    if (isBlank(form.inflationStartYear)) return false;
    if (!form.useCountryInflationProfile) {
      if (isBlank(form.inflationProfile)) return false;
      if (!validateInflationProfile(form.inflationProfile, lang).valid) return false;
    }
  }
  return true;
}

/** Rule 32 — Individual Volumes needs one extra confirmation before the save runs. */
export const needsIndividualVolumesConfirmation = (hedgeType: HedgeType): boolean =>
  hedgeType === "individual";

/* ══════════════════════════════════════════════════════════════ save payload ═══ */

/**
 * The twelve-plus `Is … Standard Assumption?` flags of rule 25.
 *
 * The spec's prose says "Nine" and then lists twelve bullets; the solution metadata has
 * FOURTEEN `vsb_is…standardassumption` columns on `vsb_ProjectRevenue`. All fourteen are
 * modelled — the superset is the only safe reading, and a flag left unwritten would
 * silently render a user's override in the "standard" italic + themePrimary styling of
 * rule 26.
 */
export interface StandardFlags {
  biddingPrice: boolean;
  contractDurationYears: boolean;
  contractDurationMonths: boolean;
  contractStartDate: boolean;
  contractEndDate: boolean;
  tariffPrice: boolean;
  tariffPriceP90: boolean;
  useInflationProfile: boolean;
  useCustomInflation: boolean;
  inflationProfileYear: boolean;
  customInflationProfile: boolean;
  hedgedVolume: boolean;
  correctionFactor: boolean;
  correctionFactorP90: boolean;
}

export const ALL_STANDARD_FLAG_KEYS: readonly (keyof StandardFlags)[] = [
  "biddingPrice", "contractDurationYears", "contractDurationMonths", "contractStartDate",
  "contractEndDate", "tariffPrice", "tariffPriceP90", "useInflationProfile",
  "useCustomInflation", "inflationProfileYear", "customInflationProfile", "hedgedVolume",
  "correctionFactor", "correctionFactorP90",
] as const;

/** `recAllValuesStandardAssumption` — every flag still standard. */
export const allValuesStandard = (flags: StandardFlags): boolean =>
  ALL_STANDARD_FLAG_KEYS.every((k) => flags[k]);

/** Rule 24 — `Name = <Project Name> & "-" & <Label> & "-" & <Description>`. */
export const revenueContractName = (
  projectName: string | null, label: string | null, description: string,
): string => `${projectName ?? ""}-${label ?? ""}-${description}`;

export interface RevenueSavePayload {
  name: string;
  description: string;
  label: number | null;
  currencyCode: string | null;
  subaccountId: string | null;
  tariffPrice: number;
  tariffPriceP90: number;
  biddingPrice: number;
  siteQuality: number;
  siteQualityP90: number;
  correctionFactor: number;
  correctionFactorP90: number;
  contractStartDate: Date | null;
  contractEndDate: Date | null;
  contractDurationYears: number | null;
  contractDurationMonths: number | null;
  hedgeType: number;
  hedgedVolume: number | null;
  fixedContractedMwhPa: number | null;
  useInflationProfile: boolean;
  useCountryInflationProfile: boolean;
  inflationProfile: number;
  inflationStartYear: number;
  considerNegativePrices: boolean;
  negativePriceManualOverride: boolean;
  flags: StandardFlags;
  individualVolumes: IndividualVolumeRow[];
}

const num = (text: string, lang: Lang): number => {
  const v = parseNumber(text, lang);
  return Number.isNaN(v) ? 0 : v;
};

/**
 * Rule 24 — the save payload.
 *
 *  - `'Hedged Volume'` is written only for the percentage type; `FixedContractedmwhpa`
 *    only for the fixed type (`Blank()` otherwise).
 *  - `'Bidding Price'`, `'Site Quality'`, `'Site Quality p90'`, `'Correction Factor'` and
 *    `'Correction Factor p90'` are written as `0` when their container is not visible.
 *  - `'Inflation Start Year'`, `'Use Country Inflation Profile'` and `'Inflation Profile'`
 *    are zeroed / false when the inflation toggle is off.
 */
export function buildRevenuePayload(
  form: RevenueFormState,
  project: RevenueProject,
  flags: StandardFlags,
  lang: Lang = "en-US",
): RevenueSavePayload {
  const visible = form.showsGermanFitBlock;
  const inflOn = form.useInflation;
  const label = form.revenueTypeLabel === "FiT"
    ? CHOICE_FINANCE.revenueLabel.fit
    : form.revenueTypeLabel === "PPA" ? CHOICE_FINANCE.revenueLabel.ppa : null;

  return {
    name: revenueContractName(project.projectName, form.revenueTypeLabel, form.description),
    description: form.description,
    label,
    currencyCode: form.currencyCode,
    subaccountId: form.subaccountId,
    tariffPrice: num(form.tariff, lang),
    tariffPriceP90: num(form.tariffP90, lang),
    biddingPrice: visible ? num(form.biddingPrice, lang) : 0,
    siteQuality: visible ? num(form.siteQuality, lang) : 0,
    siteQualityP90: visible ? num(form.siteQualityP90, lang) : 0,
    correctionFactor: visible ? num(form.correctionFactor, lang) : 0,
    correctionFactorP90: visible ? num(form.correctionFactorP90, lang) : 0,
    contractStartDate: form.startDate,
    contractEndDate: form.endDate,
    contractDurationYears: form.durationYears,
    contractDurationMonths: form.durationMonths,
    hedgeType: HEDGE_TYPE_VALUE[form.hedge.type],
    hedgedVolume: form.hedge.type === "percentage" ? num(form.hedge.percentage.value, lang) : 0,
    fixedContractedMwhPa: form.hedge.type === "fixed" ? num(form.hedge.fixed.value, lang) : null,
    useInflationProfile: inflOn,
    useCountryInflationProfile: inflOn ? form.useCountryInflationProfile : false,
    inflationProfile: inflOn ? num(form.inflationProfile, lang) : 0,
    inflationStartYear: inflOn ? num(form.inflationStartYear, lang) : 0,
    considerNegativePrices: form.considerNegativePrices,
    negativePriceManualOverride: form.negativePriceManualOverride,
    flags,
    individualVolumes: form.hedge.type === "individual" ? form.hedge.individual : [],
  };
}

/* ═════════════════════════════════════════════════════════════════ rehydrate ═══ */

export interface StoredRevenueContract {
  id: string;
  name: string;
  description: string;
  label: number | null;
  tariffPrice: number | null;
  tariffPriceP90: number | null;
  biddingPrice: number | null;
  siteQuality: number | null;
  siteQualityP90: number | null;
  correctionFactor: number | null;
  correctionFactorP90: number | null;
  contractStartDate: Date | null;
  contractEndDate: Date | null;
  contractDurationYears: number | null;
  contractDurationMonths: number | null;
  hedgeType: number | null;
  hedgedVolume: number | null;
  fixedContractedMwhPa: number | null;
  useInflationProfile: boolean;
  useCountryInflationProfile: boolean;
  inflationProfile: number | null;
  inflationStartYear: number | null;
  considerNegativePrices: boolean;
  negativePriceManualOverride: boolean;
  currencyId: string | null;
  subaccountId: string | null;
  flags: StandardFlags;
  canEdit: boolean;
  canDelete: boolean;
  isFolded: boolean;
}

export const hedgeTypeFromValue = (v: number | null): HedgeType =>
  v === CHOICE_FINANCE.hedgingType.fixedVolumePerYear ? "fixed"
    : v === CHOICE_FINANCE.hedgingType.individualVolumes ? "individual"
      : "percentage";

export const revenueLabelText = (v: number | null): string | null =>
  v === CHOICE_FINANCE.revenueLabel.fit ? "FiT"
    : v === CHOICE_FINANCE.revenueLabel.ppa ? "PPA" : null;

/**
 * Rule 27 — editing rehydrates the standard-assumption state from the RECORD, not from
 * SQL. The price comes from `'Bidding Price'` for German wind FiT and from
 * `'Tariff / Price'` otherwise, and `locStandardAssumtionContract` is
 * `StartsWith(Lower(description), "standard")`.
 */
export function rehydrateForEdit(
  contract: StoredRevenueContract, country: string | null, tech: Technology,
): { price: number; isStandardContract: boolean; showsGermanFitBlock: boolean } {
  const label = revenueLabelText(contract.label);
  const shows = showsGermanFitBlock(country, label, tech);
  return {
    price: (shows ? contract.biddingPrice : contract.tariffPrice) ?? 0,
    isStandardContract: contract.description.toLowerCase().startsWith("standard"),
    showsGermanFitBlock: shows,
  };
}

/* ═══════════════════════════════════════════════════════════════ command bar ═══ */

export type RevenueCommandKey = "add" | "edit" | "delete";

export interface CommandState { visible: boolean; enabled: boolean; reason?: string }

/**
 * Validation — `pcf_ProjectRevenues_Content_ContractCommandBar_3.Items`. Edit is gated on
 * `RecordInfo(…, RecordInfo.EditPermission)` and Delete on `RecordInfo.DeletePermission`.
 * Both come off the DTO the repository returns; they are NEVER re-derived from a role.
 */
export function contractCommandBar(
  selected: StoredRevenueContract | null, canEdit: boolean, hasSubaccount: boolean,
): Record<RevenueCommandKey, CommandState> {
  return {
    add: {
      visible: true,
      enabled: canEdit && hasSubaccount,
      reason: !hasSubaccount ? MSG.subaccountMissing : undefined,
    },
    edit: { visible: true, enabled: Boolean(selected?.canEdit) && canEdit },
    delete: { visible: true, enabled: Boolean(selected?.canDelete) && canEdit },
  };
}

/** Rule 29 — the balancing-price command bar: only the newest period is actionable. */
export function balancingCommandBar(
  periods: readonly BalancingPeriod[], selectedId: string | null, canEdit: boolean,
): Record<RevenueCommandKey, CommandState> {
  const newest = selectedId !== null && isNewestPeriod(periods, selectedId);
  return {
    add: { visible: true, enabled: canEdit },
    edit: {
      visible: true,
      enabled: canEdit && newest,
      reason: !newest ? "Only the most recent period can be edited." : undefined,
    },
    delete: {
      visible: true,
      enabled: canEdit && newest,
      reason: !newest ? "Only the most recent period can be deleted." : undefined,
    },
  };
}

/* ══════════════════════════════════════════════════════════════════ display ════ */

/**
 * Rule 26 — standardness drives typography, not just persistence. The grid tests the
 * PERSISTED flags; the duration cell requires BOTH the years and the months flag.
 */
export const durationCellIsStandard = (flags: StandardFlags): boolean =>
  flags.contractDurationYears && flags.contractDurationMonths;

export const fmtPrice = (v: number | null | undefined): string =>
  v === null || v === undefined || Number.isNaN(v) ? "" : pfxRound(v, 2).toFixed(2);

export const fmtMwh = (v: number | null | undefined): string =>
  v === null || v === undefined || Number.isNaN(v) ? "" : new Intl.NumberFormat("en-GB").format(v);
