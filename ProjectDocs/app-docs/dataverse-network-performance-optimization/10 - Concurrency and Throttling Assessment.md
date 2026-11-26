# 10 - Concurrency and Throttling Assessment

> Stage 1 audit, 25 Nov 2026. Branch `feature/dataverse-network-performance-optimization`, from `origin/RounakDev1` at `30afece`. Investigation only: no application source file was changed. Every request count is **code-derived**, not measured. 

Pool widths, gates, global ceiling versus the 52-concurrent-per-user limit, burst volume.

**11 findings name this area** (a finding naming several areas appears in each; its primary area is listed first in its block).

| ID | Pri | Conf | Title |
|---|---|---|---|
| AD-01 | P0 | High | CAPEX clean-up: thousands of un-retried per-row writes, fail-fast, no resume path |
| AD-03 | P1 | High | `hasContracts` fan-out: one uncapped query per visible subaccount, refetched on focus, retried without Retry-After |
| OR-01 | P1 | High | `Retry-After` can never be read: the SDK error has no headers, so every Retry-After branch is dead code and a 503 is never retried |
| WE-02 | P1 | High | No retry of any single-row create/update/delete on 429 / 503+Retry-After (engine and admin loops) |
| CA-06 | P2 | High | After an Add Cost Save the app refetches the Summary totals of the whole project (not displayed) and the category book, twice, in a burst beside the deferred deletes |
| PA-07 | P2 | High | Production one-shot generation: creates go out 8 wide, allocations one POST each |
| PB-11 | P2 | High | General Data edit save: tracking rebuild and shareholder writes go one at a time, while the create path sends them together |
| WE-03 | P2 | High | Per-pool limits only: concurrent pools and plans add up with no global write ceiling |
| CA-17 | P3 | High | Verify reads are ungated and can pass the 52-per-user limit beside gated writes (re-raise of the D75 review-low item) |
| CB-07 | P3 | High | Land Lease tiering still serialises independent period writes (followers, period deletes, import periods) |
| PB-12 | P3 | High | Milestones FID re-pricing: generator-type updates and price-ladder reads run in sequence |

## Findings

### AD-01 - CAPEX clean-up: thousands of un-retried per-row writes, fail-fast, no resume path

**Priority P0, confidence High.** Source scope: Admin screens and the shared write engine.

> VERIFIED by orchestrator: `adminCapexAccounts.ts` runs the clean-up through `forEachLimit` (first failure stops it), deletes through `deleteRecord` without `withDeleteRetry`; `zeroCostsFilter` selects only rows not yet zero, so a rerun is safe.

- **Area:** reliability, bulk, concurrency · **Screen:** CAPEX Accounts
- **File:line:** `data/adminCapexAccounts.ts:381-428`, `features/admin/admin-capex-accounts/Screen.tsx:216-227`, `data/adminRowWrites.ts:67-83`, `data/client.ts:133-140`
- **Function:** `cleanUpForecastCosts`, `cleanUpInBackground`
- **Problem:** The clean-up issues 2 requests per zeroed row and 1 per deleted row, 24 in flight, with **no retry of any kind** (neither 429/Retry-After nor transient 5xx). `mapLimit` is fail-fast, so one throttled or transient failure stops the remaining rows. The result is only a toast; there is no "retry clean-up" action, and the status step has already landed, so the user can rerun it only by Activate then Deactivate again.
- **Evidence:**
  - `adminCapexAccounts.ts:409-412`: `updateRowsEach("zero future CAPEX cost", COSTS_TABLE, COST_KEY, toZero.map(...)), countedForEach(toDelete, (id) => deleteRecord("delete future CAPEX cost", COSTS_TABLE, id), DELETE_CONCURRENCY, …`
  - `adminCapexAccounts.ts:375-378`: "In flight at the peak: `WRITE_CONCURRENCY` (8) guarded PATCHes plus `DELETE_CONCURRENCY` (16) deletes, 24 requests"
  - `concurrency.ts:71`: `if (!failed) { failed = true; failure = error; }` (no new task starts after it).
  - `Screen.tsx:218-221`: `void cleanUpForecastCosts(accountIds, year, month).then((result) => notify.success(...), (error: unknown) => notify.error(describeWriteError(error, CLEANUP.action)))`
