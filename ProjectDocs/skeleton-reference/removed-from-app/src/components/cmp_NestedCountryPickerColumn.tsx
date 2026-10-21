/**
 * cmp_NestedCountryPickerColumn — the reusable country × child picker column.
 *
 * A port of the canvas component of the same name (Admin Contract, Admin Cost and Admin
 * Project Gates Approvals). The file keeps the canvas name so it can be found from the
 * source; the React identifier is `NestedCountryPickerColumn`, because JSX treats a
 * lower-case tag as an HTML element. `cmp_NestedCountryPickerColumn` is exported as an
 * alias for code that wants the canvas spelling.
 *
 * Canvas layout, transcribed (`.pa.yaml` properties in brackets):
 *   - the column is 200 wide [Width: 200] on white [Fill: RGBA(255,255,255,1)]
 *   - one 50 px row per country [gal_Countries.TemplateSize: 50]: a 16×16 "+"/"−" button with
 *     a 1 px RGBA(53,61,63) border and 4 px radius [Button2], an invisible spacer
 *     [Rectangle2], a 36×24 flag (+4 when selected) with a drop shadow
 *     [con_CountryFlagShadow], and the name, 14 Regular or 16 Semibold when selected
 *     [lbl_CountryName]
 *   - the selected country row is shaded RGBA(0,0,0,0.1) only while collapsed
 *     [con_CountryFlagAndLabel.Fill]
 *   - an expanded country lists its children in 35 px rows [gal_CountryNestedChilds.
 *     TemplateSize: 35], indented 40 px, drawn as a tree with RGBA(0,120,212) connector lines
 *     [Rectangle1 / Rectangle1_1]; the selected child is shaded and Semibold 16 only under
 *     the selected country [TextCanvas3]
 *
 * Behaviour lives in `cmp_NestedCountryPickerColumn.model.ts`; this file is composition.
 *
 * Accessibility. The canvas component sets no `AccessibleLabel` on any of its controls and
 * the App Checker flags them (`acc-AccessibleLabelNeeded`). The port is a WAI-ARIA tree:
 * `role="tree"` with an `aria-label`, `treeitem`s carrying `aria-expanded` / `aria-selected`
 * / `aria-level`, a labelled expander ("Expand Germany" / "Collapse Germany"), and stable
 * `data-testid`s built from the canvas control names plus the row identity — never from
 * user data.
 */
import { useState, type CSSProperties } from "react";
import { makeStyles, mergeClasses } from "@fluentui/react-components";
import { COUNTRY_FLAGS } from "./CountryRail";
import {
  DEFAULT_NESTINGS, childsOf, hasChildren, expanderGlyph, toggleExpanded, pickerOutputs,
  countryRowShaded, childEmphasised, labelSize, flagBox, spacerWidth, testIds,
  type NestedCountry, type CountryNesting, type NestedSelection,
} from "./cmp_NestedCountryPickerColumn.model";

/** Transcribed literals of the canvas component (it does not read `gblAppTheme`). */
const CANVAS = {
  /** `Fill: RGBA(255, 255, 255, 1)`. */
  fill: "rgba(255, 255, 255, 1)",
  /** `gal_Countries.BorderColor: RGBA(245, 245, 245, 1)`. */
  border: "rgba(245, 245, 245, 1)",
  /** `con_CountryFlagAndLabel.Fill` / `TextCanvas3.Fill` when selected. */
  shade: "rgba(0, 0, 0, 0.1)",
  /** `Rectangle1.Fill` — the tree connector lines. */
  line: "rgba(0, 120, 212, 1)",
  /** `Button2.BorderColor` / `.Color`. */
  buttonInk: "rgba(53, 61, 63, 1)",
  /** `Button2.HoverFill`. */
  buttonHover: "rgba(237, 237, 237, 1)",
  /** `TextCanvas4.FontColor`. */
  text: "rgba(0, 0, 0, 1)",
} as const;

