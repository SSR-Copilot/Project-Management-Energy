# 10a - Screen-level bottleneck audit: the Cost module

Audit agent: SCC. Read-only. Worktree `Project-Management-Energy-WorkDev1-BottleneckOptimization`, branch `feature/bottleneck-identification-optimization`, base `dde9e92`. Date 26 Nov 2026.
Register: `_register/SCC.md` (21 findings). Throwaway scripts: `_bench/SCC/` (`chunks.mjs`, `grid.bench.mts`, `vitest.config.mts`).

Labels used everywhere: **MEASURED** (I ran it, or a repo document recorded it and I cite it), **DERIVED** (counted from code), **ESTIMATED** (reasoning). Findings: CONFIRMED / HIGH-CONFIDENCE (HIGH) / SUSPECTED.

## 1. Scope, method, honesty about coverage

### 1.1 What I read

- `src/features/cost/*` fully read or read in the relevant ranges:
  - `costing/useCostBook.ts` (all 1,026 lines), `costing/capexInvalidation.ts`, `costing/capexBookPatch.ts` (head), `costing/savedSheetPatch.ts` (apply path);
  - `capex-costs/Screen.tsx` (state, hooks, loading, render head 225-560 and 1000-1075), `capex-costs/PcfGrid.tsx`, `capex-costs/gridRows.ts`, the vendored `pcf/ui/GridRenderer.js` (`render`, spacer, filters) and `pcf/services/DatasetParser.js` (`parseDatasetToTree`);
  - `add-costs-from-table/Screen.tsx` (60-574), `spreadsheet/rowWindow.ts`, `spreadsheet/SpreadSheet.tsx` (405-730), `prepare.bench.test.ts`;
  - `contracts/hooks.ts` (all), `contracts/Screen.tsx` (218-480);
  - `periods/OpexScreen.tsx` (755-945), `periods/LandLeaseScreen.tsx` (686-780, 960-1075), `landLeaseRules.ts` (`leaseWriteTiers`, `planLeaseDelete`);
  - `app/routes.tsx` and `app/bootPrefetch.ts` (the Cost entry path).
- `src/data` modules the screens call: `costBook.ts` (loaders 480-700, 900-1349), `capexChart.ts`, `landLease.ts` (load 120-241, writes 500-678), `opexCatalog.ts` (device types), `periodWrites.ts` (`saveOpexPeriod`), `contracts.ts` (loaders), `addCostSheet.ts` (load 100-236, save 675-766, docs), `capexWrites.ts` (save/delete 690-1012), `comments.ts` (`loadComments`), `standardContracts.ts`, `client.ts` (`fetchAll`, `deleteRecord`), `odata.ts` (`CHUNK`), `project.ts` (`loadProject`), and the three flag files.
- Docs read: D165 `03 - Screen-Level Network Audit.md` (all), `00`, `13`, `12` (CA/CB rows), `27` (CA/CB status rows), `01` (constraints); `17-ADDCOST-SAVE-PERF-PLAN.md`; `02-OPEN-DECISIONS.md` D51 / D139 / D140 measurement passages; `frontend-optimization/02` and `04` (FE-C1-*); `KNOWN-RISKS-AND-DECISIONS.md` (D51 numbers).
- Built output: `npm run bundle:report`, and the `dist/` source maps for chunk membership.

### 1.2 What I did NOT read in full

`capex-costs/rules.ts` (1,373 lines), `panelRules.ts`, `comments.ts` / `CommentsPanel.tsx` (only the save path through D165 doc 03), `contracts/rules.ts` (1,973), `opexRules.ts` (3,371), `landLeaseRules.ts` (read the tiering and delete planner only; its 3,590 lines of Power Fx ports are otherwise unread), the body of `OpexScreen.tsx` / `LandLeaseScreen.tsx` / `contracts/Screen.tsx` past the ranges above, `addCostSheetBulk.ts` and `bulkSend.ts` (I relied on their module notes and D165 docs 05/10 for the write graph), and the generated services. Any statement about those files comes from a comment or a D165 document and is marked so.

### 1.3 Method

Follow each screen through the 16 stages, trace the awaited chain in the code, check the current switch state in the source (not the docs), and use the repo's existing wave-recorder tests and benchmarks where they exist. I ran:

| Command (from `ProjectCosts-CodeApp/`) | Result |
|---|---|
| `npx vitest run src/features/cost/add-costs-from-table/prepare.bench.test.ts --reporter=verbose` | 3 passed; step timings in 4.1 |
| `npx vitest run src/data/costReadPath.waves.test.ts src/data/periodWrites.opex.waves.test.ts src/data/addCostSheet.timeline.test.ts` | 37 passed, 1 failed: `UT-ACPERF-040` (`expected 29 to be less than 25`, a 25 ms wall-clock bound; the machine was shared with other agents). Timing bound, not logic. Not re-run for a pass; noted as a known load-sensitive test |
| `npm run bundle:report` and `node _bench/SCC/chunks.mjs dist/assets` | chunk sizes in 4.5 |
| `npx vitest run --config ../ProjectDocs/bottleneck-identification/_bench/SCC/vitest.config.mts` | CAPEX grid data pipeline timings in 4.2 |

