/**
 * The Country / Technology picker model shared by Project Gates, Costs and Contracts (M6).
 *
 * Canvas: `cmp_NestedCountryPickerColumn` — the same six countries, in the same order, on all
 * three screens (PGAS:75-117, ACS:56-110, Contracts ACS:95-115). This file holds that list ONCE
 * and encodes each screen's CURRENT rule as configuration, so adopting the shared picker does
 * not change behaviour.
 *
 * OPEN PRODUCT DECISION (recorded in `06-shared-build-log.md`, Batch 2a): the screens disagree.
 *   - Project Gates and Contracts use an ALLOW-list (a new country never appears by itself;
 *     Gates D-24, Contracts D-20). Gates matches names case-insensitively after trimming;
 *     Contracts matches exactly.
 *   - Costs uses a DENY-list (Spain, Greece, Romania) and APPENDS any unknown country,
 *     alphabetically, after the six.
 *   - Default selection: Gates = first country / first technology; Costs = Germany / Wind
 *     (else the first country); Contracts = none (explicit empty state, D-29).
 * Unifying them is a PO decision; until then each screen passes its own `CountryRule` /
 * `DefaultSelection` below.
 */
import { TECHNOLOGY, type TechnologyOption } from "./technology";

/** Stripes for the inline SVG flag, top-to-bottom (`h`) or left-to-right (`v`). */
export type FlagSpec =
  | { kind: "h"; colors: readonly string[] }
  | { kind: "v"; colors: readonly string[] }
  | { kind: "nordic"; background: string; cross: string };

export interface PickerCountryConfig {
  /** `vsb_countries.vsb_name` as the canvas matched it. */
  name: string;
  /** Display order (1-based). */
  order: number;
  /** ISO 3166-1 alpha-2, shown as the badge where no flag is drawn. */
  iso2: string;
  flag: FlagSpec;
}

/** The six picker countries, canvas order. Colours from `costs/Flag.tsx` (the SVG flags). */
export const PICKER_COUNTRIES: readonly PickerCountryConfig[] = [
  { name: "Germany", order: 1, iso2: "DE", flag: { kind: "h", colors: ["#000000", "#DD0000", "#FFCE00"] } },
  { name: "France", order: 2, iso2: "FR", flag: { kind: "v", colors: ["#002395", "#FFFFFF", "#ED2939"] } },
  { name: "Poland", order: 3, iso2: "PL", flag: { kind: "h", colors: ["#FFFFFF", "#DC143C"] } },
  { name: "Italy", order: 4, iso2: "IT", flag: { kind: "v", colors: ["#009246", "#FFFFFF", "#CE2B37"] } },
  { name: "Finland", order: 5, iso2: "FI", flag: { kind: "nordic", background: "#FFFFFF", cross: "#003580" } },
  { name: "Croatia", order: 6, iso2: "HR", flag: { kind: "h", colors: ["#FF0000", "#FFFFFF", "#171796"] } },
];

/** The canvas exclusion (Costs' deny-list; a no-op for the allow-list screens). */
export const PICKER_EXCLUDED_COUNTRIES: readonly string[] = ["Spain", "Greece", "Romania"];

/** The configuration entry for a country name (exact, then case-insensitive trimmed). */
export function pickerCountryConfig(name: string): PickerCountryConfig | undefined {
  const exact = PICKER_COUNTRIES.find((c) => c.name === name);
  if (exact) return exact;
  const wanted = name.trim().toLowerCase();
  return PICKER_COUNTRIES.find((c) => c.name.toLowerCase() === wanted);
}

/** A country row as `data/countries.ts` returns it (all columns optional beyond id/name). */
export interface CountryRow {
  id: string;
  name: string;
  isoCurrencyCode?: string | undefined;
  title?: string | undefined;
  active?: boolean | undefined;
}

/** A row the picker shows. `code` is the ISO-2 badge text ("" for an unknown country). */
export type PickerCountry = CountryRow & { order: number; code: string };

/**
 * How a screen turns the country table into its picker list.
 *
 * - `allowList` keeps only the six configured countries, in configured order.
 *   `match: "exact"` is Contracts; `"caseInsensitiveTrim"` is Project Gates, which also shows the
 *   CONFIGURED name (`displayName: "config"`) rather than the row's.
 * - `denyList` is Costs: drop the excluded names (exact match), rank the six first, then every
 *   other country alphabetically.
 */
