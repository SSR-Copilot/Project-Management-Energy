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
import {
  isNumeric, isInteger, isDecimalWithPlaces, inRange, parseNumber, pfxRound, roundUp,
  isBlank, decimalSeparator, type Lang,
} from "@/domain/powerFxNumeric";
import { CHOICE_PLANT, ES, ES_PLANT } from "@/data/dataverseNames";
import { bind, OWNING_BU_BIND } from "@/data/odata";
import { foundationCostAdded, foundationCostAddedBooleanReading } from "@/domain/foundationCost";
import {
  CREATED_ROW_ID, createdRowRef, createMany, emptyPlan, hardenedDelete, refusePlan, together, updateMany, type PlannedWrite, type WritePlan,
} from "@/data/writePlan";
import { CASCADE_DELETE_CONCURRENCY, LEAF_DELETE_CONCURRENCY, WIDE_GROUP_CONCURRENCY } from "@/data/concurrency";
import type { LandedRow } from "@/data/executePlan";
import { GENERATORS_BULK } from "@/data/generatorsBulkFlags";
import { generatorsPerf, type GeneratorsPerfFlags } from "@/data/generatorsPerfFlags";
import { GENERATORS_DELETE, type DeleteFlagOverrides, type GeneratorsDeleteFlags } from "@/data/generatorsDeleteFlags";
import { newRowId } from "@/data/newRowId";
import type { BulkRow } from "@/data/bulkBackend";

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

/* ═════════════════════════════════ screen captions — cards, panels, dialogs ════ */
/*
 * Canvas strings the screen renders that were not transcribed above. Every entry cites the
 * `Control.Property` it came from in `Src/Project Generators Screen.pa.yaml`; none is
 * reworded (CONVENTIONS rule 7), trailing spaces and the canvas' own inconsistencies included.
 */

/** `pcf_Generators_DisplayProject_Body_Form_CommandBar.AccessibilityLabel` — verbatim. */
export const COMMAND_BAR_LABEL = "pcf_Generators_DisplayProject_Body_Form_CommandBar";

/**
 * `con_Generators_DisplayProject_Body_Form_FirstColumn.Visible` —
 * `!IsBlank(gblRecordSelectedProject.'End Date')`: the seven galleries show only once the
 * project has an end date.
 */
export const isBodyVisible = (project: Pick<GeneratorsProject, "endDate"> | null): boolean =>
  project !== null && !isBlank(project.endDate);

/**
 * The command bar's `ItemIconName`, per row of its `Items` table:
 *  - `"Add"` / `"Edit"` by selection for the two PV/inverter/substructure add-or-edit rows;
 *  - BESS / Hydrogen / Substation carry `If(Not(IsBlank(<selection>)), "Edit")` — no icon at
 *    all while nothing is selected;
 *  - every delete row `"Delete"`, `addWTGType` / `addOthers` `"Add"`;
 *  - Activate / Deactivate use `"ActivateOrders"` / `"DeactivateOrders"` (canvas `ItemIconName`);
 *  - the 1.21.753 Replace rows show the sync arrows of the live screen (`"Refresh"`, PO
 *    screenshot 20 Oct 2026). These three had no icon here before.
 */
export function generatorCommandIcon(
  key: GeneratorCommandKey,
  state: Pick<CommandItemState, "label">,
): "Add" | "Edit" | "Delete" | "Refresh" | "ActivateOrders" | "DeactivateOrders" | null {
  if (key.startsWith("delete")) return "Delete";
  if (key === "replaceGeneratorType" || key === "replacePVModuleType") return "Refresh";
  if (key === "activateGenerator") return "ActivateOrders";
  if (key === "deactivateGenerator") return "DeactivateOrders";
  if (key === "addWTGType" || key === "addOthers") return "Add";
  if (key === "addPVType" || key === "addInverterType" || key === "addSubstructureType") {
    return state.label.startsWith("Edit") ? "Edit" : "Add";
  }
  if (key === "addStorage" || key === "addHydrogen" || key === "addSubstation") {
    return state.label.startsWith("Edit") ? "Edit" : null;
  }
  return null;
}

/**
 * The bar's rendering order: `Items` source order, except that BESS / Hydrogen / Substation
 * follow "Add Others" while their `ItemParentKey` is `"addOthers"` — i.e. while nothing of
 * that family is selected (`ItemParentKey: If(IsBlank(<selection>), "addOthers")`).
 */
export function commandBarOrder(selected: {
  storage: boolean; hydrogen: boolean; substation: boolean;
}): GeneratorCommandKey[] {
  const nested = new Set<GeneratorCommandKey>();
  if (!selected.storage) nested.add("addStorage");
  if (!selected.hydrogen) nested.add("addHydrogen");
  if (!selected.substation) nested.add("addSubstation");
  const out: GeneratorCommandKey[] = [];
  for (const key of GENERATOR_COMMAND_KEYS) {
    if (nested.has(key)) continue;
    out.push(key);
    if (key === "addOthers") out.push(...GENERATOR_COMMAND_KEYS.filter((k) => nested.has(k)));
  }
  return out;
}

/**
 * PowerCAT `ItemParentKey` — the command a command sits UNDER, or `undefined` for top level.
 *
 * Canvas (`pcf_Generators_DisplayProject_Body_Form_CommandBar.Items`): Add BESS / Hydrogen /
 * Substation carry `ItemParentKey: If(IsBlank(locSelected<Family>TypeEntity), "addOthers")`, so
 * they are entries of the "Add Others" drop-down until a row of that family is selected, then
 * stand at top level beside their Delete.
 *
 * DIVERGENCE (PO G9, 20 Oct 2026): Add Inverter / Add Substructure are `ItemVisible: false` in
 * the canvas; the product owner asked for their panels, so they are exposed — inside "Add
 * Others", which keeps the top-level bar exactly the canvas one.
 */
export function commandParentKey(
  key: GeneratorCommandKey,
  selected: { storage: boolean; hydrogen: boolean; substation: boolean },
): GeneratorCommandKey | undefined {
  switch (key) {
    case "addStorage": return selected.storage ? undefined : "addOthers";
    case "addHydrogen": return selected.hydrogen ? undefined : "addOthers";
    case "addSubstation": return selected.substation ? undefined : "addOthers";
    case "addInverterType": case "addSubstructureType": return "addOthers";
    default: return undefined;
  }
}

/**
 * `If(Not(IsBlank(gblRecordSelectedProjectCountry.'ISO Currency Code')), <code>, "EUR")` — the
 * currency every `[…]` cost caption on this screen interpolates.
 */
export const isoOrEur = (isoCurrencyCode: string | null | undefined): string =>
  isBlank(isoCurrencyCode) ? "EUR" : String(isoCurrencyCode);

/** INTERPOLATED — `$"<base> [{isoOrEur}]"`, the shape of every currency caption here. */
export const currencyCaption = (base: string, isoCurrencyCode: string | null | undefined): string =>
  `${base} [${isoOrEur(isoCurrencyCode)}]`;

/** The WTG type card (`gal_Generators_DisplayProject_Body_Form_GeneratorTypes`). */
export const WTG_CARD_LABELS = {
  /** `pcf_Generators_DisplayProject_Body_Form_GeneratorType_CardDetails_CommandBar.Items.ItemDisplayName` — verbatim. */
  addGenerator: "Add Generator",
  /** `pcf_Generators_DisplayProject_Body_Form_GeneratorType_CardDetails_CommandBar.Tooltip` — verbatim. */
  addGeneratorBarLabel: "Generator type Menu",
  /** `lbl_GeneralData_DisplayProject_Body_Checklist.Text` (inside the WTG card) — verbatim. */
  addGeneratorWarning: "Generators can only be added to an active generator type",
  /** `lbl_Generator_GeneratorHeightLimitationTag.Text` — verbatim. */
  heightLimitationTag: "Height Limitation",
  /** `…_GeneratorsList.columns_Items` — the first column's `ColDisplayName: ""`, verbatim. */
  turbineNameColumn: "",
  /**
   * NEW (PO, 20 Oct 2026): the canvas leaves the turbine grid's name column and its edit /
   * delete columns without a header; the product owner asked for these two captions. The canvas
   * blank is kept above as `turbineNameColumn`.
   */
  generatorNameHeader: "Generator Name",
  /** NEW (PO, 20 Oct 2026) — the header over the edit and delete icon columns. */
  actionsHeader: "Actions",
  /** `pcf_Generators_DisplayProject_Body_Form_GeneratorType_CardDetails_GeneratorsList.Tooltip` — verbatim. */
  turbineGrid: "Generators list",
  /** `…_GeneratorsList.columns_Items` — the edit column's `ColName` (it has no `ColDisplayName`). */
  editIconColumn: "EditIcon",
  /** `…_GeneratorsList.columns_Items` — the delete column's `ColName` (it has no `ColDisplayName`). */
  deleteIconColumn: "DeleteIcon",
  /** `…_GeneratorsList.columns_Items` — the over-height-limit info column's `ColName`, after Delete (`Y:2382`). */
  infoIconColumn: "InformationIcon",
} as const;

/**
 * `lbl_…_GeneratorsList_TotalRows.Text` — `If(TotalRows > 1, $"Generators: {TotalRows}", "")`.
 * INTERPOLATED.
 */
export const generatorsTotalRowsText = (totalRows: number): string =>
  totalRows > 1 ? `Generators: ${totalRows}` : "";

/**
 * `lbl_…_GeneratorsList_Pagination.Text` — `If(Pages > 1, "Page: " & Page & " from " & Pages, "")`.
 * INTERPOLATED.
 */
export const paginationText = (page: number, pages: number): string =>
  pages > 1 ? `Page: ${page} from ${pages}` : "";

/** The inverter card (`gal_Generators_DisplayProject_Body_Form_Invertors`). */
export const INVERTER_CARD_LABELS = {
  /** `lbl_Generators_DisplayProject_Body_Form_Inverters_CardDetails_InverterType.Text` — verbatim. */
  inverterType: "Inverter Type",
  /** `lbl_Generators_DisplayProject_Body_Form_Inverters_CardDetails_Supplier.Text` — verbatim. */
  supplier: "Supplier",
  /** `lbl_…_Inverters_CardDetails_CostPerInverter.Text` — the base of `$"Cost per Inverter [{iso}]"`. */
  costPerInverter: "Cost per Inverter",
  /** `lbl_Generators_DisplayProject_Body_Form_Inverters_CardDetails_NumberOfInverters.Text` — verbatim. */
  numberOfInverters: "Number of Inverters",
  /** `lbl_…_Inverters_CardDetails_CostPerInverter_1.Text` — the base of `$"Total Inverter Type Cost [{iso}]"`. */
  totalInverterTypeCost: "Total Inverter Type Cost",
  /** `lbl_Generators_DisplayProject_Body_Form_Inverters_CardDetails_NominalPower.Text` — verbatim. */
  nominalPower: "Nominal Power [kW]",
  /** `lbl_Generators_DisplayProject_Body_Form_Inverters_CardDetails_Warranty.Text` — verbatim. */
  warranty: "Warranty [y]",
} as const;

/** The substructure card (`gal_Generators_DisplayProject_Body_Form_Substructure`). */
export const SUBSTRUCTURE_CARD_LABELS = {
  /** `lbl_Generators_DisplayProject_Body_Form_Substructure_CardDetails_Supplier.Text` — verbatim. */
  supplier: "Supplier",
  /** `lbl_Generators_DisplayProject_Body_Form_Substructure_CardDetails_SubstructureType.Text` — verbatim. */
  substructureType: "Substructure Type",
  /** `lbl_…_Substructure_CardDetails_SubstructureCost.Text` — the base of `$"Substructure Cost [{iso}]"`. */
  substructureCost: "Substructure Cost",
} as const;

/** The BESS card (`gal_Generators_DisplayProject_Body_Form_Storage_1`). */
export const STORAGE_CARD_LABELS = {
  /** `lbl_Generators_DisplayProject_Body_Form_Storage_CardDetails_StorageCapacity_2.Text` — verbatim. */
  powerCapacity: "Power Capacity [MW]",
  /** `lbl_Generators_DisplayProject_Body_Form_Storage_CardDetails_StorageCapacity_3.Text` — verbatim. */
  energyCapacity: "Energy Capacity [MWh]",
  /** `lbl_Generators_DisplayProject_Body_Form_Storage_CardDetails_StorageSupplier.Text` — verbatim. */
  supplier: "Supplier",
} as const;

/** The hydrogen card (`gal_Generators_DisplayProject_Body_Form_Hydrogen`). */
export const HYDROGEN_CARD_LABELS = {
  /** `lbl_Generators_DisplayProject_Body_Form_Storage_CardDetails_HydrogenCapacity.Text` — verbatim. */
  capacity: "Hydrogen Capacity [MW]",
  /** `lbl_Generators_DisplayProject_Body_Form_Storage_CardDetails_StorageSupplier_1.Text` — verbatim. */
  supplier: "Supplier",
} as const;

/** The substation card (`gal_Generators_DisplayProject_Body_Form_Substation_2`). */
export const SUBSTATION_CARD_LABELS = {
  /** `lbl_Generators_DisplayProject_Body_Form_Storage_CardDetails_SubstationCapacity_1.Text` — verbatim. */
  capacity: "Substation Capacity [MW]",
  /** `lbl_Generators_DisplayProject_Body_Form_Storage_CardDetails_StorageSupplier_2.Text` — verbatim. */
  supplier: "Supplier",
} as const;

/** The panel footer captions shared by every right panel. */
export const PANEL_BUTTONS = {
  /** `pcf_btn_GeneratorData_RightPanel_Form_Generator_Buttons_Save.Text` — verbatim. */
  save: "Save",
  /** `pcf_btn_GeneratorData_RightPanel_Form_Generator_Buttons_Cancel.Text` — verbatim. */
  cancel: "Cancel",
  /** `btn_GeneratorData_RightPanel_Form_Generator_Buttons_Reset.Text` — verbatim. */
  reset: "Reset",
  /** `pcf_btn_GeneratorData_RightPanel_Form_Buttons_Save.Text` — the out-of-country arm, verbatim. */
  requestPermission: "Request permission",
} as const;

/** The Add Generator Type panel (`con_GeneratorData_RightPanel_Form` … `_FormHeader`). */
export const TYPE_PANEL_LABELS = {
  /** `lbl_GeneratorData_RightPanel_FormHeader_FormHeader.Text` — verbatim. */
  title: "Add Generator Type",
  /** `ComboBox@0.0.51` with no `InputTextPlaceholder`: the control's own "Find items". */
  findItems: "Find items",
  /** `lbl_btn_GeneratorData_RightPanel_Form_Filter_Country_Text.Text` — verbatim. */
  countryFilter:
    "Show generator types which are available in my country and latest possible order date is valid",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_TypeSelector.Text` — verbatim. */
  supplier: "Supplier",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_TypeSelector_1.Text` — verbatim. */
  turbineType: "Turbine Type",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_TypeSelector_2.Text` — verbatim. */
  hubHeight: "Hub Height [m]",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_TypeSelector_3.Text` — verbatim. */
  revisedHubHeight: "Revised Hub Height [m]",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_NumberOfGenerator.Text` — verbatim. */
  numberOfGenerators: "Number of Generators",
} as const;

/**
 * `lbl_GeneratorData_RightPanel_Form_Filter_Message.Text` — INTERPOLATED:
 * `If(<toggle>.Checked, $"Generators available for {Country.Name}", $"Generators not available for {Country.Name}")`.
 */
export const typeFilterMessage = (inCountry: boolean, countryName: string | null | undefined): string =>
  inCountry
    ? `Generators available for ${countryName ?? ""}`
    : `Generators not available for ${countryName ?? ""}`;

/**
 * `pcf_btn_GeneratorData_RightPanel_Form_Buttons_Save.Text` —
 * `If(Or(IsBlank(cmb_Supplier.Selected), <toggle>.Checked), "Save", "Request permission")`.
 */
export const typeSaveLabel = (supplier: string | null | undefined, inCountry: boolean): string =>
  isBlank(supplier) || inCountry ? PANEL_BUTTONS.save : PANEL_BUTTONS.requestPermission;

/** The Add/Edit Generator panel (`…_Form_Generator`) — one turbine. */
export const TURBINE_PANEL_LABELS = {
  /** `lbl_GeneratorData_RightPanel_Form_Fields_GeneratorType.Text` — verbatim. */
  generatorType: "Generator Type",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_GeneratorName.Text` — `$"Generator Name"`, verbatim. */
  generatorName: "Generator Name",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Effective_Capacity.Text` — verbatim. */
  effectiveCapacity: "Effective Generator Capacity [MW]",
  /** `chk_GeneratorData_RightPanel_Form_Fields_Effective_Capacity_All.Label` — verbatim. */
  applyAllCapacities: "Apply to all WTG capacities",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Effective_HubHeight_1.Text` — `$"Foundation Plinth [m]"`, verbatim. */
  foundationPlinth: "Foundation Plinth [m]",
  /** `chk_GeneratorData_RightPanel_Form_Fields_Foundation_Plinth_All.Label` — verbatim. */
  applyAllWtgs: "Apply to all WTGs",
  /**
   * `lbl_GeneratorData_RightPanel_Form_Fields_Effective_HubHeight.Text` — the live arm,
   * verbatim (`//$"Effective Hub Height  [m]"` is commented out beside it).
   */
  hubHeightExclPlinth: "Hub Height excl. Foundation Plinth [m]",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Effective_HubHeight_2.Text` — verbatim. */
  totalHeight: "Total Height [m]",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Effective_Capacity_All_WarningMessage.Text` (and its two siblings) — verbatim. */
  applyAllWarning: "Are you sure you want to apply this change to all turbines of the selected WTG type?",
} as const;

/**
 * `lbl_GeneratorData_RightPanel_Form_Generator_FormHeader.Text` — INTERPOLATED:
 * `If(IsBlank(<turbine>.Name), "Add Generator", $"Edit Generator ""{<turbine>.Name}""")`.
 */
export const turbinePanelTitle = (name: string | null | undefined): string =>
  isBlank(name) ? "Add Generator" : `Edit Generator "${name}"`;

/** `locGeneratorNamePrefix` — `$"WTG {gblRecordSelectedProject.'Short Name'}_"`. INTERPOLATED. */
export const turbineNamePrefix = (shortName: string | null | undefined): string =>
  `WTG ${shortName ?? ""}_`;

/** `lbl_GeneratorData_RightPanel_Form_PvModuleType_Fields_OtherSupplier.Text` — verbatim. */
export const PV_OTHER_SUPPLIER_LABEL = "Other Supplier";

/** The Add/Edit Inverter panel (`…_Form_Inverter`). */
export const INVERTER_PANEL_LABELS = {
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Inverter_Fields_Label.Text` — verbatim. */
  label: "Inverter Label",
  /** `lbl_GeneratorData_RightPanel_Form_Inverter_Fields_Supplier.Text` — verbatim. */
  supplier: "Supplier",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Inverter_OtherSupplier_Label.Text` — verbatim, trailing space kept. */
  otherSupplier: "Other Supplier ",
  /** `lbl_GeneratorData_RightPanel_Form_Inverter_Fields_InverterType.Text` — verbatim. */
  inverterType: "Inverter Type",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Inverter_Fields_Warranty.Text` — verbatim. */
  warranty: "Warranty [y]",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Inverter_Fields_NumberOfInverters.Text` — verbatim. */
  numberOfInverters: "Number of Inverters",
  /** `lbl_GeneratorData_RightPanel_Form_Inverter_Fields_NominalPower.Text` — verbatim. */
  nominalPower: "Nominal Power [kW]",
} as const;

/** `lbl_GeneratorData_RightPanel_Form_Inverter_Title.Text` — `If(IsBlank(<entity>.Inverter), "Add Inverter", "Edit Inverter")`. */
export const inverterPanelTitle = (editing: boolean): string => (editing ? "Edit Inverter" : "Add Inverter");

/** The Add/Edit Substructure panel (`…_Form_Substructure`). */
export const SUBSTRUCTURE_PANEL_LABELS = {
  /** `lbl_GeneratorData_RightPanel_Form_Substructure_Fields_Label.Text` — verbatim. */
  label: "Substructure Label",
  /** `lbl_GeneratorData_RightPanel_Form_Substructure_Fields_Supplier.Text` — verbatim. */
  supplier: "Supplier",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Substructure_OtherSupplier_Label.Text` — verbatim, trailing space kept. */
  otherSupplier: "Other Supplier ",
  /** `lbl_GeneratorData_RightPanel_Form_Substructure_Fields_SubstructureType.Text` — verbatim. */
  substructureType: "Substructure Type",
} as const;

/** `lbl_GeneratorData_RightPanel_Form_Substructure_Title.Text` — `If(IsBlank(<entity>.Substructure), "Add Substructure", "Edit Substructure")`. */
export const substructurePanelTitle = (editing: boolean): string =>
  editing ? "Edit Substructure" : "Add Substructure";

/** The Add BESS panel (`…_Form_Storage`). */
export const STORAGE_PANEL_LABELS = {
  /** `lbl_GeneratorData_RightPanel_Form_Storage_Header_Title_2.Text` — verbatim (no Edit arm in the canvas). */
  title: "Add BESS",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Storage_Fields_StorageLabel.Text` — verbatim. */
  label: "BESS label",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Storage_Fields_StorageCapacityMW_5.Text` — verbatim. */
  powerCapacity: "Power Capacity [MW]",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Storage_Fields_StorageCapacityMW_6.Text` — verbatim. */
  energyCapacity: "Energy Capacity [MWh]",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Storage_Fields_StorageSupplier.Text` — verbatim. */
  supplier: "Supplier",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Storage_Fields_StorageType.Text` — verbatim. */
  type: "BESS Type",
} as const;

/** The Add Hydrogen panel (`…_Form_Hydrogen`). */
export const HYDROGEN_PANEL_LABELS = {
  /** `lbl_GeneratorData_RightPanel_Form_Hydrogen_Header_Title_2.Text` — `$"Add Hydrogen"`, verbatim. */
  title: "Add Hydrogen",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Hydrogen_Fields_HydrogenLabel.Text` — verbatim. */
  label: "Hydrogen label",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Hydrogen_Fields_HydrogenCapacityMW_2.Text` — verbatim. */
  capacity: "Hydrogen Capacity [MW]",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Hydrogen_Fields_HydrogenSupplier.Text` — verbatim. */
  supplier: "Supplier",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Hydrogen_Fields_HydrogenType.Text` — verbatim. */
  type: "Hydrogen Type",
} as const;

