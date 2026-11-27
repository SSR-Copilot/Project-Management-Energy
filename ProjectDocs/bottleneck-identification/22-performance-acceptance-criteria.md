# 22 — Performance acceptance criteria

> Stage 2, 26 Nov 2026. A change is accepted only when its before/after evidence is comparable and its tests and gates pass. There is no recorded performance budget in the repo; the thresholds in section 3 are **proposed by agent D and need the owner's ratification**.

## 1. Global gates (every task)

1. `npm run verify` green in the task's worktree (data-source gate, typecheck, lint, control-label gate, canvas-identity gate, full suite, build).
2. No new control without `aria-label` and `data-testid` (rule 16); no new visible string outside a `MSG` object; `DIVERGENCE:` + `…CanvasParity` twin + test + 02-OPEN-DECISIONS entry for any canvas difference.
3. Console trace lines (`[VSB]`) present for any new or changed call (rule 23); `consoleGate` respected in Production.
4. Knip and the duplicate audit show no new unused files or byte-identical files; `requestSites.test.ts` (G-REQ) baseline updated only where a task moves a request site, with the reason.
5. `ProjectDocs/app-docs/13-CODE-APP-IMPROVEMENTS-OVER-CANVAS.md` updated for every improvement over the canvas before any commit; the E2E parity question is asked before any commit, as the project rules require.
6. A before/after measurement taken the same way (same data, same method) and recorded in doc 26. **No improvement is claimed without it.**

## 2. Per-task criteria

| Task | Metric and how it is captured | Pass rule | Tests to extend or add |
|---|---|---|---|
| T-A01 | Rounds and requests per row click, from checklistVisit.bench S1 | 3/3 to 2/2; rows still correct after a write; no extra reads | checklistVisit.bench, UT-CHKPERF-* |
| T-A02 | Rounds/requests for Move (S4) | 11 to 10 rounds, about 4 fewer requests; write order unchanged (new write pin) | UT-CHKPERF-004 split |
| T-A03 | Rounds for Request Approval/Cancel (new S7/S8); flow ms from DEV [VSB] lines | 1 round fewer; flow ms recorded per mode | new S7/S8 |
| T-B01 | Awaited rounds in the generation plan | 30 turbines 22 to 5; 200 turbines 109 to 5; rows and owning BU identical on DEV; no 429 | generationWaves.test.ts |
| T-B02 | Requests for 200 turbines | 831 to about 39 | generationBulk.test.ts (new) |
| T-B03 | Save time for 20 and for 100+ turbines on DEV | Not slower than singles at 20 (gate keeps singles); faster from about 64 rows | bulkAllocations.test.ts, bulkTurbines.test.ts, saveLatency.test.ts |
| T-B04 | Rounds at 58 months | 17 to 10; no 429 on DEV | bulkTuning.test.ts, capexWrites.bulk.test.ts |
| T-B05 | Rounds at 40 allocations | 5 to 3; no 429 | landLease.dvopt.test.ts, landLeaseRules.tiersWider.test.ts |
| T-B06 | Requests and latency for n rows | 2n to n + n/40 | adminRowWrites .opt tests |
| T-B08/09 | Reads awaited before the dialog closes | 0 (was 1 wave; Land Lease 2 waves/4 requests); a busy guard blocks conflicting actions | usePlanWrite tests, Screen tests |
| T-B10/11 | Writes per Save for unchanged volumes/tranches | Only changed rows written | rules tests |
| T-C01 | Waves before first Cost read on a deep link | 2 fewer; browser time from M-C01 before and after | costReadPath.waves.test.ts, pmScreenPrefetch tests |
| T-C02/03 | Waves on Production/Revenues deep link and on first in-app visit | 1 fewer; bounded speculative requests logged | pmScreenPrefetch.screens.test.tsx |
| T-C04 | Cache survival of reference data across navigation | Reference data not refetched within its stale time; Add Cost patching unaffected | costReadPath.waves.test.ts |
| T-C05 | Peak in-flight reads | At most 16 for the 17 id-chunk sites | new readChunks test, concurrency tests |
| T-E01/02 | Gzip bytes per first screen | Landing about -16 KiB; Planning/Grid/Revenues about -20; Milestones 128 to 68; General Data 118 to 77 | bundle:report before/after; requestSites.test.ts baseline |
| T-E03 | Data-to-features import edges | Does not grow beyond the allowlist | importGraph.test.ts |
| T-E05 | Hops on cold Check List Settings | One fewer | Screen.test |
| T-D04 | Trace entries per error render | 1, not one per render | Screen.test (UT-ADGATE style) |
| T-D01 | Requests per typed word and BM-01 open time | k to about 1 or 0; keep only if the browser rule below passes | general-data tests |
| T-D02/03/05/06 | Browser metric from the BM scenario for each | Keep only if median gain is at least 20 % and 10 ms with p90 within +5 % | BM-03/04, BM-06, BM-08, BM-10 |

