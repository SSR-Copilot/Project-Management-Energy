/**
 * UT-GENPERF-001.. — the Generators screen's performance switches and targeted reloads (D141).
 * 001-003 the switch module, 004-014 the reload map, 015-030 the safety net (every table a plan builder writes is covered by a
 * refreshed query, with the REAL builders and with a scan of `rules.ts`).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { ES, ES_PLANT } from "@/data/dataverseNames";
import {
  GENERATORS_PERF, GENERATORS_PERF_ALL_OFF, generatorsPerf, setGeneratorsPerfFlags,
} from "@/data/generatorsPerfFlags";
import { qk } from "@/data/keys";
import { emptyPlan, type PlannedWrite, type WritePlan } from "@/data/writePlan";
import * as R from "./rules";
import {
  FAMILY_ORDER, KIND_TABLES, PV_UNITS, TABLE_QUERIES, familiesFor, familyKeys, reloadKeys, withReload,
  type QueryFamily, type ReloadKind,
} from "./reload";
import { P, costs, genType, model, n, simple, turbine, wtgUnits } from "./bulkPlans.testkit";

const logged = vi.hoisted(() => ({ lines: [] as string[] }));
vi.mock("@/platform/requestLog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/platform/requestLog")>()),
  logAction: (message: string) => { logged.lines.push(message); },
}));

afterEach(() => {
  setGeneratorsPerfFlags(null);
  logged.lines.length = 0;
});

const PID = "11111111-1111-1111-1111-111111111111";
const ON = GENERATORS_PERF;

describe("GENERATORS_PERF — the switches (D141)", () => {
  it("UT-GENPERF-001 the shipped defaults: phase A switches and parallelChunks ON, the three risky ones OFF", () => {
    expect(GENERATORS_PERF).toEqual({
      targetedReload: true, gateByList: true, prefetch: true, parallelChunks: true,
      readsByProject: false, optimisticToggle: false, persistCatalogue: false,
    });
    expect(generatorsPerf()).toEqual(GENERATORS_PERF);
  });

  it("UT-GENPERF-002 every switch off is today's behaviour (the rollback), and nothing is on", () => {
    expect(Object.values(GENERATORS_PERF_ALL_OFF).every((v) => v === false)).toBe(true);
    expect(Object.keys(GENERATORS_PERF_ALL_OFF).sort()).toEqual(Object.keys(GENERATORS_PERF).sort());
  });

  it("UT-GENPERF-003 the test seam overrides one switch and `null` restores the defaults", () => {
    setGeneratorsPerfFlags({ targetedReload: false });
    expect(generatorsPerf().targetedReload).toBe(false);
    expect(generatorsPerf().gateByList).toBe(true);
    setGeneratorsPerfFlags(null);
    expect(generatorsPerf()).toEqual(GENERATORS_PERF);
  });
});

/* ───────────────────────────────────────────────────────────────────── the reload map */

const KINDS = Object.keys(KIND_TABLES) as Exclude<ReloadKind, "full">[];
const keyText = (keys: readonly unknown[] | undefined) => (keys ?? []).map((k) => JSON.stringify(k));

