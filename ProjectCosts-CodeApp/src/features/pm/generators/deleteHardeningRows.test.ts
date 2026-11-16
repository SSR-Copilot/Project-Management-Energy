/**
 * Generators delete hardening, rules part (work package X3), DEL-5: the pure helpers over landed / deleted rows
 * (`remainingRows`, `plannedDeleteRows`, `deletePartialMessage`, `DELETE_PARTIAL_MSG`), `planRollbackCreate`'s `maybeLanded`
 * and the two `ROLLBACK_MSG` texts. IDs 981 to 998 (953 to 980 are in `deleteHardening.test.ts`).
 */
import { describe, it, expect } from "vitest";
import type { LandedRow } from "@/data/executePlan";
import { createdRowRef, emptyPlan, type WritePlan } from "@/data/writePlan";
import * as R from "./rules";
import { ALLOC, BRIDGE, COST, OPEX, P, PVTYPE, TURBINE, TYPE, n } from "./bulkPlans.testkit";

const row = (entitySet: string, id: string): LandedRow => ({ entitySet, id });

describe("DEL-5: remainingRows and the LandedRowRef alias", () => {
  it("UT-GEN-981 remainingRows: the rows of landed that are not deleted, in landed order; a row deleted twice or unknown to landed changes nothing", () => {
    const landed = [row(TYPE, "t1"), row(TURBINE, "w1"), row(TURBINE, "w2"), row(ALLOC, "a1")];
    expect(R.remainingRows(landed, [row(TURBINE, "w1"), row(ALLOC, "a1"), row(ALLOC, "a1"), row(ALLOC, "zzz")])).toEqual([row(TYPE, "t1"), row(TURBINE, "w2")]);
    expect(R.remainingRows(landed, [])).toEqual(landed);
    expect(R.remainingRows(landed, landed)).toEqual([]);
    expect(R.remainingRows([], landed)).toEqual([]);
    const input = [...landed];
    R.remainingRows(input, [row(TYPE, "t1")]);
    expect(input).toEqual(landed);
  });

  it("UT-GEN-982 remainingRows matches entity set and id case-insensitively, and the same id on another entity set is a different row", () => {
    const landed = [row(TURBINE, "AAAA-1"), row(ALLOC, "aaaa-1")];
    expect(R.remainingRows(landed, [row(TURBINE.toUpperCase(), "aaaa-1")])).toEqual([row(ALLOC, "aaaa-1")]);
    expect(R.remainingRows(landed, [row(ALLOC, "AAAA-1")])).toEqual([row(TURBINE, "AAAA-1")]);
  });

  it("UT-GEN-983 LandedRowRef is the engine's LandedRow (assignable both ways)", () => {
    const fromEngine: LandedRow = { entitySet: TYPE, id: "t" };
    const asRef: R.LandedRowRef = fromEngine;
    const back: LandedRow = asRef;
    expect(back).toEqual(fromEngine);
  });
});

describe("DEL-5: plannedDeleteRows", () => {
  it("UT-GEN-984 lists every delete write in plan order with its entity set and id; creates, updates and bulk steps are skipped", () => {
    const plan: WritePlan = {
      log: [],
      writes: [
        { op: "update", entitySet: TYPE, id: "t1", data: {}, reason: "u" },
        { op: "delete", entitySet: ALLOC, id: "a1", reason: "d1", hardened: true },
        { op: "create", entitySet: TURBINE, data: {}, reason: "c" },
        { op: "delete", entitySet: COST, id: "c1", reason: "d2" },
        { op: "updateMany", entitySet: TURBINE, rows: [{ id: "w1", data: {} }], reason: "m" },
        { op: "delete", entitySet: TYPE, id: "t1", reason: "d3", hardened: true, confirm: true },
      ],
    };
    expect(R.plannedDeleteRows(plan)).toEqual([row(ALLOC, "a1"), row(COST, "c1"), row(TYPE, "t1")]);
    expect(R.plannedDeleteRows(emptyPlan())).toEqual([]);
  });

  it("UT-GEN-985 a delete whose id is a created-row placeholder (or empty) names no real row and is skipped", () => {
    const plan: WritePlan = {
      log: [],
      writes: [
        { op: "delete", entitySet: TURBINE, id: "@created", reason: "x" },
        { op: "delete", entitySet: TURBINE, id: createdRowRef(1), reason: "y" },
        { op: "delete", entitySet: TURBINE, id: "", reason: "z" },
        { op: "delete", entitySet: TURBINE, id: "w1", reason: "ok" },
      ],
    };
    expect(R.plannedDeleteRows(plan)).toEqual([row(TURBINE, "w1")]);
  });

  it("UT-GEN-986 of a real plan builder: a type delete lists the cleanup rows, the O&M costs and the type, not the roll-up", () => {
    const type = { id: "t1" } as R.GeneratorTypeRow;
    const plan = R.planDeleteGeneratorType({
      project: P, type, allTypes: [type], allocations: [{ id: "a1", costId: "c1" }, { id: "a2", costId: "c2" }],
      allocationCountByCost: { c1: 5, c2: 1 }, opexCostIds: ["o1"],
    });
    expect(R.plannedDeleteRows(plan)).toEqual([row(ALLOC, "a1"), row(OPEX, "o1"), row(COST, "c2"), row(TYPE, "t1")]);
  });
});

