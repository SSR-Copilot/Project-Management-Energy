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
 *
 * APPLICATION SETTINGS OPTIONS. Every prop marked "Settings" below is OPTIONAL and, left out, gives exactly the
 * field above. The Application Settings panels use them: `skin="plain"` is their look (Fluent's default outlined
 * input, counter under the field, a read-only field disabled by default); `counter="hint"` / `"none"` /
 * `"text"`, `countMode="powerFxTrim"`, `hint`, `contentBefore` / `contentAfter`, `inputMode`, `onBlur`, `id`,
 * `labelWeight`, `inputClassName`, `errorClassName`, `validationIcon={null}`, `rows="auto"` and `resize`.
 */
import {
  Field, Input, Textarea, Text, makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import { FIELD_APPEARANCE, displayModeOf, useFieldControlClass, useFieldSkin } from "./fieldSkin";
import { useStandardValueClass, type StandardProp } from "./standardValue";
import type { ReactNode } from "react";
import { powerFxTrim } from "@/domain/powerFx";
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
  /** Settings: `counter` below the field (`skin="plain"` default, or `counter="text"`). */
  counterBelow: {
    alignSelf: "flex-end",
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  /** Settings: `labelWeight="semibold"`. */
  semibold: { fontWeight: tokens.fontWeightSemibold },
});

/** Where the `{Len}/N` counter goes. */
type CounterPlace = "caption" | "below" | "hint" | "none";

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
   * visible caption is used otherwise. `null` (Settings) also means the caption.
   */
  ariaLabel?: string | null;
  /**
   * Where the `{Len}/N` counter goes when `maxLength` is set. `true` / omitted: on the caption row
   * (`skin="canvas"`) or under the field (`skin="plain"`). `false` / `"none"`: no counter (a canvas field with
   * no counter). Settings: `"text"` forces it under the field; `"hint"` puts it in the Field hint.
   */
  counter?: boolean | "text" | "hint" | "none";
  /** The canvas standard-assumption pair on the value (CONVENTIONS rule 20, `standardValue.ts`). */
  standard?: StandardProp;
  /** The canvas `Align` of the input (`Align.Right` on Latitude / Longitude). */
  align?: "left" | "right";
  /**
   * Settings: `"canvas"` (default) is the modern filled skin above; `"plain"` is the Application Settings
   * panels' look: Fluent's default input, no caption-row counter and no display-mode classes.
   */
  skin?: "canvas" | "plain";
  /** Settings: field hint text (joined with a `counter="hint"` count when both are present). */
  hint?: ReactNode;
  /** Settings: content inside the input before / after the text (CAPEX "<parent>_", Contracts "%" / currency). */
  contentBefore?: ReactNode;
  contentAfter?: ReactNode;
  /** Settings. */
  inputMode?: "text" | "numeric" | "decimal";
  /** Settings. */
  onBlur?: () => void;
  /** Settings: the input's `id`. */
  id?: string;
  /** Settings: `"powerFxTrim"` counts `Len(Trim(value))` (Contracts' comment). Default `"raw"`. */
  countMode?: "raw" | "powerFxTrim";
  /** Settings. */
  labelWeight?: "regular" | "semibold";
  /** Settings: an extra class on the input. */
  inputClassName?: string;
  /** Settings: class for the validation message (Costs: 12 px). */
  errorClassName?: string;
  /** Settings: `null` hides the validation icon (Costs). */
  validationIcon?: null;
}

