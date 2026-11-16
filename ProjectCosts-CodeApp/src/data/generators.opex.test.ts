import { beforeEach, describe, expect, it, vi } from "vitest";

const opexGetAll = vi.fn();
const bridgeGetAll = vi.fn();
vi.mock("@/generated/services/Vsb_opexprojectcostsService", () => ({ Vsb_opexprojectcostsService: { getAll: (o: unknown) => opexGetAll(o) } }));
vi.mock("@/generated/services/Vsb_devicetypesinprojectsService", () => ({ Vsb_devicetypesinprojectsService: { getAll: (o: unknown) => bridgeGetAll(o) } }));

import { listOpexCostIds, listOpexCostIdsForBridges, loadOpexDependency } from "./generators";
import { ACTIVE, and, lookupEq, lookupIn } from "./odata";

const PROJECT = "11111111-1111-1111-1111-111111111111";
const guidOf = (n: number): string => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ok = (data: unknown[]) => ({ success: true, data });
const cost = (id: string, parent?: string) => ({ vsb_opexprojectcostid: id, ...(parent ? { _vsb_parentcost_value: parent } : {}) });
type Query = { select?: string[]; filter?: string; top?: number };
const opexCalls = (): Query[] => opexGetAll.mock.calls.map((c) => c[0] as Query);

beforeEach(() => { opexGetAll.mockReset(); bridgeGetAll.mockReset(); });

