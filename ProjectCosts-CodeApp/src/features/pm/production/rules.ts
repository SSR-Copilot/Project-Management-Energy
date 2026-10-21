/**
 * Project Production Screen — every business rule as a pure function (redeveloped and connected
 * 19 Oct 2026, D28).
 *
 * Canvas screen: `Project Production Screen.pa.yaml` (PM app, solution 1.21.709), cited `Y:<line>`.
 *
 * Energy-yield assessments for one project. A gallery lists the project's `Energy Yields`; one
 * command bar (`pcf_ProjectRevenues_Content_ContractCommandBar_1`) adds, edits, deletes, activates
 * and deactivates them through one of two near-identical right panels — WTG (wind speed) and PV
 * (irradiation). Three radio pairs decide which side of each relationship the user types and which
 * side is derived. Two toggles attach a 12-month seasonality profile and a 15-year negative-price
 * curve. Every write path ends with the hidden `btn_Load_StandardContracts_For_Project` ("Recalc",
 * Y:8014-9119): the project roll-up and — once per project — the standard OPEX / Land Lease
 * contracts, then four flags the CAPEX / BoP plugins pick up.
 *
 * WHAT IS GONE
 *  - The two 300-line panels: one panel parameterised by technology (`deriveYieldView`).
 *  - The revenue synchronisation the canvas repeats four times: one `syncRevenueNegativePrices`.
 *  - `colProductionFormValidation`: its `Dirty` flag is never set true anywhere in the canvas, so the
 *    leave confirmation it guards never shows (SOURCE DEFECT, see `LEAVE_DIALOG`).
 *  - `btn_Seasonality_NegativePrice_Reset_Hidden` (Y:51): a state reset, done by the screen.
 *  - `Mid(Text(1.1, "0.0", Language()), 2, 1)`: `decimalSeparator(lang)`.
 *
 * FLOWS — none is called. `SynchroniseRecalculationCapexStandardCost` and its `Fabric Sync Jobs`
 * insert sit inside a `/* … *\/` block (Y:9062-9081); the live canvas writes the four flags
 * instead (`markForCapexRecalculationFields`). The flag write fires the async plugins
 * InitialP50StandardCapexContractCreate / InitialP50StandardBOPContractsCreate / InitialCapexCostsCreate
 * on the server (`04-flow-inventory.md`); the app never does their work.
 *
 * SOURCE DEFECTS fixed here (each with its canvas twin and a test — D28):
 *  1. The PV uncertainty range is 0…3000 ("Please select a value between 0 and 3 000."); the
 *     uncertainty is a percentage, so it is 0…100 like WTG (`validateUncertainty`, twin
 *     `validateUncertaintyCanvasParity`).
 *  2. The revenue sync read the yields BEFORE an External assessment superseded the Internals, so a
 *     contract could keep "Consider Negative Prices" on although no active yield used it
 *     (`planSaveYield` syncs against the post-supersede set; twin `revenueSyncYieldsCanvasParity`).
 *  3. Re-seeding the negative-price curve (toggle off → on, or a COD shift) left the stored years
 *     outside the new curve behind, and they came back on the next Edit (`planNegativePriceWrites`
 *     removes them; twin `planNegativePriceWritesCanvasParity`).
 *  4. Edit with "Consider Negative Prices" on but no stored rows kept whatever `colNegativePrices`
 *     held from the previous panel; the curve is seeded instead (`negativeRowsForEdit`).
 *  5. The seasonality "Total must match 100%" label compares the UNROUNDED float sum with 100, so
 *     twelve one-decimal months that do total 100 (8.1 + …) could show the error while Save was
 *     enabled; label and gate now both use `Round(total, 1)` (twin `seasonalityTotalErrorCanvasParity`).
 *  6. Other OPEX periods 3+ chain from the last period created for ANY subaccount (the canvas
 *     collection is never reset and is sorted by a column it never writes); they now chain within
 *     their own subaccount (`planStandardContracts(…, { otherOpexChain: "canvasParity" })` is the twin).
 *  7. The PV Save gate checks the Gross Yield error label only in "Input losses" mode, so an invalid
 *     gross yield could be saved in "Input Net Yield p50" mode; it is checked in both (as WTG).
 *  8. PV "Input Net Yield p50": the gross-yield and irradiation `OnChange` recompute the losses only
 *     when the LOSSES radio reads "Input Gross Yield" — a value it never has — so the losses went
 *     stale; they are derived from p50 and gross in both technologies.
 *  9. The status dialog kept the stale `locSelectedEnergyYield`, so after Activate the bar still
 *     offered Activate; the selection is by id and always reads the fresh row.
 * Reproduced and documented: WTG Total Losses shows "Please ensure Gross Yield > Net Yield p50" for
 * an out-of-range value (its own message is commented out, Y:3286); the Description error label is
 * a copy-paste with a blank `Visible` and never shows (Y:2837); the WTG "Each turbine" allocation is
 * unreachable (`rad_ProductionDataWTG_Allocation` is always View, default Whole plant — Y:3031).
 */
import {
  decimalSeparator, inRange, isBlank, isDecimalWithPlaces, isNumeric, parseNumber, pfxRound,
  type Lang,
} from "@/domain/powerFxNumeric";
import { addMonths } from "@/domain/dates";
import { p75, p90, NOT_COMPUTABLE } from "@/domain/yieldStats";
import { CHOICE_PRODUCTION, ES, ES_FINANCE, ES_PLANT, ES_PRODUCTION } from "@/data/dataverseNames";
import { bind, dateOnly } from "@/data/odata";
import { createdRowRef, type PlannedWrite, type WritePlan } from "@/data/writePlan";
import { textFormat } from "@/features/pm/generators/rules";

/* ═══════════════════════════════════════════════════════════════════ columns ════ */

/** `vsb_energyyield` logical names (`Vsb_energyyieldsModel`). */
export const YIELD_COL = {
  id: "vsb_energyyieldid",
  name: "vsb_name",
  project: "_vsb_project_value",
  description: "vsb_description",
  type: "vsb_type",
  assessment: "vsb_energyyieldassessment",
  allocation: "vsb_allocation",
  windSpeed: "vsb_windspeedathubheight",
  irradiation: "vsb_irradiationkwhkwp",
  grossYield: "vsb_grossyieldmwh",
  totalLosses: "vsb_totallosses",
  netYieldP50: "vsb_netyieldp50mwh",
  uncertainty: "vsb_uncertainty",
  netYieldP75: "vsb_netyieldp75mwh",
  netYieldP90: "vsb_netyieldp90mwh",
  /** Two-option booleans, not picklists (see `CHOICE_PRODUCTION`). */
  productionAllocation: "vsb_productionallocation",
  productionLossesP50: "vsb_productionlossesp50",
  productionUncertainty: "vsb_productionuncertaintyp75andp90",
  considerSeasonality: "vsb_considerseasonality",
  considerNegativePrices: "vsb_considernegativeprices",
  owningBusinessUnit: "_owningbusinessunit_value",
} as const;

/**
 * `vsb_pvseasonalityvalues`. Written by BOTH the WTG and the PV save through the same
 * `vsb_PVEnergyYield` lookup; the `PV` in the name is legacy (ambiguity 3).
 */
export const SEASONALITY_COL = {
  id: "vsb_pvseasonalityvaluesid",
  name: "vsb_name",
  energyYield: "_vsb_pvenergyyield_value",
  standardValuesJson: "vsb_standardvaluesjson",
  months: [
    "vsb_january", "vsb_february", "vsb_march", "vsb_april", "vsb_may", "vsb_june",
    "vsb_july", "vsb_august", "vsb_september", "vsb_october", "vsb_november",
    "vsb_december",
  ],
} as const;

/** `vsb_pvnegativeprices`. Shared with WTG — see `SEASONALITY_COL`. */
export const NEGATIVE_PRICE_COL = {
  id: "vsb_pvnegativepricesid",
  name: "vsb_name",
  energyYield: "_vsb_pvenergyyield_value",
  year: "vsb_year",
  reduction: "vsb_netyieldp50reduction",
  isStandard: "vsb_isstandardvalue",
} as const;

/** `vsb_projectrevenue` — only the two negative-price columns are touched here. */
export const REVENUE_COL = {
  id: "vsb_projectrevenueid",
  description: "vsb_description",
  considerNegativePrices: "vsb_considernegativeprices",
  manualOverride: "vsb_negativepricemanualoverride",
} as const;

/** `Projects` columns this screen reads and writes (`Vsb_projectsModel`). */
export const PROJECT_YIELD_COL = {
  id: "vsb_projectid",
  projectIdText: "vsb_name",
  projectName: "vsb_projectname",
  country: "_vsb_country_value",
  technology: "vsb_technology",
  totalCapacity: "vsb_totalcapacity",
  endDate: "vsb_enddate",
  cod: "vsb_operationsstartdatecod",
  owningBusinessUnit: "_owningbusinessunit_value",
  plantPvCapacity: "vsb_plantpvcapacitymwp",
  grossYield: "vsb_grossyieldmwh",
  windSpeed: "vsb_windspeedathubheight",
  netYieldP50: "vsb_netyieldp50",
  netYieldP75: "vsb_netyieldp75",
  netYieldP90: "vsb_netyieldp90",
  irradiation: "vsb_irradiationkwhkwp",
  standardCostCreated: "vsb_standardcostcreated",
  initialP50Trigger: "vsb_initialp50trigger",
  capexStandardContractsCreated: "vsb_capexstandardcontractscreated",
  capexStandardCostsCreated: "vsb_capexstandardcostscreated",
  bopStandardContractsCreated: "vsb_bopstandardcontractscreated",
} as const;

/** The navigation properties the writes bind (generated models' `…@odata.bind` keys). */
export const BIND = {
  project: "vsb_Project@odata.bind",
  energyYield: "vsb_PVEnergyYield@odata.bind",
  owner: "owningbusinessunit@odata.bind",
  subaccount: "vsb_Subaccount@odata.bind",
  currency: "vsb_Currency@odata.bind",
  projectCost: "vsb_ProjectCost@odata.bind",
  generatorInProject: "vsb_GeneratorInProject@odata.bind",
  deviceTypeInProject: "vsb_DeviceTypeInProject@odata.bind",
  parentCost: "vsb_ParentCost@odata.bind",
} as const;

/** `statecode` / `statuscode` of `Energy Yields` (`Vsb_energyyieldsstatecode` / `…statuscode`). */
export const YIELD_STATUS = {
  active: { statecode: 0, statuscode: 1 },
  inactive: { statecode: 1, statuscode: 2 },
} as const;

/* ═════════════════════════════════════════════════════════════════════ types ════ */

export type Technology = "WTG" | "PV";

export type AllocationInputMode = "Input Irradiation" | "Input Gross Yield";
export type LossesInputMode = "Input losses" | "Input Net Yield p50";
export type UncertaintyInputMode = "Input Uncertainty" | "Input Net Yield p75/p90";

export interface ProductionProject {
  id: string;
  projectIdText: string | null;
  projectName: string | null;
  countryId: string | null;
  technology: number | null;
  totalCapacity: number | null;
  endDate: string | null;
  /** `'Operations start date (COD)'`, `yyyy-mm-dd`. */
  cod: string | null;
  plantPvCapacity: number | null;
  /** The stored roll-up the summary tiles show (`gblRecordSelectedProject.*`). */
  grossYield: number | null;
  windSpeed: number | null;
  irradiation: number | null;
  netYieldP50: number | null;
  netYieldP75: number | null;
  netYieldP90: number | null;
  standardCostCreated: boolean;
  owningBusinessUnitId: string | null;
}

export interface EnergyYieldRow {
  id: string;
  name: string | null;
  description: string | null;
  type: number | null;
  assessment: number | null;
  allocation: number | null;
  windSpeed: number | null;
  irradiation: number | null;
  grossYield: number | null;
  totalLosses: number | null;
  netYieldP50: number | null;
  uncertainty: number | null;
  netYieldP75: number | null;
  netYieldP90: number | null;
  /** `'Production Allocation '` — true = Input Gross Yield. */
  productionAllocation: boolean | null;
  /** `'Production losses/p50?'` — true = Input Net Yield p50. */
  productionLossesP50: boolean | null;
  /** `'Production Uncertainty/ p75 and p90?'` — true = Input Net Yield p75/p90. */
  productionUncertainty: boolean | null;
  considerSeasonality: boolean | null;
  considerNegativePrices: boolean | null;
  /** `statecode` — 0 Active, 1 Inactive. */
  status: number;
}

/** One `colWTGSeasonalityValues` / `colPVSeasonalityValues` row. */
export interface SeasonalityRow {
  /** 1..12 — the canvas `ID`. */
  id: number;
  month: string;
  /** `Value` — kept when the typed text is not a number. */
  value: number | null;
  /** `TextValue` — what the cell shows and what is validated. */
  text: string;
  isStandard: boolean;
}

