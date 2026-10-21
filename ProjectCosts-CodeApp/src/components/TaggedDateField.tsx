/**
 * A labelled date picker whose input text is formatted by the caller and which shows a short tag
 * (e.g. "Plan" / "Actual") beside it.
 *
 * Built for the Planning permit panel (D31 L3), where the canvas `DatePicker@0.0.46` uses
 * `Format: 'DatePickerCanvas.Format'.LongAbbreviated` ("Mon, Oct 19, 2026"), which a native
 * `<input type="date">` cannot show. The format and the tag text come from the screen's
 * `rules.ts`; this component only lays them out. Since the modern controls sweep (20 Oct 2026) the
 * box itself is the shared `DateInput` (filled grey, calendar icon right, Monday first, rule 17).
 *
 * Not wrapped in a `<label>` (as `CostSelect`): the picker's popup would swallow the click. The
 * caption is a sibling `<span>` with the `.canvas-field` styling, and `name` — the canvas control
 * name — goes on both `aria-label` and `data-testid` (CONVENTIONS rule 16, as `CostField`).
 */
import { Badge, makeStyles } from "@fluentui/react-components";
import { dateFromIso, DATE_PICKER_FORMAT } from "@/domain/canvasDate";
import { DateInput } from "./DateField";
import type { StandardProp } from "./standardValue";

const useStyles = makeStyles({
  row: { display: "flex", alignItems: "center", gap: "8px" },
  picker: { flexGrow: 1, minWidth: 0 },
});

export function TaggedDateField({ label, name, value, onChange, formatDate, tag, tagTestId, required, disabled, error, standard }: {
  label: string;
  /** The canvas control name — `aria-label` and `data-testid`. */
  name: string;
  value: Date | null;
  onChange: (value: Date | null) => void;
  /** The input text for a selected date (pure, from `rules.ts`). */
  formatDate: (date: Date | null | undefined) => string;
  /** The tag text; nothing is rendered while it is "". */
  tag: string;
  /** `data-testid` of the tag. */
  tagTestId: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  /** The canvas standard-assumption pair on the date text (CONVENTIONS rule 20). */
  standard?: StandardProp;
}) {
  const styles = useStyles();
  return <div className="canvas-field" data-invalid={error ? true : undefined}>
    {label ? <span data-required={required}>{label}</span> : null}
    <div className={styles.row}>
      {/* No `IsEditable` on these canvas pickers: the calendar sets the date. */}
      <DateInput
        className={styles.picker}
        name={name}
        value={value}
        format={DATE_PICKER_FORMAT}
        formatDate={formatDate}
        allowTextInput={false}
        disabled={disabled}
        invalid={Boolean(error)}
        standard={standard}
        onChange={(v) => onChange(dateFromIso(v))}
      />
      {tag ? <Badge appearance="tint" color="brand" data-testid={tagTestId}>{tag}</Badge> : null}
    </div>
    {error ? <span className="canvas-field-error" role="alert">{error}</span> : null}
  </div>;
}
