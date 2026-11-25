# 11 - API Reliability Assessment

> Stage 1 audit, 25 Nov 2026. Branch `feature/dataverse-network-performance-optimization`, from `origin/RounakDev1` at `30afece`. Investigation only: no application source file was changed. Every request count is **code-derived**, not measured. 

Errors, retry, `Retry-After`, timeouts, idempotency, duplicate submission, ambiguous outcomes.

**22 findings name this area** (a finding naming several areas appears in each; its primary area is listed first in its block).

| ID | Pri | Conf | Title |
|---|---|---|---|
| AD-01 | P0 | High | CAPEX clean-up: thousands of un-retried per-row writes, fail-fast, no resume path |
| CB-01 | P0 | High | Land Lease and OPEX updates are unguarded upserts: a row another user deleted is re-created, often as an orphan |
| CB-02 | P0 | High | A partly failed Cost period write leaves the cache stale, and the retry runs from it (Land Lease import can duplicate a standard contract) |
| CA-01 | P1 | High | Add Cost and CAPEX panel writes (and their verify reads) are never retried on 429 / 503 |
| CA-02 | P1 | Medium | No client-side deadline on any request: a hung call freezes the save, the gate, the CA-15 lock and the pending-delete registry |
| CA-03 | P1 | High | Deferred deletes are not protected against closing or reloading the tab (live flags) |
| CB-03 | P1 | High | Land Lease and OPEX deletes treat "already gone" (404) as a failure |
| OR-01 | P1 | High | `Retry-After` can never be read: the SDK error has no headers, so every Retry-After branch is dead code and a 503 is never retried |
| PA-02 | P1 | High | Finance `bulkSchedules` relies on a bulk backend that Finance never registers (latent partial save) |
| PB-01 | P1 | High | Flow steps: an ambiguous or failed flow call can send a duplicate approval, or leave a task with no way forward |
| WE-02 | P1 | High | No retry of any single-row create/update/delete on 429 / 503+Retry-After (engine and admin loops) |
| AD-05 | P2 | High | Admin per-row deletes treat 404 ("already gone") as a failure |
| CA-11 | P2 | Medium | The three main Cost reads have `retry: false`, so one transient 5xx/429 shows "Cost data is unavailable" |
| CB-14 | P2 | Medium | Header creates have no idempotency: an ambiguous failure plus a retry duplicates the row |
| PA-14 | P2 | High | Roll-ups are computed from the screen's snapshot, not from the server (lost update across users and tabs) |
| PB-05 | P2 | High | Planning writes rows from inside query functions |
| WE-01 | P2 | High | Deterministic failures are classified as retryable: a `fetchAll` cap failure is re-walked twice more |
| WE-04 | P2 | Medium | Creates are not idempotent: an ambiguous failure plus a user retry can duplicate a row |
| PB-14 | P3 | High | Check List back-fill: up to 7 sequential, unguarded upserts; an update can bring a deleted tracking back without its project or owner |
| WE-05 | P3 | High | No request timeout anywhere; a hard retry wait holds a gate slot |
| WE-06 | P3 | High | Engine shape gaps that a plan bug would turn into a bad request |
| WE-07 | P3 | High | `usePlanWrite` permission message is not found inside a `PlanError` (pinned on purpose) |

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

### CB-01 - Land Lease and OPEX updates are unguarded upserts: a row another user deleted is re-created, often as an orphan

**Priority P0, confidence High.** Source scope: Cost B: Contracts, OPEX, Land Lease, periods.

> VERIFIED by orchestrator: `landLease.ts:425-450` and `periodWrites.ts:478-502` call the generated `update()` directly, no existence check.

- **Area** reliability · **Screen** Land Lease, OPEX
- **File:line** `data/landLease.ts:429-430, 437-438, 446-447, 550-552`; `data/periodWrites.ts:482-485, 497-502, 529-536`
- **Function** `WRITERS.*.update` / `sendLeaseWrite`; `saveOpexPeriod` (row update, cascade, re-chain)
- **Problem** Every update on these screens is the generated service's `update`, which the SDK sends as `PATCH` with no `If-Match`
  (an upsert, platform fact). Contracts guards the same case with `updateRecordIfExists` (D120 §3); these screens do not.
- **Evidence**
  - `update: (id, p) => Vsb_landleaseprojectcostsService.update(id, p as never) ...` (`landLease.ts:429-430`), the same for periods
    (`:437-438`) and allocations (`:446-447`); `unwrap(await writer.update(bound.id, bound.payload), ...)` (`:551`).
  - `await Vsb_opexprojectcostsService.update(period.id, { ...fields, ...bindings } as never)` (`periodWrites.ts:483`);
    `await Vsb_opexprojectcostsService.update(child.id, cascade as never)` (`:499`);
    `await Vsb_opexprojectcostsService.update(step.id, { vsb_startdate: step.startDate } as never)` (`:532`).
  - Repo-wide, `updateRecordIfExists` is used by `contracts.ts` and the admin/plan modules only (grep), not by these two files.
- **Impact** On a deleted row the PATCH creates a new row under the same id holding only the patched columns:
  - a D118 follower or an OPEX re-chain PATCH creates a period holding only `vsb_startdate`, with no parent, project or business unit;
  - an OPEX cascade PATCH creates a row with 11 inflation/threshold columns and no project;
  - an OPEX row edit re-creates a row with no `vsb_Project` (the update bindings omit it, `:451-461`), so no screen shows it;
  - a Land Lease header or allocation re-write re-creates the row the other user deleted, with its binds, which silently undoes their delete.

  The first three are the rule 4 / R-12 shape: nothing throws, the row is invisible. The SDK 1.6.0 has no `If-Match` either (D159 §5).
