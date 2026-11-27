# 02 — Complete bottleneck inventory

> Stage 1, 26 Nov 2026. This is the readable inventory: every unique finding grouped by systemic theme, with a short root cause. The full 16-field rows are in doc 14; the evidence and execution paths are in the area documents (03-09) and the screen documents (10a-10d). Counts: 142 raw, 113 unique.

Priority key: P1 high impact on an important screen or journey; P2 moderate, measurable; P3 minor. Confidence: C = CONFIRMED, H = HIGH-CONFIDENCE, S = SUSPECTED. Origin: NEW, or PRIOR:<id> from the D162/D165 programmes (status re-checked in current source).

## T1 — Start-up and screen-entry waterfall (no prefetch of a screen's own reads; sequential boot chains)

11 findings.

| ID | P | Screen | Conf | Origin | Root cause (short) |
|---|---|---|---|---|---|
| SCC-01 (+NET-01) | P1 | CAPEX/DEVEX / Add Cost from Table / OPEX / Land Lease / … | H | NEW | A Cost deep link prefetches only the session project (scope full) and the chunk. The screen's own first reads (chart of accounts / SPV-DevCo mapping / project states / categories, and the contracts read that needs only the URL project id) start only after … |
| BND-01 | P2 | Cross-cutting | H | NEW | main.tsx statically imports App/Providers/bootPrefetch, so the ES-module graph (8 startup files: Fluent 499 KiB + react-dom/router/query entry 440 KiB + SDK chunk 70 KiB) must be fetched AND evaluated before startBootPrefetch (main.tsx:15) runs; the first … |
| SPA-09 | P2 | All PM screens (in-app navigation) | H | NEW | The PM screen prefetch (chunk + first reads) exists only for a deep link at boot; clicking the rail inside the app starts the lazy chunk and the screen's reads only after the click and the mount (no hover or focus intent) |
| SPA-13 (+NET-22) | P2 | Project Overview, General Data, any PM or Cost screen … | H | PRIOR:PB-04 | Edit Project and Edit Costs open a new tab; each new tab pays the whole cold boot again (host context, environment variables in 2 steps, user chain in 3, reference lists) |
| SPB-02 | P2 | Production / Revenues / Finance | H | PRIOR:PB-03 | A deep link or the new tab opened by "Edit Project" with pmScreen=production / revenues / finance prefetches only the session project and the screen chunk; the screen's own project-id-only reads (Production: project + yields; Revenues: project + contracts + … |
| SPB-05 | P2 | Generators | H | PRIOR:D142 | The first view has a two-wave chain: types are read first, then the turbines (key embeds the type ids) and the models (generator ids); both gate the list. The one-request by-project turbine read that would remove the chain is OFF pending a DEV probe of a … |
| BND-09 | P3 | Cross-cutting (first paint) | H | NEW | index.html has an empty #root; the only loading UI ("Please wait...") is React-rendered by App/LoadingOverlay after the whole startup graph (BND-01) has been evaluated, so the user sees a blank page until then (non-Cost routes show the blocking overlay until … |
| BND-12 (+NET-09, SPA-18) | P3 | Cross-cutting (header labels, telemetry, console gate) / … | H | PRIOR:PB-08 / PRIOR:PB-08 (PB-07 not … | Environment variables are two sequential Dataverse reads (definitions then values; ENV_VARS_TOGETHER is shipped OFF) that start only at the first React render (not in the boot prefetch) and gate Application Insights start, the Production console gate (held … |
| BND-17 (+SAD-16) | P3 | Admin Application Settings (6 screens) / Cross-cutting … | H | PRIOR:FE-AD-08 | The six admin screens bypass screenLoaders so a deep link /admin/* starts its chunk only at the first render (no boot prefetch) and each sibling visit is a fresh cold closure (23-39 files, 31-75 KiB gz) |
| RND-08 | P3 | Every non-Cost route on project open (PM, Overview with … | H | PRIOR:FE-SH-09 | [RENDER] While the session or project loads on non-Cost routes, App returns a blocking LoadingOverlay instead of the shell, so the header and rail mount only after the load and LeftNav loses its expand state (D162 FE-SH-09, held for product) |
| SCC-15 | P3 | CAPEX/DEVEX | H | NEW | The standard-assumption read and the Add Standard Contract options are keyed on sub-account ids that come from book.accounts (the chart), but the query is enabled only after the whole book resolved, so it starts a wave after the grid is visible although its … |

## T2 — Freshness and cache-lifetime policy (30 s staleTime + refetch on focus, no gcTime)

5 findings.

| ID | P | Screen | Conf | Origin | Root cause (short) |
|---|---|---|---|---|---|
| BND-02 (+NET-11, SCC-05, SPB-11) | P2 | Cross-cutting (every screen with active queries) / Cost … | H | PRIOR:OPT-18 / PRIOR:CA-10 (AD-04, … | QueryClient default refetchOnWindowFocus is true with staleTime 30 s: every return to the tab after 30 s refetches every stale ACTIVE query of the open screen (Generators 10-13 reads; Cost books; PM reads); only some hooks opt out (adminQueryPresets … |
| NET-08 | P3 | Navigation between screens | H | NEW | Reference data is kept fresh for 15-30 minutes but garbage-collected 5 minutes after its last observer unmounts (default gcTime 3e5), so the long staleTime only holds while some mounted screen observes the key; returning after more than 5 minutes re-reads it. … |
| RND-10 (+MEM-01) | P3 | Cross-cutting (cost book, add-cost-sheet, municipality and … | H | NEW | [HOOKS/STATE] gcTime is never set anywhere in src (grep), so every query key (per project, per category, per typed search term) stays in memory 5 minutes after its last observer leaves, and large payloads stay with it |
| SAD-06 | P3 | CAPEX Accounts | H | PRIOR:AD-04 | The account tree uses staleTime 0 with the global refetchOnWindowFocus, so every window focus re-reads the whole vsb_capexaccountlists table (all states, no filter); every expanded subaccount's has-contracts check is also refetched on focus after 30 s (gated … |
| SCC-14 | P3 | CAPEX/DEVEX | H | NEW | The chart of accounts is wave 1 of every cold category load (chart, contracts, payments) and is remembered only 30 s, although it is master data that changes only through admin writes (which already drop the memo in the same tab) and the tab strip already … |

## T3 — Write amplification: one request per row, guarded GET+PATCH, bulk switches OFF

19 findings.

| ID | P | Screen | Conf | Origin | Root cause (short) |
|---|---|---|---|---|---|
| NET-13 (+SPB-03) | P1 | Generators (Add WTG type, replace, status) / Generators | C | PRIOR:PA-01 | SWITCHED OFF: all six `GENERATORS_BULK` switches and `CHECKLIST_BULK.materialise` are false, so large Generators writes stay one request per row (8 or 16 wide) |
| SPA-01 | P1 | Cluster Check List | C | PRIOR:D150 | Every row action (Complete / In Progress / completion date / comment) is a guarded update (existence GET then PATCH, strictly sequential) inside a job whose awaited onSettled reloads the rows query; the full-screen overlay (busy) stays until the reload ends |
| SPA-02 | P1 | Cluster Check List | C | PRIOR:D150 | Move to next cluster = a pinned sequential chain (guarded update current tracking = GET+PATCH, guarded update next = GET+PATCH, note POST, project PATCH) then an awaited reload of 9 keys (about 6 active requests) then the next cluster's first-visit copy; all … |
| SPB-01 | P1 | Production | H | PRIOR:PA-07 | The first yield save of every new project runs the one-shot standard-contract generation: every land-lease allocation / period / OPEX / O&M row is its own POST, grouped only 8 wide (D145 widened the Save group to 16 but deliberately not the generation); bulk … |
| SAD-07 | P2 | Cross-cutting (Check List Settings, Milestones, Costs, … | H | PRIOR:AD-OP-03 | Every admin single-row and multi-row update is a guarded update: an existence GET by primary key followed by the PATCH (2 sequential round trips per row, 8 wide); the rows were usually read moments before, so the GET only narrows a delete race |
| SAD-08 | P2 | Check List Settings | H | PRIOR:AD-07 | Reorder and delete-with-renumber write every changed Order as its own guarded PATCH at width 4 (ORDER_WRITE_CONCURRENCY); each PATCH also fires a server flow that rewrites the task in every eligible project |
| SCC-06 | P2 | Land Lease (panel Save) | H | NEW | The panel Save runs three steps (contract, allocation, period) one after another and each step awaits its own key-only existence guard (CB-01) before its writes, so up to three guard reads are sequential although they cover different tables and depend on … |
| SCC-09 | P2 | Land Lease (Save with many allocations) | H | PRIOR:CB-06 | Allocation rows (one per generator when All WTG is on) are written one row per request, 8 wide, and each op (create, update, delete) is its own tier; period creates of a standard import stay serial (CB-07 residual) |
| SCC-12 | P2 | Add Cost from Table (Save with new contracts) | C | PRIOR:D76 | A Save that creates contracts has two serial hops: contract CreateMultiple, then the new contracts' cost rows (each binds the new contract). The deep insert that would merge them is built but OFF |
| SCC-13 | P2 | Add Cost from Table (large sheets) | S | PRIOR:B2 | Rows of one bulk request run serially on the server (about 22-32 ms per row inferred) with a sharing row and an audit row per create; the client can only split into more parallel requests |
| SPA-06 | P2 | Cluster Check List | C | PRIOR:D138 | The first visit to an empty cluster copies the default templates as N single creates (16 in flight, wideCopy ON) because the bulk create (CHECKLIST_BULK.materialise) ships OFF; a bulk request itself costs 1.2-1.9 s through the host |
| SPA-14 | P2 | General Data | H | PRIOR:PB-11 | On an edit save the tail (Draft reset, up to 7 tracking upserts, each shareholding entity, the Draft tracking) is a sequential plan; only the create path marks the follow-ups concurrent |
| SPB-04 (+NET-19) | P2 | Generators / Generators delete / replace | C | PRIOR:PA-05 | Replace Generator Type / Replace PV Module are 11-12 sequential waves (3 read waves, deletes, creates, roll-up, allocations); D144 merged some waves (replaceLanes ON) but the delete lane and create lane must not overlap, and the cancellation flow still runs … |
| SPB-07 | P2 | Revenues | H | PRIOR:PA-06 | Saving a contract with Individual hedge volumes deletes every stored volume and re-creates every volume, changed or not; the delete group and the create group are each 16 wide but run one after the other after the contract write |
| SPB-08 | P2 | Finance | H | PRIOR:PA-03 | A tranche Save rewrites every repayment-year and step-up row (changedRowsOnly OFF: modifiedon/audit parity with the canvas ForAll(Patch)); the two switches that would change the write count are OFF |
| SAD-09 | P3 | Costs | H | PRIOR:AD-10 | Editing Period 1 of an OPEX / Land Lease standard contract re-writes the contract-level fields of every later period (guarded, 8 wide) even when none of them changed |
| SPA-17 | P3 | Milestones | S | NEW | Every Milestones save sends vsb_operationsstartdatecod, vsb_construction and vsb_enddate (canvas parity), so the server plugin steps (synchronous repayment rebalancing and price date sync, asynchronous decommissioning sync) run on every save even when the … |
| SPB-10 | P3 | Production | H | PRIOR:D145 | A yield Save is a chain of awaited steps that each protect a standing property: 4 parallel pre-reads, the yield write alone, the 16-wide group, then a fresh read of yields + project and the roll-up PATCH. D145 reviewed and cut the remaining levers (roll-up … |
| SPB-15 | P3 | Generators | C | PRIOR:PA-04 | Every Generators save writes the plant roll-up to vsb_projects even when the totals did not change; it is the slowest single write and fires the Fabric-sync flow |

## T4 — Long or destructive multi-request operations (cascade deletes, clean-ups)

4 findings.

| ID | P | Screen | Conf | Origin | Root cause (short) |
|---|---|---|---|---|---|
| NET-14 (+SAD-04) | P1 | Admin CAPEX Accounts clean-up / CAPEX Accounts | H | PRIOR:AD-02 | OPEN volume: the clean-up is now resilient (`CLEANUP_RESILIENT` = true) but still sends 2 requests per zeroed row and 1 per deleted row, per row (T-43 not started) |
| SCC-02 | P1 | CAPEX/DEVEX (panel Delete) | H | PRIOR:CA-14 | Deleting a contract runs four strictly sequential phases: comments read, comment deletes (4 wide), cost-row deletes (4 wide: ceil(months/4) rounds), contract delete, then an awaited refetch. The Dataverse cascade (contract to cost rows and comments, relied on … |
| SAD-05 | P2 | CAPEX Accounts | H | PRIOR:AD-01 | The clean-up is a browser-side loop that is not tied to anything the user can see once the dialog closes: no beforeunload guard, no persisted job, and no Resume action (D165 left it to the owner); a tab close or reload silently stops it half-way and the only … |
| SCC-08 (+NET-15) | P2 | Land Lease (delete contract) / Land Lease contract delete | H | PRIOR:CB-04 | A contract delete sends every child delete (allocations 16 wide, periods tiered, then the header) although the header delete cascades its children; 40 allocations + 3 periods = 44 requests in 7 waves |

## T5 — Saves that wait for a reload before the user can continue

5 findings.

| ID | P | Screen | Conf | Origin | Root cause (short) |
|---|---|---|---|---|---|
| SCC-04 | P2 | Add Cost from Table -> CAPEX/DEVEX | H | PRIOR:CA-06 | After a successful Save the cached category book is patched from what was written, yet a confirming refetch of the whole category book (chart / contracts / payments chain) starts at once with refetchType all, and a second identical refetch runs when the … |
| SCC-07 | P2 | Land Lease | H | PRIOR:CB-15 | Every Land Lease write awaits a reload of the whole lease book (headers, then periods + allocations + currency names = 2 waves, 4 requests) before the save resolves, although the writes already know the rows they changed |
| SPB-09 | P2 | Revenues / Finance | H | NEW | Revenues and Finance saves keep the progress dialog open until the reload reads have answered; Production and Generators close the dialog when the writes land and reload behind it (holding commands while refreshing). Revenues balancing needs the awaited … |
| SAD-03 | P3 | Check List Settings | H | NEW | After a Completion Date toggle succeeds, onSuccess awaits BOTH the tab's task refetch AND the environment-wide locks refetch; the toggled row stays pending (runner inline) until both finish, although vsb_iscompletiondate cannot change which approvals lock a … |
| SAD-14 | P3 | Milestones | H | PRIOR:FE-AD-04 | Pressing Edit refetches the whole assumptions table under a blocking overlay before the panel opens (canvas Refresh parity), and the draft lives in the screen state so each keystroke re-renders the page and recomputes evaluatePanel |

## T6 — Read fan-out, chunking, gates, retry and cancellation

11 findings.

| ID | P | Screen | Conf | Origin | Root cause (short) |
|---|---|---|---|---|---|
| NET-02 | P2 | Cost (CAPEX, Add Cost sheet, Land Lease, Contracts) and … | H | NEW | ASYNC: A query function that is a Promise.all over id chunks fails as a whole when ONE chunk fails, and TanStack then retries the WHOLE query function (2 retries, 1-2 s jittered wait for a 429), re-sending every chunk that had succeeded. D165 T-14 … |
| NET-04 (+SCC-10, NET-12) | P2 | Cost (CAPEX, Add Cost, Land Lease, Contracts, OPEX … | H | NEW (extends deferred OPT-09) / … | ASYNC: 17 read sites are Promise.all over `chunk(ids).map(fetchAll)`; their width is ceil(N/40) with no bound. Per-pool limits (8/16/4) and the planned global gate cover writes only, and these reads are outside every gate (OPT-09 stayed deferred) |
| NET-05 | P2 | All screens (planned global gate) | H | NEW (extends PRIOR:WE-03) | ASYNC: The D165 global gate (ceiling 40, write lane 24, `GLOBAL_GATE` = false) is entered only by `sendWithPolicy`, which write paths and a few verify/existence reads use; every query read goes through `fetchAll` and cannot enter it. Switching it on would cap … |
| NET-16 | P2 | All screens (every request and flow call) | C | PRIOR:CA-02 | ASYNC: `REQUEST_DEADLINES` is false and the SDK has no timeout or abort, so a hung request or a hung flow run holds its caller, the Cost write lock (`useCostWriteFlight.ts`) and gate slots for as long as the host takes; a deadline can only stop WAITING |
| SCC-11 | P2 | CAPEX/DEVEX Summary | H | PRIOR:CA-13 | The Summary tab reads every monthly cost row of every contract of the project (two columns, 5,000-row pages, ceil(C_all/40) chunks, pages sequential inside a chunk) to produce five numbers; no server aggregate is available through the SDK |
| SPA-11 | P2 | Project Overview | C | PRIOR:D119 | Each 200-row page carries 22 columns with Dataverse annotations (odata.include-annotations=* is an SDK constant) and every page view also sends a 1-row blank probe; page 2 is prefetched speculatively at +1.5 s; a window focus after 30 s re-downloads the page |
| CMP-04 | P3 | Cross-cutting (latent: every bulk write path if GLOBAL_GATE … | C | NEW | createRequestGate keeps one FIFO array; every submit and every completion calls pump(), which scans from index 0 and skips queued writes while the 24-write lane is full; the scan and splice(i,1) are O(queue), so N queued tasks cost O(N squared). |
| NET-03 (+MEM-05) | P3 | All fan-out reads; Cost save invalidation; screen switches … | H | NEW / PRIOR:FE-04-async-after-unmount | ASYNC: No query function consumes TanStack's `signal` and the SDK has no abort path, so `cancelQueries`, `invalidateQueries` (cancelRefetch defaults to true) and unmounting a screen discard only the RESULT; every chunk request already sent keeps running and … |
| NET-07 | P3 | Any read of a table that can exceed 500 rows; 17 … | S | NEW | `fetchAll` asks for 500 rows per page at 152 of 157 sites (5 raise it to 5000) and pages are strictly sequential (skip token), so each 500 rows beyond the first page add a round trip; 17 whole-table reads (catalogues, countries, currencies, member … |
| NET-21 | P3 | Every read | H | PRIOR:D119-F6 | The SDK adds `odata.include-annotations=*` to every read, so each row carries formatted-value annotations whether or not the screen uses them; a platform constraint |
| SPB-13 | P3 | Finance | S | NEW | The Equity panel's CAPEX total and the Decommissioning card's turbine count are computed by reading all rows (KNOWN-RISKS R-10: no server-side aggregates in this app); the count has the paged-count helper (countedPage, D41) available but does not use it |

## T7 — Redundant, eager or over-wide reads

16 findings.

| ID | P | Screen | Conf | Origin | Root cause (short) |
|---|---|---|---|---|---|
| NET-06 (+SCC-17) | P2 | Add Cost from Table on a deep link or reload / Add Cost … | H | NEW | The route `/costs/add-from-table` mounts the CAPEX screen AND the Add Cost screen in one element; on a cold entry both load the same contracts and cost rows under two keys (`cost-book`, `add-cost-sheet`) with different selects |
| SAD-01 | P2 | Check List Settings | H | PRIOR:AD-OP-61 | The lock set is ONE fetchAll over every locking Check List Default Approval of the whole environment (all configured country x Wind/PV scopes), re-read on every mount (FRESH_ON_ENTRY_ONCE); pages follow the skip token one after another at 500 rows; while it … |
| SPA-05 | P2 | Cluster Check List | H | PRIOR:D156 | The first usable screen waits for the gate rows and then one Entra (Graph-backed aadusers) lookup per portfolio manager; the row actions that depend on approval mode wait for the approval settings and a second Entra round. The mail is only used for a tooltip … |
| NET-10 (+SPA-19) | P3 | PM screens (Checklist, Team, Milestones, General Data, … | H | PRIOR:PB-10 | Each PM screen reads the same project row again under its own key and select besides the session project (`qk.projectPm`); only Planning and Grid Operator share one key (`PM_PROJECT_ROW_SHARED`) |
| SAD-02 | P3 | Check List Settings | H | NEW | The environment-wide locks query (and the shared states read when cold) is enabled only after the tabs list has arrived (enabled = hasTabs) although neither depends on the tabs, so the entry path is tabs -> [clusters, tasks, locks] instead of everything in … |
| SAD-10 | P3 | Costs | H | PRIOR:AD-09 | ADMIN_SCOPE_READS_ONCE is OFF (integration decision), so each scope reads the OPEX table twice (38 columns active, 5 columns inactive) and the hierarchy reads vsb_capexaccountlists a second time; the three scope reads refetch on every focus after 30 s |
| SAD-11 | P3 | Costs | H | NEW | The whole screen content waits for all six reference reads (countries, hierarchy, Land Lease subaccounts, OPEX subaccounts, currencies, payer defaults) although currencies and payer defaults are used only inside the drawers and the subaccount lists only by … |
| SAD-13 | P3 | Project Gates | H | PRIOR:AD-06 | The dataset is a dependent chain (checklist header -> checklists -> approvals in chunks of 40 -> unresolved Portfolio Managers) beside the templates read, and the whole screen waits for all of it including the Entra people lookups; the same chain reruns on … |
| SAD-15 | P3 | Contracts (standard BoP contracts) | H | PRIOR:AD-OP-50 | The DevCo link list of the scope is read three times in one edit cycle (Edit open refetch, the ownership re-read at save, the post-save invalidation), each through a navigation-property filter on the parent lookup (a server-side join) |
| SCC-16 | P3 | CAPEX/DEVEX | H | NEW | The screen-level comment query is keyed on the sorted contract id list and has no placeholder data: creating or deleting a contract changes the key, the red comment dots disappear and every comment thread of the category is read again (ceil(C/40) requests), … |
| SCC-18 | P3 | OPEX (O&M) | H | NEW | One O&M visit reads vsb_devicetypesinprojects twice: the book reads (id, name) for the devices its periods point at, and the device-type query reads (id, name, type) for all of the project's types |
| SPA-07 | P3 | Cluster Check List | H | NEW | D158 completeCopy: for a cluster that already has rows and whose rows are not cached as worked on, every visit first reads all rows of the cluster (5 columns) and then the templates (scope memo + templates, 30 s cache) to decide that nothing is missing |
| SPA-08 | P3 | Cluster Check List | H | NEW | entraMails starts one getEntraPeople([id]) per distinct portfolio manager through Promise.allSettled, so the 6-wide cap of getEntraPeople (OPT-17b) never applies (each call has one id) |
| SPB-06 | P3 | Generators | S | NEW | The whole PV module catalogue is read, paged 500 sequentially by fetchAll, before the first view, only to join the supplier name onto the project's own PV types; a wind-only project has no PV types. The inverter/substructure equivalents already read only the … |
| SPB-12 | P3 | Production / Finance / Revenues | S | NEW | Reads that only a panel, a seed or a first-visit write consumes start at screen load: Production's Fabric seasonality/negative-price read, Finance's whole banks and KfW tables plus the repayments and step-ups of all tranches, and the AssumptionsRevenue … |
| SPB-14 | P3 | Generators | H | PRIOR:PA-15 | Selecting a WTG or PV type triggers two sequential reads (device-type rows, then active O&M costs on them); Delete / Deactivate stay disabled until the answer is known |

## T8 — Power Automate flow dependencies (flows not modified)

3 findings.

| ID | P | Screen | Conf | Origin | Root cause (short) |
|---|---|---|---|---|---|
| NET-17 | P1 | Cluster Check List, General Data (flow calls) | H | PRIOR:PB-01 | NOT started (T-08): flow calls run inside the blocking write job after the PATCH, are never retried and have no deadline; an ambiguous failure can duplicate an approval or leave a task stuck; no latency of any flow is recorded in the repo |
| SPA-03 | P1 | Cluster Check List | H | NEW | Request Approval and Cancel keep the UI blocked inside one job for: trackings list, guard GET, PATCH, then the Power Automate Run, then rows read, note POST and a 9-key reload. Run returns only at the flow's Respond action (approval flows) or at the END of … |
| SPA-04 (+NET-18) | P2 | Cluster Check List / Cluster Check List (Request Approval … | H | NEW | For an active Only-Notifications gate the screen sleeps 1.5 s before the FIRST poll and then polls one tracking per 1.5 s for at most 30 s until the flow has completed the cluster; the flow completes it only after its notification fan-out (Teams card + mail … |

## T9 — Bundle and module coupling

14 findings.

| ID | P | Screen | Conf | Origin | Root cause (short) |
|---|---|---|---|---|---|
| BND-03 | P2 | Planning / Grid Operator / Revenues / Milestones | H | NEW | The four screens import forLanguage/textFormat through the Generators rules barrel (export * of 7 modules); the helpers live in domain/powerFxNumeric.ts, but features/** modules are not marked side-effect free (vite.config.ts:72 exempts only … |
| BND-04 | P2 | Milestones / Revenues / General Data | H | NEW | Screen-to-screen static data coupling of the FE-P2-05/06 class that D162 fixed only for Finance and Production: Milestones imports data/revenues for 2 functions (which pulls landLease and milestones data); Revenues data imports … |
| BND-05 | P2 | General Data (Edit Project / New Project) | H | PRIOR:FE-P1-01 | The map chunk now starts with the screen (FE-P1-01 done) but the SAS token (a Power Automate flow run) is requested only from the SDK getToken callback after the 1.7 MB chunk has loaded and new atlas.Map ran; the optional warm-up of azureMapsToken() … |
| BND-06 | P3 | Project Overview (landing) and 12 other screens | H | NEW | The shared project-states list lives in data/projectStates.ts which imports listProjectStates from data/generalData.ts, which statically imports the 1,300-line General Data rules module; so every screen that reads the shared list carries General Data rules + … |
| BND-07 | P3 | Finance / Production / Generators / Contracts / OPEX / Land … | H | NEW | The generic bulk transport bulkSend.ts imports CAPEX_CONTRACTS/CAPEX_COSTS from addCostSheetBulk.ts (Add Cost sheet specific), which imports add-costs-from-table/rules.ts; generatorsBulk (used by Finance/Production/Generators) imports bulkSend, so PM screens … |
| BND-08 | P3 | CAPEX / OPEX / Land Lease / Contracts / Add Cost; Finance | H | PRIOR:FE-C2-08 | D162 FE-C2-08 (costRepository facade statically imports every Cost read and write module) and FE-P2-07 (Finance 136 KiB single chunk) were deferred and are still true: useCostWriteFlight chunk 125.1 KiB min / 37.5 gz carries OPEX rules, period writes, capex … |
| BND-10 | P3 | Cross-cutting (every screen opening Report a problem) | H | NEW | App statically imports ReportProblemPanel (closed until the Help menu is used) which pulls FormPanel -> Fluent Drawer, TextArea, ConfirmDialog/Fields/CanvasFields chain into the entry; STARTUP_FLUENT lists react-drawer and react-textarea for this |
| BND-11 | P3 | Cross-cutting (every release) | C | NEW | The entry chunk holds react-dom/react-router/query-core (about 300 KiB min of 440) AND the preload map naming every lazy chunk; any change to any chunk (here the build timestamp __APP_BUILD__ embedded in the Generators Screen chunk) changes the entry hash, … |
| BND-13 (+SPA-10, NET-20, SPB-16) | P3 | Every Project Management screen / All PM screens / Every PM … | H | PRIOR:PB-09 | The Generators warm-up (GENERATORS_WARMUP_LAZY shipped OFF) starts 1.5 s after any PM screen of a valid project opens: it downloads the whole Generators chunk graph and starts 10 speculative reads, most never used |
| BND-14 | P3 | Cross-cutting (telemetry-on environments) | S | NEW | As soon as the env-var read lands the 194 KiB (74.6 KiB gz) Application Insights SDK is fetched, parsed and started with no idle/yield, at the same time as the first screen chunk and reads; every SDK networkRequest metric then also builds a dependency item |
| BND-16 | P3 | Every screen (cold visit) | S | NEW | The build emits 155 JS files, 80 of them under 3 KB (one per generated service, small data modules, hooks); a cold CAPEX visit fetches 43 lazy files (32 under 3 KB) plus the 8 startup files and 2 CSS |
| BND-18 | P3 | Cross-cutting | H | NEW | The data layer imports from features/** (alias imports: data -> cost/capex-costs 9, cost/costing 7, cost/periods 6, cost/contracts 4, pm/general-data 3, cost/add-costs-from-table 3, pm/milestones 2, pm/generators 2 and more) so a shared data module drags a … |
| SCC-19 | P3 | CAPEX/DEVEX | H | NEW | The CAPEX screen statically pulls Land Lease and OPEX code through useCostBook / costRepository: the shared chunk useCostWriteFlight (contracts, periods and capex rules) plus the landLease data chunk |
| SPA-16 | P3 | General Data | S | PRIOR:FE-P1-01 | The Azure Maps chunk (1,658 kB min / 427.8 kB gzip, MEASURED bundle-report on the current dist) is fetched at mount beside the reads and parsed on the main thread while the form is usable; the map authenticates through the Get Azure Maps SAS Token flow … |

## T10 — React rendering and state

15 findings.

| ID | P | Screen | Conf | Origin | Root cause (short) |
|---|---|---|---|---|---|
| RND-01 (+SPA-12, BND-15) | P2 | Project Overview (any screen whose URL search changes) / … | H | PRIOR:FE-P1-04 / NEW | [RENDER] Keyword and capacity boxes are controlled from the URL: every keystroke is a router navigation, so SessionProvider (useLocation), App, AppShell, AppHeader (none memoised; App passes new inline closures each render), Routes and the Overview screen all … |
| RND-02 (+CMP-08, SPA-15) | P2 | General Data (Germany and France municipality combobox) / … | H | NEW / PRIOR:OPT-19 / PRIOR:PB-02 | [HOOKS/STATE] The municipality search state (muniSearch) feeds the query key raw: no useDebouncedValue, unlike every other typed-search hook (Entra in General Data and Team, Overview keyword and capacity, Admin Gates people). Each keystroke (Germany: from the … |
| RND-14 | P2 | General Data (Germany, Bavaria about 2,000 municipalities) | H | PRIOR:FE-P1-02b | [RENDER] The municipality Combobox mounts every Option (up to 5,000) when focused or searched; D162 only memoised the element array (FE-P1-02a) and deferred the windowed listbox (FE-P1-02b) pending a profile |
| CMP-02 | P3 | CAPEX/DEVEX costs (Cost app) | H | PRIOR:FE-C1-06 | render() clears tbody and rebuilds every visible row on any change; renderColGroup runs twice (before the rows and again in fitColumnsToScrollViewport after they are attached); the second pass reads clientWidth (forces layout of the finished table), rewrites … |
| RND-04 (+SAD-12) | P3 | Admin Project Gates, Admin Check List Settings, PM Check … | H | NEW / PRIOR:FE-AD-01 | [RENDER] A Fluent Tooltip (positioning, popover and context machinery) is created per row control instead of one per table; 52 literal Tooltip sites, several inside rows that repeat 100-250 times (Gates about 4-5 per task row) |
| RND-05 | P3 | Project Overview | S | NEW | [RENDER] The landing grid is a Fluent Table with 200 rows x 12 TableCell per page (2,400 cells + 200 rows), mounted from scratch on first load and on every page change; rows are memoised so re-renders are cheap, but mount is not |
| RND-06 | P3 | Cross-cutting (45 FormPanel sites, 36 ConfirmDialog sites; … | S | NEW | [RENDER] Closed panels cost nothing in the DOM (Fluent Drawer unmountOnClose defaults to true, verified in node_modules/@fluentui/react-drawer useDrawerDefaultProps.js) but every FormPanel keeps its hook tree alive (useDiscardGuard builds a ConfirmDialog … |
| RND-07 | P3 | Cross-cutting (first panel, dialog or dropdown opened in a … | S | NEW | [RENDER] The first use of a Fluent overlay family initialises Griffel runtime styles (no AOT plugin in vite.config.ts), tabster/modalizer and motion; only the Generators panels are warmed at idle (D143). Every other screen pays it on the user's first click |
| RND-09 | P3 | Admin Project Gates (pattern reusable by any QueryStates … | C | NEW | [HOOKS/STATE] QueryStates calls fatal.text(error) during RENDER and userErrorText has a side effect (trace error): every re-render of an error state appends a trace entry, prints a [VSB] ERROR line (non-Prod) and fans out to the Application Insights sink; the … |
| RND-11 | P3 | CAPEX comments panel | H | NEW | [HOOKS/STATE] An effect copies query.data into local state (setWorking plus 4 further setState calls) when the panel opens, costing a second render of the 933-line panel after commit; D162 doc 03 recorded that no effect copies query data into state, which … |
| RND-12 | P3 | Cross-cutting (hooks used by every screen) | S | NEW | [HOOKS/STATE] Five shared hooks return a fresh object literal on every render, so the returned object can never be an effect dependency or a memoised child's prop (D162 had to pass runner.isPending and primitives instead; FE-P2-09 hit the same in Finance) |
| RND-13 | P3 | Panels and forms on Finance, OPEX, Check List, Contracts | S | NEW | [RENDER] Descendant :has(:disabled) and :not(:has(:disabled)) selectors are applied through root-level classes to every Input, Dropdown, Combobox and Textarea in a panel, so focus, hover and disabled flips force style re-evaluation of the subtree |
| SAD-17 | P3 | Costs | S | PRIOR:FE-AD-09 | DevexCostTree and OpexContractTable are not memoised and render every row of an open section (DEVEX rows only for expanded categories; OPEX contracts all expanded by default), each row with comment / edit / delete buttons and tooltips, and call forRecord() … |
| SCC-20 | P3 | CAPEX/DEVEX (Add/Edit panel) | S | PRIOR:FE-C1-07 | A keystroke in the panel renders the whole 1,408-line screen (toolbar dropdowns, dialogs, O(lines) derivations); PcfGrid itself is guarded by value comparison (OPT-25) |
| SPB-17 | P3 | Revenues / Production | S | PRIOR:D146 | All panel form state lives in the screen component, so a keystroke re-renders the screen body: the volume rows and card fields are memoized (D146 C3, ContractCardFields) but each card's header, command bar and the panel's other fields are not |

## T11 — CPU and memory in the data path

10 findings.

| ID | P | Screen | Conf | Origin | Root cause (short) |
|---|---|---|---|---|---|
| CMP-01 (+SCC-03) | P2 | CAPEX/DEVEX costs (Cost app) / CAPEX/DEVEX grid | C | PRIOR:FE-C1-06 | The vendored Canvas-host parser probes up to 20 alias column names per field through getValue and then getFormattedValue (a miss costs two calls plus a fresh alias array and template strings), for 12 months x 4 field families, and re-scans every column with … |
| MEM-03 | P2 | Add Cost from Table | S | PRIOR:D140 | react-spreadsheet keeps per-cell state subscriptions and fibers for every drawn cell. The D140 window limits drawn rows to the viewport plus 15 each side, and drawn columns only once widths are pinned (columns window is null before that, so the drawn rows are … |
| CMP-03 (+RND-03) | P3 | Cross-cutting (CAPEX, Add Cost from Table, Contracts) / … | C | NEW | The default structuralSharing deep-walks the whole previous and the whole new result of every refetch of every query (D162 decision D-1), including the cost book payment arrays and the Add Cost sheet cost rows. Cost is linear in objects but runs on the main … |
| CMP-05 | P3 | Add Cost from Table (after Save) | C | NEW | patchPayments runs for every line of the cached book and always copies the line payments with filter and builds an id-to-index Map, even when the Save touched no cost of that contract and deleted none; it then returns null after the allocation. |
| CMP-06 | P3 | Add Cost from Table | C | PRIOR:D140 | cleanRows is empty after a load, so the first edit after opening runs the cell rules and dressing over every row of the sheet; later edits reuse clean rows. |
| CMP-07 | P3 | Add Cost from Table (load, paste, Add Row, Delete Row) | C | PRIOR:FE-C1-05 | On load the screen runs buildInitialSheet, sheetRowsToGrid, gridToJson and outputRowsToSheetRows in one synchronous useMemo; react-spreadsheet then builds two Models over every cell for each grid hand-off. Cells are one object each (about 190000 cells at … |
| CMP-09 | P3 | Cross-cutting (every money cell, date and sorted list) | C | PRIOR:OPT-29 | The pooled Intl.NumberFormat, Collator and DateTimeFormat helpers build their cache key with JSON.stringify(options) on every call, so a pooled call costs 2-4 times a held formatter. |
| MEM-02 | P3 | Add Cost from Table | C | NEW | The sheet is held in at least six representations at once: the query data (subaccounts / contracts / costs), loaded.loadedRows, loaded.grid, loaded.roundTripped, the originalRows state (same reference as roundTripped) and the currentRows state (a second array … |
| MEM-04 | P3 | Project Overview (any countedPage caller) | H | PRIOR:FE-04-module-caches | tokenCache gets one entry per (table, filter+sort signature) the first time that signature is walked, and an entry is removed only by a write to that table in the same tab (invalidatePageTokens) or resetPageTokens, which no app code calls. It is not cleared … |
| SCC-21 | P3 | Add Cost from Table | S | NEW | While the sheet is open it holds the query data, loadedRows, the seeded grid and a decorated copy of it (react-spreadsheet state), roundTripped, originalRows and currentRows: several full-size copies of the sheet |

