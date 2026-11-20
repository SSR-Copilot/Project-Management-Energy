/**
 * UT-GENPERF-200.. — the id-chunked reads of the Generators screen (D142): `GENERATORS_PERF.parallelChunks` (the chunks run
 * through the shared pool instead of one after another) and `GENERATORS_PERF.readsByProject` (the turbines read by the
 * project, not by the type ids). The generated services are replaced by recording fakes; `fetchAll`, `chunk` and `mapLimit`
 * are the real ones.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Query = { select?: string[]; filter?: string; maxPageSize?: number };

const { h, fake } = vi.hoisted(() => {
  const h = {
    /** Every call of every faked service, in the order it started. */
    started: [] as { service: string; query: Query }[],
    /** The answer a service gives for a query (default: no rows). */
    answer: (_service: string, _query: Query): unknown[] | Promise<unknown[]> => [],
    inFlight: 0,
    peak: 0,
  };
  const fake = (service: string) => ({
    getAll: async (query: Query) => {
      h.started.push({ service, query });
      h.inFlight += 1;
      h.peak = Math.max(h.peak, h.inFlight);
      try {
        const data = await h.answer(service, query);
        return { success: true, data };
      } finally {
        h.inFlight -= 1;
      }
    },
  });
  return { h, fake };
});
vi.mock("@/generated/services/Vsb_generatorsService", () => ({ Vsb_generatorsService: fake("generators") }));
vi.mock("@/generated/services/Vsb_generatorinprojectsService", () => ({ Vsb_generatorinprojectsService: fake("turbines") }));
vi.mock("@/generated/services/Vsb_invertersService", () => ({ Vsb_invertersService: fake("inverters") }));
vi.mock("@/generated/services/Vsb_invertertypeinprojectsService", () => ({ Vsb_invertertypeinprojectsService: fake("inverterTypes") }));
vi.mock("@/generated/services/Vsb_landleaseallocationwtgsService", () => ({ Vsb_landleaseallocationwtgsService: fake("allocations") }));

import { setGeneratorsPerfFlags } from "./generatorsPerfFlags";
import {
  GENERATORS_READ_CONCURRENCY, TURBINES_BY_PROJECT_NAVIGATION, listGeneratorsByIds, listInverterTypes, listProjectTurbines,
  listProjectTurbinesByProject, loadTurbineAllocations, turbinesByProjectFilter,
} from "./generators";
import { CHUNK } from "./odata";

const PROJECT = "11111111-1111-1111-1111-111111111111";
const guidOf = (n: number): string => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ids = (count: number, from = 1): string[] => Array.from({ length: count }, (_, i) => guidOf(from + i));
/** The ids a query's filter names, in the order they appear. */
const idsIn = (filter: string | undefined): string[] => filter?.match(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/g) ?? [];
const turbineRow = (id: string, typeId: string, name = "WTG_1") => ({
  vsb_generatorinprojectid: id, vsb_name: name, _vsb_moduletypeinprojectid_value: typeId, vsb_effectivecapacity: 4.2, statecode: 0,
});

beforeEach(() => {
  h.started = []; h.inFlight = 0; h.peak = 0; h.answer = () => [];
});
afterEach(() => setGeneratorsPerfFlags(null));

const BOTH = [true, false] as const;

