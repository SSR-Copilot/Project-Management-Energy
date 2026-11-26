# 00 - Index and Executive Summary

Dataverse and network performance optimization, Power Apps code app `ProjectCosts-CodeApp`. 25 Nov 2026. Branch `feature/dataverse-network-performance-optimization` (worktree `Project-Management-Energy-WorkDev1-DataverseOptimization`), from `origin/RounakDev1` at `30afece`.

**Status: Stages 1 and 2 (audit and plan) are written and Stage 3 (implementation) has run for two batches: 30 plan tasks were scoped; the integrity, retry-layer and request-saving tasks are implemented behind reversible switches (13 switches ship OFF), and the tasks that need DEV probes or your decisions have not been started (per-task status in doc 27). The full gate is green (exit 0; 491 test files, 8,273 tests; build OK). Committed locally in four commits (not pushed), nothing has been run on DEV, and no runtime measurement exists. Start with `34 - Final Optimization Report.md` and `27 - Implementation Tracker.md`.**

## Executive summary

- **Scope audited:** 324 Dataverse call sites across Cost (CAPEX, Add Cost, Contracts, OPEX, Land Lease), PM (Generators, Production, Revenues, Finance, Project Overview, General Data, Milestones, Team, Planning, Grid Operator, Cluster Checklist), the six admin screens, app boot, and the shared write engine. Five read-only audits; the orchestrator re-read the code behind the top findings.
- **Findings: 83.** P0: 3, P1: 15, P2: 28, P3: 37. (Doc 12.)
- **The picture:** the earlier programmes (D160, D162, D51, D99-D159) already removed most of the avoidable waiting. What remains is (a) **reliability gaps** in the shared layer, (b) **a few integrity risks**, (c) request-count work that is real but smaller, and (d) **bulk paths that exist but are switched off**.
- **The three P0s** are integrity risks, not speed: Land Lease and OPEX updates can re-create a row another user deleted, as an orphan with no project or business unit (CB-01); a partly failed cost write leaves a stale cache so a second click on 'import standard contract' can create a duplicate (CB-02); the CAPEX forecast clean-up sends thousands of un-retried requests and stops at the first failure, leaving costs half-cleaned (AD-01).
- **A finding no auditor reported (OR-01):** the SDK's HTTP error carries no headers, so `Retry-After` can never be read. Every `Retry-After` branch in `data/retry.ts` is dead code: a 503 is never retried and a 429 waits only 1 s then 2 s. The 'honours Retry-After' notes in the code and decisions describe behaviour that cannot happen. There is also no request timeout anywhere (the SDK has none either).
- **Platform limits that shape the plan:** the SDK cannot `$batch`, use change sets, `$expand`, FetchXML or aggregates; PATCH is an upsert (no `If-Match`); every write returns the full row. Bulk writes are therefore only `CreateMultiple` / `UpdateMultiple` / `UpsertMultiple`, atomic per call, and nothing in the app is transactional across requests.
- **Baseline (measured):** `npm run verify` exit 0 on an idle machine: 7,512 tests pass, build OK, 96 data sources registered. **No runtime request or latency baseline exists yet**; wave 0 captures it. Every request count in these documents is code-derived.

## The plan in one table (docs 22, 23)

| Wave | What | Tasks | Findings closed |
|---|---|---|---|
| 0 | Baseline census, five read-only DEV probes | T-00 | enables the rest |
| 1 | Integrity: guard upserts, refresh on every outcome, shared 'already gone', resilient clean-up, register Finance bulk backend, tab-close hold, Planning creates, flow outcome unknown, stable create ids | T-01..T-09 | 3 P0 and the data-loss P1s |
| 2 | One retry / deadline / global-gate layer | T-10..T-15 | OR-01, WE-01..07, CA-01, CA-02, CA-11, CA-17 |
| 3 | Duplicate, unnecessary and independent requests | T-20..T-24 | the P2/P3 network and caching items |
| 4 | Larger id lists, parent-lookup filters, smaller payloads (after probes) | T-30..T-33 | CA-04, CB-05, PA-03, CA-12, AD-10, PB-02 |
| 5 | Bulk: Land Lease, OPEX, Generators (existing path, staged), Revenues, Production, General Data, admin clean-up | T-40..T-43 | PA-01, CB-06, CB-10, PA-06, PA-07, PB-11, CA-14, AD-02 |
| 6 | Regression, failure tests, benchmark, independent QA, docs | T-90 | - |

