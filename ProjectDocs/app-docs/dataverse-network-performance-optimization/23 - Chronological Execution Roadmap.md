# 23 - Chronological Execution Roadmap

> Stage 2 (design and planning only), 25 Nov 2026. Tasks and finding IDs: doc 22. Effort is sized S / M / L (relative), not in days: no schedule is promised before the wave-0 capture and your decisions are in.

## 1. The sequence and why

| Wave | Purpose | Tasks | Why here |
|---|---|---|---|
| **0** Baseline, probes, diagnostics | measure before changing anything; learn what the host accepts | T-00 | every later claim needs a before; P-1..P-5 decide T-10, T-12, T-30, T-31, T-40, T-41 |
| **1** Data integrity and correctness | close the P0s and the data-loss P1s; mostly small and independent of the shared core | T-01, T-02, T-03, T-04, T-05, T-06, T-07, T-08, T-09 | highest severity, lowest dependency. T-04 and T-08 get their final retry/deadline behaviour when wave 2 lands |
| **2** Shared request core | the one retry / deadline / gate layer that waves 3-5 rely on | T-10, T-11, T-12, T-13, T-14, T-15 | single owner, shared files, must precede broad adoption; behind switches |
| **3** Duplicate / unnecessary / independent requests | the largest, safest request-count savings | T-20, T-21, T-22, T-23, T-24 | no bulk risk; each saves waves or requests per screen |
| **4** Queries and payloads | fewer requests per id fan-out, smaller writes | T-30, T-31, T-32, T-33 | T-30, T-31 depend on probe results |
| **5** Bulk operations | the largest write savings, the highest risk, so last | T-40, T-41, T-42, T-43 | need guards (T-01), retry (T-11), gate (T-13) |
| **6** Validation and close-out | regression, reliability tests, benchmark, QA, docs | T-90 | after everything |

This follows the brief's order (baseline, critical fixes, shared infrastructure, duplicates, queries and payloads, caching, bulk, transactions, concurrency, screens, validation, docs) with two deliberate changes: caching and transaction rules are carried **inside** the waves that need them (no wave of their own), and the shared core (wave 2) comes before the request-count waves because the audit showed retry and the gate are what makes parallel and bulk work safe.

## 2. Dependencies

```
T-00 --> T-01, T-02, T-07, T-08, T-10, T-12, T-20, T-22, T-23, T-30, T-31, T-32, T-33, T-40, T-41
T-03 --> T-04, T-09
T-01, T-02 --> T-21
T-10 --> T-11, T-12, T-14, T-24
T-11 --> T-13 --> T-41, T-42
T-12 --> (extends T-08 and T-04 with the unknown-outcome class; not a start dependency)
T-30 --> T-31
T-05 --> T-41
T-01, T-11 --> T-40
T-04, T-11, T-40 --> T-43
all --> T-90
```

Independent and startable on day one: T-03, T-05, T-06, T-15.

## 3. Gates between waves

A wave is closed only when all hold: `npm run verify` is green on an idle machine; every task's own tests are in the suite; the `[VSB]` lines of each changed call were seen in a real run (rule 23); the improvements log (`13-CODE-APP-IMPROVEMENTS-OVER-CANVAS.md`) and the decisions log (`02-OPEN-DECISIONS.md`, next number D165, provisional) are current; the wave's census capture is recorded in doc 28; **you approve** before the next wave. Waves 3-5 additionally need a DEV smoke test of the touched screens (CONVENTIONS 'Before pushing to DEV'); a push to DEV is its own approval.

## 4. What I need from you, and when

| When | Need | For |
|---|---|---|
| Before wave 0 | DEV access for read-only probes P-1 to P-3, P-5, and your presence for P-4 (provokes throttling) | T-00 |
| Before T-04 | resume-button decision | AD-01 |
| Before T-07, T-08 | the canvas behaviour to keep (Planning first open); the 'unknown outcome' wording | PB-05, PB-01 |
| Before wave 3 | a go on the warm-up change if the capture shows a first-paint cost | PA-11 |
| Before wave 5 | approval to run the Generators bulk DEV test plan; the D36 §1 decision for the admin clean-up; the `SynchroniseProjectState` order check | T-41, T-43, T-42 |
| Any time | DEC-A to DEC-G (doc 22 section 3) | held findings |
| Each wave end | approval to continue; separately, any commit, push or DEV deploy | governance |

## 5. Items deliberately not scheduled

DEC-A (header-only Land Lease delete), DEC-B (roll-up skip), DEC-C (new-tab boot), DEC-D (Summary aggregate), DEC-E (flow per order PATCH), DEC-F (focus refetch), DEC-G (roll-up from server). Each waits for a decision, not for effort; doc 22 section 3 states what each would change.

## 6. Parallelism inside Stage 3

Waves are sequential at their gates. Within a wave, tasks on different modules run in parallel agents (doc 24) provided they touch no shared file; shared files (`retry.ts`, `concurrency.ts`, `client.ts`, `Providers.tsx`, `errors.ts`) have one editor at a time (the Master Orchestrator) and are all in wave 2.
