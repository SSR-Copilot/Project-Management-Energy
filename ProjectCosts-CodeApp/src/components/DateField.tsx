/**
 * The shared MODERN DATE FIELD (modern controls sweep, 20 Oct 2026, D35 §6) — the canvas
 * `ModernDatePicker@1.0.1` / `DatePicker@0.0.46` as one control, in the modern field skin of
 * `Fields.tsx` (`fieldSkin.ts`): the filled grey box with no outline, the calendar icon at the
 * right, the `*` before the caption.
 *
 *  - `format`: the control's own canvas `Format` (`domain/canvasDate.ts`) — `"LongDate"` for a
 *    `ModernDatePicker` with no Format, `"LongAbbreviated"` for a `DatePicker@0.0.46` with none
 *    or `LongAbbreviated`, `"dd.mm.yyyy"` for that literal. Never a native `<input type="date">`,
 *    which cannot show any of them.
 *  - `StartOfWeek: Monday` on every PM picker → `firstDayOfWeek` Monday.
 *  - `IsEditable: true` → `allowTextInput` (typing a date is possible, parsed by
 *    `parseCanvasDate`); otherwise only the calendar sets it.
 *  - `readOnly` = `DisplayMode.View` (the text in black in the grey box, focusable, the calendar
 *    never opens); `disabled` = `DisplayMode.Disabled` (greyed).
 *  - `standard`: the canvas standard-assumption pair (blue + italic) via the shared
 *    `useStandardValueClass` (CONVENTIONS rule 20).
 *  - The value is a stored date (`YYYY-MM-DD`, or a date-time whose date part is used) or a
 *    `Date`; `onChange` gets the picked LOCAL date as `YYYY-MM-DD` (`dateOnly`, rule 18).
 *
 * Identity (rule 16): `name` is the canvas control name on BOTH `data-testid` and `aria-label`
 * (as `CostField`) — the usual case, where the canvas `AccessibleLabel` is the control name. Pass
 * `testId` + `ariaLabel` instead where they differ. Both scripts know these props
 * (`check-control-labels.mjs` `PRIMITIVE_PROPS`, `check-canvas-identities.mjs` `NAME_PRIMITIVES`).
 *
 * `DateInput` is the bare box, for a screen that lays out its own caption row (a gallery cell, the
 * General Data cluster panel with its CalendarAdd button); `DateField` adds the Fluent `Field`.
 */
import { useCallback, useMemo } from "react";
import { Field, Input, mergeClasses } from "@fluentui/react-components";
import { DatePicker } from "@fluentui/react-datepicker-compat";
import { CalendarMonthRegular } from "@fluentui/react-icons";
import { dateOnly } from "@/data/odata";
import { dateFromIso, formatCanvasDate, parseCanvasDate, type CanvasDateFormat } from "@/domain/canvasDate";
import { FIELD_APPEARANCE, displayModeOf, useFieldControlClass, useFieldSkin } from "./fieldSkin";
import { useStandardValueClass, type StandardProp } from "./standardValue";

/** `StartOfWeek.Monday` / `"Monday"` — Fluent's `DayOfWeek.Monday`. */
const MONDAY = 1;

export interface DateInputProps {
  /** The stored date (`YYYY-MM-DD` / an ISO date-time) or a `Date`; blank = no date. */
  value: string | Date | null | undefined;
  /** The picked local date as `YYYY-MM-DD`, or null when cleared. */
  onChange?: (value: string | null) => void;
  /** The control's canvas `Format`. */
  format: CanvasDateFormat;
  /** Overrides `format` with a screen's own pure formatter (e.g. Planning's `permitInputDate`). */
  formatDate?: (date: Date | null | undefined) => string;
  /** The language for the long / abbreviated texts; `en-US` by default. */
  locale?: string;
  placeholder?: string;
  /** Canvas `DisplayMode.Disabled`. */
  disabled?: boolean;
  /** Canvas `DisplayMode.View`. */
  readOnly?: boolean;
  /** Canvas `IsEditable` (typing allowed). True by default — every PM picker sets it except a few. */
  allowTextInput?: boolean;
  /** The canvas standard-assumption pair on the date text (rule 20). */
  standard?: StandardProp;
  /** The canvas control name — `data-testid` and `aria-label`. */
  name?: string;
  /** `data-testid` when it differs from `name`. */
  testId?: string;
  /** `aria-label` when it differs from `name` (the canvas `AccessibleLabel`). */
  ariaLabel?: string;
  /** Marks the box invalid (the caller shows the message). */
  invalid?: boolean;
  className?: string;
}

const toDate = (value: DateInputProps["value"]): Date | null =>
  value instanceof Date ? (Number.isNaN(value.getTime()) ? null : value) : dateFromIso(value);

export function DateInput({
  value, onChange, format, formatDate, locale = "en-US", placeholder, disabled, readOnly,
  allowTextInput = true, standard, name, testId, ariaLabel, invalid, className,
}: DateInputProps) {
  const controlClass = useFieldControlClass();
  const standardClass = useStandardValueClass();
  // Stable identities: the picker re-formats its text whenever `value` or `formatDate` changes,
  // which would wipe a date being typed on every parent render.
  const key = value instanceof Date ? value.getTime() : value ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const date = useMemo(() => toDate(value), [key]);
  const text = useCallback(
    (d: Date | null | undefined) => (formatDate ? formatDate(d) : formatCanvasDate(d, format, locale)),
    [formatDate, format, locale],
  );
  const mode = displayModeOf(disabled, readOnly);
  const label = ariaLabel ?? name;
  const id = testId ?? name;
  const classes = mergeClasses(controlClass(mode, standardClass(standard)), className);
  if (mode === "view") {
    // `DisplayMode.View`: the text in the grey box, the icon shown, nothing to open.
    return (
      <Input
        appearance={FIELD_APPEARANCE}
        className={classes}
        value={text(date)}
        placeholder={placeholder}
        readOnly
        aria-readonly="true"
        contentAfter={<CalendarMonthRegular aria-hidden />}
        aria-label={label}
        data-testid={id}
      />
    );
  }
  return (
    <DatePicker
      appearance={FIELD_APPEARANCE}
      className={classes}
      value={date}
      placeholder={placeholder}
      disabled={disabled}
      allowTextInput={allowTextInput}
      formatDate={text}
      parseDateFromString={parseCanvasDate}
      firstDayOfWeek={MONDAY}
      onSelectDate={(d: Date | null | undefined) => onChange?.(d ? dateOnly(d) : null)}
      aria-invalid={invalid || undefined}
      aria-label={label}
      data-testid={id}
    />
  );
}

export interface DateFieldProps extends DateInputProps {
  /** The caption (the canvas `lbl_…` / `ModernText` beside the picker). */
  label: string;
  /** The canvas `lbl_…_Requered` asterisk — drawn BEFORE the caption by the skin. */
  required?: boolean;
  /** The canvas error label under the box. */
  error?: string;
  /** Extra class on the `Field` (e.g. a screen's 300-px cell). */
  fieldClassName?: string;
}

export function DateField({ label, required, error, fieldClassName, ...input }: DateFieldProps) {
  const skin = useFieldSkin();
  return (
    <Field
      className={mergeClasses(skin.field, fieldClassName)}
      label={label}
      required={required}
      validationState={error ? "error" : "none"}
      validationMessage={error}
    >
      {/* control-labels-ignore: DateInput is labelled by the DateField call site's name / ariaLabel. */}
      <DateInput {...input} ariaLabel={input.ariaLabel ?? input.name ?? label} invalid={Boolean(error)} />
    </Field>
  );
}
