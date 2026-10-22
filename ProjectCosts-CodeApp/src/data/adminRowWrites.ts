/**
 * Per-row multi-record writes for the Application Settings data layer.
 *
 * Master has NO bulk services (owner decision, so no Dataverse `UpdateMultiple` / `CreateMultiple`): every multi-row write is a capped pool of single-row requests instead, with the
 * failure reporting the screens already rely on kept equivalent:
 *
 *   - `RowWriteError` carries a `partial` flag ("something
 *     already landed") and the first failure as `cause`, so "only part … saved" / "nothing was
 *     saved" messages (`platform/userMessage.ts`) read the same.
 *   - FAIL-FAST like the bulk chunks: after the first failure no new row starts; rows already in
 *     flight finish (they cannot be recalled), and `partial` is true exactly when one of them, or
 *     an earlier row, landed.
 *   - Updates go through `updateRecordIfExists`: a row deleted meanwhile is NEVER recreated
 *     (`UpdateMultiple` refused a missing id; on SDK 1.3.1 a bare PATCH would upsert it).
 *   - Creates return the server-assigned ids IN INPUT ORDER, as `createMultiple` did.
 *
 * Width: `WRITE_CONCURRENCY` (8) by default, the same pool every master write uses.
 */
import type { IOperationResult } from "@microsoft/power-apps/data";
import { getClient } from "@microsoft/power-apps/data";
import { dataSourcesInfo } from "../../.power/schemas/appschemas/dataSourcesInfo";
import { guardedCall, updateRecordIfExists, type GuardedUpdateClient } from "./client";
import { WRITE_CONCURRENCY, mapLimit } from "./concurrency";

/**
 * A multi-row write failed. `.cause` is the first row's failure (for logging and for typed checks
 * such as `RecordGoneError` / a 403 `DataError`); it is deliberately not part of `.message`, because
 * callers build the user-facing text from `.partial`.
 */
export class RowWriteError extends Error {
  override readonly cause?: unknown;
  /** True when at least one row of the SAME call was written before / while the failure happened. */
  readonly partial: boolean;
  /** How many rows were written, and how many the call had. */
  readonly written: number;
  readonly total: number;

  constructor(cause: unknown, partial: boolean, written = 0, total = 0) {
    super("multi-row write failed");
    this.name = "RowWriteError";
    this.cause = cause;
    this.partial = partial;
    this.written = written;
    this.total = total;
  }
}

/** The slice of the SDK client the per-row writes use (injectable for tests). */
export interface RowWriteClient extends GuardedUpdateClient {
  createRecordAsync<TIn, TOut>(table: string, record: TIn): Promise<IOperationResult<TOut>>;
}

export interface RowWriteOptions {
  /** Pool width; default `WRITE_CONCURRENCY`. */
  concurrency?: number;
  /** The table's primary-key column when it is not in `dataSourcesInfo` (it is for every settings table). */
  primaryKey?: string;
  client?: () => RowWriteClient;
}

const defaultClient = (): RowWriteClient => getClient(dataSourcesInfo) as unknown as RowWriteClient;

/**
 * Runs `write` for every row, `concurrency` at a time, fail-fast. Resolves to the results in input
 * order; on failure throws `RowWriteError` with `partial` = some row landed.
 */
export async function eachRow<R, T>(
  rows: readonly R[],
  write: (row: R, index: number) => Promise<T>,
  concurrency: number = WRITE_CONCURRENCY,
): Promise<T[]> {
  if (rows.length === 0) return [];
  let written = 0;
  try {
    return await mapLimit(rows, async (row, i) => {
      const out = await write(row, i);
      written += 1;
      return out;
    }, concurrency);
  } catch (error) {
    throw new RowWriteError(error, written > 0, written, rows.length);
  }
}

/**
 * `UpdateMultiple` replacement: every row carries its primary key (`primaryKey` column) plus the
 * columns to change. Each row is a guarded single-row update (`updateRecordIfExists`).
 */
export async function updateRowsEach(
  operation: string,
  tableName: string,
  primaryKey: string,
  rows: readonly Record<string, unknown>[],
  options: RowWriteOptions = {},
): Promise<void> {
  const client = options.client ?? defaultClient;
  await eachRow(rows, (row) => {
    const { [primaryKey]: id, ...fields } = row;
    if (typeof id !== "string" || id === "") {
      return Promise.reject(new Error(`${operation}: a row has no ${primaryKey}`));
    }
    return updateRecordIfExists(operation, tableName, id, fields, { primaryKey, client });
  }, options.concurrency);
}

/**
 * `CreateMultiple` replacement: creates every row and resolves to the server-assigned ids, in input
 * order. Any `primaryKey` value a caller left in a row is dropped first (as `createMultiple` did).
 */
export async function createRowsEach(
  operation: string,
  tableName: string,
  primaryKey: string,
  rows: readonly Record<string, unknown>[],
  options: RowWriteOptions = {},
): Promise<string[]> {
  const client = options.client ?? defaultClient;
  return eachRow(rows, async (row) => {
    const { [primaryKey]: _dropped, ...record } = row;
    const created = await guardedCall(operation, () =>
      client().createRecordAsync<Record<string, unknown>, Record<string, unknown>>(tableName, record));
    const id = created?.[primaryKey];
    return typeof id === "string" ? id : "";
  }, options.concurrency);
}
