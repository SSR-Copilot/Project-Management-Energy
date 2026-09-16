/**
 * Admin Project Gates Approvals Screen — layout and composition only.
 *
 * Canvas screen: `Admin Project Gates Approvals Screen` (PM app)
 *   114 controls · 3 305 lines of Power Fx · 41 substantive blocks · band M
 *
 * NOT PROJECT-SCOPED — master data. No `useProjectContext()`; the user comes from the
 * store and edits are gated on `canSeeAdminSection` (entry) and `canEditCountry` (scope).
 * See the SOURCE DEFECT block in rules.ts: the canvas had neither, and the server still
 * does not reject these writes.
 *
 * REBUILT AGAINST THE FIRST SET OF LIVE SCREENSHOTS (GUIDE p18/p19/p20): the accordion +
 * per-gate mini-grid this screen used before is gone. The real layout is three panes — the
 * admin left rail (unchanged), a narrow middle COUNTRY RAIL (flag + "+/−" expander to Wind
 * and PV), and one flattened table (`Description | Portfolio Manager | Contributors |
 * Approvers | Notifications | Status | Action`) whose rows are a bold gate-transition
 * header, its task rows, and a trailing "+ Add Task" row, per gate.
 *
 * BEHAVIOUR CHANGES, each flagged in rules.ts:
 *  - Edit on a gate with no row no longer creates one (rule 3). Cancel is a true no-op.
 *  - A non-Wind/PV row is no longer silently reset on open (rule 4); a banner explains it.
 *  - Switching a gate off asks for confirmation (rule 20). The canvas did not.
 *  - Add Task is enabled per SCOPE, not per whole table (rule 18).
 *  - GUIDE p20 shows a delete icon on gate header rows; the canvas never had a delete path
 *    for a gate-level approval (rule 24). The icon renders for visual parity and always
 *    refuses (`MSG.noGateDelete`) rather than silently gaining a destructive write.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Dropdown, Option, Field, Input, Switch, Radio, RadioGroup, Button, Badge, MessageBar,
  MessageBarBody, Tag, TagGroup, Avatar, Spinner, makeStyles, tokens,
} from "@fluentui/react-components";
import {
  EditRegular, DeleteRegular, PersonAddRegular, DismissRegular,
  AddRegular, SubtractRegular,
} from "@fluentui/react-icons";
import {
  PageHeader, DataGrid, FormPanel, ConfirmDialog, LoadingOverlay, CountryRail,
  Breadcrumb, EmptyState, StateChip, type Column,
} from "@/components";
import { useAppStore } from "@/store/appStore";
import { canSeeAdminSection } from "@/domain/session";
import { space, media, radius } from "@/theme/tokens";
import {
  MSG, APPROVAL_MODE, PANEL_LABELS, GATE_TABLE_COLUMNS,
  buildCountryPicker, buildGateCountryRailItems, countryRailKey, techRailKey,
  parseTechRailKey, PICKER_TECHNOLOGIES,
  mergeGatesWithApprovals, gateDropdownItems, gateRecordName,
  approvalModeChoices, approvalModeLabel, defaultApprovalMode, nonWindPvBanner,
  canToggleGateActiveInPanel, canToggleGateChip, canEditScope, canSavePanel, validatePanel,
  panelErrorMessages, parsePersonaList, personLines,
  planSaveApproval, planToggleGateActive, planDeleteChecklistApproval,
  planDeleteGateApproval, planResetGate, canResetGate,
  buildGateTableRows, applyPersonaSelection,
  type Scope, type MergedGate, type ApprovalPanelState, type Persona,
  type ChecklistApproval, type ChecklistItem, type GateTableRow,
} from "./rules";
import {
  useAdminCountries, useGateStates, useGateApprovals, useScopeCountryTechId,
  useChecklistItems, useChecklistApprovals, usePeopleSearch, usePortfolioManagerPersonas,
  useRunGatePlan,
} from "./hooks";

const [COL_DESCRIPTION, COL_PM, COL_CONTRIBUTORS, COL_APPROVERS, COL_NOTIFICATIONS, COL_STATUS, COL_ACTION] =
  GATE_TABLE_COLUMNS;

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: space.l, minWidth: 0, flex: 1, minHeight: 0 },
  note: { color: tokens.colorNeutralForeground3, fontSize: "12px" },

  splitRow: {
    display: "flex", flexDirection: "row", gap: space.m, flex: 1, minHeight: 0, minWidth: 0,
    [media.belowMd]: { flexDirection: "column" },
  },
  railWrap: {
    flex: "none", width: "230px", minWidth: 0,
    borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
    borderTopStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid", borderLeftStyle: "solid",
    borderTopColor: tokens.colorNeutralStroke2, borderRightColor: tokens.colorNeutralStroke2,
    borderBottomColor: tokens.colorNeutralStroke2, borderLeftColor: tokens.colorNeutralStroke2,
    borderRadius: radius.md, overflow: "hidden",
    [media.belowMd]: { width: "100%", maxHeight: "220px" },
  },
  contentPane: {
    display: "flex", flexDirection: "column", gap: space.m, flex: 1, minHeight: 0, minWidth: 0,
  },

  gateDesc: { display: "flex", alignItems: "center", gap: space.xs, minWidth: 0 },
  gateDescText: {
    fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  taskDesc: {
    paddingLeft: "28px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block",
  },
  addTaskLink: { color: tokens.colorBrandForeground1, paddingLeft: "28px", justifyContent: "flex-start" },

  personCell: { display: "flex", flexDirection: "column", gap: "2px", justifyContent: "center", minWidth: 0 },
  personLine: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "12.5px" },

  actionCell: { display: "flex", gap: "2px", alignItems: "center" },
  chipButton: {
    display: "inline-flex", padding: 0, backgroundColor: "transparent",
    borderTopWidth: "0", borderRightWidth: "0", borderBottomWidth: "0", borderLeftWidth: "0",
    borderTopStyle: "none", borderRightStyle: "none", borderBottomStyle: "none", borderLeftStyle: "none",
    cursor: "pointer",
  },

  panelBody: { display: "flex", flexDirection: "column", gap: space.m },
  pickerRow: { display: "flex", gap: space.xs, alignItems: "flex-end", flexWrap: "wrap" },
  suggestions: {
    display: "flex", flexDirection: "column", gap: "2px", maxHeight: "180px", overflowY: "auto",
  },
  resetRow: { display: "flex", gap: space.s, alignItems: "center", flexWrap: "wrap" },
  resetCaption: { color: tokens.colorNeutralForeground3, fontSize: "12px", maxWidth: "260px" },
});

export default function AdminGatesApprovalsScreen() {
  const s = useStyles();
  const user = useAppStore((st) => st.session.user);

  const { countries, isLoading: countriesLoading } = useAdminCountries();
  const railItems = useMemo(() => buildGateCountryRailItems(countries), [countries]);

  const [scope, setScope] = useState<Scope>({ country: null, technology: null });
  const [railExpanded, setRailExpanded] = useState<string[]>([]);

  // GUIDE p18 — Germany, expanded, is the rail's own default state. Picked once countries
  // have loaded and nothing has been chosen yet; the user's own clicks always win after.
  useEffect(() => {
    if (scope.country || countries.length === 0) return;
    const de = countries.find((c) => c.name === "Germany") ?? countries[0];
    setScope({ country: { id: de.id, name: de.name }, technology: PICKER_TECHNOLOGIES[0] });
    setRailExpanded([countryRailKey(de.id)]);
  }, [countries, scope.country]);

  const { states, isLoading: statesLoading } = useGateStates();
  const { approvals, isLoading: approvalsLoading } = useGateApprovals(scope);
  const countryTechId = useScopeCountryTechId(scope);
  const { items } = useChecklistItems(scope, countryTechId);
  const itemIds = useMemo(() => items.map((i) => i.id), [items]);
  const { approvals: checklistApprovals } = useChecklistApprovals(scope, itemIds);

  const merged = useMemo(() => mergeGatesWithApprovals(states, approvals), [states, approvals]);
  const dropdownItems = useMemo(() => gateDropdownItems(states), [states]);

  const pmIds = useMemo(
    () => [...approvals.map((a) => a.portfolioManagerId), ...checklistApprovals.map((a) => a.portfolioManagerId)],
    [approvals, checklistApprovals],
  );
  const { resolvePerson } = usePortfolioManagerPersonas(pmIds);

  // GUIDE p18/p20 — every gate renders expanded by default; collapsing one is per-row state.
  const gateIdsKey = merged.map((m) => m.gate.id).join(",");
  const [expandedGateIds, setExpandedGateIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    setExpandedGateIds(new Set(merged.map((m) => m.gate.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateIdsKey]);
  const toggleGateExpanded = (gateId: string) =>
    setExpandedGateIds((prev) => {
      const next = new Set(prev);
      if (next.has(gateId)) next.delete(gateId); else next.add(gateId);
      return next;
    });

  const tableRows = useMemo(
    () => buildGateTableRows(merged, dropdownItems, checklistApprovals, items, countryTechId, expandedGateIds, resolvePerson),
    [merged, dropdownItems, checklistApprovals, items, countryTechId, expandedGateIds, resolvePerson],
  );

  const canEdit = canEditScope(user, scope);
  const banner = nonWindPvBanner(scope.technology);

  const [panel, setPanel] = useState<ApprovalPanelState | null>(null);
  const [toggleTarget, setToggleTarget] = useState<MergedGate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChecklistApproval | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useRunGatePlan("adminGates/save");

  if (!user) return <LoadingOverlay mode="inline" />;
  if (!canSeeAdminSection(user)) {
    return (
      <EmptyState
        title="Administration is not available to your account"
        description="These screens need the VSB - Application Administrator or VSB - Controller Own Data security role."
      />
    );
  }

  const gateNameFor = (p: ApprovalPanelState): string => {
    const item = dropdownItems.find((d) => d.stateId === p.gate.id) ?? null;
    return p.kind === "gate" ? gateRecordName(item) : p.checklistItem?.name ?? "";
  };

  const existingApprovalForGate = (p: ApprovalPanelState): boolean =>
    p.kind === "gate" && approvals.some((a) => a.clusterStateId === p.gate.id);

  const nextUnapprovedItem = (gate: MergedGate): ChecklistItem | null => {
    const approvedIds = new Set(
      checklistApprovals.map((a) => a.projectDefaultChecklistId).filter(Boolean) as string[],
    );
    return items.find((i) =>
      i.clusterStateId === gate.gate.id
      && (countryTechId === null || i.countryTechId === countryTechId)
      && !approvedIds.has(i.id)) ?? null;
  };

  const submit = () => {
    if (!panel) return;
    const plan = planSaveApproval(panel, scope, {
      canEdit,
      gateName: gateNameFor(panel),
      existingApprovalForGate: existingApprovalForGate(panel),
    });
    setError(plan.refusedReason ?? null);
    if (plan.refusedReason) return;
    run.mutate({ plan, scope }, {
      onSuccess: () => { setPanel(null); setError(null); },
      onError: (e: unknown) => setError(e instanceof Error ? e.message : "Save failed."),
    });
  };

  const resetGate = () => {
    if (!panel) return;
    const plan = planResetGate(panel, scope, gateNameFor(panel), canEdit);
    setError(plan.refusedReason ?? null);
    if (plan.refusedReason) return;
    run.mutate({ plan, scope }, {
      onSuccess: () => { setPanel(null); setError(null); },
      onError: (e: unknown) => setError(e instanceof Error ? e.message : "Reset failed."),
    });
  };

  const selectedLeafKey = scope.country && scope.technology
    ? techRailKey(scope.country.id, scope.technology)
    : null;

  const columns: Column<GateTableRow>[] = [
    {
      key: "description", header: COL_DESCRIPTION, width: "minmax(220px, 2.2fr)",
      render: (r) => {
        if (r.kind === "addTask") {
          return (
            <Button
              appearance="transparent" size="small" className={s.addTaskLink}
              disabled={!canEdit || !r.addTaskEnabled || run.isPending}
              onClick={() => setPanel(gatePanelForTask(r.gate, nextUnapprovedItem(r.gate)))}
            >
              {r.description}
            </Button>
          );
        }
        if (r.kind === "gate") {
          const expanded = expandedGateIds.has(r.gate.gate.id);
          return (
            <span className={s.gateDesc}>
              <Button
                appearance="subtle" size="small"
                icon={expanded ? <SubtractRegular /> : <AddRegular />}
                aria-label={expanded ? "Collapse" : "Expand"}
                aria-expanded={expanded}
                onClick={() => toggleGateExpanded(r.gate.gate.id)}
              />
              <span className={s.gateDescText} title={r.description}>{r.description}</span>
            </span>
          );
        }
        return <span className={s.taskDesc} title={r.description}>{r.description}</span>;
      },
    },
    {
      key: "portfolioManager", header: COL_PM, width: "minmax(160px, 1fr)", hideBelow: "lg",
      render: (r) => (r.kind === "addTask" ? null : <PersonCell people={r.portfolioManager} />),
    },
    {
      key: "contributors", header: COL_CONTRIBUTORS, width: "minmax(160px, 1fr)", hideBelow: "lg",
      render: (r) => (r.kind === "addTask" ? null : <PersonCell people={r.contributors} />),
    },
    {
      key: "approvers", header: COL_APPROVERS, width: "minmax(160px, 1fr)",
      render: (r) => (r.kind === "addTask" ? null : <PersonCell people={r.approvers} />),
    },
    {
      key: "notifications", header: COL_NOTIFICATIONS, width: "minmax(200px, 1.3fr)",
      render: (r) => (r.kind === "addTask" ? null : <PersonCell people={r.notifications} />),
    },
    {
      key: "status", header: COL_STATUS, width: "110px",
      render: (r) => {
        if (r.kind === "gate" && r.isPlaceholder) {
          return <Badge appearance="outline" color="informative">Not configured</Badge>;
        }
        if (r.active === null) return null;
        const chip = <StateChip state={r.active ? "Active" : "Inactive"} />;
        if (r.kind === "gate" && canEdit && canToggleGateChip(r.gate)) {
          return (
            <button
              type="button" className={s.chipButton}
              aria-label={r.active ? "Switch gate off" : "Switch gate on"}
              onClick={() => setToggleTarget(r.gate)}
            >
              {chip}
            </button>
          );
        }
        return chip;
      },
    },
    {
      key: "action", header: COL_ACTION, width: "96px",
      render: (r) => {
        if (r.kind === "addTask") return null;
        if (r.kind === "gate") {
          return (
            <span className={s.actionCell}>
              <Button
                appearance="subtle" size="small" icon={<EditRegular />} aria-label="Edit"
                disabled={!canEdit || run.isPending}
                onClick={() => setPanel(gatePanelFrom(r.gate))}
              />
              <Button
                appearance="subtle" size="small" icon={<DeleteRegular />} aria-label="Delete"
                disabled={!canEdit || run.isPending}
                onClick={() => setError(planDeleteGateApproval(r.gate, canEdit).refusedReason ?? null)}
              />
            </span>
          );
        }
        const t = r.task!;
        return (
          <span className={s.actionCell}>
            <Button
              appearance="subtle" size="small" icon={<EditRegular />} aria-label="Edit"
              disabled={!canEdit || run.isPending}
              onClick={() => setPanel(checklistPanelFrom(r.gate, t.item, t.approval))}
            />
            <Button
              appearance="subtle" size="small" icon={<DeleteRegular />} aria-label="Delete"
              disabled={!canEdit || run.isPending}
              onClick={() => setDeleteTarget(t.approval)}
            />
          </span>
        );
      },
    },
  ];

  const rowHeight = Math.min(
    140,
    32 + 20 * Math.max(
      1,
      ...tableRows.map((r) =>
        Math.max(
          personLines(r.portfolioManager).length, personLines(r.contributors).length,
          personLines(r.approvers).length, personLines(r.notifications).length,
        )),
    ),
  );

  const loading = statesLoading || approvalsLoading;

  return (
    <div className={s.page}>
      <PageHeader
        eyebrow="Administration"
        title="Project Gates"
        description={
          "Who approves what at each project gate, for one country and technology at a "
          + "time. Every gate is listed whether or not it has an approval record yet."
        }
      />

      {countriesLoading ? (
        <LoadingOverlay mode="inline" label="Loading countries…" />
      ) : (
        <div className={s.splitRow}>
          <div className={s.railWrap}>
            <CountryRail
              items={railItems}
              selectedKey={selectedLeafKey}
              expandedKeys={railExpanded}
              onExpandedChange={setRailExpanded}
              variant="tree"
              ariaLabel="Country and technology"
              onSelect={(key, parentKey) => {
                if (!parentKey) return;
                const parsed = parseTechRailKey(key);
                if (!parsed) return;
                const c = buildCountryPicker(countries).find((x) => x.id === parsed.countryId);
                if (!c) return;
                setScope({ country: { id: c.id, name: c.name }, technology: parsed.technology });
              }}
            />
          </div>

          <div className={s.contentPane}>
            <Breadcrumb
              items={["Project Gates", scope.country?.name ?? "", scope.technology ?? ""]}
              separator="|"
            />

            {banner && (
              <MessageBar intent="warning"><MessageBarBody>{banner}</MessageBarBody></MessageBar>
            )}
            {!canEdit && scope.country && (
              <MessageBar intent="warning"><MessageBarBody>{MSG.outOfScope}</MessageBarBody></MessageBar>
            )}
            {error && (
              <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>
            )}

            {!scope.country || !scope.technology ? (
              <EmptyState
                title="Pick a country and technology"
                description="Gate approvals are authored one country × technology at a time."
              />
            ) : (
              <DataGrid
                rows={tableRows}
                columns={columns}
                rowKey={(r) => r.key}
                loading={loading}
                emptyMessage={MSG.noApprovals}
                rowHeight={rowHeight}
              />
            )}
          </div>
        </div>
      )}

      <ApprovalPanel
        panel={panel}
        scope={scope}
        canEdit={canEdit}
        busy={run.isPending}
        gateName={panel ? gateNameFor(panel) : ""}
        existingApprovalForGate={panel ? existingApprovalForGate(panel) : false}
        onChange={setPanel}
        onClose={() => { setPanel(null); setError(null); }}
        onSave={submit}
        onReset={resetGate}
      />

      <ConfirmDialog
        open={toggleTarget !== null}
        title={MSG.deactivateTitle}
        intent="danger"
        confirmLabel={toggleTarget?.approval?.gateActive ? "Switch off" : "Switch on"}
        busy={run.isPending}
        onCancel={() => setToggleTarget(null)}
        onConfirm={() => {
          if (!toggleTarget) return;
          const plan = planToggleGateActive(toggleTarget, canEdit);
          setError(plan.refusedReason ?? null);
          if (plan.refusedReason) { setToggleTarget(null); return; }
          run.mutate({ plan, scope }, { onSuccess: () => setToggleTarget(null) });
        }}
      >
        {MSG.deactivateBody}
      </ConfirmDialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={MSG.deleteChecklistTitle}
        intent="danger"
        confirmLabel="Delete"
        busy={run.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          const plan = planDeleteChecklistApproval(deleteTarget, canEdit);
          setError(plan.refusedReason ?? null);
          if (plan.refusedReason) { setDeleteTarget(null); return; }
          run.mutate({ plan, scope }, { onSuccess: () => setDeleteTarget(null) });
        }}
      >
        {`${scope.country?.name ?? ""} – ${scope.technology ?? ""} – ${deleteTarget?.name ?? ""}`}
      </ConfirmDialog>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── panel factories */

