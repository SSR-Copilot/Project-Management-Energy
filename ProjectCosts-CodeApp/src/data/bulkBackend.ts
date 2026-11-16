/**
 * The interface contract between the write-plan engine (`executePlan.ts`) and the Generators
 * bulk transport. THIS FILE IS A STUB WRITTEN BY THE ORCHESTRATOR so two agents can build in
 * parallel: the transport owner replaces the body (keeping every exported name and shape), the
 * engine owner only imports the types and calls `getBulkBackend()`.
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

/** Nothing was sent: the rows failed the fail-closed checks. */
export class BulkBackendValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BulkBackendValidationError";
  }
}

/** `updateMany` found that some rows no longer exist. Nothing was sent. */
export class BulkRowsGoneError extends Error {
  readonly missingIds: readonly string[];
  constructor(missingIds: readonly string[]) {
    super(`${missingIds.length} row(s) no longer exist. Reload the page and try again.`);
    this.name = "BulkRowsGoneError";
    this.missingIds = missingIds;
  }
}

/** A bulk call failed after `rowsLanded` of `rowsTotal` rows were written. */
export class BulkBatchError extends Error {
  readonly rowsLanded: number;
  readonly rowsTotal: number;
  /** Ids known to have landed (creates), in input order; empty when none or unknown. */
  readonly landedIds: readonly string[];
  readonly cause?: unknown;
  constructor(message: string, args: { rowsLanded: number; rowsTotal: number; landedIds?: readonly string[]; cause?: unknown }) {
    super(message);
    this.name = "BulkBatchError";
    this.rowsLanded = args.rowsLanded;
    this.rowsTotal = args.rowsTotal;
    this.landedIds = args.landedIds ?? [];
    this.cause = args.cause;
  }
}

let backend: BulkBackend | null = null;

/** The transport owner installs the real backend here (module init); tests install fakes. */
export function setBulkBackend(next: BulkBackend | null): void {
  backend = next;
}

export function getBulkBackend(): BulkBackend {
  if (backend === null) {
    throw new Error("No bulk backend is installed. This is a programming error: install one with setBulkBackend().");
  }
  return backend;
}
