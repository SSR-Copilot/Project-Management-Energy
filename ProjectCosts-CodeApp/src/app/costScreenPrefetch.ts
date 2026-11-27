/**
 * T-C01 (SCC-01 = NET-01, `BOOT_PREFETCH_COST_READS`): the prefetch of a Cost screen's OWN first reads.
 *
 * Before: a deep link, reload or new tab to a Cost screen started only the screen's chunk and the session project
 * (`app/bootPrefetch.ts`). The route gate (`CostProjectGate`) holds the whole Cost subtree until the project row and its
 * country / state / area lookups are in (two waves), so every read the screen makes with just the project id started two waves
 * late. After: those reads start at t = 0, beside the session project, under EXACTLY the keys and functions the screens' hooks
 * use (the shared factories of `features/cost/costing/costQueries.ts`, rule E1), so the screen finds the answer in the cache or
 * joins the read still in flight. Only the reads that need the project's country or technology wait for the project, as the
 * screens' own do.
 *
 * What it does NOT prefetch (rule P3): a key the screen re-reads on every visit (`refetchOnMount: "always"`: the Contracts rows,
 * payment targets and DevCo links, the OPEX book and device types). The canvas re-reads those on `OnVisible` (D109, D120, D123),
 * and a prefetch settled before the mount would only be re-read.
 *
 * It only warms the cache: nothing is written, no privilege is decided (every read runs under the signed-in user), a failed
 * prefetch is the screen's to retry (`prefetchQuery` never rejects), and a wrong guess costs one wasted read. Loaded on demand
 * (a dynamic import from `bootPrefetch.ts` / `intentPrefetch.ts`), so the start-up bundle does not carry it.
 */
import type { QueryClient } from "@tanstack/react-query";
import { resolveCategory } from "@/features/cost/capex-costs/rules";
import * as q from "@/features/cost/costing/costQueries";
import type { CostPath } from "./deepLinks";
import { sessionProjectQueryOptions } from "./SessionContext";

export interface CostPrefetchContext {
  /** The DEVEX/CAPEX tab the link names (`?category=N`); none is the Summary tab. */
  category?: number;
  /**
   * `"boot"`: the session project is being read by the same boot prefetch, so the reads that need the country or technology wait
   * for it (they join it, nothing is read twice). `"intent"`: the project is already in the cache when a screen is open; a read that
   * would need a project load that was never made is skipped, never started.
   */
  mode: "boot" | "intent";
}

type CostPrefetcher = (qc: QueryClient, projectId: string, ctx: CostPrefetchContext) => Promise<unknown>;

/** The project's country and technology, as `useProjectExtras` derives them from the session project. */
async function projectFacts(qc: QueryClient, projectId: string, mode: CostPrefetchContext["mode"]) {
  const full = sessionProjectQueryOptions(projectId, "full");
  // Joins the boot prefetch's read in flight (or a fresh answer): no second request.
  if (mode === "boot") await qc.prefetchQuery(full);
  // The row-only (PM) project carries both values too: on an in-app move from a Project Management screen it is what is cached.
  const row = qc.getQueryData(full.queryKey) ?? qc.getQueryData(sessionProjectQueryOptions(projectId, "pm").queryKey);
  return row ? { countryId: row.countryId, technology: row.technology } : undefined;
}

/** DEVEX/CAPEX: the tab strip, then the Summary's totals or the open category's book (`capex-costs/Screen.tsx`). */
async function prefetchCapex(qc: QueryClient, projectId: string, ctx: CostPrefetchContext): Promise<void> {
  const categories = qc.prefetchQuery(q.capexCategoriesQueryOptions());
  if (ctx.category === undefined) {
    // The Summary tab: `useCostBook(-1)` (the chart only), `useCapexTotals(true)` and the tab strip. One chart read serves all three.
    await Promise.all([
      categories,
      qc.prefetchQuery(q.costBookQueryOptions(qc, projectId, -1)),
      qc.prefetchQuery(q.capexTotalsQueryOptions(projectId)),
    ]);
    return;
  }
  // A category tab: the book (chart, contracts, payments; the comment threads start from its `onContracts`). A speculative N that
  // the screen turns into the Summary costs this one read.
  await Promise.all([categories, qc.prefetchQuery(q.costBookQueryOptions(qc, projectId, ctx.category))]);
}

