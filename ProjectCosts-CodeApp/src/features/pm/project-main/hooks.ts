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
import {
  keepPreviousData, useMutation, useQuery, useQueryClient,
} from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import {
  deleteProject, listCountries, listCountryAreas, listProjectStates, loadProjectPage,
  loadProjectStateOrder, searchProjectManagers, type ProjectPage,
} from "@/data/projects";
import { trace } from "@/platform/telemetry";
import { useDebouncedValue } from "@/features/shared/useDebouncedValue";
import {
  applyFilterPatch, applyOptimisticDelete, nextSortState, parseCriteria, serialiseCriteria,
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

export interface ProjectPageQuery {
  data: ProjectPage | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  /**
   * This page's cache key, so the delete can patch exactly the page on screen.
   *
   * It has to come from here rather than be rebuilt at the call site: the key carries the
   * DEBOUNCED keyword, and a second `useDebouncedValue` in the component would run its own
   * timer and drift out of step with the request the key stands for.
   */
  pageKey: readonly unknown[];
}

export function useProjectPage(args: {
  criteria: Criteria;
  scopeFilter?: string | undefined;
  locale?: string;
}): ProjectPageQuery {
  const { criteria, scopeFilter, locale } = args;
  // The keyword is the only field typed a character at a time.
  const keyword = useDebouncedValue(criteria.filter.keyword, 350);
  const filter = useMemo<ProjectFilter>(
    () => ({ ...criteria.filter, keyword }),
    [criteria.filter, keyword],
  );

  const pageKey = useMemo(
    () => [
      "projectPage",
      filter, criteria.sort.col, criteria.sort.asc, criteria.page, scopeFilter ?? "",
    ] as const,
    [filter, criteria.sort.col, criteria.sort.asc, criteria.page, scopeFilter],
  );

  const query = useQuery({
    queryKey: pageKey,
    queryFn: () =>
      loadProjectPage({ filter, sort: criteria.sort, page: criteria.page, scopeFilter, locale }),
    // Keeps the previous page visible while the next one loads, so the grid does not blank
    // out and the pager does not jump.
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    pageKey,
  };
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

/* ═══════════════════════════════════════════════════════════════ the delete */

export interface DeleteProjectVars {
  id: string;
  /** Carried only so the caller can name the project in the result message. */
  name: string;
}

/**
 * Delete one project.
 *
 * The canvas `OnConfirm` is `IfError(Remove(...); Notify(success), Notify(error))` followed by
 * `Refresh(Projects)` and `Select(but_..._Filter_Apply)` — a full re-query triggered by
 * invoking another control's handler. Here the page on screen is patched optimistically and
 * the `projectPage` subtree invalidated behind it, so the grid and the footer agree
 * immediately and the authoritative list arrives a round trip later.
 *
 * On failure the previous page is put back. That matters more than the message: an optimistic
 * delete that is not rolled back leaves the row missing from a list the server still has it
 * in, and the next filter change makes it reappear with no explanation.
 */
export function useDeleteProject(pageKey: readonly unknown[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: DeleteProjectVars) => deleteProject(vars.id),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: pageKey });
      const previous = qc.getQueryData<ProjectPage>(pageKey);
      if (previous) {
        qc.setQueryData<ProjectPage>(pageKey, applyOptimisticDelete(previous, vars.id));
      }
      return { previous };
    },
    onError: (error, vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(pageKey, ctx.previous);
      // The canvas put FirstError.Source / .Message / .Details.HttpResponse into the message
      // the user reads. It belongs here instead.
      trace("error", "delete project failed", { projectId: vars.id, error });
    },
    onSettled: () => {
      // The row count changed, so every cached page is now off by one — not just this one.
      void qc.invalidateQueries({ queryKey: ["projectPage"] });
    },
  });
}