describe("listOpexCostIdsForBridges (DEL-3)", () => {
  it("UT-GENDATA-OPEX-001 One bridge: reads its costs, then the chain members of those heads", async () => {
    const [b1, h1, h2, c1] = [guidOf(1), guidOf(2), guidOf(3), guidOf(4)];
    opexGetAll.mockResolvedValueOnce(ok([cost(h1), cost(h2)])).mockResolvedValueOnce(ok([cost(c1, h1)]));
    expect(await listOpexCostIdsForBridges(PROJECT, [b1])).toEqual([h1, h2, c1]);
    expect(opexGetAll).toHaveBeenCalledTimes(2);
  });

  it("UT-GENDATA-OPEX-002 Two bridges: one OR filter over both, project-scoped, any status", async () => {
    const [b1, b2, h1, h2] = [guidOf(1), guidOf(2), guidOf(3), guidOf(4)];
    opexGetAll.mockResolvedValueOnce(ok([cost(h1), cost(h2)])).mockResolvedValueOnce(ok([]));
    expect(await listOpexCostIdsForBridges(PROJECT, [b1, b2])).toEqual([h1, h2]);
    const first = opexCalls()[0]!;
    expect(first.filter).toBe(and(lookupEq("vsb_project", PROJECT), lookupIn("vsb_devicetypeinproject", [b1, b2])));
    expect(first.filter).not.toContain("statecode");
    expect(first.filter).toContain(`_vsb_devicetypeinproject_value eq ${b1}`);
    expect(first.filter).toContain(`_vsb_devicetypeinproject_value eq ${b2}`);
  });

  it("UT-GENDATA-OPEX-003 Zero bridges: no read, no ids", async () => {
    expect(await listOpexCostIdsForBridges(PROJECT, [])).toEqual([]);
    expect(opexGetAll).not.toHaveBeenCalled();
  });

  it("UT-GENDATA-OPEX-004 A bridge with no costs reads the heads once and never the chains", async () => {
    opexGetAll.mockResolvedValueOnce(ok([]));
    expect(await listOpexCostIdsForBridges(PROJECT, [guidOf(1)])).toEqual([]);
    expect(opexGetAll).toHaveBeenCalledTimes(1);
  });

  it("UT-GENDATA-OPEX-005 41 bridges are filtered in chunks of at most 40", async () => {
    const bridges = Array.from({ length: 41 }, (_, i) => guidOf(i + 1));
    opexGetAll.mockResolvedValue(ok([]));
    await listOpexCostIdsForBridges(PROJECT, bridges);
    const calls = opexCalls();
    expect(calls).toHaveLength(2);
    expect(calls[0]!.filter).toBe(and(lookupEq("vsb_project", PROJECT), lookupIn("vsb_devicetypeinproject", bridges.slice(0, 40))));
    expect(calls[1]!.filter).toBe(and(lookupEq("vsb_project", PROJECT), lookupIn("vsb_devicetypeinproject", bridges.slice(40))));
    for (const q of calls) expect((q.filter ?? "").match(/_vsb_devicetypeinproject_value eq/g)!.length).toBeLessThanOrEqual(40);
  });

  it("UT-GENDATA-OPEX-006 More than 40 heads: the chain read is chunked too", async () => {
    const heads = Array.from({ length: 41 }, (_, i) => guidOf(100 + i));
    opexGetAll.mockResolvedValueOnce(ok(heads.map((h) => cost(h)))).mockResolvedValue(ok([]));
    expect(await listOpexCostIdsForBridges(PROJECT, [guidOf(1)])).toEqual(heads);
    const chains = opexCalls().slice(1);
    expect(chains).toHaveLength(2);
    expect(chains[0]!.filter).toBe(and(lookupEq("vsb_project", PROJECT), lookupIn("vsb_parentcost", heads.slice(0, 40))));
    expect(chains[1]!.filter).toBe(and(lookupEq("vsb_project", PROJECT), lookupIn("vsb_parentcost", heads.slice(40))));
  });

  it("UT-GENDATA-OPEX-007 Chain members of a found head are added after the heads", async () => {
    const [h1, p2, p3] = [guidOf(10), guidOf(11), guidOf(12)];
    opexGetAll.mockResolvedValueOnce(ok([cost(h1)])).mockResolvedValueOnce(ok([cost(p2, h1), cost(p3, h1)]));
    expect(await listOpexCostIdsForBridges(PROJECT, [guidOf(1)])).toEqual([h1, p2, p3]);
    expect(opexCalls()[1]!.filter).toBe(and(lookupEq("vsb_project", PROJECT), lookupIn("vsb_parentcost", [h1])));
  });

  it("UT-GENDATA-OPEX-008 Ids are de-duplicated: a member that is also a head, a repeated bridge, a repeated row", async () => {
    const [b1, h1, p2] = [guidOf(1), guidOf(10), guidOf(11)];
    opexGetAll.mockResolvedValueOnce(ok([cost(h1), cost(p2, h1), cost(h1)])).mockResolvedValueOnce(ok([cost(p2, h1)]));
    expect(await listOpexCostIdsForBridges(PROJECT, [b1, b1])).toEqual([h1, p2]);
    expect(opexCalls()[0]!.filter).toBe(and(lookupEq("vsb_project", PROJECT), lookupIn("vsb_devicetypeinproject", [b1])));
  });

  it("UT-GENDATA-OPEX-009 Every read names its $select columns (id and parent only)", async () => {
    opexGetAll.mockResolvedValueOnce(ok([cost(guidOf(10))])).mockResolvedValueOnce(ok([]));
    await listOpexCostIdsForBridges(PROJECT, [guidOf(1)]);
    for (const q of opexCalls()) {
      expect(q.select).toEqual(["vsb_opexprojectcostid", "_vsb_parentcost_value"]);
      expect(q.top).toBeUndefined();
    }
  });

  it("UT-GENDATA-OPEX-010 A failed head read throws (no silent empty list)", async () => {
    opexGetAll.mockResolvedValueOnce({ success: false, error: { message: "boom", status: 500 } });
    await expect(listOpexCostIdsForBridges(PROJECT, [guidOf(1)])).rejects.toThrow(/O&M costs.*failed/);
  });

  it("UT-GENDATA-OPEX-011 A failed chain read throws, the heads are not returned alone", async () => {
    opexGetAll.mockResolvedValueOnce(ok([cost(guidOf(10))])).mockResolvedValueOnce({ success: false, error: { message: "429", status: 429 } });
    await expect(listOpexCostIdsForBridges(PROJECT, [guidOf(1)])).rejects.toThrow(/chains.*failed/);
  });

  it("UT-GENDATA-OPEX-012 listOpexCostIds (first bridge) is unchanged", async () => {
    opexGetAll.mockResolvedValueOnce(ok([cost(guidOf(10))]));
    expect(await listOpexCostIds(PROJECT, guidOf(1))).toEqual([guidOf(10)]);
    expect(opexCalls()[0]!.filter).toBe(and(lookupEq("vsb_project", PROJECT), lookupEq("vsb_devicetypeinproject", guidOf(1))));
  });
});

