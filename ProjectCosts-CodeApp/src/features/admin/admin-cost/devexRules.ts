/**
 * Admin Cost Screen — the DEVEX/CAPEX family, as pure functions (D24).
 *
 * The DEVEX/CAPEX card edits `Devex/Capex Standard Assumptions`, grouped by CAPEX category. See
 * `rules.ts` for the screen-wide notes (server automation, Apply out of scope, permission).
 *
 * SOURCE DEFECTs fixed here (each marked below):
 *  - Cost Paid By's default tests the SPV mapping by account NUMBER and reads it by subaccount
 *    LOOKUP, so a row matched by one key only gives no default;
 *  - `locEditSaveButtonEnabled` is never reset when Add Cost or Edit opens the panel;
 *  - the save has no `IfError`, so a failed save closes the spinner silently.
 */
import { isBlank, isInteger, inRange } from "@/domain/powerFxNumeric";
import { emptyPlan, refusePlan as refuse, type WritePlan } from "@/data/writePlan";
import { ES, ES_ADMIN, CHOICE_ADMIN, CAPEX_ROOT_NUMBER } from "@/data/dataverseNames";
import type { CapexAccount } from "@/features/admin/admin-capex-accounts/rules";
import { formatFixCosts } from "@/features/cost/periods/landLeaseRules";

export type { CapexAccount };

/* ═══════════════════════════════════════════════════════════════════ columns ════ */

export const DEVEX_COL = {
  id: "vsb_devexcapexstandardassumptionsid",
  name: "vsb_name",
  description: "vsb_description",
  /** The user's raw text, stored alongside the composed `Description`. */
  descriptionInput: "vsb_descriptioninput",
  costAmount: "vsb_costamount",
  unit: "vsb_unit",
  costPaidBy: "vsb_costpaidby",
  comment: "vsb_comment",
  technology: "vsb_technology",
  country: "_vsb_country_value",
  category: "_vsb_category_value",
  subaccount: "_vsb_subaccount_value",
  distributionFrequency: "vsb_distributionfrequency",
  applyVat: "vsb_applyvat",
  depreciation: "vsb_depreciation",
  cluster1: "vsb_cluster1",
  cluster2: "vsb_cluster2",
  cluster3: "vsb_cluster3",
  cluster4: "vsb_cluster4",
  cluster5: "vsb_cluster5",
} as const;

/** Navigation properties for `@odata.bind`. No Owning Business Unit: the canvas writes none. */
export const DEVEX_LOOKUP = {
  country: "vsb_Country",
  category: "vsb_Category",
  subaccount: "vsb_Subaccount",
} as const;

export const DEVEX_ENTITY_SET = ES_ADMIN.devexCapexStandardAssumptions;

/** `cmb_…_Distribution_Frequency.DefaultSelectedItems = LookUp(colFrequencyInMonths, Value = 3)`, Disabled. */
export const DEVEX_DISTRIBUTION_FREQUENCY = 3;
/** `chk_…_ApplyVat.Checked` / `chk_…_Depreciation.Checked` — `true`, Disabled. */
export const DEVEX_APPLY_VAT = true;
export const DEVEX_DEPRECIATION = true;

/** The cost field's `MaxLength: =10` and its 0–100 000 000 range. */
export const COST_MAX = 100_000_000;
export const COST_MAX_LENGTH = 10;
/** `txt_…_Description.MaxLength`. */
export const DEVEX_DESCRIPTION_MAX_LENGTH = 30;
/** `txt_…_Comment.MaxLength`; the counter is `$"{Len(value)}/55"`. */
export const DEVEX_COMMENT_MAX_LENGTH = 55;

/** A subaccount stops being offered once it carries 50 standard costs in the scope. */
export const MAX_COSTS_PER_SUBACCOUNT = 50;

/** `Not(Name = "Overleveraging")` — this screen's categories leave it out. */
export const EXCLUDED_CATEGORY_NAME = "Overleveraging";

/* ═════════════════════════════════════════════════════════════════════ types ════ */

export interface DevexCost {
  id: string;
  description: string | null;
  descriptionInput: string | null;
  costAmount: number | null;
  unit: number | null;
  costPaidBy: number | null;
  comment: string | null;
  technology: number | null;
  countryId: string | null;
  categoryId: string | null;
  subaccountId: string | null;
  clusters: [boolean, boolean, boolean, boolean, boolean];
}

export interface CategoryRef { id: string; name: string; order: number }

