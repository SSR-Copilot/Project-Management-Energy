/**
 * Project Generators Screen — the local form controls of the panels (D143, moved verbatim from `Screen.tsx`).
 * Only the panels use them, so they travel with the lazily loaded panel chunks.
 */
import { Button, Dropdown, Option, Text, mergeClasses } from "@fluentui/react-components";
import { CheckmarkRegular, DismissRegular } from "@fluentui/react-icons";
import { FIELD_APPEARANCE, useFieldControlClass } from "@/components";
import { PANEL_BUTTONS } from "../rules";
import { useStyles } from "./styles";

/**
 * A `.canvas-field` text input: caption, red `*`, value, inline error. `ariaLabel` is the canvas
 * `AccessibleLabel` where it sets one (the control name), else the caption (rule 16).
 *
 * No red outline (no `data-invalid`): no control on the canvas screen sets a `ValidationState`, so
 * an invalid box never turns red; only its `lbl_…_ErrorMessage` shows (28 Oct 2026).
 */
export function InputField({
  label, name, ariaLabel, value, onChange, required, disabled, error, maxLength, readOnly, className,
  disabledLook,
}: {
  label: string; name: string; ariaLabel?: string; value: string; onChange?: (v: string) => void;
  required?: boolean; disabled?: boolean; error?: string | null; maxLength?: number;
  readOnly?: boolean; className?: string;
  /** `true`: the canvas `DisplayMode.Disabled` box (white, outlined, grey text), not the filled `View` one. */
  disabledLook?: boolean;
}) {
  return (
    <label className={mergeClasses("canvas-field", className)} data-display={disabledLook ? "disabled" : undefined}>
      <span data-required={required}>{label}</span>
      <input
        value={value}
        aria-label={ariaLabel ?? label}
        data-testid={name}
        aria-invalid={error ? true : undefined}
        disabled={disabled || readOnly}
        readOnly={readOnly}
        maxLength={maxLength}
        onChange={(e) => onChange?.(e.target.value)}
      />
      {error ? <span className="canvas-field-error" role="alert">{error}</span> : null}
    </label>
  );
}

export interface SelectOption { value: string; label: string }

/** A `.canvas-field` combobox — a sibling caption, never a wrapping `<label>`; no red outline (see `InputField`). */
export function SelectField({
  label, name, ariaLabel, value, options, onChange, required, disabled, error, placeholder, className,
  disabledLook,
}: {
  label: string; name: string; ariaLabel?: string; value: string | null; options: readonly SelectOption[];
  onChange: (v: string) => void; required?: boolean; disabled?: boolean;
  error?: string | null; placeholder?: string; className?: string;
  /**
   * `true`: while disabled, the canvas `ComboBox@0.0.51` `DisplayMode.Disabled` box — white, a light outline, grey
   * text (`canvas.css`, `.canvas-field[data-display="disabled"]`) — instead of the panels' filled grey.
   */
  disabledLook?: boolean;
}) {
  const s = useStyles();
  const controlClass = useFieldControlClass();
  const selected = options.find((o) => o.value === value);
  return (
    <div className={mergeClasses("canvas-field", className)} data-display={disabled && disabledLook ? "disabled" : undefined}>
      <span data-required={required}>{label}</span>
      <Dropdown
        className={mergeClasses(s.dropdown, controlClass(disabled ? "disabled" : "edit"))}
        appearance={FIELD_APPEARANCE}
        aria-label={ariaLabel ?? label}
        data-testid={name}
        placeholder={placeholder}
        disabled={disabled}
        value={selected?.label ?? ""}
        selectedOptions={value ? [value] : []}
        onOptionSelect={(_, d) => { if (d.optionValue !== undefined) onChange(d.optionValue); }}
      >
        {options.map((o) => <Option key={o.value} value={o.value}>{o.label}</Option>)}
      </Dropdown>
      {error ? <span className="canvas-field-error" role="alert">{error}</span> : null}
    </div>
  );
}

/** A `.canvas-field` multi-select combobox (`SelectMultiple: true`) — the Inverter Type field (G9). */
export function MultiSelectField({
  label, name, ariaLabel, values, options, onChange, required, disabled, error,
}: {
  label: string; name: string; ariaLabel?: string; values: readonly string[]; options: readonly SelectOption[];
  onChange: (v: string[]) => void; required?: boolean; disabled?: boolean; error?: string | null;
}) {
  const s = useStyles();
  const controlClass = useFieldControlClass();
  const text = options.filter((o) => values.includes(o.value)).map((o) => o.label).join(", ");
  return (
    <div className="canvas-field">
      <span data-required={required}>{label}</span>
      <Dropdown
        className={mergeClasses(s.dropdown, controlClass(disabled ? "disabled" : "edit"))}
        appearance={FIELD_APPEARANCE}
        multiselect
        aria-label={ariaLabel ?? label}
        data-testid={name}
        disabled={disabled}
        value={text}
        selectedOptions={[...values]}
        onOptionSelect={(_, d) => onChange(d.selectedOptions)}
      >
        {options.map((o) => <Option key={o.value} value={o.value}>{o.label}</Option>)}
      </Dropdown>
      {error ? <span className="canvas-field-error" role="alert">{error}</span> : null}
    </div>
  );
}

/** The panel footer: primary (Save / Request permission) and Cancel. */
export function PanelFooter({
  primary, primaryName, onPrimary, disabled, onCancel, cancelName, primaryTooltip, cancelTooltip, reason, hint,
}: {
  primary: string; primaryName: string; onPrimary: () => void; disabled: boolean;
  onCancel: () => void; cancelName: string; primaryTooltip?: string; cancelTooltip?: string;
  /** Why the primary button is disabled when an excluded action is behind it (D27). */
  reason?: string;
  /** The red footer label left of the buttons (`lbl_…_ErrorMessageProjectManager`), when it shows. */
  hint?: string;
}) {
  const s = useStyles();
  return (
    <>
      {hint ? (
        <Text className={s.footerHint} aria-live="polite" data-testid={`${primaryName}-hint`}>{hint}</Text>
      ) : null}
      <Button
        className={s.footerPrimary} appearance="primary" icon={<CheckmarkRegular />}
        aria-label={primary} data-testid={primaryName} disabled={disabled} onClick={onPrimary}
        title={reason ?? primaryTooltip}
      >
        {primary}
      </Button>
      <Button
        className={s.footerCancel} icon={<DismissRegular />}
        aria-label={PANEL_BUTTONS.cancel} data-testid={cancelName} onClick={onCancel}
        title={cancelTooltip}
      >
        {PANEL_BUTTONS.cancel}
      </Button>
    </>
  );
}
