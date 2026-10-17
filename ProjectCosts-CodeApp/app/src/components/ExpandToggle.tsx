/**
 * C10 — the small expand / collapse button in front of a tree row.
 *
 *   text18 (Costs `DevexCostTree.tsx:34-39, 100-109`, `OpexContractTable.tsx`): an outline
 *     button 18 × 18, padding 0, colour and border #353D3F, radius 4, hover #EDEDED, glyph "+" / "-".
 *   icon24 (Project Gates `GateTable.tsx:47, 191-199`): outline, small, 24 × 24, AddRegular /
 *     SubtractRegular.
 *
 * The caller's `className` keeps any spacing it adds (Costs DEVEX `marginRight: 10px`).
 * `ExpandToggle.Spacer` is an empty box of the same width for rows without children (PG).
 */
import { Button, makeStyles, mergeClasses } from "@fluentui/react-components";
import { AddRegular, SubtractRegular } from "@fluentui/react-icons";

const useStyles = makeStyles({
  text18: {
    minWidth: "18px", width: "18px", height: "18px", padding: "0",
    color: "#353D3F", borderRadius: "4px",
    borderTopColor: "#353D3F", borderRightColor: "#353D3F", borderBottomColor: "#353D3F", borderLeftColor: "#353D3F",
    ":hover": { backgroundColor: "#EDEDED" },
  },
  icon24: { minWidth: "24px", width: "24px", height: "24px", flexShrink: 0 },
  spacer18: { display: "inline-block", width: "18px", flexShrink: 0 },
  spacer24: { display: "inline-block", width: "24px", flexShrink: 0 },
});

export interface ExpandToggleProps {
  expanded: boolean;
  onToggle(): void;
  /** aria-label, e.g. "Show the Grid costs" / "Collapse tasks of G1". */
  label: string;
  variant: "text18" | "icon24";
  /** `aria-controls`. */
  controls?: string;
  className?: string;
  testId?: string;
}

export function ExpandToggle({ expanded, onToggle, label, variant, controls, className, testId }: ExpandToggleProps) {
  const styles = useStyles();
  if (variant === "text18") {
    return (
      <Button
        appearance="outline" size="small" className={mergeClasses(styles.text18, className)}
        aria-expanded={expanded} aria-label={label} {...(controls ? { "aria-controls": controls } : {})}
        data-testid={testId} onClick={onToggle}
      >
        {expanded ? "-" : "+"}
      </Button>
    );
  }
  return (
    <Button
      appearance="outline" size="small" className={mergeClasses(styles.icon24, className)}
      icon={expanded ? <SubtractRegular /> : <AddRegular />}
      aria-expanded={expanded} aria-label={label} {...(controls ? { "aria-controls": controls } : {})}
      data-testid={testId} onClick={onToggle}
    />
  );
}

/** An empty box the width of the toggle, for rows without children. Also `ExpandToggle.Spacer`. */
export function ExpandToggleSpacer({ variant, className }: { variant: "text18" | "icon24"; className?: string }) {
  const styles = useStyles();
  return <span aria-hidden="true" className={mergeClasses(variant === "text18" ? styles.spacer18 : styles.spacer24, className)} />;
}

ExpandToggle.Spacer = ExpandToggleSpacer;
