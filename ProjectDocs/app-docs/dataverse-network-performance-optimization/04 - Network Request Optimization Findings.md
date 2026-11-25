# 04 - Network Request Optimization Findings

> Stage 1 audit, 25 Nov 2026. Branch `feature/dataverse-network-performance-optimization`, from `origin/RounakDev1` at `30afece`. Investigation only: no application source file was changed. Every request count is **code-derived**, not measured. 

Duplicate, overlapping, unnecessary and sequential-but-independent requests; refresh scope; round trips.

**28 findings name this area** (a finding naming several areas appears in each; its primary area is listed first in its block).

| ID | Pri | Conf | Title |
|---|---|---|---|
| AD-02 | P1 | High | CAPEX clean-up request volume: 2 requests per zeroed row, 1 per deleted row (re-raise OPT-22 / D36 §1 with new evidence) |
| AD-03 | P1 | High | `hasContracts` fan-out: one uncapped query per visible subaccount, refetched on focus, retried without Retry-After |
| CA-04 | P1 | Medium | Id-list fan-out uses 40 ids per request in an `or` chain; larger chunks or the `In` function would cut request counts several-fold (new evidence for the deferred OPT-09 family) |
| CA-05 | P1 | Medium | A paid toggle, a panel save or a panel delete reloads the WHOLE category book, and the spinner waits for it |
| AD-04 | P2 | High | CAPEX tree is stale at 0 ms: every window focus re-reads the whole account table |
| AD-06 | P2 | High | Project Gates: every Active-pill click reloads the whole dataset chain (3–4 waves); overlapping clicks run overlapping reloads |
| AD-07 | P2 | High | Check List Settings: each order PATCH fires a server flow; delete-with-renumber = 2 requests and 1 flow run per later row |
| CA-06 | P2 | High | After an Add Cost Save the app refetches the Summary totals of the whole project (not displayed) and the category book, twice, in a burst beside the deferred deletes |
| CA-08 | P2 | High | The SPV/DevCo mapping table is read on every CAPEX book load and every sheet load, with no cache |
| CA-09 | P2 | Medium | The comment dots wait one extra wave: comments start only after the payments have returned |
| PA-03 | P2 | High | Finance tranche Save rewrites every repayment and step-up row, changed or not |
| PA-04 | P2 | Medium | Every Generators save writes the plant roll-up, which fires `LoadDevexCapexCostTotalCapacityTrigger` even when the totals did not change |
| PA-05 | P2 | High | Delete / replace: the permission-cancellation flow and the Identify reads run one after the other although they are independent |
| PB-03 | P2 | High | The PM deep-link boot prefetch starts only the session project; the screen's own first reads wait for the gate |
| PB-04 | P2 | High | "Edit Project" and "Edit Costs" open a new tab that pays the whole cold boot again |
| WE-01 | P2 | High | Deterministic failures are classified as retryable: a `fetchAll` cap failure is re-walked twice more |
| AD-08 | P3 | High | Redundant existence GET right after a create (create-then-update pairs) |
| AD-10 | P3 | High | Period-1 edit propagates to every later period even when nothing changed (deferred S6-07, recorded for completeness) |
| CA-15 | P3 | Medium | Comments panel Save is a chain of single awaits; the deletes could overlap |
| CB-09 | P3 | High | Independent sequential awaits in the OPEX writes |
| CB-11 | P3 | High | A Contracts edit save reads the contract's links only after the contract PATCH |
| PA-09 | P3 | High | Type add / delete / replace refetches the turbines twice (old key, then new key) |
| PA-11 | P3 | Medium | The Generators warm-up sends 10–13 reads from every PM screen, whether or not Generators is visited |
| PA-15 | P3 | High | A selected type's O&M guard is 2 sequential reads per selection |
| PB-07 | P3 | Medium | The current-user chain can lose a wave: filter roles and teams by the Entra id, not by the user row's id |
| PB-08 | P3 | Medium | The environment variables take two sequential reads; the console gate and click-time flows wait for them |
| PB-09 | P3 | High | The Generators warm-up runs 10 speculative reads on every PM screen, and most of them go stale before they are used |
| PB-13 | P3 | High | Check List: the trackings are read twice on every cluster visit |

## Findings

### AD-02 - CAPEX clean-up request volume: 2 requests per zeroed row, 1 per deleted row (re-raise OPT-22 / D36 §1 with new evidence)

**Priority P1, confidence High.** Source scope: Admin screens and the shared write engine.

- **Area:** network, bulk · **Screen:** CAPEX Accounts
- **File:line:** `data/adminCapexAccounts.ts:392-416`, `data/client.ts:435-449`
- **Function:** `cleanUpForecastCosts`, `updateRecordIfExists`
- **Problem:** Every row to zero was returned moments earlier by a server-side filter (AD-OP-24), and each one is then read again by primary key before its PATCH. The delete half has no bulk path at all.
- **Evidence:** `client.ts:435-441`: `client().retrieveMultipleRecordsAsync(... { select: [primaryKey], filter: \`${primaryKey} eq ${id}\`, maxPageSize: 1 })`, then `:447` `updateRecordAsync`; `adminRowWrites.ts:102` `return updateRecordIfExists(operation, tableName, id, fields, { primaryKey, client });`
- **Impact:** 2Z + D requests (§B). New since OPT-22 was deferred: the clean-up moved to the background (23 Nov 2026, `Screen.tsx:211-215`) because it "took minutes under the overlay". Background avoids the UI wait, but it does not reduce the request count that drives AD-01.
- **Proposed solution:**
  - (a) No decision needed: OPT-22's `updateRecordsIfExist`, i.e. one `idIn` existence read per 40 ids right before that chunk's PATCHes (pattern `verifyGone.ts:43-75`). Zero cost goes from 2Z to Z + ⌈Z/40⌉ and keeps `RecordGoneError` per row. Window: one chunk instead of one row.
  - (b) *Needs decision, lifts D36 §1:* `UpdateMultiple` for the zeroing. The action is already registered (`CreateMultiple`/`UpdateMultiple`/`UpsertMultiple`).
  - (c) *Needs a custom API / platform decision:* a server-side bulk delete (BulkDelete job or a custom API) for the later-year rows. There is no client-side multi-delete on a standard table, and the SDK cannot `$batch`.
- **Behaviour change?** (a) none (same rows, same guard semantics, a wider race window); (b) and (c) need a product decision.
- **Risk:** (a) Low–Medium (window grows from ms to one chunk; DEC-7 risk acceptance). (b) a chunk lands whole or not at all, plus 501 fallbacks, as in D51.
- **Dependencies:** DEC-7, D36 §1, OPT-22.
- **Validation approach:** request-count unit test (mocked client counts GETs), plus a DEV run comparing `[VSB] DATA` line counts before and after.
- **Priority:** P1 · **Confidence:** High.

### AD-03 - `hasContracts` fan-out: one uncapped query per visible subaccount, refetched on focus, retried without Retry-After

**Priority P1, confidence High.** Source scope: Admin screens and the shared write engine.

