/**
 * The shared Country / Technology picker (M6) — canvas `cmp_NestedCountryPickerColumn`.
 *
 * One implementation for Project Gates, Costs and Contracts. It is CONTROLLED and reads no
 * data: the screen passes the list (`pickerCountries` with its `CountryRule`), the technologies
 * and the selection (`useCountryTechnologySelection` / `…UrlSelection`). What each screen passes
 * today (all three render the same canvas look; only the interaction differs):
 *
 *   | prop                          | Project Gates      | Costs                | Contracts |
 *   |-------------------------------|--------------------|----------------------|-----------|
 *   | `flag`                        | default "flag"     | default "flag"       | default   |
 *   | `countryClick`                | "select"           | default "none" (text)| default   |
 *   | `compact`                     | default false      | default false        | default   |
 *   | `highlightCollapsedSelection` | true               | —                    | —         |
 *   | `toggleLabel`                 | "… technologies"   | default              | default   |
 *   | `emptyText`                   | "No configured …"  | —                    | —         |
 *   | `technologiesFor`             | —                  | per-country (E6)     | —         |
 *
 * Wide (the default): a flush white 200 px column that owns its own width (`width`/`minWidth`
 * 200, `flexShrink: 0`, border-box), no padding, the canvas Semilight shadow (shadow4), built to
 * the canvas `cmp_NestedCountryPickerColumn` spec in px
 * (`codeapp-knowledge-base/screens/application-settings/13-reusable-components/10-picker-canvas-parity`):
 *
 *   - Country row 50 px: 8 px left padding, a boxed 16 x 16 +/- button (the expander, only for a
 *     country that offers technologies), a spacer (12 px, 10 px selected, 28/26 px when there is
 *     no +/-, so flags stay aligned), the flag (36 x 24, 40 x 28 selected, 4 px corners, shadow8),
 *     then the name (132 px box, 8 px text padding; 14 px regular, 16 px semibold selected).
 *     The grey band `rgba(0,0,0,.1)` shows on a selected, COLLAPSED country when
 *     `highlightCollapsedSelection` is set.
 *   - Technology rows 35 px, text at x = 40; only the selected technology of the selected country
 *     is highlighted (16 px semibold + the grey fill) and carries `aria-current`. A grey `#BFBFBF`
 *     tree connector (vertical line at x = 16, 16 px tick per row; the tick is white on the
 *     highlighted row) is drawn with pseudo-elements, so it adds no text and no list items.
 *
 * A newly selected country is expanded once when the selection changes (Contracts B-6); a
 * country the user collapsed stays collapsed. The +/- button only toggles expansion; it never
 * changes the selection. Compact (`compact` or `"auto"` below 960 px): a Country / Technology
 * dropdown pair, unchanged.
 *
 * Wave A (E6, opt-in): `technologiesFor` gives each country its own list. A country whose list is
 * EMPTY is listed but has no expander (wide), cannot be selected by a country click, and in
 * compact mode gets a disabled Technology dropdown showing `emptyText` — so it can never become
 * the selection, and a screen whose writes need a selection never writes for it (Costs GAP-1,
 * canvas `Nestings`). Compact mode honours `emptyText` and `ariaLabel` when given, and draws the
 * flag / code badge in the country options only with `compactFlags`. Without the new props
 * nothing changes for Project Gates, Costs or Contracts.
 */
