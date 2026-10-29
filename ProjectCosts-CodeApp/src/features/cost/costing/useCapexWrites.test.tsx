// @vitest-environment jsdom
/**
 * `useCapexWrites` refreshes the tab a write was MADE on (D58).
 *
 * Without the blocking spinner the user can switch CAPEX tabs while a write runs. TanStack pushes
 * every render's options into a pending mutation, so an `invalidate` built from the render-time
 * category refreshed the tab switched TO and left the written one stale. The category is now
 * captured in `onMutate`. A real `QueryClient` is used, because the bug lives in how TanStack
 * hands options to an in-flight mutation.
 */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { CostLine } from "./model";

/** Writes that only settle when the test says so. */
let release: () => void = () => undefined;
const pending = () => new Promise<void>((resolve) => { release = () => resolve(); });
const repo = {
  setCostPaid: vi.fn(pending),
  deleteCostLine: vi.fn(pending),
  saveCostLine: vi.fn(pending),
};
vi.mock("@/data/costRepository", () => ({ costRepository: () => repo }));
vi.mock("@/app/SessionContext", () => ({ useSession: () => ({ projectId: "p-1", project: null }) }));

const { useCapexWrites } = await import("./useCostBook");

function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(({ category }: { category: number }) => useCapexWrites(category), {
    wrapper, initialProps: { category: 1 },
  });
  /** The cost-book categories invalidated so far. */
  const bookCategories = () => invalidate.mock.calls
    .map(([filters]) => (filters as { queryKey: unknown[] }).queryKey)
    .filter((key) => key[0] === "cost-book")
    .map((key) => key[2]);
  return { hook, bookCategories, invalidate };
}

const LINE = { id: "l1" } as CostLine;

describe("useCapexWrites — the written tab is the one refreshed (D58)", () => {
  it("UT-CAPEX-NOSPIN-022 a Paid write started on tab 1 that settles after a switch to tab 2 refreshes tab 1", async () => {
    const { hook, bookCategories } = setup();
    act(() => { hook.result.current.setPaid.mutate({ lineId: "l1", year: 2026, month: 1, paid: true }); });
    await vi.waitFor(() => expect(repo.setCostPaid).toHaveBeenCalled());
    hook.rerender({ category: 2 });
    await act(async () => { release(); });
    await vi.waitFor(() => expect(bookCategories()).toEqual([1]));
  });

  it("UT-CAPEX-NOSPIN-023 the same holds for a Delete and a panel Save, on success and on failure", async () => {
    const del = setup();
    act(() => { del.hook.result.current.deleteLine.mutate(LINE); });
    await vi.waitFor(() => expect(repo.deleteCostLine).toHaveBeenCalled());
    del.hook.rerender({ category: 2 });
    await act(async () => { release(); });
    await vi.waitFor(() => expect(del.bookCategories()).toEqual([1]));

    const save = setup();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    act(() => {
      save.hook.result.current.saveLine.mutate({ line: LINE, accountId: "a", isNew: false, payments: [] });
    });
    await vi.waitFor(() => expect(repo.saveCostLine).toHaveBeenCalled());
    save.hook.rerender({ category: 2 });
    await act(async () => { release(); });
    await vi.waitFor(() => expect(save.bookCategories()).toEqual([1]));

    // A failed save reloads too (D56 §2) — still the tab it was made on.
    const failed = setup();
    let fail: () => void = () => undefined;
    repo.saveCostLine.mockImplementationOnce(
      () => new Promise<void>((_, reject) => { fail = () => reject(new Error("refused")); }),
    );
    failed.hook.rerender({ category: 3 });
    act(() => {
      failed.hook.result.current.saveLine.mutate({ line: LINE, accountId: "a", isNew: false, payments: [] });
    });
    await vi.waitFor(() => expect(repo.saveCostLine).toHaveBeenCalledTimes(2));
    failed.hook.rerender({ category: 4 });
    await act(async () => { fail(); });
    await vi.waitFor(() => expect(failed.bookCategories()).toEqual([3]));
  });
});

describe("useCapexWrites — a failure after the screen unmounted still reaches the caller (CA-15)", () => {
  it("UT-CAPEX-FLIGHT-010 Paid, Delete and Save failures reach onWriteError even after unmount", async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const onWriteError = vi.fn();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const fails: Array<() => void> = [];
    const failing = () => new Promise<void>((_, reject) => { fails.push(() => reject(new Error("refused"))); });
    repo.setCostPaid.mockImplementationOnce(failing);
    repo.deleteCostLine.mockImplementationOnce(failing);
    repo.saveCostLine.mockImplementationOnce(failing);

    const hook = renderHook(() => useCapexWrites(1, { onWriteError }), { wrapper });
    act(() => {
      hook.result.current.setPaid.mutate({ lineId: "l1", year: 2026, month: 1, paid: true });
      hook.result.current.deleteLine.mutate(LINE);
      hook.result.current.saveLine.mutate({ line: LINE, accountId: "a", isNew: false, payments: [] });
    });
    await vi.waitFor(() => expect(fails).toHaveLength(3));
    hook.unmount();
    await act(async () => { for (const fail of fails) fail(); });
    await vi.waitFor(() => expect(onWriteError).toHaveBeenCalledTimes(3));
    expect(onWriteError.mock.calls.every(([e]) => (e as Error).message === "refused")).toBe(true);
  });

  it("UT-CAPEX-FLIGHT-011 every CAPEX write carries the project's Cost write key", async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const hook = renderHook(() => useCapexWrites(1), { wrapper });
    act(() => { hook.result.current.setPaid.mutate({ lineId: "l1", year: 2026, month: 1, paid: true }); });
    await vi.waitFor(() => expect(client.isMutating({ mutationKey: ["cost-write", "p-1"] })).toBe(1));
    await act(async () => { release(); });
    await vi.waitFor(() => expect(client.isMutating({ mutationKey: ["cost-write", "p-1"] })).toBe(0));
  });
});