/** The Add Substation panel (`…_Form_Substation`). */
export const SUBSTATION_PANEL_LABELS = {
  /** `lbl_GeneratorData_RightPanel_Form_Substation_Header_Title_2.Text` — `$"Add Substation"`, verbatim. */
  title: "Add Substation",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Substation_Fields_SubstationLabel.Text` — verbatim. */
  label: "Substation label",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Substation_Fields_SubstationCapacityMW_2.Text` — verbatim. */
  capacity: "Substation Capacity [MW]",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Substation_Fields_SubstationSupplier.Text` — verbatim. */
  supplier: "Supplier",
  /** `lbl_GeneratorData_RightPanel_Form_Fields_Substation_Fields_SubstationType.Text` — verbatim. */
  type: "Substation Type",
} as const;

/** The confirmation popups' constant captions. */
export const DIALOG_LABELS = {
  /** `cmp_GeneratorData_PopUp_ConfirmationDelete*.ConfirmButtonText` — verbatim. */
  delete: "Delete",
  /** `cmp_GeneratorData_PopUp_*.CancelButtonText` — verbatim. */
  cancel: "Cancel",
  /** The height-limitation popups' `ConfirmButtonText` — verbatim. */
  yes: "Yes",
  /** `btn_PopUp_Common_Generators_PreventTotalCapacity_Information_Close.Text` — verbatim. */
  close: "Close",
  /** The three height-limitation popups' `Title` — verbatim. */
  heightExceededTitle: "Height Limitation Exceeded",
  /** `cmp_GeneratorData_PopUp_ConfirmationDeleteGeneratorType.Title` — verbatim. */
  deleteGeneratorType: "Delete Generator Type?",
  /** `…_ConfirmationDeleteGeneratorInProject.Title` — verbatim. */
  deleteGenerator: "Delete Generator?",
  /** `cmp_GeneratorData_PopUp_ConfirmationDeletePVModuleType.Title` — verbatim (sic, no space). */
  deletePvModuleType: "Delete PVModule Type?",
  /** `cmp_GeneratorData_PopUp_ConfirmationDeleteInverterType.Title` — verbatim. */
  deleteInverterType: "Delete Inverter Type?",
  /** `cmp_GeneratorData_PopUp_ConfirmationDeleteSubstructureType.Title` — verbatim. */
  deleteSubstructureType: "Delete Substructure Type?",
  /** `…_ConfirmationDeleteStorageInProject.Title` — verbatim. */
  deleteBess: "Delete BESS?",
  /** `…_ConfirmationDeleteHydrogenInProject.Title` — verbatim. */
  deleteHydrogen: "Delete Hydrogen?",
  /** `…_ConfirmationDeleteSubstationInProject.Title` — verbatim. */
  deleteSubstation: "Delete Substation?",
} as const;

/** The `Description` of each confirmation popup. INTERPOLATED, each from its `Description` formula. */
export const DIALOG_TEXT = {
  deleteGeneratorType: (turbineType: string | null | undefined): string =>
    `Are you sure to delete the WTG type: ${turbineType ?? ""}? All related cost in O&M and Land Lease will be removed.`,
  deleteGenerator: (name: string | null | undefined): string =>
    `Are you sure to delete selected generator: "${name ?? ""}"? All possibly allocated Land Lease cost will be removed.`,
  deletePvModuleType: (label: string | null | undefined): string =>
    `Are you sure that you want to delete selected PV Module type "${label ?? ""}"? All related cost in O&M and Land Lease will be removed`,
  deleteInverterType: (label: string | null | undefined): string =>
    `Are you sure that you want to delete selected inverter type ${label ?? ""}?`,
  deleteSubstructureType: (label: string | null | undefined): string =>
    `Are you sure that you want to delete substructure type ${label ?? ""}?`,
  deleteBess: (name: string | null | undefined): string =>
    `Are you sure to delete selected BESS Type: "${name ?? ""}"? `,
  deleteHydrogen: (name: string | null | undefined): string =>
    `Are you sure to delete selected Hydrogen Type: "${name ?? ""}"? `,
  deleteSubstation: (name: string | null | undefined): string =>
    `Are you sure to delete selected Substation Type: "${name ?? ""}"? `,
  changeStatus: (turbineType: string | null | undefined): string =>
    `Are you sure to change status of the WTG type: ${turbineType ?? ""}?`,
  heightExceeded: (name: string | null | undefined): string =>
    `The total height of Generator Type "${name ?? ""}" is exceeding the height limitation. Are you sure you want to continue?`,
} as const;

/**
 * `cmp_GeneratorData_PopUp_ChangeStatusOfGenerator.Title` / `.ConfirmButtonText` —
 * `If(<type>.Status = 0, "Deactivate WTG?", "Activate WTG?")` and `"Deactivate"` / `"Activate"`.
 */
export const changeStatusDialog = (status: number): { title: string; confirm: string } =>
  status === CHOICE_PLANT.status.active
    ? { title: "Deactivate WTG?", confirm: "Deactivate" }
    : { title: "Activate WTG?", confirm: "Activate" };

/* ═══════════════════════════════════════════ D27 — selection, folding, default row ════ */

/**
 * The ONE selected card. Every card's `RowTransparent.OnSelect` blanks the other six families'
 * `locSelected…` (Y:2925, 3915, 4658, 5317, 5949, 6524, 7100), so at most one entity is selected
 * screen-wide (D27 corrects the code's seven independent selections).
 */
export interface SelectedRow {
  family: PlantFamily;
  id: string;
}

/** `locSelected… : If(locSelected….Id = ThisItem.Id, Blank(), ThisItem)` + blank the others. */
export function toggleSelection(sel: SelectedRow | null, family: PlantFamily, id: string): SelectedRow | null {
  return sel && sel.family === family && sel.id === id ? null : { family, id };
}

/** The selected row of one family, or null. */
export const selectedIn = <T extends { id: string }>(
  sel: SelectedRow | null, family: PlantFamily, rows: readonly T[],
): T | null => (sel && sel.family === family ? rows.find((r) => r.id === sel.id) ?? null : null);

/**
 * `addWTGType.OnSelect` (Y:791) blanks the WTG, inverter, substructure and PV selections — not
 * BESS / Hydrogen / Substation.
 */
export const selectionAfterAddWtg = (sel: SelectedRow | null): SelectedRow | null =>
  sel && (sel.family === "storage" || sel.family === "hydrogen" || sel.family === "substation") ? sel : null;

/**
 * `addPVType.OnSelect` (Y:791) blanks the WTG, turbine, inverter and substructure selections and
 * keeps the PV one (re-looked up).
 */
export const selectionAfterAddPv = (sel: SelectedRow | null): SelectedRow | null =>
  sel && sel.family !== "wtg" && sel.family !== "inverter" && sel.family !== "substructure" ? sel : null;

/**
 * Folding. `OnVisible` adds `IsFolded: true` to every row of every family (Y:63), so every card
 * starts COLLAPSED; the detail fields are visible only while unfolded (`…_Card.Height`, Y:1344).
 * The set holds the EXPANDED ids (D27 corrects the code, which expanded WTG cards by default and
 * never collapsed the others).
 */
export const toggleExpanded = (expanded: ReadonlySet<string>, id: string): Set<string> => {
  const next = new Set(expanded);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
};

/**
 * A non-WTG card's row button selects AND folds: `UpdateContext({locSelected…})` then
 * `UpdateIf(col…, Name = gal.Selected.Name, {IsFolded: Not(IsFolded)})` (e.g. Y:3915). Its two
 * fold icons are `Select(<row button>)`. The WTG row button only selects (Y:2925).
 */
export const rowClickFolds = (family: PlantFamily): boolean => family !== "wtg";

/**
 * The WTG fold icons (`ico_…GeneratorType_Up` / `_Down`, Y:2466/2510) set the selection to the
 * card, then — when the card is folded — `Select(<row button>)`, then toggle the fold. `Select`
 * is QUEUED, so the row button runs last and, finding the card already selected, blanks it:
 * expanding a card deselects it.
 *
 * SOURCE DEFECT (D27): the evident intent is "expand selects". `wtgFoldSelection` keeps the card
 * selected either way; this twin keeps the canvas result reachable (UT-GEN-099).
 */
export const wtgFoldSelection = (_wasFolded: boolean, id: string): SelectedRow => ({ family: "wtg", id });
export const wtgFoldSelectionCanvasParity = (wasFolded: boolean, id: string): SelectedRow | null =>
  wasFolded ? null : { family: "wtg", id };

/**
 * `btn_SetDefaultSeletected_Item.OnSelect` (Y:137), run after deleting a WTG type, a PV type, a
 * BESS, a Hydrogen or a Substation: select the first WTG type, else the first PV type, else the
 * first Hydrogen, else the first BESS, else the first Substation.
 */
export function defaultSelection(lists: {
  wtg: readonly { id: string }[];
  pv: readonly { id: string }[];
  hydrogen: readonly { id: string }[];
  storage: readonly { id: string }[];
  substation: readonly { id: string }[];
}, removedId?: string): SelectedRow | null {
  const order: (keyof typeof lists)[] = ["wtg", "pv", "hydrogen", "storage", "substation"];
  for (const family of order) {
    const first = lists[family].find((r) => r.id !== removedId);
    if (first) return { family, id: first.id };
  }
  return null;
}

/**
 * `con_…GeneratorType_CardDetails_Pagination_Buttons.Visible` (Y:1903) — only when the type has
 * more than one page. `TotalRows` is the type's `'Number of Generators'` in the canvas.
 * DIVERGENCE (F9 / GR-5, D121 §8): the Screen passes the number of LOADED turbines, because the stored count can
 * be out of step with the rows (a save, another user) and then gave a page with no rows or a pager that hid rows.
 */
export const pagerVisible = (numberOfGenerators: number | null | undefined): boolean =>
  pageCount(numberOfGenerators ?? 0) > 1;

/**
 * `addGenerator.ItemEnabled` (Y:1472) — `And(locGeneratorsGridTotalRows < 200, Status = Active)`.
 * DIVERGENCE (D27): the canvas count is ONE screen variable, set only by a turbine delete (and
 * blank, i.e. 0, before that), so every type used the count of whichever type was last touched.
 * Here each type uses its own turbine count.
 */
export const canAddGenerator = (turbineCount: number, status: number): boolean =>
  turbineCount < 200 && status === CHOICE_PLANT.status.active;

/* ═══════════════════════════════════════════════════ D27 — card display values ════ */

/**
 * `txt_…GeneratorType_CardDetails_HubHeight.Value` (Y:1537): for a Dummy supplier the FIRST
 * turbine's `'Hub Height excl. Foundation Plinth [m]'`, else the catalogue `'Hub Height'`, as
 * `If(Int(x) = x, Text(x, "#"), Text(x, "#0.0#"))`.
 */
export function wtgCardHubHeight(
  model: Pick<CatalogModel, "supplier" | "hubHeight"> | null | undefined,
  firstTurbine: Pick<TurbineRow, "hubHeightExclPlinth"> | null | undefined,
  lang: Lang = "en-US",
): string {
  const value = isDummySupplier(model?.supplier) ? firstTurbine?.hubHeightExclPlinth : model?.hubHeight;
  return textIntOr(value, "#0.0#", lang);
}

/** The WTG card's other visible values (Y:1600-1838). */
export function wtgCardValues(args: {
  model: Pick<CatalogModel, "supplier" | "hubHeight" | "rotorDiameter" | "totalHeight"> | null | undefined;
  type: Pick<GeneratorTypeRow, "numberOfGenerators" | "generatorsCapacity">;
  firstTurbine: Pick<TurbineRow, "hubHeightExclPlinth"> | null | undefined;
  planning: ProjectPlanning | null;
  /** The user's language (default en-US): the numbers on the card follow it. */
  lang?: Lang;
}): {
  supplier: string; hubHeight: string; rotorDiameter: string; totalHeight: string;
  heightLimitation: string; numberOfGenerators: string; generatorsCapacity: string;
} {
  return {
    supplier: args.model?.supplier ?? "",
    hubHeight: wtgCardHubHeight(args.model, args.firstTurbine, args.lang),
    rotorDiameter: textIntOr(args.model?.rotorDiameter, "#0.0#", args.lang),
    totalHeight: textIntOr(catalogTotalHeight(args.model), "#0.0#", args.lang),
    // `gblRecordProjectPlanning.'Height limitation [m]'` straight into a number field.
    heightLimitation: args.planning?.heightLimitation === null || args.planning?.heightLimitation === undefined
      ? "" : forLanguage(String(args.planning.heightLimitation), args.lang),
    numberOfGenerators: args.type.numberOfGenerators === null ? "" : String(args.type.numberOfGenerators),
    // `Text(ThisItem.'Generators Capacity', "#.0")`.
    generatorsCapacity: textFormat(args.type.generatorsCapacity, "#.0", args.lang),
  };
}

/**
 * `txt_…PvModule_CardDetails_Supplier.Value` (Y:3097): `If(Not(IsBlank('Other Supplier')),
 * 'Other Supplier', Not(IsBlank(PVModule.Supplier)), PVModule.Supplier, <lookup>.Supplier)`.
 * Inverter / substructure: `If(Not(IsBlank('Other Supplier')), 'Other Supplier', <catalogue>.Supplier)`.
 */
export const cardSupplier = (row: Pick<SimpleTypeRow, "otherSupplier" | "catalogueSupplier" | "supplier">): string =>
  !isBlank(row.otherSupplier) ? String(row.otherSupplier) : row.catalogueSupplier ?? row.supplier ?? "";

/** The PV card (Y:3097-3591): supplier, `Text(cap, "#0.0")`, both degradations `Int ? "#" : "0.0#"`. */
export function pvCardValues(row: SimpleTypeRow, lang: Lang = "en-US"): {
  supplier: string; capacity: string; degradation1stYear: string; degradationRemainingYears: string;
} {
  return {
    supplier: cardSupplier(row),
    capacity: textFormat(row.capacity, "#0.0", lang),
    degradation1stYear: textIntOr(row.degradation1stYear, "0.0#", lang),
    degradationRemainingYears: textIntOr(row.degradationRemainingYears, "0.0#", lang),
  };
}

/**
 * The inverter card (Y:4051-4321): types `Substitute(TrimEnds(Concat(types, Value & " ")), " ", ",")`,
 * supplier, cost per inverter and type cost `"#,###.00"`, count, nominal power `Int ? "#" : "0.0#"`,
 * warranty.
 */
export function inverterCardValues(row: SimpleTypeRow, lang: Lang = "en-US"): {
  inverterType: string; supplier: string; costPerInverter: string; numberOfInverters: string;
  typeCost: string; nominalPower: string; warranty: string;
} {
  return {
    inverterType: (row.typeLabels ?? []).join(" ").trim().replace(/ /g, ","),
    supplier: cardSupplier(row),
    costPerInverter: textFormat(row.costPerInverter, "#,###.00", lang),
    numberOfInverters: row.numberOfInverters === null || row.numberOfInverters === undefined ? "" : String(row.numberOfInverters),
    typeCost: textFormat(row.cost, "#,###.00", lang),
    nominalPower: textIntOr(row.nominalPower, "0.0#", lang),
    warranty: row.warranty === null || row.warranty === undefined ? "" : String(row.warranty),
  };
}

/** `lbl_…Substructure_CardDetails_SubstructureCost_ErrorMessage.Text` (Y:4935) — verbatim. */
export const SUBSTRUCTURE_COST_NOTE = "* Please add Module Type in order to calculate cost.";
/** `info_…Substructure_CardDetails_SubstructureCost.Content` (Y:4967) — verbatim. */
export const SUBSTRUCTURE_COST_INFO = "Please add Module Type in order to calculate cost.";

/** `Or(IsBlank('Plant PV Capacity [MWp]'), 'Plant PV Capacity [MWp]' = 0)` (Y:4934). */
export const substructureCostNoteVisible = (plantPvCapacity: number | null | undefined): boolean =>
  plantPvCapacity === null || plantPvCapacity === undefined || plantPvCapacity === 0;

/** The substructure card (Y:4809-4949). */
export function substructureCardValues(row: SimpleTypeRow, lang: Lang = "en-US"): { supplier: string; types: string; cost: string } {
  return {
    supplier: cardSupplier(row),
    types: (row.typeLabels ?? []).join(" ").trim().replace(/ /g, ","),
    cost: textFormat(row.cost, "#,##0.00", lang),
  };
}

/** BESS `"#,##0.00"` ×2 (Y:5493/5550); Hydrogen and Substation `"#,##0.0"` (Y:6127/6703). */
export function simpleCardValues(family: "storage" | "hydrogen" | "substation", row: SimpleTypeRow, lang: Lang = "en-US"): string[] {
  if (family === "storage") {
    return [textFormat(row.capacity, "#,##0.00", lang), textFormat(row.energyCapacity, "#,##0.00", lang), row.supplier ?? ""];
  }
  return [textFormat(row.capacity, "#,##0.0", lang), row.supplier ?? ""];
}

/**
 * `cmp_PopUp_Confirmation_WTGTypeHeightLimitation.Description` (Y:16646) trims the display name:
 * `With({input: DisplayName}, Left(input, Len(input) - 2))`.
 */
export const heightPopupTypeName = (displayName: string | null | undefined): string => {
  const s = displayName ?? "";
  return s.slice(0, Math.max(0, s.length - 2));
};

/**
 * The permission-request Cancel button on a WTG / inverter / substructure card (Y:2701/4515/5174):
 * `And(Not(IsBlank(FlowRunId)), Not(IsBlank(FlowApprovalId)), State <> PermissionApproved)`.
 * On a PV card (Y:3847): `State = 'Request Pending'`. BESS / Hydrogen / Substation: none.
 */
export function cancelRequestVisible(
  family: PlantFamily,
  row: Pick<SimpleTypeRow, "flowRunId" | "flowApprovalId" | "requestPermissionState">,
): boolean {
  if (family === "pv") return row.requestPermissionState === CHOICE_PLANT.requestPermissionState.pending;
  if (family === "wtg" || family === "inverter" || family === "substructure") {
    return !isBlank(row.flowRunId) && !isBlank(row.flowApprovalId)
      && row.requestPermissionState !== CHOICE_PLANT.requestPermissionState.approved;
  }
  return false;
}

/** The permission chip is shown for WTG / PV / inverter / substructure only (BESS / H2 / Sub hide it). */
export const showsPermissionChip = (family: PlantFamily): boolean =>
  family === "wtg" || family === "pv" || family === "inverter" || family === "substructure";

/* ═══════════════════════════════════════════════════ D27 — the turbine panel form ════ */

/** `Value(Last(Split(Name, "_")).Value)` over every turbine of the project, `Max(…) + 1` (Y:1475). */
export function nextTurbineIndex(projectTurbines: readonly Pick<TurbineRow, "index">[]): number {
  const finite = projectTurbines.map((t) => t.index).filter((n) => Number.isFinite(n));
  return (finite.length === 0 ? 0 : Math.max(...finite)) + 1;
}

/**
 * `locGeneratorNamePrefix`: a new turbine `$"WTG {'Short Name'}_"` (Y:1475); an edited one keeps its
 * own `First(Split(Name, "_")) & "_"` (Y:2215-2234). The SAVE always writes the short-name prefix.
 */
export const turbinePanelPrefix = (
  turbine: Pick<TurbineRow, "name"> | null, shortName: string | null | undefined,
): string => (turbine?.name ? `${turbine.name.split("_")[0] ?? ""}_` : turbineNamePrefix(shortName));

/**
 * The turbine panel's opening values (Y:10677-11285): name = own index, else the project-wide next
 * index (dirty, as the canvas `NameNextIndex` row); effective capacity = own, else the catalogue
 * `'Specific Capacity'` as `"#0.0#"`; hub height = own, else the catalogue `'Hub Height'` as `"#0.00"`;
 * plinth = `Coalesce(own, 0)`. (D27 corrects the blank new-turbine form.)
 */
export function turbineFormDefaults(args: {
  turbine: TurbineRow | null;
  model: Pick<CatalogModel, "specificCapacity" | "hubHeight"> | null;
  nextIndex: number;
  /** The user's language (default en-US): the boxes open in its decimal separator, which the validators then expect. */
  lang?: Lang;
}): TurbineFormState {
  const t = args.turbine;
  const lang = args.lang ?? "en-US";
  return {
    nameIndex: t ? (Number.isFinite(t.index) ? String(t.index) : "") : String(args.nextIndex),
    effectiveCapacity: t?.effectiveCapacity !== null && t?.effectiveCapacity !== undefined
      ? textFormat(t.effectiveCapacity, "#0.0#", lang) : textFormat(args.model?.specificCapacity, "#0.0#", lang),
    effectiveHubHeight: t?.hubHeightExclPlinth !== null && t?.hubHeightExclPlinth !== undefined
      ? textFormat(t.hubHeightExclPlinth, "#0.00", lang) : textFormat(args.model?.hubHeight, "#0.00", lang),
    foundationPlinth: forLanguage(String(t?.foundationPlinth ?? 0), lang),
    dirty: t ? new Set<string>() : new Set<string>(["nameIndex"]),
  };
}

/**
 * F9 / GL-3: the read-only Total Height box. The sum of typed heights carries binary float noise in JS
 * (140.2 + 2.2 + 0.5 x 141.2 is 212.99999999999997 where Power Fx shows 213), so the value is rounded to 10 places,
 * which removes the noise and no real digit.
 */
export const fmtTurbineTotalHeightBox = (v: number | null | undefined, lang: Lang = "en-US"): string =>
  v === null || v === undefined || !Number.isFinite(v) ? "" : forLanguage(String(pfxRound(v, 10)), lang);

/**
 * `txt_…Fields_Total_Height.Value` (Y:11473): while any row is dirty, hub height + plinth + ½ rotor
 * from the inputs; otherwise the stored `'Total Height'`.
 */
export function turbinePanelTotalHeight(args: {
  form: TurbineFormState;
  storedTotalHeight: number | null | undefined;
  rotorDiameter: number | null | undefined;
  /** The user's language. Required: hub height and plinth are typed in it. */
  lang: Lang;
}): number | null {
  if (args.form.dirty.size === 0) return args.storedTotalHeight ?? null;
  const { lang } = args;
  return editedTotalHeight({
    hubHeight: numericOr(args.form.effectiveHubHeight, 0, lang),
    foundationPlinth: numericOr(args.form.foundationPlinth, 0, lang),
    rotorDiameter: args.rotorDiameter,
  });
}

/* ═══════════════════════════════════════ D27 — BESS / Hydrogen / Substation panels ════ */

export type SimpleCapacityFamily = "storage" | "hydrogen" | "substation";

export interface SimpleFormState {
  label: string;
  capacity: string;
  /** BESS only — `'Energy Capacity [MWh]'`. */
  energyCapacity: string;
  supplier: string;
  dirty: Set<string>;
}

export interface SimpleFormErrors {
  label: string | null;
  capacity: string | null;
  energyCapacity: string | null;
  supplier: string | null;
}

/** The three panels' verbatim messages (Y:11837-13567). */
export const SIMPLE_MSG = {
  /** `lbl_…StorageLabel_ErrorMessage.Text` / `…HydrogenLabel…` / `…SubstationLabel…` and the supplier labels — verbatim (no period). */
  blank: "Value cannot be blank",
  twoDecimals: "Numeric value with maximum of two decimals",
  /** `lbl_…HydrogenCapacityMW_ErrorMessage_2.Text` (Y:12743) / Substation — verbatim (sic). */
  oneDecimal: "Numeric value with maximum of one decimals",
  range1000: "Please select a value between 0 and 1000.",
  range10000: "Please select a value between 0 and 10000.",
} as const;

/** `MaxLength` of the capacity inputs: BESS 8 / 8, Hydrogen 6, Substation 6 (Y:11957/12054/12778/13499). */
export const SIMPLE_CAPACITY_MAX_LENGTH: Record<SimpleCapacityFamily, number> = {
  storage: 8, hydrogen: 6, substation: 6,
};

function capacityError(value: string, places: 1 | 2, max: number, lang: Lang): string | null {
  const v = value.trim();
  if (isBlank(v)) return null;
  if (!isDecimalWithPlaces(v, places, lang)) return places === 1 ? SIMPLE_MSG.oneDecimal : SIMPLE_MSG.twoDecimals;
  if (!inRange(v, 0, max, lang)) return max === 10000 ? SIMPLE_MSG.range10000 : SIMPLE_MSG.range1000;
  return null;
}

/**
 * The visible error labels: the label / supplier once touched and blank; a capacity whenever it
 * holds a bad non-blank value — BESS power two decimals 0…1000, BESS energy two decimals 0…10000,
 * Hydrogen and Substation one decimal 0…1000.
 */
export function validateSimpleForm(
  family: SimpleCapacityFamily, form: SimpleFormState, lang: Lang = "en-US",
): SimpleFormErrors {
  const places: 1 | 2 = family === "storage" ? 2 : 1;
  return {
    label: form.dirty.has("label") && isBlank(form.label.trim())
      ? SIMPLE_MSG.blank
      : form.label.length > SIMPLE_TEXT_MAX_LENGTH ? textTooLongMessage(SIMPLE_TEXT_MAX_LENGTH) : null,
    capacity: capacityError(form.capacity, places, 1000, lang),
    energyCapacity: family === "storage" ? capacityError(form.energyCapacity, 2, 10000, lang) : null,
    supplier: form.dirty.has("supplier") && isBlank(form.supplier.trim())
      ? SIMPLE_MSG.blank
      : form.supplier.length > SIMPLE_TEXT_MAX_LENGTH ? textTooLongMessage(SIMPLE_TEXT_MAX_LENGTH) : null,
  };
}

/**
 * `pcf_btn_…_{Storage,Hydrogen,Substation}_Buttons_Save_2.DisplayMode` (Y:12287): at least one dirty
 * row and no invalid row, each row valid when its value is non-blank and its error label hidden
 * (the hidden Type rows are commented out of the table, Y:791). D27 adds this gate; the code had none.
 */
export function canSaveSimple(family: SimpleCapacityFamily, form: SimpleFormState, lang: Lang = "en-US"): boolean {
  if (form.dirty.size === 0) return false;
  const e = validateSimpleForm(family, form, lang);
  if (Object.values(e).some((x) => x !== null)) return false;
  if (isBlank(form.label.trim()) || isBlank(form.capacity.trim()) || isBlank(form.supplier.trim())) return false;
  return family !== "storage" || !isBlank(form.energyCapacity.trim());
}

/**
 * The panel opens bound to the SELECTED row (`addStorage` / `addHydrogen` / `addSubstation` do not
 * blank the selection, Y:791; the fields' `Value` is the row's, Y:11871…): `Text(Name)`, capacity
 * `"#0.00"` (BESS) — D27 DIVERGENCE: Hydrogen / Substation prefill `"#0.0"`, not the canvas
 * `"#,##0.0"`, whose thousands separator its own one-decimal check rejects.
 */
export function simpleFormDefaults(family: SimpleCapacityFamily, row: SimpleTypeRow | null, lang: Lang = "en-US"): SimpleFormState {
  return {
    label: row?.name ?? "",
    capacity: textFormat(row?.capacity, family === "storage" ? "#0.00" : "#0.0", lang),
    energyCapacity: family === "storage" ? textFormat(row?.energyCapacity, "#0.00", lang) : "",
    supplier: row?.supplier ?? "",
    dirty: new Set<string>(),
  };
}

/* ═══════════════════════════════════════════════════════════ D27 — write plans ════ */

/**
 * The write form of the owner — lower-case `owningbusinessunit` (CONVENTIONS rule 4), from the shared key and bind of
 * `data/odata.ts` (rule 17). Not `owningBusinessUnitBind`: that one validates the id as a GUID, and this folder's tests
 * use ids such as "bu-1"; the output is the same for a real id.
 */
const owner = (businessUnitId: string | null | undefined): Record<string, unknown> =>
  businessUnitId ? { [OWNING_BU_BIND]: bind("businessunits", businessUnitId) } : {};

/**
 * NEW TEXT (generators fix F6, D121 §5): a create without the owning business unit never errors, the row just
 * becomes invisible to a business-unit-scoped colleague (CONVENTIONS rule 4). The canvas patched the project's own unit and had
 * no such refusal.
 */
export const OWNING_BU_MSG = {
  missing:
    "This project has no business unit, so nothing was saved: a new row without one would be invisible to other users. Ask an administrator to set the project's business unit.",
} as const;

/**
 * F6 — a plan that CREATES rows is refused, with nothing sent, when the project's owning business unit is blank. A plan with
 * no create (an edit, a delete, a roll-up) passes as it was. DIVERGENCE (D121 §5): before, the create went out
 * without the bind.
 */
export function requireOwningBusinessUnit<T extends WritePlan>(plan: T, businessUnitId: string | null | undefined): T {
  if (plan.refusedReason !== undefined || (businessUnitId ?? "").trim() !== "") return plan;
  // A refusal keeps the plan's extra fields (a follow-up's `unmatchedCount`) and drops its writes.
  return plan.writes.some((w) => w.op === "create" || w.op === "createMany")
    ? { ...plan, ...refusePlan(OWNING_BU_MSG.missing) }
    : plan;
}
const ref = (entitySet: string, id: string): string => `/${entitySet}(${id})`;

/** Navigation properties of the binds the screen writes (`customizations.xml` relationships). */
export const PLANT_BIND = {
  project: "vsb_Project@odata.bind",
  generator: "vsb_Generator@odata.bind",
  /** `vsb_ModuleTypeInProjectId` is polymorphic: one navigation property per target table. */
  moduleTypeWtg: "vsb_ModuleTypeInProjectId_vsb_generatortypeinproject@odata.bind",
  moduleTypePv: "vsb_ModuleTypeInProjectId_vsb_pvmoduletypeinproject@odata.bind",
  deviceTypeWtg: "vsb_TypeInProjectId_vsb_generatortypeinproject@odata.bind",
  deviceTypePv: "vsb_TypeInProjectId_vsb_pvmoduletypeinproject@odata.bind",
  projectCost: "vsb_ProjectCost@odata.bind",
  generatorInProject: "vsb_GeneratorInProject@odata.bind",
  /** `InverterTypeInProjects.Inverter` / `SubstructureTypeInProjects.Substructure` — the catalogue rows (G9). */
  inverter: "vsb_Inverter@odata.bind",
  substructure: "vsb_Substructure@odata.bind",
  /** `'Opex Project Costs'.DeviceTypeInProject` — the O&M bridge a replace re-links (G6). */
  deviceTypeInProject: "vsb_DeviceTypeInProject@odata.bind",
} as const;

/** The project fields a plan needs. */
export type PlanProject = Pick<GeneratorsProject, "id" | "shortName" | "owningBusinessUnitId">;

const upd = (entitySet: string, id: string, data: Record<string, unknown>, reason: string): PlannedWrite =>
  ({ op: "update", entitySet, id, data, reason });
const ins = (entitySet: string, data: Record<string, unknown>, reason: string): PlannedWrite =>
  ({ op: "create", entitySet, data, reason });
/**
 * Every Generators delete is a HARDENED delete (delete hardening plan DEL-2, `hardenedDelete` in `data/writePlan.ts`): the
 * engine retries it a bounded number of times and only counts 404 / `0x80040217` as "already gone". `confirm` marks the
 * deletes of rows whose survival would matter most (types, land-lease costs, units): read back when
 * `GENERATORS_DELETE.verifyDeletes` is on. `serialKey` orders deletes that share a parent row (DEL-4).
 */
const del = (entitySet: string, id: string, reason: string, o: { confirm?: boolean; serialKey?: string } = {}): PlannedWrite =>
  hardenedDelete(entitySet, id, reason, o);

/*
 * Tiered deletes (Generators bulk programme, plan §9.4, work package R2 phase 1B; flag `GENERATORS_DELETE.tieredDeletes`
 * since the delete hardening plan DEL-1: ON, the default, is the tiers below; OFF is ONE plain `together()` group at the
 * default limit, the shape before the tiers).
 * Each call is its own `together()` group (`data/writePlan.ts`), so groups never overlap: one finishes before the
 * next starts, children before parents, the project roll-up last.
 *  - LEAF (16 in flight, `LEAF_DELETE_CONCURRENCY`): rows nothing hangs off: land-lease allocations, O&M costs, units,
 *    device-type bridge rows, turbines deleted one by one.
 *  - CASCADE (4 in flight, `CASCADE_DELETE_CONCURRENCY`): land-lease costs and types, whose cascade locks and updates
 *    child rows (D51: 6-11 s per request when cascades overlapped).
 * Starting values; the timed DEV test (plan §9.4) sets the final numbers.
 */
const leafDeletes = (writes: PlannedWrite[], opts?: PlanBulkOptions): PlannedWrite[] =>
  deleteFlagOn(opts, "tieredDeletes") ? together(writes, { limit: LEAF_DELETE_CONCURRENCY }) : together(writes);
const cascadeDeletes = (writes: PlannedWrite[], opts?: PlanBulkOptions): PlannedWrite[] =>
  deleteFlagOn(opts, "tieredDeletes") ? together(writes, { limit: CASCADE_DELETE_CONCURRENCY }) : together(writes);
/**
 * Delete steps that were plain one-by-one steps before 1B (bridge rows, units, types): a tier only matters for two or
 * more requests, so a single delete stays the plain sequential step it always was (the plan shape the screen pins).
 */
const leafDeletesIfMany = (writes: PlannedWrite[], opts?: PlanBulkOptions): PlannedWrite[] =>
  (writes.length > 1 ? leafDeletes(writes, opts) : writes);
const cascadeDeletesIfMany = (writes: PlannedWrite[], opts?: PlanBulkOptions): PlannedWrite[] =>
  (writes.length > 1 ? cascadeDeletes(writes, opts) : writes);

/**
 * The land-lease clean-up steps of a turbine / type delete, as plan writes: the leaf rows and the cascading costs apart.
 * DEL-4 (flag `parentOrder`): with it on, an allocation delete carries `serialKey = <its land-lease cost id>` (looked up in
 * `costOf`, allocation id -> cost id), so two deletes on one cost never run together; off, no key. The cost delete confirms.
 */
function landLeaseCleanupWrites(
  steps: readonly TurbineDeletionStep[], reasons: { allocation: string; cost: string },
  costOf: ReadonlyMap<string, string>, opts?: PlanBulkOptions,
): { allocations: PlannedWrite[]; costs: PlannedWrite[] } {
  const allocations: PlannedWrite[] = [];
  const costs: PlannedWrite[] = [];
  for (const step of steps) {
    if (step.kind === "removeAllocation") allocations.push(allocationDelete(step.allocationId, reasons.allocation, costOf, opts));
    else costs.push(del(ES_PLANT.landLeaseProjectCosts, step.costId, reasons.cost, { confirm: true }));
  }
  return { allocations, costs };
}

/** One land-lease allocation delete; with `parentOrder` on and its cost known it carries `serialKey = <cost id>` (DEL-4). */
const allocationDelete = (id: string, reason: string, costOf: ReadonlyMap<string, string>, opts: PlanBulkOptions | undefined): PlannedWrite => {
  const cost = deleteFlagOn(opts, "parentOrder") ? costOf.get(id) : undefined;
  return del(ES.landLeaseAllocationWtgs, id, reason, cost ? { serialKey: cost } : {});
};

/** Allocation id -> its land-lease cost id, for the `serialKey` of an allocation delete. */
const costByAllocation = (allocations: readonly { id: string; costId?: string }[]): Map<string, string> =>
  new Map(allocations.flatMap((a) => (a.costId ? [[a.id, a.costId] as const] : [])));

/**
 * Optional last parameter of the plan builders that have a bulk path (Generators bulk programme, work package R2).
 * A bulk path is used ONLY when its flag is on: `(opts.bulk.X ?? GENERATORS_BULK.X) === true`, so no caller has to
 * change (a screen passes nothing, a test passes `{ bulk: { allocations: true }, newId }`). With every flag off (the
 * default) a plan is EXACTLY today's plan. Row ids come from `opts.newId`, else `newRowId`: the single sanctioned
 * impure default of `rules.ts` (`data/newRowId.ts`).
 */
export interface PlanBulkOptions {
  /** Per-flag overrides of `GENERATORS_BULK` (same keys; `true` allowed, which the `as const` defaults cannot say). */
  bulk?: { [K in keyof typeof GENERATORS_BULK]?: boolean };
  /**
   * Per-flag overrides of `GENERATORS_DELETE` (delete hardening plan): `tieredDeletes` (DEL-1), `parentOrder` (DEL-4),
   * `guardedUpdates` (DEL-7a). A flag is read as `opts.delete?.X ?? GENERATORS_DELETE.X`. `verifyDeletes` is an engine
   * flag (`ExecutePlanOptions.deleteFlags`); the plans do not read it.
   */
  delete?: DeleteFlagOverrides;
  /**
   * Per-switch overrides of `GENERATORS_PERF` for the save-latency switches (D144): `relaneWrites`, `replaceLanes`,
   * `wideGroups`. A switch is read as `opts.perf?.X ?? generatorsPerf().X`; the golden-master tests build the same plan
   * with all three off (today's plan) and on.
   */
  perf?: Partial<Pick<GeneratorsPerfFlags, "relaneWrites" | "replaceLanes" | "wideGroups">>;
  /** Source of the pre-generated row ids of bulk creates. Tests inject a counter. */
  newId?: () => string;
}

/** D144: a save-latency switch (`opts.perf` first, else the shipped / test-installed `GENERATORS_PERF`). */
const perfOn = (opts: PlanBulkOptions | undefined, flag: "relaneWrites" | "replaceLanes" | "wideGroups"): boolean =>
  (opts?.perf?.[flag] ?? generatorsPerf()[flag]) === true;

/**
 * One parallel group of the Generators plans at its DEFAULT limit: 8 (`WRITE_CONCURRENCY`) with `wideGroups` off, 16
 * (`WIDE_GROUP_CONCURRENCY`) with it on (D144). The delete tiers (`leafDeletes`, `cascadeDeletes`) keep their own limits.
 */
const group = (writes: readonly PlannedWrite[], opts?: PlanBulkOptions): PlannedWrite[] =>
  (perfOn(opts, "wideGroups") ? together(writes, { limit: WIDE_GROUP_CONCURRENCY }) : together(writes));

/** One WAVE (D144): nothing is a plain step, one write stays a plain step, two or more are ONE parallel group. */
const wave = (writes: readonly PlannedWrite[], opts?: PlanBulkOptions): PlannedWrite[] =>
  (writes.length > 1 ? group(writes, opts) : [...writes]);

const bulkOn =(opts: PlanBulkOptions | undefined, flag: keyof typeof GENERATORS_BULK): boolean =>
  (opts?.bulk?.[flag] ?? GENERATORS_BULK[flag]) === true;
function deleteFlagOn(opts: PlanBulkOptions | undefined, flag: keyof GeneratorsDeleteFlags): boolean {
  return (opts?.delete?.[flag] ?? GENERATORS_DELETE[flag]) === true;
}
/** DEL-7(a): the write as a guarded update when `guardedUpdates` is on (never re-creates a row another user deleted), else as is. */
const guardedIf = (w: PlannedWrite, opts: PlanBulkOptions | undefined): PlannedWrite =>
  (deleteFlagOn(opts, "guardedUpdates") ? { ...w, guarded: true } : w);
/** Bulk update rows without a repeated id (the first wins): `UpdateMultiple` refuses a duplicate (plan §3 phase 3, item 5). */
const uniqueRows = (rows: readonly BulkRow[]): BulkRow[] => {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
};
const rowIdSource = (opts: PlanBulkOptions | undefined): (() => string) => opts?.newId ?? newRowId;

/*
 * Save performance (6 Nov 2026): `together` (`data/writePlan.ts`) marks writes that depend on nothing but
 * rows created BEFORE them (a type's turbines, the roll-up, the land-lease allocations, the apply-to-all
 * patches) so `executePlan` sends them 8 at a time. No server automation orders these rows: the only
 * project-level trigger (`LoadDevexCapexCostTotalCapacityTrigger`) fires on the roll-up alone.
 */

/** `Patch(Projects, …, {'Plant WTG Capacity [MW]', 'Plant WTG Cost [EUR]'})` over the eligible types (rule 14). */
export function projectWtgRollup(
  projectId: string,
  types: Pick<GeneratorTypeRow, "requestPermissionState" | "status" | "generatorsCapacity" | "generatorsCost">[],
): PlannedWrite {
  const t = plantWtgTotals(types);
  return upd(ES.projects, projectId, {
    [PROJECT_PLANT_COL.plantWtgCapacity]: t.capacityMW,
    [PROJECT_PLANT_COL.plantWtgCost]: t.costEUR,
  }, "the project's Plant WTG Capacity / Cost");
}

/** The new / edited turbine rows the AllWTG land-lease costs are allocated to (`btn_Trigger_New_AllocateWTGs_To_Land_Lease`). */
function allocationCreates(args: {
  costs: LandLeaseCostRow[];
  turbines: { id: string; name: string | null }[];
  owningBusinessUnitId: string | null | undefined;
}): PlannedWrite[] {
  return planTurbineAllocation({ costs: args.costs, turbines: args.turbines }).map((a) =>
    ins(ES.landLeaseAllocationWtgs, {
      vsb_name: a.name,
      [PLANT_BIND.projectCost]: ref(ES_PLANT.landLeaseProjectCosts, a.costId),
      [PLANT_BIND.generatorInProject]: ref(ES_PLANT.generatorInProjects, a.generatorInProjectId),
      ...owner(args.owningBusinessUnitId),
    }, `allocate land-lease cost to ${a.name}`));
}

/**
 * The land-lease allocation rows as ONE bulk create (plan §3 phase 2, flag `GENERATORS_BULK.allocations`): the same rows
 * `allocationCreates` makes one by one, in the same order (cost-major, then turbine), each with a pre-generated id
 * (`newId`, plan §2.5) and the same data, owning-business-unit bind included (CONVENTIONS rule 4; the backend fails
 * closed without it). A turbine id may be a `createdRowRef` placeholder; the engine resolves it per row.
 */
function allocationRows(args: Parameters<typeof allocationCreates>[0], newId: () => string): BulkRow[] {
  return planTurbineAllocation({ costs: args.costs, turbines: args.turbines }).map((a) => ({
    id: newId(),
    data: {
      vsb_name: a.name,
      [PLANT_BIND.projectCost]: ref(ES_PLANT.landLeaseProjectCosts, a.costId),
      [PLANT_BIND.generatorInProject]: ref(ES_PLANT.generatorInProjects, a.generatorInProjectId),
      ...owner(args.owningBusinessUnitId),
    },
  }));
}

/**
 * The allocation creates of a plan, as plan steps.
 *  - flag off: today's single creates, as ONE `together()` group (default limit);
 *  - flag on:  ONE `createMany` step (no step at all when there is nothing to allocate), never inside a group.
 * DIVERGENCE: plan §3 phase 2 / §9.7: N x L single creates become one bulk request; a chunk lands whole or not at all
 * (plan §2.4). The off path is today's plan, kept as the rollback (CONVENTIONS rule 15).
 */
function allocationStep(args: Parameters<typeof allocationCreates>[0], opts: PlanBulkOptions | undefined): PlannedWrite[] {
  if (!bulkOn(opts, "allocations")) return group(allocationCreates(args), opts);
  const rows = allocationRows(args, rowIdSource(opts));
  return rows.length > 0 ? [createMany(ES.landLeaseAllocationWtgs, rows, "the land-lease allocations of the new turbines")] : [];
}

/**
 * The WTG type save, first job (`pcf_btn_GeneratorData_RightPanel_Form_Buttons_Save.OnChange`, Y:15214):
 *  1. `Patch(GeneratorTypeInProjects, Defaults, {Project, Generator, 'Number of Generators',
 *     'Cost per WTG' = Value(Text(locGeneratorCostsPerWtg, "#0.00")), 'Generators Cost' = n × cost,
 *     'Generators Capacity' = n × 'Specific Capacity', OBU})` — D27 adds the 2-decimal rounding;
 *  2. N × `Patch(GeneratorInProjects, Defaults, {Name "WTG <Short>_<max + i>" (max over the whole
 *     project), ModuleTypeInProject, 'Effective Capacity' = 'Specific Capacity', OBU, 'Total Height',
 *     'Hub Height excl. Foundation Plinth [m]'})`;
 *  3. in country: the project roll-up over the eligible types, the new one included. Out of country
 *     (`Not(tgl_…_Filter_Country.Checked)`, Y:15214 / Y:16514): no roll-up — the screen runs
 *     `RequestModulePermission` for the new type instead (D97), and the flow rolls the type up itself
 *     once it is approved ("For requested generators SUM will be calculated in flow").
 * The queued `Select`s (the `DeviceTypesInProjects` shadow, the AllWTG allocations) are the second
 * job, `planGeneratorTypeFollowUp`: they need the type's autonumber name and the new turbine ids. The
 * canvas runs them on both paths.
 */
function planCreateGeneratorTypeUnchecked(args: {
  project: PlanProject;
  inCountry: boolean;
  model: Pick<CatalogModel, "id" | "specificCapacity" | "hubHeight" | "rotorDiameter">;
  numberOfGenerators: number;
  /** `locGeneratorCostsPerWtg`, unrounded. */
  costPerWtg: number;
  /** `cmb_Supplier_2.Selected.Height` (0 = use the typed revised height). */
  selectedHeight: number;
  revisedHubHeight: number | null;
  existingTypes: GeneratorTypeRow[];
  projectTurbines: Pick<TurbineRow, "index">[];
  /**
   * D144 (`relaneWrites`; Replace passes `replaceLanes`): true = the in-country roll-up is NOT appended to the plan but handed
   * back as `deferredRollup`, for the follow-up plan to write in its one wave (`planGeneratorTypeFollowUp({ rollup })`). The
   * write is the same one; only the wave it is sent in changes. Unset = the switch of `opts`.
   */
  deferRollup?: boolean;
}, opts?: PlanBulkOptions): CreateTypePlan {
  const n = args.numberOfGenerators;
  const cost = pfxRound(args.costPerWtg, 2);
  const totals = generatorTypeTotals({ count: n, costPerWtg: cost, specificCapacity: args.model.specificCapacity });
  const heights = newTurbineHeights({
    selectedHeight: args.selectedHeight, typedHubHeight: args.revisedHubHeight,
    catalogHubHeight: args.model.hubHeight, rotorDiameter: args.model.rotorDiameter,
  });
  const names = buildTurbineNames({ shortName: args.project.shortName, existing: args.projectTurbines, count: n });
  /** One turbine row's data: the same for a single create and for a bulk row (the bind resolves to the type created first). */
  const turbineData = (name: string): Record<string, unknown> => ({
    [GEN_INSTANCE_COL.name]: name,
    [PLANT_BIND.moduleTypeWtg]: ref(ES_PLANT.generatorTypeInProjects, createdRowRef(0)),
    [GEN_INSTANCE_COL.effectiveCapacity]: args.model.specificCapacity ?? null,
    ...owner(args.project.owningBusinessUnitId),
    [GEN_INSTANCE_COL.totalHeight]: heights.totalHeight,
    [GEN_INSTANCE_COL.hubHeightExclPlinth]: heights.hubHeightExclPlinth,
  });
  const typeCreate = ins(ES_PLANT.generatorTypeInProjects, {
    [PLANT_BIND.project]: ref(ES.projects, args.project.id),
    [PLANT_BIND.generator]: ref(ES_PLANT.generators, args.model.id),
    [GEN_TYPE_COL.numberOfGenerators]: n,
    [GEN_TYPE_COL.costPerWtg]: cost,
    [GEN_TYPE_COL.generatorsCost]: totals.generatorsCost,
    [GEN_TYPE_COL.generatorsCapacity]: totals.generatorsCapacity,
    ...owner(args.project.owningBusinessUnitId),
  }, "the generator type");
  // The type is ALWAYS created first, as a single request (its autonumber name comes back in the response and feeds the
  // device-type row, plan §2.5); every turbine binds to it via `createdRowRef(0)`.
  let turbines: PlannedWrite[];
  if (bulkOn(opts, "turbines")) {
    // DIVERGENCE (plan §3 phase 4; flag `turbines`): the N turbines are ONE `createMany` with pre-generated ids instead of
    // N single creates in a parallel run. The engine returns `createdIds` in row order, so the screen's contract is
    // unchanged: [the type, then the turbines in `names` order]. No step at all for 0 turbines; never inside a group.
    const newId = rowIdSource(opts);
    const rows: BulkRow[] = names.map((name) => ({ id: newId(), data: turbineData(name) }));
    turbines = rows.length > 0 ? [createMany(ES_PLANT.generatorInProjects, rows, "the new generator type's turbines")] : [];
  } else {
    // Today: the turbines go together; the roll-up last.
    turbines = group(names.map((name) => ins(ES_PLANT.generatorInProjects, turbineData(name), `turbine ${name}`)), opts);
  }
  const writes: PlannedWrite[] = [typeCreate, ...turbines];
  if (requiresPermissionRequest(args.inCountry)) return { writes, log: [`Generator type with ${n} turbines`] };
  // After every turbine, as in the canvas: `LoadDevexCapexCostTotalCapacityTrigger` fires on these project
  // columns, and a failed turbine stops the plan before the project totals change.
  const rollup = projectWtgRollup(args.project.id, [
    ...args.existingTypes,
    { requestPermissionState: null, status: CHOICE_PLANT.status.active,
      generatorsCapacity: totals.generatorsCapacity, generatorsCost: totals.generatorsCost },
  ]);
  // D144: with the switch on the roll-up is sent in the follow-up plan's wave (beside the device-type row and the
  // allocations), still AFTER every turbine and exactly once; the plan hands it back instead of ending with it.
  if (args.deferRollup ?? perfOn(opts, "relaneWrites")) {
    return { writes, log: [`Generator type with ${n} turbines`], deferredRollup: rollup };
  }
  writes.push(rollup);
  return { writes, log: [`Generator type with ${n} turbines`] };
}

/** A plan that may hand its project roll-up to the follow-up plan (D144, `relaneWrites` / `replaceLanes`). */
export interface CreateTypePlan extends WritePlan {
  deferredRollup?: PlannedWrite;
}

/** `planCreateGeneratorType` with the F6 owning-business-unit refusal (a plan that creates rows is refused when the project has none). */
export const planCreateGeneratorType = (...a: Parameters<typeof planCreateGeneratorTypeUnchecked>): ReturnType<typeof planCreateGeneratorTypeUnchecked> =>
  requireOwningBusinessUnit(planCreateGeneratorTypeUnchecked(...a), a[0].project.owningBusinessUnitId);

/**
 * The second job of a new WTG / PV type — `btn_AutomatedFlow_TriggerWork_ForWTG_PV.OnSelect` (Y:65):
 * when no `DeviceTypesInProjects` row points at the type yet, `Patch(DeviceTypesInProjects,
 * Defaults, {Name: <type>.vsb_name, TypeInProject: <type>, 'Owning Business Unit'})`.
 */
export function deviceTypeShadow(args: {
  family: "wtg" | "pv";
  typeId: string;
  typeName: string;
  owningBusinessUnitId: string | null | undefined;
}): PlannedWrite {
  return ins(ES_PLANT.deviceTypesInProjects, {
    vsb_name: args.typeName,
    [args.family === "wtg" ? PLANT_BIND.deviceTypeWtg : PLANT_BIND.deviceTypePv]:
      ref(args.family === "wtg" ? ES_PLANT.generatorTypeInProjects : ES_PLANT.pvModuleTypeInProjects, args.typeId),
    ...owner(args.owningBusinessUnitId),
  }, "the O&M device-type row");
}

/**
 * The WTG type save, second job: the device-type shadow (when absent), then — the type being new —
 * `btn_Trigger_New_AllocateWTGs_To_Land_Lease` (Y:17510): every `AllWTGAllocated = Yes` land-lease
 * cost × every new turbine, `{Name: 'Land Owner' & "-" & Description & "-" & <turbine>.Name,
 * 'Project Cost', 'Generator In Project', OBU}` (rule 20).
 */
function planGeneratorTypeFollowUpUnchecked(args: {
  project: PlanProject;
  typeId: string;
  typeName: string;
  hasDeviceType: boolean;
  turbines: { id: string; name: string | null }[];
  landLeaseCosts: LandLeaseCostRow[];
  /**
   * D144 (`relaneWrites`): the project roll-up `planCreateGeneratorType` handed back (`deferredRollup`). It joins the device-type
   * row and the allocations in this plan's ONE wave. Unset (out of country, or the switch off) = today's plan.
   */
  rollup?: PlannedWrite;
}, opts?: PlanBulkOptions): WritePlan {
  const writes: PlannedWrite[] = [];
  if (!args.hasDeviceType) {
    writes.push(deviceTypeShadow({
      family: "wtg", typeId: args.typeId, typeName: args.typeName,
      owningBusinessUnitId: args.project.owningBusinessUnitId,
    }));
  }
  const allocation = {
    costs: args.landLeaseCosts, turbines: args.turbines, owningBusinessUnitId: args.project.owningBusinessUnitId,
  };
  if (bulkOn(opts, "allocations")) {
    // DIVERGENCE (plan §3 phase 2): the allocations are ONE `createMany` step. A bulk step is never part of a group,
    // so the device-type row is a plain create before it (it has no allocation to wait for, and no one to wait for it).
    // D144: the roll-up, when handed over, shares the device-type row's wave (a lone write stays a plain step).
    return { writes: [...wave([...writes, ...(args.rollup ? [args.rollup] : [])], opts), ...allocationStep(allocation, opts)], log: [] };
  }
  writes.push(...allocationCreates(allocation));
  // The device-type row and the allocations bind only to rows that already exist: one parallel run. D144: and the roll-up
  // (after the turbines it sums, which this plan's caller created first) in the same run.
  if (args.rollup) writes.push(args.rollup);
  return { writes: group(writes, opts), log: [] };
}

/** `planGeneratorTypeFollowUp` with the F6 owning-business-unit refusal (a plan that creates rows is refused when the project has none). */
export const planGeneratorTypeFollowUp = (...a: Parameters<typeof planGeneratorTypeFollowUpUnchecked>): ReturnType<typeof planGeneratorTypeFollowUpUnchecked> =>
  requireOwningBusinessUnit(planGeneratorTypeFollowUpUnchecked(...a), a[0].project.owningBusinessUnitId);

/**
 * Sibling total heights after an apply-to-all. SOURCE DEFECT (D27): the canvas `UpdateIf` writes the
 * EDITED turbine's `'Total Height'` to every turbine of the type (Y:11727/11755), so a sibling with
 * another plinth (or, for the plinth patch, another hub height) got a wrong total. Each sibling
 * now gets its own: hub height + plinth + ½ rotor, with the applied value replacing its own.
 * `planApplyToAll` (with `totalHeight`) keeps the canvas write (UT-GEN-104).
 */
export function siblingTotalHeight(args: {
  sibling: Pick<TurbineRow, "hubHeightExclPlinth" | "foundationPlinth">;
  applyHubHeight: boolean;
  applyFoundationPlinth: boolean;
  hubHeight: number | null;
  foundationPlinth: number | null;
  rotorDiameter: number | null | undefined;
}): number {
  return editedTotalHeight({
    hubHeight: args.applyHubHeight ? args.hubHeight : args.sibling.hubHeightExclPlinth,
    foundationPlinth: args.applyFoundationPlinth ? args.foundationPlinth : args.sibling.foundationPlinth,
    rotorDiameter: args.rotorDiameter,
  });
}

/**
 * The turbine save (`pcf_btn_GeneratorData_RightPanel_Form_Generator_Buttons_Save.OnChange`, Y:11631), in
 * the canvas order:
 *  1. `Patch(GeneratorInProjects, <turbine or Defaults>, {Name "WTG <Short Name>_<n>", ModuleTypeInProject,
 *     'Effective Capacity', 'Hub Height excl. Foundation Plinth [m]', OBU, 'Foundation Plinth [m]',
 *     'Total Height'})`;
 *  2. the apply-to-all patches over the type's other turbines (capacity; hub height; plinth — merged
 *     into one update per turbine; each carries OBU, as the canvas `UpdateIf`s do);
 *  3. the type re-derived from its turbines (count, `'Cost per WTG'` re-banded unrounded, cost,
 *     capacity = Σ effective capacity) — rules 13/21;
 *  4. the project roll-up;
 *  5. a NEW turbine is allocated to every AllWTG land-lease cost (`btn_Trigger_New_Allocate…`).
 */
function planSaveTurbineUnchecked(args: {
  project: PlanProject;
  type: GeneratorTypeRow;
  model: Pick<CatalogModel, "prices" | "foundationCostIncluded" | "additionalFoundationCost" | "rotorDiameter"> | null;
  accumulatedIndex: number;
  turbine: TurbineRow | null;
  /** Every turbine of the type, the edited one included. */
  typeTurbines: TurbineRow[];
  allTypes: GeneratorTypeRow[];
  form: TurbineFormState;
  applyAll: { capacity: boolean; hubHeight: boolean; plinth: boolean };
  /** `Value(txt_…Total_Height.Value)`. */
  totalHeight: number | null;
  landLeaseCosts: LandLeaseCostRow[];
  /** The user's language. Required: every box of the panel is typed in it. */
  lang: Lang;
}, opts?: PlanBulkOptions): WritePlan {
  const { lang } = args;
  const name = `WTG ${args.project.shortName ?? ""}_${args.form.nameIndex.trim()}`;
  const capacity = valueOrNull(args.form.effectiveCapacity, lang);
  const hub = valueOrNull(args.form.effectiveHubHeight, lang);
  const plinth = valueOrNull(args.form.foundationPlinth, lang);
  const obu = owner(args.project.owningBusinessUnitId);
  const turbineData = {
    [GEN_INSTANCE_COL.name]: name,
    [PLANT_BIND.moduleTypeWtg]: ref(ES_PLANT.generatorTypeInProjects, args.type.id),
    [GEN_INSTANCE_COL.effectiveCapacity]: capacity,
    [GEN_INSTANCE_COL.hubHeightExclPlinth]: hub,
    ...obu,
    [GEN_INSTANCE_COL.foundationPlinth]: plinth,
    [GEN_INSTANCE_COL.totalHeight]: args.totalHeight,
  };
  const writes: PlannedWrite[] = [args.turbine
    ? upd(ES_PLANT.generatorInProjects, args.turbine.id, turbineData, `turbine ${name}`)
    : ins(ES_PLANT.generatorInProjects, turbineData, `turbine ${name}`)];
  /** Save performance: steps 2 and 5 are independent rows, each sent as one parallel run (`together`). */
  const applyAll: PlannedWrite[] = [];

  // 2. apply-to-all, and the children as they will be after the save.
  const others = args.typeTurbines.filter((t) => t.id !== args.turbine?.id);
  const after: Pick<TurbineRow, "effectiveCapacity">[] = [{ effectiveCapacity: capacity }];
  for (const s of others) {
    const patch: Record<string, unknown> = {};
    if (args.applyAll.capacity) patch[GEN_INSTANCE_COL.effectiveCapacity] = capacity;
    if (args.applyAll.hubHeight) patch[GEN_INSTANCE_COL.hubHeightExclPlinth] = hub;
    if (args.applyAll.plinth) patch[GEN_INSTANCE_COL.foundationPlinth] = plinth;
    if (args.applyAll.hubHeight || args.applyAll.plinth) {
      patch[GEN_INSTANCE_COL.totalHeight] = siblingTotalHeight({
        sibling: s, applyHubHeight: args.applyAll.hubHeight, applyFoundationPlinth: args.applyAll.plinth,
        hubHeight: hub, foundationPlinth: plinth, rotorDiameter: args.model?.rotorDiameter,
      });
    }
    if (Object.keys(patch).length > 0) {
      applyAll.push(upd(ES_PLANT.generatorInProjects, s.id, { ...patch, ...obu }, `apply to all: ${s.name ?? s.id}`));
    }
    after.push({ effectiveCapacity: args.applyAll.capacity ? capacity : s.effectiveCapacity });
  }

  // 3. the type from its children.
  const re = recomputeTypeFromChildren({ children: after, model: args.model, accumulatedIndex: args.accumulatedIndex });
  const typeFields = {
    [GEN_TYPE_COL.numberOfGenerators]: re.numberOfGenerators,
    [GEN_TYPE_COL.costPerWtg]: re.costPerWtg,
    [GEN_TYPE_COL.generatorsCost]: re.generatorsCost,
    [GEN_TYPE_COL.generatorsCapacity]: re.generatorsCapacity,
  };
  // D144 (`relaneWrites`), a NEW turbine only: after the turbine create, the sibling patches, the type totals, the roll-up and
  // the allocations are ONE wave. None needs a row another of them writes: the totals and the roll-up come from the form and the
  // rows read before the save, and the allocations bind only to the turbine step 1 created. An edit keeps today's order.
  const relane = !args.turbine && perfOn(opts, "relaneWrites");
  const typeWrite = guardedIf(upd(ES_PLANT.generatorTypeInProjects, args.type.id, typeFields, "the generator type's totals"), opts);
  const rollupWrite = projectWtgRollup(args.project.id, args.allTypes.map((t) => t.id === args.type.id
    ? { ...t, generatorsCapacity: re.generatorsCapacity, generatorsCost: re.generatorsCost } : t));
  if (relane) {
    const lane: PlannedWrite[] = [];
    if (bulkOn(opts, "applyAll") && applyAll.length > 0) {
      writes.push(updateMany(
        ES_PLANT.generatorInProjects, uniqueRows(applyAll.map((w) => ({ id: w.id!, data: w.data! }))), "apply to all: the type's other turbines",
      ));
    } else {
      lane.push(...applyAll.map((w) => guardedIf(w, opts)));
    }
    lane.push(typeWrite, rollupWrite);
    const allocationArgs = {
      costs: args.landLeaseCosts, turbines: [{ id: createdRowRef(0), name }],
      owningBusinessUnitId: args.project.owningBusinessUnitId,
    };
    const bulkAllocations = bulkOn(opts, "allocations");
    if (!bulkAllocations) lane.push(...allocationCreates(allocationArgs));
    writes.push(...wave(lane, opts), ...(bulkAllocations ? allocationStep(allocationArgs, opts) : []));
    return { writes, log: [name] };
  }
  if (bulkOn(opts, "applyAll") && applyAll.length > 0) {
    // DIVERGENCE (plan §3 phase 3, §9.5; flag `applyAll`): the sibling patches are ONE `updateMany` step with today's
    // per-row payloads (each sibling's own total height, the owning-business-unit bind as today's single updates carry
    // it; the backend lets bind keys through on update). The backend's guarded read refuses the WHOLE step, sending
    // nothing, when a sibling is gone (`BulkRowsGoneError`: the user reloads).
    writes.push(updateMany(
      ES_PLANT.generatorInProjects, uniqueRows(applyAll.map((w) => ({ id: w.id!, data: w.data! }))), "apply to all: the type's other turbines",
    ));
  } else {
    // DEL-7(a): flag `guardedUpdates`: a sibling another user deleted is never re-created by the PATCH (the bulk form is guarded already).
    writes.push(...group(applyAll.map((w) => guardedIf(w, opts)), opts));
  }
  writes.push(typeWrite);

  // 4. the roll-up with the re-derived type.
  writes.push(rollupWrite);

  // 5. a new turbine's AllWTG allocations — bound to the row step 1 created.
  if (!args.turbine) {
    // Flag `allocations`: one `createMany` instead of the parallel run (plan §3 phase 2); the order is unchanged.
    writes.push(...allocationStep({
      costs: args.landLeaseCosts, turbines: [{ id: createdRowRef(0), name }],
      owningBusinessUnitId: args.project.owningBusinessUnitId,
    }, opts));
  }
  // Canvas order between the steps: turbine → apply-to-all (parallel) → type totals → roll-up → allocations
  // (parallel). Only rows inside one step go together, so the project trigger and a failure stop as before.
  return { writes, log: [name] };
}

/** `planSaveTurbine` with the F6 owning-business-unit refusal (a plan that creates rows is refused when the project has none). */
export const planSaveTurbine = (...a: Parameters<typeof planSaveTurbineUnchecked>): ReturnType<typeof planSaveTurbineUnchecked> =>
  requireOwningBusinessUnit(planSaveTurbineUnchecked(...a), a[0].project.owningBusinessUnitId);

/**
 * The turbine delete (`cmp_…ConfirmationDeleteGeneratorInProject.OnConfirm`, Y:15799): per allocation
 * of the turbine, remove the allocation when its cost has more than one, else remove the land-lease
 * cost (rule 21); `Remove(GeneratorInProjects)`; re-band the type from the remaining turbines
 * (`Project`, count, `'Cost per WTG'` 0 at zero turbines, cost, capacity, OBU); the roll-up.
 */
export function planDeleteTurbine(args: {
  project: PlanProject;
  type: GeneratorTypeRow;
  model: Pick<CatalogModel, "prices" | "foundationCostIncluded" | "additionalFoundationCost"> | null;
  accumulatedIndex: number;
  turbine: TurbineRow;
  typeTurbines: TurbineRow[];
  allTypes: GeneratorTypeRow[];
  allocations: { id: string; costId: string }[];
  allocationCountByCost: Record<string, number>;
}, opts?: PlanBulkOptions): WritePlan {
  // Save performance (6 Nov 2026): the land-lease clean-up rows are independent; the turbine, the type totals and the
  // roll-up follow one by one, in the canvas order. Tiers (plan §9.4, phase 1B): the allocations are one leaf group (16),
  // then the land-lease costs one cascade group (4); each a group of its own, in that order.
  const cleanup = landLeaseCleanupWrites(planTurbineDeletion({
    allocations: args.allocations, siblingCountByCost: args.allocationCountByCost,
  }), { allocation: "the turbine's land-lease allocation", cost: "the turbine's land-lease cost" }, costByAllocation(args.allocations), opts);
  const writes: PlannedWrite[] = [...leafDeletes(cleanup.allocations, opts), ...cascadeDeletes(cleanup.costs, opts)];
  writes.push(del(ES_PLANT.generatorInProjects, args.turbine.id, `turbine ${args.turbine.name ?? ""}`));
  const remaining = args.typeTurbines.filter((t) => t.id !== args.turbine.id);
  const re = recomputeTypeFromChildren({ children: remaining, model: args.model, accumulatedIndex: args.accumulatedIndex });
  // DEL-7(a): flag `guardedUpdates`: when another user deleted the type meanwhile, this PATCH must not re-create it (S8).
  writes.push(guardedIf(upd(ES_PLANT.generatorTypeInProjects, args.type.id, {
    [PLANT_BIND.project]: ref(ES.projects, args.project.id),
    [GEN_TYPE_COL.numberOfGenerators]: re.numberOfGenerators,
    [GEN_TYPE_COL.costPerWtg]: re.costPerWtg,
    [GEN_TYPE_COL.generatorsCost]: re.generatorsCost,
    [GEN_TYPE_COL.generatorsCapacity]: re.generatorsCapacity,
    ...owner(args.project.owningBusinessUnitId),
  }, "the generator type's totals"), opts));
  writes.push(projectWtgRollup(args.project.id, args.allTypes.map((t) => t.id === args.type.id
    ? { ...t, generatorsCapacity: re.generatorsCapacity, generatorsCost: re.generatorsCost } : t)));
  return { writes, log: [] };
}

/**
 * Which land-lease rows a WTG type delete removes. G-05b (1.21.753) / SOURCE DEFECT (D27): the
 * 1.21.709 canvas filters the allocations by `locSelectedGeneratorInProject` — one turbine, usually
 * BLANK — so a type delete removed none of its own land-lease costs (and with a blank turbine it
 * matched allocations that have no turbine). Here every allocation of the type's turbines follows
 * the turbine-delete rule: the land-lease cost goes when all of its allocations belong to this
 * type, otherwise only this type's allocations go.
 */
export function planTypeLandLeaseCleanup(args: {
  allocations: { id: string; costId: string }[];
  allocationCountByCost: Record<string, number>;
}): TurbineDeletionStep[] {
  const byCost = new Map<string, string[]>();
  for (const a of args.allocations) byCost.set(a.costId, [...(byCost.get(a.costId) ?? []), a.id]);
  const steps: TurbineDeletionStep[] = [];
  for (const [costId, ids] of byCost) {
    if ((args.allocationCountByCost[costId] ?? 0) > ids.length) {
      for (const id of ids) steps.push({ kind: "removeAllocation", allocationId: id });
    } else {
      steps.push({ kind: "removeLandLeaseCost", costId });
    }
  }
  return steps;
}

/**
 * The WTG type delete (`cmp_…ConfirmationDeleteGeneratorType.OnConfirm`, Y:15626): the land-lease
 * clean-up (`planTypeLandLeaseCleanup`), the `'Opex Project Costs'` of the type's `DeviceTypesInProjects` rows (the canvas
 * reads the first; DEL-3: the loader passes every bridge row's costs and their chain members), `Remove(GeneratorTypeInProjects)`,
 * the roll-up over the rest. A type
 * with an open permission flow (`needsPermissionCancellation`) gets `Requestpermissioncancellation`
 * first — the screen runs it before this plan (D97; the canvas runs it between the O&M deletes and the
 * `Remove`, so a failed cancellation there left the type without its costs).
 */
export function planDeleteGeneratorType(args: {
  project: PlanProject;
  type: GeneratorTypeRow;
  allTypes: GeneratorTypeRow[];
  allocations: { id: string; costId: string }[];
  allocationCountByCost: Record<string, number>;
  opexCostIds: string[];
}, opts?: PlanBulkOptions): WritePlan {
  // Save performance (6 Nov 2026): the land-lease clean-up and the O&M cost deletes are independent rows; the type
  // delete and the roll-up follow one by one, in the canvas order. Tiers (plan §9.4, phase 1B): the allocation and O&M
  // deletes are one leaf group (16), then the land-lease cost deletes one cascade group (4). They were one mixed group.
  const cleanup = landLeaseCleanupWrites(planTypeLandLeaseCleanup(args),
    { allocation: "a land-lease allocation of the type", cost: "a land-lease cost of the type" }, costByAllocation(args.allocations), opts);
  const writes: PlannedWrite[] = [
    ...leafDeletes([
      ...cleanup.allocations,
      // DEL-4 scope: O&M head/period ordering is NOT handled here. The loader (`listOpexCostIdsForBridges`) returns plain ids
      // (heads, then chain members) with no parent information, so these deletes carry no `serialKey`; only allocations do.
      ...args.opexCostIds.map((id) => del(ES_PLANT.opexProjectCosts, id, "an O&M cost of the type")),
    ], opts),
    ...cascadeDeletes(cleanup.costs, opts),
  ];
  writes.push(del(ES_PLANT.generatorTypeInProjects, args.type.id, "the generator type", { confirm: true }));
  writes.push(projectWtgRollup(args.project.id, args.allTypes.filter((t) => t.id !== args.type.id)));
  return { writes, log: [] };
}

/**
 * Activate / Deactivate (`cmp_…ConfirmationChangeStatus.OnConfirm`, Y:16145): the type's `Status`,
 * then every turbine of the type (`Patch(GeneratorInProjects, ShowColumns(col, GeneratorInProject,
 * Status))`), then the roll-up — the toggled type counts only when it becomes Active (rule 23).
 */
export function planToggleStatus(args: {
  project: PlanProject;
  type: GeneratorTypeRow;
  turbines: Pick<TurbineRow, "id">[];
  allTypes: GeneratorTypeRow[];
}, opts?: PlanBulkOptions): WritePlan {
  const p = planStatusToggle({ type: args.type, turbines: args.turbines });
  // DEL-7(a): flag `guardedUpdates`: a type another user deleted is not re-created by the status PATCH.
  const typeUpdate = guardedIf(upd(ES_PLANT.generatorTypeInProjects, p.typeId, { statecode: p.nextStatus }, "the generator type's status"), opts);
  const rollup = projectWtgRollup(args.project.id, args.allTypes.map((t) => t.id === p.typeId ? { ...t, status: p.nextStatus } : t));
  if (bulkOn(opts, "status")) {
    // DIVERGENCE (plan §3 phase 3, §9.5; flag `status`): the N turbine `statecode` updates are ONE `updateMany` step. The
    // backend guards it: when a turbine is gone it sends nothing and the step fails with `BulkRowsGoneError`, so a row
    // another user deleted is never re-created (SDK PATCH is an upsert). Order unchanged: the type first, the turbines,
    // the roll-up last. A repeated id is dropped here (a duplicate in `UpdateMultiple` is refused).
    const rows = uniqueRows(p.turbineIds.map((id) => ({ id, data: { statecode: p.nextStatus } })));
    return {
      writes: [typeUpdate, ...(rows.length > 0 ? [updateMany(ES_PLANT.generatorInProjects, rows, "the turbines' status")] : []), rollup],
      log: [],
    };
  }
  const turbineUpdates = p.turbineIds.map((id) => upd(ES_PLANT.generatorInProjects, id, { statecode: p.nextStatus }, "a turbine's status"));
  if (perfOn(opts, "relaneWrites")) {
    // D144 (`relaneWrites`): the type's status update and the turbines' `statecode` updates are independent rows (each sets
    // the same next status; no one reads another's result): ONE wave, then the roll-up last, as before. A lone type update
    // (no turbines) stays a plain step.
    return { writes: [...wave([typeUpdate, ...turbineUpdates], opts), rollup], log: [] };
  }
  const writes: PlannedWrite[] = [
    typeUpdate,
    // Save performance (phase 1, 16 Nov 2026): the turbines' `statecode` updates are independent rows, sent as one
    // parallel run (`together`, 8 at a time; 16 with `wideGroups`). Order unchanged: the type first, the turbine group, the
    // roll-up last. Tier: these are UPDATES (`statecode`), not deletes, so the group keeps the default limit; the delete
    // tiers (plan §9.4) do not apply.
    ...group(turbineUpdates, opts),
    rollup,
  ];
  return { writes, log: [] };
}

/* ═══════════════════════════════════════════ rollback of a failed create save (plan §9.3) ════ */

/**
 * One row a plan wrote or deleted, as the write executor reports it (`PlanResult` / `PlanError` `.landed`, `.deleted`,
 * `.maybeLanded`). The same type as the executor's `LandedRow` (DEL-5: unified), kept under its name here for the callers.
 */
export type LandedRowRef = LandedRow;

/** The identity of a row in a landed / deleted list: entity set + id, case-insensitive (a GUID may come back in either case). */
const landedKey = (row: LandedRowRef): string => `${row.entitySet.toLowerCase()}|${row.id.toLowerCase()}`;

/**
 * The rows of `landed` that are NOT in `deleted` (DEL-5, `PlanError.deleted` of a rollback or a delete job), in the order
 * of `landed`. Match is by entity set and id, case-insensitive. A pure list difference: what a retry still has to remove.
 */
export function remainingRows(landed: readonly LandedRowRef[], deleted: readonly LandedRowRef[]): LandedRowRef[] {
  const gone = new Set(deleted.map(landedKey));
  return landed.filter((row) => !gone.has(landedKey(row)));
}

/**
 * Every delete write of a plan, in plan order, as `{ entitySet, id }` (DEL-5): what a delete job attempted, to set against
 * `PlanError.deleted`. A delete whose id is a placeholder (`@created…`) or empty is skipped: it names no real row.
 */
export function plannedDeleteRows(plan: WritePlan): LandedRowRef[] {
  const rows: LandedRowRef[] = [];
  for (const w of plan.writes) {
    if (w.op !== "delete" || !w.id || w.id.startsWith(CREATED_ROW_ID)) continue;
    rows.push({ entitySet: w.entitySet, id: w.id });
  }
  return rows;
}

/** The landed rows by family. A PV type's unit is a turbine row (`vsb_generatorinprojects`) too. */
export interface LandedGroups {
  allocations: LandedRowRef[];
  bridgeRows: LandedRowRef[];
  turbines: LandedRowRef[];
  types: LandedRowRef[];
  pvTypes: LandedRowRef[];
  others: LandedRowRef[];
}

/** Sorts what a failed save wrote into its families, keeping the landing order inside each. */
export function groupLandedRows(landed: readonly LandedRowRef[]): LandedGroups {
  const g: LandedGroups = { allocations: [], bridgeRows: [], turbines: [], types: [], pvTypes: [], others: [] };
  for (const row of landed) {
    switch (row.entitySet) {
      case ES.landLeaseAllocationWtgs: g.allocations.push(row); break;
      case ES_PLANT.deviceTypesInProjects: g.bridgeRows.push(row); break;
      case ES_PLANT.generatorInProjects: g.turbines.push(row); break;
      case ES_PLANT.generatorTypeInProjects: g.types.push(row); break;
      case ES_PLANT.pvModuleTypeInProjects: g.pvTypes.push(row); break;
      default: g.others.push(row);
    }
  }
  return g;
}

/**
 * Which saves are rolled back when they fail part-way (plan §9.3): A, Add WTG type; B, an out-of-country type
 * whose Request Module Permission flow fails to start. Every other save keeps today's behaviour. NEW — no
 * canvas equivalent (DIVERGENCE, plan §9.3).
 */
export type RollbackScenario =
  | "addWtgType" | "outOfCountryApprovalFailed"
  | "addPvType" | "addTurbine" | "editTurbine" | "applyToAll"
  | "replaceGeneratorType" | "replacePvType" | "deleteGeneratorType" | "deletePvType"
  | "toggleStatus" | "saveSimple" | "saveInverter" | "saveSubstructure";

export const rollbackApplies = (scenario: RollbackScenario): boolean =>
  scenario === "addWtgType" || scenario === "outOfCountryApprovalFailed";

/** The roll-back delete of one landed row. A 404 counts as already gone in the executor (`unwrapDelete`). */
const undo = (row: LandedRowRef, what: string, confirm = false): PlannedWrite =>
  del(row.entitySet, row.id, `undo: ${what}`, confirm ? { confirm: true } : {});

/**
 * Deletes what a failed create save landed, children before parents (plan §9.3):
 *  1. the allocations (one parallel run; deleting a turbine only unlinks them, so they go explicitly),
 *  2. the device-type bridge rows,
 *  3. the turbines (one parallel run; the type's cascade would remove them, deleted so a refusal shows),
 *  4. the type(s),
 *  5. any other landed row (unknown family: after its possible parents),
 *  6. only when `rollupRan`, the project roll-up recomputed WITHOUT the deleted type, last.
 * Nothing landed -> an empty plan. The roll-up uses `remainingTypes` (the project's types without the new one;
 * a type listed in `landed` is dropped from it as well) for a WTG type, or `remainingPv` for a PV type.
 *
 * DEL-5: `maybeLanded` (`PlanError.maybeLanded`: rows of a failed `createMany` the backend could not confirm) are undone
 * too, de-duplicated against `landed` and ordered by the same families. The engine counts a 404 on a delete as already gone,
 * so a row that never existed is harmless; `describeLeftovers` must NOT be given them as certainly landed.
 */
export function planRollbackCreate(args: {
  project: PlanProject;
  landed: readonly LandedRowRef[];
  maybeLanded?: readonly LandedRowRef[];
  rollupRan: boolean;
  remainingTypes: (Pick<GeneratorTypeRow, "requestPermissionState" | "status" | "generatorsCapacity" | "generatorsCost"> & { id?: string })[];
  remainingPv?: {
    pv: Pick<SimpleTypeRow, "capacity" | "cost">[];
    inverters: Pick<SimpleTypeRow, "cost">[];
    substructures: Pick<SimpleTypeRow, "cost">[];
  };
}, opts?: PlanBulkOptions): WritePlan {
  const seen = new Set<string>();
  const toUndo = [...args.landed, ...(args.maybeLanded ?? [])].filter((r) => {
    if (!r.id) return false;
    const key = landedKey(r);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const g = groupLandedRows(toUndo);
  const total = g.allocations.length + g.bridgeRows.length + g.turbines.length + g.types.length + g.pvTypes.length + g.others.length;
  if (total === 0) return emptyPlan();
  const writes: PlannedWrite[] = [
    // Tiers (plan §9.4, phase 1B): allocations, bridge rows and turbines are leaf groups (16 in flight; each its own
    // group, so they run one after the other); the types are the cascade tier (4), because a type's delete locks and
    // updates its children. A single bridge row or type stays a plain one-by-one step.
    // No `serialKey` on the allocations: a landed row carries no parent id (only entity set and id), so the cost is unknown here.
    ...leafDeletes(g.allocations.map((r) => undo(r, "a land-lease allocation of the new type")), opts),
    ...leafDeletesIfMany(g.bridgeRows.map((r) => undo(r, "the new type's device-type row")), opts),
    ...leafDeletes(g.turbines.map((r) => undo(r, "a turbine of the new type")), opts),
    ...cascadeDeletesIfMany([
      ...g.types.map((r) => undo(r, "the new generator type", true)),
      ...g.pvTypes.map((r) => undo(r, "the new PV module type", true)),
    ], opts),
    ...g.others.map((r) => undo(r, "a row the failed save created")),
  ];
  if (args.rollupRan) {
    if (g.pvTypes.length > 0) {
      if (!args.remainingPv) return refusePlan("The PV roll-up needs the remaining PV rows.");
      writes.push(upd(ES.projects, args.project.id, {
        [PROJECT_PLANT_COL.plantPvCapacity]: plantPvCapacity(args.remainingPv.pv),
        [PROJECT_PLANT_COL.plantPvCost]: plantPvCost({ pv: args.remainingPv.pv, inverters: args.remainingPv.inverters, substructures: args.remainingPv.substructures }),
      }, "the project's Plant PV Capacity / Cost, without the undone type"));
    } else {
      const gone = new Set(g.types.map((r) => r.id));
      writes.push(projectWtgRollup(args.project.id, args.remainingTypes.filter((t) => !(t.id && gone.has(t.id)))));
    }
  }
  return { writes, log: [`Undo of ${total} landed rows`] };
}

/** What a failed rollback left behind, counted. `types` counts landed type rows (generator or PV). */
export interface RollbackLeftovers {
  typeName?: string;
  types: number;
  turbines: number;
  allocations: number;
  bridgeRows: number;
  /** Rows of an unknown entity set (the named kinds below are not counted here). */
  other: number;
  /** Inverter, substructure, BESS, hydrogen and substation rows, with their nouns; absent when there are none (review F3 item 3). */
  otherKinds?: { one: string; many: string; count: number }[];
  total: number;
}

/** Counts the rows to clean up. `names.typeName` is the type's name (an autonumber the screen reads back). */
export function describeLeftovers(landed: readonly LandedRowRef[], names: { typeName?: string | null }): RollbackLeftovers {
  const g = groupLandedRows(landed.filter((r) => r.id));
  const types = g.types.length + g.pvTypes.length;
  const kinds = splitOtherKinds(g.others);
  return {
    ...(names.typeName && types > 0 ? { typeName: names.typeName } : {}),
    types,
    turbines: g.turbines.length,
    allocations: g.allocations.length,
    bridgeRows: g.bridgeRows.length,
    other: kinds.unknown,
    ...(kinds.named.length > 0 ? { otherKinds: kinds.named } : {}),
    total: types + g.turbines.length + g.allocations.length + g.bridgeRows.length + g.others.length,
  };
}

const countOf = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/**
 * Readable nouns for the type rows a failed save or delete can leave that have no family of their own in `groupLandedRows`
 * (review F3 item 3), keyed by entity set, in the order they are listed. Only an unknown set is called "other row".
 * NEW — no canvas equivalent (DIVERGENCE, delete hardening plan DEL-5).
 */
const OTHER_KIND_NOUNS: readonly { set: string; one: string; many: string }[] = [
  { set: ES_PLANT.inverterTypeInProjects, one: "inverter type", many: "inverter types" },
  { set: ES_PLANT.substructureTypeInProjects, one: "substructure type", many: "substructure types" },
  { set: ES_PLANT.storageTypeInProjects, one: "BESS row", many: "BESS rows" },
  { set: ES_PLANT.hydrogenTypeInProjects, one: "hydrogen row", many: "hydrogen rows" },
  { set: ES_PLANT.substationTypeInProjects, one: "substation row", many: "substation rows" },
];

/** The rows of `others` split into the named kinds (in `OTHER_KIND_NOUNS` order, empty kinds left out) and the unknown rest. */
function splitOtherKinds(others: readonly LandedRowRef[]): { named: { one: string; many: string; count: number }[]; unknown: number } {
  const named = OTHER_KIND_NOUNS
    .map((k) => ({ one: k.one, many: k.many, count: others.filter((r) => r.entitySet.toLowerCase() === k.set).length }))
    .filter((k) => k.count > 0);
  return { named, unknown: others.length - named.reduce((sum, k) => sum + k.count, 0) };
}

/** The text of a failed rollback: says exactly what is left. Turbines and allocations are always listed. */
export function leftoversMessage(d: RollbackLeftovers): string {
  const parts: string[] = [];
  if (d.types > 0) parts.push(d.typeName ? `generator type "${d.typeName}"` : countOf(d.types, "generator type", "generator types"));
  parts.push(countOf(d.turbines, "generator", "generators"));
  parts.push(countOf(d.allocations, "land-lease allocation", "land-lease allocations"));
  if (d.bridgeRows > 0) parts.push(countOf(d.bridgeRows, "device-type row", "device-type rows"));
  for (const k of d.otherKinds ?? []) parts.push(countOf(k.count, k.one, k.many));
  if (d.other > 0) parts.push(countOf(d.other, "other row", "other rows"));
  return `This save failed and could not be fully undone. Left behind: ${parts.join(", ")}. Press ${ROLLBACK_MSG.retryButton} to remove them.`;
}

/** The roll-back texts. All three are NEW — no canvas equivalent (DIVERGENCE, plan §9.3). */
export const ROLLBACK_MSG = {
  /** NEW — no canvas equivalent (DIVERGENCE, plan §9.3). */
  undone: "This save failed and was undone. Nothing was kept.",
  /** NEW — no canvas equivalent (DIVERGENCE, plan §9.3). */
  leftover: (d: RollbackLeftovers): string => leftoversMessage(d),
  /** NEW — no canvas equivalent (DIVERGENCE, plan §9.3). */
  retryButton: "Retry cleanup",
  /** NEW — no canvas equivalent (DIVERGENCE, plan §9.3). The progress text of the rollback job (DEL-5: moved here from `Screen.tsx`, same wording). */
  progress: "Undoing the failed save, please wait...",
  /**
   * NEW — no canvas equivalent (DIVERGENCE, plan §9.3, review finding 3c). Shown when a failed save should have been rolled
   * back but the project is not loaded any more, so no rollback plan can be built (DEL-5: moved here, same wording).
   */
  noProject: "The failed save could not be undone automatically. Reload the page and check the generator types.",
  /**
   * NEW — no canvas equivalent (DIVERGENCE, plan §9.3). Shown when a failed save's rollback removed every generator row but the
   * project roll-up (its last write) failed, so nothing is left to retry (DEL-5; review F3 item 4: moved here from `Screen.tsx`, same wording).
   */
  totalsFailed:
    "The generator rows of the failed save were removed, but the project totals could not be updated. Reload the page and check the generator totals.",
  /**
   * NEW — no canvas equivalent (DIVERGENCE, plan §9.3). Shown when no row is certainly left, but some rows of a failed bulk
   * create may exist (`maybeLanded`): the Retry cleanup button stays (review F3 item 4).
   */
  maybeLeft: `Some rows of the failed save may not have been removed. Press Retry cleanup to check and remove them.`,
} as const;

/** The longest rollback error detail shown beside the leftover message (the bar must stay readable). */
export const ROLLBACK_DETAIL_MAX = 240;

/* ═══════════════════ what a failed delete job did and did not remove (delete hardening plan DEL-5) ════ */

/**
 * The texts of a delete that failed part-way. NEW — no canvas equivalent (DIVERGENCE, delete hardening plan DEL-5): the canvas
 * shows one error and says nothing about what was already removed. A delete cannot be undone, so the user finishes it.
 * Shape: `Removed: 1 generator type, 12 generators. Not removed: 3 land-lease allocations. Press Delete again to finish.`
 */
export const DELETE_PARTIAL_MSG = {
  /** NEW — no canvas equivalent (DIVERGENCE, delete hardening plan DEL-5). */
  removed: "Removed:",
  /** NEW — no canvas equivalent (DIVERGENCE, delete hardening plan DEL-5). */
  notRemoved: "Not removed:",
  /** NEW — no canvas equivalent (DIVERGENCE, delete hardening plan DEL-5). */
  pressAgain: "Press Delete again to finish.",
  /** NEW — no canvas equivalent (DIVERGENCE, delete hardening plan DEL-5). A half with no parts is left out. */
  text: (removed: readonly string[], notRemoved: readonly string[]): string => [
    ...(removed.length > 0 ? [`${DELETE_PARTIAL_MSG.removed} ${removed.join(", ")}.`] : []),
    ...(notRemoved.length > 0 ? [`${DELETE_PARTIAL_MSG.notRemoved} ${notRemoved.join(", ")}.`] : []),
    DELETE_PARTIAL_MSG.pressAgain,
  ].join(" "),
} as const;

/** The rows of one half of the partial-delete text, counted per family in a fixed order (types first). */
function deleteFamilyParts(rows: readonly LandedRowRef[], typeName: string | null | undefined): string[] {
  const g = groupLandedRows(rows.filter((r) => r.id));
  const setOf = (r: LandedRowRef): string => r.entitySet.toLowerCase();
  const costs = g.others.filter((r) => setOf(r) === ES_PLANT.landLeaseProjectCosts);
  const opex = g.others.filter((r) => setOf(r) === ES_PLANT.opexProjectCosts);
  const rest = g.others.filter((r) => setOf(r) !== ES_PLANT.landLeaseProjectCosts && setOf(r) !== ES_PLANT.opexProjectCosts);
  const kinds = splitOtherKinds(rest);
  const other = kinds.unknown;
  const named = (n: number, one: string, many: string, kind: string): string =>
    (typeName && n === 1 ? `${kind} "${typeName}"` : countOf(n, one, many));
  const parts: [number, string][] = [
    [g.types.length, named(g.types.length, "generator type", "generator types", "generator type")],
    [g.pvTypes.length, named(g.pvTypes.length, "PV module type", "PV module types", "PV module type")],
    [g.turbines.length, countOf(g.turbines.length, "generator", "generators")],
    [g.allocations.length, countOf(g.allocations.length, "land-lease allocation", "land-lease allocations")],
    [costs.length, countOf(costs.length, "land-lease cost", "land-lease costs")],
    [opex.length, countOf(opex.length, "O&M cost", "O&M costs")],
    [g.bridgeRows.length, countOf(g.bridgeRows.length, "device-type row", "device-type rows")],
    ...kinds.named.map((k): [number, string] => [k.count, countOf(k.count, k.one, k.many)]),
    [other, countOf(other, "other row", "other rows")],
  ];
  return parts.filter(([n]) => n > 0).map(([, text]) => text);
}

/**
 * What a delete job that failed part-way removed and did not remove (DEL-5). `attempted` is `plannedDeleteRows(plan)`,
 * `deleted` is `PlanError.deleted`. Null when every attempted row was deleted (nothing to tell) AND when none was (review F3
 * item 2: the job's own error stands and a "press again" hint would mislead). `typeName` names the one
 * type row when there is exactly one in a half. NEW — no canvas equivalent (DIVERGENCE, delete hardening plan DEL-5).
 */
export function deletePartialMessage(args: {
  attempted: readonly LandedRowRef[];
  deleted: readonly LandedRowRef[];
  typeName?: string | null;
}): string | null {
  const notRemoved = remainingRows(args.attempted, args.deleted);
  if (notRemoved.length === 0) return null;
  const left = new Set(notRemoved.map(landedKey));
  const removed = args.attempted.filter((r) => !left.has(landedKey(r)));
  // Review F3 item 2: a "press Delete again" hint is only true when the job really made progress. With nothing deleted the
  // original error stands alone (after a 403 pressing again would fail the same way).
  if (removed.length === 0) return null;
  return DELETE_PARTIAL_MSG.text(deleteFamilyParts(removed, args.typeName), deleteFamilyParts(notRemoved, args.typeName));
}

/** `'Plant PV Cost [EUR]' = Σ PV cost + Σ inverter type cost + Σ substructure cost` (rule 16). */
const projectPvCost = (projectId: string, pv: SimpleTypeRow[], inverters: SimpleTypeRow[], substructures: SimpleTypeRow[]): PlannedWrite =>
  upd(ES.projects, projectId, {
    [PROJECT_PLANT_COL.plantPvCost]: plantPvCost({ pv, inverters, substructures }),
  }, "the project's Plant PV Cost");

/**
 * The PV save, first job: `Patch(PVModuleTypeInProjects, <row or Defaults>, {Project, Label, PVModule,
 * 'Other Supplier', degradations, 'Cost per Power', 'Capacity [MWp]', 'Cost [EUR]', OBU})` (Y:8001).
 */
function planSavePvTypeUnchecked(args: {
  project: PlanProject;
  pv: SimpleTypeRow | null;
  form: PvTypeFormState;
  deviceCostModules: number | null | undefined;
  otherSupplierChosen: boolean;
  /** The user's language. Required: capacity and degradations are typed in it. */
  lang: Lang;
}): WritePlan {
  const data = {
    [PLANT_BIND.project]: ref(ES.projects, args.project.id),
    ...buildPvTypeFields(args.form, {
      deviceCostModules: args.deviceCostModules, otherSupplierChosen: args.otherSupplierChosen, lang: args.lang,
    }),
    ...owner(args.project.owningBusinessUnitId),
  };
  const write = args.pv
    ? upd(ES_PLANT.pvModuleTypeInProjects, args.pv.id, data, "the PV module type")
    : ins(ES_PLANT.pvModuleTypeInProjects, data, "the PV module type");
  return { writes: [write], log: [args.form.moduleLabel] };
}

/** `planSavePvType` with the F6 owning-business-unit refusal (a plan that creates rows is refused when the project has none). */
export const planSavePvType = (...a: Parameters<typeof planSavePvTypeUnchecked>): ReturnType<typeof planSavePvTypeUnchecked> =>
  requireOwningBusinessUnit(planSavePvTypeUnchecked(...a), a[0].project.owningBusinessUnitId);

/**
 * The PV save, second job (it needs the type's autonumber `Name`):
 *  1. `Patch(GeneratorInProjects, <the PV type's unit or Defaults>, {Name: <type>.Name,
 *     ModuleTypeInProject: <type>, OBU})` (Y:8038) — DIVERGENCE (D27): an edited type without a unit
 *     gets one created (the canvas `Patch` of a blank `LookUp` fails);
 *  2. G7 (solution 1.21.753, PO answer 20 Oct 2026) — a NEW PV type's unit is back-filled into every
 *     `AllWTGAllocated = Yes` land-lease cost (`If(varIsNewPvModule, …; Select(btn_Trigger_New_AllocateWTGs_To_Land_Lease))`,
 *     gap register G-05b; source: the 1.21.753 skeleton port `createPvBridgeAndUnit`). 1.21.709 allocated
 *     no PV unit. An edit never back-fills, as the canvas gates it on `varIsNewPvModule`;
 *  3. `'Plant PV Capacity [MWp]'` and `'Plant PV Cost [EUR]'` (Y:8128-8158) — the out-of-country
 *     permission branch is `If(true = false, …)` in the canvas, so this always runs;
 *  4. the queued `DeviceTypesInProjects` shadow when none exists (Y:8037 → Y:65).
 */
function planPvFollowUpUnchecked(args: {
  project: PlanProject;
  pvId: string;
  pvName: string;
  unitId: string | null;
  hasDeviceType: boolean;
  pvRows: Pick<SimpleTypeRow, "capacity" | "cost">[];
  inverters: Pick<SimpleTypeRow, "cost">[];
  substructures: Pick<SimpleTypeRow, "cost">[];
  /** `varIsNewPvModule` — the type was created by the first job. */
  isNew?: boolean;
  /** The project's `AllWTGAllocated = Yes` land-lease costs (G7). */
  landLeaseCosts?: LandLeaseCostRow[];
}, opts?: PlanBulkOptions): WritePlan {
  const unit = {
    [GEN_INSTANCE_COL.name]: args.pvName,
    [PLANT_BIND.moduleTypePv]: ref(ES_PLANT.pvModuleTypeInProjects, args.pvId),
    ...owner(args.project.owningBusinessUnitId),
  };
  const unitWrite = args.unitId
    ? upd(ES_PLANT.generatorInProjects, args.unitId, unit, "the PV type's unit")
    : ins(ES_PLANT.generatorInProjects, unit, "the PV type's unit");
  const allocationArgs = {
    costs: args.landLeaseCosts ?? [], turbines: [{ id: args.unitId ?? createdRowRef(0), name: args.pvName }],
    owningBusinessUnitId: args.project.owningBusinessUnitId,
  };
  const rollupWrite = upd(ES.projects, args.project.id, {
    [PROJECT_PLANT_COL.plantPvCapacity]: plantPvCapacity(args.pvRows),
    [PROJECT_PLANT_COL.plantPvCost]: plantPvCost({ pv: args.pvRows, inverters: args.inverters, substructures: args.substructures }),
  }, "the project's Plant PV Capacity / Cost");
  const shadow = args.hasDeviceType ? [] : [deviceTypeShadow({
    family: "pv", typeId: args.pvId, typeName: args.pvName, owningBusinessUnitId: args.project.owningBusinessUnitId,
  })];
  if (perfOn(opts, "relaneWrites")) {
    // D144 (`relaneWrites`): after the unit, the G7 allocations (bound to the unit), the project's PV capacity / cost and the
    // device-type row (it needs only the PV type's name) are ONE wave: no one of them reads a row another writes. The roll-up
    // still comes after the PV type and the unit it sums, and is written once. With `allocations` on the createMany stays its
    // own step, where it was (after the unit), and the roll-up and the device-type row share a wave.
    const bulkAllocations = bulkOn(opts, "allocations");
    const lane = [
      ...(args.isNew && !bulkAllocations ? allocationCreates(allocationArgs) : []),
      rollupWrite, ...shadow,
    ];
    return {
      writes: [unitWrite, ...(args.isNew && bulkAllocations ? allocationStep(allocationArgs, opts) : []), ...wave(lane, opts)],
      log: [],
    };
  }
  const writes: PlannedWrite[] = [
    unitWrite,
    // G7 — bound to the unit this plan created (its first create), or the existing one. Save performance
    // (6 Nov 2026): independent rows, sent as one parallel run; the unit before them, the roll-up after.
    ...(args.isNew ? allocationStep(allocationArgs, opts) : []),
    rollupWrite,
  ];
  writes.push(...shadow);
  return { writes, log: [] };
}

/** `planPvFollowUp` with the F6 owning-business-unit refusal (a plan that creates rows is refused when the project has none). */
export const planPvFollowUp = (...a: Parameters<typeof planPvFollowUpUnchecked>): ReturnType<typeof planPvFollowUpUnchecked> =>
  requireOwningBusinessUnit(planPvFollowUpUnchecked(...a), a[0].project.owningBusinessUnitId);

/**
 * The canvas PV delete, as shipped (`cmp_…ConfirmationDeletePVModuleType.OnConfirm`, Y:15466): `Remove`;
 * `'Plant PV Capacity [MWp]'`; every substructure's cost re-computed against the new capacity (`Fixed` /
 * `Tracker` × capacity, else 0); `'Plant PV Cost [EUR]'`. An open permission flow is cancelled first,
 * by the screen (D97). `planDeletePvType` runs this after the children (G2).
 */
export function planDeletePvTypeCanvasParity(args: {
  project: PlanProject;
  pv: SimpleTypeRow;
  pvRows: SimpleTypeRow[];
  inverters: SimpleTypeRow[];
  substructures: SimpleTypeRow[];
  deviceCostFix: number | null | undefined;
  deviceCostTracker: number | null | undefined;
}): WritePlan {
  const rest = args.pvRows.filter((r) => r.id !== args.pv.id);
  const capacity = plantPvCapacity(rest);
  const substructures = args.substructures.map((s) => ({
    ...s,
    cost: substructureCost({
      mounting: s.typeLabels?.[0] ?? null, deviceCostFix: args.deviceCostFix,
      deviceCostTracker: args.deviceCostTracker, plantPvCapacityMwp: capacity,
    }),
  }));
  const writes: PlannedWrite[] = [
    del(ES_PLANT.pvModuleTypeInProjects, args.pv.id, "the PV module type", { confirm: true }),
    upd(ES.projects, args.project.id, { [PROJECT_PLANT_COL.plantPvCapacity]: capacity }, "the project's Plant PV Capacity"),
    // Save performance (6 Nov 2026): independent rows, one parallel run between the capacity and the PV cost.
    ...group(substructures.map((s) => upd(ES_PLANT.substructureTypeInProjects, s.id, { vsb_substructurecost: s.cost }, "a substructure cost"))),
    projectPvCost(args.project.id, rest, args.inverters, substructures),
  ];
  return { writes, log: [] };
}

/**
 * The PV delete. G2 (PO answer 20 Oct 2026) / SOURCE DEFECT (D27): the confirmation says "All related
 * cost in O&M and Land Lease will be removed" (`DIALOG_TEXT.deletePvModuleType`), but the canvas only
 * `Remove`s the type. Dataverse then deletes the type's unit and its O&M device-type row by cascade
 * (`vsb_vsb_generatorinproject_vsb_pvmoduletypeinproject_…` and `vsb_vsb_devicetypesinproject_vsb_pvmoduletypeinproject_…`
 * are `CascadeDelete` in `customizations.xml`), while the unit's land-lease allocations and the
 * device-type row's O&M costs are only unlinked (`RemoveLink`) — orphaned rows that still carry cost.
 *
 * Now, children first, as the WTG type delete does:
 *  1. the land-lease clean-up of the PV unit(s) — the G1 rule (`planTypeLandLeaseCleanup`): a land-lease
 *     cost goes when all its allocations belong to the type, otherwise only the type's allocations go;
 *  2. the `'Opex Project Costs'` of the type's `DeviceTypesInProjects` rows (Y:15634, the WTG rule; DEL-3: every bridge row);
 *  3. the PV unit(s) (`GeneratorInProjects`);
 *  4. the canvas body (`planDeletePvTypeCanvasParity`): the type, the capacity, the substructure costs,
 *     the PV cost. The device-type row goes with the type (cascade), as on the WTG type delete.
 */
export function planDeletePvType(args: Parameters<typeof planDeletePvTypeCanvasParity>[0] & {
  unitIds: readonly string[];
  allocations: { id: string; costId: string }[];
  allocationCountByCost: Record<string, number>;
  opexCostIds: readonly string[];
}, opts?: PlanBulkOptions): WritePlan {
  const canvas = planDeletePvTypeCanvasParity(args);
  if (canvas.refusedReason) return canvas;
  // Save performance (6 Nov 2026): the land-lease clean-up and the O&M deletes are independent rows; the unit(s)
  // follow (after them, as before), then the canvas body. Tiers (plan §9.4, phase 1B): the allocation and O&M deletes
  // are one leaf group (16), the land-lease costs one cascade group (4), the units a leaf group when there are several.
  const cleanup = landLeaseCleanupWrites(planTypeLandLeaseCleanup(args),
    { allocation: "a land-lease allocation of the PV module type", cost: "a land-lease cost of the PV module type" },
    costByAllocation(args.allocations), opts);
  const children: PlannedWrite[] = [
    ...leafDeletes([
      ...cleanup.allocations,
      // DEL-4 scope: O&M head/period ordering is not handled (plain ids from the loader); see `planDeleteGeneratorType`.
      ...args.opexCostIds.map((id) => del(ES_PLANT.opexProjectCosts, id, "an O&M cost of the PV module type")),
    ], opts),
    ...cascadeDeletes(cleanup.costs, opts),
    ...leafDeletesIfMany(args.unitIds.map((id) => del(ES_PLANT.generatorInProjects, id, "the PV module type's unit", { confirm: true })), opts),
  ];
  return { writes: [...children, ...canvas.writes], log: canvas.log };
}

/**
 * Inverter / substructure delete (`…DeleteInverterType.OnConfirm` Y:15377, `…DeleteSubstructureType`
 * Y:15288): `Remove`, then `'Plant PV Cost [EUR]'`. An open permission flow is cancelled first, by the
 * screen (D97). SOURCE DEFECT (D27): the canvas substructure cancellation sends `ModuleType.Inverter`
 * (Y:15288) — `buildCancellationPayload` maps the family correctly.
 */
export function planDeleteInverterOrSubstructure(args: {
  project: PlanProject;
  family: "inverter" | "substructure";
  row: SimpleTypeRow;
  pv: SimpleTypeRow[];
  inverters: SimpleTypeRow[];
  substructures: SimpleTypeRow[];
}): WritePlan {
  const inverters = args.family === "inverter" ? args.inverters.filter((r) => r.id !== args.row.id) : args.inverters;
  const substructures = args.family === "substructure" ? args.substructures.filter((r) => r.id !== args.row.id) : args.substructures;
  return {
    writes: [
      del(args.family === "inverter" ? ES_PLANT.inverterTypeInProjects : ES_PLANT.substructureTypeInProjects, args.row.id,
        args.family === "inverter" ? "the inverter type" : "the substructure type", { confirm: true }),
      projectPvCost(args.project.id, args.pv, inverters, substructures),
    ],
    log: [],
  };
}

const SIMPLE_TABLE: Record<SimpleCapacityFamily, { set: string; capacity: string; plant: string }> = {
  storage: { set: ES_PLANT.storageTypeInProjects, capacity: "vsb_storagecapacitydec", plant: PROJECT_PLANT_COL.plantStorageCapacity },
  hydrogen: { set: ES_PLANT.hydrogenTypeInProjects, capacity: "vsb_hydrogencapacitydec", plant: PROJECT_PLANT_COL.plantHydrogenCapacity },
  substation: { set: ES_PLANT.substationTypeInProjects, capacity: "vsb_substationcapacitydec", plant: PROJECT_PLANT_COL.plantSubstationCapacity },
};

/**
 * BESS / Hydrogen / Substation save (Y:12319, 13043, 13762): `Patch(<T>, <selected or Defaults>, {Name,
 * capacity (+ 'Energy Capacity [MWh]' for BESS), Supplier, Project, OBU})`, then `'Plant <X> Capacity'`
 * = Σ of the project's rows. The hidden Type combobox (`colDummyTypes`) is not written — DIVERGENCE
 * (D27): the canvas re-wrote the row's own value (or blank for a new row), which leaves it as it is.
 */
function planSaveSimpleUnchecked(args: {
  project: PlanProject;
  family: SimpleCapacityFamily;
  row: SimpleTypeRow | null;
  rows: SimpleTypeRow[];
  form: SimpleFormState;
  /** The user's language. Required: the capacity boxes open in it ("12,50"). */
  lang: Lang;
}): WritePlan {
  const { lang } = args;
  const t = SIMPLE_TABLE[args.family];
  const capacity = valueOrNull(args.form.capacity, lang);
  const data: Record<string, unknown> = {
    vsb_name: args.form.label,
    [t.capacity]: capacity,
    ...(args.family === "storage" ? { crc36_energycapacitymwh: valueOrNull(args.form.energyCapacity, lang) } : {}),
    vsb_supplier: args.form.supplier,
    [PLANT_BIND.project]: ref(ES.projects, args.project.id),
    ...owner(args.project.owningBusinessUnitId),
  };
  const after = [...args.rows.filter((r) => r.id !== args.row?.id), { capacity }];
  return {
    writes: [
      args.row ? upd(t.set, args.row.id, data, args.form.label) : ins(t.set, data, args.form.label),
      upd(ES.projects, args.project.id, { [t.plant]: sumCapacity(after) }, "the project's plant capacity"),
    ],
    log: [args.form.label],
  };
}

/** `planSaveSimple` with the F6 owning-business-unit refusal (a plan that creates rows is refused when the project has none). */
export const planSaveSimple = (...a: Parameters<typeof planSaveSimpleUnchecked>): ReturnType<typeof planSaveSimpleUnchecked> =>
  requireOwningBusinessUnit(planSaveSimpleUnchecked(...a), a[0].project.owningBusinessUnitId);

/** BESS / Hydrogen / Substation delete (Y:16315, 16298, 16281): `Remove`, then the capacity roll-up. */
export function planDeleteSimple(args: {
  project: PlanProject;
  family: SimpleCapacityFamily;
  row: SimpleTypeRow;
  rows: SimpleTypeRow[];
}): WritePlan {
  const t = SIMPLE_TABLE[args.family];
  return {
    writes: [
      del(t.set, args.row.id, args.row.name ?? "", { confirm: true }),
      upd(ES.projects, args.project.id, { [t.plant]: sumCapacity(args.rows.filter((r) => r.id !== args.row.id)) },
        "the project's plant capacity"),
    ],
    log: [],
  };
}

/* ══════════════════════ D27 G9 — the Add / Edit Inverter and Substructure panels ════ */
/*
 * DIVERGENCE (D27 G9, PO-approved 20 Oct 2026): the canvas has both panels
 * (`con_GeneratorData_RightPanel_Form_Inverter`, Y:9114; `…_Form_Substructure`, Y:8246) but their
 * commands are `ItemVisible: false`, so they were unreachable. They are ported as the canvas wrote
 * them — fields, validation, captions and `Patch` payloads — and exposed through
 * `commandBarState(…, { exposeInverterSubstructure: true })`.
 *
 * The out-of-catalogue "Request permission" save (`RequestModulePermission`) stays excluded (D27, X3):
 * a non-blank Other Supplier makes the save a permission request, which is refused.
 */

/** An `Inverters` / `Substructures` catalogue row (`colInverterSuppliers` / `colSubstructuresSuppliers`). */
export interface PlantSupplierOption {
  id: string;
  /** `Supplier` (`vsb_tier1supplier`). */
  supplier: string | null;
  /** `'Inverter Types'` (`vsb_invertertypes`) / `'Substructure Types'` (`vsb_substructuretypes`) option values. */
  typeValues: number[];
}

export type InverterOrSubstructure = "inverter" | "substructure";

/** The catalogue supplier the Other Supplier field belongs to. */
export const PLANT_OTHER_SUPPLIER = "Other Supplier";

/**
 * The comboboxes' `FullDisplayName` (Y:9417 / Y:8554): `Concatenate(Supplier, " ", Substitute(TrimEnds(
 * Concat('<Types>', Value & " ")), " ", ","))` — "SMA String,Central".
 */
export function plantSupplierDisplayName(family: InverterOrSubstructure, o: PlantSupplierOption): string {
  const labels = family === "inverter" ? INVERTER_TYPE_LABELS : SUBSTRUCTURE_TYPE_LABELS;
  const types = o.typeValues.map((v) => labels[v] ?? String(v)).join(" ").trim().replace(/ /g, ",");
  return `${o.supplier ?? ""} ${types}`;
}

/** `Trim(cmb.Selected.FullDisplayName) = "Other Supplier"` — shows the Other Supplier field (Y:9518 / Y:8627). */
export const isPlantOtherSupplier = (
  family: InverterOrSubstructure, o: PlantSupplierOption | null | undefined,
): boolean => o !== null && o !== undefined && plantSupplierDisplayName(family, o).trim() === PLANT_OTHER_SUPPLIER;

/**
 * The combobox options (App:1520-1547): the catalogue without "Other Supplier", then — inverters —
 * every "Other Supplier" row (`Collect(…, Filter(Inverters, Supplier = "Other Supplier"))`), or —
 * substructures — only the first (`LookUp(Substructures, Supplier = "Other Supplier")`).
 */
export function plantSupplierOptions(family: InverterOrSubstructure, rows: readonly PlantSupplierOption[]): PlantSupplierOption[] {
  const isOther = (r: PlantSupplierOption) => r.supplier === PLANT_OTHER_SUPPLIER;
  const others = rows.filter(isOther);
  return [...rows.filter((r) => !isOther(r)), ...(family === "inverter" ? others : others.slice(0, 1))];
}

/**
 * `txt_…_OtherSupplier.Value = If(cmb.Selected.Supplier = "Other Supplier", <row>.'Other Supplier')` — blank
 * whenever another supplier is chosen, so it is what the Save writes and what its label tests.
 */
export const effectiveOtherSupplier = (value: string, otherSupplierChosen: boolean): string =>
  otherSupplierChosen ? value : "";

/** `pcf_btn_…_Inverter_Buttons_Save.Text` / `…_Substructure_Buttons_Save.Text`: `If(IsBlank(txt_…OtherSupplier.Value), "Save", "Request permission")`. */
export const plantPanelSaveLabel = (otherSupplier: string): string =>
  isBlank(otherSupplier.trim()) ? "Save" : "Request permission";

/** A non-blank Other Supplier turns the save into the excluded permission request (D27). */
export const plantRequestsPermission = (otherSupplier: string): boolean => !isBlank(otherSupplier.trim());

/** A multi-select column's write form: the option values, comma-separated; none is blank. */
export const multiSelectText = (values: readonly number[]): string | null =>
  values.length > 0 ? values.join(",") : null;

/** The Add / Edit Inverter panel. */
export interface InverterFormState {
  label: string;
  /** The chosen `Inverters` row id (`cmb_…_Inverter_Fields_Supplier.Selected`). */
  supplierId: string | null;
  otherSupplier: string;
  /** `cmb_…_Inverter_Fields_InverterType.SelectedItems` (`SelectMultiple: true`). */
  inverterTypes: number[];
  warranty: string;
  numberOfInverters: string;
  nominalPower: string;
  dirty: Set<string>;
}

/** The Inverter panel's verbatim texts. */
export const INVERTER_MSG = {
  /** `lbl_…_Inverter_Fields_{Label,Supplier,OtherSupplier,InverterType}_ErrorMessage.Text` — verbatim. */
  blank: "Value cannot be blank.",
  /** `lbl_…_Inverter_Fields_{Warranty,NumberOfInverters}_ErrorMessage.Text` — `$"Value must be a integer"`, verbatim (sic). */
  integer: "Value must be a integer",
  /** `lbl_…_Inverter_Fields_Warranty_ErrorMessage.Text` — verbatim. */
  warrantyRange: "Please select a value between 0 and 40.",
  /**
   * `lbl_…_Inverter_Fields_{NumberOfInverters,NominalPower}_ErrorMessage.Text` — INTERPOLATED:
   * `$"Please select a value between 0 and {Text(1000000, "#,###.0#")}."`.
   */
  largeRange: `Please select a value between 0 and ${textFormat(1_000_000, "#,###.0#")}.`,
  /** `lbl_…_Inverter_Fields_NominalPower_ErrorMessage.Text` — verbatim. */
  twoDecimals: "Numeric value with maximum of two decimals",
  /** `pcf_btn_…_Inverter_Buttons_Save.OnChange` success `Notify` (Y:10307) — verbatim. */
  saved: "Inverter type was successfully saved for current project!",
} as const;

