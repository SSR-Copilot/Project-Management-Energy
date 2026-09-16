/**
 * Admin Project Default Checklists Screen — every business rule as a pure function.
 *
 * Canvas screen: `Admin Project Default Checklists Screen` (PM app)
 *   75 controls · 1 343 lines of Power Fx · 16 substantive blocks · band S
 *
 * Maintains the per-country-per-technology default task list that seeds every new
 * project's checklist. A `TabList` over `Checklist Country And Technologies` picks the
 * scope; a gallery of gates (`Project States` where `Is Visible On Checklist`) expands to
 * that gate's tasks from `Project Default Checklists`.
 *
 * ┌────────────────────────────────────────────────────────────────────────────────┐
 * │ SOURCE DEFECT — THERE IS NO PERMISSION CHECK ON THIS SCREEN. AT ALL.            │
 * │                                                                                │
 * │ `OnVisible` never evaluates `gblCurrentUser` and never calls `DataSourceInfo` / │
 * │ `RecordInfo`. Access to the whole admin area is CLIENT-SIDE HIDING ONLY: the    │
 * │ `"appSettingsKey"` item of the user menu and every item of the named formula    │
 * │ `LeftAdminNavigationMenu` carry the identical                                   │
 * │     ItemVisible: Or(gblCurrentUser.IsApplicationAdministrator,                  │
 * │                     gblCurrentUser.IsControllerOwnData)                         │
 * │ and nothing else. A non-admin who reaches the screen by a deep link or by a     │
 * │ residual `Navigate` gets the full editing UI and the writes succeed.            │
 * │                                                                                │
 * │ WHAT WE DID: the code app adds a route guard (`RequireAdmin` in                 │
 * │ routes/AppRoutes.tsx) that mirrors the same two roles, and every rule below     │
 * │ that produces a WRITE takes an explicit `canEdit` and refuses without it.       │
 * │ THE ROUTE GUARD IS NOT SECURITY. It is the same client-side hiding, one layer   │
 * │ up. The real fix is a Dataverse privilege on `vsb_projectdefaultchecklists`     │
 * │ (and the other five admin tables) so the SERVER REJECTS the write. Until that   │
 * │ exists, anyone who can call the Web API can edit this master data.              │
 * └────────────────────────────────────────────────────────────────────────────────┘
 *
 * COUNTRY SCOPING. `gblCurrentUser.EditableCounties` is NEVER READ on this screen. The
 * scope axis is the `Checklist Country And Technologies` table, and row-level security is
 * anchored by `'Owning Business Unit'`, copied from the selected scope row on save
 * (rule 9). `canEditCountry` from @/domain/session is applied here as an ADDITIONAL gate
 * the canvas did not have — see `canEditScope`.
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  - `txt_…_Name.OnChange`'s `UpdateIf(colPanelInverterFormValidation, …)` (rule 16) — a
 *    copy-paste leftover from a generator/inverter screen. The collection it writes is
 *    never created, read or displayed here.
 *  - The two-step create-then-update `Patch` pair (rule 5). The second `Patch` existed
 *    only because the canvas needed the new row's id back inside a `With`; one POST does
 *    the same work.
 *  - `ForAll(colTasksToReorder, Patch(...))` — N round-trips for the delete compaction.
 *    `planDeleteTask` returns one batch instead.
 *  - `colTasksToReorder`, `locResetOrderingList`, and the PowerDragDrop control's
 *    `RenderZone` / `RenderID` / `RenderName` columns — control plumbing, not data.
 *  - The hidden `but_…_Reset` button whose only job was to be `Select()`ed by Close and
 *    Cancel.
 */
import { isBlank } from "@/domain/numeric";
import { ES_PROCESS, CHOICE_ADMIN } from "@/data/entities";
import { canEditCountry, type CurrentUser } from "@/domain/session";

/* ═══════════════════════════════════════════════════════════════════ columns ════ */

