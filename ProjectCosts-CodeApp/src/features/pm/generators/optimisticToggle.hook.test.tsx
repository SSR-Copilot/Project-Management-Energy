// @vitest-environment jsdom
/**
 * UT-GENPERF-310.. — the optimistic status toggle through the REAL `useGeneratorWrites` / `usePlanWrite` (D143).
 * `executePlan` is stubbed (a write that lands, fails, stops part-way or finds its rows gone); the hook, `qk`, `withReload` and
 * the optimistic cache functions are the real ones. Both halves of the switch: a job that carries `optimistic` (switch on) and one
 * that does not (switch off = today's behaviour).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { WritePlan } from "@/data/writePlan";

const h = vi.hoisted(() => ({ queue: [] as (() => unknown)[] }));
vi.mock("@/data/executePlan", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/data/executePlan")>();
  return { ...mod, executePlan: vi.fn(async () => h.queue.shift()!()) };
});
vi.mock("@/app/SessionContext", () => ({ useSession: () => ({ session: null, envVars: {} }) }));

import { PlanError } from "@/data/executePlan";
import { BulkRowsGoneError } from "@/data/bulkTypes";
import { CHOICE_PLANT } from "@/data/dataverseNames";
import { qk } from "@/data/keys";
import { useGeneratorWrites } from "./hooks";
import { applyOptimisticToggle } from "./optimisticToggle";
import { withReload } from "./reload";
import type { GeneratorTypeRow, TurbineRow } from "./rules";

const PROJECT = "11111111-1111-1111-1111-111111111111";
const ACTIVE = CHOICE_PLANT.status.active;
const INACTIVE = CHOICE_PLANT.status.inactive;
const plan = (reason: string): WritePlan => ({ writes: [{ op: "update", entitySet: "vsb_xs", id: "1", data: {}, reason }], log: [] });
const done = () => ({ done: 1, createdIds: [], createdRows: {}, landed: [], deleted: [], maybeLanded: [] });

const type = (status: number = ACTIVE): GeneratorTypeRow => ({
  id: "t1", name: "WTG-0001", generatorId: "g1", generatorDisplayName: "Vestas V150-5.6", numberOfGenerators: 2, costPerWtg: 1,
  generatorsCost: 2, generatorsCapacity: 11.2, requestPermissionState: null, flowRunId: null, flowApprovalId: null, status,
  specificCapacity: null,
});
const turbine = (id: string): TurbineRow => ({
  id, name: id, typeId: "t1", index: 1, effectiveCapacity: 5.6, effectiveHubHeight: null, effectiveHubHeightChanged: false,
  foundationPlinth: 0, hubHeightExclPlinth: 148, totalHeight: 223, status: ACTIVE,
});

const TYPES = qk.generators(PROJECT, "types");
const TURBINES = qk.generators(PROJECT, "turbines", "t1");

function setup() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  qc.setQueryData(TYPES, [type()]);
  qc.setQueryData(TURBINES, [turbine("a"), turbine("b")]);
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useGeneratorWrites(PROJECT), { wrapper });
  /** The toggle's job exactly as the screen builds it with the switch ON (`Screen.tsx`). */
  const job = (extra: Record<string, unknown> = {}) => withReload({
    progress: "go", plan: plan("toggle"),
    optimistic: (client: QueryClient) => applyOptimisticToggle(client, { projectId: PROJECT, typeId: "t1", nextStatus: INACTIVE }),
    ...extra,
  }, PROJECT, "toggleStatus");
  const status = () => ({
    type: qc.getQueryData<GeneratorTypeRow[]>(TYPES)![0]!.status,
    turbines: qc.getQueryData<TurbineRow[]>(TURBINES)!.map((t) => t.status),
  });
  return { qc, invalidate, ...hook, job, status };
}

beforeEach(() => { h.queue = []; });

