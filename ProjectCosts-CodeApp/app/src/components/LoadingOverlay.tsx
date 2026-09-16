/**
 * Replaces `cmp_PopUp_Loading` and `cmp_PopUp_Loading_1` — two near-identical canvas
 * components (4 controls each) that differed only in which context variable they read.
 *
 * Transcribed from `Src/Components/cmp_PopUp_Loading.pa.yaml`:
 *
 *   con_PopUpLoading                `Fill: =RGBA(0, 0, 0, 0.1)`, full screen        (`:26-28`)
 *   con_PopUpLoading_InformationArea `Fill: =white`, `Height: =240`, `Radius…: =5`,
 *                                    centred on both axes                          (`:35-42`)
 *   spi_PopUpLoading_Spinner        `Y: =50`, `Height: =If(InformationText = "", 120, 90)`,
 *                                    horizontally centred                          (`:48-55`)
 *   lbl_PopUpLoading_Description    `Align: =Align.Center`, `Font: =Font.'Segoe UI'`,
 *                                    `FontWeight: =FontWeight.Semibold`,
 *                                    `Size: =gblAppSizes.Font.Medium` (= 11 pt → 14.7 px),
 *                                    `Color: =gblAppStyles.Label.Color` (= palette.black),
 *                                    `Y: =Spinner.Y + Spinner.Height + 10` (= 150) (`:56-83`)
 *
 * Measured against the client's reference shot
 * (`Cost App - Loading Spinner Design - Panel Closes and Spinner is shown..png`): the card is
 * 500 × 240 px at x 710-1209 / y 387-626, and every pixel of chrome behind it is exactly 90 %
 * of its undimmed value — which is the 10 % scrim, confirmed rather than assumed.
 *
 * THE PANEL IS NOT BEHIND IT. Both save branches of the Capex Save button close the panel in
 * the same `UpdateContext` that raises the spinner (`locIsVisibleRightPanelAddContract: false`,
 * `CapexScreenCode.txt:17413`), which is what the reference filename spells out. That ordering
 * is the caller's job — see `capex-costs/Screen.tsx`'s `persist()`.
 */
import { makeStyles, Spinner, Text, tokens } from "@fluentui/react-components";
import { palette, space } from "@/theme/tokens";

const useStyles = makeStyles({
  scrim: {
    position: "fixed",
    top: 0, right: 0, bottom: 0, left: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    // `con_PopUpLoading.Fill: =RGBA(0, 0, 0, 0.1)`.
    backgroundColor: "rgba(0, 0, 0, 0.10)",
    zIndex: 1000,
  },
  card: {
    display: "flex", flexDirection: "column", alignItems: "center",
    width: "500px", maxWidth: "90vw", height: "240px",
    backgroundColor: palette.white,
    // `RadiusTopLeft/TopRight/BottomLeft/BottomRight: =5`.
    borderRadius: "5px",
    // `DropShadow: =DropShadow.None`.
    boxShadow: "none",
  },
  /** `spi_PopUpLoading_Spinner` — `Y: =50`, and the 90 px box it is centred in. */
  spinnerBox: {
    display: "flex", alignItems: "center", justifyContent: "center",
    height: "90px", marginTop: "50px",
  },
  /** `Y: =Spinner.Y + Spinner.Height + 10`, i.e. 10 px under the spinner's box. */
  label: {
    marginTop: "10px",
    paddingLeft: "20px", paddingRight: "20px",
    textAlign: "center",
    color: palette.black,
    // `Size: =gblAppSizes.Font.Medium` — 11 pt, which Power Apps renders at 11 × 96/72.
    fontSize: "14.7px",
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: "20px",
  },
  inline: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: space.s,
    paddingTop: space.xxl, paddingBottom: space.xxl,
  },
});

export interface LoadingOverlayProps {
  /** `"blocking"` is the modal save spinner; `"inline"` fills a content area. */
  mode?: "blocking" | "inline";
  label?: string;
}

export function LoadingOverlay({ mode = "blocking", label }: LoadingOverlayProps) {
  const styles = useStyles();

  if (mode === "inline") {
    return (
      <div className={styles.inline} role="status" aria-live="polite">
        <Spinner size="medium" label={label} />
      </div>
    );
  }

  return (
    // `aria-modal` plus a live region: the canvas version was a plain container with no
    // role at all, which is one of the 239 acc-AccessibleLabelNeeded findings.
    <div className={styles.scrim} role="dialog" aria-modal="true" aria-busy="true">
      <div className={styles.card}>
        <div className={styles.spinnerBox}>
          {/* `AccessibleLabel: ="Waiting"`. */}
          <Spinner size="medium" aria-label="Waiting" />
        </div>
        {label ? (
          <Text as="span" className={styles.label} role="status" aria-live="polite">
            {label}
          </Text>
        ) : null}
      </div>
    </div>
  );
}