Request, round and byte counts are **machine-independent** and pinned in tests. Wall-clock seconds are recorded on DEV with the `[VSB]` lines and are not part of a pass/fail rule until probe P-0 states the unit cost.

## 3. Proposed thresholds for browser measurements (to ratify)

- Discrete interaction (click, open panel): 200 ms (INP-style bar) at 4x CPU slowdown.
- Per keystroke in a controlled input: 100 ms at 4x CPU slowdown.
- Keep a change only if the **median gain is at least 20 % and 10 ms** and **p90 is no worse than +5 %**, over the number of runs in the protocol.
- Bundle: a change must not raise the start-up closure (302 KiB gz baseline) and each first-screen saving is checked with `bundle:report` before and after.

## 4. Browser measurement protocol (agent D, section "Browser measurement protocol")

This is the protocol doc 22 should reuse. It extends the owner's DEV routine in `07_Implementation_Roadmap.md` section 4 (Profiler, Memory tab, Network tab), which was never recorded, and it uses seams that already exist in the repo. **All thresholds below are proposals for the user to ratify: the repo records no performance budget** (searched `frontend-optimization/` and `dataverse-network-performance-optimization/`; no INP, long-task or budget statement found).

##### 6.1 Rules for every run

1. **Build.** A production build. Never `npm run dev` (React dev build, `StrictMode` runs every effect and render twice, `main.tsx:21`). Use the deployed DEV build, or `npm run build` and serve `dist/` on a local port behind `pac code run --appUrl <that url>`; open the `apps.powerapps.com/.../app/local?...` URL it prints (AGENT-GUIDE). Keep `dist/*.map` reachable so DevTools shows real function names (the build has 26 MB of source maps, doc 13).
2. **Machine.** One named machine, plugged in, high-performance power plan, a clean Chrome profile with no extensions, DevTools docked, window 1920 x 1080 at 100 % zoom, no other heavy tab. Record CPU, RAM, Chrome version, build id (`__APP_BUILD__`) and date in the result sheet.
3. **Two CPU profiles.** T1 = no throttling. T4 = DevTools "CPU: 4x slowdown" (a proxy for the low-end client; record that the factor is relative to this machine, or use the calibrated preset if the Chrome version offers it). Decisions are taken on T4; T1 is reported beside it.
4. **Network.** Not throttled. Render metrics are main-thread slices (Scripting, Rendering, Painting), never time-to-data, so DEV latency does not enter them. Network metrics (BM-01) count requests and bytes, not seconds.
5. **Data.** Named reference projects, nominated by the owner, described by size, **never by id in any file** (TESTING-AND-HARNESS rule; ids live only in environment variables such as `PARITY_READ_PROJECT_ID` and are printed masked). Log the row counts of each (contracts, records, sheet rows, tasks, municipalities) in the result sheet so a later run is comparable.
6. **Runs.** For per-interaction metrics: 1 warm-up discarded, then 10 measured interactions in one session; report median and p90. For first-in-session metrics (BM-06, BM-10): 5 fresh tabs, first interaction only. For an A/B of a change: baseline and variant built from the same commit pair, served from the same host, run alternately (A B A B A B), at least 5 pairs.
7. **Idle.** Before each measurement wait for the app to be idle. `window.__vsbIdle()` exists when `localStorage.__vsbE2E = "1"` is set **before** the app loads (`platform/e2eHook.ts`; it has no effect for normal users); otherwise wait until the Network tab and the main thread are quiet for 2 seconds.
8. **Observer effect.** The Performance panel itself slows the page. Use it to find causes; use the `PerformanceObserver` snippet (6.2) or a scripted Playwright run (existing saved sessions: `npm run e2e:auth:codeapp`; `e2e/lib/cost.ts` opens Cost screens; Chromium `browser.startTracing`) for the numbers that gate a decision.
9. **Console.** In every environment except Production (`vsb_EnvironmentName = Prod`) the app prints `[VSB] HTTP/DATA/ACTION` lines; the logger costs 1.5 us per call (doc 13) and can be ignored, but keep the Console panel closed during timed runs.
10. **App in a frame?** If the player hosts the app in an iframe, install observers and read `performance` in that frame's console context (the context selector at the top of the Console), not the top page's.

