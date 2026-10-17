/**
 * Check List Settings — pure business rules (no I/O). Each function cites the FR/DR it
 * implements in `codeapp-knowledge-base/screens/application-settings/checklist-settings/
 * 06-code-app-requirements/01-build-requirements.md`; `L<n>` = line in the canvas
 * `Admin Project Default Checklists Screen.pa.yaml`.
 */
import type {
  ChecklistCluster, ChecklistTab, ChecklistTask, OrderPatch, TaskForm,
} from "@/data/settings/checklist-settings";
import { isDirty } from "@/domain/form";
import { nextOrder as sharedNextOrder } from "@/domain/reorder";

/* ═══════════════════════════════════════════════════════════════ texts ══ */

/** FR-5 tooltip, verbatim from the canvas (L518, L552, L578, L635). */
export const LOCK_TOOLTIP =
  "This Check List item is in use by a Project Gate. Delete the Project Gate to edit the Check List item.";

/** Shown instead when the lock query itself failed: the rows fail CLOSED. */
export const LOCK_UNKNOWN_TOOLTIP =
  "It could not be checked whether this Check List item is in use by a Project Gate, so it cannot be changed right now.";

/**
 * Shown while the lock query is still loading (gap B-4). Rows stay disabled (fail closed), but
 * they must not claim "in use by a Project Gate" before that is known.
 */
export const LOCK_LOADING_TOOLTIP =
  "Checking whether this Check List item is in use by a Project Gate…";

/** Gap B-3: the list changed while the Reorder panel was open. */
export const REORDER_STALE_MESSAGE =
  "The items in this cluster changed while the panel was open. Cancel and open Reorder again to see the current list.";

/** V1 (L1051). */
export const BLANK_NAME_MESSAGE = "Value cannot be blank.";

/** `gblAppConstants.DefaultDefMaxLength` (DR-11, D-11). */
export const MAX_TEXT_LENGTH = 256;

/** FR-4: holding description cut (L659). */
export const HOLDING_CUT = 110;

/** FR-8 help text. The canvas said "drag and drop"; this screen reorders with buttons (D-15). */
export const REORDER_HELP = "Use Move up and Move down to change the order of the listed items.";

/* ════════════════════════════════════════════════════════════ captions ══ */

/** FR-3 caption mapping (L719-736). */
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

/** FR-4 / AC-4.1: first 110 characters + " ..." when longer than 110. */
export function truncateHolding(text: string | null | undefined): string {
  const value = text ?? "";
  return value.length > HOLDING_CUT ? `${value.slice(0, HOLDING_CUT)} ...` : value;
}

/** D-16: Gate Relevance and Completion Date both read Yes/No; null → No. */
export function yesNo(value: boolean | null | undefined): "Yes" | "No" {
  return value === true ? "Yes" : "No";
}

/* ════════════════════════════════════════════════════════════════ tabs ══ */

/**
 * DR-2 / D-8: `vsb_order` on the tab table is TEXT, so "10" sorted before "2" in the canvas.
 * Sort by the numeric value when the text is a number, non-numeric or blank Orders last, then
 * by the raw text, then by name.
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
 * FR-2 / DR-2 / D-7: the `?tab=` param when it names a known tab, otherwise the FIRST tab in
 * display order (the canvas picked the first by name, which may not be the left-most).
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
 * Parity R1 GAP-1: a blank Order sorts FIRST, as in the canvas. The grid's delegated
 * `SortByColumns(…, "vsb_order", SortOrder.Ascending)` (L455-466) gets Dataverse's nulls-first
 * ascending order, and the reorder list's local `Sort(colTasksToReorder, Order, Ascending)`
 * (L1571-1575) also puts blanks first.
 */
const orderOf = (t: Pick<ChecklistTask, "order">) => t.order ?? Number.NEGATIVE_INFINITY;

/**
 * FR-4 / AC-4.3: by Order ascending (blank Orders first, as in the canvas; ties, blanks
 * included, by name for a stable view). Used by the grid and the Reorder snapshot.
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
 * FR-4 / DR-4: group a tab's tasks by cluster. Rows waiting for deletion are dropped (AC-4.2;
 * `null` To Delete stays). Tasks whose cluster is not a visible cluster are not shown.
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
 * DR-5 / D-5: `max(Order of the VISIBLE tasks in the cluster, default 0) + 1`. The canvas
 * counted every row, rows waiting for deletion included.
 */
export function nextOrder(visibleClusterTasks: readonly Pick<ChecklistTask, "order" | "toDelete">[]): number {
  // E10: the shared `max(0, …orders) + 1` once rows waiting for deletion are dropped.
  return sharedNextOrder(visibleClusterTasks.filter((t) => !t.toDelete).map((t) => t.order));
}

/** FR-5 / AC-5.1: locked when a non-"Only Notifications" gate approval points at the task. */
export function isLocked(taskId: string, lockedIds: ReadonlySet<string>): boolean {
  return lockedIds.has(taskId.toLowerCase());
}

