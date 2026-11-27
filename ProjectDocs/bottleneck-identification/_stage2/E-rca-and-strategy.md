# Stage 2, agent E: root-cause validation and remediation strategy (T7 redundant / eager / over-wide reads, T9 bundle and module coupling)

> 26 Nov 2026. Base `dde9e92`, branch `feature/bottleneck-identification-optimization`. Planning only: nothing under `ProjectCosts-CodeApp/` was edited and no git state changed (one `git apply --check`, read-only, was run against the patch below). `src/` = `ProjectCosts-CodeApp/src/`. Evidence labels as in the Stage 1 brief: MEASURED (a command was run), DERIVED (counted from code), ESTIMATED (reasoning).
>
> **How the bundle numbers were produced.** The worktree's `dist/` was rebuilt from a throwaway copy of `src/` placed under `_bench/S2E/app/` (node_modules by junction, since removed together with every build). The unmodified copy reproduces `dist/` exactly (155 JS files, startup 8 files 1030.1 KiB min / 302.0 KiB gz, every per-screen closure identical to `_bench/BND/closure.out.txt`). I then applied the proposed import changes one by one and rebuilt (`npx vite build`, 5 s each). Sizes are "first-load union" = static-import closure plus Vite's preload map, minus the startup files, gzip level 9, per lazy Screen entry. Tools kept: `_bench/S2E/cmp.mjs` (per-screen closure table), `modules.mjs` (source modules inside one screen's union), `who-imports.mjs`; outputs `cmp-base-vs-e5.out.txt`, `cmp-base-vs-e10.out.txt`, `cmp-cumulative.out.txt`; the change set as `first-wave-experiment.patch` (22 files, applies cleanly to the base tree). In the scratch copy `tsc -p tsconfig.app.json` reported only the 8 unused-import errors the moves leave behind (TS6133/TS6192), no type error; tests were NOT run (the copy had none), so every test statement below is a grep, not a run.

## 0. The answer in six lines

1. **T9 is one root, not fourteen findings.** BND-18 (`data/` imports `features/**` rules) is the cause of BND-03, 04, 06, 07 and part of BND-08/SCC-19. Fixing the cheap edges (4 pure-helper moves, 22 files touched incl. tests) removes **15-60 KiB gz from 15 of 22 first-load closures** (table in section 3), MEASURED in a scratch build, with no behaviour change.
2. **The value is cold-cache bytes, not seconds.** 15-60 KiB gz is 6-24 ms at 20 Mbit/s (ESTIMATED; no recorded unit cost for asset transfer exists in the repo) and only on the first visit per release per browser. It is worth doing because it is low risk and stops the coupling from growing, not because users will notice it. I do not promise seconds.
3. **Two Stage 1 remediations do not work as written.** BND-10 (lazy Report panel): MEASURED startup -14.4 KiB gz, but every screen that uses `FormPanel` pays +18 KiB gz, landing +5.1: net about -9 on the landing, +3.7 elsewhere. BND-11 (vendor chunk): MEASURED 80 -> 78 changed file names of 149, i.e. no effect. The facade-only fix for BND-08/SCC-19 (lazy `costRepository` members plus moving three helpers) moved **+1.5 KiB gz** the wrong way (MEASURED, section 4.8): the binding coupling is `costBook` -> Land Lease/OPEX row mapping, not the facade.
4. **BND-16 (155 files) is not a bottleneck on current evidence**: the 80 files under 3 KB total 90 KiB; they are fetched in parallel through Vite's preload map. The first wave also shrinks the count (155 -> 150).
5. **T7: three small fixes and a measurement pack.** SAD-02 (locks read waits for the tabs read) and SCC-16 (comment dots flicker) are safe, low effort. SPB-14 is a switch flip after a DEV probe. Everything else in T7 is either parallel already (SPB-06, NET-10), a safety read (SAD-15), or needs a row count or latency nobody has measured (SAD-01, SPB-12).
6. **Tests that a naive move breaks:** five `vi.mock("./generalData", ...)` seams (checklist x4, revenues.perf) and the G-REQ baseline in `src/test/requestSites.test.ts` (a moved request site is a "new file with a site" to that gate). Both are part of the task, not surprises.

## 1. Scope (findings owned)

26 findings: T9 = BND-03, BND-04, BND-05, BND-06, BND-07, BND-08, BND-10, BND-11, BND-13, BND-14, BND-16, BND-18, SCC-19. T7 = NET-06, NET-10, SAD-01, SAD-02, SAD-10, SAD-11, SAD-13, SAD-15, SCC-16, SCC-18, SPB-06, SPB-12, SPB-14. Excluded as instructed: every `SPA-` row (SPA-05, SPA-07, SPA-08 are T7 and SPA-16 is T9; agent A has them).

Files re-opened for this stage (beyond Stage 1): `vite.config.ts`, `src/app/{routes.tsx,screenLoaders.ts,bootPrefetch.ts,generatorsWarmup.ts}`, `src/App.tsx`, `src/data/{projectStates,generalData,revenues,milestones,costBook,costRepository,bulkSend,addCostSheet,addCostSheetBulk,opexCatalog,adminChecklistTables,generators,generatorsPerfFlags,bootDvoptFlags,comments}.ts`, `src/features/cost/costing/useCostBook.ts`, `src/features/cost/{capex-costs,add-costs-from-table}/Screen.tsx`, `src/features/pm/{general-data,milestones,finance,generators}/{hooks,Screen}.tsx`, `src/features/pm/general-data/{ProjectMap.tsx,rules.ts}`, `src/platform/azureMapsToken.ts`, `src/appInsights/appInsights.ts`, `src/app/SessionContext.tsx`, `src/features/admin/{admin-default-checklists,admin-cost}`, `src/test/requestSites.test.ts`, `scripts/bundle-report.mjs`, the `_bench/BND` scripts, and the sibling Stage 2 documents A, B, D for conflicts. Not read: the `.test.*` files except by grep, the PM flow and Fabric code, the host.

## 2. RCA verdict table

| ID | Verdict | Classification | Isolated / cross-screen | Note |
|---|---|---|---|---|
| BND-03 | ACTUAL | implementation (import path) | cross (Planning, Grid Operator, Revenues, Milestones; Production/Generators need the chunk anyway) | 3 rules files import two helpers through the Generators barrel although `domain/powerFxNumeric.ts:176,187` already owns them (OPT-33). Production's own import (`production/rules.ts:70`) is harmless: it reaches the barrel via `data/generators`. MEASURED -19.7 to -19.9 KiB gz on four screens |
| BND-04 | SHARED-ROOT (BND-18) | architecture (module coupling) | cross (Milestones, Revenues, General Data, cost screens) | Stage 1 undersized it. Three separate couplings: `data/revenues` -> `landLease`; Milestones/General Data -> `costBook` for two milestone functions (this also drags `landLease` and `capex-costs/rules`); General Data -> `data/checklist` for one cancel-path call. Together MEASURED Milestones 128.1 -> 67.6, Revenues 140.7 -> 103.6, General Data 118.0 -> 77.2 KiB gz |
| BND-05 | ACTUAL | execution order | isolated (General Data) | token request starts in `getToken` only after the 1.7 MB chunk has loaded and `new atlas.Map` ran (`ProjectMap.tsx:84-92`, `azureMapsToken.ts:150-170`); the flow round trip is serial after the download. A flow-call timing change: marked DECISION |
| NET-06 | ACTUAL | duplicate reads | isolated | confirmed (`routes.tsx:185` mounts both screens). Real only on a cold entry or reload of `/costs/add-from-table`; from the CAPEX button the book is cached. The reads are not identical (section 5.4) |
| SAD-01 | UNRESOLVED | data volume (unknown) | isolated (admin) | no row count of locking approvals exists; probe P3 |
| BND-06 | SHARED-ROOT (BND-18) | architecture | cross (13 of 22 screens incl. the landing and 6 admin screens) | MEASURED landing 55.6 -> 39.6 KiB gz, four cost screens -14.6, two admin screens -15 to -16. Needs `listProjectStates` to move AND its 6 importers to be repointed |
| BND-07 | SHARED-ROOT (BND-18); size OVERSTATED | architecture | cross (Finance, Production, Generators) | MEASURED -6.9 KiB gz (not 12): `bulkSend` itself (36 KiB min) stays; only the Add Cost sheet descriptor chain leaves |
| BND-08 | SHARED-ROOT (BND-18 + `costBook` scope coupling); UNRESOLVED size | architecture | cross (5 cost screens + Finance chunk) | facade-only fix measured as ineffective (section 4.8); real fix is splitting `costBook` by scope; needs a spike |
| BND-10 | OVERSTATED | implementation | cross (start-up) | net -9 KiB gz on the landing only, +3.7 on every other first screen (MEASURED) |
| BND-11 | UNRESOLVED (churn is real; its cost depends on the host cache) | architecture (chunk graph) | cross | MEASURED 80/149 names change on a no-source-change rebuild; the Stage 1 vendor-chunk direction changes it by 2 |
| BND-13 | SHARED-ROOT (with SPA-10, NET-20, SPB-16) | architecture / network | cross (every PM screen) | owned by agent A's T-A04; the switch `GENERATORS_WARMUP_LAZY` exists and is OFF |
| BND-14 | OVERSTATED | execution order | cross (telemetry-on) | 75 KiB gz competing with the first screen; parse-only 6.3 ms (Stage 1); no measured contention |
| BND-16 | NOT-A-BOTTLENECK (on current evidence) | network (request count) | cross | 80 files < 3 KB = 90 KiB total; 18 generated-service files = 19 KiB; parallel preload |
| BND-18 | SHARED-ROOT (the root) | architecture | cross | 46 value+type import statements from `data/**` into `features/**` in 28 files; about 10 are heavy cross-screen edges |
| NET-10 | OVERSTATED | network (parallel small read) | cross (8 PM screens) | one extra `top:1` read per first visit, in parallel with the screen's other reads; no wall-clock effect derivable |
| SAD-02 | ACTUAL | execution order | isolated (admin) | `useChecklistLocks(hasTabs)` and `useChecklistClusters(hasTabs)` at `Screen.tsx:154,156` wait for a read neither depends on |
| SAD-10 | NOT-A-BOTTLENECK | network (negligible) | isolated | one small extra read per scope change; the switch is OFF on purpose (failure coupling) |
| SAD-11 | OVERSTATED | execution order | isolated | six reads in parallel; the gain is `max(6) - max(2)`; and it changes the failure screen |
| SAD-13 | ACTUAL (small) | execution order | isolated | 3-4 dependent waves; first-visit only |
| SAD-15 | NOT-A-BOTTLENECK | safety read | isolated | the ownership re-check at save is a guard, not waste |
| SCC-16 | ACTUAL | implementation (key change) | isolated (CAPEX) | confirmed; `useCapexComments` is shared with the comments panel, so the fix must be opt-in |
| SCC-18 | OVERSTATED | duplicate read | isolated (OPEX) | one request; the two reads sit in different waves, so reuse needs a wait or a fallback read |
| SCC-19 | SHARED-ROOT (with BND-08) | architecture | isolated per screen, same root as BND-08 | cost chunks are prefetched beside the session (`bootPrefetch.ts`), so off the critical path on a fast link |
| SPB-06 | UNRESOLVED | data volume (unknown) | isolated | the catalogue read is in wave 1, parallel with the PV types (`queries.ts:109-110`); costs time only above 500 rows |
| SPB-12 | UNRESOLVED | network latency (Fabric, unmeasured) | cross (3 screens) | needs the `[VSB] DATA` lines of the Fabric reads |
| SPB-14 | ACTUAL | execution order | isolated | two sequential reads; the one-read replacement is coded and OFF |

## 3. The measured first-wave table (this is the evidence for T-E01 and T-E02)

KiB gz of the first-load union per lazy Screen entry, base `dde9e92` vs the cumulative scratch build (E1 BND-03, E2/E3b BND-06, E3 BND-07, E4 BND-04 revenues, E5 BND-04 milestone durations, E10 General Data lazy checklist). From `cmp-base-vs-e10.out.txt`; lazy files = n.

| Screen | base gz (files) | after gz (files) | delta gz | main reason |
|---|---|---|---|---|
| pm/milestones | 128.1 (45) | 67.6 (32) | **-60.4** | BND-03 -19.7, BND-06 -0.3, BND-04 revenues -16.3, milestone durations -25.4 |
| pm/general-data | 118.0 (50) | 77.2 (35) | **-40.8** | BND-04 durations -26.7, lazy checklist -13.4, `listProjectStates` +0.6 |
| pm/revenues | 140.7 (44) | 103.6 (39) | **-37.2** | BND-03 -19.7, BND-06 -2.1, BND-04 -15.8 |
| pm/finance | 107.6 (33) | 85.7 (25) | -22.0 | BND-06 + BND-07 (`general-data/rules` and the Add Cost descriptors leave) |
| pm/grid-operator | 52.1 (16) | 32.1 (13) | -20.0 | BND-03 |
| pm/planning | 94.1 (30) | 74.2 (27) | -19.9 | BND-03 |
| cost/add-from-table, capex, land-lease, opex | 130.0 / 138.5 / 141.9 / 142.6 | 112.3 / 120.8 / 124.2 / 124.9 | -17.7 | BND-06 -14.6, BND-04 -1.5 to -1.7, BND-07 -0.2 |
| admin/default-checklists, gates-approvals | 74.7 / 70.3 | 58.5 / 55.3 | -16.2 / -15.0 | BND-06 |
| pm/project-main (landing) | 55.6 (26) | 39.6 (18) | **-16.0** | BND-06 (`generalData` + its rules leave the landing) |
| pm/checklist | 88.1 (28) | 75.3 (26) | -12.8 | BND-06 -1.8, `PROJECT_COL` split -11.0 (E9, optional) |
| pm/production, pm/generators | 83.8 / 113.2 | 75.2 / 105.1 | -8.6 / -8.1 | BND-07 -6.9, BND-06 |
| cost/contracts, pm/team, admin x4 others | | | 0 to -3.4 | unaffected |

Startup is unchanged (302.0 -> 301.9). JS files 155 -> 150. Cold total (startup + lazy) for the landing: 357.6 -> 341.6 KiB gz; Milestones 430.1 -> 369.7; General Data 420.0 -> 379.2.

## 4. Per-finding specifications

Path shorthand `src/`. All gz figures are MEASURED in the scratch build unless marked.

### 4.1 BND-18: the root; and the import-direction guard (T-E03)

1. **Current implementation.** 46 import statements from `src/data/*.ts` into `@/features/**` (DERIVED: `grep` over `src/data`, non-test). Heavy cross-owner value edges: `data/checklist.ts:24` and `data/milestones.ts:27` -> `general-data/rules` (only for `PROJECT_COL`); `data/generalData.ts:24-27` -> `general-data/rules`; `data/costBook.ts:~70-77` -> `capex-costs/rules`, `periods/landLeaseRules`, `./landLease`; `data/periodWrites.ts` -> `periods/opexRules`; `data/costRepository.ts:19-58` -> every cost data module; `data/addCostSheet.ts` -> `capex-costs/rules`, `costing/saveTimeline`; `data/bulkSend.ts:48` -> `addCostSheetBulk` -> `add-costs-from-table/rules`; `data/generatorCatalogueCache.ts:26`, `data/generators.ts:44` -> `generators/rules` (legitimate: the data module of that screen).
2. **Root cause (validated).** Rules modules are pure and own the column maps (`PROJECT_COL`, `GRID_OPERATOR_COL`...), so the data layer of screen A imports the rules module of screen B for one constant or one helper, and a bundler cannot split inside a module. Features are not marked side-effect free (`vite.config.ts:72` exempts only `components` and `domain`), so the whole module graph ships.
3. **Proposed.** Not a mass move to `domain/`. Two moves only: (a) helpers go to the owner that already has them (`domain/powerFxNumeric` for number formatting; a tiny `data/` module for a shared read); (b) a guard so the edge list cannot grow: new `src/test/importGraph.test.ts` that scans `src/data/**` and `src/features/**/rules.ts` import statements (skipping `import type`, as `requestSites.test.ts` skips comments) and asserts (i) a committed allowlist of data -> features value edges is exact, (ii) the "light modules" named in T-E01/T-E02 do not reach, transitively over value imports, `features/pm/generators/rules`, `features/pm/general-data/rules`, `data/landLease`, `data/addCostSheetBulk`, `data/costBook` (each light module has its own assertion).
4. **Expected technical benefit.** Prevents regression of the measured 15-60 KiB gz per screen; no runtime change. Counted: 46 edges now; allowlist keeps it from growing.
5. **User-visible.** None directly.
6. **Dependencies.** After T-E01/T-E02 so the allowlist does not bless the edges they remove.
7. **Functional risks.** None (test only).
8. **Performance risks.** None.
9. **Complexity.** Low-Medium (about 120 lines of test, one list file).
10. **Tests.** New `src/test/importGraph.test.ts`: UT-IMPGRAPH-001 (allowlist exact, none stale), UT-IMPGRAPH-002 (planning/grid-operator/revenues rules do not reach generators rules), UT-IMPGRAPH-003 (`data/projectStates` does not reach general-data rules), UT-IMPGRAPH-004 (`data/bulkSend` does not reach `addCostSheetBulk`), UT-IMPGRAPH-005 (milestones and general-data hooks do not reach `costBook`), UT-IMPGRAPH-006 (`data/revenues` does not reach `landLease`). Pattern and parser reuse: `requestSites.test.ts`.
11. **Acceptance.** `npx vitest run src/test/importGraph.test.ts` green; mutation check: re-adding one removed import makes exactly the matching test fail.
12. **Rollback.** Delete the test file.

### 4.2 BND-03: Planning / Grid Operator / Revenues import two helpers through the Generators barrel (T-E01)

1. **Current.** `features/pm/planning/rules.ts:42`, `grid-operator/rules.ts:42`, `revenues/rules.ts:69` (and `production/rules.ts:70`) import `forLanguage` / `textFormat` from `@/features/pm/generators/rules`, a barrel `export *` of 7 modules. `domain/powerFxNumeric.ts:176,187` defines both (moved there by OPT-33 B8; `rulesCore.ts:2534` re-exports them).
2. **Root cause.** Stale import path after OPT-33 moved the helpers; `features/` is not side-effect free, so the barrel's 69.6 KiB min / 19.7 KiB gz `rules` chunk ships with the importer.
3. **Proposed.** In the three files change the import to `@/domain/powerFxNumeric` (merge into the existing import of that module at `planning/rules.ts:~37`, `grid-operator/rules.ts:~37`, `revenues/rules.ts:~65`). `production/rules.ts:70`: change too (consistency; no byte effect). Keep the barrel re-export so no other importer changes.
4. **Benefit.** MEASURED (E1): Planning -19.9, Grid Operator -19.9, Revenues -19.7, Milestones -19.7 (through `data/revenues` -> `revenues/rules`) KiB gz; Generators -0.4, Production -0.7.
5. **User-visible.** Less first-visit download on four PM screens (about 8 ms at 20 Mbit/s, ESTIMATED); cold only.
6. **Dependencies.** None. Same files as other agents: `revenues/rules.ts`, `planning/rules.ts` are not in any sibling task I read.
7. **Functional risk.** None: same functions (the barrel re-exports the domain ones, identity preserved).
8. **Performance risk.** None.
9. **Complexity.** Low, 4 lines.
10. **Tests.** Existing: `planning/rules.test.ts`, `grid-operator/rules.test.ts`, `revenues/rules.test.ts`, `production/rules.test.ts` unchanged. New: UT-IMPGRAPH-002; UT-BNDHELP-001 `expect(generatorsRules.textFormat).toBe(domain.textFormat)` (identity).
11. **Acceptance.** `npm run build` + `node _bench/S2E/cmp.mjs <before> <after>`: Planning <= 75, Grid Operator <= 33, Milestones/Revenues each -19 or better, KiB gz.
12. **Rollback.** Revert the commit (no switch).

### 4.3 BND-06: the shared project-states read drags General Data into 13 screens (T-E01)

1. **Current.** `data/projectStates.ts:14` imports `listProjectStates` from `data/generalData.ts:167`; `generalData.ts:24-27` statically imports `features/pm/general-data/rules` (113 KB source, 32.8 KiB min) and 9 generated services. Six importers use the function through `./generalData`: `data/checklist.ts:31`, `data/finance.ts:42`, `data/revenues.ts:33`, `features/pm/milestones/hooks.ts:34`, `features/pm/revenues/hooks.ts:40`, plus `projectStates.ts` itself.
2. **Root cause.** A shared read lives in a screen's data module (D159 centralised the key, not the module).
3. **Proposed.** Move `SharedProjectState` and `listProjectStates` (generalData.ts:~150-186) into `data/projectStates.ts` (it needs `Vsb_projectstatesService`, `fetchAll`, and `type ProjectStateRef`). Repoint the five importers above to `./projectStates` / `@/data/projectStates`. `features/pm/general-data/queries.ts:12` may keep importing from `generalData` through a one-line `export { listProjectStates, type SharedProjectState } from "./projectStates"` there (it already loads General Data) or import from `projectStates` directly (preferred: no unused-export for knip). `data/adminDefaultChecklists.ts:17` and `admin-gates-approvals/fixtures.ts:8` import only the type: repoint for consistency.
4. **Benefit.** MEASURED (E2 + E3b): landing 55.6 -> 39.6 (-16.0), cost screens -14.6 each (4 screens), admin default-checklists -16.2, gates-approvals -15.0, Finance -14 (before E1/E3), Checklist -1.8; screens that use both modules (General Data, Milestones, Revenues) +0.4 to +0.6 (one extra small chunk).
5. **User-visible.** The landing (the first screen of every session) downloads 16 KiB gz less on a cold cache; the same for the Cost entry screens.
6. **Dependencies.** Agent D's T-D01 touches `data/generalData.ts` and `general-data/queries.ts`: merge order matters (conflict note in section 6). G-REQ baseline.
7. **Functional risk.** Low. Same function, same key `qk.generalDataProjectStates`, same freshness. The one real hazard is test mocking: five tests mock `./generalData` to stub the function and would silently hit the real service after the repoint.
8. **Performance risk.** None.
9. **Complexity.** Low-Medium (about 14 files, 6 of them tests).
10. **Tests.** Update the mock seam in `data/checklist.existing.test.ts:27`, `checklist.narrow.test.ts:33`, `checklist.people.perf.test.ts:17`, `checklist.reads.test.ts:34`, `revenues.perf.test.ts:20` (`vi.mock("./projectStates", ...)` keeping the other exports with `importOriginal`, because `projectStates.ts` also exports query options). Extend `data/projectStates.test.tsx`. Update `src/test/requestSites.test.ts` BASELINE_TEXT: `data/generalData.ts: 10` -> 9, add `data/projectStates.ts: 1` (UT-GREQ-001/002/003). New UT-IMPGRAPH-003.
11. **Acceptance.** Landing closure <= 41 KiB gz and 18-20 lazy files; Finance `general-data/rules` absent from `modules.mjs pm/finance`; full `npx vitest run` green; `npx -y knip@5` baseline (36 files) unchanged.
12. **Rollback.** Revert the commit.

### 4.4 BND-07: bulk transport imports the Add Cost sheet module (T-E01)

1. **Current.** `data/bulkSend.ts:48` imports `CAPEX_CONTRACTS`, `CAPEX_COSTS` from `./addCostSheetBulk` (defined at `addCostSheetBulk.ts:104-114`, which imports `add-costs-from-table/rules`). `generatorsBulk` imports `bulkSend`, so Finance, Production and Generators load the Add Cost sheet chain.
2. **Root cause.** Two entity descriptors defined in the consumer instead of with the transport.
3. **Proposed.** New `data/bulkTables.ts` with the two descriptors (needs `ES`, `ES_ADMIN`, `type BulkTableInfo`); `bulkSend.ts` and `addCostSheetBulk.ts` import them from there (`addCostSheetBulk` re-exports nothing: its importers `addCostSheet.ts:68` import `CAPEX_CONTRACTS, CAPEX_COSTS` from it, so repoint those too or keep a re-export; prefer repoint).
4. **Benefit.** MEASURED (E3): Finance, Production, Generators -6.9 KiB gz (-22 KiB min); cost screens -0.2. Stage 1 said 12 KiB: `bulkSend` (36 KiB min) and `bulkWrites` stay.
5. **User-visible.** Negligible alone; it removes the module coupling the next task also needs.
6. **Dependencies.** D51 contract tests (UT-ACBULK, UT-BULK). Tests `addCostSheet.timeline.test.ts:17,35` mock `./addCostSheetBulk` and `./bulkSend` with `importOriginal`: they keep working because the descriptors are plain values.
7. **Functional risk.** None (constants).
8. **Performance risk.** None.
9. **Complexity.** Low, 4 files.
10. **Tests.** Existing UT-BULK-*, UT-ACBULK-*, UT-ACSHEET-BULK-* unchanged; UT-IMPGRAPH-004; G-REQ unchanged.
11. **Acceptance.** `modules.mjs pm/finance` shows no `addCostSheetBulk.ts` / `add-costs-from-table/rules.ts`; Finance <= 87.5 and Generators <= 106 KiB gz when combined with T-E01.
12. **Rollback.** Revert.

### 4.5 BND-04: three data modules reach heavy neighbours (T-E02)

1. **Current.** (a) `data/revenues.ts:34` imports `loadCountryInflation, loadCurrencies` from the 678-line `./landLease` although `data/countryInflation.ts` and `data/currencies.ts` exist. (b) `features/pm/milestones/hooks.ts:40` imports `findCurrency`, `loadFirstRevenueSubaccount` from `data/revenues` (two small reads, `revenues.ts:213,242`), so Milestones loads `revenues/rules` (165 KB source). (c) `features/pm/milestones/hooks.ts:35`, `general-data/hooks.ts:43` and `milestones/rules.ts:50` (type) import `loadMilestoneAssumptionValues` / `loadMilestoneDurations` (`costBook.ts:820,859`), which pulls `costBook` + `landLease` + `capex-costs/rules` + `periods/landLeaseRules` (about 56 KiB gz) into two PM screens. (d) `general-data/hooks.ts:40,262-267` statically imports `data/checklist` for one cancel-path call.
2. **Root cause.** BND-18 applied to four reads; (c) is the biggest and Stage 1 missed it (it saw "landLease stays through costBook").
3. **Proposed.** (a) `revenues.ts` imports from `./countryInflation` and `./currencies` (`loadCurrencies` is `[...await loadAllCurrencies()]`, `landLease.ts:254`). (b) New `data/revenueLookups.ts` holding `loadFirstRevenueSubaccount` and `findCurrency`; `revenues.ts` imports them for its own callers; `milestones/hooks.ts` and `revenues/hooks.ts:45-48` import from `revenueLookups`. (c) New `data/milestoneDurations.ts` holding `AVERAGE_DURATION_NAME`, `loadMilestoneDurations`, `MilestoneAssumptionValues`, `loadMilestoneAssumptionValues`; `costBook.ts` no longer defines them; repoint the three importers and `useCostBook.ts:12` (`loadMilestoneDurations`). (d) In the cancel path: `const { listChecklistGates } = await import("@/data/checklist");` inside the existing `try` (the call is already awaited network work in a write job). (e) Optional (E9): `PROJECT_COL` of general-data into `features/pm/general-data/projectColumns.ts` so `data/checklist.ts:24` and `data/milestones.ts:27` need not import `rules` (Checklist -11.0 KiB gz; others +0.3).
4. **Benefit.** MEASURED, incremental on top of T-E01: (a)+(b) Revenues -15.8, Milestones -16.3, cost screens -1.7, General Data -1.6; (c) General Data -26.7, Milestones -25.4; (d) General Data -13.4; (e) Checklist -11.0. Cumulative with T-E01 in section 3.
5. **User-visible.** Milestones, Revenues and General Data, three of the five heaviest PM visits, lose 15-60 KiB gz on a cold cache. For (d) the cancel action fetches one chunk the first time (about 13 KiB gz); mitigate by starting `import("@/data/checklist")` from the existing screen-load effect at idle.
6. **Dependencies.** (c) needs the BND-06 move first only for tidiness. Conflicts: agent D T-D01 (`general-data/hooks.ts`, `data/generalData.ts`), agent A on General Data (`SPA-14..16`), agent B T-B05/T-B09 (`data/landLease.ts`, `useCostBook.ts`). See section 6.
7. **Functional risk.** Low for (a)-(c): functions move verbatim. (a) `findCurrency` without `onlyThisCode` keeps its `loadCurrencies` semantics. (d): lazy chunk load can fail offline inside the cancellation `try`; the existing `catch` traces it, as for any read failure (UT-GDATA cancellation tests must still pass). Tests that mock `./costBook` for the milestone functions need the new module path (grep: `costBook.test.ts`, `costReadOptions.test.ts`, `projectLoad.*.test.ts` reference them; to be checked in the task).
8. **Performance risk.** A new module split adds one tiny chunk to screens that use both sides (+0.3 to +0.6 KiB gz, MEASURED). (d) adds a chunk fetch to the cancel path.
9. **Complexity.** Medium (about 14 files; (c) is the largest move, about 100 lines).
10. **Tests.** Extend `data/revenues.perf.test.ts`, `data/costBook.test.ts` (move the milestone-duration cases to a new `data/milestoneDurations.test.ts`, ids UT-MSDUR-001...), `features/pm/milestones/hooks.test.*`, `features/pm/general-data/hooks.test.*`; G-REQ baseline: `data/revenues.ts: 9` -> 7 and `data/revenueLookups.ts: 2`; `data/costBook.ts: 11` -> 10 and `data/milestoneDurations.ts: 1`; UT-IMPGRAPH-005, -006.
11. **Acceptance.** After T-E01+T-E02: Milestones <= 68, Revenues <= 104, General Data <= 78 KiB gz; lazy file counts 32 / 39 / 35; no `landLeaseRules.ts` in `modules.mjs pm/milestones`.
12. **Rollback.** Revert each step separately (they are independent); (d) alone by restoring the static import.

### 4.6 SAD-02: the locks and clusters reads wait for the tabs read (T-E05)

1. **Current.** `features/admin/admin-default-checklists/Screen.tsx:150-156`: `hasTabs` -> `useChecklistClusters(hasTabs)`, `useChecklistTasks(hasTabs ? tabId : null)`, `useChecklistLocks(hasTabs)`. `hooks.ts:57-58`: the locks `queryFn` takes no argument; clusters is the shared Project States read.
2. **Root cause.** `enabled` was tied to the tab list although neither read depends on a tab id. Execution order only; tabs are cached 5 min, so only a cold entry pays.
3. **Proposed.** Pass `true` for clusters and locks (keep tasks gated on the tab id). With BND-06 done the clusters read is usually a cache hit.
4. **Benefit.** One avoidable sequential hop (the tabs read) in time-to-editable on a cold entry: DERIVED 1 request; ESTIMATED 0.18-0.5 s using D144's ordinary-request cost, and only when the locks read is the slower branch.
5. **User-visible.** The task rows become editable up to one read sooner on the first visit.
6. **Dependencies.** SAD-01 (same query).
7. **Functional risk.** If the tabs read fails the locks read still runs (one wasted request); rows stay fail-closed until locks arrive, unchanged.
8. **Performance risk.** One more request in the first wave on a screen with an empty tab list (rare).
9. **Complexity.** Low (2 lines).
10. **Tests.** `features/admin/admin-default-checklists/Screen.test.tsx`, `Screen.renders.test.tsx`, `data/adminQueryPresets.test.ts`; new UT-ADCHK-960 ("locks query starts in the first render pass, not after the tabs"), using the wave client pattern (`src/test/waveClient.ts`).
11. **Acceptance.** `[VSB] DATA` timeline on DEV: locks and tabs start at t0 (same wave).
12. **Rollback.** Revert the 2 lines.

### 4.7 SCC-16: category comment dots flicker after a contract is created or deleted (T-E06)

1. **Current.** `useCostBook.ts:988-997`: `queryKey: ["capex-comments", key]` with `key = capexCommentsKey(contractIds)`; no placeholder; `capex-costs/Screen.tsx:422-429` builds the dots from `comments.data ?? []`.
2. **Root cause.** The key is the whole sorted id list, so one added contract is a new key with no data.
3. **Proposed.** Add an opt-in parameter, e.g. `useCapexComments(contractIds, { keepPrevious: true })`, that sets `placeholderData: keepPreviousData` (already used in `generators/hooks.ts:171`), and pass it only from `capex-costs/Screen.tsx:423`. **Do not change the panel call** (`CommentsPanel.tsx:264`, one contract): a panel for contract B would show contract A's thread while loading.
4. **Benefit.** Removes the dot flicker; the refetch still reads `ceil(C/40)` requests (unchanged, DERIVED). It is a UX fix, not a request saving.
5. **User-visible.** Dots stay while the new set loads after Add/Delete.
6. **Dependencies.** T-B09 (agent B) edits `useCostBook.ts`; trivial merge.
7. **Functional risk.** Low: dots are filtered through the book's payments (`commentCosts(bookLines, referencedCostIds(threads))`), so a stale thread of a deleted contract matches no payment.
8. **Performance risk.** None.
9. **Complexity.** Low.
10. **Tests.** `useCostBook.dvopt.test.tsx` (already uses `useCapexComments`, line 27, 63); new UT-CAPEXCOM-020 (placeholder kept for the screen call), UT-CAPEXCOM-021 (panel call does not keep another contract's data).
11. **Acceptance.** Component test: after the id list changes, `commentFlags` is non-empty on the first render of the new key.
12. **Rollback.** Remove the option.

### 4.8 BND-08 / SCC-19: the Cost chunks (T-E04, a spike, MEASURE-FIRST)

1. **Current.** Cold CAPEX first load 395-442 KiB min / 121-139 KiB gz, dominated by the chunk `useCostWriteFlight` (125 KiB min: `opexRules` 153k chars, `contracts/rules`, `addCostSheet`, `periodWrites`, `capex-costs/rules`...) plus `landLease` (46 KiB min) and `bulkSend`.
2. **What I tried (MEASURED, scratch builds).** E7: every write and Land Lease / OPEX member of `costRepository` made a dynamic `import()` (the facade fix Stage 1 proposed): CAPEX first load **+6.1 KiB gz**, because `useCostBook.ts:22,27` still imports helpers from `addCostSheet` / `capexWrites` statically. E8: E7 plus stubs for those helpers (`backgroundDeleteFailureTexts`, `bookPatchFailureReport`, `panelBusyLogLine`): CAPEX **+1.5 KiB gz**, `addCostSheet.ts`, `opexRules.ts`, `periodWrites.ts` and `landLeaseRules.ts` still in the closure. The remaining binding edges: `data/costBook.ts` handles all three book kinds (CAPEX, OPEX, Land Lease: `mapOpexRow`, `mapLandLeasePeriodRow`, `loadLeaseBook`, imports `landLease` and `landLeaseRules`), and `features/cost/costing/saveTimeline.ts:38` imports `formatMs` from the whole `bulkSend`. Bundler chunk merging also groups modules shared by several entries into one chunk, so removing one module edge can leave the chunk loaded.
3. **Proposed (only after a spike).** Split `costBook.ts` by scope (`costBook.capex`, `costBook.opex`, `costBook.lease`, shared mappers), move `formatMs` to a tiny module, then re-measure; do the facade lazy-loading last. The spike's exit criterion: CAPEX <= 110 KiB gz (-11 %) or stop.
4. **Expected benefit.** ESTIMATED upper bound 40-50 KiB gz on CAPEX/Contracts if the Land Lease / OPEX / Add Cost write chains left (their chunks total about 230 KiB min); NOT demonstrated. Off the critical path anyway: `bootPrefetch` starts these chunks beside the session (`screenLoaders.ts`, D119).
5. **User-visible.** Cold-cache cost screens only.
6. **Dependencies.** T-E01/T-E02 first. Conflicts: agent B T-B05 (`landLease.ts`), T-B04 (`capexWrites.ts`), T-B09 (`useCostBook.ts`).
7. **Functional risk.** Medium: `costBook` is the read path of five screens (CONVENTIONS rule 17 facade role; D51).
8. **Performance risk.** More, smaller chunks (the E7 file count rose by 5).
9. **Complexity.** High (1,300-line `costBook.ts`).
10. **Tests.** Existing: `costBook.test.ts`, `costReadOptions.test.ts`, `costReadPath.waves.test.ts` (UT-COSTWAVE-OPT-001 pins 2 waves / 4 requests: must stay green), cost screen tests.
11. **Acceptance.** `cmp.mjs` CAPEX/OPEX/Land Lease/Contracts closure; spike stops if < 11 %.
12. **Rollback.** Revert; no switch.

### 4.9 BND-05: start the Azure Maps token request beside the chunk download (T-E07, DECISION)

1. **Current.** `general-data/Screen.tsx:370` starts only the chunk (`loadProjectMap()`); `ProjectMap.tsx:84-92` requests the token from the SDK's `getToken` callback, after `new atlas.Map`; `azureMapsToken.ts` caches in memory and `localStorage` and dedups in flight (`inFlight`).
2. **Root cause.** Serial chain: chunk (1,658 KiB min / 428 KiB gz) -> map init -> getToken -> Power Automate flow -> tiles. Execution order.
3. **Proposed.** In the same mount effect add `void azureMapsToken().catch(() => undefined)` (a failed warm-up is retried by `getToken`; `lastFailure` handling to be checked).
4. **Benefit.** Overlaps the flow round trip with the chunk download: saves up to `min(chunk time, flow time)` on first map paint when the token is stale. Flow duration NOT measured anywhere, so no seconds are claimed.
5. **User-visible.** The map area appears sooner on the first General Data visit per token lifetime.
6. **Dependencies.** **DECISION** (a UI-side change around a flow): product owner confirms the flow may start earlier; the number of runs does not change (cache + in-flight dedup). Agent A's SPA-16 (same screen, "UNRESOLVED").
7. **Functional risk.** If the map never mounts (lazy chunk fails) a token is fetched unused; harmless.
8. **Performance risk.** The flow run now overlaps with the screen's Dataverse reads (one extra concurrent request at mount).
9. **Complexity.** Low.
10. **Tests.** `UT-GDATA-FE-003`, `UT-MAPTOKEN-FE-*` stay green; new UT-MAPTOKEN-FE-010 (one flow call when warm-up and `getToken` both ask).
11. **Acceptance.** DEV: time from General Data mount to map `ready`, before and after, 5 runs each with the token cache cleared.
12. **Rollback.** Remove the call.

### 4.10 SPB-14: Delete / Deactivate wait for two sequential reads (switch flip after a probe)

`generatorsPerfFlags.ts:131` `omGuardOneRead: false`; `generators.ts:773-791` runs the one-read navigation-path form only when ON and falls back to the two reads if the server refuses it. Verdict ACTUAL. Action: run probe P3 on DEV (the one-read filter returns the same answer as the two-read guard on a type with and without an active O&M cost), then flip the switch; benefit one read (0.2-0.5 s, ESTIMATED from D144) per type selection. Tests exist (`generators.omGuard.test.ts`). Rollback: the switch.

### 4.11 BND-11 (chunk churn per release): decision on evidence

MEASURED (two builds of the same source in the scratch copy, only `__APP_BUILD__` differs): **80 of 149 JS names change** (4.0 MB of 5.05 MB raw; 1,141 KB of 1,457 KB gz). With a manual `vendor` chunk (react, react-dom, scheduler, react-router, @tanstack): **78 of 149**. The reason: the entry chunk holds 79 shared app modules (`components/*`, `data/client`, `dataverseNames`, `AppHeader`...) and the preload map of every lazy chunk; one lazy change renames the entry and so every chunk that imports it. A config that moves the entry's modules to a stable shared chunk was attempted once (`manualChunks` with `getModuleInfo`) and gave an unusable result in the scratch build, so no working design is proven. **Decision: ACCEPT for now, MEASURE-FIRST.** It matters only if the host serves hashed assets with long-lived caching, which is unknown. Probe P4: one HAR of a repeat visit after a deployment on DEV (response `Cache-Control`/`ETag`, `304` vs `200`, protocol). If the host revalidates every file (conditional requests), churn is irrelevant and file count matters (BND-16); if it caches immutably, churn costs about 1.1 MB gz per release per returning user and a chunk-graph change is justified (Medium-High effort).

### 4.12 BND-16 (155 files, 80 under 3 KB): decision on evidence

MEASURED: 80 files < 3 KB total 92,491 bytes; the 18 generated-service files total 19,518 bytes. A cold CAPEX visit is 43 lazy files + 8 startup + 2 CSS = 53 requests (Stage 1), all issued together through Vite's `__vite__mapDeps` preload map, not one after another. After the first wave: 33 lazy files (-10). Whether the host serves HTTP/2 is unknown (assets are behind `apps.powerapps.com`); under HTTP/2 or HTTP/3, 50 small parallel requests are not a bottleneck; under HTTP/1.1 (6 connections) they would add rounds. **Decision: ACCEPT.** No bundler grouping is proposed (grouping the generated services into one chunk would make every screen load all 100+ services; there is no per-screen group rule in the config). Re-open only if probe P4 shows `http/1.1` or queueing above 100 ms on the cold waterfall.

### 4.13 Findings I recommend deferring or leaving (3 lines each)

- **NET-06** (Add Cost duplicate reads on a cold deep link). Verdict ACTUAL, DEFER. The sheet's contract read is a column subset of the book's (`addCostSheet.ts:117-150` vs `costBook.ts:927-960`, same project+account filter, no state clause) and its cost read is the book's minus `vsb_costpaid`, so sharing is possible, but only a same-pass in-flight share is freshness-safe (the sheet plans a delete-capable Save against the rows it read, and re-reads before writing). Cold entry only; from the CAPEX button the book is cached. Would change if a request census shows deep links to `/costs/add-from-table` are common.
- **BND-10** (lazy Report panel). OVERSTATED, DEFER. Net -9 KiB gz on the landing, +3.7 on others (MEASURED E6b: startup 302.0 -> 287.5, screens with `FormPanel` +18). Would change if the landing is shown to be the dominant cold entry AND a landing-only lazy `FormPanel` split is wanted.
- **BND-14** (App Insights start). OVERSTATED, DEFER. Parse-only 6.3 ms (Stage 1); no contention measured; would change with a Performance-panel long-task capture on a cold start. If done, share the idle helper agent D proposes (T-D06), never a second one.
- **NET-10** (each PM screen re-reads the project row). OVERSTATED, DEFER. One `top:1` read in the screen's own wave 1, parallel with the other reads (`PM_PROJECT_ROW_SHARED` already shares Planning/Grid Operator); screens select different column sets. No wall-clock gain derivable.
- **SAD-11** (Costs waits for six parallel reads). OVERSTATED, DEFER. The gain is `max(6) - max(2)` of parallel reads on the first visit per 30 min, and gating on fewer reads changes the failure screen (a currency read failure no longer blanks the page): a DECISION. Would change if `[VSB]` shows currencies or payer defaults as the slowest read.
- **SAD-13** (Project Gates dataset chain). ACTUAL but small, DEFER. 3-4 dependent waves, bounded by OPT-17; the fix (one filtered read) needs a navigation-filter check. Would change with DEV wave timings.
- **SCC-18** (device types read twice on OPEX). OVERSTATED, DEFER. One request; the book's read is in wave 2 and the catalogue's is also wave 2, so reuse needs a wait or a fallback read for ids missing from the catalogue (a device of a type no longer in the project). Would change if request counts on OPEX become a target.
- **SAD-10** (ADMIN_SCOPE_READS_ONCE OFF). NOT-A-BOTTLENECK, ACCEPT. One small read per scope; OFF deliberately because the two reads would fail together (an owner decision).
- **SAD-15** (DevCo links read three times per edit). NOT-A-BOTTLENECK, ACCEPT. The save-time ownership re-read is a safety check; removing it is a business-check removal (excluded by rule 3).
- **SAD-01** (environment-wide lock set). UNRESOLVED, MEASURE-FIRST. Probe P2: the row count of `vsb_checklistdefaultapprovalses` with the locking filter, and the `[VSB] DATA "Load Project Gate checklist approvals"` line. A narrower read (tab-scoped ids) needs the tasks first or a navigation filter; the lock set fails closed, so correctness first. Second visits are served from cache (`FRESH_ON_ENTRY_ONCE` keeps the previous data while it refetches).
- **SPB-06** (whole PV catalogue before the Generators list). UNRESOLVED, MEASURE-FIRST. Both reads are in wave 1 (`queries.ts:109-110`), the PV types are not blocked by the catalogue read, only the join; it costs time only above 500 rows (two sequential pages). Probe P1: row count of `vsb_pvmodules`.
- **SPB-12** (panel-only reads at load). UNRESOLVED, MEASURE-FIRST. Finance reads repayments and step-ups for the delete plan and Save diff (`Screen.tsx:1248,1313,2171`) and counts their failure in `loadError` (`:1067`) on purpose (a Save with missing stored rows would duplicate); only a Fabric latency figure (probe P5: the `[VSB] DATA` lines for Banks / KfW / Revenue assumptions) would justify making Banks/KfW lazy.
- **BND-13** (Generators warm-up). SHARED-ROOT, FIX-AFTER-DECISION, owned by agent A's T-A04: flip `GENERATORS_WARMUP_LAZY` (OFF in `bootDvoptFlags.ts:37`) after a DEV capture. Cost of the warm-up: 10 reads + the Generators chunk graph (356.6 KiB min / 113.2 KiB gz, 40 files; 334.3 / 105.1 after T-E01/T-E02) 1.5 s after every PM screen.

## 5. Proposed Stage 3 tasks

| Task | Title | Findings | Files touched (by name) | Shared-file conflicts | Order |
|---|---|---|---|---|---|
| **T-E01** | Import the pure helper, not the module: Generators barrel, shared project states, bulk descriptors | BND-03, BND-06, BND-07 (partly BND-18) | `features/pm/{planning,grid-operator,revenues,production}/rules.ts`; `data/projectStates.ts` (gains `listProjectStates`), `data/generalData.ts` (loses it), `data/{checklist,finance,revenues}.ts`, `features/pm/{milestones,revenues}/hooks.ts`, `features/pm/general-data/queries.ts`, `data/adminDefaultChecklists.ts` (type), `data/bulkTables.ts` (new), `data/bulkSend.ts`, `data/addCostSheetBulk.ts`, `data/addCostSheet.ts`; tests: `data/checklist.{existing,narrow,people.perf,reads}.test.ts`, `data/revenues.perf.test.ts`, `data/projectStates.test.tsx`, `src/test/requestSites.test.ts` | `data/generalData.ts` and `general-data/queries.ts` (agent D T-D01); `src/test/requestSites.test.ts` baseline (any agent lowering a site count) | First; first because T-E02 and T-E03 build on it |
| **T-E02** | Split three small reads out of heavy data modules | BND-04 (+ BND-18) | `data/revenueLookups.ts` (new), `data/milestoneDurations.ts` (new), `data/revenues.ts`, `data/costBook.ts`, `features/pm/milestones/{hooks,rules}.ts`, `features/pm/general-data/hooks.ts`, `features/cost/costing/useCostBook.ts` (import path only), optional `features/pm/general-data/projectColumns.ts` + `data/{checklist,milestones}.ts` | `general-data/hooks.ts` and `generalData.ts` (agent D T-D01, agent A SPA-14..16); `useCostBook.ts` (agent B T-B09); `data/costBook.ts`/`landLease.ts` (agent B T-B05) | After T-E01 |
| **T-E03** | Import-direction guard | BND-18 | new `src/test/importGraph.test.ts` + allowlist | none | After T-E01 and T-E02 |
| **T-E04** | Cost chunk decoupling spike (`costBook` split by scope) | BND-08, SCC-19 | `data/costBook.ts`, `data/costRepository.ts`, `features/cost/costing/{useCostBook,saveTimeline}.ts` | agent B T-B04/T-B05/T-B09 (same files) | After T-E02; stop if < 11 % |
| **T-E05** | Locks and clusters reads start with the tab list | SAD-02 | `features/admin/admin-default-checklists/Screen.tsx` | none read | Any time |
| **T-E06** | Keep the comment dots while the category key changes | SCC-16 | `features/cost/costing/useCostBook.ts`, `features/cost/capex-costs/Screen.tsx` | agent B T-B09 (`useCostBook.ts`) | Any time |
| **T-E07** | Map token beside the chunk download | BND-05 | `features/pm/general-data/Screen.tsx` (one effect) | agent A SPA-16; agent D T-D01 (`Screen.tsx`) | After the DECISION |
| **T-E08** | DEV probe pack and switch decisions | SAD-01, SPB-06, SPB-12, SPB-14, BND-11, BND-16 | none (captures); `data/generatorsPerfFlags.ts:131` only after P3 | none | Anytime; gates three findings |

Probes (T-E08): **P1** row count of `vsb_pvmodules` (SPB-06). **P2** row count of locking approvals and the `[VSB]` timing line (SAD-01). **P3** navigation-filter O&M guard equivalence on a type with and without an active O&M cost (SPB-14). **P4** one HAR of a cold and a repeat-after-deploy visit: protocol, `Cache-Control`/`ETag`, `304` vs `200`, queueing (BND-11, BND-16). **P5** `[VSB] DATA` lines of the Fabric reads (SPB-12). Each states its threshold in the finding block.

## 6. Conflicts with other agents (finding and task ids)

- **Agent A.** T-A04 (generalise the Generators warm-up, `app/generatorsWarmup.ts`, `bootDvoptFlags.ts`): same switch as BND-13; mine defers to A. SPA-16 vs BND-05: same screen, A leaves SPA-16 UNRESOLVED; T-E07 is the one cheap action there and needs the DECISION. SPA-14..16 touch `general-data` hooks/Screen/`data/generalData.ts` like T-E02.
- **Agent B.** T-B09 (`useCostBook.ts`, NET-02, SCC-04, BND-02) vs T-E04 and T-E06 and the import line in T-E02; T-B05 (`data/landLease.ts` read sites) vs T-E04; T-B04 (`capexWrites.ts`) vs T-E04. B lists SAD-02, SAD-11, SAD-15 against T-B06 (`client.ts`, `adminRowWrites.ts`, `adminCost.ts`): in doc 14 those IDs are my T7 rows; T-E05 touches only the Screen file, so no overlap in code.
- **Agent D.** T-D01 (municipality search) edits `data/generalData.ts`, `general-data/{hooks,Screen,rules}.ts`: conflicts with T-E01 (`generalData.ts` loses `listProjectStates`), T-E02(d) and T-E07. T-D06 (shared idle helper) vs BND-14: one helper, if BND-14 is ever done.
- **Shared test file.** `src/test/requestSites.test.ts` BASELINE_TEXT is edited by T-E01 and T-E02 (moved sites) and by any task that lowers a count; the comment at its top already says other agents only lower counts; reconcile at integration.
- **Not mine, noted.** The preload / prefetch map (R1: BND-01, BND-09, SCC-01, SCC-15, NET-22) is another agent's; T-E01/T-E02 shrink what that prefetch has to download.

## 7. What I could not determine

1. **Host protocol and caching** (BND-11, BND-16): no HAR exists in the repo. Probe P4.
2. **Real transfer and parse cost.** Only bytes and file counts are measured; the "ms at 20 Mbit/s" figures are ESTIMATED arithmetic, and the first wave is cold-cache only. A browser measurement (Network panel, cold cache, throttled) is the only honest user-time figure.
3. **Whether the scratch moves pass the test suite.** The copy had no tests and was only built and type-checked (8 unused-import errors, no type error, measured before E9/E10; not re-run after). The five mock seams and the G-REQ baseline were found by grep, not by a run.
4. **A working design for BND-11** (stable entry), and the real ceiling of BND-08/SCC-19: two scratch attempts did not move bytes (E7/E8) or did not build a usable graph (shell chunk). The spike T-E04 is the measurement.
5. **Row counts and Fabric latency** (SAD-01, SPB-06, SPB-12), the **flow duration** behind BND-05, and the **contention** behind BND-14.
