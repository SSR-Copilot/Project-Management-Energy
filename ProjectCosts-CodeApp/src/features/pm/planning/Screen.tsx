/**
 * Project Planning Screen — composition only (connected 20 Oct 2026, D31).
 *
 * Canvas screen: `Project Planning Screen.pa.yaml` (PM app). The layout follows its containers:
 *
 *   lock message   `con_Milestones_Page_LockMessage_5` — title and one bullet per prerequisite
 *   tab strip      `tab_ProjectPlanning_DisplayProjectBodyRightContent` — General / Repowering /
 *                  Aquisition Status (`locTabList`), disabled while locked or Draft
 *   General        Cooperation (+ Partner, + Details), Legal Planning Basis, Planning Basis
 *                  Category, Permit Procedure, Planning Basis Details, the Height limitation WTG
 *                  toggle (+ Height limitation [m]), and the Permits grid with its command bar
 *                  (New Permit · Edit · Delete) and columns Permit · Permit Submitted · Permit Approved
 *   Repowering     Repowering (+ Access to old plants secured, + Repowering Details)
 *   Aquisition     two galleries, LLAs in personam and LLAs in rem — Types · Secured · Required ·
 *                  Aquisition Status [%] · an Edit icon per row
 *   buttons        `pcf_…_ButtonsSave` / `pcf_…_ButtonsReset`
 *   panels         New/Edit Permit, Aquisition Status
 *   dialogs        `cmp_ProjectPlanning_PopUp_ConfirmationDeletePermit`; `cmp_PopUp_Loading_Planning_Screen`
 *                  is `LoadingOverlay` / `WriteFeedback`
 *
 * The leave dialog (`cmp_PopUp_Leave_Planning_Confirmation`) is the shared `UnsavedChangesGuard`
 * (D35), armed by `shouldConfirmLeave(form, baseline)`. Every caption, gate and
 * write comes from `rules.ts`; every read and write from `./hooks`.
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Button, Switch, Tab, TabList, Table, TableBody, TableCell,
  TableHeader, TableHeaderCell, TableRow, Text, Tooltip, makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import { CircleRegular, EditRegular, LockClosedRegular, RecordRegular } from "@fluentui/react-icons";
import {
  Choices,
  type Command,
  CommandBar,
  ConfirmDialog,
  CostField,
  EmptyState,
  FormPanel,
  LoadingOverlay,
  PanelButtons,
  ReadOnlyField,
  TaggedDateField,
  ChoiceField as SharedChoiceField,
  TextAreaField,
  TextField,
  WriteFeedback,
  UnsavedChangesGuard,
} from "@/components";
import { useSession } from "@/app/SessionContext";
import { dateOnly } from "@/data/odata";
import { palette, space } from "@/theme/tokens";
import {
  AQUISITION_GRID_COLUMNS, AQUISITION_MAX_LENGTH, AQUISITION_PANEL, CUSTOM_CHOICE_FIELD, FIELD_LABELS,
  GENERAL_TAB_LABELS, LLA_TYPE_LABEL, MAX_LENGTH, NOTIFY, PAGE_LOCK_ICON_TESTID, PAGE_LOCK_TESTID,
  PAGE_LOCK_TITLE, PAGE_LOCK_TITLE_TESTID, PERMIT_COMMAND_LABELS, PERMIT_DATE_TYPES, PERMIT_DIALOG,
  PERMIT_GRID_COLUMNS, PERMIT_PANEL_LABELS, PLANNING_BASIS_CATEGORIES, PLANNING_SCREEN_TEXT, PLANNING_TABS,
  REPOWERING_TAB_LABELS, SCREEN_MSG, YES_NO_UNKNOWN,
  applyCooperationChange, applyHeightToggle, applyRepoweringChange, aquisitionDraftFrom, aquisitionPanelTitle,
  aquisitionRowsFor, canEditLegalPlanningBasis, canEditPlanning, canReset, canSave, canSaveAquisition,
  canSavePermit, canSwitchTabs, clearAquisitionJob, cooperationDetailsEditable, countCell, customChoiceOptions,
  deletePermitDescription, deletePermitJob, emptyPermitDraft, pageLock, parseTab, percentCell,
  permitCommandState, permitDateCell, permitDateIsActual, permitDateTag, permitDateValue, permitDraftFrom,
  permitInputDate, permitPanelTitle, resetPlanningForm,
  saveAquisitionJob, savePermitJob, savePlanningJob, securedPercent, showCooperationDetails,
  showCooperationPartner, showHeightLimit, showRepoweringDetails, showSecuredAccess, toPlanningForm,
  togglePermitSelection, validateAquisition, validatePlanning,
  LEAVE_DIALOG, shouldConfirmLeave,
  type AquisitionDraft, type AquisitionStatusRow, type LlaType, type PermitDraft, type PlanningForm,
} from "./rules";
import {
  PLANNING_CAN_EDIT, useAquisitionStatuses, useAquisitionTypes, useCustomChoiceValues, usePermits,
  usePlanningProject, usePlanningWrites, useProjectPlanning,
} from "./hooks";

const C = "ProjectPlanning_DisplayProjectBodyRightContent";

// Layout transcribed from `con_ProjectPlanning_DisplayProjectBodyRightContent` (UI layout pass,
// 20 Oct 2026). The shell's content area scrolls, so the page grows with its content and never clips
// itself to the viewport; the old inner scroll box (which cut off the Permits grid) is gone.
const useStyles = makeStyles({
  // The right content: a white vertical autolayout, no padding and no gap.
  page: { display: "flex", flexDirection: "column", flex: "1 0 auto", minWidth: 0, backgroundColor: palette.white },
  // The tab body has the only FillPortion, so the button row sits at the bottom.
  body: { display: "flex", flexDirection: "column", flex: "1 0 auto", minWidth: 0 },
  // `con_Milestones_Page_LockMessage_5`: Fill RGBA(89,89,89,1), horizontal, gap 10, PaddingLeft 20,
  // items centred, white icon and text; `con_Milestones_pagelock_section_5` pads 8.
  lock: {
    display: "flex", alignItems: "center", gap: "10px", paddingLeft: "20px", flex: "none",
    backgroundColor: "rgb(89, 89, 89)", color: palette.white,
  },
  lockText: {
    display: "flex", flexDirection: "column", paddingTop: "8px", paddingBottom: "8px", paddingLeft: "8px", paddingRight: "8px",
    "& .fui-Text": { color: palette.white },
  },
  // `con_…_Tab`: 50 high, items centred; the TabList is `Parent.Width/2` wide.
  tabs: { display: "flex", alignItems: "center", height: "50px", flex: "none", "& > div": { width: "50%" } },
  // `con_…_General` / `_Repowering`: a horizontal, wrapping row of 380-wide vertical forms.
  wrapRow: { display: "flex", flexWrap: "wrap", alignItems: "flex-start", minWidth: 0 },
  // `con_…_CooperationForm` (PaddingTop/Bottom 20) and `con_…_PlanningBasisForm` (PaddingTop 20):
  // vertical, `Min(380, Parent.Width)` wide.
  form: {
    display: "flex", flexDirection: "column", width: "100%", maxWidth: "380px", paddingTop: "20px",
    boxSizing: "border-box",
  },
  formPadBottom: { paddingBottom: "20px" },
  // Each field's ManualLayout container: label and control at X = 20, `Parent.Width - 40` wide;
  // 70 high for one line, 94 for a 64-high text box, 178 for a 140-high one. Labels are Semibold.
  field: {
    minHeight: "70px", paddingLeft: "20px", paddingRight: "20px", boxSizing: "border-box",
    "& .fui-Field__label, & label": { fontWeight: tokens.fontWeightSemibold },
    "& .fui-Dropdown": { width: "100%", minWidth: 0 },
  },
  fieldTall: { minHeight: "94px" },
  fieldTaller: { minHeight: "178px" },
  // `con_…_HeightLimitation`: the full row — the 40-high toggle container (toggle at X = 10, 220
  // wide), then the 86-high field container at the cooperation form's width (380).
  heightRow: { display: "flex", flexDirection: "column", width: "100%" },
  toggle: { display: "flex", alignItems: "center", height: "40px", paddingLeft: "10px" },
  heightField: { width: "100%", maxWidth: "380px", minHeight: "86px", boxSizing: "border-box" },
  // `con_…_Permits`: the command bar at X = 40, then header and gallery at X = 20, `Min(Parent.Width, 700)`.
  permits: { display: "flex", flexDirection: "column", width: "100%", paddingBottom: "10px" },
  // The command bar's first icon starts on the left edge of the content under it (PO, 21 Oct 2026); `CommandBar` has no inset of its own. Over the Permit column text (the table's 20 px inset + the 30 px select column + the cell's 3 px).
  permitsBar: { paddingLeft: "53px", maxWidth: "700px" },
  gridWrap: { overflowX: "auto", paddingLeft: "20px", paddingRight: "20px" },
  // Header: Fill #FAFAFA, 36 high; labels Semibold at X = 30 (Permit 240, Submitted 180, Approved 180).
  permitTable: { width: "100%", maxWidth: "700px", tableLayout: "fixed" },
  permitHeader: { backgroundColor: "#FAFAFA", height: "36px", "& th": { fontWeight: tokens.fontWeightSemibold, height: "36px" } },
  // Rows: TemplateSize 34, no padding.
  permitRow: { height: "34px" },
  colSelect: { width: "30px", paddingLeft: 0, paddingRight: 0 },
  colPermit: { width: "240px" },
  colDate: { width: "180px" },
  selectCell: { width: "30px", paddingLeft: 0, paddingRight: 0 },
  row: { cursor: "pointer" },
  rowSelected: { backgroundColor: palette.themeLighter, cursor: "pointer" },
  /** `lbl_…_PermitsRowSubmitted` / `…Approved` `.FontColor` for an Actual date. */
  actualDate: { color: palette.themePrimary },
  // `img_…_PermitsRowSelectionDot`: 16 px at X = 4.
  radio: { color: palette.themePrimary, minWidth: "24px", "& svg": { fontSize: "16px" } },
  // `con_…_AquisitionStatusForm`: vertical, LayoutGap 10, PaddingTop 10; each block
  // `Min(780, Parent.Width)` with PaddingTop 10.
  aquisition: { display: "flex", flexDirection: "column", gap: "10px", paddingTop: "10px" },
  section: { display: "flex", flexDirection: "column", width: "100%", maxWidth: "780px", paddingTop: "10px", minWidth: 0 },
  // The header block at X = 20, Fill #FAFAFA: the Semibold name (`gblAppSizes.Font.Medium`, 11 pt,
  // RGBA(50, 49, 48, 1)) over the column captions.
  sectionTitle: {
    display: "block", marginLeft: "20px", marginRight: "20px", paddingLeft: "10px", paddingTop: "4px",
    backgroundColor: "#FAFAFA", fontWeight: tokens.fontWeightSemibold, fontSize: "14.67px", color: "rgb(50, 49, 48)",
  },
  aqTable: { width: "100%", tableLayout: "fixed" },
  aqHeader: {
    backgroundColor: "#FAFAFA",
    "& th": { fontSize: "14.67px", color: "rgb(50, 49, 48)", fontWeight: tokens.fontWeightSemibold },
    "& th:first-child": { fontWeight: tokens.fontWeightRegular },
  },
  // Rows: TemplateSize 28 + TemplatePadding 1, a 1 px `GallerySeparatorBg` (hoverButton) line; the
  // counts and percentage Semibold, right-aligned.
  aqRow: {
    height: "29px", borderBottomWidth: "1px", borderBottomStyle: "solid", borderBottomColor: palette.hoverButton,
    "& td": { fontSize: "14.67px", color: "rgb(50, 49, 48)" },
  },
  colName: { width: "300px" },
  colCount: { width: "100px", textAlign: "right", fontWeight: tokens.fontWeightSemibold },
  colPercent: { width: "160px", textAlign: "right", fontWeight: tokens.fontWeightSemibold },
  colAction: { width: "60px", textAlign: "right" },
  // `con_…_Buttons`: 50 high, items centred, LayoutGap 10, justified end, PaddingRight 10; 96 x 32 buttons.
  buttons: {
    display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "10px", flex: "none",
    height: "50px", paddingRight: "10px",
    "& button": { width: "96px", minWidth: "96px", height: "32px" },
  },
  panelBody: { display: "flex", flexDirection: "column", gap: space.m },
});

