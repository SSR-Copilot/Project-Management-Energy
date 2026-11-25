# 22 - Prioritized Implementation Backlog

> Stage 2 (design and planning only), 25 Nov 2026. No application source file has been changed. Branch `feature/dataverse-network-performance-optimization`.

**30 tasks** in 7 waves cover **83 of 83 findings**; 7 decisions (8 findings) are held back until you decide (section 3). Every finding appears exactly once (the matrix in section 4 is generated from the same table that was checked for gaps and duplicates).

Ordering rule (doc 23): integrity first, then the shared request core the later tasks depend on, then request-count work by size of the saving and safety, then bulk. Within a wave tasks are listed by the highest priority finding they close. "Expected improvement" is **code-derived** unless wave 0 has measured it; nothing here is a promised timing.

## 1. Summary

| Task | Wave | Title | Closes | Complexity | Risk | Needs your decision first |
|---|---|---|---|---|---|---|
| T-00 | 0 | Request census harness and DEV probes | - | M | L | no |
| T-01 | 1 | Guard unguarded upserts: Land Lease, OPEX periods, Check List back-fill | CB-01, PB-14 | M | M | no |
| T-02 | 1 | Refresh on every outcome; server-side duplicate check before Land Lease import | CB-02 | M | L-M | no |
| T-03 | 1 | One shared 'already gone' delete helper | CB-03, AD-05 | S | L | no |
| T-04 | 1 | CAPEX forecast clean-up that survives throttling and can be rerun | AD-01 | M | M | yes |
| T-05 | 1 | Register the bulk backend where the bulk tables are registered | PA-02 | S | L | no |
| T-06 | 1 | Hold the tab open while deferred deletes run | CA-03 | S | L | no |
| T-07 | 1 | Planning: create rows from an explicit step, not from a query function | PB-05 | M | M | yes |
| T-08 | 1 | Flow calls: unknown outcome is detected and shown, not guessed | PB-01 | M | M | yes |
| T-09 | 1 | Creates keep their ids across a retry | WE-04, CB-14, CA-07 | M | M | no |
| T-10 | 2 | Status-based retry policy with backoff and jitter (Retry-After optional) | OR-01, WE-01 | M | M | no |
| T-11 | 2 | Adopt the policy for single-row writes, bulk transport and verify reads | WE-02, CA-01 | L | M-H | no |
| T-12 | 2 | Request deadline and the 'unknown outcome' class | CA-02, WE-05 | M | M | no |
| T-13 | 2 | One global request ceiling, and gated verify reads | WE-03, CA-17 | M | M | no |
| T-14 | 2 | Cost reads may retry a transient failure | CA-11 | S | L | no |
| T-15 | 2 | Write-engine hardening: shape gaps and the permission message | WE-06, WE-07 | S | L | no |
| T-20 | 3 | Cost: refresh only what the write changed, and start independent reads together | CA-05, CA-06, CA-08, CA-09, CA-15, CA-16 | M | M | no |
| T-21 | 3 | Contracts, OPEX, Land Lease: remove duplicated reads and serial steps | CB-07, CB-08, CB-09, CB-11, CB-12, CB-13, CB-15 | M | M | no |
| T-22 | 3 | Generators, Production, Revenues, Finance: independent reads together, no double refetch, lighter warm-up | PA-05, PA-08, PA-09, PA-10, PA-11, PB-09, PA-15 | M | M | no |
| T-23 | 3 | Boot and PM screens: prefetch, one key per table, fewer waves | PB-03, PB-06, PB-07, PB-08, PB-10, PB-12, PB-13, PB-15, PB-16 | L | M | no |
| T-24 | 3 | Admin screens: bound the fan-out, narrower reloads, one read per table | AD-03, AD-06, AD-08, AD-09, AD-11, AD-12 | M | M | no |
| T-30 | 4 | Larger id lists per request (after probe P-1) | CA-04 | M | M | yes |
| T-31 | 4 | Single-valued navigation filters for child loads (after probe P-2) | CB-05 | M | M | no |
| T-32 | 4 | Send only what changed | PA-03, CA-12, AD-10 | M | M | yes |
| T-33 | 4 | Municipality search cannot be cut short silently | PB-02 | S | L | no |
| T-40 | 5 | Land Lease allocations and OPEX cascades as bulk updates | CB-06, CB-10 | L | M-H | no |
| T-41 | 5 | Generators bulk programme: staged enablement | PA-01, PA-13, PA-12 | L | H | yes |
| T-42 | 5 | Revenues, Production, General Data: write less, together | PA-06, PA-07, PB-11 | L | M-H | yes |
| T-43 | 5 | CAPEX panel delete and the admin clean-up in fewer requests | CA-14, AD-02 | M | M | yes |
| T-90 | 6 | Regression, reliability, benchmark and independent QA | - | L | L | no |

## 2. Task detail

### Wave 0 - Baseline, probes and diagnostics

#### T-00 - Request census harness and DEV probes

