/**
 * H8 — TanStack Query option presets the settings screens repeat.
 *
 *   FRESH_ON_ENTRY       refetch whenever the screen mounts, even with cached data (CAPEX Accounts
 *                        `hooks.ts:21-30`, Check List Settings `hooks.ts:47-56`).
 *   NO_FOCUS_REFETCH     no refetch when the window regains focus (Milestones `hooks.ts:32`).
 *   FRESH_ON_ENTRY_ONCE  (Wave C) exactly ONE fetch per screen visit: refetch on every mount, but
 *                        never stale afterwards (`staleTime: Infinity`), so no focus, reconnect or
 *                        second-observer refetch starts another request during the visit (Check
 *                        List Settings' Project Gate locks, R-5 / DR-4).
 *
 * Spread them into `useQuery({ ...FRESH_ON_ENTRY, queryKey, queryFn })`.
 */
export const FRESH_ON_ENTRY = { staleTime: 0, refetchOnMount: "always" } as const;
export const NO_FOCUS_REFETCH = { refetchOnWindowFocus: false } as const;
export const FRESH_ON_ENTRY_ONCE = {
  staleTime: Number.POSITIVE_INFINITY, refetchOnMount: "always", refetchOnWindowFocus: false,
} as const;
