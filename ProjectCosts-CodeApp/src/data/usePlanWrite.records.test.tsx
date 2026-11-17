// @vitest-environment jsdom
/**
 * UT-PLANWRITE-020.. — review fix F2 in `usePlanWrite`: the rows-gone message keeps the saved-count sentence,
 * `lastMaybeLanded()` and `lastDeleted()` (same lifecycle as `lastLanded()`), and a refusal of the SECOND plan
 * of a job reported as a part-way stop. `executePlan` is stubbed.
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

import { PlanError, PlanRefusedError } from "./executePlan";
import { BulkRowsGoneError } from "./bulkBackend";
import { usePlanWrite, writeErrorMessage } from "./usePlanWrite";

const wrapper = ({ children }: { children: ReactNode }) =>
  <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>{children}</QueryClientProvider>;
const plan = (reason: string, rows = 1): WritePlan => ({
  writes: Array.from({ length: rows }, () => ({ op: "create" as const, entitySet: "vsb_xs", data: {}, reason })), log: [],
});
const L = (id: string, entitySet = "vsb_xs"): LandedRow => ({ entitySet, id });
const done = (landed: LandedRow[], extra: { deleted?: LandedRow[]; maybeLanded?: LandedRow[] } = {}) => () => ({
  done: landed.length, createdIds: landed.map((l) => l.id), createdRows: {}, landed,
  deleted: extra.deleted ?? [], maybeLanded: extra.maybeLanded ?? [],
});

describe("rows gone mid-plan", () => {
  it("UT-PLANWRITE-020 the rows-gone text gains the saved-count sentence only when something was already saved", () => {
    const gone = new BulkRowsGoneError(["a", "b"]);
    const text = "2 row(s) no longer exist. Reload the page and try again.";
    expect(writeErrorMessage(new PlanError(0, 4, "status", gone), "save")).toBe(text);
    expect(writeErrorMessage(new PlanError(3, 4, "status", gone), "save")).toBe(`${text} 3 of 4 changes had already been saved.`);
    expect(writeErrorMessage(new PlanError(3, 4, "status", gone), "save", (d) => `Failed: ${d}`)).toBe(`Failed: ${text} 3 of 4 changes had already been saved.`);
    expect(writeErrorMessage(gone, "save")).toBe(text);
  });
});

describe("usePlanWrite lastMaybeLanded and lastDeleted", () => {
  it("UT-PLANWRITE-021 lastMaybeLanded() holds the failed createMany's unconfirmed rows, merged with the first plan, and never a confirmed row", async () => {
    behaviour.queue = [
      done([L("t")]),
      () => { throw new PlanError(1, 3, "second", new Error("timeout"), ["x"], [L("x")], { maybeLanded: [L("y"), L("x"), L("z")] }); },
    ];
    const { result: hook } = renderHook(() => usePlanWrite({ invalidate: [], action: "test" }), { wrapper });
    await act(async () => { await hook.current.run({ progress: "go", plan: plan("first"), then: async () => plan("second") }); });
    expect(hook.current.lastLanded()).toEqual([L("t"), L("x")]);
    expect(hook.current.lastMaybeLanded()).toEqual([L("y"), L("z")]);
  });

  it("UT-PLANWRITE-022 lastMaybeLanded() after a failed first plan; reset when the next run() starts and after a clean run", async () => {
    behaviour.queue = [() => { throw new PlanError(0, 2, "allocations", new Error("net"), [], [], { maybeLanded: [L("a"), L("b")] }); }];
    const { result: hook } = renderHook(() => usePlanWrite({ invalidate: [], action: "test" }), { wrapper });
    await act(async () => { await hook.current.run({ progress: "go", plan: plan("first") }); });
    expect(hook.current.lastMaybeLanded()).toEqual([L("a"), L("b")]);
    behaviour.queue = [done([L("n")])];
    await act(async () => { await hook.current.run({ progress: "go", plan: plan("again") }); });
    expect(hook.current.lastMaybeLanded()).toEqual([]);
    expect(hook.current.lastDeleted()).toEqual([]);
  });

  it("UT-PLANWRITE-023 lastDeleted() merges the first and `then` plans after a success and keeps the failing plan's deletes after a failure", async () => {
    behaviour.queue = [done([], { deleted: [L("d1")] }), done([], { deleted: [L("d2"), L("d3")] })];
    const { result: hook } = renderHook(() => usePlanWrite({ invalidate: [], action: "test" }), { wrapper });
    await act(async () => { await hook.current.run({ progress: "go", plan: plan("first"), then: async () => plan("second") }); });
    expect(hook.current.lastDeleted()).toEqual([L("d1"), L("d2"), L("d3")]);

    behaviour.queue = [
      done([], { deleted: [L("e1")] }),
      () => { throw new PlanError(1, 3, "second", new Error("403"), [], [], { deleted: [L("e2")] }); },
    ];
    await act(async () => { await hook.current.run({ progress: "go", plan: plan("first"), then: async () => plan("second") }); });
    expect(hook.current.lastDeleted()).toEqual([L("e1"), L("e2")]);
  });

  it("UT-PLANWRITE-024 an executePlan stand-in without the new fields (an older screen test mock) leaves both lists empty", async () => {
    behaviour.queue = [() => ({ done: 1, createdIds: ["a"] })];
    const { result: hook } = renderHook(() => usePlanWrite({ invalidate: [], action: "test" }), { wrapper });
    await act(async () => { await hook.current.run({ progress: "go", plan: plan("first") }); });
    expect(hook.current.lastMaybeLanded()).toEqual([]);
    expect(hook.current.lastDeleted()).toEqual([]);
  });
});

describe("a refusal in the second plan", () => {
  it("UT-PLANWRITE-025 a PlanRefusedError of the `then` plan after the first plan landed rows is a PlanError carrying the first plan's count and rows", async () => {
    behaviour.queue = [done([L("a"), L("b")]), () => { throw new PlanRefusedError("Row g1 has no business unit. Nothing was sent."); }];
    const { result: hook } = renderHook(() => usePlanWrite({ invalidate: [], action: "test" }), { wrapper });
    let ids: string[] | null = ["untouched"];
    await act(async () => { ids = await hook.current.run({ progress: "go", plan: plan("first", 2), then: async () => plan("second", 3) }); });
    expect(ids).toBeNull();
    expect(hook.current.error).toBe("“go” failed: Row g1 has no business unit. Nothing was sent.. 2 of 5 changes had already been saved. The saved rows stay: do not repeat the action. The screen shows them once it has reloaded.");
    expect(hook.current.lastLanded()).toEqual([L("a"), L("b")]);
  });

  it("UT-PLANWRITE-026 a refusal of the FIRST plan, or of the second after nothing landed, stays a plain refusal message", async () => {
    behaviour.queue = [() => { throw new PlanRefusedError("Refused. Nothing was sent."); }];
    const { result: hook } = renderHook(() => usePlanWrite({ invalidate: [], action: "test" }), { wrapper });
    await act(async () => { await hook.current.run({ progress: "go", plan: plan("first") }); });
    expect(hook.current.error).toBe("Refused. Nothing was sent.");

    behaviour.queue = [done([]), () => { throw new PlanRefusedError("Refused. Nothing was sent."); }];
    await act(async () => { await hook.current.run({ progress: "go", plan: plan("first", 0), then: async () => plan("second") }); });
    expect(hook.current.error).toBe("Refused. Nothing was sent.");
  });
});