- **Impact:** at the volumes in §B (2Z + D requests, D in the thousands to tens of thousands), Dataverse's service-protection limits (Microsoft-documented: 6,000 requests per user per 5-minute window per web server, 52 concurrent) are within reach of one clean-up. A 429 then leaves forecast costs half-cleaned (some months zeroed, some later years still present). Totals on project screens stay wrong until someone notices the toast. The run is idempotent and resumable (the zero filter skips rows already at 0, `:335-337`; the delete filter re-reads what is left), but nothing in the app resumes it.
- **Proposed solution:** (1) wrap each clean-up delete in the existing `withDeleteRetry` (`retry.ts:142`; a DELETE is idempotent) and treat 404 as done (`unwrapDelete`, see AD-05); (2) retry the zero G+P pair on 429 / 503-with-Retry-After, honouring Retry-After (the PATCH `vsb_cost = 0` is idempotent); (3) give both pools one shared gate (`createGate`) so a second clean-up cannot double the in-flight count (WE-03); (4) *needs product decision:* a "Retry clean-up" action on the error toast, which calls `cleanUpForecastCosts` again for the same ids. For the request count itself see AD-02.
- **Behaviour change?** (1)–(3): none on the success path; failure path recovers instead of stopping. (4): needs product decision (new UI).
- **Risk:** Low for (1)–(3); a retried PATCH after an ambiguous 5xx is safe because the value is constant.
- **Dependencies:** WE-02 (retry helper for writes), WE-03 (global gate), AD-05.
- **Validation approach:** unit test with a mocked client that answers 429 + Retry-After on row k: assert the row is retried after the wait and the run completes; DEV run on a test account with known C/Z/D, counting `[VSB] DATA` lines and checking no row is left with `vsb_year > year` (and `vsb_costpaid` not true).
- **Priority:** P0 (data integrity at scale) · **Confidence:** High for the code path; Medium for the probability of 429 (no measured volume).

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

### OR-01 - `Retry-After` can never be read: the SDK error has no headers, so every Retry-After branch is dead code and a 503 is never retried

**Priority P1, confidence High.** Source scope: Orchestrator (found while verifying the audits).

- **Area:** reliability, concurrency · **Screen:** all (shared retry layer)
- **File:line:** `data/retry.ts:22-58` (`statusOf`, `headerOf`, `retryAfterMs`), `:74-80` (`retryDelay`), `:120-134` (`deleteRetryDelay`); SDK `node_modules/@microsoft/power-apps/dist/internal/data/core/error/types.d.ts:20-25`; `src/app/Providers.tsx:23`
- **Function:** `retryAfterMs`, `retryDelay`, `deleteRetryDelay`, the query client `retry` option
- **Problem:** `retry.ts` reads `Retry-After` from `error.headers`, `error.response.headers` or `error.retryAfter`. The SDK's HTTP error type is `PowerDataRuntimeHttpError { message; status?; requestId?; stack? }`: it carries **no headers**. Nothing in the app sets `headers` or `retryAfter` on an error (a search of non-test `src/` finds only comments and `retry.ts` itself). So `retryAfterMs` always returns `undefined` for a real SDK error.
- **Evidence:**
  - `types.d.ts:20-25`: `export interface PowerDataRuntimeHttpError { message: string; status?: number; requestId?: string; stack?: string; }`.
  - `retry.ts:77-78`: `const header = retryAfterMs(error, now); if (status !== 429 && !(status === 503 && header !== undefined)) return undefined;` so a **503 is never retried** by `retryDelay` (bulk writes), and a 429 waits `Math.min(header ?? 1000 * attempt, …)` = 1 s, then 2 s, at most 3 tries in all.
  - `retry.ts:130-131`: the delete policy's `status === 503 && header !== undefined` branch is likewise unreachable; its other branches (429, 500, 504, no status) work.
  - `Providers.tsx:23`: read retry is `attempt < 2 && isRetryable(error)` with TanStack's default exponential delay; no `Retry-After` there either. No `AbortController` or timeout exists in the SDK data path (a search of the SDK `dist/` JavaScript finds none).
