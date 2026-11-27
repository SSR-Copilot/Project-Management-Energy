# 09 - Bundle and initialization bottlenecks (bottleneck identification, Stage 1)

Agent: Architecture + Bundle/Initialization audit (register prefix `BND`, `_register/BND.md`, 18 findings). Companion: `01-application-architecture-analysis.md`.
Base commit `dde9e92`. Read-only audit; nothing under `ProjectCosts-CodeApp/` was changed. Evidence labels: **MEASURED** (I ran it),
**DERIVED** (counted from code), **ESTIMATED** (reasoning). Confidence: CONFIRMED / HIGH / SUSPECTED.

Units: **KiB = 1024 bytes** unless a number is marked "vite kB" (Vite's own reporter uses 1000 and its default gzip level; `scripts/bundle-report.mjs`
prints KiB but labels them "kB", and uses `gzip -9`). Both are given where the orchestrator's baseline quoted vite numbers.

## 1. Scope and method

Inspected: the production build in `ProjectCosts-CodeApp/dist/` (155 JS files, 4 CSS, source maps) built at `dde9e92`; a second build of the same
commit into a scratch folder; `index.html`, `main.tsx`, `app/*` (boot, session, routes, loaders), `vite.config.ts`, the data-module import lines named in the
findings, `appInsights/appInsights.ts`, `platform/azureMapsToken.ts`, the Generators warm-up, and the D162/D119/D165 documents listed in doc 01 section 1.
Method: Vite's preload map and the static `import` graph give each route's cold file set; the source maps (VLQ-decoded) attribute minified output to
packages and source files; `gzip -9` gives compressed size; Node's V8 gives a parse-only time. No browser, no signed-in host and no Dataverse were available,
so no timing involving the network, the host or JS evaluation was measured.

## 2. Measurement and baseline inputs (reproduce every number)

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

## 3. Baseline numbers

### 3.1 Startup (what `index.html` names: entry script plus 7 `modulepreload`, plus one stylesheet)

| File | KiB min | KiB gz (-9) | Main content (MEASURED, output chars) |
|---|---|---|---|
| `index-Bz8NfcTv.js` | 439.7 | 142.7 | react-dom 39.4 %, react-router 21.3 %, query-core 7.0 %, LeftNav 4.7 %, AppHeader 3.4 %, ConfirmDialog 1.5 %, CanvasFields 1.5 %, routes 1.4 %, data/project 1.2 %, plus the preload map of all lazy chunks |
| `fluent-D9EVFh7P.js` | 499.4 | 135.4 | tabster 14.0 %, react-combobox 10.6 %, tokens 10.0 %, menu 5.8 %, icons 5.6 %, button 5.6 %, toast 4.1 %, drawer 3.4 %, positioning 3.4 %, griffel 3.2 %, dialog 3.0 % |
| `requestLog-Cu29ZK0b.js` | 69.7 | 16.4 | `@microsoft/power-apps` 69.8 %, generated `dataSourcesInfo` registry 20.2 %, requestLog/errors/consoleGate 10 % |
| `odata-Y9d-iPLf.js` | 13.3 | 4.3 | `dataverseNames` 31 k source chars, `odata`, `domain/locale` |
| `keys-CMDqpUn2.js` | 4.7 | 1.4 | query key factory |
| `tokens`, `preload-helper`, `rolldown-runtime` | 3.3 | 1.8 | |
| **Total (8 files)** | **1,030.1** | **302.0** | plus `index-DxdthBXx.css` 31.1 KiB / 6.1 KiB gz (render-blocking) |

Fluent is 48.5 % of the startup bytes and the entry (React + router + query + shell) 42.7 %. Parse-only (V8, Node): 31.7 ms median sum (BND-01 evidence).

### 3.2 Largest chunks (MEASURED, `bundle:report --top 45`, KiB min / gz)

