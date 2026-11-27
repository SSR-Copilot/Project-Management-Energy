# Stage 2, agent B: root-cause validation and remediation strategy (planning only)

> 26 Nov 2026. Base `dde9e92`, worktree `feature/bottleneck-identification-optimization`. Nothing under `ProjectCosts-CodeApp/` was edited. Two existing test files were RUN to confirm pinned numbers (`generationWaves.test.ts`, `financePerf.bench.test.ts`) and one throwaway model was written under `_bench/S2B/` (`s2b.bench.test.ts`, output `s2b.bench.out.txt`). **No live Dataverse, host or browser was available.** Every second in this document is DERIVED from unit costs recorded in the repo (D144: 0.25-0.5 s per single write, 0.18 s trivial call, 0.45-0.85 s `vsb_projects` PATCH; D51: one bulk request 0.6-1.9 s, model `a + b x rows` with a = 0.5 s, b = 0.027 s, marked PROVISIONAL in `bulkSend.ts`). Rounds and request counts are exact where a repo test pins them and formula-derived otherwise.

## 1. Scope

Themes T3 (write amplification), T4 (cascade / clean-up) and T5 (saves that wait for reloads) of doc 14, minus every `SPA-` ID (agent A). 23 findings:

| Theme | Findings |
|---|---|
| T3 | SPB-01 (P1), NET-13 (P1, merged SPB-03), SAD-07, SAD-08, SCC-06, SCC-09, SCC-12, SCC-13, SPB-04 (merged NET-19), SPB-07, SPB-08, SPB-10, SAD-09, SPB-15 |
| T4 | NET-14 (P1, merged SAD-04), SCC-02 (P1), SAD-05, SCC-08 (merged NET-15) |
| T5 | SCC-04, SCC-07, SPB-09, SAD-03, SAD-14 |

Not owned: SPA-01, SPA-02, SPA-06, SPA-14, SPA-17 (agent A). Where my fixes touch shared files with theirs, see section 8.

## 2. Source state of the switches that decide these findings (read in the current tree)

| Switch | File | Value | Meaning here |
|---|---|---|---|
| `GENERATORS_BULK.{allocations,status,applyAll,turbines,replace,createRollback}` | `data/generatorsBulkFlags.ts:18` | all `false` | Generators bulk path built, never run on DEV |
| `CHECKLIST_BULK.materialise` | `data/checklistBulkFlags.ts:7` | `false` | agent A |
| `financePerf().bulkSchedules` / `changedRowsOnly` | `data/financeFlags.ts:41-43` | `false` / `false` | The header comment says `changedRowsOnly` "default ON"; the code is OFF ("integration: off until product approves") |
| `PRODUCTION_GENERATION_WAVES` / `PRODUCTION_WIDE_GROUPS` | `features/pm/production/rules.ts:1625` / D145 | `true` / `true` | The Save group is 16 wide; **the generation groups are 8 wide** (`groupIntoWaves` calls `together(run, {stopOnFailure:true})` with no limit) |
| `GENERATORS_PERF.{relaneWrites,replaceLanes,wideGroups,deleteReadWaves,productionLeanReload}` | `data/generatorsPerfFlags.ts:113` | `true` | D144 live |
| `GENERATORS_PERF.{flowBesideReads,omGuardOneRead,readsByProject}` | same | `false` | SPB-04, SPB-14, SPB-05 wait for owner or probe |
| `GENERATORS_DELETE.tieredDeletes` | `data/generatorsDeleteFlags.ts:32` | `true` (leaf 16, cascade 4); `verifyDeletes`, `parentOrder`, `guardedUpdates` `false` | |
| `ADMIN_OPT.CLEANUP_RESILIENT` | `data/adminFlags.ts:40` | `true` | Clean-up retries and settles; request volume unchanged |
| `REQUEST_DEADLINES`, `GLOBAL_GATE` | `data/requestFlags.ts:20,26` | `false`, `false` | See section 4.2 and 4.3 |
| `POLICY_PLAN_WRITES`, `POLICY_BULK_TRANSPORT`, `POLICY_ADMIN_WRITES`, `POLICY_VERIFY_READS` | `data/requestFlags.ts:36-48` | all `true` | A single create in a plan retries a 429 only; PATCH and delete also retry 5xx and network errors |
| `BULK_SAVE`, `DEFER_CONTRACT_DELETES`, `DEFER_COST_DELETES`, `PANEL_BULK_SAVE`, `CANVAS_PARITY_DELETION` | `addCostSheet.ts`, `capexWrites.ts:171`, `Screen.tsx:61` | `true` | Add Cost bulk (D51) is the live-proven reference |
| `DEEP_INSERT_NEW_CONTRACTS`, `BACKGROUND_SAVE`, `PANEL_STABLE_ID`, `STABLE_CREATE_IDS` | `addCostSheet.ts:360`, `backgroundSave.ts:56`, `capexOptFlags.ts:51`, `leaseOpexFlags.ts:23` | `false` | |
| `LEASE_WRITE_PARALLEL`, `LEASE_TIER_WIDER`, `LEASE_GUARD`, `LEASE_LEAN_RELOAD` | `landLease.ts:608`, `leaseOpexFlags.ts` | `true` | |
| `REVENUE_PERF.{parallelVolumeWrites,wideCreateGroup}` | `data/revenuesFlags.ts:33` | `true` | |

## 3. RCA verdict table

