/**
 * OPEX — `Operation & Maintenance` and `Other OPEX Costs`.
 *
 * ONE canvas screen, TWO rail items. `App.pa.yaml:102-125` points both `O&MKey` and
 * `OtherOpexCostsKey` at `Opex Costs Screen`, and `OnVisible` (`:9-14`) derives the mode from the
 * selected rail key. Here the mode arrives as a route prop. Land Lease is a DIFFERENT canvas
 * screen and is deliberately not served by this component.
 *
 * COMPOSITION ONLY. Every decision — which cards, which commands, which columns, which panel
 * fields, what saves — lives in `./opexRules.ts`, which was ported from the canvas Power Fx with
 * line-level provenance. This file wires those answers to Fluent controls and to the settled data
 * layer (`@/features/cost/costing/useCostBook`, `@/data/periodWrites`). Where a rule is deliberately
 * NOT called, the reason is written at the call site.
 *
 * Canvas control map (`Src/Opex Costs Screen.pa.yaml`, 230 controls):
 *
 *   `gal_OpexCosts_Content_GeneratorsInProject`          → `<OpexCard>` per device type (O&M)
 *   `gal_OpexCosts_Content_Subaccounts`                  → `<OpexCard>` per sub-account (Other)
 *   `con_…_CardHeader` + `ico_…_Up` / `_Down`            → the card's header button + chevron
 *   `con_AlignWithProjectDuration_Container`             → the header's duration badge
 *   `pcf_…_CommandBar` / `…_SubaccountsCommandBar`       → `<CardToolbar>`
 *   `con_…_CardBody_CostsTableHeader` + `gal_…_Costs`    → the `<table>`
 *   `inf_OpexCost_AlignWithDuration`                     → the amber info button in the row
 *   `con_OpexCosts_RightPanel_NewEditCost`               → `<FormPanel>` (left/right columns)
 *   `cmp_OpexCosts_PopUpConfirmation_DeleteCost`         → `<ConfirmDialog>`
 *   `cmp_OpexCosts_PopUpLoading`                         → `<WriteStatus>` + the write guard
 *                                                          (D58 DIVERGENCE: no spinner, no scrim)
 *
 * Reference screenshots:
 *   `Cost App - O & M Selected Tab - Almost same for Landlease and other Opex also.png`
 *   `Cost App - Other opex -  Tab selected.png`
 *   `Cost App - Add & Edit ContractPeriod Panel - Almost same for Landlease and other Opex also.png`
 */
