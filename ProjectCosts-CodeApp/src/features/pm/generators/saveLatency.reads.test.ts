/**
 * UT-GENLAT-09x — the read half of `replaceLanes` (D144): `loadReplaceInputs` (a replace's Identify) with the switch off (the staged
 * reads of before, kept) and on (a dependency graph, and no allocation-count read). The data layer is mocked with timed reads so the
 * number of SEQUENTIAL read waves is measured, not guessed: each mocked read takes one tick of fake time.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  listDeviceTypes: vi.fn(), listOpexCostIdsForBridges: vi.fn(), loadTurbineAllocations: vi.fn(),
  loadTurbineAllocationRows: vi.fn(), listProjectTurbines: vi.fn(), listAllWtgLandLeaseCosts: vi.fn(),
}));
vi.mock("@/data/generators", async (original) => ({ ...(await original<Record<string, unknown>>()), ...m }));

import { setGeneratorsPerfFlags } from "@/data/generatorsPerfFlags";
import { loadReplaceInputs } from "./hooks";

const TICK = 10;
/** A read that answers after `ticks` ticks of fake time. */
const after = <T,>(value: T, ticks = 1) => () => new Promise<T>((resolve) => { setTimeout(() => resolve(value), TICK * ticks); });

const ROWS = [{ id: "a1", costId: "k1", turbineId: "t1" }];

beforeEach(() => {
  vi.useFakeTimers();
  for (const f of Object.values(m)) f.mockReset();
  m.listDeviceTypes.mockImplementation(after([{ id: "b1", active: true }, { id: "b2", active: false }]));
  m.listProjectTurbines.mockImplementation(after([{ id: "t1", index: 1 }]));
  m.listAllWtgLandLeaseCosts.mockImplementation(after([{ id: "k1", landOwner: null, description: null, allWtgAllocated: true }]));
  m.listOpexCostIdsForBridges.mockImplementation(after(["c1", "c2"]));
  // The real `loadTurbineAllocations` is two reads in a row (the rows, then the count of each cost's allocations): two ticks.
  m.loadTurbineAllocations.mockImplementation(after({ allocations: ROWS, countByCost: { k1: 2 } }, 2));
  m.loadTurbineAllocationRows.mockImplementation(after(ROWS));
});
afterEach(() => { vi.useRealTimers(); setGeneratorsPerfFlags(null); });

/** Runs the loader, one tick of fake time at a time, and returns how many ticks it took (= the sequential read waves). */
async function waves(): Promise<number> {
  const promise = loadReplaceInputs("p", "type");
  let ticks = 0;
  let settled = false;
  void promise.then(() => { settled = true; }, () => { settled = true; });
  while (!settled && ticks < 20) {
    await vi.advanceTimersByTimeAsync(TICK);
    ticks += 1;
  }
  await promise;
  return ticks;
}

describe("replaceLanes: the Identify reads of a replace", () => {
  it("UT-GENLAT-090 switch OFF: the staged reads of before: three reads, then the O&M and the allocations (with their count read): 3 waves", async () => {
    setGeneratorsPerfFlags({ replaceLanes: false });
    expect(await waves()).toBe(3);
    expect(m.loadTurbineAllocations).toHaveBeenCalledTimes(1);
    expect(m.loadTurbineAllocationRows).not.toHaveBeenCalled();
  });

  it("UT-GENLAT-091 switch ON: the allocation-count read is dropped and every read starts when the ONE read it needs has answered: 2 waves", async () => {
    setGeneratorsPerfFlags({ replaceLanes: true });
    expect(await waves()).toBe(2);
    expect(m.loadTurbineAllocations).not.toHaveBeenCalled();
    expect(m.loadTurbineAllocationRows).toHaveBeenCalledTimes(1);
    expect(m.loadTurbineAllocationRows).toHaveBeenCalledWith(["t1"]);
    expect(m.listOpexCostIdsForBridges).toHaveBeenCalledWith("p", ["b1", "b2"]);
  });

  it("UT-GENLAT-092 the result is identical either way: bridge ids, O&M ids, unit ids, allocations (with cost ids), the AllWTG costs", async () => {
    setGeneratorsPerfFlags({ replaceLanes: false });
    const old = await (async () => { const p = loadReplaceInputs("p", "type"); await vi.advanceTimersByTimeAsync(TICK * 10); return p; })();
    setGeneratorsPerfFlags({ replaceLanes: true });
    const fresh = await (async () => { const p = loadReplaceInputs("p", "type"); await vi.advanceTimersByTimeAsync(TICK * 10); return p; })();
    expect(fresh).toEqual(old);
    expect(fresh.allocations).toEqual([{ id: "a1", unitIndex: 1, allWtgAllocated: true, costId: "k1" }]);
  });

  it("UT-GENLAT-093 the O&M read starts as soon as the device-type rows are in, not after the (slower) units and costs; the allocations after the units", async () => {
    setGeneratorsPerfFlags({ replaceLanes: true });
    m.listProjectTurbines.mockImplementation(after([{ id: "t1", index: 1 }], 4));
    m.listAllWtgLandLeaseCosts.mockImplementation(after([], 4));
    const promise = loadReplaceInputs("p", "type");
    await vi.advanceTimersByTimeAsync(TICK);
    // The device-type rows (1 tick) are in; the units and the costs (4 ticks) are not.
    expect(m.listOpexCostIdsForBridges).toHaveBeenCalledTimes(1);
    expect(m.loadTurbineAllocationRows).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(TICK * 3);
    expect(m.loadTurbineAllocationRows).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(TICK * 10);
    await promise;
    // With the switch off the O&M read would have waited for all three.
    setGeneratorsPerfFlags({ replaceLanes: false });
    m.listOpexCostIdsForBridges.mockClear();
    const old = loadReplaceInputs("p", "type");
    await vi.advanceTimersByTimeAsync(TICK);
    expect(m.listOpexCostIdsForBridges).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(TICK * 20);
    await old;
  });

  it("UT-GENLAT-094 a failed read fails the loader on both paths (no silent empty list)", async () => {
    for (const replaceLanes of [false, true]) {
      setGeneratorsPerfFlags({ replaceLanes });
      m.listOpexCostIdsForBridges.mockReset();
      m.listOpexCostIdsForBridges.mockRejectedValue(new Error("read failed"));
      const promise = loadReplaceInputs("p", "type");
      const caught = promise.then(() => null, (e: unknown) => e);
      await vi.advanceTimersByTimeAsync(TICK * 20);
      expect(String(await caught)).toContain("read failed");
    }
  });

  it("UT-GENLAT-095 the delete loaders keep the count read (the type and PV delete use `countByCost`): `loadTurbineAllocations` is unchanged", async () => {
    const { loadTypeDeleteInputs } = await import("./hooks");
    m.listDeviceTypes.mockResolvedValue([]);
    m.listOpexCostIdsForBridges.mockResolvedValue([]);
    m.loadTurbineAllocations.mockResolvedValue({ allocations: ROWS, countByCost: { k1: 2 } });
    const out = await loadTypeDeleteInputs("p", "type", ["t1"]);
    expect(out.countByCost).toEqual({ k1: 2 });
    expect(m.loadTurbineAllocations).toHaveBeenCalledTimes(1);
  });
});