describe("parallelChunks: the same rows in the same order, whichever way the chunks run", () => {
  for (const parallel of BOTH) {
    it(`UT-GENPERF-200 listProjectTurbines, ${parallel ? "ON" : "OFF"}: 90 types are 3 chunks of 40, 40, 10, rows in chunk order`, async () => {
      setGeneratorsPerfFlags({ parallelChunks: parallel });
      // The LATER chunks answer first, so a result built in completion order would be reversed.
      h.answer = async (_s, q) => {
        const first = idsIn(q.filter)[0]!;
        await new Promise((r) => setTimeout(r, first === guidOf(1) ? 30 : first === guidOf(41) ? 15 : 1));
        return idsIn(q.filter).map((t) => turbineRow(`t-${t}`, t));
      };
      const rows = await listProjectTurbines(ids(90));
      expect(h.started.map((c) => idsIn(c.query.filter).length).sort((a, b) => b - a)).toEqual([40, 40, 10]);
      expect(rows.map((r) => r.typeId)).toEqual(ids(90));
      expect(rows[0]).toMatchObject({ id: `t-${guidOf(1)}`, typeId: guidOf(1), effectiveCapacity: 4.2, status: 0 });
    });

    it(`UT-GENPERF-201 listGeneratorsByIds, ${parallel ? "ON" : "OFF"}: de-duplicated, chunked at ${CHUNK}, rows in chunk order`, async () => {
      setGeneratorsPerfFlags({ parallelChunks: parallel });
      h.answer = async (_s, q) => {
        await new Promise((r) => setTimeout(r, idsIn(q.filter)[0] === guidOf(1) ? 20 : 1));
        return idsIn(q.filter).map((g) => ({ vsb_generatorid: g, vsb_displayname: `Model ${g.slice(-2)}` }));
      };
      const input = [...ids(45), ...ids(5)];
      const models = await listGeneratorsByIds(input);
      expect(h.started).toHaveLength(2);
      expect(models.map((m) => m.id)).toEqual(ids(45));
    });
  }

  it("UT-GENPERF-202 ON: the chunks overlap, up to the pool width and no further", async () => {
    setGeneratorsPerfFlags({ parallelChunks: true });
    h.answer = async () => { await new Promise((r) => setTimeout(r, 10)); return []; };
    await listProjectTurbines(ids(CHUNK * 9));
    expect(h.started).toHaveLength(9);
    expect(GENERATORS_READ_CONCURRENCY).toBe(4);
    expect(h.peak).toBe(GENERATORS_READ_CONCURRENCY);
  });

  it("UT-GENPERF-203 OFF: one chunk at a time, as before", async () => {
    setGeneratorsPerfFlags({ parallelChunks: false });
    h.answer = async () => { await new Promise((r) => setTimeout(r, 5)); return []; };
    await listProjectTurbines(ids(CHUNK * 5));
    expect(h.started).toHaveLength(5);
    expect(h.peak).toBe(1);
  });

  it("UT-GENPERF-204 ON: fewer chunks than the pool is as wide as the chunks (3 chunks, peak 3)", async () => {
    setGeneratorsPerfFlags({ parallelChunks: true });
    h.answer = async () => { await new Promise((r) => setTimeout(r, 10)); return []; };
    await listGeneratorsByIds(ids(CHUNK * 3));
    expect(h.peak).toBe(3);
  });

  for (const parallel of BOTH) {
    it(`UT-GENPERF-205 a failed chunk fails the whole read, ${parallel ? "ON" : "OFF"}`, async () => {
      setGeneratorsPerfFlags({ parallelChunks: parallel });
      h.answer = async (_s, q) => {
        if (idsIn(q.filter)[0] === guidOf(CHUNK + 1)) throw new Error("second chunk refused");
        return idsIn(q.filter).map((t) => turbineRow(`t-${t}`, t));
      };
      await expect(listProjectTurbines(ids(CHUNK * 3))).rejects.toThrow("second chunk refused");
    });
  }

  it("UT-GENPERF-206 OFF: after a failed chunk no later chunk is started (the serial loop's behaviour)", async () => {
    setGeneratorsPerfFlags({ parallelChunks: false });
    h.answer = async () => { throw new Error("refused"); };
    await expect(listProjectTurbines(ids(CHUNK * 3))).rejects.toThrow("refused");
    expect(h.started).toHaveLength(1);
  });

  it("UT-GENPERF-207 ON: a failure stops the chunks that have not started (more chunks than the pool is wide)", async () => {
    setGeneratorsPerfFlags({ parallelChunks: true });
    h.answer = async () => { await new Promise((r) => setTimeout(r, 5)); throw new Error("refused"); };
    await expect(listProjectTurbines(ids(CHUNK * 12))).rejects.toThrow("refused");
    expect(h.started.length).toBeLessThanOrEqual(GENERATORS_READ_CONCURRENCY);
  });

  for (const parallel of BOTH) {
    it(`UT-GENPERF-208 no ids: no request and no rows, ${parallel ? "ON" : "OFF"}`, async () => {
      setGeneratorsPerfFlags({ parallelChunks: parallel });
      expect(await listProjectTurbines([])).toEqual([]);
      expect(await listGeneratorsByIds([])).toEqual([]);
      expect(h.started).toHaveLength(0);
    });

    it(`UT-GENPERF-209 the catalogue suppliers of the inverter types are joined whichever way, ${parallel ? "ON" : "OFF"}`, async () => {
      setGeneratorsPerfFlags({ parallelChunks: parallel });
      const inverters = ids(85, 1000);
      h.answer = async (service, q) => {
        if (service === "inverterTypes") {
          return inverters.map((inv, i) => ({ vsb_invertertypeinprojectid: `it-${i}`, vsb_name: `IT${i}`, _vsb_inverter_value: inv, statecode: 0 }));
        }
        await new Promise((r) => setTimeout(r, idsIn(q.filter)[0] === inverters[0] ? 20 : 1));
        return idsIn(q.filter).map((id) => ({ vsb_inverterid: id, vsb_tier1supplier: `Supplier ${id.slice(-4)}` }));
      };
      const rows = await listInverterTypes(PROJECT);
      expect(h.started.filter((c) => c.service === "inverters")).toHaveLength(3);
      expect(rows).toHaveLength(85);
      expect(rows[0]!.catalogueSupplier).toBe(`Supplier ${inverters[0]!.slice(-4)}`);
      expect(rows[84]!.catalogueSupplier).toBe(`Supplier ${inverters[84]!.slice(-4)}`);
    });

    it(`UT-GENPERF-210 the turbines' allocations and the costs' counts are the same whichever way, ${parallel ? "ON" : "OFF"}`, async () => {
      setGeneratorsPerfFlags({ parallelChunks: parallel });
      const turbines = ids(50, 1);
      const costs = ids(3, 9000);
      h.answer = async (_s, q) => {
        const asked = idsIn(q.filter);
        if (q.select?.includes("_vsb_generatorinproject_value")) {
          // one allocation per turbine, cost = round robin
          return asked.map((t, i) => ({ vsb_landleaseallocationwtgid: `a-${t}`, _vsb_projectcost_value: costs[i % 3], _vsb_generatorinproject_value: t }));
        }
        return asked.flatMap((c) => [1, 2].map((n) => ({ vsb_landleaseallocationwtgid: `x-${c}-${n}`, _vsb_projectcost_value: c })));
      };
      const out = await loadTurbineAllocations(turbines);
      expect(out.allocations.map((a) => a.turbineId)).toEqual(turbines);
      expect(out.allocations).toHaveLength(50);
      expect(out.countByCost).toEqual({ [costs[0]!]: 2, [costs[1]!]: 2, [costs[2]!]: 2 });
    });
  }
});

