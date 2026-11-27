# 25 — Implementation tracker

> Stage 3, 27 Nov 2026. Scope approved by the user on 26 Nov 2026 ("Proceed"): Waves 0-2 of doc 20, limited to tasks with no open decision, probe or browser gate. Everything is **uncommitted** in the worktree `…\Project-Management-Energy-WorkDev1-BottleneckOptimization` (branch `feature/bottleneck-identification-optimization`, base `dde9e92`), assembled from four isolated workstreams (doc 33). Traceability: Finding → Root cause (doc 16) → Task (doc 18) → Source changes (this doc) → Tests → Measurements (doc 26) → QA (doc 31).

## 1. Task status

| Task | Findings | Status | Switch (default) | Where |
|---|---|---|---|---|
| T-A08 Check List bench: honest baseline, S7/S8 | SPA enabler | **Done** | none (test only) | `features/pm/checklist/checklistVisit.bench.test.tsx` |
| T-D04 Gates error traced once | RND-09 | **Done** | `GATES_TRACE_ONCE` (ON) | `admin-gates-approvals/Screen.tsx` |
| T-E05 Locks and clusters reads start with the tab list | SAD-02 | **Done** | `DEFAULT_CHECKLISTS_REFS_PARALLEL` (ON) | `admin-default-checklists/Screen.tsx` |
| T-B07 Clean-up unload guard | SAD-05 | **Done** | `CLEANUP_UNLOAD_GUARD` (ON) | `admin-capex-accounts/Screen.tsx` |
| T-E06 Keep CAPEX comment dots | SCC-16 | **Done** | `CAPEX_KEEP_COMMENT_DOTS` (ON, CAPEX caller only) | `useCostBook.ts`, `capex-costs/Screen.tsx` |
| T-E01 Import the pure helper | BND-03, BND-06, BND-07 | **Done** | none (structure) | new `data/{bulkTables,projectStatesRead}.ts`, `pm/*/rules.ts` |
| T-E02 Split three reads out of heavy modules | BND-04 | **Done** | none (structure) | new `data/{revenueLookups,milestoneDurations}.ts`, `general-data/projectColumns.ts` |
| T-E03 Import-direction guard | BND-18 | **Done** | none | `src/test/importGraph.test.ts` (7 tests, 32-edge allowlist) |
| T-C08 Static splash | BND-09 | **Done**, not seen in a browser | none | `index.html`, `styles/global.css` |
| T-C01 Cost entry prefetch | SCC-01 | **Done** | `BOOT_PREFETCH_COST_READS` (ON) | `costQueries.ts`, `costScreenPrefetch.ts`, `bootPlan.ts`, `bootPrefetch.ts` |
| T-C02 Production / Revenues / Finance prefetch | SPB-02 | **Done** | `BOOT_PREFETCH_PM_EXTRA_SCREENS` (ON) | `pm/{production,revenues,finance}/queries.ts` |
| T-C03 Intent prefetch + admin loaders | SPA-09, BND-17 | **Done** | `BOOT_PREFETCH_ADMIN_CHUNK` (ON), `INTENT_PREFETCH_CHUNKS` (ON), **`INTENT_PREFETCH_DATA` (OFF)** | `screenLoaders.ts`, `screenPrefetch.ts`, `intentPrefetch.ts`, `useRailIntent.ts` |
| T-C05 Read lane (16 wide) | NET-04 group | **Done** | `READ_LANE` (ON), `READ_LANE_WIDTH` 16 | `data/readChunks.ts`, 18 read sites |
| T-C04 Freshness tier 1 (partial) | NET-08, SAD-06 (part a) | **Partly done** | `REFERENCE_GC` (ON), `ADMIN_HAS_CONTRACTS_NO_FOCUS` (ON) | `data/queryPolicy.ts` |

All switches in the default state are one-line rollbacks (doc 24).

## 2. Not done, with the reason

| Item | Reason |
|---|---|
| T-A04 Generators lazy warm-up, T-A05 shareholder writes | Need an owner decision / the QA-07 DEV order check |
| T-D00 browser campaign, T-E08 DEV probe pack | Need a signed-in browser / DEV access |
| T-C04: SCC-14 chart memo, SAD-06 part (b), global `staleTime` / `gcTime` / refocus | Need an owner note / DEC-F / DEC-3 (D165 rule C6) |
| Reference spread for the Cost factories in `costQueries.ts` and Production `ASSUMPTIONS_STALE` | Left out on purpose: UT-QPOL-004 pins that no Cost module uses the preset (D51 patching of an unmounted book); owner may extend |
| SCC-15 | Deferred in Stage 2 |
| All Wave 3-5 tasks (write-path, reload, decision-gated, measure-first) | Not approved yet; each needs its DEV check or decision (doc 20) |

## 3. Change set

- **111 paths** under `ProjectCosts-CodeApp/` (modified + new), no change to `src/generated/`, `.power/`, `package.json`, the lockfile or any Dataverse or flow artefact.
- New modules: `data/{bulkTables,revenueLookups,milestoneDurations,projectStatesRead,readChunks,readLaneFlags,queryPolicy,smallFixesFlags,entryPrefetchFlags}.ts`, `features/pm/general-data/projectColumns.ts`, `features/cost/costing/costQueries.ts`, `features/pm/{production,revenues,finance}/queries.ts`, `app/{costScreenPrefetch,screenPrefetch,intentPrefetch,intentStart,useRailIntent}.ts`.
- Tests: **8,379 passing** (baseline D165 8,273; +106) in 501 files (baseline 491).

## 4. Deviations from the Stage 2 specs (all disclosed by the implementers)

1. `listProjectStates` lives in `data/projectStatesRead.ts`, not in `projectStates.ts` (a call inside the same module cannot be stubbed with `vi.mock`). The patch's compatibility re-exports were removed except `PROJECT_COL` and `CAPEX_*`.
2. `read-lane` found **18** id-chunk read sites, not 17; all 18 adopted.
3. T-D04 test ids are UT-ADGATE-950..952 (920/921 were taken); the optional `QueryStates` ref cache was not built.
4. `INTENT_PREFETCH_CHUNKS` ships ON (not named in the brief): it downloads a screen chunk on hover, no Dataverse traffic.
5. `costQueries.ts` uses a local identity helper instead of `queryOptions` from the package (a test file replaces `@tanstack/react-query` with a partial mock).
6. UT-ADCHK-902 lost one assertion (locks not called on an empty tab list); the spec accepts one extra read there.
7. Two merge-integration fixes made by the orchestrator: the `pmScreenPrefetch.screens.test.tsx` mocks were repointed to `@/data/revenueLookups`; `useCostBook.ts` and the Revenues/Finance hooks and factories were merged by hand (15 conflict blocks, resolutions documented by the implementers in `_stage3/*-resolution.md`).

## 5. Open items before any commit

1. **Start-up closure grew**: 302.0 to 303.9 KiB gzip (+1.9, 0.6 %), 8 to 12 files. Fails the "must not grow" criterion; needs an owner decision (doc 26 section 3).
2. Independent QA review: doc 31.
3. `13-CODE-APP-IMPROVEMENTS-OVER-CANVAS.md` update, the E2E parity question and the user's explicit approval (project rules).
4. Browser check of the splash; DEV smoke test; before/after browser measurement (doc 28).
