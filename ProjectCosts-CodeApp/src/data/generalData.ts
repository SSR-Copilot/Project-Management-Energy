/**
 * Project General Data — the Dataverse reads behind `features/pm/general-data` (connected
 * 19 Oct 2026, D25).
 *
 * Every read is server-filtered (CONVENTIONS rule 2) and names its `$select` (rule 1); the canvas
 * `OnVisible` / `App.OnStart` `ClearCollect`s it replaces are cited per function. Five tables were
 * registered for this screen with `pac code add-data-source`: `vsb_projectstatetracking`,
 * `vsb_shareholderentitiy`, `vsb_customchoicevalue`, `vsb_assumptionslocaltaxgermany` and
 * `vsb_assumptionslocaltaxfrance` (all Dataverse tables, not Fabric SQL).
 *
 * The people search and the persona lookups reuse `data/adminGatesApprovals.ts`
 * (`searchEntraPeople`, `getEntraPeople`); the milestone durations reuse `data/costBook.ts`
 * (`loadMilestoneDurations`).
 */
import { Vsb_projectsService } from "@/generated/services/Vsb_projectsService";
import { Vsb_countriesService } from "@/generated/services/Vsb_countriesService";
import { Vsb_countryareasService } from "@/generated/services/Vsb_countryareasService";
import { Vsb_projectstatesService } from "@/generated/services/Vsb_projectstatesService";
import { Vsb_customchoicevaluesService } from "@/generated/services/Vsb_customchoicevaluesService";
import { Vsb_shareholderentitiiesService } from "@/generated/services/Vsb_shareholderentitiiesService";
import { Vsb_projectstatetrackingsService } from "@/generated/services/Vsb_projectstatetrackingsService";
import { Vsb_assumptionslocaltaxgermaniesService } from "@/generated/services/Vsb_assumptionslocaltaxgermaniesService";
import { Vsb_assumptionslocaltaxfrancesService } from "@/generated/services/Vsb_assumptionslocaltaxfrancesService";
import {
  PROJECT_COL, SHAREHOLDER_COL, TRACKING_COL,
  type CountryRef, type ProjectRow, type ProjectStateRef, type ShareholdingEntity, type TrackingRow,
} from "@/features/pm/general-data/rules";
import { fetchAll, fetchPage } from "./client";
import { and, contains, eq, guid, isNull, lookupEq, numberOf, or, startsWith } from "./odata";

/** `<col>@OData.Community.Display.V1.FormattedValue` — a lookup's name. */
const formatted = (col: string): string => `${col}@OData.Community.Display.V1.FormattedValue`;

type Raw = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => numberOf(v) ?? null;
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

/* ═══════════════════════════════════════════════════════════════ the project ══ */

const PROJECT_SELECT = [
  PROJECT_COL.id, PROJECT_COL.projectNumber, PROJECT_COL.internalProjectId, PROJECT_COL.name,
  PROJECT_COL.originalProjectName, PROJECT_COL.shortName, PROJECT_COL.projectType,
  PROJECT_COL.spvName, PROJECT_COL.spvCompanyCode, PROJECT_COL.spvLegalStructure,
  "_vsb_country_value", "_vsb_countryarea_value", PROJECT_COL.district, PROJECT_COL.municipality,
  "_vsb_terrainutilizationlookup_value", PROJECT_COL.terrainSize, PROJECT_COL.latitude,
  PROJECT_COL.longitude, PROJECT_COL.technology, PROJECT_COL.approvalState, "statecode",
  "_vsb_clusterstate_value", PROJECT_COL.taxFactor, "_owningbusinessunit_value",
  PROJECT_COL.shareOfFarmdown, PROJECT_COL.isStandardShareOfFarmdown, PROJECT_COL.standardCostCreated,
  PROJECT_COL.developmentType, PROJECT_COL.startCluster, PROJECT_COL.acquisitionDate,
  PROJECT_COL.acquisitionPrice, "_vsb_projectmanager_value", "_vsb_deputyprojectmanagerentra_value",
  PROJECT_COL.projectStartDate, PROJECT_COL.feasibilityStudies, PROJECT_COL.projectDevelopmentStarted,
  PROJECT_COL.applicationSubmitted, PROJECT_COL.legallyBindingPermits, PROJECT_COL.fid,
  PROJECT_COL.construction, PROJECT_COL.cod,
  "_createdby_value", "createdon", "_modifiedby_value", "modifiedon",
];

