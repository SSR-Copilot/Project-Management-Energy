# Stage 3 report: bundle-structure (T-E01, T-E02, T-E03, T-C08)

Worktree `C:\wt-bn\bundle-structure`, branch `perf/bundle-structure`, base `dde9e92`. Nothing committed. 51 changed paths (45 modified, 6 new). `git diff --numstat`: 162 insertions, 330 deletions (plus the new files).

## 0. Status in one table

| Check | Result |
|---|---|
| `npm run typecheck` | clean (no output after the tsc line) |
| `npm run lint` | exit 0, 26 warnings before and 26 after (base tree measured the same way) |
| `node scripts/check-control-labels.mjs` | `0 missing, 0 duplicate test ids, 48 aria-label warnings, 2 ignored` |
| `node scripts/check-canvas-identities.mjs` | `C1 unknown 0, C2 foreign 0, C3 type 0, C4 label 0, C5 unverified 0` |
| `npm run check:power` | `96 registered, 0 problems` |
| `npm run build` | exit 0 |
| `src/test/importGraph.test.ts` | 7 passed; mutation proof done (section 4) |
| `src/test/requestSites.test.ts` | 5 passed after the baseline move |
| Touched tests, first run | 28 files / 915 tests passed; 22 further files hit "Timeout waiting for worker to respond" (load noise: build and other agents running) |
| Those 22 files re-run alone, two batches | 11 files / 144 tests passed; 11 files / 86 tests passed |
| ONE full `npx vitest run`, or the folder batches | NOT COMPLETE. A detached batch runner (`src/app`, `src/data`, `src/features/*`, `src/components`, ... ) was started and had only reached `src/app` when I was told to hand back. I have no verbatim count for the rest of the suite. Do not read this report as a green full suite. |
| knip (`$env:PARITY_SCREEN="land-lease"; npx -y knip@5`) | NOT RUN (out of time). Expected no new unused file: every new file is imported (`bulkTables`, `revenueLookups`, `milestoneDurations`, `projectStatesRead`, `projectColumns` by production code; `importGraph.test.ts` is a test). Needs the orchestrator's run. |

## 1. Tasks

- **T-E01 done.** BND-03 (Planning, Grid Operator, Revenues, Production rules import `forLanguage` / `textFormat` from `@/domain/powerFxNumeric`, not the Generators barrel). BND-06 (the shared project-states read left `data/generalData.ts`). BND-07 (the two bulk table descriptors left `addCostSheetBulk`).
- **T-E02 done.** (a) `data/revenues.ts` takes `loadCountryInflation` from `./countryInflation`. (b) New `data/revenueLookups.ts` (`loadFirstRevenueSubaccount`, `findCurrency`, reading through `./currencies`, which is what `landLease.loadCurrencies` wraps). (c) New `data/milestoneDurations.ts` (`loadMilestoneDurations`, `loadMilestoneAssumptionValues`, `MilestoneAssumptionValues`); `costBook.ts` no longer defines them. (d) General Data's cancel path loads `@/data/checklist` with a dynamic `import()` inside the existing `try`. (e) Included: `features/pm/general-data/projectColumns.ts` holds `PROJECT_COL`; `rules.ts` re-exports it, `data/checklist.ts` and `data/milestones.ts` import it from the new file. The idle pre-load of the checklist chunk (spec, optional mitigation) was NOT added: it would be a new chunk request at a new time, and the brief forbids changing when anything starts.
- **T-E03 done.** `src/test/importGraph.test.ts`, UT-IMPGRAPH-001..007, allowlist of the 32 data-to-features value edges that exist now.
- **T-C08 done.** Static splash in `index.html` plus `.vsb-splash*` rules in `src/styles/global.css`.

### Deviations from the experiment patch and the spec (all deliberate)

