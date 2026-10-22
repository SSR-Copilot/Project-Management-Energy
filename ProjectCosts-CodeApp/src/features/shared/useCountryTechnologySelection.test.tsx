// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { useEffect, useMemo } from "react";
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

describe("UseCountryTechnologySelection (local state)", () => {
  it("UT-CTSEL-001 Gates: first country / first technology until a pick", () => {
    render(<Local rule={GATE_COUNTRY_RULE} techs={GATE_TECHNOLOGIES} policy={GATE_DEFAULT} />);
    expect(probe.current?.selection).toEqual({ countryId: "DE-ID", technology: TECHNOLOGY.wind });
    expect(probe.current?.isDefault).toBe(true);
    select({ countryId: "PL-ID", technology: TECHNOLOGY.pv });
    expect(probe.current?.selection).toEqual({ countryId: "PL-ID", technology: TECHNOLOGY.pv });
    expect(probe.current?.country?.name).toBe("Poland");
    expect(probe.current?.isDefault).toBe(false);
  });

  it("UT-CTSEL-002 Costs: Germany / Wind", () => {
    render(<Local rule={COST_COUNTRY_RULE} techs={COST_TECHNOLOGIES} policy={COST_DEFAULT} />);
    expect(probe.current?.selection).toEqual({ countryId: "DE-ID", technology: TECHNOLOGY.wind });
  });
});

describe("UseCountryTechnologyUrlSelection", () => {
  const mount = (path: string, history?: "push" | "replace") => render(
    <MemoryRouter initialEntries={["/start", path]} initialIndex={1}><Url {...(history ? { history } : {})} /></MemoryRouter>,
  );

  it("UT-CTSEL-003 Contracts: the default (first country / first technology) without params, and the URL stays clean", () => {
    mount("/settings/contracts");
    expect(probe.current?.selection).toEqual({ countryId: "DE-ID", technology: TECHNOLOGY.wind });
    expect(probe.current?.isDefault).toBe(true);
    // The default is display-only: nothing writes `?country&tech` on load (PO, 2026-10-17).
    expect(screen.getByTestId("search").textContent).toBe("");
  });

  it("UT-CTSEL-004 Reads a deep link ?country=<id>&tech=<code> (id case-insensitive)", () => {
    mount(`/settings/contracts?country=pl-id&tech=${TECHNOLOGY.bess}`);
    expect(probe.current?.selection).toEqual({ countryId: "PL-ID", technology: TECHNOLOGY.bess });
    expect(probe.current?.country?.name).toBe("Poland");
  });

  it("UT-CTSEL-005 Falls back to the default on an unknown pair and leaves the bad params in the URL", () => {
    mount("/settings/contracts?country=xx&tech=1");
    expect(probe.current?.selection).toEqual({ countryId: "DE-ID", technology: TECHNOLOGY.wind });
    expect(probe.current?.isDefault).toBe(true);
    expect(screen.getByTestId("search").textContent).toBe("?country=xx&tech=1");
  });

  it("UT-CTSEL-006 A pick writes the URL and pushes history, so Back restores the previous selection", () => {
    mount(`/settings/contracts?country=DE-ID&tech=${TECHNOLOGY.wind}`);
    select({ countryId: "PL-ID", technology: TECHNOLOGY.pv });
    expect(screen.getByTestId("search").textContent).toBe(`?country=PL-ID&tech=${TECHNOLOGY.pv}`);
    act(() => probe.navigate?.(-1));
    expect(probe.current?.selection).toEqual({ countryId: "DE-ID", technology: TECHNOLOGY.wind });
  });

  it("UT-CTSEL-007 History='replace' does not add an entry", () => {
    mount(`/settings/contracts?country=DE-ID&tech=${TECHNOLOGY.wind}`, "replace");
    select({ countryId: "PL-ID", technology: TECHNOLOGY.pv });
    act(() => probe.navigate?.(-1));
    // Back left the screen's entry entirely (it was replaced, not pushed), so no params remain
    // and the selection is the display default rather than either picked scope.
    expect(screen.getByTestId("search").textContent).toBe("");
    expect(probe.current?.selection).toEqual({ countryId: "DE-ID", technology: TECHNOLOGY.wind });
    expect(probe.current?.isDefault).toBe(true);
  });

  it("UT-CTSEL-008 Back after a pick from the clean URL returns to the default with no params", () => {
    mount("/settings/contracts");
    select({ countryId: "PL-ID", technology: TECHNOLOGY.pv });
    expect(screen.getByTestId("search").textContent).toBe(`?country=PL-ID&tech=${TECHNOLOGY.pv}`);
    expect(probe.current?.isDefault).toBe(false);
    act(() => probe.navigate?.(-1));
    expect(screen.getByTestId("search").textContent).toBe("");
    expect(probe.current?.selection).toEqual({ countryId: "DE-ID", technology: TECHNOLOGY.wind });
    expect(probe.current?.isDefault).toBe(true);
  });
});

