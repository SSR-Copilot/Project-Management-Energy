/**
 * H1 — one health summary for the queries a settings page waits on.
 *
 * TanStack Query v5 semantics, as Milestones (`Screen.tsx:161-174`) and CAPEX Accounts
 * (`Screen.tsx:319-333`) hand-built them: a failed REFETCH keeps `data` and sets `error`, so only
 * a query with nothing to show is fatal; a failed background refresh is a `staleError` the page
 * shows as a warning bar over the data it still has.
 *
 * The raw per-query flags stay on the queries themselves: a screen whose current order of checks
 * differs (Check List Settings tests the tab error before loading) keeps that order and reads
 * `fatalError` / `phase` only where they match (build plan risk R-3).
 *
 * Wave C options (all optional; omitted = the rules above):
 *   - `fatalWhen: "any-error"` — EVERY failed query is fatal, a failed refetch over cached data
 *     included (first failing query in the given order); there is then no `staleError`. Project
 *     Gates, Check List Settings and Contracts have always shown the error state this way.
 *   - `loadingWhen: "isLoading"` — "loading" is TanStack's `isLoading` (first fetch in flight)
 *     instead of `isPending` (which also stays true for a disabled query). Check List Settings
 *     and Contracts check loading this way.
 */
import type { UseQueryResult } from "@tanstack/react-query";

export interface QueryHealth {
  /** `loading`: any query is pending. `fatal`: any query errored with no data. Else `ready`. */
  phase: "loading" | "fatal" | "ready";
  /** First error of a query that has no data (with `fatalWhen: "any-error"`: of any failed query). */
  fatalError?: unknown;
  /** First error of a query that still has data (a refetch failed). Never set with `"any-error"`. */
  staleError?: unknown;
  /** Refetches only the queries with `isError`. */
  retryFailed(): void;
  /** Refetches every query. */
  retryAll(): void;
}

export interface QueryHealthOptions {
  /** Default `"no-data"`: fatal only when a failed query has no data. */
  fatalWhen?: "no-data" | "any-error";
  /** Default `"isPending"`. `"isLoading"` reads `q.isLoading` (falls back to `isPending` if absent). */
  loadingWhen?: "isPending" | "isLoading";
}

type AnyQuery = Pick<UseQueryResult<unknown, unknown>, "isPending" | "isError" | "data" | "error" | "refetch">
  & { isLoading?: boolean };

export function computeQueryHealth(queries: readonly AnyQuery[], options: QueryHealthOptions = {}): QueryHealth {
  const anyError = options.fatalWhen === "any-error";
  const loading = options.loadingWhen === "isLoading"
    ? (q: AnyQuery) => q.isLoading ?? q.isPending
    : (q: AnyQuery) => q.isPending;
  const fatal = queries.find((q) => q.isError && (anyError || q.data === undefined));
  const stale = anyError ? undefined : queries.find((q) => q.isError && q.data !== undefined);
  const phase: QueryHealth["phase"] = queries.some(loading)
    ? "loading"
    : fatal ? "fatal" : "ready";
  return {
    phase,
    ...(fatal ? { fatalError: fatal.error } : {}),
    ...(stale ? { staleError: stale.error } : {}),
    retryFailed: () => { for (const q of queries) if (q.isError) void q.refetch(); },
    retryAll: () => { for (const q of queries) void q.refetch(); },
  };
}

/** A hook for symmetry with the other `app/` helpers; the summary is cheap and recomputed per render. */
export function useQueryHealth(queries: readonly AnyQuery[], options?: QueryHealthOptions): QueryHealth {
  return computeQueryHealth(queries, options);
}
