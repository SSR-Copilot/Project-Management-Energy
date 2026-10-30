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
  Button, Dropdown, Field, MessageBar, MessageBarBody, Option, Tab, TabList, Text, Tooltip, makeStyles,
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
  LEAVE_DIALOG, SAVE_SUCCESS, saveGridOperatorJob, shouldPromptOnLeave, toForm, validateForm,
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
    display: "flex", alignItems: "center", gap: "8px", flex: "none",
    paddingLeft: "18px",
    backgroundColor: palette.neutralTertiary, color: palette.white,
  },
  // `con_Milestones_pagelock_section_6`: vertical, padding 8.
  // Canvas screenshot (27 Oct 2026): 14 px text on a 19 px line in a 131 px band, the text
  // starting 26 px after the icon's left edge.
  lockText: {
    display: "flex", flexDirection: "column", paddingTop: "6px", paddingBottom: "11px", paddingLeft: "1px", paddingRight: "8px",
    "& span.fui-Text": { color: palette.white, fontSize: "14px", lineHeight: "19px" },
  },
  // `con_GridOperator_DisplayProjectBodyRightContent_Tab`: 50 high, items centred; the TabList is
  // `Parent.Width/2` wide.
  /** `pcf_…_ButtonsReset` enabled: an outlined 90 x 30 button, `themePrimary` frame, text and icon. */
  cancelEnabled: {
    width: "90px", minWidth: "90px", height: "30px",
    color: palette.themePrimary, backgroundColor: palette.white,
    borderTopColor: palette.themePrimary, borderRightColor: palette.themePrimary,
    borderBottomColor: palette.themePrimary, borderLeftColor: palette.themePrimary,
    "& .fui-Button__icon": { color: palette.themePrimary },
    ":hover": { color: palette.themePrimary, backgroundColor: palette.themeLighter },
  },
  /** The save notice, pinned across the very top of the app above the project header. */
  flash: { position: "fixed", top: 0, left: 0, right: 0, zIndex: 2000, borderRadius: 0 },
  /** The Yes / No / Unknown list: flat grey, 30 px rows, no check gutter, nothing pre-highlighted. */
  choiceListbox: {
    maxHeight: "602px !important", paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0, rowGap: 0,
    backgroundColor: "#f5f5f5", boxShadow: "none", borderRadius: 0,
    borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
    borderTopStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid", borderLeftStyle: "solid",
    borderTopColor: "#605e5c", borderRightColor: "#605e5c", borderBottomColor: "#605e5c", borderLeftColor: "#605e5c",
    "& .fui-Option": {
      boxSizing: "border-box", height: "30px", minHeight: "30px", flexShrink: 0, columnGap: 0,
      paddingTop: 0, paddingBottom: 0, paddingLeft: "12px", fontSize: "14px", lineHeight: "20px",
      color: palette.black, borderRadius: 0,
    },
    "& .fui-Option__checkIcon": { display: "none" },
    "& .fui-Option::after": { display: "none" },
    "& .fui-Option:hover, & .fui-Option[data-activedescendant-focusvisible]": {
      backgroundColor: palette.themePrimary, color: palette.white,
    },
  },
  tabs: {
    display: "flex", alignItems: "center", height: "50px", flex: "none", paddingTop: "3px", paddingLeft: "4px",
    // The 1 px rule under the tab row, across the content.
    borderBottomWidth: "1px", borderBottomStyle: "solid", borderBottomColor: "#f3f2f1",
    "& > div": { width: "50%" },
    // A locked tab row keeps a mid-grey 3 px bar under the current tab (canvas, 27 Oct 2026).
    "& .fui-Tab[aria-selected=\"true\"]:disabled::after": { backgroundColor: "#a6a6a6" },
  },
  // `con_…_GridOperatorTab` / `…_GridConnectionTab`: vertical, PaddingTop 20, `Min(380, Parent.Width)`.
  fields: {
    display: "flex", flexDirection: "column", width: "100%", maxWidth: "380px", paddingTop: "20px",
    boxSizing: "border-box",
    /*
     * The canvas screenshot (27 Oct 2026) draws a DISABLED box white with a light 1 px frame and
     * grey text, not the shared skin's grey fill. Scoped here so other screens keep theirs.
     */
    "& .fui-Input:has(input:disabled), & .fui-Textarea:has(textarea:disabled), & .fui-Dropdown:has(button:disabled)": {
      backgroundColor: palette.white,
      borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
      borderTopStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid", borderLeftStyle: "solid",
      borderTopColor: "#e1dfdd", borderRightColor: "#e1dfdd", borderBottomColor: "#e1dfdd", borderLeftColor: "#e1dfdd",
      borderRadius: "2px",
    },
    "& input:disabled, & textarea:disabled, & .fui-Dropdown__button:disabled": { color: "#a19f9d" },
    // The canvas error label: plain 11 px red text 4 px in, no Fluent error glyph and no red box.
    "& .fui-Field__validationMessageIcon": { display: "none" },
    "& .fui-Field__validationMessage": {
      fontSize: "12px", lineHeight: "16px", color: palette.akzent5, fontWeight: 600, paddingLeft: "4px",
    },
    // An invalid box gets no red frame and no rest underline; focus keeps Fluent's blue bar
    // (canvas Grid Connection screenshot, 27 Oct 2026). A disabled box keeps its frame above.
    "& .fui-Field .fui-Input.fui-Input:not(:has(input:disabled)), & .fui-Field .fui-Input.fui-Input:not(:has(input:disabled)):hover": {
      borderTopColor: "transparent", borderRightColor: "transparent", borderLeftColor: "transparent",
      borderBottomColor: "transparent",
    },
    // The `{Len}/N` counter sits level with the bottom of the caption, just above the box.
    "& .fui-Field ~ .fui-Text": { top: "9px" },
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
  // On the canvas screenshot the pair are plain text buttons with an icon, in a strip under a
  // 1 px rule across the content.
  buttons: {
    display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "10px", flex: "none",
    height: "48px", paddingRight: "10px",
    borderTopWidth: "1px", borderTopStyle: "solid", borderTopColor: "#edebe9",
    "& button": { minWidth: "96px", height: "32px", fontWeight: 400 },
    // `pcf_…_ButtonsReset`: FontColor / IconColor `themePrimary` when enabled; disabled, grey text
    // with a black glyph. The disabled Save matches it.
    "& button:disabled": { color: "#605e5c", backgroundColor: "transparent" },
    "& button:disabled .fui-Button__icon": { color: palette.black },
  },
});

