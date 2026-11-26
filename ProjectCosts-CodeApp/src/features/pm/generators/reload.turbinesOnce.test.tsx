// @vitest-environment jsdom
/**
 * UT-TURBONCE — PA-09 (dvopt T-22, `GENERATORS_PERF.turbinesRefetchOnce`): adding, deleting or replacing a WTG type reloads the turbines
 * ONCE. The turbines key embeds the type ids, so the old reload refetched the active query under the OLD key (the result is discarded: the
 * types reload changes the key) and the new key fetched again. Real `useProjectTurbines`, real `useGeneratorWrites`, real `QueryClient`;
 * the reads and `executePlan` are faked and counted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { WritePlan } from "@/data/writePlan";

const h = vi.hoisted(() => ({
  queue: [] as (() => unknown)[],
  types: ["a"] as string[],
  turbineReads: [] as string[],
}));
vi.mock("@/data/executePlan", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/data/executePlan")>();
  return { ...mod, executePlan: vi.fn(async () => h.queue.shift()!()) };
});
vi.mock("@/data/generators", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/generators")>()),
  listProjectTurbines: vi.fn(async (typeIds: string[]) => {
    h.turbineReads.push([...typeIds].sort().join(","));
    return typeIds.map((t) => ({ id: `t-${t}`, typeId: t }));
  }),
}));
vi.mock("@/app/SessionContext", () => ({ useSession: () => ({ session: { userPrincipalName: "pm@vsb.example" }, envVars: {} }) }));
vi.mock("@/data/flows", () => ({ requestModulePermission: vi.fn(), cancelModulePermission: vi.fn() }));

import { PlanError } from "@/data/executePlan";
import { qk } from "@/data/keys";
import { GENERATORS_PERF_ALL_OFF, setGeneratorsPerfFlags } from "@/data/generatorsPerfFlags";
import { useGeneratorWrites, useProjectTurbines } from "./hooks";
import { TYPE_SET_KINDS, reloadKeys, staleOnlyKeys, turbinesStaleOnlyKeys, withReload } from "./reload";

const PROJECT = "11111111-1111-1111-1111-111111111111";
const plan = (): WritePlan => ({ writes: [{ op: "update", entitySet: "vsb_xs", id: "1", data: {}, reason: "one" }], log: [] });
const done = () => ({ done: 1, createdIds: [], createdRows: {}, landed: [], deleted: [], maybeLanded: [] });

beforeEach(() => { h.queue = []; h.types = ["a"]; h.turbineReads.length = 0; });
afterEach(() => setGeneratorsPerfFlags(null));

/** The screen: the types query (as the Generators screen has it) feeding the turbines key, plus the writes hook. */
function mount() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  const view = renderHook(() => {
    const writes = useGeneratorWrites(PROJECT);
    const types = useQuery({ queryKey: qk.generators(PROJECT, "types"), queryFn: async () => [...h.types], staleTime: 60_000 });
    const turbines = useProjectTurbines(PROJECT, types.data ?? []);
    return { writes, turbines, types };
  }, { wrapper });
  return { qc, view };
}

describe("TYPE_SET_KINDS: which saves mark the turbines stale only", () => {
  it("UT-TURBONCE-001 add, delete and replace of a WTG type; the turbines prefix is marked stale, not fetched, and is still in the reload list", () => {
    expect(TYPE_SET_KINDS).toEqual(["addWtgType", "deleteWtgType", "replaceWtg"]);
    for (const kind of TYPE_SET_KINDS) {
      expect(turbinesStaleOnlyKeys(PROJECT, kind)).toEqual([qk.generators(PROJECT, "turbines")]);
      const job = withReload({ progress: "x", plan: plan() }, PROJECT, kind);
      expect(job.staleOnly).toContainEqual(qk.generators(PROJECT, "turbines"));
      expect(job.invalidate).toContainEqual(qk.generators(PROJECT, "turbines"));
      expect(job.invalidate).toContainEqual(qk.generators(PROJECT, "types"));
    }
  });

  it("UT-TURBONCE-002 every other kind, the switch off, targetedReload off and no project: the turbines reload as before", () => {
    expect(turbinesStaleOnlyKeys(PROJECT, "saveTurbine")).toEqual([]);
    expect(turbinesStaleOnlyKeys(PROJECT, "toggleStatus")).toEqual([]);
    expect(turbinesStaleOnlyKeys(PROJECT, "deleteTurbine")).toEqual([]);
    expect(turbinesStaleOnlyKeys(PROJECT, "addWtgType", { ...GENERATORS_PERF_ALL_OFF, targetedReload: true })).toEqual([]);
    expect(turbinesStaleOnlyKeys(PROJECT, "addWtgType", { ...GENERATORS_PERF_ALL_OFF, turbinesRefetchOnce: true })).toEqual([]);
    expect(turbinesStaleOnlyKeys(undefined, "addWtgType")).toEqual([]);
    const off = withReload({ progress: "x", plan: plan() }, PROJECT, "addWtgType", { ...GENERATORS_PERF_ALL_OFF, targetedReload: true });
    expect(off.staleOnly).toBeUndefined();
    // The key list itself is the same either way: only the way the turbines key is reloaded changes.
    expect(withReload({ progress: "x", plan: plan() }, PROJECT, "addWtgType").invalidate).toEqual(reloadKeys(PROJECT, "addWtgType"));
    expect(staleOnlyKeys(PROJECT, "addWtgType")).toHaveLength(3);
  });
});

