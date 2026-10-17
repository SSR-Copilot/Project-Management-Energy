// @vitest-environment jsdom
/**
 * M6 — the shared picker, in each screen's configuration.
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
  it("Costs: deny-list order, SVG flags, name is text, the selected country starts expanded", async () => {
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

  it("Gates: clicking a country selects it with its first technology and expands it", async () => {
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

  it("Gates: empty text when no configured country exists", () => {
    render(<Harness countries={[]} technologies={GATE_TECHNOLOGIES} emptyText="No configured countries were found." />);
    expect(screen.getByText("No configured countries were found.")).toBeInTheDocument();
  });

  it("Contracts: code badges, country name toggles, BESS offered, nothing selected by default", async () => {
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

  it("keyboard: Tab to the expander, Enter expands, Space selects", async () => {
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

  it("expands a country selected from outside (back / forward, Contracts B-6)", () => {
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
  it("compact='auto' renders the dropdown pair below 960 px", async () => {
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

  it("compact='auto' keeps the column when wide (or without matchMedia)", () => {
    render(<Harness countries={pickerCountries(ROWS, CONTRACT_COUNTRY_RULE)} technologies={CONTRACT_TECHNOLOGIES} compact="auto" />);
    expect(screen.getByRole("navigation", { name: "Country and technology" })).toBeInTheDocument();
  });
});

describe("CountryTechnologyPicker — E6 per-country technologies", () => {
  const techFor = configuredCountryTechnologies(COST_TECHNOLOGIES);

  it("wide: a country with an empty list has no expander and no technologies; configured ones do", async () => {
    render(<Harness countries={pickerCountries(ROWS, COST_COUNTRY_RULE)} technologies={COST_TECHNOLOGIES}
      technologiesFor={techFor} initial={{ countryId: "de", technology: TECHNOLOGY.wind }} />);
    expect(screen.queryByRole("button", { name: "Expand Netherlands" })).not.toBeInTheDocument();
    expect(screen.getByText("Netherlands")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand France" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Germany Wind" })).toBeInTheDocument();
  });

  it("wide, countryClick=select: clicking a country without technologies selects nothing", async () => {
    const spy = vi.fn();
    render(<Harness countries={pickerCountries(ROWS, COST_COUNTRY_RULE)} technologies={COST_TECHNOLOGIES}
      technologiesFor={techFor} countryClick="select" spy={spy} />);
    await userEvent.click(screen.getByRole("button", { name: "Netherlands" }));
    expect(spy).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "France" }));
    expect(spy).toHaveBeenCalledWith({ countryId: "fr", technology: COST_TECHNOLOGIES[0]!.code });
  });

  it("compact: a country without technologies disables Technology and shows emptyText; ariaLabel names the group", async () => {
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

  it("compact without the new props renders as before (no group, no flags)", () => {
    render(<Harness countries={pickerCountries(ROWS, CONTRACT_COUNTRY_RULE)} technologies={CONTRACT_TECHNOLOGIES} compact flag="code" />);
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Technology" })).toBeDisabled();
  });

  it("compact: emptyText replaces an empty country list", () => {
    render(<Harness countries={[]} technologies={GATE_TECHNOLOGIES} compact emptyText="No configured countries" />);
    expect(screen.getByText("No configured countries")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});