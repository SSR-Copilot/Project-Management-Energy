/**
 * Roll back a failed create save (plan §9.3, work package R1): the pure plan builders and texts.
 * IDs continue the generators block (`UT-GEN-170` is the status toggle in rules.test.ts).
 */
import { describe, it, expect } from "vitest";
import { CHOICE_PLANT } from "@/data/dataverseNames";
import {
  groupLandedRows, planRollbackCreate, describeLeftovers, leftoversMessage, rollbackApplies, ROLLBACK_MSG,
  type LandedRowRef, type RollbackScenario, type PlanProject,
} from "./rules";

const ALLOC = "vsb_landleaseallocationwtgs";
const BRIDGE = "vsb_devicetypesinprojects";
const TURBINE = "vsb_generatorinprojects";
const TYPE = "vsb_generatortypeinprojects";
const PVTYPE = "vsb_pvmoduletypeinprojects";

const P: PlanProject = { id: "p1", shortName: "WPN", owningBusinessUnitId: "bu-1" };
const row = (entitySet: string, id: string): LandedRowRef => ({ entitySet, id });
const turbines = (n: number): LandedRowRef[] => Array.from({ length: n }, (_, i) => row(TURBINE, `w${i + 1}`));
const allocs = (n: number): LandedRowRef[] => Array.from({ length: n }, (_, i) => row(ALLOC, `a${i + 1}`));

const other = (id: string, capacity: number, cost: number) => ({
  id, requestPermissionState: null, status: CHOICE_PLANT.status.active, generatorsCapacity: capacity, generatorsCost: cost,
});
const newType = other("t-new", 22.4, 3_600_000);
const old = other("t-old", 3, 4);

const shape = (w: { op: string; entitySet: string; concurrent?: boolean }[]) =>
  w.map((x) => `${x.op}:${x.entitySet}${x.concurrent ? "*" : ""}`);

describe("groupLandedRows", () => {
  it("UT-GEN-171 sorts rows into their families, keeping the landing order", () => {
    const g = groupLandedRows([
      row(TYPE, "t1"), row(TURBINE, "w1"), row(TURBINE, "w2"), row(BRIDGE, "b1"), row(ALLOC, "a1"),
      row(PVTYPE, "pv1"), row("vsb_other", "x1"), row(ALLOC, "a2"),
    ]);
    expect(g.types.map((r) => r.id)).toEqual(["t1"]);
    expect(g.turbines.map((r) => r.id)).toEqual(["w1", "w2"]);
    expect(g.bridgeRows.map((r) => r.id)).toEqual(["b1"]);
    expect(g.allocations.map((r) => r.id)).toEqual(["a1", "a2"]);
    expect(g.pvTypes.map((r) => r.id)).toEqual(["pv1"]);
    expect(g.others).toEqual([row("vsb_other", "x1")]);
  });

  it("UT-GEN-172 nothing landed gives empty families", () => {
    expect(groupLandedRows([])).toEqual({ allocations: [], bridgeRows: [], turbines: [], types: [], pvTypes: [], others: [] });
  });
});

