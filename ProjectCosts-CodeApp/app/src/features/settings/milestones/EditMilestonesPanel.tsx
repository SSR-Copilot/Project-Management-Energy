/**
 * Edit right panel (Module H: `con_Admin_MilestoneAssumtion_Form`, AMS:999-2670).
 *
 * 540 px wide (`Min(450 * 1.2, Parent.Width)`, AMS:1028) via the shared `FormPanel` (M8). While
 * a save runs the panel is `busy` (Escape / backdrop / ✕ ignored). A dirty draft asks before it
 * is dropped (M7 `dirty` + `discardText`, FR-9, D-UI-4). Full-height body with a sticky footer
 * replaces the canvas half-height body and blue filler block.
 */
import { useId } from "react";
import { Input, Text, makeStyles, tokens } from "@fluentui/react-components";
import { FormPanel, InlineEmpty } from "@/components";
import { DURATION_FIELDS, HEADING, RATE_FIELDS, TYPOGRAPHY, technologyLabel, technologyName, type MatrixKind } from "./constants";
import type { MilestoneField } from "@/data/settings/milestones";
import { cellKey, type PanelColumn, type PanelState } from "./rules";

const ERROR_BORDER = tokens.colorPaletteRedBorder2;

const useStyles = makeStyles({
  section: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS, marginBottom: tokens.spacingVerticalXL },
  scroller: { overflowX: "auto", maxWidth: "100%" },
  grid: { display: "grid", alignItems: "center", columnGap: "8px", rowGap: "8px" },
  // Canvas sizes and weights (parity R2 GAP-R2-1, `TYPOGRAPHY`; same ExtraLarge step as the matrix).
  heading: { ...TYPOGRAPHY.panelHeading },
  rowLabel: { ...TYPOGRAPHY.panelLabel },
  techLabel: { ...TYPOGRAPHY.panelLabel, textAlign: "center" },
  input: { width: "60px", minWidth: "40px", "& input": { textAlign: "center" } },
  // Canvas Small (AMS:1914, 2372; parity R3 GAP-R3-1).
  message: { color: tokens.colorPaletteRedForeground1, ...TYPOGRAPHY.panelMessage },
});

export interface EditMilestonesPanelProps {
  open: boolean;
  countryName: string;
  state: PanelState;
  saving: boolean;
  /** Persistent save error (FR-8 step 4). */
  error: string | undefined;
  duplicates: string | undefined;
  onChange: (key: string, text: string) => void;
  onSave: () => void;
  /**
   * Drops the draft and closes. Cancel, ✕ and Escape reach it through `FormPanel`, which asks
   * "Discard changes?" first while `state.touched` (FR-9).
   */
  onClose: () => void;
}

export function EditMilestonesPanel({
  open, countryName, state, saving, error, duplicates, onChange, onSave, onClose,
}: EditMilestonesPanelProps) {
  const title = `Edit Milestones for ${countryName}`;

  return (
    <FormPanel
      open={open}
      title={title}
      ariaLabel={title}
      width={540}
      busy={saving}
      dirty={state.touched}
      discardText={{
        description: `Your changes to the milestone assumptions for ${countryName || "this country"} have not been saved. Discard them?`,
        cancelText: "Cancel",
        destructive: true,
        confirmIcon: "checkmark",
      }}
      onDismiss={onClose}
      // Shared C1 footer (V1: Cancel in the canvas brand outline); Cancel goes through the dirty guard.
      actions={{ onSave, canSave: state.canSave, saving }}
      messages={{ error: error ?? null, notices: duplicates ? [{ intent: "warning", text: duplicates }] : [] }}
    >
      <MatrixSection
        kind="durations"
        heading={HEADING.durations}
        rows={DURATION_FIELDS}
        columns={state.durationColumns}
        state={state}
        errors={state.durationErrors}
        disabled={saving}
        onChange={onChange}
      />
      <MatrixSection
        kind="successRates"
        heading={HEADING.successRates}
        rows={RATE_FIELDS}
        columns={state.rateColumns}
        state={state}
        errors={state.rateErrors}
        disabled={saving}
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
  const unit = kind === "durations" ? "duration in months" : "success rate";

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <Text id={headingId} className={styles.heading}>{heading}</Text>
      {columns.length === 0 ? (
        <InlineEmpty>No {kind === "durations" ? "duration" : "success-rate"} rows are stored for this country.</InlineEmpty>
      ) : (
        <div className={styles.scroller}>
          <div
            className={styles.grid}
            style={{ gridTemplateColumns: `160px repeat(${columns.length}, 64px)` }}
            role="group"
            aria-labelledby={headingId}
          >
            <span />
            {columns.map((c) => (
              <span key={c.row.id} className={styles.techLabel}>{technologyLabel(c.technology)}</span>
            ))}
            {rows.map((r) => (
              <RowInputs
                key={r.field}
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
      <div id={messageId} aria-live="polite">
        {errors.map((m) => <Text key={m} as="p" className={styles.message}>{m}</Text>)}
      </div>
    </section>
  );
}

function RowInputs({
  label, field, columns, state, unit, messageId, disabled, onChange,
}: {
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
  return (
    <>
      <span className={styles.rowLabel}>{label}</span>
      {columns.map((c) => {
        const key = cellKey(c.row.id, field);
        const cell = state.cells.get(key);
        const invalid = Boolean(cell?.error);
        return (
          <Input
            key={key}
            className={styles.input}
            value={cell?.text ?? ""}
            placeholder={cell?.placeholder}
            disabled={disabled}
            inputMode={unit === "success rate" ? "decimal" : "numeric"}
            maxLength={10}
            aria-label={`${technologyName(c.technology)} ${label} ${unit}`}
            aria-invalid={invalid}
            aria-describedby={invalid ? messageId : undefined}
            title={cell?.error}
            style={invalid ? { border: `1px solid ${ERROR_BORDER}` } : undefined}
            onChange={(_, data) => onChange(key, data.value)}
          />
        );
      })}
    </>
  );
}
