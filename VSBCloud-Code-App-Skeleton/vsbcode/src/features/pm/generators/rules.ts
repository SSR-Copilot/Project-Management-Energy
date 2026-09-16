/**
 * Project Generators Screen — every business rule as a pure function.
 *
 * Canvas screen: `Project Generators Screen` (PM app)
 *   642 controls · 15 931 lines of Power Fx · 190 substantive blocks · band XL
 *
 * Seven parallel "type in project" catalogues (WTG, PV module, inverter, substructure,
 * BESS/storage, hydrogen, substation), each a collapsible card with its own right-hand
 * panel, all driven by one `cat_PowerCAT.CommandBar`
 * (`pcf_Generators_DisplayProject_Body_Form_CommandBar`) whose `Items` table carries every
 * enablement rule. Under the WTG type sits the individual-turbine grid: saving a WTG type
 * materialises N `GeneratorInProjects` rows named `WTG <Short Name>_<n>`.
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  - `colGeneratorTypesPagging` — the client-side `{Id, Event, TotalRows, Page, Pages,
 *    PageSize}` record per type, `locGeneratorsPageSize: 30`, and the
 *    `{Event: "LoadNextPage" & Text(Rand()), Page: Page + 1}` event hack that drove it.
 *    The data layer pages properly (`dataClient` follows `$skiptoken`); the 30-row page
 *    size survives only as `GENERATORS_PAGE_SIZE`, and `pageCount` is kept because the
 *    spec tests it (UT-GEN-053).
 *  - `ClearCollect(colGenerators, Generators)` + `colGeneratorsInProjectsTemp` — the whole
 *    `Generators` table pulled client-side and re-projected. Replaced by one filtered
 *    OData query plus `projectCatalog` here.
 *  - The `Concat(ThisRecord.vsb_countryavailability, Value & ",")` + `in` string trick for
 *    country availability. Replaced by array membership (`isAvailableInCountry`).
 *  - `colPanelGeneratorFormValidation` / `…Wtg…` / `…Inverter…` / `…Storage…` /
 *    `…Hydrogen…` / `…Substation…` / `…Substructure…` — seven `{Name, Dirty, Valid}`
 *    tables maintained by ~40 `UpdateIf` handlers. Dirty is a diff, valid is computed.
 *  - `ForAll(colTemporaryGeneratorList, Patch(GeneratorInProjects, …))` — N round trips
 *    per save. Now one `saveMany` batch (see hooks.ts).
 *  - The save body duplicated three times (`OnChange`, plus two height-limitation
 *    `OnConfirm` copies). One `saveGeneratorType(payload, {heightApproved})` call site.
 *  - `colDummyTypes`, `colTemporaryGeneratorList`, `colGeneratorsAssosiatedWithWTG` and
 *    the `Collect(col…, Blank())` schema-priming idiom.
 *  - `OnHidden`'s nine `Clear(...)` calls and `Set(gblRecordProjectPlanning, Blank())`.
 *
 * SOURCE DEFECTS — each is commented at its rule:
 *  1. ambiguity 4 — the Effective Capacity and Effective Hub Height error labels
 *     range-check `txt_Production_DisplayProject_Body_Form_GrossYield`, a control on a
 *     DIFFERENT screen. Corrected here; canvas parity kept reachable.
 *  2. ambiguity 5 — `addSubstation.ItemEnabled` omits `CanEditSelectedProject`.
 *  3. ambiguity 6 — the last-capacity guard is not applied to inverter or substructure.
 *  4. ambiguity 7 — `'Effective Hub Height'` / `'Effective Hub Height Changed'` writes are
 *     commented out in both save handlers, yet the grid still colours a tag from the flag.
 *  5. ambiguity 10 — the canvas calls `Requestpermissioncancellation.Run(...)` and THEN
 *     `Remove(...)` with no error handling. We await the cancellation first.
 */
import {
  isNumeric, isInteger, isDecimalWithPlaces, inRange, parseNumber, pfxRound, roundUp,
  isBlank, isPercentage, type Lang,
} from "@/domain/numeric";
import { CHOICE_PLANT } from "@/data/entities";

/* ═══════════════════════════════════════════════════════════════════ columns ════ */

/**
 * `vsb_Generator` (the WTG model catalogue) logical names.
 * Read out of `sol/customizations.xml`, not from the canvas display names.
 */
export const GENERATOR_COL = {
  id: "vsb_generatorid",
  name: "vsb_name",
  displayName: "vsb_displayname",
  supplier: "vsb_supplier",
  turbineType: "vsb_turbinetype",
  hubHeight: "vsb_hubheight",
  rotorDiameter: "vsb_rotordiameter",
  specificCapacity: "vsb_specificcapacity",
  totalHeight: "vsb_totalheight",
  earliestPhaseout: "vsb_earliestphaseout",
  /** Multi-select picklist. Values are country option-set members, not names. */
  countryAvailability: "vsb_countryavailability",
  foundationCostIncluded: "vsb_foundationcostincluded",
  additionalFoundationCost: "vsb_additionalfoundationcost",
  price1: "vsb_wtgprice",
  price2: "vsb_wtgprice2",
  price3: "vsb_wtgprice3",
  price4: "vsb_wtgprice4",
  price5: "vsb_wtgprice5",
} as const;

/** `vsb_GeneratorTypeInProject` logical names. */
export const GEN_TYPE_COL = {
  id: "vsb_generatortypeinprojectid",
  name: "vsb_name",
  project: "_vsb_project_value",
  generator: "_vsb_generator_value",
  numberOfGenerators: "vsb_numberofgenerators",
  costPerWtg: "vsb_costperwtg",
  generatorsCost: "vsb_generatorscost",
  generatorsCapacity: "vsb_generatorscapacity",
  requestPermissionState: "vsb_requestpermissionstate",
  flowRunId: "vsb_flowrunid",
  flowApprovalId: "vsb_flowapprovalid",
  owningBusinessUnit: "_owningbusinessunit_value",
} as const;

/** `vsb_GeneratorInProject` logical names. Parent is the TYPE, not the project. */
export const GEN_INSTANCE_COL = {
  id: "vsb_generatorinprojectid",
  name: "vsb_name",
  moduleTypeInProject: "_vsb_moduletypeinprojectid_value",
  effectiveCapacity: "vsb_effectivecapacity",
  /** SOURCE DEFECT (ambiguity 7): read but never written by this screen. */
  effectiveHubHeight: "vsb_effectivehubheight",
  /** SOURCE DEFECT (ambiguity 7): drives the row tag colour but is no longer maintained. */
  effectiveHubHeightChanged: "vsb_effectivehubheightchanged",
  foundationPlinth: "vsb_foundationplinthm",
  hubHeightExclPlinth: "vsb_hubheightexclfoundationplinthm",
  totalHeight: "vsb_totalheight",
  owningBusinessUnit: "_owningbusinessunit_value",
} as const;

/** Bind (navigation-property) names for the writes. */
export const PLANT_LOOKUP = {
  project: "vsb_Project",
  generator: "vsb_Generator",
  moduleTypeInProject: "vsb_ModuleTypeInProjectId",
  typeInProject: "vsb_TypeInProjectId",
  projectCost: "vsb_ProjectCost",
  generatorInProject: "vsb_GeneratorInProject",
  owningBusinessUnit: "owningbusinessunit",
} as const;

/**
 * `Projects` roll-up columns.
 *
 * `ProjectRow` in `data/repos.ts` calls the first two `vsb_plantwtgcapacity` and
 * `vsb_plantwtgcost`. Neither column exists; the metadata names are below. That
 * repository is append-only shared code, so the correction lives here.
 */
export const PROJECT_PLANT_COL = {
  id: "vsb_projectid",
  projectIdText: "vsb_name",
  projectName: "vsb_projectname",
  shortName: "vsb_shortname",
  country: "_vsb_country_value",
  technology: "vsb_technology",
  totalCapacity: "vsb_totalcapacity",
  fid: "vsb_finalinvestmentdecision",
  endDate: "vsb_enddate",
  projectStartDate: "vsb_projectstartdate",
  projectManager: "_vsb_projectmanager_value",
  owningBusinessUnit: "_owningbusinessunit_value",
  plantWtgCapacity: "vsb_plantwtgcapacity",
  plantWtgCost: "vsb_plantwtgcost",
  plantPvCapacity: "vsb_plantpvcapacitymwp",
  plantPvCost: "vsb_plantpvcost",
  plantStorageCapacity: "vsb_plantstoragecapacity",
  plantHydrogenCapacity: "vsb_planthydrogencapacity",
  plantSubstationCapacity: "vsb_plantsubstationcapacity",
} as const;

/** `Device Costs.'Device Type'` — the four `gblDiviceCoststConstants` members. */
/**
 * @labels-not-in-corpus — the four `Device Costs`.`'Device Type'` DATA values
 * (`gblDiviceCoststConstants`); the app writes and compares them, it does not render them as
 * labels
 */
export const DEVICE_TYPE = {
  modules: "Modules",
  inverter: "Inverter",
  mountingFix: "Mounting systems fix",
  mountingTracker: "Mounting systems tracker",
} as const;

/**
 * `locGeneratorsPageSize` from `OnVisible`.
 *
 * The canvas paged the turbine grid client-side through `colGeneratorTypesPagging`; that
 * collection is deleted. The size is kept as the server `$top` so page boundaries look
 * the same to a user who knew the old screen.
 */
export const GENERATORS_PAGE_SIZE = 30;

/* ═════════════════════════════════════════════════════════════════════ types ════ */