describe("planRollbackCreate", () => {
  const args = (landed: LandedRowRef[], rollupRan = false) =>
    ({ project: P, landed, rollupRan, remainingTypes: [old, newType] });

  it("UT-GEN-173 nothing landed: an empty plan, no deletes", () => {
    const plan = planRollbackCreate(args([], true));
    expect(plan.writes).toEqual([]);
    expect(plan.refusedReason).toBeUndefined();
  });

  it("UT-GEN-174 the type only: one delete of the type", () => {
    const plan = planRollbackCreate(args([row(TYPE, "t-new")]));
    expect(shape(plan.writes)).toEqual([`delete:${TYPE}`]);
    expect(plan.writes[0]).toMatchObject({ id: "t-new" });
  });

  it("UT-GEN-175 type and turbines: the turbines in one concurrent group, then the type", () => {
    const plan = planRollbackCreate(args([row(TYPE, "t-new"), ...turbines(3)]));
    expect(shape(plan.writes)).toEqual([`delete:${TURBINE}*`, `delete:${TURBINE}*`, `delete:${TURBINE}*`, `delete:${TYPE}`]);
    expect(plan.writes.slice(0, 3).map((w) => w.id)).toEqual(["w1", "w2", "w3"]);
  });

  it("UT-GEN-176 type, turbines, bridge row and allocations: reverse dependency order, groups kept apart by the bridge row", () => {
    const plan = planRollbackCreate(args([row(TYPE, "t-new"), ...turbines(2), row(BRIDGE, "b1"), ...allocs(2)]));
    expect(shape(plan.writes)).toEqual([
      `delete:${ALLOC}*`, `delete:${ALLOC}*`,
      `delete:${BRIDGE}`,
      `delete:${TURBINE}*`, `delete:${TURBINE}*`,
      `delete:${TYPE}`,
    ]);
    expect(plan.writes.every((w) => w.op === "delete")).toBe(true);
  });

  it("UT-GEN-177 every write is a plain delete op (the executor counts a 404 as gone), with a reason", () => {
    const plan = planRollbackCreate(args([row(TYPE, "t-new"), ...turbines(1), row(BRIDGE, "b1"), ...allocs(1)], true));
    const deletes = plan.writes.slice(0, -1);
    expect(deletes.every((w) => w.op === "delete" && !w.guarded && w.data === undefined && w.reason.startsWith("undo: "))).toBe(true);
  });

  it("UT-GEN-178 the roll-up goes last and only when it ran, recomputed without the deleted type", () => {
    const landed = [row(TYPE, "t-new"), ...turbines(2)];
    const without = planRollbackCreate(args(landed, false));
    expect(without.writes.some((w) => w.entitySet === "vsb_projects")).toBe(false);

    const withRollup = planRollbackCreate(args(landed, true));
    const last = withRollup.writes[withRollup.writes.length - 1]!;
    expect(last).toMatchObject({ op: "update", entitySet: "vsb_projects", id: "p1", data: { vsb_plantwtgcapacity: 3, vsb_plantwtgcost: 4 } });
    expect(last.concurrent).toBeFalsy();
    expect(withRollup.writes.filter((w) => w.entitySet === "vsb_projects")).toHaveLength(1);
    // Only the new type removed: the caller may also pass the remaining types without it.
    const clean = planRollbackCreate({ ...args(landed, true), remainingTypes: [old] });
    expect(clean.writes[clean.writes.length - 1]!.data).toEqual({ vsb_plantwtgcapacity: 3, vsb_plantwtgcost: 4 });
  });

  it("UT-GEN-179 the roll-up skips types that are not eligible (inactive or awaiting approval), as rule 14", () => {
    const pending = { ...old, id: "t-p", requestPermissionState: CHOICE_PLANT.requestPermissionState.pending };
    const plan = planRollbackCreate({ project: P, landed: [row(TYPE, "t-new")], rollupRan: true, remainingTypes: [old, pending, { ...old, id: "t-i", status: CHOICE_PLANT.status.inactive }] });
    const last = plan.writes[plan.writes.length - 1]!;
    expect(last.data).toEqual({ vsb_plantwtgcapacity: 3, vsb_plantwtgcost: 4 });
  });

  it("UT-GEN-180 a PV type uses the PV roll-up, without the deleted type", () => {
    const plan = planRollbackCreate({
      project: P, landed: [row(PVTYPE, "pv-new"), row(TURBINE, "u1")], rollupRan: true, remainingTypes: [],
      remainingPv: { pv: [{ capacity: 10, cost: 3000 }], inverters: [{ cost: 100 }], substructures: [{ cost: 50 }] },
    });
    expect(shape(plan.writes)).toEqual([`delete:${TURBINE}*`, `delete:${PVTYPE}`, "update:vsb_projects"]);
    expect(plan.writes[2]!.data).toEqual({ vsb_plantpvcapacitymwp: 10, vsb_plantpvcost: 3150 });
    const refused = planRollbackCreate({ project: P, landed: [row(PVTYPE, "pv-new")], rollupRan: true, remainingTypes: [] });
    expect(refused.writes).toEqual([]);
    expect(refused.refusedReason).toBeTruthy();
  });

  it("UT-GEN-181 an unknown row family is deleted after the type and before the roll-up", () => {
    const plan = planRollbackCreate(args([row("vsb_other", "x1"), row(TYPE, "t-new")], true));
    expect(shape(plan.writes)).toEqual([`delete:${TYPE}`, "delete:vsb_other", "update:vsb_projects"]);
  });

  it("UT-GEN-182 rows without an id are ignored; nothing left means an empty plan", () => {
    expect(planRollbackCreate(args([row(TYPE, "")], true)).writes).toEqual([]);
  });
});

