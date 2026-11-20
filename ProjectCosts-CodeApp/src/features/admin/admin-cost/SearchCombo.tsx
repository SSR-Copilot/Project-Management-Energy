/**
 * A searchable single-select: the canvas `cmb_AdminCost_RightPanel_Form_AddCost_Fields_Category` /
 * `…_Subaccount` ComboBoxes ("Find Category" / "Find supplier"). Typing filters the options by
 * label; choosing one commits it; closing restores the label.
 *
 * `standard`: the canvas standard-assumption pair (`FontColor: themePrimary` / `FontItalic: true`,
 * CONVENTIONS rule 20) on the box AND its open list — a canvas `ComboBox` styles every option too
 * (`useStandardListboxStyles`). Fluent renders the listbox in a portal, so it takes its own class.
 */
import { useMemo, useState } from "react";
import { Combobox, mergeClasses, Option } from "@fluentui/react-components";
import { useStandardListboxStyles, useStandardValueClass, type StandardProp } from "@/components";
import type { Option as OptionItem } from "./rules";

export interface SearchComboProps {
  id?: string;
  options: readonly OptionItem[];
  value: string | null;
  placeholder: string;
  disabled?: boolean;
  ariaLabel: string;
  /** `data-testid` of the combobox input: the canvas ComboBox name. */
  testId: string;
  invalid?: boolean;
  /** The canvas standard-assumption pair on the box and its open list (rule 20). */
  standard?: StandardProp;
  onChange: (value: string | null) => void;
}

export function SearchCombo({ id, options, value, placeholder, disabled, ariaLabel, testId, invalid, standard, onChange }: SearchComboProps) {
  const [query, setQuery] = useState<string | undefined>(undefined);
  const standardClass = useStandardValueClass();
  const listbox = useStandardListboxStyles();
  const selectedLabel = options.find((o) => o.value === value)?.label ?? "";
  const filtered = useMemo(() => {
    if (!query) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);
  const className = mergeClasses(standardClass(standard));

  return (
    <Combobox
      id={id}
      {...(className ? { className } : {})}
      aria-label={ariaLabel}
      data-testid={testId}
      aria-invalid={invalid || undefined}
      placeholder={placeholder}
      disabled={disabled}
      value={query ?? selectedLabel}
      selectedOptions={value ? [value] : []}
      {...(standard ? { listbox: { className: listbox.standard } } : {})}
      onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
      onOptionSelect={(_, data) => {
        setQuery(undefined);
        onChange(data.optionValue ?? null);
      }}
      onOpenChange={(_, data) => { if (!data.open) setQuery(undefined); }}
    >
      {/* NEW — no canvas equivalent: the canvas ComboBox shows an empty list. */}
      {filtered.length === 0 ? <Option disabled value="" text="No matches">No matches</Option> : null}
      {filtered.map((o) => (
        <Option key={o.value} value={o.value} text={o.label}>{o.label}</Option>
      ))}
    </Combobox>
  );
}
