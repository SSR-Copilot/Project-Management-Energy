# read-lane: resolution of the entry-prefetch merge conflicts (27 Nov 2026)

Sources read: the orchestrator tree (`ProjectCosts-CodeApp/src/features/pm/{revenues,finance}/hooks.ts` with markers, `.../queries.ts` as merged, `features/cost/costing/{useCostBook,costQueries}.ts`) and `patches/entry-prefetch.patch`. "ours" = integrated bundle-structure + small-fixes + read-lane; "theirs" = entry-prefetch. Nothing in the orchestrator tree was edited.

Principle: entry-prefetch moved every query option object out of `hooks.ts` into `queries.ts` factories. So in `hooks.ts` take THEIRS for every body block. My read-lane change (`...REFERENCE`, so `gcTime = staleTime`) must then live in the factories, because a hook now spreads the factory. Two edits entry-prefetch could not know about (bundle-structure moved modules) are also needed in the factories, otherwise typecheck fails.

## A. `features/pm/revenues/hooks.ts` (8 blocks)

| Block (marker line) | Final text | Why |
|---|---|---|
| 1 (l.40) `import { listProjectStates } from "@/data/projectStatesRead";` vs nothing | **nothing** (delete the whole block) | The hook no longer reads the states itself; the factory does. |
| 2 (l.50) `@/data/revenues` import list | `  listIndividualVolumeIds, listIndividualVolumes, listOverlappingContracts, type StoredVolume,` (theirs) | The other names moved to `queries.ts`. |
| 3 (l.85) a blank line vs nothing | nothing (theirs) | Whitespace only. |
| 4 (l.99) `useRevenueProject` | `  const q = useQuery({ ...revenueProjectQueryOptions(qc, projectId), enabled: Boolean(projectId) });` (theirs) | The `fetchQuery` of the shared states, with `...REFERENCE`, moves into `revenueProjectQueryOptions` (see C). |
| 5 (l.119) `useRevenueAssumptions` | `  const q = useQuery({ ...revenueAssumptionsQueryOptions(countryName), enabled: Boolean(countryName) });` (theirs) | `...REFERENCE` moves into the factory (C). |
| 6 (l.164) `useCountryInflationProfiles` | `  const q = useQuery({ ...revenueInflationQueryOptions(countryId), enabled: Boolean(countryId) });` (theirs) | same |
| 7 (l.179) `useRevenueSubaccount` | `  const q = useQuery(revenueSubaccountQueryOptions());` (theirs) | same |
| 8 (l.201) `useRevenueCurrency` | `  const q = useQuery({ ...revenueCurrencyQueryOptions(countryName), enabled });` (theirs) | same; `revenueCurrencyCode` is now computed inside the factory. |

