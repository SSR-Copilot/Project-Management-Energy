// @vitest-environment jsdom
/**
 * UT-PLANSEED-* — PB-05 (`PLANNING_CREATE_ONCE`): Planning's `OnVisible` seeds run once per project.
 *
 * Before: the creates ran inside the query functions, guarded only by "the read found no row". A retry, a window-focus refetch,
 * a second observer or a second client ran the creation again, and a row the user cannot read looked absent on every visit.
 * The data layer is faked; `executePlan` counts the creates. The old path (switch OFF) is kept and pinned too.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { AquisitionStatusRow, AquisitionTypeRow, PlanningProject, PlanningRecord } from "./rules";

const s = vi.hoisted(() => ({
  creates: [] as { sets: string[] }[],
  /** What the data layer answers; tests change them between runs. */
  row: null as unknown,
  statuses: [] as unknown[],
  refuse: false,
  createDelayMs: 0,
}));

vi.mock("@/data/planning", () => ({
  loadPlanningProject: vi.fn(async () => ({ id: "11111111-1111-1111-1111-111111111111", owningBusinessUnitId: "bu-1", countryId: "c-1" })),
  loadProjectPlanning: vi.fn(async () => s.row),
  listPermits: vi.fn(async () => []),
  listAquisitionTypes: vi.fn(async () => [
    { id: "t-1", statusName: "Lease", type: 952850000, order: 1 },
    { id: "t-2", statusName: "Rem", type: 952850001, order: 1 },
  ]),
  listAquisitionStatuses: vi.fn(async () => s.statuses),
  listCustomChoiceValues: vi.fn(async () => []),
}));
vi.mock("@/data/executePlan", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/executePlan")>()),
  executePlan: vi.fn(async (plan: { writes: { entitySet: string }[] }) => {
    s.creates.push({ sets: plan.writes.map((w) => w.entitySet) });
    if (s.createDelayMs) await new Promise((r) => setTimeout(r, s.createDelayMs));
    if (s.refuse) throw new Error("403 Forbidden");
    return { done: plan.writes.length, createdIds: [], createdRows: {} };
  }),
}));

import { listAquisitionStatuses, loadProjectPlanning } from "@/data/planning";
import { resetBootDvopt, setBootDvoptForTests } from "@/data/bootDvoptFlags";
import { useAquisitionStatuses, useProjectPlanning } from "./hooks";
import { resetSeedOnce, seedOnce } from "./seedOnce";
import { LLA_TYPE_VALUE } from "./rules";

const PID = "11111111-1111-1111-1111-111111111111";
const ROW = { id: "pp-1" } as PlanningRecord;
const TYPES: AquisitionTypeRow[] = [
  { id: "t-1", statusName: "Lease", type: LLA_TYPE_VALUE.personam, order: 1 },
  { id: "t-2", statusName: "Rem", type: LLA_TYPE_VALUE.rem, order: 1 },
];

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrap = (qc: QueryClient) => ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const tick = (ms = 20) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

beforeEach(() => {
  s.creates.length = 0;
  s.row = null;
  s.statuses = [];
  s.refuse = false;
  s.createDelayMs = 0;
  resetSeedOnce();
  resetBootDvopt();
  vi.mocked(loadProjectPlanning).mockReset().mockImplementation(async () => s.row as never);
  vi.mocked(listAquisitionStatuses).mockReset().mockImplementation(async () => s.statuses as never);
});
afterEach(() => { cleanup(); resetBootDvopt(); });

