/**
 * Retry rules for Dataverse requests: which failures may be sent again, and how long to wait.
 *
 * THE SDK EXPOSES NO HEADERS. A failed request reaches the app as `PowerDataRuntimeHttpError { message; status?; requestId?;
 * stack? }` (`@microsoft/power-apps` `internal/data/core/error/types.d.ts`), so `Retry-After` can never be read today and the
 * header branches below (kept for a future host that exposes it) never fire. The policy therefore works from the HTTP `status`
 * alone (`classifyError` in `platform/errors.ts`) and waits with exponential backoff (`backoffMs`: full jitter, and equal jitter on a larger base for a 429). The SDK has no
 * timeout or abort either: see `withDeadline` in `data/requestPolicy.ts`.
 *
 * Two policies live here, side by side, because they share the parsing of status and `Retry-After`:
 *  - `retryDelay` (bulk create / update requests, `data/generatorsBulk.ts`): moved here unchanged from
 *    `generatorsBulk.ts`, which re-exports it, so every existing import keeps working.
 *  - `withDeleteRetry` (a single DELETE, Generators delete hardening DEL-2): opt-in per write, see
 *    `PlannedWrite.hardened` in `data/writePlan.ts`.
 *
 * `RETRY_POLICY_V2` (`data/requestFlags.ts`) picks the rules (dvopt T-10, OR-01). OFF runs the `legacy*` functions below, which are
 * the previous implementations kept verbatim; a test proves the equality (UT-RETRYV2-*).
 */
import { classifyError, errorChain, statusOfChain, type ErrorClass } from "@/platform/errors";
import { logAction } from "@/platform/requestLog";
import { RETRY_POLICY_V2 } from "./requestFlags";

/** Waits `ms`; injected in tests so a retry never sleeps for real. */
export type Sleeper = (ms: number) => Promise<void>;
export const realSleep: Sleeper = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/** Tries per request (the first plus two retries) and the longest single wait. */
export const MAX_BULK_TRIES = 3;
export const MAX_RETRY_WAIT_MS = 30_000;
/** Tries for a failure with no HTTP status (the first plus one retry). */
export const MAX_NO_STATUS_TRIES = 2;

/* ═════════════════════════════════════════════════════════════ backoff (v2) ══ */

/** Backoff schedule: base 1 s, factor 2, cap 15 s. Initial, to be calibrated from the DEV capture (T-00, probes P-4 and P-5). */
export const BACKOFF_BASE_MS = 1000;
export const BACKOFF_FACTOR = 2;
export const BACKOFF_CAP_MS = 15_000;
/** Base for the throttled (429) class only: larger, with equal jitter (see `backoffMs`). Initial, to be calibrated from the DEV capture. */
export const THROTTLED_BASE_MS = 2000;
/** Tries (the first plus the retries) per class: transient 3, throttled 4. Initial, to be calibrated from the DEV capture. */
export const TRANSIENT_TRIES = 3;
export const THROTTLED_TRIES = 4;

/** The tries a class is given in all (the first included); 1 = never retried. */
export function triesFor(cls: ErrorClass): number {
  if (cls === "throttled") return THROTTLED_TRIES;
  if (cls === "transient") return TRANSIENT_TRIES;
  return 1;
}

/**
 * The wait before the next try, in whole ms. `attempt` is the number of tries made so far (1 = the first try just failed). `random` is
 * injected (`Math.random` by default) and returns a number in [0, 1). Pure. The class decides the schedule (QA-04):
 *  - transient (and any other class): FULL jitter, `random() * min(cap, 1 s * 2^(attempt - 1))`;
 *  - throttled (429): EQUAL jitter on a 2 s base, `c / 2 + random() * c / 2` with `c = min(cap, 2 s * 2^(attempt - 1))`, so a 429 never
 *    waits near zero (the SDK hides `Retry-After`). Do not "fix" it back to one schedule for every class.
 */
