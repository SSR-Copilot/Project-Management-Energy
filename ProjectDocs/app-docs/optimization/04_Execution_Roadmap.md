# 04 — Execution roadmap

Stage 2. **Status: proposed, awaiting approval.** Nothing below has been started; no application file has been modified.
Baseline: `HEAD b976a96` on `RounakDev1`, clean tree (see `01` §1). Finding ids refer to `02`.

## 1. Prioritization framework and backlog

Score each item on: expected round trips or recomputation removed (×), number of screens that benefit (×), then divide by regression risk and complexity.
P0 = large, on a hot and frequently used path, with low-to-moderate risk. P1 = significant, manageable risk. P2 = meaningful. P3 = minor or maintainability.
Items needing a product or owner decision are **not scheduled** (§3, "held").

| Pri | Items |
|---|---|
| **P0** | OPT-04 (OPEX book load), OPT-10 (Land Lease writes), OPT-25 (CAPEX grid repaint) |
| **P1** | OPT-01 (PM project load), OPT-05 (CAPEX tab chain), OPT-06 (OPEX read waterfall), OPT-07a (countries), OPT-07b (currencies), OPT-07c (chart of accounts), OPT-08 (page size / filters / selects), OPT-11 (OPEX save), OPT-12 (invalidation fan-out), OPT-13 (PM reload scope), OPT-14 (Team Entra + descriptions), OPT-17 (admin gates), OPT-19 step 1 (verify municipality truncation) |
| **P2** | OPT-02, OPT-03, OPT-07d, OPT-09, OPT-15, OPT-16, OPT-26, OPT-27, OPT-31 · decision-gated: OPT-18, OPT-21 |
| **P3** | OPT-07e, OPT-19 debounce (Team part), OPT-20, OPT-22*, OPT-23*, OPT-24, OPT-28, OPT-29, OPT-30, OPT-32, OPT-33, OPT-34 (*decision-gated) |

## 2. Dependency analysis

**Files that several findings share (cannot be edited by two agents at once):**

| Hot file | Findings that edit it |
|---|---|
| `data/costBook.ts` | OPT-04, 05, 06, 07b, 07c, 07d, 08a, 07e |
| `features/cost/costing/useCostBook.ts` | OPT-04, 06, 12, 25 (comments key), 26 (device-type gating), 34 |
| `data/periodWrites.ts` | OPT-11, 07b (write side), 34 |
| `data/landLease.ts` | OPT-10, 07b |
| `features/cost/periods/opexRules.ts`, `landLeaseRules.ts` | OPT-10/11 (plans), 26 (warnings, memo), 28, 31, 33 |
| `features/cost/periods/OpexScreen.tsx`, `LandLeaseScreen.tsx` | OPT-04 (consumer), 11 (pass plan), 26, 28, 02 |
| `data/project.ts`, `app/SessionContext.tsx`, `app/routes.tsx` | OPT-01, 02, 03 |
| `data/keys.ts`, `data/adminInvalidation.ts` | every shared-read change (OPT-07*, 12, 13) |
| `data/odata.ts`, `data/client.ts` | OPT-09, 31, 33(e) |

**Calculation / transformation dependencies.** OPT-31 (`dateOnly` home) and OPT-33 (`roundDown/Up`, `textFormat`, `startsWithStandard`, `groupBy`) are leaf utilities that many files import — they go first as *additions with re-exports* and are adopted by call sites later, so no importer changes in the foundation batch.
No calculation is changed by any scheduled item. The rounding families (DEC-1, DEC-1b) are explicitly excluded.

**Validation dependencies.** OPT-28 derives `canSave` from computed errors in two places (Contracts, Land Lease/OPEX): the message text and order are the contract; `UT-CONTR`, `UT-LLDATA`, `FT-BR-*` pin them. No validator is removed.

**Async dependencies (the execution map).** The classification below is what Stage 3 must preserve:

