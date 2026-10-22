/**
 * Application Settings — Project Gates. Replaces the canvas 'Admin Project Gates Approvals Screen'.
 *
 * Gate-level and checklist-task-level approval templates per country × technology: who must
 * contribute, approve and be notified when a project moves through a cluster gate.
 *
 * Rules (and the write plans) live in `./rules.ts`, Dataverse reads in `@/data/adminGatesApprovals.ts`,
 * query and write wiring in `./hooks.ts` (writes run through `@/data/runPlan`).
 *
 * Reusable components: page states `useQueryHealth` + `QueryStates`, banners `NoticeBar`, the
 * editor `usePanelState`, dialogs `useConfirmDialog` (closeFirst), the overlay and per-row
 * pending state `useBusyRunner`, and the collapse state `useToggleSet` scoped per
 * country × technology.
 *
 * Access: `useAdminAccess()` (the same rule the header and admin rail use) decides `canEdit`. A
 * user without it can open the editor and read it, but every control that writes is disabled
 * and every write handler refuses with `NO_PERMISSION_MESSAGE`.
 */
import { useMemo } from "react";
import { makeStyles, Text, tokens } from "@fluentui/react-components";
import {
  ConfirmDialog, CountryTechnologyPicker, LoadingOverlay, NoticeBar, QueryStates, useNotify,
  useQueryHealth,
} from "@/components";
import { useAdminAccess } from "@/app/useCurrentUser";
import { useBusyRunner } from "@/features/shared/useBusyRunner";
import { useConfirmDialog, type ConfirmState } from "@/features/shared/useConfirmDialog";
import { useCountryTechnologySelection } from "@/features/shared/useCountryTechnologySelection";
import { usePanelState } from "@/features/shared/usePanelState";
import { useToggleSet } from "@/features/shared/useToggleSet";
import { useCountries } from "@/data/countries";
import { GATE_COUNTRY_RULE, GATE_DEFAULT, pickerCountries } from "@/domain/countryPicker";
import { GATE_TECHNOLOGIES } from "@/domain/technology";
import { userErrorText } from "@/platform/userMessage";
import { space } from "@/theme/tokens";
import { ApprovalsPanel } from "./ApprovalsPanel";
import { GateTable } from "./GateTable";
import {
  useDeleteTask, useGatesDataset, useProjectStates, useResetGate, useSaveTemplate, useToggleActive,
} from "./hooks";
import {
  buildGateRows, collapseScope, deleteConfirmationText, deletingText, emptyTaskForm,
  gateEditorTarget, gateLabel, hasGateConflict, headline, NO_PERMISSION_MESSAGE, resetConfirmationText, savingGateText,
  savingTaskText, seedGateForm, seedTaskForm, taskCandidates, toChecklistPayload, toGatePayload,
  type ApprovalForm, type EditorTarget, type GateContext, type GateRow, type TaskRow,
} from "./rules";

/** The +/- expander's accessible name on this screen ("Expand Germany technologies"). */
const toggleLabel = (open: boolean, c: { name: string }) => `${open ? "Collapse" : "Expand"} ${c.name} technologies`;

const useStyles = makeStyles({
  root: {
    display: "flex", alignItems: "stretch", columnGap: "5px",
    minHeight: "100%", backgroundColor: tokens.colorNeutralBackground3,
    paddingTop: "5px", paddingBottom: "5px", paddingLeft: "5px", paddingRight: "5px",
    boxSizing: "border-box",
  },
  content: {
    flexGrow: 1, minWidth: 0,
    display: "flex", flexDirection: "column", rowGap: space.s,
    backgroundColor: tokens.colorNeutralBackground1,
    paddingLeft: space.l, paddingRight: "10px", paddingBottom: space.l,
    overflowX: "auto", overflowY: "auto",
  },
  headline: {
    display: "flex", alignItems: "center", minHeight: "64px",
    fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightRegular,
  },
});

interface EditorState {
  target: EditorTarget;
  initialForm: ApprovalForm;
}

