// @vitest-environment jsdom
/**
 * UT-PRODHOOK — `useProductionWrites` after the save-performance change (D108): the roll-up is the `then`
 * step of the action's own job (one reload, not two), it still reads the yields fresh AFTER the writes,
 * the one-shot generation stays its own job, and the reload runs in the background (`refreshing`).
 * `executePlan` and the reads are stubbed.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { WritePlan } from "@/data/writePlan";
import { CHOICE_PRODUCTION, ES, ES_PRODUCTION } from "@/data/dataverseNames";
import { UI, type EnergyYieldRow, type ProductionProject } from "./rules";

const s = vi.hoisted(() => ({
  runs: [] as { plan: WritePlan; operation: string }[],
  yieldReads: [] as unknown[][],
  project: null as unknown,
}));

vi.mock("@/data/executePlan", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/data/executePlan")>();
  return {
    ...mod,
    executePlan: vi.fn(async (plan: WritePlan, operation: string) => {
      s.runs.push({ plan, operation });
      return { done: plan.writes.length, createdIds: [], createdRows: {} };
    }),
  };
});

vi.mock("@/data/production", () => ({
  // Each call returns the next prepared read, so a test can tell the action's read from the roll-up's.
  listEnergyYields: vi.fn(async () => s.yieldReads.shift() ?? []),
  listProjectRevenues: vi.fn(async () => []),
  loadProductionProject: vi.fn(async () => s.project),
  loadStoredSeasonality: vi.fn(async () => null),
  listStoredNegativePrices: vi.fn(async () => []),
  listStandardRevenueAssumptions: vi.fn(async () => ({ seasonality: [], negativePrices: [] })),
  loadGenerationInputs: vi.fn(async (project: ProductionProject) => ({
    project, assumptions: [], existing: { landLease: 1, otherOpex: 1, oAndM: 1 },
    generators: [], deviceTypes: [], oAndM: null, countryInflation: null,
  })),
}));

import { useProductionWrites } from "./hooks";

const row = (over: Partial<EnergyYieldRow> = {}): EnergyYieldRow => ({
  id: "y1", name: "EY-1", description: "North", type: CHOICE_PRODUCTION.yieldType.wtg,
  assessment: CHOICE_PRODUCTION.yieldAssessment.internal, allocation: 100, windSpeed: 7, irradiation: null,
  grossYield: 12_000, totalLosses: 15, netYieldP50: 10_200, uncertainty: 10, netYieldP75: 9_512, netYieldP90: 8_893,
  productionAllocation: null, productionLossesP50: false, productionUncertainty: false,
  considerSeasonality: false, considerNegativePrices: false, status: 0, ...over,
});

const project = (over: Partial<ProductionProject> = {}): ProductionProject => ({
  id: "p1", projectIdText: "DE-0001", projectName: "Nord", countryId: "c1", countryName: "Germany", technology: 952850000,
  totalCapacity: 22.4, endDate: "2055-12-31", cod: null, plantPvCapacity: 5,
  grossYield: 0, windSpeed: 0, irradiation: null, netYieldP50: 0, netYieldP75: 0, netYieldP90: 0,
  standardCostCreated: true, owningBusinessUnitId: "bu-1", ...over,
});

/** A QueryClient whose reload only finishes when the test says so, counting the invalidations. */
function held() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  let finish: () => void = () => {};
  const reload = new Promise<void>((resolve) => { finish = resolve; });
  const invalidate = vi.spyOn(qc, "invalidateQueries").mockReturnValue(reload);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { wrapper, invalidate, finish: () => finish(), reload };
}

afterEach(() => { s.runs.length = 0; s.yieldReads.length = 0; s.project = null; });

describe("useProductionWrites (D108)", () => {
  it("UT-PRODHOOK-001 a delete and its roll-up are ONE job: one reload of the four views, the roll-up from the fresh read", async () => {
    const north = row();
    const south = row({ id: "y2", netYieldP50: 5_000 });
    s.yieldReads.push([north, south], [south]); // the action's read, then the roll-up's read after the delete
    s.project = project();
    const h = held();
    const { result } = renderHook(() => useProductionWrites("p1"), { wrapper: h.wrapper });
    let ok = false;
    await act(async () => { ok = await result.current.deleteYield(north); });
    expect(ok).toBe(true);
    expect(s.runs.map((r) => [r.operation, r.plan.writes[0]!.op, r.plan.writes[0]!.entitySet])).toEqual([
      [UI.saving, "delete", ES_PRODUCTION.energyYields],
      [UI.saving, "update", ES.projects],
    ]);
    // The roll-up was built from the yields as they are after the delete: South alone.
    expect(Object.values(s.runs[1]!.plan.writes[0]!.data!)).toContain(5_000);
    // One job → the four views are invalidated once (two separate jobs invalidated them twice).
    expect(h.invalidate).toHaveBeenCalledTimes(4);
  });

  it("UT-PRODHOOK-002 the progress closes once the writes land; `refreshing` holds until the reload ends", async () => {
    s.yieldReads.push([row()], [row({ status: 1 })]);
    s.project = project();
    const h = held();
    const { result } = renderHook(() => useProductionWrites("p1"), { wrapper: h.wrapper });
    await act(async () => { await result.current.changeStatus(row()); });
    expect(result.current.progress).toBeNull();
    expect(result.current.refreshing).toBe(true);
    await act(async () => { h.finish(); await h.reload; });
    await waitFor(() => expect(result.current.refreshing).toBe(false));
  });

  it("UT-PRODHOOK-003 the one-shot generation is still its own job, only when the new p50 > 0 and nothing was generated", async () => {
    const north = row();
    s.yieldReads.push([north], [north]);
    s.project = project({ standardCostCreated: false });
    const h = held();
    const { result } = renderHook(() => useProductionWrites("p1"), { wrapper: h.wrapper });
    await act(async () => { await result.current.changeStatus(row({ status: 1 })); });
    expect(s.runs.map((r) => r.operation)).toEqual([UI.saving, UI.saving, UI.loadingStandardContracts]);

    s.runs.length = 0;
    s.yieldReads.push([north], [north]);
    s.project = project({ standardCostCreated: true });
    await act(async () => { await result.current.changeStatus(row({ status: 1 })); });
    expect(s.runs.map((r) => r.operation)).toEqual([UI.saving, UI.saving]);
  });

  it("UT-PRODHOOK-004 a failed action write sends no roll-up and no generation", async () => {
    const { executePlan } = await import("@/data/executePlan");
    vi.mocked(executePlan).mockRejectedValueOnce(new Error("refused"));
    s.yieldReads.push([row()]);
    s.project = project({ standardCostCreated: false });
    const h = held();
    const { result } = renderHook(() => useProductionWrites("p1"), { wrapper: h.wrapper });
    let ok = true;
    await act(async () => { ok = await result.current.deleteYield(row()); });
    expect(ok).toBe(false);
    expect(s.runs).toHaveLength(0);
    expect(result.current.error).toContain("refused");
  });
});
