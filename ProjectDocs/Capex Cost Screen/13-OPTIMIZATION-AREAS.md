# 13 — Optimisation areas: DEVEX/CAPEX Costs screen

Gap ID prefix: **GAP-OPT**. This file covers performance: the canvas app's performance smells, with evidence, and the
code app's optimisation opportunities, ranked.

The request counts it builds on are in `12-NETWORK-CALLS.md`. The symbols (N, Nc, A, U, D, P, S) follow that file's §1:

| Symbol | Meaning |
|---|---|
| N | contracts on the project, all categories |
| Nc | contracts in the open category |
| A | accounts plus sub-accounts in that category |
| U | cost rows a save upserts |
| D | cost rows a save deletes |
| P | rows a standard contract creates |
| S | rows in the standard-assumption table |

Behaviour is owned by files `07` to `11`. This file only says *how expensive* something is and *what could be done*. It
changes nothing.

---

## 1. Scope

**Canvas.** All under `ProjectDocs/_extracted/msapp/projectcosts/`:

- `Src/Capex Costs Screen.pa.yaml`. The control map is the one in `12-…` §1; the most-cited ranges are:
  - L1014–2299: `btn_Capex_Cost_Refresh_Capex_Cost_Code`;
  - L722–777: the Reload button;
  - L452–721: Build StandardContractOptions;
  - L778, L18928–19741: the five timers;
  - L7234–7768: the PCF and the paid button;
  - L10136–10222: comment save;
  - L17574 and L17687: the Save `OnSelect` and the dead `btn_SaveCost_Execute____.OnChange`.
- `Src/App.pa.yaml:L205`: OnStart.
- `Properties.json:L9-95`, `L109`, `L115-130`.
- `AppCheckerResult.sarif`: 654 results in all, 198 in module `Capex Costs Screen`. Both were counted with PowerShell
  `ConvertFrom-Json`.

**PCF.**

- `ProjectDocs/Existing Solution/PCF Git Repo Clones/DevexCapexSummaryPCF/TableConnectedToDataversePCF/index.ts`;
- `…/ui/GridRenderer.ts`.

**Code app.** All under `ProjectCosts-CodeApp/`:

- `vite.config.ts`;
- `dist/assets/`, the last local build, dated 26 Oct 2026. It was listed and gzip-measured read-only, not rebuilt;
- `src/app/Providers.tsx`, `src/app/SessionContext.tsx`;
- `src/features/cost/capex-costs/`: `Screen.tsx`, `PcfGrid.tsx`, `CommentsPanel.tsx`, `gridRows.ts`, `writeSet.ts`,
  `pcf/ui/GridRenderer.js`;
- `src/features/cost/costing/useCostBook.ts`;
- `src/data/`: `costBook.ts`, `client.ts`, `capexWrites.ts`, `comments.ts`, `standardContracts.ts`, `project.ts`,
  `odata.ts`;
- `src/features/cost/contracts/hooks.ts`.

**Prior documents.**

- `ProjectDocs/instructions/KNOWN-RISKS-AND-DECISIONS.md` (R-10, R-11, R-12);
- `ProjectDocs/app-docs/PCF-RENDERER-PORT.md`;
- `ProjectDocs/app-docs/02-OPEN-DECISIONS.md` (D38 §6–§8).

---

## 2. Canvas implementation: performance smells, with evidence

### 2.1 Whole-table materialisation and the 2,000-row cap

**The cap.** `Properties.json:L109` sets `"DefaultConnectedDataSourceMaxGetRowsCount": 2000`. App Checker reports
`app-DataSourceDefaultMaxRowsLimit` on `App` ("Data row limit for non-delegable queries is more than 500"). Every
`ClearCollect` and every non-delegable query silently stops at 2,000 rows.

**Whole-project materialisation in OnStart.** OnStart › 714–750 loads:

- every contract of the project: `ClearCollect(colCapexProjectContracts, Filter('CAPEX Project Contracts', Project =
  …))`;
- then every cost row, **one request per contract**:

```powerfx
Collect(colCapexCosts, Ungroup(ShowColumns(AddColumns(colCapexProjectContracts As Item, Value,
    ShowColumns(Filter('CAPEX Costs', Contract.'CAPEX Project Contract' = Item.'CAPEX Project Contract'), …)), Value), Value));
```

The same N+1 load runs again in `btn_Capex_Cost_Reload_PCF_After_Mutation_Code` (L737–766), after **every** mutation
(`12-…` §2.13). Each per-contract `Filter` is itself capped at 2,000 (inferred: harmless at about 12 rows per contract
per year).

**Non-delegable whole-table reads.** These read the first 2,000 rows of a table and filter on the client. App Checker
flags each with `app-SuggestRemoteExecutionHint`:

- `btn_Capex_Cost_Build_StandardContractOptions_Code.OnSelect` (L460–486):
  `Lower(Text(InnerDCS.Technology)) = Lower(Text(gblSelectedProject.Technology))`, plus a `LookUp` into a local
  collection inside the predicate. It runs on every refresh path (screen entry, tab, reload).
- `cmd_Costs_ProjectCosts_TableCommandBar.Items` (L3091–3123): `Lower(DCS.Technology)`. It sits on a hidden control
  (`Visible: =false`, L3566); whether it evaluates is an open question (§5).
