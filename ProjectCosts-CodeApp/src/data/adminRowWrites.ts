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
import { DataError, asRecordGone } from "@/platform/errors";
import { logAction, loggedCall } from "@/platform/requestLog";
import { guid } from "./odata";
import { deleteRecord, guardedCall, updateRecordIfExists, type GuardedUpdateClient } from "./client";
import { ADMIN_OPT } from "./adminFlags";
import { MAX_BULK_TRIES, MAX_RETRY_WAIT_MS, realSleep, retryAfterMs, type Sleeper } from "./retry";
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

/* ═══════════════════════════════════════════════ already-gone deletes (AD-05) ══ */

/** The error and its `cause` chain (a `DataError` wraps the SDK error), at most 5 deep. */
function causeChain(error: unknown): unknown[] {
  const out: unknown[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    out.push(current);
    current = typeof current === "object" ? (current as { cause?: unknown }).cause : undefined;
  }
  return out;
}

function statusInChain(error: unknown): number | undefined {
  for (const e of causeChain(error)) {
    if (!e || typeof e !== "object") continue;
    const status = (e as Record<string, unknown>)["status"] ?? (e as Record<string, unknown>)["statusCode"];
    if (typeof status === "number") return status;
  }
  return undefined;
}

/**
 * Whether a failed DELETE only means the row was already absent: HTTP 404 or the Dataverse code `0x80040217`, exactly the rule
 * of `unwrapDeleteStrict` (`platform/errors.ts`, D157), here read from the `DataError` that `deleteRecord` throws. A 400 that merely
 * names another missing object is NOT "gone".
 *
 * TODO (dvopt integration): replace with the shared `isAlreadyGone` / `deleteIfExists` that the `llopex` work package adds to
 * `data/client.ts`, then delete this local copy.
 */
export function isAlreadyGone(error: unknown): boolean {
  if (statusInChain(error) === 404) return true;
  for (const e of causeChain(error)) {
    let text = e instanceof Error ? e.message : "";
    try { text += ` ${typeof e === "string" ? e : JSON.stringify(e) ?? ""}`; } catch { /* unreadable: ignore */ }
    if (/0x80040217/i.test(text)) return true;
  }
  return false;
}

/**
 * `deleteRecord` where "already gone" is a success (AD-05, `ADMIN_DELETE_ALREADY_GONE_OK`): another admin, or an overlapping
 * clean-up, deleted the same row. Resolves to `"deleted"` or `"gone"`; any other failure is thrown unchanged. With the switch OFF it is
 * exactly `deleteRecord` (a 404 throws).
 */
export async function deleteRowIfPresent(operation: string, tableName: string, recordId: string): Promise<"deleted" | "gone"> {
  try {
    await deleteRecord(operation, tableName, recordId);
    return "deleted";
  } catch (error) {
    if (ADMIN_OPT.ADMIN_DELETE_ALREADY_GONE_OK && isAlreadyGone(error)) return "gone";
    throw error;
  }
}

/* ══════════════════════════════════════ settled pools and retry (AD-01, T-04) ══ */

let retrySleeperOverride: Sleeper | null = null;

/** Test seam: the sleeper the clean-up's retries use when the caller passes none; `null` restores the real one. */
export function setRetrySleeper(next: Sleeper | null): void {
  retrySleeperOverride = next;
}

/** The sleeper a retrying admin write uses: the caller's, else the test seam, else a real timer. */
export const retrySleeper = (given?: Sleeper): Sleeper => given ?? retrySleeperOverride ?? realSleep;

/** One failed row of a settled pool: its index in the input and the error. */
export interface RowFailure { index: number; error: unknown }

/** What a settled pool did: how many rows landed, and every failed row (in input order). */
export interface SettledRows { landed: number; failures: RowFailure[] }

/**
 * `fn` for every item, `limit` at a time, WITHOUT stopping at a failure: every item is tried, every failure is collected
 * (`mapLimit` and `eachRow` are fail-fast). For idempotent, rerunnable steps only. Never throws for a row.
 */
