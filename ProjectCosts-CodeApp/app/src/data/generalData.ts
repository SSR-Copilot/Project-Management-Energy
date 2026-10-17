/**
 * Project General Data — reads and writes against Dataverse.
 *
 * Canvas source: `Project General Data Screen.pa.yaml` (Project Management app). Full analysis
 * in `codeapp-knowledge-base/screens/project-general-data-screen/`; read
 * `04-data/01-dataverse-tables.md` and `04-data/02-operations-performed.md` before changing this
 * file — every field selected and every write here is cited there against a canvas line number.
 *
 * SCOPE OF THIS FILE (Phase 1 of the build — see the knowledge base's
 * `06-code-app-requirements/01-build-requirements.md`): Basic Information, Acquisition Details,
 * Placement (stored lat/long only, no interactive map or geocoding), and Shareholding Entities.
 * NOT in this file: the Cluster Change panel (gate-approval cancellation + the 7-row
 * `vsb_projectstatetrackings` rebuild), which is deliberately deferred — it carries real
 * approval-workflow risk and needs its own careful build. `vsb_projectdefaultapprovalses` and
 * `vsb_customchoicevalues` were registered as data sources for that future work and are not
 * used here yet.
 *
 * WRITE MODEL. The canvas wrote the project with one `Patch`, so a failure between the project
 * write and the shareholding-entity writes was always possible; it has no transaction either.
 * Here the two phases are explicit and the caller is told which one failed — the same honesty
 * principle `addCostSheet.ts` uses, not a new invention.
 */
import { Vsb_projectsService } from "@/generated/services/Vsb_projectsService";
import { Vsb_shareholderentitiiesService } from "@/generated/services/Vsb_shareholderentitiiesService";
import { Vsb_customchoicevaluesService } from "@/generated/services/Vsb_customchoicevaluesService";
import { unwrap } from "@/platform/errors";
import { fetchAll, updateRecordIfExists } from "./client";
import { ACTIVE, and, eq, guid, isNull, lookupEq, or } from "./odata";
import { createAndUpdateMultiple } from "./bulkWrite";
import { listCountries, listCountryAreas, listProjectStates, type Lookup } from "./projects";

const ES_SHAREHOLDERS = "vsb_shareholderentitiies";

/* ═══════════════════════════════════════════════════════════════════ types ══ */

/**
 * The editable project fields this screen reads and writes, as plain primitives — not the raw
 * Dataverse row shape. `rules.ts` converts between this and the UI's string-based form state;
 * this module converts between this and the wire format.
 */
export interface GeneralDataProject {
  id: string | null;
  projectIdCode: string;
  internalProjectId: string;
  projectName: string;
  shortName: string;
  originalProjectName: string;
  developmentType: number | null;
  technology: number | null;
  subTechnology1: number | null;
  subTechnology2: number | null;
  subTechnology3: number | null;
  startCluster: number | null;
  countryId: string | null;
  countryAreaId: string | null;
  projectManagerId: string | null;
  projectManagerName: string;
  deputyProjectManagerId: string | null;
  deputyProjectManagerName: string;
  projectStartDate: string | null;
  acquisitionDate: string | null;
  acquisitionPrice: number | null;
  bidPrice: number | null;
  ownershipType: number | null;
  ownerPercentage: number | null;
  shareOfFarmdown: number | null;
  financingOptions: number | null;
  municipality: string;
  district: string;
  latitude: number | null;
  longitude: number | null;
  terrainSize: number | null;
  totalCapacity: number | null;
  approvalState: number | null;
  clusterStateId: string | null;
  clusterStateOrder: number | null;
  owningBusinessUnitId: string | null;
  spvName: string;
  spvLegalStructure: number | null;
  spvCompanyCode: number | null;
  terrainUtilizationId: string | null;
  taxFactor: number | null;
}

export interface ShareholderEntity {
  /** `null` for a row not yet saved — the write plan creates it. */
  id: string | null;
  name: string;
  customName: string;
  /** A fraction, e.g. `0.25` for 25% — `vsb_ownership` is stored as a fraction, not a percent. */
  ownership: number | null;
  shareholderType: number | null;
}

