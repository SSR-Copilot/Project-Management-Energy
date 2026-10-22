/**
 * Panel-level unsaved-changes hooks.
 *
 *   useDiscardGuard   Cancel / ✕ / Escape / backdrop on a dirty panel asks "Discard changes?"
 *                     (generalises Contracts' and Milestones' local dialogs). `FormPanel`'s
 *                     `dirty` prop uses it, so most screens never call it directly.
 *   useBeforeUnload   the browser's own prompt on reload / tab close while dirty, with
 *                     `returnValue` set (older Chromium and Safari need it — seen on Milestones).
 *
 * Leaving a SCREEN with unsaved edits (the header logo, the left navigation, browser Back) is
 * `UnsavedChangesGuard` (React Router `useBlocker`), not this file.
 */
import { useCallback, useEffect, useState, type ReactNode, type SyntheticEvent } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { DISCARD_TEXT, type CloseReason, type DiscardText } from "./discardText";

const onBeforeUnload = (e: BeforeUnloadEvent) => {
  e.preventDefault();
  // Older Chromium and Safari show the prompt only when `returnValue` is set.
  e.returnValue = "";
};
/** How many `useBeforeUnload` callers are active right now. */
let beforeUnloadUsers = 0;

/**
 * Registers `beforeunload` while `active`.
 *
 * `FormPanel` calls this for every dirty open panel, and Milestones / Contracts also call it
 * themselves. All callers share ONE window listener (reference-counted), so a screen and its
 * panel never stack two handlers — one registration, one prompt.
 */
export function useBeforeUnload(active: boolean): void {
  useEffect(() => {
    if (!active || typeof window === "undefined") return undefined;
    if (beforeUnloadUsers === 0) window.addEventListener("beforeunload", onBeforeUnload);
    beforeUnloadUsers += 1;
    return () => {
      beforeUnloadUsers -= 1;
      if (beforeUnloadUsers === 0) window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [active]);
}

export interface DiscardGuardOptions {
  dirty: boolean;
  /** Closes the panel / drops the draft. Called directly when not dirty. Receives the reason. */
  onDiscard: (reason: CloseReason) => void;
  text?: Partial<DiscardText>;
  /** While true (a save in flight), `requestClose` does nothing. */
  disabled?: boolean;
  /**
   * E1c (opt-in): choose the prompt per close request. Returning `null` closes at once; a text
   * (merged over `DISCARD_TEXT` and `text`) asks first. When given, it REPLACES the `dirty`
   * test, so the caller decides everything. Without it the guard is the two-way
   * clean-closes / dirty-asks guard it always was.
   */
  prompt?: (reason: CloseReason) => Partial<DiscardText> | null;
  /** E1c: the prompt was answered "keep editing" (or ✕ / Escape on the prompt). */
  onPromptCancel?: (reason: CloseReason) => void;
}

export interface DiscardGuard {
  /**
   * Wire to Cancel, ✕, Escape and backdrop. The reason only matters with `prompt`; anything that
   * is not a string (a click event, when wired straight to `onClick`) counts as `"cancel"`.
   */
  requestClose: (reason?: CloseReason | SyntheticEvent) => void;
  /** Render once, next to the panel. */
  dialog: ReactNode;
  /** True while the confirmation is showing. */
  confirming: boolean;
}

/** `requestClose` is often passed straight to `onClick`; a click event is not a reason. */
const asReason = (reason: unknown): CloseReason => (typeof reason === "string" ? reason : "cancel");

export function useDiscardGuard({
  dirty, onDiscard, text, disabled = false, prompt, onPromptCancel,
}: DiscardGuardOptions): DiscardGuard {
  const [confirming, setConfirming] = useState<{ reason: CloseReason; text?: Partial<DiscardText> } | null>(null);
  const requestClose = useCallback((raw?: CloseReason | SyntheticEvent) => {
    if (disabled) return;
    const reason = asReason(raw);
    if (prompt) {
      const asked = prompt(reason);
      if (asked === null) onDiscard(reason);
      else setConfirming({ reason, text: asked });
      return;
    }
    if (dirty) setConfirming({ reason });
    else onDiscard(reason);
  }, [dirty, disabled, onDiscard, prompt]);
  const t = { ...DISCARD_TEXT, ...text, ...confirming?.text };
  const dialog = (
    <ConfirmDialog
      open={confirming !== null}
      title={t.title}
      description={t.description}
      confirmText={t.confirmText}
      cancelText={t.cancelText}
      destructive={t.destructive === true}
      confirmIcon={t.confirmIcon ?? "dismiss"}
      onConfirm={() => { const reason = confirming?.reason ?? "cancel"; setConfirming(null); onDiscard(reason); }}
      onCancel={() => {
        const reason = confirming?.reason ?? "cancel";
        setConfirming(null);
        onPromptCancel?.(reason);
      }}
    />
  );
  return { requestClose, dialog, confirming: confirming !== null };
}
