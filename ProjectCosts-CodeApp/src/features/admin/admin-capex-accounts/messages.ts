/**
 * User-facing text for a failed write: readable, never raw Dataverse detail.
 * The raw error is traced (shared `userErrorText`) so a failure stays diagnosable and
 * pre-fills "Report a problem".
 *
 * Only the CAPEX-specific part stays local: the `PartialStepError` composition (which step
 * failed, what landed). Everything else — permission, bulk partial / nothing saved, HTTP hints,
 * `DeleteBlockedError` shown verbatim — is the shared helper.
 */
import { permissionMessage } from "@/platform/privileges";
import { trace } from "@/platform/telemetry";
import { userErrorText } from "@/platform/userMessage";
import { RowWriteError } from "@/data/adminRowWrites";
import { DeleteBlockedError, PartialStepError } from "@/data/adminCapexAccounts";
import { OUT_OF_SCOPE } from "./rules";

/** A write refused because the user fails master's admin rule (`useAdminAccess`); nothing was sent. */
export class OutOfScopeError extends Error {
  constructor() {
    super(OUT_OF_SCOPE);
    this.name = "OutOfScopeError";
  }
}

export function describeWriteError(error: unknown, action: string): string {
  if (error instanceof OutOfScopeError) return OUT_OF_SCOPE;
  if (error instanceof PartialStepError) {
    trace("error", `Could not ${action}`, error);
    const denied = permissionMessage(error.cause, action);
    const partialBulk = error.cause instanceof RowWriteError && error.cause.partial
      ? " Part of this step was saved."
      : "";
    const done = error.completed.length
      ? ` Already completed: ${error.completed.join("; ")}.`
      : error.detail || partialBulk ? "" : " Nothing was changed.";
    // What landed inside the failed step itself, e.g. "1 of 3 subaccounts were set to Inactive".
    const detail = error.detail ? ` Within this step: ${error.detail}.` : "";
    return `${denied ?? `Could not ${action}.`} Failed step: ${error.failedStep}.${partialBulk}${detail}${done} You can retry.`;
  }

  return userErrorText(error, action, { businessErrors: [DeleteBlockedError] });
}
