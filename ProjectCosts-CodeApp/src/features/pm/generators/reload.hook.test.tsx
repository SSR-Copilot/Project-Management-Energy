// @vitest-environment jsdom
/**
 * UT-GENPERF-029..031 — the REAL `useGeneratorWrites` (`usePlanWrite`) with a job that carries its reload kind (D141): the keys
 * it refreshes after a write that lands, after a write that fails, after a job that stops part-way, and with the switch off.
 * `executePlan`, the session and the cloud flows are stubbed (as in `hooks.writes.test.tsx`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import { reloadKeys, withReload } from "./reload";

const PROJECT = "11111111-1111-1111-1111-111111111111";
const plan = (reason: string): WritePlan => ({ writes: [{ op: "update", entitySet: "vsb_xs", id: "1", data: {}, reason }], log: [] });
const done = () => ({ done: 1, createdIds: [], createdRows: {}, landed: [], deleted: [], maybeLanded: [] });

function writesHook() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const spy = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { ...renderHook(() => useGeneratorWrites(PROJECT), { wrapper }), spy };
}
const invalidatedKeys = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => (c[0] as { queryKey: unknown }).queryKey);

beforeEach(() => { h.queue = []; });
afterEach(() => setGeneratorsPerfFlags(null));

describe("a save with a reload kind", () => {
  it("UT-GENPERF-029 a write that lands refreshes ONLY the kind's keys (and refreshing ends)", async () => {
    h.queue = [done];
    const { result, spy } = writesHook();
    await act(async () => { await result.current.run(withReload({ progress: "go", plan: plan("one") }, PROJECT, "saveSimple:storage")); });
    expect(invalidatedKeys(spy)).toEqual(reloadKeys(PROJECT, "saveSimple:storage"));
    expect(invalidatedKeys(spy)).not.toContainEqual(qk.generatorsAll(PROJECT));
    await waitFor(() => expect(result.current.refreshing).toBe(false));
  });

  it("UT-GENPERF-030 a write that FAILS, and a job that stops part-way, still refresh the kind's keys and report as before", async () => {
    h.queue = [() => { throw new PlanError(0, 1, "the type", new Error("HTTP 400")); }];
    const failing = writesHook();
    let ids: string[] | null = ["untouched"];
    await act(async () => { ids = await failing.result.current.run(withReload({ progress: "go", plan: plan("one") }, PROJECT, "toggleStatus")); });
    expect(ids).toBeNull();
    expect(failing.result.current.error).toContain("HTTP 400");
    expect(invalidatedKeys(failing.spy)).toEqual(reloadKeys(PROJECT, "toggleStatus"));

    h.queue = [done, () => { throw new PlanError(0, 2, "device type row", new Error("boom")); }];
    const partial = writesHook();
    await act(async () => {
      await partial.result.current.run(withReload({ progress: "go", plan: plan("first"), then: async () => plan("second") }, PROJECT, "addWtgType"));
    });
    expect(partial.result.current.error).toContain("1 of 3 changes had already been saved");
    expect(invalidatedKeys(partial.spy)).toEqual(reloadKeys(PROJECT, "addWtgType"));
  });

  it("UT-GENPERF-031 with the switch OFF the same job refreshes the four keys of before", async () => {
    setGeneratorsPerfFlags(GENERATORS_PERF_ALL_OFF);
    h.queue = [done];
    const { result, spy } = writesHook();
    await act(async () => { await result.current.run(withReload({ progress: "go", plan: plan("one") }, PROJECT, "saveSimple:storage")); });
    expect(invalidatedKeys(spy)).toEqual([
      qk.generatorsAll(PROJECT), qk.project(PROJECT), qk.milestoneProject(PROJECT), qk.generalDataProject(PROJECT),
    ]);
  });
});
