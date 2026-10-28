/**
 * The shared "Unsaved data" leave guard (product owner X1, 20 Oct 2026: "build it as reusable
 * component and use it everywhere where the same condition applies").
 *
 * Canvas: five Project Management screens carry a `cmp_PopUp_Leave_<Screen>_Confirmation`
 * (`cmp_PopUp_Confirmation`): the header `OnLogoClick` and the left navigation `OnSelect` run
 *   `If(<screen is dirty>, UpdateContext({locLeave…ConfirmationDialog: true}), Navigate(…))`
 * and the dialog's `OnConfirm` performs the navigation the user asked for, `OnCancel` stays.
 * Here every in-app navigation away from the screen (the logo, the rail, the browser's back
 * button) is held by React Router's `useBlocker` while `when` is true; Confirm lets it through,
 * Cancel (or the ✕) keeps the user on the screen with the edits intact.
 *
 * The screen passes its own dirty condition (a pure function in its `rules.ts`) and its verbatim
 * canvas texts (`LEAVE_DIALOG` / `MSG` in `rules.ts`) — nothing screen-specific lives here.
 *
 * DIVERGENCE (new behaviour, D35): while dirty, closing or reloading the browser tab also asks
 * (the browser's own `beforeunload` prompt — its text cannot be set). The canvas player had no
 * equivalent: closing the tab dropped the edits silently.
 *
 * Needs a data router (`createHashRouter` in `app/Providers.tsx`); `useBlocker` throws without one.
 */
import { useCallback, useEffect } from "react";
import { useBlocker, type BlockerFunction } from "react-router-dom";
import { ConfirmDialog } from "./ConfirmDialog";
import { isLeaving, type LeaveDialogText } from "./leaveGuard";

export function UnsavedChangesGuard({ when, dialog, canvasLook = false }: {
  /** The screen's dirty condition — the canvas `If(<dirty>, <dialog>, <navigate>)` test. */
  when: boolean;
  dialog: LeaveDialogText;
  /** Opt-in: the canvas pop-up's look (dark scrim, flat card, 120 px Yes, no footer rule). */
  canvasLook?: boolean;
}) {
  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) => when && isLeaving(currentLocation, nextLocation),
    [when],
  );
  const blocker = useBlocker(shouldBlock);

  // The edits were saved or reset while the dialog was up: nothing is left to lose.
  useEffect(() => {
    if (!when && blocker.state === "blocked") blocker.reset();
  }, [when, blocker]);

  useEffect(() => {
    if (!when) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Older engines show the prompt only when returnValue is set.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [when]);

  return (
    <ConfirmDialog
      open={blocker.state === "blocked"}
      title={dialog.title}
      description={dialog.description}
      confirmText={dialog.confirm}
      cancelText={dialog.cancel}
      canvasFooter={canvasLook}
      footerDivider={!canvasLook}
      darkScrim={canvasLook}
      {...(canvasLook ? { confirmWidth: 120 } : {})}
      onConfirm={() => blocker.proceed?.()}
      onCancel={() => blocker.reset?.()}
    />
  );
}
