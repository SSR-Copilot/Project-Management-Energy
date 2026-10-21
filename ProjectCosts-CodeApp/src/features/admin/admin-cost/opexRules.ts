/**
 * Admin Cost Screen — the OPEX / Land Lease family, as pure functions (D24).
 *
 * The three OPEX-family cards (Operation & Maintenance, Land Lease, Other OPEX Costs) share ONE
 * editor over `OPEX & Land Lease Standard Assumptions`, organised as a contract (Period 1) with up
 * to nine follow-on periods. See `rules.ts` for the screen-wide notes.
 *
 * HARD-WIRED IN THE CANVAS (kept, D24): Secured off, Allocate to all WTGs on, One-Time Payment
 * off, Threshold off, Align with Project Duration off — each toggle has a literal `Checked` and
 * `DisplayMode.Disabled` (the editable formulas are commented out). The fields behind One-Time
 * Payment and Threshold are therefore never shown for a new contract, but their stored values are
 * carried through every save exactly as the canvas does (their inputs read
 * `Coalesce(record, reference)`). Inflation Start Year is the literal "Cluster 6 : Operation +
 * 1 Year" (display) / "Cluster 6 : Operation" (stored).
 *
 * SOURCE DEFECTs fixed here (each marked below): the External Contract default flips a stored
 * "No" to "Yes" on Edit, and its TCMA test is case-sensitive; an 11th "Add Period" creates a
 * second Period 1; the new tail after a delete is picked by Description; a stored 0 rate opens
 * blank in the panel; Edit keeps the previous panel's second / third payment sections.
 */
import { isBlank, isOneDecimal, isTwoDecimal, inRange, isNumeric } from "@/domain/powerFxNumeric";
import { emptyPlan, refusePlan as refuse, type WritePlan } from "@/data/writePlan";
import { ES, ES_ADMIN, ES_PLANT, CHOICE_ADMIN, CHOICE_PRODUCTION } from "@/data/dataverseNames";
import {
  formatDurationMonths, formatDurationYears, formatEurPerMw, formatEurPerMwh, formatEurPerWtg,
  formatFixCosts, formatInflationPercent, formatPercentOfRevenues,
} from "@/features/cost/periods/landLeaseRules";

/* ═══════════════════════════════════════════════════════════════════ columns ════ */

export const OPEX_COL = {
  id: "vsb_opexlandleasestandardassumptionsid",
  name: "vsb_name",
  description: "vsb_description",
  startDateString: "vsb_startdatestring",
  country: "_vsb_country_value",
  technology: "vsb_technology",
  typeOfContract: "vsb_typeofcontract",
  period: "vsb_period",
  opexSubaccount: "_vsb_opexsubaccount_value",
  landLeaseSubaccount: "_vsb_landleasesubaccount_value",
  currency: "_vsb_currency_value",
  isLastPeriod: "vsb_islastperiod",
  isCollapsed: "vsb_iscollapsed",
  /* --- rates and aggregation: PER PERIOD, never cascaded --- */
  eurPerMwh: "vsb_eurmwh",
  eurPerMw: "vsb_eurmw",
  eurPerWtg: "vsb_eurwtg",
  fixCosts: "vsb_fixcosts",
  percentOfRevenues: "vsb_ofrevenues",
  aggregation: "vsb_aggregation",
  distributionFrequency: "vsb_distributionfrequency",
  durationYears: "vsb_durationinyears",
  durationMonths: "vsb_durationinmonths",
  /* --- the 17 cascade columns --- */
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
  externalContract: "vsb_externalcontract",
} as const;

/** Navigation properties for `@odata.bind`. No Owning Business Unit: its write is commented out. */
export const OPEX_LOOKUP = {
  country: "vsb_Country",
  opexSubaccount: "vsb_OpexSubaccount",
  landLeaseSubaccount: "vsb_LandLeaseSubaccount",
  currency: "vsb_Currency",
} as const;

export const OPEX_ENTITY_SET = ES_ADMIN.opexLandLeaseStandardAssumptions;

/** `'Inflation Start Year (String)': "Cluster 6 : Operation"` — the stored literal. */
export const INFLATION_START_YEAR_LITERAL = "Cluster 6 : Operation";
/** `txt_…_InflationStartYear_1.Value` — the literal the panel shows (DisplayMode.View). */
export const INFLATION_START_YEAR_DISPLAY = "Cluster 6 : Operation + 1 Year";
/** `Coalesce(…'Start Date String', "Cluster 6: Operation")` — note: no space before the colon. */
export const START_DATE_DEFAULT = "Cluster 6: Operation";

/** The hard-wired toggles (`Checked` literal, `DisplayMode.Disabled`). */
export const OPEX_FIXED = {
  secured: false,
  allWtgAllocated: true,
  oneTimePayment: false,
  threshold: false,
  alignWithProjectDuration: false,
} as const;

/* ═════════════════════════════════════════════════════════════════════ types ════ */

export interface OpexSubaccount {
  id: string;
  name: string;
  order: number;
  /** `Account.Order` — the O&M heuristic's first term. */
  accountOrder: number | null;
}

export type OpexKind = "landLease" | "opex";

export interface OpexPeriodRow {
  id: string;
  description: string | null;
  startDateString: string | null;
  countryId: string | null;
  technology: number | null;
  typeOfContract: number | null;
  /** `Opex & Land Lease Period` option-set value. */
  period: number | null;
  opexSubaccountId: string | null;
  landLeaseSubaccountId: string | null;
  currencyId: string | null;
  currencyName: string | null;
  isLastPeriod: boolean;
  isCollapsed: boolean;
  fixCosts: number | null;
  percentOfRevenues: number | null;
  eurPerMwh: number | null;
  eurPerMw: number | null;
  eurPerWtg: number | null;
  aggregation: number | null;
  distributionFrequency: number | null;
  durationYears: number | null;
  durationMonths: number | null;
  secured: boolean | null;
  allWtgAllocated: boolean | null;
  externalContract: boolean | null;
  useInflationProfile: boolean | null;
  useCountryInflationProfile: boolean | null;
  inflationProfile: number | null;
  inflationArea: string | null;
  inflationCountryArea: string | null;
  amount1: number | null;
  dueDate1: string | null;
  amount2: number | null;
  dueDate2: string | null;
  amount3: number | null;
  dueDate3: string | null;
  threshold: boolean | null;
  thresholdType: number | null;
  thresholdIndividual: number | null;
  alignWithProjectDuration: boolean | null;
}

