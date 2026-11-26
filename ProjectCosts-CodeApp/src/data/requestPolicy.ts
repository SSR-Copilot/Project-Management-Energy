/**
 * The request policy of the shared request core (dvopt T-10, T-12, T-13; doc 21 sections 2 to 5): ONE function, `sendWithPolicy`,
 * that decides per request KIND which failures are retried, waits with exponential backoff and jitter (`backoffMs`: full jitter, equal jitter on a 2 s base for a 429), optionally races each
 * attempt against a deadline and optionally runs it through the global request gate.
 *
 * Adopted by the write paths in T-11 (`client.ts`, `executePlan.ts`, `verifyGone.ts`, `bulkSend.ts`, `generatorsBulk.ts`, `adminRowWrites.ts`, each
 * behind its own `POLICY_*` switch in `requestFlags.ts`), never by a query read (TanStack retries those) and never by a flow call. Pieces:
 *  - classification: `classifyError` (`platform/errors.ts`), from the HTTP status only (the SDK gives no headers, see `retry.ts`);
 *  - `backoffMs` (`retry.ts`): the schedule;
 *  - `withDeadline`: stops WAITING for a call, it cannot cancel it (no AbortController path through the SDK);
 *  - `requestGate` (`concurrency.ts`): the global ceiling, one ATTEMPT at a time, so a retry wait holds no slot.
 *
 * IDEMPOTENCY MATRIX (doc 21 section 2):
 *
 * | kind            | 429 (not processed) | transient (5xx, network) | deadline exceeded                       |
 * | read            | retry               | retry                    | retryable timeout (a DataError)          |
 * | delete          | retry               | retry                    | UnknownOutcomeError (read back)          |
 * | patchAbsolute   | retry               | retry                    | UnknownOutcomeError (read back)          |
 * | create          | retry               | NO (reuse the id, X3)    | UnknownOutcomeError (read back)          |
 * | bulk            | retry               | NO (may have landed)     | UnknownOutcomeError (reconcile)          |
 *
 * Flow calls are out of scope and never go through here: a flow can send a real approval, so it is never retried.
 * A retry never changes the payload (the same `fn` is called again). Every other class (400, 401, 403, 404, 409, 412, unknown)
 * is never retried.
 */
import { classifyError, DataError, errorChain, statusOfChain, UnknownOutcomeError, type ErrorClass } from "@/platform/errors";
import { logAction } from "@/platform/requestLog";
import { requestGate, type RequestGate } from "./concurrency";
import {
  backoffMs, insideOwnRetry, legacyDeleteRetryDelay, legacyRetryDelay, MAX_NO_STATUS_TRIES, MAX_RETRY_WAIT_MS, realSleep, retryAfterMs,
  retryDelay, triesFor, type Sleeper,
} from "./retry";
import { GLOBAL_GATE, REQUEST_DEADLINES, RETRY_POLICY_V2 } from "./requestFlags";

export { classifyError, UnknownOutcomeError } from "@/platform/errors";
export type { ErrorClass } from "@/platform/errors";
export { backoffMs, THROTTLED_TRIES, TRANSIENT_TRIES } from "./retry";

export type RequestKind = "read" | "delete" | "patchAbsolute" | "create" | "bulk";

/** Deadlines: initial, uncalibrated (doc 21 section 4: to be set from the DEV capture's p99 plus a margin, probe P-5). */
export const READ_DEADLINE_MS = 60_000;
export const WRITE_DEADLINE_MS = 120_000;

/* ═══════════════════════════════════════════════════════════ deadline ══ */

/**
 * Runs `fn` and stops WAITING for it after `ms`. It cannot cancel the request: a late answer is dropped (its rejection is
 * handled, so nothing is reported unhandled). The timer is always cleared.
 *  - `"read"`: on expiry throws a `DataError` with no status, which `classifyError` calls transient and `isRetryable` accepts;
 *  - `"write"`: on expiry throws `UnknownOutcomeError` (the request may have landed; never retried, the caller reads the row back).
 * Prints one `[VSB]` warn line on expiry (the kind and the limit only).
 */
