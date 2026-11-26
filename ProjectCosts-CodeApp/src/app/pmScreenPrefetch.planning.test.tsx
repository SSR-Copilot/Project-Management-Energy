// @vitest-environment jsdom
/**
 * UT-BOOT-SCREENS-0xx — PB-03 / PB-10: the boot prefetch of Planning and Grid Operator, against the REAL hooks.
 *
 * A prefetch that lands under a key the screen does not read is a wasted request, so each test fills a query client with
 * `prefetchPmScreenReads` and then mounts the screen's own hooks on it: every read must have been made exactly once. The
 * prefetch never writes: a project whose planning row or acquisition rows are missing is left to the screen's own (guarded) seed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const s = vi.hoisted(() => ({
  calls: [] as string[],
  row: null as unknown,
  statuses: [] as unknown[],
  creates: 0,
}));

vi.mock("@/data/planning", () => ({
  loadPlanningProject: vi.fn(async () => { s.calls.push("project"); return { id: "p", owningBusinessUnitId: "bu-1", countryId: "c-1" }; }),
  loadProjectPlanning: vi.fn(async () => { s.calls.push("row"); return s.row; }),
  listPermits: vi.fn(async () => { s.calls.push("permits"); return []; }),
  listAquisitionTypes: vi.fn(async () => { s.calls.push("types"); return [
    { id: "t-1", statusName: "Lease", type: 952850000, order: 1 },
    { id: "t-2", statusName: "Rem", type: 952850001, order: 1 },
  ]; }),
  listAquisitionStatuses: vi.fn(async () => { s.calls.push("statuses"); return s.statuses; }),
  listCustomChoiceValues: vi.fn(async () => []),
}));
vi.mock("@/data/gridOperator", () => ({
  loadGridOperator: vi.fn(async () => { s.calls.push("gridRow"); return { id: "g-1" }; }),
}));
vi.mock("@/data/executePlan", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/executePlan")>()),
  executePlan: vi.fn(async (plan: { writes: unknown[] }) => { s.creates += 1; return { done: plan.writes.length, createdIds: [], createdRows: {} }; }),
}));

import { prefetchPmScreenReads } from "./pmScreenPrefetch";
import { resetBootDvopt, setBootDvoptForTests } from "@/data/bootDvoptFlags";
import { useAquisitionStatuses, useAquisitionTypes, usePlanningProject, useProjectPlanning } from "@/features/pm/planning/hooks";
import { useGridOperator, useGridOperatorProject } from "@/features/pm/grid-operator/hooks";
import { resetSeedOnce } from "@/features/pm/planning/seedOnce";
import { LLA_TYPE_VALUE } from "@/features/pm/planning/rules";

const PID = "11111111-1111-1111-1111-111111111111";
const ALL_STATUSES = [
  { id: "as-1", typeId: "t-1", typeKind: LLA_TYPE_VALUE.personam },
  { id: "as-2", typeId: "t-2", typeKind: LLA_TYPE_VALUE.rem },
];
const count = (name: string) => s.calls.filter((c) => c === name).length;

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
const wrap = (qc: QueryClient) => ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const tick = (ms = 30) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

beforeEach(() => {
  s.calls.length = 0;
  s.row = { id: "pp-1" };
  s.statuses = ALL_STATUSES;
  s.creates = 0;
  resetSeedOnce();
  resetBootDvopt();
});
afterEach(() => cleanup());

const planningScreen = (qc: QueryClient) => renderHook(() => {
  const project = usePlanningProject(PID);
  const row = useProjectPlanning(PID);
  const types = useAquisitionTypes();
  const statuses = useAquisitionStatuses(PID, types.data, !types.isLoading && !types.error);
  return { project, row, types, statuses };
}, { wrapper: wrap(qc) });

describe("Planning boot prefetch", () => {
  it("UT-BOOT-SCREENS-001 the screen finds the project, the row, the types and the statuses in the cache: each read happened once, and none was a write", async () => {
    const qc = client();
    await prefetchPmScreenReads(qc, "planning", PID);
    expect([count("project"), count("row"), count("types"), count("statuses")]).toEqual([1, 1, 1, 1]);
    const { result } = planningScreen(qc);
    await tick();
    expect(result.current.row.data).toEqual({ id: "pp-1" });
    expect(result.current.statuses.data).toEqual(ALL_STATUSES);
    expect([count("project"), count("row"), count("types"), count("statuses")]).toEqual([1, 1, 1, 1]);
    expect(s.creates).toBe(0);
  });

  it("UT-BOOT-SCREENS-002 a project with no planning row and no acquisition rows: the prefetch writes nothing and leaves both keys empty for the screen's own seed", async () => {
    s.row = null;
    s.statuses = [];
    const qc = client();
    await prefetchPmScreenReads(qc, "planning", PID);
    expect(s.creates).toBe(0);
    expect(qc.getQueryData(["pmPlanning", PID, "row"])).toBeUndefined();
    expect(qc.getQueryData(["pmPlanning", PID, "aquisition"])).toBeUndefined();
    // The screen then seeds, once each, through its own guarded step.
    const { result } = planningScreen(qc);
    await waitFor(() => expect(s.creates).toBe(2));
    await tick();
    expect(s.creates).toBe(2);
    expect(result.current.project.data).toBeTruthy();
  });

  it("UT-BOOT-SCREENS-003 Grid Operator takes Planning's project read: one project read for a Planning boot followed by a Grid Operator visit (PB-10)", async () => {
    const qc = client();
    await prefetchPmScreenReads(qc, "planning", PID);
    const { result } = renderHook(() => ({ project: useGridOperatorProject(PID), row: useGridOperator(PID) }), { wrapper: wrap(qc) });
    await tick();
    expect(result.current.project.data).toBeTruthy();
    expect(count("project")).toBe(1);
    expect(count("gridRow")).toBe(1);
  });
});

describe("Grid Operator boot prefetch", () => {
  it("UT-BOOT-SCREENS-010 the project and the row are in the cache: each read happened once", async () => {
    const qc = client();
    await prefetchPmScreenReads(qc, "grid-operator", PID);
    expect([count("project"), count("gridRow")]).toEqual([1, 1]);
    const { result } = renderHook(() => ({ project: useGridOperatorProject(PID), row: useGridOperator(PID) }), { wrapper: wrap(qc) });
    await tick();
    expect(result.current.row.data).toEqual({ id: "g-1" });
    expect([count("project"), count("gridRow")]).toEqual([1, 1]);
  });

  it("UT-BOOT-SCREENS-011 PB-10: Planning then Grid Operator on one client reads the project row once; with the switch OFF twice", async () => {
    const run = async () => {
      s.calls.length = 0;
      const qc = client();
      renderHook(() => usePlanningProject(PID), { wrapper: wrap(qc) });
      await tick();
      renderHook(() => useGridOperatorProject(PID), { wrapper: wrap(qc) });
      await tick();
      return count("project");
    };
    expect(await run()).toBe(1);
    cleanup();
    setBootDvoptForTests({ pmProjectRowShared: false });
    expect(await run()).toBe(2);
  });
});

describe("no slug, no reads", () => {
  it("UT-BOOT-SCREENS-020 a slug this module does not prefetch (Production, Revenues, Finance) starts nothing", async () => {
    const qc = client();
    for (const slug of ["production", "revenues", "finance"] as const) await prefetchPmScreenReads(qc, slug, PID);
    expect(s.calls).toEqual([]);
  });
});
