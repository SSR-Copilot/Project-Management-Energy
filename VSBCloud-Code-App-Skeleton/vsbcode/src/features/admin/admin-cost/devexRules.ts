/**
 * Admin Cost Screen — the DEVEX/CAPEX family, as pure functions.
 *
 * Canvas screen: `Admin Cost Screen` (PM app)
 *   352 controls · 9 286 lines of Power Fx · 117 substantive blocks · band XL
 *
 * The DEVEX/CAPEX accordion row edits `Devex/Capex Standard Assumptions`, grouped by CAPEX
 * account category. See `rules.ts` for the batch-wide permission defect and the dead Apply
 * path; `opexRules.ts` holds the other three families.
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  - `colDevexCapexassumptions1` — a flattened parent/child list built by a NINETY-LINE
 *    `Ungroup(ForAll(Filter(… As Cat, Table({…}, SortByColumns(AddColumns(Filter(…)))))))`
 *    inside one button's `OnSelect` (rule 21). The grouping is a selector here.
 *  - the mixed row shape (rule 23): child rows carried RAW `vsb_*` logical names because
 *    they came out of `Ungroup`, while parent rows carried display names, and one gallery
 *    rendered both. The repository maps once to a typed model at the boundary.
 *  - the `IsFolded` column patched onto every row so that only the last-touched category
 *    stayed open (rule 22) — a `Set<string>` in the component.
 *  - the "Standard cost already exists for this subaccount" label, hard-coded
 *    `Visible: false` above the 50-cost cap (rule 31).
 */
import { isBlank, isInteger, inRange, formatInteger } from "@/domain/numeric";
import { emptyPlan, refusePlan as refuse, type WritePlan } from "./plan";
import { ES_ADMIN, CHOICE_ADMIN } from "@/data/entities";

/* ═══════════════════════════════════════════════════════════════════ columns ════ */

export const DEVEX_COL = {
  id: "vsb_devexcapexstandardassumptionsid",
  name: "vsb_name",
  description: "vsb_description",
  /** The user's raw text, stored alongside the composed `Description` (rule 25). */
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
  cluster1: "vsb_cluster1",
  cluster2: "vsb_cluster2",
  cluster3: "vsb_cluster3",
  cluster4: "vsb_cluster4",
  cluster5: "vsb_cluster5",
  owningBusinessUnit: "_owningbusinessunit_value",
} as const;

export const DEVEX_LOOKUP = {
  country: "vsb_Country",
  category: "vsb_Category",
  subaccount: "vsb_Subaccount",
  owningBusinessUnit: "owningbusinessunit",
} as const;

export const DEVEX_ENTITY_SET = ES_ADMIN.devexCapexStandardAssumptions;

/** Rule 33 — `Distribution Frequency` defaults to `LookUp(colFrequencyInMonths, Value = 3)`. */
export const DEFAULT_DISTRIBUTION_FREQUENCY_MONTHS = 3;

/** The cost field's `MaxLength: =10` and its 0–100 000 000 range. */
export const COST_MAX = 100_000_000;
export const COST_MAX_LENGTH = 10;

/** Rule 31 — the subaccount list caps at 50 standard costs per subaccount. */
export const MAX_COSTS_PER_SUBACCOUNT = 50;

/* ═════════════════════════════════════════════════════════════════════ types ════ */

export interface DevexCost {
  id: string;
  name: string | null;
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
  distributionFrequency: number | null;
  clusters: [boolean, boolean, boolean, boolean, boolean];
}

export interface CategoryRef { id: string; name: string; order: number }

/** A row of the grouped list: a category header, or a cost under it. */
export type DevexRow =
  | { kind: "category"; category: CategoryRef; costCount: number }
  | { kind: "cost"; category: CategoryRef; cost: DevexCost };

export interface DevexScope {
  countryId: string | null;
  countryName: string | null;
  technology: string | null;
  technologyValue: number | null;
}

/* ═══════════════════════════════════════════════════════════════ the grouping ════ */

