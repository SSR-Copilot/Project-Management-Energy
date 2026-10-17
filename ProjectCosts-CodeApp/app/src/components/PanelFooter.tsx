/**
 * C1 — the Save / Cancel pair every settings panel footer shows.
 *
 * It renders NO wrapper: the buttons are direct children of `FormPanel`'s `.canvas-panel-footer`
 * band, whose chrome (`canvas.css:90-98`: 50 px, gap 10, padding 9 px 20 px, `#f0f0f0` rule,
 * 96 px buttons, radius 2) is measured from the canvas edit-panel screenshot. Save is primary
 * with a checkmark, Cancel the canvas brand outline (T2) with an ✕ — the PowerCAT pair every
 * settings screen transcribes (see `theme/buttonStyles.ts`).
 *
 * Cancel goes through `useFormPanel().requestClose("cancel")` unless `onCancel` is given, so the
 * panel's dirty guard always runs.
 *
 * `gap={20}`: CAPEX Accounts places Save at `Cancel.X - Self.Width - 20` (CAX:1440), not the
 * 10 px `LayoutGap` of the other five screens, so it can keep its canvas spacing. Because the
 * component has no wrapper, the extra 10 px is a left margin on Cancel.
 */
import type { ReactNode } from "react";
import { Button, Text, makeStyles, mergeClasses } from "@fluentui/react-components";
import { CheckmarkRegular, DismissRegular } from "@fluentui/react-icons";
import { useBrandButtonStyles } from "@/theme/buttonStyles";
import { palette } from "@/theme/tokens";
import { useFormPanel } from "./formPanelContext";

const useStyles = makeStyles({
  button: { minWidth: "96px" },
  wideGap: { marginLeft: "10px" },
  /** `costs/drawerStyles.ts`: left-aligned, grows, overrides `> *:first-child { margin-left: auto }`. */
  hint: {
    flexGrow: 1, flexShrink: 1, flexBasis: "auto",
    marginLeft: "0 !important",
    color: palette.Error, fontSize: "12px",
  },
});

export interface PanelFooterProps {
  onSave: () => void;
  /** Save is enabled only when `canSave && !saving`. */
  canSave: boolean;
  /** Disables both buttons. Default false. */
  saving?: boolean;
  /** Default: `useFormPanel().requestClose("cancel")`. */
  onCancel?: () => void;
  saveLabel?: string;
  /**
   * Shown on Save while `saving` (Check List Settings: "Saving…"). The aria-label stays
   * `saveLabel`, as Check List Settings has it today (a11y invariant 4).
   */
  savingLabel?: string;
  cancelLabel?: string;
  /** Left-aligned, `aria-live="polite"` (Costs period drawer). */
  hint?: ReactNode;
  saveTestId?: string;
  cancelTestId?: string;
  /** Space between Save and Cancel; default 10 (canvas.css). CAPEX Accounts: 20 (CAX:1440). */
  gap?: 10 | 20;
}

export function PanelFooter({
  onSave, canSave, saving = false, onCancel, saveLabel = "Save", savingLabel, cancelLabel = "Cancel",
  hint, saveTestId, cancelTestId, gap = 10,
}: PanelFooterProps) {
  const styles = useStyles();
  const brand = useBrandButtonStyles();
  const { requestClose } = useFormPanel();
  const saveCaption = saving && savingLabel ? savingLabel : saveLabel;
  return (
    <>
      {hint ? <Text className={styles.hint} aria-live="polite">{hint}</Text> : null}
      <Button
        appearance="primary" className={styles.button} icon={<CheckmarkRegular />}
        disabled={!canSave || saving} onClick={onSave} aria-label={saveLabel}
        data-testid={saveTestId}
      >
        {saveCaption}
      </Button>
      <Button
        appearance="outline"
        className={mergeClasses(styles.button, brand.brandOutline, gap === 20 && styles.wideGap)}
        icon={<DismissRegular />}
        disabled={saving} onClick={() => (onCancel ? onCancel() : requestClose("cancel"))}
        aria-label={cancelLabel} data-testid={cancelTestId}
      >
        {cancelLabel}
      </Button>
    </>
  );
}
