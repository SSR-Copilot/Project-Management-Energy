/**
 * cmp_NestedCountryPickerColumn — the canvas component's behaviour, pinned.
 *
 * The model functions are tested directly (one id per case); the render tests check the
 * three things a regression would break: the tree structure screen readers and Tosca see,
 * the gallery-default selection of the first child, and the +/− button selecting its row.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FluentProvider } from "@fluentui/react-components";
import { vsbLightTheme } from "@/theme/fluentTheme";
import { NestedCountryPickerColumn, cmp_NestedCountryPickerColumn } from "./cmp_NestedCountryPickerColumn";
import {
  DEFAULT_NESTINGS, DEFAULT_EXCLUDED_COUNTRIES, COUNTRY_PICKER_ORDER, defaultCountries, childsOf,
  hasChildren, expanderGlyph, toggleExpanded, pickerOutputs, countryRowShaded, childEmphasised,
  labelSize, flagBox, spacerWidth, testIds, type NestedCountry,
} from "./cmp_NestedCountryPickerColumn.model";

const ALL: NestedCountry[] = COUNTRY_PICKER_ORDER.map((name) => ({ key: `c-${name}`, name }));
const COUNTRIES = defaultCountries(ALL);

describe("cmp_NestedCountryPickerColumn — the canvas defaults", () => {
  it("UT-NCP-001 Countries drops Spain, Greece and Romania, keeping canvas order", () => {
    expect(DEFAULT_EXCLUDED_COUNTRIES).toEqual(["Spain", "Greece", "Romania"]);
    expect(COUNTRIES.map((c) => c.name)).toEqual(["Germany", "France", "Poland", "Italy", "Finland", "Croatia"]);
  });

  it("UT-NCP-002 Nestings gives each default country Wind (1) then PV (2)", () => {
    expect(DEFAULT_NESTINGS).toHaveLength(6);
    for (const n of DEFAULT_NESTINGS) {
      expect(n.childs).toEqual([{ order: 1, value: "Wind" }, { order: 2, value: "PV" }]);
    }
  });
});

describe("cmp_NestedCountryPickerColumn — the model", () => {
  it("UT-NCP-003 childsOf is the first matching nesting's Childs, or empty", () => {
    expect(childsOf(DEFAULT_NESTINGS, "Italy").map((c) => c.value)).toEqual(["Wind", "PV"]);
    expect(childsOf(DEFAULT_NESTINGS, "Spain")).toEqual([]);
    expect(hasChildren(DEFAULT_NESTINGS, "Spain")).toBe(false);
    expect(hasChildren(DEFAULT_NESTINGS, "Germany")).toBe(true);
  });

  it("UT-NCP-004 the expander shows + collapsed and - expanded, and toggles one key", () => {
    expect(expanderGlyph(false)).toBe("+");
    expect(expanderGlyph(true)).toBe("-");
    expect(toggleExpanded([], "a")).toEqual(["a"]);
    expect(toggleExpanded(["a", "b"], "a")).toEqual(["b"]);
  });

  it("UT-NCP-005 SelectedNestedValue defaults to the first child (gallery default selection)", () => {
    const out = pickerOutputs(COUNTRIES, DEFAULT_NESTINGS, { countryKey: "c-Germany", nestedValue: null });
    expect(out.selectedCountry?.name).toBe("Germany");
    expect(out.selectedNestedValue).toBe("Wind");
  });

  it("UT-NCP-006 a clicked child wins; a stale one falls back to the first child", () => {
    expect(pickerOutputs(COUNTRIES, DEFAULT_NESTINGS, { countryKey: "c-France", nestedValue: "PV" })
      .selectedNestedValue).toBe("PV");
    expect(pickerOutputs(COUNTRIES, DEFAULT_NESTINGS, { countryKey: "c-France", nestedValue: "Hydro" })
      .selectedNestedValue).toBe("Wind");
  });

  it("UT-NCP-007 nothing selected, or a country without nestings, gives blank outputs", () => {
    expect(pickerOutputs(COUNTRIES, DEFAULT_NESTINGS, { countryKey: null, nestedValue: null }))
      .toEqual({ selectedCountry: null, selectedNestedValue: null });
    const spain = { key: "c-Spain", name: "Spain" };
    expect(pickerOutputs([spain], DEFAULT_NESTINGS, { countryKey: "c-Spain", nestedValue: null }))
      .toEqual({ selectedCountry: spain, selectedNestedValue: null });
  });

  it("UT-NCP-008 the country row is shaded only while selected AND collapsed", () => {
    expect(countryRowShaded(true, false)).toBe(true);
    expect(countryRowShaded(true, true)).toBe(false);
    expect(countryRowShaded(false, false)).toBe(false);
  });

  it("UT-NCP-009 a child is emphasised only under its selected country", () => {
    expect(childEmphasised(true, true)).toBe(true);
    expect(childEmphasised(false, true)).toBe(false);
    expect(labelSize(true)).toBe(16);
    expect(labelSize(false)).toBe(14);
  });

  it("UT-NCP-010 the flag grows by 4 px and the spacer keeps flags aligned", () => {
    expect(flagBox(false)).toEqual({ width: 36, height: 24 });
    expect(flagBox(true)).toEqual({ width: 40, height: 28 });
    expect(spacerWidth(true, false)).toBe(12);
    expect(spacerWidth(false, false)).toBe(28);
    expect(spacerWidth(true, true)).toBe(10);
  });

  it("UT-NCP-011 the row test ids carry the canvas control name and the row identity only", () => {
    expect(testIds.countryRow("c-Germany")).toBe("gal_Countries-c-Germany");
    expect(testIds.expander("c-Germany")).toBe("Button2-c-Germany");
    expect(testIds.childRow("c-Germany", "PV")).toBe("gal_CountryNestedChilds-c-Germany-PV");
  });
});

const renderPicker = (props: Partial<Parameters<typeof NestedCountryPickerColumn>[0]> = {}) =>
  render(
    <FluentProvider theme={vsbLightTheme}>
      <NestedCountryPickerColumn countries={COUNTRIES} {...props} />
    </FluentProvider>,
  );

describe("cmp_NestedCountryPickerColumn — the rendered tree", () => {
  it("UT-NCP-012 renders a labelled tree with one collapsed treeitem per country", () => {
    renderPicker({ ariaLabel: "Country" });
    const tree = screen.getByRole("tree", { name: "Country" });
    expect(tree).toHaveAttribute("data-testid", "cmp_NestedCountryPickerColumn");
    const items = screen.getAllByRole("treeitem");
    expect(items).toHaveLength(6);
    expect(items[0]).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Expand Germany" })).toHaveTextContent("+");
  });

  it("UT-NCP-013 the +/− button expands AND selects its country, firing OnSelect", async () => {
    const onSelect = vi.fn();
    renderPicker({ onSelect });
    await userEvent.click(screen.getByRole("button", { name: "Expand Italy" }));
    expect(screen.getByRole("button", { name: "Collapse Italy" })).toHaveTextContent("-");
    expect(screen.getByTestId("gal_CountryNestedChilds-c-Italy-Wind")).toBeInTheDocument();
    expect(onSelect).toHaveBeenLastCalledWith({
      selectedCountry: { key: "c-Italy", name: "Italy" }, selectedNestedValue: "Wind",
    });
  });

  it("UT-NCP-014 clicking a child selects it and its country, and emphasises it", async () => {
    const onSelect = vi.fn();
    renderPicker({ onSelect });
    await userEvent.click(screen.getByRole("button", { name: "Expand France" }));
    await userEvent.click(screen.getByTestId("gal_CountryNestedChilds-c-France-PV"));
    expect(onSelect).toHaveBeenLastCalledWith({
      selectedCountry: { key: "c-France", name: "France" }, selectedNestedValue: "PV",
    });
    expect(screen.getByTestId("gal_CountryNestedChilds-c-France-PV")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("gal_CountryNestedChilds-c-France-Wind")).toHaveAttribute("aria-selected", "false");
  });

  it("UT-NCP-015 a controlled picker renders the caller's selection and expansion", () => {
    renderPicker({ selectedCountryKey: "c-Poland", selectedNestedValue: "PV", expandedKeys: ["c-Poland"] });
    expect(screen.getByRole("treeitem", { name: "Poland" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("gal_CountryNestedChilds-c-Poland-PV")).toHaveAttribute("aria-selected", "true");
    expect(cmp_NestedCountryPickerColumn).toBe(NestedCountryPickerColumn);
  });
});
