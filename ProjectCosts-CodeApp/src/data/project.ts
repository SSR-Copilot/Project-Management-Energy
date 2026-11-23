/**
 * The project the Cost app was deep-linked to, and the environment variables it needs.
 *
 * `App.OnStart` in the canvas app did five sequential `LookUp('Environment Variable Values',
 * 'Environment Variable Definition'.'Schema Name' = "…")` calls plus a `LookUp(Projects, …)`,
 * each a separate round trip before the first screen rendered. Two of those five values —
 * the tenant id and the environment id — arrive on `IContext` for free in a code app, so
 * only the genuinely stored ones are fetched, and in one query rather than five.
 */
import { Vsb_projectsService } from "@/generated/services/Vsb_projectsService";
import { Vsb_projectsvsb_approvalstates } from "@/generated/models/Vsb_projectsModel";
import { Vsb_countriesService } from "@/generated/services/Vsb_countriesService";
import { Vsb_countryareasService } from "@/generated/services/Vsb_countryareasService";
import { Vsb_projectstatesService } from "@/generated/services/Vsb_projectstatesService";
import { EnvironmentvariablevaluesService } from "@/generated/services/EnvironmentvariablevaluesService";
import { EnvironmentvariabledefinitionsService } from "@/generated/services/EnvironmentvariabledefinitionsService";
import { unwrap } from "@/platform/errors";
import { trace } from "@/platform/telemetry";
import { fetchAll } from "./client";
import { ACTIVE, and, or, eq, guid } from "./odata";
import type { ProjectContext } from "@/features/cost/contracts/rules";

/**
 * The environment variables the Cost app actually reads, from `App.OnStart`.
 *
 * `vsb_TenantID` and `vsb_EnvironmentID` are deliberately NOT here — `IContext.user.tenantId`
 * and `IContext.app.environmentId` are the same values without a query.
 */
export const ENV_VAR_NAMES = [
  "vsb_AppVersion",
  "vsb_EnvironmentName",
  "vsb_ProjectManagementAppID",
  "vsb_VSBCloudInfoCenterUrl",
  "vsb_VSBcloudControllingApprovalGroup",
  /** `gblPrimarilyApprovalGroupID` (`App.OnStart:687`) — the group `RequestModulePermission` asks (D81). */
  "vsb_PrimarilyApprovalGroupID",
  /* Added for the Main Project Overview, which is now the landing screen. */
  /** The Analytics app Simulate launches. */
  "vsb_AnalyticsAppID",
  /** `gblPowerBIDashboardLink` — what the Dashboard command launches. */
  "vsb_PowerBIDashboardLink",
  /** The two Power BI report ids and the tenant, for the report-viewer commands. */
  "vsb_ProjectOverviewPowerBIReportID",
  "vsb_PortfolioOverviewPowerBIReportID",
  "vsb_PowerBITenantID",
  /** Azure Application Insights (`appInsights/`); empty or missing = telemetry off. */
  "vsb_ApplicationInsightsConnectionString",
] as const;

export type EnvVarName = (typeof ENV_VAR_NAMES)[number];
export type EnvVars = Partial<Record<EnvVarName, string>>;

/**
 * Reads all five in two queries instead of five.
 *
 * An environment variable's value lives on `environmentvariablevalues` and its schema name
 * on `environmentvariabledefinitions`, so the definitions are resolved first and the values
 * fetched by their definition ids. A variable with a default but no value row has no
 * `environmentvariablevalue` at all — hence the fallback to `defaultvalue`.
 */