export function withDeadline<T>(
  fn: () => Promise<T>, ms: number, kind: "read" | "write", o: { label?: string; log?: (line: string) => void } = {},
): Promise<T> {
  const label = o.label ?? kind;
  const log = o.log ?? ((line: string) => logAction(line, "warn"));
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      log(`${label}: no answer within ${ms} ms${kind === "write" ? ", outcome unknown" : ""}`);
      reject(kind === "write" ? new UnknownOutcomeError(label, ms) : new DataError(`${label} timed out`, `no answer within ${ms} ms`));
    }, ms);
    const finish = (settle: () => void): void => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      settle();
    };
    new Promise<T>((started) => { started(fn()); }).then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

/* ═════════════════════════════════════════════════════════ the policy ══ */

export interface PolicyOptions {
  /** Test seam: the wait between tries (default: a real timer). */
  sleep?: Sleeper;
  /** Test seam: the jitter source, a number in [0, 1). */
  random?: () => number;
  /** Where the one line per retry goes (default `logAction(line, "warn")`). */
  log?: (line: string) => void;
  /** Overrides the switches of `requestFlags.ts` for this call (tests, and a caller that adopts them one by one). */
  flags?: { retryV2?: boolean; deadlines?: boolean; gate?: boolean };
  /** Test seam: the gate (default the global `requestGate`). */
  gate?: RequestGate;
  /** Overrides the deadline of this call, in ms. */
  deadlineMs?: number;
  /** Caps the tries in all (the first included) below the class's own number. */
  maxTries?: number;
  /** A plain name for the log lines and the timeout error (an entity set, an action). Never an id or a value. */
  label?: string;
}

let sleepOverride: Sleeper | null = null;
let randomOverride: (() => number) | null = null;

/** Test seam (T-11): the wait and the jitter every `sendWithPolicy` call uses when its caller passes none; `null` restores the real ones. */
export function setPolicyTestSeams(seams: { sleep?: Sleeper; random?: () => number } | null): void {
  sleepOverride = seams?.sleep ?? null;
  randomOverride = seams?.random ?? null;
}

/**
 * Whether a write-path call goes through the policy: its module switch (`explicit` from the caller wins over `flag`), and never
 * from inside a caller's own retry loop (`insideOwnRetry`), so a retry is never multiplied.
 */
export function policyOn(flag: boolean, explicit?: boolean): boolean {
  return (explicit ?? flag) && !insideOwnRetry();
}

/**
 * A page function whose every page request goes through the policy as a 'read' (T-11, CA-01 / CA-17): a 429, a 5xx or a network
 * failure on ONE page is tried again, and a page that keeps failing is returned UNCHANGED, so `fetchAll`'s `unwrap` reports it as
 * before. For reads made INSIDE a write path (an existence check, a verify): such a mutation is never retried by TanStack, and
 * wrapping a query read would multiply its retries. With `GLOBAL_GATE` on each page takes a read slot of the global gate.
 * `enabled` false (the module's switch) returns `page` itself.
 */
export function readPolicyPage<O, R>(label: string, page: (options: O) => Promise<R>, enabled: boolean): (options: O) => Promise<R> {
  return enabled ? (options) => sendWithPolicy("read", () => page(options), { label }) : page;
}

/** Whether the matrix retries `kind` after a failure of class `cls`. */
export function mayRetry(kind: RequestKind, cls: ErrorClass): boolean {
  if (cls === "throttled") return true;
  if (cls === "transient") return kind === "read" || kind === "delete" || kind === "patchAbsolute";
  return false;
}

const firstDefined = <T>(values: Iterable<T | undefined>): T | undefined => {
  for (const v of values) if (v !== undefined) return v;
  return undefined;
};

/** What `fn` returned when it failed without throwing: an `IOperationResult` with `success: false`. */
function failedResult(value: unknown): value is { success: false; error?: unknown } {
  return typeof value === "object" && value !== null && (value as { success?: unknown }).success === false;
}

/**
 * The wait before the next try, or `undefined` for "do not retry". `attempt` = tries made so far. Pure given `random`.
 * With `RETRY_POLICY_V2` off it falls back to the previous rules: bulk by `legacyRetryDelay`, delete by `legacyDeleteRetryDelay`,
 * every other kind never retried.
 */