/** The pieces both skins and both controls share. */
function fieldParts(p: TextFieldProps, semiboldClass: string) {
  const plain = p.skin === "plain";
  const count = p.countMode === "powerFxTrim" ? powerFxTrim(p.value).length : p.value.length;
  const counterText = p.maxLength ? `${count}/${p.maxLength}` : undefined;
  let place: CounterPlace = "none";
  if (counterText !== undefined && p.counter !== false && p.counter !== "none") {
    if (p.counter === "hint") place = "hint";
    else if (p.counter === "text") place = "below";
    else place = plain ? "below" : "caption";
  }
  const hint = place === "hint"
    ? (p.hint !== undefined ? <>{p.hint} {counterText}</> : counterText)
    : p.hint;
  return {
    plain,
    place,
    counterText,
    field: {
      label: p.labelWeight === "semibold" ? { children: p.label, className: semiboldClass } : p.label,
      required: p.required,
      validationState: p.error ? "error" as const : "none" as const,
      validationMessage: p.error && p.errorClassName ? { children: p.error, className: p.errorClassName } : p.error,
      ...(p.validationIcon === null ? { validationMessageIcon: null } : {}),
      ...(hint !== undefined ? { hint: { children: hint } } : {}),
    },
    /* Rule 16: the input always states its name; `ariaLabel={null}` falls back to the caption. */
    ariaLabel: p.ariaLabel ?? p.label,
    attrs: {
      ...(p.id !== undefined ? { id: p.id } : {}),
      ...(p.onBlur ? { onBlur: p.onBlur } : {}),
    },
  };
}

export function TextField(props: TextFieldProps) {
  const {
    value, onChange, placeholder, disabled, readOnly, maxLength, testId, standard, align,
    contentBefore, contentAfter, inputMode, inputClassName,
  } = props;
  const styles = useStyles();
  const skin = useFieldSkin();
  const controlClass = useFieldControlClass();
  const standardClass = useStandardValueClass();
  const parts = fieldParts(props, styles.semibold);
  const className = parts.plain
    ? mergeClasses(standardClass(standard), inputClassName)
    : controlClass(displayModeOf(disabled, readOnly), inputClassName ? mergeClasses(standardClass(standard), inputClassName) : standardClass(standard), align);
  const input = (
    <Input
      {...(parts.plain ? {} : { appearance: FIELD_APPEARANCE })}
      {...(className ? { className } : {})}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readOnly}
      maxLength={maxLength}
      onChange={(_, data) => onChange(data.value)}
      {...(contentBefore !== undefined ? { contentBefore: { children: contentBefore } } : {})}
      {...(contentAfter !== undefined ? { contentAfter: { children: contentAfter } } : {})}
      {...(inputMode ? { inputMode } : {})}
      {...parts.attrs}
      /*
       * Tosca rule 1. `Field` does associate a real `<label for>`, but the scan that
       * produced `ProjectDocs/migration-plans/09-tosca-automation-conventions.md` read
       * `AriaLabel: (empty)` off exactly this shape, so the caption is stated outright.
       * Same string as the visible label, so nothing a screen reader says changes.
       */
      aria-label={parts.ariaLabel}
      data-testid={testId}
    />
  );
  if (parts.plain) {
    return (
      <div className={styles.row}>
        <Field {...parts.field}>{input}</Field>
        {parts.place === "below" ? <Text className={styles.counterBelow}>{parts.counterText}</Text> : null}
      </div>
    );
  }
  return (
    <div className={styles.row}><div className={styles.anchor}>
      <Field
        className={mergeClasses(skin.field, parts.place === "caption" && styles.withCounter)}
        {...parts.field}
      >
        {input}
      </Field>
      {parts.place === "caption" ? <Text className={styles.counter}>{parts.counterText}</Text> : null}
      {parts.place === "below" ? <Text className={styles.counterBelow}>{parts.counterText}</Text> : null}
    </div></div>
  );
}

export interface TextAreaFieldProps extends Omit<TextFieldProps, "placeholder" | "align" | "contentBefore" | "contentAfter"> {
  /**
   * Visible rows; default 3. Settings: `"auto"` renders no `rows` attribute, so the browser default
   * (2) applies — Contracts' comment as it was before the shared field.
   */
  rows?: number | "auto";
  /** Settings: textarea resize (Contracts' comment: "vertical"). Omitted = Fluent's default. */
  resize?: "none" | "horizontal" | "vertical" | "both";
}

