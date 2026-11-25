// @vitest-environment jsdom
/**
 * CA-05 (dvopt T-20, `CAPEX_PATCH_BOOK`): a paid toggle, a panel Save and a panel Delete patch the cached category book from what
 * they wrote and send NO whole-book reload; what the patch cannot prove equal to a reload (`capexBookPatch.ts`) keeps the reload.
 * A real `QueryClient`, the repository mocked. The equality of the patch with a reload is `capexBookPatch.test.ts`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { CostBook, CostLine } from "./model";
import type { PanelSaveWritten } from "@/data/capexWrites";
import { qk } from "@/data/keys";

const repo = {
  setCostPaid: vi.fn(async () => undefined),
  deleteCostLine: vi.fn(async () => undefined),
  saveCostLine: vi.fn(async (_args?: unknown): Promise<string> => "c-1"),
  getCostBook: vi.fn(),
};
vi.mock("@/data/costRepository", () => ({ costRepository: () => repo }));
vi.mock("@/app/SessionContext", () => ({ useSession: () => ({ projectId: "p-1", project: null }) }));

const { useCapexWrites } = await import("./useCostBook");
const { setCapexOptFlags, resetCapexOptFlags } = await import("@/data/capexOptFlags");

const line = (id: string, over: Partial<CostLine> = {}): CostLine => ({
  id, accountId: "sub-1", description: id, payer: "SPV", depreciation: false, vat: false, standard: false,
  distribution: "individual", equalMode: "cluster", distributionScheme: "absolute", startDate: "", endDate: "", frequency: 1,
  clusters: [], payments: [{ id: `${id}-k1`, year: 2026, month: 1, amount: 10, paid: false }], comments: [], totalCost: 100, ...over,
});
const BOOK: CostBook = {
  accounts: [{ id: "sub-1", number: "1", name: "Sub", parentId: "p", category: 1 }],
  lines: [line("c-1"), line("c-2")], periods: [], extraGroups: { om: [], land: [], other: [] },
};
const KEY = ["cost-book", "p-1", 1];

function setup(cached: CostBook | null = BOOK) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  if (cached) client.setQueryData(KEY, cached);
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useCapexWrites(1), { wrapper });
  /** The first element of every invalidated key. */
  const invalidated = () => invalidate.mock.calls.map(([f]) => (f as { queryKey: unknown[] }).queryKey);
  const book = () => client.getQueryData<CostBook>(KEY);
  return { client, hook, invalidated, book };
}

afterEach(() => {
  vi.clearAllMocks();
  resetCapexOptFlags();
});

const written = (over: Partial<PanelSaveWritten> = {}): PanelSaveWritten => ({
  contractId: "c-1", contractCreated: false, created: [], updated: [], deletedIds: [], ...over,
});

describe("a paid toggle", () => {
  it("UT-CAPEXHOOK-001 patches the flag in the cached book and sends no reload and no invalidation at all", async () => {
    const t = setup();
    await act(async () => {
      await t.hook.result.current.setPaid.mutateAsync({ lineId: "c-1", year: 2026, month: 1, paid: true, costId: "c-1-k1" });
    });
    expect(t.book()?.lines[0]?.payments[0]?.paid).toBe(true);
    expect(t.book()?.lines[1]).toBe(BOOK.lines[1]);
    expect(t.invalidated()).toEqual([]);
    expect(repo.getCostBook).not.toHaveBeenCalled();
  });

  it("UT-CAPEXHOOK-002 the cluster-linked confirm clears the link in the cached book too", async () => {
    const t = setup({ ...BOOK, lines: [line("c-1", { linkedClusterId: "s1", linkedClusterName: "Cluster 1", linkedClusterOrder: 1 }), line("c-2")] });
    await act(async () => {
      await t.hook.result.current.setPaid.mutateAsync({ lineId: "c-1", year: 2026, month: 1, paid: true, costId: "c-1-k1", clearLinkedCluster: true });
    });
    expect(t.book()?.lines[0]?.linkedClusterId).toBeUndefined();
    expect(t.book()?.lines[0]?.linkedClusterName).toBeUndefined();
    expect(t.book()?.lines[0]?.linkedClusterOrder).toBeUndefined();
    expect(t.book()?.lines[0]?.payments[0]?.paid).toBe(true);
    expect(t.invalidated()).toEqual([]);
  });

  it("UT-CAPEXHOOK-003 a payment the cached book does not hold keeps the reload of the tab, as before", async () => {
    const t = setup();
    await act(async () => {
      await t.hook.result.current.setPaid.mutateAsync({ lineId: "c-1", year: 2026, month: 5, paid: true, costId: "unknown" });
    });
    expect(t.invalidated()).toEqual([KEY]);
    expect(t.book()).toBe(BOOK);
  });

  it("UT-CAPEXHOOK-004 no cached book for that tab: the old invalidation, nothing is created in the cache", async () => {
    const t = setup(null);
    await act(async () => {
      await t.hook.result.current.setPaid.mutateAsync({ lineId: "c-1", year: 2026, month: 1, paid: true, costId: "c-1-k1" });
    });
    expect(t.invalidated()).toEqual([KEY]);
    expect(t.book()).toBeUndefined();
  });

  it("UT-CAPEXHOOK-005 with CAPEX_PATCH_BOOK off the toggle reloads the book and patches nothing", async () => {
    setCapexOptFlags({ CAPEX_PATCH_BOOK: false });
    const t = setup();
    await act(async () => {
      await t.hook.result.current.setPaid.mutateAsync({ lineId: "c-1", year: 2026, month: 1, paid: true, costId: "c-1-k1" });
    });
    expect(t.invalidated()).toEqual([KEY]);
    expect(t.book()).toBe(BOOK);
  });

  it("UT-CAPEXHOOK-006 a book read still in flight is cancelled, so its pre-write answer cannot overwrite the patch", async () => {
    const t = setup();
    let answer: (b: CostBook) => void = () => undefined;
    void t.client.fetchQuery({ queryKey: KEY, staleTime: 0, queryFn: () => new Promise<CostBook>((r) => { answer = r; }) }).catch(() => undefined);
    await vi.waitFor(() => expect(t.client.isFetching({ queryKey: KEY })).toBe(1));
    await act(async () => {
      await t.hook.result.current.setPaid.mutateAsync({ lineId: "c-1", year: 2026, month: 1, paid: true, costId: "c-1-k1" });
    });
    answer(BOOK); // the pre-write answer, late
    await act(async () => { await Promise.resolve(); });
    expect(t.book()?.lines[0]?.payments[0]?.paid).toBe(true);
  });
});

