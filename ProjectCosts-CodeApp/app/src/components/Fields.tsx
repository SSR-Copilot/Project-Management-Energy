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
 */
import { Field, Input, Textarea, Text, makeStyles, tokens } from "@fluentui/react-components";
import type { ReactNode } from "react";
import { space } from "@/theme/tokens";

const useStyles = makeStyles({
  counter: {
    alignSelf: "flex-end",
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  row: { display: "flex", flexDirection: "column", gap: space.xxs, minWidth: 0 },
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
}

export function TextField({
  label, value, onChange, required, error, placeholder, disabled, maxLength, testId,
}: TextFieldProps) {
  const styles = useStyles();
  return (
    <div className={styles.row}>
      <Field
        label={label}
        required={required}
        validationState={error ? "error" : "none"}
        validationMessage={error}
      >
        <Input
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={maxLength}
          onChange={(_, data) => onChange(data.value)}
          data-testid={testId}
        />
      </Field>
      {maxLength ? (
        <Text className={styles.counter}>{`${value.length}/${maxLength}`}</Text>
      ) : null}
    </div>
  );
}

export interface TextAreaFieldProps extends Omit<TextFieldProps, "placeholder"> {
  rows?: number;
}

export function TextAreaField({
  label, value, onChange, required, error, disabled, maxLength, rows = 3, testId,
}: TextAreaFieldProps) {
  const styles = useStyles();
  return (
    <div className={styles.row}>
      <Field
        label={label}
        required={required}
        validationState={error ? "error" : "none"}
        validationMessage={error}
      >
        <Textarea
          value={value}
          rows={rows}
          disabled={disabled}
          maxLength={maxLength}
          onChange={(_, data) => onChange(data.value)}
          data-testid={testId}
        />
      </Field>
      {maxLength ? (
        <Text className={styles.counter}>{`${value.length}/${maxLength}`}</Text>
      ) : null}
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

/** A read-only computed value — the canvas rendered these as disabled TextInputs. */
export function ReadOnlyField({
  label, value, testId,
}: { label: string; value: ReactNode; testId?: string }) {
  return (
    <Field label={label}>
      <Input value={String(value ?? "")} readOnly disabled data-testid={testId} />
    </Field>
  );
}
