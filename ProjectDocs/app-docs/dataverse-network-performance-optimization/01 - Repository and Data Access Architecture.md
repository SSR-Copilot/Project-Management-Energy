# 01 - Repository and Data Access Architecture

> Stage 1 audit, 25 Nov 2026. Branch `feature/dataverse-network-performance-optimization`, from `origin/RounakDev1` at `30afece`. Investigation only: no application source file was changed. Every request count in this folder is **code-derived**, not measured.

## 1. Stack and layout

- **App:** `ProjectCosts-CodeApp/`, React 19, TypeScript 6, Vite 8, Vitest 5, Fluent UI v9, TanStack Query 5, a hash router. SDK: `@microsoft/power-apps` 1.3.1 (declared `^1.3.1`).
- **Backend:** live Dataverse environment `VSBCloud_Dev`, plus Fabric SQL tables through a connector (D54) and six Power Automate cloud flows (D81, D97). Every call runs as the signed-in user; the app never sets another execution context.
- **Data sources:** `npm run check:power` reports **96 registered, 0 problems** (tables, the `CreateMultiple` / `UpdateMultiple` / `UpsertMultiple` actions, Fabric SQL tables, flows). `src/generated/services/` holds 96 files (pac output, never hand-edited).
- **Source layout:** `src/features/{admin,pm,cost,shared}/<screen>/` (`Screen.tsx` composition, `rules.ts` pure rules, `hooks.ts` / `queries.ts` TanStack wiring), `src/data/` (about 170 files including tests: every Dataverse read and write), `src/platform/` (errors, logging, privileges), `src/app/` (providers, session, boot prefetch, routes).

## 2. The path of a request

`Screen / component` → `hooks.ts` or `queries.ts` (TanStack `useQuery` / `useMutation`) → `src/data/<module>.ts` → either a generated service (`Vsb_xyzService.getAll / get / create / update / delete`) or the SDK client directly (`getClient(dataSourcesInfo)`: `retrieveMultipleRecordsAsync`, `executeAsync` for actions and flows) → the SDK → the Power Apps host → Dataverse.

A grep of non-test code finds about 250 generated-service call expressions in 33 `data/` modules and 32 direct SDK-client call expressions in 7 files (`client.ts`, `executePlan.ts`, `verifyGone.ts`, `adminCapexAccounts.ts`, `adminRowWrites.ts`, `privileges.ts`, and the test fake). There is no `fetch()` or `XMLHttpRequest` to Dataverse anywhere in the app: the SDK is the only transport. The 324 operation rows the auditors recorded are in doc 02.

## 3. Shared infrastructure that already exists

| Concern | Where | What it does |
|---|---|---|
| Paged reads | `data/client.ts` `fetchAll`, `fetchPage`, `countedPage` | pages of 500 via `maxPageSize`, stops with an error after 50 pages (D157); `countedPage` keeps skip tokens and the count per query signature (Project Overview, D41-D46: page size is `maxPageSize`, never `$top`) |
| Query building | `data/odata.ts` | `f.*` filter helpers, `dateOnly`, `bind`, `idIn`; empty filters are dropped, never sent blank |
| Result handling | `platform/errors.ts` `unwrap`, `unwrapDelete*`, `DataError`, `isRetryable` | the SDK returns `success: false` instead of throwing; `unwrap` turns that into a `DataError` |
| Single-row guard | `data/client.ts` `updateRecordIfExists` | one existence GET, then PATCH (the SDK sends no `If-Match`, so a bare PATCH is an upsert) |
| Write plans | `data/writePlan.ts`, `executePlan.ts`, `runPlan.ts`, `usePlanWrite.ts` | ordered groups of writes with `together()` parallel groups, hardened deletes, serial keys, partial-failure reporting |
| Bulk writes | `data/bulkWrites.ts`, `bulkSend.ts`, `bulkBackend.ts`, `bulkTypes.ts` | `CreateMultiple` / `UpdateMultiple` / `UpsertMultiple` in chunks, 501 fallback to per-row |
| Concurrency | `data/concurrency.ts` | `mapLimit` (8), wide groups (16), deletes (16 leaf / 4 cascade), `createGate`, `createSerialRunner` |
| Retry | `data/retry.ts` | bulk writes retry 429 and 503-with-`Retry-After` (3 tries); `withDeleteRetry` for deletes; **used by `generatorsBulk`, bulk steps in `executePlan` and hardened deletes only** |
| Read sharing | `data/sharedRead.ts`, `persistedReference.ts` | in-flight coalescing plus a short memo; an IndexedDB reference cache (Generators catalogue, off by default) |
| Flows | `data/flows.ts` | the only caller of the generated flow services (positional mapping) |
| Logging | `platform/requestLog.ts`, `consoleGate.ts`, `app/queryLog.ts` | every call prints a `[VSB]` console line outside Production (D72, D164) |
| Query client | `app/Providers.tsx` | `staleTime` 30 s, `refetchOnWindowFocus` true, read retry `attempt < 2 && isRetryable`, mutations never retried, structural sharing for `Date`s (D162) |

## 4. Platform constraints (established from the SDK source in `node_modules`, `@microsoft/power-apps` 1.3.1)

These decide what Stage 2 may propose.

