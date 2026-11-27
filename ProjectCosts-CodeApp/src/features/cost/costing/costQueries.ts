/**
 * The Cost screens' query options, in ONE place (T-C01, SCC-01 / NET-01, rule E1 of the entry-prefetch design).
 *
 * Each factory holds a read's key, query function and freshness exactly as the screen's hook (`useCostBook.ts`,
 * `contracts/hooks.ts`) had them inline. The hooks spread the factory (adding `enabled`), and the boot / intent prefetch
 * (`app/costScreenPrefetch.ts`) hands the same factory to `prefetchQuery`, so a prefetch can never drift from the key or the
 * function the screen reads: a prefetched answer is found by the screen's own query, nothing is read twice.
 *
 * No React in this file. Nothing here writes, and none of it decides a privilege: every read runs under the signed-in user.
 * What a prefetch is worth is bounded by the OBSERVER's own options: a key the screen re-reads on every visit
 * (`refetchOnMount: "always"`: Contracts, the OPEX book, the OPEX device types) is deliberately NOT prefetched (rule P3).
 */
import type { QueryClient } from "@tanstack/react-query";
import { qk } from "@/data/keys";
import { costRepository } from "@/data/costRepository";
import { COST_READS_RETRY, OPEX_BOOK_REUSES_CATALOGUE } from "@/data/leaseOpexFlags";
import { NO_FOCUS_REFETCH } from "@/data/adminQueryPresets";
import { CAPEX_OPT } from "@/data/capexOptFlags";
import { loadComments } from "@/data/comments";
import { loadCapexCategories, type CostBookScope } from "@/data/costBook";
import { costStates, projectStatesQueryOptions } from "@/data/projectStates";
import { excludePendingFromBook, excludePendingFromSheet, isPendingContract, pendingDeletes } from "@/data/pendingDeletes";

/**
 * One read's options. An identity on purpose: the package's own `queryOptions` helper is not used here, so the existing hook tests that replace
 * `@tanstack/react-query` with a partial mock (`useAddCostSheet.test.ts`) keep working, and nothing else changes: `useQuery` and
 * `prefetchQuery` take the object as it is.
 */
const queryOptions = <T extends object>(options: T): T => options;

/**
 * dvopt T-14 (CA-11, `COST_READS_RETRY`): the four main Cost reads (book, Land Lease book, CAPEX totals, Add Cost sheet) used
 * `retry: false` with no recorded reason (a search of the decision log, the bug register and the git history found none), so one
 * transient 5xx / 429 showed "Cost data is unavailable". They now inherit the app default (`Providers.tsx`: `attempt < 2 &&
 * isRetryable`, a jittered wait): a transient failure is retried twice, a 403 or any other 4xx shows at once. The Add Cost sheet's
 * "no refetch while editing" protection (`NO_FOCUS_REFETCH`, `refetchOnReconnect`) is separate and unchanged, and a retry only
 * ever follows a failed fetch, so it never re-hydrates a grid that holds edits. `false`: `retry: false`, as before.
 */
export const readRetry = (): { retry?: false } => (COST_READS_RETRY ? {} : { retry: false });

/** The second element of the `["capex-comments", key]` query key: the contract ids, sorted and joined (one definition, CA-09). */
export function capexCommentsKey(contractIds: readonly string[]): string {
  return [...contractIds].sort().join(",");
}

/**
 * CA-09: starts the comment threads of `contractIds` under the key `useCapexComments` reads, unless that key already holds data.
 * `staleTime: Infinity` makes this a "fetch only when missing": a book reload never re-reads threads the cache already has (their
 * own freshness stays with `useCapexComments`: 30 s and the focus refetch). Fire-and-forget; `prefetchQuery` never rejects, so a
 * failed warm-up leaves the screen's own query to read on mount.
 */
export function prefetchCapexComments(client: QueryClient, contractIds: readonly string[]): void {
  if (contractIds.length === 0) return;
  void client.prefetchQuery({
    queryKey: ["capex-comments", capexCommentsKey(contractIds)],
    queryFn: () => loadComments(contractIds),
    staleTime: Infinity,
  });
}

/**
 * `colOpexAccounts` and `colOpexSubaccounts` (`OnStart.txt:622-640`).
 *
 * Global master data — two rows and nine rows on the org — so one query pair is cached for the
 * session rather than fetched per screen. `OpexScreen.tsx` carried both as transcribed constants
 * because no loader existed; `selectedAccount` / `defaultSubaccount` / `subaccountsForMode` take
 * exactly these shapes, so the constants were deletable the moment this landed.
 */
export const opexAccountsOptions = {
  queryKey: ["opex-accounts"] as const,
  staleTime: 30 * 60 * 1000,
  queryFn: () => costRepository().listOpexAccounts(),
};

