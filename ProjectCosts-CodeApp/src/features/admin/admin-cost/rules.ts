/**
 * Costs settings — every business rule as a pure function (tested in `rules.test.ts`).
 *
 * Canvas citations ACS:<line> = `Admin Cost Screen.pa.yaml`
 * (`ProjectDocs/_extracted/msapp/projectmanagement/Src/`). Decision log: D24 (the canvas
 * analysis) and D36 (this implementation).
 *
 * SOURCE DEFECTs fixed here (each marked below): `locEditSaveButtonEnabled` never reset
 * (`canSaveDevex`); the Cost Paid By default tested by account number but read by sub-account
 * (`withDevexSubaccount`); a stored 0 opened blank (`inputText`); the grid's ×100 percent
 * (`PERCENT_DISPLAY`); an 11th Add Period (`canAddPeriod`); the External Contract default flipping
 * a stored "No" and its case-sensitive TCMA test (`opexStandardDefaults`,
 * `defaultExternalContract`). The port dropped the `…CanvasParity` twins of all of them except
 * `fmtCanvasPercent` — a gap against CONVENTIONS rule 8, recorded under D36.
 *
 * HIDDEN CONTROLS: `btn_Filter_Devex_Capex_Assumptions` (Select()-ed by OnVisible, the picker,
 * Save and Delete) → `buildDevexTree` + the open-category set in `Screen.tsx`;
 * `btn_AdminCost_DevexCapex_Delete_StandardCost_Confirm` → `planDeleteDevexCost`;
 * `btn_LandLease_NewEditPeriod_ResetButton` / `btn_AdminCost_RightPanel_Form_AddStandardCost_
 * Button_Reset` → each panel's form is rebuilt from `opexStandardDefaults` / `emptyDevexForm` on
 * open; `fn_Numeric_CC` → `@/domain/numeric` (`isTwoDecimalCanvasParity` …).
 */
import { inRange, isInteger, isOneDecimalCanvasParity, isTwoDecimalCanvasParity, parseNumber } from "@/domain/numeric";
import { numberFormat } from "@/domain/locale";
import { formatFixed, formatStoredPercent, inRangeNumberInput, parseNumberInput } from "@/domain/numberInput";
import { PICKER_COUNTRIES, scopeBreadcrumb, type CountryRow, type CountryTechnology } from "@/domain/countryPicker";
import { isDirty } from "@/domain/form";
import { userErrorText } from "@/platform/userMessage";
import { ES_ADMIN } from "@/data/dataverseNames";
import { emptyPlan, guardedUpdate, refusePlan, type PlannedWrite, type WritePlan } from "@/data/writePlan";
import {
  type CapexHierarchy, type CapexSubaccount, type CostCurrency, type CostScope, type DevexCost,
  type DevexWrite, type LandLeaseSubaccount, type OpexFields, type OpexPeriod, type OpexSubaccountRow,
  type OpexWrite, type OtpValues,
} from "@/data/adminCost";
import {
  AGGREGATION, CONTRACT_TYPE, COST_UNIT, MAX_PERIOD, TECHNOLOGY, TECHNOLOGY_LABEL, ContractDeleteError,
  DevexRuleError, OpexFollowUpError, OpexRuleError, type CostTechnology, type OpexContractType,
} from "@/domain/costStandards";
import { COST_UNIT_LABEL, MSG } from "./constants";

/* ═══════════════════════════════════════════════════════════════ selection ══ */

/*
 * The picker list and the Germany / Wind default use the shared picker model
 * (`pickerCountries(rows, COST_COUNTRY_RULE)`, `COST_DEFAULT`, `COST_TECHNOLOGIES`,
 * `useCountryTechnologySelection`) with `COST_TECHNOLOGIES_FOR` from `./constants`.
 * `toCostSelection` below re-checks the rule as defence in depth.
 */

/**
 * The canvas `Nestings` (ACS:650-733) give technologies only to the six
 * configured countries (exact name). Any other country has no technology, so no scope.
 */
export function hasCostTechnologies(countryName: string): boolean {
  return PICKER_COUNTRIES.some((c) => c.name === countryName);
}

/**
 * The shared selection resolved for the rules and writes below: they also need the country NAME
 * (currency, units, Italy area, the written `vsb_name` / `vsb_description`), which the shared
 * `CountryTechnology` does not carry.
 */
export interface CostSelection {
  countryId: string;
  countryName: string;
  technology: CostTechnology;
}

/**
 * The shared picker selection plus its country row → `CostSelection`. `undefined` while nothing
 * is selected, and for a country without canvas technologies — so no scope, no reads
 * and no writes exist for it. The technology must be Wind or PV.
 */
export function toCostSelection(
  selection: CountryTechnology | undefined, country: Pick<CountryRow, "name"> | undefined,
): CostSelection | undefined {
  if (!selection || !country) return undefined;
  if (!hasCostTechnologies(country.name)) return undefined;
  if (selection.technology !== TECHNOLOGY.wind && selection.technology !== TECHNOLOGY.pv) return undefined;
  return { countryId: selection.countryId, countryName: country.name, technology: selection.technology as CostTechnology };
}

export function toScope(selection: CostSelection): CostScope {
  return { countryId: selection.countryId, technology: selection.technology };
}

/**
 * `If(cmp_Admin_Costs_Assumption_NestedCountryPickerColumn.SelectedCountry.Name = "Poland", "PLN",
 * "EUR")` — the currency every OPEX caption, header and the unit error repeat.
 */
export function currencyCode(countryName: string): "PLN" | "EUR" {
  return countryName === "Poland" ? "PLN" : "EUR";
}

/** `Label1.Text` — `$"Standard Assumptions / Costs / {Country} / {Technology}"` (ACS:779), verbatim. */
export function breadcrumbText(countryName: string, technology: CostTechnology): string {
  return scopeBreadcrumb("Standard Assumptions / Costs", countryName, TECHNOLOGY_LABEL[technology]);
}

/* ═════════════════════════════════════════════════════════════ formatting ══ */