1. **No `$batch` and no change sets from the app.** The query options are only `maxPageSize`, `select`, `filter`, `orderBy`, `top`, `skip`, `count`, `skipToken`. The host wraps each single request in its own batch envelope (a `BatchInfo` header with an empty `batchId`); the SDK never sets a shared `batchId`. Requests therefore cannot be grouped or made transactional from the client. Recommendations that would need it are marked "needs a Dataverse custom API".
2. **No `$expand`, no FetchXML, no `$apply` / aggregates.** Related rows need separate reads; totals need every row. A single-valued navigation filter (`_x_value`, `x/y eq`) is a `$filter` and is not excluded; whether the host accepts each shape must be checked on DEV (CB-05).
3. **Bulk writes exist as Dataverse actions** through `executeAsync`: `CreateMultiple`, `UpdateMultiple`, `UpsertMultiple` are registered. Each call is one request, atomic per call, up to the chunk size used (500 in Add Cost from Table). A chunk is all-or-nothing; several chunks are not.
4. **Every POST and PATCH sends `Prefer: return=representation,odata.include-annotations=*`.** The server returns the whole row with annotations for every write; the app cannot turn it off.
5. **PATCH has no `If-Match`.** A PATCH to a deleted row creates a new row (upsert). The existence read in `updateRecordIfExists` is the only guard.
6. **No request deadline.** A search of non-test code finds no `AbortController`, `AbortSignal` or timeout around Dataverse calls (only an IndexedDB timeout in `persistedReference.ts`), and the SDK's own JavaScript (`dist/`) contains no timeout, abort or retry code. A host-side timeout, if any, is not visible to the app (open question, CA-02). A deadline added in the app can stop **waiting**, but cannot cancel the request: the write may still land, so its outcome is "unknown" (doc 21).
6a. **SDK errors carry no headers.** `PowerDataRuntimeHttpError` is `{ message, status?, requestId?, stack? }`. `Retry-After` is therefore unreadable, and the app's `Retry-After` branches in `data/retry.ts` never fire (finding OR-01).
7. **Service protection limits** apply per user per web server: 52 concurrent requests, about 6,000 requests per 5-minute window. Retry-After must be honoured on 429.
8. **`$skip` is not supported by Dataverse**; paging is forward-only through skip tokens.

## 5. Earlier optimization work already in this branch

This audit starts after, and does not repeat: D160 (24 Nov 2026, `ProjectDocs/app-docs/optimization/`: fewer awaited round trips across Cost, PM, Admin; 11 reversible switches; deferred list in its `08` file), D162 (frontend performance), D99 / D108 / D115 / D116 / D135-D137 / D141-D146 / D149-D150 / D156 / D159 (per-screen save and read work), and D51 (Add Cost from Table bulk save). Each auditor listed what it re-verified as already fixed (appendix F of doc 12) and re-raised a deferred item only with new evidence.

## 6. Live feature flags

The flags decide live behaviour, so the values below are what the code holds today. Copied from each audit's scope section.

### Cost A: CAPEX/DEVEX, Add Cost from Table, shared costing layer

Files read (fully or in the relevant ranges): `data/costBook.ts`, `data/costRepository.ts`, `data/capexWrites.ts`, `data/bulkWrites.ts`, `data/bulkSend.ts`, `data/addCostSheet.ts` (load, refresh, doc comments, save wiring, delete helpers), `data/addCostSheetBulk.ts` (module note, executeSavePlan, verifyPlan, reconcile), `data/comments.ts`, `data/capexChart.ts`, `data/capexAccounts.ts`, `data/standardContracts.ts`, `data/client.ts` (fetchAll, deleteRecord), `data/verifyGone.ts`, `data/persistedReference.ts` (header), `data/odata.ts` (chunk, lookupIn, idIn), `features/cost/costing/useCostBook.ts`, `capexInvalidation.ts`, `useCostWriteFlight.ts`, `features/cost/capex-costs/Screen.tsx` (data wiring + handlers), `CommentsPanel.tsx` (commit loop), `features/cost/add-costs-from-table/Screen.tsx` (save handler), `savePlan.ts` (contractFields / CHANGED_COLUMNS_ONLY).
Not read in depth (gap stated explicitly): `bulkBackend.ts`, `bulkTypes.ts`, `saveLog.ts`, `pendingDeletes.ts` bodies, the legacy Add Cost save `saveAddCostSheetLegacy` (not live, `BULK_SAVE = true`), `capex-costs/rules.ts`, `panelRules.ts`, `add-costs-from-table/spreadsheet/`. `data/persistedReference.ts` is used only by `generatorCatalogueCache.ts` (not by this scope). `loadCostBook` with `category === undefined` (OPEX / Land Lease periods, `costBook.ts:461-603`) belongs to other auditors.

###### Flag table (current values = live behaviour)