Outside the markers (clean merge, but now wrong), edit by hand:
- line 47 `import { findCurrency, loadFirstRevenueSubaccount } from "@/data/revenueLookups";` (bundle-structure's module): **delete**, the hook no longer uses them.
- line 48 `import { REFERENCE } from "@/data/queryPolicy";`: **delete** (no `REFERENCE` use is left in this file after the 5 body blocks go to theirs; an unused import is a lint warning).

## B. `features/pm/finance/hooks.ts` (4 blocks)

| Block | Final text | Why |
|---|---|---|
| 1 (l.67) imports | **keep both lines**: `import { REFERENCE } from "@/data/queryPolicy";` and `import { banksQueryOptions, financingCategoriesQueryOptions, kfwTranchesQueryOptions } from "./queries";` | `useDebtAssumptions` (not in conflict, l.134-139) still spreads `...REFERENCE`; its factory is not prefetched, so it stays in the hook. |
| 2 (l.118) `useFinancingCategories` | `  const q = useQuery(financingCategoriesQueryOptions());` (theirs) | `...REFERENCE` moves into the factory (D). |
| 3 (l.153) `useBanks` | `  const q = useQuery(banksQueryOptions());` (theirs) | same |
| 4 (l.167) `useKfwTranches` | `  const q = useQuery(kfwTranchesQueryOptions());` (theirs) | same |

`import { ... } from "@/data/finance"` (l.56-60) is already the entry-prefetch form (no `listBanks`, `listFinancingCategories`, `listKfwTranches`): keep.

## C. `features/pm/revenues/queries.ts` (merged without a marker; needs 3 edits)

1. Replace `import { listProjectStates } from "@/data/generalData";` by `import { listProjectStates } from "@/data/projectStatesRead";` (bundle-structure BND-06 removed it from `generalData.ts`; `hooks.perf.test.tsx` mocks `@/data/projectStatesRead`).
2. In the `@/data/revenues` import remove `findCurrency` and `loadFirstRevenueSubaccount` and add `import { findCurrency, loadFirstRevenueSubaccount } from "@/data/revenueLookups";` (bundle-structure moved them; `revenues.ts` no longer exports them).
3. Reference spread (T-C04 / NET-08). Add `import { REFERENCE } from "@/data/queryPolicy";`, **delete** `export const REFERENCE_STALE = 30 * 60 * 1000;` (it would fail UT-QPOL-002, which forbids that literal outside `queryPolicy.ts`; nothing else imports it) and replace each `staleTime: REFERENCE_STALE` by `...REFERENCE`:
   - `revenueProjectQueryOptions`: inner `qc.fetchQuery({ queryKey: qk.generalDataProjectStates, queryFn: listProjectStates, ...REFERENCE })`
   - `revenueAssumptionsQueryOptions`: `...REFERENCE,`
   - `revenueInflationQueryOptions`: `...REFERENCE,`
   - `revenueSubaccountQueryOptions`: `...REFERENCE,`
   - `revenueCurrencyQueryOptions`: `...REFERENCE,`
   The contracts, balancing prices and negative-price-production factories stay without it (working data, as before).

## D. `features/pm/finance/queries.ts` (merged without a marker)

Add `import { REFERENCE } from "@/data/queryPolicy";`, replace `staleTime: FINANCE_REFERENCE_STALE,` by `...REFERENCE,` in `financingCategoriesQueryOptions`, `banksQueryOptions`, `kfwTranchesQueryOptions`, and delete `export const FINANCE_REFERENCE_STALE` (no other importer; `grep` found none). The three are fixed-key reference lists, exactly what the preset is for.

## E. `features/cost/costing/useCostBook.ts` (1 block)

Already resolved in the orchestrator tree (0 markers now) in the form I would give: `import { standardContractExists } from "@/data/costBook";` + `import { loadMilestoneDurations } from "@/data/milestoneDurations";` (bundle-structure's module for the durations; `loadCapexCategories` is no longer used in this file, only in a comment, and `costQueries.ts` imports it itself). Nothing of read-lane is in this block.

## F. Factories that should spread `REFERENCE` and do not

- **`features/pm/production/queries.ts` `productionAssumptionsQueryOptions`** (`const ASSUMPTIONS_STALE = 30 * 60 * 1000`, Fabric standard assumptions keyed by country: a fixed-key reference read of the same class). Not in the T-C04 list of 8 constants (it was an inline literal), so left as is; to extend: replace `staleTime: ASSUMPTIONS_STALE` by `...REFERENCE` and delete the constant.
- **`features/cost/costing/costQueries.ts`**: `opexAccountsOptions`, `opexSubaccountsOptions`, `capexCategoriesQueryOptions`, `currenciesQueryOptions`, `countryInflationQueryOptions` (30 min), `capexAccountsAllQueryOptions` (30 min) are reference lists with literal `30 * 60 * 1000`. NOT spread on purpose in read-lane: they were not in the spec's list, and `UT-QPOL-004` pins that no Cost module uses the preset (D51 patching of an unmounted book). If the owner wants the gc benefit there too, change those literals to `...REFERENCE` (`opexSubaccountsOptions` returns a plain object, so spread inside it) and relax UT-QPOL-004 to exclude `costQueries.ts`; it does not touch `["cost-book", ...]` or `["capex-totals", ...]`. `leaseAssumptionsQueryOptions` (15 min) and `leaseGeneratorsQueryOptions` (5 min) are not 30-minute reference reads: leave.
- `features/pm/production/hooks.ts` and others with inline 30-minute literals: unchanged by read-lane (out of the spec's list).

## G. After resolving

Run `npx vitest run src/data/queryPolicy.test.ts src/features/pm/revenues src/features/pm/finance src/app/pmScreenPrefetch.screens.test.tsx` and `npm run typecheck`. Expected effect of C and D: UT-QPOL-002 passes (no `REFERENCE_STALE = 30 * 60 * 1000` outside `queryPolicy.ts`). To pin the factories add a line to `UT-QPOL-009` style: `revenueSubaccountQueryOptions().gcTime === 30 * 60 * 1000` and the same for `banksQueryOptions()` (not added, the files do not exist in my worktree).