/** `INVERTER_MSG.largeRange` in the user's language (`Text(1000000, "#,###.0#")` follows `Language()`). */
export const inverterLargeRange = (lang: Lang = "en-US"): string =>
  `Please select a value between 0 and ${textFormat(1_000_000, "#,###.0#", lang)}.`;

/**
 * `If(IsBlank(<Other Supplier>), $"Inverter '{<Label>}' will be saved, please wait...", $"Request Permission for
 * inverter '{<Other Supplier>}' has been sent, please wait...")` (Y:10178-10182) — verbatim. `otherSupplier` is the
 * effective Other Supplier text (blank = the save path).
 */
export const inverterSaveProgressText = (label: string, otherSupplier = ""): string =>
  plantRequestsPermission(otherSupplier)
    ? `Request Permission for inverter '${otherSupplier}' has been sent, please wait...`
    : `Inverter '${label}' will be saved, please wait...`;

/**
 * The panel opens bound to the selected row, or a new row (`addInverterType`, Y:840-861). Each field's
 * `Value` / `DefaultSelectedItems`: the label, the catalogue inverter, its Other Supplier, the stored
 * types, `'Warranty [Years]'`, `'Number of Inverters'`, `Text('Nominal Power [kW]', "#.0#")`.
 */
export function inverterFormDefaults(row: SimpleTypeRow | null, lang: Lang = "en-US"): InverterFormState {
  return {
    label: row?.label ?? "",
    supplierId: row?.catalogueId ?? null,
    otherSupplier: row?.otherSupplier ?? "",
    inverterTypes: [...(row?.typeValues ?? [])],
    warranty: row?.warranty === null || row?.warranty === undefined ? "" : String(row.warranty),
    numberOfInverters: row?.numberOfInverters === null || row?.numberOfInverters === undefined ? "" : String(row.numberOfInverters),
    nominalPower: textFormat(row?.nominalPower, "#.0#", lang),
    dirty: new Set<string>(),
  };
}

