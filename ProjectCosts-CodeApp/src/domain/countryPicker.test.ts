/**
 * The shared picker model reproduces each screen's CURRENT rule (the expected values are
 * what `project-gates/rules.ts railCountries`, `costs/rules.ts pickerCountries` and
 * `contracts/rules.ts buildPickerCountries` return today for the same rows).
 */
import { describe, expect, it } from "vitest";
import {
  CONTRACT_COUNTRY_RULE, CONTRACT_DEFAULT, COST_COUNTRY_RULE, COST_DEFAULT, GATE_COUNTRY_RULE, GATE_DEFAULT,
  PICKER_COUNTRIES, configuredCountryTechnologies, defaultSelection, isSelectable, parseSelectionParams,
  pickerCountries, pickerCountryConfig, sameCountryTechnology, scopeBreadcrumb,
  type CountryRow, type DefaultSelection,
} from "./countryPicker";
import { CONTRACT_TECHNOLOGIES, COST_TECHNOLOGIES, GATE_TECHNOLOGIES, TECHNOLOGY } from "./technology";

const ROWS: CountryRow[] = [
  { id: "es", name: "Spain" },
  { id: "hr", name: "Croatia" },
  { id: "de", name: "Germany", isoCurrencyCode: "EUR" },
  { id: "pl", name: "Poland", isoCurrencyCode: "PLN" },
  { id: "nl", name: "Netherlands" },
  { id: "fr", name: " france " },
  { id: "it", name: "Italy" },
  { id: "gr", name: "Greece" },
  { id: "at", name: "Austria" },
];