export interface OpexScope {
  countryId: string | null;
  countryName: string | null;
  technology: string | null;
  technologyValue: number | null;
}

export interface CurrencyRef { id: string; code: string; name: string }

/* ═════════════════════════════════════════════════════════════════ subaccounts ════ */

/** `Admin Cost Screen.OnVisible` — the O&M subaccount name the split tests. */
export const OANDM_NAME = "Operation & Maintenance";

/**
 * `colOAndMSubaccounts` / `colOtherOpexSubaccounts` — a NAME/ORDER HEURISTIC:
 * O&M = `Or(Account.Order = 1, Name = "Operation & Maintenance")`; Other OPEX = the rest, by Order.
 */
export function splitOpexSubaccounts(subaccounts: readonly OpexSubaccount[]): {
  oAndM: OpexSubaccount[];
  otherOpex: OpexSubaccount[];
} {
  const isOandM = (s: OpexSubaccount) => s.accountOrder === 1 || s.name === OANDM_NAME;
  return {
    oAndM: subaccounts.filter(isOandM),
    otherOpex: subaccounts.filter((s) => !isOandM(s)).sort((a, b) => a.order - b.order),
  };
}

/**
 * The menu item label: `If(Find("TCMA", name), "TCMA", Find("Environmental", name), "E&CM",
 * name)` — Other OPEX only; the stored name is unchanged.
 */
export function subaccountMenuLabel(name: string): string {
  if (name.includes("TCMA")) return "TCMA";
  if (name.includes("Environmental")) return "E&CM";
  return name;
}

export const kindOf = (typeOfContract: number | null): OpexKind =>
  typeOfContract === CHOICE_ADMIN.contractTypes.landlease ? "landLease" : "opex";

/** The row's subaccount — the Land Lease lookup for Land Lease, the OPEX lookup otherwise. */
export const subaccountIdOf = (row: OpexPeriodRow): string | null =>
  kindOf(row.typeOfContract) === "landLease" ? row.landLeaseSubaccountId : row.opexSubaccountId;

export interface ContractTypeMenuItem {
  subaccount: OpexSubaccount;
  label: string;
  enabled: boolean;
}

/**
 * `cmp_Admin_Cost_LandLease_AddStandardContractType_CommandBar.Items` — one child per family
 * subaccount, enabled only while no contract of that subaccount and type exists in the scope.
 */
export function contractTypeMenu(
  typeOfContract: number,
  subaccounts: readonly OpexSubaccount[],
  rows: readonly OpexPeriodRow[],
  scope: OpexScope,
): ContractTypeMenuItem[] {
  const other = typeOfContract === CHOICE_ADMIN.contractTypes.opexOther;
  return subaccounts.map((subaccount) => ({
    subaccount,
    label: other ? subaccountMenuLabel(subaccount.name) : subaccount.name,
    enabled: !rows.some((r) =>
      subaccountIdOf(r) === subaccount.id && r.typeOfContract === typeOfContract
      && r.countryId === scope.countryId && r.technology === scope.technologyValue),
  }));
}

/* ═══════════════════════════════════════════════════════════════════ periods ════ */

const PERIOD_SEQUENCE: readonly number[] = [
  CHOICE_PRODUCTION.opexLandLeasePeriod.period1, CHOICE_PRODUCTION.opexLandLeasePeriod.period2,
  CHOICE_PRODUCTION.opexLandLeasePeriod.period3, CHOICE_PRODUCTION.opexLandLeasePeriod.period4,
  CHOICE_PRODUCTION.opexLandLeasePeriod.period5, CHOICE_PRODUCTION.opexLandLeasePeriod.period6,
  CHOICE_PRODUCTION.opexLandLeasePeriod.period7, CHOICE_PRODUCTION.opexLandLeasePeriod.period8,
  CHOICE_PRODUCTION.opexLandLeasePeriod.period9, CHOICE_PRODUCTION.opexLandLeasePeriod.period10,
];

export const PERIOD_ONE = CHOICE_PRODUCTION.opexLandLeasePeriod.period1;

export const periodIndex = (period: number | null): number =>
  period === null ? -1 : PERIOD_SEQUENCE.indexOf(period);

/**
 * The Save's `Period: Coalesce(record.Period, Switch(reference.Period, Period 1 → Period 2, …,
 * Period 9 → Period 10, Period 1))`.
 *
 * SOURCE DEFECT (fixed): Period 10 has no successor, so the Switch falls through to its default and
 * an 11th "Add Period" silently creates a SECOND Period 1. Here there is no successor (`null`) and
 * Add Period is disabled at ten periods; `nextPeriodCanvasParity` keeps the wrap.
 */
export function nextPeriod(referencePeriod: number | null): number | null {
  const i = periodIndex(referencePeriod);
  if (i < 0) return PERIOD_ONE;
  if (i >= PERIOD_SEQUENCE.length - 1) return null;
  return PERIOD_SEQUENCE[i + 1]!;
}

export function nextPeriodCanvasParity(referencePeriod: number | null): number {
  const i = periodIndex(referencePeriod);
  if (i < 0 || i >= PERIOD_SEQUENCE.length - 1) return PERIOD_ONE;
  return PERIOD_SEQUENCE[i + 1]!;
}

export const canAddPeriod = (referencePeriod: number | null): boolean => nextPeriod(referencePeriod) !== null;

/* ═══════════════════════════════════════════════════════════════════ the grid ════ */

/**
 * `gal_LandLease_Content_Subaccounts_CardBody_Costs_1.Items` — the scope's rows of one type,
 * sorted by Description (so a contract's periods "X", "X - 2", … sit together).
 */
export function opexRowsForCategory(
  rows: readonly OpexPeriodRow[],
  scope: OpexScope,
  typeOfContract: number,
): OpexPeriodRow[] {
  return rows
    .filter((r) => r.countryId === scope.countryId && r.technology === scope.technologyValue
      && r.typeOfContract === typeOfContract)
    .sort((a, b) => (a.description ?? "").localeCompare(b.description ?? ""));
}

/**
 * `Button2_1.OnSelect` flips `'IsCollapsed?'` for every row of the subaccount (in the local
 * collection only). `collapsed` holds those flips by subaccount; otherwise the stored value counts.
 */
