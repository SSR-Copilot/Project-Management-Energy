/**
 * Project Main Screen — queries and mutations.
 *
 * This feature was the only one in the repo without a `hooks.ts`, and that is precisely why
 * its screen had grown a `projectRepo.list({ all: true })` plus a client-side `.filter()`:
 * with nowhere to put a query, the query went into the component. The canvas app never did
 * that — `colFilteredProjects` came from `Filter(Projects, And(...))`, evaluated by the
 * server — so this restores the original behaviour rather than inventing new.
 *
 * Four things live here:
 *
 *   `useProjectList`        one page of Projects, filtered / sorted / paged server-side
 *   `useRowPrivileges`      the selected row's own privileges, answered by the server
 *   `useProjectRefData`     the filter bar's four lookups, cached for the session
 *   `useDeleteProject`      the delete, with an optimistic row removal
 */
import { useMemo } from "react";
import {
  keepPreviousData, useMutation, useQuery, useQueryClient,
} from "@tanstack/react-query";
import { countryAreaRepo, countryRepo, entraIdRepo, projectRepo, projectStateRepo } from "@/data/repos";
import { queryProjects, type ProjectQueryPage } from "@/data/projectQueries";
import { qk } from "@/data/queryKeys";
import { f, asc } from "@/platform/odata";
import { readPrivileges, type ProjectPrivileges } from "@/features/shared/useProjectContext";
import { useDebouncedValue } from "@/features/shared/useDebouncedValue";
import { DEFAULT_PAGE_SIZE } from "@/domain/paging";
import type { Lang } from "@/domain/numeric";
import {
  applyOptimisticDelete, buildProjectFilter, resolveSortColumn, serverFilterFor,
  toProjectListRow, type PersonOption, type ProjectListCriteria, type ProjectListRow,
} from "./rules";
import type { CurrentUser } from "@/domain/session";

/** Reference data is stable for a working session. */
const REF_STALE = 30 * 60_000;

/* ═══════════════════════════════════════════════════════════════ the list ════ */

export interface ProjectListRequest extends ProjectListCriteria {
  pageSize?: number;
  /** Country scope, from the server-derived role/business-unit mapping. */
  user: CurrentUser | null;
  lang?: Lang;
}

export interface ProjectListResult {
  rows: ProjectListRow[];
  totalRows: number;
  isLoading: boolean;
  /** True while a *different* page or filter is in flight but stale rows are still shown. */
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
  /** The composed `$filter`, exposed so the screen can pass it to an invalidation. */
  odataFilter: string | undefined;
  /** This page's cache key, so the delete can patch exactly the page on screen. */
  pageKey: readonly unknown[];
}

/**
 * One page of Projects.
 *
 * The keyword is debounced but nothing else is: picking a country is a deliberate act and
 * should feel immediate, whereas typing "Ita" would otherwise be three requests. Note the
 * debounce is applied to the keyword *before* the filter string is built, so the query key
 * cannot change faster than the request it stands for.
 */
export function useProjectList(request: ProjectListRequest): ProjectListResult {
  const { filter, sort, page, pageSize = DEFAULT_PAGE_SIZE, user, lang = "en-US" } = request;
  const debouncedKeyword = useDebouncedValue(filter.keyword, 300);

  const odataFilter = useMemo(() => {
    // The country scope is the only thing between a country-scoped user and the whole table,
    // so it is AND-ed with the user's own filter rather than folded into it.
    const own = buildProjectFilter({ ...filter, keyword: debouncedKeyword }, lang);
    return f.and(serverFilterFor(user), own);
  }, [filter, debouncedKeyword, lang, user]);

  const sortCol = resolveSortColumn(sort.col);
  const pageKey = qk.projects.page(odataFilter, sortCol, sort.asc, page, pageSize);

  const q = useQuery({
    queryKey: pageKey,
    queryFn: () => queryProjects(odataFilter, { page, pageSize }, { col: sortCol, asc: sort.asc }),
    // Without this the grid blanks to a spinner on every page step and every keystroke past
    // the third, which reads as a much slower screen than it is.
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });

  const rows = useMemo(
    () => (q.data?.rows ?? []).map((r) => toProjectListRow(r as Record<string, unknown>)),
    [q.data],
  );

  return {
    rows,
    totalRows: q.data?.totalCount ?? 0,
    isLoading: q.isLoading,
    isFetching: q.isFetching,
    isError: q.isError,
    error: q.error,
    refetch: () => void q.refetch(),
    odataFilter,
    pageKey,
  };
}

/* ═════════════════════════════════════════════════════════════ privileges ════ */

const NO_PRIVILEGES: ProjectPrivileges = { create: false, edit: false };

/**
 * The selected row's privileges, from the server.
 *
 * This replaces a real defect. The screen used to compute its edit gate from the user's
 * *role names* — something like `isProjectDataAllCountries || isProjectManagerOwnProjects` —
 * which CLAUDE.md rule 5 forbids outright, and for a good reason: Dataverse row-level sharing
 * means a role name and an actual privilege genuinely disagree. Reusing `readPrivileges`
 * makes this screen answer the question the same way the other 22 do.
 *
 * A failed probe reads as "no rights", never as "allowed" — see `readPrivileges`.
 */
