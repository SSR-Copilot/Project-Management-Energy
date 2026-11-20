import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  listDeviceTypes: vi.fn(), listOpexCostIdsForBridges: vi.fn(), loadTurbineAllocations: vi.fn(),
  listProjectTurbines: vi.fn(), listAllWtgLandLeaseCosts: vi.fn(), loadTurbineAllocationRows: vi.fn(),
}));
vi.mock("@/data/generators", async (original) => ({ ...(await original<Record<string, unknown>>()), ...m }));

import { loadPvDeleteInputs, loadReplaceInputs, loadTypeDeleteInputs } from "./hooks";

const B1 = "b1", B2 = "b2", B3 = "b3";

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  m.listDeviceTypes.mockResolvedValue([{ id: B1, active: true }, { id: B2, active: false }, { id: B3, active: true }]);
  m.listOpexCostIdsForBridges.mockResolvedValue(["c1", "c2", "c3", "c4"]);
  m.loadTurbineAllocations.mockResolvedValue({ allocations: [{ id: "a1", costId: "k1", turbineId: "t1" }], countByCost: { k1: 2 } });
  // D144: with `replaceLanes` ON (the default) a replace reads the allocation rows only, without the count read.
  m.loadTurbineAllocationRows.mockResolvedValue([{ id: "a1", costId: "k1", turbineId: "t1" }]);
  m.listProjectTurbines.mockResolvedValue([{ id: "t1", index: 1 }]);
  m.listAllWtgLandLeaseCosts.mockResolvedValue([{ id: "k1", landOwner: null, description: null, allWtgAllocated: true }]);
});

describe("The delete and replace loaders read the O&M costs of every bridge row (DEL-3)", () => {
  it("UT-GENDATA-OPEX-019 loadTypeDeleteInputs passes ALL bridge ids and returns the same shape", async () => {
    const out = await loadTypeDeleteInputs("p", "type", ["t1"]);
    expect(m.listOpexCostIdsForBridges).toHaveBeenCalledWith("p", [B1, B2, B3]);
    expect(out).toEqual({ allocations: [{ id: "a1", costId: "k1", turbineId: "t1" }], countByCost: { k1: 2 }, opexCostIds: ["c1", "c2", "c3", "c4"] });
  });

  it("UT-GENDATA-OPEX-020 loadTypeDeleteInputs with no bridge row has no O&M ids", async () => {
    m.listDeviceTypes.mockResolvedValue([]);
    m.listOpexCostIdsForBridges.mockResolvedValue([]);
    expect((await loadTypeDeleteInputs("p", "type", [])).opexCostIds).toEqual([]);
  });

  it("UT-GENDATA-OPEX-021 loadPvDeleteInputs returns the unit ids and the costs of all bridges", async () => {
    const out = await loadPvDeleteInputs("p", "pv");
    expect(m.listOpexCostIdsForBridges).toHaveBeenCalledWith("p", [B1, B2, B3]);
    expect(out.unitIds).toEqual(["t1"]);
    expect(out.opexCostIds).toEqual(["c1", "c2", "c3", "c4"]);
  });

  it("UT-GENDATA-OPEX-022 loadReplaceInputs returns every bridge id and every O&M cost id", async () => {
    const out = await loadReplaceInputs("p", "type");
    expect(m.listOpexCostIdsForBridges).toHaveBeenCalledWith("p", [B1, B2, B3]);
    expect(out.bridgeIds).toEqual([B1, B2, B3]);
    expect(out.opexCostIds).toEqual(["c1", "c2", "c3", "c4"]);
    expect(out.unitIds).toEqual(["t1"]);
    expect(out.allocations).toEqual([{ id: "a1", unitIndex: 1, allWtgAllocated: true, costId: "k1" }]);
  });

  it("UT-GENDATA-OPEX-023 A failed O&M read fails the loader (no silent empty list)", async () => {
    m.listOpexCostIdsForBridges.mockRejectedValue(new Error("read failed"));
    await expect(loadTypeDeleteInputs("p", "type", [])).rejects.toThrow("read failed");
    await expect(loadReplaceInputs("p", "type")).rejects.toThrow("read failed");
  });
});
