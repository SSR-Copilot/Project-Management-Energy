/**
 * The boot prefetch (D119): what it starts, in which cache keys, and that the screens
 * find the result there. The data modules are replaced by recording fakes; the query client is real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { startupFlags } from "./startupFlags";
import { resetBootDvopt, setBootDvoptForTests } from "@/data/bootDvoptFlags";
import { resetEntryPrefetch, setEntryPrefetchForTests } from "@/data/entryPrefetchFlags";

const calls = vi.hoisted(() => ({
  list: [] as string[], launchParams: {} as Record<string, string>, rejectProjects: false,
  /** The scope each session-project prefetch asked for (OPT-01/03). */
  scopes: [] as (string | undefined)[], rejectSession: false,
}));
const note = (what: string) => { calls.list.push(what); };

vi.mock("@/data/projects", () => ({
  loadProjectPage: vi.fn(async (req: { page: number }) => { note(`projectPage:${req.page}`); if (calls.rejectProjects) throw new Error("boom"); return { rows: [], totalRows: 0, page: req.page, pageSize: 200, totalPages: 1, hasNext: false }; }),
  listCountries: vi.fn(async () => { note("countries"); return []; }),
}));
// PB-06: the overview's country list is a view of the one `vsb_countries` read (`data/countries.ts`).
vi.mock("@/data/countries", async (original) => ({
  ...(await original<typeof import("@/data/countries")>()),
  listCountries: vi.fn(async () => { note("countries"); return []; }),
}));
vi.mock("@/data/project", () => ({
  loadProject: vi.fn(async (id: string, options?: { scope?: string }) => {
    note(`sessionProject:${id}`); calls.scopes.push(options?.scope);
    if (calls.rejectSession) throw new Error("session boom");
    return undefined;
  }),
  loadEnvironmentVariables: vi.fn(async () => ({})),
}));
vi.mock("@/data/generalData", () => ({
  loadGeneralDataProject: vi.fn(async (id: string) => { note(`gdProject:${id}`); return { id, countryId: "country-1" }; }),
  listGeneralDataCountries: vi.fn(async () => { note("gdCountries"); return []; }),
  listShareholders: vi.fn(async (id: string) => { note(`shareholders:${id}`); return []; }),
  listStateTrackings: vi.fn(async (id: string) => { note(`trackings:${id}`); return []; }),
  listCountryAreas: vi.fn(async (c: string) => { note(`areas:${c}`); return []; }),
  listTerrainUtilizations: vi.fn(async (c: string | null) => { note(`utilizations:${c}`); return []; }),
}));
// BND-06 (T-E01): the shared project-states read is its own module now (same note, same call).
vi.mock("@/data/projectStatesRead", () => ({
  listProjectStates: vi.fn(async () => { note("gdStates"); return []; }),
}));
vi.mock("@/platform/powerClient", async (original) => ({
  ...(await original<typeof import("@/platform/powerClient")>()),
  ensureInitialized: vi.fn(async () => ({ app: { queryParams: calls.launchParams } })),
  readSession: vi.fn(async () => ({ environmentId: "e", appId: "a", launchParams: calls.launchParams })),
}));
vi.mock("./screenLoaders", () => ({
  loadProjectOverviewScreen: vi.fn(async () => { note("chunk:overview"); return {}; }),
  loadGeneralDataScreen: vi.fn(async () => { note("chunk:general-data"); return {}; }),
  // OPT-03: the Cost and the other Project Management screens' chunks.
  COST_SCREEN_LOADERS: {
    "/costs/capex": [vi.fn(async () => { note("chunk:cost:capex"); return {}; })],
    "/costs/land-lease": [vi.fn(async () => { note("chunk:cost:land-lease"); return {}; })],
    "/costs/add-from-table": [
      vi.fn(async () => { note("chunk:cost:capex"); return {}; }),
      vi.fn(async () => { note("chunk:cost:add-from-table"); return {}; }),
    ],
  },
  PM_SCREEN_LOADERS: {
    team: vi.fn(async () => { note("chunk:pm:team"); return {}; }),
    finance: vi.fn(async () => { note("chunk:pm:finance"); return {}; }),
  },
}));

import { startBootPrefetch } from "./bootPrefetch";
import { sessionProjectQueryOptions } from "./SessionContext";
import { sessionProjectScope } from "./bootPlan";
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
  calls.rejectSession = false;
  calls.scopes.length = 0;
  startupFlags.bootPrefetch = true;
  resetBootDvopt();
  // T-C01 / T-C03: this file pins the chunk-and-session-project boot of a Cost deep link and the admin routes' old "starts nothing".
  // The Cost screen's own reads and the admin chunk are `costScreenPrefetch.boot.test.ts`'s (UT-BOOT-COST-*), with the switches ON.
  resetEntryPrefetch();
  setEntryPrefetchForTests({ costReads: false, adminChunk: false });
});

