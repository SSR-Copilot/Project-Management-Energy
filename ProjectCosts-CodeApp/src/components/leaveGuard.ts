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

/** The query without its `tab` key, so a tab switch inside a screen compares equal. */
function searchWithoutTab(search: string): string {
  const params = new URLSearchParams(search);
  params.delete("tab");
  params.sort();
  return params.toString();
}

/**
 * True when a navigation actually leaves the current screen. A change to the hash fragment alone,
 * a navigation to the very same path + query, or only a different `?tab=` (switching tabs on the
 * same screen, PO 27 Oct 2026: the prompt is for the side navigation) is not a leave.
 */
export function isLeaving(
  current: { pathname: string; search: string },
  next: { pathname: string; search: string },
): boolean {
  return current.pathname !== next.pathname
    || searchWithoutTab(current.search) !== searchWithoutTab(next.search);
}