export async function loadEnvironmentVariables(): Promise<EnvVars> {
  const definitions = await fetchAll(
    "list environment variable definitions",
    (o) => EnvironmentvariabledefinitionsService.getAll(o),
    {
      select: ["environmentvariabledefinitionid", "schemaname", "defaultvalue"],
      filter: or(...ENV_VAR_NAMES.map((n) => eq("schemaname", n))),
    },
  );

  const out: EnvVars = {};
  const byId = new Map<string, EnvVarName>();
  for (const d of definitions) {
    const name = d.schemaname as EnvVarName | undefined;
    if (!name || !ENV_VAR_NAMES.includes(name)) continue;
    byId.set(d.environmentvariabledefinitionid, name);
    if (d.defaultvalue) out[name] = d.defaultvalue;
  }
  if (byId.size === 0) return out;

  const values = await fetchAll(
    "list environment variable values",
    (o) => EnvironmentvariablevaluesService.getAll(o),
    {
      select: ["environmentvariablevalueid", "value", "_environmentvariabledefinitionid_value"],
      filter: or(
        ...[...byId.keys()].map((id) => `_environmentvariabledefinitionid_value eq ${guid(id)}`),
      ),
    },
  );
  for (const v of values) {
    const name = v._environmentvariabledefinitionid_value
      ? byId.get(v._environmentvariabledefinitionid_value)
      : undefined;
    // A value row wins over the definition's default, which is the Dataverse precedence.
    if (name && v.value !== undefined && v.value !== null) out[name] = v.value;
  }
  return out;
}

/**
 * Loads the deep-linked project.
 *
 * Returns `undefined` when the id matches nothing the caller may read — which is a real
 * state, not an error: Dataverse returns nothing for a project outside the user's business
 * unit, and the screen has to say so rather than show an empty grid.
 *
 * NOT PORTED — the canvas fallback to `GUID("33b9cc79-5b4f-f111-bec6-000d3a3855c2")` when
 * no `projectId` is supplied. See `ProjectDocs/app-docs/01-BUGS-FOUND.md` A-2.
 */
/** A Dataverse date column, or `undefined` for blank and unparseable alike. */
function asDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * An option-set column, which the Web API returns as a number but the generated model types
 * as the option's key. `undefined` for blank — 0 is a REAL value here (Greenfield), so a
 * `?? 0` coalesce would be wrong.
 */
function optionSetNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/**
 * OPT-01 (B5b), the reversible switch. OLD `false`: every route's session load read the project row, then its country, cluster
 * state and area (4 requests, 2 round trips deep). NEW `true`: a Project Management route (`scope: "pm"`) reads the project row
 * only (1 request) and takes the cluster-state NAME from the row's own formatted-value annotation. `/costs/*` always keeps the
 * full load. `false` restores the full load for every route.
 */
export const PM_ROW_ONLY_PROJECT_LOAD = true;
/** The switch as an object, so a test can turn it off without re-importing the module (like `startupFlags`). */
export const projectLoadSwitch = { pmRowOnly: PM_ROW_ONLY_PROJECT_LOAD };

/**
 * Which part of the project a caller needs. `"full"` (the Cost routes) adds the country, the area and the cluster state's `Order`.
 * `"pm"` is what the Project Management header and gate read: name, code, approval state, cluster-state name (see `ProjectContext`).
 */
export type ProjectLoadScope = "full" | "pm";

/**
 * One row of the shared `'Project States'` list (`data/projectStates.ts`), as the session loader needs it. `orderRaw` is the stored
 * `vsb_order` or null: NOT the list's `order`, which maps null to 0, so a state with no `Order` still reads as "no order".
 */
export type ProjectStateLookup = (stateId: string) => Promise<{ name: string; orderRaw: number | null } | undefined>;

export interface LoadProjectOptions {
  scope?: ProjectLoadScope;
  /** OPT-07d: answers the cluster-state lookup from the shared list. Absent, or a state it does not hold: the single-row read. */
  stateLookup?: ProjectStateLookup;
}

const CLUSTER_STATE_NAME = "_vsb_clusterstate_value@OData.Community.Display.V1.FormattedValue";