| Flag | File:line | Value | Effect |
|---|---|---|---|
| `BULK_SAVE` | `data/addCostSheet.ts:675` | `true` | Add Cost save uses CreateMultiple/UpdateMultiple orchestrator; false = legacy one-request-per-record path |
| `DEFER_CONTRACT_DELETES` | `data/addCostSheet.ts:320` | `true` | contract deletes run after writes settle; Save returns before they finish |
| `DEFER_COST_DELETES` | `data/addCostSheet.ts:338` | `true` | cleared-cell cost deletes likewise deferred, background total reconcile on failure |
| `DEEP_INSERT_NEW_CONTRACTS` | `data/addCostSheet.ts:360` | `false` | new contract + its costs as one nested POST: OFF |
| `DEEP_INSERT_MAX_CONTRACTS` / `_COSTS` | `data/addCostSheetBulk.ts:395,405` | 8 / 24 | limits for deep insert (inactive) |
| `CANVAS_PARITY_DELETION` | `features/cost/add-costs-from-table/Screen.tsx:61` | `true` | product decision: removing a contract deletes its whole cost history. Never propose removing |
| `READ_BACK_DELAY_MS` | `.../add-costs-from-table/Screen.tsx:69` | 200 | debounce of grid read-back (client only) |
| `CHANGED_COLUMNS_ONLY` | `features/cost/add-costs-from-table/savePlan.ts:143` | `true` | existing-contract UPDATE carries only changed columns |
| `TUNED_CHUNKING` | `data/bulkSend.ts:126` | `true` | tuning minChunk 10 / parallel 8 / maxChunk 500 / writeGate 24 (`:118-120`); legacy 25 / 4 / 500 / 16 (`:70-72`) |
| `SAVE_REQUEST_LIMIT` (= `BULK_TUNING.writeGate`) | `data/bulkSend.ts:376` | 24 | one module gate for every write request of Add Cost and of the CAPEX panel bulk save |
| `CONTRACT_DELETE_LIMIT` / `COST_DELETE_LIMIT` | `data/bulkSend.ts:389,406` | 4 / 4 | own delete gates outside the write gate |
| `PANEL_DELETE_LIMIT` | `data/capexWrites.ts:645` | 4 | CAPEX panel delete gate (a third, separate gate) |
| `DEFAULT_BULK_CHUNK` / `MIN_PARALLEL_CHUNK` | `data/bulkWrites.ts:31,40` | 500 / 25 | defaults of `upsertMultiple` (overridden by `bulkChunkOptions()`) |
| `PANEL_BULK_SAVE` | `data/capexWrites.ts:146` | `true` | CAPEX panel save/delete use the bulk path. In DEV builds `sessionStorage["vsb.capexPanel.legacySave"]="1"` forces legacy (`:163-171`) |
| `SKIP_UNCHANGED_COSTS` | `data/capexWrites.ts:153` | `true` | panel save skips month rows whose amount equals the stored one |
| `BACKGROUND_SAVE` | `features/cost/costing/backgroundSave.ts:56` | `false` | Add Cost Save leaves the sheet before it finishes: OFF |
| `PAINT_TIMEOUT_MS` | `features/cost/costing/saveTimeline.ts:58` | 10 000 | measurement only |
| `CAPEX_CHART_MEMO_MS` | `data/capexChart.ts:27` | 30 000 | shared chart-of-accounts memo |
| `CHUNK` (ids per filter) | `data/odata.ts:70` | 40 | ids per `$filter` OR-chain; drives every `Promise.all(chunk(ids).map(fetchAll))` |
| `WRITE_CONCURRENCY` / `WIDE_GROUP_CONCURRENCY` / `DELETE_CONCURRENCY` | `data/concurrency.ts:31,41,140` | 8 / 16 / 16 | platform facts; `ROW_WRITE_CONCURRENCY = DELETE_CONCURRENCY` (16) for the per-row 501 fallback, `data/bulkSend.ts:360` |
| `DEFAULT_MAX_PAGES` / `DEFAULT_PAGE_SIZE` | `data/client.ts:48-49` | 50 / 500 | fetchAll caps |
| per-query `retry: false` | `useCostBook.ts:86,256,420,554` | false | cost book, capex totals and add-cost-sheet reads never retry (the app default is `attempt < 2 && isRetryable`, `app/Providers.tsx:23`); the comments, standard assumption, categories and wtg-count queries use the default |
| 501 session flags | `data/bulkSend.ts:291-294` (`sessionStorage`) | per tab | after a 501 on create/update the tab sends per-row PATCH for that action until the tab closes |

### Cost B: Contracts, OPEX, Land Lease, periods

###### Files read

- Screens: `features/cost/contracts/Screen.tsx` (load, save, delete paths), `features/cost/contracts/hooks.ts`,
  `features/cost/opex-costs/Screen.tsx`, `features/cost/land-lease/Screen.tsx`, `features/cost/periods/OpexScreen.tsx`
  (hooks, commands, save, delete), `features/cost/periods/LandLeaseScreen.tsx` (hooks, import, commit, delete).
- Pure planners: `features/cost/periods/landLeaseRules.ts` (`diffAllocation`, `bindParent`, `leaseWriteTiers`, the payload builders,
  `planLeaseSave`, `planLeaseDelete`, `planStandardImport`).
- Data: `data/contracts.ts`, `data/landLease.ts`, `data/periodWrites.ts`, `data/opexCatalog.ts`, `data/standardContracts.ts`,
  `data/currencies.ts`, `data/countryInflation.ts`, `data/countries.ts`, `data/costRepository.ts`, `data/keys.ts`,
  `data/client.ts` (`fetchAll`, `deleteRecord`, `updateRecordIfExists`), `data/concurrency.ts` (exports),
  `data/generatorsBulk.ts` (table registry only), `data/bulkSend.ts` (exports only).
- Usage only (internals belong to another auditor): `features/cost/costing/useCostBook.ts` (the OPEX book, OPEX save/import
  mutations, the Land Lease hooks), `data/costBook.ts` (`loadOpexPeriods`, `loadCostBook` scope branch), `app/Providers.tsx`.
