# 27 - Implementation Tracker

> Stage 3 (implementation), 25 Nov 2026. Branch `feature/dataverse-network-performance-optimization`, uncommitted. Source of every section below: the per-agent notes written by the agent that did the work, unedited except for heading levels. Nothing here is a runtime measurement. The traceability chain is finding -> backlog task (doc 22) -> agent -> files -> tests -> QA (doc 33).

## Status by backlog task

| Task | Findings | Status | Agent |
|---|---|---|---|
| T-00 | census tool | tool built; DEV probes P-1..P-5 NOT run (need DEV) | engine |
| T-01 | CB-01, PB-14 | done, behind switches (LEASE_GUARD, OPEX_GUARD, CHECKLIST_BACKFILL_GUARD) | llopex, pmb |
| T-02 | CB-02 | done (COST_REFRESH_ON_FAILURE) | llopex |
| T-03 | CB-03, AD-05 | done (helper in client.ts; admin local copy merged with it) | llopex, admin |
| T-04 | AD-01 | done (CLEANUP_RESILIENT); no Resume button | admin |
| T-05 | PA-02 | done | pma |
| T-06 | CA-03 | done (HOLD_TAB_FOR_DEFERRED_DELETES) | capex |
| T-07 | PB-05 | done (PLANNING_CREATE_ONCE); owner to confirm preserved behaviour | boot |
| T-08 | PB-01 | NOT started: needs the owner's wording | - |
| T-09 | WE-04, CB-14, CA-07 | built, shipped OFF (STABLE_CREATE_IDS, PANEL_STABLE_ID): need a DEV check | llopex, capex |
| T-10 | OR-01, WE-01 | done (RETRY_POLICY_V2 on) | core |
| T-11 | WE-02, CA-01 | done (five POLICY_* switches on) | t11 |
| T-12 | CA-02, WE-05 | primitive built, REQUEST_DEADLINES off | core |
| T-13 | WE-03, CA-17 | primitive built, GLOBAL_GATE off, verify reads prepared | core, t11 |
| T-14 | CA-11 | done (COST_READS_RETRY) | t21 |
| T-15 | WE-06, WE-07 | done; WE-07 text change shipped OFF (PLAN_PERMISSION_LOOKUP) | engine |
| T-20 | CA-05, 06, 08, 09, 15, 16 | done behind six switches | capex |
| T-21 | CB-07, 08, 09, 11, 12, 13, 15 | done behind seven switches; CB-09 child-delete skip left | t21 |
| T-22 | PA-05, 08, 09, 10, 15, PB-09/PA-11 | done; flowBesideReads and omGuardOneRead shipped OFF; warm-up lazy shipped OFF | pma, boot |
| T-23 | PB-03, 06, 07, 08, 10, 12, 13, 15, 16 | PB-03, 06, 10 (key only), 12, 13, 15, 16 done; PB-07 not done; PB-08 shipped OFF | boot, pmb |
| T-24 | AD-03, 06, 08, 09, 11, 12 | done; ADMIN_SCOPE_READS_ONCE shipped OFF | admin |
| T-30, T-31, T-33 | CA-04, CB-05, PB-02 | NOT started: need DEV probes P-1, P-2 and a DEV count | - |
| T-32 | PA-03, CA-12, AD-10 | PA-03 built shipped OFF (changedRowsOnly); CA-12 done; AD-10 not started (owner/DEV) | pma, capex |
| T-40..T-43 | CB-06, CB-10, PA-01, PA-13, PA-06, PA-07, PB-11, CA-14, AD-02 | NOT started: need P-3, DEV test plan, decisions | - |
| DEC-A..G | CB-04, PA-04, PB-04, CA-13, AD-07, CA-10, AD-04, PA-14 | held for the owner | - |

"Shipped OFF" = the code and its tests exist, the switch default is off, so production behaviour is the old behaviour until the owner approves or a DEV check passes. Every switch is a boolean constant or flags object listed under "Switches" for its agent below.

## core: shared retry policy, deadline, global gate (T-10, T-12, T-13)

### (a) Per finding

| Finding | Status | Files |
|---|---|---|
| OR-01 (Retry-After unreadable; a 503 never retried; a 429 waits 1 s then 2 s) | DONE for the primitives and the two live callers (`retryDelay`, `deleteRetryDelay`/`withDeleteRetry`, query client). Adoption by the other write paths is T-11 (later batch). | `data/retry.ts`, `data/requestPolicy.ts` (new), `data/requestFlags.ts` (new), `platform/errors.ts`, `app/Providers.tsx` |
| WE-01 (`isRetryable` re-walks a deterministic failure) | PARTLY: marker + `isRetryable` done; the `fetchAll` cap error must adopt it (file I do not own, see (e) 1). | `platform/errors.ts` |
| CA-02 (no deadline; a hung call hangs for ever) | DONE as a primitive: `withDeadline`, `UnknownOutcomeError`; `sendWithPolicy` honours `REQUEST_DEADLINES` (default OFF). No caller adopts it yet. | `data/requestPolicy.ts`, `platform/errors.ts` |
| WE-05 (a retry wait holds a gate slot) | DONE in the new design: the gate wraps ONE attempt and the wait is outside it (UT-REQPOL-050). `generatorsBulk.ts` already slept outside its gate. | `data/requestPolicy.ts`, `data/concurrency.ts` |
| WE-03 (no global ceiling) | DONE as a primitive: `createRequestGate`, `requestGate` (ceiling 40, write lane 24). NOT wired into any caller; `GLOBAL_GATE` default OFF. | `data/concurrency.ts` |
| CA-17 (verify reads ungated) | PRIMITIVE ONLY (`requestGate.runRead`); the verify reads live in `addCostSheetBulk.ts`, not mine. G-REQ gate added so direct sites cannot grow. | `src/test/requestSites.test.ts` |

