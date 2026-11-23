/**
 * The Approvers right panel — canvas `con_Admin_ProjectGates_Approvals_Form` — for both a gate
 * template (`locEditigApprovalType = "Cluster"`) and a checklist-task template (`"Checklist"`).
 * Each control carries its canvas control name as `data-testid` (CONVENTIONS rule 16).
 *
 * The form state lives HERE and is seeded from `initialForm` when the panel mounts; the screen
 * remounts it (React `key`) for every open, so nothing leaks between editors (the canvas does
 * this with the hidden `but_…_Form_Buttons_Reset`). Opening and cancelling never write.
 * DIVERGENCE: a failed save leaves the panel open with the user's input intact; the canvas
 * closes it whatever the outcome (doc 09 §2; D36 §4, awaiting a product decision).
 *
 * Shared `FormPanel` modes: `busy` blocks Esc / backdrop / ✕ while a save runs; `dirty`
 * asks "Discard changes?" before Esc / backdrop / ✕ / Cancel drops edited input (the shared panel
 * discard guard, 13-CODE-APP-IMPROVEMENTS Part 1). The canvas closes on ✕ / Cancel without asking.
 *
 * Layout (`con_Admin_ProjectGates_Approvals_Form_Fields`, PGAS:2582-3627; canvas parity pass,
 * 20 Nov 2026): a vertical AutoLayout with NO gap and `PaddingTop: =20` (the panel body's own 20 px),
 * each field its own fixed-height container — Gate 80, Check List 80, Gate active toggle + 20,
 * Approval Mode 145, Portfolio Manager 104, the other pickers caption + box + 40, Reset Gate 80
 * (full panel width, `Fill: =RGBA(180, 214, 250, 0.35)`). Every caption is a `Text@0.0.51` with
 * `Weight: Semibold` (the panel CSS draws Fluent captions regular, so this panel sets it back); the
 * required `*` is the canvas `lbl_…_Requered` label before the caption (`useFieldSkin` +
 * `useCanvasRequiredMark`). Field order, captions and asterisks follow the canvas `Visible` rules.
 *
 * `canEdit` (admin access): without it the panel is read-only. Save, the Check List dropdown, the
 * Gate active switch, Approval Mode, every people picker and Reset Gate are disabled.
 */
import { useMemo, useState } from "react";
import {
  Button, Dropdown, Field, makeStyles, mergeClasses, Option, Radio, RadioGroup, Switch, Text, tokens,
} from "@fluentui/react-components";
import {
  ChoiceField, FIELD_APPEARANCE, FormPanel, HINTS, PanelMessages, useCanvasRequiredMark, useFieldControlClass,
  useFieldSkin, type PanelNotice,
} from "@/components";
import { isDirty } from "@/domain/form";
import { palette } from "@/theme/tokens";
import type { DefaultChecklist } from "@/data/adminGatesApprovals";
import { PeoplePickerField } from "./PeoplePickerField";
import {
  canSave, droppedRoles, fieldRules, gateFieldText, isDraftGate, LABELS, MAX_PEOPLE, modeOptions, panelTitle,
  RESET_GATE_DESCRIPTION, ROLE_LABEL, ROLE_PLACEHOLDER, ROLE_TOOLTIP, validateForm, type ApprovalForm,
  type ApprovalMode, type EditorTarget, type PeopleRole,
} from "./rules";

/** `gblAppSizes.Font.ExtraExtraSmall` = 8 pt, rendered at 96/72 px per point. */
const EXTRA_EXTRA_SMALL = "10.6667px";

