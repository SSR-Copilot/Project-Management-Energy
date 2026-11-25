/**
 * Project Generators Screen — the styles every part of the screen shares (D143, the split of `Screen.tsx`).
 * Moved verbatim from `Screen.tsx`: one `makeStyles` block, so the sections and the lazily loaded panels read the same classes.
 */
import { makeStyles, tokens } from "@fluentui/react-components";
import { media, palette, space } from "@/theme/tokens";

/* ────────────────────────────────────────────────────────────────── styles */

/**
 * The 1-px rule under every card header: `rec_…_Separator.Fill: RGBA(0, 120, 212, 1)` (Y:2435, and the same on
 * every type's header), not the app's themePrimary (#006eb9). It was #e0e0e0, sampled on 17 Nov 2026 (D90) from
 * a WTG card, whose container keeps the `GroupContainer` default `DropShadow.Light` and so draws the blue rule
 * with a grey shadow over it; the PV, substructure, storage, hydrogen and substation rules are plainly blue on
 * the canvas (user screenshot pair, 18 Nov 2026). The WTG / inverter shadow is `cardShadow`.
 */
const CARD_RULE = "rgb(0, 120, 212)";
/** `ColorFade(ColorValue(gblAppTheme.palette.Warning), 60%)` — the Height Limitation tag. */
const HEIGHT_TAG_FILL = "rgb(248, 212, 158)";
/** `con_Milestones_Page_LockMessage_1.Fill` and its icon / text colour. */
export const LOCK_FILL = "rgb(89, 89, 89)";
export const LOCK_TEXT = "rgb(255, 255, 255)";

/** The gallery's `X: 20` inset, carried by each card's header and details (see `gallery`). */
const CARD_INSET = "20px";

/*
 * Layout transcribed from the canvas containers (UI layout pass, 20 Oct 2026):
 *  - `con_Generators_DisplayProject_Body_Form`: vertical; the command bar is the shell's slot;
 *  - `…_FirstColumn_PlantInfo_Fields`: PaddingTop 10, one 280 × 70 cell, caption at X 20;
 *  - each gallery (`gal_…`, X 20, Width `Parent.Width - 40`) is a list of CARDS: a 42-px header
 *    (selection dot at X 10, title at X 40, the chips and the fold icon right, a 1-px
 *    `RGBA(0,120,212)` rule at Y 41) and, while expanded, `…_CardDetails` (PaddingLeft / Right 20):
 *    the read-only fields in four `Parent.Width / 4` columns of 64-px cells (two rows when the
 *    card has more than four), then the WTG turbine bar, pager and grid (Width 850).
 */
