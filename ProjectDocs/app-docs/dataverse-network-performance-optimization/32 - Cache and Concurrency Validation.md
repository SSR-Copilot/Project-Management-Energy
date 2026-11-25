# 32 - Cache and Concurrency Validation

> Stage 3 (implementation), 25 Nov 2026. Branch `feature/dataverse-network-performance-optimization`, uncommitted. Source of every section below: the per-agent notes written by the agent that did the work, unedited except for heading levels. Nothing here is a runtime measurement. Tests only; no DEV run.

## Concurrency

The global request ceiling (40 total, write lane 24) exists as a tested primitive but is **off and wired to no caller** except the prepared verify-read path; per-pool limits are unchanged (writes 8, wide groups 16, leaf deletes 16, cascade deletes 4). New bounded fan-out: the admin `hasContracts` check is capped (width 6). A deadline releasing a gate slot while the request is still in flight is recorded as a limit (QA-13) to settle before `REQUEST_DEADLINES` and `GLOBAL_GATE` are enabled together.

## Caching

Patch-in-place of the CAPEX category book, one shared SPV/DevCo mapping, one person cache, one countries key, a shared project-row key for Planning and Grid Operator, a once-per-project Planning seed, the boot prefetch of PM screens, reuse of the Check List gates in General Data, and the persisted Generators catalogue key scoped by environment and user (flag off). Freshness rules are unchanged: the 30 s default and focus refetch remain (DEC-F held).

## capex: CAPEX / Add Cost request savings (T-06, T-20, T-09 part, T-32 part)

### (c) Tests added (ids; all green)

