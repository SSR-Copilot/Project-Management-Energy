/**
 * Project Planning Screen — composition only (connected 20 Oct 2026, D31).
 *
 * Canvas screen: `Project Planning Screen.pa.yaml` (PM app). The layout follows its containers:
 *
 *   lock message   `con_Milestones_Page_LockMessage_5` — title and one bullet per prerequisite
 *   tab strip      `tab_ProjectPlanning_DisplayProjectBodyRightContent` — General / Repowering /
 *                  Aquisition Status (`locTabList`), disabled while locked or Draft
 *   General        Cooperation (+ Partner, + Details), Legal Planning Basis, Planning Basis
 *                  Category, Permit Procedure, Planning Basis Details, the Height limitation WTG
 *                  toggle (+ Height limitation [m]), and the Permits grid with its command bar
 *                  (New Permit · Edit · Delete) and columns Permit · Permit Submitted · Permit Approved
 *   Repowering     Repowering (+ Access to old plants secured, + Repowering Details)
 *   Aquisition     two galleries, LLAs in personam and LLAs in rem — Types · Secured · Required ·
 *                  Aquisition Status [%] · an Edit icon per row
 *   buttons        `pcf_…_ButtonsSave` / `pcf_…_ButtonsReset`
 *   panels         New/Edit Permit, Aquisition Status
 *   dialogs        `cmp_ProjectPlanning_PopUp_ConfirmationDeletePermit`; `cmp_PopUp_Loading_Planning_Screen`
 *                  is `LoadingOverlay` / `WriteFeedback`
 *
 * The leave dialog (`cmp_PopUp_Leave_Planning_Confirmation`) is the shared `UnsavedChangesGuard`
 * (D35), armed by `shouldConfirmLeave(form, baseline)`. Every caption, gate and
 * write comes from `rules.ts`; every read and write from `./hooks`.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Button, MessageBar, MessageBarBody, Switch, Tab, TabList, Table, TableBody, TableCell,
  TableHeader, TableHeaderCell, TableRow, Text, Tooltip, makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import { CheckmarkRegular, CircleRegular, DeleteRegular, DismissRegular, EditRegular, LockClosedRegular, RecordRegular } from "@fluentui/react-icons";
import {
  Choices,
  type Command,
  CommandBar,
  ConfirmDialog,
  CostField,
  EmptyState,
  FormPanel,
  LoadingOverlay,
  PanelButtons,
  ReadOnlyField,
  TaggedDateField,
  ChoiceField as SharedChoiceField,
  TextAreaField,
  TextField,
  WriteFeedback,
  UnsavedChangesGuard,
} from "@/components";
import { useSession } from "@/app/SessionContext";
import { dateOnly } from "@/data/odata";
import { palette, space } from "@/theme/tokens";
import {
  AQUISITION_GRID_COLUMNS, AQUISITION_MAX_LENGTH, AQUISITION_PANEL, CUSTOM_CHOICE_FIELD, FIELD_LABELS,
  GENERAL_TAB_LABELS, LLA_TYPE_LABEL, MAX_LENGTH, NOTIFY, PAGE_LOCK_ICON_TESTID, PAGE_LOCK_TESTID,
  PAGE_LOCK_TITLE, PAGE_LOCK_TITLE_TESTID, PERMIT_COMMAND_LABELS, PERMIT_DATE_TYPES, PERMIT_DIALOG,
  PERMIT_GRID_COLUMNS, PERMIT_PANEL_LABELS, PLANNING_BASIS_CATEGORIES, PLANNING_SCREEN_TEXT, PLANNING_TABS,
  REPOWERING_TAB_LABELS, SCREEN_MSG, YES_NO_UNKNOWN,
  applyCooperationChange, applyHeightToggle, applyRepoweringChange, aquisitionDraftFrom, aquisitionPanelTitle,
  aquisitionRowsFor, canEditLegalPlanningBasis, canEditPlanning, canReset, canSave, canSaveAquisition,
  canSavePermit, canSwitchTabs, clearAquisitionJob, cooperationDetailsEditable, countCell, customChoiceOptions,
  deletePermitDescription, deletePermitJob, emptyPermitDraft, pageLock, parseTab, percentCell,
  permitCommandState, permitDateCell, permitDateIsActual, permitDateValue, permitDraftFrom,
  permitInputDate, permitPanelTitle, resetPlanningForm,
  saveAquisitionJob, savePermitJob, savePlanningJob, securedPercent, showCooperationDetailsCanvasParity,
  showCooperationPartner, showHeightLimit, showRepoweringDetails, showSecuredAccess, toPlanningForm,
  togglePermitSelection, validateAquisition, validatePlanning,
  LEAVE_DIALOG, shouldConfirmLeave,
  type AquisitionDraft, type AquisitionStatusRow, type LlaType, type PermitDraft, type PlanningForm,
} from "./rules";
import {
  PLANNING_CAN_EDIT, useAquisitionStatuses, useAquisitionTypes, useCustomChoiceValues, usePermits,
  usePlanningProject, usePlanningWrites, useProjectPlanning,
} from "./hooks";

const C = "ProjectPlanning_DisplayProjectBodyRightContent";

// Layout transcribed from `con_ProjectPlanning_DisplayProjectBodyRightContent` (UI layout pass,
// 20 Oct 2026). The shell's content area scrolls, so the page grows with its content and never clips
// itself to the viewport; the old inner scroll box (which cut off the Permits grid) is gone.
const useStyles = makeStyles({
  // The right content: a white vertical autolayout, no padding and no gap.
  page: { display: "flex", flexDirection: "column", flex: "1 0 auto", minWidth: 0, backgroundColor: palette.white },
  // The tab body has the only FillPortion, so the button row sits at the bottom.
  body: { display: "flex", flexDirection: "column", flex: "1 0 auto", minWidth: 0 },
  // `con_Milestones_Page_LockMessage_5`: Fill RGBA(89,89,89,1), horizontal, gap 10, PaddingLeft 20,
  // items centred, white icon and text; `con_Milestones_pagelock_section_5` pads 8.
  lock: {
    // Canvas pair (29 Oct 2026): the bullets 6 px nearer the icon (gap 4), 4 px more band below them.
    display: "flex", alignItems: "center", gap: "4px", paddingLeft: "20px", flex: "none",
    backgroundColor: "rgb(89, 89, 89)", color: palette.white,
  },
  lockText: {
    // The bullets start 5 px nearer the icon than the section padding put them (canvas, 29 Oct 2026).
    display: "flex", flexDirection: "column", paddingTop: "8px", paddingBottom: "12px", paddingLeft: "3px", paddingRight: "8px",
    "& .fui-Text": { color: palette.white },
  },
  // `con_…_Tab`: 50 high, items centred; the TabList is `Parent.Width/2` wide.
  // Canvas screenshot (28 Oct 2026): the first tab starts 6 px further in.
  // Each tab 2 px wider on both sides than Fluent's, so the captions sit as far apart as the canvas's.
  tabs: {
    display: "flex", alignItems: "center", height: "50px", flex: "none", paddingLeft: "4px",
    // The 1 px rule under the tab row, across the content (canvas, 28 Oct 2026).
    borderBottomWidth: "1px", borderBottomStyle: "solid", borderBottomColor: "#edebe9",
    "& > div": { width: "50%" },
    "& .fui-Tab": { paddingLeft: "12px", paddingRight: "12px" },
    // The canvas tab: 14 px caption, a 2 px square underline in the theme colour.
    "& .fui-Tab__content": { fontSize: "14px" },
    "& .fui-Tab::after": { height: "2px", borderRadius: 0, backgroundColor: palette.themePrimary },
    // Locked (tabs disabled), the canvas bar is a grey, rounded 3 px one (screenshot, 29 Oct 2026).
    "& .fui-Tab:disabled::after": { height: "3px", borderRadius: "2px", backgroundColor: "#a6a6a6" },
  },
  // `con_…_General` / `_Repowering`: a horizontal, wrapping row of 380-wide vertical forms.
  wrapRow: { display: "flex", flexWrap: "wrap", alignItems: "flex-start", minWidth: 0 },
  // `con_…_CooperationForm` (PaddingTop/Bottom 20) and `con_…_PlanningBasisForm` (PaddingTop 20):
  // vertical, `Min(380, Parent.Width)` wide.
  form: {
    display: "flex", flexDirection: "column", width: "100%", maxWidth: "380px", paddingTop: "20px",
    boxSizing: "border-box",
  },
  formPadBottom: { paddingBottom: "20px" },
  // Each field's ManualLayout container: label and control at X = 20, `Parent.Width - 40` wide;
  // 70 high for one line, 94 for a 64-high text box, 178 for a 140-high one. Labels are Semibold.
  field: {
    minHeight: "70px", paddingLeft: "20px", paddingRight: "20px", boxSizing: "border-box",
    "& .fui-Field__label, & label": { fontWeight: tokens.fontWeightSemibold },
    "& .fui-Dropdown": { width: "100%", minWidth: 0 },
    // A DISABLED box is white with a light 1 px frame and grey text (canvas, 28 Oct 2026).
    "& .fui-Input:has(input:disabled), & .fui-Textarea:has(textarea:disabled), & .fui-Dropdown:has(button:disabled)": {
      backgroundColor: palette.white,
      borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
      borderTopStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid", borderLeftStyle: "solid",
      borderTopColor: "#e1dfdd", borderRightColor: "#e1dfdd", borderBottomColor: "#e1dfdd", borderLeftColor: "#e1dfdd",
      borderRadius: "2px",
    },
    // The `{Len}/N` counter sits just above the box; the multi-line box is 60 px tall.
    "& .fui-Field ~ .fui-Text": { top: "6px", color: "#323130" },
    // Rendered 4 px short of the canvas box at 60, so 64.
    "& .fui-Textarea.fui-Textarea": { height: "64px", minHeight: "64px" },
    "& .fui-Textarea textarea.fui-Textarea__textarea": { height: "100%", minHeight: 0, maxHeight: "none" },
  },
  fieldTall: { minHeight: "94px" },
  // The 140-high text box (Repowering Details): it keeps its height over the 60 px default above.
  fieldTaller: {
    minHeight: "178px",
    // `txt_…_RepoweringDetails.Height: =140` (Y:1965).
    "& .fui-Textarea.fui-Textarea.fui-Textarea": { height: "140px", minHeight: "140px" },
  },
  // `con_…_HeightLimitation`: the full row — the 40-high toggle container (toggle at X = 10, 220
  // wide), then the 86-high field container at the cooperation form's width (380).
  // 31 px lower and the label 5 px further in than before (canvas screenshot, 28 Oct 2026).
  heightRow: { display: "flex", flexDirection: "column", width: "100%", marginTop: "31px" },
  toggle: { display: "flex", alignItems: "center", height: "40px", paddingLeft: "15px" },
  // Canvas screenshot (28 Oct 2026): the caption is REGULAR weight at 15 px, level with the box,
  // with a larger red `*` hung 10 px to its left.
  heightField: {
    width: "100%", maxWidth: "380px", minHeight: "86px", boxSizing: "border-box",
    // 8 px further below the toggle, the box 2 px closer to its caption.
    marginTop: "8px",
    "& .fui-Field .fui-Field__label.fui-Field__label": {
      fontWeight: tokens.fontWeightRegular, fontSize: "15px", position: "relative", color: "#323130",
      marginBottom: "-2px",
    },
    "& .fui-Label__required": { position: "absolute", left: "-12px", top: "-1px", fontSize: "18px" },
  },
  // `con_…_Permits`: the command bar at X = 40, then header and gallery at X = 20, `Min(Parent.Width, 700)`.
  permits: { display: "flex", flexDirection: "column", width: "100%", paddingBottom: "10px" },
  // The command bar's first icon starts on the left edge of the content under it (PO, 21 Oct 2026); `CommandBar` has no inset of its own. Over the Permit column text (the table's 20 px inset + the 30 px select column + the cell's 3 px).
  permitsBar: { paddingLeft: "50px", maxWidth: "700px", "& .fui-Button": { marginRight: "-4px" } },
  gridWrap: { overflowX: "auto", paddingLeft: "20px", paddingRight: "20px" },
  // Header: Fill #FAFAFA, 36 high; labels Semibold at X = 30 (Permit 240, Submitted 180, Approved 180).
  permitTable: { width: "100%", maxWidth: "700px", tableLayout: "fixed" },
  // 32 high with no rule under it, as on the canvas screenshot.
  permitHeader: {
    backgroundColor: "#FAFAFA", height: "32px", borderBottomWidth: 0,
    "& th": { fontWeight: tokens.fontWeightSemibold, height: "32px", borderBottomWidth: 0 },
  },
  // Rows: TemplateSize 34, no padding.
  permitRow: { height: "34px" },
  // Measured off the canvas screenshot: captions at 28 / 253 / 422 px from the table's edge.
  colSelect: { width: "21px", paddingLeft: 0, paddingRight: 0 },
  // The widths add up to the table's 656 px so it does not stretch them: captions at 28 / 253 /
  // 422 px from its edge, as on the canvas (29 Oct 2026).
  colPermit: { width: "225px" },
  colDate: { width: "169px" },
  colDateLast: { width: "241px" },
  selectCell: { width: "21px", paddingLeft: 0, paddingRight: 0 },
  row: { cursor: "pointer" },
  rowSelected: { backgroundColor: palette.themeLighter, cursor: "pointer" },
  /** `lbl_…_PermitsRowSubmitted` / `…Approved` `.FontColor` for an Actual date. */
  actualDate: { color: palette.themePrimary },
  // `img_…_PermitsRowSelectionDot`: 16 px at X = 4.
  radio: { color: palette.themePrimary, minWidth: "24px", "& svg": { fontSize: "16px" } },
  // `con_…_AquisitionStatusForm`: vertical, LayoutGap 10, PaddingTop 10; each block
  // `Min(780, Parent.Width)` with PaddingTop 10.
  // Canvas screenshot (28 Oct 2026): the first band 13 px under the tab rule, the tables 5 px further
  // in, 23 px between them.
  aquisition: { display: "flex", flexDirection: "column", gap: "15px", paddingTop: "1px", paddingLeft: "2px" },
  section: { display: "flex", flexDirection: "column", width: "100%", maxWidth: "780px", paddingTop: "10px", minWidth: 0 },
  aqTable: { width: "100%", tableLayout: "fixed" },
  // One 41 px grey band (canvas screenshot, 28 Oct 2026): the section name and the captions on its
  // first line, "Types" under the name; no rule under it.
  aqHeader: {
    backgroundColor: "#FAFAFA", height: "41px", borderBottomWidth: 0,
    "& th": {
      height: "43px !important",
      fontSize: "14.67px", color: "rgb(50, 49, 48)", fontWeight: tokens.fontWeightSemibold,
      verticalAlign: "top", paddingTop: "3px", borderBottomWidth: 0,
    },
    "& th .fui-TableHeaderCell__button": { alignItems: "flex-start" },
  },
  aqTitleStack: { display: "flex", flexDirection: "column", lineHeight: "17px", fontWeight: tokens.fontWeightRegular },
  aqTitle: { fontWeight: tokens.fontWeightSemibold },
  // `pcf_but_…_Edit`: the theme-colour pencil.
  // 24 px, so the 27 px row is not stretched to the 32 px default button.
  aqEdit: {
    color: palette.themePrimary, minWidth: "24px", width: "24px", height: "24px",
    paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
    "& .fui-Button__icon": { color: palette.themePrimary },
  },
  // Rows: TemplateSize 28 + TemplatePadding 1, a 1 px `GallerySeparatorBg` (hoverButton) line; the
  // counts and percentage Semibold, right-aligned.
  aqRow: {
    // 27 px rows on the canvas screenshot.
    height: "27px", borderBottomWidth: "1px", borderBottomStyle: "solid", borderBottomColor: palette.hoverButton,
    "& td": { fontSize: "14.67px", color: "rgb(50, 49, 48)", paddingTop: 0, paddingBottom: 0, height: "29px !important" },
    // The first row sits 4 px further below the header band (it is 32 px on the canvas, the rest 27).
    "&:first-child td": { paddingTop: "4px" },
    // Secured and Required sit flush with their column's right edge on the canvas.
    "& td:nth-child(2), & td:nth-child(3)": { paddingRight: 0 },
    // Row text 2 px further in than the header caption above it.
    "& td:first-child": { paddingLeft: "10px" },
  },
  colName: { width: "300px" },
  // Regular-weight figures and a 75 px action column with the pencil centred (canvas, 28 Oct 2026).
  colCount: { width: "100px", textAlign: "right", fontWeight: tokens.fontWeightRegular },
  colPercent: { width: "160px", textAlign: "right", fontWeight: tokens.fontWeightRegular },
  colAction: { width: "75px", textAlign: "center" },
  // `con_…_Buttons`: 50 high, items centred, LayoutGap 10, justified end, PaddingRight 10; 96 x 32 buttons.
  // As Grid Operator: a 48 px strip under a 1 px rule; Save filled when it can save, Cancel
  // outlined blue when it can reset, both plain dark-grey text with a black glyph when disabled.
  buttons: {
    display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "10px", flex: "none",
    // Save / Cancel 9 px further in from the right edge (canvas, 29 Oct 2026).
    height: "48px", paddingRight: "19px",
    // Sampled off the canvas (28 Oct 2026): ONE 1 px #dddddd line, and it is the BOTTOM of the
    // content card, so at both ends it curves UP into the card's side edge (4 px corners).
    position: "relative",
    "::before": {
      content: '""', position: "absolute", left: 0, right: 0, top: "-5px", height: "5px",
      boxSizing: "border-box", pointerEvents: "none",
      borderBottomWidth: "1px", borderBottomStyle: "solid", borderBottomColor: "#dddddd",
      borderLeftWidth: "1px", borderLeftStyle: "solid", borderLeftColor: "#dddddd",
      borderRightWidth: "1px", borderRightStyle: "solid", borderRightColor: "#dddddd",
      borderBottomLeftRadius: "4px", borderBottomRightRadius: "4px",
      // The content card's soft shadow under that edge, as the canvas cards cast.
      boxShadow: "rgba(0, 0, 0, 0.14) 0 1px 2px",
    },
    "& button": { width: "90px", minWidth: "90px", height: "30px", fontWeight: 400 },
    "& button:disabled": { color: "#605e5c", backgroundColor: "transparent" },
    "& button:disabled .fui-Button__icon": { color: palette.black },
  },
  cancelEnabled: {
    color: palette.themePrimary, backgroundColor: palette.white,
    borderTopColor: palette.themePrimary, borderRightColor: palette.themePrimary,
    borderBottomColor: palette.themePrimary, borderLeftColor: palette.themePrimary,
    "& .fui-Button__icon": { color: palette.themePrimary },
    ":hover": { color: palette.themePrimary, backgroundColor: palette.themeLighter },
  },
  panelBody: { display: "flex", flexDirection: "column", gap: space.m },
  /** The save notice, pinned across the very top of the app above the project header. */
  flash: { position: "fixed", top: 0, left: 0, right: 0, zIndex: 2000, borderRadius: 0 },
  /**
   * The New / Edit Permit drawer as the canvas draws it (screenshot, 28 Oct 2026). Its fields are
   * the plain `canvas-field` / `canvas-radio-group` markup, so the rules target those:
   *   - the `*` hangs 10 px left of the caption, the caption level with the box;
   *   - the Plan / Actual radios start 5 px in and sit 15 px closer together;
   *   - 31 px from a caption to the radios' middle, 22 px on to the date box;
   *   - Approval Date 30 px below the submission date box.
   */
  permitBody: {
    "& .canvas-field > span[data-required=\"true\"], & .canvas-radio-group legend > span[data-required=\"true\"]": {
      position: "relative",
    },
    "& .canvas-field > span[data-required=\"true\"]::before, & .canvas-radio-group legend > span[data-required=\"true\"]::before": {
      position: "absolute", left: "-10px",
    },
    "& .canvas-radio-group legend": { marginBottom: "6px" },
    // Focused, a box keeps no outline: only the 2 px theme-colour underline, as on the canvas.
    "& .canvas-field > input:focus": { outlineStyle: "none", boxShadow: `inset 0 -2px 0 ${palette.themePrimary}` },
    "& .canvas-radio-group > label:first-of-type": { marginLeft: "5px" },
    "& .canvas-radio-group > label + label": { marginLeft: "-15px" },
    "& > :nth-child(3), & > :nth-child(5)": { marginTop: "-4px" },
    "& > :nth-child(4)": { marginTop: "11px" },
  },
  // Header 48 px with a bold title and a larger, half-white ✕; footer 60 px under its rule, a
  // disabled Save as plain dark-grey text with no glyph, both buttons 90 x 30 regular weight.
  /**
   * The Aquisition Status drawer (canvas screenshot, 28 Oct 2026): every caption Semibold; an
   * invalid box keeps its look (no red frame) and its 12 px message tucks under it without
   * pushing the next field down; a bold 16 px title that may wrap, a larger half-white ✕;
   * "Clear & Save" on the left, outlined blue with a bin; Save plain when disabled.
   */
  aqBody: {
    // The canvas drawer's fields sit 7 px further in on both sides.
    paddingLeft: "7px", paddingRight: "7px",
    "& .canvas-field > span:first-child, & .fui-Field .fui-Field__label.fui-Field__label": {
      fontWeight: tokens.fontWeightSemibold,
    },
    "& .canvas-field": { position: "relative" },
    "& .canvas-field[data-invalid] > input": { outlineStyle: "none" },
    // Focused, the canvas box shows only its theme-blue underline, no outline.
    "& .canvas-field > input:focus": { outlineStyle: "none", boxShadow: `inset 0 -2px 0 ${palette.themePrimary}` },
    // The typed value 1 px larger than the shared 14 px, in a 4 px-rounded box (canvas, 28 Oct 2026).
    "& .canvas-field > input": { fontSize: "15px", borderRadius: "4px" },
    "& .canvas-field-error": {
      position: "absolute", top: "100%", left: "6px", marginTop: "2px", fontSize: "12px", lineHeight: "13px",
    },
  },
  aqPanelSkin: {
    // A 48 px header whose title wraps where the canvas's does (its font is wider).
    "&.canvas-panel .canvas-panel-header": {
      height: "48px", minHeight: "48px", paddingTop: "4px", paddingBottom: "4px",
    },
    "&.canvas-panel .canvas-panel-header h2": {
      fontSize: "16px", fontWeight: tokens.fontWeightBold, whiteSpace: "normal", lineHeight: "20px",
      // "…[LLAs in rem]" fits on one line, "…[LLAs in personam]" breaks after "in", as on the canvas.
      maxWidth: "270px",
    },
    // "Clear & Save" on the far left: the shared rule pushes the first footer button right.
    "&.canvas-panel .canvas-panel-footer > *:first-child": { marginLeft: 0, marginRight: "auto" },
    // No rule above the buttons on the canvas.
    "&.canvas-panel .canvas-panel-footer.canvas-panel-footer": { borderTopWidth: 0 },
    // Save's caption 1 px larger than the other two (15 px).
    "&.canvas-panel .canvas-panel-footer button[data-testid*=\"Buttons_Save_\"]": { fontSize: "15px" },
    // The drawer focuses its ✕ on open; the canvas shows no ring there. Hovered, the ✕ goes dark.
    "&.canvas-panel .canvas-panel-header button::after": { display: "none" },
    // Hovered, the ✕ sits on a light grey square and turns theme blue (PO, 28 Oct 2026).
    "&.canvas-panel .canvas-panel-header button:hover, &.canvas-panel .canvas-panel-header button:hover:active": {
      color: palette.themePrimary, backgroundColor: "#f3f2f1",
    },
    "&.canvas-panel .canvas-panel-header button:hover .fui-Button__icon": { color: palette.themePrimary },
    // A larger ✕: 24 px in a 40 px square.
    "&.canvas-panel .canvas-panel-header button.fui-Button": { minWidth: "40px", width: "40px", height: "40px", borderRadius: 0 },
    "&.canvas-panel .canvas-panel-header button.fui-Button svg": { fontSize: "24px", width: "24px", height: "24px" },
    "&.canvas-panel .canvas-panel-header button.fui-Button .fui-Button__icon": {
      fontSize: "24px", width: "24px", height: "24px",
    },
    "&.canvas-panel .canvas-panel-header button:focus-visible, &.canvas-panel .canvas-panel-header button[data-fui-focus-visible]": {
      outlineStyle: "none", boxShadow: "none",
    },
    "&.canvas-panel .canvas-panel-header button[data-fui-focus-visible]::after": { display: "none" },
    "&.canvas-panel .canvas-panel-header button": { color: "rgba(255, 255, 255, 0.6)", outlineStyle: "none" },
    "&.canvas-panel .canvas-panel-header button svg": { fontSize: "22px" },
    "&.canvas-panel .canvas-panel-footer": { height: "60px", paddingTop: 0, paddingBottom: 0 },
    "&.canvas-panel .canvas-panel-footer button": {
      fontWeight: tokens.fontWeightRegular, fontSize: "14px", minWidth: "90px", height: "30px",
    },
    "&.canvas-panel .canvas-panel-footer button:disabled": { color: "#605e5c", backgroundColor: "transparent" },
    "&.canvas-panel .canvas-panel-footer button:disabled .fui-Button__icon": { color: palette.black },
  },
  aqClear: {
    color: palette.themePrimary, backgroundColor: palette.white,
    borderTopColor: palette.themePrimary, borderRightColor: palette.themePrimary,
    borderBottomColor: palette.themePrimary, borderLeftColor: palette.themePrimary,
    "& .fui-Button__icon": { color: palette.themePrimary },
    ":hover": { color: palette.themePrimary, backgroundColor: palette.themeLighter },
  },
  permitPanelSkin: {
    "&.canvas-panel .canvas-panel-header": { height: "48px" },
    "&.canvas-panel .canvas-panel-header h2": { fontSize: "16px", fontWeight: tokens.fontWeightBold },
    "&.canvas-panel .canvas-panel-header button": { color: "rgba(255, 255, 255, 0.6)", outlineStyle: "none" },
    "&.canvas-panel .canvas-panel-header button svg": { fontSize: "22px" },
    "&.canvas-panel .canvas-panel-footer": { height: "60px", paddingTop: 0, paddingBottom: 0 },
    "&.canvas-panel .canvas-panel-footer button": {
      fontWeight: tokens.fontWeightRegular, fontSize: "14px", width: "90px", minWidth: "90px", height: "30px",
    },
    "&.canvas-panel .canvas-panel-footer button:disabled": { color: "#605e5c", backgroundColor: "transparent" },
    "&.canvas-panel .canvas-panel-footer button:disabled .fui-Button__icon": { display: "none" },
  },
  /**
   * The canvas drop-down list (screenshot, 28 Oct 2026): flat grey, 1 px dark frame, no shadow,
   * 30 px one-line rows that widen the list past the box rather than wrap, no check gutter, and
   * the chosen row (or the hovered one) in themePrimary with white text.
   */
  choiceListbox: {
    width: "max-content !important", minWidth: "340px", maxWidth: "calc(100vw - 32px)",
    maxHeight: "602px !important", paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0, rowGap: 0,
    backgroundColor: "#f5f5f5", boxShadow: "none", borderRadius: 0,
    borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
    borderTopStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid", borderLeftStyle: "solid",
    borderTopColor: "#605e5c", borderRightColor: "#605e5c", borderBottomColor: "#605e5c", borderLeftColor: "#605e5c",
    "& .fui-Option": {
      boxSizing: "border-box", height: "30px", minHeight: "30px", flexShrink: 0, columnGap: 0,
      paddingTop: 0, paddingBottom: 0, paddingLeft: "12px", paddingRight: "12px",
      fontSize: "14px", lineHeight: "20px", whiteSpace: "nowrap", color: palette.black, borderRadius: 0,
    },
    "& .fui-Option__checkIcon": { display: "none" },
    "& .fui-Option::after": { display: "none" },
    "& .fui-Option[aria-selected=\"true\"], & .fui-Option:hover, & .fui-Option[data-activedescendant-focusvisible]": {
      backgroundColor: palette.themePrimary, color: palette.white,
    },
    "&:hover .fui-Option[aria-selected=\"true\"]:not(:hover)": { backgroundColor: "transparent", color: palette.black },
  },
});

