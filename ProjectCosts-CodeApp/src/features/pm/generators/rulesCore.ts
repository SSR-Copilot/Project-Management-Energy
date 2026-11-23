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
 *    per save. Now one ordered `WritePlan` per save (D27).
 *  - The save body duplicated three times (`OnChange`, plus two height-limitation
 *    `OnConfirm` copies). One `saveType` call site in `Screen.tsx` (D27).
 *  - `colDummyTypes`, `colTemporaryGeneratorList`, `colGeneratorsAssosiatedWithWTG` and
 *    the `Collect(col…, Blank())` schema-priming idiom.
 *  - `OnHidden`'s nine `Clear(...)` calls and `Set(gblRecordProjectPlanning, Blank())`.
 *
 * D27 (19 Oct 2026): connected — the reads are `data/generators.ts`, the writes the `plan*` functions
 * below (run by `usePlanWrite`). The D27 corrections, SOURCE DEFECTs and divergences are commented at
 * their rules and listed in `ProjectDocs/app-docs/02-OPEN-DECISIONS.md` D27.
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
import { CHOICE_PLANT, ES_PLANT } from "@/data/dataverseNames";
import { type Lang, decimalSeparator, inRange, isBlank, isDecimalWithPlaces, isInteger, isNumeric, parseNumber, pfxRound, roundUp } from "@/domain/powerFxNumeric";
import { foundationCostAdded, foundationCostAddedBooleanReading } from "@/domain/foundationCost";

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
  /** `Generator.'Total Height'` (`vsb_totalheight`, a Dataverse formula column) — the card shows it. */
  totalHeight?: number | null;
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
  /** `gblRecordSelectedProject.Country.Name` — the type panel's filter message. */
  countryName?: string | null;
  /** `'Plant PV Capacity [MWp]'` — the substructure cost and its "* Please add Module Type…" note. */
  plantPvCapacity?: number | null;
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
  /** PV `PVModule` (`_vsb_pvmodule_value`), inverter `Inverter`, substructure `Substructure`. */
  catalogueId?: string | null;
  /** That catalogue row's `Supplier` (`PVModule.Supplier`, `Inverter.Supplier`, `Substructure.Supplier`). */
  catalogueSupplier?: string | null;
  /** BESS `'Energy Capacity [MWh]'` (`crc36_energycapacitymwh`). */
  energyCapacity?: number | null;
  /** Inverter / substructure: the multi-select labels (`'Inverter Types'`, `'Substructure Types'`). */
  typeLabels?: string[];
  /** Inverter / substructure: the same multi-select as option values — the panel prefills them (G9). */
  typeValues?: number[];
  /** Inverter / substructure: the stored `'Inverter Label'` / `'Substructure Label'` alone — the panel prefills it (G9). */
  label?: string | null;
  /** Inverter: `'Number of Inverters'`, `'Nominal Power [kW]'`, `'Warranty [Years]'`, `'Costs per Inverter [EUR/Inverter]'`. */
  numberOfInverters?: number | null;
  nominalPower?: number | null;
  warranty?: number | null;
  costPerInverter?: number | null;
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
const LOCK_BULLET_GENERAL = "• General";
const LOCK_BULLET_MILESTONES = "• Milestones";

/**
 * Rule (Validation): `con_Milestones_Page_LockMessage_1.Visible =
 * Or(IsBlank('Project ID'), IsBlank('End Date'))`, with two bullets whose predicates are
 * `IsBlank('Project ID')` and `IsBlank('Project Start Date')`.
 *
 * Note the asymmetry, faithfully reproduced: the banner is shown on a blank END date but
 * the "Milestones" bullet tests the START date, so a project with an end date and no
 * start date shows no banner at all.
 *
 * A New Project (nothing saved in General yet) has no record: `gblRecordSelectedProject` is
 * blank, so both `IsBlank` predicates are true and both bullets show.
 */
