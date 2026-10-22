/**
 * The icon buttons at the end of a table row (Edit / Delete / Activate …).
 *
 * Differences between the screens are props, not changes:
 *   | screen | tone     | appearance  | size   | tooltip       | gap | toneWhenLocked |
 *   |--------|----------|-------------|--------|---------------|-----|----------------|
 *   | CA     | brand    | subtle      | small  | reason-only   | 2   | false          |
 *   | CL     | accent   | transparent | medium | reason-only   | 0   | false          |
 *   | CS     | brand / link (OPEX #0078D4) | transparent | small | reason-only | 0 | true |
 *   | PG     | brand    | transparent | medium | always        | 0 (gate) / 4 (task) | false |
 *
 * Wave C: `gap={4}` (Project Gates' task-row icons, `space.xs`) joins 0 / 2; default stays 0.
 *
 * The tone colours the icon. A LOCKED action (one with a `disabledReason`) drops the tone and
 * shows Fluent's disabled grey (CL `TaskTable.tsx:37`, CA delete-unavailable) unless
 * `toneWhenLocked` is set (Costs colours its icons whatever the state). A plain `disabled`
 * action (busy) keeps the tone, as every screen does today.
 */
import type { ReactElement } from "react";
import { Button, Tooltip, makeStyles, mergeClasses } from "@fluentui/react-components";
import { palette, space } from "@/theme/tokens";
import { DisabledReason } from "./DisabledReason";

const useStyles = makeStyles({
  row: { display: "flex", alignItems: "center" },
  gap2: { columnGap: "2px" },
  gap4: { columnGap: space.xs },
  start: { justifyContent: "flex-start" },
  center: { justifyContent: "center" },
  end: { justifyContent: "flex-end" },
  brand: { color: palette.themePrimary },
  accent: { color: palette.akzent3 },
  /** Costs OPEX rows: `#0078D4` — kept as measured (an open question, not changed). */
  link: { color: "#0078D4" },
});

export interface RowAction {
  key: string;
  icon: ReactElement;
  /** Aria-label (and, without `tooltipText`, the `tooltip="always"` text), e.g. "Edit Development 1". */
  label: string;
  onClick: () => void;
  /** Default true; false → not rendered. */
  visible?: boolean;
  disabled?: boolean;
  /** Locked: focusable, `aria-disabled`, the reason as a tooltip description. */
  disabledReason?: string;
  /** `aria-describedby` (Check List Settings points it at the row's name). */
  describedBy?: string;
  /** `tooltip="always"` text when it differs from the aria-label (PG: "Edit" over "Edit approvers of …"). */
  tooltipText?: string;
  /** Native `title` (CAPEX Accounts shows "Edit" / "Delete" this way today). */
  title?: string;
  testId?: string;
}

export interface RowActionsProps {
  actions: readonly RowAction[];
  /** Brand = themePrimary; accent = palette.akzent3 (CL); link = #0078D4 (CS OPEX). None by default. */
  tone?: "brand" | "accent" | "link";
  /** Keep the tone on locked actions (Costs). Default false. */
  toneWhenLocked?: boolean;
  appearance?: "transparent" | "subtle";
  size?: "small" | "medium";
  /** `always`: every enabled action gets a label tooltip (PG). Default `reason-only`. */
  tooltip?: "always" | "reason-only";
  /** Space between the buttons in px; default 0. CAPEX 2, Project Gates task rows 4. */
  gap?: 0 | 2 | 4;
  align?: "start" | "center" | "end";
  className?: string;
}

export function RowActions({
  actions, tone, toneWhenLocked = false, appearance = "transparent", size = "medium", tooltip = "reason-only",
  gap = 0, align, className,
}: RowActionsProps) {
  const styles = useStyles();
  const toneClass = tone ? styles[tone] : undefined;
  return (
    <div className={mergeClasses(
      styles.row, gap === 2 && styles.gap2, gap === 4 && styles.gap4, align && styles[align], className,
    )}>
      {actions.filter((a) => a.visible !== false).map((a) => {
        const locked = Boolean(a.disabledReason);
        const iconClass = locked && !toneWhenLocked ? undefined : toneClass;
        const button = (
          <Button
            key={a.key}
            appearance={appearance} size={size}
            icon={iconClass ? { children: a.icon, className: iconClass } : a.icon}
            disabled={a.disabled === true}
            aria-label={a.label}
            {...(a.describedBy ? { "aria-describedby": a.describedBy } : {})}
            {...(a.title ? { title: a.title } : {})}
            data-testid={a.testId}
            onClick={a.onClick}
          />
        );
        if (locked) return <DisabledReason key={a.key} reason={a.disabledReason}>{button}</DisabledReason>;
        if (tooltip === "always") {
          return <Tooltip key={a.key} content={a.tooltipText ?? a.label} relationship="label">{button}</Tooltip>;
        }
        return button;
      })}
    </div>
  );
}
