# Stage 3 report: workstream `entry-prefetch` (T-C01, T-C02, T-C03)

Worktree `C:\wt-bn\entry-prefetch`, branch `perf/entry-prefetch`, base `dde9e92`. Nothing committed (per brief). Status of every check is stated in section 4; anything not seen green is marked UNVERIFIED.

## 1. Tasks done / not done

| Task | Status | Notes |
|---|---|---|
| T-C01 Cost entry prefetch (SCC-01 = NET-01) | DONE (code + tests) | New shared factories `features/cost/costing/costQueries.ts` (book, totals, categories, lease book/generators/currencies/inflation/assumptions, Add Cost sheet, OPEX catalogue, Contracts accounts + DevCo reads). `useCostBook.ts` and `contracts/hooks.ts` consume them (same key, function, freshness). New `app/costScreenPrefetch.ts` (registry `COST_SCREEN_PREFETCHERS`, loaded by dynamic import). `bootPlan.ts` carries `category?` for CAPEX / Add Cost links; `bootPrefetch.ts` starts the Cost reads beside the FULL session project. Phase 1: CAPEX (Summary: categories + book(-1) + totals; `?category=N`: categories + book(N), comments via `onContracts`). Phase 2 (only keys that honour `staleTime`): Contracts (chart of accounts, DevCo contracts, DevCo cost rows), OPEX (catalogue, + country inflation after the project), Land Lease (book, generators, currencies, + inflation and assumptions after the project), Add Cost (CAPEX reads + that category's sheet). NOT prefetched on purpose (rule P3, `refetchOnMount: "always"`): Contracts rows / payment targets / DevCo links, OPEX book, OPEX device types. Not done: SCC-15 (deferred in Stage 2), OPEX assumption scopes (no factory exists; left inline). |
| T-C02 Production, Revenues, Finance reference | DONE (code + tests) | New `features/pm/{production,revenues,finance}/queries.ts`; their `hooks.ts` consume them; registered in `app/pmScreenPrefetch.ts`. Production: project + yields at t=0, Fabric assumptions after the project row. Revenues: project, contracts, balancing, production check, sub-account at t=0; assumptions, currency, inflation after the project. Finance: REFERENCE reads only (categories, banks, KfW tranches); project / inputs / repayments / step-ups stay the screen's (`always`). |
| T-C03 intent prefetch + admin loaders | DONE (code + tests) | Admin loaders moved to `screenLoaders.ts` (`ADMIN_SCREEN_LOADERS`), `routes.tsx` wraps them in `lazy()`, new `kind: "admin"` boot target preloads the chunk only. New `app/screenPrefetch.ts` (route path to `{loaders, prefetch, heavy}`) and `app/intentPrefetch.ts` (`useRailIntentPrefetch`, `startScreenIntent`), mounted once in `App.tsx`; `LeftNav.tsx` gains `data-nav-path`. The document delegation is the one in `generatorsWarmup.ts` (now exports `listenOnDocument` and `railEntryOf`; the lazy warm-up uses `listenOnDocument`, behaviour unchanged). Data intent is fully implemented but OFF. |

## 2. Files changed

Modified (18): `src/App.tsx`, `src/app/{bootPlan.ts, bootPrefetch.ts, generatorsWarmup.ts, pmScreenPrefetch.ts, routes.tsx, screenLoaders.ts}`, `src/components/LeftNav.tsx`, `src/features/cost/contracts/hooks.ts`, `src/features/cost/costing/useCostBook.ts`, `src/features/pm/{finance,production,revenues}/hooks.ts`, and tests `src/app/{bootPlan.test.ts, bootPrefetch.test.ts, bootPrefetch.screenReads.test.ts, pmScreenPrefetch.screens.test.tsx, pmScreenPrefetch.planning.test.tsx}`.

New (14): `src/app/{costScreenPrefetch.ts, screenPrefetch.ts, intentPrefetch.ts, intentStart.ts, useRailIntent.ts}` (the intent code is split so only the 20-line hook `useRailIntent.ts` is in the start-up bundle; `intentPrefetch.ts` (listeners) and `intentStart.ts` (what an intent starts) load on demand after the first render), `src/data/entryPrefetchFlags.ts`, `src/features/cost/costing/costQueries.ts`, `src/features/pm/{production,revenues,finance}/queries.ts`, tests `src/app/{costScreenPrefetch.test.tsx, costScreenPrefetch.boot.test.ts, costScreenPrefetch.waves.test.ts, intentPrefetch.test.tsx}`.

`git diff --stat`: 18 files changed, 346 insertions(+), 283 deletions(-) (most deletions are the inline query code moved into the factories) plus the 12 untracked files above.

Shared-file notes for the other workstreams (see section 7): `useCostBook.ts` lost about 140 lines (read definitions moved to `costQueries.ts`; it re-exports `capexCommentsKey` and `leaseBookKey` so importers are unchanged); the three PM `hooks.ts` files; `app/pmScreenPrefetch.ts`; `app/bootPrefetch.ts`; `app/routes.tsx`. I did NOT touch `data/costBook.ts`, `contracts.ts`, `landLease.ts` or any `rules.ts`.

## 3. Switches (new file `src/data/entryPrefetchFlags.ts`, pattern of `bootDvoptFlags.ts`; read through `entryPrefetch()`, tests flip with `setEntryPrefetchForTests`)

| Constant | Default | OFF means |
|---|---|---|
| `BOOT_PREFETCH_COST_READS` | ON | A Cost deep link starts only the chunk and the session project (today). |
| `BOOT_PREFETCH_PM_EXTRA_SCREENS` | ON | Production, Revenues, Finance start no read at boot (today). |
| `BOOT_PREFETCH_ADMIN_CHUNK` | ON | An admin deep link starts nothing; the chunk waits for the route (today). |
| `INTENT_PREFETCH_CHUNKS` | ON | Rail hover/focus starts no chunk (and, with the data switch also OFF, registers no document listener). Not named in the assignment (only "admin-loader part ON, speculative DATA OFF"); I made the chunk-only hover ON because it is a static download with no Dataverse traffic. Owner can flip it. |
| `INTENT_PREFETCH_DATA` | OFF | No read is ever started by the rail. When ON: dwell 150 ms (or press), at most 4 screens in flight (extra intents dropped), one start per project+screen per 30 s, never while hidden, never without a project, never the open screen, never the heavy screens (CAPEX, Add Cost), one `[VSB] ACTION prefetch <trigger> <path>` line per start. |

## 4. Tests and verification

Test ids added (one per `it`): `UT-BOOT-COST-001..003, 010..013, 020..022` (`costScreenPrefetch.test.tsx`, real hooks mounted on a prefetch-filled client: key/function equality for book, totals, categories, lease, OPEX, Contracts, Add Cost), `UT-BOOT-COST-010..015` (`costScreenPrefetch.boot.test.ts`, when boot starts what; ids 010..013 deliberately reuse the numeric range in a different file, the file name disambiguates), `UT-BOOT-COST-030` (category parsing), `UT-BOOT-COST-040, 041` and `UT-BOOT-WAVE-010, 011` (`costScreenPrefetch.waves.test.ts`), `UT-BOOT-ADMIN-001, 002, 010, 011` (plan + boot), `UT-BOOT-SCREENS-200..206` (Production, Revenues, Finance key equality, ordering, switch; in `pmScreenPrefetch.screens.test.tsx`), `UT-INTENT-001..008, 010..015, 020, 021` (`intentPrefetch.test.tsx`).

Existing tests changed (legitimate behaviour moves, none weakened):
- `bootPlan.test.ts` UT-BOOT-010: removed `#/admin/cost` from the "starts nothing" list (it is now an `admin` target, UT-BOOT-ADMIN-001); added `#/admin` and `#/admin/nowhere`.
- `bootPrefetch.test.ts` and `bootPrefetch.screenReads.test.ts`: `beforeEach` sets `costReads: false` (and `adminChunk: false` in the first) so UT-BOOT-OPT-010/011/016, UT-BOOT-023, UT-BOOT-026 and UT-BOOT-SCREENS-033 keep pinning exactly today's behaviour (switch OFF); the ON behaviour is `costScreenPrefetch.boot.test.ts`.
- `pmScreenPrefetch.planning.test.tsx` UT-BOOT-SCREENS-020: now asserts the OFF switch (`pmExtraScreens: false`) starts nothing for Production, Revenues, Finance (ON is UT-BOOT-SCREENS-200..206).

### Tooling note
The shared `node_modules` junction first targeted a lowercase drive letter, which made vitest fail with "failed to find the runner" (duplicate module instance). Fixed by re-creating my link with the uppercase target. Results below are from after the fix. Machine load caused jsdom "Timeout waiting for worker to respond" in wide runs; those are load noise and the file was re-run alone.

### Results (verbatim, after the junction fix)
- Targeted vitest, run 1: `npx vitest run src/app/intentPrefetch src/app/costScreenPrefetch src/app/pmScreenPrefetch src/app/bootPlan src/app/bootPrefetch src/app/generatorsWarmup --maxWorkers=3` -> `Test Files  10 passed (10)`, `Tests  95 passed (95)`, `Errors  1 error` (the error: `Failed to start threads worker for test files ...pmScreenPrefetch.screens.test.tsx`, `Timeout waiting for worker to respond`, load noise).
- Re-run alone: `npx vitest run src/app/pmScreenPrefetch.screens --maxWorkers=1` -> `Test Files  1 passed (1)`, `Tests  11 passed (11)`.
- Before the fix, with a node-env wave run: `costScreenPrefetch.waves.test.ts` 4 passed (also re-covered in run 1).
- `npm run typecheck`: no output after the command banner (clean).
- `node scripts/check-control-labels.mjs`: `control-labels: 0 missing, 0 duplicate test ids, 48 aria-label warnings, 2 ignored`.
- `node scripts/check-canvas-identities.mjs`: `canvas-identities: C1 unknown 0, C2 foreign 0, C3 type 0, C4 label 0, C5 unverified 0`.
- `npm run check:power`: `power-sources: 96 registered, 0 problems`.
- `npm run lint`: 26 warnings in total, none in a file I created or changed (the `capex-costs/Screen.tsx` memoization warnings and the `only-export-components` ones are pre-existing).
- Full `npx vitest run`, `npm run build`, `npm run bundle:report`: SEE SECTION 8 (updated at the end of this run; any line not shown there is UNVERIFIED).

## 5. Measurements (machine-independent counts)

From `costScreenPrefetch.waves.test.ts` (wave recorder over the real data modules; "wave" = sequential round trip; the project gate is modelled as its real reads: Cost = row then country+state+area, PM = row):

| Scenario | Before (gate first) | After (prefetch) |
|---|---|---|
| Cost Summary landing, wave of the first Cost read | 2 | 0 (2 waves earlier) |
| Cost Summary landing, wave of the per-contract sums (the Summary's last read) | 3 | 1 |
| Cost `?category=0`, wave of the cost rows (end of the chart, contracts, payments chain) | 4 | 2 |
| Production / Revenues first screen read | 1 | 0 (1 wave earlier) |
| Requests | identical in both columns (same reads, earlier), asserted by `toHaveLength` | |

Note: Stage 2 counted the Summary's first figures at wave 4 today; the recorder shows the totals read starts with the chart (the contracts-totals read does not need the chart), so the Summary ends at wave 3 today (4th wave) and wave 1 after. The 2-wave saving is as predicted. Command: `npx vitest run src/app/costScreenPrefetch.waves.test.ts`.

Start-up closure: baseline (`npm run build` then `node scripts/bundle-report.mjs` before any change) `STARTUP 8 files:   1030.1 kB min    302.0 kB gzip`. After: see section 8.

## 6. Entries drafted for `13-CODE-APP-IMPROVEMENTS-OVER-CANVAS.md` (not edited)

- Cross-cutting, Part 1. Cost screens start their first reads at the same time as the project instead of two waves later (SCC-01 / NET-01, T-C01). Status: fixed (performance; no visible behaviour change; same reads, same keys; switch `BOOT_PREFETCH_COST_READS`). Reads that the canvas re-reads on every visit (Contracts rows, payment targets, DevCo links, OPEX book, device types) are deliberately not prefetched (canvas `OnVisible` parity, D109/D120/D123).
- Production and Revenues start their first reads one wave earlier on a deep link, reload or new tab; Finance prefetches only its reference reads (SPB-02, T-C02). Status: fixed (switch `BOOT_PREFETCH_PM_EXTRA_SCREENS`).
- Administration screens start their chunk beside the session read on an admin deep link and on rail hover/focus (BND-17, T-C03). Status: fixed (switches `BOOT_PREFETCH_ADMIN_CHUNK`, `INTENT_PREFETCH_CHUNKS`).
- Hover/focus data prefetch of a screen's first reads, bounded and traced (SPA-09, T-C03). Status: proposed (not approved), implemented but OFF (`INTENT_PREFETCH_DATA`).
- New gates: key-equality tests that mount the real hooks on a prefetch-filled client for Cost, Production, Revenues and Finance (a drifted key now fails a test instead of wasting a request). Status: fixed (test/gate).

## 7. Risks, decisions, conflicts

Decisions for the owner:
1. Approve `INTENT_PREFETCH_DATA` ON or leave OFF (extra Dataverse traffic; the `[VSB] ACTION prefetch ...` line measures the hit rate).
2. Confirm `INTENT_PREFETCH_CHUNKS` ON (hover downloads a screen chunk, 31-75 KiB gzip for admin screens).

Risks found:
- A prefetched entry is only a hit within the observer's `staleTime` (default 30 s); at boot the window is the gate wait (seconds), so always inside. A wrong speculative `?category=N` (beyond the real number of tabs) costs one shared chart read and the Summary reads are not prefetched then.
- Boot waits for the chunk holding `costScreenPrefetch` + the Cost data layer before the reads start (a dynamic import, in parallel with the session read); it is the same shape as the existing PM boot prefetch. The wave tests pre-load modules so they measure round trips, not download time.
- Contracts: `devCoCapexCosts` (heavy read of all DevCo cost rows) now starts at boot, as the screen would on mount anyway.
- Test harness observation: concurrent dynamic imports of a mocked module in vitest can resolve to different instances; UT-INTENT-014 therefore replaces `screenPlanFor` with a controlled plan instead of going through the dynamic import.

Factories whose `staleTime` is the 30-minute reference value, which should spread `REFERENCE` from `data/queryPolicy.ts` (read-lane's change) when the trees are integrated, so `gcTime = staleTime` holds for the prefetched entry:
- `features/cost/costing/costQueries.ts`: `opexAccountsOptions`, `opexSubaccountsOptions`, `capexCategoriesQueryOptions`, `currenciesQueryOptions`, `countryInflationQueryOptions`, `capexAccountsAllQueryOptions` (30 min); `leaseAssumptionsQueryOptions` is 15 min (not reference class).
- `features/pm/revenues/queries.ts`: `REFERENCE_STALE` (project-states fetch, assumptions, inflation, sub-account, currency).
- `features/pm/finance/queries.ts`: `FINANCE_REFERENCE_STALE` (categories, banks, KfW tranches).
- `features/pm/production/queries.ts`: `ASSUMPTIONS_STALE` (Fabric assumptions).
- Also the project-states `fetchQuery` inside `revenueProjectQueryOptions` (the same 30-minute key General Data uses).
read-lane changed one-line `...REFERENCE` spreads in `app/pmScreenPrefetch.ts` (the inline Check List shared-states key uses `REFERENCE_STALE`) and in general-data / generators / project-main `queries.ts`: expect a trivial textual conflict in `pmScreenPrefetch.ts` (I added three prefetcher functions, a registry extension and an import; I did not touch the `REFERENCE_STALE` line).

Expected conflicts with other workstreams: `features/cost/costing/useCostBook.ts` (large removal), `features/cost/contracts/hooks.ts`, the three PM `hooks.ts`, `app/pmScreenPrefetch.ts`, `app/bootPrefetch.ts`, `app/routes.tsx`, `app/screenLoaders.ts`. bundle-structure moving imports in `data/` and `pm/*/rules.ts`: `revenues/queries.ts` imports `revenueCurrencyCode` from `./rules`; `costQueries.ts` imports `@/data/costBook`, `@/data/pendingDeletes`, `@/data/projectStates`, `@/data/comments`.

## 8. Final verification run (after the last code change; supersedes any earlier line in section 4)

- `npm run typecheck`: clean (`tsc --noEmit -p tsconfig.app.json`, no errors).
- `npm run lint`: 26 warnings, none in a file I created or changed (pre-existing).
- `node scripts/check-control-labels.mjs`: `control-labels: 0 missing, 0 duplicate test ids, 48 aria-label warnings, 2 ignored`.
- `node scripts/check-canvas-identities.mjs`: `canvas-identities: C1 unknown 0, C2 foreign 0, C3 type 0, C4 label 0, C5 unverified 0`.
- `npm run check:power`: `power-sources: 96 registered, 0 problems`.
- Targeted vitest (my files, routes, app shell): `npx vitest run src/app/intentPrefetch src/app/costScreenPrefetch src/app/pmScreenPrefetch src/app/bootPlan src/app/bootPrefetch src/app/generatorsWarmup src/app/ScreenRoutes src/app/CostNavigation src/app/CostRoutes src/App.test src/App.renders` -> `Test Files  16 passed (16)`, `Tests  162 passed (162)`, no errors.
- Targeted vitest (every folder whose hooks/queries I touched): `npx vitest run src/features/cost/costing src/features/cost/contracts src/features/cost/periods src/features/cost/capex-costs src/features/cost/add-costs-from-table src/features/pm/production src/features/pm/revenues src/features/pm/finance src/components src/test src/data/costReadPath` -> `Test Files  1 failed | 161 passed (162)`, `Tests  5 failed | 2985 passed | 3 todo (2993)`. The 5 failures were `useAddCostSheet.test.ts` UT-ACSHEET-QUERY-001/013/014/015/016: that file replaces `@tanstack/react-query` with a partial mock that has no `queryOptions`, which my `costQueries.ts` imported. Fixed in `costQueries.ts` (a local identity helper instead of the package's `queryOptions`; behaviour identical). Re-run: `npx vitest run src/features/cost/costing src/app/costScreenPrefetch` -> `Test Files  24 passed (24)`, `Tests  201 passed (201)`.
- NOT run (as instructed): the full `npx vitest run`; the orchestrator runs it on the integrated tree. One earlier partial full-suite attempt was aborted by a session restart and produced no result; nothing from it is claimed.
- `npm run build`: exit 0 (`built in ...`, only the existing chunk-size notice).
- `npm run bundle:report` (start-up closure): **FAILS the "must not grow" criterion by 1.6 KiB gzip.** Baseline `STARTUP 8 files:   1030.1 kB min    302.0 kB gzip`; after `STARTUP 11 files:   1032.9 kB min    303.6 kB gzip` (+2.8 kB min). Breakdown: `index` chunk 142.7 -> 143.2 KiB gz (+0.5: the flags file, the `admin` boot target and `categoryFromSearch` in `bootPlan`, the six named admin loaders and their map, the new boot branches, the 20-line `useRailIntent` hook, the two small delegation helpers in `generatorsWarmup`); the rest is bundler re-chunking caused by the new dynamic importers (the previous single `requestLog` chunk, 69.7 kB min / 16.4 gz, is now `requestLog` 8.8 + `data` 60.9 + `telemetry` 0.8 = 17.2 gz, and a 0.3 gz `QueryClientProvider` chunk) plus per-file overhead. Everything screen-sized (`costScreenPrefetch`, `costQueries`, the Production/Revenues/Finance queries, `screenPrefetch`, `intentPrefetch`, `intentStart`) is outside the start-up closure (dynamic imports). The residual +1.6 KiB (0.5 %) is not removable without moving existing start-up code: owner/orchestrator decision, or offset it with another workstream's start-up saving (bundle-structure).

### Changes after the first draft of this report
- Intent code split into `useRailIntent.ts` (start-up) + `intentPrefetch.ts` + `intentStart.ts` (on demand); `intentPrefetch.test.tsx` imports from the new modules and waits for the lazy attach; section 4's `UT-INTENT-*` ids are unchanged.
- `costQueries.ts` no longer imports `queryOptions` from the package (see above).
- Unverified items: none of the checks above is unverified; the full suite and the integrated-tree build are the orchestrator's.
