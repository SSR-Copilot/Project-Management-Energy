# 13 — Measurement and performance baseline

> Stage 1, 26 Nov 2026, commit `dde9e92`, Windows 11, Node 24.22.3, npm 11.19.1. Everything here was either run in this audit (MEASURED, with the command) or taken from an earlier repo document (RECORDED, with the document). Nothing is estimated in this document. **There is no browser, host or Dataverse measurement from this audit**: see section 4.

## 1. Build and bundle (MEASURED, orchestrator run and re-measured independently by the bundle agent)

| Measure | Value | How |
|---|---|---|
| `npm run build` wall time | 23.8 s (the Vite stage alone 2.5 s reported, 9.1 s measured by the bundle agent without `tsc -b`) | `npm run build` from `ProjectCosts-CodeApp/` |
| `index` chunk | 450.27 kB / 147.78 kB gzip | Vite report |
| `fluent` chunk | 511.40 kB / 140.04 kB gzip | Vite report |
| `applicationinsights-web` chunk | 198.85 kB / 77.23 kB gzip | Vite report |
| `ProjectMap` chunk (lazy, General Data) | 1,698.09 kB / 442.95 kB gzip | Vite report |
| Start-up closure | 1030.1 KiB min / 302.0 KiB gzip in 8 files | `npm run bundle:report` |
| Start-up growth since D162 | +11.8 KiB min / +4.1 KiB gzip | BND audit, doc 09 section 6 |
| V8 parse-only of the start-up files | about 34 ms | BND throwaway script |
| JS files in the build | 155 (80 under 3 KB); a cold CAPEX visit fetches 43 lazy files | BND-16 |
| Rebuilding the same commit renames | 77 of 155 chunks (2.26 of 5.05 MB) | BND-11, CONFIRMED |
| Duplicate packages across chunks | none | BND audit |

## 2. Computation (MEASURED, Node, synthetic data)

| Measure | Value | Source |
|---|---|---|
| Add Cost prepare, 15,000 rows | 27-28.5 ms; load-side build about 95 ms; `gridRows` 2.8-20 ms | `prepare.bench.test.ts` (CMP, SCC audits) |
| CAPEX grid `parseDatasetToTree` per repaint | 6.8 ms at 96 records, 32 ms at 570, 112 ms at 1,900 (CMP); 13 / 47 / 126 ms at 300 / 1,000 / 3,000 contracts, cold first call 45 / 125 / 799 ms (SCC) | CMP-01 / SCC-03 |
| Structural sharing walk per refetch | 20 ms at 60k payment objects, 35 ms at 100k; about 10% over stock TanStack | CMP-03 |
| Request gate, 3,500 / 15,000 queued writes | 228 ms / 3.5 s (quadratic; dormant while `GLOBAL_GATE` is false) | CMP-04 |
| Production/Revenues/Finance/Generators pure calculations | worst case 24.6 ms (generation plan, 800 turbines), others under 3 ms | SPB audit |
| Admin pure derivations | 0.5-18 ms at 3,000-5,000 rows | SAD audit |
| Telemetry per request, Production | about 10-26 µs (two runs, 2.7x apart) | NET audit |

## 3. Rendering and memory (MEASURED, jsdom with React's dev build: relative values only)

| Measure | Value | Source |
|---|---|---|
| Municipality combobox open, 2,000 / 5,000 options | 326-407 ms / 762-859 ms; about 83 ms per commit afterwards | RND-14 |
| Overview filter box per keystroke | 5.8-6.9 ms URL-driven against 0.7-0.8 ms with local state | RND-01 |
| Fluent Tooltip mount | about 0.34 ms each (admin gates and check-list screens create thousands) | RND-04 |
| Overview Fluent Table against plain markup, mount | about 2.5x | RND-05 |
| Add Cost grid retained heap | 8.2 MB typical (32,886 cells), 63.8 MB stress (239,526 cells), six or more copies of the sheet | MEM-02, CONFIRMED |
| Add Cost drawn window | 207-214 MB in jsdom against 60.8 MB for 14,224 plain jsdom elements: **not a browser number** | MEM-03, SUSPECTED |
| Query data held (no `gcTime`) | 4.7 MB typical sheet, 36.7 MB stress | MEM-01 |
| Mount/unmount cycles of the CAPEX grid and Add Cost grid (25 each) | net listeners 0, observers 0, timers 0, heap back to baseline | MEM audit: no leak found |

## 4. Network and requests

| Measure | Value | Basis |
|---|---|---|
| `fetchAll` sites | 157 (152 at 500 rows per page, 5 at 5,000, 17 without a filter) | MEASURED by grep (NET audit) |
| Request and round counts per action | Check List row action 3 rounds / 3 requests; Move to next cluster 11 rounds / 37 requests; CAPEX tab 3 waves / 5 requests; OPEX book 2 waves / 4 requests; Production first save 22 rounds at 30 turbines, 109 at 200 (831 requests) | MEASURED by the repo's own harness tests (rounds and requests, not time) |
| Add Cost save, 60-96 rows | 9.5 s before bulk, 1.6-1.9 s after; with new contracts 1,916 ms | RECORDED live on DEV (D51, `17-ADDCOST-SAVE-PERF-PLAN.md`) |
| Generators add type, 20 turbines | 3.0-3.7 s, 44-45 requests; Replace 5.6-6.3 s | RECORDED live on DEV (D144, `GENERATORS-READ-PERF-DEV-PROBE.md`) |
| Per-request unit cost on DEV | 0.18 s trivial, 0.25-0.5 s write, 0.45-0.85 s `vsb_projects` roll-up PATCH | RECORDED (D144). D144 says it was not run on DEV, so this may predate what is deployed |
| Overview page payload | about 540 kB per 200-row page | RECORDED (D119 HAR) |
| Power Automate flow duration | **not recorded anywhere in the repo** | gap |

