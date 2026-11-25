/**
 * Project General CheckList Screen — composition only (connected 19 Oct 2026, D29).
 *
 * Canvas screen: `Project General CheckList Screen.pa.yaml` (PM app). Every decision lives in
 * `rules.ts`; every read and write in `hooks.ts` / `data/checklist.ts`.
 *
 * Structure, matching the canvas containers:
 *   command bar     `pcf_con_CheckList_DisplayProject_Body_CommandBar_Menu` (Refresh)
 *   page lock       `con_Milestones_Page_LockMessage_3`
 *   cluster stepper `cmp_CheckList_Project_States` — the DISPLAY sequence (`ProjectStates.tsx`)
 *   action buttons  `con_Checklist_DisplayProject_Body_Content_Buttons`: Cancel Approval Request ·
 *                   Reset to … (`…_Return_1`) · next cluster · Info · Abandon · Inactivate/ Place On-hold
 *                   (`ClusterActions` in `ProjectStates.tsx`)
 *   title           `lbl_Checklist_DisplayProject_Body_Content_Title` (its zero-width Refresh button is shown
 *                   at the stepper's top right, in `ProjectStates`)
 *   checklist       the column headers over `gal_Checklist_DisplayProject_Body_General_Content` —
 *                   Wind / PV only; any other technology shows the tip
 *   right panels    `con_CheckList_RightPanel_ChangeCluster_Form` (cluster transition AND checklist
 *                   completion) and `con_CheckList_RightPanel_Comment_Form`
 *   dialogs         the two "Change Cluster State" confirmations and the Information popup
 *   progress        `cmp_PopUp_Checklist_Saving_Dialog` / `cmp_PopUp_GateProcess_Saving_LoadingDialog_1`
 *                   (`WriteFeedback`)
 *
 * Request Approval, Cancel Approval Request and the row's cancel ✕ run the approval flows through
 * `hooks.ts` / `data/flows.ts` (D81, 4 Nov 2026; under D29 they were visible and disabled).
 */