export async function loadProject(projectId: string, options: LoadProjectOptions = {}): Promise<ProjectContext | undefined> {
  const rows = await fetchAll(
    "load project",
    (o) => Vsb_projectsService.getAll(o),
    {
      select: [
        "vsb_projectid",
        "vsb_name", // DISPLAY NAME "Project ID" — used in the derived contract name
        "vsb_projectname",
        "vsb_shortname",
        // "Project Start Date" — the canvas' `gblSelectedProject.'Project Start Date'`.
        "vsb_projectstartdate",
        // "Start Date" — a DIFFERENT column, kept only as a fallback. See the mapping below.
        "vsb_startdate",
        "vsb_enddate",
        "vsb_acquisitiondate",
        "vsb_startcluster",
        "vsb_technology",
        "vsb_totalcapacity",
        // The cluster timeline — `gblClusterDurations` chains these six.
        "vsb_feasibilitystudies",
        "vsb_projectdevelopmentstarted",
        "vsb_applicationsubmitted",
        "vsb_legallybindingpermits",
        "vsb_construction",
        "vsb_operationsstartdatecod",
        "_vsb_country_value",
        // "Area/State/Province" — the `vsb_countryarea` LOOKUP. `App.OnStart` turns its NAME
        // into `gblAreaWithRegion` through an Italy-only `Switch` (`OnStart.txt:902-961`), and
        // both period screens render that in the Inflation Profile cell and the panel's
        // read-only country text. It was never selected, so an Italian project showed
        // "Italy - " with an empty zone after it. `vsb_countryareaname` is NOT used: that is the
        // FetchXML-era lookup alias and the Web API does not return it on a plain `$select` —
        // the same trap `costBook.ts` records for `vsb_currencyname`.
        "_vsb_countryarea_value",
        // "Cluster State" — a `vsb_projectstate` LOOKUP, and a different column from
        // `vsb_startcluster` (an option set). `gblSelectedProject.'Cluster State'.Order` gates
        // the Add/Edit Costs panel's "Link to Milestone" list; see `ProjectContext`.
        "_vsb_clusterstate_value",
        // Drives `rec_cmp_Header_Project_State`, the coloured bar left of the project name.
        "vsb_approvalstates",
        "_owningbusinessunit_value",
      ],
      // Any state: the canvas `LookUp(Projects, Project = GUID(Param(…)))` has no status clause, so an
      // inactive project opens there; here it answered "not found" on every screen (audit, 23 Nov 2026).
      filter: `vsb_projectid eq ${guid(projectId)}`,
      top: 1,
    },
  );
  const row = rows[0];
  if (!row) return undefined;

  const countryId = row._vsb_country_value;
  const clusterStateId = row._vsb_clusterstate_value;
  const countryAreaId = row._vsb_countryarea_value;
  let isoCurrencyCode: string | undefined;
  let countryName: string | undefined;
  let clusterStateOrder: number | undefined;
  let clusterStateName: string | undefined;
  let areaStateProvince: string | undefined;
  if (options.scope === "pm" && projectLoadSwitch.pmRowOnly) {
    /*
     * OPT-01: a Project Management route needs only the header's state NAME, which the row already carries as the lookup's
     * formatted-value annotation (every read sends `odata.include-annotations=*`, D119 F6). A row that has a cluster state but
     * no annotation falls back to the lookup, so the header never shows a blank or wrong state. Country, area and the state's
     * `Order` are Cost-only (no Project Management consumer reads them) and are left out.
     */
    const annotated = (row as unknown as Record<string, unknown>)[CLUSTER_STATE_NAME];
    clusterStateName = typeof annotated === "string" && annotated !== "" ? annotated : undefined;
    if (!clusterStateName && clusterStateId) clusterStateName = (await loadClusterState(clusterStateId, options.stateLookup))?.clusterStateName;
  } else {
    const [country, state, area] = await Promise.all([
      countryId ? loadCountry(countryId) : undefined,
      clusterStateId ? loadClusterState(clusterStateId, options.stateLookup) : undefined,
      countryAreaId ? loadCountryAreaName(countryAreaId) : undefined,
    ]);
    isoCurrencyCode = country?.isoCurrencyCode;
    countryName = country?.countryName;
    clusterStateOrder = state?.clusterStateOrder;
    clusterStateName = state?.clusterStateName;
    areaStateProvince = area;
  }

  return {
    projectId: row.vsb_projectid,
    projectIdCode: row.vsb_name ?? "",
    projectName: row.vsb_projectname ?? "",
    // The option-set value as its LABEL, which is what `gblTableApprovalStateColors` keys on.
    ...(row.vsb_approvalstates
      ? { approvalState: Vsb_projectsvsb_approvalstates[row.vsb_approvalstates] }
      : {}),
    /*
     * BUG FIX — this used to read `vsb_startdate` ("Start Date"), which is BLANK on real
     * project rows (verified on Wirmighausen, 9f5aade5-2b7c-ef11-ac20-000d3a466ab7: only
     * `vsb_projectstartdate` = 2015-01-20 is populated). Every caller that treats the
     * project start as a floor therefore fell through to `Today()` — most damagingly
     * `costAllowedStart`, which then opened Add Cost from Table on the CURRENT year instead
     * of the project's real cost-allowed start year. `vsb_startdate` is kept as a fallback
     * for any row where only the legacy column is filled.
     */
    startDate: asDate(row.vsb_projectstartdate) ?? asDate(row.vsb_startdate),
    endDate: asDate(row.vsb_enddate),
    acquisitionDate: asDate(row.vsb_acquisitiondate),
    startClusterNo: optionSetNumber(row.vsb_startcluster),
    clusterStateOrder,
    ...(clusterStateName ? { clusterStateName } : {}),
    totalCapacity: row.vsb_totalcapacity ?? undefined,
    // OPT-02 (B8): the two facts `loadProjectExtras` re-read from this same row, in BOTH scopes (they are row columns, no request).
    countryId,
    technology: typeof row.vsb_technology === "number" ? row.vsb_technology : undefined,
    owningBusinessUnitId: row._owningbusinessunit_value,
    isoCurrencyCode,
    countryName,
    areaStateProvince,
    milestones: {
      feasibilityStudies: asDate(row.vsb_feasibilitystudies),
      developmentStarted: asDate(row.vsb_projectdevelopmentstarted),
      applicationSubmitted: asDate(row.vsb_applicationsubmitted),
      legallyBindingPermits: asDate(row.vsb_legallybindingpermits),
      construction: asDate(row.vsb_construction),
      operationsStartCod: asDate(row.vsb_operationsstartdatecod),
      endDate: asDate(row.vsb_enddate),
    },
  };
}

