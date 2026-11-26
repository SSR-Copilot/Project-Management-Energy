/**
 * UT-TYPELEAN — PA-10 (dvopt T-22, `GENERATORS_PERF.typeReadsLean`): the reads that only need ids select only what they use.
 *
 *  - Production's pre-write reads (`loadGenerationInputs`): the WTG and PV types by id, the turbines by id and name. Same filters, same
 *    order, same chunking; the result is identical to the full-list path (the oracle, switch OFF). The reads stay live (OPT-24).
 *  - Finance's `countActiveTurbines`: reuses a list of type ids the caller already holds (the warm-up's cached list), else reads the ids alone.
 *
 * Only the client edge is faked (`fetchAll` / `fetchPage` answer by the label of the read and record its `$select`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  reads: [] as { label: string; select: string[]; filter?: string; orderBy?: string[] }[],
  noTypes: false,
}));

const g = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const WTG = [g(11), g(12)];
const PV = [g(21)];

/** A fake server: each read returns the full row (every column), then trims it to the `$select` it was sent, as the server does. */
vi.mock("./client", () => {
  const trim = (rows: Record<string, unknown>[], select: string[]) => rows.map((r) => Object.fromEntries(select.filter((c) => c in r).map((c) => [c, r[c]])));
  return {
    fetchAll: async (label: string, _page: unknown, o: { select: string[]; filter?: string; orderBy?: string[] }) => {
      h.reads.push({ label, select: o.select, filter: o.filter, orderBy: o.orderBy });
      if (h.noTypes && label.includes("type") && !label.includes("turbines")) return [];
      if (label === "count the project's active turbines") {
        return [...String(o.filter).matchAll(/eq ([0-9a-f-]{36})/g)].map((m) => ({ vsb_generatorinprojectid: m[1] }));
      }
      if (label.startsWith("load the project's generator type")) {
        return trim(WTG.map((id, i) => ({
          vsb_generatortypeinprojectid: id, vsb_name: `Type ${i}`, _vsb_generator_value: g(900 + i),
          "_vsb_generator_value@OData.Community.Display.V1.FormattedValue": "Model", vsb_numberofgenerators: 3, statecode: 0, createdon: "2026-01-01",
        })), o.select);
      }
      if (label.startsWith("load the project's PV module type")) {
        return trim(PV.map((id) => ({ vsb_pvmoduletypeinprojectid: id, vsb_name: "PV", vsb_label: "L", vsb_capacity: 5, statecode: 0 })), o.select);
      }
      if (label === "load the project's turbines") {
        const wanted = [...String(o.filter).matchAll(/eq ([0-9a-f-]{36})/g)].map((m) => m[1]!);
        return trim(wanted.flatMap((t, i) => [{
          vsb_generatorinprojectid: g(500 + i + Number(t.slice(-2))), vsb_name: `WTG-${t.slice(-2)}`, _vsb_moduletypeinprojectid_value: t,
          vsb_effectivecapacity: 4, statecode: 0,
        }]), o.select);
      }
      return [];
    },
    fetchPage: async () => [],
  };
});

import { loadGenerationInputs } from "./production";
import { countActiveTurbines } from "./finance";
import { setGeneratorsPerfFlags } from "./generatorsPerfFlags";
import type { ProductionProject } from "@/features/pm/production/rules";

const project = (): ProductionProject => ({
  id: g(1), projectIdText: "DE-0001", projectName: "Nord", countryId: null, countryName: null, technology: null,
  totalCapacity: 1, endDate: null, cod: null, plantPvCapacity: 0, grossYield: 0, windSpeed: 0, irradiation: null,
  netYieldP50: 0, netYieldP75: 0, netYieldP90: 0, standardCostCreated: false, owningBusinessUnitId: g(7),
} as ProductionProject);

beforeEach(() => { h.reads = []; h.noTypes = false; });
afterEach(() => setGeneratorsPerfFlags(null));

