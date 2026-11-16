/**
 * Project Generators — the Dataverse reads behind `features/pm/generators` (connected 19 Oct 2026, D27).
 *
 * Every read is server-filtered (CONVENTIONS rule 2) and names its `$select` (rule 1). Ten tables
 * were registered for this screen with `pac code add-data-source`, one at a time (52 → 62):
 * `vsb_projectplanning`, `vsb_invertertypeinproject`, `vsb_substructuretypeinproject`,
 * `vsb_storagetypeinproject`, `vsb_hydrogentypeinproject`, `vsb_substationtypeinproject`,
 * `vsb_devicecost`, `vsb_pvmodule`, `vsb_inverter` and `vsb_substructure`.
 *
 * Reused, not repeated: the FID price-inflation rows come from `data/milestones.ts`
 * (`loadPriceInflation`). Column names come from the generated models; the rules' column maps
 * (`GENERATOR_COL`, `GEN_TYPE_COL`, `GEN_INSTANCE_COL`, `PROJECT_PLANT_COL`) are the source.
 *
 * BULK TRANSPORT: this module registers `createGeneratorsBulkBackend` as the default bulk backend at module
 * load (`registerDefaultBulkBackend`, `./bulkBackend.ts`). The write-plan engine never imports the transport
 * itself, so only a build that loads the Generators data layer (the Generators screen always does) pays for
 * the transport's generated services; the factory still runs lazily on the first bulk step.
 */
import { Vsb_projectsService } from "@/generated/services/Vsb_projectsService";
import { Vsb_countriesService } from "@/generated/services/Vsb_countriesService";
import { Vsb_projectplanningsService } from "@/generated/services/Vsb_projectplanningsService";
import { Vsb_generatorsService } from "@/generated/services/Vsb_generatorsService";
import { Vsb_generatortypeinprojectsService } from "@/generated/services/Vsb_generatortypeinprojectsService";
import { Vsb_generatorinprojectsService } from "@/generated/services/Vsb_generatorinprojectsService";
import { Vsb_pvmoduletypeinprojectsService } from "@/generated/services/Vsb_pvmoduletypeinprojectsService";
import { Vsb_pvmodulesService } from "@/generated/services/Vsb_pvmodulesService";
import { Vsb_invertertypeinprojectsService } from "@/generated/services/Vsb_invertertypeinprojectsService";
import { Vsb_invertersService } from "@/generated/services/Vsb_invertersService";
import { Vsb_substructuretypeinprojectsService } from "@/generated/services/Vsb_substructuretypeinprojectsService";
import { Vsb_substructuresService } from "@/generated/services/Vsb_substructuresService";
import { Vsb_storagetypeinprojectsService } from "@/generated/services/Vsb_storagetypeinprojectsService";
import { Vsb_hydrogentypeinprojectsService } from "@/generated/services/Vsb_hydrogentypeinprojectsService";
import { Vsb_substationtypeinprojectsService } from "@/generated/services/Vsb_substationtypeinprojectsService";
import { Vsb_devicecostsService } from "@/generated/services/Vsb_devicecostsService";
import { Vsb_devicetypesinprojectsService } from "@/generated/services/Vsb_devicetypesinprojectsService";
import { Vsb_opexprojectcostsService } from "@/generated/services/Vsb_opexprojectcostsService";
import { Vsb_landleaseprojectcostsService } from "@/generated/services/Vsb_landleaseprojectcostsService";
import { Vsb_landleaseallocationwtgsService } from "@/generated/services/Vsb_landleaseallocationwtgsService";
import {
  COUNTRY_AVAILABILITY, DEVICE_TYPE, GENERATOR_COL, GEN_INSTANCE_COL, GEN_TYPE_COL, INVERTER_TYPE_LABELS,
  PROJECT_PLANT_COL, SUBSTRUCTURE_TYPE_LABELS, countryAvailabilityValue, multiSelectValues, turbineIndex,
  type CatalogModel, type GeneratorTypeRow, type GeneratorsProject, type LandLeaseCostRow, type PlantSupplierOption, type ProjectPlanning,
  type PvModuleOption, type SimpleTypeRow, type TurbineRow,
} from "@/features/pm/generators/rules";
import { registerDefaultBulkBackend } from "./bulkBackend";
import { fetchAll, fetchPage } from "./client";
import { mapLimit } from "./concurrency";
import { createGeneratorsBulkBackend } from "./generatorsBulk";
import { ACTIVE, and, chunk, eq, gtDate, guid, idIn, lookupEq, lookupIn, numberOf, or } from "./odata";

registerDefaultBulkBackend(createGeneratorsBulkBackend);

type Raw = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => numberOf(v) ?? null;
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
const raw = <T,>(rows: T[]): Raw[] => rows as unknown as Raw[];

/* ═══════════════════════════════════════════════════════════════ the project ══ */

/** The project with what this screen reads (`gblRecordSelectedProject`) and its plant roll-ups. */
export interface GeneratorsProjectRow extends GeneratorsProject {
  plantWtgCapacity: number | null;
  plantStorageCapacity: number | null;
  plantHydrogenCapacity: number | null;
  plantSubstationCapacity: number | null;
}

