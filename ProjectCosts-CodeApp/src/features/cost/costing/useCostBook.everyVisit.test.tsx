// @vitest-environment jsdom
/**
 * D123 — the OPEX screen re-reads its cost book and its device cards on every visit, as the canvas `OnVisible`
 * (`ClearCollect(colOpexProjectCosts, …)`, `colDeviceTypesInProject`) does, WITHOUT a loader on the second visit:
 * the cached rows show at once and the re-read runs behind them. The other Cost screens keep the app-wide cache.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const repo = vi.hoisted(() => ({
  getCostBook: vi.fn(async () => ({ accounts: [], lines: [], periods: [], extraGroups: { om: [], land: [], other: [] } })),
  listOpexDeviceTypes: vi.fn(async () => [[], []]),
  addStandardContract: vi.fn(async () => []),
}));
vi.mock("@/data/costRepository", () => ({ costRepository: () => repo }));
vi.mock("@/app/SessionContext", () => ({ useSession: () => ({ projectId: "p-1", project: null }) }));

const { useCostBook, useOpexDeviceTypes, useAddStandardContract } = await import("./useCostBook");

/** The app's own defaults (`Providers.tsx`): a 30 s cache. */
const newClient = () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } });
const wrapperFor = (client: QueryClient) => ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

afterEach(() => { vi.clearAllMocks(); });

describe("D123 — OPEX reads on every visit", () => {
  it("UT-OPEXLOAD-001 the OPEX book is re-read on a second visit inside the 30 s cache, with no loader", async () => {
    const client = newClient();
    const first = renderHook(() => useCostBook(undefined, { everyVisit: true }), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(first.result.current.data).toBeDefined());
    first.unmount();
    expect(repo.getCostBook).toHaveBeenCalledTimes(1);

    const second = renderHook(() => useCostBook(undefined, { everyVisit: true }), { wrapper: wrapperFor(client) });
    // The cached book is there at once: `isLoading` (what drives the screen's loader) stays false.
    expect(second.result.current.data).toBeDefined();
    expect(second.result.current.isLoading).toBe(false);
    await waitFor(() => expect(repo.getCostBook).toHaveBeenCalledTimes(2));
  });

  it("UT-OPEXLOAD-002 without the option (the other Cost screens) the 30 s cache still applies", async () => {
    const client = newClient();
    const first = renderHook(() => useCostBook(), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(first.result.current.data).toBeDefined());
    first.unmount();
    renderHook(() => useCostBook(), { wrapper: wrapperFor(client) });
    await act(async () => { await Promise.resolve(); });
    expect(repo.getCostBook).toHaveBeenCalledTimes(1);
  });

  it("UT-OPEXLOAD-003 the O&M device cards are re-read on every visit, inside their 5-minute cache too", async () => {
    const client = newClient();
    const first = renderHook(() => useOpexDeviceTypes("p-1"), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(first.result.current.data).toBeDefined());
    first.unmount();
    const second = renderHook(() => useOpexDeviceTypes("p-1"), { wrapper: wrapperFor(client) });
    expect(second.result.current.isLoading).toBe(false);
    await waitFor(() => expect(repo.listOpexDeviceTypes).toHaveBeenCalledTimes(2));
  });

  it("UT-OPEXLOAD-004 an O&M Add Standard Contract also refreshes the device cards (`Refresh(DeviceTypesInProjects)`)", async () => {
    const client = newClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useAddStandardContract(), { wrapper: wrapperFor(client) });
    await act(async () => { await result.current.mutateAsync({ mode: "om" } as never); });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["opex-device-types", "p-1"] });
  });

  it("UT-OPEXLOAD-005 an Other OPEX or Land Lease import leaves the device cards alone (B2, OPT-26: only O&M reads them)", async () => {
    for (const mode of ["other", "land"]) {
      const client = newClient();
      const invalidate = vi.spyOn(client, "invalidateQueries");
      const { result } = renderHook(() => useAddStandardContract(), { wrapper: wrapperFor(client) });
      await act(async () => { await result.current.mutateAsync({ mode } as never); });
      expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["opex-device-types", "p-1"] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["cost-book", "p-1", "none"] });
    }
  });

  it("UT-OPEXLOAD-006 the device-type query does not run when disabled (Other OPEX) and runs when enabled (O&M)", async () => {
    const client = newClient();
    const off = renderHook(() => useOpexDeviceTypes("p-1", false), { wrapper: wrapperFor(client) });
    await act(async () => { await Promise.resolve(); });
    expect(repo.listOpexDeviceTypes).not.toHaveBeenCalled();
    expect(off.result.current.isLoading).toBe(false);
    renderHook(() => useOpexDeviceTypes("p-1", true), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(repo.listOpexDeviceTypes).toHaveBeenCalledTimes(1));
  });

  it("UT-OPEXLOAD-007 the OPEX book has its own key under the \"none\" prefix and asks the repository for the OPEX scope", async () => {
    const client = newClient();
    const { result } = renderHook(() => useCostBook(undefined, { everyVisit: true, scope: "opex" }), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(repo.getCostBook).toHaveBeenCalledWith("p-1", undefined, expect.objectContaining({ scope: "opex" }));
    expect(client.getQueryCache().find({ queryKey: ["cost-book", "p-1", "none", "opex"] })).toBeDefined();
    // Every existing `["cost-book", project, "none"]` invalidation still reaches it, by prefix.
    expect(client.getQueryCache().findAll({ queryKey: ["cost-book", "p-1", "none"] })).toHaveLength(1);
    // Without a scope the key and the call are the full book's, as before.
    const full = renderHook(() => useCostBook(undefined), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(full.result.current.data).toBeDefined());
    expect(client.getQueryCache().find({ queryKey: ["cost-book", "p-1", "none"], exact: true })).toBeDefined();
    expect(repo.getCostBook).toHaveBeenLastCalledWith("p-1", undefined, expect.not.objectContaining({ scope: expect.anything() }));
  });
});