export interface GeneralDataLookups {
  countries: Lookup[];
  countryAreas: Lookup[];
  clusterStates: (Lookup & { order: number | null })[];
}

export interface GeneralData {
  project: GeneralDataProject;
  shareholders: ShareholderEntity[];
  lookups: GeneralDataLookups;
}

/* ═══════════════════════════════════════════════════════════════ field maps ══ */

const PROJECT_SELECT = [
  "vsb_projectid", "vsb_name", "vsb_internalprojectid", "vsb_projectname", "vsb_shortname",
  "vsb_originalprojectname", "vsb_developmenttype", "vsb_technology",
  "vsb_subtechnology1", "vsb_subtechnology2", "vsb_subtechnology3", "vsb_startcluster",
  "_vsb_country_value", "_vsb_countryarea_value",
  "_vsb_projectmanager_value", "_vsb_deputyprojectmanagerentra_value",
  "vsb_projectstartdate", "vsb_acquisitiondate", "vsb_acquisitionprice", "vsb_bidprice",
  "vsb_ownershiptype", "vsb_ownerpercentage", "vsb_shareoffarmdown", "vsb_financingoptions",
  "vsb_municipality", "vsb_district", "vsb_latitude", "vsb_longitude", "vsb_terrainsize",
  "vsb_totalcapacity", "vsb_approvalstates", "_vsb_clusterstate_value",
  "_owningbusinessunit_value",
  "vsb_spvname", "vsb_spvlegalstructure", "vsb_spvcompanycode",
  "_vsb_terrainutilizationlookup_value", "vsb_taxfactor",
];

/** `fv(col)` — the `@OData.Community.Display.V1.FormattedValue` annotation for a lookup. */
const fv = (col: string): string => `${col}@OData.Community.Display.V1.FormattedValue`;

function toGeneralDataProject(r: Record<string, unknown>): GeneralDataProject {
  const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  return {
    id: str(r.vsb_projectid) || null,
    projectIdCode: str(r.vsb_name),
    internalProjectId: str(r.vsb_internalprojectid),
    projectName: str(r.vsb_projectname),
    shortName: str(r.vsb_shortname),
    originalProjectName: str(r.vsb_originalprojectname),
    developmentType: num(r.vsb_developmenttype),
    technology: num(r.vsb_technology),
    subTechnology1: num(r.vsb_subtechnology1),
    subTechnology2: num(r.vsb_subtechnology2),
    subTechnology3: num(r.vsb_subtechnology3),
    startCluster: num(r.vsb_startcluster),
    countryId: (r._vsb_country_value as string | undefined) ?? null,
    countryAreaId: (r._vsb_countryarea_value as string | undefined) ?? null,
    projectManagerId: (r._vsb_projectmanager_value as string | undefined) ?? null,
    projectManagerName: str(r[fv("_vsb_projectmanager_value")]),
    deputyProjectManagerId: (r._vsb_deputyprojectmanagerentra_value as string | undefined) ?? null,
    deputyProjectManagerName: str(r[fv("_vsb_deputyprojectmanagerentra_value")]),
    projectStartDate: (r.vsb_projectstartdate as string | undefined) ?? null,
    acquisitionDate: (r.vsb_acquisitiondate as string | undefined) ?? null,
    acquisitionPrice: num(r.vsb_acquisitionprice),
    bidPrice: num(r.vsb_bidprice),
    ownershipType: num(r.vsb_ownershiptype),
    ownerPercentage: num(r.vsb_ownerpercentage),
    shareOfFarmdown: num(r.vsb_shareoffarmdown),
    financingOptions: num(r.vsb_financingoptions),
    municipality: str(r.vsb_municipality),
    district: str(r.vsb_district),
    latitude: num(r.vsb_latitude),
    longitude: num(r.vsb_longitude),
    terrainSize: num(r.vsb_terrainsize),
    totalCapacity: num(r.vsb_totalcapacity),
    approvalState: num(r.vsb_approvalstates),
    clusterStateId: (r._vsb_clusterstate_value as string | undefined) ?? null,
    clusterStateOrder: null, // filled in by loadGeneralData, which reads the cluster state row
    owningBusinessUnitId: (r._owningbusinessunit_value as string | undefined) ?? null,
    spvName: str(r.vsb_spvname),
    spvLegalStructure: num(r.vsb_spvlegalstructure),
    spvCompanyCode: num(r.vsb_spvcompanycode),
    terrainUtilizationId: (r._vsb_terrainutilizationlookup_value as string | undefined) ?? null,
    taxFactor: num(r.vsb_taxfactor),
  };
}