/**
 * Rule 3, FIXED: opening a placeholder builds panel state ONLY. No `Patch` is issued, so
 * Cancel leaves nothing behind. The canvas created the row here.
 */
function gatePanelFrom(row: MergedGate): ApprovalPanelState {
  const a = row.approval;
  return {
    kind: "gate",
    gate: row.gate,
    checklistItem: null,
    mode: defaultApprovalMode(a?.approvalMode ?? null),
    portfolioManager: null,
    contributors: parsePersonaList(a?.defaultContributors),
    approvers: parsePersonaList(a?.defaultApprovals),
    notifications: parsePersonaList(a?.defaultNotifications),
    gateActive: a?.gateActive ?? true,
    existingId: a?.id ?? null,
  };
}

/** Rule 19, FIXED: Add Task no longer creates the row up front either. */
function checklistPanelFrom(
  row: MergedGate,
  item: ChecklistItem | null,
  approval: ChecklistApproval | null,
): ApprovalPanelState {
  return {
    kind: "checklist",
    gate: row.gate,
    checklistItem: item,
    mode: defaultApprovalMode(approval?.approvalMode ?? null),
    portfolioManager: null,
    contributors: parsePersonaList(approval?.defaultContributors),
    approvers: parsePersonaList(approval?.defaultApprovers),
    notifications: parsePersonaList(approval?.defaultNotifications),
    gateActive: approval?.gateActive ?? false,
    existingId: approval?.id ?? null,
  };
}

