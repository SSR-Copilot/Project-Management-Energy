/**
 * The bulk executor: sends a phase of `UpsertMultiple` requests, or a phase of per-record
 * deletes, and says EXACTLY how much of it landed when something fails.
 *
 * Shapes come from `./bulkTypes.ts` (the planner, this file and the save orchestrator share
 * them, CONVENTIONS rule 17). The transport and the deleter are injected, so nothing here
 * touches the SDK and every path is testable with a fake.
 *
 * Web API rules this follows (Microsoft, "Use bulk operation messages"):
 * - `POST <entityset>/Microsoft.Dynamics.CRM.UpsertMultiple` with body `{ "Targets": [...] }`;
 *   the transport owns the URL and the body wrapper, this file owns the targets.
 * - Every target carries `"@odata.type": "Microsoft.Dynamics.CRM.<logicalname>"`.
 * - Two targets with the same key in one request is an error, so ids are checked up front.
 * - On a standard table each request is all-or-nothing. By default (`parallel` 1) chunks go ONE
 *   AT A TIME: a failure stops the phase, and the committed prefix is exactly the chunks before
 *   it. With `parallel > 1` (Microsoft: "send bulk messages in parallel" for throughput; D51 §11
 *   measured one 1,000-row request at ~3.3 s, processed row by row on the server) every chunk is
 *   sent at once, and a failure is reported as `BulkPartialWriteError`, which carries NO prefix
 *   counts because the committed rows are no longer a prefix of the input.
 * - 100–1,000 records per request is the guidance; `DEFAULT_BULK_CHUNK` sits in the middle and
 *   `chunkSize` overrides it.
 * - There is no bulk delete for standard tables, so deletes stay one request per record,
 *   through `deleteRecord` (CONVENTIONS rule 14), never a generated service's raw `delete()`.
 */
import type { BulkTableInfo, BulkUpsertTransport, RecordDeleter, UpsertTarget } from "./bulkTypes";
import { WRITE_CONCURRENCY, forEachLimit } from "./concurrency";
import { chunk } from "./odata";
import { unwrap } from "../platform/errors";

/** Records per `UpsertMultiple` request. Inside Microsoft's 100–1,000 guidance. */
export const DEFAULT_BULK_CHUNK = 500;

/**
 * The smallest chunk a parallel phase is split into. A phase below 2 × this stays ONE request
 * (no chunk of a parallel split is ever made smaller than this on purpose; only the remainder
 * chunk can be).
 */
export const MIN_PARALLEL_CHUNK = 25;

/** Keys the executor writes itself; a planner that puts them in `fields` has a bug. */
const RESERVED_FIELD_KEYS = ["@odata.type", "@odata.id"] as const;

/* ═══════════════════════════════════════════════════════════════ errors ══ */

/**
 * An `UpsertMultiple` chunk was refused (or the transport threw).
 *
 * `chunkIndex` is 0-based. Because chunks run sequentially and each is all-or-nothing on a
 * standard table, `chunksCommitted` (= `chunkIndex`) and `rowsCommitted` are exact: those rows
 * are in Dataverse, the failed chunk and everything after it are not.
 */
export class BulkWriteError extends Error {
  readonly label: string;
  /** Entity set name of the table being written. */
  readonly table: string;
  readonly chunkIndex: number;
  readonly chunksCommitted: number;
  readonly rowsCommitted: number;
  /** `Error.cause` exists on the base type, hence the modifier. */
  override readonly cause: unknown;

  constructor(
    label: string,
    table: string,
    chunkIndex: number,
    chunksCommitted: number,
    rowsCommitted: number,
    cause: unknown,
  ) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(
      `${label}: request ${chunkIndex + 1} on ${table} failed after ${chunksCommitted} ` +
        `request(s) / ${rowsCommitted} row(s) were saved. ${detail}`,
    );
    this.name = "BulkWriteError";
    this.label = label;
    this.table = table;
    this.chunkIndex = chunkIndex;
    this.chunksCommitted = chunksCommitted;
    this.rowsCommitted = rowsCommitted;
    this.cause = cause;
  }
}