/** Extra project facts the Contracts screen needs but `ProjectContext` does not carry. */
export interface ProjectExtras {
  countryId?: string;
  technology?: number;
}

export async function loadProjectExtras(projectId: string): Promise<ProjectExtras> {
  const rows = await fetchAll(
    "load project extras",
    (o) => Vsb_projectsService.getAll(o),
    {
      select: ["vsb_projectid", "_vsb_country_value", "vsb_technology"],
      filter: `vsb_projectid eq ${guid(projectId)}`,
      top: 1,
    },
  );
  const row = rows[0];
  const technology = typeof row?.vsb_technology === "number" ? row.vsb_technology : undefined;
  return { countryId: row?._vsb_country_value, technology };
}

/**
 * `gblRecordSelectedProjectCountry.'ISO Currency Code'` — the suffix on every cost label.
 * `vsb_isocurrencycode` on `vsb_Country`.
 */
/**
 * The country's currency AND its name.
 *
 * The name is not decoration: `totalCostMax` compares it against the literal `"Poland"` to pick
 * a 2.25bn ceiling over the default 500m (`CapexScreenCode.txt:10770`). The column was already
 * being selected here and then thrown away, so every project silently got the lower ceiling.
 */
async function loadCountry(
  countryId: string,
): Promise<{ isoCurrencyCode?: string; countryName?: string }> {
  const result = await Vsb_countriesService.get(countryId, {
    select: ["vsb_countryid", "vsb_isocurrencycode", "vsb_name"],
  });
  // A country the caller cannot read is not fatal — the labels fall back to EUR.
  if (!result.success) return {};
  const row = unwrap(result, "load country");
  return { isoCurrencyCode: row.vsb_isocurrencycode, countryName: row.vsb_name ?? undefined };
}

/**
 * `gblSelectedProject.'Area/State/Province'.Name` — one row of `vsb_countryarea`, by id.
 *
 * Same shape and the same "a row the caller cannot read is not fatal" tolerance as `loadCountry`
 * above: the Italy zone then resolves to blank, which is exactly what `areaWithRegion` returns
 * for a region it does not recognise, so nothing downstream has to special-case it.
 */
async function loadCountryAreaName(countryAreaId: string): Promise<string | undefined> {
  const result = await Vsb_countryareasService.get(countryAreaId, {
    select: ["vsb_countryareaid", "vsb_name"],
  });
  if (!result.success) return undefined;
  return unwrap(result, "load project area").vsb_name ?? undefined;
}

