/**
 * PM Grid Operator — the Dataverse reads behind `features/pm/grid-operator` (connected 20 Oct 2026, D32).
 *
 * `vsb_gridoperator` (`vsb_gridoperators`) was registered for this screen with
 * `pac code add-data-source` (73 → 74). The project is read with Planning's `loadPlanningProject`
 * (`data/planning.ts`, reused by `hooks.ts`): it selects the same lock columns plus two this
 * screen does not use.
 */
import { Vsb_gridoperatorsService } from "@/generated/services/Vsb_gridoperatorsService";
import { GRID_OPERATOR_COL, type GridOperatorRecord } from "@/features/pm/grid-operator/rules";
import { fetchPage } from "./client";
import { lookupEq, numberOf } from "./odata";

type Raw = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => numberOf(v) ?? null;

const SELECT = [
  GRID_OPERATOR_COL.id, GRID_OPERATOR_COL.operator, GRID_OPERATOR_COL.voltageLevel,
  GRID_OPERATOR_COL.expansionRequired, GRID_OPERATOR_COL.expansionDetails,
  GRID_OPERATOR_COL.substationConstructionRequired, GRID_OPERATOR_COL.substationOperator,
  GRID_OPERATOR_COL.lengthInternal, GRID_OPERATOR_COL.diameterInternal,
  GRID_OPERATOR_COL.lengthExternal, GRID_OPERATOR_COL.diameterExternal,
];

/**
 * `Set(gblRecordGridOperator, LookUp('Grid Operators', Project.Project = gblRecordSelectedProject.Project))`
 * (`OnVisible`, and again after the Save). One row or `null`; `null` is the normal "no row yet"
 * state and the Save then creates.
 */
export async function loadGridOperator(projectId: string): Promise<GridOperatorRecord | null> {
  const rows = await fetchPage(
    "load the grid operator data",
    (o) => Vsb_gridoperatorsService.getAll(o),
    { select: SELECT, filter: lookupEq("vsb_projectid", projectId), top: 1 },
  );
  const r = (rows as unknown as Raw[])[0];
  if (!r) return null;
  return {
    id: String(r[GRID_OPERATOR_COL.id]),
    operator: str(r[GRID_OPERATOR_COL.operator]),
    voltageLevel: num(r[GRID_OPERATOR_COL.voltageLevel]),
    expansionRequired: num(r[GRID_OPERATOR_COL.expansionRequired]),
    expansionDetails: str(r[GRID_OPERATOR_COL.expansionDetails]),
    substationConstructionRequired: num(r[GRID_OPERATOR_COL.substationConstructionRequired]),
    substationOperator: str(r[GRID_OPERATOR_COL.substationOperator]),
    lengthInternal: num(r[GRID_OPERATOR_COL.lengthInternal]),
    diameterInternal: num(r[GRID_OPERATOR_COL.diameterInternal]),
    lengthExternal: num(r[GRID_OPERATOR_COL.lengthExternal]),
    diameterExternal: num(r[GRID_OPERATOR_COL.diameterExternal]),
  };
}