/**
 * Rule 21's replacement — the category grouping as a SELECTOR.
 *
 * `expanded` is the set of category ids whose children render. The canvas kept ONE
 * category open (`IsFolded: If(IsBlank(locSelectedDevexCapexCategory), true,
 * Cat.'CAPEX Account List' = locSelected…, false, true)`) and rendered
 * `Filter(colDevexCapexassumptions1, Not(IsFolded) || IsParent)`; a `Set` generalises that
 * without changing the default (nothing open).
 *
 * Only categories that actually HAVE a cost in scope appear — that is the canvas's
 * `Filter(colCapexAccountCategories As CT, !IsBlank(LookUp('Devex/Capex Standard
 * Assumptions', …)))`.
 */
export function groupByCategory(
  categories: CategoryRef[],
  costs: DevexCost[],
  expanded: ReadonlySet<string>,
): DevexRow[] {
  const rows: DevexRow[] = [];
  for (const category of [...categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    const mine = costs
      .filter((c) => c.categoryId === category.id)
      .sort((a, b) => (a.description ?? "").localeCompare(b.description ?? ""));
    if (mine.length === 0) continue;
    rows.push({ kind: "category", category, costCount: mine.length });
    if (expanded.has(category.id)) {
      for (const cost of mine) rows.push({ kind: "cost", category, cost });
    }
  }
  return rows;
}

/**
 * Rule 21's OTHER half — the default scope.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────┐
 * │ DOCUMENTED DEFECT — WITH A BLANK PICKER THE CANVAS SILENTLY DEFAULTS TO      │
 * │ "THE FIRST COUNTRY AND WIND":                                                │
 * │   Country.Country  = Coalesce(…SelectedCountry.Country,                       │
 * │                               First(col_cmpCountryPickerItems).Country)       │
 * │   Lower(Text(Technology)) = Lower(Coalesce(…SelectedNestedValue, "Wind"))     │
 * │ so an admin who has not chosen a scope is shown, and can EDIT, some other     │
 * │ country's standard costs believing they are looking at nothing.               │
 * │                                                                              │
 * │ FIXED: `isScopeChosen` is false until both halves are picked, and the panel   │
 * │ renders an empty state. No query is issued with a defaulted scope.            │
 * └──────────────────────────────────────────────────────────────────────────────┘
 */
export const isScopeChosen = (scope: DevexScope): boolean =>
  Boolean(scope.countryId) && Boolean(scope.technology);

/** The canvas fallback, for the parity test. Never used to build a query. */
export function defaultScopeCanvasParity(
  scope: DevexScope,
  firstCountry: { id: string; name: string } | null,
): DevexScope {
  return {
    countryId: scope.countryId ?? firstCountry?.id ?? null,
    countryName: scope.countryName ?? firstCountry?.name ?? null,
    technology: scope.technology ?? "Wind",
    technologyValue: scope.technologyValue ?? CHOICE_ADMIN.technology.wind,
  };
}

/**
 * Rule 24 — deleting the last cost of a category also removes the parent row.
 * `If(CountIf(colDevexCapexassumptions1, vsb_Category… = …) = 1, RemoveIf(<parent>);
 *     RemoveIf(<child>), RemoveIf(<child>))`
 * With the grouping derived (`groupByCategory` skips empty categories) this happens for
 * free — but the predicate is kept and tested so the behaviour is explicit.
 */
export const categoryDisappearsAfterDelete = (
  costs: DevexCost[],
  categoryId: string,
): boolean => costs.filter((c) => c.categoryId === categoryId).length <= 1;

/* ═════════════════════════════════════════════════════════════════════ units ════ */

export type CostUnit = number;

/**
 * Rule 27 — the unit choices depend on COUNTRY and TECHNOLOGY.
 * `If(…SelectedNestedValue = "Wind", If(…SelectedCountry.Name = "Poland",
 *     LastN(Choices('Cost Unit'), 3), …), …)`
 *
 * The option set is ordered EUR, EUR/MW, EUR/WTG, PLN, PLN/MW, PLN/WTG, so `LastN(…, 3)`
 * is the three PLN units. Poland gets PLN, everyone else EUR; and the per-WTG unit is
 * offered only for Wind, which rule 28 then enforces.
 */
export function unitChoices(countryName: string | null, technology: string | null): CostUnit[] {
  const isPoland = countryName === "Poland";
  const isWind = technology === "Wind";
  const base = isPoland
    ? [CHOICE_ADMIN.costUnit.pln, CHOICE_ADMIN.costUnit.plnPerMw, CHOICE_ADMIN.costUnit.plnPerWtg]
    : [CHOICE_ADMIN.costUnit.eur, CHOICE_ADMIN.costUnit.eurPerMw, CHOICE_ADMIN.costUnit.eurPerWtg];
  return isWind ? base : base.filter((u) => !isPerWtg(u));
}

export const isPerWtg = (unit: number | null): boolean =>
  unit === CHOICE_ADMIN.costUnit.eurPerWtg || unit === CHOICE_ADMIN.costUnit.plnPerWtg;

/** Rule 27's default — Poland defaults to PLN, everyone else to EUR. */
export const defaultUnit = (countryName: string | null): CostUnit =>
  countryName === "Poland" ? CHOICE_ADMIN.costUnit.pln : CHOICE_ADMIN.costUnit.eur;

/**
 * Rule 28 — a per-WTG unit outside Wind is an error:
 * `And(Or(unit = 'EUR/WTG', unit = 'PLN/WTG'), Not(…SelectedNestedValue = "Wind"))`
 */
export const isUnitValid = (unit: number | null, technology: string | null): boolean =>
  !(isPerWtg(unit) && technology !== "Wind");

/**
 * `lbl_AdminCost_RightPanel_Form_AddCost_Fields_Unit_ErrorMessage.Text` — the canvas message
 * for this rule.
 */
export const UNIT_ERROR = "A per-WTG unit can only be used for Wind.";

/* ═══════════════════════════════════════════════════════════════════ the cost ════ */

/** `lbl_AdminCost_RightPanel_Form_AddCost_Fields_Cost_ErrorMessage.Text` — verbatim. */
export const COST_INTEGER_ERROR = "Value must be a number without decimal";
/** `lbl_AdminCost_RightPanel_Form_AddCost_Fields_Cost_ErrorMessage.Text` — verbatim. */
export const COST_RANGE_ERROR = "Value must be between 0 and 100,000,000";

/**
 * The cost validator, reproducing the canvas's two-arm error text:
 * `If(And(Not(IsBlank(v)), Not(fn_Numeric_CC.IsInteger(v))), "Value must be a number
 *     without decimal", Not(fn_Numeric_Generators.InRange(v, 0, 100000000)), "…")`
 *
 * NOTE the cross-screen component reference the canvas relies on: `fn_Numeric_CC` is
 * declared on THIS screen but `fn_Numeric_Generators` is declared on `Project Generators
 * Screen`. `@/domain/numeric` replaces both.
 */
export function costAmountError(raw: string, language = "en-US"): string | null {
  if (isBlank(raw)) return null;              // blankness is caught by the Save conjunction
  if (!isInteger(raw, language)) return COST_INTEGER_ERROR;
  if (!inRange(raw, 0, COST_MAX, language)) return COST_RANGE_ERROR;
  return null;
}

export const isCostAmountValid = (raw: string, language = "en-US"): boolean =>
  !isBlank(raw) && costAmountError(raw, language) === null;

/** Rule 32 — `Cost Paid By` offers everything EXCEPT None. */
export const costPaidByChoices = (): number[] => [
  CHOICE_ADMIN.costPaidType.spv,
  CHOICE_ADMIN.costPaidType.devCo,
  CHOICE_ADMIN.costPaidType.shared,
];

/**
 * Rule 31 — a subaccount stops being offered once it carries 50 standard costs.
 * The original one-cost-per-subaccount rule is commented out just above it, and the
 * "already exists" label is hard-coded `Visible: false`, so 50 is the live rule.
 */
export const isSubaccountSelectable = (costs: DevexCost[], subaccountId: string): boolean =>
  costs.filter((c) => c.subaccountId === subaccountId).length < MAX_COSTS_PER_SUBACCOUNT;

/* ═══════════════════════════════════════════════════════ GUIDE p23 — the table display ════ */

/** The `Cost Unit` choice's display text, as the picker and the table both need it. */
export function unitLabel(unit: number | null): string {
  switch (unit) {
    case CHOICE_ADMIN.costUnit.eur: return "EUR";
    case CHOICE_ADMIN.costUnit.eurPerMw: return "EUR/MW";
    case CHOICE_ADMIN.costUnit.eurPerWtg: return "EUR/WTG";
    case CHOICE_ADMIN.costUnit.pln: return "PLN";
    case CHOICE_ADMIN.costUnit.plnPerMw: return "PLN/MW";
    case CHOICE_ADMIN.costUnit.plnPerWtg: return "PLN/WTG";
    default: return "—";
  }
}

/** The `Cost Paid By` choice's display text (rule 32 offers everything except None). */
export function costPaidLabel(value: number | null): string {
  switch (value) {
    case CHOICE_ADMIN.costPaidType.spv: return "SPV";
    case CHOICE_ADMIN.costPaidType.devCo: return "DevCo";
    case CHOICE_ADMIN.costPaidType.shared: return "Shared";
    default: return "—";
  }
}

/**
 * GUIDE p23 — the table's "Cost" column: a thousands-separated integer, a space, then the
 * unit, e.g. "10,000 EUR". The cost is always an integer (`costAmountError` rejects
 * decimals), so `formatInteger` — not `formatWithSeparators` — is the right formatter.
 */
export function formatDevexCostAmount(amount: number | null, unit: number | null): string {
  if (amount === null) return "—";
  return `${formatInteger(amount)} ${unitLabel(unit)}`;
}

/**
 * GUIDE p23 — the table's "Category / Account" column: the subaccount's account and its
 * own parent, e.g. "Turbine / PV Supply Agreement" for the subaccount named "PV Supply
 * Agreement" whose account is "Turbine".
 */
export const categoryAccountColumnLabel = (accountName: string, subaccountName: string): string =>
  `${accountName} / ${subaccountName}`;

/**
 * GUIDE p23 — the table's "Sub-Account" column: the same label with " - " and the
 * subaccount's number appended, e.g. "Turbine / PV Supply Agreement - 80000_0". A DIFFERENT
 * format from `aggregatedSubaccountName` (`"Parent / Name Number"`, no dash) — that one is
 * the picker's dropdown-item label, this one is this table's own column, and the screenshot
 * shows the two do not agree.
 */
export const subAccountColumnLabel = (
  accountName: string, subaccountName: string, subaccountNumber: string,
): string => `${categoryAccountColumnLabel(accountName, subaccountName)} - ${subaccountNumber}`;

/* ═══════════════════════════════════════════════════════════════════ the form ════ */

export interface DevexForm {
  subaccountId: string | null;
  /** Rule 30 — back-filled from the subaccount, not chosen directly. */
  categoryId: string | null;
  description: string;
  cost: string;
  unit: number | null;
  costPaidBy: number | null;
  distributionFrequency: number | null;
  comment: string;
  clusters: [boolean, boolean, boolean, boolean, boolean];
  /** `locEditSaveButtonEnabled` — set true by any field's OnChange. */
  dirty: boolean;
}

export const emptyDevexForm = (countryName: string | null): DevexForm => ({
  subaccountId: null,
  categoryId: null,
  description: "",
  cost: "",
  unit: defaultUnit(countryName),
  costPaidBy: null,
  distributionFrequency: DEFAULT_DISTRIBUTION_FREQUENCY_MONTHS,
  comment: "",
  clusters: [false, false, false, false, false],
  dirty: false,
});

/** Rule 26 — at least one of the five cluster checkboxes must be ticked. */
export const hasAnyCluster = (clusters: readonly boolean[]): boolean => clusters.some(Boolean);

/**
 * Rule 30 — selecting a subaccount BACK-FILLS the category and RESETS Cost Paid By.
 * `locSelectedCategoryWithSubaccount: LookUp(colCapexAccounts, 'CAPEX Account List' =
 *   cmb_….Selected.'Parent Account'.'CAPEX Account List').'Parent Account'`
 * — i.e. the subaccount's parent's parent, which is the CATEGORY.
 */
export function applySubaccountSelection(
  form: DevexForm,
  subaccountId: string,
  categoryIdOfSubaccount: string | null,
): DevexForm {
  return {
    ...form,
    subaccountId,
    categoryId: categoryIdOfSubaccount,
    // The canvas resets Cost Paid By only when EDITING an existing cost; resetting it in
    // both cases is simpler and cannot leave a value the new category does not allow.
    costPaidBy: null,
    dirty: true,
  };
}

/**
 * Rule 29 — changing the unit CLEARS the amount.
 * `OnChange: UpdateContext({locCostAmount: Blank(), locEditSaveButtonEnabled: true});
 *            Reset(txt_…_Cost)`
 */
export const applyUnitChange = (form: DevexForm, unit: number): DevexForm => ({
  ...form, unit, cost: "", dirty: true,
});

/**
 * The DEVEX/CAPEX Save conjunction, spelled out. Every term is from
 * `pcf_btn_AdminCost_RightPanel_Form_AddStandardCost_Button_Save.DisplayMode`.
 */
export function validateDevexForm(
  form: DevexForm,
  scope: DevexScope,
  language = "en-US",
): string[] {
  const errors: string[] = [];
  if (!form.dirty) errors.push("Nothing has been changed yet.");
  if (form.distributionFrequency === null) errors.push("Select a distribution frequency.");
  if (!form.subaccountId) errors.push("Select a subaccount.");
  if (!form.categoryId) errors.push("Select a category.");
  if (isBlank(form.description.trim())) errors.push("Enter a description.");
  if (isBlank(form.cost)) errors.push("Enter a cost.");
  if (form.costPaidBy === null) errors.push("Select who pays the cost.");
  if (!hasAnyCluster(form.clusters)) errors.push("Tick at least one cluster.");
  if (form.unit === null) errors.push("Select a unit.");

  const costError = costAmountError(form.cost, language);
  if (costError) errors.push(costError);
  if (!isUnitValid(form.unit, scope.technology)) errors.push(UNIT_ERROR);
  return errors;
}

export const canSaveStandardCost = (
  form: DevexForm,
  scope: DevexScope,
  language = "en-US",
): boolean => validateDevexForm(form, scope, language).length === 0;

/* ═════════════════════════════════════════════════════════════════════ the save ════ */

/**
 * Rule 25 — `Name` and `Description` are BOTH composed, and the user's raw text is also
 * stored in `'Description Input'`:
 *   Name:        $"Standard Cost : {country}-{technology}-{subaccount}"
 *   Description: $"Standard {subaccount} - {text}"
 *   Description Input: <text>
 */
export function composeStandardCostName(
  countryName: string | null,
  technology: string | null,
  subaccountName: string,
): string {
  return `Standard Cost : ${countryName ?? ""}-${technology ?? ""}-${subaccountName}`;
}

export const composeStandardCostDescription = (
  subaccountName: string,
  text: string,
): string => `Standard ${subaccountName} - ${text.trim()}`;

export function buildStandardCostPayload(
  form: DevexForm,
  args: {
    scope: DevexScope;
    subaccountName: string;
    owningBusinessUnitId: string | null;
    isCreate: boolean;
  },
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    [DEVEX_COL.name]: composeStandardCostName(
      args.scope.countryName, args.scope.technology, args.subaccountName,
    ),
    [DEVEX_COL.description]: composeStandardCostDescription(
      args.subaccountName, form.description,
    ),
    [DEVEX_COL.descriptionInput]: form.description.trim(),
    [DEVEX_COL.costAmount]: Number(String(form.cost).replace(",", ".")),
    [DEVEX_COL.unit]: form.unit,
    [DEVEX_COL.costPaidBy]: form.costPaidBy,
    [DEVEX_COL.comment]: form.comment.trim() === "" ? null : form.comment.trim(),
    [DEVEX_COL.distributionFrequency]: form.distributionFrequency,
    [DEVEX_COL.cluster1]: form.clusters[0],
    [DEVEX_COL.cluster2]: form.clusters[1],
    [DEVEX_COL.cluster3]: form.clusters[2],
    [DEVEX_COL.cluster4]: form.clusters[3],
    [DEVEX_COL.cluster5]: form.clusters[4],
  };
  if (args.isCreate) {
    data[DEVEX_COL.technology] = args.scope.technologyValue;
    if (args.scope.countryId) {
      data[`${DEVEX_LOOKUP.country}@odata.bind`] = `/vsb_countries(${args.scope.countryId})`;
    }
    if (form.categoryId) {
      data[`${DEVEX_LOOKUP.category}@odata.bind`] =
        `/vsb_capexaccountlists(${form.categoryId})`;
    }
    if (form.subaccountId) {
      data[`${DEVEX_LOOKUP.subaccount}@odata.bind`] =
        `/vsb_capexaccountlists(${form.subaccountId})`;
    }
  }
  if (args.owningBusinessUnitId) {
    data[`${DEVEX_LOOKUP.owningBusinessUnit}@odata.bind`] =
      `/businessunits(${args.owningBusinessUnitId})`;
  }
  return data;
}


