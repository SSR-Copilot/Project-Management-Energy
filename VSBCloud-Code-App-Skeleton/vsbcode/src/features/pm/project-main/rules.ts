/**
 * Project Main Screen — business rules.
 * 101 controls, 2,502 loc, 27 substantive blocks, band M.
 *
 * The canvas screen is a seven-field filter bar over `colFiltersOverview` feeding a
 * `FluentDetailsList` of `colFilteredProjects`, with a ten-item command bar whose `Items`
 * table carries a distinct permission, environment, country and allow-list gate per command.
 * All of that is pure, so all of it lives here.
 *
 * What changed from the first cut of this file, and why:
 *
 *  - `applyFilter` is **gone**, not kept as a `…CanvasParity` helper. The canvas did not
 *    filter client-side — it ran `Filter(Projects, And(...))` on the server. That function was
 *    a rebuild artefact, so there is no parity to preserve; keeping it would be preserving our
 *    own bug under a convention meant for theirs. `buildProjectFilter` replaces it.
 *  - `commandGates` is **replaced** by `commandBarState`. The old version computed ten gates
 *    for a seven-command bar under key names that did not match the spec, had no concept of
 *    `visible` or of the View/Edit label degradation, and computed an `edit` gate that no
 *    command consumed.
 *
 * SOURCE DEFECT (filtering by id, not by name): the canvas compares related-entity *names* —
 * `'Area/State/Province'.Name = <filter>` and `'Cluster State'.'Project State' = <filter>`.
 * Reaching a related name server-side needs `$expand`, which the mock backend does not
 * implement and which Dataverse charges for, so this filters on the lookup GUID instead. Side
 * effect: it fixes a canvas bug where two identically-named areas in different countries
 * matched each other. `buildProjectFilterCanvasParity` keeps the name form reachable and both
 * are pinned by tests.
 */
import { CHOICE } from "@/data/entities";
import { f } from "@/platform/odata";
import { technologyLabel, technologyValue } from "@/domain/technology";
import type { SortRequest } from "@/data/projectQueries";
import type { CurrentUser } from "@/domain/session";
import { isTwoDecimal, parseNumber, type Lang } from "@/domain/numeric";
import { approvalDecoration, rowAccentColor } from "@/domain/approval";

/* ════════════════════════════════════════════════════════════ column names ════ */

/**
 * The `Projects` columns this screen reads.
 *
 * Every read goes through this map — no mapper, filter builder or test holds a column
 * literal — so correcting a logical name after `pac code add-data-source` is a one-line edit
 * here. Most of these are already in use elsewhere in the repo (`vsb_shortname`,
 * `vsb_approvalstates` and the `vsb_1..5` milestone chain from `features/general-data`), so
 * they are consistent rather than freshly guessed. The genuinely inferred ones are listed in
 * `PROJECT_MAIN_COL_UNVERIFIED`.
 */