- **Impact:** the comments and decisions that say "honours Retry-After" (`concurrency.ts:13`, `executePlan.ts:82`, `generatorsBulk.ts:4`, D115, D116) describe behaviour that cannot happen with this SDK. A throttled bulk write waits 1 s and 2 s (total 3 s) where Dataverse may ask for more; a 503 that the platform marked "not processed, retry" is surfaced as a failed save. Any new retry code that depends on the header (finding CA-01, WE-02, AD-01 proposals) would be dead on arrival.
- **Proposed solution:** (1) design every retry as **status-based with exponential backoff and full jitter**, treating `Retry-After` as optional (keep the header reader so a later SDK or host that exposes it works); (2) tune the 429 schedule and cap from the Stage 3 wave 0 capture, not from guesses; (3) for a 503 without a header, retry reads and idempotent writes (DELETE, PATCH with absolute values), never a create or a non-idempotent bulk call; (4) pass a `retryDelay` to the query client so read retries jitter instead of marching in step; (5) state the fact in `retry.ts`'s header so the next reader does not rely on the header.
- **Behaviour change?** none on the success path; failure paths retry where they now fail.
- **Risk:** low. The risk to manage is retry storms: backoff with jitter, a retry budget per save and the shared gate (WE-03) keep the added traffic bounded.
- **Dependencies:** WE-03 (global gate), CA-02 / WE-05 (deadline), the idempotency rules in doc 19.
- **Validation approach:** unit tests with SDK-shaped errors (`{ message, status: 429 }`, no headers) asserting the schedule, the jitter bounds and that creates are not retried; DEV run with a forced 429 (a deliberately large parallel read) counting `[VSB]` lines.
- **Priority:** P1 · **Confidence:** High (SDK type file read; app search done).

### WE-02 - No retry of any single-row create/update/delete on 429 / 503+Retry-After (engine and admin loops)

**Priority P1, confidence High.** Source scope: Admin screens and the shared write engine.

- **Area:** reliability, concurrency · **Engine** (and every admin multi-row loop)
- **File:line:** `data/executePlan.ts:317-380`, `data/client.ts:133-140, 416-453`, `data/adminRowWrites.ts:67-104`
- **Function:** `sendWrite`, `deleteRecord`, `updateRecordIfExists`, `eachRow`
- **Problem:** only hardened deletes (opt-in, no admin caller) and the bulk backend retry. Single-row creates, updates and plain deletes fail on the first 429, and the guard GET of a guarded update fails on its first 429 too. The existing pools are fail-fast, so a throttled row stops the loop.
- **Evidence:** `executePlan.ts:351-356`: `unwrap(await client.updateRecordAsync(...), label);` (no wrapper); `retry.ts:142-163` `withDeleteRetry` is used only at `executePlan.ts:364`.
- **Impact:** for single admin saves, negligible. For the multi-row admin loops (AD-01, CAPEX reorder, Milestones save, Check List renumber, OPEX propagation), a throttled row turns into a partial save the user must repair.
- **Proposed solution:** a `withThrottleRetry` for writes that retries **only** 429 and 503-with-Retry-After, honouring the header and capped at `MAX_RETRY_WAIT_MS`. Those two answers mean "not processed", so a retry cannot duplicate a create. Never retry 500/504/network for creates (ambiguous, see WE-04). Updates and deletes may also retry 500/504 (idempotent for constant payloads). Apply it inside `updateRecordIfExists` (both requests) and `deleteRecord`.
- **Behaviour change?** none on success paths.
- **Risk:** Low. A retry wait must not hold a gate slot for long (see WE-05).
- **Dependencies:** WE-05.
- **Validation approach:** unit tests per method with a 429 + Retry-After then success; assert one retry and the wait honoured.
- **Priority:** P1 · **Confidence:** High.

### CA-06 - After an Add Cost Save the app refetches the Summary totals of the whole project (not displayed) and the category book, twice, in a burst beside the deferred deletes

**Priority P2, confidence High.** Source scope: Cost A: CAPEX/DEVEX, Add Cost from Table, shared costing layer.