### 1.4 Realistic data volume (sources, not guesses)

| Quantity | Value | Source |
|---|---|---|
| DEV project | 12 contracts, 698 cost rows (58 per contract) | `05-SCREEN-TRACKER.md:550` |
| One DEV project (Wirmighausen) | 579 cost rows | `optimization/01_Codebase_Discovery_Report.md:71`, `costBook.ts:1090` |
| Large projects | "a few hundred contracts x about 200 monthly rows per CAPEX category", "tens of thousands of monthly rows" | `gridRows.ts:10-14`, `optimization/01_...:71`, `costBook.ts:917-919` |
| Add Cost sheet | 210-225 rows x 10 years, about 26,600-28,000 cells | `02-OPEN-DECISIONS.md:8034`, `rowWindow.ts:3-8` |
| Sub-accounts per category | "well under 40" (one id chunk) | `standardContracts.ts:28` comment |
| Production volumes (contracts per category, months per contract) | NOT KNOWN from the repo; D165 open question G-volumes (`12 - ...:306`) | needs a read-only DEV count |

All wave and request counts below are DERIVED unless a line says MEASURED. A "hop" is one sequential round trip through the host (the repo's own model: `costReadPath.waves.test.ts:4`). I have no per-read latency measurement; the only measured request latencies in the repo are bulk write requests (0.6-1.9 s, `02-OPEN-DECISIONS.md:4627`; fixed cost about 0.5 s inferred, `17-ADDCOST-SAVE-PERF-PLAN.md` B1).

## 2. Current switch state (verified in source, 26 Nov 2026)

| Switch | File | State | Effect |
|---|---|---|---|
| `CAPEX_PATCH_BOOK` (CA-05) | `data/capexOptFlags.ts:46` | ON | paid toggle / panel save / delete patch the cached book instead of reloading it |
| `ADDCOST_LEAN_REFRESH` (CA-06) | `capexOptFlags.ts:47` | ON | Summary totals marked stale only after an Add Cost Save |
| `SPV_MAPPING_SHARED` (CA-08) | `capexOptFlags.ts:48` | ON | mapping read shared 5 min |
| `COMMENTS_WITH_PAYMENTS` (CA-09) | `capexOptFlags.ts:49` | ON | comments start with the payments wave |
| `COMMENT_DELETES_OVERLAP` (CA-15), `WTG_COUNT_STANDARD_ONLY` (CA-16), `PANEL_CHANGED_CONTRACT_COLUMNS` (CA-12), `HOLD_TAB_FOR_DEFERRED_DELETES` (CA-03) | `capexOptFlags.ts:45,50,52` | ON | |
| `PANEL_STABLE_ID` (CA-07) | `capexOptFlags.ts:51` | **OFF** | client-minted contract ids wait for a DEV check and QA-02 |
| `COST_READS_RETRY` (CA-11), `LEASE_GUARD`, `OPEX_GUARD`, `GONE_AS_DONE_LEASE_OPEX`, `COST_REFRESH_ON_FAILURE`, `LEASE_TIER_WIDER`, `OPEX_BOOK_REUSES_CATALOGUE`, `OPEX_WRITES_TOGETHER`, `CONTRACT_LINKS_WITH_PATCH`, `CONTRACT_KEYS_ONCE`, `BOP_ASSUMPTIONS_ONE_READ`, `LEASE_LEAN_RELOAD`, `COST_WRITES_POLICY` | `data/leaseOpexFlags.ts` | ON | |
| `STABLE_CREATE_IDS` (CB-14) | `leaseOpexFlags.ts` | **OFF** | same DEV-check reason |
| `RETRY_POLICY_V2`, `POLICY_*` | `data/requestFlags.ts` | ON | one retry layer |
| `REQUEST_DEADLINES`, `GLOBAL_GATE` | `requestFlags.ts:20,26` | **OFF** | no deadline, no global read gate |
| `BULK_SAVE`, `DEFER_CONTRACT_DELETES`, `DEFER_COST_DELETES`, `CHANGED_COLUMNS_ONLY`, `TUNED_CHUNKING`, `PANEL_BULK_SAVE`, `SKIP_UNCHANGED_COSTS`, `LEASE_WRITE_PARALLEL`, `OPEX_IMPORT_PARALLEL` | `addCostSheet.ts:320,338,675`; `savePlan.ts:143`; `bulkSend.ts:128`; `capexWrites.ts:171,178`; `landLease.ts:608`; `periodWrites.ts:773` | ON | |
| `DEEP_INSERT_NEW_CONTRACTS` (D76) | `addCostSheet.ts:360` | **OFF** | new-contract Save keeps two serial hops |
| `BACKGROUND_SAVE` (D77) | `costing/backgroundSave.ts:56` | **OFF** | the sheet waits for the Save |
| `BOOT_PREFETCH_SCREEN_READS` (PB-03) | `data/bootDvoptFlags.ts:31` | ON, **PM screens only** | no Cost counterpart (finding SCC-01) |
| `CANVAS_PARITY_DELETION` | `add-costs-from-table/Screen.tsx:61` | true (product decision; not touched) | |

## 3. The 16 stages, per Cost screen

Cells name what happens and the cost driver. `none` = nothing of note. Evidence for the cells is in sections 4 and 5.

| # | Stage | CAPEX/DEVEX | Add Cost from Table | OPEX | Land Lease | Contracts |
|---|---|---|---|---|---|---|
| 1 | Initial loading | lazy chunk (86 kB min) prefetched at boot (`screenLoaders.ts`); `CostProjectGate` waits for the full project (2 hops) | same chunk plus the CAPEX chunk (it mounts both, `routes.tsx:185`) | chunk 36 kB min | chunk 34 kB min | chunk 31 kB min |
| 2 | Component init | about 30 `useState`, 9 hooks, `makeStyles`; grid built in a layout effect | `React.memo` grid; `StrictMode`-safe token effects | one memoised card list | memoised cards (OPT-26) | keyed by project; `memo` cards |
| 3 | State init | `category` from URL; panel state local | `loaded` memo: sheet + grid + round trip (4.1) | folds local | folds derived | forms local |
| 4 | Data retrieval | book chain (3 hops) + comments + assumptions + states + durations | chart then contracts and mapping then costs (3 hops) | book (2 hops) + catalogue + device types (O&M) | lease book (2 hops) + generators + assumptions | 7 reads in 2 hops |
| 5 | Dataverse requests | about `3 + ceil(A/40) + 2 x ceil(C/40)` (A sub-accounts, C contracts; payments and comments each `ceil(C/40)`) | `2 + ceil(A/40) + ceil(C/40)` | about 8-12 | about 10 | about 8 |
| 6 | Business logic | `rules.ts` pure functions | `buildInitialSheet`, `validateSheet` | `opexRules` | `landLeaseRules` | `rules.ts` recalc |
| 7 | Transformation | `loadCostLines` mapping, `gridRows` | `sheetRowsToGrid`, `gridToJson`, `outputRowsToSheetRows` | row mapping, chain linking | row mapping | tree build |
| 8 | Calculations | totals in `gridRows` (indexed, linear) | validation, diff, deletion plan | chain dates | chain dates, inflation | closing split, margin |
| 9 | Rendering | vendored DOM renderer rebuilds the tbody per paint | windowed react-spreadsheet (D140, 748 cells) | memoised cards, folded by default | memoised cards | memoised cards |
| 10 | User interaction | panel keystroke re-renders the whole screen (SCC-20) | 21-28 ms per keystroke (D140, browser) | per-card commands | per-card commands | form updates are one state update |
| 11 | Save | panel: 1-3 hops, patched book | bulk graph, 1-2 critical hops | 4 hops (head with children) | 5-9 hops + reload | 4 hops |
| 12 | Bulk operations | `CreateMultiple` / `UpdateMultiple` (ON) | `CreateMultiple` / `UpdateMultiple`, tuned chunking | none (single rows, 8 wide) | none (single rows, 8 wide) | none |
| 13 | Refresh | patched; non-book keys marked stale | confirming read twice (SCC-04) | background reload (not awaited) | awaited lease reload (SCC-07) | awaited list + links refetch |
| 14 | Navigation | `back()` after the Save resolves | same; client timeline ends on CAPEX paint | route change | route change | route change |
| 15 | Error handling | load error state (rule 19), 2 retries on transient reads | banner + toast, `SavePlanError` classes | banner | banner, per-step failures | banner |
| 16 | Cleanup | grid `destroy()`, observers disconnected; CA-15 mutations outlive the screen | read-back timer cleared | none | none | key by project resets state |

## 4. Per-screen findings

### 4.1 Add Cost from Table (`add-costs-from-table`, `spreadsheet/`, `costing`)

**Timeline to "screen usable"** (cold deep link; from a loaded CAPEX tab drop the first two hops):

| Hop | Work | Parallel with | Longest |
|---|---|---|---|
| 1-2 | session project row, then country / cluster state / area lookups, then `CostProjectGate` opens (`routes.tsx:90`, `project.ts:275`) | nothing (SCC-01) | the lookup hop |
| 3 | chart of accounts (`loadCostAccounts`, 30 s memo) | CAPEX book behind the panel | - |
| 4 | contracts (`ceil(A/40)`, one request, 500 per page) and SPV/DevCo mapping | | contracts |
| 5 | cost rows `ceil(C/40)` requests, 5,000 rows per page, pages sequential per chunk (`addCostSheet.ts:212-236`) | the CAPEX book's own cost read (SCC-17) | **cost rows (largest payload)** |
| 6 | client build, synchronous (below) | | |

Client build (MEASURED, node, `prepare.bench.test.ts`, 15,000 sheet rows): `buildInitialSheet` 18.8 ms, `sheetRowsToGrid` 46.8, `gridToJson` 18.9, `outputRowsToSheetRows` 10.2, about 95 ms in total, linear (`UT-ADDPERF-003`). At the typical 225 rows this is well under 5 ms (ESTIMATED from linearity). The grid then draws about 748 cells whatever the sheet size (D140 MEASURED in a browser: 26,586 cells before, 748 after; keystroke median 630 ms to 21-28 ms, `02-OPEN-DECISIONS.md` D140). The first key after opening costs 141-155 ms because the cell rules run over every row once (same source).

**Timeline to "save complete"** (switches as shipped):

| Step | Work | Sequential / parallel |
|---|---|---|
| click to first request | read-back flush, `prepareSheetSave` | 9 ms with prepare 4.2 ms (MEASURED, `02-OPEN-DECISIONS.md:6017`); 28.5 ms at 15,000 rows (MEASURED, bench) |
| t0 | contract upsert, stage-A cost upserts (each `CreateMultiple` ‖ `UpdateMultiple`, split into at most 8 requests of at least 10 rows), all through a write gate of 24 | parallel |
| t0 + contract create | stage-B cost rows of NEW contracts | serial after the contract create (SCC-12) |
| resolve | deferred contract and cost deletes start only after every write settled; they finish in the background (`DEFER_*` ON) | not on the critical path |
| after resolve | patch the cached book (6.0 ms MEASURED), navigate, CAPEX painted 180 ms later (`navigate to paint` 178 ms, MEASURED, `02-OPEN-DECISIONS.md:6017`) | |
| background | confirming whole-category book read now and again after the deferred deletes (SCC-04) | parallel to the user |

MEASURED saves (live DEV, `02-OPEN-DECISIONS.md:4624-4630`, before the tuned chunking and parallel gate of 24 were switched on): 60 rows on existing contracts 1,607 ms / 3 requests (cost create 1.6 s, cost update 1.3 s, contract update 865 ms in parallel); 96 rows with new contracts 1,916 ms / 5 requests (contract create 1.4 s, then new-contract costs 556 ms). The tuned path is ON now with modelled 820-870 ms for the 60-row shape; NOT measured (`17-ADDCOST-SAVE-PERF-PLAN.md:41`). The longest step is the slowest bulk request (server time per row, about 90% of a Save, same doc section 1).

User-visible delay candidates: the sheet read (3 hops, cost rows largest); the Save wait (server bound); the first keystroke (D140); background contention after the Save (SCC-04). Prior fixes in place: bulk path, concurrent graph, deferred deletes, changed-columns-only, tuned chunking, windowed grid, deferred read-back (200 ms, `Screen.tsx:69`), indexed prepare. Not fixed / OFF: deep insert, background Save, probe P0.3.

Findings: SCC-04, SCC-12, SCC-13, SCC-17, SCC-21.

### 4.2 CAPEX/DEVEX (`capex-costs`, vendored PCF renderer, `costing`)

**Timeline to "screen usable"** (cold deep link, category tab):

| Hop | Work | Parallel with |
|---|---|---|
| 1-2 | session project (2 hops), gate | - (SCC-01) |
| 3 | chart (also feeds the tab strip), SPV/DevCo mapping | each other |
| 4 | contracts of the category's sub-accounts | |
| 5 | payments `ceil(C/40)` (5,000 per page) ‖ comment threads `ceil(C/40)` (CA-09 ON) ‖ project states if a contract is linked | each other |
| 6 | grid: `parseDatasetToTree` + DOM rebuild + `syncGrandTotalSpacer` (measures every row's height) | |
| 7 (not blocking) | standard assumptions (needs the whole book: SCC-15), WTG count only for per-WTG standards | comments landing |

MEASURED (mocked SDK, wave recorder): the CAPEX tab load is 3 waves / 5 requests (`UT-COSTWAVE-OPT-005`, down from 4 / 5); the OPEX-only book 2 waves / 4 requests. Tab switch inside 30 s: 2 hops (chart memo hit); after 30 s: 3 (SCC-14).

Grid CPU (MEASURED, node, `_bench/SCC/grid.bench.mts`, median of 7 after 2 warm-ups; 120 months per contract):

| Contracts | cost rows | `gridRows` | dataset | `parseDatasetToTree` (warm) | `parseDatasetToTree` first call |
|---|---|---|---|---|---|
| 12 (DEV shape, 58 months) | 696 | 0.3 ms | 0.1 | 2.4 | 11.7 |
| 300 | 36,000 | 3.0 | 1.0 | 13.0 | 44.8 |
| 1,000 | 120,000 | 8.9 | 4.4 | 47.3 | 124.7 |
| 3,000 | 360,000 | 27.7 | 12.0 | 125.6 | 798.8 |

Reading: the data work is linear and small once warm; the cold first paint is the larger number. The DOM rebuild and layout were not measurable without a browser. The repo's own record of resolve-to-painted after an Add Cost Save is 180 ms at its test volume. This is why SCC-03 is P3 and SUSPECTED for the DOM part.

**Timeline to "save complete"**:

- Paid toggle: `PATCH` (1 hop; 2 when a cluster-linked confirm clears the link first) then a synchronous book patch (`CAPEX_PATCH_BOOK` ON). Before dvopt this reloaded the whole category (3 hops). FIXED.
- Panel Save, existing contract: contract PATCH ‖ `CreateMultiple` ‖ `UpdateMultiple`, then month deletes 4 wide if months were cleared, then patch. 2-3 hops. When months were deleted the comments key refetches and the spinner waits for that one hop (`useCostBook.ts:607`).
- Panel Save, new contract: contract create then `CreateMultiple` (2 hops).
- Panel Delete: SCC-02 (the longest wait on this screen).
- Comments panel Save: strictly sequential creates/edits (deletes overlap, CA-15 ON): `R + P` hops (small counts).

Refresh: window focus after 30 s re-reads the whole chain and the comment threads (SCC-05); unchanged data re-renders nothing (structural sharing, D162 FE-SH-01).

Findings: SCC-01, SCC-02, SCC-03, SCC-05, SCC-10, SCC-11, SCC-14, SCC-15, SCC-16, SCC-19, SCC-20.

### 4.3 OPEX (`opex-costs`, `periods/OpexScreen.tsx`, `opexRules.ts`)

Usable: gate (2 hops) then, all started at mount: the OPEX-scope book (hop 1: cost rows ‖ sub-account names from the 30-min catalogue ‖ currencies; hop 2: device names), the catalogue (accounts, sub-accounts), the O&M device types (hop 1: generator + PV types, hop 2: devices ‖ generators), country inflation, assumption scopes. `isLoading` waits for the book, the catalogue and (O&M) the device types, so the screen opens after 2 hops (MEASURED book: 2 waves / 4 requests, `UT-COSTWAVE-OPT-001`). Revisit: `everyVisit` re-reads the book and the device types on every mount by canvas parity (D123), cached rows stay on screen meanwhile. Longest step: the 29-column cost read and the second-hop device reads.

Save (head with children, start changed): one hop for the guard + currency/group lookups together, head PATCH ‖ children read, cascade to children (8 wide), re-chain followers (8 wide), sibling read, then `setQueryData` and a NON-awaited background reload. About 4 write hops (`periodWrites.opex.waves.test.ts` pins the CB-09 overlaps, 3 of 3 passed). Delete: children read, children deleted (8 wide), head. Import: existence check ‖ assumptions read, head, tail rows side by side (`OPEX_IMPORT_PARALLEL` ON).

Render: cards start folded; `OpexCardView` is memoised and builds its command gates only when open (`OpexScreen.tsx:1448-1483`).

Prior fixes in place: OPEX-only scope (OPT-04), t=0 reference reads (OPT-06), catalogue reuse (CB-08), guards beside lookups (CB-01 / CB-09), parallel cascade and import, device types only for O&M (OPT-26). Open: SCC-18 (device table read twice); CB-10 (cascade as `UpdateMultiple`, not started).

### 4.4 Land Lease (`land-lease`, `periods/LandLeaseScreen.tsx`, `landLeaseRules.ts`)

Usable: gate, then the lease book (hop 1: nine sub-accounts, memoised 5 min ‖ headers; hop 2: periods ‖ allocations ‖ currency names) and project extras (derived from the session, no request). Generators, currencies, country inflation and assumptions run beside and gate only their pickers. 2 hops after the gate, 4 requests (`landLease.ts:147-189`). Revisit after 30 s / focus: same 2 hops.

Save (panel, Period-1 edit, A allocations, F followers): per step (contract, allocation, period) a key-only guard read then its writes, all steps in sequence (SCC-06); header PATCH; allocation tiers create then update then delete, 8 wide (SCC-09); period PATCH; followers in one tier (`LEASE_TIER_WIDER`); then the AWAITED lease book reload, 2 hops (SCC-07). Minimum for a Period-1 edit with updates in header and period: guard, header, guard, period, reload (2) = 6 hops, more with allocation tiers or followers. D165 doc 03 counts about 48 requests / 11 waves for A=40 and 2 followers before the guards existed. Per-hop latency unmeasured; the repo's smallest measured request is 556 ms, so a 6-hop save is about 3 s or more if reads and single PATCHes cost anything like a bulk request (ESTIMATED, not measured).

Delete contract: A=40, 3 periods: 44 requests / 7 waves plus the reload (SCC-08). Standard import: header, allocations, periods (serial creates by product decision, CB-07 residual), reload.

Render: fold state derived, cards memoised (FE-C2-06 / OPT-26). Prior fixes in place: parallel tiers (OPT-10), wider tiers for followers and period deletes (CB-07 part), guard (CB-01), lean reload (CB-15 part), refresh on failure (CB-02). Findings: SCC-06, SCC-07, SCC-08, SCC-09.

### 4.5 Contracts (`contracts`)

Usable: gate, then hop 1: contracts, chart of accounts in every state (30 min), DevCo CAPEX contracts, BoP assumption pair (one request, CB-13), country/technology derived from the session; hop 2: payment targets and DevCo links (need the contract ids), DevCo cost rows (join the DevCo contract read through `fetchQuery`, S1-07). The Add / Edit commands wait for all seven reads to succeed (`queriesReady`, `Screen.tsx:329-337`, D120 section 4, a documented DIVERGENCE chosen for correctness). So usable is 2 hops after the gate; the longest read is the DevCo cost rows (every month of every DevCo contract of the project, 5,000-row pages).

Visit: three project reads use `staleTime 0` and `refetchOnMount "always"` (canvas parity, `hooks.ts:34`), so each visit and each focus re-reads contracts, targets and links.

Save (edit): existing-contract check ‖ stored-links read (CB-11), contract PATCH, links replace (removals 16 wide, additions 8 wide), then the awaited refetch of list + links (`onSettled`). 4 hops. A create adds the links under the new id-set key once the list answers (CB-12). Render: memoised cards, one state update per form change (`recalculateFor`), no per-keystroke O(rows) beyond `costRowsForAccounts`. Prior fixes in place: CB-11, CB-12, CB-13, extras from the session (OPT-02), shared chart. No new finding beyond the shared refresh policy (SCC-05).

### 4.6 `costing` and `periods` (shared)

`useCostBook.ts` is the one place where invalidation fan-out lives. State today: panel writes patch the book (CA-05), non-book keys are marked stale and, because they are inactive on a CAPEX tab, the awaited `Promise.all` resolves at once (`useCostBook.ts:514-523`, `capexInvalidation.ts:53-61`); the Add Cost Save is fire-and-forget (`:784`); the period screens' book save is fire-and-forget (`:196-204`) but Land Lease writes await the reload (SCC-07). `useCostWriteFlight` is 58 lines, no cost. `periods/` holds the rules (OPEX 3,371 lines, Land Lease 3,590 lines): pure and tested (`opexRules.opt.test.ts`, `periodsRules.opt.test.ts`); I did not find a hot loop in the parts I read. The 125 kB shared chunk is described in SCC-19.

## 5. Prior programmes: what the code says today (Cost items)

| Finding | Status in current source | Evidence |
|---|---|---|
| CA-05 paid toggle / save / delete reload the whole book | FIXED (switch ON) | `useCostBook.ts:531-548, 565-571, 611-614` |
| CA-06 Summary read after Add Cost | FIXED for the totals (ON); book confirm read still twice (SCC-04) | `useCostBook.ts:734-741` |
| CA-08, CA-09, CA-15, CA-16, CA-12, CA-03 | FIXED (ON) | `capexOptFlags.ts:44-54` |
| CA-11 `retry: false` on the main reads | FIXED (`COST_READS_RETRY`) | `useCostBook.ts:81` |
| CA-07 stable CAPEX create id | built, OFF | `capexOptFlags.ts:51` |
| CA-02 deadlines, CA-17 / WE-03 global gate | primitives built, OFF | `requestFlags.ts:20,26` |
| CA-04 / CB-05 larger id lists, parent-lookup filters | NOT started (probes) | `odata.ts:70` still 40 |
| CA-10 focus refetch | open, held (DEC-F) | `Providers.tsx:25-32` |
| CA-13 Summary aggregate | open, held (DEC-D) | `costBook.ts:1247-1349` |
| CA-14 panel Delete phases | open, not started | `capexWrites.ts:988-1011` |
| CB-01 / CB-02 / CB-03 Land Lease and OPEX integrity | FIXED (guards, refresh on failure, 404 as done) | `landLease.ts:548-597`, `useCostBook.ts:208-210, 387-390` |
| CB-04 header-only delete | open, held (DEC-A) | `landLeaseRules.ts:3036-3069` |
| CB-06 / CB-10 bulk for Land Lease / OPEX | NOT started | no `CreateMultiple` in `landLease.ts` / `periodWrites.ts` |
| CB-07 tiers | PARTLY fixed (followers, period deletes); period creates of an import stay serial | `landLeaseRules.ts:2710-2718` |
| CB-08 / CB-09 / CB-11 / CB-12 / CB-13 | FIXED (ON) | `useCostBook.ts:109-117`, `contracts/hooks.ts:198-221, 277-283, 306-315` |
| CB-14 stable header id | built, OFF | `leaseOpexFlags.ts` |
| CB-15 Land Lease reload | PARTLY fixed (memo, no shared-book invalidation); awaited reload remains (SCC-07) | `useCostBook.ts:310-315` |
| FE-C1-06 re-parse on expand/collapse, FE-C1-07 whole-screen render | open, deferred P3 | `GridRenderer.js:165`, `Screen.tsx:548-552` |
| D140 sheet typing | FIXED (windowed grid, store selector) | `rowWindow.ts`, `02-OPEN-DECISIONS.md` D140 |
| D76 deep insert, D77 background Save | built, OFF | `addCostSheet.ts:360`, `backgroundSave.ts:56` |

## 6. Critical user journeys: the Cost module (for doc 11)

Per-hop latency is not measured for reads; where I give seconds they are the repo's own measurements.

### J1. Open a screen (cold deep link: "Edit Costs" new tab, reload, bookmark)

Critical path: host context, session project row, project lookups (2 hops), gate, then the screen's own chain: CAPEX 3 hops (chart, contracts, payments), Add Cost 3 hops (chart, contracts, costs), OPEX 2, Land Lease 2, Contracts 2. Then render (CAPEX parse + DOM; Add Cost build about 95 ms at 15,000 rows, a few ms typical).
Parallelisable today: the screen's chunk (prefetched at boot), the project-independent reads that are not started until the gate opens (SCC-01: chart, mapping, states, categories; contracts by URL project id), standard assumptions from the chart (SCC-15), the two duplicate downloads on add-from-table (SCC-17).
Longest step: CAPEX/Add Cost: the cost-row read (all months of the category; pages of 5,000 sequential within each of `ceil(C/40)` chunks). Contracts: DevCo cost rows.

### J2. Open a screen already visited this session (tab switch / return)

CAPEX: new category key, 2-3 hops (chart memo 30 s, SCC-14), comments and payments again; returning inside 30 s is served from cache. Add Cost: fresh sheet read on entry (by design). OPEX: book + device types re-read on every mount (canvas parity), cached rows shown meanwhile. Land Lease: stale after 30 s, otherwise cached. Contracts: three reads re-run on every visit (`staleTime 0`).

### J3. Edit a record (open the panel, type)

CAPEX panel: whole screen re-renders per keystroke, grid guarded by value comparison (SCC-20, SUSPECTED); standard-contract create adds one existence read before the write (CAPEX-135). Add Cost: 21-28 ms per keystroke (D140 MEASURED), read-back and validation after 200 ms of stillness (about 73 ms at 15,000 rows, MEASURED steps `gridToJson` 15.9 + `outputRows` 16.8 + `validateSheet` 39.8). OPEX / Land Lease / Contracts: single state update per change, memoised cards.

### J4. Save

| Screen | Critical path | Parallelisable | Longest |
|---|---|---|---|
| CAPEX panel (existing) | contract PATCH ‖ month Create ‖ month Update, then deletes 4 wide, then comments refetch only if months were deleted | the three writes | one bulk request (0.6-1.9 s per bulk request, D51 section 11.16) |
| CAPEX paid toggle | 1 PATCH (2 with a cluster confirm) | none | the PATCH |
| Contracts | existence + links read, PATCH, links replace, awaited refetch | links read beside the PATCH (done) | PATCH then links (2 serial writes) |
| OPEX | guard + lookups, head PATCH ‖ children read, cascade, re-chain | siblings read beside the re-chain (done) | cascade then re-chain (serial writes) |
| Land Lease | guard, header, guard, allocation tiers, guard, period, followers, awaited reload | the three guards (SCC-06), allocations 8 wide | the sequential chain; reload (SCC-07) |

### J5. Bulk save (Add Cost from Table)

Critical path: prepare (4-28 ms), then the slowest of contract upsert and stage-A cost upserts; with new contracts, plus the stage-B cost create after the contract create. Everything else (deferred deletes, confirming book reads) is off the user's path but contends for slots. MEASURED: 1,607 ms (60 rows existing contracts) and 1,916 ms (96 rows with new contracts) before the tuned chunking; then 180 ms to paint CAPEX.
Parallelisable and not yet parallel: contract create and new-contract costs via the deep insert (OFF); the Save wait itself via `BACKGROUND_SAVE` (OFF, product decision).

### J6. Refresh (window focus, manual reload, post-save)

Focus after 30 s: CAPEX chain + comments; Contracts 3 reads (staleTime 0) + others; Land Lease 4 requests; Add Cost none (`NO_FOCUS_REFETCH`); OPEX 3-7. After a CAPEX panel write: patched, nothing reloaded (ON). After Add Cost: two confirming category reads (SCC-04). After Land Lease writes: awaited lease reload (SCC-07). After Contracts writes: awaited list + links.

### J7. Switch project

There is no in-tab project switcher in the Cost screens: "Edit Costs" from Project Overview opens a new tab that repeats the cold boot (D165 PB-04, held DEC-C), then J1. Inside one tab a project id change gives every query a new key (`["cost-book", projectId, ...]`) and `ContractsScreen` remounts its body (`Screen.tsx:221-224`, test `contracts/Screen.projectSwitch.test.tsx`). Critical path = J1. Reference lists that are project-independent (chart, mapping, states, categories) are still read per tab: persisted reference data exists only for the Generators catalogue (`persistedReference.ts`, `generatorCatalogueCache.ts`).

### J8. Switch screen (CAPEX to Add Cost, Contracts, OPEX, Land Lease)

CAPEX to Add Cost keeps the CAPEX screen mounted (FE-SH-03 withdrawn): only the sheet reads (3 hops, 2 with a warm chart). Other switches unmount the screen, keep cached data 5 minutes (default `gcTime`), and re-run each screen's visit reads (J2). The gate does not wait again (session project cached 5 min).

## 7. Negative findings (checked, not a bottleneck)

- **CAPEX grid data pipeline** is indexed and linear (`gridRows.ts:142-218`): 8.9 ms at 1,000 contracts, 27.7 ms at 3,000 (MEASURED). No quadratic scan.
- **`PcfGrid` repaint churn** is already controlled by value comparison of accounts, dates and options (OPT-25, `PcfGrid.tsx:75-99`); a window-focus refetch of unchanged data keeps object identity and repaints nothing (`structuralSharingWithDates`).
- **Add Cost client prepare** is not a bottleneck: 28.5 ms for 15,000 rows, read counts on the reference arrays pinned (`UT-ADDPERF-002`), linear (`UT-ADDPERF-003`). The grid is windowed (748 cells), keystroke 21-28 ms in a browser (D140).
- **Add Cost post-save patch** (`applySavedSheetToBook`) is a single indexed pass (6 ms MEASURED, 02-OPEN-DECISIONS.md:6017).
- **Paid toggle, panel Save, panel Delete reloads** are gone from the awaited path (CA-05 ON): the toggle is 1 request.
- **Reference data** (project states, categories, SPV/DevCo mapping, standard assumptions, assumption scopes, OPEX catalogue, country inflation, currencies) is cached 15-30 minutes or shared; not re-read per visit.
- **OPEX and Land Lease rendering**: cards memoised, folded by default, command gates built only for open cards; no hot loop found in the ranges read.
- **Write paths that were parallelisable are parallel**: OPEX cascade and re-chain, import tail, Land Lease allocations 8 wide and followers, Contracts links read beside the PATCH, CAPEX Create/Update, Add Cost graph.
- **Request payload**: every read selects columns (`$select`), the large cost reads use 5-6 columns at the 5,000 page ceiling. The only unselected-column risk, SDK-added annotations, is outside app control (D165 doc 01 constraint 4) and I did not measure response sizes.
- **Bulk-size hazards**: chunks of 500 with parallel groups, a gate of 24, deletes gated at 4 each, peak 36 against the 52 limit (`capexWrites.ts:700-709`).

## 8. Performance tests that exist for this module

Cost-related files that guard performance or request shape (list from `Glob`, not all run):

- Benchmarks and timing: `add-costs-from-table/prepare.bench.test.ts` (UT-ADDPERF-001..003, run), `add-costs-from-table/Screen.perf.test.tsx` (UT-ACPERF-030..033), `data/addCostSheet.timeline.test.ts` (UT-ACPERF-040/041, run; 040 is wall-clock bounded and failed under load), `costing/saveTimeline.test.ts`, `capex-costs/PcfGrid.render.test.tsx`, `capex-costs/pcfGridDestroy.test.ts`, `spreadsheet/rowWindow.test.ts`, `spreadsheet/adapter.test.ts`, `spreadsheet/SpreadSheet.test.tsx`.
- Wave / request shape with the mocked wave recorder (`src/test/waveClient.ts`): `data/costReadPath.waves.test.ts` (UT-COSTWAVE-*, run, 14 of 14 passed), `data/periodWrites.opex.waves.test.ts` (run, passed), `data/projectLoad.waves.test.ts`, `data/landLease.dvopt.test.ts`, `data/costBook.dvopt.test.ts`, `data/capexWrites.dvopt.test.ts`, `data/contracts.batch2.test.ts`, `costing/useCostBook.dvopt.test.tsx`, `costing/useCostBook.batch2.test.tsx`, `costing/useCostBook.everyVisit.test.tsx`, `costing/useAddCostSheet.cache.test.ts`.
- Rule-level optimisations: `contracts/rules.opt.test.ts`, `contracts/rules.bigsum.test.ts`, `periods/opexRules.opt.test.ts`, `periods/periodsRules.opt.test.ts`, `capex-costs/comments.opt.test.ts`.
- Bulk and gate behaviour: `data/bulkTuning.test.ts`, `data/concurrency*.test.ts`, `data/addCostSheet.bulk.test.ts`, `data/addCostSheetBulk.test.ts`, `capexWrites.bulk.test.ts`.
- Gaps: no browser benchmark of `GridRenderer.render` (DOM rebuild); no heap measurement of the Add Cost sheet; no recorded latency for single reads or single PATCHes; no test that pins the Cost deep-link wave chain (SCC-01).

## 9. Limitations

1. No live Dataverse, no browser: every network figure is a hop count, not a time. The repo has no read-latency measurement.
2. The grid timings in 4.2 are node on this machine, shared with other agents, and exclude the DOM. They are lower bounds for a browser.
3. Production volumes (contracts per category, months per contract, Land Lease allocations) are not in the repo; the findings that depend on volume (SCC-10, SCC-11, SCC-13) are SUSPECTED for that reason.
4. The `UT-ACPERF-040` failure is a 25 ms wall-clock bound exceeded on a loaded machine (29 ms); I did not alter or re-run it.
5. I did not read the files listed in 1.2; findings do not claim they are clean.
6. The brief's header says 15 columns but lists 17 names; `_register/SCC.md` has the 17 listed.