| Class | Examples | Rule |
|---|---|---|
| Strictly sequential | header → allocations → periods (Land Lease); parent → children chains (OPEX); ownership re-check → parent → removals → additions (admin contract); create-then-update checklist tasks (D18); last-flag repair; `deleteOpexContract` tail-first | stay sequential; only independent tiers inside a step may parallelise |
| Independent parallel | OPEX subaccounts ‖ currencies ‖ cost rows; payer defaults ‖ accounts; gates templates ‖ checklist chain; Team descriptions ‖ members | start at t=0 (OPT-05/06/17) |
| Conditionally dependent | device names need the rows; Planning seed needs the project only when the row is missing; people resolution needs ids | stay second; start as soon as the input exists |
| Background | Overview next-page prefetch (D119), `DEFER_*_DELETES` tails, boot prefetch | untouched; OPT-03 adds to boot prefetch only |
| Bounded concurrency | writes 8/16, deletes 4, admin flow-triggering writes 4, new read fan-out 4–8 | OPT-09 adds the read bound |
| Cancellable | superseded keyed queries (`fetchAll` has no `AbortSignal`, S4 cross-note) | **not changed** — noted for a later round, no SDK support evidenced |

**Dependency graph of the batches** (arrows = must finish first):

```
B0 baselines
 └─ B1 foundations (readByIds, shared query options, dateOnly home)
     └─ B2 Cost read path + invalidation      [costBook.ts, useCostBook.ts]
         └─ B3 Cost write path               [landLease.ts, periodWrites.ts, *Rules plans]
             ├─ B4 Cost UI / render          [capex-costs/*, periods screens, contracts, add-costs]
             ├─ B5 PM + platform             [project.ts, SessionContext, PM data + hooks]   (parallel with B4)
             ├─ B6 Generators / Check List   [generators*, checklist*]                        (parallel)
             └─ B7 Admin                     [admin*.ts, features/admin/*]                    (parallel)
                  └─ B8 cross-cutting sweep (OPT-02, OPT-09 leftovers, 31/32/33/34 leftovers)
                       └─ B9 independent QA, full verify, knip, performance comparison, docs
```
B4–B7 touch disjoint files (checked against the lock table above); B4 must follow B3 because both edit `opexRules.ts`/`landLeaseRules.ts`.

## 3. Implementation batches

Each batch: scope · files · method · expected benefit (**estimated**) · complexity / risk · required tests · done when.

### B0 — Baselines (no production change)
- Capture per-action request counts, sequential stage counts and recompute counts **before** any edit, for: OPEX visit/switch/save, CAPEX tab load/switch/paid toggle/comment save, Contracts visit, Land Lease save/delete/import (40-WTG fixture), PM screen entry (project load), Team load/save, Planning permit save, Admin gates load/toggle, Check List locks, Generators type delete. Method: new vitest harnesses over the existing fake SDK (`test/guardedSdkFake.ts`) that count `[VSB]` HTTP lines and record read start order; plus a run of the existing `*.bench.test.ts` / `*.perf.test.ts` files for a CPU baseline. New files only: `src/**/*.baseline.test.ts`.
- **Done when** `06_Performance_Comparison.md` has a baseline table and the full suite is green at `b976a96`.

### B1 — Foundations (additions only, re-exports, no behaviour change)
OPT-09 helper `readByIds` (+ gate) · OPT-31 `dateOnly` to `domain/dates.ts` (re-exported from `odata.ts`) · shared `queryOptions` for countries (extend `countries.ts` with the two missing columns), currencies, chart of accounts (new `data/` modules, keys in `keys.ts`) · `data/rowValues.ts` (identical-semantics set only) · OPT-33(a,b) `roundDown/Up` and `textFormat` moves with re-exports.
- Method: differential tests (old implementation vs new over an edge-value table) for every moved helper; `UT-PSTATES`-style view-equals-old tests for each shared read.
- Benefit: none directly; unlocks B2–B7. Cx M · Risk L.
- **Done when** the new modules exist with tests, no existing importer changed, `verify` green.

