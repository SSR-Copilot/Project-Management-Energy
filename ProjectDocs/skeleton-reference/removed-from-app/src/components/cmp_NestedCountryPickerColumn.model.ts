/**
 * cmp_NestedCountryPickerColumn — the pure half of the reusable component.
 *
 * Ported from the canvas component `cmp_NestedCountryPickerColumn`
 * (`Src/Components/cmp_NestedCountryPickerColumn.pa.yaml` of the Project Management app in
 * `VSBCloud_managed (2).zip`, unchanged between 1.21.709 and 1.21.753), which
 * the Admin Contract, Admin Cost and Admin Project Gates Approvals screens instantiate.
 *
 * Everything the component BRANCHES on is here, React-free, so the test pins the canvas
 * behaviour directly (CONVENTIONS rule 1):
 *
 *   CustomProperties   Countries (Input, Table) · Nestings (Input, Table) · OnSelect (Event)
 *                      · SelectedCountry (Output, Record) · SelectedNestedValue (Output, Text)
 *   gal_Countries      AddColumns(Countries As C, 'Nested Items', Filter(Nestings, Country = C.Name))
 *   gal_CountryNestedChilds
 *                      Items: LookUp(Nestings, Country = ThisItem.Name).Childs
 *                      Visible: ThisItem.Expanded
 *   Button2 (+/−)      Visible: CountRows(ThisItem.'Nested Items'.Childs) > 0
 *                      OnSelect: Patch(col_cmpCountryPickerItems, …, {Expanded: !ThisItem.Expanded})
 *
 * Two canvas behaviours that are easy to lose in a port, both kept and both tested:
 *  1. A canvas gallery's `Selected` defaults to its FIRST item. So `SelectedNestedValue`
 *     (`gal_Countries.Selected.gal_CountryNestedChilds.Selected.Value`) is the first child of
 *     the selected country even before any child is clicked — "Germany" selects "Wind".
 *  2. A child row is highlighted only while ITS country is the selected one
 *     (`cbx_CountrySelected.Checked && ThisItem.IsSelected`), and the country row itself is
 *     shaded only while it is selected AND collapsed (`IsSelected && !Expanded`).
 *
 * Expansion lived in the global `col_cmpCountryPickerItems` (patched by the +/− button), so
 * it outlived the screen. Here it is caller-owned state (`expandedKeys`), like CountryRail.
 */

/** One `Countries` row. `key` is the Dataverse country id (`Country` column in the canvas). */
export interface NestedCountry {
  key: string;
  /** `Name` — the join key into `Nestings`. */
  name: string;
  /** Regional-indicator flag; the canvas used a PNG (`'Flag Image'`). */
  flag?: string;
}

/** One child of a nesting — `{Order, Value}` (Power Fx turns the string array into `{Value}`). */
export interface NestingChild {
  order: number;
  value: string;
}

/** One `Nestings` row — `{Country, Childs}`. */
export interface CountryNesting {
  country: string;
  childs: readonly NestingChild[];
}

/**
 * `col_cmpCountryPickerItems` order, as the three screens build it
 * (`Switch(Name, "Germany", 1, "France", 2, …)`).
 */
export const COUNTRY_PICKER_ORDER: readonly string[] = [
  "Germany", "France", "Poland", "Italy", "Finland", "Croatia", "Spain", "Greece", "Romania",
];

/** `Countries.Default` — `Filter(col_cmpCountryPickerItems, !(Name in ["Spain","Greece","Romania"]))`. */
export const DEFAULT_EXCLUDED_COUNTRIES: readonly string[] = ["Spain", "Greece", "Romania"];

/** `Nestings.Default` — every default country nests Wind (1) then PV (2). Verbatim. */
export const DEFAULT_NESTINGS: readonly CountryNesting[] = [
  "Germany", "France", "Poland", "Italy", "Finland", "Croatia",
].map((country) => ({
  country,
  childs: [
    { order: 1, value: "Wind" },
    { order: 2, value: "PV" },
  ],
}));

/** The `Countries` default applied to a caller's list (order preserved). */
export function defaultCountries<T extends Pick<NestedCountry, "name">>(items: readonly T[]): T[] {
  return items.filter((c) => !DEFAULT_EXCLUDED_COUNTRIES.includes(c.name));
}

