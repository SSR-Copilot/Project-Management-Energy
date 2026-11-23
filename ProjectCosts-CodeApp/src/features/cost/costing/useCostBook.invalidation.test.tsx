// @vitest-environment jsdom
/**
 * UT-CAPEXINV-OPT-1xx — what the real hooks invalidate after each CAPEX write and comment write (B2, OPT-12), and the
 * comments key (OPT-25). The pure key lists are in `capexInvalidation.test.ts`; these prove the hooks use them.
 */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { CostLine } from "./model";

const repo = {
  setCostPaid: vi.fn(async () => undefined),
  deleteCostLine: vi.fn(async () => undefined),
  saveCostLine: vi.fn(async () => "l1"),
};
vi.mock("@/data/costRepository", () => ({ costRepository: () => repo }));
vi.mock("@/app/SessionContext", () => ({ useSession: () => ({ projectId: "p-1", project: null }) }));
const comments = vi.hoisted(() => ({ saveComment: vi.fn(async () => "c1"), deleteComment: vi.fn(async () => undefined), loadComments: vi.fn(async () => []) }));
vi.mock("@/data/comments", () => comments);

const { useCapexWrites, useCommentWrites, useCapexComments } = await import("./useCostBook");

const LINE = { id: "l1", payments: [] } as unknown as CostLine;

function setup<T>(render: () => T) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(render, { wrapper });
  const keys = () => invalidate.mock.calls.map(([f]) => JSON.stringify((f as { queryKey: unknown[] }).queryKey));
  return { client, hook, keys };
}

const BOOK = JSON.stringify(["cost-book", "p-1", 1]);
const TOTALS = JSON.stringify(["capex-totals", "p-1"]);
const DEVCO_CONTRACTS = JSON.stringify(["devCoCapexContracts", "p-1"]);
const DEVCO_COSTS = JSON.stringify(["devCoCapexCosts", "p-1"]);
const COMMENTS = JSON.stringify(["capex-comments"]);

describe("useCapexWrites — each write refreshes what it wrote (OPT-12)", () => {
  it("UT-CAPEXINV-OPT-101 marking a month paid invalidates the cost book only", async () => {
    const { hook, keys } = setup(() => useCapexWrites(1));
    await act(async () => { await hook.result.current.setPaid.mutateAsync({ lineId: "l1", year: 2027, month: 1, paid: true, costId: "k1" }); });
    expect(keys()).toEqual([BOOK]);
  });

  it("UT-CAPEXINV-OPT-102 a panel save that deletes no month leaves the comments alone", async () => {
    const { hook, keys } = setup(() => useCapexWrites(1));
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    await act(async () => {
      await hook.result.current.saveLine.mutateAsync({
        line: LINE, accountId: "a", isNew: false, payments: [{ id: "k1", year: 2027, month: 1, amount: 5 }],
      });
    });
    expect(keys()).toEqual([BOOK, TOTALS, DEVCO_CONTRACTS, DEVCO_COSTS]);
  });

  it("UT-CAPEXINV-OPT-103 a panel save that clears a stored month also refreshes the comments", async () => {
    const { hook, keys } = setup(() => useCapexWrites(1));
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    await act(async () => {
      await hook.result.current.saveLine.mutateAsync({
        line: LINE, accountId: "a", isNew: false, payments: [{ id: "k1", year: 2027, month: 1, amount: null }],
      });
    });
    expect(keys()).toEqual([BOOK, TOTALS, DEVCO_CONTRACTS, DEVCO_COSTS, COMMENTS]);
  });

  it("UT-CAPEXINV-OPT-104 deleting a line refreshes all five (its comments are deleted with it); a failed save also refreshes all five", async () => {
    const del = setup(() => useCapexWrites(1));
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    await act(async () => { await del.hook.result.current.deleteLine.mutateAsync(LINE); });
    expect(del.keys()).toEqual([BOOK, TOTALS, DEVCO_CONTRACTS, DEVCO_COSTS, COMMENTS]);

    const failed = setup(() => useCapexWrites(1));
    repo.saveCostLine.mockRejectedValueOnce(new Error("refused"));
    await act(async () => {
      await failed.hook.result.current.saveLine.mutateAsync({ line: LINE, accountId: "a", isNew: false, payments: [] }).catch(() => undefined);
    });
    await waitFor(() => expect(failed.keys()).toEqual([BOOK, TOTALS, DEVCO_CONTRACTS, DEVCO_COSTS, COMMENTS]));
  });
});

describe("useCommentWrites — a comment save refreshes the comments only (OPT-12)", () => {
  it("UT-CAPEXINV-OPT-105 invalidate() touches [\"capex-comments\"] and never the cost book", () => {
    const { hook, keys } = setup(() => useCommentWrites());
    act(() => { hook.result.current.invalidate(); });
    expect(keys()).toEqual([COMMENTS]);
  });
});

describe("useCapexComments — the key (OPT-25)", () => {
  it("UT-CAPEXINV-OPT-106 the query key is the sorted joined ids, and one array gives one key computation across renders", async () => {
    const ids = ["c", "a", "b"];
    const { client, hook } = setup(() => useCapexComments(ids));
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(client.getQueryCache().find({ queryKey: ["capex-comments", "a,b,c"] })).toBeDefined();
    hook.rerender();
    expect(comments.loadComments).toHaveBeenCalledTimes(1);
    // An empty list stays disabled, as before.
    const empty = setup(() => useCapexComments([]));
    expect(empty.hook.result.current.fetchStatus).toBe("idle");
  });
});
