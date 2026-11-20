// @vitest-environment jsdom
/**
 * UT-GENPERF-360.. — the reads the split screen hands to its memoized sections keep their identity between renders (D143, item 7):
 * the PV rows joined to the catalogue, and the key arrays of the models / turbines reads. `@/data/generators` is replaced by fakes;
 * the query client and the hooks are real.
 */
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/data/generators", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/generators")>()),
  listPvTypes: vi.fn(async () => [{ id: "pv1", catalogueId: "m1", moduleLabel: "JA 550" }]),
  listGeneratorsByIds: vi.fn(async () => []),
  listProjectTurbines: vi.fn(async () => []),
}));
vi.mock("@/data/milestones", () => ({ loadPriceInflation: vi.fn() }));
vi.mock("@/app/SessionContext", () => ({ useSession: () => ({ session: undefined, envVars: {} }) }));
vi.mock("@/data/flows", () => ({ requestModulePermission: vi.fn(), cancelModulePermission: vi.fn() }));

import { listGeneratorsByIds, listProjectTurbines } from "@/data/generators";
import { useGeneratorModels, useProjectTurbines, usePvModuleTypes } from "./hooks";
import type { PvModuleOption } from "./rules";

const PID = "11111111-1111-1111-1111-111111111111";
const wrap = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

describe("stable reads (D143)", () => {
  it("UT-GENPERF-360 the PV rows joined to the catalogue are the SAME array on every render until the rows or the catalogue change", async () => {
    const catalogue: PvModuleOption[] = [{ id: "m1", displayName: "JA Solar 550", supplier: "JA Solar" }];
    const { result, rerender } = renderHook(({ modules }) => usePvModuleTypes(PID, modules), {
      wrapper: wrap(), initialProps: { modules: catalogue },
    });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    const first = result.current.data;
    expect(first[0]!.catalogueSupplier).toBe("JA Solar");
    rerender({ modules: catalogue });
    rerender({ modules: catalogue });
    expect(result.current.data).toBe(first);
    // A new catalogue is a real change: the join runs again.
    rerender({ modules: [{ id: "m1", displayName: "JA Solar 550", supplier: "Other" }] });
    expect(result.current.data).not.toBe(first);
    expect(result.current.data[0]!.catalogueSupplier).toBe("Other");
  });

  it("UT-GENPERF-361 the models and turbines reads accept the screen's memoized id lists and key on their sorted, de-duplicated copy", async () => {
    const ids = ["b", "a", "b"];
    const { result, rerender } = renderHook(() => ({ models: useGeneratorModels(ids), turbines: useProjectTurbines(PID, ids) }), { wrapper: wrap() });
    await waitFor(() => expect(result.current.models.isLoading).toBe(false));
    rerender();
    rerender();
    expect(result.current.models.data).toEqual([]);
    expect(result.current.turbines.connected).toBe(true);
    // One read each, keyed on the sorted, de-duplicated models ids / the sorted type ids, whatever the number of renders.
    expect(listGeneratorsByIds).toHaveBeenCalledTimes(1);
    expect(listGeneratorsByIds).toHaveBeenCalledWith(["a", "b"]);
    await waitFor(() => expect(listProjectTurbines).toHaveBeenCalledTimes(1));
    expect(listProjectTurbines).toHaveBeenCalledWith(["a", "b", "b"]);
  });
});
