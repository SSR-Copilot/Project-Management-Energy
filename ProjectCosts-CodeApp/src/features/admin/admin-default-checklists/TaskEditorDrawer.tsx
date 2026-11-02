/**
 * The Add/Edit Task side panel (`con_Admin_Checklist_Form`, L885-1403). 450 px, blue
 * header via the shared `FormPanel`. `data-testid`s are the canvas control names; the labels are
 * the canvas captions, verbatim (`lbl_Admin_Checklist_Form_Fields_Name.Text` "Description",
 * `lbl_Admin_Checklist_Form_Fields_HoldingDescription.Text` "Holding Description", the three
 * toggles' `Label`s — note the lower-case "Gate relevance").
 *
 * DIVERGENCE: a failed save keeps the panel open with the user's input and shows the error (the
 * canvas closed the panel after the write whatever the outcome and showed nothing). While a save
 * runs the panel cannot be dismissed (`busy`); with unsaved input, Cancel / ✕ / Escape ask
 * "Discard changes?" first (`dirty`) — the canvas reset and closed at once.
 *
 * DIVERGENCE: the blank-name message shows only after the field was touched or Save was tried;
 * the canvas label `lbl_Admin_Checklist_Form_Fields_Name_ErrorMessage` is visible from the start
 * while the name is blank (L1056).
 *
 * Shared building blocks: the footer is the shared `PanelButtons look="brand"` (brand-outline
 * Cancel; Save keeps `aria-label="Save"` while it shows "Saving…"), the error bar is
 * `PanelMessages` (`role="alert"`, was `politeness="assertive"`), and both texts are the shared
 * `TextField` with the `n/256` counter in the Field hint and semibold labels.
 */
import { Switch, makeStyles } from "@fluentui/react-components";
import { shownError } from "@/features/shared/useTouched";
import { FormPanel, HINTS, PanelButtons, PanelMessages, TextField } from "@/components";
import type { TaskForm } from "@/data/adminDefaultChecklists";
import { MAX_TEXT_LENGTH, validateTask } from "./rules";

const useStyles = makeStyles({
  body: {
    display: "flex", flexDirection: "column", rowGap: "16px",
    paddingTop: "20px", paddingBottom: "20px",
  },
  toggles: { display: "flex", flexDirection: "column", rowGap: "4px" },
  /** Label before the switch, 220 px wide (L1185-1214). */
  toggle: { width: "220px", justifyContent: "space-between" },
});

export interface TaskEditorDrawerProps {
  open: boolean;
  mode: "create" | "edit";
  form: TaskForm;
  /** Show the blank-name message only after the field was touched or Save was tried. */
  touched: boolean;
  /** The form differs from the values the panel opened with (discard guard). */
  dirty: boolean;
  error: string | null;
  saving: boolean;
  /** The admin rule is not met: Save is disabled. */
  readOnly?: boolean;
  onChange: (form: TaskForm) => void;
  onTouch: () => void;
  onSave: () => void;
  onCancel: () => void;
}

export function TaskEditorDrawer({
  open, mode, form, touched, dirty, error, saving, readOnly = false, onChange, onTouch, onSave, onCancel,
}: TaskEditorDrawerProps) {
  const styles = useStyles();
  const errors = validateTask(form);
  const valid = !errors.name;
  /** `lblAdmin_ProjectGates_Approvals_Form_Title_1.Text: If(IsBlank(locSelectedChecklistEntity), "Add Task", "Edit Task")` — verbatim. */
  const title = mode === "create" ? "Add Task" : "Edit Task";

  return (
    <FormPanel
      open={open}
      title={title}
      width="narrow"
      onDismiss={onCancel}
      busy={saving}
      dirty={dirty}
      // The ✕ is the canvas `closeKey` item of this command bar (its `ItemDisplayName` "Home" is
      // never shown, so the shared default label stays).
      closeTestId="pcf_com_Admin_ProjectGates_Approvals_Form_CommandBar_1"
      footer={<PanelButtons look="brand" disabled={!(valid && !readOnly)} saving={saving} onSave={onSave} savingLabel="Saving…"
        // The canvas Save hint is the copy-pasted "Filter projects details list view." (SOURCE DEFECT): "Save".
        saveTooltip={HINTS.save}
        saveTestId="pcf_but_Admin_Checklist_Form_Buttons_Save"
        cancelTestId="pcf_but_Admin_Admin_Checklist_Form_Buttons_Cancel" />}
    >
      <form
        className={styles.body}
        aria-label={title}
        onSubmit={(e) => { e.preventDefault(); if (valid && !saving) onSave(); }}
      >
        <PanelMessages error={error} />

        <TextField skin="plain"
          label="Description"
          testId="txt_Admin_Checklist_Form_Fields_Name"
          labelWeight="semibold"
          required
          value={form.name}
          maxLength={MAX_TEXT_LENGTH}
          counter="hint"
          error={shownError(errors.name, touched)}
          onChange={(name) => { onChange({ ...form, name }); if (!touched) onTouch(); }}
          onBlur={onTouch}
        />

        <TextField skin="plain"
          label="Holding Description"
          testId="txt_Admin_Checklist_Form_Fields_HoldingDescription"
          labelWeight="semibold"
          value={form.holdingDescription}
          maxLength={MAX_TEXT_LENGTH}
          counter="hint"
          onChange={(holdingDescription) => onChange({ ...form, holdingDescription })}
        />

        <div className={styles.toggles}>
          <Switch
            className={styles.toggle} labelPosition="before" label="Gate relevance"
            aria-label="Gate relevance" data-testid="tgl_GateRelevance_ChecklistForm"
            checked={form.gateRelevance}
            onChange={(_, d) => onChange({ ...form, gateRelevance: d.checked })}
          />
          <Switch
            className={styles.toggle} labelPosition="before" label="Completion Date"
            aria-label="Completion Date" data-testid="tgl_CompletionDate_ChecklistForm"
            checked={form.isCompletionDate}
            onChange={(_, d) => onChange({ ...form, isCompletionDate: d.checked })}
          />
          <Switch
            className={styles.toggle} labelPosition="before" label="Active"
            aria-label="Active" data-testid="tgl_Active_ChecklistForm"
            checked={form.isActive}
            onChange={(_, d) => onChange({ ...form, isActive: d.checked })}
          />
        </div>
      </form>
    </FormPanel>
  );
}
