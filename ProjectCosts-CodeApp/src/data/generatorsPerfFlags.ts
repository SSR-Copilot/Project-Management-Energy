/**
 * Rollout switches of the Generators screen performance work (D141; ProjectDocs/app-docs/02-OPEN-DECISIONS.md).
 *
 * EVERY switch is its own rollback: setting one to its OLD value gives back exactly the requests and the behaviour the
 * screen had before the change (the old code path is kept, CONVENTIONS rule 15). Treat each like `BULK_SAVE` or
 * `CANVAS_PARITY_DELETION`: a live product decision, not dead code. The write flags of the bulk and delete programmes
 * (`GENERATORS_BULK`, `GENERATORS_DELETE`) are separate and are NOT touched by this work.
 *
 *  - `targetedReload` (default ON; phase A): a save reloads only the queries it can change (`features/pm/generators/reload.ts`:
 *    the types, the turbines, the one family it wrote, the project roll-up) instead of every Generators query.
 *    OFF: every save refreshes `qk.generatorsAll(projectId)` and the three project copies, as before.
 *  - `gateByList` (default ON; phase A): the first view waits only for what the list shows. The orderable catalogue, the
 *    device costs, the price index and the AllWTG land-lease costs load when a panel or dialog that needs them opens, and
 *    the writes stay held back until they have settled (F3 unchanged). OFF: all 16 reads gate the screen, as before.
 *  - `prefetch` (default ON; phase A): the reads that depend on nothing but the project id start before the screen
 *    mounts (the deep link at start-up, and once a Project Management screen of the project is open), the D119 pattern.
 *    OFF: the screen's own hooks start every read when it mounts, as before.
 *  - `parallelChunks` (default ON; phase B, D142): the id-chunk loops of the turbine and model reads run through the
 *    shared concurrency gate instead of one chunk after another. Client-only; the same rows come back in the same order.
 *  - `readsByProject` (default OFF; phase B, D142): the turbines are read by the project instead of by the type ids,
 *    so they need not wait for the types. OFF until the DEV probe has shown the server answers the by-project read with
 *    the same rows (`ProjectDocs/app-docs/02-OPEN-DECISIONS.md`, D141).
 *  - `optimisticToggle` (default OFF; used from phase C): the status toggle updates the screen at once and rolls back on
 *    failure. A DIVERGENCE from the canvas (it shows the new status before the save landed), so proposed, not approved.
 *  - `persistCatalogue` (default OFF; phase B, D142): the orderable catalogue is kept across sessions (IndexedDB,
 *    version key with the build id, 12 h maximum age, stale-while-revalidate; `data/persistedReference.ts`). OFF because it can
 *    show a stale catalogue for the length of one read.
 *
 * `optimisticToggle` is declared here and used from phase C, so the module is the one place all the switches live.
 */
export interface GeneratorsPerfFlags {
  targetedReload: boolean;
  gateByList: boolean;
  prefetch: boolean;
  /** Phase B (D142). */
  parallelChunks: boolean;
  /** Phase B (D142). */
  readsByProject: boolean;
  /** Used from phase C. */
  optimisticToggle: boolean;
  /** Phase B (D142). */
  persistCatalogue: boolean;
}

/** A partial set of the switches, merged over `GENERATORS_PERF` by whoever accepts overrides. */
export type GeneratorsPerfOverrides = Partial<GeneratorsPerfFlags>;

/** The switches as shipped. */
export const GENERATORS_PERF: Readonly<GeneratorsPerfFlags> = {
  targetedReload: true,
  gateByList: true,
  prefetch: true,
  parallelChunks: true,
  readsByProject: false,
  optimisticToggle: false,
  persistCatalogue: false,
};

/** Every switch at its OLD behaviour: today's requests exactly (tests, and the rollback in one line). */
export const GENERATORS_PERF_ALL_OFF: Readonly<GeneratorsPerfFlags> = {
  targetedReload: false, gateByList: false, prefetch: false, parallelChunks: false,
  readsByProject: false, optimisticToggle: false, persistCatalogue: false,
};

let override: GeneratorsPerfOverrides | null = null;

/** The switches in force: the shipped values, then the override a test installed. */
export const generatorsPerf = (): Readonly<GeneratorsPerfFlags> => ({ ...GENERATORS_PERF, ...override });

/** Test seam: replaces switches for the rest of the run; `null` restores the shipped values. */
export function setGeneratorsPerfFlags(next: GeneratorsPerfOverrides | null): void {
  override = next;
}
