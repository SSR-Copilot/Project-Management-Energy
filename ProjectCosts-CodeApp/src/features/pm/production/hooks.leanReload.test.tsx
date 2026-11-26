// @vitest-environment jsdom
/**
 * UT-PRODLEAN — PA-08 (dvopt T-22, `GENERATORS_PERF.productionLeanReload`): the Production save does not re-read the yields the roll-up
 * has just read, and the one-shot generation job reloads only the project copies. Real `useProductionWrites` and `useEnergyYields`
 * with a real `QueryClient`; `executePlan` and the reads are stubbed and counted. The OFF runs are the oracle (today's request counts).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { WritePlan } from "@/data/writePlan";
import { CHOICE_PRODUCTION } from "@/data/dataverseNames";
import { qk } from "@/data/keys";
import { setGeneratorsPerfFlags } from "@/data/generatorsPerfFlags";
import { UI, type EnergyYieldRow, type ProductionProject } from "./rules";

const s = vi.hoisted(() => ({
  runs: [] as { plan: WritePlan; operation: string }[],
  /** Each call of `listEnergyYields` answers with the next prepared list (the last one repeats). */
  yieldLists: [] as unknown[][],
  yieldReads: 0,
  projectReads: 0,
  project: null as unknown,
  failAction: false,
}));

vi.mock("@/data/executePlan", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/data/executePlan")>();
  return {
    ...mod,
    executePlan: vi.fn(async (plan: WritePlan, operation: string) => {
      if (s.failAction && s.runs.length === 0) throw new Error("refused");
      s.runs.push({ plan, operation });
      return { done: plan.writes.length, createdIds: [], createdRows: {}, landed: [], deleted: [], maybeLanded: [] };
    }),
  };
});

vi.mock("@/data/production", () => ({
  listEnergyYields: vi.fn(async () => {
    s.yieldReads += 1;
    return s.yieldLists.length > 1 ? s.yieldLists.shift()! : (s.yieldLists[0] ?? []);
  }),
  listProjectRevenues: vi.fn(async () => []),
  loadProductionProject: vi.fn(async () => { s.projectReads += 1; return s.project; }),
  loadStoredSeasonality: vi.fn(async () => null),
  listStoredNegativePrices: vi.fn(async () => []),
  listStandardRevenueAssumptions: vi.fn(async () => ({ seasonality: [], negativePrices: [] })),
  loadGenerationInputs: vi.fn(async (project: ProductionProject) => ({
    project, assumptions: [], existing: { landLease: 1, otherOpex: 1, oAndM: 1 },
    generators: [], deviceTypes: [], oAndM: null, countryInflation: null,
  })),
}));

import { useEnergyYields, useProductionProject, useProductionWrites } from "./hooks";

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
  standardCostCreated: true, owningBusinessUnitId: "bbbbbbbb-0000-0000-0000-0000000000b1", ...over,
});

/** The screen: the yields and project queries mounted, plus the writes hook, over a real client. */
function mount() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  const invalidated: (readonly unknown[])[] = [];
  const original = qc.invalidateQueries.bind(qc);
  vi.spyOn(qc, "invalidateQueries").mockImplementation((filters, options) => {
    invalidated.push((filters as { queryKey: readonly unknown[] }).queryKey);
    return original(filters, options);
  });
  const view = renderHook(() => ({
    writes: useProductionWrites("p1"), yields: useEnergyYields("p1"), project: useProductionProject("p1"),
  }), { wrapper });
  return { qc, view, invalidated };
}

afterEach(() => {
  s.runs.length = 0; s.yieldLists.length = 0; s.yieldReads = 0; s.projectReads = 0; s.project = null; s.failAction = false;
  setGeneratorsPerfFlags(null);
});

const settle = (view: ReturnType<typeof mount>["view"]) => waitFor(() => expect(view.result.current.writes.refreshing).toBe(false));

