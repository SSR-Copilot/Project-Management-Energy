/**
 * Edit right panel (`con_Admin_MilestoneAssumtion_Form`, AMS:999-2670): the title
 * `lblAdmin_ProjectGates_Approvals_Form_Title_2`, the ✕ (`pcf_com_Admin_ProjectGates_Approvals_Form_CommandBar_2`,
 * item `closeKey`), the durations and success-rate matrices, and Save / Cancel
 * (`pcf_but_Admin_MilestoneAssumption_Form_Buttons_Save` / `…_Cancel`).
 *
 * 540 px wide (`Min(450 * 1.2, Parent.Width)`, AMS:1028) via the shared `FormPanel`. While
 * a save runs the panel is `busy` (Escape / backdrop / ✕ ignored).
 * DIVERGENCE: the canvas ✕ and Cancel close at once; here a dirty draft asks "Discard changes?"
 * first (`dirty` + `discardText`, no canvas text).
 * DIVERGENCE: a full-height body with a sticky footer replaces the canvas half-height body and
 * blue filler block.
 * SOURCE DEFECT (not reproduced): the canvas Save carries `Tooltip: "Filter projects details list
 * view."`, copied from another screen; this Save has no tooltip.
 * The inputs take the canvas `MaxLength` (`gblAppConstants.DefaultDefMaxLength` = 256, `INPUT_MAX_LENGTH`)
 * and paint the canvas 1 px `BorderColor` (`INVALID_BORDER`, #BD3133) while the SHOWN value fails
 * its check — including a blank one on open (`CellState.invalid`); the section message and Save
 * still wait for a change (`rules.ts evaluateCell`).
 * The ✕ is the canvas command-bar item's `ItemIconColor: themeTertiary` (AMS:1073) through
 * `FormPanel closeIconColor`.
 */
import { useId } from "react";
import { Input, Text, makeStyles, tokens } from "@fluentui/react-components";
import { FormPanel, HINTS, InlineEmpty } from "@/components";
import {
  CLOSE_ICON_COLOR, DURATION_FIELDS, HEADING, INPUT_MAX_LENGTH, INVALID_BORDER, MESSAGE_COLOR, MSG, PANEL_FIELD_PART,
  PANEL_TEST_ID, RATE_FIELDS, TYPOGRAPHY, technologyLabel, technologyName, type MatrixKind,
} from "./constants";
import type { MilestoneField } from "@/domain/milestones";
import { cellKey, type PanelColumn, type PanelState } from "./rules";

const useStyles = makeStyles({
  /** Content starts 16 px from the panel edge: the canvas labels and headings carry `PaddingLeft: 16` and the form has no side padding (AMS:1190, 1141). */
  panel: { "& .canvas-panel-body.canvas-panel-body": { paddingLeft: "16px" } },
  section: { display: "flex", flexDirection: "column", gap: "0", marginBottom: tokens.spacingVerticalXL },
  scroller: { overflowX: "auto", maxWidth: "100%" },
  /** Rows are 40 px (AMS:1196, 1897); one column per technology is a 80 px gallery template (AMS:1332). */
  grid: { display: "grid", alignItems: "center", columnGap: "0", rowGap: "0", gridAutoRows: "40px" },
  // Canvas sizes and weights (`TYPOGRAPHY`; modern Text, px).
  heading: { ...TYPOGRAPHY.panelHeading, minHeight: "30px", display: "flex", alignItems: "center" },
  rowLabel: { ...TYPOGRAPHY.panelLabel, paddingRight: "16px" },
  techLabel: { ...TYPOGRAPHY.panelLabel, textAlign: "center" },
  /** `Width: Min(TemplateWidth, 60)` at `X: 10` inside the 80 px template, so the input is centred under its label. */
  input: { width: "60px", minWidth: "60px", justifySelf: "center", "& input": { textAlign: "center" } },
  // Canvas Small, 14 px high, `FontColor: gblAppColors.Error` = akzent5 (AMS:1908-1914, 2366-2372).
  message: { color: MESSAGE_COLOR, ...TYPOGRAPHY.panelMessage },
  messageSlot: { minHeight: "14px" },
});