/** A labelled option-set / lookup dropdown; `aria-label` and `data-testid` are the canvas name. */
function ChoiceField({ label, testId, value, options, disabled, onChange }: {
  label: string; testId: string; value: number | string | null;
  options: readonly { value: number | string; label: string }[];
  disabled: boolean; onChange: (value: string | null) => void;
}) {
  // The shared modern dropdown (sweep 20 Oct 2026); the canvas AccessibleLabel is the control name.
  const s = useStyles();
  const selected = options.find((o) => o.value === value);
  return (
    <SharedChoiceField
      listboxClassName={s.choiceListbox}
      label={label}
      ariaLabel={testId}
      testId={testId}
      disabled={disabled}
      value={selected ? String(selected.value) : null}
      options={options.map((o) => ({ value: String(o.value), label: o.label }))}
      onSelect={onChange}
    />
  );
}

/** The drawer's percentage box as the canvas shows it; see `securedPercent` for the arithmetic. */
function canvasAquisitionPercent(secured: string, required: string): number | string {
  const isBlank = (v: string) => v.trim() === "";
  const notNumber = (v: string) => !isBlank(v) && Number.isNaN(Number(v.replace(",", ".")));
  if (notNumber(secured) || notNumber(required)) return "";
  if (isBlank(secured) || isBlank(required)) return 0;
  return securedPercent(secured, required);
}

