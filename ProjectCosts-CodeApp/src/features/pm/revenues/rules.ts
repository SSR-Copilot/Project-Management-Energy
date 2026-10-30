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
 * No flow is called from this screen: no `.Run(` occurs in `Project Revenues Screen.pa.yaml`. The
 * balancing-price writes fire the "Balancing-price period date sync" plugin step (D33, `hooks.ts`).
 *
 * CONNECTED 20 Oct 2026 (D33). The write plans (`planSaveContract`, `planDeleteContract`,
 * `planSaveBalancing`, `planDeleteBalancing`) and the column maps live at the end of this file.
 * `Assumptions Revenues SQL` is Fabric SQL (D2/D26/D28) and stays unconnected, so every engine
 * function below runs over an EMPTY row set until it is (`REVENUE_SCREEN_TEXT.assumptionsNotConnected`).
 */
import {
  parseNumber, isNumeric, isInteger, inRange, isDecimalWithPlaces, isValidCurrency,
  isBlank, langRoot, decimalSeparator, pfxRound, type Lang,
} from "@/domain/powerFxNumeric";
import { addDays, addMonths, addYears } from "@/domain/dates";
import { forLanguage } from "@/features/pm/generators/rules";
import { CHOICE_FINANCE, ES, ES_FINANCE } from "@/data/dataverseNames";
import { bind, dateOnly } from "@/data/odata";
import { createdRowRef, refusePlan, type WritePlan } from "@/data/writePlan";
import type { PlanJob } from "@/data/usePlanWrite";

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
  /**
   * `Country.Country` — in Power Fx a record's table-named field is its PRIMARY KEY, so this is the
   * country's GUID (`_vsb_country_value`), the key `Country Inflation Profiles` are filtered on.
   * (The earlier note called it a country "code"; corrected D33.)
   */
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
  /** `'Cluster State'.Order` — the balancing-price gate (`Order >= 4`). Optional so Finance's fixtures stay valid. */
  clusterStateOrder?: number | null;
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
 * `'Net Yield p50' = 0 or blank`, `IsBlank('Cluster State'.Name) or = "Draft"`. The bullets are
 * `lbl_…_Balancing_Price_VisibilityMessage_34`…`_38.Text`, verbatim. The fifth read "• Cluster State"
 * here before; the canvas (and Finance's own banner) says "• Change the project status from Draft"
 * (D15 f, corrected D33).
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
    bullets.push("• Change the project status from Draft");
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
  // 1.21.753: the two centre zones lost their spaces — "Italy_Centre-South" /
  // "Italy_Centre-North" — in Project Revenues, Project General Milestones AND the Cost app's
  // App.OnStart. They are the `country` values the SQL assumptions carry, so the old
  // spelling now matches no row at all.
  Lazio: "Italy_Centre-South",
  Abruzzo: "Italy_Centre-South",
  Campania: "Italy_Centre-South",
  Umbria: "Italy_Centre-South",
  Marche: "Italy_Centre-North",
  Toscana: "Italy_Centre-North",
  Lombardia: "Italy_North",
  "Emilia Romagna": "Italy_North",
  // The canvas key is "Valle d’Aosta" with U+2019; the U+0027 spelling is kept as well, so a
  // Dataverse name spelled either way maps (D33 — the U+0027-only key matched no canvas value).
  "Valle d’Aosta": "Italy_North",
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
 * Rule 3 — the country slice (1.21.753).
 *
 * Italy no longer takes two exact countries. Every place the screen pulls the slice now uses
 * a prefix match:
 *   OnVisible            `Switch(Country.Name, "Italy", Filter(SQL, StartsWith(country, "Italy")), Filter(SQL, country = Country.Name))`
 *   btn_Revenue_AddContract / the command bar
 *                        `Filter(SQL, Or(StartsWith(country, "Italy"), country = locAreaWithRegion))`
 * Every region value starts with `Italy_`, so the OR adds nothing to the prefix; both reduce
 * to "every row whose country starts with Italy". Everyone else takes their own country.
 * The predicate is expressed over rows here so it can be tested; `hooks.ts` sends the same
 * thing as an OData `startswith`.
 */
export type AssumptionScope =
  | { kind: "prefix"; prefix: "Italy" }
  | { kind: "equals"; country: string }
  | { kind: "none" };

export function assumptionScope(countryName: string | null): AssumptionScope {
  if (countryName === "Italy") return { kind: "prefix", prefix: "Italy" };
  return countryName ? { kind: "equals", country: countryName } : { kind: "none" };
}

export function inAssumptionScope(country: string | null | undefined, scope: AssumptionScope): boolean {
  if (!country || scope.kind === "none") return false;
  return scope.kind === "prefix" ? country.startsWith(scope.prefix) : country === scope.country;
}

/** The 1.21.709 two-country slice — kept so the change is reviewable, used by nothing. */
export function assumptionCountriesCanvas709(countryName: string | null, region: string | null): string[] {
  if (countryName === "Italy" && region) return ["Italy", region];
  return countryName ? [countryName] : [];
}

export function selectCountryAssumptions(
  rows: readonly AssumptionRow[],
  countryName: string | null,
): AssumptionRow[] {
  const scope = assumptionScope(countryName);
  return rows.filter((r) => inAssumptionScope(r.country, scope));
}

/**
 * Rule 11a — which price rows the curve is read from (1.21.753).
 *
 * `recFilteredPrices: Switch(Country.Name, "Italy", Filter(slice, valuetype = "price",
 * country = locAreaWithRegion), Filter(slice, valuetype = "price"))` — an Italian project
 * reads its own price ZONE only; everyone else reads every price row of their country.
 * An Italian project with no recognised province (`region` null) gets no prices.
 */
export function pricePoolFor(
  rows: readonly AssumptionRow[],
  countryName: string | null,
  region: string | null,
): AssumptionRow[] {
  const prices = rows.filter((r) => r.valuetype === "price");
  if (countryName === "Italy") return region ? prices.filter((r) => r.country === region) : [];
  return prices;
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
): FieldWithStandard<Date | null> {
  const today = opts.today ?? new Date();
  const hardCoded = opts.hardCodedStandardFlag ?? true;
  const exists = opts.standardAssumptionExists ?? false;
  const isStandard = hardCoded ? true : exists;
  /*
   * Audit 20 Oct 2026 (FIXED, `drp_…_Label_1.OnChange` Y:5808-5833 and `ico_SetCODDate_…_1.OnChange`
   * Y:7568): `Value: If(recStandardAssumptionExists, Switch(true, PV, If(csd.pv = "operationstartdatecod",
   * recProjectCODDate), Wind, If(csd.wind = …, recProjectCODDate), Today()), DateAdd(COD, 0, Days))`.
   * With NO standard (every contract while Fabric is unconnected, X2) the start date is the project's
   * COD — blank when the COD is blank — not `Today()` as this function returned before. With a
   * standard: PV / Wind take `recProjectCODDate` (the COD, `Today()` when it is blank) only for the
   * `operationstartdatecod` reference and are BLANK for any other (the `If` has no else); any other
   * technology falls through to `Today()`.
   */
  if (!exists) return field(project.cod, isStandard);
  if (tech === "PV" || tech === "Wind") {
    const ref = assumptionText(rows, "contractstart", undefined, tech);
    return field(ref === "operationstartdatecod" ? (project.cod ?? today) : null, isStandard);
  }
  return field(today, isStandard);
}

/**
 * Rule 10 — duration comes from the assumptions:
 * `valuetype = "contractdurationyear"` and `"contractdurationmonth"`.
 */
export function contractDuration(
  rows: readonly AssumptionRow[], tech: Technology,
  opts: { standardAssumptionExists?: boolean; language?: Lang } = {},
): { years: FieldWithStandard<number | null>; months: FieldWithStandard<number | null> } {
  const lang = opts.language ?? "en-US";
  const isStandard = opts.standardAssumptionExists ?? false;
  /*
   * Audit 20 Oct 2026 (FIXED, Y:5923-5934 / 5966-5977): `Value: If(recStandardAssumptionExists,
   * Value(<tech column>), Blank())` — without a standard the durations are BLANK, so both pickers
   * show nothing (their `DefaultSelectedItems` `LookUp(…, Value = Blank())` finds no row). They were
   * 0 / 0 here, which pre-selected "0 year" / "0 month".
   */
  if (!isStandard) return { years: field(null, false), months: field(null, false) };
  const y = assumptionValue(rows, "contractdurationyear", undefined, tech, lang);
  const m = assumptionValue(rows, "contractdurationmonth", undefined, tech, lang);
  return {
    years: field(Number.isNaN(y) ? null : y, isStandard),
    months: field(Number.isNaN(m) ? null : m, isStandard),
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
  start: FieldWithStandard<Date | null>,
  years: FieldWithStandard<number | null>,
  months: FieldWithStandard<number | null>,
): boolean => start.isStandard && years.isStandard && months.isStandard;

/**
 * The engine's end date (`locRevenueContractEndDate`, Y:6795-6851): `If(<all three standard>,
 * DateAdd(DateAdd(DateAdd(start, years, Years), months, Months), -1, Days), start)` — NO one-day
 * guard here (that guard lives only in the three `OnChange` copies). Audit 20 Oct 2026 (FIXED): the
 * engine used `endDateWithGuard`, which turned a standard zero-length term into the start date.
 */
export function engineEndDate(
  start: FieldWithStandard<Date | null>,
  years: FieldWithStandard<number | null>,
  months: FieldWithStandard<number | null>,
): Date | null {
  if (!start.value) return null;
  return endDateIsStandard(start, years, months)
    ? contractEndDate(start.value, years.value ?? 0, months.value ?? 0)
    : new Date(start.value.getTime());
}

/** `Text(x, "0.00")` — the panel's inflation-profile text (`txt_…_InflationProfile_1.Value`, Y:11038). */
export const fmtTwoDecimals = (v: number | null | undefined): string =>
  v === null || v === undefined || Number.isNaN(v) ? "" : pfxRound(v, 2).toFixed(2);

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
  /**
   * 1.21.753 — `recPriceRecord: LookUp(Filter(slice, valuetype = "price" && country =
   * locAreaWithRegion), category = Text(Year(COD)))`. The exact-year lookup now also requires
   * `country = locAreaWithRegion`, which is BLANK for every non-Italian project, so outside
   * Italy the exact branch can no longer match and the canvas always falls through to the
   * year-vs-price fallback below. SOURCE DEFECT (1.21.753-1) — reproduced here, NOT in
   * `priceForYear`. Pass `undefined` for the 1.21.709 behaviour.
   */
  exactRegion?: string | null,
): number | null {
  const prices = priceRows(rows);
  if (prices.length === 0) return null;

  const exact = exactRegion === undefined
    ? prices.find((r) => r.category === String(codYear))
    : exactRegion
      ? prices.find((r) => r.category === String(codYear) && r.country === exactRegion)
      : undefined;
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
    (p) => p.countryCode === countryCode && p.year === year && (area === null || sameInflationArea(p.area, area)),
  );
  return Math.max(hit?.inflation ?? 0, 0);
}

/**
 * DIVERGENCE (D33): the Area term compares without the spaces around the hyphen. The region map
 * follows 1.21.753 ("Italy_Centre-North"), but `Country Inflation Profiles.Area` holds the
 * 1.21.709 spelling ("Centre - North", measured in VSBCloud_Dev, `data/landLease.ts`), so an exact
 * compare never matches the two centre zones and the lookup falls to 0. The canvas compares
 * exactly (`countryInflationValueCanvasParity`).
 */
export const sameInflationArea = (stored: string | null, wanted: string): boolean =>
  stored !== null && stored.replace(/\s*-\s*/g, "-") === wanted.replace(/\s*-\s*/g, "-");

