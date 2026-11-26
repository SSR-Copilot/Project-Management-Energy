// @vitest-environment jsdom
/**
 * dvopt batch 2 — the Cost read hooks.
 *
 *  - UT-READRETRY-001..008 (T-14, CA-11, `COST_READS_RETRY`): the four main Cost reads retry a transient failure and show a 403 at once.
 *    The client below has the app's own retry rule (`attempt < 2 && isRetryable`, as `Providers.tsx`) and no wait.
 *  - UT-OPEXCAT-001..005 (CB-08, `OPEX_BOOK_REUSES_CATALOGUE`): the OPEX book takes the sub-account names from the cached catalogue.
 *  - UT-LEASELEAN-001..004 (CB-15, `LEASE_LEAN_RELOAD`): a Land Lease write refreshes the Land Lease book only.
 */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DataError, isRetryable } from "@/platform/errors";

async function subaccountsAnswer(accounts?: unknown) {
  const list = (await accounts) as { id: string; name: string }[] | undefined;
  return [{ id: "sub-1", name: "Insurance", order: 1, accountId: "acct", accountName: list?.[0]?.name ?? null, isFolded: true }];
}
const emptyBook = { accounts: [], lines: [], periods: [], extraGroups: { om: [], land: [], other: [] } };
const repo = {
  getCostBook: vi.fn(async (..._args: unknown[]): Promise<unknown> => emptyBook),
  getLeaseBook: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({ subaccounts: [], costs: [], periods: [], allocations: [] })),
  getCapexTotals: vi.fn(async (..._args: unknown[]): Promise<unknown> => []),
  loadAddCostSheet: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({ contracts: [], costs: [] })),
  applyLeaseWrites: vi.fn(async (..._args: unknown[]): Promise<unknown> => ({ createdIds: {} })),
  listOpexAccounts: vi.fn(async () => [{ id: "acct", name: "Operation & Maintenance", order: 1 }]),
  listOpexSubaccounts: vi.fn(subaccountsAnswer),
};
vi.mock("@/data/costRepository", () => ({ costRepository: () => repo }));
vi.mock("@/app/SessionContext", () => ({ useSession: () => ({ projectId: "p-1", project: null }) }));

const flags = vi.hoisted(() => ({ retry: true, catalogue: true, lean: true }));
vi.mock("@/data/leaseOpexFlags", () => ({
  get COST_READS_RETRY() { return flags.retry; },
  get OPEX_BOOK_REUSES_CATALOGUE() { return flags.catalogue; },
  get LEASE_LEAN_RELOAD() { return flags.lean; },
  COST_REFRESH_ON_FAILURE: true,
}));

const { useCostBook, useLeaseBook, useCapexTotals, useAddCostSheet, useLeaseWrites, leaseBookKey } = await import("./useCostBook");

/** The app's own query rule (`Providers.tsx`), with no wait between tries. */
function setup() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: (attempt, error) => attempt < 2 && isRetryable(error), retryDelay: 0, staleTime: 30_000 },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}

const transient = () => new DataError("list project costs", "service unavailable", 503);
const forbidden = () => new DataError("list project costs", "no privilege", 403);

beforeEach(() => {
  flags.retry = true; flags.catalogue = true; flags.lean = true;
  Object.values(repo).forEach((fn) => fn.mockClear());
  repo.getCostBook.mockImplementation(async () => emptyBook);
  repo.getLeaseBook.mockImplementation(async () => ({ subaccounts: [], costs: [], periods: [], allocations: [] }));
  repo.getCapexTotals.mockImplementation(async () => []);
  repo.loadAddCostSheet.mockImplementation(async () => ({ contracts: [], costs: [] }));
  repo.applyLeaseWrites.mockImplementation(async () => ({ createdIds: {} }));
  repo.listOpexSubaccounts.mockImplementation(subaccountsAnswer);
});

/** [hook, the repository method it reads through] for the four reads. */
const READS: [string, () => { isSuccess: boolean; isError: boolean; data?: unknown }, keyof typeof repo][] = [
  ["useCostBook", () => useCostBook(1), "getCostBook"],
  ["useLeaseBook", () => useLeaseBook("p-1"), "getLeaseBook"],
  ["useCapexTotals", () => useCapexTotals(), "getCapexTotals"],
  ["useAddCostSheet", () => useAddCostSheet(1), "loadAddCostSheet"],
];

