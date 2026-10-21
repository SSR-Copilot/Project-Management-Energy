/**
 * Grid Operator Screen — composition only (connected 20 Oct 2026, D32).
 *
 * Canvas screen: `Grid Operator Screen.pa.yaml` (PM app). The layout follows its containers:
 *
 *   lock message   `con_Milestones_Page_LockMessage_6` — the title and one bullet per missing
 *                  prerequisite (`pageLock`)
 *   tab strip      `tab_GridOperator_DisplayProjectBodyRightContent_TabList` — Grid Operator /
 *                  Grid Connection (`TABS`), disabled while locked or Draft
 *   Grid Operator  Grid Operator (multiline, counter), Grid voltage level [kV], Grid expansion
 *                  required, Grid expansion details (multiline, counter)
 *   Grid Connection Substation construction required, Substation construction and operator
 *                  (multiline, counter), the four cabling lengths and diameters — no
 *                  `DisplayMode` in the canvas, so editable on a locked / Draft project (D32 R1)
 *   buttons        `pcf_…_ButtonsSave` (CheckMark) / `pcf_…_ButtonsReset` (Cancel)
 *
 * Each tab is one column, at most 380 px wide (`Width: Min(380, Parent.Width)`). The leave dialog
 * (`cmp_PopUp_Leave_GridOperator_Confirmation`) is the shared `UnsavedChangesGuard` (D35), with
 * its texts from `rules.ts`. The project header,
 * left navigation and report-problem panel are the app shell's. Every caption, gate and write
 * comes from `rules.ts`; every read and write from `./hooks`.
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Button, Dropdown, Field, Option, Tab, TabList, Text, Tooltip, makeStyles,
} from "@fluentui/react-components";
import { CheckmarkRegular, DismissRegular, LockClosedRegular } from "@fluentui/react-icons";
import {
  EmptyState, FIELD_APPEARANCE, LoadingOverlay, TextAreaField, TextField, UnsavedChangesGuard, WriteFeedback,
  useFieldControlClass, useFieldSkin,
} from "@/components";
import { useSession } from "@/app/SessionContext";
import { palette } from "@/theme/tokens";
import {
  CHAR_MAX_LENGTH, FIELD_LABEL, GRID_OPERATOR_SCREEN_TEXT, PAGE_LOCK_ICON_TESTID,
  PAGE_LOCK_TESTID, PAGE_LOCK_TITLE, PAGE_LOCK_TITLE_TESTID, SCREEN_MSG, TABS, YES_NO_UNKNOWN,
  canCancel, canEditField, canSave, canSwitchTabs, choiceLabel, pageLock, parseTab,
  LEAVE_DIALOG, saveGridOperatorJob, shouldPromptOnLeave, toForm, validateForm,
  type GridOperatorField, type GridOperatorForm,
} from "./rules";
import {
  GRID_OPERATOR_CAN_EDIT, useGridOperator, useGridOperatorProject, useGridOperatorWrites,
} from "./hooks";

// Layout transcribed from `con_GridOperator_DisplayProjectBodyRightContent` (UI layout pass,
// 20 Oct 2026). The shell's content area scrolls, so the page grows with its content and never
// clips itself to the viewport.
const useStyles = makeStyles({
  // The right content: a white vertical autolayout, no padding, no gap. `flex: 1 0 auto` fills the
  // shell so the button row sits at the bottom, as the canvas' fill-portion Grid container does.
  page: { display: "flex", flexDirection: "column", flex: "1 0 auto", minWidth: 0, backgroundColor: palette.white },
  // `con_GridOperator_DisplayProjectBodyRightContent_Grid` — the only region with a FillPortion.
  body: { display: "flex", flexDirection: "column", flex: "1 0 auto", minWidth: 0 },
  // `con_Milestones_Page_LockMessage_6`: Fill RGBA(89,89,89,1), horizontal, gap 10,
  // PaddingLeft 20, items centred; the white 20 px lock icon and white text.
  lock: {
    display: "flex", alignItems: "center", gap: "10px", flex: "none",
    paddingLeft: "20px",
    backgroundColor: palette.neutralTertiary, color: palette.white,
  },
  // `con_Milestones_pagelock_section_6`: vertical, padding 8.
  lockText: { display: "flex", flexDirection: "column", paddingTop: "8px", paddingBottom: "8px", paddingLeft: "8px", paddingRight: "8px", "& span": { color: palette.white } },
  // `con_GridOperator_DisplayProjectBodyRightContent_Tab`: 50 high, items centred; the TabList is
  // `Parent.Width/2` wide.
  tabs: { display: "flex", alignItems: "center", height: "50px", flex: "none", "& > div": { width: "50%" } },
  // `con_…_GridOperatorTab` / `…_GridConnectionTab`: vertical, PaddingTop 20, `Min(380, Parent.Width)`.
  fields: {
    display: "flex", flexDirection: "column", width: "100%", maxWidth: "380px", paddingTop: "20px",
    boxSizing: "border-box",
  },
  // Each field's ManualLayout container: label and input at X = 20, `Parent.Width - 40` wide;
  // 70 high for a single-line field (82 with its error), 102 for a multiline one. Labels are Semibold.
  field: {
    minHeight: "70px", paddingLeft: "20px", paddingRight: "20px", boxSizing: "border-box",
    "& .fui-Field__label, & label": { fontWeight: 600 },
  },
  fieldMulti: { minHeight: "102px" },
  // `con_GridOperator_DisplayProjectBodyRightContent_Buttons`: 50 high, gap 10, justified to the
  // end, PaddingRight 10; both buttons are 96 x 32.
  buttons: {
    display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "10px", flex: "none",
    height: "50px", paddingRight: "10px",
    "& button": { minWidth: "96px", height: "32px" },
  },
});

export default function GridOperatorScreen() {
  const s = useStyles();
  const skin = useFieldSkin();
  const controlClass = useFieldControlClass();
  const { projectId } = useSession();
  const [params, setParams] = useSearchParams();
  const tab = parseTab(params.get("tab"));

  const projectQ = useGridOperatorProject(projectId);
  const recordQ = useGridOperator(projectId);
  const writes = useGridOperatorWrites(projectId);
  const project = projectQ.data;
  const record = recordQ.data;

  const baseline = useMemo(() => toForm(record), [record]);
  const [edited, setEdited] = useState<GridOperatorForm | null>(null);
  const [touched, setTouched] = useState<ReadonlySet<GridOperatorField>>(new Set());
  const form = edited ?? baseline;

  const loading = projectQ.isLoading || recordQ.isLoading;
  const busy = writes.progress !== null;
  const gating = { project, canEdit: GRID_OPERATOR_CAN_EDIT };
  const validity = validateForm(form, touched);
  const lock = loading ? [] : pageLock(project);
  const saveEnabled = !loading && canSave({ project, canEdit: GRID_OPERATOR_CAN_EDIT, form, baseline, touched, busy });
  const cancelEnabled = !busy && canCancel(form, baseline);
  const editable = (f: GridOperatorField) => !loading && !busy && canEditField(gating, f);

  if (projectQ.error || recordQ.error) {
    return (
      <div className={s.page} data-testid="Grid Operator Screen">
        <EmptyState title={GRID_OPERATOR_SCREEN_TEXT.loadFailedTitle} description={GRID_OPERATOR_SCREEN_TEXT.loadFailedDescription} />
      </div>
    );
  }

  const setField = (f: GridOperatorField, v: string | number | null) => {
    setEdited({ ...form, [f]: v });
    setTouched((t) => new Set(t).add(f));
  };
  const text = (f: GridOperatorField) => form[f] as string;
  const choice = (f: GridOperatorField) => form[f] as number | null;
  const onSave = async () => {
    writes.clear();
    const ids = await writes.run(saveGridOperatorJob(form, project, record));
    if (ids !== null) { setEdited(null); setTouched(new Set()); }
  };
  const onCancel = () => { writes.clear(); setEdited(null); setTouched(new Set()); };
  const onChoice = (f: GridOperatorField) => (_: unknown, d: { optionValue?: string }) =>
    setField(f, d.optionValue ? Number(d.optionValue) : null);
  const choiceOptions = YES_NO_UNKNOWN.map((o) => <Option key={o.value} value={String(o.value)}>{o.label}</Option>);

  return (
    <div className={s.page} data-testid="Grid Operator Screen">
      {loading ? <LoadingOverlay mode="inline" /> : null}
      <WriteFeedback progress={writes.progress} error={writes.error} success={writes.success} testIdPrefix="grid-operator" />

      <div className={s.body}>
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
            aria-label="tab_GridOperator_DisplayProjectBodyRightContent_TabList"
            data-testid="tab_GridOperator_DisplayProjectBodyRightContent_TabList"
          >
            {TABS.map((t) => <Tab key={t.key} value={t.key} aria-label={t.label} data-testid={`tab_GridOperator_DisplayProjectBodyRightContent_TabList-${t.key}`}>{t.label}</Tab>)}
          </TabList>
        </div>

        {tab === "operator" ? (
          <div className={s.fields} data-testid="con_GridOperator_DisplayProjectBodyRightContent_GridOperatorTab">
            <div className={`${s.field} ${s.fieldMulti}`}>
              <TextAreaField
                label={FIELD_LABEL.operator} value={text("operator")} rows={2} maxLength={CHAR_MAX_LENGTH}
                disabled={!editable("operator")} onChange={(v) => setField("operator", v)}
                ariaLabel="txt_GridOperator_DisplayProjectBodyRightContent_GridOperator"
                testId="txt_GridOperator_DisplayProjectBodyRightContent_GridOperator"
              />
            </div>
            <div className={s.field}>
              <TextField
                label={FIELD_LABEL.voltageLevel} value={text("voltageLevel")} placeholder={SCREEN_MSG.numericPlaceholder}
                error={validity.voltageLevel.message}
                disabled={!editable("voltageLevel")} onChange={(v) => setField("voltageLevel", v)}
                ariaLabel="txt_GridOperator_DisplayProjectBodyRightContent_GridVoltage"
                testId="txt_GridOperator_DisplayProjectBodyRightContent_GridVoltage"
              />
            </div>
            <div className={s.field}>
              <Field className={skin.field} label={FIELD_LABEL.expansionRequired}>
                <Dropdown
                  appearance={FIELD_APPEARANCE}
                  className={controlClass(editable("expansionRequired") ? "edit" : "disabled")}
                  value={choiceLabel(choice("expansionRequired"))}
                  selectedOptions={choice("expansionRequired") === null ? [] : [String(choice("expansionRequired"))]}
                  disabled={!editable("expansionRequired")}
                  onOptionSelect={onChoice("expansionRequired")}
                  aria-label="drp_GridOperator_DisplayProjectBodyRightContent_GridExpansionRequired"
                  data-testid="drp_GridOperator_DisplayProjectBodyRightContent_GridExpansionRequired"
                >
                  {choiceOptions}
                </Dropdown>
              </Field>
            </div>
            <div className={`${s.field} ${s.fieldMulti}`}>
              <TextAreaField
                label={FIELD_LABEL.expansionDetails} value={text("expansionDetails")} rows={2} maxLength={CHAR_MAX_LENGTH}
                disabled={!editable("expansionDetails")} onChange={(v) => setField("expansionDetails", v)}
                ariaLabel="txt_GridOperator_DisplayProjectBodyRightContent_GridExpansionDetails"
                testId="txt_GridOperator_DisplayProjectBodyRightContent_GridExpansionDetails"
              />
            </div>
          </div>
        ) : (
          <div className={s.fields} data-testid="con_GridOperator_DisplayProjectBodyRightContent_GridConnectionTab">
            <div className={s.field}>
              <Field className={skin.field} label={FIELD_LABEL.substationConstructionRequired}>
                <Dropdown
                  appearance={FIELD_APPEARANCE}
                  className={controlClass(editable("substationConstructionRequired") ? "edit" : "disabled")}
                  value={choiceLabel(choice("substationConstructionRequired"))}
                  selectedOptions={choice("substationConstructionRequired") === null ? [] : [String(choice("substationConstructionRequired"))]}
                  disabled={!editable("substationConstructionRequired")}
                  onOptionSelect={onChoice("substationConstructionRequired")}
                  aria-label="drp_GridOperator_DisplayProjectBodyRightContent_SubstationConstruction"
                  data-testid="drp_GridOperator_DisplayProjectBodyRightContent_SubstationConstruction"
                >
                  {choiceOptions}
                </Dropdown>
              </Field>
            </div>
            <div className={`${s.field} ${s.fieldMulti}`}>
              <TextAreaField
                label={FIELD_LABEL.substationOperator} value={text("substationOperator")} rows={2} maxLength={CHAR_MAX_LENGTH}
                disabled={!editable("substationOperator")} onChange={(v) => setField("substationOperator", v)}
                ariaLabel="txt_GridOperator_DisplayProjectBodyRightContent_SubstationOperator"
                testId="txt_GridOperator_DisplayProjectBodyRightContent_SubstationOperator"
              />
            </div>
            <div className={s.field}>
              <TextField
                label={FIELD_LABEL.lengthInternal} value={text("lengthInternal")} placeholder={SCREEN_MSG.numericPlaceholder}
                error={validity.lengthInternal.message}
                disabled={!editable("lengthInternal")} onChange={(v) => setField("lengthInternal", v)}
                ariaLabel="txt_GridOperator_DisplayProjectBodyRightContent_LengthInternalCabeling"
                testId="txt_GridOperator_DisplayProjectBodyRightContent_LengthInternalCabeling"
              />
            </div>
            <div className={s.field}>
              <TextField
                label={FIELD_LABEL.diameterInternal} value={text("diameterInternal")} placeholder={SCREEN_MSG.numericPlaceholder}
                error={validity.diameterInternal.message}
                disabled={!editable("diameterInternal")} onChange={(v) => setField("diameterInternal", v)}
                ariaLabel="txt_GridOperator_DisplayProjectBodyRightContent_DiameterInternalCabeling"
                testId="txt_GridOperator_DisplayProjectBodyRightContent_DiameterInternalCabeling"
              />
            </div>
            <div className={s.field}>
              <TextField
                label={FIELD_LABEL.lengthExternal} value={text("lengthExternal")} placeholder={SCREEN_MSG.numericPlaceholder}
                error={validity.lengthExternal.message}
                disabled={!editable("lengthExternal")} onChange={(v) => setField("lengthExternal", v)}
                ariaLabel="txt_GridOperator_DisplayProjectBodyRightContent_LengthExternalCabeling"
                testId="txt_GridOperator_DisplayProjectBodyRightContent_LengthExternalCabeling"
              />
            </div>
            <div className={s.field}>
              <TextField
                label={FIELD_LABEL.diameterExternal} value={text("diameterExternal")} placeholder={SCREEN_MSG.numericPlaceholder}
                error={validity.diameterExternal.message}
                disabled={!editable("diameterExternal")} onChange={(v) => setField("diameterExternal", v)}
                ariaLabel="txt_GridOperator_DisplayProjectBodyRightContent_DiameterExternalCabeling"
                testId="txt_GridOperator_DisplayProjectBodyRightContent_DiameterExternalCabeling"
              />
            </div>
          </div>
        )}
      </div>

      <div className={s.buttons}>
        <Tooltip content={SCREEN_MSG.saveTooltip} relationship="description" withArrow>
          <Button
            appearance="primary"
            icon={<CheckmarkRegular />}
            disabled={!saveEnabled}
            onClick={() => void onSave()}
            aria-label="pcf_GridOperator_DisplayProjectBodyRightContent_ButtonsSave"
            data-testid="pcf_GridOperator_DisplayProjectBodyRightContent_ButtonsSave"
          >
            {SCREEN_MSG.save}
          </Button>
        </Tooltip>
        <Tooltip content={SCREEN_MSG.cancelTooltip} relationship="description" withArrow>
          <Button
            appearance="outline"
            icon={<DismissRegular />}
            disabled={!cancelEnabled}
            onClick={onCancel}
            aria-label="pcf_GridOperator_DisplayProjectBodyRightContent_ButtonsReset"
            data-testid="pcf_GridOperator_DisplayProjectBodyRightContent_ButtonsReset"
          >
            {SCREEN_MSG.cancel}
          </Button>
        </Tooltip>
      </div>
      {/* `cmp_PopUp_Leave_…_Confirmation` — the shared leave guard (D35, PO X1). */}
      <UnsavedChangesGuard when={shouldPromptOnLeave(form, baseline)} dialog={LEAVE_DIALOG} />
    </div>
  );
}