- Docs: `ProjectDocs/app-docs/optimization/02_Optimization_Findings_Register.md` (OPT-02/04/06/07/08/09/10/11/12/26/34),
  `08_Final_Optimization_Summary.md` (Deferred table), `02-OPEN-DECISIONS.md` D118, D120, D160 (relevant parts),
  `ProjectDocs/migration-plans/04-flow-inventory.md` (verified section), `ProjectDocs/_extracted/VSBCloud/customizations.xml`
  (relationship cascade settings, solution 1.21.709).

`standardContracts.ts` and `countries.ts` are read by CAPEX and Application Settings, not by these three screens; nothing in
them is reported here.

###### Flags and tuning values in scope (current values)

| Flag / value | file:line | Value | Effect |
|---|---|---|---|
| `LEASE_WRITE_PARALLEL` | `data/landLease.ts:526` | `true` | Land Lease plans run in tiers (`leaseWriteTiers`); `false` = one request at a time (`applyLeaseWritesSequentially` oracle, `:477`) |
| `OPEX_IMPORT_PARALLEL` | `data/periodWrites.ts:729` | `true` | OPEX standard-import rows after the first go 8 wide; `false` = sequential (restores `createdon` order, D160 open decision) |
| `WRITE_CONCURRENCY` | `data/concurrency.ts:31` | `8` | creates/updates per tier; DevCo link creates; OPEX cascade, re-chain, child deletes, import tail |
| `DELETE_CONCURRENCY` | `data/concurrency.ts:140` | `16` | DevCo link deletes (`contracts.ts:610-614`) |
| `LEAF_DELETE_CONCURRENCY` / `CASCADE_DELETE_CONCURRENCY` | `data/concurrency.ts:156-157` | `16` / `4` | Land Lease delete tiers (`landLease.ts:529-532`) |
| `CURRENCIES_MEMO_MS` | `data/currencies.ts:104` | 5 min | shared currency table memo (OPT-07b) |
| `CHUNK` | `data/odata.ts:70` | 40 ids | every `lookupIn` / `idIn` fan-out |
| `fetchAll` page / cap | `data/client.ts:48-49` | 500 rows / 50 pages (throws, D157) | all reads below except `listCapexCostRows` (`maxPageSize: 5000`, `contracts.ts:261`) |
| `REREAD_ON_VISIT` | `features/cost/contracts/hooks.ts:33` | `staleTime: 0, refetchOnMount: "always"` | contracts, payment targets, DevCo links re-read on every mount and every window focus |
| `useCapexAccounts` staleTime | `contracts/hooks.ts:87` | 30 min | DevCo picker chart (all states) |
| `useBopStandardAssumption` staleTime | `contracts/hooks.ts:204` | 15 min | two queries (Development, Construction) |
| `useProjectExtras` | `contracts/hooks.ts:168-183` | derived from session; fallback query 5 min | no request when the session project is the asked one (OPT-02) |
| OPEX book | `periods/OpexScreen.tsx:769`, `useCostBook.ts:84-87` | `everyVisit: true`, `scope: "opex"`, `retry: false` | re-read on every mount |
| `useOpexCatalog` | `useCostBook.ts:350-371` | 30 min | accounts + subaccounts |
| `useOpexDeviceTypes` | `useCostBook.ts:380-388` | 5 min, `refetchOnMount: "always"`, O&M only | |
| `useOpexAssumptionScopes` / `useLeaseAssumptions` | `useCostBook.ts:397-406` / `:294-303` | 15 min | |
| `useCountryInflation` / `useCurrencies` | `useCostBook.ts:285-291` / `:270-276` | 30 min | |
| `useLeaseGenerators` | `useCostBook.ts:261-267` | 5 min | |
| `useLeaseBook` | `useCostBook.ts:252-259` | default 30 s, `retry: false` | |
| Global query defaults | `app/Providers.tsx:20-32` | retry `attempt < 2 && isRetryable`, staleTime 30 s, `refetchOnWindowFocus: true`, mutations `retry: false` | |
| `canvasParityPeriodWrap` | `landLeaseRules.ts:2787-2803` (`buildPeriodPayload`) | not passed (LL-D1 correction applied) | behaviour flag, no network effect |
| `GENERATORS_TABLES` (bulk registry) | `data/generatorsBulk.ts:65-74` | registers `vsb_landleaseallocationwtgs` (creates allowed) and `vsb_opexprojectcosts` (update-only) | the bulk backend this audit proposes to reuse; its OPT-21 switches are off (DEC-4) |

### PM A: Generators, Production, Revenues, Finance

###### Files read
- Generators: `features/pm/generators/{Screen.tsx, hooks.ts, queries.ts, reload.ts, plans.ts, loadGate.ts (grep), replacePlans.ts (grep), rollback.ts (grep), panelPlans.ts (grep)}`,
  `data/{generators.ts, generatorsBulk.ts, generatorsBulkFlags.ts, generatorsDeleteFlags.ts, generatorsPerfFlags.ts, generatorCatalogueCache.ts, persistedReference.ts (grep), bulkBackend.ts (getBulkBackend), bulkSend.ts (tuning), bulkWrites.ts (parallelChunkSize), flows.ts (runFlow)}`,
  `app/{generatorsWarmup.ts, bootPrefetch.ts (prefetchTarget), routes.tsx:110-145, Providers.tsx (query defaults)}`.