/** Canvas parity: `Area = Substitute(locAreaWithRegion, "Italy_", "")`, compared exactly. */
export function countryInflationValueCanvasParity(
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

/**
 * Rule 28 — only the FIRST period carries a `'Shift of COD Date [Months]'`. The container's
 * `Visible` (and the Save payload's `If`) is `Or(And(CountRows(col) = 1, !IsBlank(selected)),
 * IsEmpty(col))`: a new first period, OR editing the sole existing one. (Corrected D33 — the code
 * hid the field while editing the only period.)
 */
export const showsShiftOfCod = (existingCount: number, editing = false): boolean =>
  existingCount === 0 || (existingCount === 1 && editing);

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

/**
 * `colYearsForBalancingPriceDuration` = `ForAll(Sequence(31, 0), …)` (`OnVisible`) — 0…30. It
 * reused the contract picker's 0…35 before (D15 g, corrected D33).
 */
export const balancingYearOptions = (): number[] => Array.from({ length: 31 }, (_, i) => i);

/* ══════════════════════════════════════════════════════════════ validation ═════ */

export interface ValidationResult { valid: boolean; message: string }
const ok: ValidationResult = { valid: true, message: "" };
const bad = (message: string): ValidationResult => ({ valid: false, message });

/*
 * D33: the numeric error texts are the canvas ones. Before, every field said "Numeric value
 * expected" (marked NEW), although each canvas error label has its own text — mostly the
 * `gblAppResx` strings (App.pa.yaml:1625-1634).
 */
export const MSG = {
  /**
   * `gblAppResx.Numeric` — verbatim. Shown by the Tariff (`lbl_…_TariffPrice_ErrorMessage_1`) and
   * Shift of COD (`lbl_…_BiddingPrice_ErrorMessage_3`) error labels.
   */
  numeric: "Numeric value without decimals",
  /**
   * `gblAppResx.NumericTwoDecimals` (Bidding Price, Balancing Price) and the literal of
   * `lbl_…_SiteQuality_ErrorMessage_1` / `_p90` — verbatim.
   */
  twoDecimals: "Numeric value with maximum of two decimals",
  /** `gblAppResx.NumericThreeDecimals` — `lbl_…_CorrectionFactor_ErrorMessage_1` / `_p90`, verbatim. */
  threeDecimals: "Numeric value with maximum of three decimals",
  /** `lbl_…_HedgedVolume_ErrorMessage_1.Text` — verbatim ("decimals" sic). */
  oneDecimal: "Numeric value with maximum of one decimals",
  /** `lbl_…_InflationProfile_ErrorMessage_1.Text` — verbatim, with its full stop. */
  twoDecimalsInflation: "Numeric value with maximum of two decimals.",
  /** `lbl_…_BiddingPrice_ErrorMessage_2.Text`, Poland branch — verbatim. */
  balancingRangePoland: "Value must be between -25 and +50.",
  /** `lbl_…_BiddingPrice_ErrorMessage_2.Text`, other countries — verbatim. */
  balancingRange: "Value must be between -5 and +10.",
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
  /** `lbl_ProjectRevenues_RightPanel_NewEditCost_BodyContent_Description_ErrorMessage_1.Text` — verbatim. */
  standardDescription: "Standard is applicable only for system-prefilled contracts.",
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
  if (!isValidCurrency(text, lang)) return bad(MSG.twoDecimals);
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
  // D33: a decimal failure shows `gblAppResx.NumericThreeDecimals`, not the range text.
  if (!isDecimalWithPlaces(text, 3, lang)) return bad(MSG.threeDecimals);
  return inRange(text, 0.5, 2, lang) ? ok : bad(msg);
}

/** Validation — Hedged Volume [%]: `IsOneDecimal` and 0…100. */
export function validateHedgedVolumePercent(text: string, lang: Lang = "en-US"): ValidationResult {
  if (isBlank(text)) return ok;
  if (!isDecimalWithPlaces(text, 1, lang)) return bad(MSG.oneDecimal);
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
  if (!isDecimalWithPlaces(text, 2, lang)) return bad(MSG.twoDecimalsInflation);
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
  if (!rx.test(text)) return bad(MSG.twoDecimals);
  const poland = country === "Poland";
  const [min, max] = poland ? [-25, 50] : [-5, 10];
  return inRange(text, min, max, lang) ? ok : bad(poland ? MSG.balancingRangePoland : MSG.balancingRange);
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

/**
 * The `IsStandardAssumption` part of every `locRevenue*` variable the Save `Patch` reads
 * (L4880-4976), plus `locRevenueIsStandardAssumptions.*`. The form keeps them so the fourteen
 * persisted flags can be written (D14 — they were discarded before D33).
 */
export interface FormStandard {
  contractStartDate: boolean;
  contractEndDate: boolean;
  contractDurationYears: boolean;
  contractDurationMonths: boolean;
  /** `locRevenuePrice.IsStandardAssumption` — the tariff (the bidding price for German FiT). */
  price: boolean;
  /** `locRevenuePriceP90.IsStandardAssumption` */
  priceP90: boolean;
  /** `locRevenueIsStandardAssumptions.IsBiddingPrice` */
  biddingPrice: boolean;
  /** `locRevenueCorrectionFactorP50.IsStandardAssumption` / `…IsCorrectionp50` */
  correctionFactor: boolean;
  /** `locRevenueCorrectionFactorP90.IsStandardAssumption` / `…IsCorrectionp90` */
  correctionFactorP90: boolean;
  /** `locRevenueInflationProfile.IsStandardAssumption` */
  useInflation: boolean;
  /** `locRevenueInflationCountryProfile.IsStandardAssumption` */
  useCountryInflation: boolean;
  /**
   * `locRevenueInflationCountryProfile.StandardAssumptionValue` — WHAT the standard says ("use the
   * country profile"), not whether the field is still standard. Read by the canvas defect below.
   */
  useCountryInflationStandardValue: boolean;
  /** `locRevenueIsStandardAssumptions.IsInflationStartYear` */
  inflationStartYear: boolean;
  /** `locRevenueIsStandardAssumptions.IsInflationValue` */
  inflationValue: boolean;
  /** `locRevenueIsStandardAssumptions.IsHedgedVolume` */
  hedgedVolume: boolean;
}

export const NOTHING_STANDARD: FormStandard = {
  contractStartDate: false, contractEndDate: false, contractDurationYears: false,
  contractDurationMonths: false, price: false, priceP90: false, biddingPrice: false,
  correctionFactor: false, correctionFactorP90: false, useInflation: false,
  useCountryInflation: false, useCountryInflationStandardValue: false,
  inflationStartYear: false, inflationValue: false, hedgedVolume: false,
};

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
  /** The per-field standardness the Save writes as the fourteen flags. */
  std: FormStandard;
  /**
   * Edit only: the stored `'Inflation Profile'` as `Text(…, "0.00")`. `txt_…_InflationProfile_1.Value`
   * (Y:11009-11040) shows it whenever an edited contract's country toggle is off, so switching the
   * toggle off again brings it back (audit 20 Oct 2026).
   */
  storedInflationProfile?: string;
}

/**
 * Rule 20 — the right panel's standard-assumption styling (`FontColor`/`Color` themePrimary +
 * `FontItalic`/`Italic`), one entry per canvas control that carries the pair. Every field
 * `OnChange` writes `IsStandardAssumption: false` into its `locRevenue*` variable (and
 * `locStandardAssumtionContract: false`), which is exactly when `form.std` / `isStandardContract`
 * go false here (`editField`), so the styling clears on the first edit as in the canvas.
 *
 *  - `txt_…_Description_1`: `If(locStandardAssumtionContract, …)` (both halves).
 *  - `dte_…_ContractStartDate_1`: `And(locRevenueContractStartDate.Value = Self.SelectedDate,
 *    locRevenueContractStartDate.IsStandardAssumption)` (both).
 *  - `dte_…_ContractEndDate_1`: `FontItalic: If(locRevenueContractEndDate.IsStandardAssumption, …)`
 *    with NO conditional colour — the italic-only canvas variant.
 *  - `txt_…_BiddingPrice_1`: `…IsBiddingPrice`; `…_CorrectionFactor_1` / `_p90`: `…IsCorrectionp50`
 *    / `…IsCorrectionp90` (the p90 italic's value test is commented out; the flag alone is live).
 *  - `txt_…_TariffPrice_1` / `_p90`: the `recTarrifPriceFieldColor` `Switch` — German FiT:
 *    `And(locRevenuePrice.IsStandardAssumption, locRevenueCorrectionFactorP50.IsStandardAssumption)`;
 *    otherwise `locRevenuePrice.IsStandardAssumption`. NOTE the p90 field reads `locRevenuePrice`,
 *    not `locRevenuePriceP90` — ported as written.
 *  - `txt_…_InflationStartYear_1` / `…_InflationProfile_1`: `…IsInflationStartYear` / `…IsInflationValue`.
 *  - `txt_…_HedgedVolume_1`: `…IsHedgedVolume` (its colour reads
 *    `locRevenueContractHedgeVolumne.IsStandardAssumption`; both are `std.hedgedVolume` here).
 */
export interface RevenuePanelStandard {
  description: boolean;
  contractStartDate: boolean;
  /** Italic only — the canvas sets no conditional colour on `dte_…_ContractEndDate_1`. */
  contractEndDate: boolean;
  biddingPrice: boolean;
  correctionFactor: boolean;
  correctionFactorP90: boolean;
  tariff: boolean;
  tariffP90: boolean;
  inflationStartYear: boolean;
  inflationProfile: boolean;
  hedgedVolume: boolean;
}

export function revenuePanelStandard(
  form: Pick<RevenueFormState, "isStandardContract" | "showsGermanFitBlock" | "std">,
): RevenuePanelStandard {
  const s = form.std;
  const tariff = form.showsGermanFitBlock ? s.price && s.correctionFactor : s.price;
  return {
    description: form.isStandardContract,
    contractStartDate: s.contractStartDate,
    contractEndDate: s.contractEndDate,
    biddingPrice: s.biddingPrice,
    correctionFactor: s.correctionFactor,
    correctionFactorP90: s.correctionFactorP90,
    tariff,
    tariffP90: tariff,
    inflationStartYear: s.inflationStartYear,
    inflationProfile: s.inflationValue,
    hedgedVolume: s.hedgedVolume,
  };
}

/**
 * `con_…_CorrectionFactor_p90.Visible` / `con_…_SiteQuality_p90.Visible` —
 * `And(Germany, Label = FiT, Technology = Wind)`. NOTE `= Wind`, while the rest of the block is
 * `<> PV` (rule 15).
 */
export const showsP90Block = (form: Pick<RevenueFormState, "showsGermanFitBlock" | "technology">): boolean =>
  form.showsGermanFitBlock && form.technology === "Wind";

/**
 * Validation — `pcf_…_Save_1.DisplayMode` (L12438-12536), ported term for term (corrected D33).
 *
 * Requires: a subaccount; no tariff error; non-blank Label, `Trim(Description)`, Currency, Tariff,
 * Start Date, Duration Years, Duration Months, End Date; the hedge-type branch; the German FiT
 * branch (`<> PV`: bidding / correction factor / Site Quality p50 valid, bidding and correction
 * factor non-blank); the German wind branch (`= Wind`: Site Quality p90, Correction Factor p90 and
 * Tariff p90 valid, Correction Factor p90 and Tariff non-blank); no description error; the
 * inflation branch (start year and profile valid AND non-blank — the profile text holds the
 * country value while the country toggle is on); and finally `formDirty`.
 *
 * Before D33 the German wind branch required Site Quality p90 to be non-blank (the canvas does not)
 * and ignored the Site Quality p50 error; the inflation branch skipped the profile while the
 * country toggle was on.
 */
export function canSaveRevenueContract(
  form: RevenueFormState, lang: Lang = "en-US",
): boolean {
  if (!form.formDirty) return false;
  if (isBlank(form.subaccountId)) return false;
  if (!validateTariff(form.tariff, form.country, form.showsGermanFitBlock, lang).valid) return false;
  if (isBlank(form.revenueTypeLabel)) return false;
  if (isBlank(form.description.trim())) return false;
  if (isBlank(form.currencyCode)) return false;
  if (isBlank(form.tariff)) return false;
  if (!form.startDate || !form.endDate) return false;
  if (form.durationYears === null || form.durationMonths === null) return false;

  // Hedge-type-specific branch.
  if (form.hedge.type === "percentage") {
    if (isBlank(form.hedge.percentage.value)) return false;
    if (!validateHedgedVolumePercent(form.hedge.percentage.value, lang).valid) return false;
  } else if (form.hedge.type === "fixed") {
    if (isBlank(form.hedge.fixed.value)) return false;
    if (!validateVolumeMwh(form.hedge.fixed.value, form.netYieldP50).valid) return false;
    if (form.hedge.fixed.initialState) return false;
  } else {
    if (form.hedge.individual.length === 0) return false;
    if (form.hedge.individual.some((r) => isBlank(r.value) || r.initialState)) return false;
    if (form.hedge.individual.some((r) => !validateVolumeMwh(r.value, form.netYieldP50).valid)) {
      return false;
    }
  }

  // German FiT branch (`<> PV`).
  if (form.showsGermanFitBlock) {
    if (!validateBiddingPrice(form.biddingPrice, lang).valid) return false;
    if (!validateCorrectionFactor(form.correctionFactor, lang).valid) return false;
    if (isBlank(form.biddingPrice) || isBlank(form.correctionFactor)) return false;
    if (!validateSiteQuality(form.siteQuality, lang).valid) return false;
  }
  // German wind branch (`= Wind`). The Tariff p90 input is always Disabled here, and its error
  // label is suppressed while disabled (as the p50 one), so that term never blocks.
  if (showsP90Block(form)) {
    if (!validateSiteQuality(form.siteQualityP90, lang).valid) return false;
    if (!validateCorrectionFactor(form.correctionFactorP90, lang).valid) return false;
    if (!validateTariff(form.tariffP90, form.country, true, lang).valid) return false;
    if (isBlank(form.correctionFactorP90) || isBlank(form.tariff)) return false;
  }

  if (!validateDescription(form.description, form.isStandardContract).valid) return false;

  // Inflation branch.
  if (form.useInflation) {
    if (!validateInflationStartYear(form.inflationStartYear).valid) return false;
    if (!validateInflationProfile(form.inflationProfile, lang).valid) return false;
    if (isBlank(form.inflationStartYear) || isBlank(form.inflationProfile)) return false;
  }
  return true;
}

/** Rule 32 — Individual Volumes needs one extra confirmation before the save runs. */
export const needsIndividualVolumesConfirmation = (hedgeType: HedgeType): boolean =>
  hedgeType === "individual";

/* ══════════════════════════════════════════════════════════════ save payload ═══ */

/**
 * The fourteen `Is … Standard Assumption?` columns of `vsb_ProjectRevenue` (rule 25). All fourteen
 * are written by the canvas Save `Patch` (L4880-4976).
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

/**
 * The fourteen flags the Save `Patch` writes (L4880-4976), term for term. "Visible" terms: the
 * Bidding Price / Correction Factor containers are the German FiT block (`<> PV`), the Correction
 * Factor p90 container is `= Wind`; both inflation toggles are always visible; the custom
 * inflation profile container follows the inflation toggle.
 *
 * SOURCE DEFECT (D33): `'Is Use Custom Inflation Standard Assumption?'` tests
 * `locRevenueInflationCountryProfile.StandardAssumptionValue` — what the standard SAYS — instead of
 * `.IsStandardAssumption`, so a contract whose standard is "use the country profile" is written
 * standard even after the user switched the toggle, and an edit (whose standard value is "false")
 * always writes false. Here the field's own standardness is written;
 * `buildStandardFlagsCanvasParity` keeps the canvas term.
 */
export function buildStandardFlags(form: RevenueFormState): StandardFlags {
  return standardFlagsFor(form, form.std.useCountryInflation);
}

/** Canvas parity: `And(tgl_…CountryInflationProfile_1.Visible, …StandardAssumptionValue)`. */
export function buildStandardFlagsCanvasParity(form: RevenueFormState): StandardFlags {
  return standardFlagsFor(form, form.std.useCountryInflationStandardValue);
}

function standardFlagsFor(form: RevenueFormState, useCustomInflation: boolean): StandardFlags {
  const s = form.std;
  const fit = form.showsGermanFitBlock;
  return {
    biddingPrice: fit && s.biddingPrice,
    contractDurationYears: s.contractDurationYears,
    contractDurationMonths: s.contractDurationMonths,
    contractStartDate: s.contractStartDate,
    contractEndDate: s.contractEndDate,
    tariffPrice: fit ? s.price && s.correctionFactor : s.price,
    tariffPriceP90: fit ? s.priceP90 && s.correctionFactorP90 : s.priceP90,
    useInflationProfile: s.useInflation,
    useCustomInflation,
    inflationProfileYear: s.inflationStartYear,
    customInflationProfile: s.inflationValue && form.useInflation,
    hedgedVolume: s.hedgedVolume && form.hedge.type === "percentage",
    correctionFactor: fit && s.correctionFactor,
    correctionFactorP90: showsP90Block(form) && s.correctionFactorP90,
  };
}

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
  hedgeType: number;
  hedgedVolume: number | null;
  fixedContractedMwhPa: number | null;
  useInflationProfile: boolean;
  useCountryInflationProfile: boolean;
  /** `'Inflation Country Area': gblRecordSelectedProject.'Area/State/Province'.Name` (L4865). */
  inflationCountryArea: string | null;
  inflationProfile: number | null;
  inflationStartYear: number | null;
  considerNegativePrices: boolean;
  negativePriceManualOverride: boolean;
  /** `'Owning Business Unit': gblRecordSelectedProject.'Besitzer (Unternehmenseinheit)'` (L4879). */
  owningBusinessUnitId: string | null;
  flags: StandardFlags;
  individualVolumes: IndividualVolumeRow[];
}

