/**
 * Admin Project Gates Approvals Screen — composition only (connected 19 Oct 2026, D22).
 *
 * Canvas screen: `Admin Project Gates Approvals Screen` (PM app),
 * `ProjectDocs/_extracted/msapp/projectmanagement/Src/Admin Project Gates Approvals Screen.pa.yaml`:
 *
 *   cmp_Admin_ProjectGatest_Approvals_Header            page title "Project Gates"
 *   cmp_Admin_ProjectGates_NestedCountryTechnologyPicker  the country rail (Wind / PV)
 *   lbl_Admin_ProjectGates_Approvals_Headline           "Project Gates | <country> | <tech>"
 *   con_Admin_ProjectGatest_Approvals_Gallery_Header    the seven column headers
 *   gal_Admin_ProjectGates_DefaultApprovals_Clusters    gate rows (collapse, status chip, Edit),
 *                                                       their check-list rows (status chip, Edit,
 *                                                       Delete) and "Add Task"
 *   con_Admin_ProjectGates_Approvals_Form               the Add / Edit Approvers panel
 *   cmp_Admin_Loading                                   the progress pop-up (`WriteFeedback`)
 *   cmp_DeleteChecklistApprovalItem_AdminScreen         delete confirmation
 *
 * The hidden `but_Admin_ProjectGates_Approvals_Form_Buttons_Reset` (Select()-ed by Save, Cancel,
 * Close and Reset Gate) resets the panel: here `closePanel` drops the panel state. The hidden
 * `lbl_…_Item_Hidden_Order` feeds the check-list gallery the gate's Order: here the gate row's id.
 *
 * Every decision lives in `rules.ts`; every query and write in `hooks.ts`.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Button, Dropdown, Field, MessageBar, MessageBarBody, Option, Radio, RadioGroup, Switch, Table,
  TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, makeStyles, mergeClasses,
  tokens,
} from "@fluentui/react-components";
import {
  AddRegular, ChevronDownRegular, ChevronRightRegular, DeleteRegular, EditRegular,
} from "@fluentui/react-icons";
import {
  ConfirmDialog, EmptyState, FormPanel, LoadingOverlay, PanelButtons, PeoplePicker, WriteFeedback,
} from "@/components";
import { useAdminAccess } from "@/app/useCurrentUser";
import { palette, space, media } from "@/theme/tokens";
import {
  APPROVAL_MODE, GATE_TABLE_COLUMNS, MSG, PANEL_LABELS, PERSON_LIMITS, PICKER_TECHNOLOGIES,
  PICKER_TOOLTIPS, SCREEN_LABELS,
  applyPersonaSelection, approvalModeChoices, approvalModeLabel, buildGateCountryRailItems,
  buildGateTableRows, canResetGate, canSavePanel, canToggleGateActiveInPanel, canToggleGateChip,
  checklistOptions, defaultApprovalMode, deleteChecklistApprovalText, deletingChecklistText,
  gateDescription, gateDropdownItemFor, gateDropdownItems, gateRecordName, gatesHeadline,
  mergeGatesWithApprovals, nonWindPvBanner, panelTitle, parsePersonaList, pickerSuggestions,
  planDeleteChecklistApproval, planResetGate, planSaveApproval, planToggleChecklistActive,
  planToggleGateActive, resettingGateText, savingChecklistText, savingGateText, togglingText,
  validatePanel,
  type ApprovalPanelState, type CellText, type ChecklistApproval, type ChecklistItem,
  type GateDropdownItem, type GateTableRow, type MergedGate, type Persona, type RailNode, type Scope,
} from "./rules";
import {
  useChecklistApprovals, useChecklistItems, useGateApprovals, useGateCountries, useGateStates,
  useGateWrites, usePeopleSearch, usePortfolioManagerPersonas, useScopeCountryTechId,
} from "./hooks";

const useStyles = makeStyles({
  page: {
    display: "flex", flexDirection: "column", gap: space.m, minWidth: 0,
    paddingTop: space.m, paddingBottom: space.m, paddingLeft: space.l, paddingRight: space.l,
  },
  title: { fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold },
  split: {
    display: "flex", gap: space.m, minWidth: 0,
    [media.belowMd]: { flexDirection: "column" },
  },
  rail: {
    flexShrink: 0, width: "230px", display: "flex", flexDirection: "column", gap: space.xxs,
    paddingTop: space.xs, paddingBottom: space.xs,
    borderRightWidth: "1px", borderRightStyle: "solid", borderRightColor: palette.neutralLight,
    [media.belowMd]: { width: "100%", borderRightStyle: "none" },
  },
  railCountry: { justifyContent: "flex-start", fontWeight: tokens.fontWeightSemibold },
  railTech: { justifyContent: "flex-start", paddingLeft: space.xxl },
  railSelected: { backgroundColor: palette.neutralLight },
  content: { display: "flex", flexDirection: "column", gap: space.m, flexGrow: 1, minWidth: 0 },
  headline: { fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold },
  tableWrap: { overflowX: "auto" },
  table: { minWidth: "980px" },
  gateDesc: { display: "flex", alignItems: "center", gap: space.xs, fontWeight: tokens.fontWeightBold },
  taskDesc: { paddingLeft: space.xl },
  person: { whiteSpace: "pre-line", fontSize: tokens.fontSizeBase200 },
  chip: {
    minWidth: "72px", height: "24px", borderTopLeftRadius: "16px", borderTopRightRadius: "16px",
    borderBottomLeftRadius: "16px", borderBottomRightRadius: "16px", fontSize: "12px",
  },
  chipActive: { backgroundColor: "rgb(173, 209, 121)", borderTopColor: "rgb(100, 152, 67)", borderRightColor: "rgb(100, 152, 67)", borderBottomColor: "rgb(100, 152, 67)", borderLeftColor: "rgb(100, 152, 67)" },
  chipInactive: { backgroundColor: "rgb(200, 200, 200)", borderTopColor: "rgb(120, 120, 120)", borderRightColor: "rgb(120, 120, 120)", borderBottomColor: "rgb(120, 120, 120)", borderLeftColor: "rgb(120, 120, 120)" },
  icon: { color: palette.themePrimary },
  actions: { display: "flex", alignItems: "center", gap: space.xxs },
  panelBody: { display: "flex", flexDirection: "column", gap: space.m },
  error: { color: palette.akzent5 },
  resetRow: { display: "flex", alignItems: "center", gap: space.s, flexWrap: "wrap" },
  resetCaption: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
});

/** `gal_Countries.Selected` defaults to the first country (Germany) and its first child (Wind). */
function defaultScope(rail: RailNode[]): Scope {
  const c = rail[0];
  return c ? { country: { id: c.key, name: c.label }, technology: PICKER_TECHNOLOGIES[0] ?? null } : { country: null, technology: null };
}

