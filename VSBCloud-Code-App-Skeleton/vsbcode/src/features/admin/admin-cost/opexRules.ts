/**
 * Admin Cost Screen — the OPEX / Land Lease family, as pure functions.
 *
 * Canvas screen: `Admin Cost Screen` (PM app)
 *   352 controls · 9 286 lines of Power Fx · 117 substantive blocks · band XL
 *
 * The three OPEX-family accordion rows (Operation & Maintenance, Land Lease, Other OPEX
 * Costs) share ONE editor over `OPEX & Land Lease Standard Assumptions`, organised as a
 * contract (Period 1) with up to nine follow-on periods. This file holds that family; the
 * DEVEX/CAPEX family is in `devexRules.ts` and the shared scope/apply logic in `rules.ts`.
 *
 * See `rules.ts` for the batch-wide SOURCE DEFECT block (no permission check anywhere)
 * and for the dead Fabric / Apply paths.
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  - `colOpexandLandLeaseStandardAssumptions`, a `ClearCollect` of the WHOLE table
 *    re-run on every `OnVisible` and rebuilt after every save. Replaced by
 *    `['opexAssumptions', scope]`, filtered server-side on the scope triple.
 *  - the `'IsCollapsed?'` COLUMN, written to every row of a subaccount by the collapse
 *    toggle (rule 8). Fold state is a `Set<string>` in the component.
 *  - the row-height encoding of the period model (rule 9: 40 / 80 / 0 / 80, where height 0
 *    is how a collapsed period is hidden). `DataGrid` renders or does not render a row.
 *  - `locShowSecondPayment` / `locShowThirdPayment` as ambient context — they are derived
 *    from the reference row by `paymentSectionsFor`.
 */
import { isBlank } from "@/domain/numeric";
import { emptyPlan, refusePlan as refuse, type WritePlan } from "./plan";
import { ES_ADMIN, CHOICE_ADMIN, CHOICE_PRODUCTION } from "@/data/entities";

/* ═══════════════════════════════════════════════════════════════════ columns ════ */

export const OPEX_COL = {
  id: "vsb_opexlandleasestandardassumptionsid",
  name: "vsb_name",
  description: "vsb_description",
  country: "_vsb_country_value",
  technology: "vsb_technology",
  typeOfContract: "vsb_typeofcontract",
  period: "vsb_period",
  opexSubaccount: "_vsb_opexsubaccount_value",
  landLeaseSubaccount: "_vsb_landleasesubaccount_value",
  isLastPeriod: "vsb_islastperiod",
  /* --- rates and aggregation: PER PERIOD, never cascaded (rule 13) --- */
  eurPerMwh: "vsb_eurmwh",
  eurPerMw: "vsb_eurmw",
  eurPerWtg: "vsb_eurwtg",
  fixCosts: "vsb_fixcosts",
  percentOfRevenues: "vsb_ofrevenues",
  aggregation: "vsb_aggregation",
  distributionFrequency: "vsb_distributionfrequency",
  durationYears: "vsb_durationinyears",
  durationMonths: "vsb_durationinmonths",
  /* --- the 17 cascade columns (rule 13) --- */
  thresholdIndividual: "vsb_thresholdindividual",
  threshold: "vsb_threshold",
  thresholdType: "vsb_thresholdtype",
  alignWithProjectDuration: "vsb_alignwithprojectduration",
  inflationArea: "vsb_inflationarea",
  inflationCountryArea: "vsb_inflationcountryarea",
  inflationProfile: "vsb_inflationprofile",
  useInflationProfile: "vsb_useinflationprofile",
  useCountryInflationProfile: "vsb_usecountryinflationprofile",
  allWtgAllocated: "vsb_allwtgallocated",
  secured: "vsb_secured",
  amountOneTimePayment: "vsb_amountonetimepayment",
  dueDateOneTimePayment: "vsb_duedateonetimepayment",
  amountOneTimePayment2: "vsb_amountonetimepayment2",
  dueDateOneTimePayment2: "vsb_duedateonetimepayment2",
  amountOneTimePayment3: "vsb_amountonetimepayment3",
  dueDateOneTimePayment3: "vsb_duedateonetimepayment3",
  /* --- other --- */
  inflationStartYearString: "vsb_inflationstartyearstring",
  owningBusinessUnit: "_owningbusinessunit_value",
} as const;

