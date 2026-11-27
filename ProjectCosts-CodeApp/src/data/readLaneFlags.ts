/**
 * Switch of the read lane for id-chunk reads (bottleneck programme T-C05, findings NET-04 = SCC-10 = NET-12).
 *
 * `READ_LANE` (default ON): the `Promise.all(chunk(ids).map(fetchAll))` reads of the Cost core go through ONE module-level lane
 * of width `READ_LANE_WIDTH` (`data/readChunks.ts`), so a category with hundreds of contracts queues its chunk requests instead
 * of starting them all at once. Up to `READ_LANE_WIDTH` chunks the waves are identical to the old code. OFF: the old unbounded
 * `Promise.all` at every adopted site, exactly as before (CONVENTIONS rule 15: a live decision, not dead code).
 *
 * The object is mutable on purpose, so a unit test can flip the switch and pin both halves; app code only reads it.
 */
export const READ_LANE = true;

/**
 * Chunks in flight at once across ALL adopted reads: 16 = `GLOBAL_REQUEST_CEILING` (40) - `GLOBAL_WRITE_LANE` (24), so reads never
 * take the share a write burst needs and the sum stays under Dataverse's 52 concurrent requests per user and web server.
 * To be calibrated by the 429 probe (P-4).
 */
export const READ_LANE_WIDTH = 16;

export interface ReadLaneFlags { enabled: boolean }

let current: ReadLaneFlags = { enabled: READ_LANE };

/** The switch as it is now. */
export const readLaneFlags = (): Readonly<ReadLaneFlags> => current;

/** For tests: change the switch; `resetReadLaneFlags()` restores the default. */
export function setReadLaneFlagsForTests(patch: Partial<ReadLaneFlags>): void {
  current = { ...current, ...patch };
}
export function resetReadLaneFlags(): void {
  current = { enabled: READ_LANE };
}
