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
 * Request Approval, Cancel Approval Request and the row's cancel ✕ start approval flows (mails /
 * Teams cards): visible, disabled, with the `EXCLUDED.*` reason (D29).
 */
import { Fragment, useState } from "react";
import {
  Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle,
  Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, Tooltip,
  makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import {
  ArrowSyncRegular, DismissRegular, EditRegular, EyeOffRegular, EyeRegular, LockClosedRegular,
  MailRegular, NoteRegular, PeopleRegular,
} from "@fluentui/react-icons";
import {
  ConfirmDialog, DateField, EmptyState, FormPanel, PanelButtons, PanelCancelButton,
  TextAreaField, WriteFeedback, HINTS,
} from "@/components";
import { DATE_PICKER_FORMAT } from "@/domain/canvasDate";
import { useSession } from "@/app/SessionContext";
import { CHOICE_PROCESS } from "@/data/dataverseNames";
import { palette, space } from "@/theme/tokens";
import {
  ARIA, COMMENT_MAX_LENGTH, COMPLETION_DATE_MESSAGE, EXCLUDED, MSG, PAGE_LOCK_TITLE, SCREEN_TEXT, UI,
  approvalDueDateDefault, buildDisplaySequence, buildOperationalSequence, canSavePanel,
  checklistPersonaTooltip, checklistTableTitle, checklistTitleTooltip, commentAsteriskVisible,
  commentBlockVisible, commentError, commentPatch, commentReadOnly, completeTaskPatch, completionDatePatch,
  defaultSelectedCluster, fmtCanvasDate, gateFor, gatePersonaTooltip, gateRelevanceLabel, historyDescriptor,
  holdingColumnToggleLabel, inProgressTogglePatch, nextClusterCaption, nextClusterEnabled, nextClusterIcon,
  nextClusterTooltip, nextState, pageLock, parseNoteHtml, previousState, projectIsTerminal,
  requestApprovalCaption, resetToPreviousCaption, returnConfirmation, rightPanelTitle, rowActionEnabled,
  rowActionKind, rowApproval, rowCompleteHighlighted, rowHasNote, showActualTaskState, showApprovalDueDate,
  showCancelApproval, showCancelApprovalIcon, showRequestApproval, showReturnToPrevious, showSave,
  stageTerminalToggle, startClusterNo, stepClockVisible, stepDescriptionLines, stepGateIcon, stepGateVisible,
  stepStateLabel, taskStateLabel, taskTableRows, terminalButtonVisible, terminalStates,
  toYmd, trackingFor, truncateHolding, TASK_TABLE_HEADERS, ymdToLocalIso,
  type ChecklistRow, type PanelState, type SequenceEntry, type TerminalKind, type TerminalStaging,
} from "./rules";
import { ClusterActions, ProjectStates, type ProjectStateStep, type TerminalAction } from "./ProjectStates";
import {
  useChecklistApprovalSettings, useChecklistOrchestration, useChecklistProject, useChecklistWrites,
  useClusterChecklist, useClusterSequence, useHistory,
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
  page: { display: "flex", flexDirection: "column", flex: "1 0 auto", minWidth: 0, backgroundColor: palette.white },
  /** `con_Milestones_Page_LockMessage_3.Fill` RGBA(89, 89, 89, 1), white text — transcribed (Y:907, Y:1063). */
  lock: {
    display: "flex", alignItems: "center", gap: "10px", backgroundColor: "rgba(89, 89, 89, 1)",
    color: "#ffffff", paddingLeft: "20px", paddingTop: space.s, paddingBottom: space.s,
  },
  lockList: { display: "flex", flexDirection: "column", gap: space.xxs },
  // `con_Checklist_DisplayProject_Body_Content_Title`: 32 high; the label at X = 12, Semibold
  // `gblAppSizes.Font.Large` (12 pt).
  titleRow: { display: "flex", alignItems: "center", gap: space.s, height: "32px", paddingLeft: "12px", flex: "none" },
  title: { fontSize: "16px", fontWeight: tokens.fontWeightSemibold },
  // `con_Checklist_DisplayProject_Body_Content_Technology_Warning`: 44 high, RGBA(180, 214, 250, 1).
  tip: {
    display: "flex", alignItems: "center", minHeight: "44px", marginLeft: "10px", marginRight: "10px",
    paddingLeft: "40px", paddingRight: space.m, backgroundColor: "#B4D6FA",
  },
  // `con_Checklist_DisplayProject_Body_Content`: vertical, padding 10 left/right, scrolls both ways.
  scroll: { overflowX: "auto", paddingLeft: "10px", paddingRight: "10px", paddingBottom: "10px" },
  // Columns sized to their content (PO, 20 Oct 2026: "the width between header columns is more
  // than required"): Gate Relevance 120 · Holding ~390 · Country ~540 · Completion Date 230 ·
  // Status 240 = 1520 at most. Holding is a share of the table and Country takes the rest, so both
  // give way together on a narrower window; below 1060 the table scrolls inside its own box. (1060,
  // not 1100: on a 1366-px screen at 100 % zoom the box is 1097 wide, and 1100 left a 3-px scroll —
  // zoom sweep, 21 Oct 2026.)
  // `max-width` is undefined for a table (27 Oct 2026: it was ignored, the table filled the window and every column after
  // Holding Description sat 44 - 88 px right of the canvas), so the cap is in the width itself.
  table: { width: "min(100%, 1520px)", minWidth: "1060px", tableLayout: "fixed" },
  // With the Country column hidden (70) the widths are fixed: 120 + 390 + 70 + 230 + 240.
  tableHoldingHidden: { width: "1050px", minWidth: "1050px", maxWidth: "1050px" },
  // `con_…_OverviewHeader`: Fill Grayscale40 (#FFFFFF in the PM palette — no visible fill), 32 high;
  // captions Semibold `gblAppSizes.Font.Small` (10 pt).
  headerRow: {
    backgroundColor: PM_GRAYSCALE40, height: "32px",
    borderBottomWidth: "1px", borderBottomStyle: "solid", borderBottomColor: palette.Grayscale30,
    ":hover": { backgroundColor: PM_GRAYSCALE40 },
    "& th": { fontSize: "13.33px", fontWeight: tokens.fontWeightSemibold, height: "32px", paddingTop: 0, paddingBottom: 0 },
  },
  // Each row 36.5 (`gal_….Height: =Self.AllItemsCount*36.5`, 37 here): the 26-high toggle buttons, a 1 px Grayscale30 rule (`rec_…_Separator`), labels
  // `gblAppSizes.Font.ExtraSmall` (9 pt); two lines fit.
  bodyRow: {
    height: "37px",
    borderBottomWidth: "1px", borderBottomStyle: "solid", borderBottomColor: palette.Grayscale30,
    "& td": { fontSize: "12px", paddingTop: "2px", paddingBottom: "2px", verticalAlign: "middle" },
  },
  clip: {
    display: "-webkit-box", WebkitLineClamp: "2", WebkitBoxOrient: "vertical", overflowX: "hidden", overflowY: "hidden",
    lineHeight: "16px", wordBreak: "break-word",
  },
  colGate: { width: "120px", textAlign: "center", "& .fui-TableHeaderCell__button": { justifyContent: "center" } },
  colName: { width: "25.6%" },
  colNameFixed: { width: "390px" },
  /** `Max(70, label + 32)` — the label is 450 wide, or 0 with the column hidden; here it takes the rest. */
  colHolding: {},
  colHoldingHidden: { width: "70px" },
  colDate: { width: "230px" },
  colStatus: { width: "240px" },
  headerToggle: { display: "inline-flex", alignItems: "center", gap: space.xxs, "& svg": { color: palette.themePrimary } },
  rowActions: { display: "flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap" },
  // The row toggles: 80 x 26, radius 4 (`but_…_ListRow_InProgress` / `_Complete`: Width = the 80 wide header label,
  // Height 26, RadiusTopLeft 4), the `ColorFade(Grayscale10, 0.65)` border, white, ExtraSmall text. 27 Oct 2026: they
  // were 90 x 30, radius 2, and showed about 9 % larger than the canvas beside it.
  rowButton: {
    minWidth: "80px", width: "80px", height: "26px", paddingLeft: 0, paddingRight: 0, fontSize: "12px", flexShrink: 0,
    fontWeight: tokens.fontWeightRegular, ...radius("4px"), ...border(ROW_BUTTON_BORDER),
    backgroundColor: palette.white, color: palette.Grayscale10,
  },
  /** `but_…_ListRow_Complete.Fill` — `ColorFade(palette.Green, 0.4)` when highlighted, text Grayscale00. */
  completeDone: { backgroundColor: "rgb(180, 201, 120)", color: palette.Grayscale00, ":hover": { backgroundColor: "rgb(180, 201, 120)", color: palette.Grayscale00 } },
  /** `but_…_ListRow_InProgress.Fill` — themeLight while In Progress, text Grayscale00. */
  inProgressOn: { backgroundColor: palette.themeLight, color: palette.Grayscale00, ":hover": { backgroundColor: palette.themeLight, color: palette.Grayscale00 } },
  /** `but_…_ListRow_History.Fill` — `ColorFade(akzent1, 0.3)`. */
  historyButton: { backgroundColor: "rgb(126, 185, 227)" },
  // `ico_…_ListRow_Comments`: `Icon.Note`, 20 x 24, themePrimary with a note, `Grayscale20` without.
  notePresent: { color: palette.themePrimary },
  noteAbsent: { color: palette.Grayscale20 },
  noteIcon: { minWidth: "20px", width: "20px", height: "24px", paddingLeft: 0, paddingRight: 0, fontSize: "20px" },
  // `ico_…_ListRow_ApprovalMode`: 24 high, `IconColor: =RGBA(53, 61, 63, 1)`, 4 px before the In Progress button.
  // Its place is reserved in EVERY row (a 24 px slot, `Height: =24`), so a row without the icon keeps its In Progress /
  // Complete buttons under the others' instead of shifting left (27 Oct 2026).
  approvalSlot: { flex: "0 0 24px", width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center" },
  approvalIcon: { fontSize: "20px", color: "rgb(53, 61, 63)" },
  // `ico_…_ListRow_CancelApproval`: `Icon.Cancel`, 12 x 12, `RGBA(53, 61, 63, 1)`.
  cancelIcon: { minWidth: "12px", width: "12px", height: "12px", paddingLeft: 0, paddingRight: 0, fontSize: "12px", color: "rgb(53, 61, 63)" },
  // `con_…_ListRow_Container_CompletionDate`: the Edit button (32 x 26) at X = 0, then the date.
  dateCell: { display: "flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap" },
  datePicker: { display: "flex", alignItems: "flex-end", gap: space.s },
  panelBody: { display: "flex", flexDirection: "column", gap: space.m },
  // `con_…_Inputs_History`: 32 high, Fill Grayscale40; "History" then the 32 x 24 ArrowSync button.
  historyHead: {
    display: "flex", alignItems: "center", justifyContent: "space-between", height: "32px", backgroundColor: PM_GRAYSCALE40,
    borderBottomWidth: "1px", borderBottomStyle: "solid", borderBottomColor: palette.Grayscale30,
  },
  historyRefresh: { minWidth: "32px", width: "32px", height: "24px", paddingLeft: 0, paddingRight: 0 },
  historyEntry: { display: "flex", flexDirection: "column", gap: space.xs },
  // `con_…_Form_History_Header`: 24 high, `rec_…_Form_Start` (4 wide, themePrimary) on the left,
  // "Comment:" (90, Semibold Small), the comment, the date (180, ExtraSmall), the name (200, right).
  entryHead: {
    display: "flex", alignItems: "center", gap: space.s, minHeight: "24px", paddingLeft: "8px", minWidth: 0,
    borderLeftWidth: "4px", borderLeftStyle: "solid", borderLeftColor: palette.themePrimary,
  },
  entryLabel: { flex: "0 0 auto", fontSize: "13.33px", fontWeight: tokens.fontWeightSemibold },
  entryComment: { flex: "1 1 auto", minWidth: 0, fontSize: "13.33px", overflowX: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  entryDate: { flex: "0 0 auto", fontSize: "12px", whiteSpace: "nowrap" },
  entryUser: { flex: "0 1 200px", minWidth: 0, maxWidth: "200px", fontSize: "12px", textAlign: "right", overflowX: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  // `rec_…_Form_Gal_History`: a 1 px themePrimary rule under each entry's header.
  entryRule: { height: "1px", backgroundColor: palette.themePrimary, marginLeft: "3px", marginRight: "3px" },
  noteTable: {
    width: "100%", tableLayout: "fixed", borderCollapse: "collapse", ...border(NOTE_BORDER),
    "& th, & td": { ...border(NOTE_BORDER), paddingTop: "2px", paddingBottom: "2px", paddingLeft: "2px", paddingRight: "2px", color: "#000000", textAlign: "left", verticalAlign: "top" },
    "& th": { fontSize: "12px", fontWeight: tokens.fontWeightSemibold, backgroundColor: NOTE_HEADER_FILL },
    // `tableHeader`: Gate Relevance `width: 10%`, Description `width: 40%`, the rest share the remainder.
    "& th:nth-child(1)": { width: "10%" },
    "& th:nth-child(2)": { width: "40%" },
    // `rowStyle`: 11 px, `text-wrap: nowrap` — a long cell is cut with an ellipsis (its text is the title).
    "& td": { fontSize: "11px", backgroundColor: "#ffffff", whiteSpace: "nowrap", overflowX: "hidden", textOverflow: "ellipsis" },
  },
  noteText: { fontSize: tokens.fontSizeBase100 },
  preLine: { whiteSpace: "pre-line" },
});

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
  | { kind: "cluster"; comment: string; approvalDueDate: string }
  | { kind: "checklist"; rowId: string; comment: string; approvalDueDate: string };

/* ────────────────────────────────────────────────────────────────── screen */

export default function CheckListScreen() {
  const s = useStyles();
  const { projectId, locale } = useSession();

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
  const [showHolding, setShowHolding] = useState(true);

  /* ── the two sequences and the selected cluster. */
  const startCluster = startClusterNo(project);
  const operational = buildOperationalSequence(states, startCluster, gates);
  const display = buildDisplaySequence(states, startCluster, gates);
  const current: SequenceEntry | null =
    operational.find((x) => x.id === selectedClusterId) ?? defaultSelectedCluster(operational, trackings);
  const tracking = trackingFor(trackings, current?.id ?? null);
  const gate = gateFor(gates, current);
  const previous = previousState(operational, current?.id ?? null);
  const next = nextState(operational, current?.id ?? null);
  const previousTracking = trackingFor(trackings, previous?.id ?? null);

  const sequenceReady = project !== null && !projectQ.isLoading && !sequenceQ.isLoading && !sequenceQ.isFetching;
  const orchestration = useChecklistOrchestration({ project, states, trackings, sequenceReady, selected: current, writes });

  const checklistQ = useClusterChecklist(projectId, current?.id ?? null);
  const rows = checklistQ.data;
  const settingsQ = useChecklistApprovalSettings(projectId, rows);
  const settings = settingsQ.data;

  const { abandoned: abandonedState, inactive: inactiveState } = terminalStates(states);
  const lockEntries = project ? pageLock(project) : [];
  const locked = lockEntries.length > 0;
  const terminalProject = projectIsTerminal(project, abandonedState?.id ?? null, inactiveState?.id ?? null);
  const technologySupported = project === null
    || project.technology === CHOICE_PROCESS.technology.wind
    || project.technology === CHOICE_PROCESS.technology.pv;
  const busy = writes.progress !== null;

  /** The selected cluster as the panel sees it (the Return / Cancel gates read it with the panel closed). */
  const clusterPanel: PanelState | null = current
    ? { target: { kind: "cluster", state: current, tracking, gate }, comment: tracking?.approvalComment ?? "", approvalDueDate: null }
    : null;

  const panelRow = panelForm?.kind === "checklist" ? rows.find((r) => r.id === panelForm.rowId) ?? null : null;
  const panel: PanelState | null = (() => {
    if (!panelForm) return null;
    if (panelForm.kind === "cluster") {
      return clusterPanel ? { ...clusterPanel, comment: panelForm.comment, approvalDueDate: panelForm.approvalDueDate || null } : null;
    }
    if (!panelRow) return null;
    const ra = rowApproval(settings, panelRow);
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
      disabled: !project || locked || busy || !staging,
      onClick: () => { if (staging) setTerminal(staging); },
    };
    return [action];
  });

  /* ── the stepper cards (`cmp_CheckList_Project_States`) — every visible state; skipped clusters muted. */
  const steps: ProjectStateStep[] = display.map((step, index) => {
    const stepTracking = trackingFor(trackings, step.id);
    const stepGate = gateFor(gates, step);
    return {
      id: step.id,
      name: step.name,
      lines: stepDescriptionLines(step),
      stateLabel: stepStateLabel(stepTracking, index),
      selected: step.id === current?.id,
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
  });

  /* ── panels */
  const openPanel = (form: { kind: "cluster" } | { kind: "checklist"; row: ChecklistRow }) => {
    const draft: PanelState | null = form.kind === "cluster"
      ? clusterPanel
      : { target: { kind: "checklist", row: form.row, setting: null }, comment: "", approvalDueDate: null };
    const due = draft ? toYmd(approvalDueDateDefault(draft, project?.milestones ?? null, current, next)) : "";
    // `txt_…_Comment_1.Value = locRecordSelectedProjectStateTracking.vsb_approvalcomment` in BOTH modes.
    const comment = tracking?.approvalComment ?? "";
    setPanelForm(form.kind === "cluster"
      ? { kind: "cluster", comment, approvalDueDate: due }
      : { kind: "checklist", rowId: form.row.id, comment, approvalDueDate: due });
  };
  /** The close X and Cancel close at once and reset the inputs (`btn_…_Buttons_Reset`). */
  const closePanel = () => setPanelForm(null);

  const onRowAction = (row: ChecklistRow) => {
    const ra = rowApproval(settings, row);
    const kind = rowActionKind(row, ra.iconVisible);
    if (kind === "needDate") { setInfo(COMPLETION_DATE_MESSAGE); return; }
    if (kind === "panel") { openPanel({ kind: "checklist", row }); return; }
    void writes.patchRow(row, completeTaskPatch(), {
      progress: MSG.taskChanging(row.title), success: MSG.taskChanged, error: MSG.taskError,
    });
  };

  const onSave = async () => {
    if (!panel || panel.target.kind !== "cluster" || !project || !current) return;
    const due = showApprovalDueDate(panel) && panel.approvalDueDate ? ymdToLocalIso(panel.approvalDueDate) : null;
    const done = await writes.saveTransition({ project, state: current, next, comment: panel.comment, approvalDueDate: due });
    if (done !== null) { setPanelForm(null); setSelectedClusterId(null); }
  };

  const requestCaption = panel ? requestApprovalCaption(panel, next) : "";
  const dateRow = rows.find((r) => r.id === dateRowId) ?? null;
  const loadError = projectQ.error ?? sequenceQ.error ?? checklistQ.error;

  if (loadError) {
    return (
      <div className={s.page} data-testid="Project General CheckList Screen">
        <EmptyState title={SCREEN_TEXT.loadFailedTitle} description={SCREEN_TEXT.loadFailedDescription} />
      </div>
    );
  }

  return (
    <div className={s.page} data-testid="Project General CheckList Screen">

      <WriteFeedback progress={writes.progress} error={writes.error} success={writes.success} testIdPrefix="checklist" />

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
        onSelect={setSelectedClusterId}
        refresh={{ onClick: refreshAll, disabled: refreshDisabled }}
      />

      {/* `con_Checklist_DisplayProject_Body_Content_Buttons` */}
      <ClusterActions
        cancelApprovalVisible={clusterPanel !== null && showCancelApproval(clusterPanel)}
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
        info={!locked && current && next && !nextEnabled ? (terminalProject ? UI.infoTerminal : UI.infoWaiting) : null}
        terminals={terminalButtons}
      />

      {technologySupported ? (
        <div className={s.titleRow}>
          <Tooltip content={checklistTitleTooltip(tracking)} relationship="description" withArrow>
            <Text className={s.title} data-testid="lbl_Checklist_DisplayProject_Body_Content_Title">
              {checklistTableTitle(current?.name ?? null)}
            </Text>
          </Tooltip>
        </div>
      ) : (
        <div className={s.tip} data-testid="con_Checklist_DisplayProject_Body_Content_Technology_Warning">
          <Text>{UI.technologyTip}</Text>
        </div>
      )}

      {technologySupported ? (
        <div className={s.scroll}>
          <Table size="small" className={mergeClasses(s.table, !showHolding && s.tableHoldingHidden)} aria-label={checklistTableTitle(current?.name ?? null)} data-testid="gal_Checklist_DisplayProject_Body_General_Content">
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
                        onClick={() => setShowHolding((v) => !v)} />
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
              {rows.map((row) => {
                const ra = rowApproval(settings, row);
                const label = ra.label;
                const cancelVisible = showCancelApprovalIcon(label);
                const holding = truncateHolding(row.holdingDescription);
                const personaTip = checklistPersonaTooltip(ra.first, ra.iconVisible);
                const disabledRow = locked || busy;
                const completeButton = (
                  <Button size="small" appearance="secondary" aria-label={label}
                    className={mergeClasses(s.rowButton, rowCompleteHighlighted(row, label) && s.completeDone)}
                    data-testid="but_Checklist_DisplayProject_Body_Content_ListRow_Complete"
                    disabled={disabledRow || !rowActionEnabled(row, label, cancelVisible)}
                    onClick={() => onRowAction(row)}>
                    {label}
                  </Button>
                );
                return (
                  <Fragment key={row.id}>
                    <TableRow className={s.bodyRow} data-testid="con_Checklist_DisplayProject_Body_Content_ListRow">
                      <TableCell className={s.colGate} title={taskStateLabel(row.taskState)}>{gateRelevanceLabel(row.gateRelevance)}</TableCell>
                      <TableCell title={row.title}><span className={s.clip}>{row.title}</span></TableCell>
                      <TableCell title={showHolding ? holding : undefined}>{showHolding ? <span className={s.clip}>{holding}</span> : null}</TableCell>
                      <TableCell>
                        {/* `con_…_ListRow_Container_CompletionDate`: the Edit button, then `Text(…, "ddd, mmm. dd, yyyy")`. */}
                        {row.isCompletionDate ? (
                          <span className={s.dateCell}>
                            <Button appearance="transparent" size="small" icon={<EditRegular />}
                              aria-label="but_Checklist_DisplayProject_Body_Content_ListRow_CompletionDate"
                              data-testid="but_Checklist_DisplayProject_Body_Content_ListRow_CompletionDate"
                              disabled={disabledRow} onClick={() => setDateRowId(row.id)} />
                            <Text size={200} title={taskStateLabel(row.taskState)}>{fmtCanvasDate(row.completionDate)}</Text>
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
                            <Button size="small" appearance="secondary" aria-label={UI.inProgress}
                              className={mergeClasses(s.rowButton, row.taskState === CHOICE_PROCESS.taskState.inProgress && s.inProgressOn)}
                              aria-pressed={row.taskState === CHOICE_PROCESS.taskState.inProgress}
                              data-testid="but_Checklist_DisplayProject_Body_Content_ListRow_InProgress"
                              disabled={disabledRow}
                              onClick={() => void writes.patchRow(row, inProgressTogglePatch(row), {
                                progress: MSG.taskChanging(row.title), success: MSG.taskChanged, error: MSG.taskError,
                              })}>
                              {UI.inProgress}
                            </Button>
                          ) : (
                            <Button size="small" appearance="transparent" aria-label={UI.history}
                              className={mergeClasses(s.rowButton, s.historyButton)}
                              data-testid="but_Checklist_DisplayProject_Body_Content_ListRow_History"
                              disabled={disabledRow} onClick={() => openPanel({ kind: "checklist", row })}>
                              {UI.history}
                            </Button>
                          )}
                          {cancelVisible ? (
                            <Button appearance="transparent" size="small" className={s.cancelIcon} icon={<DismissRegular />}
                              aria-label="ico_Checklist_DisplayProject_Body_Content_ListRow_CancelApproval"
                              disabled title={EXCLUDED.cancelChecklistApproval}
                              data-testid="ico_Checklist_DisplayProject_Body_Content_ListRow_CancelApproval" />
                          ) : null}
                          {personaTip ? (
                            <Tooltip content={<span className={s.preLine}>{lines(personaTip)}</span>} relationship="description" withArrow>
                              {completeButton}
                            </Tooltip>
                          ) : completeButton}
                          {/* `ico_…_ListRow_Comments` — opens the comment form; its tooltip is the note. */}
                          <Tooltip content={row.note ?? ""} relationship="description" withArrow>
                            <Button appearance="transparent" size="small" icon={<NoteRegular />}
                              className={mergeClasses(s.noteIcon, rowHasNote(row) ? s.notePresent : s.noteAbsent)}
                              aria-label="ico_Checklist_DisplayProject_Body_Content_ListRow_Comments"
                              data-testid="ico_Checklist_DisplayProject_Body_Content_ListRow_Comments"
                              disabled={disabledRow}
                              onClick={() => setCommentForm({ row, text: row.note ?? "" })} />
                          </Tooltip>
                        </span>
                      </TableCell>
                    </TableRow>
                    {dateRow?.id === row.id ? (
                      <TableRow>
                        <TableCell colSpan={5}>
                          <span className={s.datePicker} data-testid="date_con_Checklist_DisplayProject_Body_Content_CompletionDate">
                            {/*
                              * `SelectedDate`: the stored date, or today (`Now()`). `DatePicker@0.0.46`,
                              * `Format: 'DatePickerCanvas.Format'.LongAbbreviated`, no `IsEditable`.
                              */}
                            <DateField
                              label={UI.header.completionDate}
                              name={ARIA.completionDate}
                              format={DATE_PICKER_FORMAT}
                              locale={locale}
                              allowTextInput={false}
                              value={toYmd(row.completionDate ?? new Date().toISOString())} disabled={busy}
                                onChange={(v) => {
                                  const iso = ymdToLocalIso(v ?? "");
                                  if (!iso) return;
                                  const shown = new Intl.DateTimeFormat(locale).format(new Date(iso));
                                  setDateRowId(null);
                                  void writes.patchRow(row, completionDatePatch(iso), {
                                    progress: MSG.completionDateChanging(shown, row.title),
                                    success: MSG.completionDateChanged(shown),
                                    error: MSG.completionDateError,
                                  });
                                }} />
                            <Button aria-label="but_Checklist_DisplayProject_Body_Content_CompletionDate_Cancel" onClick={() => setDateRowId(null)}
                              data-testid="but_Checklist_DisplayProject_Body_Content_CompletionDate_Cancel">
                              {UI.cancel}
                            </Button>
                          </span>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {/*
        * `con_CheckList_RightPanel_ChangeCluster_Form` — cluster transition or checklist completion.
        * Its context is `(Parent.Width / 4) * 3` wide from X = `Parent.Width / 2`, i.e. the right half.
        */}
      <FormPanel
        open={panel !== null}
        title={panel ? rightPanelTitle(panel, next) : ""}
        width="wide"
        onDismiss={closePanel}
        footer={panel ? (
          <>
            {showRequestApproval(panel) && requestCaption ? (
              <Button appearance="primary" aria-label={ARIA.requestApproval}
                data-testid="pcf_CheckList_RightPanel_ChangeCluster_Form_Buttons_RequestApproval"
                disabled title={EXCLUDED.requestApproval}>
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
              <TextAreaField
                label={UI.comment}
                ariaLabel={ARIA.comment}
                value={panel.comment}
                required={commentAsteriskVisible(project)}
                error={commentError(panel.comment) ?? undefined}
                maxLength={COMMENT_MAX_LENGTH}
                disabled={busy || commentReadOnly(panel)}
                testId="txt_GeneralData_RightPanel_ProjectState_InpForm_Comment_1"
                onChange={(v) => setPanelForm((f) => (f ? { ...f, comment: v } : f))}
              />
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
              <table className={s.noteTable} aria-label={UI.history} data-testid="html_CheckList_RightPanel_ChangeCluster_Form_History">
                <thead>
                  <tr>{TASK_TABLE_HEADERS.map((h) => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {taskTableRows(rows).map((r, i) => (
                    <tr key={`${r.name}-${i}`}>
                      <td>{r.relevance}</td><td title={r.name}>{r.name}</td><td>{r.clusterstate}</td>
                      <td>{r.taskstate}</td><td title={r.editor}>{r.editor}</td><td>{r.editdate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {/* `gal_…_Inputs_History`: per note, the header row, a themePrimary rule, the note's table. */}
            {historyQ.data.map((e) => {
              const note = parseNoteHtml(e.note);
              const [head, ...body] = note.table ?? [];
              return (
                <div key={e.id} className={s.historyEntry}>
                  <div className={s.entryHead}>
                    <span className={s.entryLabel}>{UI.commentPrefix}</span>
                    <span className={s.entryComment} title={e.comment ?? e.name ?? ""}>{e.comment ?? e.name ?? ""}</span>
                    <span className={s.entryDate}>{fmtCanvasDate(e.createdOn, true)}</span>
                    <span className={s.entryUser} title={e.modifiedByName ?? ""}>{e.modifiedByName ?? ""}</span>
                  </div>
                  <div className={s.entryRule} />
                  {head ? (
                    // `parseNoteHtml` returns the header row first.
                    <table className={s.noteTable} aria-label={UI.commentPrefix}>
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
        ) : null}
      </FormPanel>

      {/* `con_CheckList_RightPanel_Comment_Form` */}
      <FormPanel
        open={commentForm !== null}
        title={UI.commentFormTitle}
        width="narrow"
        onDismiss={() => setCommentForm(null)}
        footer={<PanelButtons
          onSave={() => {
            if (!commentForm) return;
            const { row, text } = commentForm;
            setCommentForm(null);
            void writes.patchRow(row, commentPatch(text), {
              progress: MSG.taskChanging(row.title), success: MSG.taskChanged, error: MSG.taskError,
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
          maxLength={COMMENT_MAX_LENGTH}
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
        onConfirm={() => {
          setConfirmReturn(false);
          if (project && current && previous) {
            void writes.returnToPrevious({ project, state: current, previous }).then(() => setSelectedClusterId(null));
          }
        }}
        onCancel={() => setConfirmReturn(false)}
      />

      {/* `cmp_PopUp_CheckList_GeneralData_Information` */}
      <Dialog open={info !== null} onOpenChange={(_, d) => { if (!d.open) setInfo(null); }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{UI.completionDateTitle}</DialogTitle>
            <DialogContent>{info}</DialogContent>
            <DialogActions>
              <Button appearance="primary" aria-label={UI.ok} data-testid="pcf_PopUpInformation_BodyButtons_Ok"
                onClick={() => setInfo(null)}>{UI.ok}</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
