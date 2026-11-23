// @vitest-environment jsdom
/**
 * Project Gates hooks — the dataset key is invalidated after every write, and so is Check List
 * Settings' "used by a Project Gate" locks query (with the exact key that screen uses). The writes
 * are WritePlans run through `runPlan`; `executePlan` is mocked here (the exact requests are
 * asserted in `writes.test.ts`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const repo = vi.hoisted(() => ({
  loadDataset: vi.fn(), searchPeople: vi.fn(),
  resolvePeople: vi.fn(),
}));
vi.mock("@/data/adminGatesApprovals", () => ({ projectGatesRepository: repo }));
const exec = vi.hoisted(() => vi.fn());
vi.mock("@/data/executePlan", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/executePlan")>()),
  executePlan: exec,
}));

import { qk } from "@/data/keys";
import { CreatedIdMissingError, PlanError } from "@/data/executePlan";
import type { WritePlan } from "@/data/writePlan";
import { RecordGoneError } from "@/platform/errors";
import { TECHNOLOGY } from "@/domain/technology";
import { useDeleteTask, useGatesDataset, useResetGate, useSaveTemplate, useToggleActive } from "./hooks";

const COUNTRY = "00000000-0000-0000-0000-0000000000de";
const WIND = TECHNOLOGY.wind;

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, invalidate, wrapper };
}

const invalidatedKeys = (spy: ReturnType<typeof setup>["invalidate"]) =>
  spy.mock.calls.map((c) => (c[0] as { queryKey: readonly unknown[] }).queryKey);

beforeEach(() => {
  vi.clearAllMocks();
  exec.mockReset();
  exec.mockResolvedValue({ done: 1, createdIds: [] });
});
const sentPlans = () => exec.mock.calls.map((c) => c[0] as WritePlan);
afterEach(() => cleanup());

describe("Query keys", () => {
  it("UT-ADGATE-601 the shared keys keep the values the screen used before (no cache-key change)", () => {
    expect(qk.adminGateDataset(COUNTRY, WIND)).toEqual(["adminGateDataset", COUNTRY, 952850000]);
    expect(qk.adminChecklistLocks).toEqual(["adminChecklistLocks"]);
  });
});

describe("Invalidation after every write", () => {
  const expectBoth = (spy: ReturnType<typeof setup>["invalidate"]) => {
    const keys = invalidatedKeys(spy);
    expect(keys).toContainEqual(qk.adminGateDataset(COUNTRY, WIND));
    expect(keys).toContainEqual(qk.adminChecklistLocks);
  };

  it("UT-ADGATE-602 save task (create) and save gate", async () => {
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useSaveTemplate(COUNTRY, WIND, true), { wrapper });
    await act(() => result.current.mutateAsync({ kind: "task", id: undefined, payload: { vsb_name: "x" } }));
    expect(exec).toHaveBeenCalledTimes(1);
    expect(sentPlans()[0]!.writes).toMatchObject([{ op: "create", entitySet: "vsb_checklistdefaultapprovalses" }]);
    expectBoth(invalidate);
    invalidate.mockClear();
    await act(() => result.current.mutateAsync({ kind: "gate", id: "g1", payload: { vsb_name: "y" } }));
    expectBoth(invalidate);
  });

  it("UT-ADGATE-603 delete task — also when the delete fails", async () => {
    const { invalidate, wrapper } = setup();
    exec.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useDeleteTask(COUNTRY, WIND, true), { wrapper });
    await act(async () => { await result.current.mutateAsync("a1").catch(() => undefined); });
    expectBoth(invalidate);
  });

  it("UT-ADGATE-604 task toggle and gate reset", async () => {
    const { invalidate, wrapper } = setup();
    const toggle = renderHook(() => useToggleActive(COUNTRY, WIND, true), { wrapper });
    await act(() => toggle.result.current.mutateAsync({ kind: "task", id: "a1", active: true }));
    expectBoth(invalidate);
    invalidate.mockClear();
    const reset = renderHook(() => useResetGate(COUNTRY, WIND, true), { wrapper });
    await act(() => reset.result.current.mutateAsync("g1"));
    expectBoth(invalidate);
  });
});

describe("Writes are plans (mutationFn only)", () => {
  const TEMPLATE = "40000000-0000-0000-0000-000000000001";
  const APPROVAL = "60000000-0000-0000-0000-000000000001";

  it("UT-ADGATE-605 each hook sends the one-write guarded plan for its action", async () => {
    const { wrapper } = setup();
    const toggle = renderHook(() => useToggleActive(COUNTRY, WIND, true), { wrapper });
    await act(() => toggle.result.current.mutateAsync({ kind: "gate", id: TEMPLATE, active: false }));
    await act(() => toggle.result.current.mutateAsync({ kind: "task", id: APPROVAL, active: true }));
    const reset = renderHook(() => useResetGate(COUNTRY, WIND, true), { wrapper });
    await act(() => reset.result.current.mutateAsync(TEMPLATE));
    const remove = renderHook(() => useDeleteTask(COUNTRY, WIND, true), { wrapper });
    await act(() => remove.result.current.mutateAsync(APPROVAL));
    expect(sentPlans().map((p) => p.writes)).toMatchObject([
      [{ op: "update", guarded: true, entitySet: "vsb_projectdefaultapprovalses", id: TEMPLATE, data: { vsb_gateactive: false } }],
      [{ op: "update", guarded: true, entitySet: "vsb_checklistdefaultapprovalses", id: APPROVAL, data: { vsb_gateisactive: true } }],
      [{ op: "update", guarded: true, entitySet: "vsb_projectdefaultapprovalses", id: TEMPLATE, data: { vsb_gateactive: false } }],
      [{ op: "delete", entitySet: "vsb_checklistdefaultapprovalses", id: APPROVAL }],
    ]);
  });

  it("UT-ADGATE-606 without admin access every hook builds a refused plan (nothing to send)", async () => {
    const { wrapper } = setup();
    const save = renderHook(() => useSaveTemplate(COUNTRY, WIND, false), { wrapper });
    await act(() => save.result.current.mutateAsync({ kind: "gate", id: TEMPLATE, payload: { vsb_name: "y" } }));
    const remove = renderHook(() => useDeleteTask(COUNTRY, WIND, false), { wrapper });
    await act(() => remove.result.current.mutateAsync(APPROVAL));
    for (const plan of sentPlans()) {
      expect(plan.writes).toEqual([]);
      expect(plan.refusedReason).toBe("You do not have permission to change the default approvals.");
    }
  });

  it("UT-ADGATE-607 a row deleted meanwhile surfaces as RecordGoneError (not a PlanError) and the grid is refreshed", async () => {
    const { invalidate, wrapper } = setup();
    exec.mockRejectedValueOnce(new PlanError(0, 1, "gate approval reset", new RecordGoneError("reset gate approval template", "vsb_projectdefaultapprovalses", TEMPLATE)));
    const { result } = renderHook(() => useResetGate(COUNTRY, WIND, true), { wrapper });
    const error = await act(async () => result.current.mutateAsync(TEMPLATE).catch((e: unknown) => e));
    expect(error).toBeInstanceOf(RecordGoneError);
    expect(invalidatedKeys(invalidate)).toContainEqual(qk.adminGateDataset(COUNTRY, WIND));
  });

  it("UT-ADGATE-608 save resolves to the row id: the edited id, the created id, or '' when a create answered without one", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useSaveTemplate(COUNTRY, WIND, true), { wrapper });
    expect(await act(() => result.current.mutateAsync({ kind: "gate", id: TEMPLATE, payload: {} }))).toBe(TEMPLATE);
    exec.mockResolvedValueOnce({ done: 1, createdIds: ["new-1"] });
    expect(await act(() => result.current.mutateAsync({ kind: "task", id: undefined, payload: {} }))).toBe("new-1");
    exec.mockRejectedValueOnce(new PlanError(0, 1, "gate approval created", new CreatedIdMissingError("create gate approval template")));
    expect(await act(() => result.current.mutateAsync({ kind: "gate", id: undefined, payload: {} }))).toBe("");
  });
});

describe("OPT-17(c) a reload reuses the people already resolved", () => {
  const PEOPLE = { "30000000-0000-0000-0000-000000000001": { entraId: "30000000-0000-0000-0000-000000000001", name: "Pat", mail: "pat@vsb.energy" } };
  const dataset = (people: Record<string, unknown>) => ({
    templates: [], checklistHeaderId: null, checklists: [], approvals: [], people, checklistError: null, peopleError: null,
  });

  it("UT-ADGATE-OPT-014 the first load passes no known people; a refetch passes the previous dataset's people", async () => {
    const { client, wrapper } = setup();
    repo.loadDataset.mockResolvedValueOnce(dataset(PEOPLE)).mockResolvedValueOnce(dataset(PEOPLE));
    const { result } = renderHook(() => useGatesDataset(COUNTRY, WIND), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(repo.loadDataset).toHaveBeenLastCalledWith(COUNTRY, WIND, undefined);
    await act(async () => { await client.invalidateQueries({ queryKey: qk.adminGateDataset(COUNTRY, WIND) }); });
    expect(repo.loadDataset).toHaveBeenCalledTimes(2);
    expect(repo.loadDataset).toHaveBeenLastCalledWith(COUNTRY, WIND, PEOPLE);
  });

  it("UT-ADGATE-OPT-015 an Active toggle refetch carries the people; a failed toggle rolls the optimistic flip back and keeps them", async () => {
    const { client, wrapper } = setup();
    const withApproval = { ...dataset(PEOPLE), approvals: [{ id: "a1", gateActive: false }] };
    repo.loadDataset.mockResolvedValue(withApproval);
    const data = renderHook(() => useGatesDataset(COUNTRY, WIND), { wrapper });
    await waitFor(() => expect(data.result.current.data).toBeDefined());
    const toggle = renderHook(() => useToggleActive(COUNTRY, WIND, true), { wrapper });
    await act(() => toggle.result.current.mutateAsync({ kind: "task", id: "a1", active: true }));
    await waitFor(() => expect(repo.loadDataset).toHaveBeenCalledTimes(2));
    expect(repo.loadDataset).toHaveBeenLastCalledWith(COUNTRY, WIND, PEOPLE);

    // A failing toggle: the optimistic flip is rolled back (while the refetch is still pending) and the cached people stay.
    exec.mockRejectedValueOnce(new Error("boom"));
    repo.loadDataset.mockClear();
    let release!: () => void;
    repo.loadDataset.mockImplementation(() => new Promise((resolve) => { release = () => resolve(withApproval); }));
    let pending!: Promise<unknown>;
    act(() => { pending = toggle.result.current.mutateAsync({ kind: "task", id: "a1", active: true }).catch(() => undefined); });
    await waitFor(() => expect(repo.loadDataset).toHaveBeenCalledTimes(1));
    const cached = client.getQueryData<{ approvals: { gateActive: boolean }[]; people: unknown }>(qk.adminGateDataset(COUNTRY, WIND));
    expect(cached?.approvals[0]?.gateActive).toBe(false); // rolled back before the reload answered
    expect(cached?.people).toEqual(PEOPLE);
    expect(repo.loadDataset).toHaveBeenLastCalledWith(COUNTRY, WIND, PEOPLE);
    await act(async () => { release(); await pending; });
  });
});