- `DevexCapexSummaryPCF.OnChange`: three flagged `LookUp`s on `'CAPEX Project Contracts'` (L7380–7383, L7426–7429,
  L7446–7449), plus `app-SuggestRemoteExecutionHint-OpNotSupportedByColumn` on `varSelectedRow.vsb_capexaccountlistid`.
  Every paid toggle and every standard-contract click pays for them.
- `drp_Add_Edit_Cost_Data_RightPanel_Form_Link_to_Cluster.Items` (L11436–11445): `Max`, `Filter`. The table is only 10
  rows, so this is harmless.

**UpdateIf without delegation.** `UpdateIf('CAPEX Costs', Contract = … && 'Cost Paid' = true, …)` (L20055–20059) runs
with `"enableupdateifdelegation": false` (`Properties.json:L74`).

- (inferred) It evaluates against the first 2,000 rows of the **whole** `CAPEX Costs` table, all projects, and PATCHes
  one row at a time.
- On a tenant with more than 2,000 cost rows that is a correctness risk as well as a cost: a paid row outside the first
  2,000 is never reset.

**Collections never updated.** App Checker raises `app-CollectingReadOnlyTable` ×9 on this screen: 6 in the Refresh
button and 3 in the Add Cost from Table button. These are full copies held in memory where a `With()` or a direct
reference would do.

### 2.2 Timers used as sequencing workarounds

The screen has five `Timer@2.1.0` controls (L779, L18929, L19033, L19137, L19581).

| Timer | Settings | Why it exists | Evidence |
|---|---|---|---|
| `tmr_Capex_Initial_Load` | `Duration: =500`, `Repeat: =true`, `Start: =locCapexInitialLoadPending` (L781–784) | Polls every 500 ms until `gblAppStarted` and the OnStart collections exist. OnStart is non-blocking (`"usenonblockingonstartrule": true`, `Properties.json:L16`) | `OnTimerEnd` L782 |
| `tmr_Load_Contract_Gallery_Warmup` | `AutoStart: =locWarmupKick`, `Duration: =1` (L19583–19584) | Defers the panel's skeleton build until after the panel is drawn ("warm-up") | L19585–19738 |
| `tmr_Capex_Cost_Cost_EnrichLoader` | `AutoStart: =locStartBinding`, `Duration: =100` (L19139–19140), **and** `Start: =true` (L19576) | A second deferral, so the per-year prefill runs after the warm-up. It does 12 local `LookUp`s × `locProjectDuration` years (L19187–19234) | L19141–19574 |
| `tmr_Capex_Cost_Category_SwitchTabs` | `AutoStart: =locStartCategoryBinding`, `Duration: =300` (L18931–18932) | **Dead.** `locStartCategoryBinding` is only ever set to `false` (L2443, L782, L19026) | L18933–19028 |
| `tmr_Capex_Cost_Category_SwitchTabs_1` | `AutoStart: =locStartCategoryBinding1`, `Duration: =100` (L19035–19036) | **Dead.** Only started from the dead timer above (L19026) | L19037–19132 |

The warm-up and enrich chain adds at least 101 ms (1 + 100) of artificial latency every time the panel opens, on top of
the formula cost. The two dead timers still ship formulas of about 95 lines each.

### 2.3 Sequential patches and N+1 writes

| Pattern | Where | Shape |
|---|---|---|
| Bulk `Patch(DS, ForAll(...))` of cost rows | Save, individual (L17574 › 1119–1156) and equal (› 1780–1845); standard contract (L18849–18889) | One row operation per month. (inferred) It may be sent as one `$batch`. App Checker raises `app-ForAllWithMutation` on Save `OnSelect` and on `btn_SaveCost_Execute____.OnChange` |
| `ForAll(colCapexToDelete, Remove(...))` | L17574 › 1164–1170 | One delete per cleared month, sequential |
| `RemoveIf('CAPEX Costs', contract)` then a re-create | Equal save (› 1776–1779) | Deletes and re-creates **every** row of the contract, even unchanged ones |
| Comment save | L10147–10207 | A `RemoveIf` per deleted comment, then per comment, **changed or not**, a root `LookUp` and a `Patch`, so 2 requests per comment. App Checker raises `app-ForAllWithMutation` |
| Reload after every mutation | L722–777 | Re-reads all N contracts' cost rows one request per contract, then Nc to 2Nc aggregate requests (L1530–1568) |
| Double work | L7403–7413, after `btn_Capex_Cost_Add_Standard_Contract_Code` has already reloaded (L18903) | (inferred) Refresh and Build run a second time |
| Duplicated `SetCostPaidUnpaidTriggered` block | L7422–7437 and L7442–7456 | The non-delegable contract `LookUp` runs twice per toggle |

### 2.4 Huge formulas re-evaluated

**`btn_Capex_Cost_Refresh_Capex_Cost_Code.OnSelect` (L1017–2296)** is 1,285 lines.

- Its final `ClearCollect(colFinatCostDataOptimized, AddColumns(AddColumns(colFinatCostDataOptimizedTemp As R, …)))`
  (L1570–2295) evaluates **65 `Filter`s and 13 `Sort`s per grid row**, counted with PowerShell over L1570–2295.