/** `vsb_ProjectDefaultChecklist` logical names. */
export const DEFAULT_CHECKLIST_COL = {
  /**
   * Metadata name — note the DOUBLE plural, `…checklistsid` (entity
   * `vsb_ProjectDefaultChecklists`).
   */
  id: "vsb_projectdefaultchecklistsid",
  name: "vsb_name",
  order: "vsb_order",
  holdingTaskDescription: "vsb_holdingtaskdescription",
  gateRelevance: "vsb_gaterelevance",
  isCompletionDate: "vsb_iscompletiondate",
  /** The SOFT-DELETE flag. The real `Remove(...)` is commented out in the source. */
  toDelete: "vsb_todelete",
  countryTech: "_vsb_associatedcountryandtechnology_value",
  clusterState: "_vsb_clusterstate_value",
  owningBusinessUnit: "_owningbusinessunit_value",
  statecode: "statecode",
  statuscode: "statuscode",
} as const;

/** The `@odata.bind` navigation-property names for the three lookups a save writes. */
export const DEFAULT_CHECKLIST_LOOKUP = {
  countryTech: "vsb_AssociatedCountryAndTechnology",
  clusterState: "vsb_ClusterState",
  owningBusinessUnit: "owningbusinessunit",
} as const;

export const CHECKLIST_COUNTRY_TECH_COL = {
  id: "vsb_checklistcountryandtechnologyid",
  name: "vsb_name",
  order: "vsb_order",
  country: "_vsb_country_value",
  technology: "vsb_technology",
  owningBusinessUnit: "_owningbusinessunit_value",
} as const;

export const PROJECT_STATE_COL = {
  id: "vsb_projectstateid",
  name: "vsb_name",
  order: "vsb_order",
  isVisibleOnChecklist: "vsb_isvisibleonchecklist",
} as const;

export const CHECK_LIST_DEFAULT_APPROVAL_COL = {
  id: "vsb_checklistdefaultapprovalsid",
  projectDefaultChecklist: "_vsb_projectdefaultchecklistid_value",
  /** `vsb_approvalmodecode`, not `vsb_approvalmode` — read out of the solution export. */
  approvalMode: "vsb_approvalmodecode",
} as const;

export const CHECKLIST_ENTITY_SET = ES_PROCESS.projectDefaultChecklists;

/* ═════════════════════════════════════════════════════════════════════ types ════ */

/** One `Checklist Country And Technologies` row — the scope axis. */
export interface ScopeRow {
  id: string;
  name: string;
  order: number;
  countryId: string | null;
  technology: number | null;
  owningBusinessUnitId: string | null;
}

/** One `Project States` row — a gate. */
export interface GateRow {
  id: string;
  name: string;
  order: number;
  isVisibleOnChecklist: boolean;
}

/** One `Project Default Checklists` row. */
export interface TaskRow {
  id: string;
  name: string;
  order: number;
  holdingTaskDescription: string | null;
  gateRelevance: boolean;
  isCompletionDate: boolean;
  toDelete: boolean;
  countryTechId: string | null;
  clusterStateId: string | null;
  /** `statecode` — 0 Active / 1 Inactive. */
  status: number;
}

/** The Add/Edit panel's form state. */
export interface TaskForm {
  description: string;
  holdingDescription: string;
  gateRelevance: boolean;
  isCompletionDate: boolean;
  active: boolean;
}

export const emptyTaskForm = (): TaskForm => ({
  description: "",
  holdingDescription: "",
  gateRelevance: false,
  isCompletionDate: false,
  active: true,
});

export const toTaskForm = (task: TaskRow | null): TaskForm =>
  task === null
    ? emptyTaskForm()
    : {
        description: task.name ?? "",
        holdingDescription: task.holdingTaskDescription ?? "",
        gateRelevance: task.gateRelevance === true,
        isCompletionDate: task.isCompletionDate === true,
        active: task.status === CHOICE_ADMIN.status.active,
      };

/** One write in a plan — the same shape `dataClient.batch` takes. */
export interface PlannedWrite {
  op: "create" | "update" | "delete";
  entitySet: string;
  id?: string;
  data?: Record<string, unknown>;
  /** Why this write exists — rendered in the confirm dialog and in telemetry. */
  reason: string;
}

export interface WritePlan {
  writes: PlannedWrite[];
  log: string[];
  /** Set when the plan was refused; `writes` is then empty. */
  refusedReason?: string;
}

export const emptyPlan = (): WritePlan => ({ writes: [], log: [] });