/**
 * `gblSelectedProject.'Cluster State'.Order` — one row of `vsb_projectstate`, by id — and the
 * same row's `Name`, which `App Loading Screen` puts in `gblProjectHeaderData.Status`.
 *
 * A single-row GET rather than `loadProjectStates()` (`./costBook.ts`), which reads all ten:
 * every project load would otherwise pay for the whole table to learn one number, and this
 * file deliberately has no dependency on the CAPEX cost book. Same shape, and the same
 * "a row the caller cannot read is not fatal" tolerance, as `loadCountry` above.
 */
async function loadClusterState(
  clusterStateId: string,
  stateLookup?: ProjectStateLookup,
): Promise<{ clusterStateOrder?: number; clusterStateName?: string } | undefined> {
  /*
   * OPT-07d: the shared 10-row `'Project States'` entry (30 min) answers when it can. Same result as the single-row read below:
   * the list holds inactive rows too (as a GET by id does), `orderRaw` is the stored `Order` or null (never the list's 0), and a
   * blank name is left out. A state the list does not hold, or a list that cannot be read, falls back to the single-row read.
   */
  if (stateLookup) {
    try {
      const state = await stateLookup(clusterStateId);
      if (state) {
        return {
          ...(typeof state.orderRaw === "number" && Number.isFinite(state.orderRaw) ? { clusterStateOrder: state.orderRaw } : {}),
          ...(state.name ? { clusterStateName: state.name } : {}),
        };
      }
    } catch (error) {
      trace("warning", "project state list unavailable; reading the project's cluster state on its own", { error });
    }
  }
  const result = await Vsb_projectstatesService.get(clusterStateId, {
    select: ["vsb_projectstateid", "vsb_order", "vsb_name"],
  });
  if (!result.success) return undefined;
  const row = unwrap(result, "load project cluster state");
  const order = row.vsb_order;
  return {
    ...(typeof order === "number" && Number.isFinite(order) ? { clusterStateOrder: order } : {}),
    ...(row.vsb_name ? { clusterStateName: row.vsb_name } : {}),
  };
}

/* ═══════════════════════════════════════════════════════════ project search */

export interface ProjectSummary {
  projectId: string;
  projectIdCode: string;
  projectName: string;
  shortName?: string;
  countryName?: string;
  technologyName?: string;
}

/**
 * Finds projects by name, for the no-project state.
 *
 * The Cost app is normally deep-linked from Project Management with a `projectId`, so the
 * canvas app never needed a picker — it fell back to a hard-coded test GUID instead
 * (`ProjectDocs/app-docs/01-BUGS-FOUND.md` A-2). This is the legitimate version of that fallback: it lets a
 * user who opened the app without a deep link pick a project they are allowed to see, and it
 * is what makes a local run against real data possible at all.
 *
 * Filtering is server-side. `contains()` is not a delegable Dataverse operator for every
 * column type, but it is for `nvarchar`, which is what `vsb_projectname` and `vsb_name` are.
 * `top` is capped because this is a picker, not a report.
 */
export async function searchProjects(term: string, limit = 50): Promise<ProjectSummary[]> {
  const trimmed = term.trim();
  // `contains` on a user-typed string: single quotes must be doubled or the filter is a 400.
  const escaped = trimmed.replace(/'/g, "''");
  const search = trimmed
    ? or(
        `contains(vsb_projectname, '${escaped}')`,
        `contains(vsb_name, '${escaped}')`,
        `contains(vsb_shortname, '${escaped}')`,
      )
    : undefined;

  const rows = await fetchAll(
    "search projects",
    (o) => Vsb_projectsService.getAll(o),
    {
      select: [
        "vsb_projectid", "vsb_name", "vsb_projectname", "vsb_shortname",
        "vsb_countryname", "vsb_technologyname",
      ],
      filter: and(ACTIVE, search),
      orderBy: ["vsb_projectname asc"],
      top: limit,
      maxPages: 1,
    },
  );
  return rows.map((r) => ({
    projectId: r.vsb_projectid,
    projectIdCode: r.vsb_name ?? "",
    projectName: r.vsb_projectname ?? "",
    shortName: r.vsb_shortname,
    countryName: r.vsb_countryname,
    technologyName: r.vsb_technologyname,
  }));
}
