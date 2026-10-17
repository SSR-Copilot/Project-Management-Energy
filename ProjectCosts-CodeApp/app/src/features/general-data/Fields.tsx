/**
 * Field primitives specific to General Data: a numeric-key dropdown (Technology, Development
 * Type, …) and the Project Manager / Deputy Project Manager people-picker. Everything else on
 * this screen is `@/components`'s shared `TextField`/`NumericField`/`ReadOnlyField`.
 */
import { useState } from "react";
import {
  Button, Combobox, Field, Dropdown, Option, Input, makeStyles, tokens,
} from "@fluentui/react-components";
import { DismissRegular, SearchRegular } from "@fluentui/react-icons";
import type { PersonOption } from "@/features/project-overview/rules";

const useStyles = makeStyles({
  dropdown: { minWidth: "0px", width: "100%" },
  combobox: { minWidth: "0px", width: "100%" },
  pickerWrap: { position: "relative" },
  suggestions: {
    position: "absolute", zIndex: 10, top: "100%", left: 0, right: 0,
    margin: 0, marginTop: "2px", padding: "4px 0",
    listStyle: "none",
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    boxShadow: tokens.shadow8,
    maxHeight: "240px", overflowY: "auto",
  },
  suggestion: {
    display: "block", width: "100%", textAlign: "left",
    padding: "6px 12px", border: "none", backgroundColor: "transparent", cursor: "pointer",
    fontSize: tokens.fontSizeBase300,
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
});

/** A single key/label option, as every option-set field on this screen uses. */
export interface ChoiceOption {
  value: number;
  label: string;
}

export interface SelectFieldProps {
  label: string;
  value: number | null;
  options: readonly ChoiceOption[];
  onChange: (value: number | null) => void;
  required?: boolean;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
}

export function SelectField({
  label, value, options, onChange, required, error, disabled, placeholder = "Select…",
}: SelectFieldProps) {
  const styles = useStyles();
  const selected = options.find((o) => o.value === value);
  return (
    <Field
      label={label} required={required}
      validationState={error ? "error" : "none"} validationMessage={error}
    >
      <Dropdown
        className={styles.dropdown}
        aria-label={label}
        placeholder={placeholder}
        disabled={disabled}
        selectedOptions={selected ? [String(selected.value)] : []}
        value={selected?.label ?? ""}
        onOptionSelect={(_, d) => {
          if (d.optionValue === undefined) { onChange(null); return; }
          onChange(Number(d.optionValue));
        }}
      >
        {options.map((o) => (
          <Option key={o.value} value={String(o.value)}>{o.label}</Option>
        ))}
      </Dropdown>
    </Field>
  );
}

/** One entry in the Germany or France municipality list. */
export interface MunicipalityOption {
  /** The municipality name — stored in `vsb_municipality`. */
  name: string;
  /** Germany only: the trade tax rate auto-populated into `vsb_taxfactor`. */
  taxRate?: number;
}

export interface MunicipalityComboboxProps {
  label: string;
  value: string;
  options: readonly MunicipalityOption[];
  /** Called when the user selects from the list OR types a free-form value. */
  onSelect: (name: string, taxRate: number | undefined) => void;
  required?: boolean;
  error?: string;
  disabled?: boolean;
}

/**
 * Municipality picker for Germany and France — a searchable combobox that also allows free
 * entry when no option matches.
 *
 * PHASE 5 NOTE: `options` is wired to an empty array until the data source for Germany/France
 * municipality lists is confirmed (see `08-code-app-shortcomings-and-fix-plan.md` Step 5.1).
 * Once the data source is resolved, wire `options` to the corresponding hook and the combobox
 * will show the predefined list; for Germany, `taxRate` auto-populates the Tax Factor field.
 */
export function MunicipalityCombobox({
  label, value, options, onSelect, required, error, disabled,
}: MunicipalityComboboxProps) {
  const styles = useStyles();
  return (
    <Field
      label={label} required={required}
      validationState={error ? "error" : "none"} validationMessage={error}
    >
      <Combobox
        className={styles.combobox}
        freeform
        value={value}
        selectedOptions={options.some((o) => o.name === value) ? [value] : []}
        disabled={disabled}
        placeholder="Search or type a municipality…"
        onOptionSelect={(_, d) => {
          const match = options.find((o) => o.name === d.optionValue);
          onSelect(d.optionValue ?? "", match?.taxRate);
        }}
        onChange={(e) => {
          const typed = (e.target as HTMLInputElement).value;
          const match = options.find((o) => o.name === typed);
          onSelect(typed, match?.taxRate);
        }}
      >
        {options.map((o) => (
          <Option key={o.name} value={o.name}>{o.name}</Option>
        ))}
      </Combobox>
    </Field>
  );
}

export interface PersonPickerFieldProps {
  label: string;
  personId: string | null;
  personName: string;
  query: string;
  onQueryChange: (term: string) => void;
  suggestions: readonly PersonOption[];
  onSelect: (person: PersonOption) => void;
  onClear: () => void;
  required?: boolean;
  error?: string;
  disabled?: boolean;
}

/**
 * The same typeahead shape as `project-overview/Screen.tsx`'s Project Manager filter, applied
 * here to an EDITABLE field rather than a filter: typing searches Entra users, selecting one
 * sets both the id (what is saved) and the display name (what is shown once closed).
 */
export function PersonPickerField({
  label, personId, personName, query, onQueryChange, suggestions, onSelect, onClear,
  required, error, disabled,
}: PersonPickerFieldProps) {
  const styles = useStyles();
  const [focused, setFocused] = useState(false);
  const showSuggestions = focused && !personId && query.trim().length >= 2;

  return (
    <Field
      label={label} required={required}
      validationState={error ? "error" : "none"} validationMessage={error}
    >
      <div className={styles.pickerWrap}>
        <Input
          value={personId ? personName : query}
          disabled={disabled}
          placeholder="Search by name or email…"
          contentBefore={<SearchRegular />}
          contentAfter={personId ? (
            <Button
              appearance="transparent" size="small" icon={<DismissRegular />}
              aria-label={`Clear ${label}`}
              onClick={() => { onClear(); onQueryChange(""); }}
            />
          ) : undefined}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 150)}
          onChange={(_, data) => { if (!personId) onQueryChange(data.value); }}
          aria-label={label}
        />
        {showSuggestions ? (
          <ul className={styles.suggestions} aria-label={`Suggested ${label}`}>
            {suggestions.length === 0 ? (
              <li className={styles.suggestion} aria-disabled="true">No matches</li>
            ) : suggestions.map((p) => (
              <li key={p.id}>
                <button
                  type="button" className={styles.suggestion}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { onSelect(p); setFocused(false); }}
                >
                  {p.label}{p.mail ? ` — ${p.mail}` : ""}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Field>
  );
}