- They scan `colFlatCostsMapped`, `colCapexCommentsLatest` and `colContractTotalsForPCF`.
- So the cost is O(rows × cost rows × 65).
- It runs on screen entry, on every tab, on **every year step** (L2939, L2992, L3058), after every mutation and after
  every comment save.

**Duplicated columns in the same collection.**

- `M1Paid…M12Paid` (L2141–2224) recompute exactly the same 12 filters as `Month1Paid…Month12Paid` (L1707–1790).
- `CommentTooltip` and the 12 `M{n}CommentTooltip` re-run the same `Filter` as their `HasComments` twins, plus a `Sort`.

**`colCapexCommentsLatest` (L1067–1190)** does a `LookUp` and a `Filter`+`Sort` per parent comment over the whole
category's comments.

**Save `OnSelect` (L17574)** is one formula of **91,256 characters** (the longest line in the file). Hidden
`btn_SaveCost_Execute____.OnChange` (L17687) is a 90,930-character near-copy. It is never `Select`ed and its control is
`Visible: =false` (L17692), so it is dead weight that the maker still has to parse.

**App Checker `app-ScreenHasManyControls`** on `'Capex Costs Screen'`. The YAML declares **355 controls** (`Control:`
lines). The source file is 1,822,080 bytes.

**`app-CountRowsGalleryAllItems`** on `gal_Capex_Comments…con_Capex_Comments_ParentBody.Height`. The Save `DisplayMode`
also runs `CountRows(Filter(gal_Capex_Comments.AllItems, …))` twice (L10099–10111).

### 2.5 Hidden or legacy controls that still carry work

| Control | Evidence |
|---|---|
| `gal_Costs_ProjectCosts` | `Visible: =//true`, a comment-only formula (L4323). Its row labels each carry fiscal and non-fiscal `Sum(Filter(…))` blocks (for example L4508–4590), local but large |
| `cmd_Costs_ProjectCosts_TableCommandBar` | `Visible: =false` (L3566). `Items` has a per-assumption `LookUp('CAPEX Project Contracts', …)` (L3135–3147), which is server N+1 if it evaluates |
| `cmp_PopUp_Confirmation_1` | `Visible: false` (L425–427), with a full `OnConfirm` (L376–401) |

**App Checker `app-UnusedVariables` ×13** on this screen, for example `locBindGallery`, `locConfirmClusterLinkChange`,
`locSelectedCapexComments`, `locTotalCost`. **`app-WarnInvalidTypeForVariableDefinition` ×10** (`locSelectedAccount`
set to `Blank()`, among others).

### 2.6 App Checker summary for `Capex Costs Screen`

| Rule | Count | Performance relevance |
|---|---|---|
| `acc-AccessibleLabelNeeded` | 90 | none (see `05-UX.md`) |
| `acc-TabIndexShouldBeDefinedForInteractiveControl` | 51 | none |
| `app-UnusedVariables` | 13 | low |
| `app-SuggestRemoteExecutionHint` | 10 | **high**: non-delegable server reads (§2.1) |
| `app-WarnInvalidTypeForVariableDefinition` | 10 | none |
| `app-CollectingReadOnlyTable` | 9 | medium: memory copies |
| `acc-FocusBorderShouldBeVisible` | 6 | none |
| `app-ForAllWithMutation` | 6 | **high**: excessive re-evaluation and sequential writes (§2.3) |
| `app-ScreenHasManyControls` | 1 | medium: load and render time |
| `app-CountRowsGalleryAllItems` | 1 | low |
| `app-SuggestRemoteExecutionHint-OpNotSupportedByColumn` | 1 | **high**: the PCF `OnChange` contract `LookUp` |
| `app-DataSourceDefaultMaxRowsLimit` (app-wide) | 1 | **high**: the 2,000-row cap |

---

## 3. Code app implementation: what it already fixes, and what is left

### 3.1 Already addressed (canvas smells not carried over)

- **The N+1 cost load is gone.**
  - `loadCostLines` and `loadPayments` (`data/costBook.ts:1013-1166`) read only the open category.
  - They batch contract ids 40 at a time (`odata.ts:70`, `:72-82`) and run the chunks in parallel (`Promise.all`,
    `costBook.ts:1019`, `:1131`).
  - The Summary tab reads two columns at a 5,000 page size (`costBook.ts:1216-1243`, UT-BOOK-034).
- **The 2,000-row cap is gone.** `fetchAll` follows the skip token (`client.ts:50-82`).
- **No timers.** Sequencing comes from query dependencies (`enabled:` flags in `useCostBook.ts`), and the panel opens
  synchronously (`Screen.tsx:327-343`).
- **The 65-filters-per-row rebuild is replaced by one linear pass.** `gridRows` (`gridRows.ts:127-213`) builds maps
  once (`:143-160`) and is memoised (`PcfGrid.tsx:58-61`). A year step is pure client work (`12-…` §3.4).
- **The renderer's per-cell `Intl.NumberFormat` is pooled.** `PCF-RENDERER-PORT.md:16-22` measured 266 ms down to 10 ms
  at 100 rows. Pinned by `pcfGridFormat.test.ts`.
