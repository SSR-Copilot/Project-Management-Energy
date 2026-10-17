/**
 * One way to turn a failed read or write into user-facing text (M11, gap C9).
 *
 * Six screens each wrapped `permissionMessage` differently (`checklist-settings/messages.ts
 * errorText`, `project-gates/rules.ts friendlyError`, `capex-accounts/messages.ts
 * describeWriteError`, `milestones/Screen.tsx reasonOf`, `costs/rules.ts errorText`,
 * `contracts/messages.ts`). This keeps their common rules in one place:
 *
 *   - 401 / 403 → the shared `permissionMessage` wording, unchanged.
 *   - 404, 412, 429, 5xx, network → a short hint after the lead sentence.
 *   - `BulkWriteError` → "only part … saved" / "nothing was saved" (CAPEX / Costs wording).
 *   - A screen's own business errors (`businessErrors`) show their `.message` verbatim — they are
 *     written for users (e.g. Costs' `OpexRuleError`, CAPEX's `DeleteBlockedError`).
 *   - NEVER raw SDK / HTTP text, unless the caller opts into `serverReason` (a plug-in's own
 *     short message, Costs DR-15), and even then JSON / HTML / long bodies are dropped.
 *
 * The raw error is traced (`trace("error", …)`) so it stays diagnosable and pre-fills the
 * "Report a problem" panel; pass `trace: false` to skip.
 */
import { DataError } from "./errors";
import { permissionMessage } from "./privileges";
import { trace } from "./telemetry";

/** The innermost `DataError` in an error's `cause` chain (depth 4), so a 403 inside a bulk is found. */
export function dataErrorIn(error: unknown): DataError | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (current instanceof DataError) return current;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * The first `BulkWriteError` (`data/bulkWrite.ts`) in the cause chain. Matched by shape, not
 * `instanceof`, so the platform layer does not import the data layer.
 */
function bulkErrorIn(error: unknown): { partial: boolean } | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (current instanceof Error && current.name === "BulkWriteError"
      && typeof (current as { partial?: unknown }).partial === "boolean") {
      return current as Error & { partial: boolean };
    }
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/** HTTP status of the innermost `DataError`, if the SDK gave one. */
export function httpStatusOf(error: unknown): number | undefined {
  return dataErrorIn(error)?.status;
}

/** A fetch that never reached the server (browser `TypeError: Failed to fetch`, offline). */
function isNetworkFailure(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (current instanceof TypeError && /fetch|network/i.test(current.message)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** The hints, exported so screen tests can assert them without copying strings. */
export const ERROR_HINT = {
  notFound: "The record no longer exists. Refresh and try again.",
  conflict: "Someone else changed this record. Refresh and try again.",
  throttled: "The service is busy. Wait a moment and try again.",
  server: "The service had a problem. Please try again.",
  network: "Check your connection and try again.",
  partial: "Only part of the change was saved. Reopen and save again.",
  nothingSaved: "Nothing was saved. Please try again.",
  retry: "Please try again.",
} as const;

export interface UserErrorOptions {
  /**
   * The lead sentence. Default `Could not <action>.` Screens with canvas wording pass their own,
   * e.g. `"The standard cost could not be saved."`.
   */
  lead?: string;
  /** Error classes whose `.message` is user text and is shown as-is. */
  businessErrors?: readonly (abstract new (...args: never[]) => Error)[];
  /** Append a short, plain server reason (a plug-in message). Default false. */
  serverReason?: boolean;
  /** `false` skips the trace. Default traces at "error". */
  trace?: false | "warning" | "error";
}

function cleanServerReason(error: unknown): string | undefined {
  const data = dataErrorIn(error);
  const cause = data ? data.cause : error;
  let message: unknown;
  if (cause instanceof Error) message = cause.message;
  else if (typeof cause === "string") message = cause;
  else if (cause && typeof cause === "object") message = (cause as Record<string, unknown>)["message"];
  if (typeof message !== "string") return undefined;
  const text = message.trim();
  if (text === "" || /^[{[<]/.test(text) || text.length > 300) return undefined;
  return text.endsWith(".") ? text : `${text}.`;
}

/** The hint for an error, without the lead. */
export function errorHint(error: unknown): string {
  const bulk = bulkErrorIn(error);
  if (bulk) return bulk.partial ? ERROR_HINT.partial : ERROR_HINT.nothingSaved;
  const status = httpStatusOf(error);
  if (status === 404) return ERROR_HINT.notFound;
  if (status === 412) return ERROR_HINT.conflict;
  if (status === 429) return ERROR_HINT.throttled;
  if (status !== undefined && status >= 500) return ERROR_HINT.server;
  if (isNetworkFailure(error)) return ERROR_HINT.network;
  return ERROR_HINT.retry;
}

/**
 * The text for a failed action. `action` completes both "You do not have permission to …" and
 * the default lead "Could not …." — e.g. `"save checklist items"`.
 */
export function userErrorText(error: unknown, action: string, options: UserErrorOptions = {}): string {
  if (options.trace !== false) trace(options.trace ?? "error", `Could not ${action}`, error);

  const denied = permissionMessage(dataErrorIn(error), action);
  if (denied) return denied;

  if (options.businessErrors?.some((cls) => error instanceof cls)) return (error as Error).message;

  const lead = options.lead ?? `Could not ${action}.`;
  const hint = errorHint(error);
  if (options.serverReason && hint === ERROR_HINT.retry) {
    const reason = cleanServerReason(error);
    if (reason) return `${lead} ${reason}`;
  }
  return `${lead} ${hint}`;
}

/** The text for a failed load: "<what> could not be loaded. <hint>" (permission: "read this data"). */
export function userLoadErrorText(error: unknown, what: string, options: Pick<UserErrorOptions, "trace"> = {}): string {
  return userErrorText(error, "read this data", { ...options, lead: `${what} could not be loaded.` });
}

/**
 * E12 — the short reason under a lead sentence the screen already wrote (Milestones `reasonOf`,
 * CAPEX Accounts' load / refresh bars): the permission wording for a 401 / 403 on the error
 * itself, else the screen's `fallback`, else the hint. Not traced (the caller decides).
 * Unlike `userErrorText` it does not search the `cause` chain for the 403 — exactly what
 * Milestones does today.
 */
export function userReason(error: unknown, action: string, fallback?: string): string {
  return permissionMessage(error, action) ?? fallback ?? errorHint(error);
}