# 33 - Code Review and QA Findings

> Stage 3 (implementation), 25 Nov 2026. Branch `feature/dataverse-network-performance-optimization`, uncommitted. Source of every section below: the per-agent notes written by the agent that did the work, unedited except for heading levels. Nothing here is a runtime measurement. Independent review of the first batch (agents core, engine, llopex, admin, capex, pma, boot, pmb) by a reviewer who had not seen the implementers' reasoning. The second batch (t11, t21) has not yet had its own independent review.

## Disposition of each finding (orchestrator)

| ID | Severity | Disposition |
|---|---|---|
| QA-01 | MAJOR | Fixed by switching PANEL_STABLE_ID OFF; the host's acceptance of a client primary key on a plain POST is a DEV check (same as STABLE_CREATE_IDS) |
| QA-02 | MAJOR | Not reachable while PANEL_STABLE_ID is OFF. MUST be fixed (read the contract's landed month rows on retry, or refuse) before the switch is ever turned on |
| QA-03 | MAJOR | Fixed by switching omGuardOneRead OFF; a DEV probe must show identical answers (with and without an O&M cost) before it is enabled |
| QA-04 | MINOR | Fixed: throttled (429) waits use equal jitter on a 2 s base (7 s minimum over four tries); tests updated |
| QA-05 | MINOR | Fixed: the local copy is deleted; the shared isAlreadyGone in client.ts now also reads a status or 0x80040217 anywhere on the cause chain (the local copy covered that real case) |
| QA-06 | MINOR | Fixed: comment states the upsert residual; UT-ADCAPEX-931b now asserts one update, no existence read, no gone message |
| QA-07 | MINOR | Fixed: CHECKLIST_BACKFILL_GUARD (existence guard, on) and CHECKLIST_BACKFILL_TOGETHER (concurrent group, off) are separate switches |
| QA-08 | MINOR | Fixed: applyPlan guards per step when independentSteps is on; whole-plan guard otherwise |
| QA-09 | MINOR | Fixed by switching ENV_VARS_TOGETHER OFF (the Production console gate depends on vsb_EnvironmentName, D164) |
| QA-10 | MINOR | Accepted and recorded: a CAPEX Edit no longer lets 'last writer repair' a stale stored total (CA-12); owner decides knowingly |
| QA-11 | MINOR | Fixed: UT-CHKDVOPT-014b (a failed existence read writes no row, in both group modes); the CAPEX id tests are moot while the switch is off |
| QA-12 | MINOR | Fixed: BOM stripped from useCostBook.ts (it came from a tool edit) |
| QA-13 | NIT | Recorded as a limit to settle before REQUEST_DEADLINES and GLOBAL_GATE are enabled together |
| QA-14 | NIT | Accepted: import-time constants are the stated 'one-line rollback' style |
| QA-15 | NIT | Accepted: registering the same factory is harmless; no switch |

## Full review (verbatim)

## QA batch 1 - independent review of the dvopt change set

Reviewer: independent QA (read-only). Base `HEAD` 30afece, worktree `Project-Management-Energy-WorkDev1-DataverseOptimization`, code in `ProjectCosts-CodeApp\`.
Method: read the diff and the new files of the "go deep" list myself first; implementer notes not used for the verdicts. No test was run (read-only, no full suite).
Paths below are relative to `ProjectCosts-CodeApp\`. Line numbers are of the working copy.

Counts: BLOCKER 0, MAJOR 3, MINOR 9, NIT 3.

---

### MAJOR

#### QA-01 - MAJOR - `PANEL_STABLE_ID` ships ON on the same unproven mechanism that keeps `STABLE_CREATE_IDS` OFF
- `src/data/capexWrites.ts:560-583` (`clientContractId`, `createContract`), flag default in `src/data/capexOptFlags.ts` (`PANEL_STABLE_ID: true`) versus `src/data/leaseOpexFlags.ts` (`STABLE_CREATE_IDS = false // off until a DEV check proves the host accepts a client-supplied primary key on a plain create`).
- What is wrong: both switches rest on one assumption: the generated service `create()` (plain POST, SDK 1.3.1) honours a client-supplied primary key in the body (`vsb_capexprojectcontractid`). The integrator judged that assumption unproven for Contracts / Land Lease / OPEX and turned it off. CAPEX does the identical thing for EVERY new contract (line ids are GUIDs: `crypto.randomUUID()` in `Screen.tsx`), by default. The only previously proven use of client ids is the bulk `CreateMultiple` of the month rows, not a plain POST.
- Failure scenario: (a) host/SDK rejects the key: every CAPEX "Add" fails with a 400, on the primary save path of the screen. (b) host/SDK strips the key silently: the contract gets a server id (the code then uses `created.vsb_capexprojectcontractid`, fine), but `addLedger` / `existingIds(CAPEX_CONTRACTS,[line.id])` look for the minted id, find nothing, and a retry creates a SECOND contract - the pre-change behaviour, now with a false sense of protection. UT-CAPEXSTABLE-001..010 mock the service and accept any id, so they cannot expose either case.
- Fix: make `PANEL_STABLE_ID` default OFF until the same DEV probe that gates `STABLE_CREATE_IDS` passes (one decision for both), or fall back automatically (on a 400 naming the key, re-send without it and log once).

#### QA-02 - MAJOR - Retry of a failed Add reuses the landed contract but never removes month rows the user dropped before retrying
- `src/data/capexWrites.ts:765-830` (`saveCostLineBulk`: `retrying`, `contractLanded`, `landedMonths`, `createsNow/createsLanded`), `withStableMonthIds` (~l. 880).
- What is wrong: after a partial first attempt the contract and some month rows exist. On retry `plan.deletes` is computed from `storedPayments` of the panel, which for a NEW contract is empty, so month rows that landed in attempt 1 but are no longer in the form are neither updated nor deleted.
- Failure scenario: Add a contract Jan-Dec 2027 (12 creates); `CreateMultiple` lands 12 rows but the answer is lost or a later step fails. The user edits the schedule to Jan-Jun and presses Save again. `contractLanded` is true, `landedMonths` holds the Jan-Dec ids, but only Jan-Jun are in `plan.creates`; Jul-Dec stay in Dataverse under the contract. The contract total (from the form) now disagrees with the sum of its cost rows; Summary totals and the book show 6 phantom months. Before the change the retry made a second, correct contract (and left the first as an orphan), so this is a new silent-inflation path.
- Fix: when `contractLanded`, read the contract's existing month rows (ids + year/month) and treat them as `storedPayments` (delete rows not in the plan, update the matching ones), or refuse the retry with "reload and check the contract" when the form differs from the first attempt's plan. Add a test: attempt 1 lands 12 months and fails, attempt 2 sends 6 months, expect 6 deletes.

#### QA-03 - MAJOR - O&M guard (PA-15 `omGuardOneRead`) replaced by an unprobed navigation-path filter, default ON; falls back only on a thrown error
- `src/data/generators.ts:~719-790` (`OPEX_DEVICE_TYPE_NAVIGATION`, `opexOfTypeFilter`, `hasActiveOpexCostOfType`, `loadOpexDependency`), flag `generatorsPerfFlags.ts` (`omGuardOneRead: true`).
- What is wrong: `capacityGuardReason` blocks changing/deleting a type that still has an active O&M cost. The two-read form (device types by type id, then costs by those ids) is replaced by one read of `vsb_opexprojectcosts` filtered through `vsb_DeviceTypeInProject/_vsb_typeinprojectid_value` and `vsb_DeviceTypeInProject/statecode`. The code comment itself says the filter "has not been run against every environment". The fallback to the two reads triggers only when the request THROWS. A filter the server accepts but evaluates differently (wrong navigation-property semantics, a renamed lookup, row-level security on the related row) returns `[]`, which is reported as `{false,false}`: the guard fails OPEN and the user can delete or shrink a type that has live O&M costs, with the cascade that follows.
- Fix: ship OFF until a DEV probe shows identical answers for a type with and without an O&M cost; or, for the first N calls per session, run both forms, log, and use the two-read answer on disagreement. A safety guard should not trade its fail-closed property for one request.

---

### MINOR

#### QA-04 - MINOR - Full-jitter backoff can return 0-100 ms for a 429; the throttle budget is only about 3.5 s
- `src/data/retry.ts` `backoffMs`, `retryDelay` (V2), `THROTTLED_TRIES = 4`, `BACKOFF_BASE_MS = 1000`; `queryRetryDelay`.
- Scenario: Dataverse service protection answers 429 with a `Retry-After` the SDK does not expose (documented in the file header). `random()*1000` on the first retry waits under 100 ms in 10% of cases; later tries wait at most 2 s and 4 s. Bulk writes and deletes can burn all four tries inside the throttle window and fail, where the legacy path waited 1 s, 2 s (deterministic). Reads (`queryRetryDelay`) may also retry sooner than TanStack's default 1 s / 2 s.
- Fix: use "equal jitter" (`ceiling/2 + random*ceiling/2`) or a minimum wait for the `throttled` class and a larger base (about 2-5 s) for 429; keep full jitter for `transient`.

#### QA-05 - MINOR - Duplicate `isAlreadyGone` with different semantics (CONVENTIONS rule 17)
- `src/data/adminRowWrites.ts:~150` (exported `isAlreadyGone`, with `TODO (dvopt integration): replace ... then delete this local copy`) versus `src/data/client.ts` (`isAlreadyGone`, `deleteIfExists`).
- The local copy reads `status` anywhere in the cause chain and regexes `0x80040217` over `JSON.stringify` of every chain element; the shared one checks only `error.status` of a `DataError` and its message. They can disagree (a plain SDK error object thrown directly). The TODO was not done at integration.
- Fix: delete the local copy, import `isAlreadyGone` / `deleteIfExists` from `./client` (make `deleteRowIfPresent` a thin wrapper keyed on `ADMIN_OPT`).

#### QA-06 - MINOR - AD-08 (`ADMIN_NO_REDUNDANT_EXISTS`, ON) reopens the upsert hazard and its test asserts an impossible server answer
- `src/data/adminRowWrites.ts` `updateRecordJustCreated`, `adminCapexAccounts.ts:276-285`, `adminDefaultChecklists.ts` `createTask`; test UT-ADCAPEX-931b mocks `updateRecordAsync -> {status: 404}`.
- With SDK 1.3.1 an update is a PATCH without `If-Match`, i.e. an upsert (the premise of `costUpdateGuard.ts`): Dataverse does not answer 404, it re-creates the row. So `asRecordGone(...)` after this PATCH cannot fire in production. If another admin deletes the freshly created account/task in the few milliseconds between POST and PATCH, an inactive row holding only the status column is re-created (no name, no number, no BU) instead of the "created but has since been deleted" message. The window is tiny and the notes call it a residual, but the test gives false assurance of the 404 mapping.
- Fix: keep the switch but reword the comment and test (assert the documented residual), or keep the read for CAPEX accounts (a chart-of-accounts row).

#### QA-07 - MINOR - `CHECKLIST_BACKFILL_GUARD` bundles two independent behaviours in one switch; the parallel part changes flow-trigger ordering
- `src/features/pm/checklist/rules.ts` `planSkippedClusterBackfill(... {together:true})`, `hooks.ts` (`backfillGuard`).
- The existence guard (good, fail-safe) and the change from seven sequential writes to ONE concurrent `stopOnFailure` group share one flag, so the parallelism cannot be rolled back without losing the guard. Creates of the Cluster 3-6 tracking rows and the updates now race; any server trigger on `vsb_projectstatetrackings` (the notes cite only `SynchroniseProjectState` on the Draft row) sees an unordered stream. After a failure the landed subset is nondeterministic (before: a prefix). A re-run is idempotent, but the user message does not say so.
- Fix: split into `backfillGuard` and `backfillTogether` (default OFF for the latter until a DEV run with the flows on).

#### QA-08 - MINOR - Land Lease guard refuses the whole plan even in `independentSteps` mode
- `src/data/landLease.ts` `applyPlan` runs `await guardLeaseUpdates(writes)` before the `independentSteps` loop.
- FT-BR-LEASE-089 (canvas `Save_1.OnChange`) lets the contract, allocation and period steps fail independently. With the guard, one allocation row deleted by someone else (a WTG removed on Generators cascades its allocations) aborts the contract and period saves too, with the generic gone text. This is the intended CB-01 trade-off, but it is a visible behaviour change that the `LEASE_GUARD` description does not mention.
- Fix: document it, or apply the guard per step so an unrelated step still saves.

#### QA-09 - MINOR - PB-08 environment variables read by definition schema name: silent default on a wrongly empty answer
- `src/data/project.ts` `readEnvironmentVariableValuesByName`, `loadEnvironmentVariables`.
- The fallback to the id-based read happens only when the request is refused. If the server accepts `EnvironmentVariableDefinitionId/schemaname eq ...` and returns no rows, `values` is empty and each variable falls to `defaultvalue`. `vsb_EnvironmentName` decides whether the console is silent in Production (D164). Low probability, high impact (Prod would print to the console).
- Fix: if definitions were found and the by-name read returned zero rows, run the id-based read as well (one extra request only in that degenerate case).

#### QA-10 - MINOR - CA-12 omits `vsb_totalcost` / `vsb_distribution*` from an Edit when the form equals the opened state
- `src/data/capexWrites.ts:517-540` `contractUpdateBody`.
- Intended and mostly safe (a null stored total is not omitted, because `key in before` is false), but an Edit no longer lets "last writer repair" a stored total that went stale because another user changed months meanwhile. The old whole-bag write recomputed it from the editing user's own snapshot, which was equally stale, so this is not a correctness regression; noted so the CA-12 owner decides knowingly.

#### QA-11 - MINOR - Tests that cannot fail on the risky paths
- `src/data/capexWrites.dvopt.test.ts` UT-CAPEXSTABLE-004/005 retry with an IDENTICAL plan; there is no case where the form changed between attempts (QA-02) and none where the mocked service rejects or ignores the supplied id (QA-01).
- PB-14 tests (`rules.test.ts`) exercise the plan builder only; I saw no test that a failed existence read fails the job without writing a row.
- UT-ADCAPEX-931b mocks a 404 on a PATCH (QA-06).

#### QA-12 - MINOR - `useCostBook.ts` now starts with a UTF-8 BOM (diff line 1: `-import` / `+﻿import`)
- Harmless to the bundler but it makes the whole file look modified and breaks tools that read the first token. Strip it.

---

### NIT

#### QA-13 - NIT - `withDeadline` frees the gate slot while the abandoned request is still in flight
- `src/data/requestPolicy.ts` `sendWithPolicy` (`attemptOnce = gated ? gate.run(timed)`): with `REQUEST_DEADLINES` and `GLOBAL_GATE` both on, a deadline rejects the promise and releases the slot, but the SDK request continues, so the real in-flight count can exceed the 40 ceiling. Unused today (both OFF); record it in the doc-21 follow-up before enabling.

#### QA-14 - NIT - Import-time constants cannot be flipped at runtime
- `LEASE_GUARD`, `OPEX_GUARD`, `COST_REFRESH_ON_FAILURE`, `GONE_AS_DONE_LEASE_OPEX` (`leaseOpexFlags.ts`), `RETRY_POLICY_V2`, `REQUEST_DEADLINES`, `GLOBAL_GATE` (`requestFlags.ts`) are `const`s imported by value. That matches the stated "one-line change" rollback and tests use `vi.mock` or an `enabled` parameter, so no defect; the other families (`ADMIN_OPT`, `CAPEX_OPT`, `bootDvopt()`, `planEngineFlags()`) are read at the call. Mixed style only.

#### QA-15 - NIT - `registerDefaultBulkBackend(createGeneratorsBulkBackend)` is now called from `financeBulk.ts` as an import side effect (PA-02)
- A fix not behind a switch (it prevents a throw after a landed write). Re-registering drops a kept default instance, harmless because all three registrants pass the same factory. Mentioned only because it is a behaviour change without a switch.

---

### Switch discipline - verified

| Switch | Declared | Found | OFF path equals old? |
|---|---|---|---|
| `PLAN_PERMISSION_LOOKUP` | OFF | `writePlan.ts` `false`, read through `planEngineFlags()` at the call | yes (the lookup block is skipped, rest of `writeErrorMessage` unchanged) |
| `STABLE_CREATE_IDS` | OFF | `leaseOpexFlags.ts` `false` | yes: `createWithStableId` with `enabled=false` is `unwrap(await create(payload), operation)` with the same operation text; `toContract` / `savedId` get the same row (OPEX: `""` instead of `undefined` if the key were missing, immaterial) |
| `changedRowsOnly` | OFF | `financeFlags.ts` `false`, also in `FINANCE_PERF_ALL_OFF` | yes |
| `flowBesideReads` | OFF | `generatorsPerfFlags.ts` `false` | yes: `cancelBesideReads` OFF keeps the `cancelFirst` / `readFirst` order of the old code at all four call sites |
| `ADMIN_SCOPE_READS_ONCE` | OFF | `adminFlags.ts` `false`, read inside the hook at render | yes (separate keys, `select` views) |
| `REQUEST_DEADLINES`, `GLOBAL_GATE` | OFF | `requestFlags.ts`; `sendWithPolicy` is not imported by any caller | n/a (unused) |
| `GENERATORS_WARMUP_LAZY` | OFF | `bootDvoptFlags.ts` | yes |
| `RETRY_POLICY_V2` | ON | OFF path `legacy*` compared with `git show HEAD:...retry.ts`: identical bodies; the UT-RETRYV2 oracle is independent copied code | yes |
| `PLAN_SHAPE_CHECKS` | ON | `executePlan.ts` | the strict check mirrors `sendWrite` / `resolveRefs`; I found no plan shape it refuses that the runtime would accept (concurrent-run visibility, `createMany` counts and `CREATED_ROW_ID` all match) |

### Checked and found sound

- `platform/errors.ts`: `DataError.deterministic`, `UnknownOutcomeError`, `classifyError`, `errorChain` / `statusOfChain` (same `status ?? statusCode` rule as the old `statusOf`); `isRetryable` honours `deterministic`; the `fetchAll` page cap is now deterministic (no re-walk by TanStack).
- `data/retry.ts` V2: idempotency matrix correct (bulk retries 429 only, a bare 503 only with `Retry-After`; delete also retries transient; no-status errors at most one retry; no retry on 400/401/403/404/409/412); `queryRetryDelay` uses the 0-based `failureCount` TanStack passes and its OFF value equals TanStack's default.
- `data/requestPolicy.ts` and the gate in `concurrency.ts`: `mayRetry` matches doc 21 (create/bulk never retried on transient, only on 429); a retry sleeps outside the gate; `pump` handles a write blocked by the lane without starving reads; the deadline timer is always cleared; a late rejection is handled (nothing unhandled).
- `executePlan.ts` / `usePlanWrite.ts`: shape errors are raised before the first request and `PlanShapeError` is treated like a refusal in the two-plan path (partly-saved note preserved); the owner-bind guard still runs after it.
- `client.ts` `isAlreadyGone` / `deleteIfExists` moved from `contracts.ts` (re-exported; the 404-on-wrong-entity-set caveat is documented and callers pass registry constants).
- `costUpdateGuard.ts`: chunked key-only existence reads, duplicates read once, a failed read is a `DataError` and never "gone", the first missing id raises `RecordGoneError` with nothing sent; Land Lease and OPEX guard ids come from updates only (`LeaseWrite.update.id`); the OPEX re-chain plan is computed once with the same inputs as before.
- `stableCreateId.ts` ON path logic (a retried id is read back, a confirmed create forgets its id, bounded map) and OFF equality (above).
- `landLease.ts` CB-02 fresh standard-contract read: same rule input (`isStandardContract` only), a failed read refuses the import; `useLeaseWrites.onError` refreshes on any failure (a superset of the old `LeaseStepsError` case; OFF equals old).
- `pendingDeletes.ts` tab hold: reference counted per registration, released exactly once, a throwing hold/release cannot fail a Save.
- `capexBookPatch.ts` / `useCapexWrites`: the patch is skipped (reload as before) in every case the code cannot prove equal; an in-flight book fetch is cancelled before the patch; `onWritten` fires only after the whole bulk save succeeded and a throwing callback is swallowed; `panelWritten` is a WeakMap keyed by the mutation variables object.
- `costBook.ts` shared SPV mapping: a failed read is not remembered, `invalidate()` drops an in-flight pre-write answer, the table is only read by the admin screen in this app.
- `pmScreenPrefetch.ts` / `planning/queries.ts`: the prefetch never writes; keys are the screens' own; seeds go only through `seedOnce` (in-flight de-duplication, existence re-read before the create, a refusal is not remembered, memory keyed by project id).
- `personCache.ts` / `checklistPeople.ts`: cache keyed by Entra person id (directory data, not user-scoped data), caller-specific TTL, empty answers reused only by the caller that keeps them, failures never kept; the Check List Refresh clears the shared store (freshness gain only).
- `generatorCatalogueCache.ts` PA-12: IndexedDB entries are keyed `<environment>.<hash of user id>:<FID>`, nothing is read or written when either id is unknown, the user id is stored only as a 64-bit-wide hash. No other new persisted storage in the diff (grep of added lines for `localStorage|sessionStorage|indexedDB`).
- `checklist.ts` `existingTrackingIds`: key-only chunked read with no state filter (inactive rows still exist), a failed read fails the job before any write; creates unaffected. `reusableTrackings` (PB-13) refuses invalidated, refetching or older-than-2 s data and is used only by `prepareCluster`.
- Finance changed-rows logic (switch OFF) is conservative: a stored blank never equals a value (`storedAmount === null`, `hasBlank`), and a row with no stored snapshot is always written.
- `generators.ts` `listGeneratorTypeIds`, `listPvTypeIds`, `listProjectTurbineNames`: same filters and order as the full reads with a narrower `$select`; `production.ts` uses them only for the ids / names it already used.
- `adminCapexAccounts.ts` CLEANUP_RESILIENT: both phases idempotent, deletes through `withDeleteRetry` + already-gone, the zero PATCH retried on 429/5xx/no status only, a partial failure raises `PartialStepError` with landed counts and a rerun hint; the OFF path is the old fail-fast pool.
- `admin-gates-approvals/hooks.ts` AD-06: toggle counters are incremented before the first await, the last settling toggle reloads, any unexpected state falls back to the full invalidation.
- Conventions: no `console.*` or `fetch(` in the changed `src` files; nothing changed under `src/generated/`, `.power/` or `power.config.json`; new user-visible strings are marked `NEW (dvopt)` (`UNKNOWN_OUTCOME_TEXT`, `cleanupDetail`) or reuse existing constants (`RECORD_GONE_TEXT`); the new log lines I read print kind, class, status, try and wait only, never ids or values; no new interactive control in the diff.


---

# Second independent review: batch 2 (t11 retry adoption, t21 Cost saves, QA-fix round)

Result: 0 BLOCKER, 3 MAJOR, 6 MINOR, 3 NIT. QB-01 / QB-02 (retries stacking in Contracts, Land Lease, OPEX; the off switch was not a rollback) and QB-03 (a 404 on a retried delete turned into success, bypassing the Add Cost read-back) were FIXED: one retry layer per request, request-counting tests (UT-COSTSTACK-*), a retried 404 is now an error that the callers treat as done where they already did. QB-12 (an OPEX create answering without an id) and QB-10 (stale comments) were fixed. QB-04, 05, 06, 07, 09, 11 are left as they are, each with a reason in the dispositions section below. The full gate then passed (doc 29).

## Dispositions of the left-as-is findings

### QA batch 2: dispositions (fix-up round)

Worktree `Project-Management-Energy-WorkDev1-DataverseOptimization`, code in `ProjectCosts-CodeApp\`. Nothing committed. Source: `qa-batch2.md`.

#### Fixed in this round (with tests)

| Finding | What | Where | Tests |
|---|---|---|---|
| QB-01 / QB-02 | `costWrite` is the ONE retry layer. Every helper it wraps is called with `{ policy: false }` (`deleteIfExists` gained the option; `deleteRecord` / `updateRecordIfExists` already had it). `COST_WRITES_POLICY = false` is now a true rollback: one request per refused write. | `data/client.ts` (`deleteIfExists` option), `data/contracts.ts` (5 sites), `data/landLease.ts` (`deleteLeaseRow`), `data/periodWrites.ts` (`remove` in `deleteOpexPeriod`), comment in `data/costWritePolicy.ts` | `data/costWrite.stacking.test.ts` UT-COSTSTACK-001..006, 010, 011 (real client helpers over a mocked SDK, injected sleeper and random, requests counted per row: persistent 503 = 3, 429 = 4, create 500 / network = 1, OFF = 1); UT-COSTPOLICY-046 green unchanged |
| QB-03 | `deleteRecord` no longer turns a 404 on a retried attempt into success; it throws the 404 `DataError` like a first-attempt 404. `deleteIfExists` / `isAlreadyGone` callers still treat it as done; `deleteOr404` still hands it to `verifyNotFound`. | `data/client.ts` | `client.policy.test.ts` UT-CLIENTPOL-004 (rethrown, the exact `deleteOr404` test holds), 005 (plain caller done), 005b (`policy: false`); the Add Cost read-back path is pinned by UT-ACSHEET-BULK-046 / 047 (a status-404 `DataError` from `deleteRecord` is read back) |
| QB-10 | Stale backoff comments updated (throttled = equal jitter on a 2 s base) | `retry.ts`, `requestPolicy.ts`, `requestFlags.ts` | none (comments) |
| QB-12 | An OPEX create that answers without the new row's key throws a `DataError` at once instead of carrying `""` on | `data/periodWrites.ts` | `periodWrites.test.ts` UT-PWRITE-001b |
| QB-08 | The persistent-failure tests the QA asked for | see QB-01 | UT-COSTSTACK |

Consequence of QB-03 to know: callers of plain `deleteRecord` (CAPEX panel delete `capexWrites.ts:694/722`, contract delete `capexWrites.ts:972/1008`, `comments.ts:230`, `projects.ts:483`, `addCostSheet.ts:1480/1557/1559`, `adminContract.ts`) now show a 404 after a retried delete as a failure, exactly as a first-attempt 404 always did there. The row IS gone in that case (the first attempt landed) and a reload shows it. This is the safe direction (an extra failure message, never a silent success on a route or gateway 404). If the owner wants the lenient result for one of these screens, switch that call to `deleteIfExists` (it needs a product call per screen: the Delete Project path is the one the canvas refused to ignore).

#### Left as is (trade-offs, no behaviour change)

##### QB-04 retry waits hold delete-gate and plan-group slots
Left as is. A retry wait inside `deleteOr404` (`contractDeleteGate` / `costDeleteGate`, 4 slots), `panelDeleteGate` and the plan engine's concurrent groups keeps its slot. For a 429 storm that is arguably the right back-pressure (4 throttled deletes stop the other deletes from piling on); for a 503 on one row it stalls the other three lanes for about 1-2 s. Doing it right means `sendWithPolicy` OUTSIDE the gate and `{ policy: false }` inside, in `deleteOr404`, `gatedCostDelete` and `executePlan.sendWrite`: three files with their own concurrency pins, and it interacts with QB-03 (the retried 404 must reach `verifyNotFound`). Owner should know: worst case about 14 s of one slot per throttled delete (4 tries, 2 + 4 + 8 s). Revisit after the DEV capture shows how often 429 occurs on deletes.

##### QB-05 `RETRY_POLICY_V2 = false` still retries plain deletes under the legacy hardened rules
Left as is, by the implementer's own design: with V2 off `sendWithPolicy("delete")` uses `legacyDeleteRetryDelay` (429, 500, 504, network). Returning `undefined` there would also switch off the hardened Generators delete, which shares `policyDelay`'s legacy branch for callers outside `withDeleteRetry`; that is a wider behaviour change than this round allows. To restore "no retry anywhere" use `POLICY_CLIENT_WRITES`, `POLICY_PLAN_WRITES`, `POLICY_ADMIN_WRITES` and `COST_WRITES_POLICY` (all four), not V2. The V2 switch is a retry-RULES switch, not a master switch. Owner: document that in the release notes so nobody expects V2-off to mean "no retries".

##### QB-06 the guard reads (`assertRowsExist`, `rowExists`) are not retried
Left as is. One transient 503 or 429 on the existence read refuses a Land Lease or OPEX save before its first write ("Cost data is unavailable"-class). It fails CLOSED, which is the point of the guard, and nothing has been written, so the user simply presses Save again. Wrapping it in `sendWithPolicy("read")` under `POLICY_VERIFY_READS` is a four-line change, but it adds a retry layer beside the new `costWrite` ones and changes the failure latency of every guarded save; do it together with the QB-04 gate decision so the layers are designed once. Owner should know that the guard introduced one new single point of transient failure per guarded save.

##### QB-07 the OPEX book depends on the OPEX accounts read and on a 30-minute-old name list
Left as is. (a) A failure of the accounts read now fails the OPEX book (the catalogue query joins the account to name it); the accounts read is a tiny, cached reference read and the screen needs it anyway, so the screen was already unusable without it. (b) `ensureQueryData` ignores `staleTime` when data exists, so a sub-account renamed by an admin in the same session shows the old name in the book until the catalogue entry is refreshed (30 minutes, or a reload). Names of OPEX sub-accounts change rarely and the admin screens run in the same session only for admins. The clean fix (a light dedicated key with `{id, name}` and invalidation from the admin OPEX screens, or `revalidateIfStale`) touches `useCostBook.ts` and the admin screens, which this round does not own. Owner: switch `OPEX_BOOK_REUSES_CATALOGUE` off if an admin renames sub-accounts while users work.

##### QB-09 the per-step guard in `independentSteps` mode reads before every step
Left as is. Up to three sequential guard waves on a panel Save (contract, allocation, period) instead of one up-front read, the price of QA-08 (a row gone from one step fails that step only, the others still save). The optional improvement (start the three reads together at the top of `applyPlan` and await each at its step) is safe but changes the order of requests in a path with many pins. Owner: the "fewer waves" claims of CB-07 hold for the writes, but the panel Save path has one wave MORE than before batch 1 because of the guard.

##### QB-11 widened Land Lease tiers can leave an arbitrary subset of followers / period deletes after a failure
Left as is: a product sign-off item already listed by the implementer (`LEASE_TIER_WIDER`). After a failure siblings in flight may have landed; the chain heals on the next save (followers) or a retried delete (404 counts as done through `deleteIfExists`). Switch `LEASE_TIER_WIDER` off for the D160 shape.

##### Tiering partial-failure shape (the QA's "tiering" remark)
Same as QB-11: a failed write stops new writes from starting and waits for the ones in flight, so the result is a gap anywhere in the tier, not a prefix. No data is lost and no row is created or deleted that the plan did not intend.

#### Real defects found while fixing
None beyond QB-01..03 and QB-12. The root cause of UT-CAPEXPATCH-003 was a test fixture, not production (see the report): `PANEL_STABLE_ID` ships OFF at integration, the fixture's contract `create` double assumed the client id was always sent.


## Full review (verbatim)

## QA batch 2 - independent review of the dvopt change set (t11 retry adoption, t21 Cost reads/writes, QA-fix round)

Reviewer: independent QA (read-only). Worktree `Project-Management-Energy-WorkDev1-DataverseOptimization`, code in `ProjectCosts-CodeApp\`, base `HEAD`.
Method: read the diffs and the new files of the "go deep" list myself first; the implementer notes (t11, t21) were read afterwards. Evidence: I ran 4 targeted vitest invocations (contracts.batch2, landLease.writes/dvopt, periodWrites, client/executePlan policy, retry.v2, adminCapexAccounts.cleanup, bulkSend.policy, costWritePolicy). Result: 1 RED test (UT-COSTPOLICY-046, see QB-02), everything else green.
Paths are relative to `ProjectCosts-CodeApp\`; line numbers are of the working copy. Batch-1 findings are not repeated.

Counts: BLOCKER 0, MAJOR 3, MINOR 6, NIT 3.

Root cause of QB-01 / QB-02: the two packages were built in separate worktrees. t11 explicitly asked (notes (e)4) that nobody wrap `deleteRecord`, `updateRecordIfExists` or `deleteIfExists` in a second `sendWithPolicy`; t21 did exactly that (`costWrite`) in Contracts, Land Lease and OPEX. The integration never reconciled them, and the tests of each side mock the other side away.

---

### MAJOR

#### QB-01 - MAJOR - Retries STACK in Contracts, Land Lease and OPEX deletes/updates: 3 x 3 (transient) or 4 x 4 (429) requests, up to about a minute of waiting
- `src/data/contracts.ts:546` (`costWrite("patchAbsolute", ... updateRecordIfExists ...)`), `:684` (payment target update), `:578`, `:649`, `:701` (`costWrite("delete", ... deleteIfExists ...)`); `src/data/landLease.ts:481`, `:489`, `:498` (`remove: costWrite("delete", ..., deleteLeaseRow -> deleteIfExists)`); `src/data/periodWrites.ts:614`, `:617` (`costWrite("delete", ... remove = deleteIfExists | deleteRecord)`). Inner layer: `src/data/client.ts:140-162` (`deleteRecord`) and `:490-506` (`updateRecordIfExists`), both on `sendWithPolicy` whenever `POLICY_CLIENT_WRITES` is true and the caller is not inside `withDeleteRetry` (`policyOn`, `requestPolicy.ts:114`).
- What is wrong: `costWrite` -> `sendWithPolicy(kind, fn)` where `fn` is a helper that itself runs `sendWithPolicy` (delete: 3 tries / 4 on 429; update: existence read 3 tries + PATCH 3 tries). The inner helper rethrows a `DataError` carrying the HTTP status, so the outer loop classifies it again and re-runs the whole inner retry loop. This is exactly the "retry multiplication between layers" the design forbids (doc 21 s.2; t11 notes (e)4). Only `adminRowWrites.updateRowsSettled` (`policy:false`) and the `withDeleteRetry` marker avoid it.
- Failure scenario: DELETE of a Contracts payment target during a Dataverse 429 storm (or Land Lease contract delete, or an OPEX chain delete of N children in parallel): inner 4 tries (waits 2-4 s, 4-8 s, 8-15 s) x outer 4 tries = 16 DELETE requests per row and a worst-case wait of about 4 x 14 + 14 = 70 s (minimum about 35 s) per row, with the busy spinner on and every row of a chain doing the same, each making the throttling worse (16 requests where the budget says 4). Under 503: 9 requests per row instead of 3. A Contracts edit under 503: 9 PATCHes + up to 3 existence reads per attempt of the outer loop.
- Why the tests do not see it: `landLease.writes.test.ts:77` mocks `./client` entirely (no `deleteIfExists`/`deleteRecord` policy), and every Contracts/OPEX policy test injects ONE failure then success (UT-COSTPOLICY-042/044/045: the inner loop absorbs it, the outer never fires). No test counts requests for a persistent failure through the real helpers.
- Fix: inside `costWrite` call sites pass `{ policy: false }` to the helper (`deleteIfExists(op, es, id, { policy: false })` needs a pass-through of the option; `updateRecordIfExists(..., { policy: false })` already accepts it). `costWrite` then is the single retry layer, per kind. Add tests: persistent 503 and persistent 429 through `deleteContract`, `saveContract` (edit), `deleteLeaseRow`, `deleteOpexPeriod` with the real client; expect 3 (resp. 4) requests, not 9 (resp. 16).

#### QB-02 - MAJOR - `COST_WRITES_POLICY = false` does not restore the old behaviour, and the suite is red because of it
- `src/data/costWritePolicy.ts:19-21` (`COST_WRITES_POLICY ? sendWithPolicy(...) : fn()`), `src/data/client.ts:148`, test `src/data/contracts.batch2.test.ts:245-253` (UT-COSTPOLICY-046).
- What is wrong: with the Cost switch OFF, `fn()` still reaches `deleteIfExists` -> `deleteRecord`, which retries under `POLICY_CLIENT_WRITES`. I ran the file: UT-COSTPOLICY-046 FAILS (`deleteRecordAsync` called 3 times, expected 1; log shows `try 1 of 3 failed ... try 2 of 3`). Rollback switch is not a rollback, and `npm run verify` will be red.
- Failure scenario: product sets `COST_WRITES_POLICY = false` to get back to "a refused delete fails at once" (the documented OFF meaning, leaseOpexFlags.ts) and still gets 3 delete attempts with waits of up to 3 s; the same for Land Lease `remove` and OPEX chain deletes.
- Fix: same as QB-01 (`policy: false` at every `costWrite` call site makes the OFF path single-attempt and the ON path single-layer). Then 046 passes unchanged.

#### QB-03 - MAJOR - A delete that retries and then answers 404 is reported as DELETED, bypassing the F-C read-back of Add Cost from Table
- `src/data/client.ts:150-161` (`attempts > 1 ? unwrapDeleteStrict(result, operation) : unwrap(result, operation)`), consumer `src/data/addCostSheet.ts:1252-1264` (`deleteOr404`, then `verifyNotFound`), also `capexWrites.ts:694, 722` and `projects.ts:483`.
- What is wrong: `deleteOr404` exists so that every 404 is read back ("a host or route 404 would otherwise turn every delete into a silent success", `verifyNotFound`). With the policy on, a first attempt answered 5xx/429 followed by a 404 is absorbed INSIDE `deleteRecord` and returned as success, so `deleteOr404` returns `undefined` ("deleted") and that id is never in the 404 list that `verifyNotFound` confirms. The t11 note ((e)1: "the existing verifyNotFound read-back already confirms every 404 of the batch, so this is safe") is wrong for exactly this case. The same absorbed 404 also hides the one case where it is not "my first attempt landed": a 504 where the server is still running the cascade of a contract delete (full-history delete, `CANVAS_PARITY_DELETION`): the retry 404s (row locked/removed in the other transaction), the save reports the contract deleted, and if the first transaction later rolls back the contract and its history stay while the sheet shows them removed.
- Failure scenario: Add Cost from Table Save removes 30 contracts; contract 17's first DELETE gets a 503 from a gateway, the retry gets a gateway/route 404 (wrong route, stale host after a deploy) -> counted as deleted, background delete "succeeds", the row is still in Dataverse, the next reload brings it back with no error shown. The safety net added after the Wirmighausen incident is silently skipped for retried deletes.
- Fix: do not convert on a retry inside `deleteRecord`. Rethrow the 404 `DataError` (callers that treat 404 as done already do: `deleteIfExists`, `unwrapDelete`, `deleteRowIfPresent`; `deleteOr404` verifies it). If a screen without such a wrapper needs the lenient behaviour, give `deleteRecord` an explicit opt-in option (`{ goneAfterRetry: true }`) used only by those callers.

---

### MINOR

#### QB-04 - MINOR - Retry waits still hold gate / group slots (WE-05 only partly met)
- `src/data/addCostSheet.ts:1257-1258` (`contractDeleteGate` 4, `costDeleteGate` 4 around `deleteRecord`), `src/data/capexWrites.ts:722` (`panelDeleteGate` 4), `src/data/executePlan.ts:332-389` (`sendWrite` runs inside the plan's concurrent group/gate), `src/data/landLease.ts` `mapLimitFirstFailure` workers.
- A 429 wait (equal jitter, 1-2 s, 2-4 s, 4-8 s per try; 7-14 s in all) parks 1 of the 4 delete slots; 4 throttled deletes stall every other delete of the batch for the whole wait. The t11 notes list this ((e)1) and leave it undone. For a 429 storm parking is arguably the right back-pressure, but it contradicts the stated rule and the comment in `client.ts:152-154` says so.
- Fix: either accept and document as a decision, or apply the t11 suggestion (policy outside the gate, `{policy:false}` inside) in `deleteOr404`, `gatedCostDelete`.

#### QB-05 - MINOR - `RETRY_POLICY_V2 = false` makes the plain-delete sites retry under the legacy hardened rules (new behaviour with the "old" switch)
- `src/data/requestPolicy.ts:policyDelay` (V2 off: `kind === "delete"` -> `legacyDeleteRetryDelay`), reached from `client.ts:157`, `executePlan.ts:389`, `adminRowWrites.deleteRowIfPresent`.
- The comment in `requestFlags.ts` and the t11 notes both admit it (risk 5). Switch discipline: turning V2 OFF should not add retries where none existed before T-11. Fix: with V2 off `policyDelay` returns `undefined` for `delete` unless the caller is the hardened path (`withDeleteRetry`, which does not use `sendWithPolicy`).

#### QB-06 - MINOR - The new guard reads are not retried while the writes they protect are
- `src/data/costUpdateGuard.ts:31-75` (`assertRowsExist`, used by `landLease.guardLeaseUpdates` and `periodWrites.guardOpexUpdates`; also `rowExists` for the stable-id read-back), versus `verifyGone.ts` / `bulkSend.idRows` (wrapped in `readPolicyPage`/`sendWithPolicy("read")` by T-11 under `POLICY_VERIFY_READS`).
- A mutation is never retried by TanStack, and `assertRowsExist` uses `guardedCall` directly. One transient 503 or 429 on the existence read refuses a Land Lease Period-1 save of 40 allocations or an OPEX edit before the first write ("Cost data is unavailable"-class failure), where a plain write would have been retried. It fails CLOSED (good), but the guard introduced a new single point of transient failure that the retry layer was meant to remove.
- Fix: wrap the read in `sendWithPolicy("read", ..., {label: entitySet})` guarded by `POLICY_VERIFY_READS` (same pattern as `verifyGone`).

#### QB-07 - MINOR - OPEX book now depends on the OPEX accounts read and on a 30-minute-old name list
- `src/features/cost/costing/useCostBook.ts:109-116` (`opexSubaccountNames` via `ensureQueryData(opexSubaccountsOptions)`), `:410-420` (`queryFn` awaits `ensureQueryData(opexAccountsOptions)`).
- (a) The OPEX book used to read `vsb_opexsubaccounts` alone; it now also needs `["opex-accounts"]` (the catalogue query joins the accounts read to name the account). A failure of the accounts read, which the book never needed, now fails the whole OPEX book. (b) `ensureQueryData` ignores `staleTime` when data exists, so the book names come from a cache that is refreshed only by the mounted catalogue observer's own rules; no admin screen invalidates `["opex-subaccounts"]` (grep: none), so a sub-account renamed by an admin in the same session shows the old name in the book for up to the catalogue's lifetime, where it was read fresh on every visit (`everyVisit`). Acknowledged by the notes as "same ACTIVE rows"; the staleness is the part not acknowledged.
- Fix: select only `{id,name}` through a dedicated light query key (or pass `revalidateIfStale: true`), and invalidate `["opex-subaccounts"]` from the admin OPEX screens.

#### QB-08 - MINOR - Tests that cannot fail on the stacked / persistent cases (see QB-01)
- `src/data/landLease.writes.test.ts:77-93` mocks `./client` and `./costUpdateGuard`; `src/data/contracts.batch2.test.ts` UT-COSTPOLICY-040..045 and `src/data/periodWrites.test.ts` UT-COSTPOLICY-020..027 inject one failure then success (or hit the generated service directly, which has no inner layer). Nothing pins "persistent 429/503 = exactly N requests" through `deleteIfExists` / `updateRecordIfExists`. UT-COSTPOLICY-046 is the only one that crosses layers and it is red (QB-02). Add the two persistent-failure tests described in QB-01 for each of the four call-site families.

#### QB-09 - MINOR - Per-step guard in `independentSteps` mode reads before every step, sequentially
- `src/data/landLease.ts:578-584` (`await guardLeaseUpdates(inStep)` inside the step loop).
- QA-08 is implemented correctly (a row gone from the allocation step fails that step only; the other steps still save; RECORD_GONE text). The price is up to three sequential guard waves per panel save (contract, allocation, period) instead of one up-front read; with a transient failure of one of them (QB-06) that step fails alone. Acceptable, but note the wave count when reading the "fewer waves" claims of CB-07: the panel Save path got one wave MORE with the guard than before batch 1. Optional: start the three guard reads together at the top of `applyPlan` and await each at its step.

---

### NIT

#### QB-10 - NIT - Stale comments after the QA-04 fix
- `src/data/requestPolicy.ts` header ("waits with exponential backoff and full jitter"), `src/data/retry.ts` `backoffMs` JSDoc ("exponential with FULL jitter ... Same schedule for every class") and `deleteRetryDelay`/`withDeleteRetry` JSDoc ("Wait: `backoffMs` (full jitter)"): the throttled class is now equal jitter on a 2 s base (`retry.ts`, `THROTTLED_BASE_MS`), the class does decide the schedule. Update the three comments so the next reader does not "fix" it back.

#### QB-11 - NIT - Widened Land Lease tiers can leave an arbitrary subset (not a prefix) of followers/period deletes
- `landLeaseRules.ts` `leaseWriteTiers(..., { wider })`, `landLease.ts:664`. Independence argument checked and sound (followers are computed in memory from the saved period alone; the saved period's own update is a full-payload write, never start-only, so it opens its own tier: `buildPeriodPayload`, `landLeaseRules.ts:2965-3010`; period deletes sit between allocation deletes and the header delete by entity set). After a failure siblings in flight may have landed; the chain heals only when a later save re-plans it. Same class as before (a gap at the tail), now a gap anywhere. Already listed by the implementer for product sign-off; mentioned for completeness.

#### QB-12 - NIT - `savedId = created.id` can be `""` instead of `undefined` when the create answers without a key
- `src/data/periodWrites.ts:~527` via `createWithStableId` disabled path (`stableCreateId.ts`: `typeof id === "string" ? id : ""`). Old code read `created.vsb_opexprojectcostid` (undefined). Both are wrong downstream; the new value is a falsy string that slips past `??` fallbacks differently. Throw `CreatedIdMissingError`-style when the id is empty, as `executePlan` does.

---

### Checked and found sound

- Matrix in `requestPolicy.ts` (`mayRetry`, `policyDelay`): 429 retries every kind; 5xx / status-less retry only read, delete and absolute PATCH; create and bulk never after a 5xx or network failure; 400/401/403/404/409/412/501 and deterministic / unknown-outcome errors never; status-less errors get one retry at most; `Retry-After` honoured if a future host exposes it; waits capped at 30 s. `sendWithPolicy` returns a non-retried failed result UNCHANGED so every caller's `unwrap` behaves as before. No flow call goes through it (grep: `flows.ts` untouched; no `sendWithPolicy`/`costWrite` in flow code).
- Create paths: `executePlan.sendWrite` create, `createRowsEach`, `deepInsertContracts`, `generatorsBulk.sendPerRow` (create), Contracts / Land Lease / OPEX creates: all `"create"` kind, 429 only. The bulk transport (`bulkSend.bulkTransport`) is `"bulk"`: 429 (or 503 with `Retry-After`) only, policy OUTSIDE `saveGate`, so a retry wait holds no write slot; the per-row fallback is `"patchAbsolute"` on the stable id (idempotent upsert). `generatorsBulk.bulkTransport` keeps its own loop and is NOT wrapped again.
- PATCH payloads that are retried are all absolute values (no increment/merge payload exists in plans, cascade, re-chain, per-row upsert, DevCo/payment-target updates); the retry reuses the same closure, never a rebuilt payload.
- No multiplication in the admin CAPEX clean-up: `withDeleteRetry` sets the synchronous `insideOwnRetry` marker; `deleteAdminRow` -> `deleteRowIfPresent` -> `deleteRecord` reads it before its first `await` (verified the call chain is synchronous), `updateRowsSettled` passes `policy:false`, hardened plan deletes call the SDK directly. Query reads are not wrapped (only reads inside write paths via `readPolicyPage`/`verifyGone`), and mutations have `retry:false`, so TanStack does not multiply them.
- Existence / guard reads fail closed: `updateRecordIfExists`, `verifyGone`, `assertRowsExist`, `existingTrackingIds`, `upsertEachRow` guard all throw on a failed read; none treats an error as "absent".
- QA-fix round: `backoffMs` throttled class is equal jitter on a 2 s base (min 1 s first wait, 7-14 s total over four tries, capped 15 s); `isAlreadyGone` single shared definition reads status / `0x80040217` anywhere on the cause chain and `adminRowWrites` imports it; `applyPlan` guard per step in `independentSteps` mode (whole plan up front otherwise); `CHECKLIST_BACKFILL_TOGETHER` default false, the guard path keeps the old sequential order, the existence read failure writes nothing, and `planSkippedClusterBackfill` without options equals the old plan; `adminDefaultChecklists.test` mock default 403.
- Land Lease sub-account memo: reference data, read-only in every screen (`adminCost.ts` only reads it), failed reads not remembered, array not mutated by `loadLeaseBook`, no per-project data inside it. `refreshLeaseBooks` dropping `["cost-book", p, "none"]` is safe: the only consumers of that key are the OPEX screen (`everyVisit`, re-reads on every visit) and the CAPEX category keys.
- Contracts: `CONTRACT_LINKS_WITH_PATCH` reads links before the PATCH but the PATCH never changes links (checked `saveContract` payload; Project Rights excluded); a failed early read is caught and surfaces inside the same `ContractLinksError` wrap; `CONTRACT_KEYS_ONCE` only marks id-set keys stale (refetchType none) where the id set is about to change, and an edit still refetches under the same key; `BOP_ASSUMPTIONS_ONE_READ` takes the OLDEST ACTIVE row per type exactly as `findBopStandardAssumption` and keeps the key under `qk.bopStandardAssumptions` so admin invalidation still reaches it.
- OPEX: `rechainPlan` is pure and equals the old plan (same inputs, root = `parentId ?? id`); the child read beside the PATCH does not depend on the PATCH (the PATCH never writes `vsb_parentcost` for a head) and the cascade still starts only after the PATCH succeeded; every speculative promise has a `.catch(() => undefined)` so none is unhandled; the import's refusal still precedes the assumptions answer.
- Cost reads: `COST_READS_RETRY` inherits `attempt < 2 && isRetryable`; a 403/4xx still shows at once; the Add Cost sheet's no-focus-refetch protection is separate and unchanged.
- Switch defaults match the notes (new switches ON; `STABLE_CREATE_IDS`, `CHECKLIST_BACKFILL_TOGETHER`, `REQUEST_DEADLINES`, `GLOBAL_GATE` OFF). Retry log lines carry the entity-set name, kind, class, status and wait only (no ids or values; UT-COSTPOLICY-005). No bare `console.*`, no hand-built OData in the new code (`and`/`eq`/`idIn`/`lookupEq`/`or` helpers); `UNKNOWN_OUTCOME_TEXT` carries the NEW (dvopt) marker.
- Targeted runs green: landLease.writes, landLease.dvopt, periodWrites, client.policy, executePlan.policy, retry.v2, adminCapexAccounts.cleanup (UT-ADCLEAN-004 now passes), bulkSend.policy, costWritePolicy (174 + 44 tests). Red: UT-COSTPOLICY-046 only (QB-02).