export const OPEX_LOOKUP = {
  country: "vsb_Country",
  opexSubaccount: "vsb_OpexSubaccount",
  landLeaseSubaccount: "vsb_LandLeaseSubaccount",
  owningBusinessUnit: "owningbusinessunit",
} as const;

export const OPEX_ENTITY_SET = ES_ADMIN.opexLandLeaseStandardAssumptions;

/**
 * Rule 15 — `'Inflation Start Year (String)'` is a HARD-CODED LITERAL, and the numeric
 * `'Inflation Start Year'` write next to it is commented out. Both facts are reproduced:
 * the literal is written, the numeric column is not touched.
 */
/**
 * @labels-not-in-corpus — an `'Inflation Start Year (String)'` DATA value written to and
 * compared in Dataverse, never drawn as a label
 */
export const INFLATION_START_YEAR_LITERAL = "Cluster 6 : Operation";

/** `locContractsCostsMax: 1000000000`, set in `OnVisible`, used by the amount validators. */
export const CONTRACT_COSTS_MAX = 1_000_000_000;

/* ═════════════════════════════════════════════════════════════════════ types ════ */

export interface OpexSubaccount {
  id: string;
  name: string;
  order: number;
  /** `Account.Order` — the heuristic's first term (rule 2). */
  accountOrder: number | null;
}

export interface OpexPeriodRow {
  id: string;
  description: string | null;
  countryId: string | null;
  technology: number | null;
  typeOfContract: number | null;
  /** `Opex & Land Lease Period` option-set value. */
  period: number | null;
  opexSubaccountId: string | null;
  landLeaseSubaccountId: string | null;
  isLastPeriod: boolean;
  values: Record<string, unknown>;
}

export interface OpexScope {
  countryId: string | null;
  countryName: string | null;
  /** The picker's nested value, e.g. `"Wind"`. */
  technology: string | null;
  technologyValue: number | null;
}

/* ═════════════════════════════════════════════════════════════════ subaccounts ════ */

/**
 * `Admin Cost Screen.OnVisible.Category` — verbatim (the canvas literal lives in that formula’s
 * record field).
 */
export const OANDM_NAME = "Operation & Maintenance";

/**
 * Rule 2 — the O&M / Other-OPEX split is a NAME/ORDER HEURISTIC, not a flag:
 *   O&M        = `Filter('Opex Subaccounts', Or(Account.Order = 1, Name = "Operation & Maintenance"))`
 *   Other OPEX = the complement, sorted by `Order`
 *
 * FRAGILE AND FLAGGED: adding a second account at order 1, or renaming the O&M
 * subaccount, silently moves rows between the two menus. Kept because changing it would
 * change which menu every existing subaccount appears in; the durable fix is a proper flag
 * column on `Opex Subaccounts`.
 */
export function splitOpexSubaccounts(subaccounts: OpexSubaccount[]): {
  oAndM: OpexSubaccount[];
  otherOpex: OpexSubaccount[];
} {
  const isOandM = (s: OpexSubaccount) => s.accountOrder === 1 || s.name === OANDM_NAME;
  return {
    oAndM: subaccounts.filter(isOandM).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    otherOpex: subaccounts.filter((s) => !isOandM(s))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
  };
}

/**
 * Rule 6 — two subaccount names are RE-LABELLED IN THE MENU ONLY. The stored name is
 * unchanged; only the menu item reads "TCMA" or "E&CM".
 * `If(Not(IsBlank(Find("TCMA", name))), "TCMA",
 *     Not(IsBlank(Find("Environmental", name))), "E&CM", Text(name))`
 */
export function subaccountMenuLabel(name: string): string {
  if (name.includes("TCMA")) return "TCMA";
  if (name.includes("Environmental")) return "E&CM";
  return name;
}

/**
 * Rule 5 — an "Add Contract Type" menu item is DISABLED once a contract already exists
 * for that subaccount in this scope:
 * `CountIf(col…, And(<subaccount> = RecordItem.<subaccount>, 'Type Of Contract' = …,
 *                    Text(Technology) = …SelectedNestedValue,
 *                    Country.Country = …SelectedCountry.Country)) = 0`
 *
 * The subaccount lookup differs per family (`'Land Lease Subaccount'` vs
 * `'Opex Subaccount'`), which is why `kind` is explicit.
 */
