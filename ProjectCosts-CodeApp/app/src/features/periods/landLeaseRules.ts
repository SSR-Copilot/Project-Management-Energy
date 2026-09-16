/**
 * Land Lease Costs Screen — every business rule as a pure function.
 *
 * Canvas sources, in the order they outrank each other:
 *   1. `Existing Solution/.../Powerapps code/LandLeaseCostScreenCode.txt` (6,132 lines) —
 *      cited below as `LL:<line>`. The behaviour source of truth.
 *   2. `_extracted/msapp/projectcosts/Src/Land Lease Costs Screen.pa.yaml` (6,299 lines) —
 *      cited as `PA:<line>`. This is the NEWER export of the same screen: a full diff of the
 *      two files shows exactly four substantive changes, all of them additions, all of them
 *      taken here. See `TECHNOLOGY GATING` below.
 *   3. `VSBCloud-Code-App-Skeleton/vsbcode/src/features/cost/land-lease/rules.ts` — a
 *      reference implementation, NOT authoritative. Every place it disagrees with the canvas
 *      is marked `// SKELETON DIVERGENCE:` and the canvas was followed.
 *
 * Option-set values, column names and the sub-account list were verified against the live
 * VSBCloud_Dev org with `pac org fetch`, not against any document.
 *
 * ── THE SHAPE THAT MAKES THIS SCREEN SURPRISING ─────────────────────────────────────────
 * Two tables, one right panel. `vsb_landleaseprojectcosts` is the CONTRACT HEADER — one row
 * per location/sub-account — and carries the description, the currency, `Secured`, the three
 * one-time payments, the all-WTG flag and every inflation setting. `vsb_landleaseperiods` is
 * the child, one row per `vsb_period` (Period 1..9), and carries the start date, the duration
 * and the five rates. ONE panel edits both, and it decides which table to write from whether
 * the selected period is Period 1 — `writesContractHeader`, `LL:5895`.
 *
 * ── TECHNOLOGY GATING ───────────────────────────────────────────────────────────────────
 * The `.txt` export has none. The `.pa.yaml` export adds it in three places, all PV-or-Wind:
 * the "Allocate to all WTGs" container (`PA:3861`), the WTG picker container (`PA:3904`), and
 * three arms of the Save gate (`PA:5947`, `PA:5997`, `PA:6027`). `PA:3904` also REPLACED the
 * `.txt`'s `Not(allWtgToggle.Checked)` visibility, so in the shipped app the picker stays
 * visible while "allocate to all" is on. Both readings are kept; the newer one is the default.
 *
 * ── WHAT IS NOT PORTED ──────────────────────────────────────────────────────────────────
 * The canvas' client-side joins (`Filter(Periods, 'Project Cost' in colLandLeaseProjectCosts)`,
 * `LL:6`) are a delegation workaround, not a rule; `buildContracts` takes rows that a
 * server-side `$filter` already scoped. The `Reset(...)` cascades on the hidden
 * `btn_LandLease_NewEditPeriod_ResetButton` (`LL:5992`) are control plumbing, expressed here
 * as `emptyLandLeaseForm` / `landLeaseFormFrom`.
 *
 * Pure: no React, no network, no globals. Structural input types are declared locally on
 * purpose — `@/features/costing/model`'s `CostPeriod` is being changed concurrently.
 */
import { inRange, isDecimal, parseNumber, round } from "@/domain/numeric";

/* ═════════════════════════════════════════════════════════════════ option sets ══ */

/**
 * `vsb_landleaseperiods.vsb_period` — `'Land Lease Period'`. NINE values.
 * Verified against the org: `Period 1..9` = 952850000..952850008.
 */
export const LAND_LEASE_PERIOD = {
  period1: 952850000, period2: 952850001, period3: 952850002,
  period4: 952850003, period5: 952850004, period6: 952850005,
  period7: 952850006, period8: 952850007, period9: 952850008,
} as const;

/**
 * `vsb_opexlandleasestandardassumptionses.vsb_period` — `'Opex & Land Lease Period'`.
 * TEN values; `Period 10` = 952850009 has no counterpart on the child table.
 */
export const OPEX_LAND_LEASE_PERIOD = {
  period1: 952850000, period2: 952850001, period3: 952850002,
  period4: 952850003, period5: 952850004, period6: 952850005,
  period7: 952850006, period8: 952850007, period9: 952850008,
  period10: 952850009,
} as const;

/**
 * `vsb_landleaseperiods.vsb_aggregation` — `'Land Lease Aggregation'`.
 * Verified identical to `'Opex Aggregation'` on the assumptions table, which is why
 * `mapAggregation` is the identity and not a table.
 */
export const LAND_LEASE_AGGREGATION = { sum: 952850000, max: 952850001, min: 952850002 } as const;

/** Labels as Dataverse returns them, for the grid's `Aggregation` cell (`LL:1099`). */
export const AGGREGATION_LABELS: Record<number, string> = {
  [LAND_LEASE_AGGREGATION.sum]: "SUM",
  [LAND_LEASE_AGGREGATION.max]: "MAX",
  [LAND_LEASE_AGGREGATION.min]: "MIN",
};

/**
 * `vsb_landleaseprojectcosts.vsb_secured` — `'Land Lease Secured'`.
 *
 * A CHOICE, and an unusual one: **Yes is the LOW value**. Verified against the org
 * (`Yes 952850000`, `No 952850001`), which is the reverse of the intuitive ordering and the
 * reason `securedValue` exists rather than a bare boolean cast.
 */
export const LAND_LEASE_SECURED = { yes: 952850000, no: 952850001 } as const;

/** The labels the grid's `Secured` column prints — `LL:1246` renders the choice itself. */
export const SECURED_LABELS: Record<number, string> = {
  [LAND_LEASE_SECURED.yes]: "Yes",
  [LAND_LEASE_SECURED.no]: "No",
};

/**
 * `vsb_opexlandleasestandardassumptionses.vsb_typeofcontract` — `'Contract Types'`.
 * The Land Lease import filters on `Landlease` (`LL:301`). Values verified against the org;
 * note `BoP` is in the 128,470,00x band, not the 952,850,00x one.
 */
export const TYPE_OF_CONTRACT = {
  landlease: 952850000, opexOM: 952850001, opexOther: 952850002,
  devexCapex: 952850003, bop: 128470001,
} as const;

/** `vsb_technology` — verified against the org. `PA:3863` gates on PV or Wind. */
export const TECHNOLOGY = {
  wind: 952850000, pv: 952850001, hybrid: 952850002, bess: 952850003,
  hydrogen: 952850004, hydro: 952850005, substation: 952850006,
} as const;

/**
 * `vsb_landleaseprojectcosts` booleans. Verified as Two Options (0/1) on the org, NOT
 * 952,850,00x choices: `vsb_allwtgallocated`, `vsb_isstandardcontract`,
 * `vsb_isstartdatestandardassumption`, `vsb_useinflationprofile`,
 * `vsb_usecountryinflationprofile`. The canvas writes them as `'…'.Yes` / `'…'.No`, which is
 * the Two-Option label form for the same 1 / 0.
 */
export const LAND_LEASE_BOOLEAN = { yes: true, no: false } as const;

/* ════════════════════════════════════════════════════════════════════ columns ══ */

/** `vsb_landleaseprojectcosts` — verified column-by-column against the org. */
export const LEASE_COST_COL = {
  id: "vsb_landleaseprojectcostid",
  name: "vsb_name",
  description: "vsb_description",
  landOwner: "vsb_landowner",
  secured: "vsb_secured",
  allWtgAllocated: "vsb_allwtgallocated",
  isStandardContract: "vsb_isstandardcontract",
  isStartDateStandardAssumption: "vsb_isstartdatestandardassumption",
  amount1: "vsb_amountonetimepayment",
  amount2: "vsb_amountonetimepayment2",
  amount3: "vsb_amountonetimepayment3",
  dueDate1: "vsb_duedateonetimepayment",
  dueDate2: "vsb_duedateonetimepayment2",
  dueDate3: "vsb_duedateonetimepayment3",
  useInflationProfile: "vsb_useinflationprofile",
  useCountryInflationProfile: "vsb_usecountryinflationprofile",
  inflationProfile: "vsb_inflationprofile",
  inflationCountryArea: "vsb_inflationcountryarea",
  inflationStartYear: "vsb_inflationstartyear",
} as const;

/** `vsb_landleaseperiods` — verified column-by-column against the org. */
export const LEASE_PERIOD_COL = {
  id: "vsb_landleaseperiodid",
  name: "vsb_name",
  period: "vsb_period",
  startDate: "vsb_startdate",
  fixedCosts: "vsb_fixedcosts",
  percentOfRevenues: "vsb_ofrevenues",
  eurPerMwh: "vsb_eurmwh",
  eurPerMw: "vsb_eurmw",
  eurPerWtg: "vsb_eurwtg",
  aggregation: "vsb_aggregation",
  distributionFrequency: "vsb_distributionfrequency",
  durationYears: "vsb_landleasedurationyears",
  durationMonths: "vsb_landleasedurationmonths",
} as const;

/**
 * `vsb_landleaseallocationwtgs` — verified against the org. `cost` and `generator` are the
 * READ forms (`_vsb_x_value`); the WRITE forms are in `LEASE_BIND` and putting a read form in
 * a create payload is its own defect (CONVENTIONS rule 6).
 */
export const LEASE_ALLOC_COL = {
  id: "vsb_landleaseallocationwtgid",
  name: "vsb_name",
  cost: "_vsb_projectcost_value",
  generator: "_vsb_generatorinproject_value",
} as const;

/**
 * Navigation properties for the WRITE form of each lookup, plus the entity set each binds to.
 *
 * The write form is `"<NavProperty>@odata.bind": "/<entityset>(<guid>)"`. `_vsb_x_value` is
 * the READ form and putting it in a payload is its own defect — Dataverse ignores it and the
 * payload reads as if the lookup had been set. Every name here is already proven by
 * `src/data/periodWrites.ts`, which writes these same three tables today.
 */
export const LEASE_BIND = {
  project: { nav: "vsb_Project", entitySet: "vsb_projects" },
  subaccount: { nav: "vsb_Subaccount", entitySet: "vsb_landleasesubaccounts" },
  currency: { nav: "vsb_Currency", entitySet: "transactioncurrencies" },
  projectCost: { nav: "vsb_ProjectCost", entitySet: "vsb_landleaseprojectcosts" },
  generatorInProject: { nav: "vsb_GeneratorInProject", entitySet: "vsb_generatorinprojects" },
  /**
   * `docs/01-BUGS-FOUND.md` S-5: `vsb_landleaseallocationwtgs` is one of two Cost-screen
   * creates the skeleton gets wrong by omitting this. The canvas binds it on every one of the
   * three tables (`LL:5895` twice, `LL:388` three times); so does every payload below.
   */
  owningBusinessUnit: { nav: "owningbusinessunit", entitySet: "businessunits" },
} as const;

export const LEASE_ENTITY_SET = {
  cost: "vsb_landleaseprojectcosts",
  period: "vsb_landleaseperiods",
  allocation: "vsb_landleaseallocationwtgs",
} as const;

/* ═══════════════════════════════════════════════════════════════════════ types ══ */

/** `Land Lease Subaccounts` — nine rows on the org, `Locations` first at `vsb_order` 1. */
export interface LeaseSubaccountRow {
  id: string;
  name: string;
  order: number;
}

/** `Sort(AddColumns('Land Lease Subaccounts', IsFolded, true), Order, …)` — `LL:6`. */
export interface LeaseSubaccountCard extends LeaseSubaccountRow {
  isFolded: boolean;
}

export interface LeaseCostRow {
  id: string;
  name: string;
  description: string;
  subaccountId: string | null;
  landOwner: string | null;
  currencyId: string | null;
  currencyName: string | null;
  /** `'Land Lease Secured'` — a CHOICE, see `LAND_LEASE_SECURED`. */
  secured: number | null;
  allWtgAllocated: boolean;
  isStandardContract: boolean;
  isStartDateStandardAssumption: boolean;
  amountOneTimePayment: number | null;
  amountOneTimePayment2: number | null;
  amountOneTimePayment3: number | null;
  /** Free text in `MM/YYYY`. Verified on the org: live values read `"12/2025"`. */
  dueDateOneTimePayment: string | null;
  dueDateOneTimePayment2: string | null;
  dueDateOneTimePayment3: string | null;
  useInflationProfile: boolean;
  useCountryInflationProfile: boolean;
  inflationProfile: number | null;
  inflationCountryArea: string | null;
  inflationStartYear: number | null;
  /** `Sort(…, 'Created On', SortOrder.Ascending)` in the card's gallery — `LL:927`. */
  createdOn: string | null;
}

export interface LeasePeriodRow {
  id: string;
  name: string;
  projectCostId: string | null;
  /** `'Land Lease Period'` — see `LAND_LEASE_PERIOD`. */
  period: number | null;
  /** ISO `yyyy-mm-dd`. */
  startDate: string | null;
  durationYears: number | null;
  durationMonths: number | null;
  fixedCosts: number | null;
  percentOfRevenues: number | null;
  eurPerMwh: number | null;
  eurPerMw: number | null;
  eurPerWtg: number | null;
  aggregation: number | null;
  distributionFrequency: number | null;
}

export interface LeaseAllocationRow {
  id: string;
  projectCostId: string | null;
  generatorInProjectId: string | null;
}

/** `colGeneratorsInProject` — `LL:6`. */
export interface GeneratorOption {
  id: string;
  /** `$"{Name} - {Status}"` for WTGs; the PV module type's `Label` for PV. */
  label: string;
  /** `Value(Last(Split(Name,"_")).Value)`; blank (0) for the PV rows — see `generatorOptions`. */
  order: number;
  name: string;
  kind: "wtg" | "pv";
}

/** `OPEX & Land Lease Standard Assumptions`, filtered to `'Contract Types'.Landlease`. */
export interface LeaseAssumptionRow {
  id: string;
  subaccountId: string | null;
  subaccountName: string;
  /** The assumption's `Name`, used in the cost `Name`; distinct from `description`. */
  name: string;
  description: string;
  /** `'Opex & Land Lease Period'` — TEN values. */
  period: number;
  durationYears: number | null;
  durationMonths: number | null;
  aggregation: number | null;
  currencyId: string | null;
  secured: boolean;
  allWtgAllocated: boolean;
  fixCosts: number | null;
  percentOfRevenues: number | null;
  eurPerMwh: number | null;
  eurPerMw: number | null;
  eurPerWtg: number | null;
  amountOneTimePayment: number | null;
  amountOneTimePayment2: number | null;
  amountOneTimePayment3: number | null;
  dueDateOneTimePayment: string | null;
  dueDateOneTimePayment2: string | null;
  dueDateOneTimePayment3: string | null;
  distributionFrequency: number | null;
  useInflationProfile: boolean;
  useCountryInflationProfile: boolean;
  inflationProfile: number | null;
  inflationCountryArea: string | null;
}

/** A header and its periods, ordered by period number. */
export interface LeaseContract {
  cost: LeaseCostRow;
  periods: LeasePeriodRow[];
}

/** Everything the rules need to know about the selected project. */
export interface LeaseProjectContext {
  projectId: string;
  projectName: string;
  /** `gblSelectedProject.'Besitzer (Unternehmenseinheit)'`. */
  owningBusinessUnitId: string | null;
  countryId: string | null;
  countryName: string | null;
  /** `gblRecordSelectedProjectCountry.'ISO Currency Code'`, `LL:606`. */
  isoCurrencyCode: string | null;
  /** `gblSelectedProject.Technology` — see `TECHNOLOGY`. */
  technology: number | null;
  /** `gblSelectedProject.'Operations start date (COD)'`, ISO `yyyy-mm-dd`. */
  codDate: string | null;
  /** `gblAreaWithRegion`, e.g. `"Italy_Nord"`. Only meaningful for Italy. */
  areaWithRegion: string | null;
}

/* ════════════════════════════════════════════════════════════════════ strings ══ */

/**
 * Every user-visible string, transcribed from the canvas control named in the comment.
 * Not paraphrased, not improved — including `"two decimal place"` (singular) and the double
 * space in `deletePeriodBody`, both of which are the live app's own wording.
 */
