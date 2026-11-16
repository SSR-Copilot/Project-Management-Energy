// @vitest-environment jsdom
/**
 * UT-PLANWRITE-015..018 — `usePlanWrite().lastLanded()`: the rows the most recent `run()` created, readable after a
 * success and after a part-way failure (the Generators rollback record, plan 9.3). `executePlan` is stubbed; the
 * hook's merging of the first and `then` plans and its reset between runs are pinned. Messages are unchanged.
 */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { WritePlan } from "./writePlan";
import type { LandedRow } from "./executePlan";

const behaviour = vi.hoisted(() => ({ queue: [] as (() => unknown)[] }));
vi.mock("./executePlan", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./executePlan")>();
  return { ...mod, executePlan: vi.fn(async () => behaviour.queue.shift()!()) };
});

import { PlanError } from "./executePlan";
import { usePlanWrite } from "./usePlanWrite";

const wrapper = ({ children }: { children: ReactNode }) =>
  <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>{children}</QueryClientProvider>;
const plan = (reason: string): WritePlan => ({ writes: [{ op: "create", entitySet: "vsb_xs", data: {}, reason }], log: [] });
const L = (id: string, entitySet = "vsb_xs"): LandedRow => ({ entitySet, id });
const result = (landed: LandedRow[]) => () => ({ done: landed.length, createdIds: landed.map((l) => l.id), createdRows: {}, landed });

describe("usePlanWrite lastLanded", () => {
  it("UT-PLANWRITE-015 after a successful job lastLanded() is the rows it created; run() still resolves to the created ids", async () => {
    behaviour.queue = [result([L("a"), L("b")])];
    const { result: hook } = renderHook(() => usePlanWrite({ invalidate: [], action: "test" }), { wrapper });
    let ids: string[] | null = null;
    await act(async () => { ids = await hook.current.run({ progress: "go", plan: plan("first") }); });
    expect(ids).toEqual(["a", "b"]);
    expect(hook.current.lastLanded()).toEqual([L("a"), L("b")]);
  });

  it("UT-PLANWRITE-016 after a part-way failure run() resolves null, the error text is unchanged, and lastLanded() holds what landed", async () => {
    behaviour.queue = [() => { throw new PlanError(2, 5, "allocations", new Error("boom"), ["a", "b"], [L("a"), L("b")]); }];
    const { result: hook } = renderHook(() => usePlanWrite({ invalidate: [], action: "test" }), { wrapper });
    let ids: string[] | null = ["untouched"];
    await act(async () => { ids = await hook.current.run({ progress: "go", plan: plan("first") }); });
    expect(ids).toBeNull();
    expect(hook.current.error).toBe("“allocations” failed: boom. 2 of 5 changes had already been saved.");
    expect(hook.current.lastLanded()).toEqual([L("a"), L("b")]);
  });

  it("UT-PLANWRITE-017 a failure in the `then` plan keeps the first plan's rows and adds the second's", async () => {
    behaviour.queue = [
      result([L("t")]),
      () => { throw new PlanError(1, 3, "second", new Error("boom"), ["x"], [L("x", "vsb_ys")]); },
    ];
    const { result: hook } = renderHook(() => usePlanWrite({ invalidate: [], action: "test" }), { wrapper });
    await act(async () => { await hook.current.run({ progress: "go", plan: plan("first"), then: async () => plan("second") }); });
    expect(hook.current.lastLanded()).toEqual([L("t"), L("x", "vsb_ys")]);
  });

  it("UT-PLANWRITE-018 a failure thrown by `then` itself keeps the first plan's rows; the next run() starts clean; a failing plan() factory leaves none", async () => {
    behaviour.queue = [result([L("t")])];
    const { result: hook } = renderHook(() => usePlanWrite({ invalidate: [], action: "test" }), { wrapper });
    await act(async () => { await hook.current.run({ progress: "go", plan: plan("first"), then: async () => { throw new Error("flow refused"); } }); });
    expect(hook.current.lastLanded()).toEqual([L("t")]);

    behaviour.queue = [result([L("n")])];
    await act(async () => { await hook.current.run({ progress: "go", plan: plan("again") }); });
    expect(hook.current.lastLanded()).toEqual([L("n")]);

    await act(async () => { await hook.current.run({ progress: "go", plan: async () => { throw new Error("read failed"); } }); });
    expect(hook.current.lastLanded()).toEqual([]);
  });
});
