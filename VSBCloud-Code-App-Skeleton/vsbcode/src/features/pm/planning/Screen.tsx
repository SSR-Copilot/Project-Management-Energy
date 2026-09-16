/**
 * Project Planning Screen — layout and composition only.
 *
 * Canvas screen: `Project Planning Screen` (PM app)
 *   178 controls · 3 562 lines of Power Fx · 43 substantive blocks · band M
 *
 * Three tabs over one `Project Plannings` row plus two child sets: General (cooperation,
 * planning basis, permit procedure, height limitation, the Permits sub-grid), Repowering,
 * and Aquisition Status (LLAs in personam / in rem).
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  - `colPlanningFormValidation` and its ~30 `UpdateIf` handlers (see rules.ts)
 *  - the commented-out bulk permit/acquisition save block in `ButtonsSave.OnChange`
 *  - `but_…_ApplyDefault`-style hidden dispatch buttons and the SVG selection dot
 *  - the duplicated leave-confirmation wiring on the logo and the left nav
 *
 * Every rule this screen branches on lives in `rules.ts`.
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Field, Input, Textarea, Dropdown, Option, Radio, RadioGroup, Switch, Text, Badge,
  Tab, TabList, MessageBar, MessageBarBody, MessageBarTitle, makeStyles, tokens,
} from "@fluentui/react-components";
import {
  AddRegular, EditRegular, DeleteRegular, LockClosedRegular, EraserRegular,
} from "@fluentui/react-icons";
import {
  PageHeader, CommandBar, FormPanel, ConfirmDialog, LoadingOverlay, DataGrid,
  NumericInput, StateChip, EmptyState, RecordFooter, Card, type Command, type Column,
} from "@/components";
import { useProjectContext } from "@/features/shared/useProjectContext";
import { space, media, semantic } from "@/theme/tokens";
import { useAppStore } from "@/store/appStore";
import { formatAuditStamp } from "@/features/pm/general-data/rules";
import {
  PLANNING_TABS, parseTab, pageLock, PAGE_LOCK_TITLE, isPageLocked, canEditPlanning,
  canEditLegalPlanningBasis, canSwitchTabs, validatePlanning, planningMessages,
  dirtyFields, isDirty, canSave, saveDisabledReason,
  applyCooperationChange, applyRepoweringChange, applyHeightToggle,
  showCooperationPartner, showCooperationDetails, cooperationDetailsEditable,
  showSecuredAccess, showRepoweringDetails, showHeightLimit,
  togglePermitSelection, canSavePermit, permitPanelErrors, permitCommandState,
  emptyPermitDraft, permitDraftFrom, PERMIT_DATE_TYPES,
  permitDateCell, permitPanelTitle, PERMIT_GRID_COLUMNS, PERMIT_COMMAND_LABELS,
  PERMIT_PANEL_LABELS, GENERAL_TAB_LABELS, REPOWERING_TAB_LABELS,
  validateAquisition, canSaveAquisition, aquisitionPanelErrors, securedPercent,
  storedPercentToDisplay, aquisitionDraftFrom, emptyAquisitionDraft, sortByTypeOrder,
  LLA_TYPE_VALUE, LLA_TYPE_LABEL, PERCENT_NOT_APPLICABLE,
  YES_NO_UNKNOWN, PLANNING_BASIS_CATEGORIES, yesNoUnknownLabel, MAX_LENGTH, charCounter,
  LEAVE_CONFIRMATION, SAVE_SUCCESS, SAVE_ERROR_PREFIX,
  type PlanningForm, type PlanningTabKey, type PermitRow, type PermitDraft,
  type AquisitionDraft, type AquisitionStatusRow, type LlaType,
} from "./rules";
import {
  usePlanningProject, useProjectPlanning, usePermits, useAquisitionStatuses,
  useLegalPlanningBasisOptions, usePermitProcedureOptions, useAquisitionSeed,
  useSavePlanning, useSavePermit, useDeletePermit, useSaveAquisition, useClearAquisition,
} from "./hooks";

const useStyles = makeStyles({
  grid: {
    display: "grid", gap: space.l,
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    [media.belowMd]: { gridTemplateColumns: "1fr" },
  },
  wide: { gridColumn: "1 / -1" },
  panel: { display: "flex", flexDirection: "column", gap: space.m },
  // GUIDE q23 — Plan/Actual radios stacked above the date value, inside one Field.
  dateGroup: { display: "flex", flexDirection: "column", gap: space.s },
  counter: {
    fontSize: "11px", color: tokens.colorNeutralForeground3, textAlign: "right",
    fontVariantNumeric: "tabular-nums",
  },
  lock: { display: "flex", flexDirection: "column", gap: space.xs },
  bullet: { display: "flex", gap: space.s, alignItems: "baseline" },
  hint: { color: tokens.colorNeutralForeground3, fontSize: "12px" },
  errors: {
    display: "flex", flexDirection: "column", gap: "2px",
    color: semantic.errorText, fontSize: "12px",
  },
  tabs: { marginBottom: space.s },
});

export default function PlanningScreen() {
  const s = useStyles();
  const { project: selected, canEdit, isLoading: contextLoading } = useProjectContext();
  const projectId = selected?.projectId;

  const [params, setParams] = useSearchParams();
  const tab: PlanningTabKey = parseTab(params.get("tab"));

  const { project, language, isLoading: projectLoading } = usePlanningProject(projectId);
  const planning = useProjectPlanning(project, canEdit);
  const permits = usePermits(planning.record?.id);
  const aquisition = useAquisitionStatuses(projectId);
  const legalOptions = useLegalPlanningBasisOptions(project?.countryId ?? null);
  const procedureOptions = usePermitProcedureOptions(project?.countryId ?? null);

  const seed = useAquisitionSeed();
  const save = useSavePlanning();
  const savePermit = useSavePermit();
  const deletePermit = useDeletePermit();
  const saveAquisition = useSaveAquisition();
  const clearAquisition = useClearAquisition();

  const [draft, setDraft] = useState<PlanningForm | null>(null);
  const [permitsTouched, setPermitsTouched] = useState(false);
  const [aquisitionTouched, setAquisitionTouched] = useState(false);

  const [selectedPermitId, setSelectedPermitId] = useState<string | null>(null);
  const [permitDraft, setPermitDraft] = useState<PermitDraft | null>(null);
  const [permitIsNew, setPermitIsNew] = useState(false);
  const [confirmDeletePermit, setConfirmDeletePermit] = useState(false);

  const [aquisitionRow, setAquisitionRow] = useState<AquisitionStatusRow | null>(null);
  const [aquisitionDraft, setAquisitionDraft] = useState<AquisitionDraft>(emptyAquisitionDraft());
  const [confirmClear, setConfirmClear] = useState(false);

  const baseline = planning.baseline;
  const form = draft ?? baseline;
  const gating = { project, canEdit };
  const unlocked = canEditPlanning(gating);
  const locked = isPageLocked(project);
  const validity = useMemo(() => validatePlanning(form, language), [form, language]);
  const dirty = dirtyFields(form, baseline);
  const selectedPermit = permits.permits.find((p) => p.id === selectedPermitId) ?? null;

  /* Rule 2 — the acquisition self-heal, once per project, only for the missing types. */
  useEffect(() => {
    if (!project || !canEdit) return;
    if (aquisition.isLoading || aquisition.types.length === 0) return;
    if (seed.isPending || seed.isSuccess) return;
    seed.mutate({
      project, types: aquisition.types, existing: aquisition.rows, canEdit,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, canEdit, aquisition.isLoading, aquisition.types.length]);

  const set = <K extends keyof PlanningForm>(field: K, value: PlanningForm[K]) =>
    setDraft((prev) => ({ ...(prev ?? baseline), [field]: value }));

  const goToTab = (next: PlanningTabKey) => {
    const p = new URLSearchParams(params);
    p.set("tab", next);
    setParams(p, { replace: true });
  };

  const saveState = { project, canEdit, form, baseline, language, busy: save.isPending };

  // GUIDE q22/q24: Save/Cancel render as the page's own bottom RecordFooter, not a top
  // command bar — the same convention General Data and Milestones already use. Cancel is
  // wired always-enabled per that convention (see `canReset`'s SOURCE DEFECT comment).
  const attemptSave = () => {
    if (!project) return;
    save.mutate(
      { project, record: planning.record, form, canEdit, language },
      {
        onSuccess: () => {
          setDraft(null);
          setPermitsTouched(false);
          setAquisitionTouched(false);
        },
      },
    );
  };
  const cancel = () => setDraft(null);

  const user = useAppStore((st) => st.session.user);
  const auditName = user?.displayName ?? null;
  const createdByText = formatAuditStamp(auditName, project?.createdOn ?? null);
  const modifiedByText = formatAuditStamp(auditName, project?.modifiedOn ?? null);

  /* ─────────────────────────────────────────────────────────── loading / gates */

  if (contextLoading || projectLoading || planning.isLoading) {
    return <LoadingOverlay mode="inline" label="Loading planning data…" />;
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

  if (locked) {
    return (
      <>
        <Header project={project} />
        <EmptyState
          icon={<LockClosedRegular fontSize={28} />}
          title={PAGE_LOCK_TITLE}
          description={
            <span className={s.lock}>
              {pageLock(project).map((e) => (
                <span key={e.reason} className={s.bullet}>
                  <span>{e.label}</span>
                  <span className={s.hint}>{e.hint}</span>
                </span>
              ))}
            </span>
          }
        />
      </>
    );
  }

  const problems = planningMessages(validity);

  // GUIDE q22 — three columns; the Plan/Actual type is folded into its date cell.
  const permitColumns: Column<PermitRow>[] = [
    { key: "name", header: PERMIT_GRID_COLUMNS.permit, value: (r) => r.name ?? "—" },
    {
      key: "submission", header: PERMIT_GRID_COLUMNS.submitted,
      value: (r) => permitDateCell(r.submissionDate, r.submissionDateType),
    },
    {
      key: "approval", header: PERMIT_GRID_COLUMNS.approved,
      value: (r) => permitDateCell(r.approvalDate, r.approvalDateType),
    },
  ];

  const permitCommands = permitCommandState(gating, selectedPermit);
  const permitBar: Command[] = [
    {
      key: "new", label: PERMIT_COMMAND_LABELS.newPermit, icon: <AddRegular />,
      disabled: !permitCommands.canNew || !planning.record,
      disabledReason: planning.record
        ? "You cannot edit this project."
        : "The planning record is still being created.",
      onClick: () => { setPermitIsNew(true); setPermitDraft(emptyPermitDraft()); },
    },
    {
      key: "edit", label: PERMIT_COMMAND_LABELS.edit, icon: <EditRegular />,
      disabled: !permitCommands.canEdit,
      disabledReason: selectedPermit
        ? "You do not have permission to edit this permit."
        : "Select a permit first.",
      onClick: () => {
        if (!selectedPermit) return;
        setPermitIsNew(false);
        setPermitDraft(permitDraftFrom(selectedPermit));
      },
    },
    {
      key: "delete", label: PERMIT_COMMAND_LABELS.delete, icon: <DeleteRegular />, danger: true,
      disabled: !permitCommands.canDelete,
      disabledReason: selectedPermit
        ? "You do not have permission to delete this permit."
        : "Select a permit first.",
      onClick: () => setConfirmDeletePermit(true),
    },
  ];

  return (
    <>
      {/* GUIDE q22/q24: the tab strip sits directly under the header — no stat-tile row
          between them, and Save/Cancel move to the page's own bottom RecordFooter. */}
      <Header project={project} />

      {save.isError && (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>{SAVE_ERROR_PREFIX}</MessageBarTitle>
            {save.error instanceof Error ? save.error.message : "Unexpected error."}
          </MessageBarBody>
        </MessageBar>
      )}
      {save.isSuccess && dirty.length === 0 && (
        <MessageBar intent="success">
          <MessageBarBody>{SAVE_SUCCESS}</MessageBarBody>
        </MessageBar>
      )}
      {planning.isError && (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>The planning record could not be loaded or created</MessageBarTitle>
            {planning.error?.message ?? "Unexpected error."}
          </MessageBarBody>
        </MessageBar>
      )}
      {isDirty(form, baseline, permitsTouched, aquisitionTouched)
        && dirty.length === 0 && (
        <MessageBar intent="info">
          <MessageBarBody>
            Permit or acquisition changes are saved through their own panels — the form
            below has nothing pending.
          </MessageBarBody>
        </MessageBar>
      )}

      <div className={s.tabs}>
        <TabList
          selectedValue={tab}
          onTabSelect={(_, d) => goToTab(d.value as PlanningTabKey)}
        >
          {PLANNING_TABS.map((t) => (
            <Tab
              key={t.key}
              value={t.key}
              disabled={!canSwitchTabs(gating) && t.key !== tab}
            >
              {t.label}
            </Tab>
          ))}
        </TabList>
      </div>

      {tab === "general" && (
        <>
          <Card title="Planning basis">
            <div className={s.grid}>
              <Field label={GENERAL_TAB_LABELS.cooperation}>
                <Dropdown
                  disabled={!unlocked}
                  value={yesNoUnknownLabel(form.cooperation)}
                  selectedOptions={form.cooperation === null ? [] : [String(form.cooperation)]}
                  onOptionSelect={(_, d) =>
                    setDraft(applyCooperationChange(
                      draft ?? baseline, d.optionValue ? Number(d.optionValue) : null,
                    ))
                  }
                >
                  {YES_NO_UNKNOWN.map((o) => (
                    <Option key={o.value} value={String(o.value)}>{o.label}</Option>
                  ))}
                </Dropdown>
              </Field>

              {/* Rule 5 — Partner only for Yes; Details for Yes or Unknown but editable
                  only for Unknown. */}
              {showCooperationPartner(form.cooperation) && (
                <div>
                  <Field label="Cooperation partner">
                    <Input
                      maxLength={MAX_LENGTH.cooperationPartner}
                      disabled={!unlocked}
                      value={form.cooperationPartner}
                      onChange={(_, d) => set("cooperationPartner", d.value)}
                    />
                  </Field>
                  <div className={s.counter}>
                    {charCounter(form.cooperationPartner, MAX_LENGTH.cooperationPartner)}
                  </div>
                </div>
              )}

              {showCooperationDetails(form.cooperation) && (
                <div className={s.wide}>
                  <Field label="Cooperation details">
                    <Textarea
                      resize="vertical"
                      maxLength={MAX_LENGTH.cooperationDetails}
                      disabled={!unlocked || !cooperationDetailsEditable(form.cooperation)}
                      value={form.cooperationDetails}
                      onChange={(_, d) => set("cooperationDetails", d.value)}
                    />
                  </Field>
                  <div className={s.counter}>
                    {charCounter(form.cooperationDetails, MAX_LENGTH.cooperationDetails)}
                  </div>
                </div>
              )}

              <Field
                label={GENERAL_TAB_LABELS.legalPlanningBasis}
                hint={legalOptions.options.length === 0
                  ? "No values are configured for this country."
                  : undefined}
              >
                <Dropdown
                  disabled={!canEditLegalPlanningBasis(gating, legalOptions.options.length)}
                  value={
                    legalOptions.options.find((o) => o.id === form.legalPlanningId)?.label ?? ""
                  }
                  selectedOptions={form.legalPlanningId ? [form.legalPlanningId] : []}
                  onOptionSelect={(_, d) => set("legalPlanningId", d.optionValue ?? null)}
                >
                  {legalOptions.options.map((o) => (
                    <Option key={o.id} value={o.id}>{o.label}</Option>
                  ))}
                </Dropdown>
              </Field>

              <Field label={GENERAL_TAB_LABELS.planningBasisCategory}>
                <Dropdown
                  disabled={!unlocked}
                  value={
                    PLANNING_BASIS_CATEGORIES
                      .find((o) => o.value === form.planningBasisCategory)?.label ?? ""
                  }
                  selectedOptions={
                    form.planningBasisCategory === null
                      ? [] : [String(form.planningBasisCategory)]
                  }
                  onOptionSelect={(_, d) =>
                    set("planningBasisCategory", d.optionValue ? Number(d.optionValue) : null)
                  }
                >
                  {PLANNING_BASIS_CATEGORIES.map((o) => (
                    <Option key={o.value} value={String(o.value)}>{o.label}</Option>
                  ))}
                </Dropdown>
              </Field>

              <Field label={GENERAL_TAB_LABELS.permitProcedure}>
                <Dropdown
                  disabled={!unlocked || procedureOptions.options.length === 0}
                  value={
                    procedureOptions.options
                      .find((o) => o.id === form.permitProcedureId)?.label ?? ""
                  }
                  selectedOptions={form.permitProcedureId ? [form.permitProcedureId] : []}
                  onOptionSelect={(_, d) => set("permitProcedureId", d.optionValue ?? null)}
                >
                  {procedureOptions.options.map((o) => (
                    <Option key={o.id} value={o.id}>{o.label}</Option>
                  ))}
                </Dropdown>
              </Field>

              <div className={s.wide}>
                <Field label={GENERAL_TAB_LABELS.planningBasisDetails}>
                  <Textarea
                    resize="vertical"
                    maxLength={MAX_LENGTH.planningBasisDetails}
                    disabled={!unlocked}
                    value={form.planningBasisDetails}
                    onChange={(_, d) => set("planningBasisDetails", d.value)}
                  />
                </Field>
                <div className={s.counter}>
                  {charCounter(form.planningBasisDetails, MAX_LENGTH.planningBasisDetails)}
                </div>
              </div>

              <Field label={GENERAL_TAB_LABELS.heightLimitationWtg}>
                <Switch
                  checked={form.isHeightLimitation}
                  disabled={!unlocked}
                  onChange={(_, d) => setDraft(applyHeightToggle(draft ?? baseline, d.checked))}
                />
              </Field>

              {/* Rule 9 — the numeric field appears only with the toggle on, and the
                  toggle makes it mandatory (see canSave). */}
              {showHeightLimit(form.isHeightLimitation) && (
                <NumericInput
                  label="Height limitation" unit="m" places={2} min={0} max={99999}
                  required language={language} disabled={!unlocked}
                  value={form.heightLimitation}
                  onChange={(v) => set("heightLimitation", v)}
                />
              )}
            </div>
          </Card>

          <Card title="Permits">
            <CommandBar commands={permitBar} />
            <DataGrid
              rows={permits.permits}
              columns={permitColumns}
              rowKey={(r) => r.id}
              loading={permits.isLoading}
              emptyMessage="No permits recorded for this project yet."
              selectedKey={selectedPermitId}
              onRowClick={(r) =>
                // Rule 15 — clicking the selected row deselects it.
                setSelectedPermitId((prev) => togglePermitSelection(prev, r.id))
              }
            />
          </Card>
        </>
      )}

      {tab === "repowering" && (
        <Card title="Repowering">
          <div className={s.grid}>
            <Field label={REPOWERING_TAB_LABELS.repowering}>
              <Dropdown
                disabled={!unlocked}
                value={yesNoUnknownLabel(form.repowering)}
                selectedOptions={form.repowering === null ? [] : [String(form.repowering)]}
                onOptionSelect={(_, d) =>
                  setDraft(applyRepoweringChange(
                    draft ?? baseline, d.optionValue ? Number(d.optionValue) : null,
                  ))
                }
              >
                {YES_NO_UNKNOWN.map((o) => (
                  <Option key={o.value} value={String(o.value)}>{o.label}</Option>
                ))}
              </Dropdown>
            </Field>

            {/* Rule 6 — Secured access only for Yes; Details for Yes or Unknown. */}
            {showSecuredAccess(form.repowering) && (
              <div>
                <Field label="Access to old plants secured">
                  <Input
                    maxLength={MAX_LENGTH.securedAccess}
                    disabled={!unlocked}
                    value={form.securedAccess}
                    onChange={(_, d) => set("securedAccess", d.value)}
                  />
                </Field>
                <div className={s.counter}>
                  {charCounter(form.securedAccess, MAX_LENGTH.securedAccess)}
                </div>
              </div>
            )}

            {showRepoweringDetails(form.repowering) && (
              <div className={s.wide}>
                <Field label="Repowering details">
                  <Textarea
                    resize="vertical"
                    maxLength={MAX_LENGTH.repoweringDetails}
                    disabled={!unlocked}
                    value={form.repoweringDetails}
                    onChange={(_, d) => set("repoweringDetails", d.value)}
                  />
                </Field>
                <div className={s.counter}>
                  {charCounter(form.repoweringDetails, MAX_LENGTH.repoweringDetails)}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {tab === "aquisition" && (
        <>
          {seed.isPending && (
            <MessageBar intent="info">
              <MessageBarBody>Creating the missing acquisition rows…</MessageBarBody>
            </MessageBar>
          )}
          {(["personam", "rem"] as LlaType[]).map((lla) => (
            <AquisitionCard
              key={lla}
              lla={lla}
              rows={sortByTypeOrder(aquisition.forType(lla, LLA_TYPE_VALUE[lla]))}
              loading={aquisition.isLoading}
              canEdit={unlocked}
              onOpen={(row) => {
                setAquisitionRow(row);
                setAquisitionDraft(aquisitionDraftFrom(row));
              }}
            />
          ))}
        </>
      )}

      {problems.length > 0 && (
        <Card title="Required before saving">
          <div className={s.errors} role="alert">
            {problems.map((m, i) => <span key={i}>• {m}</span>)}
          </div>
        </Card>
      )}

      {/* ───────────────────────────────────────────────────────── the permit panel */}
      <FormPanel
        open={permitDraft !== null}
        title={permitPanelTitle(permitIsNew)}
        busy={savePermit.isPending}
        saveDisabled={!permitDraft || !canSavePermit(permitDraft) || !unlocked}
        errors={permitDraft ? permitPanelErrors(permitDraft) : []}
        onClose={() => setPermitDraft(null)}
        onSave={() => {
          if (!permitDraft || !planning.record) return;
          savePermit.mutate(
            {
              planningId: planning.record.id,
              owningBusinessUnitId: planning.record.owningBusinessUnitId
                ?? project.owningBusinessUnitId,
              draft: permitDraft,
              selected: permitIsNew ? null : selectedPermit,
              canEdit,
            },
            {
              onSuccess: () => {
                setPermitDraft(null);
                // The dropped dirty flag, restored — see `isDirty` in rules.ts.
                setPermitsTouched(true);
              },
            },
          );
        }}
      >
        {permitDraft && (
          <div className={s.panel}>
            <Field label={PERMIT_PANEL_LABELS.name} required>
              <Input
                value={permitDraft.name}
                onChange={(_, d) => setPermitDraft({ ...permitDraft, name: d.value })}
              />
            </Field>

            {/* GUIDE q23 — one grouped field per date: the Plan/Actual choice above the
                date value, under a single "* Submission Date" / "* Approval Date" label,
                not two separately-required fields. */}
            <Field label={PERMIT_PANEL_LABELS.submissionDate} required>
              <div className={s.dateGroup}>
                <RadioGroup
                  layout="horizontal"
                  value={permitDraft.submissionDateType === null
                    ? "" : String(permitDraft.submissionDateType)}
                  onChange={(_, d) => setPermitDraft({
                    ...permitDraft,
                    submissionDateType: d.value ? Number(d.value) : null,
                  })}
                >
                  {PERMIT_DATE_TYPES.map((t) => (
                    <Radio key={t.value} value={String(t.value)} label={t.label} />
                  ))}
                </RadioGroup>
                <Input
                  type="date"
                  value={(permitDraft.submissionDate ?? "").slice(0, 10)}
                  onChange={(_, d) =>
                    setPermitDraft({ ...permitDraft, submissionDate: d.value || null })}
                />
              </div>
            </Field>

            <Field label={PERMIT_PANEL_LABELS.approvalDate} required>
              <div className={s.dateGroup}>
                <RadioGroup
                  layout="horizontal"
                  value={permitDraft.approvalDateType === null
                    ? "" : String(permitDraft.approvalDateType)}
                  onChange={(_, d) => setPermitDraft({
                    ...permitDraft,
                    approvalDateType: d.value ? Number(d.value) : null,
                  })}
                >
                  {PERMIT_DATE_TYPES.map((t) => (
                    <Radio key={t.value} value={String(t.value)} label={t.label} />
                  ))}
                </RadioGroup>
                <Input
                  type="date"
                  value={(permitDraft.approvalDate ?? "").slice(0, 10)}
                  onChange={(_, d) =>
                    setPermitDraft({ ...permitDraft, approvalDate: d.value || null })}
                />
              </div>
            </Field>
          </div>
        )}
      </FormPanel>

      {/* ──────────────────────────────────────────────────── the acquisition panel */}
      <FormPanel
        open={aquisitionRow !== null}
        title={aquisitionRow?.typeName ?? "Acquisition status"}
        saveLabel="Save"
        busy={saveAquisition.isPending}
        saveDisabled={!canSaveAquisition(aquisitionDraft, language) || !unlocked}
        errors={aquisitionPanelErrors(aquisitionDraft, language)}
        onClose={() => setAquisitionRow(null)}
        extraActions={
          /* Rule 14 split into two honest controls: this Clear wipes the row (with a
             confirm), the panel's own Cancel closes without writing. The canvas had one
             button labelled Cancel that silently did the wipe. */
          <Badge
            appearance="outline"
            icon={<EraserRegular />}
            style={{ cursor: unlocked ? "pointer" : "default" } as CSSProperties}
            onClick={() => unlocked && setConfirmClear(true)}
          >
            Clear
          </Badge>
        }
        onSave={() => {
          if (!aquisitionRow || !project) return;
          saveAquisition.mutate(
            {
              projectId: project.id,
              owningBusinessUnitId: project.owningBusinessUnitId,
              row: aquisitionRow,
              draft: aquisitionDraft,
              canEdit,
              language,
            },
            {
              onSuccess: () => {
                setAquisitionRow(null);
                setAquisitionTouched(true);
              },
            },
          );
        }}
      >
        <div className={s.panel}>
          <NumericInput
            label="Secured" places={0} min={0} max={999} required language={language}
            disabled={!unlocked}
            value={aquisitionDraft.secured}
            rangeMessage={validateAquisition(aquisitionDraft, language).secured.message}
            onChange={(v) => setAquisitionDraft({ ...aquisitionDraft, secured: v })}
          />
          <NumericInput
            label="Required" places={0} min={0} max={999} required language={language}
            disabled={!unlocked}
            value={aquisitionDraft.required}
            rangeMessage={validateAquisition(aquisitionDraft, language).required.message}
            onChange={(v) => setAquisitionDraft({ ...aquisitionDraft, required: v })}
          />
          <Field label="Acquisition status">
            <Input
              readOnly
              value={(() => {
                const p = securedPercent(
                  aquisitionDraft.secured, aquisitionDraft.required, language,
                );
                return p === PERCENT_NOT_APPLICABLE ? PERCENT_NOT_APPLICABLE : `${p} %`;
              })()}
            />
          </Field>
          <Text size={200}>
            Derived from Secured ÷ Required and stored as a fraction, so 25 of 100 is
            saved as 0.25.
          </Text>
        </div>
      </FormPanel>

      <ConfirmDialog
        open={confirmDeletePermit}
        intent="danger"
        title="Delete this permit?"
        confirmLabel="Delete"
        busy={deletePermit.isPending}
        onCancel={() => setConfirmDeletePermit(false)}
        onConfirm={() => {
          if (!selectedPermit || !planning.record) return;
          deletePermit.mutate(
            { permit: selectedPermit, planningId: planning.record.id, canEdit },
            {
              onSuccess: () => {
                setConfirmDeletePermit(false);
                setSelectedPermitId(null);
                setPermitsTouched(true);
              },
            },
          );
        }}
      >
        <Text>
          {selectedPermit?.name ?? "This permit"} will be removed. This cannot be undone.
        </Text>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmClear}
        intent="danger"
        title="Clear this acquisition row?"
        confirmLabel="Clear"
        busy={clearAquisition.isPending}
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          if (!aquisitionRow || !project) return;
          clearAquisition.mutate(
            { projectId: project.id, row: aquisitionRow, canEdit },
            {
              onSuccess: () => {
                setConfirmClear(false);
                setAquisitionRow(null);
                setAquisitionTouched(true);
              },
            },
          );
        }}
      >
        <Text>
          Secured, Required and the derived percentage will all be emptied. In the canvas
          app this was the panel's “Cancel” button — it is a Clear, and it writes.
        </Text>
      </ConfirmDialog>

      <ConfirmDialog
        open={false}
        title="Unsaved changes"
        onCancel={() => undefined}
      >
        <Text>{LEAVE_CONFIRMATION}</Text>
      </ConfirmDialog>

      {save.isPending && <LoadingOverlay label="Saving planning data…" />}

      {/* GUIDE q22/q23/q24 — Save/Cancel render as the page's own bottom RecordFooter on
          every tab, not a top command bar. */}
      <RecordFooter
        onSave={attemptSave}
        onCancel={cancel}
        saveDisabled={!canSave(saveState)}
        busy={save.isPending}
        saveDisabledReason={saveDisabledReason(saveState)}
        createdBy={createdByText}
        modifiedBy={modifiedByText}
      />
    </>
  );
}

/* ────────────────────────────────────────────────────────── the acquisition grid */

function AquisitionCard({
  lla, rows, loading, canEdit, onOpen,
}: {
  lla: LlaType;
  rows: AquisitionStatusRow[];
  loading: boolean;
  canEdit: boolean;
  onOpen: (row: AquisitionStatusRow) => void;
}) {
  const columns: Column<AquisitionStatusRow>[] = [
    { key: "type", header: "Type", value: (r) => r.typeName ?? "—" },
    { key: "secured", header: "Secured", numeric: true, value: (r) => r.secured ?? "—" },
    { key: "required", header: "Required", numeric: true, value: (r) => r.required ?? "—" },
    {
      key: "percent", header: "Status", numeric: true,
      // Rule 12 — the gallery renders the stored fraction × 100, or N/A.
      value: (r) => {
        const p = storedPercentToDisplay(r.percentage, r.required);
        return p === PERCENT_NOT_APPLICABLE ? PERCENT_NOT_APPLICABLE : `${p} %`;
      },
    },
  ];
  return (
    <Card
      title={LLA_TYPE_LABEL[lla]}
      actions={<Text size={200}>{rows.length} row(s)</Text>}
    >
      <DataGrid
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        loading={loading}
        emptyMessage="No acquisition types are configured for this LLA type yet."
        onRowClick={(r) => canEdit && onOpen(r)}
      />
    </Card>
  );
}

/* ────────────────────────────────────────────────────────────────────── header */

function Header({ project }: { project: { clusterStateName: string | null; projectNumber: string | null } | null }) {
  return (
    <PageHeader
      eyebrow="Project Management"
      title="Planning"
      description="Cooperation and planning basis, the permits this project needs, and how much of the land is secured."
      actions={
        <>
          {project?.clusterStateName && <StateChip state={project.clusterStateName} />}
          {project?.projectNumber && <Badge appearance="tint">{project.projectNumber}</Badge>}
        </>
      }
    />
  );
}
