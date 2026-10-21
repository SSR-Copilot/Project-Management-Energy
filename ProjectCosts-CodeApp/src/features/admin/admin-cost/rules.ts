/**
 * Admin Cost Screen — the shared rules: scope, the four categories, captions and messages.
 * The two cost families live in `devexRules.ts` and `opexRules.ts`; both are re-exported at the
 * bottom so callers have one import point. (Redeveloped and connected 19 Oct 2026, D24.)
 *
 * Canvas screen: `Admin Cost Screen` (PM app),
 * `ProjectDocs/_extracted/msapp/projectmanagement/Src/Admin Cost Screen.pa.yaml`.
 *
 * One country × technology picker fixes the scope; a four-row accordion (DEVEX/CAPEX, Operation
 * & Maintenance, Land Lease, Other OPEX Costs) each opens a different editor.
 *
 * SERVER AUTOMATION (04-flow-inventory.md, verified 19 Oct 2026; the plugin DLL read from the
 * solution export):
 *  - deleting a `vsb_devexcapexstandardassumptions` row fires `VSB_CapexAssumptionDeletion`
 *    (pre-validation), which deletes every project's `vsb_capexprojectcontract` and `vsb_capexcost`
 *    built from it. The client deletes the standard cost only, as the canvas.
 *  - nothing fires on `vsb_opexlandleasestandardassumptions`.
 *  - no flow is called: `SynchronizeStandardAssumptionCosts` sits in commented-out code.
 *
 * NOT PORTED (D20, Apply out of scope): both Apply buttons and their info texts, the two
 * "… Apply was made by …" tags, the Apply confirmation, and the `Apply and Apply All Trackings`
 * upsert — including the one the canvas appends to every DEVEX/CAPEX delete. Also the rail flag
 * images.
 *
 * PERMISSION: entry and every write are gated on the admin rule (`useAdminAccess`), as on the
 * other admin screens. The canvas `DataSourceInfo` / `RecordInfo` checks have no SDK equivalent
 * (D1); Dataverse refuses what the user may not do and the refusal is shown. The invented
 * country-scope rule (`canEditScope`) was removed.
 *
 * HIDDEN CONTROLS:
 *  - `btn_Filter_Devex_Capex_Assumptions` (Select()-ed by OnVisible, the picker, Save and Delete)
 *    builds the grouped DEVEX list and opens the touched category → `devexRows` + the open set.
 *  - `btn_AdminCost_DevexCapex_Delete_StandardCost_Confirm` (Select()-ed by the delete dialog)
 *    → `planDeleteStandardCost` (its Apply-tracking tail is D20).
 *  - `btn_LandLease_NewEditPeriod_ResetButton` / `btn_AdminCost_RightPanel_Form_AddStandardCost_
 *    Button_Reset` → the panel forms are rebuilt every time a panel opens.
 *  - `fn_Numeric_CC` (and the cross-screen `fn_Numeric_Generators`) → `@/domain/powerFxNumeric`.
 */
import { CHOICE_ADMIN } from "@/data/dataverseNames";
import {
  COST_CONTRACT_EXCLUDED_COUNTRIES, PICKER_TECHNOLOGIES, buildCountryPicker, toNestedPicker,
  technologyValue, type CountryRef,
} from "@/features/admin/admin-gates-approvals/rules";

export { COST_CONTRACT_EXCLUDED_COUNTRIES, PICKER_TECHNOLOGIES, technologyValue };
export type { CountryRef };
export { emptyPlan, refusePlan, type PlannedWrite, type WritePlan } from "@/data/writePlan";
export * from "./devexRules";
export * from "./opexRules";

/* ═══════════════════════════════════════════════════════════════ the four rows ════ */

export interface CostCategoryRow {
  /** The accordion label, verbatim from `colAdminCostCategories`. */
  category: string;
  /** `TypeOfCategory` — the `'Contract Types'` option-set value. */
  typeOfCategory: number;
  family: "devex" | "opex" | "landLease";
}

/**
 * `colAdminCostCategories` — a hard-coded four-row table built in `OnVisible`, in this order,
 * every row `IsFolded: true` (all cards start collapsed).
 */
