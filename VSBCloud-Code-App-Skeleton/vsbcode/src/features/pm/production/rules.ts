/**
 * Project Production Screen — every business rule as a pure function.
 *
 * Canvas screen: `Project Production Screen` (PM app)
 *   299 controls · 9 080 lines of Power Fx · 96 substantive blocks · band XL
 *
 * Energy-yield assessments for one project. A gallery lists `Energy Yields` rows; one
 * command bar (`pcf_ProjectRevenues_Content_ContractCommandBar_1`) adds, edits, deletes,
 * activates and deactivates them, opening one of two nearly identical right panels — WTG
 * (wind speed) and PV (irradiation). Three radio pairs decide which side of each
 * relationship the user types and which side is derived. Two toggles per panel attach a
 * 12-month seasonality profile and a 15-year negative-price curve.
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  - The two 300-plus-line right panels. `deriveYieldFields` and one `YieldPanel`
 *    parameterised by technology replace both copies.
 *  - The negative-price → `Project Revenues` synchronisation block, which appears FOUR
 *    times verbatim (WTG save, PV save, activate/deactivate confirm, delete confirm).
 *    One `syncRevenueNegativePrices`.
 *  - `colProductionFormValidation` and its nine `{Name, Dirty}` rows, maintained by
 *    per-control `UpdateIf` handlers. Dirty is a diff; valid is computed.
 *  - Fourteen `Clear(col…)` calls in `OnHidden` plus the three `loc*` panel flags.
 *  - `btn_Seasonality_NegativePrice_Reset_Hidden` and
 *    `btn_Load_StandardContracts_For_Project` — 1 104 lines of hidden button used as a
 *    subroutine, reachable only through `Select(...)`. Split into `projectYieldTotals`,
 *    `shouldGenerate`, `buildLandLeaseContracts`, `buildOpexContracts` and
 *    `markForCapexRecalculationFields`, each pure and each returning payloads.
 *  - The `ForAll` inside `ForAll` inside `ForAll` in the contract generator; flattened.
 *  - `Mid(Text(1.1, "0.0", Language()), 2, 1)` for the decimal separator; `Intl` instead.
 *
 * FLOW NOTE — `SynchroniseRecalculationCapexStandardCost`.
 *   The only reference in the whole app is at `Project Production Screen.pa.yaml:9082`,
 *   inside a `/* … *\/` comment, together with the `Patch('Fabric Sync Jobs', …)` that
 *   created its input row. It is absent from `sol/Workflows/` and absent from the app's
 *   `References/DataSources.json` — it is not even a declared data source, so its
 *   behaviour is unrecoverable and is NOT invented here. What replaced it, in the same
 *   commit-shaped edit, is the four-column flag write immediately after the comment:
 *   `InitialP50Trigger = Yes` plus `CapexStandardContractsCreated`,
 *   `CapexStandardCostsCreated` and `BoPStandardContractsCreated` set to `No`. That is
 *   `markForCapexRecalculationFields` below. A server-side process (most likely the
 *   `LoadDevexCapexCostTotalCapacityTrigger` webhook flow that DOES ship) picks the flags
 *   up; the app does not wait for the result. No `src/flows/…` wrapper is created.
 *
 * SOURCE DEFECTS — each is commented at its rule:
 *  1. ambiguity 2 — `fn_Calculate_P75_P90.calculateUncertainty` is mathematically wrong.
 *     `@/domain/yieldStats` already ships both the corrected `uncertaintyFrom` and
 *     `calculateUncertaintyCanvasParity`; neither is reachable from this screen because
 *     both canvas call sites are commented out.
 *  2. ambiguity 3 — `PV Seasonality Values` and `PV Negative Prices` hold WTG data too.
 *  3. The total-losses `0–100` branch shows the "Gross Yield > Net Yield p50" message
 *     because its own message is commented out. Reproduced verbatim; it is user-facing.
 */
import {
  isNumeric, isInteger, isDecimalWithPlaces, inRange, parseNumber, pfxRound, isBlank,
  type Lang,
} from "@/domain/numeric";
import { addMonths } from "@/domain/dates";
import { p75, p90, NOT_COMPUTABLE } from "@/domain/yieldStats";
import { CHOICE_PRODUCTION } from "@/data/entities";

/* ═══════════════════════════════════════════════════════════════════ columns ════ */

/** `vsb_EnergyYield` logical names, read out of `sol/customizations.xml`. */
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
  /** Two-option boolean, not a picklist. */
  productionAllocation: "vsb_productionallocation",
  productionLossesP50: "vsb_productionlossesp50",
  productionUncertainty: "vsb_productionuncertaintyp75andp90",
  considerSeasonality: "vsb_considerseasonality",
  considerNegativePrices: "vsb_considernegativeprices",
  owningBusinessUnit: "_owningbusinessunit_value",
} as const;

/**
 * `vsb_PVSeasonalityValues`.
 *
 * SOURCE NOTE (ambiguity 3): this table is written by BOTH the WTG and the PV save path,
 * through the same `vsb_PVEnergyYield` lookup. Nothing in the schema distinguishes them;
 * the discriminator is the parent yield's `vsb_type`. The `PV` in the table and column
 * names is legacy, which is why the repository is called `seasonalityRepo`.
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

/** `vsb_PVNegativePrices`. Shared with WTG — see `SEASONALITY_COL`. */
export const NEGATIVE_PRICE_COL = {
  id: "vsb_pvnegativepricesid",
  name: "vsb_name",
  energyYield: "_vsb_pvenergyyield_value",
  year: "vsb_year",
  reduction: "vsb_netyieldp50reduction",
  isStandard: "vsb_isstandardvalue",
} as const;

/** `vsb_ProjectRevenue` — only the two negative-price columns are touched here. */
export const REVENUE_COL = {
  id: "vsb_projectrevenueid",
  description: "vsb_description",
  considerNegativePrices: "vsb_considernegativeprices",
  manualOverride: "vsb_negativepricemanualoverride",
} as const;

/** `Projects` columns this screen writes. */
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

export const PRODUCTION_LOOKUP = {
  project: "vsb_Project",
  energyYield: "vsb_PVEnergyYield",
  projectCost: "vsb_ProjectCost",
  subaccount: "vsb_Subaccount",
  deviceTypeInProject: "vsb_DeviceTypeInProject",
  parentCost: "vsb_ParentCost",
  currency: "vsb_Currency",
  generatorInProject: "vsb_GeneratorInProject",
  owningBusinessUnit: "owningbusinessunit",
} as const;

/* ═════════════════════════════════════════════════════════════════════ types ════ */

export type Technology = "WTG" | "PV";

/** The three radio pairs. Each is a two-option boolean column on `Energy Yields`. */
export type AllocationInputMode = "Input Irradiation" | "Input Gross Yield";
export type LossesInputMode = "Input losses" | "Input Net Yield p50";
export type UncertaintyInputMode = "Input Uncertainty" | "Input Net Yield p75/p90";