export const LEASE_MSG = {
  /** `lbl_LandLease_RightPanel_NewEditCost_BodyContent_Description_ErrorMessage_1.Text` (LL:2161). */
  descriptionStandardReserved:
    'The term "Standard" is applicable only for system-prefilled contracts.',
  /** `lbl_LandLease_RightPanel_NewEditCost_BodyContent_StartDate_ErrorMessage_1.Text` (LL:2321). */
  startDateBlank: "Value cannot be blank",
  /** `lbl_…_FixedCosts_ErrorMessage_1.Text`, and the same words on EUR/MWh, EUR/MW, EUR/WTG (LL:2944, LL:3204, LL:3336, LL:3467). */
  twoDecimal: "Value must be a numeric with two decimal place.",
  /**
   * `lbl_…_PercentOfRevenues_ErrorMessage_1.Text` (LL:3071 block).
   * SOURCE DEFECT LL-D10: this one field words the identical check differently from the other
   * four. Reproduced, not harmonised.
   */
  percentTwoDecimal: "Enter a number with no more than two decimal places.",
  /** `lbl_…_Amount_ErrorMessage_1.Text` and its 2/3 twins (LL:4958, LL:5314, LL:5672). */
  amountNotANumber: "Value must be a number",
  /** `lbl_…_InflationStartYear_ErrorMessage_1.Text` (LL:4274). */
  inflationStartYearFormat: "Year value must be in format YYYY.",
  /** `lbl_…_InflationProfile_ErrorMessage_1.Text`, first arm (LL:4561). Note: no full stop. */
  inflationProfileOneDecimal: "Value must be a numeric with 1 decimal place",
  /** `lbl_…_InflationProfile_ErrorMessage_1.Text`, third arm (LL:4573). */
  inflationProfileNotANumber: "Value must be a number with 1 decimal place",
  /** `lbl_…_InflationProfile_ErrorMessage_1.Text`, second arm (LL:4571). */
  inflationProfileRange: "Please select a value between 0 and 100.",
  /** `lbl_…_DueDate_ErrorMessage_1.Text` and its 2/3 twins (LL:4814). */
  dueDateFormat: "Due Date must be in format MM/YYYY.",
  /** `lbl_LandLease_RightPanel_NewEditPeriod_BodyButtons_Hint_1.Text` (LL:5960). */
  atLeastOneFigure: "Please fill in at least one commercial figure",
  /** `htm_LandLease_WarningOnSaveWithCost.HtmlText` (LL:5852) — HTML, `<b>` and all. */
  additionalPeriodsWarningHtml:
    "<b>Warning:</b> Saving is not possible, because additional periods exist, Please delete them first.",
  /** `htm_LandLease_WarningOnSaveWithCost.HtmlText` with the markup stripped, for plain renderers. */
  additionalPeriodsWarning:
    "Warning: Saving is not possible, because additional periods exist, Please delete them first.",
  /** `cmp_LandLease_PopUpConfirmation_DeletePeriod.Title` (LL:6054). */
  deletePeriodTitle: "Delete Period?",
  /** `cmp_LandLease_PopUpConfirmation_DeleteLandLeaseCost.Title` (LL:6114). */
  deleteContractTitle: "Delete Land Lease?",
  /** `cmp_…_DeletePeriod.TextConfirmButton` / `.TextCancelButton` (LL:6052). */
  deleteConfirm: "Delete",
  deleteCancel: "Cancel",
  /** `pcf_…_BodyButtons_Save_1.Text` / `Cancel_1.Text` (LL:5896, LL:5929). */
  save: "Save",
  cancel: "Cancel",
  /** `pcf_…_SubaccountsCommandBar_1.OnSelect`, the standard-import spinner (LL:388). */
  loadingStandardContract: "Please wait, loading Standard Assumption Contract...",
  /** Same control, the save spinner (LL:5895). */
  savingContract: "Saving Land Lease Contract...",
  /** `cmp_…_DeletePeriod.OnConfirm` (LL:6036). */
  deletingPeriod: "Deleting Land Lease Period...",
  /** `cmp_…_DeleteLandLeaseCost.OnConfirm` (LL:6071). */
  deletingContract: "Deleting Land Lease cost...",
  /** `ico_ResetStartDay_NewEditCost_LandLease_1.Tooltip` (LL:2516). */
  resetStartDateTooltip: "Reset to current project COD date.",
  /** `btn_OneTimePayment2_NewEditCost_BodyContent_1.Text`, both arms (LL:5119, LL:5475). */
  addOneTimePayment: "Add One-Time payment",
  deleteOneTimePayment: "Delete One-Time payment",
} as const;

/**
 * The two `Notify(...)` strings on the save path (`LL:5895`). Both interpolate the Power Fx
 * `FirstError` record, so they are functions, not constants.
 *
 * SKELETON DIVERGENCE: the skeleton's `LEASE_MSG.saveFailed` ("…Your changes are still in the
 * panel — try again…") has no canvas equivalent at all; it was invented. The canvas wording
 * below is used instead.
 */
export const leaseSaveError = {
  contract: (source: string, message: string, httpResponse = ""): string =>
    `Error: Land Lease Contract could not be saved correctly. Internal error: originated on ${
      source}. Message: ${message}${httpResponse}`,
  period: (source: string, message: string, httpResponse = ""): string =>
    `Error: Land Lease Period could not be saved correctly. Internal error: originated on ${
      source}. Message: ${message}${httpResponse}`,
} as const;

/** Panel field labels, each from the control named. */
export const LEASE_LABELS = {
  /** `lbl_LandLease_RightPanel_NewEditCost_BodyContentDescription_1.Text` (LL:2233). */
  description: "Description",
  /** `lbl_…_StartDate_1.Text` (LL:2439). */
  startDate: "Start Date",
  /** `lbl_…_DurationYears_1.Text` (LL:2684) — one label over both dropdowns. */
  duration: "Duration",
  /** `lbl_…_Currency_1.Text` (LL:2853). */
  currency: "Currency",
  /** `lbl_…_Aggregation_1.Text` (LL:3614). */
  aggregation: "Aggregation",
  /** `lbl_…_DistributionFrequency_1.Text` (LL:3723). */
  distributionFrequency: "Distribution Frequency",
  /** `tgl_…_BodyContent_Secured.Label` (LL:3839). */
  secured: "Secured",
  /** `tgl_…_BodyContent_AllocationToAllWTGs.Label` (LL:3864). */
  allocateToAllWtgs: "Allocate to all WTGs",
  /** `lbl_…_AllocationWtg_1.Text` (LL:3990). */
  allocation: "Allocation",
  /** `tgl_…_InflationProfile_1.Label` (LL:4185). */
  inflationProfile: "Inflation Profile",
  /** `tgl_…_CountryInflationProfile_1.Label` (LL:4147). */
  countryInflationProfile: "Country Inflation Profile",
  /** `lbl_…_InflationStartYear_1.Text` (LL:4341); the input's `Placeholder` is `"YYYY"`. */
  inflationStartYear: "Inflation Start Year",
  inflationStartYearPlaceholder: "YYYY",
  /** `lbl_…_AreaInflationProfile_1.Text` (LL:4468). */
  area: "Area",
  /** `lbl_…_InflationProfile_1.Text`, false arm (LL:4649). */
  customInflationProfile: "Custom Inflation Profile [%]",
  /** `tgl_…_BodyContent_OneTimePayment.Label` (LL:4746). */
  oneTimePayment: "One-Time Payment",
  /** `lbl_…_DueDate_1.Text` / `DueDate2_1` / `DueDate3_1` (LL:4867, LL:5223, LL:5580). */
  oneTimePaymentDate: (n: 1 | 2 | 3): string => `One-Time Payment ${n} Date`,
  /** `txt_…_DueDate_1.Placeholder` (LL:4836). */
  dueDatePlaceholder: "MM/YYYY",
} as const;

/**
 * The money labels interpolate the project country's ISO currency code, falling back to
 * `"EUR"` (`LL:3015`, `LL:5032`) or to `"Cur."` in the grid headers (`LL:710`).
 */
export const leaseCurrencyLabel = {
  /** `lbl_…_FixedCosts_1.Text` (LL:3015). */
  fixCosts: (iso: string | null | undefined): string => `Fix Costs p.a. [${iso || "EUR"}]`,
  /** `lbl_…_Amount_1.Text` and its 2/3 twins (LL:5032, LL:5388, LL:5746). */
  oneTimePaymentAmount: (n: 1 | 2 | 3, iso: string | null | undefined): string =>
    `One-Time Payment ${n} [${iso || "EUR"}]`,
} as const;

/** The command-bar captions — `pcf_con_…_SubaccountsCommandBar_1.Items` (LL:214). */
export const LEASE_COMMAND_LABELS = {
  newLandLeaseContractKey: "Add Contract Type",
  newLandLeasePeriodKey: "Add Period",
  AddLandLeaseStandardContractKey: "Add Standard Contract",
  EditLandLeasePeriodKey: "Edit",
  deleteLandLeasePeriodKey: "Delete",
} as const;

/* ═══════════════════════════════════════════════════════ grid columns / layout ══ */

export interface LeaseColumn {
  key: string;
  label: string;
  /** The canvas `Width`, in the canvas' own pixels. Order is left-to-right by `X` chain. */
  width: number;
  align: "left" | "right";
}

/**
 * The grid header, left to right, resolved from the `X: =<previous>.X+<previous>.Width`
 * chain in `con_LandLease_Content_Subaccounts_CardBody_CostsTableHeader_1` (LL:393-902).
 *
 * APP DIVERGENCE: `BASE_COLUMNS` in `./rules.ts` gives every mode a `Threshold for EUR/MWh
 * p.a.` and a `Distribution Frequency` column. The Land Lease canvas grid has NEITHER, and
 * orders `Secured` / `Allocation` / `OTP` after `Aggregation` rather than at the end of a
 * shared base. This is the Land Lease truth; reported for the shared-file owner.
 */
export const LAND_LEASE_COLUMNS: readonly LeaseColumn[] = [
  { key: "description", label: "Description", width: 160, align: "left" },
  { key: "startDate", label: "Start Date", width: 90, align: "right" },
  { key: "durationYears", label: "Duration", width: 60, align: "right" },
  { key: "durationMonths", label: "", width: 60, align: "right" },
  { key: "endDate", label: "End Date", width: 90, align: "right" },
  { key: "currency", label: "Currency", width: 70, align: "left" },
  { key: "inflationProfile", label: "Inflation Profile", width: 140, align: "right" },
  { key: "fixCosts", label: "Fix Costs p.a. [EUR]", width: 140, align: "right" },
  { key: "percentOfRevenues", label: "Share of Revenues [%]", width: 170, align: "right" },
  { key: "eurPerMwh", label: "EUR/MWh p.a.", width: 110, align: "right" },
  { key: "eurPerMw", label: "EUR/MW p.a.", width: 110, align: "right" },
  { key: "eurPerWtg", label: "EUR/WTG p.a.", width: 110, align: "right" },
  { key: "aggregation", label: "Aggregation", width: 100, align: "left" },
  { key: "secured", label: "Secured", width: 90, align: "left" },
  { key: "allocation", label: "Allocation", width: 100, align: "left" },
  { key: "otp", label: "OTP", width: 90, align: "left" },
];

/**
 * The four money headers are currency-code interpolated. `Fix Costs p.a.` falls back to
 * `"EUR"` (LL:606); the three rate columns fall back to `"Cur."` (LL:710, LL:742, LL:774) —
 * a different fallback in the same header row, reproduced rather than harmonised.
 */
export function landLeaseColumns(iso: string | null | undefined): LeaseColumn[] {
  const money = iso || "EUR";
  const rate = iso || "Cur.";
  return LAND_LEASE_COLUMNS.map((c) => {
    if (c.key === "fixCosts") return { ...c, label: `Fix Costs p.a. [${money}]` };
    if (c.key === "eurPerMwh") return { ...c, label: `${rate}/MWh p.a.` };
    if (c.key === "eurPerMw") return { ...c, label: `${rate}/MW p.a.` };
    if (c.key === "eurPerWtg") return { ...c, label: `${rate}/WTG p.a.` };
    return { ...c };
  });
}

/* ═════════════════════════════════════════════════════════════ dates & numbers ══ */

/** ISO `yyyy-mm-dd` → a local-noon `Date`, so a DST shift cannot move the calendar day. */
function toDate(iso: string | Date | null | undefined): Date | null {
  if (iso === null || iso === undefined || iso === "") return null;
  const d = iso instanceof Date ? new Date(iso.getTime()) : new Date(`${iso.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Power Fx `DateAdd(d, n, TimeUnit.Months)` — clamped to the end of the target month, matching
 * `periodEnd` in `@/features/costing/model` so both halves of the app agree.
 */
export function addMonths(iso: string | Date, months: number): string {
  const d = toDate(iso);
  if (!d) return "";
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toIso(d);
}

export function addDays(iso: string | Date, days: number): string {
  const d = toDate(iso);
  if (!d) return "";
  d.setDate(d.getDate() + days);
  return toIso(d);
}

/**
 * The grid's `End Date` — `DateAdd(DateAdd(start, years*12+months, Months), -1, Days)`
 * (`lbl_OpexCosts_Content_Subaccounts_CardBody_CostsTableRow_EndDate_2.Text`, LL:1468).
 *
 * Blank duration parts multiply to blank in Power Fx, which coerces to 0 in arithmetic; a
 * blank START date makes the whole expression blank, so the cell is empty.
 */
export function leasePeriodEnd(
  p: Pick<LeasePeriodRow, "startDate" | "durationYears" | "durationMonths">,
): string {
  if (!p.startDate) return "";
  const months = (p.durationYears ?? 0) * 12 + (p.durationMonths ?? 0);
  const shifted = addMonths(p.startDate, months);
  return shifted === "" ? "" : addDays(shifted, -1);
}

/** `Text(date, "dd.mm.yy")` — the grid's date format (LL:1479, LL:1603). Two-digit year. */
export function formatLeaseDate(iso: string | null | undefined): string {
  const d = toDate(iso);
  if (!d) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${p(d.getFullYear() % 100)}`;
}

/**
 * Power Fx `Text(number, "<grouped>")`. `Blank()` formats to `""`, which is why every numeric
 * cell in this grid is empty rather than `0` when the column is unset — but a stored `0` DOES
 * print as `"0"`, unlike `formatNumber` in `./rules.ts`, which blanks zero as well.
 */
function formatGrouped(
  value: number | null | undefined,
  minFrac: number,
  maxFrac: number,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: minFrac, maximumFractionDigits: maxFrac,
  }).format(value);
}

/** `Text(ThisItem.'Fixed Costs', "###,###,###,###")` — LL:1332. No decimals. */
export const formatFixCosts = (v: number | null | undefined): string => formatGrouped(v, 0, 0);
/** `Text(ThisItem.'EUR/MW', "###,###,###,###")` — LL:1141 block. */
export const formatEurPerMw = (v: number | null | undefined): string => formatGrouped(v, 0, 0);
/** `Text(ThisItem.'EUR/WTG', "###,###,###,###")` — LL:1136. */
export const formatEurPerWtg = (v: number | null | undefined): string => formatGrouped(v, 0, 0);
/** `Text(ThisItem.'EUR/MWh', "###,###,###,###.0#")` — LL:1210. One to two decimals. */
export const formatEurPerMwh = (v: number | null | undefined): string => formatGrouped(v, 1, 2);

/**
 * `Text(ThisItem.'% of Revenues', "###,###,###,##0.00 %")` — LL:1295.
 *
 * SOURCE AMBIGUITY LL-A1: `%` is a scaling placeholder in .NET custom numeric formats (it
 * multiplies by 100) and Power Fx's `Text` is built on it, but the Power Fx `Text` reference
 * documents only `0 # . ,` and says every other character prints as typed. The two readings
 * give `"2,000.00 %"` and `"20.00 %"` for the live value `vsb_ofrevenues = 20.00`.
 * The NON-scaling reading is implemented because the column header is
 * `Share of Revenues [%]` and the panel writes and reads the same field with no `%` in its
 * format (LL:3105 block) — i.e. the stored number is already a percentage. Flagged for
 * sign-off rather than asserted: `formatPercentOfRevenuesScaled` keeps the other reading
 * reachable so the decision is reversible.
 */
export const formatPercentOfRevenues = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v) ? "" : `${formatGrouped(v, 2, 2)} %`;

/** The scaling reading of LL:1295. See `formatPercentOfRevenues`. Parity only. */
export const formatPercentOfRevenuesScaled = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v) ? "" : `${formatGrouped(v * 100, 2, 2)} %`;

/** `Text(profile, "###,###,###.0 %")` — LL:1388. Same ambiguity, same decision. */
export const formatInflationPercent = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v) ? "" : `${formatGrouped(v, 1, 1)} %`;

/* ══════════════════════════════════════════════════════ sub-accounts and model ══ */

/**
 * Rule 1 — `ClearCollect(colLandLeaseSubaccounts, Sort(AddColumns('Land Lease Subaccounts',
 * IsFolded, true), Order, SortOrder.Ascending))` (LL:6). Every card starts COLLAPSED.
 *
 * The nine live rows, in `vsb_order`: Locations, Distance and Rotor Overfly Areas, Permanent
 * Access Routes & Crane Pads, Cabling and Overhead Lines, Substation / Transfer Station,
 * Compansation and Replacement Measures, Temporary Areas, Leaseholders, Other.
 *
 * APP DIVERGENCE: `MODES.land` in `./rules.ts` models `Locations` as a synthetic
 * `leadingGroup` whose `Add Period` is disabled. On the org it is an ordinary sub-account row
 * (`vsb_order = 1`) and the canvas gives it exactly the same command bar as the other eight.
 */
export function orderedSubaccounts(rows: readonly LeaseSubaccountRow[]): LeaseSubaccountCard[] {
  return [...rows]
    .sort((a, b) => a.order - b.order)
    .map((r) => ({ ...r, isFolded: true }));
}

/** `ico_…_Up_2.OnSelect` / `Down_2.OnSelect` — `UpdateIf(col, id = selected, {IsFolded: Not(…)})` (LL:1872). */
export function toggleFold(
  cards: readonly LeaseSubaccountCard[],
  subaccountId: string,
): LeaseSubaccountCard[] {
  return cards.map((c) => (c.id === subaccountId ? { ...c, isFolded: !c.isFolded } : c));
}

const PERIOD_VALUES: readonly number[] = [
  LAND_LEASE_PERIOD.period1, LAND_LEASE_PERIOD.period2, LAND_LEASE_PERIOD.period3,
  LAND_LEASE_PERIOD.period4, LAND_LEASE_PERIOD.period5, LAND_LEASE_PERIOD.period6,
  LAND_LEASE_PERIOD.period7, LAND_LEASE_PERIOD.period8, LAND_LEASE_PERIOD.period9,
];

const OPEX_PERIOD_VALUES: readonly number[] = [
  OPEX_LAND_LEASE_PERIOD.period1, OPEX_LAND_LEASE_PERIOD.period2, OPEX_LAND_LEASE_PERIOD.period3,
  OPEX_LAND_LEASE_PERIOD.period4, OPEX_LAND_LEASE_PERIOD.period5, OPEX_LAND_LEASE_PERIOD.period6,
  OPEX_LAND_LEASE_PERIOD.period7, OPEX_LAND_LEASE_PERIOD.period8, OPEX_LAND_LEASE_PERIOD.period9,
  OPEX_LAND_LEASE_PERIOD.period10,
];

/** `'Land Lease Period'.'Period n'` → n (1..9); 0 when the value is not a period. */
export function periodNumber(period: number | null | undefined): number {
  if (period === null || period === undefined) return 0;
  const i = PERIOD_VALUES.indexOf(period);
  return i < 0 ? 0 : i + 1;
}

