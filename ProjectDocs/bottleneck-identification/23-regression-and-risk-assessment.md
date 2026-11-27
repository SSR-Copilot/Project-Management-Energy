# 23 — Regression and risk assessment

> Stage 2, 26 Nov 2026. What could go wrong when the Stage 2 tasks are implemented, how each risk is contained, and which existing tests already pin the behaviour. Risks are drawn from the agents' per-finding "functional risks" and "performance risks" and from the repo's own rules and decisions (CONVENTIONS, KNOWN-RISKS-AND-DECISIONS, D51, D145, D150, D165).

## 1. Risk register

| # | Risk | Tasks exposed | Severity | Containment | Pinned today by |
|---|---|---|---|---|---|
| 1 | **Canvas parity broken** (a "faster" behaviour the canvas does not have: background reload, changed-rows-only writes, cascade-only delete, debounce, non-modal flow UX) | T-B08, T-B09, T-B10, T-B11, T-D01, T-A03 step 3 | High (silent) | Each is DECISION-gated; `DIVERGENCE:` marker + `…CanvasParity` twin + test + 02-OPEN-DECISIONS entry; owner approval before it ships ON | Existing `…CanvasParity` tests; canvas-identity gate |
| 2 | **Write-order or atomicity changed** (Move chain, shareholder writes, generation groups) | T-A02, T-A05, T-B01, T-B02 | High | Keep write order; split UT-CHKPERF-004 into a write pin (unchanged) and a read pin; QA-07 DEV order check before T-A05 touches the tracking rebuild | UT-CHKPERF-004, `generationWaves.test.ts` |
| 3 | **Throttling / lock contention** (HTTP 429, plugin or flow lock) from wider groups or bulk | T-B01, T-B03, T-B04, T-B05, T-C05 | High | DEV 16-wide check with `[VSB]` lines before the constant changes; read lane capped at 16 (40 - 24); retry layer from D165 handles 429 for writes; bulk never retried after a 5xx | `requestPolicy` / `retry` tests; `concurrency.*` tests |
| 4 | **Stale data shown or acted on** (cache patched in place, background reload, longer reference-data life, prefetch hits) | T-A01, T-B08, T-B09, T-C01..04 | High | Reference tier only (gc = stale); busy guard blocks actions that need fresh rows; DEC-F untouched; DEV check that no server flow reacts to checklist-row writes before T-A01 ships ON | `costReadPath.waves.test.ts`, UT-CHKPERF-*, Screen tests |
| 5 | **Unknown outcome after a timeout** (deadlines cannot cancel a request; a timed-out write may have landed) | T-C06 and any task that enables `REQUEST_DEADLINES` | High | Non-idempotent writes and flows are never retried; `UnknownOutcomeError` and read-back (`maybeLanded`); reads deadline only after P-4/P-5 | `requestPolicy` tests |
| 6 | **Partial bulk failure** leaves a half-applied save | T-B02, T-B03 | High | Reuse the proven D51 pattern (client ids, settle-then-reconcile, `SavePlanError`); size gate keeps small saves on singles; GB tests on DEV first | `bulkWrites`, `addCostSheetBulk` tests (UT-BULK, UT-ACBULK) |
| 7 | **Duplicate submissions / double click** while a reload is no longer blocking | T-A01, T-B08, T-B09 | Medium | Busy guard per screen; job still serialises writes (`usePlanWrite`) | Screen tests |
| 8 | **Owning-BU or existence guard lost** in a rewritten write path | T-B01..06, T-A05 | High (silent, worst class: CONVENTIONS rule 4) | Reuse `executePlan` / `bulkSend` helpers; DEV check "rows and owning BU identical to the 8-wide run" | Existing write-plan tests; G-REQ |
| 9 | **Race window of a chunked existence guard** (a row deleted between the check and the write) | T-B06 | Medium | DEC-7 explicit risk acceptance; guard remains per chunk, not removed | `*.opt.test.ts` |
| 10 | **Module moves break test seams or the request-site baseline** | T-E01, T-E02, T-E03 | Medium | Found by grep: five `vi.mock("./generalData")` seams and the `requestSites.test.ts` baseline move with the code (in scope); scratch rebuild type-checked; full suite required | `requestSites.test.ts`, the five mocks |
| 11 | **Chunk graph surprises** (prefetch pulls speculative bytes; barrel split changes loading order) | T-C01..03, T-E01..04, T-A04 | Medium | Bounded prefetch with a telemetry line; `bundle:report` before/after; start-up closure must not grow | `bundle:report`, `pmScreenPrefetch` tests |
| 12 | **Vendored PCF grid mutates cached data** (`applyStandardContractOptions` mutates the parsed tree) | T-D02 | Medium | Only after BM-03/04; clone or invalidate; vendored CSS byte-identity gate unchanged | `pcfCascade.test.ts`, capex grid tests |
| 13 | **Hidden coupling to the URL** (filter boxes read the URL) | RND-01-class changes | Low | Not planned (P3, measure-first) | UT-OVUI-047, UT-OVFIX-060, PO-007 |
| 14 | **Speculative traffic** (intent prefetch, warm-up) raises load on Dataverse | T-C03, T-A04 | Medium | Bounded, deduplicated, telemetry; lazy switch exists; hit-rate capture first | tests for the lazy switch |
| 15 | **Misleading bench**: a pinned count that does not match the real route | T-A08 | Medium | Fix the bench first; record new baseline | `checklistVisit.bench` |
| 16 | **jsdom timing flakes and worker timeouts** mask a regression | all | Low | Known: query open dialogs with `{ hidden: true }`; re-run the single file then `npm run build` if a run aborts; `UT-ACPERF-040` failed once at 29 ms vs 25 ms on a shared machine (re-run in isolation before trusting a red) | TESTING-AND-HARNESS notes |
| 17 | **Another session edits the same shared files** | all | Medium | Separate worktrees; shared-file lock list (doc 20/21); no merge without approval | `git worktree list` before each task |

