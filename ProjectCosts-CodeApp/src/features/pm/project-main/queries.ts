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
import { listCountries, listProjectStates, loadProjectPage } from "@/data/projects";
import type { ProjectFilter, SortState } from "./rules";

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
 * The one definition of a project page's cache key.
 *
 * The query on screen and the next-page prefetch both build their key here. A prefetch whose
 * key differs by anything — the raw keyword instead of the debounced one, a `null` scope instead
 * of `""` — lands under a key no observer ever reads, and the request is wasted.
 */
export function projectPageKey(args: ProjectPageArgs) {
  return [
    "projectPage",
    args.filter, args.sort.col, args.sort.asc, args.page, args.scopeFilter ?? "",
  ] as const;
}

/** Key, query function and freshness together, so the prefetch cannot drift from the query. */
export function projectPageOptions(args: ProjectPageArgs) {
  return queryOptions({
    queryKey: projectPageKey(args),
    queryFn: () => loadProjectPage({
      filter: args.filter, sort: args.sort, page: args.page,
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

export const projectStatesQueryOptions = () => queryOptions({
  queryKey: ["projectStates"] as const,
  queryFn: listProjectStates,
  staleTime: 30 * 60 * 1000,
});