export function periodValue(n: number): number | null {
  return n >= 1 && n <= 9 ? PERIOD_VALUES[n - 1] ?? null : null;
}

/** The label Dataverse prints for the choice — used in `deleteDialog`'s body (LL:6028). */
export function periodLabel(period: number | null | undefined): string {
  const n = periodNumber(period);
  return n === 0 ? "" : `Period ${n}`;
}

export const isPeriodOne = (period: number | null | undefined): boolean =>
  periodNumber(period) === 1;

/**
 * Rule 7 — the next period number.
 *
 * SOURCE DEFECT LL-D1: the canvas `Switch` on the save path maps `Period 1 → Period 2` …
 * `Period 8 → Period 9` and then gives `'Land Lease Period'.'Period 1'` as its DEFAULT arm
 * (`pcf_LandLease_RightPanel_NewEditPeriod_BodyButtons_Save_1.OnChange`, LL:5895; the same
 * shape appears again in the standard import at LL:388). Period 9 therefore falls through to
 * the default and a tenth period is silently written as a SECOND Period 1 in the same
 * contract, corrupting the chain — and nothing in the `Add Period` gate (LL:242) caps it.
 *
 * Corrected here: `nextPeriod` returns `null` at Period 9 and `leaseCommands().addPeriod` is
 * false, so the tenth period cannot be created. `nextPeriodCanvasParity` keeps the wrap
 * reachable and `addPeriodCanvasParity` keeps the uncapped gate reachable, so the decision is
 * reversible.
 */
export function nextPeriod(current: number | null | undefined): number | null {
  const n = periodNumber(current);
  if (n === 0) return LAND_LEASE_PERIOD.period1;
  if (n >= 9) return null;
  return periodValue(n + 1);
}

/** Bug-for-bug twin of LL:5895's `Switch` default. Parity only. */
export function nextPeriodCanvasParity(current: number | null | undefined): number {
  const n = periodNumber(current);
  if (n === 0 || n >= 9) return LAND_LEASE_PERIOD.period1;
  return periodValue(n + 1) ?? LAND_LEASE_PERIOD.period1;
}

/** Contracts are `{cost, periods}`, the periods ordered by period NUMBER (LL:262). */
export function buildContracts(
  costs: readonly LeaseCostRow[],
  periods: readonly LeasePeriodRow[],
): LeaseContract[] {
  return costs.map((cost) => ({
    cost,
    periods: periods
      .filter((p) => p.projectCostId === cost.id)
      .sort((a, b) => periodNumber(a.period) - periodNumber(b.period)),
  }));
}

export function contractsForSubaccount(
  contracts: readonly LeaseContract[],
  subaccountId: string,
): LeaseContract[] {
  return contracts.filter((c) => c.cost.subaccountId === subaccountId);
}

export const firstPeriod = (c: LeaseContract): LeasePeriodRow | null => c.periods[0] ?? null;

/** `Last(Sort(Filter(colLandLeasePeriods, …), Period))` — the `Add Period` gate's notion (LL:262). */
export const lastPeriod = (c: LeaseContract): LeasePeriodRow | null =>
  c.periods.length === 0 ? null : c.periods[c.periods.length - 1] ?? null;

/**
 * `Last(Sort(Filter(colLandLeasePeriods, …), Name, SortOrder.Ascending))` — the DELETE gate's
 * notion (LL:370).
 *
 * SOURCE DEFECT LL-D4: two commands on the same bar disagree about which row is "the last
 * period". `Add Period` sorts by `Period`, `Delete` sorts by `Name`, so a contract whose
 * period names do not sort in period order offers Delete on a middle period and refuses it on
 * the real last one. Reproduced; both notions are exposed so the screen can cite which it
 * used.
 */
export function lastPeriodByName(c: LeaseContract): LeasePeriodRow | null {
  if (c.periods.length === 0) return null;
  const sorted = [...c.periods].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return sorted[sorted.length - 1] ?? null;
}

/**
 * Rule 19 — Period 1 must carry at least one of the five rates before a period can be added.
 * `Or(Not(IsBlank(first.'Fixed Costs')), … '% of Revenues', 'EUR/MW', 'EUR/MWh', 'EUR/WTG')`
 * (LL:277).
 */
export function firstPeriodHasRate(contract: LeaseContract): boolean {
  const p = firstPeriod(contract);
  if (!p) return false;
  return [p.fixedCosts, p.percentOfRevenues, p.eurPerMw, p.eurPerMwh, p.eurPerWtg]
    .some((v) => v !== null && v !== undefined);
}

/**
 * The card's row set — `gal_LandLease_Content_Subaccounts_CardBody_Costs_1.Items` (LL:919).
 *
 * The canvas takes the costs in the sub-account ordered by `Created On` ascending, then every
 * period belonging to any of them, then sorts `Start Date` ascending and `Name` ascending. In
 * Power Fx the OUTER `Sort` wins, so `Name` is the primary key and `Start Date` only breaks
 * ties between equal names.
 */
export function subaccountPeriodRows(
  contracts: readonly LeaseContract[],
  subaccountId: string,
): LeasePeriodRow[] {
  // The `'Created On'` sort applies to `varLandLeaseCostInSubaccount`, which the canvas uses
  // only as the right-hand side of an `in` membership test — so it cannot reach the output
  // order and is not reproduced. The two `Sort`s that can reach it are.
  return contractsForSubaccount(contracts, subaccountId)
    .flatMap((c) => c.periods)
    .sort((a, b) => {
      if (a.name !== b.name) return a.name < b.name ? -1 : 1;
      return (a.startDate ?? "").localeCompare(b.startDate ?? "");
    });
}

/* ═══════════════════════════════════════════════════════════════════ grid cells ══ */

/**
 * The `Secured` cell — `With({varLandLeaseCost: LookUp(colLandLeaseProjectCosts, …)},
 * varLandLeaseCost.Secured)` (LL:1246). It prints the HEADER's choice label, so every period
 * of a contract shows the same value, and it is blank when the choice is unset.
 *
 * APP DIVERGENCE: `toPeriodRow` in `./rules.ts` renders `p.standard ? "Yes" : ""`, which is a
 * different field entirely — it reports whether the row is a standard contract, not whether
 * the lease is secured. Reported for the shared-file owner.
 */
export function securedCell(cost: Pick<LeaseCostRow, "secured"> | null | undefined): string {
  const v = cost?.secured;
  if (v === null || v === undefined) return "";
  return SECURED_LABELS[v] ?? "";
}

/**
 * The `Allocation` cell — `If(varLandLeaseCost.AllWTGAllocated, "Yes", "No")` (LL:1058).
 * Never blank: a missing header is `Blank()`, which is falsy in Power Fx, so an unjoined row
 * still reads `"No"`. VERIFIED against the canvas; `./rules.ts` already matches.
 */
export function allocationCell(
  cost: Pick<LeaseCostRow, "allWtgAllocated"> | null | undefined,
): string {
  return cost?.allWtgAllocated ? "Yes" : "No";
}

/**
 * The `OTP` cell — `If(Not(IsBlank(varLandLeaseCost.'Due Date One-Time Payment')) &&
 * Not(IsBlank(varLandLeaseCost.'Amount One-Time Payment')), "Yes", "No")` (LL:1010).
 *
 * VERIFIED: it keys off the FIRST payment only. Payments 2 and 3 are not consulted, so a
 * contract with only a second payment reads `"No"`. That is the canvas behaviour and it is
 * reproduced, not improved; `./rules.ts`'s `otp` cell already matches.
 */
export function otpCell(
  cost: Pick<LeaseCostRow, "amountOneTimePayment" | "dueDateOneTimePayment"> | null | undefined,
): string {
  const hasDate = !isBlankValue(cost?.dueDateOneTimePayment);
  const hasAmount = !isBlankValue(cost?.amountOneTimePayment);
  return hasDate && hasAmount ? "Yes" : "No";
}

/**
 * The `Inflation Profile` cell (LL:1369).
 *
 * `If(cost.'Use Country Inflation Profile', <country, Italy specially>, Text(cost.'Inflation
 * Profile', "###,###,###.0 %"))`.
 *
 * Note what it does NOT branch on: `'Use Inflation Profile'`. A contract with inflation turned
 * OFF but a stored profile still prints the percentage. Reproduced.
 *
 * APP DIVERGENCE: `inflationCell` in `./rules.ts` short-circuits to `""` when `inflation` is
 * false, and has no Italy branch.
 */
export function inflationProfileCell(
  cost: Pick<LeaseCostRow, "useCountryInflationProfile" | "inflationProfile"> | null | undefined,
  ctx: Pick<LeaseProjectContext, "countryName" | "areaWithRegion">,
): string {
  if (!cost) return "";
  if (cost.useCountryInflationProfile) {
    if (ctx.countryName === "Italy") {
      return `Italy - ${(ctx.areaWithRegion ?? "").replace(/Italy_/g, "")}`;
    }
    return ctx.countryName ?? "";
  }
  return formatInflationPercent(cost.inflationProfile);
}

/**
 * `$"{ThisItem.'Land Lease duration years'} years"`, guarded by `Not(IsBlank(...))` (LL:1558).
 *
 * The canvas NEVER singularises here — a one-year period reads `"1 years"`. The panel's
 * dropdown does singularise (LL:2635), so the same number renders differently in the two
 * places. Reproduced; `formatDurationYearsSingular` is the corrected twin.
 *
 * APP DIVERGENCE: `formatYears` / `formatMonths` in `./rules.ts` singularise in the grid.
 */
export const formatDurationYears = (years: number | null | undefined): string =>
  years === null || years === undefined ? "" : `${years} years`;

/** `$"{ThisItem.'Land Lease duration months'} months"` (LL:1518). Same always-plural rule. */
export const formatDurationMonths = (months: number | null | undefined): string =>
  months === null || months === undefined ? "" : `${months} months`;

export const formatDurationYearsSingular = (years: number | null | undefined): string =>
  years === null || years === undefined ? "" : `${years} ${years === 1 ? "year" : "years"}`;

export const formatDurationMonthsSingular = (months: number | null | undefined): string =>
  months === null || months === undefined ? "" : `${months} ${months === 1 ? "month" : "months"}`;

export interface LeaseGridRow {
  id: string;
  /** `Italic: =StartsWith(ThisItem.Name, "Standard")` and the themePrimary `Color` (LL:992). */
  standard: boolean;
  /** `FontWeight: =If(ThisItem.Period = 'Period 1', Bold, Normal)` (LL:1625). */
  bold: boolean;
  selected: boolean;
  cells: Record<string, string>;
}

/** `StartsWith(ThisItem.Name, "Standard")` — case SENSITIVE here (LL:992, LL:252). */
export const isStandardPeriodName = (name: string): boolean => name.startsWith("Standard");

/**
 * `StartsWith(Lower(name), "standard")` — the DELETE gate lower-cases first (LL:361), where
 * every other check does not. Reproduced as its own predicate so the difference is visible.
 */
export const isStandardPeriodNameLower = (name: string): boolean =>
  name.toLowerCase().startsWith("standard");

/** One rendered grid row, so the screen holds no formatting logic. */
export function toLeaseGridRow(args: {
  period: LeasePeriodRow;
  cost: LeaseCostRow | null;
  ctx: Pick<LeaseProjectContext, "countryName" | "areaWithRegion">;
  selectedPeriodId?: string | null;
}): LeaseGridRow {
  const { period: p, cost, ctx } = args;
  return {
    id: p.id,
    standard: isStandardPeriodName(p.name),
    bold: isPeriodOne(p.period),
    selected: args.selectedPeriodId === p.id,
    cells: {
      // `lbl_…_CostsTableRow_Description_2.Text` = `ThisItem.Name` — the PERIOD's name, not
      // the header's description (LL:1642).
      description: p.name,
      startDate: formatLeaseDate(p.startDate),
      durationYears: formatDurationYears(p.durationYears),
      durationMonths: formatDurationMonths(p.durationMonths),
      endDate: formatLeaseDate(leasePeriodEnd(p)),
      // `ThisItem.'Project Cost'.Currency.'Currency Name'` (LL:1430).
      currency: cost?.currencyName ?? "",
      inflationProfile: inflationProfileCell(cost, ctx),
      fixCosts: formatFixCosts(p.fixedCosts),
      percentOfRevenues: formatPercentOfRevenues(p.percentOfRevenues),
      eurPerMwh: formatEurPerMwh(p.eurPerMwh),
      eurPerMw: formatEurPerMw(p.eurPerMw),
      eurPerWtg: formatEurPerWtg(p.eurPerWtg),
      aggregation: p.aggregation === null || p.aggregation === undefined
        ? "" : AGGREGATION_LABELS[p.aggregation] ?? "",
      secured: securedCell(cost),
      allocation: allocationCell(cost),
      otp: otpCell(cost),
    },
  };
}

/* ═════════════════════════════════════════════════════════════════════ selection ══ */

export interface LeaseSelection {
  subaccountId: string | null;
  periodId: string | null;
  costId: string | null;
}

export const NO_LEASE_SELECTION: LeaseSelection = {
  subaccountId: null, periodId: null, costId: null,
};

/**
 * `btn_OpexCosts_…_CostsTableRow_TransparentButton_2.OnSelect` (LL:1744) — clicking the row
 * that is already selected DESELECTS it.
 *
 * SOURCE DEFECT LL-D5: the deselect arm clears `locSelectedLandLeaseSubaccount` and
 * `locSelectedLandLeasePeriod` but NOT `locSelectedLandLeaseCost`, so a stale header survives
 * the deselection and the next `Add Period` / `Edit` reads it. `toggleLeaseSelection` clears
 * all three; `toggleLeaseSelectionCanvasParity` keeps the stale cost reachable.
 */
export function toggleLeaseSelection(
  current: LeaseSelection,
  row: { periodId: string; costId: string | null; subaccountId: string },
): LeaseSelection {
  if (current.periodId === row.periodId) return { ...NO_LEASE_SELECTION };
  return { subaccountId: row.subaccountId, periodId: row.periodId, costId: row.costId };
}

/** Bug-for-bug twin of LL:1744. Parity only. */
export function toggleLeaseSelectionCanvasParity(
  current: LeaseSelection,
  row: { periodId: string; costId: string | null; subaccountId: string },
): LeaseSelection {
  if (current.periodId === row.periodId) {
    return { subaccountId: null, periodId: null, costId: current.costId };
  }
  return { subaccountId: row.subaccountId, periodId: row.periodId, costId: row.costId };
}

/* ═══════════════════════════════════════════════════ rule 2 · Period 1 owns it ══ */

/**
 * Rule 2 — PERIOD 1 OWNS THE CONTRACT HEADER.
 *
 * `If(IsBlank(locSelectedLandLeaseCost) || locSelectedLandLeasePeriod.Period = 'Land Lease
 * Period'.'Period 1', <patch 'Land Lease Project Costs' + reconcile the allocation>, …)` —
 * `pcf_…_BodyButtons_Save_1.OnChange`, LL:5895. The `Land Lease Periods` patch that follows is
 * unconditional.
 *
 * Editing Period 2+ therefore cannot change the description, the currency, `Secured`, the
 * one-time payments, the WTG allocation or any inflation setting. The panel makes that legible
 * rather than silent by disabling the whole header section — `headerEditable` below, which is
 * the same predicate and is what eleven separate `DisplayMode` formulas in the canvas evaluate
 * (LL:2196, 2331, 3833, 3858, 3921, 4141, 4179, 4289, 4605, 4696, 4740, 4829, 4995).
 */
export function writesContractHeader(
  selectedPeriod: Pick<LeasePeriodRow, "period"> | null | undefined,
  isNewContract: boolean,
): boolean {
  if (isNewContract) return true;
  return isPeriodOne(selectedPeriod?.period ?? null);
}

/**
 * The header `DisplayMode` gate, verbatim:
 * `If(locSelectedLandLeasePeriod.Period='Land Lease Period'.'Period 1' ||
 *     IsBlank(locSelectedLandLeaseCost), DisplayMode.Edit, DisplayMode.Disabled)`.
 *
 * Note the OR is on the COST being blank, not the period — so "Add Period" on an existing
 * contract (cost present, period blank) DISABLES the header fields, which is exactly the
 * intent: a new period may not rewrite its contract.
 */
export function headerEditable(
  selectedPeriod: Pick<LeasePeriodRow, "period"> | null | undefined,
  selectedCost: { id: string } | null | undefined,
): boolean {
  return isPeriodOne(selectedPeriod?.period ?? null) || !selectedCost;
}

/**
 * Rule 3 — the contract `Name`, `LL:5895`:
 * `gblSelectedProject.'Project Name' & "-" & subaccount.Name & "-" & <description box>`.
 *
 * The description is NOT trimmed, unlike the OPEX screen. Verified against live rows:
 * `"Project New Data -Location-Test 1002"` keeps the project name's trailing space.
 */
export const landLeaseCostName = (
  projectName: string,
  subaccountName: string,
  description: string,
): string => `${projectName}-${subaccountName}-${description}`;

/**
 * The panel title — `lbl_LandLease_RightPanel_NewEditPeriod_BodyHeader_1.Text` (LL:2026).
 *
 * Four states, and they are not the two you would guess: editing PERIOD 1 says
 * "Edit Contract", not "Edit Period", because Period 1 is the contract.
 */
export function leasePanelTitle(args: {
  selectedCost: { id: string } | null | undefined;
  selectedPeriod: Pick<LeasePeriodRow, "period"> | null | undefined;
  subaccountName: string;
}): string {
  const { selectedCost, selectedPeriod, subaccountName } = args;
  let head: string;
  if (!selectedCost && !selectedPeriod) head = "Add Contract";
  else if (!selectedPeriod) head = "Add Period";
  else if (!isPeriodOne(selectedPeriod.period)) head = "Edit Period";
  else head = "Edit Contract";
  return `${head} - ${subaccountName}`;
}

