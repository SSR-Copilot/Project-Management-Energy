/**
 * Project General CheckList Screen — layout and composition only.
 *
 * Canvas screen: `Project General CheckList Screen` (PM app)
 *   141 controls · 5 606 lines of Power Fx · 66 substantive blocks · band L
 *
 * A cluster stepper across the top, the selected cluster's checklist below it, and a
 * right panel that serves both a single checklist row and the cluster transition itself.
 *
 * WHAT WAS DELETED AS A WORKAROUND (see rules.ts for the full list)
 *  - the two hidden dispatch `ModernButton`s and the refresh button that re-queried
 *    `'Project State Trackings'` five times per visit
 *  - `but_…_ApplyDefaultChecklist` and `pcf_…_Buttons_Return`, both `Visible: =false`
 *  - `cmp_CheckList_Project_States.RefreshButtonVisibility`, a developer-only control
 *  - the `ForAll(Sequence(...))` RowNumber idiom, three times over
 *
 * Every rule this screen branches on lives in `rules.ts`.
 */
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Field, Input, Textarea, Text, Badge, Button, Tooltip, MessageBar, MessageBarBody,
  MessageBarTitle, makeStyles, mergeClasses, tokens,
  Dialog, DialogSurface, DialogTitle, DialogBody, DialogContent, DialogActions,
} from "@fluentui/react-components";
import {
  CheckmarkRegular, PlayRegular, MailRegular, PeopleRegular, DismissCircleRegular,
  ArrowForwardRegular, LockClosedRegular, SubtractCircleRegular,
  HistoryRegular, FlashRegular, ArrowClockwiseRegular, EditRegular, DismissRegular,
} from "@fluentui/react-icons";
import {
  PageHeader, Card, CommandBar, FormPanel, ConfirmDialog, LoadingOverlay, DataGrid,
  StateChip, EmptyState, StatTiles, type Command, type Column,
} from "@/components";
import { useProjectContext } from "@/features/shared/useProjectContext";
import { space, media, palette, semantic, radius, stateColor } from "@/theme/tokens";
import { formatDate } from "@/domain/dates";
import {
  buildOperationalSequence, buildDisplaySequence, previousState, nextState,
  defaultSelectedCluster, trackingFor, activeGateFor, approvalSettingIndex, settingForRow,
  rowApprovalIcon, rowActionLabel, rowActionEnabled, showCancelApprovalIcon,
  canToggleInProgress, completionDateBlocksComplete, COMPLETION_DATE_MESSAGE,
  inProgressTogglePatch, completeTaskPatch, completionDatePatch,
  nextClusterCaption, nextClusterIcon, nextClusterEnabled, nextClusterActionKind,
  stageTerminalToggle, terminalButtonVisible, projectIsTerminal,
  pageLock, PAGE_LOCK_TITLE, isPageLocked,
  showSave, canSavePanel, showRequestApproval, canRequestApproval, showCancelApproval,
  canCancelApproval, showApprovalDueDate, commentError, commentReadOnly,
  commentAsteriskVisible, COMMENT_MAX_LENGTH, approvalStateLabel, taskStateLabel,
  personaTooltip, startClusterNo,
  checklistTableTitle, gateRelevanceLabel, stepVisualStatus, stepConnectorLit,
  clusterMovementTitle, clusterStepStateLabel,
  type ChecklistRow, type PanelState, type PanelTarget, type SequenceEntry,
  type TerminalStaging, type TerminalKind, type GateSetting,
} from "./rules";
import {
  useChecklistProject, useClusterSequence, useClusterChecklist,
  useChecklistApprovalSettings, useDefaultChecklistTemplates, useHistory,
  useSkippedClusterBackfill, useEnsureTracking, useChecklistMaterialisation,
  usePatchChecklistRow, useClusterTransition, useTerminalState,
  useRequestChecklistApproval, useRequestGateApproval,
  useCancelChecklistApproval, useCancelGateApproval, useChecklistCountryName,
} from "./hooks";

