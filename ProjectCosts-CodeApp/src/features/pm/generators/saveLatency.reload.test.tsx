// @vitest-environment jsdom
/**
 * UT-GENLAT-08x / 09x — the other two save-latency switches (D144) with the REAL hooks and a real `QueryClient`:
 *  - `trimReload`: after a Generators save the session, Milestones and General Data copies of the project are marked stale and NOT
 *    fetched (no session project read, so no country / cluster state / area re-reads); the screen's own reads still reload; a later
 *    visit fetches the stale copies; leaving the screen refetches the session project once. The recorded refetched query keys are asserted.
 *  - `replaceLanes` (reads): a replace's Identify reads are a dependency graph, without the allocation-count read.
 * `executePlan`, the session and the cloud flows are stubbed, as in `reload.hook.test.tsx`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { WritePlan } from "@/data/writePlan";

const h = vi.hoisted(() => ({ queue: [] as (() => unknown)[] }));
vi.mock("@/data/executePlan", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/data/executePlan")>();
  return { ...mod, executePlan: vi.fn(async () => h.queue.shift()!()) };
});
vi.mock("@/app/SessionContext", () => ({ useSession: () => ({ session: { userPrincipalName: "pm@vsb.example" }, envVars: {} }) }));
vi.mock("@/data/flows", () => ({ requestModulePermission: vi.fn(), cancelModulePermission: vi.fn() }));

import { PlanError } from "@/data/executePlan";
import { qk } from "@/data/keys";
import { GENERATORS_PERF_ALL_OFF, setGeneratorsPerfFlags } from "@/data/generatorsPerfFlags";
import { useGeneratorWrites } from "./hooks";
import { KIND_TABLES, reloadKeys, staleOnlyKeys, withReload, type ReloadKind } from "./reload";

const PROJECT = "11111111-1111-1111-1111-111111111111";
const plan = (reason: string): WritePlan => ({ writes: [{ op: "update", entitySet: "vsb_xs", id: "1", data: {}, reason }], log: [] });
const done = () => ({ done: 1, createdIds: [], createdRows: {}, landed: [], deleted: [], maybeLanded: [] });
const KINDS = Object.keys(KIND_TABLES) as Exclude<ReloadKind, "full">[];

beforeEach(() => { h.queue = []; });
afterEach(() => setGeneratorsPerfFlags(null));

describe("trimReload: which keys are only marked stale", () => {
  it("UT-GENLAT-080 every mapped kind marks the session, Milestones and General Data copies stale; the screen's own project read is NOT among them", () => {
    for (const kind of KINDS) {
      const stale = staleOnlyKeys(PROJECT, kind);
      expect(stale, kind).toEqual([qk.project(PROJECT), qk.milestoneProject(PROJECT), qk.generalDataProject(PROJECT)]);
      expect(stale).not.toContainEqual(qk.generators(PROJECT, "project"));
      // Each stale key is also in the kind's invalidate list: it is marked, not skipped.
      const all = reloadKeys(PROJECT, kind)!.map((k) => JSON.stringify(k));
      for (const key of stale) expect(all).toContain(JSON.stringify(key));
      expect(all).toContain(JSON.stringify(qk.generators(PROJECT, "project")));
    }
  });

  it("UT-GENLAT-081 off (the switch, targetedReload, the `full` kind, no project): nothing is stale-only, every key reloads as before", () => {
    expect(staleOnlyKeys(PROJECT, "toggleStatus", { ...GENERATORS_PERF_ALL_OFF, targetedReload: true })).toEqual([]);
    expect(staleOnlyKeys(PROJECT, "toggleStatus", { ...GENERATORS_PERF_ALL_OFF, trimReload: true })).toEqual([]);
    expect(staleOnlyKeys(PROJECT, "full")).toEqual([]);
    expect(staleOnlyKeys(undefined, "toggleStatus")).toEqual([]);
    const job = withReload({ progress: "x", plan: plan("one") }, PROJECT, "toggleStatus", { ...GENERATORS_PERF_ALL_OFF, targetedReload: true });
    expect(job.staleOnly).toBeUndefined();
    expect(withReload({ progress: "x", plan: plan("one") }, PROJECT, "toggleStatus").staleOnly).toEqual(staleOnlyKeys(PROJECT, "toggleStatus"));
  });
});

/** The screen's mounted queries as they are during a Generators save, with spies that record what is fetched. */
function mountedScreen() {
  const fetched: string[] = [];
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  const sessionRead = vi.fn(async () => {
    // What `loadProject` reads behind the project row: the country, the cluster state and the area (the "reference data").
    fetched.push("session project", "countries", "project states", "country areas");
    return { projectId: PROJECT };
  });
  const view = renderHook(() => {
    const writes = useGeneratorWrites(PROJECT);
    useQuery({ queryKey: qk.generators(PROJECT, "project"), queryFn: async () => { fetched.push("generators project"); return 1; }, staleTime: 60_000 });
    useQuery({ queryKey: qk.generators(PROJECT, "types"), queryFn: async () => { fetched.push("generators types"); return 1; }, staleTime: 60_000 });
    useQuery({ queryKey: qk.generators(PROJECT, "pv"), queryFn: async () => { fetched.push("generators pv"); return 1; }, staleTime: 60_000 });
    useQuery({ queryKey: qk.project(PROJECT), queryFn: sessionRead, staleTime: 5 * 60_000 });
    return writes;
  }, { wrapper });
  // The Milestones and General Data copies are warmed (prefetched) but have no observer on this screen.
  qc.setQueryData(qk.milestoneProject(PROJECT), { warm: true });
  qc.setQueryData(qk.generalDataProject(PROJECT), { warm: true });
  return { qc, fetched, view, sessionRead };
}