/** One `colNegativePrices` row. */
export interface NegativePriceRow {
  year: number;
  reductionValue: number;
  /** `ReductionTextValue`. */
  text: string;
  standardReductionValue: number;
  /** `StandardAssumption` — the italic "calculated default" flag that is stored. */
  standardAssumption: boolean;
  /** Whether the Fabric standard had a value for the year (what the per-year reset restores). */
  hasStandard: boolean;
}

export interface RevenueRow {
  id: string;
  description: string | null;
  considerNegativePrices: boolean;
  manualOverride: boolean;
}

/** A parsed row of `Assumptions Revenues SQL` (Fabric), after the locale handling. */
export interface StandardSeasonalityRow { month: number; pv: number | null; wtg: number | null }
export interface StandardNegativePriceRow { year: number; pv: number | null; wind: number | null }

export interface StoredSeasonality {
  recordId: string | null;
  /** January…December, blank where the column is blank. */
  months: (number | null)[];
  standardValuesJson: string | null;
}

export interface StoredNegativePrice {
  id: string;
  year: number;
  reduction: number | null;
  isStandard: boolean;
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export const MONTH_KEYS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/* ═════════════════════════════════════════════════════════════════ formatting ════ */

/**
 * `Text(value, "<pattern>", Language())`: `textFormat` (the shared en-US port of the custom
 * patterns) with the separators swapped for a comma-decimal language.
 */
export function pfxText(value: number | null | undefined, pattern: string, lang: Lang = "en-US"): string {
  const en = textFormat(value, pattern);
  if (decimalSeparator(lang) === ".") return en;
  return en.replace(/[.,]/g, (c) => (c === "." ? "," : "."));
}

/** `Value(text)` — blank (null) for "" or a non-number, as `Value` returns blank / error ("7." is 7). */
export function valueOf(text: string, lang: Lang = "en-US"): number | null {
  const t = text.trim();
  const n = parseNumber(t.endsWith(decimalSeparator(lang)) ? t.slice(0, -1) : t, lang);
  return Number.isNaN(n) ? null : n;
}

/** `If(Int(x) = x, Text(x, intPattern), Text(x, decimalPattern))` — the summary tiles' formula. */
export const pfxTextIntOr = (
  value: number | null | undefined, intPattern: string, decimalPattern: string, lang: Lang = "en-US",
): string =>
  value === null || value === undefined ? "" :
    pfxText(value, Number.isInteger(value) ? intPattern : decimalPattern, lang);

/** The six summary tiles (`txt_Production_DisplayProject_Body_Form_*.Value`, Y:1178-1572). */
export function summaryValues(project: ProductionProject | null, lang: Lang = "en-US"): Record<
  "grossYield" | "windSpeed" | "irradiation" | "netP50" | "netP75" | "netP90", string
> {
  const p = project;
  return {
    grossYield: pfxTextIntOr(p?.grossYield, "###,###,###", "###,##0.0#", lang),
    windSpeed: p?.windSpeed === null || p?.windSpeed === undefined ? "" : pfxText(p.windSpeed, "#0.0##", lang),
    irradiation: pfxTextIntOr(p?.irradiation, "###,###,###", "###,##0.0##", lang),
    netP50: pfxTextIntOr(p?.netYieldP50, "###,###", "###,##0.0#", lang),
    netP75: pfxTextIntOr(p?.netYieldP75, "###,###", "###,##0.0#", lang),
    netP90: pfxTextIntOr(p?.netYieldP90, "###,###", "###,##0.0#", lang),
  };
}

/** A two-option column shown in a text box: the option label, `"No"` for blank where the canvas says so. */
const yesNo = (v: boolean | null): string => (v === true ? "Yes" : v === false ? "No" : "");

/** The expanded card's values (`txt_ProductionDetails_*.Value`, Y:1757-2229). */
export function detailValues(row: EnergyYieldRow, lang: Lang = "en-US"): Record<
  "description" | "grossYield" | "considerSeasonality" | "windOrIrradiation" | "netP50"
  | "considerNegativePrices" | "totalLosses" | "netP75" | "uncertainty" | "netP90", string
> {
  return {
    description: row.description ?? "",
    grossYield: pfxText(row.grossYield, "###,###", lang),
    // `Value: =ThisItem.'Consider Seasonality'` — the two-option label; blank stays blank.
    considerSeasonality: yesNo(row.considerSeasonality),
    windOrIrradiation: row.type === CHOICE_PRODUCTION.yieldType.wtg
      ? pfxText(row.windSpeed, "0.0#", lang)
      : pfxText(row.irradiation, "###,##0.0", lang),
    netP50: pfxText(row.netYieldP50, "###,###", lang),
    // `If(IsBlank('Consider Negative Prices'), "No", …)`.
    considerNegativePrices: row.considerNegativePrices === null ? "No" : yesNo(row.considerNegativePrices),
    totalLosses: pfxText(row.totalLosses, "0.0", lang),
    netP75: pfxText(row.netYieldP75, "###,###", lang),
    uncertainty: pfxText(row.uncertainty, "0.0", lang),
    netP90: pfxText(row.netYieldP90, "###,###", lang),
  };
}

export const yieldTypeLabel = (t: number | null): Technology | "" =>
  t === CHOICE_PRODUCTION.yieldType.wtg ? "WTG"
  : t === CHOICE_PRODUCTION.yieldType.pv ? "PV"
  : "";

export const assessmentLabel = (a: number | null): string =>
  a === CHOICE_PRODUCTION.yieldAssessment.external ? "External"
  : a === CHOICE_PRODUCTION.yieldAssessment.internal ? "Internal"
  : "";

/** `lbl_Production_CardHeader_LabelWithDescription.Text = $"Production - {Type} {Description}"` (Y:2272). */
export const productionRowLabel = (type: number | null, description: string | null): string =>
  `Production - ${yieldTypeLabel(type)} ${description ?? ""}`;

/** `lbl_Production_Status.Text = ThisItem.Status` — the statecode label. */
export const productionStatusLabel = (status: number): "Active" | "Inactive" =>
  status === 0 ? "Active" : "Inactive";

/* ══════════════════════════════════════════════════════════════════ page lock ════ */

export const PAGE_LOCK_TITLE =
  "This page is locked. To unlock it, please complete the following sections:";

/**
 * `con_Milestones_Page_LockMessage_2.Visible = Or(IsBlank('Project ID'), IsBlank('End Date'),
 * Or('Total Capacity' = 0, IsBlank('Total Capacity')))` (Y:312), with its three bullets.
 */
export function pageLock(project: ProductionProject | null): string[] {
  if (!project) return [];
  const bullets: string[] = [];
  if (isBlank(project.projectIdText)) bullets.push("• General");
  if (isBlank(project.endDate)) bullets.push("• Milestones");
  if (project.totalCapacity === 0 || project.totalCapacity === null) bullets.push("• Generator");
  return bullets;
}

export const isPageLocked = (p: ProductionProject | null): boolean =>
  p === null || pageLock(p).length > 0;

/* ═══════════════════════════════════════════════════════════════ command bar ════ */

export const PRODUCTION_COMMAND_KEYS = [
  "newProductionWTG", "newProductionPV", "editProductionWTG", "editProductionPV",
  "deleteProductionItem", "activateProdItem", "deactivateProdItem",
] as const;

export type ProductionCommandKey = (typeof PRODUCTION_COMMAND_KEYS)[number];

export interface CommandItemState { visible: boolean; enabled: boolean; label: string }

/** `pcf_ProjectRevenues_Content_ContractCommandBar_1.AccessibilityLabel` (Y:457). */
export const COMMAND_BAR_LABEL = "pcf_ProjectRevenues_Content_ContractCommandBar_1";

/**
 * The `Items` table (Y:465-514), one-for-one. Every item is
 * `And(gblCurrentUser.CanEditSelectedProject, 'Total Capacity' <> 0)`, and the whole bar is
 * `DisplayMode.Disabled` while the page lock shows (Y:458). With no selection, Activate and
 * Deactivate are both hidden (`!IsBlank(Status)`).
 */
export function commandBarState(ctx: {
  canEdit: boolean;
  project: ProductionProject | null;
  selected: EnergyYieldRow | null;
}): Record<ProductionCommandKey, CommandItemState> {
  const capacityOk = (ctx.project?.totalCapacity ?? 0) !== 0;
  const enabled = ctx.canEdit && capacityOk && !isPageLocked(ctx.project);
  const sel = ctx.selected;
  return {
    newProductionWTG: { visible: true, enabled, label: "Add Production WTG" },
    newProductionPV: { visible: true, enabled, label: "Add Production PV" },
    editProductionWTG: { visible: sel?.type === CHOICE_PRODUCTION.yieldType.wtg, enabled, label: "Edit" },
    editProductionPV: { visible: sel?.type === CHOICE_PRODUCTION.yieldType.pv, enabled, label: "Edit" },
    deleteProductionItem: { visible: sel !== null, enabled, label: "Delete" },
    activateProdItem: { visible: sel !== null && sel.status !== 0, enabled, label: "Activate Production" },
    deactivateProdItem: { visible: sel !== null && sel.status !== 1, enabled, label: "Deactivate Production" },
  };
}

/** `ItemIconName` of each command (Y:470-510). */
export const COMMAND_ICON = {
  newProductionWTG: "Add", newProductionPV: "Add", editProductionWTG: "Edit", editProductionPV: "Edit",
  deleteProductionItem: "Delete", activateProdItem: "ActivateOrders", deactivateProdItem: "DeactivateOrders",
} as const;

/**
 * `OnVisible` ends with `UpdateContext({locSelectedEnergyYield: First(colEnergyYieldsInProject)})`
 * (Y:42) and the delete confirm with the same (Y:9289): `undefined` means "the first row".
 * `null` is the blank selection the save / panel close leave (`btn_Seasonality_NegativePrice_Reset_Hidden`).
 */
export function selectedYield(yields: readonly EnergyYieldRow[], selectedId: string | null | undefined): EnergyYieldRow | null {
  if (selectedId === undefined) return yields[0] ?? null;
  if (selectedId === null) return null;
  return yields.find((y) => y.id === selectedId) ?? null;
}

/**
 * The card header (Y:2341-2440): the transparent button only SELECTS (clicking the selected card
 * does nothing); the chevron toggles the fold AND selects.
 */
export function onCardHeader(selectedId: string | null, rowId: string): string {
  return selectedId === rowId ? selectedId : rowId;
}

/**
 * `deactivateProdItem` / `deleteProductionItem` `OnSelect` (Y:1040-1076): the "can't be deleted /
 * deactivated" popup replaces the confirmation when the row is the project's last active yield and
 * removing it would drop the stored p50 to zero.
 */
export function blocksLastYieldRemoval(args: {
  project: ProductionProject | null;
  selected: EnergyYieldRow;
  yields: readonly EnergyYieldRow[];
}): boolean {
  const projectP50 = args.project?.netYieldP50 ?? 0;
  const rowP50 = args.selected.netYieldP50 ?? 0;
  return projectP50 - rowP50 === 0
    && args.yields.filter((y) => y.status === 0).length === 1
    && args.selected.status === 0;
}

/* ═════════════════════════════════════════════════════════════════ the panel form ════ */

/** `NEW` yields open with `locTotalLoses: 15` and `locUncertaintyValue: 10` (Y:560-600). */
export const NEW_YIELD_DEFAULTS = { totalLosses: 15, uncertainty: 10 } as const;

export interface YieldFormState {
  /** `'Yield Assessment'` value — Internal (200) by default (`Value = 200`, Y:2799). */
  assessment: number;
  description: string;
  windSpeed: string;
  irradiation: string;
  grossYield: string;
  totalLosses: string;
  netP50: string;
  uncertainty: string;
  netP75: string;
  netP90: string;
  allocationInput: AllocationInputMode;
  lossesInput: LossesInputMode;
  uncertaintyInput: UncertaintyInputMode;
  considerSeasonality: boolean;
  considerNegativePrices: boolean;
}

/** The radio defaults of a new yield (Y:3194-3206, 3531-3543, 5691-5703). */
export function newYieldForm(lang: Lang = "en-US"): YieldFormState {
  return {
    assessment: CHOICE_PRODUCTION.yieldAssessment.internal,
    description: "", windSpeed: "", irradiation: "", grossYield: "",
    totalLosses: pfxText(NEW_YIELD_DEFAULTS.totalLosses, "0.0", lang),
    netP50: "",
    uncertainty: pfxText(NEW_YIELD_DEFAULTS.uncertainty, "0.0", lang),
    netP75: "", netP90: "",
    allocationInput: "Input Gross Yield", lossesInput: "Input losses", uncertaintyInput: "Input Uncertainty",
    considerSeasonality: false, considerNegativePrices: false,
  };
}

/**
 * The stored radio modes (`DefaultSelectedItems`, Y:3194, 3531, 5691): a blank column reads as the
 * second option, exactly as the canvas `If(x = 'Input losses', "Input losses", "Input Net Yield p50")`.
 */
export function modesFromRow(row: EnergyYieldRow): Pick<YieldFormState, "allocationInput" | "lossesInput" | "uncertaintyInput"> {
  return {
    allocationInput: row.productionAllocation === CHOICE_PRODUCTION.productionAllocation.inputIrradiation
      ? "Input Irradiation" : "Input Gross Yield",
    lossesInput: row.productionLossesP50 === CHOICE_PRODUCTION.productionLossesP50.inputLosses
      ? "Input losses" : "Input Net Yield p50",
    uncertaintyInput: row.productionUncertainty === CHOICE_PRODUCTION.productionUncertainty.inputUncertainty
      ? "Input Uncertainty" : "Input Net Yield p75/p90",
  };
}

/** Edit: the panel fields' `Value` formulas for a stored yield (Y:2868-4020, 5623-6750). */
export function formFromRow(row: EnergyYieldRow, technology: Technology, lang: Lang = "en-US"): YieldFormState {
  return {
    ...modesFromRow(row),
    assessment: row.assessment ?? CHOICE_PRODUCTION.yieldAssessment.internal,
    description: row.description ?? "",
    windSpeed: pfxText(row.windSpeed, "0.0#", lang),
    irradiation: pfxText(row.irradiation, "##,##0.0", lang),
    grossYield: pfxText(row.grossYield, technology === "PV" ? "##,##0" : "##,###", lang),
    totalLosses: pfxText(row.totalLosses, "0.0", lang),
    netP50: pfxText(row.netYieldP50, "##,###", lang),
    uncertainty: pfxText(row.uncertainty, "0.0", lang),
    netP75: pfxText(row.netYieldP75, "##,###", lang),
    netP90: pfxText(row.netYieldP90, "##,###", lang),
    considerSeasonality: row.considerSeasonality === true,
    considerNegativePrices: row.considerNegativePrices === true,
  };
}

/** The losses radio `OnChange` (Y:3214-3230, 6040-6061): losses, p50 and gross start again (PV also irradiation). */
export function changeLossesMode(form: YieldFormState, mode: LossesInputMode, technology: Technology): YieldFormState {
  return {
    ...form, lossesInput: mode, totalLosses: "", netP50: "", grossYield: "",
    ...(technology === "PV" ? { irradiation: "" } : {}),
  };
}

/** The uncertainty radio `OnChange` (Y:3551-3560, 6339-6348): uncertainty, p75 and p90 blank. */
export const changeUncertaintyMode = (form: YieldFormState, mode: UncertaintyInputMode): YieldFormState =>
  ({ ...form, uncertaintyInput: mode, uncertainty: "", netP75: "", netP90: "" });

/** `rad_ProductionDataPV_Allocation.OnChange` (Y:5711-5718): the newly typed side starts at 0. */
export const changeAllocationMode = (form: YieldFormState, mode: AllocationInputMode, lang: Lang = "en-US"): YieldFormState =>
  mode === "Input Irradiation"
    ? { ...form, allocationInput: mode, irradiation: pfxText(0, "##,##0.0", lang) }
    : { ...form, allocationInput: mode, grossYield: pfxText(0, "##,##0", lang) };

/* ══════════════════════════════════════════════════════════════ yield maths ════ */

/**
 * p75 / p90 from `@/domain/yieldStats` (the `fn_Calculate_P75_P90` port, `Round(p50 + z·p50·u, 0)`).
 * The canvas `"-1"` sentinel becomes undefined; uncertainty is passed as a percentage.
 */
export function derivedP75(p50Value: string | number, uncertaintyPercent: string | number, lang: Lang = "en-US"): number | undefined {
  if (!isNumeric(p50Value, lang) || !isNumeric(uncertaintyPercent, lang)) return undefined;
  const v = p75(parseNumber(p50Value, lang), parseNumber(uncertaintyPercent, lang) / 100);
  return v === NOT_COMPUTABLE ? undefined : v;
}

export function derivedP90(p50Value: string | number, uncertaintyPercent: string | number, lang: Lang = "en-US"): number | undefined {
  if (!isNumeric(p50Value, lang) || !isNumeric(uncertaintyPercent, lang)) return undefined;
  const v = p90(parseNumber(p50Value, lang), parseNumber(uncertaintyPercent, lang) / 100);
  return v === NOT_COMPUTABLE ? undefined : v;
}

/** `locTotalLoses = (1 - NetYieldP50 / GrossYield) * 100` (Y:3115, 3427, 6238). */
export function totalLossesPct(grossYield: number | null | undefined, netP50: number | null | undefined): number | undefined {
  if (!grossYield) return undefined;
  return (1 - (netP50 ?? 0) / grossYield) * 100;
}

/**
 * `locNetYield50 = Gross × (1 − Losses / 100)` (WTG Y:3110, 3305; PV `Round(…, 0)` Y:5930). The
 * field shows it as `Text(…, "##,###")` and the save writes `Value` of that text, so both
 * technologies store the whole number.
 */
export function deriveNetP50(grossYield: number | null, totalLosses: number | null): number {
  return pfxRound((grossYield ?? 0) * (1 - (totalLosses ?? 0) / 100), 0);
}

/** `locGrossYield = Round('Plant PV Capacity [MWp]' × Irradiation, 0)` (Y:5791). */
export const grossFromIrradiation = (plantPvCapacity: number | null, irradiation: number | null): number =>
  pfxRound((plantPvCapacity ?? 0) * (irradiation ?? 0), 0);

/** What each panel field shows — the typed text, or the value the canvas derives into it. */
export interface YieldView {
  windSpeed: string;
  irradiation: string;
  grossYield: string;
  totalLosses: string;
  netP50: string;
  uncertainty: string;
  netP75: string;
  netP90: string;
}

/**
 * The derived fields of the open panel (the `OnChange` chains and `Value` formulas, Y:3107-4020,
 * 5788-6750), computed from the typed values rather than pushed through context variables.
 */
export function deriveYieldView(
  form: YieldFormState,
  technology: Technology,
  ctx: { plantPvCapacity: number | null; lang?: Lang },
): YieldView {
  const lang = ctx.lang ?? "en-US";
  let grossYield = form.grossYield;
  if (technology === "PV" && form.allocationInput === "Input Irradiation" && !isBlank(form.irradiation.trim())) {
    grossYield = pfxText(grossFromIrradiation(ctx.plantPvCapacity, valueOf(form.irradiation, lang)), "##,##0", lang);
  }
  let { totalLosses, netP50 } = form;
  if (form.lossesInput === "Input losses") {
    netP50 = isBlank(grossYield.trim()) && isBlank(totalLosses.trim())
      ? ""
      : pfxText(deriveNetP50(valueOf(grossYield, lang), valueOf(totalLosses, lang)), "##,###", lang);
  } else if (!isBlank(grossYield.trim()) && !isBlank(netP50.trim())) {
    const l = totalLossesPct(valueOf(grossYield, lang), valueOf(netP50, lang));
    totalLosses = l === undefined ? totalLosses : pfxText(l, "0.0", lang);
  }
  let { netP75, netP90 } = form;
  if (form.uncertaintyInput === "Input Uncertainty") {
    const a = derivedP75(netP50, form.uncertainty, lang);
    const b = derivedP90(netP50, form.uncertainty, lang);
    netP75 = a === undefined ? "" : pfxText(a, "##,###", lang);
    netP90 = b === undefined ? "" : pfxText(b, "##,###", lang);
  }
  return {
    windSpeed: form.windSpeed, irradiation: form.irradiation, grossYield, totalLosses, netP50,
    uncertainty: form.uncertainty, netP75, netP90,
  };
}

/** Which fields are typed (`DisplayMode.Edit`) and which carry the red asterisk. */
export interface FieldModes {
  /** The three radios are `DisplayMode.View` once the yield exists (Y:3209, 3546, 5706). */
  modesLocked: boolean;
  grossEditable: boolean; grossRequired: boolean;
  irradiationEditable: boolean; irradiationRequired: boolean;
  lossesEditable: boolean; lossesRequired: boolean;
  p50Editable: boolean; p50Required: boolean;
  uncertaintyEditable: boolean; uncertaintyRequired: boolean;
  p75p90Editable: boolean; p75p90Required: boolean;
}

export function fieldModes(form: YieldFormState, technology: Technology, editing: boolean): FieldModes {
  const losses = form.lossesInput === "Input losses";
  const unc = form.uncertaintyInput === "Input Uncertainty";
  const pvGross = form.allocationInput === "Input Gross Yield";
  return {
    modesLocked: editing,
    // WTG gross is always typed; PV only in "Input Gross Yield" (Y:5921).
    grossEditable: technology === "WTG" || pvGross,
    // WTG asterisk with "Input losses" (Y:3152); PV also needs "Input Gross Yield" (Y:5978).
    grossRequired: losses && (technology === "WTG" || pvGross),
    irradiationEditable: technology === "PV" && !pvGross,
    irradiationRequired: technology === "PV" && !pvGross,
    lossesEditable: losses, lossesRequired: losses,
    p50Editable: !losses, p50Required: !losses,
    uncertaintyEditable: unc, uncertaintyRequired: unc,
    p75p90Editable: !unc, p75p90Required: !unc,
  };
}

/** `MaxLength` of each panel field (Y:2864, 2954, 3106, 3301, 3419, 3626, 3793, 5787). */
export const MAX_LENGTH = {
  description: 50, windSpeed: 6, grossYield: 10, irradiation: 10,
  totalLosses: 6, netP50: 15, uncertainty: 6, netP75: 15, netP90: 15,
} as const;

/* ═════════════════════════════════════════════════════════════════ validation ════ */

/** Every user-facing message, verbatim from the canvas error labels. */
export const MSG = {
  /** `lbl_ProductionDataWTG_Error_WindSpeed.Text` (Y:2933). */
  windTwoDecimal: "Numeric value with maximum of two decimal",
  /** `lbl_ProductionDataWTG_Error_WindSpeed.Text` (Y:2941) — trailing space verbatim. */
  windRange: "Please enter value between 0 and 15 ",
  /** `lbl_ProductionDataWTG_Error_GrossYield.Text` (Y:3082) and `…NetYieldP50` (Y:3394). */
  integerWtg: "Numeric value without Decimal",
  /** `lbl_ProductionDataPV_Error_GrossYield.Text` (Y:5897) and `…NetYieldP50` (Y:6211) — lower-case d. */
  integerPv: "Numeric value without decimal",
  /** `lbl_ProductionData{WTG|PV}_Error_GrossYield.Text` (Y:3093, 5908). */
  grossRange: "Please select a value between 0 and 2,000,000.",
  /** `lbl_ProductionDataPV_Error_Irradation.Text` (Y:5756). */
  irradiationThreeDecimals: "Numeric value with maximum of three decimals",
  /** `lbl_ProductionDataPV_Error_Irradation.Text` (Y:5773). */
  irradiationRange: "Please select a value between 0 and 3000.",
  /** `lbl_ProductionDataWTG_Error_TotalLosses.Text` (Y:3270, 3287). */
  grossYieldOrder: "Please ensure Gross Yield > Net Yield p50",
  /** `lbl_ProductionData{WTG}_Error_TotalLosses` / `…_Uncertainty.Text` (Y:3275, 3599, 6099). */
  oneDecimal: "Numeric value with maximum of one decimals",
  /** `lbl_ProductionDataPV_Error_Uncertainty.Text` (Y:6386) — singular. */
  oneDecimalPv: "Numeric value with maximum of one decimal",
  /** `lbl_ProductionDataWTG_Error_Uncertainty.Text` (Y:3610) and `lbl_ProductionDataPV_Error_TotalLosses.Text` (Y:6109). */
  uncertaintyRange: "Please select a value between 0 and 100.",
  /** `lbl_ProductionDataPV_Error_Uncertainty.Text` (Y:6397) — the SOURCE DEFECT range, kept for the twin. */
  uncertaintyRangePvCanvas: "Please select a value between 0 and 3 000.",
  /** `lbl_ProductionData{WTG|PV}_Error_NetYieldP50.Text` (Y:3405, 6222). */
  p50Range: "Please select a value between 0 and 2000000.",
  /** `lbl_ProductionData{WTG|PV}_Error_NetYieldP75.Text` (Y:3757). */
  p75Integer: "Numeric value without Decimals",
  /** `…_Error_NetYieldP75.Text` (Y:3762). */
  p75BelowP50: "Net Yield p75 should be below Net Yield p50",
  /** `…_Error_NetYieldP90.Text` (Y:3933). */
  p90Integer: "A Positive Numeric value without Decimals",
  /** `…_Error_NetYieldP90.Text` (Y:3938). */
  p90BelowP75: "Net Yield p90 should be below Net Yield p75",
  /** `…_Error_NetYieldP75/P90.Text` (Y:3741). */
  negativeYield: "Please reduce the uncertainty to ensure a positive yield",
  /** `lbl_ProductionSeasonality{WTG}_JanuaryErrorMessage_2.Text` and the negative-price twin (Y:4720). */
  cellEmpty: "Must not be empty",
  /** (Y:4721). */
  cellRange: "Number (0–100) with max. one decimal",
  /** `lbl_ProductionSeasonality{WTG|PV}_TotalErrorMessage.Text` (Y:4840). */
  seasonalityTotal: "Total must match 100%",
} as const;

/** `IsInteger(Value(Text(v, "##,###", Language())))` — the VALUE is whole (a grouped "12,345" passes). */
const isWholeValue = (v: string, lang: Lang): boolean => {
  const n = parseNumber(v, lang);
  return !Number.isNaN(n) && Number.isInteger(n);
};

/** `lbl_ProductionDataWTG_Error_WindSpeed.Text` (Y:2927-2943). */
export function validateWindSpeed(value: string, lang: Lang = "en-US"): string | null {
  const v = value.trim();
  if (v === "") return null;
  if (!isDecimalWithPlaces(v, 2, lang)) return MSG.windTwoDecimal;
  if (!inRange(v, 0, 15, lang)) return MSG.windRange;
  return null;
}

/** `lbl_ProductionData{WTG|PV}_Error_GrossYield.Text` (Y:3066-3095, 5891-5910). */
export function validateGrossYield(value: string, technology: Technology, lang: Lang = "en-US"): string | null {
  const v = value.trim();
  if (v === "") return null;
  if (!isWholeValue(v, lang)) return technology === "PV" ? MSG.integerPv : MSG.integerWtg;
  if (!inRange(v, 0, 2_000_000, lang)) return MSG.grossRange;
  return null;
}

/** `lbl_ProductionDataPV_Error_Irradation.Text` (Y:5750-5775): three decimals, 0…3000. */
export function validateIrradiation(value: string, lang: Lang = "en-US"): string | null {
  const v = value.trim();
  if (v === "") return null;
  const n = parseNumber(v, lang);
  if (Number.isNaN(n) || pfxRound(n, 3) !== n) return MSG.irradiationThreeDecimals;
  if (!(n >= 0 && n <= 3000)) return MSG.irradiationRange;
  return null;
}

/**
 * Total losses. WTG (Y:3263-3289): a negative derived value → the gross-yield message; then one
 * decimal; out of range → the gross-yield message again (its own message is commented out —
 * reproduced, user-facing). PV (Y:6093-6111): one decimal; out of range → "0 and 100".
 */
export function validateTotalLosses(
  value: string,
  opts: { derived: boolean; technology?: Technology },
  lang: Lang = "en-US",
): string | null {
  const v = value.trim();
  if (v === "") return null;
  if (opts.technology === "PV") {
    if (!isDecimalWithPlaces(v, 1, lang)) return MSG.oneDecimal;
    if (!inRange(v, 0, 100, lang)) return MSG.uncertaintyRange;
    return null;
  }
  if (opts.derived && parseNumber(v, lang) < 0) return MSG.grossYieldOrder;
  if (!isDecimalWithPlaces(v, 1, lang)) return MSG.oneDecimal;
  if (!inRange(v, 0, 100, lang)) return MSG.grossYieldOrder;
  return null;
}

/**
 * Uncertainty (WTG Y:3593-3612). SOURCE DEFECT 1: the PV label allows 0…3000 ("0 and 3 000.",
 * Y:6380-6399) although the value is a percentage; both technologies now use 0…100 with the WTG
 * text. The PV one-decimal text keeps its own singular wording.
 */
export function validateUncertainty(value: string, lang: Lang = "en-US", technology: Technology = "WTG"): string | null {
  const v = value.trim();
  if (v === "") return null;
  if (!isDecimalWithPlaces(v, 1, lang)) return technology === "PV" ? MSG.oneDecimalPv : MSG.oneDecimal;
  if (!inRange(v, 0, 100, lang)) return MSG.uncertaintyRange;
  return null;
}

/** The canvas twin of `validateUncertainty` for PV: 0…3000. */
export function validateUncertaintyCanvasParity(value: string, lang: Lang = "en-US"): string | null {
  const v = value.trim();
  if (v === "") return null;
  if (!isDecimalWithPlaces(v, 1, lang)) return MSG.oneDecimalPv;
  if (!inRange(v, 0, 3000, lang)) return MSG.uncertaintyRangePvCanvas;
  return null;
}

/** Net Yield p50 (Y:3378-3407, 6195-6224): a whole value, 0…2,000,000. */
export function validateNetYieldP50(value: string, lang: Lang = "en-US", technology: Technology = "WTG"): string | null {
  const v = value.trim();
  if (v === "") return null;
  if (!isWholeValue(v, lang)) return technology === "PV" ? MSG.integerPv : MSG.integerWtg;
  if (!inRange(v, 0, 2_000_000, lang)) return MSG.p50Range;
  return null;
}

/** Net Yield p75 (Y:3736-3776). In "Input Uncertainty" only a negative derived value is flagged. */
export function validateNetYieldP75(
  value: string, ctx: { mode: UncertaintyInputMode; p50: string }, lang: Lang = "en-US",
): string | null {
  const v = value.trim();
  if (ctx.mode === "Input Uncertainty") return parseNumber(v, lang) < 0 ? MSG.negativeYield : null;
  if (v === "") return null;
  if (!isWholeValue(v, lang)) return MSG.p75Integer;
  if (!(parseNumber(ctx.p50, lang) > parseNumber(v, lang))) return MSG.p75BelowP50;
  if (!inRange(v, 0, 2_000_000, lang)) return MSG.p50Range;
  return null;
}

/** Net Yield p90 (Y:3912-3951). */
export function validateNetYieldP90(
  value: string, ctx: { mode: UncertaintyInputMode; p75: string }, lang: Lang = "en-US",
): string | null {
  const v = value.trim();
  if (ctx.mode === "Input Uncertainty") return parseNumber(v, lang) < 0 ? MSG.negativeYield : null;
  if (v === "") return null;
  if (!isWholeValue(v, lang)) return MSG.p90Integer;
  if (ctx.p75.trim() !== "" && !(parseNumber(ctx.p75, lang) > parseNumber(v, lang))) return MSG.p90BelowP75;
  if (!inRange(v, 0, 2_000_000, lang)) return MSG.p50Range;
  return null;
}

/**
 * A seasonality month / negative-price year cell (Y:4718-4751): `Must not be empty`, else the
 * locale regex `^0*(100([.]0)?|[0-9]{1,2}([.][0-9])?)$` (comma for a comma-decimal language).
 */
export function validateCellPercent(value: string, lang: Lang = "en-US"): string | null {
  const v = value.trim();
  if (v === "") return MSG.cellEmpty;
  const s = decimalSeparator(lang) === "," ? "," : "\\.";
  return new RegExp(`^0*(100(${s}0)?|[0-9]{1,2}(${s}[0-9])?)$`).test(v) ? null : MSG.cellRange;
}

export type YieldErrors = Record<
  "windSpeed" | "irradiation" | "grossYield" | "totalLosses" | "netP50" | "uncertainty" | "netP75" | "netP90",
  string | null
>;

/** Every error label of the open panel, on what each field shows. */
export function yieldErrors(view: YieldView, form: YieldFormState, technology: Technology, lang: Lang = "en-US"): YieldErrors {
  return {
    windSpeed: technology === "WTG" ? validateWindSpeed(view.windSpeed, lang) : null,
    irradiation: technology === "PV" ? validateIrradiation(view.irradiation, lang) : null,
    grossYield: validateGrossYield(view.grossYield, technology, lang),
    totalLosses: validateTotalLosses(view.totalLosses, { derived: form.lossesInput === "Input Net Yield p50", technology }, lang),
    netP50: validateNetYieldP50(view.netP50, lang, technology),
    uncertainty: validateUncertainty(view.uncertainty, lang, technology),
    netP75: validateNetYieldP75(view.netP75, { mode: form.uncertaintyInput, p50: view.netP50 }, lang),
    netP90: validateNetYieldP90(view.netP90, { mode: form.uncertaintyInput, p75: view.netP75 }, lang),
  };
}

/**
 * Save `DisplayMode` (WTG Y:5189-5266, PV Y:7865-7946). Disabled when: Description blank; WTG Wind
 * blank / PV Irradiation blank in "Input Irradiation"; any error label; the chosen modes' inputs
 * blank; seasonality on and `Round(total, 1) <> 100`; negative prices on and a year cell fails.
 * SOURCE DEFECT 7: the gross-yield error blocks PV in both losses modes.
 */
export function canSaveYield(args: {
  form: YieldFormState;
  view: YieldView;
  technology: Technology;
  seasonality: readonly SeasonalityRow[];
  negativePrices: readonly NegativePriceRow[];
  lang?: Lang;
}): boolean {
  const { form: f, view: v, technology } = args;
  const lang = args.lang ?? "en-US";
  const blank = (s: string) => isBlank(s.trim());
  if (blank(f.description)) return false;
  if (technology === "WTG" && blank(v.windSpeed)) return false;
  if (technology === "PV" && f.allocationInput === "Input Irradiation" && blank(v.irradiation)) return false;
  if (Object.values(yieldErrors(v, f, technology, lang)).some((e) => e !== null)) return false;
  if (f.uncertaintyInput === "Input Uncertainty" ? blank(v.uncertainty) : blank(v.netP75) || blank(v.netP90)) return false;
  if (f.lossesInput === "Input losses" ? blank(v.totalLosses) || blank(v.grossYield) : blank(v.netP50)) return false;
  if (f.considerSeasonality && !isSeasonalityValid(args.seasonality, lang)) return false;
  if (f.considerNegativePrices && args.negativePrices.some((r) => validateCellPercent(r.text, lang) !== null)) return false;
  return true;
}

/* ═══════════════════════════════════════════════════════════════ seasonality ════ */

/**
 * `ClearCollect(col…SeasonalityValues, ForAll(Sequence(12), {ID, Month, Value: LookUp(standard,
 * Month = n).<WTG|PV>, TextValue: Text(…, "#0.0", Language()), IsStandard: true}))` (Y:568, 4147).
 * A month missing from the standard (or the whole Fabric source, which is not connected — D2) is
 * blank, as the canvas `LookUp` is.
 */
export function buildSeasonalityRows(
  standard: readonly StandardSeasonalityRow[], technology: Technology, lang: Lang = "en-US",
): SeasonalityRow[] {
  return MONTH_NAMES.map((month, i) => {
    const row = standard.find((s) => s.month === i + 1);
    const value = row ? (technology === "PV" ? row.pv : row.wtg) : null;
    return { id: i + 1, month, value: value ?? null, text: pfxText(value, "#0.0", lang), isStandard: true };
  });
}

/** Edit: the stored row's twelve months and the `ParseJSON('Standard Values JSON')` flags (Y:653-795). */
export function seasonalityFromStored(stored: StoredSeasonality | null, lang: Lang = "en-US"): SeasonalityRow[] {
  const flags = deserialiseStandardValuesJson(stored?.standardValuesJson);
  return MONTH_NAMES.map((month, i) => {
    const value = stored?.months[i] ?? null;
    return { id: i + 1, month, value, text: pfxText(value, "#0.0", lang), isStandard: flags[i] ?? false };
  });
}

/**
 * A month cell's `OnChange` (Y:4560-4603): every row loses its standard flag, then the edited row
 * keeps the typed text and — when it is a number — its value.
 */
export function applyMonthEdit(rows: readonly SeasonalityRow[], id: number, text: string, lang: Lang = "en-US"): SeasonalityRow[] {
  const n = valueOf(text, lang);
  return rows.map((r) => (r.id === id
    ? { ...r, isStandard: false, text, value: n === null ? r.value : n }
    : { ...r, isStandard: false }));
}

/** `Sum(gal.AllItems, Value(MonthValue.Text))` — a cell that is not a number adds nothing. */
export const seasonalityTotal = (rows: readonly SeasonalityRow[], lang: Lang = "en-US"): number =>
  rows.reduce((s, r) => s + (valueOf(r.text, lang) ?? 0), 0);

/** The Save gate's `Round(Value(total), 1) <> 100.0`. */
export const isSeasonalityValid = (rows: readonly SeasonalityRow[], lang: Lang = "en-US"): boolean =>
  pfxRound(seasonalityTotal(rows, lang), 1) === 100;

/** SOURCE DEFECT 5: the total's error label follows the rounded gate. */
export const seasonalityTotalError = (rows: readonly SeasonalityRow[], lang: Lang = "en-US"): boolean =>
  !isSeasonalityValid(rows, lang);

/** The canvas label `Visible: =Value(txt_…_TotalValue.Text) <> 100` (Y:4841), unrounded. */
export const seasonalityTotalErrorCanvasParity = (rows: readonly SeasonalityRow[], lang: Lang = "en-US"): boolean =>
  seasonalityTotal(rows, lang) !== 100;

/** "Total Sum [%]" as the read-only cell shows it. */
export function fmtPercentTotal(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** `'Standard Values JSON'` — `{"Jan":true,…}` built with `Text(bool)`, i.e. valid JSON. */
export function serialiseStandardValuesJson(rows: readonly SeasonalityRow[]): string {
  const map: Record<string, boolean> = {};
  MONTH_KEYS.forEach((key, i) => { map[key] = rows.find((r) => r.id === i + 1)?.isStandard ?? false; });
  return JSON.stringify(map);
}

export function deserialiseStandardValuesJson(json: string | null | undefined): boolean[] {
  if (!json) return MONTH_KEYS.map(() => false);
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    return MONTH_KEYS.map((k) => parsed[k] === true || parsed[k] === "true");
  } catch {
    return MONTH_KEYS.map(() => false);
  }
}

/** The seasonality `Patch` payload (Y:5284): name, twelve months (`Value(LookUp(…).Value)`), JSON. */
export function seasonalityFields(args: { rows: readonly SeasonalityRow[]; yieldDescription: string | null }): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    [SEASONALITY_COL.name]: `Seasonality - ${args.yieldDescription ?? ""}`,
    [SEASONALITY_COL.standardValuesJson]: serialiseStandardValuesJson(args.rows),
  };
  SEASONALITY_COL.months.forEach((col, i) => { fields[col] = args.rows.find((r) => r.id === i + 1)?.value ?? null; });
  return fields;
}

