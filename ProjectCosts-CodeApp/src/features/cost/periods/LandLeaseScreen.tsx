/**
 * Land Lease Costs Screen.
 *
 * Canvas source: `ProjectDocs/_extracted/msapp/projectcosts/Src/Land Lease Costs Screen.pa.yaml`
 * (201 controls, 6,299 lines) and its older `.txt` twin. Reference screenshots:
 *   `Cost App - Landlease Tab selected.png`
 *   `Cost App - Add & Edit ContractPeriod Panel - Almost same for Landlease and other Opex also.png`
 *
 * THE CONTROL TREE, and what renders each part:
 *
 *   gal_LandLease_Content_Subaccounts                 -> `cards.map(<SubaccountCard/>)`
 *     con_…_CardHeader_1 + ico_…_Up_2 / _Down_2       -> the card's header button + chevron
 *     con_…_CardBody_1                                -> rendered only when `!card.isFolded`
 *       pcf_…_SubaccountsCommandBar_1                 -> `leaseCommands(...)` -> five buttons
 *       con_…_CostsTableHeader_1 (16 labels)          -> `landLeaseColumns(iso)`
 *       gal_…_CardBody_Costs_1                        -> `subaccountPeriodRows(...)`
 *         img_…_RadioSelection_2                      -> the row's radio input
 *   con_LandLease_RightPanel_NewEditPeriod_1          -> `<FormPanel>`
 *     …_LeftBodyContent  (11 field containers)        -> the panel's left column
 *     …_RightBodyContent (toggles, inflation, OTP)    -> the panel's right column
 *     con_LandLease_WarningOnSaveWithCost             -> the additional-periods warning
 *     …_BodyButtons_1 (Save / Cancel / Hint)          -> `<PanelButtons>` + the hint
 *   cmp_…_PopUpConfirmation_DeletePeriod / …_DeleteLandLeaseCost -> one `<ConfirmDialog>`
 *   cmp_LandLease_PopUpLoading                        -> `<WriteStatus>` + the write guard
 *                                                        (D58 DIVERGENCE: no spinner, no scrim)
 *
 * COMPOSITION ONLY. Every decision — column set, cell text, command gating, panel title,
 * field validation, the Save gate, the write plans — lives in `./landLeaseRules.ts`, which is
 * the port of the canvas Power Fx and carries the line-level provenance for all of it. The one
 * rule expressed here rather than there is `periodBlockRequired`, and it says so at its site.
 *
 * This screen replaces the shared `./Screen.tsx` for Land Lease only. The merged screen was
 * wrong for it in ways the rules module documents: it rendered a `Threshold for EUR/MWh p.a.`
 * and a `Distribution Frequency` column the canvas Land Lease grid does not have, ordered
 * `Secured`/`Allocation`/`OTP` at the end of a shared base rather than after `Aggregation`,
 * rendered `Secured` from `standard ? "Yes" : ""` (a different field), singularised durations
 * the canvas never singularises, blanked a stored `0`, and modelled `Locations` as a synthetic
 * group with `Add Period` disabled when it is an ordinary sub-account.
 */
