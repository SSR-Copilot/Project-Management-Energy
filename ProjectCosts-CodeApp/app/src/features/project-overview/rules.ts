/**
 * Main Project Overview — business rules.
 *
 * Canvas screen: `Project Main Screen.pa.yaml` in the **Project Management** app
 * (101 controls, 2,672 lines of Power Fx). This is now the Cost app's landing screen: the
 * project list, with `Edit Costs` as the way into the cost module.
 *
 * Ported from the skeleton's `src/features/pm/project-main/rules.ts`, which is a good and
 * thorough piece of work. Five things in it disagree with the canvas source and are corrected
 * here — each marked `SKELETON FIX` so the difference is reviewable rather than silent:
 *
 *   1. `keywordClause` searched `_vsb_countryarea_value`. The canvas searches
 *      **'Project ID'** (`vsb_name`) as its fourth field, not the area — and the input's own
 *      placeholder says "Search for Project Name, Short Name and ID". Filtering a GUID column
 *      with `contains()` would also have been a 400 against live Dataverse.
 *   2. `simulateProject` was gated `environmentName === "Dev"`. The canvas gates it on
 *      `User().Email in colAnalyticsAppUsers` — the `vsb_AnalyticsAppUsers` environment
 *      variable.
 *   3. `dashboard` was gated on having a selection. The canvas item has **no** `ItemEnabled`,
 *      so it is always enabled. Same for Show Portfolio Overview.
 *   4. `REPORT_VIEWERS` listed three addresses the canvas does not have and omitted three it
 *      does. The canvas `colReportViewers` is transcribed below.
 *   5. The SharePoint / Teams / Power BI labels and icons were paraphrased. The canvas strings
 *      are "View Sharepoint Site", "View Teams", "Show Project Overview (Beta)",
 *      "Show Portfolio Overview (Beta)", all with icon `View`.
 *
 * The skeleton's own documented divergence — filtering Area and Status by lookup GUID rather
 * than by related NAME — is kept, and for its stated reason: reaching a related name needs
 * `$expand`. It also fixes a real canvas bug, where two identically-named areas in different
 * countries matched each other.
 */
import { f } from "@/data/odata";
import { isDecimal, parseNumber } from "@/domain/numeric";
import { technologyLabel, technologyValue, APPROVAL_STATE, approvalDecoration, rowAccentColor } from "@/domain/project";

/* ═══════════════════════════════════════════════════════════ column names ══ */

/**
 * The `vsb_projects` columns this screen reads. Every read goes through this map, so a
 * corrected logical name is a one-line edit. All of them were checked against
 * `src/generated/models/Vsb_projectsModel.ts`.
 */
export const COL = {
  id: "vsb_projectid",
  /** 'Project Name'. NOT `vsb_name`, which is the auto-numbered primary column. */
  name: "vsb_projectname",
  shortName: "vsb_shortname",
  /**
   * 'Project ID' — the autonumber primary column. The keyword search covers it; the grid does
   * not show it.
   */
  projectIdCode: "vsb_name",
  /**
   * 'Internal Project ID' — what the grid's "Project ID" column shows. Confirmed from the
   * canvas grid projection, which aliases it: `vsb_name: ThisRecord.'Internal Project ID'`.
   */
  internalProjectId: "vsb_internalprojectid",
  technology: "vsb_technology",
  totalCapacity: "vsb_totalcapacity",
  weightedMw: "vsb_weightedmw",
  approvalState: "vsb_approvalstates",
  spoSharepointUrl: "vsb_sposharepointurl",
  spoTeamsUrl: "vsb_spoteamsurl",
  projectStartDate: "vsb_projectstartdate",
  netYieldP50: "vsb_netyieldp50",
  m1FeasibilityStudies: "vsb_feasibilitystudies",
  m2ProjectDevelopmentStarted: "vsb_projectdevelopmentstarted",
  m3ApplicationSubmitted: "vsb_applicationsubmitted",
  m4LegallyBindingPermits: "vsb_legallybindingpermits",
  m5Construction: "vsb_construction",
  country: "_vsb_country_value",
  area: "_vsb_countryarea_value",
  clusterState: "_vsb_clusterstate_value",
  /** Points at `aadusers`, so the value is an Entra object id. */
  projectManager: "_vsb_projectmanager_value",
} as const;

/** `<col>@OData.Community.Display.V1.FormattedValue` — a lookup or choice label. */
export const fv = (col: string): string => `${col}@OData.Community.Display.V1.FormattedValue`;

