/**
 * C6 — the Active / Inactive pill. Two canvas controls, two looks, both kept exactly:
 *
 *   static (CAPEX Accounts `AccountCard.tsx:66-97`, CA:754-803): a `span`, 24 px high, min 50 px,
 *     radius 34, 1 px border, fontSizeBase200, text Grayscale00; Active Green border +
 *     SuccessLight fill, Inactive Grayscale10 border + white fill.
 *   toggle (Project Gates `GateTable.tsx:67-75, 128-153`): a native button, 24 px, min 60 px,
 *     radius 16, 12 px, text #353D3F; Active #ADD179 / #649843, Inactive #C8C8C8 / #787878
 *     (canvas-measured hexes). Locked or pending: `disabled`, cursor default, opacity .85;
 *     pending shows an extra-tiny spinner before the label. The aria wording is PG's, verbatim.
 *
 * `lockedReason` (opt-in, toggle only): instead of the native `disabled`, the locked pill stays
 * focusable with `aria-disabled` and a description tooltip (C4 pattern).
 */
import { Spinner, Tooltip, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { palette, space } from "@/theme/tokens";

const useStyles = makeStyles({
  static: {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    height: "24px", minWidth: "50px", paddingLeft: "10px", paddingRight: "10px",
    borderRadius: "34px", boxSizing: "border-box",
    borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
    borderTopStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid", borderLeftStyle: "solid",
    color: palette.Grayscale00, fontSize: tokens.fontSizeBase200, whiteSpace: "nowrap",
    flexShrink: 0,
  },
  staticActive: {
    borderTopColor: palette.Green, borderRightColor: palette.Green,
    borderBottomColor: palette.Green, borderLeftColor: palette.Green,
    backgroundColor: palette.SuccessLight,
  },
  staticInactive: {
    borderTopColor: palette.Grayscale10, borderRightColor: palette.Grayscale10,
    borderBottomColor: palette.Grayscale10, borderLeftColor: palette.Grayscale10,
    backgroundColor: palette.white,
  },
  toggle: {
    display: "inline-flex", alignItems: "center", justifyContent: "center", columnGap: space.xs,
    height: "24px", minWidth: "60px", paddingLeft: space.s, paddingRight: space.s,
    borderRadius: "16px", fontSize: "12px", fontFamily: "inherit", cursor: "pointer",
    color: "#353D3F",
  },
  toggleActive: { backgroundColor: "#ADD179", border: "1px solid #649843" },
  toggleInactive: { backgroundColor: "#C8C8C8", border: "1px solid #787878" },
  toggleLocked: { cursor: "default", opacity: 0.85 },
});

interface PillLabels { on: string; off: string }
const DEFAULT_LABELS: PillLabels = { on: "Active", off: "Inactive" };

export type StatusPillProps =
  | { variant: "static"; active: boolean; labels?: PillLabels; testId?: string }
  | {
    variant: "toggle"; active: boolean; onToggle: () => void; subject: string;
    locked?: boolean; lockedReason?: string; pending?: boolean; labels?: PillLabels; testId?: string;
  };

/** Project Gates' aria wording, verbatim (`GateTable.tsx:146`). */
function togglePillAriaLabel(subject: string, label: string, active: boolean, locked: boolean): string {
  return locked
    ? `${subject}: ${label} (cannot be changed here)`
    : `${subject}: ${label}. Click to ${active ? "deactivate" : "activate"}`;
}

export function StatusPill(props: StatusPillProps) {
  const styles = useStyles();
  const labels = props.labels ?? DEFAULT_LABELS;
  const label = props.active ? labels.on : labels.off;

  if (props.variant === "static") {
    return (
      <span
        className={mergeClasses(styles.static, props.active ? styles.staticActive : styles.staticInactive)}
        data-testid={props.testId}
      >
        {label}
      </span>
    );
  }

  const { active, onToggle, subject, locked = false, lockedReason, pending = false } = props;
  const blocked = locked || pending;
  const focusableLock = locked && Boolean(lockedReason) && !pending;
  const button = (
    <button
      type="button"
      className={mergeClasses(styles.toggle, active ? styles.toggleActive : styles.toggleInactive, blocked && styles.toggleLocked)}
      {...(focusableLock ? { "aria-disabled": true } : { disabled: blocked })}
      aria-pressed={active}
      aria-label={togglePillAriaLabel(subject, label, active, locked)}
      data-testid={props.testId}
      onClick={() => { if (!blocked) onToggle(); }}
    >
      {pending ? <Spinner size="extra-tiny" aria-hidden="true" /> : null}
      {label}
    </button>
  );
  return focusableLock
    ? <Tooltip content={lockedReason!} relationship="description" withArrow>{button}</Tooltip>
    : button;
}
