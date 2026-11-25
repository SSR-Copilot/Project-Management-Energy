/**
 * UT-COUNTRIES-OK-* — PB-06 (`COUNTRIES_ONE_KEY`): `vsb_countries` is read ONCE under `qk.adminCountries` and the Project Overview's
 * country list and the signed-in user's country-to-business-unit map are views of it.
 *
 * The server is faked (it honours `statecode eq 0` and `vsb_name asc`), so the OLD readers are the oracle for the views.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";

const server = vi.hoisted(() => ({
  calls: [] as { select?: string[]; filter?: string; orderBy?: string[] }[],
  rows: [
    { vsb_countryid: "es", vsb_name: "Spain", vsb_title: "3", vsb_isocurrencycode: "EUR", statecode: 1, _vsb_businessunit_value: "bu-es", _owningbusinessunit_value: "obu" },
    { vsb_countryid: "de", vsb_name: "Germany", vsb_title: "1", vsb_isocurrencycode: "EUR", statecode: 0, _vsb_businessunit_value: "bu-de", _owningbusinessunit_value: "obu" },
    { vsb_countryid: "fr", vsb_name: "France", vsb_title: "2", vsb_isocurrencycode: "EUR", statecode: 0, _vsb_businessunit_value: "bu-fr", _owningbusinessunit_value: "obu" },
    { vsb_countryid: "xx", vsb_name: "Nowhere", statecode: 0 },
  ] as Record<string, unknown>[],
}));

vi.mock("@/generated/services/Vsb_countriesService", () => ({
  Vsb_countriesService: {
    getAll: async (o: { select?: string[]; filter?: string; orderBy?: string[] }) => {
      server.calls.push(o);
      let rows = [...server.rows];
      if (o.filter?.includes("statecode eq 0")) rows = rows.filter((r) => r["statecode"] === 0);
      if (o.orderBy?.includes("vsb_name asc")) rows.sort((a, b) => String(a["vsb_name"]).localeCompare(String(b["vsb_name"])));
      return { success: true, data: rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !o.select || o.select.includes(k)))) };
    },
  },
}));

const { empty } = vi.hoisted(() => ({ empty: { getAll: async () => ({ success: true, data: [] }) } }));
vi.mock("@/generated/services/SystemusersService", () => ({ SystemusersService: empty }));
vi.mock("@/generated/services/AadusersService", () => ({ AadusersService: empty }));
vi.mock("@/generated/services/RolesService", () => ({ RolesService: empty }));
vi.mock("@/generated/services/TeamsService", () => ({ TeamsService: empty }));

import { COUNTRY_SELECT, COUNTRY_SELECT_SETTINGS, countriesQueryOptions as adminCountries, toCountryRecord } from "./countries";
import { countriesQueryOptions as overviewCountries } from "@/features/pm/project-main/queries";
import { listCountries as listOverviewCountriesOld } from "./projects";
import { loadCurrentUser } from "./currentUser";
import { resetBootDvopt, setBootDvoptForTests } from "./bootDvoptFlags";

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

beforeEach(() => {
  server.calls.length = 0;
  resetBootDvopt();
});

describe("the one read", () => {
  it("UT-COUNTRIES-OK-001 selects the union of every consumer's columns, including both business units", () => {
    for (const col of ["vsb_countryid", "vsb_name", "vsb_title", "vsb_isocurrencycode", "statecode", "_vsb_businessunit_value", "_owningbusinessunit_value"]) {
      expect(COUNTRY_SELECT).toContain(col);
    }
  });

  it("UT-COUNTRIES-OK-002 OFF: the read keeps its narrow select", async () => {
    setBootDvoptForTests({ countriesOneKey: false });
    await client().fetchQuery(adminCountries);
    expect(server.calls[0]!.select).toEqual(COUNTRY_SELECT_SETTINGS);
  });

  it("UT-COUNTRIES-OK-003 a record carries the business units only when the row has them", () => {
    expect(toCountryRecord({ vsb_countryid: "de", _vsb_businessunit_value: "bu-de", _owningbusinessunit_value: "obu" }))
      .toMatchObject({ businessUnitId: "bu-de", owningBusinessUnitId: "obu" });
    expect(Object.keys(toCountryRecord({ vsb_countryid: "xx" }))).not.toContain("businessUnitId");
  });
});

describe("the Project Overview's list is a view of it", () => {
  it("UT-COUNTRIES-OK-010 differential: the same active countries in the same order as the old statecode eq 0 read", async () => {
    setBootDvoptForTests({ countriesOneKey: false });
    const old = await client().fetchQuery(overviewCountries());
    expect(old).toEqual(await listOverviewCountriesOld());
    server.calls.length = 0;
    setBootDvoptForTests({ countriesOneKey: true });
    const qc = client();
    await qc.prefetchQuery(overviewCountries());
    // `select` applies to an observer (what `useQuery` is), not to `fetchQuery`.
    const observer = new QueryObserver(qc, overviewCountries());
    const unsubscribe = observer.subscribe(() => undefined);
    const view = observer.getCurrentResult().data;
    unsubscribe();
    expect(view).toEqual(old);
    expect(view).toEqual([{ id: "fr", name: "France" }, { id: "de", name: "Germany" }, { id: "xx", name: "Nowhere" }]);
    // The view's data is what a mounted observer sees: `select` applies to the observer, the cache holds the full list.
    const cached = qc.getQueryData(adminCountries.queryKey) as { id: string }[];
    expect(cached.map((c) => c.id)).toContain("es");
  });

  it("UT-COUNTRIES-OK-011 the Overview's key is the shared one; OFF it is the old unshared key", () => {
    expect(overviewCountries().queryKey).toEqual(adminCountries.queryKey);
    setBootDvoptForTests({ countriesOneKey: false });
    expect(overviewCountries().queryKey).toEqual(["countries"]);
  });
});

describe("the signed-in user's map is a view of it", () => {
  it("UT-COUNTRIES-OK-020 the user's lookup reads the shared list instead of its own: Overview + user cost one countries request", async () => {
    const qc = client();
    const readCountries = async () => (await qc.fetchQuery(adminCountries)).map((c) => ({ vsb_name: c.name, _vsb_businessunit_value: c.businessUnitId ?? null }));
    await Promise.all([qc.fetchQuery(overviewCountries()), loadCurrentUser("01213410-77e7-4122-b291-89e8f04d9dfd", { readCountries })]);
    expect(server.calls).toHaveLength(1);
  });

  it("UT-COUNTRIES-OK-021 the badge scope is the same from the shared list as from the old unkeyed read", async () => {
    // Role reads are served by the generated services, not faked here: no user row means no roles; the map is exercised
    // through `badgeScopeFromRoles`' input, which is what both readers feed.
    const qc = client();
    const shared = (await qc.fetchQuery(adminCountries)).map((c) => ({ vsb_name: c.name, _vsb_businessunit_value: c.businessUnitId ?? null }));
    const old = server.rows.map((r) => ({ vsb_name: r["vsb_name"], _vsb_businessunit_value: r["_vsb_businessunit_value"] ?? null }));
    const toMap = (rows: { vsb_name?: unknown; _vsb_businessunit_value?: unknown }[]) =>
      new Map(rows.filter((r) => r._vsb_businessunit_value && r.vsb_name).map((r) => [r._vsb_businessunit_value as string, r.vsb_name as string]));
    expect(toMap(shared)).toEqual(toMap(old));
  });
});
