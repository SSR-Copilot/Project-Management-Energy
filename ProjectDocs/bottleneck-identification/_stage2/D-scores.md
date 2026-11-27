ID | Verdict | Action | Task | Impact | Frequency | Screens | Journey | RootConf | Effort | Regression | DepImpact | Basis
---|---|---|---|---|---|---|---|---|---|---|---|---
RND-02 | ACTUAL | FIX-AFTER-DECISION | T-D01 | 3 | 3 | 1 | 2 | 4 | 2 | 3 | 3 | request per keystroke DERIVED from hooks.ts:182-195; list remount jsdom only; parity DEC-6 (canvas DelayOutput true, removed 3 Nov by user); client filter 0.05-0.23 ms MEASURED
RND-14 | UNRESOLVED | MEASURE-FIRST | T-D01 | 3 | 3 | 1 | 2 | 2 | 4 | 4 | 1 | 0.17 ms per Option jsdom dev only (no layout); windowing risks keyboard and a11y; needs BM-01
RND-01 | OVERSTATED | MEASURE-FIRST | T-D00 | 2 | 5 | 2 | 3 | 3 | 2 | 2 | 1 | session context memoised on primitives so only shell and routes re-render; 0.67 ms AppHeader jsdom dev; URL input pinned by UT-OVUI-047 / UT-OVFIX-060; needs BM-02
CMP-01 | ACTUAL | MEASURE-FIRST | T-D02 | 2 | 4 | 1 | 3 | 4 | 2 | 2 | 2 | same dataset re-parsed per fold (GridRenderer.js:165); 6.8-112 ms Node synthetic; mutation trap in applyStandardContractOptions; browser share unknown (BM-03)
CMP-02 | UNRESOLVED | MEASURE-FIRST | T-D02 | 2 | 4 | 1 | 3 | 2 | 3 | 3 | 1 | 2 forced layouts DERIVED from read/write order (GridRenderer.js:276-337); never measured; vendored renderer
CMP-03 | NOT-A-BOTTLENECK | ACCEPT | - | 1 | 3 | 4 | 2 | 5 | 1 | 4 | 1 | 20-35 ms per large refetch MEASURED; keeps unchanged refetch from re-rendering; CA-31 depends on it
CMP-05 | OVERSTATED | DEFER | - | 1 | 2 | 1 | 3 | 5 | 1 | 1 | 1 | 13-60 ms once per Save in a 1.6-1.9 s path (D51 RECORDED); 3-line early return if file is open anyway
CMP-06 | ACTUAL | MEASURE-FIRST | T-D03 | 2 | 3 | 1 | 3 | 4 | 2 | 2 | 1 | real-browser D140 record: first key 141-155 ms vs 21-28 ms; idle pre-pass with the same predicate (SpreadSheet.tsx:524); BM-06
CMP-07 | NOT-A-BOTTLENECK | ACCEPT | - | 1 | 3 | 1 | 3 | 5 | 4 | 4 | 1 | 90 ms only at 15,000 rows MEASURED; typical 210 rows; contains the D51 identity round trip
CMP-09 | NOT-A-BOTTLENECK | ACCEPT | - | 1 | 5 | 5 | 2 | 5 | 1 | 1 | 1 | 1.85 us vs 0.69 us per call MEASURED; 2-6 ms per 1,000 cells
MEM-02 | OVERSTATED | ACCEPT | - | 1 | 3 | 1 | 2 | 4 | 3 | 4 | 1 | 8.2 MB typical / 63.8 MB stress MEASURED node; copies serve the D51 safety net
MEM-03 | UNRESOLVED | MEASURE-FIRST | T-D00 | 3 | 3 | 1 | 3 | 1 | 3 | 2 | 2 | 207-214 MB is jsdom fallback window with no layout; D140 records 748 real cells; knobs OVERSCAN_* exist; BM-05
MEM-04 | NOT-A-BOTTLENECK | ACCEPT | - | 1 | 3 | 1 | 1 | 4 | 1 | 2 | 1 | token strings per filter/sort, cleared per table on writes (client.ts:299-305); well under 1 MB DERIVED
RND-04 | UNRESOLVED | MEASURE-FIRST | T-D05 | 2 | 2 | 3 | 2 | 3 | 3 | 3 | 1 | 0.34 ms per Tooltip jsdom dev; 1,000-1,500 instances is a D162 estimate; shared RowActions/DisabledReason covers most sites; BM-08
RND-05 | UNRESOLVED | DEFER | - | 2 | 5 | 1 | 4 | 2 | 4 | 4 | 1 | Fluent Table 2.5x plain in jsdom dev; 540 kB payload per page dominates; a11y and Tosca ids; seen free in BM-02
RND-06 | OVERSTATED | ACCEPT | - | 1 | 4 | 4 | 2 | 3 | 2 | 2 | 1 | 0.76 ms per parent re-render, 5 closed panels, jsdom dev
RND-07 | UNRESOLVED | MEASURE-FIRST | T-D06 | 2 | 3 | 5 | 2 | 2 | 2 | 1 | 1 | 116 ms vs 22 ms jsdom dev includes JIT warm-up; Griffel share unseparated; BM-10
RND-09 | ACTUAL | FIX | T-D04 | 1 | 1 | 1 | 1 | 5 | 1 | 1 | 1 | 10 renders gave 10 trace entries MEASURED; only Gates of 8 QueryStates sites traces; telemetry integrity not speed
RND-10 | OVERSTATED | DEFER | - | 1 | 2 | 5 | 1 | 3 | 1 | 3 | 2 | gcTime unset DERIVED; D165 rule C6 keeps it default; collides with agent C freshness policy; one project per tab
RND-11 | OVERSTATED | ACCEPT | - | 1 | 3 | 1 | 2 | 4 | 1 | 1 | 1 | one extra render per open DERIVED; seeded-once guard protects edits
RND-12 | NOT-A-BOTTLENECK | ACCEPT | - | 1 | 2 | 5 | 1 | 4 | 2 | 2 | 1 | latent; useStableCallback used 96 times to compensate; no affected consumer today
RND-13 | UNRESOLVED | DEFER | - | 1 | 3 | 3 | 2 | 2 | 3 | 4 | 1 | about 20 :has() rules scoped to panel roots DERIVED; canvas visual parity; recorded free in BM-11
SAD-17 | UNRESOLVED | MEASURE-FIRST | T-D00 | 1 | 2 | 1 | 1 | 2 | 2 | 2 | 1 | D162 FE-AD-09 trigger 16 ms never profiled; BM-07
SCC-20 | UNRESOLVED | MEASURE-FIRST | T-D00 | 2 | 4 | 1 | 3 | 2 | 3 | 2 | 1 | D162 FE-C1-07 trigger 8 ms never profiled; PcfGrid already value-guarded; BM-07
SCC-21 | SYMPTOM | ACCEPT | - | 1 | 3 | 1 | 2 | 3 | 3 | 4 | 1 | same copies as MEM-02, no heap measured; close with MEM-02
SPB-17 | UNRESOLVED | MEASURE-FIRST | T-D00 | 2 | 3 | 2 | 3 | 2 | 3 | 2 | 1 | calculation under 1 ms MEASURED node; render cost jsdom dev only (D146 30 ms); BM-07
