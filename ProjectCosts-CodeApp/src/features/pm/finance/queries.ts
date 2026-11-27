/**
 * Finance — the REFERENCE query options the screen's hooks and the boot prefetch share (T-C02 / SPB-02). No React in this file.
 *
 * Only the 30-minute reference reads are prefetched: the categories and the Fabric banks and KfW tranches. The project row, the
 * inputs, the repayments and the step-up margins are `refetchOnMount: "always"` (the canvas re-reads them on every `OnVisible`,
 * D109) and the screen gates its seeding on this visit's own read (`fresh`), so a settled prefetch would only be read again:
 * they stay the screen's. The country's debt assumptions need the project row (country name), which is such a read: not prefetched.
 */
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { listBanks, listFinancingCategories, listKfwTranches } from "@/data/finance";
import { qk } from "@/data/keys";
import { REFERENCE } from "@/data/queryPolicy";

/** The stale time of the reference reads. */

/** `colFinancingCategories` (`useFinancingCategories`). */
export const financingCategoriesQueryOptions = () => queryOptions({
  queryKey: qk.financeReference("categories"),
  queryFn: listFinancingCategories,
  ...REFERENCE,
});

/** `Assumptions Banks SQL` (`useBanks`). */
export const banksQueryOptions = () => queryOptions({
  queryKey: qk.financeReference("banks"),
  queryFn: listBanks,
  ...REFERENCE,
});

/** `AssumptionsKfWTrancheSQL` (`useKfwTranches`). */
export const kfwTranchesQueryOptions = () => queryOptions({
  queryKey: qk.financeReference("kfwTranches"),
  queryFn: listKfwTranches,
  ...REFERENCE,
});

/** Boot prefetch: the three reference reads, all independent of the project. */
export async function prefetchFinanceReference(qc: QueryClient): Promise<void> {
  await Promise.all([
    qc.prefetchQuery(financingCategoriesQueryOptions()),
    qc.prefetchQuery(banksQueryOptions()),
    qc.prefetchQuery(kfwTranchesQueryOptions()),
  ]);
}