/**
 * Rule 8 — `locNewPeriodDesc`, the auto-numbered name for the period about to be added
 * (LL:388, the `"newLandLeasePeriodKey"` arm).
 *
 * `If(And(CountRows(Filter(colLandLeasePeriods, 'Land Lease Period' = parent.'Land Lease
 * Period' && Period = 'Period 1')) = 0, IsMatch(parent.Name, " - \d+", EndsWith)),
 *   Left(parent.Name, Find(" - " & Last(Split(parent.Name, " - ")).Value, parent.Name) - 1)
 *     & " - " & Value(Last(Split(parent.Name, " - ")).Value) + 1,
 *   parent.Name & " - 2")`
 *
 * The `CountRows(...) = 0` filter compares the PRIMARY KEY against the parent's own id, so it
 * counts 1 exactly when the parent IS Period 1 and 0 otherwise. The condition therefore reads
 * "the parent is not Period 1".
 *
 * SKELETON DIVERGENCE: the skeleton calls this flag `hasPeriod1Sibling` and inverts it — its
 * `nextPeriodName("Lease - 3", true)` returns `"Lease - 3 - 2"` for a contract that HAS a
 * Period 1, which every contract does. The canvas meaning is followed here.
 *
 * SOURCE DEFECT LL-D3: `Find` returns the FIRST occurrence, so a name whose earlier segment
 * repeats the trailing number truncates too far — `"A - 3 - 3"` becomes `"A - 4"`, losing
 * `" - 3"`. Reproduced.
 */
export function nextPeriodName(parentName: string, parentIsPeriodOne: boolean): string {
  const endsWithNumber = / - \d+$/.test(parentName);
  if (parentIsPeriodOne || !endsWithNumber) return `${parentName} - 2`;

  const segments = parentName.split(" - ");
  const tail = segments[segments.length - 1] ?? "";
  const cut = parentName.indexOf(` - ${tail}`);
  const head = cut < 0 ? parentName : parentName.slice(0, cut);
  return `${head} - ${Number(tail) + 1}`;
}

/* ══════════════════════════════════════════════════════════════════ start date ══ */

/**
 * `dte_LandLease_RightPanel_NewEditCost_BodyContent_StartDate_1.SelectedDate` (LL:2342).
 *
 * `Coalesce(
 *    If(IsBlank(cost) || locResetStartDate, locCODDate,
 *       Not(IsBlank(cost)) && Not(IsBlank(period)), Coalesce(locCODDate, period.'Start Date'),
 *       locRightPanelState = "New",
 *         Coalesce(locCODDate, DateAdd(parent.'Start Date', parent.years*12+parent.months, Months))),
 *    locCODDate)`
 *
 * `locCODDate` is the panel's working copy of the date the user has touched: the New-Contract
 * command seeds it with the project COD (LL:388), Add/Edit Period blank it, and the picker's
 * `OnChange` writes it back (LL:2334). So it is "the edited value, if any" and it wins
 * everywhere — which is why it appears in all four arms.
 */
export function resolveStartDate(args: {
  workingDate: string | null;
  selectedCost: { id: string } | null | undefined;
  selectedPeriod: Pick<LeasePeriodRow, "startDate"> | null | undefined;
  parentPeriod: Pick<LeasePeriodRow, "startDate" | "durationYears" | "durationMonths"> | null | undefined;
  panelState: "New" | "Edit";
  resetStartDate: boolean;
}): string | null {
  const { workingDate, selectedCost, selectedPeriod, parentPeriod } = args;
  const coalesce = (...v: (string | null | undefined)[]): string | null =>
    v.find((x) => x !== null && x !== undefined && x !== "") ?? null;

  let branch: string | null = null;
  if (!selectedCost || args.resetStartDate) {
    branch = workingDate;
  } else if (selectedCost && selectedPeriod) {
    branch = coalesce(workingDate, selectedPeriod.startDate);
  } else if (args.panelState === "New") {
    const chained = parentPeriod?.startDate
      ? addMonths(
        parentPeriod.startDate,
        (parentPeriod.durationYears ?? 0) * 12 + (parentPeriod.durationMonths ?? 0),
      )
      : null;
    branch = coalesce(workingDate, chained);
  }
  return coalesce(branch, workingDate);
}

/**
 * `ico_ResetStartDay_NewEditCost_LandLease_1.Visible` (LL:2517) —
 * `Or(period.Period = 'Period 1', IsBlank(cost))`. Same shape as `headerEditable`.
 */
export const resetStartDateVisible = (
  selectedPeriod: Pick<LeasePeriodRow, "period"> | null | undefined,
  selectedCost: { id: string } | null | undefined,
): boolean => headerEditable(selectedPeriod, selectedCost);

/**
 * `ico_ResetStartDay_….OnChange` (LL:2501) — snap back to the project COD and re-stamp
 * `IsStartDateStandardAssumption`. Yes on Period 1 or on a brand-new contract, No otherwise.
 */
export function resetStartDate(args: {
  codDate: string | null;
  selectedPeriod: Pick<LeasePeriodRow, "period"> | null | undefined;
  selectedCost: { id: string } | null | undefined;
}): { workingDate: string | null; resetStartDate: true; isStartDateStandardAssumption: boolean } {
  const standard = isPeriodOne(args.selectedPeriod?.period ?? null)
    || (!args.selectedCost && !args.selectedPeriod);
  return {
    workingDate: args.codDate,
    resetStartDate: true,
    isStartDateStandardAssumption: standard,
  };
}

/**
 * `dte_….FontItalic` / `.FontColor` (LL:2331) — a start date that still comes from the
 * standard assumption renders italic and in themePrimary, exactly like a standard row does in
 * the grid.
 */
export const startDateIsStandard = (isStartDateStandardAssumption: boolean): boolean =>
  isStartDateStandardAssumption;

/* ══════════════════════════════════════════════════ duration / currency / lists ══ */

/**
 * `drp_…_DurationYears_1.Items` — `ForAll(Sequence(36), {Name: Value-1 & If(Value-1 = 1,
 * " year", " years"), Value: Value-1})` (LL:2631). Zero to thirty-five.
 */
export const DURATION_YEAR_OPTIONS: readonly number[] = Array.from({ length: 36 }, (_, i) => i);

/** `drp_…_DurationMonths_1.Items` — `Sequence(12)` → 0..11 (LL:2577). */
export const DURATION_MONTH_OPTIONS: readonly number[] = Array.from({ length: 12 }, (_, i) => i);

export const durationYearLabel = (n: number): string => `${n} ${n === 1 ? "year" : "years"}`;
export const durationMonthLabel = (n: number): string => `${n} ${n === 1 ? "month" : "months"}`;

/**
 * SOURCE DEFECT LL-D2: `drp_…_DurationYears_1.DefaultSelectedItems` rebuilds the same list
 * with `If(ThisRecord.Value = 1, " year", " years")` — comparing the un-decremented sequence
 * index instead of the value (LL:2619), where `Items` compares `ThisRecord.Value - 1`
 * (LL:2635). The default-selected item therefore carries a label one step out of phase:
 * 0 shows as `"0 year"` and 1 as `"1 years"`. Cosmetic, but visible until the user reopens the
 * dropdown. Reproduced here; `durationYearLabel` is the corrected form the list itself uses.
 */
export const durationYearLabelCanvasParityDefault = (n: number): string =>
  `${n} ${n + 1 === 1 ? "year" : "years"}`;

/**
 * `drp_…_DurationMonths_1.DefaultSelectedItems` (LL:2548) — the stored months if set;
 * otherwise 0 months IF a year has been picked; otherwise nothing selected at all. That last
 * arm is what makes the Save gate's `IsBlank(DurationMonths.Selected.Value)` reachable.
 */
export function defaultDurationMonths(
  storedMonths: number | null | undefined,
  yearsSelected: boolean,
): number | null {
  if (storedMonths !== null && storedMonths !== undefined) return storedMonths;
  return yearsSelected ? 0 : null;
}

/** `drp_…_DurationYears_1.DefaultSelectedItems` (LL:2612) — the stored years, or nothing. */
export const defaultDurationYears = (storedYears: number | null | undefined): number | null =>
  storedYears ?? null;

/**
 * `drp_…_Aggregation_1.DefaultSelectedItems` (LL:3571) — the stored value, else the literal
 * `952850000`. Verified against the org: that is `SUM`.
 */
export const defaultAggregation = (stored: number | null | undefined): number =>
  stored ?? LAND_LEASE_AGGREGATION.sum;

/**
 * `drp_…_Currency_1` (LL:2762) — `DisplayMode.Disabled` always, and the default is PLN for a
 * Polish project and EUR for every other. The user cannot change it; the field exists to be
 * written.
 */
export const defaultCurrencyCode = (countryName: string | null | undefined): string =>
  countryName === "Poland" ? "PLN" : "EUR";

export const currencyEditable = (): boolean => false;

/**
 * `drp_…_DistributionFrequency_Month_1.DefaultSelectedItems` (LL:3679) — a plain `LookUp` on
 * the stored value with NO fallback, so a period with no frequency opens with the dropdown
 * empty and the Save gate's `IsBlank(…Selected.Value)` blocks the save.
 *
 * `vsb_distributionfrequency` is an integer column, not a choice — verified: the org has no
 * string map for it. `colDistributionFrequency` is an app-side list, which is why the values
 * live in the shared `FREQUENCIES` in `./rules.ts` rather than in an option set here.
 */
export const defaultDistributionFrequency = (stored: number | null | undefined): number | null =>
  stored ?? null;

/* ═══════════════════════════════════════════════════════════ rules 9-12 · WTGs ══ */

/**
 * `colGeneratorsInProject` (LL:6). Two `Collect`s into one collection:
 *   1. generator-type rows, labelled `$"{Name} - {Status}"`, with
 *      `Order: Value(Last(Split(Name, "_")).Value)`;
 *   2. PV-module rows, labelled by the module type's `Label`, with **NO `Order` column**.
 *
 * The picker then sorts by `Order` ascending (LL:3928). A missing column is `Blank()`, which
 * sorts as 0, so PV rows land BEFORE every WTG whose suffix is 1 or higher.
 *
 * SKELETON DIVERGENCE: the skeleton assigns the PV rows `order: wtg.length + i`, putting them
 * last. The canvas puts them first. Canvas followed.
 */
export function generatorOptions(
  generators: readonly { id: string; name: string; status: string | null }[],
  pvModules: readonly { id: string; name: string; label: string }[],
): GeneratorOption[] {
  const wtg: GeneratorOption[] = generators.map((g) => ({
    id: g.id,
    name: g.name,
    label: `${g.name} - ${g.status ?? ""}`,
    order: Number(g.name.split("_").pop()) || 0,
    kind: "wtg" as const,
  }));
  const pv: GeneratorOption[] = pvModules.map((p) => ({
    id: p.id, name: p.name, label: p.label, order: 0, kind: "pv" as const,
  }));
  return [...wtg, ...pv].sort((a, b) => a.order - b.order);
}

/**
 * Rule 12 — `PA:3861` and `PA:3904`: both the "Allocate to all WTGs" toggle and the WTG picker
 * are hidden unless the project's technology is PV or Wind.
 *
 * Absent from the older `.txt` export entirely; the `.pa.yaml` is the newer of the two and
 * this is one of its four substantive additions.
 *
 * SKELETON DIVERGENCE: the skeleton compares a lower-cased technology STRING (`"wind"`,
 * `"pv"`). `gblSelectedProject.Technology` is an option set — verified on the org as
 * Wind 952850000, PV 952850001 — so the comparison is against the numeric value.
 */
export const allocationVisible = (technology: number | null | undefined): boolean =>
  technology === TECHNOLOGY.pv || technology === TECHNOLOGY.wind;

/**
 * `con_…_AllocationWtg_1.Visible` in the OLDER `.txt` export (LL:3891) —
 * `Not(allWtgToggle.Checked)`, i.e. the picker collapsed while "allocate to all" was on.
 * `PA:3904` replaced that with the technology gate, so in the shipped app the picker stays
 * visible and simply shows every generator. Parity only.
 */
export const allocationPickerVisibleCanvasParityTxt = (allWtgChecked: boolean): boolean =>
  !allWtgChecked;

/**
 * Rule 11 — the allocation controls follow the same Period-1 `DisplayMode` gate as the rest of
 * the header (`cmb_…_AllocationWtg_1.DisplayMode`, LL:3921).
 */
export const allocationEditable = headerEditable;

/**
 * `cmb_…_AllocationWtg_1.DefaultSelectedItems` (LL:3905) — when the all-WTG toggle has just
 * been switched on (`locSelectAllWTG`) the picker pre-selects EVERY generator; otherwise it
 * pre-selects the ones the contract already has allocation rows for.
 */
export function defaultAllocatedGenerators(
  generators: readonly GeneratorOption[],
  allocations: readonly LeaseAllocationRow[],
  selectAllWtg: boolean,
): GeneratorOption[] {
  if (selectAllWtg) return [...generators];
  const allocated = new Set(
    allocations.map((a) => a.generatorInProjectId).filter((x): x is string => x !== null),
  );
  return generators.filter((g) => allocated.has(g.id));
}

/**
 * Rule 10 — `cmb_…_AllocationWtg_1.OnChange` (LL:3929):
 * `locAllWTGAllocated: CountIf(Self.SelectedItems, true) = CountIf(colGeneratorsInProject, true)`.
 *
 * Note the canvas compares COUNTS, not sets. Zero generators in the project makes `0 = 0` and
 * sets the flag TRUE, which is why the guard on `allIds.length` matters — the skeleton
 * already has it and it is kept, as a deliberate divergence from the raw count comparison.
 */
export function allWtgSelected(selectedIds: readonly string[], allIds: readonly string[]): boolean {
  return allIds.length > 0 && selectedIds.length === allIds.length;
}

/** Bug-for-bug twin of LL:3932's bare count comparison. Parity only. */
export const allWtgSelectedCanvasParity = (
  selectedIds: readonly string[],
  allIds: readonly string[],
): boolean => selectedIds.length === allIds.length;

/**
 * Rule 9 — the allocation is a DIFF, not a replace.
 *
 * `LL:5895` runs two loops after the header patch: a `ForAll(combo.SelectedItems, Patch(...,
 * If(IsBlank(existing), Defaults(...), existing), {...}))` that upserts, then a
 * `ForAll(colAllocatedWtgs…, If(Not(generator in ShowColumns(combo.SelectedItems, …)),
 * Remove(...)))` that deletes. Both loops are inside the Period-1 branch, so editing Period 2+
 * cannot change the allocation at all.
 *
 * Rows whose generator lookup is null cannot match any selection and are deleted — which is
 * also how an orphaned allocation gets cleaned up.
 */
export function diffAllocation(
  existing: readonly LeaseAllocationRow[],
  selectedGeneratorIds: readonly string[],
): { toCreate: string[]; toUpdate: { id: string; generatorInProjectId: string }[]; toDelete: string[] } {
  const have = new Map<string, string>();
  for (const a of existing) {
    if (a.generatorInProjectId !== null) have.set(a.generatorInProjectId, a.id);
  }
  const want = new Set(selectedGeneratorIds);
  return {
    toCreate: selectedGeneratorIds.filter((id) => !have.has(id)),
    // The canvas Patch re-writes Name / Project Cost / Generator / Owning BU on every already
    // allocated row, not only the new ones — so the names follow a renamed contract.
    toUpdate: selectedGeneratorIds
      .filter((id) => have.has(id))
      .map((id) => ({ id: have.get(id)!, generatorInProjectId: id })),
    toDelete: existing
      .filter((a) => a.generatorInProjectId === null || !want.has(a.generatorInProjectId))
      .map((a) => a.id),
  };
}

/**
 * The allocation join's `Name` — `cost.'Land Owner' & "-" & cost.Description & "-" &
 * generator.Name` (LL:5895).
 *
 * It reads the SAVED cost, not the description box, so a rename only reaches the allocation
 * rows on the save AFTER the rename. A blank land owner leaves a leading hyphen; verified
 * against live rows, e.g. `"-Standard LL Locations-WTG 111_1"`.
 */
export const allocationName = (
  landOwner: string | null | undefined,
  description: string,
  generatorName: string,
): string => `${landOwner ?? ""}-${description}-${generatorName}`;

/* ═══════════════════════════════════════════════════════ rules 4-6 · payments ══ */

function isBlankValue(v: string | number | null | undefined): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "number") return Number.isNaN(v);
  return v.trim() === "";
}

export interface OneTimePaymentFields {
  dueDate: string;
  amount: string;
  dueDate2: string;
  amount2: string;
  dueDate3: string;
  amount3: string;
}

/**
 * Rule 4 — the one-time payments are all-or-nothing on the toggle.
 *
 * `LL:5895` writes each of the six fields as
 * `If(oneTimePaymentToggle.Checked, <box value>, Blank())`, so turning the toggle off blanks
 * all six on the next save — including payments 2 and 3, whose own blocks may already be
 * hidden.
 *
 * `Value("")` is `Blank()` in Power Fx, so an empty amount box also writes blank; the due
 * dates are written as raw text.
 */
export function oneTimePaymentPayload(
  enabled: boolean,
  values: OneTimePaymentFields,
  locale?: string,
): {
  dueDate: string | null; amount: number | null;
  dueDate2: string | null; amount2: number | null;
  dueDate3: string | null; amount3: number | null;
} {
  if (!enabled) {
    return {
      dueDate: null, amount: null, dueDate2: null, amount2: null, dueDate3: null, amount3: null,
    };
  }
  const money = (v: string) => parseNumber(v, locale) ?? null;
  const text = (v: string) => (isBlankValue(v) ? null : v);
  return {
    dueDate: text(values.dueDate), amount: money(values.amount),
    dueDate2: text(values.dueDate2), amount2: money(values.amount2),
    dueDate3: text(values.dueDate3), amount3: money(values.amount3),
  };
}

/**
 * `tgl_…_BodyContent_OneTimePayment.Checked` (LL:4734) — on when BOTH halves of the FIRST
 * payment are stored. Same test as the grid's `OTP` column.
 */
export function oneTimePaymentChecked(
  cost: Pick<LeaseCostRow, "amountOneTimePayment" | "dueDateOneTimePayment"> | null | undefined,
): boolean {
  return !isBlankValue(cost?.amountOneTimePayment) && !isBlankValue(cost?.dueDateOneTimePayment);
}