/* ═══════════════════════════════════════════════════════════ negative prices ════ */

export const NEGATIVE_PRICE_YEARS = 15;

const negativeRow = (year: number, std: number | null | undefined, lang: Lang): NegativePriceRow => {
  const has = std !== null && std !== undefined;
  const v = has ? std : 0;
  return { year, reductionValue: v, text: pfxText(v, "#0.0", lang), standardReductionValue: v, standardAssumption: has, hasStandard: has };
};

const standardFor = (standard: readonly StandardNegativePriceRow[], year: number, technology: Technology) => {
  const s = standard.find((x) => x.year === year);
  return s ? (technology === "PV" ? s.pv : s.wind) : null;
};

/** The year of a `yyyy-mm-dd` date, read from its own digits (rule 18). */
export const yearOf = (iso: string | null | undefined): number | null => {
  const y = iso ? Number(iso.slice(0, 4)) : NaN;
  return Number.isFinite(y) && y > 0 ? y : null;
};

/** A `yyyy-mm-dd` date as a LOCAL date (never `new Date(iso)`, which reads UTC). */
export const localDate = (iso: string): Date => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

/**
 * The toggle's `OnCheck` (Y:4216-4258): fifteen years from `Year(COD)`, each
 * `ReductionValue: If(IsBlank(std), 0, Value(std))`, `StandardAssumption: Not(IsBlank(std))`. WTG
 * reads `.Wind`, PV `.PV`.
 */