/** `'Yield Allocation'` — whole plant vs per-turbine figures. */
export type YieldAllocation = "Whole plant" | "Each turbine";

export interface ProductionProject {
  id: string;
  projectIdText: string | null;
  projectName: string | null;
  countryId: string | null;
  technology: number | null;
  totalCapacity: number | null;
  endDate: string | null;
  cod: string | null;
  netYieldP50: number | null;
  standardCostCreated: boolean;
  owningBusinessUnitId: string | null;
}

export interface EnergyYieldRow {
  id: string;
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
  considerSeasonality: boolean;
  considerNegativePrices: boolean;
  status: number;
}

export interface SeasonalityRow {
  /** 1..12 — the canvas `ID`. */
  id: number;
  month: string;
  value: number;
  isStandard: boolean;
}

export interface NegativePriceRow {
  year: number;
  reductionValue: number;
  standardReductionValue: number;
  standardAssumption: boolean;
}

export interface RevenueRow {
  id: string;
  description: string | null;
  considerNegativePrices: boolean;
  manualOverride: boolean;
}

/** A parsed row of `Assumptions Revenues SQL`, after the locale handling. */
export interface StandardSeasonalityRow { month: number; pv: number; wtg: number }
export interface StandardNegativePriceRow { year: number; pv: number; wind: number }

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export const MONTH_KEYS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/* ══════════════════════════════════════════════════════════════════ page lock ════ */

export const PAGE_LOCK_TITLE =
  "This page is locked. To unlock it, please complete the following sections:";

/**
 * Validation — `con_Milestones_Page_LockMessage_2.Visible =
 * Or(IsBlank('Project ID'), IsBlank('End Date'), Or('Total Capacity' = 0,
 *    IsBlank('Total Capacity')))`, with three bullets.
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
  pageLock(p).length > 0 || p === null;

/* ═══════════════════════════════════════════════════════════════ command bar ════ */

export const PRODUCTION_COMMAND_KEYS = [
  "newProductionWTG", "newProductionPV", "editProductionWTG", "editProductionPV",
  "deleteProductionItem", "activateProdItem", "deactivateProdItem",
] as const;

export type ProductionCommandKey = (typeof PRODUCTION_COMMAND_KEYS)[number];

export interface CommandItemState { visible: boolean; enabled: boolean; label: string }

/**
 * The `Items` table transcribed one-for-one. EVERY item is
 * `And(CanEditSelectedProject, 'Total Capacity' <> 0)` — no exceptions on this screen.
 *
 * Note `activateProdItem.ItemVisible` is `Status <> Active && !IsBlank(Status)` and its
 * twin is `Status <> Inactive && !IsBlank(Status)`, so with no selection BOTH are hidden
 * (a blank `Status` fails the second conjunct).
 */
export function commandBarState(ctx: {
  canEdit: boolean;
  project: ProductionProject | null;
  selected: EnergyYieldRow | null;
}): Record<ProductionCommandKey, CommandItemState> {
  const capacityOk = (ctx.project?.totalCapacity ?? 0) !== 0;
  const enabled = ctx.canEdit && capacityOk;
  const sel = ctx.selected;
  const hasStatus = sel !== null;
  return {
    newProductionWTG: { visible: true, enabled, label: "Add Production WTG" },
    newProductionPV: { visible: true, enabled, label: "Add Production PV" },
    editProductionWTG: {
      visible: sel?.type === CHOICE_PRODUCTION.yieldType.wtg,
      enabled,
      label: "Edit",
    },
    editProductionPV: {
      visible: sel?.type === CHOICE_PRODUCTION.yieldType.pv,
      enabled,
      label: "Edit",
    },
    deleteProductionItem: { visible: sel !== null, enabled, label: "Delete" },
    activateProdItem: {
      visible: hasStatus && sel.status !== 0,
      enabled,
      label: "Activate Production",
    },
    deactivateProdItem: {
      visible: hasStatus && sel.status !== 1,
      enabled,
      label: "Deactivate Production",
    },
  };
}

/* ══════════════════════════════════════════════════════════════ yield maths ════ */

/**
 * Rules 1–2 — p75/p90 come from `@/domain/yieldStats`, which already ports
 * `fn_Calculate_P75_P90` verbatim (`Round(p50 + z * (p50 * u), 0)` with
 * `z = -0.674490 / -1.281551`). NOT reimplemented here.
 *
 * The canvas returns `-1` for non-numeric input and every call site then compares the
 * component's TEXT output to the string `"-1"` to blank the field. That sentinel is a
 * canvas artefact: it is converted to `undefined` at the boundary so it can never leak
 * into a saved figure. Uncertainty is always passed as a FRACTION (the canvas divides
 * the typed percentage by 100 at every call site).
 */
export function derivedP75(
  p50Value: string | number,
  uncertaintyPercent: string | number,
): number | undefined {
  if (!isNumeric(p50Value) || !isNumeric(uncertaintyPercent)) return undefined;
  const v = p75(p50Value, parseNumber(uncertaintyPercent) / 100);
  return v === NOT_COMPUTABLE ? undefined : v;
}

export function derivedP90(
  p50Value: string | number,
  uncertaintyPercent: string | number,
): number | undefined {
  if (!isNumeric(p50Value) || !isNumeric(uncertaintyPercent)) return undefined;
  const v = p90(p50Value, parseNumber(uncertaintyPercent) / 100);
  return v === NOT_COMPUTABLE ? undefined : v;
}

/**
 * Rule 5 — `locTotalLoses = (1 - NetYieldP50 / GrossYield) * 100`, guarded on the radio
 * being *Input Net Yield p50* and gross yield non-blank.
 */
export function totalLossesPct(
  grossYield: number | null | undefined,
  netP50: number | null | undefined,
): number | undefined {
  if (!grossYield) return undefined;
  return (1 - (netP50 ?? 0) / grossYield) * 100;
}

/** Rule 5 — a NEW record opens with `locTotalLoses: 15`, `locUncertaintyValue: 10`. */
export const NEW_YIELD_DEFAULTS = { totalLosses: 15, uncertainty: 10 } as const;

export interface YieldFormInput {
  grossYield: number | null;
  netP50: number | null;
  netP75: number | null;
  netP90: number | null;
  totalLosses: number | null;
  uncertainty: number | null;
  windSpeed: number | null;
  irradiation: number | null;
}

export interface DerivedYieldFields {
  grossYield: number | null;
  netP50: number | null;
  netP75: number | null;
  netP90: number | null;
  totalLosses: number | undefined;
  uncertainty: number | undefined;
  windSpeed: number | null;
  irradiation: number | null;
}

/**
 * Rule 6 — the "Each turbine" allocation multiplies the FOUR yield fields by the turbine
 * count and blanks losses and uncertainty:
 *   'Gross Yield [MWh]' / 'Net Yield p50/75/90 [MWh]'
 *     = If(allocation = 'Each turbine', CountIf(turbines, true) * Value(input), Value(input))
 *   'Total losses [%]' / 'Uncertainty [%] '
 *     = If(allocation = 'Each turbine', Blank(), Value(input))
 *
 * Note this appears ONLY in the WTG save; the PV save writes the typed values straight
 * through. `turbineCount` is therefore 1-equivalent for PV, which the "Whole plant" arm
 * already gives.
 */