/**
 * Rule 5 — `locShowSecondPayment` / `locShowThirdPayment` (LL:388, both the `newLandLease…`
 * and `EditLandLease…` arms). The 2nd / 3rd payment blocks exist only when BOTH of their
 * fields hold data.
 */
export const showSecondPayment = (
  cost: Pick<LeaseCostRow, "amountOneTimePayment2" | "dueDateOneTimePayment2"> | null | undefined,
): boolean => !isBlankValue(cost?.amountOneTimePayment2)
  && !isBlankValue(cost?.dueDateOneTimePayment2);

export const showThirdPayment = (
  cost: Pick<LeaseCostRow, "amountOneTimePayment3" | "dueDateOneTimePayment3"> | null | undefined,
): boolean => !isBlankValue(cost?.amountOneTimePayment3)
  && !isBlankValue(cost?.dueDateOneTimePayment3);

/**
 * `btn_OneTimePayment2_NewEditCost_BodyContent_1` (LL:5069) and its `…3` twin (LL:5425).
 *
 * One button per extra payment. Its caption and icon flip on whether the block is already
 * shown, it is hidden once the NEXT block exists (`Visible: =!locShowThirdPayment` on the
 * second button, `=locShowSecondPayment` on the third), and it is disabled whenever the
 * PRECEDING payment is incomplete or invalid, or when this is a period 2+ edit reached from a
 * parent period.
 */
export function addPaymentButton(n: 2 | 3, args: {
  showSecondPayment: boolean;
  showThirdPayment: boolean;
  previousAmount: string;
  previousDueDate: string;
  previousAmountError: boolean;
  previousDueDateError: boolean;
  selectedPeriod: Pick<LeasePeriodRow, "period"> | null | undefined;
  hasParentPeriod: boolean;
}): { visible: boolean; enabled: boolean; label: string; icon: "Add" | "Delete" } {
  const shown = n === 2 ? args.showSecondPayment : args.showThirdPayment;
  const visible = n === 2 ? !args.showThirdPayment : args.showSecondPayment;
  const notPeriodOneChild = !isPeriodOne(args.selectedPeriod?.period ?? null)
    && args.hasParentPeriod;
  const enabled = !(
    args.previousAmountError
    || args.previousDueDateError
    || isBlankValue(args.previousAmount)
    || isBlankValue(args.previousDueDate)
    || notPeriodOneChild
  );
  return {
    visible,
    enabled,
    label: shown ? LEASE_MSG.deleteOneTimePayment : LEASE_MSG.addOneTimePayment,
    icon: shown ? "Delete" : "Add",
  };
}

/**
 * Rule 6 — `Secured` is a Yes/No CHOICE written from a toggle (LL:5895):
 * `If(securedToggle.Checked, 'Land Lease Secured'.Yes, 'Land Lease Secured'.No)`.
 * Verified: `Yes = 952850000`, `No = 952850001`.
 */
export const securedValue = (checked: boolean): number =>
  checked ? LAND_LEASE_SECURED.yes : LAND_LEASE_SECURED.no;

/**
 * `tgl_…_BodyContent_Secured.Checked` (LL:3825) — an explicit three-arm `If` whose final arm
 * is `false`, so a NULL choice reads as unchecked rather than as an error.
 */
export const securedChecked = (
  cost: Pick<LeaseCostRow, "secured"> | null | undefined,
): boolean => cost?.secured === LAND_LEASE_SECURED.yes;

/* ══════════════════════════════════════════════════════════════════ inflation ══ */

/**
 * `con_…_InflationStartYear_1.Visible`, `con_…_InflationProfile_1.Visible` and
 * `tgl_…_CountryInflationProfile_1.Visible` (LL:4149, LL:4245, LL:4523) — everything inflation
 * hangs off the `Inflation Profile` toggle.
 */
export const inflationSectionVisible = (inflationChecked: boolean): boolean => inflationChecked;

/**
 * `con_…_AreaInflationProfile_1.Visible` (LL:4391) — the Area dropdown exists for ITALY only,
 * and only while both inflation toggles are on.
 */
export const areaInflationVisible = (args: {
  inflationChecked: boolean;
  countryInflationChecked: boolean;
  countryName: string | null | undefined;
}): boolean => args.inflationChecked
  && args.countryInflationChecked
  && args.countryName === "Italy";

/**
 * `lbl_…_InflationProfile_1.Text` (LL:4645) — one label, two captions: the field is the
 * read-only country name when the country toggle is on and an editable percentage when it is
 * off.
 */
export const inflationProfileLabel = (countryInflationChecked: boolean): string =>
  countryInflationChecked
    ? LEASE_LABELS.countryInflationProfile
    : LEASE_LABELS.customInflationProfile;

/**
 * `txt_…_InflationProfile_2.Value` (LL:4707) — the read-only text shown in place of the
 * percentage while the country toggle is on. Same Italy special-case as the grid cell.
 */
export function countryInflationDisplay(
  ctx: Pick<LeaseProjectContext, "countryName" | "areaWithRegion">,
): string {
  if (ctx.countryName === "Italy") {
    return `Italy - ${(ctx.areaWithRegion ?? "").replace(/Italy_/g, "")}`;
  }
  return ctx.countryName ?? "";
}

/**
 * `txt_…_InflationStartYear_1.Value` (LL:4299) —
 * `Coalesce(cost.'Inflation Start Year', Year(startDatePicker.SelectedDate) + 1)`.
 *
 * COD + 1, not COD. The standard import stamps the same `Year(COD) + 1` (LL:388).
 */
export function inflationStartYearDefault(
  storedYear: number | null | undefined,
  startDate: string | null | undefined,
): number | null {
  if (storedYear !== null && storedYear !== undefined) return storedYear;
  const d = toDate(startDate);
  return d === null ? null : d.getFullYear() + 1;
}

/** `Year(COD) + 1` on its own, for the standard import (LL:388, `recCODYear`). */
export function inflationStartYearFromCod(codDate: string | null | undefined): number | null {
  const d = toDate(codDate);
  return d === null ? null : d.getFullYear() + 1;
}

/**
 * `txt_…_InflationProfile_1.Value` (LL:4616) — what the percentage box shows.
 *
 * Four arms: the stored profile when a cost is selected and the country toggle is off; the
 * country profile for the Area + year when the country toggle is on in Italy; the country
 * profile for the year when the country toggle is on elsewhere; blank otherwise. Both country
 * arms are wrapped in `Max(..., 0)`, so a missing profile row shows `0.0` rather than blank.
 */
export function resolveInflationProfileValue(args: {
  selectedCost: Pick<LeaseCostRow, "inflationProfile"> | null | undefined;
  countryInflationChecked: boolean;
  countryName: string | null | undefined;
  /** The `Country Inflation Profiles` row for (country, year[, area]), or null. */
  countryProfile: number | null;
}): number | null {
  if (args.selectedCost && !args.countryInflationChecked) {
    return args.selectedCost.inflationProfile ?? null;
  }
  if (args.countryInflationChecked) return Math.max(args.countryProfile ?? 0, 0);
  return null;
}

/* ═════════════════════════════════════════════════════════════════ validation ══ */

/**
 * The five period rates and the three payment amounts, each with the range and the wording the
 * canvas gives it.
 *
 * SKELETON DIVERGENCE — the skeleton's `LEASE_RANGES` puts every rate at 1,000,000,000. The
 * canvas gives EUR/MWh, EUR/MW and EUR/WTG a maximum of **100,000,000** (LL:3206, LL:3338,
 * LL:3469); only Fix Costs and the payment amounts reach 1,000,000,000 (LL:2951, LL:4963).
 * The skeleton also gives every field the same two messages, where the canvas gives
 * `% of Revenues` and the payment amounts their own. Canvas followed on both counts.
 */
export const LEASE_NUMERIC_SPEC = {
  /** `lbl_…_FixedCosts_ErrorMessage_1` (LL:2939). Max formatted `"#,###.0#"`. */
  fixedCosts: {
    min: 0, max: 1_000_000_000,
    decimalMessage: LEASE_MSG.twoDecimal,
    rangeMessage: "Value must be between 0 and 1,000,000,000.0.",
  },
  /** `lbl_…_PercentOfRevenues_ErrorMessage_1` (LL:3068). Max formatted `"#,##0.0#"`. */
  percentOfRevenues: {
    min: 0, max: 10_000,
    decimalMessage: LEASE_MSG.percentTwoDecimal,
    rangeMessage: "Please select a value between 0 and 10,000.0.",
  },
  /** `lbl_…_EuroMWh_ErrorMessage_1` (LL:3199). */
  eurPerMwh: {
    min: 0, max: 100_000_000,
    decimalMessage: LEASE_MSG.twoDecimal,
    rangeMessage: "Please select a value between 0 and 100,000,000.0.",
  },
  /** `lbl_…_EuroMW_ErrorMessage_1` (LL:3331). */
  eurPerMw: {
    min: 0, max: 100_000_000,
    decimalMessage: LEASE_MSG.twoDecimal,
    rangeMessage: "Please select a value between 0 and 100,000,000.0.",
  },
  /** `lbl_…_EuroWTG_ErrorMessage_1` (LL:3462). */
  eurPerWtg: {
    min: 0, max: 100_000_000,
    decimalMessage: LEASE_MSG.twoDecimal,
    rangeMessage: "Please select a value between 0 and 100,000,000.0.",
  },
  /** `lbl_…_Amount_ErrorMessage_1` and its 2/3 twins (LL:4953, LL:5309, LL:5667). */
  amount: {
    min: 0, max: 1_000_000_000,
    decimalMessage: LEASE_MSG.amountNotANumber,
    rangeMessage: "Please select a value between 0 and 1,000,000,000.0.",
  },
} as const;

export type LeaseNumericField = keyof typeof LEASE_NUMERIC_SPEC;

/**
 * `fn_Numeric.IsTwoDecimal` then `fn_Numeric.InRange`, which is the shape all six error labels
 * share:
 *
 * `Visible: And(Not(IsBlank(v)), Or(Not(IsTwoDecimal(v)), Not(InRange(v, min, max))))`
 * `Text:    If(And(Not(IsBlank(v)), Not(IsTwoDecimal(v))), <decimal msg>,
 *              Not(InRange(v, min, max)), <range msg>)`
 *
 * A blank box is valid everywhere — "required" is a separate question the Save gate answers.
 *
 * SOURCE DEFECT LL-D9: Fix Costs calls `fn_Numeric_CC` — the CAPEX screen's instance of the
 * component — where the other four Land Lease fields call `fn_Numeric_LL` (LL:2942 vs
 * LL:3071). Same component, same behaviour, so this is a naming defect rather than a
 * behavioural one; noted because it is the kind of thing that stops being harmless the day
 * somebody edits one instance.
 */
export function validateLeaseNumber(
  field: LeaseNumericField,
  value: string | null | undefined,
  locale?: string,
): string | null {
  if (isBlankValue(value)) return null;
  const spec = LEASE_NUMERIC_SPEC[field];
  // `fn_Numeric.IsTwoDecimal` accepts a leading `-`; see PARITY NOTE 3 in @/domain/numeric.
  if (!isDecimal(value, { places: 2, allowNegative: true, locale })) return spec.decimalMessage;
  if (!inRange(value, spec.min, spec.max, locale)) return spec.rangeMessage;
  return null;
}

/**
 * `lbl_…_DueDate_ErrorMessage_1.Visible` (LL:4816) —
 * `And(Not(IsBlank(v)), Not(IsMatch(v, "^(0[1-9]|1[0-2])\/\d{4}$")))`.
 *
 * `vsb_duedateonetimepayment` is a TEXT column; verified on the org, live values read
 * `"12/2025"`. There is no date picker and no month validation beyond 01-12.
 */
const MM_YYYY = /^(0[1-9]|1[0-2])\/\d{4}$/;

export function validateDueDate(value: string | null | undefined): string | null {
  if (isBlankValue(value)) return null;
  return MM_YYYY.test((value ?? "").trim()) ? null : LEASE_MSG.dueDateFormat;
}

/**
 * `lbl_…_InflationStartYear_ErrorMessage_1.Visible` (LL:4276) —
 * `And(Not(IsBlank(v)), Not(IsMatch(v, "^\d{4}$")))`. Four digits, no range check at all, so
 * `"0000"` and `"9999"` both pass.
 */
export function validateInflationStartYear(value: string | null | undefined): string | null {
  if (isBlankValue(value)) return null;
  return /^\d{4}$/.test((value ?? "").trim()) ? null : LEASE_MSG.inflationStartYearFormat;
}

/**
 * `lbl_…_InflationProfile_ErrorMessage_1` (LL:4552) — one decimal place, 0 to 100 inclusive,
 * and the whole label is suppressed while the country toggle is on because the field is then
 * read-only.
 *
 * Three distinct messages, which is unusual on this screen: a one-decimal failure, a range
 * failure and a not-a-number failure each get their own wording, and the last two differ by a
 * single word ("number" vs "numeric").
 */
export function validateInflationProfile(
  value: string | null | undefined,
  countryInflationChecked: boolean,
  locale?: string,
): string | null {
  if (countryInflationChecked) return null;
  if (isBlankValue(value)) return null;
  if (!isDecimal(value, { places: 1, allowNegative: false, locale })) {
    return LEASE_MSG.inflationProfileOneDecimal;
  }
  const n = parseNumber(value, locale);
  if (n === undefined) return LEASE_MSG.inflationProfileNotANumber;
  if (n < 0 || n > 100) return LEASE_MSG.inflationProfileRange;
  return null;
}

/**
 * `lbl_…_Description_ErrorMessage_1.Visible` (LL:2178) —
 * `And(Not(IsBlank(v)), Not(IsBlank(Find("standard", Lower(v)))))`.
 *
 * `Find` looks ANYWHERE in the string, not just at the start, so `"Non-standard lease"` is
 * refused too. The word is reserved for system-prefilled contracts.
 */
export function validateLeaseDescription(value: string | null | undefined): string | null {
  if (isBlankValue(value)) return null;
  return (value ?? "").toLowerCase().includes("standard")
    ? LEASE_MSG.descriptionStandardReserved
    : null;
}

/** `txt_…_Description_1.MaxLength` (LL:2202). */
export const LEASE_DESCRIPTION_MAX_LENGTH = 55;

/**
 * SOURCE DEFECT LL-D6: `lbl_…_StartDate_ErrorMessage_1` (LL:2318) has
 * `Text: If(IsBlank(picker.SelectedDate), "Value cannot be blank")` but
 * `Visible: Not(IsBlank(picker.SelectedDate))` — the visibility is INVERTED. The label is
 * shown only when a date IS picked, and in that state its text evaluates to blank, so the
 * message can never be read. A blank start date is silently accepted by the panel and written
 * as `DateValue(Blank())`.
 *
 * `validateStartDate` is the corrected behaviour; `startDateErrorVisibleCanvasParity` pins
 * the inversion so the parity decision stays reversible. The Save gate does NOT consult this
 * label (LL:5880 lists fifteen error labels and this is not one of them), so enabling the
 * correction does not by itself change whether Save is offered.
 */
export function validateStartDate(value: string | null | undefined): string | null {
  return isBlankValue(value) ? LEASE_MSG.startDateBlank : null;
}

/** Bug-for-bug twin of LL:2324. Parity only. */
export const startDateErrorVisibleCanvasParity = (value: string | null | undefined): boolean =>
  !isBlankValue(value);

/* ════════════════════════════════════════════════════════════════════ the form ══ */

export interface LandLeaseForm {
  /** Written to BOTH `vsb_landleaseprojectcosts.vsb_description` and the period's `vsb_name`. */
  description: string;
  startDate: string | null;
  durationYears: number | null;
  durationMonths: number | null;
  currencyId: string | null;
  fixedCosts: string;
  percentOfRevenues: string;
  eurPerMwh: string;
  eurPerMw: string;
  eurPerWtg: string;
  aggregation: number | null;
  distributionFrequency: number | null;
  securedChecked: boolean;
  allWtgAllocated: boolean;
  allocatedGeneratorIds: string[];
  inflationChecked: boolean;
  countryInflationChecked: boolean;
  inflationStartYear: string;
  inflationProfile: string;
  inflationCountryArea: string | null;
  oneTimePaymentsOn: boolean;
  payments: OneTimePaymentFields;
  /** `locShowSecondPayment` / `locShowThirdPayment` — panel state, not stored data. */
  showSecondPayment: boolean;
  showThirdPayment: boolean;
  /** `locIsStartDateStandardAssumption` — carried through the save unchanged (LL:5895). */
  isStartDateStandardAssumption: boolean;
}

/**
 * The panel's initial values, read off each control's `Value` / `DefaultSelectedItems`.
 *
 * The `Text(..., "#0.00")` on Fix Costs (LL:2988), `Text(..., "##0.00")` on the amounts
 * (LL:5004) and the two-armed integer-or-decimal format on `% of Revenues` (LL:3105 block)
 * are reproduced, because they decide what the validator then sees.
 */
