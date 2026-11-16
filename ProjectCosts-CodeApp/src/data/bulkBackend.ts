/**
 * The interface contract between the write-plan engine (`executePlan.ts`) and the Generators
 * bulk transport. The engine only imports the types and calls `getBulkBackend()`. This file does NOT
 * import the real transport (`createGeneratorsBulkBackend`, `./generatorsBulk.ts`): that would make every
 * `executePlan` / `usePlanWrite` consumer (all admin and PM screens) load five generated services, the bulk
 * sender and read `sessionStorage` at module load. Instead the module that owns the transport registers it as
 * the default with `registerDefaultBulkBackend` (`./generators.ts` does, at module load). The error classes
 * live in `./bulkTypes.ts` and are re-exported here, so the transport can import them without an import cycle.
 *
 * Rules (decisions of 16 Nov 2026, ProjectDocs/app-docs/GENERATORS-BULK-IMPLEMENTATION-PLAN.md §2, §9):
 *  - One call targets ONE entity set. A standard-table bulk request lands whole or not at all;
 *    parallel chunks of one call can land partly.
 *  - Every row has a client-generated `id`. Rows never carry `@odata.type`, the primary key or
 *    `@odata.id` in `data`; the backend adds those from its table registry.
 *  - A create row MUST carry `owningbusinessunit@odata.bind` in `data` (CONVENTIONS rule 4). The
 *    backend fails closed (throws `BulkBackendValidationError`, nothing sent) when it is missing,
 *    when an id is empty or duplicated (case-insensitive), or when `data` holds a reserved key.
 *  - `updateMany` is GUARDED: the backend first reads which ids still exist (one read per 40 ids)
 *    and, if any is missing, sends nothing and throws `BulkRowsGoneError`.
 *  - A 501 on an action's first chunk falls back to per-row writes (create: one POST per row with
 *    the same id; update: one guarded PATCH per row), remembered per tab.
 *  - Failures throw `BulkBatchError` carrying exact row counts; the engine turns them into the
 *    "N of M changes had already been saved" message at ROW level.
 */

/** One row of a bulk call. `id` is client-generated (creates) or the existing key (updates). */
export interface BulkRow {
  id: string;
  data: Readonly<Record<string, unknown>>;
}

export interface BulkCallOptions {
  /** Human label for the `[VSB]` line and error text, for example "land-lease allocations". */
  label?: string;
}

export interface BulkCreateResult {
  /** The created ids in the order of the input rows. */
  ids: string[];
  /** HTTP requests actually sent (chunks, or rows after a 501 fallback). */
  requests: number;
}

export interface BulkUpdateResult {
  requests: number;
}

export interface BulkBackend {
  createMany(entitySet: string, rows: readonly BulkRow[], opts?: BulkCallOptions): Promise<BulkCreateResult>;
  updateMany(entitySet: string, rows: readonly BulkRow[], opts?: BulkCallOptions): Promise<BulkUpdateResult>;
}

export {
  BulkBackendValidationError, BulkBatchError, BulkRowsGoneError,
} from "./bulkTypes";

let backend: BulkBackend | null = null;
/** The registered default's factory (`registerDefaultBulkBackend`), or null when none was registered. */
let defaultFactory: (() => BulkBackend) | null = null;
/** The default backend, created from `defaultFactory` on first use and kept. */
let defaultBackend: BulkBackend | null = null;

/**
 * Registers the backend `getBulkBackend()` falls back to when none is installed. The factory runs lazily on
 * first use and its result is kept; registering again replaces the factory and drops the kept instance.
 * `./generators.ts` registers `createGeneratorsBulkBackend` at module load.
 */
export function registerDefaultBulkBackend(factory: () => BulkBackend): void {
  defaultFactory = factory;
  defaultBackend = null;
}

/** Tests install fakes here; `null` restores the registered default (the real Generators transport, once registered). */
export function setBulkBackend(next: BulkBackend | null): void {
  backend = next;
}

/**
 * The installed backend, else the registered default (created lazily on first use, so no call order matters).
 * With neither, it throws: a plan with a bulk step ran in a build that never loaded the module that registers
 * a backend (a programmer error, not a runtime condition).
 */
export function getBulkBackend(): BulkBackend {
  if (backend !== null) return backend;
  if (defaultBackend === null) {
    if (defaultFactory === null) {
      throw new Error(
        "No bulk backend is installed. Import `@/data/generators` (it registers the Generators transport) or call "
        + "setBulkBackend(...) before a plan with a createMany / updateMany step runs.",
      );
    }
    defaultBackend = defaultFactory();
  }
  return defaultBackend;
}
