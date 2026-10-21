/**
 * Translation of `LeftNavigationMenu` (both apps) and the navigation sequence.
 *
 * The canvas rail is a named-formula table of
 *   {ItemKey, ItemDisplayName, ItemIconName, ItemParentKey, TargetScreen,
 *    ItemEnabled, ItemVisible, ItemIconColor}
 * where `ItemIconColor` encodes DATA COMPLETENESS, not selection: it is `#8FBCE4` when the
 * prerequisite field on `gblRecordSelectedProject` is blank or zero, and `#006EB9` when it
 * is filled. That is the app's progress indicator and it is reproduced exactly.
 */
import { navIconColor } from "@/theme/tokens";

export type AppId = "pm" | "cost";

export interface SelectedProject {
  projectId?: string;
  /** 'Project ID' — the human-readable identifier */
  projectNumber?: string | null;
  projectStartDate?: string | null;
  totalCapacity?: number | null;
  netYieldP50?: number | null;
  clusterStateName?: string | null;
  plantWtgCapacityMw?: number | null;
  name?: string | null;
  /**
   * The RAW `vsb_technology` choice value — the integer `952850000` against live Dataverse.
   * Three screens pass it straight into `f.eq("vsb_technology", …)`, so it must stay
   * comparable against the column; use `technologyLabel()` to display it.
   */
  technology?: number | string | null;
  countryId?: string | null;
}

export interface NavItem {
  key: string;
  label: string;
  icon: string;
  route: string;
  parentKey?: string;
  enabled: boolean;
  visible: boolean;
  /** Which field on the selected project must be present for the icon to read "complete". */
  prerequisite?: (p: SelectedProject) => boolean;
}

/** Cluster state must exist and not be "Draft" — the gate shared by six PM items. */
const clusterBeyondDraft = (p: SelectedProject) =>
  Boolean(p.clusterStateName) && p.clusterStateName !== "Draft";

/**
 * PM rail, in the exact order and with the exact prerequisites of the canvas
 * `LeftNavigationMenu`.
 */
export const PM_NAV: NavItem[] = [
  {
    key: "GeneralDataCommonKey",
    label: "General",
    icon: "PageEdit",
    route: "/project/general",
    enabled: true,
    visible: true,
    prerequisite: (p) => Boolean(p.projectId),
  },
  {
    key: "GeneralDataMilestonesKey",
    label: "Milestones",
    icon: "Flag",
    route: "/project/milestones",
    enabled: true,
    visible: true,
    prerequisite: (p) => Boolean(p.projectNumber),
  },
  {
    key: "GeneratorKey",
    label: "Generator",
    icon: "TriggerApproval",
    route: "/project/generators",
    enabled: true,
    visible: true,
    prerequisite: (p) => Boolean(p.projectStartDate),
  },
  {
    key: "ProductionKey",
    label: "Production",
    icon: "ProductVariant",
    route: "/project/production",
    enabled: true,
    visible: true,
    prerequisite: (p) => Boolean(p.totalCapacity),
  },
  {
    key: "GeneralDataCheckListKey",
    label: "Cluster Check List",
    icon: "CheckList",
    route: "/project/checklist",
    enabled: true,
    visible: true,
    prerequisite: (p) => Boolean(p.netYieldP50),
  },
  {
    key: "GeneralDataProjectTeamKey",
    label: "Project Team",
    icon: "Teamwork",
    route: "/project/team",
    enabled: true,
    visible: true,
    prerequisite: clusterBeyondDraft,
  },
  {
    key: "PlanningKey",
    label: "Planning",
    icon: "PlanView",
    route: "/project/planning",
    enabled: true,
    visible: true,
    prerequisite: clusterBeyondDraft,
  },
  {
    key: "GridOperatorKey",
    label: "Grid Operator",
    icon: "FollowUser",
    route: "/project/grid-operator",
    enabled: true,
    visible: true,
    prerequisite: clusterBeyondDraft,
  },
  {
    key: "RevenueKey",
    label: "Revenue",
    icon: "Money",
    route: "/project/revenues",
    enabled: true,
    visible: true,
    prerequisite: clusterBeyondDraft,
  },
  {
    key: "FinanceKey",
    label: "Financing",
    icon: "Financial",
    route: "/project/finance",
    enabled: true,
    visible: true,
    prerequisite: clusterBeyondDraft,
  },
];

/**
 * Admin rail — the canvas `LeftAdminNavigationMenu`.
 *
 * Two parent rows carrying no target ("Project Gate", "Standard Assumptions") with three
 * children each, exactly as the canvas declares them. It is NOT appended to the project rail:
 * the canvas `LeftNavigationMenu` contains no admin entries, and the admin section is reached
 * only through the "Application Settings" item on the user badge. Passing this as the rail's
 * `items` on an /admin route is what reproduces that.
 *
 * Every row carries the same `ItemVisible` in the canvas —
 * `Or(IsApplicationAdministrator, IsControllerOwnData)`, i.e. `canSeeAdminSection` — which the
 * route guard already applies, so these are declared visible here.
 */
