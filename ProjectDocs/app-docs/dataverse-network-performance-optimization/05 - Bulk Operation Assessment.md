# 05 - Bulk Operation Assessment

> Stage 1 audit, 25 Nov 2026. Branch `feature/dataverse-network-performance-optimization`, from `origin/RounakDev1` at `30afece`. Investigation only: no application source file was changed. Every request count is **code-derived**, not measured. 

Loops of single writes, `CreateMultiple`/`UpdateMultiple`/`UpsertMultiple`, chunking, fallbacks, partial failure. `$batch` and change sets are NOT available through this SDK (doc 01 §4).

**10 findings name this area** (a finding naming several areas appears in each; its primary area is listed first in its block).

| ID | Pri | Conf | Title |
|---|---|---|---|
| AD-01 | P0 | High | CAPEX clean-up: thousands of un-retried per-row writes, fail-fast, no resume path |
| AD-02 | P1 | High | CAPEX clean-up request volume: 2 requests per zeroed row, 1 per deleted row (re-raise OPT-22 / D36 §1 with new evidence) |
| PA-01 | P1 | High | Generators bulk switches all off: the largest remaining write volume (re-raised OPT-21 with counts and an evaluation) |
| CA-14 | P2 | Medium | CAPEX panel Delete: four sequential phases of per-row deletes (re-raise of OPT-23 with new evidence) |
| CB-06 | P2 | Medium | Land Lease allocation writes are single-row loops; `CreateMultiple` / `UpdateMultiple` fit them |
| PA-06 | P2 | High | Revenues Save deletes every stored hedge volume and re-creates every volume |
| PA-07 | P2 | High | Production one-shot generation: creates go out 8 wide, allocations one POST each |
| PB-11 | P2 | High | General Data edit save: tracking rebuild and shareholder writes go one at a time, while the create path sends them together |
| CB-10 | P3 | Medium | OPEX cascade and re-chain PATCH loops could be one `UpdateMultiple` |
| PA-13 | P3 | Medium | Bulk `updateMany` always pays a guard read, even where `UpdateMultiple` itself would refuse a missing id |

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

### PA-01 - Generators bulk switches all off: the largest remaining write volume (re-raised OPT-21 with counts and an evaluation)

**Priority P1, confidence High.** Source scope: PM A: Generators, Production, Revenues, Finance.

- **Area**: bulk · **Screen**: Generators · **File:line**: `data/generatorsBulkFlags.ts:19-24`; `features/pm/generators/plans.ts:324-334, 410-420, 709-726`
- **Function**: `planCreateGeneratorTypeUnchecked`, `planGeneratorTypeFollowUpUnchecked`, `planToggleStatus`
- **Problem**: every Generators write that touches many rows goes out one request per row. The bulk path exists and is merged but off, and its DEV test plan has not been run (`GENERATORS-BULK-DEV-TEST-PLAN.md`; DEC-4).
- **Evidence**: `turbines = group(names.map((name) => ins(ES_PLANT.generatorInProjects, turbineData(name), \`turbine ${name}\`)), opts);` (`plans.ts:333`); `const turbineUpdates = p.turbineIds.map((id) => upd(ES_PLANT.generatorInProjects, id, { statecode: p.nextStatus }, "a turbine's status"));` (`plans.ts:720`).
- **Impact**: Add WTG Type N = 20, L = 2 is 63 requests / 6 waves, against about 9 / 4 with bulk. A toggle with N = 50 is 52 requests, against about 5–9. Each POST/PATCH also returns the full row (`return=representation`). The 16-wide groups sit well under the 52-request ceiling, but a project with 200 turbines × 3 AllWTG costs reaches 800 allocation POSTs.
- **Evaluation of the reference implementation** (`data/generatorsBulk.ts`): what it does well:
  - fail-closed validation, including the OBU bind and duplicate ids (`:199-220`);
  - pre-generated ids, so a retried 429/503 cannot duplicate rows (`:270-294`);
  - the sleep between retries happens outside the gate;
  - a 501 on the first chunk falls back per row (`:399-411`);
  - the per-row create checks the returned key (`:315-323`);
  - exact `landedIds` on a partial failure.

  Gaps to close before the switches go on:
  - (a) Parallel chunks make a partial landing possible: 20 rows are 2 chunks (`bulkWrites.ts:351-356`). `turbines` on without `createRollback` leaves a type with fewer turbines than `numberOfGenerators`. The 16-wide single creates have the same exposure, so it is no worse, but the flags should be flipped together or the dependency documented.
  - (b) Whether `UpdateMultiple` accepts `statecode` on `vsb_generatorinproject` is not verified. The status bulk path depends on it.
  - (c) Bulk writes share `saveGate` (24, `bulkSend.ts:379`) with Add Cost from Table: two screens in one tab would share the slots.
  - (d) Lock behaviour of parallel chunks of children under one parent type is unmeasured (see `bulkSend.ts:112-118` "UNVERIFIED").
