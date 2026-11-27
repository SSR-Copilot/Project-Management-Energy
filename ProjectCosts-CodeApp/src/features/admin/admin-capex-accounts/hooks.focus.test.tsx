// @vitest-environment jsdom
/**
 * UT-ADCAPEX-FOCUS-001..003 (SAD-06, T-C04): the advisory per-subaccount "has contracts" checks do not re-run when the browser tab
 * becomes visible again (`ADMIN_HAS_CONTRACTS_NO_FOCUS`); they still read on mount. Switch off = the global focus refetch.
 */
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { ADMIN_OPT } from "@/data/adminFlags";

const reads = vi.hoisted(() => ({ hasContractsPooled: vi.fn(async (_id: string) => false) }));
vi.mock("@/data/adminCapexAccounts", () => ({
  ACCOUNTS_TABLE: "vsb_capexaccountlists",
  hasContractsPooled: reads.hasContractsPooled,
  loadCapexAccountRows: vi.fn(async () => []),
}));
vi.mock("@/platform/privileges", () => ({ useTablePrivileges: () => ({}) }));

const { useHasContracts } = await import("./hooks");

const wrap = (client: QueryClient) => ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const IDS = ["a1", "a2", "a3"];

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); reads.hasContractsPooled.mockClear(); });
afterEach(() => { vi.useRealTimers(); ADMIN_OPT.ADMIN_HAS_CONTRACTS_NO_FOCUS = true; focusManager.setFocused(undefined); });

async function returnToTab() {
  await act(async () => { focusManager.setFocused(false); focusManager.setFocused(true); });
}

describe("useHasContracts and the tab focus", () => {
  it("UT-ADCAPEX-FOCUS-001 a visibility return after the 30 s stale time does not start the checks again", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useHasContracts(IDS), { wrapper: wrap(client) });
    await waitFor(() => expect(result.current.checks.size).toBe(3));
    expect(reads.hasContractsPooled).toHaveBeenCalledTimes(3);
    vi.setSystemTime(Date.now() + 5 * 60 * 1000); // every check is stale now
    await returnToTab();
    expect(reads.hasContractsPooled).toHaveBeenCalledTimes(3);
  });

  it("UT-ADCAPEX-FOCUS-002 a mount still reads: each id once, and a later mount of stale checks reads again", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const first = renderHook(() => useHasContracts(IDS), { wrapper: wrap(client) });
    await waitFor(() => expect(first.result.current.checks.size).toBe(3));
    expect(reads.hasContractsPooled.mock.calls.map((c) => c[0]).sort()).toEqual(IDS);
    first.unmount();
    vi.setSystemTime(Date.now() + 5 * 60 * 1000);
    const second = renderHook(() => useHasContracts(IDS), { wrapper: wrap(client) });
    await waitFor(() => expect(reads.hasContractsPooled).toHaveBeenCalledTimes(6));
    expect(second.result.current.checks.size).toBe(3);
  });

  it("UT-ADCAPEX-FOCUS-003 with the switch off the global focus refetch applies again (the old behaviour: the checks re-run on return)", async () => {
    ADMIN_OPT.ADMIN_HAS_CONTRACTS_NO_FOCUS = false;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useHasContracts(IDS), { wrapper: wrap(client) });
    await waitFor(() => expect(result.current.checks.size).toBe(3));
    vi.setSystemTime(Date.now() + 5 * 60 * 1000);
    await returnToTab();
    await waitFor(() => expect(reads.hasContractsPooled).toHaveBeenCalledTimes(6));
  });
});