export function policyDelay(
  kind: RequestKind, error: unknown, attempt: number,
  o: { random?: () => number; maxTries?: number; retryV2?: boolean; now?: number } = {},
): number | undefined {
  const now = o.now ?? Date.now();
  if (!(o.retryV2 ?? RETRY_POLICY_V2)) {
    if (kind === "bulk") return legacyRetryDelay(error, attempt, now);
    if (kind === "delete") return legacyDeleteRetryDelay(error, attempt, o.maxTries, now);
    return undefined;
  }
  // A bulk request has its own rule (429 only; a 503 only with `Retry-After`), shared with `generatorsBulk.ts`.
  if (kind === "bulk") {
    const wait = retryDelay(error, attempt, now, o.random);
    return wait === undefined || attempt >= (o.maxTries ?? Infinity) ? undefined : wait;
  }
  const cls = classifyError(error);
  if (!mayRetry(kind, cls)) return undefined;
  if (attempt >= Math.min(o.maxTries ?? Infinity, triesFor(cls))) return undefined;
  // An error with NO status may be deterministic (a thrown TypeError): one retry at most.
  if (statusOfChain(error) === undefined && attempt >= MAX_NO_STATUS_TRIES) return undefined;
  const header = firstDefined(errorChain(error).map((e) => retryAfterMs(e, now)));
  return Math.min(header ?? backoffMs({ cls, attempt, random: o.random }), MAX_RETRY_WAIT_MS);
}

/**
 * Sends one request through the policy. `fn` makes ONE attempt and returns an `IOperationResult` (or anything), or throws.
 *  - a failed result (`success: false`) or a throw is classified from its `status` (through the `cause` chain);
 *  - a retriable failure (see the matrix above) waits `backoffMs` OUTSIDE the gate and sends `fn` again, printing one
 *    `[VSB] ACTION` warn line (kind, class, status, try, wait; never an id or a value);
 *  - otherwise a thrown error is rethrown and a failed result is returned UNCHANGED, so a caller's `unwrap` behaves as before;
 *  - with `REQUEST_DEADLINES` each attempt is raced against a deadline (`withDeadline`); with `GLOBAL_GATE` each attempt takes a
 *    slot of the global gate (reads: the whole ceiling; every other kind: the write lane).
 */
export async function sendWithPolicy<T>(kind: RequestKind, fn: () => Promise<T>, opts: PolicyOptions = {}): Promise<T> {
  const retryV2 = opts.flags?.retryV2 ?? RETRY_POLICY_V2;
  const deadlines = opts.flags?.deadlines ?? REQUEST_DEADLINES;
  const gated = opts.flags?.gate ?? GLOBAL_GATE;
  const gate = opts.gate ?? requestGate;
  const log = opts.log ?? ((line: string) => logAction(line, "warn"));
  const sleep = opts.sleep ?? sleepOverride ?? realSleep;
  const random = opts.random ?? randomOverride ?? undefined;
  const isRead = kind === "read";
  const label = opts.label ?? kind;
  const deadlineMs = opts.deadlineMs ?? (isRead ? READ_DEADLINE_MS : WRITE_DEADLINE_MS);

  const timed = deadlines
    ? () => withDeadline(fn, deadlineMs, isRead ? "read" : "write", { label, log })
    : fn;
  const attemptOnce = gated ? () => (isRead ? gate.runRead(timed) : gate.runWrite(timed)) : timed;

  for (let attempt = 1; ; attempt += 1) {
    let value: T | undefined;
    let failure: unknown;
    let threw = false;
    try {
      value = await attemptOnce();
      if (!failedResult(value)) return value;
      failure = value.error;
    } catch (error) {
      threw = true;
      failure = error;
    }
    const wait = policyDelay(kind, failure, attempt, { random, maxTries: opts.maxTries, retryV2 });
    if (wait === undefined) {
      if (threw) throw failure;
      return value as T;
    }
    const cls = classifyError(failure);
    const status = statusOfChain(failure);
    const tries = Math.min(opts.maxTries ?? Infinity, triesFor(cls));
    log(
      `${label} (${kind}): try ${attempt} of ${tries} failed (${cls}${status === undefined ? ", no HTTP status" : `, HTTP ${status}`}); `
      + `trying again in ${wait} ms`,
    );
    await sleep(wait);
  }
}