describe("the optimistic toggle through usePlanWrite (D143)", () => {
  it("UT-GENPERF-310 the new status shows WHILE the writes run, and a success keeps it until the targeted reload replaces it", async () => {
    let finish: () => void = () => {};
    h.queue = [() => new Promise((resolve) => { finish = () => resolve(done()); })];
    const { result, status, job, invalidate } = setup();
    expect(status()).toEqual({ type: ACTIVE, turbines: [ACTIVE, ACTIVE] });
    let run!: Promise<string[] | null>;
    act(() => { run = result.current.run(job()); });
    await waitFor(() => expect(status()).toEqual({ type: INACTIVE, turbines: [INACTIVE, INACTIVE] }));
    await act(async () => { finish(); await run; });
    // Landed: nothing is rolled back, and the reload of the toggle's own queries has been asked for.
    expect(status()).toEqual({ type: INACTIVE, turbines: [INACTIVE, INACTIVE] });
    const keys = invalidate.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys).toContain(JSON.stringify(TYPES));
    expect(keys.some((k) => k.includes('"turbines"'))).toBe(true);
  });

  it("UT-GENPERF-311 a failed save puts the exact previous rows back, with the existing error text, and still reloads", async () => {
    h.queue = [() => { throw new PlanError(0, 3, "the generator type's status", new Error("HTTP 400")); }];
    const { result, status, job, invalidate } = setup();
    let ids: string[] | null = ["untouched"];
    await act(async () => { ids = await result.current.run(job()); });
    expect(ids).toBeNull();
    expect(status()).toEqual({ type: ACTIVE, turbines: [ACTIVE, ACTIVE] });
    expect(result.current.error).toContain("the generator type's status");
    expect(result.current.error).toContain("HTTP 400");
    // The targeted reload of phase A is the final truth after a failure too.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: TYPES });
  });

  it("UT-GENPERF-312 a PARTLY failed save (the type flipped, a turbine did not) rolls back and says how many changes had been saved", async () => {
    h.queue = [() => { throw new PlanError(2, 4, "a turbine's status", new Error("boom")); }];
    const { result, status, job, invalidate } = setup();
    await act(async () => { await result.current.run(job()); });
    expect(status()).toEqual({ type: ACTIVE, turbines: [ACTIVE, ACTIVE] });
    expect(result.current.error).toContain("2 of 4 changes had already been saved");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: TYPES });
  });

  it("UT-GENPERF-313 a 'rows gone' refusal rolls back and keeps the existing 'rows gone' text", async () => {
    h.queue = [() => { throw new PlanError(1, 3, "the turbines' status", new BulkRowsGoneError(["b"])); }];
    const { result, status, job } = setup();
    await act(async () => { await result.current.run(job()); });
    expect(status()).toEqual({ type: ACTIVE, turbines: [ACTIVE, ACTIVE] });
    expect(result.current.error).toContain("no longer exist");
    expect(result.current.error).toContain("1 of 3 changes had already been saved");
  });

  it("UT-GENPERF-314 the rollback runs BEFORE the screen is told the writes ended in failure (a panel never sees the optimistic rows after it)", async () => {
    h.queue = [() => { throw new PlanError(0, 1, "x", new Error("no")); }];
    const { result, status, job } = setup();
    const seen: unknown[] = [];
    await act(async () => { await result.current.run(job({ onWritten: (ok: boolean) => { seen.push([ok, status().type]); } })); });
    expect(seen).toEqual([[false, ACTIVE]]);
  });

  it("UT-GENPERF-315 an optimistic hook that throws is ignored: the save still runs and lands", async () => {
    h.queue = [done];
    const { result, status, job } = setup();
    let ids: string[] | null = null;
    await act(async () => { ids = await result.current.run(job({ optimistic: () => { throw new Error("cosmetic"); } })); });
    expect(ids).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(status().type).toBe(ACTIVE);
  });

  it("UT-GENPERF-316 switch OFF: a job without the hook never touches the cached rows, on success or on failure (today's behaviour)", async () => {
    h.queue = [done, () => { throw new PlanError(0, 1, "x", new Error("no")); }];
    const { result, status } = setup();
    const plain = () => withReload({ progress: "go", plan: plan("toggle") }, PROJECT, "toggleStatus");
    await act(async () => { await result.current.run(plain()); });
    expect(status()).toEqual({ type: ACTIVE, turbines: [ACTIVE, ACTIVE] });
    await act(async () => { await result.current.run(plain()); });
    expect(status()).toEqual({ type: ACTIVE, turbines: [ACTIVE, ACTIVE] });
  });
});