/** Pass the failure detail through untouched (the canvas has no error text for this write). */
const plainError = (detail: string): string => detail;

export default function AdminGatesApprovalsScreen() {
  const s = useStyles();
  const canEdit = useAdminAccess();
  const writes = useGateWrites();

  const countriesQ = useGateCountries();
  const rail = useMemo(() => buildGateCountryRailItems(countriesQ.data), [countriesQ.data]);
  const [picked, setPicked] = useState<Scope | null>(null);
  const scope: Scope = picked ?? defaultScope(rail);
  const [expandedCountries, setExpandedCountries] = useState<ReadonlySet<string> | null>(null);
  const railOpen = expandedCountries ?? new Set(scope.country ? [scope.country.id] : []);

  const statesQ = useGateStates();
  const approvalsQ = useGateApprovals(scope);
  const countryTechQ = useScopeCountryTechId(scope);
  const countryTechId = countryTechQ.data;
  const itemsQ = useChecklistItems(countryTechId);
  const items = itemsQ.data;
  const itemIds = useMemo(() => items.map((i) => i.id), [items]);
  const checklistApprovalsQ = useChecklistApprovals(itemIds);
  const checklistApprovals = checklistApprovalsQ.data;
  const approvals = approvalsQ.data;

  const pmIds = useMemo(
    () => [...approvals.map((a) => a.portfolioManagerId), ...checklistApprovals.map((a) => a.portfolioManagerId)],
    [approvals, checklistApprovals],
  );
  const pmQ = usePortfolioManagerPersonas(pmIds);
  const resolvePerson = pmQ.data;

  const loadError = [countriesQ, statesQ, approvalsQ, countryTechQ, itemsQ, checklistApprovalsQ]
    .some((q) => q.error);
  const loading = countriesQ.isLoading || statesQ.isLoading;

  const merged = useMemo(() => mergeGatesWithApprovals(statesQ.data, approvals), [statesQ.data, approvals]);
  const dropdownItems = useMemo(() => gateDropdownItems(statesQ.data), [statesQ.data]);

  /** `col_CollapsedApprovalGates` — every gate starts expanded. */
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggleCollapsed = (id: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const rows = useMemo(
    () => buildGateTableRows(merged, checklistApprovals, items, countryTechId, collapsed, resolvePerson),
    [merged, checklistApprovals, items, countryTechId, collapsed, resolvePerson],
  );

  const [panel, setPanel] = useState<ApprovalPanelState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GateTableRow | null>(null);
  const headline = gatesHeadline(scope.country?.name ?? null, scope.technology);

  const gateItemOf = (gateId: string): GateDropdownItem | null => gateDropdownItemFor(dropdownItems, gateId);
  const gateLabelOf = (gateId: string): string => gateRecordName(gateItemOf(gateId));

  /** Gate Edit (`btn_…_Item_Edit.OnSelect`): type "Cluster", prefilled from the row. */
  const gatePanelFrom = (row: MergedGate): ApprovalPanelState => {
    const a = row.approval;
    return {
      kind: "gate", gate: row.gate, checklistItem: null,
      mode: defaultApprovalMode(a?.approvalMode ?? null),
      portfolioManager: resolvePerson(a?.portfolioManagerId ?? null),
      contributors: parsePersonaList(a?.defaultContributors),
      approvers: parsePersonaList(a?.defaultApprovals),
      notifications: parsePersonaList(a?.defaultNotifications),
      // A new canvas gate row is created with 'Gate active': true.
      gateActive: a?.gateActive ?? true,
      existingId: a?.id ?? null,
    };
  };
  /** Check-list Edit / Add Task: type "Checklist"; a new one starts inactive, Only Notifications. */
  const checklistPanelFrom = (
    row: MergedGate, item: ChecklistItem | null, approval: ChecklistApproval | null,
  ): ApprovalPanelState => ({
    kind: "checklist", gate: row.gate, checklistItem: item,
    mode: defaultApprovalMode(approval?.approvalMode ?? null),
    // SOURCE DEFECT fixed: the canvas pre-fills this picker from `Users` with columns the picker
    // does not read, so it always showed empty; the code app resolves it from Entra, as for gates.
    portfolioManager: resolvePerson(approval?.portfolioManagerId ?? null),
    contributors: parsePersonaList(approval?.defaultContributors),
    approvers: parsePersonaList(approval?.defaultApprovers),
    notifications: parsePersonaList(approval?.defaultNotifications),
    gateActive: approval?.gateActive ?? false,
    existingId: approval?.id ?? null,
  });

  /** The hidden Reset button + `locIsVisibleApprovalsRightPanel: false`. */
  const closePanel = () => setPanel(null);

  const save = () => {
    if (!panel) return;
    const p = panel;
    const gateLabel = gateLabelOf(p.gate.id);
    closePanel();
    void writes.run({
      progress: p.kind === "checklist"
        ? savingChecklistText(headline, p.checklistItem?.name ?? "")
        : savingGateText(headline, gateLabel),
      success: MSG.saved,
      plan: planSaveApproval(p, scope, { canEdit, gateLabel }),
    });
  };

  const resetGate = () => {
    if (!panel) return;
    const p = panel;
    closePanel();
    void writes.run({
      progress: resettingGateText(headline, gateLabelOf(p.gate.id)),
      errorText: plainError,
      plan: planResetGate(p, canEdit),
    });
  };

  const toggleRow = (r: GateTableRow) => {
    void writes.run({
      progress: togglingText(r.description),
      errorText: plainError,
      plan: r.task ? planToggleChecklistActive(r.task.approval, canEdit) : planToggleGateActive(r.gate, canEdit),
    });
  };

  const confirmDelete = () => {
    const t = deleteTarget;
    setDeleteTarget(null);
    if (!t?.task) return;
    void writes.run({
      progress: deletingChecklistText(headline, t.task.item?.name ?? t.description),
      errorText: plainError,
      plan: planDeleteChecklistApproval(t.task.approval, canEdit),
    });
  };

  const toggleCountry = (id: string) => {
    const next = new Set(railOpen);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpandedCountries(next);
  };

  const cell = (c: CellText) => <span className={s.person} title={c.tooltip}>{c.text}</span>;

  const statusChip = (active: boolean, enabled: boolean, testId: string, onClick: () => void) => {
    const caption = active ? SCREEN_LABELS.active : SCREEN_LABELS.inactive;
    return (
      <Button
        size="small" appearance="outline"
        className={mergeClasses(s.chip, active ? s.chipActive : s.chipInactive)}
        disabled={!enabled} aria-label={caption} data-testid={testId} onClick={onClick}
      >
        {caption}
      </Button>
    );
  };

  const renderRow = (r: GateTableRow) => {
    if (r.kind === "addTask") {
      return (
        <TableRow key={r.key}>
          <TableCell colSpan={GATE_TABLE_COLUMNS.length}>
            <Button
              appearance="transparent" icon={<AddRegular />} className={mergeClasses(s.icon, s.taskDesc)}
              disabled={!canEdit || !r.addTaskEnabled}
              aria-label={SCREEN_LABELS.addTask}
              data-testid="but_Admin_ProjectGatest_Approvals_Row_Edit_3"
              onClick={() => {
                const first = checklistOptions(items, checklistApprovals, r.gate.gate.id, countryTechId, null)[0] ?? null;
                setPanel(checklistPanelFrom(r.gate, first, null));
              }}
            >
              {SCREEN_LABELS.addTask}
            </Button>
          </TableCell>
        </TableRow>
      );
    }
    const isGate = r.kind === "gate";
    const open = !collapsed.has(r.gate.gate.id);
    return (
      <TableRow key={r.key}>
        <TableCell>
          {isGate ? (
            <span className={s.gateDesc}>
              {r.taskCount > 0 ? (
                <Button
                  appearance="subtle" size="small"
                  aria-label={open ? SCREEN_LABELS.collapse : SCREEN_LABELS.expand}
                  aria-expanded={open}
                  data-testid="btn_Admin_ProjectGates_DefaultClusterApproval_Item_Collapse"
                  onClick={() => toggleCollapsed(r.gate.gate.id)}
                >
                  {open ? SCREEN_LABELS.collapse : SCREEN_LABELS.expand}
                </Button>
              ) : null}
              <span>{r.description}</span>
            </span>
          ) : (
            <span className={s.taskDesc}>{r.description}</span>
          )}
        </TableCell>
        <TableCell>{cell(r.cells.portfolioManager)}</TableCell>
        <TableCell>{cell(r.cells.contributors)}</TableCell>
        <TableCell>{cell(r.cells.approvers)}</TableCell>
        <TableCell>{cell(r.cells.notifications)}</TableCell>
        <TableCell>
          {r.active === null ? null : isGate
            ? statusChip(
              r.active, canEdit && canToggleGateChip(r.gate),
              "btn_Admin_ProjectGates_DefaultClusterApproval_Item_ToggleStauts",
              () => toggleRow(r),
            )
            : statusChip(
              r.active, canEdit,
              "btn_Admin_ProjectGates_DefaultClusterApproval_Item_ChecklistDefaultApproval_Item_ToggleStatus",
              () => toggleRow(r),
            )}
        </TableCell>
        <TableCell>
          <span className={s.actions}>
            <Button
              appearance="transparent" size="small" className={s.icon} icon={<EditRegular />}
              aria-label={SCREEN_LABELS.edit}
              data-testid={isGate
                ? "btn_Admin_ProjectGates_DefaultClusterApproval_Item_Edit"
                : "btn_Admin_ProjectGates_DefaultClusterApproval_Item_ChecklistDefaultApproval_Item_Edit"}
              onClick={() => setPanel(isGate
                ? gatePanelFrom(r.gate)
                : checklistPanelFrom(r.gate, r.task?.item ?? null, r.task?.approval ?? null))}
            />
            {isGate ? null : (
              <Button
                appearance="transparent" size="small" className={s.icon} icon={<DeleteRegular />}
                disabled={!canEdit} aria-label={SCREEN_LABELS.delete}
                data-testid="btn_Admin_ProjectGates_DefaultClusterApproval_Item_ChecklistDefaultApproval_Item_Delete"
                onClick={() => setDeleteTarget(r)}
              />
            )}
          </span>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div className={s.page}>
      {/* `cmp_Admin_ProjectGatest_Approvals_Header.Project.Name` — the page title. */}
      <Text as="h1" className={s.title}>{SCREEN_LABELS.pageTitle}</Text>
      <WriteFeedback progress={writes.progress} error={writes.error} success={writes.success} testIdPrefix="gates-approvals" />

      {loadError ? (
        <EmptyState title={MSG.loadFailedTitle} description={MSG.loadFailedDescription} />
      ) : loading ? (
        <LoadingOverlay mode="inline" label={MSG.loading} />
      ) : (
        <div className={s.split}>
          <nav
            className={s.rail}
            aria-label={SCREEN_LABELS.pageTitle}
            data-testid="cmp_Admin_ProjectGates_NestedCountryTechnologyPicker"
          >
            {rail.map((c) => {
              const isOpen = railOpen.has(c.key);
              return (
                <div key={c.key}>
                  <Button
                    appearance="subtle" className={s.railCountry}
                    icon={isOpen ? <ChevronDownRegular /> : <ChevronRightRegular />}
                    aria-label={c.label} aria-expanded={isOpen}
                    data-testid={`cbx_CountrySelected-${c.key}`}
                    onClick={() => toggleCountry(c.key)}
                  >
                    {c.label}
                  </Button>
                  {isOpen ? c.children.map((t) => {
                    const selected = scope.country?.id === c.key && scope.technology === t.label;
                    return (
                      <Button
                        key={t.key} appearance="subtle"
                        className={mergeClasses(s.railTech, selected && s.railSelected)}
                        aria-label={t.label} aria-pressed={selected}
                        data-testid={`admin-gates-approvals-technology-${c.key}-${t.key}`}
                        onClick={() => setPicked({ country: { id: c.key, name: c.label }, technology: t.label })}
                      >
                        {t.label}
                      </Button>
                    );
                  }) : null}
                </div>
              );
            })}
          </nav>

          <div className={s.content}>
            <Text className={s.headline} data-testid="lbl_Admin_ProjectGates_Approvals_Headline">
              {headline}
            </Text>
            <div className={s.tableWrap}>
              <Table
                size="small" className={s.table} aria-label={SCREEN_LABELS.pageTitle}
                data-testid="gal_Admin_ProjectGates_DefaultApprovals_Clusters"
              >
                <TableHeader>
                  <TableRow>
                    {GATE_TABLE_COLUMNS.map((c) => <TableHeaderCell key={c}>{c}</TableHeaderCell>)}
                  </TableRow>
                </TableHeader>
                <TableBody>{rows.map(renderRow)}</TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}

      <ApprovalPanel
        panel={panel}
        scope={scope}
        canEdit={canEdit}
        gateItem={panel ? gateItemOf(panel.gate.id) : null}
        checklistChoices={panel?.kind === "checklist"
          ? checklistOptions(
            items, checklistApprovals, panel.gate.id, countryTechId,
            panel.existingId !== null ? panel.checklistItem : null,
          )
          : []}
        existingApprovalForGate={panel?.kind === "gate"
          && approvals.some((a) => a.clusterStateId === panel.gate.id)}
        onChange={setPanel}
        onSave={save}
        onReset={resetGate}
        onClose={closePanel}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={SCREEN_LABELS.deleteTitle}
        description={deleteTarget
          ? deleteChecklistApprovalText(
            scope.country?.name ?? null, scope.technology,
            gateDescription(deleteTarget.gate.gate.order ?? 0),
            deleteTarget.task?.item?.name ?? deleteTarget.description,
          )
          : ""}
        confirmText={SCREEN_LABELS.deleteConfirm}
        cancelText={SCREEN_LABELS.cancel}
        confirmIcon="delete"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────── the panel */

function ApprovalPanel({
  panel, scope, canEdit, gateItem, checklistChoices, existingApprovalForGate,
  onChange, onSave, onReset, onClose,
}: {
  panel: ApprovalPanelState | null;
  scope: Scope;
  canEdit: boolean;
  gateItem: GateDropdownItem | null;
  checklistChoices: ChecklistItem[];
  existingApprovalForGate: boolean;
  onChange: (p: ApprovalPanelState) => void;
  onSave: () => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const s = useStyles();
  const errors = panel ? validatePanel(panel, { existingApprovalForGate }) : null;
  const mode = panel?.mode ?? APPROVAL_MODE.onlyNotifications;
  const formal = mode === APPROVAL_MODE.formalApproval;
  const onlyNotifications = mode === APPROVAL_MODE.onlyNotifications;
  const banner = nonWindPvBanner(scope.technology);
  const gateLabel = gateRecordName(gateItem);
  const itemName = panel?.checklistItem?.name ?? "";

  return (
    <FormPanel
      open={panel !== null}
      title={panel ? panelTitle(panel) : ""}
      width="narrow"
      onDismiss={onClose}
      footer={
        <PanelButtons
          onSave={onSave}
          onCancel={onClose}
          disabled={!panel || !canSavePanel(panel, { canEdit, existingApprovalForGate })}
          saveTestId="pcf_but_Admin_ProjectGates_Approvals_Form_Buttons_Save"
          cancelTestId="pcf_but_Admin_ProjectGates_Approvals_Form_Buttons_Cancel"
        />
      }
    >
      {panel && errors ? (
        <div className={s.panelBody}>
          {errors.duplicateGate ? (
            <Text className={s.error} role="alert" data-testid="lbl_Admin_ProjectGates_Approvals_Form_Fields_Main_ErrorMessage">
              {MSG.duplicateGate}
            </Text>
          ) : null}

          {/* `DisplayMode.Disabled` (live line); the asterisk `lbl_…_State_Requered` is `Visible: =false`. */}
          <Field
            label={PANEL_LABELS.gate}
            validationState={gateItem ? "none" : "error"}
            validationMessage={gateItem ? undefined : MSG.clusterBlank}
          >
            <Dropdown
              disabled value={gateLabel} selectedOptions={[gateLabel]}
              aria-label="Project Status"
              data-testid="drp_Admin_ProjectGates_Approvals_Form_Fields_State"
            >
              <Option value={gateLabel}>{gateLabel}</Option>
            </Dropdown>
          </Field>

          {panel.kind === "checklist" ? (
            <Field
              label={SCREEN_LABELS.checkList} required
              validationState={errors.checklistBlank ? "error" : "none"}
              validationMessage={errors.checklistBlank ? MSG.clusterBlank : undefined}
            >
              <Dropdown
                disabled={!canEdit || panel.existingId !== null}
                value={itemName} selectedOptions={panel.checklistItem ? [panel.checklistItem.id] : []}
                aria-label={SCREEN_LABELS.checkList}
                data-testid="drp_Admin_ProjectGates_Approvals_Form_Fields_State_1"
                onOptionSelect={(_, d) => onChange({
                  ...panel, checklistItem: checklistChoices.find((i) => i.id === d.optionValue) ?? null,
                })}
              >
                {checklistChoices.map((i) => <Option key={i.id} value={i.id}>{i.name}</Option>)}
              </Dropdown>
            </Field>
          ) : null}

          <Switch
            label={PANEL_LABELS.gateActive}
            aria-label={PANEL_LABELS.gateActive}
            data-testid="tog_Admin_ProjectGates_Approvals_Form_Fields_Active"
            checked={panel.gateActive}
            disabled={!canEdit || !canToggleGateActiveInPanel(panel.kind, panel.gate.name)}
            onChange={(_, d) => onChange({ ...panel, gateActive: d.checked })}
          />

          {/* The asterisk `lbl_…_ApprovalMode_Required` is `Visible: =false`. */}
          <Field label={PANEL_LABELS.approvalMode}>
            <RadioGroup
              value={String(mode)}
              disabled={!canEdit}
              aria-label={PANEL_LABELS.approvalMode}
              data-testid="rad_Admin_ProjectGates_Approvals_Form_Fields_ApprovalMode"
              onChange={(_, d) => onChange({ ...panel, mode: Number(d.value) })}
            >
              {approvalModeChoices(scope.technology).map((c) => (
                <Radio key={c} value={String(c)} label={approvalModeLabel(c)} aria-label={approvalModeLabel(c)}
                  data-testid={`rad_Admin_ProjectGates_Approvals_Form_Fields_ApprovalMode-${c}`} />
              ))}
            </RadioGroup>
          </Field>

          {banner ? <MessageBar intent="warning"><MessageBarBody>{banner}</MessageBarBody></MessageBar> : null}

          {formal ? (
            <>
              <GatePeoplePicker
                label={SCREEN_LABELS.portfolioManager}
                placeholder={SCREEN_LABELS.portfolioManagerPlaceholder}
                tooltip={PICKER_TOOLTIPS.portfolioManager}
                testId="pcf_Admin_ProjectGates_Approvals_Form_Fields_PortfolioManger"
                maxPeople={PERSON_LIMITS.portfolioManager} excludeSelected={false}
                required error={errors.portfolioManager} disabled={!canEdit}
                value={panel.portfolioManager ? [panel.portfolioManager] : []}
                onChange={(v) => onChange({ ...panel, portfolioManager: v[0] ?? null })}
              />
              <GatePeoplePicker
                label={SCREEN_LABELS.contributors}
                placeholder={SCREEN_LABELS.contributorsPlaceholder}
                tooltip={PICKER_TOOLTIPS.contributors}
                testId="pcf_Admin_ProjectGates_Approvals_Form_Fields_Approval2"
                maxPeople={PERSON_LIMITS.contributors} excludeSelected
                required error={errors.contributors} disabled={!canEdit}
                value={panel.contributors}
                onChange={(v) => onChange({ ...panel, contributors: v })}
              />
            </>
          ) : null}

          {onlyNotifications ? null : (
            <GatePeoplePicker
              label={SCREEN_LABELS.approvers}
              placeholder={SCREEN_LABELS.approversPlaceholder}
              tooltip={PICKER_TOOLTIPS.approvers}
              testId="pcf_Admin_ProjectGates_Approvals_Form_Fields_Approvals"
              maxPeople={PERSON_LIMITS.approvers} excludeSelected
              required error={errors.approvers} disabled={!canEdit}
              value={panel.approvers}
              onChange={(v) => onChange({ ...panel, approvers: v })}
            />
          )}

          <GatePeoplePicker
            label={PANEL_LABELS.notifications}
            placeholder={PANEL_LABELS.notificationsPlaceholder}
            tooltip={PICKER_TOOLTIPS.notifications}
            testId="pcf_Admin_ProjectGates_Approvals_Form_Fields_Notifications"
            maxPeople={PERSON_LIMITS.notifications} excludeSelected
            required={onlyNotifications} error={errors.notifications} disabled={!canEdit}
            value={panel.notifications}
            onChange={(v) => onChange({ ...panel, notifications: v })}
          />

          {panel.kind === "gate" ? (
            <div className={s.resetRow}>
              <Button
                appearance="primary"
                disabled={!canResetGate(panel, canEdit)}
                aria-label={PANEL_LABELS.resetGate}
                data-testid="btn_Admin_ProjectGates_Approvals_Form_Fields_ResetGateApproval"
                onClick={onReset}
              >
                {PANEL_LABELS.resetGate}
              </Button>
              <Text className={s.resetCaption}>{MSG.resetGateCaption}</Text>
            </div>
          ) : null}
        </div>
      ) : null}
    </FormPanel>
  );
}

/** `term` settles for 300 ms before it is searched (one Graph-backed request per pause). */
function useSettled(term: string, ms = 300): string {
  const [settled, setSettled] = useState(term);
  useEffect(() => {
    const t = setTimeout(() => setSettled(term), ms);
    return () => clearTimeout(t);
  }, [term, ms]);
  return settled;
}

/** One canvas people picker: the kit `PeoplePicker` over `usePeopleSearch`. */
function GatePeoplePicker({
  label, placeholder, tooltip, testId, value, onChange, maxPeople, excludeSelected, required, error, disabled,
}: {
  label: string;
  placeholder: string;
  tooltip: string;
  testId: string;
  value: Persona[];
  onChange: (next: Persona[]) => void;
  maxPeople: number;
  excludeSelected: boolean;
  required?: boolean;
  error?: boolean;
  disabled?: boolean;
}) {
  const [term, setTerm] = useState("");
  const found = usePeopleSearch(useSettled(term)).data;
  return (
    <PeoplePicker
      label={label}
      placeholder={placeholder}
      tooltip={tooltip}
      testId={testId}
      value={value}
      onChange={onChange}
      onPick={(p) => applyPersonaSelection(value, p, maxPeople)}
      maxPeople={maxPeople}
      term={term}
      onTermChange={setTerm}
      suggestions={term.trim() ? pickerSuggestions(found, value, excludeSelected) : []}
      required={required}
      errorMessage={error ? MSG.valueEmpty : undefined}
      disabled={disabled}
    />
  );
}