const useStyles = makeStyles({
  /* GUIDE q18/q19 — a node-and-connector stepper, not the bordered tab cards this
     screen used before the recording existed. */
  stepper: {
    display: "flex", alignItems: "flex-start", gap: "2px", overflowX: "auto",
    paddingBottom: space.xs,
    [media.belowMd]: { gap: "1px" },
  },
  step: {
    flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center",
    gap: "4px", padding: space.xs, minWidth: "108px", cursor: "pointer",
    borderRadius: radius.md,
  },
  stepSelected: { backgroundColor: tokens.colorBrandBackground2 },
  stepSkipped: { opacity: 0.55 },
  stepNode: {
    width: "32px", height: "32px", borderRadius: "50%",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "#fff", fontSize: "16px",
    borderTopWidth: "1px", borderRightWidth: "1px",
    borderBottomWidth: "1px", borderLeftWidth: "1px",
    borderTopStyle: "solid", borderRightStyle: "solid",
    borderBottomStyle: "solid", borderLeftStyle: "solid",
    borderTopColor: "transparent", borderRightColor: "transparent",
    borderBottomColor: "transparent", borderLeftColor: "transparent",
  },
  stepNodeCompleted: { backgroundColor: palette.Success },
  stepNodeInProgress: {
    backgroundColor: palette.SuccessLight, color: palette.Success,
    borderTopColor: palette.Success, borderRightColor: palette.Success,
    borderBottomColor: palette.Success, borderLeftColor: palette.Success,
  },
  stepNodeNotStarted: {
    backgroundColor: tokens.colorNeutralBackground3, color: tokens.colorNeutralForeground3,
  },
  stepConnector: {
    flex: "0 0 auto", width: "28px", height: "32px", marginTop: space.xs,
    display: "flex", alignItems: "center", justifyContent: "center",
    color: tokens.colorNeutralStroke2,
    [media.belowMd]: { width: "16px" },
  },
  stepConnectorLit: { color: palette.Success },
  stepName: { fontSize: "13px", fontWeight: 600, textAlign: "center" },
  stepState: { fontSize: "11px", color: tokens.colorNeutralForeground3, textAlign: "center" },
  rowActions: { display: "flex", gap: space.xs, alignItems: "center", flexWrap: "wrap" },
  panel: { display: "flex", flexDirection: "column", gap: space.m },
  counter: {
    fontSize: "11px", color: tokens.colorNeutralForeground3, textAlign: "right",
    fontVariantNumeric: "tabular-nums",
  },
  lock: { display: "flex", flexDirection: "column", gap: space.xs },
  bullet: { display: "flex", gap: space.s, alignItems: "baseline" },
  hint: { color: tokens.colorNeutralForeground3, fontSize: "12px" },
  history: {
    display: "flex", flexDirection: "column", gap: space.s, maxHeight: "260px",
    overflowY: "auto",
  },
  historyItem: {
    display: "flex", flexDirection: "column", gap: "2px", fontSize: "12px",
    paddingBottom: space.xs,
    borderBottomWidth: "1px", borderBottomStyle: "solid",
    borderBottomColor: tokens.colorNeutralStroke2,
  },
  personas: { display: "flex", flexDirection: "column", gap: "2px", fontSize: "12px" },
  errors: {
    display: "flex", flexDirection: "column", gap: "2px",
    color: semantic.errorText, fontSize: "12px",
  },
  approversPopover: {
    display: "flex", flexDirection: "column", gap: "2px", fontSize: "12px",
    padding: space.xs,
  },
  /* GUIDE q20 — the "Cluster Movement to {next}" read-only history dialog. */
  movementSurface: { maxWidth: "min(760px, calc(100vw - 48px))" },
  movementHeader: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
  },
  movementBody: {
    display: "flex", flexDirection: "column", gap: space.m,
    maxHeight: "60vh", overflowY: "auto",
  },
  movementEntry: {
    display: "flex", flexDirection: "column", gap: space.xs,
    paddingBottom: space.m,
    borderBottomWidth: "1px", borderBottomStyle: "solid",
    borderBottomColor: tokens.colorNeutralStroke2,
  },
  movementCommentRow: {
    display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: space.s,
    flexWrap: "wrap",
  },
  movementTableWrap: { overflowX: "auto" },
  movementTable: {
    width: "100%", borderCollapse: "collapse", fontSize: "12px",
  },
  movementTh: {
    textAlign: "left", padding: `${space.xs} ${space.s}`,
    color: tokens.colorNeutralForeground3, fontWeight: 600,
    borderBottomWidth: "1px", borderBottomStyle: "solid",
    borderBottomColor: tokens.colorNeutralStroke2,
  },
  movementTd: {
    padding: `${space.xs} ${space.s}`,
    borderBottomWidth: "1px", borderBottomStyle: "solid",
    borderBottomColor: tokens.colorNeutralStroke2,
  },
});