### B2 — Cost read path and invalidation  [OPT-04, 05, 06, 07b(read), 07c(cost), 07d(costBook), 08a/b, 12, 26(device-type gate), 25(comments key)]
- Files: `costBook.ts`, `useCostBook.ts`, `costRepository.ts`, `opexCatalog.ts`, `contracts.ts`, `contracts/hooks.ts`, `addCostSheet.ts` (page size only), `standardContracts.ts`, `landLease.ts` (read side: `loadLeaseBook` currency reuse), `data/keys.ts`.
- Method: (1) `loadCostBook` scope parameter + OPEX-only path; (2) payer defaults and OPEX subaccounts/currencies at t=0; (3) shared accounts/currencies/states views; (4) `maxPageSize: 5000` on `loadPayments`, `loadCostsForContracts`, `listCapexCostRows`; `lookupIn` for standard assumptions; (5) `setPaid` → cost-book only, `saveLine` drops comments, `deleteLine` keeps them, comment save → comments only; (6) `fetchQuery` dedupe for DevCo contracts; (7) `enabled: mode === "om"` for device types.
- Estimated: OPEX visit/save ≈ 12–15 requests / 4 waves → ≈ 4 / 2; CAPEX tab switch −1 round trip and −2 reads; paid toggle −ceil(contracts/40) requests; Contracts visit −1 query.
- Cx M · Risk L–M (the `CostBook` shape; stale chart after an admin edit in the same session — invalidated from the admin account save).
- Tests: `costBook.test`, `costRepository.test`, `useCostBook` tests, `UT-CONTR`, plus new request-count and read-order tests; `UT-ACSHEET-*` untouched (Add Cost only gets a page-size argument).
- **Done when** the B0 harness shows the new counts and every listed existing suite is green. The Land Lease periods remain in `CostBook` for `save`'s diff until B3 proves nothing else needs them (OPT-34).

### B3 — Cost write path  [OPT-10, 11, 07b(write), 34(Cost part)]
- Files: `landLease.ts`, `periodWrites.ts`, the plan builders in `landLeaseRules.ts` / `opexRules.ts`.
- Method: tiered `mapLimit` (8/16) inside `runLeaseWrites` keeping header → allocations → periods and children-before-parents; first failure by index; or convert to `WritePlan` + `executePlan` if the semantics fit (decided by the differential test below). OPEX: cached catalogue ids, skip empty child query, parallel cascade/re-chain/deletes, standard import creates head then tail, execute the pure plan. Then remove the dead Land Lease branch of `periodWrites.ts` once `knip` and the call graph confirm (after B2).
- **Differential oracle:** the legacy sequential executor is kept as a test oracle (as D51 kept the legacy path); a seeded property test (400 seeds, as `UT-ACSAVE`) asserts the same final rows, the same created ids binding and the same failure position.
- Estimated: Land Lease 40-WTG save ≈ 42–45 sequential → ≈ 5–8 waves; import ≈ 50 → ≈ 6; OPEX save −3 reads −(N−1) round trips.
- Cx M–H · Risk M (creation order / `createdon`, first-failure semantics, FT-BR-LEASE-089, FT-BR-OPEX-089/091).
- Tests: `UT-LLDATA`, `UT-PWRITE`, `UT-LEASE*`, `landLeaseRules.test`, `opexRules.test`, the new oracle test.
- **Done when** the oracle test and all listed suites pass and the B0 harness shows the new wave counts.

### B4 — Cost UI / render  [OPT-25, 26, 28(Cost), 25 comments]
- Files: `capex-costs/{Screen,PcfGrid,comments}.tsx/ts`, `periods/{OpexScreen,LandLeaseScreen}.tsx`, `opexRules.ts` (warnings once per card), `contracts/{Screen,rules}`, `add-costs-from-table/{rules,Screen,spreadsheet/SpreadSheet}` (only if B0 profiling shows a gain; otherwise deferred).
- Method: memoise `categoryAccounts`, `pcfStandardOptions`, `clusterDates`; `PcfGrid` explicit deps; dataset built with `rows`; `requestAnimationFrame`-coalesced observer; per-card warnings; `React.memo` cards; recompute counters as proof.
- Estimated: a panel keystroke no longer rebuilds the grid DOM (render-count test asserts 0 repaints when no rendered input changed).
- Cx L–M · Risk L–M (a repaint must still happen when any rendered input changes — `pcfGridFormat.test`, `pcfWriteActions.test`, `Screen.test`).
- **Done when** the render-count tests exist, pass, and B0 numbers are improved.