export function deriveYieldFields(
  input: YieldFormInput,
  allocation: YieldAllocation,
  turbineCount: number,
): DerivedYieldFields {
  const each = allocation === "Each turbine";
  const mul = (v: number | null) => (v === null ? null : each ? turbineCount * v : v);
  return {
    grossYield: mul(input.grossYield),
    netP50: mul(input.netP50),
    netP75: mul(input.netP75),
    netP90: mul(input.netP90),
    totalLosses: each ? undefined : input.totalLosses ?? undefined,
    uncertainty: each ? undefined : input.uncertainty ?? undefined,
    windSpeed: input.windSpeed,
    irradiation: input.irradiation,
  };
}

/** Rule 8 — the radio → option-set mapping, for the save payload. */
export function radioFields(modes: {
  allocationInput: AllocationInputMode;
  lossesInput: LossesInputMode;
  uncertaintyInput: UncertaintyInputMode;
}): Record<string, boolean> {
  return {
    // NOTE the option-set member is misspelled "Input Irradation" in the metadata; the
    // VALUE is what is written, so the typo never reaches the data.
    [YIELD_COL.productionAllocation]:
      modes.allocationInput === "Input Gross Yield"
        ? CHOICE_PRODUCTION.productionAllocation.inputGrossYield
        : CHOICE_PRODUCTION.productionAllocation.inputIrradiation,
    [YIELD_COL.productionLossesP50]:
      modes.lossesInput === "Input Net Yield p50"
        ? CHOICE_PRODUCTION.productionLossesP50.inputNetYieldP50
        : CHOICE_PRODUCTION.productionLossesP50.inputLosses,
    [YIELD_COL.productionUncertainty]:
      modes.uncertaintyInput === "Input Net Yield p75/p90"
        ? CHOICE_PRODUCTION.productionUncertainty.inputNetYieldP75P90
        : CHOICE_PRODUCTION.productionUncertainty.inputUncertainty,
  };
}

/**
 * Rule 9 — an EXTERNAL assessment supersedes the internal ones of the same `Type`:
 * all ACTIVE Internal yields of that type are set Inactive in one
 * `Patch('Energy Yields', colProductionActiveInternal)`.
 */
export function supersededInternalYields(args: {
  /** `'Yield Assessment'` value of the row just saved. */
  assessment: number;
  /** `'Yield Type'` value — WTG internals never supersede PV internals. */
  type: number;
  yields: EnergyYieldRow[];
  /** The row just saved — never supersedes itself. */
  savedId?: string | null;
}): string[] {
  if (args.assessment !== CHOICE_PRODUCTION.yieldAssessment.external) return [];
  return args.yields
    .filter(
      (y) =>
        y.id !== args.savedId &&
        y.status === 0 &&
        y.assessment === CHOICE_PRODUCTION.yieldAssessment.internal &&
        y.type === args.type,
    )
    .map((y) => y.id);
}

/* ══════════════════════════════════════════════════════════════ yield roll-up ════ */

export interface ProjectYieldTotals {
  grossYield: number;
  netP50: number;
  netP75: number;
  netP90: number;
  windSpeed: number;
  irradiation: number;
}

/** `IfError(Average(t, f), 0, Average(t, f))` — an empty table averages to 0. */
function avg(rows: EnergyYieldRow[], pick: (r: EnergyYieldRow) => number | null): number {
  if (rows.length === 0) return 0;
  const total = rows.reduce((s, r) => s + (pick(r) ?? 0), 0);
  return total / rows.length;
}

/**
 * Rule 16 — the project roll-up is the SUM OF TWO AVERAGES over the active WTG yields and
 * the active PV yields. `'Wind Speed at Hub Height [m/s]'` is the WTG average only;
 * `'Irradiation [kWh/kWp]'` the PV average only. `Status = 0` is Active.
 *
 * The caller passes rows already filtered by type; `projectYieldTotals` re-applies the
 * active filter so the rule cannot be defeated by a sloppy caller.
 */
export function projectYieldTotals(
  wtgYields: EnergyYieldRow[],
  pvYields: EnergyYieldRow[],
): ProjectYieldTotals {
  const wtg = wtgYields.filter((y) => y.status === 0);
  const pv = pvYields.filter((y) => y.status === 0);
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

/* ═══════════════════════════════════════════════════════════════ seasonality ════ */

/**
 * Rule 10 — on toggle-on, twelve rows are seeded from the Fabric standard table:
 * `ForAll(Sequence(12,1), {ID, Month: Text(Date(Year(Today()), n, 1), "mmmm"),
 *                          Value: LookUp(standard, Month = n).<PV|WTG>, IsStandard: true})`
 * A month missing from the standard table seeds 0 (the canvas `LookUp` returns blank,
 * which `Value()` coerces to 0).
 */
export function buildSeasonalityRows(
  standard: StandardSeasonalityRow[],
  technology: Technology,
): SeasonalityRow[] {
  return MONTH_NAMES.map((month, i) => {
    const row = standard.find((s) => s.month === i + 1);
    const value = row ? (technology === "PV" ? row.pv : row.wtg) : 0;
    return { id: i + 1, month, value: value ?? 0, isStandard: true };
  });
}

/**
 * Rule 11 — editing ANY month clears the standard flag on ALL TWELVE:
 * `UpdateIf(col, IsStandard = true, {IsStandard: false})` runs before the per-row patch.
 */
export function applyMonthEdit(
  rows: SeasonalityRow[],
  id: number,
  value: number,
): SeasonalityRow[] {
  return rows.map((r) => ({
    ...r,
    isStandard: false,
    value: r.id === id ? value : r.value,
  }));
}

export const seasonalityTotal = (rows: SeasonalityRow[]): number =>
  rows.reduce((s, r) => s + (Number.isFinite(r.value) ? r.value : 0), 0);

/** Validation — `Round(Value(total), 1) <> 100.0` disables Save. */
export const isSeasonalityValid = (rows: SeasonalityRow[]): boolean =>
  pfxRound(seasonalityTotal(rows), 1) === 100;

/**
 * Rule 11 — the per-month flags survive to Dataverse only as the `'Standard Values JSON'`
 * string `{"Jan":true,…,"Dec":true}`. The canvas builds it with `Text(bool)`, which emits
 * lowercase `true`/`false`, i.e. valid JSON.
 */
export function serialiseStandardValuesJson(rows: SeasonalityRow[]): string {
  const map: Record<string, boolean> = {};
  MONTH_KEYS.forEach((key, i) => {
    map[key] = rows.find((r) => r.id === i + 1)?.isStandard ?? false;
  });
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

/** Rule 12 — the twelve month columns plus the JSON flags, as one write payload. */
export function seasonalityFields(args: {
  rows: SeasonalityRow[];
  yieldDescription: string | null;
}): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    [SEASONALITY_COL.name]: `Seasonality - ${args.yieldDescription ?? ""}`,
    [SEASONALITY_COL.standardValuesJson]: serialiseStandardValuesJson(args.rows),
  };
  SEASONALITY_COL.months.forEach((col, i) => {
    fields[col] = args.rows.find((r) => r.id === i + 1)?.value ?? 0;
  });
  return fields;
}