const useStyles = makeStyles({
  /*
   * `con_…_Form_Fields`: no `LayoutGap`, `PaddingTop: =gblAppSizes.RightPanel.Top` (20) and
   * `PaddingBottom: =20` — the panel body's own 20 px padding, so none is added here.
   */
  body: {
    display: "flex", flexDirection: "column", rowGap: 0,
    // Captions: `Text@0.0.51`, `Weight: ='TextCanvas.Weight'.Semibold` (canvas.css draws panel captions 400).
    "& .fui-Field .fui-Field__label": { fontWeight: tokens.fontWeightSemibold },
  },
  /** One canvas field container; its fixed `Height` is the block's minimum. */
  block: { display: "flex", flexDirection: "column", boxSizing: "border-box", minWidth: 0 },
  /** Fluent's `Dropdown` ships a 250-px `minWidth`; the canvas box is the panel's width less 2 × 20. */
  dropdown: { minWidth: "0px", width: "100%" },
  /**
   * Gate / Check List (`con_…_State`, `con_…_State_1`: `Height: =80`): the 22-high caption, the box
   * 5 below it (`Y: =lbl.Y + lbl.Height + 5`), the 8-pt error label at `Y: =64`.
   */
  dropdownBlock: {
    minHeight: "80px",
    "& .fui-Field__label": { lineHeight: "22px", paddingBottom: "5px" },
    "& .fui-Field .fui-Field__validationMessage": { fontSize: EXTRA_EXTRA_SMALL, lineHeight: "16px" },
    /*
     * A `DisplayMode.Disabled` modern dropdown is white with a light-grey outline (the shared
     * `ChoiceField` look); the panel CSS (`.canvas-panel .fui-Dropdown`) would repaint it grey and
     * borderless, so it is restated here at a higher specificity.
     */
    "& .fui-Dropdown:has(.fui-Dropdown__button:disabled)": {
      backgroundColor: tokens.colorNeutralBackground1,
      borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
      borderTopStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid", borderLeftStyle: "solid",
      borderTopColor: tokens.colorNeutralStrokeDisabled, borderRightColor: tokens.colorNeutralStrokeDisabled,
      borderBottomColor: tokens.colorNeutralStrokeDisabled, borderLeftColor: tokens.colorNeutralStrokeDisabled,
    },
  },
  /** `con_…_Fields_Active.Height: =tog.Height + 20`. */
  toggleBlock: { minHeight: "52px", alignItems: "flex-start" },
  /** `con_…_Fields_ApprovalMode.Height: =145`; the radios at `Y: =25` under the 22-high caption. */
  modeBlock: { minHeight: "145px" },
  /**
   * The pickers: the 20-high caption, the PCF at `Y: =34`. Portfolio Manager's container is a fixed
   * 104; the others are caption + `AutoHeight` + error + 40, i.e. about 26 px below the box.
   */
  pickerBlock: {
    paddingBottom: "26px",
    "& .fui-Field__label": { lineHeight: "20px", paddingBottom: "14px" },
  },
  pmBlock: { minHeight: "104px", paddingBottom: 0 },
  /**
   * `lbl_…_Fields_Main_ErrorMessage` (PGAS:2604-2626): a plain red label, not a message bar —
   * `Color: =gblAppColors.Error` (akzent5), `Size: =9` (12 px), 31 high, text at the bottom,
   * `PaddingLeft: =28` from the panel edge (the body already insets 20).
   */
  mainError: {
    display: "flex", alignItems: "flex-end", minHeight: "31px", paddingLeft: "8px",
    color: palette.akzent5, fontSize: "12px", lineHeight: "16px",
  },
  /**
   * `con_…_Fields_ResetGateApproval` (PGAS:3555-3627): the full panel width (`Width: =Parent.Width`,
   * so out over the body's 20 px padding), 80 high, the button at `X: =20`, the description 5 px to
   * its right.
   */
  resetBand: {
    display: "flex", alignItems: "center", columnGap: "5px", boxSizing: "border-box",
    minHeight: "80px", marginLeft: "-20px", marginRight: "-20px",
    paddingLeft: "20px", paddingRight: "20px",
    backgroundColor: "rgba(180,214,250,0.35)",
  },
  /**
   * `lbl_…_ResetGateApproval_Description`: `Color: =gblAppColors.Label.Color` (black),
   * `Size: =gblAppSizes.Font.ExtraExtraSmall` (8 pt), `Width: =Parent.Width - button.Width - 120`.
   */
  resetText: { fontSize: EXTRA_EXTRA_SMALL, color: palette.black, maxWidth: "234px" },
});

export interface ApprovalsPanelProps {
  target: EditorTarget;
  initialForm: ApprovalForm;
  /** `vsb_technology` choice code of the selected context. */
  technology: number;
  /** Gate editor: another saved template exists for this gate (uniqueness check). */
  conflict: boolean;
  /** Admin access: false makes the whole panel read-only. */
  canEdit: boolean;
  saving: boolean;
  /** A failed save / reset, shown inside the panel. */
  error?: string | null;
  onSave: (form: ApprovalForm) => void;
  onReset: () => void;
  onCancel: () => void;
}

/** The value of the Gate dropdown's one item (its text is the gate label). */
const GATE_ITEM = "gate";

