/**
 * One people field of the Approvers panel — the canvas PowerCAT PeoplePicker PCFs
 * (`pcf_Admin_ProjectGates_Approvals_Form_Fields_PortfolioManger` / `…_Approval2` / `…_Approvals` /
 * `…_Notifications`, PGAS:3080-3527; the panel passes the canvas name as `testId`), rendered with the
 * SHARED `PeoplePicker` (`@/components`, the D25 look: the selected people as chips inside one box,
 * the "Suggested People" list under it). This file owns the search (`usePeopleSearch`) and the
 * `PersonRef` ↔ `PickerPerson` mapping; the look is the shared component's (CONVENTIONS rule 17).
 *
 * Canvas parity (20 Nov 2026): the PCF `HintText` is the placeholder, its `Tooltip` the hover hint on
 * the search box (`ROLE_TOOLTIP`, rule 22). At `MaxPeople` the PCF just stops taking input — the
 * shared box disables its search input; there is NO "Maximum of N…", "Searching…" or "No matches" text.
 * SOURCE DEFECT fix kept: already-selected people are excluded from the suggestions (`pickerSuggestions`).
 * NEW (kept so a failure is not silent): a failed search says "People search failed. Try again.".
 * DIVERGENCE: the search is debounced and needs 2 characters (`usePeopleSearch`); the canvas `OnSearch`
 * searches any non-blank trimmed text.
 *
 * Keyboard: ArrowDown / ArrowUp move the highlighted suggestion, Enter adds it (the shared picker).
 * Escape closes the suggestions, and while suggestions exist the key is marked handled here
 * (`preventDefault` + `stopPropagation`), so the surrounding drawer stays open — Fluent's
 * `DialogSurface` ignores a default-prevented Escape. The typed text stays, as in the PCF.
 */
import { useMemo, useState } from "react";
import { makeStyles, Text, tokens } from "@fluentui/react-components";
import { PeoplePicker, type PickerPerson } from "@/components";
import { space } from "@/theme/tokens";
import type { PersonRef } from "@/data/adminGatesApprovals";
import { usePeopleSearch } from "./hooks";
import { pickerSuggestions } from "./rules";

/** NEW — no canvas equivalent: the PCF's `OnSearch` failure was silent. */
const SEARCH_FAILED_MESSAGE = "People search failed. Try again.";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: space.xs, minWidth: 0 },
  status: { fontSize: tokens.fontSizeBase200, lineHeight: tokens.lineHeightBase200, color: tokens.colorPaletteRedForeground1 },
});

/** Kebab test-id stem from the field caption (`Portfolio Manager` -> `portfolio-manager`), used without a `testId`. */
const testIdStem = (label: string) => label.trim().toLowerCase().replace(/\s+/g, "-");

const toPicker = (p: PersonRef): PickerPerson => ({ id: p.entraId, displayName: p.name, mail: p.mail });
const fromPicker = (p: PickerPerson): PersonRef => ({ entraId: p.id, name: p.displayName, mail: p.mail });

export interface PeoplePickerFieldProps {
  label: string;
  people: readonly PersonRef[];
  /** The PCF `MaxPeople`. */
  max: number;
  onChange: (people: PersonRef[]) => void;
  required?: boolean;
  error?: string;
  disabled?: boolean;
  /** The PCF `HintText`. */
  placeholder?: string;
  /** The PCF `Tooltip` — the search box's hover hint. */
  tooltip?: string;
  /** The search box's `data-testid`: the canvas `pcf_…` picker name. Default `people-picker-search-<label>`. */
  testId?: string;
}

export function PeoplePickerField({
  label, people, max, onChange, required, error, disabled, placeholder, tooltip, testId,
}: PeoplePickerFieldProps) {
  const styles = useStyles();
  const [term, setTerm] = useState("");
  const full = people.length >= max;
  const search = usePeopleSearch(full || disabled ? "" : term);
  const suggestions = useMemo(() => pickerSuggestions(search.data ?? [], people), [search.data, people]);
  /** The shared picker shows its list only with a term and suggestions, while not full / disabled. */
  const suggesting = term.trim().length > 0 && suggestions.length > 0 && !full && !disabled;

  /** Every person the picker can hand back, by Entra id, so a pick / removal keeps the full `PersonRef`. */
  const known = useMemo(() => {
    const map = new Map<string, PersonRef>();
    for (const p of [...people, ...suggestions]) map.set(p.entraId, p);
    return map;
  }, [people, suggestions]);

  return (
    <div
      className={styles.root}
      onKeyDown={(e) => {
        if (e.key === "Escape" && suggesting) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <PeoplePicker
        label={label}
        placeholder={placeholder ?? ""}
        {...(tooltip !== undefined ? { tooltip } : {})}
        testId={testId ?? `people-picker-search-${testIdStem(label)}`}
        value={people.map(toPicker)}
        onChange={(next) => onChange(next.map((p) => known.get(p.id) ?? fromPicker(p)))}
        // At the maximum the PCF takes no more input; the cap is re-checked here in case of a race.
        onPick={(picked) => (people.length < max ? [...people.map(toPicker), picked] : people.map(toPicker))}
        maxPeople={max}
        term={term}
        onTermChange={setTerm}
        suggestions={suggestions.map(toPicker)}
        {...(required !== undefined ? { required } : {})}
        {...(error ? { errorMessage: error } : {})}
        {...(disabled !== undefined ? { disabled } : {})}
      />
      {search.isError ? (
        <Text role="alert" className={styles.status}>{SEARCH_FAILED_MESSAGE}</Text>
      ) : null}
    </div>
  );
}
