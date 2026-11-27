# 08 - Memory and resource bottlenecks

Stage 1 audit, 26 Nov 2026, prefix `MEM`, register `_register/MEM.md` (5 findings). Read-only: nothing under `ProjectCosts-CodeApp/` was changed. Branch `feature/bottleneck-identification-optimization`, base `dde9e92`.

**Headline: no true leak was found.** Every listener, observer, timer, animation frame, subscription and module-level cache in `src/` either has a matching cleanup or is bounded. The measurements below (jsdom, forced GC) confirm that mounting and unmounting the heavy components repeatedly returns the heap and the listener / observer / timer counts to baseline. What remains are retention and footprint questions: how long big datasets stay in the query cache (MEM-01), how many copies the Add Cost sheet keeps (MEM-02), how heavy the drawn react-spreadsheet window is in a real browser (MEM-03, unverified), and two small bounded-growth items (MEM-04, MEM-05).

The previous programme already reached "no real memory leak" in `ProjectDocs/app-docs/frontend-optimization/04_Memory_Management_Assessment.md`. This audit re-verified its four findings against the current source (all four are fixed, section 4), added the measurements it could not take, and added MEM-01, MEM-02, MEM-03.

## 1. Scope and method

Read in full or in the relevant part (not just grepped):

- `app/Providers.tsx`, `app/queryLog.ts`, `app/queryStructuralSharing.ts`, `app/generatorsWarmup.ts`, `app/pmScreenPrefetch.ts`, `app/useHasTracedError.ts`
- `platform/requestLog.ts`, `consoleGate.ts`, `telemetry.ts`, `azureMapsToken.ts`, `useContextSelector.ts`, `globalErrors.ts`, `e2eHook.ts`
- `appInsights/appInsights.ts`
- `data/client.ts` (page-token cache, `fetchAll`), `data/persistedReference.ts`, `data/personCache.ts`, `data/checklistPeople.ts`, `data/stableCreateId.ts`, `data/capexWrites.ts` (the add ledger), `data/generatorsBulk.ts`, `data/usePlanWrite.ts`, `data/requestPolicy.ts`, `data/saveLog.ts`, `data/pendingDeletes.ts` (header)
- `components/beforeUnload.ts`, `UnsavedChangesGuard.tsx`, `useMediaQuery.ts`, `useNotify.tsx`
- `features/cost/add-costs-from-table/Screen.tsx` (state, memo, save), `spreadsheet/SpreadSheet.tsx` (cell window and listeners), `spreadsheet/pasteTrim.ts`, `spreadsheet/rowWindow.ts`
- `features/cost/costing/useCostBook.ts` (queries and the Add Cost Save mutation), `backgroundSave.ts`, `saveTimeline.ts`
- `features/cost/capex-costs/PcfGrid.tsx`, `pcf/ui/GridRenderer.js` (init, render, destroy, dropdown listeners), `pcf/ui/ActionDropdown.js` (destroy)
- `features/pm/general-data/ProjectMap.tsx` (full), `features/pm/generators/hooks.ts` (queries), `features/admin/admin-gates-approvals/hooks.ts` (in-flight maps), `features/pm/planning/seedOnce.ts`, `features/cost/periods/OpexScreen.tsx` (fold map)
- `domain/locale.ts`, `domain/numeric.ts` (pooled Intl objects)

Searched across all of `src/` (excluding `generated/` and tests) for: `addEventListener|removeEventListener`, `setInterval|setTimeout|requestAnimationFrame|requestIdleCallback`, `ResizeObserver|MutationObserver|IntersectionObserver`, `.subscribe(|addSink|useSyncExternalStore|.events.add`, `sessionStorage|localStorage|indexedDB`, `gcTime|staleTime|refetchInterval|persister`, `AbortController|signal`, `geolocation`, `createObjectURL`, and every top-level `new Map(|new Set(|[]|{}`.

