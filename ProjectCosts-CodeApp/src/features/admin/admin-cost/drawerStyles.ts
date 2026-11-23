/**
 * Styles shared by the two side panels.
 *
 * DIVERGENCE: ONE error colour for both panels (`palette.Error`, #B22727). The canvas uses #B22727
 * in the contract panel and #d20532 in the DEVEX panel (a canvas inconsistency).
 *
 * No blanket input colour here: the canvas sets the standard-assumption pair (`FontColor:
 * themePrimary` / `FontItalic: true`) PER CONTROL, so each drawer passes the shared `standard`
 * style (`@/components`, CONVENTIONS rule 20) to exactly the controls that carry it —
 * `devexFieldStandard` / `opexFieldStandard` in `rules.ts` say which.
 */
import { makeStyles, tokens } from "@fluentui/react-components";
import { palette } from "@/theme/tokens";

export const useDrawerStyles = makeStyles({
  form: {
    display: "flex", flexDirection: "column", rowGap: "14px",
    paddingTop: "12px", paddingBottom: "12px",
    "& .fui-Label__required": { color: palette.Error },
  },
  columns: {
    display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: "24px", rowGap: "14px",
    "@media (max-width: 640px)": { gridTemplateColumns: "1fr" },
  },
  column: { display: "flex", flexDirection: "column", rowGap: "14px", minWidth: "0" },
  error: { color: palette.Error, fontWeight: tokens.fontWeightSemibold, fontSize: "12px" },
  inline: { display: "flex", columnGap: "12px", alignItems: "flex-end", flexWrap: "wrap" },
  /**
   * `chk_…_ApplyVat` / `chk_…_Depreciation` (ACS:10140-10170): one under the other, Depreciation at
   * `ApplyVat.Y + ApplyVat.Height + 10`. They had been drawn side by side (user screenshot pair, 23 Nov 2026).
   */
  stack: { display: "flex", flexDirection: "column", alignItems: "flex-start", rowGap: "10px" },
  /**
   * `chk_AdminCost_RightPanel_SelectCluster1…5`: one cluster per line, as the canvas lists them. Fluent's
   * Checkbox is inline-flex, so left in a plain div the short labels ran on (Cluster 2 and 3 shared a line).
   */
  checkList: { display: "flex", flexDirection: "column", alignItems: "flex-start" },
  commentBlock: { position: "relative" },
  counter: { position: "absolute", top: "0", right: "0", fontSize: "12px", color: palette.black },
  /**
   * The contract / period panel's `DisplayMode.Disabled` modern controls — `txt_…_Description_1`, `txt_…_StartDate`
   * (TextInput, ACS:5091, 5314) and `drp_…_Currency_1` (DropDown, ACS:5600): a WHITE box with a 1 px #E3E3E3 outline
   * and the control's disabled grey text (RGBA(161,159,157)), as the user's canvas screenshot shows (23 Nov 2026).
   * canvas.css's `.canvas-panel :is(.fui-Input,.fui-Dropdown,…) { background: #f4f4f4; border: 0 }` (0-2-0) is
   * out-ranked by these (0-3-x) rules; the shared standard class's `& input { color }` (0-1-1) too, so the grey wins
   * over the pair's blue while the italic stays. Only the disabled controls; the editable ones keep the grey fill.
   */
  disabledLook: {
    "& .fui-Field .fui-Input:has(> input:disabled), & .fui-Field .fui-Dropdown:has(> button:disabled)": {
      backgroundColor: tokens.colorNeutralBackground1,
      borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
      borderTopStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid", borderLeftStyle: "solid",
      borderTopColor: "#e3e3e3", borderRightColor: "#e3e3e3", borderBottomColor: "#e3e3e3", borderLeftColor: "#e3e3e3",
    },
    "& .fui-Field .fui-Input > input:disabled": { color: "#a19f9d", WebkitTextFillColor: "#a19f9d" },
    "& .fui-Field .fui-Dropdown > button:disabled, & .fui-Field .fui-Dropdown > button:disabled svg": { color: "#a19f9d" },
    /*
     * ONE hover for every enabled dropdown of the form (user, 23 Nov 2026: the hover colour differed between them):
     * the filled box keeps its #f4f4f4 and shows the modern DropDown's hover accent, a 1 px darker bottom line
     * (Fluent's `colorNeutralStrokeAccessibleHover`), whichever Field or validation state the box is in.
     */
    "& .fui-Field .fui-Dropdown:not(:has(> button:disabled)):hover": {
      backgroundColor: "#f4f4f4",
      borderBottomWidth: "1px", borderBottomStyle: "solid", borderBottomColor: tokens.colorNeutralStrokeAccessibleHover,
    },
  },
  /**
   * The open list of the period panel's dropdowns, as the modern `DropDown@0.0.45` draws it (user's canvas
   * screenshot, 23 Nov 2026): as wide as its box (Fluent's 160 px minimum is off; the width comes from
   * `positioning.matchTargetSize`), 27 px rows with the text at the left (no check-mark column), the hovered row
   * themePrimary with white text, and about twenty rows before it scrolls (Fluent's default was 80 % of the
   * viewport, so the 36-year list ran the full panel height).
   */
  listbox: {
    maxHeight: "540px", minWidth: "0", boxSizing: "border-box",
    "& .fui-Option": { minHeight: "27px", paddingTop: "3.5px", paddingBottom: "3.5px", columnGap: "0" },
    "& .fui-Option__checkIcon": { display: "none" },
    "& .fui-Option:hover": { backgroundColor: palette.themePrimary, color: palette.white },
  },
  /**
   * The period panel's captions and field pitch (user screenshot pair, 23 Nov 2026): every caption
   * `lbl_LandLease_RightPanel_NewEdit…_1` is `gblAppStyles.Label` at `Size: Medium` (11 pt = 14.67 px) in a 32 px
   * row (`Height: =32*1`, text vertically centred), the 32 px box starts right under it (`Y: =label.Y + label.Height`),
   * and the field containers are 76 px apart — so 12 px between fields (`periodColumn`). Fluent's 14 px caption with
   * its 2 px paddings and the 14 px column gap gave 72 px and smaller text.
   * The required `*` is `lbl_…Asterisk_1`: `Color: palette.Error`, `FontWeight: Bold`, `Size: Medium`, 10 wide at
   * `X: =caption.X - Self.Width` (ACS:5524-5555) — hung 10 px LEFT of the caption, slightly raised.
   */
  periodFields: {
    // The panel body's padding (11 px, `panel`) plus the caption row's 6 px above its text puts the first caption's
    // text 17 px under the header, as the canvas does (user screenshot, 23 Nov 2026: the shared 12 px form padding
    // on top of the 20 px body padding and the 32 px row left a 48 px hole).
    paddingTop: "0",
    "& .fui-Field .fui-Field__label": {
      position: "relative", display: "flex", alignItems: "center", minHeight: "32px",
      paddingTop: "0", paddingBottom: "0", marginBottom: "0",
      // 11 pt Open Sans on the canvas measures ~7 % wider than 11 pt (14.67 px) here: 15.75 px, as canvas.css sizes the Opex panel captions.
      fontSize: "15.75px", lineHeight: "20px",
    },
    "& .fui-Field .fui-Field__label .fui-Label__required": {
      position: "absolute", left: "-10px", top: "3px", width: "10px",
      marginLeft: "0", paddingLeft: "0", paddingRight: "0",
      color: palette.Error, fontWeight: tokens.fontWeightBold, fontSize: "15.75px",
    },
  },
  periodColumn: { rowGap: "12px" },
  /** `tgl_…_InflationProfile_1` and `tgl_…_CountryInflationProfile_1`: 35 px apart (`Y: =35`, ACS:6990), a 32 px Switch each. */
  inflationToggles: { display: "flex", flexDirection: "column", alignItems: "flex-start", rowGap: "3px" },
  /** `drp_…_DurationYears_1` 100 wide, `drp_…_DurationMonths_1` 120 wide and 20 px apart (ACS:5460-5462, 5474). */
  durationRow: { display: "flex", columnGap: "20px", alignItems: "flex-end", flexWrap: "wrap" },
  /**
   * Panel chrome for the period panel only: the title `lbl_LandLease_RightPanel_NewEditPeriod_BodyHeader_1` is
   * `Font.Large` (12 pt = 16 px) Semibold (ACS:4908-4911); the shared 18 px title in the fixed 48 px header wrapped
   * "Add Contract Type : Technical Commercial Management Agreement (TCMA)" onto a second, clipped line (user
   * screenshot, 23 Nov 2026). 16 px, and the header grows with a wrapped title instead of cutting it.
   */
  panel: {
    "& .canvas-panel-header.canvas-panel-header": { height: "auto", minHeight: "48px" },
    /*
     * 12 pt Open Sans on the canvas draws about 6 % larger than 12 pt (16 px) of the code app's fallback face: the
     * canvas title measured 17 px tall / 297 px wide against 16 / 280 here (user screenshots, 23 Nov 2026), so 17 px,
     * the same compensation `canvas.css` gives the Opex panel header.
     */
    "& .canvas-panel-header.canvas-panel-header h2": { fontSize: "17px", lineHeight: "24px", whiteSpace: "normal", overflowWrap: "anywhere" },
    /* `con_…_BodyContent` starts about 11 px under the header: with the caption row's 6 px, the first caption's text is 17 px down. */
    "& .canvas-panel-body.canvas-panel-body": { paddingTop: "11px" },
  },
});
