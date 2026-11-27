# Resolution of the `useCostBook.ts` conflict (entry-prefetch merge)

File: `ProjectCosts-CodeApp/src/features/cost/costing/useCostBook.ts`, one conflict block at lines 11-16.

## The conflict is an import line, not my SCC-16 change

- ours (the tree with bundle-structure + small-fixes + read-lane): `loadCapexCategories, standardContractExists` from `@/data/costBook`, plus `loadMilestoneDurations` from `@/data/milestoneDurations` (bundle-structure moved it out of `costBook`).
- theirs (entry-prefetch): `loadMilestoneDurations, standardContractExists` from `@/data/costBook`. Entry-prefetch removes `loadCapexCategories` from this file because `useCapexCategories` now returns `useQuery(capexCategoriesQueryOptions())` (the query options live in `costQueries.ts`, which imports `loadCapexCategories` itself, line 20 there).

My SCC-16 change (the `keepPreviousData` import on line 2 and the `useCapexComments(contractIds, options)` body, lines ~870-885) is outside the conflict, merged cleanly and intact: entry-prefetch's hunks only replace the definitions of `capexCommentsKey` / `prefetchCapexComments` (they move to `costQueries.ts`, `export { capexCommentsKey };` stays) and do not touch the `useCapexComments` function.

## Exact final text of the conflicted region (replace lines 11-16 including the markers)

```ts
import { standardContractExists } from "@/data/costBook";
import { loadMilestoneDurations } from "@/data/milestoneDurations";
```

## Why

1. `loadMilestoneDurations` must come from `@/data/milestoneDurations` (ours): after bundle-structure it is no longer exported from `costBook`, so theirs would not compile.
2. `loadCapexCategories` must be dropped (theirs): the file no longer calls it (the only remaining mention is a comment near line 825); keeping it would be an unused import (`noUnusedLocals` fails typecheck, and it would also pull `costBook` back into this chunk for no reason).
3. `standardContractExists` stays from `@/data/costBook` (used at line ~566 in both versions).
4. Line 2 must keep `keepPreviousData` in the `@tanstack/react-query` import (my T-E06); entry-prefetch's hunk context starts at line 3, so it does not conflict, but if a tool offers its line 2 (`useMutation, useQuery, useQueryClient, type QueryClient` only), keep mine: `import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";`.

After resolving: `npm run typecheck` is the check (unused / missing imports), then `useCostBook.dvopt.test.tsx` (UT-CAPEXCOM-020/021 cover the option) and `capex-costs/Screen.test.tsx` (UT-CAPEXCOM-022/023 cover the caller). Note `useCostBook.dvopt.test.tsx` mocks `@/data/comments` and uses `capexCommentsKey`; entry-prefetch's patch re-exports it, so the import there still resolves.

## Does the rest of entry-prefetch's patch touch my code?

No. The patch's file list (`entry-prefetch.patch`) contains none of: `features/pm/checklist/checklistVisit.bench.test.tsx`, `features/admin/admin-gates-approvals/*`, `features/admin/admin-default-checklists/*`, `features/admin/admin-capex-accounts/*`, `features/cost/capex-costs/Screen.tsx` or `data/smallFixesFlags.ts`. The only shared file is `useCostBook.ts` (above). `features/cost/costing/costQueries.ts` (new in the patch) mentions `useCapexComments` only in comments.