export function ApprovalsPanel({
  target, initialForm, technology, conflict, canEdit, saving, error, onSave, onReset, onCancel,
}: ApprovalsPanelProps) {
  const styles = useStyles();
  const requiredMark = useCanvasRequiredMark();
  const skin = useFieldSkin();
  const controlClass = useFieldControlClass();
  const [form, setForm] = useState<ApprovalForm>(initialForm);
  const rules = fieldRules(form.mode);
  const blankLabelAllowed = target.kind === "gate" && Boolean(target.blankLabelAllowed);
  const errors = useMemo(
    () => validateForm(form, { kind: target.kind, gateLabel: target.label, conflict, blankLabelAllowed, initial: initialForm }),
    [form, target.kind, target.label, conflict, blankLabelAllowed, initialForm],
  );
  const isGate = target.kind === "gate";
  const draftLocked = isGate && isDraftGate(target.row);
  const gateText = gateFieldText(target);
  /* SOURCE DEFECT fix kept (D153): the canvas clears these roles on Save without a word (see `droppedRoles`). */
  const dropped = droppedRoles(initialForm, form);
  const modeNotices: PanelNotice[] = dropped.length > 0
    ? [{ intent: "warning", text: `Saving in this mode clears the saved ${dropped.map((r) => ROLE_LABEL[r]).join(", ")}.` }]
    : [];

  const setPeople = (role: PeopleRole) => (people: ApprovalForm[PeopleRole]) =>
    setForm((f) => ({ ...f, [role]: people }));

  const checklistOptions: readonly DefaultChecklist[] = target.kind === "task"
    ? target.mode === "create" ? target.candidates : target.task ? [target.task.checklist] : []
    : [];
  const selectedChecklist = checklistOptions.find((c) => c.id === form.checklistId);

  /** One people picker, in the canvas order PM → Contributors → Approvers → Notifications. */
  const picker = (role: PeopleRole, testId: string, className?: string) => (
    <div className={mergeClasses(styles.block, styles.pickerBlock, className)}>
      <PeoplePickerField
        label={ROLE_LABEL[role]} people={form[role]} max={MAX_PEOPLE[role]}
        required={rules[role].required} {...(errors[role] ? { error: errors[role] } : {})}
        disabled={!canEdit || saving} placeholder={ROLE_PLACEHOLDER[role]} tooltip={ROLE_TOOLTIP[role]}
        testId={testId}
        onChange={setPeople(role)}
      />
    </div>
  );

  return (
    <FormPanel
      open title={panelTitle(target)} width="narrow"
      onDismiss={onCancel} busy={saving} dirty={isDirty(form, initialForm)}
      // ✕ = the `closeKey` item of `pcf_com_Admin_ProjectGates_Approvals_Form_CommandBar`.
      closeTestId="pcf_com_Admin_ProjectGates_Approvals_Form_CommandBar"
      // `ItemIconColor: gblAppTheme.palette.themeTertiary` (PGAS:2546): the ✕ is light blue, not white.
      closeIconColor={palette.themeTertiary}
      actions={{
        onSave: () => onSave(form), canSave: canEdit && canSave(errors), saving,
        // SOURCE DEFECT: the canvas Save hint is "Filter projects details list view."; it says "Save".
        saveTooltip: HINTS.save,
        saveTestId: "pcf_but_Admin_ProjectGates_Approvals_Form_Buttons_Save",
        cancelTestId: "pcf_but_Admin_ProjectGates_Approvals_Form_Buttons_Cancel",
      }}
    >
      <div className={mergeClasses(styles.body, requiredMark.root)}>
        {/* "Not saved" is NEW (no canvas equivalent). */}
        <PanelMessages error={error ?? null} errorTitle="Not saved" />

        {/* `lbl_…_Fields_Main_ErrorMessage` — first in the form, as in the canvas. */}
        {errors.main ? (
          <Text className={styles.mainError} data-testid="lbl_Admin_ProjectGates_Approvals_Form_Fields_Main_ErrorMessage">
            {errors.main}
          </Text>
        ) : null}

        {/*
          * `drp_…_State` — a `DropDown@0.0.45`, hard-coded `DisplayMode.Disabled` (PGAS:2678-2680), its one
          * item the gate label; no asterisk (`lbl_…_State_Requered.Visible: =false`). The canvas
          * `AccessibleLabel` is "Project Status".
          */}
        <div className={mergeClasses(styles.block, styles.dropdownBlock)}>
          <ChoiceField
            label={LABELS.gate} ariaLabel="Project Status"
            testId="drp_Admin_ProjectGates_Approvals_Form_Fields_State"
            disabled
            value={gateText ? GATE_ITEM : ""}
            options={gateText ? [{ value: GATE_ITEM, label: gateText }] : []}
            error={errors.gate ?? null}
          />
        </div>

        {/*
          * Task editor only (`con_…_State_1.Visible`): `drp_…_State_1`, a `ComboBox@0.0.51` with the red
          * `*`, `DisplayMode` Edit when adding and Disabled when editing (PGAS:2878-2883), no placeholder.
          */}
        {target.kind === "task" ? (
          <div className={mergeClasses(styles.block, styles.dropdownBlock)}>
            {/* A screen-local `Field` + `Dropdown` in the shared modern field skin (`fieldSkin.ts`, rule 17). */}
            <Field
              className={skin.field} label={LABELS.checkList} required
              validationState={errors.checklist ? "error" : "none"} validationMessage={errors.checklist}
            >
              <Dropdown
                appearance={FIELD_APPEARANCE}
                className={mergeClasses(styles.dropdown, controlClass("edit"))}
                aria-label={LABELS.checkList}
                data-testid="drp_Admin_ProjectGates_Approvals_Form_Fields_State_1"
                disabled={!canEdit || target.mode === "edit" || saving}
                value={selectedChecklist?.name ?? ""}
                selectedOptions={form.checklistId ? [form.checklistId] : []}
                onOptionSelect={(_, d) => setForm((f) => ({ ...f, checklistId: d.optionValue ?? null }))}
              >
                {checklistOptions.map((c) => (
                  <Option key={c.id} value={c.id}>{c.name}</Option>
                ))}
              </Dropdown>
            </Field>
          </div>
        ) : null}

        {/*
          * `tog_…_Fields_Active` (`Toggle@1.1.5`, `Label: ="Gate active"`); `DisplayMode` is View for the Draft
          * gate in the gate editor (PGAS:2961-2967).
          * SOURCE DEFECT fix kept (D153): the canvas then shows the stored 'Gate active', which can read OFF while
          * Save writes `true` for Draft; this app shows it ON (what Save writes). The explanatory hint under it
          * ("The Draft gate is always active.") was removed at the user's request (23 Nov 2026).
          */}
        <div className={mergeClasses(styles.block, styles.toggleBlock)}>
          <Switch
            label={LABELS.gateActive}
            checked={draftLocked ? true : form.gateActive}
            disabled={!canEdit || draftLocked || saving}
            onChange={(_, d) => setForm((f) => ({ ...f, gateActive: d.checked }))}
            aria-label={LABELS.gateActive}
            data-testid="tog_Admin_ProjectGates_Approvals_Form_Fields_Active"
          />
        </div>

        {/* `rad_…_ApprovalMode`; its required asterisk is `Visible: =false` in the canvas, so none here. */}
        <div className={mergeClasses(styles.block, styles.modeBlock)}>
          <Field label={LABELS.approvalMode}>
            <RadioGroup
              value={String(form.mode)}
              disabled={!canEdit || saving}
              aria-label={LABELS.approvalMode}
              data-testid="rad_Admin_ProjectGates_Approvals_Form_Fields_ApprovalMode"
              onChange={(_, d) => setForm((f) => ({ ...f, mode: Number(d.value) as ApprovalMode }))}
            >
              {modeOptions(technology).map((o) => (
                <Radio
                  key={o.value} value={String(o.value)} label={o.label} aria-label={o.label}
                  data-testid={`rad_Admin_ProjectGates_Approvals_Form_Fields_ApprovalMode-${o.value}`}
                />
              ))}
            </RadioGroup>
          </Field>
        </div>

        <PanelMessages notices={modeNotices} />

        {/* Shown and required by mode (`fieldRules`): `con_…_Approval1` / `_Approval2` / `_Approvals` / `_Notifications`. */}
        {rules.portfolioManager.visible
          ? picker("portfolioManager", "pcf_Admin_ProjectGates_Approvals_Form_Fields_PortfolioManger", styles.pmBlock)
          : null}
        {rules.contributors.visible ? picker("contributors", "pcf_Admin_ProjectGates_Approvals_Form_Fields_Approval2") : null}
        {rules.approvers.visible ? picker("approvers", "pcf_Admin_ProjectGates_Approvals_Form_Fields_Approvals") : null}
        {picker("notifications", "pcf_Admin_ProjectGates_Approvals_Form_Fields_Notifications")}

        {/*
          * Gate editor only (`con_…_ResetGateApproval.Visible`, PGAS:3570). The canvas `Button@0.0.45`
          * (primary, no icon) first, the description to its right (PGAS:3573-3627).
          * DIVERGENCE (D22): disabled for a placeholder — nothing to reset, because no row is created on
          * open; its tooltip is NEW. The canvas button is always enabled.
          */}
        {isGate ? (
          <div className={styles.resetBand}>
            <Button
              appearance="primary"
              disabled={!canEdit || !target.row.template || saving}
              title={target.row.template ? undefined : "This gate has no saved approval to reset."}
              aria-label={LABELS.resetGate}
              data-testid="btn_Admin_ProjectGates_Approvals_Form_Fields_ResetGateApproval"
              onClick={onReset}
            >
              {LABELS.resetGate}
            </Button>
            <Text className={styles.resetText} data-testid="lbl_Admin_ProjectGates_Approvals_Form_Fields_ResetGateApproval_Description">
              {RESET_GATE_DESCRIPTION}
            </Text>
          </div>
        ) : null}
      </div>
    </FormPanel>
  );
}