/** `Value(text)` — blank (and an unparseable text) is `Blank()`, written as null. */
const valueOf = (text: string, lang: Lang): number | null => {
  if (isBlank(text)) return null;
  const v = parseNumber(text, lang);
  return Number.isNaN(v) ? null : v;
};

/**
 * Rule 24 — the save payload (`Patch('Project Revenues', …)`, L4806-4995).
 *
 *  - `'Hedged Volume'` is the % value for the percentage type and `0` otherwise;
 *    `FixedContractedmwhpa` only for the fixed type (`Blank()` otherwise).
 *  - `'Bidding Price'`, `'Site Quality'` and `'Correction Factor'` are `0` when the German FiT block
 *    (`<> PV`) is hidden; `'Site Quality p90'` and `'Correction Factor p90'` when the `= Wind`
 *    containers are hidden (corrected D33: they followed the `<> PV` block, so a German Hybrid FiT
 *    wrote values where the canvas writes 0).
 *  - `'Inflation Start Year'`, `'Use Country Inflation Profile'` and `'Inflation Profile'` are
 *    `0` / false when the inflation toggle is off.
 *  - `'Inflation Country Area'` is the project's Area name and the owner is the project's business
 *    unit, on every save (both added D33).
 *  - A blank visible number is `Value("")` = blank → null (it was 0).
 */
export function buildRevenuePayload(
  form: RevenueFormState,
  project: RevenueProject,
  flags: StandardFlags,
  lang: Lang = "en-US",
): RevenueSavePayload {
  const fit = form.showsGermanFitBlock;
  const p90 = showsP90Block(form);
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
    tariffPrice: valueOf(form.tariff, lang),
    tariffPriceP90: valueOf(form.tariffP90, lang),
    biddingPrice: fit ? valueOf(form.biddingPrice, lang) : 0,
    siteQuality: fit ? valueOf(form.siteQuality, lang) : 0,
    siteQualityP90: p90 ? valueOf(form.siteQualityP90, lang) : 0,
    correctionFactor: fit ? valueOf(form.correctionFactor, lang) : 0,
    correctionFactorP90: p90 ? valueOf(form.correctionFactorP90, lang) : 0,
    contractStartDate: form.startDate,
    contractEndDate: form.endDate,
    contractDurationYears: form.durationYears,
    contractDurationMonths: form.durationMonths,
    hedgeType: HEDGE_TYPE_VALUE[form.hedge.type],
    hedgedVolume: form.hedge.type === "percentage" ? valueOf(form.hedge.percentage.value, lang) : 0,
    fixedContractedMwhPa: form.hedge.type === "fixed" ? valueOf(form.hedge.fixed.value, lang) : null,
    useInflationProfile: inflOn,
    useCountryInflationProfile: inflOn ? form.useCountryInflationProfile : false,
    inflationCountryArea: project.areaName,
    inflationProfile: inflOn ? valueOf(form.inflationProfile, lang) : 0,
    inflationStartYear: inflOn ? valueOf(form.inflationStartYear, lang) : 0,
    considerNegativePrices: form.considerNegativePrices,
    negativePriceManualOverride: form.negativePriceManualOverride,
    owningBusinessUnitId: project.owningBusinessUnitId,
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
  /** `'Inflation Country Area'` — the grid's Area cell. */
  inflationCountryArea: string | null;
  considerNegativePrices: boolean;
  negativePriceManualOverride: boolean;
  currencyId: string | null;
  /** `Currency.'Currency Name'` (the lookup's formatted value). */
  currencyName: string | null;
  subaccountId: string | null;
  flags: StandardFlags;
  /** `'Created On'` — the gallery sort (ISO text). */
  createdOn: string;
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

/**
 * Rule 27 — the edit command's `UpdateContext`s (L1101-1446): each field's standardness is read
 * off its stored flag. The end date is never standard on edit; the price flag is the bidding
 * flag for German FiT and the tariff flag otherwise; the p90 price is standard only for German
 * wind FiT with its flag set; the hedged volume only for the percentage type; the country
 * profile's standard VALUE is the literal "false".
 */
export function standardFromStored(
  c: StoredRevenueContract, country: string | null, tech: Technology,
): FormStandard {
  const label = revenueLabelText(c.label);
  const fit = showsGermanFitBlock(country, label, tech);
  const fitWind = fit && tech === "Wind";
  const price = fit ? c.flags.biddingPrice : c.flags.tariffPrice;
  return {
    contractStartDate: c.flags.contractStartDate,
    contractEndDate: false,
    contractDurationYears: c.flags.contractDurationYears,
    contractDurationMonths: c.flags.contractDurationMonths,
    price,
    priceP90: fitWind && c.flags.tariffPriceP90,
    biddingPrice: price,
    correctionFactor: c.flags.correctionFactor,
    correctionFactorP90: c.flags.correctionFactorP90,
    useInflation: c.flags.useInflationProfile,
    useCountryInflation: c.flags.useCustomInflation,
    useCountryInflationStandardValue: false,
    inflationStartYear: c.flags.inflationProfileYear,
    inflationValue: c.flags.customInflationProfile,
    hedgedVolume: c.flags.hedgedVolume && hedgeTypeFromValue(c.hedgeType) === "percentage",
  };
}

/**
 * `txt_…_TariffPrice_p90.Value` (L9904-9927): Germany & FiT → `Text(Bidding × CF_p90, "0.00")`;
 * otherwise `Text(locRevenuePrice.Value, "0.00")` — the p50 price, which the hidden field then
 * writes as `'Tariff / Price p90'`. (Corrected D33: the code kept the static assumption p90 and
 * never recomputed it from the bidding price.)
 */
export function tariffP90Text(
  country: string | null, revenueTypeLabel: string | null,
  biddingPrice: string, correctionFactorP90: string, tariff: string, lang: Lang = "en-US",
): string {
  if (country === "Germany" && revenueTypeLabel === "FiT") {
    const b = parseNumber(biddingPrice, lang);
    const c = parseNumber(correctionFactorP90, lang);
    return germanFitTariff(Number.isNaN(b) ? 0 : b, Number.isNaN(c) ? 0 : c);
  }
  const t = parseNumber(tariff, lang);
  return isBlank(tariff) || Number.isNaN(t) ? "" : pfxRound(t, 2).toFixed(2);
}

/**
 * The description field's `Value`: `If(locStandardAssumtionContract = false, Substitute(value,
 * "Standard ", ""), value)` (L7207-7222) — EVERY "Standard " goes once the contract is no longer
 * standard (B8; before D33 the prefix was never dropped).
 */
export const shownDescription = (description: string, isStandardContract: boolean): string =>
  isStandardContract ? description : description.split("Standard ").join("");

/**
 * Every field `OnChange` sets `locStandardAssumtionContract: false` (L7180, L7598, …). The form
 * becomes dirty, the contract non-standard, and the description loses its "Standard " text.
 */
export function editField(
  form: RevenueFormState, patch: Partial<RevenueFormState>, std: Partial<FormStandard> = {},
): RevenueFormState {
  const next = { ...form, ...patch, formDirty: true, isStandardContract: false, std: { ...form.std, ...std } };
  return { ...next, description: shownDescription(next.description, false) };
}

/**
 * A field whose `OnChange` is only `UpdateContext({locRevenueContractFormDirty: true})` (plus its own
 * value), i.e. it does NOT set `locStandardAssumtionContract: false`: Site Quality p50 / p90
 * (Y:8543, 8712), Fixed Volume (Y:11792), each Individual Volume (Y:12029), the Consider Negative
 * Prices toggle (Y:11136-11172) and its re-sync icon (`Icon1.OnSelect`, Y:11316). Audit 20 Oct 2026
 * (FIXED): they went through `editField`, which also dropped "Standard " from the description.
 */
export function touchField(
  form: RevenueFormState, patch: Partial<RevenueFormState>, std: Partial<FormStandard> = {},
): RevenueFormState {
  return { ...form, ...patch, formDirty: true, std: { ...form.std, ...std } };
}

/**
 * A field whose `OnChange` wraps its standard-assumption update in `If(Not(<its error label>.Visible),
 * …)`: Bidding Price (Y:8296), Inflation Start Year (Y:10613), Custom Inflation Profile (Y:10927) and
 * Hedged Volume [%] (Y:11563). An invalid value is still typed and the form is dirty, but the field
 * stays standard and the contract keeps its "Standard " description until the value is valid.
 * Audit 20 Oct 2026 (FIXED): every keystroke made the contract non-standard.
 */
export function editFieldIfValid(
  form: RevenueFormState, valid: boolean, patch: Partial<RevenueFormState>, std: Partial<FormStandard> = {},
): RevenueFormState {
  return valid ? editField(form, patch, std) : touchField(form, patch);
}

/**
 * `dte_…_ContractStartDate_1.OnChange` (L7598) / the duration pickers (L7815-7900, L7999-8070):
 * the end date with its guard, the inflation start year from a new start date (non-standard), and
 * — with Individual Volumes — the rows regenerated (`Select(btn_IndividualHedgeVolumeDuration_Recalculate)`).
 */
export function withTerm(
  form: RevenueFormState,
  term: {
    startDate?: Date | null; durationYears?: number; durationMonths?: number;
    /** False for `ico_SetCODDate_RightPanelRevenue_1`, which leaves the inflation start year alone. */
    inflationYearFromStart?: boolean;
  },
  std: Partial<FormStandard>,
): RevenueFormState {
  const startDate = term.startDate !== undefined ? term.startDate : form.startDate;
  const durationChanged = term.durationYears !== undefined || term.durationMonths !== undefined;
  const durationYears = term.durationYears ?? form.durationYears;
  /*
   * Audit 20 Oct 2026 (FIXED): `drp_…_Years_1.OnChange` (Y:7841-7845) sets the months to
   * `Coalesce(locRevenueContractDurationInMonths.Value, First(recMonthsAvailable).Value)` — picking the
   * years fills a blank months picker with "0 month".
   */
  const durationMonths = term.durationMonths ?? (term.durationYears !== undefined ? (form.durationMonths ?? 0) : form.durationMonths);
  const years = durationYears ?? 0;
  const months = durationMonths ?? 0;
  const startChanged = term.startDate !== undefined && term.inflationYearFromStart !== false;
  const guarded = startDate ? endDateWithGuard(startDate, years, months) : null;
  /*
   * Audit 20 Oct 2026 (FIXED): `dte_…_ContractStartDate_1.OnChange` (Y:7598) writes `Blank()` when the
   * calculated end passes the one-day guard but the years or the months are still blank. (The two
   * duration `OnChange`s have no such term.)
   */
  const endDate = startChanged && startDate && guarded && guarded.getTime() !== startDate.getTime()
    && (durationYears === null || durationMonths === null)
    ? null
    : guarded;
  const individual = form.hedge.type === "individual" && startDate && endDate
    ? generateVolumeRows(startDate, endDate)
    : form.hedge.individual;
  return editField(form, {
    startDate,
    durationYears,
    durationMonths,
    endDate,
    ...(startChanged && startDate ? { inflationStartYear: String(startDate.getFullYear()) } : {}),
    hedge: { ...form.hedge, individual },
  }, {
    ...std,
    contractEndDate: false,
    // Audit 20 Oct 2026 (FIXED): either duration picker writes BOTH duration variables with
    // `IsStandardAssumption: false` (Y:7836-7848, 8009-8018); only the changed one went false.
    ...(durationChanged ? { contractDurationYears: false, contractDurationMonths: false } : {}),
    ...(startChanged ? { inflationStartYear: false } : {}),
  });
}

/**
 * `ico_SetCODDate_RightPanelRevenue_1.OnChange` (Y:7568) — "Reset to current project COD date.".
 *  - The start date is re-derived exactly as the engine does (`contractStartDate`): the COD when no
 *    standard exists (always, while Fabric is unconnected — X2), flagged standard (`true`, the
 *    canvas hard-codes it, source ambiguity 5).
 *  - The end date: when the calculated end passes the one-day guard, it is standard if the start
 *    AND both durations are; otherwise it is the start date, non-standard.
 *  - It does NOT set `locStandardAssumtionContract: false` and does not touch the inflation start
 *    year; Individual Volumes are regenerated (`Select(btn_IndividualHedgeVolumeDuration_Recalculate)`).
 * Audit 20 Oct 2026 (FIXED): the code went through `withTerm`/`editField`, which made the contract
 * non-standard and wrote a non-standard end date.
 *
 * DIVERGENCE (evaluation order, documented D33): the canvas computes `recCalculatedEndDate` from
 * `dte_…_ContractStartDate_1.SelectedDate` BEFORE its `Reset`, i.e. from the date the picker still
 * shows when the user had typed one; here the end is computed from the reset (COD) date.
 */
export function resetStartToCod(
  form: RevenueFormState, project: RevenueProject, rows: readonly AssumptionRow[], today?: Date,
): RevenueFormState {
  const exists = standardAssumptionExists(rows, form.technology, form.revenueTypeLabel);
  const start = contractStartDate(rows, form.technology, project, { standardAssumptionExists: exists, today }).value;
  const calc = start ? contractEndDate(start, form.durationYears ?? 0, form.durationMonths ?? 0) : null;
  const passes = start !== null && calc !== null && Math.round((calc.getTime() - start.getTime()) / 86_400_000) > 1;
  const endDate = passes ? calc : start;
  const individual = form.hedge.type === "individual" && start && endDate
    ? generateVolumeRows(start, endDate)
    : form.hedge.individual;
  return touchField(form, { startDate: start, endDate, hedge: { ...form.hedge, individual } }, {
    contractStartDate: true,
    contractEndDate: passes && form.std.contractDurationYears && form.std.contractDurationMonths,
  });
}

/**
 * `ico_SyncNegativePrice_RightPanelRevenue.OnChange` / `Icon1.OnSelect` (L11191-11413): re-sync
 * the toggle with the assumption state and clear the manual override. Visible only while the
 * toggle is editable and overridden.
 */
export function resyncNegativePrice(
  form: RevenueFormState, assumed: NegativePriceState,
): RevenueFormState {
  // Audit 20 Oct 2026 (FIXED): `Icon1.OnSelect` only sets the toggle state and the form dirty; it
  // leaves `locStandardAssumtionContract` alone (it used `editField`).
  return touchField(form, { considerNegativePrices: assumed.toggleState, negativePriceManualOverride: false });
}

/**
 * `tgl_…_Consider_Negative_prices.DisplayMode = locRevenueContractConsiderNegativePrice.DisplayMode`.
 * `btn_Revenue_AddContract.OnSelect` (Y:763-767) seeds it `DisplayMode.Edit`; only the Type's
 * engine (Y:6965-6980) and the Edit command (Y:1080-1092) replace it with the assumption-driven
 * mode. So a new contract's toggle (and `Icon1`, Visible on `DisplayMode = Edit`) is editable until
 * a Type is chosen. Audit 20 Oct 2026 (FIXED): it was always the assumption-driven mode.
 */
export const negativePriceDisplayMode = (
  form: Pick<RevenueFormState, "mode" | "revenueTypeLabel">, assumed: Pick<NegativePriceState, "displayMode">,
): DisplayMode => (form.mode === "New" && form.revenueTypeLabel === null ? "edit" : assumed.displayMode);

/**
 * `con_…_InflationToggles_1.Height = If(tgl_…_InflationProfile_1.Checked, 76, 36)` (Y:10195-10201)
 * with `tgl_…_CountryInflationProfile_1` at `Y: =40` (Y:10243-10263): the container clips the
 * country toggle away while the inflation toggle is off. Audit 20 Oct 2026 (FIXED, corrects D33
 * S15 "always shown"): the toggle has no `Visible` of its own, but it is only SEEN with inflation on.
 */
export const showsCountryInflationToggle = (form: Pick<RevenueFormState, "useInflation">): boolean =>
  form.useInflation;

/**
 * The hedge 100 % check reads `Value(txt_…_HedgedVolume_1.Value)` (Y:4774) — the locale-aware
 * `Value`, not JavaScript's `Number` (which reads "12,5" as NaN). Audit 20 Oct 2026 (FIXED).
 */
export const hedgePercentForCheck = (text: string, lang: Lang = "en-US"): number => {
  const v = parseNumber(text, lang);
  return Number.isNaN(v) ? 0 : v;
};

/**
 * Rule 4a — `valuetype = "hedgedvolume"` (L5873-5906): the standard % of a new contract, the tech
 * column as text when a standard assumption exists, otherwise blank. (Added D33 — the engine left
 * the % empty.)
 */
export function standardHedgedVolume(
  rows: readonly AssumptionRow[], tech: Technology, exists: boolean,
): FieldWithStandard<string> {
  if (!exists) return field("", false);
  return field(assumptionText(rows, "hedgedvolume", undefined, tech) ?? "", true);
}

/* ═══════════════════════════════════════════════════════════════ command bar ═══ */

export type RevenueCommandKey = "add" | "edit" | "delete";

export interface CommandState { visible: boolean; enabled: boolean; reason?: string }

/**
 * `btn_Revenue_AddContract.DisplayMode`, `pcf_ProjectRevenues_Content_ContractCommandBar_3.DisplayMode`
 * and the gallery's `DisplayMode` — all `If(Or(IsBlank('Cluster State'.Name), 'Cluster State'.Name =
 * "Draft", con_Milestones_Page_LockMessage_7.Visible), Disabled, Edit)`. The lock already contains
 * the Draft term, so this is `isPageLocked`.
 */
export const isRevenuePageBlocked = (project: RevenueProject | null): boolean => isPageLocked(project);

/**
 * Validation — the contract commands. Add: the page gate only (S4, corrected D33 — the canvas opens
 * the panel without a Revenue Subaccount and reports it in the panel; Save stays disabled). Edit /
 * Delete: a selected contract, the page gate and `RecordInfo(…, EditPermission / DeletePermission)`,
 * which has no SDK equivalent and passes (D1; Dataverse refuses what the user may not do).
 *
 * SOURCE DEFECT (D33): the canvas `ItemEnabled` asks `RecordInfo` of `locSelectedRevenueContract` —
 * the contract selected BEFORE the click, not the card's own (`ThisItem`). Here the selected row
 * is the one asked about.
 */
export function contractCommandBar(
  selected: StoredRevenueContract | null, pageBlocked: boolean,
): Record<RevenueCommandKey, CommandState> {
  return {
    add: { visible: true, enabled: !pageBlocked },
    edit: { visible: true, enabled: !pageBlocked && Boolean(selected?.canEdit) },
    delete: { visible: true, enabled: !pageBlocked && Boolean(selected?.canDelete) },
  };
}

/**
 * Rule 29 — the balancing commands. Add: `btn_Revenue_AddBlancing_Price.DisplayMode` =
 * `And('Cluster State'.Order >= 4, CountRows(col) < 10)`; the row Edit / Delete `ItemEnabled` =
 * "this is the newest period" (L3438-3456). The canvas has no lock or Draft term here (the tab
 * itself is disabled then). The invented "Only the most recent period can be …" tooltips are
 * removed (D33): the canvas shows none.
 */
export function balancingCommandBar(
  periods: readonly BalancingPeriod[], selectedId: string | null, clusterStateOrder: number | null,
): Record<RevenueCommandKey, CommandState> {
  const newest = selectedId !== null && isNewestPeriod(periods, selectedId);
  return {
    add: { visible: true, enabled: balancingClusterReached(clusterStateOrder) && periods.length < 10 },
    edit: { visible: true, enabled: newest },
    delete: { visible: true, enabled: newest },
  };
}

/** `'Cluster State'.Order >= 4` — the balancing grid, its Add button and the Cluster-4 message. */
export const balancingClusterReached = (order: number | null | undefined): boolean =>
  typeof order === "number" && order >= 4;

/* ══════════════════════════════════════════════════════════════════ display ════ */

/**
 * Rule 26 — standardness drives typography, not just persistence. The grid tests the
 * PERSISTED flags; the duration cell requires BOTH the years and the months flag.
 */
export const durationCellIsStandard = (flags: StandardFlags): boolean =>
  flags.contractDurationYears && flags.contractDurationMonths;

export const fmtPrice = (v: number | null | undefined, lang: Lang = "en-US"): string =>
  v === null || v === undefined || Number.isNaN(v) ? "" : forLanguage(pfxRound(v, 2).toFixed(2), lang);

export const fmtMwh = (v: number | null | undefined): string =>
  v === null || v === undefined || Number.isNaN(v) ? "" : new Intl.NumberFormat("en-GB").format(v);

/** `Text(date, "dd.mm.yyyy")` — the card and balancing-grid dates (L1678-1681, L3358). Local parts. */
export const fmtCardDate = (d: Date | null): string => (d ? dd(d) : "");

/**
 * `Text(ThisItem.'Tariff / Price', "#,##0.00", Language())` (L2463), in en-US notation as the other
 * connected PM screens (the canvas follows `Language()`).
 */
export const fmtTariffCell = (v: number | null, lang: Lang = "en-US"): string =>
  v === null || Number.isNaN(v) ? ""
    : forLanguage(new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v), lang);