/** The seven equipment families the command bar and the cards are keyed on. */
export type PlantFamily =
  | "wtg" | "pv" | "inverter" | "substructure" | "storage" | "hydrogen" | "substation";

export interface CatalogModel {
  id: string;
  name: string | null;
  displayName: string | null;
  supplier: string | null;
  turbineType: string | null;
  hubHeight: number | null;
  rotorDiameter: number | null;
  specificCapacity: number | null;
  earliestPhaseout: string | null;
  /** Country option-set members from the multi-select. */
  countryAvailability: number[];
  foundationCostIncluded: boolean;
  additionalFoundationCost: number | null;
  prices: [number | null, number | null, number | null, number | null, number | null];
}

/** A catalogue model after the `colGeneratorsInProjectsTemp` projection. */
export interface ProjectedModel extends CatalogModel {
  isAvailable: boolean;
  availability: string;
  fullDisplayName: string;
}

export interface GeneratorsProject {
  id: string;
  /** `'Project ID'` — the human identifier, `vsb_name`. */
  projectIdText: string | null;
  projectName: string | null;
  shortName: string | null;
  countryId: string | null;
  /** The country option-set member used by the availability multi-select. */
  countryOptionValue: number | null;
  isoCurrencyCode: string | null;
  totalCapacity: number | null;
  fid: string | null;
  endDate: string | null;
  projectStartDate: string | null;
  projectManagerId: string | null;
  projectManagerEmail: string | null;
  owningBusinessUnitId: string | null;
}

export interface GeneratorTypeRow {
  id: string;
  name: string | null;
  generatorId: string | null;
  generatorDisplayName: string | null;
  numberOfGenerators: number | null;
  costPerWtg: number | null;
  generatorsCost: number | null;
  generatorsCapacity: number | null;
  requestPermissionState: number | null;
  flowRunId: string | null;
  flowApprovalId: string | null;
  status: number;
  /** `Generator.'Specific Capacity'` — the effective-capacity ceiling. */
  specificCapacity: number | null;
}

export interface TurbineRow {
  id: string;
  name: string | null;
  typeId: string | null;
  index: number;
  effectiveCapacity: number | null;
  effectiveHubHeight: number | null;
  effectiveHubHeightChanged: boolean;
  foundationPlinth: number | null;
  hubHeightExclPlinth: number | null;
  totalHeight: number | null;
  status: number;
}

/** A row of any of the six non-WTG type tables, reduced to what the rules need. */
export interface SimpleTypeRow {
  id: string;
  name: string | null;
  supplier: string | null;
  otherSupplier: string | null;
  capacity: number | null;
  cost: number | null;
  /** GUIDE q11 — PV-only fields; `null` for every other family. */
  moduleLabel: string | null;
  degradation1stYear: number | null;
  degradationRemainingYears: number | null;
  requestPermissionState: number | null;
  flowRunId: string | null;
  flowApprovalId: string | null;
  status: number;
}

export interface ProjectPlanning {
  isHeightLimitationForWtg: boolean;
  heightLimitation: number | null;
}

export interface LandLeaseCostRow {
  id: string;
  landOwner: string | null;
  description: string | null;
  allWtgAllocated: boolean;
}

/* ══════════════════════════════════════════════════════════════════ page lock ════ */

export const PAGE_LOCK_TITLE =
  "This page is locked. To unlock it, please complete the following sections:";

/**
 * Rule (Validation): `con_Milestones_Page_LockMessage_1.Visible =
 * Or(IsBlank('Project ID'), IsBlank('End Date'))`, with two bullets whose predicates are
 * `IsBlank('Project ID')` and `IsBlank('Project Start Date')`.
 *
 * Note the asymmetry, faithfully reproduced: the banner is shown on a blank END date but
 * the "Milestones" bullet tests the START date, so a project with an end date and no
 * start date shows no banner at all.
 */
export function pageLock(project: GeneratorsProject | null): string[] {
  if (!project) return [];
  const bullets: string[] = [];
  if (isBlank(project.projectIdText)) bullets.push("• General");
  if (isBlank(project.projectStartDate)) bullets.push("• Milestones");
  return bullets;
}

export function isPageLocked(project: GeneratorsProject | null): boolean {
  if (!project) return true;
  return isBlank(project.projectIdText) || isBlank(project.endDate);
}

/* ═══════════════════════════════════════════════════════════════════ catalogue ═══ */

/**
 * Rule 2 — country availability is a computed FLAG, not a filter.
 *
 * Canvas: `And(Not(IsBlank(vsb_countryavailability)),
 *              Country.Name in Concat(vsb_countryavailability, Value & ","))`
 * The `Concat` + `in` is a canvas workaround for "does this multi-select contain X"; it
 * also compares a country NAME against a list of option-set VALUES, which only works
 * because the two happen to coincide in this data. Array membership on the option value
 * is used instead.
 */
export function isAvailableInCountry(
  model: Pick<CatalogModel, "countryAvailability">,
  countryOptionValue: number | null | undefined,
): boolean {
  if (model.countryAvailability.length === 0) return false;
  if (countryOptionValue === null || countryOptionValue === undefined) return false;
  return model.countryAvailability.includes(countryOptionValue);
}

/**
 * Rule 1 — the catalogue is pre-filtered by FID date:
 * `And(Not(IsBlank(FID)), ThisRecord.vsb_earliestphaseout > FID)`.
 * A blank FID makes the catalogue empty; a blank phase-out excludes the model.
 */
export function isOrderable(
  model: Pick<CatalogModel, "earliestPhaseout">,
  fidDate: string | Date | null | undefined,
): boolean {
  if (!fidDate) return false;
  if (!model.earliestPhaseout) return false;
  const phaseout = new Date(model.earliestPhaseout).getTime();
  const fid = new Date(fidDate).getTime();
  if (Number.isNaN(phaseout) || Number.isNaN(fid)) return false;
  return phaseout > fid;
}

/** Rule 2 — the display label appends `" - available"` / `" - not available"`. */
export function buildDisplayName(
  model: Pick<CatalogModel, "displayName" | "name">,
  isAvailable: boolean,
): string {
  const base = model.displayName ?? model.name ?? "";
  return `${base} - ${isAvailable ? "available" : "not available"}`;
}

/** `colGeneratorsInProjectsTemp` as one pure projection (rules 1–2). */
export function projectCatalog(
  models: CatalogModel[],
  opts: { countryOptionValue: number | null | undefined; fidDate: string | null | undefined },
): ProjectedModel[] {
  if (!opts.fidDate) return [];
  return models
    .filter((m) => isOrderable(m, opts.fidDate))
    .map((m) => {
      const isAvailable = isAvailableInCountry(m, opts.countryOptionValue);
      return {
        ...m,
        isAvailable,
        availability: isAvailable ? "available" : "not available",
        fullDisplayName: buildDisplayName(m, isAvailable),
      };
    });
}

/** Rule 5 — `StartsWith(cmb_Supplier.Selected.Value, "Dummy")`. */
export const isDummySupplier = (supplier: string | null | undefined): boolean =>
  (supplier ?? "").startsWith("Dummy");

export interface CascadeSelection {
  inCountry: boolean;
  supplier: string | null;
  turbineType: string | null;
}

export interface CascadeOptions {
  suppliers: string[];
  turbineTypes: string[];
  hubHeights: number[];
}

/**
 * Rules 3–4 — the country toggle inverts the catalogue, then Supplier → Turbine Type →
 * Hub Height cascade. Three canvas comboboxes (`cmb_Supplier`, `_1`, `_2`) collapse into
 * one memoised selector; `Reset(cmb_Supplier_1)` becomes clearing the downstream state.
 */
export function cascadeOptions(
  models: ProjectedModel[],
  sel: CascadeSelection,
): CascadeOptions {
  const scoped = models.filter((m) => (sel.inCountry ? m.isAvailable : !m.isAvailable));
  const uniq = <T,>(xs: T[]) => Array.from(new Set(xs));

  const suppliers = uniq(
    scoped.map((m) => m.supplier).filter((s): s is string => Boolean(s)),
  ).sort((a, b) => a.localeCompare(b));

  const bySupplier = sel.supplier
    ? scoped.filter((m) => m.supplier === sel.supplier)
    : [];
  const turbineTypes = uniq(
    bySupplier.map((m) => m.turbineType).filter((t): t is string => Boolean(t)),
  ).sort((a, b) => a.localeCompare(b));

  const byType = sel.turbineType
    ? bySupplier.filter((m) => m.turbineType === sel.turbineType)
    : [];
  const hubHeights = uniq(
    byType.map((m) => m.hubHeight).filter((h): h is number => typeof h === "number"),
  ).sort((a, b) => a - b);

  return { suppliers, turbineTypes, hubHeights };
}

/**
 * Rules 4–5 — resolve the model.
 * `LookUp(Generators, And(Supplier = …, 'Turbine Type' = …, 'Hub Height' = …,
 *                         Not(IsBlank('Earliest phaseout'))))`
 * For a Dummy supplier the `'Hub Height'` predicate is dropped and the first available
 * height is taken (`locSelectedTurbineForDummy`).
 */
export function resolveModel(
  models: ProjectedModel[],
  sel: { supplier: string | null; turbineType: string | null; hubHeight: number | null },
): ProjectedModel | undefined {
  const dummy = isDummySupplier(sel.supplier);
  const candidates = models.filter(
    (m) =>
      m.supplier === sel.supplier &&
      m.turbineType === sel.turbineType &&
      Boolean(m.earliestPhaseout),
  );
  if (dummy) return candidates[0];
  return candidates.find((m) => m.hubHeight === sel.hubHeight);
}

