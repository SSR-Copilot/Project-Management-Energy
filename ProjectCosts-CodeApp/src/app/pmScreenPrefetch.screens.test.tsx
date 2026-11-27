// @vitest-environment jsdom
/**
 * UT-BOOT-SCREENS-1xx — PB-03: the boot prefetch of Check List, Team and Milestones, against the REAL hooks.
 *
 * Those three screens define their queries inside `hooks.ts`, so `pmScreenPrefetch.ts` repeats their keys and functions. This is
 * the drift check: fill a client with the prefetch, mount the screen's own hooks on it, and fail if the hook asks the data layer
 * again. When a `hooks.ts` key or function changes without this module, the test fails here, not as a silent wasted request.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const s = vi.hoisted(() => ({ calls: [] as string[] }));
const note = (name: string) => { s.calls.push(name); };

vi.mock("@/data/checklist", async (original) => ({
  ...(await original<typeof import("@/data/checklist")>()),
  loadChecklistProject: vi.fn(async () => { note("cl.project"); return { id: "p", countryId: "c-1", technology: 1 }; }),
  listChecklistProjectStates: vi.fn(async () => { note("cl.states"); return []; }),
  listChecklistTrackings: vi.fn(async () => { note("cl.trackings"); return []; }),
  listChecklistGates: vi.fn(async () => { note("cl.gates"); return []; }),
}));
vi.mock("@/data/team", async (original) => ({
  ...(await original<typeof import("@/data/team")>()),
  loadTeamProject: vi.fn(async () => { note("team.project"); return { id: "p" }; }),
  listMemberDescriptions: vi.fn(async () => { note("team.descriptions"); return []; }),
  listTeamMembers: vi.fn(async (_id: string, descriptions: Promise<unknown>) => { await descriptions; note("team.members"); return []; }),
}));
vi.mock("@/data/milestones", async (original) => ({
  ...(await original<typeof import("@/data/milestones")>()),
  loadMilestoneProject: vi.fn(async () => { note("ms.project"); return { id: "p", countryId: "c-1" }; }),
  countIndividualVolumeContracts: vi.fn(async () => { note("ms.volume"); return 0; }),
  isMilestoneRecalculationRunning: vi.fn(async () => { note("ms.recalc"); return false; }),
}));
vi.mock("@/data/generalData", async (original) => ({
  ...(await original<typeof import("@/data/generalData")>()),
  listGeneralDataCountries: vi.fn(async () => { note("gd.countries"); return []; }),
}));
// BND-06 (T-E01): the shared project-states read is its own module now (same note, same call).
vi.mock("@/data/projectStatesRead", () => ({
  listProjectStates: vi.fn(async () => { note("gd.states"); return []; }),
}));

/* T-C02 (SPB-02): Production, Revenues and Finance. `held.project` lets a test hold the project row to see what starts before it. */
const held = vi.hoisted(() => ({ project: undefined as undefined | Promise<void> }));
vi.mock("@/data/production", async (original) => ({
  ...(await original<typeof import("@/data/production")>()),
  loadProductionProject: vi.fn(async () => { note("pr.project"); if (held.project) await held.project; return { id: "p", countryName: "Germany" }; }),
  listEnergyYields: vi.fn(async () => { note("pr.yields"); return []; }),
  listStandardRevenueAssumptions: vi.fn(async () => { note("pr.assumptions"); return { seasonality: [], negativePrices: [] }; }),
}));
vi.mock("@/data/revenues", async (original) => ({
  ...(await original<typeof import("@/data/revenues")>()),
  loadRevenueProject: vi.fn(async (_id: string, states?: () => Promise<unknown>) => {
    note("rev.project"); await states?.(); if (held.project) await held.project;
    return { id: "p", countryName: "Germany", countryCode: "c-1" };
  }),
  listRevenueContracts: vi.fn(async () => { note("rev.contracts"); return []; }),
  listBalancingPrices: vi.fn(async () => { note("rev.balancing"); return []; }),
  hasNegativePriceProduction: vi.fn(async () => { note("rev.production"); return false; }),
  listRevenueAssumptionRows: vi.fn(async () => { note("rev.assumptions"); return []; }),
  listRevenueCountryInflation: vi.fn(async () => { note("rev.inflation"); return []; }),
}));
/* BND-04 (T-E02): `findCurrency` and `loadFirstRevenueSubaccount` live in `data/revenueLookups` now, so that is the module to stub. */
vi.mock("@/data/revenueLookups", () => ({
  loadFirstRevenueSubaccount: vi.fn(async () => { note("rev.subaccount"); return null; }),
  findCurrency: vi.fn(async () => { note("rev.currency"); return null; }),
}));
vi.mock("@/data/finance", async (original) => ({
  ...(await original<typeof import("@/data/finance")>()),
  listFinancingCategories: vi.fn(async () => { note("fin.categories"); return []; }),
  listBanks: vi.fn(async () => { note("fin.banks"); return []; }),
  listKfwTranches: vi.fn(async () => { note("fin.kfw"); return []; }),
  loadFinanceProject: vi.fn(async () => { note("fin.project"); return null; }),
  listFinancingInputsRaw: vi.fn(async () => { note("fin.inputs"); return []; }),
  listRepaymentAmounts: vi.fn(async () => { note("fin.repayments"); return []; }),
  listStepUpMargins: vi.fn(async () => { note("fin.stepups"); return []; }),
}));