export interface EditMilestonesPanelProps {
  open: boolean;
  countryName: string;
  state: PanelState;
  /** The admin rule (`useAdminAccess`): without it the inputs and Save are disabled. */
  canEdit: boolean;
  saving: boolean;
  /** Persistent save error. */
  error: string | undefined;
  duplicates: string | undefined;
  onChange: (key: string, text: string) => void;
  onSave: () => void;
  /**
   * Drops the draft and closes. Cancel, ✕ and Escape reach it through `FormPanel`, which asks
   * "Discard changes?" first while `state.touched`.
   */
  onClose: () => void;
}

export function EditMilestonesPanel({
  open, countryName, state, canEdit, saving, error, duplicates, onChange, onSave, onClose,
}: EditMilestonesPanelProps) {
  const title = MSG.panelTitle(countryName);
  const styles = useStyles();

  return (
    <FormPanel
      open={open}
      title={title}
      ariaLabel={title}
      width={540}
      panelClassName={styles.panel}
      busy={saving}
      dirty={state.touched}
      discardText={{
        // NEW — no canvas equivalent (see the DIVERGENCE above); not destructive (no red), a
        // CheckMark confirm, as there is no canvas instance to transcribe a look from.
        description: `Your changes to the milestone assumptions for ${countryName || "this country"} have not been saved. Discard them?`,
        cancelText: "Cancel",
        confirmIcon: "checkmark",
      }}
      onDismiss={onClose}
      closeTestId="pcf_com_Admin_ProjectGates_Approvals_Form_CommandBar_2-closeKey"
      closeIconColor={CLOSE_ICON_COLOR}
      // Shared footer (Cancel in the canvas brand outline); Cancel goes through the dirty guard.
      actions={{
        onSave, canSave: canEdit && state.canSave, saving,
        // SOURCE DEFECT: the canvas Save hint is "Filter projects details list view."; it says "Save".
        saveTooltip: HINTS.save,
        saveTestId: "pcf_but_Admin_MilestoneAssumption_Form_Buttons_Save",
        cancelTestId: "pcf_but_Admin_MilestoneAssumption_Form_Buttons_Cancel",
      }}
      // DIVERGENCE: the save error and the duplicate-row warning have no canvas equivalent.
      messages={{ error: error ?? null, notices: duplicates ? [{ intent: "warning", text: duplicates }] : [] }}
    >
      <MatrixSection
        kind="durations"
        heading={HEADING.durations}
        rows={DURATION_FIELDS}
        columns={state.durationColumns}
        state={state}
        errors={state.durationErrors}
        disabled={saving || !canEdit}
        onChange={onChange}
      />
      <MatrixSection
        kind="successRates"
        heading={HEADING.successRates}
        rows={RATE_FIELDS}
        columns={state.rateColumns}
        state={state}
        errors={state.rateErrors}
        disabled={saving || !canEdit}
        onChange={onChange}
      />
    </FormPanel>
  );
}

interface MatrixSectionProps {
  kind: MatrixKind;
  heading: string;
  rows: readonly { field: MilestoneField; label: string }[];
  columns: readonly PanelColumn[];
  state: PanelState;
  errors: readonly string[];
  disabled: boolean;
  onChange: (key: string, text: string) => void;
}