export async function settleEach<T>(
  items: readonly T[], fn: (item: T, index: number) => Promise<unknown>, limit: number = WRITE_CONCURRENCY,
): Promise<SettledRows> {
  let landed = 0;
  const failures: RowFailure[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      try {
        await fn(items[index] as T, index);
        landed += 1;
      } catch (error) {
        failures.push({ index, error });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  failures.sort((a, b) => a.index - b.index);
  return { landed, failures };
}

/**
 * How long to wait before sending an IDEMPOTENT write again, or undefined for "do not retry". `attempt` = tries made so far.
 *
 * REASONING. The clean-up's zero PATCH sets `vsb_cost` to the constant 0, so sending it twice leaves the same state, even after an
 * ambiguous failure. Retried: 429, any 5xx and an error with no HTTP status (the network), up to `maxTries` tries in all. Never
 * retried: any other status (400, 401, 403, 404 `RecordGoneError`, 409 ...), which sending again cannot change. The wait is the
 * `Retry-After` header when there is one, else 1 s x attempt, never more than `MAX_RETRY_WAIT_MS`. Pure given `now`.
 */
export function idempotentWriteDelay(
  error: unknown, attempt: number, maxTries: number = MAX_BULK_TRIES, now: number = Date.now(),
): number | undefined {
  if (attempt >= maxTries) return undefined;
  const status = statusInChain(error);
  const retryable = status === undefined || status === 429 || (status >= 500 && status <= 599);
  if (!retryable) return undefined;
  let header: number | undefined;
  for (const e of causeChain(error)) { header = retryAfterMs(e, now); if (header !== undefined) break; }
  return Math.min(header ?? 1000 * attempt, MAX_RETRY_WAIT_MS);
}

/** Runs `op`, trying again as `idempotentWriteDelay` allows. The last error is thrown unchanged. */
export async function withIdempotentRetry<T>(
  op: () => Promise<T>, o: { sleep?: Sleeper; maxTries?: number; log?: (line: string) => void } = {},
): Promise<T> {
  const maxTries = Math.max(1, Math.floor(o.maxTries ?? MAX_BULK_TRIES));
  const sleep = retrySleeper(o.sleep);
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await op();
    } catch (error) {
      const wait = idempotentWriteDelay(error, attempt, maxTries);
      if (wait === undefined) throw error;
      const status = statusInChain(error);
      (o.log ?? ((line: string) => logAction(line, "warn")))(
        `write try ${attempt} of ${maxTries} failed (${status === undefined ? "no HTTP status, network error" : `HTTP ${status}`}); `
        + `trying again in ${wait} ms`,
      );
      await sleep(wait);
    }
  }
}

export interface SettledWriteOptions extends RowWriteOptions {
  sleep?: Sleeper;
  maxTries?: number;
}

/**
 * `updateRowsEach` for an IDEMPOTENT, rerunnable set of writes (the clean-up's zero PATCH): each row is its guarded update with
 * `withIdempotentRetry`, and a failed row does not stop the others. Resolves to the counts and every failure; never throws for a row.
 * A row with no key is a programming error and is reported as a failure without a send.
 */
export async function updateRowsSettled(
  operation: string,
  tableName: string,
  primaryKey: string,
  rows: readonly Record<string, unknown>[],
  options: SettledWriteOptions = {},
): Promise<SettledRows> {
  const client = options.client ?? defaultClient;
  return settleEach(rows, (row) => {
    const { [primaryKey]: id, ...fields } = row;
    if (typeof id !== "string" || id === "") return Promise.reject(new Error(`${operation}: a row has no ${primaryKey}`));
    return withIdempotentRetry(
      () => updateRecordIfExists(operation, tableName, id, fields, { primaryKey, client }),
      { sleep: options.sleep, maxTries: options.maxTries },
    );
  }, options.concurrency);
}

/* ═══════════════════════════════════ update of a row just created (AD-08) ══ */

/**
 * The follow-up write of a create-then-update pair (D18/D19: kept on purpose, the sync flow copies the status only on Update) as a
 * plain PATCH WITHOUT the existence read of `updateRecordIfExists`: the POST answered a few milliseconds ago, so the row exists
 * (`ADMIN_NO_REDUNDANT_EXISTS`). A 404 still becomes `RecordGoneError`, as in the guarded form. Residual (DEC-7 class): a row
 * deleted by someone else within those milliseconds would be re-created holding only these columns.
 */
export async function updateRecordJustCreated<TFields>(
  operation: string, tableName: string, recordId: string, fields: TFields,
  options: { client?: () => GuardedUpdateClient } = {},
): Promise<void> {
  let id: string;
  try {
    id = guid(recordId);
  } catch (error) {
    throw new DataError(operation, error);
  }
  const client = options.client ?? (() => defaultClient() as GuardedUpdateClient);
  try {
    await loggedCall(
      "update", tableName,
      () => guardedCall(operation, () => client().updateRecordAsync<TFields, unknown>(tableName, id, fields)),
      () => 1,
    );
  } catch (error) {
    throw asRecordGone(error, operation, tableName, id);
  }
}