describe("DEL-5: deletePartialMessage and DELETE_PARTIAL_MSG", () => {
  const attempted = [
    row(ALLOC, "a1"), row(ALLOC, "a2"), row(ALLOC, "a3"), row(OPEX, "o1"), row(COST, "c1"),
    row(TURBINE, "w1"), row(TURBINE, "w2"), row(TYPE, "t1"),
  ];

  it("UT-GEN-987 everything deleted gives null (nothing to say); nothing attempted gives null", () => {
    expect(R.deletePartialMessage({ attempted, deleted: attempted })).toBeNull();
    expect(R.deletePartialMessage({ attempted: [], deleted: [] })).toBeNull();
    expect(R.deletePartialMessage({ attempted: [row(TYPE, "T1")], deleted: [row(TYPE, "t1")] })).toBeNull();
  });

  it("UT-GEN-988 the text names both halves with counts per family, singular and plural, and says how to finish", () => {
    const text = R.deletePartialMessage({
      attempted,
      deleted: [row(TURBINE, "w1"), row(TURBINE, "w2"), row(TYPE, "t1"), row(OPEX, "o1")],
    });
    expect(text).toBe("Removed: 1 generator type, 2 generators, 1 O&M cost. Not removed: 3 land-lease allocations, 1 land-lease cost. Press Delete again to finish.");
  });

  it("UT-GEN-989 the plan's own example: 1 generator type and 12 generators removed, 3 allocations left", () => {
    const rows = [row(TYPE, "t1"), ...n(12, (i) => row(TURBINE, `w${i}`)), ...n(3, (i) => row(ALLOC, `a${i}`))];
    const text = R.deletePartialMessage({ attempted: rows, deleted: rows.slice(0, 13) });
    expect(text).toBe("Removed: 1 generator type, 12 generators. Not removed: 3 land-lease allocations. Press Delete again to finish.");
  });

  it("UT-GEN-990 an empty half is left out: nothing removed, or only the roll-up-free rows left", () => {
    expect(R.deletePartialMessage({ attempted: [row(ALLOC, "a1")], deleted: [] }))
      .toBe("Not removed: 1 land-lease allocation. Press Delete again to finish.");
    expect(R.deletePartialMessage({ attempted: [row(ALLOC, "a1"), row(TYPE, "t1")], deleted: [row(ALLOC, "a1")] }))
      .toBe("Removed: 1 land-lease allocation. Not removed: 1 generator type. Press Delete again to finish.");
  });

  it("UT-GEN-991 every family has its own wording: PV type, device-type rows, other rows; a single type uses its name when given", () => {
    const text = R.deletePartialMessage({
      attempted: [row(PVTYPE, "p1"), row(BRIDGE, "b1"), row(BRIDGE, "b2"), row("vsb_other", "x1")],
      deleted: [],
    });
    expect(text).toBe("Not removed: 1 PV module type, 2 device-type rows, 1 other row. Press Delete again to finish.");
    expect(R.deletePartialMessage({ attempted: [row(TYPE, "t1"), row(ALLOC, "a1")], deleted: [row(ALLOC, "a1")], typeName: "WTG 12" }))
      .toBe('Removed: 1 land-lease allocation. Not removed: generator type "WTG 12". Press Delete again to finish.');
    expect(R.deletePartialMessage({ attempted: [row(TYPE, "t1"), row(TYPE, "t2")], deleted: [], typeName: "WTG 12" }))
      .toBe("Not removed: 2 generator types. Press Delete again to finish.");
  });

  it("UT-GEN-992 the pieces are exported (DELETE_PARTIAL_MSG) and a half with no parts is left out of text()", () => {
    expect(R.DELETE_PARTIAL_MSG.removed).toBe("Removed:");
    expect(R.DELETE_PARTIAL_MSG.notRemoved).toBe("Not removed:");
    expect(R.DELETE_PARTIAL_MSG.pressAgain).toBe("Press Delete again to finish.");
    expect(R.DELETE_PARTIAL_MSG.text([], ["1 generator"])).toBe("Not removed: 1 generator. Press Delete again to finish.");
    expect(R.DELETE_PARTIAL_MSG.text(["1 generator"], [])).toBe("Removed: 1 generator. Press Delete again to finish.");
  });
});