export function landLeaseFormFrom(args: {
  cost: LeaseCostRow | null;
  period: LeasePeriodRow | null;
  parentPeriod: LeasePeriodRow | null;
  allocations: readonly LeaseAllocationRow[];
  panelState: "New" | "Edit";
  workingDate: string | null;
  resetStartDate: boolean;
}): LandLeaseForm {
  const { cost, period } = args;
  const money2 = (v: number | null | undefined) =>
    v === null || v === undefined ? "" : v.toFixed(2);
  // `If(Int(v) = v, Text(v, "#"), Text(v, "#0.0#"))` — LL:3105 block.
  const percent = (v: number | null | undefined) => {
    if (v === null || v === undefined) return "";
    if (Number.isInteger(v)) return String(v);
    const s = v.toFixed(2);
    return s.endsWith("0") ? s.slice(0, -1) : s;
  };
  const startDate = resolveStartDate({
    workingDate: args.workingDate,
    selectedCost: cost,
    selectedPeriod: period,
    parentPeriod: args.parentPeriod,
    panelState: args.panelState,
    resetStartDate: args.resetStartDate,
  });
  const yearsSelected = (period?.durationYears ?? null) !== null;

  return {
    // `txt_…_Description_1.Value = If(locRightPanelState="New", locNewPeriodDesc, period.Name)`
    // (LL:2206) — the panel edits the PERIOD's name, and the save copies it to the header's
    // description as well.
    description: args.panelState === "New"
      ? (args.parentPeriod ? nextPeriodName(args.parentPeriod.name, isPeriodOne(args.parentPeriod.period)) : "")
      : period?.name ?? "",
    startDate,
    durationYears: defaultDurationYears(period?.durationYears),
    durationMonths: defaultDurationMonths(period?.durationMonths, yearsSelected),
    currencyId: cost?.currencyId ?? null,
    fixedCosts: money2(period?.fixedCosts),
    percentOfRevenues: percent(period?.percentOfRevenues),
    eurPerMwh: money2(period?.eurPerMwh),
    eurPerMw: money2(period?.eurPerMw),
    eurPerWtg: money2(period?.eurPerWtg),
    aggregation: defaultAggregation(period?.aggregation),
    distributionFrequency: defaultDistributionFrequency(period?.distributionFrequency),
    securedChecked: securedChecked(cost),
    allWtgAllocated: cost?.allWtgAllocated ?? false,
    allocatedGeneratorIds: args.allocations
      .filter((a) => a.projectCostId === (cost?.id ?? null) && a.generatorInProjectId !== null)
      .map((a) => a.generatorInProjectId as string),
    inflationChecked: cost?.useInflationProfile ?? false,
    countryInflationChecked: cost?.useCountryInflationProfile ?? false,
    inflationStartYear: String(inflationStartYearDefault(cost?.inflationStartYear, startDate) ?? ""),
    inflationProfile: cost?.inflationProfile === null || cost?.inflationProfile === undefined
      ? "" : cost.inflationProfile.toFixed(1),
    inflationCountryArea: cost?.inflationCountryArea ?? null,
    oneTimePaymentsOn: oneTimePaymentChecked(cost),
    payments: {
      dueDate: cost?.dueDateOneTimePayment ?? "",
      amount: money2(cost?.amountOneTimePayment),
      dueDate2: cost?.dueDateOneTimePayment2 ?? "",
      amount2: money2(cost?.amountOneTimePayment2),
      dueDate3: cost?.dueDateOneTimePayment3 ?? "",
      amount3: money2(cost?.amountOneTimePayment3),
    },
    showSecondPayment: showSecondPayment(cost),
    showThirdPayment: showThirdPayment(cost),
    // `locIsStartDateStandardAssumption: locSelectedLandLeaseCost.IsStartDateStandardAssumption`
    // on both the Add-Period and Edit arms (LL:388); the New-Contract arm stamps No.
    isStartDateStandardAssumption: cost?.isStartDateStandardAssumption ?? false,
  };
}

/**
 * A brand-new contract — the `"newLandLeaseContractKey"` arm of the command bar (LL:388).
 * Everything is blank except the start date, which is seeded with the project COD, and
 * `IsStartDateStandardAssumption`, which is explicitly stamped NO.
 */
export function emptyLandLeaseForm(ctx: LeaseProjectContext): LandLeaseForm {
  return {
    description: "",
    startDate: ctx.codDate,
    durationYears: null,
    durationMonths: null,
    currencyId: null,
    fixedCosts: "",
    percentOfRevenues: "",
    eurPerMwh: "",
    eurPerMw: "",
    eurPerWtg: "",
    aggregation: LAND_LEASE_AGGREGATION.sum,
    distributionFrequency: null,
    securedChecked: false,
    allWtgAllocated: false,
    allocatedGeneratorIds: [],
    inflationChecked: false,
    countryInflationChecked: false,
    inflationStartYear: String(inflationStartYearFromCod(ctx.codDate) ?? ""),
    inflationProfile: "",
    inflationCountryArea: null,
    oneTimePaymentsOn: false,
    payments: { dueDate: "", amount: "", dueDate2: "", amount2: "", dueDate3: "", amount3: "" },
    showSecondPayment: false,
    showThirdPayment: false,
    isStartDateStandardAssumption: false,
  };
}

/** The five period rates, as the canvas' repeated `Or(Not(IsBlank(...)) x5)` reads them. */
export const formHasAnyRate = (f: LandLeaseForm): boolean => [
  f.fixedCosts, f.percentOfRevenues, f.eurPerMwh, f.eurPerMw, f.eurPerWtg,
].some((v) => !isBlankValue(v));

/** The same five, read off a stored period instead of the form (LL:5815). */
export const periodHasAnyRate = (p: LeasePeriodRow | null | undefined): boolean =>
  p !== null && p !== undefined && [
    p.fixedCosts, p.percentOfRevenues, p.eurPerMwh, p.eurPerMw, p.eurPerWtg,
  ].some((v) => v !== null && v !== undefined);

/**
 * Every field error the panel can show, keyed by the control that shows it.
 *
 * A NOTE ON THE PAYMENT BLOCKS, because the canvas is subtle here. The 2nd and 3rd payment
 * error labels live inside containers gated on `locShowSecondPayment` / `locShowThirdPayment`
 * (LL:5136, LL:5274), so they cannot be READ when the block is hidden. But the Save gate does
 * not read the container — it reads `lbl_…_Amount2_ErrorMessage_1.Visible`, and a control's
 * own `Visible` in Power Fx ignores its parent's. So on paper a stale invalid value in a
 * hidden box could block Save with no error on screen.
 *
 * It cannot happen in practice: every path that hides a block also `Reset`s its two inputs —
 * the delete button (LL:5117, LL:5473), the One-Time Payment toggle's `OnUncheck` (LL:4748)
 * and the panel's reset button (LL:5992). Gating here therefore matches the canvas in every
 * REACHABLE state and refuses to reproduce an unreachable trap. Said out loud because it is
 * the one place this port is deliberately narrower than a literal transcription.
 */
export function leaseFieldErrors(
  form: LandLeaseForm,
  locale?: string,
): Partial<Record<string, string>> {
  const e: Record<string, string> = {};
  const put = (k: string, v: string | null) => { if (v !== null) e[k] = v; };

  put("description", validateLeaseDescription(form.description));
  put("fixedCosts", validateLeaseNumber("fixedCosts", form.fixedCosts, locale));
  put("percentOfRevenues", validateLeaseNumber("percentOfRevenues", form.percentOfRevenues, locale));
  put("eurPerMwh", validateLeaseNumber("eurPerMwh", form.eurPerMwh, locale));
  put("eurPerMw", validateLeaseNumber("eurPerMw", form.eurPerMw, locale));
  put("eurPerWtg", validateLeaseNumber("eurPerWtg", form.eurPerWtg, locale));

  if (form.inflationChecked) {
    put("inflationStartYear", validateInflationStartYear(form.inflationStartYear));
    put("inflationProfile",
      validateInflationProfile(form.inflationProfile, form.countryInflationChecked, locale));
  }
  // The payment error labels live inside containers gated on the toggle (LL:4780, LL:4918),
  // so a stale value in a hidden box shows no error and does not block the save.
  if (form.oneTimePaymentsOn) {
    put("dueDate", validateDueDate(form.payments.dueDate));
    put("amount", validateLeaseNumber("amount", form.payments.amount, locale));
    if (form.showSecondPayment) {
      put("dueDate2", validateDueDate(form.payments.dueDate2));
      put("amount2", validateLeaseNumber("amount", form.payments.amount2, locale));
    }
    if (form.showThirdPayment) {
      put("dueDate3", validateDueDate(form.payments.dueDate3));
      put("amount3", validateLeaseNumber("amount", form.payments.amount3, locale));
    }
  }
  return e;
}

/* ════════════════════════════════════════════════════════════ hint and warning ══ */

/**
 * `lbl_LandLease_RightPanel_NewEditPeriod_BodyButtons_Hint_1.Visible` (LL:5963) — and it is
 * one of the fifteen labels the Save gate requires to be hidden, so this is a hard block.
 *
 * On a NEW contract or on Period 1 the one-time payment counts as a commercial figure, so
 * filling only the payment satisfies it. On period 2+ only the five rates count — a period
 * cannot be created that carries nothing.
 */
export function hintVisible(args: {
  form: LandLeaseForm;
  selectedCost: { id: string } | null | undefined;
  selectedPeriod: Pick<LeasePeriodRow, "period"> | null | undefined;
}): boolean {
  const { form } = args;
  const noRates = !formHasAnyRate(form);
  if (!args.selectedCost || isPeriodOne(args.selectedPeriod?.period ?? null)) {
    return noRates
      && isBlankValue(form.payments.amount)
      && isBlankValue(form.payments.dueDate);
  }
  return noRates;
}

/**
 * `con_LandLease_WarningOnSaveWithCost.Visible` (LL:5802) — the "additional periods exist"
 * refusal.
 *
 * `If(Or(any rate typed in the FORM), false,
 *     If(And(Or(any rate STORED on the selected period), selected.Period < last.Period),
 *        true, false))`
 *
 * In words: you are clearing every rate off a period that HAD rates and is not the last one in
 * its chain. The chain's economics would then start at a period that carries nothing, so the
 * canvas refuses and tells you to delete the later periods first.
 */
export function additionalPeriodsWarningVisible(args: {
  form: LandLeaseForm;
  selectedPeriod: LeasePeriodRow | null | undefined;
  contract: LeaseContract | null | undefined;
}): boolean {
  if (formHasAnyRate(args.form)) return false;
  const p = args.selectedPeriod;
  if (!p || !periodHasAnyRate(p)) return false;
  const last = args.contract ? lastPeriod(args.contract) : null;
  if (!last) return false;
  return periodNumber(p.period) < periodNumber(last.period);
}

/* ══════════════════════════════════════════════════════════════════ save gate ══ */

/**
 * `pcf_LandLease_RightPanel_NewEditPeriod_BodyButtons_Save_1.DisplayMode` — 151 lines in the
 * canvas (LL:5880; reformatted and technology-gated at PA:5876).
 *
 * Every clause, in the canvas' own order:
 *   A  the description box is not blank;
 *   B  all fifteen named error labels are hidden — the five rates, the six payment fields,
 *      inflation start year, inflation profile, the "at least one commercial figure" hint and
 *      the reserved-word description error;
 *   C  inflation on  ⇒ a start year is entered;
 *   D  Italy + both inflation toggles ⇒ an Area is chosen;
 *   E  inflation on and country inflation OFF ⇒ a custom percentage is entered;
 *   F  one-time payment ON ⇒ payment 1's date and amount are both filled — and NOTHING ELSE
 *      is required; otherwise the period block is required: both duration dropdowns chosen,
 *      not both zero, distribution frequency chosen, and (PV/Wind only) aggregation chosen
 *      and at least one generator selected;
 *   G  the 2nd payment block, if shown, is complete;
 *   H  the 3rd payment block, if shown, is complete;
 *   I  one-time payment ON **and** some rate typed ⇒ the period block is required after all;
 *      otherwise, if this is a new period on an existing contract, the period block is still
 *      required; otherwise nothing;
 *   J  the additional-periods warning is not showing.
 *
 * SOURCE DEFECT LL-D7: clause F's true arm is the whole story. A brand-new contract with the
 * one-time payment toggle on and no rate typed can be saved with NO duration, NO aggregation,
 * NO distribution frequency and NO allocation, writing a `Land Lease Periods` row that is
 * blank in every economic column. Clause I is the canvas' own partial patch for it — it
 * re-imposes the period block as soon as any rate is typed, and again for a new period on an
 * existing contract, but never for the first period of a payment-only contract. Reproduced
 * exactly, because refusing that save would block a shape the live app permits and the live
 * data may already contain.
 *
 * SKELETON DIVERGENCE: the skeleton's `canSaveLandLease` is five lines — description non-blank
 * plus the numeric validators. It has no clause C through J, so it offers Save on a form the
 * canvas refuses (missing duration, missing frequency, empty allocation, the additional-periods
 * warning) and refuses none of them. Canvas followed.
 */
export interface LeaseSaveContext {
  form: LandLeaseForm;
  selectedCost: { id: string } | null | undefined;
  selectedPeriod: LeasePeriodRow | null | undefined;
  contract: LeaseContract | null | undefined;
  panelState: "New" | "Edit";
  technology: number | null;
  countryName: string | null;
  locale?: string;
}

/** Clause F/I's inner block, which the canvas repeats verbatim three times. */
function periodBlockComplete(form: LandLeaseForm, technology: number | null): boolean {
  if (form.durationMonths === null || form.durationYears === null) return false;
  if (form.durationYears === 0 && form.durationMonths === 0) return false;
  if (allocationVisible(technology)) {
    if (form.aggregation === null) return false;
    if (form.allocatedGeneratorIds.length === 0 && !form.allWtgAllocated) return false;
  }
  if (form.distributionFrequency === null) return false;
  return true;
}

export function canSaveLandLease(args: LeaseSaveContext): boolean {
  const { form, locale } = args;

  // A — `Not(IsBlank(txt_…_Description_1.Value))`. NOT trimmed in the canvas.
  if (isBlankValue(form.description)) return false;

  // B — every error label hidden.
  if (Object.keys(leaseFieldErrors(form, locale)).length > 0) return false;
  if (hintVisible({
    form, selectedCost: args.selectedCost, selectedPeriod: args.selectedPeriod,
  })) return false;

  // C, D, E — inflation.
  if (form.inflationChecked) {
    if (isBlankValue(form.inflationStartYear)) return false;
    if (args.countryName === "Italy" && form.countryInflationChecked
      && isBlankValue(form.inflationCountryArea)) return false;
    if (!form.countryInflationChecked && isBlankValue(form.inflationProfile)) return false;
  }

  // F.
  if (form.oneTimePaymentsOn) {
    if (isBlankValue(form.payments.dueDate) || isBlankValue(form.payments.amount)) return false;
  } else if (!periodBlockComplete(form, args.technology)) {
    return false;
  }

  // G, H.
  if (form.showSecondPayment
    && (isBlankValue(form.payments.dueDate2) || isBlankValue(form.payments.amount2))) return false;
  if (form.showThirdPayment
    && (isBlankValue(form.payments.dueDate3) || isBlankValue(form.payments.amount3))) return false;

  // I.
  if (form.oneTimePaymentsOn && formHasAnyRate(form)) {
    if (!periodBlockComplete(form, args.technology)) return false;
  } else if (args.selectedCost && !args.selectedPeriod && args.panelState === "New") {
    if (!periodBlockComplete(form, args.technology)) return false;
  }

  // J.
  if (additionalPeriodsWarningVisible({
    form, selectedPeriod: args.selectedPeriod, contract: args.contract,
  })) return false;

  return true;
}

/* ═════════════════════════════════════════════════════════════════ write plans ══ */

/**
 * One Dataverse write, as data. `hooks.ts` turns these into requests; nothing here calls out.
 *
 * `ref` names a create whose new id later writes need. `parentRef` says "this payload needs
 * that id bound to `vsb_ProjectCost` before it is sent" — it is NOT an OData `$id` content
 * reference, because `dataClient.batch` is not a transactional changeset (CONVENTIONS rule 3)
 * and a `$<contentid>` bind would only resolve inside one. The caller must create the
 * referenced row first, then substitute. `bindParent` does the substitution.
 */
export type LeaseWrite =
  | {
    op: "create"; entitySet: string; payload: Record<string, unknown>;
    ref?: string; parentRef?: string;
  }
  | {
    op: "update"; entitySet: string; id: string; payload: Record<string, unknown>;
    parentRef?: string;
  }
  | { op: "delete"; entitySet: string; id: string };

/**
 * Resolve every `parentRef` against the ids the creates actually returned, and drop the
 * marker. A write whose ref has no id is returned unchanged so the caller can fail loudly
 * rather than silently POST a row with no parent.
 */
export function bindParent(
  writes: readonly LeaseWrite[],
  createdIds: Readonly<Record<string, string>>,
): LeaseWrite[] {
  return writes.map((w) => {
    if (w.op === "delete" || !w.parentRef) return w;
    const id = createdIds[w.parentRef];
    if (!id) return w;
    const { parentRef: _dropped, ...rest } = w;
    return {
      ...rest,
      payload: { ...w.payload, ...lookup(LEASE_BIND.projectCost, id) },
    } as LeaseWrite;
  });
}

const bind = (entitySet: string, id: string): string => `/${entitySet}(${id})`;

/** `"<NavProperty>@odata.bind": "/<entityset>(<guid>)"`, omitted entirely when the id is null. */
function lookup(
  spec: { nav: string; entitySet: string },
  id: string | null | undefined,
): Record<string, string> {
  return id ? { [`${spec.nav}@odata.bind`]: bind(spec.entitySet, id) } : {};
}

/**
 * The contract-header payload — `Patch('Land Lease Project Costs', …)` inside the Period-1
 * branch of `pcf_…_Save_1.OnChange` (LL:5895).
 *
 * Note two omissions that are the canvas', not ours: `'Land Owner'` is commented out at the
 * patch site, and `'Is Standard Contract?'` is never written here — only the standard import
 * sets it. So a hand-made contract's `vsb_isstandardcontract` stays at its Dataverse default.
 */
