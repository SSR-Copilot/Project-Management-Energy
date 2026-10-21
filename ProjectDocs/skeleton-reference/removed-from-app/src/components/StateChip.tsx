/**
 * Replaces `cmp_Project_States` (19 controls, 839 loc) — the cluster/approval state pill.
 * Colour comes from the theme's stateColor map, derived from the canvas component.
 */
import type { CSSProperties } from "react";
import { makeStyles, tokens, mergeClasses } from "@fluentui/react-components";
import { stateColor, radius } from "@/theme/tokens";

const useStyles = makeStyles({
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    paddingInline: "10px",
    paddingBlock: "3px",
    borderRadius: radius.pill,
    fontSize: "12px",
    fontWeight: 600,
    lineHeight: "18px",
    whiteSpace: "nowrap",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    maxWidth: "100%",
  },
  dot: { width: "8px", height: "8px", borderRadius: "50%", flex: "none" },
  label: { overflow: "hidden", textOverflow: "ellipsis" },
  solid: {
    color: "#fff",
    borderTopColor: "transparent", borderRightColor: "transparent",
    borderBottomColor: "transparent", borderLeftColor: "transparent",
  },
});

export function StateChip({ state, solid = false }: { state?: string | null; solid?: boolean }) {
  const s = useStyles();
  const name = state?.trim() || "Not Started";
  const c = stateColor[name] ?? tokens.colorNeutralForeground3;
  return (
    <span
      className={mergeClasses(s.chip, solid && s.solid)}
      style={(solid ? { backgroundColor: c } : { color: c }) as CSSProperties}
      title={name}
    >
      {!solid && <span className={s.dot} style={{ backgroundColor: c } as CSSProperties} />}
      <span className={s.label}>{name}</span>
    </span>
  );
}
