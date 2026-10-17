/**
 * The canvas field pattern, as real form controls.
 *
 * Every editable field on the Cost screens is the same four-control cluster:
 *   `con_..._Fields_Label_N`  container
 *     `lbl_..._ErrorMessage`  a Label whose Text is the validation message and whose
 *                             Visible is a second, separately-written predicate
 *     `txt_...`               the TextInput
 *     `lbl_...`               the caption
 *     `lbl_..._Required`      a Label containing "*"
 *
 * Splitting the message from its visibility is what produced defect D-3 (the Costs Until
 * Closing / Plan field's message tests the *Actual* field) and D-4 (a blank required field
 * shows nothing while still disabling Save). Here one `error` prop drives both, and the
 * message is wired to the input with `aria-describedby` via Fluent's `Field`, so a screen
 * reader announces it — which nothing in the canvas app did.
 *
 * Reusable-components Wave A (E4 / E5): every prop below the original ones is OPTIONAL and
 * defaults to today's output, so the project screens (general data, report a problem) render
 * exactly as before. The settings panels use them to keep their current looks:
 *   - `counter="hint"` puts `{n}/{max}` in the Field hint (Check List Settings, Contracts);
 *     `counter="none"` hides it (Costs' 30-character description); `countMode="powerFxTrim"`
 *     counts `Len(Trim(value))` (Contracts' comment).
 *   - `contentBefore` / `contentAfter` (CAPEX "<parent>_", Contracts "%" / currency),
 *     `inputMode`, `onBlur`, `id`, `readOnly`.
 *   - `ariaLabel` overrides the input's aria-label; `null` omits it (the Field label alone names
 *     the input, as Contracts has it today).
 *   - `labelWeight="semibold"`, `inputClassName`, `errorClassName`, `validationIcon={null}`
 *     (Costs hides the icon and styles the message).
 */
import { Field, Input, Textarea, Text, makeStyles, tokens } from "@fluentui/react-components";
import type { ReactNode } from "react";
import { powerFxTrim } from "@/domain/powerFx";
import { space } from "@/theme/tokens";

const useStyles = makeStyles({
  counter: {
    alignSelf: "flex-end",
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  row: { display: "flex", flexDirection: "column", gap: space.xxs, minWidth: 0 },
  semibold: { fontWeight: tokens.fontWeightSemibold },
});

export interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** The canvas `lbl_..._Required` asterisk. */
  required?: boolean;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Renders the `{Len}/N` counter the canvas app showed under Note and Comment. */
  maxLength?: number;
  testId?: string;
  /* ── E4 (all optional; defaults = today's output) ── */
  /** Field hint text (joined with a `counter="hint"` count when both are present). */
  hint?: ReactNode;
  contentBefore?: ReactNode;
  contentAfter?: ReactNode;
  inputMode?: "text" | "numeric" | "decimal";
  onBlur?: () => void;
  /** The input's aria-label. Default = `label`; `null` = no aria-label (the Field label names it). */
  ariaLabel?: string | null;
  id?: string;
  /** Where the `{n}/{max}` counter goes when `maxLength` is set. Default `"text"` (below the field). */
  counter?: "text" | "hint" | "none";
  /** `"powerFxTrim"` counts `Len(Trim(value))` (Contracts' comment). Default `"raw"`. */
  countMode?: "raw" | "powerFxTrim";
  labelWeight?: "regular" | "semibold";
  inputClassName?: string;
  /** Class for the validation message (Costs: 12 px). */
  errorClassName?: string;
  /** `null` hides the validation icon (Costs). */
  validationIcon?: null;
  readOnly?: boolean;
}

/** The Field props shared by TextField / TextAreaField. */
function fieldProps(p: TextFieldProps, semiboldClass: string) {
  const count = p.countMode === "powerFxTrim" ? powerFxTrim(p.value).length : p.value.length;
  const counterText = p.maxLength ? `${count}/${p.maxLength}` : undefined;
  const counterInHint = p.counter === "hint" && counterText !== undefined;
  const hint = counterInHint
    ? (p.hint !== undefined ? <>{p.hint} {counterText}</> : counterText)
    : p.hint;
  return {
    field: {
      label: p.labelWeight === "semibold" ? { children: p.label, className: semiboldClass } : p.label,
      required: p.required,
      validationState: p.error ? "error" as const : "none" as const,
      validationMessage: p.error && p.errorClassName ? { children: p.error, className: p.errorClassName } : p.error,
      ...(p.validationIcon === null ? { validationMessageIcon: null } : {}),
      ...(hint !== undefined ? { hint: { children: hint } } : {}),
    },
    /** The counter below the field (today's look), unless moved to the hint or hidden. */
    textCounter: counterText !== undefined && (p.counter ?? "text") === "text" ? counterText : undefined,
    control: {
      ...(p.ariaLabel === null ? {} : { "aria-label": p.ariaLabel ?? p.label }),
      ...(p.id !== undefined ? { id: p.id } : {}),
      ...(p.onBlur ? { onBlur: p.onBlur } : {}),
      ...(p.readOnly ? { readOnly: true } : {}),
      ...(p.inputClassName ? { className: p.inputClassName } : {}),
    },
  };
}

