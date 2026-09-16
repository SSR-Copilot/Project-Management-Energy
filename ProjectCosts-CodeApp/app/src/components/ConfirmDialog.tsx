/**
 * Replaces four canvas components at once: `cmp_PopUp_Confirmation`,
 * `cmp_PopUp_Confirmation_2`, `cmp_PopUp_Confirmation_New` and the Capex screen's several
 * instances of them (7 instances of `cmp_PopUp_Confirmation` alone).
 *
 * Their custom properties map straight onto these props:
 *   Title → title · Description → description · TextConfirmButton → confirmText
 *   TextCancelButton → cancelText · OnConfirm → onConfirm · OnCancel → onCancel
 *   Visible → open · WidthConfirmButton → confirmWidth
 *   IconConfirmButton → confirmIcon · IconCancelButton → cancelIcon
 *
 * Fluent's `Dialog` brings the focus trap, Escape handling and `aria-modal` that the canvas
 * containers had none of. Everything inside the surface is transcribed, not themed — see
 * `Src/Components/cmp_PopUp_Confirmation.pa.yaml` and `…_New.pa.yaml`, which share their
 * chrome exactly:
 *
 *   scrim        `Fill: =RGBA(0, 0, 0, 0.1)`                            (`_New:89`)
 *   card         `Fill: =Color.White`, `Width: =Min(450, Parent.Width)` (`_New:103-106`)
 *   header       `Fill: =ColorValue(AppTheme.palette.themePrimary)`, `Height: =42` (`_New:116-118`)
 *   title        Open Sans Semibold, `Size: =11` (→ 14.7 px), `Color: =Color.White`,
 *                `X: =20`                                              (`_New:133-143`)
 *   close        `Icon: =Icon.Cancel`, 20 × 20, white, `X: =Parent.Width-Self.Width-15`
 *                                                                      (`_New:145-160`)
 *   body pad     `PaddingTop/Bottom: =16`, `PaddingLeft/Right: =10`     (`_New:172-175`)
 *   buttons row  `Height: =60`, Confirm then Cancel, 20 px apart, 20 px from the right edge,
 *                both `Height: =32`                                    (`_New:222-294`)
 *   Confirm      `FillColor: =themePrimary`, `FontColor: =white`,
 *                `Width: =WidthConfirmButton`                          (`_New:245-264`)
 *   Cancel       `FillColor: =white`, `BorderColor`/`FontColor: =themePrimary`, `Width: =96`
 *                                                                      (`_New:271-292`)
 *
 * `variant="info"` is the ONE thing `_New` adds: the description sits in a pale block with an
 * ⓘ at its left (`con_PopUpConfirmation_BodyDescription_Inside_2`, `_New:182-221`) —
 * `Fill: =RGBA(225, 236, 244, 1)`, label `Size: =9` (→ 12 px), `LineHeight: =1.4`,
 * `Color: =RGBA(50, 49, 48, 1)`, `X: =32`; icon `Icon.Information`, 22 × 16 at `X: =10`.
 * The plain variant (`cmp_PopUp_Confirmation`) has no block and a `Size: =11` description.
 *
 * `makeStyles` rejects CSS shorthands here, so every edge is longhand.
 */
