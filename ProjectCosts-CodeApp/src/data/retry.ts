/**
 * Retry rules for Dataverse requests: which failures may be sent again, and how long to wait.
 *
 * Two policies live here, side by side, because they share the parsing of status and `Retry-After`:
 *  - `retryDelay` (bulk create / update requests, `data/generatorsBulk.ts`): moved here unchanged from
 *    `generatorsBulk.ts`, which re-exports it, so every existing import keeps working.
 *  - `withDeleteRetry` (a single DELETE, Generators delete hardening DEL-2): opt-in per write, see
 *    `PlannedWrite.hardened` in `data/writePlan.ts`.
 */
import { logAction } from "@/platform/requestLog";

/** Waits `ms`; injected in tests so a retry never sleeps for real. */
export type Sleeper = (ms: number) => Promise<void>;
export const realSleep: Sleeper = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/** Tries per request (the first plus two retries) and the longest single wait. */
export const MAX_BULK_TRIES = 3;
export const MAX_RETRY_WAIT_MS = 30_000;
/** Tries for a failure with no HTTP status (the first plus one retry). */
export const MAX_NO_STATUS_TRIES = 2;

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
 * undefined when absent or unreadable. Pure given `now`.
 */
export function retryAfterMs(error: unknown, now: number = Date.now()): number | undefined {
  const raw = headerOf(error, "retry-after")?.trim();
  if (!raw) return undefined;
  if (/^\d+(\.\d+)?$/.test(raw)) return Math.round(Number(raw) * 1000);
  const at = Date.parse(raw);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

/**
 * How long to wait before the next try of a bulk request that failed, or undefined for "do not
 * retry". `attempt` is the number of tries made so far.
 *
 * REASONING. Re-sending a write is only safe when the server certainly did not process it, and a
 * bulk request is never idempotent here (a repeated `CreateMultiple` of ids that landed fails, a
 * repeated `UpdateMultiple` can overwrite a newer edit). So:
 *  - 429 (service protection) is answered BEFORE the request is processed: retry, waiting the
 *    `Retry-After` header (default 1 s x attempt), at most `MAX_RETRY_WAIT_MS`;
 *  - 503 only when it carries a `Retry-After` (the platform's explicit "not processed, come
 *    back" signal); a bare 503 may be a gateway that dropped the reply after processing;
 *  - every other status (4xx, 500, 501, a network failure without a status) is NEVER retried, as
 *    the request may have partly landed or can never succeed. 501 has its own per-row fallback.
 */
export function retryDelay(error: unknown, attempt: number, now: number = Date.now()): number | undefined {
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

/** The error and its `cause` chain (the SDK error sits under a `DataError`), at most 5 deep. */
function chainOf(error: unknown): unknown[] {
  const out: unknown[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    out.push(current);
    current = typeof current === "object" ? (current as { cause?: unknown }).cause : undefined;
  }
  return out;
}

const firstDefined = <T>(values: Iterable<T | undefined>): T | undefined => {
  for (const v of values) if (v !== undefined) return v;
  return undefined;
};

/**
 * Whether a failed DELETE may be sent again, and how long to wait first (`undefined` = no retry).
 * `attempt` is the number of tries made so far. Pure given `now`.
 *
 * REASONING. Unlike a create or an update, a DELETE is idempotent: sending it twice leaves the same state, and
 * a second answer of 404 only means the first one worked ("gone", decided by the caller). So an AMBIGUOUS
 * failure (a dropped connection, a 500 or 504 after the server may have started work) is safe to retry here,
 * where `retryDelay` must refuse it for a bulk write. Retried: 429, 503 WITH `Retry-After`, 500, 504 (up to `maxTries`) and an error
 * with no status (the network; at most ONE retry, `MAX_NO_STATUS_TRIES`). Never retried: 400, 401, 403, 404, 409 and every other status, because sending
 * the same request again cannot change the answer.
 *
 * Wait: the `Retry-After` header when there is one, else 1 s, then 2 s; never more than `MAX_RETRY_WAIT_MS`.
 */
export function deleteRetryDelay(
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

/**
 * Runs `op` (one DELETE that THROWS on failure, e.g. through `unwrapDeleteStrict`), trying again as
 * `deleteRetryDelay` allows: at most `maxTries` tries in all (default 3). Each retry prints ONE
 * `[VSB] ACTION` warn line through `logAction` (or `o.log`) with the HTTP status and the wait, never an id or a value.
 * The last error is thrown unchanged. A 404 is never retried: the caller decides what "gone" means.
 */
export async function withDeleteRetry<T>(
  op: () => Promise<T>,
  o: { sleep?: Sleeper; log?: (line: string) => void; maxTries?: number } = {},
): Promise<T> {
  const maxTries = Math.max(1, Math.floor(o.maxTries ?? MAX_BULK_TRIES));
  const log = o.log ?? ((line: string) => logAction(line, "warn"));
  const sleep = o.sleep ?? deleteSleeperOverride ?? realSleep;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await op();
    } catch (error) {
      const wait = deleteRetryDelay(error, attempt, maxTries);
      if (wait === undefined) throw error;
      const status = firstDefined(chainOf(error).map(statusOf));
      log(
        `delete try ${attempt} of ${maxTries} failed (${status === undefined ? "no HTTP status, network error" : `HTTP ${status}`}); `
        + `trying again in ${wait} ms`,
      );
      await sleep(wait);
    }
  }
}
