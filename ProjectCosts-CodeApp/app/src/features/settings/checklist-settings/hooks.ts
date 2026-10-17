/**
 * Check List Settings — TanStack Query wiring. Keys come from the shared `qk.settings.checklists`
 * (values unchanged; Project Gates invalidates `locks()` after a gate write). No optimistic
 * updates (DR-10): every mutation refreshes the current tab's task query — and every Project
 * Gates dataset, which nests the checklist tasks — only after Dataverse accepted the write.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createTask, loadClusters, loadLockedTaskIds, loadTabs, loadTasks, setTaskActive,
  softDeleteTask, toggleCompletionDate, updateTask, writeOrders,
  type ChecklistTab, type ChecklistTask, type CreateTaskArgs, type OrderPatch, type TaskForm,
} from "@/data/settings/checklist-settings";
import { CHECKLIST_ENTITY_SETS } from "@/data/settings/checklistTables";
import { invalidateAfterChecklistsWrite } from "@/data/settings/invalidation";
import { FRESH_ON_ENTRY_ONCE } from "@/data/settings/queryPresets";
import { qk } from "@/data/keys";
import { useTablePrivileges } from "@/platform/privileges";

/**
 * Alias of the shared `qk.settings.checklists` (kept because tests import it). `locks()` must
 * stay `["settings","checklist-settings","locks"]`: Project Gates invalidates it.
 */
export const checklistKeys = qk.settings.checklists;

/** R-1/R-2. */
export function useChecklistTabs() {
  return useQuery({ queryKey: checklistKeys.tabs(), queryFn: () => loadTabs(), staleTime: 5 * 60_000 });
}

/** R-3 / DR-3: not tab-scoped, cached for the visit. */
export function useChecklistClusters(enabled: boolean) {
  return useQuery({
    queryKey: checklistKeys.clusters(), queryFn: () => loadClusters(), enabled, staleTime: 5 * 60_000,
  });
}

/** R-4 / DR-4: one query per tab. */
export function useChecklistTasks(tabId: string | null) {
  return useQuery({
    queryKey: checklistKeys.tasks(tabId),
    queryFn: () => loadTasks(tabId as string),
    enabled: Boolean(tabId),
    staleTime: 30_000,
  });
}

/**
 * R-5 / DR-4: exactly one CLDA query per mount. The shared preset `FRESH_ON_ENTRY_ONCE` (H8,
 * Wave C) gives "refetch on every mount", "no focus refetch" and an INFINITE `staleTime`, so a
 * reconnect or a second observer never starts another CLDA query during the visit. The key is
 * unchanged (Project Gates invalidates it).
 */
export function useChecklistLocks(enabled: boolean) {
  return useQuery({
    ...FRESH_ON_ENTRY_ONCE,
    queryKey: checklistKeys.locks(),
    queryFn: () => loadLockedTaskIds(),
    enabled,
  });
}

/**
 * Server-enforced privileges (FR-1, D-19): every command is offered and Dataverse decides; a
 * 403 surfaces through `permissionMessage`. Kept as a hook so a pre-emptive provider can be
 * dropped in later without touching the screen (E13 `useTablePrivileges`, server-enforced default).
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

/** FR-6 / FR-7. */
export function useSaveTask(tabId: string | null) {
  const invalidate = useInvalidateTasks(tabId);
  return useMutation({
    mutationFn: async (input: SaveTaskArgs) => {
      if (input.mode === "create") return createTask(input.args);
      await updateTask(input.id, input.form, input.tab);
      return input.id;
    },
    onSuccess: invalidate,
    // A create whose status step failed still created a row; show it.
    onError: invalidate,
  });
}

/**
 * FR-9. On success the canvas also runs `Refresh('Project Default Approvals')` (DCS:621), so the
 * locks are refetched too (parity R3 GAP-R3-2). On failure the list is refreshed (a row deleted
 * meanwhile, GAP-R3-1).
 */
export function useToggleCompletion(tabId: string | null) {
  const invalidate = useInvalidateTasks(tabId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (task: Pick<ChecklistTask, "id" | "isCompletionDate">) => toggleCompletionDate(task),
    onSuccess: () => Promise.all([invalidate(), queryClient.invalidateQueries({ queryKey: checklistKeys.locks() })]),
    onError: invalidate,
  });
}

/** FR-10. Refreshes on failure too (a row deleted meanwhile, GAP-R3-1). */
export function useSetActive(tabId: string | null) {
  const invalidate = useInvalidateTasks(tabId);
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => setTaskActive(id, isActive),
    onSettled: invalidate,
  });
}

/** FR-11: invalidates on failure too — step 1 may have landed before step 2 failed. */
export function useSoftDelete(tabId: string | null) {
  const invalidate = useInvalidateTasks(tabId);
  return useMutation({
    mutationFn: ({ id, renumber }: { id: string; renumber: OrderPatch[] }) => softDeleteTask(id, renumber),
    onSettled: invalidate,
  });
}

/** FR-8: invalidates on failure too — a partial write is possible. */
export function useReorder(tabId: string | null) {
  const invalidate = useInvalidateTasks(tabId);
  return useMutation({
    mutationFn: (rows: OrderPatch[]) => writeOrders(rows),
    onSettled: invalidate,
  });
}
