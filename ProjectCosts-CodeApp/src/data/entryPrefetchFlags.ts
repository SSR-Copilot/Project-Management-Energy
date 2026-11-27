/**
 * Rollout switches of the screen-entry prefetch (bottleneck programme, workstream `entry-prefetch`: T-C01, T-C02, T-C03).
 *
 * Same pattern as `bootDvoptFlags.ts`: EVERY switch is its own rollback. Setting one to its OLD value gives back exactly the
 * requests and the behaviour the code had before (the old path is kept, CONVENTIONS rule 15). The object is mutable on purpose,
 * so a unit test can flip a switch and pin both halves; app code only reads it (through `entryPrefetch()`).
 *
 *  - `BOOT_PREFETCH_COST_READS` (T-C01 / SCC-01, default ON): a deep link, reload or new tab to a Cost screen also starts that
 *    screen's own first reads in the boot prefetch (`app/costScreenPrefetch.ts`), under the keys the screen reads, beside the
 *    session project instead of after the route gate (two waves earlier). It mirrors the ON `BOOT_PREFETCH_SCREEN_READS` of the
 *    Project Management screens. OFF: only the session project and the chunk, as before.
 *  - `BOOT_PREFETCH_PM_EXTRA_SCREENS` (T-C02 / SPB-02, default ON): the same for Production and Revenues, and the REFERENCE reads
 *    of Finance (categories, banks, KfW tranches; its project, inputs, repayments and step-up reads are re-read on every visit, so
 *    they are not prefetched). Needs `BOOT_PREFETCH_SCREEN_READS` too. OFF: those slugs start no reads, as before.
 *  - `BOOT_PREFETCH_ADMIN_CHUNK` (T-C03 / BND-17, default ON): an admin deep link starts the admin screen's chunk beside the
 *    session read, not after it (it starts a download only: no Dataverse read, no data). OFF: the chunk waits for the route.
 *  - `INTENT_PREFETCH_CHUNKS` (T-C03 / SPA-09, default ON): hovering or focusing a navigation rail entry for a short moment
 *    starts that screen's chunk (a static download, no Dataverse request). OFF: the chunk starts when the route needs it.
 *  - `INTENT_PREFETCH_DATA` (T-C03 / SPA-09, default OFF, owner has not approved the extra Dataverse traffic): the same
 *    hover or focus also starts the screen's own first reads, bounded (`app/intentPrefetch.ts`: a small number in flight, one
 *    start per project and screen in a time window, never while the page is hidden, never the heavy reads) and traced with a
 *    `[VSB]` line. OFF: no read is started by the rail.
 */
export const BOOT_PREFETCH_COST_READS = true;
export const BOOT_PREFETCH_PM_EXTRA_SCREENS = true;
export const BOOT_PREFETCH_ADMIN_CHUNK = true;
export const INTENT_PREFETCH_CHUNKS = true;
export const INTENT_PREFETCH_DATA = false;

export interface EntryPrefetchFlags {
  costReads: boolean;
  pmExtraScreens: boolean;
  adminChunk: boolean;
  intentChunks: boolean;
  intentData: boolean;
}

const DEFAULTS: EntryPrefetchFlags = {
  costReads: BOOT_PREFETCH_COST_READS,
  pmExtraScreens: BOOT_PREFETCH_PM_EXTRA_SCREENS,
  adminChunk: BOOT_PREFETCH_ADMIN_CHUNK,
  intentChunks: INTENT_PREFETCH_CHUNKS,
  intentData: INTENT_PREFETCH_DATA,
};

let current: EntryPrefetchFlags = { ...DEFAULTS };

/** The switches as they are now. */
export const entryPrefetch = (): Readonly<EntryPrefetchFlags> => current;

/** For tests: change some switches; `resetEntryPrefetch()` restores the defaults. */
export function setEntryPrefetchForTests(patch: Partial<EntryPrefetchFlags>): void {
  current = { ...current, ...patch };
}
export function resetEntryPrefetch(): void {
  current = { ...DEFAULTS };
}
