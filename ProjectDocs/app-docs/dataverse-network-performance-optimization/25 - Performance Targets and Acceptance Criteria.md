# 25 - Performance Targets and Acceptance Criteria

> Stage 2 (design and planning only), 25 Nov 2026. **No runtime baseline exists yet** (doc 13), so a target below is either a code-derived expectation from the audits or a rule ("no worse than baseline"); every 'baseline' cell is filled by T-00 and every 'target' tightened from it. Nothing here is a measured result.

## 1. The scenarios (same project, user and data before and after)

| # | Scenario | Baseline (T-00 fills requests / waves / ms) | Code-derived expectation after the plan | Tasks |
|---|---|---|---|---|
| S1 | Cold boot to Project Overview | code-derived: about 14 requests, 3 waves | no more requests or waves than baseline; interactive time not worse | T-23 |
| S2 | PM deep link to a PM screen (Production) | code-derived: 3 boot waves, then the screen's reads | one wave fewer to the screen's data (prefetch) | T-23 (PB-03) |
| S3 | CAPEX tab first load | capture | one wave fewer (comments with payments); no whole-book reloads on later interactions | T-20 |
| S4 | CAPEX panel save / paid toggle / delete | capture | no whole category book reload; the interaction refreshes its own rows | T-20, T-43 |
| S5 | Add Cost from Table Save (normal sheet) | D51 measured on DEV: 1.6-1.9 s, 3-5 requests | no more requests; no project-wide Summary refetch; verify reads gated | T-20, T-13 |
| S6 | Land Lease save with 40 allocations | capture | bulk path: allocation writes one per chunk instead of one per row | T-40 |
| S7 | Land Lease delete with 40 allocations | code-derived: 44 requests, 7 waves | unchanged unless DEC-A is approved (then 1 request) | DEC-A |
| S8 | OPEX save | code-derived: 3-5 waves | no more; independent steps together | T-21, T-40 |
| S9 | Generators: add WTG type, 20 turbines, 2 all-WTG costs | code-derived: 63 requests, 6 waves | about 9 requests, 4 waves with the bulk flags on | T-41 |
| S10 | Generators: status toggle on 50 turbines | code-derived: 52 requests | a few requests (chunked bulk) | T-41 |
| S11 | Finance tranche Save | capture | only changed schedule rows written | T-32 |
| S12 | CAPEX account Deactivate clean-up | code-derived: 2 requests per zeroed row, 1 per deleted row | completes under injected 429; with the D36 decision, one request per chunk for zeroing | T-04, T-43 |

## 2. Metrics reported for each scenario (doc 28)

| Metric | Source |
|---|---|
| Total API requests; duplicate requests (same table, select, filter, in one scenario) | census (`[VSB] DATA/HTTP`) |
| Waves (sequential depth) and network round trips | census, from start/finish times |
| Initial-load, save and bulk request counts | census per scenario |
| Average and P95 per-request time | `ms` in the `[VSB]` lines (`SLOW` flag) |
| Request and response size | SDK `networkRequest` metric (to be logged by the census); not logged by the app today |
| Data-loading duration to first usable paint | the app's existing load summary line |
| Failed requests; retry count | `[VSB] ERROR` lines; the new retry lines (doc 21 section 7) |

Request-count gains and latency gains are reported separately. A request saved on a path the user waits on counts differently from one saved in the background.

## 3. Acceptance criteria

**Per task:** its tests are in the suite and green; the success path is proven unchanged (differential or oracle test); each failure step leaves a recoverable state; the console lines of every changed call were seen in a real run; behaviour switches exist where the doc 22 rollback column says so; the improvements log has its entry.

**Per wave:** `npm run verify` exit 0 on an idle machine; the census capture for the wave's scenarios is in doc 28 and no scenario is worse than baseline on requests, waves or time to first paint; DEV smoke test of the touched screens (add, edit, delete, reload to confirm persistence); E2E parity question asked; no open P0/P1 QA finding; your approval.

**Programme (doc 11 of the brief, final acceptance):** every P0 closed or explicitly held with your decision; every P1 closed, held (DEC) or deferred with a reason; shared infrastructure in place where justified (doc 15); existing behaviour preserved (full regression, parity run if you want it); failure tests pass (doc 30); independent QA complete (doc 33); documents 27-35 written with the traceability chain finding to task to files to tests to benchmark to QA; the original working tree untouched and no unauthorized push.

## 4. What counts as 'validated'

A change is called **validated** only with test evidence (unit and failure tests plus a DEV run for anything that touches a save or a flow). 'Implemented but not measured' and 'measured on DEV only' are stated as such in doc 34. No improvement is claimed from estimates.
