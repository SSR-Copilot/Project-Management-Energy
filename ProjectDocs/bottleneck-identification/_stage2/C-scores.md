ID | Verdict | Action | Task | Impact | Frequency | Screens | Journey | RootConf | Effort | Regression | DepImpact | Basis
SCC-01 | SHARED-ROOT | FIX | T-C01 | 4 | 4 | 4 | 5 | 4 | 3 | 2 | 4 | 2 waves off every Cost entry (DERIVED, 0.4-1.0 s at D144 unit cost, unmeasured); path traced in source; registry reused by T-C02/T-C03
BND-01 | UNRESOLVED | MEASURE-FIRST | - | 3 | 5 | 5 | 5 | 2 | 5 | 3 | 2 | 302 KiB gz parallel preload, evaluate unmeasured; needs browser capture M-C01
SPB-02 | SHARED-ROOT | FIX | T-C02 | 3 | 3 | 3 | 4 | 4 | 2 | 2 | 2 | 1 wave on Production and Revenues deep link; Finance narrowed by refetchOnMount always
SPB-05 | UNRESOLVED | FIX-AFTER-PROBE | - | 2 | 3 | 1 | 4 | 3 | 1 | 3 | 2 | 1 wave on cold Generators; blocked on Generators probe P2-P5; existing switch
BND-09 | SYMPTOM | FIX | T-C08 | 2 | 5 | 5 | 5 | 3 | 1 | 1 | 1 | blank page is BND-01's wait; markup and CSS only; real benefit depends on host player
BND-12 | OVERSTATED | ACCEPT | - | 1 | 5 | 5 | 3 | 4 | 1 | 2 | 1 | boot-prefetch remedy is a no-op (same turn as first render); ENV_VARS_TOGETHER held by QA-09
BND-17 | ACTUAL | FIX | T-C03 | 1 | 2 | 2 | 2 | 4 | 1 | 1 | 2 | admin chunk starts after session wait; 0.1-0.5 s admin deep link only
RND-08 | OVERSTATED | DEFER | - | 1 | 4 | 4 | 3 | 4 | 1 | 3 | 1 | blink not time (5-27 ms mount MEASURED by Stage 1); product decision D162
SCC-15 | ACTUAL | DEFER | - | 1 | 5 | 1 | 3 | 4 | 2 | 2 | 1 | Add Standard options one wave late; off first-paint path; unsorted key coupling
BND-02 | OVERSTATED | MEASURE-FIRST | T-C04 | 2 | 4 | 5 | 2 | 3 | 2 | 4 | 4 | fires on visibilitychange for stale active queries in background (TanStack source); burst about 4-15 requests; DEC-F
NET-08 | ACTUAL | FIX | T-C04 | 1 | 2 | 4 | 2 | 5 | 1 | 1 | 2 | no gcTime in src (grep); TanStack default 5 min vs 30 min stale; small reference reads
RND-10 | OVERSTATED | DEFER | - | 1 | 2 | 3 | 1 | 2 | 1 | 3 | 1 | short gc conflicts with D51 11.19 inactive-book patch and D165 C6; heap not measured
SAD-06 | SYMPTOM | FIX-AFTER-DECISION | T-C04 | 1 | 2 | 1 | 2 | 5 | 1 | 3 | 1 | preset FRESH_ON_ENTRY_ONCE exists; has-contracts part needs no decision; tree part DEC-F
SCC-14 | ACTUAL | FIX-AFTER-DECISION | T-C04 | 2 | 4 | 1 | 3 | 5 | 1 | 2 | 1 | 1 wave on first category visit older than 30 s; light owner note on 5 min chart staleness
NET-02 | OVERSTATED | FIX-AFTER-PROBE | T-C06 | 2 | 1 | 4 | 3 | 3 | 3 | 3 | 2 | needs a failing chunk; own fan-out is its main cause (NET-04); P-4 and M-C04
NET-04 | OVERSTATED | FIX | T-C05 | 2 | 1 | 4 | 3 | 4 | 2 | 2 | 3 | binds above about 900 contracts per category (repo says a few hundred, unmeasured); zero wave change below 16 chunks
NET-05 | SHARED-ROOT | DEFER | - | 1 | 1 | 5 | 2 | 4 | 3 | 2 | 3 | requestGate referenced only from requestPolicy.ts (grep); latent behind GLOBAL_GATE; R6 with NET-04
NET-16 | ACTUAL | FIX-AFTER-PROBE | T-C06 | 2 | 1 | 5 | 4 | 4 | 3 | 4 | 3 | SDK has no abort or timeout (grep MEASURED); fetchAll bypasses policy so flag would not cover reads; P-5
SCC-11 | ACTUAL | MEASURE-FIRST | - | 3 | 5 | 1 | 5 | 3 | 5 | 4 | 2 | default Cost landing is the Summary tab; volume unmeasured; real fix server side DEC-D
CMP-04 | NOT-A-BOTTLENECK | DEFER | T-C07 | 1 | 1 | 5 | 1 | 5 | 2 | 1 | 2 | MEASURED S2C: invisible to 3500 queued, +3 percent at 15000, one 0.3 s submit stall; dormant
NET-03 | NOT-A-BOTTLENECK | ACCEPT | - | 1 | 2 | 4 | 2 | 5 | 1 | 1 | 1 | SDK has no abort; restart on invalidate is deliberate; lever is the read lane
NET-07 | UNRESOLVED | MEASURE-FIRST | - | 1 | 3 | 2 | 3 | 2 | 1 | 1 | 1 | 17 whole-table reads, row counts unknown; only catalogues and chart can exceed 500 rows
NET-21 | NOT-A-BOTTLENECK | ACCEPT | - | 1 | 5 | 5 | 3 | 4 | 5 | 1 | 1 | platform adds include-annotations (SDK source); not changeable in app
SPB-13 | OVERSTATED | DEFER | - | 1 | 2 | 1 | 2 | 3 | 2 | 1 | 1 | already bounded mapLimit 8 and lazy; narrow columns; counts unknown