function MatrixSection({ kind, heading, rows, columns, state, errors, disabled, onChange }: MatrixSectionProps) {
  const styles = useStyles();
  const headingId = useId();
  const messageId = useId();
  // NEW — no canvas equivalent: the unit in each input's accessible name.
  const unit = kind === "durations" ? "duration in months" : "success rate";
  const ids = PANEL_TEST_ID[kind];

  return (
    <section className={styles.section} aria-labelledby={headingId} data-testid={ids.section}>
      <Text id={headingId} className={styles.heading} data-testid={ids.heading}>{heading}</Text>
      {columns.length === 0 ? (
        // NEW — no canvas equivalent: the canvas shows an empty gallery.
        <InlineEmpty>No {kind === "durations" ? "duration" : "success-rate"} rows are stored for this country.</InlineEmpty>
      ) : (
        <div className={styles.scroller}>
          {/*
            DIVERGENCE: the canvas lays the row labels out once and repeats one input COLUMN per
            technology (a horizontal gallery); here one grid holds the labels and every input.
          */}
          <div
            className={styles.grid}
            style={{ gridTemplateColumns: `144px repeat(${columns.length}, 80px)` }}
            role="group"
            aria-labelledby={headingId}
            data-testid={ids.gallery}
          >
            <span />
            {columns.map((c) => (
              <span key={c.row.id} className={styles.techLabel} data-testid={`${ids.techLabel}-${c.row.id}`}>{technologyLabel(c.technology)}</span>
            ))}
            {rows.map((r) => (
              <RowInputs
                key={r.field}
                kind={kind}
                label={r.label}
                field={r.field}
                columns={columns}
                state={state}
                unit={unit}
                messageId={messageId}
                disabled={disabled}
                onChange={onChange}
              />
            ))}
          </div>
        </div>
      )}
      {/* `lbl_Admin_MilestoneAssumption_Form_Fields_<Section>_InvalidMessage`: the canvas message first, then any range message. */}
      <div id={messageId} className={styles.messageSlot} aria-live="polite" data-testid={ids.message}>
        {errors.map((m) => <Text key={m} as="p" className={styles.message}>{m}</Text>)}
      </div>
    </section>
  );
}

function RowInputs({
  kind, label, field, columns, state, unit, messageId, disabled, onChange,
}: {
  kind: MatrixKind;
  label: string;
  field: MilestoneField;
  columns: readonly PanelColumn[];
  state: PanelState;
  unit: string;
  messageId: string;
  disabled: boolean;
  onChange: (key: string, text: string) => void;
}) {
  const styles = useStyles();
  const section = PANEL_TEST_ID[kind].part;
  const part = PANEL_FIELD_PART[field];
  return (
    <>
      <span className={styles.rowLabel} data-testid={`lbl_Admin_MilestoneAssumption_Form_Fields_${section}_${part}`}>{label}</span>
      {columns.map((c) => {
        const key = cellKey(c.row.id, field);
        const cell = state.cells.get(key);
        // The canvas `BorderThickness` state: red while the shown value fails, typed or not.
        const invalid = Boolean(cell?.invalid);
        return (
          <Input
            key={key}
            className={styles.input}
            value={cell?.text ?? ""}
            placeholder={cell?.placeholder}
            disabled={disabled}
            inputMode={unit === "success rate" ? "decimal" : "numeric"}
            maxLength={INPUT_MAX_LENGTH}
            // The canvas sets no AccessibleLabel; the name joins the column caption (technology)
            // and the row caption, so each input in the grid stays distinguishable.
            aria-label={`${technologyName(c.technology)} ${label} ${unit}`}
            // The canvas inputs repeat per technology (a gallery), so the id adds `-<row id>`.
            data-testid={`txt_Admin_MilestoneAssumption_Form_Fields_${section}_${part}_Input-${c.row.id}`}
            aria-invalid={invalid}
            // The section message describes the input only once it shows (a touched cell).
            aria-describedby={cell?.error ? messageId : undefined}
            title={cell?.error}
            // `BorderColor: RGBA(189, 49, 51, 1)`, `BorderThickness: 1` while invalid (AMS:1364-1371).
            style={invalid ? { border: `1px solid ${INVALID_BORDER}` } : undefined}
            onChange={(_, data) => onChange(key, data.value)}
          />
        );
      })}
    </>
  );
}
