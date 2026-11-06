/**
 * The PM app's "can't be deleted/deactivated" information pop-up —
 * `con_Main_PopUp_Common_Generators_PreventTotalCapacity_Information[_N]`, which the canvas copies
 * onto several screens with a numeric suffix on every control name:
 *
 *   Generators   no suffix  `Project Generators Screen.pa.yaml` Y:17341-17506
 *   Production   `_1`       `Project Production Screen.pa.yaml` Y:9305-9471
 *
 * Every copy shares the same chrome, transcribed here:
 *
 *   scrim     `Fill: =RGBA(0, 0, 0, 0.5)`
 *   card      white, square (`Radius*: =0`), vertical auto-layout
 *   header    `Height: =64`, `Fill: =RGBA(0, 110, 185, 1)`, `PaddingLeft/Right` = the gutter;
 *             the title `Size: =15` white, and a 20 × 20 white `Icon.Cancel`
 *   body      `PaddingTop/Bottom: =13`, `PaddingLeft/Right` = the gutter, `LayoutGap: =15`
 *   tag       `…_InformationTag`: `Fill: =RGBA(204, 226, 241, 0.5)`, an 18-px Grayscale10
 *             `Icon.Information` at `X: =10`, the message (`RGBA(44, 44, 44, 1)`, `Font.Small`)
 *             5 px to its right
 *   rule      `Rectangle3`: 2 px, `RGBA(213, 213, 213, 1)`, `Width: =Parent.Width` — edge to edge
 *   button    `Button@0.0.45` Secondary, outlined RGBA(0, 110, 185, 1), "Close", at the end
 *
 * What differs per copy is the size, passed as props:
 *
 *   Generators   no `Width`/`Height` (520 wide measured off the live canvas, 3 Nov 2026),
 *                gutter 32, the tag at least 50 high
 *   Production   `Width: =550`, `Height: =220`, gutter 30, the tag `Height: =55`
 *
 * Both the ✕ and Close only close it (`UpdateContext({locPreventGeneratorCapacityPopUp: false…})`).
 */
import type { ReactNode } from "react";
import { Button, Dialog, DialogSurface, makeStyles } from "@fluentui/react-components";
import { DismissRegular, InfoRegular } from "@fluentui/react-icons";
import { palette } from "@/theme/tokens";
import { HINTS } from "./hints";

const BLUE = "rgb(0, 110, 185)";

const useStyles = makeStyles({
  scrim: { backgroundColor: "rgba(0, 0, 0, 0.5)" },
  surface: {
    display: "flex", flexDirection: "column",
    width: "520px", maxWidth: "calc(100vw - 32px)", boxSizing: "border-box",
    paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
    borderRadius: 0, backgroundColor: palette.white, overflow: "hidden",
    // Fluent's surface has a 1-px transparent border, and the white card showed through it as a
    // white line round the blue header; the canvas header runs to the card's edge.
    borderTopWidth: 0, borderRightWidth: 0, borderBottomWidth: 0, borderLeftWidth: 0,
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between", columnGap: "12px",
    flexShrink: 0, height: "64px", paddingLeft: "32px", paddingRight: "32px", boxSizing: "border-box",
    backgroundColor: BLUE,
  },
  title: { flex: "1 1 auto", minWidth: 0, color: palette.white, fontSize: "15px", fontWeight: 400, lineHeight: "20px" },
  close: {
    minWidth: "20px", width: "20px", height: "20px", paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
    color: palette.white, backgroundColor: "transparent",
    ":hover": { color: palette.white, backgroundColor: "transparent" },
    // `PressedColor: =RGBA(16, 110, 190, 1)`.
    ":hover:active": { color: "rgb(16, 110, 190)", backgroundColor: "transparent" },
    "& svg": { width: "20px", height: "20px" },
    // The dialog focuses its first button on open; the canvas ✕ shows no focus box.
    ":focus, :focus-visible, &[data-fui-focus-visible]": {
      outlineStyle: "none", boxShadow: "none",
      borderTopColor: "transparent", borderRightColor: "transparent",
      borderBottomColor: "transparent", borderLeftColor: "transparent",
    },
    "::after": { display: "none" },
  },
  /** The body takes what a fixed-height card leaves, content at the top (`LayoutJustifyContent` default). */
  body: {
    flexGrow: 1, minHeight: 0,
    display: "flex", flexDirection: "column", alignItems: "center", rowGap: "15px",
    paddingTop: "13px", paddingBottom: "13px", paddingLeft: "32px", paddingRight: "32px",
  },
  tag: {
    display: "flex", alignItems: "center", columnGap: "5px", alignSelf: "stretch", boxSizing: "border-box",
    minHeight: "50px", paddingLeft: "10px", paddingRight: "10px", paddingTop: "4px", paddingBottom: "4px",
    backgroundColor: "rgba(204, 226, 241, 0.5)",
  },
  tagIcon: { flexShrink: 0, width: "18px", height: "18px", fontSize: "18px", color: palette.Grayscale10 },
  // `Font.Small` is 10 pt (13.33 px).
  tagText: { color: "rgb(44, 44, 44)", fontSize: "13.33px", lineHeight: "18px" },
  rule: {
    flexShrink: 0, alignSelf: "stretch", height: "2px",
    marginLeft: "-32px", marginRight: "-32px", backgroundColor: "rgb(213, 213, 213)",
  },
  button: {
    flexShrink: 0, alignSelf: "flex-end", color: BLUE,
    borderTopColor: BLUE, borderRightColor: BLUE, borderBottomColor: BLUE, borderLeftColor: BLUE,
  },
});

