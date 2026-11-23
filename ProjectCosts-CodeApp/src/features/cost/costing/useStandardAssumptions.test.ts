/**
 * D159 (audit finding 8): the standard-assumption catalogue is reference data, so returning to the tab does not re-read it.
 */
import { describe, expect, it, vi } from "vitest";

const queries: { queryKey: unknown[]; staleTime?: number; refetchOnWindowFocus?: boolean }[] = [];
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: unknown[]; staleTime?: number; refetchOnWindowFocus?: boolean }) => {
    queries.push(options);
    return { data: undefined, isLoading: false };
  },
  useMutation: (options: unknown) => options,
  useQueryClient: () => ({}),
}));
vi.mock("@/data/costRepository", () => ({ costRepository: () => ({}) }));
vi.mock("@/app/SessionContext", () => ({ useSession: () => ({ projectId: "p-1", project: null }) }));
vi.mock("@/components/useNotify", () => ({ useNotify: () => ({ success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), dismissAll: vi.fn() }) }));

const { useStandardAssumptions } = await import("./useCostBook");

describe("UT-STDASSUME-QUERY the standard assumptions are not re-read on every tab return", () => {
  it("UT-STDASSUME-QUERY-001 the read is fresh for 30 minutes and does not refetch on window focus", () => {
    queries.length = 0;
    useStandardAssumptions(["sub-1", "sub-2"]);
    const q = queries.find((x) => x.queryKey[0] === "capex-standard-assumptions");
    expect(q).toBeDefined();
    expect(q!.staleTime).toBe(30 * 60 * 1000);
    expect(q!.refetchOnWindowFocus).toBe(false);
  });
});