/** The OPEX sub-account catalogue's query, shared by `useOpexCatalog` and (CB-08) the OPEX book, so the one cached read serves both. */
export const opexSubaccountsOptions = (queryClient: QueryClient) => ({
  queryKey: ["opex-subaccounts"] as const,
  staleTime: 30 * 60 * 1000,
  // B2 (OPT-06): the sub-accounts need the account NAMES, and the accounts query reads them. Pass its PROMISE (the
  // sub-account read starts at once, beside it), not nothing: with no argument `loadOpexSubaccounts` read the accounts a
  // second time. `ensureQueryData` joins the accounts read already in flight, so the table is read once.
  queryFn: () => costRepository().listOpexSubaccounts(queryClient.ensureQueryData(opexAccountsOptions)),
});

/**
 * The cost book of a screen (`useCostBook`). `enabled` is the hook's to add.
 *
 * @param category DEVEX/CAPEX tab index (`-1` the Summary tab). Omit it on screens that do not show cost lines.
 * @param options.everyVisit re-read the book every time the screen opens, whatever its age (OPEX, D123).
 * @param options.scope `"opex"` (B2, OPT-04): the OPEX screen's book; its key is `["cost-book", project, "none", "opex"]`.
 */
export function costBookQueryOptions(
  queryClient: QueryClient,
  projectId: string | undefined,
  category?: number,
  options?: { everyVisit?: boolean; scope?: CostBookScope },
) {
  const scope = options?.scope;
  const queryKey = ["cost-book", projectId, category ?? "none", ...(category === undefined && scope === "opex" ? ["opex"] : [])];
  return queryOptions({
    queryKey, ...readRetry(),
    ...(options?.everyVisit ? { refetchOnMount: "always" as const } : {}),
    // Rows a previous Add Cost from Table Save is still deleting in the background stay hidden
    // (D51 §11.19). The snapshot is taken when the read starts: every registry change is followed
    // by an invalidation, which cancels and restarts a read in flight.
    queryFn: async () => {
      const pending = pendingDeletes.snapshot();
      return excludePendingFromBook(await costRepository().getCostBook(projectId as string, category, {
        ...(scope ? { scope } : {}),
        // dvopt CB-08 (`OPEX_BOOK_REUSES_CATALOGUE`): the OPEX book's sub-account names come from the catalogue the screen already holds
        // (`["opex-subaccounts"]`, 30 min: the same ACTIVE rows), so a visit, a focus refetch and a post-write reload do not read
        // `vsb_opexsubaccounts` again. `ensureQueryData` returns a cached answer, joins one in flight, or reads it once.
        ...(scope === "opex" && category === undefined && OPEX_BOOK_REUSES_CATALOGUE
          ? {
            opexSubaccountNames: async () =>
              (await queryClient.ensureQueryData(opexSubaccountsOptions(queryClient))).map((s) => ({ id: s.id, name: s.name })),
          }
          : {}),
        // CA-09 (`COMMENTS_WITH_PAYMENTS`): the red comment dots no longer wait for the payments. Once the contract list is in, the
        // threads of those contracts start under the key the screen reads, in the same wave as the payments. A CAPEX tab only.
        ...(CAPEX_OPT.COMMENTS_WITH_PAYMENTS && category !== undefined && category >= 0
          ? { onContracts: (ids: string[]) => prefetchCapexComments(queryClient, ids.filter((id) => !isPendingContract(pending, id))) }
          : {}),
        // B2 (OPT-07d): the `Project States` a linked contract needs come from the shared D159 cache entry (the same active
        // rows in `Order`) instead of a read of their own; a warm cache costs no request.
        loadStates: async () => costStates(await queryClient.ensureQueryData(projectStatesQueryOptions())),
      }), pending);
    },
  });
}

/**
 * Per-category totals for the DEVEX/CAPEX Summary tab (`useCapexTotals`). `enabled` is the hook's to add.
 * See `costBookQueryOptions`: pending background deletes are left out of the sums (D51 §11.19).
 */
export const capexTotalsQueryOptions = (projectId: string | undefined) => queryOptions({
  queryKey: ["capex-totals", projectId],
  ...readRetry(),
  queryFn: () => costRepository().getCapexTotals(projectId as string, pendingDeletes.snapshot()),
});

/** The DEVEX/CAPEX category tab labels (`useCapexCategories`): global master data, cached for the session. */
export const capexCategoriesQueryOptions = () => queryOptions({
  queryKey: ["capex-categories"],
  staleTime: 30 * 60 * 1000,
  queryFn: () => loadCapexCategories(),
});

/** The Land Lease book's key (`useLeaseBook`, and every Land Lease write's invalidation). */
export const leaseBookKey = (projectId: string | undefined) =>
  ["land-lease-book", projectId ?? "none"] as const;