const refuse = (reason: string): WritePlan => ({ writes: [], log: [], refusedReason: reason });

/* ═════════════════════════════════════════════════════════════════ messages ════ */

export const MSG = {
  // GUIDE p17: page title verbatim from the screenshot — lower-case "settings", distinct
  // from the left-rail item label "Check List Settings" (PM_ADMIN_NAV).
  /**
   * NEW — no canvas equivalent: the code app's page title; the canvas screen had no title label
   * of its own
   */
  pageTitle: "Checklist settings",
  /** `lbl_Admin_Checklist_Form_Fields_Name_ErrorMessage.Text` — verbatim. */
  descriptionBlank: "Value cannot be blank.",
  /** The shared tooltip on all four locked row actions. */
  inUse:
    "This Check List item is in use by a Project Gate. Delete the Project Gate to edit "
    + "the Check List item.",
  /** `cmp_DeleteChecklistItem_AdminScreen.Title` — verbatim. */
  deleteTitle: "Delete checklist item?",
  /** The typo `Decativate` is in the source; corrected here, noted in `activationTitle`. */
  /**
   * INTERPOLATED — canvas `cmp_ActivateDeactiveChecklistItem_AdminScreen.Title` builds this
   * from "Activate" + " checklist item?"
   */
  activateTitle: "Activate checklist item?",
  /**
   * SPELLING CORRECTED — canvas `cmp_ActivateDeactiveChecklistItem_AdminScreen.Title` reads
   * "Decativate" (the title is `$"{If(…Active,"Decativate","Activate")} checklist item?"`).
   * Corrected to "Deactivate"; the rest is verbatim — see `activationTitle()`.
   */
  deactivateTitle: "Deactivate checklist item?",
  /**
   * NEW — no canvas equivalent: the selection prompt for the country/technology scope; the
   * canvas showed an empty gate list instead
   */
  noScope: "Pick a country and technology to see its default checklist.",
  /** NEW — no canvas equivalent: empty state for a gate with no default tasks */
  noTasks: "This gate has no default tasks yet.",
  /**
   * NEW — no canvas equivalent: the country-scope gate is added by the code app
   * (`canEditScope`)
   */
  outOfScope:
    "This country is outside your editable country scope, so the checklist is read-only.",
  /**
   * NEW — no canvas equivalent: the code app surfaces a failed save; the canvas swallowed the
   * error behind its spinner
   */
  saveFailed: "The task could not be saved.",
} as const;

/**
 * The confirmation title for activate/deactivate.
 *
 * SOURCE DEFECT (cosmetic): the canvas builds
 * `$"{If(…Active,"Decativate","Activate")} checklist item?"` — *Decativate* is misspelt in
 * `cmp_PopUp_Confirmation.Title`. Spelling corrected; the wording is otherwise verbatim.
 */
export const activationTitle = (currentlyActive: boolean): string =>
  currentlyActive ? MSG.deactivateTitle : MSG.activateTitle;

/** `gblAppConstants.DefaultDefMaxLength` — the cap on both text inputs. */
export const DESCRIPTION_MAX_LENGTH = 100;

/** The live counter under each input: `$"{Len(…)}/{gblAppConstants.DefaultDefMaxLength}"`. */
export const charCounter = (value: string, max = DESCRIPTION_MAX_LENGTH): string =>
  `${value.length}/${max}`;

/* ═══════════════════════════════════════════════════════════════ scope + gates ════ */

/**
 * Rule 1 — the default scope on entry.
 *
 * SOURCE DEFECT: the canvas sets
 * `locSelectedCountryAndTechnology: First(SortByColumns('Checklist Country And
 * Technologies', "vsb_name"))` — the first scope BY NAME — while
 * `tab_Admin_Project_Checklist_Association.Items` sorts the tab strip BY `Order`. The
 * pre-selected scope is therefore not necessarily the tab that looks selected.
 *
 * FIXED, deliberately (implementation step 7): the first tab by `Order` is selected, so
 * the highlighted tab and the loaded scope always agree. `defaultScopeCanvasParity` keeps
 * the original behaviour reachable for a side-by-side comparison.
 */
