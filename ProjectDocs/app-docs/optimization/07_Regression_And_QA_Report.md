# 07 — Regression and QA report

Final state, 24 Nov 2026, branch `optimization/stage3` (base `origin/RounakDev1` = `b976a96`). Uncommitted; a rollback patch of the whole change exists (`git diff` of `ProjectCosts-CodeApp/src` against `HEAD`: **188 files, +9,952 / −2,189**, 85 of them test files).

## 1. Gate results

| Run | Result |
|---|---|
| Baseline, clean tree at `b976a96` (full vitest) | 352 files, **7,047 tests passed**, 15 skipped, 3 todo |
| After B2 alone (`npm run verify`) | 362 files, 7,119 passed, build green |
| After B2 + B3 + B5 + B6 + B7 (`npm run verify`) | 390 files, 7,310 passed, build green |
| After + B4 (`npm run verify`) | 395 files, 7,349 passed, build green |
| After + B8 and the review fixes, **final** (`npm run verify`) | **406 files, 7,404 passed**, 15 skipped, 3 todo; exit 0 |

`npm run verify` = the `.power/` data-source gate, typecheck, lint (28 warnings, the same as before the programme), the control-label gate (0 missing, 0 duplicate test ids, 2 ignored; the 48 "computed aria-label" warnings are the pre-existing advisory kind), the canvas-identity gate (C1–C5 all 0), the full test suite and the build.
A first four-batch merge run in a side worktree was killed on purpose when the full tree superseded it (exit 127); it is not counted as a result.