export interface InformationPopUpProps {
  open: boolean;
  /** `txt_PopUp_Common_Generators_PreventTotalCapacity_Title[_N].Text` */
  title: string;
  /** `lbl_PopUp_Common_Generators_PreventTotalCapacity_Information[_N].Text` */
  message: ReactNode;
  /** `btn_…_Information_Close[_N].Text` — "Close" on every copy. */
  closeText?: string;
  /**
   * The canvas copy's suffix (`""` on Generators, `"_1"` on Production), appended to every
   * canvas control name so each `data-testid` stays that screen's own control.
   */
  canvasSuffix?: string;
  /** The card's `Width`. Omitted: 520, as measured on Generators (whose YAML sets none). */
  width?: number;
  /** The card's `Height`. Omitted: the card fits its content. */
  boxHeight?: number;
  /** The header and body `PaddingLeft/Right`. Omitted: 32 (Generators). */
  gutter?: number;
  /** The tag's `Height`. Omitted: at least 50, growing with the message (Generators). */
  tagHeight?: number;
  onClose: () => void;
}

export function InformationPopUp({
  open, title, message, closeText = HINTS.close, canvasSuffix = "",
  width, boxHeight, gutter, tagHeight, onClose,
}: InformationPopUpProps) {
  const s = useStyles();
  const id = (name: string) => `${name}${canvasSuffix}`;
  // Per-instance NUMBERS cannot live in `makeStyles`; left out, they emit nothing.
  const surfaceStyle = {
    ...(width === undefined ? {} : { width: `${width}px` }),
    ...(boxHeight === undefined ? {} : { height: `${boxHeight}px` }),
  };
  const padStyle = gutter === undefined ? undefined : { paddingLeft: `${gutter}px`, paddingRight: `${gutter}px` };
  const ruleStyle = gutter === undefined ? undefined : { marginLeft: `-${gutter}px`, marginRight: `-${gutter}px` };
  const tagStyle = tagHeight === undefined ? undefined : { minHeight: `${tagHeight}px` };

  return (
    <Dialog open={open} onOpenChange={(_, d) => { if (!d.open) onClose(); }}>
      <DialogSurface
        aria-label={title} className={s.surface} style={surfaceStyle}
        backdrop={{ className: s.scrim }}
        data-testid={id("con_PopUp_Common_Generators_PreventTotalCapacity_Information")}
      >
        <div className={s.header} style={padStyle}>
          <span className={s.title} data-testid={id("txt_PopUp_Common_Generators_PreventTotalCapacity_Title")}>
            {title}
          </span>
          <Button
            appearance="transparent" className={s.close} icon={<DismissRegular />} title={HINTS.cancel}
            aria-label={id("icn_PopUp_Common_Generators_PreventTotalCapacity_Cancel")}
            data-testid={id("icn_PopUp_Common_Generators_PreventTotalCapacity_Cancel")}
            onClick={onClose}
          />
        </div>
        <div className={s.body} style={padStyle}>
          <div className={s.tag} style={tagStyle}>
            <InfoRegular className={s.tagIcon} aria-hidden="true" />
            <span className={s.tagText} data-testid={id("lbl_PopUp_Common_Generators_PreventTotalCapacity_Information")}>
              {message}
            </span>
          </div>
          <span className={s.rule} style={ruleStyle} aria-hidden="true" />
          <Button
            appearance="secondary" className={s.button} aria-label={closeText}
            data-testid={id("btn_PopUp_Common_Generators_PreventTotalCapacity_Information_Close")}
            onClick={onClose}
          >
            {closeText}
          </Button>
        </div>
      </DialogSurface>
    </Dialog>
  );
}
