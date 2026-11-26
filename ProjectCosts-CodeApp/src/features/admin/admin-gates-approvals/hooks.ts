/**
 * Project Gates — TanStack Query wiring over `projectGatesRepository`.
 *
 * Reads go through `projectGatesRepository`; every write is a one-write `WritePlan` from `./rules`
 * run by `@/data/runPlan`. Only the `mutationFn` runs the plan; the optimistic flip, the
 * invalidation and the `RecordGoneError` handling stay in the hooks below, and `runPlan` rethrows
 * the failed write's own error so those `instanceof` checks and `userErrorText` still see it.
 * `canEdit` is `useAdminAccess()`, passed by the screen; a plan built without it refuses.
 *
 * Keys are the shared `qk.adminGate*`. After any write the shared
 * `invalidateAfterGatesWrite` refreshes this (country, technology) dataset and Check List
 * Settings' locks query; states and countries stay cached. Countries come from the shared
 * `useCountries({ includeInactive: true })` (`@/data/countries`), called by the screen.
 *
 * Technologies are the `vsb_technology` choice CODE everywhere.
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { qk } from "@/data/keys";
import { adminStates, projectStatesQueryOptions } from "@/data/projectStates";
import { invalidateAfterGatesWrite } from "@/data/adminInvalidation";
import { ADMIN_OPT } from "@/data/adminFlags";
import { projectGatesRepository as repo, type GatesDataset, type Payload } from "@/data/adminGatesApprovals";
import { CreatedIdMissingError } from "@/data/executePlan";
import { runPlan } from "@/data/runPlan";
import { useDebouncedValue } from "@/features/shared/useDebouncedValue";
import { RecordGoneError } from "@/platform/errors";
import {
  planDeleteTaskApproval, planResetGate, planSaveGate, planSaveTaskApproval, planSetGateActive,
  planSetTaskApprovalActive,
} from "./rules";

/** D159: the one shared `Project States` cache entry, viewed as every state with its raw `Order` and business unit. */
export function useProjectStates() {
  return useQuery({ ...projectStatesQueryOptions(), select: adminStates });
}

/**
 * OPT-17(c) DIVERGENCE (freshness, reversible with `GATES_REUSE_PEOPLE` in `data/adminGatesApprovals.ts`): a reload (after a toggle,
 * a save, a reset, a delete, a focus refetch) hands the previous dataset's `people` to the loader, which then asks the directory
 * only for Portfolio Managers it has not resolved yet. A display name changed in Entra stays until the cache entry is dropped.
 */
export function useGatesDataset(countryId: string | undefined, technology: number | undefined) {
  const qc = useQueryClient();
  const key = countryId && technology !== undefined ? qk.adminGateDataset(countryId, technology) : qk.adminGateDatasetNone;
  return useQuery({
    queryKey: key,
    queryFn: () => repo.loadDataset(countryId as string, technology as number, qc.getQueryData<GatesDataset>(key)?.people),
    enabled: Boolean(countryId && technology !== undefined),
  });
}

/**
 * The pickers' `OnSearch`: `Search(Filter('Microsoft Entra IDs', 'Microsoft Entra ID Account
 * Enabled' = …Yes), Trim(Self.SearchText), 'Display Name', 'Given Name', Surname, Mail)`.
 * DIVERGENCE: at least 2 characters and debounced 300 ms; the canvas searches on every non-blank
 * trimmed text (`IsBlankOrError(Trim(Self.SearchText))`) (doc 09 §2).
 */
export function usePeopleSearch(term: string) {
  const debounced = useDebouncedValue(term.trim(), 300);
  return useQuery({
    queryKey: qk.adminGatePeople(debounced),
    queryFn: () => repo.searchPeople(debounced),
    enabled: debounced.length >= 2,
    staleTime: 60_000,
  });
}

/** Active-pill toggles in flight per dataset (a settling toggle must know whether it is the last one; TanStack still counts it as pending inside `onSettled`). */
const togglesInFlight = new Map<string, number>();
const bumpToggles = (id: string, by: 1 | -1): number => {
  const next = Math.max(0, (togglesInFlight.get(id) ?? 0) + by);
  if (next === 0) togglesInFlight.delete(id);
  else togglesInFlight.set(id, next);
  return next;
};

/** Per dataset key: the slices a settled toggle asked to reload, and the reload loop that is running, if any. */
const sliceReloads = new Map<string, { kinds: Set<"gate" | "task">; running: Promise<void> | null }>();

/**
 * AD-06 (`ADMIN_GATES_NARROW_RELOAD`): after an Active-pill write, reload only the slice that changed (templates for a gate toggle,
 * approvals for a task toggle), reusing the cached header, tasks and the other half. Overlapping clicks do not stack reloads:
 *  - while another toggle is still in flight, a settling one only records its slice; the LAST one to settle reloads, so N quick clicks
 *    give one reload;
 *  - a reload already running is awaited, not started again; slices recorded meanwhile are reloaded once it finishes.
 * Anything unexpected (no cached dataset, a failed read) falls back to the full invalidation of before.
 */