/** `Set(gblRecordSelectedProject, LookUp(Projects, Project = …))` (`OnVisible`, Y:21-27). */
export async function loadGeneralDataProject(projectId: string): Promise<ProjectRow | null> {
  const rows = await fetchPage(
    "load the project's general data",
    (o) => Vsb_projectsService.getAll(o),
    { select: PROJECT_SELECT, filter: `${PROJECT_COL.id} eq ${guid(projectId)}`, top: 1 },
  );
  const r = rows[0] as unknown as Raw | undefined;
  if (!r) return null;
  return {
    id: String(r[PROJECT_COL.id]),
    projectNumber: str(r[PROJECT_COL.projectNumber]),
    internalProjectId: str(r[PROJECT_COL.internalProjectId]),
    projectName: str(r[PROJECT_COL.name]),
    originalProjectName: str(r[PROJECT_COL.originalProjectName]),
    shortName: str(r[PROJECT_COL.shortName]),
    projectType: num(r[PROJECT_COL.projectType]),
    spvName: str(r[PROJECT_COL.spvName]),
    spvCompanyCode: num(r[PROJECT_COL.spvCompanyCode]),
    spvLegalStructure: num(r[PROJECT_COL.spvLegalStructure]),
    countryId: str(r._vsb_country_value),
    areaId: str(r._vsb_countryarea_value),
    district: str(r[PROJECT_COL.district]),
    municipality: str(r[PROJECT_COL.municipality]),
    utilizationId: str(r._vsb_terrainutilizationlookup_value),
    terrainSize: num(r[PROJECT_COL.terrainSize]),
    latitude: num(r[PROJECT_COL.latitude]),
    longitude: num(r[PROJECT_COL.longitude]),
    technology: num(r[PROJECT_COL.technology]),
    approvalState: num(r[PROJECT_COL.approvalState]),
    statecode: num(r.statecode),
    clusterStateId: str(r._vsb_clusterstate_value),
    clusterStateName: str(r[formatted("_vsb_clusterstate_value")]),
    taxFactor: num(r[PROJECT_COL.taxFactor]),
    owningBusinessUnitId: str(r._owningbusinessunit_value),
    shareOfFarmdown: num(r[PROJECT_COL.shareOfFarmdown]),
    isStandardShareOfFarmdown: bool(r[PROJECT_COL.isStandardShareOfFarmdown]),
    standardCostCreated: bool(r[PROJECT_COL.standardCostCreated]),
    developmentType: num(r[PROJECT_COL.developmentType]),
    startCluster: num(r[PROJECT_COL.startCluster]),
    acquisitionDate: str(r[PROJECT_COL.acquisitionDate]),
    acquisitionPrice: num(r[PROJECT_COL.acquisitionPrice]),
    managerId: str(r._vsb_projectmanager_value),
    managerName: str(r[formatted("_vsb_projectmanager_value")]),
    deputyManagerId: str(r._vsb_deputyprojectmanagerentra_value),
    deputyManagerName: str(r[formatted("_vsb_deputyprojectmanagerentra_value")]),
    projectStartDate: str(r[PROJECT_COL.projectStartDate]),
    feasibilityStudies: str(r[PROJECT_COL.feasibilityStudies]),
    projectDevelopmentStarted: str(r[PROJECT_COL.projectDevelopmentStarted]),
    applicationSubmitted: str(r[PROJECT_COL.applicationSubmitted]),
    legallyBindingPermits: str(r[PROJECT_COL.legallyBindingPermits]),
    fid: str(r[PROJECT_COL.fid]),
    construction: str(r[PROJECT_COL.construction]),
    cod: str(r[PROJECT_COL.cod]),
    createdByName: str(r[formatted("_createdby_value")]),
    createdOn: str(r.createdon),
    modifiedByName: str(r[formatted("_modifiedby_value")]),
    modifiedOn: str(r.modifiedon),
  };
}

/* ═══════════════════════════════════════════════════════════ reference data ══ */

