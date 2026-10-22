/**
 * The canvas "Apply to All" bar (top, ACS:808-955) and the per-section "Apply" strip
 * (ACS:1146-1251), drawn DISABLED exactly as the canvas ships them (`DisplayMode.Disabled`, the
 * sync commented out). No data calls and no tracking writes: what Apply does is an open product
 * decision. The history tag ("dd.mm.yyyy Apply was made by …") is blocked until
 * `vsb_applyandapplyalltracking` is registered.
 *
 * Look: a 45 px band filled `RGBA(204, 226, 241, 0.5)`, the button 10 px in (Apply to
 * All is 140 px wide), then a 15 px gap, an 18 px information icon (Grayscale10), 5 px, and the
 * info text at the canvas "Small" size (10 pt = 13.3 px, #323130) — ACS:808-884, 1146-1224.
 *
 * The shared `DisabledReason` keeps the button focusable (`disabledFocusable`) so the
 * tooltip explaining why it is unavailable can show; it still cannot be activated.
 */
import { Button, Text, makeStyles, mergeClasses } from "@fluentui/react-components";
import { CheckmarkRegular, InfoRegular } from "@fluentui/react-icons";
import { DisabledReason } from "@/components";
import { palette } from "@/theme/tokens";
import { MSG } from "./constants";

const useStyles = makeStyles({
  strip: {
    display: "flex", alignItems: "center", flexWrap: "wrap", rowGap: "4px", boxSizing: "border-box",
    minHeight: "45px", paddingLeft: "10px", paddingRight: "10px", minWidth: "0",
    backgroundColor: "rgba(204, 226, 241, 0.5)",
  },
  /** The section strip shares the row with the command button and fills the rest of it. */
  fill: { flexGrow: 1, flexShrink: 1, flexBasis: "320px" },
  button: { marginRight: "15px" },
  allButton: { minWidth: "140px" },
  icon: { fontSize: "18px", color: palette.Grayscale10, flexShrink: 0, marginRight: "5px" },
  info: { color: "#323130", fontSize: "13.3px", flex: "1 1 200px", minWidth: "0" },
});

export interface ApplyStripProps {
  /** "all" = the top "Apply to All" bar; "section" = the per-section "Apply". */
  scope: "all" | "section";
  /** Section title, for a distinct accessible name per section. */
  title?: string;
  /** Section key (`CostCategoryDef.key`), for a distinct test id per section. */
  sectionKey?: string;
}

export function ApplyStrip({ scope, title, sectionKey }: ApplyStripProps) {
  const styles = useStyles();
  const label = scope === "all" ? MSG.applyToAll : MSG.apply;
  const name = scope === "all" ? MSG.applyToAll : `${MSG.apply} (${title ?? ""})`;
  return (
    <div className={mergeClasses(styles.strip, scope === "section" && styles.fill)}>
      <DisabledReason reason={MSG.applyNotBuilt}>
        <Button
          appearance="secondary"
          className={mergeClasses(styles.button, scope === "all" && styles.allButton)}
          icon={<CheckmarkRegular />}
          aria-label={name}
          data-testid={scope === "all" ? "cost-apply-all" : `cost-apply-section-${sectionKey ?? "section"}`}
        >
          {label}
        </Button>
      </DisabledReason>
      <InfoRegular className={styles.icon} aria-hidden />
      <Text className={styles.info}>{MSG.applyInfo}</Text>
    </div>
  );
}
