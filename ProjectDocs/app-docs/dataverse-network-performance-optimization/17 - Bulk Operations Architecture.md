# 17 - Bulk Operations Architecture

> Stage 2 (design and planning only), 25 Nov 2026. Inputs: doc 05 (10 findings), doc 08. Tasks: T-40, T-41, T-42, T-43, T-05.

## 1. What 'bulk' can mean here

| Mechanism | Available? | Atomicity | Use |
|---|---|---|---|
| `$batch` (non-transactional) | **No.** The host envelopes each request itself and the SDK never sets a shared `batchId` | - | not proposed |
| Change set (transactional batch) | **No** (same reason) | - | not proposed; atomic multi-row writes need a Dataverse custom API, which is outside this workstream (no schema or server change) |
| `CreateMultiple` / `UpdateMultiple` / `UpsertMultiple` through `executeAsync` | **Yes**, registered (`power.config.json`, keep the `environment_<id>` entry, CONVENTIONS rule 9) | **Per call**: a chunk succeeds or fails as a whole; several chunks are independent | the only bulk write tool |
| Bulk delete | **No** | - | deletes stay per row, gated (leaf 16, cascade 4), or use a server cascade (DEC-A) |
| Per-row requests | Yes | per request | dependent steps, small sets, deletes, fallback |

## 2. Selection rule (applied per workflow)

Use a bulk action when **all** hold: the rows are in one table; they are independent of each other (no id from one is needed by another in the same call); no step between them depends on server-assigned values; the table accepts the action (probe P-3 for `statecode`); partial failure is handled as for Add Cost (below). Otherwise per-row, in dependency order. Never run a dependent step concurrently with the step it depends on.

## 3. Existing reference implementations (evaluated, not assumed optimal)

| Implementation | Strengths | Gaps found |
|---|---|---|
| Add Cost from Table (`addCostSheetBulk.ts`, `bulkSend.ts`, D51) | chunking (min 10 / parallel 8 / max 500), 501 per-row fallback remembered per tab, settle-then-reconcile after a failure, stable ids across a retry, 400-seed equivalence test against the old path | writes and verify reads are not retried on 429 (CA-01); verify reads are ungated (CA-17); deferred deletes unprotected on tab close (CA-03); no deadline (CA-02) |
| Generators bulk (`generatorsBulk.ts`, D115, off) | guarded update, exact failure counts, 501 fallback, retry on 429/503 | all six switches off (PA-01); turbines need `together` with `createRollback` for parallel chunk partial failure; `statecode` in `UpdateMultiple` unverified; shares the write gate of 24 with Add Cost; always pays a guard read (PA-13); the 503 retry is dead (OR-01); the default backend is not registered by Finance (PA-02) |
| Check List bulk copy (`checklistBulk.ts`, off) | uses the Generators backend | `CHECKLIST_BULK.materialise` off; needs its own DEV plan |

## 4. The partial-failure contract every bulk path must meet

1. Chunks are all-or-nothing; the save as a whole is not.
2. After any failure, **wait for all in-flight chunks to settle**, then re-read the touched parents and rewrite any total that may be wrong (the Add Cost reconcile).
3. New rows carry client-generated ids that survive a user retry (D51 §3a), so pressing Save again cannot duplicate; an 'already exists' answer is checked by a read-back, not assumed.
4. The failure shown names what landed and what did not (`PartialStepError`, `SavePlanError`).
5. A switch returns the path to per-row (the per-row code stays).
6. Retries follow doc 21: a 429 (not processed) may retry a bulk call; a 5xx or a network error may not (the call may have partly landed).

## 5. Candidate map

| Workflow | Today | Proposed | Needs | Task |
|---|---|---|---|---|
| Generators type add / delete / status toggle | per row (63 requests for 20 turbines + 2 costs; 52 for a toggle on 50 turbines, code-derived) | existing bulk path, enabled flag by flag | DEV test plan; P-3; turbines `createRollback`; gate sharing | T-41 |
| Land Lease allocations | per-row loops | `CreateMultiple` / `UpdateMultiple` | P-3; T-01 guard first | T-40 (CB-06) |
| OPEX cascade and re-chain PATCHes | per-row loops | `UpdateMultiple` | same | T-40 (CB-10) |
| Revenues hedge volumes | delete all + create all | diff, then bulk create/update | equivalence test | T-42 (PA-06) |
| Production one-shot generation | creates 8 wide, one POST per allocation | 16 wide, bulk allocations | none | T-42 (PA-07) |
| General Data tracking rebuild | one at a time | together, as the create path | order check on `SynchroniseProjectState` | T-42 (PB-11) |
| CAPEX clean-up zeroing | 2 requests per row | `UpdateMultiple` | decision lifting D36 §1 | T-43 (AD-02) |
| Finance tranche schedules | per row, rewrites unchanged rows | changed rows only; `bulkSchedules` later | T-05 first | T-32 (PA-03), T-05 |
| Contracts save (D6), Land Lease delete/import | non-transactional per-row | stays; atomic only via a custom API or a server cascade | owner (DEC-A, D6) | - |

## 6. Plug-in, flow and security implications

The audits found no plug-in or flow on the Land Lease or OPEX tables. Generators writes fire `LoadDevexCapexCostTotalCapacityTrigger` and a Fabric sync row (PA-04); the bulk path must produce the same number of triggering writes unless DEC-B changes it. Bulk calls run as the signed-in user; the **business unit bind** (`OwningBusinessUnit@odata.bind`, CONVENTIONS rule 4) must be present on every created row in a chunk; each bulk task carries a test for it.