export const PROJECT_MAIN_COL = {
  id: "vsb_projectid",
  /** 'Project Name'. NOT `vsb_name` — that is the auto-numbered primary column. */
  name: "vsb_projectname",
  shortName: "vsb_shortname",
  /**
   * 'Internal Project ID' — the 8-digit key the grid's "Project ID" column and the General
   * Data screen's read-only "Project ID" box both show.
   *
   * Two columns claim that display name: `vsb_name` is titled "Project ID" in the metadata
   * but is the auto-numbered primary column, and the canvas only reads it as a fallback seed
   * (`If(IsBlank('Internal Project ID'), 'Project ID', 'Internal Project ID')`). The one the
   * UI shows is this.
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
  projectManager: "_vsb_projectmanager_value",
} as const;

export type ProjectMainColKey = keyof typeof PROJECT_MAIN_COL;

/**
 * Previously the keys whose logical name was inferred from a canvas display name.
 *
 * Now EMPTY: every name in `PROJECT_MAIN_COL` was checked against `customizations.xml` in
 * the solution export (`<entity Name="vsb_Project">`, 112 attributes). Six were wrong and are
 * corrected above:
 *
 *   vsb_name                        -> vsb_projectname          ('Project Name')
 *   vsb_internalprojectid               -> vsb_internalprojectid    ('Internal Project ID')
 *   vsb_sposharepointurl                  -> vsb_sposharepointurl     ('SPO Sharepoint URL')
 *   _vsb_countryarea_value    -> _vsb_countryarea_value   ('Area/State/Province')
 *   vsb_feasibilitystudies         -> vsb_feasibilitystudies   ('1-Feasibility studies')
 *   vsb_2..5<milestone>             -> the un-numbered forms
 *
 * Keep the array (and the test that reads it) so a future inferred name has somewhere to go.
 */
export const PROJECT_MAIN_COL_UNVERIFIED: readonly ProjectMainColKey[] = [
] as const;

/** `<col>@OData.Community.Display.V1.FormattedValue` — a lookup or choice label. */
export const fv = (col: string): string => `${col}@OData.Community.Display.V1.FormattedValue`;

/* ══════════════════════════════════════════════════════════════ technology ════ */

/**
 * Re-exported from `@/domain/technology`. They moved there because
 * `features/shared/useProjectContext.ts` needs the label too — it maps a project row into the
 * store, and the app header renders `technology` straight out of it, so without a shared
 * resolver the header shows the raw option-set integer.
 */
export { TECHNOLOGY_LABEL, technologyValue, technologyLabel } from "@/domain/technology";

/* ═══════════════════════════════════════════════════════════════ the filter ════ */

export type CapacityOperator =
  | "Equals"
  | "Greater than"
  | "Greater than or equal to"
  | "Less than"
  | "Less than or equal to";

/**
 * `colFilterOperators`, in the canvas's order.
 *
 * The stored value **is** the display string, not a code — `First(colFilterOperators).Name`
 * is what the capacity box falls back to. Preserved verbatim.
 */
export const CAPACITY_OPERATORS: readonly CapacityOperator[] = [
  "Equals",
  "Greater than",
  "Greater than or equal to",
  "Less than",
  "Less than or equal to",
];

const CAPACITY_ODATA_OP: Record<CapacityOperator, "eq" | "gt" | "ge" | "lt" | "le"> = {
  Equals: "eq",
  "Greater than": "gt",
  "Greater than or equal to": "ge",
  "Less than": "lt",
  "Less than or equal to": "le",
};

export interface ProjectListFilter {
  keyword: string;
  /** `vsb_microsoftentraids` ROW id — not the AAD object id. See the note on the picker. */
  projectManagerId: string | null;
  countryId: string | null;
  areaId: string | null;
  technology: number | null;
  /** Raw text, exactly as the canvas stored it. Validation is a separate rule. */
  capacity: string;
  capacityOperator: CapacityOperator | "";
  clusterStateId: string | null;
}

export const emptyProjectListFilter: ProjectListFilter = {
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

/** Rules 4 and 5 — skipped below three characters; four `contains()` OR-ed when applied. */
export function keywordClause(keyword: string): string | undefined {
  const q = keyword.trim();
  if (q.length < KEYWORD_MIN) return undefined;
  return f.or(
    f.contains(PROJECT_MAIN_COL.name, q),
    f.contains(PROJECT_MAIN_COL.internalProjectId, q),
    f.contains(PROJECT_MAIN_COL.shortName, q),
    f.contains(PROJECT_MAIN_COL.area, q),
  );
}

/**
 * Rule 7 — typing a capacity with no operator defaults the operator to `"Equals"`
 * (`First(colFilterOperators).Name`).
 *
 * Called by both the capacity input's change handler and `buildProjectFilter`, so the two
 * cannot drift. Returns null when there is no capacity to compare.
 */
export function resolveCapacityOperator(
  capacity: string,
  operator: CapacityOperator | "",
): CapacityOperator | null {
  if (!capacity.trim()) return null;
  return operator === "" ? CAPACITY_OPERATORS[0] : operator;
}

/* ═══════════════════════════════════════════════════════ project manager typeahead ════ */

/**
 * The Project Manager filter's own shape — a name plus the email the "Suggested People" panel
 * shows on its second line.
 *
 * GUIDE p07: the field is not a plain dropdown of every enabled account, it is a typeahead —
 * type a few characters, a "Suggested People" panel opens below with an avatar, the display
 * name and the email. Screen.tsx renders the panel; this is the pure part of it: which of the
 * loaded people match what was typed.
 */
export interface PersonOption {
  id: string;
  label: string;
  mail: string | null;
}

/**
 * GUIDE p07 — matches the typed text against a person's name or email, case-insensitively, and
 * caps the panel at `limit` rows the way the screenshot's two-entry panel implies a bounded
 * list rather than the whole directory.
 *
 * Word-wise, not one substring: typing "Shakti Singh" (p07) matches BOTH "Shakti Singh" and
 * "Singh Rajput, Shakti (external)" — the surname-first form would fail a plain
 * `includes("shakti singh")` test, so every typed word must appear somewhere in the name or
 * email, in any order.
 *
 * Empty query returns no suggestions: the field opens the panel only once something is typed
 * (GUIDE p06/p09 — idle, nothing typed, no panel), never as a click-to-browse-everyone list.
 */
export function filterPeopleSuggestions(
  people: readonly PersonOption[],
  query: string,
  limit = 8,
): PersonOption[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return people
    .filter((p) => {
      const haystack = `${p.label} ${p.mail ?? ""}`.toLowerCase();
      return words.every((w) => haystack.includes(w));
    })
    .slice(0, limit);
}

/** Rule 8 / the Validation block — `fn_Numeric.IsTwoDecimal`. Null when valid or blank. */
export function capacityFieldError(capacity: string, lang: Lang = "en-US"): string | null {
  const v = capacity.trim();
  if (!v) return null;
  return isTwoDecimal(v, lang) ? null : "Value must be a numeric";
}

export function capacityClause(
  capacity: string,
  operator: CapacityOperator | "",
  lang: Lang = "en-US",
): string | undefined {
  const op = resolveCapacityOperator(capacity, operator);
  if (!op) return undefined;
  if (capacityFieldError(capacity, lang)) return undefined;
  const n = parseNumber(capacity, lang);
  if (!Number.isFinite(n)) return undefined;
  return f[CAPACITY_ODATA_OP[op]](PROJECT_MAIN_COL.totalCapacity, n);
}

/**
 * Rule 3 — one `Filter(Projects, And(...))`, where each clause is **omitted when its filter
 * is blank**. That is what the canvas's `Or(IsBlank(x), field = x)` per-clause idiom means.
 *
 * Returns `undefined` when nothing applies, so `Query.filter` is left off the request
 * entirely rather than sent as an empty string.
 *
 * Every join goes through `f.and`/`f.or` and every leaf through an `f.*` builder — never
 * string concatenation. That is not style: the mock's `evalFilter` folds boolean operators
 * strictly left to right, so `A or B and C` would evaluate as `(A or B) and C`. The builders
 * parenthesise each operand, which is what keeps the mock and live Dataverse in agreement.
 */
export function buildProjectFilter(
  filter: ProjectListFilter,
  lang: Lang = "en-US",
): string | undefined {
  return f.and(
    keywordClause(filter.keyword),
    filter.projectManagerId
      ? f.guid(PROJECT_MAIN_COL.projectManager, filter.projectManagerId)
      : undefined,
    filter.countryId ? f.guid(PROJECT_MAIN_COL.country, filter.countryId) : undefined,
    filter.areaId ? f.guid(PROJECT_MAIN_COL.area, filter.areaId) : undefined,
    filter.technology !== null ? f.eq(PROJECT_MAIN_COL.technology, filter.technology) : undefined,
    capacityClause(filter.capacity, filter.capacityOperator, lang),
    filter.clusterStateId
      ? f.guid(PROJECT_MAIN_COL.clusterState, filter.clusterStateId)
      : undefined,
  );
}

/**
 * The canvas's name-comparison form, kept only so the divergence documented at the top of
 * this file is pinned by a test rather than asserted in prose. Not used by the screen: it
 * needs `$expand` to work against a real service.
 */
export function buildProjectFilterCanvasParity(
  filter: ProjectListFilter & { areaName: string | null; projectStateName: string | null },
  lang: Lang = "en-US",
): string | undefined {
  return f.and(
    keywordClause(filter.keyword),
    filter.projectManagerId
      ? f.guid(`${PROJECT_MAIN_COL.projectManager}/Id`, filter.projectManagerId)
      : undefined,
    filter.countryId ? f.guid(PROJECT_MAIN_COL.country, filter.countryId) : undefined,
    filter.areaName ? f.eq("vsb_AreaStateProvince/vsb_name", filter.areaName) : undefined,
    filter.technology !== null ? f.eq(PROJECT_MAIN_COL.technology, filter.technology) : undefined,
    capacityClause(filter.capacity, filter.capacityOperator, lang),
    filter.projectStateName
      ? f.eq("vsb_ClusterState/vsb_name", filter.projectStateName)
      : undefined,
  );
}

/**
 * Rule 9's two cascades — clearing Country also clears Area; clearing Capacity also clears
 * CapacityOperator. Also applies rule 7's operator default, so a capacity typed with no
 * operator is never left in an un-filterable state.
 *
 * Returns `cur` unchanged when the patch is a no-op, so a Zustand selector reading this keeps
 * a stable reference — see the React error #185 note in CLAUDE.md.
 */
export function applyFilterPatch(
  cur: ProjectListFilter,
  patch: Partial<ProjectListFilter>,
): ProjectListFilter {
  const next: ProjectListFilter = { ...cur, ...patch };

  if ("countryId" in patch && !patch.countryId) next.areaId = null;
  // Changing country to a different one invalidates an area that belonged to the old one.
  if ("countryId" in patch && patch.countryId && patch.countryId !== cur.countryId) {
    next.areaId = null;
  }
  if ("capacity" in patch && !String(patch.capacity ?? "").trim()) next.capacityOperator = "";
  else if ("capacity" in patch && next.capacityOperator === "") {
    next.capacityOperator = CAPACITY_OPERATORS[0];
  }

  const unchanged = (Object.keys(next) as (keyof ProjectListFilter)[]).every(
    (k) => next[k] === cur[k],
  );
  return unchanged ? cur : next;
}

/** True when any filter is set — drives the "clear all" affordance. */
export const isFilterActive = (filter: ProjectListFilter): boolean =>
  (Object.keys(emptyProjectListFilter) as (keyof ProjectListFilter)[]).some(
    (k) => filter[k] !== emptyProjectListFilter[k],
  );

/**
 * Rule 10 — the per-filter clear icon flips between `ClearFilter` and `Filter` and is disabled
 * while that filter is blank.
 */
export function clearIconState(value: unknown): {
  icon: "ClearFilter" | "Filter";
  disabled: boolean;
} {
  const blank =
    value === null || value === undefined || value === "" || (Array.isArray(value) && !value.length);
  return { icon: blank ? "Filter" : "ClearFilter", disabled: blank };
}

/* ══════════════════════════════════════════════════════════════════ sorting ════ */

/**
 * The columns that may reach `$orderby`.
 *
 * An allow-list rather than raw interpolation: an unexpected value is a 400 against live
 * Dataverse and a silent no-op in mock.
 *
 * Status, Project Manager, Country and Area are deliberately absent. They are lookup
 * FormattedValues, and ordering by them needs `$orderby` on a navigation path — which the mock
 * cannot do and Dataverse only partly can. Sorting them client-side within a 200-row page
 * would order the page differently from the table, which is a lie visible at every page
 * boundary, so those columns are marked unsortable in the grid instead.
 */
export const SORTABLE_COLS: readonly string[] = [
  PROJECT_MAIN_COL.name,
  PROJECT_MAIN_COL.shortName,
  PROJECT_MAIN_COL.internalProjectId,
  PROJECT_MAIN_COL.technology,
  PROJECT_MAIN_COL.totalCapacity,
  PROJECT_MAIN_COL.weightedMw,
  PROJECT_MAIN_COL.approvalState,
  PROJECT_MAIN_COL.projectStartDate,
  PROJECT_MAIN_COL.m1FeasibilityStudies,
  PROJECT_MAIN_COL.m2ProjectDevelopmentStarted,
  PROJECT_MAIN_COL.m3ApplicationSubmitted,
  PROJECT_MAIN_COL.m4LegallyBindingPermits,
  PROJECT_MAIN_COL.m5Construction,
];

/** `SortCol: "vsb_projectname", SortAsc: true` from `colFiltersOverview`. */
export const DEFAULT_SORT: SortRequest = { col: PROJECT_MAIN_COL.name, asc: true };

export const resolveSortColumn = (col: string): string =>
  SORTABLE_COLS.includes(col) ? col : DEFAULT_SORT.col;

/** Rule 25 — sort persists into the filter row; clicking the same column flips direction. */
export function nextSortState(cur: SortRequest, clickedCol: string): SortRequest {
  const col = resolveSortColumn(clickedCol);
  return col === cur.col ? { col, asc: !cur.asc } : { col, asc: true };
}

/* ═══════════════════════════════════════════════════════════ the grid rows ════ */

export interface ProjectListRow {
  id: string;
  name: string;
  shortName: string;
  statusName: string;
  managerName: string;
  countryName: string;
  areaName: string;
  technologyLabel: string;
  totalCapacity: number | null;
  weightedMw: number | null;
  internalProjectId: string;
  approvalState: number | null;
  approvalLabel: string;
  /** The five milestone dates, in column order. */
  milestones: (string | null)[];
  clusterStateName: string | null;
  projectStartDate: string | null;
  netYieldP50: number | null;
  spoSharepointUrl: string | null;
  spoTeamsUrl: string | null;
  /** The 4px left accent bar — undefined means no bar. */
  accentColor: string | undefined;
}

const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const numOrNull = (v: unknown): number | null => (typeof v === "number" ? v : null);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

const C = PROJECT_MAIN_COL;

/** A `Projects` row as the grid needs it. Reads only through `PROJECT_MAIN_COL` and `fv()`. */
export function toProjectListRow(r: Record<string, unknown>): ProjectListRow {
  const approvalState = numOrNull(r[C.approvalState]);
  const clusterStateName = strOrNull(r[fv(C.clusterState)]);
  return {
    id: str(r[C.id]),
    name: str(r[C.name]),
    shortName: str(r[C.shortName]),
    statusName: clusterStateName ?? "",
    managerName: str(r[fv(C.projectManager)]),
    countryName: str(r[fv(C.country)]),
    areaName: str(r[fv(C.area)]),
    technologyLabel: technologyLabel(r[C.technology], r[fv(C.technology)]),
    totalCapacity: numOrNull(r[C.totalCapacity]),
    weightedMw: numOrNull(r[C.weightedMw]),
    internalProjectId: str(r[C.internalProjectId]),
    approvalState,
    approvalLabel: str(r[fv(C.approvalState)]) || approvalDecoration(approvalState).label,
    milestones: [
      strOrNull(r[C.m1FeasibilityStudies]),
      strOrNull(r[C.m2ProjectDevelopmentStarted]),
      strOrNull(r[C.m3ApplicationSubmitted]),
      strOrNull(r[C.m4LegallyBindingPermits]),
      strOrNull(r[C.m5Construction]),
    ],
    clusterStateName,
    projectStartDate: strOrNull(r[C.projectStartDate]),
    netYieldP50: numOrNull(r[C.netYieldP50]),
    spoSharepointUrl: strOrNull(r[C.spoSharepointUrl]),
    spoTeamsUrl: strOrNull(r[C.spoTeamsUrl]),
    accentColor: rowAccentColor(approvalState, clusterStateName),
  };
}

/* ══════════════════════════════════════════════════════════════ formatting ════ */

/**
 * `Text('Total Capacity', "#,##0.0#")` — one mandatory decimal, a second only when non-zero.
 *
 * Not the same as `formatWithSeparators(v, lang, 1)`: the screenshot shows both `136.0` and
 * `47.13`, so the fraction digits are a range, not a fixed count.
 */
export function formatCapacity(v: number | null | undefined, lang: Lang = "en-GB"): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "";
  return new Intl.NumberFormat(lang, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  }).format(v);
}

