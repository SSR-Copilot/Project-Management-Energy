# 11 — Critical user journey analysis

> Stage 1, 26 Nov 2026. Assembled by the orchestrator from the journey sections of the four screen-group documents. Each journey names its critical path, the sequential dependencies, what could run in parallel, the longest operation and the user-visible delay. Timings are labelled MEASURED, DERIVED or ESTIMATED as in the source sections. The cross-cutting journeys (application start-up, tab return, screen switch) are summarised first because they affect every screen.

## 0. Cross-cutting journeys

| Journey | Critical path (current code) | Longest / most avoidable step | Findings |
|---|---|---|---|
| Application start-up | Download and evaluate the 302 KiB gzip start-up graph (8 files, V8 parse about 34 ms) -> React renders -> host context -> project row (then country/state/area on a second wave) -> screen chunk -> screen reads. Boot prefetch only starts after the graph has run. | The screen's own reads are not prefetched for Cost screens and for the Production/Revenues/Finance deep links; Cost reads wait behind `CostProjectGate` (about 0.4-1.0 s per cold Cost entry, ESTIMATED) | BND-01, SCC-01, SPB-02, BND-09 |
| Open a screen from the rail inside the app | Chunk download starts at click, then the screen's reads (prefetch exists for boot deep links only) | One chunk waterfall plus 1-3 read rounds per first visit | SPA-09, BND-17 |
| Edit Project / Edit Costs from the Project Overview (new tab) | Whole cold boot again in the new tab | Host context, environment variables (2 sequential reads), user chain, chunk | SPA-13 (DEC-C held) |
| Return to the browser tab after 30 s | Every stale active query of the screen is refetched, including fan-out chains | CAPEX category chain (3 waves) and Generators reads | BND-02 group (DEC-F / DEC-3 held), SAD-06 |
| Save, then continue working | Write waves, then (on Land Lease, Revenues, Finance, Check List) an awaited reload before the dialog or overlay closes | The reload, which is as long as a read wave | SCC-07, SPB-09, SPA-01 |

## 1. Cost module (source: doc 10a section 6)

Per-hop latency is not measured for reads; where I give seconds they are the repo's own measurements.

##### J1. Open a screen (cold deep link: "Edit Costs" new tab, reload, bookmark)

Critical path: host context, session project row, project lookups (2 hops), gate, then the screen's own chain: CAPEX 3 hops (chart, contracts, payments), Add Cost 3 hops (chart, contracts, costs), OPEX 2, Land Lease 2, Contracts 2. Then render (CAPEX parse + DOM; Add Cost build about 95 ms at 15,000 rows, a few ms typical).
Parallelisable today: the screen's chunk (prefetched at boot), the project-independent reads that are not started until the gate opens (SCC-01: chart, mapping, states, categories; contracts by URL project id), standard assumptions from the chart (SCC-15), the two duplicate downloads on add-from-table (SCC-17).
Longest step: CAPEX/Add Cost: the cost-row read (all months of the category; pages of 5,000 sequential within each of `ceil(C/40)` chunks). Contracts: DevCo cost rows.

##### J2. Open a screen already visited this session (tab switch / return)

CAPEX: new category key, 2-3 hops (chart memo 30 s, SCC-14), comments and payments again; returning inside 30 s is served from cache. Add Cost: fresh sheet read on entry (by design). OPEX: book + device types re-read on every mount (canvas parity), cached rows shown meanwhile. Land Lease: stale after 30 s, otherwise cached. Contracts: three reads re-run on every visit (`staleTime 0`).

##### J3. Edit a record (open the panel, type)

CAPEX panel: whole screen re-renders per keystroke, grid guarded by value comparison (SCC-20, SUSPECTED); standard-contract create adds one existence read before the write (CAPEX-135). Add Cost: 21-28 ms per keystroke (D140 MEASURED), read-back and validation after 200 ms of stillness (about 73 ms at 15,000 rows, MEASURED steps `gridToJson` 15.9 + `outputRows` 16.8 + `validateSheet` 39.8). OPEX / Land Lease / Contracts: single state update per change, memoised cards.

##### J4. Save

| Screen | Critical path | Parallelisable | Longest |
|---|---|---|---|
| CAPEX panel (existing) | contract PATCH ‖ month Create ‖ month Update, then deletes 4 wide, then comments refetch only if months were deleted | the three writes | one bulk request (0.6-1.9 s per bulk request, D51 section 11.16) |
| CAPEX paid toggle | 1 PATCH (2 with a cluster confirm) | none | the PATCH |
| Contracts | existence + links read, PATCH, links replace, awaited refetch | links read beside the PATCH (done) | PATCH then links (2 serial writes) |
| OPEX | guard + lookups, head PATCH ‖ children read, cascade, re-chain | siblings read beside the re-chain (done) | cascade then re-chain (serial writes) |
| Land Lease | guard, header, guard, allocation tiers, guard, period, followers, awaited reload | the three guards (SCC-06), allocations 8 wide | the sequential chain; reload (SCC-07) |

