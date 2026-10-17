/**
 * Turns a failed write into the text the user sees (FR-1 AC-1.2, FR-12, AC-11.3). The canvas
 * built error texts but never showed them (D-1); here every failure is visible.
 *
 * Uses the shared `dataErrorIn` (M11) to find a 403 anywhere in the cause chain. The rest stays
 * local on purpose: this screen still appends the Dataverse detail to its messages, and the
 * shared `userErrorText` never does. Switching is open product decision 5.2-6 (shared build log);
 * when it is accepted, `errorText` becomes `userErrorText(error, action, { lead: \`Error: ${failure}\`,
 * businessErrors: [TaskStatusNotSetError, TaskCreatedIdUnknownError] })` plus the renumber branch.
 */
import { BulkWriteError } from "@/data/bulkWrite";
import { RenumberAfterDeleteError, TaskCreatedIdUnknownError, TaskStatusNotSetError } from "@/data/settings/checklist-settings";
import { permissionMessage } from "@/platform/privileges";
import { dataErrorIn } from "@/platform/userMessage";
import { isRecordGone } from "@/features/shared/recordGone";

function detail(error: unknown): string {
  const data = dataErrorIn(error);
  if (data) return data.message;
  return error instanceof Error ? error.message : String(error);
}

/**
 * @param action  completes "You do not have permission to …"
 * @param failure the canvas' own error lead, e.g. "Checklist item could not be saved."
 */
export function errorText(error: unknown, action: string, failure: string): string {
  const forbidden = permissionMessage(dataErrorIn(error), action);
  if (forbidden) return forbidden;
  if (error instanceof TaskStatusNotSetError || error instanceof TaskCreatedIdUnknownError) return error.message;
  if (error instanceof RenumberAfterDeleteError) {
    return `${error.message} Open Reorder to check the order. (${detail(error.cause)})`;
  }
  if (error instanceof BulkWriteError) {
    return error.partial
      ? `Error: ${failure} Some items were already saved, so the order may be out of date. (${detail(error.cause)})`
      : `Error: ${failure} ${detail(error.cause)}`;
  }
  // Parity R3 GAP-R3-1: a row deleted meanwhile (V-1 guard) reads as plain text, not the
  // entity-set name and GUID. Every write hook invalidates the tab's tasks on failure.
  if (isRecordGone(error)) return `Error: ${failure} ${RECORD_GONE_TASK_TEXT}`;
  return `Error: ${failure} ${detail(error)}`;
}

export const RECORD_GONE_TASK_TEXT =
  "This item no longer exists. It may have been deleted by someone else; the list has been refreshed.";

/** Load-failure text; a table that is not registered yet reads as "not available". */
export function loadErrorText(error: unknown, what: string): string {
  return `${what} could not be loaded. ${detail(error)}`;
}