import { useState } from "react";
import {
  Dropdown, Field, Option, Text, makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import { technologiesOf, type CountryTechnology, type PickerCountry, type TechnologiesFor } from "@/domain/countryPicker";
import type { TechnologyOption } from "@/domain/technology";
import { NARROW_PICKER_QUERY, useMediaQuery } from "@/app/useMediaQuery";
import { media, palette } from "@/theme/tokens";
import { CountryFlag } from "./CountryFlag";

const useStyles = makeStyles({
  // The flush white column (canvas component + host: Width 200, Fill white, DropShadow.Semilight
  // ~ shadow4, radius 1). It owns its width: nothing inside may be wider than 200 px.
  column: {
    boxSizing: "border-box", width: "200px", minWidth: "200px", flexShrink: 0,
    backgroundColor: palette.white,
    boxShadow: tokens.shadow4,
    borderRadius: "1px",
    paddingTop: "0", paddingBottom: "0", paddingLeft: "0", paddingRight: "0",
    // Rail parity: fill the row, as the canvas horizontal AutoLayout did (Contracts
    // 03-responsive-layout §"Picker | Fixed 200, height = parent"). `flex-start` made the
    // picker a short floating box that never matched the left navigation. No `height`/
    // `maxHeight`: stretch gives the row height when the content fits and lets the box GROW
    // (into the screen's page scroller) when it does not, instead of clipping it.
    alignSelf: "stretch",
    // and never scroll INSIDE the picker (Contracts 03-responsive-layout: "Keep one scroll
    // container … Do not nest a scrolling list"; Gates: "Avoid nested scroll regions").
    overflowY: "visible",
    [media.belowMd]: {
      // Narrow: the canvas column is a FIXED 200 px, so the old `width: 100%` override is gone —
      // with `flexShrink: 0` it made the picker take a whole non-wrapping flex row and pushed
      // the content off screen (Gates, Contracts). `maxWidth` only protects viewports under
      // 200 px. `alignSelf: auto`: when the host stacks (Costs below 900 px) stretching the
      // picker to a row height is wrong, and a column flex does not stretch a box with a width.
      maxWidth: "100%",
      alignSelf: "auto",
    },
  },
  list: { listStyleType: "none", margin: "0", paddingLeft: "0", paddingRight: "0" },
  // Country row (`con_CountryFlagAndLabel`): 50 px, children flow left to right from x = 8.
  countryRow: {
    display: "flex", alignItems: "center", boxSizing: "border-box", height: "50px",
    paddingLeft: "8px", paddingRight: "0", paddingTop: "0", paddingBottom: "0",
  },
  countryRowSelected: { backgroundColor: "rgba(0, 0, 0, 0.1)" },
  // Spacer (`Rectangle2`): 12 px after the +/-, 10 px when selected (the flag grows 4 px, so its
  // centre stays put); with no +/- it also takes the button's 16 px: 28 / 26 px.
  spacer: { display: "block", flexShrink: 0, width: "12px", height: "1px" },
  spacerSelected: { width: "10px" },
  spacerNoToggle: { width: "28px" },
  spacerNoToggleSelected: { width: "26px" },
  // Name box (`lbl_CountryName`): 132 px, text padding-left 8, 14 px regular / 16 px semibold.
  // It may shrink (`minWidth: 0`) so the box ends at the 200 px column edge, with the text
  // starting at x = 80 (82 selected) exactly as in the canvas, which clips the same box.
  countryName: {
    boxSizing: "border-box", flexShrink: 1, flexGrow: 0, minWidth: "0", width: "132px",
    paddingLeft: "8px", paddingRight: "0", paddingTop: "0", paddingBottom: "0",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left",
    fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightRegular, color: "#242424",
  },
  selectedCountry: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase400 },
  // `countryClick` "select" / "toggle": one button around flag + name, filling the row height.
  countryButton: {
    flexGrow: 1, flexShrink: 1, minWidth: "0", alignSelf: "stretch", display: "flex", alignItems: "center",
    backgroundColor: "transparent", cursor: "pointer", textAlign: "left",
    borderTopStyle: "none", borderRightStyle: "none", borderBottomStyle: "none", borderLeftStyle: "none",
    paddingTop: "0", paddingBottom: "0", paddingLeft: "0", paddingRight: "0",
    fontFamily: "inherit", fontSize: tokens.fontSizeBase300, color: "#242424",
    ":focus-visible": {
      outlineWidth: "2px", outlineStyle: "solid", outlineColor: palette.themePrimary, outlineOffset: "-2px",
    },
  },
  // The boxed +/- (`Button2`): 16 x 16, 1 px rgb(53,61,63) border, radius 4, transparent, hover
  // rgb(237,237,237). The glyph is an SVG (no text in the row). A transparent ::after pads the
  // hit area to 24 x 24 (WCAG 2.5.8) without changing the 16 px box.
  toggle: {
    position: "relative", flexShrink: 0, boxSizing: "border-box", width: "16px", height: "16px",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    paddingTop: "0", paddingBottom: "0", paddingLeft: "0", paddingRight: "0",
    marginTop: "0", marginBottom: "0", marginLeft: "0", marginRight: "0",
    backgroundColor: "transparent", cursor: "pointer", color: "rgb(53, 61, 63)",
    borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
    borderTopStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid", borderLeftStyle: "solid",
    borderTopColor: "rgb(53, 61, 63)", borderRightColor: "rgb(53, 61, 63)",
    borderBottomColor: "rgb(53, 61, 63)", borderLeftColor: "rgb(53, 61, 63)",
    borderTopLeftRadius: "4px", borderTopRightRadius: "4px", borderBottomLeftRadius: "4px", borderBottomRightRadius: "4px",
    ":hover": { backgroundColor: "rgb(237, 237, 237)" },
    ":active": { color: "rgb(106, 122, 127)" },
    ":focus-visible": {
      outlineWidth: "2px", outlineStyle: "solid", outlineColor: palette.themePrimary, outlineOffset: "1px",
    },
    "::after": { content: '""', position: "absolute", top: "-5px", right: "-5px", bottom: "-5px", left: "-5px" },
  },
  toggleGlyph: { display: "block", flexShrink: 0 },
  // Technology row (`gal_CountryNestedChilds` item): full 200 px width from x = 0 (no margin, so
  // nothing overflows the column), 35 px, text at x = 40, OPAQUE white when not highlighted.
  // Tree connector, drawn with pseudo-elements: ::before = vertical line (1 px at x = 16, from the
  // row top, so the first row is clipped at the list top and the others join continuously),
  // ::after = 16 px tick at y = 17. Both are #BFBFBF (never blue); the tick is white on the
  // highlighted row.
  tech: {
    position: "relative", display: "block", width: "100%", boxSizing: "border-box", height: "35px",
    textAlign: "left", paddingLeft: "40px", paddingRight: "8px", paddingTop: "0", paddingBottom: "0",
    marginTop: "0", marginBottom: "0", marginLeft: "0", marginRight: "0",
    backgroundColor: palette.white, cursor: "pointer", fontFamily: "inherit",
    fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightRegular, color: "#242424",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    borderTopStyle: "none", borderRightStyle: "none", borderBottomStyle: "none", borderLeftStyle: "none",
    ":hover": { backgroundColor: palette.neutralLighter },
    ":focus-visible": {
      outlineWidth: "2px", outlineStyle: "solid", outlineColor: palette.themePrimary, outlineOffset: "-2px",
    },
    "::before": {
      content: '""', position: "absolute", top: "0", left: "16px", width: "1px", height: "35px",
      backgroundColor: "#BFBFBF",
    },
    "::after": {
      content: '""', position: "absolute", top: "17px", left: "16px", width: "16px", height: "1px",
      backgroundColor: "#BFBFBF",
    },
  },
  // The last row's line stops 2 px below its tick (y = 19), the "L" corner.
  techLast: { "::before": { height: "19px" } },
  techSelected: {
    backgroundColor: "rgba(0, 0, 0, 0.1)",
    fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase400,
    ":hover": { backgroundColor: "rgba(0, 0, 0, 0.1)" },
    "::after": { backgroundColor: palette.white },
  },
  empty: { display: "block", paddingLeft: "16px", paddingRight: "16px", color: tokens.colorNeutralForeground3 },
  // The column has no padding of its own, so its empty text brings its own vertical room.
  emptyColumn: { paddingTop: "16px", paddingBottom: "16px" },
  compact: { display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "8px" },
  compactField: { minWidth: "180px", flexGrow: 1 },
  compactOption: { display: "inline-flex", alignItems: "center", columnGap: "8px" },
});