function toShareholder(r: Record<string, unknown>): ShareholderEntity {
  return {
    id: (r.vsb_shareholderentitiyid as string | undefined) ?? null,
    name: (r.vsb_name as string | undefined) ?? "",
    customName: (r.vsb_customname as string | undefined) ?? "",
    ownership: typeof r.vsb_ownership === "number" ? r.vsb_ownership : null,
    shareholderType: typeof r.vsb_shareholderentitiytype === "number"
      ? r.vsb_shareholderentitiytype : null,
  };
}

/** `Defaults(Projects)` — what a brand-new project starts as, before the user types anything. */
export function newGeneralDataProject(): GeneralDataProject {
  return {
    id: null, projectIdCode: "", internalProjectId: "", projectName: "", shortName: "",
    originalProjectName: "",
    // Canvas `Defaults(Projects)` sets Development Type to Own Development — PGDS:2436.
    developmentType: 952850001, technology: null,
    subTechnology1: null, subTechnology2: null, subTechnology3: null, startCluster: null,
    countryId: null, countryAreaId: null,
    projectManagerId: null, projectManagerName: "",
    deputyProjectManagerId: null, deputyProjectManagerName: "",
    projectStartDate: null, acquisitionDate: null, acquisitionPrice: null, bidPrice: null,
    ownershipType: null, ownerPercentage: null,
    // `Defaults(Projects).'Share of Farmdown'` is 50 in the canvas create — see
    // `features/general-data/Screen.tsx`'s former placeholder comment, now superseded by this file.
    shareOfFarmdown: 50, financingOptions: null,
    municipality: "", district: "", latitude: null, longitude: null, terrainSize: null,
    totalCapacity: null,
    // New projects start as Draft, at the "Draft" cluster state — resolved against the loaded
    // cluster-state list at save time (see `draftClusterState` in rules.ts), not hard-coded here.
    approvalState: null, clusterStateId: null, clusterStateOrder: 0,
    owningBusinessUnitId: null,
    spvName: "", spvLegalStructure: null, spvCompanyCode: null,
    terrainUtilizationId: null, taxFactor: null,
  };
}

/* ═══════════════════════════════════════════════════════════════════ reads ══ */

/**
 * Loads an existing project's General Data, or (for `projectId === undefined`) just the
 * reference lookups a new project needs.
 */
export async function loadGeneralData(projectId: string | undefined): Promise<GeneralData> {
  const [countries, clusterStates] = await Promise.all([listCountries(), listProjectStates()]);

  if (!projectId) {
    return {
      project: newGeneralDataProject(),
      shareholders: [],
      lookups: { countries, countryAreas: [], clusterStates },
    };
  }

  const rows = await fetchAll(
    "load project general data",
    (o) => Vsb_projectsService.getAll(o),
    {
      select: PROJECT_SELECT,
      filter: and(`vsb_projectid eq ${guid(projectId)}`, ACTIVE),
      maxPageSize: 1,
    },
  );
  const row = rows[0];
  if (!row) throw new Error("This project could not be found, or you do not have access to it.");

  const project = toGeneralDataProject(row as unknown as Record<string, unknown>);
  const [countryAreas, shareholderRows] = await Promise.all([
    listCountryAreas(project.countryId),
    fetchAll(
      "list shareholding entities",
      (o) => Vsb_shareholderentitiiesService.getAll(o),
      {
        select: [
          "vsb_shareholderentitiyid", "vsb_name", "vsb_customname", "vsb_ownership",
          "vsb_shareholderentitiytype",
        ],
        filter: and(`_vsb_project_value eq ${guid(projectId)}`, ACTIVE),
      },
    ),
  ]);

  const clusterState = project.clusterStateId
    ? clusterStates.find((c) => c.id === project.clusterStateId)
    : undefined;

  return {
    project: { ...project, clusterStateOrder: clusterState?.order ?? null },
    shareholders: shareholderRows.map((r) => toShareholder(r as unknown as Record<string, unknown>)),
    lookups: { countries, countryAreas, clusterStates },
  };
}