export interface InverterFormErrors {
  label: string | null;
  supplier: string | null;
  otherSupplier: string | null;
  inverterTypes: string | null;
  warranty: string | null;
  numberOfInverters: string | null;
  nominalPower: string | null;
}

/** `fn_Numeric_Generators.IsInteger` + `InRange(…, 0, max)` — shown whenever a non-blank value fails. */
function integerRangeError(value: string, max: number, rangeText: string, lang: Lang): string | null {
  const v = value.trim();
  if (isBlank(v)) return null;
  if (!isInteger(v, lang)) return INVERTER_MSG.integer;
  return inRange(v, 0, max, lang) ? null : rangeText;
}

/**
 * The canvas error labels (Y:9254-10060). SOURCE DEFECT (D27 G9): `lbl_…_Inverter_Fields_OtherSupplier_ErrorMessage.Visible`
 * needs the SUPPLIER to be blank, inside a container that shows only when the "Other Supplier" row is
 * chosen, so it never shows. It shows here when that field is touched and blank
 * (`plantOtherSupplierErrorCanvasParity` keeps the canvas formula).
 */
export function validateInverterForm(
  form: InverterFormState, opts: { otherSupplierChosen: boolean }, lang: Lang = "en-US",
): InverterFormErrors {
  const d = (f: string) => form.dirty.has(f);
  const other = effectiveOtherSupplier(form.otherSupplier, opts.otherSupplierChosen).trim();
  return {
    label: d("label") && isBlank(form.label.trim()) ? INVERTER_MSG.blank : null,
    // `If(And(<OtherSupplier dirty>, IsBlank(Trim(other))), And(<Supplier dirty>, IsBlank(cmb.Selected)), false)`.
    supplier: d("otherSupplier") && isBlank(other) && d("supplier") && isBlank(form.supplierId) ? INVERTER_MSG.blank : null,
    otherSupplier: opts.otherSupplierChosen && d("otherSupplier") && isBlank(other) ? INVERTER_MSG.blank : null,
    inverterTypes: d("inverterTypes") && form.inverterTypes.length === 0 ? INVERTER_MSG.blank : null,
    warranty: integerRangeError(form.warranty, 40, INVERTER_MSG.warrantyRange, lang),
    numberOfInverters: integerRangeError(form.numberOfInverters, 1_000_000, inverterLargeRange(lang), lang),
    nominalPower: isBlank(form.nominalPower.trim())
      ? null
      : !isDecimalWithPlaces(form.nominalPower.trim(), 2, lang)
        ? INVERTER_MSG.twoDecimals
        : inRange(form.nominalPower.trim(), 0, 1_000_000, lang) ? null : inverterLargeRange(lang),
  };
}