describe("readsByProject: the turbines read by the project", () => {
  it("UT-GENPERF-220 one request filtered through the WTG type's project, with the same $select as the by-type read", async () => {
    h.answer = async () => [turbineRow("t1", guidOf(7), "WTG_3"), turbineRow("t2", guidOf(8), "WTG_10")];
    const byProject = await listProjectTurbinesByProject(PROJECT);
    expect(h.started).toHaveLength(1);
    const call = h.started[0]!;
    expect(call.query.filter).toBe(`${TURBINES_BY_PROJECT_NAVIGATION}/_vsb_project_value eq ${PROJECT}`);
    expect(call.query.filter).toBe(turbinesByProjectFilter(PROJECT));
    expect(call.query.filter).not.toContain(" or ");

    h.started = [];
    h.answer = async () => [turbineRow("t1", guidOf(7), "WTG_3"), turbineRow("t2", guidOf(8), "WTG_10")];
    const byType = await listProjectTurbines([guidOf(7), guidOf(8)]);
    expect(h.started[0]!.query.select).toEqual(call.query.select);
    expect(byProject).toEqual(byType);
    expect(byProject.map((t) => t.index)).toEqual([3, 10]);
  });

  it("UT-GENPERF-221 an id that is not a GUID is refused before any request", async () => {
    await expect(listProjectTurbinesByProject("not-a-guid")).rejects.toThrow();
    expect(h.started).toHaveLength(0);
  });

  it("UT-GENPERF-222 the read pages through fetchAll: a refused request fails the read", async () => {
    h.answer = async () => { throw new Error("The query filter is not valid"); };
    await expect(listProjectTurbinesByProject(PROJECT)).rejects.toThrow("The query filter is not valid");
  });

  it("UT-GENPERF-223 the switch ships OFF and the by-type read is untouched by the new one", async () => {
    const { GENERATORS_PERF } = await import("./generatorsPerfFlags");
    expect(GENERATORS_PERF.readsByProject).toBe(false);
    h.answer = async () => [];
    await listProjectTurbines([guidOf(1)]);
    expect(h.started[0]!.query.filter).toBe(`_vsb_moduletypeinprojectid_value eq ${guidOf(1)}`);
  });
});
