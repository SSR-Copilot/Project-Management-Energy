// @vitest-environment jsdom
/**
 * dvopt T-20 on the hooks: CA-09 (the comment threads start with the payments, under the key the screen reads) and CA-16 (the
 * active-WTG count is read only when a per-WTG standard contract can use it).
 */
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DevexCapexAssumption } from "@/features/cost/capex-costs/standardContracts";

const repo = {
  getCostBook: vi.fn(),
};
vi.mock("@/data/costRepository", () => ({ costRepository: () => repo }));
vi.mock("@/app/SessionContext", () => ({ useSession: () => ({ projectId: "p-1", project: null }) }));
const loadComments = vi.fn(async (_ids: readonly string[]) => []);
vi.mock("@/data/comments", () => ({ loadComments: (ids: readonly string[]) => loadComments(ids), deleteComment: vi.fn(), saveComment: vi.fn() }));
const assumptions: DevexCapexAssumption[] = [];
const loadStandardAssumptions = vi.fn(async () => assumptions);
const loadActiveWtgCount = vi.fn(async (_projectId: string) => 4);
vi.mock("@/data/standardContracts", () => ({
  loadStandardAssumptions: () => loadStandardAssumptions(), loadActiveWtgCount: (p: string) => loadActiveWtgCount(p),
}));
vi.mock("@/features/cost/contracts/hooks", () => ({ useProjectExtras: () => ({ data: { countryId: "de", technology: 1 } }) }));

const { useCostBook, useStandardAssumptions, capexCommentsKey, useCapexComments } = await import("./useCostBook");
const { setCapexOptFlags, resetCapexOptFlags } = await import("@/data/capexOptFlags");
const { pendingDeletes } = await import("@/data/pendingDeletes");

const EMPTY_BOOK = { accounts: [], lines: [], periods: [], extraGroups: { om: [], land: [], other: [] } };
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}
const assumption = (id: string, unit: number): DevexCapexAssumption => ({
  id, description: id, subaccountId: "sub-1", countryId: "de", technology: 1, costAmount: 10, unit, costPaidBy: 952850002,
  distributionFrequency: 1, applyVat: false, depreciation: false, clusters: [true, false, false, false, false],
});

afterEach(() => {
  vi.clearAllMocks();
  assumptions.length = 0;
  resetCapexOptFlags();
});

