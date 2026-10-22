/**
 * User-safe feedback text: the raw Dataverse message is traced, never shown. A 403
 * becomes `permissionMessage`; a save failure names the phase that failed. Every text here is
 * NEW — no canvas equivalent — except where a comment cites the canvas.
 *
 * DIVERGENCE: `ico_AdminContracts_Save.OnChange` reports any failure as
 * `Notify("Error saving Contract: " & FirstError.Message, NotificationType.Error)` — the raw
 * Dataverse message. Here the message names the failed phase (ownership check, parent, unlink,
 * link) in plain words, and the raw message only goes to the trace.
 * DIVERGENCE: the canvas Save has no ownership re-check and no retry. Here the save re-reads the
 * DevCo links first (an account another contract claimed meanwhile is dropped from the selection,
 * `check` phase), and a save that wrote the parent but not every link can be retried from the
 * still-open panel (`removals` / `additions` phases).
 */
import {
  ContractSaveError, DevCoTableUnavailableError, OwnershipConflictError,
} from "@/data/adminContract";
import { DataError, RecordGoneError } from "@/platform/errors";
import { permissionMessage } from "@/platform/privileges";
import { trace } from "@/platform/telemetry";

/**
 * The edited contract was deleted meanwhile; the guarded update wrote nothing. The
 * Screen then closes the panel and the list refetches on settle, so the text says so.
 */
export const CONTRACT_GONE_MESSAGE = "This contract no longer exists. It may have been deleted by another user. The list has been refreshed.";

export function saveErrorMessage(
  error: unknown, accountNumber: (accountId: string) => string | undefined,
): string {
  trace("error", "Saving a BoP standard contract failed", error);
  if (!(error instanceof ContractSaveError)) {
    return permissionMessage(error, "save standard contracts") ?? "The contract could not be saved. Please try again.";
  }
  const cause = error.cause;
  const denied = permissionMessage(cause, "save standard contracts");
  switch (error.phase) {
    case "check":
      if (cause instanceof OwnershipConflictError) {
        const numbers = cause.accountIds.map((id) => accountNumber(id) ?? id).join(", ");
        // The Screen removes these accounts from the selection, so a retry can succeed.
        return `Account ${numbers} was just linked to another standard contract and has been ` +
          "removed from your selection. Review the DevCo accounts and save again.";
      }
      if (cause instanceof DevCoTableUnavailableError) {
        return "The contract was not saved: DevCo account links are not available in this app yet.";
      }
      return denied ?? "The contract was not saved: the current DevCo account links could not be read. Please try again.";
    case "parent":
      if (cause instanceof RecordGoneError) return CONTRACT_GONE_MESSAGE;
      return denied ?? "The contract could not be saved. Please try again.";
    case "removals":
      return denied ?? "The contract was saved, but some DevCo accounts could not be unlinked. Select Save to retry.";
    case "additions":
      return denied ?? "The contract was saved, but some DevCo accounts were not linked. Select Save to retry.";
  }
}

/** The delete found the row already gone (404) — treated as done; the list refetches. */
export const CONTRACT_ALREADY_DELETED_MESSAGE = "This contract was already deleted by another user. The list has been refreshed.";

/**
 * SOURCE DEFECT (fixed): `cmp_PopUp_Confirmation_Delete_Contract_Or_Period_1.OnConfirm` calls
 * `Remove('BoP Contracts Standard Assumptions', locSelectedBoPStandardContract)` with no `IfError`,
 * so a refused delete closed the spinner as if it had worked. Here the failure is shown and the
 * card stays.
 */
export function deleteErrorMessage(error: unknown): string {
  trace("error", "Deleting a BoP standard contract failed", error);
  if (error instanceof DataError && error.status === 404) return CONTRACT_ALREADY_DELETED_MESSAGE;
  return permissionMessage(error, "delete standard contracts") ??
    "The contract could not be deleted. Dataverse refused the request — it may still be in use. " +
    "Try again or contact your administrator.";
}

export function openErrorMessage(error: unknown): string {
  trace("error", "Opening a BoP standard contract for edit failed", error);
  if (error instanceof DevCoTableUnavailableError) {
    return "The contract cannot be edited: DevCo account links are not available in this app yet.";
  }
  return permissionMessage(error, "open this contract") ?? "The contract could not be loaded. Please try again.";
}

export function loadErrorText(error: unknown): string {
  if (error instanceof DevCoTableUnavailableError) {
    return "The DevCo account link table is not available in this app yet, so DevCo costs cannot be shown or changed.";
  }
  return permissionMessage(error, "read this data") ?? "The data could not be loaded.";
}