/**
 * FR-5 with the lock query's own state (gap B-4). Only `free` enables the row's actions;
 * `loading` and `unknown` (query failed) both fail CLOSED, but with their own tooltip.
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
 * Gap B-5: `groupTasksByCluster` keys by the visible cluster's id; a task's `clusterId` may
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
 * DR-7 / AC-8.1: `reorderPatch(current, newIds)` — 1-based positions for the new id order, only
 * for rows whose Order changed; ids not in `current` are ignored. `moveItem(items, index, ±1)` —
 * out-of-range moves return the input. Both are the shared `domain/reorder` helpers (M12; same
 * signatures and results as the local copies they replaced).
 */
export { moveBy as moveItem, reorderPatch } from "@/domain/reorder";

/**
 * DR-8 / AC-11.1: after deleting `deleted`, every OTHER visible row of the same group with a
 * greater Order moves up by one. Rows waiting for deletion are skipped (the canvas renumbered
 * them too, R-8).
 *
 * Parity R2 GAP-1: a deleted row with a BLANK Order renumbers NOTHING. The canvas filter
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


/** What the Reorder panel captured when it opened (gap B-3). */
export type ReorderSnapshotRow = Pick<ChecklistTask, "id" | "name" | "order">;

export function snapshotGroup(tasks: readonly ChecklistTask[]): ReorderSnapshotRow[] {
  return tasks.map((t) => ({ id: t.id, name: t.name, order: t.order }));
}

/**
 * Gap B-3: true when the live group no longer matches the snapshot the panel opened with — a
 * row was added or removed, or a row's Order changed (another user, a refetch after a partial
 * write). Saving a patch computed against the snapshot would then leave gaps or duplicates.
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
 * AC-8.3: Save is enabled only when the order differs from the opening order. E10: the shared
 * `orderChanged` now accepts id strings (the `ReorderPanel` uses it for its dirty state).
 */
export { orderChanged } from "@/domain/reorder";

/* ══════════════════════════════════════════════════════════ validation ══ */

export interface TaskFormErrors {
  name?: string;
}

/** FR-6 / V1: `trim(name)` must not be empty. Lengths are capped by the inputs (V2). */
export function validateTask(form: Pick<TaskForm, "name" | "holdingDescription">): TaskFormErrors {
  const errors: TaskFormErrors = {};
  if (form.name.trim() === "") errors.name = BLANK_NAME_MESSAGE;
  else if (form.name.trim().length > MAX_TEXT_LENGTH) errors.name = `Use at most ${MAX_TEXT_LENGTH} characters.`;
  return errors;
}

export const isTaskFormValid = (form: Pick<TaskForm, "name" | "holdingDescription">): boolean =>
  Object.keys(validateTask(form)).length === 0;

/** D-3 (open decision): new tasks default to INACTIVE, as in the canvas (L1208). */
export const NEW_TASK_DEFAULT_ACTIVE = false;

export function emptyTaskForm(): TaskForm {
  return {
    name: "", holdingDescription: "", gateRelevance: false, isCompletionDate: false,
    isActive: NEW_TASK_DEFAULT_ACTIVE,
  };
}

/**
 * M7: the Add/Edit panel is dirty when its form differs from the values it opened with. H7
 * `isDirty`: both forms come from `emptyTaskForm` / `formFromTask` (same keys, same order).
 */
export function taskFormChanged(seed: TaskForm, form: TaskForm): boolean {
  return isDirty(form, seed);
}

export function formFromTask(task: ChecklistTask): TaskForm {
  return {
    name: task.name,
    holdingDescription: task.holdingDescription,
    gateRelevance: task.gateRelevance,
    isCompletionDate: task.isCompletionDate === true,
    isActive: task.isActive,
  };
}

/** `n/256` counter (V2). */
export const counter = (value: string): string => `${value.length}/${MAX_TEXT_LENGTH}`;

/* ═══════════════════════════════════════════════════ dialogs and busy ══ */

/** FR-10 (typo "Decativate" fixed, D-21); the ROW's name (D-14). */
export function statusDialog(task: Pick<ChecklistTask, "name" | "isActive">) {
  const verb = task.isActive ? "Deactivate" : "Activate";
  return {
    title: `${verb} checklist item?`,
    confirmText: verb,
    description: `Are you sure that you want to change status of task "${task.name}"?`,
  };
}

/**
 * FR-11 dialog. The canvas said "permanently delete", which is not what happens: the row is
 * flagged and the sync flow does the deleting (D-17). The text says so.
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

/** FR-12 busy texts (the canvas built them but never showed them; "Deleteing" fixed). */
export const busyText = {
  save: (name: string) => `Checklist item '${name.trim()}' will be saved, please wait...`,
  completion: (name: string) => `Completion Date for '${name}' will be changed, please wait...`,
  reorder: () => "New order will be saved, please wait...",
  remove: (name: string) => `Deleting item '${name}', please wait...`,
};

/** Success texts (the canvas' own, L620/L1351, plus the ones it never wrote). */
export const successText = {
  save: "Checklist item was successfully saved.",
  completion: "Completion Date was successfully changed.",
  status: (isActive: boolean) => `Checklist item was successfully ${isActive ? "activated" : "deactivated"}.`,
  reorder: "New order was successfully saved.",
  remove: "Checklist item was deleted. It disappears from project checklists once synchronisation has finished.",
};