const PROJECT_SELECT = [
  PROJECT_PLANT_COL.id, PROJECT_PLANT_COL.projectIdText, PROJECT_PLANT_COL.projectName,
  PROJECT_PLANT_COL.shortName, PROJECT_PLANT_COL.country, PROJECT_PLANT_COL.totalCapacity,
  PROJECT_PLANT_COL.fid, PROJECT_PLANT_COL.endDate, PROJECT_PLANT_COL.projectStartDate,
  PROJECT_PLANT_COL.projectManager, PROJECT_PLANT_COL.owningBusinessUnit,
  PROJECT_PLANT_COL.plantWtgCapacity, PROJECT_PLANT_COL.plantPvCapacity,
  PROJECT_PLANT_COL.plantStorageCapacity, PROJECT_PLANT_COL.plantHydrogenCapacity,
  PROJECT_PLANT_COL.plantSubstationCapacity,
];

/**
 * `OnVisible`: `Set(gblRecordSelectedProject, LookUp(Projects, Project = …))` (Y:63) and
 * `gblRecordSelectedProjectCountry` (the ISO currency and the country name the availability uses).
 */
export async function loadGeneratorsProject(projectId: string): Promise<GeneratorsProjectRow | null> {
  const rows = raw(await fetchPage(
    "load the project's generators data",
    (o) => Vsb_projectsService.getAll(o),
    { select: PROJECT_SELECT, filter: `${PROJECT_PLANT_COL.id} eq ${guid(projectId)}`, top: 1 },
  ));
  const r = rows[0];
  if (!r) return null;
  const countryId = str(r[PROJECT_PLANT_COL.country]);
  let countryName: string | null = null;
  let isoCurrencyCode: string | null = null;
  if (countryId) {
    const c = raw(await fetchPage(
      "load the project's country",
      (o) => Vsb_countriesService.getAll(o),
      { select: ["vsb_countryid", "vsb_name", "vsb_isocurrencycode"], filter: `vsb_countryid eq ${guid(countryId)}`, top: 1 },
    ))[0];
    countryName = str(c?.vsb_name);
    isoCurrencyCode = str(c?.vsb_isocurrencycode);
  }
  return {
    id: String(r[PROJECT_PLANT_COL.id]),
    projectIdText: str(r[PROJECT_PLANT_COL.projectIdText]),
    projectName: str(r[PROJECT_PLANT_COL.projectName]),
    shortName: str(r[PROJECT_PLANT_COL.shortName]),
    countryId,
    countryName,
    countryOptionValue: countryAvailabilityValue(countryName),
    isoCurrencyCode,
    totalCapacity: num(r[PROJECT_PLANT_COL.totalCapacity]),
    fid: str(r[PROJECT_PLANT_COL.fid]),
    endDate: str(r[PROJECT_PLANT_COL.endDate]),
    projectStartDate: str(r[PROJECT_PLANT_COL.projectStartDate]),
    projectManagerId: str(r[PROJECT_PLANT_COL.projectManager]),
    projectManagerEmail: null,
    owningBusinessUnitId: str(r[PROJECT_PLANT_COL.owningBusinessUnit]),
    plantPvCapacity: num(r[PROJECT_PLANT_COL.plantPvCapacity]),
    plantWtgCapacity: num(r[PROJECT_PLANT_COL.plantWtgCapacity]),
    plantStorageCapacity: num(r[PROJECT_PLANT_COL.plantStorageCapacity]),
    plantHydrogenCapacity: num(r[PROJECT_PLANT_COL.plantHydrogenCapacity]),
    plantSubstationCapacity: num(r[PROJECT_PLANT_COL.plantSubstationCapacity]),
  };
}

/** `LookUp('Project Plannings', Project.Project = …)` (`gblRecordProjectPlanning` / `locProjectPlanning`). */
export async function loadProjectPlanning(projectId: string): Promise<ProjectPlanning | null> {
  const r = raw(await fetchPage(
    "load the project planning",
    (o) => Vsb_projectplanningsService.getAll(o),
    {
      select: ["vsb_projectplanningid", "vsb_isheightlimitationforwtg", "vsb_heightlimitationm"],
      filter: lookupEq("vsb_project", projectId), top: 1,
    },
  ))[0];
  if (!r) return null;
  return { isHeightLimitationForWtg: bool(r.vsb_isheightlimitationforwtg) === true, heightLimitation: num(r.vsb_heightlimitationm) };
}

/* ══════════════════════════════════════════════════════════ the WTG catalogue ══ */

const GENERATOR_SELECT = [
  GENERATOR_COL.id, GENERATOR_COL.name, GENERATOR_COL.displayName, GENERATOR_COL.supplier,
  GENERATOR_COL.turbineType, GENERATOR_COL.hubHeight, GENERATOR_COL.rotorDiameter,
  GENERATOR_COL.specificCapacity, GENERATOR_COL.totalHeight, GENERATOR_COL.earliestPhaseout,
  GENERATOR_COL.countryAvailability, GENERATOR_COL.foundationCostIncluded,
  GENERATOR_COL.additionalFoundationCost, GENERATOR_COL.price1, GENERATOR_COL.price2,
  GENERATOR_COL.price3, GENERATOR_COL.price4, GENERATOR_COL.price5,
];

