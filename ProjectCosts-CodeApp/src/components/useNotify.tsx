/**
 * `useNotify()` — the one way to tell the user how a completed action went.
 *
 * Rules for every screen:
 *   - the outcome of a completed action (saved, deleted, partly failed) → `useNotify`;
 *   - a failed save inside an open panel stays an in-panel `MessageBar`;
 *   - persistent page states (duplicates, an unavailable table) stay page `MessageBar`s.
 *
 * Consistent intent, duration and politeness:
 *
 *   | call      | intent  | stays                     | screen reader        |
 *   |-----------|---------|---------------------------|----------------------|
 *   | success   | success | 5 s                       | polite               |
 *   | info      | info    | 5 s                       | polite               |
 *   | warning   | warning | 10 s                      | assertive            |
 *   | error     | error   | until dismissed           | assertive            |
 *   | progress  | info    | until its `done()` (WS-F) | polite               |
 *
 * Every outcome toast has a Dismiss button; warning/error may carry one action (e.g. "Reorder").
 * A `progress` toast is a running-work status, not an outcome: a spinner, no Dismiss.
 * Toasts render into `<AppToaster />` (mounted in `AppShell`); a test harness that renders a
 * screen without the shell must mount `<AppToaster />` itself to see them.
 */
import { useMemo } from "react";
import {
  Link, Spinner, Toast, ToastBody, ToastTitle, ToastTrigger, useToastController,
  type ToastIntent, type ToastPoliteness,
} from "@fluentui/react-components";
import { APP_TOASTER_ID } from "./AppToaster";

export interface NotifyAction {
  label: string;
  onClick: () => void;
  /** The action link's `data-testid` (rule 16); default `toast-action`. */
  testId?: string;
}

export interface NotifyOptions {
  /** A second line under the title. Never raw SDK/HTTP text. */
  detail?: string;
  /** One action link beside Dismiss. */
  action?: NotifyAction;
}

export interface ProgressOptions {
  /** The status's `data-testid` (rule 16). Its `aria-label` is the message. */
  testId: string;
}

export interface Notify {
  success(message: string, options?: NotifyOptions): void;
  info(message: string, options?: NotifyOptions): void;
  warning(message: string, options?: NotifyOptions): void;
  error(message: string, options?: NotifyOptions): void;
  /**
   * A status for work that is still running and may outlive the screen that started it (WS-F,
   * Add Cost from Table's background Save). It has a spinner and no Dismiss, and it stays until
   * the returned `done()` is called; calling `done()` twice is a no-op. Unlike the four intents
   * above, it is not the outcome of a completed action: the caller reports that separately.
   */
  progress(message: string, options: ProgressOptions): () => void;
  dismissAll(): void;
}

/** Duration (ms; -1 = until dismissed) and politeness per intent. */
export const NOTIFY_BEHAVIOUR: Record<ToastIntent, { timeout: number; politeness: ToastPoliteness }> = {
  success: { timeout: 5_000, politeness: "polite" },
  info: { timeout: 5_000, politeness: "polite" },
  warning: { timeout: 10_000, politeness: "assertive" },
  error: { timeout: -1, politeness: "assertive" },
};

/** `progress`: until `done()`, announced politely (it is not an outcome). */
const PROGRESS_BEHAVIOUR = { timeout: -1, politeness: "polite" } as const satisfies {
  timeout: number; politeness: ToastPoliteness;
};

/** Each `progress` toast gets its own id, so `done()` dismisses exactly that one. */
let progressSeq = 0;

export function useNotify(): Notify {
  const { dispatchToast, dismissToast, dismissAllToasts } = useToastController(APP_TOASTER_ID);

  return useMemo(() => {
    const show = (intent: ToastIntent) => (message: string, options: NotifyOptions = {}) => {
      const { timeout, politeness } = NOTIFY_BEHAVIOUR[intent];
      const action = options.action;
      dispatchToast(
        <Toast>
          <ToastTitle
            action={
              <span style={{ display: "inline-flex", gap: 12 }}>
                {action ? (
                  <ToastTrigger>
                    <Link onClick={action.onClick} aria-label={action.label} data-testid={action.testId ?? "toast-action"}>
                      {action.label}
                    </Link>
                  </ToastTrigger>
                ) : null}
                <ToastTrigger>
                  <Link aria-label={`Dismiss: ${message}`} data-testid="toast-dismiss">Dismiss</Link>
                </ToastTrigger>
              </span>
            }
          >
            {message}
          </ToastTitle>
          {options.detail ? <ToastBody>{options.detail}</ToastBody> : null}
        </Toast>,
        { intent, timeout, politeness },
      );
    };
    const progress = (message: string, options: ProgressOptions) => {
      progressSeq += 1;
      const toastId = `notify-progress-${progressSeq}`;
      dispatchToast(
        <Toast aria-label={message} data-testid={options.testId}>
          <ToastTitle media={<Spinner size="tiny" />}>{message}</ToastTitle>
        </Toast>,
        { toastId, intent: "info", ...PROGRESS_BEHAVIOUR },
      );
      let open = true;
      return () => {
        if (!open) return;
        open = false;
        dismissToast(toastId);
      };
    };
    return {
      success: show("success"),
      info: show("info"),
      warning: show("warning"),
      error: show("error"),
      progress,
      dismissAll: () => dismissAllToasts(),
    };
  }, [dispatchToast, dismissToast, dismissAllToasts]);
}
