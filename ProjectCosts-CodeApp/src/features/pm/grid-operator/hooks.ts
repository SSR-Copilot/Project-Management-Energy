/**
 * Grid Operator Screen — the data layer (connected 20 Oct 2026, D32).
 *
 * READS:
 *  - the project (`gblRecordSelectedProject`, re-read on every visit as `OnVisible` does) through
 *    Planning's `loadPlanningProject` (`data/planning.ts`) — `vsb_name` (Project ID), End Date,
 *    Project Start Date, Total Capacity, Net Yield p50, Cluster State, the business unit;
 *  - the project's `Grid Operators` row (`data/gridOperator.ts`), `$top=1` by `_vsb_projectid_value`.
 *
 * WRITES — one `WritePlan` from `rules.ts` (`saveGridOperatorJob`), run by `usePlanWrite`:
 *  - Save: one update of `vsb_gridoperators`, or one create when the project has no row, with the
 *    ten form columns, the Project bind and the project's Owning Business Unit, on every save, as
 *    the canvas `Patch`. Afterwards the row is re-read (`qk.gridOperatorAll`), as the canvas
 *    re-`LookUp`s it.
 * The screen writes nothing on visit.
 *
 * SERVER AUTOMATION (`ProjectDocs/migration-plans/04-flow-inventory.md`, verified 19 Oct 2026, and a
 * search of every workflow JSON and `SdkMessageProcessingStep` in the extract, 20 Oct 2026): NO flow is
 * triggered by `vsb_gridoperator` and no plugin step is registered on it; no flow reads it. The screen
 * calls no flow (the canvas has no `.Run(`). It writes no `vsb_projects` column.
 *
 * PERMISSIONS: the canvas `CanEditSelectedProject` (`DataSourceInfo(Projects, CreatePermission)` AND
 * `RecordInfo(project, EditPermission)`) has no SDK equivalent (D1); it passes and Dataverse refuses
 * what the user may not do (`GRID_OPERATOR_CAN_EDIT`).
 */
import { useQuery } from "@tanstack/react-query";
import { ES } from "@/data/dataverseNames";
import { qk } from "@/data/keys";
import type { ScreenData } from "@/data/notConnected";
import { usePlanWrite } from "@/data/usePlanWrite";
import { loadPlanningProject } from "@/data/planning";
import { loadGridOperator } from "@/data/gridOperator";
import type { GridOperatorProject, GridOperatorRecord } from "./rules";

/** The entity sets this screen reads and writes. */
export const TABLES: readonly string[] = [ES.projects, ES.gridOperators];

/** `gblCurrentUser.CanEditSelectedProject` — `DataSourceInfo` / `RecordInfo` pass; the server decides (D1). */
export const GRID_OPERATOR_CAN_EDIT = true;

const out = <T,>(q: { data?: T; isLoading: boolean; error: unknown }, empty: T): ScreenData<T> =>
  ({ data: q.data ?? empty, isLoading: q.isLoading, error: q.error ?? undefined, connected: true });

/** `Set(gblRecordSelectedProject, LookUp(Projects, …))` (`OnVisible`). */
export function useGridOperatorProject(projectId: string | undefined): ScreenData<GridOperatorProject | null> {
  const q = useQuery({
    queryKey: qk.gridOperator(projectId ?? "", "project"),
    queryFn: () => loadPlanningProject(projectId!),
    enabled: Boolean(projectId),
  });
  return out<GridOperatorProject | null>(q, null);
}

/** `Set(gblRecordGridOperator, LookUp('Grid Operators', Project.Project = …))` (`OnVisible`). */
export function useGridOperator(projectId: string | undefined): ScreenData<GridOperatorRecord | null> {
  const q = useQuery({
    queryKey: qk.gridOperator(projectId ?? "", "row"),
    queryFn: () => loadGridOperator(projectId!),
    enabled: Boolean(projectId),
  });
  return out(q, null);
}

/** Runs the Save job from `rules.ts` and re-reads the row. */
export function useGridOperatorWrites(projectId: string | undefined) {
  return usePlanWrite({
    invalidate: [qk.gridOperatorAll(projectId ?? "")],
    action: "change this project's grid operator data",
  });
}
