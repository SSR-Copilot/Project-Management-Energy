ID | Verdict | Action | Task | Impact | Frequency | Screens | Journey | RootConf | Effort | Regression | DepImpact | Basis
BND-03 | ACTUAL | FIX | T-E01 | 2 | 3 | 3 | 3 | 5 | 1 | 1 | 2 | MEASURED scratch build: Planning -19.9, Grid Operator -19.9, Revenues -19.7, Milestones -19.7 KiB gz; cold cache only; 4 import lines
BND-04 | SHARED-ROOT | FIX | T-E02 | 3 | 3 | 3 | 3 | 5 | 2 | 2 | 2 | MEASURED Milestones 128.1->67.6, Revenues 140.7->103.6, General Data 118.0->77.2 KiB gz (with T-E01); Stage 1 undersized (costBook pull); 3 new small modules + mock seams
BND-05 | ACTUAL | FIX-AFTER-DECISION | T-E07 | 3 | 2 | 1 | 3 | 4 | 1 | 2 | 1 | DERIVED serial chain chunk->init->getToken->flow; flow duration NOT measured; one effect line; flow-call timing is a DECISION
NET-06 | ACTUAL | DEFER | - | 2 | 2 | 1 | 2 | 4 | 3 | 3 | 1 | DERIVED both screens mount (routes.tsx:185), reads differ by columns; cold deep link only; sharing must be in-flight only (freshness)
SAD-01 | UNRESOLVED | MEASURE-FIRST | T-E08 | 3 | 2 | 1 | 2 | 2 | 3 | 3 | 2 | DERIVED env-wide fetchAll, row count never measured (probe P2); fails closed so correctness first
BND-06 | SHARED-ROOT | FIX | T-E01 | 3 | 4 | 5 | 4 | 5 | 1 | 2 | 3 | MEASURED landing 55.6->39.6, 4 cost screens -14.6, 2 admin screens -15/-16, Finance -14 KiB gz; 5 test mock seams + G-REQ baseline
BND-07 | SHARED-ROOT | FIX | T-E01 | 1 | 3 | 3 | 2 | 5 | 1 | 1 | 1 | MEASURED -6.9 KiB gz on Finance/Production/Generators (Stage 1 said 12); two constants move
BND-08 | SHARED-ROOT | MEASURE-FIRST | T-E04 | 3 | 3 | 3 | 3 | 3 | 5 | 3 | 2 | MEASURED facade-only lazy members +6.1 then +1.5 KiB gz (E7/E8): costBook scope coupling is binding; ESTIMATED ceiling 40-50 KiB gz not demonstrated; chunks prefetched at boot
BND-10 | OVERSTATED | DEFER | - | 1 | 4 | 5 | 4 | 5 | 2 | 2 | 1 | MEASURED startup -14.4 KiB gz but screens with FormPanel +18.1, landing +5.1: net -9 landing, +3.7 elsewhere
BND-11 | UNRESOLVED | MEASURE-FIRST | T-E08 | 2 | 4 | 5 | 2 | 3 | 4 | 3 | 1 | MEASURED 80/149 names change on a no-source-change rebuild, vendor chunk gives 78/149; benefit depends on unknown host cache (probe P4)
BND-13 | SHARED-ROOT | FIX-AFTER-DECISION | T-A04 | 2 | 5 | 5 | 3 | 4 | 1 | 2 | 2 | MEASURED Generators closure 113.2 KiB gz/40 files (105.1 after T-E01/02); switch GENERATORS_WARMUP_LAZY exists OFF; owner decision after capture; agent A owns
BND-14 | OVERSTATED | DEFER | - | 1 | 4 | 5 | 3 | 2 | 1 | 2 | 1 | MEASURED 194 KiB min/74.6 gz, parse-only 6.3 ms (Stage 1); contention not measured
BND-16 | NOT-A-BOTTLENECK | ACCEPT | - | 1 | 4 | 5 | 3 | 3 | 3 | 2 | 1 | MEASURED 80 files <3 KB = 90 KiB total, parallel preload map; 155->150 files after T-E01/02; host protocol unknown (probe P4)
BND-18 | SHARED-ROOT | FIX | T-E03 | 2 | 3 | 5 | 2 | 5 | 2 | 1 | 5 | DERIVED 46 data->features imports in 28 files; root of BND-03/04/06/07 and part of BND-08/SCC-19; guard = allowlist test (requestSites pattern)
NET-10 | OVERSTATED | DEFER | - | 1 | 4 | 4 | 2 | 4 | 3 | 3 | 1 | DERIVED one top:1 read per screen in parallel in wave 1; screens select different columns; no wall-clock gain derivable
SAD-02 | ACTUAL | FIX | T-E05 | 2 | 2 | 1 | 3 | 5 | 1 | 1 | 1 | DERIVED one avoidable sequential hop (tabs read) on a cold entry, ESTIMATED 0.18-0.5 s from D144 request cost; 2-line change
SAD-10 | NOT-A-BOTTLENECK | ACCEPT | - | 1 | 2 | 1 | 1 | 4 | 1 | 2 | 1 | DERIVED one small extra read per scope change; switch OFF on purpose (failure coupling, owner decision)
SAD-11 | OVERSTATED | DEFER | - | 1 | 1 | 1 | 2 | 4 | 2 | 3 | 1 | DERIVED six parallel reads, gain = max(6)-max(2) once per 30 min; gating on fewer reads changes the failure screen (DECISION)
SAD-13 | ACTUAL | DEFER | - | 2 | 2 | 1 | 2 | 3 | 3 | 3 | 1 | DERIVED 3-4 dependent waves, bounded by OPT-17; needs a navigation-filter check and DEV wave timings
SAD-15 | NOT-A-BOTTLENECK | ACCEPT | - | 1 | 2 | 1 | 2 | 4 | 1 | 4 | 1 | DERIVED the save-time ownership re-read is a safety check (business check, excluded by rule 3)
SCC-16 | ACTUAL | FIX | T-E06 | 2 | 3 | 1 | 2 | 5 | 1 | 2 | 1 | DERIVED key = whole id list, no placeholder; hook shared with the comments panel so the fix must be opt-in; requests unchanged
SCC-18 | OVERSTATED | DEFER | - | 1 | 3 | 1 | 2 | 4 | 2 | 3 | 1 | DERIVED one request; both reads in wave 2 so reuse needs a wait or a fallback read; UT-COSTWAVE-OPT-001 pins 2 waves/4 requests
SCC-19 | SHARED-ROOT | MEASURE-FIRST | T-E04 | 2 | 3 | 1 | 3 | 3 | 5 | 3 | 1 | MEASURED CAPEX 395-442 KiB min closure; same root as BND-08; cost chunks prefetched beside the session (bootPrefetch)
SPB-06 | UNRESOLVED | MEASURE-FIRST | T-E08 | 2 | 4 | 1 | 3 | 2 | 2 | 2 | 1 | DERIVED catalogue read is in wave 1 parallel with PV types; costs time only above 500 rows; row count unknown (probe P1)
SPB-12 | UNRESOLVED | MEASURE-FIRST | T-E08 | 2 | 4 | 3 | 3 | 2 | 2 | 4 | 1 | DERIVED reads feed Save diff and delete plan, failure counted on purpose; Fabric latency never measured (probe P5)
SPB-14 | ACTUAL | FIX-AFTER-PROBE | T-E08 | 2 | 3 | 1 | 2 | 4 | 1 | 3 | 1 | DERIVED two sequential reads before Delete is enabled, ESTIMATED 0.2-0.5 s; switch omGuardOneRead coded and OFF; safety guard must not fail open (probe P3)
