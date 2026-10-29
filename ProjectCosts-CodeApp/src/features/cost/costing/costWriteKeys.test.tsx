// @vitest-environment jsdom
/**
 * CA-15 — every Cost write hook tags its mutation with the project's Cost write key, so
 * `useCostWriteInFlight` sees it from any screen. A write hook without the key would be invisible
 * to the guard of a screen re-opened while it runs, which is the defect itself.
 */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { costWriteKey, type CostWriteFamily } from "@/domain/writeGuard";

const never = () => new Promise<never>(() => undefined);
vi.mock("@/data/costRepository", () => ({
  costRepository: () => ({
    applyLeaseWrites: vi.fn(never), addStandardContract: vi.fn(never), saveAddCostSheet: vi.fn(never),
    saveContract: vi.fn(never), deleteContract: vi.fn(never),
    savePaymentTarget: vi.fn(never), deletePaymentTarget: vi.fn(never),
    getCostBook: vi.fn(never),
  }),
}));
vi.mock("@/data/comments", () => ({
  saveComment: vi.fn(never), deleteComment: vi.fn(never), loadComments: vi.fn(never),
}));
vi.mock("@/app/SessionContext", () => ({ useSession: () => ({ projectId: "p-1", project: null }) }));
vi.mock("@/components/useNotify", () => ({ useNotify: () => ({ error: vi.fn() }) }));

const book = await import("./useCostBook");
const contracts = await import("@/features/cost/contracts/hooks");

/** Starts one mutation from `start` and returns the key it was stored under. */
function keyOf(start: (client: QueryClient) => void): readonly unknown[] | undefined {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  start(client);
  return client.getMutationCache().getAll()[0]?.options.mutationKey;
}

function run<T>(hook: () => T, fire: (value: T) => void) {
  return (client: QueryClient) => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(hook, { wrapper });
    act(() => { fire(result.current); });
  };
}

const cases: [string, string, CostWriteFamily, (client: QueryClient) => void][] = [
  ["UT-COSTFLIGHT-008", "useCostBook().save", "periods", run(() => book.useCostBook(), (h) => h.save.mutate({} as never))],
  ["UT-COSTFLIGHT-009", "useAddStandardContract", "periods", run(() => book.useAddStandardContract(), (h) => h.mutate({} as never))],
  ["UT-COSTFLIGHT-010", "useLeaseWrites", "land-lease", run(() => book.useLeaseWrites("p-1"), (h) => h.mutate([]))],
  ["UT-COSTFLIGHT-011", "useSaveAddCostSheet", "add-cost-sheet", run(() => book.useSaveAddCostSheet(0), (h) => h.mutate({} as never))],
  ["UT-COSTFLIGHT-012", "useCommentWrites().save", "capex-comments", run(() => book.useCommentWrites(), (h) => h.save.mutate({} as never))],
  ["UT-COSTFLIGHT-013", "useCommentWrites().remove", "capex-comments", run(() => book.useCommentWrites(), (h) => h.remove.mutate("c"))],
  ["UT-COSTFLIGHT-014", "useSaveContract", "contracts", run(() => contracts.useSaveContract("p-1"), (h) => h.mutate({ write: {}, accounts: [] } as never))],
  ["UT-COSTFLIGHT-015", "useDeleteContract", "contracts", run(() => contracts.useDeleteContract("p-1"), (h) => h.mutate("c"))],
  ["UT-COSTFLIGHT-016", "useSavePaymentTarget", "contracts", run(() => contracts.useSavePaymentTarget("p-1"), (h) => h.mutate({} as never))],
  ["UT-COSTFLIGHT-017", "useDeletePaymentTarget", "contracts", run(() => contracts.useDeletePaymentTarget("p-1"), (h) => h.mutate("t"))],
];

describe("Cost write mutation keys (CA-15)", () => {
  it.each(cases)("%s %s is tagged with the project's Cost write key", (_id, _name, family, start) => {
    expect(keyOf(start)).toEqual(costWriteKey("p-1", family));
  });
});