export function buildNegativePriceRows(
  codYear: number, standard: readonly StandardNegativePriceRow[], technology: Technology, lang: Lang = "en-US",
): NegativePriceRow[] {
  const rows: NegativePriceRow[] = [];
  for (let i = 0; i < NEGATIVE_PRICE_YEARS; i++) {
    const year = codYear + i;
    rows.push(negativeRow(year, standardFor(standard, year, technology), lang));
  }
  return rows;
}

/**
 * Edit (Y:796-843): the WHOLE stored set, each with its standard reduction for the per-year reset.
 * SOURCE DEFECT 4: with no stored row the canvas kept a stale collection; the curve is seeded.
 */
export function negativeRowsForEdit(args: {
  stored: readonly StoredNegativePrice[];
  standard: readonly StandardNegativePriceRow[];
  technology: Technology;
  cod: string | null;
  lang?: Lang;
}): NegativePriceRow[] {
  const lang = args.lang ?? "en-US";
  if (args.stored.length === 0) {
    const y = yearOf(args.cod);
    return y === null ? [] : buildNegativePriceRows(y, args.standard, args.technology, lang);
  }
  return [...args.stored].sort((a, b) => a.year - b.year).map((s) => {
    const std = standardFor(args.standard, s.year, args.technology);
    const value = s.reduction ?? 0;
    return {
      year: s.year, reductionValue: value, text: pfxText(s.reduction, "#0.0", lang),
      standardReductionValue: std ?? 0, standardAssumption: s.isStandard, hasStandard: std !== null && std !== undefined,
    };
  });
}