export function reloadGatesSlice(
  qc: QueryClient, countryId: string, technology: number, kind: "gate" | "task", otherTogglesPending: boolean,
): Promise<void> {
  const key = qk.adminGateDataset(countryId, technology);
  const id = JSON.stringify(key);
  const state = sliceReloads.get(id) ?? { kinds: new Set<"gate" | "task">(), running: null };
  sliceReloads.set(id, state);
  state.kinds.add(kind);
  if (state.running) return state.running;
  if (otherTogglesPending) return Promise.resolve();
  const full = () => invalidateAfterGatesWrite(qc, { countryId, technology });
  state.running = (async () => {
    try {
      // The settings screens' locks are keyed apart from the dataset and are only marked stale (no read while the screen is unmounted).
      void qc.invalidateQueries({ queryKey: qk.adminChecklistLocks });
      while (state.kinds.size > 0) {
        const kinds = [...state.kinds];
        state.kinds.clear();
        const current = qc.getQueryData<GatesDataset>(key);
        if (!current) { await full(); continue; }
        try {
          const next = await Promise.all(kinds.map((k) => repo.reloadSlice(k, countryId, technology, current)));
          qc.setQueryData<GatesDataset>(key, (latest) => {
            if (!latest) return latest;
            let merged = latest;
            kinds.forEach((k, i) => {
              const fresh = next[i] as GatesDataset;
              merged = k === "gate"
                ? { ...merged, templates: fresh.templates, people: { ...merged.people, ...fresh.people } }
                : { ...merged, approvals: fresh.approvals, people: { ...merged.people, ...fresh.people } };
            });
            return merged;
          });
        } catch {
          await full();
        }
      }
    } finally {
      state.running = null;
      if (state.kinds.size === 0) sliceReloads.delete(id);
    }
  })();
  return state.running;
}

/**
 * Inline Active toggles (the grid's status pills): optimistic flip, revert on failure, refetch after.
 * DIVERGENCE: optimistic; the canvas `Patch` updates the pill only after the server answers (doc 09 §2).
 */
export function useToggleActive(countryId: string, technology: number, canEdit: boolean) {
  const qc = useQueryClient();
  const key = qk.adminGateDataset(countryId, technology);
  return useMutation({
    mutationFn: async (v: { kind: "gate" | "task"; id: string; active: boolean }) => {
      await runPlan(
        v.kind === "gate"
          ? planSetGateActive(v.id, v.active, { canEdit })
          : planSetTaskApprovalActive(v.id, v.active, { canEdit }),
        "change the Active status",
      );
    },
    onMutate: async (v) => {
      bumpToggles(JSON.stringify(key), 1);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<GatesDataset>(key);
      if (previous) {
        qc.setQueryData<GatesDataset>(key, {
          ...previous,
          templates: v.kind === "gate"
            ? previous.templates.map((t) => (t.id === v.id ? { ...t, gateActive: v.active } : t))
            : previous.templates,
          approvals: v.kind === "task"
            ? previous.approvals.map((a) => (a.id === v.id ? { ...a, gateActive: v.active } : a))
            : previous.approvals,
        });
      }
      return { previous };
    },
    onError: (_error, _v, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous);
    },
    onSettled: (_data, _error, v) => {
      const othersPending = bumpToggles(JSON.stringify(key), -1) > 0;
      return ADMIN_OPT.ADMIN_GATES_NARROW_RELOAD
        ? reloadGatesSlice(qc, countryId, technology, v.kind, othersPending)
        : invalidateAfterGatesWrite(qc, { countryId, technology });
    },
  });
}

export type SaveRequest =
  | { kind: "gate"; id: string | undefined; payload: Payload }
  | { kind: "task"; id: string | undefined; payload: Payload };

/** Save (`pcf_but_…_Save.OnChange`): one POST or PATCH. */
export function useSaveTemplate(countryId: string, technology: number, canEdit: boolean) {
  const qc = useQueryClient();
  return useMutation({
    /** Resolves to the saved row's id ("" when a create answered without one). */
    mutationFn: async (r: SaveRequest): Promise<string> => {
      const plan = r.kind === "gate"
        ? planSaveGate(r.id, r.payload, { canEdit })
        : planSaveTaskApproval(r.id, r.payload, { canEdit });
      try {
        const { createdIds } = await runPlan(plan, "save the approvals");
        return r.id ?? createdIds[0] ?? "";
      } catch (error) {
        if (error instanceof CreatedIdMissingError) return r.id ?? "";
        throw error;
      }
    },
    onSuccess: () => invalidateAfterGatesWrite(qc, { countryId, technology }),
    // The row was deleted meanwhile (nothing written) — refresh so the grid drops it.
    onError: (error) => { if (error instanceof RecordGoneError) void invalidateAfterGatesWrite(qc, { countryId, technology }); },
  });
}

/** Reset Gate (`btn_…_ResetGateApproval.OnSelect`): one PATCH. */
export function useResetGate(countryId: string, technology: number, canEdit: boolean) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { await runPlan(planResetGate(id, { canEdit }), "reset the gate"); },
    onSuccess: () => invalidateAfterGatesWrite(qc, { countryId, technology }),
    onError: (error) => { if (error instanceof RecordGoneError) void invalidateAfterGatesWrite(qc, { countryId, technology }); }, // the row was deleted meanwhile
  });
}

/** Delete a task approval (`cmp_DeleteChecklistApprovalItem_AdminScreen.OnConfirm`): one DELETE; the grid refetches whatever the outcome. */
export function useDeleteTask(countryId: string, technology: number, canEdit: boolean) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { await runPlan(planDeleteTaskApproval(id, { canEdit }), "delete the check list approval"); },
    onSettled: () => invalidateAfterGatesWrite(qc, { countryId, technology }),
  });
}