- Production: `features/pm/production/{hooks.ts, Screen.tsx (hooks), rules.ts:1336-1430, 1478, 1600-1850}`, `data/production.ts`.
- Revenues: `features/pm/revenues/{hooks.ts, reload.ts, Screen.tsx:710-925, rules.ts:2926-3110}`, `data/revenues.ts`, `data/revenuesFlags.ts`.
- Finance: `features/pm/finance/{hooks.ts, perf.ts, Screen.tsx:1040-1330, rules.ts:1085-1300, 3547-3625}`, `data/finance.ts`, `data/financeBulk.ts`, `data/financeFlags.ts`.
- Shared: `features/pm/shared/projectRow.ts` (via `data/pmProjectRow.ts:25-45`), `data/project.ts:225-250` (PM session scope), `data/writePlan.ts` / `data/executePlan.ts:400-425, 570` (only to see how plans are run), `data/usePlanWrite.ts:200-206`.
- Docs: `ProjectDocs/app-docs/optimization/08_Final_Optimization_Summary.md` (Deferred table), `02_Optimization_Findings_Register.md` (OPT-15, OPT-21, OPT-24 and the Generators/Finance/Revenues mentions), `02-OPEN-DECISIONS.md` D136, D137 (full), headings of D115, D116, D121, D135, D141–D146, D149; `ProjectDocs/migration-plans/04-flow-inventory.md:29`; `ProjectDocs/app-docs/16-PM-FLOWS-IN-THE-CODE-APP.md:47-48, 191-192`.

###### Flag table (current values decide live behaviour)

| Flag | file:line | Value | Effect |
|---|---|---|---|
| `GENERATORS_BULK.allocations` | `data/generatorsBulkFlags.ts:19` | **false** | Land-lease allocation rows as single creates in a `together()` group (ON = one `createMany`) |
| `GENERATORS_BULK.status` | `data/generatorsBulkFlags.ts:20` | **false** | Status toggle: N single turbine PATCHes (ON = one guarded `updateMany`) |
| `GENERATORS_BULK.applyAll` | `data/generatorsBulkFlags.ts:21` | **false** | Apply-to-all sibling PATCHes single (ON = `updateMany`) |
| `GENERATORS_BULK.turbines` | `data/generatorsBulkFlags.ts:22` | **false** | New type's N turbines as N single creates (ON = `createMany`) |
| `GENERATORS_BULK.replace` | `data/generatorsBulkFlags.ts:23` | **false** | Replace detach / move / re-link rows single (ON = `updateMany`) |
| `GENERATORS_BULK.createRollback` | `data/generatorsBulkFlags.ts:24` | **false** | A failed WTG create leaves the landed rows (ON = delete them, "Retry cleanup") |
| `GENERATORS_DELETE.tieredDeletes` | `data/generatorsDeleteFlags.ts:33` | **true** | Leaf deletes 16 wide, cascade deletes 4 wide |
| `GENERATORS_DELETE.verifyDeletes` | `data/generatorsDeleteFlags.ts:34` | false | No read-back after `confirm` deletes |
| `GENERATORS_DELETE.parentOrder` | `data/generatorsDeleteFlags.ts:35` | false | Allocation deletes on one cost may run together |
| `GENERATORS_DELETE.guardedUpdates` | `data/generatorsDeleteFlags.ts:36` | false | Generators PATCHes are plain (upsert; can re-create a row deleted by another user) |
| `GENERATORS_PERF.targetedReload` | `data/generatorsPerfFlags.ts:87` | true | Per-kind reload (`features/pm/generators/reload.ts`) |
| `GENERATORS_PERF.gateByList` | `:88` | true | Catalogue / index / device costs / AllWTG costs lazy |
| `GENERATORS_PERF.prefetch` | `:89` | true | Boot prefetch + warm-up from any PM screen (`app/generatorsWarmup.ts`) |
| `GENERATORS_PERF.parallelChunks` | `:90` | true | Id-chunk reads 4 at once (`GENERATORS_READ_CONCURRENCY`, `data/generators.ts:59`) |
| `GENERATORS_PERF.readsByProject` | `:91` | **false** | Turbines read by type ids (wait for the types) |
| `GENERATORS_PERF.optimisticToggle` | `:92` | false | No optimistic status toggle |
| `GENERATORS_PERF.persistCatalogue` | `:93` | false | No IndexedDB catalogue |
| `GENERATORS_PERF.relaneWrites` | `:94` | true | Independent follow-up writes in one wave |
| `GENERATORS_PERF.replaceLanes` | `:95` | true | Replace Identify as a dependency graph |
| `GENERATORS_PERF.trimReload` | `:96` | true | Session / Milestones / General Data project copies only marked stale |
| `GENERATORS_PERF.wideGroups` | `:97` | true | Default group limit 16 |
| `GENERATORS_PERF.deleteReadWaves` | `:98` | true | Delete Identify reads as a graph |
| `GENERATORS_PERF.countryFromSharedList` | `:99` | true | Country from shared 30-min list (no single-row read) |
| `REVENUE_PERF.parallelVolumeWrites` | `data/revenuesFlags.ts:34` | true | Volume deletes one group (16), creates one group |
| `REVENUE_PERF.wideCreateGroup` | `data/revenuesFlags.ts:35` | true | Volume create group 16 wide |
| `REVENUE_PRICE.lookup` | `data/revenuesFlags.ts:52` | `"yearCurve"` | Business rule (not perf) |
| Finance `parallelReads` | `data/financeFlags.ts:33` | true | Inputs not waiting for categories; states cached; CAPEX chunks parallel (8) |
| Finance `lazyReads` | `:34` | true | CAPEX total / turbine count only when card/panel opens |
| Finance `targetedReload` | `:35` | true | `perf.ts reloadKeys` |
| Finance `concurrentWrites` | `:36` | true | Tranche / option / seed writes in `together()` groups |
| Finance `wideGroups` | `:37` | true | Tranche group 16 wide |
| Finance `bulkSchedules` | `:38` | **false** | Repayments / step-ups single requests (ON = `createMany`/`updateMany` from 5 rows) |
| `BULK_MIN_ROWS` | `data/financeFlags.ts:61` | 5 | Threshold for the above |
| `PRODUCTION_WIDE_GROUPS` | `features/pm/production/rules.ts:1398` | true | Yield Save group 16 wide |
| `PRODUCTION_GENERATION_WAVES` | `features/pm/production/rules.ts:1625` | true | One-shot generation creates grouped into dependency waves (default limit **8**) |
| `CAN_EDIT_SELECTED_PROJECT` | `features/pm/production/hooks.ts:134` | true | Server decides (D1) |
| `TUNED_CHUNKING` (shared, other auditor) | `data/bulkSend.ts:126` | true | Bulk chunks: min 10, parallel 8, max 500, write gate 24 |
| Read widths | `data/generators.ts:59,650`; `data/production.ts:302`; `data/finance.ts:44` | 4 / 4 / 4 / 8 | `mapLimit` widths of chunked reads |
| `REFERENCE_STALE` | `features/pm/generators/queries.ts:27`, `revenues/hooks.ts:72`, `finance/hooks.ts:91` | 30 min | Reference read cache |
| `GENERATORS_WARMUP_DELAY_MS` | `app/generatorsWarmup.ts:20` | 1500 ms | Warm-up delay on other PM screens |
| `GENERATOR_CATALOGUE_MAX_AGE_MS` | `data/generatorCatalogueCache.ts:27` | 12 h | Only relevant when `persistCatalogue` is on |
| Bulk 501 session flags | `data/generatorsBulk.ts:141-149` | sessionStorage | After one 501 the tab writes row by row |