describe("Production's pre-write reads select only ids (PA-10)", () => {
  it("UT-TYPELEAN-001 ON: the types are read by id alone and the turbines by id and name; same filters and orders as the full reads", async () => {
    await loadGenerationInputs(project());
    const byLabel = (l: string) => h.reads.find((r) => r.label === l)!;
    expect(byLabel("load the project's generator type ids").select).toEqual(["vsb_generatortypeinprojectid"]);
    expect(byLabel("load the project's generator type ids").orderBy).toEqual(["createdon asc"]);
    expect(byLabel("load the project's PV module type ids").select).toEqual(["vsb_pvmoduletypeinprojectid"]);
    expect(byLabel("load the project's PV module type ids").orderBy).toEqual(["createdon asc", "vsb_name asc"]);
    expect(byLabel("load the project's turbines").select).toEqual(["vsb_generatorinprojectid", "vsb_name"]);
  });

  it("UT-TYPELEAN-002 DIFFERENTIAL: the generation inputs are identical with the switch on and off, and the request count is unchanged", async () => {
    setGeneratorsPerfFlags({ typeReadsLean: false });
    const oracle = await loadGenerationInputs(project());
    const oracleReads = h.reads.map((r) => r.filter ?? "").sort();
    expect(h.reads.find((r) => r.label === "load the project's generator types")!.select.length).toBeGreaterThan(8);
    h.reads = [];
    setGeneratorsPerfFlags({ typeReadsLean: true });
    const lean = await loadGenerationInputs(project());
    expect(lean).toEqual(oracle);
    expect(oracle.generators).toHaveLength(3);
    expect(h.reads.map((r) => r.filter ?? "").sort()).toEqual(oracleReads);
  });

  it("UT-TYPELEAN-003 a project with no types sends no turbine read (as before)", async () => {
    h.noTypes = true;
    setGeneratorsPerfFlags({ typeReadsLean: true });
    const out = await loadGenerationInputs(project());
    expect(out.generators).toEqual([]);
    expect(h.reads.some((r) => r.label === "load the project's turbines")).toBe(false);
  });
});

describe("Finance's turbine count (PA-10)", () => {
  it("UT-TYPELEAN-010 with a list of type ids from the caller (the warm-up's cache) no type read is sent at all", async () => {
    await countActiveTurbines(g(1), WTG);
    expect(h.reads.map((r) => r.label)).toEqual(["count the project's active turbines"]);
    expect(h.reads[0]!.filter).toContain(WTG[0]!);
    expect(h.reads[0]!.filter).toContain(WTG[1]!);
  });

  it("UT-TYPELEAN-011 without one, the ids alone are read (not the 12-column list)", async () => {
    await countActiveTurbines(g(1));
    expect(h.reads.map((r) => r.label)).toEqual(["load the project's generator type ids", "count the project's active turbines"]);
    expect(h.reads[0]!.select).toEqual(["vsb_generatortypeinprojectid"]);
  });

  it("UT-TYPELEAN-012 OFF: the full type list is read and a cached list is ignored, as before", async () => {
    setGeneratorsPerfFlags({ typeReadsLean: false });
    await countActiveTurbines(g(1), WTG);
    expect(h.reads.map((r) => r.label)).toEqual(["load the project's generator types", "count the project's active turbines"]);
  });

  it("UT-TYPELEAN-013 the count is the same from the cached ids, the id read and the full read; an empty cached list is 0 with no read", async () => {
    const withCache = await countActiveTurbines(g(1), WTG);
    const idRead = await countActiveTurbines(g(1));
    setGeneratorsPerfFlags({ typeReadsLean: false });
    const full = await countActiveTurbines(g(1));
    expect([withCache, idRead]).toEqual([full, full]);
    h.reads = [];
    setGeneratorsPerfFlags({ typeReadsLean: true });
    expect(await countActiveTurbines(g(1), [])).toBe(0);
    expect(h.reads).toEqual([]);
  });
});
