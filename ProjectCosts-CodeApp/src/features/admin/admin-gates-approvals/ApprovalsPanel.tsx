/**
 * The Approvers right panel — canvas `con_Admin_ProjectGates_Approvals_Form` — for both a gate
 * template (`locEditigApprovalType = "Cluster"`) and a checklist-task template (`"Checklist"`).
 * Each control carries its canvas control name as `data-testid` (CONVENTIONS rule 16).
 *
 * The form state lives HERE and is seeded from `initialForm` when the panel mounts; the screen
 * remounts it (React `key`) for every open, so nothing leaks between editors (the canvas does
 * this with the hidden `but_…_Form_Buttons_Reset`). Opening and cancelling never write.
 * DIVERGENCE: a failed save leaves the panel open with the user's input intact; the canvas
 * closes it whatever the outcome (doc 09 §2).
 *
 * Shared `FormPanel` modes: `busy` blocks Esc / backdrop / ✕ while a save runs; `dirty`
 * asks "Discard changes?" before Esc / backdrop / ✕ / Cancel drops edited input.
 * DIVERGENCE: NEW — the canvas closes on ✕ / Cancel without asking.
 *
 * Reusable components: the footer is the shared `PanelButtons look="brand"` (via `FormPanel actions`), the
 * bars are `PanelMessages`, the dirty test is `isDirty`, and the Gate field is the shared
 * `ReadOnlyField` with its `error` (the blank-cluster message).
 *
 * `canEdit` (admin access): without it the panel is read-only. Save, the Check List dropdown, the
 * Gate active switch, Approval Mode, every people picker and Reset Gate are disabled.
 */
import { useMemo, useState } from "react";
import {
  Button, Dropdown, Field, makeStyles, Option, Radio, RadioGroup, Switch, Text, tokens,
} from "@fluentui/react-components";
import { FormPanel, PanelMessages, ReadOnlyField, type PanelNotice } from "@/components";
import { isDirty } from "@/domain/form";
import { palette, space } from "@/theme/tokens";
import type { DefaultChecklist } from "@/data/adminGatesApprovals";
import { PeoplePickerField } from "./PeoplePickerField";
import {
  canSave, droppedRoles, fieldRules, gateFieldText, isDraftGate, LABELS, MAX_PEOPLE, modeOptions, panelTitle,
  RESET_GATE_DESCRIPTION, ROLE_LABEL, ROLE_PLACEHOLDER, validateForm, type ApprovalForm, type ApprovalMode,
  type EditorTarget, type PeopleRole,
} from "./rules";