import { prefetchPmScreenReads } from "./pmScreenPrefetch";
import { resetEntryPrefetch, setEntryPrefetchForTests } from "@/data/entryPrefetchFlags";
import { useEnergyYields, useProductionProject, useRevenueAssumptions as useProductionAssumptions } from "@/features/pm/production/hooks";
import {
  useBalancingPrices, useCountryInflationProfiles, useNegativePriceProduction, useRevenueAssumptions, useRevenueContracts,
  useRevenueCurrency, useRevenueProject, useRevenueSubaccount,
} from "@/features/pm/revenues/hooks";
import {
  useBanks, useFinanceProject, useFinancingCategories, useFinancingInputs, useKfwTranches, useRepaymentAmounts, useStepUpMargins,
} from "@/features/pm/finance/hooks";
import { checklistPerf, setChecklistPerfFlags } from "@/data/checklistPerfFlags";
import { useChecklistProject, useClusterSequence } from "@/features/pm/checklist/hooks";
import { useMemberDescriptions, useProjectMembers, useTeamProject } from "@/features/pm/team/hooks";
import {
  useIndividualVolumeContractCount, useMilestoneLabels, useMilestoneProject, useRecalculationRunning,
} from "@/features/pm/milestones/hooks";
import type { ChecklistProject } from "@/features/pm/checklist/rules";

const PID = "11111111-1111-1111-1111-111111111111";
const count = (name: string) => s.calls.filter((c) => c === name).length;
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
const wrap = (qc: QueryClient) => ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const tick = (ms = 40) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

beforeEach(() => { s.calls.length = 0; setChecklistPerfFlags(null); held.project = undefined; resetEntryPrefetch(); });
afterEach(() => { cleanup(); setChecklistPerfFlags(null); resetEntryPrefetch(); });

describe("Check List boot prefetch", () => {
  const screen = (qc: QueryClient) => renderHook(() => {
    const project = useChecklistProject(PID);
    const sequence = useClusterSequence(PID, project.data as ChecklistProject | null);
    return { project, sequence };
  }, { wrapper: wrap(qc) });

  it("UT-BOOT-SCREENS-101 the project, the states, the trackings and the gates are in the cache: each read happened once, none after the mount", async () => {
    const qc = client();
    await prefetchPmScreenReads(qc, "checklist", PID);
    const once = ["cl.project", "cl.states", "cl.trackings", "cl.gates"];
    expect(once.map(count)).toEqual([1, 1, 1, 1]);
    const { result } = screen(qc);
    await tick();
    expect(result.current.sequence.hasData).toBe(true);
    expect(once.map(count)).toEqual([1, 1, 1, 1]);
  });

  it("UT-BOOT-SCREENS-102 with the D156 switches OFF (own states key, own gates key) the prefetch follows the screen's keys", async () => {
    setChecklistPerfFlags({ sharedStates: false, scopedGates: false });
    expect(checklistPerf().sharedStates).toBe(false);
    const qc = client();
    await prefetchPmScreenReads(qc, "checklist", PID);
    const { result } = screen(qc);
    await tick();
    expect(result.current.sequence.hasData).toBe(true);
    expect(["cl.project", "cl.states", "cl.trackings", "cl.gates"].map(count)).toEqual([1, 1, 1, 1]);
  });
});

describe("Team boot prefetch", () => {
  it("UT-BOOT-SCREENS-111 the project, the members and the descriptions are in the cache: each read happened once (the descriptions are shared by the members read)", async () => {
    const qc = client();
    await prefetchPmScreenReads(qc, "team", PID);
    const once = ["team.project", "team.members", "team.descriptions"];
    expect(once.map(count)).toEqual([1, 1, 1]);
    const { result } = renderHook(() => ({ p: useTeamProject(PID), m: useProjectMembers(PID), d: useMemberDescriptions() }), { wrapper: wrap(qc) });
    await tick();
    expect(result.current.p.data).toEqual({ id: "p" });
    expect(once.map(count)).toEqual([1, 1, 1]);
  });
});

describe("Milestones boot prefetch", () => {
  it("UT-BOOT-SCREENS-121 the project, the labels, the contract count and the recalculation flag are in the cache: each read happened once", async () => {
    const qc = client();
    await prefetchPmScreenReads(qc, "milestones", PID);
    const once = ["ms.project", "gd.states", "ms.volume", "ms.recalc", "gd.countries"];
    expect(once.map(count)).toEqual([1, 1, 1, 1, 1]);
    const { result } = renderHook(() => ({
      p: useMilestoneProject(PID), l: useMilestoneLabels(), v: useIndividualVolumeContractCount(PID), r: useRecalculationRunning(PID),
    }), { wrapper: wrap(qc) });
    await tick();
    expect(result.current.p.data).toEqual({ id: "p", countryId: "c-1" });
    expect(once.map(count)).toEqual([1, 1, 1, 1, 1]);
  });
});