/* ═══════════════════════════════════════════════════════════ negative prices ════ */

/**
 * Rule 13 — a 15-year curve anchored on the COD year:
 * `ForAll(Sequence(15), {Year: startYear + Value - 1,
 *                        ReductionValue: If(IsBlank(std), 0, Value(std)),
 *                        StandardAssumption: Not(IsBlank(std))})`
 * WTG reads the `.Wind` column, PV reads `.PV`.
 */
export const NEGATIVE_PRICE_YEARS = 15;

export function buildNegativePriceRows(
  codYear: number,
  standard: StandardNegativePriceRow[],
  technology: Technology,
): NegativePriceRow[] {
  const rows: NegativePriceRow[] = [];
  for (let i = 0; i < NEGATIVE_PRICE_YEARS; i++) {
    const year = codYear + i;
    const std = standard.find((s) => s.year === year);
    const value = std ? (technology === "PV" ? std.pv : std.wind) : null;
    const present = value !== null && value !== undefined;
    rows.push({
      year,
      reductionValue: present ? value : 0,
      standardReductionValue: present ? value : 0,
      standardAssumption: present,
    });
  }
  return rows;
}

export interface NegativePriceWritePlan {
  upserts: { id: string | null; year: number; reduction: number; isStandard: boolean }[];
  deletes: string[];
}

/**
 * Rule 14 — the per-year upsert against the rows already stored for this yield.
 *
 * The canvas issues one `Patch` per year unconditionally; here only the rows that
 * actually changed are written, and stored years the curve no longer covers are removed.
 * The canvas never removed those, which is how a shifted COD leaves orphan years behind.
 */
export function planNegativePriceWrites(
  current: NegativePriceRow[],
  stored: { id: string; year: number; reduction: number | null; isStandard: boolean }[],
): NegativePriceWritePlan {
  const byYear = new Map(stored.map((s) => [s.year, s]));
  const upserts: NegativePriceWritePlan["upserts"] = [];
  for (const row of current) {
    const existing = byYear.get(row.year);
    if (
      existing &&
      (existing.reduction ?? 0) === row.reductionValue &&
      existing.isStandard === row.standardAssumption
    ) {
      continue;
    }
    upserts.push({
      id: existing?.id ?? null,
      year: row.year,
      reduction: row.reductionValue,
      isStandard: row.standardAssumption,
    });
  }
  const covered = new Set(current.map((r) => r.year));
  return { upserts, deletes: stored.filter((s) => !covered.has(s.year)).map((s) => s.id) };
}

export const negativePriceFields = (row: {
  year: number; reduction: number; isStandard: boolean;
}): Record<string, unknown> => ({
  [NEGATIVE_PRICE_COL.name]: `Negative Price - ${row.year}`,
  [NEGATIVE_PRICE_COL.year]: row.year,
  [NEGATIVE_PRICE_COL.reduction]: row.reduction,
  [NEGATIVE_PRICE_COL.isStandard]: row.isStandard,
});

/**
 * Rule 15 — the revenue synchronisation, duplicated FOUR times in the canvas.
 *
 *   if no ACTIVE yield has 'Consider Negative Prices' = Yes
 *      → every revenue with Yes AND manualOverride = No becomes No
 *   if at least one does, and revenues exist with No AND manualOverride = No
 *      → they become Yes
 *   rows with manualOverride = Yes are never touched.
 */
export function syncRevenueNegativePrices(args: {
  activeYields: EnergyYieldRow[];
  revenues: RevenueRow[];
}): { id: string; considerNegativePrices: boolean }[] {
  const anyYield = args.activeYields.some(
    (y) => y.status === 0 && y.considerNegativePrices,
  );
  const editable = args.revenues.filter((r) => !r.manualOverride);
  if (!anyYield) {
    return editable
      .filter((r) => r.considerNegativePrices)
      .map((r) => ({ id: r.id, considerNegativePrices: false }));
  }
  return editable
    .filter((r) => !r.considerNegativePrices)
    .map((r) => ({ id: r.id, considerNegativePrices: true }));
}

/* ═══════════════════════════════════════════════════ Fabric / locale parsing ════ */

/** The runtime decimal separator, from `Intl` rather than `Mid(Text(1.1,"0.0",…),2,1)`. */
export function decimalSeparatorFor(locale: string): "." | "," {
  const parts = new Intl.NumberFormat(locale).formatToParts(1.1);
  const dec = parts.find((p) => p.type === "decimal")?.value;
  return dec === "," ? "," : ".";
}

/**
 * Rule 27 — Fabric values arrive as STRINGS and the canvas parses them as
 * `Switch(langRoot, "en", Value(v), Value(Substitute(v, ".", ",")))`, i.e. an English
 * runtime reads `"0.075"` as 0.075 and a German one rewrites the point to a comma first
 * so `Value()` still reads 0.075. Both paths mean the same number; done once, here, so
 * `Substitute(".", ",")` never reaches the UI.
 */
export function parseFabricNumber(
  raw: string | number | null | undefined,
  locale: string,
): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  if (typeof raw === "number") return raw;
  const sep = decimalSeparatorFor(locale);
  const normalised = sep === "," ? raw.replace(/\./g, ",") : raw;
  const n = parseNumber(normalised, sep === "," ? "de-DE" : "en-US");
  return Number.isFinite(n) ? n : 0;
}

/** Rule 24 — `Value(Text(amount, "##0.00"))`, a 2-dp normalisation through text. */
export const normaliseAmount = (v: number | null | undefined): number =>
  v === null || v === undefined || !Number.isFinite(v) ? 0 : pfxRound(v, 2);

/* ═════════════════════════════════════════════════════════════════ validation ════ */