type ConfirmKind = "delete" | "reset";
/** The delete dialog names the clicked row; the reset dialog reads the open editor. */
type ConfirmPayload = { row: GateRow; task: TaskRow } | null;

export default function ProjectGatesSettingsScreen() {
  const styles = useStyles();
  const notify = useNotify();
  const canEdit = useAdminAccess();

  // Project Gates reads every country, active and inactive (unfiltered).
  const countries = useCountries({ includeInactive: true });
  const states = useProjectStates();
  const rail = useMemo(() => pickerCountries(countries.data ?? [], GATE_COUNTRY_RULE), [countries.data]);

  // First country / first technology (Germany / Wind) until the user picks.
  const { selection, country, select } = useCountryTechnologySelection({
    countries: rail, technologies: GATE_TECHNOLOGIES, defaultTo: GATE_DEFAULT,
  });
  const ctx: GateContext | null = selection && country
    ? { countryId: selection.countryId, countryName: country.name, technology: selection.technology }
    : null;
  const dataset = useGatesDataset(ctx?.countryId, ctx?.technology);

  /** Scoped per country × technology, ids = gate order (`collapseKey`). */
  const collapsedSet = useToggleSet(undefined, collapseScope(ctx));
  const runner = useBusyRunner();
  const editor = usePanelState<EditorState>();
  const dialog = useConfirmDialog<ConfirmKind, ConfirmPayload>();

  const countryId = ctx?.countryId ?? "";
  const technology = ctx?.technology ?? GATE_TECHNOLOGIES[0]!.code;
  const toggle = useToggleActive(countryId, technology, canEdit);
  const save = useSaveTemplate(countryId, technology, canEdit);
  const reset = useResetGate(countryId, technology, canEdit);
  const remove = useDeleteTask(countryId, technology, canEdit);

  const allStates = useMemo(() => states.data ?? [], [states.data]);
  const rows = useMemo(
    () => buildGateRows(allStates, dataset.data?.templates ?? []),
    [allStates, dataset.data?.templates],
  );
  const collapsed = new Set(rows.filter((r) => collapsedSet.has(String(r.order))).map((r) => r.order));

  /* ───────────────────────────────────────────────────────────── editors ── */

  const openEditor = (target: EditorTarget, initialForm: ApprovalForm) => editor.open({ target, initialForm });

  const openGate = (row: GateRow) => {
    if (!dataset.data) return;
    openEditor(gateEditorTarget(allStates, row), seedGateForm(row, dataset.data.people));
  };

  const openAddTask = (row: GateRow) => {
    if (!dataset.data) return;
    const candidates = taskCandidates(dataset.data, row.state);
    openEditor(
      { kind: "task", mode: "create", row, label: gateLabel(allStates, row.state), candidates },
      emptyTaskForm(candidates),
    );
  };

  const openEditTask = (row: GateRow, task: TaskRow) => {
    if (!dataset.data) return;
    openEditor(
      { kind: "task", mode: "edit", row, label: gateLabel(allStates, row.state), task, candidates: [] },
      seedTaskForm(task, dataset.data.people),
    );
  };

  /*
   * Every write below runs its success toast / close and its catch INSIDE `runner.run`, so the
   * overlay clears last — the order the screen has always had.
   */
  const handleSave = async (form: ApprovalForm) => {
    if (!editor.panel || !ctx) return;
    const t = editor.panel.target;
    if (!canEdit) {
      editor.setError(NO_PERMISSION_MESSAGE);
      return;
    }
    editor.setError(undefined);
    // On failure the panel stays open with the form intact; the raw detail is traced, not shown.
    const failed = (error: unknown) => editor.setError(userErrorText(error, "save the approvals"));
    if (t.kind === "gate") {
      const id = t.row.template?.id;
      await runner.run(savingGateText(ctx, t.label), async () => {
        try {
          await save.mutateAsync({
            kind: "gate", id,
            payload: toGatePayload(form, { countryId: ctx.countryId, technology: ctx.technology, state: t.row.state, label: t.label, isCreate: !id }),
          });
          notify.success(`Approvals for '${t.label ?? t.row.description}' were saved.`);
          editor.close();
        } catch (error) {
          failed(error);
        }
      });
      return;
    }
    const checklist = (t.mode === "create" ? t.candidates : t.task ? [t.task.checklist] : [])
      .find((c) => c.id === form.checklistId);
    if (!checklist) return; // Save is disabled without a Check List.
    const id = t.mode === "edit" ? t.task?.approval.id : undefined;
    await runner.run(savingTaskText(ctx, checklist.name), async () => {
      try {
        await save.mutateAsync({
          kind: "task", id,
          payload: toChecklistPayload(form, { checklist, state: t.row.state, isCreate: !id }),
        });
        notify.success(`Approvals for check list '${checklist.name}' were saved.`);
        editor.close();
      } catch (error) {
        failed(error);
      }
    });
  };

  const runReset = async () => {
    const t = editor.panel?.target;
    if (!t || t.kind !== "gate" || !t.row.template || !ctx) return;
    if (!canEdit) {
      editor.setError(NO_PERMISSION_MESSAGE);
      return;
    }
    const id = t.row.template.id;
    editor.setError(undefined);
    await runner.run(
      `Approvals data for ${headline(ctx)}\nGate: '${t.label ?? t.row.description}' will be reset, please wait...`,
      async () => {
        try {
          await reset.mutateAsync(id);
          editor.close();
          notify.success(`Gate '${t.label ?? t.row.description}' was reset.`);
        } catch (error) {
          editor.setError(userErrorText(error, "reset the gate"));
        }
      },
    );
  };

  const runDelete = async (s: ConfirmState<ConfirmKind, ConfirmPayload>) => {
    if (s.kind !== "delete" || !s.payload || !ctx) return;
    if (!canEdit) {
      notify.error(NO_PERMISSION_MESSAGE);
      return;
    }
    const { task } = s.payload;
    await runner.run(deletingText(ctx, task.checklist.name), async () => {
      try {
        await remove.mutateAsync(task.approval.id);
        notify.success(`The approval of check list '${task.checklist.name}' was deleted.`);
      } catch (error) {
        notify.error(userErrorText(error, "delete the check list approval"));
      }
    });
  };

  const handleToggle = (kind: "gate" | "task", id: string, current: boolean, subject: string) => {
    if (!canEdit) {
      notify.error(NO_PERMISSION_MESSAGE);
      return Promise.resolve();
    }
    return runner.track(id, async () => {
      try {
        await toggle.mutateAsync({ kind, id, active: !current });
      } catch (error) {
        // The optimistic flip has already been reverted by the hook.
        notify.error(userErrorText(error, `change the status of ${subject}`));
      }
    });
  };

  /* ───────────────────────────────────────────────────────────── render ── */

  const queries = ctx ? [countries, states, dataset] : [countries, states];
  // The page has always treated ANY failed query as the error state (a failed refetch included),
  // with the first failing query's error in countries → states → dataset order.
  const health = useQueryHealth(queries, { fatalWhen: "any-error" });

  const empty = !ctx
    ? {
      when: true,
      title: "No countries to configure",
      description: "None of the configured countries (Germany, France, Poland, Italy, Finland, Croatia) exist in the Countries table.",
    }
    : {
      when: rows.length === 0,
      title: "No gates to show",
      description: "No project state is marked 'Is Visible On Checklist' with an order below 6.",
    };

  const renderGates = () => {
    if (!dataset.data || !ctx) return null;
    const duplicates = rows.filter((r) => r.templateCount > 1);
    return (
      <>
        {dataset.data.checklistError ? (
          <NoticeBar intent="warning" title="Check list task approvals are unavailable">
            {dataset.data.checklistError} Gate approvals can still be edited.
          </NoticeBar>
        ) : null}
        {dataset.data.peopleError ? (
          <NoticeBar intent="info">
            Portfolio Manager names could not be loaded; they show as "Unknown user".
          </NoticeBar>
        ) : null}
        {duplicates.length > 0 ? (
          <NoticeBar intent="warning" title="Duplicate gate approvals">
            {duplicates.map((d) => d.description).join(", ")} {duplicates.length === 1 ? "has" : "have"} more than one saved default approval. The oldest is shown.
          </NoticeBar>
        ) : null}
        <GateTable
          rows={rows}
          dataset={dataset.data}
          canEdit={canEdit}
          collapsed={collapsed}
          isPending={runner.isPending}
          onToggleCollapse={(order) => collapsedSet.toggle(String(order))}
          onToggleGate={(row) => row.template && void handleToggle("gate", row.template.id, row.template.gateActive, `gate '${row.description}'`)}
          onToggleTask={(task) => void handleToggle("task", task.approval.id, task.approval.gateActive, `task '${task.checklist.name}'`)}
          onEditGate={openGate}
          onAddTask={openAddTask}
          onEditTask={openEditTask}
          onDeleteTask={(row, task) => dialog.ask("delete", { row, task })}
        />
      </>
    );
  };

  const editorTarget = editor.panel?.target;
  const conflict = editorTarget?.kind === "gate"
    ? hasGateConflict(editorTarget.row.template?.id, editorTarget.row, dataset.data?.templates ?? [])
    : false;
  const confirmState = dialog.state;

  return (
    <div className={styles.root}>
      {rail.length > 0 && selection ? (
        <CountryTechnologyPicker
          countries={rail}
          technologies={GATE_TECHNOLOGIES}
          value={selection}
          onChange={select}
          countryClick="select"
          toggleLabel={toggleLabel}
          highlightCollapsedSelection
          emptyText="No configured countries were found."
        />
      ) : null}
      <section className={styles.content} aria-label="Project gate approvals">
        {/* The shell header carries the page title (h1); this is the section headline. */}
        <Text as="h2" className={styles.headline}>{headline(ctx)}</Text>
        <QueryStates
          health={health}
          loadingLabel="Loading gate approvals…"
          fatal={{
            title: "Gate approvals could not be loaded",
            text: (error) => userErrorText(error, "load the gate approvals"),
            retryLabel: "Try again",
          }}
          empty={empty}
        >
          {renderGates}
        </QueryStates>
      </section>

      {editor.panel && ctx ? (
        <ApprovalsPanel
          key={editor.key}
          target={editor.panel.target}
          initialForm={editor.panel.initialForm}
          technology={ctx.technology}
          conflict={conflict}
          canEdit={canEdit}
          saving={runner.busy !== undefined}
          error={editor.error ?? null}
          onSave={(form) => void handleSave(form)}
          onReset={() => dialog.ask("reset", null)}
          onCancel={editor.close}
        />
      ) : null}

      {confirmState?.kind === "delete" && confirmState.payload && ctx ? (
        <ConfirmDialog
          open
          title="Delete Check List Approval Item?"
          description={deleteConfirmationText(ctx, confirmState.payload.row.description, confirmState.payload.task.checklist.name)}
          confirmText="Delete" confirmIcon="delete" destructive
          onConfirm={() => void dialog.confirm(runDelete, { closeFirst: true })}
          onCancel={dialog.cancel}
        />
      ) : null}
      {confirmState?.kind === "reset" && ctx && editorTarget?.kind === "gate" ? (
        <ConfirmDialog
          open
          title="Reset Gate?"
          description={resetConfirmationText(ctx, editorTarget.label ?? editorTarget.row.description)}
          confirmText="Reset Gate" confirmWidth={120} destructive
          onConfirm={() => void dialog.confirm(runReset, { closeFirst: true })}
          onCancel={dialog.cancel}
        />
      ) : null}

      {/* The multi-line canvas texts keep their line breaks (shared overlay, pre-line). */}
      {runner.busy !== undefined ? <LoadingOverlay portal label={runner.busy} /> : null}
    </div>
  );
}