| Chunk | min | gz | Main source / role | On the critical path of the first screen? |
|---|---|---|---|---|
| `ProjectMap-Be_t2glR` | 1,658.3 | 427.8 | azure-maps-control; plus CSS 111.8 KiB / 23.9 gz | No: lazy, General Data only |
| `fluent` | 499.4 | 135.4 | Fluent start-up subset | Yes (startup) |
| `index` | 439.7 | 142.7 | entry | Yes |
| `applicationinsights-web` | 194.2 | 74.6 | telemetry SDK | No: after env vars land, when a connection string exists |
| `Screen-DpubSrou` (Finance) | 135.8 | 34.3 | `pm/finance` (Screen 63.7k + rules 58.5k chars) | No |
| `useCostWriteFlight` | 125.1 | 37.5 | Cost facade graph: opexRules 23.6k, addCostSheet 16.5k, contracts rules 16.3k, periodWrites 12.4k, capexWrites 10.7k, contracts 9.5k, savePlan 6.5k chars | No: every Cost screen |
| `Screen-ni7tS4J9` (CAPEX) | 86.4 | 24.4 | `cost/capex-costs` | No |
| `DatePicker` | 76.8 | 20.0 | `@fluentui/react-calendar-compat` | No: with screens that use a date field |
| `Screen-B-1GCA0X` (Generators) | 76.4 | 22.7 | `pm/generators` | No (but warmed up, BND-13) |
| `Screen-D-tfb6nZ`, `Screen-BCiAxgJ7` | 75.1, 74.4 | 22.0, 21.5 | Admin Cost, Admin Contract | No |
| `Screen-CRiFdCfH` (Production) | 71.0 | 19.2 | `pm/production` | No |
| `requestLog` | 69.7 | 16.4 | SDK | Yes |
| `rules-G34u4YRj` | 69.6 | 19.7 | Generators rules (7 modules) | No; shipped to 6 screens (BND-03) |
| `Screen-DjBqOuyo` (Add Cost) | 67.7 | 22.2 | react-spreadsheet 60 % of output | No |
| `Screen-BgDMkne6` (Overview) | 59.3 | 17.5 | `pm/project-main` | Yes for the landing route |

### 3.3 Whole-build composition (MEASURED, `all-bytes.mjs`, 4,907,249 output chars)

azure-maps-control 33.6 %, `features/pm` 15.7 %, Fluent family 14.6 %, `features/cost` 7.0 %, `features/admin` 4.1 %, react-dom 3.6 %,
Application Insights packages about 3.8 %, react-router 1.9 %, generated + `.power` 1.5 %, `@microsoft/power-apps` 1.1 %, react-spreadsheet 0.8 %.
Heavy third-party that a user rarely or never pays for: the map (General Data only), App Insights (after first paint), react-spreadsheet (Add Cost only).

### 3.4 Cold first visit per route