- **Duplicated canvas blocks were not ported:** the double `SetCostPaidUnpaid` `LookUp`, the double reload after a
  standard contract, the hidden command bar, the legacy gallery and the dead timers.

### 3.2 Bundle and chunk size

**Measured from `dist/assets`** (26 Oct 2026 build). Sizes are raw bytes, then gzip (.NET `GZipStream`, Optimal;
approximate).

| Chunk | Raw | Gzip |
|---|---|---|
| `fluent-DlR6PPo5.js` | 764,091 | ≈ 199,540 |
| `Screen-UbSg5y4D.js`, the largest screen chunk (not CAPEX) | 350,120 | ≈ 101,604 |
| `components-BxIm17Kv.js` | 306,510 | ≈ 91,175 |
| `index-BAnKm3gf.js` | 204,627 | ≈ 63,467 |
| `Screen-Dxm5UhZZ.js`, **the CAPEX screen** (contains the string "DEVEX/CAPEX cost grid") | 82,536 | ≈ 23,022 |

- The whole build is 80 JS files, 2,961,957 bytes raw.
- The CAPEX chunk imports these chunks: `clusters`, `components`, `contracts`, `costBook`, `fluent`, `hooks`,
  `numeric`, `useCostBook`.

**Chunking** (`vite.config.ts:21-39`): only `@fluentui` and `@griffel` are split (`manualChunks`). Every screen is
`lazy()`-loaded (`app/routes.tsx:20-45`).

**`sourcemap: true`** (`vite.config.ts:23`) emits **79 `.map` files, 19,598,071 bytes**, into `dist/`. `pac code push`
deploys `dist/` (`power.config.json` `buildPath`; `vite.config.ts:7-9`). (inferred) The maps are therefore uploaded with
every push. Browsers only fetch them with dev tools open, so the runtime cost is nil; the cost is push size and source
exposure.

**R-11 says "~570 kB gzipped" for the Fluent chunk. That does not match:** the chunk measures about 764 kB raw and about
200 kB gzip. See §6.

### 3.3 Memoisation in `Screen.tsx` and re-render hotspots

`Screen.tsx` has exactly two `useMemo`s:

- `contractIds` (L294);
- `commentFlags` (L296–299).

Everything else is recomputed on every render:

- `categoryAccounts` and `subaccountIds` (L275–276);
- `standardMilestones`, `standardClusters` and `standardBoundaries` (L366–368);
- `standardOptions` and `pcfStandardOptions` (L372–386);
- `proposed` and `rawProposed` (L454–458);
- the validations (L466–490).

**The grid pays for this on every render.**

1. `<PcfGrid accounts={categoryAccounts} …>` (L744–747) receives a **new array every render**, because
   `accountsInCategory(...)` (L275) allocates one.
2. So the `rows` memo in `PcfGrid.tsx:58-61`, keyed on `props.accounts`, misses on every render, and `gridRows` runs
   again.
3. `useLayoutEffect(() => { …; paint.current(); }, [props, rows])` (`PcfGrid.tsx:64-68`) depends on the `props` object.
   That is a new object every render, so **every `Screen` render repaints the whole grid**.
4. `PcfGrid` is not wrapped in `React.memo`.

A `Screen` render is triggered by:

- **every keystroke** in the Add/Edit panel (`update`, `setCostValue`, `setStartText`/`setEndText`);
- every dialog open or close;
- every query `isFetching` flip;
- every mutation state change.

During typing the grid is behind the panel, but it is still rebuilt in full: `gridRows`, then `dataset()`
(`PcfGrid.tsx:11-15`), then `DatasetParser.parseDatasetToTree`, then a DOM rebuild (§3.4). The cost per keystroke grows
with the category's row count. It is unmeasured (R-11).

### 3.4 The vendored `GridRenderer.js` and its DOM rebuilds

**`render(context)` (`pcf/ui/GridRenderer.js:140-189`) is a full rebuild.** It:

1. closes any floating menus and tooltips;
2. re-parses the dataset into a tree (L157);
3. re-applies the filters (L171–174);
4. rebuilds the `<colgroup>` and both header rows (`this._thead.innerHTML = ""`, L522);
5. empties the body (`this._tbody.innerHTML = ""`, L189);
6. recreates every row and cell with `document.createElement` (76 call sites in the file), each cell with its own
   handler (9 `onclick =` assignments).

No DOM is reused between renders.

**Two resize observers.**

- The renderer's own `ResizeObserver` (L113–126) only **re-fits columns**, coalesced through `requestAnimationFrame`.
  That part is efficient.
- But `PcfGrid.tsx:89` adds a second `ResizeObserver(render)` on the host, and that one calls the **full** `render()`.
- So any host resize (window, sidebar, scrollbar appearing) is a full DOM rebuild, plus a re-fit from the inner observer.

**`PCF_RE_RENDER`** (expand or collapse, L1393–1408) also calls the full `render` (`PcfGrid.tsx:88`). That is upstream
behaviour.

### 3.5 Over-fetching, duplicate queries, missing prefetch, invalidation breadth