- **Area** concurrency / network. **Screen** Add Cost from Table -> CAPEX. **File:line** `features/cost/costing/useCostBook.ts:622-625` (`invalidateQueries ... refetchType: "all"`), `followBackgroundDeletes` (runs `invalidate()` again), `features/cost/add-costs-from-table/Screen.tsx:232` (`back()` returns to `?category=N`), `data/costBook.ts:1200-1222`. **Function** `useSaveAddCostSheet.invalidate`.
- **Problem** `["capex-totals", project]` is invalidated with `refetchType: "all"`. If the Summary tab was opened earlier in the session (query alive in the cache, default gcTime 5 min), the Save re-reads every contract and every cost row of the project (`loadCapexTotals`: `ceil(C_all/40)` reads at 5,000 rows per page) although the user lands on a category tab, not the Summary. The same happens again when the deferred deletes settle.
- **Evidence** `useCostBook.ts:625`: `client.invalidateQueries({ queryKey: ["capex-totals", projectId], refetchType: "all" }),`; `Screen.tsx:232`: `const back = () => navigate({ pathname: "/costs/capex", search: ...category=${category} });`; `useCapexTotals(isSummaryTab(category))` mounts only on the Summary tab.
- **Impact** Per Save, up to `1 + ceil(C_all/40)` (+ pages) wasted reads, twice, plus the book confirm `2 + ceil(A/40) + ceil(C/40)` twice, started while 8 delete requests (4+4) are in flight. For `C_all` above about 1,900 the totals fan-out alone exceeds Dataverse's 52 concurrent requests per user (`ceil(C_all/40) > 47`).
- **Proposed solution** Totals: `refetchType: "none"` (mark stale) so the next visit to the Summary reads once; keep `"all"` for the category book only. Or patch the totals cache from `applied`. Collapse the second invalidation into one only if nothing deferred changes sums (a deferred cost delete does).
- **Behaviour change?** none for data; the Summary would show cached numbers until its mount refetch completes unless patched (needs a UX look). **Risk** low-medium. **Dependencies** `pendingDeletes` snapshot already hides pending rows from totals. **Validation** unit test on invalidation args (as UT-ACSHEET-QUERY-003..008); on DEV count `[VSB]` lines after a save when the Summary was visited earlier. **Priority** P2. **Confidence** high on the facts, medium on the gain.

### PA-07 - Production one-shot generation: creates go out 8 wide, allocations one POST each

**Priority P2, confidence High.** Source scope: PM A: Generators, Production, Revenues, Finance.

- **Area**: bulk / concurrency · **Screen**: Production · **File:line**: `features/pm/production/rules.ts:1654-1675, 1734-1743, 1849`; `data/executePlan.ts:570`
- **Function**: `groupIntoWaves`, `planStandardContracts`
- **Problem**: `together(run, { stopOnFailure: true })` has no limit, so the default `WRITE_CONCURRENCY` 8 applies (the Save group was widened to 16 in D145, the generation was not). The AllWTG allocations are (LL contracts with AllWTG) × (all turbines and PV units) single POSTs on `vsb_landleaseallocationwtgs`, a table the Generators bulk backend already lists with `creates: true` (`generatorsBulk.ts:67-68`).
- **Evidence**: `else if (run.length > 1) out.push(...together(run, { stopOnFailure: true }));` (`rules.ts:1661`); `for (const g of input.generators) { create(ES.landLeaseAllocationWtgs, { … }) }` (`:1736-1742`).
- **Impact**: 80 allocations take 10 waves at 8, 5 at 16, about 1 with CreateMultiple (4–8 parallel chunks). It happens once per project, but it is the longest PM save.
- **Proposed solution**: (1) pass `limit: WIDE_GROUP_CONCURRENCY` behind a new default-off rollout switch, the same trade as D145. (2) Behind a second default-off switch, emit the allocation runs as one `createMany` (pre-generated ids, cost bind through `createdRowRef`, OBU present) after a DEV probe. No plugin or flow fires on these tables (`production/hooks.ts:15-24`); the flags PATCH stays last as the barrier.
- **Behaviour change?** (1) none beyond the accepted group trade; (2) needs product decision (whole-chunk landing).
- **Risk**: M · **Dependencies**: PA-01 DEV results for the allocation table · **Validation**: `productionPlans.baseline.test.ts`-style golden master (same rows); DEV run on an empty project · **Priority**: P2 · **Confidence**: high.

### PB-11 - General Data edit save: tracking rebuild and shareholder writes go one at a time, while the create path sends them together

**Priority P2, confidence High.** Source scope: PM B: boot, Project Overview, PM screens, Cluster Checklist.