import { useMemo, useState } from "react";
import {
  Button, Dropdown, Input, Option, Switch, Text, Tooltip,
  makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import {
  AddRegular, ArrowClockwiseRegular, ChevronDownRegular, ChevronUpRegular,
  DeleteRegular, EditRegular, InfoRegular,
} from "@fluentui/react-icons";
import { ConfirmDialog, CostField, DateInput, EmptyState, FormPanel, LoadingOverlay, PanelButtons, WriteStatus, useCommandRowStyles, useStandardValueClass } from "@/components";
import { useSession } from "@/app/SessionContext";
import { costWriteStatusLabel, writeCommandsDisabled } from "@/domain/writeGuard";
import { useCostWriteInFlight, useWriteFailureReport } from "@/features/cost/costing/useCostWriteFlight";
import { useProjectExtras } from "@/features/cost/contracts/hooks";
import {
  useAddStandardContract, useCostBook, useCountryInflation, useCountryInflationAreas,
  useOpexAssumptionScopes, useOpexCatalog, useOpexDeviceTypes,
} from "@/features/cost/costing/useCostBook";
import type { CostPeriod } from "@/features/cost/costing/model";
import { palette, space } from "@/theme/tokens";
import {
  DELETE_DIALOG, DURATION_BADGE_TEXT, DURATION_MONTH_OPTIONS, DURATION_YEAR_OPTIONS,
  OPEX_AGGREGATION, OPEX_AGGREGATION_LABEL, OPEX_COMMAND_ICONS, OPEX_COMMAND_LABELS,
  OPEX_DISTRIBUTION_FREQUENCY, OPEX_MODE_NAMES, OPEX_MSG, OPEX_PANEL_LABELS, THRESHOLD_TYPE,
  addPeriodRecordType, alignWithProjectDurationDefault, areaFieldVisible, areaFieldVisibleIntended,
  areaWithRegion, canSaveOpexCost, chainHead, chainLastPeriod, childrenOf, costName, costsInScope,
  countryInflationPercent, defaultCurrencyCode,
  defaultSubaccount, deleteDialogTextCanvasParity, deviceTypeList, durationBadge, externalContractDefault,
  inflationProfileCountryText, inflationProfileDefault, inflationStartYearDefault,
  inheritStartDateStandard, italyZone, matchesStandardAssumption, nextPeriodDescriptionPanel,
  guardOpexCommands, omDurationBadge, opexColumns, opexCommands,
  opexFormErrors, panelFieldModes, panelRateLabel, panelRequiredMarkers, panelTitle, planDeleteCost,
  resetStartDateFlag, resetStartDateVisible, selectedAccount, showAtLeastOneFigureHint,
  showEurPerWtgField, showThresholdColumn, standardAssumptionFilter, startDateDefault,
  startDateStandardFlagAfterManualChange,
  subaccountsForMode, thresholdToggleLabel, toOpexRow, toggleRowSelection, visibleCommands,
  type CountryInflationProfile, type FieldMode, type OpexCommandKey, type OpexCost, type OpexForm,
  type OpexMode, type OpexProjectContext, type OpexSubaccount, type PanelContext,
  type RowSelection,
} from "./opexRules";

/* ═══════════════════════════════════════════════════════════ reference data ══ */

/**
 * `colOpexAccounts` / `colOpexSubaccounts` used to be TRANSCRIBED CONSTANTS here, because
 * `src/data/*` carried no loader for them. They are now `useOpexCatalog()`
 * (`data/opexCatalog.ts` -> `costRepository().listOpexAccounts/listOpexSubaccounts`), which
 * returns the same `OpexAccount` / `OpexSubaccount` shapes `selectedAccount`,
 * `defaultSubaccount` and `subaccountsForMode` already took.
 *
 * Measured on VSBCloud_Dev, 16 Sep, the live rows are exactly what was transcribed — two
 * accounts (`Operation & Maintenance` Order 1, `Other OPEX Costs` Order 2) and nine sub-accounts
 * — so this renders identically today and stops being silently wrong the day an admin adds one.
 */

/**
 * `drp_…_Currency.DefaultSelectedItems` resolves a `Currencies` ROW; the book carries the
 * currency's NAME. These two maps are the only translation needed, and the panel's rate labels
 * (`panelRateLabel`) switch on the CODE, not on the country.
 */
const CURRENCY_NAME_BY_CODE: Record<string, string> = { EUR: "Euro", PLN: "Polish Zloty" };
const CURRENCY_CODE_BY_NAME: Record<string, string> = {
  Euro: "EUR", "Polish Zloty": "PLN", "Czech Koruna": "CZK", "Romanian Leu": "RON",
};
const currencyCodeOf = (name: string | null): string =>
  CURRENCY_CODE_BY_NAME[name ?? ""] ?? "EUR";

/** `rdg_…_Threshold.Items: Choices(Thresholds)` — the option set's display names (`:1714-1716`). */
const THRESHOLD_OPTIONS: readonly { value: number; label: string }[] = [
  { value: THRESHOLD_TYPE.netYieldP75, label: "Net Yield p75" },
  { value: THRESHOLD_TYPE.netYieldP90, label: "Net Yield p90" },
  { value: THRESHOLD_TYPE.individual, label: "Individual" },
];

const AGGREGATION_OPTIONS: readonly number[] = [
  OPEX_AGGREGATION.sum, OPEX_AGGREGATION.max, OPEX_AGGREGATION.min,
];

/* ══════════════════════════════════════════════════════════════════ styles ══ */

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: space.s, minWidth: 0 },
  /*
   * `gal_…_Subaccounts` / `gal_…_GeneratorsInProject` - `TemplatePadding: =0`, so the cards touch.
   * Each `con_…_Card` is `Parent.Width - 10` wide with no border (`BorderStyle.None`); the thin
   * line between cards is the `GroupContainer`'s default light drop shadow.
   */
  cardList: { display: "flex", flexDirection: "column", rowGap: 0 },
  card: {
    width: "calc(100% - 10px)",
    backgroundColor: palette.white,
    boxShadow: "0 0 2px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.14)",
  },
  /*
   * `con_…_CardHeader` - 42 px, `Fill: =ColorValue("#fdffff")`; the title at `X: =20`, the chevron
   * at `Parent.Width - 20 - 6`, the badge 20 px left of the chevron. No hover fill on the canvas.
   */
  cardHeader: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    width: "100%", height: "42px", columnGap: "20px",
    paddingTop: 0, paddingBottom: 0, paddingLeft: "20px", paddingRight: "6px",
    backgroundColor: "#fdffff",
    borderTopStyle: "none", borderRightStyle: "none",
    borderBottomStyle: "none", borderLeftStyle: "none",
    cursor: "pointer",
  },
  // The line between an open card's header and its body.
  cardHeaderOpen: {
    borderBottomStyle: "solid", borderBottomWidth: "1px", borderBottomColor: "#e1dfdd",
  },
  /*
   * `ico_…_CardHeader_Up` / `_Down` - `Icon.ChevronUp` / `ChevronDown`, 20 x 18,
   * `gblAppStyles.Icon.Color` (themePrimary). The classic glyph spans its whole box; Fluent's
   * draws about 12 px wide inside a 20 px box, so the icon is drawn at 28 px and pulled in by
   * the glyph's own inset to keep the 20 px gap to the badge and the 6 px right margin.
   */
  chevron: {
    width: "28px", height: "28px", fontSize: "28px", flexShrink: 0,
    marginLeft: "-5px", marginRight: "-5px",
    color: palette.themePrimary,
  },
  /*
   * `lbl_OpexCosts_Content_SubaccountsCardHeader_SubaccountName` — `Size: Medium`,
   * `FontWeight.Normal` and `Color: =gblAppStyles.Label.Color`, which `App.Formulas` defines
   * as `ColorValue(gblAppTheme.palette.black)`. Sampled at (11, 11, 11) on both the Other
   * OPEX and the O&M reference. It is NOT the link colour; an earlier note here said it was,
   * and the section headings rendered blue because of it.
   */
  cardTitle: {
    // `Size: =gblAppSizes.Font.Medium` - 11 pt (`OnStart.txt:310-318`). Canvas sizes are points.
    fontSize: "11pt", color: palette.black,
    textAlign: "left", flexGrow: 1, minWidth: 0,
  },
  /*
   * `con_AlignWithProjectDuration_Container` - a 24 px pill (`Radius*: =34`), at least 50 wide,
   * filled `SuccessLight` / a 60 % faded `Warning`, with `BorderColor: =ColorFade(Self.Fill, -30%)`
   * (the fill 30 % darker) at 1 px. The caption is `Grayscale00`, 9 pt, centred, for both.
   */
  badge: {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    boxSizing: "border-box", height: "24px", minWidth: "50px", flexShrink: 0,
    fontSize: "9pt", whiteSpace: "nowrap", color: palette.Grayscale00,
    paddingTop: 0, paddingBottom: 0, paddingLeft: "15px", paddingRight: "15px",
    borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
    borderTopStyle: "solid", borderRightStyle: "solid",
    borderBottomStyle: "solid", borderLeftStyle: "solid",
    borderTopLeftRadius: "34px", borderTopRightRadius: "34px",
    borderBottomLeftRadius: "34px", borderBottomRightRadius: "34px",
  },
  // #E9F3EC x 0.7 = #A3AAA5.
  badgeMatch: {
    backgroundColor: palette.SuccessLight,
    borderTopColor: "#A3AAA5", borderRightColor: "#A3AAA5",
    borderBottomColor: "#A3AAA5", borderLeftColor: "#A3AAA5",
  },
  // `ColorFade(Warning, 60%)` = #F8D49E; x 0.7 = #AE946E.
  badgeMismatch: {
    backgroundColor: "#F8D49E",
    borderTopColor: "#AE946E", borderRightColor: "#AE946E",
    borderBottomColor: "#AE946E", borderLeftColor: "#AE946E",
  },
  // `useCommandRowStyles` puts the first icon on this 12 px edge — over the cost table's
  // select column (`selectCell`, 12 px in) — and the commands 16 px apart (21 Oct 2026).
  // Inside `scroll`, whose 20 px inset this 10 px adds to: the first icon lands over the
  // radio at X = 10 (`img_…_RadioSelection.X`), as on the canvas.
  toolbar: {
    display: "flex", alignItems: "center", gap: space.m, flexWrap: "wrap",
    paddingLeft: "10px", paddingRight: space.m, paddingBottom: space.xs,
  },
  command: { color: tokens.colorBrandForegroundLink, fontWeight: tokens.fontWeightRegular },
  /*
   * `pcf_…_SubaccountsCommandBar` is a `cat_PowerCAT.CommandBar`, the same PCF the Contracts
   * command bar uses: a BLACK label with a blue leading icon, greying to #595959 / #c8c6c4
   * when disabled. Sampled off `UI Screenshots/Cost App - Other opex -  Tab selected.png` —
   * "Add Contract Type" reads (0, 0, 0) with a blue `+`, and the disabled "Add Period"
   * beside it reads (89, 89, 89). Painting the whole button with the brand link colour made
   * the toolbar read as a row of hyperlinks.
   *
   * NOT `command`, which stays as it is: that one dresses `btn_OneTimePayment2_…`, a modern
   * `Button@0.0.45` with `Appearance: Outline` inside the panel, which is a different
   * control with different colours.
   */
  toolbarCommand: {
    color: palette.neutralPrimary,
    fontWeight: tokens.fontWeightRegular,
    "& .fui-Button__icon": { color: palette.themePrimary },
  },
  toolbarCommandDisabled: {
    color: palette.neutralTertiary,
    "& .fui-Button__icon": { color: palette.neutralTertiaryAlt },
  },
  /*
   * `con_…_CardBody` - `LayoutOverflowX: =LayoutOverflow.Scroll`, `PaddingLeft: =20`. The
   * command bar, header and gallery all sit in it, and the gallery is a fixed width wider than
   * the screen, so the whole body scrolls sideways under a permanent grey bar.
   */
  scroll: {
    overflowX: "auto", paddingLeft: "20px", paddingBottom: space.xxs,
    scrollbarColor: "#868686 #f1f1f1",
    "::-webkit-scrollbar": { height: "10px" },
    "::-webkit-scrollbar-track": { backgroundColor: "#f1f1f1" },
    "::-webkit-scrollbar-thumb": {
      backgroundColor: "#868686",
      borderTopLeftRadius: "5px", borderTopRightRadius: "5px",
      borderBottomLeftRadius: "5px", borderBottomRightRadius: "5px",
    },
  },
  // Fixed layout so every column holds its canvas width; `width` is set inline to their sum.
  table: { tableLayout: "fixed", borderCollapse: "collapse", whiteSpace: "nowrap" },
  /*
   * `lbl_…_CardBody_CostsTableHeader_*` — `Color: gblAppStyles.Label.Color` (the app's dark
   * label colour) with `FontWeight.Semibold`. Without an explicit colour these headings picked
   * up the link blue from the card around them, which is what made the row of column titles
   * read as blue rather than as plain dark labels.
   */
  // `CostsTableHeader` is 34 px high; each caption is `gblAppSizes.Font.Small` (10 pt), semibold.
  th: {
    textAlign: "left", fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
    fontSize: "10pt", height: "34px",
    paddingTop: 0, paddingBottom: 0,
    paddingLeft: "6px", paddingRight: "6px",
    // A caption is never cut: one a little wider than its lane runs on, as canvas labels do.
    overflow: "visible",
  },
  alignRight: { textAlign: "right" },
  /*
   * Every cell label carries the SAME colour rule, not one per column:
   * `Color: =If(StartsWith(ThisItem.Description, "Standard"), themePrimary, Label.Color)`
   * with `Italic:` on the same predicate. So a normal row is black throughout and a standard
   * row is blue italic throughout - see the shared `useStandardValueClass` on the row (rule 20).
   */
  /*
   * `CostsTableRow` is 30 px high; every label is `gblAppSizes.Font.ExtraExtraSmall` (8 pt) with
   * `PaddingLeft/Right: =6` and `Wrap: =false`, so text past the width is cut, not wrapped.
   */
  td: {
    fontSize: "8pt", color: palette.black, height: "30px",
    paddingTop: 0, paddingBottom: 0,
    paddingLeft: "6px", paddingRight: "6px",
    overflow: "hidden", textOverflow: "ellipsis",
  },
  tdNumeric: { fontVariantNumeric: "tabular-nums" },
  /*
   * `Description` and `Start Date` are the two row labels with
   * `FontWeight: =If(con_Costs_ProjectCostsInAccount.Visible, Normal, Semibold)` - semibold on
   * this screen. Every other row label is `FontWeight.Normal`.
   */
  tdStrong: { fontWeight: tokens.fontWeightSemibold },
  /*
   * A selected row is NOT tinted. `gblAppStyles.Gallery.TemplateFill` is `Color.Transparent`
   * and there is not one `Fill: =If(...)` on the Opex, Land Lease or Contracts screen - the
   * filled radio in the first cell is the whole affordance. The light-blue wash here was
   * ours. `aria-selected` still carries the state for assistive tech.
   */
  rowSelected: {},
  // `img_…_RadioSelection` - 16 x 16 at X = 10; `Description` starts at X = 40.
  selectCell: {
    paddingLeft: "10px", paddingRight: 0,
    "& input": { width: "16px", height: "16px", marginLeft: 0, marginRight: 0, verticalAlign: "middle" },
  },
  warnCell: { display: "inline-flex", alignItems: "center" },
  // The info icon overhangs into the End Date lane, as `inf_OpexCost_AlignWithDuration` does.
  tdOverhang: { overflow: "visible" },
  // The months text keeps the width of its 60 px canvas label (less padding) so the icon after it
  // lines up row to row whatever the month count.
  monthsText: { display: "inline-block", width: "48px", overflow: "hidden" },
  monthsTextRight: { textAlign: "right" },
  warnIcon: { color: palette.Warning, minWidth: "auto", paddingLeft: 0, paddingRight: 0 },
  empty: {
    paddingTop: space.m, paddingBottom: space.m, paddingLeft: space.l,
    color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200,
  },
  /** `lbl_…_GeneratorsInProject_Instruction` — centred, semibold, above the (empty) gallery. */
  instruction: {
    display: "block", textAlign: "center",
    paddingTop: space.xxl, paddingBottom: space.xxl,
    fontWeight: tokens.fontWeightSemibold,
  },
  banner: {
    paddingTop: space.s, paddingBottom: space.s, paddingLeft: space.m, paddingRight: space.m,
    backgroundColor: "#FBE9E9", color: palette.Error, fontSize: tokens.fontSizeBase200,
  },
  /*
   * `con_…_Body_ColumnLeft` / `_ColumnRight` are each half of the 660 px body, and every control
   * sits at `X: =20`, `Width: =Parent.Width-Self.X*2`: two 290 px columns, 20 px from the panel
   * edges and 40 px apart. The panel body already pads 20 px.
   */
  panelColumns: {
    display: "grid", gap: "40px",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    "@media (max-width: 899px)": { gridTemplateColumns: "minmax(0, 1fr)" },
  },
  panelColumn: { display: "flex", flexDirection: "column", gap: space.m, minWidth: 0 },
  /*
   * `drp_…_DurationYears.Width = 100`, `…_DurationMonths.Width = 120`, months placed at
   * `DurationYears.X + Width + 20` (`OpexCostScreenCode.txt:5989`, `:6053`). Fluent's Dropdown
   * `min-width: 160px` overrode both, so the pair sized off its own text and overflowed.
   */
  duration: { display: "flex", gap: "20px" },
  durationYears: { width: "100px", minWidth: "100px" },
  durationMonths: { width: "120px", minWidth: "120px" },
  /** Every other panel dropdown is `Parent.Width - Self.X*2`, i.e. the full column. */
  panelDropdown: { width: "100%", minWidth: "unset" },
  /*
   * The open list of a canvas `DropDown@0.0.45`: exactly as wide as its box (100 px for years,
   * 120 for months), flat 14 px rows with no check mark, a light grey fill and a thin grey
   * outline, 17 rows tall before it scrolls. Fluent's list keeps a 160 px minimum and a leading check, which is why it read as a
   * different control. It renders in a portal, outside the panel, so it is styled through the
   * `listbox` slot rather than `opex-canvas-panel`.
   */
  canvasListbox: {
    // 17 rows of 27 px plus the 1 px outline top and bottom; longer lists scroll. Fluent's list
    // puts a 2 px `rowGap` between options, which made the rows 29 px apart.
    minWidth: 0, maxHeight: "461px", overflowX: "hidden", rowGap: 0,
    paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0,
    backgroundColor: "#f5f5f5", boxShadow: "none",
    borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
    borderTopStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid", borderLeftStyle: "solid",
    borderTopColor: "#8a8886", borderRightColor: "#8a8886",
    borderBottomColor: "#8a8886", borderLeftColor: "#8a8886",
    borderTopLeftRadius: "2px", borderTopRightRadius: "2px",
    borderBottomLeftRadius: "2px", borderBottomRightRadius: "2px",
    // 27 px rows.
    "& .fui-Option": {
      boxSizing: "border-box", height: "27px", minHeight: "27px", alignItems: "center",
      columnGap: 0, fontSize: "14px", lineHeight: "19px", color: palette.black,
      paddingTop: 0, paddingBottom: 0, paddingLeft: "12px", paddingRight: "12px",
      borderTopLeftRadius: 0, borderTopRightRadius: 0,
      borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
      ":hover": { backgroundColor: "#e1dfdd" },
    },
    "& .fui-Option__checkIcon": { display: "none" },
    // No focus bar under the active row; the canvas list marks it with a fill instead, which
    // still shows keyboard users where they are.
    "& .fui-Option::after": { display: "none" },
    "& .fui-Option[data-activedescendant-focusvisible]": { backgroundColor: "#e1dfdd" },
  },
  // `ico_ResetStartDay_…` sits at `StartDate.X + StartDate.Width + 10`.
  dateRow: { display: "flex", alignItems: "center", gap: "10px" },
  startDate: { width: "calc(100% - 40px)", minWidth: 0 },
  /*
   * `ico_ResetStartDay_NewEditCost_*` is a `cat_PowerCAT.Icon` with `IconName: ="Refresh"`
   * at 30 x 30 and no explicit colour, so it takes the PowerCAT default off
   * `gblAppThemeJson` - the blue circular arrow the screenshots show beside Start Date.
   * Fluent's `subtle` Button renders it neutral grey, and `ArrowCounterclockwise` points the
   * wrong way for "Refresh".
   */
  resetIcon: {
    minWidth: "30px", width: "30px", height: "30px",
    color: palette.themePrimary,
    ":hover": { color: palette.themePrimary },
  },
  toggleRow: { display: "flex", alignItems: "center", gap: space.s, position: "relative" },
  /*
   * `InfoButtonCanvas1` - `X: =Toggle.X + Toggle.Width` with the toggle `Parent.Width - 24 - 60`
   * wide, which puts the button 20 px in from the column's right edge rather than against the
   * caption. A 32 px button with a 20 px black (i).
   */
  externalInfo: {
    marginLeft: "auto", marginRight: "20px",
    width: "32px", height: "32px", minWidth: "32px", flexShrink: 0,
    paddingLeft: 0, paddingRight: 0, color: palette.black,
    "& .fui-Button__icon": { fontSize: "20px", width: "20px", height: "20px", color: palette.black },
  },
  // The Threshold block's label and radios sit at `X: =20` like every other field - no indent.
  indent: { display: "flex", flexDirection: "column", gap: space.m },
  /*
   * `lbl_…_Asterisk` - `palette.Error`, semibold, 10 px wide at `X: =label.X - Self.Width`, i.e.
   * in the margin LEFT of the caption, which stays aligned with the box under it.
   */
  required: {
    position: "absolute", left: "-10px", top: 0, height: "32px",
    display: "flex", alignItems: "center",
    color: palette.Error, fontWeight: tokens.fontWeightSemibold,
  },
  /** `lbl_…_BodyContent_*` - a classic `Label`: `gblAppSizes.Font.Medium` (11 pt), normal, 32 px. */
  label: {
    position: "relative", display: "flex", alignItems: "center", height: "32px",
    fontWeight: tokens.fontWeightRegular, fontSize: "11pt", color: palette.black,
  },
  error: { color: palette.Error, fontSize: tokens.fontSizeBase200 },

  readOnly: {
    backgroundColor: palette.Grayscale30, color: palette.Grayscale10,
    paddingTop: space.xs, paddingBottom: space.xs,
    paddingLeft: space.m, paddingRight: space.m,
    borderTopLeftRadius: tokens.borderRadiusSmall,
    borderTopRightRadius: tokens.borderRadiusSmall,
    borderBottomLeftRadius: tokens.borderRadiusSmall,
    borderBottomRightRadius: tokens.borderRadiusSmall,
    fontSize: tokens.fontSizeBase200, minHeight: "22px",
  },
  radioGroup: { display: "flex", flexDirection: "column" },
  // `rdg_…_Threshold` - a modern `Radio@0.0.25`: 14 px options, 32 px apart.
  radioRow: { display: "flex", alignItems: "center", gap: space.s, height: "32px", fontSize: "14px" },
});

