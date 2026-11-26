# 28 - Before and After Performance Benchmark

> 25 Nov 2026. **There is no runtime benchmark.** Nothing in this programme has been run against Dataverse, so no request count, latency, payload size or retry count below was measured. The table of the brief is therefore left empty on purpose; a number appears only where a unit test asserts it, and is labelled as such.

## 1. The brief's table

| Metric | Baseline | Optimized | Improvement |
|---|---|---|---|
| Total API requests | not measured | not measured | - |
| Duplicate requests | not measured | not measured | - |
| Network round trips (waves) | not measured | not measured | - |
| Initial-load requests | not measured | not measured | - |
| Save-operation requests | not measured | not measured | - |
| Bulk processing duration | not measured | not measured | - |
| Average API response time | not measured | not measured | - |
| P95 API response time | not measured | not measured | - |
| Request payload size | not measured | not measured | - |
| Response payload size | not measured | not measured | - |
| Data-loading duration | not measured | not measured | - |
| Failed requests | not measured | not measured | - |
| Retry count | not measured | not measured | - |

## 2. What would have to happen to fill it

1. Run the app against `VSBCloud_Dev` (`pa app run`, or `npm run dev` with `pac code run`) with the **same project, user and data** before and after, on two builds: the base commit `30afece` and this branch.
2. For each of the 12 scenarios in doc 25, drive the screen, copy the browser console `[VSB]` lines to a file, and summarise it with `node scripts/request-census.mjs <capture> --scenario <name>` (the census tool added in this programme: requests, duplicates, waves, p95, SLOW, 429/5xx, retries; request sizes need the browser network panel because the app does not log them).
3. Run probes P-1 to P-5 (doc 18), the last of which provokes throttling and should be run with the owner present.
4. Report request count and latency separately: fewer requests do not always mean less time, and the host's round trip per request is a platform constant that this programme cannot lower.

## 3. What the unit tests assert (request counts, not timings)

These are assertions in the new or updated tests, made with mocked services. They show the code does what it intends; they are not a performance result.

| Change | Asserted by test | Where |
|---|---|---|
| Finance tranche Save, header-only edit | child writes 29 to 0 (switch `changedRowsOnly`, shipped OFF) | pma notes, `rules.changedRows.test.ts` |
| OPEX save waves | wave order pinned 4 to 3 (UT-PWOPEX-001), 3 to 2 (006), 5 to 4 (005, 014) | `periodWrites.opex.waves.test.ts` |
| CAPEX paid toggle, panel Save, panel Delete | no whole-category-book reload; patched book equals the reloaded book on 1,100 seeded cases | `capexBookPatch.test.ts` (UT-CAPEXPATCH-*) |
| Add Cost Save | no second refetch of the not-displayed whole-project Summary | capex notes |
| Cost reads (Land Lease, OPEX, Contracts) | one BoP read instead of two; links read with the PATCH; keys once; one OPEX sub-account read | t21 notes, `*.batch2.test.*` |
| Check List | trackings read once per cluster visit | `hooks.dvopt.test.tsx` |
| Retry | a persistent 503 sends 3 requests per row (not 9), a persistent 429 sends 4 (not 16), a failed create sends 1 | `costWrite.stacking.test.ts` (UT-COSTSTACK-*) |

Not changed (so no effect expected): the Generators bulk path stays off, so the code-derived estimate of 63 requests for adding a WTG type with 20 turbines and 2 land-lease costs (about 9 with bulk) is **unchanged**; Land Lease contract delete (44 requests, 7 waves) is unchanged until DEC-A is decided.

## 4. Known limitation

The estimates in doc 03 and doc 25 come from reading the code, not from running it. They can be off where a path depends on data volumes.