/** `colCapexSubaccounts` — a level-3 account with its account (parent) and category. */
export interface CapexSubaccountRef {
  id: string;
  name: string;
  number: string;
  order: number;
  /** The ACCOUNT — the subaccount's parent. */
  parentId: string | null;
  parentName: string;
  /** `AccountOrder` — the parent's Order. */
  parentOrder: number;
  /** `Category` — the parent's parent. */
  categoryId: string | null;
  /** `CategoryOrder` — the category's Order. */
  categoryOrder: number;
  /** `AggregatedName` — `Parent.Name & " / " & Name & " " & Number`, the combo's label. */
  aggregatedName: string;
}

/** `SPVDevCo Mapping Capex Devexes`. */
export interface SpvDevCoMapping {
  id: string;
  accountNumber: string | null;
  subaccountId: string | null;
  devCoSpv: number | null;
}

export interface DevexScope {
  countryId: string | null;
  countryName: string | null;
  technology: string | null;
  technologyValue: number | null;
}

/* ═════════════════════════════════════════════════════════ the account chart ════ */

/**
 * `colCapexAccountCategories` — `Filter('CAPEX Account Lists', 'Parent Account'.Number =
 * "00001", Not(Name = "Overleveraging"))`, sorted by `vsb_order`.
 */
export function buildCostCategories(accounts: readonly CapexAccount[]): CategoryRef[] {
  const root = accounts.find((a) => a.number === CAPEX_ROOT_NUMBER);
  if (!root) return [];
  return accounts
    .filter((a) => a.parentId === root.id && a.name !== EXCLUDED_CATEGORY_NAME)
    .map((a) => ({ id: a.id, name: a.name, order: a.order ?? 0 }))
    .sort((a, b) => a.order - b.order);
}

/**
 * `colCapexAccounts` (the children of the categories) and `colCapexSubaccounts` (their
 * children), the latter sorted `CategoryOrder, AccountOrder, vsb_order`.
 */
export function buildCapexSubaccounts(
  accounts: readonly CapexAccount[],
  categories: readonly CategoryRef[],
): CapexSubaccountRef[] {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const accountById = new Map(
    accounts.filter((a) => a.parentId && categoryById.has(a.parentId)).map((a) => [a.id, a]),
  );
  return accounts
    .filter((a) => a.parentId && accountById.has(a.parentId))
    .map((a) => {
      const parent = accountById.get(a.parentId!)!;
      const category = categoryById.get(parent.parentId!)!;
      return {
        id: a.id, name: a.name, number: a.number, order: a.order ?? 0,
        parentId: parent.id, parentName: parent.name, parentOrder: parent.order ?? 0,
        categoryId: category.id, categoryOrder: category.order,
        aggregatedName: `${parent.name} / ${a.name} ${a.number}`,
      };
    })
    .sort((a, b) => a.categoryOrder - b.categoryOrder || a.parentOrder - b.parentOrder || a.order - b.order);
}

/* ═══════════════════════════════════════════════════════════════ the grouping ════ */

/** A row of the grouped list: a category header, or a cost under it. */
export type DevexRow =
  | { kind: "category"; category: CategoryRef; open: boolean }
  | { kind: "cost"; category: CategoryRef; cost: DevexCost; subaccount: CapexSubaccountRef | null };

/**
 * `btn_Filter_Devex_Capex_Assumptions.OnSelect` + the gallery's `Filter(…, Not(IsFolded) ||
 * IsParent)`: only categories with a cost in scope appear; each is a parent row followed — when
 * open — by its costs sorted by category order, account order (`Subaccount.'Parent
 * Account'.Order`) and subaccount order.
 */
export function devexRows(
  categories: readonly CategoryRef[],
  costs: readonly DevexCost[],
  subaccounts: ReadonlyMap<string, CapexSubaccountRef>,
  open: ReadonlySet<string>,
): DevexRow[] {
  const rows: DevexRow[] = [];
  for (const category of categories) {
    const mine = costs
      .filter((c) => c.categoryId === category.id)
      .map((cost) => ({ cost, subaccount: cost.subaccountId ? subaccounts.get(cost.subaccountId) ?? null : null }))
      .sort((a, b) =>
        (a.subaccount?.parentOrder ?? 0) - (b.subaccount?.parentOrder ?? 0)
        || (a.subaccount?.order ?? 0) - (b.subaccount?.order ?? 0));
    if (mine.length === 0) continue;
    const isOpen = open.has(category.id);
    rows.push({ kind: "category", category, open: isOpen });
    if (isOpen) for (const m of mine) rows.push({ kind: "cost", category, ...m });
  }
  return rows;
}

