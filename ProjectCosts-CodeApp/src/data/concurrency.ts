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
 * The default in-flight limit of a Generators `together()` group while `GENERATORS_PERF.wideGroups` is on (D144): 16 instead of
 * `WRITE_CONCURRENCY` (8). Used by `features/pm/generators/rules.ts` and, since D145, by the Production Save's group
 * (`PRODUCTION_WIDE_GROUPS`, `features/pm/production/rules.ts`); every other screen keeps 8. Worst case in flight: a
 * group runs alone (`executePlan` awaits groups one after the other), so a save has at most 16 writes in flight, plus the
 * background reads of the screen (the shared read gate and the reload's query fan-out, about a dozen), well under the 52
 * concurrent requests per user and web server that Dataverse allows. The leaf and cascade delete tiers below are NOT changed.
 */
export const WIDE_GROUP_CONCURRENCY = 16;

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

/**
 * Pool width for per-row deletes (Application Settings: CAPEX Accounts clean-up, Contracts DevCo
 * links). Deletes are independent single-row requests, so they may run wider than writes while a
 * save's peak in-flight count still stays well under the 52-request ceiling.
 */
export const DELETE_CONCURRENCY = 16;

/**
 * Tiered delete concurrency for a plan's `together(deletes, { limit })` group (Generators bulk programme, 1B).
 *
 * LEAF = deletes of rows nothing hangs off: land-lease allocations, O&M costs, units, bridge rows and turbines
 * deleted one by one. 16 at once, as `DELETE_CONCURRENCY`.
 *
 * CASCADE = deletes whose cascade locks and updates child rows: land-lease costs and generator types. Held to 4
 * at once, because overlapping cascades on the same parents measured 6-11 s per request in D51.
 *
 * Starting values; the timed DEV test (plan 9.4) sets the final numbers. Each group builds its own `createGate`,
 * and `executePlan` runs groups one after another, so the figure is a per-group ceiling: a caller must not run two
 * groups at the same time, or the in-flight total would be their sum (the 52-per-user limit still has headroom for
 * 16 + reads, not for 16 + 16 + 8).
 */
export const LEAF_DELETE_CONCURRENCY = 16;
export const CASCADE_DELETE_CONCURRENCY = 4;

/**
 * Runs tasks that share a key strictly one after another, and tasks with different keys (or no key) independently
 * (Generators delete hardening DEL-4, `PlannedWrite.serialKey`).
 *
 * `run(key, task)` starts `task` once every task given earlier with the SAME non-empty key has settled (a failure
 * of the earlier task does not stop the later one: failure policy belongs to the caller). A task with no key (or
 * an empty one) starts at once, exactly as if this helper were not there. Order within a key is the call order.
 *
 * Use it OUTSIDE a `createGate` slot: `serial(key, () => gate(send))`. A task that waits for its predecessor then
 * holds no slot, so a long queue on one key cannot starve the other keys, and the gate's limit still bounds the
 * requests in flight. The chain keeps only the tail promise per key and never rejects.
 */
export type SerialRunner = <T>(key: string | undefined, task: () => Promise<T>) => Promise<T>;

export function createSerialRunner(): SerialRunner {
  const tails = new Map<string, Promise<unknown>>();
  return <T>(key: string | undefined, task: () => Promise<T>): Promise<T> => {
    if (!key) return task();
    const previous = tails.get(key) ?? Promise.resolve();
    const result = previous.then(task);
    const tail = result.then(() => undefined, () => undefined);
    tails.set(key, tail);
    void tail.then(() => { if (tails.get(key) === tail) tails.delete(key); });
    return result;
  };
}

/**
 * A limit shared by several concurrent pools: `gate(task)` runs `task` once fewer than `limit`
 * gated tasks are in flight. `mapLimit` bounds ONE pool; a save that runs several pools at once
 * (Add Cost from Table, D51) needs one ceiling across all of them to stay under the 52-request
 * service-protection limit. A finished task hands its slot straight to the next waiter, so the
 * count never exceeds `limit`, even transiently.
 *
 * MEASUREMENT (no effect on scheduling): `peak()` is the highest number of gated tasks that were
 * in flight at once since the gate was made or last `reset()`; `reset()` sets it back to the
 * number in flight right now (zero when the gate is idle). Add Cost from Table logs it per save.
 */
interface Gate {
  <T>(task: () => Promise<T>): Promise<T>;
  /** Highest in-flight count since creation or the last `reset()`. */
  peak(): number;
  /** Restarts `peak()` from the current in-flight count. */
  reset(): void;
  /** How many gated tasks hold a slot right now (measurement only; the save logs read it). */
  inFlight(): number;
}

export function createGate(limit: number): Gate {
  let active = 0;
  let peak = 0;
  const waiting: (() => void)[] = [];
  const gate = async <T>(task: () => Promise<T>): Promise<T> => {
    if (active < limit) {
      active += 1;
      if (active > peak) peak = active;
    } else {
      // A slot handed over by a finishing task keeps `active` unchanged, so the peak cannot grow here.
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active -= 1;
    }
  };
  return Object.assign(gate, {
    peak: () => peak,
    reset: () => { peak = active; },
    inFlight: () => active,
  });
}
