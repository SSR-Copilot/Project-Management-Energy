# 34 - Final Optimization Report

> 25 Nov 2026. Branch `feature/dataverse-network-performance-optimization` (from `origin/RounakDev1` at `30afece`), **committed locally (three code commits and one documentation commit), NOT pushed, not run on DEV, not product-approved.** The brief's section 12 is followed in order. Nothing is described as validated unless a test or a gate result supports it; "validated" here means unit, differential and failure-injection tests plus the full gate. No runtime measurement exists (doc 28).

## 1. Executive summary

Stages 1 and 2 (audit and plan) and the first two implementation batches are done. The audit found 83 findings (3 P0, 15 P1, 28 P2, 37 P3). The code now carries **one status-based retry layer** with backoff and jitter used by every write path, integrity guards for the three P0s, and a set of request savings, **all behind reversible switches**. Thirteen switches ship OFF because they need your decision, a DEV check or calibration. The full gate is green (491 test files, 8,273 tests, build OK; baseline 432 and 7,512). Two independent QA reviews found no blockers; their six majors are fixed or switched off. The things not done are the ones that need DEV probes or your decisions.

## 2. Original and optimized architecture

Original: `Screen -> hooks -> data/<module> -> generated service or SDK client -> host -> Dataverse`, with retry logic that depended on a `Retry-After` header the SDK never exposes, no deadline, per-pool concurrency limits that add up, and refreshes wider than the writes (doc 01). Optimized: the same path plus one layer, `data/requestPolicy.ts` (`sendWithPolicy`), that applies error classification, retry per the idempotency matrix, deadline and global gate (both off); helpers in `client.ts`, the plan engine and the bulk transport route through it; a G-REQ unit gate stops direct request sites from growing unreviewed (doc 15). No `$batch`, change set, `$expand`, FetchXML or aggregate exists in the SDK (doc 01 section 4), so none was introduced.

## 3. Operations audited

324 call sites in five scopes (doc 02): Cost A 38, Cost B 46, PM A 80, PM B and boot 85, admin and write engine 75.

## 4. Findings by priority

83 in total: P0 3, P1 15, P2 28, P3 37 (doc 12). Orchestrator-found: OR-01 (Retry-After unreadable). Raised by the two QA reviews: 15 + 12 (docs 33).

## 5. Findings resolved

- **Implemented and validated (tests and gate, switch ON):** P0 CB-01, CB-02 (Land Lease and OPEX guard and refresh), AD-01 (CAPEX clean-up); P1 CA-01, CA-03, CB-03, WE-02 and OR-01 (retry layer), PA-02 (Finance bulk backend), CA-05 (CAPEX patch-in-place) among others; a large group of P2/P3 request savings and cache consolidations (counts per task in doc 27). Per-task status: doc 27.
- **Implemented and validated, shipped OFF:** WE-07, PA-03, PA-05, AD-09/AD-12, CB-14, CA-07, PA-15, PB-08, the concurrent Check List back-fill, the lazy warm-up, request deadlines, the global gate (doc 27 and D165 section 3).
- **Identified, not implemented (need a probe, a DEV test or a decision):** T-08 (PB-01 flow outcome), T-30, T-31, T-33 (CA-04, CB-05, PB-02), T-40 to T-43 (CB-06, CB-10, PA-01, PA-13, PA-06, PA-07, PB-11, CA-14, AD-02), PB-07, AD-10, and the held DEC-A to DEC-G (CB-04, PA-04, PB-04, CA-13, AD-07, CA-10, AD-04, PA-14).

## 6. Requests and round trips eliminated

Not measured. Code-derived and test-asserted reductions are listed in doc 28 section 3 (for example a header-only Finance edit 29 to 0 child writes, OPEX save one wave fewer, no whole-book reload after a CAPEX toggle). The largest estimated saving, Generators bulk (63 to about 9 requests for a type with 20 turbines), is **not** delivered: the bulk switches remain off pending the DEV test plan.

## 7. Bulk operations improved

None newly enabled. Reliability only: the bulk transport retries a 429 and never a 5xx; the Finance bulk backend is registered; verify reads are routed through the policy (doc 31).

## 8. Query and payload improvements

One BoP read instead of two, one `vsb_countries` key, narrower Production id reads, a changed-columns-only CAPEX Edit, changed-rows-only Finance (OFF). Larger id lists (CA-04) and parent-lookup filters (CB-05) wait for probes P-1 and P-2.

