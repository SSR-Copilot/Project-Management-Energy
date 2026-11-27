// @vitest-environment jsdom
/**
 * UT-BOOT-COST-0xx — T-C01 (SCC-01, `BOOT_PREFETCH_COST_READS`): the boot prefetch of a Cost screen's own reads, against the REAL hooks.
 *
 * The prefetchers and the screens' hooks share one definition per read (`features/cost/costing/costQueries.ts`). This is the drift
 * check, in the pattern of `pmScreenPrefetch.screens.test.tsx`: fill a client with the prefetch, mount the screen's own hooks on it,
 * and fail if a hook asks the data layer again. When a key, a function or a freshness changes in one place but not the other, the
 * test fails here, not as a silent wasted request.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const s = vi.hoisted(() => ({ calls: [] as string[], fail: false }));
const note = (name: string) => { s.calls.push(name); };
const count = (name: string) => s.calls.filter((c) => c === name).length;

const EMPTY_BOOK = { accounts: [], lines: [], periods: [], extraGroups: { om: [], land: [], other: [] } };
const read = <T,>(name: string, value: T) => vi.fn(async (..._args: unknown[]): Promise<T> => {
  note(name);
  if (s.fail) throw new Error("boom");
  return value;
});
const repo = {
  getCostBook: vi.fn(async (_p: string, category: number | undefined, options?: { onContracts?: (ids: string[]) => void }) => {
    note(`book:${category}`);
    if (s.fail) throw new Error("boom");
    options?.onContracts?.(["c-b", "c-a"]);
    return EMPTY_BOOK;
  }),
  getCapexTotals: read("totals", []),
  listCurrencies: read("currencies", []),
  getLeaseBook: read("lease.book", { subaccounts: [], periods: [] }),
  getLeaseGenerators: read("lease.generators", []),
  getCountryInflation: read("inflation", []),
  getLeaseAssumptions: read("lease.assumptions", []),
  listOpexAccounts: read("opex.accounts", []),
  listOpexSubaccounts: read("opex.subaccounts", []),
  listOpexDeviceTypes: read("opex.deviceTypes", []),
  listCapexAccounts: read("contracts.accounts", []),
  listDevCoCapexContracts: read("contracts.devCoContracts", []),
  listCapexCostRows: vi.fn(async (_p: string, contracts: Promise<unknown>) => { await contracts; note("contracts.devCoCosts"); return []; }),
  loadAddCostSheet: vi.fn(async (_p: string, category: number) => {
    note(`sheet:${category}`);
    return { accounts: [], subaccounts: [], contracts: [], costs: [], payerDefaults: new Map() };
  }),
  listContracts: read("contracts.rows", []),
  listPaymentTargets: read("contracts.targets", []),
  listDevCoLinks: read("contracts.links", []),
};
vi.mock("@/data/costRepository", () => ({ costRepository: () => repo }));
vi.mock("@/data/costBook", async (original) => ({
  ...(await original<typeof import("@/data/costBook")>()),
  loadCapexCategories: vi.fn(async () => { note("categories"); return []; }),
}));
vi.mock("@/data/comments", () => ({
  loadComments: vi.fn(async () => { note("comments"); return []; }), deleteComment: vi.fn(), saveComment: vi.fn(),
}));
vi.mock("@/data/project", async (original) => ({
  ...(await original<typeof import("@/data/project")>()),
  loadProject: vi.fn(async () => { note("session.project"); return { countryId: "c-1", technology: 1 }; }),
}));
vi.mock("@/app/SessionContext", async (original) => ({
  ...(await original<typeof import("@/app/SessionContext")>()),
  useSession: () => ({ projectId: "p-1", project: null }),
}));

import { prefetchCostScreenReads } from "./costScreenPrefetch";
import {
  useAddCostSheet, useCapexCategories, useCapexTotals, useCostBook, useCountryInflation, useCurrencies,
  useLeaseAssumptions, useLeaseBook, useLeaseGenerators, useOpexCatalog,
} from "@/features/cost/costing/useCostBook";
import { useCapexAccounts, useCapexCostRows, useDevCoCapexContracts } from "@/features/cost/contracts/hooks";
import { capexCommentsKey } from "@/features/cost/costing/costQueries";
import { COST_READS_RETRY } from "@/data/leaseOpexFlags";

const PID = "p-1";
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
const wrap = (qc: QueryClient) => ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const tick = (ms = 40) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

beforeEach(() => { s.calls.length = 0; s.fail = false; });
afterEach(() => { cleanup(); });

describe("CAPEX boot prefetch", () => {
  it("UT-BOOT-COST-001 a Summary landing: the tab strip, the Summary book and the totals are in the cache; the real hooks send no request", async () => {
    const qc = client();
    await prefetchCostScreenReads(qc, "/costs/capex", PID, { mode: "boot" });
    const once = ["categories", "book:-1", "totals"];
    expect(once.map(count)).toEqual([1, 1, 1]);
    renderHook(() => ({ tabs: useCapexCategories(), book: useCostBook(-1), totals: useCapexTotals(true) }), { wrapper: wrap(qc) });
    await tick();
    expect(once.map(count)).toEqual([1, 1, 1]);
  });

  it("UT-BOOT-COST-002 a category landing (?category=2): the tab strip and that category's book, with its comment threads, are in the cache", async () => {
    const qc = client();
    await prefetchCostScreenReads(qc, "/costs/capex", PID, { mode: "boot", category: 2 });
    // No Summary reads for a category tab: `useCapexTotals(false)` is disabled there.
    expect(["categories", "book:2", "comments", "totals", "book:-1"].map(count)).toEqual([1, 1, 1, 0, 0]);
    expect(qc.getQueryData(["capex-comments", capexCommentsKey(["c-a", "c-b"])])).toEqual([]);
    renderHook(() => ({ tabs: useCapexCategories(), book: useCostBook(2), totals: useCapexTotals(false) }), { wrapper: wrap(qc) });
    await tick();
    expect(["categories", "book:2", "comments", "totals"].map(count)).toEqual([1, 1, 1, 0]);
  });

  it("UT-BOOT-COST-003 the prefetched key is the screen's own (the same key, not a look-alike)", async () => {
    const qc = client();
    await prefetchCostScreenReads(qc, "/costs/capex", PID, { mode: "boot", category: 1 });
    await prefetchCostScreenReads(qc, "/costs/capex", PID, { mode: "boot" });
    expect(qc.getQueryData(["cost-book", PID, 1])).toEqual(EMPTY_BOOK);
    expect(qc.getQueryData(["cost-book", PID, -1])).toEqual(EMPTY_BOOK);
    expect(qc.getQueryData(["capex-totals", PID])).toEqual([]);
    expect(qc.getQueryData(["capex-categories"])).toEqual([]);
  });
});

describe("Contracts, OPEX, Land Lease and Add Cost boot prefetch", () => {
  it("UT-BOOT-COST-010 Contracts: only the reads that honour their stale time (accounts, DevCo contracts and cost rows); the rows, targets and links are the visit's own", async () => {
    const qc = client();
    await prefetchCostScreenReads(qc, "/costs/contracts", PID, { mode: "boot" });
    expect(["contracts.accounts", "contracts.devCoContracts", "contracts.devCoCosts"].map(count)).toEqual([1, 1, 1]);
    // `refetchOnMount: "always"` keys (CONTR-010): never prefetched (rule P3).
    expect(["contracts.rows", "contracts.targets", "contracts.links"].map(count)).toEqual([0, 0, 0]);
    renderHook(() => ({ a: useCapexAccounts(), d: useDevCoCapexContracts(PID), c: useCapexCostRows(PID) }), { wrapper: wrap(qc) });
    await tick();
    expect(["contracts.accounts", "contracts.devCoContracts", "contracts.devCoCosts"].map(count)).toEqual([1, 1, 1]);
  });

  it("UT-BOOT-COST-011 OPEX: the catalogue and the country's inflation (once the project is known); the book and the device types are not prefetched", async () => {
    const qc = client();
    await prefetchCostScreenReads(qc, "/costs/opex/om", PID, { mode: "boot" });
    expect(["opex.accounts", "opex.subaccounts", "inflation", "session.project"].map(count)).toEqual([1, 1, 1, 1]);
    expect(["book:undefined", "opex.deviceTypes"].map(count)).toEqual([0, 0]);
    renderHook(() => ({ catalog: useOpexCatalog(), inflation: useCountryInflation("c-1") }), { wrapper: wrap(qc) });
    await tick();
    expect(["opex.accounts", "opex.subaccounts", "inflation"].map(count)).toEqual([1, 1, 1]);
  });

  it("UT-BOOT-COST-012 Land Lease: the book, the generators, the currencies and, once the project is known, the inflation and the assumptions", async () => {
    const qc = client();
    await prefetchCostScreenReads(qc, "/costs/land-lease", PID, { mode: "boot" });
    const once = ["lease.book", "lease.generators", "currencies", "inflation", "lease.assumptions"];
    expect(once.map(count)).toEqual([1, 1, 1, 1, 1]);
    renderHook(() => ({
      b: useLeaseBook(PID), g: useLeaseGenerators(PID), c: useCurrencies(), i: useCountryInflation("c-1"), a: useLeaseAssumptions("c-1", 1),
    }), { wrapper: wrap(qc) });
    await tick();
    expect(once.map(count)).toEqual([1, 1, 1, 1, 1]);
  });

  it("UT-BOOT-COST-013 Add Cost from Table: the CAPEX reads and the category's sheet; the Summary (no category) reads no sheet", async () => {
    const qc = client();
    await prefetchCostScreenReads(qc, "/costs/add-from-table", PID, { mode: "boot", category: 1 });
    expect(["categories", "book:1", "sheet:1"].map(count)).toEqual([1, 1, 1]);
    renderHook(() => ({ sheet: useAddCostSheet(1), book: useCostBook(1), tabs: useCapexCategories() }), { wrapper: wrap(qc) });
    await tick();
    expect(["categories", "book:1", "sheet:1"].map(count)).toEqual([1, 1, 1]);

    s.calls.length = 0;
    await prefetchCostScreenReads(client(), "/costs/add-from-table", PID, { mode: "boot" });
    expect(s.calls.filter((c) => c.startsWith("sheet:"))).toEqual([]);
    // The panel resolves its category without the tab strip (0..4): a category beyond it is the Summary there, so no sheet.
    s.calls.length = 0;
    await prefetchCostScreenReads(client(), "/costs/add-from-table", PID, { mode: "boot", category: 7 });
    expect(s.calls.filter((c) => c.startsWith("sheet:"))).toEqual([]);
  });
});

describe("what the prefetch must never change", () => {
  it("UT-BOOT-COST-020 a failed read never throws; the screen's own read then runs and the failure does not stick", async () => {
    s.fail = true;
    const qc = client();
    await expect(prefetchCostScreenReads(qc, "/costs/capex", PID, { mode: "boot", category: 99 })).resolves.toBeUndefined();
    expect(qc.getQueryData(["cost-book", PID, 99])).toBeUndefined();
    s.fail = false;
    s.calls.length = 0;
    const { result } = renderHook(() => useCostBook(99), { wrapper: wrap(qc) });
    await tick();
    expect(count("book:99")).toBe(1);
    expect(result.current.data).toEqual(EMPTY_BOOK);
    // The default read retries like the screen's own would (`COST_READS_RETRY`, rule: the prefetch uses the screen's retry option).
    expect(COST_READS_RETRY).toBe(true);
  });

  it("UT-BOOT-COST-021 an in-app (intent) prefetch never starts a project load: the reads that need the country are skipped, the rest start", async () => {
    const qc = client();
    await prefetchCostScreenReads(qc, "/costs/land-lease", PID, { mode: "intent" });
    expect(count("session.project")).toBe(0);
    expect(["lease.book", "lease.generators", "currencies"].map(count)).toEqual([1, 1, 1]);
    expect(["inflation", "lease.assumptions"].map(count)).toEqual([0, 0]);
  });

  it("UT-BOOT-COST-022 a prefetch writes nothing: no write method of the repository exists in the calls it made", async () => {
    const qc = client();
    for (const path of ["/costs/capex", "/costs/contracts", "/costs/opex/om", "/costs/opex/other", "/costs/land-lease", "/costs/add-from-table"] as const) {
      await prefetchCostScreenReads(qc, path, PID, { mode: "boot", category: 1 });
    }
    expect(s.calls.filter((c) => /save|write|delete|create|update/i.test(c))).toEqual([]);
  });
});
