/**
 * UT-GENDATA-READ-001.. — the Generators screen's REAL read functions (`data/generators.ts`) against mocked generated services
 * (generators fix F8, GT-1 / GT-2 / GT-3). The screen tests mock `./hooks` and the hook tests mock this module, so until now
 * nothing ran these queries: their `$filter`, `$select`, chunking and row mapping. `fetchAll` / `fetchPage`, `odata.ts` and the
 * row mappers are the real ones; the seam is each generated service's `getAll`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const svc = vi.hoisted(() => ({
  fns: {} as Record<string, import("vitest").Mock<(o: unknown) => Promise<unknown>>>,
}));
const getAllOf = (name: string) => {
  svc.fns[name] ??= vi.fn<(o: unknown) => Promise<unknown>>();
  return svc.fns[name]!;
};
vi.mock("@/generated/services/Vsb_projectsService", () => ({ Vsb_projectsService: { getAll: (o: unknown) => getAllOf("projects")(o) } }));
vi.mock("@/generated/services/Vsb_countriesService", () => ({ Vsb_countriesService: { getAll: (o: unknown) => getAllOf("countries")(o) } }));
vi.mock("@/generated/services/Vsb_generatortypeinprojectsService", () => ({ Vsb_generatortypeinprojectsService: { getAll: (o: unknown) => getAllOf("types")(o) } }));
vi.mock("@/generated/services/Vsb_generatorinprojectsService", () => ({ Vsb_generatorinprojectsService: { getAll: (o: unknown) => getAllOf("turbines")(o) } }));
vi.mock("@/generated/services/Vsb_generatorsService", () => ({ Vsb_generatorsService: { getAll: (o: unknown) => getAllOf("generators")(o) } }));
vi.mock("@/generated/services/Vsb_devicecostsService", () => ({ Vsb_devicecostsService: { getAll: (o: unknown) => getAllOf("deviceCosts")(o) } }));
vi.mock("@/generated/services/Vsb_devicetypesinprojectsService", () => ({ Vsb_devicetypesinprojectsService: { getAll: (o: unknown) => getAllOf("bridges")(o) } }));
vi.mock("@/generated/services/Vsb_opexprojectcostsService", () => ({ Vsb_opexprojectcostsService: { getAll: (o: unknown) => getAllOf("opex")(o) } }));
vi.mock("@/generated/services/Vsb_landleaseallocationwtgsService", () => ({ Vsb_landleaseallocationwtgsService: { getAll: (o: unknown) => getAllOf("allocations")(o) } }));
vi.mock("@/generated/services/Vsb_landleaseprojectcostsService", () => ({ Vsb_landleaseprojectcostsService: { getAll: (o: unknown) => getAllOf("llCosts")(o) } }));
vi.mock("@/generated/services/Vsb_storagetypeinprojectsService", () => ({ Vsb_storagetypeinprojectsService: { getAll: (o: unknown) => getAllOf("storage")(o) } }));
vi.mock("@/generated/services/Vsb_pvmoduletypeinprojectsService", () => ({ Vsb_pvmoduletypeinprojectsService: { getAll: (o: unknown) => getAllOf("pv")(o) } }));

import {
  listAllWtgLandLeaseCosts, listGeneratorTypes, listGeneratorsByIds, listProjectTurbines, listPvTypes, listSimpleTypes,
  loadDeviceCosts, loadGeneratorsProject, loadTurbineAllocations,
} from "./generators";

const PROJECT = "11111111-1111-1111-1111-111111111111";
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ok = (data: unknown[]) => ({ success: true, data });
type Query = { select?: string[]; filter?: string; orderBy?: string[]; top?: number };
const queries = (name: string): Query[] => getAllOf(name).mock.calls.map((c) => c[0] as Query);
const countOf = (text: string | undefined, needle: string): number => (text ?? "").split(needle).length - 1;

beforeEach(() => { for (const f of Object.values(svc.fns)) f.mockReset(); });

describe("the project and the types", () => {
  it("UT-GENDATA-READ-001 loadGeneratorsProject reads one row by id, then its country, and maps the roll-ups", async () => {
    getAllOf("projects").mockResolvedValueOnce(ok([{
      vsb_projectid: PROJECT, vsb_name: "DE-0001", vsb_projectname: "Nord", vsb_shortname: "WPN", _vsb_country_value: id(9),
      vsb_totalcapacity: 30.5, vsb_fid: "2028-06-01", _owningbusinessunit_value: id(5), vsb_plantwtgcapacity: 20,
    }]));
    getAllOf("countries").mockResolvedValueOnce(ok([{ vsb_countryid: id(9), vsb_name: "Germany", vsb_isocurrencycode: "EUR" }]));
    const row = await loadGeneratorsProject(PROJECT);
    const [pq] = queries("projects");
    expect(pq!.filter).toBe(`vsb_projectid eq ${PROJECT}`);
    expect(pq!.top).toBe(1);
    expect(pq!.select).toContain("_owningbusinessunit_value");
    expect(queries("countries")[0]!.filter).toBe(`vsb_countryid eq ${id(9)}`);
    expect(row).toMatchObject({
      id: PROJECT, countryName: "Germany", isoCurrencyCode: "EUR", totalCapacity: 30.5, owningBusinessUnitId: id(5),
      plantWtgCapacity: 20, plantPvCapacity: null,
    });
  });

  it("UT-GENDATA-READ-002 a project that does not exist is null and the country is not read", async () => {
    getAllOf("projects").mockResolvedValueOnce(ok([]));
    expect(await loadGeneratorsProject(PROJECT)).toBeNull();
    expect(getAllOf("countries")).not.toHaveBeenCalled();
  });

  it("UT-GENDATA-READ-003 listGeneratorTypes filters the project on the server, orders by creation and maps the status", async () => {
    getAllOf("types").mockResolvedValueOnce(ok([{
      vsb_generatortypeinprojectid: id(1), vsb_name: "WTG-0001", _vsb_generator_value: id(7),
      "_vsb_generator_value@OData.Community.Display.V1.FormattedValue": "Vestas V150", vsb_numberofgenerators: 3,
      vsb_costperwtg: 100, vsb_generatorscapacity: 16.8, vsb_requestpermissionstate: 952850001, vsb_flowrunid: "run", statecode: 1,
    }]));
    const rows = await listGeneratorTypes(PROJECT);
    const [q] = queries("types");
    expect(q!.filter).toBe(`_vsb_project_value eq ${PROJECT}`);
    expect(q!.orderBy).toEqual(["createdon asc"]);
    expect(q!.select).toEqual(expect.arrayContaining(["vsb_generatortypeinprojectid", "statecode", "vsb_flowrunid"]));
    expect(rows[0]).toMatchObject({
      id: id(1), generatorId: id(7), generatorDisplayName: "Vestas V150", numberOfGenerators: 3, requestPermissionState: 952850001,
      flowRunId: "run", flowApprovalId: null, status: 1,
    });
  });

  it("UT-GENDATA-READ-004 listGeneratorsByIds de-duplicates the ids and reads in chunks of 40", async () => {
    const ids = Array.from({ length: 85 }, (_, i) => id(i + 1));
    getAllOf("generators").mockResolvedValue(ok([]));
    await listGeneratorsByIds([...ids, ...ids.slice(0, 5)]);
    const sent = queries("generators");
    expect(sent.map((q) => countOf(q.filter, "vsb_generatorid eq"))).toEqual([40, 40, 5]);
    expect(sent[0]!.select).toContain("vsb_wtgprice5");
  });
});

describe("the turbines and their allocations", () => {
  it("UT-GENDATA-READ-005 listProjectTurbines reads the type ids in chunks of 40, selects columns and derives the index from the name", async () => {
    const typeIds = Array.from({ length: 45 }, (_, i) => id(i + 1));
    getAllOf("turbines")
      .mockResolvedValueOnce(ok([{
        vsb_generatorinprojectid: id(100), vsb_name: "WTG WPN_7", _vsb_moduletypeinprojectid_value: id(1),
        vsb_effectivecapacity: 5.6, vsb_totalheight: 223, vsb_effectivehubheightchanged: true, statecode: 0,
      }]))
      .mockResolvedValueOnce(ok([]));
    const rows = await listProjectTurbines(typeIds);
    const sent = queries("turbines");
    expect(sent.map((q) => countOf(q.filter, "_vsb_moduletypeinprojectid_value eq"))).toEqual([40, 5]);
    expect(sent[0]!.select).toContain("vsb_totalheight");
    expect(rows).toEqual([expect.objectContaining({
      id: id(100), typeId: id(1), index: 7, effectiveCapacity: 5.6, totalHeight: 223, effectiveHubHeightChanged: true, status: 0,
    })]);
  });

  it("UT-GENDATA-READ-006 listProjectTurbines with no type asks for nothing", async () => {
    expect(await listProjectTurbines([])).toEqual([]);
    expect(getAllOf("turbines")).not.toHaveBeenCalled();
  });

  it("UT-GENDATA-READ-007 loadTurbineAllocations counts every allocation of each cost, and DROPS an allocation with no cost (current behaviour, pinned)", async () => {
    getAllOf("allocations")
      .mockResolvedValueOnce(ok([
        { vsb_landleaseallocationwtgid: id(1), _vsb_projectcost_value: id(50), _vsb_generatorinproject_value: id(10) },
        { vsb_landleaseallocationwtgid: id(2), _vsb_projectcost_value: id(51), _vsb_generatorinproject_value: id(10) },
        // No cost: `if (costId)` leaves it out of `allocations`, so a delete plan never removes it (pinned, see the report).
        { vsb_landleaseallocationwtgid: id(3), _vsb_projectcost_value: null, _vsb_generatorinproject_value: id(10) },
      ]))
      .mockResolvedValueOnce(ok([
        { vsb_landleaseallocationwtgid: id(1), _vsb_projectcost_value: id(50) },
        { vsb_landleaseallocationwtgid: id(9), _vsb_projectcost_value: id(50) },
        { vsb_landleaseallocationwtgid: id(2), _vsb_projectcost_value: id(51) },
      ]));
    const out = await loadTurbineAllocations([id(10)]);
    expect(out.allocations.map((a) => a.id)).toEqual([id(1), id(2)]);
    expect(out.countByCost).toEqual({ [id(50)]: 2, [id(51)]: 1 });
    const [first, second] = queries("allocations");
    expect(first!.filter).toBe(`_vsb_generatorinproject_value eq ${id(10)}`);
    expect(second!.filter).toContain(`_vsb_projectcost_value eq ${id(50)}`);
    expect(second!.filter).toContain(`_vsb_projectcost_value eq ${id(51)}`);
  });

  it("UT-GENDATA-READ-008 loadTurbineAllocations with no turbine reads nothing", async () => {
    expect(await loadTurbineAllocations([])).toEqual({ allocations: [], countByCost: {} });
    expect(getAllOf("allocations")).not.toHaveBeenCalled();
  });

  it("UT-GENDATA-READ-009 listAllWtgLandLeaseCosts filters the project and AllWTGAllocated on the server", async () => {
    getAllOf("llCosts").mockResolvedValueOnce(ok([{ vsb_landleaseprojectcostid: id(4), vsb_landowner: "M", vsb_description: "A", vsb_allwtgallocated: true }]));
    const rows = await listAllWtgLandLeaseCosts(PROJECT);
    expect(queries("llCosts")[0]!.filter).toBe(`(_vsb_project_value eq ${PROJECT}) and (vsb_allwtgallocated eq true)`);
    expect(rows).toEqual([{ id: id(4), landOwner: "M", description: "A", allWtgAllocated: true }]);
  });
});

describe("the other families and the reference data", () => {
  it("UT-GENDATA-READ-010 listSimpleTypes('storage') filters the project, selects the energy column and maps blanks to null", async () => {
    getAllOf("storage").mockResolvedValueOnce(ok([{ vsb_storagetypeinprojectid: id(2), vsb_name: "BESS", vsb_supplier: "Tesla", vsb_storagecapacitydec: 5, crc36_energycapacitymwh: 10, statecode: 0 }]));
    const rows = await listSimpleTypes("storage", PROJECT);
    const [q] = queries("storage");
    expect(q!.filter).toBe(`_vsb_project_value eq ${PROJECT}`);
    expect(q!.select).toContain("crc36_energycapacitymwh");
    expect(rows[0]).toMatchObject({ id: id(2), name: "BESS", supplier: "Tesla", capacity: 5, energyCapacity: 10, status: 0, otherSupplier: null });
  });

  it("UT-GENDATA-READ-011 listPvTypes orders by creation then name and maps the catalogue id and degradations", async () => {
    getAllOf("pv").mockResolvedValueOnce(ok([{
      vsb_pvmoduletypeinprojectid: id(3), vsb_name: "PVT-0001", vsb_label: "JA 550", _vsb_pvmodule_value: id(8),
      vsb_capacity: 10, vsb_cost: 3000, vsb_degradation1styear: 0.125, vsb_degradationremainingyears: 0.4, statecode: 0,
    }]));
    const rows = await listPvTypes(PROJECT);
    expect(queries("pv")[0]!.orderBy).toEqual(["createdon asc", "vsb_name asc"]);
    expect(rows[0]).toMatchObject({ moduleLabel: "JA 550", catalogueId: id(8), degradation1stYear: 0.125, degradationRemainingYears: 0.4, capacity: 10 });
  });

  it("UT-GENDATA-READ-012 loadDeviceCosts reads only the four device types; the project's country wins, else the first row", async () => {
    getAllOf("deviceCosts").mockResolvedValueOnce(ok([
      { vsb_devicetype: "Modules", vsb_devicecostcurrency: 100, _vsb_country_value: id(1) },
      { vsb_devicetype: "Modules", vsb_devicecostcurrency: 300, _vsb_country_value: id(2) },
      { vsb_devicetype: "Inverter", vsb_devicecostcurrency: 7, _vsb_country_value: id(1) },
    ]));
    const costs = await loadDeviceCosts(id(2));
    const [q] = queries("deviceCosts");
    expect(countOf(q!.filter, " or ") + 1).toBe(4);
    expect(q!.orderBy).toEqual(["createdon asc"]);
    expect(costs.modules).toBe(300);
    expect(costs.inverter).toBe(7);
    expect(costs.mountingFix).toBeNull();
  });
});