/**
 * Some, but not all, chunks of a PARALLEL `upsertMultiple` phase (`parallel > 1`) were refused.
 *
 * DELIBERATELY has no `rowsCommitted` and no `chunksCommitted` property. The save orchestrator
 * duck-types those two names as "the first N rows of the input landed" (true of the sequential
 * `BulkWriteError`). Here the committed chunks can be any subset (say chunks 0 and 2 landed,
 * chunk 1 did not), so a prefix count would be wrong. With both names absent, the orchestrator
 * treats the counts as unknown and reconciles cautiously. Do not add them.
 *
 * `rowsLanded` (the rows in the chunks that succeeded) and `chunksFailed` are informational only.
 * `cause` is the first failure in chunk order; `causes` lists every failure in chunk order.
 */
export class BulkPartialWriteError extends Error {
  readonly label: string;
  /** Entity set name of the table being written. */
  readonly table: string;
  readonly chunksFailed: number;
  /** Rows in the fulfilled chunks. Informational: NOT a prefix of the input. */
  readonly rowsLanded: number;
  readonly causes: readonly unknown[];
  /** `Error.cause` exists on the base type, hence the modifier. */
  override readonly cause: unknown;

  constructor(
    label: string,
    table: string,
    chunksFailed: number,
    rowsLanded: number,
    causes: readonly unknown[],
  ) {
    const first = causes[0];
    const detail = first instanceof Error ? first.message : String(first);
    super(
      `${label}: ${chunksFailed} parallel request(s) on ${table} failed; ${rowsLanded} row(s) in ` +
        `other requests were saved. First failure: ${detail}`,
    );
    this.name = "BulkPartialWriteError";
    this.label = label;
    this.table = table;
    this.chunksFailed = chunksFailed;
    this.rowsLanded = rowsLanded;
    this.causes = causes;
    this.cause = first;
  }
}

/**
 * One or more deletes in a `deleteMany` phase were refused. Every id was attempted first, so
 * `failedIds` is the complete list of rows still present and `deletedCount` the rows that went.
 * `causes[i]` is the error for `failedIds[i]`.
 */
export class BulkDeleteError extends Error {
  readonly label: string;
  /** Entity set name of the table being deleted from. */
  readonly table: string;
  readonly failedIds: readonly string[];
  readonly deletedCount: number;
  readonly causes: readonly unknown[];

  constructor(
    label: string,
    table: string,
    failedIds: readonly string[],
    deletedCount: number,
    causes: readonly unknown[],
  ) {
    const first = causes[0];
    const detail = first instanceof Error ? first.message : String(first);
    super(
      `${label}: ${failedIds.length} delete(s) on ${table} failed, ${deletedCount} succeeded. ` +
        `First failure: ${detail}`,
    );
    this.name = "BulkDeleteError";
    this.label = label;
    this.table = table;
    this.failedIds = failedIds;
    this.deletedCount = deletedCount;
    this.causes = causes;
  }
}

/**
 * The input to a bulk phase was refused by the executor's own checks, BEFORE any request was
 * sent: a duplicate id, an empty id, a reserved key in `fields`, or a bad `chunkSize`.
 *
 * `rowsCommitted` and `chunksCommitted` are always 0, so the orchestrator's duck-typed
 * "did anything commit?" check reads 0 and skips reconciliation: nothing reached Dataverse.
 */
export class BulkValidationError extends Error {
  readonly label: string;
  /** Entity set name of the table the phase was for. */
  readonly table: string;
  /** Why the input was refused, without the label/table prefix. */
  readonly reason: string;
  readonly rowsCommitted = 0;
  readonly chunksCommitted = 0;

  constructor(label: string, table: string, reason: string) {
    super(`${label}: ${table}: ${reason}`);
    this.name = "BulkValidationError";
    this.label = label;
    this.table = table;
    this.reason = reason;
  }
}

/* ═══════════════════════════════════════════════════════════ targets ══ */

/**
 * How one upsert target names its record. The ONLY place that decides it.
 *
 * Two forms exist for an upsert by primary key, and a live spike against VSBCloud_Dev settles
 * which one `UpsertMultiple` honours:
 *
 *   A. `{ "<primarykey>": "<guid>" }`                     — current choice
 *   B. `{ "@odata.id": "<entityset>(<guid>)" }`            — the alternative
 *
 * Switching is a one-line change to the return below (for B:
 * `return { "@odata.id": \`${table.entitySetName}(${id})\` };`). The reserved-key check in
 * `toUpsertTargets` already rejects both keys from `fields`, so either form stays safe.
 */
