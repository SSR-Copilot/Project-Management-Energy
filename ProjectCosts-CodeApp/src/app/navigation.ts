/**
 * The left rail, transcribed from `App.Formulas` → `LeftNavigationMenu`.
 *
 * The canvas app carried seven entries. Two are not real destinations:
 *   - `OpexCostsKey` ("OPEX") has NO `TargetScreen` — its own target is commented out, so it
 *     is a parent group that expands rather than navigating.
 *   - `TotalCostsSummary` ("Total Summary") ships `ItemEnabled: false, ItemVisible: false`.
 *     It is kept here, hidden, so its absence is a decision rather than an omission.
 *
 * Note `ItemDisplayName: " DEVEX/CAPEX"` has a LEADING SPACE in the canvas source. The
 * screenshots show it rendered flush with the other labels, so the space is an authoring
 * slip; it is dropped here and recorded rather than reproduced.
 *
 * Two rail items point at the SAME canvas screen (`Opex Costs Screen`): "Operation &
 * Maintenance" and "Other OPEX Costs". That screen switched behaviour on the selected key,
 * which is why the route carries a `mode`.
 */
export interface NavItem {
  key: string;
  label: string;
  /**
   * Mapped to a Fluent v9 icon in `LeftNav`. The keys track `LeftNavigationMenu.ItemIconName`
   * in `App.pa.yaml`, which is a Fabric icon set:
   *
   *   capex    -> ReadingModeSolid      (DEVEX/CAPEX)
   *   opex     -> PageEdit              (the OPEX group; the rail draws a chevron for it)
   *   document -> PageEdit              (O&M, Land Lease, Other OPEX Costs)
   *   contract -> TextDocumentShared    (Contracts — NOT the same icon as its siblings)
   *   currency -> AllCurrency           (Total Summary, hidden)
   */
  icon:
    | "projects" | "capex" | "opex" | "document" | "contract" | "currency"
    // Project Management `LeftNavigationMenu` / `LeftAdminNavigationMenu` (`App.pa.yaml`):
    | "flag" | "generator" | "production" | "checklist" | "team" | "planning"
    | "gridOperator" | "money" | "financial" | "gates" | "accounts" | "dateTime";
  path?: string;
  parentKey?: string;
  enabled: boolean;
  visible: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    /**
     * Retained as a route key, hidden to match the Canvas Cost rail. The overview stays
     * open in its original browser tab when Costs launches.
     */
    key: "ProjectsKey",
    label: "Projects",
    icon: "projects",
    path: "/projects",
    enabled: true,
    visible: false,
  },
  {
    key: "DevexCapexCostsKey",
    label: "DEVEX/CAPEX",
    icon: "capex",
    path: "/costs/capex",
    enabled: true,
    visible: true,
  },
  {
    // No TargetScreen in the canvas source: a group header, not a destination.
    key: "OpexCostsKey",
    label: "OPEX",
    icon: "opex",
    enabled: true,
    visible: true,
  },
  {
    key: "O&MKey",
    label: "Operation & Maintenance",
    icon: "document",
    path: "/costs/opex/om",
    parentKey: "OpexCostsKey",
    enabled: true,
    visible: true,
  },
  {
    key: "LandLeaseKey",
    label: "Land Lease",
    icon: "document",
    path: "/costs/land-lease",
    parentKey: "OpexCostsKey",
    enabled: true,
    visible: true,
  },
  {
    key: "OtherOpexCostsKey",
    label: "Other OPEX Costs",
    icon: "document",
    path: "/costs/opex/other",
    parentKey: "OpexCostsKey",
    enabled: true,
    visible: true,
  },
  {
    key: "ContractsKey",
    label: "Contracts",
    icon: "contract",
    path: "/costs/contracts",
    enabled: true,
    visible: true,
  },
  {
    // ItemEnabled: false, ItemVisible: false in the canvas source.
    key: "TotalCostsSummary",
    label: "Total Summary",
    icon: "currency",
    enabled: false,
    visible: false,
  },
];

/**
 * The Project Management rail — `App.Formulas` → `LeftNavigationMenu` in
 * `ProjectDocs/_extracted/msapp/projectmanagement/Src/App.pa.yaml`, in canvas order, keys and captions
 * verbatim. Routes are `/project/<screen>` and carry `?projectId=` exactly as the cost routes
 * do (`LeftNav` appends it).
 *
 * The canvas `ItemIconColor` data-completeness tint (`#8FBCE4` until the prerequisite field
 * on `gblRecordSelectedProject` is filled) is not reproduced yet: it needs the project row,
 * and these screens are not connected to Dataverse yet.
 */
