/**
 * Admin Project Default Checklists Screen — layout and composition only.
 *
 * Canvas screen: `Admin Project Default Checklists Screen` (PM app)
 *   75 controls · 1 343 lines of Power Fx · 16 substantive blocks · band S
 *
 * NOT PROJECT-SCOPED. This screen edits master data, so it never calls
 * `useProjectContext()` and there is no `gblRecordSelectedProject` idiom. It reads the
 * signed-in user straight from the store and gates edits on `canSeeAdminSection` (entry)
 * and `canEditCountry` (per scope) — see the SOURCE DEFECT block at the top of rules.ts:
 * the canvas app had NEITHER, only a hidden nav item.
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  - the synthetic project record the canvas fed `cmp_Header`
 *    (`{ID: GUID("0000…"), Name: "Checklist settings", Technology: Blank(), …}`) — the
 *    code app's header does not need a fake project to render a title;
 *  - `colChecklistClusters` and its `IsFolded` column — fold state is a `Set<string>`;
 *  - `locAdminLoadingDialog` / `locAdminLoadingDialogText` — the mutation's `isPending`
 *    and an inline error banner replace both;
 *  - `locTotalRows`, captured at Add-click (see `nextOrder` in rules.ts).
 */
import { useMemo, useState } from "react";
import {
  TabList, Tab, Accordion, AccordionItem, AccordionHeader, AccordionPanel,
  Button, Field, Input, Switch, Tooltip, MessageBar, MessageBarBody, Badge,
  makeStyles, tokens,
} from "@fluentui/react-components";
import {
  AddRegular, DeleteRegular, EditRegular, ReOrderRegular, CalendarLtrRegular,
  PlayRegular, PauseRegular, ArrowUpRegular, ArrowDownRegular,
} from "@fluentui/react-icons";
import {
  PageHeader, DataGrid, CommandBar, FormPanel, ConfirmDialog, LoadingOverlay,
  EmptyState, StateChip, type Command, type Column,
} from "@/components";
import { useAppStore } from "@/store/appStore";
import { canSeeAdminSection } from "@/domain/session";
import { space, media } from "@/theme/tokens";
import {
  MSG, DESCRIPTION_MAX_LENGTH, charCounter, panelTitle, truncateHolding, isSaveEnabled,
  saveErrors, defaultScope, sortScopes, checklistGates, visibleTasks, isTaskLocked,
  canEditScope, activationTitle, toggleActivePatch, toggleCompletionDatePatch,
  planSaveTask, planDeleteTask, planReorderTasks, emptyTaskForm, toTaskForm,
  CHECKLIST_ENTITY_SET,
  type ScopeRow, type GateRow, type TaskRow, type TaskForm,
} from "./rules";
import {
  useChecklistScopes, useChecklistGates, useScopeTasks, useBlockingApprovals,
  useRunChecklistPlan, readNextOrder,
} from "./hooks";

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: space.l, minWidth: 0 },
  tabs: { overflowX: "auto" },
  gateHead: { display: "flex", alignItems: "center", gap: space.s, flexWrap: "wrap" },
  actions: { display: "flex", gap: "2px" },
  panelBody: { display: "flex", flexDirection: "column", gap: space.m },
  counter: {
    fontSize: "11px", color: tokens.colorNeutralForeground3, textAlign: "right",
    fontVariantNumeric: "tabular-nums",
  },
  reorderRow: {
    display: "flex", alignItems: "center", gap: space.s,
    padding: `6px ${space.s}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  reorderName: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" },
  note: { color: tokens.colorNeutralForeground3, fontSize: "12px" },
  wrap: { display: "flex", flexDirection: "column", gap: space.m, [media.belowMd]: { gap: space.s } },
});

export default function AdminDefaultChecklistsScreen() {
  const s = useStyles();
  const user = useAppStore((st) => st.session.user);

  const { scopes, isLoading: scopesLoading } = useChecklistScopes();
  const { gates, isLoading: gatesLoading } = useChecklistGates();

  const ordered = useMemo(() => sortScopes(scopes), [scopes]);
  const [scopeId, setScopeId] = useState<string | null>(null);
  const scope: ScopeRow | null =
    ordered.find((x) => x.id === scopeId) ?? defaultScope(ordered);

  const visibleGates = useMemo(() => checklistGates(gates), [gates]);
  const [openGateId, setOpenGateId] = useState<string | null>(null);
  const activeGate = visibleGates.find((g) => g.id === openGateId) ?? null;

  const canEdit = canEditScope(user, scope);

  /* Panels and dialogs — one boolean each, exactly as the canvas, but local state. */
  const [panelGate, setPanelGate] = useState<GateRow | null>(null);
  const [editing, setEditing] = useState<TaskRow | null>(null);
  const [formState, setFormState] = useState<TaskForm>(emptyTaskForm());
  const [confirm, setConfirm] = useState<
    { kind: "delete" | "activate"; task: TaskRow } | null
  >(null);
  const [reorderGate, setReorderGate] = useState<GateRow | null>(null);
  const [reorderIds, setReorderIds] = useState<string[]>([]);
  const [banner, setBanner] = useState<string | null>(null);

  const save = useRunChecklistPlan("adminChecklists/save");

  if (!user) return <LoadingOverlay mode="inline" />;
  if (!canSeeAdminSection(user)) {
    // Belt and braces — AppRoutes already guards this. Neither is server enforcement.
    return (
      <EmptyState
        title="Administration is not available to your account"
        description="These screens need the VSB - Application Administrator or VSB - Controller Own Data security role."
      />
    );
  }

  const busy = save.isPending;

  const runPlan = (plan: ReturnType<typeof planSaveTask>, onDone?: () => void) => {
    if (!scope || !panelGateOrActive()) return;
    setBanner(plan.refusedReason ?? null);
    if (plan.refusedReason) return;
    save.mutate(
      { plan, scope: { scopeId: scope.id, gateId: panelGateOrActive()!.id } },
      {
        onSuccess: () => { setBanner(null); onDone?.(); },
        onError: (e: unknown) =>
          setBanner(e instanceof Error ? e.message : MSG.saveFailed),
      },
    );
  };

  function panelGateOrActive(): GateRow | null {
    return panelGate ?? reorderGate ?? activeGate ?? confirmGate();
  }
  function confirmGate(): GateRow | null {
    if (!confirm) return null;
    return visibleGates.find((g) => g.id === confirm.task.clusterStateId) ?? null;
  }

  const openAdd = async (gate: GateRow) => {
    setPanelGate(gate);
    setEditing(null);
    setFormState(emptyTaskForm());
  };
  const openEdit = (gate: GateRow, task: TaskRow) => {
    setPanelGate(gate);
    setEditing(task);
    setFormState(toTaskForm(task));
  };
  const closePanel = () => { setPanelGate(null); setEditing(null); setBanner(null); };

  const doSave = async () => {
    if (!scope || !panelGate) return;
    // Rule 4's mitigation — read the next order at SAVE time, not at Add-click.
    const next = editing ? 0 : await readNextOrder(scope.id, panelGate.id);
    runPlan(
      planSaveTask(formState, {
        scope, gate: panelGate, existing: editing, nextOrderValue: next, canEdit,
      }),
      closePanel,
    );
  };

  return (
    <div className={s.page}>
      <PageHeader
        eyebrow="Administration"
        // GUIDE p17: page title is "Checklist settings" — lower-case "settings".
        title={MSG.pageTitle}
        description={
          "The default task list every new project's checklist is seeded from, per country "
          + "and technology. Tasks already referenced by a Project Gate approval are locked."
        }
      />

      {scopesLoading ? (
        <LoadingOverlay mode="inline" label="Loading scopes…" />
      ) : ordered.length === 0 ? (
        <EmptyState title="No country and technology scopes" description={MSG.noScope} />
      ) : (
        <TabList
          className={s.tabs}
          selectedValue={scope?.id ?? ""}
          onTabSelect={(_, d) => setScopeId(String(d.value))}
        >
          {ordered.map((sc) => <Tab key={sc.id} value={sc.id}>{sc.name}</Tab>)}
        </TabList>
      )}

      {!canEdit && scope && (
        <MessageBar intent="warning">
          <MessageBarBody>{MSG.outOfScope}</MessageBarBody>
        </MessageBar>
      )}
      {banner && (
        <MessageBar intent="error">
          <MessageBarBody>{banner}</MessageBarBody>
        </MessageBar>
      )}

      {gatesLoading ? (
        <LoadingOverlay mode="inline" label="Loading gates…" />
      ) : (
        <Accordion
          collapsible
          openItems={openGateId ? [openGateId] : []}
          onToggle={(_, d) => setOpenGateId((d.openItems[0] as string | undefined) ?? null)}
        >
          {visibleGates.map((gate) => (
            <AccordionItem key={gate.id} value={gate.id}>
              {/* GUIDE p17: each row is a label with a down-chevron at the RIGHT — no
                 order badge is shown in the screenshot. */}
              <AccordionHeader expandIconPosition="end">
                <span className={s.gateHead}>{gate.name}</span>
              </AccordionHeader>
              <AccordionPanel>
                <GatePanel
                  gate={gate}
                  scope={scope}
                  canEdit={canEdit}
                  busy={busy}
                  onAdd={() => void openAdd(gate)}
                  onEdit={(t) => openEdit(gate, t)}
                  onDelete={(t) => setConfirm({ kind: "delete", task: t })}
                  onToggleActive={(t) => setConfirm({ kind: "activate", task: t })}
                  onToggleCompletionDate={(t) => {
                    if (!scope) return;
                    save.mutate({
                      plan: {
                        writes: [{
                          op: "update", entitySet: CHECKLIST_ENTITY_SET, id: t.id,
                          data: toggleCompletionDatePatch(t),
                          reason: "Completion-date flag toggled",
                        }],
                        log: [],
                      },
                      scope: { scopeId: scope.id, gateId: gate.id },
                    });
                  }}
                  onReorder={(tasks) => {
                    setReorderGate(gate);
                    setReorderIds(tasks.map((t) => t.id));
                  }}
                />
              </AccordionPanel>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      {/* Add / Edit Task — rule 15's derived title. */}
      <FormPanel
        open={panelGate !== null}
        title={panelTitle(editing)}
        onClose={closePanel}
        onSave={() => void doSave()}
        saveDisabled={!isSaveEnabled(formState) || !canEdit}
        busy={busy}
        errors={saveErrors(formState)}
      >
        <div className={s.panelBody}>
          <Field label="Description" required>
            <Input
              value={formState.description}
              maxLength={DESCRIPTION_MAX_LENGTH}
              onChange={(_, d) => setFormState((p) => ({ ...p, description: d.value }))}
            />
          </Field>
          <span className={s.counter}>{charCounter(formState.description)}</span>

          <Field label="Holding description">
            <Input
              value={formState.holdingDescription}
              maxLength={DESCRIPTION_MAX_LENGTH}
              onChange={(_, d) => setFormState((p) => ({ ...p, holdingDescription: d.value }))}
            />
          </Field>
          <span className={s.counter}>{charCounter(formState.holdingDescription)}</span>

          <Switch
            label="Gate relevance"
            checked={formState.gateRelevance}
            onChange={(_, d) => setFormState((p) => ({ ...p, gateRelevance: d.checked }))}
          />
          <Switch
            label="Requires a completion date"
            checked={formState.isCompletionDate}
            onChange={(_, d) => setFormState((p) => ({ ...p, isCompletionDate: d.checked }))}
          />
          <Switch
            label="Active"
            checked={formState.active}
            onChange={(_, d) => setFormState((p) => ({ ...p, active: d.checked }))}
          />
          <span className={s.note}>
            The Active switch writes both Status and Status Reason. The row-level toggle in
            the grid does the same — the canvas wrote only Status there, which let the two
            columns disagree.
          </span>
        </div>
      </FormPanel>

      {/* Reorder — replaces the PowerDragDrop list with plain up/down moves. */}
      <FormPanel
        open={reorderGate !== null}
        title={`Reorder — ${reorderGate?.name ?? ""}`}
        onClose={() => setReorderGate(null)}
        onSave={() => {
          if (!scope || !reorderGate) return;
          runPlan(
            planReorderTasks({
              tasks: reorderTasksFor(reorderGate, reorderIds),
              orderedIds: reorderIds,
              canEdit,
            }),
            () => setReorderGate(null),
          );
        }}
        saveDisabled={!canEdit}
        busy={busy}
      >
        <ReorderList
          ids={reorderIds}
          gate={reorderGate}
          scopeId={scope?.id ?? null}
          onChange={setReorderIds}
        />
      </FormPanel>

      <ConfirmDialog
        open={confirm !== null}
        intent={confirm?.kind === "delete" ? "danger" : "default"}
        title={
          confirm === null
            ? ""
            : confirm.kind === "delete"
              ? MSG.deleteTitle
              : activationTitle(confirm.task.status === 0)
        }
        confirmLabel={confirm?.kind === "delete" ? "Delete" : "Confirm"}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm || !scope) return;
          const gate = confirmGate();
          if (!gate) return;
          const plan = confirm.kind === "delete"
            ? planDeleteTask({
                target: confirm.task,
                siblings: currentTasksRef.current,
                locked: false,
                canEdit,
              })
            : {
                writes: [{
                  op: "update" as const, entitySet: CHECKLIST_ENTITY_SET,
                  id: confirm.task.id, data: toggleActivePatch(confirm.task),
                  reason: "Status toggled",
                }],
                log: [],
              };
          setBanner(plan.refusedReason ?? null);
          if (plan.refusedReason) return;
          save.mutate(
            { plan, scope: { scopeId: scope.id, gateId: gate.id } },
            { onSuccess: () => setConfirm(null) },
          );
        }}
      >
        {confirm?.kind === "delete"
          ? `“${confirm.task.name}” will be marked deleted and every later task in this gate moves up one position.`
          : "The task's Status and Status Reason are both updated."}
      </ConfirmDialog>
    </div>
  );

  /* The reorder panel edits a snapshot of the gate's tasks; the live rows come from the
   * query cache the grid already rendered. */
  function reorderTasksFor(_gate: GateRow, ids: string[]): TaskRow[] {
    const byId = new Map(currentTasksRef.current.map((t) => [t.id, t]));
    return ids.map((id) => byId.get(id)).filter((t): t is TaskRow => Boolean(t));
  }
}

/**
 * The tasks currently rendered by the open gate. A module-level ref rather than lifted
 * state because only the dialogs read it, and lifting it would re-render every gate on
 * every keystroke in the panel.
 */
const currentTasksRef: { current: TaskRow[] } = { current: [] };

function GatePanel({
  gate, scope, canEdit, busy, onAdd, onEdit, onDelete, onToggleActive,
  onToggleCompletionDate, onReorder,
}: {
  gate: GateRow;
  scope: ScopeRow | null;
  canEdit: boolean;
  busy: boolean;
  onAdd: () => void;
  onEdit: (t: TaskRow) => void;
  onDelete: (t: TaskRow) => void;
  onToggleActive: (t: TaskRow) => void;
  onToggleCompletionDate: (t: TaskRow) => void;
  onReorder: (tasks: TaskRow[]) => void;
}) {
  const s = useStyles();
  const { tasks, isLoading } = useScopeTasks(scope?.id ?? null, gate.id);
  const { blockingIds } = useBlockingApprovals(scope?.id ?? null, gate.id);
  const rows = useMemo(
    () => visibleTasks(tasks, scope?.id ?? null, gate.id),
    [tasks, scope?.id, gate.id],
  );
  currentTasksRef.current = rows;

  const commands: Command[] = [
    {
      key: "add", label: "Add task", icon: <AddRegular />, primary: true,
      disabled: !canEdit || busy,
      disabledReason: canEdit ? undefined : MSG.outOfScope,
      onClick: onAdd,
    },
    {
      key: "reorder", label: "Reorder", icon: <ReOrderRegular />,
      disabled: !canEdit || rows.length < 2 || busy,
      disabledReason: rows.length < 2 ? "There is nothing to reorder." : undefined,
      onClick: () => onReorder(rows),
    },
  ];

  const action = (
    label: string, icon: React.ReactElement, task: TaskRow, run: () => void,
  ) => {
    const locked = isTaskLocked(task.id, blockingIds);
    const button = (
      <Button
        appearance="subtle" size="small" icon={icon} aria-label={label}
        disabled={locked || !canEdit || busy} onClick={run}
      />
    );
    return locked ? (
      <Tooltip content={MSG.inUse} relationship="label"><span>{button}</span></Tooltip>
    ) : button;
  };

  const columns: Column<TaskRow>[] = [
    {
      key: "order", header: "#", width: "56px", numeric: true,
      value: (r) => r.order,
    },
    { key: "name", header: "Description", width: "minmax(180px, 2fr)", value: (r) => r.name },
    {
      key: "holding", header: "Holding description", width: "minmax(180px, 2fr)",
      hideBelow: "lg", value: (r) => truncateHolding(r.holdingTaskDescription),
    },
    {
      key: "gate", header: "Gate relevance", width: "130px", hideBelow: "md",
      render: (r) => (r.gateRelevance ? <Badge appearance="tint">Yes</Badge> : <span>—</span>),
    },
    {
      key: "date", header: "Completion date", width: "140px", hideBelow: "md",
      render: (r) => (r.isCompletionDate ? <Badge appearance="tint">Required</Badge> : <span>—</span>),
    },
    {
      key: "status", header: "Status", width: "110px",
      render: (r) => <StateChip state={r.status === 0 ? "Active" : "Inactive"} />,
    },
    {
      key: "actions", header: "", width: "180px",
      render: (r) => (
        <span className={s.actions}>
          {action("Edit", <EditRegular />, r, () => onEdit(r))}
          {action(
            r.status === 0 ? "Deactivate" : "Activate",
            r.status === 0 ? <PauseRegular /> : <PlayRegular />,
            r, () => onToggleActive(r),
          )}
          {action("Toggle completion date", <CalendarLtrRegular />, r,
            () => onToggleCompletionDate(r))}
          {action("Delete", <DeleteRegular />, r, () => onDelete(r))}
        </span>
      ),
    },
  ];

  return (
    <div className={s.wrap}>
      <CommandBar commands={commands} />
      <DataGrid
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        loading={isLoading}
        emptyMessage={MSG.noTasks}
        height={Math.min(360, 56 + rows.length * 44) || 160}
      />
    </div>
  );
}

/** The reorder list. `@dnd-kit` is not a dependency here, so moves are explicit buttons. */
function ReorderList({
  ids, gate, scopeId, onChange,
}: {
  ids: string[];
  gate: GateRow | null;
  scopeId: string | null;
  onChange: (next: string[]) => void;
}) {
  const s = useStyles();
  const { tasks } = useScopeTasks(scopeId, gate?.id ?? null);
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const move = (index: number, delta: -1 | 1) => {
    const next = [...ids];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  if (ids.length === 0) return <span className={s.note}>{MSG.noTasks}</span>;

  return (
    <div>
      {ids.map((id, i) => (
        <div key={id} className={s.reorderRow}>
          <span className={s.reorderName}>{byId.get(id)?.name ?? id}</span>
          <Button
            appearance="subtle" size="small" icon={<ArrowUpRegular />}
            aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}
          />
          <Button
            appearance="subtle" size="small" icon={<ArrowDownRegular />}
            aria-label="Move down" disabled={i === ids.length - 1} onClick={() => move(i, 1)}
          />
        </div>
      ))}
    </div>
  );
}
