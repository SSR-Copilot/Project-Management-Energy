// @vitest-environment jsdom
/**
 * The shared picker, in each screen's configuration.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FluentProvider } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import {
  CONTRACT_COUNTRY_RULE, COST_COUNTRY_RULE, GATE_COUNTRY_RULE, configuredCountryTechnologies, pickerCountries,
  type CountryTechnology,
} from "@/domain/countryPicker";
import { CONTRACT_TECHNOLOGIES, COST_TECHNOLOGIES, GATE_TECHNOLOGIES, TECHNOLOGY } from "@/domain/technology";
import { appliedMediaRules, appliedPseudoRules, appliedRules } from "@/test/appliedRules";
import { CountryTechnologyPicker, type CountryTechnologyPickerProps } from "./CountryTechnologyPicker";

const ROWS = [
  { id: "de", name: "Germany" }, { id: "fr", name: "France" }, { id: "pl", name: "Poland" },
  { id: "nl", name: "Netherlands" },
];

function Harness(props: Omit<CountryTechnologyPickerProps, "value" | "onChange"> & {
  initial?: CountryTechnology; spy?: (v: CountryTechnology) => void;
}) {
  const { initial, spy, ...rest } = props;
  const [value, setValue] = useState<CountryTechnology | undefined>(initial);
  return (
    <FluentProvider theme={vsbTheme}>
      <CountryTechnologyPicker {...rest} value={value} onChange={(v) => { spy?.(v); setValue(v); }} />
    </FluentProvider>
  );
}

const originalMatchMedia = window.matchMedia;
afterEach(() => { window.matchMedia = originalMatchMedia; });

describe("CountryTechnologyPicker — column", () => {
  it("UT-CTPICK-001 Costs: deny-list order, SVG flags, name is text, the selected country starts expanded", async () => {
    const spy = vi.fn();
    render(<Harness countries={pickerCountries(ROWS, COST_COUNTRY_RULE)} technologies={COST_TECHNOLOGIES}
      initial={{ countryId: "de", technology: TECHNOLOGY.wind }} spy={spy} />);
    const nav = screen.getByRole("navigation", { name: "Country and technology" });
    expect(within(nav).getAllByRole("listitem").filter((li) => li.parentElement?.parentElement === nav)
      .map((li) => li.textContent?.replace(/WindPV/, ""))).toEqual(["Germany", "France", "Poland", "Netherlands"]);
    // Three SVG flags plus the neutral tile for the unknown Netherlands (Costs behaviour).
    expect(within(nav).getAllByTestId("country-flag")).toHaveLength(4);
    expect(within(nav).queryByTestId("country-flag-code")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Germany Wind" })).toHaveAttribute("aria-current", "true");
    expect(screen.queryByRole("button", { name: "France Wind" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Germany" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Expand France" }));
    await userEvent.click(screen.getByRole("button", { name: "France PV" }));
    expect(spy).toHaveBeenCalledWith({ countryId: "fr", technology: TECHNOLOGY.pv });
    expect(screen.getByRole("button", { name: "France PV" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "Germany Wind" })).not.toHaveAttribute("aria-current");
  });

  it("UT-CTPICK-002 Gates: clicking a country selects it with its first technology and expands it", async () => {
    const spy = vi.fn();
    render(<Harness countries={pickerCountries(ROWS, GATE_COUNTRY_RULE)} technologies={GATE_TECHNOLOGIES}
      countryClick="select" initial={{ countryId: "de", technology: TECHNOLOGY.pv }} spy={spy}
      toggleLabel={(open, c) => `${open ? "Collapse" : "Expand"} ${c.name} technologies`} highlightCollapsedSelection />);
    expect(screen.queryByText("Netherlands")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Germany" })).toHaveAttribute("aria-current", "true");
    // Re-clicking the selected country keeps its current technology.
    await userEvent.click(screen.getByRole("button", { name: "Germany" }));
    expect(spy).toHaveBeenLastCalledWith({ countryId: "de", technology: TECHNOLOGY.pv });
    await userEvent.click(screen.getByRole("button", { name: "Poland" }));
    expect(spy).toHaveBeenLastCalledWith({ countryId: "pl", technology: TECHNOLOGY.wind });
    expect(screen.getByRole("button", { name: "Poland Wind" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "Collapse Poland technologies" })).toHaveAttribute("aria-expanded", "true");
  });

  it("UT-CTPICK-003 Gates: empty text when no configured country exists", () => {
    render(<Harness countries={[]} technologies={GATE_TECHNOLOGIES} emptyText="No configured countries were found." />);
    expect(screen.getByText("No configured countries were found.")).toBeInTheDocument();
  });

  it("UT-CTPICK-004 Contracts: code badges, country name toggles, BESS offered, nothing selected by default", async () => {
    const spy = vi.fn();
    render(<Harness countries={pickerCountries(ROWS, CONTRACT_COUNTRY_RULE)} technologies={CONTRACT_TECHNOLOGIES}
      flag="code" countryClick="toggle" spy={spy} />);
    expect(screen.getAllByTestId("country-flag-code").map((b) => b.textContent)).toEqual(["DE", "FR", "PL"]);
    const country = screen.getByRole("button", { name: "France" });
    expect(country).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(country);
    expect(country).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(screen.getByRole("button", { name: "France BESS" }));
    expect(spy).toHaveBeenCalledWith({ countryId: "fr", technology: TECHNOLOGY.bess });
    await userEvent.click(country);
    expect(screen.queryByRole("button", { name: "France BESS" })).not.toBeInTheDocument();
  });

  it("UT-CTPICK-005 Keyboard: Tab to the expander, Enter expands, Space selects", async () => {
    const spy = vi.fn();
    render(<Harness countries={pickerCountries(ROWS, COST_COUNTRY_RULE)} technologies={COST_TECHNOLOGIES} spy={spy} />);
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole("button", { name: "Expand Germany" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.tab();
    expect(screen.getByRole("button", { name: "Germany Wind" })).toHaveFocus();
    await user.keyboard(" ");
    expect(spy).toHaveBeenCalledWith({ countryId: "de", technology: TECHNOLOGY.wind });
  });

  it("UT-CTPICK-006 Expands a country selected from outside (back / forward)", () => {
    const countries = pickerCountries(ROWS, CONTRACT_COUNTRY_RULE);
    const { rerender } = render(
      <FluentProvider theme={vsbTheme}>
        <CountryTechnologyPicker countries={countries} technologies={CONTRACT_TECHNOLOGIES} value={undefined} onChange={() => {}} />
      </FluentProvider>,
    );
    expect(screen.queryByRole("button", { name: "Poland PV" })).not.toBeInTheDocument();
    rerender(
      <FluentProvider theme={vsbTheme}>
        <CountryTechnologyPicker countries={countries} technologies={CONTRACT_TECHNOLOGIES}
          value={{ countryId: "pl", technology: TECHNOLOGY.pv }} onChange={() => {}} />
      </FluentProvider>,
    );
    expect(screen.getByRole("button", { name: "Poland PV" })).toHaveAttribute("aria-current", "true");
  });
});

describe("CountryTechnologyPicker — compact", () => {
  it("UT-CTPICK-007 Compact='auto' renders the dropdown pair below 960 px", async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(max-width: 959px)", media: query,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    const spy = vi.fn();
    render(<Harness countries={pickerCountries(ROWS, CONTRACT_COUNTRY_RULE)} technologies={CONTRACT_TECHNOLOGIES}
      compact="auto" spy={spy} />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    const tech = screen.getByRole("combobox", { name: "Technology" });
    expect(tech).toBeDisabled();
    await userEvent.click(screen.getByRole("combobox", { name: "Country" }));
    await userEvent.click(screen.getByRole("option", { name: "Poland" }));
    await userEvent.click(screen.getByRole("combobox", { name: "Technology" }));
    await userEvent.click(screen.getByRole("option", { name: "BESS" }));
    expect(spy).toHaveBeenCalledWith({ countryId: "pl", technology: TECHNOLOGY.bess });
  });

  it("UT-CTPICK-008 Compact='auto' keeps the column when wide (or without matchMedia)", () => {
    render(<Harness countries={pickerCountries(ROWS, CONTRACT_COUNTRY_RULE)} technologies={CONTRACT_TECHNOLOGIES} compact="auto" />);
    expect(screen.getByRole("navigation", { name: "Country and technology" })).toBeInTheDocument();
  });
});

describe("CountryTechnologyPicker — E6 per-country technologies", () => {
  const techFor = configuredCountryTechnologies(COST_TECHNOLOGIES);

  it("UT-CTPICK-009 Wide: a country with an empty list has no expander and no technologies; configured ones do", async () => {
    render(<Harness countries={pickerCountries(ROWS, COST_COUNTRY_RULE)} technologies={COST_TECHNOLOGIES}
      technologiesFor={techFor} initial={{ countryId: "de", technology: TECHNOLOGY.wind }} />);
    expect(screen.queryByRole("button", { name: "Expand Netherlands" })).not.toBeInTheDocument();
    expect(screen.getByText("Netherlands")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand France" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Germany Wind" })).toBeInTheDocument();
  });

  it("UT-CTPICK-010 Wide, countryClick=select: clicking a country without technologies selects nothing", async () => {
    const spy = vi.fn();
    render(<Harness countries={pickerCountries(ROWS, COST_COUNTRY_RULE)} technologies={COST_TECHNOLOGIES}
      technologiesFor={techFor} countryClick="select" spy={spy} />);
    await userEvent.click(screen.getByRole("button", { name: "Netherlands" }));
    expect(spy).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "France" }));
    expect(spy).toHaveBeenCalledWith({ countryId: "fr", technology: COST_TECHNOLOGIES[0]!.code });
  });

  it("UT-CTPICK-011 Compact: a country without technologies disables Technology and shows emptyText; ariaLabel names the group", async () => {
    const spy = vi.fn();
    render(<Harness countries={pickerCountries(ROWS, COST_COUNTRY_RULE)} technologies={COST_TECHNOLOGIES}
      technologiesFor={techFor} compact emptyText="No technologies for this country" ariaLabel="Scope" spy={spy} />);
    expect(screen.getByRole("group", { name: "Scope" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("combobox", { name: "Country" }));
    await userEvent.click(screen.getByRole("option", { name: "Netherlands" }));
    const tech = screen.getByRole("combobox", { name: "Technology" });
    expect(tech).toBeDisabled();
    expect(tech).toHaveTextContent("No technologies for this country");
    expect(spy).not.toHaveBeenCalled();
  });

  it("UT-CTPICK-012 Compact without the new props renders as before (no group, no flags)", () => {
    render(<Harness countries={pickerCountries(ROWS, CONTRACT_COUNTRY_RULE)} technologies={CONTRACT_TECHNOLOGIES} compact flag="code" />);
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Technology" })).toBeDisabled();
  });

  it("UT-CTPICK-013 Compact: emptyText replaces an empty country list", () => {
    render(<Harness countries={[]} technologies={GATE_TECHNOLOGIES} compact emptyText="No configured countries" />);
    expect(screen.getByText("No configured countries")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});

/**
 * Canvas parity. jsdom has no layout, so the
 * spec's px values are asserted as the Griffel rules / attributes the elements carry.
 */