export function defaultScope(scopes: ScopeRow[]): ScopeRow | null {
  return sortScopes(scopes)[0] ?? null;
}

/** The canvas behaviour of rule 1, kept for parity testing only. Not wired to the UI. */
export function defaultScopeCanvasParity(scopes: ScopeRow[]): ScopeRow | null {
  return [...scopes].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))[0] ?? null;
}

/** `tab_…_Association.Items` — `Sort(…, Order, SortOrder.Ascending)`. */
export const sortScopes = (scopes: ScopeRow[]): ScopeRow[] =>
  [...scopes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

/**
 * Rule 2 — `ClearCollect(colChecklistClusters, AddColumns(SortByColumns(
 *   Filter('Project States', 'Is Visible On Checklist'), "vsb_order", Ascending),
 *   IsFolded, true))`.
 *
 * Only gates flagged for the checklist appear, ascending by `vsb_order`, all initially
 * folded. `IsFolded` was a column patched onto every row; here the fold state is a
 * `Set<string>` in the component, so it is not part of the data at all.
 */
export const checklistGates = (states: GateRow[]): GateRow[] =>
  states
    .filter((s) => s.isVisibleOnChecklist === true)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

/**
 * Rule 3's client-side half.
 *
 * The FILTER itself is server-side (`hooks.ts` puts both lookup ids and
 * `vsb_todelete ne true` into `$filter`, `vsb_order` into `$orderby`) — never materialise
 * the table to filter it. This function only re-applies the predicate so the unit tests
 * can assert it, and so a stale cache entry cannot show a soft-deleted row.
 */
export function visibleTasks(
  tasks: TaskRow[],
  scopeId: string | null,
  gateId: string | null,
): TaskRow[] {
  return tasks
    .filter((t) =>
      t.toDelete !== true
      && (scopeId === null || t.countryTechId === scopeId)
      && (gateId === null || t.clusterStateId === gateId))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/* ═══════════════════════════════════════════════════════════════ the in-use lock ════ */

/**
 * The lock behind all four row actions.
 *
 * The canvas re-ran, per row and PER PROPERTY (four properties × N rows):
 *   `LookUp('Check List Default Approvals',
 *          'Project Default Check List'.'Project Default Checklist' = GUID(ThisItem.…)
 *          && 'Approval Mode' <> [@'Approval Mode'].'Only Notifications')`
 * Here `hooks.ts` issues ONE query per gate and hands the resulting id set in.
 *
 * `Only Notifications` approvals do NOT lock the row — that is the `<>` in the formula.
 */
export const isTaskLocked = (taskId: string, blockingIds: ReadonlySet<string>): boolean =>
  blockingIds.has(taskId);

/**
 * Builds the blocking set from `Check List Default Approvals` rows.
 * An approval locks its checklist item unless its mode is `Only Notifications`.
 */
export function blockingChecklistIds(
  approvals: { projectDefaultChecklistId: string | null; approvalMode: number | null }[],
  onlyNotificationsValue: number,
): Set<string> {
  const out = new Set<string>();
  for (const a of approvals) {
    if (!a.projectDefaultChecklistId) continue;
    if (a.approvalMode === onlyNotificationsValue) continue;
    out.add(a.projectDefaultChecklistId);
  }
  return out;
}

/**
 * Whether the signed-in admin may edit this scope's master data.
 *
 * NEW — the canvas has nothing like it. `canEditCountry` is applied to the scope row's
 * country so a Controller Own Data user cannot silently rewrite another country's
 * defaults. An Application Administrator or a Project Data All Countries holder passes
 * everywhere. Still not security (see the header block) — it is the client half of a
 * check the server must also make.
 */
export function canEditScope(user: CurrentUser | null, scope: ScopeRow | null): boolean {
  if (!user) return false;
  if (!scope) return false;
  return canEditCountry(user, scope.countryId ?? undefined);
}

/* ═══════════════════════════════════════════════════════════════════ validation ════ */

/**
 * The whole save gate. `lbl_…_Name_ErrorMessage.Visible = IsBlank(Trim(txt_….Value))`
 * and `Save.DisplayMode = If(that.Visible, Disabled, Edit)`. There is no other validator
 * on this panel — no length check beyond `MaxLength`, no duplicate-description check.
 */
export const isSaveEnabled = (form: TaskForm): boolean => !isBlank(form.description.trim());

export const saveErrors = (form: TaskForm): string[] =>
  isSaveEnabled(form) ? [] : [MSG.descriptionBlank];

/** Rule 15 — `If(IsBlank(locSelectedChecklistEntity), "Add Task", "Edit Task")`. */
export const panelTitle = (selected: TaskRow | null): string =>
  selected === null ? "Add Task" : "Edit Task";

/**
 * Rule 14 — the grid truncates a long holding description at 110 characters:
 * `If(Len(x) > 110, $"{Left(x, 110)} ...", x)`. Note the SPACE before the ellipsis.
 */
export const HOLDING_TRUNCATE_AT = 110;

export function truncateHolding(text: string | null | undefined, at = HOLDING_TRUNCATE_AT): string {
  const v = text ?? "";
  return v.length > at ? `${v.slice(0, at)} ...` : v;
}

/* ═════════════════════════════════════════════════════════════════════ ordering ════ */

/**
 * Rule 4 — a new task's `Order` is "count of existing tasks in this scope + 1".
 *
 * SOURCE DEFECT: the canvas captures that count into `locTotalRows` when the ADD BUTTON
 * IS PRESSED, not at save time, and its `CountRows(...)` does not exclude soft-deleted
 * rows even though the gallery does. Two admins adding concurrently both compute the same
 * order and collide; one add after a delete reuses an order.
 *
 * MITIGATED: `hooks.ts` calls this with a count read at SAVE time (`$orderby=vsb_order
 * desc&$top=1`), not at add-click. That closes the window but does not eliminate it —
 * the real fix is a Dataverse custom API that allocates the order server-side, which is
 * documented in the migration notes and not built here.
 */
export const nextOrder = (existingCount: number): number => Math.max(0, existingCount) + 1;

/** The server-side variant: one row back, ordered descending. */
export const nextOrderFromHighest = (highestOrder: number | null | undefined): number =>
  (typeof highestOrder === "number" ? highestOrder : 0) + 1;

/**
 * Rule 10's compaction — every later sibling's `Order` drops by one.
 *
 * `Filter(<same scope, same gate>, Order > locSelectedChecklistEntity.Order)` then
 * `ForAll(…, Patch(…, {Order: ThisRecord.Order - 1}))`. Rows at or before the deleted
 * order are untouched.
 */
export function compactOrdersAfterDelete(
  tasks: TaskRow[],
  deletedOrder: number,
): { id: string; order: number }[] {
  return tasks
    .filter((t) => t.toDelete !== true && (t.order ?? 0) > deletedOrder)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((t) => ({ id: t.id, order: (t.order ?? 0) - 1 }));
}

/**
 * Rule 13 — the reorder panel writes positions straight from the drag list:
 * `ForAll(pcf_….CurrentItems As RecordItem, UpdateIf(…, {Order: RecordItem.Position}))`.
 *
 * `orderedIds` is the dropped sequence; positions are 1-based. Rows whose order is already
 * correct produce no write, so a drag that changes nothing sends an empty batch.
 */
export function reorderPositions(
  tasks: TaskRow[],
  orderedIds: string[],
): { id: string; order: number }[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const out: { id: string; order: number }[] = [];
  orderedIds.forEach((id, index) => {
    const position = index + 1;
    const current = byId.get(id);
    if (current && current.order === position) return;
    out.push({ id, order: position });
  });
  return out;
}

/* ═══════════════════════════════════════════════════════════════ status handling ════ */

/**
 * Rule 7 — the panel writes `Status` AND `Status Reason` as a pair from one toggle:
 *   Status:        If(tgl.Checked, 'Status (…)'.Active, …Inactive)
 *   'Status Reason': If(tgl.Checked, 'Status Reason (…)'.Active, …Inactive)
 */
export function toStatusPair(active: boolean): { statecode: number; statuscode: number } {
  return active
    ? { statecode: CHOICE_ADMIN.status.active, statuscode: CHOICE_ADMIN.statusReason.active }
    : { statecode: CHOICE_ADMIN.status.inactive, statuscode: CHOICE_ADMIN.statusReason.inactive };
}

/**
 * Rule 11 — the ROW toggle flips `Status` only, never `Status Reason`.
 *
 * SOURCE DEFECT: rules 7 and 11 disagree. A task deactivated from the row action keeps an
 * Active `Status Reason`; the same task deactivated from the panel does not. Reporting
 * that filters on `statuscode` sees two different answers for the same intent.
 *
 * FIXED: both paths now go through `toStatusPair`, so `Status` and `Status Reason` can no
 * longer drift. `toggleActiveCanvasParity` keeps the one-column behaviour reachable and
 * is what the parity test asserts.
 */
export function toggleActivePatch(current: TaskRow): Record<string, unknown> {
  const nowActive = current.status !== CHOICE_ADMIN.status.active;
  const pair = toStatusPair(nowActive);
  return {
    [DEFAULT_CHECKLIST_COL.statecode]: pair.statecode,
    [DEFAULT_CHECKLIST_COL.statuscode]: pair.statuscode,
  };
}

/** The canvas behaviour of rule 11, kept for parity testing. Not wired to the UI. */
export function toggleActiveCanvasParity(current: TaskRow): Record<string, unknown> {
  return {
    [DEFAULT_CHECKLIST_COL.statecode]:
      current.status === CHOICE_ADMIN.status.active
        ? CHOICE_ADMIN.status.inactive
        : CHOICE_ADMIN.status.active,
  };
}

/**
 * Rule 12 — the calendar icon writes the negation directly:
 * `Patch(…, {'Is Completion Date': Not(ThisItem.'Is Completion Date')})` and then
 * `Refresh('Project Default Approvals')` — a DIFFERENT table. That refresh is why
 * `hooks.ts` invalidates the approvals query as well as the task query.
 */
export const toggleCompletionDatePatch = (current: TaskRow): Record<string, unknown> => ({
  [DEFAULT_CHECKLIST_COL.isCompletionDate]: current.isCompletionDate !== true,
});

/* ═════════════════════════════════════════════════════════════════════ the save ════ */

export interface SaveContext {
  scope: ScopeRow;
  /** The gate whose command bar was used — rule 8's `locSelectedCluster`. */
  gate: GateRow;
  /** `null` for an add. */
  existing: TaskRow | null;
  /** Rule 4's order source. Ignored when editing. */
  nextOrderValue: number;
  canEdit: boolean;
}

/**
 * Rules 5–9 — the save payload.
 *
 * Rule 5's two-step create-then-update is collapsed into ONE write. The canvas's second
 * `Patch` re-`LookUp`ed the row it had just created and rewrote six of the same columns;
 * nothing else read the row in between, so the pair is one POST.
 *
 * Rule 6 — Name and Holding Task Description are `Trim`med on write.
 * Rule 7 — the Active toggle writes both status columns (see `toStatusPair`).
 * Rule 8 — a NEW task's `Cluster State` is the gate its command bar belongs to; an
 *          existing task's gate is PRESERVED, so a task can never move between gates.
 * Rule 9 — `'Owning Business Unit'` is copied from the selected scope row. This is the
 *          row-level security anchor: Dataverse BU security scopes every other user's
 *          read of this row by it.
 */
export function buildTaskPayload(form: TaskForm, ctx: SaveContext): Record<string, unknown> {
  const status = toStatusPair(form.active);
  const data: Record<string, unknown> = {
    [DEFAULT_CHECKLIST_COL.name]: form.description.trim(),
    [DEFAULT_CHECKLIST_COL.holdingTaskDescription]: form.holdingDescription.trim(),
    [DEFAULT_CHECKLIST_COL.gateRelevance]: form.gateRelevance === true,
    [DEFAULT_CHECKLIST_COL.isCompletionDate]: form.isCompletionDate === true,
    [DEFAULT_CHECKLIST_COL.statecode]: status.statecode,
    [DEFAULT_CHECKLIST_COL.statuscode]: status.statuscode,
  };

  if (ctx.existing === null) {
    // Rule 4 — the order is only ever written on create.
    data[DEFAULT_CHECKLIST_COL.order] = ctx.nextOrderValue;
    // Rule 8 — the gate comes from the command bar that opened the panel.
    data[`${DEFAULT_CHECKLIST_LOOKUP.clusterState}@odata.bind`] =
      `/vsb_projectstates(${ctx.gate.id})`;
    data[`${DEFAULT_CHECKLIST_LOOKUP.countryTech}@odata.bind`] =
      `/vsb_checklistcountryandtechnologies(${ctx.scope.id})`;
  }

  // Rule 9 — written on BOTH branches, exactly as the canvas does.
  if (ctx.scope.owningBusinessUnitId) {
    data[`${DEFAULT_CHECKLIST_LOOKUP.owningBusinessUnit}@odata.bind`] =
      `/businessunits(${ctx.scope.owningBusinessUnitId})`;
  }
  return data;
}

/** The save as a plan, so the permission refusal is testable without a transport. */
export function planSaveTask(form: TaskForm, ctx: SaveContext): WritePlan {
  if (!ctx.canEdit) return refuse(MSG.outOfScope);
  if (!isSaveEnabled(form)) return refuse(MSG.descriptionBlank);

  const data = buildTaskPayload(form, ctx);
  const plan = emptyPlan();
  if (ctx.existing === null) {
    plan.writes.push({
      op: "create", entitySet: CHECKLIST_ENTITY_SET, data,
      reason: `Default task “${form.description.trim()}” added to ${ctx.gate.name}`,
    });
    plan.log.push(`Added “${form.description.trim()}” at position ${ctx.nextOrderValue}.`);
  } else {
    plan.writes.push({
      op: "update", entitySet: CHECKLIST_ENTITY_SET, id: ctx.existing.id, data,
      reason: `Default task “${form.description.trim()}” updated`,
    });
    plan.log.push(`Updated “${form.description.trim()}”.`);
  }
  return plan;
}

/* ══════════════════════════════════════════════════════════════════ the delete ════ */

/**
 * Rule 10 — delete is a SOFT delete plus a compaction, issued as ONE batch.
 *
 * `cmp_DeleteChecklistItem_AdminScreen.OnConfirm` patches `{'To Delete': true}` (the real
 * `Remove(...)` sits commented out immediately below it) and then walks every later
 * sibling decrementing `Order`. The soft-delete flag is what the grid filter reads, so the
 * semantics are preserved exactly — only the N round-trips are gone.
 */
export function planDeleteTask(args: {
  target: TaskRow;
  siblings: TaskRow[];
  locked: boolean;
  canEdit: boolean;
}): WritePlan {
  if (!args.canEdit) return refuse(MSG.outOfScope);
  if (args.locked) return refuse(MSG.inUse);

  const plan = emptyPlan();
  plan.writes.push({
    op: "update", entitySet: CHECKLIST_ENTITY_SET, id: args.target.id,
    data: { [DEFAULT_CHECKLIST_COL.toDelete]: true },
    reason: `“${args.target.name}” marked deleted`,
  });
  for (const move of compactOrdersAfterDelete(args.siblings, args.target.order ?? 0)) {
    plan.writes.push({
      op: "update", entitySet: CHECKLIST_ENTITY_SET, id: move.id,
      data: { [DEFAULT_CHECKLIST_COL.order]: move.order },
      reason: `Order compacted to ${move.order}`,
    });
  }
  plan.log.push(`Deleted “${args.target.name}” and compacted ${plan.writes.length - 1} row(s).`);
  return plan;
}

/** Rule 13's reorder as one batch. */
export function planReorderTasks(args: {
  tasks: TaskRow[];
  orderedIds: string[];
  canEdit: boolean;
}): WritePlan {
  if (!args.canEdit) return refuse(MSG.outOfScope);
  const plan = emptyPlan();
  for (const move of reorderPositions(args.tasks, args.orderedIds)) {
    plan.writes.push({
      op: "update", entitySet: CHECKLIST_ENTITY_SET, id: move.id,
      data: { [DEFAULT_CHECKLIST_COL.order]: move.order },
      reason: `Moved to position ${move.order}`,
    });
  }
  if (plan.writes.length) plan.log.push(`Reordered ${plan.writes.length} task(s).`);
  return plan;
}
