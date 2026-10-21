/**
 * Replace Generator Type / Replace PV Module Type (canvas 1.21.753) against the mock backend.
 *
 * Harness layer 3 — the write sequence itself, not just its pure plan. `rules.test.ts` pins
 * `planReplaceLandLease`; this drives `replaceGeneratorTypeImpl` end to end through
 * `dataClient` and asserts the rows the canvas phases leave behind: the old type and its
 * units gone, the new units created, manual land-lease allocations moved by position with the
 * surplus removed, the old AllWTG rows removed, and the O&M cost re-pointed to the new bridge.
 *
 * Every queried set is seeded non-empty first, because the plant tables are auto-fixture
 * tables: a GET that matches nothing would otherwise be answered with demo rows.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { resetMockDb } from "@/data/mock/mockBackend";
import { ES, ES_PLANT, CHOICE_PLANT } from "@/data/entities";
import { dataClient } from "@/platform/dataClient";
import {
  generatorTypeInProjectFullRepo, generatorInProjectFullRepo, deviceTypeInProjectRepo,
  landLeaseAllocationRepo, landLeaseCostFullRepo, opexProjectCostFullRepo,
  pvModuleTypeInProjectRepo,
} from "@/data/repos";
import { f } from "@/platform/odata";
import { replaceGeneratorTypeImpl, replacePvModuleTypeImpl } from "./hooks";
import type { GeneratorsProject, GeneratorTypeRow, ProjectedModel, SimpleTypeRow } from "./rules";

let PROJECT: GeneratorsProject = {
  id: "p-replace", projectIdText: "DE-9", projectName: "Replace Park", shortName: "RPK",
  countryId: "c1", countryOptionValue: 1, isoCurrencyCode: "EUR", totalCapacity: 30,
  fid: "2030-06-15", endDate: "2055-12-31", projectStartDate: "2026-01-01",
  projectManagerId: null, projectManagerEmail: null, owningBusinessUnitId: "bu-1",
};

const NEW_MODEL: ProjectedModel = {
  id: "g-new", name: "V162", displayName: "Vestas V162-6.2", supplier: "Vestas",
  turbineType: "V162", hubHeight: 169, rotorDiameter: 162, specificCapacity: 6.2,
  earliestPhaseout: "2036-01-01", countryAvailability: [1], foundationCostIncluded: true,
  additionalFoundationCost: 0, prices: [1, 1, 1, 1, 1],
  isAvailable: true, availability: "available", fullDisplayName: "Vestas V162-6.2 - available",
};

const bind = (nav: string, set: string, id: string) => ({ [`${nav}@odata.bind`]: `/${set}(${id})` });
let projectBind: Record<string, string> = {};

async function seedOldWtgType() {
  const typeId = await generatorTypeInProjectFullRepo.create({
    ...projectBind, ...bind("vsb_Generator", ES_PLANT.generators, "g-old"),
    vsb_numberofgenerators: 3, vsb_generatorscapacity: 16.8,
  });
  const units: string[] = [];
  for (const i of [1, 2, 3]) {
    units.push(await generatorInProjectFullRepo.create({
      vsb_name: `WTG RPK_${i}`, ...bind("vsb_ModuleTypeInProjectId", ES_PLANT.generatorTypeInProjects, typeId),
    }));
  }
  const bridgeId = await deviceTypeInProjectRepo.create({
    vsb_name: "old", ...bind("vsb_TypeInProjectId", ES_PLANT.generatorTypeInProjects, typeId),
  });
  const manualCost = await landLeaseCostFullRepo.create({ ...projectBind, vsb_allwtgallocated: false, vsb_landowner: "Hof", vsb_description: "manual" });
  const allCost = await landLeaseCostFullRepo.create({ ...projectBind, vsb_allwtgallocated: true, vsb_landowner: "Gem", vsb_description: "all" });
  const manualAllocs: string[] = [];
  for (const u of units) {
    manualAllocs.push(await landLeaseAllocationRepo.create({
      vsb_name: "m", ...bind("vsb_ProjectCost", ES_PLANT.landLeaseProjectCosts, manualCost),
      ...bind("vsb_GeneratorInProject", ES_PLANT.generatorInProjects, u),
    }));
    await landLeaseAllocationRepo.create({
      vsb_name: "a", ...bind("vsb_ProjectCost", ES_PLANT.landLeaseProjectCosts, allCost),
      ...bind("vsb_GeneratorInProject", ES_PLANT.generatorInProjects, u),
    });
  }
  const opexId = await opexProjectCostFullRepo.create({
    ...projectBind, vsb_description: "O&M", ...bind("vsb_DeviceTypeInProject", ES_PLANT.deviceTypesInProjects, bridgeId),
  });
  return { typeId, units, bridgeId, manualCost, allCost, manualAllocs, opexId };
}

const oldTypeRow = (id: string): GeneratorTypeRow => ({
  id, name: null, generatorId: "g-old", generatorDisplayName: "Vestas V150-5.6",
  numberOfGenerators: 3, costPerWtg: 1, generatorsCost: 3, generatorsCapacity: 16.8,
  requestPermissionState: null, flowRunId: null, flowApprovalId: null,
  status: CHOICE_PLANT.status.active, specificCapacity: 5.6,
});

beforeEach(async () => {
  resetMockDb();
  // A real seeded project, so the roll-up PATCH on `vsb_projects` finds its row.
  const first = await dataClient.list<Record<string, unknown>>(ES.projects, { select: ["vsb_projectid"], top: 1 });
  PROJECT = { ...PROJECT, id: String(first.rows[0]!.vsb_projectid) };
  projectBind = bind("vsb_Project", "vsb_projects", PROJECT.id);
});

describe("UT-GENR — Replace Generator Type against the mock backend", () => {
  it("UT-GENR-001 replaces the type, moves manual allocations by position and re-points O&M", async () => {
    const seed = await seedOldWtgType();
    const phases: string[] = [];

    const out = await replaceGeneratorTypeImpl({
      project: PROJECT,
      oldType: oldTypeRow(seed.typeId),
      model: NEW_MODEL,
      count: 2, // fewer units than before — one manual allocation cannot be carried over
      costPerWtgValue: 1_000,
      selectedHeight: 169,
      typedHubHeight: null,
      inCountry: true,
      allTypes: [oldTypeRow(seed.typeId)],
      otherTurbines: [],
      allocatableCosts: [{ id: seed.allCost, landOwner: "Gem", description: "all", allWtgAllocated: true }],
      onPhase: (p) => phases.push(p),
    });

    expect(phases).toEqual(["Identify", "Detach", "Delete", "Add", "AllocateLandLease", "Repoint", "Done"]);
    expect(out.unmatchedCount).toBe(1);
    expect(out.requested).toBe(false);

    // The old type and all three of its units are gone.
    expect(await generatorTypeInProjectFullRepo.getById(seed.typeId).catch(() => undefined)).toBeUndefined();
    for (const u of seed.units) {
      expect(await generatorInProjectFullRepo.getById(u).catch(() => undefined)).toBeUndefined();
    }

    // Two new units, named after the project short name, continuing at 1.
    const newUnits = await generatorInProjectFullRepo.listAll({
      filter: f.guid("_vsb_moduletypeinprojectid_value", out.typeId),
    });
    expect(newUnits.map((u) => u.vsb_name).sort()).toEqual(["WTG RPK_1", "WTG RPK_2"]);
    const byName = new Map(newUnits.map((u) => [u.vsb_name, String(u.vsb_generatorinprojectid)]));

    // Manual allocations of old units #1, #2 now point at new units #1, #2; #3's is removed.
    const a1 = await landLeaseAllocationRepo.getById(seed.manualAllocs[0]!);
    const a2 = await landLeaseAllocationRepo.getById(seed.manualAllocs[1]!);
    expect(a1?._vsb_generatorinproject_value).toBe(byName.get("WTG RPK_1"));
    expect(a2?._vsb_generatorinproject_value).toBe(byName.get("WTG RPK_2"));
    expect(await landLeaseAllocationRepo.getById(seed.manualAllocs[2]!).catch(() => undefined)).toBeUndefined();

    // The AllWTG cost: the old units' three rows are gone, the new units got one each (T2g).
    const allRows = await landLeaseAllocationRepo.listAll({
      filter: f.guid("_vsb_projectcost_value", seed.allCost),
    });
    expect(allRows.map((r) => r._vsb_generatorinproject_value).sort())
      .toEqual([...byName.values()].sort());

    // The O&M cost survived the delete and now hangs off the new type's bridge.
    const newBridge = await deviceTypeInProjectRepo.getOne(f.guid("_vsb_typeinprojectid_value", out.typeId));
    const opex = await opexProjectCostFullRepo.getById(seed.opexId);
    expect(opex?._vsb_devicetypeinproject_value).toBe(String(newBridge?.vsb_devicetypesinprojectid));
  });
});

describe("UT-GENR — Replace PV Module Type against the mock backend", () => {
  it("UT-GENR-002 moves every manual allocation to the new PV unit and re-points O&M", async () => {
    const pvId = await pvModuleTypeInProjectRepo.create({ ...projectBind, vsb_label: "Old PV", vsb_capacity: 10 });
    const unit = await generatorInProjectFullRepo.create({
      vsb_name: "PV-OLD", ...bind("vsb_ModuleTypeInProjectId", ES_PLANT.pvModuleTypeInProjects, pvId),
    });
    const bridge = await deviceTypeInProjectRepo.create({
      vsb_name: "Old PV", ...bind("vsb_TypeInProjectId", ES_PLANT.pvModuleTypeInProjects, pvId),
    });
    const manualCost = await landLeaseCostFullRepo.create({ ...projectBind, vsb_allwtgallocated: false });
    const manual = await landLeaseAllocationRepo.create({
      vsb_name: "m", ...bind("vsb_ProjectCost", ES_PLANT.landLeaseProjectCosts, manualCost),
      ...bind("vsb_GeneratorInProject", ES_PLANT.generatorInProjects, unit),
    });
    const opexId = await opexProjectCostFullRepo.create({
      ...projectBind, ...bind("vsb_DeviceTypeInProject", ES_PLANT.deviceTypesInProjects, bridge),
    });
    const oldPv: SimpleTypeRow = {
      id: pvId, name: null, supplier: "JA", otherSupplier: null, capacity: 10, cost: 0,
      moduleLabel: "Old PV", degradation1stYear: null, degradationRemainingYears: null,
      requestPermissionState: null, flowRunId: null, flowApprovalId: null,
      status: CHOICE_PLANT.status.active,
    };

    const out = await replacePvModuleTypeImpl({
      project: PROJECT,
      oldPv,
      form: {
        moduleLabel: "New PV", capacity: "12.00", supplier: "JA Solar", otherSupplier: "",
        degradation1stYear: "", degradationRemainingYears: "",
      },
      deviceCostModules: 500_000,
      rollUp: null,
      allocatableCosts: [],
    });

    expect(await pvModuleTypeInProjectRepo.getById(pvId).catch(() => undefined)).toBeUndefined();
    const newUnit = await generatorInProjectFullRepo.getOne(
      f.guid("_vsb_moduletypeinprojectid_value", out.id),
    );
    expect(newUnit).toBeDefined();
    const moved = await landLeaseAllocationRepo.getById(manual);
    expect(moved?._vsb_generatorinproject_value).toBe(String(newUnit?.vsb_generatorinprojectid));
    const newBridge = await deviceTypeInProjectRepo.getOne(f.guid("_vsb_typeinprojectid_value", out.id));
    expect((await opexProjectCostFullRepo.getById(opexId))?._vsb_devicetypeinproject_value)
      .toBe(String(newBridge?.vsb_devicetypesinprojectid));
  });
});