/**
 * The canvas Other Supplier error `Visible` (inverter Y:9535, substructure Y:8644): `If(And(<Supplier dirty>,
 * IsBlank(cmb.Selected)), And(<OtherSupplier dirty>, IsBlank(Trim(txt.Value))), false)` — false whenever a
 * supplier is chosen, which the field's own container requires. The substructure copy reads the dirty
 * flag from the INVERTER panel's table (`colPanelInverterFormValidation`); pass that flag as `otherDirty`.
 */
export const plantOtherSupplierErrorCanvasParity = (args: {
  supplierDirty: boolean; supplierBlank: boolean; otherDirty: boolean; otherBlank: boolean;
}): boolean => (args.supplierDirty && args.supplierBlank ? args.otherDirty && args.otherBlank : false);

/** `IsNumeric(v)` and `IsMatch(v, "^((\-?|\+?)?\d+(\.\d+)?)")` (a full match) — the validation-table test. */
const canvasNumber = (v: string, lang: Lang): boolean =>
  !isBlank(v.trim()) && isNumeric(v.trim(), lang) && /^[-+]?\d+(\.\d+)?$/.test(v.trim());

/**
 * `pcf_btn_…_Inverter_Buttons_Save.DisplayMode` as shipped (Y:10133): every row of
 * `colPanelInverterFormValidation` valid (label, supplier, other supplier for the "Other Supplier" row,
 * number of inverters and warranty `IsNumeric` + the digits pattern, the types, nominal power
 * `IsNumeric`) and at least one dirty. A non-integer warranty or count, or an out-of-range value,
 * passes although its error label shows.
 */
