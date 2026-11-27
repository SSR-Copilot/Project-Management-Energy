/**
 * Revenues — the query options the screen's hooks and the boot prefetch share (T-C02 / SPB-02). No React in this file.
 *
 * One definition per read (rule E1): `hooks.ts` spreads these (adding `enabled`), and `app/pmScreenPrefetch.ts` hands the same
 * options to `prefetchQuery`. The edited contract's individual volumes are user-driven: not prefetched.
 */
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { listProjectStates } from "@/data/projectStatesRead";
import { qk } from "@/data/keys";
import {
  hasNegativePriceProduction, listBalancingPrices, listRevenueAssumptionRows, listRevenueContracts,
  listRevenueCountryInflation, loadRevenueProject,
} from "@/data/revenues";
import { findCurrency, loadFirstRevenueSubaccount } from "@/data/revenueLookups";
import { REFERENCE } from "@/data/queryPolicy";
import { revenueCurrencyCode } from "./rules";

/** The stale time of the reference reads. */

/**
 * `Set(gblRecordSelectedProject, LookUp(Projects, …))` (`OnVisible`), with its cluster state's `Order` read through the SAME cache entry General
 * Data uses (`qk.generalDataProjectStates`, 30 minutes, D136). Takes the client for that shared read.
 */
export const revenueProjectQueryOptions = (qc: QueryClient, projectId: string | undefined) => queryOptions({
  queryKey: qk.revenues(projectId ?? "", "project"),
  queryFn: () => loadRevenueProject(projectId!, () => qc.fetchQuery({
    queryKey: qk.generalDataProjectStates, queryFn: listProjectStates, ...REFERENCE,
  })),
});

/** `Assumptions Revenues SQL` for the project's country (`useRevenueAssumptions`). `enabled` is the hook's to add. */
export const revenueAssumptionsQueryOptions = (countryName: string | null) => queryOptions({
  queryKey: qk.revenuesReference("assumptions", countryName ?? "-"),
  queryFn: () => listRevenueAssumptionRows(countryName!),
  ...REFERENCE,
});

/** `colProjectRevenueContracts` (`useRevenueContracts`). `enabled` is the hook's to add. */
export const revenueContractsQueryOptions = (projectId: string | undefined) => queryOptions({
  queryKey: qk.revenues(projectId ?? "", "contracts"),
  queryFn: () => listRevenueContracts(projectId!),
});

/** `colProjectBalancingPriceContracts` (`useBalancingPrices`). `enabled` is the hook's to add. */
export const balancingPricesQueryOptions = (projectId: string | undefined) => queryOptions({
  queryKey: qk.revenues(projectId ?? "", "balancing"),
  queryFn: () => listBalancingPrices(projectId!),
});

/** Rule 18 — `_ProductionExist` (`useNegativePriceProduction`). `enabled` is the hook's to add. */
export const negativePriceProductionQueryOptions = (projectId: string | undefined) => queryOptions({
  queryKey: qk.revenues(projectId ?? "", "negativePriceProduction"),
  queryFn: () => hasNegativePriceProduction(projectId!),
});

/** Rule 17 — `Country Inflation Profiles` for the project's country (`useCountryInflationProfiles`). `enabled` is the hook's to add. */
export const revenueInflationQueryOptions = (countryId: string | null) => queryOptions({
  queryKey: qk.revenuesReference("inflation", countryId ?? "-"),
  queryFn: () => listRevenueCountryInflation(countryId!),
  ...REFERENCE,
});

/** `First(colRevenueSubaccounts)` (`useRevenueSubaccount`). */
export const revenueSubaccountQueryOptions = () => queryOptions({
  queryKey: qk.revenuesReference("subaccount"),
  queryFn: loadFirstRevenueSubaccount,
  ...REFERENCE,
});

/** `drp_…_Currency_1` — the project country's default currency by ISO code (`useRevenueCurrency`). `enabled` is the hook's to add. */
export const revenueCurrencyQueryOptions = (countryName: string | null) => {
  const code = revenueCurrencyCode(countryName);
  return queryOptions({
    queryKey: qk.revenuesReference("currency", code),
    queryFn: () => findCurrency(code, { onlyThisCode: true }),
    ...REFERENCE,
  });
};

/**
 * Boot prefetch: the project, the contracts, the balancing prices, the production check and the sub-account need only the id (or
 * nothing) and start at once; the country's assumptions, currency and inflation wait for the project row, as the screen's own reads do.
 */
export async function prefetchRevenues(qc: QueryClient, projectId: string): Promise<void> {
  const project = revenueProjectQueryOptions(qc, projectId);
  const row = qc.prefetchQuery(project);
  await Promise.all([
    row,
    qc.prefetchQuery(revenueContractsQueryOptions(projectId)),
    qc.prefetchQuery(balancingPricesQueryOptions(projectId)),
    qc.prefetchQuery(negativePriceProductionQueryOptions(projectId)),
    qc.prefetchQuery(revenueSubaccountQueryOptions()),
    row.then(() => {
      const found = qc.getQueryData(project.queryKey);
      // The screen reads these only once it has the project (`project !== null`, `project?.countryName`).
      if (!found) return undefined;
      return Promise.all([
        found.countryName ? qc.prefetchQuery(revenueAssumptionsQueryOptions(found.countryName)) : undefined,
        qc.prefetchQuery(revenueCurrencyQueryOptions(found.countryName)),
        found.countryCode ? qc.prefetchQuery(revenueInflationQueryOptions(found.countryCode)) : undefined,
      ]);
    }),
  ]);
}