import { useMemo, useState } from "react";
import {
  Button, Dropdown, MessageBar, MessageBarBody, Option, Switch, Text, Tooltip,
  makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import {
  AddFilled, AddRegular, ArrowClockwiseRegular, ChevronDownRegular, ChevronUpRegular,
  DeleteFilled, DeleteRegular, EditRegular,
} from "@fluentui/react-icons";
import { ConfirmDialog, CostField, DateInput, EmptyState, FormPanel, LoadingOverlay, PanelButtons, WriteStatus, useCommandRowStyles, useStandardValueClass } from "@/components";
import { useSession } from "@/app/SessionContext";
import { costWriteStatusLabel, writeCommandsDisabled } from "@/domain/writeGuard";
import { useProjectExtras } from "@/features/cost/contracts/hooks";
import { useCostWriteInFlight, useWriteFailureReport } from "@/features/cost/costing/useCostWriteFlight";
import { serverEnforcedProvider } from "@/platform/privileges";
/*
 * `gblAreaWithRegion` is a property of the PROJECT, not of either period screen: `App.OnStart`
 * derives it once and both screens read it. `opexRules` holds the single transcription of that
 * Italy-only `Switch` (`ITALY_AREA_BY_REGION`), so this screen reads it from there rather than
 * keeping a second copy that could drift.
 */
import { areaWithRegion } from "./opexRules";
import { palette, space } from "@/theme/tokens";
import {
  useCountryInflation, useCurrencies, useLeaseAssumptions, useLeaseBook, useLeaseGenerators,
  useLeaseWrites,
} from "@/features/cost/costing/useCostBook";
import {
  AGGREGATION_LABELS, DURATION_MONTH_OPTIONS, DURATION_YEAR_OPTIONS, LAND_LEASE_AGGREGATION,
  LEASE_DESCRIPTION_MAX_LENGTH, LEASE_ENTITY_SET, LEASE_LABELS, LEASE_MSG,
  addPaymentButton, additionalPeriodsWarningVisible, allocationEditable, allocationVisible,
  areaInflationVisible, buildContracts, canSaveLandLease,
  countryInflationDisplay, currencyEditable, defaultAllocatedGenerators, defaultCurrencyCode,
  deleteDialog,
  durationMonthLabel, durationYearLabel, emptyLandLeaseForm, headerEditable, hintVisible,
  inflationProfileLabel, inflationSectionVisible, inflationStartYearDefault, isPeriodOne,
  guardLeaseCommands, landLeaseColumns, landLeaseFormFrom, lastPeriod, leaseAssumptionQuery,
  leaseCommands, leaseCurrencyLabel,
  leaseFieldErrors, leasePanelTitle, leaseSaveError, orderedSubaccounts,
  planLeaseDelete, planLeaseSave, planStandardImport, resetStartDate, resetStartDateVisible,
  resolveInflationProfileValue, resolveStartDate, startDateIsStandard, subaccountPeriodRows,
  leaseSelectionAfterWrite, toLeaseGridRow, toggleFold, toggleLeaseSelection, NO_LEASE_SELECTION,
  type GeneratorOption, type LandLeaseForm, type LeaseAllocationRow, type LeaseContract,
  type LeaseCostRow, type LeasePeriodRow, type LeaseProjectContext, type LeaseSubaccountCard,
} from "./landLeaseRules";

/**
 * `colDistributionFrequency` — `App.Formulas` in `App.pa.yaml`. An app-side table, not an
 * option set and not a Dataverse choice: `vsb_distributionfrequency` is a plain integer.
 */
const DISTRIBUTION_FREQUENCIES: readonly { value: number; label: string }[] = [
  { value: 1, label: "1 month" },
  { value: 2, label: "2 months" },
  { value: 3, label: "3 months" },
  { value: 6, label: "6 months" },
  { value: 12, label: "12 months" },
];

/** `Choices('Land Lease Aggregation')` — `drp_…_Aggregation_1.Items` (LL:3575). */
const AGGREGATION_OPTIONS: readonly number[] = [
  LAND_LEASE_AGGREGATION.sum, LAND_LEASE_AGGREGATION.max, LAND_LEASE_AGGREGATION.min,
];

/**
 * The three rate labels, which fall back to `"EUR"` — NOT to the grid's `"Cur."`
 * (`LL:3263`, `LL:3394`, `LL:3525` against `LL:710`). `leaseCurrencyLabel` carries the two
 * money labels that the rules module needed for other reasons; these three are label text
 * with no rule attached, so they are composed here rather than re-exported.
 */
const rateLabel = (unit: "MWh" | "MW" | "WTG", iso: string | null | undefined): string =>
  `${iso || "EUR"}/${unit} p.a.`;

/**
 * The canvas' classic scrollbar: a 10 px grey bar on a light track, with an arrow button at
 * each end (the left/right arrows on `con_…_CardBody_1`, and the up/down arrows on the
 * subaccount gallery). Only the `::-webkit-scrollbar` pseudo-elements are set — Chromium
 * ignores all of them once the standard `scrollbar-color` is present, and the arrows go with
 * them.
 */
const arrow = (path: string) =>
  `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='8' height='8'><path d='${path}' fill='%23505050'/></svg>")`;
const scrollButton = (path: string, size = 10) => ({
  display: "block", width: `${size}px`, height: `${size}px`,
  backgroundColor: "#f1f1f1", backgroundImage: arrow(path),
  backgroundRepeat: "no-repeat", backgroundPosition: "center",
});
/*
 * The HORIZONTAL bar under each card's rows is the canvas' thicker classic bar (canvas "Other"
 * screenshot, 26 Oct 2026): a 16 px track with 16 px arrow buttons and a 10 px handle inset by
 * 3 px of track above and below. The vertical bars keep the slimmer 10 px look.
 */
const canvasScrollbar = {
  "::-webkit-scrollbar": { width: "10px", height: "16px" },
  "::-webkit-scrollbar-track": { backgroundColor: "#f1f1f1" },
  "::-webkit-scrollbar-thumb": {
    backgroundColor: "#868686",
    borderTopLeftRadius: "5px", borderTopRightRadius: "5px",
    borderBottomLeftRadius: "5px", borderBottomRightRadius: "5px",
  },
  "::-webkit-scrollbar-thumb:horizontal": {
    borderTopWidth: "3px", borderBottomWidth: "3px", borderLeftWidth: 0, borderRightWidth: 0,
    borderTopStyle: "solid", borderBottomStyle: "solid",
    borderTopColor: "transparent", borderBottomColor: "transparent",
    backgroundClip: "padding-box",
  },
  "::-webkit-scrollbar-button:horizontal:start:decrement": scrollButton("M6 0v8L1 4z", 16),
  "::-webkit-scrollbar-button:horizontal:end:increment": scrollButton("M2 0v8l5-4z", 16),
  "::-webkit-scrollbar-button:vertical:start:decrement": scrollButton("M0 6h8L4 1z"),
  "::-webkit-scrollbar-button:vertical:end:increment": scrollButton("M0 2h8L4 7z"),
  "::-webkit-scrollbar-button:start:increment": { display: "none" },
  "::-webkit-scrollbar-button:end:decrement": { display: "none" },
} as const;

/** The radio's lane: `Description.X = 40` (LL:909). */
const SELECT_COLUMN_WIDTH = 40;

const useStyles = makeStyles({
  /*
   * `gal_LandLease_Content_Subaccounts` — `Height: =Parent.Height-Self.Y`. The Cost shell clips
   * its content (`main { overflow: hidden }`), so the gallery is the thing that scrolls: without
   * its own vertical scroll, opening several cards pushed the rest off the bottom with no
   * scrollbar. The first card sits flush with the top of the content area, as the canvas
   * screenshot (26 Oct 2026) shows — no 10 px band above "Locations".
   */
  page: {
    display: "flex", flexDirection: "column", gap: space.s,
    flex: 1, minWidth: 0, minHeight: 0,
    overflowY: "auto", overflowX: "hidden",
    ...canvasScrollbar,
  },
  /*
   * `TemplatePadding: =0`, so the cards touch and read as one joined block. Each
   * `con_…_Card_1` is `Parent.Width - 10` wide with `BorderStyle.None`; the line between cards
   * is the header's own bottom divider.
   */
  cardList: { display: "flex", flexDirection: "column", rowGap: 0, flexShrink: 0 },
  card: {
    width: "calc(100% - 10px)",
    backgroundColor: palette.white,
    boxShadow: "0 0 2px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.14)",
  },
  /*
   * `con_…_CardHeader_1` — 42 px, `Fill: =ColorValue("#fdffff")`, the title at `X: =20`, and
   * `shp_…_CardHeader_BottomLine_2` a 1 px divider along its bottom on every card, open or not.
   * No hover fill on the canvas.
   */
  cardHeader: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    boxSizing: "border-box", width: "100%", height: "42px",
    paddingTop: 0, paddingBottom: 0, paddingLeft: "20px", paddingRight: "10px",
    backgroundColor: "#fdffff",
    borderTopStyle: "none", borderRightStyle: "none", borderLeftStyle: "none",
    borderBottomStyle: "solid", borderBottomWidth: "1px", borderBottomColor: "#e1dfdd",
    cursor: "pointer",
  },
  // `lbl_…_SubaccountName_2` — `gblAppSizes.Font.Medium` (11 pt), `Label.Color`, normal weight.
  cardTitle: { fontSize: "11pt", color: palette.black, textAlign: "left", flexGrow: 1, minWidth: 0 },
  /*
   * `ico_…_CardHeader_Up_2` / `_Down_2` — a classic `Icon.ChevronUp` / `ChevronDown`, 20 x 18,
   * `gblAppStyles.Icon.Color` (themePrimary), 10 px in from the card's right edge. The classic
   * glyph fills its box; Fluent's draws about 12 px wide inside a 20 px box, so it is drawn at
   * 28 px and pulled in by the glyph's own inset.
   */
  chevron: {
    width: "28px", height: "28px", fontSize: "28px", flexShrink: 0,
    marginLeft: "-5px", marginRight: "-5px",
    color: palette.themePrimary,
  },
  /*
   * `con_…_CardBody_1` — `LayoutOverflowX: =LayoutOverflow.Scroll`, `PaddingLeft: =20`. The
   * command bar, header and gallery all sit in it, and the gallery is a fixed width, so the whole
   * body scrolls sideways under a PERMANENT bar (`scroll`, not `auto`) with arrows at both ends.
   *
   * Its `Height: =Max(gallery.Height + 74, 50)` is FIXED (set inline), and the bar is drawn
   * inside that height: it sits straight under the last row, over the gallery's 10 px bottom
   * pad, rather than below it — as the canvas screenshot (26 Oct 2026) shows.
   */
  scroll: {
    boxSizing: "border-box", overflowX: "scroll", overflowY: "hidden",
    paddingLeft: "20px", ...canvasScrollbar,
  },
  /*
   * `pcf_…_SubaccountsCommandBar_1` — `Height: =40`. Inside `scroll`, whose 20 px inset this
   * 10 px adds to: the first icon lands over the radio at X = 10.
   *
   * Its `Width: =Parent.Width` (LL:399) is the WHOLE card body, laid out after the body's
   * `PaddingLeft: =20` — so the body always overflows by those 20 px and the canvas bar always
   * shows its grey handle, even on a screen wide enough for every column. Without it a wide
   * window showed only the pale track and arrows, which read as no scrollbar at all.
   *
   * The commands are centred in the full 40 px, ~19 px under the card header, with the column
   * captions after them (canvas "Distance and Rotor Overfly Areas" screenshot, 26 Oct 2026).
   */
  toolbar: {
    display: "flex", alignItems: "center", gap: space.m, flexWrap: "nowrap",
    boxSizing: "border-box", minWidth: "calc(100% + 20px)",
    height: "40px", paddingLeft: "10px", paddingRight: space.m,
  },
  /*
   * `btn_OneTimePayment2_…` / `3_…` — a modern `Button@0.0.45`, `Appearance: Outline` with
   * `BorderStyle.None`, `FontColor: themePrimary`, left aligned, with the modern button's
   * Semibold caption and `IconStyle: Filled` (LL:5104). `DisplayMode.Disabled` greys it;
   * painting it blue unconditionally made a disabled button look clickable.
   */
  command: {
    color: palette.themePrimary, fontWeight: tokens.fontWeightSemibold,
    justifyContent: "flex-start", alignSelf: "flex-start",
    paddingLeft: 0, paddingRight: 0, minWidth: 0,
    "& .fui-Button__icon": { color: palette.themePrimary },
  },
  commandDisabled: {
    color: "#bdbdbd",
    "& .fui-Button__icon": { color: "#bdbdbd" },
  },
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
  // Fixed layout so every column holds its canvas width; `width` is set inline to their sum.
  table: { tableLayout: "fixed", borderCollapse: "collapse", whiteSpace: "nowrap" },
  /*
   * `con_…_CostsTableHeader_1` is 34 px high; every caption is `Label.Color`, Semibold,
   * `gblAppSizes.Font.Small` (10 pt) with the label's 6 px side padding — dark labels, not the
   * card's link blue.
   */
  th: {
    textAlign: "left", fontWeight: tokens.fontWeightSemibold,
    color: palette.black,
    // 10 pt on the canvas; 10.5 pt here, because the canvas draws in the wider Open Sans and this
    // app keeps Segoe UI (canvas "Other" screenshot, 26 Oct 2026).
    fontSize: "10.5pt", height: "34px",
    paddingTop: 0, paddingBottom: 0,
    paddingLeft: "6px", paddingRight: "6px",
    overflow: "visible",
  },
  thRight: { textAlign: "right" },
  /*
   * `lbl_…_CostsTableHeader_Duration_2` is ONE 120 px right-aligned caption over both the
   * years and the months lanes. The months header cell stays (empty), so the caption is placed
   * across it: its right edge sits on the months lane's right padding.
   */
  thDuration: { position: "relative" },
  thDurationCaption: { position: "absolute", right: "-54px", top: 0, lineHeight: "34px" },
  /*
   * `con_…_CostsTableRow_1` is 30 px high; every label is `gblAppSizes.Font.ExtraExtraSmall`
   * (8 pt) with `PaddingLeft/Right: =6` and `Wrap: =false`, so text past the width is cut.
   */
  td: {
    // 8 pt on the canvas; 8.5 pt here for the same Open Sans / Segoe UI width difference.
    fontSize: "8.5pt", height: "30px",
    paddingTop: 0, paddingBottom: 0,
    paddingLeft: "6px", paddingRight: "6px",
    overflow: "hidden", textOverflow: "ellipsis",
  },
  tdRight: { textAlign: "right", fontVariantNumeric: "tabular-nums" },
  /*
   * `gal_…_CardBody_Costs_1.Height: =Max(AllItemsCount * 30 + 10, 50)` — the gallery keeps
   * 10 px under its last row and is never shorter than 50 px, so an empty card still shows a
   * band of white under the column captions. `rowsSpacer` makes up the difference.
   */
  rowsSpacer: { flexShrink: 0 },
  /*
   * Row label weights. Every cell but Description is
   * `If(con_Costs_ProjectCostsInAccount.Visible, Normal, Semibold)` (LL:990, LL:1592) — and the
   * running canvas draws them NORMAL (canvas "Other" screenshot, 26 Oct 2026), so that control
   * reads as visible. Description alone is `If(ThisItem.Period = 'Period 1', Bold, Normal)`
   * (LL:1632).
   */
  tdBold: { fontWeight: tokens.fontWeightBold },
  tdNormal: { fontWeight: tokens.fontWeightRegular },
  /*
   * A selected row is NOT tinted. `gblAppStyles.Gallery.TemplateFill` is `Color.Transparent`
   * and there is not one `Fill: =If(...)` on the Opex, Land Lease or Contracts screen - the
   * filled radio in the first cell is the whole affordance. The light-blue wash here was
   * ours. `aria-selected` still carries the state for assistive tech.
   */
  rowSelected: {},
  row: { cursor: "pointer" },
  // `img_…_RadioSelection_2` — 16 x 16 at X = 10; `Description` starts at X = 40.
  selectCell: {
    paddingLeft: "10px", paddingRight: 0,
    "& input": { width: "16px", height: "16px", marginLeft: 0, marginRight: 0, verticalAlign: "middle" },
  },
  /*
   * `con_LandLease_RightPanel_NewEditPeriod_1` — the canvas panel chrome, scoped to this drawer
   * through `FormPanel panelClassName`. Every selector starts `&.canvas-panel` so it outranks
   * the shared `.canvas-panel …` rules in canvas.css whatever order the sheets load in.
   */
  panelSkin: {
    // `lbl_…_BodyHeader_1` — `gblAppSizes.Font.Large` (12 pt), Semibold, white, on a 46 px bar.
    "&.canvas-panel .canvas-panel-header": { height: "46px", paddingTop: 0, paddingBottom: 0 },
    "&.canvas-panel .canvas-panel-header h2": {
      fontSize: "12.7pt", lineHeight: "46px", fontWeight: tokens.fontWeightSemibold,
    },
    /*
     * `con_…_BodyContent_2` — `PaddingTop: =10`, `LayoutOverflowY: =LayoutOverflow.Scroll`: the
     * body scrolls under a permanent bar while the header and buttons stay put.
     */
    "&.canvas-panel .canvas-panel-body": { paddingTop: "10px", overflowY: "scroll", ...canvasScrollbar },
    /*
     * The captions are classic `Label`s: `gblAppSizes.Font.Medium` (11 pt), normal weight,
     * `Label.Color`, 32 px high, with the box straight under them — not Fluent's 14 px
     * semibold text with a 6 px gap.
     */
    "&.canvas-panel .canvas-field": { gap: 0 },
    "&.canvas-panel .canvas-field > span:first-child": {
      position: "relative", display: "flex", alignItems: "center", height: "32px",
      fontSize: "11.6pt", fontWeight: tokens.fontWeightRegular, color: palette.black,
    },
    /*
     * `lbl_…_Asterisk_1` — `palette.Error`, Semibold, 10 px wide at `X: =label.X - Self.Width`:
     * in the margin LEFT of the caption, which stays aligned with its box.
     */
    "&.canvas-panel .canvas-field > span[data-required=\"true\"]::before": {
      content: "'*'", position: "absolute", left: "-10px", top: "2px", lineHeight: "20px",
      fontWeight: tokens.fontWeightSemibold, color: palette.Error,
    },
    /*
     * `lbl_…_ErrorMessage_1` — `palette.Error`, Semibold, `gblAppSizes.Font.ExtraExtraSmall`
     * (8 pt), wrapping inside the box's width.
     *
     * The field container only grows from 76 to 86 px while its message shows
     * (`Height: =If(…ErrorMessage….Visible, 86, 76)`, LL:4789), whatever the message's length: a
     * one- or two-line message spills into the space above the next caption instead of pushing
     * it down. Letting each message take its full height pushed every later field down, so a
     * column of errors cut Aggregation off at the bottom (canvas screenshot, 26 Oct 2026).
     */
    "&.canvas-panel .canvas-field-error": {
      // 8 pt on the canvas renders ~7 % wider than here (canvas screenshot, 26 Oct 2026), so the
      // percent message wraps onto two lines there; 8.5 pt reproduces both.
      fontSize: "8.5pt", fontWeight: tokens.fontWeightSemibold, lineHeight: "11px",
      color: palette.Error, whiteSpace: "normal", overflowWrap: "anywhere",
      boxSizing: "border-box", height: "10px", paddingTop: "3px", overflow: "visible",
      // The classic `Label`'s default 5 px left padding: the message starts just inside the box.
      paddingLeft: "5px",
    },
    /*
     * An invalid box keeps its own look on the canvas — the message under it is the only
     * signal. The shared `.canvas-field[data-invalid]` red outline is not part of it.
     */
    "&.canvas-panel .canvas-field[data-invalid] > input": { outlineStyle: "none" },
    "&.canvas-panel .canvas-field[data-invalid] > input:focus": { outlineStyle: "none" },
    /*
     * A focused text box keeps its grey fill with no outline and shows a thin 1 px themePrimary
     * line along its bottom edge — not the full box outline the shared
     * `.canvas-field > input:focus` rule draws (thinned to 1 px at the user's request, 26 Oct 2026).
     */
    "&.canvas-panel .canvas-field > input:focus": {
      outlineStyle: "none",
      boxShadow: `inset 0 -1px 0 ${palette.themePrimary}`,
    },
    /*
     * A modern control in `DisplayMode.Disabled` keeps the canvas look: a white box with a light
     * grey outline and grey text (the read-only Country Inflation Profile, Currency, and the
     * header fields of a later period). Editable boxes keep the grey fill.
     */
    "&.canvas-panel .canvas-field > input:disabled": {
      backgroundColor: palette.white, color: "#bdbdbd",
      borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
      borderTopStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid", borderLeftStyle: "solid",
      borderTopColor: "#e0e0e0", borderRightColor: "#e0e0e0",
      borderBottomColor: "#e0e0e0", borderLeftColor: "#e0e0e0",
      WebkitTextFillColor: "#bdbdbd",
    },
    "&.canvas-panel :is(.fui-Input, .fui-Dropdown, .fui-DatePicker):has(:disabled)": {
      backgroundColor: palette.white,
      borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
      borderTopStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid", borderLeftStyle: "solid",
      borderTopColor: "#e0e0e0", borderRightColor: "#e0e0e0",
      borderBottomColor: "#e0e0e0", borderLeftColor: "#e0e0e0",
    },
    "&.canvas-panel :is(.fui-Input, .fui-Dropdown, .fui-DatePicker):has(:disabled) :is(input, button, svg)": {
      backgroundColor: "transparent", color: "#bdbdbd", WebkitTextFillColor: "#bdbdbd",
    },
    // A disabled `Toggle@1.1.5` greys its own label too.
    "&.canvas-panel .fui-Switch:has(input:disabled) ~ .fui-Text": { color: "#bdbdbd" },
    "&.canvas-panel [data-strong-captions] .canvas-field > span:first-child": {
      fontWeight: tokens.fontWeightSemibold,
    },
    /*
     * Spacing around the toggle rows, measured off the canvas screenshots (26 Oct 2026):
     *  - whatever follows a toggle (the Allocation and Inflation Start Year captions, the first
     *    One-Time Payment field, the "Add One-Time payment" button) sits 5 px closer than the
     *    column's gap. `PaymentBlock`'s wrapper is `display: contents`, so its first field moves;
     *  - a toggle that follows a field (Inflation Profile after Allocation, One-Time Payment
     *    after the inflation fields) sits 5 px further down;
     *  - the first toggle (Secured) starts 4 px lower, level with the Description caption.
     */
    "&.canvas-panel [data-toggle-row] + :not([data-toggle-row]):not([data-strong-captions])": {
      marginTop: "-5px",
    },
    "&.canvas-panel [data-toggle-row] + [data-strong-captions] > :first-child": {
      marginTop: "-5px",
    },
    "&.canvas-panel :not([data-toggle-row]) + [data-toggle-row]": { marginTop: "5px" },
    "&.canvas-panel [data-toggle-row]:first-child": { marginTop: "6px" },
    // Measured on the canvas Leaseholders screenshot (26 Oct 2026): the Allocation caption sits
    // 3 px nearer its toggle, and One-Time Payment straight after Inflation Profile 3 px nearer.
    "&.canvas-panel [data-toggle-row] + [data-testid=\"lease-allocation\"][data-testid]:not([data-toggle-row]):not([data-strong-captions])": { marginTop: "-8px" },
    "&.canvas-panel [data-toggle-row] + [data-toggle-row][data-otp-row]": { marginTop: "-3px" },
    /*
     * `con_…_BodyButtons_1` — 60 px. Cancel at `Parent.Width - 96 - 20`, Save at
     * `Cancel.X - 96 - 20`: two 96 x 32 buttons, 20 px apart, pinned RIGHT whether or not the
     * hint is showing.
     */
    "&.canvas-panel .canvas-panel-footer": {
      height: "60px", columnGap: "20px", justifyContent: "flex-end",
      paddingTop: 0, paddingBottom: 0, paddingLeft: "20px", paddingRight: "20px",
    },
    // The PowerCAT buttons' captions are regular weight at 14 px, not Fluent's semibold.
    "&.canvas-panel .canvas-panel-footer button": {
      width: "96px", minWidth: "96px", height: "32px",
      fontSize: "14px", fontWeight: tokens.fontWeightRegular,
    },
    /*
     * The disabled PowerCAT Save is plain text in a DARK grey with a near-black checkmark
     * (canvas screenshot, 26 Oct 2026) — not Fluent's pale disabled grey, which made it look
     * missing rather than unavailable.
     */
    "&.canvas-panel .canvas-panel-footer button:disabled": {
      color: "#605e5c", backgroundColor: "transparent",
    },
    "&.canvas-panel .canvas-panel-footer button:disabled .fui-Button__icon": { color: "#323130" },
    /*
     * `lbl_…_BodyButtons_Hint_1` — `X: =20`, `gblAppSizes.Font.ExtraSmall` (9 pt),
     * `FontWeight.Lighter`, `palette.Error`. On ONE line, as on the O&M / Other OPEX and admin
     * period panels (PO, 26 Oct 2026). It was capped at 135 px to copy a canvas screenshot in
     * which it broke after "at least one", which made this the only panel with a two-line footer.
     */
    "&.canvas-panel .canvas-panel-footer > .fui-Text": {
      flexGrow: 0, marginRight: "auto",
      fontSize: "9pt", fontWeight: tokens.fontWeightRegular, lineHeight: 1.3,
      whiteSpace: "nowrap", color: palette.Error,
    },
  },
  /*
   * `con_…_LeftBodyContent` / `_RightBodyContent` share the 650 px body; each field sits at
   * `X: =20` with `Width: =Parent.Width-Self.X*2`: two columns, 20 px from the panel edges and
   * 40 px apart. The panel body already pads 20 px.
   */
  panelColumns: {
    display: "grid", columnGap: "40px", rowGap: 0,
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    "@media (max-width: 649px)": { gridTemplateColumns: "minmax(0, 1fr)" },
  },
  /*
   * Every field container is 76 px (78 for Description): a 32 px caption, a 32 px box and
   * 13 px to the next caption — 77 px a field as measured on the canvas Edit Contract
   * screenshot (26 Oct 2026) — not Fluent's tighter stack.
   */
  panelColumn: { display: "flex", flexDirection: "column", gap: "13px", minWidth: 0 },
  /*
   * `drp_…_DurationYears_1.Width = 100`, `…_DurationMonths_1.Width = 120`, and the months box
   * sits at `DurationYears.X + DurationYears.Width + 20` — so a 20px gap (`LL:2543`, `:2607`).
   * Fluent's Dropdown carries `min-width: 160px`, which overrode both and let the two boxes size
   * themselves off their content instead ("1 year" vs "11 months" came out different widths and
   * overflowed the panel). `minWidth` has to be reset for `width` to take effect at all.
   */
  duration: { display: "flex", gap: "20px" },
  durationYears: { width: "100px", minWidth: "100px" },
  durationMonths: { width: "120px", minWidth: "120px" },
  /*
   * Every OTHER dropdown in this panel is `Width: Parent.Width - Self.X*2` — i.e. the full
   * column (`LL:2762` currency, `:3567` aggregation, `:3674` frequency, `:4400` area). Fluent
   * sizes a Dropdown to its content above a 160px floor instead, so they all came out narrower
   * than the panel and ragged against each other.
   */
  panelDropdown: { width: "100%", minWidth: "unset" },
  /*
   * `drp_…_AreaInflationProfile_1` sits in a container `Max(Parent.Width / 2, 280)` wide with
   * `X: =20` / `Width: =Parent.Width-Self.X*2` (LL:4397) — a 240 px box, narrower than the
   * full-column dropdowns beside it (canvas Edit Contract screenshot, 26 Oct 2026).
   */
  areaDropdown: { width: "240px", maxWidth: "100%" },
  /*
   * `cmb_…_AllocationWtg_1` — a `ComboBox@0.0.51` with `SelectMultiple`, one 32 px line: the
   * chosen WTGs run on and are cut, they never wrap the box onto several lines.
   */
  /*
   * The open list of a canvas `DropDown@0.0.45` — the same control and look as the OPEX panel's
   * (`OpexScreen.canvasListbox`): exactly as wide as its box, flat 30 px rows with no check
   * mark, a light grey fill and a thin grey outline, TWENTY rows (0–19 years) before it
   * scrolls under the canvas scrollbar — a 14 px bar with ▲ / ▼ buttons (canvas Duration
   * screenshot, 26 Oct 2026). It renders in a portal, outside the drawer, so it is styled
   * through the `listbox` slot rather than `panelSkin`.
   */
  canvasListbox: {
    // 20 rows of 30 px plus the 1 px outline top and bottom.
    minWidth: 0, maxHeight: "602px", overflowX: "hidden", rowGap: 0,
    paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0,
    backgroundColor: "#f5f5f5", boxShadow: "none",
    borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
    borderTopStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid", borderLeftStyle: "solid",
    // A darker outline than Fluent's, sampled off the canvas screenshot (26 Oct 2026).
    borderTopColor: "#605e5c", borderRightColor: "#605e5c",
    borderBottomColor: "#605e5c", borderLeftColor: "#605e5c",
    borderTopLeftRadius: "2px", borderTopRightRadius: "2px",
    borderBottomLeftRadius: "2px", borderBottomRightRadius: "2px",
    ...canvasScrollbar,
    // Chromium drops every `::-webkit-scrollbar` rule (arrows included) once the standard
    // properties are set, so they are held at their initial values on the list.
    scrollbarWidth: "auto", scrollbarColor: "auto",
    "::-webkit-scrollbar": { width: "14px", height: "16px" },
    "::-webkit-scrollbar-thumb:vertical": {
      borderLeftWidth: "3px", borderRightWidth: "3px", borderTopWidth: 0, borderBottomWidth: 0,
      borderLeftStyle: "solid", borderRightStyle: "solid",
      borderLeftColor: "transparent", borderRightColor: "transparent",
      backgroundClip: "padding-box",
    },
    "::-webkit-scrollbar-button:vertical:start:decrement": scrollButton("M0 6h8L4 1z", 14),
    "::-webkit-scrollbar-button:vertical:end:increment": scrollButton("M0 2h8L4 7z", 14),
    // 30 px rows with 15 px text, measured off the same screenshot.
    "& .fui-Option": {
      boxSizing: "border-box", height: "30px", minHeight: "30px", alignItems: "center",
      columnGap: 0, fontSize: "15px", lineHeight: "20px", color: palette.black,
      paddingTop: 0, paddingBottom: 0, paddingLeft: "12px", paddingRight: "12px",
      borderTopLeftRadius: 0, borderTopRightRadius: 0,
      borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
    },
    "& .fui-Option__checkIcon": { display: "none" },
    "& .fui-Option::after": { display: "none" },
    /*
     * ONE highlighted row, themePrimary with white text: the row under the pointer, or — with
     * the pointer elsewhere — the current row (the chosen value when the list opens, else the
     * first; then wherever the arrow keys move it). Fluent marks that row `data-activedescendant`.
     */
    "& .fui-Option:hover": { backgroundColor: palette.themePrimary, color: palette.white },
    "& .fui-Option[data-activedescendant]": { backgroundColor: palette.themePrimary, color: palette.white },
    "&:hover .fui-Option[data-activedescendant]:not(:hover)": {
      backgroundColor: "transparent", color: palette.black,
    },
  },
  /*
   * `cmb_…_AllocationWtg_1`'s open list — the modern ComboBox keeps its check boxes, but its
   * rows are 30 px apart with no gap between them (canvas screenshot, 26 Oct 2026).
   */
  allocationListbox: {
    rowGap: 0, ...canvasScrollbar,
    "& .fui-Option": { boxSizing: "border-box", height: "30px", minHeight: "30px", paddingTop: 0, paddingBottom: 0 },
  },
  // `PaymentBlock`'s wrapper: no box of its own, so its two fields stay in the column's gap.
  contents: { display: "contents" },
  // The chevron stays at the box's right edge (`display: block` alone moved it in after the text).
  singleLine: {
    position: "relative", height: "32px",
    "& .fui-Dropdown__button": {
      height: "32px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      display: "block", textAlign: "left", lineHeight: "30px", paddingRight: "36px",
    },
    "& .fui-Dropdown__expandIcon": {
      position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)",
    },
  },
  // `ico_ResetStartDay_…` sits at `StartDate.X + StartDate.Width + 10`.
  dateRow: { display: "flex", alignItems: "center", gap: "10px" },
  /*
   * `dte_…_StartDate_1.Width: =Parent.Width-Self.X*2-40` — always 40 px narrower than the other
   * boxes, whether or not the reset icon is there to fill the gap (it is hidden on a later period).
   */
  startDate: { flexGrow: 0, flexShrink: 0, width: "calc(100% - 40px)", minWidth: 0 },
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
  /*
   * `con_…_AlignWithProjectDuration_*` — toggles 42 px apart on the canvas (Edit Contract
   * screenshot, 26 Oct 2026). The column already adds 13 px between children, so the row is a
   * FIXED 29 px — a `minHeight` let Fluent's taller Switch stretch it to ~33 px.
   */
  toggleRow: { display: "flex", alignItems: "center", gap: space.s, height: "29px" },
  /*
   * `con_…_InflationToggles_1` holds Inflation Profile and Country Inflation Profile together,
   * 33 px apart rather than a full row each (canvas screenshot, 26 Oct 2026).
   */
  toggleRowTight: { marginTop: "-7px" },
  /*
   * `lbl_…_Asterisk_1` — `palette.Error`, Semibold, 10 px wide at `X: =label.X - Self.Width`,
   * i.e. in the margin LEFT of the caption, which stays aligned with the box under it.
   */
  // Raised: the canvas `*` sits level with the top of the caption, not on its centre line.
  required: {
    position: "absolute", left: "-10px", top: "2px", lineHeight: "20px",
    color: palette.Error, fontWeight: tokens.fontWeightSemibold,
  },
  /** `lbl_…_BodyContent_*` — a classic `Label`: `gblAppSizes.Font.Medium` (11 pt), normal, 32 px. */
  label: {
    position: "relative", display: "flex", alignItems: "center", height: "32px",
    fontWeight: tokens.fontWeightRegular, fontSize: "11.6pt", color: palette.black,
  },
  // `lbl_…_AllocationWtg_1` is the one panel caption with `FontWeight.Semibold` (LL:3997).
  labelStrong: { fontWeight: tokens.fontWeightSemibold },
  warning: { color: palette.Error, fontSize: tokens.fontSizeBase200 },
});