describe("leftovers and texts", () => {
  it("UT-GEN-183 describeLeftovers counts the rows by family", () => {
    const d = describeLeftovers([row(TYPE, "t1"), ...turbines(40), row(BRIDGE, "b1"), row("vsb_other", "x")], { typeName: "WTG-0007" });
    expect(d).toEqual({ typeName: "WTG-0007", types: 1, turbines: 40, allocations: 0, bridgeRows: 1, other: 1, total: 43 });
    expect(describeLeftovers([], {})).toEqual({ types: 0, turbines: 0, allocations: 0, bridgeRows: 0, other: 0, total: 0 });
    // A name without a type left behind is dropped.
    expect(describeLeftovers(turbines(2), { typeName: "WTG-0007" }).typeName).toBeUndefined();
  });

  it("UT-GEN-184 the leftover message names exactly what is left", () => {
    const d = describeLeftovers([row(TYPE, "t1"), ...turbines(40)], { typeName: "WTG-0007" });
    expect(leftoversMessage(d)).toBe(
      'This save failed and could not be fully undone. Left behind: generator type "WTG-0007", 40 generators, 0 land-lease allocations. Press Retry cleanup to remove them.',
    );
    expect(ROLLBACK_MSG.leftover(d)).toBe(leftoversMessage(d));
    const all = describeLeftovers([row(TYPE, "t1"), ...turbines(1), ...allocs(1), row(BRIDGE, "b1"), row("vsb_other", "x"), row("vsb_other", "y")], {});
    expect(leftoversMessage(all)).toBe(
      "This save failed and could not be fully undone. Left behind: 1 generator type, 1 generator, 1 land-lease allocation, 1 device-type row, 2 other rows. Press Retry cleanup to remove them.",
    );
  });

  it("UT-GEN-185 the fixed texts", () => {
    expect(ROLLBACK_MSG.undone).toBe("This save failed and was undone. Nothing was kept.");
    expect(ROLLBACK_MSG.retryButton).toBe("Retry cleanup");
  });
});

describe("rollbackApplies", () => {
  it("UT-GEN-186 true for A (Add WTG type) and B (approval flow failed), false for every other save", () => {
    const all: Record<RollbackScenario, boolean> = {
      addWtgType: true, outOfCountryApprovalFailed: true,
      addPvType: false, addTurbine: false, editTurbine: false, applyToAll: false,
      replaceGeneratorType: false, replacePvType: false, deleteGeneratorType: false, deletePvType: false,
      toggleStatus: false, saveSimple: false, saveInverter: false, saveSubstructure: false,
    };
    for (const [scenario, expected] of Object.entries(all)) {
      expect(rollbackApplies(scenario as RollbackScenario), scenario).toBe(expected);
    }
    expect(rollbackApplies("somethingElse" as RollbackScenario)).toBe(false);
  });
});