### B5 — PM and platform  [OPT-01, 03, 07a, 07d(project), 07e, 08a(finance), 13, 14, 16, 19, 24(production)]
- Files: `data/project.ts`, `app/{SessionContext,routes,bootPlan,bootPrefetch}`, `data/{countries,generalData,milestones,planning,team,finance,production,projects}.ts`, PM `hooks.ts`/`queries.ts`.
- Method in this order: OPT-19 step 1 (count Bayern/other-state municipalities on DEV with the owner — blocks nothing else); OPT-13 per-job reload narrowing (lowest risk, immediate); OPT-14 shared per-person cache with `mapLimit`; OPT-07a/d; OPT-16; OPT-01 PM loader + session-project keyed reads (highest risk, last); OPT-03 prefetch.
- Estimated: PM screen entry −1…2 round trips; a PM save reloads 1 request instead of 3–4; Team of 20: ≈ 22 → ≈ 2 requests per load on a warm cache; −1 request per Milestones/Generators load via the country.
- Cx M · Risk M for OPT-01 (header state text, `approvalState`, session stale time), L–M for the rest.
- Tests: `UT-BOOT-*`, `ScreenRoutes.test`, `SessionContext.startup.test`, PM hooks tests, `bootPlan.test`, new request-count tests.
- **Done when** screens render identically (existing `Screen.test` per PM screen), the header shows the same state text, and counts match.

### B6 — Generators and Check List  [OPT-15, 24(checklist), 30, 07a(generators country)]
- Files: `features/pm/generators/{hooks,plans}.ts`, `data/generators.ts`, `features/pm/checklist/{hooks,rules}.ts`, `data/checklist.ts`.
- Method: `loadTypeDeleteInputs`/`loadPvDeleteInputs` in dependency-graph form (pattern `loadReplaceInputsInWaves`); join the cached catalogue for inverter/substructure types; country from the shared view (after B1); narrow transition-wait and approval-request reads; two trivial micro-fixes.
- Estimated: WTG type delete −1 hop, PV delete −2 hops; −1 request per Generators save; transition wait smaller payload.
- Cx L–M · Risk L. Tests: `UT-GENLAT-*`, `reload.test`, `UT-CHKPERF-*`, checklist hooks suites.

### B7 — Admin  [OPT-17, 20(S6-12/13/14 only), 27, 08(c), 07c(admin constants), 07d(admin)]
- Files: `data/admin{ChecklistTables,GatesApprovals,DefaultChecklists,Cost,Contract,CapexAccounts}.ts`, `features/admin/*`.
- Method: narrow `select` for locks; `mapLimit` approvals and people; carry `people` across the gates reload; memoised Map/Set derivation in `GateTable`; Costs/Contracts memo; import root constants from `dataverseNames.ts`. **Excluded: S6-07 (Period-1 propagation skip), S6-15, OPT-18 refocus** (decisions).
- Estimated: gates load −3…6 legs; toggle/save −≈6 requests and 1–2 Graph calls; locks payload 5–10× smaller; Gates render ≈10–30 ms → negligible.
- Cx L–M · Risk L (people reuse M). Tests: `UT-ADGATE-*` (note the tabster `{ hidden: true }` convention, CA-19), `UT-ADCOST*`, `adminGatesApprovals.test`.

### B8 — Cross-cutting sweep  [OPT-02, 09 (remaining ~19 call sites), 31 adoption, 32, 33(c–g), 34(rest), 29]
- Method: adopt the B1 helpers at the remaining call sites, one family per commit-sized step, differential test per family; `knip` before every deletion; pooled `Intl`/collators; `useMediaQuery` fix; `trackMetric` lazy payload.
- Cx L–M · Risk L (OPT-09 changes first-failure behaviour of siblings — documented, tested). Done when `knip` shows no new unused files (baseline in CONVENTIONS) and no byte-identical files.

### B9 — Independent QA and close-out
- An agent with no part in the implementation reviews the full diff against `02` (every changed line traceable to an OPT id; nothing outside the approved list), re-runs B0 harnesses for the comparison, runs `npm run verify`, `knip@5` (with `PARITY_SCREEN=land-lease`), the control-label and canvas-identity gates, and writes `06`, `07`, `08`.