| Finding | Evidence |
|---|---|
| **`vsb_capexaccountlists` is read three times on Summary open, and once more per cost-book (re)load.** All select the same five columns over every active account | `loadCapexCategories` (`costBook.ts:744-765`); `loadCostAccounts` from `loadCostBook` (`:1182`) and again from `loadCapexTotals` (`:1271-1272`). `qk.capexAccounts` (`contracts/hooks.ts:68-72`, 30-min staleTime) is a separate fourth reader used by Contracts |
| **The cost book loads in four sequential waves**: accounts, then payer defaults, then contracts, then payments | `costBook.ts:1182-1186`. `loadPayerDefaults` (`:155-173`, the whole SPV/DevCo table, master data) depends on nothing but is awaited after `loadCostAccounts` and before the contracts |
| **`loadProjectStates` inside `loadCostLines` bypasses the 30-min `["capex-project-states"]` cache** | `costBook.ts:1047-1051` against `useCostBook.ts:520-526`. The Screen already loads it (`Screen.tsx:279`) |
| **Redundant project read**: `loadProjectExtras` re-reads `vsb_projects` for `_vsb_country_value` and `vsb_technology` | `project.ts:233-246`. `loadProject` already selects both (`project.ts:144`, `:153`) but does not expose them. `useMilestoneDurations` waits on it (`Screen.tsx:281`), adding a wave |
| **Standard assumptions: whole-table over-fetch, refetched per tab** | `loadStandardAssumptions` (`data/standardContracts.ts:19-35`) filters only `statecode eq 0` and narrows client-side (L36–38): all countries, all technologies, all sub-accounts. The key `["capex-standard-assumptions", subaccountIds]` (`useCostBook.ts:490-495`) changes with every tab and takes the default 30 s `staleTime`, so every tab visit after 30 s re-reads the whole table |
| **Comments panel query duplicates cached data** | `CommentsPanel.tsx:222` runs `useCapexComments([contractId])` while `Screen.tsx:295` already holds the same rows under `["capex-comments", <category ids>]` |
| **Comment save refetches the cost book needlessly** | `useCostBook.ts:606` invalidates `["cost-book", projectId]`. The book never carries comments (`costBook.ts:51-53`) |
| **Invalidation breadth after a one-field write** | `useCapexWrites` `invalidate` (`useCostBook.ts:386-396`) refetches the whole category book, all contracts and all years of payments, after a paid toggle. No optimistic `setQueryData` |
| **Wide `$select`** | Not an issue. Every read names its columns (`client.ts:23-28` makes `select` mandatory); the widest is the contract read, 16 columns (`costBook.ts:1025-1035`) |
| **No prefetch** | No `prefetchQuery` in the CAPEX path (grep). Neither the next or previous tab nor the comments of a hovered contract are warmed |
| **Focus refetch** | `refetchOnWindowFocus: true` with `staleTime: 30 * 1000` (`Providers.tsx:20-24`). Every return to the tab after 30 s refetches the active book (4 waves), the comments and the standard assumptions |

### 3.6 Sequential writes: what can run in parallel and what must not

All CAPEX writes are `await`ed one at a time (`capexWrites.ts:215-291`, `:329-343`; `CommentsPanel.tsx:462-513`). There
is no changeset or `$batch` in the SDK (`capexWrites.ts:7-11`; KNOWN-RISKS "No Dataverse changeset").

| Must stay sequential (data dependency or ordering promise) | Could run with bounded parallelism (independent rows) |
|---|---|
| The contract create **before** its cost rows: the rows bind the new id (`capexWrites.ts:223-240` → `:274`) | The U cost-row upserts of one save (`capexWrites.ts:262-282`), once the contract exists |
| The relink reset **before** the reconcile, so a surviving month is not patched twice (`capexWrites.ts:242-252`) | The relink's p `setCostPaid` PATCHes (`:245-247`) and its k comment deletes (`:249-251`) among themselves |
| **Deletes last**, so an interrupted save leaves extra rows rather than missing money (`capexWrites.ts:284-291`) | The D deletes among themselves |
| Delete-contract: comments, then cost rows, then the contract (`capexWrites.ts:298-343`; UT-CAPEXW-003, UT-BOOK-039) | The comment deletes among themselves, then the cost-row deletes among themselves |
| Comment save: roots before replies, because replies bind the root's new id (`CommentsPanel.tsx:464-513`) | The changed roots among themselves; then the replies among themselves |

Dataverse service-protection limits apply per user: (inferred, platform documentation) 6,000 requests per 5 minutes and
52 concurrent requests. So any parallelism has to be bounded, for example 4–6 at a time. Ordering across the groups in
the left column must be kept.

**Unchanged rows are PATCHed anyway.** `capexWriteSet` (`writeSet.ts:40-56`) upserts every non-null month with an id,
whether or not its amount changed. The stored amount is available (`Screen.tsx:641`, `storedLine?.payments`). A diff
would drop those requests. D38 §6 records the equal-save half of this as "revisit only if write volume becomes a concern
(R-11)".

### 3.7 Row and volume ceilings (R-10)