**Net test change:** +357 passing tests over the baseline. Existing tests were changed only where they pinned an old request count, read order, import path, or code that was deleted as dead; each such change carries a comment citing its OPT id. No assertion was loosened. Tests removed (they pinned only removed dead code): UT-PWRITE-009…015, 019, 021, 026…029, 032; UT-BOOK-016…018, 066, 067; two op names from UT-REPO-021; UT-ADCHK-003 (the clusters' own read).

## 2. How correctness was checked

1. **Characterisation first.** Each batch recorded the old behaviour (requests, waves, order, render counts) against the unmodified code before changing it, in the same test file.
2. **Differential tests with the old code as the oracle.** Replaced functions were compared with their old bodies over generated inputs: Land Lease writes (400 seeds), OPEX import dates (150 seeds), Team row building, gates task index (40 datasets), CAPEX hierarchy (30 charts), comment threads (400 seeds), OPEX row warnings (600 + 600 + 300 cards), Contracts Save gate (1,500 forms), closing-date split (500 seeds, `Object.is`), project-state views (60 tables), every merged helper over an edge table (dates 1999–2100 incl. DST, numbers incl. NaN/−0/1e21, strings incl. accents and Turkish İ).
3. **Safety nets for narrowed reloads.** Team, Grid Operator and Planning each have a test that fails if a table a plan writes is not refreshed by every query that reads it.
4. **Failure injection** for the parallel write paths: a failure at every index (UT-LLWRITE-039/040, UT-PWOPEX-010…013), plus a deliberate mutation check (removing the allocation-only and same-op conditions made UT-LLWRITE-040…042 fail).
5. **Reversible switches** for every behaviour-changing optimization: `LEASE_WRITE_PARALLEL`, `OPEX_IMPORT_PARALLEL`, `PM_ROW_ONLY_PROJECT_LOAD`, `GENERATORS_PERF.deleteReadWaves`, `GENERATORS_PERF.countryFromSharedList`, `PERSON_CACHE_MS`, `GATES_REUSE_PEOPLE`, `CAPEX_CHART_MEMO_MS`, `CURRENCIES_MEMO_MS`, `SCOPE_ID_MEMO`, `JOB_TYPE_MEMO_MS`.

## 3. Independent review (B9)

Three fresh reviewers read the diff in three slices (Cost; PM + app + Generators/Check List; Admin + shared/domain/components), told the register and the repo rules but **not** the implementers' conclusions, and ordered to confirm every suspicion in the code. No reviewer ran the full suite.

| # | Finding | Severity | Outcome |
|---|---|---|---|
| 1 | Land Lease tiers split only on entity set: a failed allocation create could leave a delete landed (an allocation lost without replacement); a refused selected-period update could leave the followers' start dates rewritten | **MAJOR** (Cost) | **Fixed**: only same-kind allocation writes run side by side; everything else one at a time in plan order; named tests UT-LLWRITE-041/042 + a failure-at-every-index safety property; mutation check |
| 2 | `useRefreshSessionProjectOnLeave` used the exact key `["project", id]`; PM routes live under `["project", id, "pm"]` (B5b), so the refresh never fired on a PM-first visit | MINOR (PM) | **Fixed** (prefix check), UT-GENWAVE-OPT-901/902 |
| 3 | Milestones took the country's business unit (re-stamped as the owning BU on save, rule 4) from the cached list with no freshness check | MINOR (PM) | **Fixed** (`fetchQuery`), UT-MSTONE-OPT-901/902 |
| 4 | Team person cache remembered an empty directory answer for 30 minutes | NIT (PM) | **Fixed**, UT-TEAM-OPT-901/902 |
| 5 | Project Gates people reuse kept a blank-name entry for the whole cache window | MINOR (Admin) | **Fixed**, UT-ADGATE-OPT-901/902 |
| 6 | Comment claimed an Application Settings country save refreshes the Generators country list; nothing writes `vsb_countries` | NIT (PM) | **Fixed** (comment and D160 §7) |
| 7 | DevCo-contracts `fetchQuery` comment said "stale time 0" but the client default is 30 s | MINOR (Cost) | **Fixed** (`staleTime: 0` explicit) |
| 8 | Payer-defaults read sends one extra request for a category with no accounts, against its own comment | MINOR (Cost) | Comment corrected; behaviour kept (UT-COSTWAVE-OPT-006) |
| 9 | Stale header comments; a stray whitespace edit; `capex-costs/comments.ts` rewritten as CRLF (hid a 30-line change as a whole-file diff) | NIT | **Fixed** / restored to LF |
| 10 | Other OPEX no longer refreshes the device-type cache on an `enabled` flip | MINOR (Cost, unconfirmed) | **Not changed**: the old code also kept the cached data across a mode switch in the same instance, and refetches on mount in both versions |
| 11 | Payment-target keys are the exact sorted id list (~18 KB at 500+ contracts) | NIT | Left: exact and collision-free |
| 12 | B2 "before" wave figures are recorded constants (the old loader is not kept as an oracle there) | NIT | Documented in `06` |
| 13 | Currency table memoised 5 minutes, including the ACTIVE-only save-time lookup | NIT | Documented as a freshness trade-off (D160 §3, §6) |
| 14 | `readClusterTracking` `top: 1` with no `$orderby`; hand-built `guid()`-guarded filter in `readClusterTask`; `adminInvalidation.ts` now imports the chart module | NIT | Noted; unordered before too; repo convention; no test needed mocking |

Sound, per the reviewers (so the owner knows the coverage): the shared-read cache logic (coalescing, TTL, failure drop, an in-flight pre-write read never remembered), every merged helper's original body equals the shared one (and `round` vs `pfxRound` were not merged, DEC-1), the PM row-only load (header fields, fallback, key separation, every invalidation reaches both scopes, a Cost screen never receives the PM shape), every narrowed invalidation (Team, Grid Operator, Planning, General Data cluster job), the person/scope/job-type caches, `getEntraPeople` bounding (order and failure semantics for its callers), the admin safety flows untouched (ownership re-check, partial-save retry, cascade deactivate, multi-phase deletes), all new reads have `$select` and go through the tracing client, no create lost its owning-business-unit bind, no `unwrap` bypass, no held decision touched.

## 4. What was NOT verified

- **No DEV run.** Nothing was exercised against `VSBCloud_Dev` or a signed-in browser. The per-batch DEV checks are in the decision record (D160 §4, §6–§11).
- **Playwright / E2E parity suite not run.** AGENT-GUIDE item 6 requires asking before any commit or merge; the question is open (it needs a role, screens, and the Canvas and Code app URLs).
- **`knip` not run** (needs a package download). Known candidates: exports used only by tests (`invalidateCurrencies`, `idSetKey`, `monthRowsOfSave`), `loadLandLeasePeriods` / `mapLandLeasePeriodRow` / the default `"all"` scope of `loadCostBook` (kept on purpose), `loadProjectExtras` (kept as the fallback).
- **The formatted-value annotation of `vsb_projects`** equalling the state's primary name on live rows (the PM header depends on it; four other screens already rely on the same annotation; the fallback covers a blank).
- **Performance in seconds.** Only counts were measured (`06`).
- No mutation run for the review fixes other than the Land Lease one.

## 5. Outstanding issues

1. **Possible municipality truncation (correctness, not performance).** `searchGermanMunicipalities` / `searchFrenchMunicipalities` send `maxPageSize: 500` and `$top: 5000` together and read one page; Bayern (about 2,000 municipalities) may return only 500. Not changed (D160 §8). Check on DEV: search Bayern with an empty term and count the options.
2. **OPEX created-on order** of imported chains (decision needed; `OPEX_IMPORT_PARALLEL = false` restores it).
3. **Two rounding implementations disagree on ties** (`round` vs `pfxRound`, DEC-1); untouched by the programme, but worth a look because 35 call sites use `pfxRound`.
4. The pre-existing known flake family (`UT-ADGATE-910`, CA-19) did not occur in any full run.