##### 6.2 What to capture, and how

| Metric | How | Notes |
|---|---|---|
| Interaction latency | `PerformanceObserver({type:"event", durationThreshold:16, buffered:true})`: record `duration`, input delay `processingStart - startTime`, processing `processingEnd - processingStart`, presentation delay (the rest), grouped by `interactionId` | Resolution is 8 ms. For typing, use the `keydown`/`input` entry of each keystroke. The Performance panel's "Interactions" track shows the same |
| Long tasks | `PerformanceObserver({type:"longtask", buffered:true})`: count and total over the window | Entries over 50 ms |
| Where the time went | Performance panel, one recording per scenario, 4x CPU; read Summary (Scripting / Rendering / Painting) for the window, Bottom-Up for named functions (with source maps), Main-thread "Layout" and "Recalculate Style" event counts and durations | CMP-02 needs the Layout count per click; RND-13 needs Recalculate Style "elements affected" |
| React commit time | React DevTools Profiler on a **profiling** build (`react-dom/profiling` alias in a throwaway Vite config kept outside `src/`), or in jsdom with `probeRender` counts (`platform/renderProbe.ts`) for deterministic render counts | `renderProbe.current` is `null` in production and not on `window`, so counts come from vitest, times from the Profiler |
| JS heap | Memory panel: collect garbage 3 times (trash icon), wait 2 s, take a heap snapshot; record Statistics (total JS heap) and the largest constructors; search "Detached" for leaked DOM. For a coarse series launch Chrome with `--enable-precise-memory-info` and read `performance.memory.usedJSHeapSize` | 3 snapshots on fresh tabs, median. DOM nodes and listeners: Performance panel "Memory" checkbox |
| GC pauses | Performance panel, "GC" events (Major GC) during the scenario | Over 50 ms matters |
| Requests | Network panel filtered to the entity set (`vsb_assumptionslocaltaxgermanies`): count, transferred and decoded bytes; export HAR; or count `[VSB] HTTP` lines | BM-01 |

Snippet to paste in the app frame's console before a scenario (read `__bm` afterwards):

```js
window.__bm = { ev: [], lt: [] };
new PerformanceObserver(l => l.getEntries().forEach(e => __bm.ev.push({ n: e.name, id: e.interactionId, t: Math.round(e.startTime), d: e.duration,
  inDelay: Math.round(e.processingStart - e.startTime), proc: Math.round(e.processingEnd - e.processingStart) })))
  .observe({ type: "event", durationThreshold: 16, buffered: true });
new PerformanceObserver(l => l.getEntries().forEach(e => __bm.lt.push({ t: Math.round(e.startTime), d: Math.round(e.duration) })))
  .observe({ type: "longtask", buffered: true });
```