describe("Production boot prefetch (T-C02)", () => {
  it("UT-BOOT-SCREENS-200 the project, the yields and the country's assumptions are in the cache: each read happened once, none after the mount", async () => {
    const qc = client();
    await prefetchPmScreenReads(qc, "production", PID);
    const once = ["pr.project", "pr.yields", "pr.assumptions"];
    expect(once.map(count)).toEqual([1, 1, 1]);
    const { result } = renderHook(() => ({ p: useProductionProject(PID), y: useEnergyYields(PID), a: useProductionAssumptions("Germany") }), { wrapper: wrap(qc) });
    await tick();
    expect(result.current.p.data).toEqual({ id: "p", countryName: "Germany" });
    expect(once.map(count)).toEqual([1, 1, 1]);
  });

  it("UT-BOOT-SCREENS-203 the project and the yields start together; the country's assumptions wait for the project row", async () => {
    let release!: () => void;
    held.project = new Promise<void>((r) => { release = r; });
    const qc = client();
    const done = prefetchPmScreenReads(qc, "production", PID);
    await tick();
    expect(s.calls).toContain("pr.yields"); // the row has not answered
    expect(s.calls).not.toContain("pr.assumptions");
    release();
    await done;
    expect(s.calls.indexOf("pr.assumptions")).toBeGreaterThan(s.calls.indexOf("pr.project"));
  });
});

describe("Revenues boot prefetch (T-C02)", () => {
  it("UT-BOOT-SCREENS-201 the project, the contracts, the balancing prices, the production check, the sub-account and the country's reads are in the cache: each happened once", async () => {
    const qc = client();
    await prefetchPmScreenReads(qc, "revenues", PID);
    const once = ["rev.project", "rev.contracts", "rev.balancing", "rev.production", "rev.subaccount", "rev.assumptions", "rev.currency", "rev.inflation", "gd.states"];
    expect(once.map(count)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
    renderHook(() => ({
      p: useRevenueProject(PID), c: useRevenueContracts(PID), b: useBalancingPrices(PID), n: useNegativePriceProduction(PID),
      s: useRevenueSubaccount(), a: useRevenueAssumptions("Germany"), cur: useRevenueCurrency("Germany", true), i: useCountryInflationProfiles("c-1"),
    }), { wrapper: wrap(qc) });
    await tick();
    expect(once.map(count)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it("UT-BOOT-SCREENS-204 the country's assumptions, currency and inflation wait for the project row; nothing else does", async () => {
    let release!: () => void;
    held.project = new Promise<void>((r) => { release = r; });
    const done = prefetchPmScreenReads(client(), "revenues", PID);
    await tick();
    expect(s.calls).toEqual(expect.arrayContaining(["rev.contracts", "rev.balancing", "rev.production", "rev.subaccount"]));
    expect(s.calls.filter((c) => ["rev.assumptions", "rev.currency", "rev.inflation"].includes(c))).toEqual([]);
    release();
    await done;
    expect(["rev.assumptions", "rev.currency", "rev.inflation"].map(count)).toEqual([1, 1, 1]);
  });
});

describe("Finance boot prefetch (T-C02): reference reads only", () => {
  it("UT-BOOT-SCREENS-202 the categories, the banks and the KfW tranches are in the cache; the visit's own reads (project, inputs, repayments, step-ups) are NOT prefetched", async () => {
    const qc = client();
    await prefetchPmScreenReads(qc, "finance", PID);
    expect(["fin.categories", "fin.banks", "fin.kfw"].map(count)).toEqual([1, 1, 1]);
    expect(["fin.project", "fin.inputs", "fin.repayments", "fin.stepups"].map(count)).toEqual([0, 0, 0, 0]);
    renderHook(() => ({ c: useFinancingCategories(), b: useBanks(), k: useKfwTranches() }), { wrapper: wrap(qc) });
    await tick();
    expect(["fin.categories", "fin.banks", "fin.kfw"].map(count)).toEqual([1, 1, 1]);
  });

  it("UT-BOOT-SCREENS-205 the visit's own reads still run on every mount (refetchOnMount always), prefetch or not", async () => {
    const qc = client();
    await prefetchPmScreenReads(qc, "finance", PID);
    renderHook(() => ({
      p: useFinanceProject(PID), i: useFinancingInputs(PID, []), r: useRepaymentAmounts(PID), u: useStepUpMargins(PID),
    }), { wrapper: wrap(qc) });
    await tick();
    expect(["fin.project", "fin.inputs", "fin.repayments", "fin.stepups"].map(count)).toEqual([1, 1, 1, 1]);
  });
});

describe("T-C02 switch", () => {
  it("UT-BOOT-SCREENS-206 BOOT_PREFETCH_PM_EXTRA_SCREENS OFF restores today's behaviour: Production, Revenues and Finance start no read", async () => {
    setEntryPrefetchForTests({ pmExtraScreens: false });
    for (const slug of ["production", "revenues", "finance"] as const) await prefetchPmScreenReads(client(), slug, PID);
    expect(s.calls).toEqual([]);
  });
});