export function identify(table: BulkTableInfo, id: string): Record<string, unknown> {
  return { [table.primaryKey]: id };
}

/**
 * `rows` → the `Targets` array of one or more `UpsertMultiple` bodies.
 *
 * Each target is `{ "@odata.type", ...identify(), ...fields }`. Throws, before anything is sent,
 * when a row's `fields` carries a key the executor owns, or when two rows share an id (GUIDs
 * compared case-insensitively, as Dataverse compares them). Every such refusal is a
 * `BulkValidationError` carrying `label` (`"validate"` when called standalone).
 */
export function toUpsertTargets(
  table: BulkTableInfo,
  rows: readonly UpsertTarget[],
  label = "validate",
): Record<string, unknown>[] {
  const reserved = [table.primaryKey, ...RESERVED_FIELD_KEYS];
  const seen = new Set<string>();
  const odataType = `Microsoft.Dynamics.CRM.${table.logicalName}`;
  const refuse = (reason: string) => new BulkValidationError(label, table.entitySetName, reason);

  return rows.map((row, index) => {
    if (typeof row.id !== "string" || row.id.trim() === "") {
      throw refuse(`upsert row ${index} has no id.`);
    }
    const key = row.id.toLowerCase();
    if (seen.has(key)) {
      throw refuse(
        `id ${row.id} appears more than once in one upsert phase; ` +
          `UpsertMultiple rejects duplicate keys.`,
      );
    }
    seen.add(key);
    for (const name of reserved) {
      if (Object.prototype.hasOwnProperty.call(row.fields, name)) {
        throw refuse(`upsert row ${row.id} sets "${name}" in fields; the executor adds that key itself.`);
      }
    }
    return { "@odata.type": odataType, ...identify(table, row.id), ...row.fields };
  });
}

/* ═══════════════════════════════════════════════════════════ executor ══ */

/**
 * Upserts `rows` in chunks of `chunkSize`, one request at a time.
 *
 * Empty `rows` sends nothing. Validation (`chunkSize`, then `toUpsertTargets`) runs over the
 * WHOLE phase before the first request, so a duplicate in the last chunk cannot leave the first
 * one committed; it throws `BulkValidationError` (0 committed), never `BulkWriteError`.
 * Each result goes through `unwrap`; a `{ success: false }` or a thrown transport becomes a
 * `BulkWriteError` and no later chunk is sent.
 *
 * `parallel` (default 1 = the sequential behaviour above, exact prefix counts). When it is > 1
 * and the phase splits into more than one chunk (`parallelChunkSize`), every chunk is sent at
 * once (`Promise.allSettled`; the caller's transport is already gated by the shared concurrency
 * limiter, so no limiter is added here) and each result is unwrapped. Then:
 * - all succeeded → `{ requests, rows }`;
 * - all failed → `BulkWriteError(chunkIndex 0, chunksCommitted 0, rowsCommitted 0)`, cause the
 *   first failure in chunk order, so "nothing committed" (and the 501 fallback check) still holds;
 * - some succeeded → `BulkPartialWriteError` (no prefix counts, see the class).
 */
export async function upsertMultiple(
  table: BulkTableInfo,
  rows: readonly UpsertTarget[],
  transport: BulkUpsertTransport,
  opts: { chunkSize?: number; label?: string; parallel?: number } = {},
): Promise<{ requests: number; rows: number }> {
  const size = opts.chunkSize ?? DEFAULT_BULK_CHUNK;
  const parallel = opts.parallel ?? 1;
  const label = opts.label ?? `upsert ${table.logicalName}`;
  if (!Number.isInteger(size) || size < 1) {
    throw new BulkValidationError(label, table.entitySetName, `chunkSize must be a positive integer, got ${size}.`);
  }
  if (!Number.isInteger(parallel) || parallel < 1) {
    throw new BulkValidationError(label, table.entitySetName, `parallel must be a positive integer, got ${parallel}.`);
  }
  if (rows.length === 0) return { requests: 0, rows: 0 };

  const targetsAll = toUpsertTargets(table, rows, label);
  if (parallel > 1) {
    const parallelChunks = chunk(targetsAll, parallelChunkSize(rows.length, parallel, size));
    if (parallelChunks.length > 1) {
      return sendParallel(table, parallelChunks, transport, label, rows.length);
    }
  }

  const chunks = chunk(targetsAll, size);
  let rowsCommitted = 0;
  for (let index = 0; index < chunks.length; index += 1) {
    const targets = chunks[index] as Record<string, unknown>[];
    try {
      unwrap(
        await transport(table.entitySetName, targets),
        `${label} (request ${index + 1} of ${chunks.length})`,
      );
    } catch (cause) {
      throw new BulkWriteError(label, table.entitySetName, index, index, rowsCommitted, cause);
    }
    rowsCommitted += targets.length;
  }
  return { requests: chunks.length, rows: rowsCommitted };
}