export interface CountryTechnologyPickerProps {
  countries: readonly PickerCountry[];
  /** The technologies every country offers, in display order. */
  technologies: readonly TechnologyOption[];
  value: CountryTechnology | undefined;
  onChange: (next: CountryTechnology, country: PickerCountry) => void;
  /** `"flag"` = SVG flag; `"code"` = ISO-2 badge; `"none"` = nothing. Default `"flag"`. */
  flag?: "flag" | "code" | "none";
  /**
   * What clicking the country NAME does. `"toggle"` expands/collapses (Contracts); `"select"`
   * selects it with the current technology (or its first) and expands it (Project Gates);
   * `"none"` renders plain text, only the +/- button toggles (Costs). Default `"none"`.
   */
  countryClick?: "toggle" | "select" | "none";
  /** `true` = dropdown pair; `"auto"` = dropdowns below 960 px. Default `false`. */
  compact?: boolean | "auto";
  /** The +/- button's accessible name. Default "Expand <country>" / "Collapse <country>". */
  toggleLabel?: (open: boolean, country: PickerCountry) => string;
  /** Shown instead of an empty list (Project Gates). Without it an empty list renders empty. */
  emptyText?: string;
  /** Grey band on the selected country's row while it is collapsed (Project Gates). */
  highlightCollapsedSelection?: boolean;
  ariaLabel?: string;
  /**
   * E6: per-country technologies, overriding `technologies` for that country. An empty list =
   * listed without technologies (no expander, never selectable). Omitted = every country offers
   * `technologies`, as before.
   */
  technologiesFor?: TechnologiesFor;
  /** E6, compact only: draw `flag` in the Country options. Default false (today's compact look). */
  compactFlags?: boolean;
}

