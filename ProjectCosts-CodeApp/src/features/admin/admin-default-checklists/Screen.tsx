/**
 * Admin Project Default Checklists Screen — layout and composition only.
 *
 * Canvas screen: `Admin Project Default Checklists Screen` (PM app), transcribed from
 * `ProjectDocs/_extracted/msapp/projectmanagement/Src/Admin Project Default Checklists Screen.pa.yaml`:
 *
 *   cmp_Admin_Project_Checklist_Header            the page title ("Checklist settings")
 *   tab_Admin_Project_Checklist_Association       the country × technology tab strip
 *   gal_DefaultChecklist_AdminScreen              one foldable section per gate
 *     con_Header_DefaultChecklist_AdminScreen       btn_Select (selects the gate; its caption is
 *                                                   lbl_ClusterName, semibold when selected) and
 *                                                   ico_Down / ico_Up (fold + select)
 *     pcf_CommandBar_Cluster_…                      Add Task · Reorder
 *     con_Header_TasksInCluster…                    Description · Holding Description ·
 *                                                   Gate Relevance · Completion Date · Active
 *     gal_TasksInClusterDefaultChecklist_AdminScreen  the task rows + Edit / Delete icons
 *   con_Admin_Checklist_Form                      the Add / Edit Task panel
 *   con_Admin_Checklist_Reorder                   the reorder panel (PowerDragDrop → drag + Move up/down)
 *   cmp_DeleteChecklistItem_AdminScreen           delete confirmation
 *   cmp_ActivateDeactiveChecklistItem_AdminScreen activate / deactivate confirmation
 *
 * HIDDEN CONTROLS: `but_Admin_Checklist_Form_Buttons_Reset` (Visible false) is `Select()`ed by
 * the panel's Close, Save and Cancel to reset all five fields — here every close resets `form`.
 * `lbl_ClusterName_Checklist_AdminScreen` (Visible false) is referenced nowhere and is not ported.
 *
 * CONNECTED (19 Oct 2026, D18): reads and writes go through `hooks.ts`. Every write plan takes
 * `canEdit` = the admin rule (`useAdminAccess`, with its local-run bypass). While a write runs the
 * canvas progress text is shown, then its success or error text (`WriteFeedback`) — the canvas set
 * these texts but had no pop-up to show them. The per-gate command bars stay INSIDE their gate
 * (the canvas puts one in every gallery row), so none of them is portalled into `CommandSlot`.
 */
