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

/**
 * `mapLimit` that reports the failure of the LOWEST INPUT INDEX, where `mapLimit` reports the first one in time (OPT-10, OPT-11).
 *
 * A sequential loop stops at the first write that fails, and that write is the first failing one in input order. Run side by side,
 * a later task can fail before an earlier one does. So the pool still stops STARTING tasks after the first failure it sees, waits
 * for the ones in flight, and throws the error of the lowest index among the failures. That is exact: tasks start in input order, so
 * every index below a failing one has started, and the lowest failing index of the whole input is among the tasks that ran. Tasks
 * after it that already started may have landed (they cannot be recalled), none starts later.
 */
export async function mapLimitFirstFailure<T, R>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<R>,
  limit: number = WRITE_CONCURRENCY,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let next = 0;
  let stopped = false;
  let lowest = -1;
  let lowestError: unknown;

  const worker = async (): Promise<void> => {
    for (;;) {
      if (stopped) return;
      const index = next++;
      if (index >= items.length) return;
      try {
        results[index] = await fn(items[index] as T, index);
      } catch (error) {
        stopped = true;
        if (lowest === -1 || index < lowest) { lowest = index; lowestError = error; }
        return;
      }
    }
  };

  const width = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: width }, worker));
  if (lowest !== -1) throw lowestError;
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

/* ═════════════════════════════════════════════════ global request gate (dvopt T-13) ══ */

/**
 * The total number of requests the shared helpers may have in flight at once, and the share of it writes may use (doc 21
 * section 5). Initial values, to be calibrated from the DEV capture: Dataverse allows 52 concurrent requests per user and web
 * server, 40 leaves room for what the gate does not see (a direct generated-service call), and 24 is today's Add Cost write gate.
 */
export const GLOBAL_REQUEST_CEILING = 40;
export const GLOBAL_WRITE_LANE = 24;

/**
 * One ceiling across ALL pools (WE-03): `runRead` / `runWrite` start `task` once fewer than `ceiling` tasks are in flight in total
 * AND (for a write) fewer than `writeLane` writes are. Reads may use the whole ceiling; a write never takes more than the lane,
 * so a burst of writes leaves `ceiling - writeLane` slots for reads. A waiting task that cannot start (a write at the lane limit)
 * does not block a later read that can. The slot is handed over at once when a task finishes, so `peak()` never exceeds the ceiling,
 * even transiently.
 *
 * The gate wraps ONE ATTEMPT, never a retry loop: a caller that retries gates each attempt separately and sleeps OUTSIDE the gate,
 * so a retry wait holds no slot (WE-05). Per-pool limits (`mapLimit`, `createGate`) stay as they are; this gate is the sum's ceiling.
 * It sees only requests sent through it: not wired into any caller yet, behind `GLOBAL_GATE` (`data/requestFlags.ts`).
 */
export interface RequestGate {
  runRead<T>(task: () => Promise<T>): Promise<T>;
  runWrite<T>(task: () => Promise<T>): Promise<T>;
  /** Highest total in flight since creation or the last `reset()`. */
  peak(): number;
  /** Highest writes in flight since creation or the last `reset()`. */
  writePeak(): number;
  /** Tasks holding a slot right now. */
  inFlight(): number;
  /** Writes holding a slot right now. */
  writesInFlight(): number;
  /** Tasks waiting for a slot right now. */
  waiting(): number;
  /** Restarts `peak()` / `writePeak()` from the current in-flight counts. */
  reset(): void;
}

export function createRequestGate(o: { ceiling: number; writeLane: number }): RequestGate {
  const ceiling = Math.max(1, Math.floor(o.ceiling));
  const lane = Math.max(1, Math.min(ceiling, Math.floor(o.writeLane)));
  let active = 0;
  let writes = 0;
  let peak = 0;
  let writePeak = 0;
  const queue: { write: boolean; start: () => void }[] = [];

  const pump = (): void => {
    for (let i = 0; i < queue.length && active < ceiling;) {
      const next = queue[i] as { write: boolean; start: () => void };
      if (next.write && writes >= lane) { i += 1; continue; }
      queue.splice(i, 1);
      active += 1;
      if (next.write) writes += 1;
      if (active > peak) peak = active;
      if (writes > writePeak) writePeak = writes;
      next.start();
    }
  };

  const run = <T>(write: boolean, task: () => Promise<T>): Promise<T> => new Promise<T>((resolve, reject) => {
    const start = (): void => {
      const done = (): void => {
        active -= 1;
        if (write) writes -= 1;
        pump();
      };
      // `new Promise` starts the task synchronously and turns a synchronous throw into a rejection, so `done` always runs later.
      new Promise<T>((started) => { started(task()); }).then(
        (value) => { done(); resolve(value); },
        (error: unknown) => { done(); reject(error); },
      );
    };
    queue.push({ write, start });
    pump();
  });

  return {
    runRead: (task) => run(false, task),
    runWrite: (task) => run(true, task),
    peak: () => peak,
    writePeak: () => writePeak,
    inFlight: () => active,
    writesInFlight: () => writes,
    waiting: () => queue.length,
    reset: () => { peak = active; writePeak = writes; },
  };
}

/** The app's one global gate (ceiling 40, write lane 24). Used by `sendWithPolicy` while `GLOBAL_GATE` is on. */
export const requestGate: RequestGate = createRequestGate({ ceiling: GLOBAL_REQUEST_CEILING, writeLane: GLOBAL_WRITE_LANE });
