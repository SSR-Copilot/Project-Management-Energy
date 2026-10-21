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
 * MODERN FIELD SKIN (product owner, 20 Oct 2026, D25). The PM / Admin canvas screens use the
 * modern controls (`ModernTextInput@1.1.1`, `ModernCombobox@1.1.1`, `ModernDatePicker@1.0.1`,
 * `DropDown@0.0.45`), which render as a FILLED grey box with no outline or underline. Here that is
 * Fluent's `appearance="filled-darker"` (fill `colorNeutralBackground3` = `Grayscale30`, the canvas
 * palette) plus `useFieldSkin`:
 *  - the canvas `*` label (`lbl_…_Requered`, X 5) sits BEFORE the caption (X 20);
 *  - the `{Len}/N` counter (`lbl_…_Details`, `Align.Right`, Y 8, Size 12) sits on the caption row,
 *    right-aligned — not under the box;
 *  - `DisplayMode.View` (`readOnly`) keeps the value in normal black text in the filled box,
 *    focusable but not editable; `DisplayMode.Disabled` (`disabled`) keeps the greyed text.
 */
import {
  Field, Input, Textarea, Text, makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import { FIELD_APPEARANCE, displayModeOf, useFieldControlClass, useFieldSkin } from "./fieldSkin";
import { useStandardValueClass, type StandardProp } from "./standardValue";
import type { ReactNode } from "react";
import { space } from "@/theme/tokens";

const useStyles = makeStyles({
  /** The field cell (a screen may pad it, e.g. the PM 300-px cells). */
  row: { display: "flex", flexDirection: "column", gap: space.xxs, minWidth: 0 },
  /** Inside the cell padding: anchors the counter to the box's right edge on the caption row. */
  anchor: { position: "relative", display: "flex", flexDirection: "column", minWidth: 0 },
  /** `lbl_…_Details`: Align.Right, Y 8 → on the caption line, at its right end. */
  counter: {
    position: "absolute", top: 0, right: 0,
    lineHeight: "20px",
    color: tokens.colorNeutralForeground3,
    fontSize: "12px",
    pointerEvents: "none",
  },
  /** Keeps a long caption from running under the counter. */
  withCounter: { "& .fui-Field__label": { paddingRight: "44px" } },
});


export interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** The canvas `lbl_..._Required` asterisk. */
  required?: boolean;
  error?: string;
  placeholder?: string;
  /** Canvas `DisplayMode.Disabled` — greyed, not focusable. */
  disabled?: boolean;
  /** Canvas `DisplayMode.View` — normal text in the filled box, focusable, not editable. */
  readOnly?: boolean;
  /** Renders the `{Len}/N` counter the canvas app showed beside Note and Comment captions. */
  maxLength?: number;
  testId?: string;
  /**
   * The canvas control's literal `AccessibleLabel` when it sets one (CONVENTIONS rule 16); the
   * visible caption is used otherwise.
   */
  ariaLabel?: string;
  /** Set false to keep `maxLength` without the `{Len}/N` counter (a canvas field with no counter). */
  counter?: boolean;
  /** The canvas standard-assumption pair on the value (CONVENTIONS rule 20, `standardValue.ts`). */
  standard?: StandardProp;
  /** The canvas `Align` of the input (`Align.Right` on Latitude / Longitude). */
  align?: "left" | "right";
}

export function TextField({
  label, value, onChange, required, error, placeholder, disabled, readOnly, maxLength, testId, ariaLabel,
  counter = true, standard, align,
}: TextFieldProps) {
  const styles = useStyles();
  const skin = useFieldSkin();
  const controlClass = useFieldControlClass();
  const standardClass = useStandardValueClass();
  const showCounter = Boolean(maxLength && counter);
  return (
    <div className={styles.row}><div className={styles.anchor}>
      <Field
        className={mergeClasses(skin.field, showCounter && styles.withCounter)}
        label={label}
        required={required}
        validationState={error ? "error" : "none"}
        validationMessage={error}
      >
        <Input
          appearance={FIELD_APPEARANCE}
          className={controlClass(displayModeOf(disabled, readOnly), standardClass(standard), align)}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          maxLength={maxLength}
          onChange={(_, data) => onChange(data.value)}
          /*
           * Tosca rule 1. `Field` does associate a real `<label for>`, but the scan that
           * produced `ProjectDocs/migration-plans/09-tosca-automation-conventions.md` read
           * `AriaLabel: (empty)` off exactly this shape, so the caption is stated outright.
           * Same string as the visible label, so nothing a screen reader says changes.
           */
          aria-label={ariaLabel ?? label}
          data-testid={testId}
        />
      </Field>
      {showCounter ? (
        <Text className={styles.counter}>{`${value.length}/${maxLength}`}</Text>
      ) : null}
    </div></div>
  );
}

export interface TextAreaFieldProps extends Omit<TextFieldProps, "placeholder" | "align"> {
  rows?: number;
}

export function TextAreaField({
  label, value, onChange, required, error, disabled, readOnly, maxLength, rows = 3, testId, ariaLabel, standard,
  counter = true,
}: TextAreaFieldProps) {
  const styles = useStyles();
  const skin = useFieldSkin();
  const controlClass = useFieldControlClass();
  const standardClass = useStandardValueClass();
  const showCounter = Boolean(maxLength && counter);
  return (
    <div className={styles.row}><div className={styles.anchor}>
      <Field
        className={mergeClasses(skin.field, showCounter && styles.withCounter)}
        label={label}
        required={required}
        validationState={error ? "error" : "none"}
        validationMessage={error}
      >
        <Textarea
          appearance={FIELD_APPEARANCE}
          className={controlClass(displayModeOf(disabled, readOnly), standardClass(standard))}
          value={value}
          rows={rows}
          disabled={disabled}
          readOnly={readOnly}
          maxLength={maxLength}
          onChange={(_, data) => onChange(data.value)}
          aria-label={ariaLabel ?? label}
          data-testid={testId}
        />
      </Field>
      {showCounter ? (
        <Text className={styles.counter}>{`${value.length}/${maxLength}`}</Text>
      ) : null}
    </div></div>
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
  // control-labels-ignore: forwards testId through {...rest}; NumericField call sites are checked instead.
  return <TextField label={suffix ? `${label} [${suffix}]` : label} {...rest} />;
}

/**
 * A read-only computed value — the canvas renders these as `DisplayMode.View` TextInputs: the
 * value in normal black text in the filled box, focusable, not editable (20 Oct 2026; it used to
 * be the greyed disabled look).
 */
export function ReadOnlyField({
  label, value, testId, ariaLabel, standard, align,
}: {
  label: string; value: ReactNode; testId?: string; /** See `TextField`. */ ariaLabel?: string;
  /** The canvas standard-assumption pair on the value (CONVENTIONS rule 20). */
  standard?: StandardProp;
  /** The canvas `Align` of the input. */
  align?: "left" | "right";
}) {
  const skin = useFieldSkin();
  const controlClass = useFieldControlClass();
  const standardClass = useStandardValueClass();
  return (
    <Field label={label} className={skin.field}>
      <Input
        appearance={FIELD_APPEARANCE}
        className={controlClass("view", standardClass(standard), align)}
        value={String(value ?? "")}
        readOnly
        aria-readonly="true"
        aria-label={ariaLabel ?? label}
        data-testid={testId}
      />
    </Field>
  );
}
