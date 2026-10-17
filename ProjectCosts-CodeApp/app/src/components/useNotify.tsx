/**
 * `useNotify()` — the one way to tell the user how a completed action went.
 *
 * Rules for every screen (05-gap-analysis M5):
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
 *
 * Every toast has a Dismiss button; warning/error may carry one action (e.g. "Reorder").
 * Toasts render into `<AppToaster />` (mounted in `AppShell`); a test harness that renders a
 * screen without the shell must mount `<AppToaster />` itself to see them.
 */
import { useMemo } from "react";
import {
  Link, Toast, ToastBody, ToastTitle, ToastTrigger, useToastController,
  type ToastIntent, type ToastPoliteness,
} from "@fluentui/react-components";
import { APP_TOASTER_ID } from "./AppToaster";

export interface NotifyAction {
  label: string;
  onClick: () => void;
}

export interface NotifyOptions {
  /** A second line under the title. Never raw SDK/HTTP text. */
  detail?: string;
  /** One action link beside Dismiss. */
  action?: NotifyAction;
}

export interface Notify {
  success(message: string, options?: NotifyOptions): void;
  info(message: string, options?: NotifyOptions): void;
  warning(message: string, options?: NotifyOptions): void;
  error(message: string, options?: NotifyOptions): void;
  dismissAll(): void;
}

/** Duration (ms; -1 = until dismissed) and politeness per intent. */
export const NOTIFY_BEHAVIOUR: Record<ToastIntent, { timeout: number; politeness: ToastPoliteness }> = {
  success: { timeout: 5_000, politeness: "polite" },
  info: { timeout: 5_000, politeness: "polite" },
  warning: { timeout: 10_000, politeness: "assertive" },
  error: { timeout: -1, politeness: "assertive" },
};

export function useNotify(): Notify {
  const { dispatchToast, dismissAllToasts } = useToastController(APP_TOASTER_ID);

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
                    <Link onClick={action.onClick}>{action.label}</Link>
                  </ToastTrigger>
                ) : null}
                <ToastTrigger>
                  <Link aria-label={`Dismiss: ${message}`}>Dismiss</Link>
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
    return {
      success: show("success"),
      info: show("info"),
      warning: show("warning"),
      error: show("error"),
      dismissAll: () => dismissAllToasts(),
    };
  }, [dispatchToast, dismissAllToasts]);
}
