/**
 * Main Project Overview — data wiring.
 *
 * The criteria (filter, sort, page) live in the URL, not in React state. Three reasons, all
 * of which the canvas app's single `colFiltersOverview` row could not give it: a filtered list
 * survives a reload, it is shareable as a link, and the browser's back button undoes a filter
 * change. `parseCriteria` validates everything it reads, so a hand-edited link renders the
 * default list rather than reaching `$filter` unchecked.
 */
import { useCallback, useMemo } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import {
  listCountries, listCountryAreas, listProjectStates, loadProjectPage,
  loadProjectStateOrder, searchProjectManagers,
} from "@/data/projects";
import { useDebouncedValue } from "@/features/shared/useDebouncedValue";
import {
  applyFilterPatch, nextSortState, parseCriteria, serialiseCriteria,
  type Criteria, type ProjectFilter, type SortState,
} from "./rules";

/* ═════════════════════════════════════════════════════ criteria in the URL */

export interface CriteriaController {
  criteria: Criteria;
  setFilter: (patch: Partial<ProjectFilter>) => void;
  clearFilter: () => void;
  setSort: (clickedColumn: string) => void;
  setPage: (page: number) => void;
}

export function useCriteria(): CriteriaController {
  const navigate = useNavigate();
  const location = useLocation();

  const criteria = useMemo(
    () => parseCriteria(new URLSearchParams(location.search)),
    [location.search],
  );

  const write = useCallback(
    (next: Criteria) => {
      const search = serialiseCriteria(next).toString();
      navigate(
        { pathname: location.pathname, search: search ? `?${search}` : "" },
        // A filter change replaces rather than pushes: twenty keystrokes must not become
        // twenty back-button steps. Paging DOES push, so Back returns to the previous page.
        { replace: next.page === criteria.page },
      );
    },
    [navigate, location.pathname, criteria.page],
  );

  const setFilter = useCallback(
    (patch: Partial<ProjectFilter>) => {
      const filter = applyFilterPatch(criteria.filter, patch);
      if (filter === criteria.filter) return;
      // Any filter change resets to page 1 — page 4 of the old result set is meaningless.
      write({ ...criteria, filter, page: 1 });
    },
    [criteria, write],
  );

  const clearFilter = useCallback(
    () => write({ ...criteria, filter: parseCriteria(new URLSearchParams()).filter, page: 1 }),
    [criteria, write],
  );

  const setSort = useCallback(
    (clickedColumn: string) => {
      const sort: SortState = nextSortState(criteria.sort, clickedColumn);
      write({ ...criteria, sort, page: 1 });
    },
    [criteria, write],
  );

  const setPage = useCallback(
    (page: number) => write({ ...criteria, page: Math.max(1, Math.floor(page)) }),
    [criteria, write],
  );

  return { criteria, setFilter, clearFilter, setSort, setPage };
}

/* ═════════════════════════════════════════════════════════════ the queries */

export function useProjectPage(args: {
  criteria: Criteria;
  scopeFilter?: string | undefined;
  locale?: string;
}) {
  const { criteria, scopeFilter, locale } = args;
  // The keyword is the only field typed a character at a time.
  const keyword = useDebouncedValue(criteria.filter.keyword, 350);
  const filter = useMemo<ProjectFilter>(
    () => ({ ...criteria.filter, keyword }),
    [criteria.filter, keyword],
  );

  return useQuery({
    queryKey: [
      "projectPage",
      filter, criteria.sort.col, criteria.sort.asc, criteria.page, scopeFilter ?? "",
    ] as const,
    queryFn: () =>
      loadProjectPage({ filter, sort: criteria.sort, page: criteria.page, scopeFilter, locale }),
    // Keeps the previous page visible while the next one loads, so the grid does not blank
    // out and the pager does not jump.
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
}

export function useCountries() {
  return useQuery({
    queryKey: ["countries"] as const,
    queryFn: listCountries,
    staleTime: 30 * 60 * 1000,
  });
}

/** Area is dependent on Country — the canvas filtered `CountryAreas` by the chosen country. */
export function useCountryAreas(countryId: string | null) {
  return useQuery({
    queryKey: ["countryAreas", countryId ?? "none"] as const,
    queryFn: () => listCountryAreas(countryId),
    enabled: Boolean(countryId),
    staleTime: 30 * 60 * 1000,
  });
}

export function useProjectStates() {
  return useQuery({
    queryKey: ["projectStates"] as const,
    queryFn: listProjectStates,
    staleTime: 30 * 60 * 1000,
  });
}

/** The typeahead. Debounced, and silent below two characters. */
export function useProjectManagerSearch(term: string) {
  const debounced = useDebouncedValue(term, 300);
  return useQuery({
    queryKey: ["projectManagers", debounced] as const,
    queryFn: () => searchProjectManagers(debounced),
    enabled: debounced.trim().length >= 2,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * The selected project's cluster-state `Order`, which the Simulate gate needs and the grid
 * row does not carry.
 *
 * The canvas re-read the whole project inside every one of the ten `ItemEnabled` formulas.
 * Everything else those gates branch on is already on the row.
 */
export function useProjectStateOrder(clusterStateId: string | null) {
  return useQuery({
    queryKey: ["projectStateOrder", clusterStateId ?? "none"] as const,
    queryFn: () => loadProjectStateOrder(clusterStateId),
    enabled: Boolean(clusterStateId),
    staleTime: 30 * 60 * 1000,
  });
}