/** Everything the grid and the command gates need, and nothing else. */
export const PROJECT_SELECT: string[] = [
  COL.id, COL.name, COL.shortName, COL.projectIdCode, COL.internalProjectId,
  COL.technology, COL.totalCapacity, COL.weightedMw, COL.approvalState,
  COL.spoSharepointUrl, COL.spoTeamsUrl, COL.projectStartDate, COL.netYieldP50,
  COL.m1FeasibilityStudies, COL.m2ProjectDevelopmentStarted, COL.m3ApplicationSubmitted,
  COL.m4LegallyBindingPermits, COL.m5Construction,
  COL.country, COL.area, COL.clusterState, COL.projectManager,
];

/* ══════════════════════════════════════════════════════════════ the filter ══ */

export type CapacityOperator =
  | "Equals"
  | "Greater than"
  | "Greater than or equal to"
  | "Less than"
  | "Less than or equal to";

/**
 * `colFilterOperators`, in the canvas's order. The stored value **is** the display string,
 * not a code — `First(colFilterOperators).Name` is the fallback the capacity box uses.
 */
export const CAPACITY_OPERATORS: readonly CapacityOperator[] = [
  "Equals",
  "Greater than",
  "Greater than or equal to",
  "Less than",
  "Less than or equal to",
];

const CAPACITY_ODATA: Record<CapacityOperator, "eq" | "gt" | "ge" | "lt" | "le"> = {
  "Equals": "eq",
  "Greater than": "gt",
  "Greater than or equal to": "ge",
  "Less than": "lt",
  "Less than or equal to": "le",
};

export interface ProjectFilter {
  keyword: string;
  /** An Entra object id, matching `_vsb_projectmanager_value`. */
  projectManagerId: string | null;
  countryId: string | null;
  areaId: string | null;
  technology: number | null;
  /** Raw text, exactly as the canvas stored it. Validation is a separate rule. */
  capacity: string;
  capacityOperator: CapacityOperator | "";
  clusterStateId: string | null;
}

export const EMPTY_FILTER: ProjectFilter = {
  keyword: "",
  projectManagerId: null,
  countryId: null,
  areaId: null,
  technology: null,
  capacity: "",
  capacityOperator: "",
  clusterStateId: null,
};

/** The canvas requires three characters before the keyword search applies at all. */
export const KEYWORD_MIN = 3;

/**
 * The keyword clause.
 *
 * Canvas: `Or(kw in 'Project Name', kw in 'Project ID', kw in 'Internal Project ID',
 *             kw in 'Short Name')`, skipped entirely below three characters.
 * Power Fx `in` on text is a case-insensitive substring test, which is what Dataverse's
 * `contains` is.
 *
 * SKELETON FIX 1 — the fourth field is 'Project ID' (`vsb_name`), not the country area.
 */
export function keywordClause(keyword: string): string | undefined {
  const q = keyword.trim();
  if (q.length < KEYWORD_MIN) return undefined;
  return f.or(
    f.contains(COL.name, q),
    f.contains(COL.projectIdCode, q),
    f.contains(COL.internalProjectId, q),
    f.contains(COL.shortName, q),
  );
}

/**
 * Typing a capacity with no operator defaults it to "Equals"
 * (`First(colFilterOperators).Name`). Shared by the input's change handler and the filter
 * builder so the two cannot drift. Null when there is no capacity to compare.
 */
export function resolveCapacityOperator(
  capacity: string,
  operator: CapacityOperator | "",
): CapacityOperator | null {
  if (!capacity.trim()) return null;
  return operator === "" ? CAPACITY_OPERATORS[0] ?? null : operator;
}

/** `lbl_..._Capacity_ErrorMessage` — `fn_Numeric.IsTwoDecimal`. Null when valid or blank. */
export function capacityError(capacity: string, locale?: string): string | null {
  const v = capacity.trim();
  if (!v) return null;
  // The canvas IsTwoDecimal accepts a leading minus; see docs/01-BUGS-FOUND.md B-2.
  return isDecimal(v, { places: 2, allowNegative: true, locale })
    ? null
    : "Value must be a numeric";
}

export function capacityClause(
  capacity: string,
  operator: CapacityOperator | "",
  locale?: string,
): string | undefined {
  const op = resolveCapacityOperator(capacity, operator);
  if (!op) return undefined;
  if (capacityError(capacity, locale)) return undefined;
  const n = parseNumber(capacity, locale);
  if (n === undefined) return undefined;
  return f[CAPACITY_ODATA[op]](COL.totalCapacity, n);
}