export function canSaveInverterCanvasParity(
  form: InverterFormState, opts: { otherSupplierChosen: boolean }, lang: Lang = "en-US",
): boolean {
  const other = effectiveOtherSupplier(form.otherSupplier, opts.otherSupplierChosen);
  return !isBlank(form.label.trim())
    && !isBlank(form.supplierId)
    && (!opts.otherSupplierChosen || !isBlank(other.trim()))
    && canvasNumber(form.numberOfInverters, lang)
    && form.inverterTypes.length > 0
    && canvasNumber(form.warranty, lang)
    && !isBlank(form.nominalPower.trim()) && isNumeric(form.nominalPower.trim(), lang)
    && form.dirty.size > 0;
}

/**
 * The Inverter Save gate. SOURCE DEFECT (D27 G9): the canvas gate (`canSaveInverterCanvasParity`) lets a
 * value through that its own error label rejects ("Value must be a integer", the 0…40 / 0…1,000,000.0
 * ranges, two decimals). Here a visible error also disables Save.
 */
export function canSaveInverter(
  form: InverterFormState, opts: { otherSupplierChosen: boolean }, lang: Lang = "en-US",
): boolean {
  const e = validateInverterForm(form, opts, lang);
  return canSaveInverterCanvasParity(form, opts, lang) && !e.warranty && !e.numberOfInverters && !e.nominalPower;
}