- **Area:** concurrency, bulk. **Screen:** General Data.
- **File:line:** `general-data/rules.ts:2113-2181` (edit tail) against `:2082-2096` (create follow-ups).
- **Function:** `planClusterAndEntities`, `planSaveFollowUps`.
- **Problem:**
  - On an edit with a start-cluster change, the tail is 1 project PATCH + one upsert per checklist cluster (Draft + Cluster 1-6, `plannedTrackingRows` `:1841-1864`), and M shareholder upserts. All of them run strictly in sequence, because none is marked `concurrent`.
  - The create path already sends the same child rows together, with the comment "a new project's child rows … only point at the project".
  - On the edit path, the Draft-return project PATCH must stay first: the canvas order, before its trackings. The rows after it are independent of each other.
- **Evidence:** `const children = rest.writes.map((w) => (w.entitySet === ES.projects ? w : { ...w, concurrent: true }));` (`:2090`, create only). The edit path returns `planClusterAndEntities(ctx)` unchanged (`:2042-2044`).
- **Impact:** code-derived, about 7 + M sequential round trips become 1 + 1 wave on a start-cluster change; M become 1 on a shareholder change.
- **Proposed solution:** keep the project PATCH first, and mark the tracking and shareholder writes `concurrent` (default 8 wide), as on the create path.
- **Behaviour change?** Needs a product decision, or a DEV check first. Each tracking upsert fires `SynchroniseProjectState` (`vsb_approvalclusterstate` Added/Modified; it acts only when the value is In Progress, so for the Draft row). In parallel, the flow runs may fire in another order; the create path already accepted that.
- **Risk:** M (server automation order; a partial failure then reports a group, not a prefix).
- **Dependencies:** `04-flow-inventory.md` (`SynchroniseProjectState`); the executePlan concurrent-group semantics (engine auditor).
- **Validation:** a plan test (same rows and payloads, the grouping only); DEV: a start-cluster change, then compare the trackings and the project cluster state.
- **Priority:** P2. **Confidence:** High (code).

### WE-03 - Per-pool limits only: concurrent pools and plans add up with no global write ceiling

**Priority P2, confidence High.** Source scope: Admin screens and the shared write engine.

- **Area:** concurrency · **Engine** / CAPEX Accounts
- **File:line:** `data/writePlan.ts:88-94`, `data/concurrency.ts:151-155`, `data/adminCapexAccounts.ts:409-417`, `Screen.tsx:216-227`
- **Function:** `together`, `createGate`, `cleanUpForecastCosts`
- **Problem:** each pool or group has its own gate, and the docs say "a caller must never run two groups at the same time", but nothing enforces it across independent calls. The CAPEX clean-up runs 8 + 16 side by side by design and in the background. A second deactivation (or any other write) during it adds its own pools. Two background clean-ups give 48 writes in flight, plus 8 reads, plus the screen's refetches.
- **Evidence:** `writePlan.ts:91-93`: "the limit is a per-group ceiling, not a shared one: a caller must never run two groups at the same time."; `concurrency.ts:152-154`: "a caller must not run two groups at the same time, or the in-flight total would be their sum".
- **Impact:** a peak above the 52-concurrent-per-user ceiling is possible from one tab, which leads to 429 with no write retry (WE-02).
- **Proposed solution:** one module-level write gate (e.g. 24) that `mapLimit`-based admin loops and `executePlan` runs acquire in addition to their own limit. Or, at minimum, serialise background clean-ups through one `createSerialRunner` key.
- **Behaviour change?** none (ordering inside each pool unchanged).
- **Risk:** Low–Medium (a nested acquire on the same gate could deadlock; acquire only at the leaf request).
- **Dependencies:** AD-01.
- **Validation approach:** unit test that runs two clean-ups at once with a counting mock: peak ≤ ceiling.
- **Priority:** P2 · **Confidence:** High.

### CA-17 - Verify reads are ungated and can pass the 52-per-user limit beside gated writes (re-raise of the D75 review-low item)

**Priority P3, confidence High.** Source scope: Cost A: CAPEX/DEVEX, Add Cost from Table, shared costing layer.

