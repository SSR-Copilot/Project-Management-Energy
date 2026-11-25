// @vitest-environment jsdom
/**
 * `useBanks` with no rows answers the same empty list on every render, so the memoized `FinanceCards` (FE-P2-01, D162) is
 * not re-rendered by a Screen render while the Fabric bank read is loading, failed or not connected.
 */
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";

const listBanks = vi.fn();
vi.mock("@/data/finance", () => ({
  countActiveTurbines: vi.fn(), findFinancingInputsByKey: vi.fn(), listBanks: () => listBanks(),
  listDebtAssumptions: vi.fn(), listFinancingCategories: vi.fn(), listFinancingInputsRaw: vi.fn(),
  listKfwTranches: vi.fn(), listRepaymentAmounts: vi.fn(), listStepUpMargins: vi.fn(), loadFinanceProject: vi.fn(),
  loadTotalDevexCapex: vi.fn(), withCategoryOrder: vi.fn(),
}));

import { useBanks } from "./hooks";

const wrap = (qc: QueryClient) => ({ children }: { children: ReactNode }) =>
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

describe("UT-FIN-FE useBanks (D162 B4)", () => {
  it("UT-FIN-FE-005 with no rows (a failed Fabric read) the empty bank list keeps its identity across renders", async () => {
    listBanks.mockRejectedValue(new Error("HTTP 403"));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, rerender } = renderHook(() => useBanks(), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    const first = result.current.data;
    rerender();
    expect(first).toEqual([]);
    expect(result.current.data).toBe(first);
  });
});