export const PM_NAV_ITEMS: NavItem[] = [
  { key: "GeneralDataCommonKey", label: "General", icon: "document", path: "/project/general", enabled: true, visible: true },
  { key: "GeneralDataMilestonesKey", label: "Milestones", icon: "flag", path: "/project/milestones", enabled: true, visible: true },
  { key: "GeneratorKey", label: "Generator", icon: "generator", path: "/project/generators", enabled: true, visible: true },
  { key: "ProductionKey", label: "Production", icon: "production", path: "/project/production", enabled: true, visible: true },
  { key: "GeneralDataCheckListKey", label: "Cluster Check List", icon: "checklist", path: "/project/checklist", enabled: true, visible: true },
  { key: "GeneralDataProjectTeamKey", label: "Project Team", icon: "team", path: "/project/team", enabled: true, visible: true },
  { key: "PlanningKey", label: "Planning", icon: "planning", path: "/project/planning", enabled: true, visible: true },
  { key: "GridOperatorKey", label: "Grid Operator", icon: "gridOperator", path: "/project/grid-operator", enabled: true, visible: true },
  { key: "RevenueKey", label: "Revenue", icon: "money", path: "/project/revenues", enabled: true, visible: true },
  { key: "FinanceKey", label: "Financing", icon: "financial", path: "/project/finance", enabled: true, visible: true },
];

/**
 * The administration rail — `App.Formulas` → `LeftAdminNavigationMenu`, keys and captions
 * verbatim (including the canvas key `"CAPEX AccountsKey"`, space and all). The two
 * commented-out "Approval Settings" rows are not carried.
 *
 * Every canvas row is `ItemVisible: Or(gblCurrentUser.IsApplicationAdministrator,
 * gblCurrentUser.IsControllerOwnData)`. That rule is applied by `LeftNav` through
 * `app/adminAccess.ts` (with its local-run bypass), so `visible` stays `true` here.
 */
export const ADMIN_NAV_ITEMS: NavItem[] = [
  { key: "GatesKey", label: "Project Gate", icon: "gates", enabled: true, visible: true },
  { key: "GatesSettingKey", label: "Check List Settings", icon: "checklist", parentKey: "GatesKey", path: "/admin/default-checklists", enabled: true, visible: true },
  { key: "GatesApprovalsKey", label: "Project Gates", icon: "gates", parentKey: "GatesKey", path: "/admin/gates-approvals", enabled: true, visible: true },
  { key: "CAPEX AccountsKey", label: "CAPEX Accounts", icon: "accounts", parentKey: "GatesKey", path: "/admin/capex-accounts", enabled: true, visible: true },
  { key: "StandardAssumptionsKey", label: "Standard Assumptions", icon: "dateTime", enabled: true, visible: true },
  { key: "MilestonesSettingsKey", label: "Milestones", icon: "dateTime", parentKey: "StandardAssumptionsKey", path: "/admin/milestones", enabled: true, visible: true },
  { key: "CostSettingKey", label: "Costs", icon: "currency", parentKey: "StandardAssumptionsKey", path: "/admin/cost", enabled: true, visible: true },
  { key: "ContractSettingKey", label: "Contracts", icon: "contract", parentKey: "StandardAssumptionsKey", path: "/admin/contract", enabled: true, visible: true },
];

/** The rail section a path belongs to. */
export type RailSection = "cost" | "project" | "admin";
export function railSection(pathname: string): RailSection | undefined {
  if (pathname.startsWith("/costs/")) return "cost";
  if (pathname.startsWith("/project/")) return "project";
  if (pathname.startsWith("/admin/")) return "admin";
  return undefined;
}

/** The rail items for a section. */
export function navItemsFor(section: RailSection | undefined): NavItem[] {
  return section === "project" ? PM_NAV_ITEMS : section === "admin" ? ADMIN_NAV_ITEMS : NAV_ITEMS;
}

/** Which rail item a path belongs to, so the rail highlights correctly on a deep link. */
export function activeNavKey(pathname: string, items: readonly NavItem[] = NAV_ITEMS): string | undefined {
  const exact = items.find((i) => i.path === pathname);
  if (exact) return exact.key;
  // The landing route renders the overview, so the rail must highlight Projects there too.
  if (pathname === "/" || pathname === "") return "ProjectsKey";
  // `/costs/add-from-table` is reached from the DEVEX/CAPEX screen and belongs to it.
  if (pathname.startsWith("/costs/add-from-table")) return "DevexCapexCostsKey";
  return items.find((i) => i.path && pathname.startsWith(i.path))?.key;
}

/** The group a rail item sits under, for keeping the right group expanded. */
export function parentOf(key: string | undefined, items: readonly NavItem[] = NAV_ITEMS): string | undefined {
  return items.find((i) => i.key === key)?.parentKey;
}

/* ══════════════════════════════════════════ the Project Management routes ══ */

/**
 * Where `+ Add Project` goes.
 *
 * The canvas `addProject` handler blanks `gblRecordSelectedProject`, `gblProjectHeaderData`
 * and `gblReportError`, then `Navigate('Project General Data Screen')` — so General Data IS
 * the New Project screen, reached with no project selected. Marking that in the URL rather
 * than in a store flag keeps the route a pure function of the location, which means a reloaded
 * or shared "new project" link still works.
 */