export function canAddContractType(
  existing: OpexPeriodRow[],
  subaccountId: string,
  scope: OpexScope,
  typeOfContract: number,
  kind: "landLease" | "opex",
): boolean {
  return !existing.some((r) => {
    const matchesSubaccount = kind === "landLease"
      ? r.landLeaseSubaccountId === subaccountId
      : r.opexSubaccountId === subaccountId;
    return matchesSubaccount
      && r.typeOfContract === typeOfContract
      && r.countryId === scope.countryId
      && sameTechnology(r.technology, scope.technologyValue);
  });
}

/**
 * Rule 7 vs rule 21 — the canvas compares technology CASE-SENSITIVELY in the OPEX gallery
 * (`Text(Technology) = …SelectedNestedValue`) and CASE-INSENSITIVELY in the DEVEX/CAPEX
 * builder (`Lower(Text(Technology)) = Lower(…)`). The two grids could therefore disagree
 * about the same row. One comparison, used by both (UT-ADCOST-029).
 */
export const sameTechnology = (a: number | null, b: number | null): boolean =>
  a !== null && b !== null && a === b;

/** Rule 7's scope triple, re-applied client-side so the tests can assert it. */
export function filterByScope(
  rows: OpexPeriodRow[],
  scope: OpexScope,
  typeOfContract: number,
): OpexPeriodRow[] {
  return rows
    .filter((r) =>
      r.countryId === scope.countryId
      && sameTechnology(r.technology, scope.technologyValue)
      && r.typeOfContract === typeOfContract)
    .sort((a, b) => (a.description ?? "").localeCompare(b.description ?? ""));
}

/* ═══════════════════════════════════════════════════════════════════ periods ════ */

const PERIOD_SEQUENCE: readonly number[] = [
  CHOICE_PRODUCTION.opexLandLeasePeriod.period1,
  CHOICE_PRODUCTION.opexLandLeasePeriod.period2,
  CHOICE_PRODUCTION.opexLandLeasePeriod.period3,
  CHOICE_PRODUCTION.opexLandLeasePeriod.period4,
  CHOICE_PRODUCTION.opexLandLeasePeriod.period5,
  CHOICE_PRODUCTION.opexLandLeasePeriod.period6,
  CHOICE_PRODUCTION.opexLandLeasePeriod.period7,
  CHOICE_PRODUCTION.opexLandLeasePeriod.period8,
  CHOICE_PRODUCTION.opexLandLeasePeriod.period9,
  CHOICE_PRODUCTION.opexLandLeasePeriod.period10,
];

export const PERIOD_ONE = CHOICE_PRODUCTION.opexLandLeasePeriod.period1;
export const PERIOD_TEN = CHOICE_PRODUCTION.opexLandLeasePeriod.period10;

export const periodIndex = (period: number | null): number =>
  period === null ? -1 : PERIOD_SEQUENCE.indexOf(period);

export const periodLabel = (period: number | null): string => {
  const i = periodIndex(period);
  return i < 0 ? "—" : `Period ${i + 1}`;
};

/**
 * Rule 11 — the ten-step `Switch` chain:
 * `Period: Coalesce(locSelectedLandLeaseCost.Period,
 *   Switch(locNextPeriodReferenceCost.Period, Period 1 → Period 2, … Period 9 → Period 10,
 *          <default> Period 1))`
 *
 * ┌──────────────────────────────────────────────────────────────────────────────┐
 * │ DOCUMENTED DEFECT — PERIOD 10 HAS NO SUCCESSOR, SO THE SWITCH FALLS THROUGH   │
 * │ TO ITS DEFAULT AND AN 11TH "ADD PERIOD" SILENTLY CREATES A SECOND PERIOD 1.   │
 * │                                                                              │
 * │ WE BLOCK IT INSTEAD (`null` = no successor). `nextPeriod` returning `null` is │
 * │ what `canAddPeriod` reads, so the Add-Period command is disabled at ten       │
 * │ periods with an explicit reason rather than corrupting the contract. Never a  │
 * │ silent overwrite — that is exactly what UT-ADCOST-010 requires.               │
 * │ `nextPeriodCanvasParity` keeps the wrap reachable for comparison.             │
 * └──────────────────────────────────────────────────────────────────────────────┘
 */
