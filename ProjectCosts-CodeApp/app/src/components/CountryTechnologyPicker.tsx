/**
 * The shared Country / Technology picker (M6) — canvas `cmp_NestedCountryPickerColumn`.
 *
 * One implementation for Project Gates, Costs and Contracts. It is CONTROLLED and reads no
 * data: the screen passes the list (`pickerCountries` with its `CountryRule`), the technologies
 * and the selection (`useCountryTechnologySelection` / `…UrlSelection`), and the props below
 * reproduce each screen's current interaction:
 *
 *   | prop           | Project Gates        | Costs             | Contracts            |
 *   |----------------|----------------------|-------------------|----------------------|
 *   | `flag`         | "flag"               | "flag"            | "code"               |
 *   | `countryClick` | "select"             | "none" (text)     | "toggle"             |
 *   | `compact`      | false                | false             | "auto" (< 960 px)    |
 *   | `toggleLabel`  | "… technologies"     | default           | default              |
 *   | `emptyText`    | "No configured …"    | —                 | —                    |
 *
 * Wide: the 200 px column (shadow4), +/- expanders, the selected technology with
 * `aria-current`. A newly selected country is expanded once when the selection changes (Contracts
 * B-6); a country the user collapsed stays collapsed. Compact: a Country / Technology dropdown
 * pair (Contracts below 960 px).
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
  Button, Dropdown, Field, Option, Text, makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import { AddRegular, SubtractRegular } from "@fluentui/react-icons";
import { technologiesOf, type CountryTechnology, type PickerCountry, type TechnologiesFor } from "@/domain/countryPicker";
import type { TechnologyOption } from "@/domain/technology";
import { NARROW_PICKER_QUERY, useMediaQuery } from "@/app/useMediaQuery";
import { media, palette } from "@/theme/tokens";
import { CountryFlag } from "./CountryFlag";

const useStyles = makeStyles({
  column: {
    width: "200px", minWidth: "200px", flexShrink: 0,
    backgroundColor: palette.white,
    boxShadow: tokens.shadow4,
    borderRadius: "1px",
    paddingTop: "8px", paddingBottom: "8px",
    alignSelf: "flex-start",
    overflowY: "auto",
    [media.belowMd]: { width: "100%", minWidth: "0" },
  },
  list: { listStyleType: "none", margin: "0", paddingLeft: "0", paddingRight: "0" },
  countryRow: {
    display: "flex", alignItems: "center", columnGap: "10px",
    minHeight: "40px", paddingLeft: "12px", paddingRight: "4px",
  },
  countryRowSelected: { backgroundColor: "rgba(0, 0, 0, 0.1)" },
  countryName: { flexGrow: 1, minWidth: "0", fontSize: tokens.fontSizeBase300 },
  countryButton: {
    flexGrow: 1, minWidth: "0", display: "flex", alignItems: "center", columnGap: "10px",
    backgroundColor: "transparent", cursor: "pointer", textAlign: "left",
    borderTopStyle: "none", borderRightStyle: "none", borderBottomStyle: "none", borderLeftStyle: "none",
    paddingTop: "4px", paddingBottom: "4px", paddingLeft: "0", paddingRight: "0",
    fontFamily: "inherit", fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground1,
    ":focus-visible": { outlineWidth: "2px", outlineStyle: "solid", outlineColor: palette.themePrimary },
  },
  selectedCountry: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase400 },
  toggle: { minWidth: "28px" },
  tech: {
    display: "block", width: "100%", textAlign: "left", boxSizing: "border-box",
    minHeight: "34px", paddingLeft: "46px", paddingRight: "8px",
    backgroundColor: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
    borderTopStyle: "none", borderRightStyle: "none", borderBottomStyle: "none",
    borderLeftWidth: "1px", borderLeftStyle: "solid", borderLeftColor: "#0078D4",
    marginLeft: "24px",
    ":hover": { backgroundColor: palette.neutralLighter },
    ":focus-visible": { outlineWidth: "2px", outlineStyle: "solid", outlineColor: palette.themePrimary },
  },
  techSelected: {
    backgroundColor: "rgba(0, 0, 0, 0.1)",
    fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase400,
  },
  empty: { display: "block", paddingLeft: "16px", paddingRight: "16px", color: tokens.colorNeutralForeground3 },
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
        <Text as="p" className={styles.empty}>{emptyText}</Text>
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
            : <CountryFlag country={country.name} variant={flag === "code" ? "code" : "flag"} fallbackCode={country.code} />;
          const nameClass = mergeClasses(styles.countryName, isSelected && styles.selectedCountry);

          let nameNode;
          if (countryClick === "none") {
            nameNode = <>{flagNode}<Text className={nameClass}>{country.name}</Text></>;
          } else {
            nameNode = (
              <button
                type="button"
                className={mergeClasses(styles.countryButton, isSelected && styles.selectedCountry)}
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
                {country.name}
              </button>
            );
          }

          return (
            <li key={country.id}>
              <div className={mergeClasses(styles.countryRow, highlightCollapsedSelection && isSelected && !open && styles.countryRowSelected)}>
                {nameNode}
                {hasTechnologies ? (
                  <Button
                    appearance="subtle"
                    size="small"
                    className={styles.toggle}
                    icon={open ? <SubtractRegular /> : <AddRegular />}
                    aria-expanded={open}
                    aria-controls={groupId}
                    aria-label={toggleLabel(open, country)}
                    onClick={() => toggle(country.id)}
                  />
                ) : null}
              </div>
              {open ? (
                <ul id={groupId} className={styles.list}>
                  {offered.map((tech) => {
                    const active = isSelected && value?.technology === tech.code;
                    return (
                      <li key={tech.code}>
                        <button
                          type="button"
                          className={mergeClasses(styles.tech, active && styles.techSelected)}
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
    ? <CountryFlag country={c.name} variant={flag === "code" ? "code" : "flag"} fallbackCode={c.code} />
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