/** The Land Lease screen's book. `enabled` is the hook's to add. */
export const leaseBookQueryOptions = (projectId: string | undefined) => queryOptions({
  queryKey: leaseBookKey(projectId),
  ...readRetry(),
  queryFn: () => costRepository().getLeaseBook(projectId as string),
});

/** The project's generators as the Land Lease allocation list shows them (`useLeaseGenerators`). */
export const leaseGeneratorsQueryOptions = (projectId: string | undefined) => queryOptions({
  queryKey: ["land-lease-generators", projectId ?? "none"] as const,
  staleTime: 5 * 60 * 1000,
  queryFn: () => costRepository().getLeaseGenerators(projectId as string),
});

/** The transaction currencies (`useCurrencies`). */
export const currenciesQueryOptions = () => queryOptions({
  queryKey: ["transaction-currencies"] as const,
  staleTime: 30 * 60 * 1000,
  queryFn: () => costRepository().listCurrencies(),
});

/** `Country Inflation Profiles` of a country, every year and Area (`useCountryInflation`). `enabled` is the hook's to add. */
export const countryInflationQueryOptions = (countryId: string | undefined) => queryOptions({
  queryKey: ["country-inflation", countryId ?? "none"] as const,
  staleTime: 30 * 60 * 1000,
  queryFn: () => costRepository().getCountryInflation(countryId as string),
});

/** The Land Lease standard assumptions of the project's country and technology (`useLeaseAssumptions`). `enabled` is the hook's to add. */
export const leaseAssumptionsQueryOptions = (countryId: string | undefined, technology: number | null | undefined) => queryOptions({
  queryKey: ["land-lease-assumptions", countryId ?? "none", technology ?? "none"] as const,
  staleTime: 15 * 60 * 1000,
  queryFn: () => costRepository().getLeaseAssumptions(countryId, technology),
});

/**
 * The Add Cost from Table sheet of a category (`useAddCostSheet`). `enabled` is the hook's to add.
 *
 * The sheet is an editor: a refetch re-hydrates the grid (dropping unsaved edits) and clears the Screen's retry-id cache, so after a
 * failed save a focus or reconnect refetch would turn a safe "Save again" into a silent partial save. It still loads fresh on entry
 * and after a save.
 */
export const addCostSheetQueryOptions = (projectId: string | undefined, category: number) => queryOptions({
  queryKey: ["add-cost-sheet", projectId, category],
  ...readRetry(),
  ...NO_FOCUS_REFETCH,
  refetchOnReconnect: false,
  // A sheet loaded while an earlier Save's deletes still run must not show (and so re-plan)
  // the rows being deleted (D51 §11.19; the `blockedByPastCosts` branch reloads in place).
  queryFn: async () => {
    const pending = pendingDeletes.snapshot();
    return excludePendingFromSheet(await costRepository().loadAddCostSheet(projectId as string, category), pending);
  },
});

/* ═══════════════════════════════════════════════════════════════ Contracts ══ */

/** The chart of accounts the Contracts tree is built from (`useCapexAccounts`): master data maintained on the Admin screens. */
export const capexAccountsAllQueryOptions = () => queryOptions({
  queryKey: qk.capexAccountsAll,
  queryFn: () => costRepository().listCapexAccounts({ includeInactive: true }),
  staleTime: 30 * 60 * 1000,
});

/** The one definition of the DevCo CAPEX contracts read, shared by `useDevCoCapexContracts` and `useCapexCostRows` (S1-07). */
export function devCoContractsOptions(projectId: string | undefined) {
  return {
    queryKey: qk.devCoCapexContracts(projectId ?? "none"),
    queryFn: () => costRepository().listDevCoCapexContracts(projectId as string),
  };
}

/**
 * The project's monthly DevCo CAPEX cost rows (`useCapexCostRows`). `enabled` is the hook's to add.
 *
 * S1-07: the first hop of this read is the DevCo contracts, which `useDevCoCapexContracts` reads under its own key at the
 * same moment. `fetchQuery` with an EXPLICIT `staleTime: 0` (the client default is 30 s, which would serve a cached list)
 * joins that read when it is in flight and otherwise reads fresh, exactly as the read inside `listCapexCostRows` did, and
 * the answer lands in that key's cache too. One request, not two.
 */
export const devCoCapexCostsQueryOptions = (queryClient: QueryClient, projectId: string | undefined) => queryOptions({
  queryKey: qk.devCoCapexCosts(projectId ?? "none"),
  queryFn: () => costRepository().listCapexCostRows(
    projectId as string,
    queryClient.fetchQuery({ ...devCoContractsOptions(projectId), staleTime: 0 }),
  ),
});
