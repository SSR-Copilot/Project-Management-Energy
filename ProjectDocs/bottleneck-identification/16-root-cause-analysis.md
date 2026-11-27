# 16 — Root-cause analysis (validated)

> Stage 2, 26 Nov 2026. Planning only: no source file was changed. Five specialist agents re-opened the code for every finding below and gave each an RCA verdict. This document is the orchestrator's consolidation; the agents' full reasoning (execution paths, file:line, the per-finding 12-field specifications) is in `_stage2/A…E-rca-and-strategy.md` and reproduced in the appendices.

## 1. What changed between Stage 1 and Stage 2

113 unique findings were validated (the 113 of doc 14). Verdicts: UNRESOLVED 20, OVERSTATED 27, ACTUAL 34, SHARED-ROOT 13, SYMPTOM 4, NOT-A-BOTTLENECK 15.

| Validated priority | Count |
|---|---|
| P1 | 5 |
| P2 | 34 |
| P3 | 59 |
| Closed (not a bottleneck on the evidence) | 15 |

**Stage 1 over-stated its case.** Of the 9 Stage 1 P1s, 5 stay P1 (SPB-01, SPA-01, SPA-03, NET-17, SCC-01) and 4 are downgraded: NET-13, SCC-02, SPA-02 to P2 and NET-14 to P3. 15 findings are closed as not bottlenecks and 27 are overstated. The most valuable result of Stage 2 is what it removed from the work list.

### Validated priority rule
A finding keeps its Stage 1 priority unless its verdict changes it: NOT-A-BOTTLENECK closes it; OVERSTATED lowers it one level; five explicit overrides come from the agents' own reasoning (NET-14 to P3 because the 16-wide delete phase dominates and no bulk delete exists; SPA-02 because only 1 of 11 rounds is removable; NET-13 and SCC-02 because bulk and cascade are not clear wins at today's volumes; RND-01 and SPA-04 because the cost is smaller than stated). UNRESOLVED findings keep their priority and carry a measurement or probe in doc 22.

### The substantive corrections (each backed by code the agent re-read)

| Finding | Stage 1 said | Stage 2 found |
|---|---|---|
| SPA-01 Check List row action | Awaited reload is a bottleneck | Confirmed, and the **canvas never re-reads rows after a row action** (it patches locally with `UpdateIf`; its Refresh is commented out), so patching the cache is closer to the canvas, not a divergence |
| SPA-02 Move to next cluster, "3-5 s" | Large removable time | Only **1 of 11 rounds** is removable: the 7-step chain is pinned by `SynchroniseProjectState` and the rest is server time. Also the repo's own bench probes the session project in 4 requests where the real route costs 1, so the shipped S4 figure is about **34 requests, not 37** (rounds unchanged) |
| SPA-04 30 s transition poll | Slow poll | A **deliberate behaviour of 6 Nov 2026**, not in the canvas; only its silent timeout is actionable |
| NET-13 Generators bulk OFF | P1: bulk would cut the 3 s save | At 20 turbines the save is 5 forced write rounds; **bulk is slower than singles at that size** (2.3 s vs 2.0 s modelled) and wins from about 60-100 rows. Enable only the size-gated switches |
| SCC-02 CAPEX delete | Cascade not used, 15-50 rounds | The cascade took **5.2 s for one contract** in D51 and the canvas deletes children explicitly; the lever is the pool width (4 to 8), not the cascade |
| NET-14 / SAD-04 admin clean-up | P1 heaviest admin workload | Rare and volume unknown; the 16-wide delete phase dominates and no bulk delete exists |
| SPB-08 Finance bulk | Fewer requests | Fewer requests but **more rounds** (34/6 becomes 11/8); and the repo harness charges a bulk request as a plain call, so real bulk is slower than that table |
| NET-16 no deadline | Switch on `REQUEST_DEADLINES` | **Query reads never go through `sendWithPolicy`** (`fetchAll`, `client.ts:58-108`), so the switch would not cover them |
| BND-02 focus refetch | Every window focus refetches | Fires on `visibilitychange` only, for **stale active queries, in the background** with data on screen |
| BND-12 boot env-var prefetch | Add it to boot prefetch | A **no-op**: the first render follows in the same turn; the real cost is two sequential hops (switch `ENV_VARS_TOGETHER`) |
| CMP-04 quadratic gate | Fix before `GLOBAL_GATE` | Invisible up to 3,500 queued writes, +3 % at 15,000: hygiene only |
| RND-01 URL-driven filter | P2 | P3: the session context is memoised on primitives, so only the shell and routes re-render |
| RND-02 municipality | Debounce is a divergence | The canvas Germany box has `DelayOutput: =true`; the code app removed it on 3 Nov by instruction, so a debounce **restores parity**. The Area's list is already fetched, so a client filter costs 0 requests |
| MEM-03 207-214 MB | Heap risk | jsdom's fallback window with no layout; D140 recorded **748 real cells** |
| BND-16 155 files | Many small files | **Not a bottleneck**: 80 files total 90 KiB, preloaded in parallel |
| BND-04 | Moderate | **Under-sized**: `costBook` pulls Land Lease code into two PM screens (Milestones 128 KiB gz, of which about 60 avoidable) |
| BND-07 | -12 KiB | Measured **-6.9 KiB gz** |
| BND-10 | Lazy-load the report panel | Net **-9 KiB on the landing, +3.7 on every other first screen**: overstated |
| BND-08 / SCC-19 | Lazy `costRepository` | Measured **worse** (+1.5 to +6 KiB gz); the binding edge is `costBook`'s scope coupling: needs a spike |
| Prefetch (R1) | Prefetch every screen | **Worthless for keys that re-read on every mount** (Contracts, OPEX, Finance, admin tree, `refetchOnMount: "always"`) |
| D144 vs D51 unit costs | One consistent latency scale | They **disagree 4-10x** for one read; every benefit is therefore expressed in waves/rounds until probe P-0 runs |
| Doc 12 root R9 | A root cause | A label, not a root |

### Findings whose priority changed

| ID | Stage 1 | Verdict | Validated |
|---|---|---|---|
| BND-02 | P2 | OVERSTATED | P3 |
| BND-16 | P3 | NOT-A-BOTTLENECK | Closed |
| CMP-03 | P3 | NOT-A-BOTTLENECK | Closed |
| CMP-04 | P3 | NOT-A-BOTTLENECK | Closed |
| CMP-07 | P3 | NOT-A-BOTTLENECK | Closed |
| CMP-09 | P3 | NOT-A-BOTTLENECK | Closed |
| MEM-04 | P3 | NOT-A-BOTTLENECK | Closed |
| NET-02 | P2 | OVERSTATED | P3 |
| NET-03 | P3 | NOT-A-BOTTLENECK | Closed |
| NET-04 | P2 | OVERSTATED | P3 |
| NET-13 | P1 | OVERSTATED | P2 |
| NET-14 | P1 | OVERSTATED | P3 |
| NET-21 | P3 | NOT-A-BOTTLENECK | Closed |
| RND-01 | P2 | OVERSTATED | P3 |
| RND-12 | P3 | NOT-A-BOTTLENECK | Closed |
| SAD-10 | P3 | NOT-A-BOTTLENECK | Closed |
| SAD-14 | P3 | NOT-A-BOTTLENECK | Closed |
| SAD-15 | P3 | NOT-A-BOTTLENECK | Closed |
| SCC-02 | P1 | OVERSTATED | P2 |
| SCC-04 | P2 | OVERSTATED | P3 |
| SCC-08 | P2 | OVERSTATED | P3 |
| SCC-12 | P2 | OVERSTATED | P3 |
| SPA-02 | P1 | OVERSTATED | P2 |
| SPA-04 | P2 | OVERSTATED | P3 |
| SPA-07 | P3 | NOT-A-BOTTLENECK | Closed |
| SPA-17 | P3 | NOT-A-BOTTLENECK | Closed |
| SPB-04 | P2 | OVERSTATED | P3 |
| SPB-10 | P3 | NOT-A-BOTTLENECK | Closed |

## 2. Isolated or shared?

- **Shared roots** (fix once, several findings go away): R1 screen-entry design (SCC-01, SPB-02, SPA-09, BND-17, SCC-15), R3 write engine (SAD-07 is the root of SAD-08, SAD-09 and the zero phase of NET-14), R6/NET-05 read lane, BND-18 module coupling (root of BND-03/04/06/07/08), R8 flows in blocking jobs (SPA-03 with NET-17, SPA-04). Detail: doc 17.
- **Isolated** (screen-specific): Land Lease panel Save, Revenues volumes, Finance tranche, Production generation, CAPEX delete, Add Cost first edit, municipality search, CAPEX grid repaint.

## 3. Validated register (one row per unique finding)