const defaultToggleLabel = (open: boolean, country: PickerCountry) => `${open ? "Collapse" : "Expand"} ${country.name}`;

export function CountryTechnologyPicker(props: CountryTechnologyPickerProps) {
  const narrow = useMediaQuery(NARROW_PICKER_QUERY);
  const compact = props.compact === "auto" ? narrow : props.compact === true;
  return compact ? <CompactPicker {...props} /> : <ColumnPicker {...props} />;
}

function ColumnPicker({
  countries, technologies, value, onChange, flag = "flag", countryClick = "none",
  toggleLabel = defaultToggleLabel, emptyText, highlightCollapsedSelection = false,
  ariaLabel = "Country and technology", technologiesFor,
}: CountryTechnologyPickerProps) {
  const styles = useStyles();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set(value ? [value.countryId] : []));
  // Expand a newly selected country once (B-6), adjusted during render on a selection change.
  const [seededFor, setSeededFor] = useState(value?.countryId);
  if (value?.countryId !== seededFor) {
    setSeededFor(value?.countryId);
    if (value) setExpanded((prev) => new Set([...prev, value.countryId]));
  }

  const toggle = (id: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  if (countries.length === 0 && emptyText) {
    return (
      <nav className={styles.column} aria-label={ariaLabel}>
        <Text as="p" className={mergeClasses(styles.empty, styles.emptyColumn)}>{emptyText}</Text>
      </nav>
    );
  }

  return (
    <nav className={styles.column} aria-label={ariaLabel}>
      <ul className={styles.list}>
        {countries.map((country) => {
          const offered = technologiesOf(country, technologies, technologiesFor);
          const hasTechnologies = offered.length > 0;
          const open = hasTechnologies && expanded.has(country.id);
          const isSelected = value?.countryId === country.id;
          const groupId = `country-tech-picker-${country.id}`;
          const flagNode = flag === "none"
            ? null
            : (
              <CountryFlag
                country={country.name} variant={flag === "code" ? "code" : "flag"} fallbackCode={country.code}
                selected={isSelected}
              />
            );
          const nameClass = mergeClasses(styles.countryName, isSelected && styles.selectedCountry);
          // The slot the +/- would take: 12 px, 10 selected; 28 / 26 when the country has no +/-.
          const spacerClass = mergeClasses(
            styles.spacer,
            isSelected && hasTechnologies && styles.spacerSelected,
            !hasTechnologies && (isSelected ? styles.spacerNoToggleSelected : styles.spacerNoToggle),
          );

          let nameNode;
          if (countryClick === "none") {
            nameNode = <>{flagNode}<span className={nameClass}>{country.name}</span></>;
          } else {
            nameNode = (
              <button
                type="button"
                className={styles.countryButton}
                aria-label={country.name}
                {...(countryClick === "toggle"
                  ? { "aria-expanded": open, "aria-controls": groupId }
                  : { "aria-current": isSelected ? ("true" as const) : undefined })}
                onClick={() => {
                  if (countryClick === "toggle") { toggle(country.id); return; }
                  const current = isSelected && value ? value.technology : offered[0]?.code;
                  if (current !== undefined) onChange({ countryId: country.id, technology: current }, country);
                  setExpanded((prev) => new Set(prev).add(country.id));
                }}
              >
                {flagNode}
                <span className={nameClass}>{country.name}</span>
              </button>
            );
          }

          return (
            <li key={country.id}>
              <div className={mergeClasses(styles.countryRow, highlightCollapsedSelection && isSelected && !open && styles.countryRowSelected)}>
                {hasTechnologies ? (
                  <button
                    type="button"
                    className={styles.toggle}
                    aria-expanded={open}
                    aria-controls={groupId}
                    aria-label={toggleLabel(open, country)}
                    onClick={() => toggle(country.id)}
                  >
                    <svg className={styles.toggleGlyph} width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
                      <path d="M3.5 7h7" stroke="currentColor" strokeWidth="1.6" fill="none" />
                      {open ? null : <path d="M7 3.5v7" stroke="currentColor" strokeWidth="1.6" fill="none" />}
                    </svg>
                  </button>
                ) : null}
                <span className={spacerClass} aria-hidden="true" />
                {nameNode}
              </div>
              {open ? (
                <ul id={groupId} className={styles.list}>
                  {offered.map((tech, index) => {
                    const active = isSelected && value?.technology === tech.code;
                    return (
                      <li key={tech.code}>
                        <button
                          type="button"
                          className={mergeClasses(
                            styles.tech,
                            index === offered.length - 1 && styles.techLast,
                            active && styles.techSelected,
                          )}
                          aria-current={active ? "true" : undefined}
                          aria-label={`${country.name} ${tech.label}`}
                          onClick={() => onChange({ countryId: country.id, technology: tech.code }, country)}
                        >
                          {tech.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function CompactPicker({
  countries, technologies, value, onChange, flag = "flag", emptyText, ariaLabel, technologiesFor, compactFlags = false,
}: CountryTechnologyPickerProps) {
  const styles = useStyles();
  // A country chosen in the first dropdown is pending until a technology completes the pair.
  const [pendingCountry, setPendingCountry] = useState<string | undefined>();
  const countryId = pendingCountry ?? value?.countryId;
  const country = countries.find((c) => c.id === countryId);
  const offered = country ? technologiesOf(country, technologies, technologiesFor) : technologies;
  const noTechnologies = country !== undefined && offered.length === 0;
  const techOfCountry = value && value.countryId === countryId ? value.technology : undefined;
  const techLabel = offered.find((t) => t.code === techOfCountry)?.label ?? "";

  if (countries.length === 0 && emptyText) {
    return (
      <div className={styles.compact} {...(ariaLabel ? { role: "group", "aria-label": ariaLabel } : {})}>
        <Text as="p" className={styles.empty}>{emptyText}</Text>
      </div>
    );
  }

  const flagNode = (c: PickerCountry) => (compactFlags && flag !== "none"
    ? <CountryFlag country={c.name} variant={flag === "code" ? "code" : "flag"} fallbackCode={c.code} compact />
    : null);

  return (
    <div className={styles.compact} {...(ariaLabel ? { role: "group", "aria-label": ariaLabel } : {})}>
      <Field label="Country" className={styles.compactField}>
        <Dropdown
          aria-label="Country"
          value={country?.name ?? ""}
          selectedOptions={countryId ? [countryId] : []}
          onOptionSelect={(_, d) => setPendingCountry(d.optionValue)}
          placeholder="Select a country"
        >
          {countries.map((c) => (compactFlags && flag !== "none"
            ? <Option key={c.id} value={c.id} text={c.name}><span className={styles.compactOption}>{flagNode(c)}{c.name}</span></Option>
            : <Option key={c.id} value={c.id}>{c.name}</Option>))}
        </Dropdown>
      </Field>
      <Field label="Technology" className={styles.compactField}>
        <Dropdown
          aria-label="Technology"
          disabled={!countryId || noTechnologies}
          value={techLabel}
          selectedOptions={techOfCountry !== undefined ? [String(techOfCountry)] : []}
          onOptionSelect={(_, d) => {
            if (!country || !d.optionValue) return;
            onChange({ countryId: country.id, technology: Number(d.optionValue) }, country);
          }}
          placeholder={noTechnologies && emptyText ? emptyText : "Select a technology"}
        >
          {offered.map((t) => <Option key={t.code} value={String(t.code)}>{t.label}</Option>)}
        </Dropdown>
      </Field>
    </div>
  );
}