/* ═════════════════════════════════════════════════════════════════════ pricing ═══ */

/**
 * Rule 7 — the inflation index is linearly interpolated on the FID MONTH:
 * `prev + (curr - prev) * Month(FID) / 12`.
 *
 * `curr` / `prev` are `Estimation Price Inflations` rows for FID year and FID year − 1.
 * `fidMonth` is 1-based, as `Month()` returns.
 */
export function accumulatedIndex(
  currentIndex: number | null | undefined,
  previousIndex: number | null | undefined,
  fidMonth: number | null | undefined,
): number {
  const curr = currentIndex ?? 0;
  const prev = previousIndex ?? 0;
  const month = fidMonth ?? 0;
  return prev + (curr - prev) * (month / 12);
}

/**
 * Rule 6, first half — `Switch(Value(numberOfGenerators), 1, '1 WTG price', 2, …,
 * '5 WTG price')`. The default arm means 5 OR MORE all use the `'5 WTG price'` band; so
 * does 0 and any non-numeric count, because `Switch` falls through to the default.
 */
export function wtgPriceBand(
  model: Pick<CatalogModel, "prices">,
  count: number,
): number {
  const idx = count >= 1 && count <= 4 ? count - 1 : 4;
  return model.prices[idx] ?? 0;
}

/**
 * Rule 6, second half —
 * `If('Foundation cost included' = "Yes", net * index,
 *                                         (net + 'Additional foundation cost') * index)`
 */
export function costPerWtg(args: {
  model: Pick<CatalogModel, "prices" | "foundationCostIncluded" | "additionalFoundationCost">;
  count: number;
  accumulatedIndex: number;
}): number {
  const net = wtgPriceBand(args.model, args.count);
  const base = args.model.foundationCostIncluded
    ? net
    : net + (args.model.additionalFoundationCost ?? 0);
  return base * args.accumulatedIndex;
}

/**
 * Rule 8 — `'Generators Cost': count * costPerWtg`,
 * `'Generators Capacity': count * varSpecificCapacity` where a blank specific capacity
 * is coerced to 0 (`If(Not(IsBlank(…)), Value(…), 0)`).
 */
export function generatorTypeTotals(args: {
  count: number;
  costPerWtg: number;
  specificCapacity: number | null | undefined;
}): { generatorsCost: number; generatorsCapacity: number } {
  const cap = args.specificCapacity ?? 0;
  return {
    generatorsCost: args.count * args.costPerWtg,
    generatorsCapacity: args.count * cap,
  };
}

/** Rule 17, PV — `'Cost [EUR]' = 'Cost per Power [EUR/MWp]' * 'Capacity [MWp]'`. */
export function pvCosts(args: {
  deviceCostModules: number | null | undefined;
  capacityMwp: number;
}): { costPerPower: number; cost: number } {
  const costPerPower = args.deviceCostModules ?? 0;
  return { costPerPower, cost: costPerPower * args.capacityMwp };
}

/**
 * Rule 17, inverter — `varCostsPerInverter = deviceCost * nominalPower / 1000`,
 * `'Inverter Type Cost' = varCostsPerInverter * numberOfInverters`.
 */
export function inverterCosts(args: {
  deviceCostInverter: number | null | undefined;
  nominalPowerKw: number;
  numberOfInverters: number;
}): { costPerInverter: number; typeCost: number } {
  const costPerInverter = ((args.deviceCostInverter ?? 0) * args.nominalPowerKw) / 1000;
  return { costPerInverter, typeCost: costPerInverter * args.numberOfInverters };
}

/**
 * Rule 17, substructure — fix vs tracker mounting cost × the project's
 * `'Plant PV Capacity [MWp]'`.
 */
export function substructureCost(args: {
  mounting: "fix" | "tracker";
  deviceCostFix: number | null | undefined;
  deviceCostTracker: number | null | undefined;
  plantPvCapacityMwp: number | null | undefined;
}): number {
  const rate =
    args.mounting === "tracker" ? args.deviceCostTracker ?? 0 : args.deviceCostFix ?? 0;
  return rate * (args.plantPvCapacityMwp ?? 0);
}

/* ═══════════════════════════════════════════════════════════════════ turbines ════ */

/** Rule 9 — `Index` is always `Value(Last(Split(Name, "_")).Value)`. */
export function turbineIndex(name: string | null | undefined): number {
  if (!name) return NaN;
  const tail = name.split("_").pop() ?? "";
  return parseNumber(tail);
}

/**
 * Rule 9 — `varStartIndex = If(IsBlank(col), 0, Max(col, Index))`, then
 * `ForAll(Sequence(count), {vsb_name: $"WTG {'Short Name'}_{varStartIndex + Value}"})`.
 *
 * `Sequence` is 1-based, so with no existing turbines the first name ends `_1`.
 */
export function buildTurbineNames(args: {
  shortName: string | null | undefined;
  existing: Pick<TurbineRow, "index">[];
  count: number;
}): string[] {
  const start =
    args.existing.length === 0
      ? 0
      : Math.max(...args.existing.map((t) => (Number.isFinite(t.index) ? t.index : 0)));
  const names: string[] = [];
  for (let i = 1; i <= args.count; i++) {
    names.push(`WTG ${args.shortName ?? ""}_${start + i}`);
  }
  return names;
}

/**
 * Rule 10 — new turbines inherit height from the type:
 * `'Total Height' = If(selectedHeight = 0, typedHubHeight + 0.5 * rotor,
 *                                          catalogHubHeight + 0.5 * rotor)`
 * and `'Hub Height excl. Foundation Plinth [m]'` gets the hub height alone.
 */
export function newTurbineHeights(args: {
  /** `cmb_Supplier_2.Selected.Height` — 0 when a Dummy supplier bypassed the combobox. */
  selectedHeight: number;
  /** `txt_…HubHeight_1.Value` — the revised hub height the panel typed. */
  typedHubHeight: number | null | undefined;
  catalogHubHeight: number | null | undefined;
  rotorDiameter: number | null | undefined;
}): { totalHeight: number; hubHeightExclPlinth: number } {
  const rotor = args.rotorDiameter ?? 0;
  const hub =
    args.selectedHeight === 0 ? args.typedHubHeight ?? 0 : args.catalogHubHeight ?? 0;
  return { totalHeight: hub + 0.5 * rotor, hubHeightExclPlinth: hub };
}

/**
 * Rule 11 — a per-turbine edit recomputes total height from three inputs:
 * `varHubHeight + varFoundationPlinth + 0.5 * varRotorDiameter`.
 */
export function editedTotalHeight(args: {
  hubHeight: number | null | undefined;
  foundationPlinth: number | null | undefined;
  rotorDiameter: number | null | undefined;
}): number {
  return (
    (args.hubHeight ?? 0) + (args.foundationPlinth ?? 0) + 0.5 * (args.rotorDiameter ?? 0)
  );
}

/**
 * Rules 13 and 21 — after a per-turbine edit (or a delete) the type is re-derived from
 * its CHILDREN, not from the form:
 *   count    = CountRows(Filter(GeneratorInProjects, type = …))
 *   capacity = Sum(<same filter>, 'Effective Capacity')
 * and `'Cost per WTG'` is re-banded, forced to 0 when the count reaches zero
 * (`If(locNumberOfGenerators <> 0, locGeneratorCostsPerWtg, 0)`).
 */
export function recomputeTypeFromChildren(args: {
  children: Pick<TurbineRow, "effectiveCapacity">[];
  model?: Pick<
    CatalogModel, "prices" | "foundationCostIncluded" | "additionalFoundationCost"
  > | null;
  accumulatedIndex?: number;
}): {
  numberOfGenerators: number;
  generatorsCapacity: number;
  costPerWtg: number;
  generatorsCost: number;
} {
  const count = args.children.length;
  const capacity = args.children.reduce((s, c) => s + (c.effectiveCapacity ?? 0), 0);
  const banded =
    count !== 0 && args.model
      ? costPerWtg({
          model: args.model,
          count,
          accumulatedIndex: args.accumulatedIndex ?? 1,
        })
      : 0;
  return {
    numberOfGenerators: count,
    generatorsCapacity: capacity,
    costPerWtg: banded,
    generatorsCost: count * banded,
  };
}

/**
 * Rule 12 — the three "Apply to all WTGs" checkboxes turn one edit into an
 * `UpdateIf(GeneratorInProjects, ThisRecord in varFilteredGenerators, {…})` over every
 * turbine of the type. Returns the ids and the field patch, so the mutation can issue
 * ONE batch instead of a client-side loop.
 */
export function planApplyToAll(args: {
  siblings: Pick<TurbineRow, "id">[];
  applyCapacity: boolean;
  applyHubHeight: boolean;
  applyFoundationPlinth: boolean;
  effectiveCapacity: number | null;
  hubHeight: number | null;
  foundationPlinth: number | null;
}): { ids: string[]; fields: Record<string, unknown> } | null {
  const fields: Record<string, unknown> = {};
  if (args.applyCapacity) fields[GEN_INSTANCE_COL.effectiveCapacity] = args.effectiveCapacity;
  if (args.applyHubHeight) fields[GEN_INSTANCE_COL.hubHeightExclPlinth] = args.hubHeight;
  if (args.applyFoundationPlinth) {
    fields[GEN_INSTANCE_COL.foundationPlinth] = args.foundationPlinth;
  }
  if (Object.keys(fields).length === 0) return null;
  return { ids: args.siblings.map((s) => s.id), fields };
}