import { Fragment, memo, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import {
  Button, MessageBar, MessageBarBody,
  Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, Tooltip,
  makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import {
  ArrowRightRegular, ArrowSyncRegular, DismissRegular, EditRegular, EyeOffRegular, EyeRegular, LockClosedRegular,
  LightbulbRegular, MailRegular, PeopleRegular,
} from "@fluentui/react-icons";
import {
  ConfirmDialog, DateField, DateInput, EmptyState, FormPanel, LoadingOverlay, PanelButtons, PanelCancelButton,
  TextAreaField, TextField, WriteFeedback, HINTS, useStableCallback,
} from "@/components";
import { DATE_PICKER_FORMAT } from "@/domain/canvasDate";
import { useSession } from "@/app/SessionContext";
import { probeRender } from "@/platform/renderProbe";
import { CHOICE_PROCESS } from "@/data/dataverseNames";
import { checklistPerf } from "@/data/checklistPerfFlags";
import { palette, space } from "@/theme/tokens";
import {
  ARIA, COMMENT_MAX_LENGTH, COMPLETION_DATE_MESSAGE, MSG, PAGE_LOCK_TITLE, READ_GATE_MSG, SCREEN_TEXT, UI,
  approvalDueDateDefault, approvalSettingsHint, approvalSettingsNeeded, approvalSettingsState, buildDisplaySequence, buildOperationalSequence, canCancelApproval, canRequestApproval, canSavePanel,
  checklistIsLoading, checklistLoadErrorMode, checklistPersonaTooltip, checklistTableTitle, checklistTitleTooltip, commentAsteriskVisible,
  commentBlockVisible, commentError, commentPatch, commentReadOnly, completeTaskPatch, completionDatePatch,
  defaultSelectedCluster, earlyClusterEntry, fmtCanvasDate, gateFor, gatePersonaTooltip, gateRelevanceLabel, historyDescriptor,
  holdingColumnToggleLabel, inProgressTogglePatch, nextClusterCaption, nextClusterEnabled, nextClusterIcon,
  nextClusterTooltip, nextState, pageLock, parseNoteHtml, previousState, projectIsTerminal,
  requestApprovalCaption, resetToPreviousCaption, returnConfirmation, rightPanelTitle, rowActionEnabled,
  rowActionKind, approvalIndexes, rowApprovalIn, rowCompleteHighlighted, rowHasNote, showActualTaskState, showApprovalDueDate,
  showCancelApproval, showCancelApprovalIcon, showRequestApproval, showReturnToPrevious, showSave,
  stageTerminalToggle, startClusterNo, stepClockVisible, stepDescriptionLines, stepGateIcon, stepGateVisible,
  stepStateLabel, taskStateLabel, taskTableRows, terminalButtonVisible, terminalStates,
  toYmd, trackingFor, truncateHolding, TASK_TABLE_HEADERS, ymdToLocalIso,
  type ApprovalIndexes, type ApprovalSettingsState,
  type ChecklistRow, type PanelState, type SequenceEntry, type TerminalKind, type TerminalStaging,
} from "./rules";
import { ClusterActions, ProjectStates, type ProjectStateStep, type TerminalAction } from "./ProjectStates";
import {
  useChecklistApprovalSettings, useChecklistOrchestration, useChecklistProject, useChecklistWrites,
  useClusterChecklist, useClusterSequence, useHistory, type ApprovalRequest,
} from "./hooks";

/* ────────────────────────────────────────────────────────────────── styles */

// Layout transcribed from `con_CheckList_DisplayProject_BodyRightContent` and the checklist gallery
// (UI layout pass and PO screenshot parity, 20 Oct 2026). The shell's content area scrolls, so the
// page grows with its content and never clips itself to the viewport. The stepper and the action
// row live in `ProjectStates.tsx`.
/** `ColorFade(Grayscale10, 0.65)` — the row buttons' border. */
const ROW_BUTTON_BORDER = "rgb(204, 204, 204)";
/** The PM app's `palette.Grayscale40` is #FFFFFF (the Cost palette's is #FAFAFA). */
const PM_GRAYSCALE40 = palette.white;
/** `fn_Common.ChecklisAsHTMLTable` — `#dededf` borders, `#eceff1` header fill, 12 / 11 px. */
const NOTE_BORDER = "#dededf";
const NOTE_HEADER_FILL = "#eceff1";
const border = (color: string) => ({
  borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
  borderTopStyle: "solid" as const, borderRightStyle: "solid" as const, borderBottomStyle: "solid" as const, borderLeftStyle: "solid" as const,
  borderTopColor: color, borderRightColor: color, borderBottomColor: color, borderLeftColor: color,
});
const radius = (r: string) => ({ borderTopLeftRadius: r, borderTopRightRadius: r, borderBottomLeftRadius: r, borderBottomRightRadius: r });

const useStyles = makeStyles({
  // The right content: a white vertical autolayout, no padding and no gap.
  /*
   * The page is held to the shell's content column (it used to grow past it, so the shell scrolled the stepper and
   * the buttons away with the rows). Only `scroll` scrolls, as on the canvas (user, 18 Nov 2026).
   */
  page: { display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0, minWidth: 0, backgroundColor: palette.white },
  /** `con_Milestones_Page_LockMessage_3.Fill` RGBA(89, 89, 89, 1), white text — transcribed (Y:907, Y:1063). */
  // Canvas pair (3 Nov 2026): a 20-px lock, the lines 20 px apart with no extra gap.
  lock: {
    display: "flex", alignItems: "center", gap: "8px", backgroundColor: "rgba(89, 89, 89, 1)",
    color: "#ffffff", paddingLeft: "20px", paddingTop: "4px", paddingBottom: "4px",
    "& > svg": { fontSize: "20px", flexShrink: 0 },
  },
  lockList: { display: "flex", flexDirection: "column", lineHeight: "20px" },
  // `con_Checklist_DisplayProject_Body_Content_Title`: 32 high; the label at X = 12, Semibold
  // `gblAppSizes.Font.Large` (12 pt).
  titleRow: { display: "flex", alignItems: "center", gap: space.s, height: "32px", paddingLeft: "15px", marginTop: "-3px", flex: "none" },
  title: { fontSize: "17px", fontWeight: tokens.fontWeightSemibold },
  // `con_Checklist_DisplayProject_Body_Content_Technology_Warning`: 44 high, RGBA(180, 214, 250, 1).
  // 500 wide, the lightbulb at the left and the text on its top line (canvas pair, 3 Nov 2026).
  tip: {
    display: "flex", alignItems: "flex-start", gap: "4px", minHeight: "44px", width: "500px", maxWidth: "calc(100% - 20px)",
    boxSizing: "border-box", marginLeft: "10px", paddingLeft: "5px", paddingTop: "4px", paddingRight: space.m,
    backgroundColor: "#B4D6FA",
    "& > svg": { fontSize: "30px", flexShrink: 0, marginTop: "2px" },
    "& > .fui-Text": { paddingTop: "4px", fontSize: "13px" },
  },
  // `con_Checklist_DisplayProject_Body_Content`: vertical, padding 10 left/right, scrolls both ways.
  /*
   * `con_Checklist_DisplayProject_Body_Content` (Y:2677-2701): the column header and the rows in one box that scrolls both
   * ways (`LayoutOverflowX/Y: Scroll`), `Height: Min(its content, what is left under the stepper, the buttons and the
   * title)`. The stepper, the buttons and the title stay put (`con_…_Content_Title` is outside the box, Y:2273).
   * `flex: 0 1 auto` is that `Min`: the content's own height, shrinking to the space left.
   */
  scroll: {
    flex: "0 1 auto", minHeight: 0, overflowX: "auto", overflowY: "auto",
    paddingLeft: "10px", paddingRight: "10px", paddingBottom: "10px",
  },
  // Columns sized to their content (PO, 20 Oct 2026: "the width between header columns is more
  // than required"): Gate Relevance 120 · Holding ~390 · Country ~540 · Completion Date 230 ·
  // Status 240 = 1520 at most. Holding is a share of the table and Country takes the rest, so both
  // give way together on a narrower window; below 1060 the table scrolls inside its own box. (1060,
  // not 1100: on a 1366-px screen at 100 % zoom the box is 1097 wide, and 1100 left a 3-px scroll —
  // zoom sweep, 21 Oct 2026.)
  // `max-width` is undefined for a table (27 Oct 2026: it was ignored, the table filled the window and every column after
  // Holding Description sat 44 - 88 px right of the canvas), so the cap is in the width itself.
  // Canvas pair of 3 Nov 2026: the columns ~11 % narrower than the 1520 cap — Holding 340, Country
  // 485, Completion Date 200, Status 215 (1360 in all).
  table: { width: "min(100%, 1385px)", minWidth: "1060px", tableLayout: "fixed" },
  // With the Country column hidden (70) the widths are fixed: 120 + 390 + 70 + 230 + 240.
  tableHoldingHidden: { width: "1050px", minWidth: "1050px", maxWidth: "1050px" },
  // `con_…_OverviewHeader`: Fill Grayscale40 (#FFFFFF in the PM palette — no visible fill), 32 high;
  // captions Semibold `gblAppSizes.Font.Small` (10 pt).
  headerRow: {
    // No rule under the captions on the canvas (pair of 3 Nov 2026); each row draws its own.
    backgroundColor: PM_GRAYSCALE40, height: "32px", borderBottomWidth: 0,
    ":hover": { backgroundColor: PM_GRAYSCALE40 },
    "& th": { fontSize: "14px", fontWeight: tokens.fontWeightSemibold, height: "32px", paddingTop: 0, paddingBottom: 0 },
  },
  // Each row 36.5 (`gal_….Height: =Self.AllItemsCount*36.5`, 37 here): the 26-high toggle buttons, a 1 px Grayscale30 rule (`rec_…_Separator`), labels
  // `gblAppSizes.Font.ExtraSmall` (9 pt); two lines fit.
  bodyRow: {
    // Canvas pairs (3 Nov 2026): rows ~35 high, 9.5-pt text on tight 13.5-px lines.
    height: "35px",
    borderBottomWidth: "1px", borderBottomStyle: "solid", borderBottomColor: palette.Grayscale30,
    "& td": { fontSize: "12.67px", paddingTop: "2px", paddingBottom: "2px", verticalAlign: "middle" },
    // The Country text sits 10 px further in than its cell (canvas pair, 3 Nov 2026), and stops
    // ~62 px before Completion Date as on the canvas (label 450 inside a 482 column, padding 5).
    "& td:nth-child(3)": { paddingLeft: "18px", paddingRight: "48px" },
    // No hover / pressed highlight on a record (PO, 3 Nov 2026) — the canvas gallery has none.
    ":hover, :hover:active, :active, :focus-within": { backgroundColor: "transparent", boxShadow: "none" },
  },
  // The first row starts 10 px under the captions, as on the canvas.
  firstRow: { "& td": { paddingTop: "15px" } },
  clip: {
    display: "-webkit-box", WebkitLineClamp: "2", WebkitBoxOrient: "vertical", overflowX: "hidden", overflowY: "hidden",
    lineHeight: "13.5px", wordBreak: "break-word",
  },
  colGate: { width: "115px", textAlign: "center", "& .fui-TableHeaderCell__button": { justifyContent: "center" } },
  colName: { width: "25%" },
  colNameFixed: { width: "390px" },
  /** `Max(70, label + 32)` — the label is 450 wide, or 0 with the column hidden; here it takes the rest. */
  colHolding: {},
  colHoldingHidden: { width: "70px" },
  colDate: { width: "204px" },
  colStatus: { width: "230px" },
  headerToggle: { display: "inline-flex", alignItems: "center", gap: space.xxs, "& svg": { color: palette.themePrimary } },
  rowActions: { display: "flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap" },
  // The row toggles: 80 x 26, radius 4 (`but_…_ListRow_InProgress` / `_Complete`: Width = the 80 wide header label,
  // Height 26, RadiusTopLeft 4), the `ColorFade(Grayscale10, 0.65)` border, white, ExtraSmall text. 27 Oct 2026: they
  // were 90 x 30, radius 2, and showed about 9 % larger than the canvas beside it.
  rowButton: {
    minWidth: "80px", width: "80px", height: "26px", paddingLeft: 0, paddingRight: 0, fontSize: "12px", flexShrink: 0,
    fontWeight: tokens.fontWeightRegular, ...radius("4px"), ...border(ROW_BUTTON_BORDER),
    backgroundColor: palette.white, color: palette.Grayscale10,
    // Canvas disabled look: `DisabledFill: RGBA(242,242,241,0)` (none), `DisabledColor: RGBA(161,159,157)`,
    // the same faded border — not Fluent's grey block.
    ":disabled, :disabled:hover, :disabled:hover:active": {
      backgroundColor: palette.white, color: "rgb(161, 159, 157)", ...border(ROW_BUTTON_BORDER),
    },
  },
  /** `but_…_ListRow_Complete.Fill` — `ColorFade(palette.Green, 0.4)` when highlighted, text Grayscale00. */
  // The fills hold while disabled (a write runs): the canvas `DisabledFill` is transparent, so its
  // own `Fill` shows through.
  completeDone: {
    backgroundColor: "rgb(180, 201, 120)", color: palette.Grayscale00,
    ":disabled, :disabled:hover": { backgroundColor: "rgb(180, 201, 120)", color: palette.Grayscale00 },
  },
  /** `but_…_ListRow_InProgress.Fill` — themeLight while In Progress, text Grayscale00. */
  inProgressOn: {
    backgroundColor: palette.themeLight, color: palette.Grayscale00,
    ":disabled, :disabled:hover": { backgroundColor: palette.themeLight, color: palette.Grayscale00 },
  },
  /**
   * The canvas hovers, whatever the state (canvas pair, 3 Nov 2026): In Progress `HoverFill:
   * ColorFade(akzent1, 0.3)`, `HoverColor: white`, `PressedFill: RGBA(16, 110, 190)`; Complete
   * `HoverFill: ColorFade(akzent3, 0.2)`, `HoverColor: white`.
   */
  inProgressHover: {
    ":hover:enabled": { backgroundColor: "rgb(126, 185, 227)", color: palette.white },
    ":hover:active:enabled": { backgroundColor: "rgb(16, 110, 190)", color: palette.white },
  },
  completeHover: {
    ":hover:enabled, :hover:active:enabled": { backgroundColor: "rgb(155, 183, 75)", color: palette.white },
  },
  /** `but_…_ListRow_History.Fill` — `ColorFade(akzent1, 0.3)`. */
  historyButton: { backgroundColor: "rgb(126, 185, 227)" },
  // `ico_…_ListRow_Comments`: `Icon.Note`, 20 x 24, themePrimary with a note, `Grayscale20` without.
  notePresent: { color: palette.themePrimary },
  noteAbsent: { color: palette.Grayscale20 },
  noteIcon: {
    minWidth: "20px", width: "20px", height: "24px", paddingLeft: 0, paddingRight: 0, fontSize: "18px",
    // `HoverColor: themePrimary`; no focus square after a click.
    ":hover": { color: palette.themePrimary }, "::after": { display: "none" },
  },
  // `ico_…_ListRow_ApprovalMode`: 24 high, `IconColor: =RGBA(53, 61, 63, 1)`, 4 px before the In Progress button.
  // Its place is reserved in EVERY row (a 24 px slot, `Height: =24`), so a row without the icon keeps its In Progress /
  // Complete buttons under the others' instead of shifting left (27 Oct 2026).
  approvalSlot: { flex: "0 0 24px", width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center" },
  approvalIcon: { fontSize: "20px", color: "rgb(53, 61, 63)" },
  // `ico_…_ListRow_CancelApproval`: `Icon.Cancel`, 12 x 12, `RGBA(53, 61, 63, 1)`.
  cancelIcon: { minWidth: "12px", width: "12px", height: "12px", paddingLeft: 0, paddingRight: 0, fontSize: "12px", color: "rgb(53, 61, 63)" },
  // `con_…_ListRow_Container_CompletionDate`: the Edit button (32 x 26) at X = 0, then the date.
  dateCell: {
    display: "flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap",
    // No focus square on the pencil after a click.
    "& .fui-Button::after": { display: "none" },
    "& .fui-Button:focus-visible, & .fui-Button[data-fui-focus-visible]": { outlineStyle: "none", ...border("transparent") },
  },
  // The in-cell editor: the 156-wide picker, then a 28-wide ✕, lifted a little over the row.
  dateEdit: {
    display: "inline-flex", alignItems: "center", marginLeft: "-8px", backgroundColor: palette.white,
    boxShadow: "0 1px 4px rgba(0, 0, 0, 0.16)",
    "& .fui-Input": { width: "156px", minWidth: "156px" },
  },
  dateCancel: { minWidth: "28px", width: "28px", height: "28px", paddingLeft: 0, paddingRight: 0, fontSize: "18px" },
  datePicker: { display: "flex", alignItems: "flex-end", gap: space.s },
  panelBody: {
    display: "flex", flexDirection: "column", gap: space.m, flex: "1 1 auto", minHeight: 0,
    // Everything above the history gallery (the last child) keeps its height.
    "& > :not(:last-child)": { flexShrink: 0 },
  },
  /** `gal_…_Inputs_History` — fills what is left and scrolls on its own. */
  historyScroll: {
    flex: "1 1 0", minHeight: 0, flexShrink: 1, overflowY: "auto", overflowX: "hidden",
    display: "flex", flexDirection: "column", gap: space.m,
  },
  // `con_…_Inputs_History`: 32 high, Fill Grayscale40; "History" then the 32 x 24 ArrowSync button.
  // Canvas pair (3 Nov 2026): a raised 30-high card, "History" regular 14 px 18 px in, the boxed
  // refresh 20 px from its right; the first entry 3 px under it.
  // The card also holds the cluster's task table, under the "History" row (canvas, 3 Nov 2026).
  // Only the "History" row is outlined (rounded top corners); the table hangs under it, and the card
  // ends 10 px lower with just its shadow (canvas pair, 3 Nov 2026).
  historyCard: {
    display: "flex", flexDirection: "column", backgroundColor: PM_GRAYSCALE40, marginBottom: "-13px",
    ...radius("4px"), boxShadow: "0 1px 2px rgba(0, 0, 0, 0.14)",
  },
  historyHead: {
    display: "flex", alignItems: "center", justifyContent: "space-between", height: "30px", boxSizing: "border-box",
    paddingLeft: "18px", paddingRight: "20px",
    // No outline: the card shows only by its shadow; "History" Semibold (PO, 3 Nov 2026).
    "& > .fui-Text": { fontSize: "14px", fontWeight: tokens.fontWeightSemibold },
  },
  // The 10 px under the task table only when the card holds one (canvas pairs, 3 Nov 2026).
  historyCardWithTable: { paddingBottom: "10px" },
  historyCardTable: { width: "calc(100% - 20px)", marginLeft: "5px", marginTop: 0 },
  // The six-column task tables: a 20-high header and 18-high rows (two-element selectors so they
  // win over `noteTable`'s 24).
  noteTableCompact: {
    "& thead th, & tbody td": { paddingTop: 0, paddingBottom: 0, verticalAlign: "middle" },
    "& thead th": { height: "20px" },
    "& tbody td": { height: "18px" },
  },
  historyRefresh: { minWidth: "30px", width: "30px", height: "22px", paddingLeft: 0, paddingRight: 0, ...radius("0") },
  /**
   * The panel chrome (canvas pairs, 3 Nov 2026): a 48-high header, the title centred and 4 px further
   * left; a 20-px pale ✕ that turns dark on a light square on hover, no focus square; the body 5 px
   * further left; no rule above Cancel, which is regular weight 6 px further in.
   */
  panelSkin: {
    "&.canvas-panel .canvas-panel-header": {
      height: "48px", minHeight: "48px", paddingTop: 0, paddingBottom: 0, justifyContent: "center",
    },
    "&.canvas-panel .canvas-panel-header h2": { fontSize: "17px" },
    "&.canvas-panel .canvas-panel-header button .fui-Button__icon, &.canvas-panel .canvas-panel-header button svg": {
      fontSize: "24px", width: "24px", height: "24px", color: "rgba(255, 255, 255, 0.6)",
    },
    "&.canvas-panel .canvas-panel-header button:hover, &.canvas-panel .canvas-panel-header button:hover:active": {
      backgroundColor: "#f3f2f1",
    },
    "&.canvas-panel .canvas-panel-header button:hover .fui-Button__icon, &.canvas-panel .canvas-panel-header button:hover:active .fui-Button__icon": {
      color: "#323130",
    },
    "&.canvas-panel .canvas-panel-footer": { borderTopWidth: 0 },
    "&.canvas-panel .canvas-panel-footer .fui-Button": { fontWeight: tokens.fontWeightRegular },
    "&.canvas-panel .canvas-panel-header button::after": { display: "none" },
    // No focus square after a CLICK; a keyboard focus keeps a visible ring (CU-8, 17 Nov 2026: the ring was removed for both).
    "&.canvas-panel .canvas-panel-header button:focus:not(:focus-visible):not([data-fui-focus-visible])": {
      outlineStyle: "none", boxShadow: "none", backgroundColor: "transparent", ...border("transparent"),
    },
    "&.canvas-panel .canvas-panel-header button:focus-visible, &.canvas-panel .canvas-panel-header button[data-fui-focus-visible]": {
      outlineStyle: "solid", outlineWidth: "2px", outlineColor: "#ffffff", outlineOffset: "-2px",
    },
  },
  // The change-cluster panel: the title 6 px and the body 5 px further left, Cancel 6 px further in.
  panelHistory: {
    "&.canvas-panel .canvas-panel-header": { paddingLeft: "18px" },
    // The body itself does not scroll: only the history gallery does (`historyScroll`, canvas pair 3 Nov 2026).
    "&.canvas-panel .canvas-panel-body": {
      paddingLeft: "18px", overflowY: "hidden", display: "flex", flexDirection: "column",
    },
    "&.canvas-panel .canvas-panel-footer": { paddingRight: "26px" },
    "&.canvas-panel .canvas-panel-footer .fui-Button:last-of-type": { fontSize: "13px" },
    // Request Approval: 16 px with its arrow (`FontSize: =16`).
    "&.canvas-panel .canvas-panel-footer .fui-Button:first-of-type:not(:last-of-type)": { fontSize: "16px" },
  },
  /**
   * Add Comment for Task changes (canvas pair, 3 Nov 2026): a Semibold caption with the `*` hung
   * 13 px to its left, a 74-high rounded box, no counter, and the message 12 px regular 5 px in.
   */
  panelComment: {
    "&.canvas-panel .canvas-panel-header": { paddingLeft: "16px" },
    "&.canvas-panel .canvas-panel-body": { paddingLeft: "16px", paddingRight: "18px", paddingTop: "14px" },
    "&.canvas-panel .canvas-panel-footer .fui-Button:last-of-type": { fontSize: "13px" },
    "& .fui-Field": { position: "relative" },
    "& .fui-Field .fui-Field__label.fui-Field__label": { position: "relative", fontWeight: tokens.fontWeightSemibold },
    "& .fui-Label__required": { position: "absolute", left: "-13px", top: 0, paddingLeft: 0, paddingRight: 0 },
    // A dark-grey rule under the box while typing, not the blue focus bar.
    "& .fui-Textarea": { height: "74px", marginTop: "1px", ...radius("4px") },
    "& .fui-Textarea::after": { borderBottomColor: "#616161" },
    "& .fui-Field__validationMessage": { fontSize: "12px", fontWeight: tokens.fontWeightRegular, paddingLeft: "9px", marginTop: "8px" },
  },
  /**
   * Request Approval drawn as the canvas draws it: blue, white text and arrow, 170 x 30, also while it is disabled
   * (PO, 3 Nov 2026). The approval flows are connected since D81.
   */
  requestApproval: {
    minWidth: "170px", height: "30px", ...radius("0"),
    "&:disabled, &:disabled:hover, &:disabled:hover:active": {
      backgroundColor: palette.themePrimary, color: palette.white, cursor: "default", ...border(palette.themePrimary),
    },
    "&:disabled .fui-Button__icon, &:disabled:hover .fui-Button__icon": { color: palette.white },
  },
  requestApprovalBlocked: {
    "&:disabled, &:disabled:hover, &:disabled:hover:active": {
      backgroundColor: "transparent", color: "rgb(96, 94, 92)", ...border("transparent"),
    },
    "&:disabled .fui-Button__icon, &:disabled:hover .fui-Button__icon": { color: "rgb(96, 94, 92)" },
  },
  /** `lbl_…_Comment_Details_ErrorMessage_1`: `Size: =ExtraExtraSmall` (8 pt ≈ 10.7 px), regular. */
  commentBlock: {
    minHeight: "70px", flexShrink: 0,
    "& .fui-Field .fui-Field__label.fui-Field__label": { fontWeight: tokens.fontWeightSemibold },
    "& .fui-Input": { height: "28px", minHeight: "28px" },
  },
  commentErrorSmall: { fontSize: "10.67px", fontWeight: tokens.fontWeightRegular, lineHeight: "16px", marginTop: "5px", paddingLeft: "5px" },
  historyEntry: { display: "flex", flexDirection: "column", gap: "5px" },
  // `con_…_Form_History_Header`: 24 high, `rec_…_Form_Start` (4 wide, themePrimary) on the left,
  // "Comment:" (90, Semibold Small), the comment, the date (180, ExtraSmall), the name (200, right).
  // Canvas pair (3 Nov 2026): a 2-px bar, "Comment:" regular in a 90 column, the date and the
  // name in 180 / 195 columns at the right, both left-aligned.
  entryHead: {
    display: "flex", alignItems: "center", minHeight: "27px", paddingLeft: "4px", marginLeft: "7px", minWidth: 0,
    borderLeftWidth: "3px", borderLeftStyle: "solid", borderLeftColor: palette.themePrimary,
  },
  // Measured side by side (3 Nov 2026): "Comment:" Semibold 14, the date and name 9.5 pt.
  entryLabel: { flex: "0 0 90px", fontSize: "14px", fontWeight: tokens.fontWeightSemibold },
  entryComment: { flex: "1 1 auto", minWidth: 0, fontSize: "14px", overflowX: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  entryDate: { flex: "0 0 179px", fontSize: "12.67px", whiteSpace: "nowrap" },
  // 199 wide, the name cut 12 px short of the rule's end.
  entryUser: { flex: "0 0 199px", boxSizing: "border-box", paddingRight: "12px", minWidth: 0, fontSize: "12.67px", textAlign: "left", overflowX: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  // `rec_…_Form_Gal_History`: a 1 px themePrimary rule under each entry's header.
  entryRule: { height: "1px", backgroundColor: palette.themePrimary, marginLeft: "7px", marginRight: "4px", marginTop: "-5px" },
  noteTable: {
    // 4 px in from the rule, 10 px short of its right end (canvas pair, 3 Nov 2026).
    width: "calc(100% - 20px)", marginLeft: "11px", marginTop: "1px", tableLayout: "fixed", borderCollapse: "collapse", ...border(NOTE_BORDER),
    "& th, & td": { ...border(NOTE_BORDER), height: "24px", boxSizing: "border-box", paddingTop: "2px", paddingBottom: "2px", paddingLeft: "4px", paddingRight: "2px", color: "#000000", textAlign: "left", verticalAlign: "top" },
    "& th": { fontSize: "12px", fontWeight: tokens.fontWeightBold, backgroundColor: NOTE_HEADER_FILL },
    // `tableHeader` (the six-column task table): Gate Relevance 10 %, Description 40 %, the rest share the remainder.
    "& th:nth-child(1):nth-last-child(6)": { width: "10%" },
    "& th:nth-child(2):nth-last-child(5)": { width: "40%" },
    // The four-column approval table: Completed On / Response / Comments / Completed By = 20 / 20 / 40 / 20.
    "& th:nth-child(1):nth-last-child(4), & th:nth-child(2):nth-last-child(3), & th:nth-child(4):nth-last-child(1)": { width: "20%" },
    "& th:nth-child(3):nth-last-child(2)": { width: "40%" },
    // `rowStyle`: 11 px, `text-wrap: nowrap` — a long cell is cut with an ellipsis (its text is the title).
    "& td": { fontSize: "11px", backgroundColor: "#ffffff", whiteSpace: "nowrap", overflowX: "hidden", textOverflow: "ellipsis" },
  },
  noteText: { fontSize: tokens.fontSizeBase100 },
  preLine: { whiteSpace: "pre-line" },
  // The tooltip sits on a wrapper so it also shows while the button is disabled (a disabled button gets no hover events).
  tipWrap: { display: "inline-flex", flexShrink: 0 },
});

/** The classic `Icon.Note`: a square sheet with its bottom-right corner folded. */
const ClassicNoteIcon = () => (
  <svg width="1em" height="1em" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true">
    <path d="M2.5 2.5h11v7l-4 4h-7z" />
    <path d="M13.5 9.5h-4v4" />
  </svg>
);

/** The `Char(13)` tooltips, one line per piece. */
const lines = (text: string | null): string => (text ?? "").replace(/\r/g, "\n");

/** The lock bullets' canvas names, by reason. */
const LOCK_TEST_ID = {
  General: "lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage_11",
  Milestones: "lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage_12",
  Generator: "lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage_13",
  Production: "lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage_14",
} as const;

/** Which right panel is open, by id — the target is re-derived from the latest rows every render. */
type PanelForm =
  /** `stateId`: the cluster the panel was opened FOR — a refresh that moves the selection must not
   *  re-point an open panel (and its Save) at another cluster. */
  | { kind: "cluster"; stateId: string; comment: string; approvalDueDate: string }
  | { kind: "checklist"; rowId: string; comment: string; approvalDueDate: string };

/* ────────────────────────────────────────────────────────────────── screen */

interface ChecklistTaskTableProps {
  rows: readonly ChecklistRow[];
  approvalIx: ApprovalIndexes;
  approvalsState: ApprovalSettingsState;
  approvalsHint: string | null;
  locked: boolean;
  busy: boolean;
  showHolding: boolean;
  /** The row whose completion-date editor is open. */
  dateRowId: string | null;
  /** The row whose Complete write is in flight — drawn green meanwhile. */
  completingRowId: string | null;
  locale: string;
  /** `checklistTableTitle(…)`: the table's accessible name. */
  title: string;
  /** CU-1: the Screen's pencil refs and the row whose picker takes focus when it opens. */
  pencilRefs: MutableRefObject<Map<string, HTMLElement>>;
  focusPickerRow: MutableRefObject<string | null>;
  onToggleHolding: () => void;
  onRowAction: (row: ChecklistRow) => void;
  onCompletionDate: (row: ChecklistRow, value: string | null) => void;
  onOpenDateEditor: (rowId: string) => void;
  onCloseDateEditor: (rowId: string) => void;
  onInProgress: (row: ChecklistRow) => void;
  onHistory: (row: ChecklistRow) => void;
  onCancelApproval: (row: ChecklistRow) => void;
  onComment: (row: ChecklistRow) => void;
}

/**
 * `gal_Checklist_DisplayProject_Body_General_Content` — the task table (FE-P1-03, D162). Memoized: the panels' comment and
 * date drafts live in the Screen, so every keystroke in a panel re-rendered every task row (3–5 Fluent Buttons and a
 * Tooltip each). Its props are the rows, the gates the rows read, the CU-1 focus refs and handlers with a fixed identity
 * (`useStableCallback`), so a panel keystroke renders none of it (UT-CHK-FE-001). Markup, captions, `aria-label`s and
 * test ids are those the Screen rendered inline.
 */
const ChecklistTaskTable = memo(function ChecklistTaskTable({
  rows, approvalIx, approvalsState, approvalsHint, locked, busy, showHolding, dateRowId, completingRowId, locale, title,
  pencilRefs, focusPickerRow, onToggleHolding, onRowAction, onCompletionDate, onOpenDateEditor, onCloseDateEditor,
  onInProgress, onHistory, onCancelApproval, onComment,
}: ChecklistTaskTableProps) {
  probeRender("ChecklistTaskTable");
  const s = useStyles();
  return (
    <div className={s.scroll}>
      <Table size="small" className={mergeClasses(s.table, !showHolding && s.tableHoldingHidden)} aria-label={title} data-testid="gal_Checklist_DisplayProject_Body_General_Content">
        <TableHeader>
          <TableRow className={s.headerRow}>
            <TableHeaderCell className={s.colGate}>{UI.header.gateRelevance}</TableHeaderCell>
            <TableHeaderCell className={showHolding ? s.colName : s.colNameFixed}>{UI.header.holdingDescription}</TableHeaderCell>
            <TableHeaderCell className={showHolding ? s.colHolding : s.colHoldingHidden}>
              {/* `ico_…_HoldingText_Visibility` (18 x 18) at X = 0, the caption after it. */}
              <span className={s.headerToggle}>
                <Tooltip content={holdingColumnToggleLabel(showHolding)} relationship="label" withArrow>
                  <Button appearance="transparent" size="small"
                    icon={showHolding ? <EyeOffRegular /> : <EyeRegular />}
                    aria-label={holdingColumnToggleLabel(showHolding)}
                    data-testid="ico_Checklist_DisplayProject_Body_Content_OverviewHeader_HoldingText_Visibility"
                    onClick={onToggleHolding} />
                </Tooltip>
                {showHolding ? UI.header.countryDescription : null}
              </span>
            </TableHeaderCell>
            <TableHeaderCell className={s.colDate}>{UI.header.completionDate}</TableHeaderCell>
            {/* "Status" spans the In Progress / Complete toggles and the comment icon (the canvas's
                two blank header labels after it are folded into this column). */}
            <TableHeaderCell className={s.colStatus}>{UI.header.status}</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, rowIndex) => {
            const ra = rowApprovalIn(approvalIx, row);
            const label = ra.label;
            const cancelVisible = showCancelApprovalIcon(label);
            const holding = truncateHolding(row.holdingDescription);
            const personaTip = checklistPersonaTooltip(ra.first, ra.iconVisible);
            const disabledRow = locked || busy;
            // C1: the actions that depend on the approval settings wait for them; the tooltip says why (it wins over the persona text).
            const approvalsOff = approvalsState !== "ready";
            const rowTip = approvalsHint ?? personaTip;
            // CU-3: the row's buttons are described by the task's title (their aria-labels are the canvas ones and stay).
            const taskTitleId = `checklist-task-${row.id}`;
            const completeButton = (
              <Button size="small" appearance="secondary" aria-label={label} aria-describedby={taskTitleId}
                // Already green: hovering keeps the colour (PO, 3 Nov 2026); otherwise the canvas hover.
                className={mergeClasses(s.rowButton,
                  rowCompleteHighlighted(row, label) || completingRowId === row.id ? s.completeDone : s.completeHover)}
                data-testid="but_Checklist_DisplayProject_Body_Content_ListRow_Complete"
                disabled={disabledRow || approvalsOff || !rowActionEnabled(row, label, cancelVisible)}
                onClick={() => onRowAction(row)}>
                {label}
              </Button>
            );
            return (
              <Fragment key={row.id}>
                <TableRow className={mergeClasses(s.bodyRow, rowIndex === 0 && s.firstRow)} data-testid="con_Checklist_DisplayProject_Body_Content_ListRow">
                  <TableCell className={s.colGate} title={taskStateLabel(row.taskState)}>{gateRelevanceLabel(row.gateRelevance)}</TableCell>
                  <TableCell id={taskTitleId} title={row.title}><span className={s.clip}>{row.title}</span></TableCell>
                  <TableCell title={showHolding ? holding : undefined}>{showHolding ? <span className={s.clip}>{holding}</span> : null}</TableCell>
                  <TableCell>
                    {/* `con_…_ListRow_Container_CompletionDate`: the Edit button, then `Text(…, "ddd, mmm. dd, yyyy")`. */}
                    {row.isCompletionDate && dateRowId === row.id ? (
                      // The picker opens IN the cell, the ✕ beside it closes it (canvas pair, 3 Nov 2026).
                      <span className={s.dateEdit} data-testid="date_con_Checklist_DisplayProject_Body_Content_CompletionDate"
                        // CU-1: the picker's input takes focus when the editor opens.
                        ref={(el) => {
                          if (el && focusPickerRow.current === row.id) {
                            focusPickerRow.current = null;
                            el.querySelector("input")?.focus();
                          }
                        }}>
                        {/* `SelectedDate`: the stored date, or today. `DatePicker@0.0.46`, LongAbbreviated, no `IsEditable`. */}
                        <DateInput
                          name={ARIA.completionDate}
                          format={DATE_PICKER_FORMAT}
                          locale={locale}
                          allowTextInput={false}
                          value={toYmd(row.completionDate ?? new Date().toISOString())} disabled={busy}
                          onChange={(v) => onCompletionDate(row, v)} />
                        <Button appearance="transparent" size="small" icon={<DismissRegular />} className={s.dateCancel}
                          aria-label="but_Checklist_DisplayProject_Body_Content_CompletionDate_Cancel" title={UI.cancel}
                          data-testid="but_Checklist_DisplayProject_Body_Content_CompletionDate_Cancel"
                          // CU-1: focus goes back to the pencil that opened the editor.
                          onClick={() => onCloseDateEditor(row.id)} />
                      </span>
                    ) : row.isCompletionDate ? (
                      <span className={s.dateCell}>
                        <Button appearance="transparent" size="small" icon={<EditRegular />}
                          aria-label="but_Checklist_DisplayProject_Body_Content_ListRow_CompletionDate"
                          aria-describedby={taskTitleId}
                          data-testid="but_Checklist_DisplayProject_Body_Content_ListRow_CompletionDate"
                          ref={(el: HTMLButtonElement | null) => {
                            if (el) pencilRefs.current.set(row.id, el); else pencilRefs.current.delete(row.id);
                          }}
                          disabled={disabledRow}
                          onClick={() => onOpenDateEditor(row.id)} />
                        <Text size={200} title={taskStateLabel(row.taskState)}>{fmtCanvasDate(row.completionDate, false, locale)}</Text>
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {/* ApprovalMode icon · In Progress (or History) · cancel ✕ · Complete · comment. */}
                    <span className={s.rowActions}>
                      <span className={s.approvalSlot}>
                        {ra.icon === "Mail" ? <MailRegular className={s.approvalIcon} aria-hidden /> : null}
                        {ra.icon === "People" ? <PeopleRegular className={s.approvalIcon} aria-hidden /> : null}
                      </span>
                      {!cancelVisible ? (
                        <Button size="small" appearance="secondary" aria-label={UI.inProgress} aria-describedby={taskTitleId}
                          className={mergeClasses(s.rowButton, row.taskState === CHOICE_PROCESS.taskState.inProgress && s.inProgressOn, s.inProgressHover)}
                          aria-pressed={row.taskState === CHOICE_PROCESS.taskState.inProgress}
                          data-testid="but_Checklist_DisplayProject_Body_Content_ListRow_InProgress"
                          // C1: the toggle resets the task's approval state, so it waits for the approval settings too.
                          disabled={disabledRow || approvalsOff}
                          onClick={() => onInProgress(row)}>
                          {UI.inProgress}
                        </Button>
                      ) : (
                        <Button size="small" appearance="transparent" aria-label={UI.history} aria-describedby={taskTitleId}
                          className={mergeClasses(s.rowButton, s.historyButton)}
                          data-testid="but_Checklist_DisplayProject_Body_Content_ListRow_History"
                          disabled={disabledRow} onClick={() => onHistory(row)}>
                          {UI.history}
                        </Button>
                      )}
                      {cancelVisible ? (
                        <Button appearance="transparent" size="small" className={s.cancelIcon} icon={<DismissRegular />}
                          aria-label="ico_Checklist_DisplayProject_Body_Content_ListRow_CancelApproval" aria-describedby={taskTitleId}
                          disabled={disabledRow} title={UI.cancelApproval}
                          data-testid="ico_Checklist_DisplayProject_Body_Content_ListRow_CancelApproval"
                          onClick={() => onCancelApproval(row)} />
                      ) : null}
                      {rowTip ? (
                        // CU-12: on a wrapper, so the tooltip also shows while the button is disabled.
                        <Tooltip content={<span className={s.preLine}>{lines(rowTip)}</span>} relationship="description" withArrow>
                          <span className={s.tipWrap}>{completeButton}</span>
                        </Tooltip>
                      ) : completeButton}
                      {/* `ico_…_ListRow_Comments` — opens the comment form; no tooltip or message (PO, 3 Nov 2026). */}
                      <Button appearance="transparent" size="small" icon={<ClassicNoteIcon />}
                        className={mergeClasses(s.noteIcon, rowHasNote(row) ? s.notePresent : s.noteAbsent)}
                        aria-label="ico_Checklist_DisplayProject_Body_Content_ListRow_Comments" aria-describedby={taskTitleId}
                        data-testid="ico_Checklist_DisplayProject_Body_Content_ListRow_Comments"
                        disabled={disabledRow}
                        onClick={() => onComment(row)} />
                    </span>
                  </TableCell>
                </TableRow>
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
        </div>
  );
});

/**
 * One screen instance PER PROJECT (C10, CF-6 / generators GR-6): the route element is the same component for every project, so
 * an open panel, a selection and a date editor of project A would stay mounted over project B. Keying by the project id
 * gives each project a fresh state (the Contracts and Generators screens do the same).
 */
export default function CheckListScreen() {
  const { projectId } = useSession();
  return <CheckListScreenBody key={projectId ?? "none"} />;
}

function CheckListScreenBody() {
  const s = useStyles();
  const { projectId, locale, envVars, session } = useSession();

  const projectQ = useChecklistProject(projectId);
  const project = projectQ.data;
  const sequenceQ = useClusterSequence(projectId, project);
  const { states, trackings, gates } = sequenceQ.data;
  const writes = useChecklistWrites(projectId);

  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [panelForm, setPanelForm] = useState<PanelForm | null>(null);
  const [commentForm, setCommentForm] = useState<{ row: ChecklistRow; text: string } | null>(null);
  const [terminal, setTerminal] = useState<TerminalStaging | null>(null);
  const [confirmReturn, setConfirmReturn] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [dateRowId, setDateRowId] = useState<string | null>(null);
  /** The row whose Complete write is in flight — drawn green meanwhile, as the canvas does. */
  const [completingRowId, setCompletingRowId] = useState<string | null>(null);
  const [showHolding, setShowHolding] = useState(true);
  /** CU-1: the pencil of each row, so focus can go back to it when the date editor closes; and the row whose editor just opened. */
  const pencilRefs = useRef(new Map<string, HTMLElement>());
  const focusPencilRow = useRef<string | null>(null);
  const focusPickerRow = useRef<string | null>(null);
  // Runs after every commit: when the editor has just closed, the pencil that is back in the cell takes focus.
  useEffect(() => {
    if (focusPencilRow.current === null) return;
    pencilRefs.current.get(focusPencilRow.current)?.focus();
    focusPencilRow.current = null;
  });

  /* ── the two sequences and the selected cluster. */
  const startCluster = startClusterNo(project);
  // D138 (A1): derived once per input change, not on every render (every comment keystroke re-ran both, and made
  // `current` a new object each time, which re-ran the orchestration effects).
  const operational = useMemo(() => buildOperationalSequence(states, startCluster, gates), [states, startCluster, gates]);
  const display = useMemo(() => buildDisplaySequence(states, startCluster, gates), [states, startCluster, gates]);
  // C2 / C3: nothing is derived from the first read until the project, the states, the trackings and the gates have all
  // answered: no tip, no Draft fallback, no cluster actions (D127 §1).
  const loading = checklistIsLoading({
    hasProjectId: Boolean(projectId), projectLoading: projectQ.isLoading, sequenceLoading: sequenceQ.isLoading,
  });
  const current: SequenceEntry | null = useMemo(() => (loading ? null
    : operational.find((x) => x.id === selectedClusterId) ?? defaultSelectedCluster(operational, trackings)),
  [loading, operational, selectedClusterId, trackings]);
  const tracking = trackingFor(trackings, current?.id ?? null);
  const gate = gateFor(gates, current);
  const previous = previousState(operational, current?.id ?? null);
  const next = nextState(operational, current?.id ?? null);
  const previousTracking = trackingFor(trackings, previous?.id ?? null);

  // D150 (`earlyRows`, `earlyVisit`): the selected cluster does not depend on the gates (they only fill `hasGate` / `gateId`), so
  // once the states and the trackings are known the rows can be read, and the visit's own work (back-fill, copy of the templates)
  // can start, while the gates and their Entra lookups are still on their way. The screen shows nothing derived from this early
  // entry: `loading` still holds the loader until the gates have answered (D127 §1), and `current` stays null until then.
  const perf = checklistPerf();
  const earlyRows = perf.earlyRows;
  const earlyVisit = perf.earlyVisit;
  const coreReady = sequenceQ.coreReady === true; // a hook double without the field has no early cluster
  const early: SequenceEntry | null = useMemo(
    () => ((earlyRows || earlyVisit) && project !== null && coreReady
      ? earlyClusterEntry({ states, startCluster, trackings, selectedClusterId }) : null),
    [earlyRows, earlyVisit, project, coreReady, states, startCluster, trackings, selectedClusterId],
  );
  // C10 (CF-3): the project's own refetch counts too, so a visit does not start from a half-refreshed project.
  // With `earlyVisit` the gates are not waited for (the back-fill and the copy read no gate); a hook double without `coreSettled`
  // (a screen test that mocks `./hooks`) keeps the old rule.
  const sequenceReady = earlyVisit && sequenceQ.coreSettled !== undefined
    ? project !== null && !projectQ.isLoading && !projectQ.isFetching && coreReady && sequenceQ.coreSettled
    : project !== null && !projectQ.isLoading && !projectQ.isFetching && !sequenceQ.isLoading && !sequenceQ.isFetching;
  const orchestration = useChecklistOrchestration({
    project, states, trackings, sequenceReady, selected: earlyVisit ? (current ?? early) : current, writes,
  });

  const rowsCluster = current ?? (earlyRows ? early : null);
  const checklistQ = useClusterChecklist(projectId, rowsCluster?.id ?? null);
  const rows = checklistQ.data;
  const settingsQ = useChecklistApprovalSettings(projectId, rows);
  const settings = settingsQ.data;
  /** D138 (A1): the two approval-setting lookup maps, built once per settings array (not once per row per render). */
  const approvalIx = useMemo(() => approvalIndexes(settings), [settings]);
  // C1: the row actions that depend on the approval settings wait until they are KNOWN (a double without `hasData` counts as known).
  const approvalsState = approvalSettingsState({
    needed: approvalSettingsNeeded(rows),
    known: settingsQ.hasData ?? (!settingsQ.isLoading && !settingsQ.error),
    failed: Boolean(settingsQ.error),
  });
  const approvalsHint = approvalSettingsHint(approvalsState);

  const { abandoned: abandonedState, inactive: inactiveState } = terminalStates(states);
  // New Project mode (no project yet) opens locked, as the canvas does.
  const lockEntries = project || !projectId ? pageLock(project) : [];
  const locked = lockEntries.length > 0;
  const terminalProject = projectIsTerminal(project, abandonedState?.id ?? null, inactiveState?.id ?? null);
  // No project (New Project mode) has no technology, so the canvas shows the tip (canvas pair, 3 Nov 2026).
  const technologySupported = project !== null && (project.technology === CHOICE_PROCESS.technology.wind
    || project.technology === CHOICE_PROCESS.technology.pv);
  const busy = writes.progress !== null;

  /** The selected cluster as the panel sees it (the Return / Cancel gates read it with the panel closed). */
  const clusterPanel: PanelState | null = current
    ? { target: { kind: "cluster", state: current, tracking, gate }, comment: tracking?.approvalComment ?? "", approvalDueDate: null }
    : null;

  const panelRow = panelForm?.kind === "checklist" ? rows.find((r) => r.id === panelForm.rowId) ?? null : null;
  const panel: PanelState | null = (() => {
    if (!panelForm) return null;
    if (panelForm.kind === "cluster") {
      // The selection moved under the open panel (e.g. a refresh after a move): the panel is stale.
      if (current?.id !== panelForm.stateId) return null;
      return clusterPanel ?{ ...clusterPanel, comment: panelForm.comment, approvalDueDate: panelForm.approvalDueDate || null } : null;
    }
    if (!panelRow) return null;
    const ra = rowApprovalIn(approvalIx, panelRow);
    return {
      target: { kind: "checklist", row: panelRow, setting: ra.active, first: ra.first },
      comment: panelForm.comment, approvalDueDate: panelForm.approvalDueDate || null,
      hasChecklistApprovalEntry: ra.first !== null,
    };
  })();
  const historyQ = useHistory(projectId, panel ? historyDescriptor(panel) : null);

  const nextEnabled = nextClusterEnabled({ locked, projectIsTerminal: terminalProject, tracking, previous, previousTracking });

  /*
   * ── Refresh: the canvas command bar's one item (`refreshKey`, `Navigate` to the same screen).
   * PO, 20 Oct 2026: it is shown as the refresh ICON at the top right of the cluster steps, and the
   * left "Refresh" command is removed. Same action, same lock/busy gate, for every project.
   */
  const refreshDisabled = locked || busy;
  const refreshAll = () => {
    orchestration.restart();
    setSelectedClusterId(null);
    setPanelForm(null);
    void writes.refresh();
  };

  const terminalButtons = (["abandon", "inactivate"] as TerminalKind[]).flatMap((kind) => {
    const visible = project
      ? terminalButtonVisible({
        kind, project, previous, previousTracking,
        abandonedStateId: abandonedState?.id ?? null, inactiveStateId: inactiveState?.id ?? null,
      })
      : true;
    if (!visible) return [];
    const staging = project
      ? stageTerminalToggle({ kind, project, currentTracking: tracking, abandonedState, inactiveState })
      : null;
    const own = kind === "abandon" ? abandonedState : inactiveState;
    const action: TerminalAction = {
      kind,
      label: staging?.label ?? (kind === "abandon" ? UI.abandon : UI.inactivate),
      active: own !== null && project?.clusterStateId === own.id,
      disabled: !project || locked || busy || loading || !staging,
      onClick: () => { if (staging) setTerminal(staging); },
    };
    return [action];
  });

  /* ── the stepper cards (`cmp_CheckList_Project_States`) — every visible state; skipped clusters muted. */
  const currentId = current?.id;
  const steps: ProjectStateStep[] = useMemo(() => (loading ? [] : display.map((step, index) => {
    const stepTracking = trackingFor(trackings, step.id);
    const stepGate = gateFor(gates, step);
    return {
      id: step.id,
      name: step.name,
      lines: stepDescriptionLines(step),
      stateLabel: stepStateLabel(stepTracking, index),
      selected: step.id === currentId,
      skipped: Boolean(step.isSkippedDisplayOnly),
      gate: stepGateVisible(step, index === display.length - 1)
        ? {
          icon: stepGateIcon(stepGate),
          // `circ_State_Card_Gate_Approval.Fill` switches on the raw StateProgress — no first-card default.
          progressLabel: stepStateLabel(stepTracking, -1),
          tooltip: gatePersonaTooltip(stepGate, stepTracking),
        }
        : null,
      clock: stepClockVisible(stepTracking),
    };
  })), [loading, display, trackings, gates, currentId]);

  /* ── panels */
  const openPanel = (form: { kind: "cluster" } | { kind: "checklist"; row: ChecklistRow }) => {
    const draft: PanelState | null = form.kind === "cluster"
      ? clusterPanel
      : { target: { kind: "checklist", row: form.row, setting: null }, comment: "", approvalDueDate: null };
    const due = draft ? toYmd(approvalDueDateDefault(draft, project?.milestones ?? null, current, next)) : "";
    // `txt_…_Comment_1.Value = locRecordSelectedProjectStateTracking.vsb_approvalcomment` in BOTH modes.
    const comment = tracking?.approvalComment ?? "";
    setPanelForm(form.kind === "cluster"
      ? { kind: "cluster", stateId: current?.id ?? "", comment, approvalDueDate: due }
      : { kind: "checklist", rowId: form.row.id, comment, approvalDueDate: due });
  };
  /** The close X and Cancel close at once and reset the inputs (`btn_…_Buttons_Reset`). */
  const closePanel = () => setPanelForm(null);

  const onRowAction = useStableCallback((row: ChecklistRow) => {
    // C1: never decide "complete" from settings that have not been read.
    if (approvalsState !== "ready") return;
    const ra = rowApprovalIn(approvalIx, row);
    const kind = rowActionKind(row, ra.iconVisible);
    if (kind === "needDate") { setInfo(COMPLETION_DATE_MESSAGE); return; }
    if (kind === "panel") { openPanel({ kind: "checklist", row }); return; }
    // The canvas paints the row green at once (it patches its collection first); do the same while
    // the write runs, then the refetched row takes over (canvas pair, 3 Nov 2026).
    setCompletingRowId(row.id);
    void writes.patchRow(row, completeTaskPatch(), {
      // C8 (CU-14): the canvas progress text is the one for a change in progress, not the success text.
      progress: MSG.taskChanging(row.title), error: MSG.taskError,
    }).finally(() => setCompletingRowId(null));
  });

  const onSave = async () => {
    if (!panel || panel.target.kind !== "cluster" || !project || !current) return;
    // The last cluster has no "Move to …" (the canvas hides NextCluster), so it is never completed here.
    if (!next || panelForm?.kind !== "cluster" || panelForm.stateId !== current.id) return;
    const due = showApprovalDueDate(panel) && panel.approvalDueDate ? ymdToLocalIso(panel.approvalDueDate) : null;
    // D106: the panel closes the moment the writes are over (before the awaited reload), so the reload's "Loading, please wait..."
    // spinner runs behind a closed panel, in the canvas order (`Select(…_Reset)`, then `Navigate` and refresh).
    const done = await writes.saveTransition(
      { project, state: current, next, comment: panel.comment, approvalDueDate: due },
      { onWritten: (ok) => { setPanelForm(null); if (ok) setSelectedClusterId(null); } },
    );
    // The canvas closes the panel whatever the outcome (`Select(btn_…_Buttons_Reset)` runs after the `IfError`, Y:5410), and its
    // error text is never shown (the dialog is hidden in the same step). Here the panel closes too, so the error bar of
    // `WriteFeedback` is not left BEHIND an open panel and its scrim; only a success moves the selection to the next cluster.
    setPanelForm(null);
    if (done !== null) setSelectedClusterId(null);
  };

  /** `pcf_…_Buttons_RequestApproval.OnChange` — both panel modes (D81). */
  const onRequestApproval = async () => {
    if (!panel || !project || !current) return;
    const due = showApprovalDueDate(panel) && panel.approvalDueDate ? ymdToLocalIso(panel.approvalDueDate) : null;
    const req: ApprovalRequest = panel.target.kind === "cluster"
      ? { kind: "cluster", project, state: current, gate, comment: panel.comment, approvalDueDate: due }
      : {
        kind: "checklist", project, row: panel.target.row,
        // `LookUp('Check List Default Approvals', template).'Check List Default Approval'` (Y:5517-5520): the first row, active or not.
        checkListDefaultApprovalId: panel.target.first?.id ?? "",
        currentStateId: current.id,
        approvalRequested: rowApprovalIn(approvalIx, panel.target.row).icon === "People",
        comment: panel.comment, approvalDueDate: due,
      };
    const done = await writes.requestApproval(req, { onWritten: (ok) => { setPanelForm(null); if (ok) setSelectedClusterId(null); } });
    // The canvas closes the panel, refreshes and `Navigate`s to the screen again (Y:5709-5719).
    // Closes whatever the outcome, as the canvas does (Y:5711, `Select(…_Reset)` Y:5717), so an error is not hidden behind the panel.
    setPanelForm(null);
    if (done !== null) setSelectedClusterId(null);
  };

  /** `pcf_…_Buttons_CancelApproval.OnChange` (D81) — the comment is the closed panel's box, i.e. the tracking's. */
  const onCancelGateApproval = () => {
    if (!clusterPanel || !project || !current) return;
    void writes.cancelGateApproval({
      project, state: current, gate, previous, next, comment: clusterPanel.comment,
      userDisplayName: session?.fullName ?? "", appId: envVars.vsb_ProjectManagementAppID ?? "",
    });
  };

  /** D138 (A1): the panel's task table and its history, derived when their source changes (not per keystroke). */
  const taskRows = useMemo(() => taskTableRows(rows), [rows]);
  const historyEntries = useMemo(() => historyQ.data.map((e) => ({ e, note: parseNoteHtml(e.note) })), [historyQ.data]);
  const requestCaption = panel ? requestApprovalCaption(panel, next) : "";
  // C4: a failed read with NO data blanks the screen (now with a Refresh button, which the text points to); a failed refresh that
  // still has data (window focus, a write's reload) is a banner and the screen stays (D127 §3).
  const mainReads = [projectQ, sequenceQ, checklistQ];
  const blocking = checklistLoadErrorMode(mainReads) === "blocking";
  const refreshFailed = !blocking
    && checklistLoadErrorMode(settingsQ.hasData ? [...mainReads, settingsQ] : mainReads) === "banner";

  // The task table's handlers keep one identity for the visit (`useStableCallback`), so the memoized `ChecklistTaskTable`
  // is not re-rendered by a panel keystroke; each reads the newest state when it is called (FE-P1-03).
  const toggleHolding = useStableCallback(() => setShowHolding((v) => !v));
  const onCompletionDate = useStableCallback((row: ChecklistRow, v: string | null) => {
    const iso = ymdToLocalIso(v ?? "");
    if (!iso) return;
    const shown = new Intl.DateTimeFormat(locale).format(new Date(iso));
    // The picker stays open with the new date (canvas pair); no green success bar (PO, 3 Nov 2026).
    void writes.patchRow(row, completionDatePatch(iso), {
      progress: MSG.completionDateChanging(shown, row.title),
      error: MSG.completionDateError,
    });
  });
  // CU-1: the picker's input takes focus when the editor opens; focus goes back to the pencil that opened it when it closes.
  const openDateEditor = useStableCallback((rowId: string) => { focusPickerRow.current = rowId; setDateRowId(rowId); });
  const closeDateEditor = useStableCallback((rowId: string) => { focusPencilRow.current = rowId; setDateRowId(null); });
  const onInProgress = useStableCallback((row: ChecklistRow) => void writes.patchRow(row, inProgressTogglePatch(row), {
    progress: MSG.taskChanging(row.title), error: MSG.taskError,
  }));
  const onHistory = useStableCallback((row: ChecklistRow) => openPanel({ kind: "checklist", row }));
  const onCancelChecklistApproval = useStableCallback((row: ChecklistRow) => void writes.cancelChecklistApproval(row));
  const onComment = useStableCallback((row: ChecklistRow) => setCommentForm({ row, text: row.note ?? "" }));
  const onSelectCluster = useStableCallback((id: string) => { setDateRowId(null); setSelectedClusterId(id); });
  const stableRefreshAll = useStableCallback(refreshAll);
  // One object while the gate does not change: the memoized `ProjectStates` is not re-rendered by a panel keystroke.
  const refresh = useMemo(() => ({ onClick: stableRefreshAll, disabled: refreshDisabled }), [stableRefreshAll, refreshDisabled]);

  if (blocking) {
    return (
      <div className={s.page} data-testid="Project General CheckList Screen">
        <EmptyState title={SCREEN_TEXT.loadFailedTitle} description={SCREEN_TEXT.loadFailedDescription}
          action={{ label: UI.refresh, onClick: refreshAll }} />
      </div>
    );
  }

  return (
    <div className={s.page} data-testid="Project General CheckList Screen">

      {/* `portal`: the canvas spinner (`cmp_PopUp_GateProcess_Saving_LoadingDialog_1`) is the last control, full screen, ABOVE the
          open right panel; drawn in the page it sat under the drawer's portal (z-index 1000000) and the panel stayed clickable. */}
      {/* CU-11: the blocking overlay is named by its own progress text. */}
      <WriteFeedback progress={writes.progress} error={writes.error} success={writes.success} testIdPrefix="checklist" portal
        overlayLabel={writes.progress ?? undefined} />

      {/* C4 (NEW TEXT, D127 §3): a failed refresh keeps the screen and its data, and says so. */}
      {refreshFailed ? (
        <MessageBar intent="error" aria-label="checklist-data-unavailable" data-testid="checklist-data-unavailable">
          <MessageBarBody>{READ_GATE_MSG.refreshFailed}</MessageBarBody>
        </MessageBar>
      ) : null}
      {/* C1 (NEW TEXT, D127 §1): the approval settings could not be read; Complete and Approval stay off. */}
      {approvalsState === "failed" ? (
        <MessageBar intent="error" aria-label="checklist-approvals-unavailable" data-testid="checklist-approvals-unavailable">
          <MessageBarBody>{READ_GATE_MSG.approvalsFailed}</MessageBarBody>
        </MessageBar>
      ) : null}

      {locked ? (
        <div className={s.lock} data-testid="con_Milestones_Page_LockMessage_3" role="status">
          <LockClosedRegular aria-hidden />
          <span className={s.lockList}>
            <span data-testid="lbl_ProjectRevenues_DisplayProjectBodyRightContent_Balancing_Price_VisibilityMessage_10">{PAGE_LOCK_TITLE}</span>
            {lockEntries.map((e) => <span key={e.reason} data-testid={LOCK_TEST_ID[e.reason]}>{e.label}</span>)}
          </span>
        </div>
      ) : null}

      {/* `cmp_CheckList_Project_States` (`ProjectStates.tsx`), with the page's one refresh at its top right. */}
      <ProjectStates
        steps={steps}
        onSelect={onSelectCluster}
        selectDisabled={busy}
        refresh={refresh}
      />

      {/* `con_Checklist_DisplayProject_Body_Content_Buttons` */}
      <ClusterActions
        cancelApproval={clusterPanel && showCancelApproval(clusterPanel)
          ? { disabled: locked || busy || !canCancelApproval(clusterPanel), onClick: onCancelGateApproval }
          : null}
        reset={clusterPanel && showReturnToPrevious(clusterPanel, previous, startCluster) ? {
          caption: resetToPreviousCaption(previous),
          disabled: locked || busy,
          onClick: () => setConfirmReturn(true),
        } : null}
        next={current && next ? {
          caption: nextClusterCaption({ tracking, state: current, next, gate }),
          tooltip: nextClusterTooltip({ gate, tracking, rows }),
          icon: nextClusterIcon(current, gate),
          disabled: !nextEnabled || busy,
          onClick: () => openPanel({ kind: "cluster" }),
        } : null}
        // `con_…_Buttons_Info.Visible` (S:2026): not locked AND NextCluster's DisplayMode is Disabled — the canvas does
        // not ask for a next cluster, so the last cluster shows Info too (it required `next` until 6 Nov 2026).
        info={!locked && current && !nextEnabled ? (terminalProject ? UI.infoTerminal : UI.infoWaiting) : null}
        terminals={terminalButtons}
      />

      {loading ? <LoadingOverlay mode="inline" label={MSG.loading} testId="checklist-loading" /> : null}

      {!loading && technologySupported ? (
        <div className={s.titleRow}>
          <Tooltip content={checklistTitleTooltip(tracking)} relationship="description" withArrow>
            <Text className={s.title} data-testid="lbl_Checklist_DisplayProject_Body_Content_Title">
              {checklistTableTitle(current?.name ?? null)}
            </Text>
          </Tooltip>
        </div>
      ) : !loading ? (
        <div className={s.tip} data-testid="con_Checklist_DisplayProject_Body_Content_Technology_Warning">
          <LightbulbRegular aria-hidden />
          <Text>{UI.technologyTip}</Text>
        </div>
      ) : null}

      {!loading && technologySupported ? (
        <ChecklistTaskTable
          rows={rows} approvalIx={approvalIx} approvalsState={approvalsState} approvalsHint={approvalsHint}
          locked={locked} busy={busy} showHolding={showHolding} dateRowId={dateRowId} completingRowId={completingRowId}
          locale={locale} title={checklistTableTitle(current?.name ?? null)} pencilRefs={pencilRefs} focusPickerRow={focusPickerRow}
          onToggleHolding={toggleHolding} onRowAction={onRowAction} onCompletionDate={onCompletionDate}
          onOpenDateEditor={openDateEditor} onCloseDateEditor={closeDateEditor} onInProgress={onInProgress}
          onHistory={onHistory} onCancelApproval={onCancelChecklistApproval} onComment={onComment}
        />
      ) : null}

      {/*
        * `con_CheckList_RightPanel_ChangeCluster_Form` — cluster transition or checklist completion.
        * Its context is `(Parent.Width / 4) * 3` wide from X = `Parent.Width / 2`, i.e. the right half.
        */}
      <FormPanel
        open={panel !== null}
        title={panel ? rightPanelTitle(panel, next) : ""}
        width="threeQuarter" panelClassName={mergeClasses(s.panelSkin, s.panelHistory)}
        // SOURCE DEFECT (CU-15, D127 §10): the canvas ✕ hint of this panel reads "Home", a copy-paste name; it says "Cancel" (rule 22).
        closeTooltip={HINTS.cancel}
        // A click outside does not close it — only ✕ / Cancel / Escape (PO, 3 Nov 2026).
        keepOpenOnOutsideClick
        // A write is running: the canvas spinner blocks the whole screen, so ✕ and Escape do nothing until it ends.
        busy={busy}
        onDismiss={closePanel}
        footer={panel ? (
          <>
            {showRequestApproval(panel) && requestCaption ? (
              // `DisplayMode: If(!ErrorMessage.Visible, Edit, Disabled)` — with no comment the canvas
              // draws it without a box, grey caption and arrow.
              <Button appearance="primary" aria-label={ARIA.requestApproval}
                className={mergeClasses(s.requestApproval, commentError(panel.comment) ? s.requestApprovalBlocked : undefined)}
                data-testid="pcf_CheckList_RightPanel_ChangeCluster_Form_Buttons_RequestApproval"
                // Merged 4 Nov 2026: the canvas arrow and hover text (PO, 3 Nov 2026) with the D81 flow call.
                icon={<ArrowRightRegular />} title={current?.name ?? requestCaption}
                disabled={busy || !canRequestApproval(panel)} onClick={() => void onRequestApproval()}>
                {requestCaption}
              </Button>
            ) : null}
            {showSave(panel) ? (
              <PanelButtons onSave={() => void onSave()} onCancel={closePanel}
                saveTestId="pcf_CheckList_RightPanel_ChangeCluster_Form_Buttons_Save"
                cancelTestId="pcf_CheckList_RightPanel_ChangeCluster_Form_Buttons_Cancel"
                saveLabel={ARIA.save} cancelLabel={ARIA.cancel}
                disabled={busy || !canSavePanel(panel)} />
            ) : (
              <PanelCancelButton onCancel={closePanel} label={ARIA.cancel}
                testId="pcf_CheckList_RightPanel_ChangeCluster_Form_Buttons_Cancel" />
            )}
          </>
        ) : null}
      >
        {panel ? (
          <div className={s.panelBody}>
            {commentBlockVisible(panel) ? (
              // `TextInput@0.0.54` — single line; Semibold caption; n/300 only once there is text; the
              // error label `Size: =ExtraExtraSmall` (8 pt) 5 px under the box; the block is the
              // `GroupContainer` `Height: =70`, so History starts at the same place either way
              // (canvas pairs, 3 Nov 2026).
              <div className={s.commentBlock}>
              <TextField
                label={UI.comment}
                labelWeight="semibold"
                ariaLabel={ARIA.comment}
                value={panel.comment}
                required={commentAsteriskVisible(project)}
                error={commentError(panel.comment) ?? undefined}
                errorClassName={s.commentErrorSmall}
                validationIcon={null}
                counter={panel.comment.length > 0}
                maxLength={COMMENT_MAX_LENGTH}
                disabled={busy || commentReadOnly(panel)}
                testId="txt_GeneralData_RightPanel_ProjectState_InpForm_Comment_1"
                onChange={(v) => setPanelForm((f) => (f ? { ...f, comment: v } : f))}
              />
              </div>
            ) : null}
            {showApprovalDueDate(panel) ? (
              // `DatePicker@0.0.46`, no `Format` (LongAbbreviated), `IsEditable: true`.
              <DateField
                label={UI.approvalDueDate}
                name="dtp_CheckList_RightPanel_ChangeCluster_Form_Inputs_ApprovalDueDate"
                format={DATE_PICKER_FORMAT}
                locale={locale}
                placeholder={UI.approvalDueDatePlaceholder}
                value={panel.approvalDueDate} disabled={busy}
                onChange={(v) => setPanelForm((f) => (f ? { ...f, approvalDueDate: v ?? "" } : f))} />
            ) : null}
            {/* `con_…_Inputs_History`: "History" and the IconOnly ArrowSync refresh at its right. */}
            <div className={mergeClasses(s.historyCard, showActualTaskState(panel, rows.length) && s.historyCardWithTable)}>
            <div className={s.historyHead}>
              <Text weight="semibold">{UI.history}</Text>
              <Tooltip content={UI.refresh} relationship="description" withArrow>
                <Button size="small" appearance="secondary" aria-label="Refresh" className={s.historyRefresh}
                  icon={<ArrowSyncRegular />}
                  data-testid="but_CheckList_RightPanel_ChangeCluster_Form_Inputs__Refresh"
                  onClick={() => void writes.refresh("history")} />
              </Tooltip>
            </div>
            {showActualTaskState(panel, rows.length) ? (
              <table className={mergeClasses(s.noteTable, s.noteTableCompact, s.historyCardTable)} aria-label={UI.history} data-testid="html_CheckList_RightPanel_ChangeCluster_Form_History">
                <thead>
                  <tr>{TASK_TABLE_HEADERS.map((h) => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {taskRows.map((r, i) => (
                    <tr key={`${r.name}-${i}`}>
                      <td>{r.relevance}</td><td title={r.name}>{r.name}</td><td>{r.clusterstate}</td>
                      <td>{r.taskstate}</td><td title={r.editor}>{r.editor}</td><td>{r.editdate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            </div>
            {/* `gal_…_Inputs_History`: per note, the header row, a themePrimary rule, the note's table.
                The gallery scrolls on its own; the comment and the History card above stay put. */}
            <div className={s.historyScroll} data-testid="gal_CheckList_RightPanel_ChangeCluster_Form_Inputs_History">
            {/* C4 (NEW TEXT, D127 §3): a failed history read is shown, not an empty list. */}
            {historyQ.error ? (
              <MessageBar intent="error" aria-label="checklist-history-unavailable" data-testid="checklist-history-unavailable">
                <MessageBarBody>{READ_GATE_MSG.historyFailed}</MessageBarBody>
              </MessageBar>
            ) : null}
            {historyEntries.map(({ e, note }) => {
              const [head, ...body] = note.table ?? [];
              return (
                <div key={e.id} className={s.historyEntry}>
                  <div className={s.entryHead}>
                    <span className={s.entryLabel}>{UI.commentPrefix}</span>
                    <span className={s.entryComment} title={e.comment ?? e.name ?? ""}>{e.comment ?? e.name ?? ""}</span>
                    <span className={s.entryDate}>{fmtCanvasDate(e.createdOn, true, locale)}</span>
                    <span className={s.entryUser} title={e.modifiedByName ?? ""}>{e.modifiedByName ?? ""}</span>
                  </div>
                  <div className={s.entryRule} />
                  {head ? (
                    // `parseNoteHtml` returns the header row first.
                    <table className={mergeClasses(s.noteTable, head.length === 6 && s.noteTableCompact)} aria-label={UI.commentPrefix}>
                      <thead><tr>{head.map((c, j) => <th key={j}>{c}</th>)}</tr></thead>
                      <tbody>
                        {body.map((cells, i) => (
                          <tr key={i}>{cells.map((c, j) => <td key={j} title={c}>{c}</td>)}</tr>
                        ))}
                      </tbody>
                    </table>
                  ) : note.text ? <Text className={s.noteText}>{note.text}</Text> : null}
                </div>
              );
            })}
            </div>
          </div>
        ) : null}
      </FormPanel>

      {/* `con_CheckList_RightPanel_Comment_Form` */}
      <FormPanel
        open={commentForm !== null}
        title={UI.commentFormTitle}
        width="narrow" panelClassName={mergeClasses(s.panelSkin, s.panelComment)}
        // A click outside does not close it — only ✕ / Cancel / Escape (PO, 3 Nov 2026).
        keepOpenOnOutsideClick
        busy={busy}
        onDismiss={() => setCommentForm(null)}
        footer={<PanelButtons
          onSave={() => {
            if (!commentForm) return;
            const { row, text } = commentForm;
            setCommentForm(null);
            // No green success bar after a comment (PO, 3 Nov 2026).
            void writes.patchRow(row, commentPatch(text), {
              progress: MSG.taskChanging(row.title), error: MSG.taskError,
            });
          }}
          onCancel={() => setCommentForm(null)}
          // SOURCE DEFECT: the canvas Save hint is "Filter projects details list view."; it says "Save".
          saveTooltip={HINTS.save}
          saveTestId="pcf_btn_CheckList_RightPanel_Checklist_Form_Buttons_Save"
          cancelTestId="pcf_btn__CheckList_RightPanel_Checklist_Form_Buttons_Cancel"
          disabled={busy || !(commentForm?.text ?? "").trim()} />}
      >
        <TextAreaField
          label={UI.comment}
          value={commentForm?.text ?? ""}
          required
          error={(commentForm?.text ?? "").trim() ? undefined : UI.commentFormEmpty}
          // The canvas shows the n/300 counter only once there is text (pairs of 3 Nov 2026).
          maxLength={COMMENT_MAX_LENGTH} counter={(commentForm?.text ?? "").length > 0}
          disabled={busy}
          testId="txt_CheckList_RightPanel_BodyForm_Comments"
          onChange={(v) => setCommentForm((f) => (f ? { ...f, text: v } : f))}
        />
      </FormPanel>

      <ConfirmDialog
        open={terminal !== null}
        title={UI.changeClusterStateTitle}
        description={terminal?.description ?? ""}
        confirmText={UI.yes}
        cancelText={UI.cancel}
        busy={busy}
        // `cmp_PopUp_Confirmation` at its own size (3 Nov 2026): 490 x 260, 40 px header, 12-pt
        // title, flat card on a dark scrim, regular-weight captions, a 128 px Yes (`Width: =128`).
        canvasFooter
        footerDivider={false}
        darkScrim
        confirmWidth={128}
        classicPopUp
        onConfirm={() => {
          const staging = terminal;
          setTerminal(null);
          if (staging && project) void writes.changeTerminal(project, staging);
        }}
        onCancel={() => setTerminal(null)}
      />

      <ConfirmDialog
        open={confirmReturn}
        title={UI.changeClusterStateTitle}
        description={returnConfirmation(previous)}
        confirmText={UI.yes}
        cancelText={UI.cancel}
        busy={busy}
        // Same canvas look as the terminal-state confirmation above.
        canvasFooter
        footerDivider={false}
        darkScrim
        confirmWidth={128}
        classicPopUp
        onConfirm={() => {
          setConfirmReturn(false);
          if (project && current && previous) {
            void writes.returnToPrevious({ project, state: current, previous }).then(() => setSelectedClusterId(null));
          }
        }}
        onCancel={() => setConfirmReturn(false)}
      />

      {/*
        * `cmp_PopUp_CheckList_GeneralData_Information` is a `cmp_PopUp_Information` (Components/cmp_PopUp_Information.pa.yaml):
        * 450 × 260, the 0.7 scrim, a 40-high themePrimary header with the ✕ (`Tooltip: ="Cancel"`), the body in Size 12
        * RGBA(50,49,48), ONE "OK" with a CheckMark, 90 wide — the shared variant, as on PM Revenues. It was a plain Fluent
        * dialog (white header, no ✕, no icon) until 6 Nov 2026.
        */}
      <ConfirmDialog
        open={info !== null}
        title={UI.completionDateTitle}
        description={info ?? ""}
        variant="information"
        confirmText={UI.ok}
        confirmWidth={90}
        darkScrim
        onCancel={() => setInfo(null)}
        onConfirm={() => setInfo(null)}
      />
    </div>
  );
}
