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
  listProjectStates: vi.fn(async () => { note("gd.states"); return []; }),
}));

import { prefetchPmScreenReads } from "./pmScreenPrefetch";
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

beforeEach(() => { s.calls.length = 0; setChecklistPerfFlags(null); });
afterEach(() => { cleanup(); setChecklistPerfFlags(null); });

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
