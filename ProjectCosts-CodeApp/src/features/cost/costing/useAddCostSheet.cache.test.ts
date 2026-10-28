/**
 * `useSaveAddCostSheet` against a REAL TanStack `QueryClient` (D51 §11.19, review finding 2).
 *
 * TanStack 5 restarts a read in flight on a refetch only when the query already has data. A FIRST
 * load of the DEVEX/CAPEX book that started before the Save resolved would therefore be joined by
 * the post-save refetch, and its pre-save answer would land. The hook cancels it first.
 */
import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const real = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...real,
    useQueryClient: () => client,
    useMutation: (options: unknown) => options,
    useQuery: (options: unknown) => options,
  };
});
vi.mock("@/app/SessionContext", () => ({ useSession: () => ({ projectId: "p-1", project: null }) }));
vi.mock("@/components/useNotify", () => ({
  useNotify: () => ({ success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), dismissAll: vi.fn() }),
}));
vi.mock("@/data/costRepository", () => ({ costRepository: () => ({}) }));

const { useSaveAddCostSheet } = await import("./useCostBook");

type Book = { accounts: unknown[]; lines: { id: string }[]; periods: unknown[]; extraGroups: unknown };
const bookWith = (...ids: string[]): Book => ({
  accounts: [], lines: ids.map((id) => ({ id })), periods: [], extraGroups: { om: [], land: [], other: [] },
});

describe("useSaveAddCostSheet — a first book load in flight at save time", () => {
  it("UT-ACSHEET-CACHE-001 is cancelled and re-read, so the pre-save answer never lands", async () => {
    const key = ["cost-book", "p-1", 3];
    let answerFirst: (b: Book) => void = () => undefined;
    const queryFn = vi.fn()
      // The first load: started BEFORE the save, answers with the pre-save rows.
      .mockImplementationOnce(() => new Promise<Book>((r) => { answerFirst = r; }))
      // The post-save read.
      .mockImplementation(async () => bookWith("saved"));
    const first = client.fetchQuery({ queryKey: key, queryFn }).catch(() => undefined);
    expect(client.getQueryState(key)?.fetchStatus).toBe("fetching");
    expect(client.getQueryData(key)).toBeUndefined();

    const options = useSaveAddCostSheet(3) as unknown as { onSuccess: (r: unknown) => unknown };
    options.onSuccess({ applied: { contracts: [], costs: [], deletedContractIds: [], deletedCostIds: [] } });

    answerFirst(bookWith("pre-save", "doomed"));
    await first;
    await vi.waitFor(() => expect(client.getQueryState(key)?.fetchStatus).toBe("idle"));
    // The pre-save answer was discarded. (A query that never held data and has no observer is not
    // refetched by `invalidateQueries`; the DEVEX/CAPEX screen's mount reads it, below.)
    expect(client.getQueryData(key)).toBeUndefined();
    const mounted = (await client.ensureQueryData({ queryKey: key, queryFn })) as Book;
    expect(mounted.lines.map((l) => l.id)).toEqual(["saved"]);
  });
});