/**
 * One `$filter`, with each clause **omitted when its filter is blank** — which is what the
 * canvas's `Or(IsBlank(x), field = x)` per-clause idiom means.
 *
 * Returns undefined when nothing applies, so the request carries no `$filter` at all rather
 * than an empty string.
 */
export function buildProjectFilter(
  filter: ProjectFilter,
  locale?: string,
): string | undefined {
  return f.and(
    keywordClause(filter.keyword),
    filter.projectManagerId ? f.lookupEq("vsb_projectmanager", filter.projectManagerId) : undefined,
    filter.countryId ? f.lookupEq("vsb_country", filter.countryId) : undefined,
    filter.areaId ? f.lookupEq("vsb_countryarea", filter.areaId) : undefined,
    filter.technology !== null ? f.eq(COL.technology, filter.technology) : undefined,
    capacityClause(filter.capacity, filter.capacityOperator, locale),
    filter.clusterStateId ? f.lookupEq("vsb_clusterstate", filter.clusterStateId) : undefined,
  );
}

/**
 * The two cascades: clearing (or changing) Country clears Area, and clearing Capacity clears
 * its operator. Also applies the operator default, so a capacity typed with no operator is
 * never left in a state that filters nothing.
 *
 * Returns `cur` unchanged when the patch is a no-op, so a memoised consumer keeps a stable
 * reference and does not re-render forever.
 */
export function applyFilterPatch(
  cur: ProjectFilter,
  patch: Partial<ProjectFilter>,
): ProjectFilter {
  const next: ProjectFilter = { ...cur, ...patch };

  if ("countryId" in patch && patch.countryId !== cur.countryId) next.areaId = null;

  if ("capacity" in patch) {
    if (!String(patch.capacity ?? "").trim()) next.capacityOperator = "";
    else if (next.capacityOperator === "") next.capacityOperator = CAPACITY_OPERATORS[0] ?? "";
  }

  const keys = Object.keys(EMPTY_FILTER) as (keyof ProjectFilter)[];
  return keys.every((k) => next[k] === cur[k]) ? cur : next;
}

/** True when any filter is set — drives the "clear all" affordance. */
export function isFilterActive(filter: ProjectFilter): boolean {
  const keys = Object.keys(EMPTY_FILTER) as (keyof ProjectFilter)[];
  return keys.some((k) => filter[k] !== EMPTY_FILTER[k]);
}

/**
 * The per-filter funnel icon flips between filled and outline and is disabled while its
 * filter is blank — `ico_Main_Project_Overview_Context_Filter_*`.
 */
export function clearIconState(value: unknown): { active: boolean; disabled: boolean } {
  const blank =
    value === null || value === undefined || value === "" ||
    (Array.isArray(value) && value.length === 0);
  return { active: !blank, disabled: blank };
}

/* ═════════════════════════════════════════════════════════════════ sorting ══ */

/**
 * The columns that may reach `$orderby`. An allow-list, not interpolation: an unexpected
 * value is a 400 against Dataverse.
 *
 * Status, Project Manager, Country and Area are deliberately absent — they are lookup
 * FormattedValues, and ordering by them needs `$orderby` over a navigation path. Sorting
 * them client-side within one page would order the page differently from the table, which is
 * a lie visible at every page boundary, so the grid marks them unsortable instead.
 */
export const SORTABLE: readonly string[] = [
  COL.name, COL.shortName, COL.internalProjectId, COL.technology,
  COL.totalCapacity, COL.weightedMw, COL.approvalState, COL.projectStartDate,
  COL.m1FeasibilityStudies, COL.m2ProjectDevelopmentStarted, COL.m3ApplicationSubmitted,
  COL.m4LegallyBindingPermits, COL.m5Construction,
];

export interface SortState { col: string; asc: boolean }

/** `SortCol: "vsb_projectname", SortAsc: true` from `colFiltersOverview`. */
export const DEFAULT_SORT: SortState = { col: COL.name, asc: true };

export const resolveSortColumn = (col: string): string =>
  SORTABLE.includes(col) ? col : DEFAULT_SORT.col;

/** Clicking the sorted column flips direction; any other column starts ascending. */
export function nextSortState(cur: SortState, clicked: string): SortState {
  const col = resolveSortColumn(clicked);
  return col === cur.col ? { col, asc: !cur.asc } : { col, asc: true };
}