/** Every user-facing message, verbatim from the canvas error labels. */
export const MSG = {
  /** `lbl_ProductionDataWTG_Error_TotalLosses.Text` — verbatim. */
  grossYieldOrder: "Please ensure Gross Yield > Net Yield p50",
  /** `lbl_ProductionDataPV_Error_TotalLosses.Text` — verbatim. */
  oneDecimal: "Numeric value with maximum of one decimals",
  /** `lbl_ProductionDataPV_Error_TotalLosses.Text` — verbatim. */
  uncertaintyRange: "Please select a value between 0 and 100.",
  /** `lbl_ProductionDataWTG_Error_GrossYield.Text` — verbatim. */
  p50Integer: "Numeric value without Decimal",
  /** `lbl_ProductionDataPV_Error_NetYieldP50.Text` — verbatim. */
  p50Range: "Please select a value between 0 and 2000000.",
  /** `lbl_ProductionDataPV_Error_NetYieldP75.Text` — verbatim. */
  p75Integer: "Numeric value without Decimals",
  /** `lbl_ProductionDataPV_Error_NetYieldP75.Text` — verbatim. */
  p75BelowP50: "Net Yield p75 should be below Net Yield p50",
  /** `lbl_ProductionDataPV_Error_NetYieldP90.Text` — verbatim. */
  p90Integer: "A Positive Numeric value without Decimals",
  /** `lbl_ProductionDataPV_Error_NetYieldP90.Text` — verbatim. */
  p90BelowP75: "Net Yield p90 should be below Net Yield p75",
  /** `lbl_ProductionDataPV_Error_NetYieldP75.Text` — verbatim. */
  negativeYield: "Please reduce the uncertainty to ensure a positive yield",
  /** `lbl_ProductionNegativePricePV_ErrorMessage.Text` — verbatim. */
  cellEmpty: "Must not be empty",
  /** `lbl_ProductionNegativePricePV_ErrorMessage.Text` — verbatim. */
  cellRange: "Number (0–100) with max. one decimal",
  /** `lbl_ProductionSeasonalityPV_TotalErrorMessage.Text` — verbatim. */
  seasonalityTotal: "Total must match 100%",
} as const;

/**
 * Validation — total losses.
 *
 * SOURCE DEFECT reproduced: the `0…100` branch's own message
 * (`"Please select a value between 0 and 100."`) is COMMENTED OUT in the canvas and the
 * gross-yield message is shown instead. That string is user-facing, so it is reproduced
 * rather than "fixed".
 */
export function validateTotalLosses(
  value: string,
  opts: { derived: boolean },
  lang: Lang = "en-US",
): string | null {
  const v = value.trim();
  if (v === "") return null;
  if (opts.derived && parseNumber(v, lang) < 0) return MSG.grossYieldOrder;
  if (!isDecimalWithPlaces(v, 1, lang)) return MSG.oneDecimal;
  if (!inRange(v, 0, 100, lang)) return MSG.grossYieldOrder;
  return null;
}

export function validateUncertainty(value: string, lang: Lang = "en-US"): string | null {
  const v = value.trim();
  if (v === "") return null;
  if (!isDecimalWithPlaces(v, 1, lang)) return MSG.oneDecimal;
  if (!inRange(v, 0, 100, lang)) return MSG.uncertaintyRange;
  return null;
}

/**
 * Validation — Net Yield p50: integer via
 * `fn_Numeric_With_Separtors_Production.IsInteger(Value(Text(v, "##,###", Language())))`
 * then `InRange(0, 2000000)`.
 */
export function validateNetYieldP50(value: string, lang: Lang = "en-US"): string | null {
  const v = value.trim();
  if (v === "") return null;
  if (!isInteger(v.replace(/[\s,](?=\d{3}\b)/g, ""), lang) && !isInteger(v, lang)) {
    return MSG.p50Integer;
  }
  if (!inRange(v, 0, 2_000_000, lang)) return MSG.p50Range;
  return null;
}

export function validateNetYieldP75(
  value: string,
  ctx: { mode: UncertaintyInputMode; p50: string },
  lang: Lang = "en-US",
): string | null {
  const v = value.trim();
  if (ctx.mode === "Input Uncertainty") {
    return parseNumber(v, lang) < 0 ? MSG.negativeYield : null;
  }
  if (v === "") return null;
  if (!isInteger(v, lang)) return MSG.p75Integer;
  if (!(parseNumber(ctx.p50, lang) > parseNumber(v, lang))) return MSG.p75BelowP50;
  if (!inRange(v, 0, 2_000_000, lang)) return MSG.p50Range;
  return null;
}

export function validateNetYieldP90(
  value: string,
  ctx: { mode: UncertaintyInputMode; p75: string },
  lang: Lang = "en-US",
): string | null {
  const v = value.trim();
  if (ctx.mode === "Input Uncertainty") {
    return parseNumber(v, lang) < 0 ? MSG.negativeYield : null;
  }
  if (v === "") return null;
  if (!isInteger(v, lang)) return MSG.p90Integer;
  if (
    ctx.p75.trim() !== "" &&
    !(parseNumber(ctx.p75, lang) > parseNumber(v, lang))
  ) {
    return MSG.p90BelowP75;
  }
  if (!inRange(v, 0, 2_000_000, lang)) return MSG.p50Range;
  return null;
}

/**
 * Rule 28 — the seasonality-month and negative-price-year cells validate against the
 * RUNTIME decimal separator:
 * `IsMatch(v, "^0*(100([,]0)?|[0-9]{1,2}([,][0-9])?)$")` or the `.` variant.
 */
export function validateCellPercent(value: string, locale = "en-US"): string | null {
  const v = value.trim();
  if (v === "") return MSG.cellEmpty;
  const sep = decimalSeparatorFor(locale);
  const s = sep === "," ? "," : "\\.";
  const rx = new RegExp(`^0*(100(${s}0)?|[0-9]{1,2}(${s}[0-9])?)$`);
  return rx.test(v) ? null : MSG.cellRange;
}

export interface YieldFormState {
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
  allocation: YieldAllocation;
  considerSeasonality: boolean;
  considerNegativePrices: boolean;
  dirty: Set<string>;
}

/**
 * The full `DisplayMode` disjunction of
 * `pcf_btn_…_PvModuleType_Buttons_Save_1.DisplayMode` (and its PV twin).
 *
 * Save is DISABLED if any of:
 *   Description blank; Wind Speed blank (WTG); any of the seven error labels non-empty;
 *   *Input Uncertainty* and Uncertainty blank, or *Input Net Yield p75/p90* and p75 OR
 *   p90 blank; *Input losses* and Total Losses OR Gross Yield blank, or *Input Net Yield
 *   p50* and p50 blank; seasonality on and `Round(total,1) <> 100`; negative prices on
 *   and any year cell fails the locale regex.
 */
export function canSaveYield(args: {
  form: YieldFormState;
  technology: Technology;
  seasonality: SeasonalityRow[];
  negativePrices: { value: string }[];
  locale?: string;
  lang?: Lang;
}): boolean {
  const f = args.form;
  const lang = args.lang ?? "en-US";
  const locale = args.locale ?? "en-US";
  if (isBlank(f.description.trim())) return false;
  if (args.technology === "WTG" && isBlank(f.windSpeed.trim())) return false;

  const errors = [
    validateTotalLosses(f.totalLosses, { derived: f.lossesInput === "Input Net Yield p50" }, lang),
    validateUncertainty(f.uncertainty, lang),
    validateNetYieldP50(f.netP50, lang),
    validateNetYieldP75(f.netP75, { mode: f.uncertaintyInput, p50: f.netP50 }, lang),
    validateNetYieldP90(f.netP90, { mode: f.uncertaintyInput, p75: f.netP75 }, lang),
  ];
  if (errors.some((e) => e !== null)) return false;

  if (f.uncertaintyInput === "Input Uncertainty") {
    if (isBlank(f.uncertainty.trim())) return false;
  } else if (isBlank(f.netP75.trim()) || isBlank(f.netP90.trim())) {
    return false;
  }

  if (f.lossesInput === "Input losses") {
    if (isBlank(f.totalLosses.trim()) || isBlank(f.grossYield.trim())) return false;
  } else if (isBlank(f.netP50.trim())) {
    return false;
  }

  if (f.considerSeasonality && !isSeasonalityValid(args.seasonality)) return false;
  if (
    f.considerNegativePrices &&
    args.negativePrices.some((r) => validateCellPercent(r.value, locale) !== null)
  ) {
    return false;
  }
  return true;
}