- **Proposed solution** One existence read per entity set per plan, before the first update tier: `fetchAll(select [pk], idIn(pk,
  chunk))` for every id the plan updates (Land Lease: header, allocation and period ids; OPEX: the row, the children read by OP-39
  already exist by construction, the follower ids). If any id is missing, refuse the plan with `RecordGoneError` and send nothing.
  That is 1 extra wave and 1–3 requests per save, not 1 GET per row (`updateRecordIfExists` per row would add 40 GETs to a 40-WTG
  save). The narrow race between the read and the PATCH stays, as it does for Contracts.
- **Behaviour change?** needs product decision: a save on a deleted row is refused with the existing "record gone" text (Contracts
  precedent, D120 §3), where it silently re-created the row before.
- **Risk** Low–medium: one extra wave per save; the refusal must reach the Land Lease `independentSteps` reporting (`landLease.ts:493-514`).
- **Dependencies** OPT-22 (deferred guarded-update batching); D120 §3 NEEDS-LIVE-CHECK of upsert behaviour on DEV.
- **Validation** Unit: a mocked SDK where one id is missing, so the plan sends 0 writes and throws `RecordGoneError`. DEV: delete a period
  in tab B, save the Period-1 edit in tab A, and check that no row is re-created (a read by id finds nothing).
- **Priority** P0 · **Confidence** High (code); the server upsert result needs the live check D120 already lists.

### CB-02 - A partly failed Cost period write leaves the cache stale, and the retry runs from it (Land Lease import can duplicate a standard contract)

**Priority P0, confidence High.** Source scope: Cost B: Contracts, OPEX, Land Lease, periods.

- **Area** reliability · **Screen** Land Lease, OPEX
- **File:line** `features/cost/costing/useCostBook.ts:323-339` (`useLeaseWrites`), `:168-176` (OPEX `save`), `:227-235` (`useAddStandardContract`);
  `features/cost/periods/LandLeaseScreen.tsx:908-927`; `landLeaseRules.ts:3462`
- **Function** `useLeaseWrites`, `useCostBook().save`, `useAddStandardContract`, `importStandard`, `planStandardImport`
- **Problem** Caches are refreshed only after full success, except a Land Lease panel Save that throws `LeaseStepsError`. The
  delete and import plans are not run with `independentSteps`, so their failures are plain errors and trigger no refresh. The
  Land Lease import's "already has a standard contract" refusal is evaluated against the cached book.
- **Evidence**
  - `onError: async (error) => { if (!(error instanceof LeaseStepsError)) return; ...` (`useCostBook.ts:330-331`);
  - `await writes.mutateAsync(plan.writes);` for the import and the delete (`LandLeaseScreen.tsx:927`, `:1051`);
  - `existingCostsInSubaccount: costs.filter((c) => c.subaccountId === card.id)` (`:916`) →
    `if (args.existingCostsInSubaccount.some((c) => c.isStandardContract)) return empty;` (`landLeaseRules.ts:3462`);
  - OPEX `onSuccess: ({ book, touchedPeriods }) => { ... invalidateQueries ... }` with no `onError` / `onSettled` (`useCostBook.ts:168-176`);
  - `useAddStandardContract` has `onSuccess` only (`:227`).
- **Impact** (code-derived scenarios)
  1. Land Lease import: the header lands, then an allocation or period create fails (429, 5xx, network). The book is not reloaded,
     the screen shows no standard contract, and **Add Standard Contract stays enabled. A second click creates a second standard
     header** (the refusal reads the stale `costs`).
  2. Land Lease contract delete: the allocations go, then a period delete fails. The stale book still lists the allocations, and
     the retry's first DELETE answers 404, which `deleteRecord` treats as a failure (CB-03). The delete cannot be finished until a
     focus or visit refetch (30 s stale time).
  3. OPEX: a create lands, then the siblings read (`periodWrites.ts:513`, `:545`) fails, so the mutation throws and the cache is
     not refreshed. Re-adding the period creates a duplicate.
  4. OPEX import: a partial chain is invisible until the next visit. A retry is refused by the server check (`:749-766`), so this
     case does not duplicate.
- **Proposed solution** Refresh on every outcome (`onSettled`), as Contracts already does (D100/D120 §1, `contracts/hooks.ts:279-282`),
  for `useLeaseWrites`, the OPEX `save` (invalidate only; `setQueryData` stays on success) and `useAddStandardContract`.
  For the Land Lease import, re-check on the server before writing: one GET of `vsb_landleaseprojectcosts` with
  `project + subaccount + vsb_isstandardcontract eq true + ACTIVE`, the same shape as OPEX's `addOpexStandardContract` (`:749-763`).
- **Behaviour change?** The refresh: none (the canvas reloads either way; see the comment at `useCostBook.ts:329`). The server
  re-check: needs product decision, because the canvas checks its loaded collection. It is a guard only; the refusal path and its
  silence (`LandLeaseScreen.tsx:919-921`) are kept.
- **Risk** Low. One extra reload after a failure, and one GET (1 wave) per import.
- **Dependencies** CB-03 (a 404 on the retry).
- **Validation** Unit: a mocked failure at the 2nd tier of an import, then assert that the lease-book key is invalidated and a 2nd
  import plan is refused after the reload. Hook tests already exist (`useCostBook.invalidation.test.tsx`).
- **Priority** P0 (scenario 1 duplicates data) · **Confidence** High

### CA-01 - Add Cost and CAPEX panel writes (and their verify reads) are never retried on 429 / 503