/**
 * Rule 24, residue — `Pages: RoundUp(TotalRows / PageSize, 0) + If(TotalRows = 0, 1)`.
 *
 * The paging COLLECTION is deleted; this arithmetic is kept only because the spec tests
 * it, and because an empty type must still render one (empty) page.
 */
export function pageCount(totalRows: number, pageSize = GENERATORS_PAGE_SIZE): number {
  return roundUp(totalRows / pageSize, 0) + (totalRows === 0 ? 1 : 0);
}

/* ═══════════════════════════════════════════════════════════════════ roll-ups ════ */

/**
 * Rule 14 — every project roll-up applies the same guard:
 * `And(Or(IsBlank('Request Permission State'),
 *         'Request Permission State' = PermissionApproved),
 *      Status = Active)`
 */
export function eligibleTypes<
  T extends { requestPermissionState: number | null; status: number },
>(types: T[]): T[] {
  return types.filter(
    (t) =>
      (t.requestPermissionState === null ||
        t.requestPermissionState === undefined ||
        t.requestPermissionState === CHOICE_PLANT.requestPermissionState.approved) &&
      t.status === CHOICE_PLANT.status.active,
  );
}

/** Rule 14 — `Plant WTG Capacity [MW]` / `Plant WTG Cost [EUR]`. */
export function plantWtgTotals(
  types: Pick<
    GeneratorTypeRow,
    "requestPermissionState" | "status" | "generatorsCapacity" | "generatorsCost"
  >[],
): { capacityMW: number; costEUR: number } {
  const rows = eligibleTypes(types);
  return {
    capacityMW: rows.reduce((s, t) => s + (t.generatorsCapacity ?? 0), 0),
    costEUR: rows.reduce((s, t) => s + (t.generatorsCost ?? 0), 0),
  };
}

/**
 * Rule 16 — PV, inverter and substructure share ONE project cost field:
 * `Sum(Sum(pv,'Cost [EUR]'), Sum(inverters,'Inverter Type Cost'),
 *      Sum(substructures,'Substructure Cost [EUR]'))`
 *
 * Note the canvas does NOT apply the rule-14 permission/status guard here — only the WTG
 * roll-up has it. Reproduced as written.
 */
export function plantPvCost(args: {
  pv: Pick<SimpleTypeRow, "cost">[];
  inverters: Pick<SimpleTypeRow, "cost">[];
  substructures: Pick<SimpleTypeRow, "cost">[];
}): number {
  const sum = (xs: Pick<SimpleTypeRow, "cost">[]) =>
    xs.reduce((s, x) => s + (x.cost ?? 0), 0);
  return sum(args.pv) + sum(args.inverters) + sum(args.substructures);
}

/** Rule 16 — `'Plant PV Capacity [MWp]' = Sum(pv, 'Capacity [MWp]')`. */
export const plantPvCapacity = (pv: Pick<SimpleTypeRow, "capacity">[]): number =>
  pv.reduce((s, x) => s + (x.capacity ?? 0), 0);

/** Rule 18 — storage / hydrogen / substation roll up 1:1. */
const sumCapacity = (rows: Pick<SimpleTypeRow, "capacity">[]) =>
  rows.reduce((s, x) => s + (x.capacity ?? 0), 0);
export const plantStorageCapacity = sumCapacity;
export const plantHydrogenCapacity = sumCapacity;
export const plantSubstationCapacity = sumCapacity;

/* ═══════════════════════════════════════════════════════════════ command bar ════ */

/** Every `ItemKey` in the canvas `CommandBar.Items` table, in source order. */
export const GENERATOR_COMMAND_KEYS = [
  "addWTGType", "addPVType", "addInverterType", "addSubstructureType",
  "addStorage", "deleteStorageType", "addHydrogen", "deleteHydrogenType",
  "addSubstation", "deleteSubstationType", "addOthers",
  "deleteGeneratorType", "deletePVModuleType", "deleteInverterType",
  "deleteSubstructureType", "activateGenerator", "deactivateGenerator",
] as const;

export type GeneratorCommandKey = (typeof GENERATOR_COMMAND_KEYS)[number];

export interface CommandItemState {
  visible: boolean;
  enabled: boolean;
  label: string;
}

export interface CommandBarContext {
  canEdit: boolean;
  project: GeneratorsProject | null;
  selection: {
    generatorType: GeneratorTypeRow | null;
    pvModuleType: SimpleTypeRow | null;
    inverterType: SimpleTypeRow | null;
    substructureType: SimpleTypeRow | null;
    storageType: SimpleTypeRow | null;
    hydrogenType: SimpleTypeRow | null
    substationType: SimpleTypeRow | null;
  };
  counts: { storage: number; hydrogen: number; substation: number };
  /** `RecordInfo(<row>, RecordInfo.DeletePermission)` — answered by the server. */
  deletePermission: Partial<Record<PlantFamily, boolean>>;
  /** `RecordInfo(locSelectedGeneratorEntity, RecordInfo.EditPermission)`. */
  editPermission: boolean;
}

/**
 * The `Items` table transcribed one-for-one. Every `ItemVisible` / `ItemEnabled`
 * expression is reproduced, including the two oddities:
 *
 *  - `addInverterType` and `addSubstructureType` ship with `ItemVisible: false`. They are
 *    unreachable in the canvas app; kept hidden here so behaviour matches.
 *  - SOURCE DEFECT (ambiguity 5): `addSubstation.ItemEnabled` is the ONLY item that omits
 *    `CanEditSelectedProject`, so a read-only user can create a substation row. The
 *    canvas behaviour is reproduced by default; pass `fixSubstationPermission` to conjoin
 *    `canEdit` as every sibling item does.
 */
export function commandBarState(
  ctx: CommandBarContext,
  opts: { fixSubstationPermission?: boolean } = {},
): Record<GeneratorCommandKey, CommandItemState> {
  const p = ctx.project;
  const hasEndDate = !isBlank(p?.endDate);
  const canAdd = ctx.canEdit && hasEndDate;
  const sel = ctx.selection;

  const del = (family: PlantFamily, row: { id: string } | null): CommandItemState => ({
    visible: row !== null,
    enabled: ctx.canEdit && row !== null && ctx.deletePermission[family] === true,
    label:
      family === "wtg" ? "Delete Generator Type"
      : family === "pv" ? "Delete PV Module Type"
      : family === "inverter" ? "Delete Inverter Type"
      : "Delete Substructure Type",
  });

  const substationEnabled =
    sel.substationType !== null || ctx.counts.substation === 0;

  return {
    addWTGType: { visible: true, enabled: canAdd, label: "Add WTG Type" },
    addPVType: {
      visible: true,
      enabled: canAdd,
      label: sel.pvModuleType ? "Edit PV Module Type" : "Add PV Module Type",
    },
    addInverterType: {
      // ItemVisible: false in the source.
      visible: false,
      enabled: canAdd,
      label: sel.inverterType ? "Edit Inverter" : "Add Inverter",
    },
    addSubstructureType: {
      // ItemVisible: false in the source.
      visible: false,
      enabled: canAdd,
      label: sel.substructureType ? "Edit Substructure" : "Add Substructure",
    },
    addStorage: {
      visible: true,
      enabled: ctx.canEdit && (sel.storageType !== null || ctx.counts.storage === 0),
      label: sel.storageType ? "Edit BESS" : "BESS",
    },
    deleteStorageType: {
      visible: sel.storageType !== null,
      enabled: ctx.canEdit && sel.storageType !== null,
      label: "Delete BESS",
    },
    addHydrogen: {
      visible: true,
      enabled: ctx.canEdit && (sel.hydrogenType !== null || ctx.counts.hydrogen === 0),
      label: sel.hydrogenType ? "Edit Hydrogen" : "Hydrogen",
    },
    deleteHydrogenType: {
      visible: sel.hydrogenType !== null,
      enabled: ctx.canEdit && sel.hydrogenType !== null,
      label: "Delete Hydrogen",
    },
    addSubstation: {
      visible: true,
      enabled: opts.fixSubstationPermission
        ? ctx.canEdit && substationEnabled
        : substationEnabled,
      label: sel.substationType ? "Edit Substation" : "Substation",
    },
    deleteSubstationType: {
      visible: sel.substationType !== null,
      enabled: ctx.canEdit && sel.substationType !== null,
      label: "Delete Substation",
    },
    addOthers: {
      visible: true,
      enabled:
        ctx.canEdit &&
        (ctx.counts.storage === 0 ||
          ctx.counts.hydrogen === 0 ||
          ctx.counts.substation === 0) &&
        hasEndDate,
      label: "Add Others",
    },
    deleteGeneratorType: del("wtg", sel.generatorType),
    deletePVModuleType: del("pv", sel.pvModuleType),
    deleteInverterType: del("inverter", sel.inverterType),
    deleteSubstructureType: del("substructure", sel.substructureType),
    activateGenerator: {
      visible:
        sel.generatorType !== null &&
        sel.generatorType.status !== CHOICE_PLANT.status.active,
      enabled: ctx.editPermission,
      label: "Activate",
    },
    deactivateGenerator: {
      visible:
        sel.generatorType !== null &&
        sel.generatorType.status === CHOICE_PLANT.status.active,
      enabled: !isBlank(p?.projectStartDate) && ctx.editPermission,
      label: "Deactivate",
    },
  };
}

/* ═══════════════════════════════════════════ GUIDE-driven display strings ════ */

