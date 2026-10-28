/**
 * Layout pieces shared by the PM form screens (General Data, Milestones), transcribed from their
 * canvas containers (UI layout pass, 20 Oct 2026). Kept here, beside the first screen that uses it,
 * until the PM screens' layout is consolidated into `@/components`.
 *
 * Sizes: a `ModernText` `Size` is used as px (as the Cost screens' `.canvas-field` does); a classic
 * `Label` `Size` is points, × 1.333 for px. `gblAppSizes.Font`: ExtraSmall 9, Small 10,
 * ExtraLarge 14, ExtraExtraLarge 16 (`App.pa.yaml`).
 */
import { makeStyles } from "@fluentui/react-components";
import { palette } from "@/theme/tokens";

/** `RGBA(50, 49, 48, 1)` — the record-stamp and gallery-row label colour. */
export const CANVAS_TEXT = "#323130";

export const usePmLayout = makeStyles({
  /**
   * The screen root. The shell's content area scrolls (`canvas-main-scroll`), so the root only
   * grows to at least the viewport (`flex: 1 0 auto`) — it never clips — and the bottom bar can
   * stick to the bottom of the visible area, as the canvas pins `…_Body_Content_Buttom`.
   */
  page: { display: "flex", flexDirection: "column", flex: "1 0 auto", minWidth: 0 },
  /** `con_…_Body_General_Content_Label`: Height 70, Fill Grayscale30; label Bold, 16, PaddingLeft 20. */
  headerBand: {
    display: "flex", alignItems: "center", flexShrink: 0,
    minHeight: "70px", paddingLeft: "20px",
    backgroundColor: palette.Grayscale30,
    marginTop: 0, marginBottom: 0,
    fontSize: "16px", fontWeight: 700,
  },
  /**
   * `con_…_Label_1` / `_Placement` / `_Shareholding_Entities`: Height 50; the label (Semibold, 16)
   * and the 1-px `Grayscale20` rule both at X 20, Width `Parent.Width-40`.
   */
  groupHeader: {
    display: "flex", alignItems: "center", flexShrink: 0,
    minHeight: "50px", marginLeft: "20px", marginRight: "20px",
    borderBottomWidth: "1px", borderBottomStyle: "solid", borderBottomColor: palette.Grayscale20,
  },
  groupTitle: { marginTop: 0, marginBottom: 0, fontSize: "16px", fontWeight: 600, lineHeight: "22px" },
  /**
   * `con_…_Body_Content_Buttom`: Height 50, horizontal, items centred, LayoutGap 10, PaddingRight 10.
   * Sticky: the canvas sizes the content to `Parent.Height - Buttom.Height`, so the bar is always
   * in view below the scrolling form.
   */
  bottomBar: {
    position: "sticky", bottom: 0, zIndex: 1,
    marginTop: "auto",
    display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: "10px",
    minHeight: "50px", paddingRight: "10px",
    backgroundColor: palette.white,
  },
  /** The bar's record stamp: two lines, classic `Label`, ExtraSmall (9 pt), `RGBA(50, 49, 48, 1)`. */
  stamp: {
    display: "flex", flexDirection: "column", justifyContent: "center", rowGap: "2px",
    fontSize: "12px", color: CANVAS_TEXT,
  },
  stampRow: { display: "flex", columnGap: "10px", whiteSpace: "nowrap" },
  stampLabel: { fontWeight: 600 },
  /** A canvas outline `ModernButton` (`BorderColor` / `Color` = `themePrimary`). */
  outlineButton: {
    // `ModernButton@1.0.0` with no Width / Height: the control's default 96 × 32.
    width: "96px", minWidth: "96px",
    // Only while enabled: a disabled button keeps Fluent's disabled colours.
    ":enabled": {
      color: palette.themePrimary,
      borderTopColor: palette.themePrimary, borderRightColor: palette.themePrimary,
      borderBottomColor: palette.themePrimary, borderLeftColor: palette.themePrimary,
    },
  },
  /** The 96-px button minimum (`pcf_btn_…_Save_2.Width`). */
  button: { width: "96px", minWidth: "96px" },
  /** A `ModernText` field caption: Semibold, `gblAppSizes.Font.ExtraLarge` (14). */
  fieldLabels: {
    "& .fui-Field__label": { fontWeight: 600, fontSize: "14px" },
  },
});
