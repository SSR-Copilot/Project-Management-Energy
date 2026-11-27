/**
 * Query-cache presets for the data classes of the app (bottleneck programme T-C04, finding NET-08; D165 doc 20 rule C7: class B).
 *
 * WHAT THIS FIXES. About twenty hooks declare their reference lists fresh for 30 minutes (`staleTime`), but TanStack drops a query
 * 5 minutes after its last observer unmounted (`gcTime`, default 300,000 ms). A user who leaves a screen and comes back after
 * 6 minutes therefore re-reads a list the code declared valid for 30. `REFERENCE` gives such a query `gcTime = staleTime`, so the
 * silent eviction inside the stale window goes away. The STALENESS RULE IS UNCHANGED (still 30 minutes); only memory is held
 * longer, and only for small reference lists (countries, states, areas, finance pickers).
 *
 * SCOPE. Spread it (`useQuery({ ...REFERENCE, queryKey, queryFn })`) into the options of a FIXED-KEY reference list. Do not use it for
 * typed-search keys (every keystroke is a key), per-person lookups, or large catalogues (the generator catalogue has its own
 * persisted cache, D142) and never for working data (the open category's book, Contracts, Check List rows): those stay on the
 * global 30 s default. The GLOBAL defaults of `Providers.tsx` (`staleTime`, `refetchOnWindowFocus`, `gcTime`) are not touched here
 * (DEC-F / DEC-3, D165 rule C6).
 *
 * Switch `REFERENCE_GC` (default ON): OFF gives `REFERENCE` without `gcTime`, i.e. exactly the old `staleTime: 30 min` options.
 */
const REFERENCE_STALE_MS = 30 * 60 * 1000;

export const REFERENCE_GC = true;

export const REFERENCE: { readonly staleTime: number; readonly gcTime?: number } = REFERENCE_GC
  ? { staleTime: REFERENCE_STALE_MS, gcTime: REFERENCE_STALE_MS }
  : { staleTime: REFERENCE_STALE_MS };