/**
 * Chunk size for a parallel phase: about `parallel` chunks, never below `MIN_PARALLEL_CHUNK`,
 * never above `maxChunk`. A phase under 2 × `MIN_PARALLEL_CHUNK` rows stays one request, so a
 * small save is not split into a full chunk plus a tiny remainder.
 */
export function parallelChunkSize(rowCount: number, parallel: number, maxChunk = DEFAULT_BULK_CHUNK): number {
  if (rowCount < 2 * MIN_PARALLEL_CHUNK) return Math.max(1, Math.min(maxChunk, rowCount));
  return Math.min(maxChunk, Math.max(MIN_PARALLEL_CHUNK, Math.ceil(rowCount / parallel)));
}

async function sendParallel(
  table: BulkTableInfo,
  chunks: Record<string, unknown>[][],
  transport: BulkUpsertTransport,
  label: string,
  rowCount: number,
): Promise<{ requests: number; rows: number }> {
  const settled = await Promise.allSettled(
    chunks.map(async (targets, index) => {
      unwrap(
        await transport(table.entitySetName, targets),
        `${label} (parallel request ${index + 1} of ${chunks.length})`,
      );
    }),
  );
  const causes: unknown[] = [];
  let rowsLanded = 0;
  settled.forEach((outcome, index) => {
    if (outcome.status === "fulfilled") rowsLanded += (chunks[index] as unknown[]).length;
    else causes.push(outcome.reason);
  });
  if (causes.length === 0) return { requests: chunks.length, rows: rowCount };
  if (causes.length === chunks.length) {
    throw new BulkWriteError(label, table.entitySetName, 0, 0, 0, causes[0]);
  }
  throw new BulkPartialWriteError(label, table.entitySetName, causes.length, rowsLanded, causes);
}

/**
 * Deletes `ids` one request each, at most `limit` in flight, through the injected `deleter`
 * (in the app: `deleteRecord`, which throws on refusal).
 *
 * Ids are de-duplicated first (case-insensitively; the first spelling is kept). Unlike
 * `forEachLimit`'s first-failure-stops behaviour, EVERY id is attempted: each task catches its
 * own failure, and a phase with any failure throws `BulkDeleteError` listing them all. A refusal
 * never resolves as success.
 */
export async function deleteMany(
  table: BulkTableInfo,
  ids: readonly string[],
  deleter: RecordDeleter,
  opts: { limit?: number; label?: string } = {},
): Promise<{ requests: number }> {
  const label = opts.label ?? `delete ${table.logicalName}`;
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const id of ids) {
    const key = id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(id);
  }
  if (unique.length === 0) return { requests: 0 };

  const failures: { id: string; cause: unknown }[] = [];
  await forEachLimit(
    unique,
    async (id) => {
      try {
        await deleter(table.entitySetName, id);
      } catch (cause) {
        failures.push({ id, cause });
      }
    },
    opts.limit ?? WRITE_CONCURRENCY,
  );

  if (failures.length > 0) {
    // Report in input order, not completion order, so the message is deterministic.
    const order = new Map(unique.map((id, i) => [id, i]));
    failures.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    throw new BulkDeleteError(
      label,
      table.entitySetName,
      failures.map((f) => f.id),
      unique.length - failures.length,
      failures.map((f) => f.cause),
    );
  }
  return { requests: unique.length };
}