export function planSaveStandardCost(args: {
  form: DevexForm;
  scope: DevexScope;
  subaccountName: string;
  existing: DevexCost | null;
  owningBusinessUnitId: string | null;
  canEdit: boolean;
  /** `DataSourceInfo('Devex/Capex Standard Assumptions', CreatePermission)` (rule 19). */
  canCreate: boolean;
  canWriteRecord: boolean;
  language?: string;
}): WritePlan {
  if (!args.canEdit) return refuse("This country is outside your editable country scope.");
  if (args.existing === null && !args.canCreate) {
    return refuse("You do not have permission to create standard costs.");
  }
  if (args.existing !== null && !args.canWriteRecord) {
    return refuse("You do not have permission to change this standard cost.");
  }
  const errors = validateDevexForm(args.form, args.scope, args.language);
  if (errors.length > 0) return refuse(errors[0]);

  const data = buildStandardCostPayload(args.form, {
    scope: args.scope,
    subaccountName: args.subaccountName,
    owningBusinessUnitId: args.owningBusinessUnitId,
    isCreate: args.existing === null,
  });
  const plan = emptyPlan();
  plan.writes.push(
    args.existing === null
      ? { op: "create", entitySet: DEVEX_ENTITY_SET, data, reason: "Standard cost created" }
      : {
          op: "update", entitySet: DEVEX_ENTITY_SET, id: args.existing.id, data,
          reason: "Standard cost updated",
        },
  );
  return plan;
}