export function TextAreaField(props: TextAreaFieldProps) {
  const {
    value, onChange, disabled, readOnly, maxLength, rows = 3, testId, standard, resize, inputMode, inputClassName,
  } = props;
  const styles = useStyles();
  const skin = useFieldSkin();
  const controlClass = useFieldControlClass();
  const standardClass = useStandardValueClass();
  const parts = fieldParts(props, styles.semibold);
  const className = parts.plain
    ? mergeClasses(standardClass(standard), inputClassName)
    : controlClass(displayModeOf(disabled, readOnly), inputClassName ? mergeClasses(standardClass(standard), inputClassName) : standardClass(standard));
  const area = (
    <Textarea
      {...(parts.plain ? {} : { appearance: FIELD_APPEARANCE })}
      {...(className ? { className } : {})}
      value={value}
      {...(rows === "auto" ? {} : { rows })}
      disabled={disabled}
      readOnly={readOnly}
      maxLength={maxLength}
      onChange={(_, data) => onChange(data.value)}
      {...(resize ? { resize } : {})}
      {...(inputMode ? { inputMode } : {})}
      {...parts.attrs}
      aria-label={parts.ariaLabel}
      data-testid={testId}
    />
  );
  if (parts.plain) {
    return (
      <div className={styles.row}>
        <Field {...parts.field}>{area}</Field>
        {parts.place === "below" ? <Text className={styles.counterBelow}>{parts.counterText}</Text> : null}
      </div>
    );
  }
  return (
    <div className={styles.row}><div className={styles.anchor}>
      <Field
        className={mergeClasses(skin.field, parts.place === "caption" && styles.withCounter)}
        {...parts.field}
      >
        {area}
      </Field>
      {parts.place === "caption" ? <Text className={styles.counter}>{parts.counterText}</Text> : null}
      {parts.place === "below" ? <Text className={styles.counterBelow}>{parts.counterText}</Text> : null}
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

export interface ReadOnlyFieldProps {
  label: string; value: ReactNode; testId?: string;
  /** See `TextField`. */
  ariaLabel?: string | null;
  /** The canvas standard-assumption pair on the value (CONVENTIONS rule 20). */
  standard?: StandardProp;
  /** The canvas `Align` of the input. */
  align?: "left" | "right";
  /** Settings: the required asterisk (CAPEX "Category" / "Main Account"). */
  required?: boolean;
  /**
   * Settings: a disabled (greyed, unfocusable) read-only input. Default `false` for `skin="canvas"` (the
   * `DisplayMode.View` look above) and `true` for `skin="plain"` (Settings' default). `false` on `plain`
   * renders a read-only, NOT disabled input with `aria-readonly` (Costs' period drawer).
   */
  disabled?: boolean;
  /**
   * Settings: a validation message under the field (`validationState="error"`); omitted = none.
   * Project Gates' always-read-only Gate field shows "The cluster cannot be blank.".
   */
  error?: string;
  /** Settings: `"plain"` = Fluent's default input (see `TextField`). Default `"canvas"`. */
  skin?: "canvas" | "plain";
}

/**
 * A read-only computed value — the canvas renders these as `DisplayMode.View` TextInputs: the
 * value in normal black text in the filled box, focusable, not editable (20 Oct 2026; it used to
 * be the greyed disabled look).
 */
export function ReadOnlyField({
  label, value, testId, ariaLabel, standard, align, required, disabled, error, skin: skinName = "canvas",
}: ReadOnlyFieldProps) {
  const skin = useFieldSkin();
  const controlClass = useFieldControlClass();
  const standardClass = useStandardValueClass();
  const plain = skinName === "plain";
  const isDisabled = disabled ?? plain;
  const fieldProps = {
    label,
    ...(required ? { required: true } : {}),
    ...(error ? { validationState: "error" as const, validationMessage: error } : {}),
  };
  const shown = String(value ?? "");
  // Disabled: greyed and unfocusable. Otherwise read-only and focusable, announced as read-only.
  const mode = isDisabled ? { disabled: true } : { "aria-readonly": plain ? true : "true" as const };
  if (plain) {
    const className = mergeClasses(standardClass(standard));
    return (
      <Field {...fieldProps}>
        <Input
          {...(className ? { className } : {})}
          value={shown}
          readOnly
          {...mode}
          aria-label={ariaLabel ?? label}
          data-testid={testId}
        />
      </Field>
    );
  }
  return (
    <Field {...fieldProps} className={skin.field}>
      <Input
        appearance={FIELD_APPEARANCE}
        className={controlClass(isDisabled ? "disabled" : "view", standardClass(standard), align)}
        value={shown}
        readOnly
        {...mode}
        aria-label={ariaLabel ?? label}
        data-testid={testId}
      />
    </Field>
  );
}