/** GUIDE q07 — the list's summary field: a right-aligned value in a grey read-only box. */
/** `lbl_Generators_DisplayProject_Body_Form_PlantWtgCapacity.Text` — verbatim. */
export const TOTAL_CAPACITY_LABEL = "Total Capacity [MW(p)]";

/**
 * GUIDE q09 — the catalogue model's fixed Total Height, `118 + 0.5×163 = 199.5`: the same
 * hub-height-plus-half-rotor rule the turbine grid uses, minus the plinth no catalogue
 * model has. Not a separate Dataverse column (`CatalogModel` never read one).
 */
export function catalogTotalHeight(
  model: Pick<CatalogModel, "hubHeight" | "rotorDiameter"> | null | undefined,
): number {
  if (!model) return 0;
  return (model.hubHeight ?? 0) + 0.5 * (model.rotorDiameter ?? 0);
}

/**
 * GUIDE q08 — the hover tooltip on a selected, still-collapsed WTG type row, verbatim
 * including the trailing separator: `"Nordex | N163-6.8 MW | 118m Hub Height |
 * 200m Total Height |"`. The total height is rounded to a whole metre for the tooltip;
 * the expanded detail grid (q09) shows the same figure to one decimal.
 */
export function typeSummaryTooltip(args: {
  supplier: string | null | undefined;
  typeLabel: string | null | undefined;
  hubHeight: number | null | undefined;
  totalHeight: number | null | undefined;
}): string {
  const supplier = args.supplier ?? "";
  const label = args.typeLabel ?? "";
  const hub = args.hubHeight ?? 0;
  const total = Math.round(args.totalHeight ?? 0);
  return `${supplier} | ${label} MW | ${hub}m Hub Height | ${total}m Total Height |`;
}

/** GUIDE q09 — the expanded WTG type's seven-field detail grid, this exact label set. */
export const TYPE_DETAIL_FIELD_LABELS = {
  /**
   * `lbl_GeneratorData_RightPanel_Form_Fields_Hydrogen_Fields_HydrogenSupplier.Text` —
   * verbatim.
   */
  supplier: "Supplier",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Effective_HubHeight_2.Text` — verbatim. */
  totalHeight: "Total Height [m]",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_NumberOfGenerator.Text` — verbatim. */
  numberOfGenerators: "Number of Generators",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_TypeSelector_2.Text` — verbatim. */
  hubHeight: "Hub Height [m]",
  /**
   * `lbl_Generators_DisplayProject_Body_Form_GeneratorType_CardDetails_RotorDiameter.Text` —
   * verbatim.
   */
  rotorDiameter: "Rotor Diameter [m]",
  /** `lbl_Generators_DisplayProject_Body_Form_GeneratorType_CardDetails_Cost.Text` — verbatim. */
  heightLimitation: "Height Limitation [m]",
  /**
   * `lbl_Generators_DisplayProject_Body_Form_GeneratorType_CardDetails_GeneratorsCapacity.Text`
   * — verbatim.
   */
  generatorsCapacity: "Generators Capacity [MW]",
} as const;

/** GUIDE q09 — the "+ Add Generator" link, shown only while the type row is expanded. */
/**
 * `pcf_Generators_DisplayProject_Body_Form_GeneratorType_CardDetails_CommandBar.Items.ItemDisplayName`
 * — the canvas command caption.
 */
export const ADD_GENERATOR_LABEL = "+ Add Generator";

/**
 * GUIDE q09 — the individual-turbine table's two labelled columns, transcribed verbatim.
 * Note the asymmetry: "Total Height" carries no unit here even though every other height
 * label on this screen does.
 */
export const TURBINE_TABLE_LABELS = {
  /**
   * NEW — no canvas equivalent: a column header for the code app's turbine grid; the canvas
   * grid declared only "Total Height" and "Effective Generator Capacity [MW]"
   * (`…GeneratorsList.columns_Items.ColDisplayName`)
   */
  wtg: "WTG",
  /**
   * `pcf_Generators_DisplayProject_Body_Form_GeneratorType_CardDetails_GeneratorsList.columns_Items.ColDisplayName`
   * — verbatim (the canvas grid column).
   */
  totalHeight: "Total Height",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Effective_Capacity.Text` — verbatim. */
  effectiveCapacity: "Effective Generator Capacity [MW]",
} as const;

/** GUIDE q10 — the green save-confirmation banner, verbatim. */
export const GENERATOR_TYPE_SAVED_BANNER =
  "Generator type was successfully saved for current project!";

/* ══════════════════════════════════════════════════════ last-capacity guard ════ */

export const LAST_CAPACITY_TITLES = {
  /**
   * `txt_PopUp_Common_Generators_PreventTotalCapacity_Title.Text` — the canvas title for this
   * popup.
   */
  delete: "Generator can't be deleted",
  /**
   * `txt_PopUp_Common_Generators_PreventTotalCapacity_Title.Text` — the canvas title for this
   * popup.
   */
  deactivate: "Generator can't be deactivated",
} as const;

export const LAST_CAPACITY_MESSAGES = {
  /**
   * `lbl_PopUp_Common_Generators_PreventTotalCapacity_Information.Text` — the canvas body for
   * this popup.
   */
  delete:
    "Before removing the last generator, add another one so that the project's capacity " +
    "never drops to zero.",
  /**
   * `lbl_PopUp_Common_Generators_PreventTotalCapacity_Information.Text` — the canvas body for
   * this popup.
   */
  deactivate:
    "Before deactivating the last generator, activate another one so that the project's " +
    "capacity never drops to zero.",
} as const;

/**
 * The families the canvas actually guards.
 *
 * SOURCE DEFECT (ambiguity 6): inverter and substructure are NOT guarded. They carry no
 * capacity, so the omission is arguably correct, but it is uncommented in the source. The
 * set is explicit here so the divergence is visible rather than implied.
 */
export const LAST_CAPACITY_GUARDED: readonly PlantFamily[] = [
  "wtg", "pv", "storage", "hydrogen", "substation",
];

export const isLastCapacityGuarded = (family: PlantFamily): boolean =>
  LAST_CAPACITY_GUARDED.includes(family);

/**
 * `gblRecordSelectedProject.'Total Capacity' - <entity capacity> = 0`
 * → `UpdateContext({locPreventGeneratorCapacityPopUp: true})`, blocking the confirmation
 * dialog. Applied to the guarded families plus the per-turbine delete and deactivate.
 */
export function blocksLastCapacity(
  project: Pick<GeneratorsProject, "totalCapacity"> | null,
  entityCapacity: number | null | undefined,
): boolean {
  if (!project) return false;
  return (project.totalCapacity ?? 0) - (entityCapacity ?? 0) === 0;
}

/* ════════════════════════════════════════════════════ height limitation gate ════ */

export const HEIGHT_LIMIT_PM_MESSAGE =
  "Total height exceeds Height Limitation, Only Project Managers can Override to Save.";

/**
 * Rule 26 / Validation — the height check fires only when the planning row says so AND
 * the limit is non-blank:
 * `And(<computed total height> > 'Height limitation [m]',
 *      Not(IsBlank('Height limitation [m]')))`
 *
 * The save handler additionally gates on `locProjectPlanning.'Is Height Limitation For
 * WTG'`, so the flag being off disables the gate entirely (UT-GEN-046).
 */
export function heightLimitExceeded(
  planning: ProjectPlanning | null,
  totalHeight: number | null | undefined,
): boolean {
  if (!planning) return false;
  if (!planning.isHeightLimitationForWtg) return false;
  if (planning.heightLimitation === null || planning.heightLimitation === undefined) {
    return false;
  }
  return (totalHeight ?? 0) > planning.heightLimitation;
}

/**
 * `gblRecordSelectedProject.'Project Manager'.Id <> User().EntraObjectId` — inverted.
 * A project manager gets the override confirmation; anybody else cannot save at all.
 */
export function canOverrideHeightLimit(
  project: Pick<GeneratorsProject, "projectManagerId"> | null,
  entraObjectId: string | null | undefined,
): boolean {
  if (!project?.projectManagerId || !entraObjectId) return false;
  return project.projectManagerId === entraObjectId;
}

/** True when the PM-only error label would be visible, i.e. Save must be disabled. */
export function heightBlocksSave(args: {
  planning: ProjectPlanning | null;
  totalHeight: number | null | undefined;
  project: Pick<GeneratorsProject, "projectManagerId"> | null;
  entraObjectId: string | null | undefined;
}): boolean {
  return (
    heightLimitExceeded(args.planning, args.totalHeight) &&
    !canOverrideHeightLimit(args.project, args.entraObjectId)
  );
}

/** Rule 26 — the type card's limitation tag and the per-row info icon share a predicate. */
export function overHeightLimit(
  planning: ProjectPlanning | null,
  totalHeight: number | null | undefined,
): boolean {
  if (!planning?.heightLimitation) return false;
  return (totalHeight ?? 0) > planning.heightLimitation;
}

export const countOverHeightLimit = (
  planning: ProjectPlanning | null,
  turbines: Pick<TurbineRow, "totalHeight">[],
): number => turbines.filter((t) => overHeightLimit(planning, t.totalHeight)).length;

/* ═════════════════════════════════════════════════════════════════ validation ════ */

