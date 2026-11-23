# 08 — Final optimization summary

24 Nov 2026. Branch `optimization/stage3` (from `origin/RounakDev1` at `b976a96`). **Uncommitted, unpushed, not run on DEV.** Final gate: `npm run verify` exit 0, 406 test files / 7,404 tests passing (baseline 7,047), build green. Details: `07`; counts: `06`; per-item status: `05`; findings: `02`; decisions and divergences: D160 in `02-OPEN-DECISIONS.md`; improvements log: `13-CODE-APP-IMPROVEMENTS-OVER-CANVAS.md` §1.5.

## What the programme found

Computation was almost never the problem. The heavily worked areas (Generators, Check List, Finance, Revenues, Production, the Add Cost bulk save, the shared components) had no CPU-bound hot path. The cost was **awaited server round trips**: waterfalls, reference tables read under several keys, reloads wider than the write, and sequential write loops; plus a few render paths that rebuilt a large grid on every keystroke.

## Completed improvements (all counts from tests; none are timings)

- **Cost reads:** the OPEX screens load only OPEX periods (4 requests / 2 waves, was 10 / 4); the CAPEX chart of accounts, the currency table and the project states are shared reads; a CAPEX tab starts its payer-defaults read beside the chart; cost-row reads page at 5,000; standard assumptions are filtered on the server; marking a month paid reloads only the cost book, a comment save only the comments.
- **Cost writes:** Land Lease save / delete / import go from 44 sequential waves to 9 / 7 / 9 with a failure-safe tiering (only same-kind allocation writes in parallel); OPEX save / delete / import 8–9 → 3–5 waves; about 450 lines of a second, unused Land Lease write path removed.
- **Cost UI:** typing in the CAPEX Add/Edit panel no longer rebuilds the grid (5 parent renders: 6 grid renders → 1); OPEX and Land Lease cards skip work while a panel is typed in; row warnings computed once per card (3,040 → 76 comparisons); Save gates reuse the errors already computed.
- **PM and platform:** a PM screen's session project is 1 request in 1 round trip (was 4 in 2) with the old lookup as fallback; PM saves reload only what they wrote (Team, Grid Operator, Planning, General Data); Team directory lookups are cached 30 minutes and bounded to 6 at a time; Planning's reads start with the project; boot prefetch covers Cost and the other PM screens.
- **Generators / Check List:** type delete waits 3 reads (was 4 / 5); the project's country comes from the shared list; Check List polls one 3-column row instead of every tracking.
- **Admin:** locks read 3 columns instead of 9; gates reads run together and reuse already-resolved names; the gates grid derives its rows once per dataset (65,538 → 400 element reads); the CAPEX hierarchy build is linear.
- **Shared:** one `dateOnly`, one date-text parser, one `roundDown/roundUp`, one home for the Power Fx text formatters, one `startsWithStandard`, one row-value module (each proven identical to the copies it replaced); pooled `Intl` formatters and collators; a stable `useMediaQuery` subscription; no telemetry payload built when telemetry is off.
- **Process:** 357 more passing tests, differential tests with the old code as oracle, eleven reversible switches, and three independent reviews that found and fixed one major issue (Land Lease tiering) and seven smaller ones before this summary.

## Deferred, with reasons

| Item | Reason |
|---|---|
| OPT-09 shared bounded read helper and its ~19 call sites | changes failure behaviour; wide surface; no 429 observed |
| `groupBy`, OData `eqId`, `durationMonths`, dd.mm.yyyy unification, admin helper dedupe | maintainability only |
| OPT-18 focus-refetch policy | multi-user freshness protection by design (DEC-3) |
| OPT-21 Generators / Check List bulk switches | code merged but off; DEV test plan not run (DEC-4) |
| OPT-22 guarded-update batching / SDK | SDK 1.3.1 sends no `If-Match` (DEC-7) |
| OPT-23 CAPEX panel cascade delete; Period-1 propagation skip; allocation `Name` skip | canvas parity; needs a DEV check (DEC-5) |
| Municipality search debounce | documented divergence (DEC-6) |
| `round` vs `pfxRound`, `Math.round` money, `asDate`, inflation twins, numeric parse stacks | change numbers or stored values (DEC-1, 1b, 2, 8, 9) |
| Generators supplier join and catalogue warm-up (S4-07/08) | need profiling |
| Contract save removals and additions together (S6-13) | would let additions land after failed removals |
| Re-keying PM country-dependent reads onto the session project | smaller gain, higher risk |
| Add Cost from Table validation passes | bench: 13 ms / 6 ms, nothing to gain |

## Remaining bottlenecks

- The round-trip time through the host is a platform constant; the programme reduced how many are awaited, not their cost. The SDK has no `$expand`, aggregates or changeset, which caps what shared reads can join and why multi-request saves stay non-transactional.
- Per-row writes with a guard read each (`updateRecordIfExists`) remain 2 requests per row until the SDK sends `If-Match` (thousands of requests for a CAPEX account deactivation on hundreds of contracts).
- Heavy reads still refetch on every tab return after 30 s (the global default); Cost, Admin and Generators are the screens where it is largest.

## Freshness trade-offs introduced (each reversible, each in D160)

Shared CAPEX chart 30 s (dropped on an in-session account write); currency table 5 minutes; Team directory names 30 minutes; Project Gates names until the dataset entry is dropped; Cost cluster-state name and order and Check List Settings clusters 30 minutes; Generators country 30 minutes; Milestones job-type id 30 minutes; Check List scope id 30 minutes; Land Lease partial failure (same-kind allocation siblings in flight); OPEX imported chains' creation order.

## What the owner must do before this is merged or pushed

1. Decide the OPEX created-on order (keep parallel, or set `OPEX_IMPORT_PARALLEL = false`).
2. Run the DEV smoke tests (each batch's checklist is in D160 §4, §6–§11) and the municipality count (Bayern, empty search term).
3. Answer the E2E parity question (AGENT-GUIDE item 6) and approve a commit shape (one commit per batch or one combined; no push, no co-author trailer, per the standing git rule).
4. Optionally read DEC-1 (two `Round` ports disagree on ties) regardless of this programme.
5. After merging, remove the helper worktrees (`C:\wt-opt\b5, b5p, b6, b7, b8, bm`) with `git worktree remove`.

## Technical recommendations

- Add a tracing-based request-count check to the DEV smoke routine so the counts in `06` can be reproduced from the `[VSB]` console lines.
- Re-evaluate the guarded-update pre-read when the SDK is upgraded (D159 follow-up #9).
- Consider moving the remaining per-module `str/num` variants that differ (`revenues`, admin) behind explicit names so they stop looking like duplicates.
- Run `knip@5` with `PARITY_SCREEN=land-lease` before the DEV push (the checklist in CONVENTIONS) and decide the future of `loadLandLeasePeriods` and the default `"all"` scope of `loadCostBook`.