export const COST_CATEGORIES: readonly CostCategoryRow[] = [
  /** `Admin Cost Screen.OnVisible` → `Category: "DEVEX/CAPEX"` — verbatim. */
  { category: "DEVEX/CAPEX", typeOfCategory: CHOICE_ADMIN.contractTypes.devexCapex, family: "devex" },
  /** `Admin Cost Screen.OnVisible` → `Category: "Operation & Maintenance"` — verbatim. */
  { category: "Operation & Maintenance", typeOfCategory: CHOICE_ADMIN.contractTypes.opexOandM, family: "opex" },
  /** `Admin Cost Screen.OnVisible` → `Category: "Land Lease"` — verbatim. */
  { category: "Land Lease", typeOfCategory: CHOICE_ADMIN.contractTypes.landlease, family: "landLease" },
  /** `Admin Cost Screen.OnVisible` → `Category: "Other OPEX Costs"` — verbatim. */
  { category: "Other OPEX Costs", typeOfCategory: CHOICE_ADMIN.contractTypes.opexOther, family: "opex" },
];

/** `cmp_Admin_Cost_LandLease_AddStandardContractType_CommandBar.Visible` — the three OPEX rows. */
export const showAddContractType = (row: CostCategoryRow): boolean => row.family !== "devex";

/** `btn_Admin_Cost_DevexCapex_AddCost.Visible` — the DEVEX/CAPEX row. */
export const showAddCost = (row: CostCategoryRow): boolean => row.family === "devex";

/** `ico_…_GeneratorType_Up_2` / `_Down_2.OnSelect` — each card toggles on its own. */
export function toggleCategoryCard(open: ReadonlySet<string>, category: string): Set<string> {
  const next = new Set(open);
  if (next.has(category)) next.delete(category); else next.add(category);
  return next;
}

/* ═════════════════════════════════════════════════════════════════════ scope ════ */

export interface CostScope {
  countryId: string | null;
  countryName: string | null;
  /** The picker's `SelectedNestedValue` — `"Wind"` or `"PV"`. */
  technology: string | null;
  technologyValue: number | null;
}

/**
 * `cmp_Admin_Costs_Assumption_NestedCountryPickerColumn` — `Countries` without Spain, Greece and
 * Romania, every country nesting Wind and PV (this screen keeps the component default).
 */
export const buildCostPicker = (countries: readonly CountryRef[]) =>
  toNestedPicker(buildCountryPicker([...countries], { exclude: COST_CONTRACT_EXCLUDED_COUNTRIES }));

export function costScopeFor(country: CountryRef | null, technology: string | null): CostScope {
  return {
    countryId: country?.id ?? null,
    countryName: country?.name ?? null,
    technology,
    technologyValue: technologyValue(technology),
  };
}

/**
 * The picker's initial selection: the component's galleries default to their first rows, so the
 * canvas opens on the first country (Germany) and Wind — the same scope its `Coalesce(…,
 * First(col_cmpCountryPickerItems), "Wind")` filters use. The code app used to show nothing until
 * a pick; it now opens on that same, visibly selected scope (D24).
 */
export function defaultCostScope(countries: readonly CountryRef[]): CostScope {
  const first = buildCostPicker(countries).countries[0];
  const country = first ? countries.find((c) => c.id === first.key) ?? null : null;
  return costScopeFor(country, country ? PICKER_TECHNOLOGIES[0] ?? null : null);
}

/**
 * `If(…SelectedCountry.Name = "Poland", "PLN", "EUR")` — the currency every OPEX caption, header
 * and the unit error repeat.
 */
export const costCurrency = (countryName: string | null): "PLN" | "EUR" =>
  countryName === "Poland" ? "PLN" : "EUR";

/** `Label1.Text` — `$"Standard Assumptions / Costs / {Country} / {Technology}"`. */
export const costBreadcrumbText = (scope: CostScope): string =>
  `Standard Assumptions / Costs / ${scope.countryName ?? ""} / ${scope.technology ?? ""}`;

/* ═════════════════════════════════════════════════════════════════ messages ════ */