/**
 * The inverter save (`pcf_btn_…_Inverter_Buttons_Save.OnChange`, Y:10175): `Patch(InverterTypeInProjects,
 * <row or Defaults>, {Project, Inverter, 'Inverter Label', 'Other Supplier', 'Inverter Types', 'Warranty
 * [Years]', 'Number of Inverters', 'Nominal Power [kW]', 'Costs per Inverter [EUR/Inverter]' = Inverter
 * device cost × power / 1000 (0 without a device cost), 'Inverter Type Cost' = that × count, OBU})`, then
 * `'Plant PV Cost [EUR]'` over the re-read PV, inverter and substructure rows. A non-blank Other Supplier
 * (Y:10243) skips that roll-up: the screen runs `RequestModulePermission` for the row instead (D97), and
 * the flow adds the inverter cost to the project once the request is approved.
 */
function planSaveInverterUnchecked(args: {
  project: PlanProject;
  row: SimpleTypeRow | null;
  form: InverterFormState;
  otherSupplierChosen: boolean;
  deviceCostInverter: number | null | undefined;
  pv: Pick<SimpleTypeRow, "cost">[];
  inverters: SimpleTypeRow[];
  substructures: Pick<SimpleTypeRow, "cost">[];
  /** The user's language. Required: warranty, count and nominal power are typed in it. */
  lang: Lang;
}): WritePlan {
  const { lang } = args;
  const other = effectiveOtherSupplier(args.form.otherSupplier, args.otherSupplierChosen);
  const count = valueOrNull(args.form.numberOfInverters, lang);
  const power = valueOrNull(args.form.nominalPower, lang);
  const costs = inverterCosts({ deviceCostInverter: args.deviceCostInverter, nominalPowerKw: power ?? 0, numberOfInverters: count ?? 0 });
  const data: Record<string, unknown> = {
    [PLANT_BIND.project]: ref(ES.projects, args.project.id),
    ...(args.form.supplierId ? { [PLANT_BIND.inverter]: ref(ES_PLANT.inverters, args.form.supplierId) } : {}),
    vsb_inverterlabel: args.form.label,
    vsb_invothersupplier: isBlank(other.trim()) ? null : other,
    vsb_selectedinvertertypes: multiSelectText(args.form.inverterTypes),
    vsb_inverterwarranty: valueOrNull(args.form.warranty, lang),
    vsb_numberofinverters: count,
    vsb_inverternominalpower: power,
    vsb_costperinverter: costs.costPerInverter,
    vsb_invertertypecost: costs.typeCost,
    ...owner(args.project.owningBusinessUnitId),
  };
  const inverters = [...args.inverters.filter((r) => r.id !== args.row?.id), { cost: costs.typeCost }];
  const row = args.row
    ? upd(ES_PLANT.inverterTypeInProjects, args.row.id, data, "the inverter type")
    : ins(ES_PLANT.inverterTypeInProjects, data, "the inverter type");
  if (plantRequestsPermission(other)) return { writes: [row], log: [args.form.label] };
  return {
    writes: [
      row,
      upd(ES.projects, args.project.id, {
        [PROJECT_PLANT_COL.plantPvCost]: plantPvCost({ pv: args.pv, inverters, substructures: args.substructures }),
      }, "the project's Plant PV Cost"),
    ],
    log: [args.form.label],
  };
}

/** `planSaveInverter` with the F6 owning-business-unit refusal (a plan that creates rows is refused when the project has none). */
export const planSaveInverter = (...a: Parameters<typeof planSaveInverterUnchecked>): ReturnType<typeof planSaveInverterUnchecked> =>
  requireOwningBusinessUnit(planSaveInverterUnchecked(...a), a[0].project.owningBusinessUnitId);

/** The Add / Edit Substructure panel. */
export interface SubstructureFormState {
  label: string;
  /** The chosen `Substructures` row id. */
  supplierId: string | null;
  otherSupplier: string;
  /** `cmb_…_Substructure_Fields_SubstructureType.Selected` (single select). */
  substructureType: number | null;
  dirty: Set<string>;
}

/** The Substructure panel's verbatim texts. */
export const SUBSTRUCTURE_MSG = {
  /** `lbl_…_Substructure_Fields_{Label,OtherSupplier}_ErrorMessage.Text` — verbatim. */
  blank: "Value cannot be blank.",
  /** `lbl_…_Substructure_Fields_Supplier_ErrorMessage.Text` — verbatim. */
  supplier: "Supplier must be selected.",
  /** `lbl_…_Substructure_Fields_SubstructureType_ErrorMessage.Text` — verbatim. */
  substructureType: "Substructure Type must be selected.",
  /** `pcf_btn_…_Substructure_Buttons_Save.OnChange` success `Notify` (Y:9042) — verbatim. */
  saved: "Substructure type was successfully saved for current project!",
  /** `addSubstructureType` (Y:874) — `locGeneratorInformationDialogTitle`, verbatim. */
  infoTitle: "Add Substructure information",
  /** `addSubstructureType` (Y:875) — `locGeneratorInformationDialogText`, verbatim. */
  infoText: "Please add the module type first to calculate the cost correctly.",
  /** `cmp_PopUp_Information` › `pcf_PopUpInformation_BodyButtons_Ok.Text` — verbatim. */
  infoOk: "OK",
} as const;

/**
 * `If(IsBlank(<Other Supplier>), $"Substructure '{<Label>}' will be saved, please wait...", $"Request Permission
 * for substructure '{<Other Supplier>}' has been sent, please wait...")` (Y:8921-8925) — verbatim.
 */
export const substructureSaveProgressText = (label: string, otherSupplier = ""): string =>
  plantRequestsPermission(otherSupplier)
    ? `Request Permission for substructure '${otherSupplier}' has been sent, please wait...`
    : `Substructure '${label}' will be saved, please wait...`;

/**
 * `addSubstructureType` (Y:862-893): with `'Plant PV Capacity [MWp]'` blank or 0 the information popup
 * opens instead of the panel — the substructure cost is mounting cost × PV capacity.
 */
export const substructureNeedsPvCapacity = (plantPvCapacity: number | null | undefined): boolean =>
  plantPvCapacity === null || plantPvCapacity === undefined || plantPvCapacity === 0;

/**
 * The panel's defaults: the label, the catalogue substructure, its Other Supplier and the FIRST stored
 * type (`DefaultSelectedItems`, a single-select combobox).
 */
export function substructureFormDefaults(row: SimpleTypeRow | null): SubstructureFormState {
  return {
    label: row?.label ?? "",
    supplierId: row?.catalogueId ?? null,
    otherSupplier: row?.otherSupplier ?? "",
    substructureType: row?.typeValues?.[0] ?? null,
    dirty: new Set<string>(),
  };
}

export interface SubstructureFormErrors {
  label: string | null;
  supplier: string | null;
  otherSupplier: string | null;
  substructureType: string | null;
}

/**
 * The canvas error labels (Y:8396-8826). SOURCE DEFECT (D27 G9): the Supplier and Other Supplier labels'
 * `Visible` read the INVERTER panel's validation table (`colPanelInverterFormValidation`, Y:8516/8679), and
 * the Other Supplier one also needs a blank supplier — so neither shows from this panel. Here each label
 * reads this panel's own fields (`plantOtherSupplierErrorCanvasParity` keeps the canvas formula).
 */
export function validateSubstructureForm(
  form: SubstructureFormState, opts: { otherSupplierChosen: boolean },
): SubstructureFormErrors {
  const d = (f: string) => form.dirty.has(f);
  const other = effectiveOtherSupplier(form.otherSupplier, opts.otherSupplierChosen).trim();
  return {
    label: d("label") && isBlank(form.label.trim()) ? SUBSTRUCTURE_MSG.blank : null,
    supplier: d("supplier") && isBlank(form.supplierId) ? SUBSTRUCTURE_MSG.supplier : null,
    otherSupplier: opts.otherSupplierChosen && d("otherSupplier") && isBlank(other) ? SUBSTRUCTURE_MSG.blank : null,
    substructureType: d("substructureType") && form.substructureType === null ? SUBSTRUCTURE_MSG.substructureType : null,
  };
}

/** The validation rows that do not depend on the type row (label, supplier, other supplier, a change). */
function substructureRowsValid(form: SubstructureFormState, otherSupplierChosen: boolean): boolean {
  const other = effectiveOtherSupplier(form.otherSupplier, otherSupplierChosen);
  return !isBlank(form.label.trim())
    && !isBlank(form.supplierId)
    && (!otherSupplierChosen || !isBlank(other.trim()))
    && form.dirty.size > 0;
}

/**
 * The Substructure Save gate: every row valid and a change. SOURCE DEFECT (D27 G9): the canvas seeds
 * the `SubstructureType` row as `Valid: IsBlank(<row>.'Substructure Types')` (Y:1129) — inverted — so an
 * edit of a typed row cannot save until the type is picked again, and a new row counts as valid with no
 * type (`canSaveSubstructureCanvasParity`). Here the row is valid when a type is chosen.
 */
export function canSaveSubstructure(form: SubstructureFormState, opts: { otherSupplierChosen: boolean }): boolean {
  return substructureRowsValid(form, opts.otherSupplierChosen) && form.substructureType !== null;
}

/** The canvas twin: the type row keeps its inverted seed until the supplier or the type changes. */
export function canSaveSubstructureCanvasParity(
  form: SubstructureFormState, opts: { otherSupplierChosen: boolean; storedTypeValues: readonly number[] },
): boolean {
  const touched = form.dirty.has("substructureType") || form.dirty.has("supplier");
  const typeValid = touched ? form.substructureType !== null : opts.storedTypeValues.length === 0;
  return substructureRowsValid(form, opts.otherSupplierChosen) && typeValid;
}

/**
 * The substructure save (`pcf_btn_…_Substructure_Buttons_Save.OnChange`, Y:8918): `Patch(SubstructureTypeInProjects,
 * <row or Defaults>, {Project, Substructure, 'Other Supplier', 'Substructure Label', 'Substructure Types',
 * 'Substructure Cost [EUR]' = Fixed / Tracker mounting cost × 'Plant PV Capacity [MWp]' (else 0), OBU})`,
 * then `'Plant PV Cost [EUR]'`. A non-blank Other Supplier (Y:8979) skips that roll-up: the screen runs
 * `RequestModulePermission` for the row instead (D97), and the flow adds the cost once it is approved.
 */
function planSaveSubstructureUnchecked(args: {
  project: PlanProject;
  row: SimpleTypeRow | null;
  form: SubstructureFormState;
  otherSupplierChosen: boolean;
  deviceCostFix: number | null | undefined;
  deviceCostTracker: number | null | undefined;
  plantPvCapacity: number | null | undefined;
  pv: Pick<SimpleTypeRow, "cost">[];
  inverters: Pick<SimpleTypeRow, "cost">[];
  substructures: SimpleTypeRow[];
}): WritePlan {
  const other = effectiveOtherSupplier(args.form.otherSupplier, args.otherSupplierChosen);
  const type = args.form.substructureType;
  const cost = substructureCost({
    mounting: type === null ? null : SUBSTRUCTURE_TYPE_LABELS[type] ?? null,
    deviceCostFix: args.deviceCostFix, deviceCostTracker: args.deviceCostTracker, plantPvCapacityMwp: args.plantPvCapacity,
  });
  const data: Record<string, unknown> = {
    [PLANT_BIND.project]: ref(ES.projects, args.project.id),
    ...(args.form.supplierId ? { [PLANT_BIND.substructure]: ref(ES_PLANT.substructures, args.form.supplierId) } : {}),
    vsb_substrothersupplier: isBlank(other.trim()) ? null : other,
    vsb_substructurelabel: args.form.label,
    vsb_selectedsubstructuretypes: type === null ? null : String(type),
    vsb_substructurecost: cost,
    ...owner(args.project.owningBusinessUnitId),
  };
  const substructures = [...args.substructures.filter((r) => r.id !== args.row?.id), { cost }];
  const row = args.row
    ? upd(ES_PLANT.substructureTypeInProjects, args.row.id, data, "the substructure type")
    : ins(ES_PLANT.substructureTypeInProjects, data, "the substructure type");
  if (plantRequestsPermission(other)) return { writes: [row], log: [args.form.label] };
  return {
    writes: [
      row,
      upd(ES.projects, args.project.id, {
        [PROJECT_PLANT_COL.plantPvCost]: plantPvCost({ pv: args.pv, inverters: args.inverters, substructures }),
      }, "the project's Plant PV Cost"),
    ],
    log: [args.form.label],
  };
}

/** `planSaveSubstructure` with the F6 owning-business-unit refusal (a plan that creates rows is refused when the project has none). */
export const planSaveSubstructure = (...a: Parameters<typeof planSaveSubstructureUnchecked>): ReturnType<typeof planSaveSubstructureUnchecked> =>
  requireOwningBusinessUnit(planSaveSubstructureUnchecked(...a), a[0].project.owningBusinessUnitId);

/* ═══════════════════ D27 G6 — Replace Generator / PV Module Type, the write plans (1.21.753) ════ */
/*
 * Ported 20 Oct 2026 on the PO's answer (G6). No 1.21.753 canvas YAML with these panels is on disk; the
 * sources are `migration-plans/10-solution-1.21.753-gap-register.md` (G-05, G-05b, G-05c),
 * `VSBCloud-Code-App-Skeleton/CHANGES-1.21.753.md` and the skeleton port
 * (`vsbcode/src/features/pm/generators/hooks.ts` `replaceGeneratorTypeImpl` / `replacePvModuleTypeImpl`,
 * `replace.test.ts`) — reference only, re-derived against this app's names and write plans.
 *
 * The canvas phases (`REPLACE_PHASES`): Identify → Detach → Delete → Add → AllocateLandLease → Repoint.
 * Job 1 (`planReplaceGeneratorType` / `planReplacePvType`): Detach (the old type's O&M costs lose their
 * device-type link), Delete (the old units, the old device-type rows, the old type), Add (the ordinary
 * save body). Job 2 (`…FollowUp`) needs the new ids: the new device-type row, the AllWTG back-fill, the
 * manual allocations moved, the old AllWTG rows removed, the O&M costs re-linked.
 *
 * SOURCE DEFECT 1.21.753-2 (G-05c) — not reproduced: the canvas T2c also removed the allocations of the
 * turbine selected at the time, which T2a had captured for re-pointing. Here they are re-pointed.
 * Excluded (D27, X3): a replace out of country (`RequestModulePermission`) and a replace of a type with
 * an open permission request (`Requestpermissioncancellation`) are refused.
 */

/** What a replace reads before its first job (T2a, "Identify"). */
export interface ReplaceInputs {
  /**
   * EVERY `DeviceTypesInProjects` row of the old type, oldest first (DEL-3; the canvas used only the first as the O&M bridge).
   * All of them are deleted.
   */
  bridgeIds: string[];
  /**
   * The project's `'Opex Project Costs'` on EVERY bridge row of the old type (any status), heads and their chain members
   * (DEL-3). The detach clears each one's device-type link and the follow-up links each one to the new bridge: period rows
   * carry the bridge bind like their head (`data/periodWrites.ts` re-binds it on every period save and import).
   */
  opexCostIds: string[];
  /** The old type's units (`GeneratorInProjects`). */
  unitIds: string[];
  /** The old units' land-lease allocations. */
  allocations: ReplaceAllocation[];
  /** The project's `AllWTGAllocated = Yes` land-lease costs — the T2g back-fill. */
  landLeaseCosts: LandLeaseCostRow[];
}

/**
 * T2a — the old units' allocations, each with its unit's index and its cost's AllWTG flag. `keepCostIds` (DEL-4, opt-in so the
 * default shape is unchanged) also keeps each allocation's land-lease cost id, the `serialKey` of its delete when
 * `GENERATORS_DELETE.parentOrder` is on.
 */
export function toReplaceAllocations(args: {
  allocations: readonly { id: string; costId: string; turbineId: string }[];
  units: readonly Pick<TurbineRow, "id" | "index">[];
  allWtgCostIds: ReadonlySet<string>;
  keepCostIds?: boolean;
}): ReplaceAllocation[] {
  const indexOf = new Map(args.units.map((u) => [u.id, u.index]));
  return args.allocations.map((a) => ({
    id: a.id,
    unitIndex: indexOf.get(a.turbineId) ?? 0,
    allWtgAllocated: args.allWtgCostIds.has(a.costId),
    ...(args.keepCostIds ? { costId: a.costId } : {}),
  }));
}

/** An O&M cost's device-type link — set, or cleared with `@odata.bind: null` (T2b / T2f). */
const opexLinkData = (bridge: string | null): Record<string, unknown> => ({
  [PLANT_BIND.deviceTypeInProject]: bridge ? ref(ES_PLANT.deviceTypesInProjects, bridge) : null,
});
const opexLink = (opexId: string, bridge: string | null, reason: string): PlannedWrite =>
  upd(ES_PLANT.opexProjectCosts, opexId, opexLinkData(bridge), reason);

/**
 * T2b Detach and T2c Delete, children first: O&M links cleared, units, device-type rows, the type.
 *
 * Save performance (6 Nov 2026): the O&M detach and the unit deletes touch unrelated rows — one parallel run.
 * The device-type rows are deleted one by one AFTER that run (a sequential write ends it), so every O&M cost
 * is detached before its device-type row goes and cannot be taken with it; the type last, as before.
 */
function replaceDetachAndDelete(inputs: ReplaceInputs, typeSet: string, typeId: string, opts?: PlanBulkOptions): PlannedWrite[] {
  // Tiers (plan §9.4, phase 1B): the detach is a group of UPDATES (default limit 8), the unit deletes a leaf group (16)
  // after it (they were one mixed group), the bridge rows a leaf group when there are several. The detach still runs
  // before every bridge-row delete. The type delete is one cascading request.
  // DIVERGENCE (plan §3 phase 5; flag `replace`): the detach is ONE `updateMany` of `{ DeviceTypeInProject: null }` rows
  // (a `null` bind clears the lookup and passes through the backend unchanged). It is still a step of its own BEFORE
  // the unit and bridge-row deletes, so an O&M cost is never taken along with its bridge row.
  const detach = bulkOn(opts, "replace")
    ? (inputs.opexCostIds.length > 0
      ? [updateMany(ES_PLANT.opexProjectCosts, uniqueRows(inputs.opexCostIds.map((id) => ({ id, data: opexLinkData(null) }))),
        "detach the O&M costs from the replaced type")]
      : [])
    : group(inputs.opexCostIds.map((id) => opexLink(id, null, "detach an O&M cost from the replaced type")), opts);
  const unitDeletes = inputs.unitIds.map((id) => del(ES_PLANT.generatorInProjects, id, "a unit of the replaced type", { confirm: true }));
  const bridgeDeletes = inputs.bridgeIds.map((id) => del(ES_PLANT.deviceTypesInProjects, id, "the replaced type's O&M device-type row"));
  if (perfOn(opts, "replaceLanes")) {
    // D144 (`replaceLanes`): the units and the device-type rows are sibling leaves of the type: ONE leaf wave (the leaf tier,
    // 16 in flight) after the detach, then the type delete. The detach still precedes every bridge-row delete, the type goes
    // last, and every delete keeps its own flags (`confirm`, hardened). One lone delete stays a plain step.
    return [...detach, ...leafDeletesIfMany([...unitDeletes, ...bridgeDeletes], opts), del(typeSet, typeId, "the replaced type", { confirm: true })];
  }
  return [
    ...detach,
    ...leafDeletes(unitDeletes, opts),
    ...leafDeletesIfMany(bridgeDeletes, opts),
    del(typeSet, typeId, "the replaced type", { confirm: true }),
  ];
}

/**
 * Replace Generator Type, job 1 (`pcf_btn_GeneratorData_RightPanel_Form_Buttons_Save_1.OnChange`): Detach,
 * Delete, then the WTG type save body (`planCreateGeneratorType`) for the "Replace to" model with the OLD
 * type's number of generators (`txt_…NumberOfGenerator_1` is disabled and copied). The new names continue
 * after the highest index of the OTHER types' turbines (the old ones are gone by then). Out of country the
 * Add skips the roll-up and the screen requests permission for the new type; an old type with an open
 * request has it cancelled first ("RDel001: Cancel pending permission for replaced generator") — both by the
 * screen, around this plan (D97).
 */
function planReplaceGeneratorTypeUnchecked(args: {
  project: PlanProject;
  oldType: GeneratorTypeRow;
  inCountry: boolean;
  model: Pick<CatalogModel, "id" | "specificCapacity" | "hubHeight" | "rotorDiameter">;
  /** `locGeneratorCostsPerWtg` for the old type's count, unrounded. */
  costPerWtg: number;
  selectedHeight: number;
  revisedHubHeight: number | null;
  /** Every type but the old one. */
  otherTypes: GeneratorTypeRow[];
  /** The turbines of every other type. */
  otherTurbines: Pick<TurbineRow, "index">[];
  inputs: ReplaceInputs;
}, opts?: PlanBulkOptions): CreateTypePlan {
  // Flag `turbines` (phase 4) reaches the Add through `opts`: the new type is still created first, single.
  // D144 (`replaceLanes`): the in-country roll-up is handed back for the follow-up's wave (`deferredRollup`), as the Add does.
  const add = planCreateGeneratorType({
    project: args.project, inCountry: args.inCountry, model: args.model,
    numberOfGenerators: Math.max(0, args.oldType.numberOfGenerators ?? 0), costPerWtg: args.costPerWtg,
    selectedHeight: args.selectedHeight, revisedHubHeight: args.revisedHubHeight,
    existingTypes: args.otherTypes, projectTurbines: args.otherTurbines,
    deferRollup: perfOn(opts, "replaceLanes"),
  }, opts);
  if (add.refusedReason) return add;
  return {
    writes: [...replaceDetachAndDelete(args.inputs, ES_PLANT.generatorTypeInProjects, args.oldType.id, opts), ...add.writes],
    log: add.log,
    ...(add.deferredRollup ? { deferredRollup: add.deferredRollup } : {}),
  };
}

/** `planReplaceGeneratorType` with the F6 owning-business-unit refusal (a plan that creates rows is refused when the project has none). */
export const planReplaceGeneratorType = (...a: Parameters<typeof planReplaceGeneratorTypeUnchecked>): ReturnType<typeof planReplaceGeneratorTypeUnchecked> =>
  requireOwningBusinessUnit(planReplaceGeneratorTypeUnchecked(...a), a[0].project.owningBusinessUnitId);