export function useRowPrivileges(projectId: string | null): {
  privileges: ProjectPrivileges;
  isLoading: boolean;
} {
  const q = useQuery({
    queryKey: qk.projects.privileges(projectId ?? "none"),
    enabled: Boolean(projectId),
    queryFn: () => readPrivileges(projectId!),
    staleTime: 60_000,
  });
  return {
    privileges: projectId ? q.data ?? NO_PRIVILEGES : NO_PRIVILEGES,
    isLoading: q.isLoading,
  };
}

/* ═════════════════════════════════════════════════════════ reference data ════ */

export interface RefOption {
  id: string;
  label: string;
}

const byLabel = (a: RefOption, b: RefOption) => a.label.localeCompare(b.label);

export function useCountryOptions() {
  return useQuery({
    queryKey: qk.ref.countries,
    staleTime: REF_STALE,
    queryFn: async (): Promise<RefOption[]> => {
      const rows = await countryRepo.listAll({ orderBy: [asc("vsb_name")] });
      return rows.map((r) => ({ id: r.vsb_countryid, label: r.vsb_name })).sort(byLabel);
    },
  });
}

/**
 * Areas for one country.
 *
 * Scoped on the server, and `enabled` only once a country is chosen — the canvas repopulated
 * `colAreas` from the country and left the Area box empty until then. Loading all ~24 areas
 * and filtering in the component would work today and stop working the moment a country with
 * many subdivisions is added.
 */
export function useAreaOptions(countryId: string | null) {
  return useQuery({
    queryKey: qk.ref.countryAreas(countryId ?? undefined),
    enabled: Boolean(countryId),
    staleTime: REF_STALE,
    queryFn: async (): Promise<RefOption[]> => {
      const rows = await countryAreaRepo.listAll({
        filter: f.guid("_vsb_country_value", countryId!),
        orderBy: [asc("vsb_name")],
      });
      return rows.map((r) => ({ id: r.vsb_countryareaid, label: r.vsb_name })).sort(byLabel);
    },
  });
}

/** `Project States` — the Status filter. Ordered by `vsb_order`, so Draft leads. */
export function useProjectStateOptions() {
  return useQuery({
    queryKey: qk.ref.projectStates,
    staleTime: REF_STALE,
    queryFn: async (): Promise<RefOption[]> => {
      const rows = await projectStateRepo.listAll({ orderBy: [asc("vsb_order")] });
      return rows.map((r) => ({
        id: String(r.vsb_projectstateid ?? ""),
        label: String(r.vsb_name ?? ""),
      }));
    },
  });
}

/**
 * The Project Manager picker.
 *
 * Filtered to enabled accounts on the server, as the Team screen's rule 12 does. The id is
 * the `vsb_microsoftentraids` ROW id, not the AAD object id — the project's lookup points at
 * the row, and confusing the two yields a filter that matches nothing.
 *
 * GUIDE p07: the filter renders this as a typeahead whose "Suggested People" panel shows each
 * person's email on a second line, so `mail` is carried alongside `label` — the other filters'
 * `RefOption` has no such field, and none of them need one.
 */
export function usePeopleOptions() {
  return useQuery({
    queryKey: qk.ref.people,
    staleTime: REF_STALE,
    queryFn: async (): Promise<PersonOption[]> => {
      const rows = await entraIdRepo.listAll({
        filter: f.eq("vsb_accountenabled", true),
        orderBy: [asc("vsb_displayname")],
      });
      return rows
        .map((r) => ({
          id: String(r.vsb_microsoftentraidid ?? ""),
          label: String(r.vsb_displayname ?? r.vsb_mail ?? ""),
          mail: r.vsb_mail ? String(r.vsb_mail) : null,
        }))
        .filter((o) => o.id && o.label)
        .sort(byLabel);
    },
  });
}

/* ═════════════════════════════════════════════════════════════════ delete ════ */

export interface DeleteProjectVars {
  id: string;
  name: string;
}

/**
 * Delete one project.
 *
 * The optimistic update touches only the page currently on screen, and decrements its
 * `totalCount` — without that the footer keeps reading the pre-delete "Total Rows" for as
 * long as the refetch takes, which looks like the delete failed.
 */
export function useDeleteProject(pageKey: readonly unknown[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: DeleteProjectVars) => projectRepo.remove(vars.id),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: pageKey });
      const previous = qc.getQueryData<ProjectQueryPage>(pageKey);
      if (previous) {
        qc.setQueryData<ProjectQueryPage>(
          pageKey,
          applyOptimisticDelete(previous, vars.id, (r) =>
            String((r as Record<string, unknown>).vsb_projectid ?? "")),
        );
      }
      return { previous };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(pageKey, ctx.previous);
    },
    onSettled: () => {
      // The whole subtree: the row count changed, so every cached page is now off by one.
      void qc.invalidateQueries({ queryKey: qk.projects.all });
    },
  });
}
