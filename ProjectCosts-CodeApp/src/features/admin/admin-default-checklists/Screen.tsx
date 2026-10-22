/**
 * Application Settings — Check List Settings. Replaces the canvas
 * 'Admin Project Default Checklists Screen'.
 *
 * Blocks: tab strip · cluster accordion · cluster command bar · task table (`TaskTable`) ·
 * Add/Edit drawer (`TaskEditorDrawer`) · Reorder drawer (the shared `ReorderPanel`) ·
 * confirmation dialogs · busy + result feedback (missing in the canvas). The header and
 * navigation come from master's app shell and admin left nav (route
 * `/admin/default-checklists`); this screen renders the content only. Outcomes of completed
 * actions are app toasts (`useNotify`); load failures and in-panel save errors stay
 * `MessageBar`s.
 *
 * Shared building blocks: tab strip `SettingsTabStrip`, page / section states `useQueryHealth`
 * + `QueryStates`, load bars `NoticeBar` (small Retry), accordion `SettingsAccordion`, cluster
 * commands `CommandBar` (canvas disabled greys), writes `useBusyRunner`, panels
 * `usePanelState`, editor touch `useTouched`, dialogs `useConfirmDialog` (`closeFirst`), live
 * region `VisuallyHidden`.
 *
 * Access: every write is gated by the admin rule (`useAdminAccess`, with its local-run bypass);
 * a non-admin sees the screen read-only (commands, row actions and Save disabled).
 *
 * Every panel, dialog, selection and fold state is component state, so it starts closed and
 * collapsed on every visit; only the selected tab lives in the URL (`?tab=`).
 */
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Spinner, Text, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import {
  CommandBar, ConfirmDialog, LoadingOverlay, NoticeBar, QueryStates, ReorderPanel, SettingsAccordion,
  SettingsTabStrip, VisuallyHidden, useNotify,
  useQueryHealth,
} from "@/components";
import { useAdminAccess } from "@/app/useCurrentUser";
import { useBusyRunner } from "@/features/shared/useBusyRunner";
import { useConfirmDialog } from "@/features/shared/useConfirmDialog";
import { usePanelState } from "@/features/shared/usePanelState";
import { useTouched } from "@/features/shared/useTouched";
import {
  RenumberAfterDeleteError, TaskCreatedIdUnknownError, TaskStatusNotSetError,
  type ChecklistTask, type TaskForm,
} from "@/data/adminDefaultChecklists";
import { palette } from "@/theme/tokens";
import {
  useChecklistClusters, useChecklistLocks, useChecklistPrivileges, useChecklistTabs,
  useChecklistTasks, useReorder, useSaveTask, useSetActive, useSoftDelete, useToggleCompletion,
} from "./hooks";
import { OUT_OF_SCOPE_MESSAGE, errorText, loadErrorText } from "./messages";
import {
  REORDER_HELP, REORDER_STALE_MESSAGE, busyText, clusterCaption, deleteDialog, emptyTaskForm, findGroup,
  formFromTask, groupTasksByCluster, isTaskFormValid, lockState, lockTooltipFor, nextOrder,
  renumberAfterDelete, reorderPatch, reorderSnapshotStale, resolveTabId, snapshotGroup,
  sortTabs, statusDialog, successText, taskFormChanged, type ReorderSnapshotRow,
} from "./rules";
import { TaskEditorDrawer } from "./TaskEditorDrawer";
import { TaskTable } from "./TaskTable";

const useStyles = makeStyles({
  /** `con_Admin_Project_Checklist_RightContent` — white, padding L10 R10 T15. */
  root: {
    display: "flex", flexDirection: "column", rowGap: "8px",
    backgroundColor: palette.white,
    paddingLeft: "10px", paddingRight: "10px", paddingTop: "15px", paddingBottom: "15px",
    minHeight: "100%", boxSizing: "border-box",
  },
  /** `Size: gblAppSizes.Font.Medium` (11 pt); Semibold when it is the last selected cluster. */
  caption: { fontSize: "14.7px", fontWeight: tokens.fontWeightRegular, color: palette.black },
  captionSelected: { fontWeight: tokens.fontWeightSemibold },
  commands: { paddingLeft: "0" },
  /**
   * `cmp_Admin_Project_Checklist_Header` page title. Master's admin shell does not show it, so
   * the screen renders it (as master's admin screens do).
   */
  title: { margin: "0", fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold, color: palette.black },
});

/** The page title (canvas header component). */
const PAGE_TITLE ="Checklist settings";