export interface ReplaceFollowUpPlan extends WritePlan {
  /** `locReplaceLandLeaseUnmatchedCount` — for `replaceSuccessText`. */
  unmatchedCount: number;
}

/**
 * Replace Generator Type, job 2: T2e the new type's device-type row (when absent, `deviceTypeShadow`);
 * T2g every AllWTG land-lease cost × every new unit; T2h the old manual allocations moved to the new
 * units BY POSITION (`planReplaceLandLease`), surplus removed; T2i the old units' AllWTG rows removed by
 * id; T2f the detached O&M costs linked to the new device-type row.
 */
function planReplaceGeneratorTypeFollowUpUnchecked(args: {
  project: PlanProject;
  newTypeId: string;
  newTypeName: string;
  /** The new type's device-type row, when one exists already. */
  existingBridgeId: string | null;
  /** The new units, ordered by index. */
  newUnits: { id: string; name: string | null }[];
  inputs: ReplaceInputs;
  /**
   * D144 (`replaceLanes`): the project roll-up `planReplaceGeneratorType` handed back (`deferredRollup`). It is written in this
   * plan's first wave: beside the device-type row when one is created, else beside the allocations. Unset = today's plan.
   */
  rollup?: PlannedWrite;
}, opts?: PlanBulkOptions): ReplaceFollowUpPlan {
  const obu = args.project.owningBusinessUnitId;
  const writes: PlannedWrite[] = [];
  /** The device-type row and the roll-up, as one wave (D144); empty with the switch off. */
  const lead: PlannedWrite[] = [];
  let rollupPending = args.rollup;
  /** Save performance (6 Nov 2026): after the device-type row, every write here is an independent row. */
  const rows: PlannedWrite[] = [];
  /** Plan §9.4 (phase 1B): the old allocations' deletes are their own leaf group, AFTER the new rows were created. */
  const removals: PlannedWrite[] = [];
  /** Flag `allocations`: the new allocations as ONE `createMany` step, before the run of moves and re-links. */
  let bulkCreates: PlannedWrite[] = [];
  let bridge = args.existingBridgeId;
  if (!bridge) {
    const shadow = deviceTypeShadow({ family: "wtg", typeId: args.newTypeId, typeName: args.newTypeName, owningBusinessUnitId: obu });
    if (rollupPending) {
      // Both need only rows that exist now (the new type and its units): one wave. The roll-up lands right after the units it sums,
      // as it did in job 1, so a failure further on never leaves the old type's capacity in the project totals.
      lead.push(shadow, rollupPending);
      rollupPending = undefined;
    } else writes.push(shadow);
    bridge = createdRowRef(0);
  }
  const allocation = { costs: args.inputs.landLeaseCosts, turbines: args.newUnits, owningBusinessUnitId: obu };
  if (bulkOn(opts, "allocations")) bulkCreates = allocationStep(allocation, opts);
  else rows.push(...allocationCreates(allocation));
  // Flag `replace` (plan §3 phase 5): the moves of the manual allocations and the O&M re-links are `updateMany` steps.
  const replaceBulk = bulkOn(opts, "replace");
  const moveRows: BulkRow[] = [];
  const relinkRows: BulkRow[] = [];
  const ll = planReplaceLandLease({ allocations: args.inputs.allocations, newUnitCount: args.newUnits.length });
  for (const r of ll.repoint) {
    const unit = args.newUnits[r.newUnitPosition];
    if (unit) {
      const bind = { [PLANT_BIND.generatorInProject]: ref(ES_PLANT.generatorInProjects, unit.id) };
      if (replaceBulk) moveRows.push({ id: r.allocationId, data: bind });
      else rows.push(upd(ES.landLeaseAllocationWtgs, r.allocationId, bind, `move a land-lease allocation to ${unit.name ?? "the new unit"}`));
    }
  }
  const costOf = costByAllocation(args.inputs.allocations);
  for (const id of [...ll.removeSurplus, ...ll.removeAllWtg]) {
    removals.push(allocationDelete(id, "a land-lease allocation of the replaced type", costOf, opts));
  }
  for (const id of args.inputs.opexCostIds) {
    if (replaceBulk) relinkRows.push({ id, data: opexLinkData(bridge) });
    // DEL-7(a): flag `guardedUpdates`: an O&M cost another user deleted since Identify is not re-created by the re-link PATCH.
    else rows.push(guardedIf(opexLink(id, bridge, "re-link an O&M cost to the new type"), opts));
  }
  // One parallel run after the device-type row it may bind to (the moves, creates and re-links are disjoint rows), then
  // the removals as their own leaf group (plan §9.4: deletes and creates never contend; the D51 lesson). With the flag the
  // moves and re-links are bulk steps after the creates (decision 3: delete and recreate, no repointing of old rows to new ones).
  // D144: no device-type row to create, so the handed-over roll-up joins the run of creates, moves and re-links.
  if (rollupPending) rows.push(rollupPending);
  writes.push(
    ...wave(lead, opts),
    ...bulkCreates, ...group(rows, opts),
    ...(moveRows.length > 0 ? [updateMany(ES.landLeaseAllocationWtgs, uniqueRows(moveRows), "move the land-lease allocations to the new units")] : []),
    ...(relinkRows.length > 0 ? [updateMany(ES_PLANT.opexProjectCosts, uniqueRows(relinkRows), "re-link the O&M costs to the new type")] : []),
    ...leafDeletes(removals, opts),
  );
  return { writes, log: [], unmatchedCount: ll.unmatchedCount };
}

/** `planReplaceGeneratorTypeFollowUp` with the F6 owning-business-unit refusal (a plan that creates rows is refused when the project has none). */
export const planReplaceGeneratorTypeFollowUp = (...a: Parameters<typeof planReplaceGeneratorTypeFollowUpUnchecked>): ReturnType<typeof planReplaceGeneratorTypeFollowUpUnchecked> =>
  requireOwningBusinessUnit(planReplaceGeneratorTypeFollowUpUnchecked(...a), a[0].project.owningBusinessUnitId);

/**
 * Replace PV Module Type, job 1 (`pcf_btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Save_2.OnChange`):
 * Detach, Delete, then the PV save body for the "Replace to" form (`planSavePvType`, a new row). An old type
 * with an open request has it cancelled first, by the screen (D97).
 */
function planReplacePvTypeUnchecked(args: {
  project: PlanProject;
  oldPv: SimpleTypeRow;
  form: PvTypeFormState;
  deviceCostModules: number | null | undefined;
  otherSupplierChosen: boolean;
  inputs: ReplaceInputs;
  /** The user's language. Required: the "Replace to" boxes are typed in it. */
  lang: Lang;
}, opts?: PlanBulkOptions): WritePlan {
  const add = planSavePvType({
    project: args.project, pv: null, form: args.form, deviceCostModules: args.deviceCostModules,
    otherSupplierChosen: args.otherSupplierChosen, lang: args.lang,
  });
  // F6: a refused add (no owning business unit) must not be preceded by the detach and delete of the old type.
  if (add.refusedReason) return add;
  return {
    writes: [...replaceDetachAndDelete(args.inputs, ES_PLANT.pvModuleTypeInProjects, args.oldPv.id, opts), ...add.writes],
    log: add.log,
  };
}

/** `planReplacePvType` with the F6 owning-business-unit refusal (a plan that creates rows is refused when the project has none). */
export const planReplacePvType = (...a: Parameters<typeof planReplacePvTypeUnchecked>): ReturnType<typeof planReplacePvTypeUnchecked> =>
  requireOwningBusinessUnit(planReplacePvTypeUnchecked(...a), a[0].project.owningBusinessUnitId);

/** A PV module has ONE unit: every manual allocation of the old unit moves to it; the old AllWTG rows go. */
export function planReplacePvLandLease(allocations: readonly ReplaceAllocation[]): { repoint: string[]; removeAllWtg: string[] } {
  return {
    repoint: allocations.filter((a) => !a.allWtgAllocated).map((a) => a.id),
    removeAllWtg: allocations.filter((a) => a.allWtgAllocated).map((a) => a.id),
  };
}

/**
 * Replace PV Module Type, job 2: the new device-type row (when absent), the new unit, the AllWTG back-fill
 * for it (G7), the old manual allocations moved to it, the old AllWTG rows removed, `'Plant PV Capacity /
 * Cost'`, then the O&M costs re-linked. The 1.21.753 hardening — O&M costs to re-link and no device-type
 * row — raises `PV_BRIDGE_MISSING` (unreachable here: the row is created when absent).
 */
function planReplacePvTypeFollowUpUnchecked(args: {
  project: PlanProject;
  newPvId: string;
  newPvName: string;
  existingBridgeId: string | null;
  inputs: ReplaceInputs;
  /** The PV rows after the replace (old out, new in). */
  pvRows: Pick<SimpleTypeRow, "capacity" | "cost">[];
  inverters: Pick<SimpleTypeRow, "cost">[];
  substructures: Pick<SimpleTypeRow, "cost">[];
}, opts?: PlanBulkOptions): WritePlan {
  const obu = args.project.owningBusinessUnitId;
  const writes: PlannedWrite[] = [];
  const lanes = perfOn(opts, "replaceLanes");
  let bridge = args.existingBridgeId;
  let creates = 0;
  /** The device-type row and the new unit: sibling creates, ONE wave with `replaceLanes` (D144). */
  const siblings: PlannedWrite[] = [];
  if (!bridge) {
    const shadow = deviceTypeShadow({ family: "pv", typeId: args.newPvId, typeName: args.newPvName, owningBusinessUnitId: obu });
    if (lanes) siblings.push(shadow); else writes.push(shadow);
    bridge = createdRowRef(creates++);
  }
  if (args.inputs.opexCostIds.length > 0 && !bridge) return refusePlan(PV_BRIDGE_MISSING);
  const unitCreate = ins(ES_PLANT.generatorInProjects, {
    [GEN_INSTANCE_COL.name]: args.newPvName,
    [PLANT_BIND.moduleTypePv]: ref(ES_PLANT.pvModuleTypeInProjects, args.newPvId),
    ...owner(obu),
  }, "the new PV type's unit");
  if (lanes) siblings.push(unitCreate); else writes.push(unitCreate);
  const unit = createdRowRef(creates);
  // Save performance (6 Nov 2026): after the new unit, its allocation creates, moves and removals are disjoint
  // rows — one parallel run; the project's PV capacity / cost after them; then the O&M re-links, another run.
  const allocation = { costs: args.inputs.landLeaseCosts, turbines: [{ id: unit, name: args.newPvName }], owningBusinessUnitId: obu };
  // Flag `allocations`: the creates are ONE `createMany` step before the run of moves; off: they join that run (today).
  const bulkCreates: PlannedWrite[] = bulkOn(opts, "allocations") ? allocationStep(allocation, opts) : [];
  const landLease: PlannedWrite[] = bulkOn(opts, "allocations") ? [] : allocationCreates(allocation);
  const ll = planReplacePvLandLease(args.inputs.allocations);
  // Flag `replace` (plan §3 phase 5): the moves and the O&M re-links are `updateMany` steps (each ONE bulk step, never in a group).
  const replaceBulk = bulkOn(opts, "replace");
  const moveBind = { [PLANT_BIND.generatorInProject]: ref(ES_PLANT.generatorInProjects, unit) };
  const moveRows: BulkRow[] = [];
  for (const id of ll.repoint) {
    if (replaceBulk) moveRows.push({ id, data: moveBind });
    else landLease.push(upd(ES.landLeaseAllocationWtgs, id, moveBind, "move a land-lease allocation to the new PV unit"));
  }
  // Plan §9.4 (phase 1B): the old AllWTG allocations go as their own leaf group, after the creates and moves.
  const costOf = costByAllocation(args.inputs.allocations);
  const removals = ll.removeAllWtg.map((id) => allocationDelete(id, "a land-lease allocation of the replaced PV type", costOf, opts));
  const rollupWrite = upd(ES.projects, args.project.id, {
    [PROJECT_PLANT_COL.plantPvCapacity]: plantPvCapacity(args.pvRows),
    [PROJECT_PLANT_COL.plantPvCost]: plantPvCost({ pv: args.pvRows, inverters: args.inverters, substructures: args.substructures }),
  }, "the project's Plant PV Capacity / Cost");
  // DEL-7(a): flag `guardedUpdates`, as in the generator follow-up.
  const relinks = replaceBulk ? [] : args.inputs.opexCostIds.map((id) => guardedIf(opexLink(id, bridge, "re-link an O&M cost to the new PV type"), opts));
  const relinkBulk = replaceBulk && args.inputs.opexCostIds.length > 0
    ? [updateMany(ES_PLANT.opexProjectCosts,
      uniqueRows(args.inputs.opexCostIds.map((id) => ({ id, data: opexLinkData(bridge) }))), "re-link the O&M costs to the new PV type")]
    : [];
  const moveBulk = moveRows.length > 0
    ? [updateMany(ES.landLeaseAllocationWtgs, uniqueRows(moveRows), "move the land-lease allocations to the new PV unit")]
    : [];
  if (lanes) {
    // D144 (`replaceLanes`): the device-type row and the unit are ONE wave (each needs only the new PV type's id and name);
    // then ONE wave of the allocation creates, the moves, the project's PV capacity / cost (it sums the type and the unit, both
    // written by now) and the O&M re-links (they need the device-type row, written by now); the old allocations are removed
    // LAST, after every create and move, so the delete lane never overlaps the create lane (D115 decision 5).
    writes.push(
      ...wave(siblings, opts),
      ...bulkCreates, ...wave([...landLease, rollupWrite, ...relinks], opts),
      ...moveBulk, ...relinkBulk,
      ...leafDeletes(removals, opts),
    );
    return { writes, log: [] };
  }
  writes.push(
    ...bulkCreates, ...group(landLease, opts),
    ...moveBulk,
    ...leafDeletes(removals, opts),
  );
  writes.push(rollupWrite);
  writes.push(...relinkBulk, ...group(relinks, opts));
  return { writes, log: [] };
}

/** `planReplacePvTypeFollowUp` with the F6 owning-business-unit refusal (a plan that creates rows is refused when the project has none). */
export const planReplacePvTypeFollowUp = (...a: Parameters<typeof planReplacePvTypeFollowUpUnchecked>): ReturnType<typeof planReplacePvTypeFollowUpUnchecked> =>
  requireOwningBusinessUnit(planReplacePvTypeFollowUpUnchecked(...a), a[0].project.owningBusinessUnitId);

/* ══════════════════════════════════ D97 — the module-permission flows' texts, and the write texts ════ */

/**
 * The module-permission flows' texts (D97; D27's `EXCLUDED` reasons are gone with the flows now called).
 * Verbatim canvas texts keep their typos ("permisson", "forg").
 */
export const PERMISSION_MSG = {
  /** The cards' Cancel success `Notify` — WTG Y:2689, PV Y:3835, inverter Y:4503, substructure Y:5162 — verbatim. */
  canceled: (family: PlantFamily, name: string | null | undefined): string => {
    const n = name ?? "";
    switch (family) {
      case "wtg": return `Request permisson forg generator ${n} was canceled !`;
      case "pv": return `Request permisson was canceled for PV Module ${n}!`;
      case "inverter": return `Request permisson was canceled for inverter ${n}!`;
      default: return `Request permisson was canceled for substructure ${n}!`;
    }
  },
  /**
   * The cards' Cancel error `Notify` (Y:2694 / 3840 / 4508 / 5167) — verbatim; the flow is named where the canvas
   * puts `FirstError.Source`, as `writeErrorText` names the table.
   */
  cancelError: (detail: string): string =>
    `Error: Current project cannot be send to controlling for approval. Internal error: originated on Request permission cancellation. Message: ${detail}`,
  /** NEW — no canvas equivalent: the canvas runs the card's Cancel without a progress dialog. */
  canceling: (name: string | null | undefined): string => `Request permission for "${name ?? ""}" will be canceled, please wait...`,
  /**
   * NEW — no canvas equivalent: a flow input the environment does not provide (`vsb_ProjectManagementAppID`,
   * `vsb_PrimarilyApprovalGroupID`, the user's e-mail). The canvas would send a blank and the flow would fail.
   */
  setupMissing: (what: string): string =>
    `The approval flow cannot be started: ${what} is not set in this environment. Please contact your administrator.`,
} as const;

/** The verbatim `Notify` texts of the writes. */
export const WRITE_MSG = {
  /** Y:11631 success — verbatim. */
  turbineSaved: "Generator was successfully saved for current project!",
  /** Y:15767 — verbatim. */
  typeDeleted: "Generator type was successfully deleted.",
  /** Y:16056 — verbatim. */
  turbineDeleted: "Generator and related Land Leases have been successfully deleted.",
  /** Y:16250 — verbatim. */
  statusChanged: "Generator status was successfully changed.",
  /** Y:15436 — verbatim. */
  inverterDeleted: "Inverter type was successfully deleted.",
  /** Y:15347 — verbatim. */
  substructureDeleted: "Substructure type was successfully deleted.",
  /** Y:10307 / Y:9042 — verbatim (G9). */
  inverterSaved: INVERTER_MSG.saved,
  substructureSaved: SUBSTRUCTURE_MSG.saved,
  /** Y:12377 / 13100 / 13818 — verbatim. */
  storageSaved: "Storage type was successfully saved for current project!",
  hydrogenSaved: "Hydrogen type was successfully saved for current project!",
  substationSaved: "Substation type was successfully saved for current project!",
  /** Y:16315 / 16298 / 16281 — verbatim. */
  storageDeleted: "BESS type was successfully deleted.",
  hydrogenDeleted: "Hydrogen type was successfully deleted.",
  substationDeleted: "Substation type was successfully deleted.",
  /** NEW — no canvas equivalent: the canvas shows no progress dialog for deletes and status changes. */
  working: "Saving changes, please wait...",
} as const;

/** `"Error: <what> " & "Internal error: originated on " & FirstError.Source & ". Message: " & …` — the table is named instead of `FirstError.Source`. */
export const writeErrorText = (what: string, entitySet: string) => (detail: string): string =>
  `Error: ${what} Internal error: originated on ${entitySet}. Message: ${detail}`;

/** The canvas `Error: …` prefixes, verbatim. */
export const WRITE_ERROR = {
  typeSave: writeErrorText("Generator type could not be saved.", ES_PLANT.generatorTypeInProjects),
  turbineSave: writeErrorText("Generator could not be saved.", ES_PLANT.generatorInProjects),
  typeDelete: writeErrorText("Generator could not be deleted.", ES_PLANT.generatorTypeInProjects),
  turbineDelete: writeErrorText("Generator could not be deleted.", ES_PLANT.generatorInProjects),
  status: writeErrorText("Generator status cannot be changed.", ES_PLANT.generatorTypeInProjects),
  inverterDelete: writeErrorText("Inverter could not be deleted.", ES_PLANT.inverterTypeInProjects),
  substructureDelete: writeErrorText("Substructure could not be deleted.", ES_PLANT.substructureTypeInProjects),
  /** `"Error: Inverter type could not be saved. " & …` / `"Error: Substructure type could not be saved. " & …` (G9). */
  inverterSave: writeErrorText("Inverter type could not be saved.", ES_PLANT.inverterTypeInProjects),
  substructureSave: writeErrorText("Substructure type could not be saved.", ES_PLANT.substructureTypeInProjects),
  /** `replaceErrorText` with the table named instead of `FirstError.Source` (G6). */
  wtgReplace: (detail: string) => replaceErrorText("wtg", { source: ES_PLANT.generatorTypeInProjects, message: detail }),
  pvReplace: (detail: string) => replaceErrorText("pv", { source: ES_PLANT.pvModuleTypeInProjects, message: detail }),
  storageSave: writeErrorText("Storage type could not be saved.", ES_PLANT.storageTypeInProjects),
  hydrogenSave: writeErrorText("Hydrogen type could not be saved.", ES_PLANT.hydrogenTypeInProjects),
  substationSave: writeErrorText("Substation type could not be saved.", ES_PLANT.substationTypeInProjects),
  storageDelete: writeErrorText("BESS could not be deleted.", ES_PLANT.storageTypeInProjects),
  hydrogenDelete: writeErrorText("Hydrogen could not be deleted.", ES_PLANT.hydrogenTypeInProjects),
  substationDelete: writeErrorText("Substation could not be deleted.", ES_PLANT.substationTypeInProjects),
} as const;

/**
 * `If(tgl_…_Filter_Country.Checked, $"Generator ""{DisplayName}"" will be saved, please wait...",
 * $"Request Permission for ""{DisplayName}"" has been sent, please wait...")` (Y:15214) — verbatim.
 */
export const typeSaveProgressText = (displayName: string | null | undefined, inCountry = true): string =>
  inCountry
    ? `Generator "${displayName ?? ""}" will be saved, please wait...`
    : `Request Permission for "${displayName ?? ""}" has been sent, please wait...`;

/**
 * The turbine save's progress text: `$"WTG '{Short Name}_{n}' will be saved, please wait..."` from the
 * Save button (Y:11631) and `$"WTG ""{Short Name}_{n}"" will be saved, please wait..."` from the
 * height-limitation popup (Y:17004) — both verbatim.
 */
export const turbineSaveProgressText = (shortName: string | null | undefined, index: string, fromPopup = false): string =>
  fromPopup
    ? `WTG "${shortName ?? ""}_${index}" will be saved, please wait...`
    : `WTG '${shortName ?? ""}_${index}' will be saved, please wait...`;

/** `$"{label} will be saved. Please waiting..."` (Y:12323, 13047, 13766) — verbatim. */
export const simpleSaveProgressText = (label: string): string => `${label} will be saved. Please waiting...`;

/** `pcf_btn_…Buttons_Save.Tooltip` (Y:15215) / `pcf_btn_…Buttons_Cancel.Tooltip` — verbatim. */
export const TYPE_PANEL_TOOLTIPS = { save: "Save Generator Type", cancel: "Close" } as const;

/** The pager icons' `Tooltip` (Y:1952/1990/2056) — verbatim. */
export const PAGER_TOOLTIPS = {
  first: "Navigate to first page",
  previous: "Navigate to previous page",
  next: "Navigate to next page",
} as const;

/** The cards' Cancel request button — `Text`, and the WTG `Tooltip` (Y:2698/2700); the other cards' tooltip (Y:3846). */
export const CANCEL_REQUEST = {
  text: "Cancel",
  wtgTooltip: "Cancel Request Permission.",
  tooltip: "Reset values form fields back.",
} as const;

/**
 * Multi-select option labels the cards show — `vsb_selectedinvertertypes` ('Inverter Types') and
 * `vsb_selectedsubstructuretypes` ('Substructure Types'). Pinned to the pac-generated enums by UT-GEN-095.
 */
export const INVERTER_TYPE_LABELS: Readonly<Record<number, string>> = { 952850000: "String", 952850001: "Central" };
export const SUBSTRUCTURE_TYPE_LABELS: Readonly<Record<number, string>> = { 952850000: "Fixed", 952850001: "Tracker" };

/** A multi-select column's raw value (`"952850000,952850001"`) as option values. */
export function multiSelectValues(raw: unknown): number[] {
  if (typeof raw === "number") return [raw];
  if (typeof raw !== "string" || raw.trim() === "") return [];
  return raw.split(",").map((v) => Number(v.trim())).filter((n) => Number.isFinite(n));
}

/** NEW — no canvas equivalent: the load-error state (CONVENTIONS rule 19). */
export const GENERATORS_SCREEN_TEXT = {
  loadFailedTitle: "The generator data could not be loaded",
  loadFailedDescription: "Reload the page or try again later.",
} as const;

/** `lbl_Generator_GeneratorStatus.Text = ThisItem.Status` (Y:2589) — the statecode labels. */
export const statusLabel = (status: number): string =>
  status === CHOICE_PLANT.status.active ? "Active" : "Inactive";