/** The canvas `Text(n, "###,###")` rendered with the app language's separators (en). */
const GRID_LOCALE = "en-US";
/** `"###,###,###,###"`. */
export const fmtInteger = (n: number | undefined) => (n === undefined ? "" : formatFixed(n, 0, GRID_LOCALE));
/** `"###,###,###,###.0#"`. */
export const fmtOneOrTwo = (n: number | undefined) =>
  (n === undefined ? "" : numberFormat(GRID_LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(n));

/**
 * Which percent display the grid uses. The stored `vsb_ofrevenues` /
 * `vsb_inflationprofile` are ALREADY percents: the panel inputs (0..10,000 / 0..100), every
 * project screen (`features/cost/periods/opexRules.ts` `formatRevenuePercent` /
 * `formatOneDecimalPercent`) and the project import read them that way.
 *
 * SOURCE DEFECT (fixed, pending product confirmation): the canvas grid's `Text(n, "… %")`
 * multiplies by 100 (`lbl_OpexCosts_…_CostsTableRow_ProcentOfRevenues_2` / `_InflationProfile_2`),
 * so stored 2 shows "200.0 %". Here it shows "2.0 %". `fmtCanvasPercent` is the canvas-parity twin;
 * flip this one constant to restore the canvas scaling.
 */
export const PERCENT_DISPLAY: "stored" | "canvasScaled" = "stored";

/**
 * The stored percent as-is, with the canvas decimals and the project screens' output:
 * `"###,###,###,##0.00 %"` (% of Revenues: 5 → "5.00 %") and `"###,###,###.0 %"`
 * (inflation: 2 → "2.0 %", 0.5 → "0.5 %").
 */
export function fmtStoredPercent(n: number | undefined, pattern: "revenue" | "inflation"): string {
  return formatStoredPercent(n, pattern === "revenue" ? 2 : 1, GRID_LOCALE);
}

/** The grid's percent cell text (see `PERCENT_DISPLAY`). */
export function fmtGridPercent(n: number | undefined, pattern: "revenue" | "inflation"): string {
  return PERCENT_DISPLAY === "stored" ? fmtStoredPercent(n, pattern) : fmtCanvasPercent(n, pattern);
}

/**
 * NOT USED by default (see `PERCENT_DISPLAY`). Power Fx `Text(n, "… %")`: the `%` placeholder
 * multiplies by 100. `"###,###,###,##0.00 %"` (% of Revenues, ACS:2286) keeps a leading zero;
 * `"###,###,###.0 %"` (inflation, ACS:2367) has no `0` integer placeholder (".5 %").
 */
export function fmtCanvasPercent(n: number | undefined, pattern: "revenue" | "inflation"): string {
  if (n === undefined) return "";
  const scaled = n * 100;
  if (pattern === "revenue") return `${formatFixed(scaled, 2, GRID_LOCALE)} %`;
  const text = formatFixed(scaled, 1, GRID_LOCALE).replace(/^(-?)0\./, "$1.");
  return `${text} %`;
}

/**
 * Panel prefill in the browser's decimal separator, so the culture-aware validation accepts it:
 * `"#0.00"` (Fix Costs), integer-or-`"#0.0#"` (the others).
 *
 * SOURCE DEFECT (fixed): the canvas prefills a whole rate with `Text(n, "#")`
 * (`txt_LandLease_…_EuroMW_1.Value` and its siblings), which prints nothing for 0, so a stored 0
 * opens blank and is saved back as blank. Here 0 shows "0".
 * SOURCE DEFECT (fixed): custom inflation uses `keep2` — the canvas `"0.0"` silently rounded a
 * stored 0.02 to 0.0 on re-save, so the stored precision (Dataverse decimal default, 2 dp) is kept.
 */
export function inputText(n: number | undefined, style: "fixed2" | "intOr2" | "fixed1" | "keep2", decimalSeparator: "." | ","): string {
  if (n === undefined) return "";
  let text: string;
  if (style === "fixed2") text = n.toFixed(2);
  else if (style === "fixed1") text = n.toFixed(1);
  else if (style === "keep2") {
    // At least one decimal like the canvas `"0.0"`, but never fewer than the column holds (2 dp).
    text = n.toFixed(2);
    if (text.endsWith("0")) text = text.slice(0, -1);
  }
  else if (Number.isInteger(n)) text = String(n);
  else {
    text = n.toFixed(2);
    if (text.endsWith("0")) text = text.slice(0, -1);
  }
  return decimalSeparator === "," ? text.replace(".", ",") : text;
}

/* ════════════════════════════════════════════════════════════ DEVEX/CAPEX ══ */

/** Sub-accounts with this many costs in scope are no longer offered (`cmb_…_Subaccount.Items`, `CountRows(…) < 50`). */
export const DEVEX_SUBACCOUNT_LIMIT = 50;
export const UNKNOWN_CATEGORY_ID = "__unknown__";

export interface DevexRowView {
  cost: DevexCost;
  /** The sub-account's parent account name. */
  account: string;
  /** `"{subaccount name} - {number}"`. */
  subaccount: string;
  description: string;
  costText: string;
  clusterText: string;
  commentTooltip: string;
  hasComment: boolean;
}
export interface DevexGroup { categoryId: string; categoryName: string; rows: DevexRowView[] }

export function unitLabel(unit: number | undefined): string {
  return unit === undefined ? "" : COST_UNIT_LABEL[unit] ?? "";
}

/** `lbl_DevexCapex_…_CostsTableHeader_Cluster_1.Text` — `"1,3,5"` for the true cluster flags. */
export function clusterText(clusters: readonly boolean[]): string {
  return clusters.map((on, i) => (on ? String(i + 1) : "")).filter(Boolean).join(",");
}

/** `lbl_DevexCapex_…_CostsTableHeader_Cost_1.Text` — `$"{Text(vsb_costamount, "###,###,###,###")} {vsb_unit}"`. */
export function costText(amount: number | undefined, unit: number | undefined): string {
  return `${fmtInteger(amount)} ${unitLabel(unit)}`.trim();
}

/**
 * `img_DevexCapex_Content_StandardCosts_CardBody_CostsTable_Comment.Tooltip` —
 * `$"{If(Len(comment) > 0, "Comment:")}⏎{If(Len(comment) > 0, comment, "Add Comment")}"`. The canvas
 * text keeps a leading line break when there is no comment; it is not reproduced.
 */
export function commentTooltip(comment: string): string {
  return comment.length > 0 ? `Comment:\n${comment}` : "Add Comment";
}

export function toDevexRowView(cost: DevexCost, sub: CapexSubaccount | undefined): DevexRowView {
  return {
    cost,
    account: sub?.accountName ?? "",
    subaccount: sub ? `${sub.name} - ${sub.number}` : "",
    description: cost.descriptionInput,
    costText: costText(cost.costAmount, cost.unit),
    clusterText: clusterText(cost.clusters),
    commentTooltip: commentTooltip(cost.comment),
    hasComment: cost.comment.length > 0,
  };
}

/**
 * `btn_Filter_Devex_Capex_Assumptions.OnSelect` (hidden, Select()-ed): one header per category
 * that has costs (category order), its costs ordered by account order then sub-account order.
 * DIVERGENCE: costs under a category outside the active hierarchy (e.g. deactivated) are listed
 * last under "(Unknown category)" rather than dropped, as the canvas grouping by category does.
 */
export function buildDevexTree(costs: readonly DevexCost[], hierarchy: CapexHierarchy): DevexGroup[] {
  const subById = new Map(hierarchy.subaccounts.map((s) => [s.id, s]));
  const known = new Set(hierarchy.categories.map((c) => c.id));
  const sortKey = (c: DevexCost): [number, number, string] => {
    const s = c.subaccountId ? subById.get(c.subaccountId) : undefined;
    return [s?.accountOrder ?? Number.MAX_SAFE_INTEGER, s?.order ?? Number.MAX_SAFE_INTEGER, c.descriptionInput];
  };
  const sorted = [...costs].sort((a, b) => {
    const ka = sortKey(a);
    const kb = sortKey(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2].localeCompare(kb[2]);
  });
  const view = (c: DevexCost) => toDevexRowView(c, c.subaccountId ? subById.get(c.subaccountId) : undefined);

  const groups: DevexGroup[] = [];
  for (const category of hierarchy.categories) {
    const rows = sorted.filter((c) => c.categoryId === category.id).map(view);
    if (rows.length > 0) groups.push({ categoryId: category.id, categoryName: category.name, rows });
  }
  const orphans = sorted.filter((c) => !c.categoryId || !known.has(c.categoryId)).map(view);
  // "(Unknown category)" is NEW — no canvas equivalent (see the DIVERGENCE above).
  if (orphans.length > 0) groups.push({ categoryId: UNKNOWN_CATEGORY_ID, categoryName: "(Unknown category)", rows: orphans });
  return groups;
}

export function costCountBySubaccount(costs: readonly DevexCost[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of costs) if (c.subaccountId) out.set(c.subaccountId, (out.get(c.subaccountId) ?? 0) + 1);
  return out;
}

export interface Option { value: string; label: string }

/**
 * `cmb_AdminCost_RightPanel_Form_AddCost_Fields_Subaccount.Items` (ACS:10352-10378): sub-accounts
 * of the chosen category (all when none) with fewer than 50 costs in scope. DIVERGENCE: the row
 * being edited keeps its own sub-account even at the limit.
 */
export function devexSubaccountOptions(
  hierarchy: CapexHierarchy, costs: readonly DevexCost[], categoryId: string | null, keepId?: string | null,
): Option[] {
  const counts = costCountBySubaccount(costs);
  return hierarchy.subaccounts
    .filter((s) => !categoryId || s.categoryId === categoryId)
    .filter((s) => s.id === keepId || (counts.get(s.id) ?? 0) < DEVEX_SUBACCOUNT_LIMIT)
    .map((s) => ({ value: s.id, label: s.aggregatedName }));
}

/** Category options — categories with at least one sub-account still under the limit. */
export function devexCategoryOptions(
  hierarchy: CapexHierarchy, costs: readonly DevexCost[], keepSubaccountId?: string | null,
): Option[] {
  const available = new Set(devexSubaccountOptions(hierarchy, costs, null, keepSubaccountId).map((o) => o.value));
  return hierarchy.categories
    .filter((c) => hierarchy.subaccounts.some((s) => s.categoryId === c.id && available.has(s.id)))
    .map((c) => ({ value: c.id, label: c.name }));
}

/**
 * `cmb_AdminCost_RightPanel_Form_AddCost_Fields_Unit.Items` (ACS:10567-10579): non-Poland Wind
 * EUR, EUR/MW(p), EUR/WTG; non-Poland PV EUR, EUR/MW(p); Poland the PLN equivalents.
 * DIVERGENCE: a stored unit outside the list stays selectable so its error can show.
 */
export function unitOptions(countryName: string, technology: CostTechnology, keep?: number | null): number[] {
  const poland = countryName === "Poland";
  const base = poland ? [COST_UNIT.pln, COST_UNIT.plnMw] : [COST_UNIT.eur, COST_UNIT.eurMw];
  const list: number[] = technology === TECHNOLOGY.wind
    ? [...base, poland ? COST_UNIT.plnWtg : COST_UNIT.eurWtg]
    : base;
  if (keep !== undefined && keep !== null && !list.includes(keep)) list.push(keep);
  return list;
}

export function defaultUnit(countryName: string): number {
  return countryName === "Poland" ? COST_UNIT.pln : COST_UNIT.eur;
}

export type ClusterFlags = [boolean, boolean, boolean, boolean, boolean];

export interface DevexForm {
  description: string;
  clusters: ClusterFlags;
  categoryId: string | null;
  subaccountId: string | null;
  costPaidBy: number | null;
  unit: number | null;
  cost: string;
  comment: string;
}

export function emptyDevexForm(countryName: string): DevexForm {
  return {
    description: "", clusters: [false, false, false, false, false],
    categoryId: null, subaccountId: null, costPaidBy: null,
    unit: defaultUnit(countryName), cost: "", comment: "",
  };
}

const PAID_BY_VALUES = new Set<number>([952850001, 952850002]);

/** Edit prefill: description, clusters, category, sub-account, payer, unit, amount, comment. */
export function devexFormFromCost(cost: DevexCost, countryName: string): DevexForm {
  return {
    description: cost.descriptionInput,
    clusters: [...cost.clusters] as ClusterFlags,
    categoryId: cost.categoryId ?? null,
    subaccountId: cost.subaccountId ?? null,
    costPaidBy: cost.costPaidBy !== undefined && PAID_BY_VALUES.has(cost.costPaidBy) ? cost.costPaidBy : null,
    unit: cost.unit ?? defaultUnit(countryName),
    cost: cost.costAmount === undefined ? "" : String(cost.costAmount),
    comment: cost.comment,
  };
}

/** `cmb_…_Category.OnChange` — a category change clears Sub-account and Cost Paid By (ACS:10240-10251). */
export function withDevexCategory(form: DevexForm, categoryId: string | null): DevexForm {
  return { ...form, categoryId, subaccountId: null, costPaidBy: null };
}

/**
 * `cmb_…_Subaccount.OnChange` (ACS:10379-10398): a sub-account change sets Category to the
 * sub-account's category and resets Cost Paid By to the SPV/DevCo mapping default for it.
 *
 * SOURCE DEFECT (fixed): the canvas default (`rad_…_Cost_Paid_By.DefaultSelectedItems`) TESTS the
 * mapping by `'Account Number' = Subaccount.Number` but READS it by
 * `'Name (Sub-Account)' = Subaccount`, so a mapping row matched by only one of the two keys gives
 * no default. Here the default is read by sub-account id only (`payerDefaults`, built by
 * `loadCostPayerDefaults`). The `mappedCostPaidByCanvasParity` twin was dropped by the port.
 */
export function withDevexSubaccount(
  form: DevexForm, subaccountId: string | null, hierarchy: CapexHierarchy, payerDefaults: ReadonlyMap<string, number>,
): DevexForm {
  const sub = subaccountId ? hierarchy.subaccounts.find((s) => s.id === subaccountId) : undefined;
  return {
    ...form,
    subaccountId,
    categoryId: sub?.categoryId ?? form.categoryId,
    costPaidBy: subaccountId ? payerDefaults.get(subaccountId) ?? null : null,
  };
}

/** `cmb_…_Unit.OnChange` — a unit change clears Cost (ACS:10580). */
export function withDevexUnit(form: DevexForm, unit: number | null): DevexForm {
  return { ...form, unit, cost: "" };
}

export interface DevexErrors { cost?: string; unit?: string; subaccount?: string }

/** The chosen sub-account is not in the active CAPEX hierarchy (deactivated / moved). */
export function isInactiveSubaccount(form: Pick<DevexForm, "subaccountId">, hierarchy: CapexHierarchy): boolean {
  return form.subaccountId !== null && !hierarchy.subaccounts.some((s) => s.id === form.subaccountId);
}

/**
 * `lbl_AdminCost_RightPanel_Form_AddCost_Fields_Cost_ErrorMessage` (integer, 0..100,000,000) and
 * `…_Unit_ErrorMessage` (a WTG unit only for Wind). The canvas `…_Subaccount_ErrorMessage` is
 * `Visible: false` (its duplicate check is commented out), so it is not ported.
 * DIVERGENCE: an inactive sub-account (when the hierarchy is given) blocks Save with a message
 * under Sub-Account; the canvas has no such check.
 */
export function validateDevexForm(
  form: DevexForm, ctx: { countryName: string; technology: CostTechnology; locale?: string; hierarchy?: CapexHierarchy },
): DevexErrors {
  const errors: DevexErrors = {};
  if (ctx.hierarchy && isInactiveSubaccount(form, ctx.hierarchy)) errors.subaccount = MSG.subaccountInactive;
  const cost = form.cost;
  if (cost.trim() !== "") {
    if (!isInteger(cost, ctx.locale)) errors.cost = MSG.costDecimals;
    else if (!inRange(cost, 0, 100_000_000, ctx.locale)) errors.cost = MSG.costRange;
  }
  const wtg = form.unit === COST_UNIT.eurWtg || form.unit === COST_UNIT.plnWtg;
  if (wtg && ctx.technology !== TECHNOLOGY.wind) errors.unit = MSG.wtgOnlyWind(currencyCode(ctx.countryName));
  return errors;
}

/** Dirty = deep difference from the snapshot taken on open — the shared dirty-check helper. */
export { isDirty };

/**
 * `pcf_btn_AdminCost_RightPanel_Form_AddStandardCost_Button_Save.DisplayMode` — the DEVEX Save gate
 * (Distribution Frequency is fixed, so its non-blank check always holds).
 *
 * SOURCE DEFECT (fixed): the canvas gate starts with `locEditSaveButtonEnabled`, which only Cancel
 * / Close reset, so after a save the next panel opened with Save already enabled. Here "dirty" is
 * a deep difference from the snapshot taken on every open. No `…CanvasParity` twin.
 */
export function canSaveDevex(form: DevexForm, pristine: DevexForm, errors: DevexErrors): boolean {
  return isDirty(form, pristine)
    && form.description.trim() !== ""
    && form.categoryId !== null
    && form.subaccountId !== null
    && form.unit !== null
    && form.cost.trim() !== ""
    && form.costPaidBy !== null
    && form.clusters.some(Boolean)
    && !errors.cost && !errors.unit && !errors.subaccount;
}

/**
 * The data-layer write for a valid form. Throws `DevexRuleError` when the
 * sub-account is not in the active hierarchy, so a malformed `vsb_name` / `vsb_description`
 * ("Standard Cost : Germany-Wind-", "Standard  - X") can never be built.
 */
export function devexWriteFromForm(
  form: DevexForm,
  ctx: { id?: string; selection: CostSelection; hierarchy: CapexHierarchy; locale?: string },
): DevexWrite {
  const sub = ctx.hierarchy.subaccounts.find((s) => s.id === form.subaccountId);
  if (!sub) throw new DevexRuleError(MSG.subaccountInactive);
  return {
    ...(ctx.id ? { id: ctx.id } : {}),
    countryId: ctx.selection.countryId,
    countryName: ctx.selection.countryName,
    technology: ctx.selection.technology,
    categoryId: form.categoryId ?? sub.categoryId,
    subaccountId: sub.id,
    subaccountName: sub.name,
    descriptionInput: form.description,
    clusters: form.clusters,
    unit: form.unit ?? defaultUnit(ctx.selection.countryName),
    costAmount: parseNumber(form.cost, ctx.locale) ?? 0,
    comment: form.comment,
    costPaidBy: form.costPaidBy ?? 0,
  };
}

/**
 * `lbl_AdminCost_RightPanel_Form_AddStandardCost_Header_title.Text` —
 * `If(IsBlank(locSelectedStandardCost), "Add Cost", "Edit Cost : " & Subaccount.Name)`, verbatim.
 */
export function devexPanelTitle(editing: DevexCost | undefined, hierarchy: CapexHierarchy): string {
  if (!editing) return "Add Cost";
  const sub = hierarchy.subaccounts.find((s) => s.id === editing.subaccountId);
  // DIVERGENCE: an inactive sub-account is not in the hierarchy, so the title falls back to the
  // stored description (the canvas reads the lookup's name, which it always has).
  return `Edit Cost : ${sub?.name ?? editing.description}`;
}

/* ═══════════════════════════════════════════ DEVEX write plans (D36 / rule 17) ══ */

/*
 * The two DEVEX/CAPEX standard-cost writes are ONE request each, so each is a one-write
 * `WritePlan` that `@/data/runPlan` sends through `data/executePlan.ts`. The update is `guarded`:
 * the row is read by primary key first and, when another user deleted it, NOTHING is sent and
 * `RecordGoneError` surfaces (the SDK 1.3.1 PATCH would otherwise recreate it). `label` keeps each
 * failure's operation text word for word ("create standard cost", "update standard cost",
 * "delete standard cost" — the texts the screen's users and tests have seen).
 *
 * The CONTRACT flows (period save, contract delete, period delete) stay in `@/data/adminCost.ts`:
 * they read at save time, repair the `vsb_islastperiod` flags after a partial failure and report
 * per-step counts, which a static, sequential, fail-stop plan cannot express (D36 §3). Their
 * divergences from the canvas are marked at the call sites in `Screen.tsx`.
 *
 * Two refusals, both carrying a sentence written for the user, and both already shown by the screen
 * before a plan is ever built (`MSG.noPermission` on the panel, `DevexRuleError` from
 * `devexWriteFromForm`): the hook turns a `PlanRefusedError` back into a `DevexRuleError`, which
 * `errorText` prints verbatim — exactly what the data-layer `saveDevexCost` used to throw.
 *
 * `executePlan` rewrites a string value containing `@created#<n>` (`resolveRefs`) — `vsb_comment`
 * and `vsb_descriptioninput` are free text, so a cost whose text held that token would be
 * rewritten. Pre-existing hazard of the executor, unchanged here and recorded in D36.
 */

const DEVEX_SET = ES_ADMIN.devexCapexStandardAssumptions;

/** Canvas fixed value for `vsb_distributionfrequency` on a standard cost. */
export const DEVEX_DISTRIBUTION_FREQUENCY = 3;

export interface PlanOptions { canEdit: boolean }

/**
 * `pcf_btn_AdminCost_RightPanel_Form_AddStandardCost_Button_Save.OnChange` `Patch` field map. Apply
 * VAT / Depreciation / Distribution Frequency are the canvas fixed values. No Owning Business Unit
 * (the canvas writes none). Key order is the wire order.
 *
 * DIVERGENCE: Description Input, the Description suffix and Comment are trimmed; the canvas writes
 * `txt_…_Description.Value` / `txt_…_Comment.Value` untrimmed (D24 recorded "untrimmed").
 */
export function devexPayload(w: DevexWrite): Record<string, unknown> {
  const description = w.descriptionInput.trim();
  return {
    vsb_name: `Standard Cost : ${w.countryName}-${TECHNOLOGY_LABEL[w.technology]}-${w.subaccountName}`,
    vsb_cluster1: w.clusters[0],
    vsb_cluster2: w.clusters[1],
    vsb_cluster3: w.clusters[2],
    vsb_cluster4: w.clusters[3],
    vsb_cluster5: w.clusters[4],
    vsb_description: `Standard ${w.subaccountName} - ${description}`,
    vsb_descriptioninput: description,
    "vsb_Country@odata.bind": `/vsb_countries(${w.countryId})`,
    vsb_technology: w.technology,
    vsb_unit: w.unit,
    vsb_applyvat: true,
    vsb_depreciation: true,
    vsb_distributionfrequency: DEVEX_DISTRIBUTION_FREQUENCY,
    vsb_costamount: w.costAmount,
    vsb_comment: w.comment.trim(),
    vsb_costpaidby: w.costPaidBy,
    "vsb_Subaccount@odata.bind": `/vsb_capexaccountlists(${w.subaccountId})`,
    "vsb_Category@odata.bind": `/vsb_capexaccountlists(${w.categoryId})`,
  };
}

function singleWrite(write: PlannedWrite): WritePlan {
  const plan = emptyPlan();
  plan.writes.push(write);
  return plan;
}

/**
 * Save a standard cost: `w.id` absent creates the row, otherwise one guarded PATCH.
 *
 * DIVERGENCE: refuses a write without a sub-account name (the canvas would store
 * `"Standard Cost : Germany-Wind-"` / `"Standard  - X"`, which the project screens match on); and
 * the update is guarded — it writes nothing when another user deleted the row meanwhile (D36 §3).
 */
export function planSaveDevexCost(w: DevexWrite, opts: PlanOptions): WritePlan {
  if (!opts.canEdit) return refusePlan(MSG.noPermission);
  if (!w.subaccountId || !w.categoryId || w.subaccountName.trim() === "") {
    return refusePlan(MSG.subaccountInactive);
  }
  const data = devexPayload(w);
  return singleWrite(w.id
    ? guardedUpdate(DEVEX_SET, w.id, data, "standard cost updated", "update standard cost")
    : { op: "create", entitySet: DEVEX_SET, data, reason: "standard cost created", label: "create standard cost" });
}

/**
 * `btn_AdminCost_DevexCapex_Delete_StandardCost_Confirm.OnSelect` (hidden, Select()-ed by the
 * delete dialog): one DELETE whose result is read, so a refusal by the synchronous
 * `VSB_CapexAssumptionDeletion` plug-in (which deletes the project CAPEX contracts and costs built
 * from the row) surfaces, as CONVENTIONS rule 14 requires.
 * DIVERGENCE (D20): the `Apply and Apply All Trackings` row the canvas appends after the delete
 * is not written.
 */
export function planDeleteDevexCost(id: string, opts: PlanOptions): WritePlan {
  if (!opts.canEdit) return refusePlan(MSG.noPermission);
  return singleWrite({
    op: "delete", entitySet: DEVEX_SET, id, reason: "standard cost deleted", label: "delete standard cost",
  });
}

/* ═══════════════════════════════════════════════ OPEX / Land Lease contracts ══ */

export interface ContractView {
  /** Sub-account id (or a per-row key for a row with no sub-account). */
  key: string;
  type: OpexContractType;
  subaccountId: string | undefined;
  subaccountName: string;
  /** Ordered by NUMERIC period; rows without a period last. */
  periods: OpexPeriod[];
  /** The first row — Period 1 in a consistent contract. */
  head: OpexPeriod;
  /** The row with the highest period number, regardless of the stored flag. */
  last: OpexPeriod;
  highestPeriod: number;
  /**
   * Period numbers of this contract's NOT-active rows (hidden, but counted by
   * the server-side integrity checks). Non-empty → Add / Delete Period are disabled.
   */
  inactivePeriods?: readonly number[];
}

/** The minimal shape of a hidden (not active) contract row. */
export interface InactiveRowRef {
  type: number | undefined;
  period: number | undefined;
  landLeaseSubaccountId: string | undefined;
  opexSubaccountId: string | undefined;
}

export function contractSubaccountId(row: OpexPeriod, type: OpexContractType): string | undefined {
  return type === CONTRACT_TYPE.landLease ? row.landLeaseSubaccountId : row.opexSubaccountId;
}

/**
 * The name in the contract's panel titles. The active sub-account list first; for a
 * deactivated sub-account (filtered out of that list) the lookup's stored name, which is what
 * the canvas title showed (`'Land Lease Subaccount'.Name`, ACS:4921-4933); failing that the
 * contract's own description, so a title is never "Edit Contract : ".
 * A row without a sub-account keeps "" (it cannot be edited anyway).
 */
export function contractDisplayName(
  subaccountId: string | undefined, head: OpexPeriod, subaccountNames: ReadonlyMap<string, string>,
): string {
  if (!subaccountId) return "";
  return subaccountNames.get(subaccountId) || head.subaccountLabel || head.description;
}

/**
 * `gal_LandLease_Content_Subaccounts_CardBody_Costs_1.Items`: one group per sub-account, periods
 * in numeric order. DIVERGENCE: grouped by sub-account ID; the canvas matches a contract's periods
 * by sub-account `Name` (e.g. `lbl_OpexCosts_…_EndDate_2.Text`, `txt_…_StartDate.Value`), so two
 * sub-accounts sharing a name would merge there.
 */
export function groupContracts(
  periods: readonly OpexPeriod[], type: OpexContractType, subaccountNames: ReadonlyMap<string, string>,
  inactiveRows: readonly InactiveRowRef[] = [],
): ContractView[] {
  const inactiveBySub = new Map<string, number[]>();
  for (const r of inactiveRows) {
    if (r.type !== type) continue;
    const sub = type === CONTRACT_TYPE.landLease ? r.landLeaseSubaccountId : r.opexSubaccountId;
    if (!sub) continue;
    const list = inactiveBySub.get(sub) ?? [];
    list.push(r.period ?? 0);
    inactiveBySub.set(sub, list);
  }
  const groups = new Map<string, OpexPeriod[]>();
  for (const row of periods) {
    if (row.type !== type) continue;
    const sub = contractSubaccountId(row, type);
    const key = sub ?? `row:${row.id}`;
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  const byPeriod = (a: OpexPeriod, b: OpexPeriod) =>
    (a.period ?? Number.MAX_SAFE_INTEGER) - (b.period ?? Number.MAX_SAFE_INTEGER) || a.description.localeCompare(b.description);
  const out: ContractView[] = [];
  for (const [key, rows] of groups) {
    const sorted = [...rows].sort(byPeriod);
    const numbered = sorted.filter((r) => r.period !== undefined);
    const head = sorted[0] as OpexPeriod;
    const last = numbered.length > 0 ? numbered[numbered.length - 1] as OpexPeriod : sorted[sorted.length - 1] as OpexPeriod;
    const subaccountId = contractSubaccountId(head, type);
    const inactive = subaccountId ? inactiveBySub.get(subaccountId) : undefined;
    out.push({
      key, type, subaccountId,
      subaccountName: contractDisplayName(subaccountId, head, subaccountNames),
      periods: sorted, head, last,
      highestPeriod: numbered.reduce((m, r) => Math.max(m, r.period ?? 0), 0),
      ...(inactive ? { inactivePeriods: [...inactive].sort((a, b) => a - b) } : {}),
    });
  }
  return out.sort((a, b) => a.head.description.localeCompare(b.head.description));
}

export const monthsOf = (p: Pick<OpexPeriod, "years" | "months">): number => (p.years ?? 0) * 12 + (p.months ?? 0);

/**
 * `$"COD + {RoundDown(months / 12, 0)} Years {Mod(months, 12)} Months"` — verbatim, from
 * `lbl_OpexCosts_…_CostsTableRow_EndDate_2.Text` and `txt_…_StartDate.Value`.
 */
export function codText(totalMonths: number): string {
  return `COD + ${Math.floor(totalMonths / 12)} Years ${totalMonths % 12} Months`;
}

/** `lbl_OpexCosts_…_CostsTableRow_EndDate_2.Text`: cumulative duration of this contract's periods up to and including `row`. */
export function endDateText(contract: ContractView, row: OpexPeriod): string {
  const upTo = row.period ?? Number.MAX_SAFE_INTEGER;
  const total = contract.periods
    .filter((p) => (p.period ?? Number.MAX_SAFE_INTEGER) <= upTo)
    .reduce((s, p) => s + monthsOf(p), 0);
  return codText(total);
}

/** `txt_LandLease_RightPanel_NewEditCost_BodyContent_StartDate.Value` (ACS:5322-5364): a new period starts after ALL existing periods. */
export function nextStartDateText(contract: ContractView): string {
  return codText(contract.periods.reduce((s, p) => s + monthsOf(p), 0));
}

export interface OpexRowView {
  description: string;
  startDate: string;
  years: string;
  months: string;
  endDate: string;
  inflation: string;
  inflationIsValue: boolean;
  currency: string;
  fixCosts: string;
  ofRevenues: string;
  eurMwh: string;
  eurMw: string;
  eurWtg: string;
  aggregation: string;
  securedOrFrequency: string;
  allocationOrExternal: string;
  otp: string;
}

/** `lbl_OpexCosts_…_CostsTableRow_Aggregation_2.Text` — `ThisItem.Aggregation`, the option labels. */
const AGGREGATION_LABEL: Record<number, string> = {
  [AGGREGATION.sum]: "SUM", [AGGREGATION.max]: "MAX", [AGGREGATION.min]: "MIN",
};

/**
 * The cell texts of one period row — `lbl_OpexCosts_Content_Subaccounts_CardBody_CostsTableRow_*.Text`:
 * `"{n} years"` / `"{n} months"` (DurationYears_1 / DurationMonths_1), inflation `"No"` /
 * `"Country Inflation"` / percent (InflationProfile_2), OTP `"Yes"` / `"No"`, Secured / Allocation /
 * External Contract as `Text(<boolean>)`, the numbers in the canvas `Text(…)` formats.
 * `% of Revenues` / inflation show the STORED percent with the canvas decimals (`fmtGridPercent`,
 * SOURCE DEFECT at `PERCENT_DISPLAY`).
 */
export function toStandardOpexRow(
  row: OpexPeriod, contract: ContractView, currencyNames: ReadonlyMap<string, string>,
): OpexRowView {
  const ll = contract.type === CONTRACT_TYPE.landLease;
  const useInflation = row.useInflation === true;
  const inflation = !useInflation ? "No"
    : row.useCountryInflation ? "Country Inflation"
      : fmtGridPercent(row.inflationProfile, "inflation");
  return {
    description: row.description,
    startDate: row.startDate,
    years: row.years === undefined ? "" : `${row.years} years`,
    months: row.months === undefined ? "" : `${row.months} months`,
    endDate: endDateText(contract, row),
    inflation,
    inflationIsValue: useInflation && !row.useCountryInflation,
    currency: row.currencyId ? currencyNames.get(row.currencyId) ?? "" : "",
    fixCosts: fmtInteger(row.fixCosts),
    ofRevenues: fmtGridPercent(row.ofRevenues, "revenue"),
    eurMwh: fmtOneOrTwo(row.eurMwh),
    eurMw: fmtInteger(row.eurMw),
    eurWtg: fmtInteger(row.eurWtg),
    aggregation: row.aggregation === undefined ? "" : AGGREGATION_LABEL[row.aggregation] ?? "",
    securedOrFrequency: ll ? String(row.secured)
      : row.distributionFrequency === undefined ? "" : String(row.distributionFrequency),
    allocationOrExternal: ll ? String(row.allWtgAllocated)
      : row.externalContract === undefined ? "" : String(row.externalContract),
    otp: ll ? (row.otp.dueDate1 && row.otp.amount1 !== null ? "Yes" : "No") : "",
  };
}

/**
 * `ico_OpexCosts_…_CostsTableRow_Delete_1.Visible` — `Or(Period = Period 1, ThisItem.'IsLastPeriod?')`:
 * Delete is offered on the head (Period 1) and the last period only.
 * DIVERGENCE: "last" is the row with the highest period number, not the stored `'IsLastPeriod?'`
 * flag, so a stale flag on a middle period never offers a gap-making delete.
 */
export function canDeleteRow(contract: ContractView, row: OpexPeriod): boolean {
  return row.id === contract.head.id || row.id === contract.last.id;
}

/**
 * `cmp_PopUp_Confirmation_Delete_Contract_Or_Period.OnConfirm`: deleting the head deletes the whole
 * contract; the tail alone is a period.
 */
export function deleteKind(contract: ContractView, row: OpexPeriod): "contract" | "period" {
  return row.id === contract.head.id ? "contract" : "period";
}

/**
 * DIVERGENCE: the grid shows active rows only, while the canvas shows inactive rows too
 * (its collection is the unfiltered table). A contract with hidden (not active) rows: the server
 * integrity checks count them, so Add Period / Delete Period would always fail with "changed
 * since it was loaded"; until the inactive-row policy is decided, these actions are disabled
 * with this reason. Deleting the whole contract (Period 1) still works — it removes rows in any
 * state.
 */
export function inactiveRowsReason(contract: ContractView): string | undefined {
  const periods = contract.inactivePeriods ?? [];
  if (periods.length === 0) return undefined;
  return MSG.inactivePeriods(periods);
}

/**
 * SOURCE DEFECT (fixed): the canvas Add Period is always enabled, and Period 10 has no successor
 * in the canvas period `Switch`, which falls through to its default, so an 11th "Add Period"
 * silently creates a SECOND Period 1. Here there is no Period 11 (`MSG.maxPeriods`), and no Add
 * Period while the contract has hidden inactive rows (DIVERGENCE above). The
 * `nextPeriodCanvasParity` twin was dropped by the port.
 */
export function canAddPeriod(contract: ContractView): boolean {
  return contract.highestPeriod < MAX_PERIOD && inactiveRowsReason(contract) === undefined;
}

/** Deleting a later (tail) period is blocked by hidden inactive rows; the head is not. */
export function canDeletePeriodRow(contract: ContractView, row: OpexPeriod): boolean {
  return deleteKind(contract, row) === "contract" || inactiveRowsReason(contract) === undefined;
}

/**
 * Next period = highest existing + 1 (never "Period 1" after Period 10). DIVERGENCE: the canvas
 * numbers from the clicked reference row (`Switch(locNextPeriodReferenceCost.Period, …)`); here it
 * is the contract's highest period, re-checked on the server by `saveOpexPeriod`.
 */
export function nextPeriodNumber(contract: ContractView): number {
  return contract.highestPeriod + 1;
}

/* ─────────────────────────────────────────────────── Add Contract Type menu ── */

export interface MenuItemView { id: string; name: string; label: string; disabled: boolean; order: number }

/**
 * `cmp_Admin_Cost_LandLease_AddStandardContractType_CommandBar.Items` → `ItemDisplayName` of the
 * Other OPEX children (ACS:1052-1071): "TCMA" / "E&CM", verbatim, else the sub-account name.
 * DIVERGENCE: matched case-insensitively; the canvas `Find("TCMA", …)` / `Find("Environmental", …)`
 * are case-sensitive.
 */
export function otherOpexLabel(name: string): string {
  if (/tcma/i.test(name)) return "TCMA";
  if (/environmental/i.test(name)) return "E&CM";
  return name;
}

/**
 * `cmp_Admin_Cost_LandLease_AddStandardContractType_CommandBar.Items`: one item per sub-account of
 * the section's category (`colLandLeaseSubaccounts` / `colOAndMSubaccounts` /
 * `colOtherOpexSubaccounts`); disabled (`ItemEnabled: CountIf(…) = 0`) when a contract (any period)
 * already exists for it in the current scope and type: one contract per sub-account.
 */
export function contractMenu(
  type: OpexContractType,
  landLeaseSubaccounts: readonly LandLeaseSubaccount[],
  opexSubaccounts: readonly OpexSubaccountRow[],
  periods: readonly OpexPeriod[],
): MenuItemView[] {
  const existing = new Set(
    periods.filter((p) => p.type === type).map((p) => contractSubaccountId(p, type)).filter(Boolean),
  );
  const subs: { id: string; name: string; order: number }[] = type === CONTRACT_TYPE.landLease
    ? [...landLeaseSubaccounts]
    : opexSubaccounts.filter((s) => (type === CONTRACT_TYPE.oAndM ? s.isOAndM : !s.isOAndM));
  return [...subs]
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    .map((s) => ({
      id: s.id,
      name: s.name,
      label: type === CONTRACT_TYPE.other ? otherOpexLabel(s.name) : s.name,
      disabled: existing.has(s.id),
      order: s.order,
    }));
}

/* ─────────────────────────────────────────────────────── contract panel ── */

export type OpexPanelMode = "newContract" | "editContract" | "editPeriod" | "addPeriod";

/**
 * `lbl_LandLease_RightPanel_NewEditPeriod_BodyHeader_1.Text` (ACS:4913-4934) — "Add Contract Type : ",
 * "Edit Contract : ", "Edit Period : ", "Add Period : " + the sub-account name, verbatim.
 */
export function opexPanelTitle(mode: OpexPanelMode, subaccountName: string): string {
  switch (mode) {
    case "newContract": return `Add Contract Type : ${subaccountName}`;
    case "editContract": return `Edit Contract : ${subaccountName}`;
    case "editPeriod": return `Edit Period : ${subaccountName}`;
    default: return `Add Period : ${subaccountName}`;
  }
}

export function editModeFor(row: OpexPeriod): OpexPanelMode {
  return row.period === 1 ? "editContract" : "editPeriod";
}

/**
 * The canvas `DisplayMode` of the inflation / External Contract fields
 * (`Or(locSelectedLandLeaseCost.Period = Period 1, And(IsBlank(…), IsBlank(locNextPeriodReferenceCost)))`):
 * a new contract or Period 1.
 */
export function isContractLevelEditable(mode: OpexPanelMode): boolean {
  return mode === "newContract" || mode === "editContract";
}

export interface OpexForm {
  description: string;
  startDate: string;
  years: number | null;
  months: number | null;
  fixCosts: string;
  ofRevenues: string;
  eurMwh: string;
  eurMw: string;
  eurWtg: string;
  aggregation: number | null;
  distributionFrequency: number | null;
  useInflation: boolean;
  useCountryInflation: boolean;
  area: string;
  customInflation: string;
  externalContract: boolean;
}

export interface OpexPanelContext {
  mode: OpexPanelMode;
  type: OpexContractType;
  subaccount: { id: string; name: string; order: number };
  /** Edit modes: the row; add-period: unused. */
  row?: OpexPeriod;
  /** Edit / add-period: the contract the row belongs to. */
  contract?: ContractView;
  decimalSeparator: "." | ",";
}

/** `btn_OpexCosts_Content_Subaccounts_CardBody_AddPeriod.OnSelect` (ACS:3571-3620): the add-period reference = the current last period. */
export function referenceOf(ctx: OpexPanelContext): OpexPeriod | undefined {
  return ctx.mode === "addPeriod" ? ctx.contract?.last : undefined;
}

/** `txt_LandLease_RightPanel_NewEditCost_BodyContent_StartDate.Value` — `Coalesce(…, "Cluster 6: Operation")`, verbatim. */
export const DEFAULT_START_DATE = "Cluster 6: Operation";

/**
 * `txt_LandLease_RightPanel_NewEditCost_BodyContent_Description_1.Value` (ACS:5126-5130) —
 * `$"Standard{"" | " Opex" | " LL"} {sub-account}"`, verbatim: the description of a NEW contract.
 */
export function newContractDescription(type: OpexContractType, subaccountName: string): string {
  if (type === CONTRACT_TYPE.landLease) return `Standard LL ${subaccountName}`;
  if (type === CONTRACT_TYPE.other) return `Standard Opex ${subaccountName}`;
  return `Standard ${subaccountName}`;
}

/**
 * `tgl_OpexCosts_RightPanel_NewEditCost_BodyContent_ExternalContract.Checked` — the TCMA rule for
 * a new contract: Other OPEX, order 1 and a TCMA sub-account → off, else on.
 * SOURCE DEFECT (fixed): the canvas `Find("tcma", Name)` is case-sensitive, so the "TCMA"
 * sub-account never matched; here it is matched case-insensitively. No `…CanvasParity` twin.
 */
export function defaultExternalContract(type: OpexContractType, subaccount: { name: string; order: number }): boolean {
  return !(type === CONTRACT_TYPE.other && subaccount.order === 1 && /tcma/i.test(subaccount.name));
}

/**
 * Field defaults per panel mode (the canvas field `Default` / `Value` / `Checked` formulas, rebuilt
 * on every open as the hidden `btn_LandLease_NewEditPeriod_ResetButton` did): inflation on for
 * O&M / Other, Aggregation SUM, months 0 once a year is set.
 *
 * SOURCE DEFECT (fixed): the canvas External Contract tests only `= Yes` on the edited row and the
 * reference, then falls through to `true`, so a contract stored as "No" opens (and saves) "Yes".
 * Here the stored value is kept (`source.externalContract ?? true`). The
 * `externalContractDefaultCanvasParity` twin was dropped by the port.
 */
export function opexStandardDefaults(ctx: OpexPanelContext): OpexForm {
  const { mode, type, row, decimalSeparator: sep } = ctx;
  const editing = mode === "editContract" || mode === "editPeriod" ? row : undefined;
  const reference = referenceOf(ctx);
  const source = editing ?? reference;
  const ll = type === CONTRACT_TYPE.landLease;

  let description: string;
  if (editing) description = editing.description;
  else if (mode === "addPeriod" && ctx.contract) description = `${ctx.contract.head.description} - ${nextPeriodNumber(ctx.contract)}`;
  else description = newContractDescription(type, ctx.subaccount.name);

  const startDate = mode === "addPeriod" && ctx.contract
    ? nextStartDateText(ctx.contract)
    : editing?.startDate || DEFAULT_START_DATE;

  const years = editing?.years ?? null;
  const months = editing?.months ?? (years !== null ? 0 : null);

  return {
    description,
    startDate,
    years,
    months,
    fixCosts: inputText(editing?.fixCosts, "fixed2", sep),
    ofRevenues: inputText(editing?.ofRevenues, "intOr2", sep),
    eurMwh: inputText(editing?.eurMwh, "intOr2", sep),
    eurMw: inputText(editing?.eurMw, "intOr2", sep),
    eurWtg: inputText(editing?.eurWtg, "intOr2", sep),
    aggregation: editing?.aggregation ?? AGGREGATION.sum,
    distributionFrequency: editing?.distributionFrequency ?? null,
    useInflation: source?.useInflation ?? !ll,
    useCountryInflation: source?.useCountryInflation ?? !ll,
    area: source?.inflationArea ?? "",
    customInflation: inputText(source?.inflationProfile, "keep2", sep),
    externalContract: ll ? false : source ? source.externalContract ?? true : defaultExternalContract(type, ctx.subaccount),
  };
}

export type FigureKey = "fixCosts" | "ofRevenues" | "eurMwh" | "eurMw" | "eurWtg";
const FIGURE_KEYS: readonly FigureKey[] = ["fixCosts", "ofRevenues", "eurMwh", "eurMw", "eurWtg"];

/**
 * Hidden values written as the canvas does: carried from the edited / reference row (threshold,
 * one-time payments — fields the panel locks or hides).
 * `storedInflationProfile` / `pristineCustomInflation` let an untouched inflation value be written
 * back exactly (or not at all), never re-parsed from rounded text.
 */
export interface HiddenValues {
  thresholdType: number | null;
  thresholdIndividual: number | null;
  otp: OtpValues;
  storedInflationProfile: number | null;
  pristineCustomInflation: string;
  /** Edit modes: the Area shown on open (an unchanged Area is not written). */
  pristineArea?: string;
  /** Edit modes: the stored figures and the text shown on open (untouched = exact stored value). */
  storedFigures?: Partial<Record<FigureKey, number | null>>;
  pristineFigures?: Partial<Record<FigureKey, string>>;
}

const EMPTY_OTP: OtpValues = { dueDate1: null, amount1: null, dueDate2: null, amount2: null, dueDate3: null, amount3: null };

export function hiddenValues(ctx: OpexPanelContext): HiddenValues {
  const editing = ctx.mode === "editContract" || ctx.mode === "editPeriod" ? ctx.row : undefined;
  const source = editing ?? referenceOf(ctx);
  const defaults = opexStandardDefaults(ctx);
  return {
    thresholdType: source?.thresholdType ?? null,
    thresholdIndividual: source?.thresholdIndividual ?? null,
    otp: source ? { ...source.otp } : { ...EMPTY_OTP },
    storedInflationProfile: source?.inflationProfile ?? null,
    pristineCustomInflation: defaults.customInflation,
    ...(editing ? {
      pristineArea: defaults.area,
      storedFigures: Object.fromEntries(FIGURE_KEYS.map((k) => [k, editing[k] ?? null])),
      pristineFigures: Object.fromEntries(FIGURE_KEYS.map((k) => [k, defaults[k]])),
    } : {}),
  };
}

/**
 * DIVERGENCE: the contract currency (EUR / PLN) must exist, or the contract would be saved without
 * one; the canvas has no such check.
 */
export function currencyIssue(currencies: readonly CostCurrency[], countryName: string): string | undefined {
  const code = currencyCode(countryName);
  return currencies.some((c) => c.code === code) ? undefined : MSG.currencyMissing(code);
}

/**
 * `tgl_…_InflationProfile_1.OnChange` — inflation profile switched off: the canvas resets the
 * country toggle, area and custom value to their defaults (ACS:7074-7080);
 * `tgl_…_CountryInflationProfile_1.OnChange` resets custom value and area (ACS:7015).
 */
export function withInflation(form: OpexForm, on: boolean, defaults: OpexForm): OpexForm {
  if (on) return { ...form, useInflation: true };
  return {
    ...form, useInflation: false,
    useCountryInflation: defaults.useCountryInflation, area: defaults.area, customInflation: defaults.customInflation,
  };
}
export function withCountryInflation(form: OpexForm, on: boolean, defaults: OpexForm): OpexForm {
  return { ...form, useCountryInflation: on, area: defaults.area, customInflation: defaults.customInflation };
}
/** `drp_…_DurationMonths_1` (ACS:5430-5441): months defaults to 0 once a year is chosen. */
export function withYears(form: OpexForm, years: number | null): OpexForm {
  return { ...form, years, months: form.months ?? (years !== null ? 0 : null) };
}

export type OpexFieldKey = "fixCosts" | "ofRevenues" | "eurMwh" | "eurMw" | "eurWtg" | "duration" | "customInflation";
export type OpexErrors = Partial<Record<OpexFieldKey, string>>;

function decimalError(
  text: string, max: number, decimalsMsg: string, rangeMsg: string, locale?: string,
): string | undefined {
  if (text.trim() === "") return undefined;
  if (!isTwoDecimalCanvasParity(text, locale)) return decimalsMsg;
  // "1." passes the canvas decimals check and is the number 1 (Power Fx `Value`).
  if (!inRangeNumberInput(text, 0, max, locale)) return rangeMsg;
  return undefined;
}

export interface OpexValidation { errors: OpexErrors; hint: boolean }

/**
 * The panel's `lbl_…_ErrorMessage_1.Text` formulas (exact messages: `MSG` in `./constants.ts`),
 * using `fn_Numeric_CC`'s decimal checks (`is…CanvasParity`), plus the commercial-figure hint
 * (`lbl_LandLease_RightPanel_NewEditPeriod_BodyButtons_Hint_1.Visible`).
 * DIVERGENCE: an untouched stored custom inflation is not re-validated (it may carry 2 dp).
 */
export function validateOpexForm(
  form: OpexForm, ctx: { mode: OpexPanelMode; hidden: HiddenValues; locale?: string },
): OpexValidation {
  const { locale } = ctx;
  const errors: OpexErrors = {};
  const set = (k: OpexFieldKey, v: string | undefined) => { if (v) errors[k] = v; };
  set("fixCosts", decimalError(form.fixCosts, 1_000_000_000, MSG.fixCostsDecimals, MSG.fixCostsRange, locale));
  set("ofRevenues", decimalError(form.ofRevenues, 10_000, MSG.revenueDecimals, MSG.revenueRange, locale));
  set("eurMwh", decimalError(form.eurMwh, 100_000_000, MSG.perUnitDecimals, MSG.perUnitRange, locale));
  set("eurMw", decimalError(form.eurMw, 100_000_000, MSG.perUnitDecimals, MSG.perUnitRange, locale));
  set("eurWtg", decimalError(form.eurWtg, 100_000_000, MSG.perUnitDecimals, MSG.perUnitRange, locale));
  if (form.years === 0 && form.months === 0) errors.duration = MSG.durationZero;
  // An untouched stored value is valid as stored (it may carry 2 dp, the column precision).
  if (!form.useCountryInflation && form.customInflation.trim() !== "" && form.customInflation !== ctx.hidden.pristineCustomInflation) {
    const v = form.customInflation;
    if (!isOneDecimalCanvasParity(v, locale)) errors.customInflation = MSG.inflationDecimals;
    else if (!inRangeNumberInput(v, 0, 100, locale)) errors.customInflation = MSG.inflationRange;
  }
  const figuresBlank = [form.fixCosts, form.ofRevenues, form.eurMwh, form.eurMw, form.eurWtg].every((t) => t.trim() === "");
  const otpBlank = ctx.hidden.otp.amount1 === null && !ctx.hidden.otp.dueDate1;
  const hint = isContractLevelEditable(ctx.mode) ? figuresBlank && otpBlank : figuresBlank;
  return { errors, hint };
}

/** `pcf_LandLease_RightPanel_NewEditPeriod_BodyButtons_Save_1.DisplayMode` — the contract/period Save gate. */
export function canSaveOpex(
  form: OpexForm, pristine: OpexForm, validation: OpexValidation,
  ctx: { countryName: string; mode: OpexPanelMode; contract?: ContractView; currencies?: readonly CostCurrency[] },
): boolean {
  if (!isDirty(form, pristine)) return false;
  if (ctx.currencies && currencyIssue(ctx.currencies, ctx.countryName)) return false;
  if (form.description.trim() === "") return false;
  if (Object.keys(validation.errors).length > 0 || validation.hint) return false;
  if (form.useInflation && form.useCountryInflation && ctx.countryName === "Italy" && form.area.trim() === "") return false;
  if (form.useInflation && !form.useCountryInflation && form.customInflation.trim() === "") return false;
  if (form.years === null || form.months === null) return false;
  if (form.aggregation === null || form.distributionFrequency === null) return false;
  if (ctx.mode === "addPeriod" && (!ctx.contract || !canAddPeriod(ctx.contract))) return false;
  return true;
}

/**
 * The canvas' locked values, written as the canvas writes them: `tgl_…_Secured` off,
 * `tgl_…_AllocationToAllWTGs` on, `tgl_…_AlignWithProjectDuration` off, `togl_…_Threshold` off.
 */
export const FIXED_CONTRACT_VALUES = {
  secured: false,
  allWtgAllocated: true,
  alignWithProjectDuration: false,
  threshold: false,
} as const;

/**
 * The data-layer write for a valid form (the canvas Save `Patch` payload; no Owning Business Unit —
 * its write is commented out in the canvas). DIVERGENCE: an untouched figure or inflation value is
 * written back exactly as stored (or not at all), never re-parsed from its rounded prefill text.
 */
export function opexWriteFromForm(
  form: OpexForm,
  ctx: {
    panel: OpexPanelContext;
    selection: CostSelection;
    currencies: readonly CostCurrency[];
    hidden: HiddenValues;
    locale?: string;
  },
): OpexWrite {
  const { panel, selection, locale } = ctx;
  const n = (text: string): number | null => parseNumberInput(text, locale) ?? null;
  const untouched = form.customInflation === ctx.hidden.pristineCustomInflation && ctx.hidden.storedInflationProfile !== null;
  const inflationProfile = form.useCountryInflation ? null
    : untouched ? ctx.hidden.storedInflationProfile : n(form.customInflation);
  const isEdit = panel.mode === "editContract" || panel.mode === "editPeriod";
  // An untouched figure is written back as the exact stored number, never re-parsed
  // from its 2-dp prefill text.
  const figure = (key: FigureKey): number | null => {
    const stored = ctx.hidden.storedFigures?.[key];
    const pristineText = ctx.hidden.pristineFigures?.[key];
    return isEdit && stored !== undefined && stored !== null && form[key] === pristineText ? stored : n(form[key]);
  };
  const fields: OpexFields = {
    description: form.description,
    startDate: form.startDate,
    years: form.years ?? 0,
    months: form.months ?? 0,
    fixCosts: figure("fixCosts"),
    ofRevenues: figure("ofRevenues"),
    eurMwh: figure("eurMwh"),
    eurMw: figure("eurMw"),
    eurWtg: figure("eurWtg"),
    aggregation: form.aggregation ?? AGGREGATION.sum,
    distributionFrequency: form.distributionFrequency ?? 0,
    useInflation: form.useInflation,
    useCountryInflation: form.useCountryInflation,
    inflationProfile,
    inflationProfileUnchanged: panel.mode !== "newContract" && panel.mode !== "addPeriod" && inflationProfile === ctx.hidden.storedInflationProfile,
    area: form.area.trim() === "" ? null : form.area,
    areaUnchanged: isEdit && ctx.hidden.pristineArea !== undefined && form.area === ctx.hidden.pristineArea,
    externalContract: panel.type === CONTRACT_TYPE.landLease ? undefined : form.externalContract,
    ...FIXED_CONTRACT_VALUES,
    thresholdType: ctx.hidden.thresholdType,
    thresholdIndividual: ctx.hidden.thresholdIndividual,
    otp: ctx.hidden.otp,
  };
  const code = currencyCode(selection.countryName);
  const currencyId = ctx.currencies.find((c) => c.code === code)?.id;
  const scope = {
    countryId: selection.countryId,
    technology: selection.technology,
    type: panel.type,
    subaccountId: panel.subaccount.id,
  };
  const base = { scope, countryName: selection.countryName, currencyId, fields };
  if (panel.mode === "newContract") return { ...base, mode: "new", period: 1, isLastPeriod: true };
  if (panel.mode === "addPeriod") {
    return { ...base, mode: "addPeriod", period: panel.contract ? nextPeriodNumber(panel.contract) : 1, isLastPeriod: true };
  }
  const row = panel.row as OpexPeriod;
  // DIVERGENCE: the flag follows the computed tail, never a stale stored `true` on a middle
  // period (the data layer re-normalises from the server after the write).
  return {
    ...base, mode: "edit", id: row.id, period: row.period ?? 1,
    isLastPeriod: panel.contract ? panel.contract.last.id === row.id : row.isLastPeriodFlag,
  };
}

/* ═══════════════════════════════════════════════════════════════ dialogs ══ */

export interface DeleteDialogText { title: string; description: string }

/**
 * `cmp_PopUp_Confirmation_Delete_Contract_Or_Period.Title` (ACS:4860) —
 * `Switch(cat, 'DEVEX/CAPEX', "Delete Cost", $"Delete {If(Period 1, "Contract", "Period")}")` — and
 * `.Description` (ACS:4723-4733) — `$"Are you sure you want to delete the ""{Description}"" cost?"` /
 * `… contract and all related periods?` / `… period?`, verbatim.
 */
export function deleteDialogText(kind: "devex" | "contract" | "period", description: string): DeleteDialogText {
  if (kind === "devex") return { title: "Delete Cost", description: `Are you sure you want to delete the "${description}" cost?` };
  if (kind === "contract") {
    return { title: "Delete Contract", description: `Are you sure you want to delete the "${description}" contract and all related periods?` };
  }
  return { title: "Delete Period", description: `Are you sure you want to delete the "${description}" period?` };
}

/* ════════════════════════════════════════════════════════════════ errors ══ */

/** Costs' business errors: their `.message` is written for users and shown as-is. */
const BUSINESS_ERRORS = [OpexRuleError, OpexFollowUpError, DevexRuleError] as const;

/**
 * A short, clean sentence via the shared `userErrorText`: 401/403 → the
 * permission message; 404 / 412 / 429 / 5xx / network / partial row write (`RowWriteError`) → the shared hint after `prefix`;
 * otherwise a plug-in's own short message (`serverReason`). Never raw JSON or HTTP bodies.
 *
 * DIVERGENCE: the canvas `Notify`s `FirstError.Source`, `.Message` and `.Details.HttpResponse`
 * verbatim ("Error: Standard Contract could not be deleted correctly. Internal error: originated
 * on …"); see `MSG` in `./constants.ts`.
 *
 * Kept local in front of it: the partial contract delete (counts + flag issue), and the business
 * errors, which are checked BEFORE the permission rule exactly as before (the shared helper would
 * look for a 403 in their `cause` first). Not traced here: the mutation hooks already trace, and
 * load errors are rendered (a trace per render would flood telemetry).
 */
export function errorText(error: unknown, prefix: string, action: string): string {
  if (error instanceof ContractDeleteError) {
    const base = `${prefix} ${error.deleted} of ${error.total} row(s) were deleted before the failure; the remaining rows were not deleted. Reload and try again.`;
    return error.flagIssue ? `${base} The last-period flags are inconsistent: ${error.flagIssue}` : base;
  }
  if (BUSINESS_ERRORS.some((cls) => error instanceof cls)) return (error as Error).message;
  return userErrorText(error, action, { lead: prefix, businessErrors: BUSINESS_ERRORS, serverReason: true, trace: false });
}
