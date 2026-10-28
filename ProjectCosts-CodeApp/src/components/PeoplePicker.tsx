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
import { useState } from "react";
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

const noBorder = outline("transparent");

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
  /**
   * The search input, borderless inside the box. The `Field` marks it invalid, and Fluent's red
   * invalid border (`:not(:focus-within)`) out-ranks a plain class, so it is cleared on the same
   * selectors. No inner padding / min-height either, so the hint sits ~7 px in from the outline and
   * the box stays 32 px tall, as the PCF renders it (PO, 22 Oct 2026: New Project).
   */
  search: {
    flex: "1 1 60px", minWidth: "60px", minHeight: "26px",
    paddingLeft: 0, paddingRight: 0,
    backgroundColor: "transparent",
    ...noBorder,
    "::after": { content: "unset" },
    ":hover": noBorder,
    ":focus-within": noBorder,
    ":not(:focus-within)": noBorder,
    ":hover:not(:focus-within)": noBorder,
    // Fluent's focus / hover / pressed states each repaint the border; with no border width there
    // is never a second box inside the PCF's outline.
    borderTopWidth: 0, borderRightWidth: 0, borderBottomWidth: 0, borderLeftWidth: 0,
    "& input": { paddingLeft: "2px", paddingRight: "2px", outlineStyle: "none" },
  },
  /** At `MaxPeople` the PCF shows no search text box; ours stays (disabled) but takes no room. */
  searchFull: { flex: "0 0 0px", minWidth: 0, width: 0, paddingLeft: 0, paddingRight: 0, overflow: "hidden" },
  /** The box and its suggestions callout, which is positioned against it. */
  anchor: { position: "relative", width: "100%" },
  /**
   * The PCF's suggestions callout (Fluent v8 `PeoplePicker`): floats over the form under the box,
   * as wide as it, white with a shadow — it never pushes the fields below it down.
   */
  callout: {
    position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 1000,
    display: "flex", flexDirection: "column",
    paddingBottom: "4px",
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow16, borderRadius: tokens.borderRadiusMedium,
  },
  /** "Suggested People", in the theme blue. */
  calloutHeader: {
    paddingTop: "10px", paddingBottom: "6px", paddingLeft: "12px", paddingRight: "12px",
    fontSize: tokens.fontSizeBase200, lineHeight: tokens.lineHeightBase200,
    color: tokens.colorBrandForeground1,
  },
  /** One persona row: initials avatar, then the name over the mail, both cut with an ellipsis. */
  suggestion: {
    display: "flex", alignItems: "center", columnGap: "8px", width: "100%", minHeight: "48px",
    paddingTop: "4px", paddingBottom: "4px", paddingLeft: "12px", paddingRight: "12px",
    borderTopWidth: 0, borderRightWidth: 0, borderBottomWidth: 0, borderLeftWidth: 0,
    backgroundColor: "transparent", textAlign: "left", cursor: "pointer",
    fontFamily: "inherit", color: tokens.colorNeutralForeground1,
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  suggestionActive: {
    backgroundColor: tokens.colorNeutralBackground1Selected,
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Selected },
  },
  /** Up to 7 people (48-px rows) in view; more matches scroll inside the callout. */
  suggestionList: { maxHeight: `${7 * 48}px`, overflowY: "auto" },
  suggestionText: { display: "flex", flexDirection: "column", minWidth: 0 },
  suggestionName: {
    fontSize: tokens.fontSizeBase300, lineHeight: tokens.lineHeightBase300,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  suggestionMail: {
    fontSize: tokens.fontSizeBase200, lineHeight: tokens.lineHeightBase200,
    color: tokens.colorNeutralForeground3,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
});

/** The PCF callout's header text. */
const SUGGESTIONS_HEADER = "Suggested People";

const caption = (p: PickerPerson): string => `${p.displayName} (${p.mail})`;

export function PeoplePicker({
  label, placeholder, tooltip, testId, value, onChange, onPick, maxPeople, term, onTermChange,
  suggestions, required, errorMessage, disabled, removeLabel = "Remove", ariaLabel,
}: PeoplePickerProps) {
  const s = useStyles();
  const skin = useFieldSkin();
  const full = value.length >= maxPeople;
  /** The callout opens on focus / typing and closes on blur, Escape or a pick. */
  const [open, setOpen] = useState(false);
  /** The highlighted suggestion — the first one, as the PCF opens. */
  const [active, setActive] = useState(0);
  const shown = open && !disabled && !full && suggestions.length > 0;
  const current = Math.min(active, suggestions.length - 1);
  const pick = (p: PickerPerson) => {
    onChange(onPick(p));
    onTermChange("");
    setOpen(false);
  };
  return (
    <div className={s.root}>
      <Field
        className={skin.field}
        label={label}
        required={required}
        validationState={errorMessage ? "error" : "none"}
        validationMessage={errorMessage}
      >
        <div className={s.anchor}>
        {/* The PCF keeps its dark outline when invalid: only the message below shows the error. */}
        <div className={mergeClasses(s.box, disabled && s.boxDisabled)}>
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
            onChange={(_, d) => { onTermChange(d.value); setOpen(true); setActive(0); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={(e) => {
              if (!shown) return;
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((current + 1) % suggestions.length); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((current - 1 + suggestions.length) % suggestions.length); }
              else if (e.key === "Enter") { e.preventDefault(); pick(suggestions[current]!); }
              else if (e.key === "Escape") { setOpen(false); }
            }}
          />
        </div>
        {shown ? (
          <div className={s.callout}>
            <span className={s.calloutHeader}>{SUGGESTIONS_HEADER}</span>
            <div role="listbox" aria-label={label} className={s.suggestionList}>
              {suggestions.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={i === current}
                  className={mergeClasses(s.suggestion, i === current && s.suggestionActive)}
                  aria-label={caption(p)}
                  title={caption(p)}
                  data-testid={`${testId}-suggestion-${p.id}`}
                  // Keeps the focus in the search box, so its blur does not close the callout first.
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(p)}
                >
                  <Avatar name={p.displayName || p.mail} size={32} color="colorful" aria-hidden="true" />
                  <span className={s.suggestionText}>
                    <span className={s.suggestionName}>{p.displayName || p.mail}</span>
                    <span className={s.suggestionMail}>{p.mail}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        </div>
      </Field>
    </div>
  );
}