export function nextPeriod(referencePeriod: number | null): number | null {
  const i = periodIndex(referencePeriod);
  if (i < 0) return PERIOD_ONE;             // the switch's default arm
  if (i >= PERIOD_SEQUENCE.length - 1) return null;   // Period 10 → blocked
  return PERIOD_SEQUENCE[i + 1];
}

/** The canvas behaviour of rule 11 — Period 10 wraps to Period 1. Parity only. */
export function nextPeriodCanvasParity(referencePeriod: number | null): number {
  const i = periodIndex(referencePeriod);
  if (i < 0 || i >= PERIOD_SEQUENCE.length - 1) return PERIOD_ONE;
  return PERIOD_SEQUENCE[i + 1];
}

export const canAddPeriod = (referencePeriod: number | null): boolean =>
  nextPeriod(referencePeriod) !== null;

export const ADD_PERIOD_BLOCKED_REASON =
  "A contract can have at most ten periods. The canvas app silently created a second "
  + "Period 1 here, overwriting the contract's own head row.";

/**
 * Rule 10 — "Add Period" seeds the new period FROM THE ROW IT WAS PRESSED ON, and the
 * optional second and third one-time payments are shown only when that reference row has
 * BOTH an amount and a due date for them.
 */
export function paymentSectionsFor(reference: OpexPeriodRow | null): {
  showSecond: boolean;
  showThird: boolean;
} {
  if (!reference) return { showSecond: false, showThird: false };
  const v = reference.values;
  return {
    showSecond: !isBlank(v[OPEX_COL.amountOneTimePayment2])
      && !isBlank(v[OPEX_COL.dueDateOneTimePayment2]),
    showThird: !isBlank(v[OPEX_COL.amountOneTimePayment3])
      && !isBlank(v[OPEX_COL.dueDateOneTimePayment3]),
  };
}

/**
 * Rule 12 — `IsLastPeriod?` is a LINKED-LIST TAIL FLAG. A new row gets `Yes`, and the
 * reference row it was added after is immediately patched to `No`.
 */
export function recomputeLastPeriodFlags(
  periods: OpexPeriodRow[],
): { id: string; isLastPeriod: boolean }[] {
  const ordered = [...periods].sort((a, b) => periodIndex(a.period) - periodIndex(b.period));
  return ordered.map((p, i) => ({ id: p.id, isLastPeriod: i === ordered.length - 1 }));
}

/* ═══════════════════════════════════════════════════════════ the Period-1 cascade ════ */

/**
 * Rule 13 — EDITING PERIOD 1 CASCADES A FIXED FIELD SET TO EVERY LATER PERIOD.
 *
 * Exactly SEVENTEEN columns, and no others. Rates (`EUR/MWh`, `EUR/MW`, `EUR/WTG`,
 * `Fix Costs`, `% of Revenues`), `Aggregation`, the durations and `Distribution Frequency`
 * are deliberately NOT cascaded — they stay per-period. Getting that list wrong silently
 * rewrites every later period of every contract, so it is declared once, here, and
 * asserted by UT-ADCOST-012 and UT-ADCOST-013.
 */
export const CASCADE_COLUMNS: readonly string[] = [
  OPEX_COL.thresholdIndividual,
  OPEX_COL.threshold,
  OPEX_COL.thresholdType,
  OPEX_COL.alignWithProjectDuration,
  OPEX_COL.inflationArea,
  OPEX_COL.inflationCountryArea,
  OPEX_COL.inflationProfile,
  OPEX_COL.useInflationProfile,
  OPEX_COL.useCountryInflationProfile,
  OPEX_COL.allWtgAllocated,
  OPEX_COL.secured,
  OPEX_COL.amountOneTimePayment,
  OPEX_COL.dueDateOneTimePayment,
  OPEX_COL.amountOneTimePayment2,
  OPEX_COL.dueDateOneTimePayment2,
  OPEX_COL.amountOneTimePayment3,
  OPEX_COL.dueDateOneTimePayment3,
];

/** The columns that must NEVER appear in a cascade patch. */
export const NON_CASCADE_COLUMNS: readonly string[] = [
  OPEX_COL.eurPerMwh, OPEX_COL.eurPerMw, OPEX_COL.eurPerWtg, OPEX_COL.fixCosts,
  OPEX_COL.percentOfRevenues, OPEX_COL.aggregation, OPEX_COL.distributionFrequency,
  OPEX_COL.durationYears, OPEX_COL.durationMonths,
];