/** `Button2_2.OnSelect` — `UpdateIf(…, {IsFolded: !ThisItem.IsFolded})` for that category. */
export function toggleDevexCategory(open: ReadonlySet<string>, categoryId: string): Set<string> {
  const next = new Set(open);
  if (next.has(categoryId)) next.delete(categoryId); else next.add(categoryId);
  return next;
}

/**
 * After a save or delete, `locSelectedDevexCapexCategory` is set and the list is rebuilt with
 * `IsFolded: Cat <> locSelected…` — the touched category open, every other one folded.
 */
export const reopenAfterWrite = (categoryId: string | null): Set<string> =>
  new Set(categoryId ? [categoryId] : []);

/* ═══════════════════════════════════════════════════════════════════ the cells ════ */

/** `lbl_…_CostsTableHeader_Category_1.Text` — the category on the parent row, the account below. */
export const devexCategoryCell = (row: DevexRow): string =>
  row.kind === "category" ? row.category.name : row.subaccount?.parentName ?? "";

/** `lbl_…_CostsTableHeader_Account_1.Text = ThisItem.vsb_Subaccount.'Parent Account'.Name`. */
export const devexAccountCell = (row: DevexRow): string =>
  row.kind === "cost" ? row.subaccount?.parentName ?? "" : "";

/** `lbl_…_Subaccount_1.Text` — `$"{Subaccount.Name} - {Number}"` on cost rows. */
export const devexSubaccountCell = (row: DevexRow): string =>
  row.kind === "cost" && row.subaccount ? `${row.subaccount.name} - ${row.subaccount.number}` : "";

/**
 * `lbl_…_Cost_1.Text` — `$"{Text(vsb_costamount, "###,###,###,###")} {vsb_unit}"`. The mask is the
 * Cost Land Lease grid's `Fix Costs` one, so its formatter is reused.
 */
export const devexCostCell = (cost: DevexCost): string =>
  `${formatFixCosts(cost.costAmount)} ${unitLabel(cost.unit)}`;

/** `lbl_…_Cluster_1.Text` — `Concat(Filter(clusters, Item = true), ID, ",")`. */
export const devexClusterCell = (cost: DevexCost): string =>
  cost.clusters.map((on, i) => (on ? String(i + 1) : "")).filter(Boolean).join(",");

/** `img_…_Comment.Tooltip` — `"Comment:\n<text>"` or `"\nAdd Comment"`. */
export const devexCommentTooltip = (cost: DevexCost): string =>
  cost.comment && cost.comment.length > 0 ? `Comment:\n${cost.comment}` : "\nAdd Comment";

/* ═════════════════════════════════════════════════════════════════════ units ════ */

/** The `Cost Unit` option set, in its own order. */
const COST_UNITS: readonly number[] = [
  CHOICE_ADMIN.costUnit.eur, CHOICE_ADMIN.costUnit.eurPerMw, CHOICE_ADMIN.costUnit.eurPerWtg,
  CHOICE_ADMIN.costUnit.pln, CHOICE_ADMIN.costUnit.plnPerMw, CHOICE_ADMIN.costUnit.plnPerWtg,
];

/**
 * `cmb_…_Unit.Items` — `If(tech = "Wind", If(Poland, LastN(units, 3), FirstN(units, 3)),
 * If(Poland, FirstN(LastN(units, 3), 2), FirstN(units, 2)))`.
 */
export function unitChoices(countryName: string | null, technology: string | null): number[] {
  const three = countryName === "Poland" ? COST_UNITS.slice(3) : COST_UNITS.slice(0, 3);
  return technology === "Wind" ? [...three] : three.slice(0, 2);
}

export const isPerWtg = (unit: number | null): boolean =>
  unit === CHOICE_ADMIN.costUnit.eurPerWtg || unit === CHOICE_ADMIN.costUnit.plnPerWtg;

/** `DefaultSelectedItems` — `Coalesce(record.Unit, If(Poland, PLN, EUR))`. */
export const defaultUnit = (existing: number | null, countryName: string | null): number =>
  existing ?? (countryName === "Poland" ? CHOICE_ADMIN.costUnit.pln : CHOICE_ADMIN.costUnit.eur);