Not read: the individual PM and admin screens beyond the timer sites listed in section 3, `bulkSend.ts` / `addCostSheet.ts` internals (their module state was located by grep and judged bounded from the comments plus the call sites), the vendored `GridRenderer.js` render body (only init, destroy and the listener sites).

### Measurements (all MEASURED = actually run; throwaway files in `_bench/MEM/`)

Runner: from `ProjectCosts-CodeApp/`, `npx vitest run --root . --config ../ProjectDocs/bottleneck-identification/_bench/MEM/vitest.mem.config.ts <file filter>`. The config reuses the app's `vite.config.ts` and only widens `test.include`. `_bench/MEM/node_modules` was a directory junction to the app's `node_modules` (needed for bare imports from outside the project root) and was removed after the runs. Results are written to `_bench/MEM/*.results.txt`.

1. `mem.leak.test.tsx` (jsdom): mounts and unmounts real components 25 times each and compares counters taken before and after. Counters: live `addEventListener` registrations on `window` and `document` (added minus removed, per target / type / callback / capture), live `ResizeObserver`s, pending `setTimeout` / `setInterval` timers, pending `requestAnimationFrame` frames, and nodes left under `document.body`.
2. `mem.heap.test.ts` (node): retained heap, with a forced GC before every reading, of the Add Cost data copies at two sheet sizes.
3. `mem.heap.dom.test.tsx` (jsdom): heap above baseline, forced GC, over 10 mount / unmount cycles of the real `SpreadSheetComp` on a 32,886-cell grid.
4. `mem.sharing.test.ts` (node): time of `structuralSharingWithDates` against TanStack's stock `replaceEqualDeep` on an unchanged refetch.

## 2. Findings

| ID | Pri | Conf | Summary |
|---|---|---|---|
| MEM-01 | P3 | HIGH | No `gcTime` anywhere: heavy per-project datasets and the Add Cost Save mutation variables stay in memory 5 minutes after leaving. |
| MEM-02 | P3 | CONFIRMED | Add Cost from Table keeps six or more representations of the same sheet; 8.2 MB typical, 63.8 MB at the stress size (measured). |
| MEM-03 | P2 | SUSPECTED | The drawn react-spreadsheet window measured 207-214 MB of JS heap in jsdom (not representative); the real browser figure is unknown. |
| MEM-04 | P3 | HIGH | `tokenCache` (page walks) is never evicted except by a write to the same table. |
| MEM-05 | P3 | HIGH | No abort path: an abandoned heavy read keeps paging and lands in the cache. |

### MEM-01 - the 5-minute default `gcTime` retains heavy datasets (P3, HIGH)

`app/Providers.tsx:21-36` builds the one `QueryClient` without `gcTime`, and no query or mutation in `src/` sets one (only tests do). TanStack v5 therefore keeps an inactive query and a settled mutation for 5 minutes.

What this holds after the user leaves a screen:

- `["add-cost-sheet", projectId, category]` (`useCostBook.ts:660-676`): all subaccounts, contracts and every cost row of the category across all years.
- `["cost-book", projectId, category]`, `["capex-totals", projectId]`, `devCoCapexContracts/Costs`, and the keys that embed id sets (`generators(project,"turbines",...ids)`, `generatorModels(ids)`, `devCoLinks(project, idsKey)`): every change of the id set makes a new key and the old one lingers for 5 minutes.
- The Generators warm-up (`app/generatorsWarmup.ts`, 1.5 s after any PM screen opens) prefetches about 10 reads per project opened; they are held for the same 5 minutes.
- The Add Cost Save mutation (`useCostBook.ts:754-760`): the variables include `existingContracts` and `existingCosts` (`Screen.tsx:377-381`). After the save the sheet query is invalidated and re-read, so the old arrays are held only by the settled mutation until it is collected (the screen's `save.reset()` replaces it only on the next Save).

Evidence: DERIVED (grep, code). MEASURED sizes of the largest holder: the add-cost-sheet query data is **4.7 MB** (180 contracts, 21,600 cost rows) and **36.7 MB** (1,500 contracts, 180,000 cost rows; the synthetic size from `prepare.bench.test.ts`).

Verdict: bounded retention, not a leak. The growth driver is the number of distinct project/category screens visited within 5 minutes; after that everything is collected. The dvopt cache doc (`20 - Caching Architecture.md`, principle C6) keeps `gcTime` at its default on purpose, so a change is a trade (a quick return to a screen is instant today). Direction in the register row.

### MEM-02 - six copies of the Add Cost sheet (P3, CONFIRMED)

`Screen.tsx` holds at the same time: the query data; `loaded.loadedRows`; `loaded.grid`; `loaded.roundTripped`; the `originalRows` state (the same reference as `roundTripped`, set at `Screen.tsx:205-206`); the `currentRows` state (a second array after the first edit); and react-spreadsheet builds its own model from `grid`. `loadedRows` is kept only because `prepareSheetSave` runs the identity round-trip check (`Screen.tsx:331`), the D51 safety net that must stay.

MEASURED (`mem.heap.test.ts`, forced GC, MB retained, data only, react-spreadsheet's model excluded):

| Sheet | query data | + loadedRows | + grid | + roundTripped | + currentRows | total |
|---|---|---|---|---|---|---|
| Typical: 20 accounts, 180 contracts, 21,600 cost rows, grid 261 x 126 = 32,886 cells | 4.7 | 0.6 | 1.7 | 0.9 | 0.4 | **8.2** |
| Stress: 100 accounts, 1,500 contracts, 180,000 cost rows, grid 1,901 x 126 = 239,526 cells, 15,000 sheet rows | 36.7 | 4.7 | 11.8 | 6.8 | 3.8 | **63.8** |

Negligible at typical sizes. The fixtures are synthetic (no real project was available); the real cell and row objects carry the same fields, so the order of magnitude holds.

### MEM-03 - the drawn grid window in a browser is unmeasured (P2, SUSPECTED)

D140 windows the grid: rows in view plus 15 each side, and columns only once widths are pinned (`SpreadSheet.tsx:786-788 and 816-822`: `columns` is `null` until `columnWidths` exists, which draws every column of the drawn rows). react-spreadsheet keeps seven state subscriptions per drawn cell (`rowWindow.ts` header comment, `platform/useContextSelector.ts`).

MEASURED, with a strong caveat (`mem.heap.dom.test.tsx`, jsdom): mounting the real `SpreadSheetComp` on the 32,886-cell grid took **207-214 MB** of JS heap above baseline while mounted, with 14,696 DOM elements (7,056 `td`). jsdom has no layout, so it drew the fallback window (56 rows x 126 columns). A control that creates 14,224 plain jsdom elements (`td` + `div` with class and text) cost **60.8 MB**, so about 150 MB is not explained by jsdom nodes alone. In a real browser DOM nodes are outside the JS heap and layout pins the column window, so the real number is lower. How much lower is not known; this is why it is SUSPECTED, and why the register asks for a Chrome heap snapshot before any change.

After unmount the heap returned to baseline in the clean run (reading after each cycle, MB above baseline: +3.9, +4.3, +4.4, +2.0, -0.8, -3.0, -3.0, -2.9, -2.7, -2.6). That is the leak check for this component: no growth over 10 cycles. A second run that I changed to add the jsdom control first left about 72-79 MB flat after unmount and also did not grow (the control's retained nodes, not the grid); its numbers are in `_bench/MEM/mem.heap.dom.results.txt`. The per-cycle numbers of the clean run quoted above were printed to the terminal; that results file was overwritten by the second run, so re-running the test without the control (delete the first `it`) reproduces them.

### MEM-04 - `tokenCache` is only bounded by writes (P3, HIGH)

`data/client.ts:261` keeps `tokenCache` (table | filter+sort signature to skip tokens plus the cached `@odata.count`). A new entry is created for each signature on first walk (`:336-338`). It is removed only by `invalidatePageTokens(table)` after a write to that table in the same tab (`executePlan.ts:339-391`) or by `resetPageTokens`, which has no caller outside tests. Not cleared on project change or screen exit. The prior assessment recorded this as small; the growth driver is the number of distinct filters or sorts tried on the Project Overview in one tab, each holding one token string per page walked. Realistic bound well under 1 MB. Entry size not measured.

### MEM-05 - abandoned heavy reads keep running (P3, HIGH)

No code path in `src/` uses an `AbortSignal` (grep), and `data/requestPolicy.ts:10` states there is no cancel path through the SDK. `fetchAll` (`data/client.ts:58-100`) walks up to 50 pages x 500 rows for a read that the user may already have left, and the rows are stored in the cache (MEM-01). The prior programme judged full AbortController plumbing not worth it (`04_Memory_Management_Assessment.md` section 2). A cheaper variant is to pass TanStack's `signal` from the query function into `fetchAll` and stop between pages; pages already in flight still complete. Impact is wasted bandwidth and a short heap/CPU burst, not growth.

## 3. Checked and NOT a leak (negative findings)

### Event listeners

| Where | What | Verdict |
|---|---|---|
| `app/generatorsWarmup.ts:78-83` | `pointerover` / `focusin` on `document` (lazy warm-up, `GENERATORS_WARMUP_LAZY`, default OFF) | Removed in the effect cleanup, same options object `true`. Measured with the default (timer) path: 25 mount/unmount cycles, 0 pending timers after |
| `components/beforeUnload.ts` | one shared `beforeunload` | Reference-counted, removed at zero. Measured: no net listener over 25 cycles of hold/release |
| `components/UnsavedChangesGuard.tsx:54-55` | `beforeunload` | Removed in cleanup (a second registration next to the shared one: duplication, not leak) |
| `components/useMediaQuery.ts:14-15` | `matchMedia` change | Removed; the `subscribe` function is memoised per query. Measured: no net listener |
| `spreadsheet/pasteTrim.ts:41-42` | `paste` capture on `document` | Removed. Measured with the grid and as a hook: no net listener |
| `spreadsheet/SpreadSheet.tsx:799-806` | `scroll` capture, `resize`, `ResizeObserver` | All three removed in one cleanup. Measured: 25 StrictMode mount/unmount cycles of a 200-row x 18-column grid: listeners 1 to 1 (the one is React DOM's own `selectionchange`), ResizeObservers 0 to 0, timers 0 to 0, rAF 0 to 0, body children 0 to 0 |
| `capex-costs/PcfGrid.tsx:123-140` | `PCF_RE_RENDER`, `ResizeObserver`, rAF | Removed / disconnected / cancelled; `grid.destroy()`, `menu.destroy()`, `replaceChildren()`. Measured with the real vendored `GridRenderer`, 25 cycles, the Add dropdown open at unmount in the even cycles and a click on the row-actions button in the odd ones: window listeners net 0 (only React DOM's `selectionchange`), ResizeObservers 0 to 0, body children 0 to 0 |
| `pcf/ui/GridRenderer.js:1186-1239, 1347-1378`; `ActionDropdown.js:74, 267` | `window` click for dropdown light-dismiss | Removed on close and in `destroy()`, same bound handler reference. Row handlers are `onclick =` properties on nodes that are dropped with the table, so no registry exists |
| `platform/globalErrors.ts`, `appInsights.ts:166` | `error`, `unhandledrejection`, `securitypolicyviolation` | Installed once for the page lifetime (guarded; `watchDelivery` runs once per SDK start). App-lifetime by design |

One small item inside the vendored renderer: its `ResizeObserver` callback queues a `requestAnimationFrame` that is not cancelled in `destroy()` (`GridRenderer.js:119-130`). It fires once, at most one frame later, and its guard (`_tbody.children.length`) keeps it harmless. Bounded, not worth a change.

### Timers and frames

No `setInterval` exists in `src/` outside tests. `setTimeout` sites were each read: all cleared on unmount or re-arm (`usePlanWrite` success timer, Add Cost read-back timer, `SpreadSheet` measure timer, `useDebouncedValue`, Overview next-page prefetch, `ProjectMap` follow-pin, Grid Operator flash, Planning flash) or one-shot and short (`saveLog` defer 0 ms, `saveTimeline` 0 ms plus a 1-shot paint-timeout that `finish` clears, `requestPolicy.withDeadline` cleared in `finish`, `retry` sleep, `panelLoader` idle callback with cancel, Check List transition poll is an awaited loop of at most 20 x 1.5 s). `azureMapsToken` refresh timer: armed only while a map is mounted (`retainAzureMapsToken`, fixed since FE-P1-05).

### Subscriptions

- TanStack query and mutation cache subscriptions: `attachQueryLog` subscribes once per `QueryClient` at module load, with a returned unsubscribe. Its `loads` / `writes` maps are emptied on success, error, `setState` idle and `removed` (FE-SH-07 fixed).
- `telemetry` listeners and sinks: `useHasTracedError` unsubscribes and ignores deferred notifications after unmount; `addSink` is called once (`listenForTraces`, `??=`).
- `useSyncExternalStore` users (`backgroundSave`, `useMediaQuery`, the D140 `useContextSelector` shim): `subscribe` identities are stable and each returns an unsubscribe that deletes from its `Set`. In the shim, 28,000 cell subscribers are a `Set` of closures owned by the Provider's store, released with the grid.
- Azure Maps: `map.dispose()` in the effect cleanup, `releaseToken()` first, refs nulled. One map per General Data mount, created once (empty deps), the pin and device marker are updated through data sources, not by recreating the map. A one-shot `getCurrentPosition` only (no `watchPosition`). Not verified in a browser (WebGL context release, section 5).

### Module-level caches and buffers

| Cache | Bound |
|---|---|
| `platform/telemetry.ts` ring | 200 entries (`MAX_ENTRIES`), spliced on push. Entries keep a `detail` reference (an Error or a small object) |
| `platform/requestLog.ts` `recent` | 5; `batches` flushed 300 ms after the last call or 2 s at most; `scopes` removed when an action ends |
| `platform/consoleGate.ts` `held` | 1,000 lines max (`HELD_MAX`), oldest dropped. If the environment read never succeeds the buffer stays at 1,000 string-and-args entries (a few hundred kB), never more |
| `appInsights/appInsights.ts` `pending` | 100 (`MAX_PENDING`) |
| `data/saveLog.ts` `deferredLogs` | each entry removes itself when it prints |
| `data/capexWrites.ts` `addLedger` | 20 (`ADD_LEDGER_MAX`), oldest first |
| `data/stableCreateId.ts` `pending` | 50 (`MAX_PENDING`) |
| `domain/locale.ts` four Intl pools | 64 each, cleared at the cap |
| `domain/numeric.ts` `decimalPatterns` | keyed by a regex source built from a few sign/place combinations |
| `data/personCache.ts`, `data/checklistPeople.ts` | one entry per person id or `country|technology` looked up; expired entries are not removed but replaced on the next ask. Bounded by the directory entries touched; each a small Persona. Cleared by the Check List Refresh |
| `data/generatorsBulk.ts` `extraTables` | registered once per table at start-up |
| `features/pm/planning/seedOnce.ts` `created`, `app/generatorsWarmup.ts` `warmed` | one short key per project/seed opened in the page load |
| `features/cost/periods/OpexScreen.tsx` `otherFoldState` | one small record per project |
| `features/admin/admin-gates-approvals/hooks.ts` `togglesInFlight`, `sliceReloads` | entries deleted when they reach zero / when the loop ends (`finally`) |
| `features/cost/costing/backgroundSave.ts` `running` | decremented on settle; the unload hold is released through `undo` |
| `data/persistedReference.ts` (D142) | The Generators catalogue cache is OFF (`persistCatalogue: false`). Even when on: one IndexedDB key per catalogue and FID, version key, 12-hour age, dropped on read when stale |
| `sessionStorage` / `localStorage` | per-tab 501 flags (a handful of keys), the Azure Maps token (one key). Never rows |

### Other

- **TanStack structural sharing** (`app/queryStructuralSharing.ts`): MEASURED (`mem.sharing.test.ts`) on an unchanged refetch of cost rows each carrying a `Date`: 13.1 ms for 21,600 rows and 120.0 ms for 180,000 rows, against 14.7 ms and 147.2 ms for TanStack's stock `replaceEqualDeep`. It returns the cached array in both cases. Not a bottleneck and not worse than the stock behaviour.
- **Toasts**: error toasts use `timeout: -1` and a limit of 4 visible (`components/useNotify.tsx:70-75`, `AppToaster.tsx`); they accumulate only with repeated failures and each is a small tree. Progress toasts are dismissed by their `done()` (idempotent).
- **PCF dropdown nodes on `document.body`**: removed in `destroy()`; the comment tooltip too (FE-C1-09 fixed, `pcfGridDestroy.test.ts`).
- **Object URLs, Workers, WebSockets, BroadcastChannel, EventSource, message channels**: none in `src/`.
- **Persisted caches**: no TanStack persister; IndexedDB used only by the OFF-by-default catalogue cache.

## 4. Prior findings re-checked (FE-programme `04_Memory_Management_Assessment.md`)

| Prior ID | Status now (checked in source) |
|---|---|
| FE-SH-07 query-log scope left open | Fixed: `app/queryLog.ts:61-84` closes the scope on `removed` and on `setState` when idle, noted "cancelled" |
| FE-P1-05 token refresh timer re-arms forever | Fixed: `platform/azureMapsToken.ts:111-135` arms only while `mapsMounted > 0` |
| FE-P2-08 Grid Operator flash timer | Fixed: effect with `clearTimeout` at `features/pm/grid-operator/Screen.tsx:200-205` |
| FE-C1-09 comment tooltip stranded | Fixed: `destroy()` calls `hideCommentTooltip()` (`GridRenderer.js:1459-1470`), pinned by `pcfGridDestroy.test.ts` |

## 5. Limitations

- **No browser.** Every heap number above is node or jsdom. jsdom nodes are JS objects; browser DOM nodes are not on the JS heap. The jsdom grid number (MEM-03) must not be read as a browser number. Heap snapshots, detached-DOM checks and `chrome://gpu` WebGL context counts were not possible (no signed-in browser, hard rule 3).
- **Azure Maps** was not mounted in any test (it needs WebGL and a token flow); its lifecycle was judged from the source and the prior assessment. Whether `atlas.Map.dispose()` frees its WebGL context after about 20 General Data round trips remains unconfirmed.
- **Synthetic fixtures.** The Add Cost sizes use generated contracts and cost rows with the real field set, not a real project.
- **Long-session growth** (hours of navigation) cannot be reproduced offline; the cycle tests cover 10-25 mount/unmount iterations per component only. Suggested field check: open a real project, alternate DEVEX/CAPEX and Add Cost from Table 20 times, take a heap snapshot before and after, and compare detached DOM and `Map`/`Set` sizes.
- jsdom `ResizeObserver` and timers were replaced by counting stand-ins in the leak test; real layout-driven callbacks (the column re-fit, scroll window updates) were not exercised.
- The data-layer modules `bulkSend.ts` and `addCostSheet.ts` were not read end to end; their module state was judged from grep and comments.

## 6. Register note for the orchestrator

The brief lists 17 column names but says "16" and "15". `_register/MEM.md` follows the 17-name header list literally (including `Origin`). All rows were checked to have exactly 17 cells and no `|` inside a cell.