/** The grid's five milestone columns, formatted `"dd.mm.yyyy"`. */
export function formatMilestoneDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

/* ═════════════════════════════════════════════════════════ cost module lock ════ */

export interface CostLockInput {
  projectStartDate: string | null;
  totalCapacity: number | null;
  netYieldP50: number | null;
  clusterStateName: string | null;
}

/**
 * Rule 23 — the missing prerequisites the lock dialog lists, in the canvas's order.
 *
 * The dialog renders this array, which is why the canvas's `Switch`-over-the-same-conditions
 * container-height calculation disappears entirely.
 */
export function costModuleLock(p: CostLockInput): string[] {
  const out: string[] = [];
  if (!p.projectStartDate) out.push("Milestones");
  if (!p.totalCapacity) out.push("Generator");
  if (!p.netYieldP50) out.push("Production");
  if (p.clusterStateName === "Draft") out.push("Change the project status from Draft");
  return out;
}

/**
 * Rule 22 — whether Edit Costs is actually blocked.
 *
 * The gate is the Draft test **alone**. A project with a blank start date but a cluster state
 * of "Cluster 2" is not blocked, even though `costModuleLock` would still list "Milestones".
 * Conflating the list with the gate is the easy mistake here; both are tested.
 */
export const isCostModuleLocked = (p: CostLockInput): boolean => p.clusterStateName === "Draft";

