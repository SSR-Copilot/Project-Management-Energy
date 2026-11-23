/**
 * One shared read for reference tables the Cost loaders each fetched on their own (optimization programme B2, OPT-07b/c).
 *
 * `loadCostAccounts`, `loadCapexCategories`, `loadCapexTotals`, the Add Cost from Table sheet and the Contracts screen all read the
 * whole CAPEX chart of accounts, and the OPEX and Land Lease books each read the whole `transactioncurrencies` table: the
 * Summary tab alone made three identical chart reads, and every category-tab switch and every post-save refetch read it again.
 * The data layer has no query client, so the sharing lives here, in two layers:
 *
 *   1. IN-FLIGHT COALESCING. Callers that ask while a read is running share its promise, so reads started together cost one
 *      request. A read that FAILS is dropped at once (nobody is served a rejected promise later).
 *   2. A SHORT MEMO. The answer is reused for `ttlMs` after the read STARTED (the app's own default stale time is 30 s).
 *
 * `invalidate()` throws the memo away, and a read that was already running when it was called is NOT remembered: a pre-write
 * answer must never be served after the write it predates. Callers get exactly what the read returned (the same array), so
 * they must not mutate it.
 *
 * `ttlMs <= 0` disables the memo and keeps only the coalescing (the reversible switch).
 */
export interface SharedRead<T> {
  /** The memoised or in-flight answer, or a new read. */
  get(): Promise<T>;
  /** Forget the memo; the next `get()` reads again. Safe to call at any time. */
  invalidate(): void;
}

export function sharedRead<T>(read: () => Promise<T>, ttlMs: number, now: () => number = Date.now): SharedRead<T> {
  interface Entry { promise: Promise<T>; startedAt: number; settled: boolean }
  let entry: Entry | undefined;

  return {
    get() {
      if (entry) {
        const age = now() - entry.startedAt;
        // A read still running is always shared; a finished one only while it is young.
        if (!entry.settled || age < ttlMs) return entry.promise;
      }
      const mine: Entry = { promise: read(), startedAt: now(), settled: false };
      entry = mine;
      mine.promise.then(
        () => { mine.settled = true; },
        () => { mine.settled = true; if (entry === mine) entry = undefined; },
      );
      return mine.promise;
    },
    invalidate() {
      entry = undefined;
    },
  };
}