describe("CountryTechnologyPicker — canvas look", () => {
  const norm = (v: string | undefined) => v?.replace(/\s+/g, "");
  const GREY = "rgba(0,0,0,0.1)"; // jsdom serialises #ffffff / #BFBFBF as rgb(...)
  const nav = () => screen.getByRole("navigation", { name: "Country and technology" });
  /** The 50 px country row of `name` (first child of its list item). */
  const rowOf = (name: string) => {
    const li = within(nav()).getByText(name).closest("li");
    return li!.firstElementChild as HTMLElement;
  };
  const flagOf = (name: string) => within(rowOf(name)).getByTestId(/^country-flag/);
  const renderCosts = (initial?: CountryTechnology, extra: Partial<Parameters<typeof Harness>[0]> = {}) => render(
    <Harness countries={pickerCountries(ROWS, COST_COUNTRY_RULE)} technologies={COST_TECHNOLOGIES}
      initial={initial} {...extra} />,
  );

  it("UT-CTPICK-014 The column owns a fixed 200 px width, flush, with no padding and no height", () => {
    renderCosts({ countryId: "de", technology: TECHNOLOGY.wind });
    const rules = appliedRules(nav());
    expect(rules["width"]).toBe("200px");
    expect(rules["min-width"]).toBe("200px");
    expect(rules["flex-shrink"]).toBe("0");
    expect(rules["box-sizing"]).toBe("border-box");
    expect(rules["background-color"]).toBe("rgb(255, 255, 255)");
    expect(rules["box-shadow"]).toBeTruthy();
    for (const side of ["top", "bottom", "left", "right"]) expect(parseFloat(rules[`padding-${side}`] ?? "0")).toBe(0);
  });

  it("UT-CTPICK-015 Narrow (< 900 px) keeps the fixed 200 px: no width:100% override, still not stretched", () => {
    renderCosts();
    const narrow = appliedMediaRules(nav(), "max-width: 899px");
    expect(narrow["width"]).toBeUndefined();
    expect(narrow["min-width"]).toBeUndefined();
    expect(narrow["align-self"]).toBe("auto");
    expect(narrow["max-width"]).toBe("100%");
  });

  it("UT-CTPICK-016 Country rows are 50 px with 8 px left padding", () => {
    renderCosts({ countryId: "de", technology: TECHNOLOGY.wind });
    for (const name of ["Germany", "France"]) {
      const rules = appliedRules(rowOf(name));
      expect(rules["height"]).toBe("50px");
      expect(rules["padding-left"]).toBe("8px");
      expect(rules["box-sizing"]).toBe("border-box");
    }
  });

  it("UT-CTPICK-017 The +/- is a boxed 16 x 16 button placed BEFORE the flag, with no text", () => {
    renderCosts();
    const toggle = screen.getByRole("button", { name: "Expand Germany" });
    const rules = appliedRules(toggle);
    expect(rules["width"]).toBe("16px");
    expect(rules["height"]).toBe("16px");
    expect(rules["box-sizing"]).toBe("border-box");
    expect(rules["border-top-width"]).toBe("1px");
    expect(rules["border-left-style"]).toBe("solid");
    expect(norm(rules["border-top-color"])).toBe("rgb(53,61,63)");
    expect(rules["border-top-left-radius"]).toBe("4px");
    expect(rules["background-color"]).toBe("transparent");
    expect(norm(appliedPseudoRules(toggle, ":hover")["background-color"])).toBe("rgb(237,237,237)");
    expect(toggle.textContent).toBe("");
    expect(toggle.querySelector("svg")).not.toBeNull();
    const flag = flagOf("Germany");
    expect(toggle.compareDocumentPosition(flag) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(toggle.parentElement).toBe(rowOf("Germany"));
  });

  it("UT-CTPICK-018 Flags are 36 x 24, and 40 x 28 for the selected country (SVG, badge and stretched)", () => {
    renderCosts({ countryId: "de", technology: TECHNOLOGY.wind });
    const de = flagOf("Germany");
    const fr = flagOf("France");
    expect([fr.getAttribute("width"), fr.getAttribute("height")]).toEqual(["36", "24"]);
    expect([de.getAttribute("width"), de.getAttribute("height")]).toEqual(["40", "28"]);
    expect(de.getAttribute("preserveAspectRatio")).toBe("none");
    const flagRules = appliedRules(fr);
    expect(flagRules["border-radius"]).toBe("4px");
    expect(flagRules["box-shadow"]).toContain("shadow8");
  });

  it("UT-CTPICK-019 Code badges follow the same boxes", () => {
    render(<Harness countries={pickerCountries(ROWS, CONTRACT_COUNTRY_RULE)} technologies={CONTRACT_TECHNOLOGIES}
      flag="code" initial={{ countryId: "de", technology: TECHNOLOGY.wind }} />);
    const [de, fr] = screen.getAllByTestId("country-flag-code");
    expect([appliedRules(fr!)["width"], appliedRules(fr!)["height"]]).toEqual(["36px", "24px"]);
    expect([appliedRules(de!)["width"], appliedRules(de!)["height"]]).toEqual(["40px", "28px"]);
  });

  it("UT-CTPICK-020 The spacer after the +/- is 12 px, 10 px when selected; 28 / 26 px with no +/-", () => {
    const techFor = configuredCountryTechnologies(COST_TECHNOLOGIES);
    renderCosts({ countryId: "de", technology: TECHNOLOGY.wind }, { technologiesFor: techFor });
    const spacer = (name: string) => appliedRules(rowOf(name).querySelector("span[aria-hidden]")!)["width"];
    expect(spacer("France")).toBe("12px");
    expect(spacer("Germany")).toBe("10px");
    expect(spacer("Netherlands")).toBe("28px");
    expect(rowOf("Netherlands").querySelector("button")).toBeNull();
  });

  it("UT-CTPICK-021 The name box is 132 px wide with 8 px text padding: 14 px regular, 16 px semibold selected", () => {
    renderCosts({ countryId: "de", technology: TECHNOLOGY.wind });
    const fr = appliedRules(within(nav()).getByText("France"));
    const de = appliedRules(within(nav()).getByText("Germany"));
    expect(fr["width"]).toBe("132px");
    expect(fr["padding-left"]).toBe("8px");
    expect(fr["font-size"]).toContain("fontSizeBase300");
    expect(fr["font-weight"]).toContain("fontWeightRegular");
    expect(de["font-size"]).toContain("fontSizeBase400");
    expect(de["font-weight"]).toContain("fontWeightSemibold");
  });

  it("UT-CTPICK-022 The grey band shows on a selected, COLLAPSED country only (highlightCollapsedSelection)", async () => {
    renderCosts({ countryId: "de", technology: TECHNOLOGY.wind }, { highlightCollapsedSelection: true });
    expect(norm(appliedRules(rowOf("Germany"))["background-color"])).toBeUndefined(); // expanded: transparent
    await userEvent.click(screen.getByRole("button", { name: "Collapse Germany" }));
    expect(norm(appliedRules(rowOf("Germany"))["background-color"])).toBe(GREY);
    expect(appliedRules(rowOf("France"))["background-color"]).toBeUndefined();
  });

  it("UT-CTPICK-023 Technology rows are 35 px, text at x = 40, full width with NO margin (nothing overflows 200 px)", () => {
    renderCosts({ countryId: "de", technology: TECHNOLOGY.wind });
    for (const name of ["Germany Wind", "Germany PV"]) {
      const rules = appliedRules(screen.getByRole("button", { name }));
      expect(rules["height"]).toBe("35px");
      expect(rules["padding-left"]).toBe("40px");
      expect(rules["width"]).toBe("100%");
      expect(rules["box-sizing"]).toBe("border-box");
      for (const side of ["left", "right"]) expect(parseFloat(rules[`margin-${side}`] ?? "0")).toBe(0);
      expect(rules["border-left-style"]).toBe("none");
    }
  });

  it("UT-CTPICK-024 Selected technology: grey fill, 16 px semibold, white tick; unselected: opaque white, regular, grey tick", () => {
    renderCosts({ countryId: "de", technology: TECHNOLOGY.wind });
    const wind = screen.getByRole("button", { name: "Germany Wind" });
    const pv = screen.getByRole("button", { name: "Germany PV" });
    expect(norm(appliedRules(wind)["background-color"])).toBe(GREY);
    expect(appliedRules(wind)["font-size"]).toContain("fontSizeBase400");
    expect(appliedRules(wind)["font-weight"]).toContain("fontWeightSemibold");
    expect(appliedPseudoRules(wind, "::after")["background-color"]).toBe("rgb(255, 255, 255)");
    expect(appliedRules(pv)["background-color"]).toBe("rgb(255, 255, 255)");
    expect(appliedRules(pv)["font-size"]).toContain("fontSizeBase300");
    expect(appliedPseudoRules(pv, "::after")["background-color"]).toBe("rgb(191, 191, 191)");
  });

  it("UT-CTPICK-025 A selected technology of a NON-selected country is not highlighted (child AND country)", async () => {
    renderCosts({ countryId: "de", technology: TECHNOLOGY.wind });
    await userEvent.click(screen.getByRole("button", { name: "Expand France" }));
    const frWind = screen.getByRole("button", { name: "France Wind" });
    expect(frWind).not.toHaveAttribute("aria-current");
    expect(appliedRules(frWind)["background-color"]).toBe("rgb(255, 255, 255)");
    expect(appliedRules(frWind)["font-size"]).toContain("fontSizeBase300");
    expect(appliedPseudoRules(frWind, "::after")["background-color"]).toBe("rgb(191, 191, 191)");
  });

  it("UT-CTPICK-026 Tree connector: grey #BFBFBF (never blue), vertical at x = 16, tick 16 px at y = 17, last line ends at 19", () => {
    renderCosts({ countryId: "de", technology: TECHNOLOGY.pv });
    const wind = screen.getByRole("button", { name: "Germany Wind" });
    const pv = screen.getByRole("button", { name: "Germany PV" });
    for (const row of [wind, pv]) {
      const line = appliedPseudoRules(row, "::before");
      expect(line["background-color"]).toBe("rgb(191, 191, 191)");
      expect(line["left"]).toBe("16px");
      expect(line["width"]).toBe("1px");
      expect(line["top"]).toBe("0px");
      const tick = appliedPseudoRules(row, "::after");
      expect([tick["left"], tick["top"], tick["width"], tick["height"]]).toEqual(["16px", "17px", "16px", "1px"]);
    }
    expect(appliedPseudoRules(wind, "::before")["height"]).toBe("35px");
    expect(appliedPseudoRules(pv, "::before")["height"]).toBe("19px");
    expect(appliedPseudoRules(wind, "::after")["background-color"]).toBe("rgb(191, 191, 191)");
    expect(appliedPseudoRules(pv, "::after")["background-color"]).toBe("rgb(255, 255, 255)");
    expect(nav().innerHTML.toLowerCase()).not.toContain("0078d4");
  });

  it("UT-CTPICK-027 The +/- only toggles expansion: it never changes the selected country", async () => {
    const spy = vi.fn();
    renderCosts({ countryId: "de", technology: TECHNOLOGY.wind }, { spy });
    await userEvent.click(screen.getByRole("button", { name: "Expand France" }));
    await userEvent.click(screen.getByRole("button", { name: "Collapse Germany" }));
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Expand Germany" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Collapse France" })).toHaveAttribute("aria-expanded", "true");
  });

  it("UT-CTPICK-028 The name button (select / toggle) fills the row after the +/-, keeping its accessible name", () => {
    render(<Harness countries={pickerCountries(ROWS, GATE_COUNTRY_RULE)} technologies={GATE_TECHNOLOGIES}
      countryClick="select" initial={{ countryId: "de", technology: TECHNOLOGY.wind }} />);
    const name = screen.getByRole("button", { name: "Germany" });
    const toggle = screen.getByRole("button", { name: "Collapse Germany" });
    expect(toggle.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(name.parentElement).toBe(toggle.parentElement);
    expect(within(name).getByTestId("country-flag")).toBeInTheDocument();
  });
});

