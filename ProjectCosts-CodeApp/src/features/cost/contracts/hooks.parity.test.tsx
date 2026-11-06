// @vitest-environment jsdom
/**
 * UT-CONTR — the Contracts hooks' Canvas-parity behaviour of test run 3.
 *
 * CONTR-010: the canvas re-reads the contracts on every visit (`OnVisible`).
 * CONTR-027: the payment targets are ordered by `Created On` ascending.
 */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BopContract, PaymentTarget } from "./rules";

const repo = {
  listContracts: vi.fn(),
  listPaymentTargets: vi.fn(),
  listDevCoLinks: vi.fn(),
};
vi.mock("@/data/costRepository", () => ({ costRepository: () => repo }));

import { useContracts, usePaymentTargets } from "./hooks";

const contract = (id: string) => ({ id, description: id, contractType: 1 }) as unknown as BopContract;

function wrapper() {
  // The app's own default: data stays fresh for 30 s (`app/Providers.tsx`).
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  repo.listContracts.mockReset();
  repo.listPaymentTargets.mockReset();
});

describe("Contracts hooks", () => {
  it("UT-CONTR-150 the contracts are read again on every visit, even within the 30 s default (CONTR-010)", async () => {
    repo.listContracts.mockResolvedValue([contract("c-1")]);
    const w = wrapper();
    const first = renderHook(() => useContracts("p-1"), { wrapper: w });
    await waitFor(() => expect(first.result.current.data).toBeDefined());
    first.unmount();
    const second = renderHook(() => useContracts("p-1"), { wrapper: w });
    await waitFor(() => expect(repo.listContracts).toHaveBeenCalledTimes(2));
    expect(second.result.current.data).toBeDefined();
  });

  it("UT-CONTR-151 the payment targets come out in Created On order, not payment-date order (CONTR-027)", async () => {
    const t = (id: string, createdOn: string, paymentDate: string): PaymentTarget =>
      ({ id, contractId: "c-1", createdOn, paymentDate });
    repo.listPaymentTargets.mockResolvedValue([
      t("third", "2026-03-01T00:00:00Z", "01/2027"),
      t("first", "2026-01-01T00:00:00Z", "12/2030"),
      t("second", "2026-02-01T00:00:00Z", "06/2025"),
    ]);
    const { result } = renderHook(() => usePaymentTargets("p-1", [contract("c-1")]), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.byContract.get("c-1")).toBeDefined());
    expect(result.current.byContract.get("c-1")!.map((x) => x.id)).toEqual(["first", "second", "third"]);
  });
});
