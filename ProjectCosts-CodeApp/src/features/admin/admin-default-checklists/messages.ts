/**
 * Turns a failed write into the text the user sees.
 *
 * SOURCE DEFECT (D18 h): the canvas built its error texts into `locAdminLoadingDialogText` but the
 * screen has no pop-up to show them, so every failure was silent. Here every failure is visible.
 *
 * DIVERGENCE (wording): the canvas texts are `$"Error: Checklist item could not be saved. Internal
 * error: originated on {FirstError.Source}. Message: {FirstError.Message}
 * {FirstError.Details.HttpResponse}"` (`pcf_but_Admin_Checklist_Form_Buttons_Save.OnChange`,
 * L1352) and the same shape for the Completion Date (`ico_EnablelCompletionDate_….OnChange`,
 * L622). The SDK has no `FirstError.Source`, so here the lead ("Error: <failure>") is followed by
 * the Dataverse message only; the permission, partial-write, renumber and record-gone variants
 * below are NEW.
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

/**
 * NEW — no canvas equivalent (the canvas screen has no permission check). Shown when a write is
 * attempted without the admin rule (`useAdminAccess`); the screen is read-only then. The wording
 * still speaks of a "country scope" from the pre-port `canEditScope` gate, although the rule
 * applied now is the admin rule only — an open wording point, not changed here.
 */
export const OUT_OF_SCOPE_MESSAGE =
  "This country is outside your editable country scope, so the checklist is read-only.";

function detail(error: unknown): string {
  const data = dataErrorIn(error);
  if (data) return data.message;
  return error instanceof Error ? error.message : String(error);
}

/**
 * @param action  completes "You do not have permission to …"
 * @param failure the error lead. "Checklist item could not be saved." (L1352) and "Completion
 *                Date could not be changed." (L622) are the canvas's own, verbatim; the status,
 *                delete and reorder leads are NEW (the canvas sets no error text for them).
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
  // A row deleted meanwhile reads as plain text, not the entity-set name and GUID. Every write
  // hook invalidates the tab's tasks on failure, so the list refreshes.
  if (isRecordGone(error)) return `Error: ${failure} ${RECORD_GONE_TASK_TEXT}`;
  return `Error: ${failure} ${detail(error)}`;
}

/** NEW — no canvas equivalent: the guarded update found the row deleted by someone else. */
export const RECORD_GONE_TASK_TEXT =
  "This item no longer exists. It may have been deleted by someone else; the list has been refreshed.";

/** NEW — no canvas equivalent: the load-failure text (CONVENTIONS rule 19), with the Dataverse detail. */
export function loadErrorText(error: unknown, what: string): string {
  return `${what} could not be loaded. ${detail(error)}`;
}
