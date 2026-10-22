/**
 * The Approvers right panel, for both a gate template and a checklist-task template.
 *
 * The form state lives HERE and is seeded from `initialForm` when the panel mounts; the screen
 * remounts it (React `key`) for every open, so nothing leaks between editors. Opening
 * and cancelling never write; a failed save leaves the panel open with the user's input intact.
 *
 * Shared `FormPanel` modes: `busy` blocks Esc / backdrop / ✕ while a save runs; `dirty`
 * asks "Discard changes?" before Esc / backdrop / ✕ / Cancel drops edited input.
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
  canSave, droppedRoles, fieldRules, gateFieldText, isDraftGate, MAX_PEOPLE, modeOptions, panelTitle,
  RESET_GATE_DESCRIPTION, ROLE_LABEL, validateForm, type ApprovalForm, type ApprovalMode,
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

  /* The duplicate-gate message follows the save error. */
  const topNotices: PanelNotice[] = errors.main ? [{ intent: "error", text: errors.main }] : [];
  /* The mode warning keeps its place under Approval Mode. */
  const modeNotices: PanelNotice[] = dropped.length > 0
    ? [{ intent: "warning", text: `Saving in this mode clears the saved ${dropped.map((r) => ROLE_LABEL[r]).join(", ")}.` }]
    : [];

  return (
    <FormPanel
      open title={panelTitle(target)} width="narrow"
      onDismiss={onCancel} busy={saving} dirty={isDirty(form, initialForm)}
      actions={{ onSave: () => onSave(form), canSave: canEdit && canSave(errors), saving }}
    >
      <div className={styles.body}>
        <PanelMessages error={error ?? null} errorTitle="Not saved" notices={topNotices} />

        {/* Always read-only (PGAS:2678-2680). */}
        <ReadOnlyField skin="plain" label="Gate" value={gateFieldText(target)} {...(errors.gate ? { error: errors.gate } : {})} />

        {/* Task editor only; editable when adding (PGAS:2878-2883). */}
        {target.kind === "task" ? (
          <Field
            label="Check List" required
            validationState={errors.checklist ? "error" : "none"} validationMessage={errors.checklist}
          >
            <Dropdown
              className={styles.dropdown}
              aria-label="Check List"
              data-testid="gates-panel-checklist"
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

        {/* View-only for the Draft gate in the gate editor (PGAS:2962-2967). */}
        <Switch
          label="Gate active"
          checked={draftLocked ? true : form.gateActive}
          disabled={!canEdit || draftLocked || saving}
          onChange={(_, d) => setForm((f) => ({ ...f, gateActive: d.checked }))}
          aria-label="Gate active"
          data-testid="gates-panel-gate-active"
        />
        {draftLocked ? <Text size={200}>The Draft gate is always active.</Text> : null}

        {/* Approval Mode */}
        <Field label="Approval Mode">
          <RadioGroup
            value={String(form.mode)}
            disabled={!canEdit || saving}
            aria-label="Approval Mode"
            onChange={(_, d) => setForm((f) => ({ ...f, mode: Number(d.value) as ApprovalMode }))}
          >
            {modeOptions(technology).map((o) => (
              <Radio key={o.value} value={String(o.value)} label={o.label} aria-label={o.label} data-testid={`gates-panel-mode-${o.value}`} />
            ))}
          </RadioGroup>
        </Field>

        <PanelMessages notices={modeNotices} />

        {/* Shown and required by mode. */}
        {rules.portfolioManager.visible ? (
          <PeoplePickerField
            label="Portfolio Manager" people={form.portfolioManager} max={MAX_PEOPLE.portfolioManager}
            required={rules.portfolioManager.required} error={errors.portfolioManager}
            disabled={!canEdit || saving} placeholder="Select Portfolio Manager"
            onChange={setPeople("portfolioManager")}
          />
        ) : null}
        {rules.contributors.visible ? (
          <PeoplePickerField
            label="Contributors" people={form.contributors} max={MAX_PEOPLE.contributors}
            required={rules.contributors.required} error={errors.contributors}
            disabled={!canEdit || saving} placeholder="Select Contributors"
            onChange={setPeople("contributors")}
          />
        ) : null}
        {rules.approvers.visible ? (
          <PeoplePickerField
            label="Approvers" people={form.approvers} max={MAX_PEOPLE.approvers}
            required={rules.approvers.required} error={errors.approvers}
            disabled={!canEdit || saving} placeholder="Select Approvers"
            onChange={setPeople("approvers")}
          />
        ) : null}
        <PeoplePickerField
          label="Notifications" people={form.notifications} max={MAX_PEOPLE.notifications}
          required={rules.notifications.required} error={errors.notifications}
          disabled={!canEdit || saving} placeholder="Select Notifications"
          onChange={setPeople("notifications")}
        />

        {/* Gate editor only (PGAS:3570); disabled for a placeholder: nothing to reset. */}
        {isGate ? (
          <div className={styles.resetBand}>
            {/* Canvas order and look — the (icon-less) button first, the description to its right (PGAS:3586-3627). */}
            <Button
              appearance="primary"
              disabled={!canEdit || !target.row.template || saving}
              title={target.row.template ? undefined : "This gate has no saved approval to reset."}
              aria-label="Reset Gate"
              data-testid="gates-panel-reset"
              onClick={onReset}
            >
              Reset Gate
            </Button>
            <Text className={styles.resetText}>{RESET_GATE_DESCRIPTION}</Text>
          </div>
        ) : null}
      </div>
    </FormPanel>
  );
}