/* ═══════════════════════════════════════════════════════════ the command bar ════ */

export type CommandKey =
  | "addProject"
  | "editProject"
  | "editCosts"
  | "deleteProject"
  | "simulateProject"
  | "viewSharepoint"
  | "viewTeams"
  | "powerBiOverview"
  | "powerBiFinance"
  | "dashboard";

export interface CommandState {
  key: CommandKey;
  visible: boolean;
  enabled: boolean;
  label: string;
  /** A Fluent icon NAME. `Screen.tsx` maps it to a component, so this stays React-free. */
  icon: string;
  reason?: string;
}

/** The selected row reduced to exactly what the ten gates branch on. */
export interface SelectedProjectRow {
  id: string;
  name: string;
  approvalState: number | null;
  clusterStateName: string | null;
  /** From the `Project States` lookup, not from the project row. */
  clusterStateOrder: number | null;
  countryName: string | null;
  spoSharepointUrl: string | null;
  spoTeamsUrl: string | null;
}

export interface CommandBarContext {
  selected: SelectedProjectRow | null;
  /** `DataSourceInfo(Projects, DataSourceInfo.CreatePermission)` — answered by the server. */
  canCreate: boolean;
  /** `RecordInfo(varProjectRecord, RecordInfo.EditPermission)` — per record, from the server. */
  canEditSelected: boolean;
  environmentName: string;
  userMail: string | null;
  reportViewers: readonly string[];
}