export const isRowCollapsed = (row: OpexPeriodRow, collapsed: ReadonlyMap<string, boolean>): boolean => {
  const key = subaccountIdOf(row);
  return key !== null && collapsed.has(key) ? collapsed.get(key)! : row.isCollapsed;
};

export function toggleCollapsed(
  collapsed: ReadonlyMap<string, boolean>,
  headRow: OpexPeriodRow,
): Map<string, boolean> {
  const next = new Map(collapsed);
  const key = subaccountIdOf(headRow);
  if (key !== null) next.set(key, !isRowCollapsed(headRow, collapsed));
  return next;
}

/** After a save, `UpdateIf(…, subaccount, {'IsCollapsed?': false})` — the contract opens. */
export function expandAfterSave(collapsed: ReadonlyMap<string, boolean>, subaccountId: string | null): Map<string, boolean> {
  const next = new Map(collapsed);
  if (subaccountId !== null) next.set(subaccountId, false);
  return next;
}

export interface OpexGridLine {
  row: OpexPeriodRow;
  /** Period 1 — `con_…_CostsTableRow_1`, with the +/− toggle. */
  isHead: boolean;
  /** `ico_…_Delete` (head, always) / `ico_…_Delete_1.Visible = Or(Period 1, 'IsLastPeriod?')`. */
  canDelete: boolean;
  /** `con_…_AddPeriod` — shown under the last period while the contract is expanded. */
  showAddPeriod: boolean;
  collapsed: boolean;
}

/**
 * The visible lines: a head row always; a later period only while expanded
 * (`Not('IsCollapsed?') && Period <> 'Period 1'`); "Add Period" only below the tail row of an
 * expanded contract (the row-height formula gives 80 there, 40 elsewhere, 0 when collapsed).
 */
export function opexGridLines(
  rows: readonly OpexPeriodRow[],
  collapsed: ReadonlyMap<string, boolean>,
): OpexGridLine[] {
  const out: OpexGridLine[] = [];
  for (const row of rows) {
    const isHead = row.period === PERIOD_ONE;
    const isCollapsed = isRowCollapsed(row, collapsed);
    if (!isHead && isCollapsed) continue;
    out.push({
      row, isHead,
      canDelete: isHead || row.isLastPeriod,
      showAddPeriod: row.isLastPeriod && !isCollapsed,
      collapsed: isCollapsed,
    });
  }
  return out;
}

/** Every period of the row's contract in the scope (same subaccount, country and technology). */
export const contractRowsOf = (rows: readonly OpexPeriodRow[], row: OpexPeriodRow): OpexPeriodRow[] =>
  rows.filter((r) => subaccountIdOf(r) === subaccountIdOf(row) && r.typeOfContract === row.typeOfContract
    && r.countryId === row.countryId && r.technology === row.technology);

/** `$"COD + {RoundDown(m / 12, 0)} Years {Mod(m, 12)} Months"`. */
export const codOffsetText = (months: number): string =>
  `COD + ${Math.floor(months / 12)} Years ${months % 12} Months`;

const sumMonths = (rows: readonly OpexPeriodRow[]): number =>
  rows.reduce((s, r) => s + (r.durationMonths ?? 0) + (r.durationYears ?? 0) * 12, 0);

/**
 * `lbl_…_EndDate_2/_3.Text` — the cumulative duration of the contract's periods up to this one
 * (`Period <= ThisItem.Period`), as "COD + y Years m Months".
 */
export function endDateText(row: OpexPeriodRow, sameScopeRows: readonly OpexPeriodRow[]): string {
  const upTo = sameScopeRows.filter((r) => subaccountIdOf(r) === subaccountIdOf(row)
    && periodIndex(r.period) <= periodIndex(row.period));
  return codOffsetText(sumMonths(upTo));
}

const yesNo = (v: boolean | null): string => (v === null ? "" : v ? "Yes" : "No");

/** `vsb_opexaggregation` option labels (customizations.xml). */
export const AGGREGATION_OPTIONS: readonly { value: number; label: string }[] = [
  { value: CHOICE_PRODUCTION.aggregation.sum, label: "SUM" },
  { value: CHOICE_PRODUCTION.aggregation.max, label: "MAX" },
  { value: CHOICE_PRODUCTION.aggregation.min, label: "MIN" },
];

const aggregationLabel = (v: number | null): string =>
  AGGREGATION_OPTIONS.find((o) => o.value === v)?.label ?? "";

/**
 * The row's cells, in `opexColumnHeaders` order. Number formats reuse the Cost Land Lease grid's
 * (same canvas formats, same decisions — `features/cost/periods/landLeaseRules.ts`).
 */
export function opexCells(row: OpexPeriodRow, sameScopeRows: readonly OpexPeriodRow[]): string[] {
  const isLandLease = kindOf(row.typeOfContract) === "landLease";
  const inflation = row.useInflationProfile !== true ? "No"
    : row.useCountryInflationProfile === true ? "Country Inflation"
      : formatInflationPercent(row.inflationProfile);
  const duration = [formatDurationYears(row.durationYears), formatDurationMonths(row.durationMonths)]
    .filter(Boolean).join(" ");
  const cells = [
    row.description ?? "",
    row.startDateString ?? "",
    duration,
    endDateText(row, sameScopeRows),
    row.currencyName ?? "",
    inflation,
    formatFixCosts(row.fixCosts),
    formatPercentOfRevenues(row.percentOfRevenues),
    formatEurPerMwh(row.eurPerMwh),
    formatEurPerMw(row.eurPerMw),
    formatEurPerWtg(row.eurPerWtg),
    aggregationLabel(row.aggregation),
    isLandLease ? yesNo(row.secured) : row.distributionFrequency === null ? "" : String(row.distributionFrequency),
    isLandLease ? yesNo(row.allWtgAllocated) : yesNo(row.externalContract),
  ];
  if (isLandLease) cells.push(!isBlank(row.dueDate1) && row.amount1 !== null ? "Yes" : "No");
  return cells;
}

/* ═══════════════════════════════════════════════════════════════ the panel ════ */

export type PeriodPanelMode = "addContract" | "editContract" | "editPeriod" | "addPeriod";