/* ═════════════════════════════════════════════════════════════════ panel state ══ */

interface PanelState {
  subaccountId: string;
  subaccountName: string;
  /** `locRightPanelState`. */
  state: "New" | "Edit";
  /** `locSelectedLandLeaseCost`. */
  cost: LeaseCostRow | null;
  /** `locSelectedLandLeasePeriod`. */
  period: LeasePeriodRow | null;
  /** `locParentLandLeasePeriod` — the row `Add Period` was pressed on. */
  parentPeriod: LeasePeriodRow | null;
}

interface DeleteState {
  contract: LeaseContract;
  period: LeasePeriodRow;
}

export default function LandLeaseScreen() {
  const styles = useStyles();
  const { projectId, project, locale } = useSession();
  const extras = useProjectExtras(projectId);
  const book = useLeaseBook(projectId);
  const generatorQuery = useLeaseGenerators(projectId);
  const currencies = useCurrencies();
  const countryInflation = useCountryInflation(extras.data?.countryId);
  const assumptions = useLeaseAssumptions(extras.data?.countryId, extras.data?.technology);
  const writes = useLeaseWrites(projectId);
  /** CA-15 — a Cost write of this project still running, from any screen or an earlier visit. */
  const writeInFlight = useCostWriteInFlight(projectId);
  /** CA-15 — the banner while this screen is mounted, the error toast once it has been left. */
  const reportFailure = useWriteFailureReport("Land Lease");

  /** `IsFolded`, but only for the cards the user has actually toggled. */
  const [folds, setFolds] = useState<Record<string, boolean>>({});
  const [selection, setSelection] = useState(NO_LEASE_SELECTION);
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [form, setForm] = useState<LandLeaseForm | null>(null);
  /** `locCODDate` — the date the user has touched, which wins in every arm of `resolveStartDate`. */
  const [workingDate, setWorkingDate] = useState<string | null>(null);
  /** `locResetStartDate`. */
  const [resetFlag, setResetFlag] = useState(false);
  const [deleting, setDeleting] = useState<DeleteState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * `gblSelectedProject` / `gblRecordSelectedProjectCountry`, as the rules want them.
   *
   * `areaWithRegion` is `gblAreaWithRegion`, which `App.OnStart` derives from the project's
   * `Area/State/Province` through an Italy-only `Switch` over the twenty Italian regions
   * (`OnStart.txt:902-961`). `loadProject` now selects `_vsb_countryarea_value` and resolves its
   * name onto `ProjectContext.areaStateProvince`, so the two Italy-only things that read it —
   * the grid's `Inflation Profile` cell and the panel's read-only country profile text — print a
   * real zone instead of `"Italy - "` with nothing after it. `opexRules.ITALY_AREA_BY_REGION` is
   * the shared transcription of that `Switch`; it is a property of the PROJECT, not of either
   * screen, which is why both screens read the same map.
   */
  const ctx: LeaseProjectContext = useMemo(() => ({
    projectId: projectId ?? "",
    projectName: project?.projectName ?? "",
    owningBusinessUnitId: project?.owningBusinessUnitId ?? null,
    countryId: extras.data?.countryId ?? null,
    countryName: project?.countryName ?? null,
    isoCurrencyCode: project?.isoCurrencyCode ?? null,
    technology: extras.data?.technology ?? null,
    codDate: isoDay(project?.milestones?.operationsStartCod),
    areaWithRegion: areaWithRegion(project?.countryName ?? null, project?.areaStateProvince ?? null),
  }), [projectId, project, extras.data]);

  const isLoading = book.isLoading || extras.isLoading;
  /*
   * D58: the screen renders while the first load runs instead of returning a spinner, so nothing
   * from the book may show until both reads have finished — the body stays empty.
   */
  const bookData = isLoading ? undefined : book.data;
  const subaccounts = useMemo(() => bookData?.subaccounts ?? [], [bookData]);
  const costs = useMemo(() => bookData?.costs ?? [], [bookData]);
  const periods = useMemo(() => bookData?.periods ?? [], [bookData]);
  const allocations = useMemo(() => bookData?.allocations ?? [], [bookData]);
  const generators = useMemo(() => generatorQuery.data ?? [], [generatorQuery.data]);

  /*
   * Rule 1 — `ClearCollect(colLandLeaseSubaccounts, Sort(AddColumns('Land Lease Subaccounts',
   * IsFolded, true), Order))`. Every card starts COLLAPSED; the two chevron icons'
   * `UpdateIf(col, id = selected, {IsFolded: Not(…)})` is `toggleFold`.
   *
   * `folds` holds only what the user has since changed, so the collection is DERIVED rather
   * than copied into state — a `useEffect` that re-seeded it would drop the user's open cards
   * every time the reference data refetched.
   */
  const ordered = useMemo(() => orderedSubaccounts(subaccounts), [subaccounts]);
  const cards = useMemo(
    () => ordered.map((c) => ({ ...c, isFolded: folds[c.id] ?? c.isFolded })),
    [ordered, folds],
  );
  const toggleCard = (subaccountId: string) =>
    setFolds(Object.fromEntries(toggleFold(cards, subaccountId).map((c) => [c.id, c.isFolded])));

  const contracts = useMemo(() => buildContracts(costs, periods), [costs, periods]);
  const columns = useMemo(
    () => landLeaseColumns(ctx.isoCurrencyCode), [ctx.isoCurrencyCode],
  );
  const costById = useMemo(() => new Map(costs.map((c) => [c.id, c])), [costs]);

  const selectedPeriod = useMemo(
    () => periods.find((p) => p.id === selection.periodId) ?? null,
    [periods, selection.periodId],
  );
  const selectedCost = useMemo(
    () => (selection.costId ? costById.get(selection.costId) ?? null : null),
    [costById, selection.costId],
  );
  const selectedContract = useMemo(
    () => contracts.find((c) => c.cost.id === selection.costId) ?? null,
    [contracts, selection.costId],
  );

  /** The panel's contract, for the additional-periods warning and the Add-Period chain. */
  const panelContract = useMemo(
    () => (panel?.cost ? contracts.find((c) => c.cost.id === panel.cost?.id) ?? null : null),
    [contracts, panel],
  );

  const errors = useMemo(
    () => (form ? leaseFieldErrors(form, locale) : {}), [form, locale],
  );

  /**
   * `LookUp('Country Inflation Profiles', Country = …, Year = …, Area = …).Inflation`
   * (`LL:4616`). The year is the panel's own start-year box, which is what the canvas reads.
   */
  const countryProfile = useMemo(() => {
    const rows = countryInflation.data ?? [];
    if (rows.length === 0 || !form) return null;
    const year = Number(form.inflationStartYear);
    if (!Number.isFinite(year)) return null;
    const area = (form.inflationCountryArea ?? "").trim();
    const match = rows.find(
      (r) => r.year === year && (area === "" || r.area === area),
    );
    return match ? match.inflation : null;
  }, [countryInflation.data, form]);

  /** The Area dropdown's `Items` — `Distinct(Filter('Country Inflation Profiles', …).Area)`. */
  const areaOptions = useMemo(
    () => [...new Set((countryInflation.data ?? []).map((r) => r.area).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b)),
    [countryInflation.data],
  );

  /**
   * D58 — the guard that replaced `cmp_LandLease_PopUpLoading`'s screen cover: while the first
   * load or any write runs, no command that starts a write may fire (the buttons are disabled
   * too; the check in `onCommand` is the second line).
   */
  const writeDisabled = writeCommandsDisabled({
    loading: isLoading,
    writePending: busy !== null || writes.isPending,
    writeInFlight,
  });

  /* ── commands ─────────────────────────────────────────────────────────── */

  const patch = (next: Partial<LandLeaseForm>) =>
    setForm((f) => (f ? { ...f, ...next } : f));

  const closePanel = () => {
    setPanel(null);
    setForm(null);
    setWorkingDate(null);
    setResetFlag(false);
  };

  const openAddContract = (card: LeaseSubaccountCard) => {
    // `"newLandLeaseContractKey"` (LL:388) — a blank cost, and `locCODDate` seeded with the
    // project's COD so `resolveStartDate`'s first arm has something to return.
    setPanel({
      subaccountId: card.id, subaccountName: card.name,
      state: "New", cost: null, period: null, parentPeriod: null,
    });
    setForm(emptyLandLeaseForm(ctx));
    setWorkingDate(ctx.codDate);
    setResetFlag(false);
  };

  const openAddPeriod = (card: LeaseSubaccountCard) => {
    if (!selectedCost || !selectedPeriod) return;
    // DIVERGENCE (27 Oct 2026): the new period follows the contract's LAST period whichever
    // period was selected, so its name and start date continue the chain (`leaseCommands`).
    const parentPeriod = (selectedContract && lastPeriod(selectedContract)) ?? selectedPeriod;
    setPanel({
      subaccountId: card.id, subaccountName: card.name,
      state: "New", cost: selectedCost, period: null, parentPeriod,
    });
    setForm(landLeaseFormFrom({
      cost: selectedCost, period: null, parentPeriod,
      allocations, panelState: "New", workingDate: null, resetStartDate: false,
    }));
    setWorkingDate(null);
    setResetFlag(false);
  };

  const openEdit = (card: LeaseSubaccountCard) => {
    if (!selectedPeriod) return;
    const cost = selectedCost;
    setPanel({
      subaccountId: card.id, subaccountName: card.name,
      state: "Edit", cost, period: selectedPeriod, parentPeriod: null,
    });
    const loaded = landLeaseFormFrom({
      cost, period: selectedPeriod, parentPeriod: null,
      allocations, panelState: "Edit", workingDate: null, resetStartDate: false,
    });
    // `txt_…_EuroMWh_1` / `_EuroMW_1` / `_EuroWTG_1.Value` (LL:3245, :3376, :3507) are
    // `If(Int(v) = v, Text(v, "#"), Text(v, "#0.0#"))` — "54", not the "54.00" that
    // `landLeaseFormFrom` gives them (only Fix Costs is `#0.00`).
    setForm({
      ...loaded,
      eurPerMwh: canvasRate(selectedPeriod.eurPerMwh),
      eurPerMw: canvasRate(selectedPeriod.eurPerMw),
      eurPerWtg: canvasRate(selectedPeriod.eurPerWtg),
    });
    setWorkingDate(null);
    setResetFlag(false);
  };

  /**
   * `"AddLandLeaseStandardContractKey"` (LL:388).
   *
   * `leaseAssumptionQuery` describes the `$filter`; the country / technology / contract-type
   * clauses are already the server's (`useLeaseAssumptions`) and the sub-account clause is
   * applied here, over rows still in the server's `Description` order — which is what defect
   * LL-D8 depends on, so they are NOT re-sorted by period.
   */
  const importStandard = async (card: LeaseSubaccountCard) => {
    const query = leaseAssumptionQuery(ctx, card.id);
    const scoped = (assumptions.data ?? []).filter((a) => a.subaccountId === query.subaccountId);
    const plan = planStandardImport({
      ctx,
      subaccountId: card.id,
      subaccountName: card.name,
      assumptions: scoped,
      existingCostsInSubaccount: costs.filter((c) => c.subaccountId === card.id),
      generators,
      countryInflationProfile: standardCountryProfile(countryInflation.data, ctx.codDate),
    });
    // `refused` is the canvas' `If(CountRows(recFilteredStandardContractsForProject) = 0, …)`
    // with no else arm: the command simply does nothing and says nothing.
    if (plan.refused || plan.writes.length === 0) return;
    const selectionAtStart = selection;
    setBusy(LEASE_MSG.loadingStandardContract);
    setError(null);
    try {
      await writes.mutateAsync(plan.writes);
      // CA-17: a row selected while the import ran is kept (`leaseSelectionAfterWrite`).
      setSelection((current) => leaseSelectionAfterWrite({ atStart: selectionAtStart, current }));
    } catch (e) {
      reportFailure(leaseSaveError.contract("Add Standard Contract", messageOf(e)), setError);
    } finally {
      setBusy(null);
    }
  };

  const onCommand = (card: LeaseSubaccountCard, key: string) => {
    if (writeDisabled) return;
    setError(null);
    if (key === "newLandLeaseContractKey") openAddContract(card);
    else if (key === "newLandLeasePeriodKey") openAddPeriod(card);
    else if (key === "AddLandLeaseStandardContractKey") void importStandard(card);
    else if (key === "EditLandLeasePeriodKey") openEdit(card);
    else if (key === "deleteLandLeasePeriodKey") {
      if (selectedContract && selectedPeriod) {
        setDeleting({ contract: selectedContract, period: selectedPeriod });
      }
    }
  };

  /* ── save ─────────────────────────────────────────────────────────────── */

  const saveDisabled = !form || !panel || writes.isPending || writeInFlight || !canSaveLandLease({
    form,
    selectedCost: panel?.cost ?? null,
    selectedPeriod: panel?.period ?? null,
    contract: panelContract,
    panelState: panel?.state ?? "New",
    technology: ctx.technology,
    countryName: ctx.countryName,
    locale,
  });

  /**
   * `drp_…_Currency_1.DefaultSelectedItems` (LL:2762) — `Switch(country, "Poland", PLN, EUR)`.
   * The control is `DisplayMode.Disabled`, so this is the only value it can ever have; a
   * contract that already carries one keeps it rather than being re-pointed on every save.
   */
  const defaultCurrencyId = (currencies.data ?? [])
    .find((c) => c.code === defaultCurrencyCode(ctx.countryName))?.id ?? null;

  const commit = async () => {
    if (!form || !panel || saveDisabled) return;
    const plan = planLeaseSave({
      form: { ...form, currencyId: form.currencyId ?? defaultCurrencyId },
      ctx,
      subaccountId: panel.subaccountId,
      subaccountName: panel.subaccountName,
      selectedCost: panel.cost,
      selectedPeriod: panel.period,
      parentPeriod: panel.parentPeriod,
      existingAllocations: allocations,
      generators,
      panelState: panel.state,
      locale,
    });
    /*
     * THE PANEL CLOSES FIRST, THEN THE SPINNER APPEARS — the canvas raises the spinner and
     * dismisses the panel in ONE `UpdateContext`: `{locSpinnerInformationText: "Saving Land
     * Lease Contract...", locIsVisiblePopUpSpinner: true, locIsVisibleRightPanelNewEditPeriod:
     * false}`, before any write. Closing after the await drew the spinner over the panel.
     * (Since D58 the "spinner" is the `<WriteStatus>` line plus the write guard; same order.)
     *
     * Only the panel moves. Clearing the SELECTION stays below, where the canvas keeps it —
     * that is a separate, later `UpdateContext` (LL:5895).
     */
    const selectionAtStart = selection;
    setBusy(LEASE_MSG.savingContract);
    setError(null);
    closePanel();
    try {
      // The plan's order IS the canvas': header first (so a brand-new contract has an id
      // before the allocations and the period bind to it), then the allocation upserts, the
      // allocation deletes, and the period. `applyLeaseWrites` resolves each `parentRef`
      // against the ids the earlier creates returned, because `batch` is not a changeset and
      // an OData `$id` content reference would have nothing to resolve inside.
      await writes.mutateAsync(plan.writes);
      // `UpdateContext({locSelectedLandLeaseCost: Blank(), locSelectedLandLeasePeriod: Blank()})`
      // — `clearsSelectionAfterSave`, LL:5895; a row selected mid-save is kept (CA-17).
      setSelection((current) => leaseSelectionAfterWrite({ atStart: selectionAtStart, current }));
    } catch (e) {
      const source = plan.writesHeader ? "Land Lease Project Costs" : "Land Lease Periods";
      reportFailure(plan.writesHeader
        ? leaseSaveError.contract(source, messageOf(e))
        : leaseSaveError.period(source, messageOf(e)), setError);
    } finally {
      setBusy(null);
    }
  };

  /* ── delete ───────────────────────────────────────────────────────────── */

  const dialog = deleteDialog(deleting?.period);

  const confirmDelete = async () => {
    if (!deleting) return;
    const plan = planLeaseDelete(deleting.contract, deleting.period, allocations);
    const selectionAtStart = selection;
    setDeleting(null);
    setBusy(plan.kind === "contract" ? LEASE_MSG.deletingContract : LEASE_MSG.deletingPeriod);
    setError(null);
    try {
      await writes.mutateAsync(plan.writes);
      // CA-17: kept if picked mid-delete, unless it pointed at a deleted period or contract.
      setSelection((current) => leaseSelectionAfterWrite({
        atStart: selectionAtStart, current,
        deleted: { periodIds: plan.periodIds, costIds: plan.costIds },
      }));
    } catch (e) {
      reportFailure(plan.kind === "contract"
        ? leaseSaveError.contract("Delete Land Lease", messageOf(e))
        : leaseSaveError.period("Delete Period", messageOf(e)), setError);
    } finally {
      setBusy(null);
    }
  };

  /* ── render ───────────────────────────────────────────────────────────── */

  /*
   * D60: the first load shows an inline spinner in the body ("Loading Land Lease…"), with every
   * write command disabled (`writeCommandsDisabled`) and `aria-busy` on the page. The load check
   * still comes BEFORE the error check, so a load in progress never reads "Cost data is
   * unavailable".
   *
   * A failed read must not look like a project with no leases (same state as Capex / Opex).
   */
  if (!isLoading && (book.error || extras.error)) {
    return (
      <EmptyState
        title="Cost data is unavailable"
        description="This project's Cost data could not be loaded."
      />
    );
  }

  const permissions = {
    canCreateCost: serverEnforcedProvider.forTable(LEASE_ENTITY_SET.cost).canCreate,
    canCreatePeriod: serverEnforcedProvider.forTable(LEASE_ENTITY_SET.period).canCreate,
    canEditRecord: selectedPeriod
      ? serverEnforcedProvider.forRecord(LEASE_ENTITY_SET.period, selectedPeriod.id).canWrite
      : serverEnforcedProvider.forTable(LEASE_ENTITY_SET.period).canWrite,
    canDeleteRecord: selectedPeriod
      ? serverEnforcedProvider.forRecord(LEASE_ENTITY_SET.period, selectedPeriod.id).canDelete
      : serverEnforcedProvider.forTable(LEASE_ENTITY_SET.period).canDelete,
  };

  return (
    <div className={styles.page} aria-busy={isLoading || undefined}>
      {error ? (
        <MessageBar intent="error" politeness="assertive">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      ) : null}
      {/*
        * `cmp_LandLease_PopUpLoading` (`InformationText: =locSpinnerInformationText`, `Visible:
        * =locIsVisiblePopUpSpinner`): the blocking spinner with the verbatim `LEASE_MSG` text
        * shows for as long as the write runs (D60). The write guard also disables the write
        * commands.
        */}
      {/* CA-15: a write still running from another screen (or an earlier visit) says so. */}
      <WriteStatus testId="land-lease-write-status" label={costWriteStatusLabel({
        ownLabel: busy, ownPending: writes.isPending, writeInFlight,
      })} />
      {isLoading ? (
        <LoadingOverlay mode="inline" label="Loading Land Lease…" testId="land-lease-loading" />
      ) : null}

      <div className={styles.cardList}>
        {cards.map((card) => (
          <SubaccountCard
            key={card.id}
            card={card}
            columns={columns}
            contracts={contracts}
            costById={costById}
            ctx={ctx}
            selection={selection}
            selectedPeriod={selectedPeriod}
            selectedCost={selectedCost}
            selectedContract={selectedContract}
            costs={costs}
            hasMatchingAssumption={
              (assumptions.data ?? []).some((a) => a.subaccountId === card.id)
            }
            permissions={permissions}
            onToggle={() => toggleCard(card.id)}
            onSelectRow={(row) => setSelection((s) => toggleLeaseSelection(s, row))}
            onCommand={(key) => onCommand(card, key)}
            writeDisabled={writeDisabled}
          />
        ))}
      </div>

      <FormPanel
        open={panel !== null}
        title={leasePanelTitle({
          selectedCost: panel?.cost ?? null,
          selectedPeriod: panel?.period ?? null,
          subaccountName: panel?.subaccountName ?? "",
        })}
        // `con_…_NewEditPeriod_Body_1.Width: =Min(650, Parent.Width)` (LL:2003); `panelSkin`
        // carries the canvas captions, disabled boxes and footer for this drawer only.
        width={650}
        panelClassName={styles.panelSkin}
        onDismiss={closePanel}
        footer={
          /*
           * `lbl_…_BodyButtons_Hint_1` (LL:6103) — and it is one of the fifteen labels the Save
           * gate requires to be hidden, so it is a hard block, not advice. The PowerCAT Save
           * drops its fill while disabled: plain text with the checkmark.
           */
          <PanelButtons
            onSave={() => { void commit(); }}
            onCancel={closePanel}
            disabled={saveDisabled}
            subtleWhenDisabled
            hint={form && hintVisible({
              form, selectedCost: panel?.cost ?? null, selectedPeriod: panel?.period ?? null,
            }) ? LEASE_MSG.atLeastOneFigure : undefined}
            saveTestId="pcf_LandLease_RightPanel_NewEditPeriod_BodyButtons_Save_1"
            cancelTestId="pcf_LandLease_RightPanel_NewEditPeriod_BodyButtons_Cancel_1"
          />
        }
      >
        {form && panel ? (
          <LeasePanelBody
            form={form}
            patch={patch}
            panel={panel}
            contract={panelContract}
            allocations={allocations}
            ctx={ctx}
            errors={errors}
            currencies={currencies.data ?? []}
            generators={generators}
            areaOptions={areaOptions}
            countryProfile={countryProfile}
            workingDate={workingDate}
            resetFlag={resetFlag}
            onStartDate={(value) => {
              setWorkingDate(value);
              setResetFlag(false);
              patch({ startDate: value });
            }}
            onResetStartDate={() => {
              const next = resetStartDate({
                codDate: ctx.codDate,
                selectedPeriod: panel.period,
                selectedCost: panel.cost,
              });
              setWorkingDate(next.workingDate);
              setResetFlag(true);
              patch({
                startDate: resolveStartDate({
                  workingDate: next.workingDate,
                  selectedCost: panel.cost,
                  selectedPeriod: panel.period,
                  parentPeriod: panel.parentPeriod,
                  panelState: panel.state,
                  resetStartDate: true,
                }),
                isStartDateStandardAssumption: next.isStartDateStandardAssumption,
              });
            }}
          />
        ) : null}
      </FormPanel>

      <ConfirmDialog
        open={deleting !== null}
        title={dialog.title}
        description={dialog.body}
        confirmText={dialog.confirmLabel}
        cancelText={dialog.cancelLabel}
        // `cmp_LandLease_PopUpConfirmation_DeletePeriod` / `…_DeleteLandLeaseCost` (LL:6191,
        // LL:6225) — a `cmp_PopUp_Confirmation` with `IconConfirmButton: ="Delete"`: the
        // component's own themePrimary Confirm with a bin, not a red danger button.
        confirmIcon="delete"
        // The canvas buttons row: divider above it, regular captions, 16 px icons (26 Oct 2026).
        canvasFooter
        busy={writes.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => { void confirmDelete(); }}
      />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ the card ══ */

function SubaccountCard({
  card, columns, contracts, costById, ctx, selection, selectedPeriod, selectedCost,
  selectedContract, costs, hasMatchingAssumption, permissions,
  onToggle, onSelectRow, onCommand, writeDisabled,
}: {
  card: LeaseSubaccountCard;
  columns: ReturnType<typeof landLeaseColumns>;
  contracts: LeaseContract[];
  costById: Map<string, LeaseCostRow>;
  ctx: LeaseProjectContext;
  selection: typeof NO_LEASE_SELECTION;
  selectedPeriod: LeasePeriodRow | null;
  selectedCost: LeaseCostRow | null;
  selectedContract: LeaseContract | null;
  costs: LeaseCostRow[];
  hasMatchingAssumption: boolean;
  permissions: {
    canCreateCost: boolean; canCreatePeriod: boolean;
    canEditRecord: boolean; canDeleteRecord: boolean;
  };
  onToggle: () => void;
  onSelectRow: (row: { periodId: string; costId: string | null; subaccountId: string }) => void;
  onCommand: (key: string) => void;
  /** D58 — `writeCommandsDisabled`: a load or a write is running, so no new write may start. */
  writeDisabled: boolean;
}) {
  const styles = useStyles();
  const commandRow = useCommandRowStyles();
  const standardClass = useStandardValueClass();
  /*
   * `gal_…_CardBody_Costs_1.Items` (LL:919) — every period of every contract in this
   * sub-account, `Sort(Sort(…, 'Start Date'), Name)`. Power Fx compares the names WITHOUT
   * regard to case (ASdsfg, awef, awef - 2, Dec333 in the canvas screenshot, 26 Oct 2026);
   * `subaccountPeriodRows` compares code units, which put every capitalised name first. The
   * rows are re-ordered here for display, start date still breaking a tie.
   */
  const rows = [...subaccountPeriodRows(contracts, card.id)].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "accent" })
    || (a.startDate ?? "").localeCompare(b.startDate ?? ""));
  const isSelectedCard = selection.subaccountId === card.id;

  const commands = guardLeaseCommands(leaseCommands({
    subaccountId: card.id,
    isSelectedCard,
    selectedPeriod: isSelectedCard ? selectedPeriod : null,
    selectedCost: isSelectedCard ? selectedCost : null,
    contract: isSelectedCard ? selectedContract : null,
    costsInSubaccount: costs.filter((c) => c.subaccountId === card.id),
    hasMatchingAssumption,
    permissions,
  }), writeDisabled);
  const icons = { Add: <AddRegular />, Edit: <EditRegular />, Delete: <DeleteRegular /> };
  const open = !card.isFolded;
  // `con_…_CostsTableHeader_1.Width: =OTP.X + OTP.Width` — the radio lane plus every column.
  const tableWidth = SELECT_COLUMN_WIDTH + columns.reduce((sum, c) => sum + c.width, 0);
  // `gal_…_CardBody_Costs_1.Height: =Max(AllItemsCount * 30 + 10, 50)` (LL:923).
  const galleryHeight = Math.max(rows.length * 30 + 10, 50);

  return (
    <section className={styles.card}>
      <button
        type="button"
        className={styles.cardHeader}
        aria-expanded={open}
        onClick={onToggle}
        aria-label={card.name}
        data-testid={`leasecard-${card.name}`}
      >
        <Text className={styles.cardTitle}>{card.name}</Text>
        {open
          ? <ChevronUpRegular className={styles.chevron} />
          : <ChevronDownRegular className={styles.chevron} />}
      </button>

      {open ? (
        <div className={styles.scroll} style={{ height: `${Math.max(galleryHeight + 74, 50)}px` }}>
          <div className={mergeClasses(styles.toolbar, commandRow.row)}>
            {commands.map((c) => (
              <Button
                key={c.key}
                appearance="transparent"
                className={mergeClasses(
                  commandRow.command, styles.toolbarCommand, !c.enabled && styles.toolbarCommandDisabled,
                )}
                icon={icons[c.icon]}
                disabled={!c.enabled}
                onClick={() => onCommand(c.key)}
                aria-label={c.label}
                data-testid={`lease-${c.key}`}
              >
                {c.label}
              </Button>
            ))}
          </div>

          {/*
            * The header stands even with no rows - `…_CostsTableHeader_1.Visible: =true`,
            * unlike Opex, whose header is gated on the subaccount having costs.
            */}
          <table
            className={styles.table}
            style={{ width: `${tableWidth}px` }}
            aria-label={`${card.name} periods`}
          >
            <colgroup>
              <col style={{ width: `${SELECT_COLUMN_WIDTH}px` }} />
              {columns.map((c) => <col key={c.key} style={{ width: `${c.width}px` }} />)}
            </colgroup>
            <thead>
              <tr>
                <th className={styles.selectCell} />
                {columns.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={mergeClasses(
                      styles.th, c.align === "right" && styles.thRight,
                      c.key === "durationYears" && styles.thDuration,
                    )}
                  >
                    {c.key === "durationYears"
                      ? <span className={styles.thDurationCaption}>{c.label}</span>
                      : c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((period) => {
                const cost = period.projectCostId
                  ? costById.get(period.projectCostId) ?? null
                  : null;
                const row = toLeaseGridRow({
                  period, cost, ctx, selectedPeriodId: selection.periodId,
                });
                const select = () => onSelectRow({
                  periodId: period.id,
                  costId: period.projectCostId,
                  subaccountId: card.id,
                });
                return (
                  <tr
                    key={row.id}
                    className={mergeClasses(
                      styles.row,
                      /* `Italic: =StartsWith(ThisItem.Name, "Standard")` + the themePrimary `Color` (LL:992), rule 20. */
                      standardClass(row.standard),
                      row.selected && styles.rowSelected,
                    )}
                    onClick={select}
                    aria-label="Select period"
                    data-testid={`btn_OpexCosts_Content_Subaccounts_CardBody_CostsTableRow_TransparentButton_2-${row.id}`}
                  >
                    <td className={styles.selectCell}>
                      {/*
                        * `img_…_CostsTableRow_RadioSelection_2` is a picture, not a
                        * control: the whole row is one transparent button
                        * (`btn_…_TransparentButton_2`, LL:1744) and clicking the row that
                        * is already selected DESELECTS it. So the radio is `readOnly` and
                        * its click bubbles to the row — one handler, one toggle, whether
                        * the user hits the dot or the description.
                        */}
                      <input
                        type="radio"
                        name={`lease-${card.id}`}
                        checked={row.selected}
                        readOnly
                        aria-label={`Select ${row.cells.description}`}
                        data-testid={`lease-select-${row.id}`}
                      />
                    </td>
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={mergeClasses(
                          styles.td, c.align === "right" && styles.tdRight,
                          c.key === "description" && row.bold ? styles.tdBold : styles.tdNormal,
                        )}
                      >
                        {row.cells[c.key] ?? ""}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div
            className={styles.rowsSpacer}
            style={{ height: `${galleryHeight - rows.length * 30}px` }}
            aria-hidden
          />
        </div>
      ) : null}
    </section>
  );
}

/* ═════════════════════════════════════════════════════════════════ the panel ══ */

function LeasePanelBody({
  form, patch, panel, contract, allocations, ctx, errors, currencies, generators, areaOptions,
  countryProfile, workingDate, resetFlag, onStartDate, onResetStartDate,
}: {
  form: LandLeaseForm;
  patch: (next: Partial<LandLeaseForm>) => void;
  panel: PanelState;
  contract: LeaseContract | null;
  allocations: readonly LeaseAllocationRow[];
  ctx: LeaseProjectContext;
  errors: Partial<Record<string, string>>;
  currencies: readonly { id: string; name: string; code: string }[];
  generators: readonly GeneratorOption[];
  areaOptions: readonly string[];
  countryProfile: number | null;
  workingDate: string | null;
  resetFlag: boolean;
  onStartDate: (value: string) => void;
  onResetStartDate: () => void;
}) {
  const styles = useStyles();
  const iso = ctx.isoCurrencyCode;
  const headerOn = headerEditable(panel.period, panel.cost);
  const allocationOn = allocationVisible(ctx.technology);
  const allocationEnabled = allocationEditable(panel.period, panel.cost);
  const errorFor = (key: string) => errors[key];
  const [allocationOpen, setAllocationOpen] = useState(false);
  /*
   * `cmb_…_AllocationWtg_1.Items: =Sort(colGeneratorsInProject, Order, Ascending)` (LL:3944),
   * `Order` being the number after the name's last "_". A name with no such number (the PV
   * rows, "Label Test pV", "PV48") has a BLANK order, and the canvas lists those LAST — the
   * canvas screenshot (26 Oct 2026) shows WTG 000_1 … 000_22 first. `generatorOptions` scores
   * them 0, which put them first, so the list is re-ordered here for display; ties keep their
   * order (`Array.prototype.sort` is stable).
   */
  const allocationList = [...generators].sort(
    (a, b) => (a.order > 0 ? a.order : Infinity) - (b.order > 0 ? b.order : Infinity),
  );
  // The canvas list opens flush under its box; Fluent leaves a 2 px gap. `autoSize` off: Fluent
  // otherwise writes its own inline `max-height` over the 17-row cap.
  const canvasList = {
    listbox: { className: styles.canvasListbox },
    positioning: { offset: { crossAxis: 0, mainAxis: 0 }, autoSize: false },
  } as const;

  /**
   * The dynamic required markers on Start Date, Duration, Distribution Frequency and
   * Allocation — `lbl_…_StartDateAsterisk_1.Visible` and its three twins (`PA:2481`, `PA:2726`,
   * `PA:3765`, `PA:4040`), which are the same three-armed formula four times over.
   *
   * THE ONE RULE THAT IS NOT IN `landLeaseRules.ts`. It is the visible face of the Save gate's
   * clauses F and I — the period block is required unless this is a payment-only contract with
   * no rate typed — but the rules module exposes that only inside `canSaveLandLease`, and that
   * file is not ours to extend. Kept here, next to the controls it marks, rather than
   * duplicated per control.
   */
  const periodBlockRequired = (() => {
    const anyRate = [
      form.fixedCosts, form.percentOfRevenues, form.eurPerMwh, form.eurPerMw, form.eurPerWtg,
    ].some((v) => v.trim() !== "");
    if (form.oneTimePaymentsOn && !panel.cost) return anyRate;
    if (panel.cost && isPeriodOne(panel.period?.period ?? null)) return anyRate;
    return true;
  })();

  const required = (on = true) =>
    (on ? <span className={styles.required}>*</span> : null);

  const paymentButton = (n: 2 | 3) => addPaymentButton(n, {
    showSecondPayment: form.showSecondPayment,
    showThirdPayment: form.showThirdPayment,
    previousAmount: n === 2 ? form.payments.amount : form.payments.amount2,
    previousDueDate: n === 2 ? form.payments.dueDate : form.payments.dueDate2,
    previousAmountError: Boolean(errorFor(n === 2 ? "amount" : "amount2")),
    previousDueDateError: Boolean(errorFor(n === 2 ? "dueDate" : "dueDate2")),
    selectedPeriod: panel.period,
    hasParentPeriod: panel.parentPeriod !== null,
  });

  const togglePaymentBlock = (n: 2 | 3, shown: boolean) => {
    // Every canvas path that hides a block also `Reset`s its two inputs (LL:5117, LL:5473),
    // which is why a hidden box can never hold a stale value that blocks Save.
    if (n === 2) {
      patch(shown
        ? { showSecondPayment: false, showThirdPayment: false,
          payments: { ...form.payments, dueDate2: "", amount2: "", dueDate3: "", amount3: "" } }
        : { showSecondPayment: true });
      return;
    }
    patch(shown
      ? { showThirdPayment: false, payments: { ...form.payments, dueDate3: "", amount3: "" } }
      : { showThirdPayment: true });
  };

  const currencyName = currencies.find((c) => c.id === form.currencyId)?.name
    // `drp_…_Currency_1.DefaultSelectedItems` (LL:2762) — PLN for Poland, EUR otherwise.
    ?? currencies.find((c) => c.code === defaultCurrencyCode(ctx.countryName))?.name
    ?? defaultCurrencyCode(ctx.countryName);

  // `Start Date`'s displayed value is `resolveStartDate`'s, not the raw box: the working date
  // wins in every arm, and the New arm chains off the parent period when it has not been set.
  const startDate = resolveStartDate({
    workingDate: workingDate ?? form.startDate,
    selectedCost: panel.cost,
    selectedPeriod: panel.period,
    parentPeriod: panel.parentPeriod,
    panelState: panel.state,
    resetStartDate: resetFlag,
  }) ?? "";

  return (
    <div className={styles.panelColumns}>
      {/* ── con_LandLease_RightPanel_NewEditContractPeriod_LeftBodyContent ── */}
      <div className={styles.panelColumn}>
        <CostField
          label={LEASE_LABELS.description}
          name="txt_LandLease_RightPanel_NewEditCost_BodyContent_Description_1"
          // `lbl_…_DescriptionAsterisk_1.Visible = IsBlank(locSelectedLandLeasePeriod)` (LL:2246).
          required={panel.period === null}
          value={form.description}
          maxLength={LEASE_DESCRIPTION_MAX_LENGTH}
          disabled={!headerOn}
          error={errorFor("description")}
          onChange={(v) => patch({ description: v })}
        />

        <div>
          <Text className={styles.label}>
            {required(periodBlockRequired)}{LEASE_LABELS.startDate}
          </Text>
          <div className={styles.dateRow}>
            {/*
              * `dte_…_StartDate_1` — a `DatePicker@0.0.46`, `Format: LongAbbreviated`
              * ("Wed, May 8, 2030"), `StartOfWeek: Monday`, `Width: =Parent.Width-Self.X*2-40`
              * to leave room for the reset icon (LL:2336). `FontItalic` / `FontColor` follow the
              * standard-assumption flag (rule 20). It sets NO `DisplayMode`, so it stays
              * editable on a later period too — the period's own start date — unlike the header
              * fields `headerEditable` locks (canvas Add Period screenshot, 26 Oct 2026).
              */}
            <DateInput
              value={startDate}
              format="LongAbbreviated"
              standard={startDateIsStandard(form.isStartDateStandardAssumption)}
              onChange={(v) => onStartDate(v ?? "")}
              className={styles.startDate}
              ariaLabel={LEASE_LABELS.startDate}
              testId="lease-start"
            />
            {/* `ico_ResetStartDay_NewEditCost_LandLease_1` (LL:2503). */}
            {resetStartDateVisible(panel.period, panel.cost) ? (
              <Tooltip content={LEASE_MSG.resetStartDateTooltip} relationship="label">
                <Button
                  appearance="subtle"
                  className={styles.resetIcon}
                  icon={<ArrowClockwiseRegular />}
                  onClick={onResetStartDate}
                  aria-label={LEASE_MSG.resetStartDateTooltip}
                  data-testid="lease-reset-start"
                />
              </Tooltip>
            ) : null}
          </div>
        </div>

        <div>
          <Text className={styles.label}>
            {required(periodBlockRequired)}{LEASE_LABELS.duration}
          </Text>
          <div className={styles.duration}>
            <Dropdown
              aria-label={`${LEASE_LABELS.duration} years`}
              {...canvasList}
              value={form.durationYears === null ? "" : durationYearLabel(form.durationYears)}
              selectedOptions={form.durationYears === null ? [] : [String(form.durationYears)]}
              onOptionSelect={(_, d) => patch({
                durationYears: Number(d.optionValue),
                // `DefaultSelectedItems` on the months dropdown selects 0 once a year is
                // picked, which is what makes the Save gate's blank-months arm reachable.
                durationMonths: form.durationMonths ?? 0,
              })}
              className={styles.durationYears}
              data-testid="lease-years"
            >
              {DURATION_YEAR_OPTIONS.map((y) => (
                <Option key={y} value={String(y)}>{durationYearLabel(y)}</Option>
              ))}
            </Dropdown>
            <Dropdown
              aria-label={`${LEASE_LABELS.duration} months`}
              {...canvasList}
              value={form.durationMonths === null ? "" : durationMonthLabel(form.durationMonths)}
              selectedOptions={form.durationMonths === null ? [] : [String(form.durationMonths)]}
              onOptionSelect={(_, d) => patch({ durationMonths: Number(d.optionValue) })}
              className={styles.durationMonths}
              data-testid="lease-months"
            >
              {DURATION_MONTH_OPTIONS.map((m) => (
                <Option key={m} value={String(m)}>{durationMonthLabel(m)}</Option>
              ))}
            </Dropdown>
          </div>
        </div>

        <div>
          {/* `drp_…_Currency_1` is `DisplayMode.Disabled` always — `currencyEditable()`. */}
          <Text className={styles.label}>{LEASE_LABELS.currency}</Text>
          <Dropdown
            aria-label={LEASE_LABELS.currency}
            {...canvasList}
            className={styles.panelDropdown}
            value={currencyName}
            selectedOptions={[currencyName]}
            disabled={!currencyEditable()}
            data-testid="lease-currency"
          >
            <Option value={currencyName}>{currencyName}</Option>
          </Dropdown>
        </div>

        <CostField
          label={leaseCurrencyLabel.fixCosts(iso)}
          name="txt_LandLease_RightPanel_NewEditPeriod_BodyContent_FixedCosts_1"
          type="text" value={form.fixedCosts}
          error={errorFor("fixedCosts")} onChange={(v) => patch({ fixedCosts: v })}
        />
        <CostField
          label="Share of Revenues [%]"
          name="txt_LandLease_RightPanel_NewEditPeriod_BodyContent_PercentOfRevenues_1"
          type="text" value={form.percentOfRevenues}
          error={errorFor("percentOfRevenues")}
          onChange={(v) => patch({ percentOfRevenues: v })}
        />
        <CostField
          label={rateLabel("MWh", iso)}
          name="txt_LandLease_RightPanel_NewEditPeriod_BodyContent_EuroMWh_1"
          type="text" value={form.eurPerMwh}
          error={errorFor("eurPerMwh")} onChange={(v) => patch({ eurPerMwh: v })}
        />
        <CostField
          label={rateLabel("MW", iso)}
          name="txt_LandLease_RightPanel_NewEditPeriod_BodyContent_EuroMW_1"
          type="text" value={form.eurPerMw}
          error={errorFor("eurPerMw")} onChange={(v) => patch({ eurPerMw: v })}
        />
        <CostField
          label={rateLabel("WTG", iso)}
          name="txt_LandLease_RightPanel_NewEditPeriod_BodyContent_EuroWTG_1"
          type="text" value={form.eurPerWtg}
          error={errorFor("eurPerWtg")} onChange={(v) => patch({ eurPerWtg: v })}
        />

        <div>
          {/* `lbl_…_AggregationAsterisk_1.Visible = false` (LL:3627) — no marker, deliberately. */}
          <Text className={styles.label}>{LEASE_LABELS.aggregation}</Text>
          <Dropdown
            aria-label={LEASE_LABELS.aggregation}
            {...canvasList}
            className={styles.panelDropdown}
            value={form.aggregation === null ? "" : AGGREGATION_LABELS[form.aggregation] ?? ""}
            selectedOptions={form.aggregation === null ? [] : [String(form.aggregation)]}
            onOptionSelect={(_, d) => patch({ aggregation: Number(d.optionValue) })}
            data-testid="lease-aggregation"
          >
            {AGGREGATION_OPTIONS.map((a) => (
              <Option key={a} value={String(a)}>{AGGREGATION_LABELS[a] ?? ""}</Option>
            ))}
          </Dropdown>
        </div>

        <div>
          <Text className={styles.label}>
            {required(periodBlockRequired)}{LEASE_LABELS.distributionFrequency}
          </Text>
          <Dropdown
            aria-label={LEASE_LABELS.distributionFrequency}
            {...canvasList}
            className={styles.panelDropdown}
            value={DISTRIBUTION_FREQUENCIES
              .find((f) => f.value === form.distributionFrequency)?.label ?? ""}
            selectedOptions={form.distributionFrequency === null
              ? [] : [String(form.distributionFrequency)]}
            onOptionSelect={(_, d) => patch({ distributionFrequency: Number(d.optionValue) })}
            data-testid="lease-frequency"
          >
            {DISTRIBUTION_FREQUENCIES.map((f) => (
              <Option key={f.value} value={String(f.value)}>{f.label}</Option>
            ))}
          </Dropdown>
        </div>
      </div>

      {/* ── con_LandLease_RightPanel_NewEditContractPeriod_RightBodyContent ── */}
      <div className={styles.panelColumn}>
        <div className={styles.toggleRow} data-toggle-row>
          <Switch
            checked={form.securedChecked}
            disabled={!headerOn}
            onChange={(_, d) => patch({ securedChecked: d.checked })}
            aria-label={LEASE_LABELS.secured}
            data-testid="lease-secured"
          />
          <Text>{LEASE_LABELS.secured}</Text>
        </div>

        {/* `PA:3861` / `PA:3904` — both allocation controls are PV-or-Wind only. */}
        {allocationOn ? (
          <>
            <div className={styles.toggleRow} data-toggle-row>
              <Switch
                checked={form.allWtgAllocated}
                disabled={!allocationEnabled}
                onChange={(_, d) => patch({
                  allWtgAllocated: d.checked,
                  // `locSelectAllWTG` — `cmb_…_AllocationWtg_1.DefaultSelectedItems` (LL:3905)
                  // pre-selects EVERY generator while it is on and falls back to the
                  // contract's stored allocation rows when it is off.
                  // `colAllocatedWtgsInSelectedLandLeaseCost` — THIS contract's rows only. Passing
                  // every contract's rows refilled a brand-new contract with every generator
                  // allocated anywhere in the project when the toggle was switched off.
                  allocatedGeneratorIds: defaultAllocatedGenerators(
                    generators,
                    allocations.filter((a) => panel.cost !== null && a.projectCostId === panel.cost.id),
                    d.checked,
                  ).map((g) => g.id),
                })}
                aria-label={LEASE_LABELS.allocateToAllWtgs}
                data-testid="lease-all-wtg"
              />
              <Text>{LEASE_LABELS.allocateToAllWtgs}</Text>
            </div>

            <div data-testid="lease-allocation">
              <Text className={mergeClasses(styles.label, styles.labelStrong)}>
                {required(periodBlockRequired)}{LEASE_LABELS.allocation}
              </Text>
              <Dropdown
                multiselect
                aria-label={LEASE_LABELS.allocation}
                className={mergeClasses(styles.panelDropdown, styles.singleLine)}
                listbox={{ className: styles.allocationListbox }}
                disabled={!allocationEnabled}
                selectedOptions={form.allocatedGeneratorIds}
                // The modern ComboBox turns into an empty search box while its list is open.
                onOpenChange={(_, d) => setAllocationOpen(d.open)}
                value={allocationOpen ? "" : allocationList
                  .filter((g) => form.allocatedGeneratorIds.includes(g.id))
                  .map((g) => g.label)
                  .join(", ")}
                onOptionSelect={(_, d) => patch({
                  allocatedGeneratorIds: d.selectedOptions,
                  // `Rule 10` — `CountIf(SelectedItems) = CountIf(colGeneratorsInProject)`.
                  allWtgAllocated: generators.length > 0
                    && d.selectedOptions.length === generators.length,
                })}
                data-testid="cmb_LandLease_RightPanel_NewEditCost_BodyContent_AllocationWtg_1"
              >
                {allocationList.map((g) => (
                  <Option key={g.id} value={g.id}>{g.label}</Option>
                ))}
              </Dropdown>
            </div>
          </>
        ) : null}

        <div className={styles.toggleRow} data-toggle-row>
          <Switch
            checked={form.inflationChecked}
            disabled={!headerOn}
            onChange={(_, d) => patch({
              inflationChecked: d.checked,
              inflationStartYear: d.checked && form.inflationStartYear === ""
                ? String(inflationStartYearDefault(null, startDate) ?? "")
                : form.inflationStartYear,
            })}
            aria-label={LEASE_LABELS.inflationProfile}
            data-testid="lease-inflation"
          />
          <Text>{LEASE_LABELS.inflationProfile}</Text>
        </div>

        {inflationSectionVisible(form.inflationChecked) ? (
          <>
            <div className={mergeClasses(styles.toggleRow, styles.toggleRowTight)} data-toggle-row>
              {/*
                * `lbl_…_CountryInflationToggleAsterisk_1.Visible` is `=//If(...)` — a formula
                * that is nothing but a comment, so it evaluates blank and the marker never
                * shows on Land Lease. The OPEX screen's twin does show it (PA:4103).
                */}
              <Switch
                checked={form.countryInflationChecked}
                disabled={!headerOn}
                onChange={(_, d) => patch({
                  countryInflationChecked: d.checked,
                  inflationProfile: formatProfile(resolveInflationProfileValue({
                    selectedCost: panel.cost,
                    countryInflationChecked: d.checked,
                    countryName: ctx.countryName,
                    countryProfile,
                  })),
                })}
                aria-label={LEASE_LABELS.countryInflationProfile}
                data-testid="lease-country-inflation"
              />
              <Text>{LEASE_LABELS.countryInflationProfile}</Text>
            </div>

            <CostField
              label={LEASE_LABELS.inflationStartYear}
              name="txt_LandLease_RightPanel_NewEditCost_BodyContent_InflationStartYear_1"
              required
              value={form.inflationStartYear}
              placeholder={LEASE_LABELS.inflationStartYearPlaceholder}
              disabled={!headerOn}
              error={errorFor("inflationStartYear")}
              onChange={(v) => patch({ inflationStartYear: v })}
            />

            {/* `con_…_AreaInflationProfile_1.Visible` (LL:4391) — Italy only. */}
            {areaInflationVisible({
              inflationChecked: form.inflationChecked,
              countryInflationChecked: form.countryInflationChecked,
              countryName: ctx.countryName,
            }) ? (
              <div>
                <Text className={styles.label}>
                  {required()}{LEASE_LABELS.area}
                </Text>
                <Dropdown
                  aria-label={LEASE_LABELS.area}
                  {...canvasList}
                  className={mergeClasses(styles.panelDropdown, styles.areaDropdown)}
                  value={form.inflationCountryArea ?? ""}
                  selectedOptions={form.inflationCountryArea ? [form.inflationCountryArea] : []}
                  disabled={!headerOn}
                  onOptionSelect={(_, d) => patch({ inflationCountryArea: d.optionValue ?? null })}
                  data-testid="lease-area"
                >
                  {areaOptions.map((a) => <Option key={a} value={a}>{a}</Option>)}
                </Dropdown>
              </div>
            ) : null}

            {/*
              * One label, two fields — `lbl_…_InflationProfile_1.Text` (LL:4645). The country
              * toggle swaps the editable percentage for `txt_…_InflationProfile_2` (LL:4708), a
              * `TextInput` that is `DisplayMode.Disabled` whenever it shows: the canvas' white
              * outlined box with grey text, not a grey read-only strip.
              */}
            {form.countryInflationChecked ? (
              <CostField
                label={inflationProfileLabel(true)}
                name="txt_LandLease_RightPanel_NewEditCost_BodyContent_InflationProfile_2"
                value={countryInflationDisplay(ctx)}
                disabled
              />
            ) : (
              <CostField
                label={inflationProfileLabel(false)}
                name="txt_LandLease_RightPanel_NewEditCost_BodyContent_InflationProfile_1"
                required
                type="text"
                value={form.inflationProfile}
                disabled={!headerOn}
                error={errorFor("inflationProfile")}
                onChange={(v) => patch({ inflationProfile: v })}
              />
            )}
          </>
        ) : null}

        <div className={styles.toggleRow} data-toggle-row data-otp-row>
          <Switch
            checked={form.oneTimePaymentsOn}
            disabled={!headerOn}
            onChange={(_, d) => patch({
              oneTimePaymentsOn: d.checked,
              // `OnUncheck` resets all six boxes and both extra blocks (LL:4748).
              ...(d.checked ? {} : {
                showSecondPayment: false,
                showThirdPayment: false,
                payments: {
                  dueDate: "", amount: "", dueDate2: "", amount2: "", dueDate3: "", amount3: "",
                },
              }),
            })}
            aria-label={LEASE_LABELS.oneTimePayment}
            data-testid="lease-otp"
          />
          <Text>{LEASE_LABELS.oneTimePayment}</Text>
        </div>

        {/*
          * The payment BLOCKS follow the toggle, but `btn_OneTimePayment2_…` does not: its
          * `Visible: =!locShowThirdPayment` (LL:5136) has no toggle term, so with One-Time
          * Payment off it still shows — disabled, its date and amount being blank — as the
          * canvas screenshot (26 Oct 2026) shows. Unchecking the toggle resets both extra
          * blocks, so the third button (`Visible: =locShowSecondPayment`) is hidden then.
          */}
        {form.oneTimePaymentsOn ? (
          <PaymentBlock
            n={1} form={form} patch={patch} iso={iso} errors={errors} disabled={!headerOn}
          />
        ) : null}
        {/* Canvas order (LL:4782-5799): payment 1, its button, payment 2, its button, payment 3. */}
        {paymentButton(2).visible ? (
          <Button
            appearance="transparent"
            className={mergeClasses(
              styles.command, !paymentButton(2).enabled && styles.commandDisabled,
            )}
            icon={paymentButton(2).icon === "Add" ? <AddFilled /> : <DeleteFilled />}
            disabled={!paymentButton(2).enabled}
            onClick={() => togglePaymentBlock(2, form.showSecondPayment)}
            aria-label={paymentButton(2).label}
            data-testid="lease-payment-2"
          >
            {paymentButton(2).label}
          </Button>
        ) : null}
        {form.oneTimePaymentsOn && form.showSecondPayment ? (
          <PaymentBlock
            n={2} form={form} patch={patch} iso={iso} errors={errors} disabled={!headerOn}
          />
        ) : null}
        {paymentButton(3).visible ? (
          <Button
            appearance="transparent"
            className={mergeClasses(
              styles.command, !paymentButton(3).enabled && styles.commandDisabled,
            )}
            icon={paymentButton(3).icon === "Add" ? <AddFilled /> : <DeleteFilled />}
            disabled={!paymentButton(3).enabled}
            onClick={() => togglePaymentBlock(3, form.showThirdPayment)}
            aria-label={paymentButton(3).label}
            data-testid="lease-payment-3"
          >
            {paymentButton(3).label}
          </Button>
        ) : null}
        {form.oneTimePaymentsOn && form.showThirdPayment ? (
          <PaymentBlock
            n={3} form={form} patch={patch} iso={iso} errors={errors} disabled={!headerOn}
          />
        ) : null}

        {/* `con_LandLease_WarningOnSaveWithCost` (LL:5802). */}
        {additionalPeriodsWarningVisible({
          form, selectedPeriod: panel.period, contract,
        }) ? (
          <Text className={styles.warning} role="alert" data-testid="lease-periods-warning">
            {LEASE_MSG.additionalPeriodsWarning}
          </Text>
        ) : null}
      </div>
    </div>
  );
}

/** One of the three One-Time Payment blocks: the due date then the amount (LL:4782, LL:4920). */
function PaymentBlock({
  n, form, patch, iso, errors, disabled,
}: {
  n: 1 | 2 | 3;
  form: LandLeaseForm;
  patch: (next: Partial<LandLeaseForm>) => void;
  iso: string | null | undefined;
  errors: Partial<Record<string, string>>;
  disabled: boolean;
}) {
  const dateKey = (n === 1 ? "dueDate" : `dueDate${n}`) as "dueDate" | "dueDate2" | "dueDate3";
  const amountKey = (n === 1 ? "amount" : `amount${n}`) as "amount" | "amount2" | "amount3";
  // The canvas names the first payment block `..._DueDate_1`/`..._Amount_1` and the other two
  // `..._DueDate2_1`/`..._DueDate3_1` — the digit mid-name, not after it.
  const nSuffix = n === 1 ? "" : String(n);
  const styles = useStyles();
  return (
    // `lbl_…_DueDate*_1` / `lbl_…_Amount*_1` are the panel's Semibold captions (LL:4859, LL:5024).
    <div className={styles.contents} data-strong-captions>
      <CostField
        label={LEASE_LABELS.oneTimePaymentDate(n)}
        // `lbl_…_DueDate_1_1` / `_1_2` / `_1_3` — a `*` with no `Visible`, so always shown (LL:4888).
        required
        name={`txt_LandLease_RightPanel_NewEditCost_BodyContent_DueDate${nSuffix}_1`}
        value={form.payments[dateKey]}
        placeholder={LEASE_LABELS.dueDatePlaceholder}
        disabled={disabled}
        error={errors[dateKey]}
        onChange={(v) => patch({ payments: { ...form.payments, [dateKey]: v } })}
      />
      <CostField
        label={leaseCurrencyLabel.oneTimePaymentAmount(n, iso)}
        // `lbl_…_Amount_1_1` / `_1_2` / `_1_3` — a `*` with no `Visible`, so always shown (LL:5053).
        required
        name={`txt_LandLease_RightPanel_NewEditCost_BodyContent_Amount${nSuffix}_1`}
        type="text"
        value={form.payments[amountKey]}
        disabled={disabled}
        error={errors[amountKey]}
        onChange={(v) => patch({ payments: { ...form.payments, [amountKey]: v } })}
      />
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════ small ══ */

/** A `Date` from `ProjectContext` as the ISO day the rules expect, or null. */
function isoDay(value: Date | undefined): string | null {
  if (!value || Number.isNaN(value.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${p(value.getMonth() + 1)}-${p(value.getDate())}`;
}

/** `txt_…_InflationProfile_1.Value` is a one-decimal string; blank stays blank. */
/** `If(Int(v) = v, Text(v, "#"), Text(v, "#0.0#"))` — a whole rate without decimals, else one or two. */
function canvasRate(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (Number.isInteger(value)) return String(value);
  const s = value.toFixed(2);
  return s.endsWith("0") ? s.slice(0, -1) : s;
}

const formatProfile = (value: number | null): string =>
  value === null ? "" : value.toFixed(1);

/**
 * The `Country Inflation Profiles` row the standard import uses — (country, COD year + 1),
 * `LL:388`'s `recCODYear`. Area is not part of that lookup on the import path.
 */
function standardCountryProfile(
  rows: readonly { year: number; area: string; inflation: number }[] | undefined,
  codDate: string | null,
): number | null {
  if (!rows || rows.length === 0 || !codDate) return null;
  const year = Number(codDate.slice(0, 4));
  if (!Number.isFinite(year)) return null;
  return rows.find((r) => r.year === year + 1)?.inflation ?? null;
}

/** A thrown `DataError`'s message, for the two `Notify(...)` strings on the save path. */
function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
