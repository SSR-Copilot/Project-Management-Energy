/**
 * The wording and close reasons of a panel's "Discard changes?" confirmation (`useDiscardGuard`,
 * `discardGuard.tsx`; used by `FormPanel`). Kept apart from the hook file so that file exports hooks only.
 *
 * Not to be confused with the route-leave guard: leaving a screen with unsaved edits is
 * `UnsavedChangesGuard` + `leaveGuard.ts` (React Router `useBlocker`).
 */

/** Texts of a "discard?" confirmation. */
export interface DiscardText {
  title: string;
  description: string;
  confirmText: string;
  cancelText: string;
  /** Danger appearance on the confirm button (Milestones); Contracts uses the dismiss icon. */
  destructive?: boolean;
  /** Confirm button icon; default `"dismiss"` (Contracts). Milestones used `"checkmark"`. */
  confirmIcon?: "checkmark" | "delete" | "dismiss" | "none";
}

/**
 * Why a panel is being closed. ✕, Escape and the backdrop pass `"dismiss"`; the footer
 * Cancel passes `"cancel"`; a screen may name its own reasons (Contracts: `"scope"`, the
 * country / technology changed under the open panel).
 */
export type CloseReason = "dismiss" | "cancel" | (string & {});

/** Closing a dirty panel (Contracts / Milestones wording). */
export const DISCARD_TEXT: DiscardText = {
  title: "Discard changes?",
  description: "You have unsaved changes. Do you want to discard them?",
  confirmText: "Discard",
  cancelText: "Keep editing",
};