/** `lbl_…_Unit_ErrorMessage.Visible` — a per-WTG unit outside Wind. */
export const isUnitValid = (unit: number | null, technology: string | null): boolean =>
  !(isPerWtg(unit) && technology !== "Wind");

/** `lbl_…_Unit_ErrorMessage.Text` — `If(Poland, "PLN", "EUR") & "/WTG only applicable for Wind"`. */
export const unitError = (countryName: string | null): string =>
  `${countryName === "Poland" ? "PLN" : "EUR"}/WTG only applicable for Wind`;

/** The `vsb_costunit` option labels (customizations.xml) — what `Text(<unit>)` renders. */
export function unitLabel(unit: number | null): string {
  switch (unit) {
    case CHOICE_ADMIN.costUnit.eur: return "EUR";
    case CHOICE_ADMIN.costUnit.eurPerMw: return "EUR/MW(p)";
    case CHOICE_ADMIN.costUnit.eurPerWtg: return "EUR/WTG";
    case CHOICE_ADMIN.costUnit.pln: return "PLN";
    case CHOICE_ADMIN.costUnit.plnPerMw: return "PLN/MW(p)";
    case CHOICE_ADMIN.costUnit.plnPerWtg: return "PLN/WTG";
    default: return "";
  }
}

/* ═══════════════════════════════════════════════════════════════════ the cost ════ */

/** `lbl_AdminCost_RightPanel_Form_AddCost_Fields_Cost_ErrorMessage.Text` — verbatim. */
export const COST_INTEGER_ERROR = "Value must be a number without decimal";
/** `lbl_AdminCost_RightPanel_Form_AddCost_Fields_Cost_ErrorMessage.Text` — verbatim. */
export const COST_RANGE_ERROR = "Value must be between 0 and 100,000,000";

/** The cost label: hidden when blank; integer first, then the 0 – 100 000 000 range. */
export function costAmountError(raw: string, language = "en-US"): string | null {
  if (isBlank(raw)) return null;
  if (!isInteger(raw, language)) return COST_INTEGER_ERROR;
  if (!inRange(raw, 0, COST_MAX, language)) return COST_RANGE_ERROR;
  return null;
}

/** `rad_…_Cost_Paid_By.Items` — `Filter(Choices('Cost paid type'), Not(Value = None))`. */
export const COST_PAID_BY_OPTIONS: readonly { value: number; label: string }[] = [
  { value: CHOICE_ADMIN.costPaidType.devCo, label: "DevCo" },
  { value: CHOICE_ADMIN.costPaidType.spv, label: "SPV" },
];

export const costPaidLabel = (value: number | null): string =>
  COST_PAID_BY_OPTIONS.find((o) => o.value === value)?.label ?? "";

/**
 * The SPV / DevCo mapping default for a subaccount.
 *
 * SOURCE DEFECT (fixed): the canvas tests `LookUp(map, 'Account Number' = Subaccount.Number)` but
 * reads `LookUp(map, 'Name (Sub-Account)' = Subaccount).'DevCo/SPV'`, so a mapping row matched by
 * only one of the two keys yields no default. Here the row matching the subaccount lookup wins,
 * else the row matching its number. `mappedCostPaidByCanvasParity` keeps the canvas rule.
 */
export function mappedCostPaidBy(
  mapping: readonly SpvDevCoMapping[],
  subaccount: CapexSubaccountRef | null,
): number | null {
  if (!subaccount) return null;
  const hit = mapping.find((m) => m.subaccountId === subaccount.id && m.devCoSpv !== null)
    ?? mapping.find((m) => m.accountNumber === subaccount.number && m.devCoSpv !== null);
  return hit?.devCoSpv ?? null;
}

export function mappedCostPaidByCanvasParity(
  mapping: readonly SpvDevCoMapping[],
  subaccount: CapexSubaccountRef | null,
): number | null {
  if (!subaccount) return null;
  const tested = mapping.find((m) => m.accountNumber === subaccount.number);
  if (!tested || tested.devCoSpv === null) return null;
  return mapping.find((m) => m.subaccountId === subaccount.id)?.devCoSpv ?? null;
}

const costsPerSubaccount = (costs: readonly DevexCost[]): Map<string, number> => {
  const out = new Map<string, number>();
  for (const c of costs) if (c.subaccountId) out.set(c.subaccountId, (out.get(c.subaccountId) ?? 0) + 1);
  return out;
};

