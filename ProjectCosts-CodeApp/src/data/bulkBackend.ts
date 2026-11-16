/**
 * The interface contract between the write-plan engine (`executePlan.ts`) and the Generators
 * bulk transport. The engine only imports the types and calls `getBulkBackend()`; the real
 * transport is `createGeneratorsBulkBackend` in `./generatorsBulk.ts`, installed by default. The
 * error classes live in `./bulkTypes.ts` and are re-exported here, so the transport can import
 * them without an import cycle.
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

import { createGeneratorsBulkBackend } from "./generatorsBulk";

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
/** The Generators transport, created on first use and kept (see `getBulkBackend`). */
let defaultBackend: BulkBackend | null = null;

/** Tests install fakes here; `null` restores the default (the real Generators transport). */
export function setBulkBackend(next: BulkBackend | null): void {
  backend = next;
}

/**
 * The installed backend, else the real transport (`createGeneratorsBulkBackend`, `./generatorsBulk.ts`),
 * created lazily on first use so importing this file costs nothing and no call order matters.
 */
export function getBulkBackend(): BulkBackend {
  if (backend !== null) return backend;
  defaultBackend ??= createGeneratorsBulkBackend();
  return defaultBackend;
}
