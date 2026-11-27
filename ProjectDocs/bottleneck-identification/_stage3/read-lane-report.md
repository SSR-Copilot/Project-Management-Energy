# Stage 3 report: workstream `read-lane` (T-C05, T-C04 partial)

Worktree `C:\wt-bn\read-lane`, branch `perf/read-lane`, base `dde9e92`. Nothing committed, staged or pushed.

STATUS OF VERIFICATION: see section 4 (each line says what I saw and what is the orchestrator's integrated-tree result).

## 1. Tasks

| Task | Status |
|---|---|
| **T-C05** read lane for the id-chunk reads (NET-04 = SCC-10 = NET-12) | DONE. `data/readChunks.ts` (`readChunked`, `readLaned`, one module-level `createGate(16)`), adopted at all 18 `Promise.all(chunk(ids).map(fetchAll))` sites found by grep (the spec says 17; the grep finds 18, see 7): `costBook.ts` x4, `contracts.ts` x3, `comments.ts`, `landLease.ts` x3, `opexCatalog.ts` x2, `standardContracts.ts`, `addCostSheet.ts` x1 chunked read plus the filter-per-chunk contract read (`loadContracts`, via `readLaned`), `currentUser.ts`, `adminGatesApprovals.ts`. Switch default ON. |
| **T-C04 (partial)**, reference preset with `gcTime = staleTime` (NET-08) | DONE for the 7 local `REFERENCE_STALE` constants and `COUNTRIES_STALE_MS` (spec: "7 local ... and COUNTRIES_STALE_MS"); new `data/queryPolicy.ts` (`REFERENCE`). |
| **T-C04 (partial)**, has-contracts focus opt-out (SAD-06 part a) | DONE behind `ADMIN_HAS_CONTRACTS_NO_FOCUS`. Part (b) (`FRESH_ON_ENTRY_ONCE` for the tree) NOT done: needs DEC-F, as the spec says. |
| T-C04 SCC-14 chart memo | NOT done (excluded by the brief, needs owner note). |
| Global `staleTime` / `refetchOnWindowFocus` / `gcTime` in `Providers.tsx` | NOT touched (DEC-F/DEC-3, D165 C6). |
| D51 proof: reference tier does not change Add Cost patching | DONE as tests (UT-ACSHEET-REF-001/002, UT-QPOL-004). |

Not applied on purpose (reference-class judgement, listed so the owner can extend): in `general-data/hooks.ts` the Entra people lookup, the municipality typed search and the trade-tax lookup keep `staleTime` only (typed/per-person keys, RND-10 deferred); in `generators` the generator catalogue (own persisted cache, D142), `useGeneratorModels`, `usePlantSupplierCatalog` and `pvModuleCatalogQueryOptions` (catalogues) keep `staleTime` only; `features/admin/admin-cost/hooks.ts` `REFERENCE_STALE_MS`, `PROJECT_STATES_STALE` and the ~15 inline `30 * 60 * 1000` literals in the Cost hooks are not in the spec's list of 8 and are unchanged.

## 2. Files changed

New: `src/data/readChunks.ts`, `src/data/readLaneFlags.ts`, `src/data/queryPolicy.ts`; tests `src/data/readChunks.test.ts`, `src/data/readChunks.sites.opt.test.ts`, `src/data/queryPolicy.test.ts`, `src/features/admin/admin-capex-accounts/hooks.focus.test.tsx`, `src/features/cost/costing/useAddCostSheet.reference.test.ts`.

Modified (23, `git diff --stat`: 23 files changed, 163 insertions(+), 91 deletions(-)): `src/app/pmScreenPrefetch.ts`; `src/data/{addCostSheet,adminFlags,adminGatesApprovals,comments,contracts,costBook,countries,currentUser,landLease,opexCatalog,standardContracts}.ts`; `src/data/costReadPath.waves.test.ts` (3 tests appended, none changed); `src/features/admin/admin-capex-accounts/hooks.ts`; `src/features/pm/{checklist,finance,general-data,generators,milestones,revenues}/hooks.ts`; `src/features/pm/{general-data,generators,project-main}/queries.ts`.

Not changed: `Providers.tsx`, `package.json`, `src/generated`, `.power`, the 8 existing local read pools (generators, finance, production, checklist, milestones, admin CAPEX), `bulkSend.ts:197`.

Line endings: working copies are CRLF (index LF, `autocrlf=true`); `costBook.ts` and `addCostSheet.ts` are index `-text` with pre-existing lone-CR sequences, which I preserved (their diff is 28 and 11 lines).

## 3. Switches

| Name | File | Default | OFF means |
|---|---|---|---|
| `READ_LANE` (`readLaneFlags()`; test setter `setReadLaneFlagsForTests`) | `src/data/readLaneFlags.ts` | ON | every adopted site is the old unbounded `Promise.all(chunk(ids).map(read))` |
| `READ_LANE_WIDTH` | same | 16 (= `GLOBAL_REQUEST_CEILING` 40 - `GLOBAL_WRITE_LANE` 24) | n/a; raise it to widen the lane |
| `REFERENCE_GC` | `src/data/queryPolicy.ts` | ON | `REFERENCE` carries no `gcTime`: the old `staleTime: 30 min` options exactly |
| `ADMIN_OPT.ADMIN_HAS_CONTRACTS_NO_FOCUS` | `src/data/adminFlags.ts` (+ `useHasContracts` in `admin-capex-accounts/hooks.ts`) | ON | the has-contracts checks use the global focus refetch again |

## 4. Tests and checks

Tests added (ids): UT-READLANE-001..015 (`readChunks.test.ts`: same rows and order as `Promise.all` incl. randomised release order and a 60-seed differential, peak <= 16 for 40 and 100 chunks, all start in the same tick up to 16 chunks, two calls share the lane, first failure and no chunk started after a failure, synchronous throw, switch OFF = peak 40, one `[VSB] ACTION read lane: ...` line only when a call must queue, DATA lines intact); UT-READLANE-SITE-001..004 (`readChunks.sites.opt.test.ts`: `loadComments`, `listDevCoLinks`, `listPaymentTargets`, `loadStandardAssumptions`, lane on vs off on random id lists of 0..1,800 ids, byte-identical output and identical request multiset); UT-COSTWAVE-READLANE-001..003 (`costReadPath.waves.test.ts`: 640 contracts = 16 payment chunks, 3 waves and 20 requests as before; 680 = 17 chunks, the 17th waits, 4 waves; OFF = 3 waves); UT-QPOL-001..009 (`queryPolicy.test.ts`: preset shape, no local constant, unmount + 6/29/31 minutes return visits, the old options reproduce the defect, invalidation unaffected, the General Data factories carry the preset, no Cost module uses the preset); UT-ADCAPEX-FOCUS-001..003; UT-ACSHEET-REF-001..002 (Add Cost patching of an unmounted book with `refetchType: "all"` is unchanged with a reference entry in the cache). No existing test was changed or deleted.

Verification (rule 8), from `ProjectCosts-CodeApp/` of the worktree, with the repaired (uppercase target) `node_modules` junction:

Seen by me in the read-lane worktree (27 Nov 2026, plain `npx vitest` after the junction fix, unless noted):
- `npm run typecheck`: exit 0, no output.
- `npm run lint`: 26 warnings, none in a file I touched (seen before the junction fix; lint does not use vitest).
- `node scripts/check-control-labels.mjs`: `0 missing, 0 duplicate test ids, 48 aria-label warnings, 2 ignored`.
- `node scripts/check-canvas-identities.mjs`: `C1 unknown 0, C2 foreign 0, C3 type 0, C4 label 0, C5 unverified 0`.
- `npm run check:power`: `96 registered, 0 problems`.
- `npx vitest run src/data/`: `Test Files 130 passed (130), Tests 1994 passed (1994)` (144 s). A first run of the same folder was aborted by a machine suspension (16 worker start-up timeouts, reported duration 74,141 s): load noise, discarded.
- New and touched test files, run alone during development: readChunks.test.ts 15/15, readChunks.sites.opt.test.ts 4/4, queryPolicy.test.ts 9/9, costReadPath.waves.test.ts 18/18, hooks.focus.test.tsx 3/3, useAddCostSheet.reference.test.ts 2/2.
- The folders outside `src/data` (app, components, features, ...): in my worktree one run showed `src/app/CostRoutes.capexMount.test.tsx` UT-CAPEXROUTE-FE-001/002 failing on 5 s timeouts (jsdom, machine under load); I did not get a clean re-run there before the orchestrator integrated the tree, so treat my own batch for those folders as UNVERIFIED. `npm run build` was not run by me.

Verified fact from the orchestrator (do not read more into it): Full vitest on the integrated bundle-structure + small-fixes + read-lane tree (orchestrator, 27 Nov 2026): Test Files 497 passed | 1 skipped (498); Tests 8331 passed | 21 skipped | 3 todo; 534 s; typecheck, lint (exit 0), check-control-labels (0 missing), check-canvas-identities (all 0), check:power (96 registered, 0 problems) clean. costBook.ts and features/pm/revenues/hooks.ts conflicted with bundle-structure on import lines and were resolved by union (readChunked + REFERENCE imports kept, chunk and eq removed from the odata import).

The conflicts with entry-prefetch and their resolution are in `read-lane-hooks-resolution.md`.

## 5. Before/after measurements (machine independent, from tests)

Command: `npx vitest run src/data/readChunks.test.ts src/data/costReadPath.waves.test.ts`.

| Case | Before | After |
|---|---|---|
| Peak reads in flight, one call of 40 chunks (1,600 ids) | 40 (UT-READLANE-004, old oracle) | 16 |
| Peak, 100 chunks | 100 | 16 |
| CAPEX tab, 640 contracts (16 payment chunks) | 3 waves, 20 requests | 3 waves, 20 requests (unchanged) |
| CAPEX tab, 680 contracts (17 chunks) | 3 waves, 21 requests, 17 in flight | 4 waves, 21 requests, 16 in flight |
| Reference list, return visit after 6 min (30 min stale) | read again (UT-QPOL-006) | served from cache, 0 reads (UT-QPOL-005) |
| Admin CAPEX tree, return to the tab after the 30 s stale time | one has-contracts read per visible sub-account | 0 (UT-ADCAPEX-FOCUS-001) |

Bundle bytes: not measured (`bundle:report` not run; the change adds about 2.5 kB of source, no new dependency).

## 6. Draft entries for `13-CODE-APP-IMPROVEMENTS-OVER-CANVAS.md`

- **Cost reads: bounded read lane** (NET-04 / SCC-10 / NET-12, T-C05). Status: fixed (proposed for approval as a performance change). A category with hundreds of contracts started every id-chunk request at once (up to 52 in flight with the CAPEX payments and comments reads together); they now share one 16-wide lane, so waves are unchanged up to 16 chunks and larger reads queue instead of flooding Dataverse's 52-request limit. Same rows, same order, same errors; switch `READ_LANE`. Not a canvas behaviour (canvas had no such path).
- **Reference lists stay cached for their stale time** (NET-08, T-C04). Status: fixed. Reference lists declared fresh for 30 minutes were still evicted after 5 minutes unobserved, so a return visit re-read them; `REFERENCE` sets `gcTime = staleTime`. Staleness rule unchanged. Switch `REFERENCE_GC`.
- **CAPEX Accounts: no has-contracts re-check on every tab return** (SAD-06 part, T-C04). Status: fixed. The advisory per-sub-account checks no longer re-run when the tab regains focus; Delete still re-checks on the server. Switch `ADMIN_HAS_CONTRACTS_NO_FOCUS`.
- **New tests/gates**: read-lane differential tests, reference-tier gc tests, has-contracts focus tests (ids above). Status: fixed.

## 7. Risks, decisions, conflicts

- **Spec says 17 sites; grep finds 18** (`addCostSheet.ts` has the chunked cost read plus the per-chunk-filter contract read; costBook has 4 sites, the doc's line list matches). All 18 adopted; `bulkSend.ts:197` (write-path verify read) stays out as the spec says.
- **A chunk that holds more than one request** (none of the 18 sites does: `landLease.ts` and `opexCatalog.ts` run two separate `readChunked` calls side by side) would count as one lane slot. The lane counts chunks, not requests; two concurrent adopted calls share the 16 slots (UT-READLANE-007), so a Summary read of many chunks can delay the same screen's book chunks by a round above 16 (spec risk 8).
- **Error semantics**: identical for a failing chunk (first failure in time, same error). The one difference: a chunk still waiting for a slot is not started after a sibling failed (only avoids work). Chunk retry is T-C06, not done.
- **The lane is a ceiling by count only**; `GLOBAL_GATE` is still off. 16 should be calibrated by probe P-4.
- **Has-contracts checks**: no account write invalidates them (`capexAccountsWriteKeys` leaves them out on purpose), so with the focus refetch off a contract booked by a colleague after the check is not seen until the next mount past 30 s; Delete re-checks on the server (spec says advisory). Owner may want to confirm.
- **Memory**: `gcTime` 30 min applies only to the small fixed-key lists above; typed-search, per-person and catalogue queries were left out (RND-10 deferred).
- **Shared-file conflicts to expect**: `data/costBook.ts` (bundle-structure changes its imports; I changed the odata import line and 4 call sites), `features/pm/{general-data,generators,project-main}/queries.ts` and `app/pmScreenPrefetch.ts` (entry-prefetch adds factories there; my edits are one-line `...REFERENCE` swaps and an import), `data/adminFlags.ts` (small-fixes may add a flag), `data/countries.ts`, and `features/pm/*/hooks.ts` where I replaced the local `REFERENCE_STALE` constant lines. Any factory that entry-prefetch adds with `staleTime: REFERENCE_STALE` should spread `REFERENCE` too, or its prefetched entry keeps the 5 minute gc.
- **Tooling note**: the first `node_modules` junction had a lowercase drive target and made vitest fail ("failed to find the runner"); I worked around it with an external config and `--preserve-symlinks`, then the junction was re-created with the uppercase target (link removed with `rmdir`, contents untouched) and results were re-run with plain `npx vitest`. `src/features/pm/production/__snapshots__/productionPlans.baseline.test.ts.snap` showed as modified after a full run: `git diff --ignore-cr-at-eol` was empty, so it was only vitest rewriting the file with LF endings (index and HEAD hold LF content; the working copy was CRLF); restored with `git checkout -- <that file>`, and restored again after the last run. No behaviour change.
- The machine was suspended during one batch (reported duration 74,141 s, 16 "Timeout waiting for worker" start-up errors): that batch is load/suspend noise and was re-run.