/** `cmb_…_Category.Items` — categories that have a subaccount with fewer than 50 costs in scope. */
export function categoryOptions(
  categories: readonly CategoryRef[],
  subaccounts: readonly CapexSubaccountRef[],
  costs: readonly DevexCost[],
): CategoryRef[] {
  const counts = costsPerSubaccount(costs);
  return categories.filter((cat) => subaccounts.some((s) =>
    s.categoryId === cat.id && (counts.get(s.id) ?? 0) < MAX_COSTS_PER_SUBACCOUNT));
}

/** `cmb_…_Subaccount.Items` — the category's subaccounts (all, when none), fewer than 50 costs. */
export function subaccountOptions(
  categoryId: string | null,
  subaccounts: readonly CapexSubaccountRef[],
  costs: readonly DevexCost[],
): CapexSubaccountRef[] {
  const counts = costsPerSubaccount(costs);
  return subaccounts.filter((s) =>
    (categoryId === null || s.categoryId === categoryId)
    && (counts.get(s.id) ?? 0) < MAX_COSTS_PER_SUBACCOUNT);
}

/* ═══════════════════════════════════════════════════════════════════ the form ════ */

export interface DevexForm {
  description: string;
  clusters: [boolean, boolean, boolean, boolean, boolean];
  categoryId: string | null;
  subaccountId: string | null;
  costPaidBy: number | null;
  unit: number | null;
  cost: string;
  comment: string;
  /** `locEditSaveButtonEnabled`. */
  dirty: boolean;
}

/**
 * The panel form. Add Cost: everything blank, the unit defaulted, Cost Paid By blank. Edit: the
 * record's values (`locSelectedStandardCost`, `locCostAmount`, `locSelectedCostPaidBy`).
 *
 * SOURCE DEFECT (fixed): `locEditSaveButtonEnabled` is only reset by Cancel / Close, so after a
 * Save the next panel opened with Save already enabled. `dirty` starts `false` on every open.
 */
export function toDevexForm(cost: DevexCost | null, countryName: string | null): DevexForm {
  return {
    description: cost?.descriptionInput ?? "",
    clusters: cost ? [...cost.clusters] : [false, false, false, false, false],
    categoryId: cost?.categoryId ?? null,
    subaccountId: cost?.subaccountId ?? null,
    costPaidBy: cost?.costPaidBy ?? null,
    unit: defaultUnit(cost?.unit ?? null, countryName),
    cost: cost?.costAmount === null || cost?.costAmount === undefined ? "" : String(cost.costAmount),
    comment: cost?.comment ?? "",
    dirty: false,
  };
}

/**
 * `cmb_…_Category.OnChange` — the subaccount is cleared and Cost Paid By reset; with no
 * subaccount its default is blank.
 */
export const changeDevexCategory = (form: DevexForm, categoryId: string | null): DevexForm =>
  ({ ...form, categoryId, subaccountId: null, costPaidBy: null, dirty: true });

/**
 * `cmb_…_Subaccount.OnChange` — the category is back-filled from the subaccount (its parent's
 * parent) and Cost Paid By is reset to the mapping default.
 */
export function changeDevexSubaccount(
  form: DevexForm,
  subaccount: CapexSubaccountRef | null,
  mapping: readonly SpvDevCoMapping[],
): DevexForm {
  return {
    ...form,
    subaccountId: subaccount?.id ?? null,
    categoryId: subaccount?.categoryId ?? null,
    costPaidBy: mappedCostPaidBy(mapping, subaccount),
    dirty: true,
  };
}

/** `cmb_…_Unit.OnChange` — the amount is cleared. */
export const changeDevexUnit = (form: DevexForm, unit: number | null): DevexForm =>
  ({ ...form, unit, cost: "", dirty: true });

export const hasAnyCluster = (clusters: readonly boolean[]): boolean => clusters.some(Boolean);

/**
 * `pcf_btn_AdminCost_RightPanel_Form_AddStandardCost_Button_Save.DisplayMode`: dirty;
 * distribution frequency (fixed); subaccount; category; description; cost; Cost Paid By; any
 * cluster; unit; no cost error; no unit error (the "already exists" label is `Visible: false`).
 */