- **Proposed solution**: run the DEV test plan per flag (`allocations` first, the simplest: create-only on a leaf table). Flip `turbines` together with `createRollback`. Probe `statecode` in `UpdateMultiple` before `status`. Record each flip in 02-OPEN-DECISIONS.
- **Behaviour change?** needs product decision (a whole-chunk divergence, DEC-4).
- **Risk**: M · **Dependencies**: DEV access, DEC-4, PA-13 · **Validation**: `[VSB] DATA` counts before/after on DEV; row-by-row comparison with the per-row path (same rows, binds, OBU); forced 429 and 501 · **Priority**: P1 · **Confidence**: high (counts), medium (gain until measured).

### CA-14 - CAPEX panel Delete: four sequential phases of per-row deletes (re-raise of OPT-23 with new evidence)

**Priority P2, confidence Medium.** Source scope: Cost A: CAPEX/DEVEX, Add Cost from Table, shared costing layer.

- **Area** bulk / transaction. **Screen** CAPEX Delete line. **File:line** `data/capexWrites.ts:845-870`, `:645-658` (gate 4). **Function** `deleteCostLineBulk`.
- **Problem** Comments read, comment deletes, month deletes, contract delete, each phase 4 wide: `1 + ceil(K/4) + ceil(M_c/4) + 1` waves, then the awaited reload (CA-05). A 120-month line is about 30 delete rounds (register OPT-23). The register parked it because "this code deliberately avoids relying on" the cascade. New evidence: the Add Cost bulk Save already relies on the contract-to-cost and contract-to-comment cascade for every removed contract in live use (`data/addCostSheet.ts:564`: "their cost rows and comments go by the Dataverse cascade"; measured at about 5.2 s per contract on DEV per D51 section 11.14, quoted from the log), and the canvas deletes only the comments and the contract (code comment in `capexWrites.ts` above `deleteCostLine`).
- **Evidence** `capexWrites.ts:864-867`: `await log.step("contract delete", () => deleteRecord("delete CAPEX contract", "vsb_capexprojectcontracts", plan.contractId), ...)` after the two `deleteMany` phases.
- **Impact** About `ceil(M_c/4)` delete waves removed for a long line, at the price of one cascading server delete (lock duration) instead of `M_c` small ones.
- **Proposed solution** Follow the canvas: keep the comment deletes (CA-18 behaviour), skip the explicit month deletes and rely on the cascade, behind a switch like `PANEL_BULK_SAVE`.
- **Behaviour change?** needs product decision (DEC-5). **Risk** medium (cascade lock time on large lines; a Restrict setting in another environment would fail the delete visibly through `deleteRecord`). **Validation** DEV: delete a 120-month line with the switch on, compare `[VSB]` timings, confirm the months are gone. **Priority** P2. **Confidence** medium.

### CB-06 - Land Lease allocation writes are single-row loops; `CreateMultiple` / `UpdateMultiple` fit them

**Priority P2, confidence Medium.** Source scope: Cost B: Contracts, OPEX, Land Lease, periods.

- **Area** bulk · **Screen** Land Lease
- **File:line** `features/cost/periods/landLeaseRules.ts:2912-2934` (save), `:3503-3516` (import); `data/landLease.ts:529-532, 571-579`;
  `data/generatorsBulk.ts:65-68`
- **Function** `planLeaseSave`, `planStandardImport`, `runLeaseWritesInTiers`
- **Problem** A Period-1 save re-writes every allocated row, by canvas parity (`diffAllocation`, the comment at `:1599-1600`), one
  PATCH each, 8 wide. The import creates one POST per generator. All of them are independent rows of one join table with no plugin
  or flow (§6).
- **Evidence** `for (const row of diff.toUpdate) { ... writes.push({ op: "update", entitySet: LEASE_ENTITY_SET.allocation, ...` (`:2922-2930`);
  `if (!tier.every((w) => w.op === "delete")) return WRITE_CONCURRENCY;` (`landLease.ts:530`);
  `table("vsb_landleaseallocationwtgs", "vsb_landleaseallocationwtg", "vsb_landleaseallocationwtgid", true, ...)` (`generatorsBulk.ts:67-68`).
- **Impact** A 40-WTG Period-1 save spends 5 of its 9 waves and 40 of its 44 requests on allocations (D160 §6). With bulk, that is
  1 request, and the save becomes ≈ 5 waves. The import: allocations 5 waves → 1. Each bulk request is all-or-nothing, which is
  better than today's "siblings in flight may land" divergence (D160 §6).
- **Proposed solution** In `runLeaseWritesInTiers`, send an allocation tier of the same op ≥ 2 rows as one `UpdateMultiple` /
  `CreateMultiple` through the Generators bulk backend, which already registers this table. Keep the per-row path as the
  501 fallback (D51 pattern). Deletes stay per row, because DeleteMultiple is for elastic tables only.