export const MSG = {
  /**
   * `lbl_Contracts_RightPanel_NewEdit_PaymentTarget_Description_ErrorMessage.Text` (`Contracts
   * Screen`) — verbatim.
   */
  inputBlank: "Input must not be blank",
  /**
   * `lbl_GeneratorData_RightPanel_Form_Fields_Effective_HubHeight_ErrorMessage.Text` —
   * verbatim.
   */
  numericTwoDecimals: "Numeric value with maximum of two decimals",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_GeneratorName_ErrorMessage.Text` — verbatim. */
  turbineNameBlank: "Value cannot be blank or '0'.",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_GeneratorName_ErrorMessage.Text` — verbatim. */
  turbineNameNumeric: "Value must be numeric.",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_GeneratorName_ErrorMessage.Text` — verbatim. */
  turbineNameDuplicate:
    "The selected name for this WTG is already in use. Please select a different name.",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Effective_Capacity_ErrorMessage.Text` — verbatim. */
  capacityNumeric: "Value must be a numeric",
  /**
   * `lbl_GeneratorData_RightPanel_Form_Fields_Effective_HubHeight_ErrorMessage.Text` —
   * verbatim.
   */
  hubHeightRange: "Effective hub height needs to be a positive number below 200 m.",
  /**
   * `lbl_GeneratorData_RightPanel_Form_PvModuleType_Fields_DegradationFirstYear_ErrorMessage.Text`
   * — the canvas message for this rule.
   */
  percentageRange: "Value must be a percentage between 0 and 100.",
} as const;

/** `Switch(ISO Currency Code, "EUR", 15000000, 15000000 * 5)`. */
export const maxCostPerWtg = (isoCurrencyCode: string | null | undefined): number =>
  isoCurrencyCode === "EUR" ? 15_000_000 : 15_000_000 * 5;

/**
 * Validation — the turbine name (really an index) must be non-blank, not `"0"`, an
 * integer, and unique within the type unless unchanged.
 *
 * `varCurrentIndex` is `-1` when the turbine is new, so a new turbine can never
 * "keep" an index that already exists.
 */
export function validateTurbineName(
  value: string,
  args: { existingIndices: number[]; currentIndex?: number | null },
  lang: Lang = "en-US",
): string | null {
  const v = value.trim();
  if (v === "" || v === "0") return MSG.turbineNameBlank;
  if (!isInteger(v, lang)) return MSG.turbineNameNumeric;
  const current = args.currentIndex ?? -1;
  const entered = parseNumber(v, lang);
  if (current !== entered && args.existingIndices.includes(entered)) {
    return MSG.turbineNameDuplicate;
  }
  return null;
}

/**
 * Validation — `fn_Numeric_Generators.IsInteger` and `InRange(…, 0, 200)`; the validation
 * ROW additionally demands `> 0`, so `0` is a valid input but never a saveable one.
 */
export function validateNumberOfGenerators(
  value: string,
  lang: Lang = "en-US",
): string | null {
  const v = value.trim();
  if (v === "") return MSG.inputBlank;
  if (!isInteger(v, lang)) return MSG.turbineNameNumeric;
  if (!inRange(v, 0, 200, lang)) return "Please select a value between 0 and 200.";
  return null;
}

/** The extra `> 0` demand the `NumberOfGenerators` validation row adds. */
export const numberOfGeneratorsSaveable = (value: string, lang: Lang = "en-US"): boolean =>
  validateNumberOfGenerators(value, lang) === null && parseNumber(value, lang) > 0;

/** Validation — two decimals max, range `0 … maxCostPerWtg(currency)`. */
export function validateCostPerWtg(
  value: string,
  isoCurrencyCode: string | null | undefined,
  lang: Lang = "en-US",
): string | null {
  const v = value.trim();
  if (v === "") return MSG.inputBlank;
  if (!isDecimalWithPlaces(v, 2, lang)) return MSG.numericTwoDecimals;
  const max = maxCostPerWtg(isoCurrencyCode);
  if (!inRange(v, 0, max, lang)) {
    return `Please select a value between 0 and ${max.toLocaleString("en-US")}.`;
  }
  return null;
}

/** The `Cost` validation row is valid only when the derived cost per WTG is `> 0`. */
export const costRowValid = (costPerWtgValue: number): boolean => costPerWtgValue > 0;

/**
 * Validation — effective capacity: two decimals max, range
 * `0.01 … locSelectedGeneratorEntity.Generator.'Specific Capacity'`.
 *
 * SOURCE DEFECT (ambiguity 4). The canvas error label reads:
 *   fn_Numeric_Production.InRange(txt_Production_DisplayProject_Body_Form_GrossYield.Value,
 *                                 0.01, 'Specific Capacity')
 * It range-checks a control on the PRODUCTION screen instead of its own input, so the
 * range rule never fires against what the user typed. (Its sibling `.Visible` property
 * does reference the right control, which is how we know the intent.) The corrected rule
 * is implemented; `validateEffectiveCapacityCanvasParity` keeps the defect reachable.
 */
export function validateEffectiveCapacity(
  value: string,
  specificCapacity: number | null | undefined,
  lang: Lang = "en-US",
): string | null {
  const v = value.trim();
  if (v === "") return MSG.inputBlank;
  if (!isDecimalWithPlaces(v, 2, lang)) return MSG.capacityNumeric;
  const max = specificCapacity ?? 0;
  if (!inRange(v, 0.01, max, lang)) {
    return `Please select a value between 0.01 and ${pfxRound(max, 2)} MW max.`;
  }
  return null;
}

/** Reproduces the shipped mis-reference, for parity testing only. */
export function validateEffectiveCapacityCanvasParity(
  value: string,
  specificCapacity: number | null | undefined,
  grossYieldFromProductionScreen: string,
  lang: Lang = "en-US",
): string | null {
  const v = value.trim();
  if (v !== "" && !isDecimalWithPlaces(v, 2, lang)) return MSG.capacityNumeric;
  if (!inRange(grossYieldFromProductionScreen, 0.01, specificCapacity ?? 0, lang)) {
    return `Please select a value between 0.01 and ${pfxRound(specificCapacity ?? 0, 2)} MW max.`;
  }
  return null;
}

/**
 * Validation — effective hub height: two decimals max, range `1 … 200`.
 * Same SOURCE DEFECT as `validateEffectiveCapacity`; corrected here.
 */
export function validateEffectiveHubHeight(
  value: string,
  lang: Lang = "en-US",
): string | null {
  const v = value.trim();
  if (v === "") return MSG.inputBlank;
  if (!isDecimalWithPlaces(v, 2, lang)) return MSG.numericTwoDecimals;
  if (!inRange(v, 1, 200, lang)) return MSG.hubHeightRange;
  return null;
}

/**
 * Validation — the inverter/substructure "Other supplier" rows are valid only when a
 * catalogue supplier IS set and the free-text supplier is EMPTY:
 * `And(Not(IsBlank(Supplier)), IsBlank('Other Supplier'))`.
 *
 * Which means an out-of-catalogue supplier typed into `Other Supplier` makes the row
 * invalid — the very case the permission flow exists for. Reproduced as written.
 */
export const otherSupplierValid = (
  row: Pick<SimpleTypeRow, "supplier" | "otherSupplier">,
): boolean => !isBlank(row.supplier) && isBlank(row.otherSupplier);

/* ══════════════════════════════════════════════════════════════════ save gates ════ */

export interface TypeFormState {
  supplier: string | null;
  turbineType: string | null;
  hubHeight: number | null;
  revisedHubHeight: string;
  numberOfGenerators: string;
  cost: string;
  /** Fields the user actually touched — replaces `colPanelGeneratorFormValidation.Dirty`. */
  dirty: Set<string>;
}

/** The six `colPanelGeneratorFormValidation` row names, kept for parity of the gate. */
export const TYPE_VALIDATION_ROWS = [
  "Supplier", "TurbineType", "Hubheight", "RevisedHubheight",
  "NumberOfGenerators", "Cost",
] as const;

export interface TypeFormErrors {
  Supplier: string | null;
  TurbineType: string | null;
  Hubheight: string | null;
  RevisedHubheight: string | null;
  NumberOfGenerators: string | null;
  Cost: string | null;
}

/**
 * The type panel's validation record.
 *
 * Rule 5 — for a Dummy supplier the `Hubheight` row is forced `{Valid: true,
 * Dirty: false}` and the height combobox is bypassed entirely.
 */
export function validateTypeForm(
  form: TypeFormState,
  ctx: {
    isoCurrencyCode: string | null | undefined;
    derivedCostPerWtg: number;
  },
  lang: Lang = "en-US",
): TypeFormErrors {
  const dummy = isDummySupplier(form.supplier);
  return {
    Supplier: isBlank(form.supplier) ? MSG.inputBlank : null,
    TurbineType: isBlank(form.turbineType) ? MSG.inputBlank : null,
    Hubheight: dummy ? null : form.hubHeight === null ? MSG.inputBlank : null,
    RevisedHubheight:
      form.revisedHubHeight.trim() === ""
        ? null
        : validateEffectiveHubHeight(form.revisedHubHeight, lang),
    NumberOfGenerators: validateNumberOfGenerators(form.numberOfGenerators, lang),
    Cost:
      validateCostPerWtg(form.cost, ctx.isoCurrencyCode, lang) ??
      (costRowValid(ctx.derivedCostPerWtg) ? null : MSG.inputBlank),
  };
}

/**
 * `pcf_btn_GeneratorData_RightPanel_Form_Buttons_Save.DisplayMode` —
 * `And(CountRows(Filter(validation, Valid = false)) = 0,
 *      CountRows(Filter(validation, Dirty = true)) > 0,
 *      Not(<PM error label>.Visible))`
 */
