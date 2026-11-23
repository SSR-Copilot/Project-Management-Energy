/**
 * TEST-ONLY wave recorder for the optimization programme (ProjectDocs/app-docs/optimization, B0).
 *
 * A request through the host costs about one round trip, so the cost of a load is its number of SEQUENTIAL WAVES (the longest
 * chain of awaited reads), not its number of requests: reads started together overlap. This helper replaces `fetchAll` with a
 * fake whose answers are held back until every read that CAN start has started, then released together. Counting the
 * releases gives the waves; each call records the wave it started in. It is deterministic (no wall clock, no real network).
 *
 *   const wave = createWaveClient((label, options) => rowsFor(label));
 *   vi.mock("@/data/client", async (orig) => ({ ...(await orig<object>()), fetchAll: (...a) => wave.fetchAll(...a) }));
 *   const { value, waves, calls } = await wave.run(() => loadCostBook("p1"));
 *   expect(waves).toBe(2);
 *   expect(startedTogether(calls, ["a", "b"])).toBe(true);
 *
 * The vi.mock factory must reach the instance lazily (`vi.hoisted`), because vi.mock is hoisted above the imports.
 */

export interface WaveCall {
  label: string;
  /** 0-based wave in which the read STARTED. Reads of one wave started before any answer of that wave was delivered. */
  wave: number;
  filter?: string;
  select?: readonly string[];
  maxPageSize?: number;
}

export interface WaveResult<T> {
  value: T;
  /** Number of sequential waves: the longest chain of awaited reads. */
  waves: number;
  calls: WaveCall[];
}

type Answer = (label: string, options: Record<string, unknown>) => unknown[];

export interface WaveClient {
  /** Drop-in for `fetchAll(label, page, options)`; the `page` argument is ignored (the answer comes from `answer`). */
  fetchAll: (label: string, page: unknown, options?: Record<string, unknown>) => Promise<unknown[]>;
  /** Runs `work` to completion, releasing held reads in waves. Rejects with the work's own error. */
  run: <T>(work: () => Promise<T>) => Promise<WaveResult<T>>;
  /** Every call since the last `reset()`. */
  calls: WaveCall[];
  reset: () => void;
}

export function createWaveClient(answer: Answer): WaveClient {
  const calls: WaveCall[] = [];
  let pending: { rows: unknown[] }[] = [];
  let resolvers: ((rows: unknown[]) => void)[] = [];
  let wave = 0;

  const client: WaveClient = {
    calls,
    reset() {
      calls.length = 0;
      pending = [];
      resolvers = [];
      wave = 0;
    },
    fetchAll(label, _page, options = {}) {
      calls.push({
        label,
        wave,
        filter: typeof options.filter === "string" ? options.filter : undefined,
        select: Array.isArray(options.select) ? (options.select as string[]) : undefined,
        maxPageSize: typeof options.maxPageSize === "number" ? options.maxPageSize : undefined,
      });
      return new Promise<unknown[]>((resolve) => {
        pending.push({ rows: answer(label, options) });
        resolvers.push(resolve);
      });
    },
    async run<T>(work: () => Promise<T>): Promise<WaveResult<T>> {
      wave = 0;
      const start = calls.length;
      let settled = false;
      let failure: unknown;
      let value: T | undefined;
      let failed = false;
      const running = work().then(
        (v) => { value = v; settled = true; },
        (e) => { failure = e; failed = true; settled = true; },
      );
      // Let every continuation that can run without an answer run first (macrotask boundary), then release the held reads.
      for (let guard = 0; guard < 10_000 && !settled; guard += 1) {
        await new Promise((r) => setTimeout(r, 0));
        if (settled) break;
        if (resolvers.length === 0) continue;
        const toRelease = resolvers;
        const rows = pending;
        resolvers = [];
        pending = [];
        wave += 1;
        toRelease.forEach((resolve, i) => resolve(rows[i]!.rows));
      }
      await running;
      if (failed) throw failure;
      return { value: value as T, waves: wave, calls: calls.slice(start) };
    },
  };
  return client;
}

/** True when every named label has a call and all of those calls started in the same wave. */
export function startedTogether(calls: readonly WaveCall[], labels: readonly string[]): boolean {
  const waves = labels.map((l) => calls.find((c) => c.label === l)?.wave);
  return waves.every((w) => w !== undefined) && new Set(waves).size === 1;
}

/** The wave a label first started in, or `undefined` when it never ran. */
export function waveOf(calls: readonly WaveCall[], label: string): number | undefined {
  return calls.find((c) => c.label === label)?.wave;
}
