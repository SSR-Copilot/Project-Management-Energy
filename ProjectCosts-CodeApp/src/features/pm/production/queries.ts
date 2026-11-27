/**
 * Production — the query options the screen's hooks and the boot prefetch share (T-C02 / SPB-02). No React in this file.
 *
 * One definition per read (rule E1): `hooks.ts` spreads these (adding `enabled`), and `app/pmScreenPrefetch.ts` hands the same
 * options to `prefetchQuery`, so the screen finds the answer a deep link started before the route gate opened. The edited yield's
 * stored seasonality and negative prices are user-driven (`useStoredSeasonality`, `energyYieldId`): not prefetched.
 */
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { qk } from "@/data/keys";
import { listEnergyYields, listStandardRevenueAssumptions, loadProductionProject } from "@/data/production";

/** The stale time of the Fabric standard assumptions (reference data). */
const ASSUMPTIONS_STALE = 30 * 60 * 1000;

/** `gblRecordSelectedProject` (`useProductionProject`). `enabled` is the hook's to add. */
export const productionProjectQueryOptions = (projectId: string | undefined) => queryOptions({
  queryKey: qk.production(projectId ?? "", "project"),
  queryFn: () => loadProductionProject(projectId!),
});

/** `colEnergyYieldsInProject` (`useEnergyYields`). `enabled` is the hook's to add. */
export const energyYieldsQueryOptions = (projectId: string | undefined) => queryOptions({
  queryKey: qk.production(projectId ?? "", "yields"),
  queryFn: () => listEnergyYields(projectId!),
});

/** `colStandardSeasonalityYeild` / `colStandardNegativePricePV` — the project country's Fabric SQL rows (`useRevenueAssumptions`). `enabled` is the hook's to add. */
export const productionAssumptionsQueryOptions = (countryName: string | null | undefined) => queryOptions({
  queryKey: qk.production("", "standardAssumptions", countryName ?? ""),
  queryFn: () => listStandardRevenueAssumptions(countryName!),
  staleTime: ASSUMPTIONS_STALE,
});

/**
 * Boot prefetch: the project and the yields need only the id and start at once; the country's Fabric assumptions wait for the
 * project row, as the screen's own read does (`useRevenueAssumptions(project?.countryName)`).
 */
export async function prefetchProduction(qc: QueryClient, projectId: string): Promise<void> {
  const project = productionProjectQueryOptions(projectId);
  const row = qc.prefetchQuery(project);
  await Promise.all([
    row,
    qc.prefetchQuery(energyYieldsQueryOptions(projectId)),
    row.then(() => {
      const countryName = qc.getQueryData(project.queryKey)?.countryName;
      return countryName ? qc.prefetchQuery(productionAssumptionsQueryOptions(countryName)) : undefined;
    }),
  ]);
}
