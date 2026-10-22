/**
 * Turns a failed write into the text the user sees. The canvas built error texts but never
 * showed them; here every failure is visible.
 *
 * Uses the shared `dataErrorIn` to find a 403 anywhere in the cause chain. The rest stays
 * local on purpose: this screen still appends the Dataverse detail to its messages, and the
 * shared `userErrorText` never does. Switching is an open product decision; if it is accepted,
 * `errorText` becomes `userErrorText(error, action, { lead: \`Error: ${failure}\`,
 * businessErrors: [TaskStatusNotSetError, TaskCreatedIdUnknownError] })` plus the renumber branch.
 */
import { RowWriteError } from "@/data/adminRowWrites";
import { RenumberAfterDeleteError, TaskCreatedIdUnknownError, TaskStatusNotSetError } from "@/data/adminDefaultChecklists";
import { permissionMessage } from "@/platform/privileges";
import { dataErrorIn } from "@/platform/userMessage";
import { isRecordGone } from "@/features/shared/recordGone";

/** Shown when a write is attempted without the admin rule (the screen is read-only then). */
export const OUT_OF_SCOPE_MESSAGE =
  "This country is outside your editable country scope, so the checklist is read-only.";

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
  if (error instanceof RowWriteError) {
    return error.partial
      ? `Error: ${failure} Some items were already saved, so the order may be out of date. (${detail(error.cause)})`
      : `Error: ${failure} ${detail(error.cause)}`;
  }
  // A row deleted meanwhile reads as plain text, not the
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
