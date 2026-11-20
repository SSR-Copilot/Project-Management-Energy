/**
 * Project Generators — the query options the screen and the prefetch share (D141, `GENERATORS_PERF.prefetch`).
 *
 * The reads that depend on nothing but the project id (or on nothing at all) live here, so the screen's hooks
 * (`hooks.ts`) and the prefetch (`prefetchGenerators`, started by `app/bootPrefetch.ts` and by `app/generatorsWarmup.ts`)
 * read the very same key through the very same function: a prefetch lands where the screen looks, and a prefetch that
 * fails or is never used costs one wasted request (the D119 pattern). No React in this file.
 *
 * NOT prefetched, because each needs another read first: the turbines (their key embeds the type ids), the models (the
 * types' generator ids), the orderable catalogue (the project's FID), the device costs (its country) and the price index
 * (the FID).
 *
 * EXCEPTION (D142, `GENERATORS_PERF.readsByProject`, default OFF): with the switch ON the turbines are read by the project,
 * need nothing else first, and are prefetched too (`turbinesByProjectQueryOptions`, one read more).
 */
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { qk } from "@/data/keys";
import { generatorsPerf } from "@/data/generatorsPerfFlags";
import {
  listGeneratorTypes, listInverterTypes, listProjectTurbinesByProject, listPvModules, listPvTypes, listSimpleTypes,
  listSubstructureTypes, loadGeneratorsProject, loadProjectPlanning,
} from "@/data/generators";
import { logAction } from "@/platform/requestLog";

/** How long a reference list counts as fresh. */
export const REFERENCE_STALE = 30 * 60 * 1000;

export type SimpleFamilyKey = "storage" | "hydrogen" | "substation";

/** `gblRecordSelectedProject` (+ its country) — re-read on every visit, as `OnVisible` does. */
export const generatorsProjectQueryOptions = (projectId: string) => queryOptions({
  queryKey: qk.generators(projectId, "project"),
  queryFn: () => loadGeneratorsProject(projectId),
});

/** `locProjectPlanning` — the height limitation. */
export const projectPlanningQueryOptions = (projectId: string) => queryOptions({
  queryKey: qk.generators(projectId, "planning"),
  queryFn: () => loadProjectPlanning(projectId),
});

export const generatorTypesQueryOptions = (projectId: string) => queryOptions({
  queryKey: qk.generators(projectId, "types"),
  queryFn: () => listGeneratorTypes(projectId),
});

/**
 * The turbines read by the project, not by the type ids (D142, `GENERATORS_PERF.readsByProject`). The key sits under the
 * `turbines` family prefix (`qk.generators(project, "turbines")`), so every reload of that family reaches it, and it embeds no
 * type id, so the read depends on nothing and can start at once. Used only while the switch is ON.
 */
export const turbinesByProjectQueryOptions = (projectId: string) => queryOptions({
  queryKey: qk.generators(projectId, "turbines", "byProject"),
  queryFn: () => listProjectTurbinesByProject(projectId),
});

/** `colPVModulesSuppliers`. */
export const pvModuleCatalogQueryOptions = () => queryOptions({
  queryKey: qk.pvModuleCatalog,
  queryFn: listPvModules,
  staleTime: REFERENCE_STALE,
});

export const pvTypesQueryOptions = (projectId: string) => queryOptions({
  queryKey: qk.generators(projectId, "pv"),
  queryFn: () => listPvTypes(projectId),
});

export const inverterTypesQueryOptions = (projectId: string) => queryOptions({
  queryKey: qk.generators(projectId, "inverter"),
  queryFn: () => listInverterTypes(projectId),
});

export const substructureTypesQueryOptions = (projectId: string) => queryOptions({
  queryKey: qk.generators(projectId, "substructure"),
  queryFn: () => listSubstructureTypes(projectId),
});

/** BESS / Hydrogen / Substation. */
export const simpleTypesQueryOptions = (family: SimpleFamilyKey, projectId: string) => queryOptions({
  queryKey: qk.generators(projectId, family),
  queryFn: () => listSimpleTypes(family, projectId),
});

/** How many reads `prefetchGenerators` starts (the tests pin it, so a read added here is a deliberate change). */
export const PREFETCHED_READS = 10;

/**
 * Starts the independent reads of the Generators screen and resolves when they have settled. It only warms the cache:
 * nothing is written, no privilege is decided here, and a failed read is left for the screen to retry (`prefetchQuery`
 * never rejects). Each fetch is traced by `app/queryLog.ts` (a `[VSB] ACTION Load …` line each); this adds the one line
 * that says why they ran (CONVENTIONS rule 23: counts only, no ids).
 */
export async function prefetchGenerators(qc: QueryClient, projectId: string): Promise<void> {
  const turbinesByProject = generatorsPerf().readsByProject;
  logAction(`Generators prefetch: ${PREFETCHED_READS + (turbinesByProject ? 1 : 0)} independent reads started`);
  await Promise.all([
    ...(turbinesByProject ? [qc.prefetchQuery(turbinesByProjectQueryOptions(projectId))] : []),
    qc.prefetchQuery(generatorsProjectQueryOptions(projectId)),
    qc.prefetchQuery(projectPlanningQueryOptions(projectId)),
    qc.prefetchQuery(generatorTypesQueryOptions(projectId)),
    qc.prefetchQuery(pvModuleCatalogQueryOptions()),
    qc.prefetchQuery(pvTypesQueryOptions(projectId)),
    qc.prefetchQuery(inverterTypesQueryOptions(projectId)),
    qc.prefetchQuery(substructureTypesQueryOptions(projectId)),
    qc.prefetchQuery(simpleTypesQueryOptions("storage", projectId)),
    qc.prefetchQuery(simpleTypesQueryOptions("hydrogen", projectId)),
    qc.prefetchQuery(simpleTypesQueryOptions("substation", projectId)),
  ]);
}
