/**
 * C4 — a disabled control that says WHY, reachable by keyboard.
 *
 * With a `reason` the child is cloned with `disabledFocusable` (and `disabled: false`), so it
 * stays in the tab order with `aria-disabled`, and is wrapped in a Fluent `Tooltip` whose text is
 * the control's accessible description. Without a reason the child is returned untouched.
 * This is the pattern CAPEX Accounts (delete unavailable), Check List Settings (`LockTip`),
 * Contracts (Add at the limit) and Costs each hand-built.
 *
 * Wave C: `enabledTooltip` (optional) — when there is NO reason, the (enabled) child gets this
 * description tooltip instead of rendering bare. It has no arrow, as Costs' "Add a period after
 * Period N" hint always had; a `reason` still wins.
 */
import { cloneElement, type ReactElement } from "react";
import { Tooltip, type TooltipProps } from "@fluentui/react-components";

export interface DisabledReasonProps {
  /** Falsy → the child renders unchanged (or with `enabledTooltip`). */
  reason?: string | null;
  /** Wave C: description tooltip while there is no reason (Costs' Add Period hint). */
  enabledTooltip?: string | null;
  children: ReactElement<{ disabled?: boolean; disabledFocusable?: boolean }>;
  positioning?: TooltipProps["positioning"];
}

export function DisabledReason({ reason, enabledTooltip, children, positioning }: DisabledReasonProps) {
  const at = positioning ? { positioning } : {};
  if (!reason) {
    if (!enabledTooltip) return children;
    return <Tooltip content={enabledTooltip} relationship="description" {...at}>{children}</Tooltip>;
  }
  return (
    <Tooltip content={reason} relationship="description" withArrow {...at}>
      {cloneElement(children, { disabled: false, disabledFocusable: true })}
    </Tooltip>
  );
}
