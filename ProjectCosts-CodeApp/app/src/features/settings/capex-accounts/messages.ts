/**
 * User-facing text for a failed write (FR-14 AC-14.2): readable, never raw Dataverse detail.
 * The raw error is traced (shared `userErrorText`, M11) so a failure stays diagnosable and
 * pre-fills "Report a problem".
 *
 * Only the CAPEX-specific part stays local: the `PartialStepError` composition (which step
 * failed, what landed). Everything else — permission, bulk partial / nothing saved, HTTP hints,
 * `DeleteBlockedError` shown verbatim — is the shared helper.
 */
import { permissionMessage } from "@/platform/privileges";
import { trace } from "@/platform/telemetry";
import { userErrorText } from "@/platform/userMessage";
import { BulkWriteError } from "@/data/bulkWrite";
import { DeleteBlockedError, PartialStepError } from "@/data/settings/capex-accounts";

export function describeWriteError(error: unknown, action: string): string {
  if (error instanceof PartialStepError) {
    trace("error", `Could not ${action}`, error);
    const denied = permissionMessage(error.cause, action);
    const partialBulk = error.cause instanceof BulkWriteError && error.cause.partial
      ? " Part of this step was saved."
      : "";
    const done = error.completed.length
      ? ` Already completed: ${error.completed.join("; ")}.`
      : error.detail || partialBulk ? "" : " Nothing was changed.";
    // What landed inside the failed step itself (gap G5), e.g. "1 of 3 subaccounts were set to Inactive".
    const detail = error.detail ? ` Within this step: ${error.detail}.` : "";
    return `${denied ?? `Could not ${action}.`} Failed step: ${error.failedStep}.${partialBulk}${detail}${done} You can retry.`;
  }

  return userErrorText(error, action, { businessErrors: [DeleteBlockedError] });
}
