/**
 * Optimization programme B6, OPT-07a (S4-05): the Generators project query reads the country from the shared countries list
 * (`data/countries.ts`, `qk.adminCountries`, 30 minutes). Measured as REQUESTS per load and per save reload:
 *   OLD (`countryFromSharedList` off): 2 per load, 2 per reload (project, then its country).
 *   NEW: first load 2 (project + the whole list, in parallel); every reload within 30 minutes: 1 (the project).
 * Ids: UT-GENCOUNTRY-OPT-1NN.
 */
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const svc = vi.hoisted(() => ({
  fns: {} as Record<string, import("vitest").Mock<(o: unknown) => Promise<unknown>>>,
}));
const getAllOf = (name: string) => {
  svc.fns[name] ??= vi.fn<(o: unknown) => Promise<unknown>>();
  return svc.fns[name]!;
};
vi.mock("@/generated/services/Vsb_projectsService", () => ({ Vsb_projectsService: { getAll: (o: unknown) => getAllOf("projects")(o) } }));
vi.mock("@/generated/services/Vsb_countriesService", () => ({ Vsb_countriesService: { getAll: (o: unknown) => getAllOf("countries")(o) } }));

import { qk } from "@/data/keys";
import { GENERATORS_PERF_ALL_OFF, setGeneratorsPerfFlags } from "@/data/generatorsPerfFlags";
import { generatorsProjectQueryOptions } from "./queries";

const PROJECT = "11111111-1111-1111-1111-111111111111";
const DE = "00000000-0000-0000-0000-000000000009";
const ok = (data: unknown[]) => ({ success: true, data });

beforeEach(() => {
  for (const f of Object.values(svc.fns)) f.mockReset();
  getAllOf("projects").mockImplementation(async () => ok([{ vsb_projectid: PROJECT, vsb_name: "DE-0001", _vsb_country_value: DE }]));
  getAllOf("countries").mockImplementation(async () => ok([
    { vsb_countryid: DE, vsb_name: "Germany", vsb_isocurrencycode: "EUR", vsb_title: "1", statecode: 0 },
    { vsb_countryid: "00000000-0000-0000-0000-000000000002", vsb_name: "Austria", vsb_isocurrencycode: "EUR", vsb_title: "2", statecode: 1 },
  ]));
});
afterEach(() => setGeneratorsPerfFlags(null));

const requests = () => getAllOf("projects").mock.calls.length + getAllOf("countries").mock.calls.length;
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe("OPT-07a S4-05: requests of the Generators project read", () => {
  it("UT-GENCOUNTRY-OPT-101 OLD (switch off): 2 requests per load and 2 per reload", async () => {
    setGeneratorsPerfFlags(GENERATORS_PERF_ALL_OFF);
    const qc = newClient();
    const first = await qc.fetchQuery({ ...generatorsProjectQueryOptions(PROJECT), staleTime: 0 });
    expect(requests()).toBe(2);
    await qc.fetchQuery({ ...generatorsProjectQueryOptions(PROJECT), staleTime: 0 });
    expect(requests()).toBe(4);
    expect(first).toMatchObject({ countryName: "Germany", isoCurrencyCode: "EUR" });
  });

  it("UT-GENCOUNTRY-OPT-102 NEW: 2 requests on the first load, 1 per reload, the same row", async () => {
    const qc = newClient();
    const first = await qc.fetchQuery({ ...generatorsProjectQueryOptions(PROJECT), staleTime: 0 });
    expect(requests()).toBe(2);
    expect(getAllOf("countries")).toHaveBeenCalledTimes(1);
    expect(getAllOf("countries").mock.calls[0]![0]).toMatchObject({ select: expect.arrayContaining(["vsb_countryid", "vsb_name", "vsb_isocurrencycode"]) });
    const reload = await qc.fetchQuery({ ...generatorsProjectQueryOptions(PROJECT), staleTime: 0 });
    expect(requests()).toBe(3);
    expect(reload).toEqual(first);
    expect(first).toMatchObject({ countryId: DE, countryName: "Germany", isoCurrencyCode: "EUR" });
  });

  it("UT-GENCOUNTRY-OPT-103 NEW: another screen's warm list (qk.adminCountries) is used, so a load is 1 request", async () => {
    const qc = newClient();
    const { countriesQueryOptions } = await import("@/data/countries");
    await qc.fetchQuery(countriesQueryOptions);
    getAllOf("countries").mockClear();
    await qc.fetchQuery({ ...generatorsProjectQueryOptions(PROJECT), staleTime: 0 });
    expect(getAllOf("countries")).not.toHaveBeenCalled();
    expect(getAllOf("projects")).toHaveBeenCalledTimes(1);
  });

  it("UT-GENCOUNTRY-OPT-104 NEW (DIVERGENCE, reversible): a country edit is seen only after the list is stale or invalidated", async () => {
    const qc = newClient();
    await qc.fetchQuery({ ...generatorsProjectQueryOptions(PROJECT), staleTime: 0 });
    getAllOf("countries").mockImplementation(async () => ok([{ vsb_countryid: DE, vsb_name: "Deutschland", vsb_isocurrencycode: "EUR", statecode: 0 }]));
    const stale = await qc.fetchQuery({ ...generatorsProjectQueryOptions(PROJECT), staleTime: 0 });
    expect(stale!.countryName).toBe("Germany");
    await qc.invalidateQueries({ queryKey: qk.adminCountries });
    const fresh = await qc.fetchQuery({ ...generatorsProjectQueryOptions(PROJECT), staleTime: 0 });
    expect(fresh!.countryName).toBe("Deutschland");
  });
});