/**
 * `colReportViewers` — the ten-address allow-list collected in the canvas `OnVisible`. Gates
 * the two Power BI items and nothing else.
 *
 * Deliberately NOT `DEVELOPERS` from `@/domain/session`, even where the addresses overlap:
 * they are two independently-maintained canvas literals, and merging them is how a gate
 * silently drifts when one list is edited. Both belong in an environment variable before
 * go-live. Injected through the context so tests can vary it.
 */
export const REPORT_VIEWERS: readonly string[] = [
  "andriy.chevychalov@vsb.energy",
  "philip.wagner@vsb.energy",
  "christoph.sperling@vsb.energy",
  "benjamin.goepfert@vsb.energy",
  "thomas.lorenz@vsb.energy",
  "dominik.simon@vsb.energy",
  "alexander.pilevski@vsb.energy",
  "test-vsbcloud-02@vsb.energy",
  "ext-chhitiz.buchasia@vsb.energy",
  "ext-matthias.vierkoetter@vsb.energy",
];

const SELECT_FIRST = "Select a project first.";

/**
 * Rules 16-20 plus the Validation block, as one function.
 *
 * The subtlety worth naming: the canvas gates Edit Project and Edit Costs on **selection
 * only**. Lacking edit rights changes the *label* to "View Project" / "View Costs" and the
 * icon to `ReadingMode` — it does not disable the command. Getting that backwards is what the
 * label-degradation test exists to catch.
 */