##### 6.3 Scenarios

Each scenario states the screen, the steps, the metric, the runs and the finding it decides. IDs are `BM-nn` so doc 22 can cite them.

| ID | Screen / project | Steps | Metric | Runs | Decides |
|---|---|---|---|---|---|
| BM-01 | General Data, a Bavarian project (about 2,000 municipalities) and a French project | Wait idle. Click the Municipality box (record click to list painted). Type a 6-letter word at about 5 characters per second (`pressSequentially` with 200 ms delay in Playwright). Escape. Then type 20 different 1-3 letter terms | per-keystroke event duration, longest task, Option count (`document.querySelectorAll('[role=option]').length`), requests and bytes per word, heap before/after | 10 words, T1 and T4; 5 fresh tabs for the first click | RND-02, RND-14 (and the O3 truncation check: empty-term Option count) |
| BM-02 | Project Overview, 200 rows loaded | Type 10 characters into the Project keyword at 120 ms cadence; then 10 characters into the Project Manager search (local state, an in-page floor); then Next page | per-keystroke event duration, commits per keystroke (profiling build), Layout and Recalculate Style; first mount of the 200-row Table | 10 per box, T4 | RND-01, RND-05 |
| BM-03 | CAPEX tab of a category with at least 500 records | Expand the first account, then 10 sub-accounts one at a time; collapse them; again with 5 and with 30 accounts expanded | click to next paint; Scripting vs Layout vs Painting; self time of `parseDatasetToTree`; Layout events per click | 10 folds per setting, T1 and T4 | CMP-01, CMP-02 |
| BM-04 | Same | Change payer filter, show-empty, show-planned (dataset unchanged) and year (dataset changes) | same as BM-03 | 10 each | CMP-01 (what the cache would cover) |
| BM-05 | Add Costs from Table, largest real project (and a typical one) | From CAPEX press Add Costs from Table; settle; scroll to the bottom; leave to CAPEX; settle | click to first grid paint; long tasks during open; heap after settle, after scroll, after leaving and GC; `document.querySelectorAll('td').length`; DOM node count; Major GC during scroll | 3 fresh tabs, T1 and T4 | MEM-03, MEM-02, SCC-21, CMP-07 |
| BM-06 | Add Costs from Table, 200+ rows x 10 years | Fresh load, click a cell, type one character (first edit); then 10 more characters | first-edit event duration against the median of the rest | 5 fresh tabs, T1 and T4 | CMP-06 |
| BM-07 | CAPEX Edit panel (300-contract category), Revenues contract panel with 10-15 contracts, Admin Cost DEVEX tree with the largest scope, Finance Senior Debt panel | Type 10 characters in a panel field; on Admin Cost expand the largest section and press a row action | commit time (Profiler) and event duration per keystroke; render count; the commit's top components | 10 per screen, T4 | SCC-20, SPB-17, SAD-17, RND-06 |
| BM-08 | Admin Project Gates (country and technology with the most tasks); Check List Settings | Open the screen cold; open again after a save | mount Scripting time; Tooltip share (Bottom-Up `useTooltip`/`Tooltip`); DOM node count; Tooltip instance count | 5 fresh tabs, T1 and T4 | RND-04 |
| BM-08b | CAPEX tab, largest book | Return to the tab after more than 30 s (focus refetch) | self time of `replaceEqualDeepWithDates` in the refetch response | 5 | CMP-03 |
| BM-09 | Admin Project Gates | Block the gate-approvals request (DevTools request blocking) to force the fatal state; trigger 5 re-renders | count of `[VSB] ERROR` lines and App Insights events | 3 | RND-09 (optional; vitest covers it) |
| BM-10 | Contracts (or Finance) | Fresh tab: open an Add/Edit panel, close it, open it again | click to panel painted, first minus second | 5 fresh tabs, T1 and T4 | RND-07 |
| BM-11 | Finance Senior Debt panel | Tab through 30 fields; hover 10 controls | Recalculate Style events per focus change (count, ms, elements affected) | 3 passes, T4 | RND-13 |
| BM-12 | Regression set: Overview first load, CAPEX first load, Contracts open | Run before and after any T-D change | long tasks and Scripting of each load; JS heap after load | 5 pairs | collateral damage guard for every task |
| BM-13 | General Data (Bavaria) then Overview, 10 projects | Type 20 distinct terms; leave; heap snapshot at once and after 6 minutes idle | retained size of `germanMunicipalities` keys (search the snapshot); Detached DOM | 3 | RND-10 (municipality keys), MEM-04 |

