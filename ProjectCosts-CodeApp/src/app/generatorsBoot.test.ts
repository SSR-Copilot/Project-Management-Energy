/**
 * UT-GENPERF-057.. — the Generators screen in the boot plan and the boot prefetch (D141, `GENERATORS_PERF.prefetch`): a
 * `#/project/generators?projectId=` deep link starts the screen's chunk and its independent reads beside the session, and
 * with the switch off nothing starts before the screen mounts. The screen's data modules are recording fakes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { GENERATORS_PERF_ALL_OFF, setGeneratorsPerfFlags } from "@/data/generatorsPerfFlags";
import { startupFlags } from "./startupFlags";

const { calls, note } = vi.hoisted(() => {
  const calls = { list: [] as string[] };
  return { calls, note: (what: string) => { calls.list.push(what); } };
});

vi.mock("@/data/generators", () => ({
  loadGeneratorsProject: vi.fn(async () => { note("project"); return { id: "p" }; }),
  loadProjectPlanning: vi.fn(async () => { note("planning"); return null; }),
  listGeneratorTypes: vi.fn(async () => { note("types"); return []; }),
  listPvModules: vi.fn(async () => { note("pvCatalogue"); return []; }),
  listPvTypes: vi.fn(async () => { note("pv"); return []; }),
  listInverterTypes: vi.fn(async () => { note("inverter"); return []; }),
  listSubstructureTypes: vi.fn(async () => { note("substructure"); return []; }),
  listSimpleTypes: vi.fn(async (family: string) => { note(`simple:${family}`); return []; }),
}));
vi.mock("@/data/project", () => ({ loadProject: vi.fn(async () => undefined), loadEnvironmentVariables: vi.fn(async () => ({})) }));
vi.mock("@/platform/powerClient", async (original) => ({
  ...(await original<typeof import("@/platform/powerClient")>()),
  ensureInitialized: vi.fn(async () => ({ app: { queryParams: {} } })),
  readSession: vi.fn(async () => ({ environmentId: "e", appId: "a", launchParams: {} })),
}));
vi.mock("./screenLoaders", () => ({
  loadProjectOverviewScreen: vi.fn(async () => { note("chunk:overview"); return {}; }),
  loadGeneralDataScreen: vi.fn(async () => { note("chunk:general-data"); return {}; }),
  loadGeneratorsScreen: vi.fn(async () => { note("chunk:generators"); return {}; }),
}));

import { bootTarget } from "./bootPlan";
import { startBootPrefetch } from "./bootPrefetch";

const ID = "9f5aade5-2b7c-ef11-ac20-000d3a466ab7";
const input = (hash: string) => ({ hash, windowSearch: "", launchParams: {} });
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } });

beforeEach(() => {
  calls.list.length = 0;
  startupFlags.bootPrefetch = true;
});
afterEach(() => setGeneratorsPerfFlags(null));

describe("boot plan: the Generators route", () => {
  it("UT-GENPERF-057 a Generators deep link with a valid project id is a `generators` target; without one (New Project) or with a bad one it is none", () => {
    expect(bootTarget(input(`#/project/generators?projectId=${ID}`))).toEqual({ kind: "generators", projectId: ID });
    expect(bootTarget(input("#/project/generators"))).toEqual({ kind: "none" });
    expect(bootTarget(input("#/project/generators?projectId=not-a-guid"))).toEqual({ kind: "none" });
    // The other Project Management screens are unchanged.
    expect(bootTarget(input(`#/project/general?projectId=${ID}`))).toEqual({ kind: "general-data", projectId: ID });
    expect(bootTarget(input(`#/project/milestones?projectId=${ID}`))).toEqual({ kind: "none" });
  });
});

describe("boot prefetch: the Generators route", () => {
  it("UT-GENPERF-058 starts the chunk and the ten independent reads at once, before the screen mounts", async () => {
    await startBootPrefetch(newClient(), { hash: `#/project/generators?projectId=${ID}`, search: "" });
    expect([...calls.list].sort()).toEqual([
      "chunk:generators", "inverter", "planning", "project", "pv", "pvCatalogue", "simple:hydrogen", "simple:storage",
      "simple:substation", "substructure", "types",
    ]);
  });

  it("UT-GENPERF-059 the Generators switch off: nothing of it starts (the screen's own hooks read when it mounts), other targets unaffected", async () => {
    setGeneratorsPerfFlags(GENERATORS_PERF_ALL_OFF);
    await startBootPrefetch(newClient(), { hash: `#/project/generators?projectId=${ID}`, search: "" });
    expect(calls.list).toEqual([]);
  });

  it("UT-GENPERF-060 the D119 start-up switch off starts nothing either", async () => {
    startupFlags.bootPrefetch = false;
    await startBootPrefetch(newClient(), { hash: `#/project/generators?projectId=${ID}`, search: "" });
    expect(calls.list).toEqual([]);
  });
});
