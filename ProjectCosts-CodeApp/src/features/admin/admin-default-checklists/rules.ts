/**
 * Check List Settings — pure business rules (no I/O). Canvas screen: `Admin Project Default
 * Checklists Screen` (PM app), `ProjectDocs/_extracted/msapp/projectmanagement/Src/Admin Project
 * Default Checklists Screen.pa.yaml`. `L<n>` / `DCS:<n>` = a line in that file.
 *
 * Visible strings are the canvas's, verbatim (CONVENTIONS rule 7); each cites its
 * `Control.Property`. Strings with no canvas counterpart say `NEW`. Behaviour that differs from
 * the canvas is marked `SOURCE DEFECT:` (a canvas bug, fixed) or `DIVERGENCE:` (a deliberate new
 * behaviour) — rule 8; see `ProjectDocs/app-docs/02-OPEN-DECISIONS.md` D18 and
 * `09-APPLICATION-SETTINGS-PORT-OPEN-POINTS.md` §1.
 *
 * SOURCE DEFECT: the canvas screen has no permission check of its own (`OnVisible` never reads
 * `gblCurrentUser`); entry is client-side hiding only (`ItemVisible: Or(IsApplicationAdministrator,
 * IsControllerOwnData)` on the nav items). Here every write plan takes `canEdit` (`useAdminAccess`)
 * and refuses without it. That is still not security: Dataverse must refuse the write too (D1).
 */
import type {
  ChecklistCluster, ChecklistTab, ChecklistTask, OrderPatch, TaskForm,
} from "@/data/adminDefaultChecklists";
import { OPERATION, buildEditPayload, statusPayload } from "@/data/adminDefaultChecklists";
import { CHECKLIST_ENTITY_SETS } from "@/data/dataverseNames";
import { emptyPlan, guardedUpdate, refusePlan, type PlannedWrite, type WritePlan } from "@/data/writePlan";
import { isDirty } from "@/domain/form";
import { nextOrder as sharedNextOrder } from "@/domain/reorder";
import { OUT_OF_SCOPE_MESSAGE } from "./messages";

/* ═══════════════════════════════════════════════════════════════ texts ══ */

/**
 * `ico_Delete_…` / `ico_Edit_…` / `ico_ActivateDeactivate_…` /
 * `ico_EnablelCompletionDate_TasksInClusterDefaultChecklist_AdminScreen.Tooltip` — verbatim
 * (L518, L552, L578, L635).
 */
export const LOCK_TOOLTIP =
  "This Check List item is in use by a Project Gate. Delete the Project Gate to edit the Check List item.";

/**
 * NEW — no canvas equivalent. DIVERGENCE: the canvas ran a `LookUp('Check List Default
 * Approvals', …)` per row and property, so it had no "lock query failed" state. Here the lock set
 * is one query; when it fails the rows fail CLOSED with this tooltip.
 */
export const LOCK_UNKNOWN_TOOLTIP =
  "It could not be checked whether this Check List item is in use by a Project Gate, so it cannot be changed right now.";

/**
 * NEW — no canvas equivalent. Shown while the lock query is still loading. Rows stay disabled
 * (fail closed), but they must not claim "in use by a Project Gate" before that is known.
 */
export const LOCK_LOADING_TOOLTIP =
  "Checking whether this Check List item is in use by a Project Gate…";

/** NEW — no canvas equivalent: the list changed while the Reorder panel was open. */
export const REORDER_STALE_MESSAGE =
  "The items in this cluster changed while the panel was open. Cancel and open Reorder again to see the current list.";

/** `lbl_Admin_Checklist_Form_Fields_Name_ErrorMessage.Text` — verbatim (L1051-1055). */
export const BLANK_NAME_MESSAGE = "Value cannot be blank.";

/**
 * `gblAppConstants.DefaultDefMaxLength` (App.pa.yaml) — `txt_Admin_Checklist_Form_Fields_Name` /
 * `…_HoldingDescription.MaxLength` and the denominator of both counters. 256, not
 * `DefaultMiddleMaxLength` (100).
 */
export const MAX_TEXT_LENGTH = 256;

/** `lbl_HoldingDescriptionValue_TasksInClusterDefaultChecklist_AdminScreen.Text` — the 110-character cut (L659). */
export const HOLDING_CUT = 110;