/** Rule 29 — leaving with unsaved work is confirmed. */
export const LEAVE_CONFIRMATION =
  "You have unsaved changes on this page. Leave without saving?";

export const hasUnsavedChanges = (dirty: Set<string>): boolean => dirty.size > 0;

/* ══════════════════════════════════════════════════ standard contracts ════ */

/** A row of `OPEX & Land Lease Standard Assumptions`, reduced to what the builders need. */
export interface StandardAssumption {
  id: string;
  name: string | null;
  description: string | null;
  period: number | null;
  typeOfContract: number | null;
  landLeaseSubaccountId: string | null;
  landLeaseSubaccountName: string | null;
  opexSubaccountId: string | null;
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

/** Rule 17 — one-shot, gated on p50. */
export function shouldGenerate(
  project: Pick<ProductionProject, "netYieldP50" | "standardCostCreated">,
): boolean {
  return (project.netYieldP50 ?? 0) > 0 && project.standardCostCreated === false;
}

/** Rule 19 — the inflation start year is COD year + 1. */
export function inflationStartYear(cod: string | Date | null | undefined): number | null {
  if (!cod) return null;
  const y = new Date(cod).getFullYear();
  return Number.isFinite(y) ? y + 1 : null;
}

/**
 * Rule 20 — the three-way inflation switch:
 *   useInflationProfile ∧ useCountryInflationProfile → the Country Inflation Profile for
 *                                                      the project's country and COD+1
 *   useInflationProfile ∧ ¬useCountryInflationProfile → the assumption's own profile
 *   otherwise                                         → Blank()
 */
export function resolveInflation(args: {
  assumption: Pick<
    StandardAssumption, "useInflationProfile" | "useCountryInflationProfile" | "inflationProfile"
  >;
  countryProfile: number | null | undefined;
}): number | undefined {
  const a = args.assumption;
  if (a.useInflationProfile && a.useCountryInflationProfile) {
    return args.countryProfile ?? undefined;
  }
  if (a.useInflationProfile && !a.useCountryInflationProfile) {
    return a.inflationProfile ?? undefined;
  }
  return undefined;
}

export interface LandLeaseContractPayload {
  kind: "landLeaseCost";
  assumptionId: string;
  subaccountId: string | null;
  fields: Record<string, unknown>;
}
export interface LandLeasePeriodPayload {
  kind: "landLeasePeriod";
  assumptionId: string;
  /** Which generated cost row this period belongs to, by land-lease subaccount. */
  subaccountId: string | null;
  startDate: Date;
  fields: Record<string, unknown>;
}
export interface AllocationPayload {
  kind: "landLeaseAllocation";
  subaccountId: string | null;
  generatorInProjectId: string;
  name: string;
}

export type LandLeaseBuildResult = {
  costs: LandLeaseContractPayload[];
  periods: LandLeasePeriodPayload[];
  allocations: AllocationPayload[];
};

/** The `Opex & Land Lease Period` → `Land Lease Period` translation (Period 10 has no twin). */
export function toLandLeasePeriod(opexPeriod: number | null): number {
  const opex: number[] = Object.values(CHOICE_PRODUCTION.opexLandLeasePeriod);
  const idx = opex.indexOf(opexPeriod ?? -1);
  const landLease: number[] = Object.values(CHOICE_PRODUCTION.landLeasePeriod);
  return idx >= 0 && idx < landLease.length ? landLease[idx] : landLease[0];
}

/**
 * Rules 18–21, 23–24 — the land-lease half of `btn_Load_StandardContracts_For_Project`.
 *
 * Pure: returns the row payloads, never writes. The canvas nests `ForAll` inside `ForAll`
 * inside `ForAll` and drives the period chain through a mutable collection
 * (`colLoadLandLeasePeriods`) that it clears every time it meets a Period 1; that
 * accumulator is a local variable here.
 */
export function buildLandLeaseContracts(args: {
  project: ProductionProject;
  assumptions: StandardAssumption[];
  /** Existing `Land Lease Project Costs` flagged `Is Standard Contract? = Yes`. */
  existingStandardCosts: { id: string }[];
  generators: { id: string; name: string | null }[];
  countryProfile: number | null | undefined;
  landOwnerByAssumption?: Record<string, string | null>;
}): LandLeaseBuildResult {
  const empty: LandLeaseBuildResult = { costs: [], periods: [], allocations: [] };
  // Rule 18 — nothing is generated once the project already has standard contracts.
  if (args.existingStandardCosts.length > 0) return empty;
  if (!args.project.cod) return empty;

  const codDate = new Date(args.project.cod);
  const codYear = inflationStartYear(args.project.cod)!;

  const scoped = args.assumptions
    .filter((a) => a.typeOfContract === CHOICE_PRODUCTION.typeOfContract.landlease)
    .slice()
    .sort((a, b) => (a.description ?? "").localeCompare(b.description ?? ""));

  const costs: LandLeaseContractPayload[] = [];
  const allocations: AllocationPayload[] = [];

  for (const a of scoped) {
    if (a.period !== CHOICE_PRODUCTION.opexLandLeasePeriod.period1) continue;
    const inflation = resolveInflation({ assumption: a, countryProfile: args.countryProfile });
    costs.push({
      kind: "landLeaseCost",
      assumptionId: a.id,
      subaccountId: a.landLeaseSubaccountId,
      fields: {
        "vsb_name":
          `${args.project.projectName ?? ""}-${a.landLeaseSubaccountName ?? ""}-${a.name ?? ""}`,
        "vsb_description": a.description,
        // `Secured (OPEX…)` is a Yes/No two-option; `Secured (Land Lease…)` is a picklist.
        "vsb_secured": a.secured
          ? CHOICE_PRODUCTION.landLeaseSecured.yes
          : CHOICE_PRODUCTION.landLeaseSecured.no,
        "vsb_allwtgallocated": a.allWtgAllocated,
        "vsb_useinflationprofile": a.useInflationProfile,
        "vsb_usecountryinflationprofile": a.useCountryInflationProfile,
        "vsb_inflationprofile": inflation ?? null,
        "vsb_inflationcountryarea": a.inflationCountryArea,
        "vsb_inflationstartyear": codYear,
        "vsb_duedateonetimepayment": a.dueDateOneTimePayment,
        "vsb_duedateonetimepayment2": a.dueDateOneTimePayment2,
        "vsb_duedateonetimepayment3": a.dueDateOneTimePayment3,
        // Rule 24 — a 2-dp normalisation performed through `Text(v, "##0.00")`.
        "vsb_amountonetimepayment": normaliseAmount(a.amountOneTimePayment),
        "vsb_amountonetimepayment2": normaliseAmount(a.amountOneTimePayment2),
        "vsb_amountonetimepayment3": normaliseAmount(a.amountOneTimePayment3),
        // Rule 23 — generated contracts are stamped as standard.
        "vsb_isstartdatestandardassumption": true,
        "vsb_isstandardcontract": true,
      },
    });

    // Rule 21 — one allocation row per turbine for `AllWTGAllocated = Yes` contracts.
    if (a.allWtgAllocated) {
      const owner = args.landOwnerByAssumption?.[a.id] ?? null;
      for (const g of args.generators) {
        allocations.push({
          kind: "landLeaseAllocation",
          subaccountId: a.landLeaseSubaccountId,
          generatorInProjectId: g.id,
          name: `${owner ?? ""}-${a.description ?? ""}-${g.name ?? ""}`,
        });
      }
    }
  }

  /*
   * The period chain. The canvas walks ALL sorted assumptions and clears its accumulator
   * whenever it meets a Period 1, so each land-lease subaccount chain restarts there.
   */
  const periods: LandLeasePeriodPayload[] = [];
  let chain: LandLeasePeriodPayload[] = [];
  for (const a of scoped) {
    if (a.period === CHOICE_PRODUCTION.opexLandLeasePeriod.period1) chain = [];
    const last = chain
      .slice()
      .sort((x, y) => Number(x.fields["vsb_period"]) - Number(y.fields["vsb_period"]))
      .pop();
    const startDate =
      a.period === CHOICE_PRODUCTION.opexLandLeasePeriod.period1 || !last
        ? codDate
        : addMonths(
            last.startDate,
            (Number(last.fields["vsb_landleasedurationyears"]) || 0) * 12 +
              (Number(last.fields["vsb_landleasedurationmonths"]) || 0),
          );
    const payload: LandLeasePeriodPayload = {
      kind: "landLeasePeriod",
      assumptionId: a.id,
      subaccountId: a.landLeaseSubaccountId,
      startDate,
      fields: {
        "vsb_name": a.description,
        "vsb_period": toLandLeasePeriod(a.period),
        "vsb_startdate": startDate.toISOString(),
        "vsb_fixedcosts": normaliseAmount(a.fixCosts),
        "vsb_aggregation": a.aggregation,
        "vsb_landleasedurationyears": a.durationInYears ?? 0,
        "vsb_landleasedurationmonths": a.durationInMonths ?? 0,
        "vsb_eurmwh": a.eurMwh ?? 0,
        "vsb_eurmw": a.eurMw ?? 0,
        "vsb_eurwtg": a.eurWtg ?? 0,
        "vsb_distributionfrequency": a.distributionFrequency ?? 0,
        "vsb_ofrevenues": a.ofRevenues,
      },
    };
    chain.push(payload);
    periods.push(payload);
  }

  return { costs, periods, allocations };
}

export interface OpexContractPayload {
  kind: "opexCost" | "opexPeriod";
  assumptionId: string;
  deviceTypeInProjectId: string;
  /** Period 2+ rows hang off the Period 1 cost row of the same device type. */
  parentDeviceTypeInProjectId: string | null;
  startDate: Date;
  fields: Record<string, unknown>;
}

/**
 * Rules 22–24 — the O&M half.
 *
 * Period 1 creates the cost row itself (one per device type in project); later periods
 * create child `Opex Project Costs` rows whose start dates chain:
 *   Period 1 → recCODDate
 *   Period 2 → DateAdd(cost.'Start Date', years*12 + months, Months)
 *   Period n → the same expression against the LAST period sorted by Description
 */
export function buildOpexContracts(args: {
  project: ProductionProject;
  assumptions: StandardAssumption[];
  /** Existing O&M `Opex Project Costs` flagged `Is Standard Contract? = Yes`. */
  existingStandardCosts: { id: string }[];
  deviceTypes: { id: string }[];
  oAndMSubaccountName: string;
  countryProfile: number | null | undefined;
}): OpexContractPayload[] {
  if (args.existingStandardCosts.length > 0) return [];
  if (!args.project.cod) return [];

  const codDate = new Date(args.project.cod);
  const codYear = inflationStartYear(args.project.cod)!;
  const scoped = args.assumptions
    .filter((a) => a.typeOfContract === CHOICE_PRODUCTION.typeOfContract.opexOandM)
    .slice()
    .sort((a, b) => (a.description ?? "").localeCompare(b.description ?? ""));

  const common = (a: StandardAssumption, startDate: Date): Record<string, unknown> => ({
    "vsb_name": `${args.oAndMSubaccountName}-${args.oAndMSubaccountName}-${a.description ?? ""}`,
    "vsb_description": (a.description ?? "").trim(),
    "vsb_startdate": startDate.toISOString(),
    "vsb_opexprojectdurationyears": a.durationInYears ?? 0,
    "vsb_opexprojectdurationmonths": a.durationInMonths ?? 0,
    "vsb_fixcosts": a.fixCosts,
    "vsb_ofrevenues": a.ofRevenues,
    "vsb_threshold": a.threshold,
    "vsb_thresholdtype": a.thresholdType,
    "vsb_thresholdindividual": a.thresholdIndividual,
    "vsb_eurmwh": a.eurMwh,
    "vsb_eurmw": a.eurMw,
    "vsb_eurwtg": a.eurWtg,
    "vsb_aggregation": a.aggregation,
    "vsb_useinflationprofile": a.useInflationProfile,
    "vsb_usecountryinflationprofile": a.useCountryInflationProfile,
    "vsb_inflationprofile":
      resolveInflation({ assumption: a, countryProfile: args.countryProfile }) ?? null,
    "vsb_inflationstartyear": codYear,
    "vsb_inflationcountryarea": a.inflationCountryArea,
    "vsb_distributionfrequency": a.distributionFrequency,
    "vsb_alignwithprojectduration": a.alignWithProjectDuration,
    "vsb_isstartdatestandardassumption": true,
    "vsb_isstandardcontract": true,
    "vsb_externalcontract": a.externalContract,
  });

  const out: OpexContractPayload[] = [];
  for (const device of args.deviceTypes) {
    // Period 1 — the cost row.
    const period1 = scoped.filter(
      (a) => a.period === CHOICE_PRODUCTION.opexLandLeasePeriod.period1,
    );
    let anchor: OpexContractPayload | null = null;
    for (const a of period1) {
      const payload: OpexContractPayload = {
        kind: "opexCost",
        assumptionId: a.id,
        deviceTypeInProjectId: device.id,
        parentDeviceTypeInProjectId: null,
        startDate: codDate,
        fields: common(a, codDate),
      };
      out.push(payload);
      anchor = anchor ?? payload;
    }

    // Periods 2+ — the children, chained.
    const chain: OpexContractPayload[] = [];
    for (const a of scoped) {
      if (a.period === CHOICE_PRODUCTION.opexLandLeasePeriod.period1) continue;
      const base =
        a.period === CHOICE_PRODUCTION.opexLandLeasePeriod.period2 || chain.length === 0
          ? anchor
          : chain
              .slice()
              .sort((x, y) =>
                String(x.fields["vsb_description"]).localeCompare(
                  String(y.fields["vsb_description"]),
                ),
              )
              .pop() ?? anchor;
      if (!base) continue;
      const startDate = addMonths(
        base.startDate,
        (Number(base.fields["vsb_opexprojectdurationyears"]) || 0) * 12 +
          (Number(base.fields["vsb_opexprojectdurationmonths"]) || 0),
      );
      const payload: OpexContractPayload = {
        kind: "opexPeriod",
        assumptionId: a.id,
        deviceTypeInProjectId: device.id,
        parentDeviceTypeInProjectId: device.id,
        startDate,
        fields: common(a, startDate),
      };
      chain.push(payload);
      out.push(payload);
    }
  }
  return out;
}

/**
 * Rule 25 — the recalculation handoff is a SET OF FLAGS, not a flow call.
 *
 * See the FLOW NOTE at the top of this file: `SynchroniseRecalculationCapexStandardCost`
 * is commented out at `Project Production Screen.pa.yaml:9082`, absent from
 * `sol/Workflows/` and absent from `References/DataSources.json`. It is deliberately not
 * reconstructed. A server-side process consumes these four columns; the app does not wait.
 */
export function markForCapexRecalculationFields(): Record<string, unknown> {
  return {
    [PROJECT_YIELD_COL.initialP50Trigger]: true,
    [PROJECT_YIELD_COL.capexStandardContractsCreated]: false,
    [PROJECT_YIELD_COL.capexStandardCostsCreated]: false,
    [PROJECT_YIELD_COL.bopStandardContractsCreated]: false,
  };
}

/* ═══════════════════════════════════════════════════════════════════ display ════ */

export const yieldTypeLabel = (t: number | null): Technology | "" =>
  t === CHOICE_PRODUCTION.yieldType.wtg ? "WTG"
  : t === CHOICE_PRODUCTION.yieldType.pv ? "PV"
  : "";

export const assessmentLabel = (a: number | null): string =>
  a === CHOICE_PRODUCTION.yieldAssessment.external ? "External"
  : a === CHOICE_PRODUCTION.yieldAssessment.internal ? "Internal"
  : "";

export const allocationLabel = (a: number | null): YieldAllocation =>
  a === CHOICE_PRODUCTION.yieldAllocation.eachTurbine ? "Each turbine" : "Whole plant";

export const fmtMwh = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v)
    ? "—"
    : v.toLocaleString("en-US", { maximumFractionDigits: 0 });