export default function PlanningScreen() {
  const s = useStyles();
  const { projectId } = useSession();
  const [params, setParams] = useSearchParams();
  const tab = parseTab(params.get("tab"));

  const projectQ = usePlanningProject(projectId);
  const project = projectQ.data;
  const planningQ = useProjectPlanning(project);
  const planning = planningQ.data;
  const permitsQ = usePermits(projectId, planning?.id);
  const typesQ = useAquisitionTypes();
  const aquisitionQ = useAquisitionStatuses(project, typesQ.data, !typesQ.isLoading && !typesQ.error);
  const countryId = project?.countryId ?? null;
  const legalQ = useCustomChoiceValues(CUSTOM_CHOICE_FIELD.legalPlanningBasis, countryId, Boolean(project));
  const procedureQ = useCustomChoiceValues(CUSTOM_CHOICE_FIELD.permitProcedure, countryId, Boolean(project));
  const writes = usePlanningWrites(projectId);

  const baseline = useMemo(() => toPlanningForm(planning), [planning]);
  const [edited, setEdited] = useState<PlanningForm | null>(null);
  const form = edited ?? baseline;

  const [selectedPermitId, setSelectedPermitId] = useState<string | null>(null);
  const [permitPanel, setPermitPanel] = useState<{ permitId: string | null; draft: PermitDraft } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [aquisition, setAquisition] = useState<{ row: AquisitionStatusRow; lla: LlaType; draft: AquisitionDraft } | null>(null);

  const loading = projectQ.isLoading || planningQ.isLoading;
  const busy = writes.progress !== null;
  const gating = { project, canEdit: PLANNING_CAN_EDIT };
  const editable = canEditPlanning(gating) && !busy;
  const validity = validatePlanning(form);
  const legalOptions = customChoiceOptions(legalQ.data, countryId).map((o) => ({ value: o.id, label: o.label }));
  const procedureOptions = customChoiceOptions(procedureQ.data, countryId).map((o) => ({ value: o.id, label: o.label }));
  const selectedPermit = permitsQ.data.find((p) => p.id === selectedPermitId) ?? null;
  const permitGates = permitCommandState(gating, selectedPermit);
  const saveEnabled = canSave({ project, canEdit: PLANNING_CAN_EDIT, form, baseline, busy });
  const cancelEnabled = !busy && canReset(form, baseline);
  const lock = loading ? [] : pageLock(project);

  const permitCommands: Command[] = [
    { key: "newPermit", label: PERMIT_COMMAND_LABELS.newPermit, icon: "Add", enabled: !busy && permitGates.canNew },
    { key: "editPermit", label: PERMIT_COMMAND_LABELS.edit, icon: "Edit", enabled: !busy && permitGates.canEdit },
    { key: "deletePermit", label: PERMIT_COMMAND_LABELS.delete, icon: "Delete", enabled: !busy && permitGates.canDelete },
  ];
  const onPermitCommand = (key: string) => {
    writes.clear();
    if (key === "newPermit") { setSelectedPermitId(null); setPermitPanel({ permitId: null, draft: emptyPermitDraft() }); }
    if (key === "editPermit" && selectedPermit) setPermitPanel({ permitId: selectedPermit.id, draft: permitDraftFrom(selectedPermit) });
    if (key === "deletePermit" && selectedPermit) setConfirmDelete(true);
  };
  /** `closeKey` / Cancel / the end of Save: close the panel and clear `locSelectedPermit`. */
  const closePermitPanel = () => { setPermitPanel(null); setSelectedPermitId(null); };

  // The success bar clears itself almost at once, after half a second (PO, 28 Oct 2026).
  const { success: writeSuccess, clear: clearWrites } = writes;
  useEffect(() => {
    if (!writeSuccess) return;
    const t = window.setTimeout(clearWrites, 500);
    return () => window.clearTimeout(t);
  }, [writeSuccess, clearWrites]);

  const onSave = async () => {
    writes.clear();
    const ids = await writes.run(savePlanningJob(form, project, planning));
    if (ids !== null) setEdited(null);
  };
  const onReset = () => { writes.clear(); setEdited(resetPlanningForm(form, baseline)); setSelectedPermitId(null); };

  const onSavePermit = async () => {
    if (!permitPanel) return;
    const job = savePermitJob(permitPanel.draft, permitPanel.permitId, planning);
    await writes.run(job);
    closePermitPanel();
  };
  const onDeletePermit = async () => {
    if (!selectedPermit) return;
    const job = deletePermitJob(selectedPermit.id);
    setConfirmDelete(false);
    await writes.run(job);
    setSelectedPermitId(null);
  };

  const onSaveAquisition = async () => {
    if (!aquisition) return;
    const job = saveAquisitionJob(aquisition.draft, aquisition.row, project);
    setAquisition(null);
    await writes.run(job);
  };
  const onClearAquisition = async () => {
    if (!aquisition) return;
    const job = clearAquisitionJob(aquisition.row);
    setAquisition(null);
    await writes.run(job);
  };

  if (projectQ.error || planningQ.error || permitsQ.error || typesQ.error || aquisitionQ.error) {
    return (
      <div className={s.page} data-testid="Project Planning Screen">
        <EmptyState title={PLANNING_SCREEN_TEXT.loadFailedTitle} description={PLANNING_SCREEN_TEXT.loadFailedDescription} />
      </div>
    );
  }

  const set = (patch: Partial<PlanningForm>) => setEdited({ ...form, ...patch });

  const aquisitionTable = (lla: LlaType) => {
    const testBase = lla === "personam" ? "UnderLaw" : "InRem";
    const rows = aquisitionRowsFor(aquisitionQ.data, lla);
    return (
      <div className={s.section} data-testid={`con_${C}_AquisitionStatus_${testBase}`}>
        <div className={s.gridWrap}>
          <Table size="small" className={s.aqTable} aria-label={LLA_TYPE_LABEL[lla]}>
            <TableHeader>
              <TableRow className={s.aqHeader}>
                {/* The canvas header block: the section name over "Types", the captions on its first line. */}
                <TableHeaderCell className={s.colName}>
                  <span className={s.aqTitleStack}>
                    <span className={s.aqTitle}>{LLA_TYPE_LABEL[lla]}</span>
                    <span>{AQUISITION_GRID_COLUMNS.types}</span>
                  </span>
                </TableHeaderCell>
                <TableHeaderCell className={s.colCount}>{AQUISITION_GRID_COLUMNS.secured}</TableHeaderCell>
                <TableHeaderCell className={s.colCount}>{AQUISITION_GRID_COLUMNS.required}</TableHeaderCell>
                <TableHeaderCell className={s.colPercent}>{AQUISITION_GRID_COLUMNS.percentage}</TableHeaderCell>
                <TableHeaderCell className={s.colAction}>{AQUISITION_GRID_COLUMNS.action}</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className={s.aqRow}>
                  <TableCell className={s.colName} title={r.typeName ?? ""}>{r.typeName ?? ""}</TableCell>
                  <TableCell className={s.colCount}>{countCell(r.secured)}</TableCell>
                  <TableCell className={s.colCount}>{countCell(r.required)}</TableCell>
                  <TableCell className={s.colPercent}>{percentCell(r)}</TableCell>
                  <TableCell className={s.colAction}>
                    <Button
                      appearance="subtle"
                      icon={<EditRegular />}
                      className={s.aqEdit}
                      disabled={busy}
                      onClick={() => { writes.clear(); setAquisition({ row: r, lla, draft: aquisitionDraftFrom(r) }); }}
                      aria-label={`pcf_but_${C}_AquisitionStatus_${testBase}_Edit`}
                      data-testid={`pcf_but_${C}_AquisitionStatus_${testBase}_Edit`}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  };

  const aqValidity = aquisition ? validateAquisition(aquisition.draft) : null;
  // As the canvas shows it (PO, 28 Oct 2026): a blank Secured or Required reads 0, text that is not
  // a number leaves the box blank (no "N/A"); only `Required = 0` is "N/A".
  const aqPercent = aquisition ? canvasAquisitionPercent(aquisition.draft.secured, aquisition.draft.required) : "";
  const setPermitDraft = (patch: Partial<PermitDraft>) =>
    permitPanel && setPermitPanel({ ...permitPanel, draft: { ...permitPanel.draft, ...patch } });

  return (
    <div className={s.page} data-testid="Project Planning Screen">
      {loading ? <LoadingOverlay mode="blocking" label={NOTIFY.loading} /> : null}
      <WriteFeedback progress={writes.progress} error={writes.error} success={null} testIdPrefix="planning" />
      {/* The canvas `Notify`: a bar across the top of the app above the project name, gone in half a second. */}
      {writes.success && !writes.error ? (
        <MessageBar intent="success" className={s.flash} data-testid="planning-write-success">
          <MessageBarBody>{writes.success}</MessageBarBody>
        </MessageBar>
      ) : null}

      {lock.length > 0 ? (
        <div className={s.lock} data-testid={PAGE_LOCK_TESTID}>
          <LockClosedRegular aria-hidden fontSize={24} data-testid={PAGE_LOCK_ICON_TESTID} />
          <div className={s.lockText}>
            <Text data-testid={PAGE_LOCK_TITLE_TESTID}>{PAGE_LOCK_TITLE}</Text>
            {lock.map((e) => <Text key={e.reason} data-testid={e.testId}>{e.label}</Text>)}
          </div>
        </div>
      ) : null}

      <div className={s.tabs}>
        <TabList
          selectedValue={tab}
          disabled={!canSwitchTabs(gating)}
          onTabSelect={(_, d) => setParams((p) => { p.set("tab", String(d.value)); return p; })}
          aria-label="tab_ProjectPlanning_DisplayProjectBodyRightContent"
          data-testid="tab_ProjectPlanning_DisplayProjectBodyRightContent"
        >
          {PLANNING_TABS.map((t) => <Tab key={t.key} value={t.key} aria-label={t.label}
            data-testid={`tab_${C}-${t.key}`}>{t.label}</Tab>)}
        </TabList>
      </div>

      <div className={s.body}>
        {tab === "general" ? (
          <div className={s.wrapRow}>
            {/* `con_…_CooperationForm` */}
            <div className={mergeClasses(s.form, s.formPadBottom)}>
              <div className={s.field}>
                <ChoiceField
                  label={GENERAL_TAB_LABELS.cooperation} testId="drp_ProjectPlanning_DisplayProjectBodyRightContent_Cooperation"
                  value={form.cooperation} options={YES_NO_UNKNOWN} disabled={!editable}
                  onChange={(v) => setEdited(applyCooperationChange(form, v === null ? null : Number(v)))}
                />
              </div>
              {showCooperationPartner(form.cooperation) ? (
                <div className={mergeClasses(s.field, s.fieldTall)}>
                  <TextAreaField
                    label={FIELD_LABELS.cooperationPartner} value={form.cooperationPartner} rows={2}
                    maxLength={MAX_LENGTH.cooperationPartner} disabled={!editable}
                    onChange={(v) => set({ cooperationPartner: v })}
                    ariaLabel="txt_ProjectPlanning_DisplayProjectBodyRightContent_CooperationPartner" testId="txt_ProjectPlanning_DisplayProjectBodyRightContent_CooperationPartner"
                  />
                </div>
              ) : null}
              {/* As the canvas shows it: Details only for Unknown (see the parity rule). */}
              {showCooperationDetailsCanvasParity(form.cooperation) ? (
                <div className={mergeClasses(s.field, s.fieldTaller)}>
                  <TextAreaField
                    label={FIELD_LABELS.cooperationDetails} value={form.cooperationDetails} rows={5}
                    maxLength={MAX_LENGTH.cooperationDetails}
                    disabled={!editable || !cooperationDetailsEditable(form.cooperation)}
                    onChange={(v) => set({ cooperationDetails: v })}
                    ariaLabel="txt_ProjectPlanning_DisplayProjectBodyRightContent_CooperationDetails" testId="txt_ProjectPlanning_DisplayProjectBodyRightContent_CooperationDetails"
                  />
                </div>
              ) : null}
            </div>

            {/* `con_…_PlanningBasisForm` */}
            <div className={s.form}>
              <div className={s.field}>
                <ChoiceField
                  label={GENERAL_TAB_LABELS.legalPlanningBasis} testId="drp_ProjectPlanning_DisplayProjectBodyRightContent_LegalPlanningBasis"
                  value={form.legalPlanningId} options={legalOptions}
                  disabled={busy || !canEditLegalPlanningBasis(gating, legalOptions.length)}
                  onChange={(v) => set({ legalPlanningId: v })}
                />
              </div>
              <div className={s.field}>
                <ChoiceField
                  label={GENERAL_TAB_LABELS.planningBasisCategory} testId="drp_ProjectPlanning_DisplayProjectBodyRightContent_PlanningBasisCategory"
                  value={form.planningBasisCategory} options={PLANNING_BASIS_CATEGORIES} disabled={!editable}
                  onChange={(v) => set({ planningBasisCategory: v === null ? null : Number(v) })}
                />
              </div>
              <div className={s.field}>
                <ChoiceField
                  label={GENERAL_TAB_LABELS.permitProcedure} testId="drp_ProjectPlanning_DisplayProjectBodyRightContent_PermitProcedure"
                  value={form.permitProcedureId} options={procedureOptions} disabled={!editable}
                  onChange={(v) => set({ permitProcedureId: v })}
                />
              </div>
              <div className={mergeClasses(s.field, s.fieldTall)}>
                <TextAreaField
                  label={GENERAL_TAB_LABELS.planningBasisDetails} value={form.planningBasisDetails} rows={2}
                  maxLength={MAX_LENGTH.planningBasisDetails} disabled={!editable}
                  onChange={(v) => set({ planningBasisDetails: v })}
                  ariaLabel="txt_ProjectPlanning_DisplayProjectBodyRightContent_PlanningBasisDetails" testId="txt_ProjectPlanning_DisplayProjectBodyRightContent_PlanningBasisDetails"
                />
              </div>
            </div>

            {/* `con_…_HeightLimitation`: the toggle row, then the field */}
            <div className={s.heightRow}>
              <div className={s.toggle}>
                <Switch
                  label={GENERAL_TAB_LABELS.heightLimitationWtg}
                  labelPosition="before"
                  checked={form.isHeightLimitation}
                  disabled={!editable}
                  onChange={(_, d) => setEdited(applyHeightToggle(form, d.checked, baseline))}
                  aria-label="tgl_HeightLimitation_ProjectPlanning"
                  data-testid="tgl_HeightLimitation_ProjectPlanning"
                />
              </div>
              {showHeightLimit(form.isHeightLimitation) ? (
                <div className={mergeClasses(s.field, s.heightField)}>
                  <TextField
                    label={FIELD_LABELS.heightLimitation} required value={form.heightLimitation}
                    error={validity.heightLimitation.message} disabled={!editable}
                    onChange={(v) => set({ heightLimitation: v })}
                    ariaLabel="txt_HeightLimit_ProjectPlanning" testId="txt_HeightLimit_ProjectPlanning"
                  />
                </div>
              ) : null}
            </div>

            <div className={s.permits} data-testid="con_ProjectPlanning_DisplayProjectBodyRightContent_Permits">
              <div className={s.permitsBar}>
                <CommandBar commands={permitCommands} onCommand={onPermitCommand} ariaLabel="pcf_ProjectPlanning_DisplayProjectBodyRightContent_PermitsCommandBar" />
              </div>
              <div className={s.gridWrap}>
                <Table size="small" className={s.permitTable} aria-label={PERMIT_GRID_COLUMNS.permit} data-testid="gal_ProjectPlanning_DisplayProjectBodyRightContent_Permits">
                  <TableHeader>
                    <TableRow className={s.permitHeader}>
                      <TableHeaderCell className={s.colSelect} />
                      <TableHeaderCell className={s.colPermit}>{PERMIT_GRID_COLUMNS.permit}</TableHeaderCell>
                      <TableHeaderCell className={s.colDate}>{PERMIT_GRID_COLUMNS.submitted}</TableHeaderCell>
                      <TableHeaderCell className={s.colDateLast}>{PERMIT_GRID_COLUMNS.approved}</TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {permitsQ.data.map((p) => {
                      const checked = p.id === selectedPermitId;
                      const toggle = () => setSelectedPermitId((cur) => togglePermitSelection(cur, p.id));
                      return (
                        <TableRow key={p.id} className={mergeClasses(s.permitRow, checked ? s.rowSelected : s.row)} aria-selected={checked} onClick={toggle}>
                          <TableCell className={s.selectCell}>
                            <Button
                              appearance="transparent"
                              role="radio"
                              aria-checked={checked}
                              aria-label="img_ProjectPlanning_DisplayProjectBodyRightContent_PermitsRowSelectionDot"
                              data-testid={`img_${C}_PermitsRowSelectionDot-${p.id}`}
                              className={s.radio}
                              icon={checked ? <RecordRegular /> : <CircleRegular />}
                              onClick={(e) => { e.stopPropagation(); toggle(); }}
                            />
                          </TableCell>
                          <TableCell>{p.name ?? ""}</TableCell>
                          <TableCell className={permitDateIsActual(p.submissionDateType) ? s.actualDate : undefined}>{permitDateCell(p.submissionDate)}</TableCell>
                          <TableCell className={permitDateIsActual(p.approvalDateType) ? s.actualDate : undefined}>{permitDateCell(p.approvalDate)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        ) : null}

        {tab === "repowering" ? (
          <div className={s.wrapRow}>
            {/* `con_…_RepoweringForm` */}
            <div className={s.form}>
              <div className={s.field}>
                <ChoiceField
                  label={REPOWERING_TAB_LABELS.repowering} testId="drp_ProjectPlanning_DisplayProjectBodyRightContent_Repowering"
                  value={form.repowering} options={YES_NO_UNKNOWN} disabled={!editable}
                  onChange={(v) => setEdited(applyRepoweringChange(form, v === null ? null : Number(v), baseline))}
                />
              </div>
              {showSecuredAccess(form.repowering) ? (
                <div className={s.field}>
                  <TextField
                    label={FIELD_LABELS.securedAccess} value={form.securedAccess}
                    maxLength={MAX_LENGTH.securedAccess} counter={false} disabled={!editable}
                    onChange={(v) => set({ securedAccess: v })}
                    ariaLabel="txt_ProjectPlanning_DisplayProjectBodyRightContent_SecuredAccess" testId="txt_ProjectPlanning_DisplayProjectBodyRightContent_SecuredAccess"
                  />
                </div>
              ) : null}
              {showRepoweringDetails(form.repowering) ? (
                <div className={mergeClasses(s.field, s.fieldTaller)}>
                  <TextAreaField
                    label={FIELD_LABELS.repoweringDetails} value={form.repoweringDetails} rows={5}
                    maxLength={MAX_LENGTH.repoweringDetails} disabled={!editable}
                    onChange={(v) => set({ repoweringDetails: v })}
                    ariaLabel="txt_ProjectPlanning_DisplayProjectBodyRightContent_RepoweringDetails" testId="txt_ProjectPlanning_DisplayProjectBodyRightContent_RepoweringDetails"
                  />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {tab === "aquisition" ? (
          <div className={s.aquisition}>
            {aquisitionTable("personam")}
            {aquisitionTable("rem")}
          </div>
        ) : null}
      </div>

      <div className={s.buttons}>
        <Tooltip content={SCREEN_MSG.saveTooltip} relationship="description" withArrow>
          <Button
            appearance={saveEnabled ? "primary" : "subtle"}
            icon={<CheckmarkRegular />}
            disabled={!saveEnabled}
            onClick={() => void onSave()}
            aria-label="pcf_ProjectPlanning_DisplayProjectBodyRightContent_ButtonsSave"
            data-testid="pcf_ProjectPlanning_DisplayProjectBodyRightContent_ButtonsSave"
          >
            {SCREEN_MSG.save}
          </Button>
        </Tooltip>
        <Tooltip content={SCREEN_MSG.cancelTooltip} relationship="description" withArrow>
          <Button
            appearance={cancelEnabled ? "outline" : "subtle"}
            className={cancelEnabled ? s.cancelEnabled : undefined}
            icon={<DismissRegular />}
            disabled={!cancelEnabled}
            onClick={onReset}
            aria-label="pcf_ProjectPlanning_DisplayProjectBodyRightContent_ButtonsReset"
            data-testid="pcf_ProjectPlanning_DisplayProjectBodyRightContent_ButtonsReset"
          >
            {SCREEN_MSG.cancel}
          </Button>
        </Tooltip>
      </div>

      <FormPanel
        open={permitPanel !== null}
        title={permitPanelTitle(permitPanel?.permitId === null)}
        width="narrow"
        panelClassName={s.permitPanelSkin}
        closeTooltip="Cancel"
        onDismiss={closePermitPanel}
        closeTestId="pcf_com_ProjectPlanning_RightPanel_NewEditPermitBodyHeader_CommandBar"
        closeLabel="pcf_com_ProjectPlanning_RightPanel_NewEditPermitBodyHeader_CommandBar"
        footer={
          <PanelButtons
            onSave={() => void onSavePermit()}
            onCancel={closePermitPanel}
            saveTestId="pcf_ProjectPlanning_RightPanel_NewEditPermitBodyButtons_Save"
            cancelTestId="pcf_ProjectPlanning_RightPanel_NewEditPermitBodyButtons_Cancel"
            saveLabel="pcf_ProjectPlanning_RightPanel_NewEditPermitBodyButtons_Save"
            cancelLabel="pcf_ProjectPlanning_RightPanel_NewEditPermitBodyButtons_Cancel"
            saveTooltip={PERMIT_DIALOG.saveTooltip}
            disabled={busy || !permitPanel || !canSavePermit(permitPanel.draft)}
            subtleWhenDisabled
          />
        }
      >
        {permitPanel ? (
          <div className={mergeClasses(s.panelBody, s.permitBody)}>
            <CostField
              label={PERMIT_PANEL_LABELS.name} required value={permitPanel.draft.name} disabled={busy}
              name="txt_ProjectPlanning_RightPanel_NewEditPermitBodyContent_Name"
              onChange={(v) => setPermitDraft({ name: v })}
            />
            {/* Canvas order: the caption, the Plan / Actual radios (horizontal), then the date (PO, 20 Oct 2026). */}
            <Choices
              label={PERMIT_PANEL_LABELS.submissionDate} required horizontal disabled={busy}
              name="rad_ProjectPlanning_RightPanel_NewEditPermitBodyContent_SubmissionDateType"
              value={PERMIT_DATE_TYPES.find((t) => t.value === permitPanel.draft.submissionDateType)?.label ?? ""}
              options={PERMIT_DATE_TYPES.map((t) => t.label)}
              onChange={(v) => setPermitDraft({ submissionDateType: PERMIT_DATE_TYPES.find((t) => t.label === v)?.value ?? null })}
            />
            <TaggedDateField
              label="" required disabled={busy}
              name="dte_ProjectPlanning_RightPanel_NewEditPermitBodyContent_SubmissionDate"
              value={permitDateValue(permitPanel.draft.submissionDate)}
              formatDate={permitInputDate}
              // No Plan / Actual tag: the canvas shows the choice in the radios only (28 Oct 2026).
              tag=""
              tagTestId="planning-permit-submission-date-tag"
              onChange={(d) => setPermitDraft({ submissionDate: d ? dateOnly(d) : null })}
            />
            <Choices
              label={PERMIT_PANEL_LABELS.approvalDate} required horizontal disabled={busy}
              name="rad_ProjectPlanning_RightPanel_NewEditPermitBodyContent_ApprovalDateType"
              value={PERMIT_DATE_TYPES.find((t) => t.value === permitPanel.draft.approvalDateType)?.label ?? ""}
              options={PERMIT_DATE_TYPES.map((t) => t.label)}
              onChange={(v) => setPermitDraft({ approvalDateType: PERMIT_DATE_TYPES.find((t) => t.label === v)?.value ?? null })}
            />
            <TaggedDateField
              label="" required disabled={busy}
              name="dte_ProjectPlanning_RightPanel_NewEditPermitBodyContent_ApprovalDate"
              value={permitDateValue(permitPanel.draft.approvalDate)}
              formatDate={permitInputDate}
              tag=""
              tagTestId="planning-permit-approval-date-tag"
              onChange={(d) => setPermitDraft({ approvalDate: d ? dateOnly(d) : null })}
            />
          </div>
        ) : null}
      </FormPanel>

      <FormPanel
        open={aquisition !== null}
        title={aquisitionPanelTitle(aquisition ? LLA_TYPE_LABEL[aquisition.lla] : "")}
        width="narrow"
        panelClassName={s.aqPanelSkin}
        closeTooltip="Home"
        onDismiss={() => setAquisition(null)}
        closeTestId="pcf_ProjectPlanning_RightPanel_AquisitionStatus_FormHeader_CommandBar"
        closeLabel="pcf_ProjectPlanning_RightPanel_AquisitionStatus_FormHeader_CommandBar"
        footer={
          <>
            <Tooltip content={AQUISITION_PANEL.clearAndSaveTooltip} relationship="description" withArrow>
              <Button disabled={busy} onClick={() => void onClearAquisition()}
                appearance="outline" icon={<DeleteRegular />} className={s.aqClear}
                aria-label="pcf_btn_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Buttons_Cancel_1"
                data-testid="pcf_btn_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Buttons_Cancel_1">
                {AQUISITION_PANEL.clearAndSave}
              </Button>
            </Tooltip>
            {aquisition?.lla === "rem" ? (
              <Button
                appearance={busy || !canSaveAquisition(aquisition.draft) ? "subtle" : "primary"}
                icon={<CheckmarkRegular />}
                disabled={busy || !canSaveAquisition(aquisition.draft)}
                onClick={() => void onSaveAquisition()}
                aria-label="pcf_btn_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Buttons_Save_InRem"
                data-testid="pcf_btn_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Buttons_Save_InRem"
              >
                {AQUISITION_PANEL.save}
              </Button>
            ) : (
              <Button
                appearance={busy || !aquisition || !canSaveAquisition(aquisition.draft) ? "subtle" : "primary"}
                icon={<CheckmarkRegular />}
                disabled={busy || !aquisition || !canSaveAquisition(aquisition.draft)}
                onClick={() => void onSaveAquisition()}
                aria-label="pcf_btn_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Buttons_Save_UnderLaw"
                data-testid="pcf_btn_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Buttons_Save_UnderLaw"
              >
                {AQUISITION_PANEL.save}
              </Button>
            )}
            <Button onClick={() => setAquisition(null)}
              appearance="outline" icon={<DismissRegular />} className={s.cancelEnabled}
              aria-label="pcf_btn_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Buttons_Cancel"
              data-testid="pcf_btn_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Buttons_Cancel">
              {AQUISITION_PANEL.cancel}
            </Button>
          </>
        }
      >
        {aquisition ? (
          <div className={mergeClasses(s.panelBody, s.aqBody)}>
            <ReadOnlyField
              label={AQUISITION_PANEL.llaType} value={aquisition.row.typeName ?? ""}
              ariaLabel="drp_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Body_AquisitionStatusType"
              testId="drp_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Body_AquisitionStatusType"
            />
            <CostField
              label={AQUISITION_PANEL.secured} value={aquisition.draft.secured} disabled={busy}
              maxLength={AQUISITION_MAX_LENGTH}
              name="txt_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Body_Secured"
              error={aqValidity?.secured.message}
              onChange={(v) => setAquisition({ ...aquisition, draft: { ...aquisition.draft, secured: v } })}
            />
            <CostField
              label={AQUISITION_PANEL.required} value={aquisition.draft.required} disabled={busy}
              maxLength={AQUISITION_MAX_LENGTH}
              name="txt_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Body_Requered"
              error={aqValidity?.required.message}
              onChange={(v) => setAquisition({ ...aquisition, draft: { ...aquisition.draft, required: v } })}
            />
            <ReadOnlyField
              label={AQUISITION_PANEL.percentage} value={String(aqPercent)}
              ariaLabel="txt_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Body_Percentage"
              testId="txt_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Body_Percentage"
            />
          </div>
        ) : null}
      </FormPanel>

      <ConfirmDialog
        open={confirmDelete}
        title={PERMIT_DIALOG.deleteTitle}
        description={deletePermitDescription(selectedPermit?.name ?? null)}
        confirmText={PERMIT_DIALOG.deleteConfirm}
        cancelText={PERMIT_DIALOG.cancel}
        // As the canvas pop-up (screenshot, 28 Oct 2026): a blue 120 px Delete with a check mark,
        // a flat card on the dark scrim, no footer rule.
        confirmIcon="checkmark"
        canvasFooter
        footerDivider={false}
        darkScrim
        confirmWidth={120}
        compact
        onConfirm={() => void onDeletePermit()}
        onCancel={() => setConfirmDelete(false)}
      />
      {/* `cmp_PopUp_Leave_…_Confirmation` — the shared leave guard (D35, PO X1). */}
      <UnsavedChangesGuard when={shouldConfirmLeave(form, baseline)} dialog={LEAVE_DIALOG} canvasLook />
    </div>
  );
}
