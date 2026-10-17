/**
 * Project General Data's data wiring: one query for everything the screen reads, a project
 * manager/deputy typeahead query, and the save mutation. See `./rules.ts` for the business
 * logic this screen applies to what these hooks return, and `@/data/generalData.ts` for the
 * Dataverse reads/writes themselves.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/data/keys";
import {
  loadGeneralData, loadTerrainUtilizationChoices, saveGeneralData,
  type SaveGeneralDataArgs,
} from "@/data/generalData";
import { listCountryAreas, searchProjectManagers } from "@/data/projects";
import { currentUserQueryOptions } from "@/app/useCurrentUser";
import { serverEnforcedProvider } from "@/platform/privileges";
import { isRecordGone } from "@/features/shared/recordGone";

const SHAREHOLDER_ENTITIES_TABLE = "vsb_shareholderentitiies";

/** Everything the screen needs to render, in one request. */
export function useGeneralData(projectId: string | undefined) {
  return useQuery({
    queryKey: qk.generalData(projectId),
    queryFn: () => loadGeneralData(projectId),
  });
}

/** Areas/states/provinces for a given country — re-queried whenever Country changes. */
export function useCountryAreas(countryId: string | null) {
  return useQuery({
    queryKey: qk.countryAreas(countryId ?? undefined),
    queryFn: () => listCountryAreas(countryId),
    enabled: Boolean(countryId),
  });
}

/** Project Manager / Deputy Project Manager typeahead, shared by both picker fields. */
export function useProjectManagerSearch(term: string) {
  return useQuery({
    queryKey: qk.projectManagerSearch(term),
    queryFn: () => searchProjectManagers(term),
    enabled: term.trim().length > 0,
    staleTime: 60 * 1000,
  });
}

/** Optimistic, server-enforced write permission for the Shareholding Entities table. */
export function useShareholderPrivileges() {
  return serverEnforcedProvider.forTable(SHAREHOLDER_ENTITIES_TABLE);
}

/**
 * Terrain Utilization choice values scoped to the project's country — re-queried whenever
 * the country changes. Canvas formula: PGDS:3888–3910.
 */
export function useTerrainUtilizationChoices(countryId: string | null) {
  return useQuery({
    queryKey: qk.terrainUtilizationChoices(countryId),
    queryFn: () => loadTerrainUtilizationChoices(countryId),
  });
}

/**
 * The signed-in user's editable countries and all-countries flag — used to scope the
 * Country dropdown to the countries the user is authorised to edit.
 *
 * The shared `currentUserQueryOptions` (`app/useCurrentUser.ts`), so this is the same cache entry
 * as the header's and the settings gate's: the first component to mount wins and the result is
 * shared.
 */
export function useCurrentUser(entraObjectId: string | undefined) {
  return useQuery(currentUserQueryOptions(entraObjectId));
}

export function useSaveGeneralData(projectId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: SaveGeneralDataArgs) => saveGeneralData(args),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: qk.generalData(projectId) });
      await queryClient.invalidateQueries({ queryKey: qk.generalData(result.projectId) });
    },
    // V-1: the project was deleted by someone else (`RecordGoneError`) — drop the stale copy.
    onError: (error) => {
      if (isRecordGone(error)) void queryClient.invalidateQueries({ queryKey: qk.generalData(projectId) });
    },
  });
}