| Ceiling | Value | Evidence |
|---|---|---|
| Rows per `fetchAll` call | 50 pages × 500 = **25,000** (× 5,000 = 250,000 for cost sums) | `client.ts:47-48`, `:55`, `:69-78` |
| Behaviour at the ceiling | A `trace("error", …)` and a **short list returned**. Nothing reaches the UI | `client.ts:69-78` |
| Ids per filter | 40 per request (URL length) | `odata.ts:66-70` |
| Payment page size | 500. `loadPayments` does not override it, unlike `loadContractCostSums` (5,000), so a category with 2,000 cost rows in one chunk takes 4 round trips instead of 1 | `costBook.ts:1133-1143` against `:1228-1231` |
| `@odata.count` | capped at 5,000 by the platform (not used by CAPEX) | `client.ts:141-142` |
| Server aggregates | none: `$apply` and FetchXML are unavailable through the SDK, so the Summary sums every cost row client-side | `costBook.ts:1205-1215` |

---

## 4. Gaps: Code app vs Canvas

| ID | Area | Canvas behaviour (cite) | Code app behaviour (cite) | Type | Status | Severity | Notes |
|---|---|---|---|---|---|---|---|
| GAP-OPT-01 | N+1 cost load | One `Filter('CAPEX Costs')` per contract in OnStart (› 725–750) and in Reload (L737–766); one `Sum` per contract (L1530–1568) | Chunked `lookupIn`, run in parallel (`costBook.ts:1019-1040`, `:1130-1145`) | Perf | Covered | Low | `12-…` GAP-NET-01 |
| GAP-OPT-02 | Grid build cost | 65 `Filter`s and 13 `Sort`s per row, re-run on every year step (L1570–2295) | Linear `gridRows` built from maps (`gridRows.ts:143-213`); year is client-only | Perf | Covered | Low | |
| GAP-OPT-03 | Timers | 5 timers: a 500 ms polling loop, a 1 ms and a 100 ms deferral, two dead (L778–787, L18928–19741) | Query `enabled` dependencies; synchronous panel open (`Screen.tsx:327-343`) | Perf | Covered | Low | |
| GAP-OPT-04 | Duplicate and hidden work | Double `SetCostPaidUnpaid` `LookUp` (L7422–7456); double reload after a standard contract (L7403–7413, L18903); hidden command bar N+1 (L3135–3147); legacy gallery (L4323) | Single paths; nothing hidden ported (`Screen.tsx:423-452`) | Perf | Covered | Low | |
| GAP-OPT-05 | Row cap | Silent 2,000-row cap (`Properties.json:L109`; App Checker `app-DataSourceDefaultMaxRowsLimit`) | Skip-token paging up to 25,000 rows per call; truncation only traced, and a short list returned (`client.ts:47-82`) | Data / Perf | Partial | Med | R-10. The UI cannot tell a truncated grid from a complete one |
| GAP-OPT-06 | Standard-assumption read | Non-delegable `Filter` (`Lower(Text(Technology))`) over the first 2,000 rows (L460–486; App Checker) | Whole active table read with no country or technology filter, re-read per tab key with a 30 s `staleTime` (`standardContracts.ts:19-38`; `useCostBook.ts:488-495`) | Perf | Partial | Med | Server filter possible: `lookupEq("vsb_country")`, `eq("vsb_technology")`, `lookupIn("vsb_subaccount")` |
| GAP-OPT-07 | Re-render hotspot | n/a: canvas re-evaluation is per formula dependency | Every `Screen` render recomputes `gridRows` and repaints the whole grid: `categoryAccounts` is not memoised (`Screen.tsx:275`), the layout effect depends on `props` (`PcfGrid.tsx:64-68`), and there is no `React.memo` | Perf | Code-app-only | Med | Each panel keystroke rebuilds the grid behind the panel |
| GAP-OPT-08 | DOM rebuilds | The PCF also rebuilds fully on `updateView` (`GridRenderer.ts` `render`, `tbody.innerHTML = ""`) | Same renderer (`GridRenderer.js:140-189`), **plus** a second `ResizeObserver` that calls the full `render` (`PcfGrid.tsx:89`) | Perf | Code-app-only | Med | The extra observer is code-app-only; the inner one only re-fits (`GridRenderer.js:113-126`) |
| GAP-OPT-09 | Duplicate account reads | The chart is loaded once in OnStart (› 665–713) | `vsb_capexaccountlists` read by `loadCapexCategories`, by `loadCostAccounts` (cost book) and again by `loadCostAccounts` (totals) (`costBook.ts:744-822`, `:1182`, `:1271-1272`) | Perf | Code-app-only | Low | One shared cached query (30 min) would serve all three |
| GAP-OPT-10 | Cost-book waterfall | n/a: the canvas reads from memory | Four sequential waves (`costBook.ts:1182-1186`). The payer map is not cached (`:155-173`); project states bypass their cache (`:1047-1051`) | Perf | Code-app-only | Med | Run accounts and the payer map in parallel and cache both: four waves become two |
| GAP-OPT-11 | Project extras | The canvas uses `gblSelectedProject` from memory | `loadProjectExtras` (`project.ts:233-246`) re-reads columns `loadProject` already has (`:144`, `:153`); the milestone query waits on it | Perf | Code-app-only | Low | Expose `countryId` and `technology` on `ProjectContext` |
| GAP-OPT-12 | Comment reads and invalidation | Panel open: 1 comments `Filter` + 1 costs `Filter` (L7467–7472, L7636–7646) | The panel re-queries what the category cache holds (`CommentsPanel.tsx:222`); save also refetches the cost book (`useCostBook.ts:606`) | Perf | Code-app-only | Low | `12-…` GAP-NET-19 |
| GAP-OPT-13 | Invalidation after a paid toggle | A full Reload: N + Nc + Nb + 2 + ⌈S/500⌉ requests (L7752 → L722–777) | 1 PATCH, then a full category-book and comments refetch (`useCostBook.ts:386-402`) | Perf | Partial | Med | Far cheaper than the canvas, but an optimistic `setQueryData` on the one payment would make the toggle instant |
| GAP-OPT-14 | Unchanged-row PATCHes | Individual: every non-blank month is patched (› 1119–1156). Equal: skipped unless the schedule changed (› 1579–1586) | Every non-null month with an id is PATCHed on every save (`writeSet.ts:50-51`; `Screen.tsx:614-628`) | Perf | Partial | Med | D38 §6, `12-…` GAP-NET-15. Diff against `storedLine.payments` |
| GAP-OPT-15 | Sequential writes | Bulk `Patch(ForAll)` (inferred: may be batched); `ForAll(Remove)` | Every write awaited serially (`capexWrites.ts:262-291`; `CommentsPanel.tsx:462-513`) | Perf | Partial | Med | §3.6 lists which groups may be parallelised and which must not |
| GAP-OPT-16 | Payment page size | n/a | 500 rows per page for payments, against 5,000 for cost sums (`costBook.ts:1133-1143`, `:1228-1231`) | Perf | Partial | Low | Raise it to the platform maximum, as UT-BOOK-034 does for totals |
| GAP-OPT-17 | Bundle and source maps | n/a | Fluent ≈ 764 kB raw / ≈ 200 kB gzip; 79 source maps (19.6 MB) shipped in `dist/` (`vite.config.ts:23`) | Perf | Code-app-only | Low | R-11 figure disagrees (§6). `sourcemap: "hidden"` or a separate artifact |
| GAP-OPT-18 | Focus refetch | None | Background refetch of the active book, comments and standard assumptions on every focus after 30 s (`Providers.tsx:20-24`) | Perf | Code-app-only | Low | Deliberate (`Providers.tsx:22-23`). `12-…` GAP-NET-20 |
| GAP-OPT-19 | Summary totals | Computed in memory from `colCapexCosts` (L2469–2508) | Reads every cost row's `vsb_cost` to sum client-side; no `$apply` available (`costBook.ts:1205-1243`) | Perf | Partial | Low | A rollup column or a custom API would make it one row per category. That needs a schema decision |
| GAP-OPT-20 | Upsert guard trade-off | `Patch` on a deleted row errors (inferred) | Plain PATCH, which is an upsert (`client.ts:381-391`). `updateRecordIfExists` exists but costs 1 extra GET per update (`client.ts:392-393`) | Data / Perf | Partial | Med | R-12, `12-…` GAP-NET-14. Adopting it on `setCostPaid` and the contract update doubles those requests |

