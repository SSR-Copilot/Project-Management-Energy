/**
 * Costs settings — fixed texts and option lists, transcribed from the canvas
 * (`Admin Cost Screen.pa.yaml`, cited ACS:<line>) and App.Formulas (App:<line>).
 *
 * Every visible string cites its canvas `Control.Property` (CONVENTIONS rule 7). A string marked
 * "NEW — no canvas equivalent" is this app's own text: the canvas showed nothing there (no
 * success notice, no load-error state) or showed a raw error; each such text is a DIVERGENCE
 * recorded under D36.
 */
import {
  AGGREGATION, CONTRACT_TYPE, COST_PAID_BY, COST_UNIT, INACTIVE_SUBACCOUNT_MESSAGE, type OpexContractType,
} from "@/domain/costStandards";
import { configuredCountryTechnologies, type TechnologiesFor } from "@/domain/countryPicker";
import { COST_TECHNOLOGIES } from "@/domain/technology";

/** The four accordion sections, in canvas order (ACS:111-135). */
export type CategoryKey = "devex" | "oAndM" | "landLease" | "other";
export interface CostCategoryDef {
  /** A stable configuration key: the stem of each section's repeated `data-testid`s. */
  key: CategoryKey;
  title: string;
  /** `undefined` for DEVEX/CAPEX (its own table, T1). */
  contractType: OpexContractType | undefined;
}
/** `colAdminCostCategories` (`Admin Cost Screen.OnVisible`) — each `Category` verbatim. */
export const COST_CATEGORIES: readonly CostCategoryDef[] = [
  /** `Admin Cost Screen.OnVisible` → `Category: "DEVEX/CAPEX"` — verbatim. */
  { key: "devex", title: "DEVEX/CAPEX", contractType: undefined },
  /** `Admin Cost Screen.OnVisible` → `Category: "Operation & Maintenance"` — verbatim. */
  { key: "oAndM", title: "Operation & Maintenance", contractType: CONTRACT_TYPE.oAndM },
  /** `Admin Cost Screen.OnVisible` → `Category: "Land Lease"` — verbatim. */
  { key: "landLease", title: "Land Lease", contractType: CONTRACT_TYPE.landLease },
  /** `Admin Cost Screen.OnVisible` → `Category: "Other OPEX Costs"` — verbatim. */
  { key: "other", title: "Other OPEX Costs", contractType: CONTRACT_TYPE.other },
];

/*
 * The picker order, the default selection and Wind then PV come from the shared
 * picker configuration: `COST_DEFAULT` (`@/domain/countryPicker`) and `COST_TECHNOLOGIES`
 * (`@/domain/technology`). Since the PO requirement of 2026-10-17 `COST_DEFAULT` is
 * `{kind:"first"}` — the first listed country that offers technologies, with its first
 * technology. On every list that is Germany / Wind, because only the configured countries
 * offer technologies and all of them list Wind first.
 */

/**
 * The canvas `Nestings` gives Wind / PV ONLY to the six
 * `PICKER_COUNTRIES` (ACS:650-733, matched by exact `Country = ThisItem.Name`); any other listed
 * country has no technology children. The list itself is the canvas deny-list
 * (`COST_COUNTRY_RULE`: Spain / Greece / Romania dropped, the six first, any other country after
 * them alphabetically). Such an extra country is LISTED without an expander or technologies, the
 * selection hook refuses it, so it never becomes the scope and no read or write can run for it.
 * A module constant, so the hook receives a STABLE function.
 */
export const COST_TECHNOLOGIES_FOR: TechnologiesFor = configuredCountryTechnologies(COST_TECHNOLOGIES);

/**
 * `vsb_costunit` labels — `cmb_AdminCost_RightPanel_Form_AddCost_Fields_Unit.Items`
 * (`Choices('Cost Unit')`), the option labels from customizations.xml (the generated model's
 * labels are mangled).
 */
export const COST_UNIT_LABEL: Record<number, string> = {
  [COST_UNIT.eur]: "EUR",
  [COST_UNIT.eurMw]: "EUR/MW(p)",
  [COST_UNIT.eurWtg]: "EUR/WTG",
  [COST_UNIT.pln]: "PLN",
  [COST_UNIT.plnMw]: "PLN/MW(p)",
  [COST_UNIT.plnWtg]: "PLN/WTG",
};

/**
 * `rad_AdminCost_RightPanel_Form_AddCost_Fields_Cost_Paid_By.Items` —
 * `Filter(Choices('Cost paid type'), Not(Value = 'Cost paid type'.None))`, labels verbatim.
 */
export const COST_PAID_BY_OPTIONS: readonly { value: number; label: string }[] = [
  { value: COST_PAID_BY.devCo, label: "DevCo" },
  { value: COST_PAID_BY.spv, label: "SPV" },
];

/** `drp_LandLease_RightPanel_NewEditPeriod_BodyContent_Aggregation_1.Items` — `Choices('Opex Aggregation')`. */
export const AGGREGATION_OPTIONS: readonly { value: number; label: string }[] = [
  { value: AGGREGATION.sum, label: "SUM" },
  { value: AGGREGATION.max, label: "MAX" },
  { value: AGGREGATION.min, label: "MIN" },
];

