/**
 * Costs settings — fixed texts and option lists, transcribed from the canvas
 * (`Admin Cost Screen.pa.yaml`, cited ACS:<line>) and App.Formulas (App:<line>).
 */
import {
  AGGREGATION, CONTRACT_TYPE, COST_PAID_BY, COST_UNIT, INACTIVE_SUBACCOUNT_MESSAGE,
  type OpexContractType,
} from "@/data/settings/costs";
import { configuredCountryTechnologies, type TechnologiesFor } from "@/domain/countryPicker";
import { COST_TECHNOLOGIES } from "@/domain/technology";

/** FR-4 — the four accordion sections, in canvas order (ACS:111-135). */
export type CategoryKey = "devex" | "oAndM" | "landLease" | "other";
export interface CostCategoryDef {
  key: CategoryKey;
  title: string;
  /** `undefined` for DEVEX/CAPEX (its own table, T1). */
  contractType: OpexContractType | undefined;
}
export const COST_CATEGORIES: readonly CostCategoryDef[] = [
  { key: "devex", title: "DEVEX/CAPEX", contractType: undefined },
  { key: "oAndM", title: "Operation & Maintenance", contractType: CONTRACT_TYPE.oAndM },
  { key: "landLease", title: "Land Lease", contractType: CONTRACT_TYPE.landLease },
  { key: "other", title: "Other OPEX Costs", contractType: CONTRACT_TYPE.other },
];

/*
 * FR-3 — the picker order, the default selection and Wind then PV come from the shared M6
 * configuration: `COST_DEFAULT` (`@/domain/countryPicker`) and `COST_TECHNOLOGIES`
 * (`@/domain/technology`). Since the PO requirement of 2026-10-17 `COST_DEFAULT` is
 * `{kind:"first"}` — the first listed country that offers technologies, with its first
 * technology — which on every list is Germany / Wind, exactly as the previous `preferred`
 * spelling produced (only configured countries offer technologies and all list Wind first).
 */

/**
 * Parity r1 GAP-1 / reusable-components V5 — the canvas `Nestings` gives Wind / PV ONLY to the six
 * `PICKER_COUNTRIES` (ACS:650-733, matched by exact `Country = ThisItem.Name`); any other listed
 * country has no technology children. The list itself is the canvas deny-list
 * (`COST_COUNTRY_RULE`: Spain / Greece / Romania dropped, the six first, any other country after
 * them alphabetically). Such an extra country is LISTED without an expander or technologies, the
 * selection hook refuses it, so it never becomes the scope and no read or write can run for it.
 * A module constant, so the hook receives a STABLE function.
 */
export const COST_TECHNOLOGIES_FOR: TechnologiesFor = configuredCountryTechnologies(COST_TECHNOLOGIES);

/** `vsb_costunit` labels (the generated model's labels are mangled, 03-missing-data-sources §2). */
export const COST_UNIT_LABEL: Record<number, string> = {
  [COST_UNIT.eur]: "EUR",
  [COST_UNIT.eurMw]: "EUR/MW(p)",
  [COST_UNIT.eurWtg]: "EUR/WTG",
  [COST_UNIT.pln]: "PLN",
  [COST_UNIT.plnMw]: "PLN/MW(p)",
  [COST_UNIT.plnWtg]: "PLN/WTG",
};

export const COST_PAID_BY_OPTIONS: readonly { value: number; label: string }[] = [
  { value: COST_PAID_BY.devCo, label: "DevCo" },
  { value: COST_PAID_BY.spv, label: "SPV" },
];

export const AGGREGATION_OPTIONS: readonly { value: number; label: string }[] = [
  { value: AGGREGATION.sum, label: "SUM" },
  { value: AGGREGATION.max, label: "MAX" },
  { value: AGGREGATION.min, label: "MIN" },
];

/** `colFrequencyInMonths` (App:464-485). */
export const FREQUENCY_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 1, label: "1 Month" },
  { value: 2, label: "2 Months" },
  { value: 3, label: "3 Months" },
  { value: 6, label: "6 Months" },
  { value: 12, label: "12 Months" },
];

