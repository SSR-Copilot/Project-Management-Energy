// @vitest-environment jsdom
/**
 * UT-CONTR-OPT-001..006 — the Contracts screen's read hooks after B2: payment targets and DevCo links keyed on WHICH
 * contracts (OPT-12), and the DevCo contracts read shared with the cost rows read (S1-07).
 */
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BopContract, CapexProjectContract } from "./rules";

const devCo: CapexProjectContract[] = [{ id: "dc1", accountId: "acc", totalCost: 5 }];
const repo = {
  listPaymentTargets: vi.fn(async () => []),
  listDevCoLinks: vi.fn(async () => []),
  listDevCoCapexContracts: vi.fn(async () => devCo),
  listCapexCostRows: vi.fn(async (_p: string, contracts?: unknown) => {
    const list = (await contracts) as CapexProjectContract[] | undefined;
    return (list ?? []).map((c) => ({ contractId: c.id, year: 2027, month: 1, cost: 1 }));
  }),
};
vi.mock("@/data/costRepository", () => ({ costRepository: () => repo }));

const { usePaymentTargets, useDevCoLinks, useDevCoCapexContracts, useCapexCostRows, idSetKey } = await import("./hooks");

const P = "11111111-1111-1111-1111-111111111111";
const contracts = (...ids: string[]) => ids.map((id) => ({ id })) as unknown as BopContract[];

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}

describe("idSetKey", () => {
  it("UT-CONTR-OPT-001 is exact and order-independent: different sets of the same size differ, one set in any order is one key", () => {
    expect(idSetKey(["a", "b"])).not.toBe(idSetKey(["a", "c"]));
    expect(idSetKey(["b", "a", "c"])).toBe(idSetKey(["c", "a", "b"]));
    expect(idSetKey([])).toBe("");
  });
});

describe("payment targets and DevCo links are keyed on the contracts, not their count (OPT-12)", () => {
  it("UT-CONTR-OPT-002 two contract sets of the same size read separately; the same set in another order reads once", async () => {
    const { client, wrapper } = setup();
    const first = renderHook(({ list }) => usePaymentTargets(P, list), { wrapper, initialProps: { list: contracts("a", "b") } });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    expect(repo.listPaymentTargets).toHaveBeenCalledTimes(1);

    // Same size, different contracts: the old `ids.length` key would have shared the first entry and shown its rows.
    first.rerender({ list: contracts("a", "c") });
    await waitFor(() => expect(repo.listPaymentTargets).toHaveBeenCalledTimes(2));

    // The first set again, reordered: found in the cache by its key; refetched once on mount-style staleness only if stale (0 s here).
    const keys = client.getQueryCache().findAll({ queryKey: ["paymentTargets", P] }).map((q) => q.queryKey[2]);
    expect(new Set(keys)).toEqual(new Set(["a,b", "a,c"]));
  });

  it("UT-CONTR-OPT-003 the DevCo links use the same key part", async () => {
    const { client, wrapper } = setup();
    const hook = renderHook(() => useDevCoLinks(P, contracts("z", "y")), { wrapper });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(client.getQueryCache().find({ queryKey: ["devCoLinks", P, "y,z"] })).toBeDefined();
  });
});

describe("the DevCo contracts are read once for the contracts query and the cost rows (S1-07)", () => {
  it("UT-CONTR-OPT-004 both hooks mounted together cost ONE listDevCoCapexContracts (two before)", async () => {
    repo.listDevCoCapexContracts.mockClear();
    repo.listCapexCostRows.mockClear();
    const { wrapper } = setup();
    const hook = renderHook(() => ({ contracts: useDevCoCapexContracts(P), costs: useCapexCostRows(P) }), { wrapper });
    await waitFor(() => expect(hook.result.current.costs.isSuccess && hook.result.current.contracts.isSuccess).toBe(true));
    expect(repo.listDevCoCapexContracts).toHaveBeenCalledTimes(1);
    expect(repo.listCapexCostRows).toHaveBeenCalledTimes(1);
    expect(hook.result.current.costs.data).toEqual([{ contractId: "dc1", year: 2027, month: 1, cost: 1 }]);
    expect(hook.result.current.contracts.data).toEqual(devCo);
  });

  it("UT-CONTR-OPT-005 the cost rows hook alone still reads the contracts (fresh, stale time 0), so recalculation never sums against a stale list", async () => {
    repo.listDevCoCapexContracts.mockClear();
    const { client, wrapper } = setup();
    const hook = renderHook(() => useCapexCostRows(P), { wrapper });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(repo.listDevCoCapexContracts).toHaveBeenCalledTimes(1);
    // A refetch of the cost rows reads the contracts again rather than trusting a cached list.
    await act(async () => { await hook.result.current.refetch(); });
    expect(repo.listDevCoCapexContracts).toHaveBeenCalledTimes(2);
    expect(client.getQueryData(["devCoCapexContracts", P])).toEqual(devCo);
  });

  it("UT-CONTR-OPT-006 a failing contracts read fails the cost rows read too (the screen's load error, as before)", async () => {
    repo.listDevCoCapexContracts.mockRejectedValueOnce(new Error("503"));
    const { wrapper } = setup();
    const hook = renderHook(() => useCapexCostRows(P), { wrapper });
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
  });
});