/* ═══════════════════════════════════════════════════════════════ the cards ══ */

/** One rendered card: a device type in O&M, a sub-account in Other OPEX. */
interface OpexCard {
  /** `locSelectedDeviceTypeInProject` / `locSelectedSubaccount` — the command scope. */
  id: string;
  /**
   * `lbl_…_CardHeader_SubaccountName.Text` — what the header RENDERS.
   *
   * In O&M that is the resolved `Generator.'Turbine Type'` or the PV module's `Label`
   * (`:4800-4840`), NOT the device row's `vsb_name`; in Other OPEX it is the sub-account name.
   * Distinct from `group` for exactly that reason.
   */
  title: string;
  /**
   * The name the COST BOOK and the WRITE LAYER key on: the device's `vsb_name` in O&M, the
   * sub-account's name in Other OPEX.
   *
   * `periodWrites.resolveDeviceType` / `resolveOpexGroupTarget` resolve a group back to its
   * Dataverse id by this string, so a save that sent `title` instead would fail to resolve every
   * WTG card the moment the header started showing a turbine type.
   */
  group: string;
  /**
   * O&M: the `vsb_devicetypesinproject` row id, which is also `id`. Two devices can share a
   * `vsb_name`, so this — not `group` — is what rows are filtered by and saves bind to.
   * Undefined for an orphan card whose device id is unknown.
   */
  deviceId?: string;
  /** The sub-account a save binds to: the O&M one, or the card itself in Other OPEX. */
  subaccount: OpexSubaccount;
}

interface PanelState {
  card: OpexCard;
  /** `locSelectedOpexCost` — null while adding. */
  selected: OpexCost | null;
  /** `locSelectedOpexCostParent` — the chain head, or null on a root / a new cost type. */
  parent: OpexCost | null;
  /** `locSelectedOpexCostNext` — the period the new one follows. */
  next: OpexCost | null;
  /** `locResetStartDate`. */
  resetStartDate: boolean;
  /** `locCODDate` — the project's COD, except on Edit where `:954` / `:3422` set it to the row. */
  codDate: string | null;
  /** `locIsStartDateStandardAssumption`. */
  startDateStandard: boolean;
  /** The book row behind `selected`, so an Edit hands `contractId`/`parentId`/`periodIndex` back. */
  period: CostPeriod | null;
}

const NO_SELECTION: RowSelection = {
  selectedId: null, scopeId: null, candidateDescription: "", parentCostId: null,
};

/* ═════════════════════════════════════════════════════════════════ adapters ══ */

/** `0` reads back from Dataverse where the canvas wrote `Blank()`; `Text(0, "###…")` is empty. */
const blankZero = (value: number): number | null => (value === 0 ? null : value);

/** `CostPeriod`'s aggregation union -> the option-set value the panel's dropdown compares. */
const AGGREGATION_VALUE_OF: Record<CostPeriod["aggregation"], number> = {
  SUM: OPEX_AGGREGATION.sum,
  MAX: OPEX_AGGREGATION.max,
  MIN: OPEX_AGGREGATION.min,
};

/** The panel's aggregation dropdown -> `CostPeriod`'s union, for the save. */
function aggregationUnion(value: number | null): CostPeriod["aggregation"] {
  if (value === OPEX_AGGREGATION.max) return "MAX";
  if (value === OPEX_AGGREGATION.min) return "MIN";
  return "SUM";
}

/**
 * `CostPeriod` (the book's shape) → `OpexCost` (the rules' shape).
 *
 * `name` is the STORED `vsb_name` off the book. Three rules read it — `isStandardLocked` and the
 * Add Period / Delete gates' `lastPeriodByName` — and the stored names do not follow one
 * pattern: on the "Initialized O&M Contract" chain periods 1-5 are the bare description and
 * period 6 is not, so by Name the canvas enables the commands on `- 5`. A rebuilt name (the
 * previous approach) gave every row the same prefix and put `- 6` last. `costName` — the canvas'
 * own composition (`pcf_…_Save.OnChange`, `:8695`) — is only the fallback for a row that has not
 * been read back.
 *
 * The five money fields and the two threshold columns now come straight off the book: they are
 * NULLABLE there (an empty box stores `Blank()`, not 0, so `blankZero` is no longer needed for
 * them), `vsb_thresholdtype` carries the panel's own radio selection rather than a hard-coded
 * Individual, and `vsb_thresholdindividual` is its own column rather than a copy of
 * `vsb_eurmwh`.
 */
function toOpexCost(
  period: CostPeriod,
  mode: OpexMode,
  subaccount: OpexSubaccount,
  accountName: string,
): OpexCost {
  return {
    id: period.id,
    name: period.name ?? costName(
      {
        accountName,
        subaccountName: subaccount.name,
        deviceName: mode === "om" ? period.group : null,
      },
      period.description,
    ),
    description: period.description,
    parentCostId: period.parentId ?? null,
    subaccountId: subaccount.id,
    // The device ROW id, as the card is keyed — see `OpexCard.deviceId`.
    deviceTypeInProjectId: mode === "om" ? period.deviceId ?? period.group : null,
    startDate: period.startDate || null,
    durationYears: period.years,
    durationMonths: period.months,
    currencyId: period.currency || null,
    currencyName: period.currency,
    fixCosts: period.fixed,
    percentOfRevenues: period.revenue,
    eurPerMwh: period.perMwh,
    eurPerMw: period.perMw,
    eurPerWtg: period.perWtg,
    aggregation: AGGREGATION_VALUE_OF[period.aggregation],
    distributionFrequency: period.frequency,
    threshold: period.threshold,
    thresholdType: period.threshold ? period.thresholdType ?? THRESHOLD_TYPE.individual : null,
    thresholdIndividual: period.threshold ? period.thresholdIndividual ?? null : null,
    useInflationProfile: period.inflation,
    useCountryInflationProfile: period.countryInflation,
    inflationProfile: blankZero(period.inflationPercent),
    inflationStartYear: period.inflationYear || null,
    inflationCountryArea: period.inflationCountryArea || null,
    alignWithProjectDuration: period.align,
    externalContract: period.external,
    isStandardContract: period.standard,
    isStartDateStandardAssumption: period.isStartDateStandard === true,
    createdOn: null,
  };
}

const iso = (date: Date | null): string => (date === null ? "" : [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, "0"),
  String(date.getDate()).padStart(2, "0"),
].join("-"));