export function canSaveType(args: {
  errors: TypeFormErrors;
  dirty: Set<string>;
  numberOfGenerators: string;
  heightBlocked: boolean;
  lang?: Lang;
}): boolean {
  if (args.heightBlocked) return false;
  if (Object.values(args.errors).some((e) => e !== null)) return false;
  if (args.dirty.size === 0) return false;
  return numberOfGeneratorsSaveable(args.numberOfGenerators, args.lang ?? "en-US");
}

export interface TurbineFormState {
  nameIndex: string;
  effectiveCapacity: string;
  effectiveHubHeight: string;
  foundationPlinth: string;
  dirty: Set<string>;
}

/**
 * `pcf_btn_…_Generator_Buttons_Save.DisplayMode` — non-blank name / effective capacity /
 * effective hub height, all five error labels hidden, and at least one dirty row in
 * `colPanelWtgFormValidation`.
 */
export function canSaveTurbine(args: {
  form: TurbineFormState;
  existingIndices: number[];
  currentIndex?: number | null;
  specificCapacity: number | null | undefined;
  heightBlocked: boolean;
  lang?: Lang;
}): boolean {
  const lang = args.lang ?? "en-US";
  if (args.heightBlocked) return false;
  const f = args.form;
  if (isBlank(f.nameIndex) || isBlank(f.effectiveCapacity) || isBlank(f.effectiveHubHeight)) {
    return false;
  }
  if (
    validateTurbineName(
      f.nameIndex,
      { existingIndices: args.existingIndices, currentIndex: args.currentIndex },
      lang,
    ) !== null
  ) {
    return false;
  }
  if (validateEffectiveCapacity(f.effectiveCapacity, args.specificCapacity, lang) !== null) {
    return false;
  }
  if (validateEffectiveHubHeight(f.effectiveHubHeight, lang) !== null) return false;
  if (
    f.foundationPlinth.trim() !== "" &&
    !isDecimalWithPlaces(f.foundationPlinth.trim(), 2, lang)
  ) {
    return false;
  }
  return f.dirty.size > 0;
}

/* ════════════════════════════════════════════════════════════════ permissions ════ */

/** Rule 25 — the permission-state chip label, and the `StateChip` colour it maps to. */
export function permissionStateLabel(state: number | null | undefined): string | null {
  switch (state) {
    case CHOICE_PLANT.requestPermissionState.approved: return "Permission Approved";
    case CHOICE_PLANT.requestPermissionState.declined: return "Permission Declined";
    case CHOICE_PLANT.requestPermissionState.pending: return "Permission Pending";
    case CHOICE_PLANT.requestPermissionState.canceled: return "Permission Canceled";
    default: return null;
  }
}

/**
 * Rule 25 — `Switch(Text('Request Permission State'),
 *   "Permission Approved", Success, "Permission Declined", Error,
 *   "Permission Pending", Warning, ButtonDisabledBg)`
 * Six near-identical copies in the canvas; one function here.
 */
export type PermissionTone = "success" | "error" | "warning" | "disabled";

export function permissionStateTone(state: number | null | undefined): PermissionTone {
  switch (state) {
    case CHOICE_PLANT.requestPermissionState.approved: return "success";
    case CHOICE_PLANT.requestPermissionState.declined: return "error";
    case CHOICE_PLANT.requestPermissionState.pending: return "warning";
    default: return "disabled";
  }
}

/** Whether a save must take the permission-request path instead of the roll-up path. */
export const requiresPermissionRequest = (inCountry: boolean): boolean => !inCountry;

/** The four `varProject` shapes the flow's `text` argument carries, as a union. */
export type ModulePermissionPayload =
  | {
      ProjectGuid: string; ProjectId: string | null; ProjectName: string | null;
      ShortName: string | null; ProjectManagerEmail: string | null;
      ModuleType: 952850000; GeneratorTypeInProject: string; Generator: string | null;
    }
  | {
      ProjectGuid: string; ProjectId: string | null; ProjectName: string | null;
      ShortName: string | null; ProjectManagerEmail: string | null;
      ModuleType: 952850001; PVModuleTypeInProject: string;
    }
  | {
      ProjectGuid: string; ProjectId: string | null; ProjectName: string | null;
      ShortName: string | null; ProjectManagerEmail: string | null;
      ModuleType: 952850002; InverterTypeInProject: string;
    }
  | {
      ProjectGuid: string; ProjectId: string | null; ProjectName: string | null;
      ShortName: string | null; ProjectManagerEmail: string | null;
      ModuleType: 952850003; SubstructureTypeInProject: string;
    };

const projectHeader = (p: GeneratorsProject) => ({
  ProjectGuid: p.id,
  ProjectId: p.projectIdText,
  ProjectName: p.projectName,
  ShortName: p.shortName,
  ProjectManagerEmail: p.projectManagerEmail,
});

export const buildGeneratorPermissionPayload = (
  p: GeneratorsProject,
  generatorTypeInProjectId: string,
  generatorId: string | null,
): ModulePermissionPayload => ({
  ...projectHeader(p),
  ModuleType: CHOICE_PLANT.moduleType.generator,
  GeneratorTypeInProject: generatorTypeInProjectId,
  Generator: generatorId,
});

export const buildInverterPermissionPayload = (
  p: GeneratorsProject,
  inverterTypeInProjectId: string,
): ModulePermissionPayload => ({
  ...projectHeader(p),
  ModuleType: CHOICE_PLANT.moduleType.inverter,
  InverterTypeInProject: inverterTypeInProjectId,
});

export const buildSubstructurePermissionPayload = (
  p: GeneratorsProject,
  substructureTypeInProjectId: string,
): ModulePermissionPayload => ({
  ...projectHeader(p),
  ModuleType: CHOICE_PLANT.moduleType.substructure,
  SubstructureTypeInProject: substructureTypeInProjectId,
});

/**
 * Rule (Flows) — the PV call site EXISTS in the flow but is commented out on the screen
 * with *"Disabled the Request Perfimission for Other Suppliers PV Module"* and
 * short-circuited by `If(true = false, …, true, <roll-up>)`. So a PV save always takes
 * the roll-up path, even out of country.
 */
export const pvRequestsPermission = (): boolean => false;

/** Rule 15 — the optimistic write on the request path. The roll-up is deliberately skipped. */
export function pendingPermissionFields(flow: {
  runId: string; approvalId: string;
}): Record<string, unknown> {
  return {
    [GEN_TYPE_COL.requestPermissionState]: CHOICE_PLANT.requestPermissionState.pending,
    [GEN_TYPE_COL.flowRunId]: flow.runId,
    [GEN_TYPE_COL.flowApprovalId]: flow.approvalId,
  };
}

/** `Requestpermissioncancellation`'s `text_3` payload — matches `Parse_ModuleType`. */
export interface CancellationPayload {
  ModuleTypeGuid: string;
  ModuleType: number;
  Name: string | null;
  FlowRunId: string | null;
  FlowApprovalId: string | null;
}

export function buildCancellationPayload(
  family: PlantFamily,
  row: Pick<SimpleTypeRow, "id" | "name" | "flowRunId" | "flowApprovalId">,
): CancellationPayload {
  const moduleType =
    family === "pv" ? CHOICE_PLANT.moduleType.pvModule
    : family === "inverter" ? CHOICE_PLANT.moduleType.inverter
    : family === "substructure" ? CHOICE_PLANT.moduleType.substructure
    : CHOICE_PLANT.moduleType.generator;
  return {
    ModuleTypeGuid: row.id,
    ModuleType: moduleType,
    Name: row.name,
    FlowRunId: row.flowRunId,
    FlowApprovalId: row.flowApprovalId,
  };
}

/** Rule 22 — the cancellation is only issued when a flow run is actually open. */
export const needsPermissionCancellation = (
  row: Pick<SimpleTypeRow, "flowRunId">,
): boolean => !isBlank(row.flowRunId);

/* ════════════════════════════════════════════════════════════════════ land lease ══ */

export interface AllocationPlan {
  costId: string;
  generatorInProjectId: string;
  name: string;
}

/**
 * Rule 20 — `btn_Trigger_New_AllocateWTGs_To_Land_Lease.OnSelect`: every land-lease cost
 * flagged `AllWTGAllocated = Yes` × every new turbine, named
 * `'Land Owner' & "-" & Description & "-" & Generator.Name`.
 *
 * Fired from both save paths via `locNewWtgWillbeAllocated`
 * (`IsBlank(locSelectedGeneratorEntity)` for a new type,
 *  `IsBlank(locSelectedGeneratorInProject.GeneratorInProject)` for a new single turbine).
 */
export function planTurbineAllocation(args: {
  costs: LandLeaseCostRow[];
  turbines: { id: string; name: string | null }[];
}): AllocationPlan[] {
  const plans: AllocationPlan[] = [];
  for (const cost of args.costs) {
    if (!cost.allWtgAllocated) continue;
    for (const t of args.turbines) {
      plans.push({
        costId: cost.id,
        generatorInProjectId: t.id,
        name: `${cost.landOwner ?? ""}-${cost.description ?? ""}-${t.name ?? ""}`,
      });
    }
  }
  return plans;
}

/** `locNewWtgWillbeAllocated` for the two save paths. */
export const isNewAllocationNeeded = (
  selectedEntityId: string | null | undefined,
): boolean => isBlank(selectedEntityId);