async function settle(view: ReturnType<typeof mountedScreen>["view"]) {
  await waitFor(() => expect(view.result.current.refreshing).toBe(false));
}

describe("trimReload: what a save refetches (real useGeneratorWrites, real QueryClient)", () => {
  it("UT-GENLAT-082 switch ON: the screen's own project, types read reload; the session project and its country / state / area reads do NOT fire", async () => {
    const { fetched, view } = mountedScreen();
    await waitFor(() => expect(fetched).toContain("session project"));
    await waitFor(() => expect(fetched.filter((x) => x.startsWith("generators")).length).toBe(3));
    fetched.length = 0;
    h.queue = [done];
    await act(async () => { await view.result.current.run(withReload({ progress: "go", plan: plan("one") }, PROJECT, "toggleStatus")); });
    await settle(view);
    // toggleStatus: the project (own read), the types, the turbines. PV is not reloaded; neither is anything of the session.
    expect(fetched.sort()).toEqual(["generators project", "generators types"].sort());
    for (const reference of ["session project", "countries", "project states", "country areas"]) expect(fetched).not.toContain(reference);
  });

  it("UT-GENLAT-083 switch OFF: the same save refetches the session project and, behind it, the country, state and area reads (today's behaviour)", async () => {
    setGeneratorsPerfFlags({ trimReload: false });
    const { fetched, view } = mountedScreen();
    await waitFor(() => expect(fetched).toContain("session project"));
    await waitFor(() => expect(fetched.filter((x) => x.startsWith("generators")).length).toBe(3));
    fetched.length = 0;
    h.queue = [done];
    await act(async () => { await view.result.current.run(withReload({ progress: "go", plan: plan("one") }, PROJECT, "toggleStatus")); });
    await settle(view);
    await waitFor(() => expect(fetched).toContain("session project"));
    expect(fetched).toEqual(expect.arrayContaining(["generators project", "generators types", "session project", "countries", "project states", "country areas"]));
  });

  it("UT-GENLAT-084 stale on invalidate: the marked copies are invalidated, and a screen that mounts one LATER fetches it", async () => {
    const { qc, view } = mountedScreen();
    await waitFor(() => expect(qc.getQueryState(qk.project(PROJECT))?.status).toBe("success"));
    h.queue = [done];
    await act(async () => { await view.result.current.run(withReload({ progress: "go", plan: plan("one") }, PROJECT, "toggleStatus")); });
    await settle(view);
    for (const key of [qk.project(PROJECT), qk.milestoneProject(PROJECT), qk.generalDataProject(PROJECT)]) {
      expect(qc.getQueryState(key)!.isInvalidated, JSON.stringify(key)).toBe(true);
    }
    // Milestones / General Data mount later: a stale (invalidated) query refetches on mount, whatever its staleTime.
    const milestoneRead = vi.fn(async () => ({ fresh: true }));
    const later = renderHook(() => useQuery({ queryKey: qk.milestoneProject(PROJECT), queryFn: milestoneRead, staleTime: 60_000 }), {
      wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
    });
    await waitFor(() => expect(milestoneRead).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(later.result.current.data).toEqual({ fresh: true }));
  });

  it("UT-GENLAT-085 leaving the screen refetches the session project ONCE when a save marked it stale, and not at all when none did", async () => {
    const quiet = mountedScreen();
    await waitFor(() => expect(quiet.sessionRead).toHaveBeenCalledTimes(1));
    quiet.view.unmount();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(quiet.sessionRead).toHaveBeenCalledTimes(1);

    const { qc, view, sessionRead } = mountedScreen();
    await waitFor(() => expect(sessionRead).toHaveBeenCalledTimes(1));
    // The session's own observer (SessionProvider) stays mounted after the screen goes: keep one, as the app does.
    const sessionObserver = renderHook(() => useQuery({ queryKey: qk.project(PROJECT), queryFn: sessionRead, staleTime: 5 * 60_000 }), {
      wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
    });
    h.queue = [done];
    await act(async () => { await view.result.current.run(withReload({ progress: "go", plan: plan("one") }, PROJECT, "toggleStatus")); });
    await settle(view);
    expect(sessionRead).toHaveBeenCalledTimes(1);
    expect(qc.getQueryState(qk.project(PROJECT))!.isInvalidated).toBe(true);
    view.unmount();
    await waitFor(() => expect(sessionRead).toHaveBeenCalledTimes(2));
    expect(qc.getQueryState(qk.project(PROJECT))!.isInvalidated).toBe(false);
    sessionObserver.unmount();
  });

  it("UT-GENLAT-086 a save that FAILS marks the same copies stale (the writes may have landed in part) and reports as before", async () => {
    const { qc, view } = mountedScreen();
    await waitFor(() => expect(qc.getQueryState(qk.project(PROJECT))?.status).toBe("success"));
    h.queue = [() => { throw new PlanError(0, 1, "the type", new Error("HTTP 400")); }];
    let ids: string[] | null = ["untouched"];
    await act(async () => { ids = await view.result.current.run(withReload({ progress: "go", plan: plan("one") }, PROJECT, "toggleStatus")); });
    expect(ids).toBeNull();
    expect(view.result.current.error).toContain("HTTP 400");
    expect(qc.getQueryState(qk.project(PROJECT))!.isInvalidated).toBe(true);
  });
});