/* ══════════════════════════════════════════════════════════════ the rows ══ */

export interface ProjectRow {
  id: string;
  name: string;
  shortName: string;
  /** The Status column — the Cluster State lookup's name. */
  statusName: string;
  managerName: string;
  countryName: string;
  areaName: string;
  technology: string;
  totalCapacity: number | null;
  weightedMw: number | null;
  /** What the grid's "Project ID" column shows. */
  internalProjectId: string;
  /** `vsb_name` — used to derive names on the Cost screens. */
  projectIdCode: string;
  approvalState: number | null;
  approvalLabel: string;
  milestones: (string | null)[];
  projectStartDate: string | null;
  netYieldP50: number | null;
  spoSharepointUrl: string | null;
  spoTeamsUrl: string | null;
  clusterStateId: string | null;
  countryId: string | null;
  /** The 4 px left accent bar. Undefined means no bar. */
  accentColor: string | undefined;
}

const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const txt = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

export function toProjectRow(r: Record<string, unknown>): ProjectRow {
  const approvalState = num(r[COL.approvalState]);
  const statusName = str(r[fv(COL.clusterState)]);
  return {
    id: str(r[COL.id]),
    name: str(r[COL.name]),
    shortName: str(r[COL.shortName]),
    statusName,
    managerName: str(r[fv(COL.projectManager)]),
    countryName: str(r[fv(COL.country)]),
    areaName: str(r[fv(COL.area)]),
    technology: technologyLabel(r[COL.technology], r[fv(COL.technology)]),
    totalCapacity: num(r[COL.totalCapacity]),
    weightedMw: num(r[COL.weightedMw]),
    internalProjectId: str(r[COL.internalProjectId]),
    projectIdCode: str(r[COL.projectIdCode]),
    approvalState,
    approvalLabel: str(r[fv(COL.approvalState)]) || approvalDecoration(approvalState).label,
    milestones: [
      txt(r[COL.m1FeasibilityStudies]),
      txt(r[COL.m2ProjectDevelopmentStarted]),
      txt(r[COL.m3ApplicationSubmitted]),
      txt(r[COL.m4LegallyBindingPermits]),
      txt(r[COL.m5Construction]),
    ],
    projectStartDate: txt(r[COL.projectStartDate]),
    netYieldP50: num(r[COL.netYieldP50]),
    spoSharepointUrl: txt(r[COL.spoSharepointUrl]),
    spoTeamsUrl: txt(r[COL.spoTeamsUrl]),
    clusterStateId: txt(r[COL.clusterState]),
    countryId: txt(r[COL.country]),
    accentColor: rowAccentColor(approvalState, statusName),
  };
}

/* ═══════════════════════════════════════════════════════════ formatting ══ */

/**
 * `Text('Total Capacity', "#,##0.0#")` — one mandatory decimal, a second only when non-zero.
 * The screenshot shows both `136.0` and `47.13`, so the fraction digits are a range.
 */
export function formatCapacity(v: number | null | undefined, locale = "en-GB"): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "";
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  }).format(v);
}

/** `Text(DateValue(x), "dd.mm.yyyy")` — the grid's date format. */
export function formatGridDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

/* ════════════════════════════════════════════════════════ the cost module ══ */

export interface CostLockInput {
  projectStartDate: string | null;
  totalCapacity: number | null;
  netYieldP50: number | null;
  statusName: string | null;
}

/**
 * The prerequisites the "cannot edit costs yet" dialog lists, in the canvas's order.
 */
export function costModuleLock(p: CostLockInput): string[] {
  const out: string[] = [];
  if (!p.projectStartDate) out.push("Milestones");
  if (!p.totalCapacity) out.push("Generator");
  if (!p.netYieldP50) out.push("Production");
  if (p.statusName === "Draft") out.push("Change the project status from Draft");
  return out;
}

/**
 * Whether Edit Costs is actually blocked.
 *
 * The gate is the Draft test **alone** — the canvas handler is
 * `If(varProjectRecord.'Cluster State'.Name = "Draft", <show popup>, <launch cost app>)`.
 * A project with a blank start date but a status of "Cluster 2" is NOT blocked, even though
 * `costModuleLock` still lists "Milestones". Conflating the list with the gate is the easy
 * mistake here; both are tested.
 */
