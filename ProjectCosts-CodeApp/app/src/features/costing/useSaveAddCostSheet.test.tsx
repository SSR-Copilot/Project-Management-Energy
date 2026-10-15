// @vitest-environment jsdom
/**
 * `useSaveAddCostSheet` — the mutation must settle (and `mutateAsync` resolve) as soon as the
 * save itself finishes, WITHOUT waiting for the six cache invalidations that follow it.
 * `invalidateQueries` refetches every ACTIVE query it touches, and `useMutation` awaits
 * whatever `onSuccess` returns before the mutation settles — so returning `invalidate()`
 * directly (its previous shape) meant the Save button's perceived time included up to six real
 * refetches on top of the save. This is the one test proving that regression cannot come back.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ projectId: "proj-1", project: { owningBusinessUnitId: "bu-1" } }),
}));

const saveAddCostSheet = vi.fn<(args: unknown) => Promise<void>>();
vi.mock("@/data/costRepository", () => ({
  costRepository: () => ({ saveAddCostSheet: (args: unknown) => saveAddCostSheet(args) }),
}));

const { useSaveAddCostSheet } = await import("./useCostBook");

beforeEach(() => {
  saveAddCostSheet.mockReset();
  saveAddCostSheet.mockResolvedValue(undefined);
});

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("useSaveAddCostSheet", () => {
  it(
    "UT-COSTBOOK-001 mutateAsync resolves without waiting for invalidateQueries, even when " +
      "a refetch it triggers is still slow",
    async () => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      // A slow ACTIVE query on one of the keys `useSaveAddCostSheet` invalidates — if the
      // mutation waited for invalidation's refetch, `mutateAsync` would not resolve until this
      // query function below finally does.
      let releaseSlowQuery: () => void = () => {};
      const slowQueryKey = ["cost-book", "proj-1", 5] as const;
      client.setQueryData(slowQueryKey, { stale: true });

      const { result: queryResult } = renderHook(
        () => useQuery({
          queryKey: slowQueryKey,
          queryFn: () => new Promise((resolve) => { releaseSlowQuery = () => resolve({ fresh: true }); }),
        }),
        { wrapper: wrapper(client) },
      );
      await waitFor(() => expect(queryResult.current.isSuccess).toBe(true));

      const { result } = renderHook(() => useSaveAddCostSheet(5), { wrapper: wrapper(client) });

      const started = Date.now();
      await result.current.mutateAsync({
        changedRows: [], existingContracts: [], existingCosts: [], contractDeleteIds: [],
      } as never);
      const elapsedBeforeRelease = Date.now() - started;

      // `mutateAsync` resolved while the refetch it triggered is STILL pending.
      expect(queryResult.current.isFetching).toBe(true);
      expect(elapsedBeforeRelease).toBeLessThan(1000);

      releaseSlowQuery();
      await waitFor(() => expect(queryResult.current.isFetching).toBe(false));
    },
  );

  it("UT-COSTBOOK-002 still invalidates every key after a successful save", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateQueries = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useSaveAddCostSheet(5), { wrapper: wrapper(client) });
    await result.current.mutateAsync({
      changedRows: [], existingContracts: [], existingCosts: [], contractDeleteIds: [],
    } as never);

    // Fire-and-forget still fires: give the un-awaited microtask a tick to run.
    await waitFor(() => expect(invalidateQueries).toHaveBeenCalledTimes(6));
  });
});