---

## 5. Prioritised optimisation backlog

Each item is ranked by **impact** (latency or requests saved for a typical user), **effort** (development plus tests),
**risk** (regression or data risk) and **parity risk** (does it change what the canvas visibly does?). Nothing here has
been implemented.

| Rank | ID | Change | Impact | Effort | Risk | Parity risk |
|---|---|---|---|---|---|---|
| 1 | GAP-OPT-07 | Memoise `categoryAccounts`, `subaccountIds`, `standardOptions` and `pcfStandardOptions` in `Screen.tsx`. Depend `PcfGrid`'s paint effect on the specific props, not `props`. Wrap `PcfGrid` in `React.memo` | High: removes a full grid rebuild per keystroke and per fetch-state flip | Low | Low: pure rendering; Screen tests cover the output | None |
| 2 | GAP-OPT-13 | Optimistic `setQueryData` for `setPaid` (flip `payment.paid`), keeping the invalidation as a reconcile in the background, or narrowing it to that contract | High for the most frequent grid action | Low–Med | Med: roll back on error; must respect the confirmation path | None (end state identical) |
| 3 | GAP-OPT-10 / 09 / 11 | One cached `["capex-accounts"]` query (30 min) fed into `loadCostBook` and `loadCapexTotals`; a cached payer map; run accounts and payer map in parallel; reuse `["capex-project-states"]`; expose country and technology on `ProjectContext` | Med–High: tab open goes from 5 waves to about 3, and 3 duplicate reads go | Med (touches `costBook.ts` signatures) | Low | None |
| 4 | GAP-OPT-06 | Filter standard assumptions on the server by country, technology and the category's sub-accounts; or fetch once per project scope with a long `staleTime` and narrow per tab with `select` | Med: whole-table reads per tab disappear | Low | Low: `buildStandardOptions` still applies the canvas predicate | None if the predicate is unchanged (UT tests on `buildStandardOptions`) |
| 5 | GAP-OPT-14 | Skip upserts whose amount equals the stored row's (`capexWriteSet` gets the stored amounts) | Med: a typical edit drops from 12 × years PATCHes to the changed months | Low | Low: end state identical; pin with new `writeSet` tests | Low: D38 §6 already records that the code app writes more than the canvas; this moves it closer |
| 6 | GAP-OPT-15 | Bounded-parallel (4–6 at a time) cost-row upserts, deletes and comment deletes, *within* the groups listed in §3.6 | Med: a 60-row standard contract goes from about 61 serial round trips to about 12 waves | Med | Med: partial-failure reporting must stay honest; respect throttling; keep the cross-group order | None |
| 7 | GAP-OPT-08 | Make `PcfGrid`'s `ResizeObserver` call the renderer's column re-fit instead of a full `render` (needs a small hook into the vendored renderer, applied through `scripts/read-pcf-port.mjs`) | Med during resize and layout | Med (vendored code; port script) | Med | None |
| 8 | GAP-OPT-05 / 16 | Raise `loadPayments` to `maxPageSize: 5000`; surface `fetchAll` truncation to the UI (an error state, not a short grid) | Low today, High at scale (R-10) | Low | Low | None |
| 9 | GAP-OPT-12 | Seed the panel's comments query from the category cache (`initialData`); drop `["cost-book", pid]` from `useCommentWrites().invalidate` | Low–Med | Low | Low: the red dots come from the comments query, not the book (`Screen.tsx:294-299`) | None |
| 10 | GAP-OPT-20 | Decide on `updateRecordIfExists` for CAPEX updates, or an `If-Match` once the SDK supports it | Correctness, not speed. It *adds* one GET per guarded update | Low | Low | None |
| 11 | GAP-OPT-18 | Give the cost book a longer `staleTime` and keep explicit invalidation; or turn off focus refetch for this screen | Low–Med | Low | Med: multi-user freshness is the stated reason for the setting (`Providers.tsx:22-23`), so this needs a product decision | None |
| 12 | GAP-OPT-17 | `sourcemap: "hidden"`, or emit maps outside `dist/` | Low: push size only | Low | Low | None |
| 13 | GAP-OPT-19 | A server-side aggregate (rollup column or custom API) for Summary totals | Low until projects grow | High (schema) | Med | Must keep `Max(Sum(cost rows), 0)` semantics (UT-BOOK-032..036) |