export function backoffMs(o: { cls: ErrorClass; attempt: number; random?: () => number }): number {
  const attempt = Math.max(1, Math.floor(o.attempt));
  const r = Math.min(Math.max((o.random ?? Math.random)(), 0), 0.999999999);
  if (o.cls === "throttled") {
    // QA-04: a 429 means "slow down", and the SDK hides Retry-After, so the wait must never be near zero: EQUAL jitter (half the
    // ceiling is guaranteed, the other half random) on a larger base. Worst case over the four tries is 2 + 4 + 8 = 14 s (minimum 7 s).
    const ceiling = Math.min(BACKOFF_CAP_MS, THROTTLED_BASE_MS * BACKOFF_FACTOR ** (attempt - 1));
    return Math.floor(ceiling / 2 + r * (ceiling / 2));
  }
  const ceiling = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * BACKOFF_FACTOR ** (attempt - 1));
  return Math.floor(r * ceiling);
}

/**
 * The wait before a failed READ is retried by the query client (`app/Providers.tsx`; dvopt T-10, OR-01). TanStack calls it with the
 * failures so far minus one (0 before the first retry). With `RETRY_POLICY_V2`: exponential with jitter (`backoffMs`, by class), so two reads
 * that failed together do not retry in step. OFF: TanStack's own default, `min(1000 * 2^n, 30000)`. The number of retries is unchanged
 * (2, `isRetryable`). `random` is the jitter seam.
 */
export function queryRetryDelay(failureCount: number, error?: unknown, random: () => number = Math.random): number {
  if (!RETRY_POLICY_V2) return Math.min(1000 * 2 ** failureCount, 30_000);
  return backoffMs({ cls: classifyError(error), attempt: failureCount + 1, random });
}

function statusOf(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const e = error as Record<string, unknown>;
  const status = e["status"] ?? e["statusCode"];
  return typeof status === "number" ? status : undefined;
}

function headerOf(error: unknown, name: string): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const e = error as { headers?: unknown; response?: { headers?: unknown }; retryAfter?: unknown };
  if (name === "retry-after" && typeof e.retryAfter === "number") return String(e.retryAfter);
  for (const headers of [e.headers, e.response?.headers]) {
    if (!headers || typeof headers !== "object") continue;
    const getter = (headers as { get?: unknown }).get;
    if (typeof getter === "function") {
      const value = (getter as (n: string) => unknown).call(headers, name);
      if (typeof value === "string") return value;
    } else {
      for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === name && (typeof value === "string" || typeof value === "number")) return String(value);
      }
    }
  }
  return undefined;
}

/**
 * The `Retry-After` header of a failed request in milliseconds (seconds, or an HTTP date), or
 * undefined when absent or unreadable. Pure given `now`. (The SDK gives no headers today: see the file header.)
 */