/** Contracts: the reads that honour their stale time. The rows, payment targets and DevCo links re-read on every visit (not prefetched). */
async function prefetchContracts(qc: QueryClient, projectId: string): Promise<void> {
  await Promise.all([
    qc.prefetchQuery(q.capexAccountsAllQueryOptions()),
    qc.prefetchQuery(q.devCoContractsOptions(projectId)),
    qc.prefetchQuery(q.devCoCapexCostsQueryOptions(qc, projectId)),
  ]);
}

/** OPEX (O&M and Other): the catalogue and, once the country is known, its inflation. The book and the device types re-read on every visit. */
async function prefetchOpex(qc: QueryClient, projectId: string, ctx: CostPrefetchContext): Promise<void> {
  await Promise.all([
    qc.prefetchQuery(q.opexAccountsOptions),
    qc.prefetchQuery(q.opexSubaccountsOptions(qc)),
    projectFacts(qc, projectId, ctx.mode).then((facts) => (facts?.countryId
      ? qc.prefetchQuery(q.countryInflationQueryOptions(facts.countryId))
      : undefined)),
  ]);
}

/** Land Lease: the book, the generators, the currencies and, once the project is known, the country's inflation and the assumptions. */
async function prefetchLandLease(qc: QueryClient, projectId: string, ctx: CostPrefetchContext): Promise<void> {
  await Promise.all([
    qc.prefetchQuery(q.leaseBookQueryOptions(projectId)),
    qc.prefetchQuery(q.leaseGeneratorsQueryOptions(projectId)),
    qc.prefetchQuery(q.currenciesQueryOptions()),
    projectFacts(qc, projectId, ctx.mode).then((facts) => {
      if (!facts?.countryId) return undefined;
      return Promise.all([
        qc.prefetchQuery(q.countryInflationQueryOptions(facts.countryId)),
        // `useLeaseAssumptions` is enabled only when both are known.
        facts.technology === undefined ? undefined : qc.prefetchQuery(q.leaseAssumptionsQueryOptions(facts.countryId, facts.technology)),
      ]);
    }),
  ]);
}

/** Add Cost from Table is a panel over the CAPEX screen (same `?category=`): the CAPEX reads and the category's sheet. */
async function prefetchAddCost(qc: QueryClient, projectId: string, ctx: CostPrefetchContext): Promise<void> {
  // The panel resolves its category without the tab strip (`resolveCategory(search)`: an integer 0..4, otherwise the Summary).
  const sheetCategory = ctx.category === undefined ? -1 : resolveCategory(String(ctx.category));
  await Promise.all([
    prefetchCapex(qc, projectId, ctx),
    sheetCategory < 0 ? undefined : qc.prefetchQuery(q.addCostSheetQueryOptions(projectId, sheetCategory)),
  ]);
}

/** The Cost screens this module starts reads for, by route path. */
export const COST_SCREEN_PREFETCHERS: Record<CostPath, CostPrefetcher> = {
  "/costs/capex": prefetchCapex,
  "/costs/contracts": prefetchContracts,
  "/costs/opex/om": prefetchOpex,
  "/costs/opex/other": prefetchOpex,
  "/costs/land-lease": prefetchLandLease,
  "/costs/add-from-table": prefetchAddCost,
};

/** Starts the reads of the Cost screen `path`; resolves when they have settled (a failed one is the screen's to retry, never thrown). */
export function prefetchCostScreenReads(
  qc: QueryClient, path: CostPath, projectId: string, ctx: CostPrefetchContext = { mode: "boot" },
): Promise<unknown> {
  return COST_SCREEN_PREFETCHERS[path](qc, projectId, ctx);
}