**Priority P1, confidence High.** Source scope: Cost A: CAPEX/DEVEX, Add Cost from Table, shared costing layer.

- **Area** reliability. **Screen** Add Cost from Table, CAPEX Add/Edit panel. **File:line** `data/bulkSend.ts:212-221` (`bulkTransport`), `:509-532` (`upsertEachRow`), `:366-367` (comment); `data/addCostSheet.ts:1252-1264` (`deleteOr404`). **Function** `bulkTransport`, `gated`, `deleteOr404`, `existingIds`.
- **Problem** `data/retry.ts` provides `retryDelay` / `MAX_BULK_TRIES` / `withDeleteRetry`, but nothing in this scope calls them. A grep for `retryDelay|withDeleteRetry|MAX_BULK_TRIES` finds callers only in `data/generatorsBulk.ts:25,286` and `data/executePlan.ts:105`. A 429 (service protection, the risk the gates are sized around) or a 503 with Retry-After on any one of the up to 8 parallel chunks fails that chunk; `sendParallel` throws `BulkPartialWriteError`, the whole Save ends as `SavePlanError` plus a reconcile pass (`addCostSheetBulk.ts:1111`), for a condition that by definition means "request not processed, try again".
- **Evidence** `data/bulkSend.ts:366-367`: "...writes are not retried on 429." Reference usage in the sibling module, `data/generatorsBulk.ts:286`: `const wait = "thrown" in outcome || outcome.result?.success === false ? retryDelay(failure, attempt) : undefined;`
- **Impact** On a large sheet (parallel 8 per group, up to 4 groups, plus deletes and the ungated verify reads of CA-17) the app can induce the very 429 it then turns into a failed Save with partly committed state. Frequency unknown (no 429 observed, per the OPT-09 note in the register); severity per occurrence high (partial write, reconcile, user retry).
- **Proposed solution** Wrap the send inside `bulkTransport` (plus the per-row `ROW_UPSERT` send, the delete in `deleteOr404`, the verify reads) with the existing `retryDelay`: retry only 429 and 503-with-Retry-After, max 3 tries, honour Retry-After capped at 30 s. CreateMultiple is safe to retry on 429/503 (the request was rejected before execution); UpdateMultiple and per-row updates are idempotent.
- **Behaviour change?** none (fewer spurious failures). **Risk** low-medium. A retry after a network error is NOT proposed (ambiguous outcome, CA-02). **Dependencies** the `retry.ts` sleeper seam; `isBulkNotImplemented` (501 detection) must still see the final error. **Validation** unit tests with an injected sleeper and a fake transport returning 429 then success (the way the `generatorsBulk` tests do); on DEV, check the `[VSB]` lines for any 429 at gate 24 (the open assumption at `bulkSend.ts:121-123`). **Priority** P1. **Confidence** high on the fact, medium on frequency.

### CA-02 - No client-side deadline on any request: a hung call freezes the save, the gate, the CA-15 lock and the pending-delete registry

**Priority P1, confidence Medium.** Source scope: Cost A: CAPEX/DEVEX, Add Cost from Table, shared costing layer.

- **Area** reliability. **Screen** Add Cost, CAPEX panel, and every Cost screen (shared lock). **File:line** `data/concurrency.ts:207-232` (`createGate`), `features/cost/costing/useCostWriteFlight.ts:24-26`, `data/pendingDeletes.ts`, `data/client.ts:48-90` (`fetchAll`). **Function** `createGate`, `fetchAll`, `useCostWriteInFlight`.
- **Problem** A grep for `AbortController|AbortSignal|withTimeout|timeoutMs` over `src/data`, `src/platform`, `src/features/cost` matches only `data/persistedReference.ts` (IndexedDB). A write that never answers keeps its gate slot (released only when the task settles), keeps `save.isPending` true (Save disabled), keeps `useIsMutating(costWriteKey)` above 0 so every Cost write of the project is blocked, and, for deferred deletes, keeps the ids hidden in `pendingDeletes` (D51 section 11.17 already says the log line goes missing "if a delete request never answers"). Reloading the tab is the only exit.
- **Evidence** `data/concurrency.ts:219-221`: `try { return await task(); } finally { const next = waiting.shift();`; `useCostWriteFlight.ts:25`: `return useIsMutating({ mutationKey: [...costWriteKey(projectId)] }) > 0;`
- **Impact** Frequency unknown (depends on whether SDK or host time out: G1). Severity high when it happens: the user cannot tell whether the write landed.
- **Proposed solution** A deadline wrapper around the gated task (`Promise.race` with a generous timer) that rejects with a typed "outcome unknown" error. The SDK request cannot be aborted, but the UI, gate and lock are released and the existing recovery paths run (stable ids D51 section 3a, verify on retry, `SavePlanError.committedBefore`, reconcile). No auto-retry on timeout.
- **Behaviour change?** needs product decision (a new "outcome unknown, reload before saving again" message). **Risk** medium (a late-landing request after the user retried). **Dependencies** G1. **Validation** fake transport that never resolves: assert lock/gate release and message; on DEV block a request in DevTools. **Priority** P1. **Confidence** medium.

### CA-03 - Deferred deletes are not protected against closing or reloading the tab (live flags)

**Priority P1, confidence High.** Source scope: Cost A: CAPEX/DEVEX, Add Cost from Table, shared costing layer.

