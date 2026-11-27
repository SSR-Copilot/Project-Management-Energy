# 32 — Final bottleneck optimisation report

> 27 Nov 2026. Base `dde9e92` (= `origin/RounakDev1`). Stages 1 and 2 are complete; Stage 3 implemented the approved first batch (waves 0-2, tasks with no open decision, probe or browser gate). The measurements are bytes, requests and waves from tests and builds. **There is no browser, DEV or Dataverse measurement.**

## 1. Overall assessment

The application is not in trouble anywhere the audit could see. It had already been through two optimisation programmes (D162 frontend, D165 Dataverse), and their shared-layer fixes still hold. What remains is mostly avoidable round trips and waits on specific actions, and a few first-visit download sizes. The most valuable result of the analysis was what it removed from the work list: of 113 unique findings, 15 were closed as not bottlenecks and 27 were overstated.

## 2. Findings

| | Count |
|---|---|
| Raw findings (9 Stage 1 agents) | 142 |
| Unique after merging duplicates | 113 |
| Stage 1 priority P1 / P2 / P3 (no P0) | 9 / 40 / 64 |
| Validated priority P1 / P2 / P3 / closed | 5 / 34 / 59 / 15 |
| Stage 1 confidence CONFIRMED / HIGH / SUSPECTED | 19 / 75 / 19 |
| Verdicts: actual / shared-root / overstated / unresolved / not a bottleneck / symptom | 34 / 13 / 27 / 20 / 15 / 4 |
| Actions: fix / fix after decision / fix after probe / measure first / defer / accept | 20 / 13 / 8 / 28 / 26 / 18 |

By category (Stage 1, unique): Network-bound 65, Dataverse-bound 37, Initialization-bound 18, Rendering-bound 19, CPU-bound 10, Memory-bound 9, Concurrency-bound 9, Data-bound 7, Architecture-bound 6. By theme: write amplification 19, redundant or over-wide reads 16, rendering and state 15, bundle and coupling 14, entry waterfall 11, read fan-out 11, CPU and memory 10, freshness 5, reloads after save 5, long operations 4, flows 3.

Top systemic root causes: a screen's own reads start only after it renders; one global freshness policy (a product decision, DEC-F); the write engine (per-row, guarded, bulk switches OFF); saves that wait for a reload; id-chunk read fan-out with no lane and an SDK with no abort or timeout; `data/` importing from `features/`.

The five validated P1s: Production first save (22 rounds at 30 turbines, 109 / 831 requests at 200), Check List row actions, the Check List approval flows' blocking calls (duration unmeasured anywhere), flow outcome handling, and Cost screen entry.

## 3. What was done in Stage 3

14 tasks across four isolated workstreams, integrated by hand (docs 25 and 33): import restructuring and a guard test, a static splash, small admin and Check List fixes and a corrected benchmark, boot and intent prefetch for Cost, Production, Revenues, Finance and admin, a bounded 16-wide read lane, and a reference-data cache tier. All behaviour-affecting changes sit behind named switches; the speculative data prefetch ships OFF.

| Result | Evidence |
|---|---|
| First visit of Milestones 128 to 67 KiB gz, General Data 118 to 77, Revenues 141 to 103, Finance 108 to 86, Planning 94 to 74, Grid Operator 52 to 32, landing 56 to 40 | Measured in builds (this change alone; not re-measured combined) |
| Cost deep link: first read 2 waves earlier; Production / Revenues 1 wave earlier | Wave recorder over the real data modules |
| Read peak 40 to 16 (17+ chunks add a wave) | Tests |
| Check List Move baseline corrected: 34 requests, not 37 | Bench |
| Start-up closure **302.0 to 303.9 KiB gz (+0.6 %)** | Final build: criterion not met, recorded as an exception |
| Full suite: 501 files, 8,379 tests passed, 21 skipped, 3 todo, 0 failed (baseline 8,273) | Final run |

## 4. Not done, remaining, and risks

- **Not implemented:** all write-path and reload changes (Production first save 22 to 5 rounds, Check List row action 3 to 2, Land Lease and Revenues saves, CAPEX delete width, admin guard), all decision-gated work, the browser campaign and DEV probes, and the measure-first rendering items. Each waits on a DEV check, a measurement or an owner decision (doc 23 section 3).
- **Unresolved:** the real seconds (probe P-0: D144 and D51 disagree 4 to 10x), flow durations, and real row counts.
- **QA residuals (doc 31):** the start-up exception (F1); the shared lane's latency effect on Add Cost's save and its lack of a timeout (F3); a lazy-chunk failure can skip General Data's Draft-approval cancel, as the canvas also swallows a failed cancel (F5); intent data prefetch must be capped by requests before it is enabled (F6).
- **Operational:** hover chunk prefetch ships ON, which the brief did not specify; the splash and prefetch were never viewed in a browser; the E2E parity suite was not run unless the user chose to (doc 27).

## 5. Recommended next workstreams

1. The measurement pass: a browser campaign (13 scenarios), probes P-0, P-1, P-2, P-5, P-6 and the 16-wide check on DEV, flow and Entra timings, a cold and repeat HAR. This turns waves into seconds and decides 28 measure-first findings.
2. Wave 3 write-path work in this order: Production generation 16 wide, then Check List row action, background reload with one shared `usePlanWrite` API, Land Lease Save, CAPEX delete width. Gate each on its DEV check.
3. Owner decisions that unlock the rest: DEC-F / DEC-3, DEC-6, DEC-7, the Move write-order pin, changed-rows-only writes, the non-modal flow UX and the T-08 wording.
4. Offset the start-up growth (QA F1 options) or accept it formally.

## 6. Git

See doc 33. No commit was made before the user's merge instruction; the merge and branch clean-up are recorded there after they happen.