/** A year cell's `OnChange` (Y:4976-5009): the typed text, its value when numeric, never standard again. */
export function applyReductionEdit(rows: readonly NegativePriceRow[], year: number, text: string, lang: Lang = "en-US"): NegativePriceRow[] {
  const n = valueOf(text, lang);
  return rows.map((r) => (r.year === year
    ? { ...r, text, reductionValue: n === null ? r.reductionValue : n, standardAssumption: false }
    : r));
}

/** `ico_ProductionNegativePrice{WTG|PV}_YearValueReset.OnSelect` (Y:5044-5074): back to the standard. */
export function resetNegativePriceRow(rows: readonly NegativePriceRow[], year: number, lang: Lang = "en-US"): NegativePriceRow[] {
  return rows.map((r) => (r.year === year
    ? { ...r, reductionValue: r.standardReductionValue, text: pfxText(r.standardReductionValue, "#0.0", lang), standardAssumption: r.hasStandard }
    : r));
}

export interface NegativePriceWritePlan {
  upserts: { id: string | null; year: number; reduction: number; isStandard: boolean }[];
  deletes: string[];
}

/**
 * The per-year upsert `ForAll(colNegativePrices, Patch(Coalesce(match by Year, Defaults), …))`.
 * DIVERGENCE: unchanged stored years are not re-written. SOURCE DEFECT 3: stored years the current
 * curve no longer has are removed (the canvas left them, and they came back on the next Edit).
 */
export function planNegativePriceWrites(current: readonly NegativePriceRow[], stored: readonly StoredNegativePrice[]): NegativePriceWritePlan {
  const base = planNegativePriceWritesCanvasParity(current, stored);
  const byYear = new Map(stored.map((s) => [s.year, s]));
  const upserts = base.upserts.filter((u) => {
    const e = byYear.get(u.year);
    return !(e && (e.reduction ?? 0) === u.reduction && e.isStandard === u.isStandard);
  });
  const covered = new Set(current.map((r) => r.year));
  return { upserts, deletes: stored.filter((s) => !covered.has(s.year)).map((s) => s.id) };
}

/** The canvas: one `Patch` per current row, matched by year; nothing removed. */
export function planNegativePriceWritesCanvasParity(current: readonly NegativePriceRow[], stored: readonly StoredNegativePrice[]): NegativePriceWritePlan {
  const byYear = new Map(stored.map((s) => [s.year, s]));
  return {
    upserts: current.map((r) => ({ id: byYear.get(r.year)?.id ?? null, year: r.year, reduction: r.reductionValue, isStandard: r.standardAssumption })),
    deletes: [],
  };
}

export const negativePriceFields = (row: { year: number; reduction: number; isStandard: boolean }): Record<string, unknown> => ({
  [NEGATIVE_PRICE_COL.name]: `Negative Price - ${row.year}`,
  [NEGATIVE_PRICE_COL.year]: row.year,
  [NEGATIVE_PRICE_COL.reduction]: row.reduction,
  [NEGATIVE_PRICE_COL.isStandard]: row.isStandard,
});

/**
 * The revenue synchronisation (Y:5284, 7964, 9167, 9241):
 *   no ACTIVE yield with 'Consider Negative Prices' = Yes → every revenue with Yes AND no manual
 *   override becomes No; at least one → every revenue with No AND no manual override becomes Yes.
 */
export function syncRevenueNegativePrices(args: { activeYields: readonly EnergyYieldRow[]; revenues: readonly RevenueRow[] }): { id: string; considerNegativePrices: boolean }[] {
  const anyYield = args.activeYields.some((y) => y.status === 0 && y.considerNegativePrices === true);
  const editable = args.revenues.filter((r) => !r.manualOverride);
  return anyYield
    ? editable.filter((r) => !r.considerNegativePrices).map((r) => ({ id: r.id, considerNegativePrices: true }))
    : editable.filter((r) => r.considerNegativePrices).map((r) => ({ id: r.id, considerNegativePrices: false }));
}

/* ═══════════════════════════════════════════════════ Fabric / locale parsing ════ */

/**
 * The Fabric values (`Assumptions Revenues SQL` — not connected, D2) arrive as strings and the
 * canvas reads them with `Switch(langRoot, "en", Value(v), Value(Substitute(v, ".", ",")))`.
 * Kept for when the source is connected.
 */
export function parseFabricNumber(raw: string | number | null | undefined, lang: Lang): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  if (typeof raw === "number") return raw;
  const normalised = decimalSeparator(lang) === "," ? raw.replace(/\./g, ",") : raw;
  const n = parseNumber(normalised, lang);
  return Number.isFinite(n) ? n : 0;
}

/* ══════════════════════════════════════════════════════════════ the save plans ════ */

const ins = (entitySet: string, data: Record<string, unknown>, reason: string): PlannedWrite => ({ op: "create", entitySet, data, reason });
const upd = (entitySet: string, id: string, data: Record<string, unknown>, reason: string): PlannedWrite => ({ op: "update", entitySet, id, data, reason });
const del = (entitySet: string, id: string, reason: string): PlannedWrite => ({ op: "delete", entitySet, id, reason });
const ownerBind = (buId: string | null): Record<string, string> => (buId ? { [BIND.owner]: bind("businessunits", buId) } : {});

/**
 * The yield `Patch` (WTG Y:5284, PV Y:7964). WTG writes Wind, `Allocation` (always Whole plant —
 * the radio is View), gross / losses / p50 / uncertainty / p75 / p90 and the losses + uncertainty
 * modes; PV writes Irradiation and the Production Allocation mode instead of Wind / Allocation.
 * Both: Project, Assessment, Description, Owning Business Unit
 * (`'Besitzer (Unternehmenseinheit)'`), Type and the two toggles.
 */
export function buildYieldPayload(args: {
  form: YieldFormState;
  view: YieldView;
  technology: Technology;
  project: Pick<ProductionProject, "id" | "owningBusinessUnitId">;
  lang?: Lang;
}): Record<string, unknown> {
  const { form, view, technology } = args;
  const lang = args.lang ?? "en-US";
  const v = (s: string) => valueOf(s, lang);
  const common: Record<string, unknown> = {
    [BIND.project]: bind(ES.projects, args.project.id),
    [YIELD_COL.assessment]: form.assessment,
    [YIELD_COL.description]: form.description,
    [YIELD_COL.grossYield]: v(view.grossYield),
    [YIELD_COL.totalLosses]: v(view.totalLosses),
    [YIELD_COL.netYieldP50]: v(view.netP50),
    [YIELD_COL.uncertainty]: v(view.uncertainty),
    [YIELD_COL.netYieldP75]: v(view.netP75),
    [YIELD_COL.netYieldP90]: v(view.netP90),
    ...ownerBind(args.project.owningBusinessUnitId),
    [YIELD_COL.type]: technology === "PV" ? CHOICE_PRODUCTION.yieldType.pv : CHOICE_PRODUCTION.yieldType.wtg,
    [YIELD_COL.productionLossesP50]: form.lossesInput === "Input losses"
      ? CHOICE_PRODUCTION.productionLossesP50.inputLosses : CHOICE_PRODUCTION.productionLossesP50.inputNetYieldP50,
    [YIELD_COL.productionUncertainty]: form.uncertaintyInput === "Input Uncertainty"
      ? CHOICE_PRODUCTION.productionUncertainty.inputUncertainty : CHOICE_PRODUCTION.productionUncertainty.inputNetYieldP75P90,
    [YIELD_COL.considerSeasonality]: form.considerSeasonality,
    [YIELD_COL.considerNegativePrices]: form.considerNegativePrices,
  };
  return technology === "WTG"
    ? { ...common, [YIELD_COL.windSpeed]: v(view.windSpeed), [YIELD_COL.allocation]: CHOICE_PRODUCTION.yieldAllocation.wholePlant }
    : {
      ...common,
      [YIELD_COL.irradiation]: v(view.irradiation),
      [YIELD_COL.productionAllocation]: form.allocationInput === "Input Irradiation"
        ? CHOICE_PRODUCTION.productionAllocation.inputIrradiation : CHOICE_PRODUCTION.productionAllocation.inputGrossYield,
    };
}