export type CountryRule =
  | { kind: "allowList"; match: "exact" | "caseInsensitiveTrim"; displayName?: "row" | "config" }
  | { kind: "denyList" };

export const GATE_COUNTRY_RULE: CountryRule = { kind: "allowList", match: "caseInsensitiveTrim", displayName: "config" };
export const COST_COUNTRY_RULE: CountryRule = { kind: "denyList" };
export const CONTRACT_COUNTRY_RULE: CountryRule = { kind: "allowList", match: "exact", displayName: "row" };

export function pickerCountries(rows: readonly CountryRow[], rule: CountryRule): PickerCountry[] {
  if (rule.kind === "allowList") {
    const out: PickerCountry[] = [];
    for (const cfg of PICKER_COUNTRIES) {
      if (PICKER_EXCLUDED_COUNTRIES.includes(cfg.name)) continue;
      const row = rule.match === "exact"
        ? rows.find((r) => r.name === cfg.name)
        : rows.find((r) => r.name.trim().toLowerCase() === cfg.name.toLowerCase());
      if (!row) continue;
      out.push({ ...row, name: rule.displayName === "config" ? cfg.name : row.name, order: cfg.order, code: cfg.iso2 });
    }
    return out;
  }
  const rank = (name: string) => {
    const i = PICKER_COUNTRIES.findIndex((c) => c.name === name);
    return i === -1 ? PICKER_COUNTRIES.length : i;
  };
  return rows
    .filter((r) => !PICKER_EXCLUDED_COUNTRIES.includes(r.name))
    .map((r) => {
      const cfg = PICKER_COUNTRIES.find((c) => c.name === r.name);
      return { ...r, order: cfg?.order ?? PICKER_COUNTRIES.length + 1, code: cfg?.iso2 ?? "" };
    })
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}

/* ═══════════════════════════════════════════════════════════════ selection ══ */

/** A picker selection. `countryId` is the `vsb_countryid`; `technology` the choice code. */
export interface CountryTechnology {
  countryId: string;
  technology: number;
}

/**
 * What a screen shows before the user picks.
 * - `none`: nothing (Contracts, D-29).
 * - `first`: the first listed country and its first technology (Project Gates FR-2 AC1).
 * - `preferred`: the named country with the given technology, else the first listed country
 *   with that technology (Costs FR-3: Germany / Wind).
 */
export type DefaultSelection =
  | { kind: "none" }
  | { kind: "first" }
  | { kind: "preferred"; countryName: string; technology: number };

export const GATE_DEFAULT: DefaultSelection = { kind: "first" };
export const COST_DEFAULT: DefaultSelection = { kind: "preferred", countryName: "Germany", technology: TECHNOLOGY.wind };
export const CONTRACT_DEFAULT: DefaultSelection = { kind: "none" };

export function defaultSelection(
  countries: readonly PickerCountry[],
  technologies: readonly TechnologyOption[],
  policy: DefaultSelection,
  technologiesFor?: TechnologiesFor,
): CountryTechnology | undefined {
  if (policy.kind === "none") return undefined;
  if (technologiesFor) return defaultSelectionPerCountry(countries, policy, technologiesFor);
  if (policy.kind === "first") {
    const first = countries[0];
    const tech = technologies[0];
    return first && tech ? { countryId: first.id, technology: tech.code } : undefined;
  }
  const country = countries.find((c) => c.name === policy.countryName) ?? countries[0];
  return country ? { countryId: country.id, technology: policy.technology } : undefined;
}

/* ══════════════════════════════════════════ E6: per-country technologies (Wave A) ══ */

/**
 * The technologies a given country offers. A country mapped to `[]` is LISTED but has no
 * technology: the picker shows it without an expander and it can never be selected, so a screen
 * that requires a selection for its writes cannot write for it — the canvas `Nestings` behaviour
 * (Costs parity GAP-1: only the six configured countries get Wind / PV, ACS:650-733).
 */
export type TechnologiesFor = (country: PickerCountry) => readonly TechnologyOption[];

/**
 * The canvas `Nestings` rule as configuration: `technologies` for the six `PICKER_COUNTRIES`
 * (matched by exact name, `Country = ThisItem.Name`), `[]` for every other listed country.
 */