export default function GridOperatorScreen() {
  const s = useStyles();
  const skin = useFieldSkin();
  const controlClass = useFieldControlClass();
  // The user's language (`Language()` in the canvas): lengths and diameters follow its decimal separator (voltage stays dot-only).
  const { projectId, locale: lang } = useSession();
  const [params, setParams] = useSearchParams();
  const tab = parseTab(params.get("tab"));

  const projectQ = useGridOperatorProject(projectId);
  const recordQ = useGridOperator(projectId);
  const writes = useGridOperatorWrites(projectId);
  const project = projectQ.data;
  const record = recordQ.data;

  const baseline = useMemo(() => toForm(record, lang), [record, lang]);
  const [edited, setEdited] = useState<GridOperatorForm | null>(null);
  const [touched, setTouched] = useState<ReadonlySet<GridOperatorField>>(new Set());
  const [flash, setFlash] = useState<string | null>(null);
  const form = edited ?? baseline;

  const loading = projectQ.isLoading || recordQ.isLoading;
  const busy = writes.progress !== null;
  const gating = { project, canEdit: GRID_OPERATOR_CAN_EDIT };
  const validity = validateForm(form, touched, lang);
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
    const ids = await writes.run(saveGridOperatorJob(form, project, record, lang));
    if (ids !== null) {
      setEdited(null); setTouched(new Set());
      // The canvas `Notify`: a bar across the top of the app, gone after a second (PO, 27 Oct 2026).
      setFlash(writes.success ?? SAVE_SUCCESS);
      window.setTimeout(() => setFlash(null), 1000);
    }
  };
  const onCancel = () => { writes.clear(); setEdited(null); setTouched(new Set()); };
  const onChoice = (f: GridOperatorField) => (_: unknown, d: { optionValue?: string }) =>
    setField(f, d.optionValue ? Number(d.optionValue) : null);
  const choiceOptions = YES_NO_UNKNOWN.map((o) => <Option key={o.value} value={String(o.value)}>{o.label}</Option>);

  return (
    <div className={s.page} data-testid="Grid Operator Screen">
      {loading ? <LoadingOverlay mode="inline" /> : null}
      <WriteFeedback progress={writes.progress} error={writes.error} success={null} testIdPrefix="grid-operator" />
      {flash ? (
        <MessageBar intent="success" className={s.flash} data-testid="grid-operator-write-success">
          <MessageBarBody>{flash}</MessageBarBody>
        </MessageBar>
      ) : null}

      <div className={s.body}>
        {lock.length > 0 ? (
          <div className={s.lock} data-testid={PAGE_LOCK_TESTID}>
            <LockClosedRegular aria-hidden fontSize={24} data-testid={PAGE_LOCK_ICON_TESTID} />
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
                  listbox={{ className: s.choiceListbox }}
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
                  listbox={{ className: s.choiceListbox }}
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
            // Filled blue when it can save, plain grey text when it cannot (canvas, 27 Oct 2026).
            appearance={saveEnabled ? "primary" : "subtle"}
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
            appearance={cancelEnabled ? "outline" : "subtle"}
            className={cancelEnabled ? s.cancelEnabled : undefined}
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
      {/* `cmp_PopUp_Leave_GridOperator_Confirmation` — the shared leave guard (D35), canvas look. */}
      <UnsavedChangesGuard when={shouldPromptOnLeave(form, baseline)} dialog={LEAVE_DIALOG} canvasLook />
    </div>
  );
}