describe("the turbines are read once after a type-set save (real hooks, request counts)", () => {
  it("UT-TURBONCE-010 ON: add a type = 1 turbines read under the new type set (initial 1 + 1)", async () => {
    const { view } = mount();
    await waitFor(() => expect(h.turbineReads).toEqual(["a"]));
    h.types = ["a", "b"];
    h.queue = [done];
    await act(async () => { await view.result.current.writes.run(withReload({ progress: "go", plan: plan() }, PROJECT, "addWtgType")); });
    await waitFor(() => expect(view.result.current.writes.refreshing).toBe(false));
    await waitFor(() => expect(h.turbineReads).toContain("a,b"));
    await new Promise((r) => setTimeout(r, 30));
    expect(h.turbineReads).toEqual(["a", "a,b"]);
    await waitFor(() => expect(view.result.current.turbines.data.map((t) => t.typeId).sort()).toEqual(["a", "b"]));
  });

  it("UT-TURBONCE-011 OFF (the old behaviour, the oracle): the same save reads under the OLD key and then the new one (initial 1 + 2)", async () => {
    setGeneratorsPerfFlags({ turbinesRefetchOnce: false });
    const { view } = mount();
    await waitFor(() => expect(h.turbineReads).toEqual(["a"]));
    h.types = ["a", "b"];
    h.queue = [done];
    await act(async () => { await view.result.current.writes.run(withReload({ progress: "go", plan: plan() }, PROJECT, "addWtgType")); });
    await waitFor(() => expect(view.result.current.writes.refreshing).toBe(false));
    await waitFor(() => expect(h.turbineReads).toContain("a,b"));
    await new Promise((r) => setTimeout(r, 30));
    expect(h.turbineReads.filter((x) => x === "a").length).toBe(2); // the initial read and the discarded old-key refetch
    expect(h.turbineReads.filter((x) => x === "a,b").length).toBe(1);
  });

  it("UT-TURBONCE-012 ON, delete a type: the surviving type's turbines are read once under the new set", async () => {
    h.types = ["a", "b"];
    const { view } = mount();
    await waitFor(() => expect(h.turbineReads).toEqual(["a,b"]));
    h.types = ["a"];
    h.queue = [done];
    await act(async () => { await view.result.current.writes.run(withReload({ progress: "go", plan: plan() }, PROJECT, "deleteWtgType")); });
    await waitFor(() => expect(view.result.current.writes.refreshing).toBe(false));
    await waitFor(() => expect(h.turbineReads).toContain("a"));
    await new Promise((r) => setTimeout(r, 30));
    expect(h.turbineReads).toEqual(["a,b", "a"]);
  });

  it("UT-TURBONCE-013 failure injection: a refused or failed type-set save leaves the set as it was, so the turbines reload at once, as before", async () => {
    const { view } = mount();
    await waitFor(() => expect(h.turbineReads).toEqual(["a"]));
    h.queue = [() => { throw new PlanError(0, 1, "create a type", new Error("boom")); }];
    const job = withReload({ progress: "go", plan: plan() }, PROJECT, "addWtgType");
    expect(job.staleOnly).toContainEqual(qk.generators(PROJECT, "turbines"));
    await act(async () => { await view.result.current.writes.run(job); });
    await waitFor(() => expect(view.result.current.writes.refreshing).toBe(false));
    // The job object was switched back in onWritten(false): the turbines key is no longer stale-only, and was refetched.
    expect(job.staleOnly ?? []).not.toContainEqual(qk.generators(PROJECT, "turbines"));
    await waitFor(() => expect(h.turbineReads.filter((x) => x === "a").length).toBe(2));
  });
});