type Editor = {
  mode: "create" | "edit";
  clusterId: string;
  /** Set in edit mode (and after a create whose status step failed). */
  taskId: string | null;
  /** The tab the task belongs to — the BU source for the edit write. */
  tabId: string | null;
  form: TaskForm;
  /** The values the panel opened with; `form` differing from it makes the panel dirty. */
  seed: TaskForm;
};

/**
 * `snapshot` is the group as it was when the panel opened. Names and the patch come
 * from it, never from the live (refetchable) query; a live change marks the panel stale.
 */
type Reorder = { clusterId: string; snapshot: ReorderSnapshotRow[] };

/**
 * This screen shows a load error even over cached data (a failed refetch replaces the section,
 * as it always has), and "loading" is TanStack's `isLoading`. The shared `useQueryHealth`
 * options say exactly that.
 */
const AS_SHOWN = { fatalWhen: "any-error", loadingWhen: "isLoading" } as const;

export default function CheckListSettingsScreen() {
  const styles = useStyles();
  const notify = useNotify();
  const [params, setParams] = useSearchParams();

  /* ─────────────────────────────────────────────────────────── queries ── */
  const tabsQuery = useChecklistTabs();
  const sortedTabs = useMemo(() => sortTabs(tabsQuery.data ?? []), [tabsQuery.data]);
  const tabId = resolveTabId(sortedTabs, params.get("tab"));
  const hasTabs = sortedTabs.length > 0;

  const clustersQuery = useChecklistClusters(hasTabs);
  const tasksQuery = useChecklistTasks(hasTabs ? tabId : null);
  const locksQuery = useChecklistLocks(hasTabs);
  useChecklistPrivileges(); // server-enforced: Dataverse still decides, a 403 is reported.
  /** The admin rule (with the local-run bypass): a non-admin gets a read-only screen. */
  const canEdit = useAdminAccess();

  const tabsHealth = useQueryHealth([tabsQuery], AS_SHOWN);
  const clustersHealth = useQueryHealth([clustersQuery], AS_SHOWN);

  const clusters = useMemo(() => clustersQuery.data ?? [], [clustersQuery.data]);
  const groups = useMemo(
    () => groupTasksByCluster(tasksQuery.data ?? [], clusters),
    [tasksQuery.data, clusters],
  );

  /* ────────────────────────────────────────────────────────── mutations ── */
  // The plan-building hooks take `canEdit`: the plan refuses itself when it is false (the screen
  // still refuses first, so the message lands on the right surface — panel vs toast).
  const saveTask = useSaveTask(tabId, canEdit);
  const toggleCompletion = useToggleCompletion(tabId, canEdit);
  const setActive = useSetActive(tabId, canEdit);
  const softDelete = useSoftDelete(tabId);
  const reorderMutation = useReorder(tabId);

  /* ─────────────────────────────────────────────────────────────── state ── */
  const [openClusters, setOpenClusters] = useState<string[]>([]);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const editor = usePanelState<Editor>();
  const touched = useTouched<"name">();
  const reorder = usePanelState<Reorder>();
  const dialog = useConfirmDialog<"status" | "delete", ChecklistTask>();
  /** Wraps every write: overlay text (or a row spinner), then success or a visible error. */
  // A new write replaces the previous outcome message (as the page banner did).
  const runner = useBusyRunner({ onStart: notify.dismissAll });

  const busy = runner.isBusy;
  // Locks unknown (query failed) or still loading → every row fails CLOSED
  // rather than allowing an edit the canvas would have blocked; each state has its own tooltip,
  // so a row is only called "in use by a Project Gate" when it actually is.
  const locksUnknown = locksQuery.isError;
  const locksLoading = !locksUnknown && !locksQuery.data;
  const rowLockTip = (task: ChecklistTask) =>
    lockTooltipFor(lockState(task.id, { isError: locksQuery.isError, data: locksQuery.data }));
  const rowLocked = (task: ChecklistTask) => rowLockTip(task) !== null;

  /* ───────────────────────────────────────────────────────────── events ── */
  const selectTab = (id: string) => {
    setParams((p) => { const next = new URLSearchParams(p); next.set("tab", id); return next; }, { replace: true });
  };

  const onToggleCluster = (id: string) => {
    setOpenClusters((open) => (open.includes(id) ? open.filter((c) => c !== id) : [...open, id]));
    setSelectedClusterId(id);
  };

  const openAdd = (clusterId: string) => {
    setSelectedClusterId(clusterId);
    touched.reset();
    editor.open({ mode: "create", clusterId, taskId: null, tabId, form: emptyTaskForm(), seed: emptyTaskForm() });
  };

  const openEdit = (task: ChecklistTask) => {
    if (rowLocked(task)) return;
    touched.reset();
    editor.open({
      mode: "edit", clusterId: task.clusterId ?? "", taskId: task.id, tabId: task.tabId ?? tabId,
      form: formFromTask(task), seed: formFromTask(task),
    });
  };

  const saveEditor = async () => {
    const current = editor.panel;
    if (!current) return;
    if (!canEdit) { editor.setError(OUT_OF_SCOPE_MESSAGE); return; }
    if (!isTaskFormValid(current.form)) { touched.touch("name"); return; }
    const tab = sortedTabs.find((t) => t.id === (current.tabId ?? tabId));
    if (!tab) { editor.setError("The selected country/technology no longer exists. Reload the page."); return; }
    try {
      await runner.run(busyText.save(current.form.name), () =>
        current.mode === "create" || !current.taskId
          ? saveTask.mutateAsync({
              mode: "create",
              args: { tab, clusterId: current.clusterId, form: current.form, order: nextOrder(groups.get(current.clusterId) ?? []) },
            })
          : saveTask.mutateAsync({ mode: "edit", id: current.taskId, form: current.form, tab }));
      editor.close();
      notify.success(successText.save);
    } catch (error) {
      if (error instanceof TaskStatusNotSetError) {
        // The row exists: a retry must UPDATE it, not create a second one. A
        // refused status write (403) shows the permission text, not "Save again to retry".
        editor.patch({ mode: "edit", taskId: error.createdId });
        editor.setError(errorText(error, "change checklist items", "Checklist item could not be saved."));
      } else if (error instanceof TaskCreatedIdUnknownError) {
        // Created, id unknown. Close the panel (no create-mode retry, so no duplicate);
        // `useSaveTask` invalidates on error, so the new row appears in the refetched list.
        editor.close();
        notify.warning(error.message);
      } else {
        editor.setError(errorText(error, "save checklist items", "Checklist item could not be saved."));
      }
    }
  };

  const onToggleCompletion = async (task: ChecklistTask) => {
    if (rowLocked(task) || busy) return;
    if (!canEdit) { notify.error(OUT_OF_SCOPE_MESSAGE); return; }
    try {
      // Pending state on the row itself; the rest of the screen stays visible (read-only).
      // The label is announced by the live region below (`runner.inlineLabel`).
      await runner.run(busyText.completion(task.name), () => toggleCompletion.mutateAsync(task), { inline: task.id });
      notify.success(successText.completion);
    } catch (error) {
      notify.error(errorText(error, "change checklist items", "Completion Date could not be changed."));
    }
  };

  const confirmStatus = () => dialog.confirm(async ({ payload: task }) => {
    if (!canEdit) { notify.error(OUT_OF_SCOPE_MESSAGE); return; }
    const next = !task.isActive;
    try {
      await runner.run(busyText.save(task.name), () => setActive.mutateAsync({ id: task.id, isActive: next }));
      notify.success(successText.status(next));
    } catch (error) {
      notify.error(errorText(error, "change checklist items", "The status could not be changed."));
    }
  }, { closeFirst: true });

  const confirmDelete = () => dialog.confirm(async ({ payload: task }) => {
    if (!canEdit) { notify.error(OUT_OF_SCOPE_MESSAGE); return; }
    // Case-insensitive lookup, so a GUID case mismatch never skips the renumber.
    const found = findGroup(groups, task.clusterId);
    const group = found?.tasks ?? [];
    try {
      await runner.run(busyText.remove(task.name), () =>
        softDelete.mutateAsync({ id: task.id, renumber: renumberAfterDelete(group, task) }));
      notify.success(successText.remove);
    } catch (error) {
      const text = errorText(error, "delete checklist items", "Checklist item could not be deleted.");
      const reorderClusterId = found?.key ?? task.clusterId ?? undefined;
      if (error instanceof RenumberAfterDeleteError && reorderClusterId) {
        // The toast's Reorder opens the panel with the group as it is WHEN clicked.
        notify.warning(text, { action: { label: "Reorder", onClick: () => openReorderRef.current(reorderClusterId) } });
      } else if (error instanceof RenumberAfterDeleteError) {
        notify.warning(text);
      } else {
        notify.error(text);
      }
    }
  }, { closeFirst: true });

  const liveGroup = (clusterId: string) => findGroup(groups, clusterId)?.tasks ?? [];

  const openReorder = (clusterId: string) => {
    // The canvas "reorderChecklist" branch (L359-373) never sets
    // `locSelectedCluster`, so opening Reorder leaves the caption's font weight unchanged.
    reorder.open({ clusterId, snapshot: snapshotGroup(liveGroup(clusterId)) });
  };
  // A toast action outlives the render that created it; it must call the CURRENT `openReorder`
  // (current groups), never the one captured when the toast was dispatched.
  const openReorderRef = useRef(openReorder);
  useLayoutEffect(() => { openReorderRef.current = openReorder; });

  // A refetch while the panel is open (window focus, another user, a partial write)
  // must not silently change what Save writes.
  const reorderStale = reorder.panel !== null && tasksQuery.isSuccess
    && reorderSnapshotStale(reorder.panel.snapshot, liveGroup(reorder.panel.clusterId));

  const saveReorder = async (ordered: readonly ReorderSnapshotRow[]) => {
    const current = reorder.panel;
    if (!current || reorderStale) return;
    if (!canEdit) { reorder.setError(OUT_OF_SCOPE_MESSAGE); return; }
    const rows = reorderPatch(current.snapshot, ordered.map((t) => t.id));
    try {
      await runner.run(busyText.reorder(), () => reorderMutation.mutateAsync(rows));
      reorder.close();
      notify.success(successText.reorder);
    } catch (error) {
      reorder.setError(errorText(error, "reorder checklist items", "The new order could not be saved."));
    }
  };

  /* ───────────────────────────────────────────────────────────── render ── */
  const heading = <Text as="h1" className={styles.title}>{PAGE_TITLE}</Text>;

  if (tabsHealth.phase !== "ready" || !hasTabs) {
    const states = (
      <QueryStates
        health={tabsHealth}
        loadingLabel="Loading checklist settings…"
        fatal={{ as: "notice", text: (e) => loadErrorText(e, "The checklist country/technology combinations") }}
        empty={{
          when: !hasTabs,
          title: "No checklist country/technology combinations are configured",
          description: "Add a Checklist Country And Technology record in Dataverse to maintain its default checklist.",
        }}
      >
        {() => null}
      </QueryStates>
    );
    // The loading state renders on its own; the error and empty states sit in the page body.
    return tabsHealth.phase === "loading"
      ? <>{heading}{states}</>
      : <div className={styles.root}>{heading}{states}</div>;
  }

  const commandsEnabled = !busy && tasksQuery.isSuccess && canEdit;
  const editorPanel = editor.panel;

  return (
    <div className={styles.root}>
      {heading}

      {/* Tab strip */}
      <SettingsTabStrip
        tabs={sortedTabs.map((t) => ({ id: t.id, label: t.name }))}
        selected={tabId ?? undefined}
        onSelect={selectTab}
        ariaLabel="Country and technology"
        tabTestIdPrefix="checklist-tab"
        size="small"
        bandHeight={52}
        layout="block"
      />

      {locksUnknown ? (
        <NoticeBar
          intent="warning"
          action={{ label: "Retry", ariaLabel: "Retry loading Project Gate usage", onClick: () => void locksQuery.refetch() }}
        >
          {loadErrorText(locksQuery.error, "Project Gate usage")} Items cannot be changed until it loads.
        </NoticeBar>
      ) : locksLoading ? (
        <Spinner size="tiny" labelPosition="after" label="Checking which items are in use by a Project Gate…" />
      ) : null}

      {tasksQuery.isError ? (
        <NoticeBar
          intent="error"
          action={{ label: "Retry", ariaLabel: "Retry loading tasks", onClick: () => void tasksQuery.refetch() }}
        >
          {loadErrorText(tasksQuery.error, "The checklist tasks")}
        </NoticeBar>
      ) : null}

      {/* Cluster accordion */}
      <QueryStates
        health={clustersHealth}
        loadingLabel="Loading clusters…"
        fatal={{
          as: "notice",
          text: (e) => loadErrorText(e, "The project clusters"),
          retryAriaLabel: "Retry loading clusters",
        }}
        empty={{
          when: clusters.length === 0,
          title: "No project clusters are shown on the checklist",
          description: "No Project State is marked 'Is Visible On Checklist'.",
        }}
      >
        {() => (
          <SettingsAccordion
            variant="light"
            border="folded"
            itemInsetRight={10}
            panelPadding={{ left: 20, top: 10, bottom: 12 }}
            openItems={openClusters}
            onToggle={onToggleCluster}
            items={clusters.map((cluster) => {
              const caption = clusterCaption(cluster.name);
              return {
                id: cluster.id,
                testId: `checklist-cluster-${cluster.id}`,
                title: (
                  <span className={mergeClasses(styles.caption, selectedClusterId === cluster.id && styles.captionSelected)}>
                    {caption}
                  </span>
                ),
                content: (
                  <>
                    {/* Cluster command bar */}
                    <CommandBar
                      className={styles.commands}
                      ariaLabel={`${caption} commands`}
                      testIdPrefix={`checklist-command-${cluster.id}`}
                      commands={[
                        { key: "add-task", label: "Add Task", icon: "Add", enabled: commandsEnabled },
                        { key: "reorder", label: "Reorder", icon: "Reorder", enabled: commandsEnabled },
                      ]}
                      onCommand={(key) => (key === "add-task" ? openAdd(cluster.id) : openReorder(cluster.id))}
                    />
                    {/* Task table */}
                    {tasksQuery.isLoading ? (
                      <Spinner size="tiny" label="Loading tasks…" />
                    ) : tasksQuery.isSuccess ? (
                      <TaskTable
                        clusterId={cluster.id}
                        caption={caption}
                        tasks={groups.get(cluster.id) ?? []}
                        lockTip={rowLockTip}
                        busy={busy}
                        readOnly={!canEdit}
                        pendingTaskId={runner.inline ?? null}
                        onToggleCompletion={(t) => void onToggleCompletion(t)}
                        onChangeStatus={(t) => { if (!rowLocked(t)) dialog.ask("status", t); }}
                        onEdit={openEdit}
                        onDelete={(t) => { if (!rowLocked(t)) dialog.ask("delete", t); }}
                      />
                    ) : null}
                  </>
                ),
              };
            })}
          />
        )}
      </QueryStates>

      {/* Add/Edit drawer */}
      <TaskEditorDrawer
        open={editorPanel !== null}
        mode={editorPanel?.mode ?? "create"}
        form={editorPanel?.form ?? emptyTaskForm()}
        touched={editorPanel !== null && touched.isTouched("name")}
        dirty={editorPanel ? taskFormChanged(editorPanel.seed, editorPanel.form) : false}
        error={editor.error ?? null}
        saving={saveTask.isPending}
        readOnly={!canEdit}
        onChange={(form) => editor.patch({ form })}
        onTouch={() => touched.touch("name")}
        onSave={() => void saveEditor()}
        onCancel={editor.close}
      />

      {/* Reorder drawer (remounted per open, so it starts from the new snapshot) */}
      <ReorderPanel
        key={reorder.key}
        open={reorder.panel !== null}
        title="Reorder checklist"
        items={reorder.panel?.snapshot ?? []}
        getId={(t) => t.id}
        getLabel={(t) => t.name}
        listAriaLabel="Checklist order"
        hint={REORDER_HELP}
        savingLabel="Saving…"
        bodyGap={12}
        bodyPaddingBottom={20}
        saving={reorderMutation.isPending}
        error={reorder.error ?? null}
        warning={reorderStale ? REORDER_STALE_MESSAGE : null}
        canSave={(changed) => changed && !reorderStale && canEdit}
        onSave={(ordered) => void saveReorder(ordered)}
        onCancel={reorder.close}
        saveTestId="checklist-reorder-save"
        cancelTestId="checklist-reorder-cancel"
        listProps={{
          showPosition: true,
          buttonLabels: "describedby",
          announcePeriod: true,
          emptyText: "There are no tasks to reorder in this cluster.",
          itemTestId: (t) => `reorder-item-${t.id}`,
        }}
      />

      {/* Confirmation dialogs */}
      {dialog.state?.kind === "status" ? (
        <ConfirmDialog
          open
          {...statusDialog(dialog.state.payload)}
          confirmWidth={128}
          onConfirm={() => void confirmStatus()}
          onCancel={dialog.cancel}
        />
      ) : null}
      {dialog.state?.kind === "delete" ? (
        <ConfirmDialog
          open
          {...deleteDialog(dialog.state.payload)}
          destructive confirmIcon="delete"
          onConfirm={() => void confirmDelete()}
          onCancel={dialog.cancel}
        />
      ) : null}

      {/* Busy overlay (the canvas set the text but rendered nothing) */}
      {/* `portal`: a save started from a drawer shows the scrim above that drawer. */}
      {runner.busy !== undefined ? <LoadingOverlay portal label={runner.busy} /> : null}
      {runner.inline !== undefined ? (
        <VisuallyHidden as="div" role="status" aria-live="polite">{runner.inlineLabel}</VisuallyHidden>
      ) : null}
    </div>
  );
}