/* ══════════════════════════════════════════════════════════════════ writes ══ */

const bind = (entitySet: string, id: string) => `/${entitySet}(${id})`;

/** The exact set of columns a project write may change — never the id or read-only columns. */
function projectPayload(p: GeneralDataProject): Record<string, unknown> {
  return {
    vsb_projectname: p.projectName,
    vsb_shortname: p.shortName,
    vsb_originalprojectname: p.originalProjectName || null,
    vsb_developmenttype: p.developmentType,
    vsb_technology: p.technology,
    vsb_subtechnology1: p.subTechnology1,
    vsb_subtechnology2: p.subTechnology2,
    vsb_subtechnology3: p.subTechnology3,
    vsb_startcluster: p.startCluster,
    vsb_projectstartdate: p.projectStartDate,
    vsb_acquisitiondate: p.acquisitionDate,
    vsb_acquisitionprice: p.acquisitionPrice,
    vsb_bidprice: p.bidPrice,
    vsb_ownershiptype: p.ownershipType,
    vsb_ownerpercentage: p.ownerPercentage,
    vsb_shareoffarmdown: p.shareOfFarmdown,
    vsb_financingoptions: p.financingOptions,
    vsb_municipality: p.municipality || null,
    vsb_district: p.district || null,
    vsb_latitude: p.latitude,
    vsb_longitude: p.longitude,
    vsb_terrainsize: p.terrainSize,
    vsb_spvname: p.spvName || null,
    vsb_spvlegalstructure: p.spvLegalStructure,
    vsb_spvcompanycode: p.spvCompanyCode,
    vsb_taxfactor: p.taxFactor,
    ...(p.terrainUtilizationId
      ? { "vsb_TerrainUtilizationLookUp@odata.bind": bind("vsb_customchoicevalues", p.terrainUtilizationId) }
      : {}),
    ...(p.countryId ? { "vsb_Country@odata.bind": bind("vsb_countries", p.countryId) } : {}),
    ...(p.countryAreaId
      ? { "vsb_CountryArea@odata.bind": bind("vsb_countryareas", p.countryAreaId) }
      : {}),
    ...(p.projectManagerId
      ? { "vsb_Projectmanager@odata.bind": bind("aadusers", p.projectManagerId) }
      : {}),
    ...(p.deputyProjectManagerId
      ? { "vsb_DeputyprojectmanagerEntra@odata.bind": bind("aadusers", p.deputyProjectManagerId) }
      : {}),
  };
}

export interface SaveGeneralDataArgs {
  project: GeneralDataProject;
  /** Every shareholder row currently on the screen — new ones carry `id: null`. */
  shareholders: ShareholderEntity[];
  /** Ids of rows the user removed from the screen; deleted by id, never by name (SOURCE DEFECT
   *  fixed — the canvas matched a shareholding-entity delete by Name, which could delete the
   *  wrong row for a duplicate or renamed entity). */
  deletedShareholderIds: string[];
}

export interface SaveGeneralDataResult {
  projectId: string;
  internalProjectId: string;
}

/**
 * Creates or updates the project, then replaces its shareholding entities.
 *
 * NOT a transaction (see the module comment). For a NEW project, the create must complete and
 * return a real id before the `Internal Project ID` copy-back and the shareholder writes can
 * run — that id is a genuine dependency, not an ordering choice.
 */
