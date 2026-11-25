# 30 - API Reliability Test Results

> Stage 3 (implementation), 25 Nov 2026. Branch `feature/dataverse-network-performance-optimization`, uncommitted. Source of every section below: the per-agent notes written by the agent that did the work, unedited except for heading levels. Nothing here is a runtime measurement. Unit and failure-injection tests only. The DEV forced-failure runs are NOT done.

## What is covered by tests

The retry matrix of doc 21 (429 retries every kind; transient retries only reads, deletes and absolute PATCHes; a create or bulk call never retries after a 5xx; flows never), jittered backoff bounds with injected randomness, deadline and unknown-outcome handling with fake timers, the global gate peak, no double retry between layers, the CAPEX clean-up under 429/5xx, plan shape checks, and the OFF path equalling the old behaviour (differential tests with the old code kept as `legacy*`).

## What is NOT yet shown

A real 429 or 5xx from Dataverse, a real hung request, the real size of Dataverse's throttle window (probe P-4) and a real host timeout (probe P-5). The backoff, tries and deadlines are initial values to calibrate from that capture.

## core: shared retry policy, deadline, global gate (T-10, T-12, T-13)

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

### (f) Owner decisions and DEV checks

- Calibrate from the T-00 capture (probes P-4, P-5) before changing any default: backoff base and cap, tries (3 / 4), deadlines (60 s / 120 s), gate (40 / 24). Each is one constant.
- Decide whether a bulk 503 WITH a `Retry-After` should stay retried (kept; cannot fire today).
- Decide when to turn `REQUEST_DEADLINES` and `GLOBAL_GATE` on (after callers adopt and the capture sets the numbers).
- On DEV: force a 429 on a Generators bulk save and a 503 or network drop on a hardened delete and count the `[VSB]` retry lines; confirm a read failing twice shows different waits between runs.

## t11: retry layer adopted in write paths (T-11)

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

### (f) Owner decisions and DEV checks

- Confirm the matrix for creates: a create retries only a 429 (a 500 / network failure is never resent). If a bulk or create 429 is judged "not guaranteed unprocessed" on this tenant, set `POLICY_BULK_TRANSPORT` / `POLICY_PLAN_WRITES` off.
- Calibrate tries and backoff from the DEV capture (probes P-4, P-5) before relying on the numbers (4 tries throttled, 3 transient, base 1 s, cap 15 s).
- On DEV, run a throttled save (many parallel Generators or Add Cost saves) and check the retry-line counts equal the injected failures and no row is duplicated (a create after a 500 must show no retry line).
- Decide whether the delete-gate change in `addCostSheet.ts` ((e) 1) is worth doing.

## engine: write-engine shape checks, permission text, census tool (T-15, T-00)

### (c) Tests

- NEW src/data/executePlan.shape.test.ts: UT-PLAN-950..967 (each rejected shape sends nothing even after a valid first write; valid shapes unchanged incl. concurrent runs, groups, bulk refs; switch-off behaviour).
- src/data/usePlanWrite.test.ts: UT-PLANWRITE-004 UPDATED (it pinned "a PlanError wrapper is not looked through"; now pins the permission sentence found inside a PlanError); added UT-PLANWRITE-033..035.
- Updated (expected PlanError -> PlanShapeError because the failure is now raised before the plan starts, same messages): executePlan.test.ts UT-PLAN-004, 006, 013, 016; executePlan.bulk.test.ts UT-PLAN-112. UT-PLAN-028 table-name fix (above).
- NEW src/test/requestCensus.test.ts: UT-CENSUS-001..008, 010..021 (parser on fixtures in the formats of requestLog.ts, summary maths, retry lines, scenario markers, waves with/without timestamps, CLI via child process, no value leak).
- Run: 192 tests in 14 files green (executePlan*, usePlanWrite*, runPlan, ownerBindGuard, requestCensus, controlLabels). Also ran all 56 other test files that import executePlan/runPlan/usePlanWrite (admin, pm checklist/generators/finance/production/revenues/planning/team/grid-operator, adminCost, bulkBackend.registry): 926 passed, 15 skipped, 0 failed. typecheck green, oxlint clean on changed files.

### (f) Owner to decide/check

- Confirm the new 403 text for PM writes (WE-07 is a visible-text change; audit said "needs product decision"). Off-switch ready.
- Capture a real run with DevTools timestamps on to get exact waves; without them the wave figure is an estimate.
- core agent: if its retry line wording changes, check the retry regex (UT-CENSUS-007).

## admin: CAPEX clean-up, admin deletes, fan-out and reloads (T-04, T-24, AD-05)

### (c) Tests added (ids, files)

- `src/data/adminRowWrites.opt.test.ts`: UT-ROWW-OPT-001..017 (17).
- `src/data/adminCapexAccounts.cleanup.test.ts`: UT-ADCLEAN-001..018 (18): 429-on-row-k for zero and for delete, 400 not retried, counts, 404 = done, persistent 429, no-status retry, both fail, switch off, peak 8 / 16, differential on/off, gated checks peak <= 6, failure per id, pool off.
- `src/data/adminCost.scope.test.ts`: UT-ADCOST-ONCE-001..009 (differential of the combined OPEX read, one request with `$select`, hierarchy differential over three orders, OPEX deletes 404 / 403).
- `src/features/admin/admin-gates-approvals/hooks.narrow.test.tsx`: UT-ADGATE-NARROW-001..009 (9).
- `src/features/admin/admin-cost/hooks.scope.test.tsx`: UT-ADCOST-HOOK-001..005 (5).
- Added to existing files: `adminInvalidation.test.ts` UT-INV-D1..D5; `adminDefaultChecklists.test.ts` UT-ADCHK-015b..015e; `adminCapexAccounts.test.ts` UT-ADCAPEX-016b, 036b; `admin-capex-accounts/Screen.test.tsx` UT-ADCAPEX-931b.
- Existing tests changed because they pinned behaviour I changed (all default-on): `adminCapexAccounts.test.ts` (mock now also overrides `updateRowsSettled` and `updateRecordJustCreated`, exports `guardedCall`, no-op retry sleeper, flags reset per test; UT-ADCAPEX-016 now runs with `ADMIN_NO_REDUNDANT_EXISTS` off, 036 expects the new detail text), `adminCost.test.ts` (the `./adminRowWrites` mock spreads the real module so `deleteRowIfPresent` runs), `admin-capex-accounts/Screen.test.tsx` (931, 932 run with `ADMIN_NO_REDUNDANT_EXISTS` off; flags restored in `afterEach`).

### (f) Owner decisions / DEV checks

- Decide if the OPEX failure coupling of AD-09 is acceptable (D160 §10 skipped it on purpose); else set `ADMIN_SCOPE_READS_ONCE` false.
- Still open from the audit: "Retry clean-up" / "Resume" button on the toast (not built); AD-03b / AD-09a (focus refetch, staleTime) are held under DEC-F and untouched.
- DEV check list above. Also check the new detail text reads acceptably in the toast (NEW dvopt string, lives in `data/adminCapexAccounts.ts` `cleanupDetail`, not a canvas string).
- New user-visible strings: only the clean-up toast detail `N of M <what> (K failed after retries; running the clean-up again is safe, it skips the rows already done)` and the extra `; later-year costs: N of M rows were deleted` clause (when both phases fail). Both marked `NEW (dvopt): not a canvas string` in the code comment of `cleanupDetail`.