---

### PM B: boot, Project Overview, PM screens, Cluster Checklist

###### Files read

- **Boot:** `main.tsx`, `App.tsx`, `app/{SessionContext.tsx, Providers.tsx, bootPlan.ts, bootPrefetch.ts, startupFlags.ts, routes.tsx, screenLoaders.ts, queryLog.ts, useCurrentUser.ts, generatorsWarmup.ts, adminAccess.ts}`, `platform/powerClient.ts` (excerpts).
- **Shared data modules:** `data/{currentUser, project, pmProjectRow, projectStates, projectStateLookup, personCache, keys, notConnected, client (fetchAll, fetchPage, countedPage, deleteRecord), usePlanWrite (run/mutation part), writePlan (concurrent/guarded fields), countries (key and select), adminGatesApprovals (listGateApprovals, findScopeCountryTechId, listChecklistApprovals, searchEntraPeople, getEntraPeople), odata (chunk), concurrency (constants)}.ts`.
- **Project Overview:** `features/pm/project-main/{queries.ts, hooks.ts, Screen.tsx (data parts), rules.ts (PROJECT_SELECT, PAGE_SIZE)}`, `data/projects.ts`.
- **General Data:** `features/pm/general-data/{queries.ts, hooks.ts, reload.ts, Screen.tsx (save paths), rules.ts (write plans)}`, `data/generalData.ts`.
- **Milestones:** `features/pm/milestones/{hooks.ts, Screen.tsx (save), rules.ts (planSaveMilestones)}`, `data/milestones.ts`.
- **Team:** `features/pm/team/{hooks.ts, reload.ts}`, `data/team.ts`.
- **Planning:** `features/pm/planning/{hooks.ts, reload.ts, rules.ts (seed plans)}`, `data/planning.ts`.
- **Grid Operator:** `features/pm/grid-operator/{hooks.ts, reload.ts}`, `data/gridOperator.ts`.
- **Cluster Check List:** `features/pm/checklist/{hooks.ts, Screen.tsx (orchestration, busy gates, handlers), rules.ts (write plans, stale guards)}`, `data/{checklist, checklistBulk, checklistBulkFlags, checklistPeople, checklistPerfFlags, flows}.ts`, `platform/azureMapsToken.ts` (cache comments).
- **Generators prefetch** (it is triggered from `app/`): `features/pm/generators/queries.ts`, `data/generatorsPerfFlags.ts` (flag values only).
- **`features/shared/report-problem/ReportProblemPanel.tsx`:** imports only `@/components`, `useSession` and `platform/telemetry` (lines 22-30). It makes **no Dataverse call** and is out of further scope.
- **Docs:**
  - `ProjectDocs/app-docs/optimization/02_Optimization_Findings_Register.md` (OPT-01…OPT-19), `05_Implementation_Tracker.md` (status lines), `08_Final_Optimization_Summary.md`;
  - `ProjectDocs/app-docs/16-PM-FLOWS-IN-THE-CODE-APP.md`, `ProjectDocs/app-docs/CLUSTER-CHECKLIST-ANALYSIS-2026-11-17.md`, `ProjectDocs/migration-plans/04-flow-inventory.md`;
  - `02-OPEN-DECISIONS.md`: D119 in full; the D150 and D156 status and "not built" lines.