/** `LookUp(Nestings, Country = ThisItem.Name).Childs` — the FIRST matching nesting, or none. */
export function childsOf(nestings: readonly CountryNesting[], countryName: string): readonly NestingChild[] {
  return nestings.find((n) => n.country === countryName)?.childs ?? [];
}

/** `Button2.Visible` — `CountRows(ThisItem.'Nested Items'.Childs) > 0`. */
export const hasChildren = (nestings: readonly CountryNesting[], countryName: string): boolean =>
  childsOf(nestings, countryName).length > 0;

/** `Button2.Text` — `If(ThisItem.Expanded, "-", "+")`. */
export const expanderGlyph = (expanded: boolean): "-" | "+" => (expanded ? "-" : "+");

/**
 * `Button2.OnSelect` — `{Expanded: !ThisItem.Expanded}` on the one row. The click also makes
 * that row `gal_Countries.Selected` (any control in a gallery template does), so the
 * component selects the country as well — see the component's `toggle`.
 */
export function toggleExpanded(expandedKeys: readonly string[], key: string): string[] {
  return expandedKeys.includes(key) ? expandedKeys.filter((k) => k !== key) : [...expandedKeys, key];
}

/** The component's selection state: the country row, and a child only once one was clicked. */
export interface NestedSelection {
  countryKey: string | null;
  /** `null` = no child clicked yet; the output then falls back to the first child. */
  nestedValue: string | null;
}

/**
 * The two outputs.
 *  - `SelectedCountry` — `LookUp(Countries, Country = gal_Countries.Selected.Country)`.
 *  - `SelectedNestedValue` — the clicked child, else the first child of the selected country
 *    (gallery default selection), else blank. A clicked value that is not a child of the
 *    selected country (stale after the country changed) also falls back to the first child,
 *    because the inner gallery is re-bound to the new country's `Childs`.
 */
export function pickerOutputs(
  countries: readonly NestedCountry[],
  nestings: readonly CountryNesting[],
  sel: NestedSelection,
): { selectedCountry: NestedCountry | null; selectedNestedValue: string | null } {
  const selectedCountry = countries.find((c) => c.key === sel.countryKey) ?? null;
  if (!selectedCountry) return { selectedCountry: null, selectedNestedValue: null };
  const childs = childsOf(nestings, selectedCountry.name);
  const clicked = sel.nestedValue !== null && childs.some((c) => c.value === sel.nestedValue)
    ? sel.nestedValue
    : null;
  return { selectedCountry, selectedNestedValue: clicked ?? childs[0]?.value ?? null };
}

/** `con_CountryFlagAndLabel.Fill` — shaded only while selected AND collapsed. */
export const countryRowShaded = (selected: boolean, expanded: boolean): boolean => selected && !expanded;

/** `TextCanvas3.Fill` / `.Weight` / `.Size` — a child is emphasised only under its selected country. */
export const childEmphasised = (countrySelected: boolean, childSelected: boolean): boolean =>
  countrySelected && childSelected;

/** `lbl_CountryName.Size` / `TextCanvas3.Size` — 16 when emphasised, else 14. */
export const labelSize = (emphasised: boolean): 16 | 14 => (emphasised ? 16 : 14);

/** `con_CountryFlagShadow.Width/Height` — the flag grows by 4 px when its country is selected. */
export const flagBox = (selected: boolean): { width: number; height: number } =>
  ({ width: 36 + (selected ? 4 : 0), height: 24 + (selected ? 4 : 0) });

/**
 * `Rectangle2.Width` — `12 + If(!Button2.Visible, Button2.Width) - If(ThisItem.IsSelected, 2)`:
 * the invisible spacer that keeps flags aligned whether or not the +/− button shows.
 */
export const spacerWidth = (buttonVisible: boolean, selected: boolean): number =>
  12 + (buttonVisible ? 0 : 16) - (selected ? 2 : 0);

/** Stable, data-free `data-testid`s for the repeating rows (Tosca convention 4). */
export const testIds = {
  root: "cmp_NestedCountryPickerColumn",
  countryRow: (key: string) => `gal_Countries-${key}`,
  expander: (key: string) => `Button2-${key}`,
  childRow: (key: string, value: string) => `gal_CountryNestedChilds-${key}-${value}`,
} as const;