Full table in doc 01 section 5.1 (startup + the route's lazy files). Summary (KiB gz incl. startup): Overview 357.6; Team 339.4; Admin 333-377;
Grid Operator 354.1; Planning 396.2; Check List 390.2; Production 385.8; General Data 420.0 (+ 443 map); Generators 415.2; Finance 409.7; Contracts 421.1;
Milestones 430.1; CAPEX 440.6; Land Lease 444.0; OPEX 444.7; Revenues 442.8; Add Cost 462.8. Chunk count of a cold route: 16-50 lazy files.

## 4. Start-up sequencing (what blocks, what is parallel)

DERIVED from `index.html`, `main.tsx`, `app/bootPrefetch.ts`, `app/SessionContext.tsx`, `data/project.ts`, `data/currentUser.ts`; the Dataverse request counts and waves are
from D165 doc 03 section B.0 (not re-measured). `||` = parallel, `->` = depends on.

**Typical launch from the player (empty hash, no project)**

| Step | What happens | Kind |
|---|---|---|
| 0 | HTML; stylesheet (blocking, 6.1 KiB gz) and 8 JS files fetched in parallel (modulepreload) | parallel |
| 1 | Graph evaluated: fluent, react, router, SDK chunk, then `main.tsx`: `installGlobalErrorLog`, `startBootPrefetch` (line 15) | **gate: BND-01**; the page is blank until React renders (BND-09) |
| 2 | `ensureInitialized()` -> `setConfig` + `getContext()` (host handshake); session query prefetched; the Overview chunk graph (26 files, 159.6 KiB min) starts loading `||` | parallel |
| 3 | `createRoot.render`: `SessionProvider` starts the env-var read 1 (definitions), `App` shows "Please wait..." until the session resolves (`App.tsx:75`) | env var read starts at first render, not boot (BND-12) |
| 4 | `await context` (launch params) -> `bootTarget` -> `prefetchTarget`: dynamic import of `project-main/queries` + `rules` (normally already loaded with the Overview graph), then project page 1 (+ blank-tail probe) `||` countries `||` states | waterfall: context -> reads |
| 5 | Session resolves: `Landing` redirects to `/projects`; `useCurrentUser` starts its chain (user row `||` directory `||` countries -> direct roles `||` teams -> team roles: 3 deep, `parallelUserLookups` on) | parallel with 4 |
| 6 | Env var read 2 (values); then `startAppInsights`: dynamic import of the 194 KiB SDK (BND-14) | env 1 -> env 2 -> SDK (waterfall) |
| 7 | +1.5 s: next Overview page prefetch (2 requests) | speculative |

First usable screen = chunk graph ready AND session resolved AND page 1 answered (step 4). Dataverse: about 14 requests / 3 waves at landing (D165 doc 03).

**Deep link to a PM screen with `projectId`** (`/project/<slug>?projectId=`): step 4 differs: the session project row (scope `pm`, 1 request; the cluster state name
comes from the row's formatted-value annotation) and, with `BOOT_PREFETCH_SCREEN_READS` on, the screen's own first reads start in boot, not after the gate. The shell
shows the blocking overlay until the project row lands (FE-SH-09, held by product). One wave of Cost-only reads is added on Cost deep links: the full project load reads
the row, then country `||` cluster state `||` area (`project.ts:272-283`).

**Deep link to a Cost screen**: the screen's chunk graph starts at boot; the project row is prefetched under the Cost key; the gate (`CostProjectGate`) holds the screen until
the full load finishes; the screen's own reads wait for the gate (CA findings of D165).

**What is lazy and what is prefetched** (DERIVED): all 22 screens lazy; boot prefetch starts the target screen's chunk graph and reads from the URL (`bootPlan`); the Generators chunk and
10 reads start 1.5 s after any PM screen opens (BND-13); the map chunk starts at General Data mount (`Screen.tsx:370`); App Insights starts on env-var arrival; the six admin
screens are not prefetched (BND-17). `pmScreenPrefetch` prefetches reads for 5 of 8 non-General-Data/Generators PM screens (Production, Revenues, Finance not).
Persisted IndexedDB reference data is not on the start-up path (only the Generators catalogue, OFF).

## 5. Findings (register rows `BND-01` ... `BND-18`; priorities in `_register/BND.md`)

### BND-01 (P2, HIGH): the first data request waits for the whole startup JS graph
`main.tsx:3-5` imports `App`, `Providers` and `bootPrefetch` statically; ES modules evaluate only after the whole static graph is fetched, so `startBootPrefetch` (`main.tsx:15`)
and therefore `getContext()` and the first Dataverse read run after 1,030 KiB min / 302 KiB gz (MEASURED) have been downloaded and evaluated. D119 made reads start "before React"
and "beside the host" (its own comment, `main.tsx:13-14`); they still start after the 8-file graph. Parse-only is small (about 34 ms on this machine, MEASURED), so the cost is the download
(on a slow link) plus evaluation (not measurable here). Direction: a minimal boot entry (SDK chunk 69.7 KiB + `powerClient` + `bootPlan`) that begins the handshake and the URL-derived reads while the React/Fluent
graph downloads; or shrink the graph (BND-10, BND-11). Validate with a HAR of a cold load and `timeToAppInteractive`.

### BND-02 (P2, HIGH, PRIOR:OPT-18): focus refetch is on by default
`Providers.tsx:27,30`: `staleTime` 30 s and `refetchOnWindowFocus: true`. After 30 s, returning to the tab refetches every stale active query of the screen. Per-query opt-outs exist
(admin presets, cost book, Check List `quietFocus`). Status: held by decision DEC-3 (multi-user freshness by design). Not measured; the request count per re-focus per screen is the number to capture.

### BND-03 (P2, HIGH): a 69.6 KiB Generators rules chunk ships to Planning, Grid Operator, Revenues and Milestones for two helpers
`planning/rules.ts:42` (`forLanguage`, `textFormat`), `grid-operator/rules.ts:42` (`textFormat`), `revenues/rules.ts:69` (`forLanguage`) import through the Generators rules barrel
(`features/pm/generators/rules.ts`: `export *` of 7 modules). The helpers are defined in `domain/powerFxNumeric.ts:176,187` (moved there by OPT-33/B8). Because only `components` and
`domain` are marked side-effect free (`vite.config.ts:72`), the whole barrel ships: chunk `rules-G34u4YRj` 69.6 KiB min / 19.7 gz (rulesCore 23.4k, plans 10.3k, panelPlans 9.9k, rollback 9.6k,
replacePlans 6.9k, captions 5.6k, display 4.9k chars) is reached by 6 screens; Production and Generators need it (Production through `data/generators`); the other four do not. Milestones
inherits it through `data/revenues` -> `revenues/rules`. The same pattern D162 fixed with `powerFxNumeric` for five PM screens, remaining in three files. Direction: import from `@/domain/powerFxNumeric`.

### BND-04 (P2, HIGH): screen-to-screen data coupling left over from FE-P2-05/06
- `milestones/hooks.ts:40` imports `findCurrency, loadFirstRevenueSubaccount` from `data/revenues`: the Milestones cold visit includes `revenues` 47.3 / 14.0 KiB, `landLease` 46.2 / 13.5, `milestones` data 31.4 / 9.4.
- `data/revenues.ts:34-35` imports `loadCountryInflation, loadCurrencies` from `landLease.ts` (678 lines) and `listRevenueAssumptions` from `milestones.ts`; `currencies.ts` (`loadAllCurrencies`) and `countryInflation.ts` already exist (`landLease.ts:254,339` only wrap them).
- `general-data/hooks.ts:40,43` imports `listChecklistGates` (cancellation path only) and `loadMilestoneDurations` from `costBook` (which imports `loadLeaseBook` from `landLease`, `costBook.ts:77`).
Resulting cold visits: Milestones 430.1, Revenues 442.8, General Data 420.0 KiB gz. Avoidable per screen: Revenues about 23 KiB gz, Milestones about 14 KiB gz (landLease stays through costBook), General Data about 13.5 KiB gz.

### BND-05 (P2, HIGH, PRIOR:FE-P1-01): the map's SAS token is requested only after the 1.7 MB chunk loads
FE-P1-01 (chunk starts with the screen) is done: `Screen.tsx:370`. D162 doc 05 also proposed warming `azureMapsToken()` in the same effect; that part is not applied: the token flow (a Power Automate
run, `data/flows.ts`) is requested from the SDK `getToken` callback (`ProjectMap.tsx:92`) after the chunk is parsed and `atlas.Map` created. First map paint = chunk (1,658.3 KiB / 427.8 gz, CSS 23.9 KiB gz) + parse (36 ms) + init + flow
+ tiles; the token cache answers repeat visits only while more than 10 minutes of its lifetime remain. Flow duration is NOT measured (SUSPECTED seconds). Direction: call `azureMapsToken()` beside `loadProjectMap()`.

### BND-06 (P3, HIGH): General Data's rules module rides along with the shared project-states list
`data/projectStates.ts:14` imports `listProjectStates` from `data/generalData.ts`, which imports `features/pm/general-data/rules` (32.8 KiB min / 10.5 gz; `generalData` 9.4 / 2.4). 13 of 22 screen entries reach
it, including the landing screen (42.2 of its 159.6 KiB lazy bytes) and every Cost route except Contracts. Direction: house `listProjectStates` in the shared module.

### BND-07 (P3, HIGH): Finance, Production and Generators load Add Cost sheet code
`data/bulkSend.ts:48` imports `CAPEX_CONTRACTS`/`CAPEX_COSTS` from `addCostSheetBulk.ts` (which imports `add-costs-from-table/rules.ts`); `generatorsBulk.ts` imports `bulkSend`. Chunk `bulkSend-DuN4yT7C` 36.1 KiB min / 12.2 gz,
reached by 8 of 22 screens. Direction: a small descriptor module imported by both.

### BND-08 (P3, HIGH, PRIOR:FE-C2-08 / FE-P2-07): the Cost facade chunk and Finance monolith are still there
`useCostWriteFlight` 125.1 KiB min / 37.5 gz via `data/costRepository.ts:19-58` (FE-C2-08, deferred in D162) chains `landLease` and `bulkSend`; Finance remains one 135.8 KiB chunk (FE-P2-07, deferred). Cold Cost visits are the heaviest in the app (421-463 KiB gz incl. startup).

### BND-09 (P3, HIGH): blank page until React renders
`index.html:9` is an empty `#root`. The only loading UI is React's "Please wait..." (`App.tsx:75`), so first paint follows BND-01's whole graph. Direction: static CSS-only skeleton in `index.html`.

### BND-10 (P3, HIGH): a closed panel is part of the entry
`App.tsx:24,176` statically imports `ReportProblemPanel` -> `FormPanel` (Drawer) and `TextAreaField`, which is why `react-drawer` and `react-textarea` are in `STARTUP_FLUENT`. Output chars in the entry: ConfirmDialog 6.7k, CanvasFields 6.5k, Fields 4.3k,
FormPanel 2.4k, fieldSkin 1.7k, ReportProblemPanel 2.0k; in `fluent`: react-drawer 17.2k, react-textarea 12.0k. The Overview uses Dialog, Dropdown, Input and MessageBar but not Drawer/TextArea, so about 25 KiB app + 29 KiB Fluent (ESTIMATED, not built) are not needed to paint the landing screen; most other screens need FormPanel soon after.

### BND-11 (P3, CONFIRMED): every release invalidates about half the chunks
Rebuilding the same commit changed 77 of 155 JS file names (2.26 MB of 5.05 MB raw; 688 KB of 1.46 MB gz). Cause: `__APP_BUILD__` (a timestamp) is inlined in the Generators screen chunk; the entry chunk contains the preload map naming every lazy chunk, so the entry's hash changes whenever any chunk's name changes,
and every lazy chunk that imports the entry changes name too (MEASURED: of the 77 changed names, 74 import the entry directly and 3 reference another changed chunk; no unchanged file references a changed one). Stable across the two builds: `fluent`, `requestLog`, `odata`, `keys`, `tokens`, ProjectMap, App Insights. Vendor code (react-dom, router, query: about 300 KiB min) shares the entry with app code, so it is re-downloaded
after each release. Impact depends on how the host caches assets (not measured).

### BND-12 (P3, HIGH, PRIOR:PB-08): environment variables: two sequential reads, started at first render
`ENV_VARS_TOGETHER = false` (`bootDvoptFlags.ts:34`, held by QA-09); the doc comment at lines 18-20 is stale ("default ON"). Not on the first-paint path (`envVarsBlockFirstPaint` false) but they gate App Insights start, the Production console gate and the header labels.

### BND-13 (P3, HIGH, PRIOR:PB-09): the Generators warm-up
`GENERATORS_WARMUP_LAZY = false`: 1.5 s after any PM screen of a valid project opens, the Generators chunk graph (356.6 KiB min / 113.2 KiB gz, 40 files) and 10 reads start. Bundle bytes measured here; request count from D165.

### BND-14 (P3, SUSPECTED): the telemetry SDK starts without yielding
194.2 KiB min / 74.6 gz fetched, parsed (6.3 ms, MEASURED parse-only) and started the moment the env vars land, beside the first screen's chunk and reads (`SessionContext.tsx:87-94`, `appInsights.ts:217`). Direction: idle start; the queue (100 items) absorbs the wait.

### BND-15 (P3, SUSPECTED): shell re-render on every location change
`App.tsx:35` and `LeftNav.tsx:215,384` read `useLocation()`; `App`, `AppShell`, `AppHeader`, `LeftNav` are not `memo`. Each URL change (the Overview writes its criteria to the URL per keystroke; FE-P1-04 was skipped) re-renders the shell. Unprofiled.

### BND-16 (P3, SUSPECTED): many tiny chunks
80 of 155 files are under 3 KB; a cold CAPEX visit fetches 43 lazy files (32 under 3 KB) plus 8 startup files and 2 CSS. Cheap under HTTP/2, costly otherwise; host protocol unknown.

### BND-17 (P3, HIGH, PRIOR:FE-AD-08): admin loaders are outside `screenLoaders`
`routes.tsx:51-56`; no boot prefetch for `/admin/*`; cold admin visits are 23-39 files (31-75 KiB gz lazy).

### BND-18 (P3, HIGH): layering inversion `data -> features/*/rules`
The structural cause of BND-03, 04, 06 and 07 (counts in doc 01 section 10). Direction: a bundle budget per screen closure plus an import guard.

## 6. State of the D162 bundle items (checked against the current source and build)

| D162 id | What it said | Status now | Evidence |
|---|---|---|---|
| FE-SH-04 | barrel members landed in the entry; mark `components`/`domain` side-effect free | **Still fixed** | `vite.config.ts:72`; entry 439.7 KiB min (D162 close: 433.3, +6.4 KiB since) |
| FE-SH-05 | one 760 KiB Fluent chunk preloaded | **Still fixed** | `fluent` 499.4 KiB / 135.4 gz, identical to D162's figure; DatePicker 76.8 / Tab 29.0 / Table / Switch / Radio / Checkbox are lazy chunks |
| FE-C1-01 | react-spreadsheet formula engine (278 kB) | **Still fixed** | no chevrotain/jstat in any chunk; Add Cost chunk 67.7 KiB (`vite.config.ts` alias, `platform/formulaParserStub.ts`) |
| FE-P1-01 | map chunk starts after the screen's reads | **Partly fixed**: chunk starts at mount (`Screen.tsx:370`); the token warm-up recommended in D162 doc 05 is not applied | BND-05 |
| FE-P2-05 | Finance loaded Revenues, Generators, Land Lease | **Still fixed** for Finance (its closure has none of the three) | closure list; new analogues remain in Milestones/Revenues/General Data (BND-04) |
| FE-P2-06 | Production loaded Land Lease | **Still fixed** | Production closure has no `landLease` |
| FE-AD-07 | Admin Contracts loaded Cost Contracts | **Still fixed** | Admin Contract closure: 28 files, no contracts chunk |
| FE-C2-08 | `costRepository` facade chunk graph | **Open** (deferred) | `useCostWriteFlight` 125.1 KiB, BND-08 |
| FE-P2-07 | lazy Finance panels | **Open** (deferred) | Finance 135.8 KiB chunk, BND-08 |
| FE-AD-08 | admin loaders into `screenLoaders` | **Open** (deferred) | `routes.tsx:51-56`, BND-17 |
| note | source maps ship in `dist` | **Still true**, no runtime cost | 26.1 MB of maps |
| D162 startup figure | 1,018.3 KiB min / 297.9 gz, 7 files | **Slightly larger**: 1,030.1 / 302.0, 8 files (+11.8 KiB min, +4.1 KiB gz) | `index` +6.4 KiB; the rest in the small shared chunks added by later work (D164/D165) |

D119 items still true: boot prefetch on (`startupFlags.bootPrefetch`), env vars do not block first paint, App Insights is lazy, the next-page prefetch waits 1.5 s. D141 warm-up still runs (BND-13). D142 persisted catalogue is OFF.

## 7. Checked and found NOT to be a bottleneck

Import-time work (none heavy); duplicate dependencies or duplicated modules (none); the formula engine (aliased out); parse cost of the startup JS (about 34 ms parse-only here); request-log string formatting (1.5 us per request);
query-cache subscription; `SessionContext` fan-out; the react-router weight (a floor); fonts and images; source maps (no runtime cost); persisted reference data (not on the start-up path); the App Insights SDK in the entry (it is lazy);
`react-dom`/`react-router` production builds (no dev strings found in the entry); the `dataSourcesInfo` registry (14 kB output, needed by the SDK client).

## 8. Limitations

- No browser or host: first paint, time to interactive, JS evaluation, request timing, cache behaviour and HTTP version are unmeasured; BND-01, 05, 09, 14, 16 need a HAR and the Performance panel.
- The V8 parse time is Node-side, parse-only, on one machine; browsers add evaluation and are slower on managed laptops.
- Route cold sizes use the static closure plus Vite's preload map; a browser that already has some chunks cached pays less.
- Dataverse request counts and waves in section 4 come from D165, not from a new capture.
- `bundle:report` mislabels KiB as kB and mis-parses `--top N` before the dist argument (tooling note, not a register finding).
- Throwaway scripts live under `_bench/BND/` and were not run in CI.