function toModel(r: Raw): CatalogModel {
  return {
    id: String(r[GENERATOR_COL.id]),
    name: str(r[GENERATOR_COL.name]),
    displayName: str(r[GENERATOR_COL.displayName]),
    supplier: str(r[GENERATOR_COL.supplier]),
    turbineType: str(r[GENERATOR_COL.turbineType]),
    hubHeight: num(r[GENERATOR_COL.hubHeight]),
    rotorDiameter: num(r[GENERATOR_COL.rotorDiameter]),
    specificCapacity: num(r[GENERATOR_COL.specificCapacity]),
    totalHeight: num(r[GENERATOR_COL.totalHeight]),
    earliestPhaseout: str(r[GENERATOR_COL.earliestPhaseout]),
    countryAvailability: multiSelectValues(r[GENERATOR_COL.countryAvailability])
      .filter((v) => COUNTRY_AVAILABILITY[v] !== undefined),
    // The column is a Yes/No (bit) — treated as a boolean, as D26 does (D26 Q4).
    foundationCostIncluded: bool(r[GENERATOR_COL.foundationCostIncluded]) === true,
    additionalFoundationCost: num(r[GENERATOR_COL.additionalFoundationCost]),
    prices: [
      num(r[GENERATOR_COL.price1]), num(r[GENERATOR_COL.price2]), num(r[GENERATOR_COL.price3]),
      num(r[GENERATOR_COL.price4]), num(r[GENERATOR_COL.price5]),
    ],
  };
}

/**
 * `colGeneratorsInProjectsTemp` (Y:63): `Filter(colGenerators, And(Not(IsBlank(FID)),
 * vsb_earliestphaseout > FID))`, sorted by `vsb_displayname`. The filter runs on the server (the
 * canvas `ClearCollect(colGenerators, Generators)` pulled the whole table, rule 2). No status filter
 * — the canvas has none (D27 corrects the `statecode eq 0` the code had added).
 */
export async function listOrderableGenerators(fid: string | null): Promise<CatalogModel[]> {
  if (!fid) return [];
  const rows = raw(await fetchAll(
    "load the generator catalogue",
    (o) => Vsb_generatorsService.getAll(o),
    {
      select: GENERATOR_SELECT,
      filter: gtDate(GENERATOR_COL.earliestPhaseout, fid.slice(0, 10)),
      orderBy: [`${GENERATOR_COL.displayName} asc`],
    },
  ));
  return rows.map(toModel);
}

/** The `Generator` rows of the project's WTG types (`ThisItem.Generator.…` on the cards). */
export async function listGeneratorsByIds(ids: readonly string[]): Promise<CatalogModel[]> {
  const out: CatalogModel[] = [];
  for (const part of chunk([...new Set(ids)])) {
    const rows = raw(await fetchAll(
      "load the project's generator models",
      (o) => Vsb_generatorsService.getAll(o),
      { select: GENERATOR_SELECT, filter: idIn(GENERATOR_COL.id, part) },
    ));
    out.push(...rows.map(toModel));
  }
  return out;
}

/* ═════════════════════════════════════════════════════ WTG types and turbines ══ */

/** `Sort(Filter(GeneratorTypeInProjects, Project = …), 'Created On', Ascending)` (Y:63). */
export async function listGeneratorTypes(projectId: string): Promise<GeneratorTypeRow[]> {
  const rows = raw(await fetchAll(
    "load the project's generator types",
    (o) => Vsb_generatortypeinprojectsService.getAll(o),
    {
      select: [
        GEN_TYPE_COL.id, GEN_TYPE_COL.name, GEN_TYPE_COL.generator, GEN_TYPE_COL.numberOfGenerators,
        GEN_TYPE_COL.costPerWtg, GEN_TYPE_COL.generatorsCost, GEN_TYPE_COL.generatorsCapacity,
        GEN_TYPE_COL.requestPermissionState, GEN_TYPE_COL.flowRunId, GEN_TYPE_COL.flowApprovalId,
        "statecode", "createdon",
      ],
      filter: lookupEq("vsb_project", projectId),
      orderBy: ["createdon asc"],
    },
  ));
  return rows.map((r) => ({
    id: String(r[GEN_TYPE_COL.id]),
    name: str(r[GEN_TYPE_COL.name]),
    generatorId: str(r[GEN_TYPE_COL.generator]),
    generatorDisplayName: str(r[`${GEN_TYPE_COL.generator}@OData.Community.Display.V1.FormattedValue`]),
    numberOfGenerators: num(r[GEN_TYPE_COL.numberOfGenerators]),
    costPerWtg: num(r[GEN_TYPE_COL.costPerWtg]),
    generatorsCost: num(r[GEN_TYPE_COL.generatorsCost]),
    generatorsCapacity: num(r[GEN_TYPE_COL.generatorsCapacity]),
    requestPermissionState: num(r[GEN_TYPE_COL.requestPermissionState]),
    flowRunId: str(r[GEN_TYPE_COL.flowRunId]),
    flowApprovalId: str(r[GEN_TYPE_COL.flowApprovalId]),
    status: num(r.statecode) ?? 0,
    specificCapacity: null,
  }));
}