/** `Countries` — the Country dropdown, with `Key` and both business-unit columns (Y:3180-3206). */
export async function listGeneralDataCountries(): Promise<CountryRef[]> {
  const rows = await fetchAll(
    "list countries",
    (o) => Vsb_countriesService.getAll(o),
    { select: ["vsb_countryid", "vsb_name", "vsb_title", "_owningbusinessunit_value", "_vsb_businessunit_value"] },
  );
  return rows
    .map((r) => {
      const x = r as unknown as Raw;
      return {
        id: r.vsb_countryid,
        name: r.vsb_name ?? "",
        key: str(x.vsb_title),
        besitzerBusinessUnitId: str(x._owningbusinessunit_value),
        businessUnitId: str(x._vsb_businessunit_value),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** A `CountryAreas` option. */
export interface AreaOption { id: string; name: string; countryId: string | null }

/** `Filter(CountryAreas, Country = drp_…_Country.Selected)` (Y:3366-3370). */
export async function listCountryAreas(countryId: string): Promise<AreaOption[]> {
  const rows = await fetchAll(
    "list the areas of a country",
    (o) => Vsb_countryareasService.getAll(o),
    { select: ["vsb_countryareaid", "vsb_name", "_vsb_areascountry_value"], filter: lookupEq("vsb_areascountry", countryId) },
  );
  return rows
    .map((r) => ({ id: r.vsb_countryareaid, name: r.vsb_name ?? "", countryId: r._vsb_areascountry_value ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** `'Project States'` — the panel labels and the tracking rebuild (Y:223-235, Y:5253). */
export async function listProjectStates(): Promise<ProjectStateRef[]> {
  const rows = await fetchAll(
    "list project states",
    (o) => Vsb_projectstatesService.getAll(o),
    { select: ["vsb_projectstateid", "vsb_name", "vsb_order", "vsb_isvisibleonchecklist", "vsb_clusterdescription"] },
  );
  return rows
    .map((r) => ({
      id: r.vsb_projectstateid,
      name: r.vsb_name ?? "",
      order: typeof r.vsb_order === "number" ? r.vsb_order : 0,
      isVisibleOnChecklist: r.vsb_isvisibleonchecklist === true,
      clusterDescription: r.vsb_clusterdescription ?? null,
    }))
    .sort((a, b) => a.order - b.order);
}

/** A `Custom Choice Values` terrain-utilization option. */
export interface UtilizationOption { id: string; label: string; order: number }

/**
 * `drp_…_TerrainUt.Items` (Y:3888-3905) — `Sort(Filter(colCustomChoiceValues, vsb_fieldname =
 * "vsb_terrainutilization" And (IsBlank(vsb_Country) Or IsBlank(selected) Or vsb_Country =
 * selected)), vsb_order)`, filtered on the server.
 */
export async function listTerrainUtilizations(countryId: string | null): Promise<UtilizationOption[]> {
  const rows = await fetchAll(
    "list terrain utilization values",
    (o) => Vsb_customchoicevaluesService.getAll(o),
    {
      select: ["vsb_customchoicevalueid", "vsb_value", "vsb_order", "_vsb_country_value"],
      filter: and(
        eq("vsb_fieldname", "vsb_terrainutilization"),
        countryId ? or(isNull("_vsb_country_value"), lookupEq("vsb_country", countryId)) : undefined,
      ),
    },
  );
  return rows
    .map((r) => ({ id: r.vsb_customchoicevalueid, label: r.vsb_value ?? "", order: r.vsb_order ?? 0 }))
    .sort((a, b) => a.order - b.order);
}

/* ═════════════════════════════════════════════════════ project-scoped rows ══ */

/** `Filter(ShareholderEntityInProjects, Project = current)` (Y:171-184). */
export async function listShareholders(projectId: string): Promise<ShareholdingEntity[]> {
  const rows = await fetchAll(
    "list the project's shareholding entities",
    (o) => Vsb_shareholderentitiiesService.getAll(o),
    {
      select: [SHAREHOLDER_COL.id, SHAREHOLDER_COL.name, SHAREHOLDER_COL.entityType, SHAREHOLDER_COL.customName, SHAREHOLDER_COL.ownership],
      filter: lookupEq("vsb_project", projectId),
    },
  );
  return rows.map((r) => {
    const x = r as unknown as Raw;
    return {
      key: r.vsb_shareholderentitiyid,
      recordId: r.vsb_shareholderentitiyid,
      entityTypeValue: num(x[SHAREHOLDER_COL.entityType]),
      customName: r.vsb_customname ?? "",
      ownership: num(x[SHAREHOLDER_COL.ownership]) ?? 0,
    };
  });
}

/** `Filter('Project State Trackings', Project = current)` (Y:275-279, Y:784-790). */
export async function listStateTrackings(projectId: string): Promise<TrackingRow[]> {
  const rows = await fetchAll(
    "list the project's state trackings",
    (o) => Vsb_projectstatetrackingsService.getAll(o),
    {
      select: ["vsb_projectstatetrackingid", "_vsb_clusterstate_value", TRACKING_COL.approvalClusterState, TRACKING_COL.flowRunId],
      filter: lookupEq("vsb_project", projectId),
    },
  );
  return rows.map((r) => {
    const x = r as unknown as Raw;
    return {
      id: r.vsb_projectstatetrackingid,
      clusterStateId: r._vsb_clusterstate_value ?? "",
      approvalClusterState: num(x[TRACKING_COL.approvalClusterState]),
      flowRunId: str(x[TRACKING_COL.flowRunId]),
    };
  });
}

/* ═══════════════════════════════════════════════════════ local tax tables ══ */

/** A local-tax municipality row (Germany or France). */
export interface MunicipalityRow {
  uid: string;
  municipality: string;
  state: string | null;
  tradetaxrate: string | null;
}

/** One page of suggestions; the canvas combobox listed the whole filtered collection. */
export const MUNICIPALITY_SEARCH_TOP = 50;

/**
 * `cmb_…_Municipality_Germany.Items` (Y:3638-3651) — `SortByColumns(Search(Filter(
 * colAssumptionsGermanyTaxSQL, Trim(state) = Area.Selected.Name), Lower(text), municipality, uid),
 * "vsb_municipality")`. The `Trim` is applied after a server `startswith`.
 */
export async function searchGermanMunicipalities(areaName: string, term: string): Promise<MunicipalityRow[]> {
  const t = term.trim();
  const rows = await fetchPage(
    "search German municipalities",
    (o) => Vsb_assumptionslocaltaxgermaniesService.getAll(o),
    {
      select: ["vsb_assumptionslocaltaxgermanyid", "vsb_uid", "vsb_municipality", "vsb_state", "vsb_tradetaxrate"],
      filter: and(startsWith("vsb_state", areaName), t ? or(contains("vsb_municipality", t), contains("vsb_uid", t)) : undefined),
      orderBy: ["vsb_municipality asc"],
      top: MUNICIPALITY_SEARCH_TOP,
    },
  );
  return rows
    .filter((r) => (r.vsb_state ?? "").trim() === areaName)
    .map((r) => ({
      uid: r.vsb_uid ?? r.vsb_assumptionslocaltaxgermanyid,
      municipality: r.vsb_municipality ?? "",
      state: r.vsb_state ?? null,
      tradetaxrate: r.vsb_tradetaxrate ?? null,
    }));
}

/**
 * `cmb_…_Municipality_France_1.Items` (Y:3673-3692) — empty below three characters, else
 * `SortByColumns(Search(colAssumptionsFranceSQL, Lower(text), Municipality, uid),
 * "vsb_municipality", Ascending, "vsb_uid", Ascending)`.
 */
export async function searchFrenchMunicipalities(term: string): Promise<MunicipalityRow[]> {
  const rows = await fetchPage(
    "search French municipalities",
    (o) => Vsb_assumptionslocaltaxfrancesService.getAll(o),
    {
      select: ["vsb_assumptionslocaltaxfranceid", "vsb_uid", "vsb_municipality"],
      filter: or(contains("vsb_municipality", term), contains("vsb_uid", term)),
      orderBy: ["vsb_municipality asc", "vsb_uid asc"],
      top: MUNICIPALITY_SEARCH_TOP,
    },
  );
  return rows.map((r) => ({
    uid: r.vsb_uid ?? r.vsb_assumptionslocaltaxfranceid,
    municipality: r.vsb_municipality ?? "",
    state: null,
    tradetaxrate: null,
  }));
}

/**
 * `Value(LookUp(colAssumptionsGermanyTaxSQL, municipality = project.Municipality, tradetaxrate))` —
 * the Tax Factor default when the project has none (`OnVisible`, Y:187-200).
 */
export async function lookupGermanTradeTaxRate(municipality: string): Promise<string | null> {
  const rows = await fetchPage(
    "look up a German trade tax rate",
    (o) => Vsb_assumptionslocaltaxgermaniesService.getAll(o),
    { select: ["vsb_assumptionslocaltaxgermanyid", "vsb_tradetaxrate"], filter: eq("vsb_municipality", municipality), top: 1 },
  );
  return rows[0]?.vsb_tradetaxrate ?? null;
}