- **Related findings:** none (enabling / validation work); enables OR-01, CA-02, CA-04, CB-05, PA-01, AD-01
- **Highest priority closed:** -
- **Affected files** (from the findings' evidence; Stage 3 confirms before editing): `ProjectCosts-CodeApp/scripts/request-census.mjs (new)`, `ProjectDocs/app-docs/dataverse-network-performance-optimization/28 - Before and After Performance Benchmark.md`
- **Proposed implementation:** (1) A script that captures the `[VSB] DATA / HTTP / ACTION / ERROR` console lines of a scripted scenario to a file and summarises requests, waves, ms, 429/5xx per scenario (D160 recommended exactly this). (2) Five small read-only DEV probes: P-1 does the host accept `Microsoft.Dynamics.CRM.In(...)` in `$filter` and what URL length does it refuse; P-2 do single-valued navigation filters (`_vsb_x_value eq`, `vsb_x/vsb_y eq`) work on the cost and lease tables; P-3 does `UpdateMultiple` accept `statecode` and what does it return for a missing id; P-4 what does the host return on a deliberately throttled burst (status, any retry header in the SDK error); P-5 how long does a hung request live before the host answers.
- **Expected improvement:** No runtime change. Produces the measured baseline (doc 28) every later benchmark is compared against, and the facts that decide T-30, T-31, T-41, T-10.
- **Dependencies:** none
- **Complexity / risk:** M / L (read-only; P-4 deliberately provokes throttling on DEV, so it is run by the owner or with the owner present)
- **Testing:** Unit test of the log parser on recorded `[VSB]` lines (UT-CENSUS-*).
- **Acceptance criteria:** Baseline table for the 12 scenarios in doc 25 filled from captures; probe results recorded with the exact query shapes tried.
- **Rollback:** Script only; delete it.

### Wave 1 - Data integrity and correctness

#### T-01 - Guard unguarded upserts: Land Lease, OPEX periods, Check List back-fill

- **Related findings:** CB-01 (P0), PB-14 (P3)
- **Highest priority closed:** P0
- **Affected files** (from the findings' evidence; Stage 3 confirms before editing): `data/landLease.ts`, `data/periodWrites.ts`, `checklist/rules.ts`, `checklist/hooks.ts`
- **Proposed implementation:** Before a Land Lease or OPEX plan updates existing rows, read the ids of the rows it will touch (one `idIn`-chunked read per table per plan, `$select` the key only) and refuse the save with `RecordGoneError` and nothing written if a row is gone, as Contracts already does per row (`updateRecordIfExists`, D120 §3). Same for the Check List back-fill upserts.
- **Expected improvement:** Closes the orphan-row path (a PATCH creating a row with only the patched columns, no project, no business unit). Cost: 1-2 extra reads per save (code-derived), the price of the guard.
- **Dependencies:** T-00
- **Complexity / risk:** M / M (an extra read can itself fail; the existing plans must keep their wave order)
- **Testing:** Differential tests against the current plans (success path identical); a test per writer where the row is deleted between load and save: nothing written, `RecordGoneError`; UT-CB01-*.
- **Acceptance criteria:** No plan sends a PATCH for an id that the guard read did not return; success-path request order unchanged except the added read; console shows the guard read.
- **Rollback:** One switch per module (`LEASE_GUARD`, `OPEX_GUARD`, `CHECKLIST_BACKFILL_GUARD`), default on; revert the commit.

#### T-02 - Refresh on every outcome; server-side duplicate check before Land Lease import

- **Related findings:** CB-02 (P0)
- **Highest priority closed:** P0
- **Affected files** (from the findings' evidence; Stage 3 confirms before editing): `features/cost/costing/useCostBook.ts`
- **Proposed implementation:** Cost period writes (Land Lease save, delete, import; OPEX save, import) invalidate or refresh their book in a `finally` (success, partial failure, unknown outcome), not only on success. The standard-contract import decides 'already imported' from a fresh server read, not the cached book.
- **Expected improvement:** Removes the duplicate standard contract after a partial failure. Adds one small read to an import (code-derived).
- **Dependencies:** T-00
- **Complexity / risk:** M / L-M (an extra reload after a failure; behaviour on success is unchanged)
- **Testing:** Tests that fail an import half-way, then click again and assert no second create (UT-CB02-*); the refresh-on-failure test for each of the five writers.
- **Acceptance criteria:** A failed-then-retried import creates no duplicate in the unit test and in a DEV forced-failure run.
- **Rollback:** Revert the commit; no data format change.

#### T-03 - One shared 'already gone' delete helper

- **Related findings:** CB-03 (P1), AD-05 (P2)
- **Highest priority closed:** P1
- **Affected files** (from the findings' evidence; Stage 3 confirms before editing): `data/landLease.ts`, `data/periodWrites.ts`, `data/contracts.ts`, `data/client.ts`, `adminCapexAccounts.ts`, `adminCost.ts`, `adminContract.ts`
- **Proposed implementation:** Move `isAlreadyGone` / `deleteIfExists` from `data/contracts.ts` into `data/client.ts` (next to `deleteRecord`), and use it in Land Lease, OPEX and the admin per-row deletes, so a 404 means the delete wanted outcome. Uses the existing `unwrapDelete` rule (404 or `0x80040217` only, D157).
- **Expected improvement:** A retry after a partial delete is no longer blocked by rows that already went; no extra requests.
- **Dependencies:** none
- **Complexity / risk:** S / L
- **Testing:** Move the existing Contracts tests with the helper; add a 404 case per adopting module (UT-GONE-*).
- **Acceptance criteria:** No module defines its own gone-check; grep gate in the unit suite.
- **Rollback:** Revert the commit.

#### T-04 - CAPEX forecast clean-up that survives throttling and can be rerun

- **Related findings:** AD-01 (P0)
- **Highest priority closed:** P0
- **Affected files** (from the findings' evidence; Stage 3 confirms before editing): `data/adminCapexAccounts.ts`, `features/admin/admin-capex-accounts/Screen.tsx`, `data/adminRowWrites.ts`, `data/client.ts`
- **Proposed implementation:** Deletes go through `withDeleteRetry`; the zero PATCH pairs retry on 429/5xx (the value is a constant, so a repeat is safe); the loop continues past a failed row and reports counts (landed, failed) instead of stopping at the first failure; the failure message says that a rerun is safe (`zeroCostsFilter` only selects rows not yet zero). Uses the new retry policy (T-10/T-11) once it lands; the first version can ship on `withDeleteRetry` alone.
- **Expected improvement:** A 429 or transient 5xx no longer leaves costs half-cleaned; failure reports how much landed.
- **Dependencies:** T-03
- **Complexity / risk:** M / M (clean-up runs in the background over many rows; tests must cover the no-retry-on-4xx rule)
- **Decision needed before start:** Whether a failed clean-up may show a 'Resume' button (new UI, AD-01 item 4). Without it: a clear message that Activate then Deactivate again is safe.
- **Testing:** Mocked client answering 429 on row k: the row is retried and the run completes (UT-AD01-*); a 400 is not retried; counts are right.
- **Acceptance criteria:** DEV run on a test account with known counts: no row left unprocessed; `[VSB]` lines show retries.
- **Rollback:** Switch `CLEANUP_RESILIENT` (default on); revert.

#### T-05 - Register the bulk backend where the bulk tables are registered

- **Related findings:** PA-02 (P1)
- **Highest priority closed:** P1
- **Affected files** (from the findings' evidence; Stage 3 confirms before editing): `data/financeBulk.ts`, `data/bulkBackend.ts`, `data/executePlan.ts`, `data/generators.ts`, `data/checklistBulk.ts`, `features/pm/finance/perf.ts`
- **Proposed implementation:** In `data/financeBulk.ts`, call `registerDefaultBulkBackend(createGeneratorsBulkBackend)` as `checklistBulk.ts:23` does (or resolve the backend where a bulk step is first planned). Add a test with a fresh module graph.
- **Expected improvement:** Removes a latent partial save that would appear the day `bulkSchedules` is switched on. No runtime change today (flag off).
- **Dependencies:** none
- **Complexity / risk:** S / L
- **Testing:** Fresh-module-graph test: a tranche plan with a bulk step must run or refuse before any write (UT-PA02-*).
- **Acceptance criteria:** Test green; the flag stays off until its own DEV test.
- **Rollback:** Revert.

#### T-06 - Hold the tab open while deferred deletes run

- **Related findings:** CA-03 (P1)
- **Highest priority closed:** P1
- **Affected files** (from the findings' evidence; Stage 3 confirms before editing): `data/addCostSheet.ts`, `data/addCostSheetBulk.ts`, `features/cost/costing/useCostBook.ts`, `features/cost/costing/backgroundSave.ts`
- **Proposed implementation:** Reuse the WS-F `beforeunload` hold (today only active with `BACKGROUND_SAVE`, which is off) for the deferred contract and cost deletes, so closing or reloading the tab warns while a deferred delete or its totals reconcile is pending. No change to what is deleted or when.
- **Expected improvement:** Closes the window where closing the tab skips the totals reconcile after a deferred delete (code-derived).
- **Dependencies:** none
- **Complexity / risk:** S / L (a browser prompt; no data effect)
- **Testing:** Hook test that the listener is registered while `pendingDeletes` holds work and removed after (UT-CA03-*).
- **Acceptance criteria:** Prompt appears during a deferred delete in a DEV run.
- **Rollback:** Revert.

#### T-07 - Planning: create rows from an explicit step, not from a query function

- **Related findings:** PB-05 (P2)
- **Highest priority closed:** P2
- **Affected files** (from the findings' evidence; Stage 3 confirms before editing): `features/pm/planning/hooks.ts`
- **Proposed implementation:** Move the row-creating step out of the query function into a guarded once-per-project step (or a mutation) so a retry, a window focus or a second tab cannot run it twice; create with deterministic ids where the table allows.
- **Expected improvement:** Removes duplicate Planning rows; no change on a normal first open.
- **Dependencies:** T-00
- **Complexity / risk:** M / M (touches first-open behaviour; canvas parity must hold)
- **Decision needed before start:** Confirm the canvas behaviour to keep: which rows Planning creates on open and for whom (a user who cannot read the rows must not create them).
- **Testing:** Tests that run the loader twice / concurrently and assert one create; canvas-parity test of the first open.
- **Acceptance criteria:** No second create in a double-open DEV check.
- **Rollback:** Switch; revert.

#### T-08 - Flow calls: unknown outcome is detected and shown, not guessed

- **Related findings:** PB-01 (P1)
- **Highest priority closed:** P1
- **Affected files** (from the findings' evidence; Stage 3 confirms before editing): `checklist/hooks.ts`, `checklist/rules.ts`, `data/flows.ts`
- **Proposed implementation:** After a failed or timed-out flow call, re-read the tracking row: if the flow wrote its run id, treat as started; if not, restore the pre-flow state and tell the user the outcome is unknown and what to check. No retry of the flow call itself (a flow can send a real approval).
- **Expected improvement:** Removes the 'task stuck In Progress, every later request refused' state and lowers the duplicate-approval risk. The first version handles a call that fails; when T-12 lands it also handles a call that times out (unknown outcome).
- **Dependencies:** T-00
- **Complexity / risk:** M / M (touches approval flows that send real mail; the flow test plan in the project's `16-PM-FLOWS-IN-THE-CODE-APP.md` §7 applies)
- **Decision needed before start:** The wording of the 'outcome unknown' message and whether the task is auto-restored (client-only fix; no flow change).
- **Testing:** Unit tests per step (cluster, checklist, gate cancel) for: flow ok; flow failed before start; flow started then call failed.
- **Acceptance criteria:** DEV test with the flow disabled/forced to fail: state restored, message shown, no duplicate approval.
- **Rollback:** Switch; revert.

#### T-09 - Creates keep their ids across a retry

- **Related findings:** WE-04 (P2), CB-14 (P2), CA-07 (P2)
- **Highest priority closed:** P2
- **Affected files** (from the findings' evidence; Stage 3 confirms before editing): `data/executePlan.ts`, `data/adminContract.ts`, `data/adminChecklistTables.ts`, `data/adminCost.ts`, `data/contracts.ts`, `data/landLease.ts`, `data/periodWrites.ts`, `data/capexWrites.ts`, `features/cost/capex-costs/Screen.tsx`
- **Proposed implementation:** Use the pattern Add Cost already has (D51 §3a: new rows keep their ids across a retry): a client-generated id (`newRowId`) per create that is reused if the user presses Save again, so a create that landed but looked failed does not duplicate. An 'already exists' answer is treated as landed after a read-back. Applies to header creates (Land Lease, OPEX, Contracts) and the CAPEX panel Add.
- **Expected improvement:** A user retry after an ambiguous failure cannot create a second row.
- **Dependencies:** T-03
- **Complexity / risk:** M / M
- **Testing:** Tests that fail the response of a create (landed), press Save again: one row, no error shown as success twice (UT-WE04-*).
- **Acceptance criteria:** Same, in a DEV forced-failure run.
- **Rollback:** Switch; revert.

### Wave 2 - Shared request core (retry, deadline, gate)

#### T-10 - Status-based retry policy with backoff and jitter (Retry-After optional)

- **Related findings:** OR-01 (P1), WE-01 (P2)
- **Highest priority closed:** P1
- **Affected files** (from the findings' evidence; Stage 3 confirms before editing): `data/retry.ts`, `data/concurrency.ts`, `app/Providers.tsx`, `platform/errors.ts`, `data/client.ts`. **Shared files: coordinate with the other sessions (doc 24).**
- **Proposed implementation:** Replace the header-dependent logic in `data/retry.ts` with one policy: classify an error (validation, auth, permission, not found, conflict, transient, throttled, unknown) from `status`; schedule by class with exponential backoff and full jitter and a per-save budget; keep the header reader for a future host. Mark deterministic failures (the `fetchAll` cap error) as not retryable so `isRetryable` stops re-walking them (WE-01). Give the query client a jittered `retryDelay`. Initial schedule values come from T-00 (P-4), not from guesses.
- **Expected improvement:** A 503 and a longer 429 are retried where safe; the cap error stops costing up to 150 extra page requests (code-derived).
- **Dependencies:** T-00
- **Complexity / risk:** M / M (shared file `data/retry.ts` and `app/Providers.tsx`; coordinate with the other sessions, doc 24)
- **Testing:** Table-driven tests of the class and schedule with SDK-shaped errors (no headers); jitter bounds with an injected random; existing `retry.test.ts` kept green.
- **Acceptance criteria:** UT-RETRY-* pass; no caller's success path changes.
- **Rollback:** Switch `RETRY_POLICY_V2`; revert the commit.

#### T-11 - Adopt the policy for single-row writes, bulk transport and verify reads

- **Related findings:** WE-02 (P1), CA-01 (P1)
- **Highest priority closed:** P1
- **Affected files** (from the findings' evidence; Stage 3 confirms before editing): `data/executePlan.ts`, `data/client.ts`, `data/adminRowWrites.ts`, `data/bulkSend.ts`, `data/addCostSheet.ts`. **Shared files: coordinate with the other sessions (doc 24).**
- **Proposed implementation:** Route the single-row create, update and plain delete calls in the plan engine and admin loops, the Add Cost / CAPEX bulk transport, the per-row upsert and the verify reads through one `sendWithPolicy(kind, fn)`. Idempotency matrix (doc 21): reads, deletes and PATCH with absolute values retry on 429/5xx/network; a create or a non-idempotent bulk call retries only on 429 (not processed); everything else surfaces as before.
- **Expected improvement:** A throttled row no longer turns a save into a partial save.
- **Dependencies:** T-10
- **Complexity / risk:** L / M-H (the widest change in the programme; each module adopts behind its own switch)
- **Testing:** Per module: the 429-on-row-k test; no retry of a create after a 500; the existing save tests unchanged.
- **Acceptance criteria:** Counts of `[VSB]` retry lines match the injected failures in a DEV run; no duplicate rows.
- **Rollback:** One switch per adopting module; revert per commit.

#### T-12 - Request deadline and the 'unknown outcome' class

- **Related findings:** CA-02 (P1), WE-05 (P3)
- **Highest priority closed:** P1
- **Affected files** (from the findings' evidence; Stage 3 confirms before editing): `data/concurrency.ts`, `features/cost/costing/useCostWriteFlight.ts`, `data/pendingDeletes.ts`, `data/client.ts`, `data/executePlan.ts`, `features/shared/useBusyRunner.ts`. **Shared files: coordinate with the other sessions (doc 24).**
- **Proposed implementation:** A deadline wrapper (`Promise.race`; it stops waiting, it cannot cancel the request). Reads time out with a retryable error; a write that exceeds its deadline throws `UnknownOutcomeError`, which never auto-retries a create, triggers the read-back verification where one exists and is shown to the user as 'may or may not have been saved'. A retry wait no longer holds a gate slot (WE-05). Deadline values are set from T-00 (P-5).
- **Expected improvement:** A hung call can no longer freeze the Cost save, the cross-screen lock and the pending-delete registry for ever.
- **Dependencies:** T-00, T-10
- **Complexity / risk:** M / M (a wrongly short deadline would report unknown outcomes for slow but successful saves; calibrate first)
- **Testing:** Fake timers: a never-resolving write ends as `UnknownOutcomeError`; a slow success inside the deadline is untouched; gate slot released.
- **Acceptance criteria:** Deadlines set from measured p99 plus margin; DEV run with an injected hang releases the lock.
- **Rollback:** Switch `REQUEST_DEADLINES` (off = today's behaviour).

#### T-13 - One global request ceiling, and gated verify reads

- **Related findings:** WE-03 (P2), CA-17 (P3)
- **Highest priority closed:** P2
- **Affected files** (from the findings' evidence; Stage 3 confirms before editing): `data/writePlan.ts`, `data/concurrency.ts`, `data/adminCapexAccounts.ts`, `Screen.tsx`, `data/bulkSend.ts`, `data/addCostSheetBulk.ts`, `data/addCostSheet.ts`. **Shared files: coordinate with the other sessions (doc 24).**
- **Proposed implementation:** A single module-level gate for requests sent through the shared helpers (plan engine, bulk transport, `fetchAll`, verify reads), with a total ceiling below Dataverse's 52 per user (initial 40) and a write lane inside it (the current 24 for Add Cost). Per-pool limits stay as they are. Limit stated honestly: calls made directly on a generated service outside the helpers are not seen by the gate; T-13 routes the hot paths and adds a unit-suite gate that stops new direct SDK calls outside an allow-list.
- **Expected improvement:** Concurrent pools and plans can no longer add up past the limit; the ungated verify reads of Add Cost stop passing it.
- **Dependencies:** T-11
- **Complexity / risk:** M / M (a ceiling can slow a burst; measured against the baseline)
- **Testing:** Peak-in-flight tests with several pools at once; the allow-list gate test (G-REQ).
- **Acceptance criteria:** Peak in flight never exceeds the ceiling in the unit test and in a DEV capture of the largest save.
- **Rollback:** Switch `GLOBAL_GATE`; revert.

#### T-14 - Cost reads may retry a transient failure

- **Related findings:** CA-11 (P2)
- **Highest priority closed:** P2
- **Affected files** (from the findings' evidence; Stage 3 confirms before editing): `features/cost/costing/useCostBook.ts`, `app/Providers.tsx`
- **Proposed implementation:** Replace `retry: false` on the three main Cost reads with the shared read policy (retry once on transient 5xx/429/network after jitter; never on 4xx), so one transient failure does not show 'Cost data is unavailable'.
- **Expected improvement:** Fewer spurious load errors.
- **Dependencies:** T-10
- **Complexity / risk:** S / L
- **Testing:** Query tests: a transient failure then success shows data; a 403 shows the error at once.
- **Acceptance criteria:** As tests.
- **Rollback:** Revert.

#### T-15 - Write-engine hardening: shape gaps and the permission message

- **Related findings:** WE-06 (P3), WE-07 (P3)
- **Highest priority closed:** P3
- **Affected files** (from the findings' evidence; Stage 3 confirms before editing): `data/executePlan.ts`, `data/usePlanWrite.ts`, `platform/privileges.ts`, `data/usePlanWrite.test.ts`
- **Proposed implementation:** Make the plan shapes that today rely on a correct caller impossible to build wrongly (WE-06) and find the permission text inside a `PlanError` (WE-07, today pinned on purpose by a test: update the test with the change).
- **Expected improvement:** Fewer bad requests from a plan bug; correct permission message.
- **Dependencies:** none
- **Complexity / risk:** S / L
- **Testing:** Existing `executePlan` / `usePlanWrite` tests plus new shape tests.
- **Acceptance criteria:** Suite green.
- **Rollback:** Revert.

### Wave 3 - Duplicate, unnecessary and independent requests

#### T-20 - Cost: refresh only what the write changed, and start independent reads together

- **Related findings:** CA-05 (P1), CA-06 (P2), CA-08 (P2), CA-09 (P2), CA-15 (P3), CA-16 (P3)
- **Highest priority closed:** P1
- **Affected files** (from the findings' evidence; Stage 3 confirms before editing): `features/cost/costing/capexInvalidation.ts`, `features/cost/costing/useCostBook.ts`, `data/costBook.ts`, `features/cost/add-costs-from-table/Screen.tsx`, `data/addCostSheet.ts`, `features/cost/capex-costs/Screen.tsx`, `features/cost/capex-costs/CommentsPanel.tsx`, `data/standardContracts.ts`
- **Proposed implementation:** Patch the cached category book after a paid toggle / panel save / panel delete (Add Cost already patches, `savedSheetPatch`) instead of reloading it; stop refetching the not-displayed whole-project Summary totals after an Add Cost Save (`refetchType`); cache the SPV/DevCo mapping through `sharedRead`; start the comment reads with the payments, not after; overlap the comment deletes; read the active-WTG count only for standard contracts and select only the used column.
- **Expected improvement:** Code-derived: removes one whole-book reload from each CAPEX interaction and one wave from the CAPEX load; quantified in wave 0/6.
- **Dependencies:** T-00
- **Complexity / risk:** M / M (patch-in-place must equal a reload; a differential test proves it)
- **Testing:** Differential tests: patched book equals reloaded book for toggle, save, delete; request-count assertions per interaction.
- **Acceptance criteria:** Request counts per scenario at or below the code-derived target in doc 25; screens look identical.
- **Rollback:** One switch per item (`CAPEX_PATCH_BOOK`, ...).

#### T-21 - Contracts, OPEX, Land Lease: remove duplicated reads and serial steps

- **Related findings:** CB-07 (P3), CB-08 (P3), CB-09 (P3), CB-11 (P3), CB-12 (P3), CB-13 (P3), CB-15 (P3)
- **Highest priority closed:** P3
- **Affected files** (from the findings' evidence; Stage 3 confirms before editing): `features/cost/periods/landLeaseRules.ts`, `data/costBook.ts`, `features/cost/costing/useCostBook.ts`, `data/periodWrites.ts`, `features/cost/contracts/hooks.ts`, `data/contracts.ts`, `data/keys.ts`, `features/cost/contracts/Screen.tsx`, `data/landLease.ts`
- **Proposed implementation:** Run independent OPEX writes together; read a contract's links with its PATCH rather than after; key the Contracts reads so a create or delete reads payment targets and links once; read the two BoP standard-assumption sets in one request; reuse the catalogue the OPEX screen already holds; do not reload reference rows with every Land Lease write; widen Land Lease tiering only where the audit shows independence.
- **Expected improvement:** Fewer waves per save on the three screens; code-derived counts in doc 22 detail and doc 25.
- **Dependencies:** T-01, T-02
- **Complexity / risk:** M / M (reordering inside a non-transactional save changes the partial-failure shape; each change keeps the failure-safe tiering of D160)
- **Testing:** The existing tiering and wave-order tests (landLease.writes, periodWrites.opex.waves) updated with exact new orders; failure-injection tests per reordered step.
- **Acceptance criteria:** Per-save wave counts equal the targets; failure of any step leaves the same recoverable state as today.
- **Rollback:** Switches next to `LEASE_WRITE_PARALLEL` / `OPEX_IMPORT_PARALLEL`.

#### T-22 - Generators, Production, Revenues, Finance: independent reads together, no double refetch, lighter warm-up

- **Related findings:** PA-05 (P2), PA-08 (P3), PA-09 (P3), PA-10 (P3), PA-11 (P3), PB-09 (P3), PA-15 (P3)
- **Highest priority closed:** P2
- **Affected files** (from the findings' evidence; Stage 3 confirms before editing): `features/pm/generators/Screen.tsx`, `features/pm/production/hooks.ts`, `features/pm/generators/reload.ts`, `hooks.ts`, `data/usePlanWrite.ts`, `data/finance.ts`, `data/production.ts`, `data/generators.ts`, `app/generatorsWarmup.ts`, `app/routes.tsx`, `features/pm/generators/queries.ts`, `app/Providers.tsx`, `features/pm/generators/hooks.ts`
- **Proposed implementation:** Run the permission-cancellation flow beside the Identify reads; stop re-reading what the save just read; refetch the turbines once (not old key then new key); select the columns that are used; run the 10-13 read Generators warm-up only on a screen likely to go to Generators (or after idle), reuse its cache in Finance; make the O&M guard one read.
- **Expected improvement:** Fewer requests on every PM screen (the warm-up) and on Generators type add/delete (code-derived).
- **Dependencies:** T-00
- **Complexity / risk:** M / M (the warm-up's value is real on a Generators visit; gate by measurement)
- **Testing:** Request-count assertions per scenario; the existing D141-D146 tests stay green.
- **Acceptance criteria:** Counts at or below doc 25 targets; Generators first paint not slower in the wave-0 capture.
- **Rollback:** Existing `generatorsPerfFlags` style switches.

#### T-23 - Boot and PM screens: prefetch, one key per table, fewer waves

- **Related findings:** PB-03 (P2), PB-06 (P3), PB-07 (P3), PB-08 (P3), PB-10 (P3), PB-12 (P3), PB-13 (P3), PB-15 (P3), PB-16 (P3)
- **Highest priority closed:** P2
- **Affected files** (from the findings' evidence; Stage 3 confirms before editing): `app/bootPrefetch.ts`, `app/routes.tsx`, `App.tsx`, `data/currentUser.ts`, `data/project.ts`, `checklist/rules.ts`, `grid-operator/hooks.ts`, `planning/hooks.ts`, `data/team.ts`, `data/checklist.ts`, `data/milestones.ts`, `data/generalData.ts`, `milestones/rules.ts`, `checklist/hooks.ts`, `checklist/Screen.tsx`, `general-data/hooks.ts`, `data/personCache.ts`, `data/checklistPeople.ts`
- **Proposed implementation:** Prefetch the PM screens' own first reads in the deep-link boot; read `vsb_countries` under one key and select; filter roles and teams by the Entra id so the current-user chain loses a wave; read the two environment-variable tables together; share the project-row key between Planning and Grid Operator; run the Milestones FID re-pricing reads beside the updates; read Check List trackings once per cluster visit; reuse cached gates/Entra data in General Data; merge the three Entra person caches.
- **Expected improvement:** Code-derived: PM deep link loses one wave; the cold boot loses one wave and a few requests.
- **Dependencies:** T-00
- **Complexity / risk:** L / M (shared boot code: `app/*`, `data/currentUser.ts`; frontend session coordination)
- **Testing:** Boot-order tests (UT-BOOT-*) asserting waves; keyed-cache tests; existing screen tests.
- **Acceptance criteria:** Wave counts per scenario in the capture equal doc 25 targets.
- **Rollback:** Per-item switches; revert.

#### T-24 - Admin screens: bound the fan-out, narrower reloads, one read per table

- **Related findings:** AD-03 (P1), AD-06 (P2), AD-08 (P3), AD-09 (P3), AD-11 (P3), AD-12 (P3)
- **Highest priority closed:** P1
- **Affected files** (from the findings' evidence; Stage 3 confirms before editing): `features/admin/admin-capex-accounts/hooks.ts`, `Screen.tsx`, `app/Providers.tsx`, `features/admin/admin-gates-approvals/hooks.ts`, `data/adminInvalidation.ts`, `data/adminGatesApprovals.ts`, `data/adminCapexAccounts.ts`, `data/adminDefaultChecklists.ts`, `features/admin/admin-cost/hooks.ts`, `data/adminCost.ts`, `data/capexAccounts.ts`, `data/capexChart.ts`
- **Proposed implementation:** Cap the `hasContracts` fan-out with a pool and honour the retry policy; reload only the changed Project Gates slice; skip the existence read right after a create; read each Costs scope once; invalidate project caches after a plugin-cascading delete; one read per table in admin (the OPT-07c residual).
- **Expected improvement:** Removes the burst past 52 concurrent on a large account tree (code-derived).
- **Dependencies:** T-10
- **Complexity / risk:** M / M (admin screens keep 'fresh on entry' by design)
- **Testing:** Peak-in-flight test for the fan-out; reload-scope tests; invalidation tests (adminInvalidation).
- **Acceptance criteria:** Peak in flight <= pool width in the test; counts at or below doc 25.
- **Rollback:** Per-item switches.

### Wave 4 - Queries and payloads

#### T-30 - Larger id lists per request (after probe P-1)

- **Related findings:** CA-04 (P1)
- **Highest priority closed:** P1
- **Affected files** (from the findings' evidence; Stage 3 confirms before editing): `data/odata.ts`, `costBook.ts`, `comments.ts`
- **Proposed implementation:** If P-1 shows the host accepts it, raise the OR-chain chunk (`odata.ts` `CHUNK = 40`) or use `Microsoft.Dynamics.CRM.In(...)` for GUID lists (the SDK itself builds an `In(PropertyName=...)` filter for its metadata calls), within the measured URL limit minus a margin. Applies to every `Promise.all(chunk(ids).map(fetchAll))`.
- **Expected improvement:** Several-fold fewer requests for id fan-outs (code-derived: 40 ids per request today).
- **Dependencies:** T-00
- **Complexity / risk:** M / M (a request the host rejects fails the read; probe and a fallback to 40)
- **Decision needed before start:** None to start; the DEV probe P-1 decides the form (a larger `or` chunk, or the `In` function).
- **Testing:** `odata.test.ts` shapes; a fallback test (reject -> smaller chunk).
- **Acceptance criteria:** P-1 result recorded; capture shows the new counts.
- **Rollback:** Constant back to 40.

#### T-31 - Single-valued navigation filters for child loads (after probe P-2)

- **Related findings:** CB-05 (P2)
- **Highest priority closed:** P2
- **Affected files** (from the findings' evidence; Stage 3 confirms before editing): `data/contracts.ts`, `data/landLease.ts`
- **Proposed implementation:** If P-2 shows the host accepts a filter through the parent lookup (as `adminContract.ts:186` already does), load payment targets, DevCo links, CAPEX cost rows and lease periods/allocations in the same wave as their parents instead of after, ending the 40-id fan-out.
- **Expected improvement:** Contracts and Land Lease loads go from 2 waves to 1 (code-derived).
- **Dependencies:** T-00, T-30
- **Complexity / risk:** M / M
- **Testing:** Query-shape tests; result-equality tests against the id-list path.
- **Acceptance criteria:** Same rows as today on DEV test projects.
- **Rollback:** Switch back to the id-list path.

#### T-32 - Send only what changed

- **Related findings:** PA-03 (P2), CA-12 (P3), AD-10 (P3)
- **Highest priority closed:** P2
- **Affected files** (from the findings' evidence; Stage 3 confirms before editing): `features/pm/finance/rules.ts`, `data/capexWrites.ts`, `data/adminCost.ts`
- **Proposed implementation:** Finance tranche Save writes only changed repayment and step-up rows; a CAPEX Edit omits the unchanged Linked Cluster bind; skip the Period-1 propagation when nothing changed. Never remove an attribute a plug-in, flow or audit needs: each omitted column is checked against `04-flow-inventory.md`.
- **Expected improvement:** Smaller and fewer write requests on those saves (code-derived).
- **Dependencies:** T-00
- **Complexity / risk:** M / M (a missed changed column would lose an edit; differential tests)
- **Decision needed before start:** AD-10 (Period-1 propagation skip) is canvas parity; keep unless the owner confirms the skip after a DEV check (D160 DEC-5).
- **Testing:** Differential tests: changed-only payloads reproduce the same stored result as full payloads for random edits.
- **Acceptance criteria:** Stored rows identical in DEV A/B runs.
- **Rollback:** Switches.

#### T-33 - Municipality search cannot be cut short silently

- **Related findings:** PB-02 (P1)
- **Highest priority closed:** P1
- **Affected files** (from the findings' evidence; Stage 3 confirms before editing): `data/generalData.ts`, `data/client.ts`
- **Proposed implementation:** Verify on DEV (Bayern, empty term) whether one page of 5000 is truncated; if so page until done or show the truncation, and debounce (DEC-6 stays a documented divergence unless the owner decides).
- **Expected improvement:** No silently incomplete municipality list.
- **Dependencies:** T-00
- **Complexity / risk:** S / L
- **Testing:** Pagination test with a >500 result.
- **Acceptance criteria:** Count on DEV equals the list length.
- **Rollback:** Revert.

### Wave 5 - Bulk operations

#### T-40 - Land Lease allocations and OPEX cascades as bulk updates

- **Related findings:** CB-06 (P2), CB-10 (P3)
- **Highest priority closed:** P2
- **Affected files** (from the findings' evidence; Stage 3 confirms before editing): `features/cost/periods/landLeaseRules.ts`, `data/landLease.ts`, `data/periodWrites.ts`, `data/generatorsBulk.ts`
- **Proposed implementation:** Send the independent single-row loops (allocation creates/updates, OPEX cascade and re-chain PATCHes) as `CreateMultiple` / `UpdateMultiple` through `data/bulkWrites.ts`, in the existing chunking, behind a switch, after probe P-3. No flow or plug-in fires on these tables (audit E).
- **Expected improvement:** Requests for a 40-allocation save drop from one per row to one per chunk (code-derived).
- **Dependencies:** T-00, T-01, T-11
- **Complexity / risk:** L / M-H (a chunk is atomic but several are not; same partial-failure handling as Add Cost: settle, reconcile, stable ids)
- **Testing:** End-to-end tests with a mocked SDK like `addCostSheet.bulk.test.ts`: success, one chunk failing, 501 fallback.
- **Acceptance criteria:** DEV run: rows identical to the per-row path.
- **Rollback:** Switch per screen (per-row path stays in code).

#### T-41 - Generators bulk programme: staged enablement

- **Related findings:** PA-01 (P1), PA-13 (P3), PA-12 (P3)
- **Highest priority closed:** P1
- **Affected files** (from the findings' evidence; Stage 3 confirms before editing): `data/generatorsBulkFlags.ts`, `features/pm/generators/plans.ts`, `data/generatorsBulk.ts`, `data/generatorCatalogueCache.ts`, `features/pm/generators/hooks.ts`
- **Proposed implementation:** Do not write new bulk code first: the Generators bulk path exists and is off (OPT-21). Fix its known gaps (turbines on `together` with `createRollback`; `statecode` through `UpdateMultiple` verified by P-3; the write gate of 24 shared with Add Cost), run the DEV test plan, then enable flag by flag: toggle, deletes, creates. Drop the guard read where `UpdateMultiple` itself refuses a missing id (PA-13). Scope the persisted-catalogue key by environment and user before that flag is ever turned on (PA-12).
- **Expected improvement:** Code-derived: add a WTG type with 20 turbines and 2 all-WTG costs 63 -> about 9 requests, 6 -> 4 waves; status toggle on 50 turbines 52 -> a few.
- **Dependencies:** T-00, T-05, T-11, T-13
- **Complexity / risk:** L / H (the biggest write volume in the app; staged with DEV tests and per-flag rollback)
- **Decision needed before start:** Go-ahead to run the existing GENERATORS-BULK-DEV-TEST-PLAN on DEV and to switch flags on stage by stage.
- **Testing:** The existing generatorsBulk tests plus the DEV test plan's cases; failure-injection per chunk.
- **Acceptance criteria:** DEV test plan passes; rows and totals identical; the roll-up flow runs the expected number of times.
- **Rollback:** Each flag back to false (they exist for this).

#### T-42 - Revenues, Production, General Data: write less, together

- **Related findings:** PA-06 (P2), PA-07 (P2), PB-11 (P2)
- **Highest priority closed:** P2
- **Affected files** (from the findings' evidence; Stage 3 confirms before editing): `features/pm/revenues/rules.ts`, `Screen.tsx`, `features/pm/production/rules.ts`, `data/executePlan.ts`, `general-data/rules.ts`
- **Proposed implementation:** Revenues: diff stored hedge volumes against the new ones and write only the difference instead of delete-all plus create-all; Production one-shot generation: 16-wide creates and bulk allocations (the Production group is already 16 wide for saves, D145); General Data edit: send the tracking rebuild and shareholder writes together as the create path already does.
- **Expected improvement:** Fewer requests and waves on those saves (code-derived).
- **Dependencies:** T-11, T-13
- **Complexity / risk:** L / M-H (Revenues diff must reproduce the same final rows)
- **Decision needed before start:** PB-11: confirm the order dependence of the server flow `SynchroniseProjectState` on DEV before the trackings go together.
- **Testing:** Property-style tests: diff-write final state equals delete-recreate final state over random inputs (as the D51 400-seed test does).
- **Acceptance criteria:** Final rows identical in DEV A/B.
- **Rollback:** Switches.

#### T-43 - CAPEX panel delete and the admin clean-up in fewer requests

- **Related findings:** CA-14 (P2), AD-02 (P1)
- **Highest priority closed:** P1
- **Affected files** (from the findings' evidence; Stage 3 confirms before editing): `data/capexWrites.ts`, `data/adminCapexAccounts.ts`, `data/client.ts`
- **Proposed implementation:** CAPEX panel delete: run the four sequential delete phases as far as the dependency order allows. Admin clean-up: one existence check per 40 ids instead of one per row (no decision needed), and `UpdateMultiple` for the zeroing (needs the D36 decision).
- **Expected improvement:** Clean-up zeroing goes from 2 requests per row to one per chunk (code-derived).
- **Dependencies:** T-04, T-11, T-40
- **Complexity / risk:** M / M
- **Decision needed before start:** AD-02 lifts D36 section 1 (no bulk services for admin screens) for the clean-up only; a bulk DELETE is not available without a Dataverse custom API (outside this workstream).
- **Testing:** Mocked client tests as T-04; ordering tests for the panel delete.
- **Acceptance criteria:** DEV counts.
- **Rollback:** Switch.

### Wave 6 - Regression, benchmark, QA, documentation

#### T-90 - Regression, reliability, benchmark and independent QA

- **Related findings:** none (enabling / validation work)
- **Highest priority closed:** -
- **Affected files** (from the findings' evidence; Stage 3 confirms before editing): none
- **Proposed implementation:** Full `npm run verify` on an idle machine; the E2E parity question (AGENT-GUIDE item 6); failure-injection run (429, 5xx, timeout, 403, duplicate Save); the before/after benchmark from the same captures; an independent QA agent reviews every changed file, transaction, bulk path, cache and retry rule; docs 27-34 completed.
- **Expected improvement:** Evidence for every claim; nothing is called validated without it.
- **Dependencies:** all
- **Complexity / risk:** L / L
- **Testing:** -
- **Acceptance criteria:** Doc 25's acceptance list met; no open P0/P1 QA finding.
- **Rollback:** -

## 3. Findings held for a decision (not scheduled)

| ID | Finding | What would change | Why it waits | What is needed from you |
|---|---|---|---|---|
| DEC-A | CB-04 (P1) | Delete a Land Lease header and let the server cascade its periods and allocations (the solution export sets cascade delete on those links), instead of 44 requests in 7 waves. | Changes what the delete does if any non-cascading dependent exists; needs a DEV check that the cascade covers every child, then a product decision. Atomic and 1 request if approved. | Approve a DEV test of header-only delete; then approve or reject. |
| DEC-B | PA-04 (P2) | Skip the plant roll-up write when the totals did not change. | The write fires the `LoadDevexCapexCostTotalCapacityTrigger` flow and creates a Fabric sync row; skipping it changes server-side activity. | Confirm the flow and sync row are not wanted when totals are unchanged. |
| DEC-C | PB-04 (P2) | Make 'Edit Project' / 'Edit Costs' new tabs avoid the full cold boot. | Any cross-tab sharing (storage, broadcast) is new behaviour; stale or cross-user data risk. | Decide whether a faster new tab is worth a shared cache; if yes, scope to one user and environment. |
| DEC-D | CA-13 (P2) | Summary tab totals from a server-side aggregate instead of reading every cost row. | Needs a Dataverse custom API or rollup column (server work, outside this workstream); without it the SDK cannot aggregate. | Is server-side work wanted? Otherwise accepted as is. |
| DEC-E | AD-07 (P2) | Check List Settings: one flow run per renumbered row. | A flow modification would be needed to batch it; flows must not be modified here. | Accept, or raise a separate flow change. |
| DEC-F | CA-10 (P2), AD-04 (P2) | Focus-refetch policy for the heavy Cost reads and the CAPEX tree (re-raises OPT-18 / DEC-3). | Refetch on focus protects against overwriting a colleague's change; relaxing it trades freshness for requests. | Keep (default), or allow a longer staleness for named reads with an explicit refresh control. |
| DEC-G | PA-14 (P2) | Compute roll-ups from the server's rows, not the screen's snapshot (lost update across users and tabs). | Adds a read before each roll-up write, a correctness gain with a request cost. | Is the lost-update risk acceptable for these roll-ups? |

## 4. Traceability: finding to task

| Finding | Pri | Task or decision | Title |
|---|---|---|---|
| AD-01 | P0 | T-04 | CAPEX clean-up: thousands of un-retried per-row writes, fail-fast, no resume path |
| CB-01 | P0 | T-01 | Land Lease and OPEX updates are unguarded upserts: a row another user deleted is re-created, often as an orpha |
| CB-02 | P0 | T-02 | A partly failed Cost period write leaves the cache stale, and the retry runs from it (Land Lease import can du |
| AD-02 | P1 | T-43 | CAPEX clean-up request volume: 2 requests per zeroed row, 1 per deleted row (re-raise OPT-22 / D36 §1 with new |
| AD-03 | P1 | T-24 | `hasContracts` fan-out: one uncapped query per visible subaccount, refetched on focus, retried without Retry-A |
| CA-01 | P1 | T-11 | Add Cost and CAPEX panel writes (and their verify reads) are never retried on 429 / 503 |
| CA-02 | P1 | T-12 | No client-side deadline on any request: a hung call freezes the save, the gate, the CA-15 lock and the pending |
| CA-03 | P1 | T-06 | Deferred deletes are not protected against closing or reloading the tab (live flags) |
| CA-04 | P1 | T-30 | Id-list fan-out uses 40 ids per request in an `or` chain; larger chunks or the `In` function would cut request |
| CA-05 | P1 | T-20 | A paid toggle, a panel save or a panel delete reloads the WHOLE category book, and the spinner waits for it |
| CB-03 | P1 | T-03 | Land Lease and OPEX deletes treat "already gone" (404) as a failure |
| CB-04 | P1 | DEC-A | Land Lease contract delete sends every child delete although the header delete cascades them (and would be ato |
| OR-01 | P1 | T-10 | `Retry-After` can never be read: the SDK error has no headers, so every Retry-After branch is dead code and a  |
| PA-01 | P1 | T-41 | Generators bulk switches all off: the largest remaining write volume (re-raised OPT-21 with counts and an eval |
| PA-02 | P1 | T-05 | Finance `bulkSchedules` relies on a bulk backend that Finance never registers (latent partial save) |
| PB-01 | P1 | T-08 | Flow steps: an ambiguous or failed flow call can send a duplicate approval, or leave a task with no way forwar |
| PB-02 | P1 | T-33 | Municipality search can be cut short with no warning (OPT-19 part 1: the verification is still owed) |
| WE-02 | P1 | T-11 | No retry of any single-row create/update/delete on 429 / 503+Retry-After (engine and admin loops) |
| AD-04 | P2 | DEC-F | CAPEX tree is stale at 0 ms: every window focus re-reads the whole account table |
| AD-05 | P2 | T-03 | Admin per-row deletes treat 404 ("already gone") as a failure |
| AD-06 | P2 | T-24 | Project Gates: every Active-pill click reloads the whole dataset chain (3–4 waves); overlapping clicks run ove |
| AD-07 | P2 | DEC-E | Check List Settings: each order PATCH fires a server flow; delete-with-renumber = 2 requests and 1 flow run pe |
| CA-06 | P2 | T-20 | After an Add Cost Save the app refetches the Summary totals of the whole project (not displayed) and the categ |
| CA-07 | P2 | T-09 | CAPEX panel Add/Edit has no compensation after a partial failure, and its Add create is not idempotent |
| CA-08 | P2 | T-20 | The SPV/DevCo mapping table is read on every CAPEX book load and every sheet load, with no cache |
| CA-09 | P2 | T-20 | The comment dots wait one extra wave: comments start only after the payments have returned |
| CA-10 | P2 | DEC-F | The heavy CAPEX reads refetch on every window focus after 30 s (re-raise of OPT-18 with scoped evidence) |
| CA-11 | P2 | T-14 | The three main Cost reads have `retry: false`, so one transient 5xx/429 shows "Cost data is unavailable" |
| CA-13 | P2 | DEC-D | The Summary tab reads every cost row of the project to produce five numbers (no server-side aggregate) |
| CA-14 | P2 | T-43 | CAPEX panel Delete: four sequential phases of per-row deletes (re-raise of OPT-23 with new evidence) |
| CB-05 | P2 | T-31 | The second load wave on Contracts and Land Lease could go, through single-valued navigation filters |
| CB-06 | P2 | T-40 | Land Lease allocation writes are single-row loops; `CreateMultiple` / `UpdateMultiple` fit them |
| CB-14 | P2 | T-09 | Header creates have no idempotency: an ambiguous failure plus a retry duplicates the row |
| PA-03 | P2 | T-32 | Finance tranche Save rewrites every repayment and step-up row, changed or not |
| PA-04 | P2 | DEC-B | Every Generators save writes the plant roll-up, which fires `LoadDevexCapexCostTotalCapacityTrigger` even when |
| PA-05 | P2 | T-22 | Delete / replace: the permission-cancellation flow and the Identify reads run one after the other although the |
| PA-06 | P2 | T-42 | Revenues Save deletes every stored hedge volume and re-creates every volume |
| PA-07 | P2 | T-42 | Production one-shot generation: creates go out 8 wide, allocations one POST each |
| PA-14 | P2 | DEC-G | Roll-ups are computed from the screen's snapshot, not from the server (lost update across users and tabs) |
| PB-03 | P2 | T-23 | The PM deep-link boot prefetch starts only the session project; the screen's own first reads wait for the gate |
| PB-04 | P2 | DEC-C | "Edit Project" and "Edit Costs" open a new tab that pays the whole cold boot again |
| PB-05 | P2 | T-07 | Planning writes rows from inside query functions |
| PB-11 | P2 | T-42 | General Data edit save: tracking rebuild and shareholder writes go one at a time, while the create path sends  |
| WE-01 | P2 | T-10 | Deterministic failures are classified as retryable: a `fetchAll` cap failure is re-walked twice more |
| WE-03 | P2 | T-13 | Per-pool limits only: concurrent pools and plans add up with no global write ceiling |
| WE-04 | P2 | T-09 | Creates are not idempotent: an ambiguous failure plus a user retry can duplicate a row |
| AD-08 | P3 | T-24 | Redundant existence GET right after a create (create-then-update pairs) |
| AD-09 | P3 | T-24 | Costs settings: three scope reads refetch on every focus; OPEX rows read twice per scope |
| AD-10 | P3 | T-32 | Period-1 edit propagates to every later period even when nothing changed (deferred S6-07, recorded for complet |
| AD-11 | P3 | T-24 | Plugin-cascading deletes do not invalidate the project caches they change |
| AD-12 | P3 | T-24 | Same table, three admin reads (OPT-07c residual) |
| CA-12 | P3 | T-32 | A CAPEX Edit sends the whole contract column bag, including the unchanged Linked Cluster bind |
| CA-15 | P3 | T-20 | Comments panel Save is a chain of single awaits; the deletes could overlap |
| CA-16 | P3 | T-20 | The active-WTG count is read for every CAPEX tab although only standard contracts need it, and it selects an u |
| CA-17 | P3 | T-13 | Verify reads are ungated and can pass the 52-per-user limit beside gated writes (re-raise of the D75 review-lo |
| CB-07 | P3 | T-21 | Land Lease tiering still serialises independent period writes (followers, period deletes, import periods) |
| CB-08 | P3 | T-21 | The OPEX book re-reads `vsb_opexsubaccounts` on every load while the screen holds the catalogue |
| CB-09 | P3 | T-21 | Independent sequential awaits in the OPEX writes |
| CB-10 | P3 | T-40 | OPEX cascade and re-chain PATCH loops could be one `UpdateMultiple` |
| CB-11 | P3 | T-21 | A Contracts edit save reads the contract's links only after the contract PATCH |
| CB-12 | P3 | T-21 | Contracts: id-set query keys make a create or delete read the payment targets and links twice |
| CB-13 | P3 | T-21 | The two BoP standard-assumption reads could be one request |
| CB-15 | P3 | T-21 | Every Land Lease write reloads the whole book, reference rows included, before the save resolves |
| PA-08 | P3 | T-22 | Production reload re-reads data the save has just read (twice when generation runs) |
| PA-09 | P3 | T-22 | Type add / delete / replace refetches the turbines twice (old key, then new key) |
| PA-10 | P3 | T-22 | Generator-type reads for ids only select 12–14 columns; Finance re-reads a list the warm-up has just cached |
| PA-11 | P3 | T-22 | The Generators warm-up sends 10–13 reads from every PM screen, whether or not Generators is visited |
| PA-12 | P3 | T-41 | Persisted catalogue (off): key not scoped by environment or user |
| PA-13 | P3 | T-41 | Bulk `updateMany` always pays a guard read, even where `UpdateMultiple` itself would refuse a missing id |
| PA-15 | P3 | T-22 | A selected type's O&M guard is 2 sequential reads per selection |
| PB-06 | P3 | T-23 | `vsb_countries` is read under four keys with four selects (the rest of OPT-07a; D119 §4(a) still open) |
| PB-07 | P3 | T-23 | The current-user chain can lose a wave: filter roles and teams by the Entra id, not by the user row's id |
| PB-08 | P3 | T-23 | The environment variables take two sequential reads; the console gate and click-time flows wait for them |
| PB-09 | P3 | T-22 | The Generators warm-up runs 10 speculative reads on every PM screen, and most of them go stale before they are |
| PB-10 | P3 | T-23 | Project-row reads: Planning and Grid Operator share a loader but not a key; each PM screen re-reads `vsb_proje |
| PB-12 | P3 | T-23 | Milestones FID re-pricing: generator-type updates and price-ladder reads run in sequence |
| PB-13 | P3 | T-23 | Check List: the trackings are read twice on every cluster visit |
| PB-14 | P3 | T-01 | Check List back-fill: up to 7 sequential, unguarded upserts; an update can bring a deleted tracking back witho |
| PB-15 | P3 | T-23 | The General Data gate-cancellation path re-reads gates and Entra that the Check List has cached |
| PB-16 | P3 | T-23 | Three separate Entra person caches for the same `aadusers` lookups |
| WE-05 | P3 | T-12 | No request timeout anywhere; a hard retry wait holds a gate slot |
| WE-06 | P3 | T-15 | Engine shape gaps that a plan bug would turn into a bad request |
| WE-07 | P3 | T-15 | `usePlanWrite` permission message is not found inside a `PlanError` (pinned on purpose) |

The columns Stage 3 adds to this chain (doc 27): modified files, implementation commit, tests, benchmark, QA result.