export interface PeriodContext {
  mode: PeriodPanelMode;
  typeOfContract: number;
  subaccount: OpexSubaccount;
  /** `locSelectedLandLeaseCost` — the row being edited. */
  existing: OpexPeriodRow | null;
  /** `locNextPeriodReferenceCost` — the row Add Period was pressed on. */
  reference: OpexPeriodRow | null;
  /** Every period of this subaccount in the scope (start date, cascade, delete). */
  contractRows: OpexPeriodRow[];
}

/** `lbl_LandLease_RightPanel_NewEditPeriod_BodyHeader_1.Text` — the four-way title. */
export function periodPanelTitle(mode: PeriodPanelMode, subaccountName: string): string {
  switch (mode) {
    case "addContract": return `Add Contract Type : ${subaccountName}`;
    case "editContract": return `Edit Contract : ${subaccountName}`;
    case "editPeriod": return `Edit Period : ${subaccountName}`;
    case "addPeriod": return `Add Period : ${subaccountName}`;
  }
}

export const modeFor = (existing: OpexPeriodRow | null, reference: OpexPeriodRow | null): PeriodPanelMode =>
  existing ? (existing.period === PERIOD_ONE ? "editContract" : "editPeriod")
    : reference ? "addPeriod" : "addContract";

/** `Or(locSelectedLandLeaseCost.Period = 'Period 1', And(IsBlank(record), IsBlank(reference)))`. */
export const isPeriodOneOrNew = (ctx: PeriodContext): boolean =>
  ctx.existing ? ctx.existing.period === PERIOD_ONE : ctx.reference === null;

/** `txt_…_Description_1.Value` (Disabled) — derived, never typed. */
export function derivedDescription(ctx: PeriodContext): string {
  if (ctx.existing) return ctx.existing.description ?? "";
  if (ctx.reference) {
    const head = ctx.contractRows.find((r) => r.period === PERIOD_ONE);
    return `${head?.description ?? ""} - ${periodIndex(ctx.reference.period) + 2}`;
  }
  const prefix = ctx.typeOfContract === CHOICE_ADMIN.contractTypes.opexOther ? " Opex"
    : ctx.typeOfContract === CHOICE_ADMIN.contractTypes.landlease ? " LL" : "";
  return `Standard${prefix} ${ctx.subaccount.name}`;
}

/**
 * `txt_…_StartDate.Value` (Disabled): Add Period → "COD + y Years m Months" over EVERY period of
 * the subaccount; Edit → the stored string, else "Cluster 6: Operation"; new → the same default.
 */
export function startDateText(ctx: PeriodContext): string {
  if (!ctx.existing && ctx.reference) return codOffsetText(sumMonths(ctx.contractRows));
  return ctx.existing?.startDateString ?? START_DATE_DEFAULT;
}

/** `colYearsForDuration` (Value < 36) and `colMonthsForDuration` (`App.pa.yaml`). */
export const YEAR_OPTIONS: readonly { value: number; label: string }[] = Array.from({ length: 36 }, (_, v) =>
  ({ value: v, label: `${v} ${v === 0 || v === 1 ? "year" : "years"}` }));
export const MONTH_OPTIONS: readonly { value: number; label: string }[] = Array.from({ length: 12 }, (_, v) =>
  ({ value: v, label: `${v} ${v === 0 || v === 1 ? "month" : "months"}` }));

/** `vsb_thresholds` option labels (customizations.xml). */
export const THRESHOLD_OPTIONS: readonly { value: number; label: string }[] = [
  { value: CHOICE_ADMIN.thresholdType.netYieldP75, label: "Net Yield p75" },
  { value: CHOICE_ADMIN.thresholdType.netYieldP90, label: "Net Yield p90" },
  { value: CHOICE_ADMIN.thresholdType.individual, label: "Individual" },
];

export interface OpexPeriodForm {
  durationYears: number | null;
  durationMonths: number | null;
  fixCosts: string;
  percentOfRevenues: string;
  eurPerMwh: string;
  eurPerMw: string;
  eurPerWtg: string;
  aggregation: number | null;
  distributionFrequency: number | null;
  useInflationProfile: boolean;
  useCountryInflationProfile: boolean;
  area: string | null;
  inflationProfile: string;
  dueDate1: string;
  amount1: string;
  dueDate2: string;
  amount2: string;
  dueDate3: string;
  amount3: string;
  /** `locShowSecondPayment` / `locShowThirdPayment`. */
  showSecond: boolean;
  showThird: boolean;
  thresholdType: number | null;
  thresholdIndividual: string;
  externalContract: boolean;
  /** `locIsDirty`. */
  dirty: boolean;
}

const fixed = (v: number | null | undefined, places: number): string =>
  v === null || v === undefined ? "" : v.toFixed(places);

/**
 * `If(Int(x) = x, Text(x, "#"), Text(x, "#0.0#"))`.
 *
 * SOURCE DEFECT (fixed): `Text(0, "#")` prints nothing, so a stored 0 opens blank and is saved
 * back as blank. Here 0 shows "0".
 */
export function rateText(v: number | null | undefined): string {
  if (v === null || v === undefined) return "";
  if (Number.isInteger(v)) return String(v);
  const two = v.toFixed(2);
  return two.endsWith("0") ? v.toFixed(1) : two;
}

const coalesceDefined = <T,>(...vals: (T | null | undefined)[]): T | null => {
  for (const v of vals) if (v !== null && v !== undefined && (v as unknown) !== "") return v;
  return null;
};

/** Inflation toggles default to Yes for O&M and Other OPEX, No for Land Lease. */
const inflationDefault = (typeOfContract: number): boolean =>
  typeOfContract === CHOICE_ADMIN.contractTypes.opexOandM || typeOfContract === CHOICE_ADMIN.contractTypes.opexOther;

/**
 * `tgl_OpexCosts_…_ExternalContract.Checked` — the record's value, else the reference's, else
 * false for the first Other-OPEX subaccount whose name contains "tcma", else true.
 *
 * SOURCE DEFECT (fixed): the canvas tests only `= Yes` on the record and the reference, so editing a
 * contract stored as "No" opens (and saves) "Yes"; and `Find("tcma", …)` is case-sensitive, so the
 * "TCMA" subaccount never matches. `externalContractDefaultCanvasParity` keeps the canvas rule.
 */