export const fmtOneDecimal = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v)
    ? "—"
    : v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const numericOr = (value: string, fallback: number, lang: Lang = "en-US"): number =>
  isNumeric(value, lang) ? parseNumber(value, lang) : fallback;

/**
 * NEW — no canvas equivalent: the code app surfaces a failed energy-yield save; the canvas
 * closed the panel regardless
 */
export const SAVE_ERROR_PREFIX = "Energy yield could not be saved";

/* ═════════════════════════════════════════════════════════ GUIDE q12–q16 ════ */

/**
 * GUIDE q12 — the 2×3 summary grid's exact labels, units included, in the order the
 * screenshot renders them (Gross Yield, Wind Speed, Irradiation, then p50/p75/p90).
 */
export const SUMMARY_LABELS = {
  /** `lbl_Production_DisplayProject_Body_Form_GrossYield.Text` — verbatim. */
  grossYield: "Gross Yield [MWh]",
  /** `lbl_Production_DisplayProject_Body_Form_WindSpeed.Text` — verbatim. */
  windSpeed: "Wind Speed at Hub Height [m/s]",
  /** `lbl_Production_DisplayProject_Body_Form_Irradation.Text` — verbatim. */
  irradiation: "Irradiation [kWh/kWp]",
  /** `lbl_Production_DisplayProject_Body_Form_NetYield_p50.Text` — verbatim. */
  netP50: "Net Yield p50 [MWh]",
  /** `lbl_Production_DisplayProject_Body_Form_NetYield_p75.Text` — verbatim. */
  netP75: "Net Yield p75 [MWh]",
  /** `lbl_Production_DisplayProject_Body_Form_NetYield_p90.Text` — verbatim. */
  netP90: "Net Yield p90 [MWh]",
} as const;

