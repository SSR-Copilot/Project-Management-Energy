/**
 * UT-INFAREA-OPT-001..003 — the Area options derived from the country's inflation rows (B2, OPT-06). The oracle is the loader the
 * OPEX screen used (`loadCountryInflationAreas`: distinct non-empty `vsb_area`, `localeCompare`-sorted), kept as a pure copy here.
 */
import { describe, expect, it } from "vitest";
import { inflationAreasOf } from "./inflationAreas";

/** The OLD loader's post-read step, verbatim (`costBook.loadCountryInflationAreas`). */
const oracle = (rows: readonly { vsb_area?: string }[]) =>
  [...new Set(rows.map((r) => r.vsb_area ?? "").filter(Boolean))].sort((a, b) => a.localeCompare(b));

describe("inflationAreasOf", () => {
  it("UT-INFAREA-OPT-001 Italy: seven zones, one row per year and zone, come out distinct and sorted", () => {
    const zones = ["South", "North", "Sicily", "Centre - North", "Sardinia", "Centre - South", "Calabria"];
    const rows = [2027, 2028, 2029].flatMap((year) => zones.map((area) => ({ year, area, inflation: 2 })));
    expect(inflationAreasOf(rows)).toEqual(oracle(rows.map((r) => ({ vsb_area: r.area }))));
    expect(inflationAreasOf(rows)).toEqual(["Calabria", "Centre - North", "Centre - South", "North", "Sardinia", "Sicily", "South"]);
  });

  it("UT-INFAREA-OPT-002 every other country has blank areas: no options", () => {
    expect(inflationAreasOf([{ area: "" }, { area: "" }])).toEqual([]);
    expect(inflationAreasOf(undefined)).toEqual([]);
    expect(inflationAreasOf([])).toEqual([]);
  });

  it("UT-INFAREA-OPT-003 agrees with the old loader on mixed blank / repeated / accented areas", () => {
    const areas = ["", "Ärzte", "North", "", "north", "Zone 10", "Zone 2", "North"];
    expect(inflationAreasOf(areas.map((area) => ({ area })))).toEqual(oracle(areas.map((vsb_area) => ({ vsb_area }))));
  });
});