export function configuredCountryTechnologies(technologies: readonly TechnologyOption[]): TechnologiesFor {
  return (country) => (PICKER_COUNTRIES.some((c) => c.name === country.name) ? technologies : []);
}

/** The list a country offers: `technologiesFor(country)` when given, else the shared list. */
export function technologiesOf(
  country: PickerCountry, technologies: readonly TechnologyOption[], technologiesFor?: TechnologiesFor,
): readonly TechnologyOption[] {
  return technologiesFor ? technologiesFor(country) : technologies;
}

/**
 * Default selection that skips countries without technologies. `first`: the first country with
 * any technology, and its first one. `preferred`: the named country if it offers the technology,
 * else the first listed country that does.
 */
function defaultSelectionPerCountry(
  countries: readonly PickerCountry[], policy: Exclude<DefaultSelection, { kind: "none" }>, technologiesFor: TechnologiesFor,
): CountryTechnology | undefined {
  if (policy.kind === "first") {
    for (const country of countries) {
      const tech = technologiesFor(country)[0];
      if (tech) return { countryId: country.id, technology: tech.code };
    }
    return undefined;
  }
  const offers = (c: PickerCountry) => technologiesFor(c).some((t) => t.code === policy.technology);
  const preferred = countries.find((c) => c.name === policy.countryName);
  const country = preferred && offers(preferred) ? preferred : countries.find(offers);
  return country ? { countryId: country.id, technology: policy.technology } : undefined;
}

/**
 * True when `selection` names a listed country that offers its technology. With
 * `technologiesFor`, a country listed without technologies is never selectable.
 */
export function isSelectable(
  selection: CountryTechnology | undefined,
  countries: readonly PickerCountry[],
  technologies: readonly TechnologyOption[],
  technologiesFor?: TechnologiesFor,
): boolean {
  if (!selection) return false;
  const country = countries.find((c) => c.id.toLowerCase() === selection.countryId.toLowerCase());
  return country !== undefined
    && technologiesOf(country, technologies, technologiesFor).some((t) => t.code === selection.technology);
}

/**
 * Reads `?country=<guid>&tech=<code>` (Contracts FR-2). The id matches case-insensitively and
 * must be a listed country; the code must be an offered technology. Anything else is
 * `undefined`, so the caller falls back to its default.
 */
export function parseSelectionParams(
  countryParam: string | null | undefined,
  techParam: string | null | undefined,
  countries: readonly PickerCountry[],
  technologies: readonly TechnologyOption[],
  technologiesFor?: TechnologiesFor,
): CountryTechnology | undefined {
  if (!countryParam || !techParam) return undefined;
  const country = countries.find((c) => c.id.toLowerCase() === countryParam.toLowerCase());
  const technology = Number(techParam);
  if (!country || !technologiesOf(country, technologies, technologiesFor).some((t) => t.code === technology)) return undefined;
  return { countryId: country.id, technology };
}

/** Same country (case-insensitive id) and technology. */
export function sameCountryTechnology(
  a: CountryTechnology | undefined, b: CountryTechnology | undefined,
): boolean {
  if (!a || !b) return a === b;
  return a.countryId.toLowerCase() === b.countryId.toLowerCase() && a.technology === b.technology;
}

/* ═══════════════════════════════════════════════════ E14: scope breadcrumb (Wave A) ══ */

/**
 * `<area><sep><country><sep><technology>`, or just `<area>` while the country or technology is
 * missing. Reproduces the three screens' headings:
 *   Contracts      `scopeBreadcrumb("Contracts", name, label)`                  (`rules.ts:99-102`)
 *   Costs          `scopeBreadcrumb("Standard Assumptions / Costs", name, label)` (`rules.ts:74-76`)
 *   Project Gates  `scopeBreadcrumb("Project Gates", name, label, " | ")`        (`rules.ts:67-69`)
 * An empty country name counts as missing (Contracts' `!countryName`).
 */
export function scopeBreadcrumb(
  area: string, countryName?: string, technologyLabel?: string, separator = " / ",
): string {
  if (!countryName || technologyLabel === undefined) return area;
  return [area, countryName, technologyLabel].join(separator);
}