export function retryAfterMs(error: unknown, now: number = Date.now()): number | undefined {
  const raw = headerOf(error, "retry-after")?.trim();
  if (!raw) return undefined;
  if (/^\d+(\.\d+)?$/.test(raw)) return Math.round(Number(raw) * 1000);
  const at = Date.parse(raw);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

/** The error and its `cause` chain (the SDK error sits under a `DataError`), at most 5 deep. */
const chainOf = errorChain;

const firstDefined = <T>(values: Iterable<T | undefined>): T | undefined => {
  for (const v of values) if (v !== undefined) return v;
  return undefined;
};

/**
 * How long to wait before the next try of a bulk request that failed, or undefined for "do not
 * retry". `attempt` is the number of tries made so far.
 *
 * REASONING. Re-sending a write is only safe when the server certainly did not process it, and a
 * bulk request is never idempotent here (a repeated `CreateMultiple` of ids that landed fails, a
 * repeated `UpdateMultiple` can overwrite a newer edit). So:
 *  - 429 (service protection) is answered BEFORE the request is processed: retry;
 *  - a 503 only when it carries `Retry-After` (never with the SDK today); a bare 503 may be a gateway that dropped the reply;
 *  - every other status (4xx, 500, 501, a network failure without a status) is NEVER retried, as
 *    the request may have partly landed or can never succeed. 501 has its own per-row fallback.
 *
 * With `RETRY_POLICY_V2` (default): up to `THROTTLED_TRIES` (4) tries, waiting `backoffMs` (exponential; equal jitter for a 429), a
 * `Retry-After` header winning if a future host exposes one. OFF: `legacyRetryDelay`.
 */
export function retryDelay(
  error: unknown, attempt: number, now: number = Date.now(), random: () => number = Math.random,
): number | undefined {
  if (!RETRY_POLICY_V2) return legacyRetryDelay(error, attempt, now);
  const header = firstDefined(chainOf(error).map((e) => retryAfterMs(e, now)));
  // 429 only; a 503 counts only when it carries `Retry-After`, the explicit "not processed" signal (never given by the SDK today).
  if (classifyError(error) !== "throttled" && !(statusOfChain(error) === 503 && header !== undefined)) return undefined;
  if (attempt >= THROTTLED_TRIES) return undefined;
  return Math.min(header ?? backoffMs({ cls: "throttled", attempt, random }), MAX_RETRY_WAIT_MS);
}

/**
 * `retryDelay` as it was before `RETRY_POLICY_V2`, kept verbatim as the rollback path (and as the oracle of UT-RETRYV2-*).
 * 429 waits 1 s x attempt; 503 only with a `Retry-After` (which the SDK never gives); three tries.
 */
export function legacyRetryDelay(error: unknown, attempt: number, now: number = Date.now()): number | undefined {
  if (attempt >= MAX_BULK_TRIES) return undefined;
  const status = statusOf(error);
  const header = retryAfterMs(error, now);
  if (status !== 429 && !(status === 503 && header !== undefined)) return undefined;
  return Math.min(header ?? 1000 * attempt, MAX_RETRY_WAIT_MS);
}

/* ═══════════════════════════════════════════════════════ delete retry ══ */

let deleteSleeperOverride: Sleeper | null = null;

/** Test seam: the sleeper `withDeleteRetry` uses when the caller passes none; `null` restores the real one. */
export function setDeleteSleeper(next: Sleeper | null): void {
  deleteSleeperOverride = next;
}

/**
 * Whether a failed DELETE may be sent again, and how long to wait first (`undefined` = no retry).
 * `attempt` is the number of tries made so far. Pure given `now` and `random`.
 *
 * REASONING. Unlike a create or an update, a DELETE is idempotent: sending it twice leaves the same state, and
 * a second answer of 404 only means the first one worked ("gone", decided by the caller). So an AMBIGUOUS
 * failure (a dropped connection, a 500 or 504 after the server may have started work) is safe to retry here,
 * where `retryDelay` must refuse it for a bulk write.
 *
 * With `RETRY_POLICY_V2` (default): retried are 429, 500, 502, 503, 504, 408 and an error with no status (the network; at most ONE
 * retry, `MAX_NO_STATUS_TRIES`), NO `Retry-After` needed (the SDK never gives one). Tries: `maxTries` if given, else by class
 * (transient 3, throttled 4). Wait: `backoffMs` (class schedule, see there), a header winning if present. Never retried: 400, 401, 403, 404, 409,
 * 412, a deterministic failure and every other status, because sending the same request again cannot change the answer.
 * OFF: `legacyDeleteRetryDelay`.
 */
export function deleteRetryDelay(
  error: unknown, attempt: number, maxTries?: number, now: number = Date.now(), random: () => number = Math.random,
): number | undefined {
  if (!RETRY_POLICY_V2) return legacyDeleteRetryDelay(error, attempt, maxTries ?? MAX_BULK_TRIES, now);
  const cls = classifyError(error);
  if (cls !== "throttled" && cls !== "transient") return undefined;
  if (attempt >= (maxTries ?? triesFor(cls))) return undefined;
  const chain = chainOf(error);
  // An error with NO status is not recognisably a network error and may be deterministic: one retry at most.
  if (firstDefined(chain.map(statusOf)) === undefined && attempt >= MAX_NO_STATUS_TRIES) return undefined;
  const header = firstDefined(chain.map((e) => retryAfterMs(e, now)));
  return Math.min(header ?? backoffMs({ cls, attempt, random }), MAX_RETRY_WAIT_MS);
}

/**
 * `deleteRetryDelay` as it was before `RETRY_POLICY_V2`, verbatim (rollback path and oracle of UT-RETRYV2-*).
 * Retried: 429, 503 WITH `Retry-After`, 500, 504 (up to `maxTries`) and an error with no status (at most one retry). Wait: the header,
 * else 1 s, then 2 s; never more than `MAX_RETRY_WAIT_MS`.
 */
export function legacyDeleteRetryDelay(
  error: unknown, attempt: number, maxTries: number = MAX_BULK_TRIES, now: number = Date.now(),
): number | undefined {
  if (attempt >= maxTries) return undefined;
  const chain = chainOf(error);
  const status = firstDefined(chain.map(statusOf));
  // An error with NO status is not recognisably a network error and may be deterministic: one retry at most (2 tries in all),
  // so it cannot hold a gate slot for 1 s + 2 s. Statuses that are retryable keep every try.
  if (status === undefined && attempt >= MAX_NO_STATUS_TRIES) return undefined;
  const header = firstDefined(chain.map((e) => retryAfterMs(e, now)));
  const retryable = status === undefined || status === 429 || status === 500 || status === 504
    || (status === 503 && header !== undefined);
  if (!retryable) return undefined;
  return Math.min(header ?? 1000 * attempt, MAX_RETRY_WAIT_MS);
}

let ownRetryDepth = 0;

/**
 * True while the SYNCHRONOUS start of an operation that a caller wraps in its OWN retry loop (`withDeleteRetry`) is running.
 * `policyOn` (`requestPolicy.ts`) reads it at the top of `deleteRecord` / `updateRecordIfExists`, so a call already inside an
 * outer retry does not retry again inside (T-11: no retry multiplication: 3 x 3 or 4 x 4 tries). A plain counter, no async
 * context: the wrapped call reads it before its first `await`, and nothing else runs between the increment and the decrement.
 */
export function insideOwnRetry(): boolean {
  return ownRetryDepth > 0;
}

/** Starts `op` with the scope marker of `insideOwnRetry` set while its synchronous part runs. */
export function startUnderOwnRetry<T>(op: () => Promise<T>): Promise<T> {
  ownRetryDepth += 1;
  try {
    return op();
  } finally {
    ownRetryDepth -= 1;
  }
}

/**
 * Runs `op` (one DELETE that THROWS on failure, e.g. through `unwrapDeleteStrict`), trying again as
 * `deleteRetryDelay` allows: at most `maxTries` tries in all (default: 3 for a transient failure, 4 for a 429; 3 for every class
 * when `RETRY_POLICY_V2` is off). Each retry prints ONE `[VSB] ACTION` warn line through `logAction` (or `o.log`) with the HTTP
 * status and the wait, never an id or a value. The last error is thrown unchanged. A 404 is never retried: the caller decides
 * what "gone" means. `o.random` is a test seam for the jitter.
 */
export async function withDeleteRetry<T>(
  op: () => Promise<T>,
  o: { sleep?: Sleeper; log?: (line: string) => void; maxTries?: number; random?: () => number } = {},
): Promise<T> {
  const maxTries = o.maxTries === undefined && RETRY_POLICY_V2 ? undefined : Math.max(1, Math.floor(o.maxTries ?? MAX_BULK_TRIES));
  const log = o.log ?? ((line: string) => logAction(line, "warn"));
  const sleep = o.sleep ?? deleteSleeperOverride ?? realSleep;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await startUnderOwnRetry(op);
    } catch (error) {
      const wait = deleteRetryDelay(error, attempt, maxTries, Date.now(), o.random);
      if (wait === undefined) throw error;
      const status = firstDefined(chainOf(error).map(statusOf));
      const tries = maxTries ?? triesFor(classifyError(error));
      log(
        `delete try ${attempt} of ${tries} failed (${status === undefined ? "no HTTP status, network error" : `HTTP ${status}`}); `
        + `trying again in ${wait} ms`,
      );
      await sleep(wait);
    }
  }
}