export function pageLock(project: GeneratorsProject | null): string[] {
  if (!project) return [LOCK_BULLET_GENERAL, LOCK_BULLET_MILESTONES];
  const bullets: string[] = [];
  if (isBlank(project.projectIdText)) bullets.push(LOCK_BULLET_GENERAL);
  if (isBlank(project.projectStartDate)) bullets.push(LOCK_BULLET_MILESTONES);
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
 * `vsb_countryavailability` option values → labels (`Generators.'Country availability'`). The
 * canvas compares `gblRecordSelectedProject.Country.Name` with these LABELS; the project's country
 * is matched to its option value here once, by exact name. Pinned to the pac-generated
 * `Vsb_generatorsvsb_countryavailability` by UT-GEN-095.
 */
export const COUNTRY_AVAILABILITY: Readonly<Record<number, string>> = {
  952850000: "Germany",
  952850001: "France",
  952850002: "Finland",
  952850003: "Poland",
  952850004: "Italy",
  952850005: "Romania",
  952850006: "Croatia",
};

/** The project country's option value in `vsb_countryavailability`, or null when it has none. */
export function countryAvailabilityValue(countryName: string | null | undefined): number | null {
  if (isBlank(countryName)) return null;
  const hit = Object.entries(COUNTRY_AVAILABILITY).find(([, label]) => label === countryName);
  return hit ? Number(hit[0]) : null;
}

/**
 * SOURCE DEFECT (D27): the canvas test is `Country.Name in Concat(vsb_countryavailability, Value & ",")`
 * — a SUBSTRING match on the joined labels, so a country whose name is part of another label
 * would count as available. `isAvailableInCountry` matches the option exactly; this twin keeps
 * the canvas test reachable (UT-GEN-096).
 */
export function isAvailableInCountryCanvasParity(
  model: Pick<CatalogModel, "countryAvailability">,
  countryName: string | null | undefined,
): boolean {
  if (model.countryAvailability.length === 0) return false;
  const joined = model.countryAvailability.map((v) => `${COUNTRY_AVAILABILITY[v] ?? ""},`).join("");
  return joined.includes(countryName ?? "");
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
 * `With({varFoundationCostIncluded: Text(varRecordGenerator.'Foundation cost included')},
 *   If(varFoundationCostIncluded = "Yes", net * index, (net + 'Additional foundation cost') * index))`
 * (Y:14994, 15862, 17111).
 *
 * CANVAS BEHAVIOUR, kept (PO M4, 20 Oct 2026 — the same formula as Milestones, D26/D27):
 * `Text()` of the Yes/No column is "true"/"false", never "Yes", so the additional foundation cost
 * is ALWAYS added. The shared rule is `foundationCostAdded` (`@/domain/foundationCost`). The
 * boolean reading this app used before is the twin `costPerWtgBooleanReading`.
 */
export function costPerWtg(args: {
  model: Pick<CatalogModel, "prices" | "foundationCostIncluded" | "additionalFoundationCost">;
  count: number;
  accumulatedIndex: number;
}): number {
  const net = wtgPriceBand(args.model, args.count);
  const base = foundationCostAdded(args.model.foundationCostIncluded)
    ? net + (args.model.additionalFoundationCost ?? 0)
    : net;
  return base * args.accumulatedIndex;
}

/**
 * NOT LIVE — the boolean reading of `'Foundation cost included'`: an included foundation adds no
 * extra cost. Live in this app until 20 Oct 2026; kept with a test so M4 stays reversible.
 */
export function costPerWtgBooleanReading(args: {
  model: Pick<CatalogModel, "prices" | "foundationCostIncluded" | "additionalFoundationCost">;
  count: number;
  accumulatedIndex: number;
}): number {
  const net = wtgPriceBand(args.model, args.count);
  const base = foundationCostAddedBooleanReading(args.model.foundationCostIncluded)
    ? net + (args.model.additionalFoundationCost ?? 0)
    : net;
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
 * Rule 17, substructure — `cmp_…DeletePVModuleType.OnConfirm` (Y:15532-15557):
 * `Switch(Text(First(Source.'Substructure Types').Value), "Fixed", MountingSystemsFix * cap,
 * "Tracker", MountingSystemsTracker * cap, 0)` with `cap = Coalesce('Plant PV Capacity [MWp]', 0)`.
 * Any other (or no) type costs 0 — the canvas default arm.
 */
export function substructureCost(args: {
  /** The FIRST selected `'Substructure Types'` label ("Fixed" / "Tracker"), or null. */
  mounting: string | null | undefined;
  deviceCostFix: number | null | undefined;
  deviceCostTracker: number | null | undefined;
  plantPvCapacityMwp: number | null | undefined;
}): number {
  const cap = args.plantPvCapacityMwp ?? 0;
  if (args.mounting === "Fixed") return (args.deviceCostFix ?? 0) * cap;
  if (args.mounting === "Tracker") return (args.deviceCostTracker ?? 0) * cap;
  return 0;
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
  /**
   * `Value(txt_…Total_Height.Value)` — the EDITED turbine's total height. The canvas writes it
   * with the hub-height and the plinth patch (`{…, 'Total Height': Value(txt_Total_Height)}`,
   * Y:11727/11755); absent here = not written.
   */
  totalHeight?: number | null;
}): { ids: string[]; fields: Record<string, unknown> } | null {
  const fields: Record<string, unknown> = {};
  if (args.applyCapacity) fields[GEN_INSTANCE_COL.effectiveCapacity] = args.effectiveCapacity;
  if (args.applyHubHeight) fields[GEN_INSTANCE_COL.hubHeightExclPlinth] = args.hubHeight;
  if (args.applyFoundationPlinth) {
    fields[GEN_INSTANCE_COL.foundationPlinth] = args.foundationPlinth;
  }
  if ((args.applyHubHeight || args.applyFoundationPlinth) && args.totalHeight !== undefined) {
    fields[GEN_INSTANCE_COL.totalHeight] = args.totalHeight;
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
export const sumCapacity = (rows: Pick<SimpleTypeRow, "capacity">[]) =>
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
  "deleteGeneratorType", "replaceGeneratorType", "deletePVModuleType", "replacePVModuleType",
  "deleteInverterType", "deleteSubstructureType", "activateGenerator", "deactivateGenerator",
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
  /**
   * 1.21.753 — `RecordInfo(LookUp(PVModuleTypeInProjects, …), RecordInfo.EditPermission)` for
   * the selected PV module type, which gates Replace PV Module Type. Absent = false.
   */
  pvEditPermission?: boolean;
}

/**
 * The `Items` table transcribed one-for-one. Every `ItemVisible` / `ItemEnabled`
 * expression is reproduced, including the two oddities:
 *
 *  - `addInverterType` and `addSubstructureType` ship with `ItemVisible: false`. They are
 *    unreachable in the canvas app and stay hidden by default. DIVERGENCE (D27 G9, PO-approved
 *    20 Oct 2026): `exposeInverterSubstructure` shows them, so their (hidden) canvas panels
 *    can be used; the screen passes it.
 *  - SOURCE DEFECT (ambiguity 5): `addSubstation.ItemEnabled` is the ONLY item that omits
 *    `CanEditSelectedProject`, so a read-only user can create a substation row. The
 *    canvas behaviour is reproduced by default; pass `fixSubstationPermission` to conjoin
 *    `canEdit` as every sibling item does.
 */
export function commandBarState(
  ctx: CommandBarContext,
  opts: { fixSubstationPermission?: boolean; exposeInverterSubstructure?: boolean } = {},
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
      // ItemVisible: false in the source (shown only with `exposeInverterSubstructure`, G9).
      visible: opts.exposeInverterSubstructure === true,
      enabled: canAdd,
      label: sel.inverterType ? "Edit Inverter" : "Add Inverter",
    },
    addSubstructureType: {
      // ItemVisible: false in the source (shown only with `exposeInverterSubstructure`, G9).
      visible: opts.exposeInverterSubstructure === true,
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
    // 1.21.753 — `ItemVisible: Not(IsBlank(locSelectedGeneratorEntity))`,
    // `ItemEnabled: And(CanEditSelectedProject, RecordInfo(<type>, EditPermission))`.
    replaceGeneratorType: {
      visible: sel.generatorType !== null,
      enabled: ctx.canEdit && sel.generatorType !== null && ctx.editPermission,
      label: "Replace Generator Type",
    },
    deletePVModuleType: del("pv", sel.pvModuleType),
    replacePVModuleType: {
      visible: sel.pvModuleType !== null,
      enabled: ctx.canEdit && sel.pvModuleType !== null && ctx.pvEditPermission === true,
      label: "Replace PV Module Type",
    },
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
 * `txt_…GeneratorType_CardDetails_TotalHeight.Value` (Y:1690) — `ThisItem.Generator.'Total Height'`,
 * the catalogue model's own `vsb_totalheight` (a Dataverse formula column). D27 corrects the
 * GUIDE-derived `hub + ½ rotor` this function used to compute; null when the model has none.
 */
export function catalogTotalHeight(
  model: Pick<CatalogModel, "totalHeight"> | null | undefined,
): number | null {
  return model?.totalHeight ?? null;
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

/**
 * `txt_PopUp_Common_Generators_PreventTotalCapacity_Title.Text` (Y:17392) — verbatim, ONE title for
 * delete and deactivate, typographic apostrophe included. (D27: the split "can't be deleted" /
 * "can't be deactivated" titles the code had were not in the 1.21.709 source.)
 */
const LAST_CAPACITY_TITLE = "Generator can’t be deleted/deactivated";
/**
 * `lbl_PopUp_Common_Generators_PreventTotalCapacity_Information.Text` (Y:17475) — verbatim, one body.
 */
const LAST_CAPACITY_MESSAGE =
  "Before removing/deactivating the last generator, add/activate another one so that the project's capacity never drops to zero.";

export const LAST_CAPACITY_TITLES = {
  delete: LAST_CAPACITY_TITLE,
  deactivate: LAST_CAPACITY_TITLE,
} as const;

export const LAST_CAPACITY_MESSAGES = {
  delete: LAST_CAPACITY_MESSAGE,
  deactivate: LAST_CAPACITY_MESSAGE,
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

/* ════════════════════════════════ canvas 1.21.753 — the O&M dependency guard ════ */

/**
 * `locPreventGeneratorCapacityReason` — why the "can't be deleted/deactivated" popup opened.
 * 1.21.753 adds the two O&M reasons; `Capacity` is the pre-existing last-capacity guard.
 */
export type CapacityGuardReason = "Capacity" | "OpexDependency" | "OpexDependencyPV";

/**
 * The 1.21.753 `deleteGeneratorType` / `deactivateGenerator` / `deletePVModuleType` gate:
 *
 * ```
 * With({ _capZero: Project.'Total Capacity' - <capacity> = 0,
 *        _opexDep: With({ _dId: First(Filter(<row>.DeviceTypesInProjects, Status = Active)).DeviceTypesInProject },
 *                       And(<row>.Status = Active, Not(IsBlank(_dId)),
 *                           Not(IsBlank(LookUp('Opex Project Costs', DeviceTypeInProject = _dId
 *                                && Project = <project> && Status = Active))))) },
 *   If(Or(_capZero, _opexDep), <popup with reason If(_capZero, "Capacity", "OpexDependency[PV]")>, …))
 * ```
 *
 * The last-capacity test wins when both hold. Only the WTG type and the PV module type are
 * O&M-guarded; every other guarded family keeps the capacity test alone.
 */
export function capacityGuardReason(args: {
  family: PlantFamily;
  project: Pick<GeneratorsProject, "totalCapacity"> | null;
  capacity: number | null | undefined;
  /** `<row>.Status = Active`. */
  rowActive: boolean;
  /** An ACTIVE `DeviceTypesInProjects` shadow row exists for the type. */
  hasActiveDeviceType: boolean;
  /** An ACTIVE `Opex Project Costs` row of this project points at that shadow. */
  hasActiveOpexCost: boolean;
}): CapacityGuardReason | null {
  const capZero = isLastCapacityGuarded(args.family) && blocksLastCapacity(args.project, args.capacity);
  if (capZero) return "Capacity";
  if (args.family !== "wtg" && args.family !== "pv") return null;
  const opexDep = args.rowActive && args.hasActiveDeviceType && args.hasActiveOpexCost;
  if (!opexDep) return null;
  return args.family === "wtg" ? "OpexDependency" : "OpexDependencyPV";
}

/**
 * `lbl_PopUp_Common_Generators_PreventTotalCapacity_Information.Text` (1.21.753), the two O&M
 * branches of its `Switch(locPreventGeneratorCapacityReason, …)`.
 * INTERPOLATED — canvas builds these from `$"Generator ""{…'Turbine Type'}"" cannot be …"` and
 * `$"PV Module type ""{…Label}"" cannot be …"`; the `""` escapes render as one `"`.
 */
export const opexDependencyMessage = (
  reason: Exclude<CapacityGuardReason, "Capacity">,
  name: string | null | undefined,
): string =>
  reason === "OpexDependency"
    ? `Generator "${name ?? ""}" cannot be deleted or deactivated because it is currently linked to O&M costs. Replace the generator, or unlink it from the associated O&M costs first.`
    : `PV Module type "${name ?? ""}" cannot be deleted because it is currently linked to O&M costs. Replace the PV Module, or unlink it from the associated O&M costs first.`;

/* ═══════════════════ review fixes F1 / F3 / F7 — reads the guards and the saves depend on ════ */

/**
 * NEW TEXT (no canvas equivalent; D121 §2): the canvas ran the O&M guard against collections it had
 * loaded behind its spinner, so a half-read guard never existed there.
 */
export const GUARD_READ_MSG = {
  /** The command's tooltip while the O&M link of the selected type is still being read. */
  opexChecking: "Checking whether the selected type is linked to O&M costs...",
  /** The command's tooltip, and the banner, when that read failed. */
  opexFailed:
    "The link of the selected type to O&M costs could not be checked, so Delete and Deactivate are unavailable. Reload the page and try again.",
  /** The command's tooltip while the turbines, the price index or the device costs are being (re)read. */
  settling: "The screen is reloading its data. Please wait a moment.",
  /** The banner when a background refresh failed and the screen keeps the data it already has. */
  refreshFailed:
    "Some of this screen's data could not be refreshed, so what is shown may be out of date. Reload the page to try again.",
} as const;

/** Where the O&M read of the selected WTG / PV type stands. `none`: nothing is selected, so no read is needed. */
export type OpexReadState = "none" | "checking" | "failed" | "known";

/** A read that has an answer is `known`, even if a later refresh failed; else a failure beats "still checking". */
export function opexReadState(a: { needed: boolean; known: boolean; failed: boolean }): OpexReadState {
  if (!a.needed) return "none";
  if (a.known) return "known";
  return a.failed ? "failed" : "checking";
}

/** The three commands whose guard reads the O&M dependency (`capacityGuardReason`). */
export const OPEX_GUARDED_COMMANDS: readonly GeneratorCommandKey[] = [
  "deleteGeneratorType", "deactivateGenerator", "deletePVModuleType",
];

/**
 * F1 — a command whose guard needs the O&M dependency is disabled until it is KNOWN. A pending or failed read used to read as
 * "no dependency", so Delete / Deactivate opened its confirmation for a type that O&M costs still point at.
 * DIVERGENCE: the canvas had the data loaded before the screen showed (D121 §2).
 * Returns the tooltip that explains the blocked command, or null when it is not blocked.
 */
export function opexGuardBlock(
  key: GeneratorCommandKey, reads: { wtg: OpexReadState; pv: OpexReadState },
): string | null {
  if (!OPEX_GUARDED_COMMANDS.includes(key)) return null;
  const state = key === "deletePVModuleType" ? reads.pv : reads.wtg;
  if (state === "checking") return GUARD_READ_MSG.opexChecking;
  if (state === "failed") return GUARD_READ_MSG.opexFailed;
  return null;
}

/** F1 — the banner text while the SELECTED family's O&M read failed (the commands carry it as their tooltip too). */
export function opexReadBanner(reads: { wtg: OpexReadState; pv: OpexReadState }): string | null {
  return reads.wtg === "failed" || reads.pv === "failed" ? GUARD_READ_MSG.opexFailed : null;
}

/**
 * F3 — writes and deletes wait while a read they build their rows from is not settled: the first read of the price index,
 * the device costs or the turbines, or a turbine / model read that is still showing the previous type set's rows
 * (`placeholderData`) after a save changed the set. A write built from an empty list can reuse a turbine name, and one built
 * from index 0 or a missing device cost writes a zero cost.
 */
export function dataSettling(reads: readonly { loading: boolean; placeholder?: boolean | undefined }[]): boolean {
  return reads.some((r) => r.loading || r.placeholder === true);
}

/**
 * F7 — what a failed query does to the screen. `blocking`: a query failed and has NO data, so the screen cannot show it
 * (the empty state, as before). `banner`: every failed query still has data (a failed background refresh): the screen stays and a
 * banner says the data may be stale. A test double that sets no `hasData` counts as "no data" (blocking), as before.
 * DIVERGENCE: the canvas had no refresh; this app refetches on window focus (D121 §3).
 */
export function loadErrorMode(
  queries: readonly { error: unknown; hasData?: boolean | undefined }[],
): "none" | "blocking" | "banner" {
  const failed = queries.filter((q) => q.error);
  if (failed.length === 0) return "none";
  return failed.some((q) => q.hasData !== true) ? "blocking" : "banner";
}

/* ════════════════════════════ canvas 1.21.753 — Replace Generator / PV Module Type ════ */

/** The two Replace panels' static text, verbatim. */
export const REPLACE_LABELS = {
  /** `Text3.Text` / `Text3_2.Text` — verbatim. */
  replaceFrom: "Replace from",
  /** `Text3_1.Text` / `Text3_3.Text` — verbatim. */
  replaceTo: "Replace to",
  /** `pcf_btn_GeneratorData_RightPanel_Form_Buttons_Save_1.Text` — verbatim. */
  replace: "Replace",
  /** `pcf_btn_GeneratorData_RightPanel_Form_Buttons_Cancel_1.Text` — verbatim. */
  cancel: "Cancel",
  /** `pcf_btn_GeneratorData_RightPanel_Form_Buttons_Save_1.Tooltip` — verbatim. */
  replaceTooltip: "Save Generator Type",
  /** `lbl_btn_GeneratorData_RightPanel_Form_Filter_Country_Text_1.Text` — verbatim. */
  countryFilter:
    "Show generator types which are available in my country and latest possible order date is valid",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_TypeSelector_4.Text` — verbatim. */
  supplier: "Supplier",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_TypeSelector_5.Text` — verbatim. */
  turbineType: "Turbine Type",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_TypeSelector_6.Text` — verbatim. */
  hubHeight: "Hub Height [m]",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_TypeSelector_7.Text` — verbatim. */
  revisedHubHeight: "Revised Hub Height [m]",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_NumberOfGenerator_1.Text` — verbatim. */
  numberOfGenerators: "Number of Generators",
} as const;

/** `lbl_GeneratorData_RightPanel_FormHeader_FormHeader_1.Text` — `$"Replace Generator {…'Turbine Type'}"`. */
export const replaceGeneratorTitle = (turbineType: string | null | undefined): string =>
  `Replace Generator ${turbineType ?? ""}`;

/** `lbl_GeneratorData_RightPanel_Form_PvModuleType_Header_Title_1.Text` — `$"Replace {Label} "`, trailing space kept. */
export const replacePvTitle = (label: string | null | undefined): string => `Replace ${label ?? ""} `;

export const REPLACE_MSG = {
  /** `pcf_btn_GeneratorData_RightPanel_Form_Buttons_Save_1.OnChange` — first `Notify`, verbatim. */
  inProgress: "A generator replace is already in progress for this type - please wait for it to finish.",
  /** `pcf_btn_GeneratorData_RightPanel_Form_Buttons_Save_1.OnChange` — success `Notify`, verbatim. */
  wtgReplaced: "Generator type was successfully replaced for current project!",
  /** `pcf_btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Save_2.OnChange` — success `Notify`, verbatim. */
  pvReplaced: "PV Module type was successfully replaced for current project!",
  /** `pcf_btn_GeneratorData_RightPanel_Form_Buttons_Save_1.OnChange` — the IfError prefix, verbatim. */
  wtgFailed: "Error: Generator type could not be replaced. ",
  /** `pcf_btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Save_2.OnChange` — the IfError prefix, verbatim. */
  pvFailed: "Error: PV Module type could not be replaced. ",
} as const;

/**
 * The long-operation dialog text while a replace runs (`locGeneratorLongOperationProcessingDialogText`).
 * INTERPOLATED — canvas builds `$"Generator ""{new}"" will replace ""{old}"", please wait..."`
 * (in-country) and `$"Request Permission for ""{new}"" has been sent, please wait..."`.
 */
export const replaceProgressText = (args: {
  inCountry: boolean;
  newDisplayName: string | null | undefined;
  oldTurbineType: string | null | undefined;
}): string =>
  args.inCountry
    ? `Generator "${args.newDisplayName ?? ""}" will replace "${args.oldTurbineType ?? ""}", please wait...`
    : `Request Permission for "${args.newDisplayName ?? ""}" has been sent, please wait...`;

/** INTERPOLATED — `$"PV Module '{txt_…_Label_2.Value}' will be replaced, please wait..."`. */
export const replacePvProgressText = (label: string): string =>
  `PV Module '${label}' will be replaced, please wait...`;

/**
 * The success `Notify` when some manual land-lease allocations of the old type had no new
 * unit to move to (`locReplaceLandLeaseUnmatchedCount > 0`).
 * INTERPOLATED — canvas concatenates `"Generator type was successfully replaced for current
 * project! Note: " & n & " Land Lease allocation(s) from the old type could not be carried
 * over because the new type has fewer units - please review Land Lease allocations for this
 * type."`.
 */
export const replaceSuccessText = (unmatched: number): string =>
  unmatched > 0
    ? `${REPLACE_MSG.wtgReplaced} Note: ${unmatched} Land Lease allocation(s) from the old type could not be carried over because the new type has fewer units - please review Land Lease allocations for this type.`
    : REPLACE_MSG.wtgReplaced;

/**
 * `"Error: … could not be replaced. " & "Internal error: originated on " & FirstError.Source &
 * ". Message: " & FirstError.Message & FirstError.Details.HttpResponse` — verbatim shape.
 */
export const replaceErrorText = (
  family: "wtg" | "pv",
  e: { source?: string | null; message?: string | null; httpResponse?: string | null },
): string =>
  `${family === "wtg" ? REPLACE_MSG.wtgFailed : REPLACE_MSG.pvFailed}Internal error: originated on ${e.source ?? ""}. Message: ${e.message ?? ""}${e.httpResponse ?? ""}`;

/** The "Replace to" WTG selection the panel holds. */
export interface ReplaceWtgForm {
  supplier: string | null;
  turbineType: string | null;
  /** `cmb_Supplier_5.Selected.Height`; `0` is the catalogue's "no fixed height" marker. */
  hubHeight: number | null;
  /** `txt_…_HubHeight_2` — typed only on the Dummy-supplier path. */
  revisedHubHeight: string;
  inCountry: boolean;
}

/**
 * `pcf_btn_GeneratorData_RightPanel_Form_Buttons_Save_1.DisplayMode` (1.21.753):
 * `And(Not(locReplaceInProgress), CountRows(Filter(colPanelReplaceGeneratorFormValidation, Valid = false)) = 0,
 *      CountRows(Filter(…, Dirty = true)) > 0, Not(<height-limit PM error>.Visible))`.
 *
 * The validation table resolves to: supplier, turbine type and hub height chosen; on the
 * Dummy path the hub-height row is satisfied by the turbine choice and the REVISED hub height
 * must be a two-decimal number in 1..200; off it, the catalogue height must not be 0. The
 * number of generators is copied from the old type and is not editable (`DisplayMode.Disabled`).
 */
export function replaceWtgSaveable(args: {
  form: ReplaceWtgForm;
  inProgress: boolean;
  heightBlocked: boolean;
  /** The user's language. Required: the Dummy hub height is typed in it (German number audit, 5 Nov 2026). */
  lang: Lang;
}): boolean {
  const { form } = args;
  if (args.inProgress || args.heightBlocked) return false;
  if (isBlank(form.supplier) || isBlank(form.turbineType)) return false;
  if (isDummySupplier(form.supplier)) {
    const v = form.revisedHubHeight;
    return !isBlank(v) && isDecimalWithPlaces(v, 2, args.lang) && inRange(v, 1, 200, args.lang);
  }
  return form.hubHeight !== null && form.hubHeight !== 0;
}

/** One existing allocation of an old unit, as the replace captures it at T2a. */
export interface ReplaceAllocation {
  id: string;
  /** The old unit's `Index` — `Value(Last(Split(Name, "_")).Value)`. */
  unitIndex: number;
  /** `'Project Cost'.AllWTGAllocated = Yes`. */
  allWtgAllocated: boolean;
  /** The allocation's land-lease cost: the `serialKey` of its delete when `GENERATORS_DELETE.parentOrder` is on (DEL-4). Optional. */
  costId?: string;
}

export interface ReplaceLandLeasePlan {
  /** T2h — manual allocation → position (0-based) in the ordered new units. */
  repoint: { allocationId: string; newUnitPosition: number }[];
  /** T2h cleanup — manual allocations beyond the new unit count. */
  removeSurplus: string[];
  /** T2i — the old units' AllWTGAllocated=Yes rows; T2g already re-created them for the new units. */
  removeAllWtg: string[];
  /** `locReplaceLandLeaseUnmatchedCount`. */
  unmatchedCount: number;
}

/**
 * T2a/T2h/T2i of the 1.21.753 Replace, as data. Manual (non-AllWTG) allocations are matched
 * to the new units BY POSITION — old unit #1 → new unit #1 — after sorting both by index;
 * surplus old allocations are removed; extra new units stay unallocated. AllWTG rows are
 * removed by id, never by a blank-lookup filter, so the replace only touches rows it orphaned.
 */
export function planReplaceLandLease(args: {
  allocations: ReplaceAllocation[];
  newUnitCount: number;
}): ReplaceLandLeasePlan {
  const manual = args.allocations
    .filter((a) => !a.allWtgAllocated)
    .slice()
    .sort((a, b) => a.unitIndex - b.unitIndex);
  const matched = Math.min(manual.length, args.newUnitCount);
  return {
    repoint: manual.slice(0, matched).map((a, i) => ({ allocationId: a.id, newUnitPosition: i })),
    removeSurplus: manual.slice(matched).map((a) => a.id),
    removeAllWtg: args.allocations.filter((a) => a.allWtgAllocated).map((a) => a.id),
    unmatchedCount: Math.max(0, manual.length - args.newUnitCount),
  };
}

/** The ordered phases the Replace walks — `locReplacePhase` / `locReplacePVPhase`. */
export const REPLACE_PHASES = [
  "Identify", "Detach", "Delete", "Add", "AllocateLandLease", "Repoint", "Done",
] as const;
export type ReplacePhase = (typeof REPLACE_PHASES)[number];

/**
 * The "Replace to" PV form. Validation is `colPanelReplacePVModuleTypeFormValidation`:
 * Module Label and Total Module Type Capacity (0..500, two decimals) and Supplier are
 * required; Other Supplier only when the supplier is "Other Supplier"; both degradation
 * fields optional but a three-decimal percentage 0..100 when given.
 */
export interface ReplacePvForm {
  moduleLabel: string;
  capacity: string;
  supplier: string | null;
  otherSupplier: string;
  degradation1stYear: string;
  degradationRemainingYears: string;
}

export function replacePvSaveable(form: ReplacePvForm, lang: Lang = "en-US"): boolean {
  if (isBlank(form.moduleLabel?.trim())) return false;
  const cap = form.capacity;
  if (isBlank(cap) || !isDecimalWithPlaces(cap, 2, lang) || !inRange(cap, 0, 500, lang)) return false;
  if (isBlank(form.supplier)) return false;
  if (form.supplier?.trim() === "Other Supplier" && isBlank(form.otherSupplier?.trim())) return false;
  const pct = (v: string) => isBlank(v) || (isDecimalWithPlaces(v, 3, lang) && inRange(v, 0, 100, lang));
  return pct(form.degradation1stYear) && pct(form.degradationRemainingYears);
}

/**
 * `pcf_btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Save_2.OnChange` — verbatim.
 * T2f hardening (PV only, 1.21.753): with O&M costs to re-point and no bridge row for the new
 * type, the canvas raises `Error({Kind: Validation, Message: …})` instead of writing a blank
 * lookup.
 */
export const PV_BRIDGE_MISSING = "New PV type's bridge was not found; cannot re-link O&M costs.";

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
  // `'Project Manager'` is an `aadusers` lookup, whose key is the Entra object id; GUIDs compare
  // case-insensitively.
  return project.projectManagerId.toLowerCase() === entraObjectId.toLowerCase();
}

/**
 * SOURCE DEFECT (D27) twin — the canvas approval test is
 * `And(locProjectPlanning.'Is Height Limitation For WTG', IsBlank(locHeightLimitationApproval),
 * locProjectPlanning.'Height limitation [m]' < <height>)` (Y:15214, Y:11631). With the flag on and
 * the limit BLANK, `Blank() < height` is true, so every save asked to approve exceeding a limit
 * that does not exist. `heightLimitExceeded` requires a limit; this keeps the canvas reachable.
 */
export function heightLimitExceededCanvasParity(
  planning: ProjectPlanning | null,
  totalHeight: number | null | undefined,
): boolean {
  if (!planning?.isHeightLimitationForWtg) return false;
  return (planning.heightLimitation ?? 0) < (totalHeight ?? 0);
}

/**
 * `lbl_GeneratorData_RightPanel_Form_Fields_Generator_ErrorMessageProjectManager.Visible` (Y:15151):
 * `And(<height> > 'Height limitation [m]', Not(IsBlank('Height limitation [m]')),
 * 'Project Manager'.Id <> User().EntraObjectId)`. It does NOT test `'Is Height Limitation For
 * WTG'` — a set limit blocks every non-PM (D27 corrects the flag the code had added).
 */
export function heightBlocksSave(args: {
  planning: ProjectPlanning | null;
  totalHeight: number | null | undefined;
  project: Pick<GeneratorsProject, "projectManagerId"> | null;
  entraObjectId: string | null | undefined;
}): boolean {
  return (
    overHeightLimit(args.planning, args.totalHeight) &&
    !canOverrideHeightLimit(args.project, args.entraObjectId)
  );
}

/**
 * `lbl_…Generator_ErrorMessageProjectManager_1.Visible` (Y:11560) — the TURBINE panel's PM block reads
 * the turbine's STORED `'Total Height'` (`locSelectedGeneratorInProject.'Total Height'`), not the
 * value being typed, and needs it non-blank: a new turbine is never blocked. Ported as written
 * (PM edit gates follow the canvas, D27 Q3).
 */
export function turbineHeightBlocksSave(args: {
  planning: ProjectPlanning | null;
  storedTotalHeight: number | null | undefined;
  project: Pick<GeneratorsProject, "projectManagerId"> | null;
  entraObjectId: string | null | undefined;
}): boolean {
  if (args.storedTotalHeight === null || args.storedTotalHeight === undefined) return false;
  return heightBlocksSave({
    planning: args.planning, totalHeight: args.storedTotalHeight,
    project: args.project, entraObjectId: args.entraObjectId,
  });
}

/** Rule 26 — the type card's limitation tag and the per-row info icon share a predicate. */
export function overHeightLimit(
  planning: ProjectPlanning | null,
  totalHeight: number | null | undefined,
): boolean {
  const limit = planning?.heightLimitation;
  if (limit === null || limit === undefined) return false;
  return (totalHeight ?? 0) > limit;
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
  /** `gblAppResx.Numeric` (App:1632) — the Number of Generators non-integer text, verbatim. */
  numericNoDecimals: "Numeric value without decimals",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_NumberOfGenerator_ErrorMessage.Text` (Y:14940) — verbatim. */
  numberOfGeneratorsRange: "Please select a value between 0 and 200.",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_ErrorMessage{,_1,_2}.Text` (Y:14202/14509/14622) — verbatim. */
  valueBlank: "Value cannot be blank.",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Foundation_Plinth_ErrorMessage.Text` (Y:10954) — verbatim. */
  foundationPlinth: "Foundation Plinth needs to be in range -100 to 100 with max 1 decimal",
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
  // The label's `Visible` also fires on `Value(name) = 0` (Y:10645), so "00" and "000" block Save as "0" does; the canvas
  // TEXT for them is the literal "true" (its If has no branch for it), so the blank-or-0 message is shown instead.
  // Corrected 13 Nov 2026 (D117): "00" was accepted.
  if (v === "" || v === "0" || (isInteger(v, lang) && parseNumber(v, lang) === 0)) return MSG.turbineNameBlank;
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
  // `gblAppResx.Numeric` — D27 corrects the turbine-name text ("Value must be numeric.") used here.
  if (!isInteger(v, lang)) return MSG.numericNoDecimals;
  if (!inRange(v, 0, 200, lang)) return MSG.numberOfGeneratorsRange;
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
    return `Please select a value between 0 and ${textFormat(max, "#,##0", lang)}.`;
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
    // `Text(locSelectedGeneratorEntity.Generator.'Specific Capacity', "#.0#")` (Y:10773).
    return `Please select a value between 0.01 and ${textFormat(max, "#.0#", lang)} MW max.`;
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
    return `Please select a value between 0.01 and ${textFormat(specificCapacity ?? 0, "#.0#", lang)} MW max.`;
  }
  return null;
}

/**
 * `lbl_…Fields_Foundation_Plinth_ErrorMessage.Visible` (Y:10955-10983): the value must match
 * `^(-?(100(\.0+)?|(\d{1,2}(\.\d{1})?)))$` — `,` instead of `.` for a non-English `Language()`.
 * So −100…100 with at most one decimal, and NOT blank (a blank never matches). The canvas text
 * is the same for every failure.
 */
export function validateFoundationPlinth(value: string, lang: Lang = "en-US"): string | null {
  const sep = (lang.split("-")[0] ?? "").toLowerCase() === "en" ? "\\." : ",";
  const re = new RegExp(`^(-?(100(${sep}0+)?|(\\d{1,2}(${sep}\\d{1})?)))$`);
  return re.test(value) ? null : MSG.foundationPlinth;
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
  /** `cmb_Supplier_2.Selected.Height` — for a Dummy supplier its hidden default (the first height). */
  hubHeight: number | null;
  /** `txt_…Fields_HubHeight_1` — typed only for a Dummy supplier (it sits where Hub Height is). */
  revisedHubHeight: string;
  numberOfGenerators: string;
  /** Unused since D27 (the Cost field is hidden, `Visible: false` Y:14300); kept for callers. */
  cost: string;
  /** Fields the user actually touched — replaces `colPanelGeneratorFormValidation.Dirty`. */
  dirty: Set<string>;
}

export interface TypeFormErrors {
  Supplier: string | null;
  TurbineType: string | null;
  Hubheight: string | null;
  RevisedHubheight: string | null;
  NumberOfGenerators: string | null;
  Cost: string | null;
}

/**
 * The type panel's validation record — `colPanelGeneratorFormValidation` re-derived from the values
 * (D27; the canvas kept stale rows, e.g. a changed supplier left `TurbineType` valid after the
 * combobox reset):
 *  - `Supplier` / `TurbineType` / `Hubheight`: a value is chosen. Rule 5 — a Dummy supplier
 *    forces `Hubheight` valid (`cmb_Supplier_1.OnChange`, Y:14576).
 *  - `RevisedHubheight`: Dummy → the typed revised height is non-blank, two decimals, 1…200
 *    (`txt_…HubHeight_1.OnChange`, Y:14815); otherwise the chosen height is not 0
 *    (`cmb_Supplier_2.OnChange`, Y:14693).
 *  - `NumberOfGenerators`: an integer 1…200 (`txt_…NumberOfGenerator.OnChange`, Y:15054).
 *  - `Cost`: `Valid: locGeneratorCostsPerWtg > 0` (Y:15072) — the DERIVED cost, never the hidden
 *    field. D27 fixes the blocking defect where `form.cost` (always "") made Save unreachable.
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
  const revised = form.revisedHubHeight.trim();
  return {
    Supplier: isBlank(form.supplier) ? MSG.valueBlank : null,
    TurbineType: isBlank(form.turbineType) ? MSG.valueBlank : null,
    Hubheight: dummy ? null : form.hubHeight === null ? MSG.valueBlank : null,
    RevisedHubheight: dummy
      ? (revised === "" ? MSG.inputBlank : validateEffectiveHubHeight(revised, lang))
      : form.hubHeight === 0 ? MSG.hubHeightRange : null,
    NumberOfGenerators: numberOfGeneratorsSaveable(form.numberOfGenerators, lang)
      ? null
      : validateNumberOfGenerators(form.numberOfGenerators, lang) ?? MSG.numberOfGeneratorsRange,
    Cost: costRowValid(ctx.derivedCostPerWtg) ? null : MSG.inputBlank,
  };
}

/**
 * `lbl_GeneratorData_RightPanel_Form_Fields_NumberOfGenerator_ErrorMessage` — its `Visible` has no
 * dirty test (Y:14943), so the message shows as soon as the panel opens. `null` = hidden.
 */
export const numberOfGeneratorsMessage = (value: string, lang: Lang = "en-US"): string | null =>
  validateNumberOfGenerators(value, lang);

/**
 * `lbl_GeneratorData_RightPanel_Form_Fields_ErrorMessage{,_1,_2}.Visible` (Y:14204/14511/14624).
 * SOURCE DEFECT (D27): the canvas filters the validation table on `Name = "Generator"`, a row that
 * never exists, so "Value cannot be blank." never shows for Supplier, Turbine Type or Hub Height.
 * Shown here once the field was touched and is blank; the twin keeps the canvas (UT-GEN-097).
 */
export const typeFieldBlankMessage = (dirty: boolean, blank: boolean): string | null =>
  dirty && blank ? MSG.valueBlank : null;
export const typeFieldBlankMessageCanvasParity = (_dirty: boolean, _blank: boolean): string | null => null;

/**
 * `pcf_btn_GeneratorData_RightPanel_Form_Buttons_Save.DisplayMode` (Y:15169) —
 * `And(CountRows(Filter(validation, Valid = false)) = 0, CountRows(Filter(validation, Dirty = true)) > 0,
 * Not(<PM error label>.Visible))`. The `Cost` row starts `Dirty: true` (`addWTGType`, Y:791), so
 * the dirty conjunct always holds and is not modelled.
 */
export function canSaveType(args: {
  errors: TypeFormErrors;
  heightBlocked: boolean;
}): boolean {
  if (args.heightBlocked) return false;
  return Object.values(args.errors).every((e) => e === null);
}

/**
 * NEW — no canvas equivalent (DIVERGENCE, D89, proposed): the warning that says why the type Save is
 * disabled when no field the user can see explains it. The canvas shows nothing in that case: its
 * `Cost` row (`Valid: locGeneratorCostsPerWtg > 0`, Y:15072) belongs to a field that is hidden
 * (`con_GeneratorData_RightPanel_Form_Fields_Cost.Visible: false`, Y:14300), and the `RevisedHubheight`
 * row of a non-Dummy model with a 0 m hub height (`cmb_Supplier_2.OnChange`, Y:14693) has no label,
 * because the revised hub height box shows only for a Dummy supplier. The gate itself is unchanged.
 */
export const TYPE_SAVE_BLOCKED_TEXT = {
  hubHeightZero: "The selected hub height is 0 m. Choose another hub height to save this generator type.",
  indexUnavailable:
    "The price inflation index could not be loaded, so the cost per WTG cannot be calculated. Reload the page or try again later.",
  noIndex: (fidYear: number | null): string =>
    `No price inflation index is set for ${fidYear === null ? "the project's FID year" : `the FID year ${fidYear}`} in Estimation Price Inflations, so the cost per WTG is 0. Save stays disabled until the index is added.`,
  /** `band` is the canvas column the count reads: `'1 WTG price'` … `'5 WTG price'` (5 or more → 5). */
  noPrice: (model: string, band: number): string =>
    `"${model}" has no '${band} WTG price', so the cost per WTG is 0. Save stays disabled until the price is added to the generator.`,
} as const;

/**
 * NEW (D89) — the hidden reason `canSaveType` is false, as one `TYPE_SAVE_BLOCKED_TEXT` message, or
 * `null` when there is nothing to add: Save is enabled, a visible field message already explains it,
 * the height-limit message is showing, or the price index is still loading. It explains the gate and
 * never changes it. The cost arm follows `costPerWtg`: (band price + additional foundation cost) × index.
 */
export function typeSaveBlockedReason(args: {
  errors: TypeFormErrors;
  heightBlocked: boolean;
  dummy: boolean;
  model: Pick<CatalogModel, "prices" | "additionalFoundationCost" | "displayName" | "name" | "turbineType"> | null;
  count: number;
  index: { value: number; loading: boolean; failed: boolean };
  fid: string | null | undefined;
}): string | null {
  const e = args.errors;
  if (args.heightBlocked || args.model === null) return null;
  if (e.Supplier || e.TurbineType || e.Hubheight) return null;
  // A non-Dummy model with a 0 m hub height: blocked with no label, whatever the count.
  if (!args.dummy && e.RevisedHubheight) return TYPE_SAVE_BLOCKED_TEXT.hubHeightZero;
  if (e.RevisedHubheight || e.NumberOfGenerators) return null;
  if (e.Cost === null) return null;
  if (args.index.loading) return null;
  if (args.index.failed) return TYPE_SAVE_BLOCKED_TEXT.indexUnavailable;
  if (!(args.index.value > 0)) {
    const year = args.fid ? Number(String(args.fid).slice(0, 4)) : NaN;
    return TYPE_SAVE_BLOCKED_TEXT.noIndex(Number.isFinite(year) ? year : null);
  }
  if (wtgPriceBand(args.model, args.count) + (args.model.additionalFoundationCost ?? 0) <= 0) {
    const band = args.count >= 1 && args.count <= 4 ? args.count : 5;
    const label = args.model.displayName ?? args.model.name ?? args.model.turbineType ?? "";
    return TYPE_SAVE_BLOCKED_TEXT.noPrice(label, band);
  }
  return null;
}

export interface TurbineFormState {
  nameIndex: string;
  effectiveCapacity: string;
  effectiveHubHeight: string;
  foundationPlinth: string;
  dirty: Set<string>;
}

/**
 * `pcf_btn_…_Generator_Buttons_Save.DisplayMode` (Y:11593) — non-blank name / effective capacity /
 * hub height, the name, capacity, hub-height, plinth and PM error labels hidden, and at least one
 * dirty row in `colPanelWtgFormValidation`. `existingIndices` are EVERY turbine of the project
 * (`colGeneratorsInProjectsTemporary`, Y:10614 — D27 corrects the per-type scope).
 */
export function canSaveTurbine(args: {
  form: TurbineFormState;
  existingIndices: number[];
  currentIndex?: number | null;
  specificCapacity: number | null | undefined;
  heightBlocked: boolean;
  /** The user's language. Required: the panel's boxes open in it (`turbineFormDefaults`). */
  lang: Lang;
}): boolean {
  const { lang } = args;
  if (args.heightBlocked) return false;
  const f = args.form;
  if (isBlank(f.nameIndex.trim()) || isBlank(f.effectiveCapacity.trim()) || isBlank(f.effectiveHubHeight.trim())) {
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
  if (validateFoundationPlinth(f.foundationPlinth.trim(), lang) !== null) return false;
  return f.dirty.size > 0;
}


/* ════════════════════════════════════════════════════════════════ permissions ════ */

/**
 * Rule 25 — the permission-state chip label: `lbl_…_RequestState.Text: =ThisItem.'Request Permission
 * State'`, i.e. the column's own option label — "Request Approved / Declined / Pending / Canceled"
 * (Y:3756). It read "Permission …" (the `gblAppConstants` names) until 3 Nov 2026.
 */
export function permissionStateLabel(state: number | null | undefined): string | null {
  switch (state) {
    case CHOICE_PLANT.requestPermissionState.approved: return "Request Approved";
    case CHOICE_PLANT.requestPermissionState.declined: return "Request Declined";
    case CHOICE_PLANT.requestPermissionState.pending: return "Request Pending";
    case CHOICE_PLANT.requestPermissionState.canceled: return "Request Canceled";
    default: return null;
  }
}

/**
 * Rule 25 — `Switch(Text('Request Permission State'),
 *   "Request Approved", Success, "Request Declined", Error,
 *   "Request Pending", Warning, "Request Canceled", ButtonDisabledBg)` (Y:3692-3748)
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

/**
 * Rule 15 — the fields the request path sets on the type row. The canvas only mirrors them into its
 * collection (`UpdateIf(colGeneratorTypeInProjects, …)`); `RequestModulePermission` writes them to Dataverse
 * itself right after it responds (`Scope_update_RunId_and_Approval_Id_info`), so the code app does NOT patch
 * them (D97): a late Pending write could overwrite the flow's Approved or hit a row a decline deleted.
 */
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

/** The families whose rows carry a module-permission request (`showsPermissionChip`). */
export type PermissionFamily = "wtg" | "pv" | "inverter" | "substructure";

/**
 * `varModule` for one row (D97): `Name` is what each canvas call site sends — `Generator.DisplayName` for a WTG type
 * (Y:2641 / 15665), `Label` for a PV type (Y:3787 / 15475), `'Inverter Label'` (Y:4455 / 15386) and `'Substructure
 * Label'` (Y:5114 / 15297). It also names the type in the cards' Cancel success text.
 */
export function permissionModuleName(
  family: PermissionFamily,
  row: Partial<Pick<GeneratorTypeRow, "generatorDisplayName">> & Partial<Pick<SimpleTypeRow, "moduleLabel" | "label">>,
): string | null {
  if (family === "wtg") return row.generatorDisplayName ?? null;
  if (family === "pv") return row.moduleLabel ?? null;
  return row.label ?? null;
}

export function cancellationPayloadFor(
  family: PermissionFamily,
  row: Pick<SimpleTypeRow, "id" | "flowRunId" | "flowApprovalId">
    & Partial<Pick<GeneratorTypeRow, "generatorDisplayName">> & Partial<Pick<SimpleTypeRow, "moduleLabel" | "label">>,
): CancellationPayload {
  return buildCancellationPayload(family, {
    id: row.id, name: permissionModuleName(family, row), flowRunId: row.flowRunId, flowApprovalId: row.flowApprovalId,
  });
}

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
 * `vsb_PvModuleTypeInProject` columns the PV save writes (`pcf_btn_…PvModuleType_Buttons_Save.OnChange`,
 * Y:8011-8033), resolved through `Vsb_pvmoduletypeinprojectsModel`. D27 corrects the supplier:
 * the canvas writes `PVModule: cmb.Selected` (the `vsb_PVModule` lookup) and `'Other Supplier'`
 * (`vsb_othersupplier`); the code wrote the supplier text into the hidden "Module Type" column
 * (`vsb_type`).
 */
export const PV_TYPE_COL = {
  label: "vsb_label",
  pvModuleBind: "vsb_PVModule@odata.bind",
  otherSupplier: "vsb_othersupplier",
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

/** `txt_…PvModuleType_Fields_Label.MaxLength` / `_OtherSupplier.MaxLength` (Y:7343/7670) — 512 (the canvas twin of the cap below). */
export const PV_MODULE_LABEL_MAX_LENGTH_CANVAS = 512;
/**
 * DIVERGENCE (generators fix F5, D121 §4): `vsb_pvmoduletypeinproject` `vsb_label` and `vsb_othersupplier` hold 100
 * characters (`.power/schemas/dataverse/pvmoduletypeinprojects.Schema.json`, pinned by a test), the canvas boxes accept 512. A
 * longer text only failed at the create with a 400, and Replace PV deleted the old type first. The box and the Save gate now stop at 100.
 */
export const PV_MODULE_LABEL_MAX_LENGTH = 100;
/**
 * DIVERGENCE (F5, D121 §4): `vsb_name` and `vsb_supplier` of the BESS / Hydrogen / Substation type tables hold 100
 * (`storagetypeinprojects` / `hydrogentypeinprojects` / `substationtypeinprojects` schemas, pinned by a test); the canvas has no limit.
 */
export const SIMPLE_TEXT_MAX_LENGTH = 100;
/** NEW TEXT (F5): the error under a label / supplier box over the Dataverse limit. */
export const textTooLongMessage = (max: number): string => `Please enter at most ${max} characters.`;
/** `txt_…PvModuleType_Fields_PVCapacityMW.MaxLength` (Y:7447). */
export const PV_CAPACITY_MAX_LENGTH = 6;
/** `txt_…PvModuleType_Fields_Degradation{FirstYear,RemainingYears}.MaxLength` (Y:7774/7883). */
export const PV_DEGRADATION_MAX_LENGTH = 10;

/** The `PVModules` catalogue row the Supplier combobox offers (`colPVModulesSuppliers`, App:1506). */
export interface PvModuleOption {
  id: string;
  displayName: string | null;
  supplier: string | null;
}

export interface PvTypeFormState {
  moduleLabel: string;
  capacity: string;
  /** The chosen `PVModules` row id (`cmb_…PvModuleType_Fields_Supplier.Selected`). */
  supplier: string | null;
  /** `txt_…PvModuleType_Fields_OtherSupplier` — shown only for the "Other Supplier" module. */
  otherSupplier?: string;
  degradation1stYear: string;
  degradationRemainingYears: string;
  dirty: Set<string>;
}

export interface PvTypeFormErrors {
  moduleLabel: string | null;
  capacity: string | null;
  supplier: string | null;
  otherSupplier?: string | null;
  degradation1stYear: string | null;
  degradationRemainingYears: string | null;
}

/** The PV panel's verbatim messages. */
export const PV_MSG = {
  /** `lbl_…PvModuleType_Fields_Label_ErrorMessage.Text` (Y:7326) — verbatim. */
  blank: "Value cannot be blank.",
  /** `lbl_…PVCapacityMW_ErrorMessage.Text` (Y:7412) — verbatim. */
  twoDecimals: "Numeric value with maximum of two decimals",
  /** `lbl_…PVCapacityMW_ErrorMessage.Text` (Y:7420) — verbatim. */
  capacityRange: "Please select a value between 0 and 500.",
  /** `lbl_…DegradationFirstYear_ErrorMessage.Text` (Y:7739) — verbatim. */
  threeDecimals: "Numeric value with maximum of three decimals",
  /** `lbl_…DegradationRemainingYears_ErrorMessage.Text` (Y:7848) — verbatim (sic). */
  threeDecimalRemaining: "Value must be a number with three decimal",
  /** `lbl_…Degradation*_ErrorMessage.Text` (Y:7747/7856) — verbatim. */
  percentRange: "Please select a value between 0 and 100.",
  /** `cmb_…Supplier` option `'Display Name'` that reveals the Other Supplier field (Y:7632). */
  otherSupplierOption: "Other Supplier",
  /** `pcf_btn_…PvModuleType_Buttons_Save.OnChange` success `Notify` (Y:8161) — verbatim. */
  saved: "PV Module type was successfully saved for current project!",
  /** `cmp_GeneratorData_PopUp_ConfirmationDeletePVModuleType.OnConfirm` success (Y:15594) — verbatim. */
  deleted: "PVModule type was successfully deleted.",
} as const;

/**
 * F9 / GP-6: the PV panel's Degradation 1st Year prefill. The field accepts three decimals (`fn_Numeric_Generators.IsThreeDecimal`),
 * so the stored value is shown as it is, as Degradation Remaining Years already is; the shared two-decimal prefill rounded 0.125
 * to 0.13 and an unchanged Save then stored the rounded value.
 * DIVERGENCE: the canvas (Y:7777) formats it `If(Int(x) = x, Text(x, "#"), Text(x, "0.0#"))`, two decimals (D121 §6).
 */
export const pvDegradationPrefill = (v: number | null | undefined, lang: Lang = "en-US"): string =>
  v === null || v === undefined ? "" : forLanguage(String(v), lang);

/**
 * F9 / GP-10: whether the PV follow-up back-fills the AllWTG land-lease costs: the type is new, OR the follow-up has to CREATE
 * the unit (`unitId` null). A first Add that failed after the type landed leaves a type with no unit; the edit that creates the unit
 * must allocate it too, or it stays out of every AllWTG cost. DIVERGENCE: the canvas gates on `varIsNewPvModule` alone
 * (D121 §7).
 */
export const pvFollowUpIsNew = (a: { editing: boolean; unitId: string | null }): boolean => !a.editing || a.unitId === null;

/** `$"PV Module '{txt_…Label.Value}' will be saved, please wait..."` (Y:7979). INTERPOLATED. */
export const pvSaveProgressText = (label: string): string =>
  `PV Module '${label}' will be saved, please wait...`;

/** `"Error: PV Module type could not be saved correctly. " & "Internal error: originated on " & …` (Y:8166). */
export const pvSaveErrorText = (detail: string): string =>
  `Error: PV Module type could not be saved correctly. Internal error: originated on ${ES_PLANT.pvModuleTypeInProjects}. Message: ${detail}`;

/** `"Error: PVModule could not be deleted. " & …` (Y:15599). */
export const pvDeleteErrorText = (detail: string): string =>
  `Error: PVModule could not be deleted. Internal error: originated on ${ES_PLANT.pvModuleTypeInProjects}. Message: ${detail}`;

/** `Trim(cmb.Selected.'Display Name') = "Other Supplier"` (Y:7632, Y:7949). */
export const isOtherSupplierModule = (option: Pick<PvModuleOption, "displayName"> | null | undefined): boolean =>
  (option?.displayName ?? "").trim() === PV_MSG.otherSupplierOption;

/** A blank, or a 3-decimal number in 0…100 — `fn_Numeric_Generators.IsThreeDecimal` + `InRange`. */
function degradationError(value: string, decimalsText: string, lang: Lang): string | null {
  const v = value.trim();
  if (isBlank(v)) return null;
  if (!isDecimalWithPlaces(v, 3, lang)) return decimalsText;
  if (!inRange(v, 0, 100, lang)) return PV_MSG.percentRange;
  return null;
}

/**
 * The PV panel's error labels, as the canvas computes them (Y:7323-7858). Visible only where the
 * canvas shows them: the label once touched and blank; the capacity and the two degradations
 * whenever they hold a bad non-blank value; Other Supplier once touched and blank.
 *
 * SOURCE DEFECT (D27): `lbl_…OtherSupplier_ErrorMessage.Text` tests the MODULE LABEL, not the other
 * supplier (Y:7648), so with a label typed it blocked Save with an empty message. The text is now
 * "Value cannot be blank." whenever the label is visible.
 */
export function validatePvTypeForm(
  form: Pick<
    PvTypeFormState,
    "moduleLabel" | "capacity" | "supplier" | "otherSupplier" | "degradation1stYear" | "degradationRemainingYears" | "dirty"
  >,
  opts: { otherSupplierChosen: boolean },
  lang: Lang = "en-US",
): PvTypeFormErrors {
  const cap = form.capacity.trim();
  const other = (form.otherSupplier ?? "").trim();
  return {
    moduleLabel: form.dirty.has("moduleLabel") && isBlank(form.moduleLabel.trim())
      ? PV_MSG.blank
      : form.moduleLabel.length > PV_MODULE_LABEL_MAX_LENGTH ? textTooLongMessage(PV_MODULE_LABEL_MAX_LENGTH) : null,
    capacity: isBlank(cap)
      ? null
      : !isDecimalWithPlaces(cap, 2, lang)
        ? PV_MSG.twoDecimals
        : !inRange(cap, 0, 500, lang) ? PV_MSG.capacityRange : null,
    supplier: null,
    otherSupplier: opts.otherSupplierChosen && form.dirty.has("otherSupplier") && isBlank(other)
      ? PV_MSG.blank
      : opts.otherSupplierChosen && (form.otherSupplier ?? "").length > PV_MODULE_LABEL_MAX_LENGTH
        ? textTooLongMessage(PV_MODULE_LABEL_MAX_LENGTH) : null,
    degradation1stYear: degradationError(form.degradation1stYear, PV_MSG.threeDecimals, lang),
    degradationRemainingYears: degradationError(form.degradationRemainingYears, PV_MSG.threeDecimalRemaining, lang),
  };
}

/**
 * `pcf_btn_…PvModuleType_Buttons_Save.DisplayMode` (Y:7949): no error label visible; a module chosen —
 * and, for the "Other Supplier" module, a non-blank Other Supplier (bug 1415); a non-blank label
 * and capacity. There is NO dirty conjunct (D27 corrects the code), so an unchanged edit saves.
 */
export function canSavePvType(
  errors: PvTypeFormErrors,
  form: Pick<PvTypeFormState, "moduleLabel" | "capacity" | "supplier" | "otherSupplier">,
  opts: { otherSupplierChosen: boolean },
): boolean {
  if (Object.values(errors).some((e) => e !== null && e !== undefined)) return false;
  if (isBlank(form.supplier)) return false;
  if (opts.otherSupplierChosen && isBlank((form.otherSupplier ?? "").trim())) return false;
  return !isBlank(form.moduleLabel.trim()) && !isBlank(form.capacity.trim());
}

/**
 * The Supplier combobox's options: `Filter(colPVModulesSuppliers, Not("Imported" in 'Display Name'))`
 * (Y:7543), where `colPVModulesSuppliers` is `PVModules` without "Other Supplier", then that row
 * appended (App:1506-1519). D27 replaces the code's "suppliers already on the project".
 */
export function pvSupplierOptions(rows: readonly PvModuleOption[]): PvModuleOption[] {
  const isOther = (r: PvModuleOption) => r.displayName === PV_MSG.otherSupplierOption;
  const ordered = [...rows.filter((r) => !isOther(r)), ...rows.filter(isOther).slice(0, 1)];
  return ordered.filter((r) => !(r.displayName ?? "").includes("Imported"));
}

/**
 * Rule 17, PV — the `Patch(PVModuleTypeInProjects, …)` field map (Y:8011-8033): Label, the PVModule
 * bind, Other Supplier, both degradations (`Value("")` → blank), `'Cost per Power'` = the Modules
 * device cost (0 when blank), `'Capacity [MWp]'`, `'Cost [EUR]'` = cost per power × capacity. The
 * project and owner binds are added by `planSavePvType`.
 *
 * SOURCE DEFECT (D27): the hidden Other Supplier field keeps its default (the row's stored value)
 * when another module is picked, so the canvas wrote a stale other supplier that the card then
 * shows instead of the module's supplier. It is written only for the "Other Supplier" module
 * (`pvOtherSupplierValueCanvasParity` keeps the canvas, UT-GEN-108).
 */
export function buildPvTypeFields(
  form: Pick<
    PvTypeFormState,
    "moduleLabel" | "capacity" | "supplier" | "otherSupplier" | "degradation1stYear" | "degradationRemainingYears"
  >,
  opts: { deviceCostModules: number | null | undefined; otherSupplierChosen?: boolean; lang?: Lang },
): Record<string, unknown> {
  const lang = opts.lang ?? "en-US";
  const capacityMwp = numericOr(form.capacity, 0, lang);
  const costs = pvCosts({ deviceCostModules: opts.deviceCostModules, capacityMwp });
  const other = (form.otherSupplier ?? "").trim();
  return {
    [PV_TYPE_COL.label]: form.moduleLabel,
    ...(form.supplier ? { [PV_TYPE_COL.pvModuleBind]: `/${ES_PLANT.pvModules}(${form.supplier})` } : {}),
    [PV_TYPE_COL.otherSupplier]: opts.otherSupplierChosen && other !== "" ? other : null,
    [PV_TYPE_COL.capacity]: capacityMwp,
    [PV_TYPE_COL.costPerPower]: costs.costPerPower,
    [PV_TYPE_COL.cost]: costs.cost,
    [PV_TYPE_COL.degradation1stYear]:
      isBlank(form.degradation1stYear.trim()) ? null : numericOr(form.degradation1stYear, 0, lang),
    [PV_TYPE_COL.degradationRemainingYears]:
      isBlank(form.degradationRemainingYears.trim()) ? null : numericOr(form.degradationRemainingYears, 0, lang),
  };
}

/** The canvas twin of the Other Supplier write: the hidden field's value, whatever module is chosen. */
export const pvOtherSupplierValueCanvasParity = (fieldValue: string): string | null =>
  isBlank(fieldValue) ? null : fieldValue;


/* ═══════════════════════════════════════════════════════════════════ formatting ══ */

/**
 * A number's en-US text as the user's language writes it: for a comma-decimal language "." and ","
 * swap (`1,234.50` becomes `1.234,50`), as the canvas `Text(n, fmt, Language())` renders it. Same rule as
 * `pfxText` on the Production screen. A function declaration, so it is hoisted for module-level callers.
 */
export function forLanguage(en: string, lang: Lang = "en-US"): string {
  return decimalSeparator(lang) === "." ? en : en.replace(/[.,]/g, (c) => (c === "." ? "," : "."));
}

/**
 * Power Fx `Text(value, "<pattern>")` for the custom numeric patterns this screen uses (`#`,
 * `#0.0#`, `#0.00`, `#.0`, `#0.0`, `0.0#`, `0`, `#,##0.00`, `#,##0.0`, `#,###.00`, `#.0#`), in
 * en-US notation: `0` is a required digit, `#` an optional one, `,` turns on thousands grouping.
 * A blank value is `""`, as `Text(Blank(), …)` is. `lang` (default en-US) swaps the separators for a
 * comma-decimal language (see `forLanguage`).
 */
export function textFormat(value: number | null | undefined, pattern: string, lang: Lang = "en-US"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  const [intPart = "", fracPart = ""] = pattern.split(".");
  const minFrac = (fracPart.match(/0/g) ?? []).length;
  const maxFrac = fracPart.length;
  const minInt = (intPart.match(/0/g) ?? []).length;
  const grouped = intPart.includes(",");
  const negative = value < 0;
  const rounded = pfxRound(Math.abs(value), maxFrac);
  const fixed = rounded.toFixed(maxFrac);
  let [whole = "", frac = ""] = fixed.split(".");
  while (frac.length > minFrac && frac.endsWith("0")) frac = frac.slice(0, -1);
  whole = whole.replace(/^0+/, "");
  while (whole.length < minInt) whole = `0${whole}`;
  if (grouped) whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = frac ? `${whole}.${frac}` : whole;
  const text = negative && body !== "" && /[1-9]/.test(body) ? `-${body}` : body;
  return forLanguage(text, lang);
}

/** `If(Int(x) = x, Text(x, "#"), Text(x, <alt>))` — the card formula every height / power uses. */
export const textIntOr = (value: number | null | undefined, alt: string, lang: Lang = "en-US"): string =>
  value === null || value === undefined ? "" : Number.isInteger(value) ? textFormat(value, "#", lang) : textFormat(value, alt, lang);

/** Grid formats from `…_GeneratorsList.Items` (Y:2124-2138): `#0.0#`. */
export const fmtCapacity = (v: number | null | undefined, lang: Lang = "en-US"): string => textFormat(v, "#0.0#", lang);

/** `Text(…, "#0.00")`. */
/** The "Replace from" hub height: the stored value as the canvas combobox shows it — "169", "169.5". */
export const fmtHubHeight = (v: number | null | undefined, lang: Lang = "en-US"): string => textFormat(v, "#0.##", lang);

/** `TotalHeight` grid column — `Text(ThisRecord.'Total Height', "#0.0#")` (Y:2138). */
export const fmtHeight = fmtCapacity;

/** Guard for the numeric inputs — the shared components enforce the `fn_Numeric` rules. */
export const numericOr = (value: string, fallback: number, lang: Lang = "en-US"): number =>
  isNumeric(value, lang) ? parseNumber(value, lang) : fallback;

/** `Value(<text>)` — a blank or non-numeric input is blank (null), as `Value("")` is. */
export const valueOrNull = (value: string, lang: Lang = "en-US"): number | null =>
  isNumeric(value.trim(), lang) ? parseNumber(value.trim(), lang) : null;
