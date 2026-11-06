// @vitest-environment jsdom
/**
 * UT-PLANWRITE-006..008 — `PlanJob.then` (D81): a second step in the same job after the plan's writes, where a cloud
 * flow is called between the canvas's writes. `executePlan` is stubbed; the order, the handed-over result, the
 * progress text and the error path are pinned. UT-PLANWRITE-009..010 — `refresh: "background"` (save performance,
 * 6 Nov 2026) against the default, which still waits for the reload.
 */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { WritePlan } from "./writePlan";

const seen = vi.hoisted(() => ({ plans: [] as WritePlan[] }));
vi.mock("./executePlan", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./executePlan")>();
  return {
    ...mod,
    executePlan: vi.fn(async (plan: WritePlan) => {
      seen.plans.push(plan);
      const n = seen.plans.length;
      return { done: plan.writes.length, createdIds: plan.writes.filter((w) => w.op === "create").map((_, i) => `new-${n}-${i}`) };
    }),
  };
});

import { usePlanWrite } from "./usePlanWrite";

const wrapper = ({ children }: { children: ReactNode }) =>
  <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>{children}</QueryClientProvider>;

const create = (reason: string): WritePlan => ({ writes: [{ op: "create", entitySet: "vsb_xs", data: {}, reason }], log: [] });
const update = (reason: string): WritePlan => ({ writes: [{ op: "update", entitySet: "vsb_xs", id: "1", data: {}, reason }], log: [] });

describe("usePlanWrite then", () => {
  it("UT-PLANWRITE-006 the first plan runs, `then` gets its result and may add a second plan; both results are returned", async () => {
    seen.plans.length = 0;
    const { result } = renderHook(() => usePlanWrite({ invalidate: [], action: "test" }), { wrapper });
    const then = vi.fn(async (_first: unknown, _ctl: unknown) => update("second"));
    let created: string[] | null = null;
    await act(async () => { created = await result.current.run({ progress: "go", plan: create("first"), then }); });
    expect(seen.plans.map((p) => p.writes[0]!.reason)).toEqual(["first", "second"]);
    expect(then).toHaveBeenCalledTimes(1);
    expect(then.mock.calls[0]![0]).toMatchObject({ done: 1, createdIds: ["new-1-0"] });
    expect(created).toEqual(["new-1-0"]);
    expect(result.current.error).toBeNull();
  });

  it("UT-PLANWRITE-007 `then` may return nothing (a flow with no write after it) and may change the progress text", async () => {
    seen.plans.length = 0;
    const { result } = renderHook(() => usePlanWrite({ invalidate: [], action: "test" }), { wrapper });
    let progressDuring: string | null = null;
    const then = vi.fn(async (_first: unknown, ctl: { setProgress: (t: string) => void }) => {
      ctl.setProgress("flow running");
      await new Promise((r) => setTimeout(r, 0));
      progressDuring = "set";
      return null;
    });
    await act(async () => { await result.current.run({ progress: "go", plan: update("only"), then }); });
    expect(seen.plans).toHaveLength(1);
    expect(progressDuring).toBe("set");
    await waitFor(() => expect(result.current.progress).toBeNull());
  });

  it("UT-PLANWRITE-008 a failure in `then` (the flow refused) is reported like a failed write; the first plan's writes stay", async () => {
    seen.plans.length = 0;
    const { result } = renderHook(() => usePlanWrite({ invalidate: [], action: "test", errorText: (d) => `Error: ${d}` }), { wrapper });
    let created: string[] | null = ["untouched"];
    await act(async () => {
      created = await result.current.run({
        progress: "go", plan: create("first"),
        then: async () => { throw new Error("flow Perform Common Request of Gate Approval failed: no"); },
      });
    });
    expect(created).toBeNull();
    expect(seen.plans).toHaveLength(1);
    expect(result.current.error).toBe("Error: flow Perform Common Request of Gate Approval failed: no");
  });

  /** A QueryClient whose reload (`invalidateQueries`) only finishes when the test says so. */
  function heldReload() {
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    let finish: () => void = () => {};
    const reload = new Promise<void>((resolve) => { finish = resolve; });
    vi.spyOn(qc, "invalidateQueries").mockReturnValue(reload);
    const own = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    return { own, reload, finish: () => finish() };
  }

  it("UT-PLANWRITE-009 refresh \"background\": the job ends once the writes land; `refreshing` holds until the reload ends", async () => {
    seen.plans.length = 0;
    const held = heldReload();
    const { result } = renderHook(
      () => usePlanWrite({ invalidate: [["x"]], action: "test", refresh: "background" }), { wrapper: held.own },
    );
    let ended = false;
    await act(async () => { await result.current.run({ progress: "go", plan: update("only") }); ended = true; });
    expect(ended).toBe(true);
    expect(result.current.progress).toBeNull();
    expect(result.current.refreshing).toBe(true);
    await act(async () => { held.finish(); await held.reload; });
    await waitFor(() => expect(result.current.refreshing).toBe(false));
  });

  it("UT-PLANWRITE-010 by default the job still waits for the reload before it ends", async () => {
    seen.plans.length = 0;
    const held = heldReload();
    const { result } = renderHook(() => usePlanWrite({ invalidate: [["x"]], action: "test" }), { wrapper: held.own });
    let ended = false;
    let running: Promise<unknown> = Promise.resolve();
    act(() => { running = result.current.run({ progress: "go", plan: update("only") }).then(() => { ended = true; }); });
    await new Promise((r) => setTimeout(r, 30));
    expect(ended).toBe(false);
    expect(result.current.refreshing).toBe(false);
    await act(async () => { held.finish(); await running; });
    expect(ended).toBe(true);
  });
});
