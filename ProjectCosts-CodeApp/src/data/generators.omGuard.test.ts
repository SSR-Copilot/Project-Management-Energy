/**
 * UT-OMGUARD — PA-15 (dvopt T-22, `GENERATORS_PERF.omGuardOneRead`): a selected type's O&M guard is ONE read of the project's active
 * O&M costs filtered through the cost's device-type lookup, instead of the device-type read and then the O&M read.
 *
 * Differential: the two-read path (switch OFF, the old code) is the oracle over a fake Dataverse of random device-type rows and O&M
 * costs. The guard only uses `hasActiveDeviceType && hasActiveOpexCost` (`capacityGuardReason`), so that conjunction is what is compared.
 * The fake answers each read by evaluating the filter text it is sent, so a wrong filter shows up as a wrong answer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Bridge = { id: string; type: string; state: number };
type Cost = { id: string; bridge: string; state: number; project: string };
const world = vi.hoisted(() => ({
  bridges: [] as { id: string; type: string; state: number }[],
  costs: [] as { id: string; bridge: string; state: number; project: string }[],
  opexCalls: 0, bridgeCalls: 0, opexRefuses: false, opexFails: false, filters: [] as string[],
}));

const GUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const all = (text: string, re: string): string[] => [...text.matchAll(new RegExp(re, "gi"))].map((m) => m[1]!.toLowerCase());

vi.mock("@/generated/services/Vsb_devicetypesinprojectsService", () => ({
  Vsb_devicetypesinprojectsService: {
    getAll: async (o: { filter?: string }) => {
      world.bridgeCalls += 1;
      const type = all(o.filter ?? "", `_vsb_typeinprojectid_value eq (${GUID})`)[0];
      return { success: true, data: world.bridges.filter((b) => b.type === type).map((b) => ({ vsb_devicetypesinprojectid: b.id, statecode: b.state })) };
    },
  },
}));
vi.mock("@/generated/services/Vsb_opexprojectcostsService", () => ({
  Vsb_opexprojectcostsService: {
    getAll: async (o: { filter?: string; top?: number }) => {
      world.opexCalls += 1;
      const f = o.filter ?? "";
      world.filters.push(f);
      if (world.opexFails) return { success: false, error: { message: "boom", status: 500 } };
      if (world.opexRefuses && f.includes("vsb_DeviceTypeInProject/")) {
        return { success: false, error: { message: "Could not find a property named 'vsb_DeviceTypeInProject'", status: 400 } };
      }
      const project = all(f, `_vsb_project_value eq (${GUID})`)[0];
      const ownActive = /(?<![/\w])statecode eq 0/.test(f);
      const bridgeIds = all(f, `(?<!/)_vsb_devicetypeinproject_value eq (${GUID})`);
      const navType = all(f, `vsb_DeviceTypeInProject/_vsb_typeinprojectid_value eq (${GUID})`)[0];
      const navActive = f.includes("vsb_DeviceTypeInProject/statecode eq 0");
      let rows = world.costs.filter((c) => c.project === project && (!ownActive || c.state === 0));
      if (bridgeIds.length > 0) rows = rows.filter((c) => bridgeIds.includes(c.bridge));
      if (navType !== undefined) {
        rows = rows.filter((c) => {
          const b = world.bridges.find((x) => x.id === c.bridge);
          return b !== undefined && b.type === navType && (!navActive || b.state === 0);
        });
      }
      return { success: true, data: rows.slice(0, o.top ?? rows.length).map((c) => ({ vsb_opexprojectcostid: c.id })) };
    },
  },
}));

import { loadOpexDependency, opexOfTypeFilter } from "./generators";
import { setGeneratorsPerfFlags } from "./generatorsPerfFlags";

const guid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const P = guid(1000);
const T = guid(2000);

beforeEach(() => {
  world.bridges = []; world.costs = []; world.opexCalls = 0; world.bridgeCalls = 0;
  world.opexRefuses = false; world.opexFails = false; world.filters = [];
});
afterEach(() => setGeneratorsPerfFlags(null));

const guardOf = async (flag: boolean, type = T): Promise<boolean> => {
  setGeneratorsPerfFlags({ omGuardOneRead: flag });
  const dep = await loadOpexDependency(P, type);
  return dep.hasActiveDeviceType && dep.hasActiveOpexCost;
};

describe("the one-read O&M guard (PA-15)", () => {
  it("UT-OMGUARD-001 the filter: the project, an active cost, and the cost's bridge row active and of THIS type, in one read", () => {
    const f = opexOfTypeFilter(P, T);
    expect(f).toContain(`_vsb_project_value eq ${P}`);
    expect(f).toContain("statecode eq 0");
    expect(f).toContain(`vsb_DeviceTypeInProject/_vsb_typeinprojectid_value eq ${T}`);
    expect(f).toContain("vsb_DeviceTypeInProject/statecode eq 0");
  });

  it("UT-OMGUARD-002 ON: one request when a dependency exists; the old path took two", async () => {
    world.bridges = [{ id: guid(1), type: T, state: 0 }];
    world.costs = [{ id: guid(10), bridge: guid(1), state: 0, project: P }];
    expect(await guardOf(true)).toBe(true);
    expect([world.bridgeCalls, world.opexCalls]).toEqual([0, 1]);
    world.bridgeCalls = 0; world.opexCalls = 0;
    expect(await guardOf(false)).toBe(true);
    expect([world.bridgeCalls, world.opexCalls]).toEqual([1, 1]);
  });

  it("UT-OMGUARD-003 ON: no dependency is also one request (the old path: one with no active bridge, two otherwise)", async () => {
    world.bridges = [{ id: guid(1), type: T, state: 0 }];
    expect(await guardOf(true)).toBe(false);
    expect([world.bridgeCalls, world.opexCalls]).toEqual([0, 1]);
  });

  it("UT-OMGUARD-004 differential: 400 random worlds, the one-read guard equals the two-read guard", async () => {
    let seed = 20261125;
    const rnd = (n: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
    const types = [T, guid(2001), guid(2002)];
    for (let round = 0; round < 400; round += 1) {
      const bridges: Bridge[] = Array.from({ length: rnd(5) }, (_, i) => ({ id: guid(100 + i), type: types[rnd(3)]!, state: rnd(3) === 0 ? 1 : 0 }));
      const costs: Cost[] = Array.from({ length: rnd(7) }, (_, i) => ({
        id: guid(300 + i), bridge: bridges.length > 0 ? bridges[rnd(bridges.length)]!.id : guid(999),
        state: rnd(3) === 0 ? 1 : 0, project: rnd(4) === 0 ? guid(1001) : P,
      }));
      world.bridges = bridges; world.costs = costs;
      const oracle = await guardOf(false);
      const lean = await guardOf(true);
      expect(lean, `round ${round}: ${JSON.stringify({ bridges, costs })}`).toBe(oracle);
    }
  });

  it("UT-OMGUARD-005 an inactive bridge, an inactive cost, another type's bridge and another project's cost never count", async () => {
    world.bridges = [{ id: guid(1), type: T, state: 1 }, { id: guid(2), type: guid(2001), state: 0 }, { id: guid(3), type: T, state: 0 }];
    world.costs = [
      { id: guid(10), bridge: guid(1), state: 0, project: P }, // inactive bridge
      { id: guid(11), bridge: guid(2), state: 0, project: P }, // another type
      { id: guid(12), bridge: guid(3), state: 1, project: P }, // inactive cost
      { id: guid(13), bridge: guid(3), state: 0, project: guid(1001) }, // another project
    ];
    expect(await guardOf(true)).toBe(false);
    world.costs.push({ id: guid(14), bridge: guid(3), state: 0, project: P });
    expect(await guardOf(true)).toBe(true);
  });

  it("UT-OMGUARD-006 failure injection: a server that refuses the single read falls back to the two reads and gives the same answer", async () => {
    world.bridges = [{ id: guid(1), type: T, state: 0 }];
    world.costs = [{ id: guid(10), bridge: guid(1), state: 0, project: P }];
    world.opexRefuses = true;
    expect(await guardOf(true)).toBe(true);
    expect(world.bridgeCalls).toBe(1); // the fallback read the bridge rows
    expect(world.opexCalls).toBe(2); // the refused single read, then the old O&M read
    world.costs = [];
    expect(await guardOf(true)).toBe(false);
  });

  it("UT-OMGUARD-007 failure injection: when every read fails the guard read fails (it never reports `no dependency`)", async () => {
    world.bridges = [{ id: guid(1), type: T, state: 0 }];
    world.opexFails = true;
    setGeneratorsPerfFlags({ omGuardOneRead: true });
    await expect(loadOpexDependency(P, T)).rejects.toThrow(/failed/);
  });

  it("UT-OMGUARD-008 the shipped default is OFF (QA-03, until a DEV probe proves the filter): the old two-read guard runs", async () => {
    world.bridges = [{ id: guid(1), type: T, state: 0 }];
    world.costs = [{ id: guid(10), bridge: guid(1), state: 0, project: P }];
    setGeneratorsPerfFlags(null);
    const dep = await loadOpexDependency(P, T);
    expect(dep.hasActiveDeviceType && dep.hasActiveOpexCost).toBe(true);
    expect([world.bridgeCalls, world.opexCalls]).toEqual([1, 1]);
  });
});