/** A labelled option-set / lookup dropdown; `aria-label` and `data-testid` are the canvas name. */
function ChoiceField({ label, testId, value, options, disabled, onChange }: {
  label: string; testId: string; value: number | string | null;
  options: readonly { value: number | string; label: string }[];
  disabled: boolean; onChange: (value: string | null) => void;
}) {
  // The shared modern dropdown (sweep 20 Oct 2026); the canvas AccessibleLabel is the control name.
  const selected = options.find((o) => o.value === value);
  return (
    <SharedChoiceField
      label={label}
      ariaLabel={testId}
      testId={testId}
      disabled={disabled}
      value={selected ? String(selected.value) : null}
      options={options.map((o) => ({ value: String(o.value), label: o.label }))}
      onSelect={onChange}
    />
  );
}

export default function PlanningScreen() {
  const s = useStyles();
  const { projectId } = useSession();
  const [params, setParams] = useSearchParams();
  const tab = parseTab(params.get("tab"));

  const projectQ = usePlanningProject(projectId);
  const project = projectQ.data;
  const planningQ = useProjectPlanning(project);
  const planning = planningQ.data;
  const permitsQ = usePermits(projectId, planning?.id);
  const typesQ = useAquisitionTypes();
  const aquisitionQ = useAquisitionStatuses(project, typesQ.data, !typesQ.isLoading && !typesQ.error);
  const countryId = project?.countryId ?? null;
  const legalQ = useCustomChoiceValues(CUSTOM_CHOICE_FIELD.legalPlanningBasis, countryId, Boolean(project));
  const procedureQ = useCustomChoiceValues(CUSTOM_CHOICE_FIELD.permitProcedure, countryId, Boolean(project));
  const writes = usePlanningWrites(projectId);

  const baseline = useMemo(() => toPlanningForm(planning), [planning]);
  const [edited, setEdited] = useState<PlanningForm | null>(null);
  const form = edited ?? baseline;

  const [selectedPermitId, setSelectedPermitId] = useState<string | null>(null);
  const [permitPanel, setPermitPanel] = useState<{ permitId: string | null; draft: PermitDraft } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [aquisition, setAquisition] = useState<{ row: AquisitionStatusRow; lla: LlaType; draft: AquisitionDraft } | null>(null);

  const loading = projectQ.isLoading || planningQ.isLoading;
  const busy = writes.progress !== null;
  const gating = { project, canEdit: PLANNING_CAN_EDIT };
  const editable = canEditPlanning(gating) && !busy;
  const validity = validatePlanning(form);
  const legalOptions = customChoiceOptions(legalQ.data, countryId).map((o) => ({ value: o.id, label: o.label }));
  const procedureOptions = customChoiceOptions(procedureQ.data, countryId).map((o) => ({ value: o.id, label: o.label }));
  const selectedPermit = permitsQ.data.find((p) => p.id === selectedPermitId) ?? null;
  const permitGates = permitCommandState(gating, selectedPermit);
  const saveEnabled = canSave({ project, canEdit: PLANNING_CAN_EDIT, form, baseline, busy });
  const lock = loading ? [] : pageLock(project);

  const permitCommands: Command[] = [
    { key: "newPermit", label: PERMIT_COMMAND_LABELS.newPermit, icon: "Add", enabled: !busy && permitGates.canNew },
    { key: "editPermit", label: PERMIT_COMMAND_LABELS.edit, icon: "Edit", enabled: !busy && permitGates.canEdit },
    { key: "deletePermit", label: PERMIT_COMMAND_LABELS.delete, icon: "Delete", enabled: !busy && permitGates.canDelete },
  ];
  const onPermitCommand = (key: string) => {
    writes.clear();
    if (key === "newPermit") { setSelectedPermitId(null); setPermitPanel({ permitId: null, draft: emptyPermitDraft() }); }
    if (key === "editPermit" && selectedPermit) setPermitPanel({ permitId: selectedPermit.id, draft: permitDraftFrom(selectedPermit) });
    if (key === "deletePermit" && selectedPermit) setConfirmDelete(true);
  };
  /** `closeKey` / Cancel / the end of Save: close the panel and clear `locSelectedPermit`. */
  const closePermitPanel = () => { setPermitPanel(null); setSelectedPermitId(null); };

  const onSave = async () => {
    writes.clear();
    const ids = await writes.run(savePlanningJob(form, project, planning));
    if (ids !== null) setEdited(null);
  };
  const onReset = () => { writes.clear(); setEdited(resetPlanningForm(form, baseline)); setSelectedPermitId(null); };

  const onSavePermit = async () => {
    if (!permitPanel) return;
    const job = savePermitJob(permitPanel.draft, permitPanel.permitId, planning);
    await writes.run(job);
    closePermitPanel();
  };
  const onDeletePermit = async () => {
    if (!selectedPermit) return;
    const job = deletePermitJob(selectedPermit.id);
    setConfirmDelete(false);
    await writes.run(job);
    setSelectedPermitId(null);
  };

  const onSaveAquisition = async () => {
    if (!aquisition) return;
    const job = saveAquisitionJob(aquisition.draft, aquisition.row, project);
    setAquisition(null);
    await writes.run(job);
  };
  const onClearAquisition = async () => {
    if (!aquisition) return;
    const job = clearAquisitionJob(aquisition.row);
    setAquisition(null);
    await writes.run(job);
  };

  if (projectQ.error || planningQ.error || permitsQ.error || typesQ.error || aquisitionQ.error) {
    return (
      <div className={s.page} data-testid="Project Planning Screen">
        <EmptyState title={PLANNING_SCREEN_TEXT.loadFailedTitle} description={PLANNING_SCREEN_TEXT.loadFailedDescription} />
      </div>
    );
  }

  const set = (patch: Partial<PlanningForm>) => setEdited({ ...form, ...patch });

  const aquisitionTable = (lla: LlaType) => {
    const testBase = lla === "personam" ? "UnderLaw" : "InRem";
    const rows = aquisitionRowsFor(aquisitionQ.data, lla);
    return (
      <div className={s.section} data-testid={`con_${C}_AquisitionStatus_${testBase}`}>
        <Text className={s.sectionTitle}>{LLA_TYPE_LABEL[lla]}</Text>
        <div className={s.gridWrap}>
          <Table size="small" className={s.aqTable} aria-label={LLA_TYPE_LABEL[lla]}>
            <TableHeader>
              <TableRow className={s.aqHeader}>
                <TableHeaderCell className={s.colName}>{AQUISITION_GRID_COLUMNS.types}</TableHeaderCell>
                <TableHeaderCell className={s.colCount}>{AQUISITION_GRID_COLUMNS.secured}</TableHeaderCell>
                <TableHeaderCell className={s.colCount}>{AQUISITION_GRID_COLUMNS.required}</TableHeaderCell>
                <TableHeaderCell className={s.colPercent}>{AQUISITION_GRID_COLUMNS.percentage}</TableHeaderCell>
                <TableHeaderCell className={s.colAction}>{AQUISITION_GRID_COLUMNS.action}</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className={s.aqRow}>
                  <TableCell className={s.colName} title={r.typeName ?? ""}>{r.typeName ?? ""}</TableCell>
                  <TableCell className={s.colCount}>{countCell(r.secured)}</TableCell>
                  <TableCell className={s.colCount}>{countCell(r.required)}</TableCell>
                  <TableCell className={s.colPercent}>{percentCell(r)}</TableCell>
                  <TableCell className={s.colAction}>
                    <Button
                      appearance="subtle"
                      icon={<EditRegular />}
                      disabled={busy}
                      onClick={() => { writes.clear(); setAquisition({ row: r, lla, draft: aquisitionDraftFrom(r) }); }}
                      aria-label={`pcf_but_${C}_AquisitionStatus_${testBase}_Edit`}
                      data-testid={`pcf_but_${C}_AquisitionStatus_${testBase}_Edit`}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  };

  const aqValidity = aquisition ? validateAquisition(aquisition.draft) : null;
  const aqPercent = aquisition ? securedPercent(aquisition.draft.secured, aquisition.draft.required) : "";
  const setPermitDraft = (patch: Partial<PermitDraft>) =>
    permitPanel && setPermitPanel({ ...permitPanel, draft: { ...permitPanel.draft, ...patch } });

  return (
    <div className={s.page} data-testid="Project Planning Screen">
      {loading ? <LoadingOverlay mode="blocking" label={NOTIFY.loading} /> : null}
      <WriteFeedback progress={writes.progress} error={writes.error} success={writes.success} testIdPrefix="planning" />

      {lock.length > 0 ? (
        <div className={s.lock} data-testid={PAGE_LOCK_TESTID}>
          <LockClosedRegular aria-hidden fontSize={20} data-testid={PAGE_LOCK_ICON_TESTID} />
          <div className={s.lockText}>
            <Text data-testid={PAGE_LOCK_TITLE_TESTID}>{PAGE_LOCK_TITLE}</Text>
            {lock.map((e) => <Text key={e.reason} data-testid={e.testId}>{e.label}</Text>)}
          </div>
        </div>
      ) : null}

      <div className={s.tabs}>
        <TabList
          selectedValue={tab}
          disabled={!canSwitchTabs(gating)}
          onTabSelect={(_, d) => setParams((p) => { p.set("tab", String(d.value)); return p; })}
          aria-label="tab_ProjectPlanning_DisplayProjectBodyRightContent"
          data-testid="tab_ProjectPlanning_DisplayProjectBodyRightContent"
        >
          {PLANNING_TABS.map((t) => <Tab key={t.key} value={t.key} aria-label={t.label}
            data-testid={`tab_${C}-${t.key}`}>{t.label}</Tab>)}
        </TabList>
      </div>

      <div className={s.body}>
        {tab === "general" ? (
          <div className={s.wrapRow}>
            {/* `con_…_CooperationForm` */}
            <div className={mergeClasses(s.form, s.formPadBottom)}>
              <div className={s.field}>
                <ChoiceField
                  label={GENERAL_TAB_LABELS.cooperation} testId="drp_ProjectPlanning_DisplayProjectBodyRightContent_Cooperation"
                  value={form.cooperation} options={YES_NO_UNKNOWN} disabled={!editable}
                  onChange={(v) => setEdited(applyCooperationChange(form, v === null ? null : Number(v)))}
                />
              </div>
              {showCooperationPartner(form.cooperation) ? (
                <div className={mergeClasses(s.field, s.fieldTall)}>
                  <TextAreaField
                    label={FIELD_LABELS.cooperationPartner} value={form.cooperationPartner} rows={2}
                    maxLength={MAX_LENGTH.cooperationPartner} disabled={!editable}
                    onChange={(v) => set({ cooperationPartner: v })}
                    ariaLabel="txt_ProjectPlanning_DisplayProjectBodyRightContent_CooperationPartner" testId="txt_ProjectPlanning_DisplayProjectBodyRightContent_CooperationPartner"
                  />
                </div>
              ) : null}
              {showCooperationDetails(form.cooperation) ? (
                <div className={mergeClasses(s.field, s.fieldTaller)}>
                  <TextAreaField
                    label={FIELD_LABELS.cooperationDetails} value={form.cooperationDetails} rows={5}
                    maxLength={MAX_LENGTH.cooperationDetails}
                    disabled={!editable || !cooperationDetailsEditable(form.cooperation)}
                    onChange={(v) => set({ cooperationDetails: v })}
                    ariaLabel="txt_ProjectPlanning_DisplayProjectBodyRightContent_CooperationDetails" testId="txt_ProjectPlanning_DisplayProjectBodyRightContent_CooperationDetails"
                  />
                </div>
              ) : null}
            </div>

            {/* `con_…_PlanningBasisForm` */}
            <div className={s.form}>
              <div className={s.field}>
                <ChoiceField
                  label={GENERAL_TAB_LABELS.legalPlanningBasis} testId="drp_ProjectPlanning_DisplayProjectBodyRightContent_LegalPlanningBasis"
                  value={form.legalPlanningId} options={legalOptions}
                  disabled={busy || !canEditLegalPlanningBasis(gating, legalOptions.length)}
                  onChange={(v) => set({ legalPlanningId: v })}
                />
              </div>
              <div className={s.field}>
                <ChoiceField
                  label={GENERAL_TAB_LABELS.planningBasisCategory} testId="drp_ProjectPlanning_DisplayProjectBodyRightContent_PlanningBasisCategory"
                  value={form.planningBasisCategory} options={PLANNING_BASIS_CATEGORIES} disabled={!editable}
                  onChange={(v) => set({ planningBasisCategory: v === null ? null : Number(v) })}
                />
              </div>
              <div className={s.field}>
                <ChoiceField
                  label={GENERAL_TAB_LABELS.permitProcedure} testId="drp_ProjectPlanning_DisplayProjectBodyRightContent_PermitProcedure"
                  value={form.permitProcedureId} options={procedureOptions} disabled={!editable}
                  onChange={(v) => set({ permitProcedureId: v })}
                />
              </div>
              <div className={mergeClasses(s.field, s.fieldTall)}>
                <TextAreaField
                  label={GENERAL_TAB_LABELS.planningBasisDetails} value={form.planningBasisDetails} rows={2}
                  maxLength={MAX_LENGTH.planningBasisDetails} disabled={!editable}
                  onChange={(v) => set({ planningBasisDetails: v })}
                  ariaLabel="txt_ProjectPlanning_DisplayProjectBodyRightContent_PlanningBasisDetails" testId="txt_ProjectPlanning_DisplayProjectBodyRightContent_PlanningBasisDetails"
                />
              </div>
            </div>

            {/* `con_…_HeightLimitation`: the toggle row, then the field */}
            <div className={s.heightRow}>
              <div className={s.toggle}>
                <Switch
                  label={GENERAL_TAB_LABELS.heightLimitationWtg}
                  labelPosition="before"
                  checked={form.isHeightLimitation}
                  disabled={!editable}
                  onChange={(_, d) => setEdited(applyHeightToggle(form, d.checked, baseline))}
                  aria-label="tgl_HeightLimitation_ProjectPlanning"
                  data-testid="tgl_HeightLimitation_ProjectPlanning"
                />
              </div>
              {showHeightLimit(form.isHeightLimitation) ? (
                <div className={mergeClasses(s.field, s.heightField)}>
                  <TextField
                    label={FIELD_LABELS.heightLimitation} required value={form.heightLimitation}
                    error={validity.heightLimitation.message} disabled={!editable}
                    onChange={(v) => set({ heightLimitation: v })}
                    ariaLabel="txt_HeightLimit_ProjectPlanning" testId="txt_HeightLimit_ProjectPlanning"
                  />
                </div>
              ) : null}
            </div>

            <div className={s.permits} data-testid="con_ProjectPlanning_DisplayProjectBodyRightContent_Permits">
              <div className={s.permitsBar}>
                <CommandBar commands={permitCommands} onCommand={onPermitCommand} ariaLabel="pcf_ProjectPlanning_DisplayProjectBodyRightContent_PermitsCommandBar" />
              </div>
              <div className={s.gridWrap}>
                <Table size="small" className={s.permitTable} aria-label={PERMIT_GRID_COLUMNS.permit} data-testid="gal_ProjectPlanning_DisplayProjectBodyRightContent_Permits">
                  <TableHeader>
                    <TableRow className={s.permitHeader}>
                      <TableHeaderCell className={s.colSelect} />
                      <TableHeaderCell className={s.colPermit}>{PERMIT_GRID_COLUMNS.permit}</TableHeaderCell>
                      <TableHeaderCell className={s.colDate}>{PERMIT_GRID_COLUMNS.submitted}</TableHeaderCell>
                      <TableHeaderCell className={s.colDate}>{PERMIT_GRID_COLUMNS.approved}</TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {permitsQ.data.map((p) => {
                      const checked = p.id === selectedPermitId;
                      const toggle = () => setSelectedPermitId((cur) => togglePermitSelection(cur, p.id));
                      return (
                        <TableRow key={p.id} className={mergeClasses(s.permitRow, checked ? s.rowSelected : s.row)} aria-selected={checked} onClick={toggle}>
                          <TableCell className={s.selectCell}>
                            <Button
                              appearance="transparent"
                              role="radio"
                              aria-checked={checked}
                              aria-label="img_ProjectPlanning_DisplayProjectBodyRightContent_PermitsRowSelectionDot"
                              data-testid={`img_${C}_PermitsRowSelectionDot-${p.id}`}
                              className={s.radio}
                              icon={checked ? <RecordRegular /> : <CircleRegular />}
                              onClick={(e) => { e.stopPropagation(); toggle(); }}
                            />
                          </TableCell>
                          <TableCell>{p.name ?? ""}</TableCell>
                          <TableCell className={permitDateIsActual(p.submissionDateType) ? s.actualDate : undefined}>{permitDateCell(p.submissionDate)}</TableCell>
                          <TableCell className={permitDateIsActual(p.approvalDateType) ? s.actualDate : undefined}>{permitDateCell(p.approvalDate)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        ) : null}

        {tab === "repowering" ? (
          <div className={s.wrapRow}>
            {/* `con_…_RepoweringForm` */}
            <div className={s.form}>
              <div className={s.field}>
                <ChoiceField
                  label={REPOWERING_TAB_LABELS.repowering} testId="drp_ProjectPlanning_DisplayProjectBodyRightContent_Repowering"
                  value={form.repowering} options={YES_NO_UNKNOWN} disabled={!editable}
                  onChange={(v) => setEdited(applyRepoweringChange(form, v === null ? null : Number(v), baseline))}
                />
              </div>
              {showSecuredAccess(form.repowering) ? (
                <div className={s.field}>
                  <TextField
                    label={FIELD_LABELS.securedAccess} value={form.securedAccess}
                    maxLength={MAX_LENGTH.securedAccess} counter={false} disabled={!editable}
                    onChange={(v) => set({ securedAccess: v })}
                    ariaLabel="txt_ProjectPlanning_DisplayProjectBodyRightContent_SecuredAccess" testId="txt_ProjectPlanning_DisplayProjectBodyRightContent_SecuredAccess"
                  />
                </div>
              ) : null}
              {showRepoweringDetails(form.repowering) ? (
                <div className={mergeClasses(s.field, s.fieldTaller)}>
                  <TextAreaField
                    label={FIELD_LABELS.repoweringDetails} value={form.repoweringDetails} rows={5}
                    maxLength={MAX_LENGTH.repoweringDetails} disabled={!editable}
                    onChange={(v) => set({ repoweringDetails: v })}
                    ariaLabel="txt_ProjectPlanning_DisplayProjectBodyRightContent_RepoweringDetails" testId="txt_ProjectPlanning_DisplayProjectBodyRightContent_RepoweringDetails"
                  />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {tab === "aquisition" ? (
          <div className={s.aquisition}>
            {aquisitionTable("personam")}
            {aquisitionTable("rem")}
          </div>
        ) : null}
      </div>

      <div className={s.buttons}>
        <Tooltip content={SCREEN_MSG.saveTooltip} relationship="description" withArrow>
          <Button
            appearance="primary"
            disabled={!saveEnabled}
            onClick={() => void onSave()}
            aria-label="pcf_ProjectPlanning_DisplayProjectBodyRightContent_ButtonsSave"
            data-testid="pcf_ProjectPlanning_DisplayProjectBodyRightContent_ButtonsSave"
          >
            {SCREEN_MSG.save}
          </Button>
        </Tooltip>
        <Tooltip content={SCREEN_MSG.cancelTooltip} relationship="description" withArrow>
          <Button
            disabled={busy || !canReset(form, baseline)}
            onClick={onReset}
            aria-label="pcf_ProjectPlanning_DisplayProjectBodyRightContent_ButtonsReset"
            data-testid="pcf_ProjectPlanning_DisplayProjectBodyRightContent_ButtonsReset"
          >
            {SCREEN_MSG.cancel}
          </Button>
        </Tooltip>
      </div>

      <FormPanel
        open={permitPanel !== null}
        title={permitPanelTitle(permitPanel?.permitId === null)}
        width="narrow"
        onDismiss={closePermitPanel}
        closeTestId="pcf_com_ProjectPlanning_RightPanel_NewEditPermitBodyHeader_CommandBar"
        closeLabel="pcf_com_ProjectPlanning_RightPanel_NewEditPermitBodyHeader_CommandBar"
        footer={
          <PanelButtons
            onSave={() => void onSavePermit()}
            onCancel={closePermitPanel}
            saveTestId="pcf_ProjectPlanning_RightPanel_NewEditPermitBodyButtons_Save"
            cancelTestId="pcf_ProjectPlanning_RightPanel_NewEditPermitBodyButtons_Cancel"
            saveLabel="pcf_ProjectPlanning_RightPanel_NewEditPermitBodyButtons_Save"
            cancelLabel="pcf_ProjectPlanning_RightPanel_NewEditPermitBodyButtons_Cancel"
            saveTooltip={PERMIT_DIALOG.saveTooltip}
            disabled={busy || !permitPanel || !canSavePermit(permitPanel.draft)}
          />
        }
      >
        {permitPanel ? (
          <div className={s.panelBody}>
            <CostField
              label={PERMIT_PANEL_LABELS.name} required value={permitPanel.draft.name} disabled={busy}
              name="txt_ProjectPlanning_RightPanel_NewEditPermitBodyContent_Name"
              onChange={(v) => setPermitDraft({ name: v })}
            />
            {/* Canvas order: the caption, the Plan / Actual radios (horizontal), then the date (PO, 20 Oct 2026). */}
            <Choices
              label={PERMIT_PANEL_LABELS.submissionDate} required horizontal disabled={busy}
              name="rad_ProjectPlanning_RightPanel_NewEditPermitBodyContent_SubmissionDateType"
              value={PERMIT_DATE_TYPES.find((t) => t.value === permitPanel.draft.submissionDateType)?.label ?? ""}
              options={PERMIT_DATE_TYPES.map((t) => t.label)}
              onChange={(v) => setPermitDraft({ submissionDateType: PERMIT_DATE_TYPES.find((t) => t.label === v)?.value ?? null })}
            />
            <TaggedDateField
              label="" required disabled={busy}
              name="dte_ProjectPlanning_RightPanel_NewEditPermitBodyContent_SubmissionDate"
              value={permitDateValue(permitPanel.draft.submissionDate)}
              formatDate={permitInputDate}
              tag={permitDateTag(permitPanel.draft.submissionDateType)}
              tagTestId="planning-permit-submission-date-tag"
              onChange={(d) => setPermitDraft({ submissionDate: d ? dateOnly(d) : null })}
            />
            <Choices
              label={PERMIT_PANEL_LABELS.approvalDate} required horizontal disabled={busy}
              name="rad_ProjectPlanning_RightPanel_NewEditPermitBodyContent_ApprovalDateType"
              value={PERMIT_DATE_TYPES.find((t) => t.value === permitPanel.draft.approvalDateType)?.label ?? ""}
              options={PERMIT_DATE_TYPES.map((t) => t.label)}
              onChange={(v) => setPermitDraft({ approvalDateType: PERMIT_DATE_TYPES.find((t) => t.label === v)?.value ?? null })}
            />
            <TaggedDateField
              label="" required disabled={busy}
              name="dte_ProjectPlanning_RightPanel_NewEditPermitBodyContent_ApprovalDate"
              value={permitDateValue(permitPanel.draft.approvalDate)}
              formatDate={permitInputDate}
              tag={permitDateTag(permitPanel.draft.approvalDateType)}
              tagTestId="planning-permit-approval-date-tag"
              onChange={(d) => setPermitDraft({ approvalDate: d ? dateOnly(d) : null })}
            />
          </div>
        ) : null}
      </FormPanel>

      <FormPanel
        open={aquisition !== null}
        title={aquisitionPanelTitle(aquisition ? LLA_TYPE_LABEL[aquisition.lla] : "")}
        width="narrow"
        onDismiss={() => setAquisition(null)}
        closeTestId="pcf_ProjectPlanning_RightPanel_AquisitionStatus_FormHeader_CommandBar"
        closeLabel="pcf_ProjectPlanning_RightPanel_AquisitionStatus_FormHeader_CommandBar"
        footer={
          <>
            <Tooltip content={AQUISITION_PANEL.clearAndSaveTooltip} relationship="description" withArrow>
              <Button disabled={busy} onClick={() => void onClearAquisition()}
                aria-label="pcf_btn_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Buttons_Cancel_1"
                data-testid="pcf_btn_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Buttons_Cancel_1">
                {AQUISITION_PANEL.clearAndSave}
              </Button>
            </Tooltip>
            {aquisition?.lla === "rem" ? (
              <Button
                appearance="primary"
                disabled={busy || !canSaveAquisition(aquisition.draft)}
                onClick={() => void onSaveAquisition()}
                aria-label="pcf_btn_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Buttons_Save_InRem"
                data-testid="pcf_btn_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Buttons_Save_InRem"
              >
                {AQUISITION_PANEL.save}
              </Button>
            ) : (
              <Button
                appearance="primary"
                disabled={busy || !aquisition || !canSaveAquisition(aquisition.draft)}
                onClick={() => void onSaveAquisition()}
                aria-label="pcf_btn_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Buttons_Save_UnderLaw"
                data-testid="pcf_btn_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Buttons_Save_UnderLaw"
              >
                {AQUISITION_PANEL.save}
              </Button>
            )}
            <Button onClick={() => setAquisition(null)}
              aria-label="pcf_btn_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Buttons_Cancel"
              data-testid="pcf_btn_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Buttons_Cancel">
              {AQUISITION_PANEL.cancel}
            </Button>
          </>
        }
      >
        {aquisition ? (
          <div className={s.panelBody}>
            <ReadOnlyField
              label={AQUISITION_PANEL.llaType} value={aquisition.row.typeName ?? ""}
              ariaLabel="drp_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Body_AquisitionStatusType"
              testId="drp_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Body_AquisitionStatusType"
            />
            <CostField
              label={AQUISITION_PANEL.secured} value={aquisition.draft.secured} disabled={busy}
              maxLength={AQUISITION_MAX_LENGTH}
              name="txt_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Body_Secured"
              error={aqValidity?.secured.message}
              onChange={(v) => setAquisition({ ...aquisition, draft: { ...aquisition.draft, secured: v } })}
            />
            <CostField
              label={AQUISITION_PANEL.required} value={aquisition.draft.required} disabled={busy}
              maxLength={AQUISITION_MAX_LENGTH}
              name="txt_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Body_Requered"
              error={aqValidity?.required.message}
              onChange={(v) => setAquisition({ ...aquisition, draft: { ...aquisition.draft, required: v } })}
            />
            <ReadOnlyField
              label={AQUISITION_PANEL.percentage} value={String(aqPercent)}
              ariaLabel="txt_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Body_Percentage"
              testId="txt_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Body_Percentage"
            />
          </div>
        ) : null}
      </FormPanel>

      <ConfirmDialog
        open={confirmDelete}
        title={PERMIT_DIALOG.deleteTitle}
        description={deletePermitDescription(selectedPermit?.name ?? null)}
        confirmText={PERMIT_DIALOG.deleteConfirm}
        cancelText={PERMIT_DIALOG.cancel}
        confirmIcon="delete"
        destructive
        onConfirm={() => void onDeletePermit()}
        onCancel={() => setConfirmDelete(false)}
      />
      {/* `cmp_PopUp_Leave_…_Confirmation` — the shared leave guard (D35, PO X1). */}
      <UnsavedChangesGuard when={shouldConfirmLeave(form, baseline)} dialog={LEAVE_DIALOG} />
    </div>
  );
}