/**
 * Rail-height parity.
 *
 * jsdom has no layout engine — `offsetHeight` / `getBoundingClientRect()` are always 0, so
 * `expect(picker.offsetHeight).toBe(rail.offsetHeight)` would pass `0 === 0` both before and
 * after the change. The rules are asserted instead: Griffel's DOM renderer injects real
 * `<style>` elements in jsdom, so the declarations that apply to the nav can be read back off
 * `document.styleSheets` by its own atomic class names.
 */
describe("CountryTechnologyPicker — rail-height parity", () => {
  const column = () => appliedRules(screen.getByRole("navigation", { name: "Country and technology" }));

  it("UT-CTPICK-029 Never scrolls inside itself — the PO's 'no scrollbar in the picker'", () => {
    render(<Harness countries={pickerCountries(ROWS, CONTRACT_COUNTRY_RULE)} technologies={CONTRACT_TECHNOLOGIES} flag="code" />);
    const overflowY = column()["overflow-y"];
    expect(overflowY).not.toBe("auto");
    expect(overflowY).not.toBe("scroll");
  });

  it("UT-CTPICK-030 Stretches to its row, which is what makes it the left navigation's height", () => {
    render(<Harness countries={pickerCountries(ROWS, CONTRACT_COUNTRY_RULE)} technologies={CONTRACT_TECHNOLOGIES} flag="code" />);
    expect(column()["align-self"]).toBe("stretch");
  });

  it("UT-CTPICK-031 Imposes no fixed height (a percentage height would clip or scroll instead)", () => {
    render(<Harness countries={pickerCountries(ROWS, CONTRACT_COUNTRY_RULE)} technologies={CONTRACT_TECHNOLOGIES} flag="code" />);
    const rules = column();
    expect(rules["height"]).toBeUndefined();
    expect(rules["max-height"]).toBeUndefined();
  });

  it("UT-CTPICK-032 Renders every row of a long Costs list — nothing is clipped or virtualised", () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ id: `c${i}`, name: `Country ${String(i).padStart(2, "0")}` }));
    const countries = pickerCountries(many, COST_COUNTRY_RULE);
    expect(countries).toHaveLength(25);
    render(<Harness countries={countries} technologies={COST_TECHNOLOGIES} />);
    const nav = screen.getByRole("navigation", { name: "Country and technology" });
    const rows = within(nav).getAllByRole("listitem").filter((li) => li.parentElement?.parentElement === nav);
    expect(rows).toHaveLength(25);
    for (const c of countries) expect(within(nav).getByText(c.name)).toBeInTheDocument();
  });

  it("UT-CTPICK-033 Leaves the compact dropdown pair without any stretch or overflow rule", () => {
    render(<Harness countries={pickerCountries(ROWS, CONTRACT_COUNTRY_RULE)} technologies={CONTRACT_TECHNOLOGIES}
      compact ariaLabel="Scope" />);
    const rules = appliedRules(screen.getByRole("group", { name: "Scope" }));
    expect(rules["align-self"]).toBeUndefined();
    expect(rules["overflow-y"]).toBeUndefined();
  });
});
