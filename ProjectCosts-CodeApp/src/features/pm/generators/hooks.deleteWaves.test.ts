/**
 * Optimization programme B6, OPT-15 (S4-04): the type delete's Identify reads as a dependency graph.
 *
 * Measured with the wave recorder (`src/test/waveClient.ts`) over a label-keyed fake `fetchAll`: the cost of a load is its
 * number of SEQUENTIAL WAVES. The OLD numbers (flag `deleteReadWaves` OFF = the staged code kept for rollback) were recorded
 * first against the unmodified tree; the NEW numbers are the dependency-graph form. The rows that come back are identical.
 *
 *   WTG type delete  OLD 4 waves  -> NEW 3   (the O&M read starts when the device-type read answers, not when the allocation COUNTS do)
 *   PV type delete   OLD 5 waves  -> NEW 3   (and the device-type read no longer waits for the unit read)
 *
 * Ids: UT-GENWAVE-OPT-NNN.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWaveClient, waveOf, type WaveClient } from "@/test/waveClient";

const h = vi.hoisted(() => ({ wave: undefined as unknown as WaveClient }));

vi.mock("@/data/client", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  fetchAll: (label: string, page: unknown, options?: Record<string, unknown>) => h.wave.fetchAll(label, page, options),
}));

const { loadPvDeleteInputs, loadTypeDeleteInputs } = await import("./hooks");
const { GENERATORS_PERF_ALL_OFF, setGeneratorsPerfFlags } = await import("@/data/generatorsPerfFlags");

const L = {
  turbines: "load the project's turbines",
  bridges: "load the type's O&M device types",
  allocRows: "load the turbines' land-lease allocations",
  allocCount: "count the land-lease costs' allocations",
  opexHeads: "load the type's O&M costs",
  opexChain: "load the type's O&M cost chains",
};

const ANSWERS: Record<string, unknown[]> = {
  [L.turbines]: [
    { vsb_generatorinprojectid: "00000000-0000-0000-0000-000000000004", vsb_name: "WTG-0001", _vsb_moduletypeinprojectid_value: "00000000-0000-0000-0000-000000000002" },
    { vsb_generatorinprojectid: "00000000-0000-0000-0000-000000000005", vsb_name: "WTG-0002", _vsb_moduletypeinprojectid_value: "00000000-0000-0000-0000-000000000002" },
  ],
  [L.bridges]: [
    { vsb_devicetypesinprojectid: "00000000-0000-0000-0000-000000000006", statecode: 0 }, { vsb_devicetypesinprojectid: "00000000-0000-0000-0000-000000000007", statecode: 1 },
  ],
  [L.allocRows]: [
    { vsb_landleaseallocationwtgid: "00000000-0000-0000-0000-000000000008", _vsb_projectcost_value: "00000000-0000-0000-0000-000000000011", _vsb_generatorinproject_value: "00000000-0000-0000-0000-000000000004" },
    { vsb_landleaseallocationwtgid: "00000000-0000-0000-0000-000000000009", _vsb_projectcost_value: "00000000-0000-0000-0000-000000000012", _vsb_generatorinproject_value: "00000000-0000-0000-0000-000000000005" },
  ],
  [L.allocCount]: [
    { vsb_landleaseallocationwtgid: "00000000-0000-0000-0000-000000000008", _vsb_projectcost_value: "00000000-0000-0000-0000-000000000011" },
    { vsb_landleaseallocationwtgid: "00000000-0000-0000-0000-000000000009", _vsb_projectcost_value: "00000000-0000-0000-0000-000000000012" },
    { vsb_landleaseallocationwtgid: "00000000-0000-0000-0000-000000000010", _vsb_projectcost_value: "00000000-0000-0000-0000-000000000012" },
  ],
  [L.opexHeads]: [{ vsb_opexprojectcostid: "00000000-0000-0000-0000-000000000013" }, { vsb_opexprojectcostid: "00000000-0000-0000-0000-000000000014" }],
  [L.opexChain]: [{ vsb_opexprojectcostid: "00000000-0000-0000-0000-000000000015" }],
};

const EXPECTED_WTG = {
  allocations: [{ id: "00000000-0000-0000-0000-000000000008", costId: "00000000-0000-0000-0000-000000000011", turbineId: "00000000-0000-0000-0000-000000000004" }, { id: "00000000-0000-0000-0000-000000000009", costId: "00000000-0000-0000-0000-000000000012", turbineId: "00000000-0000-0000-0000-000000000005" }],
  countByCost: { "00000000-0000-0000-0000-000000000011": 1, "00000000-0000-0000-0000-000000000012": 2 },
  opexCostIds: ["00000000-0000-0000-0000-000000000013", "00000000-0000-0000-0000-000000000014", "00000000-0000-0000-0000-000000000015"],
};

beforeEach(() => {
  h.wave = createWaveClient((label) => ANSWERS[label] ?? []);
});
afterEach(() => setGeneratorsPerfFlags(null));

describe("OPT-15 S4-04: the WTG type delete's inputs (loadTypeDeleteInputs)", () => {
  it("UT-GENWAVE-OPT-001 OLD (switch off): 4 waves, the O&M read starts only after the allocation counts", async () => {
    setGeneratorsPerfFlags(GENERATORS_PERF_ALL_OFF);
    const { value, waves, calls } = await h.wave.run(() => loadTypeDeleteInputs("00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002", ["00000000-0000-0000-0000-000000000004", "00000000-0000-0000-0000-000000000005"]));
    expect(value).toEqual(EXPECTED_WTG);
    expect(waves).toBe(4);
    expect(waveOf(calls, L.allocRows)).toBe(0);
    expect(waveOf(calls, L.bridges)).toBe(0);
    expect(waveOf(calls, L.allocCount)).toBe(1);
    expect(waveOf(calls, L.opexHeads)).toBe(2);
    expect(waveOf(calls, L.opexChain)).toBe(3);
  });

  it("UT-GENWAVE-OPT-002 NEW: 3 waves, the O&M read starts with the allocation counts; the same result", async () => {
    const { value, waves, calls } = await h.wave.run(() => loadTypeDeleteInputs("00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002", ["00000000-0000-0000-0000-000000000004", "00000000-0000-0000-0000-000000000005"]));
    expect(value).toEqual(EXPECTED_WTG);
    expect(waves).toBe(3);
    expect(waveOf(calls, L.allocRows)).toBe(0);
    expect(waveOf(calls, L.bridges)).toBe(0);
    expect(waveOf(calls, L.allocCount)).toBe(1);
    expect(waveOf(calls, L.opexHeads)).toBe(1);
    expect(waveOf(calls, L.opexChain)).toBe(2);
    expect(calls).toHaveLength(5);
  });

  it("UT-GENWAVE-OPT-003 old and new return identical inputs for several fixtures (no bridge, no allocations)", async () => {
    for (const answers of [
      ANSWERS,
      { ...ANSWERS, [L.bridges]: [] },
      { ...ANSWERS, [L.allocRows]: [] },
      { ...ANSWERS, [L.opexHeads]: [] },
    ]) {
      h.wave = createWaveClient((label) => answers[label] ?? []);
      setGeneratorsPerfFlags(GENERATORS_PERF_ALL_OFF);
      const before = (await h.wave.run(() => loadTypeDeleteInputs("00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002", ["00000000-0000-0000-0000-000000000004", "00000000-0000-0000-0000-000000000005"]))).value;
      setGeneratorsPerfFlags(null);
      const after = (await h.wave.run(() => loadTypeDeleteInputs("00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002", ["00000000-0000-0000-0000-000000000004", "00000000-0000-0000-0000-000000000005"]))).value;
      expect(after).toEqual(before);
    }
  });

  it("UT-GENWAVE-OPT-004 a failed read still fails the loader (and leaves no unhandled rejection)", async () => {
    h.wave = createWaveClient((label) => {
      if (label === L.opexHeads) throw new Error("read failed");
      return ANSWERS[label] ?? [];
    });
    await expect(h.wave.run(() => loadTypeDeleteInputs("00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002", ["00000000-0000-0000-0000-000000000004"]))).rejects.toThrow("read failed");
  });
});

describe("OPT-15 S4-04: the PV type delete's inputs (loadPvDeleteInputs)", () => {
  it("UT-GENWAVE-OPT-005 OLD (switch off): 5 waves", async () => {
    setGeneratorsPerfFlags(GENERATORS_PERF_ALL_OFF);
    const { value, waves, calls } = await h.wave.run(() => loadPvDeleteInputs("00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000003"));
    expect(value).toEqual({ unitIds: ["00000000-0000-0000-0000-000000000004", "00000000-0000-0000-0000-000000000005"], ...EXPECTED_WTG });
    expect(waves).toBe(5);
    expect(waveOf(calls, L.turbines)).toBe(0);
    expect(waveOf(calls, L.bridges)).toBe(1);
    expect(waveOf(calls, L.opexHeads)).toBe(3);
  });

  it("UT-GENWAVE-OPT-006 NEW: 3 waves, the device-type read starts with the unit read; the same result", async () => {
    const { value, waves, calls } = await h.wave.run(() => loadPvDeleteInputs("00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000003"));
    expect(value).toEqual({ unitIds: ["00000000-0000-0000-0000-000000000004", "00000000-0000-0000-0000-000000000005"], ...EXPECTED_WTG });
    expect(waves).toBe(3);
    expect(waveOf(calls, L.turbines)).toBe(0);
    expect(waveOf(calls, L.bridges)).toBe(0);
    expect(waveOf(calls, L.allocRows)).toBe(1);
    expect(waveOf(calls, L.opexHeads)).toBe(1);
    expect(waveOf(calls, L.allocCount)).toBe(2);
    expect(waveOf(calls, L.opexChain)).toBe(2);
  });

  it("UT-GENWAVE-OPT-007 a PV type with no unit reads no allocations at all (as before)", async () => {
    h.wave = createWaveClient((label) => (label === L.turbines ? [] : ANSWERS[label] ?? []));
    const { value, calls } = await h.wave.run(() => loadPvDeleteInputs("00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000003"));
    expect(value.unitIds).toEqual([]);
    expect(value.allocations).toEqual([]);
    expect(value.opexCostIds).toEqual(["00000000-0000-0000-0000-000000000013", "00000000-0000-0000-0000-000000000014", "00000000-0000-0000-0000-000000000015"]);
    expect(calls.filter((c) => c.label === L.allocRows || c.label === L.allocCount)).toHaveLength(0);
  });
});