export function commandBarState(ctx: CommandBarContext): Record<CommandKey, CommandState> {
  const { selected, canCreate, canEditSelected, environmentName, userMail, reportViewers } = ctx;
  const has = Boolean(selected);
  const mail = (userMail ?? "").trim().toLowerCase();
  const isReportViewer = reportViewers.some((v) => v.trim().toLowerCase() === mail);
  const bothSpoUrls = Boolean(selected?.spoSharepointUrl && selected?.spoTeamsUrl);
  const isCroatia = selected?.countryName === "Croatia";

  const st = (
    key: CommandKey,
    visible: boolean,
    enabled: boolean,
    label: string,
    icon: string,
    reason?: string,
  ): [CommandKey, CommandState] => [
    key,
    { key, visible, enabled, label, icon, reason: enabled ? undefined : reason },
  ];

  return Object.fromEntries([
    st("addProject", true, canCreate, "Add Project", "Add", "You cannot create projects."),
    st(
      "editProject",
      true,
      has,
      canEditSelected ? "Edit Project" : "View Project",
      canEditSelected ? "Edit" : "ReadingMode",
      SELECT_FIRST,
    ),
    st(
      "editCosts",
      true,
      has,
      canEditSelected ? "Edit Costs" : "View Costs",
      canEditSelected ? "Money" : "ReadingMode",
      SELECT_FIRST,
    ),
    st(
      "deleteProject",
      true,
      // Rule 17 — an approved project cannot be deleted, whatever your privileges.
      has && canEditSelected && selected?.approvalState !== CHOICE.approvalState.approved,
      "Delete Project",
      "Delete",
      !has
        ? SELECT_FIRST
        : selected?.approvalState === CHOICE.approvalState.approved
          ? "An approved project cannot be deleted."
          : "You do not have permission to delete this project.",
    ),
    st(
      "simulateProject",
      // Rule 18 — Dev only.
      environmentName === "Dev",
      has && canEditSelected && (selected?.clusterStateOrder ?? 0) > 0,
      "Simulate",
      "Play",
      "Simulation needs a saved project past Draft.",
    ),
    st(
      "viewSharepoint",
      isCroatia,
      bothSpoUrls,
      "View Sharepoint",
      "SharepointLogo",
      "This project has no SharePoint site yet.",
    ),
    st(
      "viewTeams",
      isCroatia,
      bothSpoUrls,
      "View Teams",
      "TeamsLogo",
      "This project has no Teams site yet.",
    ),
    st("powerBiOverview", isReportViewer, has, "Project Overview Report", "Chart", SELECT_FIRST),
    st("powerBiFinance", isReportViewer, has, "Finance Report", "Chart", SELECT_FIRST),
    // GUIDE p06: "the other five are greyed" with nothing selected names all six non-Add
    // commands, Dashboard included — it is not exempt from the selection gate the way this
    // previously assumed.
    st("dashboard", true, has, "Dashboard", "DataBarVertical", SELECT_FIRST),
  ]) as Record<CommandKey, CommandState>;
}