export function buildCostPayload(args: {
  form: LandLeaseForm;
  ctx: LeaseProjectContext;
  subaccountId: string;
  subaccountName: string;
  locale?: string;
}): Record<string, unknown> {
  const { form, ctx } = args;
  const payments = oneTimePaymentPayload(form.oneTimePaymentsOn, form.payments, args.locale);
  const num = (v: string) => parseNumber(v, args.locale) ?? null;

  return {
    [LEASE_COST_COL.name]: landLeaseCostName(
      ctx.projectName, args.subaccountName, form.description,
    ),
    [LEASE_COST_COL.description]: form.description,
    [LEASE_COST_COL.secured]: securedValue(form.securedChecked),
    [LEASE_COST_COL.allWtgAllocated]: form.allWtgAllocated,
    [LEASE_COST_COL.dueDate1]: payments.dueDate,
    [LEASE_COST_COL.amount1]: payments.amount,
    [LEASE_COST_COL.dueDate2]: payments.dueDate2,
    [LEASE_COST_COL.amount2]: payments.amount2,
    [LEASE_COST_COL.dueDate3]: payments.dueDate3,
    [LEASE_COST_COL.amount3]: payments.amount3,
    [LEASE_COST_COL.inflationCountryArea]: form.inflationCountryArea,
    [LEASE_COST_COL.inflationProfile]: num(form.inflationProfile),
    [LEASE_COST_COL.inflationStartYear]: num(form.inflationStartYear),
    [LEASE_COST_COL.useInflationProfile]: form.inflationChecked,
    [LEASE_COST_COL.useCountryInflationProfile]: form.countryInflationChecked,
    [LEASE_COST_COL.isStartDateStandardAssumption]: form.isStartDateStandardAssumption,
    ...lookup(LEASE_BIND.project, ctx.projectId),
    ...lookup(LEASE_BIND.subaccount, args.subaccountId),
    ...lookup(LEASE_BIND.currency, form.currencyId),
    // CONVENTIONS rule 6 / docs S-5 — the canvas binds it and so does every payload here.
    ...lookup(LEASE_BIND.owningBusinessUnit, ctx.owningBusinessUnitId),
  };
}

/**
 * The period payload — the unconditional `Patch('Land Lease Periods', …)` (LL:5895).
 *
 * It always writes all five rates, both duration parts, the start date, the aggregation and
 * the distribution frequency, even on a period 2+ edit, so a blank box CLEARS the stored
 * value. `Period` is only recomputed when the panel is in the `"New"` state; an edit keeps
 * the row's own period.
 */
export function buildPeriodPayload(args: {
  form: LandLeaseForm;
  ctx: LeaseProjectContext;
  costId: string | null;
  panelState: "New" | "Edit";
  parentPeriod: Pick<LeasePeriodRow, "period"> | null | undefined;
  selectedPeriod: Pick<LeasePeriodRow, "period"> | null | undefined;
  /** `false` reproduces the Period-9 wrap; the default applies the LL-D1 correction. */
  canvasParityPeriodWrap?: boolean;
  locale?: string;
}): Record<string, unknown> {
  const { form, ctx } = args;
  const num = (v: string) => parseNumber(v, args.locale) ?? null;
  const period = args.panelState === "New"
    ? (args.canvasParityPeriodWrap
      ? nextPeriodCanvasParity(args.parentPeriod?.period ?? null)
      : nextPeriod(args.parentPeriod?.period ?? null))
    : args.selectedPeriod?.period ?? null;

  return {
    [LEASE_PERIOD_COL.name]: form.description,
    [LEASE_PERIOD_COL.period]: period,
    [LEASE_PERIOD_COL.fixedCosts]: num(form.fixedCosts),
    [LEASE_PERIOD_COL.percentOfRevenues]: num(form.percentOfRevenues),
    [LEASE_PERIOD_COL.aggregation]: form.aggregation,
    [LEASE_PERIOD_COL.durationYears]: form.durationYears,
    [LEASE_PERIOD_COL.durationMonths]: form.durationMonths,
    [LEASE_PERIOD_COL.startDate]: form.startDate,
    [LEASE_PERIOD_COL.eurPerMwh]: num(form.eurPerMwh),
    [LEASE_PERIOD_COL.eurPerMw]: num(form.eurPerMw),
    [LEASE_PERIOD_COL.eurPerWtg]: num(form.eurPerWtg),
    [LEASE_PERIOD_COL.distributionFrequency]: form.distributionFrequency,
    ...lookup(LEASE_BIND.projectCost, args.costId),
    ...lookup(LEASE_BIND.owningBusinessUnit, ctx.owningBusinessUnitId),
  };
}

export function buildAllocationPayload(args: {
  ctx: LeaseProjectContext;
  cost: Pick<LeaseCostRow, "id" | "landOwner" | "description">;
  generator: Pick<GeneratorOption, "id" | "name">;
}): Record<string, unknown> {
  return {
    [LEASE_ALLOC_COL.name]: allocationName(
      args.cost.landOwner, args.cost.description, args.generator.name,
    ),
    ...lookup(LEASE_BIND.projectCost, args.cost.id),
    ...lookup(LEASE_BIND.generatorInProject, args.generator.id),
    // docs/01-BUGS-FOUND.md S-5 — this is the create the skeleton omits it on.
    ...lookup(LEASE_BIND.owningBusinessUnit, args.ctx.owningBusinessUnitId),
  };
}

/**
 * Rule 20 — the whole save, as an ordered list of writes.
 *
 * The canvas order matters and is preserved: header first (so a brand-new contract has an id
 * before anything binds to it), then the allocation upserts, then the allocation deletes, then
 * the period. The header and the allocation work run only when `writesContractHeader` says so.
 *
 * `costId` is null for a brand-new contract; the caller substitutes the created id into the
 * later writes, which is why the header create carries `ref: "cost"`.
 *
 * After the writes the canvas reloads both collections and CLEARS THE SELECTION
 * (`UpdateContext({locSelectedLandLeaseCost: Blank(), locSelectedLandLeasePeriod: Blank()})`,
 * LL:5895) — `clearsSelectionAfterSave`.
 */
export interface LeaseSavePlan {
  writes: LeaseWrite[];
  writesHeader: boolean;
  /** True when the period row is a create rather than an update. */
  createsPeriod: boolean;
}

export function planLeaseSave(args: {
  form: LandLeaseForm;
  ctx: LeaseProjectContext;
  subaccountId: string;
  subaccountName: string;
  selectedCost: LeaseCostRow | null;
  selectedPeriod: LeasePeriodRow | null;
  parentPeriod: LeasePeriodRow | null;
  existingAllocations: readonly LeaseAllocationRow[];
  generators: readonly GeneratorOption[];
  panelState: "New" | "Edit";
  canvasParityPeriodWrap?: boolean;
  locale?: string;
}): LeaseSavePlan {
  const writes: LeaseWrite[] = [];
  const isNewContract = args.selectedCost === null;
  const writesHeader = writesContractHeader(args.selectedPeriod, isNewContract);
  const costId = args.selectedCost?.id ?? null;

  if (writesHeader) {
    const payload = buildCostPayload({
      form: args.form,
      ctx: args.ctx,
      subaccountId: args.subaccountId,
      subaccountName: args.subaccountName,
      locale: args.locale,
    });
    if (costId) writes.push({ op: "update", entitySet: LEASE_ENTITY_SET.cost, id: costId, payload });
    else writes.push({ op: "create", entitySet: LEASE_ENTITY_SET.cost, payload, ref: "cost" });

    // The all-WTG toggle selects every generator; otherwise the picker's own selection wins.
    const selected = args.form.allWtgAllocated
      ? args.generators.map((g) => g.id)
      : args.form.allocatedGeneratorIds;
    const mine = args.existingAllocations.filter((a) => a.projectCostId === costId);
    const diff = diffAllocation(mine, selected);
    const costForName = {
      id: costId ?? "",
      landOwner: args.selectedCost?.landOwner ?? null,
      description: args.selectedCost?.description ?? args.form.description,
    };
    const byId = new Map(args.generators.map((g) => [g.id, g]));

    for (const id of diff.toCreate) {
      const generator = byId.get(id);
      if (!generator) continue;
      writes.push({
        op: "create",
        entitySet: LEASE_ENTITY_SET.allocation,
        payload: buildAllocationPayload({ ctx: args.ctx, cost: costForName, generator }),
        ...(costId ? {} : { parentRef: "cost" }),
      });
    }
    for (const row of diff.toUpdate) {
      const generator = byId.get(row.generatorInProjectId);
      if (!generator) continue;
      writes.push({
        op: "update",
        entitySet: LEASE_ENTITY_SET.allocation,
        id: row.id,
        payload: buildAllocationPayload({ ctx: args.ctx, cost: costForName, generator }),
      });
    }
    for (const id of diff.toDelete) {
      writes.push({ op: "delete", entitySet: LEASE_ENTITY_SET.allocation, id });
    }
  }

  const periodPayload = buildPeriodPayload({
    form: args.form,
    ctx: args.ctx,
    costId,
    panelState: args.panelState,
    parentPeriod: args.parentPeriod,
    selectedPeriod: args.selectedPeriod,
    canvasParityPeriodWrap: args.canvasParityPeriodWrap,
    locale: args.locale,
  });
  const selected = args.selectedPeriod;
  const createsPeriod = selected === null;
  if (selected === null) {
    writes.push({
      op: "create",
      entitySet: LEASE_ENTITY_SET.period,
      payload: periodPayload,
      ref: "period",
      ...(costId ? {} : { parentRef: "cost" }),
    });
  } else {
    writes.push({
      op: "update", entitySet: LEASE_ENTITY_SET.period, id: selected.id, payload: periodPayload,
    });
  }

  return { writes, writesHeader, createsPeriod };
}

/** `UpdateContext({locSelectedLandLeaseCost: Blank(), locSelectedLandLeasePeriod: Blank()})` (LL:5895). */
export const clearsSelectionAfterSave = true;

/* ═════════════════════════════════════════════════════════════ rule 18 · delete ══ */

export interface LeaseDeletePlan {
  kind: "period" | "contract";
  /** Deletes are emitted children-first, so an interrupted batch never orphans a row. */
  writes: LeaseWrite[];
  periodIds: string[];
  allocationIds: string[];
  costIds: string[];
}

/**
 * Rule 18 — the delete branches on the period NUMBER (LL:388, `"deleteLandLeasePeriodKey"`):
 * `locIsVisiblePopUpDeleteLandLeasePeriod: period.Period <> 'Period 1'`
 * `locIsVisiblePopUpDeleteLandLeaseCost:   period.Period  = 'Period 1'`
 *
 * Period 2+ removes only that `Land Lease Periods` row (LL:6041). Period 1 cascades
 * allocations, then every period of the contract, then the cost itself — that order, from
 * `cmp_…_DeleteLandLeaseCost.OnConfirm` (LL:6076-6087).
 */
export function planLeaseDelete(
  contract: LeaseContract,
  selectedPeriod: LeasePeriodRow,
  allocations: readonly LeaseAllocationRow[],
): LeaseDeletePlan {
  if (!isPeriodOne(selectedPeriod.period)) {
    return {
      kind: "period",
      writes: [{ op: "delete", entitySet: LEASE_ENTITY_SET.period, id: selectedPeriod.id }],
      periodIds: [selectedPeriod.id],
      allocationIds: [],
      costIds: [],
    };
  }
  const allocationIds = allocations
    .filter((a) => a.projectCostId === contract.cost.id)
    .map((a) => a.id);
  const periodIds = contract.periods.map((p) => p.id);
  const costIds = [contract.cost.id];
  return {
    kind: "contract",
    writes: [
      ...allocationIds.map((id): LeaseWrite =>
        ({ op: "delete", entitySet: LEASE_ENTITY_SET.allocation, id })),
      ...periodIds.map((id): LeaseWrite =>
        ({ op: "delete", entitySet: LEASE_ENTITY_SET.period, id })),
      ...costIds.map((id): LeaseWrite =>
        ({ op: "delete", entitySet: LEASE_ENTITY_SET.cost, id })),
    ],
    periodIds,
    allocationIds,
    costIds,
  };
}

/**
 * The two confirmation dialogs, verbatim.
 *
 * `cmp_LandLease_PopUpConfirmation_DeletePeriod` (LL:6024-6054):
 *   Title       `"Delete Period?"`
 *   Description `"Are you sure that you want to permanently delete " & period.Period &
 *                " expense in the """ & period.Name & """  Land Lease?"`
 *
 * `cmp_LandLease_PopUpConfirmation_DeleteLandLeaseCost` (LL:6058-6114):
 *   Title       `"Delete Land Lease?"`
 *   Description `"Are you sure that you want to permanently delete Land Lease """ &
 *                period.Name & """ and all related Periods?"`
 *
 * Both bodies interpolate the selected PERIOD, including the contract dialog — it names the
 * period, not the header's description. The period dialog carries a DOUBLE SPACE before
 * "Land Lease?"; that is the live app's own text and it is reproduced, not tidied.
 *
 * SKELETON DIVERGENCE: the skeleton has these as two fixed strings — "This deletes the
 * contract and all related Periods?" and "This deletes only the selected period." — neither of
 * which appears anywhere in the canvas. Invented. Canvas followed.
 */
export function deleteDialog(
  selectedPeriod: Pick<LeasePeriodRow, "period" | "name"> | null | undefined,
): { title: string; body: string; confirmLabel: string; cancelLabel: string } {
  const name = selectedPeriod?.name ?? "";
  if (isPeriodOne(selectedPeriod?.period ?? null)) {
    return {
      title: LEASE_MSG.deleteContractTitle,
      body: `Are you sure that you want to permanently delete Land Lease "${name}" and all related Periods?`,
      confirmLabel: LEASE_MSG.deleteConfirm,
      cancelLabel: LEASE_MSG.deleteCancel,
    };
  }
  return {
    title: LEASE_MSG.deletePeriodTitle,
    body: `Are you sure that you want to permanently delete ${
      periodLabel(selectedPeriod?.period)} expense in the "${name}"  Land Lease?`,
    confirmLabel: LEASE_MSG.deleteConfirm,
    cancelLabel: LEASE_MSG.deleteCancel,
  };
}

/* ═══════════════════════════════════════════════════════════════ command gates ══ */

export interface LeasePermissions {
  /** `DataSourceInfo('Land Lease Project Costs', CreatePermission)` (LL:220). */
  canCreateCost: boolean;
  /** `DataSourceInfo('Land Lease Periods', CreatePermission)` (LL:246). */
  canCreatePeriod: boolean;
  /** `RecordInfo(locSelectedLandLeasePeriod, EditPermission)` (LL:335). */
  canEditRecord: boolean;
  /** `RecordInfo(locSelectedLandLeasePeriod, DeletePermission)` (LL:355). */
  canDeleteRecord: boolean;
}

export type LeaseCommandKey = keyof typeof LEASE_COMMAND_LABELS;

export interface LeaseCommand {
  key: LeaseCommandKey;
  label: string;
  icon: "Add" | "Edit" | "Delete";
  enabled: boolean;
}

/**
 * `locSelectedLandLeaseCost.'Is Standard Contract?' = Yes` or
 * `StartsWith(locSelectedLandLeasePeriod.Name, "Standard")` — the pair the Add Period and Edit
 * gates both carry (LL:250, LL:340).
 */
export function isStandardLocked(
  contract: LeaseContract | null | undefined,
  period: Pick<LeasePeriodRow, "name"> | null | undefined,
): boolean {
  return Boolean(contract?.cost.isStandardContract)
    || Boolean(period && isStandardPeriodName(period.name));
}

/**
 * `pcf_con_LandLease_Content_Subaccounts_CardBody_SubaccountsCommandBar_1.Items` (LL:214).
 *
 * Five commands, one bar PER CARD, and every gate is card-scoped through
 * `locSelectedLandLeaseSubaccount.'Land Lease Subaccount' = ThisItem.'Land Lease Subaccount'`
 * — which is `isSelectedCard` below. Note the shapes differ: Add Period, Edit and Delete
 * require the card to BE the selected one; Add Contract Type only asks that IF it is the
 * selected card there is no period selected on it; Add Standard Contract is not scoped to the
 * selection at all.
 */
export interface LeaseCommandArgs {
  /** This card's sub-account id. */
  subaccountId: string;
  /** `locSelectedLandLeaseSubaccount.'Land Lease Subaccount' = ThisItem.…`. */
  isSelectedCard: boolean;
  selectedPeriod: LeasePeriodRow | null;
  selectedCost: LeaseCostRow | null;
  contract: LeaseContract | null;
  /** Every `Land Lease Project Costs` row for this project in THIS sub-account. */
  costsInSubaccount: readonly LeaseCostRow[];
  /** `Not(IsBlank(LookUp('OPEX & Land Lease Standard Assumptions', country+tech+Landlease+subaccount)))`. */
  hasMatchingAssumption: boolean;
  permissions: LeasePermissions;
  /** `false` reproduces the uncapped Period-9 wrap; the default applies the LL-D1 correction. */
  canvasParityPeriodWrap?: boolean;
}