describe("CA-09 comments in the payments wave", () => {
  it("UT-COMMENTWAVE-010 a CAPEX tab's book read warms the comments under the key the screen reads, as soon as the ids are known", async () => {
    // The repository hands the ids out DURING the read (before the payments), then answers with the book.
    let finish: () => void = () => undefined;
    repo.getCostBook.mockImplementation(async (_p: string, _c: number, options: { onContracts?: (ids: string[]) => void }) => {
      options.onContracts?.(["c-b", "c-a"]);
      await new Promise<void>((r) => { finish = r; });
      return EMPTY_BOOK;
    });
    const { client, wrapper } = setup();
    renderHook(() => useCostBook(2), { wrapper });
    await waitFor(() => expect(loadComments).toHaveBeenCalledTimes(1));
    // The book has NOT resolved yet: the comments did not wait for it.
    expect(client.getQueryState(["cost-book", "p-1", 2])?.status).toBe("pending");
    expect(loadComments).toHaveBeenCalledWith(["c-b", "c-a"]);
    await waitFor(() => expect(client.getQueryData(["capex-comments", capexCommentsKey(["c-a", "c-b"])])).toEqual([]));
    finish();
    await waitFor(() => expect(client.getQueryState(["cost-book", "p-1", 2])?.status).toBe("success"));
  });

  it("UT-COMMENTWAVE-011 the screen's own comments query then finds the data: no second read for the same ids", async () => {
    repo.getCostBook.mockImplementation(async (_p: string, _c: number, options: { onContracts?: (ids: string[]) => void }) => {
      options.onContracts?.(["c-b", "c-a"]);
      return EMPTY_BOOK;
    });
    const { client, wrapper } = setup();
    renderHook(() => useCostBook(2), { wrapper });
    await waitFor(() => expect(client.getQueryData(["capex-comments", "c-a,c-b"])).toBeDefined());
    const screen = renderHook(() => useCapexComments(["c-a", "c-b"]), { wrapper });
    await waitFor(() => expect(screen.result.current.isSuccess).toBe(true));
    expect(loadComments).toHaveBeenCalledTimes(1);
  });

  it("UT-COMMENTWAVE-012 a book reload does not re-read threads the cache already holds", async () => {
    repo.getCostBook.mockImplementation(async (_p: string, _c: number, options: { onContracts?: (ids: string[]) => void }) => {
      options.onContracts?.(["c-a"]);
      return EMPTY_BOOK;
    });
    const { client, wrapper } = setup();
    renderHook(() => useCostBook(2), { wrapper });
    await waitFor(() => expect(loadComments).toHaveBeenCalledTimes(1));
    await client.invalidateQueries({ queryKey: ["cost-book", "p-1", 2] });
    await waitFor(() => expect(repo.getCostBook).toHaveBeenCalledTimes(2));
    expect(loadComments).toHaveBeenCalledTimes(1);
  });

  it("UT-COMMENTWAVE-013 contracts whose delete is still pending are left out of the warmed key (the book excludes them too)", async () => {
    const done = pendingDeletes.add({ contractIds: ["C-GONE"] });
    repo.getCostBook.mockImplementation(async (_p: string, _c: number, options: { onContracts?: (ids: string[]) => void }) => {
      options.onContracts?.(["c-a", "c-gone"]);
      return EMPTY_BOOK;
    });
    const { wrapper } = setup();
    renderHook(() => useCostBook(2), { wrapper });
    await waitFor(() => expect(loadComments).toHaveBeenCalledTimes(1));
    expect(loadComments).toHaveBeenCalledWith(["c-a"]);
    done();
  });

  it("UT-COMMENTWAVE-014 no callback is passed for the Summary tab, the period screens, or with COMMENTS_WITH_PAYMENTS off", async () => {
    repo.getCostBook.mockResolvedValue(EMPTY_BOOK);
    const { wrapper } = setup();
    renderHook(() => useCostBook(-1), { wrapper });
    renderHook(() => useCostBook(undefined), { wrapper });
    await waitFor(() => expect(repo.getCostBook).toHaveBeenCalledTimes(2));
    for (const call of repo.getCostBook.mock.calls) expect(call[2]).not.toHaveProperty("onContracts");
    repo.getCostBook.mockClear();
    setCapexOptFlags({ COMMENTS_WITH_PAYMENTS: false });
    renderHook(() => useCostBook(3), { wrapper });
    await waitFor(() => expect(repo.getCostBook).toHaveBeenCalledTimes(1));
    expect(repo.getCostBook.mock.calls[0]?.[2]).not.toHaveProperty("onContracts");
  });
});

