/**
 * One bounded lane for the id-chunk reads (bottleneck programme T-C05, NET-04 = SCC-10 = NET-12; design context NET-05).
 *
 * A read of an id list is `ceil(N / CHUNK)` requests, and every adopted site used to start them ALL at once
 * (`Promise.all(chunk(ids).map(read))`). The CAPEX tab also starts its payments and comments in the same wave, so a category with
 * several hundred contracts put dozens of requests in flight against Dataverse's 52 per user and web server. `readChunked` runs the
 * same chunks through ONE module-level `createGate` (`concurrency.ts`), `READ_LANE_WIDTH` (16) wide and shared by every caller:
 *
 *   - up to 16 chunks the waves are the old ones (a gate with a free slot starts the task synchronously, like `Promise.all`);
 *   - above it the rest queue, in order, instead of flooding the host;
 *   - the result is the per-chunk answers IN CHUNK ORDER, and the first failure (in time) fails the call with the same error as
 *     `Promise.all`. The only difference is that a chunk still WAITING for a slot is not started after a sibling failed.
 *
 * Reads keep their own `[VSB]` lines (`fetchAll` logs each one); a call that has to queue prints one `[VSB] ACTION` line with the
 * chunk count and the lane width. Switch: `READ_LANE` (`data/readLaneFlags.ts`); OFF is the old `Promise.all`. No retry here:
 * a per-chunk retry is T-C06.
 */
import { createGate } from "./concurrency";
import { chunk, CHUNK } from "./odata";
import { READ_LANE_WIDTH, readLaneFlags } from "./readLaneFlags";
import { logAction } from "@/platform/requestLog";

export { READ_LANE_WIDTH } from "./readLaneFlags";

/** The one lane every adopted read shares. */
export const readLane = createGate(READ_LANE_WIDTH);

type Lane = ReturnType<typeof createGate>;

/**
 * `Promise.all(items.map(read))` through the read lane: one lane slot per item, answers in input order, the first failure (in time)
 * fails the call, and an item still waiting for a slot is not started after a sibling failed. OFF (`READ_LANE`): the plain `Promise.all`.
 * `lane` and `width` are for tests.
 */
export async function readLaned<T, R>(
  items: readonly T[],
  read: (item: T) => Promise<R>,
  lane: Lane = readLane,
  width: number = READ_LANE_WIDTH,
): Promise<R[]> {
  if (!readLaneFlags().enabled) return Promise.all(items.map((item) => read(item)));

  if (lane.inFlight() + items.length > width) {
    logAction(`read lane: ${items.length} reads queue behind a lane of ${width} (${lane.inFlight()} in flight)`);
  }
  let failed = false;
  return Promise.all(items.map((item) => lane(async () => {
    // A read that waited for its slot is not started once a sibling has failed: the call is rejected already.
    if (failed) return undefined as R;
    try {
      return await read(item);
    } catch (error) {
      failed = true;
      throw error;
    }
  })));
}

/**
 * `Promise.all(chunk(items, size).map(read))` through the read lane. Resolves to the answers of `read`, one per chunk, in chunk
 * order (callers `.flat()` them as before).
 */
export function readChunked<T, R>(
  items: readonly T[],
  read: (part: T[]) => Promise<R>,
  size: number = CHUNK,
  lane: Lane = readLane,
  width: number = READ_LANE_WIDTH,
): Promise<R[]> {
  return readLaned(chunk(items, size), read, lane, width);
}