/* ════════════════════════════════════════════════════════════════════ delete ════ */

/**
 * Rule 26 — the two notifications the delete raises.
 *
 * SOURCE DEFECT: the canvas error string reads "Error: Permit could not be deleted." — a
 * copy/paste from the Planning screen; the record is a Project. Corrected here.
 * `deleteMessagesCanvasParity` returns the canvas strings and both are pinned by a test.
 */
export function deleteMessages(name: string): { success: string; error: string } {
  return {
    success: `The project '${name}' was successfully deleted!`,
    error:
      "Error: Project could not be deleted. It may have dependent records, or you may lack the privilege.",
  };
}

export function deleteMessagesCanvasParity(name: string): { success: string; error: string } {
  return {
    success: `The project '${name}' was successfully deleted!`,
    error: "Error: Permit could not be deleted. ",
  };
}

/**
 * Optimistic removal, including the `totalCount` decrement — without it the footer reads a
 * stale "Total Rows" for as long as the refetch takes.
 */
export function applyOptimisticDelete<T extends { rows: unknown[]; totalCount: number }>(
  page: T,
  id: string,
  rowId: (row: unknown) => string,
): T {
  const rows = page.rows.filter((r) => rowId(r) !== id);
  if (rows.length === page.rows.length) return page;
  return { ...page, rows, totalCount: Math.max(0, page.totalCount - 1) };
}