- **Area:** network, concurrency, caching · **Screen:** CAPEX Accounts
- **File:line:** `features/admin/admin-capex-accounts/hooks.ts:49-56`, `Screen.tsx:152-158`, `app/Providers.tsx:23-27`
- **Function:** `useHasContracts`
- **Problem:** every subaccount of every expanded account gets its own `fetchPage` query, all started together (no gate). With `staleTime: 30_000` and the global `refetchOnWindowFocus: true`, all of them re-run on each tab return after 30 s. A 429 is retried twice with React Query's default 1 s / 2 s backoff, ignoring Retry-After.
- **Evidence:** `hooks.ts:50-55`: `useQueries({ queries: ids.map((id) => ({ queryKey: qk.adminCapexHasContracts(id), queryFn: () => hasContracts(id), staleTime: 30_000 })) })`; `Screen.tsx:155`: `for (const a of accounts) if (expandedIds.has(a.id)) for (const s of a.children) ids.push(s.id);`
- **Impact:** expanding a few large accounts (e.g. 5 × 20 subaccounts = 100 ids, illustrative) sends 100 reads at once, above the 52-concurrent ceiling per user, while the tree refetch and boot reads share it. The answer only greys out Delete, and the server re-checks it at delete time anyway (`adminCapexAccounts.ts:302, 310`).
- **Proposed solution:** (a) no decision needed: run the checks through a shared read gate of 4–8 (the deferred OPT-09 helper, or a local `createGate` used in `queryFn`); (b) *needs product decision (freshness):* `refetchOnWindowFocus: false` and a longer `staleTime` (e.g. 5 min) for these checks only. Safe because `deleteCapexSubaccount`/`deleteCapexAccount` re-check on the server before deleting. (c) Optional: one read per expanded account with `lookupIn("vsb_account", subIds)`, `$select=_vsb_account_value`. Not proposed by default, because without `$apply`/distinct it can return many contract rows per account.
- **Behaviour change?** (a) none; (b) needs product decision (a check may be up to 5 min old; the delete stays server-checked).
- **Risk:** Low.
- **Dependencies:** OPT-09 (deferred), OPT-18/DEC-3.
- **Validation approach:** jsdom test that expands 3 accounts with 30 subaccounts and asserts in-flight count ≤ gate; on DEV, count `[VSB] DATA "check CAPEX contracts on account"` lines after a tab return.
- **Priority:** P1 · **Confidence:** High (code); the platform behaviour above 52 in flight is not measured here.

### CA-04 - Id-list fan-out uses 40 ids per request in an `or` chain; larger chunks or the `In` function would cut request counts several-fold (new evidence for the deferred OPT-09 family)

**Priority P1, confidence Medium.** Source scope: Cost A: CAPEX/DEVEX, Add Cost from Table, shared costing layer.