- **Behaviour change?** none (same rows, same columns, same order of tiers). The allocation `Name` skip stays deferred (DEC-5).
- **Risk** Medium: bulk on this table is untested on DEV (OPT-21 / DEC-4). The `environment_<id>` entry must stay (CONVENTIONS rule 9).
- **Dependencies** DEC-4 DEV test plan; `data/bulkSend.ts` tuning.
- **Validation** Unit: a 40-allocation plan sends 1 bulk request, and the 501 fallback sends 40. DEV: the request count in the
  `[VSB]` lines.
- **Priority** P2 · **Confidence** Medium

### PA-06 - Revenues Save deletes every stored hedge volume and re-creates every volume

**Priority P2, confidence High.** Source scope: PM A: Generators, Production, Revenues, Finance.

- **Area**: bulk / payload · **Screen**: Revenues · **File:line**: `features/pm/revenues/rules.ts:2926-2970`; `Screen.tsx:825-835`
- **Function**: `planSaveContract`
- **Problem**: an Edit Save of an Individual contract sends V DELETEs and M POSTs, even if one value changed. That follows the canvas `RemoveIf` + `ForAll(Patch(Defaults))`.
- **Evidence**: `...together(volumeDeletes, { limit: LEAF_DELETE_CONCURRENCY }), ...together(volumeCreates, perf.wideCreateGroup ? { limit: WIDE_GROUP_CONCURRENCY } : undefined)` (`rules.ts:2965-2966`).
- **Impact**: V = M = 25 is 52 write requests in 5 waves; a diff would be the changed rows only. A failure between the groups leaves the contract with fewer volumes (D136 §2, accepted divergence).
- **Proposed solution**: option A, a diff by year: update a year that stayed (only when its value or dates changed), create new years, delete removed years. Option B, keep delete-and-recreate but send the creates as `createMany` (needs `registerBulkTables` for `vsb_revenueindividualhedgevolumes` and the OBU guard; D136 §4 deferred it pending a timing).
- **Behaviour change?** needs product decision (A keeps row ids and `createdon`; the canvas re-creates). No flow or plugin is on the table (`revenuesFlags.ts` header).
- **Risk**: M (A: PATCH upsert without `If-Match`; B: chunk partial landing) · **Dependencies**: PA-02 pattern for registration · **Validation**: writePerf tests (UT-REVPERF style), DEV row compare · **Priority**: P2 · **Confidence**: high.

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

### CB-10 - OPEX cascade and re-chain PATCH loops could be one `UpdateMultiple`

**Priority P3, confidence Medium.** Source scope: Cost B: Contracts, OPEX, Land Lease, periods.

- **Area** bulk · **Screen** OPEX
- **File:line** `data/periodWrites.ts:497-502, 529-536`; `data/generatorsBulk.ts:71-72`
- **Problem** The k cascade PATCHes carry the same 11 columns, and the f re-chain PATCHes carry 1 column each. All are on one table
  with no plugin or flow. The Generators bulk registry already lists `vsb_opexprojectcosts` as update-only.
- **Evidence** `await Vsb_opexprojectcostsService.update(child.id, cascade as never)` inside `firstFailureOf` (`:497-502`).
- **Impact** k ≤ 9: ceil(k/8) waves → 1 request. The gain is small because chains are short.
- **Proposed solution** As CB-06. Keep the "try every child, report the first failure in order" warning semantics: a bulk failure is
  all-or-nothing per request, so the warning text would name the request.
- **Behaviour change?** needs product decision on the warning text when a bulk request fails (the canvas tries every child).
- **Risk** Medium (bulk untested on DEV) · **Dependencies** DEC-4 · **Priority** P3 · **Confidence** Medium

### PA-13 - Bulk `updateMany` always pays a guard read, even where `UpdateMultiple` itself would refuse a missing id

**Priority P3, confidence Medium.** Source scope: PM A: Generators, Production, Revenues, Finance.

- **Area**: bulk (evaluation) · **Screen**: Generators, Finance · **File:line**: `data/generatorsBulk.ts:421-428, 356-370`
- **Function**: `updateMany`, `readExisting`
- **Problem**: ⌈N/40⌉ existence reads (8 at once) before every bulk update. The code's own note says `UpdateMultiple` "on a missing id fails the request". The guard is therefore only essential for the per-row PATCH fallback (an upsert) and for multi-chunk splits (to avoid a partial landing).
- **Evidence**: `// GUARD (plan §9.5): UpdateMultiple on a missing id fails the request, and a per-row PATCH without If-Match would RE-CREATE it.` (`:421-422`).
- **Impact**: 1–2 requests plus 1 wave per bulk update (inactive today).
- **Proposed solution**: skip the guard when the step is one chunk and the per-row flag is not set. The chunk is atomic, so a missing id fails it with nothing written. Keep the guard otherwise.
- **Behaviour change?** the error class changes (`BulkBatchError` instead of `BulkRowsGoneError`), so the user message must stay "reload" → needs product decision (UX only).
- **Risk**: M (relies on unverified `UpdateMultiple` semantics; probe on DEV first) · **Dependencies**: PA-01 · **Priority**: P3 · **Confidence**: medium.