/** `If(Int(x) = x, Text(x, "#"), Text(x, "#0.0#"))` — the Site Quality cells (L2165-2170). */
export function fmtSiteQualityCell(v: number | null, lang: Lang = "en-US"): string {
  if (v === null || Number.isNaN(v)) return "";
  if (Number.isInteger(v)) return v === 0 ? "" : String(v);
  return fmtSiteQualityDecimals(v, lang);
}

/** `Text(x, "#0.0#")` — at least one, at most two decimals. */
export function fmtSiteQualityDecimals(v: number, lang: Lang = "en-US"): string {
  const r = pfxRound(v, 2);
  return forLanguage(Number.isInteger(r * 10) ? r.toFixed(1) : r.toFixed(2), lang);
}

/**
 * The hedged-volume cell (L2717-2751): `"<%> %"` for the percentage type (`"0"` when whole,
 * `"#0.0#"` otherwise), `Text(fixed, "#,##0") & " MWh"` for the fixed type, blank for Individual
 * Volumes (the `Switch` has no arm).
 */
export function fmtHedgeCell(c: Pick<StoredRevenueContract, "hedgeType" | "hedgedVolume" | "fixedContractedMwhPa">, lang: Lang = "en-US"): string {
  const type = hedgeTypeFromValue(c.hedgeType);
  if (type === "percentage") {
    const v = c.hedgedVolume ?? 0;
    if (Number.isInteger(v)) return `${v} %`;
    const r = pfxRound(v, 2);
    return `${forLanguage(Number.isInteger(r * 10) ? r.toFixed(1) : r.toFixed(2), lang)} %`;
  }
  if (type === "fixed") {
    const v = c.fixedContractedMwhPa;
    return `${v === null ? "" : forLanguage(new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v), lang)} MWh`;
  }
  return "";
}

/**
 * `lbl_…_CardBody_Fields_InflationProfile_1.Text` — `$"Inflation Profile {If(<country>,"","[%]")}"`
 * (L2008): the trailing space of the country branch is trimmed.
 */
export const inflationCellCaption = (useCountryProfile: boolean): string =>
  (useCountryProfile ? "Inflation Profile" : "Inflation Profile [%]");

/**
 * `txt_…_CardBody_Fields_CountryInflationProfile_1.Value` (L2022-2038): the country name — for
 * Italy `" Italy - " & <bare region>` (leading space kept) — or `Text(Inflation Profile, "#0.00 ")`
 * (its trailing space kept).
 */
export function inflationCell(
  c: Pick<StoredRevenueContract, "useCountryInflationProfile" | "inflationProfile">,
  country: string | null, region: string | null,
): string {
  if (c.useCountryInflationProfile) {
    return country === "Italy" ? ` Italy - ${bareRegion(region)}` : (country ?? "");
  }
  return `${(c.inflationProfile ?? 0).toFixed(2)} `;
}

/** The Area cell: Visible `And(Country.Name = "Italy", ThisItem.'Use Country Inflation Profile')` (L2544). */
export const showsAreaCell = (country: string | null, c: Pick<StoredRevenueContract, "useCountryInflationProfile">): boolean =>
  country === "Italy" && c.useCountryInflationProfile;

/* ═══════════════════════════════════════════════════════════ contract card gallery ════ */

/*
 * D33 V6 (product owner 20 Oct 2026): the contracts are the canvas card gallery again
 * (`gal_ProjectRevenues_DisplayProjectBodyRightContent_GridContracts_1`, Y:795-2953), not a table.
 * One card per contract, `Sort(colProjectRevenueContracts, 'Created On', Ascending)`
 * (`sortContracts`); each card has a header (`Label & " - " & Description` and the fold chevron),
 * then, unless folded, its own Edit / Delete bar (`pcf_ProjectRevenues_Content_ContractCommandBar_3`)
 * and the field tiles of `con_…_CardBody_Fields_6` in canvas order.
 */

const CARD_FIELDS = "ProjectRevenues_DisplayProjectBodyRightContent_GridContracts_CardBody_Fields";
const CARD_HEADER = "ProjectRevenues_DisplayProjectBodyRightContent_GridContracts_CardHeader";