/* ════════════════════════════════════════════════════════ URL serialisation ════ */

/**
 * The screen's whole state — what the canvas kept in the single row of `colFiltersOverview`.
 */
export interface ProjectListCriteria {
  filter: ProjectListFilter;
  sort: SortRequest;
  /** 1-based. */
  page: number;
}

export const defaultProjectListCriteria: ProjectListCriteria = {
  filter: emptyProjectListFilter,
  sort: DEFAULT_SORT,
  page: 1,
};

/**
 * Search-param names. Short, because they end up in a URL people paste to each other, and
 * frozen, because a rename silently invalidates every link already sent.
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
 * otherwise reach `$orderby` and `$filter`. An unknown sort column falls back to the default
 * (`resolveSortColumn`), an unknown capacity operator is dropped, and a non-numeric page
 * becomes 1. Nothing here can throw, because a bad link must render the default list rather
 * than an error boundary.
 */
export function parseCriteria(params: URLSearchParams): ProjectListCriteria {
  const s = (k: string): string => params.get(k) ?? "";
  const id = (k: string): string | null => {
    const v = s(k).trim();
    return v ? v : null;
  };

  const capacity = s(PARAM.capacity).trim();
  const rawOperator = s(PARAM.capacityOperator).trim();
  const filter: ProjectListFilter = {
    keyword: s(PARAM.keyword),
    projectManagerId: id(PARAM.projectManagerId),
    countryId: id(PARAM.countryId),
    areaId: id(PARAM.areaId),
    technology: technologyValue(s(PARAM.technology)),
    capacity,
    capacityOperator: isCapacityOperator(rawOperator) ? rawOperator : "",
  clusterStateId: id(PARAM.clusterStateId),
  };

  // A capacity with no usable operator would be a filter that silently does nothing; rule 7
  // already says what to do about it.
  if (capacity && filter.capacityOperator === "") {
    filter.capacityOperator = resolveCapacityOperator(capacity, "") ?? "";
  }
  // An area without a country is unreachable through the UI, so it is a malformed link.
  if (!filter.countryId) filter.areaId = null;

  const pageNum = Number.parseInt(s(PARAM.page), 10);
  return {
    filter,
    sort: {
      col: resolveSortColumn(s(PARAM.sortCol)),
      asc: s(PARAM.sortDir) !== "desc",
    },
    page: Number.isFinite(pageNum) && pageNum >= 1 ? pageNum : 1,
  };
}

/**
 * Write the criteria back to a query string, omitting everything at its default so a pristine
 * list has a clean `/#/projects` URL rather than eleven empty parameters.
 */
export function serialiseCriteria(c: ProjectListCriteria): URLSearchParams {
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

/* ══════════════════════════════════════════════════════════════ country scope ════ */

/**
 * The server-side country scope. Orthogonal to the filter bar, and the only thing standing
 * between a country-scoped user and the whole table, so it is composed with
 * `buildProjectFilter` at the call site rather than folded into it.
 *
 * Rewritten to use the `f.*` builders so it is no longer the one filter in the screen built by
 * string concatenation.
 */
export function serverFilterFor(user: CurrentUser | null): string | undefined {
  if (!user) return undefined;
  if (user.isProjectDataAllCountries || user.isApplicationAdministrator) return undefined;
  if (!user.editableCountries.length) return undefined;
  return f.or(...user.editableCountries.map((c) => f.guid(PROJECT_MAIN_COL.country, c.id)));
}
