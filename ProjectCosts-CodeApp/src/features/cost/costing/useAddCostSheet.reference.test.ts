/**
 * UT-ACSHEET-REF-001..002 (T-C04, NET-08): the reference tier of the query cache (`data/queryPolicy.ts`) does not change how Add
 * Cost from Table patches and re-reads the cost book (D51 §11.19). The book of a category whose screen is unmounted is patched
 * with what the Save applied and re-read at once (`refetchType: "all"`); a reference list with `gcTime = staleTime` sitting in the same
 * cache is neither patched, invalidated nor re-read by the Save, and the book itself keeps the global defaults.
 */
import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { REFERENCE } from "@/data/queryPolicy";

const MIN = 60 * 1000;
// The browser default gc (5 minutes), set explicitly because under Node TanStack's default is Infinity.
const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 5 * MIN } } });

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const real = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...real, useQueryClient: () => client, useMutation: (options: unknown) => options, useQuery: (options: unknown) => options };
});
vi.mock("@/app/SessionContext", () => ({ useSession: () => ({ projectId: "p-1", project: null }) }));
vi.mock("@/components/useNotify", () => ({
  useNotify: () => ({ success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), dismissAll: vi.fn() }),
}));
vi.mock("@/data/costRepository", () => ({ costRepository: () => ({}) }));

const { useSaveAddCostSheet } = await import("./useCostBook");

type Book = { accounts: unknown[]; lines: { id: string; payments: unknown[]; totalCost: number }[]; periods: unknown[]; extraGroups: unknown };
const bookWith = (...ids: string[]): Book => ({
  accounts: [], lines: ids.map((id) => ({ id, payments: [], totalCost: 0 })), periods: [], extraGroups: { om: [], land: [], other: [] },
});

describe("Add Cost from Table patching with a reference list in the cache", () => {
  it("UT-ACSHEET-REF-001 an UNMOUNTED book is patched at once and re-read, and the reference list is left alone", async () => {
    const bookKey = ["cost-book", "p-1", 3];
    const refKey = ["admin-countries"];
    // The first read is the one the screen made before it unmounted; the next is the confirming read after the Save.
    const bookFn = vi.fn(async () => bookWith("k1", "k2"));
    const refFn = vi.fn(async () => ["DE", "NL"]);
    // Both screens were visited and left: no observer on either entry.
    await client.fetchQuery({ queryKey: bookKey, queryFn: bookFn });
    await client.fetchQuery({ queryKey: refKey, queryFn: refFn, ...REFERENCE });
    bookFn.mockClear();
    bookFn.mockImplementation(async () => bookWith("k2"));
    refFn.mockClear();

    const options = useSaveAddCostSheet(3) as unknown as { onSuccess: (r: unknown) => unknown };
    options.onSuccess({ applied: { contracts: [], costs: [], deletedContractIds: ["k1"], deletedCostIds: [] } });

    // 1. patched synchronously, before any network answer
    expect((client.getQueryData(bookKey) as Book).lines.map((l) => l.id)).toEqual(["k2"]);
    // 2. the confirming read starts now although nothing observes the key
    await vi.waitFor(() => expect(bookFn).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(client.getQueryState(bookKey)?.fetchStatus).toBe("idle"));
    // 3. the reference list: not touched
    expect(refFn).not.toHaveBeenCalled();
    expect(client.getQueryState(refKey)?.isInvalidated).toBe(false);
    expect(client.getQueryData(refKey)).toEqual(["DE", "NL"]);
  });

  it("UT-ACSHEET-REF-002 the book's own cache options are the global ones: a book left unobserved is dropped at 5 minutes, a reference list is not", async () => {
    vi.useFakeTimers();
    try {
      const gcClient = new QueryClient({ defaultOptions: { queries: { gcTime: 5 * MIN } } });
      gcClient.setQueryData(["cost-book", "p-2", 0], bookWith("k1"));
      await gcClient.fetchQuery({ queryKey: ["admin-countries"], queryFn: async () => ["DE"], ...REFERENCE });
      // a query created by `setQueryData` has no observers, so its gc clock runs from creation
      await vi.advanceTimersByTimeAsync(6 * MIN);
      expect(gcClient.getQueryData(["cost-book", "p-2", 0])).toBeUndefined();
      expect(gcClient.getQueryData(["admin-countries"])).toEqual(["DE"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