- **Area** transaction / reliability. **Screen** Add Cost from Table. **File:line** `data/addCostSheet.ts:320,338` (flags true), `data/addCostSheetBulk.ts:714-734` (early return), `features/cost/costing/useCostBook.ts` (`followBackgroundDeletes`), `features/cost/costing/backgroundSave.ts:49,132` (the only `holdBeforeUnload` use). **Function** `executeSavePlan`, `followBackgroundDeletes`.
- **Problem** The unload prompt is taken only by the WS-F background save, which is OFF (`BACKGROUND_SAVE = false`). With the live `DEFER_*` flags the Save resolves and the screen navigates while cost and contract deletes still run (5-20 s according to D51 section 11.17, quoted from the log, not re-measured here). The cost deletes feed totals: the contract totals are written before the cost rows they sum change, and the reconcile on failure runs only while the tab lives. If the tab closes in that window the deletes stop, no reconcile runs, totals stay as if the deletes had landed, and the removed contracts remain, with no toast possible.
- **Evidence** `data/addCostSheetBulk.ts` module note: "(1) writes the plan's FINAL totals before the cost rows they sum exist ... That is repaired only after EVERY operation has settled"; `grep holdBeforeUnload` under `src/features/cost` and `src/data` returns `backgroundSave.ts` only.
- **Impact** Silent integrity gap: the grid (stored total) and the Summary (sum of rows) disagree until a later save rewrites them, or a removal the user believes done is not done.
- **Proposed solution** Take `holdBeforeUnload()` for the lifetime of `result.background` in `followBackgroundDeletes` (release in `finally`; the helper is reference-counted).
- **Behaviour change?** needs product decision (a browser close prompt for the length of the deferred deletes; WS-F already chose that prompt for its own flow). **Risk** low. **Dependencies** none. **Validation** unit test in the style of UT-ACSHEET-BULK-066/067 with a pending `background` promise and a `beforeunload` event; on DEV close the tab during a deferred delete. **Priority** P1 (P0 if totals integrity is treated as critical). **Confidence** high.

### CB-03 - Land Lease and OPEX deletes treat "already gone" (404) as a failure

**Priority P1, confidence High.** Source scope: Cost B: Contracts, OPEX, Land Lease, periods.

- **Area** reliability · **Screen** Land Lease, OPEX
- **File:line** `data/landLease.ts:431, 439, 448`; `data/periodWrites.ts:575-580`; compare `data/contracts.ts:531-542`
- **Function** `WRITERS.*.remove`, `deleteOpexPeriod`
- **Problem** `deleteRecord` unwraps the result, so 404 / `0x80040217` throws. Contracts wraps it in `deleteIfExists`
  (`isAlreadyGone`); these two modules do not.
- **Evidence** `remove: (id) => deleteRecord("delete Land Lease period", LEASE_ENTITY_SET.period, id)` (`landLease.ts:439`);
  `(child) => deleteRecord("delete OPEX period", ES_PLANT.opexProjectCosts, child.id)` (`periodWrites.ts:577`);
  `client.ts:133-140` (`unwrap(await client.deleteRecordAsync(...))`).
- **Impact** A retry after a partial delete (CB-02 scenario 2), a delete racing another user, or a row the server cascade already
  removed (see CB-04) fails the whole plan at its first tier, and nothing after it is sent.
- **Proposed solution** Move `isAlreadyGone` / `deleteIfExists` out of `contracts.ts` into `data/client.ts` (rule 17: one helper)
  and use it in all three `WRITERS.remove` and in `deleteOpexPeriod`.
- **Behaviour change?** none for the end state. The canvas `Remove`/`RemoveIf` on a missing row raised nothing either
  (`contracts.ts:527-530`).
- **Risk** Low. Watch the wrong-entity-set caveat (KNOWN-RISKS, 404 as success).
- **Dependencies** none · **Validation** Unit: a 404 on the 2nd allocation delete still sends the periods and the header.
- **Priority** P1 · **Confidence** High

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

### PA-02 - Finance `bulkSchedules` relies on a bulk backend that Finance never registers (latent partial save)

**Priority P1, confidence High.** Source scope: PM A: Generators, Production, Revenues, Finance.

> QUALIFIED by orchestrator: `financeBulk.ts` registers tables only; the default backend is registered by `generators.ts:53` and `checklistBulk.ts:23`, but `finance.ts:219` lazily imports `./generators`, which would register it if that path runs first. Dormant (flag off); confidence Medium until the load order is tested.

- **Area**: reliability / transaction · **Screen**: Finance · **File:line**: `data/financeBulk.ts:12-25`; `data/bulkBackend.ts:84-95`; `data/executePlan.ts:413`; `data/generators.ts:53`; `data/checklistBulk.ts:23`; `features/pm/finance/perf.ts:185-189`
- **Function**: `registerBulkTables` (Finance), `getBulkBackend`, `sendBulk`
- **Problem**: `financeBulk.ts` only adds tables (`registerBulkTables(FINANCE_BULK_TABLES)`). The DEFAULT backend factory is registered only by `data/generators.ts:53` and `data/checklistBulk.ts:23`. `getBulkBackend()` throws when no factory exists, and it is called when the bulk STEP runs. In the tranche plan that step comes after the tranche write and the concurrent group (`perf.ts:185-189`).
- **Evidence**: `if (defaultFactory === null) { throw new Error("No bulk backend is installed. Import \`@/data/generators\` …") }` (`bulkBackend.ts:87-91`); `const backend = getBulkBackend();` (`executePlan.ts:413`, after `stepIds.push`); `writes: [tranche, ...together(grouped…), ...bulkSteps]` (`perf.ts:185-189`).
- **Impact**: today none (flag off). Once `bulkSchedules` is on, a tranche Save fails half-applied in a page load where neither the Generators data module nor `checklistBulk` has loaded: the tranche is saved, deletes and small sets have landed, the bulk schedule has not. When the module loads depends on timing. It usually arrives through the 1.5 s warm-up import (`app/generatorsWarmup.ts:50`), but not with `prefetch` off, and not for a Save started before the warm-up ran.
- **Proposed solution**: in `financeBulk.ts`, also call `registerDefaultBulkBackend(createGeneratorsBulkBackend)`, the same way `checklistBulk.ts:23` does. Alternatively, resolve the backend when the plan is built, so a missing backend refuses the plan before anything is sent.
- **Behaviour change?** none · **Risk**: L · **Dependencies**: none · **Validation**: unit test with a fresh module graph (no `data/generators` import): a tranche plan with a bulk step must either run or be refused before the first write · **Priority**: P1 (becomes P0 the moment `bulkSchedules` is flipped) · **Confidence**: high.