###### Flag table (current values in the code)

| Flag | File:line | Value | Effect |
|---|---|---|---|
| `startupFlags.envVarsBlockFirstPaint` | `app/startupFlags.ts:17` | `false` | The shell does not wait for the two environment-variable reads |
| `startupFlags.bootPrefetch` | `app/startupFlags.ts:26` | `true` | `bootPrefetch.ts` starts the first screen's chunk and reads from the URL before React mounts |
| `startupFlags.nextPagePrefetchDelayMs` | `app/startupFlags.ts:34` | `1500` | The Overview's next page is prefetched 1.5 s after the page is on screen |
| `startupFlags.parallelUserLookups` | `app/startupFlags.ts:42` | `true` | The current-user chain is 3 waves deep, and roles are filtered by the 5 badge names |
| `PM_ROW_ONLY_PROJECT_LOAD` (`projectLoadSwitch.pmRowOnly`) | `data/project.ts:146` | `true` | A PM route's session project is 1 request: the row, with the cluster-state name from its annotation |
| `GENERATORS_PERF.prefetch` | `data/generatorsPerfFlags.ts:89` | `true` | The Generators reads are warmed 1.5 s after any PM screen opens, and at boot on `/project/generators` |
| `GENERATORS_PERF.countryFromSharedList` | `data/generatorsPerfFlags.ts:99` | `true` | The Generators project reads its country from `qk.adminCountries` |
| `GENERATORS_WARMUP_DELAY_MS` | `app/generatorsWarmup.ts:20` | `1500` | The delay of the warm-up above |
| `CHECKLIST_BULK.materialise` | `data/checklistBulkFlags.ts:9` | **`false`** | The template copy is N single creates; one `CreateMultiple` when on. OPT-21 / DEC-4 hold it off until its DEV test |
| `CHECKLIST_PERF.targetedReload` | `data/checklistPerfFlags.ts:70` | `true` | A row patch reloads the cluster's rows only |
| `CHECKLIST_PERF.earlyRows` / `earlyVisit` / `prefetchCopy` / `wideCopy` | `data/checklistPerfFlags.ts:71-74` | `true` | Rows and visit start before the gates; the templates are read ahead; the copy runs 16 wide |
| `CHECKLIST_PERF.longPeopleCache` / `scopedGates` / `sharedStates` / `quietFocus` | `data/checklistPerfFlags.ts:75-78` | `true` | Entra answers kept 30 min; gates cached by country and technology; shared states; no focus refetch of the reference reads |
| `CHECKLIST_PERF.completeCopy` | `data/checklistPerfFlags.ts:79` | `true` | Behaviour switch (D158): an interrupted copy is completed |
| `SCOPE_ID_MEMO` | `data/checklistPeople.ts:35` | `true` | The checklist scope row id is memoised for the people window |
| `PEOPLE_FRESH_LONG_MS` | `data/checklistPeople.ts:21` | 30 min | The window of the Check List's Entra cache |
| `PERSON_CACHE_MS` / `PERSON_LOOKUP_CONCURRENCY` | `data/personCache.ts:23,26` | 30 min / 6 | The Team screen's Entra cache and its fan-out |
| `JOB_TYPE_MEMO_MS` | `data/milestones.ts:290` | 30 min | The Fabric job-type id is memoised |
| `WIDE_GROUP_CONCURRENCY` | `data/concurrency.ts:41` | 16 | The checklist copy width with `wideCopy` |
| `CHUNK` | `data/odata.ts:70` | 40 | The ids per OR-chunk (team roles, approval settings, generator price ladders) |
| QueryClient defaults | `app/Providers.tsx:23-31` | retry `attempt < 2 && isRetryable`; `staleTime` 30 s; `refetchOnWindowFocus: true`; mutations `retry: false` | These apply to every query below unless it overrides them |

---

### Admin screens and the shared write engine

###### Files read

- Write engine: `data/writePlan.ts`, `data/executePlan.ts`, `data/runPlan.ts`, `data/usePlanWrite.ts` (+ `usePlanWrite.test.ts` UT-PLANWRITE-004),
  `data/ownerBindGuard.ts`, `data/newRowId.ts`, `data/rowValues.ts`, `data/odata.ts` (exports, `CHUNK`), `data/client.ts`,
  `data/concurrency.ts`, `data/retry.ts` (delete retry), `data/verifyGone.ts`, `data/generatorsDeleteFlags.ts`,
  `platform/errors.ts`, `platform/privileges.ts`, `platform/requestLog.ts` (`loggedCall` only), `app/Providers.tsx` (query defaults).
- Admin data: `data/adminCapexAccounts.ts`, `adminChecklistTables.ts`, `adminContract.ts`, `adminCost.ts`, `adminDefaultChecklists.ts`,
  `adminGatesApprovals.ts`, `adminInvalidation.ts`, `adminMilestones.ts`, `adminQueryPresets.ts`, `adminRowWrites.ts`; plus
  `data/capexChart.ts`, `data/capexAccounts.ts`, `data/countries.ts`, `data/keys.ts` (admin keys).
