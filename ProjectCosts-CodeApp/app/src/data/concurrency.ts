/**
 * A bounded worker pool for Dataverse writes.
 *
 * The SDK exposes create/update/delete one record at a time and has no `$batch` changeset, so a
 * save that touches N records costs N round trips no matter how it is written. What it does NOT
 * have to cost is N round trips END TO END: Add Cost from Table writes one `vsb_capexcosts` row
 * per changed month cell, and a full sheet is easily several hundred of them. Awaited one after
 * another at ~200 ms each that is minutes; eight at a time it is seconds.
 *
 * Why a pool and not a plain `Promise.all` over the whole list: Dataverse's service protection
 * limits cut a user off at 52 CONCURRENT requests per web server, and there is no retry on the
 * write path (`isRetryable` in `platform/errors.ts` is only consulted by react-query, which
 * governs reads). Firing 300 creates at once earns a 429 with a `Retry-After` nobody honours.
 * `WRITE_CONCURRENCY` sits far enough below the cap to leave room for whatever else the app has
 * in flight.
 *
 * FAILURE BEHAVIOUR matches the sequential loops this replaced, which is the point: the first
 * rejection is the one thrown, and no further task is STARTED after it. Tasks already in flight
 * are allowed to finish — they cannot be recalled — and each worker catches its own rejection so
 * a sibling failure never surfaces as an unhandled rejection. None of these saves is
 * transactional either way; a partial write was always possible and `saveAddCostSheet` orders
 * its phases so that a partial one stays consistent.
 */

/**
 * How many writes may be in flight at once.
 *
 * Deliberately well under Dataverse's 52-concurrent-request ceiling: the limit is per user per
 * web server, and a save shares it with every read react-query happens to be refetching.
 */
export const WRITE_CONCURRENCY = 8;

/**
 * `items.map(fn)`, run at most `limit` at a time, resolving to the results IN INPUT ORDER.
 *
 * Input order is guaranteed for the results; COMPLETION order is not, so this is only for tasks
 * that are genuinely independent of one another. Anything with a children-before-parents
 * ordering constraint stays in its own awaited phase.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<R>,
  limit: number = WRITE_CONCURRENCY,
): Promise<R[]> {
  if (items.length === 0) return [];

  const results = new Array<R>(items.length);
  let next = 0;
  let failure: unknown;
  let failed = false;

  const worker = async (): Promise<void> => {
    for (;;) {
      if (failed) return;
      const index = next++;
      if (index >= items.length) return;
      try {
        results[index] = await fn(items[index] as T, index);
      } catch (error) {
        // First rejection wins, exactly as the `for await` loop's first throw did.
        if (!failed) { failed = true; failure = error; }
        return;
      }
    }
  };

  const width = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: width }, worker));

  if (failed) throw failure;
  return results;
}

/** `mapLimit` for tasks whose results are not needed. */
export async function forEachLimit<T>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<unknown>,
  limit: number = WRITE_CONCURRENCY,
): Promise<void> {
  await mapLimit(items, fn, limit);
}