/** `colFrequencyInMonths` (App:464-485) — `drp_…_DistributionFrequency_Month_1.Items`. */
export const FREQUENCY_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 1, label: "1 Month" },
  { value: 2, label: "2 Months" },
  { value: 3, label: "3 Months" },
  { value: 6, label: "6 Months" },
  { value: 12, label: "12 Months" },
];

/** `Filter(colYearsForDuration, Value < 36)` (App:442-452, ACS:5472) — `drp_…_DurationYears_1.Items`. */
export const YEAR_OPTIONS: readonly { value: number; label: string }[] =
  Array.from({ length: 36 }, (_, i) => ({ value: i, label: `${i} ${i <= 1 ? "year" : "years"}` }));

/** `colMonthsForDuration` (App:453-463) — `drp_…_DurationMonths_1.Items`. */
export const MONTH_OPTIONS: readonly { value: number; label: string }[] =
  Array.from({ length: 12 }, (_, i) => ({ value: i, label: `${i} ${i <= 1 ? "month" : "months"}` }));

/**
 * `chk_AdminCost_RightPanel_SelectCluster1…5.Label` — verbatim.
 * DIVERGENCE: the canvas Cluster 3 label starts with a TAB character (ACS:9996,
 * `="\tCluster 3: Permitting"`), which renders as leading whitespace; it is not reproduced.
 */
export const CLUSTER_LABELS = [
  "Cluster 1: Feasibility Studies",
  "Cluster 2: Pre-Permitting",
  "Cluster 3: Permitting",
  "Cluster 4: Pre-Construction",
  "Cluster 5: Construction",
] as const;

