/**
 * Main Project Overview — the query options the screen and the boot prefetch share.
 *
 * Moved out of `hooks.ts` unchanged (D119) so `app/bootPrefetch.ts` can start the
 * first page's reads from the URL, before the screen's chunk has loaded, under EXACTLY the keys the
 * screen reads. A prefetch whose key differs by anything lands where no observer looks and the
 * request is wasted, so the key and the function are defined once, here.
 *
 * No React in this file: it is imported by the entry bundle's prefetch step.
 */
import { queryOptions } from "@tanstack/react-query";
import {
  listCountries, loadProjectPage, loadProjectStateOrder,
} from "@/data/projects";
import { projectStateLookup } from "@/data/projectStateLookup";
import { EMPTY_APPLIED_CAPACITY, resolveAppliedCapacity, type ProjectFilter, type SortState } from "./rules";

/** How long a fetched page counts as fresh — for the page on screen AND the prefetched next one. */
export const PROJECT_PAGE_STALE_MS = 30 * 1000;

export interface ProjectPageArgs {
  /** The filter AS REQUESTED — i.e. with the debounced keyword, never the raw one. */
  filter: ProjectFilter;
  sort: SortState;
  page: number;
  scopeFilter?: string | undefined;
  locale?: string | undefined;
}

/**
 * The filter as the REQUEST carries it (PO-007): a capacity that is not a number is dropped, the same way the
 * screen resolves it on first load. The screen hands in a filter it has already resolved (which this leaves
 * as it is), the boot prefetch hands in the raw one from the address, so a malformed `?cap=` link prefetches
 * under the key the screen then reads.
 */
const requestedFilter = (args: ProjectPageArgs): ProjectFilter => ({
  ...args.filter,
  ...resolveAppliedCapacity(args.filter, EMPTY_APPLIED_CAPACITY, args.locale),
});

/**
 * The one definition of a project page's cache key.
 *
 * The query on screen and the next-page prefetch both build their key here. A prefetch whose
 * key differs by anything — the raw keyword instead of the debounced one, a `null` scope instead
 * of `""` — lands under a key no observer ever reads, and the request is wasted.
 */
export function projectPageKey(args: ProjectPageArgs) {
  return [
    "projectPage",
    requestedFilter(args), args.sort.col, args.sort.asc, args.page, args.scopeFilter ?? "",
  ] as const;
}

/** Key, query function and freshness together, so the prefetch cannot drift from the query. */
export function projectPageOptions(args: ProjectPageArgs) {
  return queryOptions({
    queryKey: projectPageKey(args),
    queryFn: () => loadProjectPage({
      filter: requestedFilter(args), sort: args.sort, page: args.page,
      scopeFilter: args.scopeFilter, locale: args.locale,
    }),
    staleTime: PROJECT_PAGE_STALE_MS,
  });
}

/** `cbx_..._Filter_Country.Items = Countries`. */
export const countriesQueryOptions = () => queryOptions({
  queryKey: ["countries"] as const,
  queryFn: listCountries,
  staleTime: 30 * 60 * 1000,
});

/** The Status filter's states: the one shared `Project States` cache entry (D159), read through `overviewStates` by the hook. */
export { projectStatesQueryOptions } from "@/data/projectStates";

/**
 * The selected project's cluster-state `Order`, for the Simulate gate. One definition for the hook
 * that reads it when a row is selected AND for the Simulate click, which awaits it through the query
 * cache (`ensureQueryData`) instead of reading a possibly stale render value.
 */
export const projectStateOrderOptions = (clusterStateId: string | null) => queryOptions({
  queryKey: ["projectStateOrder", clusterStateId ?? "none"] as const,
  // OPT-07d: the order comes from the shared `Project States` entry when it holds the state, else the single-row read.
  queryFn: ({ client }) => loadProjectStateOrder(clusterStateId, projectStateLookup(client)),
  staleTime: 30 * 60 * 1000,
});