export const MSG = {
  /** `locSpinnerInformationText` — the DEVEX delete and the OPEX delete — verbatim. */
  deleting: "Please wait, deleting...",
  /** `pcf_btn_AdminCost_RightPanel_Form_AddStandardCost_Button_Save.OnChange` — verbatim. */
  savingCost: "Please wait, saving...",
  /** `pcf_LandLease_RightPanel_NewEditPeriod_BodyButtons_Save_1.OnChange` — verbatim. */
  savingPeriod: (description: string) => `Please wait, saving "${description}"...`,
  /** `btn_AdminCost_DevexCapex_Delete_StandardCost_Confirm.OnSelect` `Notify` — verbatim. */
  devexDeleteError: (detail: string) => `Error : ${detail}, standard cost could not be deleted`,
  /** `cmp_PopUp_Confirmation_Delete_Contract_Or_Period.OnConfirm` `Notify` — verbatim prefix. */
  opexDeleteError: (detail: string) =>
    `Error: Standard Contract could not be deleted correctly. Internal error: originated on ${detail}`,
  /** The OPEX Save `Notify` — verbatim prefix. */
  opexSaveError: (detail: string) =>
    `Error: Land Lease Standard Contract could not be saved correctly. Internal error: originated on ${detail}`,
  /** NEW — no canvas equivalent: the write plans' refusal without the admin rule. */
  noPermission: "You do not have permission to change the standard costs.",
  /** NEW — no canvas equivalent: rule 19 load-error state. */
  loadFailedTitle: "Cost data is unavailable",
  /** NEW — no canvas equivalent: rule 19 load-error state. */
  loadFailedDescription: "The standard costs could not be loaded. Please try again.",
  /** NEW — no canvas equivalent: rule 19 loading state. */
  loading: "Loading...",
  /** NEW — no canvas equivalent: a plan's refusal when Save is greyed out. */
  incomplete: "Fill in every required field first.",
} as const;

/** The canvas DEVEX save has no `IfError`; its failure detail is shown as is (SOURCE DEFECT fixed). */
export const plainError = (detail: string): string => detail;

/* ══════════════════════════════════════════════════════ screen captions (canvas) ════ */

/** Visible captions of `Admin Cost Screen`, verbatim; each cites its `Control.Property`. */
export const ADMIN_COST_LABELS = {
  /** `cmp_Admin_ProjectGatest_Approvals_Header_1.Project` — `Name: "Costs"`. */
  title: "Costs",
  /** `cmp_Admin_Cost_LandLease_AddStandardContractType_CommandBar.Items` — `ItemDisplayName`. */
  addContractType: "Add Contract Type",
  /** `btn_Admin_Cost_DevexCapex_AddCost.Text`. */
  addCost: "Add Cost",
  /** `btn_OpexCosts_Content_Subaccounts_CardBody_AddPeriod.Text`. */
  addPeriod: "Add Period",
  /** `btn_ICON_OpexCosts_…_CostsTableRow_Edit.Text` / `btn_DevexCapex_…_Action_Edit` (icon only). */
  edit: "Edit",
  /** The DEVEX row delete button (icon `Delete`). */
  delete: "Delete",
  /** `Button2_1.Text` / `Button2_2.Text` — `If(…IsCollapsed? / IsFolded, "+", "-")`. */
  expand: "+",
  collapse: "-",
  /** `cmp_PopUp_Confirmation_Delete_Contract_Or_Period.ConfirmButtonText` / `.CancelButtonText`. */
  confirm: "Confirm",
  cancel: "Cancel",
  /** `ico_…_Header_Cancel.Tooltip` / `ico_…_BodyheaderCancel_1.Tooltip`. */
  close: "Cancel",
} as const;

export type DeleteTarget = "cost" | "contract" | "period";

/**
 * `cmp_PopUp_Confirmation_Delete_Contract_Or_Period.Title` —
 * `Switch(cat, DEVEX/CAPEX, "Delete Cost", $"Delete {If(Period 1, "Contract", "Period")}")`.
 */
export function deleteDialogTitle(target: DeleteTarget): string {
  if (target === "cost") return "Delete Cost";
  return target === "contract" ? "Delete Contract" : "Delete Period";
}

/** `cmp_PopUp_Confirmation_Delete_Contract_Or_Period.Description`. */
export function deleteDialogDescription(target: DeleteTarget, description: string): string {
  switch (target) {
    case "cost": return `Are you sure you want to delete the "${description}" cost?`;
    case "contract":
      return `Are you sure you want to delete the "${description}" contract and all related periods?`;
    case "period": return `Are you sure you want to delete the "${description}" period?`;
  }
}