##### J5. Bulk save (Add Cost from Table)

Critical path: prepare (4-28 ms), then the slowest of contract upsert and stage-A cost upserts; with new contracts, plus the stage-B cost create after the contract create. Everything else (deferred deletes, confirming book reads) is off the user's path but contends for slots. MEASURED: 1,607 ms (60 rows existing contracts) and 1,916 ms (96 rows with new contracts) before the tuned chunking; then 180 ms to paint CAPEX.
Parallelisable and not yet parallel: contract create and new-contract costs via the deep insert (OFF); the Save wait itself via `BACKGROUND_SAVE` (OFF, product decision).

##### J6. Refresh (window focus, manual reload, post-save)

Focus after 30 s: CAPEX chain + comments; Contracts 3 reads (staleTime 0) + others; Land Lease 4 requests; Add Cost none (`NO_FOCUS_REFETCH`); OPEX 3-7. After a CAPEX panel write: patched, nothing reloaded (ON). After Add Cost: two confirming category reads (SCC-04). After Land Lease writes: awaited lease reload (SCC-07). After Contracts writes: awaited list + links.

##### J7. Switch project

There is no in-tab project switcher in the Cost screens: "Edit Costs" from Project Overview opens a new tab that repeats the cold boot (D165 PB-04, held DEC-C), then J1. Inside one tab a project id change gives every query a new key (`["cost-book", projectId, ...]`) and `ContractsScreen` remounts its body (`Screen.tsx:221-224`, test `contracts/Screen.projectSwitch.test.tsx`). Critical path = J1. Reference lists that are project-independent (chart, mapping, states, categories) are still read per tab: persisted reference data exists only for the Generators catalogue (`persistedReference.ts`, `generatorCatalogueCache.ts`).

##### J8. Switch screen (CAPEX to Add Cost, Contracts, OPEX, Land Lease)

CAPEX to Add Cost keeps the CAPEX screen mounted (FE-SH-03 withdrawn): only the sheet reads (3 hops, 2 with a warm chart). Other switches unmount the screen, keep cached data 5 minutes (default `gcTime`), and re-run each screen's visit reads (J2). The gate does not wait again (session project cached 5 min).

## 2. Project Management core and Cluster Check List (source: doc 10b section 7)

Round counts are DERIVED from code unless a harness figure is named; wall time = rounds x 0.25-0.5 s (D144 unit) and is ESTIMATED.

| Journey | Sequence (critical path) | Rounds | Longest step | Candidates / findings |
|---|---|---|---|---|
| Open the app on the project list | host context, import, wave 1 (page, probe, countries, states, env defs, user, directory, country map), interactive; waves 2-3 off the paint path | 1 data round after 2 start-up steps | 540 kB page response | SPA-11 |
| Open a project (Edit Project from the list) | new tab: full cold boot, session project, General Data prefetch of row/lists/children, gate opens, areas and Entra | 3 | session row then row | SPA-13 |
| Load a PM screen by deep link | context, session project, gate, screen reads (prefetched since PB-03), dependent reads | Check List 4, Team 2+Entra, Planning 2, Milestones 3, Grid Operator 1, General Data 2 | Entra (Check List, Team), gates (Check List) | SPA-05 |
| Switch PM screen in the app | lazy chunk, mount, reads (no prefetch), 30 s cache on revisit | as above + chunk | chunk + first read round | SPA-09, SPA-19 |
| Edit and save (typical field screens) | 1 write (project PATCH 0.45-0.85 s for projects) + awaited reload of the written table's readers | 2 | the PATCH | none beyond server time |
| General Data save with start-cluster change | see 4.2 | up to 17 | sequential tail | SPA-14 |
| Check List: complete a task | existence read, PATCH, rows reload | 3 (MEASURED rounds) | 3 sequential requests | SPA-01 |
| Check List: Move to next cluster | sect. 5.5 | 11 / 37 requests (MEASURED rounds) | the 7-step write chain | SPA-02 |
| Check List: Request Approval | 3 reads/writes, flow Run (5-19 connector levels), [Only Notifications: 1.5 s + polls up to 30 s], rows, note, reload | 6-7 app rounds + flow + poll | the flow | SPA-03, SPA-04 |
| Project list: next page / filter / sort | cached next page: 0; else 1 round of 2 requests; filter adds 300-350 ms debounce | 0-1 | 540 kB page | SPA-11 |

## 3. Production, Revenues, Finance, Generators (source: doc 10c section 7)

Times are DERIVED from the D144 per-call anchor unless marked; reads 0.2-0.5 s per round is an assumption.