export default function CheckListScreen() {
  const s = useStyles();
  const { project: selected, canEdit, isLoading: contextLoading } = useProjectContext();
  const projectId = selected?.projectId;

  const { project, isLoading: projectLoading } = useChecklistProject(projectId);
  const sequence = useClusterSequence(project);

  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [terminal, setTerminal] = useState<TerminalStaging | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  /* GUIDE q20 — "View {next} Request History" opens this read-only dialog instead of the
     editable Cluster Transition panel. */
  const [movementOpen, setMovementOpen] = useState(false);

  const backfill = useSkippedClusterBackfill();
  const ensureTracking = useEnsureTracking();
  const materialise = useChecklistMaterialisation();
  const patchRow = usePatchChecklistRow();
  const transition = useClusterTransition();
  const terminalState = useTerminalState();
  const requestChecklistApproval = useRequestChecklistApproval();
  const requestGateApproval = useRequestGateApproval();
  const cancelChecklistApproval = useCancelChecklistApproval();
  const cancelGate = useCancelGateApproval();

  const startCluster = startClusterNo(project);

  const operational = useMemo(
    () => buildOperationalSequence(sequence.states, startCluster, sequence.gates),
    [sequence.states, sequence.gates, startCluster],
  );
  const display = useMemo(
    () => buildDisplaySequence(sequence.states, startCluster, sequence.gates),
    [sequence.states, sequence.gates, startCluster],
  );

  /* Rule 9 — the default selection is the first In Progress cluster. */
  const defaultSelection = useMemo(
    () => defaultSelectedCluster(operational, sequence.trackings),
    [operational, sequence.trackings],
  );
  const current: SequenceEntry | null =
    operational.find((x) => x.id === selectedClusterId) ?? defaultSelection;

  const tracking = trackingFor(sequence.trackings, current?.id ?? null);
  const gate = activeGateFor(sequence.gates, current?.id ?? null);
  const previous = previousState(operational, current?.id ?? null);
  const next = nextState(operational, current?.id ?? null);
  const previousTracking = trackingFor(sequence.trackings, previous?.id ?? null);
  const nextTracking = trackingFor(sequence.trackings, next?.id ?? null);

  const checklist = useClusterChecklist(projectId, current?.id ?? null);
  const approvals = useChecklistApprovalSettings(current?.id ?? null);
  const templates = useDefaultChecklistTemplates(project, current?.id ?? null);
  const history = useHistory(showHistory ? panel : null);
  const countryName = useChecklistCountryName(project?.countryId);

  /* GUIDE q20 — the movement dialog's own history query, scoped to the CURRENT cluster's
     tracking row (the same row the "View … Request History" caption is computed from). */
  const movementPanel: PanelState | null = useMemo(
    () => (current
      ? { target: { kind: "cluster", state: current, tracking, gate }, comment: "", approvalDueDate: null }
      : null),
    [current, tracking, gate],
  );
  const movementHistory = useHistory(movementOpen ? movementPanel : null);

  const settingIndex = useMemo(
    () => approvalSettingIndex(approvals.settings),
    [approvals.settings],
  );

  const abandonedState = sequence.states.find((x) => x.name === "Abandoned") ?? null;
  const inactiveState = sequence.states.find((x) => x.name === "Inactive/ On-hold") ?? null;

  const locked = isPageLocked(project);
  const terminalProject = projectIsTerminal(
    project, abandonedState?.id ?? null, inactiveState?.id ?? null,
  );

  /* Rules 3–5 — the skipped-cluster back-fill, guarded exactly as OnVisible guards it. */
  useEffect(() => {
    if (!project || sequence.isLoading || sequence.states.length === 0) return;
    if (backfill.isPending || backfill.isSuccess) return;
    backfill.mutate({
      project, states: sequence.states, trackings: sequence.trackings, canEdit,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, sequence.isLoading, sequence.states.length]);

  /* Rule 10 — a selected cluster with no tracking row gets one. */
  useEffect(() => {
    if (!project || !current || sequence.isLoading || tracking) return;
    if (ensureTracking.isPending) return;
    ensureTracking.mutate({ project, selected: current, tracking, canEdit });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, current?.id, tracking, sequence.isLoading]);

  /* Rule 11 — materialise the cluster's checklist from the defaults. */
  useEffect(() => {
    if (!project || !current || checklist.isLoading || templates.isLoading) return;
    if (materialise.isPending) return;
    materialise.mutate({
      project,
      clusterStateId: current.id,
      tracking,
      templates: templates.templates,
      existingRowCount: checklist.rows.length,
      canEdit,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, current?.id, checklist.isLoading, templates.isLoading,
      checklist.rows.length, templates.templates.length]);

  /* ─────────────────────────────────────────────────────────── loading / gates */

  if (contextLoading || projectLoading || sequence.isLoading) {
    return <LoadingOverlay mode="inline" label="Loading the cluster checklist…" />;
  }

  if (!project) {
    return (
      <>
        <Header project={null} />
        <EmptyState
          title="No project loaded"
          description="This screen works on one project at a time. Pick a project from the portfolio to continue."
        />
      </>
    );
  }

  if (sequence.isError) {
    return (
      <>
        <Header project={project} />
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>The cluster sequence could not be loaded</MessageBarTitle>
            {sequence.error?.message ?? "Unexpected error."}
          </MessageBarBody>
        </MessageBar>
      </>
    );
  }

  if (operational.length === 0) {
    return (
      <>
        <Header project={project} />
        <EmptyState
          title="No checklist clusters are configured"
          description="No Project States row is marked “Is Visible On Checklist”. An administrator has to configure the cluster sequence before this screen can do anything."
        />
      </>
    );
  }

  const lockEntries = pageLock(project);

  /* ───────────────────────────────────────────────────────────── the checklist */

  const openChecklistPanel = (row: ChecklistRow) => {
    const setting = settingForRow(settingIndex, row);
    const target: PanelTarget = { kind: "checklist", row, setting };
    setPanel({
      target, comment: "", approvalDueDate: null,
      hasChecklistApprovalEntry: setting !== null,
    });
    setShowHistory(false);
  };

  const openClusterPanel = () => {
    if (!current) return;
    const target: PanelTarget = { kind: "cluster", state: current, tracking, gate };
    setPanel({
      target,
      comment: tracking?.approvalComment ?? "",
      approvalDueDate: tracking?.approvalDueDate ?? null,
    });
    setShowHistory(false);
  };

  const onRowAction = (row: ChecklistRow) => {
    // Rule 16 — a completion-date task cannot be completed until the date is set.
    if (completionDateBlocksComplete(row)) {
      setInfoMessage(COMPLETION_DATE_MESSAGE);
      return;
    }
    const setting = settingForRow(settingIndex, row);
    // Rule 15 — no approval mode means a plain patch; otherwise the panel opens.
    if (rowApprovalIcon(setting) === null) {
      if (!current) return;
      patchRow.mutate({
        projectId: project.id, clusterStateId: current.id, row,
        data: completeTaskPatch(), canEdit,
      });
      return;
    }
    openChecklistPanel(row);
  };

  const columns: Column<ChecklistRow>[] = [
    {
      // GUIDE q18/q19 — "Gate Relevance" is the literal Yes / No the recording shows,
      // not the "Gate relevant" badge this column rendered before the recording existed.
      key: "gateRelevance", header: "Gate Relevance", width: "108px",
      value: (row) => gateRelevanceLabel(row.gateRelevance),
    },
    {
      // GUIDE q18/q19 — header renamed from "Task" to the recording's "Holding
      // Description"; the cell keeps its title + holding-description pairing.
      key: "title", header: "Holding Description", width: "minmax(200px, 2fr)",
      render: (row) => (
        <div>
          <div>{row.title}</div>
          {row.holdingDescription && (
            <div className={s.hint}>{row.holdingDescription}</div>
          )}
        </div>
      ),
    },
    {
      // GUIDE q18/q19 — "Country Description". `Project Checklists` carries no per-row
      // country column; this is the project's own country (`useChecklistCountryName`),
      // the same for every row, which is what the recording's identical value per row
      // is consistent with.
      key: "country", header: "Country Description", hideBelow: "lg",
      value: () => countryName ?? "—",
    },
    {
      key: "completion", header: "Completion Date", hideBelow: "md",
      render: (row) => row.isCompletionDate
        ? (
          <Input
            size="small"
            type="date"
            contentBefore={<EditRegular fontSize={14} />}
            disabled={!canEdit || locked}
            value={(row.completionDate ?? "").slice(0, 10)}
            onChange={(_, d) => current && patchRow.mutate({
              projectId: project.id, clusterStateId: current.id, row,
              data: completionDatePatch(d.value || null), canEdit,
            })}
          />
        )
        : <span className={s.hint}>—</span>,
    },
    {
      // GUIDE q18/q19 — one "Status" chip replaces the separate Task state / Approval
      // text columns this screen used before the recording existed.
      key: "status", header: "Status",
      render: (row) => <StateChip state={taskStateLabel(row.taskState)} />,
    },
    {
      key: "actions", header: "", width: "minmax(190px, auto)",
      render: (row) => {
        const setting = settingForRow(settingIndex, row);
        const icon = rowApprovalIcon(setting);
        const label = rowActionLabel(row, setting);
        return (
          <div className={s.rowActions}>
            {icon === "Mail" && (
              <Tooltip withArrow relationship="label" content="Notifications only">
                <MailRegular />
              </Tooltip>
            )}
            {icon === "People" && (
              <Tooltip withArrow relationship="label" content="Needs an approval">
                <PeopleRegular />
              </Tooltip>
            )}
            {/* Rule 17 — the In Progress toggle, hidden while a cancel icon shows. */}
            {canToggleInProgress(label) && (
              <Tooltip withArrow relationship="label" content="Toggle In Progress">
                <Button
                  size="small"
                  appearance="subtle"
                  icon={<PlayRegular />}
                  disabled={!canEdit || locked}
                  onClick={() => current && patchRow.mutate({
                    projectId: project.id, clusterStateId: current.id, row,
                    data: inProgressTogglePatch(row), canEdit,
                  })}
                />
              </Tooltip>
            )}
            <Button
              size="small"
              appearance={label === "Approved" ? "subtle" : "secondary"}
              icon={<CheckmarkRegular />}
              disabled={!canEdit || locked || !rowActionEnabled(row, label)}
              onClick={() => onRowAction(row)}
            >
              {label}
            </Button>
            {showCancelApprovalIcon(label) && (
              <Tooltip withArrow relationship="label" content="Cancel the approval request">
                <Button
                  size="small"
                  appearance="subtle"
                  icon={<DismissCircleRegular />}
                  disabled={!canEdit || locked || cancelChecklistApproval.isPending}
                  onClick={() => current && cancelChecklistApproval.mutate({
                    projectId: project.id, clusterStateId: current.id,
                    checklistId: row.id, canEdit,
                  })}
                />
              </Tooltip>
            )}
          </div>
        );
      },
    },
  ];

  const gateRelevant = checklist.rows.filter((r) => r.gateRelevance);
  const gateRelevantDone = gateRelevant.filter(
    (r) => taskStateLabel(r.taskState) === "Completed",
  );

  // GUIDE q18/q19 — "View {next} Request History" (the flash-icon primary button) opens
  // the read-only "Cluster Movement to {next}" dialog; every other caption still opens
  // the editable Cluster Transition panel.
  const nextActionKind = nextClusterActionKind({ tracking });

  const commands: Command[] = [
    {
      key: "next",
      label: current
        ? nextClusterCaption({ tracking, state: current, next, gate })
        : "Move on",
      icon: nextActionKind === "history"
        ? <FlashRegular />
        : current && nextClusterIcon(current, gate) === "TriggerApproval"
          ? <ArrowForwardRegular /> : <CheckmarkRegular />,
      primary: true,
      disabled: !canEdit || !nextClusterEnabled({
        locked, projectIsTerminal: terminalProject, tracking, previous, previousTracking,
      }),
      disabledReason: locked
        ? "This page is locked."
        : terminalProject
          ? "The project is abandoned or on hold."
          : !canEdit
            ? "You do not have permission to edit this project."
            : "The previous cluster is not complete yet, or an approval is already running.",
      onClick: () => (nextActionKind === "history" ? setMovementOpen(true) : openClusterPanel()),
    },
    ...(["abandon", "inactivate"] as TerminalKind[])
      .filter((kind) => terminalButtonVisible({
        kind, project, previous, previousTracking,
        abandonedStateId: abandonedState?.id ?? null,
        inactiveStateId: inactiveState?.id ?? null,
      }))
      .map((kind): Command => {
        const staging = stageTerminalToggle({
          kind, project, currentTracking: tracking, abandonedState, inactiveState,
        });
        return {
          key: kind,
          label: staging.label,
          // GUIDE q18/q19 — "⊖ Abandon" and "🔒 Inactivate/ Place On-hold": a
          // subtract-circle icon and a padlock, not the prohibited/pause pair this
          // screen used before the recording existed.
          icon: kind === "abandon" ? <SubtractCircleRegular /> : <LockClosedRegular />,
          danger: staging.label !== "Activate",
          disabled: !canEdit || locked,
          disabledReason: locked
            ? "This page is locked."
            : "You do not have permission to edit this project.",
          onClick: () => setTerminal(staging),
        };
      }),
  ];

  return (
    <>
      <Header project={project} />

      <StatTiles
        stats={[
          {
            label: "Current cluster", value: current?.name ?? "—",
            note: `start cluster ${startCluster}`,
          },
          {
            label: "Cluster state",
            value: approvalStateLabel(tracking?.approvalClusterState),
            accent: stateColor[approvalStateLabel(tracking?.approvalClusterState)],
            note: gate ? "gated" : "no gate",
          },
          {
            label: "Gate-relevant tasks",
            value: `${gateRelevantDone.length} / ${gateRelevant.length}`,
            accent: gateRelevant.length && gateRelevantDone.length === gateRelevant.length
              ? palette.Success : palette.Warning,
            note: "completed",
          },
          {
            label: "Checklist tasks", value: String(checklist.rows.length),
            note: current?.clusterDescription ?? "in this cluster",
          },
        ]}
      />

      {locked && lockEntries.length > 0 && (
        <MessageBar intent="warning">
          <MessageBarBody>
            <MessageBarTitle>{PAGE_LOCK_TITLE}</MessageBarTitle>
            <span className={s.lock}>
              {lockEntries.map((e) => (
                <span key={e.reason} className={s.bullet}>
                  <span>{e.label}</span>
                  <span className={s.hint}>{e.hint}</span>
                </span>
              ))}
            </span>
          </MessageBarBody>
        </MessageBar>
      )}
      {!canEdit && (
        <MessageBar intent="warning">
          <MessageBarBody>
            You can read this project but not change it. Every action is disabled.
          </MessageBarBody>
        </MessageBar>
      )}
      {backfill.data?.plan.writes.length ? (
        <MessageBar intent="info">
          <MessageBarBody>
            <MessageBarTitle>Skipped clusters were completed automatically</MessageBarTitle>
            {backfill.data.plan.log.join(" · ")}
          </MessageBarBody>
        </MessageBar>
      ) : null}
      {transition.isError && (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>The cluster transition failed</MessageBarTitle>
            {transition.error instanceof Error
              ? transition.error.message : "Unexpected error."}
          </MessageBarBody>
        </MessageBar>
      )}
      {cancelChecklistApproval.isError && (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>The approval could not be cancelled</MessageBarTitle>
            {cancelChecklistApproval.error instanceof Error
              ? cancelChecklistApproval.error.message : "Unexpected error."}
          </MessageBarBody>
        </MessageBar>
      )}

      {/* GUIDE q18/q19 — Rule 6's DISPLAY sequence, redrawn as the recording's node +
          envelope-connector stepper. Skipped clusters stay muted. */}
      <Card title="Clusters">
        <div className={s.stepper} role="tablist" aria-label="Project clusters">
          {display.map((step, i) => {
            const t = trackingFor(sequence.trackings, step.id);
            const isSelected = step.id === current?.id;
            const inOperational = operational.some((o) => o.id === step.id);
            const label = step.isSkippedDisplayOnly
              ? "skipped — starts later"
              : approvalStateLabel(t?.approvalClusterState);
            const status = stepVisualStatus(label);
            const stepGate: GateSetting | null = step.hasGate
              ? activeGateFor(sequence.gates, step.id) : null;
            // GUIDE q18 — the Approvers/Notifications popover the recording shows on
            // hover over a gated node that has not completed yet.
            const showPopover = stepGate !== null && status !== "completed";
            const persona = showPopover ? personaTooltip(stepGate) : null;
            const node = (
              <div
                key={step.id}
                role="tab"
                aria-selected={isSelected}
                tabIndex={0}
                className={mergeClasses(
                  s.step,
                  isSelected && s.stepSelected,
                  step.isSkippedDisplayOnly && s.stepSkipped,
                )}
                onClick={() => inOperational && setSelectedClusterId(step.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && inOperational) setSelectedClusterId(step.id);
                }}
              >
                <span
                  className={mergeClasses(
                    s.stepNode,
                    status === "completed" && s.stepNodeCompleted,
                    status === "inProgress" && s.stepNodeInProgress,
                    status === "notStarted" && s.stepNodeNotStarted,
                  )}
                >
                  {status === "completed" && <CheckmarkRegular />}
                </span>
                <span className={s.stepName}>{step.name}</span>
                <span className={s.stepState}>{label}</span>
              </div>
            );
            return (
              <Fragment key={step.id}>
                {i > 0 && (
                  <span
                    className={mergeClasses(
                      s.stepConnector,
                      stepConnectorLit(stepVisualStatus(
                        display[i - 1].isSkippedDisplayOnly
                          ? "skipped"
                          : approvalStateLabel(
                            trackingFor(sequence.trackings, display[i - 1].id)
                              ?.approvalClusterState,
                          ),
                      )) && s.stepConnectorLit,
                    )}
                    aria-hidden
                  >
                    <MailRegular />
                  </span>
                )}
                {showPopover && persona ? (
                  <Tooltip
                    withArrow
                    relationship="description"
                    content={
                      <div className={s.approversPopover}>
                        <div><strong>Approvers: </strong>{persona.approvers.join(", ") || "—"}</div>
                        <div>
                          <strong>Notifications: </strong>
                          {persona.notifications.join(", ") || "—"}
                        </div>
                      </div>
                    }
                  >
                    {node}
                  </Tooltip>
                ) : node}
              </Fragment>
            );
          })}
        </div>
      </Card>

      <CommandBar commands={commands} />

      <Card title={checklistTableTitle(current?.name ?? null)}>
        <DataGrid
          rows={checklist.rows}
          columns={columns}
          rowKey={(r) => r.id}
          loading={checklist.isLoading || materialise.isPending}
          emptyMessage={
            templates.templates.length === 0
              ? "No default checklist is configured for this cluster, country and technology."
              : "This cluster has no checklist tasks yet."
          }
        />
      </Card>

      {/* ───────────────────────────────────────────────────────────── the panel */}
      <FormPanel
        open={panel !== null}
        title={panel?.target.kind === "checklist"
          ? panel.target.row.title
          : `${current?.name ?? "Cluster"} → ${next?.name ?? "next cluster"}`}
        saveLabel={panel && showRequestApproval(panel) ? "Request approval" : "Save"}
        busy={transition.isPending || requestGateApproval.isPending
          || requestChecklistApproval.isPending}
        saveDisabled={!panel || !canEdit
          || (showRequestApproval(panel)
            ? !canRequestApproval(panel)
            : !showSave(panel) || !canSavePanel(panel))}
        errors={panel && commentError(panel.comment) ? [commentError(panel.comment)!] : []}
        onClose={() => { setPanel(null); setShowHistory(false); }}
        extraActions={
          <>
            <Button
              appearance="subtle"
              icon={<HistoryRegular />}
              onClick={() => setShowHistory((v) => !v)}
            >
              {showHistory ? "Hide history" : "History"}
            </Button>
            {panel && showCancelApproval(panel) && (
              <Button
                appearance="secondary"
                icon={<DismissCircleRegular />}
                disabled={!canEdit || !canCancelApproval(panel) || cancelGate.isPending}
                onClick={() => {
                  if (!panel || panel.target.kind !== "cluster" || !panel.target.tracking) return;
                  cancelGate.mutate({
                    project, tracking: panel.target.tracking,
                    comment: panel.comment, canEdit,
                  }, { onSuccess: () => setPanel(null) });
                }}
              >
                Cancel approval request
              </Button>
            )}
          </>
        }
        onSave={() => {
          if (!panel || !current) return;
          if (panel.target.kind === "checklist") {
            const setting = panel.target.setting;
            if (showRequestApproval(panel) && setting) {
              requestChecklistApproval.mutate({
                project, clusterStateId: current.id, row: panel.target.row, setting,
                currentProjectStateId: current.id, comment: panel.comment, canEdit,
              }, { onSuccess: () => setPanel(null) });
              return;
            }
            patchRow.mutate({
              projectId: project.id, clusterStateId: current.id, row: panel.target.row,
              data: completeTaskPatch(), canEdit,
            }, { onSuccess: () => setPanel(null) });
            return;
          }
          // Cluster transition: gated clusters request an approval, ungated ones move.
          if (showRequestApproval(panel) && gate && tracking) {
            requestGateApproval.mutate({
              project, state: current, tracking, gate, comment: panel.comment, canEdit,
            }, { onSuccess: () => setPanel(null) });
            return;
          }
          transition.mutate({
            project, state: current, tracking, next, nextTracking,
            comment: panel.comment, approvalDueDate: panel.approvalDueDate, canEdit,
          }, { onSuccess: () => setPanel(null) });
        }}
      >
        {panel && (
          <div className={s.panel}>
            {panel.target.kind === "cluster" && (
              <MessageBar intent={gate ? "info" : "success"}>
                <MessageBarBody>
                  {gate
                    ? `This cluster is gated. ${next ? `Moving to ${next.name}` : "Completing it"} needs an approval.`
                    : `No active gate — ${next ? `moving to ${next.name}` : "completing this cluster"} writes directly and marks the project Approved.`}
                </MessageBarBody>
              </MessageBar>
            )}

            <div>
              <Field
                label="Comment"
                required={commentAsteriskVisible(project)}
                validationState={commentError(panel.comment) ? "error" : "none"}
                validationMessage={commentError(panel.comment) ?? undefined}
              >
                <Textarea
                  resize="vertical"
                  maxLength={COMMENT_MAX_LENGTH}
                  readOnly={commentReadOnly(panel)}
                  disabled={!canEdit}
                  value={panel.comment}
                  onChange={(_, d) => setPanel({ ...panel, comment: d.value })}
                />
              </Field>
              <div className={s.counter}>
                {panel.comment.length}/{COMMENT_MAX_LENGTH}
              </div>
            </div>

            {/* Formal and Local approval modes only. */}
            {showApprovalDueDate(panel) && (
              <Field label="Approval due date">
                <Input
                  type="date"
                  disabled={!canEdit}
                  value={(panel.approvalDueDate ?? "").slice(0, 10)}
                  onChange={(_, d) =>
                    setPanel({ ...panel, approvalDueDate: d.value || null })}
                />
              </Field>
            )}

            {panel.target.kind === "cluster" && gate && (
              <Card title="Who will be asked">
                <PersonaList tooltip={personaTooltip(gate)} className={s.personas} />
              </Card>
            )}

            {showHistory && (
              <Card title="History">
                {history.isLoading && <Text size={200}>Loading…</Text>}
                {!history.isLoading && history.entries.length === 0 && (
                  <Text size={200}>Nothing has been recorded for this yet.</Text>
                )}
                <div className={s.history}>
                  {history.entries.map((e) => (
                    <div key={e.id} className={s.historyItem}>
                      <strong>{e.name}</strong>
                      <span>{e.comment}</span>
                      <span className={s.hint}>{formatDate(e.createdOn)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {!showSave(panel) && !showRequestApproval(panel) && (
              <div className={s.errors}>
                • There is nothing to do here yet — this cluster is already complete, or
                its approval is with somebody else.
              </div>
            )}
          </div>
        )}
      </FormPanel>

      {/* Rules 20–21 — the terminal-state confirmation. */}
      <ConfirmDialog
        open={terminal !== null}
        intent={terminal?.label === "Activate" ? "default" : "danger"}
        title="Change Cluster State"
        confirmLabel="Yes"
        busy={terminalState.isPending}
        onCancel={() => setTerminal(null)}
        onConfirm={() => {
          if (!terminal) return;
          terminalState.mutate({
            project, staging: terminal, trackings: sequence.trackings, canEdit,
          }, { onSuccess: () => setTerminal(null) });
        }}
      >
        <Text>{terminal?.description}</Text>
      </ConfirmDialog>

      {/* Rule 16's information dialog. */}
      <ConfirmDialog
        open={infoMessage !== null}
        intent="info"
        title="Completion date required"
        cancelLabel="Close"
        onCancel={() => setInfoMessage(null)}
      >
        <Text>{infoMessage}</Text>
      </ConfirmDialog>

      {(transition.isPending || terminalState.isPending) && (
        <LoadingOverlay label="Updating the project state, please wait…" />
      )}

      {/* GUIDE q20 — "Cluster Movement to {next}": a read-only request-history view, not
          a form. Each comment carries its own nested checklist snapshot. */}
      <Dialog
        open={movementOpen}
        onOpenChange={(_, d) => { if (!d.open) setMovementOpen(false); }}
      >
        <DialogSurface className={s.movementSurface}>
          <DialogBody>
            <DialogTitle>{clusterMovementTitle(next)}</DialogTitle>
            <DialogContent>
              <div className={s.movementHeader}>
                <Text weight="semibold">History</Text>
                <Tooltip withArrow relationship="label" content="Refresh">
                  <Button
                    appearance="subtle"
                    icon={<ArrowClockwiseRegular />}
                    onClick={() => movementHistory.refetch()}
                  />
                </Tooltip>
              </div>
              <div className={s.movementBody}>
                {movementHistory.isLoading && <Text size={200}>Loading…</Text>}
                {!movementHistory.isLoading && movementHistory.entries.length === 0 && (
                  <Text size={200}>Nothing has been recorded for this yet.</Text>
                )}
                {movementHistory.entries.map((e) => (
                  <div key={e.id} className={s.movementEntry}>
                    <div className={s.movementCommentRow}>
                      <Text>
                        <strong>Comment: </strong>{e.comment || "—"}
                      </Text>
                      <span className={s.hint}>{formatDate(e.createdOn)}</span>
                    </div>
                    {e.createdByName && <span className={s.hint}>{e.createdByName}</span>}
                    <div className={s.movementTableWrap}>
                      <table className={s.movementTable}>
                        <thead>
                          <tr>
                            <th className={s.movementTh}>Gate Relevance</th>
                            <th className={s.movementTh}>Description</th>
                            <th className={s.movementTh}>Cluster</th>
                            <th className={s.movementTh}>State</th>
                            <th className={s.movementTh}>Modified By</th>
                            <th className={s.movementTh}>Modified On</th>
                          </tr>
                        </thead>
                        <tbody>
                          {checklist.rows.map((row) => (
                            <tr key={row.id}>
                              <td className={s.movementTd}>
                                {gateRelevanceLabel(row.gateRelevance)}
                              </td>
                              <td className={s.movementTd}>{row.title}</td>
                              <td className={s.movementTd}>{current?.name ?? "—"}</td>
                              <td className={s.movementTd}>
                                {clusterStepStateLabel(tracking?.clusterStepState)}
                              </td>
                              {/* GUIDE q20 — the recording shows these blank for every
                                  row; no per-row audit column is fetched here. */}
                              <td className={s.movementTd}>—</td>
                              <td className={s.movementTd}>—</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </DialogContent>
            <DialogActions>
              <Button
                appearance="secondary"
                icon={<DismissRegular />}
                onClick={() => setMovementOpen(false)}
              >
                Cancel
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}

/* ───────────────────────────────────────────────────────────────────── personas */

function PersonaList({
  tooltip, className,
}: {
  tooltip: ReturnType<typeof personaTooltip>;
  className: string;
}) {
  const groups: [string, string[]][] = [
    ["Portfolio manager", tooltip.portfolioManager],
    ["Contributors", tooltip.contributors],
    ["Approvers", tooltip.approvers],
    ["Notifications", tooltip.notifications],
  ];
  const shown = groups.filter(([, list]) => list.length > 0);
  if (shown.length === 0) {
    return <Text size={200}>No personas are configured on this gate.</Text>;
  }
  return (
    <div className={className}>
      {shown.map(([label, list]) => (
        <div key={label}>
          <strong>{label}: </strong>
          {list.join(", ")}
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── header */

function Header({
  project,
}: {
  project: { clusterStateName: string | null; projectNumber: string | null } | null;
}) {
  return (
    <PageHeader
      eyebrow="Project Management"
      title="CheckList"
      description="The cluster gates and the checklist behind each one. Complete a cluster's tasks, then move the project on — directly where there is no gate, through an approval where there is."
      actions={
        <>
          {project?.clusterStateName && <StateChip state={project.clusterStateName} />}
          {project?.projectNumber && <Badge appearance="tint">{project.projectNumber}</Badge>}
        </>
      }
    />
  );
}
