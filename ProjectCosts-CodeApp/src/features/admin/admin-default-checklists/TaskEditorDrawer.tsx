/**
 * The Add/Edit Task side panel (`con_Admin_Checklist_Form`, L885-1403). 450 px, blue
 * header via the shared `FormPanel`. `data-testid`s are the canvas control names; the labels are
 * the canvas captions, verbatim (`lbl_Admin_Checklist_Form_Fields_Name.Text` "Description",
 * `lbl_Admin_Checklist_Form_Fields_HoldingDescription.Text` "Holding Description", the three
 * toggles' `Label`s — note the lower-case "Gate relevance").
 *
 * The fields as the canvas lays them out (20 Nov 2026, user: the form must match the canvas):
 *   - Description (`con_Admin_Checklist_Form_Fields_Title`, 74 high): the red `*`
 *     (`lbl_…_Name_Required`, X 5) BEFORE the Semibold caption (X 20), the `n/256` counter
 *     (`lbl_…_Name_Details`, `Align.Right`, Y 0, `Size: ExtraSmall` 9 pt, RGBA(50,49,48)) at the right of
 *     the caption row, and "Value cannot be blank." (`lbl_…_Name_ErrorMessage`, `Size: =9`,
 *     `gblAppColors.Error` = akzent5, no icon) under the box — visible whenever the trimmed name is
 *     blank, so from the moment Add Task opens (`Visible: IsBlank(Trim(…))`, L1056).
 *   - Holding Description (74 high, counter, no `*`), then the three toggles, with no gap between
 *     the blocks (`con_Admin_Checklist_Form_Fields` has no `LayoutGap`) and 20 px above the first
 *     (`PaddingTop: gblAppSizes.RightPanel.Top`, which the panel body's own 20 px padding is).
 * The shared `TextField` canvas skin draws the `*` first and the counter on the caption row, and
 * `useCanvasRequiredMark` gives the `*` the canvas label's weight, colour and place.
 * (Before: the plain skin, `*` after the caption, the counter under the box, Fluent's red message
 * with an icon shown only after a touch, and 40 px above the first field.)
 *
 * DIVERGENCE (kept, D36): a failed save keeps the panel open with the user's input and shows the
 * error (the canvas closed the panel after the write whatever the outcome and showed nothing).
 * While a save runs the panel cannot be dismissed (`busy`); with unsaved input, Cancel / ✕ / Escape
 * ask "Discard changes?" first (`dirty`) — the canvas reset and closed at once.
 *
 * Shared building blocks: the footer is the shared `PanelButtons look="brand"` (brand-outline
 * Cancel; Save keeps `aria-label="Save"` while it shows "Saving…"), the error bar is
 * `PanelMessages` (`role="alert"`), and both texts are the shared `TextField`.
 */
