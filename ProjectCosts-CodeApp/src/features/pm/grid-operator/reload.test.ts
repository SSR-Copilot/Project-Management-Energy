/**
 * UT-GRIDOP-OPT-2xx — the Grid Operator reload safety net (OPT-13). Every table the Save plan writes must refresh every query that
 * reads it. BEFORE (unmodified tree): the Save invalidated `qk.gridOperatorAll`, the project query and the row query.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ES } from "@/data/dataverseNames";
import { qk } from "@/data/keys";
import { GRID_OPERATOR_TABLE_READERS, GRID_OPERATOR_WRITE_TABLES, gridOperatorReloadKeys } from "./reload";
import { emptyForm, planSaveGridOperator, type GridOperatorProject, type GridOperatorRecord } from "./rules";

const PID = "11111111-1111-1111-1111-111111111111";
const text = (keys: readonly unknown[]) => keys.map((k) => JSON.stringify(k));
const project: GridOperatorProject = {
  id: PID, projectNumber: "DE-1", endDate: null, projectStartDate: null, totalCapacity: null, netYieldP50: null,
  clusterStateName: null, owningBusinessUnitId: "bu-1",
};

describe("Grid Operator reload (OPT-13)", () => {
  it("UT-GRIDOP-OPT-201 a Save refreshes the row query only, not the project", () => {
    expect(text(gridOperatorReloadKeys(PID))).toEqual(text([qk.gridOperator(PID, "row")]));
  });

  it("UT-GRIDOP-OPT-202 every table a real Save plan writes (update and create) has all its readers in the reload list", () => {
    const plans = [
      planSaveGridOperator(emptyForm(), project, null),
      planSaveGridOperator(emptyForm(), project, { id: "g-1" } as GridOperatorRecord),
    ];
    const written = new Set(plans.flatMap((p) => p.writes.map((w) => w.entitySet)));
    expect([...written]).toEqual([ES.gridOperators]);
    for (const table of written) {
      for (const reader of text(GRID_OPERATOR_TABLE_READERS[table]!(PID))) expect(text(gridOperatorReloadKeys(PID))).toContain(reader);
    }
    expect(GRID_OPERATOR_WRITE_TABLES).toEqual([...written]);
  });

  it("UT-GRIDOP-OPT-203 every query hooks.ts defines is mapped to a table", () => {
    // PB-03 / PB-10: the row key lives in `queries.ts`, the project key (Planning's, or its own with the switch off) in `data/planningProjectKey.ts`.
    const here = dirname(fileURLToPath(import.meta.url));
    const src = ["queries.ts", join("..", "..", "..", "data", "planningProjectKey.ts")]
      .map((f) => readFileSync(join(here, f), "utf8")).join("\n");
    const used = [...src.matchAll(/qk\.gridOperator\([^,]+,\s*"(\w+)"\)/g)].map((m) => m[1]);
    const mapped = Object.values(GRID_OPERATOR_TABLE_READERS).flatMap((f) => f(PID).map((k) => (k as readonly unknown[])[2]));
    expect(used.length).toBe(2);
    for (const u of used) expect(mapped).toContain(u);
  });
});