const TURBINE_SELECT = [
  GEN_INSTANCE_COL.id, GEN_INSTANCE_COL.name, GEN_INSTANCE_COL.moduleTypeInProject,
  GEN_INSTANCE_COL.effectiveCapacity, GEN_INSTANCE_COL.effectiveHubHeight,
  GEN_INSTANCE_COL.effectiveHubHeightChanged, GEN_INSTANCE_COL.foundationPlinth,
  GEN_INSTANCE_COL.hubHeightExclPlinth, GEN_INSTANCE_COL.totalHeight, "statecode",
];

/**
 * `colGeneratorsInProjectsTemporary` (Y:63): every `GeneratorInProjects` row of the project's WTG
 * types — the whole project, because the next turbine index and the duplicate-name check are
 * project-wide. `Index = Value(Last(Split(Name, "_")))`.
 */
export async function listProjectTurbines(typeIds: readonly string[]): Promise<TurbineRow[]> {
  const out: TurbineRow[] = [];
  for (const part of chunk(typeIds)) {
    const rows = raw(await fetchAll(
      "load the project's turbines",
      (o) => Vsb_generatorinprojectsService.getAll(o),
      { select: TURBINE_SELECT, filter: lookupIn("vsb_moduletypeinprojectid", part) },
    ));
    out.push(...rows.map((r) => ({
      id: String(r[GEN_INSTANCE_COL.id]),
      name: str(r[GEN_INSTANCE_COL.name]),
      typeId: str(r[GEN_INSTANCE_COL.moduleTypeInProject]),
      index: turbineIndex(str(r[GEN_INSTANCE_COL.name])),
      effectiveCapacity: num(r[GEN_INSTANCE_COL.effectiveCapacity]),
      effectiveHubHeight: num(r[GEN_INSTANCE_COL.effectiveHubHeight]),
      effectiveHubHeightChanged: bool(r[GEN_INSTANCE_COL.effectiveHubHeightChanged]) === true,
      foundationPlinth: num(r[GEN_INSTANCE_COL.foundationPlinth]),
      hubHeightExclPlinth: num(r[GEN_INSTANCE_COL.hubHeightExclPlinth]),
      totalHeight: num(r[GEN_INSTANCE_COL.totalHeight]),
      status: num(r.statecode) ?? 0,
    })));
  }
  return out;
}

/* ═══════════════════════════════════════════════════════ the six other families ══ */

const blankRow = (id: string): SimpleTypeRow => ({
  id, name: null, supplier: null, otherSupplier: null, capacity: null, cost: null, moduleLabel: null,
  degradation1stYear: null, degradationRemainingYears: null, requestPermissionState: null,
  flowRunId: null, flowApprovalId: null, status: 0,
});

/** `colPVModulesSuppliers` (App:1506) — the `PVModules` catalogue the Supplier combobox offers. */
export async function listPvModules(): Promise<PvModuleOption[]> {
  const rows = raw(await fetchAll(
    "load the PV module catalogue",
    (o) => Vsb_pvmodulesService.getAll(o),
    { select: ["vsb_pvmoduleid", "vsb_displayname", "vsb_supplier"], orderBy: ["vsb_displayname asc"] },
  ));
  return rows.map((r) => ({ id: String(r.vsb_pvmoduleid), displayName: str(r.vsb_displayname), supplier: str(r.vsb_supplier) }));
}

/**
 * `SortByColumns(Filter(PVModuleTypeInProjects, Project = …), "createdon", Ascending, "vsb_name",
 * Ascending)` (Y:63). `PVModule.Supplier` is joined from the catalogue by the hook.
 */
export async function listPvTypes(projectId: string): Promise<SimpleTypeRow[]> {
  const rows = raw(await fetchAll(
    "load the project's PV module types",
    (o) => Vsb_pvmoduletypeinprojectsService.getAll(o),
    {
      select: [
        "vsb_pvmoduletypeinprojectid", "vsb_name", "vsb_label", "_vsb_pvmodule_value", "vsb_othersupplier",
        "vsb_capacity", "vsb_costperpower", "vsb_cost", "vsb_degradation1styear", "vsb_degradationremainingyears",
        "vsb_requestpermissionstate", "vsb_flowrunid", "vsb_flowapprovalid", "statecode",
      ],
      filter: lookupEq("vsb_project", projectId),
      orderBy: ["createdon asc", "vsb_name asc"],
    },
  ));
  return rows.map((r) => {
    const moduleId = str(r._vsb_pvmodule_value);
    return {
      ...blankRow(String(r.vsb_pvmoduletypeinprojectid)),
      name: str(r.vsb_name),
      moduleLabel: str(r.vsb_label),
      catalogueId: moduleId,
      otherSupplier: str(r.vsb_othersupplier),
      capacity: num(r.vsb_capacity),
      cost: num(r.vsb_cost),
      degradation1stYear: num(r.vsb_degradation1styear),
      degradationRemainingYears: num(r.vsb_degradationremainingyears),
      requestPermissionState: num(r.vsb_requestpermissionstate),
      flowRunId: str(r.vsb_flowrunid),
      flowApprovalId: str(r.vsb_flowapprovalid),
      status: num(r.statecode) ?? 0,
    };
  });
}