describe("targeted reloads — which queries a save refreshes", () => {
  it("UT-GENPERF-004 switch OFF: no kind has a key list, so every save keeps the hook's full reload", () => {
    for (const kind of KINDS) expect(reloadKeys(PID, kind, GENERATORS_PERF_ALL_OFF)).toBeUndefined();
    expect(withReload({ progress: "x", plan: { writes: [], log: [] } }, PID, "toggleStatus", GENERATORS_PERF_ALL_OFF).invalidate).toBeUndefined();
  });

  it("UT-GENPERF-005 no project, or the `full` kind (rollback, Retry cleanup): the full reload even with the switch on", () => {
    expect(reloadKeys(undefined, "toggleStatus", ON)).toBeUndefined();
    expect(reloadKeys(PID, "full", ON)).toBeUndefined();
    expect(familiesFor("full")).toBeUndefined();
  });

  it("UT-GENPERF-006 a BESS save refreshes the project roll-up (four keys) and the storage list, nothing else", () => {
    expect(keyText(reloadKeys(PID, "saveSimple:storage", ON))).toEqual(keyText([
      qk.generators(PID, "project"), qk.project(PID), qk.milestoneProject(PID), qk.generalDataProject(PID),
      qk.generators(PID, "storage"),
    ]));
  });

  it("UT-GENPERF-007 a turbine save refreshes the project, the types and the turbines — not the other families, not planning", () => {
    expect(familiesFor("saveTurbine")).toEqual(["project", "types", "turbines"]);
    const text = keyText(reloadKeys(PID, "saveTurbine", ON));
    for (const part of ["pv", "inverter", "substructure", "storage", "hydrogen", "substation", "planning", "allWtgCosts"]) {
      expect(text).not.toContain(JSON.stringify(qk.generators(PID, part)));
    }
  });

  it("UT-GENPERF-008 the status toggle refreshes the types, the turbines and the roll-up", () => {
    expect(familiesFor("toggleStatus")).toEqual(["project", "types", "turbines"]);
  });

  it("UT-GENPERF-009 PV saves and deletes never reload the turbines or the WTG types (PV units are not in the turbine read)", () => {
    expect(familiesFor("savePv")).toEqual(["project", "pv", "opexDependency"]);
    expect(familiesFor("deletePv")).toEqual(["project", "pv", "substructure", "allWtgCosts", "opexDependency"]);
    expect(familiesFor("replacePv")).toEqual(["project", "pv", "opexDependency"]);
  });

  it("UT-GENPERF-010 a WTG type delete reloads what its cascade and clean-up changed: the O&M dependency and the AllWTG costs too", () => {
    expect(familiesFor("deleteWtgType")).toEqual(["project", "types", "turbines", "allWtgCosts", "opexDependency"]);
    expect(familiesFor("addWtgType")).toEqual(["project", "types", "turbines", "opexDependency"]);
    expect(familiesFor("replaceWtg")).toEqual(["project", "types", "turbines", "opexDependency"]);
  });

  it("UT-GENPERF-011 a card's Cancel (flow) refreshes the one family it wrote and the project", () => {
    expect(familiesFor("cancelRequest:wtg")).toEqual(["project", "types"]);
    expect(familiesFor("cancelRequest:pv")).toEqual(["project", "pv"]);
    expect(familiesFor("cancelRequest:inverter")).toEqual(["project", "inverter"]);
    expect(familiesFor("cancelRequest:substructure")).toEqual(["project", "substructure"]);
  });

  it("UT-GENPERF-012 the keys really invalidate the keys the hooks read (prefix match on turbines and the O&M reads), and only those", async () => {
    const qc = new QueryClient();
    const seeded: Record<string, readonly unknown[]> = {
      project: qk.generators(PID, "project"), planning: qk.generators(PID, "planning"), types: qk.generators(PID, "types"),
      turbines: qk.generators(PID, "turbines", "t1", "t2"), pv: qk.generators(PID, "pv"), inverter: qk.generators(PID, "inverter"),
      storage: qk.generators(PID, "storage"), allWtg: qk.generators(PID, "allWtgCosts"),
      opex: qk.generators(PID, "opexDependency", "t1"), models: qk.generatorModels(["g1"]), catalog: qk.generatorCatalog("2028-06-01"),
      other: qk.generators("another-project", "types"), session: qk.project(PID), milestone: qk.milestoneProject(PID),
    };
    for (const key of Object.values(seeded)) qc.setQueryData(key, []);
    for (const key of reloadKeys(PID, "deleteWtgType", ON)!) await qc.invalidateQueries({ queryKey: key, refetchType: "none" });
    const stale = (name: string) => qc.getQueryState(seeded[name]!)!.isInvalidated;
    expect(["project", "types", "turbines", "allWtg", "opex", "session", "milestone"].every(stale)).toBe(true);
    expect(["planning", "pv", "inverter", "storage", "models", "catalog", "other"].some(stale)).toBe(false);
  });

  it("UT-GENPERF-013 withReload sets the key list, keeps the job's own onWritten, and traces the reload", () => {
    const own = vi.fn();
    const job = withReload({ progress: "x", plan: { writes: [], log: [] }, onWritten: own }, PID, "saveSimple:hydrogen", ON);
    expect(job.invalidate).toEqual(reloadKeys(PID, "saveSimple:hydrogen", ON));
    job.onWritten?.(true);
    job.onWritten?.(false);
    expect(own).toHaveBeenCalledTimes(2);
    expect(logged.lines).toEqual([
      "Generators reload after saveSimple:hydrogen: 2 of 11 query groups (project, hydrogen)",
      "Generators reload after saveSimple:hydrogen (failed): 2 of 11 query groups (project, hydrogen)",
    ]);
  });

  it("UT-GENPERF-014 withReload with the switch off returns the very same job: no invalidate, no trace", () => {
    const job = { progress: "x", plan: { writes: [], log: [] } };
    expect(withReload(job, PID, "toggleStatus", GENERATORS_PERF_ALL_OFF)).toBe(job);
    expect(logged.lines).toEqual([]);
  });
});