const useStyles = makeStyles({
  root: {
    display: "flex", flexDirection: "column", minWidth: 0, height: "100%", overflowY: "auto",
    backgroundColor: CANVAS.fill,
    borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
    borderTopStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid", borderLeftStyle: "solid",
    borderTopColor: CANVAS.border, borderRightColor: CANVAS.border,
    borderBottomColor: CANVAS.border, borderLeftColor: CANVAS.border,
    marginTop: 0, marginBottom: 0, paddingLeft: 0,
    listStyleType: "none",
  },
  countryRow: {
    display: "flex", alignItems: "center", height: "50px", paddingLeft: "8px",
    cursor: "pointer", color: CANVAS.text,
  },
  shaded: { backgroundColor: CANVAS.shade },
  expander: {
    flex: "none", width: "16px", height: "16px", padding: 0, lineHeight: "14px",
    fontSize: "12px", fontFamily: "'Segoe UI', sans-serif", cursor: "pointer",
    color: CANVAS.buttonInk, backgroundColor: "transparent",
    borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
    borderTopStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid", borderLeftStyle: "solid",
    borderTopColor: CANVAS.buttonInk, borderRightColor: CANVAS.buttonInk,
    borderBottomColor: CANVAS.buttonInk, borderLeftColor: CANVAS.buttonInk,
    borderTopLeftRadius: "4px", borderTopRightRadius: "4px",
    borderBottomLeftRadius: "4px", borderBottomRightRadius: "4px",
    ":hover": { backgroundColor: CANVAS.buttonHover },
  },
  flag: {
    flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center",
    boxShadow: "0 1.6px 3.6px rgba(0,0,0,0.13), 0 0.3px 0.9px rgba(0,0,0,0.11)",
    fontSize: "18px", lineHeight: 1, overflow: "hidden",
  },
  name: {
    paddingLeft: "8px", width: "132px", minWidth: 0,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  childList: { margin: 0, padding: 0, listStyleType: "none" },
  childRow: {
    position: "relative", display: "flex", alignItems: "center", height: "35px",
    paddingLeft: "40px", cursor: "pointer", color: CANVAS.text, whiteSpace: "nowrap",
  },
  vLine: { position: "absolute", left: "16px", top: "-19px", width: "1px", height: "38px", backgroundColor: CANVAS.line },
  hLine: { position: "absolute", left: "16px", top: "17px", width: "16px", height: "1px", backgroundColor: CANVAS.line },
});

export interface NestedCountryPickerColumnProps {
  /** `Countries` — order is the caller's (build it with `defaultCountries` for the canvas default). */
  countries: readonly NestedCountry[];
  /** `Nestings` — defaults to `DEFAULT_NESTINGS` (Wind, PV for the six default countries). */
  nestings?: readonly CountryNesting[];
  /** Controlled selection. Omit both for an uncontrolled picker. */
  selectedCountryKey?: string | null;
  selectedNestedValue?: string | null;
  /** Controlled expansion (`Expanded` in `col_cmpCountryPickerItems`). */
  expandedKeys?: readonly string[];
  onExpandedChange?: (keys: string[]) => void;
  /**
   * `OnSelect` — fired on a country row, a child row, or the +/− button, exactly where the
   * canvas calls `cmp_NestedCountryPickerColumn.OnSelect()`. Carries the two outputs.
   */
  onSelect?: (out: { selectedCountry: NestedCountry | null; selectedNestedValue: string | null }) => void;
  /** `Width: 200`. */
  width?: number;
  ariaLabel?: string;
}

export function NestedCountryPickerColumn({
  countries,
  nestings = DEFAULT_NESTINGS,
  selectedCountryKey,
  selectedNestedValue,
  expandedKeys,
  onExpandedChange,
  onSelect,
  width = 200,
  ariaLabel = "Country",
}: NestedCountryPickerColumnProps) {
  const s = useStyles();
  const [innerSel, setInnerSel] = useState<NestedSelection>({ countryKey: null, nestedValue: null });
  const [innerExpanded, setInnerExpanded] = useState<string[]>([]);

  const controlled = selectedCountryKey !== undefined;
  const sel: NestedSelection = controlled
    ? { countryKey: selectedCountryKey ?? null, nestedValue: selectedNestedValue ?? null }
    : innerSel;
  const expanded = expandedKeys ?? innerExpanded;
  const outputs = pickerOutputs(countries, nestings, sel);

  const select = (next: NestedSelection) => {
    if (!controlled) setInnerSel(next);
    onSelect?.(pickerOutputs(countries, nestings, next));
  };
  /**
   * `Button2.OnSelect`. A control inside a canvas gallery template also makes its row the
   * gallery's `Selected` item, so the +/− click selects that country too (keeping a child
   * already clicked under it), then fires `cmp_NestedCountryPickerColumn.OnSelect()`.
   */
  const toggle = (key: string) => {
    const next = toggleExpanded(expanded, key);
    if (!expandedKeys) setInnerExpanded(next);
    onExpandedChange?.(next);
    select({ countryKey: key, nestedValue: sel.countryKey === key ? sel.nestedValue : null });
  };

  return (
    <ul
      className={s.root}
      role="tree"
      aria-label={ariaLabel}
      data-testid={testIds.root}
      style={{ width: `${width}px` } as CSSProperties}
    >
      {countries.map((c) => {
        const isSel = outputs.selectedCountry?.key === c.key;
        const isExp = expanded.includes(c.key);
        const kids = childsOf(nestings, c.name);
        const showButton = hasChildren(nestings, c.name);
        const box = flagBox(isSel);
        return (
          <li
            key={c.key}
            role="treeitem"
            aria-level={1}
            aria-selected={isSel}
            aria-expanded={showButton ? isExp : undefined}
            aria-label={c.name}
          >
            <div
              className={mergeClasses(s.countryRow, countryRowShaded(isSel, isExp) && s.shaded)}
              data-testid={testIds.countryRow(c.key)}
              onClick={() => select({ countryKey: c.key, nestedValue: null })}
            >
              {showButton && (
                <button
                  type="button"
                  className={s.expander}
                  aria-label={`${isExp ? "Collapse" : "Expand"} ${c.name}`}
                  aria-expanded={isExp}
                  data-testid={testIds.expander(c.key)}
                  onClick={(e) => { e.stopPropagation(); toggle(c.key); }}
                >
                  {expanderGlyph(isExp)}
                </button>
              )}
              <span aria-hidden="true" style={{ width: `${spacerWidth(showButton, isSel)}px`, flex: "none" }} />
              <span
                className={s.flag}
                aria-hidden="true"
                style={{ width: `${box.width}px`, height: `${box.height}px` }}
              >
                {c.flag ?? COUNTRY_FLAGS[c.name] ?? ""}
              </span>
              <span
                className={s.name}
                style={{ fontSize: `${labelSize(isSel)}px`, fontWeight: isSel ? 600 : 400 }}
              >
                {c.name}
              </span>
            </div>

            {isExp && kids.length > 0 && (
              <ul className={s.childList} role="group">
                {kids.map((k) => {
                  const emph = childEmphasised(isSel, outputs.selectedNestedValue === k.value);
                  return (
                    <li
                      key={k.value}
                      role="treeitem"
                      aria-level={2}
                      aria-selected={emph}
                      aria-label={`${c.name} ${k.value}`}
                      className={mergeClasses(s.childRow, emph && s.shaded)}
                      data-testid={testIds.childRow(c.key, k.value)}
                      style={{ fontSize: `${labelSize(emph)}px`, fontWeight: emph ? 600 : 400 }}
                      onClick={() => select({ countryKey: c.key, nestedValue: k.value })}
                    >
                      <span className={s.vLine} aria-hidden="true" />
                      <span className={s.hLine} aria-hidden="true" />
                      {k.value}
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The canvas spelling, for callers porting a formula that names the component. */
export const cmp_NestedCountryPickerColumn = NestedCountryPickerColumn;