| Journey | Sequence (awaited rounds) | Estimated user-visible time | Main finding |
|---|---|---|---|
| Open Production (warm session, in-app) | chunk, [project, yields] | 1 read round plus chunk | SPB-02 for new-tab landing; SPB-12 |
| Open Production in a new tab (Edit Project) | context, [session project, env], gate, [project, yields], Fabric | gate + 1 round, Fabric not blocking | SPB-02 |
| Save a Production yield (15-year curve, seasonality, 2 syncs) | pre-reads(1), yield(1), group of 18 (2), roll-up read(1), roll-up PATCH(1) | 1.6-3.4 s | SPB-10 |
| First yield save of a project (generation) | the above + 2 read rounds + 22 write rounds at 30 turbines | about 6-12 s | SPB-01 |
| Open Revenues | chunk, [project(+cached states), contracts, balancing, negative-price check, subaccount], then [Fabric, currency, inflation] | usable after round 1; Add needs round 2 | SPB-02, SPB-12 |
| Add or Edit a percentage-hedge contract | [overlap read, id read], contract write, awaited reload | 0.65-1.5 s | SPB-09 |
| Edit an Individual-volume contract, 36 years | ids read, contract write, 3 delete rounds, 3 create rounds, awaited reload (9 steps, D146) | about 2-4.5 s | SPB-07, SPB-09 |
| Save a balancing price | write, awaited reload (plugin dates) | about 0.5-1 s | await is required |
| Open Finance | chunk, [7 reads], Fabric debt read, seed check | usable after round 1 | SPB-02, SPB-12 |
| Edit a tranche (25 repayments, 4 step-ups) | duplicate read, tranche write, group of 29 (2 rounds), awaited reload (6 rounds, modelled) | about 1.5-3 s | SPB-08, SPB-09 |
| Open the Equity panel | contracts read, cost chunks (2 waves), Save enabled | about 0.4-1 s | SPB-13 |
| Open Generators (cold) | [10 reads], [turbines, models] | 2 read rounds plus chunk | SPB-05, SPB-06 |
| Add WTG type N=20, L=2 | pre-read, type, 20 turbines (2 rounds), wave {device row, roll-up, 40 allocations} (3 rounds); 63 requests / 6 waves (doc 03) | about 2.2-4.5 s (measured 3.3-3.7 s at L=1 before D144) | SPB-03, SPB-15 |
| Toggle a type's status (N turbines) | wave {type, N turbines}, roll-up (5 waves at N=50, doc 03) | 1.4-1.7 s measured before D144 | SPB-15 |
| Replace a generator type | 11 waves (before D144); about 8-9 after | 5.6-6.3 s measured before D144 | SPB-04 |
| Select a type, then Delete | 2 sequential guard reads | Delete unavailable about 0.4-1 s | SPB-14 |

## 4. Admin (source: doc 10d section 10)

| # | Journey | Sequence (DERIVED) | Where it waits | Findings |
|---|---|---|---|---|
| A1 | Open Application Settings (header menu -> Check List Settings) | lazy chunk (1) -> tabs (1, 5 min cache) -> [clusters ‖ tasks ‖ locks 1..N pages] | time-to-visible ~3 waves; time-to-editable = tabs + locks | SAD-01, SAD-02, SAD-16 |
| A2 | Edit, activate or delete a checklist task | guarded PATCH (2) -> tasks refetch (1); delete adds renumber 2 per later row at width 4 | overlay or inline pending; renumber dominates | SAD-07, SAD-08 |
| A3 | Toggle Completion Date | guarded PATCH (2) -> tasks refetch ‖ locks refetch (awaited) | row pending until the slower refetch | SAD-03 |
| A4 | Review or edit gate approvals (Project Gates) | countries / states (warm) -> dataset 3-4 waves -> render ~100-250 task rows | loader until the dataset; a brief freeze while rows mount | SAD-13, SAD-12 |
| A5 | Flip a gate or task Active pill | optimistic flip -> guarded PATCH (2) -> one slice reload | none visible (optimistic) | (fixed by AD-06) |
| A6 | Deactivate a CAPEX account | list (1) -> account PATCH pair -> subaccount PATCH pairs (8 wide) -> tree refetch, then background clean-up | blocking overlay ~4 + 2 x ceil(S/8) waves; then minutes to hours of background work | SAD-04, SAD-05, SAD-07 |
| A7 | Add or edit a CAPEX account / reorder | number check ‖ order read -> POST -> plain PATCH -> tree refetch; reorder 2n at width 8 | overlay | SAD-07 |
| A8 | Maintain a standard cost (DEVEX / OPEX) | scope picked -> 3 scope reads; save 2-7 requests; Period-1 edit 2k + 5 | first paint waits for 6 reference reads on a cold visit | SAD-11, SAD-09, SAD-10 |
| A9 | Edit a standard BoP contract with DevCo links | Edit open: record GET ‖ DevCo refetch -> save: DevCo read -> PATCH -> deletes -> creates -> list + DevCo refetch | panel disabled one wave on open | SAD-15 |
| A10 | Edit milestone assumptions | Edit: whole-table refetch under overlay -> panel; save 2n at width 8 | overlay before the panel opens | SAD-14, SAD-07 |
| A11 | Report a problem | none (local) | none | - |

Ranking guidance for doc 11: A1 is the highest-frequency admin journey (every admin session) and its only material cost is SAD-01 (volume unknown, to be counted on DEV). A6 is the rare but longest-running journey and the only P1.