describe("a panel save", () => {
  const savePatchArgs = (edited: CostLine) => ({ line: edited, accountId: "sub-1", isNew: false, payments: [] as { year: number; month: number; amount: number | null }[] });

  it("UT-CAPEXHOOK-010 patches the saved line; the book is not reloaded, the totals, DevCo and (if months were deleted) comments are refreshed as before", async () => {
    repo.saveCostLine.mockImplementationOnce(async (args: unknown) => {
      (args as { onWritten: (w: PanelSaveWritten) => void }).onWritten(written({ updated: [{ id: "c-1-k1", cost: 77, resetPaid: false }] }));
      return "c-1";
    });
    const t = setup();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    await act(async () => {
      await t.hook.result.current.saveLine.mutateAsync(savePatchArgs(line("c-1", { description: "Renamed", vat: true, totalCost: 500 })));
    });
    expect(t.book()?.lines[0]).toMatchObject({ description: "Renamed", vat: true, totalCost: 500 });
    expect(t.book()?.lines[0]?.payments[0]?.amount).toBe(77);
    expect(t.invalidated().map((k) => k[0])).toEqual(["capex-totals", qk.devCoCapexContracts("p-1")[0], qk.devCoCapexCosts("p-1")[0]]);
    expect(t.invalidated().some((k) => k[0] === "cost-book")).toBe(false);
  });

  it("UT-CAPEXHOOK-011 the per-row path reports nothing, so the book is reloaded as before", async () => {
    const t = setup();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    await act(async () => { await t.hook.result.current.saveLine.mutateAsync(savePatchArgs(line("c-1", { description: "Renamed" }))); });
    expect(t.invalidated().some((k) => k[0] === "cost-book")).toBe(true);
    expect(t.book()).toBe(BOOK);
  });

  it("UT-CAPEXHOOK-012 a save the patch declines (fractional amount) keeps the reload", async () => {
    repo.saveCostLine.mockImplementationOnce(async (args: unknown) => {
      (args as { onWritten: (w: PanelSaveWritten) => void }).onWritten(written({ updated: [{ id: "c-1-k1", cost: 7.25, resetPaid: false }] }));
      return "c-1";
    });
    const t = setup();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    await act(async () => { await t.hook.result.current.saveLine.mutateAsync(savePatchArgs(line("c-1"))); });
    expect(t.invalidated().some((k) => k[0] === "cost-book")).toBe(true);
    expect(t.book()).toBe(BOOK);
  });

  it("UT-CAPEXHOOK-013 a FAILED save still reloads the whole tab (part of it may have landed), unpatched", async () => {
    repo.saveCostLine.mockImplementationOnce(async () => { throw new Error("refused"); });
    const t = setup();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    await act(async () => { await t.hook.result.current.saveLine.mutateAsync(savePatchArgs(line("c-1"))).catch(() => undefined); });
    await vi.waitFor(() => expect(t.invalidated().some((k) => k[0] === "cost-book")).toBe(true));
    expect(t.book()).toBe(BOOK);
  });
});

describe("a panel delete", () => {
  it("UT-CAPEXHOOK-020 removes the line from the cached book; the book is not reloaded, comments, totals and DevCo are refreshed as before", async () => {
    const t = setup();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    await act(async () => { await t.hook.result.current.deleteLine.mutateAsync(BOOK.lines[0] as CostLine); });
    expect(t.book()?.lines.map((l) => l.id)).toEqual(["c-2"]);
    expect(t.invalidated().some((k) => k[0] === "cost-book")).toBe(false);
    expect(t.invalidated().some((k) => k[0] === "capex-comments")).toBe(true);
    expect(t.invalidated().some((k) => k[0] === "capex-totals")).toBe(true);
  });

  it("UT-CAPEXHOOK-021 with CAPEX_PATCH_BOOK off the delete reloads the book", async () => {
    setCapexOptFlags({ CAPEX_PATCH_BOOK: false });
    const t = setup();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    await act(async () => { await t.hook.result.current.deleteLine.mutateAsync(BOOK.lines[0] as CostLine); });
    expect(t.invalidated().some((k) => k[0] === "cost-book")).toBe(true);
    expect(t.book()).toBe(BOOK);
  });
});
