// @vitest-environment jsdom
/**
 * Project Gates hooks — DR-9 (the dataset key is invalidated after every write) and B3 / G-5
 * (Check List Settings' "used by a Project Gate" locks query is invalidated too, with the
 * exact key that screen uses).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const repo = vi.hoisted(() => ({
  listProjectStates: vi.fn(), loadDataset: vi.fn(), searchPeople: vi.fn(),
  resolvePeople: vi.fn(), setGateActive: vi.fn(), setTaskActive: vi.fn(), saveGate: vi.fn(),
  saveTask: vi.fn(), resetGate: vi.fn(), deleteTask: vi.fn(),
}));
vi.mock("@/data/settings/project-gates", () => ({ projectGatesRepository: repo }));

import { qk } from "@/data/keys";
import { TECHNOLOGY } from "@/domain/technology";
import { useDeleteTask, useResetGate, useSaveTemplate, useToggleActive } from "./hooks";

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
  repo.saveGate.mockResolvedValue("g1");
  repo.saveTask.mockResolvedValue("a1");
  repo.resetGate.mockResolvedValue(undefined);
  repo.deleteTask.mockResolvedValue(undefined);
  repo.setTaskActive.mockResolvedValue(undefined);
  repo.setGateActive.mockResolvedValue(undefined);
});
afterEach(() => cleanup());

describe("query keys", () => {
  it("the shared keys keep the values the screen used before (no cache-key change)", () => {
    expect(qk.settings.gates.dataset(COUNTRY, WIND)).toEqual(["projectGates", COUNTRY, 952850000]);
    expect(qk.settings.checklists.locks()).toEqual(["settings", "checklist-settings", "locks"]);
  });
});

describe("DR-9 / B3 invalidation after every write", () => {
  const expectBoth = (spy: ReturnType<typeof setup>["invalidate"]) => {
    const keys = invalidatedKeys(spy);
    expect(keys).toContainEqual(qk.settings.gates.dataset(COUNTRY, WIND));
    expect(keys).toContainEqual(qk.settings.checklists.locks());
  };

  it("save task (create) and save gate", async () => {
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useSaveTemplate(COUNTRY, WIND), { wrapper });
    await act(() => result.current.mutateAsync({ kind: "task", id: undefined, payload: { vsb_name: "x" } }));
    expect(repo.saveTask).toHaveBeenCalledTimes(1);
    expectBoth(invalidate);
    invalidate.mockClear();
    await act(() => result.current.mutateAsync({ kind: "gate", id: "g1", payload: { vsb_name: "y" } }));
    expectBoth(invalidate);
  });

  it("delete task — also when the delete fails", async () => {
    const { invalidate, wrapper } = setup();
    repo.deleteTask.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useDeleteTask(COUNTRY, WIND), { wrapper });
    await act(async () => { await result.current.mutateAsync("a1").catch(() => undefined); });
    expectBoth(invalidate);
  });

  it("task toggle and gate reset", async () => {
    const { invalidate, wrapper } = setup();
    const toggle = renderHook(() => useToggleActive(COUNTRY, WIND), { wrapper });
    await act(() => toggle.result.current.mutateAsync({ kind: "task", id: "a1", active: true }));
    expectBoth(invalidate);
    invalidate.mockClear();
    const reset = renderHook(() => useResetGate(COUNTRY, WIND), { wrapper });
    await act(() => reset.result.current.mutateAsync("g1"));
    expectBoth(invalidate);
  });
});