/** `Supplier` (`vsb_tier1supplier`) of the inverter / substructure catalogue rows, by id. */
async function catalogueSuppliers(
  kind: "inverter" | "substructure", ids: readonly string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (const part of chunk([...new Set(ids)])) {
    const rows: Raw[] = kind === "inverter"
      ? raw(await fetchAll("load the inverter catalogue", (o) => Vsb_invertersService.getAll(o),
        { select: ["vsb_inverterid", "vsb_tier1supplier"], filter: idIn("vsb_inverterid", part) }))
      : raw(await fetchAll("load the substructure catalogue", (o) => Vsb_substructuresService.getAll(o),
        { select: ["vsb_substructureid", "vsb_tier1supplier"], filter: idIn("vsb_substructureid", part) }));
    for (const r of rows) out.set(String(r[kind === "inverter" ? "vsb_inverterid" : "vsb_substructureid"]), str(r.vsb_tier1supplier));
  }
  return out;
}

/** `Filter(InverterTypeInProjects, Project = …)` (Y:63, unsorted) with `Inverter.Supplier`. */
export async function listInverterTypes(projectId: string): Promise<SimpleTypeRow[]> {
  const rows = raw(await fetchAll(
    "load the project's inverter types",
    (o) => Vsb_invertertypeinprojectsService.getAll(o),
    {
      select: [
        "vsb_invertertypeinprojectid", "vsb_name", "vsb_inverterlabel", "_vsb_inverter_value", "vsb_invothersupplier",
        "vsb_selectedinvertertypes", "vsb_numberofinverters", "vsb_inverternominalpower", "vsb_costperinverter",
        "vsb_invertertypecost", "vsb_inverterwarranty", "vsb_requestpermissionstate", "vsb_flowrunid",
        "vsb_flowapprovalid", "statecode",
      ],
      filter: lookupEq("vsb_project", projectId),
    },
  ));
  const suppliers = await catalogueSuppliers("inverter", rows.map((r) => str(r._vsb_inverter_value)).filter((v): v is string => !!v));
  return rows.map((r) => {
    const catalogueId = str(r._vsb_inverter_value);
    return {
      ...blankRow(String(r.vsb_invertertypeinprojectid)),
      name: str(r.vsb_inverterlabel) ?? str(r.vsb_name),
      label: str(r.vsb_inverterlabel),
      catalogueId,
      catalogueSupplier: catalogueId ? suppliers.get(catalogueId) ?? null : null,
      otherSupplier: str(r.vsb_invothersupplier),
      typeLabels: multiSelectValues(r.vsb_selectedinvertertypes).map((v) => INVERTER_TYPE_LABELS[v] ?? String(v)),
      typeValues: multiSelectValues(r.vsb_selectedinvertertypes),
      numberOfInverters: num(r.vsb_numberofinverters),
      nominalPower: num(r.vsb_inverternominalpower),
      costPerInverter: num(r.vsb_costperinverter),
      cost: num(r.vsb_invertertypecost),
      warranty: num(r.vsb_inverterwarranty),
      requestPermissionState: num(r.vsb_requestpermissionstate),
      flowRunId: str(r.vsb_flowrunid),
      flowApprovalId: str(r.vsb_flowapprovalid),
      status: num(r.statecode) ?? 0,
    };
  });
}

/** `Filter(SubstructureTypeInProjects, Project = …)` (Y:63, unsorted) with `Substructure.Supplier`. */
export async function listSubstructureTypes(projectId: string): Promise<SimpleTypeRow[]> {
  const rows = raw(await fetchAll(
    "load the project's substructure types",
    (o) => Vsb_substructuretypeinprojectsService.getAll(o),
    {
      select: [
        "vsb_substructuretypeinprojectid", "vsb_name", "vsb_substructurelabel", "_vsb_substructure_value",
        "vsb_substrothersupplier", "vsb_selectedsubstructuretypes", "vsb_substructurecost",
        "vsb_requestpermissionstate", "vsb_flowrunid", "vsb_flowapprovalid", "statecode",
      ],
      filter: lookupEq("vsb_project", projectId),
    },
  ));
  const suppliers = await catalogueSuppliers("substructure", rows.map((r) => str(r._vsb_substructure_value)).filter((v): v is string => !!v));
  return rows.map((r) => {
    const catalogueId = str(r._vsb_substructure_value);
    return {
      ...blankRow(String(r.vsb_substructuretypeinprojectid)),
      name: str(r.vsb_substructurelabel) ?? str(r.vsb_name),
      label: str(r.vsb_substructurelabel),
      catalogueId,
      catalogueSupplier: catalogueId ? suppliers.get(catalogueId) ?? null : null,
      otherSupplier: str(r.vsb_substrothersupplier),
      typeLabels: multiSelectValues(r.vsb_selectedsubstructuretypes).map((v) => SUBSTRUCTURE_TYPE_LABELS[v] ?? String(v)),
      typeValues: multiSelectValues(r.vsb_selectedsubstructuretypes),
      cost: num(r.vsb_substructurecost),
      requestPermissionState: num(r.vsb_requestpermissionstate),
      flowRunId: str(r.vsb_flowrunid),
      flowApprovalId: str(r.vsb_flowapprovalid),
      status: num(r.statecode) ?? 0,
    };
  });
}