### Held (not scheduled): decisions needed first
OPT-18 (focus refetch), OPT-21 (bulk switches), OPT-22 and OPT-23 (guarded-update batching, cascade delete), DEC-1/1b (rounding), DEC-2 (date instants), DEC-5 (Period-1 propagation, allocation name skip), DEC-6 (municipality debounce), DEC-7 (SDK), DEC-8, DEC-9. Each stays in `08` as **deferred with reason** (governance rule 8).

## 4. Testing and validation strategy

1. **Per finding:** the test that proves the claimed change (request count, read order, recompute count) *and* the existing tests of the touched module, run before the change to record the oracle and after.
2. **Equivalence:** where a function is replaced or rewritten, the old implementation stays as a test oracle and a seeded property test (400 seeds, as `UT-ACSAVE`) compares outputs; rounding, ordering and null cases are explicit rows.
3. **Per batch:** `npm run typecheck`, `npm run lint` (no new warnings), `npx vitest run <affected folders>`, then the full `npm run verify` at the end of the batch. The repo's known jsdom worker-start timeouts: re-run the single file; an aborted verify skips the build, so run `npm run build` separately (TESTING-AND-HARNESS).
4. **Gates that must stay green:** `check:power`, `check-control-labels` (UT-LABELS), `check-canvas-identities` (UT-CANVASID), `controlLabels`, `expandChevrons`, `testIdUniqueness`, `UT-REQLOG-*` (trace lines — changed deliberately, never loosened).
5. **Not done by me:** a signed-in `pa app run` smoke test on DEV and the wall-clock numbers (I cannot sign in). The owner runs the DEV checks listed per batch; results are labelled owner-measured.
6. **Playwright parity (E2E):** per AGENT-GUIDE item 6, before any commit or merge I ask whether to run it, and for the inputs in `E2E-PARITY-PROMPT.md`. I will not run it silently.

## 5. Per-batch method (governance §6.2)