**Writes that must never be parallelised or reordered**, whatever the optimisation:

- contract before rows;
- relink reset before reconcile;
- deletes last;
- comments before cost rows before the contract on delete;
- roots before replies.

The source and tests for each are listed in §3.6. There is no transactional safety net (KNOWN-RISKS "No Dataverse
changeset").

---

## 6. Open questions / not verifiable from source

1. **Real numbers.** Live latency, row counts per category, and the per-keystroke grid cost (GAP-OPT-07) are unmeasured
   (R-11). They need a browser performance profile on a large project under `pac code run`.
2. **Canvas `Patch(DS, ForAll(...))`**: one request per row, or one `$batch`? This decides how much slower GAP-OPT-15's
   serial writes really are than the canvas. It needs a network trace.
3. **Hidden-control evaluation in the canvas** (`cmd_Costs_ProjectCosts_TableCommandBar.Items`, `gal_Costs_ProjectCosts`)
   under `delaycontrolrendering` and `formuladataprefetch` (`Properties.json:L24`, `L26`). See `12-…` §5.
4. **Does `pac code push` upload the `.map` files** in `dist/assets` to the environment (GAP-OPT-17)? Check the deployed
   app's asset list.
5. **Dataverse throttling headroom** for bounded-parallel writes (GAP-OPT-15) under the tenant's actual service-protection
   settings.

## 7. Doc disagreements

| Doc | Claim | Source says |
|---|---|---|
| `ProjectDocs/instructions/KNOWN-RISKS-AND-DECISIONS.md:75` (R-11) | "the Fluent UI chunk alone is ~570 kB gzipped" | `dist/assets/fluent-DlR6PPo5.js` (26 Oct build) is 764,091 bytes raw and about 199,540 bytes gzip. 570 kB matches neither figure |
| `ProjectCosts-CodeApp/vite.config.ts:27` (code comment) | "Fluent v9 is ~630 kB on its own" | 764 kB raw in the current build (includes `@griffel`, per `manualChunks` at L33–36) |
| `ProjectCosts-CodeApp/src/features/cost/costing/useCostBook.ts:483-487` (doc comment) | Scoping the standard-assumption query to the tab's sub-accounts avoids "fetching the whole project's assumptions" | `loadStandardAssumptions` (`data/standardContracts.ts:23-35`) fetches the **whole active table**, every country and technology, and narrows client-side. Only the cache key is scoped |
| `ProjectCosts-CodeApp/src/data/standardContracts.ts:16-17` (doc comment) | Doing the narrowing client-side means "one query per category tab rather than one per sub-account" | True, but every tab's query is the same full-table read under a different key, so the tabs do not share it (GAP-OPT-06) |
| `ProjectDocs/app-docs/02-OPEN-DECISIONS.md:2143-2153` (D38 §6) | Extra PATCHes only on the equal-distribution save | `capexWriteSet` (`writeSet.ts:50-51`) PATCHes every non-null existing month on **both** modes. For Individual the canvas does the same (L17574 › 1119–1156), so the parity statement holds; the D38 text simply covers only one mode |