/** The saved yield as the rest of the screen sees it — for the revenue sync and supersede. */
function savedRow(id: string, payload: Record<string, unknown>, before: EnergyYieldRow | null): EnergyYieldRow {
  return {
    ...(before ?? {
      id, name: null, allocation: null, windSpeed: null, irradiation: null, grossYield: null, totalLosses: null,
      netYieldP50: null, uncertainty: null, netYieldP75: null, netYieldP90: null, productionAllocation: null,
      productionLossesP50: null, productionUncertainty: null, status: 0,
    }),
    id,
    description: payload[YIELD_COL.description] as string,
    type: payload[YIELD_COL.type] as number,
    assessment: payload[YIELD_COL.assessment] as number,
    considerSeasonality: payload[YIELD_COL.considerSeasonality] as boolean,
    considerNegativePrices: payload[YIELD_COL.considerNegativePrices] as boolean,
  } as EnergyYieldRow;
}

/**
 * An External assessment supersedes the ACTIVE Internal yields of the same `Type`
 * (`Patch('Energy Yields', colProductionActiveInternal)` with Status Inactive, Y:5284).
 */
export function supersededInternalYields(args: { assessment: number; type: number; yields: readonly EnergyYieldRow[]; savedId?: string | null }): string[] {
  if (args.assessment !== CHOICE_PRODUCTION.yieldAssessment.external) return [];
  return args.yields
    .filter((y) => y.id !== args.savedId && y.status === 0 && y.assessment === CHOICE_PRODUCTION.yieldAssessment.internal && y.type === args.type)
    .map((y) => y.id);
}

/** The canvas twin of the yields the revenue sync reads on a save: before the supersede (SOURCE DEFECT 2). */
export function revenueSyncYieldsCanvasParity(yields: readonly EnergyYieldRow[], saved: EnergyYieldRow): EnergyYieldRow[] {
  return [...yields.filter((y) => y.id !== saved.id), saved];
}

/**
 * The yield Save, in the canvas order (Y:5284 / 7964):
 *   1. `Patch('Energy Yields', …)`;
 *   2. the seasonality upsert — or `Remove` of the stored row when the toggle is off;
 *   3. the negative-price upserts — or `RemoveIf` of every stored row when the toggle is off;
 *   4. the revenue sync (SOURCE DEFECT 2: against the yields AFTER step 5);
 *   5. an External assessment sets the project's active Internals of its type Inactive.
 * The recalculation (`Select(btn_Load_StandardContracts_For_Project)`) follows as its own job.
 * Every create binds the project's owning business unit, as the canvas does.
 */
export function planSaveYield(args: {
  editing: EnergyYieldRow | null;
  payload: Record<string, unknown>;
  project: Pick<ProductionProject, "owningBusinessUnitId">;
  seasonality: { on: boolean; rows: readonly SeasonalityRow[]; storedId: string | null };
  negativePrices: { on: boolean; rows: readonly NegativePriceRow[]; stored: readonly StoredNegativePrice[] };
  yields: readonly EnergyYieldRow[];
  revenues: readonly RevenueRow[];
}): WritePlan {
  const writes: PlannedWrite[] = [];
  const editing = args.editing;
  const yieldRef = editing ? editing.id : createdRowRef(0);
  const owner = ownerBind(args.project.owningBusinessUnitId);
  writes.push(editing
    ? upd(ES_PRODUCTION.energyYields, editing.id, args.payload, "the energy yield")
    : ins(ES_PRODUCTION.energyYields, args.payload, "the energy yield"));

  const yieldBind = { [BIND.energyYield]: bind(ES_PRODUCTION.energyYields, yieldRef) };
  const description = args.payload[YIELD_COL.description] as string;
  if (args.seasonality.on) {
    const fields = { ...seasonalityFields({ rows: args.seasonality.rows, yieldDescription: description }), ...yieldBind, ...owner };
    writes.push(args.seasonality.storedId
      ? upd(ES_PRODUCTION.seasonalityValues, args.seasonality.storedId, fields, "the seasonality values")
      : ins(ES_PRODUCTION.seasonalityValues, fields, "the seasonality values"));
  } else if (args.seasonality.storedId) {
    writes.push(del(ES_PRODUCTION.seasonalityValues, args.seasonality.storedId, "the seasonality values"));
  }

  if (args.negativePrices.on) {
    const np = planNegativePriceWrites(args.negativePrices.rows, args.negativePrices.stored);
    for (const u of np.upserts) {
      const fields = { ...negativePriceFields(u), ...yieldBind, ...owner };
      writes.push(u.id
        ? upd(ES_PRODUCTION.negativePrices, u.id, fields, `the negative price ${u.year}`)
        : ins(ES_PRODUCTION.negativePrices, fields, `the negative price ${u.year}`));
    }
    for (const id of np.deletes) writes.push(del(ES_PRODUCTION.negativePrices, id, "a negative price outside the curve"));
  } else {
    for (const s of args.negativePrices.stored) writes.push(del(ES_PRODUCTION.negativePrices, s.id, `the negative price ${s.year}`));
  }

  const saved = savedRow(editing?.id ?? "@new", args.payload, editing);
  const superseded = supersededInternalYields({ assessment: saved.assessment ?? 0, type: saved.type ?? 0, yields: args.yields, savedId: editing?.id ?? null });
  const after = [...args.yields.filter((y) => y.id !== saved.id), saved]
    .map((y) => (superseded.includes(y.id) ? { ...y, status: 1 } : y));
  for (const r of syncRevenueNegativePrices({ activeYields: after, revenues: args.revenues })) {
    writes.push(upd(ES_FINANCE.projectRevenues, r.id, { [REVENUE_COL.considerNegativePrices]: r.considerNegativePrices }, "a revenue contract's negative prices"));
  }
  for (const id of superseded) {
    writes.push(upd(ES_PRODUCTION.energyYields, id, { ...YIELD_STATUS.inactive }, "an internal yield superseded by the external one"));
  }
  return { writes, log: [] };
}

/**
 * Delete (`cmp_Delete_ProjectProd.OnConfirm`, Y:9236-9289): `Remove('Energy Yields', selected)`,
 * then the revenue sync. The yield's `PV Seasonality Values` and `PV Negative Prices` are removed by
 * Dataverse (both relationships are `CascadeDelete`), as the canvas relied on.
 */
export function planDeleteYield(args: { row: EnergyYieldRow; yields: readonly EnergyYieldRow[]; revenues: readonly RevenueRow[] }): WritePlan {
  const remaining = args.yields.filter((y) => y.id !== args.row.id);
  return {
    writes: [
      del(ES_PRODUCTION.energyYields, args.row.id, "the energy yield"),
      ...syncRevenueNegativePrices({ activeYields: remaining, revenues: args.revenues }).map((r) =>
        upd(ES_FINANCE.projectRevenues, r.id, { [REVENUE_COL.considerNegativePrices]: r.considerNegativePrices }, "a revenue contract's negative prices")),
    ],
    log: [],
  };
}

/** Activate / deactivate (`cmp_ActivateDeactivate_ProjectProd.OnConfirm`, Y:9145-9214), then the revenue sync. */
export function planStatusChange(args: { row: EnergyYieldRow; yields: readonly EnergyYieldRow[]; revenues: readonly RevenueRow[] }): WritePlan {
  const next = args.row.status === 0 ? YIELD_STATUS.inactive : YIELD_STATUS.active;
  const after = args.yields.map((y) => (y.id === args.row.id ? { ...y, status: next.statecode } : y));
  return {
    writes: [
      upd(ES_PRODUCTION.energyYields, args.row.id, { ...next }, "the energy yield's status"),
      ...syncRevenueNegativePrices({ activeYields: after, revenues: args.revenues }).map((r) =>
        upd(ES_FINANCE.projectRevenues, r.id, { [REVENUE_COL.considerNegativePrices]: r.considerNegativePrices }, "a revenue contract's negative prices")),
    ],
    log: [],
  };
}

/* ══════════════════════════════════════════════════════════════ yield roll-up ════ */

export interface ProjectYieldTotals {
  grossYield: number; netP50: number; netP75: number; netP90: number; windSpeed: number; irradiation: number;
}

/**
 * `IfError(Average(t, f), 0, Average(t, f))`. Power Fx `Average` ignores blank values and errors
 * (divides by zero) on a table with none, which the `IfError` turns into 0.
 */