/**
 * The `Inverters` / `Substructures` catalogues the G9 panels' Supplier comboboxes offer (App:1520-1547,
 * `ClearCollect(colInverterSuppliers, …)` / `colSubstructuresSuppliers`) — the whole catalogue, as the
 * canvas reads it; `plantSupplierOptions` (rules) orders it and keeps the canvas' Other Supplier rows.
 */
export async function listPlantSupplierCatalogue(kind: "inverter" | "substructure"): Promise<PlantSupplierOption[]> {
  if (kind === "inverter") {
    const rows = raw(await fetchAll(
      "load the inverter catalogue",
      (o) => Vsb_invertersService.getAll(o),
      { select: ["vsb_inverterid", "vsb_tier1supplier", "vsb_invertertypes"] },
    ));
    return rows.map((r) => ({ id: String(r.vsb_inverterid), supplier: str(r.vsb_tier1supplier), typeValues: multiSelectValues(r.vsb_invertertypes) }));
  }
  const rows = raw(await fetchAll(
    "load the substructure catalogue",
    (o) => Vsb_substructuresService.getAll(o),
    { select: ["vsb_substructureid", "vsb_tier1supplier", "vsb_substructuretypes"] },
  ));
  return rows.map((r) => ({ id: String(r.vsb_substructureid), supplier: str(r.vsb_tier1supplier), typeValues: multiSelectValues(r.vsb_substructuretypes) }));
}

/** BESS / Hydrogen / Substation — `Filter(<T>, Project = …)` (Y:63, unsorted). */
export async function listSimpleTypes(
  family: "storage" | "hydrogen" | "substation", projectId: string,
): Promise<SimpleTypeRow[]> {
  if (family === "storage") {
    const rows = raw(await fetchAll(
      "load the project's BESS types",
      (o) => Vsb_storagetypeinprojectsService.getAll(o),
      {
        select: ["vsb_storagetypeinprojectid", "vsb_name", "vsb_supplier", "vsb_storagecapacitydec", "crc36_energycapacitymwh", "statecode"],
        filter: lookupEq("vsb_project", projectId),
      },
    ));
    return rows.map((r) => ({
      ...blankRow(String(r.vsb_storagetypeinprojectid)),
      name: str(r.vsb_name), supplier: str(r.vsb_supplier), capacity: num(r.vsb_storagecapacitydec),
      energyCapacity: num(r.crc36_energycapacitymwh), status: num(r.statecode) ?? 0,
    }));
  }
  if (family === "hydrogen") {
    const rows = raw(await fetchAll(
      "load the project's hydrogen types",
      (o) => Vsb_hydrogentypeinprojectsService.getAll(o),
      {
        select: ["vsb_hydrogentypeinprojectid", "vsb_name", "vsb_supplier", "vsb_hydrogencapacitydec", "statecode"],
        filter: lookupEq("vsb_project", projectId),
      },
    ));
    return rows.map((r) => ({
      ...blankRow(String(r.vsb_hydrogentypeinprojectid)),
      name: str(r.vsb_name), supplier: str(r.vsb_supplier), capacity: num(r.vsb_hydrogencapacitydec),
      status: num(r.statecode) ?? 0,
    }));
  }
  const rows = raw(await fetchAll(
    "load the project's substation types",
    (o) => Vsb_substationtypeinprojectsService.getAll(o),
    {
      select: ["vsb_substationtypeinprojectid", "vsb_name", "vsb_supplier", "vsb_substationcapacitydec", "statecode"],
      filter: lookupEq("vsb_project", projectId),
    },
  ));
  return rows.map((r) => ({
    ...blankRow(String(r.vsb_substationtypeinprojectid)),
    name: str(r.vsb_name), supplier: str(r.vsb_supplier), capacity: num(r.vsb_substationcapacitydec),
    status: num(r.statecode) ?? 0,
  }));
}

/* ═══════════════════════════════════════════════════════════════ reference data ══ */

export interface DeviceCosts {
  modules: number | null;
  inverter: number | null;
  mountingFix: number | null;
  mountingTracker: number | null;
}

/**
 * `gblDiviceCoststConstants` (Y:63): `Value(LookUp(colDeviceCosts, 'Device Type' = "<type>").'Device
 * Cost [EUR/MWp]')` over `ClearCollect(colDeviceCosts, 'Device Costs')` — the FIRST row of each type,
 * from any country. DIVERGENCE (D27): the project country's row wins when it has one; otherwise the
 * first row of any country, as the canvas (Q6). The read is narrowed to the four types (rule 2).
 */
export async function loadDeviceCosts(countryId: string | null): Promise<DeviceCosts> {
  const types = Object.values(DEVICE_TYPE);
  const rows = raw(await fetchAll(
    "load the device costs",
    (o) => Vsb_devicecostsService.getAll(o),
    {
      select: ["vsb_devicecostid", "vsb_devicetype", "vsb_devicecostcurrency", "_vsb_country_value"],
      filter: or(...types.map((t) => eq("vsb_devicetype", t))),
      orderBy: ["createdon asc"],
    },
  ));
  const pick = (type: string): number | null => {
    const ofType = rows.filter((r) => r.vsb_devicetype === type);
    const own = countryId ? ofType.find((r) => str(r._vsb_country_value)?.toLowerCase() === countryId.toLowerCase()) : undefined;
    return num((own ?? ofType[0])?.vsb_devicecostcurrency);
  };
  return {
    modules: pick(DEVICE_TYPE.modules),
    inverter: pick(DEVICE_TYPE.inverter),
    mountingFix: pick(DEVICE_TYPE.mountingFix),
    mountingTracker: pick(DEVICE_TYPE.mountingTracker),
  };
}