## 9. Caching and concurrency improvements

Patch-in-place CAPEX book, shared SPV/DevCo mapping, one person cache, shared project-row key, once-per-project Planning seed, boot prefetch of PM screens, a catalogue cache key scoped by environment and user (cache off), a bounded admin fan-out (width 6) and a global request gate (built, off). Freshness rules (30 s, refetch on focus) unchanged (doc 32).

## 10. Reliability improvements

Retry classified by status with equal-jitter backoff for throttling and full jitter otherwise; creates and bulk calls never retried after a 5xx or network error; flows never retried; one retry layer per request (proved by request-counting tests); a deterministic-error marker so a page-cap failure is not retried; a CAPEX clean-up that survives throttling; a deadline and an "unknown outcome" error class (built, off) (doc 30).

## 11. Before and after metrics

Not available (doc 28).

## 12. Functional regression

Gate green: doc 29. The E2E parity suite was offered and declined by the owner on 25 Nov 2026; it has not been run.

## 13. Independent QA

Two reviews, 0 blockers, 6 majors, 15 minors and 6 nits. Fixed, or switched off pending a DEV check: QA-01, QA-03 to QA-09, QA-11, QA-12, QB-01 to QB-03, QB-10, QB-12. QA-02 is OPEN: it cannot occur while `PANEL_STABLE_ID` is off and must be fixed before that switch is turned on. Left as is, with written reasons: QA-10, QA-13 to QA-15 and QB-04 to QB-09, QB-11 (doc 33). The last fix round (QB-01 to QB-03 and the four red tests) was verified by the full gate but was not itself independently re-reviewed.

## 14. Remaining technical debt

The 250 direct generated-service call expressions (G-REQ prevents growth, not the stock); retry waits still hold delete-gate and plan-group slots in a few places (QB, dispositions); two `deleteRecord` callers show an error when a retried delete answers 404 although the row is gone; `costBook.ts` and `useCostBook.ts` are very large; the OPEX book now depends on a 30-minute-old name list when `OPEX_BOOK_REUSES_CATALOGUE` is on.

## 15. Known limitations

No runtime evidence of any kind. The host's acceptance of a client primary key on a plain create, the `In` function, navigation filters, `statecode` in `UpdateMultiple`, the by-name environment-variable filter and the O&M navigation filter are unproven. Initial retry, deadline and gate values are starting points. `PANEL_STABLE_ID` has an open defect (QA-02) that must be fixed before it is enabled. A deadline in the app cannot cancel a request, so a timed-out write has an unknown outcome.

## 16. Git summary

Worktree `C:\Personal\Code App Mordenization\Project-Management-Energy-WorkDev1-DataverseOptimization`, branch `feature/dataverse-network-performance-optimization`, base `30afece`, **four local commits** (`6952b4d` shared retry core and engine, `3da4143` Cost and admin, `755fe7a` PM and boot, plus the documentation commit), no co-author trailer, authored through a one-off identity because none is configured on this machine; the code commits touch 188 files (about 15,900 lines added and 550 removed). Intermediate commits were not each run through the gate; the final tree was. Ten agent worktrees and branches (`dvopt/*`) exist under `C:\wt-dvopt` and are removable after approval. The source branch `RounakDev1` in the original tree advanced to `e4bab5d` meanwhile; nothing was merged or rebased. Doc 14 and doc 35.

## 17. Dependencies on other workstreams

Shared files this programme changed: `data/retry.ts`, `data/client.ts`, `data/executePlan.ts`, `data/bulkSend.ts`, `data/requestPolicy.ts` (new), `platform/errors.ts`, `app/Providers.tsx`, `data/concurrency.ts`. Any other session editing them needs an integration plan before merge. No dependency on another workstream's uncommitted work.

## 18. Future recommendations

1. Run probes P-1 to P-5 and capture the baseline with the census tool, then turn the switches on one at a time with a capture between each.
2. Decide the held items (doc 22 section 3), starting with DEC-A (header-only Land Lease delete: 44 requests to 1, atomic) and the Generators bulk DEV test plan (the largest write saving).
3. Fix QA-02 before enabling `PANEL_STABLE_ID`; calibrate deadlines and the gate and settle QA-13 before enabling them together.
4. Consider a Dataverse custom API for the multi-table saves that cannot be made atomic from the client (D6): outside this workstream.
5. Review the second batch's last fix round independently before merge.