/** The card controls' canvas names (`data-testid` stems; each card appends `-${contract.id}`). */
export const CONTRACT_CARD_CONTROL = {
  gallery: "gal_ProjectRevenues_DisplayProjectBodyRightContent_GridContracts_1",
  card: "con_ProjectRevenues_DisplayProjectBodyRightContent_GridContracts_Card_1",
  header: `con_${CARD_HEADER}_1`,
  headerLabel: `lbl_${CARD_HEADER}_LabelWithDescription_1`,
  /** `Icon.ChevronUp`, `Visible: !ThisItem.IsFolded`. */
  foldUp: `ico_${CARD_HEADER}_Up_1`,
  /** `Icon.ChevronUp` with `Rotation: 180`, `Visible: ThisItem.IsFolded`. */
  foldDown: `ico_${CARD_HEADER}_Up_2`,
  body: `con_${CARD_FIELDS}_6`,
  commandBar: "pcf_ProjectRevenues_Content_ContractCommandBar_3",
} as const;

/** How a card value is coloured: `FontColor` themePrimary, with or without `FontItalic`. */
export type CardTone = "plain" | "blue" | "standard";

export interface CardFieldValue {
  /** The `TextInput` (View mode) control name — `data-testid` stem. */
  control: string;
  /** Its canvas `AccessibleLabel`, verbatim (rule 16). */
  accessibleLabel: string;
  text: string;
  tone: CardTone;
}

export interface CardField {
  key: string;
  /** The tile's `GroupContainer` name. */
  container: string;
  /** The caption `Label` name. */
  labelControl: string;
  caption: string;
  values: CardFieldValue[];
}

export interface ContractCardContext {
  country: string | null;
  technology: string;
  /** `LookUp(Currencies, 'Currency Code' = If(Poland, "PLN", "EUR")).'Currency Name'`. */
  currencyName: string | null;
  /** `locAreaWithRegion` — the Italian inflation region. */
  region: string | null;
  /** The user's language (default en-US): card numbers follow its separators (`Text(n, fmt, Language())`). */
  language?: Lang;
}

/** `ThisItem.Label & " - " & ThisItem.Description` (`lbl_…_CardHeader_LabelWithDescription_1.Text`, Y:2840). */
export const contractCardTitle = (c: Pick<StoredRevenueContract, "label" | "description">): string =>
  `${revenueLabelText(c.label) ?? ""} - ${c.description}`;

/**
 * `lbl_…_CardBody_Fields_TarifPrice_1.Text` (Y:2438-2449) — verbatim formula: Poland
 * "Tariff / Price [PLN/MWh]", else `$"Tariff / Price {If(<German wind FiT>, "p50")} [EUR/MWh]"`,
 * whose blank branch leaves TWO spaces ("Tariff / Price  [EUR/MWh]"; HTML shows one). It differs
 * from the panel caption (`tariffPriceCaption`).
 */
export const cardTariffPriceCaption = (country: string | null, p50: boolean): string =>
  country === "Poland" ? "Tariff / Price [PLN/MWh]" : `Tariff / Price ${p50 ? "p50" : ""} [EUR/MWh]`;

/** `n & " year"` for 0 or 1, else `" years"`; blank stays blank (Y:1755-1761, 1799-1808). */
const cardDurationPart = (n: number | null, one: string, many: string): string =>
  n === null ? "" : `${n}${n === 0 || n === 1 ? one : many}`;

const cardTone = (blue: boolean, italic: boolean): CardTone => (!blue ? "plain" : italic ? "standard" : "blue");

/**
 * The visible field tiles of one contract card, in canvas order, with each tile's `Visible`,
 * caption, value format and `FontColor` / `FontItalic` (Y:1550-2752). "blue" is
 * `ColorValue(gblAppTheme.palette.themePrimary)`; "standard" adds `FontItalic: true`.
 *
 * CORRECTED (D35, rule 20): Tariff / Price, its p90, Area, Inflation Profile and Hedged Volume Type
 * were blue only here (D33 read them as "no italic"); their canvas `txt_…` TextInputs DO set
 * `FontItalic` on the same flag (e.g. `txt_…_TarifPrice_1`, Y:2453-2454), so they are the full pair.
 *
 * Reproduced as the canvas has them (rules 7/8; no fix was asked for):
 *  - the Currency value is always blue AND italic (`FontColor: themePrimary`, `FontItalic: =true`,
 *    no condition);
 *  - the Area value is blue when the TARIFF P90 flag is standard (a canvas copy-paste);
 *  - the Hedged Volume Type value (`txt_…_HedgedVolume_2`) carries the AccessibleLabel of the
 *    Hedged Volume value (`txt_…_HedgedVolume_1`).
 */
export function contractCardFields(c: StoredRevenueContract, ctx: ContractCardContext): CardField[] {
  const label = revenueLabelText(c.label);
  const germany = ctx.country === "Germany";
  const fit = germany && label === "FiT";
  const fitNotPv = fit && ctx.technology !== "PV";
  const fitWind = fit && ctx.technology === "Wind";
  const f = c.flags;
  const hedge = c.hedgeType === null ? null : hedgeTypeFromValue(c.hedgeType);
  const field = (
    key: string, name: string, caption: string, values: CardFieldValue[], labelName = name,
  ): CardField => ({
    key, container: `con_${CARD_FIELDS}_${name}`, labelControl: `lbl_${CARD_FIELDS}_${labelName}`, caption, values,
  });
  const value = (name: string, text: string, tone: CardTone, accessible = name): CardFieldValue => ({
    control: `txt_${CARD_FIELDS}_${name}`, accessibleLabel: `txt_${CARD_FIELDS}_${accessible}`, text, tone,
  });
  const out: CardField[] = [];

  out.push(field("currency", "Currency_1", REVENUE_FORM_LABEL.currency,
    [value("Currency_1", ctx.currencyName ?? c.currencyName ?? "", "standard")]));
  out.push(field("contractStartDate", "ContractStartDate_1", REVENUE_FORM_LABEL.contractStartDate,
    [value("ContractStartDate_1", fmtCardDate(c.contractStartDate), cardTone(f.contractStartDate, true))]));
  const durationTone = cardTone(f.contractDurationYears && f.contractDurationMonths, true);
  out.push(field("contractDuration", "ContractDuration_1", REVENUE_FORM_LABEL.contractDuration, [
    value("ContractDurationYears_1", cardDurationPart(c.contractDurationYears, " year", " years"), durationTone),
    value("ContractDurationMonths_1", cardDurationPart(c.contractDurationMonths, " month", " months"), durationTone),
  ]));
  out.push(field("contractEndDate", "ContractEndDate_1", REVENUE_FORM_LABEL.contractEndDate,
    [value("ContractEndDate_1", fmtCardDate(c.contractEndDate), cardTone(f.contractEndDate, true))]));
  if (fitNotPv) {
    out.push(field("biddingPrice", "BiddingPrice_1", SCREEN_LABEL.biddingPrice,
      [value("BiddingPrice_1", fmtPrice(c.biddingPrice, ctx.language), cardTone(f.biddingPrice, true))]));
  }
  // `Text(Blank(), "#0.00 ")` is "": a contract with no custom profile value shows nothing.
  const inflationText = c.useCountryInflationProfile || c.inflationProfile !== null
    ? inflationCell(c, ctx.country, ctx.region) : "";
  out.push(field("inflationProfile", "CountryInflationProfile_1", inflationCellCaption(c.useCountryInflationProfile),
    [value("CountryInflationProfile_1", inflationText, cardTone(f.customInflationProfile, true))]));
  if (germany && c.useInflationProfile) {
    out.push(field("inflationStartYear", "InflationStartYear_1", REVENUE_FORM_LABEL.inflationStartYear,
      [value("InflationStartYear_1", c.inflationStartYear === null ? "" : String(c.inflationStartYear), "plain")]));
  }
  if (fitNotPv) {
    out.push(field("siteQuality", "SiteQuality_1", siteQualityCaption(fitWind),
      [value("SiteQuality_1", fmtSiteQualityCell(c.siteQuality, ctx.language), "plain")]));
  }
  if (fitWind) {
    out.push(field("siteQualityP90", "SiteQuality_p90", SCREEN_LABEL.siteQualityP90,
      [value("SiteQuality_p90", fmtSiteQualityCell(c.siteQualityP90, ctx.language), "plain")]));
  }
  if (fitNotPv) {
    out.push(field("correctionFactor", "CorrectionFactor_1", correctionFactorCaption(fitWind),
      [value("CorrectionFactor_1", c.correctionFactor === null ? "" : c.correctionFactor.toFixed(3),
        cardTone(f.correctionFactor, true))]));
  }
  if (fitWind) {
    out.push(field("correctionFactorP90", "CorrectionFactor_p90", SCREEN_LABEL.correctionFactorP90,
      [value("CorrectionFactor_p90", c.correctionFactorP90 === null ? "" : c.correctionFactorP90.toFixed(3),
        cardTone(f.correctionFactorP90, true))]));
  }
  out.push(field("tariffPrice", "TarifPrice_1", cardTariffPriceCaption(ctx.country, fitWind),
    [value("TarifPrice_1", fmtTariffCell(c.tariffPrice, ctx.language), cardTone(f.tariffPrice, true))]));
  if (fitWind) {
    out.push(field("tariffPriceP90", "TarifPrice_p90", tariffPriceP90Caption(ctx.country),
      [value("TarifPrice_p90", fmtTariffCell(c.tariffPriceP90, ctx.language), cardTone(f.tariffPriceP90, true))]));
  }
  if (showsAreaCell(ctx.country, c)) {
    out.push(field("area", "Area", SCREEN_LABEL.area,
      [value("Area", c.inflationCountryArea ?? "", cardTone(f.tariffPriceP90, true))]));
  }
  out.push(field("hedgedVolumeType", "HedgedType", SCREEN_LABEL.hedgedVolumeType,
    [value("HedgedVolume_2", hedge === null ? "" : HEDGE_TYPE_LABEL[hedge], cardTone(f.hedgedVolume, true), "HedgedVolume_1")],
    "HedgedVolume_2"));
  if (hedge === "percentage" || hedge === "fixed") {
    out.push(field("hedgedVolume", "HedgedVolume_1", SCREEN_LABEL.hedgedVolume,
      [value("HedgedVolume_1", fmtHedgeCell(c, ctx.language), cardTone(f.hedgedVolume && hedge === "percentage", true))]));
  }
  return out;
}

/**
 * The fold chevrons' `OnSelect` (Y:2864-2878, 2910-2924) flip the card's `IsFolded` (and make the
 * card the selected contract — the caller does that). Every card starts unfolded
 * (`AddColumns(…, IsFolded, false)` in `OnVisible`, Y:77-86).
 */
export function toggleContractFold(folded: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(folded);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}

/** After a save the card is put back with `IsFolded: false` (Y:5000-5016). */
export function unfoldContract(folded: ReadonlySet<string>, id: string | null | undefined): Set<string> {
  const next = new Set(folded);
  if (id) next.delete(id);
  return next;
}

/** `Sort(colProjectRevenueContracts, 'Created On', SortOrder.Ascending)` (L819). */
export const sortContracts = (rows: readonly StoredRevenueContract[]): StoredRevenueContract[] =>
  [...rows].sort((a, b) => a.createdOn.localeCompare(b.createdOn));

/** `Sort(colProjectBalancingPriceContracts, 'Created On', SortOrder.Ascending)` (L3257). */
export const sortPeriods = (rows: readonly BalancingPeriod[]): BalancingPeriod[] =>
  [...rows].sort((a, b) => a.createdOn.localeCompare(b.createdOn));

/* ═══════════════════════════════════════════════════════════ screen captions ═══ */

/**
 * The screen's remaining visible strings, transcribed from `Project Revenues Screen.pa.yaml`
 * (CONVENTIONS rule 7). Each cites the canvas `Control.Property` it came from.
 */