export function externalContractDefault(ctx: PeriodContext): boolean {
  const stored = coalesceDefined(ctx.existing?.externalContract, ctx.reference?.externalContract);
  if (stored !== null) return stored;
  return !(ctx.typeOfContract === CHOICE_ADMIN.contractTypes.opexOther && ctx.subaccount.order === 1
    && ctx.subaccount.name.toLowerCase().includes("tcma"));
}

export function externalContractDefaultCanvasParity(ctx: PeriodContext): boolean {
  if (ctx.existing?.externalContract === true) return true;
  if (ctx.reference?.externalContract === true) return true;
  if (ctx.typeOfContract === CHOICE_ADMIN.contractTypes.opexOther && ctx.subaccount.order === 1
    && ctx.subaccount.name.includes("tcma")) return false;
  return true;
}

const hasPayment = (amount: number | null | undefined, due: string | null | undefined): boolean =>
  amount !== null && amount !== undefined && !isBlank(due);

/** `txt_…_InflationProfile_1.Value` — depends on the Country Inflation toggle. */
export function inflationProfileText(ctx: PeriodContext, useCountry: boolean): string {
  if (useCountry) return "Country Inflation Profile";
  if (!ctx.existing && !ctx.reference) return "";
  return fixed(coalesceDefined(ctx.existing?.inflationProfile, ctx.reference?.inflationProfile), 1);
}

/**
 * The panel form, as the inputs' `Default` / `Value` formulas compute it when the panel opens.
 * Rates come from the record only (`locSelectedLandLeaseCost`); the cascaded fields fall back to
 * the reference row (`Coalesce(record, reference)`).
 *
 * SOURCE DEFECT (fixed): Edit does not reset `locShowSecondPayment` / `locShowThirdPayment`, so it
 * kept whatever the previous Add Period set. Here they are shown only for Add Period, from the
 * reference row.
 */
export function toOpexForm(ctx: PeriodContext): OpexPeriodForm {
  const r = ctx.existing;
  const ref = ctx.reference;
  const useInflation = coalesceDefined(r?.useInflationProfile, ref?.useInflationProfile) ?? inflationDefault(ctx.typeOfContract);
  const useCountry = coalesceDefined(r?.useCountryInflationProfile, ref?.useCountryInflationProfile) ?? inflationDefault(ctx.typeOfContract);
  const years = r?.durationYears ?? null;
  const frequency = r?.distributionFrequency ?? null;
  return {
    durationYears: years,
    durationMonths: r?.durationMonths ?? (years !== null ? 0 : null),
    fixCosts: fixed(r?.fixCosts, 2),
    percentOfRevenues: rateText(r?.percentOfRevenues),
    eurPerMwh: rateText(r?.eurPerMwh),
    eurPerMw: rateText(r?.eurPerMw),
    eurPerWtg: rateText(r?.eurPerWtg),
    aggregation: r?.aggregation ?? CHOICE_PRODUCTION.aggregation.sum,
    distributionFrequency: [1, 2, 3, 6, 12].includes(frequency ?? -1) ? frequency : null,
    useInflationProfile: useInflation,
    useCountryInflationProfile: useCountry,
    area: coalesceDefined(r?.inflationArea, ref?.inflationArea),
    inflationProfile: inflationProfileText(ctx, useCountry),
    dueDate1: coalesceDefined(r?.dueDate1, ref?.dueDate1) ?? "",
    amount1: fixed(coalesceDefined(r?.amount1, ref?.amount1), 2),
    dueDate2: coalesceDefined(r?.dueDate2, ref?.dueDate2) ?? "",
    amount2: fixed(coalesceDefined(r?.amount2, ref?.amount2), 2),
    dueDate3: coalesceDefined(r?.dueDate3, ref?.dueDate3) ?? "",
    amount3: fixed(coalesceDefined(r?.amount3, ref?.amount3), 2),
    showSecond: !r && ref !== null && hasPayment(ref.amount2, ref.dueDate2),
    showThird: !r && ref !== null && hasPayment(ref.amount3, ref.dueDate3),
    thresholdType: coalesceDefined(r?.thresholdType, ref?.thresholdType),
    thresholdIndividual: coalesceDefined(r?.thresholdIndividual, ref?.thresholdIndividual)?.toString() ?? "",
    externalContract: externalContractDefault(ctx),
    dirty: false,
  };
}

/**
 * `drp_…_DurationMonths_1.DefaultSelectedItems` — once a year is picked and the record has no
 * months, months become 0.
 */
export const changeDurationYears = (form: OpexPeriodForm, years: number | null): OpexPeriodForm =>
  ({ ...form, durationYears: years, durationMonths: form.durationMonths ?? (years !== null ? 0 : null), dirty: true });

/**
 * `tgl_…_InflationProfile_1.OnUncheck` resets the country toggle, area and profile;
 * `tgl_…_CountryInflationProfile_1.OnSelect` resets the profile and the area.
 */
export function changeInflation(form: OpexPeriodForm, ctx: PeriodContext, useInflation: boolean): OpexPeriodForm {
  if (useInflation) return { ...form, useInflationProfile: true, dirty: true };
  const reset = toOpexForm(ctx);
  return {
    ...form, useInflationProfile: false, useCountryInflationProfile: reset.useCountryInflationProfile,
    area: reset.area, inflationProfile: reset.inflationProfile, dirty: true,
  };
}

export function changeCountryInflation(form: OpexPeriodForm, ctx: PeriodContext, useCountry: boolean): OpexPeriodForm {
  return {
    ...form, useCountryInflationProfile: useCountry,
    inflationProfile: inflationProfileText(ctx, useCountry), area: toOpexForm(ctx).area, dirty: true,
  };
}

/* ═════════════════════════════════════════════════════════════ field errors ════ */

/** The error label shows only for a non-blank value; these return its text, or `null`. */
export function fixCostsError(raw: string, language = "en-US"): string | null {
  if (isBlank(raw)) return null;
  if (!isTwoDecimal(raw, language)) return "Value must be a numeric with two decimal places.";
  if (!inRange(raw, 0, 1_000_000_000, language)) return "Value must be between 0 and 1,000,000,000.0.";
  return null;
}

export function percentOfRevenuesError(raw: string, language = "en-US"): string | null {
  if (isBlank(raw)) return null;
  if (!isTwoDecimal(raw, language)) return "Value must be a numeric with two decimal place.";
  if (!inRange(raw, 0, 10_000, language)) return "Please select a value between 0 and 10,000.0.";
  return null;
}

