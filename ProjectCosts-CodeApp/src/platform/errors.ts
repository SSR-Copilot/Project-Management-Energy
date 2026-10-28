/**
 * Turning `IOperationResult` into something you can `await` and trust.
 *
 * The SDK never throws for a failed data call — it returns `{ success: false, data, error }`.
 * That is easy to ignore, and the canvas app ignored the equivalent constantly: only two of
 * the Cost app's mutation paths wrap anything in `IfError`, so a Dataverse fault normally
 * showed up as a silently unchanged screen. Every read and write here goes through `unwrap`,
 * so a failure becomes a thrown `DataError` that react-query surfaces.
 */
import type { IOperationResult } from "@microsoft/power-apps/data";

/** A failed Dataverse operation, with the HTTP detail preserved where the SDK gives it. */
export class DataError extends Error {
  readonly status?: number;
  readonly operation: string;
  /** `Error.cause` exists on the base type, hence the modifier. */
  override readonly cause?: unknown;

  constructor(operation: string, cause?: unknown, status?: number) {
    super(`${operation} failed: ${describe(cause)}`);
    this.name = "DataError";
    this.operation = operation;
    this.status = status;
    this.cause = cause;
  }

  /** 403 from Dataverse means the row-level security said no, not that the app is broken. */
  get isForbidden(): boolean {
    return this.status === 403 || this.status === 401;
  }
}

function describe(cause: unknown): string {
  if (!cause) return "no error detail was returned";
  if (cause instanceof Error) return cause.message;
  if (typeof cause === "string") return cause;
  const record = cause as Record<string, unknown>;
  const message = record["message"];
  if (typeof message === "string") return message;
  try {
    return JSON.stringify(cause);
  } catch {
    return String(cause);
  }
}

/**
 * `status` is not on `IOperationResult.error`'s public type — `PowerDataRuntimeHttpError`
 * carries it, but the union is widened to `Error`. Read it defensively.
 */
function statusOf(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = (error as Record<string, unknown>)["status"] ??
    (error as Record<string, unknown>)["statusCode"];
  return typeof candidate === "number" ? candidate : undefined;
}

/** `success === false` becomes a throw. Use for every call whose result you rely on. */
export function unwrap<T>(result: IOperationResult<T>, operation: string): T {
  if (!result.success) throw new DataError(operation, result.error, statusOf(result.error));
  return result.data;
}

/**
 * For reads where "the caller may not see this" is a legitimate answer rather than an error —
 * a 403 yields the fallback, anything else still throws.
 *
 * This is the `Coalesce(RecordInfo(...), false)` shape from the canvas app: deny, do not
 * crash. It must never be used to swallow a write failure.
 */
export function unwrapOrForbidden<T>(
  result: IOperationResult<T>,
  operation: string,
  fallback: T,
): T {
  if (result.success) return result.data;
  const error = new DataError(operation, result.error, statusOf(result.error));
  if (error.isForbidden) return fallback;
  throw error;
}

/** True when retrying could plausibly help. react-query's `retry` predicate uses this. */
export function isRetryable(error: unknown): boolean {
  if (!(error instanceof DataError)) return false;
  if (error.isForbidden) return false;
  if (error.status === undefined) return true; // network-shaped
  return error.status >= 500 || error.status === 429;
}

/**
 * Upsert guard: the row a single-row update targeted no longer exists, so nothing was changed.
 *
 * Raised by `updateRecordIfExists` (`@/data/client`) when the pre-PATCH existence read finds no
 * row, or when the PATCH itself is refused with 404. It is a `DataError` with status 404, so
 * `isRetryable` says no and generic messages keep working; screens that want their own wording
 * test `instanceof RecordGoneError`. (Ported from the Application Settings branch.)
 */
export class RecordGoneError extends DataError {
  readonly table: string;
  readonly id: string;

  constructor(operation: string, table: string, id: string) {
    super(operation, `${table} row ${id} no longer exists`, 404);
    this.name = "RecordGoneError";
    this.table = table;
    this.id = id;
  }
}

/** The plain sentence every screen shows for a `RecordGoneError` (shared by `usePlanWrite` and the admin screens). */
export const RECORD_GONE_TEXT =
  "This record was deleted by someone else, so your change was not saved. Refresh the screen and try again.";

/**
 * The innermost Dataverse reason in an error's `cause` chain, as one support line:
 * `HTTP 400: <Dataverse message> (request <id>)`. Wrapping errors (bulk save phases, chunks) name
 * WHERE a write failed; this names WHY, which is otherwise only visible in the network trace.
 */
export function rootCauseDetail(error: unknown): string | undefined {
  let innermost: DataError | undefined;
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current; depth += 1) {
    if (current instanceof DataError) innermost = current;
    current = (current as { cause?: unknown }).cause;
  }
  if (!innermost) return undefined;
  const sdk = innermost.cause as Record<string, unknown> | undefined;
  const requestId = typeof sdk?.["requestId"] === "string" ? ` (request ${sdk["requestId"]})` : "";
  const status = innermost.status === undefined ? "" : `HTTP ${innermost.status}: `;
  return `${status}${describe(innermost.cause)}${requestId}`;
}

/** True when `error`, or anything in its `cause` chain (depth 4), is a `RecordGoneError`. */
export function isRecordGone(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (current instanceof RecordGoneError) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * A PATCH refused with 404 means the row was deleted after the existence read. Returns the
 * `RecordGoneError` to throw for such an error, otherwise the error unchanged.
 */
export function asRecordGone(error: unknown, operation: string, table: string, id: string): unknown {
  if (error instanceof RecordGoneError) return error;
  if (error instanceof DataError && error.status === 404) return new RecordGoneError(operation, table, id);
  return error;
}
