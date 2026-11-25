# 13 - Initial Performance Baseline

Stage 1, 25 Nov 2026. Branch `feature/dataverse-network-performance-optimization` at `30afece`.

**No runtime request or latency measurement has been taken yet.** This audit read code; it did not run the app against Dataverse. Everything below is either a **measured build/test fact** (section 1) or a **code-derived estimate** (section 2). The runtime baseline is planned as Stage 3 wave 0 (doc 25, doc 23) and needs a signed-in run against `VSBCloud_Dev`.

## 1. Measured: the code-quality baseline (this machine, idle, 25 Nov 2026)

| Check | Result |
|---|---|
| `npm ci` | clean install from the lockfile |
| `npm run verify`, single pass | **exit 0**: `check:power` 96 registered, 0 problems; typecheck, lint, label and canvas-identity gates, tests, build all pass |
| Tests | 432 files (431 passed, 1 skipped); **7,512 tests passed**, 15 skipped, 3 todo; 390 s |
| Build | `vite build` succeeds |
| Lint | 1 warning in `features/cost/capex-costs/Screen.tsx:425` (React Compiler memoization); the earlier loaded run also showed 2 more (`SessionContext.tsx:93`, `milestones.revenueAssumptions.test.ts:35`) |

A first `verify` run, made while five audit agents were using the machine, took 6,976 s and failed on 1 jsdom timing test (`UT-ADGATE-703`) plus 5 test files whose workers timed out on start; run alone, those six files passed (40 of 40) and the build passed. Cause: machine load (the project's own docs describe this worker-start timeout on this OneDrive path). Practical rule for Stage 3: run `verify` on an idle machine.

Side effect worth knowing: a vitest run rewrites `src/features/pm/production/__snapshots__/productionPlans.baseline.test.ts.snap` with LF line endings (content identical, so `git diff` shows only a line-ending warning). It was restored with `git checkout` after each run.

## 2. Code-derived request counts (auditor estimates; each is traced to code in doc 03)

| Workflow | Estimate | Source |
|---|---|---|
| Landing on Project Overview (cold boot) | about 14 requests, 3 Dataverse waves; interactive after wave 1 | PB boot trace |
| PM deep link `/project/<screen>` | one more wave: the screen's own reads wait for the gate (PB-03) | PB boot trace |
| "Edit Project" / "Edit Costs" new tab | repeats the whole cold boot (PB-04) | PB-04 |
| Generators: add a WTG type with 20 turbines and 2 all-WTG land-lease costs | 63 requests in 6 waves; about 9 in 4 with the bulk switches on (PA-01) | PA-01 |
| Generators: status toggle on 50 turbines | 52 requests | PA-01 |
| Land Lease: delete a contract with 40 allocations | 44 requests in 7 waves; 1 request if the header cascade were used (CB-04, needs a decision) | CB-04 |
| CAPEX account Activate/Deactivate clean-up | 2 requests per zeroed cost row and 1 per deleted row, 24 in flight; thousands at real volumes (AD-01, AD-02) | AD-01, AD-02 |
| Add Cost from Table Save | bulk path: 3-5 requests for a normal sheet (D51 measured on DEV: 1.6-1.9 s); the Save also refetches project-wide totals (CA-06) | D51, CA-06 |

The auditors' per-screen tables (initial load, interaction, save, wave depth) are in doc 03. They count requests and sequential waves, not milliseconds.

## 3. What is not known (and how Stage 3 wave 0 closes it)

| Unknown | How it is measured |
|---|---|
| Real requests per screen and per save | run the app with `pac code run`, drive each screen, count the `[VSB] DATA / HTTP / ACTION` console lines (D72 prints one per request, with rows and ms); capture to a file per scenario |
| Latency per call (P50/P95) | the same `[VSB]` lines carry `ms` and a `SLOW` flag; compute from the capture |
| Request and response sizes | the `networkRequest` metric from the SDK (`logHttp`) or the browser network panel; the app does not log sizes today |
| 429 and 5xx frequency | `[VSB] ERROR` lines and the SDK metric status codes; also Application Insights dependencies (D161) if enabled in DEV |
| Real row volumes (CAPEX clean-up, hedge volumes, turbines per type) | read-only counts on DEV |
| Whether the host accepts the `In` function, single-valued navigation filters, `UpdateMultiple` with `statecode` | small probes on DEV (doc 18, doc 25) |

Any number that appears in a later benchmark (doc 28) must come from that capture, taken with the same project, user and data before and after.