export function TextField(props: TextFieldProps) {
  const { value, onChange, placeholder, disabled, maxLength, testId, contentBefore, contentAfter, inputMode } = props;
  const styles = useStyles();
  const { field, textCounter, control } = fieldProps(props, styles.semibold);
  return (
    <div className={styles.row}>
      <Field {...field}>
        <Input
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={maxLength}
          onChange={(_, data) => onChange(data.value)}
          {...(contentBefore !== undefined ? { contentBefore: { children: contentBefore } } : {})}
          {...(contentAfter !== undefined ? { contentAfter: { children: contentAfter } } : {})}
          {...(inputMode ? { inputMode } : {})}
          /*
           * Tosca rule 1. `Field` does associate a real `<label for>`, but the scan that
           * produced `migration-plans/09-tosca-automation-conventions.md` read
           * `AriaLabel: (empty)` off exactly this shape, so the caption is stated outright.
           * Same string as the visible label, so nothing a screen reader says changes.
           */
          {...control}
          data-testid={testId}
        />
      </Field>
      {textCounter ? <Text className={styles.counter}>{textCounter}</Text> : null}
    </div>
  );
}

export interface TextAreaFieldProps extends Omit<TextFieldProps, "placeholder" | "contentBefore" | "contentAfter"> {
  /**
   * Visible rows; default 3. Wave C: `"auto"` renders no `rows` attribute, so the browser default
   * (2) applies — Contracts' comment as it was before the shared field.
   */
  rows?: number | "auto";
  /** Textarea resize (Contracts' comment: "vertical"). Omitted = Fluent's default. */
  resize?: "none" | "horizontal" | "vertical" | "both";
}

export function TextAreaField(props: TextAreaFieldProps) {
  const { value, onChange, disabled, maxLength, rows = 3, testId, resize, inputMode } = props;
  const styles = useStyles();
  const { field, textCounter, control } = fieldProps(props, styles.semibold);
  return (
    <div className={styles.row}>
      <Field {...field}>
        <Textarea
          value={value}
          {...(rows === "auto" ? {} : { rows })}
          disabled={disabled}
          maxLength={maxLength}
          onChange={(_, data) => onChange(data.value)}
          {...(resize ? { resize } : {})}
          {...(inputMode ? { inputMode } : {})}
          {...control}
          data-testid={testId}
        />
      </Field>
      {textCounter ? <Text className={styles.counter}>{textCounter}</Text> : null}
    </div>
  );
}

/**
 * A numeric field that stays a STRING in state.
 *
 * The canvas app kept every number as the raw `TextInput.Value` and parsed it only at
 * validation and save time, which is why "1," and "1." are valid intermediate states while
 * typing. Storing a `number` here instead would fight the user's keystrokes — and would lose
 * the distinction between "empty" and "zero" that `parseNumber` is careful to preserve.
 */
export interface NumericFieldProps extends TextFieldProps {
  /** Shown in the label as `Total Costs [EUR]`. */
  suffix?: string;
}

export function NumericField({ label, suffix, ...rest }: NumericFieldProps) {
  return <TextField label={suffix ? `${label} [${suffix}]` : label} {...rest} />;
}

export interface ReadOnlyFieldProps {
  label: string;
  value: ReactNode;
  testId?: string;
  /** E5: the required asterisk (CAPEX "Category" / "Main Account"). */
  required?: boolean;
  /**
   * E5: default `true` (today's disabled look). `false` renders a read-only, NOT disabled input
   * with `aria-readonly` (Costs' period drawer).
   */
  disabled?: boolean;
  /**
   * Wave C: a validation message under the field (`validationState="error"`); omitted = none.
   * Project Gates' always-read-only Gate field shows "The cluster cannot be blank." (G-2).
   */
  error?: string;
}

/** A read-only computed value — the canvas rendered these as disabled TextInputs. */
export function ReadOnlyField({ label, value, testId, required, disabled = true, error }: ReadOnlyFieldProps) {
  return (
    <Field
      label={label}
      {...(required ? { required: true } : {})}
      {...(error ? { validationState: "error" as const, validationMessage: error } : {})}
    >
      <Input
        value={String(value ?? "")}
        readOnly
        {...(disabled ? { disabled: true } : { "aria-readonly": true })}
        aria-label={label}
        data-testid={testId}
      />
    </Field>
  );
}