/**
 * GUIDE q12 — the summary tiles show a genuinely empty field, not "0", when a total has
 * no contributing yield: `Irradiation [kWh/kWp]` is blank with no PV record on the
 * project, even though `projectYieldTotals` legitimately returns 0 for an empty
 * technology (it mirrors the canvas `IfError(Average(t,f), 0, Average(t,f))`). The
 * blanking is display-only and belongs here, not in the roll-up.
 */
export function fmtSummaryValue(v: number | null | undefined, places: 0 | 1): string {
  if (v === null || v === undefined || !Number.isFinite(v) || v === 0) return "—";
  return places === 0 ? fmtMwh(v) : fmtOneDecimal(v);
}

/** GUIDE q12/q13 — the collapsed record row's label: `Production - {description}`. */
export const productionRowLabel = (description: string | null): string =>
  `Production - ${description ?? ""}`;

/**
 * GUIDE q12/q13 — the lifecycle chip text. Distinct from `assessmentLabel`'s
 * Internal/External chip: two independent classifications on the same row, not one field
 * rendered twice.
 */
export const productionStatusLabel = (status: number): "Active" | "Inactive" =>
  status === 0 ? "Active" : "Inactive";

/**
 * GUIDE q16 — the per-row reset on a Negative Prices year: restores the value the
 * standard curve supplied and re-marks the row a calculated default so it renders
 * italic/blue again. `standardReductionValue` is captured once, in
 * `buildNegativePriceRows`, precisely so this reset needs no re-fetch of Fabric.
 */
export function resetNegativePriceRow(
  rows: NegativePriceRow[],
  year: number,
): NegativePriceRow[] {
  return rows.map((r) =>
    r.year === year
      ? { ...r, reductionValue: r.standardReductionValue, standardAssumption: true }
      : r,
  );
}

/**
 * GUIDE q16 — "Total Sum [%]" is a plain, bold, READ-ONLY computed total — never
 * italic, never individually resettable, unlike the Distribution/Reduction cells beside
 * it. Formatted the way the recording shows it: a whole number carries no trailing
 * ".0" ("100", not "100.0").
 */
export function fmtPercentTotal(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r)
    ? String(r)
    : r.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
