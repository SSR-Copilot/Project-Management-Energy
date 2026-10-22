/**
 * Project Gates — TanStack Query wiring over `projectGatesRepository`.
 *
 * Reads go through `projectGatesRepository`; every write is a one-write `WritePlan` from `./rules`
 * run by `@/data/runPlan` (only the `mutationFn` is a plan: the optimistic flip, the invalidation and
 * the `RecordGoneError` handling below are unchanged, and `runPlan` rethrows the failed write's
 * own error so those `instanceof` checks and `userErrorText` still see it). `canEdit` is
 * `useAdminAccess()`, passed by the screen; a plan built without it refuses.
 *
 * Keys are the shared `qk.adminGate*`. After any write the shared
 * `invalidateAfterGatesWrite` refreshes this (country, technology) dataset and Check List
 * Settings' locks query; states and countries stay cached. Countries come from the shared
 * `useCountries({ includeInactive: true })` (`@/data/countries`), called by the screen.
 *
 * Technologies are the `vsb_technology` choice CODE everywhere.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/data/keys";
import { invalidateAfterGatesWrite } from "@/data/adminInvalidation";
import { projectGatesRepository as repo, type GatesDataset, type Payload } from "@/data/adminGatesApprovals";
import { CreatedIdMissingError } from "@/data/executePlan";
import { runPlan } from "@/data/runPlan";
import { useDebouncedValue } from "@/features/shared/useDebouncedValue";
import { RecordGoneError } from "@/platform/errors";
import {
  planDeleteTaskApproval, planResetGate, planSaveGate, planSaveTaskApproval, planSetGateActive,
  planSetTaskApprovalActive,
} from "./rules";

export function useProjectStates() {
  return useQuery({ queryKey: qk.adminGateStates, queryFn: () => repo.listProjectStates(), staleTime: Infinity });
}

export function useGatesDataset(countryId: string | undefined, technology: number | undefined) {
  return useQuery({
    queryKey: countryId && technology !== undefined ? qk.adminGateDataset(countryId, technology) : qk.adminGateDatasetNone,
    queryFn: () => repo.loadDataset(countryId as string, technology as number),
    enabled: Boolean(countryId && technology !== undefined),
  });
}

/** At least 2 characters, debounced. */
export function usePeopleSearch(term: string) {
  const debounced = useDebouncedValue(term.trim(), 300);
  return useQuery({
    queryKey: qk.adminGatePeople(debounced),
    queryFn: () => repo.searchPeople(debounced),
    enabled: debounced.length >= 2,
    staleTime: 60_000,
  });
}

/**
 * Inline Active toggles: optimistic flip, revert on failure, refetch after.
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
    onSettled: () => invalidateAfterGatesWrite(qc, { countryId, technology }),
  });
}

export type SaveRequest =
  | { kind: "gate"; id: string | undefined; payload: Payload }
  | { kind: "task"; id: string | undefined; payload: Payload };

/** One POST or PATCH. */
export function useSaveTemplate(countryId: string, technology: number, canEdit: boolean) {
  const qc = useQueryClient();
  return useMutation({
    /** Resolves to the saved row's id ("" when a create answered without one, as it always has). */
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

/** One PATCH. */
export function useResetGate(countryId: string, technology: number, canEdit: boolean) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { await runPlan(planResetGate(id, { canEdit }), "reset the gate"); },
    onSuccess: () => invalidateAfterGatesWrite(qc, { countryId, technology }),
    onError: (error) => { if (error instanceof RecordGoneError) void invalidateAfterGatesWrite(qc, { countryId, technology }); }, // the row was deleted meanwhile
  });
}

/** One DELETE; the grid refetches whatever the outcome. */
export function useDeleteTask(countryId: string, technology: number, canEdit: boolean) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { await runPlan(planDeleteTaskApproval(id, { canEdit }), "delete the check list approval"); },
    onSettled: () => invalidateAfterGatesWrite(qc, { countryId, technology }),
  });
}