export const SCREEN_LABEL = {
  /** `lbl_ProjectRevenues_DisplayProjectBodyRightContent_GridContracts_CardHeader_LabelWithDescription_3.Text` — verbatim. */
  heading: "Revenue",
  /** `btn_Revenue_AddContract.Text` — verbatim. */
  addContract: "Add Contract",
  /** `btn_Revenue_AddBlancing_Price.Text` — verbatim. */
  addBalancingPrice: "Add Balancing Price",
  /** `pcf_ProjectRevenues_Content_ContractCommandBar_3.Items` `editRevenueContract.ItemDisplayName` — verbatim. */
  edit: "Edit",
  /** `pcf_ProjectRevenues_Content_ContractCommandBar_3.Items` `deleteRevenueContract.ItemDisplayName` — verbatim. */
  delete: "Delete",
  /** `lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage.Text` — verbatim. */
  balancingClusterGate: "Balancing prices can be managed when the project has reached Cluster 4",
  /** `lbl_Admin_Cost_Landlease_ApplyToLandlease_ApplyTag_Info_2.Text` — verbatim. */
  balancingEmptyInfo:
    "Use balancing costs only if a contract with the direct marketer exists for a given period. Otherwise and for other periods, global assumptions will be applied.",
  /** `lbl_ProjectBalancingPrice_Name.Text` — verbatim. */
  name: "Name",
  /** `lbl_ProjectBalancingPrice_ShiftOfCOD_Date_Months.Text` and `lbl_…_BodyContent_Currency_2.Text` — verbatim. */
  shiftFromCod: "Shift from COD Date [Months]",
  /** `lbl_ProjectBalancingPrice_StartDate_Balancing_Contract.Text` and `lbl_…_ContractStartDate_2.Text` — verbatim. */
  startDate: "Start Date",
  /** `lbl_ProjectBalancingPrice_EndDate_Balancing_Contract.Text` and `lbl_…_ContractEndDate_2.Text` — verbatim. */
  endDate: "End Date",
  /** `lbl_ProjectBalancingPrice_Action.Text` — verbatim. */
  actions: "Actions",
  /** `lbl_ProjectRevenues_RightPanel_NewEditCost_BodyContent_Label_1.Text` — verbatim. */
  type: "Type",
  /** `lbl_ProjectRevenues_RightPanel_NewEditCost_BodyContent_Description_1.Text` — verbatim (trailing newline trimmed). */
  description: "Description",
  /** `lbl_ProjectRevenues_DisplayProjectBodyRightContent_GridContracts_CardBody_Fields_BiddingPrice_1.Text` — verbatim. */
  biddingPrice: "Bidding Price",
  /** `lbl_ProjectRevenues_RightPanel_NewEditCost_BodyContent_SiteQuality_p90.Text` — verbatim. */
  siteQualityP90: "Site Quality p90",
  /** `lbl_ProjectRevenues_RightPanel_NewEditCost_BodyContent_CorrectionFactor_p90.Text` — verbatim. */
  correctionFactorP90: "Correction Factor p90",
  /** `lbl_ProjectRevenues_DisplayProjectBodyRightContent_GridContracts_CardBody_Fields_Area.Text` — verbatim. */
  area: "Area",
  /** `lbl_ProjectRevenues_DisplayProjectBodyRightContent_GridContracts_CardBody_Fields_HedgedVolume_2.Text` — verbatim. */
  hedgedVolumeType: "Hedged Volume Type",
  /** `lbl_ProjectRevenues_DisplayProjectBodyRightContent_GridContracts_CardBody_Fields_HedgedVolume_1.Text` — verbatim. */
  hedgedVolume: "Hedged Volume",
  /** `lbl_ProjectRevenue_RightPanel_IndividualVolume_Header.Text` — verbatim. */
  individualVolume: "Individual Volume [MWh]",
  /** `ico_SetCODDate_RightPanelRevenue_1.Tooltip` — verbatim. */
  resetToCod: "Reset to current project COD date.",
  /** `lbl_ProjectRevenues_RightPanel_NewEditCost_BodyContent_Description_ErrorMessage_1.Text` — verbatim. */
  standardOnlyPrefilled: "Standard is applicable only for system-prefilled contracts.",
  /** `ico_SyncNegativePrice_RightPanelRevenue.Tooltip`, first branch — verbatim. */
  negativePriceSyncOff:
    "Any change of this option will remove the sync to the input from Production tab.",
  /** `ico_SyncNegativePrice_RightPanelRevenue.Tooltip`, second branch — verbatim. */
  negativePriceSyncOn: "Sync with input from Production tab.",
  /**
   * `con_Main_Project_Overview_Header_SuitBar_CommandBar_1.Tooltip` — verbatim (sic: a copy-paste
   * from the overview screen, kept per rule 7; the balancing row's Edit / Delete bar).
   */
  balancingRowTooltip: "Home screen navigation",
} as const;

/** The three confirmation pop-ups and the hedge information pop-up. */
export const DIALOG = {
  /** `cmp_ProjectRevenues_PopUp_Confirmation_DeleteContract.Title` — verbatim. */
  deleteContractTitle: "Delete revenue contract?",
  /** `cmp_ProjectRevenues_PopUp_Confirmation_DeleteContract_1.Title` — verbatim. */
  deleteBalancingTitle: "Delete balancing price",
  /** `cmp_PopUp_Confirmation_PopUp_AddEdit_Individual_Volume.Title` — verbatim. */
  individualVolumesTitle: "Confirm Individual Volumes",
  /** `cmp_ProjectRevenues_PopUp_Information.Title` — verbatim. */
  hedgeOver100Title: "Hedged Volume more than 100%",
  /** `cmp_…_DeleteContract{,_1}.ConfirmButtonText` — verbatim. */
  deleteConfirm: "Delete",
  /** `cmp_PopUp_Confirmation_PopUp_AddEdit_Individual_Volume.ConfirmButtonText` — verbatim. */
  confirm: "Confirm",
  /** `CancelButtonText` on all three confirmations — verbatim. */
  cancel: "Cancel",
} as const;

/** `cmp_ProjectRevenues_PopUp_Confirmation_DeleteContract.Description` — verbatim formula. */
export const deleteContractDescription = (label: string | null, description: string): string =>
  `Are you sure you want to delete revenue contract "${label ?? ""}-${description}"?`;

/** `cmp_ProjectRevenues_PopUp_Confirmation_DeleteContract_1.Description` — verbatim formula. */
export const deleteBalancingDescription = (name: string): string =>
  `Are you sure you want to delete "${name}"?`;

/** `lbl_ProjectRevenues_RightPanel_NewEditCost_BodyHeader_1.Text` — verbatim formula. */
export const contractPanelTitle = (isNew: boolean): string =>
  isNew ? "Add Revenue Contract" : "Edit Revenue Contract";

/** `lbl_ProjectRevenues_RightPanel_NewEditCost_BodyHeader_2.Text` — verbatim formula. */
export const balancingPanelTitle = (isNew: boolean): string =>
  `${isNew ? "Add" : "Edit"} balancing price`;

/** `If(Country.Name = "Poland", "PLN", "EUR")`, as every price caption on this screen spells it. */
const priceCurrency = (country: string | null): string => (country === "Poland" ? "PLN" : "EUR");

/** `lbl_ProjectRevenues_RightPanel_NewEditCost_BodyContent_TariffPrice_1.Text` — verbatim formula. */
export const tariffPriceCaption = (country: string | null, p50: boolean): string =>
  `Tariff / Price${p50 ? " p50" : ""} [${priceCurrency(country)}/MWh]`;

/** `lbl_ProjectRevenues_RightPanel_NewEditCost_BodyContent_TariffPrice_p90.Text` — verbatim formula. */
export const tariffPriceP90Caption = (country: string | null): string =>
  `Tariff / Price p90 [${priceCurrency(country)}/MWh]`;

/**
 * `lbl_ProjectRevenues_RightPanel_NewEditCost_BodyContent_SiteQuality_1.Text` — verbatim
 * formula (`"Site Quality " & If(…, "p50")`; the trailing space of the blank branch trimmed).
 */
export const siteQualityCaption = (p50: boolean): string => (p50 ? "Site Quality p50" : "Site Quality");

/** `lbl_ProjectRevenues_RightPanel_NewEditCost_BodyContent_CorrectionFactor_1.Text` — as above. */
export const correctionFactorCaption = (p50: boolean): string =>
  (p50 ? "Correction Factor p50" : "Correction Factor");

/** `lbl_ProjectRevenues_RightPanel_NewEditCost_BodyContent_BiddingPrice_1.Text` — verbatim formula. */
export const biddingPriceCaption = (isoCurrencyCode: string | null | undefined): string =>
  `Bidding Price [${isoCurrencyCode ? `${isoCurrencyCode}/MWh` : "EUR/MWh"}]`;

/** `lbl_ProjectBalancingPrice_Balancing_Price.Text` / `lbl_…_BiddingPrice_2.Text` — verbatim formula. */
export const balancingPriceCaption = (country: string | null): string =>
  `Balancing Price [${priceCurrency(country)}/MWh]`;

/** `lbl_ProjectRevenues_RightPanel_NewEditCost_BodyContent_InflationProfile_1.Text` — verbatim formula. */
export const inflationProfileFieldCaption = (countryProfile: boolean): string =>
  (countryProfile ? "Country Inflation Profile" : "Custom Inflation Profile [%]");

/** `drp_…_ContractDuration_Years_1.Items` `Name` — `n & If(n <= 1, " year", " years")`. */
export const contractYearsOption = (n: number): string => `${n}${n <= 1 ? " year" : " years"}`;

/** `drp_…_ContractDuration_Months_1.Items` `Name` — `n & If(n <= 1, " month", " months")`. */
export const contractMonthsOption = (n: number): string => `${n}${n <= 1 ? " month" : " months"}`;

/** `colYearsForBalancingPriceDuration` `Name` — `n & " " & If(n > 1, "Years", "Year")`. */
export const balancingYearsOption = (n: number): string => `${n} ${n > 1 ? "Years" : "Year"}`;

/** `drp_…_ContractDuration_Months_2.Items` `Name` — `n & " " & If(n > 1, "Months", "Month")`. */
export const balancingMonthsOption = (n: number): string => `${n} ${n > 1 ? "Months" : "Month"}`;

/** `Label5_10.Text` — the balancing grid's duration cell, verbatim formula. */
export function balancingDurationText(years: number | null, months: number | null): string {
  const y = years ?? 0;
  const m = months ?? 0;
  return `${y} ${y === 0 || y === 1 ? "Year" : "Years"} ${m} ${m === 0 || m === 1 ? "Month" : "Months"}`;
}

/** `Label5_8.Text` — `Coalesce(Text(ThisItem.'Shift of COD Date [Months]'), "-")`. */
export const shiftOfCodCell = (v: number | null): string => (v === null ? "-" : String(v));

/* ═══════════════════════════════════════════════════════════════ NEW texts ═════ */

/**
 * NEW — no canvas equivalent. The load-error state (CONVENTIONS rule 19), the Fabric notice
 * (D2: `Assumptions Revenues SQL` is a Fabric SQL source, not connected) and the plan refusals.
 */
export const REVENUE_SCREEN_TEXT = {
  loadFailedTitle: "Revenue data is unavailable",
  loadFailedDescription: "The revenue contracts or balancing prices of this project could not be loaded. Reload the page to try again.",
  assumptionsNotConnected:
    "The standard revenue assumptions come from Fabric SQL (Assumptions Revenues SQL), which is not connected yet. Enter the values by hand.",
  noProject: "The project is not loaded.",
  noSubaccount: "No Revenue Subaccount exists.",
  noCurrency: "The contract currency could not be found.",
} as const;

/* ═══════════════════════════════════════════════════════════════ columns ═══════ */

/** `Projects` columns this screen reads (verified against `Vsb_projectsModel`). */
export const PROJECT_COL = {
  id: "vsb_projectid",
  projectIdText: "vsb_name",
  projectName: "vsb_projectname",
  country: "_vsb_country_value",
  countryArea: "_vsb_countryarea_value",
  technology: "vsb_technology",
  totalCapacity: "vsb_totalcapacity",
  netYieldP50: "vsb_netyieldp50",
  endDate: "vsb_enddate",
  cod: "vsb_operationsstartdatecod",
  fid: "vsb_finalinvestmentdecision",
  construction: "vsb_construction",
  legallyBindingPermits: "vsb_legallybindingpermits",
  applicationSubmitted: "vsb_applicationsubmitted",
  projectDevelopmentStarted: "vsb_projectdevelopmentstarted",
  feasibilityStudies: "vsb_feasibilitystudies",
  clusterState: "_vsb_clusterstate_value",
  owningBusinessUnit: "_owningbusinessunit_value",
} as const;

/** `Project Revenues` columns (verified against `Vsb_projectrevenuesModel`, D33). */
export const REVENUE_COL = {
  id: "vsb_projectrevenueid",
  name: "vsb_name",
  project: "_vsb_project_value",
  description: "vsb_description",
  label: "vsb_label",
  currency: "_vsb_currency_value",
  subaccount: "_vsb_subaccount_value",
  tariffPrice: "vsb_tariffprice",
  tariffPriceP90: "vsb_tariffpricep90",
  biddingPrice: "vsb_biddingprice",
  siteQuality: "vsb_sitequality",
  siteQualityP90: "vsb_sitequalityp90",
  correctionFactor: "vsb_correctionfactor",
  correctionFactorP90: "vsb_correctionfactorp90",
  contractStartDate: "vsb_contractstartdate",
  contractEndDate: "vsb_contractenddate",
  contractDurationYears: "vsb_contractdurationyears",
  contractDurationMonths: "vsb_contractdurationmonths",
  hedgeType: "vsb_hedgetype",
  hedgedVolume: "vsb_hedgedvolume",
  fixedContractedMwhPa: "vsb_fixedcontractedmwhpa",
  useInflationProfile: "vsb_useinflationprofile",
  useCountryInflationProfile: "vsb_usecountryinflationprofile",
  inflationProfile: "vsb_inflationprofile",
  inflationStartYear: "vsb_inflationstartyear",
  inflationCountryArea: "vsb_inflationcountryarea",
  considerNegativePrices: "vsb_considernegativeprices",
  negativePriceManualOverride: "vsb_negativepricemanualoverride",
  createdOn: "createdon",
} as const;

/** The fourteen persisted `Is … Standard Assumption?` columns (rule 25). */
export const FLAG_COL: Record<keyof StandardFlags, string> = {
  biddingPrice: "vsb_isbiddingpricestandardassumption",
  contractDurationYears: "vsb_iscontractdurationyearsstandardassumption",
  contractDurationMonths: "vsb_iscontractdurationmonthsstandardassumption",
  contractStartDate: "vsb_iscontractstartdatestandardassumption",
  contractEndDate: "vsb_iscontractenddatestandardassumption",
  tariffPrice: "vsb_istarrifpricestandardassumption",
  tariffPriceP90: "vsb_istarrifpricep90standardassumption",
  useInflationProfile: "vsb_isinflationprofilestandardassumption",
  useCustomInflation: "vsb_isusecustominflationstandardassumption",
  inflationProfileYear: "vsb_isinflationprofileyearstandardassumption",
  customInflationProfile: "vsb_iscustominflationprofilestandardassumption",
  hedgedVolume: "vsb_ishedgedvolumestandardassumption",
  correctionFactor: "vsb_iscorrectionfactorstandardassumption",
  correctionFactorP90: "vsb_iscorrectionfactorp90standardassumption",
};