const numberOrNull = (value: string): number | null => {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const text = (value: number | null | undefined): string =>
  value === null || value === undefined ? "" : String(value);

/**
 * Everything the panel opens with, seeded in the canvas' own order:
 * description → start date → currency → inflation start year → inflation profile →
 * align → external.
 */
function seedForm(
  panel: PanelState,
  project: OpexProjectContext,
  mode: OpexMode,
  inflationRows: readonly CountryInflationProfile[],
  areaRegion: string | null,
): OpexForm {
  const { selected, parent, next } = panel;
  const contractLevel = parent !== null && selected === null ? parent : selected;

  const description = selected !== null
    ? selected.description
    : parent !== null
      ? nextPeriodDescriptionPanel(next, parent)
      : "";

  const startDate = startDateDefault({
    selected,
    parent,
    next,
    deviceId: mode === "om" ? panel.card.id : null,
    deviceCosts: [],
    codDate: panel.codDate,
    resetStartDate: panel.resetStartDate,
  }).date;

  // `drp_…_Currency.DefaultSelectedItems` (`:6194-6205`) reads the COUNTRY only. The control is
  // permanently Disabled, so a row saved in a third currency would silently be rewritten to EUR
  // on the next edit; the row's own currency is preferred here and the country default is the
  // fallback. Deliberate divergence — see the report.
  const currencyId = selected?.currencyName
    ?? parent?.currencyName
    ?? CURRENCY_NAME_BY_CODE[defaultCurrencyCode(project.countryName)]
    ?? "Euro";

  const useCountryInflationProfile = contractLevel?.useCountryInflationProfile ?? false;
  const inflationStartYear = inflationStartYearDefault({
    selected, parent, startDate: startDate,
  });
  // `LookUp('Country Inflation Profiles', country && year [&& area]).Inflation` (`:7822-7847`).
  // For Italy the canvas adds the Area term; `gblAreaWithRegion` minus its `Italy_` prefix is
  // what the Area dropdown would have preselected, so it is the fallback when the row carries
  // no area of its own.
  const countryProfile = countryInflationPercent(inflationRows, {
    year: inflationStartYear,
    countryName: project.countryName,
    area: contractLevel?.inflationCountryArea ?? italyZone(areaRegion) ?? null,
  });

  return {
    description,
    startDate: startDate === null ? null : iso(startDate),
    durationYears: selected?.durationYears ?? null,
    durationMonths: selected?.durationMonths ?? null,
    currencyId,
    aggregation: selected?.aggregation ?? null,
    distributionFrequency: selected?.distributionFrequency ?? null,
    fixCosts: text(selected?.fixCosts),
    percentOfRevenues: text(selected?.percentOfRevenues),
    eurPerMwh: text(selected?.eurPerMwh),
    eurPerMw: text(selected?.eurPerMw),
    eurPerWtg: text(selected?.eurPerWtg),
    thresholdOn: contractLevel?.threshold ?? false,
    thresholdType: contractLevel?.thresholdType ?? null,
    thresholdIndividual: text(contractLevel?.thresholdIndividual),
    inflationOn: contractLevel?.useInflationProfile ?? false,
    useCountryInflationProfile,
    inflationStartYear: text(inflationStartYear),
    inflationProfile: text(inflationProfileDefault({
      selected,
      parent,
      useCountryInflationProfile,
      countryName: project.countryName,
      countryProfile,
    })),
    inflationCountryArea: contractLevel?.inflationCountryArea ?? null,
    alignWithProjectDuration: alignWithProjectDurationDefault({ selected, parent }),
    externalContract: externalContractDefault({
      selected, parent, mode, subaccountOrder: panel.card.subaccount.order,
    }),
  };
}

/* ══════════════════════════════════════════════════════════════ the screen ══ */

export interface OpexScreenProps {
  /** `"om"` = Operation & Maintenance · `"other"` = Other OPEX Costs. */
  mode: OpexMode;
}

export default function OpexScreen({ mode }: OpexScreenProps) {
  const styles = useStyles();
  const { project, projectId } = useSession();
  // D58: while `isLoading` (TanStack's first load) there is no `book` yet, so the cards render
  // with an empty body; no masking is needed (Land Lease masks, because its load includes extras).
  const { data: book, isLoading, error, save } = useCostBook();
  const extras = useProjectExtras(projectId);
  const addStandard = useAddStandardContract();
  /** CA-15 — a Cost write of this project still running, from any screen or an earlier visit. */
  const writeInFlight = useCostWriteInFlight(projectId);
  /** CA-15 — the banner while this screen is mounted, the error toast once it has been left. */
  const reportFailure = useWriteFailureReport(mode === "om" ? "O&M" : "Other OPEX");
  const areas = useCountryInflationAreas(extras.data?.countryId);
  /** `colOpexAccounts` / `colOpexSubaccounts` — real rows, not the constants this file carried. */
  const catalog = useOpexCatalog();
  /** `colDeviceTypesInProject` — `[generators, pvModules]` for `deviceTypeList` to order. */
  const deviceTypes = useOpexDeviceTypes(projectId);
  /** `Country Inflation Profiles` for the project's country — every year, every Area. */
  const countryInflation = useCountryInflation(extras.data?.countryId);
  /** The catalogue behind `Add Standard Contract`, for the command's gate. */
  const assumptionScopes = useOpexAssumptionScopes(
    extras.data?.countryId, extras.data?.technology,
  );

  const [openCards, setOpenCards] = useState<Record<string, boolean>>({});
  const [selection, setSelection] = useState<RowSelection>(NO_SELECTION);
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [form, setForm] = useState<OpexForm | null>(null);
  const [deleting, setDeleting] = useState<OpexCost | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  /**
   * `locSpinnerInformationText` — the text `cmp_OpexCosts_PopUpLoading` showed. Since D58 it is
   * the `<WriteStatus>` line, and non-null means a write is pending (the write guard).
   */
  const [busyLabel, setBusyLabel] = useState<string | null>(null);

  /* ── scope, once per render (`OnVisible`, `:9-64`) ─────────────────────── */

  const account = useMemo(
    () => selectedAccount(catalog.accounts, mode), [catalog.accounts, mode],
  );
  const subaccount = useMemo(
    () => defaultSubaccount(catalog.subaccounts, account),
    [catalog.subaccounts, account],
  );

  const projectContext = useMemo<OpexProjectContext>(() => ({
    codDate: project?.milestones?.operationsStartCod
      ? iso(project.milestones.operationsStartCod) : null,
    projectStartDate: project?.startDate ? iso(project.startDate) : null,
    endDate: project?.endDate ? iso(project.endDate) : null,
    countryName: project?.countryName ?? null,
    countryId: extras.data?.countryId ?? null,
    technology: extras.data?.technology ?? null,
    // `gblSelectedProject.'Area/State/Province'.Name` — `loadProject` now selects
    // `_vsb_countryarea_value` and resolves its name, so `areaWithRegion` answers for Italy too.
    areaStateProvince: project?.areaStateProvince ?? null,
    isoCurrencyCode: project?.isoCurrencyCode ?? null,
    owningBusinessUnitId: project?.owningBusinessUnitId ?? null,
  }), [project, extras.data]);

  /** `Set(gblAreaWithRegion, …)` (`OnStart.txt:902-961`) — Italy only, blank elsewhere. */
  const areaRegion = useMemo(
    () => areaWithRegion(projectContext.countryName, projectContext.areaStateProvince),
    [projectContext],
  );

  const columns = useMemo(
    () => opexColumns(mode, projectContext.isoCurrencyCode),
    [mode, projectContext.isoCurrencyCode],
  );

  /**
   * The O&M device row a period belongs to: its own `deviceId`, else — for a period that has not
   * been read back — the one device carrying its `group` name. A name two devices share resolves
   * to neither, and the period stays on an orphan card rather than appearing under both.
   */
  const deviceIdOf = useMemo(() => {
    const byName = new Map<string, string | null>();
    for (const d of [...(deviceTypes.data?.[0] ?? []), ...(deviceTypes.data?.[1] ?? [])]) {
      byName.set(d.name, byName.has(d.name) ? null : d.id);
    }
    return (p: CostPeriod): string => p.deviceId ?? byName.get(p.group) ?? p.group;
  }, [deviceTypes.data]);

  /** `colOpexProjectCosts`, scoped to this rail item. */
  const allCosts = useMemo<OpexCost[]>(() => {
    if (!book || !subaccount || !account) return [];
    return book.periods
      .filter((p) => p.mode === mode)
      .map((p) => toOpexCost(
        mode === "om" ? { ...p, deviceId: deviceIdOf(p) } : p,
        mode,
        mode === "om" ? subaccount : subaccountFor(catalog.subaccounts, p.group, account),
        account.name,
      ));
  }, [book, mode, subaccount, account, catalog.subaccounts, deviceIdOf]);

  /** The book row behind each `OpexCost`, for the save/delete round trip. */
  const periodById = useMemo(
    () => new Map((book?.periods ?? []).map((p) => [p.id, p])),
    [book],
  );

  const cards = useMemo<OpexCard[]>(() => {
    if (!subaccount) return [];
    if (mode === "other") {
      // `gal_OpexCosts_Content_Subaccounts.Items` (`:328`) — every Other-OPEX sub-account, in
      // `vsb_order`, whether or not it holds a cost. Any group name a cost refers to that the
      // reference list does not mention is appended, so no row is ever invisible.
      const listed = subaccountsForMode(catalog.subaccounts, "other");
      const names = new Set(listed.map((s) => s.name));
      const extraNames = [...new Set(
        (book?.periods ?? []).filter((p) => p.mode === "other").map((p) => p.group),
      )].filter((name) => !names.has(name));
      return [
        ...listed.map((s) => ({ id: s.id, title: s.name, group: s.name, subaccount: s })),
        ...extraNames.map((name) => ({
          id: name,
          title: name,
          group: name,
          subaccount: {
            id: name, name, order: Number.MAX_SAFE_INTEGER,
            accountId: account?.id ?? null, accountName: OPEX_MODE_NAMES.other,
          },
        })),
      ];
    }
    /*
     * `colDeviceTypesInProject` (`:68-109`) — the real device rows, WTG types first by the
     * matching GENERATOR's `Created On` ascending, then the PV module types.
     *
     * This used to be synthesised from the cost book's group names, which meant two departures
     * from canvas that `loadOpexDeviceTypes` now closes: the WTG block was ordered by first
     * appearance in the book (`Description`, then `Start Date`) rather than by `Created On`, and
     * a device with no cost yet had no card at all. `card.id` is the device ROW id — two devices
     * may share a `vsb_name` (two "Dummy-Siemens Gamesa 5-7" cards on 0 Test Lucas), and keying
     * on the name merged both devices' periods into each card. `card.group` stays the `vsb_name`
     * for the record-type and row-name rules, and `card.title` is the resolved
     * `Generator.'Turbine Type'` / PV `Label`, which is what the canvas header label renders.
     */
    const generators = deviceTypes.data?.[0] ?? [];
    const pvModules = deviceTypes.data?.[1] ?? [];
    const known = new Set([...generators, ...pvModules].map((d) => d.id));
    // A device a cost still points at but the project no longer lists keeps its card rather than
    // taking its costs off screen with it — the silent-drop failure this codebase has had once.
    const orphanGroups = new Map<string, string>();
    for (const p of book?.periods ?? []) {
      if (p.mode !== "om") continue;
      const key = deviceIdOf(p);
      if (!known.has(key)) orphanGroups.set(key, p.group);
    }
    const orphans = [...orphanGroups].map(([id, name]) => ({
      id, name, typeInProjectId: null, createdOn: null, displayName: name,
    }));
    const orphanIds = new Set(orphans.filter((o) => o.id !== o.name).map((o) => o.id));
    return deviceTypeList(
      [...generators, ...orphans.filter((d) => addPeriodRecordType(d.name) === "Generator")],
      [...pvModules, ...orphans.filter((d) => addPeriodRecordType(d.name) !== "Generator")],
    ).map((d) => ({
      id: d.id,
      title: d.displayName,
      group: d.name,
      deviceId: known.has(d.id) || orphanIds.has(d.id) ? d.id : undefined,
      subaccount,
    }));
  }, [book, mode, subaccount, account, catalog.subaccounts, deviceTypes.data, deviceIdOf]);

  // The first card opens by default — that is what both reference screenshots show. `openCards`
  // holds only what the user has since changed, so the default never fights a deliberate close.
  const firstCardId = cards[0]?.id;
  const isOpen = (id: string) => openCards[id] ?? id === firstCardId;
  const toggleCard = (id: string) =>
    setOpenCards((prev) => ({ ...prev, [id]: !(prev[id] ?? id === firstCardId) }));

  const selectedCost = allCosts.find((c) => c.id === selection.selectedId) ?? null;

  /* ── commands ─────────────────────────────────────────────────────────── */

  const openPanel = (next: PanelState) => {
    setForm(seedForm(next, projectContext, mode, countryInflation.data ?? [], areaRegion));
    setPanel(next);
    setBanner(null);
  };

  /**
   * D58 — the guard that replaced `cmp_OpexCosts_PopUpLoading`'s screen cover: while the first
   * load or any write runs, no command that starts a write may fire (the buttons are disabled
   * too; this is the second line).
   */
  const writeDisabled = writeCommandsDisabled({
    loading: isLoading,
    writePending: busyLabel !== null || save.isPending || addStandard.isPending,
    writeInFlight,
  });

  const onCommand = (card: OpexCard, key: OpexCommandKey) => {
    if (writeDisabled) return;
    const cardCosts = costsInScope(allCosts, mode, card.id);

    if (key === "newOpexProjectCostType") {
      // `:588-606` — a brand-new cost type: no parent, no next, start at COD, flag cleared.
      openPanel({
        card, selected: null, parent: null, next: null, resetStartDate: true,
        codDate: projectContext.codDate, startDateStandard: false, period: null,
      });
      return;
    }

    if (key === "newOpexProjectCost") {
      // `:607-630` / `:2990-3026` — the parent is the chain HEAD whichever period was selected,
      // and `locResetStartDate` is `IsBlank(next)`. On a card that does not own the selection
      // both are Blank, which is how O&M creates a cost type. DIVERGENCE (27 Oct 2026): the next
      // is the chain's LAST period, not the selected row, so the new period's description and
      // start date follow on from the end of the chain whichever row was selected.
      const owns = selection.scopeId === card.id && selectedCost !== null;
      const parent = owns ? chainHead(cardCosts, selectedCost) : null;
      const next = owns ? chainLastPeriod(cardCosts, selectedCost) : null;
      openPanel({
        card, selected: null, parent, next, resetStartDate: next === null,
        codDate: projectContext.codDate, startDateStandard: false, period: null,
      });
      return;
    }

    if (key === "editOpexProjectCost" && selectedCost) {
      // `:926-955` / `:3396-3430` — `locSelectedOpexCostParent` is the row's parent (blank on a
      // root), `locCODDate` becomes the ROW's start date, and the standard-start flag survives
      // only on a root.
      const parent = selectedCost.parentCostId === null
        ? null
        : allCosts.find((c) => c.id === selectedCost.parentCostId) ?? null;
      openPanel({
        card,
        selected: selectedCost,
        parent,
        next: null,
        resetStartDate: false,
        codDate: selectedCost.startDate,
        startDateStandard: selectedCost.parentCostId === null
          ? selectedCost.isStartDateStandardAssumption
          : false,
        period: periodById.get(selectedCost.id) ?? null,
      });
      return;
    }

    if (key === "deleteOpexProjectCost" && selectedCost) {
      setDeleting(selectedCost);
      return;
    }

    if (key === "addStandardContract") {
      setBanner(null);
      setBusyLabel(OPEX_MSG.loadingStandardContract);
      // `mutateAsync`, not `mutate(…, { onError })`: TanStack drops per-call callbacks once the
      // screen unmounts, and a failure after the user left must still reach the toast (CA-15).
      void addStandard.mutateAsync({
        mode,
        group: card.group,
        deviceId: card.deviceId,
        countryId: extras.data?.countryId,
        technology: extras.data?.technology,
        codDate: projectContext.codDate ?? "",
        // `LookUp('Country Inflation Profiles', Country = … && Year = recCODYear).Inflation`
        // (`:726-728`) — COD year + 1, and with NO Area term even on an Italian project, which
        // is why `area` is not passed here. `undefined` rather than `null` keeps the write
        // layer's own `?? 0` in charge when the country has no profile for that year.
        countryInflationPercent: countryInflationPercent(
          countryInflation.data ?? [],
          {
            year: projectContext.codDate
              ? Number(projectContext.codDate.slice(0, 4)) + 1 : null,
            countryName: projectContext.countryName,
            area: null,
          },
        ) ?? undefined,
      })
        .catch((e: unknown) => reportFailure(e instanceof Error ? e.message : String(e), setBanner))
        .finally(() => setBusyLabel(null));
    }
  };

  /**
   * `dte_…_StartDate.OnChange` (`:5823-5832`) — picking a date by hand also re-derives
   * `locIsStartDateStandardAssumption` from the period this one FOLLOWS, not from the row being
   * edited, and sets `locCODDate` to the chosen date (`:5838`).
   */
  const onStartDate = (value: string) => {
    setForm((f) => (f ? { ...f, startDate: value } : f));
    setPanel((p) => (p ? {
      ...p,
      codDate: value,
      startDateStandard: startDateStandardFlagAfterManualChange(p.next?.parentCostId),
    } : p));
  };

  /** `ico_ResetStartDay_NewEditCost_OPEXCosts.OnChange` (`:5941-5955`). */
  const onResetStartDate = () => {
    const cod = projectContext.codDate;
    setForm((f) => (f ? { ...f, startDate: cod } : f));
    setPanel((p) => (p ? {
      ...p,
      codDate: cod,
      resetStartDate: true,
      startDateStandard: resetStartDateFlag({
        selected: p.selected, parent: p.parent, next: p.next,
      }),
    } : p));
  };

  /* ── save (`pcf_…_BodyButtons_Save.OnChange`, `:8695`) ─────────────────── */

  const commit = async () => {
    if (!panel || !form || !book) return;
    const { card, selected, parent, period } = panel;
    if (!canSaveOpexCost(form, {
      selected,
      costsInScope: costsInScope(allCosts, mode, card.id),
      countryName: projectContext.countryName,
    })) return;

    /*
     * `Value(txt_…_InflationProfile.Value)` — with the country toggle ON the box is hidden but
     * its formula still evaluates to `Max(LookUp('Country Inflation Profiles', country && year
     * [&& area]).Inflation, 0)` (`:7822-7847`), and that is what the save stores. Recomputed
     * here rather than read from `form.inflationProfile`, because the start-year box and the
     * Area dropdown can both have moved since the panel opened.
     */
    const inflationYear = numberOrNull(form.inflationStartYear);
    const inflationPercent = form.useCountryInflationProfile
      ? Math.max(countryInflationPercent(countryInflation.data ?? [], {
        year: inflationYear,
        countryName: projectContext.countryName,
        area: form.inflationCountryArea ?? italyZone(areaRegion) ?? null,
      }) ?? 0, 0)
      : numberOrNull(form.inflationProfile) ?? 0;

    const saved: CostPeriod = {
      ...(period ?? {}),
      id: period?.id ?? crypto.randomUUID(),
      // The DEVICE NAME / SUB-ACCOUNT NAME, never `card.title`: in O&M the header now shows the
      // resolved turbine type, and the cost book and `resolveDeviceType` both key on the name.
      group: card.group,
      deviceId: card.deviceId,
      mode,
      description: form.description.trim(),
      startDate: form.startDate ?? "",
      years: form.durationYears ?? 0,
      months: form.durationMonths ?? 0,
      currency: form.currencyId ?? "",
      // `Value("")` is `Blank()`: an empty box stores nothing, not 0.
      fixed: numberOrNull(form.fixCosts),
      revenue: numberOrNull(form.percentOfRevenues),
      perMwh: numberOrNull(form.eurPerMwh),
      perMw: numberOrNull(form.eurPerMw),
      perWtg: numberOrNull(form.eurPerWtg),
      // All three options — `Choices('Opex Aggregation')` (`:7023`) — now that `CostPeriod`
      // carries MIN and the write map no longer collapses it to SUM.
      aggregation: aggregationUnion(form.aggregation),
      frequency: form.distributionFrequency ?? 1,
      inflation: form.inflationOn,
      countryInflation: form.useCountryInflationProfile,
      inflationYear: inflationYear ?? 0,
      inflationPercent,
      inflationCountryArea: form.inflationCountryArea ?? "",
      threshold: form.thresholdOn,
      // `rdg_….Selected.Value` and `Value(txt_…_Threshold_Individual.Value)` — the panel's own
      // two controls, not Individual-and-`vsb_eurmwh`.
      thresholdType: form.thresholdOn ? form.thresholdType ?? undefined : undefined,
      thresholdIndividual: form.thresholdOn ? numberOrNull(form.thresholdIndividual) : null,
      align: form.alignWithProjectDuration,
      external: form.externalContract,
      standard: period?.standard ?? false,
      // Rule 13 — `Coalesce(parent.IsStartDateStandardAssumption, locIsStartDateStandardAssumption)`.
      isStartDateStandard: inheritStartDateStandard(parent, panel.startDateStandard),
      // Add Period → the chain head on both columns. Add Contract Type / a new O&M cost type →
      // neither, which is what tells `savePeriod` to create a head.
      contractId: period?.contractId ?? parent?.id,
      parentId: period?.parentId ?? parent?.id,
    };

    // The canvas shows `savingCost` and then `updatingChildCosts` while `ForAll(varOpexChildCosts,
    // Patch(…))` runs. `savePeriod` performs the row write AND the cascade in one call, so only
    // one of the two can be named; the cascade is the phase worth naming when there is one.
    const cascades = selected !== null && childrenOf(allCosts, selected.id).length > 0;
    /*
     * THE PANEL CLOSES FIRST, THEN THE SPINNER APPEARS. (Since D58 the "spinner" is the
     * `<WriteStatus>` line plus the write guard; the order is unchanged.)
     *
     * The canvas Save raises the spinner and dismisses the panel in ONE `UpdateContext` —
     * `{locSpinnerInformationText: "Saving OPEX cost...", locIsVisiblePopUpSpinner: true,
     * locIsVisibleRightPanelNewEditOpexCost: false, locResetStartDate: false}`
     * (`OpexCostScreenCode.txt:8695`) — and only then runs the `Patch`.
     *
     * This used to close after awaiting, so the spinner was drawn on top of the panel it was
     * saving. The failure branch is just `Notify(…)`: the panel is already gone by then, so the
     * error surfaces as the screen banner below, not inside a panel.
     */
    setBusyLabel(cascades ? OPEX_MSG.updatingChildCosts : OPEX_MSG.savingCost);
    setPanel(null);
    setForm(null);
    try {
      await save.mutateAsync({
        ...book,
        periods: [...book.periods.filter((p) => p.id !== saved.id), saved],
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      reportFailure(OPEX_MSG.saveFailed("Save", message), setBanner);
    } finally {
      setBusyLabel(null);
    }
  };

  /* ── delete (`cmp_…_DeleteCost.OnConfirm`, `:8861-8874`) ───────────────── */

  const confirmDelete = () => {
    if (!deleting || !book) { setDeleting(null); return; }
    const plan = planDeleteCost(costsInScope(allCosts, mode, selection.scopeId), deleting);
    // `deleteOpexPeriod` (`data/periodWrites.ts`) already removes the chain's children before the
    // head, so only the head is withdrawn from the book here — submitting `plan.ids` would make
    // the book diff issue a second, now-404 delete for every child. `plan.ids` is still what the
    // selection is cleared against.
    setBusyLabel(OPEX_MSG.deletingCost);
    // `mutateAsync` so a failure after the screen was left still reaches the toast (CA-15).
    void save.mutateAsync({ ...book, periods: book.periods.filter((p) => p.id !== deleting.id) })
      .catch((e: unknown) => reportFailure(e instanceof Error ? e.message : String(e), setBanner))
      .finally(() => setBusyLabel(null));
    if (plan.ids.includes(selection.selectedId ?? "")) setSelection(NO_SELECTION);
    setDeleting(null);
  };

  /* ── render ───────────────────────────────────────────────────────────── */

  /*
   * D60: the first load shows an inline spinner in the body ("Loading Operation & Maintenance…"), with the write
   * commands disabled (`writeCommandsDisabled`) and `aria-busy` on the page, so the screen never
   * looks idle while it loads. The load check still comes BEFORE the error check, so a load in
   * progress never reads "Cost data is unavailable".
   */
  if (!isLoading && (!book || error)) {
    return (
      <EmptyState
        title="Cost data is unavailable"
        description="This project's Cost data could not be loaded."
      />
    );
  }

  // `lbl_OpexCosts_Content_GeneratorsInProject_Instruction.Visible` (`:309`) — O&M with an empty
  // device gallery renders this and nothing else. Never while loading: no "no rows" text then.
  if (!isLoading && mode === "om" && cards.length === 0) {
    return (
      <div className={styles.page}>
        <Text className={styles.instruction}>{OPEX_MSG.noGenerators}</Text>
      </div>
    );
  }

  return (
    <div className={styles.page} aria-busy={isLoading || undefined}>
      {banner ? <div className={styles.banner} role="alert">{banner}</div> : null}
      {/*
        * `cmp_OpexCosts_PopUpLoading` (`InformationText: =locSpinnerInformationText`, `Visible:
        * =locIsVisiblePopUpSpinner`): the blocking spinner with the verbatim `OPEX_MSG` text
        * shows for as long as the write runs (D60). The write guard also disables the write
        * commands.
        */}
      {/* CA-15: a write still running from another screen (or an earlier visit) says so. */}
      <WriteStatus testId="opex-write-status" label={costWriteStatusLabel({
        ownLabel: busyLabel, ownPending: save.isPending || addStandard.isPending, writeInFlight,
      })} />
      {isLoading ? (
        <LoadingOverlay mode="inline" label={`Loading ${OPEX_MODE_NAMES[mode]}…`} testId="opex-loading" />
      ) : null}

      <div className={styles.cardList}>
        {cards.map((card) => (
          <OpexCardView
            key={card.id}
            card={card}
            mode={mode}
            open={isOpen(card.id)}
            columns={columns}
            allCosts={allCosts}
            project={projectContext}
            selection={selection}
            selectedCost={selectedCost}
            /*
             * `Filter('OPEX & Land Lease Standard Assumptions', Country && Technology &&
             * 'Type Of Contract' [&& 'Opex Subaccount'])` — `:650-662` / `:3038-3049`, expressed by
             * `standardAssumptionFilter` + `matchesStandardAssumption`. One query for the screen;
             * each card tests its own scope, so `Add Standard Contract` arrives DISABLED where
             * there is no catalogue instead of failing at the server with an inline error.
             */
            hasStandardAssumption={(assumptionScopes.data ?? []).some((a) =>
              matchesStandardAssumption(
                {
                  ...a,
                  // `matchesStandardAssumption` reads only these four; the rest of `OpexAssumption`
                  // is not fetched, because nothing here needs an assumption's figures.
                  id: a.id, period: 0, description: "",
                  durationYears: null, durationMonths: null,
                  currencyId: null, fixCosts: null, percentOfRevenues: null,
                  eurPerMwh: null, eurPerMw: null, eurPerWtg: null,
                  aggregation: null, distributionFrequency: null,
                  threshold: false, thresholdType: null, thresholdIndividual: null,
                  useInflationProfile: false, useCountryInflationProfile: false,
                  inflationProfile: null, inflationCountryArea: null,
                  alignWithProjectDuration: false, externalContract: false,
                },
                standardAssumptionFilter(mode, {
                  countryId: projectContext.countryId,
                  technology: projectContext.technology,
                  subaccountId: card.subaccount.id,
                }),
              ))}
            onToggle={() => toggleCard(card.id)}
            onSelectRow={(row) =>
              setSelection((current) => toggleRowSelection({ current, row, cardScopeId: card.id }))}
            onCommand={(key) => onCommand(card, key)}
            writeDisabled={writeDisabled}
          />
        ))}
      </div>

      {panel && form ? (
        <OpexPanel
          mode={mode}
          panel={panel}
          form={form}
          project={projectContext}
          areaRegion={areaRegion}
          areaOptions={areas.data ?? []}
          cardCosts={costsInScope(allCosts, mode, panel.card.id)}
          busy={save.isPending}
          onChange={(patch) => setForm((f) => (f ? { ...f, ...patch } : f))}
          onStartDate={onStartDate}
          onResetStartDate={onResetStartDate}
          onCancel={() => { setPanel(null); setForm(null); }}
          onSave={() => { void commit(); }}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        title={DELETE_DIALOG.title}
        // `cmp_OpexCosts_PopUpConfirmation_DeleteCost` (`Opex Costs Screen.pa.yaml:8846-8926`),
        // matched to the canvas at the product owner's request (27 Oct 2026): its own wording —
        // O-3 included, so a root reads "… cost?" although the confirm removes its periods too —
        // and a `cmp_PopUp_Confirmation` with `IconConfirmButton: ="Delete"`: the themePrimary
        // Confirm with a bin, not a red danger button, and the same buttons row as Land Lease.
        description={deleteDialogTextCanvasParity(deleting)}
        confirmText={DELETE_DIALOG.confirm}
        cancelText={DELETE_DIALOG.cancel}
        confirmIcon="delete"
        canvasFooter
        busy={save.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

/**
 * The sub-account an Other-OPEX group name binds to.
 *
 * A name the reference list does not carry still gets a sub-account record, so its costs keep a
 * card and a correctly composed `vsb_name` instead of disappearing.
 */
function subaccountFor(
  subaccounts: readonly OpexSubaccount[],
  group: string,
  account: { id: string } | null,
): OpexSubaccount {
  return subaccounts.find((s) => s.name === group) ?? {
    id: group, name: group, order: Number.MAX_SAFE_INTEGER,
    accountId: account?.id ?? null, accountName: OPEX_MODE_NAMES.other,
  };
}

/* ═══════════════════════════════════════════════════════════════ the card ══ */

/** The radio's lane: `Description.X = 40` on both canvas galleries. */
const SELECT_COLUMN_WIDTH = 40;

function OpexCardView({
  card, mode, open, columns, allCosts, project, selection, selectedCost,
  hasStandardAssumption, onToggle, onSelectRow, onCommand, writeDisabled,
}: {
  card: OpexCard;
  mode: OpexMode;
  open: boolean;
  columns: ReturnType<typeof opexColumns>;
  allCosts: readonly OpexCost[];
  project: OpexProjectContext;
  selection: RowSelection;
  selectedCost: OpexCost | null;
  /** `recCountryTechnologyRelatedStandardAssumption` — does this scope have a catalogue at all? */
  hasStandardAssumption: boolean;
  onToggle: () => void;
  onSelectRow: (row: OpexCost) => void;
  onCommand: (key: OpexCommandKey) => void;
  /** D58 — `writeCommandsDisabled`: a load or a write is running, so no new write may start. */
  writeDisabled: boolean;
}) {
  const styles = useStyles();
  const commandRow = useCommandRowStyles();
  const standardClass = useStandardValueClass();
  const cardCosts = costsInScope(allCosts, mode, card.id);

  // `con_AlignWithProjectDuration_Container` — the device card and the sub-account card use
  // DIFFERENT algorithms (`omDurationBadge` reproduces defect O-4).
  const badge = mode === "om"
    ? omDurationBadge(cardCosts, project)
    : durationBadge(cardCosts, project);

  const gates = guardOpexCommands(opexCommands({
    mode,
    cardScopeId: card.id,
    selectedScopeId: selection.scopeId,
    selected: selectedCost,
    allCosts,
    cardCosts,
    candidateDescription: selection.candidateDescription,
    hasStandardAssumption,
    // `DataSourceInfo`/`RecordInfo` have no Code-App equivalent; the server refuses what the user
    // may not do. The canvas O&M bar carries no `RecordInfo` check at all (defect O-1).
    permissions: { canCreate: true, canEditRecord: true, canDeleteRecord: true },
  }), writeDisabled);

  const icons = { Add: <AddRegular />, Edit: <EditRegular />, Delete: <DeleteRegular /> };

  return (
    <section className={styles.card}>
      <button
        type="button"
        className={mergeClasses(styles.cardHeader, open && styles.cardHeaderOpen)}
        aria-expanded={open}
        onClick={onToggle}
        aria-labelledby={`opex-card-title-${card.id}`}
        data-testid={`opex-card-${card.id}`}
      >
        <Text className={styles.cardTitle} id={`opex-card-title-${card.id}`}>{card.title}</Text>
        {badge !== "none" ? (
          <span
            className={mergeClasses(
              styles.badge,
              badge === "match" ? styles.badgeMatch : styles.badgeMismatch,
            )}
            data-testid={`opex-badge-${card.id}`}
          >
            {DURATION_BADGE_TEXT[badge]}
          </span>
        ) : null}
        {open
          ? <ChevronUpRegular className={styles.chevron} />
          : <ChevronDownRegular className={styles.chevron} />}
      </button>

      {open ? (
        <div className={styles.scroll}>
          <div className={mergeClasses(styles.toolbar, commandRow.row)}>
            {visibleCommands(mode).map((key) => (
              <Button
                key={key}
                appearance="transparent"
                className={mergeClasses(
                  commandRow.command, styles.toolbarCommand, !gates[key] && styles.toolbarCommandDisabled,
                )}
                icon={icons[OPEX_COMMAND_ICONS[key]]}
                disabled={!gates[key]}
                onClick={() => onCommand(key)}
                aria-label={OPEX_COMMAND_LABELS[key]}
                data-testid={`opex-${key}`}
              >
                {OPEX_COMMAND_LABELS[key]}
              </Button>
            ))}
          </div>

          {cardCosts.length === 0 ? null : (
            <table
              className={styles.table}
              style={{ width: `${SELECT_COLUMN_WIDTH + columns.reduce((sum, c) => sum + c.width, 0)}px` }}
              aria-label={`${card.title} costs`}
            >
              <colgroup>
                <col style={{ width: `${SELECT_COLUMN_WIDTH}px` }} />
                {columns.map((c) => <col key={c.key} style={{ width: `${c.width}px` }} />)}
              </colgroup>
              <thead>
                <tr>
                  <th className={styles.selectCell} />
                  {/* `CostsTableHeader_Duration` is ONE 120 px caption over the years and the
                      months labels, so it spans both lanes. */}
                  {columns.filter((c) => c.key !== "durationMonths").map((c) => (
                    <th
                      key={c.key}
                      scope="col"
                      colSpan={c.key === "durationYears" ? 2 : undefined}
                      // The Duration caption has no `Align` in either gallery, even where the two
                      // values under it are right-aligned.
                      className={mergeClasses(
                        styles.th, c.align === "right" && c.key !== "durationYears" && styles.alignRight,
                      )}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cardCosts.map((cost) => {
                  const row = toOpexRow({
                    cost, mode, selectedId: selection.selectedId, project, cardCosts,
                  });
                  return (
                    <tr
                      key={row.id}
                      className={mergeClasses(
                        /* `Italic: =StartsWith(ThisItem.Description, "Standard")` + `ColorValue(gblAppTheme.palette.themePrimary)`, rule 20. */
                        standardClass(row.standard),
                        row.selected && styles.rowSelected,
                      )}
                      onClick={() => onSelectRow(cost)}
                      aria-label="Select cost"
                      data-testid={mode === "om"
                        ? `btn_OpexCosts_Content_Subaccounts_CardBody_CostsTableRow_TransparentButton_1-${row.id}`
                        : `btn_OpexCosts_Content_Subaccounts_CardBody_CostsTableRow_TransparentButton-${row.id}`}
                    >
                      <td className={styles.selectCell}>
                        {/* `img_…_CostsTableRow_RadioSelection` is a PICTURE; the whole row is
                            one `btn_…_TransparentButton` (`:2137`). Keeping the radio read-only
                            and letting the click bubble to the row is what makes selection
                            TOGGLE once rather than twice. */}
                        <input
                          type="radio"
                          name={`opex-${card.id}`}
                          checked={row.selected}
                          readOnly
                          aria-label={`Select ${row.cells.description}`}
                          data-testid={`opex-select-${row.id}`}
                        />
                      </td>
                      {columns.map((c) => (
                        <td
                          key={c.key}
                          className={mergeClasses(
                            styles.td,
                            c.numeric && styles.tdNumeric,
                            c.align === "right" && styles.alignRight,
                            (c.key === "description" || c.key === "startDate") && styles.tdStrong,
                            c.key === "durationMonths" && styles.tdOverhang,
                          )}
                          // `Tooltip: =Self.Text` on the description, the one label that clips.
                          title={c.key === "description" ? row.cells.description : undefined}
                        >
                          {c.key === "durationMonths" ? (
                            <span className={styles.warnCell}>
                              <span
                                className={mergeClasses(
                                  styles.monthsText, c.align === "right" && styles.monthsTextRight,
                                )}
                              >
                                {row.cells[c.key] ?? ""}
                              </span>
                              {/* `inf_OpexCost_AlignWithDuration` sits immediately after the
                                  months cell (`X: = …DurationMonths.X + …Width`). */}
                              {row.warnAlignment ? (
                                <Tooltip content={OPEX_MSG.doesNotAlign} relationship="label">
                                  <Button
                                    appearance="transparent"
                                    size="small"
                                    className={styles.warnIcon}
                                    icon={<InfoRegular />}
                                    aria-label={OPEX_MSG.doesNotAlign}
                                    data-testid={`opex-warn-${row.id}`}
                                  />
                                </Tooltip>
                              ) : null}
                            </span>
                          ) : row.cells[c.key] ?? ""}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════ the panel ══ */

function OpexPanel({
  mode, panel, form, project, areaRegion, areaOptions, cardCosts, busy,
  onChange, onStartDate, onResetStartDate, onCancel, onSave,
}: {
  mode: OpexMode;
  panel: PanelState;
  form: OpexForm;
  project: OpexProjectContext;
  areaRegion: string | null;
  areaOptions: readonly string[];
  cardCosts: readonly OpexCost[];
  busy: boolean;
  onChange: (patch: Partial<OpexForm>) => void;
  onStartDate: (value: string) => void;
  onResetStartDate: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const styles = useStyles();
  const { selected, parent, card } = panel;

  const ctx: PanelContext = {
    mode,
    selected,
    parent,
    // `locSelectedAccount = First(colOpexAccounts)` is true exactly in O&M mode; the panel header
    // says "Cost Type" only when it is NOT (`:5430-5445`).
    isFirstAccount: mode === "om",
    deviceLabel: card.title,
    // `locSelectedRecordTypeAddPeriod = If(Left(ThisItem.Name, 3) = "WTG", …)` (`:2927-2934`)
    // keys off the DEVICE ROW's name, which is `card.group` — the header's turbine type would
    // never start with "WTG" and would hide `EUR/WTG` on every generator card.
    recordType: mode === "om" ? addPeriodRecordType(card.group) : null,
    countryName: project.countryName,
  };

  const modes = panelFieldModes(ctx, {
    eurPerMwh: form.eurPerMwh,
    useCountryInflationProfile: form.useCountryInflationProfile,
  });
  const required = panelRequiredMarkers(ctx, {
    useCountryInflationProfile: form.useCountryInflationProfile,
  });
  const errors = opexFormErrors(form, {
    selected, costsInScope: cardCosts, countryName: project.countryName,
  });
  const errorFor = (field: string) => errors.find((e) => e.field === field)?.message;
  const canSave = canSaveOpexCost(form, {
    selected, costsInScope: cardCosts, countryName: project.countryName,
  });

  const currencyCode = currencyCodeOf(form.currencyId);
  const disabled = (m: FieldMode) => m !== "edit";
  // The canvas list opens flush under its box; Fluent leaves a 2 px gap. `autoSize` off: Fluent
  // otherwise writes its own inline `max-height` (the space left on screen) over the 17-row cap.
  const canvasList = {
    listbox: { className: styles.canvasListbox },
    positioning: { offset: { crossAxis: 0, mainAxis: 0 }, autoSize: false },
  };

  /**
   * `con_…_AreaInflationProfile.Visible` is literally `false` (`:7576`) — defect O-2 — while the
   * Save gate still demands an Area on an Italian project with both inflation toggles on
   * (`:8672-8676`). Reproducing only the canvas answer makes Save permanently impossible there,
   * so the commented-out INTENDED condition is ORed in. Deliberate divergence — see the report.
   */
  const showArea = areaFieldVisible() || areaFieldVisibleIntended({
    inflationOn: form.inflationOn,
    useCountryInflationProfile: form.useCountryInflationProfile,
    countryName: project.countryName,
  });

  const star = (on: boolean | undefined) =>
    (on === true ? <span className={styles.required}>*</span> : null);

  /** A panel label: the conditional red asterisk, then the caption in its own element. */
  const fieldLabel = (on: boolean | undefined, caption: string) => (
    <Text className={styles.label}>
      {on === true ? <span className={styles.required}>*</span> : null}
      <span>{caption}</span>
    </Text>
  );

  const numberField = (
    field: "fixCosts" | "percentOfRevenues" | "eurPerMwh" | "eurPerMw" | "eurPerWtg",
    label: string,
    name: string,
  ) => (
    <CostField
      label={label}
      name={name}
      // `TextInputCanvas.Type'.Text` (`:6413`): the figure is typed as text and checked by
      // `validateOpexNumber`, so no browser spin buttons and a comma still reaches the message.
      type="text"
      value={form[field]}
      disabled={disabled(modes[field])}
      error={errorFor(field)}
      onChange={(v) => onChange({ [field]: v } as Partial<OpexForm>)}
    />
  );

  return (
    <FormPanel
      open
      title={panelTitle(ctx)}
      // `con_…_Body.Width: =Min(660, Parent.Width)`; `opex-canvas-panel` carries the canvas
      // label and disabled-control colours (canvas.css), for this panel only.
      width={660}
      panelClassName="opex-canvas-panel"
      onDismiss={onCancel}
      footer={
        // `lbl_…_BodyButtons_Hint` sits at the footer's left edge (`X: =20`), red; the PowerCAT
        // Save drops its fill while disabled.
        <PanelButtons
          onSave={onSave}
          onCancel={onCancel}
          disabled={!canSave || busy}
          subtleWhenDisabled
          hint={showAtLeastOneFigureHint(form) ? OPEX_MSG.atLeastOneFigure : undefined}
          saveTestId="pcf_OpexCosts_RightPanel_NewEditCost_BodyButtons_Save"
          cancelTestId="pcf_OpexCosts_RightPanel_NewEditCost_BodyButtons_Cancel"
        />
      }
    >
      <div className={styles.panelColumns}>
        {/* ── con_…_Body_ColumnLeft ──────────────────────────────────────── */}
        <div className={styles.panelColumn}>
          <CostField
            label={OPEX_PANEL_LABELS.description}
            name="txt_OpexCosts_RightPanel_NewEditCost_BodyContent_Description"
            required={required.description}
            value={form.description}
            disabled={disabled(modes.description)}
            error={errorFor("description")}
            onChange={(v) => onChange({ description: v })}
          />

          <div>
            {fieldLabel(required.startDate, OPEX_PANEL_LABELS.startDate)}
            <div className={styles.dateRow} data-standard-start={panel.startDateStandard || undefined}>
              {/* `dte_…_StartDate` — a `DatePicker@0.0.46`, `Format: LongAbbreviated` (`:5821`),
                  `Width: =Parent.Width-Self.X*2-40`, which leaves room for the reset icon.
                  `FontColor` / `FontItalic` follow `locIsStartDateStandardAssumption` (`:5819`). */}
              <DateInput
                value={form.startDate}
                format="LongAbbreviated"
                standard={panel.startDateStandard}
                disabled={disabled(modes.startDate)}
                className={styles.startDate}
                ariaLabel={OPEX_PANEL_LABELS.startDate}
                testId="opex-start"
                onChange={(v) => onStartDate(v ?? "")}
              />
              {/* `ico_ResetStartDay_NewEditCost_OPEXCosts` (`:5942-5963`) — chain roots only. */}
              {resetStartDateVisible({ selected, parent }) ? (
                <Tooltip content={OPEX_MSG.resetStartDateTooltip} relationship="label">
                  <Button
                    appearance="subtle"
                    className={styles.resetIcon}
                    icon={<ArrowClockwiseRegular />}
                    data-testid="opex-reset-start"
                    aria-label={OPEX_MSG.resetStartDateTooltip}
                    onClick={onResetStartDate}
                  />
                </Tooltip>
              ) : null}
            </div>

          </div>

          <div>
            {fieldLabel(required.duration, OPEX_PANEL_LABELS.duration)}
            <div className={styles.duration}>
              <Dropdown
                aria-label="Duration years"
                className={styles.durationYears}
                data-testid="opex-years"
                {...canvasList}
                disabled={disabled(modes.durationYears)}
                value={DURATION_YEAR_OPTIONS.find((o) => o.value === form.durationYears)?.name ?? ""}
                selectedOptions={form.durationYears === null ? [] : [String(form.durationYears)]}
                // `drp_…_DurationMonths.DefaultSelectedItems` (`:6015-6019`): with no saved months
                // and a year picked, the months box falls to `First(varColMonths)` - "0 months".
                onOptionSelect={(_, d) => onChange({
                  durationYears: Number(d.optionValue),
                  ...(form.durationMonths === null ? { durationMonths: 0 } : {}),
                })}
              >
                {DURATION_YEAR_OPTIONS.map((o) => (
                  <Option key={o.value} value={String(o.value)}>{o.name}</Option>
                ))}
              </Dropdown>
              <Dropdown
                aria-label="Duration months"
                className={styles.durationMonths}
                data-testid="opex-months"
                {...canvasList}
                disabled={disabled(modes.durationMonths)}
                value={DURATION_MONTH_OPTIONS.find((o) => o.value === form.durationMonths)?.name ?? ""}
                selectedOptions={form.durationMonths === null ? [] : [String(form.durationMonths)]}
                onOptionSelect={(_, d) => onChange({ durationMonths: Number(d.optionValue) })}
              >
                {DURATION_MONTH_OPTIONS.map((o) => (
                  <Option key={o.value} value={String(o.value)}>{o.name}</Option>
                ))}
              </Dropdown>
            </div>
          </div>

          <div>
            {fieldLabel(required.currency, OPEX_PANEL_LABELS.currency)}
            {/* `drp_…_Currency.DisplayMode: =DisplayMode.Disabled` — always (`:6206`). */}
            <Dropdown
              aria-label={OPEX_PANEL_LABELS.currency}
              className={styles.panelDropdown}
              data-testid="opex-currency"
              {...canvasList}
              disabled
              value={form.currencyId ?? ""}
              selectedOptions={form.currencyId === null ? [] : [form.currencyId]}
              onOptionSelect={(_, d) => onChange({ currencyId: d.optionValue ?? null })}
            >
              {[...new Set([
                form.currencyId ?? "",
                ...Object.values(CURRENCY_NAME_BY_CODE),
              ])].filter(Boolean).map((name) => (
                <Option key={name} value={name}>{name}</Option>
              ))}
            </Dropdown>
          </div>

          {numberField("fixCosts", `Fix Costs p.a. [${project.isoCurrencyCode || "EUR"}]`,
            "txt_OpexCosts_RightPanel_NewEditCost_BodyContent_FixCosts")}
          {numberField("percentOfRevenues", OPEX_PANEL_LABELS.percentOfRevenues,
            "txt_OpexCosts_RightPanel_NewEditCost_BodyContent_ProcentOfRevenues")}
          {numberField("eurPerMwh", panelRateLabel(currencyCode, "MWh"),
            "txt_OpexCosts_RightPanel_NewEditCost_BodyContent_EuroPerMwh")}
          {numberField("eurPerMw", panelRateLabel(currencyCode, "MW"),
            "txt_OpexCosts_RightPanel_NewEditCost_BodyContent_EuroPerMw")}
          {/* `con_…_EuroPerWtg.Visible` (`:6868-6871`) — hidden for a PV module. */}
          {showEurPerWtgField(ctx.recordType)
            ? numberField("eurPerWtg", panelRateLabel(currencyCode, "WTG"),
              "txt_OpexCosts_RightPanel_NewEditCost_BodyContent_EuroPerWtg")
            : null}

          <div>
            {fieldLabel(required.aggregation, OPEX_PANEL_LABELS.aggregation)}
            <Dropdown
              aria-label={OPEX_PANEL_LABELS.aggregation}
              className={styles.panelDropdown}
              data-testid="opex-aggregation"
              {...canvasList}
              disabled={disabled(modes.aggregation)}
              value={form.aggregation === null ? "" : OPEX_AGGREGATION_LABEL[form.aggregation] ?? ""}
              selectedOptions={form.aggregation === null ? [] : [String(form.aggregation)]}
              onOptionSelect={(_, d) => onChange({ aggregation: Number(d.optionValue) })}
            >
              {AGGREGATION_OPTIONS.map((value) => (
                <Option key={value} value={String(value)}>
                  {OPEX_AGGREGATION_LABEL[value] ?? ""}
                </Option>
              ))}
            </Dropdown>
          </div>

          <div>
            {fieldLabel(
              required.distributionFrequency, OPEX_PANEL_LABELS.distributionFrequency,
            )}
            <Dropdown
              aria-label={OPEX_PANEL_LABELS.distributionFrequency}
              className={styles.panelDropdown}
              data-testid="opex-frequency"
              {...canvasList}
              disabled={disabled(modes.distributionFrequency)}
              value={OPEX_DISTRIBUTION_FREQUENCY
                .find((o) => o.value === form.distributionFrequency)?.name ?? ""}
              selectedOptions={form.distributionFrequency === null
                ? [] : [String(form.distributionFrequency)]}
              onOptionSelect={(_, d) => onChange({ distributionFrequency: Number(d.optionValue) })}
            >
              {OPEX_DISTRIBUTION_FREQUENCY.map((o) => (
                <Option key={o.value} value={String(o.value)}>{o.name}</Option>
              ))}
            </Dropdown>
          </div>
        </div>

        {/* ── con_…_Body_ColumnRight ─────────────────────────────────────── */}
        <div className={styles.panelColumn}>
          {/* `con_…_InflationToggles` — Inflation Profile first, Country Inflation Profile below
              it, and the container clips to the first toggle while inflation is off (`:7273`). */}
          <div className={styles.toggleRow}>
            {star(required.inflationProfileToggle)}
            <Switch
              checked={form.inflationOn}
              disabled={disabled(modes.inflationProfileToggle)}
              aria-label={OPEX_PANEL_LABELS.inflationProfile}
              data-testid="opex-inflation"
              onChange={(_, d) => onChange(d.checked ? { inflationOn: true } : {
                // `tgl_…_InflationProfile.OnUncheck` resets the whole block (`:7378-7386`).
                inflationOn: false,
                useCountryInflationProfile: false,
                inflationStartYear: "",
                inflationProfile: "",
                inflationCountryArea: null,
              })}
            />
            <Text>{OPEX_PANEL_LABELS.inflationProfile}</Text>
          </div>

          {form.inflationOn ? (
            <>
              <div className={styles.toggleRow}>
                {star(required.countryInflationProfile)}
                <Switch
                  checked={form.useCountryInflationProfile}
                  disabled={disabled(modes.countryInflationProfile)}
                  aria-label={OPEX_PANEL_LABELS.countryInflationProfile}
                  data-testid="opex-country-inflation"
                  onChange={(_, d) => onChange({
                    useCountryInflationProfile: d.checked,
                    // `OnSelect: Reset(txt_…_InflationProfile)` (`:7345`).
                    inflationProfile: "",
                  })}
                />
                <Text>{OPEX_PANEL_LABELS.countryInflationProfile}</Text>
              </div>

              <CostField
                label={OPEX_PANEL_LABELS.inflationStartYear}
                name="txt_OpexCosts_RightPanel_NewEditCost_BodyContent_InflationStartYear"
                required={required.inflationStartYear}
                value={form.inflationStartYear}
                disabled={disabled(modes.inflationStartYear)}
                placeholder={OPEX_PANEL_LABELS.inflationStartYearPlaceholder}
                maxLength={4}
                error={errorFor("inflationStartYear")}
                onChange={(v) => onChange({ inflationStartYear: v })}
              />

              {showArea ? (
                <div>
                  {fieldLabel(required.inflationCountryArea, OPEX_PANEL_LABELS.area)}
                  <Dropdown
                    aria-label={OPEX_PANEL_LABELS.area}
                    className={styles.panelDropdown}
                    data-testid="opex-area"
                    {...canvasList}
                    disabled={disabled(modes.inflationCountryArea)}
                    value={form.inflationCountryArea ?? ""}
                    selectedOptions={form.inflationCountryArea ? [form.inflationCountryArea] : []}
                    onOptionSelect={(_, d) =>
                      onChange({ inflationCountryArea: d.optionValue ?? null })}
                  >
                    {[...new Set([
                      ...areaOptions,
                      // `gblAreaWithRegion` without its `Italy_` prefix is the value the canvas
                      // would have preselected.
                      ...(areaRegion ? [areaRegion.split("Italy_").join("")] : []),
                    ])].map((area) => <Option key={area} value={area}>{area}</Option>)}
                  </Dropdown>
                </div>
              ) : null}

              {/* `lbl_…_InflationProfile.Text` switches caption AND control on the country
                  toggle (`:7940-7950`, `:7789`, `:7861`). */}
              <div>
                {fieldLabel(
                  required.inflationProfile,
                  form.useCountryInflationProfile
                    ? OPEX_PANEL_LABELS.countryInflationProfile
                    : OPEX_PANEL_LABELS.customInflationProfile,
                )}
                {form.useCountryInflationProfile ? (
                  <div className={styles.readOnly} data-testid="opex-inflation-country">
                    {inflationProfileCountryText(project)}
                  </div>
                ) : (
                  <>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={form.inflationProfile}
                      disabled={disabled(modes.inflationProfile)}
                      aria-label={OPEX_PANEL_LABELS.customInflationProfile}
                      data-testid="opex-inflation-profile"
                      onChange={(_, d) => onChange({ inflationProfile: d.value })}
                    />
                    {errorFor("inflationProfile") ? (
                      <Text className={styles.error}>{errorFor("inflationProfile")}</Text>
                    ) : null}
                  </>
                )}
              </div>
            </>
          ) : null}

          {/* `con_…_Threshold_Container.Visible` (`:8100`) — O&M only. */}
          {showThresholdColumn(mode) ? (
            <>
              <div className={styles.toggleRow}>
                <Switch
                  checked={form.thresholdOn}
                  disabled={disabled(modes.threshold)}
                  aria-label={thresholdToggleLabel(project.isoCurrencyCode)}
                  data-testid="opex-threshold"
                  onChange={(_, d) => onChange(d.checked
                    ? { thresholdOn: true }
                    : { thresholdOn: false, thresholdType: null, thresholdIndividual: "" })}
                />
                <Text>{thresholdToggleLabel(project.isoCurrencyCode)}</Text>
              </div>

              {form.thresholdOn ? (
                <div className={styles.indent}>
                  <div>
                    {fieldLabel(required.threshold, OPEX_PANEL_LABELS.threshold)}
                    <div className={styles.radioGroup} role="radiogroup" aria-label="Threshold">
                      {THRESHOLD_OPTIONS.map((o) => (
                        <label key={o.value} className={styles.radioRow}>
                          <input
                            type="radio"
                            name="opex-threshold-type"
                            checked={form.thresholdType === o.value}
                            disabled={disabled(modes.thresholdType)}
                            value={String(o.value)}
                            aria-label={o.label}
                            data-testid={`opex-threshold-${o.value}`}
                            onChange={() => onChange({
                              thresholdType: o.value,
                              // `rdg_….OnChange: Reset(txt_…_Threshold_Individual)` (`:8313`).
                              thresholdIndividual: "",
                            })}
                          />
                          {o.label}
                        </label>
                      ))}
                    </div>
                    {errorFor("thresholdType") ? (
                      <Text className={styles.error}>{errorFor("thresholdType")}</Text>
                    ) : null}
                  </div>

                  {/* `con_…_Threshold_Individual.Visible` — Individual only (`:8151`). */}
                  {form.thresholdType === THRESHOLD_TYPE.individual ? (
                    <CostField
                      label={OPEX_PANEL_LABELS.individualThreshold}
                      name="txt_OpexCosts_RightPanel_NewEditCost_BodyContent_Threshold_Individual"
                      required={required.thresholdIndividual}
                      type="text"
                      value={form.thresholdIndividual}
                      disabled={disabled(modes.thresholdIndividual)}
                      error={errorFor("thresholdIndividual")}
                      onChange={(v) => onChange({ thresholdIndividual: v })}
                    />
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}

          <div className={styles.toggleRow}>
            <Switch
              checked={form.alignWithProjectDuration}
              disabled={disabled(modes.alignWithProjectDuration)}
              aria-label={OPEX_PANEL_LABELS.alignWithProjectDuration}
              data-testid="opex-align"
              onChange={(_, d) => onChange({ alignWithProjectDuration: d.checked })}
            />
            <Text>{OPEX_PANEL_LABELS.alignWithProjectDuration}</Text>
          </div>

          <div className={styles.toggleRow}>
            <Switch
              checked={form.externalContract}
              disabled={disabled(modes.externalContract)}
              aria-label={OPEX_PANEL_LABELS.externalContract}
              data-testid="opex-external"
              onChange={(_, d) => onChange({ externalContract: d.checked })}
            />
            <Text>{OPEX_PANEL_LABELS.externalContract}</Text>
            {/* `InfoButtonCanvas1.Content` (`:8552`). */}
            <Tooltip content={OPEX_MSG.externalContractHelp} relationship="description">
              <Button
                appearance="transparent"
                className={styles.externalInfo}
                icon={<InfoRegular />}
                aria-label="About external contracts"
                data-testid="InfoButtonCanvas1"
              />
            </Tooltip>
          </div>

        </div>
      </div>
    </FormPanel>
  );
}