export const isCostModuleLocked = (p: CostLockInput): boolean => p.statusName === "Draft";

/* ════════════════════════════════════════════════════════ the command bar ══ */

export type CommandKey =
  | "addProject"
  | "editProject"
  | "editCosts"
  | "deleteProject"
  | "simulateProject"
  | "viewSharepoint"
  | "viewTeams"
  | "viewProjectOverviewPowerBI"
  | "viewPortfolioOverviewPowerBI"
  | "viewDashboardFunctionality";

export interface CommandState {
  key: CommandKey;
  visible: boolean;
  enabled: boolean;
  label: string;
  /** A Fluent icon NAME. The screen maps it to a component, so this stays React-free. */
  icon: string;
  /** Why it is disabled, for a tooltip. Undefined when enabled. */
  reason?: string;
}

/**
 * `colReportViewers`, transcribed from `Project Main Screen.OnVisible`.
 *
 * SKELETON FIX 4 — the skeleton's list had philip.wagner, ext-chhitiz.buchasia and
 * ext-matthias.vierkoetter, which are not in the canvas, and was missing andreas.laeubli,
 * ravindra.mund and test-vsbcloud-01. This is the canvas list.
 *
 * A hard-coded address list gating a feature belongs in an environment variable before
 * go-live; recorded in docs/02-OPEN-DECISIONS.md.
 */
export const REPORT_VIEWERS: readonly string[] = [
  "alexander.pilevski@vsb.energy",
  "andreas.laeubli@vsb.energy",
  "andriy.chevychalov@vsb.energy",
  "dominik.simon@vsb.energy",
  "christoph.sperling@vsb.energy",
  "thomas.lorenz@vsb.energy",
  "benjamin.goepfert@vsb.energy",
  "ravindra.mund@vsb.energy",
  "test-vsbcloud-01@vsb.energy",
  "test-vsbcloud-02@vsb.energy",
];

const SELECT_FIRST = "Select a project first.";

/** The selected row reduced to exactly what the ten gates branch on. */
export interface SelectedProject {
  id: string;
  name: string;
  approvalState: number | null;
  statusName: string | null;
  /** From the `Project States` lookup, not from the project row. */
  statusOrder: number | null;
  countryName: string | null;
  spoSharepointUrl: string | null;
  spoTeamsUrl: string | null;
}

export interface CommandBarContext {
  selected: SelectedProject | null;
  /** `DataSourceInfo(Projects, CreatePermission)` — answered by the server. */
  canCreate: boolean;
  /** `RecordInfo(record, EditPermission)` — per record, from the server. */
  canEditSelected: boolean;
  userMail: string | null;
  /** `colAnalyticsAppUsers`, from the `vsb_AnalyticsAppUsers` environment variable. */
  analyticsAppUsers: readonly string[];
  reportViewers?: readonly string[];
}

/**
 * The ten commands, with the canvas's gates.
 *
 * The subtlety worth naming: Edit Project and Edit Costs are gated on **selection only**.
 * Lacking edit rights changes the *label* to "View Project" / "View Costs" and the icon to
 * `ReadingMode` — it does not disable the command. Getting that backwards is what the
 * label-degradation test exists to catch.
 */
