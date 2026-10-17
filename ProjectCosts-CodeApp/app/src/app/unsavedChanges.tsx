/**
 * Unsaved-changes guards (M7): panel dismissal, reload / tab close, and in-app navigation.
 *
 *   useDiscardGuard   Cancel / ✕ / Escape / backdrop on a dirty panel asks "Discard changes?"
 *                     (generalises Contracts' and Milestones' local dialogs). `FormPanel`'s
 *                     `dirty` prop uses it, so most screens never call it directly.
 *   useBeforeUnload   the browser's own prompt on reload / tab close while dirty, with
 *                     `returnValue` set (older Chromium and Safari need it — Milestones gap B6).
 *   useUnsavedChanges both of the above for a page-level draft: `beforeunload` plus the in-app
 *                     navigation guard (settings rail, header logo / back arrow).
 *   useNavigationGuard / useGuardedNavigate  for code that navigates on its own.
 *
 * See `navigationGuardContext.ts` for the browser Back / Forward limitation (no data router).
 */
import { useCallback, useContext, useEffect, useId, useState, type ReactNode, type SyntheticEvent } from "react";
import { useNavigate, type To } from "react-router-dom";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DISCARD_TEXT, NavigationGuardContext, type CloseReason, type DiscardText } from "./navigationGuardContext";

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
 * Parity round 1, G-1: `FormPanel` calls this for every dirty open panel, and Milestones /
 * Contracts also call it themselves. All callers share ONE window listener (reference-counted),
 * so a screen and its panel never stack two handlers — one registration, one prompt.
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

/**
 * A page-level draft: `beforeunload` plus the in-app navigation guard while `dirty`.
 * `text` overrides the "Leave this page?" dialog's wording.
 */
export function useUnsavedChanges(dirty: boolean, options: { text?: Partial<DiscardText> } = {}): void {
  useBeforeUnload(dirty);
  const api = useContext(NavigationGuardContext);
  const id = useId();
  const { text } = options;
  useEffect(() => {
    if (!api) return undefined;
    api.setBlocker(id, dirty ? { ...(text ? { text } : {}) } : null);
    return () => api.setBlocker(id, null);
  }, [api, id, dirty, text]);
}

/**
 * `guard(proceed)` runs `proceed` now, or after the user confirms leaving when a screen has
 * registered unsaved changes. Without a `NavigationGuardProvider` (unit tests, screens rendered
 * outside `AppShell`) it simply runs `proceed`.
 */
export function useNavigationGuard(): { guard: (proceed: () => void) => void; isBlocking: () => boolean } {
  const api = useContext(NavigationGuardContext);
  const guard = useCallback((proceed: () => void) => {
    if (api) api.guard(proceed);
    else proceed();
  }, [api]);
  const isBlocking = useCallback(() => api?.isBlocking() ?? false, [api]);
  return { guard, isBlocking };
}

/** `navigate(to)` behind the navigation guard. */
export function useGuardedNavigate(): (to: To, options?: { replace?: boolean }) => void {
  const navigate = useNavigate();
  const { guard } = useNavigationGuard();
  return useCallback((to, options) => guard(() => navigate(to, options)), [guard, navigate]);
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
