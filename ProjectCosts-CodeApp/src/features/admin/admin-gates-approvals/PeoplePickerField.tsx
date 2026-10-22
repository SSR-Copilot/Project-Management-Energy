/**
 * A multi-person picker over enabled Entra accounts (replaces the PowerCAT PeoplePicker).
 * Already-selected people are excluded from the suggestions (the canvas de-dup compared a column
 * that did not exist).
 *
 * Keyboard access: built on Fluent `Combobox` (freeform) so the search box is a real
 * ARIA combobox with a listbox of options. Focus stays in the input while ArrowUp/ArrowDown
 * move the active option (`aria-activedescendant`), so moving "into" the list can never
 * dismiss it; Enter adds the active person; Esc closes the suggestion list and Fluent stops the
 * event there, so the surrounding drawer stays open. The listbox renders inline (`inlinePopup`)
 * to stay inside the drawer's focus trap. The selected people stay a dismissible `TagGroup`.
 */
import { useId, useState } from "react";
import {
  Combobox, Field, makeStyles, Option, Spinner, Tag, TagGroup, Text, tokens,
} from "@fluentui/react-components";
import { SearchRegular } from "@fluentui/react-icons";
import { space } from "@/theme/tokens";
import type { PersonRef } from "@/data/adminGatesApprovals";
import { usePeopleSearch } from "./hooks";
import { pickerSuggestions } from "./rules";

const useStyles = makeStyles({
  wrap: { position: "relative", display: "flex", flexDirection: "column", rowGap: space.xs },
  tags: { flexWrap: "wrap", rowGap: space.xs },
  combobox: { width: "100%", minWidth: "0px" },
  listbox: { maxHeight: "240px" },
  status: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  hint: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  mail: { color: tokens.colorNeutralForeground3 },
});

/** Kebab test-id stem from the field caption (`Portfolio Manager` -> `portfolio-manager`). */
const testIdStem = (label: string) => label.trim().toLowerCase().replace(/\s+/g, "-");

export interface PeoplePickerFieldProps {
  label: string;
  people: readonly PersonRef[];
  max: number;
  onChange: (people: PersonRef[]) => void;
  required?: boolean;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
}

export function PeoplePickerField({
  label, people, max, onChange, required, error, disabled, placeholder,
}: PeoplePickerFieldProps) {
  const styles = useStyles();
  const statusId = useId();
  const [query, setQuery] = useState("");
  const [wantOpen, setWantOpen] = useState(false);
  const full = people.length >= max;
  const search = usePeopleSearch(full ? "" : query);
  const suggestions = pickerSuggestions(search.data ?? [], people);
  const searching = !full && query.trim().length >= 2;
  const open = wantOpen && searching && suggestions.length > 0 && !disabled;

  let status = "";
  if (searching) {
    if (search.isError) status = "People search failed. Try again.";
    else if (search.isFetching && suggestions.length === 0) status = "Searching…";
    else if (search.isSuccess && suggestions.length === 0) status = "No matches";
  }

  const add = (entraId: string | undefined) => {
    const person = suggestions.find((p) => p.entraId === entraId);
    if (person && people.length < max) onChange([...people, person]);
    setQuery("");
    setWantOpen(false);
  };

  return (
    <Field
      label={label} required={required}
      validationState={error ? "error" : "none"} validationMessage={error}
    >
      <div className={styles.wrap}>
        {people.length > 0 ? (
          <TagGroup
            className={styles.tags}
            aria-label={`Selected ${label}`}
            onDismiss={(_, data) => onChange(people.filter((p) => p.entraId !== data.value))}
          >
            {people.map((p) => (
              <Tag
                key={p.entraId} value={p.entraId} size="small" shape="circular"
                dismissible={!disabled}
                dismissIcon={{ "aria-label": `Remove ${p.name}` }}
                secondaryText={p.mail || undefined}
                disabled={disabled}
              >
                {p.name || p.mail || p.entraId}
              </Tag>
            ))}
          </TagGroup>
        ) : null}
        {!full ? (
          <Combobox
            className={styles.combobox}
            listbox={{ className: styles.listbox, "aria-label": `Suggested ${label}` }}
            freeform
            inlinePopup
            value={query}
            selectedOptions={[]}
            open={open}
            disabled={disabled}
            placeholder={placeholder ?? "Search by name or email…"}
            aria-label={`Search ${label}`}
            data-testid={`people-picker-search-${testIdStem(label)}`}
            aria-describedby={status ? statusId : undefined}
            expandIcon={search.isFetching ? <Spinner size="extra-tiny" aria-label="Searching" /> : <SearchRegular />}
            onOpenChange={(_, d) => setWantOpen(d.open)}
            onChange={(e) => {
              setQuery(e.target.value);
              setWantOpen(true);
            }}
            onOptionSelect={(_, d) => add(d.optionValue)}
          >
            {suggestions.map((p) => (
              <Option key={p.entraId} value={p.entraId} text={p.name || p.mail}>
                {p.name}{p.mail ? <span className={styles.mail}>&nbsp;— {p.mail}</span> : null}
              </Option>
            ))}
          </Combobox>
        ) : (
          <Text className={styles.hint}>Maximum of {max} {max === 1 ? "person" : "people"} reached.</Text>
        )}
        {status ? (
          <Text
            id={statusId}
            className={styles.status}
            role={search.isError ? "alert" : "status"}
          >
            {status}
          </Text>
        ) : null}
      </div>
    </Field>
  );
}
