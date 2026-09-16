# VSBCloud code app — test evidence report

**Run recorded 7 September 2026 in an isolated Linux container, from the two zips supplied in
this session. Every figure below is the output of a command run here, not a figure quoted from
an earlier document.**

Companion to `VSBCloud-Harness-Plan.md`. That document defines the harness; this one is the
record of it passing.

---

## 1. Verdict

| Gate | Command | Result | Exit | Elapsed |
|---|---|---|---:|---:|
| **G-TYPE** | `npx tsc --noEmit` | clean, no diagnostics | `0` | 14 s |
| **G-UNIT** | `npx vitest run` | **1,613 passed, 0 failed, 0 skipped** across 337 suites in 36 files | `0` | 59 s |
| **G-BUILD** | `npx vite build` | built, one chunk-size advisory | `0` | 11 s |
| **G-WALK** | `node scripts/scenario.mjs` | **31 steps, 0 problems** | `0` | 80 s |
| Coverage | `npx vitest run --coverage` | see section 4 | `0` | 73 s |

All five pass. The four commit gates run in **2 m 44 s**; with the coverage pass, **3 m 57 s**.
Neither figure includes `npm install`.

The one advisory: `vite build` warns that some chunks exceed 500 kB after minification and
suggests `manualChunks`. It is a performance note, not a failure, and it belongs to Stage 5 of
the plan rather than to any screen.

## 2. Environment fingerprint

```
node   v22.22.2
npm    10.9.7
tsc    Version 5.9.3
vitest vitest/3.2.7 linux-x64 node-v22.22.2
uname  Linux 6.18.44-fc-v24 x86_64
cpus   2
date   2026-09-07T10:05:26Z
suite start   2026-09-07 10:05:40 UTC
data mode     mock (VITE_DATA_MODE unset; the in-memory Dataverse in src/data/mock/)
dependencies  266 packages from package-lock.json, npm install, 25 s
coverage run  vitest 3.2.4 - installing @vitest/coverage-v8@3.2.4 pins vitest down for that
              pass only; the 1,613-case run in section 3 is the 3.2.7 line above
```

The last line of that block is the load-bearing caveat of this whole report and is repeated in
section 6: **nothing here has run against a real Dataverse environment.** The suite exercises the
rules against a backend the team wrote.

## 3. Unit suite, file by file

Ordered by case count. `Suites` counts distinct `describe` groupings within the file.

| Test file | Cases | Passed | Suites | ms |
|---|---:|---:|---:|---:|
| `src/features/finance/rules.test.ts` | 127 | 127 | 19 | 91 |
| `src/features/revenues/rules.test.ts` | 102 | 102 | 18 | 40 |
| `src/features/project-main/rules.test.ts` | 94 | 94 | 34 | 41 |
| `src/features/capex-costs/rules.test.ts` | 91 | 91 | 11 | 50 |
| `src/features/checklist/rules.test.ts` | 85 | 85 | 16 | 25 |
| `src/features/generators/rules.test.ts` | 80 | 80 | 13 | 35 |
| `src/features/production/rules.test.ts` | 73 | 73 | 14 | 41 |
| `src/features/milestones/rules.test.ts` | 71 | 71 | 14 | 22 |
| `src/features/general-data/rules.test.ts` | 70 | 70 | 8 | 25 |
| `src/features/admin-cost/rules.test.ts` | 66 | 66 | 12 | 41 |
| `src/features/contracts/rules.test.ts` | 63 | 63 | 7 | 29 |
| `src/features/admin-gates-approvals/rules.test.ts` | 58 | 58 | 17 | 18 |
| `src/features/opex-costs/rules.test.ts` | 57 | 57 | 6 | 24 |
| `src/features/grid-operator/rules.test.ts` | 54 | 54 | 8 | 16 |
| `src/features/planning/rules.test.ts` | 54 | 54 | 10 | 33 |
| `src/features/land-lease/rules.test.ts` | 48 | 48 | 8 | 29 |
| `src/features/admin-contract/rules.test.ts` | 47 | 47 | 9 | 19 |
| `src/features/add-costs-from-table/rules.test.ts` | 40 | 40 | 7 | 14 |
| `src/features/admin-capex-accounts/rules.test.ts` | 38 | 38 | 8 | 13 |
| `src/features/admin-milestones/rules.test.ts` | 37 | 37 | 8 | 15 |
| `src/features/team/rules.test.ts` | 36 | 36 | 5 | 24 |
| `src/features/admin-default-checklists/rules.test.ts` | 35 | 35 | 8 | 22 |
| `src/data/mock/mockBackend.test.ts` | 22 | 22 | 6 | 472 |
| `src/domain/paging.test.ts` | 20 | 20 | 4 | 5 |
| `src/domain/navigation.test.ts` | 17 | 17 | 5 | 7 |
| `src/domain/numeric.test.ts` | 16 | 16 | 6 | 5 |
| `src/domain/session.test.ts` | 15 | 15 | 5 | 14 |
| `src/features/project-main/Screen.test.tsx` | 14 | 14 | 1 | 5,477 |
| `src/domain/approval.test.ts` | 13 | 13 | 3 | 4 |
| `src/components/DataGrid.test.tsx` | 11 | 11 | 1 | 908 |
| `src/data/projectQueries.test.ts` | 11 | 11 | 1 | 108 |
| `src/domain/technology.test.ts` | 11 | 11 | 1 | 6 |
| `src/theme/tokens.test.ts` | 11 | 11 | 4 | 4 |
| `src/data/mock/autoFixture.test.ts` | 11 | 11 | 1 | 155 |
| `src/domain/yieldStats.test.ts` | 9 | 9 | 2 | 4 |
| `src/domain/dates.test.ts` | 6 | 6 | 1 | 4 |
| **36 files** | **1,613** | **1,613** | **301** | |