/** `Filter('Land Lease Project Costs', Project = …, AllWTGAllocated = Yes)` (Y:17510). */
export async function listAllWtgLandLeaseCosts(projectId: string): Promise<LandLeaseCostRow[]> {
  const rows = raw(await fetchAll(
    "load the project's all-WTG land-lease costs",
    (o) => Vsb_landleaseprojectcostsService.getAll(o),
    {
      select: ["vsb_landleaseprojectcostid", "vsb_landowner", "vsb_description", "vsb_allwtgallocated"],
      filter: and(lookupEq("vsb_project", projectId), eq("vsb_allwtgallocated", true)),
    },
  ));
  return rows.map((r) => ({
    id: String(r.vsb_landleaseprojectcostid),
    landOwner: str(r.vsb_landowner),
    description: str(r.vsb_description),
    allWtgAllocated: bool(r.vsb_allwtgallocated) === true,
  }));
}

/* ═══════════════════════════════════════════════ reads a write plan needs at run time ══ */

/** The autonumber `vsb_name` of a type created a moment ago (`WTG-…` / `PVT-…`). */
export async function loadTypeName(family: "wtg" | "pv", id: string): Promise<string> {
  const rows = family === "wtg"
    ? raw(await fetchPage("read the new generator type", (o) => Vsb_generatortypeinprojectsService.getAll(o),
      { select: ["vsb_generatortypeinprojectid", "vsb_name"], filter: `vsb_generatortypeinprojectid eq ${guid(id)}`, top: 1 }))
    : raw(await fetchPage("read the new PV module type", (o) => Vsb_pvmoduletypeinprojectsService.getAll(o),
      { select: ["vsb_pvmoduletypeinprojectid", "vsb_name"], filter: `vsb_pvmoduletypeinprojectid eq ${guid(id)}`, top: 1 }));
  return str(rows[0]?.vsb_name) ?? "";
}

/**
 * The `DeviceTypesInProjects` rows of a type (`LookUp(DeviceTypesInProjects, TypeInProject = …)`,
 * Y:65), oldest first — `First(<type>.DeviceTypesInProjects)` is the bridge the O&M costs point at.
 */
export async function listDeviceTypes(typeId: string): Promise<{ id: string; active: boolean }[]> {
  const rows = raw(await fetchAll(
    "load the type's O&M device types",
    (o) => Vsb_devicetypesinprojectsService.getAll(o),
    { select: ["vsb_devicetypesinprojectid", "statecode"], filter: lookupEq("vsb_typeinprojectid", typeId), orderBy: ["createdon asc"] },
  ));
  return rows.map((r) => ({ id: String(r.vsb_devicetypesinprojectid), active: num(r.statecode) === 0 }));
}

/** `Filter('Opex Project Costs', DeviceTypeInProject = <bridge>, Project = …)` — ids, any status (Y:15634). */
export async function listOpexCostIds(projectId: string, deviceTypeId: string, activeOnly = false): Promise<string[]> {
  const rows = raw(await fetchAll(
    "load the type's O&M costs",
    (o) => Vsb_opexprojectcostsService.getAll(o),
    {
      select: ["vsb_opexprojectcostid"],
      filter: and(lookupEq("vsb_project", projectId), lookupEq("vsb_devicetypeinproject", deviceTypeId), activeOnly && ACTIVE),
      ...(activeOnly ? { top: 1 } : {}),
    },
  ));
  return rows.map((r) => String(r.vsb_opexprojectcostid));
}

/** Reads of `listOpexCostIdsForBridges` in flight at once (review F3 item 5; a project with many bridge rows is chunked at 40). */
export const OPEX_READ_CONCURRENCY = 4;

/**
 * The project's O&M costs of ALL the given bridge rows (DEL-3, S7): every `Opex Project Costs` row whose
 * `DeviceTypeInProject` is one of `bridgeIds` (any status, as `listOpexCostIds`), plus the chain members
 * of those rows — costs whose `vsb_parentcost` is one of them (a head's later periods). Server-filtered
 * (rule 2), `$select` of the id and `_vsb_parentcost_value` only (rule 1), the bridge and the head filters
 * chunked at `CHUNK` (40) ids. Ids are de-duplicated; heads first, then their chain members.
 * No bridge: no read, no ids. The chunk reads run through a pool of `OPEX_READ_CONCURRENCY` (4).
 *
 * DIVERGENCE: the canvas follows only `First(<type>.DeviceTypesInProjects)` (Y:65), the oldest bridge row, so the O&M costs of any
 * further bridge row of the type are neither found nor deleted with it. This app returns the costs of ALL the given bridge rows
 * (D116; delete hardening plan claim 2, scenario S7), so a type delete leaves no O&M cost pointing at a deleted bridge.
 */