export function validateDevexForm(form: DevexForm, scope: DevexScope, language = "en-US"): string[] {
  const errors: string[] = [];
  const costError = costAmountError(form.cost, language);
  if (costError) errors.push(costError);
  if (!isUnitValid(form.unit, scope.technology)) errors.push(unitError(scope.countryName));
  const complete = form.dirty && form.subaccountId !== null && form.categoryId !== null
    && !isBlank(form.description) && !isBlank(form.cost) && form.costPaidBy !== null
    && hasAnyCluster(form.clusters) && form.unit !== null;
  if (!complete) errors.push("incomplete");
  return errors;
}

export const canSaveStandardCost = (form: DevexForm, scope: DevexScope, language = "en-US"): boolean =>
  validateDevexForm(form, scope, language).length === 0;

/* ═════════════════════════════════════════════════════════════════════ the save ════ */

/** `Name: $"Standard Cost : {Country}-{Tech}-{Subaccount.Name}"`. */
export const composeStandardCostName = (
  countryName: string | null, technology: string | null, subaccountName: string,
): string => `Standard Cost : ${countryName ?? ""}-${technology ?? ""}-${subaccountName}`;

/** `Description: $"Standard {Subaccount.Name} - {text}"` — untrimmed. */
export const composeStandardCostDescription = (subaccountName: string, text: string): string =>
  `Standard ${subaccountName} - ${text}`;

/**
 * The `Patch` — every column on every save, create or update (the code app used to write
 * Country, Category, Subaccount and Technology on create only, losing an edited subaccount, and
 * never wrote Apply VAT / Depreciation).
 */
export function buildStandardCostPayload(
  form: DevexForm,
  args: { scope: DevexScope; subaccountName: string },
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    [DEVEX_COL.name]: composeStandardCostName(args.scope.countryName, args.scope.technology, args.subaccountName),
    [DEVEX_COL.cluster1]: form.clusters[0],
    [DEVEX_COL.cluster2]: form.clusters[1],
    [DEVEX_COL.cluster3]: form.clusters[2],
    [DEVEX_COL.cluster4]: form.clusters[3],
    [DEVEX_COL.cluster5]: form.clusters[4],
    [DEVEX_COL.description]: composeStandardCostDescription(args.subaccountName, form.description),
    [DEVEX_COL.descriptionInput]: form.description,
    [DEVEX_COL.technology]: args.scope.technologyValue,
    [DEVEX_COL.unit]: form.unit,
    [DEVEX_COL.applyVat]: DEVEX_APPLY_VAT,
    [DEVEX_COL.depreciation]: DEVEX_DEPRECIATION,
    [DEVEX_COL.distributionFrequency]: DEVEX_DISTRIBUTION_FREQUENCY,
    [DEVEX_COL.costAmount]: Number(String(form.cost).replace(",", ".")),
    [DEVEX_COL.comment]: form.comment === "" ? null : form.comment,
    [DEVEX_COL.costPaidBy]: form.costPaidBy,
  };
  if (args.scope.countryId) data[`${DEVEX_LOOKUP.country}@odata.bind`] = `/${ES.countries}(${args.scope.countryId})`;
  if (form.subaccountId) data[`${DEVEX_LOOKUP.subaccount}@odata.bind`] = `/${ES_ADMIN.capexAccountLists}(${form.subaccountId})`;
  if (form.categoryId) data[`${DEVEX_LOOKUP.category}@odata.bind`] = `/${ES_ADMIN.capexAccountLists}(${form.categoryId})`;
  return data;
}

export function planSaveStandardCost(args: {
  form: DevexForm;
  scope: DevexScope;
  subaccountName: string;
  existing: DevexCost | null;
  canEdit: boolean;
  noPermissionText: string;
  incompleteText: string;
  language?: string;
}): WritePlan {
  if (!args.canEdit) return refuse(args.noPermissionText);
  const errors = validateDevexForm(args.form, args.scope, args.language);
  if (errors.length > 0) return refuse(errors[0] === "incomplete" ? args.incompleteText : errors[0]!);
  const data = buildStandardCostPayload(args.form, { scope: args.scope, subaccountName: args.subaccountName });
  const plan = emptyPlan();
  plan.writes.push(args.existing === null
    ? { op: "create", entitySet: DEVEX_ENTITY_SET, data, reason: "Standard cost created" }
    : { op: "update", entitySet: DEVEX_ENTITY_SET, id: args.existing.id, data, reason: "Standard cost updated" });
  return plan;
}

