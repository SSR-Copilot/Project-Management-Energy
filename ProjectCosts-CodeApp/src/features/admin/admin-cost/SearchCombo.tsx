/**
 * A searchable single-select: the canvas `cmb_AdminCost_RightPanel_Form_AddCost_Fields_Category` /
 * `…_Subaccount` ComboBoxes ("Find Category" / "Find supplier"). Typing filters the options by
 * label; choosing one commits it; closing restores the label.
 */
import { useMemo, useState } from "react";
import { Combobox, Option } from "@fluentui/react-components";
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
  onChange: (value: string | null) => void;
}

export function SearchCombo({ id, options, value, placeholder, disabled, ariaLabel, testId, invalid, onChange }: SearchComboProps) {
  const [query, setQuery] = useState<string | undefined>(undefined);
  const selectedLabel = options.find((o) => o.value === value)?.label ?? "";
  const filtered = useMemo(() => {
    if (!query) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <Combobox
      id={id}
      aria-label={ariaLabel}
      data-testid={testId}
      aria-invalid={invalid || undefined}
      placeholder={placeholder}
      disabled={disabled}
      value={query ?? selectedLabel}
      selectedOptions={value ? [value] : []}
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