## 2. Failure scenarios the Stage 3 regression pass must exercise

The brief's list, with the mechanism that tests each (to be filled in doc 27 per task):

| Scenario | How it is exercised |
|---|---|
| Network failure | Failure-injection tests in the data layer (`requestPolicy`, bulk) and screen tests with a failing query |
| Timeout | Fake-timer tests; deadline switch only in tests until P-5 |
| Dataverse throttling | Injected 429 with `Retry-After` unavailable (the SDK never exposes it): status-based backoff tests |
| Partial bulk failure | `SavePlanError` reconcile tests (D51 pattern) for any new bulk path |
| Invalid data | Existing rules tests; new write paths reuse the same validators |
| Duplicate submission | Busy-guard tests; `usePlanWrite` serialisation |
| Concurrent operations | Two-tab / two-user cases for T-B06 (DEC-7) and prefetch/focus overlap |
| Component unmount during async work | Existing unmount tests; background reload (T-B08/09) must not set state after unmount |
| Calculations and validations unchanged | Rules tests untouched; no `rules.ts` rule removed |
| Authentication and authorisation | No change to session, privileges or `OwningBusinessUnit` bind |
| Power Automate dependencies unaffected | No flow modified; flow call sites keep their arguments; T-A03 only moves a read beside the call |

## 3. Decisions and measurements that gate the riskiest tasks

| Needed | Blocks | From |
|---|---|---|
| DEC-A (cascade-only delete) | SCC-08 group (not planned unless decided) | Product owner |
| DEC-C (persisted reference data across tabs) | SPA-13 group (not planned) | Product owner |
| DEC-D (server-side Summary aggregate) | SCC-11 (not planned) | Product owner |
| DEC-F / DEC-3 (freshness, refocus refetch) | S2 beyond the reference tier | Product owner |
| DEC-6 (municipality debounce) | T-D01 | Product owner (note: the canvas has `DelayOutput: =true`) |
| DEC-7 (one-chunk existence guard) | T-B06 | Product owner |
| Revenues / Finance / Land Lease background reload; changed-rows-only; row freshness wording; Move pin; non-modal flow UX; T-08 wording | T-B08..B11, T-A01..A03, T-A09 | Product owner |
| Owner note: 5-minute chart staleness | SCC-14 part of T-C04 | Product owner |
| Flow wiring: may the Azure Maps token flow start earlier? | T-E07 | Product owner |
| DEV: P-0, P-1, P-2, P-5, P-6, 16-wide check, GB tests, QA-07/QA-09 checks, flow ms, Entra ms, HAR, row counts | Waves 3-4 | A developer with DEV access |
| DEV with the owner present: P-3 (writes a row), P-4 (throttling) | Throttling-sensitive tasks | Developer + owner |
| Browser campaign T-D00 (about 3 h; reference projects; signed-in Chrome on DEV) | All 28 measure-first findings | Owner or developer |
| Ratify performance thresholds (section 3 of doc 22) | Acceptance of Wave 5 | Product owner |

## 4. What this plan deliberately does not touch

Dataverse schema, security roles, permissions, Power Automate flows, the canvas-parity deletion flag, the Add Cost bulk-save design (D51: proven), and any validation or business rule.
