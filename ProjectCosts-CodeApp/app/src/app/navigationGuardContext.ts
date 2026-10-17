/**
 * The in-app navigation guard's contract (M7). The provider lives in
 * `components/NavigationGuardProvider.tsx` (mounted by `AppShell`); the hooks in
 * `app/unsavedChanges.tsx`.
 *
 * LIMITATION — browser Back / Forward. The app uses `HashRouter`, not a data router, so
 * react-router's `useBlocker` is unavailable and a hash change cannot be cancelled. This guard
 * therefore covers the app's own links (the settings rail, the header logo / back arrow and
 * the badge's Application Settings row) and `beforeunload` covers reload / tab close. Browser
 * Back while a panel is dirty still drops the draft; closing that hole needs the
 * `createHashRouter` + `RouterProvider` migration (05-gap-analysis M7 step 3), deliberately not
 * done here. Overlay drawers are modal, so the in-app links are unreachable while a panel is
 * open anyway; the guard matters for page-level drafts and for a future non-modal editor.
 */
import { createContext } from "react";

/** Texts of a "discard / leave?" confirmation. */
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
 * Why a panel is being closed (E1c). ✕, Escape and the backdrop pass `"dismiss"`; the footer
 * Cancel passes `"cancel"`; a screen may name its own reasons (Contracts: `"scope"`, the
 * country / technology changed under the open panel).
 */
export type CloseReason = "dismiss" | "cancel" | (string & {});

/** Closing a dirty panel (Contracts / Milestones D-UI-4 wording). */
export const DISCARD_TEXT: DiscardText = {
  title: "Discard changes?",
  description: "You have unsaved changes. Do you want to discard them?",
  confirmText: "Discard",
  cancelText: "Keep editing",
};

/** Navigating away from a screen with unsaved changes. */
export const LEAVE_TEXT: DiscardText = {
  title: "Leave this page?",
  description: "You have unsaved changes. If you leave this page, they will be lost.",
  confirmText: "Leave",
  cancelText: "Stay",
};

export interface NavigationGuardApi {
  /** Registers (or, with `null`, removes) one screen's blocker. */
  setBlocker(id: string, blocker: { text?: Partial<DiscardText> } | null): void;
  /** True while any registered blocker is active. */
  isBlocking(): boolean;
  /** Runs `proceed` now, or after the user confirms leaving when a blocker is active. */
  guard(proceed: () => void): void;
}

export const NavigationGuardContext = createContext<NavigationGuardApi | null>(null);
