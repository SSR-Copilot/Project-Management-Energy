/**
 * M7 — the Add/Edit Task side panel (`con_Admin_Checklist_Form`, L885-1403). 450 px, blue
 * header via the shared `FormPanel`. A failed save keeps the panel open with the user's input
 * and shows the error (AC-6.3, fixes D-2). While a save runs the panel cannot be dismissed
 * (`busy`); with unsaved input, Cancel / ✕ / Escape ask "Discard changes?" first (`dirty`, M7).
 *
 * Reusable components (Wave B): the footer is the shared `PanelFooter` (V1: brand-outline
 * Cancel; Save keeps `aria-label="Save"` while it shows "Saving…"), the error bar is
 * `PanelMessages` (`role="alert"`, was `politeness="assertive"`), and both texts are the shared
 * `TextField` with the `n/256` counter in the Field hint and semibold labels.
 */
import { Switch, makeStyles } from "@fluentui/react-components";
import { shownError } from "@/app/useTouched";
import { FormPanel, PanelFooter, PanelMessages, TextField } from "@/components";
import type { TaskForm } from "@/data/settings/checklist-settings";
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
  /** The form differs from the values the panel opened with (M7 discard guard). */
  dirty: boolean;
  error: string | null;
  saving: boolean;
  onChange: (form: TaskForm) => void;
  onTouch: () => void;
  onSave: () => void;
  onCancel: () => void;
}

export function TaskEditorDrawer({
  open, mode, form, touched, dirty, error, saving, onChange, onTouch, onSave, onCancel,
}: TaskEditorDrawerProps) {
  const styles = useStyles();
  const errors = validateTask(form);
  const valid = !errors.name;
  const title = mode === "create" ? "Add Task" : "Edit Task";

  return (
    <FormPanel
      open={open}
      title={title}
      width="narrow"
      onDismiss={onCancel}
      busy={saving}
      dirty={dirty}
      footer={<PanelFooter canSave={valid} saving={saving} onSave={onSave} savingLabel="Saving…" />}
    >
      <form
        className={styles.body}
        aria-label={title}
        onSubmit={(e) => { e.preventDefault(); if (valid && !saving) onSave(); }}
      >
        <PanelMessages error={error} />

        <TextField
          label="Description"
          labelWeight="semibold"
          required
          value={form.name}
          maxLength={MAX_TEXT_LENGTH}
          counter="hint"
          error={shownError(errors.name, touched)}
          onChange={(name) => { onChange({ ...form, name }); if (!touched) onTouch(); }}
          onBlur={onTouch}
        />

        <TextField
          label="Holding Description"
          labelWeight="semibold"
          value={form.holdingDescription}
          maxLength={MAX_TEXT_LENGTH}
          counter="hint"
          onChange={(holdingDescription) => onChange({ ...form, holdingDescription })}
        />

        <div className={styles.toggles}>
          <Switch
            className={styles.toggle} labelPosition="before" label="Gate relevance"
            checked={form.gateRelevance}
            onChange={(_, d) => onChange({ ...form, gateRelevance: d.checked })}
          />
          <Switch
            className={styles.toggle} labelPosition="before" label="Completion Date"
            checked={form.isCompletionDate}
            onChange={(_, d) => onChange({ ...form, isCompletionDate: d.checked })}
          />
          <Switch
            className={styles.toggle} labelPosition="before" label="Active"
            checked={form.isActive}
            onChange={(_, d) => onChange({ ...form, isActive: d.checked })}
          />
        </div>
      </form>
    </FormPanel>
  );
}
