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
import { Button, Field, Input, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
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
  root: { position: "relative", display: "flex", flexDirection: "column", rowGap: tokens.spacingVerticalXS, minWidth: 0 },
  /**
   * The `Field` grid's one column may shrink below its content: otherwise a long name's min-content
   * widened the field past its 260-px cell (290 on General Data), and the name was never cut.
   */
  field: { minWidth: 0, gridTemplateColumns: "minmax(0, 1fr)" },
  /** The PCF box: 1-px dark outline, chips and the search input on one wrapping line. */
  box: {
    boxSizing: "border-box", display: "flex", flexWrap: "wrap", alignItems: "center",
    columnGap: "4px", rowGap: "2px", minHeight: "32px", width: "100%", minWidth: 0,
    paddingTop: "2px", paddingBottom: "2px", paddingLeft: "4px", paddingRight: "4px",
    borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
    borderTopStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid", borderLeftStyle: "solid",
    ...outline(tokens.colorNeutralStrokeAccessible),
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    ":focus-within": outline(tokens.colorCompoundBrandStroke),
  },
  boxDisabled: { ...outline(tokens.colorNeutralStrokeDisabled), cursor: "not-allowed" },
  /**
   * At `MaxPeople` the box is one line: the chips and the (hidden) search box never wrap, so a long
   * name no longer pushes the search box onto a second row and doubles the box's height.
   */
  boxFull: { flexWrap: "nowrap" },
  /** The persona chip: grey pill, initials circle, name, ✕. */
  chip: {
    display: "inline-flex", alignItems: "center", columnGap: "4px", maxWidth: "100%", minWidth: 0,
    // The PCF persona: 24 px tall, 14 px name (canvas screenshot, 27 Oct 2026).
    height: "24px", paddingLeft: "1px",
    borderRadius: "12px",
    backgroundColor: tokens.colorNeutralBackground3,
    fontSize: "14px",
  },
  /** A lone person at `MaxPeople`: the chip fills the box, the name cut with "…", ✕ at its end (canvas, 3 Nov 2026). */
  chipFill: { flexGrow: 1, flexShrink: 1 },
  chipName: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flexGrow: 1 },
  // The PCF's ✕ is a 12-px glyph (canvas, 3 Nov 2026), not Fluent's 16-px small icon.
  chipRemove: { minWidth: "20px", width: "20px", height: "20px", flexShrink: 0, "& svg": { width: "12px", height: "12px" } },
  /**
   * The PCF's Fluent v8 `PersonaCoin` (size 24): a filled circle in the v8 initials colour of the name,
   * the first initial in white — the canvas draws "Azure VSB Cloud Flow Service User" in rust #8E562E.
   */
  coin: {
    display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    width: "24px", height: "24px", borderRadius: "50%",
    color: "#ffffff", fontSize: "12px", fontWeight: 600, lineHeight: "24px",
  },
  /** The suggestion list's size-32 coin. */
  coinLarge: { width: "32px", height: "32px", fontSize: "14px", lineHeight: "32px" },
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
  anchor: { position: "relative", width: "100%", minWidth: 0 },
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

/*
 * Fluent v8 `getPersonaInitialsColor` (`@fluentui/react` `PersonaInitialsColor.ts`), which the canvas
 * PCF renders with: a hash of the display name picks one of these 20 swatches, in this order.
 * Fluent v9's `Avatar color="colorful"` hashes differently, so the same person had another colour.
 */
const V8_INITIALS_COLORS = [
  "#4F6BED", "#0078D4", "#004E8C", "#038387", "#498205", "#0B6A0B", "#C239B3", "#E3008C", "#881798", "#5C2E91",
  "#CA5010", "#D13438", "#A4262C", "#8764B8", "#986F0B", "#750B1C", "#7A7574", "#005B70", "#8E562E", "#69797E",
] as const;

function v8InitialsColor(name: string): string {
  if (!name) return "#0078D4";
  let hash = 0;
  for (let i = name.length - 1; i >= 0; i--) {
    const ch = name.charCodeAt(i);
    const shift = i % 8;
    hash ^= (ch << shift) + (ch >> (8 - shift));
  }
  return V8_INITIALS_COLORS[hash % V8_INITIALS_COLORS.length]!;
}

/** The coin's single initial, as the canvas shows it. */
const initialOf = (name: string): string => name.trim().charAt(0).toUpperCase();

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
        className={mergeClasses(skin.field, s.field)}
        label={label}
        required={required}
        validationState={errorMessage ? "error" : "none"}
        validationMessage={errorMessage}
      >
        <div className={s.anchor}>
        {/* The PCF keeps its dark outline when invalid: only the message below shows the error. */}
        <div className={mergeClasses(s.box, full && s.boxFull, disabled && s.boxDisabled)}>
          {value.map((p) => (
            <span key={p.id} className={mergeClasses(s.chip, full && maxPeople === 1 && s.chipFill)} title={caption(p)}>
              <span className={s.coin} style={{ backgroundColor: v8InitialsColor(p.displayName || p.mail) }} aria-hidden="true">
                {initialOf(p.displayName || p.mail)}
              </span>
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
                  <span className={mergeClasses(s.coin, s.coinLarge)} style={{ backgroundColor: v8InitialsColor(p.displayName || p.mail) }} aria-hidden="true">
                    {initialOf(p.displayName || p.mail)}
                  </span>
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