export async function saveGeneralData(args: SaveGeneralDataArgs): Promise<SaveGeneralDataResult> {
  const { project, shareholders, deletedShareholderIds } = args;
  const isNew = project.id === null;

  let projectId: string;
  let internalProjectId: string;

  if (isNew) {
    const created = unwrap(
      await Vsb_projectsService.create({
        ...projectPayload(project),
        statecode: 0,
        // `Defaults(Projects).'Approval States'` — a brand-new project starts life as a Draft.
        vsb_approvalstates: 952850000,
        ...(project.clusterStateId
          ? { "vsb_ClusterState@odata.bind": bind("vsb_projectstates", project.clusterStateId) }
          : {}),
        ...(project.owningBusinessUnitId
          ? { "owningbusinessunit@odata.bind": bind("businessunits", project.owningBusinessUnitId) }
          : {}),
      } as never),
      "create project",
    );
    projectId = created.vsb_projectid;
    // The autonumber `Project ID` (`vsb_name`) is assigned by Dataverse on create, so it is only
    // known after the row exists — the canvas's second Patch that copies it into
    // `Internal Project ID` is reproduced here as a second, necessarily separate, write.
    const reread = unwrap(
      await Vsb_projectsService.get(projectId, { select: ["vsb_projectid", "vsb_name"] }),
      "read back new project",
    );
    internalProjectId = reread.vsb_name ?? "";
    if (internalProjectId) {
      // Guarded too (V-1) although the window is negligible: one extra small read on a create,
      // and a project deleted between the create and this copy-back is never recreated.
      await updateRecordIfExists(
        "set internal project id", "vsb_projects", projectId, { vsb_internalprojectid: internalProjectId },
      );
    }
  } else {
    projectId = project.id as string;
    // Guarded (V-1, `updateRecordIfExists`) and FIRST: Project Overview deletes projects, and the
    // SDK 1.3.1's If-Match-less PATCH would recreate a deleted project holding only the General Data
    // columns. A gone project throws `RecordGoneError` before any shareholder write runs.
    await updateRecordIfExists("update project", "vsb_projects", projectId, projectPayload(project));
    internalProjectId = project.internalProjectId;
  }

  const shareholderRows = shareholders.map((s) => ({
    ...(s.id ? { vsb_shareholderentitiyid: s.id } : {}),
    vsb_name: s.name,
    vsb_customname: s.customName || null,
    vsb_ownership: s.ownership,
    vsb_shareholderentitiytype: s.shareholderType,
    ...(s.id ? {} : { "vsb_Project@odata.bind": bind("vsb_projects", projectId) }),
  }));

  if (shareholderRows.length > 0) {
    await createAndUpdateMultiple(
      ES_SHAREHOLDERS, "vsb_shareholderentitiy", shareholderRows, "vsb_shareholderentitiyid",
    );
  }
  // Deleted by id — fixing the canvas's SOURCE DEFECT of matching by `Name`, which could delete
  // the wrong row when two shareholding entities shared a name or one was renamed.
  for (const id of deletedShareholderIds) {
    await Vsb_shareholderentitiiesService.delete(id);
  }

  return { projectId, internalProjectId };
}

/** Re-exported so `rules.ts` can type the cluster-state list without importing `./projects`. */
export type { Lookup };

/* ═════════════════════════════════════ terrain utilization choice values ══ */

/** One option from `vsb_customchoicevalues` for the Terrain Utilization field. */
export interface TerrainUtilizationChoice {
  id: string;
  label: string;
  order: number | null;
}

/**
 * Loads the Terrain Utilization choice values for a given country, filtered to rows whose
 * `vsb_fieldname = "vsb_terrainutilization"` AND (country is blank OR country = the project's
 * country). Canvas formula: PGDS:3888–3910.
 *
 * When `countryId` is null (no country selected), only global/country-agnostic choices are
 * returned (those with no country scope).
 */
export async function loadTerrainUtilizationChoices(
  countryId: string | null,
): Promise<TerrainUtilizationChoice[]> {
  const countryFilter = countryId
    ? or(isNull("_vsb_country_value"), lookupEq("vsb_Country", countryId))
    : isNull("_vsb_country_value");
  const rows = await fetchAll(
    "load terrain utilization choices",
    (o) => Vsb_customchoicevaluesService.getAll(o),
    {
      select: ["vsb_customchoicevalueid", "vsb_value", "vsb_order"],
      filter: and(eq("vsb_fieldname", "vsb_terrainutilization"), ACTIVE, countryFilter),
      orderBy: ["vsb_order asc", "vsb_value asc"],
    },
  );
  return rows.map((r) => ({
    id: r.vsb_customchoicevalueid,
    label: r.vsb_value,
    order: (r.vsb_order as number | undefined) ?? null,
  }));
}