/** `Filter(colYearsForDuration, Value < 36)` (App:442-452, ACS:5472). */
export const YEAR_OPTIONS: readonly { value: number; label: string }[] =
  Array.from({ length: 36 }, (_, i) => ({ value: i, label: `${i} ${i <= 1 ? "year" : "years"}` }));

/** `colMonthsForDuration` (App:453-463). */
export const MONTH_OPTIONS: readonly { value: number; label: string }[] =
  Array.from({ length: 12 }, (_, i) => ({ value: i, label: `${i} ${i <= 1 ? "month" : "months"}` }));

/** FR-10 — the canvas Cluster 3 label carried a leading TAB (ACS:9996); not reproduced. */
export const CLUSTER_LABELS = [
  "Cluster 1: Feasibility Studies",
  "Cluster 2: Pre-Permitting",
  "Cluster 3: Permitting",
  "Cluster 4: Pre-Construction",
  "Cluster 5: Construction",
] as const;

export const MSG = {
  // FR-31 busy texts.
  saving: "Please wait, saving...",
  savingNamed: (description: string) => `Please wait, saving "${description}"...`,
  deleting: "Please wait, deleting...",
  // FR-22 validation texts (exact canvas wording).
  fixCostsDecimals: "Value must be a numeric with two decimal places.",
  fixCostsRange: "Value must be between 0 and 1,000,000,000.0.",
  revenueDecimals: "Value must be a numeric with two decimal place.",
  revenueRange: "Please select a value between 0 and 10,000.0.",
  perUnitDecimals: "Value must be a numeric with two decimal places.",
  perUnitRange: "Please select a value between 0 and 100,000,000.0.",
  durationZero: "0 year 0 months can't be selected",
  inflationDecimals: "Value must be a numeric with 1 decimal place.",
  inflationRange: "Please select a value between 0 and 100.",
  commercialHint: "Please fill in at least one commercial figure",
  maxPeriods: "Maximum of 10 periods reached",
  /** Parity r2 R2-5 — Add / Delete Period disabled by hidden inactive rows. */
  inactivePeriods: (periods: readonly number[]) => {
    const named = periods.filter((p) => p > 0).map((p) => `Period ${p}`);
    const plural = named.length > 1 || (named.length === 0 && periods.length > 1);
    const what = plural
      ? `inactive periods${named.length > 0 ? ` (${named.join(", ")})` : ""} that are`
      : `an inactive ${named[0] ?? "period"} that is`;
    return `This contract has ${what} not shown here, so periods cannot be added or deleted. Reactivate or remove ${plural ? "them" : "it"} in Dataverse, or delete the whole contract.`;
  },
  // FR-10 DEVEX texts.
  costDecimals: "Value must be a number without decimal",
  costRange: "Value must be between 0 and 100,000,000",
  wtgOnlyWind: (currency: string) => `${currency}/WTG only applicable for Wind`,
  // Outcomes (the canvas showed none on success, and raw JSON on failure — FR-32).
  devexSaved: "The standard cost was saved.",
  devexDeleted: "The standard cost was deleted.",
  contractSaved: "The standard contract was saved.",
  contractDeleted: "The contract and all its periods were deleted.",
  periodDeleted: "The period was deleted.",
  devexSaveFailed: "The standard cost could not be saved.",
  devexDeleteFailed: "The standard cost could not be deleted.",
  contractSaveFailed: "The standard contract could not be saved.",
  contractDeleteFailed: "The contract could not be deleted.",
  periodDeleteFailed: "The period could not be deleted.",
  inflationStartYear: "Cluster 6 : Operation + 1 Year",
  // B-2.
  subaccountInactive: INACTIVE_SUBACCOUNT_MESSAGE,
  // B-9.
  currencyMissing: (code: string) => `Currency ${code} is not configured, so the contract cannot be saved. Ask an administrator to add it.`,
  // FR-30 — drawn disabled, as in the canvas (03-modules Module E, blocks 4/6).
  applyToAll: "Apply to All",
  apply: "Apply",
  applyInfo: "Apply standard cost to relevant projects, this will override existing standard assumption cost.",
  applyNotBuilt: "Apply / Apply to All are not available: they are disabled in the canvas app pending a business decision.",
} as const;
