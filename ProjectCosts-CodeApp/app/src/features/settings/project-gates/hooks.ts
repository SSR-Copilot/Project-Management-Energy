/**
 * Project Gates — TanStack Query wiring over `projectGatesRepository`.
 *
 * Keys are the shared `qk.settings.gates` (values unchanged). After any write the shared
 * `invalidateAfterGatesWrite` refreshes this (country, technology) dataset (DR-9) and Check List
 * Settings' locks query (B3); states and countries stay cached. Countries come from the shared
 * `useCountries({ includeInactive: true })` (`@/data/countries`), called by the screen.
 *
 * Technologies are the `vsb_technology` choice CODE everywhere (DR-3).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/data/keys";
import { invalidateAfterGatesWrite } from "@/data/settings/invalidation";
import { projectGatesRepository as repo, type GatesDataset, type Payload } from "@/data/settings/project-gates";
import { useDebouncedValue } from "@/features/shared/useDebouncedValue";
import { RecordGoneError } from "@/platform/errors";

const gateKeys = qk.settings.gates;

export function useProjectStates() {
  return useQuery({ queryKey: gateKeys.states(), queryFn: () => repo.listProjectStates(), staleTime: Infinity });
}

export function useGatesDataset(countryId: string | undefined, technology: number | undefined) {
  return useQuery({
    queryKey: countryId && technology !== undefined ? gateKeys.dataset(countryId, technology) : gateKeys.datasetNone(),
    queryFn: () => repo.loadDataset(countryId as string, technology as number),
    enabled: Boolean(countryId && technology !== undefined),
  });
}

/** DR-10: ≥ 2 characters, debounced. */
export function usePeopleSearch(term: string) {
  const debounced = useDebouncedValue(term.trim(), 300);
  return useQuery({
    queryKey: gateKeys.people(debounced),
    queryFn: () => repo.searchPeople(debounced),
    enabled: debounced.length >= 2,
    staleTime: 60_000,
  });
}

/**
 * Inline Active toggles (FR-5, FR-8): optimistic flip, revert on failure (D-09), refetch after.
 */
export function useToggleActive(countryId: string, technology: number) {
  const qc = useQueryClient();
  const key = gateKeys.dataset(countryId, technology);
  return useMutation({
    mutationFn: (v: { kind: "gate" | "task"; id: string; active: boolean }) =>
      v.kind === "gate" ? repo.setGateActive(v.id, v.active) : repo.setTaskActive(v.id, v.active),
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

/** FR-17 / FR-18: one POST or PATCH. */
export function useSaveTemplate(countryId: string, technology: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (r: SaveRequest) => (r.kind === "gate" ? repo.saveGate(r.id, r.payload) : repo.saveTask(r.id, r.payload)),
    onSuccess: () => invalidateAfterGatesWrite(qc, { countryId, technology }),
    // V-1: the row was deleted meanwhile (nothing written) — refresh so the grid drops it.
    onError: (error) => { if (error instanceof RecordGoneError) void invalidateAfterGatesWrite(qc, { countryId, technology }); },
  });
}

/** FR-19: one PATCH. */
export function useResetGate(countryId: string, technology: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.resetGate(id),
    onSuccess: () => invalidateAfterGatesWrite(qc, { countryId, technology }),
    onError: (error) => { if (error instanceof RecordGoneError) void invalidateAfterGatesWrite(qc, { countryId, technology }); }, // V-1
  });
}

/** FR-10: one DELETE; the grid refetches whatever the outcome. */
export function useDeleteTask(countryId: string, technology: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteTask(id),
    onSettled: () => invalidateAfterGatesWrite(qc, { countryId, technology }),
  });
}