/** `Balancing Prices` columns (verified against `Vsb_balancingpricesModel`, D33). */
export const BALANCING_COL = {
  id: "vsb_balancingpriceid",
  name: "vsb_name",
  project: "_vsb_project_value",
  periods: "vsb_periods",
  price: "vsb_balancingpriceeurpln",
  startDate: "vsb_startdatebalancingcontract",
  endDate: "vsb_enddatebalancingcontract",
  durationYears: "vsb_contractdurationyear",
  durationMonths: "vsb_contractdurationmonth",
  shiftOfCod: "vsb_shiftofcoddatemonths",
  createdOn: "createdon",
} as const;

/** `RevenueIndividualHedgeVolumes` columns (verified against `Vsb_revenueindividualhedgevolumesModel`, D33). */
export const HEDGE_VOLUME_COL = {
  id: "vsb_revenueindividualhedgevolumeid",
  contract: "_vsb_revenuecontract_value",
  year: "vsb_year",
  startDate: "vsb_startdate",
  endDate: "vsb_enddate",
  value: "vsb_individualcontractedmwhpa",
} as const;

/** Navigation properties of the binds (`…@odata.bind`), from the generated models. */
const NAV = {
  project: "vsb_Project",
  subaccount: "vsb_Subaccount",
  currency: "vsb_Currency",
  revenueContract: "vsb_RevenueContract",
  owningBusinessUnit: "owningbusinessunit",
} as const;

/* ═════════════════════════════════════════════════════════════ write plans ═════ */

const ownerBind = (businessUnitId: string | null): Record<string, string> =>
  businessUnitId ? { [`${NAV.owningBusinessUnit}@odata.bind`]: bind("businessunits", businessUnitId) } : {};

const ymdOrNull = (d: Date | null): string | null => (d ? dateOnly(d) : null);

/** The `Patch('Project Revenues', …)` record (L4806-4995), as Dataverse columns. */
export function revenueContractRecord(
  payload: RevenueSavePayload, project: RevenueProject, currencyId: string,
): Record<string, unknown> {
  const flags: Record<string, boolean> = {};
  ALL_STANDARD_FLAG_KEYS.forEach((k) => { flags[FLAG_COL[k]] = payload.flags[k]; });
  return {
    [REVENUE_COL.name]: payload.name,
    [`${NAV.project}@odata.bind`]: bind(ES.projects, project.id),
    ...(payload.subaccountId ? { [`${NAV.subaccount}@odata.bind`]: bind(ES.revenueSubaccounts, payload.subaccountId) } : {}),
    [REVENUE_COL.label]: payload.label,
    [REVENUE_COL.description]: payload.description,
    [`${NAV.currency}@odata.bind`]: bind(ES.currencies, currencyId),
    [REVENUE_COL.biddingPrice]: payload.biddingPrice,
    [REVENUE_COL.siteQuality]: payload.siteQuality,
    [REVENUE_COL.siteQualityP90]: payload.siteQualityP90,
    [REVENUE_COL.correctionFactor]: payload.correctionFactor,
    [REVENUE_COL.correctionFactorP90]: payload.correctionFactorP90,
    [REVENUE_COL.tariffPrice]: payload.tariffPrice,
    [REVENUE_COL.tariffPriceP90]: payload.tariffPriceP90,
    [REVENUE_COL.contractStartDate]: ymdOrNull(payload.contractStartDate),
    [REVENUE_COL.contractDurationYears]: payload.contractDurationYears,
    [REVENUE_COL.contractDurationMonths]: payload.contractDurationMonths,
    [REVENUE_COL.contractEndDate]: ymdOrNull(payload.contractEndDate),
    [REVENUE_COL.useInflationProfile]: payload.useInflationProfile,
    [REVENUE_COL.inflationStartYear]: payload.inflationStartYear,
    [REVENUE_COL.useCountryInflationProfile]: payload.useCountryInflationProfile,
    [REVENUE_COL.inflationCountryArea]: payload.inflationCountryArea,
    [REVENUE_COL.inflationProfile]: payload.inflationProfile,
    ...ownerBind(payload.owningBusinessUnitId),
    ...flags,
    [REVENUE_COL.considerNegativePrices]: payload.considerNegativePrices,
    [REVENUE_COL.negativePriceManualOverride]: payload.negativePriceManualOverride,
    [REVENUE_COL.hedgeType]: payload.hedgeType,
    [REVENUE_COL.hedgedVolume]: payload.hedgedVolume,
    [REVENUE_COL.fixedContractedMwhPa]: payload.fixedContractedMwhPa,
  };
}

export interface SaveContractInput {
  form: RevenueFormState;
  project: RevenueProject | null;
  /** `drp_…_Currency_1.Selected` — the `transactioncurrencyid` of the contract currency. */
  currencyId: string | null;
  /** The contract's stored `RevenueIndividualHedgeVolumes` ids, read when the save starts. */
  storedVolumeIds: readonly string[];
  /** `buildStandardFlags` (default) or its canvas twin. */
  flags?: (form: RevenueFormState) => StandardFlags;
  language?: Lang;
}

/**
 * The contract Save (`btn_ProjectRevenue_AddEdit_SaveFunctionality`, L4699-5114), in canvas order:
 *  1. the contract upsert (create, or update of the edited row);
 *  2. `RemoveIf(RevenueIndividualHedgeVolumes, RevenueContract = <contract>)` — for EVERY hedge type;
 *  3. for Individual Volumes, one create per row `{Year, RevenueContract, StartDate, EndDate,
 *     'Owning Business Unit', IndividualContractedmwhpa}`.
 * A new contract's volumes bind the contract the plan's first write creates.
 */
export function planSaveContract(input: SaveContractInput): WritePlan {
  const { form, project, currencyId } = input;
  const lang = input.language ?? "en-US";
  if (!project?.id) return refusePlan(REVENUE_SCREEN_TEXT.noProject);
  if (!form.subaccountId) return refusePlan(REVENUE_SCREEN_TEXT.noSubaccount);
  if (!currencyId) return refusePlan(REVENUE_SCREEN_TEXT.noCurrency);
  const payload = buildRevenuePayload(form, project, (input.flags ?? buildStandardFlags)(form), lang);
  const data = revenueContractRecord(payload, project, currencyId);
  const editId = form.mode === "Edit" ? form.contractId : null;
  const plan: WritePlan = { writes: [], log: [] };
  plan.writes.push(editId
    ? { op: "update", entitySet: ES_FINANCE.projectRevenues, id: editId, data, reason: "save the revenue contract" }
    : { op: "create", entitySet: ES_FINANCE.projectRevenues, data, reason: "create the revenue contract" });
  if (editId) {
    input.storedVolumeIds.forEach((id) => plan.writes.push({
      op: "delete", entitySet: ES_FINANCE.revenueIndividualHedgeVolumes, id,
      reason: "remove the contract's individual hedge volumes",
    }));
  }
  const contractRef = bind(ES_FINANCE.projectRevenues, editId ?? createdRowRef(0));
  payload.individualVolumes.forEach((row) => plan.writes.push({
    op: "create",
    entitySet: ES_FINANCE.revenueIndividualHedgeVolumes,
    data: {
      [HEDGE_VOLUME_COL.year]: row.year,
      [`${NAV.revenueContract}@odata.bind`]: contractRef,
      [HEDGE_VOLUME_COL.startDate]: dateOnly(row.startDate),
      [HEDGE_VOLUME_COL.endDate]: dateOnly(row.endDate),
      ...ownerBind(project.owningBusinessUnitId),
      [HEDGE_VOLUME_COL.value]: valueOf(row.value, lang),
    },
    reason: `create the individual hedge volume ${row.year}`,
  }));
  return plan;
}

/**
 * The contract Delete (`cmp_ProjectRevenues_PopUp_Confirmation_DeleteContract.OnConfirm`): one
 * delete of the contract. The canvas then runs `RemoveIf(RevenueIndividualHedgeVolumes, …)`, but
 * the `vsb_projectrevenue` → `vsb_revenueindividualhedgevolume` relationship is `CascadeDelete:
 * Cascade` (`customizations.xml`), so Dataverse has already removed them; the app does not redo it.
 */
export function planDeleteContract(contract: StoredRevenueContract | null): WritePlan {
  if (!contract) return refusePlan(REVENUE_SCREEN_TEXT.noProject);
  return {
    writes: [{ op: "delete", entitySet: ES_FINANCE.projectRevenues, id: contract.id, reason: "delete the revenue contract" }],
    log: [],
  };
}

/** The balancing panel's inputs. */
export interface BalancingForm { id: string | null; price: string; years: number; months: number; shift: string }

/**
 * SOURCE DEFECT (D33): the balancing `Patch` (L4534-4595) writes no `'Owning Business Unit'`,
 * although the contract and its volumes bind the project's business unit, so a new period is owned
 * by the creating user's business unit and can be invisible to a colleague scoped to the project's
 * (CONVENTIONS rule 4). The create binds the project's business unit here; pass
 * `ownerCanvasParity: true` for the canvas behaviour. Updates never change the owner (the canvas
 * update does not either). Start and end dates are NOT written: the "Balancing-price period date
 * sync" plugin step (Create on `vsb_name, vsb_project`; Update on `vsb_shiftofcoddatemonths`)
 * computes them on the server.
 */
export function planSaveBalancing(input: {
  form: BalancingForm;
  periods: readonly BalancingPeriod[];
  project: RevenueProject | null;
  language?: Lang;
  ownerCanvasParity?: boolean;
}): WritePlan {
  const { form, periods, project } = input;
  const lang = input.language ?? "en-US";
  if (!project?.id) return refusePlan(REVENUE_SCREEN_TEXT.noProject);
  const editing = form.id ? periods.find((p) => p.id === form.id) ?? null : null;
  const count = periods.length;
  const index = count === 0 ? 1 : editing ? count : count + 1;
  const periodValue = count === 0 ? PERIOD_VALUES[0] : editing ? editing.periods : nextPeriodValue(count);
  const data: Record<string, unknown> = {
    [BALANCING_COL.name]: balancingPeriodName(index),
    [`${NAV.project}@odata.bind`]: bind(ES.projects, project.id),
    [BALANCING_COL.periods]: periodValue,
    [BALANCING_COL.shiftOfCod]: showsShiftOfCod(count, editing !== null) ? valueOf(form.shift, lang) : null,
    [BALANCING_COL.durationYears]: form.years,
    [BALANCING_COL.durationMonths]: form.months,
    [BALANCING_COL.price]: valueOf(form.price, lang),
  };
  if (editing) {
    return { writes: [{ op: "update", entitySet: ES_FINANCE.balancingPrices, id: editing.id, data, reason: "save the balancing price" }], log: [] };
  }
  return {
    writes: [{
      op: "create", entitySet: ES_FINANCE.balancingPrices,
      data: input.ownerCanvasParity ? data : { ...data, ...ownerBind(project.owningBusinessUnitId) },
      reason: "create the balancing price",
    }],
    log: [],
  };
}

/** `cmp_ProjectRevenues_PopUp_Confirmation_DeleteContract_1.OnConfirm` — `RemoveIf('Balancing Prices', …)`. */
export function planDeleteBalancing(period: BalancingPeriod | null): WritePlan {
  if (!period) return refusePlan(REVENUE_SCREEN_TEXT.noProject);
  return {
    writes: [{ op: "delete", entitySet: ES_FINANCE.balancingPrices, id: period.id, reason: "delete the balancing price" }],
    log: [],
  };
}

/* ══════════════════════════════════════════════════════════════════ jobs ═══════ */

/** The `cmp_ProjectRevenues_PopUp_Loading` texts (`locSpinnerInformationText`), verbatim. */
export const SPINNER = {
  /** `btn_ProjectRevenue_AddEdit_SaveFunctionality.OnSelect` / `pcf_…_Save_2.OnChange`. */
  saving: "Please wait, saving...",
  /** `btn_ProjectRevenue_AddEdit_SaveFunctionality.OnSelect`, the hedge check. */
  validatingHedge: "Validating Hedged Volume...",
  /** `cmp_ProjectRevenues_PopUp_Confirmation_DeleteContract.OnConfirm`. */
  deletingContract: "Deleting Contract...",
  /** `cmp_ProjectRevenues_PopUp_Confirmation_DeleteContract_1.OnConfirm`. */
  deleting: "Please wait, deleting...",
} as const;

/**
 * The save `Notify` (L5059, L4620): `"Error: Contract could not be saved correctly. " & "Internal
 * error: originated on " & FirstError.Source & ". Message: " & FirstError.Message & …`. The table
 * stands in for `FirstError.Source` (as D25).
 */
export const saveErrorText = (source: string) => (detail: string): string =>
  `Error: Contract could not be saved correctly. Internal error: originated on ${source}. Message: ${detail}`;

export const saveContractJob = (plan: () => Promise<WritePlan>): PlanJob => ({
  progress: SPINNER.saving,
  errorText: saveErrorText(ES_FINANCE.projectRevenues),
  plan,
});

export const deleteContractJob = (contract: StoredRevenueContract | null): PlanJob => ({
  progress: SPINNER.deletingContract,
  plan: planDeleteContract(contract),
});

export const saveBalancingJob = (plan: WritePlan): PlanJob => ({
  progress: SPINNER.saving,
  errorText: saveErrorText(ES_FINANCE.balancingPrices),
  plan,
});

export const deleteBalancingJob = (period: BalancingPeriod | null): PlanJob => ({
  progress: SPINNER.deleting,
  plan: planDeleteBalancing(period),
});