- `src/data/pendingDeletes.hold.test.ts` UT-CA03-001..005, 010..013 (registry + the real window listener, jsdom)
- `src/features/cost/costing/useSaveAddCostSheet.hold.test.ts` UT-CA03-020..024 (the hook's lifecycle: prompt from resolve until the background settles or fails; none without a background)
- `src/features/cost/costing/capexBookPatch.test.ts` UT-CAPEXPATCH-001..010 (DIFFERENTIAL: patched book equals `loadCostLines` over the real writes' payloads on a fake Dataverse: 300 toggles, 400 Edits, 300 Adds, 100 Deletes seeded; the declined cases; mutation-checked)
- `src/features/cost/costing/useCapexWrites.patch.test.tsx` UT-CAPEXHOOK-001..006, 010..013, 020, 021 (request counts: a toggle sends no invalidation; save/delete send none for `cost-book`; fallbacks; flag off; a read in flight is cancelled; a failed save still reloads)
- `src/data/capexWrites.dvopt.test.ts` UT-CAPEXSTABLE-001..010 (client id, retry after refused months, ambiguous failure, no first-attempt reads, flag off), UT-CAPEXWRITTEN-001..004, UT-CAPEXCOLS-001..006 (incl. a 300-seed differential: final row after changed-only equals after the whole bag)
- `src/data/costBook.dvopt.test.ts` UT-SPVMAP-001..005, UT-COMMENTWAVE-001..004, UT-WTGCOUNT-001..002
- `src/features/cost/costing/useCostBook.dvopt.test.tsx` UT-COMMENTWAVE-010..014, UT-WTGLAZY-001..004
- `src/features/cost/capex-costs/CommentsPanel.dvopt.test.tsx` UT-CMTOVERLAP-001..003
- `src/features/cost/capex-costs/Screen.test.tsx` UT-CAPEXSTD-020..022 (per-WTG amount; a click before the lazy count)
- Existing tests changed on purpose: `useAddCostSheet.test.ts` (CAPEX_KEYS and UT-ACSHEET-QUERY-010: totals now `"active"`; new UT-ACSHEET-QUERY-010b = flag off gives `"all"`); `costReadPath.waves.test.ts` (beforeEach also clears the new SPV mapping memo); `Screen.test.tsx` mock gained `activeWtgCountReady` / `ensureActiveWtgCount`.
- Verification: the targeted files above plus `capexWrites*`, `costBook*`, `useCostBook.*`, `useAddCostSheet*`, `savedSheetPatch`, `CommentsPanel*`, `Screen.test`, `controlLabels`, `canvasIdentities`; `npm run typecheck` green; `npx oxlint` on the changed files adds no warnings (the 2 `preserve-manual-memoization` ones in Screen.tsx are in HEAD too); `npm run check:labels` 0 missing.

## boot: boot prefetch, Planning, warm-up (T-23 part, T-07)

### (c) Tests added / changed (all green; 57 new)

New:
- `src/data/project.envVarsTogether.test.ts` UT-BOOTENV-001..007 (7): both reads start before the definitions answer; filter text; result equals sequential; refused values read falls back; failed definitions read fails the load with no unhandled rejection and the gate stays closed; Prod silences console.
- `src/data/countries.oneKey.test.ts` UT-COUNTRIES-OK-001..003, 010, 011, 020, 021 (7): widened select, OFF narrow, differential old `statecode eq 0` list vs the view (same rows, same order), one request for Overview + user.
- `src/features/pm/planning/seedOnce.test.tsx` UT-PLANSEED-001..005, 010..015, 020..024, 030 (17): guard; concurrent clients create once; unreadable row creates once then never; row appearing before the create is not recreated; only still-missing types created; refused create not remembered; OFF path pinned; payload (project bind, owning BU) unchanged.
- `src/app/pmScreenPrefetch.planning.test.tsx` UT-BOOT-SCREENS-001..003, 010, 011, 020 (6): real Planning / Grid Operator hooks on a prefetched client: each read once; prefetch never writes; PB-10 one project read (two with the switch off).
- `src/app/pmScreenPrefetch.screens.test.tsx` UT-BOOT-SCREENS-101, 102, 111, 121 (5): drift check, real Check List / Team / Milestones hooks on a prefetched client make no second read (also with the D156 switches off).
- `src/app/bootPrefetch.screenReads.test.ts` UT-BOOT-SCREENS-030..034 (5): when the reads start (with the session project, not after it), only for the named PM screen, switch off, failures never throw.
- `src/app/generatorsWarmup.lazy.test.tsx` UT-GENWARM-LAZY-001, 010..016, 020, 021 (10).
Existing tests updated (they pinned behaviour I changed on purpose):
- `src/app/bootPrefetch.test.ts`: mock `@/data/countries` for the Overview prefetch (PB-06); UT-BOOT-OPT-012 now runs with `prefetchScreenReads` OFF (it asserts "nothing of its own data", which is the old behaviour); flag reset in beforeEach.
- `src/features/pm/planning/hooks.test.tsx` UT-PLAN-OPT-104/105: the seed now follows a re-check read right before the create (one more read of the statuses / the row on a first open); `resetSeedOnce()` in afterEach.
- `src/features/pm/planning/reload.test.ts` UT-PLAN-OPT-204 and `src/features/pm/grid-operator/reload.test.ts` UT-GRIDOP-OPT-203: the "every key in hooks.ts is mapped" scan now reads the keys from `queries.ts` + `data/planningProjectKey.ts` as well (the keys moved there).
Ran green: `src/app` (all), `src/data/{currentUser,project,countries,planning,gridOperator}*`, `src/features/pm/{planning,grid-operator,project-main}`, milestones `hooks.project`, generators `queries.country` / `prefetch` / `generators.countryList` (UT-PROJPAGE-* and UT-PAGE-* included: 400 + 414 tests, 55 files).

## pmb: Check List, General Data, Milestones, Team (T-23 part, T-01 part)

### (c) Tests added (ids)

- `src/features/pm/milestones/rules.test.ts` (appended): UT-MSTONE-DVOPT-001..005 (plan grouping, differential ON/OFF, no-reprice plan, real `executePlan` run, failure injection: a failing type update stops before the plant-cost PATCH).
- `src/data/milestones.reprice.test.ts`: UT-MSTONE-DVOPT-101..103 (3 chunks side by side, peak 3 / OFF peak 1 / same result).
- `src/features/pm/checklist/rules.test.ts` (appended): UT-CHKLST-DVOPT-001..005 (differential old plan, vanished tracking not updated, all gone, `together`, idempotent).
- `src/data/checklist.existing.test.ts`: UT-CHKEXIST-DVOPT-001..004 (one request, key-only select, chunking, no ids, failed read).
- `src/features/pm/checklist/hooks.dvopt.test.tsx`: UT-CHKDVOPT-001..007 (trackings reuse, OFF, too old, write invalidates, `reusableTrackings` table, write jobs still fresh) and 010..015 (guarded + grouped back-fill, vanished row, creates only, OFF, failed existence read writes nothing, nothing to do).
- `src/features/pm/general-data/hooks.dvopt.test.tsx`: UT-GDDVOPT-001..005 (cancel reuses / reads / stale / OFF / failure) and 010..012 (shared person cache, OFF, failure not remembered).
- `src/data/personCache.shared.test.ts`: UT-PERSON-DVOPT-001..011.

No existing test had to be changed.

## t21: Cost reads retry, Land Lease / OPEX / Contracts saves (T-14, T-21)

### (c) Tests (all targeted files pass; ids)

New files:
* `data/costWritePolicy.test.ts` UT-COSTPOLICY-001..008 (kinds, switch, label without id, same call repeated, 404 not retried).
* `data/contracts.batch2.test.ts` UT-CONTRB2-001..005 (one request, oldest per type, no request without scope, single read unchanged, 200-seed differential pair vs two singles), 010..013 (`existingLinks`), UT-COSTPOLICY-040..046 (Contracts writes).
* `features/cost/contracts/hooks.batch2.test.tsx` UT-CONTRHOOK-001..006 (links read starts before the save answers; create / Project Rights none; switch off; refused save; failing read), 010..015 (invalidations; real client scenario: targets and links read once more after a delete, switch off reads twice more; failed delete refetches nothing), 020..024 (one BoP read shared, missing type, switch off, disabled, prefix invalidation reads once).
* `features/cost/costing/useCostBook.batch2.test.tsx` UT-READRETRY-001..010 (the four reads: transient then data, 403 once, persistent 503 stops after 3 reads, switch off), UT-OPEXCAT-001..004, UT-LEASELEAN-001..004.
* `features/cost/periods/landLeaseRules.tiersWider.test.ts` UT-LLTIER-001..012 (tiers; half-written follower chain heals).

Added to existing files:
* `data/landLease.writes.test.ts` UT-LLWRITE-050..058 (waves 8 and 5, switch off 9 and 7, import unchanged, 200-seed differential vs the sequential oracle, failure injected at every index of 60 plans, scenario tests) and UT-COSTPOLICY-010..016.
* `data/periodWrites.opex.waves.test.ts` UT-PWOPEX-030..034, 040..043 (waves on / off, no cascade without the head, an early failing read is not unhandled, refusal first on the import, guard beside the lookups).
* `data/periodWrites.test.ts` UT-COSTPOLICY-020..027.
* `data/costReadPath.waves.test.ts` UT-COSTWAVE-B2-001..005 (names given: 3 requests, differential, failing loader).

EXISTING PINS UPDATED FOR AN INTENDED CHANGE (all in `periodWrites.opex.waves.test.ts`, comments say so): UT-PWOPEX-001 4 -> 3 waves; UT-PWOPEX-006 3 -> 2 waves (title too); UT-PWOPEX-005 and UT-PWOPEX-014 import 5 -> 4 waves. `landLease.writes.test.ts` keeps every old pin (its flag mock sets `LEASE_TIER_WIDER` off and `COST_WRITES_POLICY` off for those; the wider tests turn it on). Other existing files only got their `leaseOpexFlags` doubles extended (and `hooks.save.test.tsx` UT-CONTR-172 now expects `existingLinks: expect.any(Promise)` and has a `listDevCoLinks` double; `costBook.test.ts` resets the Land Lease sub-account memo in its `beforeEach`): `landLease.dvopt.test.ts`, `periodWrites.test.ts`, `contracts.guard.test.ts`, `useCostBook.refreshOnFailure.test.tsx` (`LEASE_LEAN_RELOAD` off there so its two-key pins stay).

## pma: Generators, Production, Revenues, Finance (T-05, T-22, T-32 part)

### (c) Tests added (ids)

- `data/financeBulk.registration.test.ts`: UT-FINBULKREG-001..003 (fresh module graph via `vi.resetModules`: default backend registered by Finance alone; a createMany step on a Finance table runs)
- `features/pm/generators/flowBesideReads.test.ts`: UT-GENFLOW-001..007 (overlap, old orders OFF, timing saving, error precedence, nothing left running)
- `features/pm/production/hooks.leanReload.test.tsx`: UT-PRODLEAN-001..006 (request counts ON vs OFF oracle, seeded yields, generation job keys, two failure injections)
- `features/pm/generators/reload.turbinesOnce.test.tsx`: UT-TURBONCE-001..002, 010..013 (real hooks, request counts ON 1 vs OFF 2, failure switches back)
- `data/production.leanReads.test.ts`: UT-TYPELEAN-001..003, 010..013 (selects, differential generation inputs, request counts, Finance count)
- `features/pm/finance/hooks.cachedTypes.test.ts`: UT-TYPELEAN-020..023 (freshness rule of the cached list)
- `data/generators.omGuard.test.ts`: UT-OMGUARD-001..007 (filter, request counts, 400-world differential vs the two-read oracle, fallback, failure)
- `features/pm/finance/rules.changedRows.test.ts`: UT-FINROWS-001..006 (header-only edit 0 vs 29 writes, 200 seeded random edits vs full rewrite, blank-vs-0, new tranche, non-Individual profile)
- `data/generatorCatalogueCache.scope.test.ts`: UT-CATSCOPE-001..007; and UT-CATSCOPE-010 added to `features/pm/generators/readsPerf.hooks.test.tsx`

Existing tests I had to touch (intentional behaviour change or a default list): `features/pm/generators/reload.test.ts` (UT-GENPERF-001 default list gains 5 switches), `features/pm/finance/perf.test.ts` (UT-FINPERF-101 gains `changedRowsOnly`), `features/pm/production/hooks.test.tsx` (UT-PRODHOOK-001 and -005 now run with `productionLeanReload` off: they pin the old key list, which stays as the rollback path), `data/generators.opex.test.ts` (the loadOpexDependency describe runs with `omGuardOneRead` off), `data/finance.reads.test.ts` (mock gains `listGeneratorTypeIds`), `features/pm/generators/readsPerf.hooks.test.tsx` (session mock carries environment + user, scopes asserted).