describe("T-14 the main Cost reads retry a transient failure (CA-11)", () => {
  it.each(READS.map((r, i) => [i + 1, ...r] as const))(
    "UT-READRETRY-00%i %s: one transient 503 then success shows the data, the read ran twice", async (_n, _name, hook, method) => {
      repo[method].mockRejectedValueOnce(transient());
      const { wrapper } = setup();
      const { result } = renderHook(hook, { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.isError).toBe(false);
      expect(repo[method]).toHaveBeenCalledTimes(2);
    });

  it.each(READS.map((r, i) => [i + 5, ...r] as const))(
    "UT-READRETRY-00%i %s: a 403 shows the error at once, the read ran ONCE", async (_n, _name, hook, method) => {
      repo[method].mockRejectedValue(forbidden());
      const { wrapper } = setup();
      const { result } = renderHook(hook, { wrapper });
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(repo[method]).toHaveBeenCalledTimes(1);
    });

  it("UT-READRETRY-009 a persistent 503 gives up after the app's two retries (three reads), and then shows the error", async () => {
    repo.getCostBook.mockRejectedValue(transient());
    const { wrapper } = setup();
    const { result } = renderHook(() => useCostBook(1), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(repo.getCostBook).toHaveBeenCalledTimes(3);
  });

  it("UT-READRETRY-010 the switch off: one transient 503 shows the error at once, the read ran once (the old behaviour)", async () => {
    flags.retry = false;
    repo.getCostBook.mockRejectedValueOnce(transient());
    const { wrapper } = setup();
    const { result } = renderHook(() => useCostBook(1), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(repo.getCostBook).toHaveBeenCalledTimes(1);
  });
});

describe("CB-08 the OPEX book reuses the catalogue's sub-accounts", () => {
  type Opts = { opexSubaccountNames?: () => Promise<{ id: string; name: string }[]> };
  const optionsOfLastCall = (): Opts => repo.getCostBook.mock.calls.at(-1)![2] as Opts;

  it("UT-OPEXCAT-001 the OPEX scope hands the book a loader that reads the catalogue's cached entry: ONE listOpexSubaccounts call however often it is used", async () => {
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useCostBook(undefined, { scope: "opex" }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const load = optionsOfLastCall().opexSubaccountNames!;
    expect(load).toBeTypeOf("function");
    expect(await load()).toEqual([{ id: "sub-1", name: "Insurance" }]);
    expect(await load()).toEqual([{ id: "sub-1", name: "Insurance" }]);
    expect(repo.listOpexSubaccounts).toHaveBeenCalledTimes(1);
    expect(repo.listOpexAccounts).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(["opex-subaccounts"])).toBeDefined();
  });

  it("UT-OPEXCAT-002 a catalogue the screen already holds costs NO request for a reload of the book", async () => {
    const { client, wrapper } = setup();
    client.setQueryData(["opex-subaccounts"], [{ id: "sub-9", name: "Cached", order: 1, accountId: "acct", accountName: "x", isFolded: true }]);
    const { result } = renderHook(() => useCostBook(undefined, { scope: "opex" }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(await optionsOfLastCall().opexSubaccountNames!()).toEqual([{ id: "sub-9", name: "Cached" }]);
    expect(repo.listOpexSubaccounts).not.toHaveBeenCalled();
  });

  it("UT-OPEXCAT-003 the switch off, a CAPEX tab and the unscoped book pass no loader (they read the table themselves, as before)", async () => {
    flags.catalogue = false;
    const { wrapper } = setup();
    const off = renderHook(() => useCostBook(undefined, { scope: "opex" }), { wrapper });
    await waitFor(() => expect(off.result.current.isSuccess).toBe(true));
    expect(optionsOfLastCall()).not.toHaveProperty("opexSubaccountNames");
    flags.catalogue = true;
    const capex = renderHook(() => useCostBook(2), { wrapper });
    await waitFor(() => expect(capex.result.current.isSuccess).toBe(true));
    expect(optionsOfLastCall()).not.toHaveProperty("opexSubaccountNames");
  });

  it("UT-OPEXCAT-004 a failing catalogue read rejects the loader (the book surfaces it where the names are awaited, as its own read did)", async () => {
    repo.listOpexSubaccounts.mockRejectedValue(new DataError("list OPEX subaccounts", "down", 403));
    const { wrapper } = setup();
    const { result } = renderHook(() => useCostBook(undefined, { scope: "opex" }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await expect(optionsOfLastCall().opexSubaccountNames!()).rejects.toThrow();
  });
});

describe("CB-15 a Land Lease write refreshes the Land Lease book only", () => {
  const LEASE = JSON.stringify(leaseBookKey("p-1"));
  const BOOK = JSON.stringify(["cost-book", "p-1", "none"]);
  const keysOf = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map(([f]) => JSON.stringify((f as { queryKey: unknown[] }).queryKey));

  it("UT-LEASELEAN-001 a success refreshes the Land Lease book alone (on)", async () => {
    const { client, wrapper } = setup();
    const spy = vi.spyOn(client, "invalidateQueries");
    const hook = renderHook(() => useLeaseWrites("p-1"), { wrapper });
    await act(async () => { await hook.result.current.mutateAsync([]); });
    expect(keysOf(spy)).toEqual([LEASE]);
  });

  it("UT-LEASELEAN-002 a failure refreshes the Land Lease book alone (on)", async () => {
    repo.applyLeaseWrites.mockRejectedValue(new Error("period create failed"));
    const { client, wrapper } = setup();
    const spy = vi.spyOn(client, "invalidateQueries");
    const hook = renderHook(() => useLeaseWrites("p-1"), { wrapper });
    await act(async () => { await hook.result.current.mutateAsync([]).catch(() => undefined); });
    expect(keysOf(spy)).toEqual([LEASE]);
  });

  it("UT-LEASELEAN-003 the switch off refreshes both books, as before", async () => {
    flags.lean = false;
    const { client, wrapper } = setup();
    const spy = vi.spyOn(client, "invalidateQueries");
    const hook = renderHook(() => useLeaseWrites("p-1"), { wrapper });
    await act(async () => { await hook.result.current.mutateAsync([]); });
    expect(keysOf(spy)).toEqual([LEASE, BOOK]);
  });

  it("UT-LEASELEAN-004 the mutation still resolves only after the Land Lease book has been reloaded (the awaited reload is kept)", async () => {
    const { client, wrapper } = setup();
    const lease = renderHook(() => useLeaseBook("p-1"), { wrapper });
    await waitFor(() => expect(lease.result.current.isSuccess).toBe(true));
    repo.getLeaseBook.mockClear();
    const hook = renderHook(() => useLeaseWrites("p-1"), { wrapper });
    await act(async () => { await hook.result.current.mutateAsync([]); });
    expect(repo.getLeaseBook).toHaveBeenCalledTimes(1);
    expect(client.getQueryState(leaseBookKey("p-1"))?.isInvalidated).toBe(false);
  });
});