/** EUR/MWh, EUR/MW and EUR/WTG. */
export function rateError(raw: string, language = "en-US"): string | null {
  if (isBlank(raw)) return null;
  if (!isTwoDecimal(raw, language)) return "Value must be a numeric with two decimal places.";
  if (!inRange(raw, 0, 100_000_000, language)) return "Please select a value between 0 and 100,000,000.0.";
  return null;
}

/** The three one-time-payment amounts. */
export function paymentAmountError(raw: string, language = "en-US"): string | null {
  if (isBlank(raw)) return null;
  if (!isTwoDecimal(raw, language)) return "Value must be a number";
  if (!inRange(raw, 0, 1_000_000_000, language)) return "Please select a value between 0 and 1,000,000,000.0.";
  return null;
}

/** `^(0[1-9]|1[0-2])\/\d{4}$`. */
export const dueDateError = (raw: string): string | null =>
  !isBlank(raw) && !/^(0[1-9]|1[0-2])\/\d{4}$/.test(raw) ? "Due Date must be in format MM/YYYY." : null;

/** Shown only for a custom profile (country toggle off). */
export function inflationProfileError(raw: string, useCountry: boolean, language = "en-US"): string | null {
  if (useCountry || isBlank(raw)) return null;
  const numericInRange = isNumeric(raw, language) && inRange(raw, 0, 100, language);
  if (isOneDecimal(raw, language) && numericInRange) return null;
  if (!isOneDecimal(raw, language)) return "Value must be a numeric with 1 decimal place.";
  return isNumeric(raw, language) ? "Please select a value between 0 and 100." : "Value must be a numeric with 1 decimal place";
}

export function thresholdIndividualError(raw: string, language = "en-US"): string | null {
  if (isBlank(raw)) return null;
  if (!isOneDecimal(raw, language)) return "Numeric value with maximum of one decimals";
  if (!inRange(raw, 0, 10_000_000, language)) return "Please select a value between 0 and 10000000.";
  return null;
}

/** `lbl_…_DurationYearMonths_ErrorMessage` — verbatim. */
export const durationError = (form: OpexPeriodForm): string | null =>
  form.durationYears === 0 && form.durationMonths === 0 ? "0 year 0 months can't be selected" : null;

/**
 * `lbl_LandLease_RightPanel_NewEditPeriod_BodyButtons_Hint_1.Visible` — for a new contract or
 * Period 1 the five rates AND the first one-time payment are blank; otherwise the five rates.
 */
export function hintVisible(form: OpexPeriodForm, ctx: PeriodContext): boolean {
  const ratesBlank = [form.fixCosts, form.percentOfRevenues, form.eurPerMwh, form.eurPerMw, form.eurPerWtg]
    .every((v) => isBlank(v));
  return isPeriodOneOrNew(ctx) ? ratesBlank && isBlank(form.amount1) && isBlank(form.dueDate1) : ratesBlank;
}

/**
 * `pcf_LandLease_RightPanel_NewEditPeriod_BodyButtons_Save_1.DisplayMode`, term by term (One-Time
 * Payment and Threshold are hard-wired off, so their branches reduce to the duration branch).
 */
export function canSaveOpexPeriod(
  form: OpexPeriodForm,
  ctx: PeriodContext,
  countryName: string | null,
  language = "en-US",
): boolean {
  if (!form.dirty || isBlank(derivedDescription(ctx))) return false;
  const anyError = [
    rateError(form.eurPerMwh, language), rateError(form.eurPerMw, language), rateError(form.eurPerWtg, language),
    percentOfRevenuesError(form.percentOfRevenues, language), fixCostsError(form.fixCosts, language),
    paymentAmountError(form.amount1, language), dueDateError(form.dueDate1),
    paymentAmountError(form.amount2, language), dueDateError(form.dueDate2),
    paymentAmountError(form.amount3, language), dueDateError(form.dueDate3),
    inflationProfileError(form.inflationProfile, form.useCountryInflationProfile, language),
    thresholdIndividualError(form.thresholdIndividual, language),
  ].some((e) => e !== null);
  if (anyError || hintVisible(form, ctx)) return false;
  if (countryName === "Italy" && form.useInflationProfile && form.useCountryInflationProfile && isBlank(form.area)) {
    return false;
  }
  if (form.useInflationProfile && !form.useCountryInflationProfile && isBlank(form.inflationProfile)) return false;
  if (form.durationYears === null || form.durationMonths === null || durationError(form) !== null) return false;
  if (form.aggregation === null || form.distributionFrequency === null) return false;
  if (form.showSecond && (isBlank(form.dueDate2) || isBlank(form.amount2))) return false;
  if (form.showThird && (isBlank(form.dueDate3) || isBlank(form.amount3))) return false;
  return true;
}

/* ═══════════════════════════════════════════════════════════ the Period-1 cascade ════ */

/**
 * Editing Period 1 cascades EXACTLY these seventeen columns to every later period of the
 * subaccount; rates, aggregation, durations and frequency stay per period.
 */
export const CASCADE_COLUMNS: readonly string[] = [
  OPEX_COL.thresholdIndividual, OPEX_COL.threshold, OPEX_COL.thresholdType,
  OPEX_COL.alignWithProjectDuration, OPEX_COL.inflationArea, OPEX_COL.inflationCountryArea,
  OPEX_COL.inflationProfile, OPEX_COL.useInflationProfile, OPEX_COL.useCountryInflationProfile,
  OPEX_COL.allWtgAllocated, OPEX_COL.secured,
  OPEX_COL.amountOneTimePayment, OPEX_COL.dueDateOneTimePayment,
  OPEX_COL.amountOneTimePayment2, OPEX_COL.dueDateOneTimePayment2,
  OPEX_COL.amountOneTimePayment3, OPEX_COL.dueDateOneTimePayment3,
];

export const NON_CASCADE_COLUMNS: readonly string[] = [
  OPEX_COL.eurPerMwh, OPEX_COL.eurPerMw, OPEX_COL.eurPerWtg, OPEX_COL.fixCosts,
  OPEX_COL.percentOfRevenues, OPEX_COL.aggregation, OPEX_COL.distributionFrequency,
  OPEX_COL.durationYears, OPEX_COL.durationMonths,
];