import type { ReactNode } from "react";
import {
  Dialog, DialogSurface, Text, makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import { CheckmarkRegular, DismissRegular, InfoRegular } from "@fluentui/react-icons";
import { fontFamily, palette } from "@/theme/tokens";

/** Canvas `Size:` is in points; Power Apps renders them at 96/72 px per point. */
const pt = (size: number) => `${(size * 4) / 3}px`;

const useStyles = makeStyles({
  /** `con_PopUpConfirmation_2` — the scrim. `Fill: =RGBA(0, 0, 0, 0.1)`, not Fluent's 40 %. */
  backdrop: { backgroundColor: "rgba(0, 0, 0, 0.10)" },
  /** `con_PopUpConfirmation_Body_2` — the surface itself, with Fluent's own padding removed. */
  surface: {
    width: "450px", maxWidth: "calc(100vw - 32px)",
    paddingTop: "0", paddingRight: "0", paddingBottom: "0", paddingLeft: "0",
    // `RadiusTopLeft/…: =0` on the header, and the card sets none, so the corners are square.
    borderRadius: "0",
    borderTopStyle: "none", borderRightStyle: "none",
    borderBottomStyle: "none", borderLeftStyle: "none",
    backgroundColor: palette.white,
    display: "block",
    fontFamily,
  },
  /** `con_PopUpConfirmation_BodyHeader_2` — `Height: =42`, themePrimary, title at `X: =20`. */
  header: {
    display: "flex", alignItems: "center", columnGap: "10px",
    height: "42px", minHeight: "42px",
    paddingLeft: "20px", paddingRight: "15px",
    backgroundColor: palette.themePrimary,
  },
  title: {
    flexGrow: 1, minWidth: "0",
    color: palette.white,
    fontSize: pt(11), fontWeight: tokens.fontWeightSemibold, lineHeight: "20px",
    overflowX: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  /** `ico_PopUpConfirmation_BodyHeader_3` — `Icon.Cancel`, 20 × 20, white, no chrome. */
  close: {
    flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    width: "20px", height: "20px", padding: "0",
    color: palette.white, backgroundColor: "transparent", cursor: "pointer",
    borderTopStyle: "none", borderRightStyle: "none",
    borderBottomStyle: "none", borderLeftStyle: "none",
    ":hover": { color: palette.themeLighter },
  },
  closeIcon: { fontSize: "20px" },
  /** `con_PopUpConfirmation_BodyDescription_2` — the padded band the description sits in. */
  body: {
    paddingTop: "16px", paddingBottom: "16px",
    paddingLeft: "10px", paddingRight: "10px",
    maxHeight: "50vh", overflowY: "auto",
  },
  /**
   * `pre-line`, because the canvas builds some of these descriptions with `Char(10)` and a `•`
   * per line (`cmp_PopUp_Confirmation_For_SetClusterLinkingConfirmationPopup`,
   * `CapexScreenCode.txt:19873-19884`). Without it every bullet runs into the previous one.
   */
  description: {
    whiteSpace: "pre-line",
    color: "#323130",
    lineHeight: "1.4",
  },
  /** `cmp_PopUp_Confirmation` — no block, `Size: =11`. */
  descriptionPlain: { display: "block", fontSize: pt(11) },
  /** `con_PopUpConfirmation_BodyDescription_Inside_2` — the ⓘ block, `Size: =9`. */
  infoBlock: {
    display: "flex", alignItems: "center", columnGap: "10px",
    paddingLeft: "10px", paddingRight: "5px",
    paddingTop: "10px", paddingBottom: "10px",
    backgroundColor: "#E1ECF4",
    borderRadius: "4px",
  },
  infoIcon: { flexShrink: 0, width: "22px", fontSize: "16px", color: "#323130" },
  infoText: { fontSize: pt(9) },
  /** `con_PopUpConfirmation_BodyButtons_2` — `Height: =60`, Confirm then Cancel, 20 px apart. */
  actions: {
    display: "flex", alignItems: "center", justifyContent: "flex-end", columnGap: "20px",
    height: "60px", paddingLeft: "20px", paddingRight: "20px",
  },
  /** Both PowerCAT buttons: `Height: =32`, centred label, 14 px text. */
  button: {
    display: "inline-flex", alignItems: "center", justifyContent: "center", columnGap: "8px",
    height: "32px", paddingLeft: "12px", paddingRight: "12px",
    borderRadius: "2px", cursor: "pointer",
    fontFamily: "inherit", fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold, whiteSpace: "nowrap",
    borderTopWidth: "1px", borderRightWidth: "1px",
    borderBottomWidth: "1px", borderLeftWidth: "1px",
    borderTopStyle: "solid", borderRightStyle: "solid",
    borderBottomStyle: "solid", borderLeftStyle: "solid",
    ":disabled": { cursor: "default", opacity: 0.6 },
  },
  confirm: {
    backgroundColor: palette.themePrimary, color: palette.white,
    borderTopColor: palette.themePrimary, borderRightColor: palette.themePrimary,
    borderBottomColor: palette.themePrimary, borderLeftColor: palette.themePrimary,
    // `HoverFillColor: =AppTheme.palette.hoverButton`, `HoverFontColor: =themePrimary`.
    ":hover:enabled": { backgroundColor: palette.hoverButton, color: palette.themePrimary },
  },
  /** `destructive` has no canvas counterpart — the canvas relied on the label alone. */
  destructive: {
    backgroundColor: palette.Error, color: palette.white,
    borderTopColor: palette.Error, borderRightColor: palette.Error,
    borderBottomColor: palette.Error, borderLeftColor: palette.Error,
    ":hover:enabled": { backgroundColor: palette.Error, color: palette.white },
  },
  cancel: {
    backgroundColor: palette.white, color: palette.themePrimary,
    borderTopColor: palette.themePrimary, borderRightColor: palette.themePrimary,
    borderBottomColor: palette.themePrimary, borderLeftColor: palette.themePrimary,
    width: "96px",
    ":hover:enabled": {
      backgroundColor: palette.hoverButton, borderTopColor: palette.hoverButton,
      borderRightColor: palette.hoverButton, borderBottomColor: palette.hoverButton,
      borderLeftColor: palette.hoverButton,
    },
  },
});

/**
 * `IconConfirmButton` / `IconCancelButton` — Fluent icon NAMES, passed as text.
 *
 * `"none"` stands for the Capex relink popup's `IconConfirmButton: ="Text"`
 * (`CapexScreenCode.txt:19884`), which is not an icon in the PowerCAT set and therefore renders
 * nothing — which is exactly what the client's screenshot shows next to "Confirm All".
 */
export type ConfirmDialogIcon = "checkmark" | "dismiss" | "none";

const ICONS: Record<ConfirmDialogIcon, ReactNode> = {
  checkmark: <CheckmarkRegular />,
  dismiss: <DismissRegular />,
  none: null,
};

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  /** `TextConfirmButton`. "Delete" on both Contracts dialogs. */
  confirmText?: string;
  cancelText?: string;
  /** Destructive actions get the danger appearance; the canvas relied on the label alone. */
  destructive?: boolean;
  busy?: boolean;
  /** `"info"` is `cmp_PopUp_Confirmation_New`'s pale ⓘ block; `"plain"` the older component. */
  variant?: "plain" | "info";
  /** `IconConfirmButton` — `"CheckMark"` is the `cmp_PopUp_Confirmation` default. */
  confirmIcon?: ConfirmDialogIcon;
  /** `IconCancelButton` — `"Cancel"` (an ✕) is the `cmp_PopUp_Confirmation` default. */
  cancelIcon?: ConfirmDialogIcon;
  /** `WidthConfirmButton` — 96 unless the caller widens it for a longer label. */
  confirmWidth?: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open, title, description,
  confirmText = "Confirm", cancelText = "Cancel",
  destructive = false, busy = false,
  variant = "plain",
  confirmIcon = "checkmark", cancelIcon = "dismiss",
  confirmWidth = 96,
  onConfirm, onCancel,
}: ConfirmDialogProps) {
  const styles = useStyles();

  const body = (
    <Text
      as="span"
      className={mergeClasses(
        styles.description,
        variant === "info" ? styles.infoText : styles.descriptionPlain,
      )}
    >
      {description}
    </Text>
  );

  return (
    <Dialog
      open={open}
      modalType="alert"
      onOpenChange={(_, data) => { if (!data.open) onCancel(); }}
    >
      <DialogSurface
        className={styles.surface}
        aria-label={title}
        backdrop={{ className: styles.backdrop }}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          {/* `ico_PopUpConfirmation_BodyHeader_3.OnSelect: =…OnCancel()` — the ✕ cancels. */}
          <button type="button" className={styles.close} aria-label="Close" onClick={onCancel}>
            <DismissRegular className={styles.closeIcon} />
          </button>
        </div>

        <div className={styles.body}>
          {variant === "info" ? (
            <div className={styles.infoBlock}>
              <InfoRegular className={styles.infoIcon} aria-hidden="true" />
              {body}
            </div>
          ) : body}
        </div>

        {/* Confirm sits LEFT of Cancel: `Confirm.X = Cancel.X - Self.Width - 20`. */}
        <div className={styles.actions}>
          <button
            type="button"
            className={mergeClasses(
              styles.button, destructive ? styles.destructive : styles.confirm,
            )}
            style={{ width: confirmWidth }}
            onClick={onConfirm}
            disabled={busy}
          >
            {ICONS[confirmIcon]}
            {confirmText}
          </button>
          <button
            type="button"
            className={mergeClasses(styles.button, styles.cancel)}
            onClick={onCancel}
            disabled={busy}
          >
            {ICONS[cancelIcon]}
            {cancelText}
          </button>
        </div>
      </DialogSurface>
    </Dialog>
  );
}