export const MSG = {
  // Busy texts (`locSpinnerInformationText`, shown by `cmp_PopUp_Loading_Admin_Cost`).
  /** `pcf_btn_AdminCost_RightPanel_Form_AddStandardCost_Button_Save.OnChange` → `locSpinnerInformationText` — verbatim. */
  saving: "Please wait, saving...",
  /** `pcf_LandLease_RightPanel_NewEditPeriod_BodyButtons_Save_1.OnChange` → `locSpinnerInformationText` — verbatim. */
  savingNamed: (description: string) => `Please wait, saving "${description}"...`,
  /** `cmp_PopUp_Confirmation_Delete_Contract_Or_Period.OnConfirm` → `locSpinnerInformationText` — verbatim. */
  deleting: "Please wait, deleting...",
  // Validation texts.
  /** `lbl_LandLease_RightPanel_NewEditPeriod_BodyContent_FixedCosts_ErrorMessage_1.Text` (first branch) — verbatim. */
  fixCostsDecimals: "Value must be a numeric with two decimal places.",
  /** `lbl_…_FixedCosts_ErrorMessage_1.Text` (second branch, `Text(1000000000, "#,###.0#")`) — verbatim. */
  fixCostsRange: "Value must be between 0 and 1,000,000,000.0.",
  /** `lbl_…_PercentOfRevenues_ErrorMessage_1.Text` (first branch; "place", singular) — verbatim. */
  revenueDecimals: "Value must be a numeric with two decimal place.",
  /** `lbl_…_PercentOfRevenues_ErrorMessage_1.Text` (second branch, `Text(10000, "#,##0.0#")`) — verbatim. */
  revenueRange: "Please select a value between 0 and 10,000.0.",
  /** `lbl_…_EuroMWh_ErrorMessage_1` / `_EuroMW_ErrorMessage_1` / `_EuroWTG_ErrorMessage_1.Text` (first branch) — verbatim. */
  perUnitDecimals: "Value must be a numeric with two decimal places.",
  /** `lbl_…_EuroMWh_ErrorMessage_1` / `_EuroMW_…` / `_EuroWTG_…` `.Text` (second branch, `Text(100000000, "#,##0.0#")`) — verbatim. */
  perUnitRange: "Please select a value between 0 and 100,000,000.0.",
  /** `lbl_LandLease_RightPanel_NewEditPeriod_BodyContent_DurationYearMonths_ErrorMessage.Text` — verbatim. */
  durationZero: "0 year 0 months can't be selected",
  /** `lbl_LandLease_RightPanel_NewEditCost_BodyContent_InflationProfile_ErrorMessage_1.Text` (first branch) — verbatim. */
  inflationDecimals: "Value must be a numeric with 1 decimal place.",
  /** `lbl_…_InflationProfile_ErrorMessage_1.Text` (second branch) — verbatim. */
  inflationRange: "Please select a value between 0 and 100.",
  /** `lbl_LandLease_RightPanel_NewEditPeriod_BodyButtons_Hint_1.Text` — verbatim. */
  commercialHint: "Please fill in at least one commercial figure",
  /**
   * NEW — no canvas equivalent. The canvas offers an 11th Add Period (SOURCE DEFECT, see
   * `canAddPeriod` in `rules.ts`); here the button is disabled with this reason.
   */
  maxPeriods: "Maximum of 10 periods reached",
  /**
   * NEW — no canvas equivalent: Add / Delete Period disabled by hidden inactive rows
   * (DIVERGENCE, see `inactiveRowsReason` in `rules.ts`).
   */
  inactivePeriods: (periods: readonly number[]) => {
    const named = periods.filter((p) => p > 0).map((p) => `Period ${p}`);
    const plural = named.length > 1 || (named.length === 0 && periods.length > 1);
    const what = plural
      ? `inactive periods${named.length > 0 ? ` (${named.join(", ")})` : ""} that are`
      : `an inactive ${named[0] ?? "period"} that is`;
    return `This contract has ${what} not shown here, so periods cannot be added or deleted. Reactivate or remove ${plural ? "them" : "it"} in Dataverse, or delete the whole contract.`;
  },
  // DEVEX texts.
  /** `lbl_AdminCost_RightPanel_Form_AddCost_Fields_Cost_ErrorMessage.Text` (first branch) — verbatim. */
  costDecimals: "Value must be a number without decimal",
  /** `lbl_AdminCost_RightPanel_Form_AddCost_Fields_Cost_ErrorMessage.Text` (second, live branch) — verbatim. */
  costRange: "Value must be between 0 and 100,000,000",
  /** `lbl_AdminCost_RightPanel_Form_AddCost_Fields_Unit_ErrorMessage.Text` — `{EUR|PLN}/WTG only applicable for Wind`, verbatim. */
  wtgOnlyWind: (currency: string) => `${currency}/WTG only applicable for Wind`,
  /**
   * `img_DevexCapex_Content_StandardCosts_CardBody_CostsTable_Comment.Tooltip` — its literal parts,
   * `"Comment:"` (with a comment) / `"Add Comment"` (without), as the icon's `aria-label` (the image
   * has no `AccessibleLabel`; the comment itself is bound data and stays in the tooltip).
   */
  commentLabel: (hasComment: boolean) => (hasComment ? "Comment" : "Add Comment"),
  /*
   * Outcomes. DIVERGENCE: the canvas shows no notice on success, and on failure a raw
   * `Notify`: `$"Error : {FirstError.Message}, standard cost could not be deleted"`
   * (`btn_AdminCost_DevexCapex_Delete_StandardCost_Confirm.OnSelect`), "Error: Standard Contract
   * could not be deleted correctly. Internal error: originated on …" (`cmp_PopUp_Confirmation_
   * Delete_Contract_Or_Period.OnConfirm`) and "Error: Land Lease Standard Contract could not be
   * saved correctly. Internal error: …" (`pcf_LandLease_…_Save_1.OnChange`). The DEVEX save has no
   * `IfError` at all (SOURCE DEFECT: a failed save is silent). This app shows the short sentences
   * below as toasts / in the panel instead, never raw JSON.
   */
  /** NEW — no canvas equivalent (see the DIVERGENCE above). */
  devexSaved: "The standard cost was saved.",
  /** NEW — no canvas equivalent. */
  devexDeleted: "The standard cost was deleted.",
  /** NEW — no canvas equivalent. */
  contractSaved: "The standard contract was saved.",
  /** NEW — no canvas equivalent. */
  contractDeleted: "The contract and all its periods were deleted.",
  /** NEW — no canvas equivalent. */
  periodDeleted: "The period was deleted.",
  /** NEW — no canvas equivalent: the admin gate's refusal (`useAdminAccess`, D1). */
  noPermission: "You do not have permission to change the standard costs.",
  /** NEW — replaces the missing DEVEX save `IfError` (SOURCE DEFECT above). */
  devexSaveFailed: "The standard cost could not be saved.",
  /** NEW — replaces the raw `Notify` of `btn_AdminCost_DevexCapex_Delete_StandardCost_Confirm.OnSelect`. */
  devexDeleteFailed: "The standard cost could not be deleted.",
  /** NEW — replaces the raw `Notify` of `pcf_LandLease_RightPanel_NewEditPeriod_BodyButtons_Save_1.OnChange`. */
  contractSaveFailed: "The standard contract could not be saved.",
  /** NEW — replaces the raw `Notify` of `cmp_PopUp_Confirmation_Delete_Contract_Or_Period.OnConfirm`. */
  contractDeleteFailed: "The contract could not be deleted.",
  /** NEW — replaces the same raw `Notify` for a period delete. */
  periodDeleteFailed: "The period could not be deleted.",
  /** `txt_LandLease_RightPanel_NewEditCost_BodyContent_InflationStartYear_1.Value` (the live literal) — verbatim. */
  inflationStartYear: "Cluster 6 : Operation + 1 Year",
  /** NEW — no canvas equivalent: an inactive sub-account blocks Save (DIVERGENCE, `validateDevexForm`). */
  subaccountInactive: INACTIVE_SUBACCOUNT_MESSAGE,
  /** NEW — no canvas equivalent: the contract currency (EUR / PLN) must exist (DIVERGENCE, `currencyIssue`). */
  currencyMissing: (code: string) => `Currency ${code} is not configured, so the contract cannot be saved. Ask an administrator to add it.`,
} as const;
