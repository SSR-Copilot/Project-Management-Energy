/**
 * What the Grid Operator screen refreshes after a write (OPT-13).
 *
 * Before, the Save re-read everything under `["pmGridOperator", projectId]`: the project and the grid-operator row. The Save writes
 * only `vsb_gridoperators` (`planSaveGridOperator`: one update, or one create) and no flow or plugin is triggered by that table or
 * reads it (`hooks.ts` header, `04-flow-inventory.md`), so the project row cannot change; only the row is re-read now.
 *
 * `GRID_OPERATOR_TABLE_READERS` maps a table to the queries that read it; `reload.test.ts` (UT-GRIDOP-OPT-2xx) proves that every
 * table a real plan writes has all its readers in the reload list and that every query `hooks.ts` defines is mapped.
 * Revert: put `qk.gridOperatorAll(projectId)` back in `gridOperatorReloadKeys`.
 */
import type { QueryKey } from "@tanstack/react-query";
import { ES } from "@/data/dataverseNames";
import { qk } from "@/data/keys";
import { planningProjectRowKey } from "@/data/planningProjectKey";

/** The queries that read each table the screen touches. */
export const GRID_OPERATOR_TABLE_READERS: Readonly<Record<string, (projectId: string) => readonly QueryKey[]>> = {
  [ES.gridOperators]: (id) => [qk.gridOperator(id, "row")],
  // PB-10: the project row's key is Planning's while `PM_PROJECT_ROW_SHARED` is on (`planningProjectRowKey`).
  [ES.projects]: (id) => [planningProjectRowKey(id, "gridOperator")],
};

/** The tables the Save writes (the plan's own `entitySet`). */
export const GRID_OPERATOR_WRITE_TABLES: readonly string[] = [ES.gridOperators];

/** The keys refreshed after a Save: the readers of every table it writes. */
export function gridOperatorReloadKeys(projectId: string | undefined): readonly QueryKey[] {
  const id = projectId ?? "";
  return GRID_OPERATOR_WRITE_TABLES.flatMap((table) => GRID_OPERATOR_TABLE_READERS[table]!(id));
}