1. The patch applied only with `git apply --ignore-whitespace` run inside `ProjectCosts-CodeApp/` (the checkout is CRLF; `costBook.ts` also has five lone-CR lines). I restored `costBook.ts` to its original CRLF/lone-CR form so its diff is the real change (2 insertions, 110 deletions).
2. The patch left compatibility re-exports in `generalData.ts`, `revenues.ts`, `costBook.ts` and had the shared read inside `projectStates.ts`. I removed the re-exports and repointed every importer. Kept on purpose: `PROJECT_COL` re-export in `general-data/rules.ts` (about 100 importers) and `CAPEX_CONTRACTS` / `CAPEX_COSTS` re-export in `addCostSheetBulk.ts` (used by `addCostSheet.ts`, `capexWrites.ts` and about 8 test files).
3. **`listProjectStates` and `SharedProjectState` live in a new `data/projectStatesRead.ts`, not inside `data/projectStates.ts` as spec 4.3 says.** Reason: `projectStatesQueryOptions` (in `projectStates.ts`) calls the read directly, and `vi.mock` cannot intercept a call made inside the same module, so four admin screen tests and others that stub the read would have hit the real service. A separate module keeps every existing seam a one-line path change. Bundle effect measured (section 5) matches the spec. G-REQ baseline therefore lists `data/projectStatesRead.ts: 1`, not `data/projectStates.ts: 1`.
4. The four `loadMilestoneDurations` cases (UT-BOOK-050..053) stay in `costBook.test.ts` with their ids unchanged (they use that file's `fetchAll` fixture); only the import moved. No `milestoneDurations.test.ts` was created.

## 2. Files changed

Production: `index.html`, `src/styles/global.css`; `src/data/{addCostSheetBulk,adminDefaultChecklists,adminGatesApprovals,bulkSend,checklist,costBook,finance,generalData,milestones,projectStates,revenues}.ts`; `src/features/admin/admin-gates-approvals/fixtures.ts`; `src/features/cost/costing/useCostBook.ts`; `src/features/pm/general-data/{hooks,queries,rules}.ts`; `src/features/pm/{grid-operator,planning,production,revenues}/rules.ts`; `src/features/pm/milestones/{hooks,rules}.ts`; `src/features/pm/revenues/hooks.ts`.
New: `src/data/{bulkTables,milestoneDurations,projectStatesRead,revenueLookups}.ts`, `src/features/pm/general-data/projectColumns.ts`, `src/test/importGraph.test.ts`.
Tests changed (see section 4): `src/app/{ScreenRoutes,bootPrefetch}.test.ts(x)`, `src/app/pmScreenPrefetch.screens.test.tsx`, `src/data/{adminDefaultChecklists.opt,checklist.existing,checklist.narrow,checklist.people.perf,checklist.reads,costBook,costReadOptions,projectStates,revenues.perf}.test.ts(x)`, `src/features/admin/admin-default-checklists/{Screen,Screen.renders}.test.tsx`, `src/features/admin/admin-gates-approvals/{Screen,GateTable.renders}.test.tsx`, `src/features/pm/milestones/{hooks,hooks.seedPrefetch}.test.ts`, `src/features/pm/revenues/hooks.perf.test.tsx`, `src/test/requestSites.test.ts`.
`git diff --stat`: 45 files changed, 162 insertions, 330 deletions; 6 untracked files.

## 3. Switches

None added or reused: behaviour-neutral import moves, as the brief states. Rollback is reverting the change. The one runtime difference is (d): the first cancel of a Draft gate approval in General Data now fetches the checklist chunk (about 13 KiB gz) on demand; if that chunk fails to load the existing `catch` traces it and the save continues without the cancel call (same handling as a failed gate read).

## 4. Tests

### Changed because the code moved (no assertion weakened, none deleted)

- The five `vi.mock("./generalData")` seams: `data/checklist.existing`, `checklist.narrow`, `checklist.people.perf`, `checklist.reads`, `revenues.perf` now mock `./projectStatesRead` (same stub bodies).
- `revenues.perf.test.ts` also: `findCurrency` is imported from `./revenueLookups`; its whole-table stub moved from `./landLease` `loadCurrencies` to `./currencies` `loadAllCurrencies` (same data). All UT-REVPERF assertions unchanged.
- Four admin screen tests (`admin-default-checklists/Screen`, `Screen.renders`, `admin-gates-approvals/Screen`, `GateTable.renders`): the stub of the shared read moved from `@/data/generalData` (spread of the original plus one override) to `@/data/projectStatesRead` (one override). Same `states.list` mock.
- Prefetch and route tests: `app/bootPrefetch.test.ts` and `app/pmScreenPrefetch.screens.test.tsx` keep the same `note("gdStates")` / `note("gd.states")` call, now registered on `@/data/projectStatesRead`; `app/ScreenRoutes.test.tsx` moves `listProjectStates` and the two revenue lookups into mocks of their new modules.
- `features/pm/milestones/hooks.test.ts`, `hooks.seedPrefetch.test.ts`, `features/pm/revenues/hooks.perf.test.tsx`: `findCurrency` / `loadFirstRevenueSubaccount` mocks moved from `@/data/revenues` to `@/data/revenueLookups`; `listProjectStates` mock moved to `@/data/projectStatesRead`.
- `data/costBook.test.ts`: dynamic import of `loadMilestoneDurations` from `./milestoneDurations` (ids UT-BOOK-050..053 unchanged).
- `adminDefaultChecklists.opt.test.ts`, `costReadOptions.test.ts`, `projectStates.test.tsx`: import of `listProjectStates` from `projectStatesRead`.
- **G-REQ baseline** (`src/test/requestSites.test.ts`): `data/costBook.ts` 11 to 10, `data/generalData.ts` 10 to 9, `data/revenues.ts` 9 to 7, added `data/milestoneDurations.ts: 1`, `data/projectStatesRead.ts: 1`, `data/revenueLookups.ts: 2`. Total request sites unchanged (30 before, 30 after): the sites moved, none added.

### Added
`src/test/importGraph.test.ts`: UT-IMPGRAPH-001 (allowlist exact, none stale), 002 (Planning/Grid Operator/Revenues rules do not reach the Generators rules barrel), 003 (project-states modules do not reach General Data rules/data), 004 (`bulkSend`/`bulkTables` do not reach `addCostSheetBulk` or the Add Cost rules), 005 (Milestones and General Data hooks and `milestoneDurations` do not reach `costBook`/`landLease`), 006 (`revenues` and `revenueLookups` do not reach `landLease`), 007 (the scanner: `import type`, all-type braces, comments and dynamic `import()` are not edges). Not added: UT-BNDHELP-001 (identity of the barrel re-export), UT-MSDUR-*.

### Mutation proof (temporary edges, then removed; the files were restored from backups and `git diff` re-checked)
Added `import ... from "@/features/pm/general-data/rules"` to `data/projectStatesRead.ts`, re-pointed Planning rules to the Generators barrel, `bulkSend` to `./addCostSheetBulk`, `revenues.ts` to `./landLease`: UT-IMPGRAPH-001, 002, 003, 004, 006 failed, each naming the chain (for example `data/bulkSend.ts -> data/addCostSheetBulk`). Separately, pointing Milestones hooks at `@/data/costBook` failed UT-IMPGRAPH-005. All restored; suite 7/7 passes. (My first version compared paths with the extension and did not fail; fixed before the proof.)

### Verbatim results
- typecheck: `> tsc --noEmit -p tsconfig.app.json` then no errors.
- lint: exit 0, 26 warnings (base tree also 26).
- control labels: `control-labels: 0 missing, 0 duplicate test ids, 48 aria-label warnings, 2 ignored`.
- canvas identities: `canvas-identities: C1 unknown 0, C2 foreign 0, C3 type 0, C4 label 0, C5 unverified 0`.
- check:power: `power-sources: 96 registered, 0 problems`.
- importGraph: `Tests 7 passed (7)`. requestSites: `Tests 5 passed (5)`.
- Touched-test run (28 passed files): `Test Files 28 passed (28) / Tests 915 passed (915) / Errors 22 errors` (the 22 errors were `Failed to start threads worker ... Timeout waiting for worker to respond`: load-sensitive, not test failures). Re-run alone: `Test Files 11 passed (11) / Tests 144 passed (144)` and `Test Files 11 passed (11) / Tests 86 passed (86)`.
- Full-suite folder batches: incomplete, see section 0. Before handing the branch on, run the folders `src/app`, `src/data`, `src/features/{admin,cost,pm,shared}`, `src/components`, `src/domain`, `src/platform`, `src/test`, `src/App*`, `src/styles` and report counts.
- build: `npm run build` exit 0.

### Tooling problem found (affects every worktree with a junction)
`node_modules` is a junction whose stored target was lowercase (`c:\Personal\...`). Node and Vite then loaded `vitest` under two URL casings, so every test file failed with "Vitest failed to find the runner" or "Invalid Chai property toBeInTheDocument". I deleted only my own link (`[System.IO.Directory]::Delete(path, $false)`, target untouched, verified) and recreated it with the uppercase target `C:\Personal\...`; `npx vitest` then works. Other worktrees will hit the same failure. Also, the same shell tool backgrounds any command after 180 s.

## 5. Before / after measurements

Command: build base (`git archive HEAD` into `C:\wt-bn\_base-bundle-structure`, `npx vite build`) and the worktree (`npm run build`), then `node _bench/S2E/cmp.mjs <base dist> <worktree dist>`; start-up from `npm run bundle:report`. KiB gzip, first-load closure per lazy Screen (files in brackets).

| Screen | before | after | delta | spec target |
|---|---|---|---|---|
| startup closure (8 files) | 302.0 | 301.9 | -0.1 | must not grow: OK |
| pm/project-main (landing) | 55.6 (26) | 39.8 (19) | -15.8 | about -16 |
| pm/planning | 94.1 (30) | 74.2 (27) | -19.9 | about -20 |
| pm/grid-operator | 52.1 (16) | 32.1 (13) | -20.0 | about -20 |
| pm/revenues | 140.7 (44) | 103.3 (39) | -37.4 | -37 |
| pm/milestones | 128.1 (45) | 67.4 (32) | -60.7 | 128 to 68 |
| pm/general-data | 118.0 (50) | 76.9 (35) | -41.0 | 118 to 77 |
| pm/finance | 107.6 (33) | 85.9 (26) | -21.8 | about -22 |
| pm/checklist | 88.1 (28) | 75.1 (26) | -13.1 | |
| pm/generators / production | 113.2 / 83.8 | 105.1 / 75.2 | -8.1 / -8.6 | |
| cost/capex, land-lease, opex, add-from-table | 138.6 / 142.0 / 142.6 / 130.1 | 121.0 / 124.4 / 125.0 / 112.4 | -17.6 each | |
| cost/contracts | 119.1 | 114.7 | -4.3 | |
| admin/default-checklists, gates-approvals | 74.7 / 70.3 | 58.7 / 55.5 | -16.0 / -14.8 | |
| other admin, pm/team | | | -0.0 to -0.4 | |

JS files 155 to 151 (the spec's scratch build had 150; the extra file is the separate `projectStatesRead` module, which is the deviation in section 1). Only bytes and file counts are claimed; no seconds.

## 6. Draft entries for `13-CODE-APP-IMPROVEMENTS-OVER-CANVAS.md` (not edited)

Cross-cutting, "performance / structure":
- **fixed** (BND-03, T-E01): Planning, Grid Operator, Revenues and Production no longer ship the 19.7 KiB gzip Generators rules chunk for two number-format helpers; first load -20 KiB gz on three screens.
- **fixed** (BND-06, T-E01): the shared Project States read is its own module; the landing and the Cost screens no longer download General Data's rules (-15.8 KiB gz on the landing, -17.6 on four cost screens).
- **fixed** (BND-07, T-E01): the bulk transport no longer loads the Add Cost sheet module (-8 KiB gz on Finance, Production, Generators).
- **fixed** (BND-04, T-E02): Milestones -60.7, General Data -41.0, Revenues -37.4 KiB gz first load (three small reads and the Check List call moved out of heavy modules).
- **new gate** (BND-18, T-E03): `importGraph.test.ts` fails when a new data-to-features value import or a light-to-heavy chain appears.
- **fixed, visual** (BND-09, T-C08): a static "Please wait..." splash paints before the JavaScript runs; not a canvas parity item, no canvas behaviour changes. Status: proposed for approval (the Power Apps player may already draw its own loader around the frame; not measured).

## 7. Risks, decisions, conflicts

- **Splash.** Replaced by React's first commit (createRoot on a non-empty container), so there is no second "Please wait..." on screen; I read `App.tsx` and `LoadingOverlay.tsx` and copied their measurements (500 x 240 card, 10 % scrim, 14.7 px semibold). It is markup and CSS only, no inline style or script. In `npm run dev` the stylesheet is injected by JS, so the splash is unstyled text for a moment (dev only). It is not seen by the label gate (only `.tsx`). I did NOT run it in a browser: please eyeball it once (first paint, then hand-over to the overlay, and a Cost deep link where the shell renders at once). Owner decision: whether the splash is wanted at all if the player draws its own loader.
- **Cancel path (d).** First Draft-gate cancel per session downloads a chunk; offline it fails inside the `catch` and the cancel flow is skipped (the save goes on). Behaviour is visible only in that rare case; flagged for sign-off, or add the idle pre-load later.
- **Not verified:** full suite, knip (no new unused files expected), splash in a real browser, DEV runtime.
- **Expected conflicts with the other workstreams:** `data/generalData.ts`, `features/pm/general-data/{hooks,queries,rules}.ts` and `index.html`/`global.css` (any agent touching start-up CSS); `data/costBook.ts` and `useCostBook.ts` (import line only); `src/test/requestSites.test.ts` BASELINE_TEXT (every agent that lowers or adds a site: resolve by re-running the test and pasting the printed counts); `data/revenues.ts`, `data/milestones.ts`, `data/checklist.ts`, `data/finance.ts` (one import line each); `src/app/bootPrefetch.test.ts` and `pmScreenPrefetch.screens.test.tsx` (mock paths, agent entry-prefetch). The `importGraph.test.ts` allowlist must be regenerated if another workstream adds a data-to-features edge (the test prints the current list).