/**
 * DIVERGENCE: `TextCanvas1.Text` reads "To reorder drag and drop listed items" (L1542), because
 * `pcf_ReorderTaskList_AdminScreen` was a PowerDragDrop list. This panel is the shared
 * `ReorderPanel` without dragging (Move up / Move down buttons only), so the hint says that
 * instead. Restore the canvas text if dragging is enabled here (`listProps.draggable`).
 */
export const REORDER_HELP = "Use Move up and Move down to change the order of the listed items.";

/**
 * `lblAdmin_Reorder_Title.Text` — verbatim, INCLUDING the canvas misspelling "Reoder" (L1463).
 * D18 corrected only "Decativate" and "Deleteing" on this screen; this typo stays as the canvas
 * has it until the product owner decides otherwise (CONVENTIONS rule 7).
 */
export const REORDER_TITLE = "Reoder checklist";

/* ════════════════════════════════════════════════════════════ captions ══ */

/**
 * `lbl_ClusterName_DefaultChecklist_AdminScreen.Text` — verbatim (L719-736). The canvas maps the
 * stored `Project States` name through a `Switch`; any other name shows as stored.
 */
const CLUSTER_CAPTIONS: Readonly<Record<string, string>> = {
  "Draft": "Draft to Cluster 1",
  "Cluster 1": "Cluster 1 to Cluster 2",
  "Cluster 2": "Cluster 2 to Cluster 3",
  "Cluster 3": "Cluster 3 to Cluster 4",
  "Cluster 4": "Cluster 4 to Cluster 5",
  "Cluster 5": "Cluster 5 to Cluster 6",
  "Cluster 6": "Criteria After Cluster 6 Entry",
};

export function clusterCaption(name: string): string {
  return CLUSTER_CAPTIONS[name] ?? name;
}

/**
 * `lbl_HoldingDescriptionValue_….Text: If(Len(x) > 110, $"{Left(x, 110)} ...", x)` — the first
 * 110 characters + " ..." (note the space) when longer than 110 (L659).
 */
export function truncateHolding(text: string | null | undefined): string {
  const value = text ?? "";
  return value.length > HOLDING_CUT ? `${value.slice(0, HOLDING_CUT)} ...` : value;
}

/**
 * `ico_EnablelCompletionDate_….Text: If(ThisItem.'Is Completion Date', "Yes", "No")` — verbatim
 * (L630); a blank reads "No", as in the canvas.
 *
 * DIVERGENCE: the Gate Relevance cell uses this too. The canvas
 * `lbl_GateRelevanceValue_….Text: =ThisItem.'Gate Relevance'` (L646) prints the Yes/No column's
 * raw boolean text ("true" / "false"); this app shows "Yes" / "No" in both columns.
 */
export function yesNo(value: boolean | null | undefined): "Yes" | "No" {
  return value === true ? "Yes" : "No";
}

/* ════════════════════════════════════════════════════════════════ tabs ══ */

/**
 * `tab_Admin_Project_Checklist_Association.Items: Sort('Checklist Country And Technologies',
 * Order, SortOrder.Ascending)` (L231-236).
 *
 * SOURCE DEFECT (D18 e): `vsb_order` on this table is TEXT, so the canvas sorts "10" before "2".
 * Here the numeric value is compared when the text is a number; non-numeric or blank Orders sort
 * last, then by the raw text, then by name. The pre-port parity twin (`sortScopesCanvasParity`,
 * UT-ADCHK-003c) was not carried over by the port.
 */