/**
 * A new contract's form (`btn_Revenue_AddContract.OnSelect`, L723-791): every field Reset, the
 * Type EMPTY — the standard-assumption engine runs only on the first Type selection
 * (`drp_…_Label_1.OnChange`). Corrected D33: the code pre-selected "PPA" and filled every field.
 * The hedge type starts at `'Hedged Volume [%]'`; the negative-price toggle off.
 */
export function newContractForm(project: RevenueProject, subaccountId: string | null): RevenueFormState {
  return {
    mode: "New", formDirty: false, contractId: null, subaccountId,
    revenueTypeLabel: null, description: "", currencyCode: revenueCurrencyCode(project.countryName),
    tariff: "", tariffP90: "", biddingPrice: "", siteQuality: "", siteQualityP90: "",
    correctionFactor: "", correctionFactorP90: "",
    startDate: null, endDate: null, durationYears: null, durationMonths: null,
    hedge: { type: "percentage", percentage: field(""), fixed: { ...field(""), initialState: true }, individual: [] },
    useInflation: false, useCountryInflationProfile: false, inflationProfile: "", inflationStartYear: "",
    considerNegativePrices: false, negativePriceManualOverride: false,
    isStandardContract: false,
    showsGermanFitBlock: false,
    technology: project.technology, country: project.countryName, netYieldP50: project.netYieldP50,
    std: NOTHING_STANDARD,
  };
}

/**
 * `drp_…_Label_1.OnChange` (L5436-7070) — the standard-assumption engine, once, over the
 * already-read rows. With `Assumptions Revenues SQL` not connected (D2) `rows` is empty, so
 * nothing is standard and every derived value is blank / 0 / today, as the canvas would show with
 * an empty source.
 *
 * Added D33: the standard Hedged Volume (`valuetype = "hedgedvolume"`), the country-inflation
 * re-lookup when the standard turns the country toggle on (L7006-7051, no Area term), the p90
 * tariff from the bidding price, and the per-field standardness the Save writes as flags.
 */
export function applyRevenueEngine(input: {
  project: RevenueProject;
  rows: readonly AssumptionRow[];
  region: string | null;
  label: string;
  productionExists: boolean;
  subaccountId: string | null;
  profiles: readonly CountryInflationProfileRow[];
  language?: Lang;
  today?: Date;
}): RevenueFormState {
  const { project, rows, region, label } = input;
  const lang = input.language ?? "en-US";
  const tech = project.technology;
  const exists = standardAssumptionExists(rows, tech, label);
  const change = subContractTypeChange(rows, tech, project);
  const start = contractStartDate(rows, tech, project, { standardAssumptionExists: exists, today: input.today });
  const dur = contractDuration(rows, tech, { standardAssumptionExists: exists, language: lang });
  const end = engineEndDate(start, dur.years, dur.months);
  const codYear = project.cod?.getFullYear() ?? (input.today ?? new Date()).getFullYear();
  const pricePool = pricePoolFor(rows, project.countryName, region);
  const price = priceForYear(pricePool, tech, codYear, lang);
  const priceP90 = p90Price(pricePool, tech, codYear, lang);
  const infl = inflation(rows, tech, project, { standardAssumptionExists: exists, language: lang });
  const neg = negativePriceState(rows, tech, label, input.productionExists);
  const shows = showsGermanFitBlock(project.countryName, label, tech);
  const cf = correctionFactorDefault();
  const hedge = standardHedgedVolume(rows, tech, exists);
  const tariff = shows ? germanFitTariff(price ?? 0, cf.value) : fmtPrice(price);
  const biddingPrice = shows ? fmtPrice(price) : "";
  const cfText = shows ? cf.value.toFixed(3) : "";
  const countryOn = infl.useCountryProfile.value;
  const inflationValue = countryOn
    ? countryInflationValue(input.profiles, project.countryCode, infl.startYear.value, region, false)
    : infl.customValue.value;
  return {
    mode: "New", formDirty: true, contractId: null,
    subaccountId: input.subaccountId,
    revenueTypeLabel: label,
    description: descriptionFor({
      country: project.countryName, region, revenueTypeLabel: label,
      standardAssumptionExists: exists, allValuesStandard: true, change,
    }),
    currencyCode: revenueCurrencyCode(project.countryName),
    tariff,
    tariffP90: tariffP90Text(project.countryName, label, biddingPrice, cfText, tariff, lang),
    biddingPrice,
    siteQuality: "", siteQualityP90: "",
    correctionFactor: cfText,
    correctionFactorP90: cfText,
    startDate: start.value, endDate: end,
    durationYears: dur.years.value, durationMonths: dur.months.value,
    hedge: {
      type: "percentage",
      percentage: hedge,
      fixed: { ...field(""), initialState: true },
      individual: [],
    },
    useInflation: infl.useInflation.value,
    useCountryInflationProfile: countryOn,
    // Audit 20 Oct 2026 (FIXED): `txt_…_InflationProfile_1.Value` is `Text(rec, "0.00")` and the
    // engine's custom value is `If(exists, …, 0)` — so a contract with no standard shows "0.00".
    inflationProfile: fmtTwoDecimals(inflationValue),
    inflationStartYear: infl.startYear.value ? String(infl.startYear.value) : "",
    considerNegativePrices: neg.toggleState,
    negativePriceManualOverride: neg.manualOverride,
    isStandardContract: exists,
    showsGermanFitBlock: shows,
    technology: tech, country: project.countryName, netYieldP50: project.netYieldP50,
    std: {
      contractStartDate: start.isStandard,
      contractEndDate: endDateIsStandard(start, dur.years, dur.months),
      contractDurationYears: dur.years.isStandard,
      contractDurationMonths: dur.months.isStandard,
      price: exists && price !== null,
      priceP90: exists && priceP90 !== null,
      biddingPrice: exists && price !== null,
      correctionFactor: cf.isStandard,
      correctionFactorP90: cf.isStandard,
      useInflation: infl.useInflation.isStandard,
      useCountryInflation: infl.useCountryProfile.isStandard,
      useCountryInflationStandardValue: countryOn,
      inflationStartYear: infl.startYear.isStandard,
      inflationValue: countryOn ? false : infl.customValue.isStandard,
      hedgedVolume: hedge.isStandard,
    },
  };
}

/** The edit command (L959-1497): the form rehydrated from the stored contract and its volumes. */
/**
 * A contract form with its numbers written the way the user's language writes them (comma-decimal languages: "1.50" becomes
 * "1,50"), because `validateTariff` and the other validators read the box back with the same language. Only a plain
 * en-US number is touched, so a value already in the language, or any non-number, is left alone.
 */
export function localizeContractForm(form: RevenueFormState, lang: Lang = "en-US"): RevenueFormState {
  const num = (t: string): string => (/^-?\d+\.\d+$/.test(t) ? forLanguage(t, lang) : t);
  return {
    ...form,
    tariff: num(form.tariff), tariffP90: num(form.tariffP90), biddingPrice: num(form.biddingPrice),
    siteQuality: num(form.siteQuality), siteQualityP90: num(form.siteQualityP90),
    correctionFactor: num(form.correctionFactor), correctionFactorP90: num(form.correctionFactorP90),
    inflationProfile: num(form.inflationProfile),
    ...(form.storedInflationProfile === undefined ? {} : { storedInflationProfile: num(form.storedInflationProfile) }),
    hedge: {
      ...form.hedge,
      percentage: { ...form.hedge.percentage, value: num(form.hedge.percentage.value) },
      fixed: { ...form.hedge.fixed, value: num(form.hedge.fixed.value) },
    },
  };
}

export function editContractForm(input: {
  contract: StoredRevenueContract;
  project: RevenueProject;
  volumes: readonly IndividualVolumeRow[];
}): RevenueFormState {
  const { contract: c, project } = input;
  const re = rehydrateForEdit(c, project.countryName, project.technology);
  const label = revenueLabelText(c.label);
  const type = hedgeTypeFromValue(c.hedgeType);
  // Audit 20 Oct 2026 (FIXED) — the edit values are the canvas `Value` formulas, not plain String():
  //  - CF p50 / p90: `If(IsBlank(<std value>), "1.000", Text(x, "#0.000"))` (Y:8915-8922, 9133-9141);
  //  - Tariff p50: German FiT `Text(Value(Bidding) * Value(CF), "0.00")` (Y:9438-9461), else the price;
  //  - Site Quality: `If(Int(x) = x, Text(x, "#"), Text(x, "#0.0#"))` (Y:8547-8552; 0 shows "");
  //  - Hedged Volume [%]: `If(Int(x) = x, Text(x, "0"), Text(x, "#0.0#"))` (Y:11626-11640);
  //  - Custom Inflation Profile: `Text(x, "0.00")` (Y:11038);
  //  - Inflation Start Year: `locRevenueInflationStartYear.Value` = `Value(<stored>)` (a stored 0 shows "0").
  const cf = (v: number | null) => (v === null ? "1.000" : v.toFixed(3));
  const biddingPrice = fmtPrice(c.biddingPrice);
  const tariff = re.showsGermanFitBlock
    ? germanFitTariff(Number(biddingPrice) || 0, Number(cf(c.correctionFactor)) || 0)
    : fmtPrice(c.tariffPrice);
  const hedgedPercent = (v: number): string => (Number.isInteger(v) ? String(v) : fmtSiteQualityDecimals(v));
  const inflationText = fmtTwoDecimals(c.inflationProfile);
  return {
    mode: "Edit", formDirty: false, contractId: c.id, subaccountId: c.subaccountId,
    revenueTypeLabel: label, description: c.description,
    currencyCode: revenueCurrencyCode(project.countryName),
    tariff,
    tariffP90: tariffP90Text(project.countryName, label, biddingPrice, cf(c.correctionFactorP90), tariff),
    biddingPrice, siteQuality: fmtSiteQualityCell(c.siteQuality),
    siteQualityP90: fmtSiteQualityCell(c.siteQualityP90),
    correctionFactor: cf(c.correctionFactor), correctionFactorP90: cf(c.correctionFactorP90),
    startDate: c.contractStartDate, endDate: c.contractEndDate,
    durationYears: c.contractDurationYears, durationMonths: c.contractDurationMonths,
    storedInflationProfile: inflationText,
    hedge: {
      type,
      percentage: field(type === "percentage" && c.hedgedVolume !== null ? hedgedPercent(c.hedgedVolume) : ""),
      fixed: {
        ...field(type === "fixed" && c.fixedContractedMwhPa !== null ? String(c.fixedContractedMwhPa) : ""),
        initialState: false,
      },
      individual: type === "individual" ? input.volumes.map((v) => ({ ...v, initialState: false })) : [],
    },
    useInflation: c.useInflationProfile,
    useCountryInflationProfile: c.useCountryInflationProfile,
    inflationProfile: inflationText,
    inflationStartYear: c.inflationStartYear === null ? "" : String(c.inflationStartYear),
    considerNegativePrices: c.considerNegativePrices,
    negativePriceManualOverride: c.negativePriceManualOverride,
    isStandardContract: re.isStandardContract,
    showsGermanFitBlock: re.showsGermanFitBlock,
    technology: project.technology, country: project.countryName, netYieldP50: project.netYieldP50,
    std: standardFromStored(c, project.countryName, project.technology),
  };
}

/**
 * `tgl_…_CountryInflationProfile_1.OnCheck` / `OnUncheck` (L10265-10394): checked, the value is
 * `Max(LookUp('Country Inflation Profiles', Country, Year = <start year>).Inflation, 0)` (no Area
 * term); unchecked, the custom value is blank. Both mark the field and the value non-standard.
 */
export function toggleCountryInflation(
  form: RevenueFormState, checked: boolean,
  profiles: readonly CountryInflationProfileRow[], countryCode: string | null,
): RevenueFormState {
  const year = Number(form.inflationStartYear);
  const value = checked ? countryInflationValue(profiles, countryCode, year, null, false) : null;
  // Audit 20 Oct 2026 (FIXED): the custom field shows `Text(rec, "0.00")`; unchecked on an EDITED
  // contract `rec` is the stored `'Inflation Profile'` again (Y:11010-11011), on a new one blank.
  const off = form.mode === "Edit" ? (form.storedInflationProfile ?? "") : "";
  return editField(form, {
    useCountryInflationProfile: checked,
    inflationProfile: value === null ? off : fmtTwoDecimals(value),
  }, { useCountryInflation: false, inflationValue: false });
}

/**
 * `txt_…_InflationStartYear_1.OnChange` (L10612-10705): the year typed; with the country toggle on,
 * the value is looked up again, Italy adding `Area = <bare region>`.
 */
export function changeInflationStartYear(
  form: RevenueFormState, text: string,
  profiles: readonly CountryInflationProfileRow[], countryCode: string | null, region: string | null,
): RevenueFormState {
  /*
   * Audit 20 Oct 2026 (FIXED):
   *  - the year's own standard update is inside `If(Not(<error>.Visible), …)` (Y:10613): an invalid
   *    year neither clears its standardness nor makes the contract non-standard;
   *  - the country re-lookup is OUTSIDE that `If` (Y:10645): it runs on every change while the
   *    country toggle is on, with `Year = Value(<text>)` (a non-year finds nothing → `Max(…, 0)` = 0);
   *  - the value is shown as `Text(…, "0.00")`.
   */
  const valid = validateInflationStartYear(text).valid;
  const base = editFieldIfValid(form, valid, { inflationStartYear: text }, { inflationStartYear: false });
  if (!form.useCountryInflationProfile) return base;
  const value = countryInflationValue(profiles, countryCode, Number(text), form.country === "Italy" ? region : null);
  return { ...base, inflationProfile: fmtTwoDecimals(value), std: { ...base.std, inflationValue: false } };
}