export function leaseCommands(args: LeaseCommandArgs): LeaseCommand[] {
  const {
    isSelectedCard, selectedPeriod, selectedCost, contract, costsInSubaccount, permissions,
  } = args;

  const hasStandardInSubaccount = costsInSubaccount.some((c) => c.isStandardContract);
  const locked = Boolean(selectedCost?.isStandardContract)
    || Boolean(selectedPeriod && isStandardPeriodName(selectedPeriod.name));

  // "Add Contract Type" — LL:214. Create permission, nothing selected ON THIS CARD (other
  // cards' selections do not block it), and no standard contract already in this sub-account.
  const addContractType = permissions.canCreateCost
    && (isSelectedCard ? selectedPeriod === null : true)
    && !hasStandardInSubaccount;

  // "Add Period" — LL:241. Create permission on the PERIODS table, the cost is not standard,
  // the selected period's name does not start with "Standard", both a period and a cost are
  // selected, the card is the selected one, the selected period is the LAST by period number,
  // and Period 1 carries at least one rate.
  const isLastByPeriod = contract !== null && selectedPeriod !== null
    && lastPeriod(contract)?.id === selectedPeriod.id;
  const nextExists = args.canvasParityPeriodWrap === true
    ? true
    : nextPeriod(selectedPeriod?.period ?? null) !== null;
  const addPeriod = permissions.canCreatePeriod
    && !locked
    && selectedPeriod !== null
    && selectedCost !== null
    && isSelectedCard
    && isLastByPeriod
    && contract !== null
    && firstPeriodHasRate(contract)
    // The LL-D1 correction; `canvasParityPeriodWrap: true` restores the uncapped gate.
    && nextExists;

  // "Add Standard Contract" — LL:289. An assumption must exist for this country, technology,
  // `'Contract Types'.Landlease` and sub-account, AND the sub-account must hold no standard
  // contract, AND the sub-account must hold no cost AT ALL. The second clause is subsumed by
  // the third; reproduced anyway so the gate reads as the canvas does.
  const addStandardContract = args.hasMatchingAssumption
    && !hasStandardInSubaccount
    && costsInSubaccount.length === 0;

  // "Edit" — LL:329.
  const edit = selectedPeriod !== null
    && permissions.canEditRecord
    && isSelectedCard
    && !locked;

  // "Delete" — LL:349. For a period whose name lower-cases to "standard…", ONLY Period 1 may
  // be deleted. Otherwise Period 1, or the last period BY NAME (see `lastPeriodByName` and
  // defect LL-D4).
  const lastByName = contract ? lastPeriodByName(contract) : null;
  const deletable = selectedPeriod === null ? false
    : isStandardPeriodNameLower(selectedPeriod.name)
      ? isPeriodOne(selectedPeriod.period)
      : isPeriodOne(selectedPeriod.period) || lastByName?.id === selectedPeriod.id;
  const del = selectedPeriod !== null
    && permissions.canDeleteRecord
    && isSelectedCard
    && deletable;

  return [
    { key: "newLandLeaseContractKey", label: LEASE_COMMAND_LABELS.newLandLeaseContractKey, icon: "Add", enabled: addContractType },
    { key: "newLandLeasePeriodKey", label: LEASE_COMMAND_LABELS.newLandLeasePeriodKey, icon: "Add", enabled: addPeriod },
    { key: "AddLandLeaseStandardContractKey", label: LEASE_COMMAND_LABELS.AddLandLeaseStandardContractKey, icon: "Add", enabled: addStandardContract },
    { key: "EditLandLeasePeriodKey", label: LEASE_COMMAND_LABELS.EditLandLeasePeriodKey, icon: "Edit", enabled: edit },
    { key: "deleteLandLeasePeriodKey", label: LEASE_COMMAND_LABELS.deleteLandLeasePeriodKey, icon: "Delete", enabled: del },
  ];
}

/** A keyed view of `leaseCommands`, for a screen that wants one gate at a time. */
export function leaseCommandGates(args: LeaseCommandArgs): Record<LeaseCommandKey, boolean> {
  const out = {} as Record<LeaseCommandKey, boolean>;
  for (const c of leaseCommands(args)) out[c.key] = c.enabled;
  return out;
}

/* ══════════════════════════════════════════════════ rules 13-17 · standard load ══ */

/**
 * The server-side filter the import needs — `Filter('OPEX & Land Lease Standard Assumptions',
 * And(Country.Country = …, Technology = …, 'Type Of Contract' = 'Contract Types'.Landlease,
 * 'Land Lease Subaccount'.'Land Lease Subaccount' = ThisItem.…))`, sorted by `Description`
 * ascending (LL:388).
 *
 * Returned as data so `hooks.ts` can turn it into one `$filter` instead of materialising the
 * table — see "WHAT IS NOT PORTED" at the top.
 */
export interface LeaseAssumptionQuery {
  countryId: string | null;
  technology: number | null;
  typeOfContract: number;
  subaccountId: string;
  orderBy: "description asc";
}

export function leaseAssumptionQuery(
  ctx: Pick<LeaseProjectContext, "countryId" | "technology">,
  subaccountId: string,
): LeaseAssumptionQuery {
  return {
    countryId: ctx.countryId,
    technology: ctx.technology,
    typeOfContract: TYPE_OF_CONTRACT.landlease,
    subaccountId,
    orderBy: "description asc",
  };
}

/**
 * Rule 14 — the enumeration bridge. `'Opex & Land Lease Period'` has TEN values,
 * `'Land Lease Period'` has nine (both verified against the org), so `Period 10` falls to the
 * `Switch`'s default arm, `'Land Lease Period'.'Period 1'` (LL:388).
 *
 * This is the SAME defect shape as LL-D1 and the same default: an assumption set that runs to
 * ten periods silently produces a second Period 1. Reproduced here because the import must
 * match what the live app has already written; `mapAssumptionPeriodStrict` returns null so a
 * caller can refuse instead.
 */
export function mapAssumptionPeriod(assumptionPeriod: number): number {
  const i = OPEX_PERIOD_VALUES.indexOf(assumptionPeriod);
  if (i < 0 || i > 8) return LAND_LEASE_PERIOD.period1;
  return PERIOD_VALUES[i] ?? LAND_LEASE_PERIOD.period1;
}

export function mapAssumptionPeriodStrict(assumptionPeriod: number): number | null {
  const i = OPEX_PERIOD_VALUES.indexOf(assumptionPeriod);
  if (i < 0 || i > 8) return null;
  return PERIOD_VALUES[i] ?? null;
}

/**
 * `Switch(assumption.Aggregation, 'Opex Aggregation'.MAX, 'Land Lease Aggregation'.MAX, … )`
 * (LL:388). Verified against the org: both option sets use SUM 952850000, MAX 952850001,
 * MIN 952850002, so the mapping is the identity — but a value outside those three falls to no
 * arm and writes `Blank()`, which the identity would not. Reproduced.
 */
export function mapAggregation(opexAggregation: number | null | undefined): number | null {
  if (opexAggregation === LAND_LEASE_AGGREGATION.max) return LAND_LEASE_AGGREGATION.max;
  if (opexAggregation === LAND_LEASE_AGGREGATION.min) return LAND_LEASE_AGGREGATION.min;
  if (opexAggregation === LAND_LEASE_AGGREGATION.sum) return LAND_LEASE_AGGREGATION.sum;
  return null;
}

/**
 * `If(assumption.Secured = Yes, 'Land Lease Secured'.Yes, 'Land Lease Secured'.No)` (LL:388).
 * The assumptions table's `vsb_secured` is a Two Option (0/1); the cost's is a choice.
 */
export const mapSecured = (secured: boolean): number =>
  secured ? LAND_LEASE_SECURED.yes : LAND_LEASE_SECURED.no;

/** Both sides are Two Options, verified — the mapping is the identity. */
export const mapAllWtgAllocated = (allWtg: boolean): boolean => allWtg;

/**
 * Rule 15 — the import rounds money THROUGH TEXT: `Value(Text(x, "##0.00"))` for the three
 * one-time payments and `Value(Text(x, "#0.00"))` for `Fixed Costs` (LL:388). Both are a
 * two-decimal normalisation; the difference between `##0` and `#0` is leading-zero padding,
 * which `Value` then discards.
 */
export function roundTwoDecimals(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return round(value, 2);
}

/**
 * Rule 17 — the import's inflation profile (LL:388, the `'Inflation Profile'` Switch):
 *   both toggles on  → the `Country Inflation Profiles` row for (country, COD year + 1);
 *   inflation on, country off → the assumption's own profile;
 *   otherwise → `Blank()`.
 */
export function resolveStandardInflationProfile(
  assumption: Pick<LeaseAssumptionRow,
    "useInflationProfile" | "useCountryInflationProfile" | "inflationProfile">,
  countryProfile: number | null,
): number | null {
  if (!assumption.useInflationProfile) return null;
  return assumption.useCountryInflationProfile ? countryProfile : assumption.inflationProfile ?? null;
}

/** Rule 16 — allocate every generator when the assumption says so (LL:388). */
export const planStandardAllocation = (
  allWtgAllocated: boolean,
  generators: readonly GeneratorOption[],
): string[] => (allWtgAllocated ? generators.map((g) => g.id) : []);

/** The stamp every imported contract carries (LL:388). */
export const LEASE_STANDARD_STAMP = {
  isStandardContract: true,
  isStartDateStandardAssumption: true,
} as const;

/**
 * Rule 13 — the chained period start dates (LL:388, `recStartDate`).
 *
 * `Switch(assumption.Period, 'Period 1', COD,
 *   DateAdd(Last(Sort(colLoadLandLeasePeriods, Period, Asc)).'Start Date',
 *           Last(...).years * 12 + Last(...).months, Months))`
 *
 * `colLoadLandLeasePeriods` is wiped by `RemoveIf(..., true)` every time a Period-1 row comes
 * round, so the chain restarts at each Period 1 and the accumulator only ever holds one
 * contract's periods.
 *
 * SOURCE DEFECT LL-D8 / SKELETON DIVERGENCE: the `ForAll` walks
 * `recSortedCountryTechnologyStandardAssumptions`, which is sorted by **Description**
 * ascending, not by Period. The chain therefore consumes the assumptions in alphabetical
 * order while computing "the previous period" by sorting the accumulator by Period — so an
 * assumption set whose descriptions do not happen to sort in period order produces start dates
 * chained off the wrong predecessor, and a set whose alphabetically-first row is not Period 1
 * never resets the accumulator at all. Reproduced here: `standardPeriodStarts` consumes the
 * rows in the order given. The skeleton instead sorts by period first, which quietly repairs
 * the defect and produces different dates from the live app; the caller can get that behaviour
 * by sorting before the call, which is why it is not done inside.
 */
export function standardPeriodStarts(
  codDate: string | null,
  assumptionsInDescriptionOrder: readonly Pick<
    LeaseAssumptionRow, "id" | "period" | "durationYears" | "durationMonths"
  >[],
): { id: string; period: number; startDate: string | null }[] {
  const out: { id: string; period: number; startDate: string | null }[] = [];
  // The accumulator, mirroring `colLoadLandLeasePeriods`.
  let chain: { period: number; startDate: string | null; months: number }[] = [];

  for (const a of assumptionsInDescriptionOrder) {
    if (a.period === OPEX_LAND_LEASE_PERIOD.period1) chain = [];

    let startDate: string | null;
    if (a.period === OPEX_LAND_LEASE_PERIOD.period1) {
      startDate = codDate;
    } else {
      const sorted = [...chain].sort((x, y) => x.period - y.period);
      const prev = sorted[sorted.length - 1];
      startDate = prev?.startDate ? addMonths(prev.startDate, prev.months) : null;
    }
    const months = (a.durationYears ?? 0) * 12 + (a.durationMonths ?? 0);
    chain.push({ period: a.period, startDate, months });
    out.push({ id: a.id, period: a.period, startDate });
  }
  return out;
}

/**
 * The full standard-contract import, as an ordered write plan —
 * `pcf_…_SubaccountsCommandBar_1.OnSelect`, the `"AddLandLeaseStandardContractKey"` arm
 * (LL:388).
 *
 * The canvas shape, preserved:
 *   0. refuse entirely when the sub-account already holds a standard contract
 *      (`If(CountRows(recFilteredStandardContractsForProject) = 0, …)`);
 *   1. one `Land Lease Project Costs` row per Period-1 assumption — the HEADER;
 *   2. for each header whose assumption says `AllWTGAllocated`, one
 *      `Land Lease Allocation WTGS` row per generator in the project;
 *   3. one `Land Lease Periods` row per assumption — ALL of them, Period 1 included — with
 *      the chained start date.
 *
 * SOURCE DEFECT LL-D9: step 2's `Name` is
 * `recLandLeaseContractCost.'Land Owner' & "-" & assumption.Description & "-" & generator.Name`,
 * and the header the import just built never sets `'Land Owner'`. Every imported allocation
 * row therefore has a leading hyphen. VERIFIED in live data:
 * `"-Standard LL Locations-WTG 111_1"`. Reproduced.
 *
 * SOURCE DEFECT LL-D10: step 2's `LookUp(colLandLeaseStandardAssumptionContract,
 * 'Land Lease Subaccount'.'Land Lease Subaccount' = …)` names a column that is `Subaccount` on
 * `Land Lease Project Costs` — the sibling loop at the same nesting depth uses
 * `Subaccount.'Land Lease Subaccount'`. Here the lookup is done on the sub-account id either
 * way, which is what both spellings intend.
 */
export interface LeaseStandardImportPlan {
  /** Empty when the import is refused because a standard contract already exists. */
  writes: LeaseWrite[];
  refused: boolean;
  costCount: number;
  periodCount: number;
  allocationCount: number;
}

export function planStandardImport(args: {
  ctx: LeaseProjectContext;
  subaccountId: string;
  subaccountName: string;
  /** Sorted by `description` ascending, as the canvas sorts them. */
  assumptions: readonly LeaseAssumptionRow[];
  /** Every `Land Lease Project Costs` row already in this sub-account for this project. */
  existingCostsInSubaccount: readonly LeaseCostRow[];
  generators: readonly GeneratorOption[];
  /** The `Country Inflation Profiles` value for (country, COD year + 1), or null. */
  countryInflationProfile: number | null;
}): LeaseStandardImportPlan {
  const { ctx } = args;
  const empty: LeaseStandardImportPlan = {
    writes: [], refused: true, costCount: 0, periodCount: 0, allocationCount: 0,
  };
  // Step 0 — `CountRows(recFilteredStandardContractsForProject) = 0`.
  if (args.existingCostsInSubaccount.some((c) => c.isStandardContract)) return empty;

  const writes: LeaseWrite[] = [];
  const codYear = inflationStartYearFromCod(ctx.codDate);
  const headers = args.assumptions.filter((a) => a.period === OPEX_LAND_LEASE_PERIOD.period1);

  let allocationCount = 0;
  headers.forEach((a, i) => {
    const ref = `cost-${i}`;
    writes.push({
      op: "create",
      entitySet: LEASE_ENTITY_SET.cost,
      ref,
      payload: {
        [LEASE_COST_COL.name]:
          landLeaseCostName(ctx.projectName, a.subaccountName || args.subaccountName, a.name),
        [LEASE_COST_COL.description]: a.description,
        [LEASE_COST_COL.dueDate1]: a.dueDateOneTimePayment,
        [LEASE_COST_COL.amount1]: roundTwoDecimals(a.amountOneTimePayment),
        [LEASE_COST_COL.dueDate2]: a.dueDateOneTimePayment2,
        [LEASE_COST_COL.amount2]: roundTwoDecimals(a.amountOneTimePayment2),
        [LEASE_COST_COL.dueDate3]: a.dueDateOneTimePayment3,
        [LEASE_COST_COL.amount3]: roundTwoDecimals(a.amountOneTimePayment3),
        [LEASE_COST_COL.secured]: mapSecured(a.secured),
        [LEASE_COST_COL.allWtgAllocated]: mapAllWtgAllocated(a.allWtgAllocated),
        [LEASE_COST_COL.useInflationProfile]: a.useInflationProfile,
        [LEASE_COST_COL.useCountryInflationProfile]: a.useCountryInflationProfile,
        [LEASE_COST_COL.inflationCountryArea]: a.inflationCountryArea,
        [LEASE_COST_COL.inflationProfile]:
          resolveStandardInflationProfile(a, args.countryInflationProfile),
        [LEASE_COST_COL.inflationStartYear]: codYear,
        [LEASE_COST_COL.isStartDateStandardAssumption]:
          LEASE_STANDARD_STAMP.isStartDateStandardAssumption,
        [LEASE_COST_COL.isStandardContract]: LEASE_STANDARD_STAMP.isStandardContract,
        ...lookup(LEASE_BIND.project, ctx.projectId),
        ...lookup(LEASE_BIND.subaccount, a.subaccountId ?? args.subaccountId),
        ...lookup(LEASE_BIND.currency, a.currencyId),
        ...lookup(LEASE_BIND.owningBusinessUnit, ctx.owningBusinessUnitId),
      },
    });

    if (a.allWtgAllocated) {
      for (const g of args.generators) {
        allocationCount += 1;
        writes.push({
          op: "create",
          entitySet: LEASE_ENTITY_SET.allocation,
          parentRef: ref,
          payload: {
            // LL-D9 — the land owner is never set by the import, so this leads with "-".
            [LEASE_ALLOC_COL.name]: allocationName(null, a.description, g.name),
            ...lookup(LEASE_BIND.generatorInProject, g.id),
            ...lookup(LEASE_BIND.owningBusinessUnit, ctx.owningBusinessUnitId),
          },
        });
      }
    }
  });

  // Step 3 — one period per assumption, in the canvas' Description order.
  const starts = standardPeriodStarts(ctx.codDate, args.assumptions);
  const startById = new Map(starts.map((s) => [s.id, s.startDate]));
  const headerRefBySubaccount = new Map<string, string>();
  headers.forEach((a, i) => {
    headerRefBySubaccount.set(a.subaccountId ?? args.subaccountId, `cost-${i}`);
  });

  for (const a of args.assumptions) {
    const ref = headerRefBySubaccount.get(a.subaccountId ?? args.subaccountId);
    writes.push({
      op: "create",
      entitySet: LEASE_ENTITY_SET.period,
      ...(ref ? { parentRef: ref } : {}),
      payload: {
        [LEASE_PERIOD_COL.name]: a.description,
        [LEASE_PERIOD_COL.period]: mapAssumptionPeriod(a.period),
        [LEASE_PERIOD_COL.fixedCosts]: roundTwoDecimals(a.fixCosts),
        [LEASE_PERIOD_COL.aggregation]: mapAggregation(a.aggregation),
        [LEASE_PERIOD_COL.durationYears]: a.durationYears,
        [LEASE_PERIOD_COL.durationMonths]: a.durationMonths,
        [LEASE_PERIOD_COL.eurPerMwh]: a.eurPerMwh,
        [LEASE_PERIOD_COL.eurPerMw]: a.eurPerMw,
        [LEASE_PERIOD_COL.eurPerWtg]: a.eurPerWtg,
        [LEASE_PERIOD_COL.distributionFrequency]: a.distributionFrequency,
        [LEASE_PERIOD_COL.startDate]: startById.get(a.id) ?? null,
        [LEASE_PERIOD_COL.percentOfRevenues]: a.percentOfRevenues,
        ...lookup(LEASE_BIND.owningBusinessUnit, ctx.owningBusinessUnitId),
      },
    });
  }

  return {
    writes,
    refused: false,
    costCount: headers.length,
    periodCount: args.assumptions.length,
    allocationCount,
  };
}