describe("loadOpexDependency (DEL-3: any active bridge)", () => {
  const bridges = (rows: { id: string; state: number }[]) =>
    bridgeGetAll.mockResolvedValueOnce(ok(rows.map((r) => ({ vsb_devicetypesinprojectid: r.id, statecode: r.state }))));

  it("UT-GENDATA-OPEX-013 No active bridge: no dependency and no cost read", async () => {
    bridges([{ id: guidOf(1), state: 1 }]);
    expect(await loadOpexDependency(PROJECT, guidOf(9))).toEqual({ hasActiveDeviceType: false, hasActiveOpexCost: false });
    expect(opexGetAll).not.toHaveBeenCalled();
  });

  it("UT-GENDATA-OPEX-014 Zero bridges: no dependency", async () => {
    bridges([]);
    expect(await loadOpexDependency(PROJECT, guidOf(9))).toEqual({ hasActiveDeviceType: false, hasActiveOpexCost: false });
  });

  it("UT-GENDATA-OPEX-015 A dependency on the SECOND active bridge is reported, in one active-only read over every active bridge", async () => {
    const [b1, b2, b3] = [guidOf(1), guidOf(2), guidOf(3)];
    bridges([{ id: b1, state: 0 }, { id: b2, state: 0 }, { id: b3, state: 1 }]);
    opexGetAll.mockResolvedValueOnce(ok([cost(guidOf(20))]));
    expect(await loadOpexDependency(PROJECT, guidOf(9))).toEqual({ hasActiveDeviceType: true, hasActiveOpexCost: true });
    const q = opexCalls()[0]!;
    expect(q.filter).toBe(and(lookupEq("vsb_project", PROJECT), lookupIn("vsb_devicetypeinproject", [b1, b2]), ACTIVE));
    expect(q.filter).not.toContain(b3);
    expect(q.top).toBe(1);
    expect(q.select).toEqual(["vsb_opexprojectcostid"]);
  });

  it("UT-GENDATA-OPEX-016 Active bridges but no active cost: bridge reported, no cost dependency", async () => {
    bridges([{ id: guidOf(1), state: 0 }, { id: guidOf(2), state: 0 }]);
    opexGetAll.mockResolvedValueOnce(ok([]));
    expect(await loadOpexDependency(PROJECT, guidOf(9))).toEqual({ hasActiveDeviceType: true, hasActiveOpexCost: false });
  });

  it("UT-GENDATA-OPEX-017 41 active bridges are checked in chunks of 40, stopping at the first hit", async () => {
    const ids = Array.from({ length: 41 }, (_, i) => guidOf(i + 1));
    bridges(ids.map((id) => ({ id, state: 0 })));
    opexGetAll.mockResolvedValueOnce(ok([])).mockResolvedValueOnce(ok([cost(guidOf(99))]));
    expect((await loadOpexDependency(PROJECT, guidOf(9))).hasActiveOpexCost).toBe(true);
    expect(opexGetAll).toHaveBeenCalledTimes(2);
  });

  it("UT-GENDATA-OPEX-018 A failed cost read throws instead of reporting no dependency", async () => {
    bridges([{ id: guidOf(1), state: 0 }]);
    opexGetAll.mockResolvedValueOnce({ success: false, error: { message: "boom", status: 500 } });
    await expect(loadOpexDependency(PROJECT, guidOf(9))).rejects.toThrow(/failed/);
  });
});

describe("listOpexCostIdsForBridges: bounded reads (review F3 item 5)", () => {
  it("UT-GENDATA-OPEX-100 1,000 bridge ids never have more than 4 reads in flight, and every id is read", async () => {
    const bridges = Array.from({ length: 1000 }, (_, i) => guidOf(i + 1));
    let inFlight = 0;
    let peak = 0;
    opexGetAll.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => { setTimeout(r, 2); });
      inFlight -= 1;
      return ok([]);
    });
    await listOpexCostIdsForBridges(PROJECT, bridges);
    expect(opexGetAll).toHaveBeenCalledTimes(25);
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
  });

  it("UT-GENDATA-OPEX-101 the chain-member reads are bounded too, and the ids keep their chunk order", async () => {
    const heads = Array.from({ length: 400 }, (_, i) => guidOf(1000 + i));
    const members = Array.from({ length: 400 }, (_, i) => guidOf(5000 + i));
    let inFlight = 0;
    let peak = 0;
    opexGetAll.mockImplementation(async (o: unknown) => {
      const filter = String((o as Query).filter);
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      // Later chunks answer first, so a pool that did not keep input order would be caught.
      await new Promise((r) => { setTimeout(r, filter.includes("_vsb_parentcost_value") ? 1 : 2); });
      inFlight -= 1;
      if (filter.includes("_vsb_devicetypeinproject_value")) return ok(heads.map((h) => cost(h)));
      const part = members.filter((_m, i) => filter.includes(heads[i]!));
      return ok(part.map((m, i) => cost(m, heads[i])));
    });
    const ids = await listOpexCostIdsForBridges(PROJECT, [guidOf(1)]);
    expect(peak).toBeLessThanOrEqual(4);
    expect(ids.slice(0, 400)).toEqual(heads);
    expect(ids.slice(400)).toEqual(members);
    expect(opexGetAll).toHaveBeenCalledTimes(1 + 10);
  });
});