/**
 * `RemoveIf('Devex/Capex Standard Assumptions', … = locSelectedStandardCost)` — the standard cost
 * only. The `VSB_CapexAssumptionDeletion` plugin removes the project contracts and costs built
 * from it. The `Apply and Apply All Trackings` upsert the canvas appends here is Apply-only (D20)
 * and is not written.
 */
export function planDeleteStandardCost(cost: DevexCost, canEdit: boolean, noPermissionText: string): WritePlan {
  if (!canEdit) return refuse(noPermissionText);
  const plan = emptyPlan();
  plan.writes.push({
    op: "delete", entitySet: DEVEX_ENTITY_SET, id: cost.id,
    reason: `Standard cost “${cost.description ?? cost.id}” deleted`,
  });
  return plan;
}

/* ═════════════════════════════════════════════════════════════ panel captions ════ */

/** `lbl_AdminCost_RightPanel_Form_AddStandardCost_Header_title.Text`. */
export const costPanelTitle = (subaccountName: string | null): string =>
  subaccountName === null ? "Add Cost" : `Edit Cost : ${subaccountName}`;

/** The DEVEX/CAPEX cost panel's captions (`con_AdminCost_RightPanel_Form_AddCost_Fields_*`). */
export const COST_PANEL_LABELS = {
  /** `lbl_AdminCost_RightPanel_Form_Fields_AddCost_Fields_Description.Text`. */
  description: "Description",
  /** `lbl_AdminCost_RightPanel_Form_AddCost_Fields_SelectCluster.Text`. */
  selectCluster: "Select Cluster",
  /**
   * `chk_AdminCost_RightPanel_SelectCluster1…5.Label`. Cluster 3's literal starts with a TAB
   * character; it renders as leading whitespace and is trimmed here.
   */
  clusters: [
    "Cluster 1: Feasibility Studies",
    "Cluster 2: Pre-Permitting",
    "Cluster 3: Permitting",
    "Cluster 4: Pre-Construction",
    "Cluster 5: Construction",
  ],
  /** `lbl_AdminCost_RightPanel_Form_AddCost_Fields_Distribution_Frequency.Text`. */
  distributionFrequency: "Distribution Frequency",
  /** `cmb_…_Distribution_Frequency.InputTextPlaceholder`. */
  distributionFrequencyPlaceholder: "Find Distribution Frequency",
  /** `chk_AdminCost_RightPanel_Form_AddCost_Fields_ApplyVat.Label`. */
  applyVat: "Apply VAT",
  /** `chk_AdminCost_RightPanel_Form_AddCost_Fields_Depreciation.Label`. */
  depreciation: "Depreciation",
  /** `lbl_AdminCost_RightPanel_Form_AddCost_Fields_Category.Text`. */
  category: "Category",
  /** `cmb_…_Category.InputTextPlaceholder`. */
  categoryPlaceholder: "Find Category",
  /** `lbl_AdminCost_RightPanel_Form_AddCost_Fields_Subaccount.Text`. */
  subaccount: "Sub-Account",
  /** `cmb_…_Subaccount.InputTextPlaceholder`. */
  subaccountPlaceholder: "Find supplier",
  /** `lbl_AdminCost_RightPanel_Form_Fields_AddCost_Fields_Cost_Paid_By.Text`. */
  costPaidBy: "Cost Paid By",
  /** `lbl_AdminCost_RightPanel_Form_AddCost_Fields_Unit.Text`. */
  unit: "Unit",
  /** `cmb_…_Unit.InputTextPlaceholder`. */
  unitPlaceholder: "Find Cost Unit",
  /** `lbl_…_Cost.Text` — `$"Cost [{Coalesce(Unit.Selected.Value & "", "EUR")}]"`. */
  cost: (unit: number | null) => `Cost [${unitLabel(unit) || "EUR"}]`,
  /** `lbl_AdminCost_RightPanel_Form_Fields_AddCost_Fields_Comment.Text`. */
  comment: "Comment",
} as const;

/** `lbl_DevexCapex_…_CostsTableHeader_*.Text`, in X order; the Comment header is `""`. */
export const DEVEX_COLUMN_HEADERS: readonly string[] = [
  "Category / Account", "Account", "Sub-Account", "Description", "Cost", "Cluster", "", "Action",
];

/** `colFrequencyInMonths` (`App.pa.yaml`). */
export const FREQUENCY_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 1, label: "1 Month" }, { value: 2, label: "2 Months" }, { value: 3, label: "3 Months" },
  { value: 6, label: "6 Months" }, { value: 12, label: "12 Months" },
];