/**
 * Rule 37 — DELETING A STANDARD COST IS A PLAIN DELETE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────┐
 * │ DOCUMENTED DEFECT — THE CANVAS DELETE BUTTON ALSO WRITES AN APPLY AUDIT ROW.  │
 * │                                                                              │
 * │ `btn_AdminCost_DevexCapex_Delete_StandardCost_Confirm.OnSelect` has the       │
 * │ ENTIRE Apply block APPENDED after the delete block. Worse, the delete cleanup │
 * │ sets `locSelectedCategory: Blank()` immediately before, and the Apply block   │
 * │ reads `If(IsBlank(locSelectedCategory), 'Apply All', Apply)` — so every        │
 * │ deletion is recorded as an **Apply All** that never ran. The "last applied"   │
 * │ badge on all four families then shows a timestamp for work nobody did.        │
 * │                                                                              │
 * │ FIXED: this plan contains the DELETE and nothing else. UT-ADCOST-041 asserts  │
 * │ no `Apply and Apply All Trackings` write appears.                             │
 * └──────────────────────────────────────────────────────────────────────────────┘
 */
export function planDeleteStandardCost(cost: DevexCost, canEdit: boolean): WritePlan {
  if (!canEdit) return refuse("This country is outside your editable country scope.");
  const plan = emptyPlan();
  plan.writes.push({
    op: "delete", entitySet: DEVEX_ENTITY_SET, id: cost.id,
    reason: `Standard cost “${cost.description ?? cost.id}” deleted`,
  });
  return plan;
}

/**
 * Rule 19's fail-open, CLOSED.
 *
 * The canvas row Edit/Delete wrap `RecordInfo(LookUp('Devex/Capex Standard Assumptions',
 * … = ThisItem.vsb_devexcapexstandardassumptionsid), …Permission)` in an `IsBlank(...)`
 * short-circuit that yields `DisplayMode.Edit` WHEN THE ROW CANNOT BE FOUND — a missing
 * lookup enables the button. Here an unknown privilege is treated as denied.
 */
export const rowActionEnabled = (privilege: boolean | undefined): boolean =>
  privilege === true;