### PB-01 - Flow steps: an ambiguous or failed flow call can send a duplicate approval, or leave a task with no way forward

**Priority P1, confidence High.** Source scope: PM B: boot, Project Overview, PM screens, Cluster Checklist.

- **Area:** reliability. **Screen:** Cluster Check List (also General Data's cancellation path).
- **File:line:** `checklist/hooks.ts:512-533, 535-566, 570-593`; `checklist/rules.ts:2167-2176, 3139-3148`; `data/flows.ts:92-95`.
- **Function:** `useChecklistWrites.requestApproval`, `cancelGateApproval`; `runFlow`.
- **Problem:** every flow step is "pre-flow patch → `Service.Run` → follow-up" with no timeout, no idempotency key and no check after a failure. Two outcomes are possible when the flow call fails or times out after the flow has already started on the server:
  - **Cluster mode:** the retry guard refuses only once the flow has written `FlowRunId` (`staleClusterRequestRefusal` checks `inProgress && flowRunId`). If the flow started but had not written the id when the call failed (a network drop, or a timeout before "Respond to a Power App"), a second press starts a second approval: real mails and Teams cards (`16-PM-FLOWS…md` §7).
  - **Checklist mode:** the pre-flow patch sets `approvalChecklistState = In Progress` (`rules.ts:2172`). If the flow call then fails, `staleTaskRequestRefusal` refuses every later request for that task (`rules.ts:3147-3148`: In Progress is refused). The task stays In Progress with no `FlowRunId`, so it cannot be requested again, and nothing ties it to a running approval.
  - **Gate cancellation:** the patch clears `FlowRunId` before the flow (`rules.ts:2013`). This is the analysis doc's issue 9, canvas order, still as it was.
- **Evidence:**
  - `const live = s === ACS.completed || (s === ACS.inProgress && !isBlank(tracking?.flowRunId));` (`rules.ts:3141`)
  - `[CHECKLIST_COL.approvalChecklistState]: ACS.inProgress,` (`rules.ts:2172`), then `return s === ACS.inProgress || s === ACS.completed ? STALE_MSG.taskRequestStale(row.title) : null;` (`rules.ts:3148`)
  - `return unwrap(await loggedCall("execute", operation, call), operation);` (`flows.ts:94`): no deadline. The platform answers within 120 s (`16-PM-FLOWS…md` §1), so the blocking overlay can stand for two minutes.
- **Impact:** duplicate real approvals, or a task that is stuck. Mutations are not retried (`Providers.tsx:31`), and the busy gate blocks a double-click (`checklist/Screen.tsx:736`, blocking overlay `:954`), so the risk is the *ambiguous failure*, not a fast double-click.
- **Proposed solution** (the flows are not modified):
  - **(a)** After a failed flow step, re-read the row (`readClusterTracking` / `readClusterTask`) and decide from it: a `FlowRunId` appeared means "started, do not retry"; none means a retry is offered.
  - **(b)** In checklist mode, on a failed flow call, put `approvalChecklistState` back to its previous value as a compensating PATCH, or let the stale guard accept "In Progress with no FlowRunId and older than N minutes".
  - **(c)** A client deadline (for example 130 s) that shows "outcome unknown, check before retrying" instead of a generic error.
  - The real fix is server-side (a custom API or an idempotent flow); that is out of scope, since the flows must not change.
- **Behaviour change?** Needs a product decision: the messages, the compensating write, and canvas parity (the canvas has the same order).
- **Risk:** M. A compensating write can race a flow that did start; (a) has to run first.
- **Dependencies:** `usePlanWrite` `PartlySavedJobError` path (`usePlanWrite.ts:233-239`); D81; the analysis issues 7, 8 and 9.
- **Validation:** unit tests with a mocked flow rejecting after the patch, for both modes; a DEV test under the `16-PM-FLOWS…md` §7 plan, forcing a flow failure (a test project, approvers told in advance).
- **Priority:** P1. **Confidence:** High on the code paths. Medium on how often the flow writes `FlowRunId` before it responds (not visible from the client).

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

### AD-05 - Admin per-row deletes treat 404 ("already gone") as a failure

**Priority P2, confidence High.** Source scope: Admin screens and the shared write engine.

- **Area:** reliability · **Screen:** CAPEX Accounts (clean-up, deletes), Costs (OPEX contract / period), Contracts (DevCo unlinks)
- **File:line:** `data/client.ts:133-140`; callers `adminCapexAccounts.ts:303, 315, 412`, `adminCost.ts:877, 881, 906`, `adminContract.ts:274`
- **Function:** `deleteRecord`
- **Problem:** `deleteRecord` uses `unwrap`, so a 404 throws. The plan engine's deletes use `unwrapDelete` (404 / `0x80040217` = done, D157). Only `deleteStandardContract` (`adminContract.ts:403-407`) maps 404 itself.
- **Evidence:** `client.ts:139`: `await loggedCall("delete", tableName, async () => unwrap(await client.deleteRecordAsync(tableName, recordId), operation), () => 1);` versus `executePlan.ts:376-377`: `// Already gone counts as deleted (unwrapDelete). unwrapDelete(await client.deleteRecordAsync(...))`.
- **Impact:** two overlapping clean-ups (deactivate a subaccount, then its parent account while the first is still running in the background, `Screen.tsx:411, 421`) delete the same cost rows. The loser gets 404, stops fail-fast and shows an error toast although the goal was met. The same happens to an OPEX contract delete or a DevCo unlink that races another admin: the user sees a failure and a partial-step message.
- **Proposed solution:** use `unwrapDelete` in the clean-up delete and the DevCo unlink (or add an `alreadyGoneOk` option to `deleteRecord`). Keep `unwrap` where 404 should block. For OPEX contract deletes, 404 is also "done" for that row.
- **Behaviour change?** none on success paths; a false failure becomes success. Same rule as D157 for plans.
- **Risk:** Low. A wrong entity set would make every id "gone"; the sets are constants here (`COSTS_TABLE`, `OPEX_ENTITY_SET`, `ENTITY.devCo`).
- **Dependencies:** AD-01.
- **Validation approach:** unit test of the clean-up with a mocked 404 on one delete: the run completes and counts the row as deleted.
- **Priority:** P2 · **Confidence:** High.

### CA-11 - The three main Cost reads have `retry: false`, so one transient 5xx/429 shows "Cost data is unavailable"

**Priority P2, confidence Medium.** Source scope: Cost A: CAPEX/DEVEX, Add Cost from Table, shared costing layer.

- **Area** reliability. **Screen** CAPEX tab, Summary, Add Cost. **File:line** `features/cost/costing/useCostBook.ts:86,256,420,554`; `app/Providers.tsx:23`. **Function** `useCostBook`, `useCapexTotals`, `useAddCostSheet`.
- **Problem** The app default is `retry: attempt < 2 && isRetryable` (two retries on 5xx, 429, no status). These queries override it with `false`. Each read is a fan-out of `ceil(N/40)` requests that must ALL succeed (`Promise.all`), so the chance that one transient failure kills the load grows with project size (CA-04). The rationale for `retry:false` is not recorded (a grep of `02-OPEN-DECISIONS.md`, `01-BUGS-FOUND.md` and `optimization/` found none). For the sheet, the nearby comment (`:555-559`) concerns refetch while editing, which a retry of a first failed load does not trigger.
- **Evidence** `useCostBook.ts:86`: `queryKey, enabled: Boolean(projectId), retry: false,`.
- **Impact** A single transient failure shows the load-error state until the user reloads. Frequency unknown.
- **Proposed solution** Use the app default for the book and totals, with a `retryDelay` that honours Retry-After for 429/503 (`retry.ts` has `retryAfterMs`). For the sheet, allow one retry only while `data === undefined`.
- **Behaviour change?** none (more resilient). **Risk** low (a failing screen shows its error up to two retries later). **Validation** query-client test with a failing-then-succeeding `queryFn`. **Priority** P2. **Confidence** medium (the override may be deliberate: G4).

### CB-14 - Header creates have no idempotency: an ambiguous failure plus a retry duplicates the row

**Priority P2, confidence Medium.** Source scope: Cost B: Contracts, OPEX, Land Lease, periods.

- **Area** reliability · **Screen** Contracts, Land Lease, OPEX
- **File:line** `data/contracts.ts:518-522`; `data/landLease.ts:554-556`; `data/periodWrites.ts:465-480, 868-891`
- **Problem** A POST that fails after Dataverse committed it (network drop, gateway timeout) is reported as a failure. The user's
  retry creates a second contract, Land Lease header or OPEX head. Mutations are not retried automatically (`Providers.tsx:31`),
  so the only path is the user. `ContractLinksError` covers only the case where the contract is known to exist.
- **Evidence** `unwrap(await Vsb_bopprojectscontractsesService.create(payload as never), "create BoP contract")` with no primary key
  in the payload (`contractPayload`, `:443-481`).
- **Proposed solution** Generate the primary key on the client for these creates and keep it across a retry, as D51 §3a does for Add
  Cost from Table. A retry then answers "duplicate key", which can be mapped to "already saved" (or, guarded, upserts the same row).
- **Behaviour change?** none (a row id is the client's GUID instead of the server's).
- **Risk** Low–medium: the duplicate-key error code must be checked on DEV · **Priority** P2 · **Confidence** Medium (the frequency
  of ambiguous failures is unknown)

### PA-14 - Roll-ups are computed from the screen's snapshot, not from the server (lost update across users and tabs)

**Priority P2, confidence High.** Source scope: PM A: Generators, Production, Revenues, Finance.

- **Area**: transaction / reliability · **Screen**: Generators (Production re-reads, Finance has no roll-up) · **File:line**: `features/pm/generators/plans.ts:339-343, 533-534, 708`; `rollback.ts:573`; `Screen.tsx:804-808`
- **Problem**: `projectWtgRollup` sums `existingTypes` / `allTypes` as loaded in the browser. Two people (or two tabs) saving different types of one project each write totals that miss the other's change; the last writer wins. Production does it right: `rollUp` re-reads the yields before its roll-up (`production/hooks.ts:181`). The canvas also sums its collection (parity, so not a regression).
- **Evidence**: `const rollup = projectWtgRollup(args.project.id, [...args.existingTypes, { … }]);` (`plans.ts:339-343`).
- **Impact**: wrong plant capacity / cost on the project (which feeds the Cost screens' `totalCapacity`) until the next Generators save.
- **Proposed solution**: read the types (one GET, PA-OP-07) in the plan step of jobs that roll up, as Production does. It costs 1 request per save; pairs with PA-04.
- **Behaviour change?** needs product decision (divergence from the canvas, more correct) · **Risk**: L · **Priority**: P2 · **Confidence**: high (mechanism); low frequency.

### PB-05 - Planning writes rows from inside query functions

**Priority P2, confidence High.** Source scope: PM B: boot, Project Overview, PM screens, Cluster Checklist.

- **Area:** reliability, transaction. **Screen:** Planning.
- **File:line:** `features/pm/planning/hooks.ts:70-78, 100-113, 132-149`.
- **Function:** `seed`, `useProjectPlanning`, `useAquisitionStatuses`.
- **Problem:** the `OnVisible` seeds (1 planning-row create, N acquisition-status creates) run inside `queryFn`s. Three consequences:
  - A query function can run more than once: a retry on a retryable read error (`Providers.tsx:23`), a focus refetch, a remount after `gcTime`, a second tab.
  - The guard is "the read found no row". A row the user cannot read (another business unit's row) looks absent, so every visit creates another one.
  - A refused seed is traced and swallowed, so the screen then shows "no row" with no message. The canvas has the same `Patch` without `IfError` (`hooks.ts:13-14`).
- **Evidence:**
  - `return (await seed(planEnsurePlanning(project, null))) ? loadProjectPlanning(projectId!) : null;` (`:108`)
  - `return (await seed(planAquisitionSeed(types, rows, project))) ? listAquisitionStatuses(projectId!, types) : rows;` (`:144`)
  - `} catch (e) { trace("warning", "Project Planning: the OnVisible seed was refused", e); }` (`:74-76`)
- **Impact:** possible duplicate `vsb_projectplannings` / `vsb_aquisitionstatuses` rows: two tabs, or two users at once, or invisible rows. The writes do not show in the mutation log as writes (they are logged as a "Load" action, `app/queryLog.ts:75-77`).
- **Proposed solution:**
  - Move the seeds into a once-per-visit orchestration with an in-flight guard, as the Check List's `useChecklistOrchestration` does (`checklist/hooks.ts:629-677`). The reads become pure.
  - Optionally, product and schema: an alternate key on `vsb_projectplanning(vsb_project)` so a duplicate create fails on the server.
- **Behaviour change?** Moving them is none (the same writes, once). The alternate key needs a product decision and a schema change.
- **Risk:** L-M. **Dependencies:** none. The client cannot make an atomic "create if missing" (SDK).
- **Validation:** a hook test that a retried query function does not seed twice; a DEV check with two tabs opened at once on a project without a planning row.
- **Priority:** P2. **Confidence:** High (code). Medium on how often it happens.

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

### WE-04 - Creates are not idempotent: an ambiguous failure plus a user retry can duplicate a row

**Priority P2, confidence Medium.** Source scope: Admin screens and the shared write engine.

- **Area:** reliability, transaction · **Engine**, Contracts, Costs, Gates, Check List Settings, CAPEX
- **File:line:** `data/executePlan.ts:317-331`, `data/adminContract.ts:353-362`, `data/adminChecklistTables.ts:308-312`, `data/adminCost.ts:803-806`
- **Function:** `sendWrite` (create), `saveStandardContract`, `createDefaultChecklist`, `saveOpexPeriod`
- **Problem:** single creates let the server assign the id. If a POST times out or the connection drops after Dataverse committed, the user sees a failure and presses Save again, which creates a second row. Bulk creates already avoid this with caller-generated ids (`newRowId.ts`, `executePlan.ts:53-59`). Mitigated today: CAPEX create (number uniqueness re-check, `adminCapexAccounts.ts:244-246`), Contracts after a partial save (contract id kept, `Screen.tsx:343`). Not mitigated: a failed parent create of a standard contract (`ContractSaveError("parent", input.contractId, …)` with `contractId` undefined, `adminContract.ts:362`), DEVEX standard cost, gate/task approval, checklist task (the OPEX new contract re-checks "one contract per sub-account", `adminCost.ts:777-780`).
- **Evidence:** `executePlan.ts:319-322`: `await client.createRecordAsync(write.entitySet, data)`, with no primary key in `data`.
- **Impact:** low-frequency duplicate master data (a duplicate standard cost or contract is copied into every new project).
- **Proposed solution:** an optional `id` on a plan `create`: send the pre-generated primary key in the body (Dataverse accepts a client-supplied key on POST), keep it across a retry, and map a duplicate-key answer to "already created".
- **Behaviour change?** none on success; on an ambiguous failure the retry no longer duplicates.
- **Risk:** Medium (needs a live check that each admin table accepts a client key; plugins on create see the same row).
- **Dependencies:** live DEV check.
- **Validation approach:** DEV test: POST with a supplied key twice and check the second answer; unit tests on the mapping.
- **Priority:** P2 · **Confidence:** Medium.

### PB-14 - Check List back-fill: up to 7 sequential, unguarded upserts; an update can bring a deleted tracking back without its project or owner

**Priority P3, confidence High.** Source scope: PM B: boot, Project Overview, PM screens, Cluster Checklist.

- **Area:** reliability, payload. **Screen:** Cluster Check List.
- **File:line:** `checklist/rules.ts:444-487`; `checklist/hooks.ts:393-403`.
- **Problem:** the update branch PATCHes `existing.id` with no `guarded` flag, and its payload carries no project or owning-business-unit bind (those are added only on the create branch, `:475-481`). The SDK PATCH is an upsert (no `If-Match`). A tracking deleted between the fresh read and the write would come back as an orphan with no project and no owner (the rule 4 shape). Most other checklist updates are `guarded: true` (`rules.ts:1503, 1527, 2017, 2120`). The writes also run one at a time.
- **Evidence:**

  ```
  if (existing) {
    plan.writes.push({
      op: "update", entitySet: ES.projectStateTrackings, id: existing.id, data,
      reason: `${state.name} → ${approvalStateLabel(target)}`,
    });
  ```
  (`:467-471`, no `guarded`)
- **Impact:** a narrow window (the read is fresh, `hooks.ts:396`), but silent orphan rows. Up to 7 sequential round trips on the first visit of a skipped-start project.
- **Proposed solution:** `guarded: true` on the update branch (+1 GET each, `updateRecordIfExists`). Grouping can come later, once the `SynchroniseProjectState` order is checked, as in PB-11.
- **Behaviour change?** None for the guard: a vanished row is reported instead of re-created. Concurrency needs the DEV check of PB-11.
- **Risk:** L. **Dependencies:** OPT-22 (guarded = 2 requests until the SDK sends `If-Match`).
- **Validation:** a plan test asserting `guarded`; the existing UT-CHKLST back-fill tests.
- **Priority:** P3. **Confidence:** High.

### WE-05 - No request timeout anywhere; a hard retry wait holds a gate slot

**Priority P3, confidence High.** Source scope: Admin screens and the shared write engine.

- **Area:** reliability · **Engine**
- **File:line:** `data/executePlan.ts:584-592, 364-367`, `features/shared/useBusyRunner.ts:39-51`, SDK `dist` (no `setTimeout`/timeout found)
- **Function:** `executePlan` concurrent run, `sendWrite` hardened delete
- **Problem:** (a) no client-side timeout. A request the host never answers keeps the blocking overlay (`useBusyRunner.run`) or an inline pending state forever; the user's only way out is a reload, which loses the knowledge of what landed. (b) `withDeleteRetry` sleeps inside `gate(...)`, so a Retry-After wait (up to 30 s) blocks one of the group's slots.
- **Evidence:** `executePlan.ts:584`: `run.map((w, k) => serial(w.serialKey, () => gate(async () => { … return await sendWrite(…) …` with `sendWrite:364` `await withDeleteRetry(...)`; `retry.ts:156-161` `await sleep(wait);`.
- **Impact:** (a) rare but unrecoverable UI hang; (b) throughput dips under throttling (hardened deletes only, not admin).
- **Proposed solution:** (a) a watchdog per mutation, e.g. 120 s, that shows "still working… the outcome is unknown, reload to check". Do not reject the promise: the request may still land. (b) Release the slot during the sleep (sleep outside `gate`, re-acquire to send).
- **Behaviour change?** (a) new message text: needs product decision; (b) none.
- **Risk:** Low.
- **Dependencies:** none.
- **Validation approach:** fake-timer unit tests.
- **Priority:** P3 · **Confidence:** High (code); host-side timeouts unknown.

### WE-06 - Engine shape gaps that a plan bug would turn into a bad request

**Priority P3, confidence High.** Source scope: Admin screens and the shared write engine.

- **Area:** reliability · **Engine**
- **File:line:** `data/executePlan.ts:384-396, 349-356, 377`
- **Function:** `assertPlanShape`, `sendWrite`
- **Problem:** `assertPlanShape` does not reject an `update`/`delete` without `id`. `sendWrite` then calls `client.updateRecordAsync(write.entitySet, id!, data)` with `undefined`, which is sent to the host. A guarded update would fail in `guid()`; a plain one goes out. Unlike bulk misuse, this is not stopped before anything is sent, so in a multi-write plan the earlier writes have already landed.
- **Evidence:** `executePlan.ts:351-353`: `await client.updateRecordAsync<…>(write.entitySet, id!, data)`.
- **Impact:** a half-applied plan from a programmer error; there is no network-cost impact.
- **Proposed solution:** extend `assertPlanShape`: every non-bulk `update`/`delete` needs a non-empty `id` (a string, or `CREATED_ROW_ID`/`@created#n`).
- **Behaviour change?** none.
- **Risk:** Low.
- **Dependencies:** none.
- **Validation approach:** UT-PLAN test with a missing id: throws before any client call.
- **Priority:** P3 · **Confidence:** High.

### WE-07 - `usePlanWrite` permission message is not found inside a `PlanError` (pinned on purpose)

**Priority P3, confidence High.** Source scope: Admin screens and the shared write engine.

- **Area:** reliability (error classification) · **Engine** (PM consumers only; admin uses `runPlan`, which unwraps)
- **File:line:** `data/usePlanWrite.ts:109-111`, `platform/privileges.ts:402-407`, `data/usePlanWrite.test.ts:35-41` (UT-PLANWRITE-004)
- **Problem:** `permissionMessage` checks only `error instanceof DataError`, while `executePlan` always wraps a 403 in `PlanError`. A refused PM write therefore reads "“…” failed: … failed: …" instead of the permission sentence. The test pins this: "a PlanError wrapper is not looked through".
- **Impact:** user-facing text only; no network impact.
- **Proposed solution:** walk the `cause` chain as `isRecordGone` does (`errors.ts:169-176`).
- **Behaviour change?** needs product decision (visible text of PM screens changes; UT-PLANWRITE-004 is a deliberate pin).
- **Priority:** P3 · **Confidence:** High.

---

