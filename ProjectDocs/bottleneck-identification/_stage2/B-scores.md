ID | Verdict | Action | Task | Impact | Frequency | Screens | Journey | RootConf | Effort | Regression | DepImpact | Basis
---|---|---|---|---|---|---|---|---|---|---|---|---
SPB-01 | ACTUAL | FIX-AFTER-PROBE | T-B01,T-B02 | 4 | 2 | 1 | 4 | 4 | 3 | 3 | 2 | Plan shape pinned by UT-PRODPLAN-003/004 (22 / 109 rounds); 13 / 56 with 16 wide and 6 with bulk allocations from the S2B model; seconds DERIVED from D144 unit costs; once per project
NET-13 | OVERSTATED | FIX-AFTER-PROBE | T-B03 | 3 | 2 | 1 | 3 | 4 | 3 | 4 | 2 | S2B model: bulk is slower than singles at N=20 L=1 (2.3 s vs 2.0 s) and 3-5x faster from about 100 rows; DEV test plan never run
NET-14 | OVERSTATED | MEASURE-FIRST | T-B06 | 2 | 1 | 1 | 1 | 3 | 3 | 3 | 1 | Critical path is the 16-wide delete phase (no bulk delete exists); zero phase halves with a chunked guard; volumes never counted on DEV
SCC-02 | OVERSTATED | FIX-AFTER-PROBE | T-B04 | 3 | 2 | 1 | 2 | 4 | 1 | 3 | 1 | Rounds by formula (P=58: 17 at width 4, 10 at 8, 6 at 16); cascade measured 5.2 s for one contract in D51 so it is no clear win; GB-13-style timing missing
SAD-05 | ACTUAL | FIX | T-B07 | 1 | 1 | 1 | 1 | 5 | 1 | 1 | 1 | Source read: no unload guard on cleanUpInBackground; holdBeforeUnload exists (CA-03 pattern)
SAD-07 | SHARED-ROOT | FIX-AFTER-DECISION | T-B06 | 3 | 3 | 4 | 2 | 5 | 2 | 3 | 4 | client.ts:469-495 GET then PATCH per row; 2n requests and 2 x ceil(n/8) latencies become n + ceil(n/40) and 1 + ceil(n/8); DEC-7 race acceptance open
SAD-08 | SYMPTOM | FIX-AFTER-DECISION | T-B06 | 2 | 2 | 1 | 1 | 4 | 2 | 2 | 1 | Symptom of SAD-07 plus width 4 by design (one flow run per PATCH); delete-first-of-30: 59 requests / 18 latencies become 32 / 11
SCC-04 | OVERSTATED | DEFER | - | 1 | 5 | 1 | 2 | 4 | 2 | 3 | 1 | Fire-and-forget (onSuccess 8.1 ms measured in D51 timeline); duplicate background read only; D51 11.19 made the confirming read deliberate
SCC-06 | ACTUAL | FIX | T-B05 | 2 | 4 | 1 | 3 | 4 | 1 | 2 | 1 | landLease.ts:580-586 serial guards; 1-2 read hops saved per panel Save; guard failures keep per-step semantics (UT-LLDVOPT-003/003b)
SCC-07 | ACTUAL | FIX-AFTER-DECISION | T-B09 | 3 | 4 | 1 | 3 | 4 | 3 | 3 | 1 | useCostBook.ts:379-381 awaits a 2-wave reload (4 requests); same trade as Production D108 / Generators D144; needs refreshing guard
SCC-08 | OVERSTATED | DEFER | - | 2 | 1 | 1 | 1 | 3 | 2 | 3 | 1 | Canvas deletes explicitly (LL:6076-6087) so explicit is parity; cascade saves at most 4 rounds (about 1.6 s) against unknown server cascade time; DEC-A held
SCC-09 | ACTUAL | FIX | T-B05 | 3 | 2 | 1 | 3 | 4 | 1 | 2 | 2 | leaseTierWidth 8 for allocation creates and updates; 16 wide gives 5 to 3 rounds at A=40 with no new write path; bulk adds about 0.4 s more only
SCC-12 | OVERSTATED | DEFER | - | 1 | 2 | 1 | 2 | 5 | 2 | 3 | 1 | Gain is the second hop measured at 556 ms (D51 11.16); deep insert is an unprobed per-contract POST shape
SCC-13 | UNRESOLVED | MEASURE-FIRST | - | 2 | 1 | 1 | 2 | 2 | 4 | 3 | 1 | L and XL seconds are inferred in 17-ADDCOST-SAVE-PERF-PLAN; needs the P0.3 chunk probe
SPB-04 | OVERSTATED | MEASURE-FIRST | - | 2 | 1 | 1 | 1 | 4 | 2 | 4 | 1 | Stage 1 used the pre-D144 baseline; D144 live DEV after-numbers exist: Replace type 4.30 s, Replace PV 3.78 s
SPB-07 | ACTUAL | FIX-AFTER-DECISION | T-B10 | 3 | 2 | 1 | 2 | 4 | 3 | 4 | 1 | UT-REVPERF-100/101: 36 / 36 volumes are 7 rounds; changed-only write gives 2-3; bulk gives no gain (S2B model)
SPB-08 | ACTUAL | FIX-AFTER-DECISION | T-B11 | 2 | 3 | 1 | 2 | 5 | 1 | 3 | 1 | financePerf.bench.test.ts run: edit 34 req / 6 rounds; bulkSchedules 11 / 8; changedRowsOnly is built and OFF pending product approval
SPB-09 | ACTUAL | FIX-AFTER-DECISION | T-B08 | 2 | 4 | 2 | 3 | 4 | 2 | 3 | 2 | usePlanWrite.ts:216-221 awaits the reload unless refresh is background; one read round (0.2-0.5 s) per Revenues or Finance save
SAD-03 | ACTUAL | DEFER | - | 1 | 3 | 1 | 1 | 4 | 1 | 2 | 1 | One awaited locks read per toggle; canvas Refresh parity (DCS:621)
SAD-09 | ACTUAL | DEFER | - | 1 | 2 | 1 | 1 | 4 | 1 | 3 | 1 | Up to 18 requests on a Period-1 edit; canvas parity and owner confirmation S6-07 deferred
SAD-14 | NOT-A-BOTTLENECK | ACCEPT | - | 1 | 3 | 1 | 1 | 4 | 1 | 1 | 1 | The refetch is the freshness rule of the panel (opens only on current values); one small read per Edit
SPB-10 | NOT-A-BOTTLENECK | ACCEPT | - | 1 | 4 | 1 | 3 | 4 | 3 | 4 | 1 | Every awaited step protects a standing property (D108/D145); D145 already cut the safe levers
SPB-15 | ACTUAL | DEFER | - | 2 | 5 | 1 | 3 | 5 | 1 | 4 | 1 | D144 measured 0.45-0.85 s roll-up PATCH; skipping it may remove a signal the Fabric flow relies on (product decision)