##### 6.4 Pass rules (proposed; to be ratified by the user)

- **Worth fixing** (a task is created) when the metric on T4 is over: 200 ms for a discrete interaction (a click, an open), 100 ms per keystroke while typing, 50 ms for a single long task caused by a named function, or, for memory, 150 MB retained by one screen or a Major GC over 50 ms. These follow the web.dev INP bands (200 ms good, 500 ms needs improvement) and the 100 ms responsiveness rule of thumb; they are bars to be chosen, not facts about this app.
- **Keep a change** only if, in the paired A/B: the median of the gating metric improves by at least 20 % **and** at least 10 ms at T1 (30 ms at T4); the p90 does not worsen by more than 5 %; BM-12 shows no regression above 5 % in any screen outside the change; heap does not grow; and the existing functional tests pass unchanged.
- **Close as ACCEPT** a MEASURE-FIRST finding whose metric is under the bar at T4 on the largest nominated data.
- If a metric is between the bar and 1.5x the bar, repeat with 10 more runs before deciding; report the spread, not only the median.
- A figure from jsdom, Node or the dev server is never a basis for keeping a change; it may be cited only as a ratio.

##### 6.5 Result sheet

One row per run: scenario id, finding ids, date, machine, Chrome version, build id, CPU profile, project description and its row counts, run number, each metric, variant (A or B), and a link to the trace or snapshot file kept outside the repo. Doc 22 should reference scenarios by ID and quote medians and p90, with the number of runs.

## 5. DEV probes and checks the criteria depend on

| Probe or check | What it must show | Who |
|---|---|---|
| P-0 | Cost of one read through the host (D144 and D51 disagree 4-10x) | developer on DEV |
| P-1 | `$top` with `maxPageSize`, `In` function and larger id lists; Bayern municipality count with an empty term (silent 500-row cut?) | developer on DEV |
| P-2, P-5 | As described in D165 doc 22 (navigation filter, request timeout behaviour) | developer on DEV |
| P-3 | Writes a row: needs the owner present | developer + owner |
| P-4 | Throttling behaviour: needs the owner present | developer + owner |
| P-6 | Whether the host coalesces requests (the SDK sends a `BatchInfo` header) | developer on DEV |
| M-C01..M-C04 | Browser timeline, tab-return burst, volumes, Application Insights | owner / developer |
| GB-13, GB-30/31/33, GB-50..53, GB-70..72 | Generators bulk and delete-width tables from `GENERATORS-BULK-DEV-TEST-PLAN` | developer on DEV |
| 16-wide check | No 429 at 16 in flight on `vsb_landleaseallocationwtgs`, `vsb_landleaseperiods`, `vsb_opexprojectcosts` | developer on DEV |
| QA-07 / QA-09 DEV checks | Tracking-rebuild order; environment-variable order | developer on DEV |
| Flow `Run` ms per mode; Entra lookup ms | From the DEV `[VSB]` lines | developer on DEV |
| Cold and repeat-after-deploy HAR | Protocol, cache headers, 304 vs 200 (settles BND-11 and BND-16) | developer on DEV |