export const NEW_PROJECT_PATH = "/projects/new";

/**
 * Where `Edit Project` goes, for a project that exists.
 *
 * The canvas forked here: `If(gblProduction, Launch(gblPMAppURL, {projectid: …}), <set four
 * globals>; Navigate('Project General Data Screen', …, {locGeneralDataTabSelected:
 * "generalDataTab"}))`. In the player that means editing a project RELOADS the whole app with
 * `?projectid=`. The fork is gone — one app, one route, client-side.
 */
export const projectGeneralDataPath = (projectId: string): string =>
  `/projects/${projectId}/general`;

/**
 * The return link to the Project Management canvas app.
 *
 * Transcribed from `App.OnStart`:
 *   `"https://apps.powerapps.com/play/e/" & gblEnvironmentID & "/a/" &
 *    gblProjectManagementAppID & "?tenantId=" & gblTenantID`
 *
 * PM stays on canvas for this phase, so this URL shape has to keep working exactly.
 */
export function projectManagementAppUrl(args: {
  environmentId: string | undefined;
  projectManagementAppId: string | undefined;
  tenantId: string | undefined;
}): string | undefined {
  const { environmentId, projectManagementAppId, tenantId } = args;
  if (!environmentId || !projectManagementAppId) return undefined;
  const base = `https://apps.powerapps.com/play/e/${environmentId}/a/${projectManagementAppId}`;
  return tenantId ? `${base}?tenantId=${tenantId}` : base;
}

/**
 * The Analytics app, which the Simulate command launches.
 *
 * Transcribed from `App.OnStart`:
 *   `Set(gblAnalyticsAppLaunchUrl, "https://apps.powerapps.com/play/e/" & gblEnvironmentID &
 *        "/a/" & gblAnalyticsAppID & "?tenantId=" & gblTenantID)`
 * and the command's own `Launch(gblAnalyticsAppLaunchUrl, {projectId: GUID(...)})`, which
 * appends the project.
 *
 * `projectId` carries a CAPITAL I here. The PM app's own launch uses lowercase `projectid`
 * (see `projectManagementAppUrl`); the canvas is inconsistent between the two and the
 * receiving app reads whichever spelling it was given, so neither can be normalised away.
 *
 * Analytics stays a separate canvas app for this phase, so this URL shape has to keep working
 * exactly — it is a real external launch, not a route that collapses into this app.
 */
export function analyticsAppUrl(args: {
  environmentId: string | undefined;
  analyticsAppId: string | undefined;
  tenantId: string | undefined;
  projectId: string;
}): string | undefined {
  const { environmentId, analyticsAppId, tenantId, projectId } = args;
  if (!environmentId || !analyticsAppId || !projectId) return undefined;
  const url = new URL(`https://apps.powerapps.com/play/e/${environmentId}/a/${analyticsAppId}`);
  if (tenantId) url.searchParams.set("tenantId", tenantId);
  url.searchParams.set("projectId", projectId);
  return url.toString();
}

/**
 * A Power BI report link, for the two "(Beta)" report commands.
 *
 * Transcribed from the command bar's own handlers:
 *   project:   `Launch($"https://app.powerbi.com/reportEmbed?reportId={gblProjectOverviewPowerBIReportID}
 *               &autoAuth=true&ctid={gblPowerBITenantID}&filter=Project/id eq '{project}'
 *               &navContentPaneEnabled=false")`
 *   portfolio: the same without the `filter` — the portfolio report is not project-scoped,
 *              which is also why its command carries no selection gate.
 *
 * `Project/id` is lowercase here. The grid's own `CellAction` handler writes `Project/Id`, but
 * that handler is dead code — no column declares `ColCellType: "link"` — so the command's
 * spelling is the one that has ever run.
 *
 * Built through `URL` rather than string concatenation: the filter value carries spaces and
 * apostrophes, and a hand-built query string would put an unencoded project id straight into
 * a URL the browser then opens.
 */
export function powerBiReportUrl(args: {
  reportId: string | undefined;
  tenantId: string | undefined;
  /** Omitted for the portfolio report, which shows every project. */
  projectId?: string | undefined;
}): string | undefined {
  const { reportId, tenantId, projectId } = args;
  if (!reportId) return undefined;
  const url = new URL("https://app.powerbi.com/reportEmbed");
  url.searchParams.set("reportId", reportId);
  url.searchParams.set("autoAuth", "true");
  if (tenantId) url.searchParams.set("ctid", tenantId);
  if (projectId) url.searchParams.set("filter", `Project/id eq '${projectId}'`);
  url.searchParams.set("navContentPaneEnabled", "false");
  return url.toString();
}
