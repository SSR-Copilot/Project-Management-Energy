// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { useEffect } from "react";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import {
  CONTRACT_COUNTRY_RULE, CONTRACT_DEFAULT, COST_COUNTRY_RULE, COST_DEFAULT, GATE_COUNTRY_RULE, GATE_DEFAULT,
  configuredCountryTechnologies, pickerCountries, type CountryTechnology,
} from "@/domain/countryPicker";
import { CONTRACT_TECHNOLOGIES, COST_TECHNOLOGIES, GATE_TECHNOLOGIES, TECHNOLOGY } from "@/domain/technology";
import {
  useCountryTechnologySelection, useCountryTechnologyUrlSelection, type CountryTechnologySelection,
} from "./useCountryTechnologySelection";

const ROWS = [{ id: "DE-ID", name: "Germany" }, { id: "PL-ID", name: "Poland" }];
const probe: { current?: CountryTechnologySelection; navigate?: (to: string | number) => void } = {};

function Local({ rule, techs, policy }: { rule: typeof GATE_COUNTRY_RULE; techs: typeof GATE_TECHNOLOGIES; policy: typeof GATE_DEFAULT }) {
  const selection = useCountryTechnologySelection({ countries: pickerCountries(ROWS, rule), technologies: techs, defaultTo: policy });
  useEffect(() => { probe.current = selection; }, [selection]);
  return null;
}

function Url({ history }: { history?: "push" | "replace" }) {
  const selection = useCountryTechnologyUrlSelection({
    countries: pickerCountries(ROWS, CONTRACT_COUNTRY_RULE), technologies: CONTRACT_TECHNOLOGIES,
    defaultTo: CONTRACT_DEFAULT, ...(history ? { history } : {}),
  });
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    probe.current = selection;
    probe.navigate = (to) => (typeof to === "number" ? navigate(to) : navigate(to));
  }, [selection, navigate]);
  return <span data-testid="search">{location.search}</span>;
}

const select = (next: CountryTechnology) => act(() => probe.current?.select(next));

describe("useCountryTechnologySelection (local state)", () => {
  it("Gates: first country / first technology until a pick", () => {
    render(<Local rule={GATE_COUNTRY_RULE} techs={GATE_TECHNOLOGIES} policy={GATE_DEFAULT} />);
    expect(probe.current?.selection).toEqual({ countryId: "DE-ID", technology: TECHNOLOGY.wind });
    expect(probe.current?.isDefault).toBe(true);
    select({ countryId: "PL-ID", technology: TECHNOLOGY.pv });
    expect(probe.current?.selection).toEqual({ countryId: "PL-ID", technology: TECHNOLOGY.pv });
    expect(probe.current?.country?.name).toBe("Poland");
    expect(probe.current?.isDefault).toBe(false);
  });

  it("Costs: Germany / Wind", () => {
    render(<Local rule={COST_COUNTRY_RULE} techs={COST_TECHNOLOGIES} policy={COST_DEFAULT} />);
    expect(probe.current?.selection).toEqual({ countryId: "DE-ID", technology: TECHNOLOGY.wind });
  });
});

describe("useCountryTechnologyUrlSelection", () => {
  const mount = (path: string, history?: "push" | "replace") => render(
    <MemoryRouter initialEntries={["/start", path]} initialIndex={1}><Url {...(history ? { history } : {})} /></MemoryRouter>,
  );

  it("Contracts: nothing selected without params (D-29)", () => {
    mount("/settings/contracts");
    expect(probe.current?.selection).toBeUndefined();
    expect(probe.current?.isDefault).toBe(true);
  });

  it("reads a deep link ?country=<id>&tech=<code> (id case-insensitive)", () => {
    mount(`/settings/contracts?country=pl-id&tech=${TECHNOLOGY.bess}`);
    expect(probe.current?.selection).toEqual({ countryId: "PL-ID", technology: TECHNOLOGY.bess });
    expect(probe.current?.country?.name).toBe("Poland");
  });

  it("ignores an unknown pair", () => {
    mount("/settings/contracts?country=xx&tech=1");
    expect(probe.current?.selection).toBeUndefined();
  });

  it("a pick writes the URL and pushes history, so Back restores the previous selection", () => {
    mount(`/settings/contracts?country=DE-ID&tech=${TECHNOLOGY.wind}`);
    select({ countryId: "PL-ID", technology: TECHNOLOGY.pv });
    expect(screen.getByTestId("search").textContent).toBe(`?country=PL-ID&tech=${TECHNOLOGY.pv}`);
    act(() => probe.navigate?.(-1));
    expect(probe.current?.selection).toEqual({ countryId: "DE-ID", technology: TECHNOLOGY.wind });
  });

  it("history='replace' does not add an entry", () => {
    mount(`/settings/contracts?country=DE-ID&tech=${TECHNOLOGY.wind}`, "replace");
    select({ countryId: "PL-ID", technology: TECHNOLOGY.pv });
    act(() => probe.navigate?.(-1));
    expect(probe.current?.selection).toBeUndefined();
  });
});

describe("E6: technologiesFor through the selection hooks", () => {
  const ROWS3 = [{ id: "AT-ID", name: "Austria" }, { id: "PL-ID", name: "Poland" }];
  const techFor = configuredCountryTechnologies(COST_TECHNOLOGIES);

  function LocalPer() {
    const selection = useCountryTechnologySelection({
      countries: pickerCountries(ROWS3, COST_COUNTRY_RULE), technologies: COST_TECHNOLOGIES,
      defaultTo: GATE_DEFAULT, technologiesFor: techFor,
    });
    useEffect(() => { probe.current = selection; }, [selection]);
    return null;
  }

  it("the default skips a country without technologies and a pick for it is refused", () => {
    render(<LocalPer />);
    expect(probe.current?.selection).toEqual({ countryId: "PL-ID", technology: COST_TECHNOLOGIES[0]!.code });
    select({ countryId: "AT-ID", technology: TECHNOLOGY.wind });
    expect(probe.current?.selection?.countryId).toBe("PL-ID");
    expect(probe.current?.isDefault).toBe(true);
  });
});