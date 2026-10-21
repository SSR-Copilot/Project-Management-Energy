/**
 * Admin Project Default Checklists Screen — the data layer (connected 19 Oct 2026, D18).
 *
 * Canvas screen: `Admin Project Default Checklists Screen` (PM app). Tables registered with
 * `pac code add-data-source` on 19 Oct 2026 (one at a time, `dataSourcesInfo.ts` diffed after
 * each). The reads live in `data/adminDefaultChecklists.ts`:
 *
 *  - `useChecklistScopes()` → `vsb_checklistcountryandtechnologies`. No server `$orderby`:
 *      `vsb_order` is a TEXT column, so the order comes from `sortScopes` in `rules.ts`.
 *  - `useChecklistGates()` → `vsb_projectstates`, `vsb_isvisibleonchecklist eq true`, by order.
 *  - `useScopeTasks(scopeId, gateId)` → `vsb_projectdefaultchecklistses` for the scope and gate,
 *      `vsb_todelete ne true`, by order.
 *  - `useBlockingApprovals(taskIds)` → `vsb_checklistdefaultapprovalses` for exactly those tasks
 *      (rule 2). The mode is NOT filtered server-side: `ne` drops blank modes, and a blank mode
 *      must lock (Power Fx `Blank() <> X` is true) — `blockingChecklistIds` decides.
 *
 * WRITES — each `WritePlan` from `rules.ts` is sent IN ORDER (`data/usePlanWrite.ts`). The sync
 * flow `SynchroniseProjectTaskList-Add_Update` fires on every one of them
 * (ProjectDocs/migration-plans/04-flow-inventory.md), so:
 *   - a new task is TWO writes: the create, then the update of the created row (`CREATED_ROW_ID`)
 *     — the update carries the status to the projects;
 *   - delete is ONLY the `vsb_todelete = true` update, never a real delete — the flow deletes the
 *     project copies and then the row itself;
 *   - the Owning Business Unit is the scope row's, as written by `rules.ts`;
 *   - nothing is copied into `vsb_projectchecklists` by the app.
 * After a write the gate's tasks and locks are refreshed. (The canvas also does
 * `Refresh('Project Default Approvals')` after the Completion Date toggle; this screen does not
 * display that table, so nothing here needs refetching for it.)
 */
import { useQuery } from "@tanstack/react-query";
import { CHOICE_PROCESS, ES, ES_PROCESS } from "@/data/dataverseNames";
import { qk } from "@/data/keys";
import type { ScreenData } from "@/data/notConnected";
import { usePlanWrite } from "@/data/usePlanWrite";
import {
  highestTaskOrder, listChecklistGates, listChecklistScopes, listScopeTasks, listTaskApprovals,
} from "@/data/adminDefaultChecklists";
import { blockingChecklistIds, saveErrorText, type GateRow, type ScopeRow, type TaskRow } from "./rules";

/** Entity sets this screen reads and writes. */
export const TABLES: readonly string[] = [
  ES.checklistCountryAndTechnologies,
  ES.projectStates,
  ES_PROCESS.projectDefaultChecklists,
  ES_PROCESS.checkListDefaultApprovals,
  ES_PROCESS.projectDefaultApprovals,
];

const NO_SCOPES: ScopeRow[] = [];
const NO_GATES: GateRow[] = [];
const NO_TASKS: TaskRow[] = [];
const NO_IDS: ReadonlySet<string> = new Set<string>();
/** Reference data — edited rarely, refreshed after every write here anyway. */
const STALE_MS = 5 * 60 * 1000;

function asScreenData<T>(
  q: { data: T | undefined; isLoading: boolean; error: unknown }, empty: T,
): ScreenData<T> {
  return { data: q.data ?? empty, isLoading: q.isLoading, error: q.error ?? undefined, connected: true };
}

/** The scope axis — the tab strip. */
export function useChecklistScopes(): ScreenData<ScopeRow[]> {
  return asScreenData(
    useQuery({ queryKey: qk.checklistScopes, queryFn: listChecklistScopes, staleTime: STALE_MS }),
    NO_SCOPES,
  );
}

/** The gates (`Project States` flagged for the checklist). */
export function useChecklistGates(): ScreenData<GateRow[]> {
  return asScreenData(
    useQuery({ queryKey: qk.checklistGates, queryFn: listChecklistGates, staleTime: STALE_MS }),
    NO_GATES,
  );
}

/** One gate's default tasks within one scope. */
export function useScopeTasks(scopeId: string | null, gateId: string | null): ScreenData<TaskRow[]> {
  return asScreenData(useQuery({
    queryKey: qk.checklistTasks(scopeId ?? "", gateId ?? ""),
    queryFn: () => listScopeTasks(scopeId!, gateId!),
    enabled: Boolean(scopeId && gateId),
  }), NO_TASKS);
}

/** The ids of the given tasks that are locked by a non-notification (or blank-mode) approval. */
export function useBlockingApprovals(taskIds: readonly string[]): ScreenData<ReadonlySet<string>> {
  const q = useQuery({
    queryKey: qk.checklistTaskLocks(taskIds),
    queryFn: async (): Promise<ReadonlySet<string>> => blockingChecklistIds(
      await listTaskApprovals(taskIds), CHOICE_PROCESS.approvalMode.onlyNotifications,
    ),
    enabled: taskIds.length > 0,
  });
  return asScreenData<ReadonlySet<string>>(q, NO_IDS);
}

/** The highest order in the scope and gate, read at SAVE time (`nextOrderFromHighest`). */
export { highestTaskOrder };

/** Runs this screen's write plans and refreshes its tasks and locks. */
export function useChecklistWrites() {
  return usePlanWrite({
    invalidate: [qk.checklistTasksAll, qk.checklistTaskLocksAll],
    action: "change the default checklist",
    errorText: saveErrorText,
  });
}