export const useStyles = makeStyles({
  /** The command bar's first icon starts on the left edge of the content under it (PO, 21 Oct 2026); `CommandBar` has no inset of its own. Main bar: over "Total Capacity" (the capacity block's 20 px inset). */
  commandBar: { paddingLeft: "20px" },
  /** The expanded card's "Add Generator" bar: over "Supplier" (the detail grid's 20 px inset). */
  // The first detail column is flush with the card padding (see `detailCellFirst`), so no inset of its own.
  cardCommandBar: {},
  /*
   * The page fills the shell's content column and does not grow past it: the command bar and Total Capacity stay
   * put and only `scrollBody` scrolls, as `con_Generators_DisplayProject_Body_Form_FirstColumn` does in the canvas
   * (`Height: Parent.Height - 155`, `LayoutOverflowY: Scroll`, Y:1302-1314; user, 18 Nov 2026).
   */
  page: { display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0, minWidth: 0 },
  scrollBody: {
    display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0, minWidth: 0,
    overflowY: "auto", overflowX: "hidden", paddingBottom: "15px",
  },
  /** `con_…_PlantWtgCapacity` — 280 wide, 70 high, the caption and input inset 20. */
  capacity: {
    boxSizing: "border-box", width: "280px", maxWidth: "100%", minHeight: "70px",
    marginTop: "10px", paddingLeft: "20px", paddingRight: "20px",
  },
  /** `con_Milestones_Page_LockMessage_1` — horizontal, items centred, LayoutGap 10, PaddingLeft 20. */
  lock: {
    display: "flex", alignItems: "center", columnGap: "10px",
    paddingLeft: "20px", backgroundColor: LOCK_FILL, color: LOCK_TEXT,
  },
  /** `con_Milestones_pagelock_section_1` — Padding 8. */
  lockBullets: {
    display: "flex", flexDirection: "column", gap: space.xxs, color: LOCK_TEXT,
    paddingTop: "8px", paddingBottom: "8px", paddingLeft: "8px", paddingRight: "8px",
  },
  lockTitle: { fontWeight: 600, color: LOCK_TEXT },
  /**
   * `gal_…` sits at X 20, but the card's blue header rule runs edge to edge (PO, 28 Oct 2026): the
   * list has no margin, and its 20-px inset moves into the card header and details (`CARD_INSET`).
   */
  gallery: { display: "flex", flexDirection: "column", minWidth: 0 },
  /** `con_…_Card` — the canvas `Width: Parent.Width - 10` gap is dropped so the rule runs end to end. */
  card: { display: "flex", flexDirection: "column", minWidth: 0 },
  /**
   * D143 (item 8a): an expanded WTG card with a long turbine list (`isLongTurbineList`) is skipped while it is far off screen:
   * `content-visibility: auto` renders it only near the viewport, `contain-intrinsic-size: auto <h>` reserves its height (the last
   * measured one once it has been seen), so the scrollbar does not jump. No JS windowing: focus, keyboard navigation and every
   * `data-testid` query reach the rows as before (an off-screen subtree stays in the DOM and in the accessibility tree).
   * It sits on the CARD, not on the `<tr>`: size containment does not apply to table rows, so the property would do nothing there.
   */
  cardLongList: { contentVisibility: "auto", containIntrinsicSize: "auto 640px" },
  /**
   * `con_…_GeneratorType_Card` (Y:1344) and `con_…_Invertors_Card` (Y:3963) leave `DropShadow` at the
   * `GroupContainer@1.5.0` default, `DropShadow.Light` (every other card container sets `DropShadow.None`): the
   * WTG and inverter cards carry the light shadow the other screens draw as `shadow4`.
   */
  cardShadow: { boxShadow: tokens.shadow4 },
  /** `con_…_CardHeader` — Height 42, the separator 1 px at Y 41. */
  cardHeader: {
    display: "flex", alignItems: "center", columnGap: space.s, minHeight: "42px",
    paddingLeft: CARD_INSET,
    borderBottomWidth: "1px", borderBottomStyle: "solid", borderBottomColor: CARD_RULE,
  },
  /** `img_…_RowSelectionDot` — 18 × 18 at X 10; the title starts at X 40. */
  cardDot: { flexShrink: 0, marginLeft: "1px", width: "30px" },
  cardTitle: { flex: 1, minWidth: 0, display: "flex", "& > span": { flex: 1, minWidth: 0 } },
  /** `ico_…_Up` / `_Down` — 20 × 18, 32 from the right edge. */
  // 8, not the canvas 12: the 28-px button (`foldButton`) keeps the glyph centred 22 px from the edge, as the 20-px canvas icon is.
  cardFold: { flexShrink: 0, marginRight: "8px" },
  /**
   * `ico_…_Up` / `_Down` — a `Classic/Icon` (`Icon.ChevronUp` / `ChevronDown`) whose glyph spans the
   * full 20-px width of its box. Fluent's chevron path fills only ~68 % of its em box, so the icon is
   * 28 px to draw a ~20-px glyph. `Color: gblAppColors.Icon.Color` = themePrimary, `DisabledColor` =
   * Grayscale10 (App.pa.yaml:1321-1323).
   */
  foldIcon: { fontSize: "28px", width: "28px", height: "28px", color: palette.themePrimary },
  /** Fluent caps an icon-only small button at `max-width: 24px` with 1-px padding; lift it for the 28-px icon. */
  foldButton: {
    minWidth: "28px", maxWidth: "none", width: "28px", height: "28px",
    paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
  },
  foldIconDisabled: { color: palette.Grayscale10 },
  /** `con_…_CardDetails` — PaddingLeft / PaddingRight 20, LayoutGap 10. */
  cardDetails: {
    display: "flex", flexDirection: "column", rowGap: "10px",
    paddingLeft: `calc(${CARD_INSET} + 20px)`, paddingRight: "20px", paddingTop: space.s, paddingBottom: space.s,
  },
  /** Four `Parent.Width / 4` columns of 64-px cells, filled column by column. */
  detailGrid: {
    display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gridAutoRows: "64px",
    [media.belowMd]: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
  },
  detailGridTwoRows: { gridTemplateRows: "repeat(2, 64px)", gridAutoFlow: "column" },
  /**
   * `con_…_PvModule_CardDetails`: a horizontal auto-layout (LayoutGap 20) of `Width: 260` columns,
   * each two 64-px cells stacked with LayoutGap 2.
   */
  /**
   * Replace Generator / Replace PV Module Type: "Replace from" and "Replace to" side by side, each
   * under its heading rule (canvas screenshots, 28 Oct 2026). WTG: 280 + 314 px, 120 apart; PV: 310 + 310, 40 apart.
   */
  replaceGrid: {
    display: "grid", gridTemplateColumns: "280px 314px", columnGap: "120px", alignItems: "start",
    [media.belowMd]: { gridTemplateColumns: "minmax(0, 1fr)", rowGap: space.l },
  },
  replaceGridPv: { gridTemplateColumns: "310px 310px", columnGap: "40px" },
  replaceColumn: { display: "flex", flexDirection: "column", gap: space.m, minWidth: 0 },
  /**
   * The "Replace to" country toggle: its caption runs ~50 px past the 314-px fields on the canvas, so
   * it wraps on two lines (about 300 px of text), not three (user screenshot, 3 Nov 2026).
   */
  /*
   * The "Replace to" country filter as the canvas `con_GeneratorData_RightPanel_Form_Filter_Country`
   * (Y:14039-14169, the same block the Add Generator Type panel uses): a 94-high container holding
   *  - `tgl_…_Filter_Country`, a `Toggle@1.1.5` with NO label of its own, 40 high at the left;
   *  - `lbl_…_Filter_Country_Text`, a separate classic Label at X + 60 / Y 3 (5-px padding), 40 high,
   *    text centred, `gblAppSizes.Font.Medium` (11 pt = 14.67 px), rgb(50, 49, 48) — two lines;
   *  - `con_…_Filter_CountryAvailability`, its own 32-high row under the toggle: the 18-px info icon
   *    15 px in, the message 20 px after it.
   * Positions measured off the 1.21.753 canvas Replace panel (3 Nov 2026): the caption runs ~50 px past
   * the 314-px fields, and the availability row sits 63 px down.
   */
  // +70: the caption's 14.67-px first line ("…available in my", ~292 px on the canvas) needs ~320 px of
  // text width to wrap on two lines, not three — still inside the 830-px panel.
  countryFilter: { position: "relative", flexShrink: 0, height: "95px", width: "calc(100% + 70px)", marginTop: "5px" },
  countryFilterSwitch: { position: "absolute", left: "3px", top: 0, height: "40px", display: "flex", alignItems: "center" },
  countryFilterText: {
    position: "absolute", left: "65px", right: 0, top: "3px", height: "40px",
    display: "flex", alignItems: "center",
    fontSize: "14.67px", lineHeight: "20px", color: "rgb(50, 49, 48)",
  },
  countryFilterInfo: {
    position: "absolute", left: "15px", right: 0, top: "63px", height: "32px",
    display: "flex", alignItems: "center", columnGap: "5px", fontSize: "14px", color: "#242424",
  },
  /** The column heading: semibold, over a 1-px rule that runs a little past the fields. */
  replaceHeading: {
    fontSize: "15px", fontWeight: tokens.fontWeightSemibold, color: "#323130",
    paddingBottom: "6px", marginRight: "-20px",
    borderBottomWidth: "1px", borderBottomStyle: "solid", borderBottomColor: "#8a8886",
  },
  pvGrid: {
    display: "grid", gridTemplateRows: "repeat(2, 64px)", gridAutoFlow: "column", gridAutoColumns: "260px",
    columnGap: "20px", rowGap: "2px", maxWidth: "100%", overflowX: "auto",
  },
  /**
   * `con_…_{Storage,Hydrogen,Substation}_CardDetails_Context`: one horizontal auto-layout row
   * (LayoutGap 20) of `Width: Parent.Width/4` cells.
   */
  simpleGrid: {
    display: "grid", gridAutoFlow: "column", gridAutoColumns: "25%", gridTemplateRows: "64px",
    columnGap: "20px", maxWidth: "100%",
    [media.belowMd]: { gridAutoFlow: "row", gridAutoColumns: "auto", gridTemplateRows: "none", gridAutoRows: "64px" },
  },
  /** One read-only card field: the 20-px caption at X 20, the value box 5 px under it. */
  detailCell: {
    display: "flex", flexDirection: "column", rowGap: "5px", minWidth: 0,
    paddingLeft: "20px", paddingRight: "20px", fontSize: "14px",
  },
  /** Column 1's caption and box sit at X 0 and span the column (`Width: Parent.Width - Self.X*2`, X unset). */
  detailCellFirst: { paddingLeft: 0, paddingRight: 0 },
  /** The canvas card captions are Semibold. */
  detailLabel: {
    lineHeight: "20px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
    fontWeight: tokens.fontWeightSemibold,
  },
  /**
   * PV module card: `lbl_…_PvModule_CardDetails_*` is `Width: =Parent.Width-Self.X*2` while its box is a fixed
   * `Width: =260`, so a long caption ("Degradation Remaining Years [% per annum]") runs on past the box in full.
   */
  detailLabelFull: { overflow: "visible", textOverflow: "clip" },
  /** The canvas read-only `TextInput` (the `.canvas-field > input` look). */
  detailValue: {
    display: "flex", alignItems: "center", minHeight: "32px", boxSizing: "border-box",
    paddingLeft: "12px", paddingRight: "12px", borderRadius: "4px",
    backgroundColor: "#f4f4f4", color: "#242424",
    overflow: "hidden", whiteSpace: "nowrap",
  },
  /** The turbine grid (`FluentDetailsList`, Width 850): Semibold header captions. */
  turbineHead: { fontWeight: tokens.fontWeightSemibold },
  turbineTable: { tableLayout: "fixed", width: "850px", maxWidth: "100%" },
  /*
   * `…_GeneratorsList.Height: If(TotalRows < PageSize, TotalRows * 35 + 50, PageSize * 35 + 50)` (Y:2085-2098):
   * the box is the `maxHeight` set inline per card. The live canvas draws the rows about 35 px tall inside it
   * (user screenshot pair, 24 Nov 2026: six generators, no scrollbar), so the table uses 35-px rows under a
   * 42-px header and always fits its box (42 + 35n ≤ 50 + 35n). The 18 Nov 2026 reading of 42-px rows, which
   * made the last row spill and a scrollbar appear, is withdrawn (D162). `overflowY: auto` stays as a safety net
   * only; no gutter is reserved because a page never exceeds its box.
   */
  turbineScroll: { overflowY: "auto", overflowX: "hidden", maxWidth: "100%" },
  turbineHeadRow: { height: "42px" },
  /**
   * The over-height-limit icon, 16 px (Y:2382-2391). The column sets `TagColor: "rgb(255, 140, 0)"` and a per-row
   * `ImageColor` of `rgb(255, 172, 28)` (Y:2147-2148); the live grid draws the darker orange (user, 18 Nov 2026).
   */
  turbineInfo: { color: "rgb(255, 140, 0)", fontSize: "16px", display: "block" },
  /**
   * `columns_Items` `ColWidth` plus the list's cell padding: the name `Max(850 - 570, 40)`, Total
   * Height 155, Effective Capacity 255, then the 18- / 16-px edit and delete icons side by side.
   */
  turbineColName: { width: "296px" },
  turbineColHeight: { width: "171px" },
  turbineColCapacity: { width: "279px" },
  turbineColIcon: { width: "34px" },
  /** `AlternateRowColor: gblAppTheme.palette.Grayscale30` — every other row, starting with the first. 35-px rows (see `turbineScroll`). */
  turbineRow: { height: "35px", "&:nth-child(odd)": { backgroundColor: palette.Grayscale30 } },
  /** Numbers are right-aligned in the canvas card boxes (`Align.Right`). */
  detailValueNumeric: { justifyContent: "flex-end" },
  // 10 px between the tags: `con_Generator_GeneratorHeightLimitationTag.X = con_Generator_GeneratorStatus.X - Self.Width - 10`.
  title: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px" },
  /** `txt_…_GeneratorType` takes the header's width; the chips sit right of it. */
  /** `txt_…_GeneratorType` is a `Text@0.0.51` with no `Weight`: regular. */
  titleText: { flex: "1 1 auto", fontWeight: tokens.fontWeightRegular },
  /** `con_…_RequestState` / `lbl_Generator_GeneratorStatus` — a 24-px chip, Medium / ExtraSmall. */
  chip: {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    minHeight: "24px", minWidth: "100px", boxSizing: "border-box",
    // `con_Generator_GeneratorStatus.Radius*: =34` — a pill, as on the live screen.
    borderRadius: "34px",
    paddingLeft: space.s, paddingRight: space.s,
    fontSize: "12px", color: palette.Grayscale00,
    borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
    borderTopStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid", borderLeftStyle: "solid",
    borderTopColor: palette.Grayscale10, borderRightColor: palette.Grayscale10,
    borderBottomColor: palette.Grayscale10, borderLeftColor: palette.Grayscale10,
    backgroundColor: palette.Grayscale40,
  },
  /**
   * `con_…_RequestState` (Y:3688-3758): a 165 × 24 box, 1-px border, the label centred at
   * `gblAppSizes.Font.Medium`, coloured by state — border and text `gblAppColors.Success / Error /
   * Warning`, fill the matching `…Bg` (the palette colour + `20` alpha: 12.5 %). Canceled: no border
   * or fill, the text `ButtonDisabledBg` #bdbdbd.
   */
  permChip: {
    display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    width: "165px", height: "24px", boxSizing: "border-box", borderRadius: "4px",
    fontSize: "14.67px", whiteSpace: "nowrap",
    borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
    borderTopStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid", borderLeftStyle: "solid",
    borderTopColor: "transparent", borderRightColor: "transparent",
    borderBottomColor: "transparent", borderLeftColor: "transparent",
  },
  permSuccess: {
    color: palette.akzent3, backgroundColor: `${palette.Green}20`,
    borderTopColor: palette.akzent3, borderRightColor: palette.akzent3,
    borderBottomColor: palette.akzent3, borderLeftColor: palette.akzent3,
  },
  permError: {
    color: palette.akzent5, backgroundColor: `${palette.Error}20`,
    borderTopColor: palette.akzent5, borderRightColor: palette.akzent5,
    borderBottomColor: palette.akzent5, borderLeftColor: palette.akzent5,
  },
  permWarning: {
    color: palette.Warning, backgroundColor: `${palette.Warning}20`,
    borderTopColor: palette.Warning, borderRightColor: palette.Warning,
    borderBottomColor: palette.Warning, borderLeftColor: palette.Warning,
  },
  permDisabled: { color: "#bdbdbd" },
  // `con_Main_PopUp_Common_Generators_PreventTotalCapacity_Information` (Y:17341-17506) is the
  // shared `InformationPopUp` (`@/components`), at its default (Generators) size.
  /** `con_Generator_GeneratorStatus` while Active: Green border, SuccessLight fill. */
  chipActive: {
    borderTopColor: palette.Green, borderRightColor: palette.Green,
    borderBottomColor: palette.Green, borderLeftColor: palette.Green,
    backgroundColor: palette.SuccessLight,
  },
  /** `con_Generator_GeneratorHeightLimitationTag` */
  /**
   * `con_Generator_GeneratorHeightLimitationTag` (Y:2779): 120 wide (`Max(lbl.Width = 120, 50)`), the label
   * `ColorFade(Warning, -60%)` on `ColorFade(Warning, 60%)`, the border the status tag's (Green while Active).
   */
  heightTag: {
    backgroundColor: HEIGHT_TAG_FILL, color: "rgb(95, 59, 5)",
    width: "120px", minWidth: 0, paddingLeft: 0, paddingRight: 0, flexShrink: 0,
  },
  heightTagActive: {
    borderTopColor: palette.Green, borderRightColor: palette.Green,
    borderBottomColor: palette.Green, borderLeftColor: palette.Green,
  },
  /**
   * `con_Generator_GeneratorStatus` (Y:2538): 80 wide (`Max(lbl.Width = 80, 50)`) at `X = Parent.Width -
   * Padding.Page (10) - Self.Width - 40`, so it ends 50 px from the header's right edge, 18 px before the
   * chevron's 20-px box at `Parent.Width - 32`; the 28-px fold button starts 36 from the edge, hence 6 + gap 8.
   */
  chipStatus: { width: "80px", minWidth: 0, paddingLeft: 0, paddingRight: 0, flexShrink: 0, marginRight: "6px" },
  // 850 for the turbine grid plus room for the scroll box's vertical scrollbar (`turbineScroll`,
  // `scrollbar-gutter: stable`), which otherwise ate the last (info) column (user screenshot, 18 Nov 2026).
  expanded: { display: "flex", flexDirection: "column", gap: space.s, maxWidth: "870px", minWidth: 0, overflowX: "auto" },
  warning: { fontSize: tokens.fontSizeBase200, color: palette.Warning },
  /**
   * The turbine panel's "Apply to all" warning as the canvas draws it (canvas pair, 17 Nov 2026): an
   * orange Information icon before the text, the pair tucked just under its checkbox.
   */
  applyAllWarning: {
    // Smaller and tighter than `warning` (12/16 px): the canvas text is ~11 px on 11-px lines, so the two
    // lines take ~half the height they did ("…of the selected" / "WTG type?" break kept).
    display: "flex", alignItems: "flex-start", columnGap: "6px", marginTop: "-8px", width: "345px", maxWidth: "100%",
    fontSize: "11px", lineHeight: "12px",
    "& > svg": { flexShrink: 0, marginTop: "-1px" },
  },
  note: { fontSize: tokens.fontSizeBase200, color: palette.Error },
  /**
   * `con_…GeneratorType_CardDetails_Pagination_Buttons` (Y:1885): a 24-high horizontal row, `LayoutGap: =5`,
   * `LayoutJustifyContent: End`, `Width: =<GeneratorList>.Width - 20` (850 − 20) — so the pager ends 20 px
   * short of the grid's right edge, not at the left of the card (screenshot, 6 Nov 2026).
   */
  pager: {
    display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "5px",
    width: "830px", maxWidth: "100%", height: "24px", flexShrink: 0,
  },
  /** `lbl_…_GeneratorsList_TotalRows` (Y:1914): Width 100, `Align: Start`, `Size: =12` (modern Text, px). */
  pagerTotalRows: { width: "100px", flexShrink: 0, textAlign: "left", fontSize: "12px", whiteSpace: "nowrap" },
  /** `lbl_…_GeneratorsList_Pagination` (Y:1993): Width 120, `Align: Center`, `Size: =12`. */
  pagerPage: { width: "120px", flexShrink: 0, textAlign: "center", fontSize: "12px", whiteSpace: "nowrap" },
  /**
   * The three `cat_PowerCAT.Icon`s, `IconType: IconButon` (Y:1925 / 1955 / 2005): 24 × 24, `FillColor`
   * themePrimary with a white 16-px glyph (`FontColor` white, `FontSize: =16`), `HoverFillColor` themeLighter /
   * `HoverFontColor` themePrimary; disabled, a light grey square — the Project list pager's `iconButton`, at 24.
   */
  pagerButton: {
    minWidth: "24px", width: "24px", height: "24px", padding: 0, flexShrink: 0,
    borderRadius: "2px",
    backgroundColor: palette.themePrimary, color: palette.white,
    "& svg": { fontSize: "16px", width: "16px", height: "16px" },
    ":hover:enabled": {
      backgroundColor: palette.themeLighter, color: palette.themePrimary,
      borderTopColor: palette.themePrimary, borderRightColor: palette.themePrimary,
      borderBottomColor: palette.themePrimary, borderLeftColor: palette.themePrimary,
      borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
      borderTopStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid", borderLeftStyle: "solid",
    },
    ":disabled": { backgroundColor: palette.neutralLighter, color: palette.white },
    "&:disabled .fui-Button__icon": { color: palette.white },
    "&:disabled svg": { color: palette.white },
  },
  panelBody: { display: "flex", flexDirection: "column", gap: space.m },
  /**
   * `con_…_Filter_CountryAvailability`, under the toggle: `ico_…_Filter_Message` (18 px, X 15,
   * Success / Warning) and the message 20 px right of it.
   */
  filterAvailability: { display: "flex", alignItems: "center", columnGap: "20px", minHeight: "32px", paddingLeft: "15px" },
  /** `cmb_Supplier` & co.: `Width: Parent.Width - Self.X*2 - 80` — 314 px in the 450-px panel. */
  typeField: { width: "314px", maxWidth: "100%" },
  prefixRow: { display: "flex", alignItems: "center", gap: space.s },
  /** The Add Generator fields: `Width: Parent.Width/2 + Self.X + 20` — 265 px in the 450-px panel. */
  turbineField: { width: "265px", maxWidth: "100%" },
  /** `lbl_…_GeneratorName_Prefix`: 180 wide, `Align.Right`, at X 20 — the input follows it. */
  namePrefix: { flex: "0 0 auto", width: "180px", textAlign: "right", fontSize: "14px", color: "#323130" },
  /** `txt_…_GeneratorName`: `Width: 80`. */
  nameIndex: { flex: "0 0 80px", width: "80px" },
  dropdown: { minWidth: "0px", width: "100%" },
  /**
   * `lbl_…_Generator_ErrorMessageProjectManager(_1)` (Y:11541-11569, Y:15132): a `Size: 8` (10.67 px) label in
   * `gblAppColors.Error`, INSIDE the button container at the panel's foot, left of Save / Cancel, from the fields' X.
   * First child of the footer: `canvas.css` pushes the first child right (`margin-left: auto`), hence the override.
   */
  footerHint: {
    flexGrow: 1, flexShrink: 1, flexBasis: "auto", minWidth: 0, marginLeft: "0 !important",
    alignSelf: "flex-end", textAlign: "left", color: palette.Error, fontSize: "10.67px", lineHeight: "14px",
  },
  footerPrimary: { height: "32px", minWidth: "96px", fontSize: "15px" },
  footerCancel: {
    height: "32px", minWidth: "96px", fontSize: "15px",
    backgroundColor: palette.white, color: palette.themePrimary,
    borderTopColor: palette.themePrimary, borderRightColor: palette.themePrimary,
    borderBottomColor: palette.themePrimary, borderLeftColor: palette.themePrimary,
  },
});
