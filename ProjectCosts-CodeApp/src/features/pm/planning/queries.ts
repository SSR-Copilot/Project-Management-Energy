/**
 * Project Planning — the query options the screen's hooks and the boot prefetch share (PB-03).
 *
 * Key and function are defined once here, so a prefetch started from the URL lands under exactly the key the hook reads
 * (`app/pmScreenPrefetch.ts`). No React in this file.
 *
 * The prefetch never writes. The screen's `OnVisible` seeds (the planning row, the acquisition statuses) stay in the hooks'
 * query functions (guarded by `seedOnce.ts`), so the prefetch fills the row and the statuses ONLY when the read already
 * finds everything there (nothing to seed); otherwise it leaves the key empty and the screen's own query runs, seed included.
 */
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { qk } from "@/data/keys";
import {
  listAquisitionStatuses, listAquisitionTypes, loadPlanningProject, loadProjectPlanning,
} from "@/data/planning";
import { planningProjectRowKey } from "@/data/planningProjectKey";
import { planAquisitionSeed, type PlanningProject } from "./rules";

/** The project read, shared by the screen's query and by the seed paths that need the project's business unit. */
export const planningProjectQuery = (projectId: string) => queryOptions({
  queryKey: planningProjectRowKey(projectId, "planning"),
  queryFn: () => loadPlanningProject(projectId),
});

/** The two acquisition kinds' types (no project in it). */
export const aquisitionTypesQuery = () => queryOptions({
  queryKey: qk.aquisitionTypes, queryFn: listAquisitionTypes, staleTime: 5 * 60 * 1000,
});

/** The planning row's key (`useProjectPlanning`). */
export const planningRowKey = (projectId: string) => qk.planning(projectId, "row");
/** The acquisition statuses' key (`useAquisitionStatuses`). */
export const planningAquisitionKey = (projectId: string) => qk.planning(projectId, "aquisition");

/**
 * Boot prefetch of Planning's reads that need only the project id. Pure reads: the row is put in the cache only when it exists,
 * the statuses only when no type is missing one (`planAquisitionSeed` has nothing to write), so a project that needs a seed
 * is left to the screen's guarded seed.
 */
export async function prefetchPlanning(qc: QueryClient, projectId: string): Promise<void> {
  const types = qc.prefetchQuery(aquisitionTypesQuery());
  const row = (async () => {
    if (qc.getQueryData(planningRowKey(projectId)) !== undefined) return;
    const found = await loadProjectPlanning(projectId);
    if (found && qc.getQueryData(planningRowKey(projectId)) === undefined) qc.setQueryData(planningRowKey(projectId), found);
  })();
  const statuses = (async () => {
    await types;
    const typeRows = qc.getQueryData(aquisitionTypesQuery().queryKey);
    if (!typeRows || qc.getQueryData(planningAquisitionKey(projectId)) !== undefined) return;
    const rows = await listAquisitionStatuses(projectId, typeRows);
    // Nothing to seed: the same test the hook makes before it fetches the project.
    if (planAquisitionSeed(typeRows, rows, { id: projectId } as PlanningProject).writes.length > 0) return;
    if (qc.getQueryData(planningAquisitionKey(projectId)) === undefined) qc.setQueryData(planningAquisitionKey(projectId), rows);
  })();
  await Promise.all([qc.prefetchQuery(planningProjectQuery(projectId)), types, row, statuses]);
}