export function commandBarState(ctx: CommandBarContext): Record<CommandKey, CommandState> {
  const {
    selected, canCreate, canEditSelected, userMail,
    analyticsAppUsers, reportViewers = REPORT_VIEWERS,
  } = ctx;

  const has = Boolean(selected);
  const mail = (userMail ?? "").trim().toLowerCase();
  const inList = (list: readonly string[]) =>
    list.some((v) => v.trim().toLowerCase() === mail);
  const bothSpoUrls = Boolean(selected?.spoSharepointUrl && selected?.spoTeamsUrl);
  const isCroatia = selected?.countryName === "Croatia";

  const st = (
    key: CommandKey, visible: boolean, enabled: boolean,
    label: string, icon: string, reason?: string,
  ): [CommandKey, CommandState] => [
    key, { key, visible, enabled, label, icon, ...(enabled ? {} : { reason }) },
  ];

  return Object.fromEntries([
    st("addProject", true, canCreate, "Add Project", "Add", "You cannot create projects."),
    st(
      "editProject", true, has,
      canEditSelected ? "Edit Project" : "View Project",
      canEditSelected ? "Edit" : "ReadingMode",
      SELECT_FIRST,
    ),
    st(
      "editCosts", true, has,
      canEditSelected ? "Edit Costs" : "View Costs",
      canEditSelected ? "Edit" : "ReadingMode",
      SELECT_FIRST,
    ),
    st(
      "deleteProject", true,
      // An approved project cannot be deleted, whatever your privileges.
      has && canEditSelected && selected?.approvalState !== APPROVAL_STATE.approved,
      "Delete Project", "Delete",
      !has
        ? SELECT_FIRST
        : selected?.approvalState === APPROVAL_STATE.approved
          ? "An approved project cannot be deleted."
          : "You do not have permission to delete this project.",
    ),
    st(
      "simulateProject",
      // SKELETON FIX 2 — the canvas gate is `User().Email in colAnalyticsAppUsers`.
      inList(analyticsAppUsers),
      has && canEditSelected && (selected?.statusOrder ?? 0) > 0,
      "Simulate", "Play",
      "Simulation needs a saved project past Draft.",
    ),
    st(
      "viewSharepoint", isCroatia, has && bothSpoUrls,
      "View Sharepoint Site", "View",
      has ? "This project has no SharePoint site yet." : SELECT_FIRST,
    ),
    st(
      "viewTeams", isCroatia, has && bothSpoUrls,
      "View Teams", "View",
      has ? "This project has no Teams site yet." : SELECT_FIRST,
    ),
    st(
      "viewProjectOverviewPowerBI", inList(reportViewers), has,
      "Show Project Overview (Beta)", "View", SELECT_FIRST,
    ),
    // SKELETON FIX 3 — no ItemEnabled in the canvas, so always enabled.
    st(
      "viewPortfolioOverviewPowerBI", inList(reportViewers), true,
      "Show Portfolio Overview (Beta)", "View",
    ),
    st("viewDashboardFunctionality", true, true, "Dashboard", "BIDashboard"),
  ]) as Record<CommandKey, CommandState>;
}

/* ══════════════════════════════════════════════════════════════════ paging ══ */

/** The canvas page size — `colFiltersOverview.PageSize`. */
export const PAGE_SIZE = 200;

export interface PageState {
  /** 1-based. */
  page: number;
  pageSize: number;
  totalRows: number;
  /**
   * The server's own page count, when the list is not a single evenly divided run.
   *
   * `loadProjectPage` serves projects as TWO ordered segments — those with a value in the
   * sorted column, then those without — so the last page of the first segment can be short and
   * `ceil(total / size)` would under-count. Left out, the even division still applies.
   */
  totalPages?: number;
}

/**
 * `RoundUp(total / size, 0) + If(total = 0, 1, 0)` — the canvas shows "Page: 1 from 1" for an
 * empty list rather than "from 0".
 */
export function totalPages(totalRows: number, pageSize = PAGE_SIZE): number {
  if (pageSize <= 0) return 1;
  return totalRows === 0 ? 1 : Math.ceil(totalRows / pageSize);
}

/**
 * A page beyond the end snaps back to 1, which is what the canvas `adjustedPage` does.
 *
 * Still used by `pagerLabels`. It is NOT used to decide whether Next is available: Dataverse
 * caps `@odata.count` at 5000, so past that the count would under-report the page total,
 * whereas the skip token the server hands back is always the truth. See
 * `data/client.ts` → `countedPage`.
 */
export function clampPage(
  page: number,
  totalRows: number,
  pageSize = PAGE_SIZE,
  pages = totalPages(totalRows, pageSize),
): number {
  if (!Number.isFinite(page) || page < 1) return 1;
  return page > pages ? 1 : Math.floor(page);
}

/** `Total Rows: 1129` and `Page: 1 from 6`. */
export function pagerLabels(state: PageState): { totalRows: string; page: string } {
  const pages = state.totalPages ?? totalPages(state.totalRows, state.pageSize);
  return {
    totalRows: `Total Rows: ${state.totalRows}`,
    page: `Page: ${clampPage(state.page, state.totalRows, state.pageSize, pages)} from ${pages}`,
  };
}

/* ══════════════════════════════════════════════════ URL serialisation ══ */

export interface Criteria {
  filter: ProjectFilter;
  sort: SortState;
  /** 1-based. */
  page: number;
}

export const DEFAULT_CRITERIA: Criteria = {
  filter: EMPTY_FILTER,
  sort: DEFAULT_SORT,
  page: 1,
};

/**
 * Search-parameter names. Short, because they end up in URLs people paste to each other,
 * and frozen, because a rename silently invalidates every link already sent.
 */