The Suites column sums to 301 `describe` groups. Vitest reports 337 total suites, counting each
file as a suite of its own on top of those 301.

Two files dominate the runtime rather than the count: `project-main/Screen.test.tsx` at 5,477 ms
(14 cases) and `components/DataGrid.test.tsx` at 908 ms (11 cases). Both mount React against
jsdom, and the 16.3 s of environment setup the reporter attributes separately is theirs. The
1,588 pure-rule cases run in about **1.5 s** combined — the two jsdom files account for 6,385 ms of
the 7,840 ms the reporter attributes to test execution. That ratio is the argument for keeping rules
out of components: the fast tests are the ones that test the logic.

## 4. Coverage, by architectural layer

The repository-wide figure is **45.4% lines / 82.95% functions / 82.9% branches**. Quoted alone
the line figure is misleading, because it averages two populations the architecture deliberately
keeps apart. Split by layer:

| Layer | Files | Lines | Line cov | Fn cov | Branch cov |
|---|---:|---:|---:|---:|---:|
| rules.ts / plan.ts (pure rules) | 25 | 12,556 | **97.4%** | 97.0% | 83.2% |
| src/domain (shared pure rules) | 8 | 596 | **91.4%** | 85.2% | 91.4% |
| src/data (repositories, mock) | 9 | 2,283 | **97.6%** | 76.1% | 84.6% |
| src/theme | 2 | 195 | **100.0%** | 0.0% | 0.0% |
| src/flows (wrappers) | 1 | 72 | **77.8%** | 23.1% | 80.0% |
| src/components (shared UI) | 25 | 1,970 | **53.2%** | 36.7% | 83.3% |
| hooks.ts (data access) | 21 | 6,673 | **10.1%** | 41.3% | 79.6% |
| src/store | 1 | 89 | **46.1%** | 5.0% | 50.0% |
| src/platform (SDK binding) | 6 | 523 | **32.7%** | 53.8% | 56.0% |
| Screen.tsx (composition) | 23 | 13,710 | **3.6%** | 37.0% | 68.6% |
| src/routes | 1 | 83 | **0.0%** | 100.0% | 100.0% |
| other (App, main, providers) | 5 | 232 | **9.1%** | 37.5% | 75.0% |

Read top to bottom, that table is the architecture's central claim being tested. `rules.ts` and
`plan.ts` — the pure business rules ported from Power Fx, 12,556 lines across 25 files — are at
**97.4% line and 97.0% function coverage**. `src/domain` and `src/data` are at 91.4% and 97.6%.
The 13,710 lines of `Screen.tsx` are at 3.6%, which is what composition-only files should look
like when the logic has been moved out of them; they are covered by the scenario walk instead.

The genuine gap is the middle of that table. **`hooks.ts` is 10.1% covered across 6,673 lines** —
query keys, mutation sequencing, cache invalidation and the pre-request permission refusals. The
rules those hooks call are tested; the sequencing around them largely is not. Alongside it,
`src/platform/bootstrap.ts` is at 0% with no test file, `dataClient.ts` at 39.7%,
`AppRoutes.tsx` at 0%, and `appStore.ts` at 46.1% lines with 5% function coverage.

## 5. Test IDs, and what they trace to

Every case carries a `UT-<SCREEN>-<NNN>` ID. Distribution across the suite:

| Prefix | Cases | Covers |
|---|---:|---|
| — | 368 | cases titled without an ID |
| `UT-FIN` | 100 | Project Finance |
| `UT-MSTONE` | 71 | Project General Milestones |
| `UT-GDATA` | 70 | Project General Data |
| `UT-REV` | 69 | Project Revenues |
| `UT-ADCOST` | 66 | Admin Cost |
| `UT-CAPEX` | 64 | Capex Costs |
| `UT-ADGATE` | 58 | Admin Project Gates Approvals |
| `UT-PROD` | 57 | Project Production |
| `UT-CONTR` | 54 | Contracts |
| `UT-GEN` | 54 | Project Generators |
| `UT-CHKLST` | 52 | Project General CheckList |
| `UT-ADCONTR` | 47 | Admin Contract |
| `UT-OPEX` | 47 | Opex Costs |
| `UT-LEASE` | 41 | Land Lease Costs |
| `UT-PLAN` | 38 | Project Planning |
| `UT-ADCAPEX` | 38 | Admin CAPEX Accounts |
| `UT-ADMILE` | 37 | Admin Milestones |
| `UT-TEAM` | 36 | Project General Team |
| `UT-ADCHK` | 35 | Admin Project Default Checklists |
| `UT-ADDCOST` | 32 | Add Costs from Table |
| `UT-GRIDOP` | 32 | Grid Operator |
| `UT-DOM` | 31 | src/domain shared rules |
| `UT-MOCK` | 22 | the in-memory Dataverse |
| `UT-NAV` | 17 | navigation and route guards |
| `UT-SES` | 15 | session and privileges |
| `UT-MAINUI` | 14 | Project Main, rendered |
| `UT-GRID` | 11 | the shared DataGrid |
| `UT-PQ` | 11 | project queries |
| `UT-TECH` | 11 | technology mapping |
| `UT-AUTOFIX` | 11 | mock auto-fixtures |
| `UT-MAIN` | 4 | Project Main rules |
| **31 prefixes** | **1,613** | |

The ID is what makes the plan's per-screen sections auditable: a canvas formula, the function
that replaced it, and the case that pins it, in three hops. Three housekeeping defects in that
scheme were found while writing the plan and are carried in its section 6.4: **14 IDs sit on more
than one `it()`** (`UT-ADCHK-022`, `UT-PLAN-030…033`, `UT-CHKLST-035…042`, `UT-FIN-018`), **15 IDs
appear in comments and header lists but on no `it()`**, and **nothing machine-checks either**.

## 6. What this run does not prove

Stated plainly, because an evidence report that omits its own limits is advocacy.

1. **Mock mode only.** `VITE_DATA_MODE` is unset, so every read and write went to
   `src/data/mock/`. The logical column names still need regenerating with
   `pac code add-data-source`; some were derived from display names and are flagged in comments.
   A green harness here is consistent with the app failing on first contact with a real
   environment.
2. **No security is demonstrated.** Not one case in the 1,613 shows Dataverse refusing anything,
   because Dataverse was not present. **G-SEC cannot be satisfied from a repository** — it is a
   statement about an environment, and it is the gate that closes Phase 1.
3. **`dataClient.batch()` is not a transactional `$batch` changeset.** It bounds concurrency over
   individual writes, so any plan with two or more writes can half-apply. No layer of the harness
   can see that.
4. **Label fidelity is not tested anywhere.** The plan's **G-LABEL** rule requires every visible
   string to be transcribed from the canvas rather than rewritten, and no layer of this harness
   checks it. The scenario walk's third column captures the leading text each screen rendered,
   which is the raw material for such a check but is not the check.
5. **Visual parity is not tested anywhere.** The scenario walk asserts that a screen renders
   without errors and is not the wrong screen. It does not compare against a screenshot. Opex
   Costs, Land Lease Costs and Add Costs from Table were built without recordings at all.
6. **Coverage is not correctness.** 97.4% of the rules layer's lines execute under test; that
   says the branches were visited, not that the business rule encoded in them is the rule the
   business wants. The eleven documented source defects in Appendix B5 of the plan are exactly
   the cases where the canvas behaviour and the correct behaviour differ, and each has both
   halves under test precisely because the tests cannot decide which is right.

## 7. Reproducing this run

```bash
unzip -q VSBCloudCodeAppfinal.zip && cd VSBCloud-Code-App/vsbcode
npm install                                          # 266 packages, 25 s
npx tsc --noEmit                                     # G-TYPE
npx vitest run --reporter=json --outputFile=vitest.json --reporter=default
npx vite build                                       # G-BUILD
npm i -D @vitest/coverage-v8@3.2.4
npx vitest run --coverage --coverage.provider=v8 \
  --coverage.reporter=json-summary --coverage.reporter=text

npx vite preview --port 4176 --host 127.0.0.1 &      # G-WALK
npm i -D --no-save playwright
APP_URL=http://127.0.0.1:4176 CHROMIUM_PATH=<chrome> node scripts/scenario.mjs
```

`@vitest/coverage-v8` and `playwright` are not in `package.json` by design — a browser download
in every developer's install for one script is a bad trade. Both are added outside the lockfile.
`scripts/scenario.mjs` exits with its problem count, so it drops into CI unchanged.

---

## Appendix — the scenario walk, step by step

