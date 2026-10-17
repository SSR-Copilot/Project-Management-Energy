/**
 * C2 — a page or section message bar with an optional Retry-style action and an optional ✕.
 *
 * The settings screens each hand-built this from Fluent's `MessageBar` (CAPEX Accounts' warning
 * and refresh bars, Check List Settings' four load bars, Contracts' DevCo bar, Milestones' edit
 * error and stale bar, Project Gates' banners). The action button is always `size="small"`
 * (V2: CL and MS were medium; CA, CO and CS already small).
 */
import type { ReactNode } from "react";
import {
  Button, MessageBar, MessageBarActions, MessageBarBody, MessageBarTitle, makeStyles, mergeClasses,
} from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";

const useStyles = makeStyles({
  inset20: { marginLeft: "20px", marginRight: "20px" },
});

export interface NoticeBarAction { label: string; onClick: () => void; ariaLabel?: string; testId?: string }

export interface NoticeBarProps {
  intent: "error" | "warning" | "info" | "success";
  title?: string;
  /** Body text. */
  children: ReactNode;
  /** A small button in `MessageBarActions` (aria-label defaults to the caption). */
  action?: NoticeBarAction;
  /** A transparent ✕ (`aria-label="Dismiss"`) as the container action. */
  onDismiss?: () => void;
  /** `role="alert"` (CAPEX refresh bar, Milestones edit error). Otherwise MessageBar's own politeness. */
  alert?: boolean;
  /** Left and right margin in px; default 0 (CAPEX Accounts and Contracts page bars use 20). */
  inset?: 0 | 20;
  /** Overrides the bar's accessible name (Check List Settings labels some bars). */
  ariaLabel?: string;
  className?: string;
  testId?: string;
}

export function NoticeBar({
  intent, title, children, action, onDismiss, alert = false, inset = 0, ariaLabel, className, testId,
}: NoticeBarProps) {
  const styles = useStyles();
  return (
    <MessageBar
      intent={intent}
      className={mergeClasses(inset === 20 && styles.inset20, className)}
      {...(alert ? { role: "alert" } : {})}
      {...(ariaLabel ? { "aria-label": ariaLabel } : {})}
      data-testid={testId}
    >
      <MessageBarBody>
        {title ? <MessageBarTitle>{title}</MessageBarTitle> : null}
        {children}
      </MessageBarBody>
      {action || onDismiss ? (
        <MessageBarActions
          {...(onDismiss ? {
            containerAction: (
              <Button appearance="transparent" aria-label="Dismiss" icon={<DismissRegular />} onClick={onDismiss} />
            ),
          } : {})}
        >
          {action ? (
            <Button
              size="small" aria-label={action.ariaLabel ?? action.label}
              data-testid={action.testId} onClick={action.onClick}
            >
              {action.label}
            </Button>
          ) : null}
        </MessageBarActions>
      ) : null}
    </MessageBar>
  );
}