/** Projects a saved Period-1 payload down to exactly the 17 cascade keys. */
export function cascadeFieldsFromPeriodOne(
  periodOnePayload: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of CASCADE_COLUMNS) {
    if (key in periodOnePayload) out[key] = periodOnePayload[key];
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════ the form ════ */

export interface OpexPeriodForm {
  description: string;
  /** The rates. Empty string means "not entered". */
  eurPerMwh: string;
  eurPerMw: string;
  eurPerWtg: string;
  fixCosts: string;
  percentOfRevenues: string;
  aggregation: number | null;
  distributionFrequency: number | null;
  durationYears: number | null;
  durationMonths: number | null;
  /** One-time payment mode replaces the duration/aggregation branch entirely. */
  oneTimePayment: boolean;
  amount: string;
  dueDate: string | null;
  amount2: string;
  dueDate2: string | null;
  amount3: string;
  dueDate3: string | null;
  inflation: boolean;
  inflationStartYear: string;
  useCountryInflationProfile: boolean;
  inflationAreaProfileId: string | null;
  inflationProfile: string;
  threshold: boolean;
  thresholdType: number | null;
  thresholdIndividual: string;
  alignWithProjectDuration: boolean;
  allWtgAllocated: boolean;
  secured: boolean;
}

export const emptyOpexForm = (): OpexPeriodForm => ({
  description: "", eurPerMwh: "", eurPerMw: "", eurPerWtg: "", fixCosts: "",
  percentOfRevenues: "", aggregation: null, distributionFrequency: null,
  durationYears: null, durationMonths: null,
  oneTimePayment: false, amount: "", dueDate: null,
  amount2: "", dueDate2: null, amount3: "", dueDate3: null,
  inflation: false, inflationStartYear: "", useCountryInflationProfile: false,
  inflationAreaProfileId: null, inflationProfile: "",
  threshold: false, thresholdType: null, thresholdIndividual: "",
  alignWithProjectDuration: false, allWtgAllocated: false, secured: false,
});

export interface OpexValidationContext {
  countryName: string | null;
  showSecondPayment: boolean;
  showThirdPayment: boolean;
  isDirty: boolean;
}

const amountValid = (raw: string): boolean => {
  if (isBlank(raw)) return false;
  const n = Number(String(raw).replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= CONTRACT_COSTS_MAX;
};

/**
 * The 125-line `DisplayMode` of `pcf_LandLease_RightPanel_NewEditPeriod_BodyButtons_Save_1`,
 * spelled out as named branches. Each branch has its own test.
 *
 * `locIsDirty` is a real term of the conjunction: an untouched panel cannot be saved.
 */
export function validateOpexPeriod(
  form: OpexPeriodForm,
  ctx: OpexValidationContext,
): string[] {
  const errors: string[] = [];

  if (!ctx.isDirty) errors.push("Nothing has been changed yet.");
  if (isBlank(form.description.trim())) errors.push("Description cannot be blank.");

  if (form.oneTimePayment) {
    // one-time payment on → Due Date and Amount non-blank
    if (isBlank(form.dueDate)) errors.push("A one-time payment needs a due date.");
    if (!amountValid(form.amount)) errors.push("A one-time payment needs an amount.");
  } else {
    // otherwise → duration months AND years selected, not both zero, plus aggregation
    // and distribution frequency.
    const years = form.durationYears ?? 0;
    const months = form.durationMonths ?? 0;
    if (form.durationYears === null || form.durationMonths === null) {
      errors.push("Select a duration in years and months.");
    } else if (years === 0 && months === 0) {
      errors.push("The duration cannot be zero.");
    }
    if (form.aggregation === null) errors.push("Select an aggregation.");
    if (form.distributionFrequency === null) errors.push("Select a distribution frequency.");
  }

  // The second and third payments are required only when the reference row had them.
  if (ctx.showSecondPayment) {
    if (isBlank(form.dueDate2)) errors.push("Payment 2 needs a due date.");
    if (!amountValid(form.amount2)) errors.push("Payment 2 needs an amount.");
  }
  if (ctx.showThirdPayment) {
    if (isBlank(form.dueDate3)) errors.push("Payment 3 needs a due date.");
    if (!amountValid(form.amount3)) errors.push("Payment 3 needs an amount.");
  }

  if (form.inflation) {
    if (isBlank(form.inflationStartYear)) {
      errors.push("Inflation needs a start year.");
    }
    if (ctx.countryName === "Italy" && form.useCountryInflationProfile
      && !form.inflationAreaProfileId) {
      // Italy is the only country with area profiles — a literal in the canvas formula.
      errors.push("Select an area inflation profile.");
    }
    if (!form.useCountryInflationProfile && isBlank(form.inflationProfile)) {
      errors.push("Enter an inflation profile value.");
    }
  }

  if (form.threshold && form.thresholdType === CHOICE_ADMIN.thresholdType.individual
    && isBlank(form.thresholdIndividual)) {
    errors.push("An individual threshold needs a value.");
  }

  return errors;
}

export const canSaveOpexPeriod = (
  form: OpexPeriodForm,
  ctx: OpexValidationContext,
): boolean => validateOpexPeriod(form, ctx).length === 0;

/* ═════════════════════════════════════════════════════════════════════ the save ════ */

const numberOrNull = (raw: string): number | null => {
  if (isBlank(raw)) return null;
  const n = Number(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/**
 * Rules 14–17 — the period payload.
 *
 * Rule 14 — `Name` is COMPOSED: `<description> - <country> - <technology>`; `Description`
 *           is the user's raw text.
 * Rule 15 — `'Inflation Profile'` is written ONLY when the COUNTRY profile is not used;
 *           `'Inflation Start Year (String)'` is the hard-coded literal, and the numeric
 *           `'Inflation Start Year'` write is commented out in the source and omitted here.
 * Rule 16 — `Secured` maps a toggle to the two-value option set.
 * Rule 17 — the technology `Switch` on this screen spells its fourth arm `"Hydro"`, while
 *           the Gates screen spells the same arm `"Hydrogen"`. `scope.technologyValue` is
 *           resolved once, upstream, by the shared case-insensitive helper.
 */
export function buildOpexPayload(
  form: OpexPeriodForm,
  args: {
    scope: OpexScope;
    typeOfContract: number;
    period: number;
    isLastPeriod: boolean;
    subaccountId: string;
    subaccountKind: "landLease" | "opex";
    owningBusinessUnitId: string | null;
    isCreate: boolean;
  },
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    // Rule 14.
    [OPEX_COL.name]:
      `${form.description.trim()} - ${args.scope.countryName ?? ""} - ${args.scope.technology ?? ""}`,
    [OPEX_COL.description]: form.description.trim(),
    [OPEX_COL.period]: args.period,
    [OPEX_COL.isLastPeriod]: args.isLastPeriod,

    /* rates — per period, never cascaded */
    [OPEX_COL.eurPerMwh]: numberOrNull(form.eurPerMwh),
    [OPEX_COL.eurPerMw]: numberOrNull(form.eurPerMw),
    [OPEX_COL.eurPerWtg]: numberOrNull(form.eurPerWtg),
    [OPEX_COL.fixCosts]: numberOrNull(form.fixCosts),
    [OPEX_COL.percentOfRevenues]: numberOrNull(form.percentOfRevenues),
    [OPEX_COL.aggregation]: form.aggregation,
    [OPEX_COL.distributionFrequency]: form.distributionFrequency,
    [OPEX_COL.durationYears]: form.durationYears,
    [OPEX_COL.durationMonths]: form.durationMonths,

    /* the 17 cascade columns */
    [OPEX_COL.thresholdIndividual]: form.threshold
      ? numberOrNull(form.thresholdIndividual) : null,
    [OPEX_COL.threshold]: form.threshold,
    [OPEX_COL.thresholdType]: form.threshold ? form.thresholdType : null,
    [OPEX_COL.alignWithProjectDuration]: form.alignWithProjectDuration,
    [OPEX_COL.inflationArea]: form.inflationAreaProfileId,
    [OPEX_COL.inflationCountryArea]: form.useCountryInflationProfile,
    // Rule 15 — omitted (written as null) when the country profile IS used.
    [OPEX_COL.inflationProfile]: form.useCountryInflationProfile
      ? null : numberOrNull(form.inflationProfile),
    [OPEX_COL.useInflationProfile]: form.inflation,
    [OPEX_COL.useCountryInflationProfile]: form.useCountryInflationProfile,
    [OPEX_COL.allWtgAllocated]: form.allWtgAllocated,
    // Rule 16.
    [OPEX_COL.secured]: form.secured ? CHOICE_ADMIN.secured.yes : CHOICE_ADMIN.secured.no,
    [OPEX_COL.amountOneTimePayment]: numberOrNull(form.amount),
    [OPEX_COL.dueDateOneTimePayment]: form.dueDate,
    [OPEX_COL.amountOneTimePayment2]: numberOrNull(form.amount2),
    [OPEX_COL.dueDateOneTimePayment2]: form.dueDate2,
    [OPEX_COL.amountOneTimePayment3]: numberOrNull(form.amount3),
    [OPEX_COL.dueDateOneTimePayment3]: form.dueDate3,

    // Rule 15's literal. The numeric `'Inflation Start Year'` column is deliberately not
    // written — that `Patch` argument is commented out in the source.
    [OPEX_COL.inflationStartYearString]: INFLATION_START_YEAR_LITERAL,
  };

  if (args.isCreate) {
    data[OPEX_COL.typeOfContract] = args.typeOfContract;
    data[OPEX_COL.technology] = args.scope.technologyValue;
    if (args.scope.countryId) {
      data[`${OPEX_LOOKUP.country}@odata.bind`] = `/vsb_countries(${args.scope.countryId})`;
    }
    const nav = args.subaccountKind === "landLease"
      ? OPEX_LOOKUP.landLeaseSubaccount : OPEX_LOOKUP.opexSubaccount;
    const set = args.subaccountKind === "landLease"
      ? "vsb_landleasesubaccounts" : "vsb_opexsubaccounts";
    data[`${nav}@odata.bind`] = `/${set}(${args.subaccountId})`;
  }
  if (args.owningBusinessUnitId) {
    data[`${OPEX_LOOKUP.owningBusinessUnit}@odata.bind`] =
      `/businessunits(${args.owningBusinessUnitId})`;
  }
  return data;
}

export type { PlannedWrite, WritePlan } from "./plan";

/**
 * The save as ONE batch: the period upsert, the reference row's `IsLastPeriod? = No`
 * (rule 12) and, when editing Period 1, the cascade patches (rule 13).
 *
 * The canvas does this as three sequential waves, so a failure between them leaves the
 * contract with two tail rows or a half-applied cascade.
 */
export function planSaveOpexPeriod(args: {
  form: OpexPeriodForm;
  scope: OpexScope;
  typeOfContract: number;
  subaccountId: string;
  subaccountKind: "landLease" | "opex";
  /** `null` for a new period. */
  existing: OpexPeriodRow | null;
  /** The row "Add Period" was pressed on. `null` when creating the contract head. */
  reference: OpexPeriodRow | null;
  /** Every period of this contract, for the cascade and the tail flag. */
  siblings: OpexPeriodRow[];
  owningBusinessUnitId: string | null;
  canEdit: boolean;
  validation: OpexValidationContext;
}): WritePlan {
  if (!args.canEdit) return refuse("This country is outside your editable country scope.");
  const errors = validateOpexPeriod(args.form, args.validation);
  if (errors.length > 0) return refuse(errors[0]);

  // Rule 11 — an existing row KEEPS its period; a new one is the reference's successor.
  let period: number;
  if (args.existing) {
    period = args.existing.period ?? PERIOD_ONE;
  } else if (args.reference) {
    const next = nextPeriod(args.reference.period);
    if (next === null) return refuse(ADD_PERIOD_BLOCKED_REASON);
    period = next;
  } else {
    period = PERIOD_ONE;
  }

  const payload = buildOpexPayload(args.form, {
    scope: args.scope,
    typeOfContract: args.typeOfContract,
    period,
    // Rule 12 — a new/edited row is the tail unless it already carried a flag.
    isLastPeriod: args.existing?.isLastPeriod ?? true,
    subaccountId: args.subaccountId,
    subaccountKind: args.subaccountKind,
    owningBusinessUnitId: args.owningBusinessUnitId,
    isCreate: args.existing === null,
  });

  const plan = emptyPlan();
  plan.writes.push(
    args.existing === null
      ? {
          op: "create", entitySet: OPEX_ENTITY_SET, data: payload,
          reason: `${periodLabel(period)} created`,
        }
      : {
          op: "update", entitySet: OPEX_ENTITY_SET, id: args.existing.id, data: payload,
          reason: `${periodLabel(period)} updated`,
        },
  );

  // Rule 12 — the reference row loses the tail flag when a successor is added after it.
  if (args.existing === null && args.reference !== null && args.reference.isLastPeriod) {
    plan.writes.push({
      op: "update", entitySet: OPEX_ENTITY_SET, id: args.reference.id,
      data: { [OPEX_COL.isLastPeriod]: false },
      reason: `${periodLabel(args.reference.period)} is no longer the last period`,
    });
  }

  // Rule 13 — editing Period 1 cascades exactly the 17 columns to every later period.
  if (args.existing !== null && args.existing.period === PERIOD_ONE) {
    const cascade = cascadeFieldsFromPeriodOne(payload);
    for (const sibling of args.siblings) {
      if (sibling.id === args.existing.id) continue;
      if (sibling.period === PERIOD_ONE) continue;
      plan.writes.push({
        op: "update", entitySet: OPEX_ENTITY_SET, id: sibling.id, data: { ...cascade },
        reason: `${periodLabel(sibling.period)} inherits the Period 1 settings`,
      });
    }
    plan.log.push(`Cascaded ${CASCADE_COLUMNS.length} fields to the later periods.`);
  }

  return plan;
}

/* ══════════════════════════════════════════════════════════════════ the delete ════ */

/**
 * Rule 19 — DELETING PERIOD 1 DELETES THE WHOLE CONTRACT.
 * `RemoveIf(…, And(<subaccount match>, Country…, Text(Technology)…,
 *                  'Type Of Contract' = locContractOrPeriodToDelete.'Type Of Contract'))`
 *
 * Otherwise the single row goes and the new tail is retagged.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────┐
 * │ DOCUMENTED DEFECT — THE CANVAS PICKS THE NEW TAIL BY **DESCRIPTION** ORDER.  │
 * │   locSecondLastPeriod: First(LastN(Sort(<set>, Description, Ascending), 2))  │
 * │ If the descriptions are not monotonic — and nothing makes them so, the user  │
 * │ types them — the WRONG row is flagged `IsLastPeriod? = Yes` and the contract │
 * │ grows a second tail.                                                        │
 * │                                                                              │
 * │ FIXED: the tail is the highest remaining PERIOD. UT-ADCOST-015 uses reverse  │
 * │ alphabetical descriptions to pin the difference.                            │
 * └──────────────────────────────────────────────────────────────────────────────┘
 */
export function planDeleteOpexPeriodOrContract(args: {
  target: OpexPeriodRow;
  /** Every period of the same contract, including the target. */
  contractPeriods: OpexPeriodRow[];
  canEdit: boolean;
}): WritePlan {
  if (!args.canEdit) return refuse("This country is outside your editable country scope.");
  const plan = emptyPlan();

  if (args.target.period === PERIOD_ONE) {
    for (const p of args.contractPeriods) {
      plan.writes.push({
        op: "delete", entitySet: OPEX_ENTITY_SET, id: p.id,
        reason: `${periodLabel(p.period)} deleted with the contract`,
      });
    }
    plan.log.push(`Deleted the whole contract (${args.contractPeriods.length} period(s)).`);
    return plan;
  }

  plan.writes.push({
    op: "delete", entitySet: OPEX_ENTITY_SET, id: args.target.id,
    reason: `${periodLabel(args.target.period)} deleted`,
  });

  const remaining = args.contractPeriods.filter((p) => p.id !== args.target.id);
  const newTail = remaining
    .slice()
    .sort((a, b) => periodIndex(b.period) - periodIndex(a.period))[0];
  if (newTail && !newTail.isLastPeriod) {
    plan.writes.push({
      op: "update", entitySet: OPEX_ENTITY_SET, id: newTail.id,
      data: { [OPEX_COL.isLastPeriod]: true },
      reason: `${periodLabel(newTail.period)} becomes the last period`,
    });
  }
  return plan;
}

/** The canvas's tail choice, for the parity test. Not wired to the UI. */
export function newTailCanvasParity(remaining: OpexPeriodRow[]): OpexPeriodRow | null {
  const byDescription = [...remaining]
    .sort((a, b) => (a.description ?? "").localeCompare(b.description ?? ""));
  return byDescription.slice(-2)[0] ?? null;
}
