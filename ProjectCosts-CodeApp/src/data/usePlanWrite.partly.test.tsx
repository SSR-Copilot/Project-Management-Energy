// @vitest-environment jsdom
/**
 * UT-PLANWRITE-027.. — generators fix F2: a failure of a job's SECOND step (the `then` plan, or a flow call in `then`) after the
 * first plan landed is reported with the whole job's counts and says the saved rows stay (D121 §1), so the
 * user does not press Add again. Rollback accounting (`lastLanded` / `lastMaybeLanded` / `lastDeleted`) is unchanged.
 * `executePlan` is stubbed; `usePlanWrite` and `writeErrorMessage` are the real ones.
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
import { BulkRowsGoneError } from "./bulkBackend";
import { PARTLY_SAVED_NOTE, PartlySavedJobError, SUCCESS_TIMEOUT_MS, usePlanWrite, writeErrorMessage } from "./usePlanWrite";

const wrapper = ({ children }: { children: ReactNode }) =>
  <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>{children}</QueryClientProvider>;
const plan = (reason: string, rows = 1): WritePlan => ({
  writes: Array.from({ length: rows }, () => ({ op: "create" as const, entitySet: "vsb_xs", data: {}, reason })), log: [],
});
const L = (id: string): LandedRow => ({ entitySet: "vsb_xs", id });
const done = (landed: LandedRow[]) => () => ({
  done: landed.length, createdIds: landed.map((l) => l.id), createdRows: {}, landed, deleted: [], maybeLanded: [],
});

describe("a failed second step after the first plan landed", () => {
  it("UT-PLANWRITE-027 a PlanError of the second plan reports the whole job's counts, names the failing step and says the rows stay", async () => {
    behaviour.queue = [done([L("t")]), () => { throw new PlanError(2, 4, "device type row", new Error("HTTP 400"), ["x", "y"], [L("x"), L("y")]); }];
    const { result: hook } = renderHook(() => usePlanWrite({ invalidate: [], action: "test" }), { wrapper });
    let ids: string[] | null = ["untouched"];
    await act(async () => { ids = await hook.current.run({ progress: "go", plan: plan("first"), then: async () => plan("second", 4) }); });
    expect(ids).toBeNull();
    // first plan 1 + second plan 2 done, 1 + 4 in total
    expect(hook.current.error).toBe(`“device type row” failed: HTTP 400. 3 of 5 changes had already been saved. ${PARTLY_SAVED_NOTE}`);
    expect(hook.current.lastLanded()).toEqual([L("t"), L("x"), L("y")]);
  });

  it("UT-PLANWRITE-028 a plain Error from `then` (a flow call) after the first plan landed is wrapped: the count is the first plan's, the note is there", async () => {
    behaviour.queue = [done([L("t"), L("u")])];
    const { result: hook } = renderHook(() => usePlanWrite({ invalidate: [], action: "test", errorText: (d) => `Error: ${d}` }), { wrapper });
    await act(async () => {
      await hook.current.run({ progress: "go", plan: plan("first", 2), then: async () => { throw new Error("flow RequestModulePermission failed: no"); } });
    });
    expect(hook.current.error).toBe(`Error: “go” failed: flow RequestModulePermission failed: no. 2 of 2 changes had already been saved. ${PARTLY_SAVED_NOTE}`);
    expect(hook.current.lastLanded()).toEqual([L("t"), L("u")]);
  });

  it("UT-PLANWRITE-029 nothing landed in the first plan: a failure of `then` or of the second plan keeps its plain message", async () => {
    behaviour.queue = [done([])];
    const { result: hook } = renderHook(() => usePlanWrite({ invalidate: [], action: "test" }), { wrapper });
    await act(async () => { await hook.current.run({ progress: "go", plan: plan("first", 0), then: async () => { throw new Error("flow failed"); } }); });
    expect(hook.current.error).toBe("flow failed");

    behaviour.queue = [done([]), () => { throw new PlanError(0, 2, "second", new Error("boom")); }];
    await act(async () => { await hook.current.run({ progress: "go", plan: plan("first", 0), then: async () => plan("second", 2) }); });
    expect(hook.current.error).toBe("“second” failed: boom.");
  });

  it("UT-PLANWRITE-030 rows gone in the second plan after the first landed: the rows-gone text keeps its sentence and gains the note", () => {
    const gone = new BulkRowsGoneError(["a"]);
    const text = "1 row(s) no longer exist. Reload the page and try again.";
    expect(writeErrorMessage(new PartlySavedJobError(3, 5, "status", gone), "save"))
      .toBe(`${text} 3 of 5 changes had already been saved. ${PARTLY_SAVED_NOTE}`);
    // a plain PlanError (no first plan) is unchanged
    expect(writeErrorMessage(new PlanError(3, 5, "status", gone), "save")).toBe(`${text} 3 of 5 changes had already been saved.`);
  });

  it("UT-PLANWRITE-031 the second plan's maybe-landed and deleted rows still reach the rollback record, merged with the first plan's", async () => {
    behaviour.queue = [
      done([L("t")]),
      () => { throw new PlanError(1, 3, "second", new Error("timeout"), ["x"], [L("x")], { maybeLanded: [L("y"), L("x")], deleted: [L("d")] }); },
    ];
    const { result: hook } = renderHook(() => usePlanWrite({ invalidate: [], action: "test" }), { wrapper });
    await act(async () => { await hook.current.run({ progress: "go", plan: plan("first"), then: async () => plan("second", 3) }); });
    expect(hook.current.lastLanded()).toEqual([L("t"), L("x")]);
    expect(hook.current.lastMaybeLanded()).toEqual([L("y")]);
    expect(hook.current.lastDeleted()).toEqual([L("d")]);
  });

  it("UT-PLANWRITE-032 a success text goes away after the canvas Notify's 2 s; an error text stays (user, 25 Nov 2026)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      behaviour.queue = [done([L("t")]), () => { throw new PlanError(0, 1, "second", new Error("HTTP 400"), [], []); }];
      const { result: hook } = renderHook(() => usePlanWrite({ invalidate: [], action: "test" }), { wrapper });
      await act(async () => { await hook.current.run({ progress: "go", plan: plan("first"), success: "Saved!" }); });
      expect(hook.current.success).toBe("Saved!");
      act(() => { vi.advanceTimersByTime(SUCCESS_TIMEOUT_MS - 1); });
      expect(hook.current.success).toBe("Saved!");
      act(() => { vi.advanceTimersByTime(1); });
      expect(hook.current.success).toBeNull();
      // A failure's text has no timer.
      await act(async () => { await hook.current.run({ progress: "go", plan: plan("second") }); });
      expect(hook.current.error).toContain("HTTP 400");
      act(() => { vi.advanceTimersByTime(SUCCESS_TIMEOUT_MS * 5); });
      expect(hook.current.error).toContain("HTTP 400");
    } finally {
      vi.useRealTimers();
    }
  });
});
