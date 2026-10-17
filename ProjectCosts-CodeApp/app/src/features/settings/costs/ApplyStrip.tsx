/**
 * FR-30 — the canvas "Apply to All" bar (top, ACS:834-955) and the per-section "Apply" strip
 * (ACS:1157-1251), drawn DISABLED exactly as the canvas ships them (`DisplayMode.Disabled`, the
 * sync commented out). No data calls and no tracking writes: what Apply does is an open product
 * decision (D-APPLY-1/2). The history tag ("dd.mm.yyyy Apply was made by …") is blocked until
 * `vsb_applyandapplyalltracking` is registered (AC-8, DR-1).
 *
 * The shared `DisabledReason` (C4) keeps the button focusable (`disabledFocusable`) so the
 * tooltip explaining why it is unavailable can show; it still cannot be activated.
 */
import { Button, Text, makeStyles, tokens } from "@fluentui/react-components";
import { CheckmarkRegular } from "@fluentui/react-icons";
import { DisabledReason } from "@/components";
import { MSG } from "./constants";

const useStyles = makeStyles({
  strip: { display: "flex", alignItems: "center", columnGap: "12px", flexWrap: "wrap", rowGap: "4px" },
  info: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
});

export interface ApplyStripProps {
  /** "all" = the top "Apply to All" bar; "section" = the per-section "Apply". */
  scope: "all" | "section";
  /** Section title, for a distinct accessible name per section. */
  title?: string;
}

export function ApplyStrip({ scope, title }: ApplyStripProps) {
  const styles = useStyles();
  const label = scope === "all" ? MSG.applyToAll : MSG.apply;
  const name = scope === "all" ? MSG.applyToAll : `${MSG.apply} (${title ?? ""})`;
  return (
    <div className={styles.strip}>
      <DisabledReason reason={MSG.applyNotBuilt}>
        <Button appearance="secondary" icon={<CheckmarkRegular />} aria-label={name}>
          {label}
        </Button>
      </DisabledReason>
      <Text className={styles.info}>{MSG.applyInfo}</Text>
    </div>
  );
}