- **Area** concurrency. **Screen** Add Cost Save (retry path, 501 path). **File:line** `data/bulkSend.ts:194-202` (`existingIds`), `data/addCostSheetBulk.ts:896-910` (`verifyPlan`, both tables at once), `data/addCostSheet.ts:191-203` (`refreshSnapshot`). **Function** `existingIds`.
- **Problem** `existingIds` does `Promise.all(chunk(ids).map(...))` with no gate, and `verifyPlan` runs it for contracts and costs simultaneously. On a retry of a 3,500-row sheet the cost verify alone is `ceil(3500/40) = 88` concurrent reads, above 52. The tuning comment itself lists a 57-in-flight case (`bulkSend.ts`, comment above `TUNED_BULK_TUNING`). The failure mode is a 429 on a verify read, which is not retried (CA-01), so the retry itself fails.
- **Evidence** `bulkSend.ts:195`: `const batches = await Promise.all(chunk(ids).map((batch) => idRows(table, batch)));`
- **Impact** Only on retries and on tabs with a 501 flag, but exactly when the user is already recovering from a failure.
- **Proposed solution** Route the id reads through `mapLimit(chunk(ids), ..., 8)` (results kept in input order), together with CA-01, or raise the chunk (CA-04).
- **Behaviour change?** none. **Risk** low. **Validation** `bulkSend` tests with a peak-in-flight counter. **Priority** P3. **Confidence** high.

### CB-07 - Land Lease tiering still serialises independent period writes (followers, period deletes, import periods)

**Priority P3, confidence High.** Source scope: Cost B: Contracts, OPEX, Land Lease, periods.

- **Area** concurrency · **Screen** Land Lease
- **File:line** `features/cost/periods/landLeaseRules.ts:2699-2729` (`leaseWriteTiers`), `:2974-2979`, `:3033-3034`, `:3529-3552`
- **Function** `leaseWriteTiers`
- **Problem** Only allocation rows may share a tier (`w.entitySet !== LEASE_ENTITY_SET.allocation` opens a new tier, `:2707`). So
  three groups of writes, each with pre-computed payloads and no dependency on its siblings, each cost one wave per row:
  - D118 follower start-date updates (written after the saved period);
  - the period deletes of a contract delete;
  - the period creates of an import (each depends only on the header's ref).
- **Evidence** D160 §6: "3 periods one by one"; "periods 3".
- **Impact** P waves where 1 would do. Periods are few (an option set of Period 1…10), so the gain is 1–9 waves per operation.
- **Proposed solution** Allow a same-op tier on the period entity set:
  - for update rows whose payload is only `vsb_startdate` (followers), after the saved-period tier;
  - for period deletes (moot if CB-04 is taken);
  - for period creates whose `parentRef` is already resolved.

  The D160 §12 correction (no follower beside the saved-period update) is kept.
- **Behaviour change?** needs product decision: on a failure, sibling periods already in flight may land, as the D160 allocation
  divergence allows today. For the import, the `createdon` order of periods changes (the same question as `OPEX_IMPORT_PARALLEL`).
- **Risk** Low–medium · **Dependencies** D160 owner decision 1 (created-on order) · **Validation** the `leaseWriteTiers` unit tests
  plus the sequential oracle.
- **Priority** P3 · **Confidence** High

### PB-12 - Milestones FID re-pricing: generator-type updates and price-ladder reads run in sequence

**Priority P3, confidence High.** Source scope: PM B: boot, Project Overview, PM screens, Cluster Checklist.

- **Area:** concurrency. **Screen:** Milestones.
- **File:line:** `milestones/rules.ts:1415-1427`; `data/milestones.ts:254-267`.
- **Problem:** N `vsb_generatortypeinprojects` PATCHes go one after another, then the plant-cost PATCH. The price ladders are read with a `for … await` over 40-id chunks.
- **Evidence:** `...ctx.repricedGenerators.map((g): PlannedWrite => ({ op: "update", …` (no `concurrent`, `:1415-1422`); `for (const ids of chunk(generatorIds)) { const rows = await fetchAll(` (`milestones.ts:254-255`).
- **Impact:** N-1 round trips on a save that moved the FID. N is usually small (1-5 types).
- **Proposed solution:** mark the generator-type updates `concurrent`, with the plant-cost PATCH kept after them (it does not read their results: the sum is computed in the client, `plantWtgCost(ctx.repricedGenerators)`). Use `Promise.all` or `mapLimit` for the chunks.
- **Behaviour change?** None. No flow or plugin is listed on `vsb_generatortypeinproject` updates (`04-flow-inventory.md`).
- **Risk:** L. **Dependencies:** executePlan.
- **Validation:** a plan test; `milestones.reads` tests.
- **Priority:** P3. **Confidence:** High.