import { useMemo, useState, type ReactElement } from "react";
import {
  Button, Switch, Tab, TabList, Table, TableBody, TableCell,
  TableHeader, TableHeaderCell, TableRow, Text, Tooltip, makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import {
  CalendarLtrRegular, CalendarReplyRegular,
  CheckmarkCircleRegular, ChevronDownRegular, ChevronUpRegular, DeleteRegular,
  DismissCircleRegular, EditRegular,
} from "@fluentui/react-icons";
import {
  type Command,
  CommandBar,
  ConfirmDialog,
  EmptyState,
  FormPanel,
  LoadingOverlay,
  PanelButtons,
  ReorderList,
  TextField,
  WriteFeedback,
} from "@/components";
import { useAdminAccess } from "@/app/useCurrentUser";
import { emptyPlan, type WritePlan } from "@/data/writePlan";
import { palette, space } from "@/theme/tokens";
import { CHOICE_ADMIN } from "@/data/dataverseNames";
import {
  CHECKLIST_ENTITY_SET, DESCRIPTION_MAX_LENGTH, LABELS, MSG, activationConfirmText,
  activationDescription, activationSavingText, activationTitle, checklistGates,
  completionDateChangingText, completionDateErrorText, defaultScope, deleteDescription,
  deletingText, emptyTaskForm, gateCaption, isSaveEnabled, isTaskLocked, nextOrderFromHighest,
  panelTitle, planDeleteTask, planReorderTasks, planSaveTask, savingText, sortScopes, toTaskForm,
  toggleActivePatch, toggleCompletionDatePatch, truncateHolding, visibleTasks,
  type GateRow, type ScopeRow, type TaskForm, type TaskRow,
} from "./rules";
import {
  highestTaskOrder, useBlockingApprovals, useChecklistGates, useChecklistScopes, useChecklistWrites,
  useScopeTasks,
} from "./hooks";

const useStyles = makeStyles({
  /**
   * The command bar's first icon starts on the left edge of the content under it (PO, 21 Oct
   * 2026); `CommandBar` has no inset of its own. Over the "Description" column caption: Fluent's 8 px
   * header-cell padding.
   */
  commandBar: { paddingLeft: space.s },
  page: {
    display: "flex", flexDirection: "column", gap: space.m, minWidth: 0,
    paddingTop: space.m, paddingBottom: space.m, paddingLeft: space.l, paddingRight: space.l,
  },
  title: { fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold },
  tabs: { overflowX: "auto" },
  gates: { display: "flex", flexDirection: "column", gap: space.s },
  gate: {
    display: "flex", flexDirection: "column", gap: space.s,
    borderBottomWidth: "1px", borderBottomStyle: "solid", borderBottomColor: palette.neutralLight,
    paddingBottom: space.s,
  },
  gateHead: { display: "flex", alignItems: "center", gap: space.xs, width: "100%" },
  gateSelect: {
    flexGrow: 1, justifyContent: "flex-start", fontWeight: tokens.fontWeightRegular,
    paddingLeft: space.s, paddingRight: space.s,
  },
  // `lbl_ClusterName_DefaultChecklist_AdminScreen.FontWeight`: Semibold when it is the selected gate.
  gateSelected: { fontWeight: tokens.fontWeightSemibold },
  tableWrap: { overflowX: "auto" },
  table: { minWidth: "760px" },
  actions: { display: "flex", alignItems: "center", gap: space.xxs },
  iconAction: { color: palette.themePrimary },
  green: { color: palette.akzent3 },
  panelBody: { display: "flex", flexDirection: "column", gap: space.m },
});

type ConfirmState = { kind: "delete" | "activate"; task: TaskRow; siblings: TaskRow[] } | null;

/** A one-row update of a default checklist task, as a plan. */
function updateTaskPlan(task: TaskRow, data: Record<string, unknown>, reason: string, canEdit: boolean): WritePlan {
  if (!canEdit) return { writes: [], log: [], refusedReason: MSG.outOfScope };
  const plan = emptyPlan();
  plan.writes.push({ op: "update", entitySet: CHECKLIST_ENTITY_SET, id: task.id, data, reason });
  return plan;
}

export default function AdminDefaultChecklistsScreen() {
  const s = useStyles();
  const scopesQ = useChecklistScopes();
  const gatesQ = useChecklistGates();
  const writes = useChecklistWrites();
  /** The admin rule (with the local-run bypass) — every write plan takes it as `canEdit`. */
  const canEdit = useAdminAccess();
  /** Every write is disabled until the screen's tables are connected (`hooks.ts`). */
  const connected = scopesQ.connected && gatesQ.connected;

  const ordered = useMemo(() => sortScopes(scopesQ.data), [scopesQ.data]);
  const [scopeId, setScopeId] = useState<string | null>(null);
  const scope: ScopeRow | null = ordered.find((x) => x.id === scopeId) ?? defaultScope(ordered);

  const gates = useMemo(() => checklistGates(gatesQ.data), [gatesQ.data]);
  // Rule 2 — every gate starts folded (`IsFolded: true`).
  const [openGateIds, setOpenGateIds] = useState<ReadonlySet<string>>(new Set());
  // `locSelectedCluster` — set by btn_Select and by both chevrons.
  const [selectedGateId, setSelectedGateId] = useState<string | null>(null);
  const toggleGate = (id: string) => {
    setSelectedGateId(id);
    setOpenGateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const [panelGate, setPanelGate] = useState<GateRow | null>(null);
  const [editing, setEditing] = useState<TaskRow | null>(null);
  const [form, setForm] = useState<TaskForm>(emptyTaskForm());
  const [reorder, setReorder] = useState<{ gate: GateRow | null; tasks: TaskRow[]; ids: string[] } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const openAdd = (gate: GateRow | null) => {
    if (!gate) return;
    setPanelGate(gate); setEditing(null); setForm(emptyTaskForm());
  };
  const openEdit = (gate: GateRow, task: TaskRow) => {
    setPanelGate(gate); setEditing(task); setForm(toTaskForm(task));
  };
  /** Close / Save / Cancel — `Select(but_Admin_Checklist_Form_Buttons_Reset)` resets all five fields. */
  const closePanel = () => { setPanelGate(null); setEditing(null); setForm(emptyTaskForm()); };

  const openReorder = (gate: GateRow | null, tasks: TaskRow[]) =>
    setReorder({ gate, tasks, ids: tasks.map((t) => t.id) });
  const closeReorder = () => setReorder(null);

  /** Save — `pcf_but_Admin_Checklist_Form_Buttons_Save.OnChange`: close the panel, then write. */
  const saveTask = () => {
    if (!panelGate || !scope) return;
    const gate = panelGate, existing = editing, values = form, sc = scope;
    closePanel();
    void writes.run({
      progress: savingText(values.description.trim()),
      success: MSG.saved,
      plan: async () => planSaveTask(values, {
        scope: sc, gate, existing, canEdit,
        // The next order is read at SAVE time (the canvas captured a count at Add-click).
        nextOrderValue: existing ? 0 : nextOrderFromHighest(await highestTaskOrder(sc.id, gate.id)),
      }),
    });
  };

  const saveReorder = () => {
    if (!reorder) return;
    const { tasks, ids } = reorder;
    closeReorder();
    void writes.run({ progress: MSG.reorderSaving, plan: planReorderTasks({ tasks, orderedIds: ids, canEdit }) });
  };

  const onConfirm = () => {
    if (!confirm) return;
    const { kind, task, siblings } = confirm;
    setConfirm(null);
    if (kind === "delete") {
      // The row action is disabled while locked, so `locked` is false here.
      void writes.run({
        progress: deletingText(task.name),
        plan: planDeleteTask({ target: task, siblings, locked: false, canEdit }),
      });
    } else {
      void writes.run({
        progress: activationSavingText(task.name),
        success: MSG.saved,
        plan: updateTaskPlan(task, toggleActivePatch(task), `Status of “${task.name}” changed`, canEdit),
      });
    }
  };

  /** Rule 12 — the Completion Date toggle saves immediately, no confirmation. */
  const toggleCompletionDate = (task: TaskRow) => {
    void writes.run({
      progress: completionDateChangingText(task.name),
      success: MSG.completionDateChanged,
      errorText: completionDateErrorText,
      plan: updateTaskPlan(task, toggleCompletionDatePatch(task), `Completion Date of “${task.name}” toggled`, canEdit),
    });
  };

  const section = (gate: GateRow | null) => (
    <GateSection
      key={gate?.id ?? "none"}
      gate={gate}
      scope={scope}
      open={gate === null || openGateIds.has(gate.id)}
      selected={gate !== null && gate.id === selectedGateId}
      canWrite={connected && canEdit}
      onSelect={() => { if (gate) setSelectedGateId(gate.id); }}
      onToggle={() => { if (gate) toggleGate(gate.id); }}
      onAdd={() => openAdd(gate)}
      onReorder={(tasks) => openReorder(gate, tasks)}
      onEdit={(task) => { if (gate) openEdit(gate, task); }}
      onDelete={(task, siblings) => setConfirm({ kind: "delete", task, siblings })}
      onToggleActive={(task) => setConfirm({ kind: "activate", task, siblings: [] })}
      onToggleCompletionDate={toggleCompletionDate}
    />
  );

  const confirmActive = confirm?.task.status === CHOICE_ADMIN.status.active;
  const loadError = scopesQ.error ?? gatesQ.error;
  const reorderNames = new Map((reorder?.tasks ?? []).map((t) => [t.id, t.name]));

  return (
    <div className={s.page}>
      {/* `cmp_Admin_Project_Checklist_Header.Project.Name` — the page title. */}
      <Text as="h1" className={s.title}>{MSG.pageTitle}</Text>
      <WriteFeedback progress={writes.progress} error={writes.error} success={writes.success} testIdPrefix="default-checklists" />

      {loadError ? (
        <EmptyState title={LABELS.loadFailedTitle} description={LABELS.loadFailedDescription} />
      ) : scopesQ.isLoading || gatesQ.isLoading ? (
        <LoadingOverlay mode="inline" label={LABELS.loading} />
      ) : (
        <>
          <TabList
            className={s.tabs}
            size="small"
            selectedValue={scope?.id ?? ""}
            onTabSelect={(_, d) => setScopeId(String(d.value))}
            data-testid="tab_Admin_Project_Checklist_Association"
          >
            {ordered.map((sc) => (
              <Tab key={sc.id} value={sc.id} aria-label={sc.name} data-testid={`default-checklists-scope-${sc.id}`}>{sc.name}</Tab>
            ))}
          </TabList>

          <div className={s.gates} data-testid="gal_DefaultChecklist_AdminScreen">
            {gates.length === 0 ? section(null) : gates.map((g) => section(g))}
          </div>
        </>
      )}

      {/* con_Admin_Checklist_Form — Add Task / Edit Task (rule 15). */}
      <FormPanel
        open={panelGate !== null}
        title={panelTitle(editing)}
        width="narrow"
        onDismiss={closePanel}
        footer={
          <PanelButtons
            onSave={saveTask}
            onCancel={closePanel}
            disabled={!connected || !canEdit || !isSaveEnabled(form)}
            saveTestId="pcf_but_Admin_Checklist_Form_Buttons_Save"
            cancelTestId="pcf_but_Admin_Admin_Checklist_Form_Buttons_Cancel"
          />
        }
      >
        <div className={s.panelBody}>
          <TextField
            label={LABELS.fieldDescription}
            required
            value={form.description}
            maxLength={DESCRIPTION_MAX_LENGTH}
            disabled={!connected}
            error={isSaveEnabled(form) ? undefined : MSG.descriptionBlank}
            onChange={(v) => setForm((p) => ({ ...p, description: v }))}
            testId="txt_Admin_Checklist_Form_Fields_Name"
          />
          <TextField
            label={LABELS.fieldHoldingDescription}
            value={form.holdingDescription}
            maxLength={DESCRIPTION_MAX_LENGTH}
            disabled={!connected}
            onChange={(v) => setForm((p) => ({ ...p, holdingDescription: v }))}
            testId="txt_Admin_Checklist_Form_Fields_HoldingDescription"
          />
          <Switch
            label={LABELS.toggleGateRelevance}
            aria-label={LABELS.toggleGateRelevance}
            data-testid="tgl_GateRelevance_ChecklistForm"
            checked={form.gateRelevance}
            disabled={!connected}
            onChange={(_, d) => setForm((p) => ({ ...p, gateRelevance: d.checked }))}
          />
          <Switch
            label={LABELS.toggleCompletionDate}
            aria-label={LABELS.toggleCompletionDate}
            data-testid="tgl_CompletionDate_ChecklistForm"
            checked={form.isCompletionDate}
            disabled={!connected}
            onChange={(_, d) => setForm((p) => ({ ...p, isCompletionDate: d.checked }))}
          />
          <Switch
            label={LABELS.toggleActive}
            aria-label={LABELS.toggleActive}
            data-testid="tgl_Active_ChecklistForm"
            checked={form.active}
            disabled={!connected}
            onChange={(_, d) => setForm((p) => ({ ...p, active: d.checked }))}
          />
        </div>
      </FormPanel>

      {/*
        * con_Admin_Checklist_Reorder — `pcf_ReorderTaskList_AdminScreen` was a PowerDragDrop list.
        * Here: native drag-and-drop plus Move up / Move down buttons, so the order can be changed
        * from the keyboard too. Save sends `planReorderTasks` once the screen is connected.
        */}
      <FormPanel
        open={reorder !== null}
        title={LABELS.reorderTitle}
        width="narrow"
        onDismiss={closeReorder}
        footer={
          <PanelButtons
            onSave={saveReorder}
            onCancel={closeReorder}
            disabled={!connected || !canEdit}
            saveTestId="pcf_but_Admin_Checklist_Reorder_Buttons_Save"
            cancelTestId="pcf_but_Admin_Admin_Checklist_Reorder_Buttons_Cancel"
          />
        }
      >
        <div className={s.panelBody}>
          <Text>{LABELS.reorderHint}</Text>
          <ReorderList
            ids={reorder?.ids ?? []}
            labelOf={(id) => reorderNames.get(id) ?? ""}
            onChange={(ids) => setReorder((r) => (r ? { ...r, ids } : r))}
            testId="pcf_ReorderTaskList_AdminScreen"
            rowTestIdPrefix="default-checklists-reorder"
            ariaLabel={LABELS.reorderTitle}
            moveUpLabel={LABELS.moveUp}
            moveDownLabel={LABELS.moveDown}
          />
        </div>
      </FormPanel>

      <ConfirmDialog
        open={confirm?.kind === "delete"}
        title={MSG.deleteTitle}
        description={deleteDescription(confirm?.task.name ?? "")}
        confirmText={LABELS.deleteConfirm}
        cancelText={LABELS.cancel}
        confirmIcon="delete"
        destructive
        onConfirm={onConfirm}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm?.kind === "activate"}
        title={activationTitle(confirmActive)}
        description={activationDescription(confirm?.task.name ?? "")}
        confirmText={activationConfirmText(confirmActive)}
        cancelText={LABELS.cancel}
        onConfirm={onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

/* ───────────────────────────────────────────────────────────── one gate section */

function GateSection({
  gate, scope, open, selected, canWrite, onSelect, onToggle, onAdd, onReorder, onEdit, onDelete,
  onToggleActive, onToggleCompletionDate,
}: {
  /** `null` renders the structure only — no gate is loaded yet. */
  gate: GateRow | null;
  scope: ScopeRow | null;
  open: boolean;
  selected: boolean;
  canWrite: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onAdd: () => void;
  onReorder: (tasks: TaskRow[]) => void;
  onEdit: (task: TaskRow) => void;
  onDelete: (task: TaskRow, siblings: TaskRow[]) => void;
  onToggleActive: (task: TaskRow) => void;
  onToggleCompletionDate: (task: TaskRow) => void;
}) {
  const s = useStyles();
  const tasksQ = useScopeTasks(scope?.id ?? null, gate?.id ?? null);
  const rows = useMemo(
    () => visibleTasks(tasksQ.data, scope?.id ?? null, gate?.id ?? null),
    [tasksQ.data, scope?.id, gate?.id],
  );
  const taskIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const lockQ = useBlockingApprovals(taskIds);
  const writable = canWrite && tasksQ.connected && lockQ.connected && gate !== null;
  const caption = gate ? gateCaption(gate.name) : "";

  const commands: Command[] = [
    { key: "addNewChecklistEntity", label: LABELS.addTask, icon: "Add", enabled: writable },
    { key: "reorderChecklist", label: LABELS.reorder, icon: "NumberedList", enabled: writable },
  ];
  const onCommand = (key: string) => {
    if (key === "addNewChecklistEntity") onAdd();
    if (key === "reorderChecklist") onReorder(rows);
  };

  /** A locked row action carries the canvas tooltip and stays disabled. */
  const action = (
    locked: boolean, testId: string, node: (disabled: boolean) => ReactElement,
  ) => {
    const disabled = locked || !writable;
    const el = node(disabled);
    return locked
      ? <Tooltip key={testId} content={MSG.inUse} relationship="description"><span>{el}</span></Tooltip>
      : <span key={testId}>{el}</span>;
  };

  return (
    <section className={s.gate} data-testid="con_Main_DefaultChecklist_AdminScreen">
      {gate ? (
        <div className={s.gateHead}>
          {/* btn_Select selects only (no fold); lbl_ClusterName is its caption. */}
          <Button
            appearance="subtle"
            className={mergeClasses(s.gateSelect, selected && s.gateSelected)}
            aria-label={caption}
            aria-pressed={selected}
            data-testid="btn_Select_DefaultChecklist_AdminScreen"
            onClick={onSelect}
          >
            {caption}
          </Button>
          {/* ico_Down (folded) / ico_Up (open) — fold or unfold, and select the gate. */}
          {open ? (
            <Button
              appearance="subtle" icon={<ChevronUpRegular />}
              aria-label={LABELS.collapse} aria-expanded
              data-testid="ico_Up_DefaultChecklist_AdminScreen"
              onClick={onToggle}
            />
          ) : (
            <Button
              appearance="subtle" icon={<ChevronDownRegular />}
              aria-label={LABELS.expand} aria-expanded={false}
              data-testid="ico_Down_DefaultChecklist_AdminScreen"
              onClick={onToggle}
            />
          )}
        </div>
      ) : null}

      {open ? (
        <>
          <div className={s.commandBar}>
            <CommandBar commands={commands} onCommand={onCommand} ariaLabel={caption || MSG.pageTitle} />
          </div>
          <div className={s.tableWrap}>
            <Table
              size="small"
              className={s.table}
              aria-label={caption || MSG.pageTitle}
              data-testid="gal_TasksInClusterDefaultChecklist_AdminScreen"
            >
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>{LABELS.colDescription}</TableHeaderCell>
                  <TableHeaderCell>{LABELS.colHoldingDescription}</TableHeaderCell>
                  <TableHeaderCell>{LABELS.colGateRelevance}</TableHeaderCell>
                  <TableHeaderCell>{LABELS.colCompletionDate}</TableHeaderCell>
                  <TableHeaderCell>{LABELS.colActive}</TableHeaderCell>
                  <TableHeaderCell />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const locked = isTaskLocked(r.id, lockQ.data);
                  const active = r.status === CHOICE_ADMIN.status.active;
                  const status = active ? LABELS.statusActive : LABELS.statusInactive;
                  const completion = r.isCompletionDate ? LABELS.yes : LABELS.no;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>{r.name}</TableCell>
                      <TableCell>{truncateHolding(r.holdingTaskDescription)}</TableCell>
                      {/* `lbl_GateRelevanceValue_….Text: =ThisItem.'Gate Relevance'` — a boolean's text. */}
                      <TableCell>{String(r.gateRelevance)}</TableCell>
                      <TableCell>
                        {action(locked, `date-${r.id}`, (disabled) => (
                          <Button
                            appearance="transparent" size="small" disabled={disabled}
                            className={mergeClasses(s.iconAction, r.isCompletionDate && s.green)}
                            icon={r.isCompletionDate ? <CalendarReplyRegular /> : <CalendarLtrRegular />}
                            aria-label={completion}
                            data-testid="ico_EnablelCompletionDate_TasksInClusterDefaultChecklist_AdminScreen"
                            onClick={() => onToggleCompletionDate(r)}
                          >
                            {completion}
                          </Button>
                        ))}
                      </TableCell>
                      <TableCell>
                        {action(locked, `active-${r.id}`, (disabled) => (
                          <Button
                            appearance="transparent" size="small" disabled={disabled}
                            className={mergeClasses(s.iconAction, active && s.green)}
                            // `IconName: If(Status = Active, "DeactivateOrders", "ActivateOrders")`.
                            icon={active ? <DismissCircleRegular /> : <CheckmarkCircleRegular />}
                            aria-label={status}
                            data-testid="ico_ActivateDeactivate_TasksInClusterDefaultChecklist_AdminScreen"
                            onClick={() => onToggleActive(r)}
                          >
                            {status}
                          </Button>
                        ))}
                      </TableCell>
                      <TableCell>
                        <span className={s.actions}>
                          {action(locked, `edit-${r.id}`, (disabled) => (
                            <Button
                              appearance="transparent" size="small" disabled={disabled}
                              className={s.iconAction} icon={<EditRegular />}
                              aria-label={LABELS.edit}
                              data-testid="ico_Edit_TasksInClusterDefaultChecklist_AdminScreen"
                              onClick={() => onEdit(r)}
                            />
                          ))}
                          {action(locked, `delete-${r.id}`, (disabled) => (
                            <Button
                              appearance="transparent" size="small" disabled={disabled}
                              className={s.iconAction} icon={<DeleteRegular />}
                              aria-label={LABELS.delete}
                              data-testid="ico_Delete_TasksInClusterDefaultChecklist_AdminScreen"
                              onClick={() => onDelete(r, rows)}
                            />
                          ))}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      ) : null}
    </section>
  );
}