**83 of 83 findings are assigned**; 7 decisions hold 8 findings until you decide (doc 22 section 3).

## Decisions and inputs needed from you

1. **Approve Stage 3** (or amend the plan). Nothing is implemented until then.
2. DEV access for read-only probes P-1..P-3, P-5, and your presence for P-4 (provokes throttling) before wave 0.
3. Product decisions that gate specific tasks: a 'Resume' button for the clean-up (T-04); the canvas behaviour for Planning's first open (T-07); the wording of an 'outcome unknown' message for flow steps (T-08); the D36 §1 lift for the admin clean-up (T-43); the `SynchroniseProjectState` order check (T-42); go-ahead to run the Generators bulk DEV test plan (T-41).
4. Held findings DEC-A..DEC-G: Land Lease header-only delete, roll-up write skip, faster new-tab boot, Summary aggregate (needs server work), Check List order flow, focus-refetch policy, roll-up from the server.
5. **Where the documents live:** `ProjectDocs/app-docs/dataverse-network-performance-optimization/` (project rule: docs stay out of the code repo), not the `docs/` path in the brief.

## Document index

| Doc | Title | Stage |
|---|---|---|
| 01 | Repository and Data Access Architecture (includes the live flag values and the platform constraints) | 1 |
| 02 | Complete Dataverse Operation Inventory (324 call sites) | 1 |
| 03 | Screen-Level Network Audit (flow traces, waves) | 1 |
| 04 | Network Request Optimization Findings | 1 |
| 05 | Bulk Operation Assessment | 1 |
| 06 | Query and FetchXML Optimization Findings | 1 |
| 07 | Payload Optimization Findings | 1 |
| 08 | Transaction and Dependency Analysis (includes server and Power Automate dependencies) | 1 |
| 09 | Caching and Request Deduplication Assessment | 1 |
| 10 | Concurrency and Throttling Assessment | 1 |
| 11 | API Reliability Assessment | 1 |
| 12 | Consolidated Findings Register (83 findings, already-addressed list, open questions) | 1 |
| 13 | Initial Performance Baseline | 1 |
| 14 | Git Execution Record | 1 |
| 15-21 | Target architecture and the six strategies (network, bulk, query and payload, transaction, caching, concurrency and reliability) | 2 |
| 22 | Prioritized Implementation Backlog (30 tasks, traceability matrix) | 2 |
| 23 | Chronological Execution Roadmap | 2 |
| 24 | Agent Responsibilities and Dependencies | 2 |
| 25 | Performance Targets and Acceptance Criteria | 2 |
| 26 | Implementation and Rollback Strategy | 2 |
| 35 | Git Worktree and Branch Management | standing rules |
| 27-34 | Implementation tracker (27), benchmark (28, no measurements), functional regression (29), reliability tests (30), bulk (31), cache and concurrency (32), QA findings (33), final report (34) | 3 |

## Limits of this work

- Request counts are estimated from code, not measured; the auditors' counts of waves and requests may be off where a path depends on data volumes.
- The audits were read-only. They did not run the app against Dataverse; whether the host accepts some query shapes (the `In` function, navigation filters, `statecode` in `UpdateMultiple`) is unproven until probes P-1..P-3 run.
- Five auditors worked in parallel; one stalled and was resumed. I verified the top findings (CB-01, AD-01, PA-02) against the code; PA-02 is qualified (a lazy import may register the backend first). The remaining findings are the auditors' with their cited evidence, not independently re-derived.
- The 'initial' values for retry, deadline and the global ceiling in doc 21 are starting points for calibration, not measurements.