export const PM_ADMIN_NAV: NavItem[] = [
  { key: "GatesKey", label: "Project Gate", icon: "CheckList",
    route: "", enabled: true, visible: true },
  { key: "GatesSettingKey", label: "Check List Settings", icon: "CheckList",
    parentKey: "GatesKey", route: "/admin/default-checklists", enabled: true, visible: true },
  { key: "GatesApprovalsKey", label: "Project Gates", icon: "ReminderGroup",
    parentKey: "GatesKey", route: "/admin/gates-approvals", enabled: true, visible: true },
  { key: "CAPEXAccountsKey", label: "CAPEX Accounts", icon: "AccountManagement",
    parentKey: "GatesKey", route: "/admin/capex-accounts", enabled: true, visible: true },

  { key: "StandardAssumptionsKey", label: "Standard Assumptions", icon: "DateTime",
    route: "", enabled: true, visible: true },
  { key: "MilestonesSettingsKey", label: "Milestones", icon: "DateTime",
    parentKey: "StandardAssumptionsKey", route: "/admin/milestones", enabled: true, visible: true },
  { key: "CostSettingKey", label: "Costs", icon: "AllCurrency",
    parentKey: "StandardAssumptionsKey", route: "/admin/cost", enabled: true, visible: true },
  { key: "ContractSettingKey", label: "Contracts", icon: "TextDocumentShared",
    parentKey: "StandardAssumptionsKey", route: "/admin/contract", enabled: true, visible: true },
];

/**
 * Cost app rail. Note "Operation & Maintenance" and "Other OPEX Costs" both target the
 * same canvas screen — the screen switches mode on the selected rail item. That is
 * preserved via distinct routes onto one feature.
 */
export const COST_NAV: NavItem[] = [
  { key: "DevexCapexCostsKey", label: "DEVEX/CAPEX", icon: "ReadingModeSolid",
    route: "/costs/capex", enabled: true, visible: true },
  { key: "OpexCostsKey", label: "OPEX", icon: "PageEdit",
    route: "", enabled: true, visible: true },
  { key: "O&MKey", label: "Operation & Maintenance", icon: "PageEdit",
    parentKey: "OpexCostsKey", route: "/costs/opex/om", enabled: true, visible: true },
  { key: "LandLeaseKey", label: "Land Lease", icon: "PageEdit",
    parentKey: "OpexCostsKey", route: "/costs/land-lease", enabled: true, visible: true },
  { key: "OtherOpexCostsKey", label: "Other OPEX Costs", icon: "PageEdit",
    parentKey: "OpexCostsKey", route: "/costs/opex/other", enabled: true, visible: true },
  { key: "ContractsKey", label: "Contracts", icon: "TextDocumentShared",
    route: "/costs/contracts", enabled: true, visible: true },
  { key: "TotalCostsSummary", label: "Total Summary", icon: "AllCurrency",
    route: "", enabled: false, visible: false },
];

/** `ItemIconColor` — the completeness colour for one rail item. */
export function navItemColor(item: NavItem, project: SelectedProject | null): string {
  if (!item.prerequisite) return navIconColor.complete;
  if (!project) return navIconColor.incomplete;
  return item.prerequisite(project) ? navIconColor.complete : navIconColor.incomplete;
}

/** How far through the project the data actually is — drives the progress meter. */
export function completionRatio(project: SelectedProject | null): number {
  const gated = PM_NAV.filter((i) => i.prerequisite);
  if (!project) return 0;
  const done = gated.filter((i) => i.prerequisite!(project)).length;
  return done / gated.length;
}

/** Flatten the Cost rail into render order, parents immediately before their children. */
export function railTree(items: NavItem[]): { item: NavItem; depth: number }[] {
  const roots = items.filter((i) => !i.parentKey);
  const out: { item: NavItem; depth: number }[] = [];
  for (const r of roots) {
    out.push({ item: r, depth: 0 });
    for (const c of items.filter((i) => i.parentKey === r.key)) {
      out.push({ item: c, depth: 1 });
    }
  }
  return out.filter((x) => x.item.visible);
}

/**
 * The canvas launch sequence, reproduced.
 *
 * PM StartScreen is 'App Loading Screen'. Its hidden dispatch button reads the launch
 * parameters: `projectid` deep-links to General Data with the project resolved, otherwise
 * it clears the project globals and goes to Project Main. A `screen` parameter maps
 * "general" and "generators" to their screens.
 * Cost StartScreen is 'Capex Costs Screen'.
 */
export function resolveLaunchRoute(
  app: AppId,
  params: URLSearchParams,
): { route: string; projectId?: string } {
  if (app === "cost") return { route: "/costs/capex" };

  const projectId = params.get("projectid") ?? undefined;
  const screen = (params.get("screen") ?? "").toLowerCase();

  if (!projectId) return { route: "/projects" };
  if (screen === "generators") return { route: "/project/generators", projectId };
  if (screen === "general" || screen === "") return { route: "/project/general", projectId };
  const known = PM_NAV.find((i) => i.route.endsWith(`/${screen}`));
  return { route: known?.route ?? "/project/general", projectId };
}

/** Guard: project-scoped routes need a selected project. */
export const PROJECT_SCOPED = PM_NAV.map((i) => i.route);
export const isProjectScoped = (path: string) =>
  PROJECT_SCOPED.some((r) => path.startsWith(r));

/**
 * The one project-scoped route that is reachable WITHOUT a selected project.
 *
 * GUIDE p10: "+ Add Project" on the portfolio opens General in its New Project state — no
 * project id, an empty form, `Project ID` blank until the first save. The canvas app has no
 * guard at all, so it simply navigates; this build guards every project route, which turned
 * the app's only create path into a dead end that rendered "No project selected".
 *
 * Marking the intent in the URL rather than in a store flag keeps the guard a pure function
 * of the location, and means a reloaded or shared "new project" link still works.
 */
export const NEW_PROJECT_ROUTE = "/project/general?new=1";

export function isNewProjectRequest(pathname: string, search: string): boolean {
  if (pathname !== "/project/general") return false;
  return new URLSearchParams(search).has("new");
}