| ID | Verdict | Classification | Isolated / cross-screen | Note |
|---|---|---|---|---|
| SPB-01 | ACTUAL | execution order + implementation (one request per row, groups 8 wide) | isolated (Production), once per project | Stays P1 for the new-project journey. Fix in two steps: 16-wide groups first (D145's reason to refuse no longer holds, see 5.1), bulk allocations second |
| NET-13 | OVERSTATED | architecture (per-row writes) + data volume (N x L) | isolated (Generators) | At the DEV-measured size (20 turbines, 1 all-WTG cost) the save is 5 forced write rounds; bulk does not shorten it (S2B model: 2.3 s bulk against 2.0 s singles). Bulk pays only above about 60-100 rows. Downgrade P1 to P2 |
| NET-14 (SAD-04) | OVERSTATED | data volume + architecture (no bulk delete exists) | isolated (admin) | The critical path is the 16-wide delete phase; zeroing through `UpdateMultiple` leaves it unchanged. Volumes unknown. Downgrade P1 to P3 until counted |
| SCC-02 | OVERSTATED | implementation (pool width 4) + data volume | isolated (CAPEX panel) | The lever is the width, not the cascade (cascade took 5.2 s for one contract in D51 and the canvas parity argument is the other way round). Downgrade P1 to P2 |
| SAD-05 | ACTUAL | implementation (no unload guard) | isolated | Resilience, not speed |
| SAD-07 | SHARED-ROOT | architecture (guarded update = GET + PATCH per row) | cross-screen (5 admin screens) | Root of SAD-08, SAD-09 (part), the zero phase of NET-14 |
| SAD-08 | SYMPTOM of SAD-07 | execution order | isolated | Width 4 is deliberate (one server flow run per PATCH) |
| SCC-04 | OVERSTATED | execution order (background duplicate read) | isolated | Not on the Save's critical path (D51 timeline: onSuccess 8.1 ms) |
| SCC-06 | ACTUAL | execution order | isolated (Land Lease panel Save) | Guards of independent tables run in series |
| SCC-07 | ACTUAL | execution order (awaited reload) | isolated | Same trade Production and Generators already took |
| SCC-08 (NET-15) | OVERSTATED | architecture, product decision DEC-A | isolated | The canvas itself deletes children explicitly, so today's code is parity |
| SCC-09 | ACTUAL (smaller than stated) | implementation (width 8) + data volume | isolated | 16-wide captures most of the gain without a bulk path |
| SCC-12 | OVERSTATED | execution order | isolated | At most the second hop, 556 ms measured |
| SCC-13 | UNRESOLVED | server cost of a bulk row | isolated | Needs the P0.3 probe of `17-ADDCOST-SAVE-PERF-PLAN.md` |
| SPB-04 (NET-19) | OVERSTATED | execution order | isolated | Stage 1 quoted the pre-D144 baseline; D144 recorded live "after" numbers (4.30 s, 3.78 s) |
| SPB-07 | ACTUAL | implementation (delete-all and create-all) | isolated | Only a changed-rows write cuts rounds; bulk does not |
| SPB-08 | ACTUAL (small) | implementation (rewrites unchanged rows) | isolated | Switch exists and is OFF; bulk would add rounds |
| SPB-09 | ACTUAL | execution order (awaited reload) | cross-screen (Revenues, Finance; same shape as Land Lease SCC-07) | |
| SAD-03 | ACTUAL (small) | execution order | isolated | |
| SAD-09 | ACTUAL (small) | implementation | isolated | |
| SAD-14 | NOT-A-BOTTLENECK | design | isolated | The refetch is the panel's freshness rule |
| SPB-10 | NOT-A-BOTTLENECK | design | isolated | Chain bounded by guarantees already reviewed in D108 / D145 |
| SPB-15 | ACTUAL | implementation | isolated (every Generators save) | Needs a product answer before any skip |

Shared roots (doc 12): R3 (write engine per row, bulk OFF) holds SPB-01, NET-13, SAD-07, SAD-08, SAD-09, SCC-06, SCC-09, SCC-12, SCC-13, SPB-07, SPB-08, SPB-15, SPB-10. R4 (client cascade / clean-up) holds SCC-02, SCC-08, NET-14, SAD-05. T5 is a third, smaller root: the shared `usePlanWrite` default (`await` the reload) and the Land Lease `onSuccess` await.

## 4. Cross-cutting analysis that every task below relies on

### 4.1 Which existing, proven pattern each recommended bulk or width change reuses

"Proven" means seen live on DEV and recorded. **Only Add Cost from Table (D51, 27 Oct 2026) is proven**: `CreateMultiple` and `UpdateMultiple` on `vsb_capexprojectcontracts` and `vsb_capexcosts`, client-minted ids honoured (new cost rows bound to a just-created contract id), measured 0.6-1.9 s per bulk request, 60-96 rows saved in 1.6-1.9 s (was 9.5 s). The **Generators bulk backend (`data/generatorsBulk.ts`) has never been run on DEV** (D115 test plan GB-01 ... GB-74 unrun), and neither have Finance's or Production's use of it. D144 proved live that 16 writes in flight on `vsb_generatorinprojects` and `vsb_landleaseallocationwtgs` work for a 20-turbine save.

| Change | Reuses | Proven where | What the DEV test must show FIRST |
|---|---|---|---|
| T-B01 Production generation groups 16 wide | `WIDE_GROUP_CONCURRENCY`, `together(..., {limit})` | 16-wide groups live: Generators saves (D144 measured run, 20 turbines) | Run one generation (4 land leases, 30 turbines) with `[VSB]` lines: no 429 at 16 in flight on `vsb_landleaseallocationwtgs`, `vsb_landleaseperiods`, `vsb_opexprojectcosts`; rows and owning BU identical to the 8-wide run; the three CAPEX plugins fire once from the flags write (D135 check list) |
| T-B02 Production allocations as one `createMany` | `createGeneratorsBulkBackend` (`vsb_landleaseallocationwtgs` is already in `GENERATORS_TABLES`, `creates: true`), the engine's bulk step with `@created#n` resolution (`executePlan.ts:496`), client ids as in D51 | Client ids on `CreateMultiple`: D51 live. The backend and this table: **not proven** | GENERATORS-BULK-DEV-TEST-PLAN **GB-30, GB-31, GB-33, GB-71** on this table (accepted with `@odata.bind` to a cost created one step earlier, id honoured, owning BU set, 8 parallel chunks of 15 to 100 rows without 429, rows equal to the sequential oracle) plus P-3 (what a missing id returns) |
| T-B03 Generators size-gated bulk (allocations, turbines) | same backend; flags `GENERATORS_BULK.allocations` / `turbines` already wired in `plans.ts:254,324` | not proven | **GB-30, GB-31, GB-50, GB-51, GB-52 (polymorphic type bind read-back for the turbines), GB-53, GB-70 (one fabric sync row per save), GB-71, GB-72**, and the B0 baseline so "after" has a "before" |
| T-B04 CAPEX panel delete width 4 to 8 | `deleteMany` with a limit, `gatedCostDelete`; leaf tier 16 (`LEAF_DELETE_CONCURRENCY`) | leaf 16 live in Generators deletes (tier numbers still from the unfilled GB-13 table) | The GB-13 table shape for a 58-month and a 200-month contract at 4, 8, 16: seconds, slowest request, any 429 or lock stall |
| T-B05 Land Lease allocation tier 16 wide | same `WIDE_GROUP_CONCURRENCY` | as T-B01 | A 40-allocation Save at 8 and at 16: seconds, no 429 on `vsb_landleaseallocationwtgs` |
| T-B06 admin chunked existence guard | `idIn` existence read per 40 ids (`verifyGone.ts` OPT-22, `generatorsBulk.readExisting`), `readPolicyPage` | existence reads by id are ordinary reads (proven) | Nothing new for the read. The decision DEC-7 (race window of one chunk) is the gate |
| (not recommended) Finance `bulkSchedules`, Generators `status` / `applyAll` / `replace`, Revenues volumes `createMany` | Generators backend | not proven | Not recommended: the S2B model and `financePerf.bench.test.ts` show equal or more rounds (section 6) |

### 4.2 Global gate and throttling interplay (NET-05, CMP-04)

- Bulk requests go through `gatedWrite` (the Add Cost `saveGate`, 24) and `loggedBulkRequest`; they **bypass the global gate** (`GLOBAL_GATE` is a `sendWithPolicy` feature and `bulkTransport` does not call it, `generatorsBulk.ts:272-296`). Enabling `GLOBAL_GATE` later therefore neither caps nor counts them.
- In flight per change: T-B01 at most 16 (groups run one after another) plus the background reload of the screen (about 5 reads): about 21, well under 52. T-B02 at most 8 bulk requests plus the same reads. T-B03 at most 8 plus the 16-wide groups, which never run at the same time as a bulk step in one plan (`together()` forbids bulk inside a group). T-B04 raises the CAPEX panel gate from 4 to 8: `24 + 4 + 4 + 8 = 40` under `UT-BULKCHUNK-004` (`bulkTuning.test.ts:126`, which hard-codes `PANEL_DELETE_LIMIT = 4` and must be edited). Going to 16 would give 48 before any read and is **not** recommended.
- CMP-04 (quadratic gate) only bites with thousands of queued tasks. None of these changes queues more than the pool limit in the global gate because the pool gates (`createGate(limit)`) sit in front. **CMP-04 does not block any task here.** NET-05 (reads outside every gate) is relevant to the reload fan-outs that follow each save, not to the writes.
- Service protection (HTTP 429): the real figure is requests per user per 5 minutes (6,000, D165 doc 01). Bulk cuts it by 20x for the Production generation (831 to 39 requests at 200 turbines). The NET-14 clean-up is the only change set where the request count itself could approach that limit.

### 4.3 Unknown outcome and retries

The idempotency matrix is in `requestPolicy.ts:13-23`. For the tasks here: a single create in a plan retries a 429 only; a bulk request retries a 429 (and a 503 with Retry-After) only (`retryDelay`); a PATCH with absolute values and a delete also retry 5xx and network errors. So:

1. **No task adds a retry.** A failed bulk chunk surfaces as `BulkBatchError` with exact `rowsLanded`; the engine reports `PlanError.maybeLanded` (row ids it cannot confirm). Production's generation stops before the four flag writes, exactly as it does today (UT-PRODPLAN-009 pins that for the 8-wide plan).
2. **The partial-family hazard is unchanged in kind, smaller in frequency.** After a failed generation the existing-contracts check treats the half-built family as present, so a second save never completes it (D135/D145). Bulk makes a chunk atomic (a chunk lands whole or not at all), so a refused chunk leaves fewer partial rows than a refused single create did. It does not make a rerun safe: a rerun builds new ids. Making it safe (deterministic ids or an upsert read-back) is out of scope; recorded as a DECISION request in section 9.
3. **`REQUEST_DEADLINES` is OFF.** If another stage turns it on (NET-16), a timed-out bulk request becomes `UnknownOutcomeError` and the reconcile path of each bulk consumer must be re-verified. The Generators engine path (`maybeLanded`) already handles it by design; Production's hook does not read `maybeLanded` today. Task T-B02 therefore has a dependency on NET-16's decision (section 8).
4. **`PANEL_STABLE_ID` and `STABLE_CREATE_IDS` are OFF** (a plain POST with a client key is unproven). T-B02 and T-B03 use bulk rows with client ids, which `generatorsBulk.assertKeyHonoured` checks on the per-row fallback and D51 proved on `CreateMultiple`; they do not depend on those two switches.

### 4.4 Business-behaviour guards that every proposal keeps

Owning-BU bind on every create (the bulk backend fails closed without it: T-B02 builds rows only when the project has a business unit and otherwise keeps today's single creates, because the generation's allocation rows do not bind the project and `ownerBindGuard` would not refuse them, `ownerBindGuard.ts:57`); existence guards (T-B06 keeps `RecordGoneError` per row at its own turn; T-B05 keeps per-step guard semantics UT-LLDVOPT-003/003b); write-order pins (contract before periods before allocations in Land Lease; comments before cost rows before the contract in the CAPEX delete; costs before the four CAPEX flags in Production; type before turbines before roll-up in Generators).

## 5. Per-finding specifications

### 5.1 SPB-01 Production first-save generation (P1) -> tasks T-B01 and T-B02

1. **Current implementation.** `features/pm/production/hooks.ts:218-235` (`generateIfDue`) runs `planStandardContracts(await loadGenerationInputs(project))` (`rules.ts:1682`). The plan is every create in canvas order; `groupIntoWaves` (`rules.ts:1654`) turns independent creates into `together(run, {stopOnFailure:true})` groups at the default width 8 (`WRITE_CONCURRENCY`). Allocation creates (`rules.ts:1734-1743`, one per generator per all-WTG cost) are the only 100+-row part. Engine: `executePlan.ts:661-717`; each create goes through `sendWithPolicy("create")` (`executePlan.ts:337`).
2. **Root cause (validated).** One request per row, sent 8 at a time, with the parents forced before their children: rounds = sum of `ceil(group/8)`. I re-ran `generationWaves.test.ts` (9 tests pass): 151 writes in 8 steps and **22 rounds** at 30 turbines (UT-PRODPLAN-003), 831 writes and **109 rounds** at 200 (UT-PRODPLAN-004 prints `requests=831 steps=8 round-trips=109`). The S2B model gives 431 writes and 58 rounds at 100 turbines. Allocations are 120 of 151 writes at 30 turbines. **RCA: ACTUAL, implementation + execution order, isolated, once per project.** One correction to Stage 1: D145 refused to widen these groups because "a throttled create there leaves a family half-built" and because the Save path "has no write retry". Since T-11 (`POLICY_PLAN_WRITES` = true, `executePlan.ts:332-337`) a 429 on a create is retried with backoff, so the stated reason no longer holds for 429; the half-built hazard for a 5xx is the same at 8 wide and at 16.
3. **Proposed implementation.**
   - **T-B01.** `rules.ts`: add `PRODUCTION_GENERATION_WIDE = true` beside `PRODUCTION_GENERATION_WAVES`; `groupIntoWaves(writes, { limit })` passes `limit: WIDE_GROUP_CONCURRENCY` to `together`; `planStandardContracts(input, { waves, wide })` forwards it. `wide: false` is today's plan exactly (CONVENTIONS rule 15).
   - **T-B02.** `rules.ts`: `planStandardContracts(input, { bulkAllocations, newId })`. When the flag is on, the project has `owningBusinessUnitId` and allocation rows exist, the allocation `create(...)` calls collect rows `{id: newId(), data}` instead of pushing writes (parent cost indexes `createdRowRef(costIdx)` are unchanged because costs keep their create order; allocations are never referenced by later writes). One `createMany(ES.landLeaseAllocationWtgs, rows, ...)` is inserted before the flags update; `groupIntoWaves` already treats any non-create as a barrier (`rules.ts:1665`). `hooks.ts` passes `newId: newRowId` and the flag (`rules.ts` stays pure, CONVENTIONS rule 5). New small module `data/productionBulk.ts` that side-effect imports `registerDefaultBulkBackend(createGeneratorsBulkBackend)`, loaded by `import()` only when the flag is on, exactly as `data/checklistBulk.ts` and `data/financeBulk.ts` (PA-02: without the registration `getBulkBackend()` throws after earlier writes landed). New flag `PRODUCTION_BULK = { allocations: false }` in its own file (independent of `GENERATORS_BULK` so each screen is rolled out and rolled back on its own evidence).
4. **Expected technical benefit** (counts exact where pinned; seconds DERIVED, 0.25 / 0.40 / 0.50 s per single round, bulk round `0.5 + 0.027 x rows per chunk`):

   | Generation (4 land leases, 3 device types) | Writes / requests | Rounds | Seconds (low-high, mid) |
   |---|---|---|---|
   | 30 turbines, today | 151 | 22 | 5.5-11.0 (8.8) |
   | 30, T-B01 (16 wide) | 151 | 13 | 3.3-6.5 (5.2) |
   | 30, T-B01 + T-B02 | 39 (120 rows = 8 bulk requests of 15) | 5 + 1 bulk | 2.2-3.4 (2.9) |
   | 100 turbines, today / T-B01 / both | 431 / 431 / 39 | 58 / 32 / 5 + 1 bulk | 14.5-29.0 / 8.0-16.0 / 3.1-4.3 |
   | 200 turbines, today / T-B01 / both | 831 / 831 / 39 | 109 / 56 / 5 + 1 bulk | 27.3-54.5 / 14.0-28.0 / 4.5-5.7 |

   (`_bench/S2B/s2b.bench.out.txt`; the model builds the bulk variant from the real `planStandardContracts` output and renumbers the refs.) The 2 read waves of `loadGenerationInputs` and the flags write are unchanged.
5. **User-visible.** The "loading standard contracts" dialog after the first yield save of a new project: about 9 s to 3 s at 30 turbines, 44 s to 5 s at 200 (DERIVED). Once per project.
6. **Dependencies.** T-B01: DEV check of 16-wide on three tables. T-B02: T-B01 not required but sequence it after; GB-30/31/33/71; P-3; section 4.3 point 3 (NET-16). Not blocked by NET-05 or CMP-04 (4.2).
7. **Functional risks.** Creation order of rows inside a run differs on the server (already accepted in D135, no reader sorts by `createdon`; the readers without `$orderby` need the live check D135 lists). Bulk rows: the polymorphic-lookup risk (GB-52) does not apply to allocations (plain lookups to cost and generator). A failed chunk leaves a half-built family as today. Allocation `vsb_name` strings are unchanged (golden master).
8. **Performance risks.** Lock contention between 8 parallel chunks that all bind the same four cost rows (parent row locks; the D51 lesson was cascades, not creates, but unmeasured here). 16 in flight may draw 429 on a tenant with a low limit: retried by policy.
9. **Complexity.** T-B01 Low (about 15 lines and tests). T-B02 Medium (about 80 lines in `rules.ts`, a 20-line module, hook wiring, one flag file).
10. **Tests.** Extend `features/pm/production/generationWaves.test.ts`: UT-PRODPLAN-010 (T-B01: round trips 13 / 32 / 56 for 30 / 100 / 200 turbines, `wide:false` stays 22 / 58 / 109), UT-PRODPLAN-011 (peak in flight through the real `executePlan` is at most 16, same bodies as the 8-wide plan), UT-PRODPLAN-012 (a 429 on a create inside a 16-wide run is retried and the plan completes; a 500 stops the plan and writes no flags, `e.done` true). New `generationBulk.test.ts`: UT-PRODBULK-001 (rows equal to the sequential plan as a multiset, every row has the owner bind and a unique id), -002 (refs resolve to the right cost ids through a fake backend), -003 (no owner: falls back to single creates, nothing sent through bulk), -004 (a failed chunk: no flags written, `PlanError.done` and `maybeLanded` true), -005 (flag off = today's plan), -006 (400 seeded random assumption sets, extending UT-PRODPLAN-006), -007 (steps 8 to 6, requests 151 to 39, rounds pinned), -008 (the default backend is registered when the flag is on).
11. **Acceptance.** T-B01: one DEV generation, `[VSB] ACTION` line shows 22 to 13 awaited rounds and no 429; rows and BU identical (query row counts per table before/after). T-B02: GB-30/31/71 pass; `ACTION` request count 39 (30 turbines); wall time on the same project at most 50% of the T-B01 time; no `[VSB] ERROR`.
12. **Rollback.** T-B01: `PRODUCTION_GENERATION_WIDE = false`. T-B02: `PRODUCTION_BULK.allocations = false` (the plan is the sequential one byte for byte).

### 5.2 NET-13 (SPB-03) Generators bulk switches OFF (P1) -> task T-B03

1. **Current implementation.** `data/generatorsBulkFlags.ts:18-25` all false; `plans.ts:254-258` (`allocationStep`), `plans.ts:324-331` (turbines), `plans.ts:709-716` (status); transport `generatorsBulk.ts:393-461`. D144 already merged waves (`relaneWrites`, `wideGroups` 16).
2. **Root cause (validated).** Not "one request per row at 8 wide" any more: since D144 the groups are 16 wide, and the DEV-measured 3.0-3.5 s for 20 turbines is **5 forced write rounds** (type, 2 turbine rounds, 2 rounds of the final wave) plus the pre-read and the reload. Bulk replaces 43 requests by about 7 but also replaces the two group rounds by two bulk rounds that each cost at least 0.55 s. S2B model (write rounds only, mid costs): N=20 L=1 singles 5 rounds 2.0 s against bulk 2.3 s; N=5 L=1 1.2 s against 2.1 s; N=20 L=3 2.8 s against 2.3 s; N=50 L=2 4.8 against 2.4; N=100 L=3 10.8 against 3.2; N=200 L=5 30.8 against 5.8. Status toggle: singles 0.8 s (N=10) to 5.6 s (N=200) against bulk about 2.0-2.4 s flat (it adds a guard-read round): bulk wins only above about 100 turbines. **RCA: OVERSTATED as a P1, ACTUAL for large parks; architecture + data volume; isolated.** The register's "20-turbine type takes about 3 s" is a forced-rounds symptom, not a missing-bulk symptom. The Stage 1 claim "bulk benefit ESTIMATED about 9 requests" is right for requests, wrong for latency at that size.
3. **Proposed implementation.** Do **not** flip the six switches. Enable only `allocations` and `turbines`, and only above a row threshold: in `plans.ts` replace `bulkOn(opts, "allocations")` by `bulkOn(opts, "allocations") && rows.length >= GENERATORS_BULK_MIN_ROWS` (same for turbines; new constant, start 64 = four 16-wide rounds, tuned from the DEV table). Below the threshold the plan is today's 16-wide group, so a small park keeps the faster path. Leave `status`, `applyAll`, `replace`, `createRollback` OFF.
4. **Expected technical benefit.** Requests: N=100 L=3 403 to 19; N=200 L=5 1,203 to 19. Rounds: 27 to 4 and 77 to 4. Seconds (DERIVED): 10.8 to 3.2 and 30.8 to 5.8. At DEV sizes (N=20-24, L=1): none by design (stays on singles).
5. **User-visible.** Only large wind parks (rows at or above the threshold); other users see no change.
6. **Dependencies.** The D115 DEV test plan B0 baseline and GB-30/31/50-53/70-72 (section 4.1); NET-16 (4.3); T-B02 shares the backend evidence (run GB-30/31 once for both).
7. **Functional risks.** Polymorphic lookup bind of turbines in bulk (GB-52); `createRollback` stays OFF so a failed bulk leaves a partial type as the canvas does; `maybeLanded` handling exists. Rows, names and binds are the golden-master multiset (UT-GENLAT-010, UT-GENLAT-015).
8. **Performance risks.** Lock contention on the type row with 8 parallel turbine chunks; 8 parallel bulk requests plus the 12-read reload.
9. **Complexity.** Medium (small code, large DEV test).
10. **Tests.** Extend `bulkAllocations.test.ts` (UT-GEN-210...220) and `bulkTurbines.test.ts` (UT-GEN-240...247): UT-GEN-270 (below threshold the plan equals the flag-off plan for N x L grids), UT-GEN-271 (at the threshold one `createMany`), UT-GEN-272 (threshold 0 equals today's flag-on plan), `saveLatency.test.ts` UT-GENLAT-017 (rounds and requests at N=100 L=3 pinned: 4 steps, 19 requests).
11. **Acceptance.** B0 baseline filled; GB-30, GB-31, GB-50 pass; at 100 turbines x 3 costs the save takes at most 50% of the baseline (the plan's own acceptance rule, B2); one fabric sync row per save (GB-70).
12. **Rollback.** `GENERATORS_BULK.allocations` / `turbines` back to false, or threshold set to `Infinity`.

### 5.3 NET-14 (SAD-04) Admin CAPEX Accounts clean-up (P1) -> tasks T-B06 (zero phase) and MEASURE-FIRST

1. **Current implementation.** `data/adminCapexAccounts.ts:423-503`: contract id reads (4 wide), cost id reads (4 wide), then two phases side by side: zero PATCH per row (guarded: GET + PATCH, 8 wide, `updateRowsSettled`, `adminRowWrites.ts:279`) and delete per row (16 wide). `CLEANUP_RESILIENT` true.
2. **Root cause (validated).** Volume x per-row requests: 2 per zeroed row, 1 per deleted row. The code already changed on 23 Nov (side-by-side phases, rows at 0 skipped). S2B model for Z zero rows and D later-year deletes: Z=50 D=150: 250 requests, critical path 14 latencies (5.6 s); Z=550 D=1,800: 2,900 requests, 138 latencies (55 s); Z=1,100 D=3,600: 5,800 requests, about 110 s. **The critical path is `max(2 x ceil(Z/8), ceil(D/16))`**; once `D >= 4Z` it is the delete phase, which no `UpdateMultiple` can shorten (D165 doc 22 T-43: "a bulk DELETE is not available without a Dataverse custom API", outside this workstream). With a chunked guard the zero phase becomes `1 + ceil(Z/8)`; with `UpdateMultiple` it becomes about 2 latencies. **RCA: OVERSTATED (P1 to P3 until counted); data volume + architecture; isolated; rare admin action.** The one number that could make it P1 is request rate: 6,000 requests per 5 minutes is 20 per second, and 24 requests in flight at 0.4 s each is 60 per second, so a clean-up above about 1,500 requests reaches the limit in under 100 s; the retry path (`withIdempotentRetry`, `withDeleteRetry`) then handles the 429s, at the cost of a longer run.
3. **Proposed implementation.** (a) Measure first (below). (b) The zero phase uses T-B06's chunked guard (no new decision beyond DEC-7). (c) `UpdateMultiple` for zeroing only if the DEV count shows `2Z` is on the critical path, and only after the D36 section 1 lift is approved (DECISION: product owner). The reuse is Add Cost's `UpdateMultiple` on `vsb_capexcosts` (D51 live proven, `bulkSend.ts`), not the Generators backend.
4. **Expected benefit.** Z=550 D=1,800: requests 2,900 to 2,364 (chunked guard) or 1,822 (`UpdateMultiple`); critical path 55 s to 45 s either way (deletes bound it).
5. **User-visible.** None on the dialog (the clean-up is a background toast); shorter exposure window before the cost rows are right.
6. **Dependencies.** DEC-7, D36 section 1 lift, a DEV volume count (P1 doc 12 open question 1); SAD-05 (T-B07) for the unload guard.
7. **Functional risks.** Update plugins/flows on `vsb_capexcosts` firing per row under `UpdateMultiple` (to be checked against `04-flow-inventory.md` and the Add Cost evidence that no recalculation plugin runs there).
8. **Performance risks.** More parallel PATCH+DELETE; the race window of DEC-7.
9. **Complexity.** (b) Low-Medium inside T-B06; (c) High.
10. **Tests.** `adminCapexAccounts.cleanup.test.ts` UT-ADCLEAN-001...004 stay green; new UT-ADCLEAN-010 (request count n + ceil(n/40) for Z rows), -011 (a row deleted before its turn still fails as `RecordGoneError` and counts as failed, others land).
11. **Acceptance.** Count the `[VSB]` lines of one real deactivation on DEV (contracts, Z, D, seconds, any 429). Decision rule: if `2 x ceil(Z/8) > ceil(D/16)` on real data, do (b) and consider (c); otherwise accept.
12. **Rollback.** `ADMIN_OPT.CHUNKED_GUARD = false` (T-B06).

### 5.4 SCC-02 CAPEX panel Delete (P1) -> task T-B04

1. **Current implementation.** `data/capexWrites.ts:988-1011` `deleteCostLineBulk`: `loadComments([id])` (1 request), comment deletes at `PANEL_DELETE_LIMIT` = 4 (`capexWrites.ts:717`), cost deletes at 4, then the contract delete; `PANEL_BULK_SAVE` true, `CAPEX_PATCH_BOOK` true (no awaited whole-book reload).
2. **Root cause (validated).** Rounds = `2 + ceil(C/L) + ceil(P/L)`. P=58 cost rows, C=0: **17 rounds at L=4** (4.3-8.5 s), 10 at L=8, 6 at L=16; P=200: 52 / 27 / 15. The Stage 1 remedy "rely on the cascade" is weaker than it looks: (i) D51 §11.14 measured one contract DELETE at **5.2 s** by cascade (size and contention not recorded, it ran beside creates), which is the same as 17 rounds at L=4; (ii) the explicit delete is a recorded divergence made on purpose ("children first makes the outcome the same under either relationship setting", `capexWrites.ts:933-946`), and the canvas does rely on the cascade for the cost rows (`RemoveIf` commented out, lines 8122-8134), so going back is parity but unproven on speed; (iii) a cascade moves the work into one server request that cannot be retried or shown as progress. **RCA: OVERSTATED (P1 to P2); implementation (pool width) + data volume; isolated.**
3. **Proposed implementation.** Raise `PANEL_DELETE_LIMIT` from 4 to 8 (leaf rows after the comments are gone; the tier already exists at 16 in `concurrency.ts:156`). Keep the phase order (comments read, comments, cost rows, contract). Update the hard-coded `4` in `bulkTuning.test.ts:127`. Decide 16 only from the DEV table; do not exceed 8 while an Add Cost background delete can overlap (`24 + 4 + 4 + 16 = 48`). Cascade-only stays a DECISION for the product owner (it needs the DEV cascade timing below to be better than the explicit path).
4. **Expected benefit.** P=58: 17 to 10 rounds (6.8 s to 4.0 s mid); P=120: 32 to 17; P=200: 52 to 27 (20.8 s to 10.8 s). Requests unchanged.
5. **User-visible.** The Delete spinner for a 5-year monthly contract: about 7 s to 4 s (DERIVED); infrequent action.
6. **Dependencies.** GB-13-style probe; `UT-BULKCHUNK-004`; no dependency on NET-05.
7. **Functional risks.** None to order (comments before cost rows before contract unchanged; a refused delete still stops the next phase, UT-CAPEXBULK-042).
8. **Performance risks.** Lock contention among sibling cost rows of one parent (D51 saw 6-11 s requests when cascades overlapped writes; plain leaf deletes were not measured). 429 at 8.
9. **Complexity.** Low (one constant, one test constant, a probe).
10. **Tests.** `capexWrites.bulk.test.ts` UT-CAPEXBULK-040...042 stay; new UT-CAPEXBULK-043 (peak in flight on the panel gate is 8, not 4), UT-CAPEXBULK-044 (58 rows take 10 rounds in the fake-timer client); edit `bulkTuning.test.ts` UT-BULKCHUNK-004.
11. **Acceptance.** On DEV delete a 58-month and a 200-month contract at 4, 8 and 16 (the GB-13 table): choose the smallest width with no 429 and at least 35% less time than 4. Read `panelBusyLogLine` for seconds.
12. **Rollback.** Set the constant back to 4.

### 5.5 SAD-07 / SAD-08 guarded admin updates -> task T-B06

1. **Current implementation.** `data/client.ts:469-495` `updateRecordIfExists` (existence GET by key, then PATCH), used by `updateRowsEach` / `updateRowsSettled` (`adminRowWrites.ts:89,279`), `adminMilestones.ts:114-137`, `adminDefaultChecklists.ts:317-364` (`writeOrders`, width 4), `adminCost.ts:733-745,880-895`, `adminCapexAccounts.ts`.
2. **Root cause (validated).** On SDK 1.3.1 a PATCH is an upsert (no `If-Match`), so the read is the guard (`client.ts:455-460` says so). It is sent per row, 2 sequential hops per row. The rows were read moments earlier. **RCA: SHARED-ROOT (R3), architecture, cross-screen.** SAD-08 is its symptom: reorder pool width 4 is deliberate (each PATCH starts a server flow that rewrites the task in every eligible project).
3. **Proposed implementation.** New `updateRowsGuardedChunked(operation, table, primaryKey, rows, options)` in `adminRowWrites.ts`: for each batch of 40 ids one existence read (`idIn`, `readPolicyPage` with `POLICY_VERIFY_READS`, the `generatorsBulk.readExisting` shape), then the batch's PATCHes through the same pool in the same order with an unguarded `updateRecordAsync`; a row missing from the read fails at its own turn with `RecordGoneError` (same type, same position, fail-fast preserved). Switch `ADMIN_OPT.CHUNKED_GUARD`, default `false` until DEC-7 is answered. Callers keep their signatures.
4. **Expected benefit.** Requests `2n` to `n + ceil(n/40)`; latencies `2 x ceil(n/8)` to `1 + ceil(n/8)`: n=30: 60 requests / 8 latencies (3.2 s mid) to 31 / 5 (2.0 s); n=100: 200 / 26 (10.4 s) to 103 / 14 (5.6 s); n=8 or less: half the requests, no latency change. SAD-08 delete-first-of-30: soft delete 2 + 29 reorder PATCHes at width 4: 59 requests / 18 latencies (7.2 s mid) to 32 / 11 (4.4 s).
5. **User-visible.** Overlays on admin multi-row saves, reorder and account deactivation are 30-45% shorter above about 30 rows; small saves unchanged.
6. **Dependencies.** **DECISION DEC-7 (open in D165 doc 12): is a race window of one 40-row chunk acceptable for the zero/order/milestone PATCHes?** Who: product owner + tech lead. Also feeds NET-14 (b).
7. **Functional risks.** A row deleted by another admin during the batch is re-created by the upsert PATCH (window = one batch, at most 5 rounds, about 2 s; today milliseconds). Mitigation: batch size 40 and the idempotent re-run.
8. **Performance risks.** None added (fewer requests).
9. **Complexity.** Low-Medium (one helper, five call sites behind one switch).
10. **Tests.** Extend `adminRowWrites.opt.test.ts` (UT-ROWW-OPT-*): UT-ROWW-OPT-020 (request count n + ceil(n/40) for n = 1, 8, 30, 100), -021 (a missing row throws `RecordGoneError` at its position, earlier rows landed, later rows not sent), -022 (switch off = today's calls), -023 (a failed read never reads as gone); per screen `adminMilestones.test.ts`, `adminDefaultChecklists.opt.test.ts`, `adminCost.opt.test.ts` request counts.
11. **Acceptance.** Same rows and error texts in the existing tests; DEV `[VSB]` line counts for delete-first-of-30 reorder equal 32.
12. **Rollback.** `ADMIN_OPT.CHUNKED_GUARD = false`.

### 5.6 SCC-06 + SCC-09 Land Lease panel Save and allocation width -> task T-B05

1. **Current implementation.** `data/landLease.ts:572-596` the `independentSteps` branch: for each of contract, allocation, period: `await guardLeaseUpdates(inStep); await runLeaseWrites(inStep, ...)`. Tier width `leaseTierWidth` (`landLease.ts:611-614`): allocation creates and updates 8, deletes 16 (leaf) or 4 (cost cascade).
2. **Root cause (validated).** (SCC-06) A guard covers one table's key-only read and depends on nothing a previous step writes; they are series only by loop shape. A Period-1 edit has updates in the header and the period: 4 hops (guard, write, guard, write). (SCC-09) A write width of 8 for allocations although every other leaf tier is 16. **RCA: ACTUAL both, execution order and implementation, isolated.** Stage 1's SCC-09 remedy (CreateMultiple) is overshoot: 16 wide at A=40 gives 3 rounds against 5; bulk would give about 0.77 s against 1.2 s, about 0.4 s more for a path never run on this table.
3. **Proposed implementation.** (SCC-06) Start `guardLeaseUpdates` for all three steps before the loop, as promises that resolve to `undefined` or `{error}`; each step awaits its own result at its turn and records the same failure entry as today. Switch `LEASE_GUARDS_TOGETHER`. (SCC-09) `leaseTierWidth` returns `WIDE_GROUP_CONCURRENCY` for allocation create/update tiers behind `LEASE_ALLOCATIONS_WIDE`. Bulk (`T-40`) stays deferred until P-3 and until A routinely exceeds about 100.
4. **Expected benefit.** (SCC-06) Period-1 edit: 4 to 3 serial hops (one read hop, 0.2-0.5 s); header + allocation + period updates: 6 to 4. Requests unchanged. (SCC-09) A=40 creates: 5 to 3 rounds (0.5-1.0 s); A=100: 13 to 7. Requests unchanged (40).
5. **User-visible.** Every Land Lease panel Save about 0.2-0.5 s faster; saves with many allocations up to about 1 s faster.
6. **Dependencies.** One DEV check of 16 in flight on `vsb_landleaseallocationwtgs` (T-B01's table check covers it). Order: independent of T-B09.
7. **Functional risks.** Guard timing: the check for step 3 now happens earlier (before step 1 writes). Per-step failure semantics (FT-BR-LEASE-089) are unchanged because each failure is recorded at its own step; the race window grows by one write round.
8. **Performance risks.** 429 at 16 (retried by `costWrite` policy).
9. **Complexity.** Low.
10. **Tests.** `landLease.dvopt.test.ts` UT-LLDVOPT-001/003/003b stay; new UT-LLDVOPT-020 (the three guards start before the first write; wave assertion), -021 (a gone header fails only the contract step, others save), `landLeaseRules.tiersWider.test.ts` UT-LLTIER-010 (allocation creates at width 16 on, 8 off), `landLease.writes.test.ts` (same writes multiset as the sequential oracle).
11. **Acceptance.** DEV timeline of a Period-1 edit and a 40-allocation Save before/after; no 429; same rows.
12. **Rollback.** `LEASE_GUARDS_TOGETHER = false`, `LEASE_ALLOCATIONS_WIDE = false`.

### 5.7 SPB-09 (+ SCC-07) saves that wait for the reload -> tasks T-B08 and T-B09

1. **Current implementation.** `data/usePlanWrite.ts:216-221` `onSettled` returns the reload promise unless the hook was created with `refresh: "background"`; `features/pm/revenues/hooks.ts:199-204`, `features/pm/finance/hooks.ts:280-285` do not set it; Production (`hooks.ts:166-170`) and Generators do, and gate commands on `refreshing` (`Screen.tsx:420`). Land Lease: `useCostBook.ts:379-381,387-390` `await refreshLeaseBooks` (2 waves, 4 requests).
2. **Root cause (validated).** The shared default awaits the reload; two screens never opted out. Revenues balancing must keep the await (a server plugin writes the dates). **RCA: ACTUAL, execution order, cross-screen (shape shared with Land Lease).**
3. **Proposed implementation.** (T-B08) Add a per-job `refresh?: "await" | "background"` to `PlanJob` (default: the hook's value) in `usePlanWrite.ts`; Revenues contract Save/Delete and every Finance job set `"background"`, balancing keeps `"await"`; both screens' `busy` becomes `writes.progress !== null || writes.refreshing` (the Production line). (T-B09) Land Lease: do not await `refreshLeaseBooks` in `onSuccess`/`onError`; expose `refreshing` from the mutation hook and add it to the screen's busy.
4. **Expected benefit.** One read round removed from the spinner per save: Finance status toggle / panel save 2 requests, spinner 2 rounds to 1 (UT-FINPERF-007); Finance tranche save 6 rounds to 5; Revenues simple contract save 2 to 1; Land Lease save/delete: the 2-wave reload (about 0.4-1.0 s) leaves the spinner. Requests unchanged.
5. **User-visible.** 0.2-0.5 s (up to half of a small save) per Revenues/Finance save; 0.4-1.0 s per Land Lease save. Commands stay greyed until the reload ends.
6. **Dependencies.** **DECISION (canvas divergence: the canvas spinner covers the refresh):** same trade accepted for Production (D108) and Generators (D144); who: product owner. `usePlanWrite.ts` is shared with agent A's SPA-01/02/03 (section 8).
7. **Functional risks.** A command acting on stale rows during the gap: removed by the `refreshing` busy guard; a failed reload leaves the old rows until the next focus refetch.
8. **Performance risks.** None.
9. **Complexity.** Low-Medium (T-B08), Medium (T-B09).
10. **Tests.** Existing `data/usePlanWrite.test.ts`, `hooks.perf.test.tsx` (revenues), production `hooks.test.tsx` UT-PRODHOOK pattern: new UT-PLANWRITE-030 (per-job refresh override), UT-REVPERF-090 (commands disabled while `refreshing`), UT-FINPERF-030 (same), UT-REVPERF-091 (balancing still awaits), UT-LLDVOPT-030 (Land Lease busy covers the reload).
11. **Acceptance.** DEV save timing (`ACTION` line to dialog closed) 0.2-0.5 s shorter on Finance toggle; no click possible on stale rows (manual check).
12. **Rollback.** Per-job value back to `"await"` (one line per call site).

### 5.8 SPB-07 Revenues individual-volume save -> task T-B10 (DECISION)

1. **Current implementation.** `features/pm/revenues/rules.ts:2926-2972` `planSaveContract`: contract write, delete every stored volume (16 wide), create every volume (16 wide).
2. **Root cause (validated).** Canvas parity (`RemoveIf` then create per row). `UT-REVPERF-100/101` print the rounds: 12 / 12 volumes 25 requests; 36 / 36 73 requests in 7 write rounds at 16 wide. Bulk does not help (S2B: 36 rows = 4 chunks of 10, round 0.77 s against 3 rounds at 0.25-0.5 s) and deletes cannot be bulked. **RCA: ACTUAL, implementation, isolated, minority of contracts.**
3. **Proposed implementation.** Behind `REVENUE_PERF.changedVolumesOnly`: read the stored volume values with the ids (the read exists), write only added, changed-value and removed years; keep contract-first order and the owner bind. Needs `guarded` updates for changed rows (no `If-Match`).
4. **Expected benefit.** 36 / 36 with one year changed: 73 requests / 7 rounds (re-run: UT-REVPERF-100 prints `requests 73, d146RoundTrips 7`) to about 4 requests / 3-4 rounds (contract, one guarded update = read + PATCH); nothing changed but the type: 1 request. DERIVED from the plan shape.
5. **User-visible.** About 1.5-3 s to under 1 s on a long Individual-volume contract.
6. **Dependencies.** **DECISION: `modifiedon` / audit rows of unchanged volumes stop moving (canvas rewrites all); who: product owner.** D146 lists it as a rule-8 decision. Property test as D51's 400-seed equivalence.
7. **Functional risks.** A missed changed column loses an edit; stale stored values (R-12).
8. **Performance risks.** None.
9. **Complexity.** Medium.
10. **Tests.** `revenues/writePerf.test.ts`: UT-REVPERF-110 (final rows equal to delete-all plan over random inputs), -111 (request counts above), -112 (guarded gone row refuses).
11. **Acceptance.** DEV A/B: stored rows identical after a 30-year edit; timing.
12. **Rollback.** Switch off.

### 5.9 SPB-08 Finance tranche Save -> task T-B11 (DECISION, flip an existing switch)

1. **Current.** `features/pm/finance/rules.ts:3554-3634`, `financeFlags.ts:41-43`.
2. **Root cause.** `changedRowsOnly` OFF rewrites every repayment-year and step-up row. I ran `financePerf.bench.test.ts`: tranche save edit **34 requests / 6 rounds**, with `bulkSchedules` **11 / 8**; new tranche 34 / 6 against 10 / 7. Note the harness charges a bulk request the price of a plain call (25 ms), the real floor is 0.55 s-1.9 s, so bulk is slower than the table shows. **RCA: ACTUAL, small, isolated.** The user flagged Financing as a bulk reference pattern: it is a request-count pattern, not a latency one, and is useful only as lock relief above about 100 rows.
3. **Proposed.** Flip `changedRowsOnly` after the decision; leave `bulkSchedules` OFF.
4. **Benefit.** One margin edited: 34 requests / 6 rounds to about 5 requests / 4 rounds (read, tranche, one-row group, reload), derived from the group sizes.
5. **User-visible.** About 0.5-1.0 s per tranche save.
6. **Dependencies.** **DECISION: stop moving `modifiedon` of unchanged rows; who: product owner (PA-03).** `rules.changedRows.test.ts` exists.
7-8. Risks as 5.8; none for performance.
9. Low (flip). 10. Extend `rules.changedRows.test.ts` UT-FINPERF-031 (changed-only rounds and counts pinned) and rerun `financePerf.bench.test.ts`. 11. DEV: stored rows equal after an edit. 12. `changedRowsOnly = false`.

### 5.10 SAD-05 clean-up unload guard -> task T-B07

1. `features/admin/admin-capex-accounts/Screen.tsx:216-227` `cleanUpInBackground` has no `beforeunload`. 2. A tab close stops the loop half-way and no Resume exists. ACTUAL, implementation. 3. Wrap the promise in `holdBeforeUnload()` (`components/beforeUnload.ts`, the CA-03 mechanism) and release in `finally`; a `[VSB]` ACTION line via `actionLog` (rule 23). 4. No request change. 5. A browser prompt when closing during a clean-up. 6. None. 7. None. 8. None. 9. Low. 10. `Screen.test.tsx` UT-ADCAPEX-030 (hold taken while the toast is open and released on success and failure). 11. Component test. 12. Remove the wrapper.

## 6. Why not bulk elsewhere (the user's "bulk reference patterns", answered)

| Candidate | Rounds today (derived) | Rounds with bulk | Verdict |
|---|---|---|---|
| Production allocations (T-B02) | 22 / 58 / 109 | 6 incl. 1 bulk | **Yes**: 120 to 800 rows in one step |
| Generators allocations and turbines, large parks (T-B03) | 27 at N=100 L=3 | 4 | **Yes above about 64 rows**, no below |
| Generators status, apply-to-all | 2-14 | 4 (adds a guard read) | **No** below about 100 turbines |
| Finance schedules | 6 | 8 (harness, bulk charged as a plain call) | **No**; lock relief only |
| Revenues volumes | 7 at 36 / 36 | 7 (deletes stay) | **No**: changed-only write (T-B10) |
| Land Lease allocations | 5 at A=40 | 4 | **Not now**: 16 wide gives 3 (T-B05) |
| CAPEX panel delete | 17 at P=58 | no bulk delete exists | **Width only** (T-B04) |
| Admin clean-up | delete phase dominates | no bulk delete exists | **No**, guard chunking only |

## 7. Deferred, accepted or measure-first (short blocks)

- **SCC-04 (DEFER).** Not on the Save critical path (D51 timeline). Why not now: removing the first confirming read risks a stale book when the deferred deletes take 5-20 s. What would change it: a `[VSB]` count showing the two refetches delay the deletes.
- **SCC-08 (DEFER, DEC-A).** The canvas deletes allocations, periods and the header explicitly (`landLeaseRules.ts:3036-3069`, LL:6076-6087). 40 allocations + 3 periods are 5 write rounds by `leaseTierWidth` and `LEASE_TIER_WIDER` (allocations 40 at 16 = 3, periods 3 at 16 = 1, header 1), about 1.3-2.5 s DERIVED; a header-only delete saves at most 4 rounds against an unknown server cascade (5.2 s for a CAPEX contract). Change it if a DEV header-only delete of 40 allocations is at least 2 s faster.
- **SCC-12 (DEFER).** Only the second hop (556 ms measured). Deep insert is an unprobed per-contract POST and `DEEP_INSERT_NEW_CONTRACTS` stays false.
- **SCC-13 (MEASURE-FIRST).** L and XL seconds are inferred. Run the P0.3 chunk probe; no code change.
- **SPB-04 (MEASURE-FIRST).** Stage 1's baseline (5.6-6.3 s) is pre-D144. D144's live run after the change: Replace Generator Type 4.30 s, Replace PV 3.78 s (3.0-4.5 s). Remaining lever `flowBesideReads` needs the owner; delete and create lanes must not overlap (D115 decision 5).
- **SAD-03 (DEFER).** One awaited locks read per Completion Date toggle; parity with canvas `Refresh` (DCS:621). Change if the product owner confirms the refresh is not relied on.
- **SAD-09 (DEFER).** At most 18 requests on a Period-1 edit; canvas parity, owner confirmation S6-07 pending. T-B06 halves it for free if it lands.
- **SAD-14 (ACCEPT).** `openEdit` refetches so the editor starts from current values and does not open on a stale cache when the read fails (`Screen.tsx:140-163`); it is a freshness rule, one small read.
- **SPB-10 (ACCEPT).** 5-7 round trips each protecting a property (yield first and alone, fresh reads, roll-up from fresh rows); D145 already took the safe lever (16 wide). Remaining levers need a column-precision test and a `…CanvasParity` twin.
- **SPB-15 (DEFER, DECISION).** Roll-up PATCH is the slowest single write (0.45-0.85 s) and fires the Fabric sync. Skipping it when totals are equal may remove a signal the flow reads. Ask: does the flow rely on the write as a change signal (doc 04 PA-04)? After D144 it sits inside a wave on most saves, so the gain is real only for the status toggle.

## 8. Proposed Stage 3 tasks

| Task | Findings | Files touched | Shared-file conflicts | Order |
|---|---|---|---|---|
| **T-B01** Production generation 16 wide | SPB-01 (part 1) | `features/pm/production/rules.ts`, `generationWaves.test.ts` | none known | First; needs the DEV 16-wide check |
| **T-B02** Production bulk allocations | SPB-01 (part 2) | `features/pm/production/rules.ts`, `hooks.ts`, new `data/productionBulk.ts`, new `data/productionBulkFlags.ts`, new `generationBulk.test.ts` | `production/hooks.ts` with SPB-02, SPB-05-class prefetch work of the T1 owner; NET-16 (deadlines) | After T-B01 and GB-30/31/33/71 |
| **T-B03** Generators size-gated bulk | NET-13 (SPB-03) | `features/pm/generators/plans.ts`, `data/generatorsBulkFlags.ts`, `bulkAllocations.test.ts`, `bulkTurbines.test.ts`, `saveLatency.test.ts` | `data/generatorsBulk.ts` with NET-05, NET-16 | After D115 B0 baseline and GB-30/31/50-53; shares the backend evidence with T-B02 |
| **T-B04** CAPEX panel delete width | SCC-02 | `data/capexWrites.ts`, `bulkTuning.test.ts`, `capexWrites.bulk.test.ts` | `capexWrites.ts` with SCC-13-class Add Cost items (same file, different function) | After the GB-13-style DEV table |
| **T-B05** Land Lease panel Save | SCC-06, SCC-09 | `data/landLease.ts`, `features/cost/periods/landLeaseRules.ts`, `data/leaseOpexFlags.ts`, `landLease.dvopt.test.ts`, `landLeaseRules.tiersWider.test.ts` | `data/landLease.ts:172,177,303` read gates of NET-04 / SCC-10; `leaseOpexFlags.ts` with NET-02 | Independent; DEV check of 16 wide |
| **T-B06** Admin chunked existence guard | SAD-07, SAD-08, SAD-09 (part), NET-14 (zero phase) | `data/adminRowWrites.ts`, `adminFlags.ts`, `adminMilestones.ts`, `adminDefaultChecklists.ts`, `adminCost.ts`, `adminCapexAccounts.ts`, their `.opt.test.ts` | `data/client.ts` with NET-16, NET-05 (same policy helpers); admin reads SAD-02, SAD-11, SAD-15 touch the same `adminCost.ts` | After DEC-7 |
| **T-B07** Clean-up unload guard | SAD-05 | `features/admin/admin-capex-accounts/Screen.tsx`, `Screen.test.tsx` | none | Any time |
| **T-B08** Background reload, Revenues and Finance | SPB-09 | `data/usePlanWrite.ts`, `features/pm/revenues/hooks.ts`, `Screen.tsx`, `features/pm/finance/hooks.ts`, `Screen.tsx` | **`usePlanWrite.ts` with SPA-01, SPA-02, SPA-03 (agent A needs the same per-job refresh option; agree one API: per-job `refresh`)**; `finance/hooks.ts` with SPB-12 | After the per-job API is agreed with agent A; after the decision |
| **T-B09** Background reload, Land Lease | SCC-07 | `features/cost/costing/useCostBook.ts`, `LandLeaseScreen.tsx` | `useCostBook.ts` with NET-02 (line 81), SCC-04 (lines 722-855), BND-02 | After T-B05 and T-B08 |
| **T-B10** Revenues changed volumes | SPB-07 | `features/pm/revenues/rules.ts`, `data/revenues.ts`, `data/revenuesFlags.ts` | none | After DECISION |
| **T-B11** Finance changed rows | SPB-08 | `data/financeFlags.ts` (one line) and tests | none | After DECISION |

**Five most valuable (expected effect):** T-B02 + T-B01 (Production first save 8.8 s to 2.9 s at 30 turbines, 44 s to 5 s at 200, DERIVED); T-B06 (admin multi-row saves and reorder 30-45% fewer round trips above 30 rows); T-B08 (one read round off every Revenues and Finance save); T-B05 (Land Lease panel Save 0.2-1 s); T-B04 (CAPEX delete 17 to 10 rounds at 58 months).

## 9. Conflicts with other areas

| My task | Their finding | Conflict |
|---|---|---|
| T-B08 | SPA-01, SPA-02, SPA-03 (agent A, Check List) | Both need a per-job reload mode in `usePlanWrite.ts:216-221`; implement once |
| T-B02, T-B03 | NET-16 (deadlines), NET-05 (global gate) | If deadlines are enabled a timed-out bulk request becomes `UnknownOutcomeError`; Production's hook must then read `maybeLanded`. NET-05 is not a blocker (4.2) |
| T-B02 | SPB-02, SPB-05, SPB-12 (Production/Generators read side) | Same `production/hooks.ts`, different functions |
| T-B05 | NET-04, SCC-10, NET-02, SCC-01 | `data/landLease.ts` read sites and `leaseOpexFlags.ts` |
| T-B06 | NET-16, NET-05, SAD-02, SAD-11, SAD-15 | `client.ts` / `adminRowWrites.ts` / `adminCost.ts` |
| T-B09 | NET-02, SCC-04, BND-02 | `useCostBook.ts` |
| T-B04 | NET-04, SCC-13 | `capexWrites.ts` |

## 10. What could not be determined (and the measurement that settles it)

1. Real volumes: turbines and all-WTG costs per project, contract months, zero/later-year rows per account deactivation. They decide T-B03's threshold and whether NET-14 is P1. Count on DEV from one `[VSB]` capture each.
2. Server cost of a bulk row on `vsb_landleaseallocationwtgs` and of parallel chunks on one parent (lock contention): GB-30/31 and the P0.3 probe.
3. Whether the Generators backend honours client ids and `@odata.bind` to a just-created parent in `CreateMultiple` on this table (D51 proved it on capex tables only).
4. Cascade timing of a CAPEX contract and of a Land Lease header: the 5.2 s figure has no recorded row count.
5. Whether any plugin or flow on `vsb_capexcosts` fires differently for `UpdateMultiple` than for a PATCH (needed only for NET-14 (c)).
6. Throttling thresholds (probe P-4): the 16-wide groups are justified by Generators' live run, not by a throttling test.

**Decisions requested:** DEC-7 (chunked guard race window; product owner + tech lead); reload-behind-busy for Revenues, Finance and Land Lease (product owner); changed-rows-only for Revenues volumes and Finance tranches (product owner); cascade-only for the CAPEX panel and Land Lease deletes (product owner, after a DEV timing); how a failed Production generation should be recoverable (deterministic ids or upsert), if ever.
