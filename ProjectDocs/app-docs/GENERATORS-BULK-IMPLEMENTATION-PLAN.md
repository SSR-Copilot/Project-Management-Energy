# Generators screen: bulk Dataverse actions — detailed implementation plan

| | |
|---|---|
| **Status** | **Proposed. Nothing is approved and nothing is built.** Every phase needs your explicit go-ahead |
| **Companion documents** | `GENERATORS-BULK-DATAVERSE-ANALYSIS-AND-PLAN.md` (findings, risks, ranking) and `GENERATORS-SCREEN-FUNCTIONAL-ANALYSIS.md` (the screen) |
| **Base** | `RounakDev1` at `9d5d03d` (16 Nov 2026) |
| **Effort figures** | My rough estimates for one developer who knows the code. They are not commitments, and phases 2–5 depend on the phase 0 results |
| **Sources** | Code references (`file:line`) come from the four read-only investigations of 16 Nov 2026 and were not all re-checked line by line. Re-read each location before editing it |

---

## 0. Guardrails for every phase

1. **One phase = one local branch cut from `RounakDev1`**, merged back fast-forward only after the gates in section 4. Branch names are in the phase headers.
2. **A phase ships dark.** Each bulk path sits behind a module-level flag in the data layer (default **off** until the phase's DEV check passes). The current `together()` / single-row path stays intact, tested, and is the rollback (CONVENTIONS rules 8 and 15).
3. **Fail closed.** A bulk target without the owning-business-unit bind, with a duplicate id, or with a reserved key throws before anything is sent.
4. **One roll-up per bulk operation, always last.** No step may add a second project update.
5. **Deletes, flow calls, the type create, roll-ups and every single-row save stay as they are.**
6. **Behaviour the user sees does not change**: progress texts, success and error texts, selection after save, the `then` follow-up, the background reload and the disabled-while-refreshing rule. If a failure message must change (section 2.4), it is recorded as a `DIVERGENCE`.
7. **No write to DEV except on a named test project**, each probe approved by you, each with a cleanup.
8. **Every new write path is traced** as `[VSB]` lines through `platform/requestLog.ts`, with a pinning test and a console check in a real run (CONVENTIONS rule 23).

---

## 1. Phase map

| Phase | Branch | Delivers | Depends on | Rough effort |
|---|---|---|---|---|
| **0** | `analysis/generators-bulk-dataverse` (exists) | DEV probes and real-data counts; go / no-go | — | 2–3 days incl. approvals |
| **1** | `perf/generators-status-together` | Activate / Deactivate: 202 sequential requests become about 28 waves | none | 0.5 day |
| **1B** | `perf/generators-tiered-deletes` | Tiered parallel deletes (leaf rows 16, cascading deletes 4), children before parents (section 9.4) | none | 1–2 days |
| **1C** | `feat/generators-create-rollback` | Roll back a failed create save (new type and turbines; out-of-country approval failure) with Retry cleanup (section 9.3) | none | 3–4 days |
| **2** | `perf/generators-bulk-allocations` | The bulk plan operation, the Generators transport, bulk allocation creates | phase 0 probes 1, 4, 7, 8 | 4–6 days |
| **3** | `perf/generators-bulk-updates` | Bulk status toggle and apply-to-all | phase 2, probe 5 | 3–4 days |
| **4** | `perf/generators-bulk-turbines` | One `CreateMultiple` for the N new turbines | phase 2, probe 4 (polymorphic bind) | 3–5 days |
| **5** | `perf/generators-bulk-replace` | Replace Generator / PV composed from the above | phases 2–4, decision 3 | 5–8 days |

Phases 2–5 are conditional: if phase 0 shows that large types and many all-WTG land-lease costs are rare, stop after phase 1 or 2.

---

## 2. Cross-cutting design (specified once, used by phases 2–5)

### 2.1 A bulk operation in the write plan

- **Where:** `src/data/writePlan.ts` and `src/data/executePlan.ts`. Today `WriteOp.op` is `create | update | delete`.
- **New operations:** `createMany` and `updateMany`, each carrying `entitySet`, `rows` (for create: `{id, data}` with the id pre-generated; for update: `{id, data}`), a `reason` text, and optional chunk settings.
- **Execution:** `executePlan` treats a bulk op as one step in plan order. Inside it:
  1. substitute any `createdRowRef` placeholders per row, from ids created by earlier steps;
  2. run the fail-closed checks (section 0, item 3);
  3. send through the bulk transport (2.2) in chunks (2.3);
  4. add the created ids to `createdIds` in row order;
  5. call `invalidatePageTokens(entitySet)` once;
  6. log through the bulk logger.
- **Grouping:** a bulk op is **not** part of a `together()` group. Where a plan today runs a `together()` group over several entity sets, each entity set becomes its own bulk op, sent in the order the dependencies require.
- **Reads that precede it** (existing-id checks, name look-ups) stay as they are.

### 2.2 Transport

- **Reuse:** `data/bulkWrites.ts` (`upsertMultiple`, `toUpsertTargets`, `parallelChunkSize`, the error classes) and `data/bulkSend.ts` (`createMultiple` / `updateMultiple` through the generated services, the tuned splitter, `saveGate`, `loggedBulkRequest`).
- **New:** a `BulkTableInfo` entry (entity set, logical name, primary key) for each Generators table that gets a bulk path, taken from `ProjectDocs/reference/dataverse-entities.json` and checked against `.power/schemas`.
- **Extend:** the 501 fallback and the existing-id reader in `bulkSend.ts` are hard-wired to the two CAPEX tables. Make them a registry keyed by entity set, so a Generators table can register its own per-row fallback and its own existing-id read.
- **Per-row fallback:** create → one POST per row with the same id; update → one **guarded** PATCH per row (read first, so a missing row is refused, not resurrected). Remember a 501 per action in `sessionStorage` under its own key.
- **Prerequisites already in place:** the `CreateMultiple`, `UpdateMultiple` actions and the `environment_<id>` entry in `power.config.json`, and all Generators tables are registered. **Do not remove or edit** the `environment_<id>` entry. After any `pa` or `pac` command: diff `dataSourcesInfo.ts` and run `npm run check:power`.

### 2.3 Chunking and concurrency

- Use the tuned splitter already in force (minimum chunk 10, at most 8 parallel chunks, maximum 500, shared `saveGate` of 24). Make the chunk size configurable for the Generators path so it can shrink after a timeout.
- Keep write concurrency at or below the 52-per-user limit together with deletes. Do not run a bulk step in parallel with deletes on the same parents (lock contention measured at 6–11 s per request in D51).
- Add `Retry-After` handling on 429 for bulk requests before any chunk is enlarged (today write requests have no retry).

### 2.4 Failure model (a deliberate change)

- A chunk lands whole or not at all. Parallel chunks can land partly.
- **Message:** keep the existing sentence shape, "`“<reason>” failed: <message>. N of M changes had already been saved.`" but count **rows**, and add the chunk detail only to the `[VSB]` log. The error prefix per job (`WRITE_ERROR.*`, built from the entity set) stays valid.
- **Isolation:** on a chunk failure, validate rows again on the client, then **bisect** (halve and retry) down to single rows only for the failing part, so one bad row does not hide behind a 500-row rollback. Bisection is allowed only for creates with stable ids (they are idempotent) and for guarded updates.
- **Orphans:** after any partial failure of a delete-free bulk step the plan stops. Rows already created stay. The retry re-sends the same ids (pre-generated ids are kept across a retry, as D51 §3a does), and a "new" id that already exists is re-sent as an update, as Add Cost does.
- Record the change as `DIVERGENCE:` with a decision entry.

### 2.5 Ids

- Pre-generate GUIDs for the rows other rows refer to (turbines, allocations). Keep them in a per-save cache that survives a failure and is cleared on success, as Add Cost's `idCache` does.
- **The type create stays a single request**, because its autonumber name (`WTG-0001`) comes back in the response and feeds the device-type row. If a later step needs the name and a bulk response does not return it, read it back by id.
- Keep the `createdIds` order contract the screen uses (type first, then turbines in order) or switch the screen to the pre-generated ids in the same phase.

### 2.6 Flags and tracing

- Flags in the data layer, one per step: `GENERATORS_BULK_ALLOCATIONS`, `GENERATORS_BULK_STATUS`, `GENERATORS_BULK_APPLYALL`, `GENERATORS_BULK_TURBINES`, `GENERATORS_BULK_REPLACE`. All default **off** when a phase merges; switched on in a separate, approved change after the DEV check.
- Each flag has both halves pinned by a test (on and off), as `UT-ACDEEP-014/021` do for Add Cost.
- `[VSB] DATA create|update <entity set>` per bulk request with rows and milliseconds (no values, no ids), and one `[VSB] ACTION` summary per job (existing). A test pins the line (`UT-REQLOG-*` style).

---

## 3. Phase details

### Phase 0 — Measure and verify (no application code)

**Objective.** Turn the unknowns of the analysis into facts and decide go / no-go for phases 2–5.

**Work**
1. **Real-data counts (read-only):** the distribution of turbines per type, the number of all-WTG land-lease costs per project (`vsb_landleaseprojectcosts` with `vsb_allwtgallocated = true`), types per project, in DEV and QA. This sets the real benefit of every phase.
2. **The DEV probes of the analysis document, section 9**, in this order: table support (probe 1), a bad-row failure (2), the polymorphic, owning-business-unit and `null` binds in a 3-row create (4), `statecode`-only and per-row bind updates (5), the response shape and the autonumber (7), flow runs and Fabric sync-job rows (8), live plug-in steps (9), the cascade functional test (6), and the DEV solution version (13).
3. **Method for probes:** use the app's own bulk path from a small throw-away script or a temporary local branch **never merged**, on a named test project, with `[VSB]` tracing, and clean up every row afterwards. No probe code goes into `RounakDev1`.
4. **Write the results** into a new section of the analysis document: each probe, what was sent, what came back, pass / fail.

**Deliverable.** A go / no-go table per phase, and the three decisions it settles: whether the polymorphic bind works in bulk (phase 4), whether `statecode` and bind updates work in bulk (phase 3), and whether the flow and trigger counts are acceptable (phase 2).

**Acceptance.** Every probe has a recorded result. Test data is removed. You have approved the go / no-go.

**Decision tree**

| Probe result | Consequence |
|---|---|
| Polymorphic bind fails in bulk | Phase 4 is dropped. Turbines stay single creates (kept in `together()`); phases 2, 3 and 5 still proceed |
| `statecode` or per-row bind update fails in bulk | Phase 3 uses the `together()` wrap only (phase 1) for status, and bulk only for the updates that pass |
| A 50-row create fires 50 flow runs | Reduce chunk size, or schedule the roll-up once; confirm the sync job is idempotent |
| `CreateMultiple` is unsupported for `vsb_landleaseallocationwtgs` | Phase 2 stops; remain on `together()` |
| Cascade test shows allocations or O&M costs left unlinked | Already known and handled; add an orphan query to every later DEV check |

---

### Phase 1 — Status toggle in parallel (`perf/generators-status-together`)

**Objective.** Remove the worst wave count on the screen without new mechanism.

**Scope.** `planToggleStatus` (`rules.ts`, about line 3723): the turbine `statecode` updates currently run sequentially.

**Changes**
- Mark the per-turbine updates `together()` (8 in flight). Keep the order: type update first, the turbines in a group, the project roll-up last.
- No change to payloads, messages or ids.

**Tests**
- Update the plan-shape assertions for `planToggleStatus` in `rules.test.ts` (the concurrent flags; the UT-GEN-12x block around `planToggleStatus`).
- Add: for N turbines the plan has one concurrent group of N, the type update before it, the roll-up after it.

**DEV check.** Deactivate and activate a test type with a known turbine count; confirm all turbines change, one `[VSB]` summary, no error, one roll-up (one Fabric sync-job row).

**Acceptance.** `npm run verify` green; roll-up still last; the `[VSB]` timeline shows grouped writes.

**Rollback.** Revert the commit; no flag is needed because the payloads are unchanged.

**Effort.** About half a day.

---

### Phase 2 — Bulk operation and allocation creates (`perf/generators-bulk-allocations`)

**Objective.** Make the largest saving: the N × L land-lease allocation rows.

**Scope.** The shared helper `allocationCreates` (`rules.ts`, about line 3375) used by `planGeneratorTypeFollowUp` (Add type), `planSaveTurbine` (new turbine), `planPvFollowUp` (new PV type), and the Replace follow-ups.

**Work packages**

| # | Package | Files |
|---|---|---|
| 2.1 | Add `createMany` to `WriteOp`, `PlannedWrite` and `executePlan` as in 2.1; fail-closed checks; per-row `createdRowRef` substitution; `createdIds` order | `data/writePlan.ts`, `data/executePlan.ts` |
| 2.2 | A Generators bulk table registry (`vsb_landleaseallocationwtgs` first): entity set, logical name, primary key; per-action 501 flag; per-row fallback (POST with the same id) | `data/bulkTypes.ts`, `data/bulkSend.ts` (generalise `ROW_UPSERT` and the existing-id reader), new small module if cleaner |
| 2.3 | Bulk builder for allocations: `{id, name, vsb_ProjectCost@odata.bind, vsb_GeneratorInProject@odata.bind, owningbusinessunit@odata.bind}`; the name string exactly as today | `rules.ts` (`allocationCreates`) |
| 2.4 | Failure model of 2.4, row counts in the message; pre-generated id cache that survives a failure | `data/executePlan.ts`, `data/usePlanWrite.ts`, `data/generators.ts` |
| 2.5 | Flag `GENERATORS_BULK_ALLOCATIONS` (default off); the current `together()` path kept as the off path | data layer |
| 2.6 | Logging and the pinning test | `platform/requestLog.ts` usage, test |
| 2.7 | Documentation: a decision entry for the failure model, file 13 entry, test plan | `ProjectDocs/app-docs/` |

**Ordering constraint (unchanged).** Allocations are created after the turbines they bind to exist, and after the land-lease cost they bind to. In Add type that is after the follow-up reads the new turbine ids; with pre-generated turbine ids (phase 4) it could move earlier, but **do not reorder in this phase**.

**Tests**
- `executePlan.test.ts` (UT-PLAN-*): bulk op order, per-row placeholder substitution, ids returned in order, duplicate id refused, missing OBU refused, 501 fallback, failure message counts rows.
- `rules.test.ts`: the allocation plan shape for Add type, Add turbine, Add PV and Replace (the UT-GEN-118 to 128 family changes where they pin per-row allocation creates).
- `Screen.test.tsx`: UT-GEN-903, 909, 913 (jobs for Add, Replace generator, Replace PV).
- A fake bulk transport modelled on the Add Cost one (UT-ACSHEET-BULK-068): refuses existing ids, fails one chunk, answers 501.

**DEV check (flag on, test project)**
1. Add a type with 10 turbines and 3 all-WTG costs: expect 30 allocation rows in 1 request; verify rows, names, project cost and turbine binds, owner and business unit.
2. A larger case (for example 100 turbines × 5 costs = 500 rows): expect 1–2 requests, no 429, record the time.
3. Count Fabric sync-job rows (expect one) and any mails.
4. Failure test: break one row (a bad cost id) and confirm nothing lands and the message is correct; retry with the same ids.
5. 501 test: remove the flag temporarily (or force the fallback) and confirm per-row creates work.

**Acceptance.** Tests green; `verify` green; DEV check items 1–5 pass; request count in `[VSB]` matches the model (section 2 of the analysis document); the old path still works with the flag off.

**Rollback.** Flag off, or revert the branch.

**Effort.** 4–6 days.

---

### Phase 3 — Bulk updates (`perf/generators-bulk-updates`)

**Objective.** Bulk the status toggle and apply-to-all, which both update N sibling turbines.

**Scope.** `planToggleStatus`, the apply-to-all part of `planSaveTurbine` (sibling updates, which also rewrite each sibling's own total height).

**Work packages**
1. `updateMany` in `WriteOp` and `executePlan` with the same guarantees as 2.1; update rows carry only the primary key and the changed columns.
2. Registry entry for `vsb_generatorinprojects`; a **guarded** per-row fallback (read first).
3. Status: one `UpdateMultiple` of N rows `{statecode}` (only if probe 5 passed; otherwise keep phase 1).
4. Apply-to-all: one `UpdateMultiple` of N−1 rows with per-row payloads (capacity, hub height, plinth, total height). Decide with probe 5 whether the per-row owning-business-unit bind on update is needed; if the probe shows it is not accepted, drop it from updates (the bind is for creates under CONVENTIONS rule 4).
5. De-duplicate ids on the client (a duplicate in `UpdateMultiple` is silently ignored).
6. Flags `GENERATORS_BULK_STATUS`, `GENERATORS_BULK_APPLYALL`.

**Tests.** The plan-shape tests for toggle and apply-to-all; duplicate ids; missing row (the whole chunk fails: the guarded fallback is used); the type update and roll-up stay before and after.

**DEV check.** Toggle a 50-turbine type; apply capacity, hub height and plinth to all; verify every sibling's value and total height; one roll-up; no unexpected audit or flow volume (count after).

**Acceptance and rollback.** As phase 2.

**Effort.** 3–4 days.

---

### Phase 4 — Bulk turbine creates (`perf/generators-bulk-turbines`)

**Objective.** Replace N single turbine creates by one `CreateMultiple`.

**Precondition.** Probe 4 shows the polymorphic bind (`vsb_ModuleTypeInProjectId_vsb_generatortypeinproject@odata.bind`) works in a bulk target on the test project. If it does not, **drop this phase**.

**Design**
1. The **type is created first as a single request** (autonumber name needed).
2. The N turbines follow in one bulk op, bound to the type id returned by step 1. The placeholder `createdRowRef(0)` is substituted per row; it must resolve before sending.
3. Turbine ids are pre-generated so the allocation step (phase 2) can bind to them without reading results back; this removes the screen's reliance on response order (`createdIds.slice(1, 1 + n)`), which is updated in the same change.
4. Names `WTG <Short>_<n>` are computed on the client from the project-wide maximum index (unchanged).
5. Roll-up stays last. The device-type row and the allocations stay in the follow-up.

**Tests.** Plan shape for Add type and Replace (job 1); polymorphic bind string per row; ids order; the screen consuming pre-generated ids; failure leaves the type created (as today), and the retry reuses ids.

**DEV check.** Add a type with 200 turbines on a test project: one bulk request (or the tuned few), names `_1` to `_200`, all bound to the type (read back `lookuplogicalname`), owner and business unit correct, count of flow runs and sync-job rows.

**Effort.** 3–5 days.

---

### Phase 5 — Replace flows (`perf/generators-bulk-replace`)

**Objective.** Apply phases 2–4 inside Replace Generator and Replace PV.

**Scope.** `planReplaceGeneratorType` / `…FollowUp`, `planReplacePvType` / `…FollowUp`, `toReplaceAllocations`.

**Rules that must hold (from the code)**
- The cancel of an open approval request finishes before anything is deleted.
- O&M costs are **detached from the old bridge before the bridge row is deleted**, or they would go with it.
- The re-link needs the new bridge id, so it stays after the bridge create.
- Out of country, the permission request flow is called between the writes, as today.

**Work.** Use bulk for: new turbines, the N × L allocation creates, the repoint of manual allocations (`updateMany` of the `vsb_GeneratorInProject` bind), the O&M detach and re-link (`updateMany` with a `null` bind, only if probe 4 shows `null` binds work).

**Product decision (decision 3).** The old all-WTG allocations are deleted and recreated, which means about 6,000 explicit deletes at the worst case. **Option:** repoint and rename the existing allocation rows to the new turbines instead. That removes the deletes but changes ids and canvas behaviour, so it is only built if you approve it.

**Tests and checks.** The full Replace job on a test project: row counts, all links, no orphans (orphan query before and after), the note about unmatched allocations when the new type has fewer turbines.

**Effort.** 5–8 days.

---

## 4. Gates for every phase (project rules)

Do these in order for each phase branch:

1. **Before building:** the four-item pre-build check (aria-label and test id on any changed control; the canvas YAML requirements still met; reuse of components and helpers; the console trace). These phases change no control, so item 1 is expected to be unchanged. Confirm that.
2. **While building:** `rules.ts` stays pure; no business decision in `Screen.tsx`; every divergence marked `DIVERGENCE:` with a twin where numbers are involved and a decision entry (rule 8).
3. **Before asking to commit:** `npm run verify` green (including `check:power`, the label and canvas gates, the full test suite and the build); `ProjectDocs/app-docs/13-CODE-APP-IMPROVEMENTS-OVER-CANVAS.md` updated (a performance improvement and the failure-model divergence); knip: no new unused files beyond the recorded baseline.
4. **Ask you:** whether to run the E2E parity suite, then for explicit approval to commit and merge.
5. **Merge:** fast-forward into `RounakDev1` (no merge commit unless you ask).
6. **Before any push to DEV:** the full DEV checklist (`npm ci` with no dev server running, `check:power`, `verify`, knip, pac environment check, `app push --non-interactive`, `git checkout -- power.config.json`), then the smoke test of section 5.
7. **Flags stay off at merge.** Switching a flag on is its own change, approved after the DEV check.

---

## 5. DEV rollout and monitoring (per phase, after a push)

1. Smoke test with the flag **off**: add, edit and delete a type and turbines on a test project; confirm nothing changed.
2. Switch the flag **on** (local build first, then DEV) and repeat the phase's DEV check.
3. Watch the console: the `[VSB]` timeline, `SLOW` flags, any `ERROR` line, any 429.
4. After each run, check: Fabric sync-job rows (one per save), no orphans, owning business unit set on every new row, totals on the project match the rows.
5. Keep the flag on only for the test project until two clean runs; then widen.
6. Any 429, SQL timeout or flow storm: flag off, record it in the decision entry, shrink the chunk.

---

## 6. Risk tracking per phase

| Phase | Main risks (analysis document numbers) | Control |
|---|---|---|
| 1 | none new | revert |
| 2 | R2 roll-up and flow fan-out, R3 missing OBU, R5 atomic chunk, R11 throttling, R12 locks | one roll-up, fail-closed builder, bisection, `Retry-After`, small chunks first |
| 3 | R5, R13 stale overwrite, R14 duplicate ids | guarded fallback, client de-duplication |
| 4 | R8 polymorphic bind, R10 autonumber and response shape, R7 ordering | probe first, type stays single, pre-generated ids |
| 5 | R1 orphans, R6 cascade amplification, R9 CAPEX plug-in overlap, R16 first-bridge gap | children first, orphan query, no bulk while P50 trigger pending, chunked deletes at 4 in flight |

---

## 7. Definition of done (whole programme)

- Every enabled phase has passed its DEV check twice in a row, with `[VSB]` evidence kept.
- Request and wave counts match the model, or the difference is explained.
- The off path still works and is tested for every flag.
- No orphan rows and no row without an owning business unit after any save or failure test.
- Decision entries, file 13 and the test plan are current.
- The screen's messages, selection and reload behaviour are unchanged except the recorded failure-message wording.

---

## 8. Open items before phase 0 starts

1. Your approval of the phase 0 probes (they write rows to a named DEV test project): which project?
2. Who can run the Web API queries and the maker-portal checks (plug-in steps, flow states, cascade configuration, audit setting): the DEV service account, or an administrator?
3. The six product decisions at the end of the analysis document, section 10. **Answered: see section 9.**

---

## 9. Decisions recorded on 16 Nov 2026 (they override anything earlier in this document)

### 9.1 Answers and their effect

| Topic | Answer | Effect on the plan |
|---|---|---|
| Real sizes | Small: up to 20 turbines and 0–3 all-WTG costs | At these sizes a save is about 4–43 requests, so the bulk phases (2–5) save little **today**. Accepted, because the **full plan, phases 1–5** was chosen for future scale. Every phase is judged against the baseline of 9.6 |
| Scope | Full plan, phases 1–5, plus 1B and 1C | The phase map in section 1 |
| Failure on create | **Roll back**: delete what the failed save created | Phase 1C (9.3) |
| Rollback scope | "Proceed with the recommended approach" | Read as: roll back **A** (new type and its turbines) and **B** (out-of-country type when the approval flow fails). **Not C** (half-applied "apply to all": old values would have to be captured, and a second failure leaves a mix). **Not D** (Replace: the old rows are already deleted, so it reports what saved) |
| Cleanup fails | Say exactly what is left and offer **Retry cleanup** | 9.3 |
| Replace | **Keep delete and recreate** (canvas parity); make the deletes run in parallel | Decision 3 is closed: no repointing. Phase 5 uses the tiered deletes of 9.4 |
| Delete concurrency | "Recommended" | Tiered: leaf rows 16, cascading deletes 4, numbers confirmed by a timed DEV test (9.4) |
| Two users | Re-read ids first and refuse if a row is gone | 9.5 |
| Success target | **At least 50% faster than today** | Baseline timing first, then every phase is pass / fail against it (9.6) |
| Rollout | "Does not matter, do not create generic policies" | No rollout policy, no runtime switch, no staged-environment rules. Each bulk step keeps a flag only because CONVENTIONS rule 15 requires the old path to stay switchable. A flag is on once its phase's DEV check passes (9.7) |
| Plug-ins | None exist for these functionalities | Plug-in risk R9 and probes 9 and 10 are withdrawn. Flows stay |
| Notification mail flow | Not functional in PROD, so not a concern | No check and no restriction on probe saves because of it |
| Probes | Writes allowed on the DEV test project, rows tagged and removed | Phase 0 (9.8). The project id stays in the conversation and a session variable only, never in a file |

### 9.2 A correction to a scenario I described

When I asked about rollback I said the project totals had not been rolled up. **In the code the project roll-up happens in the first job, before the follow-up** (device-type row and allocations). So when the allocation step fails, the roll-up has already counted the new type. The rollback must therefore **recompute the roll-up after deleting**, which is one more project update and one more Fabric sync-job row. This is built into 9.3.

### 9.3 Phase 1C: roll back a failed create save

**Applies to**
- **A:** Add WTG type. The type, its turbines, and whatever landed of the device-type row and the allocations.
- **B:** an out-of-country type whose Request Module Permission flow fails to start.
- Not covered, so today's behaviour stays: a new turbine alone, a new PV type, edits, apply-to-all, Replace. (If you want a new turbine or a new PV type included, say so; the same mechanism fits.)

**How it works**
1. While a create save runs, the screen records the id of every row that landed (type, bridge row, turbines, allocations), in landing order. The ids are already returned by the write executor; with bulk they are the pre-generated ids.
2. On a failure, **if nothing landed, do nothing** (today's message only).
3. If something landed, delete in reverse dependency order:
   1. the allocations that landed (explicitly, because deleting a turbine only unlinks its allocations);
   2. the device-type bridge row;
   3. the turbines (also removed by the type's cascade, but deleted explicitly so a refusal is visible);
   4. the type;
   5. **a final roll-up** if the first job's roll-up had already run (9.2), so the project totals match the rows again.
4. Deletes use the tiered parallel rules of 9.4. A delete answering 404 counts as already gone.
5. **If the cleanup succeeds:** the error bar says the save failed and was undone, with the original reason.
6. **If the cleanup fails:** the error bar says exactly what is left (the type name, the number of turbines, allocations or bridge rows) and shows a **Retry cleanup** button. The button deletes only the recorded ids, so it can be pressed again safely. No automatic retries.
7. Commands stay disabled until the rollback ends, as for any write.

**Labelled as a divergence.** The canvas leaves a partly-saved type behind. This is recorded as `DIVERGENCE:` with a decision entry and a test for both halves.

**Tests to write.** Failure before anything landed (no deletes); failure after the type only; after type and turbines; after allocations; B (flow failure); cleanup refused for some rows (message names what is left); Retry cleanup finishes it; the roll-up is recomputed only when it had run; a second Save after a successful rollback starts clean.

### 9.4 Phase 1B: tiered parallel deletes

- **Leaf rows up to 16 at once:** allocations, O&M costs, units, bridge rows, turbines when they are deleted one by one.
- **Cascading deletes up to 4 at once:** land-lease costs and types (their cascade locks and updates children).
- **Order:** children before parents; the project roll-up last; never overlapping writes on the same parents.
- **Replace:** the old allocation deletes run as their **own wave after the new rows have been created**, so deletes and creates do not contend (the D51 lesson: 6–11 s per request when they overlapped). Whether running them in parallel with the creates is safe is a question for the timed test, not an assumption.
- **404 as gone**, and a 404 caused by a wrong entity set must not pass silently (the existing read-back check).
- The numbers 16 and 4 are the starting point. The timed DEV test (delete 100 and 1,000 allocation rows and a type with 200 turbines at 4, 8 and 16) sets the final values.
- **Needs an `executePlan` change:** today a `together()` group is capped at 8. A group needs a concurrency setting, with the shared gate keeping the total under the 52-per-user limit.

### 9.5 Bulk updates are guarded (phase 3 and the Replace re-links)

Before an `UpdateMultiple` chunk, read which of its ids still exist (one read per 40 ids). If any is missing, **send nothing** and tell the user to reload. This also applies to the per-row fallback after a 501. It prevents re-creating a row someone else deleted. One extra read per 40 rows is the accepted cost.

### 9.6 Baseline and success criteria

- **Success = at least 50% faster than today**, per phase, on the same cases, from the `[VSB]` timeline on DEV, **average of three runs**.
- **Baseline first (phase 0, before any change):** time the current build, three runs each, on the test project:
  1. Add a WTG type with 10 turbines (needs 3 all-WTG land-lease costs on the test project, created for the test and removed afterwards);
  2. Deactivate and activate that type;
  3. Edit a turbine with apply-to-all;
  4. Delete that type;
  5. Replace that type.
- Report requests, awaited waves and seconds for each. A phase passes when its case is at least 50% faster, with no regression elsewhere. If a phase does not reach 50%, the report says so and you decide whether to keep it.
- At today's small sizes some cases (single-row saves) cannot improve by 50%; those are out of the criterion.

### 9.7 Flags

One flag per bulk step so the old path stays switchable (CONVENTIONS rule 15), with both halves tested. A flag is **on** once the phase's DEV check has passed on the test project. No further policy.

### 9.8 Phase 0 as revised

1. Read-only first: real-data counts, the DEV solution version, live cascade configuration, the Fabric flow state. (Plug-in and mail-flow checks are dropped.)
2. Test data on the project (tagged and recorded): three all-WTG land-lease costs, and throw-away types and turbines.
   - Turbine names are generated by the app (`WTG <Short>_<n>`), so a `PW-` prefix is not possible for them. Cleanup instead uses a **manifest of created ids** kept in the scratchpad (never in the repo), deleted in dependency order, followed by an orphan query.
   - Each probe save updates the project's plant totals. They are restored by the final roll-up of the cleanup, and the Fabric sync-job rows it creates are accepted.
3. The baseline timing of 9.6.
4. The bulk probes: table support, bad-row failure, polymorphic / owning-business-unit / `null` binds, `statecode` and per-row bind updates, response shape and autonumber, flow-run counts, throttling and timed delete concurrency (9.4).
5. The results go into the analysis document, with a go / no-go per phase.

### 9.9 Assumptions I made that you can overturn

1. "Recommended" in your rollback and delete answers meant the options I describe in 9.1. Rollback covers A and B only.
2. Replace's old-allocation deletes run after its creates settle (9.4).
3. Rollback does not cover a new turbine alone or a new PV type (9.3).
4. At small sizes the bulk phases may not reach 50%; that is reported, not forced.
5. Phase 0 has not started. It starts when you say go.
