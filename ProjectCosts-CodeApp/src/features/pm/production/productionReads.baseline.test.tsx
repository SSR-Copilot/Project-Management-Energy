// @vitest-environment jsdom
/**
 * UT-PRODBASE-1xx — the BASELINE of what `useProductionWrites` reads and sends per user action, before any optimization.
 *
 * `executePlan` and the readers are stubbed (as UT-PRODHOOK does) and every call is recorded in order, so the table says,
 * for each action: which reads ran, in what order, how many jobs (plans) were sent with how many writes, and how many
 * invalidations the reload takes. Run with `--reporter=verbose` to see the `[BASELINE]` lines. Test support only.
 * NOT measured here (no network): milliseconds, the reload's own requests, and `loadGenerationInputs`'s inner reads.
 *
 * Numbers taken on the unchanged code (4 Nov baseline): invalidations = 4 per job (8 for a save that also generates).
 * Since D135 (R2) the session project is not reloaded, so the same run prints 3 and 6; reads, jobs and
 * writes are unchanged. The generation's write-waves are measured in `generationWaves.test.ts`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { WritePlan } from "@/data/writePlan";
import { CHOICE_PRODUCTION } from "@/data/dataverseNames";
import { steps } from "@/features/pm/generators/bulkPlans.testkit";
import {
  buildNegativePriceRows, buildSeasonalityRows, buildYieldPayload, deriveYieldView, newYieldForm,
  type EnergyYieldRow, type GenerationInputs, type ProductionProject, type StoredNegativePrice,
} from "./rules";

const s = vi.hoisted(() => ({
  log: [] as string[],
  runs: [] as { plan: WritePlan; operation: string }[],
  yields: [] as unknown[],
  project: null as unknown,
  inputs: null as unknown,
}));

vi.mock("@/data/executePlan", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/data/executePlan")>();
  return {
    ...mod,
    executePlan: vi.fn(async (plan: WritePlan, operation: string) => {
      s.log.push(`executePlan(${plan.writes.length})`);
      s.runs.push({ plan, operation });
      return { done: plan.writes.length, createdIds: [], createdRows: {} };
    }),
  };
});

vi.mock("@/data/production", () => {
  const rec = <T,>(name: string, value: () => T) => vi.fn(async () => { s.log.push(name); return value(); });
  return {
    listEnergyYields: rec("read yields", () => s.yields),
    listProjectRevenues: rec("read revenues", () => []),
    loadProductionProject: rec("read project", () => s.project),
    loadStoredSeasonality: rec("read stored seasonality", () => null),
    listStoredNegativePrices: rec("read stored negative prices", () => [] as StoredNegativePrice[]),
    listStandardRevenueAssumptions: vi.fn(async () => ({ seasonality: [], negativePrices: [] })),
    loadGenerationInputs: rec("read generation inputs (many reads inside)", () => s.inputs),
  };
});

import { useProductionWrites } from "./hooks";

const project = (over: Partial<ProductionProject> = {}): ProductionProject => ({
  id: "p1", projectIdText: "DE-0001", projectName: "Nord", countryId: "c1", countryName: "Germany", technology: 952850000,
  totalCapacity: 22.4, endDate: "2055-12-31", cod: "2028-09-01", plantPvCapacity: 5, grossYield: 0, windSpeed: 0, irradiation: null,
  netYieldP50: 0, netYieldP75: 0, netYieldP90: 0, standardCostCreated: true, owningBusinessUnitId: "bu-1", ...over,
});

const row = (over: Partial<EnergyYieldRow> = {}): EnergyYieldRow => ({
  id: "y1", name: "EY-1", description: "North", type: CHOICE_PRODUCTION.yieldType.wtg,
  assessment: CHOICE_PRODUCTION.yieldAssessment.internal, allocation: 100, windSpeed: 7, irradiation: null,
  grossYield: 12_000, totalLosses: 15, netYieldP50: 10_200, uncertainty: 10, netYieldP75: 9_512, netYieldP90: 8_893,
  productionAllocation: null, productionLossesP50: false, productionUncertainty: false,
  considerSeasonality: false, considerNegativePrices: false, status: 0, ...over,
});

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(qc, "invalidateQueries").mockImplementation(async () => { s.log.push("invalidate"); });
  return { invalidate, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider> };
}

const twelve = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, pv: 8, wtg: 8 }));

function generation(): GenerationInputs {
  const a = (over: Record<string, unknown>) => ({
    id: "a", name: "LL", description: "LL", period: CHOICE_PRODUCTION.opexLandLeasePeriod.period1,
    typeOfContract: CHOICE_PRODUCTION.typeOfContract.landlease, landLeaseSubaccountId: "lls1", landLeaseSubaccountName: "L",
    opexSubaccountId: null, opexSubaccountName: null, currencyId: null, secured: true, allWtgAllocated: true, fixCosts: 1, ofRevenues: 1,
    eurMw: 1, eurMwh: 1, eurWtg: 1, aggregation: null, durationInYears: 1, durationInMonths: 0, distributionFrequency: 12,
    amountOneTimePayment: null, amountOneTimePayment2: null, amountOneTimePayment3: null, dueDateOneTimePayment: null,
    dueDateOneTimePayment2: null, dueDateOneTimePayment3: null, useInflationProfile: false, useCountryInflationProfile: false,
    inflationProfile: null, inflationCountryArea: null, alignWithProjectDuration: false, externalContract: false, threshold: false,
    thresholdType: null, thresholdIndividual: null, ...over,
  });
  return {
    project: project({ standardCostCreated: false }),
    assumptions: [a({ id: "a1", description: "A" }), a({ id: "a2", description: "B", landLeaseSubaccountId: "lls2" })] as never,
    existing: { landLease: 0, otherOpex: 0, oAndM: 0 },
    generators: Array.from({ length: 30 }, (_, i) => ({ id: `g${i}`, name: `W${i}` })),
    deviceTypes: [{ id: "d1" }], oAndM: null, countryInflation: null,
  };
}

const summary: string[] = [];

/** Runs one action and prints its ordered calls. */
async function action(name: string, run: (h: ReturnType<typeof useProductionWrites>) => Promise<boolean>): Promise<string[]> {
  const w = wrapper();
  const { result } = renderHook(() => useProductionWrites("p1"), { wrapper: w.wrapper });
  s.log.length = 0; s.runs.length = 0;
  await act(async () => { await run(result.current); });
  const reads = s.log.filter((l) => l.startsWith("read")).length;
  const jobs = s.runs.length;
  const writes = s.runs.reduce((n, r) => n + r.plan.writes.length, 0);
  const waves = s.runs.reduce((n, r) => n + steps(r.plan.writes).length, 0);
  const line = `${name.padEnd(46)} reads=${String(reads).padStart(2)}  jobs=${jobs}  writes=${String(writes).padStart(3)}  write-waves=${String(waves).padStart(3)}  invalidations=${s.log.filter((l) => l === "invalidate").length}`;
  summary.push(line, `    order: ${s.log.join(" > ")}`);
  return [...s.log];
}