/** The "+ Add Task" row opens the same panel factory as the row-level edit icon. */
function gatePanelForTask(row: MergedGate, item: ChecklistItem | null): ApprovalPanelState {
  return checklistPanelFrom(row, item, null);
}

/* ─────────────────────────────────────────────────────────────────── the cells */

function PersonCell({ people }: { people: Persona[] }) {
  const s = useStyles();
  return (
    <div className={s.personCell}>
      {personLines(people).map((line, i) => (
        <span key={i} className={s.personLine} title={line}>{line}</span>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────── the panel */

function ApprovalPanel({
  panel, scope, canEdit, busy, gateName, existingApprovalForGate, onChange, onClose, onSave, onReset,
}: {
  panel: ApprovalPanelState | null;
  scope: Scope;
  canEdit: boolean;
  busy: boolean;
  gateName: string;
  existingApprovalForGate: boolean;
  onChange: (p: ApprovalPanelState) => void;
  onClose: () => void;
  onSave: () => void;
  onReset: () => void;
}) {
  const s = useStyles();
  if (!panel) {
    return <FormPanel open={false} title="" onClose={onClose}><span /></FormPanel>;
  }

  const errors = validatePanel(panel, { existingApprovalForGate });
  const choices = approvalModeChoices(scope.technology);
  const formal = panel.mode === APPROVAL_MODE.formalApproval;
  const onlyNotifications = panel.mode === APPROVAL_MODE.onlyNotifications;

  return (
    <FormPanel
      open
      title={panel.kind === "gate" ? PANEL_LABELS.title : PANEL_LABELS.titleTask}
      onClose={onClose}
      onSave={onSave}
      saveDisabled={!canSavePanel(panel, { canEdit, existingApprovalForGate })}
      busy={busy}
      errors={panelErrorMessages(errors)}
      extraActions={
        panel.kind === "gate" ? (
          <div className={s.resetRow}>
            <Button appearance="primary" disabled={!canResetGate(panel, canEdit) || busy} onClick={onReset}>
              {PANEL_LABELS.resetGate}
            </Button>
            <span className={s.resetCaption}>{MSG.resetGateCaption}</span>
          </div>
        ) : undefined
      }
    >
      <div className={s.panelBody}>
        <Field label={PANEL_LABELS.gate}>
          {/* The canvas dropdown is hard-coded DisplayMode.Disabled — the gate is fixed by
              the row that was clicked. A real (disabled) Dropdown, not a text input, so it
              reads the same as the guide's screenshot. */}
          <Dropdown disabled value={gateName} selectedOptions={[gateName]}>
            <Option value={gateName}>{gateName}</Option>
          </Dropdown>
        </Field>

        <Switch
          label={PANEL_LABELS.gateActive}
          checked={panel.gateActive}
          disabled={!canToggleGateActiveInPanel(panel.kind, gateName.split(" to ")[0])}
          onChange={(_, d) => onChange({ ...panel, gateActive: d.checked })}
        />

        <Field label={PANEL_LABELS.approvalMode} required>
          <RadioGroup
            value={String(panel.mode ?? APPROVAL_MODE.onlyNotifications)}
            onChange={(_, d) => onChange({ ...panel, mode: Number(d.value) })}
          >
            {choices.map((c) => (
              <Radio key={c} value={String(c)} label={approvalModeLabel(c)} />
            ))}
          </RadioGroup>
        </Field>

        {formal && (
          <>
            <PeoplePicker
              label="Portfolio Manager"
              maxPeople={1}
              value={panel.portfolioManager ? [panel.portfolioManager] : []}
              onChange={(v) => onChange({ ...panel, portfolioManager: v[0] ?? null })}
            />
            <PeoplePicker
              label="Contributors"
              value={panel.contributors}
              onChange={(v) => onChange({ ...panel, contributors: v })}
            />
          </>
        )}

        {!onlyNotifications && (
          <PeoplePicker
            label={panel.kind === "gate" ? "Approvers (Default Approvals)" : "Approvers (Default Approvers)"}
            value={panel.approvers}
            onChange={(v) => onChange({ ...panel, approvers: v })}
          />
        )}

        <PeoplePicker
          label={PANEL_LABELS.notifications}
          required={onlyNotifications}
          placeholder={PANEL_LABELS.notificationsPlaceholder}
          value={panel.notifications}
          onChange={(v) => onChange({ ...panel, notifications: v })}
        />

        <span className={s.note}>
          People are stored as JSON on the record, not as relationships. The `PersonaRole`
          key carries the e-mail — a schema abuse inherited from the canvas app and kept so
          existing rows keep parsing.
        </span>
      </div>
    </FormPanel>
  );
}

/** Replaces `colApprovals1..4` + their `PreSelected` twins with one controlled value. */
function PeoplePicker({
  label, value, onChange, maxPeople, required, placeholder,
}: {
  label: string;
  value: Persona[];
  onChange: (next: Persona[]) => void;
  maxPeople?: number;
  required?: boolean;
  placeholder?: string;
}) {
  const s = useStyles();
  const [term, setTerm] = useState("");
  const { people, isLoading } = usePeopleSearch(term);

  return (
    <Field label={label} required={required}>
      <div className={s.pickerRow}>
        <Input
          value={term}
          placeholder={placeholder ?? "Search people…"}
          contentBefore={<PersonAddRegular />}
          onChange={(_, d) => setTerm(d.value)}
        />
        {isLoading && <Spinner size="tiny" />}
      </div>
      {term.trim() !== "" && people.length > 0 && (
        <div className={s.suggestions}>
          {people.slice(0, 8).map((p) => (
            <Button
              key={p.id} appearance="subtle" size="small"
              onClick={() => {
                onChange(applyPersonaSelection(value, p, maxPeople));
                setTerm("");
              }}
            >
              {`${p.displayName} · ${p.mail}`}
            </Button>
          ))}
        </div>
      )}
      <TagGroup onDismiss={(_, d) => onChange(value.filter((p) => p.id !== d.value))}>
        {value.map((p) => (
          <Tag
            key={p.id} value={p.id} dismissible dismissIcon={<DismissRegular />}
            media={<Avatar size={20} name={p.displayName} color="colorful" />}
          >
            {p.displayName}
          </Tag>
        ))}
      </TagGroup>
    </Field>
  );
}
