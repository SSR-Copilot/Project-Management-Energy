// @vitest-environment jsdom
/**
 * UT-COSTHOOK-OPT-001..004 — the cost-book hooks' read wiring after B2: the OPEX catalogue reads the accounts once (OPT-06), the
 * OPEX book asks for its scope (OPT-04), and a linked contract's Project States come from the shared D159 cache entry (OPT-07d).
 */
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const repo = {
  getCostBook: vi.fn(async (..._args: unknown[]) => ({ accounts: [], lines: [], periods: [], extraGroups: { om: [], land: [], other: [] } })),
  listOpexAccounts: vi.fn(async () => [{ id: "acct", name: "Operation & Maintenance", order: 1 }]),
  listOpexSubaccounts: vi.fn(async (accounts?: unknown) => {
    const list = (await accounts) as { id: string; name: string }[] | undefined;
    return [{ id: "sub", name: "O&M", order: 1, accountId: "acct", accountName: list?.[0]?.name ?? null, isFolded: true }];
  }),
};
vi.mock("@/data/costRepository", () => ({ costRepository: () => repo }));
vi.mock("@/app/SessionContext", () => ({ useSession: () => ({ projectId: "p-1", project: null }) }));

const { useOpexCatalog, useCostBook } = await import("./useCostBook");
const { projectStatesQueryOptions } = await import("@/data/projectStates");

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}

describe("useOpexCatalog (OPT-06)", () => {
  it("UT-COSTHOOK-OPT-001 the accounts table is read ONCE and the sub-accounts get the account names from that read", async () => {
    repo.listOpexAccounts.mockClear();
    repo.listOpexSubaccounts.mockClear();
    const { wrapper } = setup();
    const hook = renderHook(() => useOpexCatalog(), { wrapper });
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    expect(repo.listOpexAccounts).toHaveBeenCalledTimes(1);
    expect(repo.listOpexSubaccounts).toHaveBeenCalledTimes(1);
    expect(hook.result.current.accounts).toHaveLength(1);
    expect(hook.result.current.subaccounts[0]?.accountName).toBe("Operation & Maintenance");
  });
});

describe("useCostBook (OPT-04, OPT-07d)", () => {
  it("UT-COSTHOOK-OPT-002 the OPEX scope reaches the repository; a CAPEX tab passes none", async () => {
    repo.getCostBook.mockClear();
    const { wrapper } = setup();
    const opex = renderHook(() => useCostBook(undefined, { scope: "opex" }), { wrapper });
    await waitFor(() => expect(opex.result.current.isSuccess).toBe(true));
    expect(repo.getCostBook.mock.calls[0]!.slice(0, 2)).toEqual(["p-1", undefined]);
    expect(repo.getCostBook.mock.calls[0]![2]).toMatchObject({ scope: "opex" });
    const capex = renderHook(() => useCostBook(2), { wrapper });
    await waitFor(() => expect(capex.result.current.isSuccess).toBe(true));
    expect(repo.getCostBook.mock.calls[1]!.slice(0, 2)).toEqual(["p-1", 2]);
    expect(repo.getCostBook.mock.calls[1]![2]).not.toHaveProperty("scope");
  });

  it("UT-COSTHOOK-OPT-003 the Project States loader it passes reads the shared D159 cache entry: active states in Order, no request when warm", async () => {
    repo.getCostBook.mockClear();
    const { client, wrapper } = setup();
    // The shared entry as `listProjectStates` returns it (every state, inactive too), already in the cache.
    client.setQueryData(projectStatesQueryOptions().queryKey, [
      { id: "s0", name: "Draft", order: 0, isVisibleOnChecklist: true, clusterDescription: null, active: true, orderRaw: null, businessUnitId: null },
      { id: "s2", name: "Cluster 2", order: 2, isVisibleOnChecklist: true, clusterDescription: null, active: true, orderRaw: 2, businessUnitId: null },
      { id: "sx", name: "Retired", order: 3, isVisibleOnChecklist: true, clusterDescription: null, active: false, orderRaw: 3, businessUnitId: null },
    ]);
    const hook = renderHook(() => useCostBook(1), { wrapper });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    const options = repo.getCostBook.mock.calls[0]![2] as { loadStates: () => Promise<unknown> };
    // Exactly what `loadProjectStates` returned for the Cost view: ACTIVE rows, `Order` ascending, a missing Order read as 0.
    expect(await options.loadStates()).toEqual([
      { id: "s0", name: "Draft", order: 0 },
      { id: "s2", name: "Cluster 2", order: 2 },
    ]);
  });
});