/**
 * Rule 21 — deleting one turbine cascades CONDITIONALLY:
 * `If(CountRows(Filter(allocations, samecost)) > 1,
 *     Remove(allocations, thisRow),
 *     Remove('Land Lease Project Costs', thisRow.'Project Cost'))`
 * The comment in the source notes the allocation row goes with the parent through the
 * parental relationship, which is why the second arm does not also delete the allocation.
 */
export type TurbineDeletionStep =
  | { kind: "removeAllocation"; allocationId: string }
  | { kind: "removeLandLeaseCost"; costId: string };

export function planTurbineDeletion(args: {
  /** The turbine's own allocation rows, with their sibling counts per cost. */
  allocations: { id: string; costId: string }[];
  siblingCountByCost: Record<string, number>;
}): TurbineDeletionStep[] {
  return args.allocations.map((a) =>
    (args.siblingCountByCost[a.costId] ?? 0) > 1
      ? { kind: "removeAllocation" as const, allocationId: a.id }
      : { kind: "removeLandLeaseCost" as const, costId: a.costId },
  );
}

/* ═══════════════════════════════════════════════════════════════ status toggle ════ */

/**
 * Rule 23 — activate/deactivate propagates the TYPE status to every turbine:
 * `UpdateIf(colGeneratorsAssosiatedWithWTG, true,
 *           {Status: If(type.Status = 0, Inactive, Active)})`
 * then one set-based `Patch(GeneratorInProjects, ShowColumns(col, …))`.
 *
 * Note the direction: the new status is derived from the type's CURRENT status, so this
 * is a toggle, not a set.
 */
export function planStatusToggle(args: {
  type: Pick<GeneratorTypeRow, "id" | "status">;
  turbines: Pick<TurbineRow, "id">[];
}): { nextStatus: number; typeId: string; turbineIds: string[] } {
  const nextStatus =
    args.type.status === CHOICE_PLANT.status.active
      ? CHOICE_PLANT.status.inactive
      : CHOICE_PLANT.status.active;
  return {
    nextStatus,
    typeId: args.type.id,
    turbineIds: args.turbines.map((t) => t.id),
  };
}

/* ══════════════════════════════════════════════════════════ PV module type panel ════ */

/**
 * `vsb_PvModuleTypeInProject` columns this panel writes. Already selected by
 * `pvModuleTypeInProjectRepo` (see `data/repos.ts`) but never previously assembled into a
 * write — the panel used to save an empty field map.
 */
export const PV_TYPE_COL = {
  label: "vsb_label",
  supplier: "vsb_type",
  capacity: "vsb_capacity",
  costPerPower: "vsb_costperpower",
  cost: "vsb_cost",
  degradation1stYear: "vsb_degradation1styear",
  degradationRemainingYears: "vsb_degradationremainingyears",
} as const;

/** GUIDE q11 — the panel title, by mode. */
export const PV_PANEL_TITLES = { add: "Add PV Module Type", edit: "Edit PV Module Type" } as const;

/** GUIDE q11 — field labels, verbatim, brackets included. */
export const PV_FIELD_LABELS = {
  /** `lbl_GeneratorData_RightPanel_Form_PvModuleType_Fields_Label.Text` — verbatim. */
  moduleLabel: "Module Label",
  /**
   * `lbl_GeneratorData_RightPanel_Form_Fields_PvModuleType_Fields_PVCapacityMW.Text` —
   * verbatim.
   */
  capacity: "Total Module Type Capacity [MWp]",
  /**
   * `lbl_GeneratorData_RightPanel_Form_Fields_Hydrogen_Fields_HydrogenSupplier.Text` —
   * verbatim.
   */
  supplier: "Supplier",
  /**
   * `lbl_GeneratorData_RightPanel_Form_Fields_PvModuleType_Fields_DegradationFirstYear.Text` —
   * verbatim.
   */
  degradation1stYear: "Degradation 1st Year [% per annum]",
  /**
   * `lbl_GeneratorData_RightPanel_Form_Fields_PvModuleType_Fields_DegradationRemainingYears.Text`
   * — verbatim.
   */
  degradationRemainingYears: "Degradation Remaining Years [% per annum]",
} as const;

/** GUIDE q11 — the Supplier combobox's placeholder. */
/**
 * `cmb_GeneratorData_RightPanel_Form_PvModuleType_Fields_Supplier.InputTextPlaceholder` —
 * verbatim.
 */
export const PV_SUPPLIER_PLACEHOLDER = "Find supplier";

/** The same `gblAppConstants.DefaultMaxLength` every counted text field in this app uses. */
export const PV_MODULE_LABEL_MAX_LENGTH = 55;

export interface PvTypeFormState {
  moduleLabel: string;
  capacity: string;
  supplier: string | null;
  degradation1stYear: string;
  degradationRemainingYears: string;
  dirty: Set<string>;
}

export interface PvTypeFormErrors {
  moduleLabel: string | null;
  capacity: string | null;
  supplier: string | null;
  degradation1stYear: string | null;
  degradationRemainingYears: string | null;
}

/**
 * Validation — GUIDE q11's red asterisks mark Module Label, Total Module Type Capacity
 * and Supplier as required; the two Degradation fields are optional but, where entered,
 * must be a valid percentage.
 */
export function validatePvTypeForm(
  form: Pick<
    PvTypeFormState,
    "moduleLabel" | "capacity" | "supplier" | "degradation1stYear" | "degradationRemainingYears"
  >,
  lang: Lang = "en-US",
): PvTypeFormErrors {
  return {
    moduleLabel: isBlank(form.moduleLabel)
      ? MSG.inputBlank
      : form.moduleLabel.length > PV_MODULE_LABEL_MAX_LENGTH
        ? `Module Label must be ${PV_MODULE_LABEL_MAX_LENGTH} characters or fewer.`
        : null,
    capacity: isBlank(form.capacity)
      ? MSG.inputBlank
      : !isDecimalWithPlaces(form.capacity, 2, lang) || !inRange(form.capacity, 0.01, 999_999, lang)
        ? "Total Module Type Capacity [MWp] must be a positive number."
        : null,
    supplier: isBlank(form.supplier) ? MSG.inputBlank : null,
    degradation1stYear: isBlank(form.degradation1stYear)
      ? null
      : isPercentage(form.degradation1stYear, lang)
        ? null
        : MSG.percentageRange,
    degradationRemainingYears: isBlank(form.degradationRemainingYears)
      ? null
      : isPercentage(form.degradationRemainingYears, lang)
        ? null
        : MSG.percentageRange,
  };
}

/** The panel's Save gate: no error present, and something was actually touched. */
export function canSavePvType(errors: PvTypeFormErrors, dirty: Set<string>): boolean {
  if (dirty.size === 0) return false;
  return Object.values(errors).every((e) => e === null);
}

/** The Supplier combobox's option list — every distinct supplier already on the project. */
export function pvSupplierOptions(rows: Pick<SimpleTypeRow, "supplier">[]): string[] {
  return Array.from(
    new Set(rows.map((r) => r.supplier).filter((s): s is string => Boolean(s))),
  ).sort((a, b) => a.localeCompare(b));
}

/**
 * Rule 17, PV, extended to the fields this panel actually collects — the raw field map
 * saved to `vsb_PvModuleTypeInProject`. `Cost [EUR]` / `Cost per Power` reuse `pvCosts`
 * unchanged (Rule 17), now driven by the capacity the user just typed rather than 0.
 */
export function buildPvTypeFields(
  form: Pick<
    PvTypeFormState,
    "moduleLabel" | "capacity" | "supplier" | "degradation1stYear" | "degradationRemainingYears"
  >,
  opts: { deviceCostModules: number | null | undefined },
): Record<string, unknown> {
  const capacityMwp = numericOr(form.capacity, 0);
  const costs = pvCosts({ deviceCostModules: opts.deviceCostModules, capacityMwp });
  return {
    [PV_TYPE_COL.label]: form.moduleLabel,
    [PV_TYPE_COL.supplier]: form.supplier,
    [PV_TYPE_COL.capacity]: capacityMwp,
    [PV_TYPE_COL.costPerPower]: costs.costPerPower,
    [PV_TYPE_COL.cost]: costs.cost,
    [PV_TYPE_COL.degradation1stYear]:
      isBlank(form.degradation1stYear) ? null : numericOr(form.degradation1stYear, 0),
    [PV_TYPE_COL.degradationRemainingYears]:
      isBlank(form.degradationRemainingYears) ? null : numericOr(form.degradationRemainingYears, 0),
  };
}

/* ═══════════════════════════════════════════════════════════════════ formatting ══ */

/** Grid formats from `…_GeneratorsList.Items`: `#0.0#`, `#0.00`, `#0.0#`. */
export const fmtCapacity = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v)
    ? ""
    : pfxRound(v, 2).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 });

export const fmtHubHeight = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v)
    ? ""
    : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtHeight = fmtCapacity;

export const fmtCurrency = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v)
    ? "—"
    : v.toLocaleString("en-US", { maximumFractionDigits: 0 });

/** Guard for the numeric inputs — the shared components enforce the `fn_Numeric` rules. */
export const numericOr = (value: string, fallback: number, lang: Lang = "en-US"): number =>
  isNumeric(value, lang) ? parseNumber(value, lang) : fallback;

/**
 * NEW — no canvas equivalent: the code app surfaces a failed generator-type save; the canvas
 * closed the panel regardless
 */
export const SAVE_ERROR_PREFIX = "Generator type could not be saved";
/**
 * NEW — no canvas equivalent: the code app surfaces a failed turbine save; the canvas closed
 * the panel regardless
 */
export const TURBINE_SAVE_ERROR_PREFIX = "Turbine could not be saved";