`node scripts/scenario.mjs` against the built bundle on a `vite preview` server. **31 steps, 0 problems.**
It fails a step on a page error, a console error, an error boundary, an empty `main`, or a
project-scoped screen rendering the "no project selected" guard while a project is selected. The
third column is the leading text the step actually found in `main`, which is what makes a pass
distinguishable from a blank render.

| # | Step | Result | Rendered (leading text) |
|---:|---|:--|---|
| 1 | portfolio list | ok | Add Project View Project View Costs Delete Project Simulate Dashboard … |
| 2 | portfolio · filter by project name Add Project View Project View Costs Delete Project Simulate Dashboard Pr | ok | … |
| 3 | portfolio · clear filter | ok | Add Project View Project View Costs Delete Project Simulate Dashboard … |
| 4 | portfolio · New Project form | ok | PROJECT MANAGEMENT New Project The project's master data. This is the … |
| 5 | portfolio · back to list | ok | Add Project View Project View Costs Delete Project Simulate Dashboard … |
| 6 | open project | ok | PROJECT MANAGEMENT 24100007 Active 24100007 Basic Information Project … |
| 7 | rail · General | ok | PROJECT MANAGEMENT 24100007 Active 24100007 Basic Information Project … |
| 8 | rail · Milestones | ok | PROJECT MANAGEMENT Milestones The project's date chain. This page is l… |
| 9 | rail · Generator | ok | PROJECT Generator Plant equipment for 0 0 0 0. Add WTG Type Add PV Mod… |
| 10 | rail · Production | ok | PROJECT Production Energy-yield assessments, seasonality profiles and … |
| 11 | rail · Cluster Check List | ok | PROJECT MANAGEMENT CheckList The cluster gates and the checklist behin… |
| 12 | rail · Project Team | ok | PROJECT MANAGEMENT Project team The project manager, the deputy, and e… |
| 13 | rail · Planning | ok | PROJECT MANAGEMENT Planning Cooperation and planning basis, the permit… |
| 14 | rail · Grid Operator | ok | PROJECT MANAGEMENT Grid Operator The grid operator, the connection vol… |
| 15 | rail · Revenue | ok | PROJECT Revenues Revenue contracts and balancing-price periods. Values… |
| 16 | rail · Financing | ok | PROJECT Finance Debt and equity structuring. Each category is seeded o… |
| 17 | Planning · Repowering tab | ok | PROJECT MANAGEMENT Planning Cooperation and planning basis, the permit… |
| 18 | Generator · Add WTG Type | ok | PROJECT Generator Plant equipment for 0 0 0 0. Add WTG Type Add PV Mod… |
| 19 | Revenue · tabs | ok | PROJECT Revenues Revenue contracts and balancing-price periods. Values… |
| 20 | admin · Check List Settings | ok | ADMINISTRATION Checklist settings The default task list every new proj… |
| 21 | admin · Project Gates | ok | ADMINISTRATION Project Gates Who approves what at each project gate, f… |
| 22 | admin · CAPEX Accounts | ok | ADMINISTRATION CAPEX Accounts The CAPEX chart of accounts. Deactivatin… |
| 23 | admin · Std Assumptions · Milestones ADMINISTRATION Milestones Standard milestone durations and success rates | ok | … |
| 24 | admin · Std Assumptions · Costs | ok | ADMINISTRATION Costs The master-data source for the Project Costs app:… |
| 25 | admin · Std Assumptions · Contracts ADMINISTRATION BoP Standard Contracts Up to ten development and ten cons | ok | … |
| 26 | admin · Project Gates · pick Germany/Wind ADMINISTRATION Project Gates Who approves what at each project gate, for | ok | … |
| 27 | cost · DEVEX/CAPEX | ok | PROJECT COSTS DEVEX / CAPEX Development and capital costs by account, … |
| 28 | cost · Operation & Maintenance | ok | PROJECT COSTS Operation & Maintenance Recurring O&M costs per device t… |
| 29 | cost · Land Lease | ok | PROJECT COSTS Land Lease Land lease contracts by sub-account. The cont… |
| 30 | cost · Other OPEX Costs | ok | PROJECT COSTS Other OPEX Costs Recurring costs under the Other OPEX Co… |
| 31 | cost · Contracts | ok | PROJECT COSTS Contracts Balance-of-Plant contracts: their CAPEX accoun… |

Coverage of the walk: the portfolio and its filter, the create-project path, all ten project
rail screens, the Planning / Generator / Revenue panels, all six admin screens and all five Cost
app screens. That is every screen in the plan's three phases, which is what **G-WALK** requires at
the end of each phase.

The walk exists because of one defect it caught that nothing else could: `+ Add Project` navigated
to `/project/general`, `RequireProject` bounced it to "No project selected", and the app's only
create path was unreachable while every unit test passed. Steps 4 and 5 above are that path, now
asserted.