describe("The default is derived, so late-arriving countries cannot overwrite a pick", () => {
  function UrlRows({ rows }: { rows: typeof ROWS }) {
    const countries = useMemo(() => pickerCountries(rows, CONTRACT_COUNTRY_RULE), [rows]);
    const selection = useCountryTechnologyUrlSelection({
      countries, technologies: CONTRACT_TECHNOLOGIES, defaultTo: CONTRACT_DEFAULT,
    });
    const location = useLocation();
    useEffect(() => { probe.current = selection; }, [selection]);
    return <span data-testid="search">{location.search}</span>;
  }

  function LocalRows({ rows }: { rows: typeof ROWS }) {
    const countries = useMemo(() => pickerCountries(rows, GATE_COUNTRY_RULE), [rows]);
    const selection = useCountryTechnologySelection({
      countries, technologies: GATE_TECHNOLOGIES, defaultTo: GATE_DEFAULT,
    });
    useEffect(() => { probe.current = selection; }, [selection]);
    return null;
  }

  it("UT-CTSEL-009 URL hook: the default settles when the list arrives, without writing the URL", () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={["/settings/contracts"]}><UrlRows rows={[]} /></MemoryRouter>,
    );
    expect(probe.current?.selection).toBeUndefined();
    rerender(<MemoryRouter initialEntries={["/settings/contracts"]}><UrlRows rows={ROWS} /></MemoryRouter>);
    expect(probe.current?.selection).toEqual({ countryId: "DE-ID", technology: TECHNOLOGY.wind });
    expect(probe.current?.isDefault).toBe(true);
    expect(screen.getByTestId("search").textContent).toBe("");
  });

  it("UT-CTSEL-010 URL hook: a pick made before the full list arrives survives it", () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={["/settings/contracts"]}><UrlRows rows={ROWS} /></MemoryRouter>,
    );
    select({ countryId: "PL-ID", technology: TECHNOLOGY.pv });
    rerender(<MemoryRouter initialEntries={["/settings/contracts"]}><UrlRows rows={ROWS} /></MemoryRouter>);
    expect(probe.current?.selection).toEqual({ countryId: "PL-ID", technology: TECHNOLOGY.pv });
    expect(probe.current?.isDefault).toBe(false);
  });

  it("UT-CTSEL-011 Local hook: a pick survives a later country list, and the default settles when it arrives", () => {
    const { rerender } = render(<LocalRows rows={[]} />);
    expect(probe.current?.selection).toBeUndefined();
    rerender(<LocalRows rows={ROWS} />);
    expect(probe.current?.selection).toEqual({ countryId: "DE-ID", technology: TECHNOLOGY.wind });
    select({ countryId: "PL-ID", technology: TECHNOLOGY.pv });
    rerender(<LocalRows rows={[...ROWS]} />);
    expect(probe.current?.selection).toEqual({ countryId: "PL-ID", technology: TECHNOLOGY.pv });
    expect(probe.current?.isDefault).toBe(false);
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

  it("UT-CTSEL-012 The default skips a country without technologies and a pick for it is refused", () => {
    render(<LocalPer />);
    expect(probe.current?.selection).toEqual({ countryId: "PL-ID", technology: COST_TECHNOLOGIES[0]!.code });
    select({ countryId: "AT-ID", technology: TECHNOLOGY.wind });
    expect(probe.current?.selection?.countryId).toBe("PL-ID");
    expect(probe.current?.isDefault).toBe(true);
  });
});