/* ───────────────────────────────────────────────────────────────────── the safety net */

/** The entity sets a plan writes (a bulk step counts its table once). */
const tablesWritten = (...plans: WritePlan[]): Set<string> =>
  new Set(plans.flatMap((p) => p.writes).map((w: PlannedWrite) => w.entitySet));

/**
 * PV kinds write `GeneratorInProjects` rows that are PV UNITS, which no query reads (`PV_UNITS`); the WTG kinds write turbines.
 * `bind` proves it for the unit a PV save creates: it binds the PV type lookup, never the WTG one.
 */
const PV_KINDS = new Set<ReloadKind>(["savePv", "deletePv", "replacePv"]);
const classify = (kind: ReloadKind, table: string): string =>
  PV_KINDS.has(kind) && table === ES_PLANT.generatorInProjects ? PV_UNITS : table;

function expectCovered(kind: Exclude<ReloadKind, "full">, written: Set<string>) {
  const declared = new Set(KIND_TABLES[kind]);
  for (const table of written) expect(declared.has(classify(kind, table)), `${kind} writes ${table}`).toBe(true);
}

const pvForm = { moduleLabel: "JA 550", capacity: "10", supplier: "m1", degradation1stYear: "", degradationRemainingYears: "", dirty: new Set<string>() };
const inverterForm = { label: "INV A", supplierId: "s", otherSupplier: "", inverterTypes: [952850000], warranty: "20", numberOfInverters: "10", nominalPower: "250", dirty: new Set(["label"]) };
const substructureForm = { label: "S1", supplierId: "x", otherSupplier: "", substructureType: 952850001, dirty: new Set(["label"]) };
const allocation = (i: number) => ({ id: `a${i}`, costId: `c${i}` });

