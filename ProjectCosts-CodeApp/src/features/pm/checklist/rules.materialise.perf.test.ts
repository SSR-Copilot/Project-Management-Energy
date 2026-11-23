/**
 * Optimization programme B6, OPT-30 (S4-11): `planChecklistMaterialisation` builds the bulk rows (and calls `newRowId` once per
 * template) only for the bulk path. OLD (recorded first): the single-create path, the shipped one, built them anyway and drew one
 * row id per template. The plans must be unchanged. Ids: UT-CHKMAT-OPT-NNN.
 */
import { describe, expect, it, vi } from "vitest";
import { planChecklistMaterialisation, type DefaultChecklistTemplate } from "./rules";

const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const templates = (n: number): DefaultChecklistTemplate[] => Array.from({ length: n }, (_, i) => ({
  id: uuid(3000 + i), name: `Task ${i}`, clusterStateId: uuid(11), gateRelevance: i % 2 === 0, holdingTaskDescription: null, isCompletionDate: false, order: i,
}));
const ctx = { projectId: "p1", clusterStateId: uuid(11), owningBusinessUnitId: uuid(6) };

describe("OPT-30 S4-11: the bulk rows are built only for the bulk path", () => {
  it("UT-CHKMAT-OPT-001 the single-create path draws no row ids (OLD: one per template) and returns the same plan", () => {
    const newId = vi.fn(() => "id");
    const single = planChecklistMaterialisation(templates(20), ctx, { newId });
    expect(newId).not.toHaveBeenCalled();
    expect(single.writes).toHaveLength(20);
    expect(single.writes.every((w) => w.op === "create")).toBe(true);
    // Same plan as with no options at all.
    const strip = (pl: typeof single) => pl.writes.map(({ concurrencyGroup: _g, ...rest }) => rest);
    expect(strip(planChecklistMaterialisation(templates(20), ctx))).toEqual(strip(single));
  });

  it("UT-CHKMAT-OPT-002 bulk with an Owning Business Unit draws one id per template and sends ONE bulk step", () => {
    let n = 0;
    const newId = vi.fn(() => `row-${n++}`);
    const plan = planChecklistMaterialisation(templates(5), ctx, { bulk: true, newId });
    expect(newId).toHaveBeenCalledTimes(5);
    expect(plan.writes).toHaveLength(1);
  });

  it("UT-CHKMAT-OPT-003 bulk WITHOUT an Owning Business Unit keeps the single creates (and draws no ids)", () => {
    const newId = vi.fn(() => "id");
    const plan = planChecklistMaterialisation(templates(4), { ...ctx, owningBusinessUnitId: null }, { bulk: true, newId });
    expect(newId).not.toHaveBeenCalled();
    expect(plan.writes).toHaveLength(4);
    expect(plan.writes.every((w) => w.op === "create")).toBe(true);
  });

  it("UT-CHKMAT-OPT-004 no templates is an empty plan on every path", () => {
    expect(planChecklistMaterialisation([], ctx).writes).toEqual([]);
    expect(planChecklistMaterialisation([], ctx, { bulk: true }).writes).toEqual([]);
  });
});