const PARAM = {
  keyword: "q",
  projectManagerId: "pm",
  countryId: "c",
  areaId: "a",
  technology: "t",
  capacity: "cap",
  capacityOperator: "capop",
  clusterStateId: "st",
  sortCol: "sort",
  sortDir: "dir",
  page: "p",
} as const;

const isCapacityOperator = (v: string): v is CapacityOperator =>
  (CAPACITY_OPERATORS as readonly string[]).includes(v);

/**
 * Read the criteria out of a query string.
 *
 * Every field is validated, never trusted: a hand-edited URL is untrusted input that would
 * otherwise reach `$orderby` and `$filter`. Nothing here can throw — a bad link must render
 * the default list, not an error boundary.
 */
export function parseCriteria(params: URLSearchParams): Criteria {
  const s = (k: string): string => params.get(k) ?? "";
  const id = (k: string): string | null => s(k).trim() || null;

  const capacity = s(PARAM.capacity).trim();
  const rawOperator = s(PARAM.capacityOperator).trim();

  const filter: ProjectFilter = {
    keyword: s(PARAM.keyword),
    projectManagerId: id(PARAM.projectManagerId),
    countryId: id(PARAM.countryId),
    areaId: id(PARAM.areaId),
    technology: technologyValue(s(PARAM.technology)),
    capacity,
    capacityOperator: isCapacityOperator(rawOperator) ? rawOperator : "",
    clusterStateId: id(PARAM.clusterStateId),
  };

  // A capacity with no usable operator is a filter that silently does nothing.
  if (capacity && filter.capacityOperator === "") {
    filter.capacityOperator = resolveCapacityOperator(capacity, "") ?? "";
  }
  // An area without a country is unreachable through the UI, so the link is malformed.
  if (!filter.countryId) filter.areaId = null;

  const page = Number.parseInt(s(PARAM.page), 10);
  return {
    filter,
    sort: { col: resolveSortColumn(s(PARAM.sortCol)), asc: s(PARAM.sortDir) !== "desc" },
    page: Number.isFinite(page) && page >= 1 ? page : 1,
  };
}

/**
 * Write the criteria back, omitting everything at its default so a pristine list has a clean
 * URL rather than eleven empty parameters.
 */
export function serialiseCriteria(c: Criteria): URLSearchParams {
  const p = new URLSearchParams();
  const put = (k: string, v: string | null | undefined) => {
    if (v !== null && v !== undefined && v !== "") p.set(k, v);
  };

  put(PARAM.keyword, c.filter.keyword.trim());
  put(PARAM.projectManagerId, c.filter.projectManagerId);
  put(PARAM.countryId, c.filter.countryId);
  put(PARAM.areaId, c.filter.areaId);
  put(PARAM.technology, c.filter.technology === null ? "" : String(c.filter.technology));
  put(PARAM.capacity, c.filter.capacity.trim());
  // Only meaningful alongside a capacity.
  if (c.filter.capacity.trim()) put(PARAM.capacityOperator, c.filter.capacityOperator);
  put(PARAM.clusterStateId, c.filter.clusterStateId);

  if (c.sort.col !== DEFAULT_SORT.col) put(PARAM.sortCol, c.sort.col);
  if (!c.sort.asc) put(PARAM.sortDir, "desc");
  if (c.page > 1) put(PARAM.page, String(c.page));

  return p;
}

/* ═════════════════════════════════════════════════ project manager picker ══ */

export interface PersonOption {
  /** The Entra object id — what `_vsb_projectmanager_value` holds. */
  id: string;
  label: string;
  mail: string | null;
}

/**
 * Which loaded people match what was typed.
 *
 * Word-wise, not one substring: typing "Shakti Singh" must match both "Shakti Singh" and
 * "Singh Rajput, Shakti (external)", and the surname-first form fails a plain
 * `includes("shakti singh")`. So every typed word must appear somewhere in the name or the
 * mail, in any order.
 *
 * An empty query returns nothing: the suggestion panel opens only once something is typed,
 * never as a click-to-browse-everyone list.
 */
export function filterPeople(
  people: readonly PersonOption[],
  query: string,
  limit = 8,
): PersonOption[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return people
    .filter((p) => {
      const haystack = `${p.label} ${p.mail ?? ""}`.toLowerCase();
      return words.every((w) => haystack.includes(w));
    })
    .slice(0, limit);
}
