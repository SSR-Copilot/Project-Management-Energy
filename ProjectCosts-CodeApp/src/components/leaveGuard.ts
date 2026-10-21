/** The pure half of `UnsavedChangesGuard` (kept apart so the component file exports components only). */

/** The canvas `cmp_PopUp_Confirmation` texts of a screen's leave dialog — verbatim, from its rules.ts. */
export interface LeaveDialogText {
  /** `Title` — "Unsaved data" on every canvas screen that has one. */
  title: string;
  /** `Description`. */
  description: string;
  /** `ConfirmButtonText` — "Yes". */
  confirm: string;
  /** `CancelButtonText` — "Cancel". */
  cancel: string;
}

/**
 * True when a navigation actually leaves the current location. A change to the hash fragment
 * alone (none in this app today) or a navigation to the very same path + query is not a leave.
 */
export function isLeaving(
  current: { pathname: string; search: string },
  next: { pathname: string; search: string },
): boolean {
  return current.pathname !== next.pathname || current.search !== next.search;
}