describe("targeted reloads — the safety net: every table a plan writes is covered", () => {
  it("UT-GENPERF-015 every table of every kind has a TABLE_QUERIES entry, and the kind's keys include each table's queries", () => {
    for (const kind of KINDS) {
      const families = new Set(familiesFor(kind));
      for (const table of KIND_TABLES[kind]) {
        expect(TABLE_QUERIES[table], `${kind}: ${table} is not mapped`).toBeDefined();
        for (const family of TABLE_QUERIES[table]!) expect(families.has(family), `${kind}: ${table} -> ${family}`).toBe(true);
      }
    }
  });

  it("UT-GENPERF-016 every family has keys, and FAMILY_ORDER lists each family once", () => {
    const families = [...new Set(Object.values(TABLE_QUERIES).flat())];
    for (const f of families) expect(FAMILY_ORDER).toContain(f);
    expect(new Set(FAMILY_ORDER).size).toBe(FAMILY_ORDER.length);
    for (const f of FAMILY_ORDER) expect(familyKeys(PID, f as QueryFamily).length).toBeGreaterThan(0);
  });

  it("UT-GENPERF-017 Add WTG Type (both jobs of the save) writes only tables of its kind", () => {
    const create = R.planCreateGeneratorType({
      project: P, inCountry: true, model: model(), numberOfGenerators: 2, costPerWtg: 900_000, selectedHeight: 148,
      revisedHubHeight: null, existingTypes: [genType()], projectTurbines: [turbine(4)],
    });
    const follow = R.planGeneratorTypeFollowUp({
      project: P, typeId: "t9", typeName: "WTG-0042", hasDeviceType: false, turbines: [{ id: "w1", name: "WTG WPN_1" }], landLeaseCosts: costs(1),
    });
    const written = tablesWritten(create, follow);
    expect(written.size).toBeGreaterThanOrEqual(5);
    expectCovered("addWtgType", written);
  });

  it("UT-GENPERF-018 the turbine save (new turbine, apply to all, allocations) and the turbine delete write only their tables", () => {
    const type = genType();
    const save = R.planSaveTurbine({
      lang: "en-US", project: P, type, model: model(), accumulatedIndex: 1, turbine: null, typeTurbines: [turbine(1), turbine(2)], allTypes: [type],
      form: { nameIndex: "3", effectiveCapacity: "5", effectiveHubHeight: "150", foundationPlinth: "1", dirty: new Set(["nameIndex"]) },
      applyAll: { capacity: true, hubHeight: true, plinth: false }, totalHeight: 226, landLeaseCosts: costs(1),
    });
    expectCovered("saveTurbine", tablesWritten(save));
    const allocations = n(6, (i) => allocation(i));
    const del = R.planDeleteTurbine({
      project: P, type, model: model(), accumulatedIndex: 1, turbine: turbine(1), typeTurbines: [turbine(1)], allTypes: [type],
      allocations, allocationCountByCost: { c1: 2, c2: 2, c3: 1, c4: 1, c5: 1, c6: 1 },
    });
    expect(tablesWritten(del).has(ES_PLANT.landLeaseProjectCosts)).toBe(true);
    expectCovered("deleteTurbine", tablesWritten(del));
  });

  it("UT-GENPERF-019 the WTG type delete and the status toggle write only their tables", () => {
    const type = genType();
    const del = R.planDeleteGeneratorType({
      project: P, type, allTypes: [type, genType({ id: "t2" })], allocations: n(4, (i) => allocation(i)),
      allocationCountByCost: { c1: 9, c2: 1, c3: 1, c4: 9 }, opexCostIds: ["o1"],
    });
    expectCovered("deleteWtgType", tablesWritten(del));
    expectCovered("toggleStatus", tablesWritten(R.planToggleStatus({ project: P, type, turbines: wtgUnits(3), allTypes: [type] })));
  });

  it("UT-GENPERF-020 the PV save (both jobs) writes only its tables, and the unit it creates binds the PV type, never the WTG type", () => {
    const save = R.planSavePvType({ lang: "en-US", project: P, pv: null, deviceCostModules: 300, otherSupplierChosen: false, form: pvForm });
    const follow = R.planPvFollowUp({
      project: P, pvId: "pv1", pvName: "PVT-0007", unitId: null, hasDeviceType: false, pvRows: [{ capacity: 10, cost: 3000 }],
      inverters: [], substructures: [], landLeaseCosts: costs(2), isNew: true,
    });
    expectCovered("savePv", tablesWritten(save, follow));
    const unit = follow.writes.find((w) => w.entitySet === ES_PLANT.generatorInProjects)!;
    const keys = Object.keys(unit.data ?? {});
    expect(keys.some((k) => k.toLowerCase().includes("pvmoduletypeinproject"))).toBe(true);
    expect(keys.some((k) => k.toLowerCase().includes("generatortypeinproject"))).toBe(false);
  });

  it("UT-GENPERF-021 the PV delete (units, allocations, costs, substructure re-cost) writes only its tables", () => {
    const pvA = simple({ id: "a", capacity: 10, cost: 3000 });
    const plan = R.planDeletePvType({
      project: P, pv: pvA, pvRows: [pvA], inverters: [], substructures: [{ ...simple({ id: "s1", cost: 1 }), typeLabels: ["Tracker"] }],
      deviceCostFix: 1, deviceCostTracker: 1, allocations: n(3, (i) => allocation(i)), allocationCountByCost: { c1: 1, c2: 5, c3: 5 },
      opexCostIds: ["o1"], unitIds: ["u1", "u2"],
    });
    const written = tablesWritten(plan);
    expect(written.has(ES_PLANT.substructureTypeInProjects)).toBe(true);
    expectCovered("deletePv", written);
  });

  it("UT-GENPERF-022 inverter and substructure saves and deletes write their row and the project only", () => {
    const inv = simple({ id: "i1", cost: 40 });
    expectCovered("saveInverter", tablesWritten(R.planSaveInverter({
      lang: "en-US", project: P, row: null, form: inverterForm, otherSupplierChosen: false, deviceCostInverter: 80, pv: [{ cost: 100 }],
      inverters: [inv], substructures: [{ cost: 7 }],
    })));
    expectCovered("saveSubstructure", tablesWritten(R.planSaveSubstructure({
      project: P, row: null, form: substructureForm, otherSupplierChosen: false, deviceCostFix: 100, deviceCostTracker: 200,
      plantPvCapacity: 10, pv: [{ cost: 100 }], inverters: [{ cost: 5 }], substructures: [],
    })));
    expectCovered("deleteInverter", tablesWritten(R.planDeleteInverterOrSubstructure({
      project: P, family: "inverter", row: inv, pv: [], inverters: [inv], substructures: [],
    })));
    expectCovered("deleteSubstructure", tablesWritten(R.planDeleteInverterOrSubstructure({
      project: P, family: "substructure", row: simple({ id: "s1" }), pv: [], inverters: [], substructures: [],
    })));
  });

  it("UT-GENPERF-023 BESS / Hydrogen / Substation saves and deletes write their own table and the project only", () => {
    for (const family of ["storage", "hydrogen", "substation"] as const) {
      const row = simple({ id: "s1", capacity: 4 });
      const form = { label: "B", capacity: "10", energyCapacity: "20", supplier: "T", dirty: new Set(["label"]) };
      expectCovered(`saveSimple:${family}`, tablesWritten(R.planSaveSimple({ lang: "en-US", project: P, family, row, rows: [row], form })));
      expectCovered(`deleteSimple:${family}`, tablesWritten(R.planDeleteSimple({ project: P, family, row, rows: [row, simple({ id: "y" })] })));
    }
  });

  it("UT-GENPERF-024 Replace Generator Type (both jobs) writes only its tables", () => {
    const inputs = {
      bridgeIds: ["b1"], opexCostIds: ["o1", "o2"], unitIds: ["w1", "w2"], landLeaseCosts: costs(2),
      allocations: [
        { id: "m1", unitIndex: 1, allWtgAllocated: false }, { id: "m2", unitIndex: 2, allWtgAllocated: false },
        { id: "m3", unitIndex: 3, allWtgAllocated: false }, { id: "aw1", unitIndex: 1, allWtgAllocated: true },
      ],
    };
    const first = R.planReplaceGeneratorType({
      project: P, oldType: genType({ numberOfGenerators: 2 }), inCountry: true, model: model(), costPerWtg: 1000,
      selectedHeight: 150, revisedHubHeight: null, otherTypes: [], otherTurbines: [], inputs,
    });
    const second = R.planReplaceGeneratorTypeFollowUp({
      project: P, newTypeId: "tN", newTypeName: "WTG-0100", existingBridgeId: null,
      newUnits: [{ id: "n1", name: "WTG WPN_8" }, { id: "n2", name: "WTG WPN_9" }], inputs,
    });
    expectCovered("replaceWtg", tablesWritten(first, second));
  });

  it("UT-GENPERF-025 Replace PV Module Type (both jobs) writes only its tables", () => {
    const inputs = {
      bridgeIds: ["b1"], opexCostIds: ["o1"], unitIds: ["u1"], landLeaseCosts: costs(2),
      allocations: [{ id: "m1", unitIndex: 1, allWtgAllocated: false }, { id: "aw1", unitIndex: 1, allWtgAllocated: true }],
    };
    const first = R.planReplacePvType({
      project: P, oldPv: simple({ id: "pvX" }), form: pvForm, deviceCostModules: 300, otherSupplierChosen: false, inputs, lang: "en-US",
    });
    const second = R.planReplacePvTypeFollowUp({
      project: P, newPvId: "pvN", newPvName: "JA 600", existingBridgeId: null, inputs, pvRows: [{ capacity: 12, cost: 1 }],
      inverters: [], substructures: [],
    });
    expectCovered("replacePv", tablesWritten(first, second));
  });

  it("UT-GENPERF-026 a card's Cancel runs an empty plan: the flow is the only write, and its row's family is refreshed", () => {
    expect(emptyPlan().writes).toEqual([]);
    for (const family of ["wtg", "pv", "inverter", "substructure"] as const) {
      expect(KIND_TABLES[`cancelRequest:${family}`].length).toBeGreaterThan(0);
    }
  });

  it("UT-GENPERF-027 every entity set rules.ts mentions is mapped here or is a read-only catalogue (a plan builder that writes a new table fails this)", () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "rules.ts"), "utf8");
    const names = new Set<string>();
    for (const m of source.matchAll(/\bES(?:_PLANT)?\.([A-Za-z]+)/g)) {
      const full = m[0].startsWith("ES_PLANT") ? (ES_PLANT as Record<string, string>)[m[1]!] : (ES as Record<string, string>)[m[1]!];
      expect(full, `unknown entity set constant ${m[0]}`).toBeDefined();
      names.add(full!);
    }
    // Catalogue tables rules.ts only BINDS to (`ref(...)`); no plan writes them and no Generators query is refreshed for them.
    const readOnly = new Set<string>([ES_PLANT.generators, ES_PLANT.inverters, ES_PLANT.substructures, ES_PLANT.pvModules]);
    const mapped = new Set(Object.keys(TABLE_QUERIES).map((t) => t.split("#")[0]!));
    for (const name of names) expect(mapped.has(name) || readOnly.has(name), `${name} is neither mapped nor read-only`).toBe(true);
  });

  it("UT-GENPERF-028 no kind lists a table that is not a real entity set, and no table is listed twice in one kind", () => {
    const real = new Set<string>([...Object.values(ES), ...Object.values(ES_PLANT)]);
    for (const kind of KINDS) {
      const tables = KIND_TABLES[kind];
      expect(new Set(tables).size).toBe(tables.length);
      for (const table of tables) expect(real.has(table.split("#")[0]!), `${kind}: ${table}`).toBe(true);
    }
  });
});