- Admin features: `features/admin/*/hooks.ts` (all six), the data-call parts of each `Screen.tsx`, the plan builders in each `rules.ts`,
  `features/shared/useBusyRunner.ts`.
- Docs: `ProjectDocs/app-docs/optimization/02_Optimization_Findings_Register.md` (OPT-07, 08, 09, 17, 18, 20, 21, 22),
  `08_Final_Optimization_Summary.md`, `05_Implementation_Tracker.md` (B7 rows), `02-OPEN-DECISIONS.md` D36 §1–3, D153, D157, D160 §10,
  `ProjectDocs/migration-plans/04-flow-inventory.md` (verified 19 Oct 2026 section).
- SDK version installed: `node_modules/@microsoft/power-apps/package.json` → `"version": "1.3.1"`; no `setTimeout`/timeout in the SDK `dist` JS.

###### Flags and switches in scope (current values)

| Flag / constant | File:line | Current value | Effect |
|---|---|---|---|
| `OWNER_BIND_GUARD.refuseCreateWithoutOwner` | `data/ownerBindGuard.ts:276` | `true` | Project-scoped create without BU bind refused before send (D158). Admin tables never bind `/vsb_projects(` → not affected. |
| `GENERATORS_DELETE` | `data/generatorsDeleteFlags.ts:32-36` | `tieredDeletes: true, verifyDeletes: false, parentOrder: false, guardedUpdates: false` | `verifyDeletes` gates the `confirm` read-back of hardened deletes. No admin plan uses hardened deletes. |
| `WRITE_CONCURRENCY` | `data/concurrency.ts:31` | `8` | Default pool / `together()` limit. |
| `WIDE_GROUP_CONCURRENCY` | `data/concurrency.ts:41` | `16` | Generators/Production only. |
| `DELETE_CONCURRENCY` | `data/concurrency.ts:140` | `16` | Admin per-row deletes (CAPEX clean-up, DevCo unlinks). |
| `LEAF_DELETE_CONCURRENCY` / `CASCADE_DELETE_CONCURRENCY` | `data/concurrency.ts:156-157` | `16` / `4` | Plan delete tiers (not used by admin). |
| `VERIFY_READ_CONCURRENCY` | `data/verifyGone.ts:21` | `4` | Read-back of hardened deletes. |
| `MAX_BULK_TRIES` / `MAX_NO_STATUS_TRIES` / `MAX_RETRY_WAIT_MS` | `data/retry.ts:17-20` | `3` / `2` / `30_000` | Hardened-delete retry bounds. |
| `DEFAULT_MAX_PAGES` / `DEFAULT_PAGE_SIZE` | `data/client.ts:48-49` | `50` / `500` | `fetchAll` cap (throws past it, D157). |
| `DEFAULT_MAX_PAGE_WALK` | `data/client.ts:216` | `100` | `countedPage` (no admin caller). |
| `CHUNK` | `data/odata.ts:70` | `40` | GUIDs per `lookupIn`/`idIn` filter. |
| Query defaults | `app/Providers.tsx:23-31` | `retry: attempt < 2 && isRetryable`, `staleTime: 30 s`, `refetchOnWindowFocus: true`, `mutations: { retry: false }` | Global. |
| `FRESH_ON_ENTRY` | `data/adminQueryPresets.ts:14` | `{ staleTime: 0, refetchOnMount: "always" }` | CAPEX Accounts tree only. |
| `FRESH_ON_ENTRY_ONCE` | `data/adminQueryPresets.ts:16-18` | `staleTime: ∞, refetchOnMount: "always", refetchOnWindowFocus: false` | Check List Settings locks. |
| `NO_FOCUS_REFETCH` | `data/adminQueryPresets.ts:15` | `{ refetchOnWindowFocus: false }` | Milestones assumptions (and one cost-book query). |
| `READ_FAN_OUT` (CAPEX clean-up) | `data/adminCapexAccounts.ts:366` | `4` | Chunk reads in flight. |
| `READ_FAN_OUT` (checklist approvals) | `data/adminChecklistTables.ts:42` | `4` | Approval chunk reads in flight. |
| `ORDER_WRITE_CONCURRENCY` | `data/adminDefaultChecklists.ts:308` | `4` | Check List Settings order PATCHes ("each row starts one flow run"). |
| `GATES_REUSE_PEOPLE` | `data/adminGatesApprovals.ts:490` | `true` | Reload reuses resolved PM names (D160 §10 DIVERGENCE). |
| `PEOPLE_CHUNK` / `PEOPLE_CHUNK_FAN_OUT` / `PEOPLE_LOOKUP_FAN_OUT` / `PEOPLE_SEARCH_TOP` | `adminGatesApprovals.ts:478, 481, 312, 323` | `15` / `4` / `6` / `25` | Entra (`aadusers`) reads. |
| `CAPEX_CHART_MEMO_MS` | `data/capexChart.ts:27` | `30_000` | Shared active chart read (Contracts settings uses it). |
| `REFERENCE_STALE_MS` (Costs settings) | `features/admin/admin-cost/hooks.ts:26` | `30 min` | Costs reference reads. |
| D36 §1 "no bulk services" | `ProjectDocs/app-docs/02-OPEN-DECISIONS.md` §D36.1 | in force for admin | Every admin multi-row write is per-row (`adminRowWrites.ts`). |

---

