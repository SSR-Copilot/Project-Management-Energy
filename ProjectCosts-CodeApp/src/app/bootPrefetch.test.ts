/**
 * The boot prefetch (D119): what it starts, in which cache keys, and that the screens
 * find the result there. The data modules are replaced by recording fakes; the query client is real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { startupFlags } from "./startupFlags";

const calls = vi.hoisted(() => ({ list: [] as string[], launchParams: {} as Record<string, string>, rejectProjects: false }));
const note = (what: string) => { calls.list.push(what); };

vi.mock("@/data/projects", () => ({
  loadProjectPage: vi.fn(async (req: { page: number }) => { note(`projectPage:${req.page}`); if (calls.rejectProjects) throw new Error("boom"); return { rows: [], totalRows: 0, page: req.page, pageSize: 200, totalPages: 1, hasNext: false }; }),
  listCountries: vi.fn(async () => { note("countries"); return []; }),
  listProjectStates: vi.fn(async () => { note("projectStates"); return []; }),
}));
vi.mock("@/data/project", () => ({
  loadProject: vi.fn(async (id: string) => { note(`sessionProject:${id}`); return undefined; }),
  loadEnvironmentVariables: vi.fn(async () => ({})),
}));
vi.mock("@/data/generalData", () => ({
  loadGeneralDataProject: vi.fn(async (id: string) => { note(`gdProject:${id}`); return { id, countryId: "country-1" }; }),
  listGeneralDataCountries: vi.fn(async () => { note("gdCountries"); return []; }),
  listProjectStates: vi.fn(async () => { note("gdStates"); return []; }),
  listShareholders: vi.fn(async (id: string) => { note(`shareholders:${id}`); return []; }),
  listStateTrackings: vi.fn(async (id: string) => { note(`trackings:${id}`); return []; }),
  listCountryAreas: vi.fn(async (c: string) => { note(`areas:${c}`); return []; }),
  listTerrainUtilizations: vi.fn(async (c: string | null) => { note(`utilizations:${c}`); return []; }),
}));
vi.mock("@/platform/powerClient", async (original) => ({
  ...(await original<typeof import("@/platform/powerClient")>()),
  ensureInitialized: vi.fn(async () => ({ app: { queryParams: calls.launchParams } })),
  readSession: vi.fn(async () => ({ environmentId: "e", appId: "a", launchParams: calls.launchParams })),
}));
vi.mock("./screenLoaders", () => ({
  loadProjectOverviewScreen: vi.fn(async () => { note("chunk:overview"); return {}; }),
  loadGeneralDataScreen: vi.fn(async () => { note("chunk:general-data"); return {}; }),
}));

import { startBootPrefetch } from "./bootPrefetch";
import { projectPageKey, countriesQueryOptions } from "@/features/pm/project-main/queries";
import { parseCriteria } from "@/features/pm/project-main/rules";
import { generalDataProjectQueryOptions } from "@/features/pm/general-data/queries";

const ID = "9f5aade5-2b7c-ef11-ac20-000d3a466ab7";
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } });
const boot = (qc: QueryClient, hash: string, search = "") => startBootPrefetch(qc, { hash, search });

beforeEach(() => {
  calls.list.length = 0;
  calls.launchParams = {};
  calls.rejectProjects = false;
  startupFlags.bootPrefetch = true;
});

describe("boot prefetch", () => {
  it("UT-BOOT-020 on the project list it starts the chunk, the first page and the two filter lists", async () => {
    const qc = newClient();
    await boot(qc, "#/projects");
    expect(calls.list.sort()).toEqual(["chunk:overview", "countries", "projectPage:1", "projectStates"]);
  });

  it("UT-BOOT-021 the first page lands under the exact key the screen reads", async () => {
    const qc = newClient();
    await boot(qc, "#/projects?p=2");
    const criteria = parseCriteria(new URLSearchParams("?p=2"));
    const key = projectPageKey({ filter: criteria.filter, sort: criteria.sort, page: criteria.page });
    expect(qc.getQueryData(key)).toBeDefined();
    expect(calls.list).toContain("projectPage:2");
    expect(qc.getQueryData(countriesQueryOptions().queryKey)).toEqual([]);
  });

  it("UT-BOOT-022 the bare root waits for the launch parameters, then opens the list", async () => {
    await boot(newClient(), "");
    // The chunk is fetched speculatively; the reads follow the session.
    expect(calls.list).toContain("chunk:overview");
    expect(calls.list).toContain("projectPage:1");
  });

  it("UT-BOOT-023 a cost deep link at the root reads no project list (only the speculative chunk)", async () => {
    calls.launchParams = { projectId: ID };
    await boot(newClient(), "");
    expect(calls.list.filter((c) => c !== "chunk:overview")).toEqual([]);
  });

  it("UT-BOOT-024 Edit Project starts General Data's project row, lists and children at once", async () => {
    calls.launchParams = { projectId: ID, pmScreen: "/project/general" };
    const qc = newClient();
    await boot(qc, "");
    expect(calls.list).toEqual(expect.arrayContaining([
      "chunk:general-data", `sessionProject:${ID}`, `gdProject:${ID}`, "gdCountries", "gdStates",
      `shareholders:${ID}`, `trackings:${ID}`,
    ]));
    expect(qc.getQueryData(generalDataProjectQueryOptions(ID).queryKey)).toMatchObject({ id: ID });
  });

  it("UT-BOOT-025 the project's country lists wait for its row, and nothing else does", async () => {
    const qc = newClient();
    await boot(qc, `#/project/general?projectId=${ID}`);
    expect(calls.list).toEqual(expect.arrayContaining(["areas:country-1", "utilizations:country-1"]));
    // The row came first in the order of the calls, then its country's lists.
    expect(calls.list.indexOf(`gdProject:${ID}`)).toBeLessThan(calls.list.indexOf("areas:country-1"));
  });

  it("UT-BOOT-026 a route the plan does not know starts nothing", async () => {
    await boot(newClient(), "#/costs/capex");
    expect(calls.list).toEqual([]);
  });

  it("UT-BOOT-027 the switch off restores the old order: nothing starts before the screen mounts", async () => {
    startupFlags.bootPrefetch = false;
    await boot(newClient(), "#/projects");
    expect(calls.list).toEqual([]);
  });

  it("UT-BOOT-028 a failed prefetch never throws and leaves the screen's own read to retry", async () => {
    calls.rejectProjects = true;
    const qc = newClient();
    await expect(boot(qc, "#/projects")).resolves.toBeUndefined();
    const criteria = parseCriteria(new URLSearchParams(""));
    const key = projectPageKey({ filter: criteria.filter, sort: criteria.sort, page: criteria.page });
    expect(qc.getQueryData(key)).toBeUndefined();
    // The screen mounting later finds no data and fetches: the failed state does not stick.
    calls.rejectProjects = false;
    await qc.fetchQuery({ queryKey: key, queryFn: async () => "ok" });
    expect(qc.getQueryData(key)).toBe("ok");
  });
});