describe("the Production save reload (PA-08)", () => {
  it("UT-PRODLEAN-001 ON: a status change reads the yields 3 times (screen, action, roll-up) and the screen shows the roll-up's rows without a reload read", async () => {
    const before = row(); const after = row({ status: 1 });
    s.yieldLists = [[before], [before], [after]]; // the screen, the action's read, the roll-up's read after the write
    s.project = project();
    const { view, qc } = mount();
    await waitFor(() => expect(view.result.current.yields.isLoading).toBe(false));
    await waitFor(() => expect(view.result.current.project.isLoading).toBe(false));
    s.yieldReads = 0; s.projectReads = 0;
    s.yieldLists = [[before], [after]];
    await act(async () => { await view.result.current.writes.changeStatus(before); });
    await settle(view);
    await new Promise((r) => setTimeout(r, 30));
    expect(s.yieldReads).toBe(2); // the action's read and the roll-up's: no third, reloading, read
    expect(qc.getQueryData(qk.production("p1", "yields"))).toEqual([after]);
    expect(view.result.current.yields.data).toEqual([after]);
    // The project still reloads (the roll-up wrote its columns): its two reads are the roll-up's and the reload's.
    expect(s.projectReads).toBe(2);
  });

  it("UT-PRODLEAN-002 OFF (the oracle, today's counts): the same status change reads the yields once more for the reload", async () => {
    setGeneratorsPerfFlags({ productionLeanReload: false });
    const before = row(); const after = row({ status: 1 });
    s.yieldLists = [[before]];
    s.project = project();
    const { view } = mount();
    await waitFor(() => expect(view.result.current.yields.isLoading).toBe(false));
    await waitFor(() => expect(view.result.current.project.isLoading).toBe(false));
    s.yieldReads = 0; s.projectReads = 0;
    s.yieldLists = [[before], [after], [after]];
    await act(async () => { await view.result.current.writes.changeStatus(before); });
    await settle(view);
    await waitFor(() => expect(s.yieldReads).toBe(3));
    expect(s.projectReads).toBe(2);
  });

  it("UT-PRODLEAN-003 ON: a save whose roll-up triggers the generation reloads only the project copies after it (no yields read for the generation job)", async () => {
    const a = row();
    s.yieldLists = [[a]];
    s.project = project({ standardCostCreated: false });
    const { view, invalidated } = mount();
    await waitFor(() => expect(view.result.current.yields.isLoading).toBe(false));
    s.yieldReads = 0;
    s.yieldLists = [[a], [a]]; // the roll-up sees an active yield with P50 > 0 and nothing generated yet
    invalidated.length = 0;
    await act(async () => { await view.result.current.writes.changeStatus(a); });
    await settle(view);
    expect(s.runs.map((r) => r.operation)).toEqual([UI.saving, UI.saving, UI.loadingStandardContracts]);
    expect(s.yieldReads).toBe(2); // action + roll-up; the generation's reload reads none
    expect(invalidated).toEqual([
      // job 1: everything but the yields
      qk.production("p1", "project"), qk.production("p1", "seasonality"), qk.production("p1", "negativePrices"),
      qk.milestoneProject("p1"), qk.generalDataProject("p1"),
      // job 2 (the generation): the project copies only
      qk.production("p1", "project"), qk.milestoneProject("p1"), qk.generalDataProject("p1"),
    ]);
  });

  it("UT-PRODLEAN-004 OFF: both jobs reload the whole screen (productionAll), as before", async () => {
    setGeneratorsPerfFlags({ productionLeanReload: false });
    const a = row();
    s.yieldLists = [[a]];
    s.project = project({ standardCostCreated: false });
    const { view, invalidated } = mount();
    await waitFor(() => expect(view.result.current.yields.isLoading).toBe(false));
    invalidated.length = 0;
    await act(async () => { await view.result.current.writes.changeStatus(a); });
    await settle(view);
    expect(invalidated).toEqual([
      qk.productionAll("p1"), qk.milestoneProject("p1"), qk.generalDataProject("p1"),
      qk.productionAll("p1"), qk.milestoneProject("p1"), qk.generalDataProject("p1"),
    ]);
  });

  it("UT-PRODLEAN-005 failure injection: a refused action write never reaches the roll-up, so nothing is seeded and the whole screen reloads", async () => {
    const a = row();
    s.yieldLists = [[a]];
    s.project = project();
    const { view, invalidated, qc } = mount();
    await waitFor(() => expect(view.result.current.yields.isLoading).toBe(false));
    invalidated.length = 0;
    s.failAction = true;
    let ok = true;
    await act(async () => { ok = await view.result.current.writes.deleteYield(a); });
    expect(ok).toBe(false);
    await settle(view);
    expect(invalidated).toEqual([qk.productionAll("p1"), qk.milestoneProject("p1"), qk.generalDataProject("p1")]);
    expect(qc.getQueryData(qk.production("p1", "yields"))).toEqual([a]);
  });

  it("UT-PRODLEAN-006 failure injection: a roll-up that cannot read the project fails before it keeps any yields, so the whole screen reloads", async () => {
    const a = row();
    s.yieldLists = [[a]];
    s.project = project();
    const { view, invalidated } = mount();
    await waitFor(() => expect(view.result.current.yields.isLoading).toBe(false));
    await waitFor(() => expect(view.result.current.project.isLoading).toBe(false));
    invalidated.length = 0;
    s.project = null; // the roll-up's own project read answers "not found"
    await act(async () => { await view.result.current.writes.changeStatus(a); });
    await settle(view);
    expect(invalidated).toEqual([qk.productionAll("p1"), qk.milestoneProject("p1"), qk.generalDataProject("p1")]);
  });
});