1. Re-read the original code (the line numbers in `02` came from the D159 tree; `admin-cost/` has moved a few lines).
2. Record the original behaviour as a test (oracle or characterisation) — **first**.
3. Implement. 4. Review the diff against the OPT entry (nothing extra). 5. Run the tests. 6. Compare outputs against the oracle. 7. Measure with the B0 harness. 8. Update `05_Implementation_Tracker.md`. 9. Next batch only after success.
Agents: one agent per batch (B4–B7 in parallel), the orchestrator owns integration and the file-lock table; no two agents edit the same file; B9 reviewer is independent of the implementers. Each agent returns: findings addressed, files and functions changed, rationale, before/after behaviour, test results, outstanding risks.
Project rules applied at every batch: `aria-label` + `data-testid` on any new/changed control; canvas YAML technical requirements unaffected (no canvas-sourced rule changes); reuse first; improvements log in `13-CODE-APP-IMPROVEMENTS-OVER-CANVAS.md` updated **before any commit**; decision records `D160+` in `02-OPEN-DECISIONS.md` for any freshness divergence (OPT-14's 30-minute person cache, OPT-01 if the header text source changes) with a `DIVERGENCE:` marker, a test and a reversible switch.

## 6. Risk and rollback register

| # | Risk | Where | Likelihood / impact | Mitigation | Rollback |
|---|---|---|---|---|---|
| R1 | OPEX screen loses data it implicitly needed (Land Lease periods in `CostBook`) | B2 | L / H | keep periods in the shape until B3; tests on `useCostBook.save` diff; grep proof recorded | revert B2; scope parameter defaults to old behaviour behind a const |
| R2 | Parallel Land Lease writes break creation order / `createdon` / first-failure semantics | B3 | M / H | tier boundaries = existing parent-before-child; legacy executor as oracle; 400-seed property test | `LEASE_WRITE_PARALLEL = false` const restoring the sequential loop (same pattern as `BULK_SAVE`) |
| R3 | PM header/state text or `approvalState` differs after the row-only loader | B5 | M / M | assertions on header text per state; session stale time reviewed; row-only loader is a separate function, the full one stays for Cost | one-line switch back to `loadProject` in `ProjectScreenGate` |
| R4 | Stale freshness (person cache 30 min, shared countries, no refocus refetch) | B5 | M / L–M | each recorded as `DIVERGENCE` + test + switch; explicit decision entry | const per cache (`PERSON_CACHE_MS = 0` disables) |
| R5 | Over-narrow invalidation misses a refresh | B2, B5 | M / M | the Generators-style safety-net test per job: every table a job writes must invalidate every key that reads it; owner DEV check of one write per screen | revert the job's `invalidate` list |
| R6 | `readByIds` gate changes error behaviour (`Promise.all` lets siblings finish, `mapLimit` stops launching) | B1, B8 | M / L | documented; first-failure test; limit 8 so latency barely moves for small N | per-site revert; helper takes `limit: Infinity` |
| R7 | Merged helpers change a result (rounding, null, date boundary) | B1, B8 | L / H | only identical families merge; differential test with an edge table first; DEC items never merged | revert the family commit |
| R8 | Tests pinning `[VSB]` lines or read counts fail (they should) | all | H / L | updated deliberately with the new count and a comment citing the OPT id; never loosened | n/a |
| R9 | Dead-code removal deletes something reachable (Land Lease branch is exported through `costRepository`) | B3, B8 | L / M | `knip` + grep + the call-graph note; delete last | restore from git |
| R10 | Work collides with the owner's own concurrent edits (HEAD moved during the audit; a peer session exists) | all | M / M | work on a feature branch off `RounakDev1`; check `git status` and `git log` at the start of every batch; no push/merge | drop the branch |
| R11 | OPT-19 reveals a real truncation (a correctness bug, not a perf item) | B5 | L / H | verify on DEV first; fix with `maxPageSize`/`fetchAll`; tell the owner immediately | n/a |
| R12 | DEV behaviour differs from fakes (host batching, 501s, throttling) | B3, B5 | M / M | owner DEV smoke test per batch (checklist in CONVENTIONS "Before pushing to DEV"); nothing pushed without approval | revert, redeploy previous build |

**Rollback mechanics.** I do not commit or push without your explicit approval (project rule). Proposed: one branch `optimization/stage3` off `RounakDev1`, one **local** commit per approved batch (no push, no merge, no co-author trailer — your standing rule), so any batch reverts with `git revert <sha>` without touching the others. If you prefer no commits, each batch is saved as a patch file instead.

## 7. Expected improvement assessment (all estimated; none measured)

| Area | Before → after (estimated) | Basis |
|---|---|---|
| OPEX visit / save | ≈ 12–15 requests, 4 waves → ≈ 4, 2 | `02` OPT-04/06 |
| CAPEX tab switch / refetch | −1 round trip, −2 reads | OPT-05/07c |
| CAPEX paid toggle / comment save | −ceil(contracts/40) requests; comment save no longer reloads the book | OPT-12 |
| CAPEX panel typing | grid DOM rebuilt per keystroke → none | OPT-25 |
| Land Lease save, 40 WTG | ≈ 42–45 sequential requests → ≈ 5–8 waves | OPT-10 |
| PM screen entry | −1…2 round trips; PM save reload 4 → 1 request | OPT-01/13 |
| Team load/save, 20 members | ≈ 22 → ≈ 2 requests (warm cache) | OPT-14 |
| Admin gates toggle/save | −≈6 requests, −1…2 Graph calls; locks payload 5–10× smaller | OPT-17/08c |
| Generators type delete | −1 hop (WTG), −2 (PV) | OPT-15 |
| Everything else | small; mostly maintainability | OPT-29–34 |

At 1.2–1.9 s per request through the host, the P0/P1 items together plausibly remove several seconds from the heaviest actions; this is a reasoned estimate, not a claim. `06` replaces it with measured counts and, where the owner runs DEV, wall-clock.

## 8. What I need from you to start Stage 3

1. **Approve the plan** (or strike items). The recommended scope is B0–B9 as listed, **excluding** the held items in §3.
2. **Branching / commits:** OK to create `optimization/stage3` off `RounakDev1` and make one local commit per batch (no push, no merge, no trailer)? Or patches only?
3. **DEV access for two checks:** OPT-19 (municipality counts per state) and, after each batch, the DEV smoke test — you run them; I give you the exact steps.
4. **Any held decisions you want to resolve now** (DEC-1 is the one with a possible data-correctness impact; I recommend you look at it regardless of this programme).
