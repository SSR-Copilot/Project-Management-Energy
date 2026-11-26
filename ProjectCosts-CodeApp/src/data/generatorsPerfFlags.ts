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
 *
 * Save latency (D144, `ProjectDocs/app-docs/02-OPEN-DECISIONS.md`): four more switches, each changing only the GROUPING and
 * ORDER of the writes of a save (or what a save reloads), never WHAT is written. The old plan builders stay reachable
 * behind them (`GENERATORS_PERF_ALL_OFF` gives today's plans; the golden-master tests `UT-GENLAT-*` compare both).
 *  - `relaneWrites` (default ON): Add PV Module, Add Individual Generator, Add WTG Type and the status toggle put the writes
 *    that depend on nothing created beside them into ONE `together()` wave (`rules.ts`: the type update, the roll-up, the
 *    allocations, the device-type row), instead of one wave after the other. DIVERGENCE (a failure inside such a wave lets
 *    the wave finish; the canvas waits for each write in turn).
 *  - `replaceLanes` (default ON): Replace Generator Type / Replace PV Module read their Identify data in fewer waves (the
 *    unused allocation-count read is dropped, the reads form a dependency graph, not stages), delete their sibling leaf rows
 *    (units + device-type rows) in ONE wave and create the siblings in one wave. The delete lane and the create lane never
 *    overlap (D115 decision 5).
 *  - `trimReload` (default ON): after a Generators save the Milestones, General Data and session copies of the project are
 *    marked stale without being fetched (`features/pm/generators/reload.ts`); a later visit fetches them.
 *  - `deleteReadWaves` (default ON; OPT-15 S4-04, optimization programme B6): the WTG / PV type delete reads its inputs (units,
 *    allocations and their counts, device-type rows, O&M costs) as a dependency graph: the O&M read starts when the device-type
 *    read answers, not when the allocation counts do, and the PV delete starts the device-type read with the unit read. Reads
 *    only; the same rows come back. OFF: the staged reads (WTG 4 sequential waves, PV 5; ON: 3 and 3).
 *  - `countryFromSharedList` (default ON; OPT-07a S4-05, B6): the project's country name and ISO currency come from the shared
 *    countries list (`data/countries.ts`, cached 30 minutes, started beside the project read) instead of a single-row country
 *    read after the project read on every load and save reload. DIVERGENCE: a country name / ISO edit is seen up to 30 minutes
 *    late on this screen (nothing in the app writes `vsb_countries`, so the 30-minute window is the only bound). OFF: the
 *    two sequential reads as before.
 *  - `wideGroups` (default ON): the default in-flight limit of a Generators `together()` group goes from 8 to 16
 *    (`WIDE_GROUP_CONCURRENCY`). The leaf and cascade delete tiers (16 / 4) are NOT changed.
 *
 * Network trims of the PM Generators / Production / Finance screens (dvopt programme, plan T-22; findings PA-05, PA-08, PA-09, PA-10,
 * PA-15). Each is its own rollback and changes WHEN or HOW MUCH is read, never what is written or what the user sees:
 *  - `flowBesideReads` (default ON; PA-05, "PMA_FLOW_BESIDE_READS"): a delete / replace of a type with an open permission request
 *    starts the cancellation flow and the Identify reads together; the plan is built only after BOTH have settled, so the flow
 *    still completes before any delete (D97 order kept). OFF: the flow and the reads one after the other, as before.
 *  - `productionLeanReload` (default ON; PA-08, "PRODUCTION_LEAN_RELOAD"): the Production save does not re-read the yields the roll-up
 *    has just read (they seed the cache, and are the rows a re-read would give), and the generation job reloads only the project
 *    copies (it writes the four CAPEX flags only). OFF: every job reloads `productionAll`.
 *  - `turbinesRefetchOnce` (default ON; PA-09, "TURBINES_REFETCH_ONCE"): adding, deleting or replacing a type reloads the turbines
 *    once, after the types have been read, not under the old key and then again under the new one. OFF: both at the same time.
 *  - `typeReadsLean` (default ON; PA-10, "TYPE_READS_LEAN"): the reads that only need ids select only what they use (Production's
 *    pre-write reads of the types and the turbines; Finance's active-turbine count), and Finance reuses the types list the warm-up
 *    cached (as fresh as the visit, D109). OFF: the full lists, as before.
 *  - `omGuardOneRead` (default ON; PA-15, "OM_GUARD_ONE_READ"): a selected type's O&M guard is ONE read of the project's active O&M
 *    costs filtered through the cost's device-type lookup, instead of the device-type read and then the O&M read. The two-read
 *    path runs when the one read is refused by the server. OFF: the two sequential reads, as before.
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
  /** Save latency (D144). */
  relaneWrites: boolean;
  /** Save latency (D144). */
  replaceLanes: boolean;
  /** Save latency (D144). */
  trimReload: boolean;
  /** Save latency (D144). */
  wideGroups: boolean;
  /** OPT-15 S4-04 (optimization programme B6). */
  deleteReadWaves: boolean;
  /** OPT-07a S4-05 (optimization programme B6). */
  countryFromSharedList: boolean;
  /** dvopt T-22 (PA-05). */
  flowBesideReads: boolean;
  /** dvopt T-22 (PA-08). */
  productionLeanReload: boolean;
  /** dvopt T-22 (PA-09). */
  turbinesRefetchOnce: boolean;
  /** dvopt T-22 (PA-10). */
  typeReadsLean: boolean;
  /** dvopt T-22 (PA-15). */
  omGuardOneRead: boolean;
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
  relaneWrites: true,
  replaceLanes: true,
  trimReload: true,
  wideGroups: true,
  deleteReadWaves: true,
  countryFromSharedList: true,
  flowBesideReads: false, // integration: off until the owner accepts that the cancellation flow may run before the Identify reads finish (PA-05)
  productionLeanReload: true,
  turbinesRefetchOnce: true,
  typeReadsLean: true,
  omGuardOneRead: true,
};

/** Every switch at its OLD behaviour: today's requests exactly (tests, and the rollback in one line). */
export const GENERATORS_PERF_ALL_OFF: Readonly<GeneratorsPerfFlags> = {
  targetedReload: false, gateByList: false, prefetch: false, parallelChunks: false,
  readsByProject: false, optimisticToggle: false, persistCatalogue: false,
  relaneWrites: false, replaceLanes: false, trimReload: false, wideGroups: false,
  deleteReadWaves: false, countryFromSharedList: false,
  flowBesideReads: false, productionLeanReload: false, turbinesRefetchOnce: false, typeReadsLean: false, omGuardOneRead: false,
};

let override: GeneratorsPerfOverrides | null = null;

/** The switches in force: the shipped values, then the override a test installed. */
export const generatorsPerf = (): Readonly<GeneratorsPerfFlags> => ({ ...GENERATORS_PERF, ...override });

/** Test seam: replaces switches for the rest of the run; `null` restores the shipped values. */
export function setGeneratorsPerfFlags(next: GeneratorsPerfOverrides | null): void {
  override = next;
}
