/**
 * Project General Data — the query options the screen and the boot prefetch share.
 *
 * Moved out of `hooks.ts` unchanged (D119). Everything here depends on the project id
 * (or on nothing) and so can start from the URL, before the screen's chunk has loaded and before the
 * session's own project read has finished (`app/bootPrefetch.ts`). Key and function are defined once,
 * so a prefetch lands under exactly the key `hooks.ts` reads. No React in this file.
 */
import { queryOptions } from "@tanstack/react-query";
import { qk } from "@/data/keys";
import {
  listCountryAreas, listGeneralDataCountries, listProjectStates, listShareholders,
  listStateTrackings, listTerrainUtilizations, loadGeneralDataProject,
} from "@/data/generalData";

/** How long a reference list counts as fresh. */
export const REFERENCE_STALE = 30 * 60 * 1000;

/** The project row (`gblRecordSelectedProject`). */
export const generalDataProjectQueryOptions = (projectId: string) => queryOptions({
  queryKey: qk.generalDataProject(projectId),
  queryFn: () => loadGeneralDataProject(projectId),
});

export const generalDataCountriesQueryOptions = () => queryOptions({
  queryKey: qk.generalDataCountries,
  queryFn: listGeneralDataCountries,
  staleTime: REFERENCE_STALE,
});

export const generalDataProjectStatesQueryOptions = () => queryOptions({
  queryKey: qk.generalDataProjectStates,
  queryFn: listProjectStates,
  staleTime: REFERENCE_STALE,
});

/** One country's areas — the Area dropdown and the "has areas" half of the Area rule. */
export const generalDataAreasQueryOptions = (countryId: string) => queryOptions({
  queryKey: qk.generalDataAreas(countryId),
  queryFn: () => listCountryAreas(countryId),
  staleTime: REFERENCE_STALE,
});

export const generalDataUtilizationsQueryOptions = (countryId: string) => queryOptions({
  queryKey: qk.generalDataUtilizations(countryId),
  queryFn: () => listTerrainUtilizations(countryId || null),
  staleTime: REFERENCE_STALE,
});

export const shareholdersQueryOptions = (projectId: string) => queryOptions({
  queryKey: qk.shareholders(projectId),
  queryFn: () => listShareholders(projectId),
});

export const stateTrackingsQueryOptions = (projectId: string) => queryOptions({
  queryKey: qk.stateTrackings(projectId),
  queryFn: () => listStateTrackings(projectId),
});
