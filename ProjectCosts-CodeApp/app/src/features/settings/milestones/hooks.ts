/**
 * Milestones settings — TanStack Query wiring. Reads/writes live in
 * `@/data/settings/milestones.ts`; rules in `./rules.ts`.
 *
 * Keys come from `qk.settings.milestones` and the cross-screen refresh after a save from
 * `invalidateAfterMilestonesWrite` (shared M3 / M4). Countries are the ONE shared reference read
 * (`useActiveCountries`, M6); the screen maps and sorts them (`toMilestoneCountries`,
 * `sortCountries`).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/data/keys";
import { useActiveCountries } from "@/data/countries";
import { invalidateAfterMilestonesWrite } from "@/data/settings/invalidation";
import { NO_FOCUS_REFETCH } from "@/data/settings/queryPresets";
import { RecordGoneError } from "@/platform/errors";
import {
  listMilestoneAssumptions, saveMilestonePatches,
  type MilestonePatch,
} from "@/data/settings/milestones";

/** Active countries (`statecode eq 0`, D-DATA-5), from the shared countries cache. */
export function useMilestoneCountries() {
  return useActiveCountries();
}

/** ONE query for every country's rows; expanding sections never fetches (DR-2). */
export function useMilestoneAssumptions() {
  return useQuery({
    queryKey: qk.settings.milestones.assumptions,
    queryFn: listMilestoneAssumptions,
    staleTime: 5 * 60 * 1000,
    // An open draft is compared against these rows; do not swap them under the user on focus.
    ...NO_FOCUS_REFETCH,
  });
}

/**
 * The save. Resolves with the outcome (saved + failed rows) rather than rejecting, because a
 * partial save must still refresh the grid (DR-6: invalidate when at least one row was written).
 * The returned promise settles after the active queries have refetched, so the grid already
 * shows the new values when the caller reacts (AC-8c). The shared helper also refreshes the
 * project CAPEX cluster timeline (DR-6, D-STALE-1).
 */
export function useSaveMilestones() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patches: MilestonePatch[]) => saveMilestonePatches(patches),
    onSuccess: async (outcome) => {
      // V-1: a row deleted meanwhile (RecordGoneError, nothing sent) also refreshes the grid.
      const gone = outcome.failed.some((f) => f.error instanceof RecordGoneError);
      if (outcome.saved.length === 0 && !gone) return;
      await invalidateAfterMilestonesWrite(queryClient);
    },
  });
}
