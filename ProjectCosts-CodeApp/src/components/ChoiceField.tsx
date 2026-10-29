/**
 * A labelled Fluent `Dropdown` in the shared MODERN FIELD SKIN (`fieldSkin.ts`) — the canvas
 * `DropDown@0.0.45` / `ModernDropdown` / `ComboBox@0.0.51` / `ModernCombobox` (single select)
 * as one control. Promoted from General Data's own `ChoiceField` in the modern controls sweep
 * (20 Oct 2026, D35 §6) so every PM screen's dropdowns look the same (rule 17).
 *
 *  - the filled grey box, no outline; the `*` before the caption; the canvas error label under it;
 *  - `readOnly` = canvas `DisplayMode.View` (the value in black, the list never opens, and no
 *    chevron — the canvas shows a View-mode dropdown as plain text in the box);
 *    `disabled` = `DisplayMode.Disabled` (greyed);
 *  - `standard`: the canvas standard-assumption pair via `useStandardValueClass` (rule 20);
 *  - `multiselect` (`SelectMultiple: true`): `values` + `onSelectMany`; the text is the chosen
 *    labels joined with ", ".
 *
 * Identity (rule 16): `testId` is the canvas control name (`data-testid`); `ariaLabel` is the
 * canvas `AccessibleLabel` where it sets one, the caption otherwise. Both gate scripts know it.
 */
import { Dropdown, Field, Option, makeStyles, mergeClasses } from "@fluentui/react-components";
import { FIELD_APPEARANCE, displayModeOf, useFieldControlClass, useFieldSkin } from "./fieldSkin";
import { useStandardValueClass, type StandardProp } from "./standardValue";

const useStyles = makeStyles({
  /** Fluent's `Dropdown` ships a 250-px `minWidth`; the canvas box is its cell's width. */
  dropdown: { minWidth: "0px", width: "100%" },
});

export interface ChoiceOption { value: string; label: string }

export interface ChoiceFieldProps {
  /** The caption; "" renders no caption row (a box in a table cell). */
  label: string;
  /** The canvas `AccessibleLabel` (rule 16); the caption when the canvas sets none. */
  ariaLabel?: string;
  testId: string;
  required?: boolean;
  error?: string | null;
  /** Canvas `DisplayMode.Disabled`. */
  disabled?: boolean;
  /** Canvas `DisplayMode.View`. */
  readOnly?: boolean;
  /** The selected value ("" / null = none). */
  value?: string | null;
  /** The shown text when the value is not one of the options (the canvas Default can be). */
  valueLabel?: string;
  options: readonly ChoiceOption[];
  onSelect?: (value: string | null) => void;
  placeholder?: string;
  /** The canvas standard-assumption pair on the selected text (rule 20). */
  standard?: StandardProp;
  /** `SelectMultiple: true`. */
  multiselect?: boolean;
  /** The selected values of a `multiselect` box. */
  values?: readonly string[];
  onSelectMany?: (values: string[]) => void;
  /** Extra class on the `Field`. */
  className?: string;
  /** Opt-in: a class on the open list (a screen's canvas list look). */
  listboxClassName?: string;
}

export function ChoiceField({
  label, ariaLabel, testId, required, error, disabled = false, readOnly, value, valueLabel, options,
  onSelect, placeholder, standard, multiselect, values, onSelectMany, className, listboxClassName,
}: ChoiceFieldProps) {
  const s = useStyles();
  const skin = useFieldSkin();
  const controlClass = useFieldControlClass();
  const standardClass = useStandardValueClass();
  const mode = displayModeOf(disabled, readOnly);
  const view = mode === "view";
  const selected = multiselect ? [...(values ?? [])] : value ? [value] : [];
  const text = multiselect
    ? options.filter((o) => selected.includes(o.value)).map((o) => o.label).join(", ")
    : options.find((o) => o.value === value)?.label ?? valueLabel ?? "";
  return (
    <Field
      className={mergeClasses(skin.field, className)}
      label={label || undefined}
      required={required}
      validationState={error ? "error" : "none"}
      validationMessage={error || undefined}
    >
      <Dropdown
        appearance={FIELD_APPEARANCE}
        className={mergeClasses(s.dropdown, controlClass(mode, standardClass(standard)))}
        aria-label={ariaLabel ?? label}
        aria-readonly={view || undefined}
        data-testid={testId}
        disabled={disabled}
        placeholder={placeholder}
        multiselect={multiselect}
        {...(listboxClassName ? { listbox: { className: listboxClassName } } : {})}
        {...(view ? { open: false, expandIcon: null } : {})}
        value={text}
        selectedOptions={selected}
        onOptionSelect={(_, d) => {
          if (multiselect) onSelectMany?.(d.selectedOptions);
          else onSelect?.(d.optionValue ?? null);
        }}
      >
        {options.map((o) => <Option key={o.value} value={o.value}>{o.label}</Option>)}
      </Dropdown>
    </Field>
  );
}
