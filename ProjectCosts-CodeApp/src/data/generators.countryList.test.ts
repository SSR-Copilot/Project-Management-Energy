/**
 * Optimization programme B6, OPT-07a (S4-05): `loadGeneratorsProject` takes the project's country from the shared countries list.
 *
 * OLD (recorded first, unmodified tree; also pinned by UT-GENDATA-READ-001): the project read, THEN a single-row country read,
 * two sequential requests on every load and after every save. NEW: the shared list is asked for beside the project read, and no
 * country request is made by this loader. Ids: UT-GENCOUNTRY-OPT-NNN.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const svc = vi.hoisted(() => ({
  fns: {} as Record<string, import("vitest").Mock<(o: unknown) => Promise<unknown>>>,
}));
const getAllOf = (name: string) => {
  svc.fns[name] ??= vi.fn<(o: unknown) => Promise<unknown>>();
  return svc.fns[name]!;
};
vi.mock("@/generated/services/Vsb_projectsService", () => ({ Vsb_projectsService: { getAll: (o: unknown) => getAllOf("projects")(o) } }));
vi.mock("@/generated/services/Vsb_countriesService", () => ({ Vsb_countriesService: { getAll: (o: unknown) => getAllOf("countries")(o) } }));

import { loadGeneratorsProject } from "./generators";

const PROJECT = "11111111-1111-1111-1111-111111111111";
const DE = "00000000-0000-0000-0000-000000000009";
const ok = (data: unknown[]) => ({ success: true, data });
const projectRow = (country: string | null) => ({ vsb_projectid: PROJECT, vsb_name: "DE-0001", _vsb_country_value: country });

beforeEach(() => { for (const f of Object.values(svc.fns)) f.mockReset(); });

describe("OPT-07a S4-05: the country of the Generators project", () => {
  it("UT-GENCOUNTRY-OPT-001 OLD (no lookup): the single-row country read starts only after the project answered", async () => {
    const order: string[] = [];
    let release: (v: unknown) => void = () => undefined;
    getAllOf("projects").mockImplementation(() => { order.push("project start"); return new Promise((r) => { release = r; }); });
    getAllOf("countries").mockImplementation(async () => { order.push("country start"); return ok([{ vsb_countryid: DE, vsb_name: "Germany", vsb_isocurrencycode: "EUR" }]); });
    const running = loadGeneratorsProject(PROJECT);
    await new Promise((r) => setTimeout(r, 0));
    expect(order).toEqual(["project start"]);
    release(ok([projectRow(DE)]));
    const row = await running;
    expect(order).toEqual(["project start", "country start"]);
    expect(row).toMatchObject({ countryName: "Germany", isoCurrencyCode: "EUR", countryOptionValue: expect.anything() });
  });

  it("UT-GENCOUNTRY-OPT-002 NEW: the shared list is asked for before the project answers, and no country request is sent", async () => {
    const order: string[] = [];
    let release: (v: unknown) => void = () => undefined;
    getAllOf("projects").mockImplementation(() => { order.push("project start"); return new Promise((r) => { release = r; }); });
    const lookup = vi.fn(async () => { order.push("list start"); return [{ id: DE, name: "Germany", isoCurrencyCode: "EUR" }]; });
    const running = loadGeneratorsProject(PROJECT, lookup);
    await new Promise((r) => setTimeout(r, 0));
    expect(order).toEqual(["list start", "project start"]);
    release(ok([projectRow(DE)]));
    const row = await running;
    expect(getAllOf("countries")).not.toHaveBeenCalled();
    expect(row).toMatchObject({ countryId: DE, countryName: "Germany", isoCurrencyCode: "EUR" });
  });

  it("UT-GENCOUNTRY-OPT-003 old and new return the same row (id case, blank name and ISO, missing country row)", async () => {
    const lists: Record<string, { id: string; name: string; isoCurrencyCode: string | undefined }[]> = {
      found: [{ id: DE.toUpperCase(), name: "Germany", isoCurrencyCode: "EUR" }],
      blank: [{ id: DE, name: "", isoCurrencyCode: undefined }],
      missing: [{ id: "00000000-0000-0000-0000-000000000001", name: "Other", isoCurrencyCode: "USD" }],
    };
    const singleRow: Record<string, unknown[]> = {
      found: [{ vsb_countryid: DE, vsb_name: "Germany", vsb_isocurrencycode: "EUR" }],
      blank: [{ vsb_countryid: DE, vsb_name: null, vsb_isocurrencycode: null }],
      missing: [],
    };
    for (const k of Object.keys(lists)) {
      getAllOf("projects").mockResolvedValue(ok([projectRow(DE)]));
      getAllOf("countries").mockResolvedValue(ok(singleRow[k]!));
      const before = await loadGeneratorsProject(PROJECT);
      const after = await loadGeneratorsProject(PROJECT, async () => lists[k]!);
      expect(after).toEqual(before);
    }
  });

  it("UT-GENCOUNTRY-OPT-004 a project with no country never fails on the list (a rejected lookup is ignored), and a missing project is null", async () => {
    getAllOf("projects").mockResolvedValue(ok([projectRow(null)]));
    const row = await loadGeneratorsProject(PROJECT, async () => { throw new Error("countries failed"); });
    expect(row).toMatchObject({ countryId: null, countryName: null, isoCurrencyCode: null });
    getAllOf("projects").mockResolvedValue(ok([]));
    expect(await loadGeneratorsProject(PROJECT, async () => { throw new Error("countries failed"); })).toBeNull();
  });

  it("UT-GENCOUNTRY-OPT-005 a project WITH a country still fails when the list read fails (as the single-row read did)", async () => {
    getAllOf("projects").mockResolvedValue(ok([projectRow(DE)]));
    await expect(loadGeneratorsProject(PROJECT, async () => { throw new Error("countries failed"); })).rejects.toThrow("countries failed");
  });
});