## 5. What is NOT measured (limits of this baseline)

1. Any browser timing: first paint, time to interactive, long tasks, React commit durations, heap snapshots. A Chrome Performance and Memory capture of the screens below is the first thing Stage 2 should request.
2. Live Dataverse and host latency per request, by environment. D165's probes P-1 to P-5 were never run.
3. Real row counts per project (contracts per category, months per contract, turbines, revenue volumes, checklist items, municipality lists). Volume-dependent findings are formulas, not totals.
4. Flow run times (Check List approval flows, Generators permission-cancellation, Azure Maps token, Fabric sync).
5. HTTP protocol and caching headers of the Power Apps host (affects BND-11 and BND-16).
6. Application Insights production telemetry (D161): the first place to look for real latency by screen.

## 6. Reproducing the bundle numbers (from doc 09 section 2, written by the bundle agent)

All commands run from `ProjectCosts-CodeApp/` unless stated; `BND=../ProjectDocs/bottleneck-identification/_bench/BND` (throwaway scripts, read-only on `dist/`).
Run `npm run build` first if `dist/` is missing (this audit used the build already in `dist/`, dated 26 Nov 2026 12:10).

| # | What | Command | Result at `dde9e92` |
|---|---|---|---|
| 1 | Build time, full | `npm run build` (= `tsc -b && vite build`) | not re-run (orchestrator observed 23.8 s) |
| 2 | Build time, vite only (no `tsc`), without touching `dist/` | `time npx vite build --outDir <scratch-dir> --emptyOutDir` | vite "built in 9.10s"; wall 19.6 s including `npx` start. ESTIMATED: the `tsc -b` share is the remainder of the orchestrator's 23.8 s |
| 3 | Startup JS (files named by `index.html`) | `npm run bundle:report` | 8 files, **1030.1 KiB min / 302.0 KiB gz** |
| 4 | Same, exact bytes | `node scripts/bundle-report.mjs dist --json` | startup 1,054,810 min / 309,287 gz bytes; 155 chunks |
| 5 | Largest chunks | `node scripts/bundle-report.mjs dist --top 45` (NOTE: pass `dist` first: `--top 40` alone makes the script treat `40` as the dist folder and fail with ENOENT) | section 3.2 |
| 6 | Vite's own sizes (kB = 1000, default gzip) | the table `vite build` prints | index 450.27 / 147.78; fluent 511.40 / 140.04; applicationinsights-web 198.85 / 77.23; ProjectMap 1,698.09 / 442.95; useCostWriteFlight 128.11 / 38.77 |
| 7 | JS / CSS / map totals | `cat dist/assets/*.js \| wc -c`; same for `*.css`, `*.map` | JS 5,051,449 B (155 files); CSS 160,089 B (4); maps 26,109,885 B |
| 8 | File-size histogram | `ls -l dist/assets/*.js \| awk '{s=$5; ...}'` (see `_bench`) | under 3 KB: 80; 3-10 KB: 26; 10-50 KB: 31; 50 KB and over: 18 |
| 9 | Per-route cold bytes (startup + preload map + static closure) | `node $BND/route-table.mjs dist` ; per-entry detail `node $BND/closure.mjs dist` ; chunk list of one entry `node $BND/list-closure.mjs dist Screen-XXXX.js` | doc 01 section 5.1; `_bench/BND/route-table.out.md`, `closure.out.txt` |
| 10 | Which screens statically reach a chunk | `node $BND/who-has.mjs dist <chunk>.js` | BND-03/04/06/07 |
| 11 | Output bytes of a chunk by source package/file (source-map VLQ) | `node $BND/map-bytes.mjs dist <chunk>.js 20` ; whole build: `node $BND/all-bytes.mjs dist` | section 3.3 |
| 12 | Duplicate packages / sources across chunks | `node $BND/dups.mjs dist` | 1,412 sources, 76 packages: none duplicated |
| 13 | V8 parse-only time (Node, not a browser, no evaluation) | `node --experimental-vm-modules $BND/parse-time.mjs dist 15 ProjectMap-Be_t2glR.js applicationinsights-web-vX_rSF21.js` | startup 8 files 31.7 ms median sum / ~34 ms first run; ProjectMap 36 ms; App Insights 6.3 ms |
| 14 | Same-commit rebuild: how many chunk names change | build twice (command 2 into a scratch dir), then `node $BND/rebuild-diff.mjs dist <scratch-dir>` | 77 of 155 names changed |
| 15 | Per-request log formatting cost | `node $BND/shorturl-bench.mjs` | 1.5 us per call |
| 16 | Static startup requests of a cold landing | DERIVED from 3 and 9 | 1 HTML + 1 CSS + 8 JS + 26 lazy JS = about 36 |

Machine and tool versions: Windows 11, Node 24.22.3, Vite 8.2.2, rolldown build. Absolute timings (rows 2, 13, 15) are machine-dependent; byte counts are exact and
reproducible. The build embeds `__APP_BUILD__` (a timestamp), so hashes differ per build while sizes stay the same (hashes in this document are from the `dist/` of 12:10).