| ID | Stage 1 P | Verdict | Validated P | Action | Task | Screen | Root cause (short) |
|---|---|---|---|---|---|---|---|
| NET-17 | P1 | ACTUAL | P1 | FIX-AFTER-DECISION | T-A09 | Cluster Check List, General Data (flow calls) | NOT started (T-08): flow calls run inside the blocking write job after the PATCH, are never retried and have no deadline; an ambiguous failure can duplicate an approval o … |
| SCC-01 | P1 | SHARED-ROOT | P1 | FIX | T-C01 | CAPEX/DEVEX / Add Cost from Table / OPEX / Land Le | A Cost deep link prefetches only the session project (scope full) and the chunk. The screen's own first reads (chart of accounts / SPV-DevCo mapping / project states / ca … |
| SPA-01 | P1 | ACTUAL | P1 | FIX | T-A01 | Cluster Check List | Every row action (Complete / In Progress / completion date / comment) is a guarded update (existence GET then PATCH, strictly sequential) inside a job whose awaited onSet … |
| SPA-03 | P1 | SHARED-ROOT | P1 | MEASURE-FIRST | T-A03 | Cluster Check List | Request Approval and Cancel keep the UI blocked inside one job for: trackings list, guard GET, PATCH, then the Power Automate Run, then rows read, note POST and a 9-key r … |
| SPB-01 | P1 | ACTUAL | P1 | FIX-AFTER-PROBE | T-B01,T-B02 | Production | The first yield save of every new project runs the one-shot standard-contract generation: every land-lease allocation / period / OPEX / O&M row is its own POST, grouped o … |
| BND-01 | P2 | UNRESOLVED | P2 | MEASURE-FIRST | - | Cross-cutting | main.tsx statically imports App/Providers/bootPrefetch, so the ES-module graph (8 startup files: Fluent 499 KiB + react-dom/router/query entry 440 KiB + SDK chunk 70 KiB) … |
| BND-03 | P2 | ACTUAL | P2 | FIX | T-E01 | Planning / Grid Operator / Revenues / Milestones | The four screens import forLanguage/textFormat through the Generators rules barrel (export * of 7 modules); the helpers live in domain/powerFxNumeric.ts, but features/**  … |
| BND-04 | P2 | SHARED-ROOT | P2 | FIX | T-E02 | Milestones / Revenues / General Data | Screen-to-screen static data coupling of the FE-P2-05/06 class that D162 fixed only for Finance and Production: Milestones imports data/revenues for 2 functions (which pu … |
| BND-05 | P2 | ACTUAL | P2 | FIX-AFTER-DECISION | T-E07 | General Data (Edit Project / New Project) | The map chunk now starts with the screen (FE-P1-01 done) but the SAS token (a Power Automate flow run) is requested only from the SDK getToken callback after the 1.7 MB c … |
| CMP-01 | P2 | ACTUAL | P2 | MEASURE-FIRST | T-D02 | CAPEX/DEVEX costs (Cost app) | The vendored Canvas-host parser probes up to 20 alias column names per field through getValue and then getFormattedValue (a miss costs two calls plus a fresh alias array  … |
| MEM-03 | P2 | UNRESOLVED | P2 | MEASURE-FIRST | T-D00 | Add Cost from Table | react-spreadsheet keeps per-cell state subscriptions and fibers for every drawn cell. The D140 window limits drawn rows to the viewport plus 15 each side, and drawn colum … |
| NET-05 | P2 | SHARED-ROOT | P2 | DEFER | - | All screens (planned global gate) | ASYNC: The D165 global gate (ceiling 40, write lane 24, `GLOBAL_GATE` = false) is entered only by `sendWithPolicy`, which write paths and a few verify/existence reads use … |
| NET-06 | P2 | ACTUAL | P2 | DEFER | - | Add Cost from Table on a deep link or reload | The route `/costs/add-from-table` mounts the CAPEX screen AND the Add Cost screen in one element; on a cold entry both load the same contracts and cost rows under two key … |
| NET-13 | P1 | OVERSTATED | P2 | FIX-AFTER-PROBE | T-B03 | Generators (Add WTG type, replace, status) | SWITCHED OFF: all six `GENERATORS_BULK` switches and `CHECKLIST_BULK.materialise` are false, so large Generators writes stay one request per row (8 or 16 wide) |
| NET-16 | P2 | ACTUAL | P2 | FIX-AFTER-PROBE | T-C06 | All screens (every request and flow call) | ASYNC: `REQUEST_DEADLINES` is false and the SDK has no timeout or abort, so a hung request or a hung flow run holds its caller, the Cost write lock (`useCostWriteFlight.t … |
| RND-02 | P2 | ACTUAL | P2 | FIX-AFTER-DECISION | T-D01 | General Data (Germany and France municipality comb | [HOOKS/STATE] The municipality search state (muniSearch) feeds the query key raw: no useDebouncedValue, unlike every other typed-search hook (Entra in General Data and Te … |
| RND-14 | P2 | UNRESOLVED | P2 | MEASURE-FIRST | T-D01 | General Data (Germany, Bavaria about 2,000 municip | [RENDER] The municipality Combobox mounts every Option (up to 5,000) when focused or searched; D162 only memoised the element array (FE-P1-02a) and deferred the windowed  … |
| SAD-01 | P2 | UNRESOLVED | P2 | MEASURE-FIRST | T-E08 | Check List Settings | The lock set is ONE fetchAll over every locking Check List Default Approval of the whole environment (all configured country x Wind/PV scopes), re-read on every mount (FR … |
| SAD-05 | P2 | ACTUAL | P2 | FIX | T-B07 | CAPEX Accounts | The clean-up is a browser-side loop that is not tied to anything the user can see once the dialog closes: no beforeunload guard, no persisted job, and no Resume action (D … |
| SAD-07 | P2 | SHARED-ROOT | P2 | FIX-AFTER-DECISION | T-B06 | Cross-cutting (Check List Settings, Milestones, Co | Every admin single-row and multi-row update is a guarded update: an existence GET by primary key followed by the PATCH (2 sequential round trips per row, 8 wide); the row … |
| SAD-08 | P2 | SYMPTOM | P2 | FIX-AFTER-DECISION | T-B06 | Check List Settings | Reorder and delete-with-renumber write every changed Order as its own guarded PATCH at width 4 (ORDER_WRITE_CONCURRENCY); each PATCH also fires a server flow that rewrite … |
| SCC-02 | P1 | OVERSTATED | P2 | FIX-AFTER-PROBE | T-B04 | CAPEX/DEVEX (panel Delete) | Deleting a contract runs four strictly sequential phases: comments read, comment deletes (4 wide), cost-row deletes (4 wide: ceil(months/4) rounds), contract delete, then … |
| SCC-06 | P2 | ACTUAL | P2 | FIX | T-B05 | Land Lease (panel Save) | The panel Save runs three steps (contract, allocation, period) one after another and each step awaits its own key-only existence guard (CB-01) before its writes, so up to … |
| SCC-07 | P2 | ACTUAL | P2 | FIX-AFTER-DECISION | T-B09 | Land Lease | Every Land Lease write awaits a reload of the whole lease book (headers, then periods + allocations + currency names = 2 waves, 4 requests) before the save resolves, alth … |
| SCC-09 | P2 | ACTUAL | P2 | FIX | T-B05 | Land Lease (Save with many allocations) | Allocation rows (one per generator when All WTG is on) are written one row per request, 8 wide, and each op (create, update, delete) is its own tier; period creates of a  … |
| SCC-11 | P2 | ACTUAL | P2 | MEASURE-FIRST | - | CAPEX/DEVEX Summary | The Summary tab reads every monthly cost row of every contract of the project (two columns, 5,000-row pages, ceil(C_all/40) chunks, pages sequential inside a chunk) to pr … |
| SCC-13 | P2 | UNRESOLVED | P2 | MEASURE-FIRST | - | Add Cost from Table (large sheets) | Rows of one bulk request run serially on the server (about 22-32 ms per row inferred) with a sharing row and an audit row per create; the client can only split into more  … |
| SPA-02 | P1 | OVERSTATED | P2 | FIX-AFTER-DECISION | T-A02 | Cluster Check List | Move to next cluster = a pinned sequential chain (guarded update current tracking = GET+PATCH, guarded update next = GET+PATCH, note POST, project PATCH) then an awaited  … |
| SPA-05 | P2 | ACTUAL | P2 | FIX-AFTER-PROBE | T-A07 | Cluster Check List | The first usable screen waits for the gate rows and then one Entra (Graph-backed aadusers) lookup per portfolio manager; the row actions that depend on approval mode wait … |
| SPA-06 | P2 | UNRESOLVED | P2 | MEASURE-FIRST | - | Cluster Check List | The first visit to an empty cluster copies the default templates as N single creates (16 in flight, wideCopy ON) because the bulk create (CHECKLIST_BULK.materialise) ship … |
| SPA-09 | P2 | ACTUAL | P2 | FIX | T-A04 | All PM screens (in-app navigation) | The PM screen prefetch (chunk + first reads) exists only for a deep link at boot; clicking the rail inside the app starts the lazy chunk and the screen's reads only after … |
| SPA-11 | P2 | ACTUAL | P2 | MEASURE-FIRST | - | Project Overview | Each 200-row page carries 22 columns with Dataverse annotations (odata.include-annotations=* is an SDK constant) and every page view also sends a 1-row blank probe; page  … |
| SPA-13 | P2 | SHARED-ROOT | P2 | DEFER | - | Project Overview, General Data, any PM or Cost scr | Edit Project and Edit Costs open a new tab; each new tab pays the whole cold boot again (host context, environment variables in 2 steps, user chain in 3, reference lists) |
| SPA-14 | P2 | ACTUAL | P2 | FIX | T-A05 | General Data | On an edit save the tail (Draft reset, up to 7 tracking upserts, each shareholding entity, the Draft tracking) is a sequential plan; only the create path marks the follow … |
| SPB-02 | P2 | SHARED-ROOT | P2 | FIX | T-C02 | Production / Revenues / Finance | A deep link or the new tab opened by "Edit Project" with pmScreen=production / revenues / finance prefetches only the session project and the screen chunk; the screen's o … |
| SPB-05 | P2 | UNRESOLVED | P2 | FIX-AFTER-PROBE | - | Generators | The first view has a two-wave chain: types are read first, then the turbines (key embeds the type ids) and the models (generator ids); both gate the list. The one-request … |
| SPB-07 | P2 | ACTUAL | P2 | FIX-AFTER-DECISION | T-B10 | Revenues | Saving a contract with Individual hedge volumes deletes every stored volume and re-creates every volume, changed or not; the delete group and the create group are each 16 … |
| SPB-08 | P2 | ACTUAL | P2 | FIX-AFTER-DECISION | T-B11 | Finance | A tranche Save rewrites every repayment-year and step-up row (changedRowsOnly OFF: modifiedon/audit parity with the canvas ForAll(Patch)); the two switches that would cha … |
| SPB-09 | P2 | ACTUAL | P2 | FIX-AFTER-DECISION | T-B08 | Revenues / Finance | Revenues and Finance saves keep the progress dialog open until the reload reads have answered; Production and Generators close the dialog when the writes land and reload  … |
| BND-02 | P2 | OVERSTATED | P3 | MEASURE-FIRST | T-C04 | Cross-cutting (every screen with active queries) | QueryClient default refetchOnWindowFocus is true with staleTime 30 s: every return to the tab after 30 s refetches every stale ACTIVE query of the open screen (Generators … |
| BND-06 | P3 | SHARED-ROOT | P3 | FIX | T-E01 | Project Overview (landing) and 12 other screens | The shared project-states list lives in data/projectStates.ts which imports listProjectStates from data/generalData.ts, which statically imports the 1,300-line General Da … |
| BND-07 | P3 | SHARED-ROOT | P3 | FIX | T-E01 | Finance / Production / Generators / Contracts / OP | The generic bulk transport bulkSend.ts imports CAPEX_CONTRACTS/CAPEX_COSTS from addCostSheetBulk.ts (Add Cost sheet specific), which imports add-costs-from-table/rules.ts … |
| BND-08 | P3 | SHARED-ROOT | P3 | MEASURE-FIRST | T-E04 | CAPEX / OPEX / Land Lease / Contracts / Add Cost;  | D162 FE-C2-08 (costRepository facade statically imports every Cost read and write module) and FE-P2-07 (Finance 136 KiB single chunk) were deferred and are still true: us … |
| BND-09 | P3 | SYMPTOM | P3 | FIX | T-C08 | Cross-cutting (first paint) | index.html has an empty #root; the only loading UI ("Please wait...") is React-rendered by App/LoadingOverlay after the whole startup graph (BND-01) has been evaluated, s … |
| BND-10 | P3 | OVERSTATED | P3 | DEFER | - | Cross-cutting (every screen opening Report a probl | App statically imports ReportProblemPanel (closed until the Help menu is used) which pulls FormPanel -> Fluent Drawer, TextArea, ConfirmDialog/Fields/CanvasFields chain i … |
| BND-11 | P3 | UNRESOLVED | P3 | MEASURE-FIRST | T-E08 | Cross-cutting (every release) | The entry chunk holds react-dom/react-router/query-core (about 300 KiB min of 440) AND the preload map naming every lazy chunk; any change to any chunk (here the build ti … |
| BND-12 | P3 | OVERSTATED | P3 | ACCEPT | - | Cross-cutting (header labels, telemetry, console g | Environment variables are two sequential Dataverse reads (definitions then values; ENV_VARS_TOGETHER is shipped OFF) that start only at the first React render (not in the … |
| BND-13 | P3 | SHARED-ROOT | P3 | FIX-AFTER-DECISION | T-A04 | Every Project Management screen | The Generators warm-up (GENERATORS_WARMUP_LAZY shipped OFF) starts 1.5 s after any PM screen of a valid project opens: it downloads the whole Generators chunk graph and s … |
| BND-14 | P3 | OVERSTATED | P3 | DEFER | - | Cross-cutting (telemetry-on environments) | As soon as the env-var read lands the 194 KiB (74.6 KiB gz) Application Insights SDK is fetched, parsed and started with no idle/yield, at the same time as the first scre … |
| BND-17 | P3 | ACTUAL | P3 | FIX | T-C03 | Admin Application Settings (6 screens) | The six admin screens bypass screenLoaders so a deep link /admin/* starts its chunk only at the first render (no boot prefetch) and each sibling visit is a fresh cold clo … |
| BND-18 | P3 | SHARED-ROOT | P3 | FIX | T-E03 | Cross-cutting | The data layer imports from features/** (alias imports: data -> cost/capex-costs 9, cost/costing 7, cost/periods 6, cost/contracts 4, pm/general-data 3, cost/add-costs-fr … |
| CMP-02 | P3 | UNRESOLVED | P3 | MEASURE-FIRST | T-D02 | CAPEX/DEVEX costs (Cost app) | render() clears tbody and rebuilds every visible row on any change; renderColGroup runs twice (before the rows and again in fitColumnsToScrollViewport after they are atta … |
| CMP-05 | P3 | OVERSTATED | P3 | DEFER | - | Add Cost from Table (after Save) | patchPayments runs for every line of the cached book and always copies the line payments with filter and builds an id-to-index Map, even when the Save touched no cost of  … |
| CMP-06 | P3 | ACTUAL | P3 | MEASURE-FIRST | T-D03 | Add Cost from Table | cleanRows is empty after a load, so the first edit after opening runs the cell rules and dressing over every row of the sheet; later edits reuse clean rows. |
| MEM-02 | P3 | OVERSTATED | P3 | ACCEPT | - | Add Cost from Table | The sheet is held in at least six representations at once: the query data (subaccounts / contracts / costs), loaded.loadedRows, loaded.grid, loaded.roundTripped, the orig … |
| NET-02 | P2 | OVERSTATED | P3 | FIX-AFTER-PROBE | T-C06 | Cost (CAPEX, Add Cost sheet, Land Lease, Contracts | ASYNC: A query function that is a Promise.all over id chunks fails as a whole when ONE chunk fails, and TanStack then retries the WHOLE query function (2 retries, 1-2 s j … |
| NET-04 | P2 | OVERSTATED | P3 | FIX | T-C05 | Cost (CAPEX, Add Cost, Land Lease, Contracts, OPEX | ASYNC: 17 read sites are Promise.all over `chunk(ids).map(fetchAll)`; their width is ceil(N/40) with no bound. Per-pool limits (8/16/4) and the planned global gate cover  … |
| NET-07 | P3 | UNRESOLVED | P3 | MEASURE-FIRST | - | Any read of a table that can exceed 500 rows; 17 w | `fetchAll` asks for 500 rows per page at 152 of 157 sites (5 raise it to 5000) and pages are strictly sequential (skip token), so each 500 rows beyond the first page add  … |
| NET-08 | P3 | ACTUAL | P3 | FIX | T-C04 | Navigation between screens | Reference data is kept fresh for 15-30 minutes but garbage-collected 5 minutes after its last observer unmounts (default gcTime 3e5), so the long staleTime only holds whi … |
| NET-10 | P3 | OVERSTATED | P3 | DEFER | - | PM screens (Checklist, Team, Milestones, General D | Each PM screen reads the same project row again under its own key and select besides the session project (`qk.projectPm`); only Planning and Grid Operator share one key ( … |
| NET-14 | P1 | OVERSTATED | P3 | MEASURE-FIRST | T-B06 | Admin CAPEX Accounts clean-up | OPEN volume: the clean-up is now resilient (`CLEANUP_RESILIENT` = true) but still sends 2 requests per zeroed row and 1 per deleted row, per row (T-43 not started) |
| RND-01 | P2 | OVERSTATED | P3 | MEASURE-FIRST | T-D00 | Project Overview (any screen whose URL search chan | [RENDER] Keyword and capacity boxes are controlled from the URL: every keystroke is a router navigation, so SessionProvider (useLocation), App, AppShell, AppHeader (none  … |
| RND-04 | P3 | UNRESOLVED | P3 | MEASURE-FIRST | T-D05 | Admin Project Gates, Admin Check List Settings, PM | [RENDER] A Fluent Tooltip (positioning, popover and context machinery) is created per row control instead of one per table; 52 literal Tooltip sites, several inside rows  … |
| RND-05 | P3 | UNRESOLVED | P3 | DEFER | - | Project Overview | [RENDER] The landing grid is a Fluent Table with 200 rows x 12 TableCell per page (2,400 cells + 200 rows), mounted from scratch on first load and on every page change; r … |
| RND-06 | P3 | OVERSTATED | P3 | ACCEPT | - | Cross-cutting (45 FormPanel sites, 36 ConfirmDialo | [RENDER] Closed panels cost nothing in the DOM (Fluent Drawer unmountOnClose defaults to true, verified in node_modules/@fluentui/react-drawer useDrawerDefaultProps.js) b … |
| RND-07 | P3 | UNRESOLVED | P3 | MEASURE-FIRST | T-D06 | Cross-cutting (first panel, dialog or dropdown ope | [RENDER] The first use of a Fluent overlay family initialises Griffel runtime styles (no AOT plugin in vite.config.ts), tabster/modalizer and motion; only the Generators  … |
| RND-08 | P3 | OVERSTATED | P3 | DEFER | - | Every non-Cost route on project open (PM, Overview | [RENDER] While the session or project loads on non-Cost routes, App returns a blocking LoadingOverlay instead of the shell, so the header and rail mount only after the lo … |
| RND-09 | P3 | ACTUAL | P3 | FIX | T-D04 | Admin Project Gates (pattern reusable by any Query | [HOOKS/STATE] QueryStates calls fatal.text(error) during RENDER and userErrorText has a side effect (trace error): every re-render of an error state appends a trace entry … |
| RND-10 | P3 | OVERSTATED | P3 | DEFER | - | Cross-cutting (cost book, add-cost-sheet, municipa | [HOOKS/STATE] gcTime is never set anywhere in src (grep), so every query key (per project, per category, per typed search term) stays in memory 5 minutes after its last o … |
| RND-11 | P3 | OVERSTATED | P3 | ACCEPT | - | CAPEX comments panel | [HOOKS/STATE] An effect copies query.data into local state (setWorking plus 4 further setState calls) when the panel opens, costing a second render of the 933-line panel  … |
| RND-13 | P3 | UNRESOLVED | P3 | DEFER | - | Panels and forms on Finance, OPEX, Check List, Con | [RENDER] Descendant :has(:disabled) and :not(:has(:disabled)) selectors are applied through root-level classes to every Input, Dropdown, Combobox and Textarea in a panel, … |
| SAD-02 | P3 | ACTUAL | P3 | FIX | T-E05 | Check List Settings | The environment-wide locks query (and the shared states read when cold) is enabled only after the tabs list has arrived (enabled = hasTabs) although neither depends on th … |
| SAD-03 | P3 | ACTUAL | P3 | DEFER | - | Check List Settings | After a Completion Date toggle succeeds, onSuccess awaits BOTH the tab's task refetch AND the environment-wide locks refetch; the toggled row stays pending (runner inline … |
| SAD-06 | P3 | SYMPTOM | P3 | FIX-AFTER-DECISION | T-C04 | CAPEX Accounts | The account tree uses staleTime 0 with the global refetchOnWindowFocus, so every window focus re-reads the whole vsb_capexaccountlists table (all states, no filter); ever … |
| SAD-09 | P3 | ACTUAL | P3 | DEFER | - | Costs | Editing Period 1 of an OPEX / Land Lease standard contract re-writes the contract-level fields of every later period (guarded, 8 wide) even when none of them changed |
| SAD-11 | P3 | OVERSTATED | P3 | DEFER | - | Costs | The whole screen content waits for all six reference reads (countries, hierarchy, Land Lease subaccounts, OPEX subaccounts, currencies, payer defaults) although currencie … |
| SAD-13 | P3 | ACTUAL | P3 | DEFER | - | Project Gates | The dataset is a dependent chain (checklist header -> checklists -> approvals in chunks of 40 -> unresolved Portfolio Managers) beside the templates read, and the whole s … |
| SAD-17 | P3 | UNRESOLVED | P3 | MEASURE-FIRST | T-D00 | Costs | DevexCostTree and OpexContractTable are not memoised and render every row of an open section (DEVEX rows only for expanded categories; OPEX contracts all expanded by defa … |
| SCC-04 | P2 | OVERSTATED | P3 | DEFER | - | Add Cost from Table -> CAPEX/DEVEX | After a successful Save the cached category book is patched from what was written, yet a confirming refetch of the whole category book (chart / contracts / payments chain … |
| SCC-08 | P2 | OVERSTATED | P3 | DEFER | - | Land Lease (delete contract) | A contract delete sends every child delete (allocations 16 wide, periods tiered, then the header) although the header delete cascades its children; 40 allocations + 3 per … |
| SCC-12 | P2 | OVERSTATED | P3 | DEFER | - | Add Cost from Table (Save with new contracts) | A Save that creates contracts has two serial hops: contract CreateMultiple, then the new contracts' cost rows (each binds the new contract). The deep insert that would me … |
| SCC-14 | P3 | ACTUAL | P3 | FIX-AFTER-DECISION | T-C04 | CAPEX/DEVEX | The chart of accounts is wave 1 of every cold category load (chart, contracts, payments) and is remembered only 30 s, although it is master data that changes only through … |
| SCC-15 | P3 | ACTUAL | P3 | DEFER | - | CAPEX/DEVEX | The standard-assumption read and the Add Standard Contract options are keyed on sub-account ids that come from book.accounts (the chart), but the query is enabled only af … |
| SCC-16 | P3 | ACTUAL | P3 | FIX | T-E06 | CAPEX/DEVEX | The screen-level comment query is keyed on the sorted contract id list and has no placeholder data: creating or deleting a contract changes the key, the red comment dots  … |
| SCC-18 | P3 | OVERSTATED | P3 | DEFER | - | OPEX (O&M) | One O&M visit reads vsb_devicetypesinprojects twice: the book reads (id, name) for the devices its periods point at, and the device-type query reads (id, name, type) for  … |
| SCC-19 | P3 | SHARED-ROOT | P3 | MEASURE-FIRST | T-E04 | CAPEX/DEVEX | The CAPEX screen statically pulls Land Lease and OPEX code through useCostBook / costRepository: the shared chunk useCostWriteFlight (contracts, periods and capex rules)  … |
| SCC-20 | P3 | UNRESOLVED | P3 | MEASURE-FIRST | T-D00 | CAPEX/DEVEX (Add/Edit panel) | A keystroke in the panel renders the whole 1,408-line screen (toolbar dropdowns, dialogs, O(lines) derivations); PcfGrid itself is guarded by value comparison (OPT-25) |
| SCC-21 | P3 | SYMPTOM | P3 | ACCEPT | - | Add Cost from Table | While the sheet is open it holds the query data, loadedRows, the seeded grid and a decorated copy of it (react-spreadsheet state), roundTripped, originalRows and currentR … |
| SPA-04 | P2 | OVERSTATED | P3 | DEFER | T-A09 | Cluster Check List | For an active Only-Notifications gate the screen sleeps 1.5 s before the FIRST poll and then polls one tracking per 1.5 s for at most 30 s until the flow has completed th … |
| SPA-08 | P3 | OVERSTATED | P3 | DEFER | T-A07 | Cluster Check List | entraMails starts one getEntraPeople([id]) per distinct portfolio manager through Promise.allSettled, so the 6-wide cap of getEntraPeople (OPT-17b) never applies (each ca … |
| SPA-16 | P3 | UNRESOLVED | P3 | MEASURE-FIRST | - | General Data | The Azure Maps chunk (1,658 kB min / 427.8 kB gzip, MEASURED bundle-report on the current dist) is fetched at mount beside the reads and parsed on the main thread while t … |
| SPB-04 | P2 | OVERSTATED | P3 | MEASURE-FIRST | - | Generators | Replace Generator Type / Replace PV Module are 11-12 sequential waves (3 read waves, deletes, creates, roll-up, allocations); D144 merged some waves (replaceLanes ON) but … |
| SPB-06 | P3 | UNRESOLVED | P3 | MEASURE-FIRST | T-E08 | Generators | The whole PV module catalogue is read, paged 500 sequentially by fetchAll, before the first view, only to join the supplier name onto the project's own PV types; a wind-o … |
| SPB-12 | P3 | UNRESOLVED | P3 | MEASURE-FIRST | T-E08 | Production / Finance / Revenues | Reads that only a panel, a seed or a first-visit write consumes start at screen load: Production's Fabric seasonality/negative-price read, Finance's whole banks and KfW t … |
| SPB-13 | P3 | OVERSTATED | P3 | DEFER | - | Finance | The Equity panel's CAPEX total and the Decommissioning card's turbine count are computed by reading all rows (KNOWN-RISKS R-10: no server-side aggregates in this app); th … |
| SPB-14 | P3 | ACTUAL | P3 | FIX-AFTER-PROBE | T-E08 | Generators | Selecting a WTG or PV type triggers two sequential reads (device-type rows, then active O&M costs on them); Delete / Deactivate stay disabled until the answer is known |
| SPB-15 | P3 | ACTUAL | P3 | DEFER | - | Generators | Every Generators save writes the plant roll-up to vsb_projects even when the totals did not change; it is the slowest single write and fires the Fabric-sync flow |
| SPB-17 | P3 | UNRESOLVED | P3 | MEASURE-FIRST | T-D00 | Revenues / Production | All panel form state lives in the screen component, so a keystroke re-renders the screen body: the volume rows and card fields are memoized (D146 C3, ContractCardFields)  … |
| BND-16 | P3 | NOT-A-BOTTLENECK | Closed | ACCEPT | - | Every screen (cold visit) | The build emits 155 JS files, 80 of them under 3 KB (one per generated service, small data modules, hooks); a cold CAPEX visit fetches 43 lazy files (32 under 3 KB) plus  … |
| CMP-03 | P3 | NOT-A-BOTTLENECK | Closed | ACCEPT | - | Cross-cutting (CAPEX, Add Cost from Table, Contrac | The default structuralSharing deep-walks the whole previous and the whole new result of every refetch of every query (D162 decision D-1), including the cost book payment  … |
| CMP-04 | P3 | NOT-A-BOTTLENECK | Closed | DEFER | T-C07 | Cross-cutting (latent: every bulk write path if GL | createRequestGate keeps one FIFO array; every submit and every completion calls pump(), which scans from index 0 and skips queued writes while the 24-write lane is full;  … |
| CMP-07 | P3 | NOT-A-BOTTLENECK | Closed | ACCEPT | - | Add Cost from Table (load, paste, Add Row, Delete  | On load the screen runs buildInitialSheet, sheetRowsToGrid, gridToJson and outputRowsToSheetRows in one synchronous useMemo; react-spreadsheet then builds two Models over … |
| CMP-09 | P3 | NOT-A-BOTTLENECK | Closed | ACCEPT | - | Cross-cutting (every money cell, date and sorted l | The pooled Intl.NumberFormat, Collator and DateTimeFormat helpers build their cache key with JSON.stringify(options) on every call, so a pooled call costs 2-4 times a hel … |
| MEM-04 | P3 | NOT-A-BOTTLENECK | Closed | ACCEPT | - | Project Overview (any countedPage caller) | tokenCache gets one entry per (table, filter+sort signature) the first time that signature is walked, and an entry is removed only by a write to that table in the same ta … |
| NET-03 | P3 | NOT-A-BOTTLENECK | Closed | ACCEPT | - | All fan-out reads; Cost save invalidation; screen  | ASYNC: No query function consumes TanStack's `signal` and the SDK has no abort path, so `cancelQueries`, `invalidateQueries` (cancelRefetch defaults to true) and unmounti … |
| NET-21 | P3 | NOT-A-BOTTLENECK | Closed | ACCEPT | - | Every read | The SDK adds `odata.include-annotations=*` to every read, so each row carries formatted-value annotations whether or not the screen uses them; a platform constraint |
| RND-12 | P3 | NOT-A-BOTTLENECK | Closed | ACCEPT | - | Cross-cutting (hooks used by every screen) | [HOOKS/STATE] Five shared hooks return a fresh object literal on every render, so the returned object can never be an effect dependency or a memoised child's prop (D162 h … |
| SAD-10 | P3 | NOT-A-BOTTLENECK | Closed | ACCEPT | - | Costs | ADMIN_SCOPE_READS_ONCE is OFF (integration decision), so each scope reads the OPEX table twice (38 columns active, 5 columns inactive) and the hierarchy reads vsb_capexac … |
| SAD-14 | P3 | NOT-A-BOTTLENECK | Closed | ACCEPT | - | Milestones | Pressing Edit refetches the whole assumptions table under a blocking overlay before the panel opens (canvas Refresh parity), and the draft lives in the screen state so ea … |
| SAD-15 | P3 | NOT-A-BOTTLENECK | Closed | ACCEPT | - | Contracts (standard BoP contracts) | The DevCo link list of the scope is read three times in one edit cycle (Edit open refetch, the ownership re-read at save, the post-save invalidation), each through a navi … |
| SPA-07 | P3 | NOT-A-BOTTLENECK | Closed | DEFER | - | Cluster Check List | D158 completeCopy: for a cluster that already has rows and whose rows are not cached as worked on, every visit first reads all rows of the cluster (5 columns) and then th … |
| SPA-17 | P3 | NOT-A-BOTTLENECK | Closed | ACCEPT | - | Milestones | Every Milestones save sends vsb_operationsstartdatecod, vsb_construction and vsb_enddate (canvas parity), so the server plugin steps (synchronous repayment rebalancing an … |
| SPB-10 | P3 | NOT-A-BOTTLENECK | Closed | ACCEPT | - | Production | A yield Save is a chain of awaited steps that each protect a standing property: 4 parallel pre-reads, the yield write alone, the 16-wide group, then a fresh read of yield … |

Findings merged in Stage 1 (doc 14 section 4) share their canonical row's verdict.

## Appendix A-E. The agents' RCA verdict tables (verbatim)

### Agent A

Classification letters: A = architecture, E = execution order, D = data volume, N = network latency, I = implementation. "Cross" = affects other screens; "Iso" = isolated to the screen.

| ID | Verdict | Class | Iso / cross | Note |
|---|---|---|---|---|
| SPA-01 | ACTUAL | E + I | Iso (the same guarded-update + awaited-reload shape exists on other screens: R3) | 3 sequential rounds per click: guard GET, PATCH, rows reload. The reload is not in the canvas (section 3). Removable part = 1 of 3 rounds |
| SPA-02 | OVERSTATED (as removable time); ACTUAL as a chain | E | Iso | 7-step chain is pinned by `SynchroniseProjectState`; only 1 round of 11 is removable without a decision, 3 requests more by narrowing the reload. Stage 1's "3-5 s" is mostly irreducible server time (7 sequential writes/reads incl. the 0.45-0.85 s project PATCH and 2 flow triggers) |
| SPA-03 | SHARED-ROOT (R8, flows inside the blocking job; with NET-17, SPA-04, and the overlay length of SPA-01/02) | A + N | Cross (General Data's Draft cancel calls the same flow inside its save, `general-data/hooks.ts:250-275`) | Flow duration is unmeasured and out of scope to change. Removable app-side: 1 round (the rows read, section 5). Seconds only via a non-blocking UX (DECISION) |
| NET-17 (T8 part) | ACTUAL (reliability, not speed) | A | Cross (Check List, General Data) | Ambiguous flow outcome: no deadline, no retry by design (non-idempotent). Needs owner wording (D165 T-08) |
| SPA-04 (= NET-18) | OVERSTATED | E + N | Iso | The wait is deliberate (NEW 6 Nov 2026, not in the canvas; the canvas shows the half-way state and tells the user to wait 30 s). Poll tuning saves at most the 1.5 s step quantisation (mean ~0.75 s) on a minority of gates. Real gap: the timeout is silent (CW-8) |
| SPA-05 | ACTUAL (cold visits only) | E + N | Iso (Team has its own Entra wave) | Mails are folded into the gates and approval-settings query functions, so a 2-hop read gates the loader and the row actions. Gain 1-2 Entra rounds, latency unmeasured |
| SPA-06 | UNRESOLVED | D + N | Iso | Needs the DEV test of bulk create (D138 B1) |
| SPA-07 | NOT-A-BOTTLENECK for user-visible time | I | Iso | Off the critical path, no overlay (empty plan skips the job); 3-4 small reads that overlap the gates/Entra rounds |
| SPA-08 | OVERSTATED | I | Iso | Fan-out = distinct Portfolio Managers (a handful); `lookupPersonShared` already dedups in-flight calls |
| SPA-09 | ACTUAL | A + E | Cross (all PM screens) | Confirmed by grep: `prefetchPmScreenReads` / `PM_SCREEN_LOADERS` are used only in `bootPrefetch.ts`. The delegated hover/focus intent pattern already exists for Generators (`generatorsWarmup.ts:40-86`) |
| SPA-10 | ACTUAL (speculative traffic); benefit UNRESOLVED | A | Cross | A lazy switch exists and is tested; waits for a hit-rate capture |
| SPA-11 | ACTUAL (data volume, partly platform-bound) | D | Iso | 540 kB per page is a repo measurement (D119 F4); the annotation constant is the SDK's (F6) |
| SPA-12 | UNRESOLVED | I | Iso | No profile; tests pin the URL-driven boxes |
| SPA-13 | SHARED-ROOT (R1, DEC-C held) | A | Cross | Decision-gated, owned with NET-22 |
| SPA-14 | ACTUAL, but the common case differs from Stage 1 | E | Iso | The frequent trigger is a shareholder edit (N sequential writes), not the start-cluster change. The shareholder writes are independent and can be concurrent now; the tracking rebuild waits for the same DEV order check as QA-07 |
| SPA-15 | UNRESOLVED (a correctness question first) | D | Iso | `fetchPage` sends `top: 5000` AND `maxPageSize: 500` (`client.ts:111-122`, `generalData.ts:281-296`): whether a page is cut at 500 is probe P-1 |
| SPA-16 | UNRESOLVED | D + I | Iso | 428 kB gzip lazy chunk at mount; no profile; form not blocked (Stage 1) |
| SPA-17 | NOT-A-BOTTLENECK (client side) | A | Iso | Server plugin time, canvas parity, business-relevant (recalculation) |
| SPA-18 | ACTUAL (small) | E | Cross | One extra read round off the paint path; decision is QA-09's DEV check |
| SPA-19 | ACTUAL (small) | I | Cross | One small extra project read per screen switch after 30 s |

Verdicts that changed or confirmed Stage 1 for a stated reason: SPA-01 confirmed and its decision weight lowered (canvas has no reload); SPA-02 downgraded from "3-5 s to attack" to "1-2 rounds removable"; SPA-03 re-framed as a shared root with a floor set by the flow; SPA-04 downgraded to OVERSTATED (deliberate behaviour, bounded gain); SPA-07 and SPA-08 downgraded to not-a-bottleneck; SPA-14 re-aimed at the common case; SPA-15 re-classed as a correctness probe first.

### Agent B

| ID | Verdict | Classification | Isolated / cross-screen | Note |
|---|---|---|---|---|
| SPB-01 | ACTUAL | execution order + implementation (one request per row, groups 8 wide) | isolated (Production), once per project | Stays P1 for the new-project journey. Fix in two steps: 16-wide groups first (D145's reason to refuse no longer holds, see 5.1), bulk allocations second |
| NET-13 | OVERSTATED | architecture (per-row writes) + data volume (N x L) | isolated (Generators) | At the DEV-measured size (20 turbines, 1 all-WTG cost) the save is 5 forced write rounds; bulk does not shorten it (S2B model: 2.3 s bulk against 2.0 s singles). Bulk pays only above about 60-100 rows. Downgrade P1 to P2 |
| NET-14 (SAD-04) | OVERSTATED | data volume + architecture (no bulk delete exists) | isolated (admin) | The critical path is the 16-wide delete phase; zeroing through `UpdateMultiple` leaves it unchanged. Volumes unknown. Downgrade P1 to P3 until counted |
| SCC-02 | OVERSTATED | implementation (pool width 4) + data volume | isolated (CAPEX panel) | The lever is the width, not the cascade (cascade took 5.2 s for one contract in D51 and the canvas parity argument is the other way round). Downgrade P1 to P2 |
| SAD-05 | ACTUAL | implementation (no unload guard) | isolated | Resilience, not speed |
| SAD-07 | SHARED-ROOT | architecture (guarded update = GET + PATCH per row) | cross-screen (5 admin screens) | Root of SAD-08, SAD-09 (part), the zero phase of NET-14 |
| SAD-08 | SYMPTOM of SAD-07 | execution order | isolated | Width 4 is deliberate (one server flow run per PATCH) |
| SCC-04 | OVERSTATED | execution order (background duplicate read) | isolated | Not on the Save's critical path (D51 timeline: onSuccess 8.1 ms) |
| SCC-06 | ACTUAL | execution order | isolated (Land Lease panel Save) | Guards of independent tables run in series |
| SCC-07 | ACTUAL | execution order (awaited reload) | isolated | Same trade Production and Generators already took |
| SCC-08 (NET-15) | OVERSTATED | architecture, product decision DEC-A | isolated | The canvas itself deletes children explicitly, so today's code is parity |
| SCC-09 | ACTUAL (smaller than stated) | implementation (width 8) + data volume | isolated | 16-wide captures most of the gain without a bulk path |
| SCC-12 | OVERSTATED | execution order | isolated | At most the second hop, 556 ms measured |
| SCC-13 | UNRESOLVED | server cost of a bulk row | isolated | Needs the P0.3 probe of `17-ADDCOST-SAVE-PERF-PLAN.md` |
| SPB-04 (NET-19) | OVERSTATED | execution order | isolated | Stage 1 quoted the pre-D144 baseline; D144 recorded live "after" numbers (4.30 s, 3.78 s) |
| SPB-07 | ACTUAL | implementation (delete-all and create-all) | isolated | Only a changed-rows write cuts rounds; bulk does not |
| SPB-08 | ACTUAL (small) | implementation (rewrites unchanged rows) | isolated | Switch exists and is OFF; bulk would add rounds |
| SPB-09 | ACTUAL | execution order (awaited reload) | cross-screen (Revenues, Finance; same shape as Land Lease SCC-07) | |
| SAD-03 | ACTUAL (small) | execution order | isolated | |
| SAD-09 | ACTUAL (small) | implementation | isolated | |
| SAD-14 | NOT-A-BOTTLENECK | design | isolated | The refetch is the panel's freshness rule |
| SPB-10 | NOT-A-BOTTLENECK | design | isolated | Chain bounded by guarantees already reviewed in D108 / D145 |
| SPB-15 | ACTUAL | implementation | isolated (every Generators save) | Needs a product answer before any skip |

Shared roots (doc 12): R3 (write engine per row, bulk OFF) holds SPB-01, NET-13, SAD-07, SAD-08, SAD-09, SCC-06, SCC-09, SCC-12, SCC-13, SPB-07, SPB-08, SPB-15, SPB-10. R4 (client cascade / clean-up) holds SCC-02, SCC-08, NET-14, SAD-05. T5 is a third, smaller root: the shared `usePlanWrite` default (`await` the reload) and the Land Lease `onSuccess` await.

### Agent C

Verdicts: SHARED-ROOT / ACTUAL / SYMPTOM / OVERSTATED / NOT-A-BOTTLENECK / UNRESOLVED. Classification: A = architecture, O = execution order, V = data volume, N = network latency, I = implementation.

| ID | Verdict | Class | Isolated / cross-screen | Note |
|---|---|---|---|---|
| SCC-01 | SHARED-ROOT (R1: entry design; group SCC-01, SPB-02, SPA-09, BND-17, SCC-15) | O + A | cross-screen (5 Cost screens) | Re-verified: `bootPrefetch.ts:45-57` starts only the session project for `kind: "cost"`; the gate (`routes.tsx:81-98`) holds the whole Cost subtree until `loadProject` (row, then country + state + area in parallel, `project.ts:275`) returns. Two waves sit in front of the first Cost read. Stage 1 confirmed |
| BND-01 | UNRESOLVED | A + N | cross-cutting | Needs a browser capture: all 8 start-up files are `modulepreload`ed in parallel (`dist/index.html`), so the cost is max(download, evaluate) of ~302 KiB gzip, not a chain. Whether it matters next to the host handshake is unknown |
| SPB-02 | SHARED-ROOT (R1) | O | per-screen, same mechanism | Confirmed for Production and Revenues (default 30 s keys). **Narrowed for Finance**: its project, inputs, repayments and step-up reads are `refetchOnMount: "always"` (`finance/hooks.ts:74`), so a settled prefetch is re-read on mount (section 4.2) |
| SPB-05 | UNRESOLVED | O | isolated (Generators) | Blocked on the unrun Generators probe P2-P5 (`GENERATORS-READ-PERF-DEV-PROBE.md`), a different list from D165 P-1..P-5. Nothing for me to add except to flip the existing switch |
| BND-09 | SYMPTOM (of BND-01) | I | cross-cutting | The blank page is the evaluation wait of BND-01, but it can be hidden without touching the graph: markup in `index.html`, styles in the existing CSS file |
| BND-12 | OVERSTATED | I | cross-cutting | The remedy "add the env-var read to the boot prefetch" gains ~nothing: `startBootPrefetch` runs at `main.tsx:15`, the first React render and `SessionProvider`'s `useQuery(environmentVariablesQueryOptions())` follow in the same turn. The real cost is the two sequential hops (`ENV_VARS_TOGETHER` OFF), which blocks nothing visible (`envVarsBlockFirstPaint` false) |
| BND-17 | ACTUAL (small) | O | isolated (admin) | `routes.tsx:51-56` lazies bypass `screenLoaders.ts`; non-Cost routes render the blocking overlay until the session loads (`App.tsx:75`), so the admin chunk starts only after it |
| RND-08 | OVERSTATED | A | cross-screen (non-Cost routes) | A visual blink and one shell mount (5-27 ms MEASURED by Stage 1), held for product (D162 item 42). Not a time loss |
| SCC-15 | ACTUAL (small) | O | isolated (CAPEX tab) | `useStandardAssumptions(subaccountIds)` waits for `book` (`Screen.tsx:403-409`, `useCostBook.ts:866-870`). Off the first-paint path; the key is order-sensitive, so a prefetch needs care |
| BND-02 | OVERSTATED (as P2, user-visible); real as a request amplifier | A (policy) | cross-cutting | Fires on `visibilitychange`, refetches only STALE ACTIVE queries, in the background with data on screen (no loader). Stage 1 wrote "window re-focus"; in TanStack 5.102 it is "page becomes visible again" (tab switch, minimise, and in Chrome a fully covered window), not a mere focus change |
| NET-08 | ACTUAL (small) | I | cross-screen | Confirmed in source: no `gcTime` anywhere in `src`; a 30-minute `staleTime` is moot after the default 5-minute gc once no observer holds the key |
| RND-10 | OVERSTATED | I | cross-cutting | A short `gcTime` on the cost book or the Add Cost sheet would fight the D51 design (patching an UNMOUNTED book and `refetchType: "all"`, `useCostBook.ts:~590-690`) and D165 C6 ("gcTime stays at its default"). Only typed-search keys merit it, and they are tiny |
| SAD-06 | SYMPTOM (of BND-02 / R2) | I | isolated (admin CAPEX Accounts) | Preset `FRESH_ON_ENTRY_ONCE` already exists (`adminQueryPresets.ts:16`). The has-contracts checks are advisory: the delete guards re-check on the server (`adminCapexAccounts.ts:332,340`) |
| SCC-14 | ACTUAL (small) | O + policy | isolated (CAPEX) | 30 s memo is a deliberate choice (`capexChart.ts:8-17`), reference data (class B) |
| NET-02 | OVERSTATED (latent) | I | cross-screen | Mechanism confirmed (a `Promise.all` over chunks fails whole; TanStack re-runs the whole function). Needs a failing chunk; its main cause (own fan-out earning a 429) is what NET-04 removes |
| NET-04 | OVERSTATED (impact); SHARED-ROOT with NET-05 (R6) | V + I | cross-screen | Binds only above ~16 chunks in flight (640+ ids in one call, or several wide calls together). Repo says "a few hundred contracts per category" (not measured): 400 contracts is 10 + 10 requests, under the 52 limit |
| NET-05 | SHARED-ROOT (R6, with NET-04) | A | cross-cutting (latent) | Confirmed: `requestGate` is referenced only from `requestPolicy.ts:28,188`; reads cannot enter it. Latent while `GLOBAL_GATE` is false |
| NET-16 | ACTUAL, with a correction to the Stage 1 remedy | A | cross-cutting | **Query reads never go through `sendWithPolicy`** (`fetchAll`, `client.ts:58-108`), so `REQUEST_DEADLINES` would not touch them even when switched on. The visible symptom of a hung read is an endless loader; of a hung write, the overlay |
| SCC-11 | ACTUAL (V) | V + A | isolated (CAPEX Summary), but it is the DEFAULT Cost landing | `resolveCategory(null)` gives the Summary tab (`capex-costs/rules.ts:93-101`), and Edit Costs carries no category (`costAppUrl`), so every Edit Costs lands on the heaviest Cost read. Volume still unmeasured |
| CMP-04 | NOT-A-BOTTLENECK today | I | cross-cutting (latent) | MEASURED above: with request-like tasks the O(N^2) pump is invisible to 3,500 queued writes and +3 % at 15,000; one 0.3 s submit stall at 15,000. Hygiene only |
| NET-03 | NOT-A-BOTTLENECK (as a fixable item) | A (platform) | cross-cutting | No abort in the SDK; the restart on invalidate is deliberate. Nothing to implement; the lever is a bounded read lane (NET-04) |
| NET-07 | UNRESOLVED | V + N | cross-screen | Needs row counts of the 17 whole-table reads. Only the generator catalogues and the CAPEX chart can plausibly exceed 500 rows |
| NET-21 | NOT-A-BOTTLENECK | A (platform) | cross-cutting | SDK adds `odata.include-annotations=*` (`dataverseDataOperationExecutor.js:207,234`); not changeable in the app |
| SPB-13 | OVERSTATED | V | isolated (Finance) | Already bounded (`mapLimit(..., READ_CONCURRENCY = 8)`, `finance.ts:45,198,237`) and lazy (`wanted`); both reads select one or two narrow columns |

### Agent D

Classification vocabulary: architecture / execution order / data volume / network latency / implementation.

| ID | Verdict | Classification | Isolated / cross-screen | Note |
|---|---|---|---|---|
| RND-02 | ACTUAL | implementation (request per keystroke) + data volume (up to 5,000 rows each) | Isolated: General Data, DE and FR projects | Mechanism re-verified at `general-data/hooks.ts:182-195`: raw `search` in the key, no debounce. Reframed: canvas Germany box has `DelayOutput: =true` (YAML 3634); the code app dropped it on purpose (`Screen.tsx:429-430`, user 3 Nov 2026) |
| RND-14 | UNRESOLVED | implementation (all Options mounted) + data volume | Isolated: General Data, German Areas | Cost is a jsdom-dev number (0.17 ms per Option); no layout in jsdom. Needs BM-01 |
| RND-01 | OVERSTATED (P2 to P3) | implementation | Isolated to Overview (shell part touches every URL change, but only the Overview changes its URL per keystroke) | Session context value is memoised on primitives (`SessionContext.tsx:~146-158`), so only `SessionProvider`, `App`, `AppShell`, `AppHeader` and the routes re-render. Measured shell cost is 0.67 ms per render in jsdom dev; production is lower. The URL-driven input itself is pinned by UT-OVUI-047 / UT-OVFIX-060 |
| CMP-01 | ACTUAL | implementation (redundant recomputation) | Isolated: CAPEX grid | Same dataset object re-parsed on every fold, year-independent filter, payer and options change (`GridRenderer.js:165`; `PcfGrid.tsx` keeps `currentDataset` stable). Magnitude is Node-synthetic (6.8 to 112 ms) |
| CMP-02 | UNRESOLVED | implementation (full tbody rebuild + 2 forced layouts) | Isolated: CAPEX grid | DERIVED only. Cannot be ranked against CMP-01 without a trace |
| CMP-03 | NOT-A-BOTTLENECK | implementation (deliberate trade-off) | Cross-cutting but cheap | 20 to 35 ms on a 60k to 100k object refetch, inside a refetch that costs seconds; it is what keeps unchanged refetches from re-rendering and protects CA-31. Only about 10 % over stock TanStack |
| CMP-05 | OVERSTATED | implementation | Isolated: Add Cost save success path | 13 to 60 ms once per Save in a path that is 1.6 to 1.9 s on DEV (D51 record). Free to fix, not worth a task |
| CMP-06 | ACTUAL | implementation (lazy first-edit pass) | Isolated: Add Cost sheet | The only T11 item with a real-browser number: D140 recorded the first key after opening at 141-155 ms against 21-28 ms afterwards (Edge, production build) |
| CMP-07 | NOT-A-BOTTLENECK | data volume (extreme sheets only) | Isolated | 90 ms at 15,000 rows; typical sheet is 210 rows x 10 years. The round trip it contains is the D51 safety net |
| CMP-09 | NOT-A-BOTTLENECK | implementation | Cross-cutting, immeasurable | 1.85 us against 0.69 us held; a 1,000-cell screen spends 2-6 ms |
| MEM-02 | OVERSTATED | data volume | Isolated | 8.2 MB typical; the extra copy exists for the D51 identity safety net, which must stay |
| SCC-21 | SYMPTOM of MEM-02 | data volume | Isolated | Same six representations, same screen, no heap measured. Close with MEM-02 |
| MEM-03 | UNRESOLVED | implementation (per-cell subscriptions) | Isolated | The 207-214 MB is jsdom drawing a 56 x 126 fallback window with no layout. D140 records 748 cells in the real page. Real heap unknown |
| MEM-04 | NOT-A-BOTTLENECK | implementation | Isolated | Token strings per distinct filter/sort/page; well under 1 MB; `invalidatePageTokens` already clears per table on writes (`client.ts:299-305`) |
| RND-04 | UNRESOLVED | implementation (a Tooltip per row control) | Cross-cutting mechanism, hot on 3 screens | 0.34 ms per Tooltip in jsdom dev; the 1,000-1,500 instance count is a D162 estimate. Real mount share unknown |
| RND-05 | UNRESOLVED | implementation | Isolated: Overview first paint | Fluent Table 2.5x a plain table in jsdom dev. The page also carries about 540 kB of payload per 200 rows (D119), which dominates |
| RND-06 | OVERSTATED | implementation | Cross-cutting, immeasurable | 0.76 ms per parent re-render with five closed panels, jsdom dev |
| RND-07 | UNRESOLVED | initialisation | Cross-cutting, first use per session | 116 ms first against 22 ms later in jsdom includes JIT warm-up. Griffel runtime style generation (no AOT) is plausible but unseparated |
| RND-09 | ACTUAL | implementation (side effect in render) | Isolated: Admin Project Gates (the only one of 8 `QueryStates` sites whose `fatal.text` traces) | CONFIRMED by bench. Telemetry integrity, not speed |
| RND-10 | OVERSTATED | data volume + policy | Cross-cutting | A tab normally holds one project (Cost screens cannot switch project in-tab; `Providers.tsx` comment). D165 rule C6 says `gcTime` stays at its default. Collides with agent C |
| RND-11 | OVERSTATED | implementation | Isolated | One extra render of a 933-line panel per open, after commit; seeded-once guard (`seededFor`) protects edits |
| RND-12 | NOT-A-BOTTLENECK | implementation (latent) | Cross-cutting, latent | No current consumer is affected; `useStableCallback` already compensates |
| RND-13 | UNRESOLVED | implementation (CSS) | Cross-cutting mechanism | Selectors are scoped to panel roots (`canvas.css` 653-729), about 20 `:has()` rules; a visual-parity risk to change |
| SAD-17 | UNRESOLVED | implementation | Isolated: Admin Cost | D162 FE-AD-09 deferred it with the trigger "more than 16 ms in a profile" |
| SCC-20 | UNRESOLVED | implementation | Isolated: CAPEX panel | D162 FE-C1-07 trigger "more than about 8 ms per keystroke". `categoryAccounts` and `PcfGrid` props are guarded; the rest of the 1,408-line body re-renders |
| SPB-17 | UNRESOLVED | implementation | Isolated: Revenues, Production | Calculation behind a keystroke is under 1 ms (SPB bench); render cost is dev-build jsdom only |

Roots. The T10/T11 findings share no root with each other except "no browser profile was ever taken". They touch R2 only through RND-10 (policy, not mechanism).

### Agent E

| ID | Verdict | Classification | Isolated / cross-screen | Note |
|---|---|---|---|---|
| BND-03 | ACTUAL | implementation (import path) | cross (Planning, Grid Operator, Revenues, Milestones; Production/Generators need the chunk anyway) | 3 rules files import two helpers through the Generators barrel although `domain/powerFxNumeric.ts:176,187` already owns them (OPT-33). Production's own import (`production/rules.ts:70`) is harmless: it reaches the barrel via `data/generators`. MEASURED -19.7 to -19.9 KiB gz on four screens |
| BND-04 | SHARED-ROOT (BND-18) | architecture (module coupling) | cross (Milestones, Revenues, General Data, cost screens) | Stage 1 undersized it. Three separate couplings: `data/revenues` -> `landLease`; Milestones/General Data -> `costBook` for two milestone functions (this also drags `landLease` and `capex-costs/rules`); General Data -> `data/checklist` for one cancel-path call. Together MEASURED Milestones 128.1 -> 67.6, Revenues 140.7 -> 103.6, General Data 118.0 -> 77.2 KiB gz |
| BND-05 | ACTUAL | execution order | isolated (General Data) | token request starts in `getToken` only after the 1.7 MB chunk has loaded and `new atlas.Map` ran (`ProjectMap.tsx:84-92`, `azureMapsToken.ts:150-170`); the flow round trip is serial after the download. A flow-call timing change: marked DECISION |
| NET-06 | ACTUAL | duplicate reads | isolated | confirmed (`routes.tsx:185` mounts both screens). Real only on a cold entry or reload of `/costs/add-from-table`; from the CAPEX button the book is cached. The reads are not identical (section 5.4) |
| SAD-01 | UNRESOLVED | data volume (unknown) | isolated (admin) | no row count of locking approvals exists; probe P3 |
| BND-06 | SHARED-ROOT (BND-18) | architecture | cross (13 of 22 screens incl. the landing and 6 admin screens) | MEASURED landing 55.6 -> 39.6 KiB gz, four cost screens -14.6, two admin screens -15 to -16. Needs `listProjectStates` to move AND its 6 importers to be repointed |
| BND-07 | SHARED-ROOT (BND-18); size OVERSTATED | architecture | cross (Finance, Production, Generators) | MEASURED -6.9 KiB gz (not 12): `bulkSend` itself (36 KiB min) stays; only the Add Cost sheet descriptor chain leaves |
| BND-08 | SHARED-ROOT (BND-18 + `costBook` scope coupling); UNRESOLVED size | architecture | cross (5 cost screens + Finance chunk) | facade-only fix measured as ineffective (section 4.8); real fix is splitting `costBook` by scope; needs a spike |
| BND-10 | OVERSTATED | implementation | cross (start-up) | net -9 KiB gz on the landing only, +3.7 on every other first screen (MEASURED) |
| BND-11 | UNRESOLVED (churn is real; its cost depends on the host cache) | architecture (chunk graph) | cross | MEASURED 80/149 names change on a no-source-change rebuild; the Stage 1 vendor-chunk direction changes it by 2 |
| BND-13 | SHARED-ROOT (with SPA-10, NET-20, SPB-16) | architecture / network | cross (every PM screen) | owned by agent A's T-A04; the switch `GENERATORS_WARMUP_LAZY` exists and is OFF |
| BND-14 | OVERSTATED | execution order | cross (telemetry-on) | 75 KiB gz competing with the first screen; parse-only 6.3 ms (Stage 1); no measured contention |
| BND-16 | NOT-A-BOTTLENECK (on current evidence) | network (request count) | cross | 80 files < 3 KB = 90 KiB total; 18 generated-service files = 19 KiB; parallel preload |
| BND-18 | SHARED-ROOT (the root) | architecture | cross | 46 value+type import statements from `data/**` into `features/**` in 28 files; about 10 are heavy cross-screen edges |
| NET-10 | OVERSTATED | network (parallel small read) | cross (8 PM screens) | one extra `top:1` read per first visit, in parallel with the screen's other reads; no wall-clock effect derivable |
| SAD-02 | ACTUAL | execution order | isolated (admin) | `useChecklistLocks(hasTabs)` and `useChecklistClusters(hasTabs)` at `Screen.tsx:154,156` wait for a read neither depends on |
| SAD-10 | NOT-A-BOTTLENECK | network (negligible) | isolated | one small extra read per scope change; the switch is OFF on purpose (failure coupling) |
| SAD-11 | OVERSTATED | execution order | isolated | six reads in parallel; the gain is `max(6) - max(2)`; and it changes the failure screen |
| SAD-13 | ACTUAL (small) | execution order | isolated | 3-4 dependent waves; first-visit only |
| SAD-15 | NOT-A-BOTTLENECK | safety read | isolated | the ownership re-check at save is a guard, not waste |
| SCC-16 | ACTUAL | implementation (key change) | isolated (CAPEX) | confirmed; `useCapexComments` is shared with the comments panel, so the fix must be opt-in |
| SCC-18 | OVERSTATED | duplicate read | isolated (OPEX) | one request; the two reads sit in different waves, so reuse needs a wait or a fallback read |
| SCC-19 | SHARED-ROOT (with BND-08) | architecture | isolated per screen, same root as BND-08 | cost chunks are prefetched beside the session (`bootPrefetch.ts`), so off the critical path on a fast link |
| SPB-06 | UNRESOLVED | data volume (unknown) | isolated | the catalogue read is in wave 1, parallel with the PV types (`queries.ts:109-110`); costs time only above 500 rows |
| SPB-12 | UNRESOLVED | network latency (Fabric, unmeasured) | cross (3 screens) | needs the `[VSB] DATA` lines of the Fabric reads |
| SPB-14 | ACTUAL | execution order | isolated | two sequential reads; the one-read replacement is coded and OFF |