const useStyles = makeStyles({
  body: { display: "flex", flexDirection: "column", rowGap: space.l, paddingTop: space.l, paddingBottom: space.l },
  resetBand: {
    display: "flex", alignItems: "center", columnGap: space.m,
    backgroundColor: "rgba(180,214,250,0.35)",
    paddingTop: space.m, paddingBottom: space.m, paddingLeft: space.m, paddingRight: space.m,
  },
  resetText: { fontSize: tokens.fontSizeBase200, color: palette.black, flexGrow: 1 },
  dropdown: { minWidth: "0px", width: "100%" },
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

export function ApprovalsPanel({
  target, initialForm, technology, conflict, canEdit, saving, error, onSave, onReset, onCancel,
}: ApprovalsPanelProps) {
  const styles = useStyles();
  const [form, setForm] = useState<ApprovalForm>(initialForm);
  const rules = fieldRules(form.mode);
  const blankLabelAllowed = target.kind === "gate" && Boolean(target.blankLabelAllowed);
  const errors = useMemo(
    () => validateForm(form, { kind: target.kind, gateLabel: target.label, conflict, blankLabelAllowed, initial: initialForm }),
    [form, target.kind, target.label, conflict, blankLabelAllowed, initialForm],
  );
  const dropped = droppedRoles(initialForm, form);
  const isGate = target.kind === "gate";
  const draftLocked = isGate && isDraftGate(target.row);

  const setPeople = (role: PeopleRole) => (people: ApprovalForm[PeopleRole]) =>
    setForm((f) => ({ ...f, [role]: people }));

  const checklistOptions: readonly DefaultChecklist[] = target.kind === "task"
    ? target.mode === "create" ? target.candidates : target.task ? [target.task.checklist] : []
    : [];
  const selectedChecklist = checklistOptions.find((c) => c.id === form.checklistId);

  /*
   * The duplicate-gate message (`lbl_…_Main_ErrorMessage`) follows the save error. The shared
   * `PanelMessages` has no test-id slot, so the canvas name is not carried.
   */
  const topNotices: PanelNotice[] = errors.main ? [{ intent: "error", text: errors.main }] : [];
  /* DIVERGENCE: NEW — the mode warning (see `droppedRoles`) keeps its place under Approval Mode. */
  const modeNotices: PanelNotice[] = dropped.length > 0
    ? [{ intent: "warning", text: `Saving in this mode clears the saved ${dropped.map((r) => ROLE_LABEL[r]).join(", ")}.` }]
    : [];

  return (
    <FormPanel
      open title={panelTitle(target)} width="narrow"
      onDismiss={onCancel} busy={saving} dirty={isDirty(form, initialForm)}
      // ✕ = the `closeKey` item of `pcf_com_Admin_ProjectGates_Approvals_Form_CommandBar`.
      closeTestId="pcf_com_Admin_ProjectGates_Approvals_Form_CommandBar"
      actions={{
        onSave: () => onSave(form), canSave: canEdit && canSave(errors), saving,
        saveTestId: "pcf_but_Admin_ProjectGates_Approvals_Form_Buttons_Save",
        cancelTestId: "pcf_but_Admin_ProjectGates_Approvals_Form_Buttons_Cancel",
      }}
    >
      <div className={styles.body}>
        {/* "Not saved" is NEW (no canvas equivalent). */}
        <PanelMessages error={error ?? null} errorTitle="Not saved" notices={topNotices} />

        {/* Always read-only (`drp_…_State.DisplayMode`, PGAS:2678-2680); the canvas `AccessibleLabel` is "Project Status". */}
        <ReadOnlyField
          skin="plain" label={LABELS.gate} value={gateFieldText(target)}
          ariaLabel={LABELS.gateAccessible}
          testId="drp_Admin_ProjectGates_Approvals_Form_Fields_State"
          {...(errors.gate ? { error: errors.gate } : {})}
        />

        {/* Task editor only (`con_…_State_1.Visible`); editable when adding (`drp_…_State_1.DisplayMode`, PGAS:2878-2883). */}
        {target.kind === "task" ? (
          <Field
            label={LABELS.checkList} required
            validationState={errors.checklist ? "error" : "none"} validationMessage={errors.checklist}
          >
            <Dropdown
              className={styles.dropdown}
              aria-label={LABELS.checkList}
              data-testid="drp_Admin_ProjectGates_Approvals_Form_Fields_State_1"
              // NEW — the canvas combobox has no placeholder.
              placeholder="Select a check list task"
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
        ) : null}

        {/*
          * `tog_…_Fields_Active.DisplayMode`: view-only for the Draft gate in the gate editor (PGAS:2962-2967).
          * DIVERGENCE: the canvas then shows the stored 'Gate active'; this app shows it ON (what Save
          * writes for Draft) and adds the NEW hint below.
          */}
        <Switch
          label={LABELS.gateActive}
          checked={draftLocked ? true : form.gateActive}
          disabled={!canEdit || draftLocked || saving}
          onChange={(_, d) => setForm((f) => ({ ...f, gateActive: d.checked }))}
          aria-label={LABELS.gateActive}
          data-testid="tog_Admin_ProjectGates_Approvals_Form_Fields_Active"
        />
        {draftLocked ? <Text size={200}>The Draft gate is always active.</Text> : null}

        {/* `rad_…_ApprovalMode`; its required asterisk is `Visible: =false` in the canvas, so none here. */}
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

        <PanelMessages notices={modeNotices} />

        {/* Shown and required by mode (`fieldRules`). */}
        {rules.portfolioManager.visible ? (
          <PeoplePickerField
            label={ROLE_LABEL.portfolioManager} people={form.portfolioManager} max={MAX_PEOPLE.portfolioManager}
            required={rules.portfolioManager.required} error={errors.portfolioManager}
            disabled={!canEdit || saving} placeholder={ROLE_PLACEHOLDER.portfolioManager}
            testId="pcf_Admin_ProjectGates_Approvals_Form_Fields_PortfolioManger"
            onChange={setPeople("portfolioManager")}
          />
        ) : null}
        {rules.contributors.visible ? (
          <PeoplePickerField
            label={ROLE_LABEL.contributors} people={form.contributors} max={MAX_PEOPLE.contributors}
            required={rules.contributors.required} error={errors.contributors}
            disabled={!canEdit || saving} placeholder={ROLE_PLACEHOLDER.contributors}
            testId="pcf_Admin_ProjectGates_Approvals_Form_Fields_Approval2"
            onChange={setPeople("contributors")}
          />
        ) : null}
        {rules.approvers.visible ? (
          <PeoplePickerField
            label={ROLE_LABEL.approvers} people={form.approvers} max={MAX_PEOPLE.approvers}
            required={rules.approvers.required} error={errors.approvers}
            disabled={!canEdit || saving} placeholder={ROLE_PLACEHOLDER.approvers}
            testId="pcf_Admin_ProjectGates_Approvals_Form_Fields_Approvals"
            onChange={setPeople("approvers")}
          />
        ) : null}
        <PeoplePickerField
          label={ROLE_LABEL.notifications} people={form.notifications} max={MAX_PEOPLE.notifications}
          required={rules.notifications.required} error={errors.notifications}
          disabled={!canEdit || saving} placeholder={ROLE_PLACEHOLDER.notifications}
          testId="pcf_Admin_ProjectGates_Approvals_Form_Fields_Notifications"
          onChange={setPeople("notifications")}
        />

        {/*
          * Gate editor only (`con_…_ResetGateApproval.Visible`, PGAS:3570).
          * DIVERGENCE: disabled for a placeholder (nothing to reset, because no row is created on
          * open); its tooltip is NEW. The canvas button is always enabled (D22).
          */}
        {isGate ? (
          <div className={styles.resetBand}>
            {/* Canvas order and look — the (icon-less) button first, the description to its right (PGAS:3586-3627). */}
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