- **Area** network / query. **Screen** CAPEX tab, Summary, Add Cost, comments. **File:line** `data/odata.ts:63-72,78` (`CHUNK = 40`, `lookupIn`, `chunk`); callers `costBook.ts:913,1040,1208`, `comments.ts:66`, `standardContracts.ts:30`, `addCostSheet.ts:146,194,214`, `bulkSend.ts:195`. **Function** `lookupIn`, `chunk`.
- **Problem** Every read keyed by a list of contract or account ids sends `ceil(N/40)` parallel requests. The code gives the cap as "the ~16 k practical query cap (36 chars + ' or ' + column name each)". One `_vsb_contract_value eq <guid>` term is about 70 characters, so 40 ids is about 3 KB: roughly 4-5x headroom under the cited cap. The comment "Dataverse has no `in` for GUIDs in `$filter`" is at odds with the Dataverse Web API query function `Microsoft.Dynamics.CRM.In(PropertyName=...,PropertyValues=[...])` (Microsoft documentation; NOT verified through this SDK or host).
- **Evidence** `data/odata.ts:70`: `export const CHUNK = 40;` and `:73-75`: `return or(...ids.map((id) => lookupEq(column, id)));`
- **Impact** (symbolic) a 400-contract category costs 10 payment reads + 10 comment reads per load or refetch; a 2,000-contract Summary costs 50 sum reads. At a chunk of 150 these become 3 and 14. Fewer concurrent reads also lowers the 52-limit pressure of CA-06 and CA-17.
- **Proposed solution** Make the chunk size a per-use constant for reads (100-150, subject to a DEV test of the largest filter the host accepts), then evaluate the `In` function on one read behind a switch. Do not change write payloads.
- **Behaviour change?** none. **Risk** medium (URL length through the host's batch envelope; server filter-complexity limits; both unknown, G2). **Dependencies** G2. **Validation** on DEV with the largest project, record the request count and the first failing chunk size; unit test pins chunk boundaries (`odata.test.ts`). **Priority** P1. **Confidence** medium-low (the saving is arithmetic, the platform ceiling is not known).

### CA-05 - A paid toggle, a panel save or a panel delete reloads the WHOLE category book, and the spinner waits for it

**Priority P1, confidence Medium.** Source scope: Cost A: CAPEX/DEVEX, Add Cost from Table, shared costing layer.

- **Area** network / caching. **Screen** CAPEX/DEVEX tab. **File:line** `features/cost/costing/capexInvalidation.ts:53-61`, `features/cost/costing/useCostBook.ts:479-495,518-531` (awaited `invalidate`), `data/costBook.ts:913,1039`. **Function** `capexWriteInvalidations`, `useCapexWrites`.
- **Problem** OPT-12 narrowed the paid job to "the book alone", but the book is the whole category: payer defaults + `ceil(A/40)` contract reads + `ceil(C/40)` payment reads (each possibly paged) to show ONE changed month or ONE contract. The Add Cost path already patches the cached book from what the Save applied (`savedSheetPatch.ts`, `useCostBook.ts:660`); the panel path does not. D56 section 5 gives the reason: "Making it fire-and-forget would need a book patch like D51 section 11.19, or the pre-save grid would flash."
- **Evidence** `capexInvalidation.ts:54`: `if (job === "paid") return [book];`; `useCostBook.ts:494`: `await invalidate(context ? context.category : category, savedMonthsDeleteRows(args.payments) ? "save-deleted" : "save");`
- **Impact** Per paid toggle: 1 write, then `1 + ceil(A/40) + ceil(C/40)` requests in a 3-wave chain that the user waits for. The register (OPT-25) quotes "about 60k payments on a large category".
- **Proposed solution** On success `setQueryData` the cached book with the known result (the paid flag of one payment; the saved line and its month rows; the removed line), then confirm with a background refetch (`refetchType:"active"`, not awaited), as Add Cost does. Keep the awaited reload behind a switch for rollback.
- **Behaviour change?** needs product decision (the spinner lowers before the reload; canvas timing parity, D56 section 5). **Risk** medium (the patch must reproduce `loadCostLines` derivations such as `payer`, `totalCost`, `linkedCluster*`, `editedFromSpreadsheet`). **Dependencies** `applySavedSheetToBook` as the model. **Validation** differential test: patched book equals re-read book for random saves (as done for Add Cost, UT-SHEETPATCH). **Priority** P1. **Confidence** medium.

### AD-04 - CAPEX tree is stale at 0 ms: every window focus re-reads the whole account table

**Priority P2, confidence High.** Source scope: Admin screens and the shared write engine.

- **Area:** caching, network · **Screen:** CAPEX Accounts
- **File:line:** `data/adminQueryPresets.ts:14`, `features/admin/admin-capex-accounts/hooks.ts:26-31`
- **Function:** `useCapexTree`
- **Problem:** `FRESH_ON_ENTRY` is documented as "refetch whenever the screen mounts", but its `staleTime: 0` combined with the global `refetchOnWindowFocus: true` also refetches on every focus, not only after 30 s like other queries. The preset comment does not mention this.
- **Evidence:** `adminQueryPresets.ts:14`: `export const FRESH_ON_ENTRY = { staleTime: 0, refetchOnMount: "always" } as const;`; `Providers.tsx:27` `refetchOnWindowFocus: true`.
- **Impact:** 1 full-table `fetchAll` (6 columns, inactive rows included) per focus event (alt-tab, dialog, devtools). Small per call, but frequent and avoidable.
- **Proposed solution:** `{ staleTime: 30_000, refetchOnMount: "always" }` keeps "fresh on every entry" and limits focus refetches to the app default. Or add `NO_FOCUS_REFETCH` as Milestones does.
- **Behaviour change?** needs product decision (minor freshness: another admin's edit shows at the next entry or after 30 s instead of the next focus). OPT-18/DEC-3 covers the policy; this is the one admin query where it is 0 s.
- **Risk:** Low.
- **Dependencies:** DEC-3.
- **Validation approach:** hook test with a focus event within 30 s: assert no refetch; mount: assert refetch.
- **Priority:** P2 · **Confidence:** High.

### AD-06 - Project Gates: every Active-pill click reloads the whole dataset chain (3–4 waves); overlapping clicks run overlapping reloads

**Priority P2, confidence High.** Source scope: Admin screens and the shared write engine.

- **Area:** network, caching · **Screen:** Project Gates
- **File:line:** `features/admin/admin-gates-approvals/hooks.ts:71-104`, `data/adminInvalidation.ts:171-182`, `data/adminGatesApprovals.ts:633-684`
- **Function:** `useToggleActive`, `loadDataset`
- **Problem:** a one-boolean toggle is already optimistic, yet `onSettled` invalidates the full dataset: templates, header, tasks and approval chunks. The pill stays pending until that finishes. Each concurrent toggle on another pill calls `cancelQueries` and `invalidate` again; `loadDataset` takes no `AbortSignal`, so a cancelled reload's SDK requests still run to completion.
- **Evidence:** `hooks.ts:84`: `await qc.cancelQueries({ queryKey: key });`; `hooks.ts:102`: `onSettled: () => invalidateAfterGatesWrite(qc, { countryId, technology }),`; `hooks.ts:46`: `queryFn: () => repo.loadDataset(countryId as string, technology as number, qc.getQueryData<GatesDataset>(key)?.people)` (no signal).
- **Impact:** ≈ 8–12 requests per click (§B); N quick clicks on different pills = N × (2 + 6–10) requests, several reload chains overlapping. A rollback after a failure restores a snapshot that may predate a sibling toggle's optimistic flip (`hooks.ts:85, 100`), so that sibling's pill shows the old value until the reload.
- **Proposed solution:** (a) none: after a successful toggle, reload only the half that changed: templates for a gate toggle, approvals for a task toggle (reuse the cached header and tasks). Or keep the optimistic row and mark the dataset stale with `refetchType: "none"` (the `staleOnly` pattern of `usePlanWrite.ts:203-205`). (b) Coalesce: debounce the post-toggle invalidation by about 300 ms so N clicks give one reload.
- **Behaviour change?** (a) partial reload: needs product decision (other users' edits in the untouched half show at the next full load or focus); (b) none.
- **Risk:** Low–Medium (the dataset's derived index `buildTaskIndex` must still be rebuilt).
- **Dependencies:** OPT-17 (people reuse done), OPT-18.
- **Validation approach:** hook test: 3 toggles in 100 ms → 3 guarded updates, 1 dataset load; `[VSB] ACTION` count on DEV.
- **Priority:** P2 · **Confidence:** High.

### AD-07 - Check List Settings: each order PATCH fires a server flow; delete-with-renumber = 2 requests and 1 flow run per later row

**Priority P2, confidence High.** Source scope: Admin screens and the shared write engine.

- **Area:** network, server load · **Screen:** Check List Settings
- **File:line:** `data/adminDefaultChecklists.ts:307-329, 346-356`, `features/admin/admin-default-checklists/rules.ts:341-350`, `data/adminChecklistTables.ts:314-316`
- **Function:** `writeOrders`, `softDeleteTask`, `renumberAfterDelete`
- **Problem:** a delete renumbers every later row of the group, one guarded PATCH each (2 requests). Every PATCH triggers `SynchroniseProjectTaskList-Add_Update`, which rewrites that task in every eligible project.
- **Evidence:** `adminDefaultChecklists.ts:307`: `/** Per-row Order writes are bounded; each row starts one flow run. */ export const ORDER_WRITE_CONCURRENCY = 4;`; `rules.ts:347-349`: `.filter((t) => … t.order > cut).map((t) => ({ id: t.id, order: (t.order as number) - 1 }))`.
- **Impact:** deleting the first of 30 tasks = 61 requests and 30 flow runs, each fanning out to project checklists (§E). The client side is bounded (4 wide). The server side (flow runs × projects) is the larger cost and is not visible to the app.
- **Proposed solution:** (a) none: batch the existence check per 40 ids (OPT-22 pattern) to halve the client requests; (b) *needs product decision:* skip the renumber, i.e. allow gaps in `vsb_order` and sort by order (canvas parity says renumber); or (c) a custom API / flow that renumbers in one server call.
- **Behaviour change?** (a) none; (b) and (c) need a product decision.
- **Risk:** (a) Low.
- **Dependencies:** OPT-22 / DEC-7; flow owner.
- **Validation approach:** count flow runs in the flow run history for one DEV delete; unit test for request counts.
- **Priority:** P2 · **Confidence:** High (code); flow fan-out per project not measured.

### CA-06 - After an Add Cost Save the app refetches the Summary totals of the whole project (not displayed) and the category book, twice, in a burst beside the deferred deletes

**Priority P2, confidence High.** Source scope: Cost A: CAPEX/DEVEX, Add Cost from Table, shared costing layer.

- **Area** concurrency / network. **Screen** Add Cost from Table -> CAPEX. **File:line** `features/cost/costing/useCostBook.ts:622-625` (`invalidateQueries ... refetchType: "all"`), `followBackgroundDeletes` (runs `invalidate()` again), `features/cost/add-costs-from-table/Screen.tsx:232` (`back()` returns to `?category=N`), `data/costBook.ts:1200-1222`. **Function** `useSaveAddCostSheet.invalidate`.
- **Problem** `["capex-totals", project]` is invalidated with `refetchType: "all"`. If the Summary tab was opened earlier in the session (query alive in the cache, default gcTime 5 min), the Save re-reads every contract and every cost row of the project (`loadCapexTotals`: `ceil(C_all/40)` reads at 5,000 rows per page) although the user lands on a category tab, not the Summary. The same happens again when the deferred deletes settle.
- **Evidence** `useCostBook.ts:625`: `client.invalidateQueries({ queryKey: ["capex-totals", projectId], refetchType: "all" }),`; `Screen.tsx:232`: `const back = () => navigate({ pathname: "/costs/capex", search: ...category=${category} });`; `useCapexTotals(isSummaryTab(category))` mounts only on the Summary tab.
- **Impact** Per Save, up to `1 + ceil(C_all/40)` (+ pages) wasted reads, twice, plus the book confirm `2 + ceil(A/40) + ceil(C/40)` twice, started while 8 delete requests (4+4) are in flight. For `C_all` above about 1,900 the totals fan-out alone exceeds Dataverse's 52 concurrent requests per user (`ceil(C_all/40) > 47`).
- **Proposed solution** Totals: `refetchType: "none"` (mark stale) so the next visit to the Summary reads once; keep `"all"` for the category book only. Or patch the totals cache from `applied`. Collapse the second invalidation into one only if nothing deferred changes sums (a deferred cost delete does).
- **Behaviour change?** none for data; the Summary would show cached numbers until its mount refetch completes unless patched (needs a UX look). **Risk** low-medium. **Dependencies** `pendingDeletes` snapshot already hides pending rows from totals. **Validation** unit test on invalidation args (as UT-ACSHEET-QUERY-003..008); on DEV count `[VSB]` lines after a save when the Summary was visited earlier. **Priority** P2. **Confidence** high on the facts, medium on the gain.

### CA-08 - The SPV/DevCo mapping table is read on every CAPEX book load and every sheet load, with no cache

**Priority P2, confidence High.** Source scope: Cost A: CAPEX/DEVEX, Add Cost from Table, shared costing layer.

- **Area** caching / network. **Screen** CAPEX tab, Add Cost. **File:line** `data/costBook.ts:157-175`, `:1163` (`const payerRead = category >= 0 ? loadPayerDefaults() : undefined;`), `data/addCostSheet.ts:141`. **Function** `loadPayerDefaults`.
- **Problem** OPT-05 took the read off the critical chain, but it is still one extra request on every tab switch, every post-save refetch (CA-05), every focus refetch (CA-10) and every sheet open. It is global master data (3 columns, whole table) and the chart of accounts beside it already has a shared read with a 30 s memo (`capexChart.ts`).
- **Evidence** `costBook.ts:158-167`: `fetchAll("list SPV/DevCo sub-account mapping", ..., { select: [...], filter: ACTIVE })`, no `sharedRead`.
- **Impact** 1 request per category book load; it is also one more way for the whole book to fail (`payerRead` is awaited at `:1173`).
- **Proposed solution** Put it behind `sharedRead` (30 s to 5 min) like `capexChart.ts`, or use `ensureQueryData` as for project states. The only app reference besides the Cost loaders is a read in `data/adminCost.ts:351`; no in-app write was found (G3).
- **Behaviour change?** none (same freshness window as the CAPEX chart). **Risk** low. **Dependencies** G3. **Validation** extend `costReadPath.waves.test.ts`; count requests per tab switch. **Priority** P2. **Confidence** high.

### CA-09 - The comment dots wait one extra wave: comments start only after the payments have returned

**Priority P2, confidence Medium.** Source scope: Cost A: CAPEX/DEVEX, Add Cost from Table, shared costing layer.

- **Area** network. **Screen** CAPEX tab. **File:line** `features/cost/capex-costs/Screen.tsx:421-423`, `features/cost/costing/useCostBook.ts:845-851`. **Function** `useCapexComments`.
- **Problem** The contract ids exist at the end of wave 2 (`loadCostLines`), but the comments query is enabled only after the whole book (wave 3, payments) resolved, so comments, and standard assumptions, are wave 4 (flow B1).
- **Evidence** `useCostBook.ts:849`: `enabled: contractIds.length > 0,`, where `contractIds = useMemo(() => (book?.lines ?? []).map(l => l.id), [book])`.
- **Impact** One round trip on the dots after every tab open, switch and book refetch (the dots' chain goes from 3 to 4 waves). First paint of the grid is unaffected.
- **Proposed solution** Inside `loadCostBook`, once the contract list returns, `prefetchQuery` the comments under the exact key the screen will use (`["capex-comments", sortedJoinedIds]`) in parallel with payments. The book excludes pending-delete ids, so a mismatch is only a cache miss.
- **Behaviour change?** none. **Risk** low (one wasted request if the user leaves fast). **Dependencies** key equality with `useCostBook.ts:847`. **Validation** wave-count test like `costReadPath.waves.test.ts`. **Priority** P2. **Confidence** medium.

### PA-03 - Finance tranche Save rewrites every repayment and step-up row, changed or not

**Priority P2, confidence High.** Source scope: PM A: Generators, Production, Revenues, Finance.

- **Area**: payload / network · **Screen**: Finance · **File:line**: `features/pm/finance/rules.ts:1092-1112, 1258-1287, 3577-3603`
- **Function**: `repaymentDiff`, `stepUpWrites`, `planTrancheSave`
- **Problem**: `toUpsert` is EVERY row of the schedule. Each existing row gets a PATCH with name, amount, year and four binds (project, category, input, OBU), even when nothing in it changed (for example a header-only edit such as the bank or the margin).
- **Evidence**: `toUpsert: rows.map((r) => { … recordId: stored.find((s) => s.year === r.year)?.id ?? null, … })` (`rules.ts:1103-1111`); `writes.push(r.recordId ? update(ES_FINANCE.financingInputsRepaymentAmounts, r.recordId, data, …) : …)` (`:3584-3586`).
- **Impact**: a 25-year Individual tranche plus 4 step-ups is 31 write requests per Save. A header-only edit could be 1 (the tranche) plus only the changed rows. Each PATCH is an upsert with no `If-Match`, so it can also re-create a row another user deleted (platform fact).
- **Proposed solution**: in `rules.ts`, keep only the upserts whose stored values differ (amount, year, name; for step-ups duration, margin, start year, order). The stored rows are already passed in (`storedRepayments`, `storedStepUps` carry `amount` / `margin` …). Keep a `…CanvasParity` twin.
- **Behaviour change?** needs product decision (low): stored values are identical, but `modifiedon` and the audit history of the unchanged rows no longer move. The canvas `ForAll(Patch)` writes all rows.
- **Risk**: L · **Dependencies**: none · **Validation**: rules test (unchanged schedule gives 0 child writes; one changed amount gives 1); DEV row compare · **Priority**: P2 · **Confidence**: high.

### PA-04 - Every Generators save writes the plant roll-up, which fires `LoadDevexCapexCostTotalCapacityTrigger` even when the totals did not change

**Priority P2, confidence Medium.** Source scope: PM A: Generators, Production, Revenues, Finance.

- **Area**: network / server-side · **Screen**: Generators · **File:line**: `features/pm/generators/plans.ts:203-212, 533-534, 569, 624-625, 690, 708`; `rollback.ts:573, 594`; `ProjectDocs/migration-plans/04-flow-inventory.md:29`
- **Function**: `projectWtgRollup`, `planSaveSimple`, `planSaveTurbine`, `planToggleStatus`, …
- **Problem**: the roll-up PATCH is unconditional. It is sent for a BESS rename, a turbine plinth edit, an inverter label change and so on. The flow triggers on Modified of the plant capacity columns and creates a `vsb_fabricsyncjobs` row each time. One more awaited wave per save as well.
- **Evidence**: `upd(ES.projects, args.project.id, { [t.plant]: sumCapacity(after) }, "the project's plant capacity")` (`rollback.ts:573`); flow inventory: "`vsb_project` · Modified · plant WTG/PV/storage/hydrogen/substation capacity … Creates a `vsb_fabricsyncjobs` row".
- **Impact**: 1 request plus 1 sequential wave per save, a server-side flow run and a Fabric recalculation job. Generators reloads `project` after it (`reload.ts:65`, `familyKeys`).
- **Proposed solution**: compare the computed totals with the loaded project's plant columns (`GeneratorsProjectRow.plant*`, `data/generators.ts:80-85`) and skip the PATCH when they are equal. Keep the canvas-parity twin.
- **Behaviour change?** needs product decision: fewer Fabric sync jobs (a downstream effect the product may rely on as a "something changed" signal), and the canvas writes always.
- **Risk**: M (the loaded project may be stale; compare only when it was read in this visit, or keep the write when it is unknown) · **Dependencies**: confirm on DEV that the flow fires for an unchanged value present in the request (a Dataverse filtering-attribute trigger fires on presence, not on change, to my understanding; not verified here) · **Validation**: DEV: count `vsb_fabricsyncjobs` rows per save before/after · **Priority**: P2 · **Confidence**: medium.

### PA-05 - Delete / replace: the permission-cancellation flow and the Identify reads run one after the other although they are independent

**Priority P2, confidence High.** Source scope: PM A: Generators, Production, Revenues, Finance.

- **Area**: network · **Screen**: Generators · **File:line**: `features/pm/generators/Screen.tsx:1170-1177, 1033-1036, 1085-1088, 1232-1235`
- **Function**: `onConfirm` (deleteType, deletePv), `replaceGeneratorType`, `replacePvType`
- **Problem**: when the type has an open request (`FlowRunId`), the flow round trip and 2–3 read waves are awaited in sequence. The flow writes only the type row's request fields (`hooks.ts:26`), which none of the reads read.
- **Evidence**: `await permissionFlows.cancelIfOpen("wtg", d.type); const inputs = await loadTypeDeleteInputs(planProject.id, d.type.id, …);` (`Screen.tsx:1172-1173`); `box.inputs = await loadReplaceInputs(planProject.id, oldType.id); await permissionFlows.cancelIfOpen("wtg", oldType);` (`:1034-1036`).
- **Impact**: saves the shorter of (flow duration, Identify duration) on every delete or replace of a type with an open request. No change otherwise.
- **Proposed solution**: start the Identify reads and the flow together (`Promise.all`). Build the plan only after both have settled, so the flow still completes before any delete (the D97 order is kept).
- **Behaviour change?** none (reads only; writes still wait for the flow). If the flow fails, the reads were wasted.
- **Risk**: L · **Dependencies**: none · **Validation**: wave test with a delayed fake flow; `[VSB]` lines show the reads overlapping the flow · **Priority**: P2 · **Confidence**: high.

### PB-03 - The PM deep-link boot prefetch starts only the session project; the screen's own first reads wait for the gate

**Priority P2, confidence High.** Source scope: PM B: boot, Project Overview, PM screens, Cluster Checklist.

- **Area:** network, query. **Screen:** Milestones, Team, Planning, Grid Operator, Check List (and Production, Revenues, Finance: other auditors).
- **File:line:** `app/bootPrefetch.ts:44-47`; `app/routes.tsx:130-149`; `App.tsx:75`.
- **Function:** `prefetchTarget` (`pm-screen` branch).
- **Problem:** OPT-03 starts the screen *chunk* and the *session project* for `pm-screen`. Every read the screen makes with only the project id (Check List project and trackings; Team row, members and descriptions; Planning project, row and types; Grid Operator project and row; Milestones project) starts only after the session project has answered and the gate has rendered the `Outlet`. General Data and Generators prefetch their reads already (`:49-58, 79-101`). D156 §6 lists "a start-up prefetch of the Check List" as not built.
- **Evidence:**

  ```
  if (target.kind === "pm-screen" || target.kind === "cost") {
    await quietly("session project", () => qc.prefetchQuery(sessionProjectQueryOptions(…)));
    return;
  }
  ```
  (`bootPrefetch.ts:44-47`)
- **Impact:** 1 wave (the session project) on the critical path of every PM deep link, reload and new tab. Code-derived: about 1 round trip.
- **Proposed solution:** move each screen's project-id-only `queryOptions` into a `queries.ts`, as General Data and Generators do, and prefetch them in the `pm-screen` branch. Same keys, so a wrong guess costs one wasted read.
- **Behaviour change?** None (timing only; the gate still decides what renders).
- **Risk:** L. A key that drifts from the hook's is a wasted read; the UT-BOOT-OPT pattern pins it.
- **Dependencies:** OPT-03; the `queries.ts` refactor per screen.
- **Validation:** bootPrefetch tests (prefetched key = the hook's key, no second request); the `[VSB]` lines on DEV.
- **Priority:** P2. **Confidence:** High.

### PB-04 - "Edit Project" and "Edit Costs" open a new tab that pays the whole cold boot again

**Priority P2, confidence High.** Source scope: PM B: boot, Project Overview, PM screens, Cluster Checklist.

- **Area:** caching, network. **Screen:** Project Overview, then any PM or Cost screen.
- **File:line:** `features/pm/project-main/Screen.tsx:684-728`; `app/SessionContext.tsx:53-65`; `data/currentUser.ts:189-237`.
- **Function:** `openInNewTab`, `openProjectTab`.
- **Problem:** the query cache lives in memory per tab. Every "Edit Project" or "Edit Costs" click re-reads, with nothing shared:
  - the environment variables (2 sequential requests);
  - the whole current-user chain (6 requests, 3 waves);
  - the project-states list and the countries;
  - the session project.

  That is about 10-12 requests of reference data before the target screen's own reads, on every click. The canvas also launches a new tab (parity), but it is a separate app with its own `OnStart`.
- **Evidence:** `window.open(url, "_blank", "noopener,noreferrer");` (`Screen.tsx:674`, the `launch` both paths use); `staleTime: Infinity,` (`useCurrentUser.ts:17`), which lasts only as long as the tab.
- **Impact:** code-derived, about 10-12 requests and 3 waves per opened tab. Users who open several projects from the list pay it each time.
- **Proposed solution:**
  - Persist ONLY non-security reference data across tabs: the environment variables, project states and countries, keyed by environment id, with their present `staleTime`. TanStack `persistQueryClient` with a `localStorage` persister and a whitelist of keys.
  - Never persist roles or user flags (D119 §4(d) already refused that without a product decision).
  - The tab still revalidates in the background.
- **Behaviour change?** Needs a product decision: freshness across tabs, and storage of tenant configuration in the browser.
- **Risk:** M. Stale admin changes (a new state) are visible later; the storage can be blocked (it must work without it); per-user isolation through the key.
- **Dependencies:** D119 §4(d); `consoleGate` (it learns `vsb_EnvironmentName` from the env-var read, `project.ts:105`). A persisted value would have to apply the gate too.
- **Validation:** the `[VSB] ACTION Load` count in the new tab, with and without the persisted entries; tests for blocked storage.
- **Priority:** P2. **Confidence:** High on the cost. The benefit depends on usage.

### WE-01 - Deterministic failures are classified as retryable: a `fetchAll` cap failure is re-walked twice more

**Priority P2, confidence High.** Source scope: Admin screens and the shared write engine.

- **Area:** reliability, network · **Engine**
- **File:line:** `platform/errors.ts:118-123`, `data/client.ts:89-91`, `app/Providers.tsx:23`
- **Function:** `isRetryable`, `fetchAll`
- **Problem:** `isRetryable` treats any `DataError` without a status as "network-shaped". D157's cap failure is such a `DataError`, so React Query retries the whole walk twice. Other status-less `DataError`s are deterministic too: `DevCoTableUnavailableError` (Contracts opts out of the global rule, `admin-contract/hooks.ts:25-28`), the "no primary key" refusal and a `guid()` failure.
- **Evidence:** `errors.ts:121`: `if (error.status === undefined) return true; // network-shaped`; `client.ts:90`: `throw new DataError(operation, \`more than ${rows.length} rows match, so the read was stopped after ${pages} pages and is incomplete\`);`
- **Impact:** a too-broad read sends 50 pages, then 50 more after about 1 s and 50 more after about 2 s: 150 requests (≈ 75,000 rows transferred) before the error shows. Each attempt also prints a `[VSB] ERROR` trace.
- **Proposed solution:** mark deterministic data-layer errors as non-retryable: a subclass such as `IncompleteReadError`, or a `retryable: false` field on `DataError`. `isRetryable` returns false for them. Keep "no status" = retryable only for SDK/transport errors.
- **Behaviour change?** none (the same error shows, about 3 s sooner, with 2/3 fewer requests).
- **Risk:** Low.
- **Dependencies:** none.
- **Validation approach:** unit test `isRetryable(new IncompleteReadError(...)) === false`; `client.fetchAll.test.ts` UT-FETCHALL-00x extended with a query-client retry count.
- **Priority:** P2 · **Confidence:** High.

### AD-08 - Redundant existence GET right after a create (create-then-update pairs)

**Priority P3, confidence High.** Source scope: Admin screens and the shared write engine.

- **Area:** network · **Screen:** CAPEX Accounts, Check List Settings
- **File:line:** `data/adminCapexAccounts.ts:250-263`, `data/adminDefaultChecklists.ts:289-299`
- **Function:** `createCapexAccount`, `createTask`
- **Problem:** the second write of the canvas create-then-update pair (kept on purpose: D19, D18 sync flow) is a guarded update, so it first reads the row the POST created a few milliseconds earlier.
- **Evidence:** `adminCapexAccounts.ts:262`: `await updateExisting(id, STATE_INACTIVE, "set new CAPEX account inactive");` → `updateRecordIfExists`; `adminDefaultChecklists.ts:294`: `await repo.updateTask(id, statusPayload(args.form.isActive));` → `adminChecklistTables.ts:315` `updateRecordIfExists`.
- **Impact:** +1 request and +1 sequential wave per create (CAPEX create 6 → 5 requests; task create 4 → 3).
- **Proposed solution:** send the follow-up as a plain PATCH (keep the 404 → `RecordGoneError` mapping via `asRecordGone`); the row's existence was just confirmed by the POST response.
- **Behaviour change?** none. Residual: if another user deletes the new row within ms, the upsert would re-create it with only state columns. Same class as DEC-7; flag it to the owner.
- **Risk:** Low.
- **Dependencies:** DEC-7.
- **Validation approach:** unit test counts; existing UT for `TaskStatusNotSetError` / `inactiveError` unchanged.
- **Priority:** P3 · **Confidence:** High.

### AD-10 - Period-1 edit propagates to every later period even when nothing changed (deferred S6-07, recorded for completeness)

**Priority P3, confidence High.** Source scope: Admin screens and the shared write engine.

- **Area:** payload, network · **Screen:** Costs
- **File:line:** `data/adminCost.ts:833-845, 615-634`
- **Function:** `saveOpexPeriod`, `propagationFields`
- **Problem / Evidence:** `adminCost.ts:835-840`: `const later = after.filter((r) => r.id !== id && (r.period ?? 0) > 1); … await updateRowsEach("copy Period 1 values to later periods", …, later.map((r) => ({ [OPEX_PRIMARY_KEY]: r.id, ...fields })))`, i.e. 2k requests every time.
- **Impact:** up to 18 requests for a Period-1 edit that changed no contract-level field.
- **Proposed solution:** compare `propagationFields` of the saved Period 1 with each later row (needs those columns in `listContractRows`) and skip equal rows. **DEC-5 (canvas parity "copy always").**
- **Behaviour change?** needs product decision (DEC-5).
- **Risk:** Medium (a later period that differs in a hidden field would no longer be overwritten).
- **Dependencies:** DEC-5.
- **Validation approach:** differential test against the current function on generated contracts.
- **Priority:** P3 · **Confidence:** High.

### CA-15 - Comments panel Save is a chain of single awaits; the deletes could overlap

**Priority P3, confidence Medium.** Source scope: Cost A: CAPEX/DEVEX, Add Cost from Table, shared costing layer.

- **Area** network. **Screen** Comments panel. **File:line** `features/cost/capex-costs/CommentsPanel.tsx:516,540,557`. **Function** `commit`.
- **Problem** `D + R + P` sequential round trips for D deletions, R changed roots and P changed replies. Roots must stay ordered (new roots are created in `createdOn` order and `renumberThreads` numbers by `createdOn`), and replies need the real id of a new parent, so the creates are rightly sequential. The deletes touch disjoint rows.
- **Evidence** `CommentsPanel.tsx:516`: `for (const id of deletedIds) await writes.remove.mutateAsync(id);`
- **Impact** Small: only the deletes can overlap, saving about `ceil(D/4) - 1` waves.
- **Proposed solution** Run the deletes as one parallel phase (4 wide) first, then roots, then replies; keep the CA-18 rule (a refused delete stops the remaining writes).
- **Behaviour change?** none. **Risk** low. **Validation** the existing CA-18 tests. **Priority** P3. **Confidence** medium.

### CB-09 - Independent sequential awaits in the OPEX writes

**Priority P3, confidence High.** Source scope: Cost B: Contracts, OPEX, Land Lease, periods.

- **Area** network · **Screen** OPEX
- **File:line** `data/periodWrites.ts:481-492` (head save), `:749-775` (import), `:570-571` (delete of a child)
- **Function** `saveOpexPeriod`, `addOpexStandardContract`, `deleteOpexPeriod`
- **Problem**
  - On a head save, `childrenOfChain(savedId)` runs after the row PATCH, although the PATCH never changes any row's `vsb_parentcost`.
  - On an import, the existence check (OP-44) and the assumptions read (OP-45) are independent and run one after the other.
  - Deleting a child period still asks for its children, which is always an empty answer (the chain is a star; OPT-11 skipped this on save only).
- **Evidence** `const children = period.parentId || isNew ? [] : await childrenOfChain(savedId);` after the `update` (`:482-492`);
  `const existing = await fetchAll(...)` then `const assumptions = await loadAssumptions(...)` (`:749`, `:768`);
  `const children = await childrenOfChain(period.id);` (`:571`).
- **Impact** 1 wave per head save, 1 wave per import, and 1 request + 1 wave per child delete.
- **Proposed solution**
  - Start `childrenOfChain` beside the PATCH. Await both, and send the cascade only after the PATCH succeeded (the order stays: no
    cascade without the head).
  - `Promise.all` the existence check and the assumptions read, and keep the refusal first.
  - Skip the child query when `period.parentId` is set.
- **Behaviour change?** none for the first two. For the third: none in practice, but the code comment (`:562-564`) deliberately
  distrusts the in-memory `parentId`, so confirm with the owner.
- **Risk** Low · **Validation** `periodWrites` wave tests (`test/waveClient.ts`).
- **Priority** P3 · **Confidence** High

### CB-11 - A Contracts edit save reads the contract's links only after the contract PATCH

**Priority P3, confidence High.** Source scope: Cost B: Contracts, OPEX, Land Lease, periods.

- **Area** network · **Screen** Contracts
- **File:line** `features/cost/contracts/hooks.ts:259-276`; `data/contracts.ts:508-516, 593`
- **Function** `useSaveContract.mutationFn`, `replaceDevCoLinks`
- **Problem** For an existing contract, `listDevCoLinks([id])` does not depend on the PATCH, but it is awaited after both the
  existence GET and the PATCH.
- **Evidence** `const saved = await repo.saveContract(write);` then `await repo.replaceDevCoLinks(...)` → `const existing =
  args.isNewContract ? [] : await listDevCoLinks([args.contractId]);`.
- **Impact** An edit save is 4 waves, and could be 3 (code-derived), on every Development or Construction edit.
- **Proposed solution** Start the links read with the save, for example by passing a promise of it into `replaceDevCoLinks`.
  Creates and deletes keep their order (S6-13 stays deferred).
- **Behaviour change?** none (a read that is wasted if the contract is gone, which then fails with `RecordGoneError` anyway).
- **Risk** Low · **Validation** `hooks.save.test.tsx` wave order · **Priority** P3 · **Confidence** High

### PA-09 - Type add / delete / replace refetches the turbines twice (old key, then new key)

**Priority P3, confidence High.** Source scope: PM A: Generators, Production, Revenues, Finance.

- **Area**: caching / network · **Screen**: Generators · **File:line**: `features/pm/generators/reload.ts:45-51, 113, 120, 135`; `hooks.ts:209-225`; `data/usePlanWrite.ts:204-205`
- **Function**: `familyKeys`, `useProjectTurbines`
- **Problem**: the turbines key embeds the type ids. The reload invalidates the `turbines` prefix and `types` at the same time (`Promise.all`). The active query under the OLD key refetches (its result is discarded), then the new types change the key and the turbines are read again.
- **Evidence**: `queryKey: qk.generators(projectId ?? "", "turbines", ...sorted)` (`hooks.ts:216`); `Promise.all((job?.invalidate ?? opts.invalidate).map((queryKey) => qc.invalidateQueries(…)))` (`usePlanWrite.ts:204-205`).
- **Impact**: ⌈T/40⌉ wasted requests per add / delete / replace of a WTG type (usually 1).
- **Proposed solution**: for the kinds that change the type set, invalidate the turbines only after the types refetch has settled, or mark the old key stale only and rely on the key change.
- **Behaviour change?** none · **Risk**: L–M (if the type set comes back unchanged, a stale-only key must still be refetched; keep a fallback refetch) · **Validation**: `saveLatency.reload.test.tsx` style count · **Priority**: P3 · **Confidence**: high.

### PA-11 - The Generators warm-up sends 10–13 reads from every PM screen, whether or not Generators is visited

**Priority P3, confidence Medium.** Source scope: PM A: Generators, Production, Revenues, Finance.

- **Area**: caching / network · **Screens**: all PM screens · **File:line**: `app/generatorsWarmup.ts:40-55`; `app/routes.tsx:135`; `features/pm/generators/queries.ts:101-117`; `app/Providers.tsx:24`
- **Function**: `useGeneratorsWarmup`, `prefetchGenerators`
- **Problem**: once per project per page load, 1.5 s after Production, Revenues, Finance (any PM screen) opens, the Generators chunk and about 10 reads (plus supplier chunks and countries) start. They are cached at the app's 30 s `staleTime`, so a Generators visit more than 30 s later refetches them on mount anyway, still showing the cached copy at once. Within the default 5-minute `gcTime` the warm-up helps first paint; after it, nothing. The reads overlap the current screen's own Fabric and Dataverse reads (well under 52 in flight).
- **Evidence**: `import("@/features/pm/generators/queries").then((q) => q.prefetchGenerators(qc, projectId))` (`generatorsWarmup.ts:50-51`); "A person who … opened its General Data, Milestones, ... screen very often goes to Generators next" (`:6-8`, an assumption, not measured).
- **Impact**: ≈ 10–13 requests per project per page load when Generators is not visited. Requires usage data.
- **Proposed solution**: measure the hit rate (`[VSB]` lines). If it is low, warm on intent (hover/focus of the Generators nav entry) or only the Generators chunk.
- **Behaviour change?** none · **Risk**: L · **Priority**: P3 · **Confidence**: medium (requires profiling).

### PA-15 - A selected type's O&M guard is 2 sequential reads per selection

**Priority P3, confidence High.** Source scope: PM A: Generators, Production, Revenues, Finance.

- **Area**: network (read triggered by state) · **Screen**: Generators · **File:line**: `features/pm/generators/hooks.ts:288-299`; `data/generators.ts:710-716, 686-700`
- **Problem**: every newly selected WTG/PV type sends a device-type read, then an active O&M read. Delete / Deactivate wait for it (F1). A user walking down the list pays 2 round trips per row.
- **Proposed solution**: one read of the device types of ALL project types (`lookupIn`, chunked), then one O&M check for all active bridges, cached per project and invalidated by the existing `opexDependency` family.
- **Behaviour change?** none (same guard per type) · **Risk**: L · **Priority**: P3 · **Confidence**: high.

---

### PB-07 - The current-user chain can lose a wave: filter roles and teams by the Entra id, not by the user row's id

**Priority P3, confidence Medium.** Source scope: PM B: boot, Project Overview, PM screens, Cluster Checklist.

- **Area:** network. **Screen:** boot (header badge, admin rail, General Data country scope, comment author gate).
- **File:line:** `data/currentUser.ts:208-224, 247-263`.
- **Function:** `loadCurrentUser`, `loadBadgeScope`.
- **Problem:** the direct-roles and teams reads wait for `systemuserid` from the user row. A lambda can test any column of the related `systemuser`, so they can filter on `azureactivedirectoryobjectid`, which the session already holds. They could then start with the user row, which makes the chain 2 waves instead of 3.
- **Evidence:** `filter: badgeRolesFilter(`systemuserroles_association/any(o:o/systemuserid eq ${id})`),` (`:252`) and `filter: `teammembership_association/any(o:o/systemuserid eq ${id})`,` (`:261`). Both wait for `const users = await userRead;` (`:208`).
- **Impact:** 1 wave off the badge and the admin rail (they are not on the first-paint path: `App.tsx:38-43`), and off General Data's `editableCountries` (`general-data/Screen.tsx:461-469`).
- **Proposed solution:** `systemuserroles_association/any(o:o/azureactivedirectoryobjectid eq <entraId>)`, and the same for teams, started at t0 under `parallelUserLookups`.
- **Behaviour change?** None.
- **Risk:** L. It needs a live check that the lambda over that column is accepted (it is an ordinary `systemuser` attribute).
- **Dependencies:** `startupFlags.parallelUserLookups`; UT-CU-100..106.
- **Validation:** UT-CU depth test (2 waves); a DEV `[VSB]` line check.
- **Priority:** P3. **Confidence:** Medium (the server acceptance is unverified).

### PB-08 - The environment variables take two sequential reads; the console gate and click-time flows wait for them

**Priority P3, confidence Medium.** Source scope: PM B: boot, Project Overview, PM screens, Cluster Checklist.

- **Area:** network. **Screen:** boot.
- **File:line:** `data/project.ts:62-107`; `checklist/rules.ts:3156-3160` (the C7 refusal); D119 §4 ("Env vars read at click time").
- **Problem:** the values are filtered by definition ids, so they wait for the definitions. The values query could instead filter on the related definition (`EnvironmentVariableDefinitionId/schemaname eq …`, a single-valued navigation filter, not `$expand`). Both reads would then run in one wave; the definitions are still needed for their `defaultvalue`.
- **Evidence:** `const values = await fetchAll(` … `` `_environmentvariabledefinitionid_value eq ${guid(id)}` `` (`project.ts:85-92`), after `const definitions = await fetchAll(` (`:63`).
- **Impact:** 1 wave earlier for App Insights, for the held `[VSB]` console lines (D164), and for `vsb_ProjectManagementAppID` (the Check List cancellation and the Generators flows refuse when it is blank).
- **Proposed solution:** run both reads in parallel, with the values filtered through the navigation property; join them in the client as now.
- **Behaviour change?** None.
- **Risk:** L. The navigation-property filter on this system table needs a live check.
- **Dependencies:** D164 `applyEnvironmentName`.
- **Validation:** unit test (two parallel calls, the same `EnvVars`); DEV check.
- **Priority:** P3. **Confidence:** Medium.

### PB-09 - The Generators warm-up runs 10 speculative reads on every PM screen, and most of them go stale before they are used

**Priority P3, confidence High.** Source scope: PM B: boot, Project Overview, PM screens, Cluster Checklist.

- **Area:** network, caching. **Screen:** every PM screen except Generators.
- **File:line:** `app/generatorsWarmup.ts:40-55`; `app/routes.tsx:135`; `features/pm/generators/queries.ts:44-90, 101-116`.
- **Problem:** 1.5 s after any PM screen opens, 10 Generators reads start (11 with `readsByProject`), once per project per page load. Nine of them keep the 30 s default `staleTime` (only `pvModuleCatalog` has 30 min, `:68`). A person who reaches Generators more than 30 s later is shown the warm data, and the screen then re-reads all nine: the warm-up was paid twice. D141 assumes Generators is usually next; no hit-rate figure exists.
- **Evidence:** `const timer = setTimeout(() => {` … `q.prefetchGenerators(qc, projectId)` (`generatorsWarmup.ts:46-51`); `export const generatorTypesQueryOptions = (projectId: string) => queryOptions({ queryKey: …, queryFn: … });` (no `staleTime`, `queries.ts:49-52`).
- **Impact:** up to 10 extra reads per project visit. On the Check List they overlap waves 2-4 of the visit. Dataverse allows 52 concurrent requests per user, so there is no throttling risk, but it is load.
- **Proposed solution:** measure the hit rate first (the `logAction` line at `queries.ts:103` against the next Generators `Load` lines). Then either warm on intent (hover or focus of the Generators rail item), or skip the warm-up on the screens with the heaviest own load (Check List).
- **Behaviour change?** None (timing only).
- **Risk:** L. **Dependencies:** D141, `GENERATORS_PERF.prefetch` (Generators auditor).
- **Validation:** `[VSB]` line counts on DEV across a typical navigation path.
- **Priority:** P3. **Confidence:** High (code). The benefit cannot be measured from the code.

### PB-13 - Check List: the trackings are read twice on every cluster visit

**Priority P3, confidence High.** Source scope: PM B: boot, Project Overview, PM screens, Cluster Checklist.

- **Area:** network. **Screen:** Cluster Check List.
- **File:line:** `checklist/hooks.ts:183-187` (query), `:414-416` (`prepareCluster`); `checklist/Screen.tsx:706-708` (`sequenceReady` waits for that query to settle).
- **Problem:** `prepareCluster` starts only once the trackings query has *just* settled (`coreSettled`), and then reads the same list again, "from a fresh read" (`hooks.ts:14`). The two reads are milliseconds apart.
- **Evidence:** `const [trackings, count] = await Promise.all([listChecklistTrackings(id), countClusterChecklistRows(id, selected.id)]);` (`:414-416`).
- **Impact:** 1 request per cluster visit (and per cluster switch).
- **Proposed solution:** reuse the query's data when `dataUpdatedAt` is within a short window (for example 2 s), else read fresh. Keep the fresh read inside every *write* job's plan (C6).
- **Behaviour change?** Timing and freshness only, but it touches a documented "fresh read first" rule: the owner should confirm.
- **Risk:** L. **Dependencies:** D127 C5/C6, D150.
- **Validation:** `hooks.perf` tests (the request count on a usual visit).
- **Priority:** P3. **Confidence:** High.