function avg(rows: readonly EnergyYieldRow[], pick: (r: EnergyYieldRow) => number | null): number {
  const values = rows.map(pick).filter((v): v is number => v !== null && Number.isFinite(v));
  return values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * The project roll-up (Y:8164-8250): the SUM of the active WTG average and the active PV average
 * for gross / p50 / p75 / p90; Wind is the WTG average, Irradiation the PV average.
 */
export function projectYieldTotals(yields: readonly EnergyYieldRow[]): ProjectYieldTotals {
  const wtg = yields.filter((y) => y.status === 0 && y.type === CHOICE_PRODUCTION.yieldType.wtg);
  const pv = yields.filter((y) => y.status === 0 && y.type === CHOICE_PRODUCTION.yieldType.pv);
  return {
    grossYield: avg(wtg, (r) => r.grossYield) + avg(pv, (r) => r.grossYield),
    netP50: avg(wtg, (r) => r.netYieldP50) + avg(pv, (r) => r.netYieldP50),
    netP75: avg(wtg, (r) => r.netYieldP75) + avg(pv, (r) => r.netYieldP75),
    netP90: avg(wtg, (r) => r.netYieldP90) + avg(pv, (r) => r.netYieldP90),
    windSpeed: avg(wtg, (r) => r.windSpeed),
    irradiation: avg(pv, (r) => r.irradiation),
  };
}

export function projectYieldFields(totals: ProjectYieldTotals): Record<string, unknown> {
  return {
    [PROJECT_YIELD_COL.grossYield]: totals.grossYield,
    [PROJECT_YIELD_COL.windSpeed]: totals.windSpeed,
    [PROJECT_YIELD_COL.netYieldP50]: totals.netP50,
    [PROJECT_YIELD_COL.netYieldP75]: totals.netP75,
    [PROJECT_YIELD_COL.netYieldP90]: totals.netP90,
    [PROJECT_YIELD_COL.irradiation]: totals.irradiation,
  };
}

/** The first half of "Recalc": `Patch(Projects, …)` with the roll-up. */
export const planRollUp = (projectId: string, yields: readonly EnergyYieldRow[]): WritePlan => ({
  writes: [upd(ES.projects, projectId, projectYieldFields(projectYieldTotals(yields)), "the project's yield totals")],
  log: [],
});

/* ══════════════════════════════════════════════════ standard contracts ════ */

/** A row of `OPEX & Land Lease Standard Assumptions`, reduced to what the generator writes. */
export interface StandardAssumption {
  id: string;
  name: string | null;
  description: string | null;
  period: number | null;
  typeOfContract: number | null;
  landLeaseSubaccountId: string | null;
  landLeaseSubaccountName: string | null;
  opexSubaccountId: string | null;
  opexSubaccountName: string | null;
  currencyId: string | null;
  secured: boolean;
  allWtgAllocated: boolean;
  fixCosts: number | null;
  ofRevenues: number | null;
  eurMw: number | null;
  eurMwh: number | null;
  eurWtg: number | null;
  aggregation: number | null;
  durationInYears: number | null;
  durationInMonths: number | null;
  distributionFrequency: number | null;
  amountOneTimePayment: number | null;
  amountOneTimePayment2: number | null;
  amountOneTimePayment3: number | null;
  dueDateOneTimePayment: string | null;
  dueDateOneTimePayment2: string | null;
  dueDateOneTimePayment3: string | null;
  useInflationProfile: boolean;
  useCountryInflationProfile: boolean;
  inflationProfile: number | null;
  inflationCountryArea: string | null;
  alignWithProjectDuration: boolean;
  externalContract: boolean;
  threshold: boolean;
  thresholdType: number | null;
  thresholdIndividual: number | null;
}

/** "Recalc" generates only `If(And('Net Yield p50' > 0, 'Standard Cost Created' = No), …)` (Y:8259). */
export function shouldGenerate(project: Pick<ProductionProject, "netYieldP50" | "standardCostCreated">): boolean {
  return (project.netYieldP50 ?? 0) > 0 && project.standardCostCreated === false;
}

/** `recCODYear: Year(COD) + 1` — the inflation start year. */
export function inflationStartYear(cod: string | null | undefined): number | null {
  const y = yearOf(cod);
  return y === null ? null : y + 1;
}

/**
 * `'Inflation Profile': Switch(true, use ∧ country → LookUp('Country Inflation Profiles', Country ∧
 * Year = recCODYear).Inflation, use ∧ ¬country → the assumption's own, Blank())`.
 */
export function resolveInflation(args: {
  assumption: Pick<StandardAssumption, "useInflationProfile" | "useCountryInflationProfile" | "inflationProfile">;
  countryProfile: number | null | undefined;
}): number | null {
  const a = args.assumption;
  if (a.useInflationProfile && a.useCountryInflationProfile) return args.countryProfile ?? null;
  if (a.useInflationProfile) return a.inflationProfile ?? null;
  return null;
}

/** `'Opex & Land Lease Period'.'Period n'` → `'Land Lease Period'.'Period n'`; Period 10 has no twin → Period 1. */
export function toLandLeasePeriod(opexPeriod: number | null): number {
  const opex: number[] = Object.values(CHOICE_PRODUCTION.opexLandLeasePeriod);
  const landLease: number[] = Object.values(CHOICE_PRODUCTION.landLeasePeriod);
  const idx = opex.indexOf(opexPeriod ?? -1);
  return idx >= 0 && idx < landLease.length ? landLease[idx]! : landLease[0]!;
}

/** `'Opex Aggregation'.X → 'Land Lease Aggregation'.X` (Y:8504) — the same three values (pinned by test). */
export const toLandLeaseAggregation = (a: number | null): number | null =>
  a === CHOICE_PRODUCTION.aggregation.max || a === CHOICE_PRODUCTION.aggregation.min || a === CHOICE_PRODUCTION.aggregation.sum ? a : null;

/** `Value(Text(v, "##0.00"))` — 2 dp through text; a blank stays blank. */
export const normaliseAmount = (v: number | null | undefined): number | null =>
  v === null || v === undefined || !Number.isFinite(v) ? null : pfxRound(v, 2);

export interface GenerationInputs {
  project: ProductionProject;
  assumptions: readonly StandardAssumption[];
  /** Counts of the project's existing standard contracts per family (each family is skipped when > 0). */
  existing: { landLease: number; otherOpex: number; oAndM: number };
  /** `colGeneratorsInProject` — every WTG turbine and PV unit of the project (Y:8028-8097). */
  generators: readonly { id: string; name: string | null }[];
  /** `colDeviceTypesInProject` — WTG types' device rows (by type creation), then PV's. */
  deviceTypes: readonly { id: string }[];
  /** `locOAndMSubaccount` — `LookUp('Opex Subaccounts', Name = "Operation & Maintenance")`. */
  oAndM: { id: string; name: string } | null;
  /** `LookUp('Country Inflation Profiles', Country ∧ Year = COD + 1).Inflation`. */
  countryInflation: number | null;
}

const byDescription = (a: StandardAssumption, b: StandardAssumption) => (a.description ?? "").localeCompare(b.description ?? "");
const P1 = CHOICE_PRODUCTION.opexLandLeasePeriod.period1;
const P2 = CHOICE_PRODUCTION.opexLandLeasePeriod.period2;

/** The OPEX cost columns every generated row carries (Y:8580-8650, 8835-8900). */
function opexFields(a: StandardAssumption, ctx: { start: Date; codYear: number; countryInflation: number | null; owner: string | null }): Record<string, unknown> {
  return {
    vsb_description: (a.description ?? "").trim(),
    vsb_startdate: dateOnly(ctx.start),
    vsb_opexprojectdurationyears: a.durationInYears,
    vsb_opexprojectdurationmonths: a.durationInMonths,
    ...(a.currencyId ? { [BIND.currency]: bind(ES.currencies, a.currencyId) } : {}),
    vsb_fixcosts: a.fixCosts,
    vsb_ofrevenues: a.ofRevenues,
    vsb_threshold: a.threshold,
    vsb_thresholdtype: a.thresholdType,
    vsb_thresholdindividual: a.thresholdIndividual,
    vsb_eurmwh: a.eurMwh,
    vsb_eurmw: a.eurMw,
    vsb_eurwtg: a.eurWtg,
    vsb_aggregation: a.aggregation,
    vsb_useinflationprofile: a.useInflationProfile,
    vsb_usecountryinflationprofile: a.useCountryInflationProfile,
    vsb_inflationprofile: resolveInflation({ assumption: a, countryProfile: ctx.countryInflation }),
    vsb_inflationstartyear: ctx.codYear,
    vsb_inflationcountryarea: a.inflationCountryArea,
    vsb_distributionfrequency: a.distributionFrequency,
    ...ownerBind(ctx.owner),
    vsb_alignwithprojectduration: a.alignWithProjectDuration,
    vsb_isstartdatestandardassumption: true,
    vsb_isstandardcontract: true,
    vsb_externalcontract: a.externalContract,
  };
}

const monthsOf = (years: number | null, months: number | null) => (years ?? 0) * 12 + (months ?? 0);

interface Created { index: number; start: Date; years: number | null; months: number | null; key: string; description: string }

/**
 * The generator half of "Recalc" (Y:8259-9112), as one ordered plan: Land Lease costs (each
 * followed by its AllWTG allocations), Land Lease periods, Other OPEX costs and periods, O&M costs
 * and periods per device type, then the four flags. Each family is skipped when the project
 * already has standard contracts of it. Children bind their parent through `createdRowRef`.
 */
export function planStandardContracts(
  input: GenerationInputs,
  options: { otherOpexChain?: "subaccount" | "canvasParity" } = {},
): WritePlan {
  const { project } = input;
  const writes: PlannedWrite[] = [];
  let creates = 0;
  const create = (set: string, data: Record<string, unknown>, reason: string): number => {
    writes.push(ins(set, data, reason));
    return creates++;
  };
  const owner = project.owningBusinessUnitId;
  const projectBind = { [BIND.project]: bind(ES.projects, project.id) };

  if (project.cod) {
    const cod = localDate(project.cod);
    const codYear = inflationStartYear(project.cod)!;
    const ctx = { codYear, countryInflation: input.countryInflation, owner };
    const of = (type: number) => input.assumptions.filter((a) => a.typeOfContract === type).slice().sort(byDescription);

    /* ── Land Lease (Y:8273-8530) ── */
    if (input.existing.landLease === 0) {
      const scoped = of(CHOICE_PRODUCTION.typeOfContract.landlease);
      const costBySub = new Map<string, number>();
      for (const a of scoped.filter((x) => x.period === P1)) {
        const idx = create(ES_PLANT.landLeaseProjectCosts, {
          ...projectBind,
          ...(a.landLeaseSubaccountId ? { [BIND.subaccount]: bind(ES_PLANT.landLeaseSubaccounts, a.landLeaseSubaccountId) } : {}),
          vsb_name: `${project.projectName ?? ""}-${a.landLeaseSubaccountName ?? ""}-${a.name ?? ""}`,
          vsb_description: a.description,
          ...(a.currencyId ? { [BIND.currency]: bind(ES.currencies, a.currencyId) } : {}),
          vsb_duedateonetimepayment: a.dueDateOneTimePayment,
          vsb_amountonetimepayment: normaliseAmount(a.amountOneTimePayment),
          vsb_secured: a.secured ? CHOICE_PRODUCTION.landLeaseSecured.yes : CHOICE_PRODUCTION.landLeaseSecured.no,
          ...ownerBind(owner),
          vsb_duedateonetimepayment2: a.dueDateOneTimePayment2,
          vsb_amountonetimepayment2: normaliseAmount(a.amountOneTimePayment2),
          vsb_duedateonetimepayment3: a.dueDateOneTimePayment3,
          vsb_amountonetimepayment3: normaliseAmount(a.amountOneTimePayment3),
          vsb_allwtgallocated: a.allWtgAllocated,
          vsb_useinflationprofile: a.useInflationProfile,
          vsb_usecountryinflationprofile: a.useCountryInflationProfile,
          vsb_inflationcountryarea: a.inflationCountryArea,
          vsb_inflationprofile: resolveInflation({ assumption: a, countryProfile: input.countryInflation }),
          vsb_inflationstartyear: codYear,
          vsb_isstartdatestandardassumption: true,
          vsb_isstandardcontract: true,
        }, "a standard land lease contract");
        const sub = a.landLeaseSubaccountId ?? "";
        if (!costBySub.has(sub)) costBySub.set(sub, idx);
        // `If(AllWTGAllocated = Yes, ForAll(colGeneratorsInProject, Patch('Land Lease Allocation WTGS', …)))`:
        // the allocation points at the first cost of the subaccount; the new cost has no Land Owner yet.
        if (a.allWtgAllocated) {
          const costIdx = costBySub.get(sub)!;
          for (const g of input.generators) {
            create(ES.landLeaseAllocationWtgs, {
              vsb_name: `-${a.description ?? ""}-${g.name ?? ""}`,
              [BIND.projectCost]: bind(ES_PLANT.landLeaseProjectCosts, createdRowRef(costIdx)),
              [BIND.generatorInProject]: bind(ES_PLANT.generatorInProjects, g.id),
              ...ownerBind(owner),
            }, "a land lease WTG allocation");
          }
        }
      }
      // The period chain walks every sorted assumption; a Period 1 restarts it (`RemoveIf(…, true)`).
      let chain: { start: Date; years: number | null; months: number | null }[] = [];
      for (const a of scoped) {
        if (a.period === P1) chain = [];
        const costIdx = costBySub.get(a.landLeaseSubaccountId ?? "");
        // SOURCE DEFECT: a period whose subaccount has no Period-1 contract had a blank 'Project Cost'
        // (a required lookup) and failed; it is skipped.
        if (costIdx === undefined) continue;
        const last = chain[chain.length - 1];
        const start = a.period === P1 || !last ? cod : addMonths(last.start, monthsOf(last.years, last.months));
        create(ES.landLeasePeriods, {
          [BIND.projectCost]: bind(ES_PLANT.landLeaseProjectCosts, createdRowRef(costIdx)),
          vsb_name: a.description,
          vsb_period: toLandLeasePeriod(a.period),
          vsb_fixedcosts: normaliseAmount(a.fixCosts),
          vsb_aggregation: toLandLeaseAggregation(a.aggregation),
          vsb_landleasedurationyears: a.durationInYears,
          vsb_landleasedurationmonths: a.durationInMonths,
          ...ownerBind(owner),
          vsb_eurmwh: a.eurMwh,
          vsb_eurmw: a.eurMw,
          vsb_eurwtg: a.eurWtg,
          vsb_distributionfrequency: a.distributionFrequency,
          vsb_startdate: dateOnly(start),
          vsb_ofrevenues: a.ofRevenues,
        }, "a standard land lease period");
        chain.push({ start, years: a.durationInYears, months: a.durationInMonths });
      }
    }

    /* ── Other OPEX (Y:8531-8796) ── */
    if (input.existing.otherOpex === 0) {
      const scoped = of(CHOICE_PRODUCTION.typeOfContract.opexOther);
      const heads = new Map<string, Created>();
      for (const a of scoped.filter((x) => x.period === P1)) {
        const idx = create(ES_PLANT.opexProjectCosts, {
          ...projectBind,
          ...(a.opexSubaccountId ? { [BIND.subaccount]: bind(ES_PLANT.opexSubaccounts, a.opexSubaccountId) } : {}),
          vsb_name: `Other OPEX Costs-${a.opexSubaccountName ?? ""}-${a.description ?? ""}`,
          ...opexFields(a, { ...ctx, start: cod }),
        }, "a standard Other OPEX contract");
        const key = a.opexSubaccountId ?? "";
        if (!heads.has(key)) heads.set(key, { index: idx, start: cod, years: a.durationInYears, months: a.durationInMonths, key, description: a.description ?? "" });
      }
      const periods: Created[] = [];
      for (const a of scoped.filter((x) => x.period !== P1)) {
        const key = a.opexSubaccountId ?? "";
        const head = heads.get(key);
        if (!head) continue; // no parent cost: the canvas Patch failed on the blank 'Parent Cost' chain start.
        // SOURCE DEFECT 6: the canvas chains periods 3+ from the last period created for ANY
        // subaccount (`otherOpexChain: "canvasParity"`); they chain within their own subaccount.
        const own = options.otherOpexChain === "canvasParity" ? periods : periods.filter((p) => p.key === key);
        const base = a.period === P2 || own.length === 0 ? head : own[own.length - 1]!;
        const start = addMonths(base.start, monthsOf(base.years, base.months));
        const idx = create(ES_PLANT.opexProjectCosts, {
          ...projectBind,
          ...(a.opexSubaccountId ? { [BIND.subaccount]: bind(ES_PLANT.opexSubaccounts, a.opexSubaccountId) } : {}),
          vsb_name: `Other OPEX Costs-${a.opexSubaccountName ?? ""}-${a.description ?? ""}`,
          ...opexFields(a, { ...ctx, start }),
          [BIND.parentCost]: bind(ES_PLANT.opexProjectCosts, createdRowRef(head.index)),
        }, "a standard Other OPEX period");
        periods.push({ index: idx, start, years: a.durationInYears, months: a.durationInMonths, key, description: a.description ?? "" });
      }
    }

    /* ── O&M per device type (Y:8797-9061) ── */
    if (input.existing.oAndM === 0 && input.oAndM) {
      const om = input.oAndM;
      const scoped = of(CHOICE_PRODUCTION.typeOfContract.opexOandM);
      const omFields = (a: StandardAssumption, start: Date, deviceId: string) => ({
        ...projectBind,
        [BIND.subaccount]: bind(ES_PLANT.opexSubaccounts, om.id),
        [BIND.deviceTypeInProject]: bind(ES_PLANT.deviceTypesInProjects, deviceId),
        vsb_name: `Operation & Maintenance-${om.name}-${a.description ?? ""}`,
        ...opexFields(a, { ...ctx, start }),
      });
      const heads = new Map<string, Created>();
      for (const a of scoped.filter((x) => x.period === P1)) {
        for (const d of input.deviceTypes) {
          const idx = create(ES_PLANT.opexProjectCosts, omFields(a, cod, d.id), "a standard O&M contract");
          if (!heads.has(d.id)) heads.set(d.id, { index: idx, start: cod, years: a.durationInYears, months: a.durationInMonths, key: d.id, description: a.description ?? "" });
        }
      }
      for (const d of input.deviceTypes) {
        const head = heads.get(d.id);
        if (!head) continue;
        const chain: Created[] = [];
        for (const a of scoped.filter((x) => x.period !== P1)) {
          // Period 2 from the cost row; later periods from the last period sorted by Description.
          const last = chain.slice().sort((x, y) => x.description.localeCompare(y.description)).pop();
          const base = a.period === P2 || !last ? head : last;
          const start = addMonths(base.start, monthsOf(base.years, base.months));
          const idx = create(ES_PLANT.opexProjectCosts, {
            ...omFields(a, start, d.id),
            [BIND.parentCost]: bind(ES_PLANT.opexProjectCosts, createdRowRef(head.index)),
          }, "a standard O&M period");
          chain.push({ index: idx, start, years: a.durationInYears, months: a.durationInMonths, key: d.id, description: (a.description ?? "").trim() });
        }
      }
    }
  }

  writes.push(upd(ES.projects, project.id, markForCapexRecalculationFields(), "the CAPEX recalculation flags"));
  return { writes, log: [] };
}

/**
 * The four flags written after the generation (Y:9102-9111) — the commented-out flow call's
 * replacement. The async plugins on `vsb_initialp50trigger` / `vsb_capexstandardcontractscreated`
 * do the CAPEX and BoP work on the server.
 */
export function markForCapexRecalculationFields(): Record<string, unknown> {
  return {
    [PROJECT_YIELD_COL.initialP50Trigger]: true,
    [PROJECT_YIELD_COL.capexStandardContractsCreated]: false,
    [PROJECT_YIELD_COL.capexStandardCostsCreated]: false,
    [PROJECT_YIELD_COL.bopStandardContractsCreated]: false,
  };
}

/* ═══════════════════════════════════════════════ screen captions ════ */

/** The 2×3 summary grid's labels (`lbl_Production_DisplayProject_Body_Form_*.Text`). */
export const SUMMARY_LABELS = {
  grossYield: "Gross Yield [MWh]",
  windSpeed: "Wind Speed at Hub Height [m/s]",
  irradiation: "Irradiation [kWh/kWp]",
  netP50: "Net Yield p50 [MWh]",
  netP75: "Net Yield p75 [MWh]",
  netP90: "Net Yield p90 [MWh]",
} as const;

/**
 * The canvas `AccessibleLabel`s (CONVENTIONS rule 16) where they differ from the control name:
 * the copy-paste on the two detail boxes (Y:1837, 2004) and the PV assessment radio (Y:5539).
 */
export const ACCESSIBLE_LABEL = {
  detailSeasonality: "txt_ProductionDetails_Description",
  detailNegativePrices: "txt_ProductionDetails_NetYieldP50",
  pvAssessment: "rad_ProductionDataPV_Assessment",
} as const;

export const UI = {
  detail: {
    /** `lbl_ProductionDetails_Description.Text` */
    description: "Description",
    /** `lbl_ProductionDetails_GrossYield.Text` */
    grossYield: "Gross Yield [MWh]",
    /** `lbl_ProductionDetails_Seasonality.Text` */
    considerSeasonality: "Consider Seasonality",
    /** `lbl_ProductionDetails_WindSpeed.Text` — the WTG arm. */
    windSpeed: "Wind speed at Hub Height [m/s]",
    /** `lbl_ProductionDetails_WindSpeed.Text` — the PV arm. */
    irradiation: "Irradiation [kWh/kWp]",
    /** `lbl_ProductionDetails_NetYieldP50.Text` */
    netP50: "Net Yield p50 [MWh]",
    /** `lbl_ProductionDetails_NegativePricesPV.Text` */
    considerNegativePrices: "Consider Negative Prices",
    /** `lbl_ProductionDetails_TotalLosses.Text` */
    totalLosses: "Total losses [%]",
    /** `lbl_ProductionDetails_NetYieldP75.Text` */
    netP75: "Net Yield p75 [MWh]",
    /** `lbl_ProductionDetails_Uncertainty.Text` */
    uncertainty: "Uncertainty [%]",
    /** `lbl_ProductionDetails_NetYieldP90.Text` */
    netP90: "Net Yield p90 [MWh]",
  },
  panel: {
    /** `lbl_ProductionDataWTG_Assesment.Text` */
    assessment: "Energy Yield Assessment",
    /** `lbl_ProductionDataWTG_Description.Text` */
    description: "Description",
    /** `lbl_ProductionDataWTG_WindSpeed.Text` */
    windSpeed: "Wind Speed at Hub Height [m/s]",
    /** `lbl_ProductionDataPV_Irradation.Text` */
    irradiation: "Irradiation [kWh/kWp]",
    /** `lbl_ProductionDataWTG_GrossYield.Text` */
    grossYield: "Gross Yield [MWh]",
    /** `lbl_ProductionDataWTG_TotalLosses.Text` — capital L, unlike the detail row's. */
    totalLosses: "Total Losses [%]",
    /** `lbl_ProductionDataWTG_NetYieldP50.Text` */
    netP50: "Net Yield p50 [MWh]",
    /** `lbl_ProductionDataWTG_Uncertainty.Text` */
    uncertainty: "Uncertainty [%]",
    /** `lbl_ProductionDataWTG_NetYieldP75.Text` */
    netP75: "Net Yield p75 [MWh]",
    /** `lbl_ProductionDataWTG_NetYieldP90.Text` */
    netP90: "Net Yield p90 [MWh]",
    /** `tgl_ProductionDataWTG_ConsiderSeasonality.Label` */
    considerSeasonality: "Consider Seasonality",
    /** `tgl_ProductionDataWTG_ConsiderNegativePrice.Label` */
    considerNegativePrices: "Consider Negative Prices",
  },
  /** `InfoButtonCanvas2.Content` (Y:5858). */
  irradiationInfo:
    "Ensure that you already entered PV capacity in the Generators section when you use irradiation",
  /** `lbl_ProductionSeasonalityWTG_Seasonality.Text` */
  seasonality: "Seasonality",
  /** `lbl_ProductionSeasonalityYieldWTG_Distribution.Text` */
  distribution: "Distribution [%]",
  /** `lbl_ProductionSeasonalityWTG_TotalDistribution.Text` */
  totalSum: "Total Sum [%]",
  /** `lbl_ProductionNegativePriceWTG_NegativePrices.Text` */
  negativePrices: "Negative Prices",
  /** `lbl_ProductionNegativeWTG_Reduction.Text` */
  reduction: "Reduction [%]",
  /** `ico_…_MonthValueResetAll.Tooltip` and `…YearValueReset.Tooltip` */
  resetToStandard: "Reset to standard assumption.",
  /** `locIsVisibleSpinnerText` in the Save `OnChange` and "Recalc" (Y:5284, 8018). */
  saving: "Please wait, saving....",
  /** `locIsVisibleSpinnerText` before the generation (Y:8267). */
  loadingStandardContracts: "Please wait, loading standard assumption contract...",
} as const;

/**
 * NEW — no canvas equivalent. The two texts the code app adds: the load-error state (rule 19) and
 * the notice that the Fabric standard assumptions are not connected (D2).
 */
export const PRODUCTION_SCREEN_TEXT = {
  loadFailedTitle: "Production data is unavailable",
  loadFailedDescription: "The energy yields of this project could not be loaded. Reload the page to try again.",
  fabricNotConnected:
    "The standard seasonality and negative-price assumptions come from Fabric SQL (Assumptions Revenues SQL), which is not connected yet. Enter the values by hand.",
  saveError: "Energy yield could not be saved",
} as const;

/** `lbl_ProductionDataWTG_RightPanelName(_1).Text` (Y:2662, 5383). */
export const panelTitle = (technology: Technology, editing: { description: string | null } | null): string =>
  `${editing ? "Edit" : "Add"} Production ${technology} ${editing?.description ?? ""}`.trimEnd();

/** `cmp_Delete_ProjectProd` (Y:9223-9295). */
export const DELETE_DIALOG = {
  title: "Delete production?",
  description: (description: string | null): string => `Are you sure to delete ${description ?? ""}?`,
  confirm: "Delete",
  cancel: "Cancel",
} as const;

/** `cmp_ActivateDeactivate_ProjectProd` (Y:9123-9221). */
export function statusDialog(row: { status: number; description: string | null }): { title: string; description: string; confirm: string; cancel: string } {
  const deactivating = row.status === 0;
  return {
    title: deactivating ? "Deactivate Production?" : "Activate Production?",
    description: `Are you sure you want to ${deactivating ? "deactivate" : "activate"}: ${row.description ?? ""}?`,
    confirm: deactivating ? "Deactivate" : "Activate",
    cancel: "Cancel",
  };
}

/**
 * `cmp_PopUp_Leave_Procuction_Confirmation` (Y:2569-2608). SOURCE DEFECT (reproduced): it opens only
 * from the header logo / left navigation when `colProductionFormValidation` has a Dirty row, and no
 * formula ever sets one, so it never shows. The panel's close and Cancel close at once (Y:2682,
 * 5325). Rendered by the shared `UnsavedChangesGuard` (D35) under `shouldConfirmLeave`.
 */
export const LEAVE_DIALOG = {
  title: "Unsaved data",
  description: "You have unsaved data. Do you really want to leave current form without saving?",
  confirm: "Yes",
  cancel: "Cancel",
} as const;

/**
 * The leave-guard condition — `If(CountRows(Filter(colProductionFormValidation, Dirty = true)) > 0, …)`
 * on the header logo and the left navigation (Y:168-175).
 *
 * SOURCE DEFECT, reproduced (D28, D35): no formula ever sets a `Dirty` row, so the canvas never
 * asks — whatever is open. The shared guard is wired with this canvas outcome; the twin
 * `shouldConfirmLeaveWhilePanelOpen` (ask while an Add/Edit yield panel is open) is the
 * one-line switch if the product owner wants the dialog to fire.
 */
export const shouldConfirmLeave = (_panelOpen: boolean): boolean => false;

/** NOT LIVE — the twin of `shouldConfirmLeave`: an open Add/Edit yield panel counts as unsaved. */
export const shouldConfirmLeaveWhilePanelOpen = (panelOpen: boolean): boolean => panelOpen;

/** `con_Main_PopUp_Common_Generators_PreventTotalCapacity_Information_1` (Y:9305-9471). */
export const PREVENT_LAST_YIELD_DIALOG = {
  /** `txt_PopUp_Common_Generators_PreventTotalCapacity_Title_1.Text` (U+2019 apostrophe). */
  title: "Production can’t be deleted/deactivated",
  /** `lbl_PopUp_Common_Generators_PreventTotalCapacity_Information_1.Text` */
  description:
    "Before removing/deactivating the last production study, add/activate another one so that the project's yield never drops to zero.",
  /** `btn_PopUp_Common_Generators_PreventTotalCapacity_Information_Close_1.Text` */
  close: "Close",
} as const;
