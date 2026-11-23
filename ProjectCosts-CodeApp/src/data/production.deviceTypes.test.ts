/**
 * UT-PROD-OPT-0xx — `listDeviceTypesOf` (OPT-07e): the device types of all a project's types in one request per 40 ids.
 * BEFORE (unmodified tree): `loadGenerationInputs` ran `Promise.all(typeIds.map(listDeviceTypes))`: one request per type, so 3
 * types = 3 requests, 45 types = 45 requests at once. The per-type read is the ORACLE below: same rows, same order.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  reads: [] as { filter: string; select: unknown; orderBy: unknown }[],
  rows: [] as { id: string; type: string; status: number }[],
}));

/** A fake server: filters on the type ids in the filter text and honours `createdon asc` (insertion order = creation order). */
vi.mock("./client", () => ({
  fetchAll: async (_label: string, _page: unknown, o: { filter: string; select: unknown; orderBy: unknown }) => {
    h.reads.push({ filter: o.filter, select: o.select, orderBy: o.orderBy });
    const wanted = new Set([...o.filter.matchAll(/eq ([0-9a-f-]{36})/g)].map((m) => m[1]));
    return h.rows.filter((r) => wanted.has(r.type)).map((r) => ({
      vsb_devicetypesinprojectid: r.id, _vsb_typeinprojectid_value: r.type, statecode: r.status,
    }));
  },
  fetchPage: async () => [],
}));

import { listDeviceTypesOf } from "./production";

const g = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

/** The pre-OPT-07e result: each type read on its own (`listDeviceTypes`: `createdon asc`, any status), flattened in type order. */
const oracle = (typeIds: string[]) => typeIds.flatMap((t) => h.rows.filter((r) => r.type === t).map((r) => ({ id: r.id })));

beforeEach(() => {
  h.reads = [];
  h.rows = [
    { id: "d1", type: g(1), status: 0 }, { id: "d2", type: g(2), status: 0 }, { id: "d3", type: g(1), status: 1 },
    { id: "d4", type: g(3), status: 0 }, { id: "d5", type: g(2), status: 0 },
  ];
});

describe("listDeviceTypesOf (OPT-07e)", () => {
  it("UT-PROD-OPT-001 three types = one request (BEFORE: three), with the select and the createdon order", async () => {
    const ids = [g(1), g(2), g(3)];
    const rows = await listDeviceTypesOf(ids);
    expect(h.reads).toHaveLength(1);
    expect(h.reads[0]!.orderBy).toEqual(["createdon asc"]);
    expect(h.reads[0]!.select).toEqual(["vsb_devicetypesinprojectid", "_vsb_typeinprojectid_value"]);
    expect(rows).toEqual(oracle(ids));
    expect(rows.map((r) => r.id)).toEqual(["d1", "d3", "d2", "d5", "d4"]);
  });

  it("UT-PROD-OPT-002 DIFFERENTIAL: the order follows typeIds, not the table order, for every permutation; inactive rows are kept; an unknown type adds nothing", async () => {
    const ids = [g(1), g(2), g(3), g(99)];
    for (const perm of [[0, 1, 2, 3], [2, 1, 0, 3], [1, 3, 0, 2], [3, 2, 1, 0]]) {
      const typeIds = perm.map((i) => ids[i]!);
      expect(await listDeviceTypesOf(typeIds)).toEqual(oracle(typeIds));
    }
  });

  it("UT-PROD-OPT-003 more than 40 types are read in chunks of 40 (3 requests for 100 types, BEFORE: 100), in order", async () => {
    h.rows = Array.from({ length: 100 }, (_, i) => ({ id: `d${i}`, type: g(i + 1), status: 0 }));
    const ids = Array.from({ length: 100 }, (_, i) => g(100 - i));
    const rows = await listDeviceTypesOf(ids);
    expect(h.reads).toHaveLength(3);
    expect(rows).toEqual(oracle(ids));
  });

  it("UT-PROD-OPT-004 no types, no request; a repeated id keeps both copies as the per-type reads did", async () => {
    expect(await listDeviceTypesOf([])).toEqual([]);
    expect(h.reads).toHaveLength(0);
    expect(await listDeviceTypesOf([g(1), g(1)])).toEqual(oracle([g(1), g(1)]));
  });
});