describe("the once-per-project guard", () => {
  it("UT-PLANSEED-001 concurrent callers for one key run the step once and all report what it did", async () => {
    const step = vi.fn(async () => { await new Promise((r) => setTimeout(r, 10)); return "created" as const; });
    const results = await Promise.all([seedOnce("k", step), seedOnce("k", step), seedOnce("k", step)]);
    expect(step).toHaveBeenCalledTimes(1);
    expect(results).toEqual(["created", "created", "created"]);
  });

  it("UT-PLANSEED-002 after a create succeeded, a later caller for the key does not run the step again", async () => {
    const step = vi.fn(async () => "created" as const);
    await seedOnce("k", step);
    expect(await seedOnce("k", step)).toBe("done");
    expect(step).toHaveBeenCalledTimes(1);
  });

  it("UT-PLANSEED-003 a refused create and a found row are not remembered: the next visit tries again, as before", async () => {
    const refused = vi.fn(async () => "refused" as const);
    await seedOnce("k", refused);
    await seedOnce("k", refused);
    expect(refused).toHaveBeenCalledTimes(2);
    const none = vi.fn(async () => "none" as const);
    await seedOnce("j", none);
    await seedOnce("j", none);
    expect(none).toHaveBeenCalledTimes(2);
  });

  it("UT-PLANSEED-004 keys are per project and per kind", async () => {
    const step = vi.fn(async () => "created" as const);
    await Promise.all([seedOnce("planning:a", step), seedOnce("planning:b", step), seedOnce("aquisition:a", step)]);
    expect(step).toHaveBeenCalledTimes(3);
  });

  it("UT-PLANSEED-005 a step that throws frees the key (no stuck in-flight entry)", async () => {
    await expect(seedOnce("k", async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    const step = vi.fn(async () => "created" as const);
    expect(await seedOnce("k", step)).toBe("created");
  });
});

describe("the planning row seed (useProjectPlanning)", () => {
  it("UT-PLANSEED-010 a normal first open creates the row once and shows it (same writes as before)", async () => {
    const qc = client();
    const rows = [null, ROW]; // the first read finds none, the re-check finds none, the read after the create finds the row
    vi.mocked(loadProjectPlanning).mockImplementation(async () => (s.creates.length === 0 ? null : rows[1]) as never);
    const { result } = renderHook(() => useProjectPlanning(PID), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.data).toEqual(ROW));
    expect(s.creates).toEqual([{ sets: ["vsb_projectplannings"] }]);
  });

  it("UT-PLANSEED-011 two clients opening the project at once (two tabs, a retry) create the row once", async () => {
    s.createDelayMs = 30;
    const a = renderHook(() => useProjectPlanning(PID), { wrapper: wrap(client()) });
    const b = renderHook(() => useProjectPlanning(PID), { wrapper: wrap(client()) });
    await tick(150);
    expect(s.creates).toHaveLength(1);
    a.unmount();
    b.unmount();
  });

  it("UT-PLANSEED-012 a row the user cannot read (the read always answers none): every later refetch creates nothing more", async () => {
    const qc = client();
    const { result } = renderHook(() => useProjectPlanning(PID), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(s.creates).toHaveLength(1);
    await act(async () => { await qc.refetchQueries({ queryKey: ["pmPlanning", PID, "row"] }); });
    await act(async () => { await qc.refetchQueries({ queryKey: ["pmPlanning", PID, "row"] }); });
    expect(s.creates).toHaveLength(1);
    expect(result.current.data).toBeNull();
  });

  it("UT-PLANSEED-013 the row appearing between the read and the create (another tab created it) is not created again", async () => {
    // The first read finds none; the re-check right before the create finds the row.
    vi.mocked(loadProjectPlanning).mockResolvedValueOnce(null as never).mockResolvedValue(ROW as never);
    const { result } = renderHook(() => useProjectPlanning(PID), { wrapper: wrap(client()) });
    await waitFor(() => expect(result.current.data).toEqual(ROW));
    expect(s.creates).toEqual([]);
  });

  it("UT-PLANSEED-014 a refused create is traced and swallowed, the screen continues, and the next visit tries again (as before)", async () => {
    s.refuse = true;
    const qc = client();
    const { result } = renderHook(() => useProjectPlanning(PID), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeUndefined();
    await act(async () => { await qc.refetchQueries({ queryKey: ["pmPlanning", PID, "row"] }); });
    expect(s.creates).toHaveLength(2);
  });

  it("UT-PLANSEED-015 OFF (the old path): every query-function run creates again, with no re-check read", async () => {
    setBootDvoptForTests({ planningCreateOnce: false });
    const qc = client();
    const { result } = renderHook(() => useProjectPlanning(PID), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { await qc.refetchQueries({ queryKey: ["pmPlanning", PID, "row"] }); });
    expect(s.creates).toHaveLength(2);
    // first run: the read + the re-read after the create; no re-check read in between
    expect(vi.mocked(loadProjectPlanning).mock.calls.length).toBe(4);
  });
});

describe("the acquisition seed (useAquisitionStatuses)", () => {
  const mount = (qc: QueryClient) => renderHook(() => useAquisitionStatuses(PID, TYPES, true), { wrapper: wrap(qc) });

  it("UT-PLANSEED-020 creates one row per missing type, once, and shows the re-read list", async () => {
    const done: AquisitionStatusRow[] = [{ id: "as-1", typeId: "t-1" } as AquisitionStatusRow];
    vi.mocked(listAquisitionStatuses).mockImplementation(async () => (s.creates.length === 0 ? [] : done) as never);
    const { result } = mount(client());
    await waitFor(() => expect(result.current.data).toEqual(done));
    expect(s.creates).toEqual([{ sets: ["vsb_aquisitionstatuses", "vsb_aquisitionstatuses"] }]);
  });

  it("UT-PLANSEED-021 two clients at once create the rows once", async () => {
    s.createDelayMs = 30;
    mount(client());
    mount(client());
    await tick(150);
    expect(s.creates).toHaveLength(1);
  });

  it("UT-PLANSEED-022 only the types still missing at the re-check are created", async () => {
    // First read: nothing. Re-check right before the create: the Lease row exists now.
    vi.mocked(listAquisitionStatuses).mockResolvedValueOnce([] as never).mockResolvedValue([{ id: "as-1", typeId: "t-1" }] as never);
    mount(client());
    await tick(100);
    expect(s.creates).toEqual([{ sets: ["vsb_aquisitionstatuses"] }]);
  });

  it("UT-PLANSEED-023 rows the user cannot read: a later refetch creates nothing more", async () => {
    const qc = client();
    const { result } = mount(qc);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { await qc.refetchQueries({ queryKey: ["pmPlanning", PID, "aquisition"] }); });
    expect(s.creates).toHaveLength(1);
  });

  it("UT-PLANSEED-024 OFF (the old path): a refetch creates again", async () => {
    setBootDvoptForTests({ planningCreateOnce: false });
    const qc = client();
    const { result } = mount(qc);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { await qc.refetchQueries({ queryKey: ["pmPlanning", PID, "aquisition"] }); });
    expect(s.creates).toHaveLength(2);
  });
});

describe("what is created is unchanged", () => {
  it("UT-PLANSEED-030 the planning seed carries the project bind and the project's owning business unit, as planEnsurePlanning builds it", async () => {
    const { executePlan } = await import("@/data/executePlan");
    renderHook(() => useProjectPlanning(PID), { wrapper: wrap(client()) });
    await tick(80);
    const plan = vi.mocked(executePlan).mock.calls[0]![0] as { writes: { data: Record<string, unknown> }[] };
    expect(JSON.stringify(plan.writes[0]!.data)).toContain("businessunits(bu-1)");
    expect(JSON.stringify(plan.writes[0]!.data)).toContain(PID);
  });
});

void ({} as PlanningProject);
