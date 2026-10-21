/**
 * The canvas `cat_PowerCAT.PeoplePicker` PCF, as a controlled search box + suggestion list +
 * selected personas with a remove (×) button.
 *
 * Look (product owner, 20 Oct 2026, D25): as the PCF renders it — ONE box with a dark 1-px outline;
 * each selected person is a chip INSIDE the box (initials avatar circle + name + ✕), followed by
 * the search input. The full `Name (mail)` stays on the chip's tooltip.
 *
 * The caller owns the search: it passes the typed `term` back in and the `suggestions` it found
 * (the PCF's `OnSearch` / `Suggestions_Items`). At `maxPeople` (the PCF's `MaxPeople`) the search
 * box is disabled until someone is removed. Every control carries an `aria-label` and a
 * `data-testid` derived from `testId` (rule 16).
 */
import { Avatar, Button, Field, Input, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";
import { useFieldSkin } from "./fieldSkin";

export interface PickerPerson {
  id: string;
  displayName: string;
  mail: string;
}

export interface PeoplePickerProps {
  label: string;
  placeholder: string;
  /** The PCF `Tooltip`. */
  tooltip?: string;
  /** The canvas control name; suggestions and remove buttons append `-suggestion-<id>` / `-remove-<id>`. */
  testId: string;
  value: PickerPerson[];
  onChange: (next: PickerPerson[]) => void;
  /** Called when a suggestion is picked; return the new selection (caps / de-duplication). */
  onPick: (picked: PickerPerson) => PickerPerson[];
  maxPeople: number;
  term: string;
  onTermChange: (term: string) => void;
  suggestions: PickerPerson[];
  required?: boolean;
  /** The validation message shown under the field, when set. */
  errorMessage?: string;
  disabled?: boolean;
  /** Accessible name of the remove buttons. */
  removeLabel?: string;
  /** The canvas PCF's literal `AccessibilityLabel` for the search box; the caption otherwise. */
  ariaLabel?: string;
}

const outline = (color: string) => ({
  borderTopColor: color, borderRightColor: color, borderBottomColor: color, borderLeftColor: color,
});

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalXS, minWidth: 0 },
  /** The PCF box: 1-px dark outline, chips and the search input on one wrapping line. */
  box: {
    boxSizing: "border-box", display: "flex", flexWrap: "wrap", alignItems: "center",
    columnGap: "4px", rowGap: "2px", minHeight: "32px", width: "100%",
    paddingTop: "2px", paddingBottom: "2px", paddingLeft: "4px", paddingRight: "4px",
    borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
    borderTopStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid", borderLeftStyle: "solid",
    ...outline(tokens.colorNeutralStrokeAccessible),
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    ":focus-within": outline(tokens.colorCompoundBrandStroke),
  },
  boxDisabled: { ...outline(tokens.colorNeutralStrokeDisabled), cursor: "not-allowed" },
  boxError: outline(tokens.colorPaletteRedBorder2),
  /** The persona chip: grey pill, initials circle, name, ✕. */
  chip: {
    display: "inline-flex", alignItems: "center", columnGap: "4px", maxWidth: "100%", minWidth: 0,
    height: "24px", paddingLeft: "2px",
    borderRadius: "12px",
    backgroundColor: tokens.colorNeutralBackground3,
    fontSize: tokens.fontSizeBase200,
  },
  chipName: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 },
  chipRemove: { minWidth: "20px", width: "20px", height: "20px" },
  /** The search input, borderless inside the box. */
  search: {
    flex: "1 1 60px", minWidth: "60px",
    backgroundColor: "transparent",
    borderTopColor: "transparent", borderRightColor: "transparent",
    borderBottomColor: "transparent", borderLeftColor: "transparent",
    "::after": { content: "unset" },
    ":hover": { borderTopColor: "transparent", borderRightColor: "transparent", borderBottomColor: "transparent", borderLeftColor: "transparent" },
    ":focus-within": { borderTopColor: "transparent", borderRightColor: "transparent", borderBottomColor: "transparent", borderLeftColor: "transparent" },
  },
  /** At `MaxPeople` the PCF shows no search text box; ours stays (disabled) but takes no room. */
  searchFull: { flex: "0 0 0px", minWidth: 0, width: 0, paddingLeft: 0, paddingRight: 0, overflow: "hidden" },
  list: { display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalXXS },
  suggestion: { justifyContent: "flex-start" },
});

const caption = (p: PickerPerson): string => `${p.displayName} (${p.mail})`;

export function PeoplePicker({
  label, placeholder, tooltip, testId, value, onChange, onPick, maxPeople, term, onTermChange,
  suggestions, required, errorMessage, disabled, removeLabel = "Remove", ariaLabel,
}: PeoplePickerProps) {
  const s = useStyles();
  const skin = useFieldSkin();
  const full = value.length >= maxPeople;
  return (
    <div className={s.root}>
      <Field
        className={skin.field}
        label={label}
        required={required}
        validationState={errorMessage ? "error" : "none"}
        validationMessage={errorMessage}
      >
        <div className={mergeClasses(s.box, disabled && s.boxDisabled, errorMessage && s.boxError)}>
          {value.map((p) => (
            <span key={p.id} className={s.chip} title={caption(p)}>
              <Avatar name={p.displayName || p.mail} size={20} color="colorful" aria-hidden="true" />
              <span className={s.chipName}>{p.displayName || p.mail}</span>
              <Button
                appearance="transparent"
                size="small"
                className={s.chipRemove}
                icon={<DismissRegular />}
                disabled={disabled}
                aria-label={removeLabel}
                data-testid={`${testId}-remove-${p.id}`}
                onClick={() => onChange(value.filter((x) => x.id !== p.id))}
              />
            </span>
          ))}
          <Input
            className={mergeClasses(s.search, full && s.searchFull)}
            value={term}
            placeholder={full ? undefined : placeholder}
            title={tooltip}
            disabled={disabled || full}
            aria-label={ariaLabel ?? label}
            data-testid={testId}
            onChange={(_, d) => onTermChange(d.value)}
          />
        </div>
      </Field>
      {!disabled && !full && suggestions.length > 0 ? (
        <div className={s.list} role="listbox" aria-label={label}>
          {suggestions.map((p) => (
            <Button
              key={p.id}
              appearance="subtle"
              size="small"
              className={s.suggestion}
              aria-label={caption(p)}
              data-testid={`${testId}-suggestion-${p.id}`}
              onClick={() => { onChange(onPick(p)); onTermChange(""); }}
            >
              {caption(p)}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