import { Switch, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { FormPanel, HINTS, PanelButtons, PanelMessages, TextField, useCanvasRequiredMark } from "@/components";
import type { TaskForm } from "@/data/adminDefaultChecklists";
import { palette } from "@/theme/tokens";
import { MAX_TEXT_LENGTH, validateTask } from "./rules";

const useStyles = makeStyles({
  /** `con_Admin_Checklist_Form_Fields`: no `LayoutGap`; the panel body's 20 px padding is its `PaddingTop` 20. */
  body: {
    display: "flex", flexDirection: "column", rowGap: "0",
    paddingTop: "0", paddingBottom: "20px",
    /** `lbl_…_Details`: `Color: =RGBA(50, 49, 48, 1)` (L1114, L1167) on the caption row. */
    "& .fui-Field ~ .fui-Text": { color: "#323130" },
    /**
     * `lbl_…_Name` / `lbl_…_HoldingDescription`: `Weight: ='TextCanvas.Weight'.Semibold` (L1087, L1182). `labelWeight`
     * alone loses to canvas.css's `.canvas-panel .fui-Field label { font-weight: 400 }` (0-2-1), so the captions rendered
     * regular; this rule (0-3-0) restores the canvas weight.
     */
    "& .fui-Field .fui-Field__label": { fontWeight: tokens.fontWeightSemibold },
  },
  /** `con_Admin_Checklist_Form_Fields_Title` / `…_HoldingDescription`: `Height: =74` (L1029, L1130). */
  textBlock: { minHeight: "74px" },
  /** `lbl_Admin_Checklist_Form_Fields_Name_ErrorMessage`: `Size: =9` (12 px), `Color: gblAppColors.Error` (akzent5), 16 high. */
  error: { color: palette.akzent5, fontSize: "12px", lineHeight: "16px" },
  /** The three toggles follow each other with no gap (L1185-1214). */
  toggles: { display: "flex", flexDirection: "column", rowGap: "0" },
  /** Label before the switch, 220 px wide (L1185-1214). */
  toggle: { width: "220px", justifyContent: "space-between" },
});

export interface TaskEditorDrawerProps {
  open: boolean;
  mode: "create" | "edit";
  form: TaskForm;
  /** The form differs from the values the panel opened with (discard guard). */
  dirty: boolean;
  error: string | null;
  saving: boolean;
  /** The admin rule is not met: Save is disabled. */
  readOnly?: boolean;
  onChange: (form: TaskForm) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function TaskEditorDrawer({
  open, mode, form, dirty, error, saving, readOnly = false, onChange, onSave, onCancel,
}: TaskEditorDrawerProps) {
  const styles = useStyles();
  const requiredMark = useCanvasRequiredMark();
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
      // The ✕ is the canvas `closeKey` item of this command bar. Its `ItemDisplayName` "Home" would be the canvas
      // hover text of an icon-only command-bar item; like the pasted Save hint it is a copy-paste leftover, so the
      // shared "Cancel" stays (D65, rule 22).
      closeTestId="pcf_com_Admin_ProjectGates_Approvals_Form_CommandBar_1"
      // `ItemIconColor: gblAppTheme.palette.themeTertiary` (L964): the ✕ is light blue, not white.
      closeIconColor={palette.themeTertiary}
      footer={<PanelButtons look="brand" disabled={!(valid && !readOnly)} saving={saving} onSave={onSave} savingLabel="Saving…"
        // The canvas Save hint is the copy-pasted "Filter projects details list view." (SOURCE DEFECT): "Save".
        saveTooltip={HINTS.save}
        saveTestId="pcf_but_Admin_Checklist_Form_Buttons_Save"
        cancelTestId="pcf_but_Admin_Admin_Checklist_Form_Buttons_Cancel" />}
    >
      <form
        className={mergeClasses(styles.body, requiredMark.root)}
        aria-label={title}
        onSubmit={(e) => { e.preventDefault(); if (valid && !saving) onSave(); }}
      >
        <PanelMessages error={error} />

        <div className={styles.textBlock}>
          <TextField
            label="Description"
            testId="txt_Admin_Checklist_Form_Fields_Name"
            labelWeight="semibold"
            required
            value={form.name}
            maxLength={MAX_TEXT_LENGTH}
            // `lbl_Admin_Checklist_Form_Fields_Name_ErrorMessage.Visible: =IsBlank(Trim(…))` — shown whenever blank.
            // While the drawer closes, the screen has already dropped the editor state and hands in an empty form,
            // which would flash "Value cannot be blank." for the close animation (user, 23 Nov 2026): no message once closed.
            error={open ? errors.name : undefined}
            errorClassName={styles.error}
            validationIcon={null}
            onChange={(name) => onChange({ ...form, name })}
          />
        </div>

        <div className={styles.textBlock}>
          <TextField
            label="Holding Description"
            testId="txt_Admin_Checklist_Form_Fields_HoldingDescription"
            labelWeight="semibold"
            value={form.holdingDescription}
            maxLength={MAX_TEXT_LENGTH}
            onChange={(holdingDescription) => onChange({ ...form, holdingDescription })}
          />
        </div>

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