export function tabSortKey(order: string | null | undefined): number {
  const text = (order ?? "").trim();
  if (text === "") return Number.POSITIVE_INFINITY;
  const n = Number(text);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

export function sortTabs<T extends Pick<ChecklistTab, "order" | "name">>(tabs: readonly T[]): T[] {
  return [...tabs].sort((a, b) => {
    const ka = tabSortKey(a.order);
    const kb = tabSortKey(b.order);
    if (ka !== kb) return ka < kb ? -1 : 1;
    const byText = (a.order ?? "").localeCompare(b.order ?? "");
    if (byText !== 0) return byText;
    return a.name.localeCompare(b.name);
  });
}

/**
 * The tab shown: the `?tab=` param when it names a known tab, otherwise the FIRST tab in display
 * order.
 *
 * SOURCE DEFECT (D18 f): the canvas `OnVisible` sets `locSelectedCountryAndTechnology:
 * First(SortByColumns('Checklist Country And Technologies', "vsb_name"))` (L23-28) — the first BY
 * NAME — while the strip is sorted BY ORDER, so the pre-selected tab need not be the left-most.
 * Here it is the left-most. The pre-port twin `defaultScopeCanvasParity` (UT-ADCHK-003b) was not
 * carried over by the port.
 *
 * DIVERGENCE: the selected tab lives in the URL (`?tab=`); the canvas kept it in a context
 * variable, so it did not survive a reload or a deep link.
 */
export function resolveTabId(sortedTabs: readonly Pick<ChecklistTab, "id">[], requested: string | null): string | null {
  if (requested) {
    const hit = sortedTabs.find((t) => t.id.toLowerCase() === requested.toLowerCase());
    if (hit) return hit.id;
  }
  return sortedTabs[0]?.id ?? null;
}

/* ═══════════════════════════════════════════════════════════════ tasks ══ */

/**
 * A blank Order sorts FIRST, as in the canvas. The grid's delegated
 * `SortByColumns(…, "vsb_order", SortOrder.Ascending)` (L455-466) gets Dataverse's nulls-first
 * ascending order, and the reorder list's local `Sort(colTasksToReorder, Order, Ascending)`
 * (L1571-1575) also puts blanks first.
 */
const orderOf = (t: Pick<ChecklistTask, "order">) => t.order ?? Number.NEGATIVE_INFINITY;

/**
 * By Order ascending (blank Orders first, as in the canvas). Used by the grid and the Reorder
 * snapshot. Ties, blanks included, are broken by name for a stable view; the canvas left their
 * order to Dataverse.
 */
export function sortTasks<T extends Pick<ChecklistTask, "order" | "name">>(tasks: readonly T[]): T[] {
  return [...tasks].sort((a, b) => {
    const oa = orderOf(a);
    const ob = orderOf(b);
    // Not `oa - ob`: -Infinity - -Infinity is NaN, which would break the tie on name.
    if (oa !== ob) return oa < ob ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Group a tab's tasks by cluster — `gal_TasksInClusterDefaultChecklist_AdminScreen.Items`
 * (L454-466): same tab, same cluster, `Not('To Delete' = true)`, so a blank To Delete stays.
 * The clusters are `Filter('Project States', 'Is Visible On Checklist')` (`OnVisible`, L32-46);
 * a task whose cluster is not one of them is not shown.
 */
export function groupTasksByCluster(
  tasks: readonly ChecklistTask[], clusters: readonly Pick<ChecklistCluster, "id">[],
): Map<string, ChecklistTask[]> {
  const groups = new Map<string, ChecklistTask[]>();
  const byLower = new Map<string, string>();
  for (const c of clusters) {
    groups.set(c.id, []);
    byLower.set(c.id.toLowerCase(), c.id);
  }
  for (const task of tasks) {
    if (task.toDelete || !task.clusterId) continue;
    const key = byLower.get(task.clusterId.toLowerCase());
    if (key) groups.get(key)?.push(task);
  }
  for (const [key, list] of groups) groups.set(key, sortTasks(list));
  return groups;
}

/**
 * The Order of a new task: `max(Order of the VISIBLE tasks in the cluster, default 0) + 1`.
 *
 * SOURCE DEFECT: the canvas captures `locTotalRows: CountRows(Filter('Project Default
 * Checklists', <tab>, <cluster>))` when Add Task is CLICKED (L350-356) and writes
 * `Order: locTotalRows + 1` (L1300). That count includes rows waiting for deletion, and a count is
 * not a maximum, so after a delete or a renumber gap the new Order can collide with an existing
 * one. Here the highest visible Order is used, read from the loaded group at save time.
 */
export function nextOrder(visibleClusterTasks: readonly Pick<ChecklistTask, "order" | "toDelete">[]): number {
  // The shared `max(0, …orders) + 1` once rows waiting for deletion are dropped.
  return sharedNextOrder(visibleClusterTasks.filter((t) => !t.toDelete).map((t) => t.order));
}

/**
 * Locked when a gate approval that is not "Only Notifications" points at the task — the
 * `DisplayMode` of all four row icons: `If(!IsBlank(LookUp('Check List Default Approvals',
 * 'Project Default Check List'.'Project Default Checklist' = GUID(ThisItem.…) && 'Approval Mode'
 * <> [@'Approval Mode'].'Only Notifications')), View/Disabled, Edit)` (L493-498). The id set is
 * built by the data layer (`loadLockedTaskIds`), lower-cased; a blank Approval Mode locks, as
 * Power Fx `Blank() <> X` is true.
 */
export function isLocked(taskId: string, lockedIds: ReadonlySet<string>): boolean {
  return lockedIds.has(taskId.toLowerCase());
}

/**
 * The lock state, with the lock query's own state. Only `free` enables the row's actions;
 * `loading` and `unknown` (query failed) both fail CLOSED, but with their own tooltip.
 * DIVERGENCE: the canvas has neither state (see `LOCK_UNKNOWN_TOOLTIP`).
 */
export type LockState = "free" | "locked" | "loading" | "unknown";

export function lockState(
  taskId: string,
  locks: { isError: boolean; data: ReadonlySet<string> | undefined },
): LockState {
  if (locks.isError) return "unknown";
  if (!locks.data) return "loading";
  return isLocked(taskId, locks.data) ? "locked" : "free";
}

/** The tooltip for a non-free row; `null` for a free row. */
export function lockTooltipFor(state: LockState): string | null {
  switch (state) {
    case "locked": return LOCK_TOOLTIP;
    case "loading": return LOCK_LOADING_TOOLTIP;
    case "unknown": return LOCK_UNKNOWN_TOOLTIP;
    default: return null;
  }
}

/**
 * `groupTasksByCluster` keys by the visible cluster's id; a task's `clusterId` may
 * differ in case. Look the group up case-insensitively, returning its key and rows.
 */
export function findGroup(
  groups: ReadonlyMap<string, ChecklistTask[]>, clusterId: string | null | undefined,
): { key: string; tasks: ChecklistTask[] } | undefined {
  if (!clusterId) return undefined;
  const direct = groups.get(clusterId);
  if (direct) return { key: clusterId, tasks: direct };
  const lower = clusterId.toLowerCase();
  for (const [key, tasks] of groups) if (key.toLowerCase() === lower) return { key, tasks };
  return undefined;
}

/* ═════════════════════════════════════════════════════════════ reorder ══ */

/**
 * `reorderPatch(current, newIds)` — 1-based positions for the new id order, only
 * for rows whose Order changed; ids not in `current` are ignored. `moveItem(items, index, ±1)` —
 * out-of-range moves return the input. Both are the shared `domain/reorder` helpers.
 *
 * DIVERGENCE: `pcf_but_Admin_Checklist_Reorder_Buttons_Save.OnChange` writes
 * `{Order: RecordItem.Position}` for EVERY listed row (`ForAll(… UpdateIf(…))`, L1652-1659). Here
 * only the rows whose Order changed are written; each write starts one run of the sync flow, so
 * the result is the same with fewer runs.
 *
 * SOURCE DEFECT (D18 j): the canvas reorder list (`colTasksToReorder`, L366-373) has no
 * `To Delete` filter, so it lists and renumbers rows waiting for deletion. The snapshot here comes
 * from the grid's groups, which exclude them.
 */
export { moveBy as moveItem, reorderPatch } from "@/domain/reorder";

/**
 * After deleting `deleted`, every OTHER visible row of the same group with a greater Order moves
 * up by one — `cmp_DeleteChecklistItem_AdminScreen.OnConfirm` (L1736-1752).
 *
 * SOURCE DEFECT (D18 j): the canvas renumber filter has no `To Delete` test, so it also
 * renumbers rows already waiting for deletion. Those rows are skipped here.
 *
 * A deleted row with a BLANK Order renumbers NOTHING. The canvas filter
 * `Order > locSelectedChecklistEntity.Order` (DCS:1742) is delegated to Dataverse, where a
 * comparison with null matches no rows, so its `ForAll` patches nothing. Rows with a blank
 * Order are never renumbered either (`blank > n` is false).
 */
export function renumberAfterDelete(
  visibleGroup: readonly Pick<ChecklistTask, "id" | "order" | "toDelete">[],
  deleted: Pick<ChecklistTask, "id" | "order">,
): OrderPatch[] {
  if (typeof deleted.order !== "number") return [];
  const cut = deleted.order;
  return visibleGroup
    .filter((t) => t.id !== deleted.id && !t.toDelete && typeof t.order === "number" && t.order > cut)
    .map((t) => ({ id: t.id, order: (t.order as number) - 1 }));
}


/** What the Reorder panel captured when it opened. */
export type ReorderSnapshotRow = Pick<ChecklistTask, "id" | "name" | "order">;

export function snapshotGroup(tasks: readonly ChecklistTask[]): ReorderSnapshotRow[] {
  return tasks.map((t) => ({ id: t.id, name: t.name, order: t.order }));
}

/**
 * NEW — no canvas equivalent (the canvas list was a one-off `ClearCollect`). True when the live
 * group no longer matches the snapshot the panel opened with — a row was added or removed, or a
 * row's Order changed (another user, a refetch after a partial write). Saving a patch computed
 * against the snapshot would then leave gaps or duplicates.
 */
export function reorderSnapshotStale(
  snapshot: readonly Pick<ChecklistTask, "id" | "order">[],
  live: readonly Pick<ChecklistTask, "id" | "order">[],
): boolean {
  if (snapshot.length !== live.length) return true;
  const liveOrder = new Map(live.map((t) => [t.id, t.order]));
  return snapshot.some((s) => !liveOrder.has(s.id) || liveOrder.get(s.id) !== s.order);
}

/**
 * Save is enabled only when the order differs from the opening order. The shared
 * `orderChanged` accepts id strings (the `ReorderPanel` uses it for its dirty state).
 * DIVERGENCE: `pcf_but_Admin_Checklist_Reorder_Buttons_Save` has no `DisplayMode`, so the canvas
 * Save is always enabled.
 */
export { orderChanged } from "@/domain/reorder";

/* ══════════════════════════════════════════════════════════ validation ══ */

export interface TaskFormErrors {
  name?: string;
}

/**
 * The whole save gate: `pcf_but_Admin_Checklist_Form_Buttons_Save.DisplayMode` is Disabled while
 * `lbl_Admin_Checklist_Form_Fields_Name_ErrorMessage.Visible = IsBlank(Trim(txt_…_Name.Value))`
 * (L1260-1265). Lengths are capped by the inputs' `MaxLength`, so the length message is NEW and
 * only a pasted-over-limit guard.
 */
export function validateTask(form: Pick<TaskForm, "name" | "holdingDescription">): TaskFormErrors {
  const errors: TaskFormErrors = {};
  if (form.name.trim() === "") errors.name = BLANK_NAME_MESSAGE;
  else if (form.name.trim().length > MAX_TEXT_LENGTH) errors.name = `Use at most ${MAX_TEXT_LENGTH} characters.`;
  return errors;
}

export const isTaskFormValid = (form: Pick<TaskForm, "name" | "holdingDescription">): boolean =>
  Object.keys(validateTask(form)).length === 0;

/**
 * New tasks default to INACTIVE, as in the canvas: `tgl_Active_ChecklistForm.Checked:
 * If(locSelectedChecklistEntity.Status = …Active, true, false)` is false with no selection
 * (L1208). Kept by product decision (D18 a).
 */
export const NEW_TASK_DEFAULT_ACTIVE = false;

export function emptyTaskForm(): TaskForm {
  return {
    name: "", holdingDescription: "", gateRelevance: false, isCompletionDate: false,
    isActive: NEW_TASK_DEFAULT_ACTIVE,
  };
}

/**
 * The Add/Edit panel is dirty when its form differs from the values it opened with (shared
 * `isDirty`): both forms come from `emptyTaskForm` / `formFromTask` (same keys, same order).
 * DIVERGENCE: drives the "Discard changes?" prompt; the canvas Cancel and ✕ just reset and close
 * (`Select(but_Admin_Checklist_Form_Buttons_Reset)`, L972, L1392-1399).
 */
export function taskFormChanged(seed: TaskForm, form: TaskForm): boolean {
  return isDirty(form, seed);
}

/** The Edit panel's seed: each field's `Default`/`Value`/`Checked` from `locSelectedChecklistEntity` (L1077, L1156, L1188, L1198, L1208). */
export function formFromTask(task: ChecklistTask): TaskForm {
  return {
    name: task.name,
    holdingDescription: task.holdingDescription,
    gateRelevance: task.gateRelevance,
    isCompletionDate: task.isCompletionDate === true,
    isActive: task.isActive,
  };
}

/** `lbl_Admin_Checklist_Form_Fields_Name_Details.Text: $"{Len(…)}/{gblAppConstants.DefaultDefMaxLength}"` — the `n/256` counter (L1121, L1174). */
export const counter = (value: string): string => `${value.length}/${MAX_TEXT_LENGTH}`;

/* ═══════════════════════════════════════════════════════════ write plans ══ */

/**
 * The single-request writes of this screen, built here as `WritePlan`s and run by
 * `data/runPlan.ts` → `data/executePlan.ts` (CONVENTIONS rule 17, documented exception in
 * 09-APPLICATION-SETTINGS-PORT-OPEN-POINTS §1). Each is ONE guarded update of the task table —
 * the same request the data layer's former `updateTask` / `toggleCompletionDate` / `setTaskActive`
 * sent, including the guard's existence read; the `label` keeps the data layer's operation text
 * (`OPERATION.update`) word for word, so failure texts are unchanged.
 *
 * DIVERGENCE (guard): a row deleted meanwhile is refused ("record deleted") instead of being
 * written; the canvas `Patch(…, LookUp(…), …)` simply failed or wrote nothing.
 *
 * NOT plans (doc 09 §1 says otherwise — this is the code): the create flow (create-then-set-
 * status, `createTask`), the soft delete + renumber (`softDeleteTask`) and the reorder
 * (`writeOrders`) stay per-row writes in `data/adminDefaultChecklists.ts`.
 *
 * A plan refuses itself when the user is not an admin. The screen already refuses first (it puts
 * the message on the right surface — panel vs toast), so this is the second line of defence.
 */
const TASK_SET = CHECKLIST_ENTITY_SETS.tasks;

export interface PlanOptions { canEdit: boolean }

function singleWrite(opts: PlanOptions, write: PlannedWrite): WritePlan {
  if (!opts.canEdit) return refusePlan(OUT_OF_SCOPE_MESSAGE);
  const plan = emptyPlan();
  plan.writes.push(write);
  return plan;
}

/**
 * Edit mode: one guarded PATCH of the edit payload — the second `Patch` of
 * `pcf_but_Admin_Checklist_Form_Buttons_Save.OnChange` (L1323-1346): trimmed Name and Holding Task
 * Description, Gate Relevance, Is Completion Date, Status AND Status Reason, and the tab's Owning
 * Business Unit.
 */
export function planUpdateTask(
  id: string, form: TaskForm, tab: ChecklistTab | undefined, opts: PlanOptions,
): WritePlan {
  return singleWrite(opts, guardedUpdate(
    // `ChecklistTaskWrite` is an interface, so it has no implicit index signature.
    TASK_SET, id, { ...buildEditPayload(form, tab) } as Record<string, unknown>,
    "checklist item updated", OPERATION.update,
  ));
}

/**
 * Completion Date toggle — `ico_EnablelCompletionDate_….OnChange: Patch(…, {'Is Completion Date':
 * Not(ThisItem.'Is Completion Date')})` (L610-617): one guarded PATCH, no confirmation; `null`
 * becomes `true` (Power Fx `Not(blank)`). The canvas then runs `Refresh('Project Default
 * Approvals')`; `useToggleCompletion` refetches the locks for that.
 */
export function planToggleCompletion(
  task: Pick<ChecklistTask, "id" | "isCompletionDate">, opts: PlanOptions,
): WritePlan {
  return singleWrite(opts, guardedUpdate(
    TASK_SET, task.id, { vsb_iscompletiondate: !(task.isCompletionDate ?? false) },
    "completion date changed", OPERATION.update,
  ));
}

/**
 * Activate / deactivate from the row: one guarded PATCH of statecode AND statuscode, as the form
 * save sends.
 *
 * SOURCE DEFECT (D18 k): `cmp_ActivateDeactiveChecklistItem_AdminScreen.OnConfirm` patches
 * `Status` only (L1777-1787), while the panel save writes `Status` and `Status Reason`, so a row
 * deactivated from the grid kept an Active Status Reason. Both paths write both here. The pre-port
 * twin `toggleActiveCanvasParity` (UT-ADCHK-017b) was not carried over by the port.
 */
export function planSetActive(id: string, isActive: boolean, opts: PlanOptions): WritePlan {
  return singleWrite(opts, guardedUpdate(
    TASK_SET, id, statusPayload(isActive),
    `checklist item ${isActive ? "activated" : "deactivated"}`, OPERATION.update,
  ));
}

/* ═══════════════════════════════════════════════════ dialogs and busy ══ */

/**
 * `cmp_ActivateDeactiveChecklistItem_AdminScreen` (L1757-1791):
 *   - `Title: $"{If(…Active, "Decativate", "Activate")} checklist item?"`
 *   - `ConfirmButtonText: If(…Active, "Decativate", "Activate")`
 *   - `Description: "Are you sure that you want to change status of task """ & Name & """?"` — verbatim.
 *
 * SOURCE DEFECT (D18 g): "Decativate" is misspelt in the title and the confirm button; both read
 * "Deactivate" here (original spelling kept in this comment, rule 7).
 */
export function statusDialog(task: Pick<ChecklistTask, "name" | "isActive">) {
  const verb = task.isActive ? "Deactivate" : "Activate";
  return {
    title: `${verb} checklist item?`,
    confirmText: verb,
    description: `Are you sure that you want to change status of task "${task.name}"?`,
  };
}

/**
 * `cmp_DeleteChecklistItem_AdminScreen` (L1700-1756): `Title` "Delete checklist item?" and
 * `ConfirmButtonText` "Delete" — verbatim.
 *
 * DIVERGENCE: the canvas `Description` reads `"Are you sure that you want to permanently delete
 * task """ & Name & """?"`. Nothing is deleted permanently by the click: the row is flagged
 * `To Delete` and the sync flow `SynchroniseProjectTaskList-Add_Update` does the deleting. The
 * text here says what really happens (UT-ADCHK-048).
 */
export function deleteDialog(task: Pick<ChecklistTask, "name">) {
  return {
    title: "Delete checklist item?",
    confirmText: "Delete",
    description:
      `Are you sure that you want to delete task "${task.name}"? ` +
      "It is removed from this list straight away. The synchronisation process then removes it " +
      "from the checklists of projects that are not yet approved, and deletes the item itself.",
  };
}

/**
 * The progress texts (`locAdminLoadingDialogText`).
 *
 * SOURCE DEFECT (D18 h): the canvas sets `locAdminLoadingDialog` / `locAdminLoadingDialogText`
 * but the screen has NO loading pop-up control, so none of these texts was ever shown. Here they
 * are the busy overlay / row spinner label.
 */
export const busyText = {
  /**
   * `pcf_but_Admin_Checklist_Form_Buttons_Save.OnChange` — `$"Checklist item
   * '{txt_Admin_Checklist_Form_Fields_Name.Value}' will be saved, please wait..."` (L1287),
   * verbatim; the name is trimmed here. Also the row Activate/Deactivate text
   * (`cmp_ActivateDeactiveChecklistItem_AdminScreen.OnConfirm`, L1773). SOURCE DEFECT there: the
   * canvas names the Add/Edit panel's text box, which is empty or stale for a row action; the
   * screen passes the row's name.
   */
  save: (name: string) => `Checklist item '${name.trim()}' will be saved, please wait...`,
  /** `ico_EnablelCompletionDate_….OnChange` — verbatim (L604). */
  completion: (name: string) => `Completion Date for '${name}' will be changed, please wait...`,
  /** `pcf_but_Admin_Checklist_Reorder_Buttons_Save.OnChange` — verbatim (L1649). */
  reorder: () => "New order will be saved, please wait...",
  /**
   * `cmp_DeleteChecklistItem_AdminScreen.OnConfirm` — `$"Deleteing item
   * '{txt_Admin_Checklist_Form_Fields_Name.Value}', please wait..."` (L1717). SOURCE DEFECT (D18 i):
   * misspelt ("Deleteing", original kept here) and it names the panel's text box, not the row.
   * Here: "Deleting" and the row's name.
   */
  remove: (name: string) => `Deleting item '${name}', please wait...`,
};

/** The success toasts. */
export const successText = {
  /** `pcf_but_Admin_Checklist_Form_Buttons_Save.OnChange` — verbatim (L1351). */
  save: "Checklist item was successfully saved.",
  /** `ico_EnablelCompletionDate_….OnChange` — verbatim (L620). */
  completion: "Completion Date was successfully changed.",
  /** NEW — no canvas equivalent: the canvas row status change sets no result text. */
  status: (isActive: boolean) => `Checklist item was successfully ${isActive ? "activated" : "deactivated"}.`,
  /** NEW — no canvas equivalent: the canvas reorder save sets no result text. */
  reorder: "New order was successfully saved.",
  /** NEW — no canvas equivalent: the canvas delete sets no result text (see `deleteDialog`). */
  remove: "Checklist item was deleted. It disappears from project checklists once synchronisation has finished.",
};