describe("PICKER_COUNTRIES", () => {
  it("UT-CTRYPICK-001 Is the canvas order DE, FR, PL, IT, FI, HR", () => {
    expect(PICKER_COUNTRIES.map((c) => c.iso2)).toEqual(["DE", "FR", "PL", "IT", "FI", "HR"]);
    expect(PICKER_COUNTRIES.map((c) => c.order)).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("UT-CTRYPICK-002 Looks a config up exactly, then case-insensitively", () => {
    expect(pickerCountryConfig("Italy")?.iso2).toBe("IT");
    expect(pickerCountryConfig(" FINLAND ")?.iso2).toBe("FI");
    expect(pickerCountryConfig("Spain")).toBeUndefined();
  });
});

describe("PickerCountries", () => {
  it("UT-CTRYPICK-003 Project Gates: allow-list, case-insensitive trimmed, configured names, fixed order", () => {
    const list = pickerCountries(ROWS, GATE_COUNTRY_RULE);
    expect(list.map((c) => [c.id, c.name, c.order, c.code])).toEqual([
      ["de", "Germany", 1, "DE"], ["fr", "France", 2, "FR"], ["pl", "Poland", 3, "PL"],
      ["it", "Italy", 4, "IT"], ["hr", "Croatia", 6, "HR"],
    ]);
  });

  it("UT-CTRYPICK-004 Contracts: allow-list with EXACT names (\" france \" does not match), row kept", () => {
    const list = pickerCountries(ROWS, CONTRACT_COUNTRY_RULE);
    expect(list.map((c) => c.id)).toEqual(["de", "pl", "it", "hr"]);
    expect(list[0]?.isoCurrencyCode).toBe("EUR");
  });

  it("UT-CTRYPICK-005 Costs: deny-list, the six ranked first, unknown countries appended alphabetically", () => {
    const list = pickerCountries(ROWS, COST_COUNTRY_RULE);
    expect(list.map((c) => c.name)).toEqual([
      "Germany", "Poland", "Italy", "Croatia", " france ", "Austria", "Netherlands",
    ]);
    expect(list.find((c) => c.id === "nl")?.code).toBe("");
  });

  it("UT-CTRYPICK-006 Returns an empty list for no rows", () => {
    expect(pickerCountries([], GATE_COUNTRY_RULE)).toEqual([]);
    expect(pickerCountries([], COST_COUNTRY_RULE)).toEqual([]);
  });
});

describe("DefaultSelection", () => {
  const gates = pickerCountries(ROWS, GATE_COUNTRY_RULE);
  it("UT-CTRYPICK-007 Gates: first country, first technology", () => {
    expect(defaultSelection(gates, GATE_TECHNOLOGIES, GATE_DEFAULT)).toEqual({ countryId: "de", technology: TECHNOLOGY.wind });
  });
  it("UT-CTRYPICK-008 Costs: Germany / Wind, else the first listed country with Wind", () => {
    const costs = pickerCountries(ROWS, COST_COUNTRY_RULE);
    expect(defaultSelection(costs, COST_TECHNOLOGIES, COST_DEFAULT)).toEqual({ countryId: "de", technology: TECHNOLOGY.wind });
    const noGermany = pickerCountries(ROWS.filter((r) => r.id !== "de"), COST_COUNTRY_RULE);
    expect(defaultSelection(noGermany, COST_TECHNOLOGIES, COST_DEFAULT)).toEqual({ countryId: "pl", technology: TECHNOLOGY.wind });
  });
  it("UT-CTRYPICK-009 Costs: the retired `preferred Germany/Wind` policy agrees with the `first` constant", () => {
    const preferred: DefaultSelection = { kind: "preferred", countryName: "Germany", technology: TECHNOLOGY.wind };
    const techFor = configuredCountryTechnologies(COST_TECHNOLOGIES);
    const costs = pickerCountries(ROWS, COST_COUNTRY_RULE);
    const noGermany = pickerCountries(ROWS.filter((r) => r.id !== "de"), COST_COUNTRY_RULE);
    expect(defaultSelection(costs, COST_TECHNOLOGIES, COST_DEFAULT, techFor)).toEqual({ countryId: "de", technology: TECHNOLOGY.wind });
    expect(defaultSelection(noGermany, COST_TECHNOLOGIES, COST_DEFAULT, techFor)).toEqual({ countryId: "pl", technology: TECHNOLOGY.wind });
    for (const list of [costs, noGermany]) {
      expect(defaultSelection(list, COST_TECHNOLOGIES, COST_DEFAULT, techFor))
        .toEqual(defaultSelection(list, COST_TECHNOLOGIES, preferred, techFor));
    }
  });
  it("UT-CTRYPICK-010 Contracts: first country, first technology (product-owner decision: no empty default)", () => {
    const contracts = pickerCountries(ROWS, CONTRACT_COUNTRY_RULE);
    expect(defaultSelection(contracts, CONTRACT_TECHNOLOGIES, CONTRACT_DEFAULT))
      .toEqual({ countryId: "de", technology: TECHNOLOGY.wind });
  });
  it("UT-CTRYPICK-011 The `none` policy is still supported, though no screen uses it", () => {
    expect(defaultSelection(gates, CONTRACT_TECHNOLOGIES, { kind: "none" })).toBeUndefined();
  });
  it("UT-CTRYPICK-012 Nothing without countries", () => {
    expect(defaultSelection([], GATE_TECHNOLOGIES, GATE_DEFAULT)).toBeUndefined();
    expect(defaultSelection([], COST_TECHNOLOGIES, COST_DEFAULT)).toBeUndefined();
  });
});

describe("ParseSelectionParams", () => {
  const list = pickerCountries([{ id: "AAA-1", name: "Germany" }], CONTRACT_COUNTRY_RULE);
  it("UT-CTRYPICK-013 Accepts a listed id (any case) and an offered code", () => {
    expect(parseSelectionParams("aaa-1", String(TECHNOLOGY.bess), list, CONTRACT_TECHNOLOGIES))
      .toEqual({ countryId: "AAA-1", technology: TECHNOLOGY.bess });
  });
  it("UT-CTRYPICK-014 Rejects unknown ids, technologies not offered, and missing params", () => {
    expect(parseSelectionParams("zzz", String(TECHNOLOGY.wind), list, CONTRACT_TECHNOLOGIES)).toBeUndefined();
    expect(parseSelectionParams("AAA-1", String(TECHNOLOGY.bess), list, GATE_TECHNOLOGIES)).toBeUndefined();
    expect(parseSelectionParams("AAA-1", "abc", list, CONTRACT_TECHNOLOGIES)).toBeUndefined();
    expect(parseSelectionParams(null, null, list, CONTRACT_TECHNOLOGIES)).toBeUndefined();
  });
});

describe("SameCountryTechnology", () => {
  it("UT-CTRYPICK-015 Compares ids case-insensitively", () => {
    expect(sameCountryTechnology({ countryId: "A", technology: 1 }, { countryId: "a", technology: 1 })).toBe(true);
    expect(sameCountryTechnology({ countryId: "A", technology: 1 }, { countryId: "a", technology: 2 })).toBe(false);
    expect(sameCountryTechnology(undefined, undefined)).toBe(true);
    expect(sameCountryTechnology(undefined, { countryId: "a", technology: 1 })).toBe(false);
  });
});

describe("Per-country technologies (Costs canvas Nestings)", () => {
  const list = pickerCountries(ROWS, COST_COUNTRY_RULE);
  const techFor = configuredCountryTechnologies(COST_TECHNOLOGIES);
  const byName = (n: string) => list.find((c) => c.name === n)!;

  it("UT-CTRYPICK-016 Configured countries get the list; every other listed country gets none", () => {
    expect(techFor(byName("Germany"))).toBe(COST_TECHNOLOGIES);
    expect(techFor(byName("Croatia"))).toBe(COST_TECHNOLOGIES);
    expect(techFor(byName("Netherlands"))).toEqual([]);
    expect(techFor(byName("Austria"))).toEqual([]);
    // " france " is not the exact configured name, so the canvas gives it no nesting either.
    expect(techFor(byName(" france "))).toEqual([]);
  });

  it("UT-CTRYPICK-017 DefaultSelection skips countries without technologies; unchanged without technologiesFor", () => {
    const austriaFirst = [byName("Austria"), byName("Poland"), byName("Germany")];
    expect(defaultSelection(austriaFirst, COST_TECHNOLOGIES, GATE_DEFAULT, techFor)).toEqual({ countryId: "pl", technology: COST_TECHNOLOGIES[0]!.code });
    expect(defaultSelection(austriaFirst, COST_TECHNOLOGIES, GATE_DEFAULT)).toEqual({ countryId: "at", technology: COST_TECHNOLOGIES[0]!.code });
    expect(defaultSelection(list, COST_TECHNOLOGIES, COST_DEFAULT, techFor)).toEqual({ countryId: "de", technology: TECHNOLOGY.wind });
    const noGermany = [byName("Austria"), byName("Italy")];
    expect(defaultSelection(noGermany, COST_TECHNOLOGIES, COST_DEFAULT, techFor)).toEqual({ countryId: "it", technology: TECHNOLOGY.wind });
    expect(defaultSelection([byName("Austria")], COST_TECHNOLOGIES, COST_DEFAULT, techFor)).toBeUndefined();
    expect(defaultSelection([byName("Austria")], COST_TECHNOLOGIES, GATE_DEFAULT, techFor)).toBeUndefined();
  });

  it("UT-CTRYPICK-018 IsSelectable / parseSelectionParams refuse a country without technologies", () => {
    expect(isSelectable({ countryId: "at", technology: TECHNOLOGY.wind }, list, COST_TECHNOLOGIES, techFor)).toBe(false);
    expect(isSelectable({ countryId: "DE", technology: TECHNOLOGY.wind }, list, COST_TECHNOLOGIES, techFor)).toBe(true);
    expect(isSelectable({ countryId: "at", technology: TECHNOLOGY.wind }, list, COST_TECHNOLOGIES)).toBe(true);
    expect(isSelectable(undefined, list, COST_TECHNOLOGIES)).toBe(false);
    expect(parseSelectionParams("at", String(TECHNOLOGY.wind), list, COST_TECHNOLOGIES, techFor)).toBeUndefined();
    expect(parseSelectionParams("at", String(TECHNOLOGY.wind), list, COST_TECHNOLOGIES)).toEqual({ countryId: "at", technology: TECHNOLOGY.wind });
  });
});

describe("E14: scopeBreadcrumb reproduces the three screens' headings", () => {
  it("UT-CTRYPICK-019 Contracts (rules.ts:99-102)", () => {
    expect(scopeBreadcrumb("Contracts", "Germany", "Wind")).toBe("Contracts / Germany / Wind");
    expect(scopeBreadcrumb("Contracts", undefined, "Wind")).toBe("Contracts");
    expect(scopeBreadcrumb("Contracts", "", "Wind")).toBe("Contracts");
    expect(scopeBreadcrumb("Contracts", "Germany", undefined)).toBe("Contracts");
  });

  it("UT-CTRYPICK-020 Costs (rules.ts:74-76)", () => {
    expect(scopeBreadcrumb("Standard Assumptions / Costs", "Poland", "PV")).toBe("Standard Assumptions / Costs / Poland / PV");
  });

  it("UT-CTRYPICK-021 Project Gates (rules.ts:67-69, ' | ')", () => {
    expect(scopeBreadcrumb("Project Gates", "France", "Wind", " | ")).toBe("Project Gates | France | Wind");
    expect(scopeBreadcrumb("Project Gates", undefined, undefined, " | ")).toBe("Project Gates");
  });
});