export async function listOpexCostIdsForBridges(projectId: string, bridgeIds: readonly string[]): Promise<string[]> {
  const bridges = [...new Set(bridgeIds)];
  if (bridges.length === 0) return [];
  const read = async (operation: string, column: string, ids: readonly string[]): Promise<Raw[]> => {
    // Review F3 item 5: a bounded pool (never more than `OPEX_READ_CONCURRENCY` reads in flight), results in chunk order.
    const pages = await mapLimit(chunk(ids), (part) => fetchAll(
      operation,
      (o) => Vsb_opexprojectcostsService.getAll(o),
      {
        select: ["vsb_opexprojectcostid", "_vsb_parentcost_value"],
        filter: and(lookupEq("vsb_project", projectId), lookupIn(column, part)),
      },
    ), OPEX_READ_CONCURRENCY);
    return raw(pages.flat());
  };
  const heads = await read("load the type's O&M costs", "vsb_devicetypeinproject", bridges);
  const headIds = [...new Set(heads.map((r) => String(r.vsb_opexprojectcostid)))];
  const members = headIds.length > 0 ? await read("load the type's O&M cost chains", "vsb_parentcost", headIds) : [];
  return [...new Set([...headIds, ...members.map((r) => String(r.vsb_opexprojectcostid))])];
}

/** Does any ACTIVE O&M cost of the project point at one of these bridge rows? (`top: 1`, stops at the first hit.) */
async function hasActiveOpexCostOn(projectId: string, bridgeIds: readonly string[]): Promise<boolean> {
  for (const part of chunk(bridgeIds)) {
    const rows = raw(await fetchPage(
      "check the type's O&M costs",
      (o) => Vsb_opexprojectcostsService.getAll(o),
      {
        select: ["vsb_opexprojectcostid"],
        filter: and(lookupEq("vsb_project", projectId), lookupIn("vsb_devicetypeinproject", part), ACTIVE),
        top: 1,
      },
    ));
    if (rows.length > 0) return true;
  }
  return false;
}

/**
 * 1.21.753's O&M guard inputs (`capacityGuardReason`): an ACTIVE bridge of the type, and an ACTIVE
 * `Opex Project Costs` row of the project pointing at it. DEL-3: ANY active bridge, not only the first
 * (S7) — a dependency on the second active bridge blocks as well.
 *
 * DIVERGENCE: the canvas checks only the first bridge row of the type (`First(<type>.DeviceTypesInProjects)`, Y:65). This app checks
 * ALL active bridge rows (D116; delete hardening plan claim 2, scenario S7), so the guard cannot be passed by a dependency on a later bridge.
 */
export async function loadOpexDependency(
  projectId: string, typeId: string,
): Promise<{ hasActiveDeviceType: boolean; hasActiveOpexCost: boolean }> {
  const active = (await listDeviceTypes(typeId)).filter((d) => d.active);
  if (active.length === 0) return { hasActiveDeviceType: false, hasActiveOpexCost: false };
  return { hasActiveDeviceType: true, hasActiveOpexCost: await hasActiveOpexCostOn(projectId, active.map((d) => d.id)) };
}

/** The PV type's unit — `LookUp(GeneratorInProjects, ModuleTypeInProject = <PV type>)` (Y:8043). */
export async function findPvUnit(pvTypeId: string): Promise<string | null> {
  const rows = raw(await fetchPage(
    "find the PV type's unit",
    (o) => Vsb_generatorinprojectsService.getAll(o),
    { select: [GEN_INSTANCE_COL.id], filter: lookupEq("vsb_moduletypeinprojectid", pvTypeId), top: 1 },
  ));
  return rows[0] ? String(rows[0][GEN_INSTANCE_COL.id]) : null;
}

/**
 * The land-lease allocations of some turbines, and how many allocations each of their costs has
 * in all (`CountRows(Filter('Land Lease Allocation WTGS', 'Project Cost' = …))`, Y:15812).
 */
export async function loadTurbineAllocations(turbineIds: readonly string[]): Promise<{
  allocations: { id: string; costId: string; turbineId: string }[];
  countByCost: Record<string, number>;
}> {
  const allocations: { id: string; costId: string; turbineId: string }[] = [];
  for (const part of chunk(turbineIds)) {
    const rows = raw(await fetchAll(
      "load the turbines' land-lease allocations",
      (o) => Vsb_landleaseallocationwtgsService.getAll(o),
      { select: ["vsb_landleaseallocationwtgid", "_vsb_projectcost_value", "_vsb_generatorinproject_value"], filter: lookupIn("vsb_generatorinproject", part) },
    ));
    for (const r of rows) {
      const costId = str(r._vsb_projectcost_value);
      if (costId) allocations.push({ id: String(r.vsb_landleaseallocationwtgid), costId, turbineId: String(r._vsb_generatorinproject_value) });
    }
  }
  const countByCost: Record<string, number> = {};
  for (const part of chunk([...new Set(allocations.map((a) => a.costId))])) {
    const rows = raw(await fetchAll(
      "count the land-lease costs' allocations",
      (o) => Vsb_landleaseallocationwtgsService.getAll(o),
      { select: ["vsb_landleaseallocationwtgid", "_vsb_projectcost_value"], filter: lookupIn("vsb_projectcost", part) },
    ));
    for (const r of rows) {
      const c = String(r._vsb_projectcost_value);
      countByCost[c] = (countByCost[c] ?? 0) + 1;
    }
  }
  return { allocations, countByCost };
}
