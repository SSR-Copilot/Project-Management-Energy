/**
 * Grid Operator — the query options the screen's hooks and the boot prefetch share (PB-03). No React in this file.
 */
import { queryOptions } from "@tanstack/react-query";
import { qk } from "@/data/keys";
import { loadGridOperator } from "@/data/gridOperator";
import { loadPlanningProject } from "@/data/planning";
import { planningProjectRowKey } from "@/data/planningProjectKey";

/** `gblRecordSelectedProject` through Planning's loader; PB-10: Planning's key while `PM_PROJECT_ROW_SHARED` is on. */
export const gridOperatorProjectQuery = (projectId: string) => queryOptions({
  queryKey: planningProjectRowKey(projectId, "gridOperator"),
  queryFn: () => loadPlanningProject(projectId),
});

/** `gblRecordGridOperator`. */
export const gridOperatorRowQuery = (projectId: string) => queryOptions({
  queryKey: qk.gridOperator(projectId, "row"),
  queryFn: () => loadGridOperator(projectId),
});