afterEach(() => { s.yields = []; s.project = null; s.inputs = null; });

const view = (tech: "WTG" | "PV" = "WTG") => {
  const form = { ...newYieldForm("en-US"), description: "Assessment", windSpeed: "7", grossYield: "12000", totalLosses: "15", uncertainty: "10", considerSeasonality: true, considerNegativePrices: true };
  return { form, payload: buildYieldPayload({ form, view: deriveYieldView(form, tech, { lang: "en-US" }), technology: tech, project: project() }) };
};

describe("UT-PRODBASE-1xx reads and jobs per action (the code before optimization)", () => {
  it("UT-PRODBASE-101 save a new yield, no generation due", async () => {
    s.yields = [row()]; s.project = project({ standardCostCreated: true });
    const { payload } = view();
    const log = await action("save new yield (no generation)", (h) => h.saveYield({
      editing: null, payload, project: { owningBusinessUnitId: "bu-1" },
      seasonality: { on: true, rows: buildSeasonalityRows(twelve, "WTG") }, negativePrices: { on: true, rows: buildNegativePriceRows(2028, [], "WTG") },
    }));
    expect(log.filter((l) => l === "read yields")).toHaveLength(2); // the plan's read and the roll-up's read
    expect(log.filter((l) => l === "read project")).toHaveLength(1);
  });

  it("UT-PRODBASE-102 save an edit (stored rows are read again at Save)", async () => {
    const editing = row({ considerSeasonality: true, considerNegativePrices: true });
    s.yields = [editing]; s.project = project({ standardCostCreated: true });
    const { payload } = view();
    const log = await action("save edit (stored rows re-read)", (h) => h.saveYield({
      editing, payload, project: { owningBusinessUnitId: "bu-1" },
      seasonality: { on: true, rows: buildSeasonalityRows(twelve, "WTG") }, negativePrices: { on: true, rows: buildNegativePriceRows(2028, [], "WTG") },
    }));
    expect(log.filter((l) => l === "read stored seasonality")).toHaveLength(1);
  });

  it("UT-PRODBASE-103 save a new yield when the one-shot generation is due (30 turbines, 2 land leases)", async () => {
    s.yields = [row({ netYieldP50: 5_000 })]; s.project = project({ standardCostCreated: false }); s.inputs = generation();
    const { payload } = view();
    const log = await action("save new yield + generation due", (h) => h.saveYield({
      editing: null, payload, project: { owningBusinessUnitId: "bu-1" },
      seasonality: { on: false, rows: [] }, negativePrices: { on: false, rows: [] },
    }));
    expect(s.runs).toHaveLength(3); // action job (with its roll-up) + generation job = executePlan twice for job 1, once for job 2
    expect(log.filter((l) => l === "read project")).toHaveLength(2); // roll-up, then before the generation
  });

  it("UT-PRODBASE-104 delete a yield", async () => {
    s.yields = [row(), row({ id: "y2", netYieldP50: 4_000 })]; s.project = project();
    await action("delete a yield", (h) => h.deleteYield(row()));
  });

  it("UT-PRODBASE-105 deactivate a yield", async () => {
    s.yields = [row(), row({ id: "y2", netYieldP50: 4_000 })]; s.project = project();
    await action("deactivate a yield", (h) => h.changeStatus(row()));
  });

  it("UT-PRODBASE-199 prints the table", () => {
    console.info(`\n[BASELINE] per user action (stubbed readers and engine; reads = reader calls, not HTTP requests)\n${summary.join("\n")}`);
    expect(summary.length).toBeGreaterThan(0);
  });
});
