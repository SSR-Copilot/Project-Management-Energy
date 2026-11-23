// @vitest-environment jsdom
/**
 * UT-PLAN-OPT-1xx — the Planning read chain (OPT-16). The data layer is faked with answers the test releases by hand, so the
 * START ORDER of the reads is what is asserted.
 *
 * BEFORE (unmodified tree, `useProjectPlanning(project)` / `useAquisitionStatuses(project, …)`): the planning row and the
 * acquisition statuses started only after the project read ANSWERED (project -> row -> permits, three deep); the planning row's
 * seed needed the project object. AFTER: the row, the types and the project start together; the acquisition statuses start when
 * the types answer; the project is waited for only by a seed that needs it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { AquisitionStatusRow, AquisitionTypeRow, PlanningProject, PlanningRecord } from "./rules";

const s = vi.hoisted(() => ({
  log: [] as string[],
  gates: {} as Record<string, { promise: Promise<unknown>; resolve: (v: never) => void }[]>,
  seeds: [] as number[],
}));

/** A read that starts now (logged) and answers when the test releases it. */
function gated<T>(name: string) {
  return vi.fn(async (..._args: unknown[]): Promise<T> => {
    s.log.push(`start ${name}`);
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => { resolve = r; });
    (s.gates[name] ??= []).push({ promise, resolve: resolve as never });
    return promise;
  });
}
const release = async <T,>(name: string, value: T, index = 0) => {
  await act(async () => { s.gates[name]![index]!.resolve(value as never); await new Promise((r) => setTimeout(r, 20)); });
};

vi.mock("@/data/planning", () => ({
  loadPlanningProject: gated<PlanningProject | null>("project"),
  loadProjectPlanning: gated<PlanningRecord | null>("row"),
  listPermits: gated<unknown[]>("permits"),
  listAquisitionTypes: gated<AquisitionTypeRow[]>("types"),
  listAquisitionStatuses: gated<AquisitionStatusRow[]>("statuses"),
  listCustomChoiceValues: gated<unknown[]>("choices"),
}));
vi.mock("@/data/executePlan", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/executePlan")>()),
  executePlan: vi.fn(async (plan: { writes: unknown[] }) => { s.log.push(`seed ${plan.writes.length}`); s.seeds.push(plan.writes.length); return { done: plan.writes.length, createdIds: [], createdRows: {} }; }),
}));

import { useAquisitionStatuses, useAquisitionTypes, usePermits, usePlanningProject, useProjectPlanning } from "./hooks";

const PID = "11111111-1111-1111-1111-111111111111";
const PROJECT = { id: PID, owningBusinessUnitId: "bu-1", countryId: "c-1" } as PlanningProject;
const ROW = { id: "pp-1" } as PlanningRecord;
const TYPES = [{ id: "t-1", statusName: "Lease", type: 952850000, order: 1 }] as AquisitionTypeRow[];

function screenReads() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return renderHook(() => {
    const projectQ = usePlanningProject(PID);
    const planningQ = useProjectPlanning(PID);
    const permitsQ = usePermits(PID, planningQ.data?.id);
    const typesQ = useAquisitionTypes();
    const aquisitionQ = useAquisitionStatuses(PID, typesQ.data, !typesQ.isLoading && !typesQ.error);
    return { projectQ, planningQ, permitsQ, typesQ, aquisitionQ };
  }, { wrapper });
}

afterEach(() => { cleanup(); s.log.length = 0; s.gates = {}; s.seeds.length = 0; vi.clearAllMocks(); });

describe("Planning entry reads (OPT-16)", () => {
  it("UT-PLAN-OPT-101 the project, the planning row and the types all start before any answer; the permits wait for the row only", async () => {
    screenReads();
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    // BEFORE: ["start project", "start types"]; the row started after the project answered.
    expect([...s.log].sort()).toEqual(["start project", "start row", "start types"]);
    await release("row", ROW);
    expect(s.log).toContain("start permits"); // the project has NOT answered yet
    expect(s.gates.project).toHaveLength(1);
  });

  it("UT-PLAN-OPT-102 the acquisition statuses start when the types answer, not when the project does", async () => {
    screenReads();
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(s.log).not.toContain("start statuses");
    await release("types", TYPES);
    expect(s.log).toContain("start statuses"); // project and row still unanswered
  });

  it("UT-PLAN-OPT-103 with every acquisition row present no project is needed and nothing is seeded", async () => {
    screenReads();
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    await release("row", ROW);
    await release("types", TYPES);
    await release("statuses", [{ id: "as-1", typeId: "t-1" } as AquisitionStatusRow]);
    expect(s.seeds).toEqual([]);
    expect(s.gates.project).toHaveLength(1); // only the screen's own read: the seed path did not fetch it again
  });

  it("UT-PLAN-OPT-104 a missing acquisition row seeds only once the project has loaded, with its business unit (seed gated on the project)", async () => {
    screenReads();
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    await release("types", TYPES);
    await release("statuses", []);
    expect(s.seeds).toEqual([]); // the project has not answered: no seed yet
    await release("project", PROJECT);
    expect(s.seeds).toEqual([1]);
    expect(s.gates.project).toHaveLength(1); // the seed joined the screen's in-flight read, no second request
    expect(s.gates.statuses).toHaveLength(2); // the re-read after the seed
  });

  it("UT-PLAN-OPT-105 a missing planning row is created only after the project loaded, then read again; a project that does not exist seeds nothing", async () => {
    const { result } = screenReads();
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    await release("row", null);
    expect(s.seeds).toEqual([]);
    await release("project", PROJECT);
    expect(s.seeds).toEqual([1]);
    await release("row", ROW, 1);
    expect(result.current.planningQ.data).toEqual(ROW);
  });

  it("UT-PLAN-OPT-106 no project row (null): no planning seed is written and the screen sees an empty planning row", async () => {
    const { result } = screenReads();
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    await release("row", null);
    await release("project", null);
    expect(s.seeds).toEqual([]);
    expect(result.current.planningQ.data).toBeNull();
  });
});
