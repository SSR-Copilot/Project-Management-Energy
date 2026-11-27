# 27 — Functional regression results

> Stage 3, 27 Nov 2026, final integrated tree (four workstreams, uncommitted). Machine: Windows 11, Node 24.22.3. Everything below was seen by the orchestrator unless marked otherwise.

## 1. The gate

| Check | Result |
|---|---|
| `npm run typecheck` | 0 errors |
| `npm run lint` | exit 0, 26 warnings (same count as the base; none in a new file) |
| `node scripts/check-control-labels.mjs` | 0 missing, 0 duplicate test ids, 48 aria-label warnings, 2 ignored |
| `node scripts/check-canvas-identities.mjs` | C1 0, C2 0, C3 0, C4 0, C5 0 |
| `npm run check:power` | 96 registered, 0 problems |
| `npx vitest run` (full, final tree) | **501 files passed, 1 skipped; 8,379 tests passed, 21 skipped, 3 todo; 0 failed; 0 worker timeouts; 534 s** |
| `npm run build` | exit 0 (the usual chunk-size notice only) |
| knip (`PARITY_SCREEN=land-lease`) | no unused file among the 111 changed or new files; dependencies unchanged; 41 unused files and 386 unused exports are pre-existing noise (the 36-file baseline recorded in D83 is stale) |
| Byte-identical source files | 0 groups outside `src/generated/` |

`npm run verify` was not run as one command; its seven steps were run separately with the results above.

## 2. What went wrong on the way, and what it shows

1. **First combined run: 3 failures in 2 files** (499 passed, 8,376 tests passed).
   - `pmScreenPrefetch.screens.test.tsx` (UT-BOOT-SCREENS-201 and 204): a real integration defect between two workstreams. `entry-prefetch`'s test mocked `findCurrency` and `loadFirstRevenueSubaccount` on `@/data/revenues`; `bundle-structure` had moved them to `@/data/revenueLookups`, so the real functions ran (one timed out at 30 s). Test-only fix (the mocks now target the new module); the production code was right. 11/11 pass.
   - `generators/Screen.rollback.test.tsx` (UT-GEN-930): not found element under load; passes alone (32/32). Load-sensitive flake, not a defect.
2. **Per-workstream results were not trusted.** Two of the four implementer reports ended with unfilled placeholders where the full-suite result belonged, and an early tooling fault (a lowercase drive letter in the `node_modules` junction) broke vitest in some worktrees. The result above is from one clean run of the integrated tree.
3. **Vitest rewrites one tracked snapshot** (`pm/production/__snapshots__/productionPlans.baseline.test.ts.snap`) with LF endings after a run; the line-ending-insensitive diff is empty. It was restored from git each time and is not part of the change set.

## 3. Behaviour preserved (by evidence)

| Area | Evidence |
|---|---|
| Calculations and validations | No `rules.ts` rule was removed or edited by logic (bundle-structure changed imports only); the full rules test suites pass unchanged |
| Reads return the same rows in the same order | `readChunks.test.ts` differential tests (60 seeds; `readChunks.sites.opt.test.ts` on random id lists of 0 to 1,800 ids: byte-identical output and identical request multiset) |
| Prefetch uses the same keys and functions as the screens | Key-equality tests mount the real hooks on a prefetch-filled client for Cost, Production, Revenues, Finance (`UT-BOOT-COST-*`, `UT-BOOT-SCREENS-200..206`) |
| Switch OFF restores today's behaviour | Per-switch OFF tests (`UT-READLANE-*`, `UT-QPOL-*`, `UT-ADGATE-951`, `UT-ADCHK-961`, `UT-ADCAPEX-962`, `UT-CAPEXCOM-023`, `UT-BOOT-*` with OFF in `beforeEach`) |
| D51 Add Cost patching unaffected by the reference tier | `UT-ACSHEET-REF-001/002`, `UT-QPOL-004` |
| Write paths | Not modified (no Wave 3 task), so write order, existence guards and owning-BU binds are unchanged; `requestSites.test.ts` baseline unchanged in total (30 sites) |
| Import structure | `importGraph.test.ts` fails when a new data-to-features edge is added (mutation-proven with six temporary edges, then removed) |
| Power Automate flows | Not touched; the only flow-related change is the Check List bench scenarios (S7/S8, stubbed flows) |
| Authentication and authorisation | Not touched |

## 4. Existing tests changed (none weakened except as stated)

- `UT-ADCHK-902`: lost "locks not called on an empty tab list" (the spec accepts one extra read there; timing now pinned by UT-ADCHK-960/961).
- `bootPlan.test.ts` UT-BOOT-010, `bootPrefetch*.test.ts` `beforeEach` (OFF switches), `pmScreenPrefetch.planning.test.tsx` UT-BOOT-SCREENS-020: re-expressed for the new behaviour while still pinning the OFF behaviour.
- Five `vi.mock("./generalData")` seams, four admin screen tests, prefetch and route tests, milestone and revenue hook mocks: repointed to the moved modules.
- `pmScreenPrefetch.screens.test.tsx`: mocks repointed to `@/data/revenueLookups`.

## 5. Failure scenarios (brief section 4): coverage

| Scenario | Covered by | Gap |
|---|---|---|
| Network failure / first failing chunk | `UT-READLANE-*` (first failure, no chunk started after a failure) | none |
| Timeouts, throttling, partial bulk failure | Existing D165 / D51 tests, unchanged (no write path changed) | none new |
| Duplicate submissions, concurrent operations | Not changed in this batch | Wave 3 will need them |
| Unmount during async work | Prefetch uses the shared client; no component state set after unmount in the new code (QA to confirm, doc 31) | no dedicated test for the intent listener cleanup beyond `UT-INTENT-*` |

## 6. Not run

- The E2E parity suite (Playwright, Canvas vs Code): the project rules require asking the user before any commit; it has not been run.
- A DEV smoke test and any browser check (splash, prefetch, comment dots).

## 7. After the rebase onto upstream (27 Nov 2026)

Before merging, GitHub was found to have moved: `origin/RounakDev1` and `origin/master` went from `dde9e92` to `b5d03f0` with four bug-fix commits by another developer (three on the Contracts screen: margin seeding, labels, display rules; one board bug-fix batch on Add Cost from Table: row validation and spreadsheet row windowing). None of their files overlaps with this change set, so the two commits were rebased on top of `b5d03f0` without conflict (linear history, nothing replaced). Their Add Cost screen reads through `useAddCostSheet` and their tests mock `@/data/addCostSheet` and `@/data/contracts`, both of which this change refactored, so the combined tree was verified again:

| Step | Result on the rebased tree |
|---|---|
| `check:power`, typecheck, lint, control-label gate, canvas-identity gate | green (96 registered / 0 errors / lint exit 0 / 0 missing / all 0) |
| `vitest run` (502 files) | 500 files passed, 1 skipped, **1 failed**; **8,388 tests passed**, 1 failed, 21 skipped, 3 todo; 480 s; 0 worker timeouts |
| The one failure | `pm/grid-operator/Screen.flash.test.tsx` UT-GRIDOP-FE-001: asserts that exactly one real-time one-second timer is pending right after a Save. It **passed 3 of 3 times when run alone** and in both earlier full runs. No change in this set touches that screen's behaviour (the only grid-operator file touched is `rules.ts`, an import move). Treated as a load-sensitive timing test under the project's documented rule for a single jsdom timing failure |
| `npm run build` | exit 0 (run separately, as that rule requires, because the aborted `verify` skipped it) |

Upstream's new Add Cost and Contracts tests all passed against the refactored data layer.