describe("boot prefetch", () => {
  it("UT-BOOT-020 on the project list it starts the chunk, the first page and the two filter lists", async () => {
    const qc = newClient();
    await boot(qc, "#/projects");
    // D159: the Status filter's states are the one shared `Project States` read (the General Data mock's `gdStates`).
    expect(calls.list.sort()).toEqual(["chunk:overview", "countries", "gdStates", "projectPage:1"]);
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

  it("UT-BOOT-023 a cost deep link at the root reads no project list (the speculative chunk, the Cost screen and the project only)", async () => {
    calls.launchParams = { projectId: ID };
    await boot(newClient(), "");
    // OPT-03 (B5b): it used to start nothing besides the overview chunk; now the Cost screen's chunk and the project start too.
    // Still no project page, country list or any Project Management read.
    expect([...calls.list].sort()).toEqual(["chunk:cost:capex", "chunk:overview", `sessionProject:${ID}`]);
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
    // OPT-03 (B5b): `#/costs/capex` WITH a project id now starts (UT-BOOT-OPT-010); without one, or an unknown route, nothing does.
    await boot(newClient(), "#/costs/capex");
    await boot(newClient(), "#/admin/cost");
    await boot(newClient(), `#/project/team`);
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

  it("UT-BOOT-OPT-010 a Cost deep link starts the Cost screen's chunk and the FULL session project, under the key the provider reads", async () => {
    const qc = newClient();
    await boot(qc, `#/costs/land-lease?projectId=${ID}`);
    expect([...calls.list].sort()).toEqual(["chunk:cost:land-lease", `sessionProject:${ID}`]);
    expect(calls.scopes).toEqual(["full"]);
    expect(qc.getQueryState(sessionProjectQueryOptions(ID, "full").queryKey)?.status).toBe("success");
    // The PM scope has its own key: the Cost load never lands where a PM route reads.
    expect(qc.getQueryState(sessionProjectQueryOptions(ID, "pm").queryKey)).toBeUndefined();
  });

  it("UT-BOOT-OPT-011 Add Cost from Table starts both of its chunks (a panel over the CAPEX screen)", async () => {
    await boot(newClient(), `#/costs/add-from-table?projectId=${ID}`);
    expect(calls.list).toEqual(expect.arrayContaining(["chunk:cost:capex", "chunk:cost:add-from-table", `sessionProject:${ID}`]));
  });

  it("UT-BOOT-OPT-012 another Project Management screen starts its chunk and the ROW-ONLY (pm) session project, nothing of its own data (PB-03 switch OFF)", async () => {
    // PB-03 (`BOOT_PREFETCH_SCREEN_READS`) ON starts the screen's own reads too: `pmScreenPrefetch.test.tsx` (UT-BOOT-SCREENS-*).
    setBootDvoptForTests({ prefetchScreenReads: false });
    const qc = newClient();
    await boot(qc, `#/project/team?projectId=${ID}`);
    expect([...calls.list].sort()).toEqual(["chunk:pm:team", `sessionProject:${ID}`]);
    expect(calls.scopes).toEqual(["pm"]);
    expect(qc.getQueryState(sessionProjectQueryOptions(ID, "pm").queryKey)?.status).toBe("success");
    expect(qc.getQueryState(sessionProjectQueryOptions(ID, "full").queryKey)).toBeUndefined();
  });

  it("UT-BOOT-OPT-013 General Data's own project prefetch is the PM scope too", async () => {
    await boot(newClient(), `#/project/general?projectId=${ID}`);
    expect(calls.scopes).toEqual(["pm"]);
  });

  it("UT-BOOT-OPT-014 Edit Project at the root prefetches the PM scope (the SessionProvider reads the same key there)", async () => {
    calls.launchParams = { projectId: ID, pmScreen: "/project/general" };
    const qc = newClient();
    await boot(qc, "");
    expect(calls.scopes).toEqual(["pm"]);
    expect(sessionProjectScope("/", true)).toBe("pm");
    expect(qc.getQueryState(sessionProjectQueryOptions(ID, sessionProjectScope("/", true)).queryKey)?.status).toBe("success");
  });

  it("UT-BOOT-OPT-015 a failed session prefetch never throws and leaves the gate's own read to retry (cf. UT-BOOT-028)", async () => {
    calls.rejectSession = true;
    const qc = newClient();
    await expect(boot(qc, `#/project/finance?projectId=${ID}`)).resolves.toBeUndefined();
    expect(qc.getQueryData(sessionProjectQueryOptions(ID, "pm").queryKey)).toBeUndefined();
    // The gate mounting later reads again, and the failed state does not stick.
    calls.rejectSession = false;
    await qc.fetchQuery(sessionProjectQueryOptions(ID, "pm"));
    expect(qc.getQueryState(sessionProjectQueryOptions(ID, "pm").queryKey)?.status).toBe("success");
  });

  it("UT-BOOT-OPT-016 no project id, an invalid one, or the switch off starts nothing for a PM or Cost route", async () => {
    await boot(newClient(), "#/project/team?projectId=nope");
    await boot(newClient(), "#/costs/capex?projectId=nope");
    startupFlags.bootPrefetch = false;
    await boot(newClient(), `#/project/team?projectId=${ID}`);
    await boot(newClient(), `#/costs/capex?projectId=${ID}`);
    expect(calls.list).toEqual([]);
  });
});