describe("CA-16 the active-WTG count is read only when it can be used", () => {
  const flush = () => new Promise((r) => setTimeout(r, 20));

  it("UT-WTGLAZY-001 a category with no per-WTG standard contract never reads the count", async () => {
    assumptions.push(assumption("flat", 1), assumption("mw", 3));
    const { wrapper } = setup();
    const hook = renderHook(() => useStandardAssumptions(["sub-1"]), { wrapper });
    await waitFor(() => expect(hook.result.current.assumptions).toHaveLength(2));
    await flush();
    expect(loadActiveWtgCount).not.toHaveBeenCalled();
    expect(hook.result.current.activeWtgCountReady).toBe(false);
  });

  it("UT-WTGLAZY-002 a category that offers a per-WTG standard contract reads it once, and the count reaches the caller", async () => {
    const { COST_UNIT } = await import("@/features/cost/capex-costs/standardContracts");
    assumptions.push(assumption("wtg", COST_UNIT.eurPerWtg));
    const { wrapper } = setup();
    const hook = renderHook(() => useStandardAssumptions(["sub-1"]), { wrapper });
    await waitFor(() => expect(hook.result.current.activeWtgCount).toBe(4));
    expect(loadActiveWtgCount).toHaveBeenCalledTimes(1);
    expect(hook.result.current.activeWtgCountReady).toBe(true);
  });

  it("UT-WTGLAZY-003 ensureActiveWtgCount reads it on demand (a click that beat the lazy read) and the result is shared with the query", async () => {
    assumptions.push(assumption("flat", 1));
    const { wrapper } = setup();
    const hook = renderHook(() => useStandardAssumptions(["sub-1"]), { wrapper });
    await waitFor(() => expect(hook.result.current.assumptions).toHaveLength(1));
    await expect(hook.result.current.ensureActiveWtgCount()).resolves.toBe(4);
    await expect(hook.result.current.ensureActiveWtgCount()).resolves.toBe(4);
    expect(loadActiveWtgCount).toHaveBeenCalledTimes(1);
  });

  it("UT-WTGLAZY-004 with WTG_COUNT_STANDARD_ONLY off the count is read on every visit, as before", async () => {
    setCapexOptFlags({ WTG_COUNT_STANDARD_ONLY: false });
    assumptions.push(assumption("flat", 1));
    const { wrapper } = setup();
    renderHook(() => useStandardAssumptions(["sub-1"]), { wrapper });
    await waitFor(() => expect(loadActiveWtgCount).toHaveBeenCalledTimes(1));
  });
});

describe("SCC-16 / T-E06: the comment dots keep the previous threads while the next id list loads (opt-in)", () => {
  /** The first id list answers at once; the second is held open so the in-between render can be read. */
  function twoLists() {
    const thread = (id: string) => ({ id, contractId: id, costId: `cost-${id}`, comment: "x" });
    let release: () => void = () => undefined;
    loadComments.mockImplementation(async (ids: readonly string[]) => {
      if (ids.includes("c-b")) await new Promise<void>((r) => { release = r; });
      return [thread(ids[0]!)] as never[];
    });
    return { release: () => release() };
  }
  const keys = (ids: readonly string[]) => capexCommentsKey(ids);

  it("UT-CAPEXCOM-020 with keepPrevious the first render of the new key still holds the previous key's threads (placeholder)", async () => {
    const gate = twoLists();
    const { client, wrapper } = setup();
    const hook = renderHook(({ ids }: { ids: string[] }) => useCapexComments(ids, { keepPrevious: true }), { wrapper, initialProps: { ids: ["c-a"] } });
    await waitFor(() => expect(hook.result.current.data).toHaveLength(1));
    hook.rerender({ ids: ["c-a", "c-b"] });
    // The new key has no data yet, and the old data is shown meanwhile.
    expect(client.getQueryData(["capex-comments", keys(["c-a", "c-b"])])).toBeUndefined();
    expect(hook.result.current.data).toHaveLength(1);
    expect(hook.result.current.isPlaceholderData).toBe(true);
    gate.release();
    await waitFor(() => expect(hook.result.current.isPlaceholderData).toBe(false));
  });

  it("UT-CAPEXCOM-021 WITHOUT the option (the comments panel's call) another contract's threads are never shown while loading", async () => {
    const gate = twoLists();
    const { wrapper } = setup();
    const hook = renderHook(({ ids }: { ids: string[] }) => useCapexComments(ids), { wrapper, initialProps: { ids: ["c-a"] } });
    await waitFor(() => expect(hook.result.current.data).toHaveLength(1));
    hook.rerender({ ids: ["c-b"] });
    expect(hook.result.current.data).toBeUndefined();
    expect(hook.result.current.isPlaceholderData).toBe(false);
    gate.release();
    await waitFor(() => expect(hook.result.current.data).toHaveLength(1));
  });
});