Behaviour with the defaults (`RETRY_POLICY_V2 = true`):
- Bulk (`retryDelay`, used by `generatorsBulk.ts`): a 429 now gets up to 4 tries (was 3) and waits `random * min(15 s, 1 s * 2^(n-1))` (was 1 s, 2 s). A 500, 501, bare 503 or network failure is never retried (unchanged). Deliberate keep: a 503 WITH a `Retry-After` header is still retried (the platform's explicit "not processed" signal; the SDK never gives it, so it cannot fire today). The task text said "ONLY 429"; I kept the header case so the old rule is a subset. Say if you want it removed.
- Delete (`deleteRetryDelay` / `withDeleteRetry`, used by `executePlan.ts`): retried are now 429 (4 tries), 500, 502, 503, 504, 408 (3 tries) and no status (2 tries). A bare 503 is now retried (was not). 502 and 408 are new: the task listed 429/500/503/504/no-status, I used the doc 21 class `transient`, which also holds 502 and 408; a DELETE is idempotent so it is safe. Waits are jittered (were 1 s, 2 s).
- Reads (query client): the retry wait is jittered (`backoffMs`, attempt = failureCount + 1); still at most 2 retries. OFF = TanStack's default `min(1000 * 2^n, 30000)`.
- `isRetryable`: false for a `DataError` with `deterministic` set (new) and for `UnknownOutcomeError`; everything else as before.

### (b) Switches (`data/requestFlags.ts`; plain boolean constants; tests flip them with `vi.mock("./requestFlags")`; `sendWithPolicy` also takes `opts.flags` per call)

| Name | Default | OFF does |
|---|---|---|
| `RETRY_POLICY_V2` | **true** | `retryDelay`, `deleteRetryDelay`, `withDeleteRetry`, `queryRetryDelay` run the previous logic exactly (`legacyRetryDelay` and `legacyDeleteRetryDelay` are the old code verbatim; proven equal to an embedded oracle over 14 statuses x 6 header variants x attempts 1-5 x maxTries, UT-RETRYV2-100..103). In `sendWithPolicy`: OFF = no retry for read/create/patchAbsolute, the legacy rules for delete and bulk. |
| `REQUEST_DEADLINES` | **false** | `sendWithPolicy` does not race attempts against a deadline (today's behaviour). `READ_DEADLINE_MS = 60000`, `WRITE_DEADLINE_MS = 120000`: initial, uncalibrated. |
| `GLOBAL_GATE` | **false** | `sendWithPolicy` does not use `requestGate`. |

Other new constants (initial, "to be calibrated from the DEV capture"): `BACKOFF_BASE_MS 1000`, `BACKOFF_FACTOR 2`, `BACKOFF_CAP_MS 15000`, `TRANSIENT_TRIES 3`, `THROTTLED_TRIES 4` (`retry.ts`); `GLOBAL_REQUEST_CEILING 40`, `GLOBAL_WRITE_LANE 24` (`concurrency.ts`).

### (c) Tests added

- `platform/errors.classify.test.ts`: UT-ERRCLASS-001..006, 010..013 (classifier table, chain, `0x80040217`, deterministic, `isRetryable`).
- `data/retry.v2.test.ts`: UT-RETRYV2-001..005 (backoff bounds with injected random, tries), 010..013 (bulk), 020..026 (delete and `withDeleteRetry` log lines).
- `data/retry.legacyEquality.test.ts`: UT-RETRYV2-100..103 (flag off equals the old code, differential with embedded oracles; the switch really selects).
- `data/requestPolicy.test.ts`: UT-REQPOL-001..010 (matrix per kind), 020..023 (IOperationResult), 030..031 (log lines), 040..048 (deadline with fake timers, late answer, timer cleared), 050..053 (gate; a retry wait releases the slot), 060 (flag off).
- `data/concurrency.requestGate.test.ts`: UT-GATE-001..008 (peak never above ceiling or lane with several pools, hand-over, FIFO, failure and sync throw free the slot, reset, singleton 40/24).
- `app/Providers.retryDelay.test.ts` (jsdom): UT-PROVRETRY-001..005.
- `test/requestSites.test.ts`: UT-GREQ-001..005 (G-REQ; 37 files baselined from this tree). UT-GREQ-001 and 002 (no growth) are the gate. UT-GREQ-003 (no stale, too-high entry) fails on a branch that removed sites until the baseline is regenerated; its failure message prints the current `file: count` lines to paste.
- `data/retry.test.ts` (existing, mine): now mocks `./requestFlags` with `RETRY_POLICY_V2: false`, so its 26 tests keep pinning the PREVIOUS rules (the rollback path). No test body changed.
- About 95 new tests in 7 new files (errors 15, retry.v2 25, legacyEquality 4, requestPolicy 42, gate 8, providers 5, G-REQ 5 = 104).

## engine: write-engine shape checks, permission text, census tool (T-15, T-00)

### (a) Findings

- WE-06 DONE. `executePlan` now refuses a malformed plan whole, before the first request, with a new `PlanShapeError` (plain Error subclass, exported from executePlan.ts; deliberately NOT a PlanRefusedError, which admin-cost/hooks.ts maps to DevexRuleError and usePlanWrite treats as a business refusal).
  Rejected shapes (new `assertPlanShapeStrict`, mirrors what sendWrite/resolveRefs would throw later, so a plan that runs today is never refused):
  1. update/delete without a non-blank string id (the audit case);
  2. unknown op (it would have been sent as a DELETE);
  3. guarded on a create/delete (was thrown mid-plan);
  4. entity set not in dataSourcesInfo (was thrown mid-plan);
  5. concurrencyLimit not a whole number >= 1;
  6. CREATED_ROW_ID with no create before it, and createdRowRef(n) (in id, in top-level string data values, in bulk row ids/data) where n >= creates visible to that write (a write of a concurrent run sees only creates before the run; createMany counts one per row).
  The pre-existing shape errors (hardened on non-delete, bulk in together(), guarded bulk, bulk without rows) are now PlanShapeError too (still `Error`, same text).
  usePlanWrite: a PlanShapeError in a `then` plan after the first plan landed gets the same "N of M already saved" treatment as a PlanRefusedError.
- WE-07 DONE. `writeErrorMessage` walks the PlanError cause chain (depth 5) for a 403 and returns the permission sentence; if changes had already landed it appends " N of M changes had already been saved." (+ PARTLY_SAVED_NOTE for PartlySavedJobError) so the saved count is not lost. With nothing saved the text is exactly the permission sentence. `platform/privileges.ts` not touched (not needed).
- T-00 census tool DONE (script + d.mts + tests).
- Test bug found by the new check: UT-PLAN-028 used the unregistered table `vsb_opexcosts` for a write that never ran; changed to `vsb_opexprojectcosts` (registered).

### (b) Switches (writePlan.ts, shipped value true; seam `setPlanEngineFlags` / `planEngineFlags()` for tests)

- `PLAN_SHAPE_CHECKS` (default true): off = the six new shape checks are skipped, the old send-time failures return (a missing id is sent as undefined, an unregistered table fails mid-plan as PlanError). The previous five plain-Error checks stay always on.
- `PLAN_PERMISSION_LOOKUP` (default true): off = a PlanError reads "“x” failed: …" as before.

### (c) Tests

- NEW src/data/executePlan.shape.test.ts: UT-PLAN-950..967 (each rejected shape sends nothing even after a valid first write; valid shapes unchanged incl. concurrent runs, groups, bulk refs; switch-off behaviour).
- src/data/usePlanWrite.test.ts: UT-PLANWRITE-004 UPDATED (it pinned "a PlanError wrapper is not looked through"; now pins the permission sentence found inside a PlanError); added UT-PLANWRITE-033..035.
- Updated (expected PlanError -> PlanShapeError because the failure is now raised before the plan starts, same messages): executePlan.test.ts UT-PLAN-004, 006, 013, 016; executePlan.bulk.test.ts UT-PLAN-112. UT-PLAN-028 table-name fix (above).
- NEW src/test/requestCensus.test.ts: UT-CENSUS-001..008, 010..021 (parser on fixtures in the formats of requestLog.ts, summary maths, retry lines, scenario markers, waves with/without timestamps, CLI via child process, no value leak).
- Run: 192 tests in 14 files green (executePlan*, usePlanWrite*, runPlan, ownerBindGuard, requestCensus, controlLabels). Also ran all 56 other test files that import executePlan/runPlan/usePlanWrite (admin, pm checklist/generators/finance/production/revenues/planning/team/grid-operator, adminCost, bulkBackend.registry): 926 passed, 15 skipped, 0 failed. typecheck green, oxlint clean on changed files.

## llopex: Land Lease / OPEX / Contracts integrity (T-03, T-01, T-02, T-09 part)

### (a) Per finding

| Finding | Status | Files |
|---|---|---|
| CB-03 gone-as-done deletes | DONE | `data/client.ts` (new exports `isAlreadyGone`, `deleteIfExists`), `data/contracts.ts` (imports them; re-exports `isAlreadyGone`), `data/landLease.ts` (3 `WRITERS.remove`), `data/periodWrites.ts` (`deleteOpexPeriod`: children and head) |
| CB-01 upsert guard | DONE for Land Lease and OPEX | new `data/costUpdateGuard.ts` (`assertRowsExist`, `rowExists`); `data/landLease.ts` (`guardLeaseUpdates`, called first in `applyPlan`); `data/periodWrites.ts` (`guardOpexUpdates` in `saveOpexPeriod`); screens map `RecordGoneError` to `RECORD_GONE_TEXT` (`LandLeaseScreen.tsx` save, delete, import; `OpexScreen.tsx` save) |
| CB-02 refresh on failure + fresh import check | DONE | `features/cost/costing/useCostBook.ts` (3 hooks: OPEX `save`, `useAddStandardContract`, `useLeaseWrites`); `data/landLease.ts` (`loadStandardLeaseContracts`); `LandLeaseScreen.tsx` (`importStandard`); `landLeaseRules.ts` (arg type narrowed, comment) |
| CB-14 stable header id | DONE for the three headers, with one caveat (see (f) item 1: the host must accept a client id in a plain POST) | new `data/stableCreateId.ts`; `data/landLease.ts` (header create only), `data/periodWrites.ts` (`saveOpexPeriod` create), `data/contracts.ts` (`saveContract` create) |

Details and decisions:

* **CB-03.** `deleteIfExists` / `isAlreadyGone` moved verbatim (rule: 404 or `0x80040217`, D157). `contracts.ts` keeps `export { isAlreadyGone }`, so
  `contracts.links.test.ts` (UT-CONTR-169) still imports it from there and passes unchanged. Contracts' own `deleteIfExists` callers now import the shared one.
  Land Lease: the three removers go through `deleteLeaseRow`, which picks `deleteIfExists` or `deleteRecord` by the switch. OPEX: `deleteOpexPeriod` the same.
* **CB-01 Land Lease.** `applyPlan` (shared by the tiered executor and the sequential oracle) first calls `guardLeaseUpdates(writes)`: the ids of every
  `op: "update"` write grouped by entity set, one `assertRowsExist` per table in parallel (header, allocation, period: at most 3 reads, 40 ids per read,
  key only). A missing id throws `RecordGoneError` before the first write, also for a panel Save with `independentSteps` (it is a refusal of the plan, not a
  per-step failure, so it is NOT a `LeaseStepsError`). A plan that only creates reads nothing.
* **CB-01 OPEX.** `saveOpexPeriod` for an Edit (`!isNew`): the follower re-chain plan (`planFollowingPeriodStarts`, pure) is now worked out before the first
  write (same inputs, same result), and ONE read covers the row plus the followers it will PATCH. The cascade children are not checked: `childrenOfChain`
  has just read them (they exist by construction, as the audit says). An Add reads nothing.
* **CB-02.** The three hooks refresh on failure. `useLeaseWrites.onError` now refreshes for ANY error (it was `LeaseStepsError` only); OPEX `save.onError`
  invalidates the book it was run from (no cache patch, no `setQueryData`); `useAddStandardContract.onError` invalidates the cost book and, for O&M, the
  device cards, the same keys as success. The Land Lease import reads `loadStandardLeaseContracts(projectId, subaccountId)` (key + sub-account + flag
  only, project + sub-account + `vsb_isstandardcontract eq true` + ACTIVE) and hands the rows to the unchanged pure rule `planStandardImport`
  (its `existingCostsInSubaccount` type is narrowed to `Pick<LeaseCostRow, "id" | "subaccountId" | "isStandardContract">`; the rule only ever read
  `isStandardContract`). The refusal stays silent, as the canvas. A FAILED read refuses the import with the usual error text (fail closed); the spinner
  text `LEASE_MSG.loadingStandardContract` is shown during the read (same canvas string, no new text).
* **CB-14.** `createWithStableId` (see header of `stableCreateId.ts`): the create is sent with a client-generated id (`newRowId`), the id is kept in a
  tab-local registry (key = entity set + key-order-independent payload JSON, max 50) until the create is confirmed; a retry of the same save reads the id back
  (`rowExists`) and, if the row is there, returns it WITHOUT creating (Land Lease: the ref is bound to it and the children go on; Contracts: the row is read
  back with `CONTRACT_SELECT`; OPEX: `savedId` is the old id). Study of Add Cost (`idCache` in `addCostSheet.ts`, D51 §3a): same idea, but it uses
  Create/UpsertMultiple where the id is part of the payload by design; for the single-row services the generated type is
  `Omit<…Base, '<pk>'>` and the call is made with `as never` like every other create here, so the id travels as an ordinary column in the POST body.
  I could not prove from the repo that the Power Apps host passes the primary key through on a plain `createRecordAsync` (see (f)).
  Only the three headers get the id; Land Lease allocations/periods and the OPEX standard import rows do not (the import is already protected by its
  server "already has a standard contract" check).

### (b) Switches (new file `src/data/leaseOpexFlags.ts`, all default `true`, each `false` restores the old path which stays in the code)

| Name | What off does |
|---|---|
| `GONE_AS_DONE_LEASE_OPEX` | Land Lease and OPEX deletes use `deleteRecord` again (a 404 fails the plan) |
| `LEASE_GUARD` | `guardLeaseUpdates` is skipped: Land Lease updates are unguarded PATCH upserts |
| `OPEX_GUARD` | `guardOpexUpdates` is skipped: OPEX edits unguarded |
| `COST_REFRESH_ON_FAILURE` | `useLeaseWrites.onError` refreshes only for a `LeaseStepsError`; OPEX save / OPEX import refresh only on success; the Land Lease import checks the cached book again |
| `STABLE_CREATE_IDS` | the three header creates are one plain POST with a server-issued id |

(The guards could also take a per-call `enabled` argument, used by tests: `guardLeaseUpdates(writes, enabled)`.)

### (c) Tests (all pass; ids)

New files:
* `src/data/client.gone.test.ts` — UT-CLIENTGONE-001..008 (rule, `deleteIfExists`, re-export identity, plain `deleteRecord` still fails on 404). The old UT-CONTR-169 stays in `contracts.links.test.ts` (it imports through the re-export).
* `src/data/costUpdateGuard.test.ts` — UT-COSTGUARD-001..009 (one key-only read, chunks of 40, later chunk, dedupe, failed read is a DataError not "gone", malformed id / unregistered table fail closed, `rowExists`).
* `src/data/stableCreateId.test.ts` — UT-STABLEID-001..012 (id sent, oracle against the old POST, disabled, kept after failure / throw, landed row is read back and nothing is created, confirmed create forgets, edited retry = new id, key order, failed read-back, server id wins, bounded registry).
* `src/data/landLease.dvopt.test.ts` — UT-LLDVOPT-001..014 (real `client.ts` + guard + stable id against a mocked SDK: one read per table; gone allocation / header writes nothing, also with `independentSteps`; create-only plan reads nothing; failed read; differential against the flags-off executor; 404 on the 2nd allocation delete still sends period and header; 403 stops; flag off restores the failure; header id, retry with the same id, landed header not created again and children still bound; `loadStandardLeaseContracts` query shape).
* `src/features/cost/costing/useCostBook.refreshOnFailure.test.tsx` — UT-REFRESHFAIL-001..008 (all five writers: Land Lease plain failure and `LeaseStepsError`, success unchanged, flag off; OPEX save on failure and flag off; OPEX import O&M / Other, flag off).

Added to existing files:
* `src/data/periodWrites.test.ts` — UT-OPEXDVOPT-001..007 (one read for row + followers before any write; deleted row and deleted follower write nothing; an Add reads nothing; differential against flags off; client id kept across a failed create and a landed one read back; chain delete). The guard double in this file is now a configurable spy.
* `src/data/contracts.guard.test.ts` — UT-CONTRDVOPT-001..003 (contract create id kept, landed contract read back with no second create, first attempt reads nothing).
* `src/features/cost/periods/landLeaseRules.test.ts` — UT-LAND-121A (the rule decides from key-only fresh rows).

Existing tests changed (their `./client` mock lacked the new exports; behaviour asserted unchanged): `landLease.test.ts`, `landLease.writes.test.ts` (also pins the three flags off or no-op: it is the OPT-10 tiered-vs-sequential differential and the random client id would differ per run), `periodWrites.opex.waves.test.ts`, `periodWrites.test.ts`: added `deleteIfExists` to the client double and a no-op `./costUpdateGuard` double.

Not done: a click-through screen test of "Add Standard Contract" twice (the existing `LandLeaseScreen.test.tsx` mocks the whole hooks layer and has no import-click case; building one is large). The same guarantee is covered in three parts: failure refreshes (REFRESHFAIL-001), the check reads the server (LLDVOPT-014, LAND-121A), a retried header is not duplicated (LLDVOPT-012/013).

## admin: CAPEX clean-up, admin deletes, fan-out and reloads (T-04, T-24, AD-05)

### (a) Per finding

| Finding | Status | Files |
|---|---|---|
| T-04 / AD-01 CAPEX clean-up resilient | DONE | `data/adminCapexAccounts.ts` (`cleanUpForecastCosts`), `data/adminRowWrites.ts` (new: `settleEach`, `idempotentWriteDelay`, `withIdempotentRetry`, `updateRowsSettled`, `retrySleeper` / `setRetrySleeper`), `data/adminFlags.ts` |
| AD-05 admin deletes: 404 / `0x80040217` = done | DONE (local helper) | `data/adminRowWrites.ts` (`isAlreadyGone`, `deleteRowIfPresent`), used in `adminCapexAccounts.ts` (clean-up delete, `deleteCapexSubaccount`, `deleteCapexAccount`), `adminCost.ts` (`deleteOpexContract`, `deleteOpexPeriod`), `adminContract.ts` (DevCo unlink `remove`) |
| AD-03 `hasContracts` fan-out | DONE | `adminCapexAccounts.ts` (`hasContractsPooled`, `createGate(6)`), `features/admin/admin-capex-accounts/hooks.ts` |
| AD-06 Project Gates Active pill | DONE (reload only; rollback snapshot issue not touched) | `adminGatesApprovals.ts` (`reloadSlice` on the repository), `features/admin/admin-gates-approvals/hooks.ts` (`reloadGatesSlice`) |
| AD-08 no existence GET after create | DONE | `adminRowWrites.ts` (`updateRecordJustCreated`), `adminCapexAccounts.ts` (`createCapexAccount`), `adminChecklistTables.ts` (`updateJustCreatedDefaultChecklist`, optional), `adminDefaultChecklists.ts` (`updateCreatedTask`, optional; `createTask`) |
| AD-09 OPEX active + inactive read twice | DONE | `adminCost.ts` (`listOpexScopeRows`), `features/admin/admin-cost/hooks.ts` |
| AD-12 hierarchy = same table as chart | DONE | `adminCost.ts` (`loadCapexHierarchy` from `loadCapexChartRows`) |
| AD-11 cascade invalidation | DONE | `adminInvalidation.ts` (`{ cascade }` option), `features/admin/admin-contract/hooks.ts`, `features/admin/admin-cost/hooks.ts` |

Details worth knowing:
- AD-01: both phases use `settleEach` (no fail-fast), widths unchanged (8 zero, 16 delete), one `Promise.all` over both. Deletes: `withDeleteRetry(() => deleteAdminRow(...))` (its schedule is the `core` agent's `retry.ts`; I only call the export). Zero PATCH pair (guard read + PATCH together in the retried op): 429, any 5xx and no-status, 3 tries total, wait = Retry-After else 1 s x attempt (cap 30 s), injectable sleeper (`options.sleep`, else `setRetrySleeper` seam, else a real timer). 400/401/403/404/409 not retried. A row deleted meanwhile (`RecordGoneError`) stays a failure (not retried), as before. The "no key" programming error is a failure without a send. On any failed row after all rows were tried: `PartialStepError` (same labels, same `completed` rules, zeroing reported first) with `cause` = `RowWriteError(firstError, partial, landed, total)` for the zero phase / the first raw error for the delete phase, and `detail` = "N of M … (K failed after retries; running the clean-up again is safe, it skips the rows already done)". Rerun is safe: `zeroCostsFilter` selects `vsb_cost ne 0`, the delete filter re-reads what is left. No "Resume" button (owner undecided). `cleanUpForecastCosts` got an optional 4th argument `{ sleep?, client? }` (test seams; `Screen.tsx` unchanged).
- AD-03: not `mapLimit`: a single module-level `createGate(HAS_CONTRACTS_POOL_WIDTH = 6)` over `hasContractsPooled`, because the checks are separate TanStack queries. Failure per id unchanged (each query rejects alone and frees its slot). The delete guards (`deleteCapexSubaccount`/`deleteCapexAccount`) keep calling `hasContracts` directly (fresh, ungated). The `refetchOnWindowFocus` / staleTime option (AD-03b) NOT done (held decision DEC-F).
- AD-06: after a toggle, `reloadGatesSlice` re-reads only templates (gate toggle) or approvals (task toggle) via `repo.reloadSlice(kind, country, tech, cachedDataset)`, reusing header, checklist tasks and the other half; only PMs not yet resolved go to Entra. N quick clicks: a settling toggle that is not the LAST in flight (counted by `togglesInFlight`, because TanStack still counts a mutation as pending inside `onSettled`) only records its slice; the last one reloads; a reload already running is awaited and slices recorded meanwhile are reloaded once after it (never two reloads side by side). Falls back to the old full `invalidateAfterGatesWrite` when there is no cached dataset or any slice read fails. `qk.adminChecklistLocks` is still marked stale. The other save / reset / delete hooks keep the full invalidation. NOT changed: the rollback snapshot (`onError` restores `previous`), which can still undo a sibling's optimistic flip (audit mentioned it; outside the task text).
- AD-08: CAPEX create's "set inactive" and the Check List task create's status follow-up are a plain PATCH (`updateRecordJustCreated`, still `loggedCall("update")`, 404 mapped to `RecordGoneError`, so `inactiveError` / `TaskStatusNotSetError` semantics are intact). Order, flow-firing writes and the guarded update of order / delete / edit are untouched. Residual (DEC-7 class): a row deleted by another user within milliseconds of the POST would be re-created holding only the status columns on SDK 1.3.1 (the SDK 1.5 `If-Match: *` closes it).
- AD-09: one read `list OPEX & Land Lease standard assumptions` with `OPEX_SELECT + statecode` and only the scope filter, split on `statecode === 0` client-side; both hooks use `qk.adminCostOpex(scope)` and `select`. DIVERGENCE (failure coupling): one failed read now fails both halves (before, the inactive read failed alone). The audit says S6-12 was skipped on purpose in D160 §10 for that coupling; the task brief asked for it behind a switch, so it is here, default on; the owner can turn it off. The focus-refetch part (NO_FOCUS_REFETCH) is NOT done (DEC-F).
- AD-12: `loadCapexHierarchy` builds from `loadCapexChartRows()` (same ACTIVE rows and 5 columns; `buildCapexHierarchy` re-sorts). Differential test over three input orders.
- AD-11: `costsWriteKeys(kind, scope, {cascade})` / `contractsWriteKeys(scope, {cascade})`. Only `useDeleteDevexCost` and `useDeleteContract` pass `cascade: true`. DEVEX: + `costBookAll`, `capexTotalsAll`, `addCostSheetAll`, `devCoCapexCosts`, `devCoCapexContracts` prefixes (same list `capexAccountsWriteKeys` uses for `vsb_capexcosts`). Contracts: + `["contracts"]`, `["paymentTargets"]`, `["devCoLinks"]` prefixes (the set `contractInvalidations` uses). 0 requests until a project screen is open.
- Not in scope, untouched: AD-02, AD-04, AD-07, AD-10.

### (b) Switches (all in `src/data/adminFlags.ts`, `ADMIN_OPT`, all default true)

- `CLEANUP_RESILIENT`: off = the old fail-fast `updateRowsEach` + `countedForEach`, no retry, old detail text.
- `ADMIN_DELETE_ALREADY_GONE_OK`: off = a 404 on an admin delete fails again (`deleteRecord`).
- `ADMIN_HAS_CONTRACTS_POOL`: off = all contract checks at once. Width constant `HAS_CONTRACTS_POOL_WIDTH = 6`.
- `ADMIN_GATES_NARROW_RELOAD`: off = full dataset invalidation after each pill click.
- `ADMIN_NO_REDUNDANT_EXISTS`: off = guarded update (existence read) for the follow-up writes.
- `ADMIN_SCOPE_READS_ONCE`: off = two OPEX reads and the hierarchy's own read (AD-09 + AD-12 share one switch, as the brief listed).
- `ADMIN_CASCADE_INVALIDATE`: off = delete invalidates only the standard-assumption keys.

### (c) Tests added (ids, files)

- `src/data/adminRowWrites.opt.test.ts`: UT-ROWW-OPT-001..017 (17).
- `src/data/adminCapexAccounts.cleanup.test.ts`: UT-ADCLEAN-001..018 (18): 429-on-row-k for zero and for delete, 400 not retried, counts, 404 = done, persistent 429, no-status retry, both fail, switch off, peak 8 / 16, differential on/off, gated checks peak <= 6, failure per id, pool off.
- `src/data/adminCost.scope.test.ts`: UT-ADCOST-ONCE-001..009 (differential of the combined OPEX read, one request with `$select`, hierarchy differential over three orders, OPEX deletes 404 / 403).
- `src/features/admin/admin-gates-approvals/hooks.narrow.test.tsx`: UT-ADGATE-NARROW-001..009 (9).
- `src/features/admin/admin-cost/hooks.scope.test.tsx`: UT-ADCOST-HOOK-001..005 (5).
- Added to existing files: `adminInvalidation.test.ts` UT-INV-D1..D5; `adminDefaultChecklists.test.ts` UT-ADCHK-015b..015e; `adminCapexAccounts.test.ts` UT-ADCAPEX-016b, 036b; `admin-capex-accounts/Screen.test.tsx` UT-ADCAPEX-931b.
- Existing tests changed because they pinned behaviour I changed (all default-on): `adminCapexAccounts.test.ts` (mock now also overrides `updateRowsSettled` and `updateRecordJustCreated`, exports `guardedCall`, no-op retry sleeper, flags reset per test; UT-ADCAPEX-016 now runs with `ADMIN_NO_REDUNDANT_EXISTS` off, 036 expects the new detail text), `adminCost.test.ts` (the `./adminRowWrites` mock spreads the real module so `deleteRowIfPresent` runs), `admin-capex-accounts/Screen.test.tsx` (931, 932 run with `ADMIN_NO_REDUNDANT_EXISTS` off; flags restored in `afterEach`).

## capex: CAPEX / Add Cost request savings (T-06, T-20, T-09 part, T-32 part)

### (a) Per finding

| Finding | Task | Status | Files |
|---|---|---|---|
| CA-03 hold the tab while deferred deletes / reconcile are pending | T-06 | DONE | `data/pendingDeletes.ts` (registry takes/gives back the shared `holdBeforeUnload` hold), `data/capexOptFlags.ts` |
| CA-05 paid toggle / panel save / panel delete patch the cached book instead of a whole-book reload | T-20 | DONE (Add and Edit both patched; per-case fallback to the reload, see below) | NEW `features/cost/costing/capexBookPatch.ts`; `features/cost/costing/useCostBook.ts` (`useCapexWrites` only); `data/capexWrites.ts` (`onWritten`, `PanelSaveWritten`) |
| CA-06 Add Cost Save: Summary totals not refetched twice | T-20 | DONE (`refetchType: "active"`, not `"none"`) | `features/cost/costing/useCostBook.ts` (`useSaveAddCostSheet.invalidate`) |
| CA-08 SPV/DevCo mapping through `sharedRead` | T-20 | DONE; no in-session writer exists, so `invalidatePayerDefaults()` is exported but called by nobody | `data/costBook.ts` |
| CA-09 comments in the payments wave | T-20 | DONE | `data/costBook.ts` (`onContracts` callback), `features/cost/costing/useCostBook.ts` (`prefetchCapexComments`, `capexCommentsKey`) |
| CA-15 comment deletes overlap | T-20 | DONE | `features/cost/capex-costs/CommentsPanel.tsx` (`mapLimitFirstFailure`, 4 wide) |
| CA-16 WTG count only when a per-WTG standard contract exists, only the used column | T-20 | DONE | `features/cost/costing/useCostBook.ts` (`useStandardAssumptions`), `features/cost/capex-costs/Screen.tsx` (`addStandardContract`), `features/cost/capex-costs/standardContracts.ts` (`isPerWtgUnit`), `data/standardContracts.ts` (select only; in T-20's affected list but not in my explicit "You own" list) |
| CA-07 panel Add keeps its ids across a retry | T-09 part | DONE (see the honest limit below) | `data/capexWrites.ts` |
| CA-12 Edit sends changed contract columns | T-32 part | DONE (a conservative subset) | `data/capexWrites.ts` (`contractUpdateBody`), `features/cost/capex-costs/Screen.tsx` (passes `storedLine`), `features/cost/costing/useCostBook.ts` (arg type) |

###### How each works / decisions taken
- **CA-03.** `createPendingDeletes(hold?)`; the app's registry passes `() => holdBeforeUnload()` (when `HOLD_TAB_FOR_DEFERRED_DELETES`). The hold is taken when the first Save is registered (also a Save with no deferred id: its reconcile is pending) and given back when the last one is released. `useSaveAddCostSheet` already adds on resolve and releases in `followBackgroundDeletes` after `result.background` (which includes the reconcile), success or failure. WS-F's `backgroundSave.ts` already used the same shared reference-counted helper (`@/components/beforeUnload`), so nothing needed extracting there; `BACKGROUND_SAVE` is untouched (false).
- **CA-05.** `useCapexWrites.onSuccess` of the three mutations calls `patchBook(category, patch)`: `setQueryData` on `["cost-book", project, writtenOn]` (a book read still in flight is cancelled first so its pre-write answer cannot land over the patch). If patched, the book is NOT reloaded and `invalidate(..., skipBook)` refreshes only the other keys of the job (totals, DevCo, comments) exactly as before. Paid job: no invalidation at all. The failure path (`onError`) is unchanged (full reload). The patch functions return `null` ("cannot prove equal to a reload") and the caller then reloads as before for: the line or payment is not in the cached book; a non-integer amount or contract total (stored column precision); a NEW line whose description ties with another line of its sub-account (the grid keeps fetch order among equal descriptions); a NEW line outside the category; a link without name/order; and the per-row path (it reports nothing). Differential tests use the real `loadCostLines` as the oracle. Assumption to check on DEV: a NEW contract's `vsb_iseditedfrompcf` defaults to No (the patch sets `editedFromSpreadsheet: false`).
- **CA-06.** Totals use `refetchType: "active"` rather than `"none"`: a Summary tab that is mounted still refreshes (also on the second invalidation after the deferred deletes), which `"none"` would leave stale. Not mounted (the normal case: the Save returns to a category tab) = marked stale, read once on the next visit.
- **CA-08.** 5-minute memo (`PAYER_MAPPING_MEMO_MS`), in-flight sharing, a failed read is never remembered. The returned `Map` is shared (no caller mutates it).
- **CA-09.** The data layer has no query client, so `loadCostLines` takes an optional `onContracts(ids)` called right after the contract list returns (before the payments request). The hook's book `queryFn` passes it for a CAPEX tab (category >= 0) and starts `prefetchQuery(["capex-comments", sortedJoinedIds], staleTime: Infinity)` (= only when that key holds no data, so a post-save reload never re-reads threads the cache has). Ids of contracts whose delete is still pending are left out, so the key equals the screen's (`useCapexComments`). `capexCommentsKey()` is now the one definition of the key.
- **CA-15.** `mapLimitFirstFailure(deletedIds, ..., 4)`: stops starting deletes after a refusal and throws the lowest-index failure; creates/edits stay strictly sequential after all deletes (CA-18 rule kept).
- **CA-16.** The count query is enabled only when the category's loaded assumptions contain a per-WTG unit. `useStandardAssumptions` also returns `activeWtgCountReady` and `ensureActiveWtgCount()`; `addStandardContract` waits for it (one read or the cache) and re-runs with the count if a per-WTG click comes before the lazy read landed, so a per-WTG amount is never computed with 0. (A failed read still books with 0, as before.)
- **CA-07.** `createContract` sends `vsb_capexprojectcontractid` = the panel's client-minted line id (GUID only). `saveCostLineBulk` keeps, per new contract id, the month ids of a failed attempt (`addLedger`, max 20 entries, dropped on success). On a RETRY of the same Add (the ledger entry has a prior attempt) it reads existing ids (`existingIds`, 1-2 reads, only on a retry): a contract that landed is not created again, and month rows that landed go as `UpdateMultiple` instead of a `CreateMultiple` the server would refuse. First attempt: no extra request. The save's failure messages are unchanged. HONEST LIMIT: in today's UI the panel closes before the write and the user's input is gone, so no UI path re-sends the same Add; this protects any retry that reuses the same line id (a future retry button, a mutation retry) and makes the contract id equal the client id. The book/patch use the id the response returns, so if the SDK or server ignored the client id the behaviour degrades to the old one.
- **CA-12.** An Edit with `storedLine` (the contract as the panel opened it) omits these columns when unchanged: `vsb_applyvat, vsb_depreciation, vsb_distribution, vsb_distributionscheme, vsb_distributionfrequency, vsb_totalcost, vsb_isstandardcontract`, `vsb_costtype` (only when the stored Cost Type was explicit, `costTypePayer`), and the Linked Cluster bind when linked and unchanged. ALWAYS sent: `vsb_name`, `vsb_description` (the canvas writes both; the stored description is usually empty), the two JSON columns and `vsb_averagepayment` (the line cannot vouch for the stored text), and the Linked Cluster `null` bind when unlinked (it also clears a stale link to a deactivated state). Flow/plug-in check against `04-flow-inventory.md` (verified section): server-triggered steps are on `vsb_projectdefaultchecklists`, `vsb_projectstatetracking`, `vsb_project` (created / `vsb_clusterstate` / plant capacity / dates), `vsb_balancingprice`, `vsb_bopcontractsstandardassumptiondevcocosts`, plus DELETE plug-ins on the two standard-assumption tables. None is triggered by, or reads, an update of `vsb_capexprojectcontract`, so no omitted column feeds a flow trigger or filter. Not verifiable from the repo: Fabric/Synapse change tracking or a BI refresh keyed on `modifiedon` of the contract (a contract PATCH with fewer columns still updates `modifiedon`).

### (b) Switches (all in `src/data/capexOptFlags.ts`, default true; false = the old path)

| Switch | Off does |
|---|---|
| `HOLD_TAB_FOR_DEFERRED_DELETES` | no `beforeunload` prompt for deferred deletes |
| `CAPEX_PATCH_BOOK` | paid / save / delete reload the whole category book (awaited), `onWritten` not passed |
| `ADDCOST_LEAN_REFRESH` | totals `refetchType: "all"` after an Add Cost Save |
| `SPV_MAPPING_SHARED` | mapping read on every call |
| `COMMENTS_WITH_PAYMENTS` | comments start after the book resolves (no `onContracts` passed) |
| `COMMENT_DELETES_OVERLAP` | comment deletes one await after another |
| `WTG_COUNT_STANDARD_ONLY` | count read on every CAPEX tab; select includes `statecode` |
| `PANEL_STABLE_ID` | server chooses the contract id; month ids minted per attempt; no retry reads |
| `PANEL_CHANGED_CONTRACT_COLUMNS` | whole column bag on every Edit |

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

## pma: Generators, Production, Revenues, Finance (T-05, T-22, T-32 part)

### (a) Per finding

| Finding | Status | Files changed |
|---|---|---|
| PA-02 (T-05) Finance registers the default bulk backend | DONE | `data/financeBulk.ts` (+ `data/financeBulk.registration.test.ts`) |
| PA-05 flow beside the Identify reads | DONE (4 call sites: WTG type delete, PV type delete, WTG replace, PV replace; inverter / substructure delete have no reads, nothing to overlap) | `features/pm/generators/flowBesideReads.ts` (new), `Screen.tsx` |
| PA-08 Production reload does not re-read yields | DONE (job 1 seeds the yields the roll-up read and skips that key; generation job reloads only the project copies) | `features/pm/production/hooks.ts` |
| PA-09 type add / delete / replace refetches turbines once | DONE | `features/pm/generators/reload.ts` |
| PA-10 lean id-only type reads; Finance reuses cached list | DONE | `data/generators.ts` (3 lean reads), `data/production.ts`, `data/finance.ts`, `features/pm/finance/hooks.ts` |
| PA-15 O&M guard in one read | DONE (single read through the cost's device-type lookup; falls back to the two reads if the server refuses it) | `data/generators.ts` |
| PA-03 (T-32 part) Finance tranche Save writes changed rows only | DONE | `features/pm/finance/rules.ts`, `data/finance.ts` (readers), `features/pm/finance/Screen.tsx` (passes the switch), `data/financeFlags.ts` |
| PA-12 persisted catalogue key scoped by environment + user | DONE, `persistCatalogue` stays OFF | `data/generatorCatalogueCache.ts`, `features/pm/generators/hooks.ts` |

Details worth knowing:
- PA-05: the plan builder is still called only after BOTH the flow and the reads have settled (`Promise.allSettled`), so the D97 order "flow completes before any delete" holds. Error precedence keeps the old order (deletes: flow error first; replaces: reads error first). The helper lives in its own module (`flowBesideReads.ts`) because the Screen tests replace `./hooks` whole. Behavioural difference to be aware of: for a REPLACE the old order was reads-then-flow, so a failed Identify read meant the flow never ran; now the flow may already have cancelled the open permission request when the reads fail (the user retries the replace; for deletes the old order already had the flow first).
- PA-08: only the YIELDS key is skipped (seeded with `setQueryData` from the roll-up's own read, which is made after the action's writes and before the roll-up writes only project columns). Project, stored seasonality, stored negative prices and the Milestones / General Data copies still reload. Applied only when the roll-up actually read (`onWritten`); a refused action write, or a roll-up that failed before keeping its read, reloads `productionAll` as before. Generation job: `[production project, milestoneProject, generalDataProject]`.
- PA-09: for kinds `addWtgType`, `deleteWtgType`, `replaceWtg` the `turbines` prefix is marked stale-only (`PlanJob.staleOnly`, existing `usePlanWrite` feature) instead of refetched; the key change after the types reload fetches the turbines once. `onWritten(false)` (failed / refused / part-way save) switches the job back so the turbines refetch as before. Measured in a test with real hooks: initial read + 1 (was initial + 2).
- PA-10: Production's pre-write reads stay LIVE (OPT-24); only the `$select` shrinks (types: id; turbines: id + name). Finance: `countActiveTurbines(projectId, cachedTypeIds?)`; the hook passes the cached Generators `types` list only when it is as fresh as the visit (same rule as `useVisitStaleTime`, D109), otherwise the ids are read alone. It never fetches the full list into the cache.
- PA-15: finding verified. `SDK getAll` has no `$expand`, so the single read filters the O&M costs through the navigation property `vsb_DeviceTypeInProject` (verified in `_extracted/VSBCloud/customizations.xml`: relationship `vsb_opexprojectcost_DeviceTypeInProject_vsb_d`, nav `vsb_DeviceTypeInProject`) with only plain `_vsb_typeinprojectid_value` / `statecode` of the bridge row (not the polymorphic navigation). The result is `{ hasActiveDeviceType: hit, hasActiveOpexCost: hit }`: the only consumer (`capacityGuardReason`) uses the conjunction of the two flags, which is identical to the old answer. NOT run against DEV (no network): see (f).
- PA-03: skips an existing row only when the stored value is KNOWN and equal (`storedAmount` null-faithful for repayments; `hasBlank === false` for step-ups; absent => written). New rows, changed rows, deletions and the tranche write are unchanged. Repayment: compares the amount (name and year column are determined by the year that matched the row). Step-up: compares order, start year, duration, margin (the name is `<DurationYY> - Value` and DurationYY = start year + duration).
- PA-12: entry key is now `<environmentId lower-case>.<hash of user object id>:<FID>`; unknown environment or user => no read, no write. The flag is untouched (OFF). Old unscoped entries are never read.

Findings not changed / evidence: none of the eight was wrong or already fixed. PA-11, PA-01, PA-13, PA-04, PA-14, PA-06, PA-07 untouched (not mine).

### (b) Switches added

| Switch (task name) | Field | File | Default | OFF does |
|---|---|---|---|---|
| PMA_FLOW_BESIDE_READS | `flowBesideReads` | `data/generatorsPerfFlags.ts` (`GENERATORS_PERF`) | true | flow and Identify reads one after the other, old order per call site |
| PRODUCTION_LEAN_RELOAD | `productionLeanReload` | `data/generatorsPerfFlags.ts` (Production has no flags module of its own) | true | every Production job reloads `productionAll` (+2 copies), yields re-read |
| TURBINES_REFETCH_ONCE | `turbinesRefetchOnce` | `data/generatorsPerfFlags.ts` | true | add/delete/replace type reload the turbines under the old key and the new key |
| TYPE_READS_LEAN | `typeReadsLean` | `data/generatorsPerfFlags.ts` | true | full type / turbine lists in Production's pre-write reads; Finance reads the full list |
| OM_GUARD_ONE_READ | `omGuardOneRead` | `data/generatorsPerfFlags.ts` | true | device-type read then O&M read, sequential |
| FINANCE_CHANGED_ROWS_ONLY | `changedRowsOnly` | `data/financeFlags.ts` (`FinancePerfFlags`) | true | every repayment and step-up row written (canvas ForAll Patch); the plan input `changedRowsOnly` defaults to false in `planTrancheSave`, the Screen passes `financePerf().changedRowsOnly` |

No change to `bulkSchedules` (off), `persistCatalogue` (off) or any bulk / delete flag. PA-02 has no switch (pure registration).

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

## boot: boot prefetch, Planning, warm-up (T-23 part, T-07)

### (a) Per finding

| Finding | Status | Files |
|---|---|---|
| PB-03 boot prefetch of PM screens' first reads | DONE for Check List, Team, Planning, Grid Operator, Milestones | `app/bootPrefetch.ts`, new `app/pmScreenPrefetch.ts`, new `features/pm/planning/queries.ts`, new `features/pm/grid-operator/queries.ts` (+ both hooks.ts now use them) |
| PB-06 `vsb_countries` one key | DONE inside my files (3 of the 4 readers). The 4th (General Data's `qk.generalDataCountries`, `data/generalData.ts`) is not mine: see (e) | `data/countries.ts`, `features/pm/project-main/queries.ts`, `data/currentUser.ts`, `app/useCurrentUser.ts` |
| PB-07 roles/teams by Entra id | NOT DONE, on purpose (could not be proven from the repo): see below | none (switch `CURRENT_USER_BY_ENTRA` declared, default false, nothing reads it) |
| PB-08 env-var reads together | DONE | `data/project.ts` |
| PB-10 Planning / Grid Operator one key | PARTLY: one shared key done; "do not re-read `vsb_projects` when the session row holds the columns" NOT done, with evidence below | new `data/planningProjectKey.ts`, `features/pm/grid-operator/{hooks,reload,queries}.ts`, `features/pm/planning/{hooks,queries}.ts` |
| PB-05 / T-07 Planning create once | DONE | new `features/pm/planning/seedOnce.ts`, `planning/hooks.ts` |
| PA-11 / PB-09 warm-up lazy | DONE (switch default OFF = today's behaviour) | `app/generatorsWarmup.ts` |

###### PB-07 not done (evidence)
`ProjectDocs/reference/dataverse-attributes.json` has no `systemuser` entry (it lists 23 `vsb_*` entities only), so the column is not proven there. The repo does filter `systemusers` by `azureactivedirectoryobjectid` at the top level (`data/currentUser.ts` readUserRow, `data/projects.ts`), so the column exists and is filterable there. What is NOT proven anywhere in the repo is the lambda form `systemuserroles_association/any(o:o/azureactivedirectoryobjectid eq <id>)` (every existing lambda uses the primary key, `o/systemuserid` or `o/teamid`), and the audit itself says server acceptance is unverified. Per the task rule I changed nothing. Proposed change when the owner verifies it on DEV: in `loadBadgeScope` start the direct-roles and teams reads at t0 with the Entra id (guid-quoted) instead of the `systemuserid`, gated by `CURRENT_USER_BY_ENTRA`; the chain then is user row beside roles/teams, teams -> team roles = 2 waves instead of 3. DEV check: one request to `roles` with the `azureactivedirectoryobjectid` lambda must return 200 and the same role set as today.

###### PB-10: second half not done (evidence)
The session row (`loadProject`, scope `pm`) selects 21 columns but lacks `vsb_netyieldp50`, which Planning's and Grid Operator's `PlanningProject` carry (`PROJECT_COL.netYieldP50`); widening needs a new field on `ProjectContext` (`features/cost/contracts/rules.ts`, not mine). Also the canvas re-reads the project on every visit (`OnVisible`) and the session row is cached 5 min, so deriving the screen's row from it would show up to 5 min staler data after a General Data / Milestones save than today. The other PM screens (Team, Check List, Milestones, General Data, Revenues, Finance) each select their own columns in files that are not mine. Not forced; the shared key is done (Planning -> Grid Operator inside 30 s now reads the row once).

### (b) Switches (all in `src/data/bootDvoptFlags.ts`)

| Constant | Default | OFF does |
|---|---|---|
| `BOOT_PREFETCH_SCREEN_READS` | true | boot prefetch starts only the session project for a PM deep link (as before) |
| `COUNTRIES_ONE_KEY` | true | Overview keeps `["countries"]` + `statecode eq 0` read; `adminCountries` keeps the narrow select (no BU columns); the user's map keeps its own unkeyed read |
| `CURRENT_USER_BY_ENTRA` | false | not implemented, nothing reads it |
| `ENV_VARS_TOGETHER` | true | definitions first, then values by definition id (two waves) |
| `PM_PROJECT_ROW_SHARED` | true | Grid Operator uses `qk.gridOperator(id,"project")` (own key, two reads) |
| `PLANNING_CREATE_ONCE` | true | seeds run in every query-function run, no re-check read (old code kept verbatim) |
| `GENERATORS_WARMUP_LAZY` | **false** | (false = today's 1.5 s timer) true = starts on hover/focus of the Generators rail entry (`data-testid="rail-GeneratorKey"`, document-level listeners, no LeftNav edit) or after `GENERATORS_WARMUP_IDLE_MS` = 20 s |

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

### (a) Per finding

| Finding | Status | Files changed |
|---|---|---|
| PB-12 Milestones re-pricing | DONE | `src/features/pm/milestones/rules.ts` (generator-type updates = one `together(..., {stopOnFailure:true})` group, plant-cost PATCH stays after it), `src/data/milestones.ts` (price-ladder chunk reads via `mapLimit`), NEW `src/features/pm/milestones/milestonesPerfFlags.ts` |
| PB-13 trackings once | DONE | `src/features/pm/checklist/hooks.ts` (`reusableTrackings`, used by `prepareCluster` only), `src/data/checklistPerfFlags.ts` |
| PB-14 back-fill guard + group | DONE (see decision note) | `src/data/checklist.ts` (`existingTrackingIds`), `src/features/pm/checklist/rules.ts` (`planSkippedClusterBackfill` opts, `backfillUpdateIds`), `hooks.ts` (`backfill`), `checklistPerfFlags.ts` |
| PB-15 GD cancel reuses cache | DONE | `src/features/pm/general-data/hooks.ts`, NEW `general-data/gdPerfFlags.ts` |
| PB-16 one Entra person cache | DONE | `src/data/personCache.ts` (the one implementation), `src/data/checklistPeople.ts` (delegates), `general-data/hooks.ts` (`useEntraPeople`). `src/data/team.ts` needed NO change (it already calls `lookupPeopleCached`, now backed by the shared store). |

Details worth knowing:
- PB-12: `loadRepricing` already ran the inflation read and the generator read together; the new parts are the N type PATCHes (the real win: N-1 round trips) and the 40-id ladder chunks inside `listProjectGeneratorsForRepricing` (usually one chunk, so a gain only for more than 40 generator types). `stopOnFailure` keeps "a failure stops the save before the plant-cost PATCH" (tested through the real `executePlan`).
- PB-13: `prepareCluster` reuses `qk.checklist(id,"trackings")` data only when it is a success, idle (not refetching), NOT invalidated, and `Date.now() - dataUpdatedAt <= 2000 ms` (`TRACKINGS_REUSE_MS`). Every write job (Move, Reset, Request/Cancel approval, back-fill, patchRow) keeps its own fresh `listChecklistTrackings` (C6 untouched). The rows COUNT is still a fresh read (D138). A write invalidates the query, so the next visit reads fresh.
- PB-14: DECISION taken from the task text ("write only rows that exist"): an update for a tracking that no longer exists is SKIPPED (with its log line) and a `warning` trace is printed; it is not refused with `RecordGoneError` as T-01's text for Land Lease / OPEX does. Creates stay creates. The existence read is skipped when the plan has no updates (fresh project) or no work. The seven writes are one concurrent group (`stopOnFailure`): only the Draft row is In Progress, the only value `SynchroniseProjectState` acts on, so no server automation depends on the order. The switch reverts it.
- PB-15: uses `qc.fetchQuery({queryKey: qk.checklistGates(country, tech), queryFn: listChecklistGates})` with NO staleTime override, so the app default (30 s, `app/Providers.tsx`) applies exactly as for the Check List's own `useQuery`. Only when the Check List `scopedGates` switch is on (else its key is per project). The flow call and payload are unchanged; a failed read is still swallowed and traced as before.
- PB-16: `lookupPersonShared(owner, id, ask, {ttlMs, keepEmpty})` is the single implementation. Per caller: Team = 30 min `PERSON_CACHE_MS`, empty not kept; Check List = `freshMs()` (30 s, 30 min with `longPeopleCache`), empty kept (as before); General Data = Team's rules. A hit needs `age < caller TTL`, and an entry known to be empty is not reused by a caller that does not keep empties. With the switch off each screen has its own store (old behaviour) and GD reads `getEntraPeople(ids)` uncached.

### (b) Switches

| Name | Where | Default | OFF does |
|---|---|---|---|
| `MILESTONES_REPRICE_TOGETHER` | `features/pm/milestones/milestonesPerfFlags.ts` (`setMilestonesRepriceTogether` seam) | true | type PATCHes and ladder chunk reads one after the other (old plan, no `concurrent` flags) |
| `CHECKLIST_TRACKINGS_ONCE` (field `trackingsOnce`) | `data/checklistPerfFlags.ts` | true | `prepareCluster` lists the trackings again |
| `CHECKLIST_BACKFILL_GUARD` (field `backfillGuard`) | `data/checklistPerfFlags.ts` | true | no existence read; sequential unguarded upserts |
| `GD_CANCEL_REUSES_CACHE` | `features/pm/general-data/gdPerfFlags.ts` (`setGdCancelReusesCache`) | true | gate rows + Entra read on every cancellation |
| `ONE_PERSON_CACHE` | `data/personCache.ts` (`setOnePersonCache`) | true | separate Team / Check List stores; GD `useEntraPeople` uncached `getEntraPeople(ids)` |

`CHECKLIST_PERF_ALL_OFF` includes the two new fields (false). The existing `checklistPerf.test.ts` (all ON / all OFF / same keys) passes unchanged.

### (c) Tests added (ids)

- `src/features/pm/milestones/rules.test.ts` (appended): UT-MSTONE-DVOPT-001..005 (plan grouping, differential ON/OFF, no-reprice plan, real `executePlan` run, failure injection: a failing type update stops before the plant-cost PATCH).
- `src/data/milestones.reprice.test.ts`: UT-MSTONE-DVOPT-101..103 (3 chunks side by side, peak 3 / OFF peak 1 / same result).
- `src/features/pm/checklist/rules.test.ts` (appended): UT-CHKLST-DVOPT-001..005 (differential old plan, vanished tracking not updated, all gone, `together`, idempotent).
- `src/data/checklist.existing.test.ts`: UT-CHKEXIST-DVOPT-001..004 (one request, key-only select, chunking, no ids, failed read).
- `src/features/pm/checklist/hooks.dvopt.test.tsx`: UT-CHKDVOPT-001..007 (trackings reuse, OFF, too old, write invalidates, `reusableTrackings` table, write jobs still fresh) and 010..015 (guarded + grouped back-fill, vanished row, creates only, OFF, failed existence read writes nothing, nothing to do).
- `src/features/pm/general-data/hooks.dvopt.test.tsx`: UT-GDDVOPT-001..005 (cancel reuses / reads / stale / OFF / failure) and 010..012 (shared person cache, OFF, failure not remembered).
- `src/data/personCache.shared.test.ts`: UT-PERSON-DVOPT-001..011.

No existing test had to be changed.

## t11: retry layer adopted in write paths (T-11)

### (a) Per finding

| Finding | Status | Where |
|---|---|---|
| WE-02 (no retry of a single-row create/update/delete on 429/5xx; engine and admin loops) | DONE | `client.ts` (`deleteRecord`, `updateRecordIfExists`), `executePlan.ts` (single create / update / plain delete / guarded update), `adminRowWrites.ts` (`createRowsEach`, `updateRowsEach`, `updateRecordJustCreated`, `deleteRowIfPresent`) |
| CA-01 (Add Cost / CAPEX bulk writes and their verify reads never retried on 429) | DONE for the transport, the per-row fallback, the deep insert and the verify reads | `bulkSend.ts` (`bulkTransport`, `upsertEachRow`, `deepInsertContracts`, `existingIds` via `idRows`), `generatorsBulk.ts` (per-row after a 501, guard read), `verifyGone.ts` |
| CA-17 (verify reads ungated) | DONE as wiring: every verify read is `sendWithPolicy("read")`, which takes `requestGate.runRead` when `GLOBAL_GATE` is on (test UT-BULKPOL-033). `GLOBAL_GATE` itself stays false | same |
| WE-05 (a retry wait holds a gate slot) | DONE where the policy owns the gate: the policy sits OUTSIDE `saveGate` (bulk transport, per-row upsert, deep insert, Generators per-row), proven by UT-BULKPOL-005. PARTLY for deletes: `deleteOr404` (`addCostSheet.ts`, not mine) holds `contractDeleteGate` / `costDeleteGate` around `deleteRecord`, so a retry wait there holds a delete-gate slot (see (e) 1) | |
| WE-03 wiring | NOT enabled (as instructed) | |

Not changed on purpose: `runPlan.ts` (delegates to `executePlan`), `bulkWrites.ts` (transport injected), `bulkBackend.ts` (contract only), `addCostSheetBulk.ts` (all I/O is injected via `SavePlanDeps`; its reads/deletes reach `existingIds` / `deleteRecord`, which are covered), `concurrency.ts`, `platform/errors.ts` (no change needed), `generatorsBulk.ts` bulk transport (it already has its own jittered `retryDelay` loop outside the gate, batch 1; wrapping it again would double it).

### (b) Switches (`data/requestFlags.ts`, all default **true**)

| Name | Off does |
|---|---|
| `POLICY_CLIENT_WRITES` | `deleteRecord` and `updateRecordIfExists` (when the caller does not pass `policy`) send each request once, as before |
| `POLICY_PLAN_WRITES` | `executePlan` single create/update/plain delete/guarded update send once |
| `POLICY_BULK_TRANSPORT` | `bulkSend.ts` transport, per-row upsert, deep insert and `generatorsBulk.ts` per-row writes send once |
| `POLICY_VERIFY_READS` | `existingIds`, `generatorsBulk` guard read and `verifyGone` read once (no gate either) |
| `POLICY_ADMIN_WRITES` | `adminRowWrites.ts` creates, updates, just-created PATCH and `deleteRowIfPresent` send once |
An explicit `policy` option on `deleteRecord` / `updateRecordIfExists` wins over the default switch (the plan engine passes `POLICY_PLAN_WRITES`, the admin loops `POLICY_ADMIN_WRITES`).

### (c) Tests (new, all green)

- `data/executePlan.policy.test.ts`: UT-PLANPOL-001..016 (429 on row k retried and the plan completes; create not retried after 500 / network; create retried after 429; update retries 503 / network; 3-try cap; 400/403/404/409 never; plain delete 503; delete 404 after a lost answer is done; guarded update read+PATCH; hardened delete not wrapped again (3 requests, not 9); one `[VSB]` line per retry without id or value; differential ON vs OFF with no retry (message, counts, ACTION and DATA lines); switch OFF reproduces the old behaviour).
- `data/client.policy.test.ts`: UT-CLIENTPOL-001..012, 020..024, 030..032 (`deleteRecord`, `updateRecordIfExists`, the nesting marker, `policyOn`, `readPolicyPage`).
- `data/bulkSend.policy.test.ts`: UT-BULKPOL-001..008, 010..012, 020..022, 030..033 (429 chunk retried; 500 / network never; 501 still reaches the per-row fallback; 4-try cap with one DATA line per attempt; the wait holds no write-gate slot; per-row PATCH retry; deep insert create 429 only; verify reads; `GLOBAL_GATE` on takes a read slot).
- `data/generatorsBulk.policy.test.ts`: UT-GENBULKPOL-001..004, 010, 011.
- `data/adminRowWrites.policy.test.ts`: UT-ADMINPOL-001..003, 010..013, 020, 021, 030.
- `data/verifyGone.policy.test.ts`: UT-VGPOL-001..004.
All use injected sleeper and jitter (`setPolicyTestSeams`); nothing waits. Flags are flipped through a `vi.mock("./requestFlags")` with getters.

###### Existing tests I changed (each pins behaviour I changed on purpose, or the mock shape)
1. `data/executePlan.hardened.test.ts`, `data/generatorsBulk.test.ts`: the `vi.mock("./requestFlags")` factory now also lists the five `POLICY_*` switches as `false` (a factory that omits an export throws). They keep pinning the pre-T-11 code; policy-on is covered by the new files.
2. `data/executePlan.test.ts`: the `fail()` helper answers status 400, not 500 (UT-PLAN-003, 018, 027, 028, 034). A 500 on an update is now retried, which would let those "a failure stops the run" tests succeed on the retry.
3. `features/pm/revenues/writePerf.test.ts` (a feature file I do not own; needed to keep it green): `refused()` is HTTP 400, not 500 (UT-REVPERF-020, 021, 023, 105: they pin fail-fast order with a "refused" request; a 500 delete / PATCH is now retried).
No other existing test changed. Note: `vitest` rewrites the line endings of `features/pm/production/__snapshots__/productionPlans.baseline.test.ts.snap` when that suite runs; I restored it with `git checkout` (content was identical).

## t21: Cost reads retry, Land Lease / OPEX / Contracts saves (T-14, T-21)

### (a) Per finding

| Finding | Status | Files |
|---|---|---|
| CA-11 (T-14) the main Cost reads never retry | DONE for the four reads that had `retry: false` (book, **Land Lease book** (the audit's "line 256"), CAPEX totals, Add Cost sheet). No reason is recorded anywhere (decision log, bug register, `optimization/`, git history back to the restructure commit), so no read was kept as deliberate. They inherit the app default (`attempt < 2 && isRetryable`, jittered wait: 2 retries on 5xx / 429 / no status, none on 403 or other 4xx). The Add Cost sheet's "no refetch while editing" protection (`NO_FOCUS_REFETCH`, `refetchOnReconnect: false`) is separate and untouched; a retry only follows a failed fetch, so it never re-hydrates a grid holding edits | `features/cost/costing/useCostBook.ts`, `data/leaseOpexFlags.ts` |
| CB-07 Land Lease tiering | DONE for the D118 follower start-date updates and the period deletes of a contract delete. NOT done: period CREATES of an import (the `createdon` order of an import's periods is a product question, D160 owner decision 1, the same as `OPEX_IMPORT_PARALLEL`). Independence proof: followers' dates come from `planFollowingLeaseStarts` of the SAVED period alone (previous start + duration in memory), never from another follower's written value; they stay a later tier than the saved period's own full-payload update (D160 section 12 kept). Period deletes: different rows, no payload, no parent among them; allocation deletes before, the header delete after (other entity sets, so other tiers) | `features/cost/periods/landLeaseRules.ts` (`leaseWriteTiers(writes, { wider })`, default off, so the pure function alone is still OPT-10), `data/landLease.ts` |
| CB-08 OPEX book re-reads `vsb_opexsubaccounts` | DONE. The scoped OPEX book takes `{id, name}` of the ACTIVE sub-accounts from the cached `["opex-subaccounts"]` entry (`ensureQueryData`: cached answer, joins one in flight, or reads once). The query options are now shared by `useOpexCatalog` and the book | `data/costBook.ts` (`LoadCostBookOptions.opexSubaccountNames`, `loadOpexPeriods`), `features/cost/costing/useCostBook.ts` |
| CB-09 independent awaits in OPEX writes | DONE for two of three, plus one more. (1) head save: the children read starts beside the head PATCH (after the guard), cascade still only after the PATCH succeeded. (2) import: existence check and assumptions read together, the refusal still wins. (3) EXTRA, same finding class: the CB-01 existence guard of an Edit now starts beside the currency and group lookups (it needs neither; the re-chain plan is pure and is worked out first). NOT done: skipping the child query on a child delete (the code comment at `deleteOpexPeriod` deliberately distrusts the in-memory `parentId`; owner to confirm) | `data/periodWrites.ts` |
| CB-11 contract links read after the PATCH | DONE. An edit starts `listDevCoLinks([id])` before `saveContract` and hands the promise to `replaceDevCoLinks` (`existingLinks`). Not for a create, not for Project Rights. A refused save drops it silently; a failing read surfaces inside the same `ContractLinksError` wrap as before | `features/cost/contracts/hooks.ts`, `data/contracts.ts` (`existingLinks`, `DevCoLinkRow`) |
| CB-12 id-set keys read targets and links twice | DONE with "mark stale, no refetch" (the audit's first option). A delete refetches only the contracts and marks `paymentTargets` and `devCoLinks` stale (`refetchType: "none"`); a create does the same for `devCoLinks`; an EDIT keeps the same ids, so its links still refetch under the same key | `features/cost/contracts/hooks.ts` |
| CB-13 two BoP assumption reads | DONE. ONE request (`vsb_contracttypes eq Development or eq Construction`, ACTIVE, `createdon asc`, no `top`), the oldest row per type taken on the client. The two `useBopStandardAssumption` hooks share one query (`[...qk.bopStandardAssumptions(c, t), "both"]`, `select` per type), so the Admin Contract invalidation by the (country, technology) prefix still reaches it. The request site count is unchanged (one shared reader) | `data/contracts.ts` (`findBopStandardAssumptions`, `readBopStandardAssumptions`), `features/cost/contracts/hooks.ts` |
| CB-15 Land Lease write reloads reference rows | DONE for the first two parts of the audit: the 9-row `vsb_landleasesubaccounts` read is remembered for 5 min (`sharedRead`), and the `["cost-book", p, "none"]` invalidation is dropped (nothing reads Land Lease periods from it since B2; it only marked the OPEX screen's cached book stale, which re-reads on every visit). The awaited reload of the Land Lease book itself stays (a cache patch instead needs a product decision) | `data/landLease.ts`, `features/cost/costing/useCostBook.ts` |
| Retry adoption of the Cost writes (T-11) | DONE. New `data/costWritePolicy.ts` (`costWrite(kind, entitySet, fn)`, one helper). Land Lease `WRITERS.*.create/update/remove`; OPEX period create, update, cascade, re-chain, import create, chain delete; Contracts: contract create, update, delete, DevCo link create and delete, payment target create, update and delete. create = `create` (429 only), update = `patchAbsolute`, delete = `delete`. Label = entity set. Query reads NOT wrapped. `LEASE_GUARD`, `OPEX_GUARD`, `STABLE_CREATE_IDS` (stays OFF) untouched | `data/costWritePolicy.ts` (new), `data/landLease.ts`, `data/periodWrites.ts`, `data/contracts.ts` |

### (b) Switches (all in `data/leaseOpexFlags.ts`, next to the batch-1 ones; each `false` restores the old path, which stays in the code)

| Name | Default | Off does |
|---|---|---|
| `COST_READS_RETRY` | true | the four reads use `retry: false` again |
| `LEASE_TIER_WIDER` | true | one period write per tier again (D160) |
| `OPEX_BOOK_REUSES_CATALOGUE` | true | the OPEX book reads `vsb_opexsubaccounts` itself |
| `OPEX_WRITES_TOGETHER` | true | children read after the PATCH; existence check then assumptions; guard after the lookups |
| `CONTRACT_LINKS_WITH_PATCH` | true | links read inside `replaceDevCoLinks`, after the save |
| `CONTRACT_KEYS_ONCE` | true | delete / create refetch the old id-set key too |
| `BOP_ASSUMPTIONS_ONE_READ` | true | two `top 1` reads, one query per type |
| `LEASE_LEAN_RELOAD` | true | the subaccounts are read with every reload; both books are invalidated |
| `COST_WRITES_POLICY` | true | the plain call, no retry |

Equivalence proofs: defaults are all true. The two where the failure shape differs from today (not the result): `LEASE_TIER_WIDER` (a failed follower or period delete may have siblings in flight that land; both states are recoverable: followers heal on the next save, a half-finished period delete finishes on a retry because a 404 counts as done) and `COST_WRITES_POLICY` (a transient failure is now retried instead of shown at once). Product to confirm both, as they were for the D160 allocation divergence.

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