export function cascadeFieldsFromPeriodOne(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of CASCADE_COLUMNS) if (key in payload) out[key] = payload[key];
  return out;
}

/* ═════════════════════════════════════════════════════════════════════ the save ════ */

const numberOrNull = (raw: string): number | null => {
  if (isBlank(raw)) return null;
  const n = Number(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const textOrNull = (raw: string): string | null => (isBlank(raw) ? null : raw);

/** The currency the Save writes: `LookUp(Currencies, 'Currency Code' = If(Poland, "PLN", "EUR"))`. */
export const currencyFor = (currencies: readonly CurrencyRef[], countryName: string | null): CurrencyRef | null =>
  currencies.find((c) => c.code === (countryName === "Poland" ? "PLN" : "EUR")) ?? null;

/** The Save `Patch` — every column the canvas writes, on create and update alike. */
export function buildOpexPayload(
  form: OpexPeriodForm,
  args: { ctx: PeriodContext; scope: OpexScope; period: number; isLastPeriod: boolean; currencyId: string | null },
): Record<string, unknown> {
  const { ctx, scope } = args;
  const description = derivedDescription(ctx);
  const data: Record<string, unknown> = {
    [OPEX_COL.name]: `${description} - ${scope.countryName ?? ""} - ${scope.technology ?? ""}`,
    [OPEX_COL.startDateString]: startDateText(ctx),
    [OPEX_COL.description]: description,
    [OPEX_COL.allWtgAllocated]: OPEX_FIXED.allWtgAllocated,
    [OPEX_COL.typeOfContract]: ctx.typeOfContract,
    [OPEX_COL.dueDateOneTimePayment]: textOrNull(form.dueDate1),
    [OPEX_COL.amountOneTimePayment]: numberOrNull(form.amount1),
    [OPEX_COL.secured]: OPEX_FIXED.secured,
    [OPEX_COL.period]: args.period,
    [OPEX_COL.dueDateOneTimePayment2]: textOrNull(form.dueDate2),
    [OPEX_COL.amountOneTimePayment2]: numberOrNull(form.amount2),
    [OPEX_COL.dueDateOneTimePayment3]: textOrNull(form.dueDate3),
    [OPEX_COL.amountOneTimePayment3]: numberOrNull(form.amount3),
    [OPEX_COL.inflationCountryArea]: form.area,
    [OPEX_COL.inflationProfile]: form.useCountryInflationProfile ? null : numberOrNull(form.inflationProfile),
    [OPEX_COL.inflationStartYearString]: INFLATION_START_YEAR_LITERAL,
    [OPEX_COL.useInflationProfile]: form.useInflationProfile,
    [OPEX_COL.useCountryInflationProfile]: form.useCountryInflationProfile,
    [OPEX_COL.fixCosts]: numberOrNull(form.fixCosts),
    [OPEX_COL.percentOfRevenues]: numberOrNull(form.percentOfRevenues),
    [OPEX_COL.aggregation]: form.aggregation,
    [OPEX_COL.durationYears]: form.durationYears,
    [OPEX_COL.durationMonths]: form.durationMonths,
    [OPEX_COL.eurPerMwh]: numberOrNull(form.eurPerMwh),
    [OPEX_COL.eurPerMw]: numberOrNull(form.eurPerMw),
    [OPEX_COL.eurPerWtg]: numberOrNull(form.eurPerWtg),
    [OPEX_COL.distributionFrequency]: form.distributionFrequency,
    [OPEX_COL.technology]: scope.technologyValue,
    [OPEX_COL.isLastPeriod]: args.isLastPeriod,
    [OPEX_COL.thresholdIndividual]: numberOrNull(form.thresholdIndividual),
    [OPEX_COL.threshold]: OPEX_FIXED.threshold,
    [OPEX_COL.thresholdType]: form.thresholdType,
    [OPEX_COL.alignWithProjectDuration]: OPEX_FIXED.alignWithProjectDuration,
    [OPEX_COL.inflationArea]: form.area,
    [OPEX_COL.externalContract]: form.externalContract,
  };
  if (scope.countryId) data[`${OPEX_LOOKUP.country}@odata.bind`] = `/${ES.countries}(${scope.countryId})`;
  if (args.currencyId) data[`${OPEX_LOOKUP.currency}@odata.bind`] = `/${ES.currencies}(${args.currencyId})`;
  if (kindOf(ctx.typeOfContract) === "landLease") {
    data[`${OPEX_LOOKUP.landLeaseSubaccount}@odata.bind`] = `/${ES_PLANT.landLeaseSubaccounts}(${ctx.subaccount.id})`;
  } else {
    data[`${OPEX_LOOKUP.opexSubaccount}@odata.bind`] = `/${ES_PLANT.opexSubaccounts}(${ctx.subaccount.id})`;
  }
  return data;
}

/**
 * The Save, in the canvas order: the period create / update; for Add Period, the reference row's
 * `'IsLastPeriod?' = No`; for an edited Period 1, the seventeen cascade columns on every later
 * period of the subaccount. Not transactional (KNOWN-RISKS).
 */
export function planSaveOpexPeriod(args: {
  form: OpexPeriodForm;
  ctx: PeriodContext;
  scope: OpexScope;
  currencyId: string | null;
  canEdit: boolean;
  noPermissionText: string;
  incompleteText: string;
  addPeriodBlockedText: string;
  language?: string;
}): WritePlan {
  const { ctx } = args;
  if (!args.canEdit) return refuse(args.noPermissionText);
  if (!canSaveOpexPeriod(args.form, ctx, args.scope.countryName, args.language)) return refuse(args.incompleteText);
  let period: number;
  if (ctx.existing) period = ctx.existing.period ?? PERIOD_ONE;
  else if (ctx.reference) {
    const next = nextPeriod(ctx.reference.period);
    if (next === null) return refuse(args.addPeriodBlockedText);
    period = next;
  } else period = PERIOD_ONE;

  const payload = buildOpexPayload(args.form, {
    ctx, scope: args.scope, period, isLastPeriod: ctx.existing?.isLastPeriod ?? true, currencyId: args.currencyId,
  });
  const plan = emptyPlan();
  const label = `Period ${periodIndex(period) + 1}`;
  plan.writes.push(ctx.existing
    ? { op: "update", entitySet: OPEX_ENTITY_SET, id: ctx.existing.id, data: payload, reason: `${label} updated` }
    : { op: "create", entitySet: OPEX_ENTITY_SET, data: payload, reason: `${label} created` });

  if (!ctx.existing && ctx.reference) {
    plan.writes.push({
      op: "update", entitySet: OPEX_ENTITY_SET, id: ctx.reference.id,
      data: { [OPEX_COL.isLastPeriod]: false }, reason: "The previous period is no longer the last period",
    });
  }

  if (ctx.existing && ctx.existing.period === PERIOD_ONE) {
    const cascade = cascadeFieldsFromPeriodOne(payload);
    for (const later of ctx.contractRows) {
      if (later.id === ctx.existing.id || later.period === PERIOD_ONE) continue;
      plan.writes.push({
        op: "update", entitySet: OPEX_ENTITY_SET, id: later.id, data: { ...cascade },
        reason: `Period ${periodIndex(later.period) + 1} inherits the Period 1 settings`,
      });
    }
  }
  return plan;
}

/* ══════════════════════════════════════════════════════════════════ the delete ════ */

/**
 * The delete dialog's OnConfirm. Period 1 → every period of the contract (subaccount, country,
 * technology, type). Otherwise the row, and the new tail gets `'IsLastPeriod?' = Yes`.
 *
 * SOURCE DEFECT (fixed): the canvas picks the new tail as `First(LastN(Sort(rows, Description), 2))`
 * — by DESCRIPTION, so "X - 10" sorts before "X - 2" and the wrong row becomes the tail. Here the
 * tail is the highest remaining period; `newTailCanvasParity` keeps the canvas rule.
 */
export function planDeleteOpexPeriodOrContract(args: {
  target: OpexPeriodRow;
  contractRows: readonly OpexPeriodRow[];
  canEdit: boolean;
  noPermissionText: string;
}): WritePlan {
  if (!args.canEdit) return refuse(args.noPermissionText);
  const plan = emptyPlan();
  if (args.target.period === PERIOD_ONE) {
    for (const p of args.contractRows) {
      plan.writes.push({
        op: "delete", entitySet: OPEX_ENTITY_SET, id: p.id,
        reason: `Period ${periodIndex(p.period) + 1} deleted with the contract`,
      });
    }
    return plan;
  }
  plan.writes.push({
    op: "delete", entitySet: OPEX_ENTITY_SET, id: args.target.id,
    reason: `Period ${periodIndex(args.target.period) + 1} deleted`,
  });
  const newTail = args.contractRows.filter((p) => p.id !== args.target.id)
    .sort((a, b) => periodIndex(b.period) - periodIndex(a.period))[0];
  if (newTail) {
    plan.writes.push({
      op: "update", entitySet: OPEX_ENTITY_SET, id: newTail.id, data: { [OPEX_COL.isLastPeriod]: true },
      reason: `Period ${periodIndex(newTail.period) + 1} becomes the last period`,
    });
  }
  return plan;
}

export function newTailCanvasParity(contractRows: readonly OpexPeriodRow[]): OpexPeriodRow | null {
  const byDescription = [...contractRows].sort((a, b) => (a.description ?? "").localeCompare(b.description ?? ""));
  return byDescription.slice(-2)[0] ?? null;
}

/* ═════════════════════════════════════════════════════════════ panel captions ════ */

const cur = (countryName: string | null): string => (countryName === "Poland" ? "PLN" : "EUR");

/** `lbl_LandLease_Content_Subaccounts_CardBody_CostsTableHeader_*.Text`, in X order; OTP for Land Lease only. */
export function opexColumnHeaders(isLandLease: boolean, countryName: string | null): string[] {
  const c = cur(countryName);
  const headers = [
    "Description", "Start Date", "Duration", "End Date", "Currency", "Inflation Profile [%]",
    `Fix Costs p.a. [${c}]`, "% of Revenues", `${c}/MWh p.a.`, `${c}/MW p.a.`, `${c}/WTG p.a.`,
    "Aggregation",
    isLandLease ? "Secured" : "Distribution Frequency",
    isLandLease ? "Allocation" : "External Contract",
  ];
  if (isLandLease) headers.push("OTP");
  return headers;
}

/** The OPEX period panel's captions (`con_LandLease_RightPanel_NewEditPeriod_*`), verbatim. */
export function periodPanelLabels(countryName: string | null) {
  const c = cur(countryName);
  return {
    description: "Description",
    startDate: "Start Date",
    duration: "Duration",
    /** `drp_…_DurationYears_1.AccessibleLabel` / `drp_…_DurationMonths_1.AccessibleLabel`. */
    year: "Year",
    month: "Month",
    currency: "Currency",
    fixCosts: `Fix Costs p.a. [${c}]`,
    shareOfRevenues: "Share of Revenues [%]",
    perMwh: `${c}/MWh p.a.`,
    perMw: `${c}/MW p.a.`,
    perWtg: `${c}/WTG p.a.`,
    aggregation: "Aggregation",
    distributionFrequency: "Distribution Frequency",
    secured: "Secured",
    allocateToAllWtgs: "Allocate to all WTGs",
    inflationProfileToggle: "Inflation Profile",
    countryInflationProfile: "Country Inflation Profile",
    inflationStartYear: "Inflation Start Year",
    inflationStartYearPlaceholder: "YYYY",
    area: "Area",
    customInflationProfile: "Custom Inflation Profile [%]",
    oneTimePayment: "One-Time Payment",
    dueDate: (n: 1 | 2 | 3) => `One-Time Payment ${n} Date`,
    amount: (n: 1 | 2 | 3) => `One-Time Payment ${n} [${c}]`,
    dueDatePlaceholder: "MM/YYYY",
    addOneTimePayment: "Add One-Time payment",
    deleteOneTimePayment: "Delete One-Time payment",
    thresholdToggle: `Threshold for ${c}/MWh p.a.`,
    threshold: "Threshold",
    individualThreshold: "Individual Threshold [MWh p.a.]",
    alignWithProjectDuration: "Align with Project Duration",
    externalContract: "External Contract",
    atLeastOneFigureHint: "Please fill in at least one commercial figure",
  } as const;
}

/** `ADD_PERIOD_BLOCKED` — NEW: the refusal at ten periods (the canvas created a second Period 1). */
export const ADD_PERIOD_BLOCKED_REASON = "A contract can have at most ten periods.";
