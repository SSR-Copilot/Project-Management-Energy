import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

const getAll = vi.fn();
vi.mock("@/generated/services/Vsb_countriesService", () => ({ Vsb_countriesService: { getAll: (o: unknown) => getAll(o) } }));

import { COUNTRY_SELECT, activeOnly, countriesQueryOptions, listCountries, toCountryRecord } from "./countries";
import { qk } from "./keys";

beforeEach(() => getAll.mockReset());

describe("ListCountries", () => {
  it("UT-COUNTRIES-001 Reads every country ONCE with the union of the four screens' columns, no state filter", async () => {
    getAll.mockResolvedValueOnce({
      success: true,
      data: [
        { vsb_countryid: "de", vsb_name: "Germany", vsb_isocurrencycode: "EUR", vsb_title: "1", statecode: 0 },
        { vsb_countryid: "es", vsb_name: "Spain", statecode: 1 },
      ],
    });
    const rows = await listCountries();
    expect(getAll).toHaveBeenCalledTimes(1);
    const options = getAll.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(options["select"]).toEqual(COUNTRY_SELECT);
    expect(options["filter"]).toBeUndefined();
    expect(options["orderBy"]).toEqual(["vsb_name asc"]);
    expect(rows).toEqual([
      { id: "de", name: "Germany", isoCurrencyCode: "EUR", title: "1", active: true },
      { id: "es", name: "Spain", isoCurrencyCode: undefined, title: undefined, active: false },
    ]);
  });

  it("UT-COUNTRIES-002 Follows the skip token", async () => {
    getAll
      .mockResolvedValueOnce({ success: true, data: [{ vsb_countryid: "a", vsb_name: "A", statecode: 0 }], skipToken: "t" })
      .mockResolvedValueOnce({ success: true, data: [{ vsb_countryid: "b", vsb_name: "B", statecode: 0 }] });
    expect((await listCountries()).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("UT-COUNTRIES-003 Surfaces a failed read", async () => {
    getAll.mockResolvedValueOnce({ success: false, error: { message: "nope", status: 500 } });
    await expect(listCountries()).rejects.toThrow(/list countries/);
  });
});

describe("Mapping and selection", () => {
  it("UT-COUNTRIES-004 Treats a missing statecode as active and a string code by value", () => {
    expect(toCountryRecord({ vsb_countryid: "x" }).active).toBe(true);
    expect(toCountryRecord({ vsb_countryid: "x", statecode: "1" }).active).toBe(false);
  });
  it("UT-COUNTRIES-005 ActiveOnly is the statecode eq 0 rule", () => {
    const rows = [toCountryRecord({ vsb_countryid: "a", statecode: 0 }), toCountryRecord({ vsb_countryid: "b", statecode: 1 })];
    expect(activeOnly(rows).map((r) => r.id)).toEqual(["a"]);
  });
  it("UT-COUNTRIES-006 Is one cache entry shared by every consumer", async () => {
    getAll.mockResolvedValue({ success: true, data: [{ vsb_countryid: "a", vsb_name: "A", statecode: 0 }] });
    const qc = new QueryClient();
    await qc.fetchQuery(countriesQueryOptions);
    await qc.fetchQuery(countriesQueryOptions);
    expect(getAll).toHaveBeenCalledTimes(1);
    expect(countriesQueryOptions.queryKey).toEqual(qk.adminCountries);
    expect(qk.adminCountries).not.toEqual(["countries"]);
  });
});