describe("DEL-5: planRollbackCreate maybeLanded and the ROLLBACK_MSG texts", () => {
  const args = (landed: LandedRow[], maybeLanded?: LandedRow[]) => ({
    project: P, landed, ...(maybeLanded ? { maybeLanded } : {}), rollupRan: false, remainingTypes: [],
  });
  const ids = (plan: WritePlan) => plan.writes.map((w) => `${w.entitySet}:${w.id}`);

  it("UT-GEN-993 without maybeLanded the plan is exactly today's; an empty list changes nothing", () => {
    const landed = [row(TYPE, "t1"), row(TURBINE, "w1"), row(ALLOC, "a1")];
    const strip = (p: WritePlan) => p.writes.map(({ concurrencyGroup: _g, ...rest }) => rest);
    expect(strip(R.planRollbackCreate(args(landed, [])))).toEqual(strip(R.planRollbackCreate(args(landed))));
  });

  it("UT-GEN-994 maybe-landed rows are undone as well, in the same family order (allocations, bridge rows, turbines, types)", () => {
    const plan = R.planRollbackCreate(args([row(TYPE, "t1"), row(TURBINE, "w1")], [row(ALLOC, "a9"), row(BRIDGE, "b9"), row(TURBINE, "w9")]));
    expect(ids(plan)).toEqual([`${ALLOC}:a9`, `${BRIDGE}:b9`, `${TURBINE}:w1`, `${TURBINE}:w9`, `${TYPE}:t1`]);
    expect(plan.writes.every((w) => w.op === "delete" && w.hardened === true)).toBe(true);
  });

  it("UT-GEN-995 a row in both lists (or twice in maybeLanded, or in another case) is undone once; blank ids are skipped", () => {
    const plan = R.planRollbackCreate(args(
      [row(TURBINE, "W1")],
      [row(TURBINE, "w1"), row(ALLOC, "a1"), row(ALLOC, "A1"), row(ALLOC, "")],
    ));
    expect(ids(plan)).toEqual([`${ALLOC}:a1`, `${TURBINE}:W1`]);
    expect(plan.log).toEqual(["Undo of 2 landed rows"]);
  });

  it("UT-GEN-996 only maybe-landed rows still make a plan (nothing certain landed); a maybe-landed type drops out of the roll-up like a landed one", () => {
    expect(ids(R.planRollbackCreate(args([], [row(ALLOC, "a1")])))).toEqual([`${ALLOC}:a1`]);
    const keep = { id: "t-old", requestPermissionState: null, status: 0, generatorsCapacity: 3, generatorsCost: 4 };
    const plan = R.planRollbackCreate({
      project: P, landed: [], maybeLanded: [row(TYPE, "t-new")], rollupRan: true,
      remainingTypes: [keep, { ...keep, id: "t-new", generatorsCapacity: 99, generatorsCost: 99 }],
    });
    expect(plan.writes.map((w) => w.entitySet)).toEqual([TYPE, "vsb_projects"]);
    const without = R.planRollbackCreate({ project: P, landed: [row(TYPE, "t-new")], rollupRan: true, remainingTypes: [keep] });
    expect(plan.writes[1]!.data).toEqual(without.writes[1]!.data);
  });

  it("UT-GEN-997 describeLeftovers counts only what it is given: handing it landed (not maybe-landed) rows keeps the message true", () => {
    const landed = [row(TYPE, "t1"), row(TURBINE, "w1")];
    expect(R.describeLeftovers(landed, {}).total).toBe(2);
    expect(R.describeLeftovers(R.remainingRows([...landed, row(ALLOC, "a1")], [row(ALLOC, "a1")]), {}).total).toBe(2);
  });

  it("UT-GEN-998 ROLLBACK_MSG.progress and .noProject carry the wording Screen.tsx shows today", () => {
    expect(R.ROLLBACK_MSG.progress).toBe("Undoing the failed save, please wait...");
    expect(R.ROLLBACK_MSG.noProject).toBe("The failed save could not be undone automatically. Reload the page and check the generator types.");
  });
});
