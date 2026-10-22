/**
 * Check List Settings — TanStack Query wiring. Keys are the shared `qk.adminChecklist*`
 * (Project Gates invalidates `qk.adminChecklistLocks` after a gate write). No optimistic
 * updates: every mutation refreshes the current tab's task query — and every Project
 * Gates dataset, which nests the checklist tasks — only after Dataverse accepted the write.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createTask, loadClusters, loadLockedTaskIds, loadTabs, loadTasks, softDeleteTask, writeOrders,
  type ChecklistTab, type ChecklistTask, type CreateTaskArgs, type OrderPatch, type TaskForm,
} from "@/data/adminDefaultChecklists";
import { runPlan } from "@/data/runPlan";
import { planSetActive, planToggleCompletion, planUpdateTask } from "./rules";
import { CHECKLIST_ENTITY_SETS } from "@/data/dataverseNames";
import { invalidateAfterChecklistsWrite } from "@/data/adminInvalidation";
import { FRESH_ON_ENTRY_ONCE } from "@/data/adminQueryPresets";
import { qk } from "@/data/keys";
import { useTablePrivileges } from "@/platform/privileges";

/** The country/technology tabs. */
export function useChecklistTabs() {
  return useQuery({ queryKey: qk.adminChecklistTabs, queryFn: () => loadTabs(), staleTime: 5 * 60_000 });
}

/** Not tab-scoped, cached for the visit. */
export function useChecklistClusters(enabled: boolean) {
  return useQuery({
    queryKey: qk.adminChecklistClusters, queryFn: () => loadClusters(), enabled, staleTime: 5 * 60_000,
  });
}

/** One query per tab. */
export function useChecklistTasks(tabId: string | null) {
  return useQuery({
    queryKey: qk.adminChecklistTasks(tabId),
    queryFn: () => loadTasks(tabId as string),
    enabled: Boolean(tabId),
    staleTime: 30_000,
  });
}

/**
 * Exactly one CLDA query per mount. The shared preset `FRESH_ON_ENTRY_ONCE` gives "refetch on every mount", "no focus refetch" and an INFINITE `staleTime`, so a
 * reconnect or a second observer never starts another CLDA query during the visit. Project Gates
 * invalidates this key.
 */
export function useChecklistLocks(enabled: boolean) {
  return useQuery({
    ...FRESH_ON_ENTRY_ONCE,
    queryKey: qk.adminChecklistLocks,
    queryFn: () => loadLockedTaskIds(),
    enabled,
  });
}

/**
 * Server-enforced privileges: every command is offered and Dataverse decides; a 403 surfaces
 * through `permissionMessage`. Kept as a hook so a pre-emptive provider can be dropped in later
 * without touching the screen (`useTablePrivileges`, server-enforced default).
 */
export function useChecklistPrivileges() {
  return useTablePrivileges(CHECKLIST_ENTITY_SETS.tasks);
}

function useInvalidateTasks(tabId: string | null) {
  const queryClient = useQueryClient();
  return () => invalidateAfterChecklistsWrite(queryClient, tabId);
}

export type SaveTaskArgs =
  | { mode: "create"; args: CreateTaskArgs }
  | { mode: "edit"; id: string; form: TaskForm; tab: ChecklistTab | undefined };

/**
 * Create or edit one task. The EDIT branch is a `WritePlan` (`planUpdateTask`) run by `runPlan`,
 * which rethrows the failed write's own error, so the screen's `instanceof` branches and error
 * texts are unchanged. The create branch keeps the data layer's create-then-update flow.
 */
export function useSaveTask(tabId: string | null, canEdit: boolean) {
  const invalidate = useInvalidateTasks(tabId);
  return useMutation({
    mutationFn: async (input: SaveTaskArgs) => {
      if (input.mode === "create") return createTask(input.args);
      await runPlan(planUpdateTask(input.id, input.form, input.tab, { canEdit }), "Save checklist item");
      return input.id;
    },
    onSuccess: invalidate,
    // A create whose status step failed still created a row; show it.
    onError: invalidate,
  });
}

/**
 * Toggle the Completion Date. On success the canvas also runs `Refresh('Project Default Approvals')`
 * (DCS:621), so the locks are refetched too. On failure the list is refreshed (a row deleted
 * meanwhile).
 */
export function useToggleCompletion(tabId: string | null, canEdit: boolean) {
  const invalidate = useInvalidateTasks(tabId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (task: Pick<ChecklistTask, "id" | "isCompletionDate">) =>
      runPlan(planToggleCompletion(task, { canEdit }), "Change Completion Date"),
    onSuccess: () => Promise.all([invalidate(), queryClient.invalidateQueries({ queryKey: qk.adminChecklistLocks })]),
    onError: invalidate,
  });
}

/** Activate / deactivate. Refreshes on failure too (a row deleted meanwhile). */
export function useSetActive(tabId: string | null, canEdit: boolean) {
  const invalidate = useInvalidateTasks(tabId);
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      runPlan(planSetActive(id, isActive, { canEdit }), "Change checklist item status"),
    onSettled: invalidate,
  });
}

/** Soft delete: invalidates on failure too — step 1 may have landed before step 2 failed. */
export function useSoftDelete(tabId: string | null) {
  const invalidate = useInvalidateTasks(tabId);
  return useMutation({
    mutationFn: ({ id, renumber }: { id: string; renumber: OrderPatch[] }) => softDeleteTask(id, renumber),
    onSettled: invalidate,
  });
}

/** Reorder: invalidates on failure too — a partial write is possible. */
export function useReorder(tabId: string | null) {
  const invalidate = useInvalidateTasks(tabId);
  return useMutation({
    mutationFn: (rows: OrderPatch[]) => writeOrders(rows),
    onSettled: invalidate,
  });
}
