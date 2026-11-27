# 05 — Business logic and computation bottlenecks (CMP)

Stage 1 audit, read-only. Worktree `Project-Management-Energy-WorkDev1-BottleneckOptimization`, branch `feature/bottleneck-identification-optimization`, base `dde9e92`. Register: `_register/CMP.md` (9 findings). Measurement scripts and raw outputs: `_bench/CMP/`.

## 1. Bottom line

The pure calculation layer is not where this app loses time. Two optimisation programmes (D160 computation, D162 frontend) and the Add Cost from Table work (D51 §11.12, D140) already removed every O(n²) scan found on the hot paths, and the benchmarks that exist confirm it: a full Add Cost "prepare before Save" on a 15,000-row sheet is 27 ms. What is left is small, mostly P3:

| Finding | What | Measured size |
|---|---|---|
| CMP-01 (P2) | CAPEX grid re-parses its whole dataset through the vendored alias-probing parser on every repaint (fold, year, filter) | 7 ms (96 records) to 112 ms (1,900 records) |
| CMP-02 (P3) | Same repaint rebuilds all rows and forces two layouts | derived, not measured |
| CMP-03 (P3) | Global `structuralSharing` deep-walks every refetch | 20–35 ms at 60k–100k payment objects |
| CMP-04 (P3, latent) | Global request gate is O(N²) in queued tasks (switch OFF) | 3,500 queued writes 228 ms, 15,000 writes 3.5 s |
| CMP-05 (P3) | Add Cost post-Save book patch allocates for every line | 13 ms (no change) to 62 ms |
| CMP-06 / 07 (P3) | Add Cost: first edit and sheet load costs (already recorded) | 141–155 ms once; about 90 ms load at 15,000 rows |
| CMP-08 (P3) | Municipality box (cross-reference, mostly data/rendering) | not measured |
| CMP-09 (P3) | Pooled `Intl` helpers key their cache with `JSON.stringify` | 2–6 µs per call |

The dominant cost of every Cost and PM screen is round trips and payload (other audit areas). Do not spend optimisation effort on `rules.ts` or `domain/` computation before the network findings are done; none of the computation items above is user-visible on its own.

## 2. Scope actually inspected

Read (open, whole or the relevant ranges):

- `src/data/client.ts` (fetchAll, counted paging), `data/costBook.ts` (loadCostAccounts, loadCostLines, loadPayments, loadContractCostSums, loadCapexTotals), `data/concurrency.ts` (gates), `data/pendingDeletes.ts`, `data/stableCreateId.ts`, `data/executePlan.ts` (confirmDeletes), `data/addCostSheet.ts` (sheet load, lines 100-140), `data/generalData.ts` (municipality reads), `data/requestFlags.ts`.
- `src/features/cost/capex-costs/`: `gridRows.ts`, `PcfGrid.tsx`, `standardContracts.ts`, `Screen.tsx` (derivation block), `pcf/services/DatasetParser.js` (the parse), `pcf/ui/GridRenderer.js` (render, filters, col sizing, spacer, toggle).
- `src/features/cost/add-costs-from-table/`: `prepare.bench.test.ts`, `Screen.tsx` (load memo, read-back, Save), `spreadsheet/adapter.ts` (to line 200), `spreadsheet/columnWidths.ts`, `spreadsheet/SpreadSheet.tsx` (data path comments), `savePlan.ts` (phase 1).
- `src/features/cost/costing/savedSheetPatch.ts`, `features/cost/contracts/rules.ts` (`buildAccountTree`, `applyUsage`), `features/cost/periods/opexRules.ts` (ordering and chain functions 395-560), `OpexScreen.tsx` (card derivation), `landLeaseRules.ts` (`leaseWriteTiers`).
- `src/domain/locale.ts`, `domain/dates.ts` (formatDate), `domain/yieldStats.ts`, `app/queryStructuralSharing.ts`, `app/queryLog.ts`, `platform/requestLog.ts`, `appInsights/sanitize.ts`.
- `src/features/pm/revenues/rules.ts` (hedge validation, 1088-1235), `pm/generators/rulesCore.ts` (catalogue cascade 370-500), `pm/generators/sections/panelModels.ts` (call sites), `pm/project-main` (function list, server-side filters).
- Prior art: D140, D160, D162 in `02-OPEN-DECISIONS.md`; `optimization/05_Implementation_Tracker.md`; `frontend-optimization/02` and `06`.

Scanned, not read line by line: `src/**` (non-test) with a static scan (`_bench/CMP/scan-nested.mjs`, 318 candidate "array lookup inside an iteration within 6 lines" hits, listed in `scan-nested.out.txt`). I triaged the hits in data, Cost, Add Cost, periods, Generators, Production, Checklist, Revenues, Milestones, Planning, Admin and domain; each was either a Map/Set-backed lookup, an error-path scan, a once-per-load call, or bounded by a small list (see §6). I did NOT read the bodies of: most of `features/pm/finance/rules.ts`, `checklist/rules.ts`, `general-data/rules.ts`, `milestones/rules.ts`, `planning/rules.ts`, `production/rules.ts` (beyond the loops listed by the scan), `admin/*/rules.ts`, `data/generators*.ts`, `data/adminCost.ts`, `CommentsPanel.tsx`, `ActionDropdown.js`. Their data volumes are small (forms, tens of rows) or already covered by D160.

## 3. Method

1. Read the prior programmes first (D140, D160, D162) so nothing already fixed is re-raised.
2. Ran every existing benchmark test (one file at a time, `npx vitest run <file> --reporter=verbose` from `ProjectCosts-CodeApp/`).
3. For each candidate hot path, established data size and call frequency from code and docs before ranking.
4. Where a pure function could be timed, wrote a throwaway script under `_bench/CMP/` with SYNTHETIC input of stated size. TypeScript modules were bundled with `rolldown` into the scratchpad (outside the repo) and copied next to the script (`gridRows.bundle.mjs`, `savedSheetPatch.bundle.mjs`); `.js` and simple `.ts` modules were imported directly by Node 24. Node runs on the dev machine, not a browser: numbers are relative; absolute browser times will differ.
5. Labels: MEASURED = I ran it; DERIVED = counted or traced from code; ESTIMATED = reasoning; RECORDED = a number stored in a repo document, not re-run.

## 4. Existing benchmarks, run verbatim

### 4.1 `prepare.bench.test.ts` (Add Cost from Table, 15,000 rows) — MEASURED

Command: `npx vitest run src/features/cost/add-costs-from-table/prepare.bench.test.ts --reporter=verbose` (3 tests passed; `_bench/CMP/prepare.bench.out.txt`).

```
prepare bench (15000 rows, 14650 edited rows):
  buildInitialSheet                        18.1 ms
  sheetRowsToGrid                          44.8 ms
  gridToJson (load)                        15.3 ms
  outputRowsToSheetRows (load)             12.4 ms
  gridToJson (edit)                        12.3 ms
  outputRowsToSheetRows (edit)             10.7 ms
  validateSheet                            34.3 ms
  identityRoundTripFailures                1.7 ms
  alignOriginalRowIds                      2.2 ms
  diffRows                                 7.8 ms
  planContractDeletionsCanvasParity        1.3 ms
  planContractDeletions                    2.0 ms
  orphan cleanup (as Screen wrote it)      16.1 ms
  prepareSheetSave (whole Save prepare)    27.0 ms
prepare bench: 3487 of 14650 rows changed
```

UT-ADDPERF-002 (no scan per row) and -003 (linear, not quadratic) also passed. Reading: Save-side computation is not a bottleneck; the load path costs about 90 ms at this extreme size (CMP-07).

### 4.2 `financePerf.bench.test.ts` — MEASURED, but it measures network shape, not computation

9 tests passed (`financePerf.bench.out.txt`). It models 25 ms per call and counts requests/rounds ("visit reads 15 req / 42 rounds before, 9 req / 3 rounds after"; "tranche save EDIT 42 req / 46 rounds, 34 req / 7 rounds after, 11 req / 8 rounds with bulk"). Relevant to the Dataverse audit, not to CMP.

### 4.3 `checklistVisit.bench.test.tsx` — NOT USABLE for CMP

Opt-in (`CHKBENCH=1`), models 120 ms per hop in jsdom with a dev build. I ran it for the S6 keystroke scenario only (`-t S6`, `checklistVisit.S6.out.txt`); the results table is printed by test 099, which that filter skips, so no number was captured. It is a round-trip model, not a CPU measurement; I did not repeat it.

## 5. Findings (full rows in `_register/CMP.md`)

### CMP-01 (P2, CONFIRMED) — the CAPEX grid parser re-runs its alias probing on every repaint

- Path: any change to the grid inputs (fold or unfold an account, year, payer, show-empty, comment flags, standard options, new data) → `PcfGrid.tsx` paint → `GridRenderer.render` → `DatasetParser.parseDatasetToTree(dataset)` at `pcf/ui/GridRenderer.js:165`. `toggleCollapse` (`:1424`) dispatches `PCF_RE_RENDER`, which calls the same `render`.
- Cause (`pcf/services/DatasetParser.js`): for each record it probes alias lists. A missing/empty alias costs `getValue` plus `getFormattedValue`: `months` (`:246`, 12 × 5 aliases), paid flags (`:256`, 12 × 9), comment tooltips (`:303`, 12 × 17), has-comments (`:327`), the contract tooltip (20 aliases) and a re-scan of every column with `toLowerCase` (`:370`). The vendor needed this because Canvas collections name columns inconsistently. In this app `PcfGrid.tsx:11-15` builds the dataset in-process with fixed keys from `gridRows`, so the fallbacks never find anything new.
- Evidence (MEASURED, synthetic, `datasetparse.bench.mjs`, `datasetparse.count.mjs`):

```
parseDatasetToTree 96 records (6 acc x 3 sub x 4 contracts), 62 columns        median 6.8 ms  min 5.3 max 10.4
parseDatasetToTree 570 records (30 acc x 3 sub x 5 contracts), 62 columns      median 32.1 ms  min 29.9 max 33.6
parseDatasetToTree 1200 records (30 acc x 3 sub x 12 contracts), 62 columns    median 58.3 ms  min 52.6 max 75.0
parseDatasetToTree 1900 records (100 acc x 3 sub x 5 contracts), 62 columns    median 112.1 ms  min 97.0 max 143.7
records=102 (100 contracts)  getValue calls=28786  getFormattedValue calls=23845  per contract: 288 + 238
```

  For scale, the app's own data derivation `gridRows()` (`gridrows.bench.mjs`) takes 2.8 ms (90 lines × 150 payments), 6.7 ms (450 lines × 200 payments = 90,000 payments) and 20.2 ms (1,080 lines × 200 payments = 216,000 payments): the vendor parse costs several times more than computing the numbers it displays.
- Impact: 7–35 ms per fold click for a category of 100–600 records, up to about 110 ms at 1,900, before the DOM rebuild (CMP-02). Record counts of real projects are ESTIMATED (`gridRows.ts` header: "a few hundred accounts, a few hundred contracts").
- Status of prior art: `FE-C1-06` (deferred "until a profile shows a cost") — this is that profile for the parse half. Still open.
- Direction: cache the tree per dataset object (WeakMap; `applyStandardContractOptions` mutates the tree, so apply on a clone) and/or look up exact keys once. Medium complexity, medium risk (vendor port with parity tests).

### CMP-02 (P3, HIGH) — full row rebuild and two forced layouts per repaint

`render()` sets `tbody.innerHTML = ""` (`:197`) and rebuilds every visible row; `renderColGroup` runs at `:195` and again from `fitColumnsToScrollViewport` (`:256`, `:276-283`) after the rows are attached, reading `clientWidth` (layout #1) and rewriting col widths; `syncGrandTotalSpacer` (`:257`, `:309-330`) then reads `clientHeight` and `offsetHeight` of header, grand row and every body row (layout #2). Only expanded rows exist (the expanded set starts empty), which bounds it. DERIVED; no browser here, so size unknown. Same prior ID `FE-C1-06`.

### CMP-03 (P3, CONFIRMED) — global structural sharing walks every cached payload on each refetch

`app/queryStructuralSharing.ts:57-91`, installed in `Providers.tsx:32`. MEASURED (`structshare.bench.mjs`, synthetic, unchanged refetch):

```
app structuralSharingWithDates 300 contracts x 200 payments (60000 payment objs, dates=false) unchanged median 19.6 ms  min 18.0 max 20.2
tanstack replaceEqualDeep      300 contracts x 200 payments (60000 payment objs, dates=false) unchanged median 17.8 ms  min 17.2 max 19.7
app structuralSharingWithDates 500 contracts x 200 payments (100000 payment objs, dates=false) unchanged median 34.7 ms  min 32.1 max 40.1
tanstack replaceEqualDeep      500 contracts x 200 payments (100000 payment objs, dates=false) unchanged median 33.9 ms  min 32.1 max 37.1
app structuralSharingWithDates 1500 contracts x 10 payments (15000 payment objs, dates=false) unchanged median 8.8 ms  min 7.4 max 11.6
tanstack replaceEqualDeep      1500 contracts x 10 payments (15000 payment objs, dates=false) unchanged median 7.8 ms  min 6.6 max 9.9
```

(dates=true lines add about 1–2 ms; see `structshare.bench.out.txt`.) The app variant is about 10 % slower than stock TanStack, and D162 gained far more than this costs. Row exists to record the price; no action needed. Payment-array sizes ("579 on Wirmighausen, tens of thousands elsewhere", `costBook.ts:1088` comment) are the only evidence of real volumes.

### CMP-04 (P3, latent) — the global request gate is O(N²) in queued tasks

`data/concurrency.ts:281-309`: one array, `pump()` on every submit and completion scans from index 0 skipping writes while the write lane (24) is full, and `splice(i,1)`. MEASURED (`gate.bench.mjs`, synthetic, ceiling 40, lane 24, tasks completing on `setImmediate`):

```
gate n=   500 reads-mixed=false  submit-loop 6.3 ms  total 20.9 ms  (41.7 us/task incl. setImmediate)
gate n=  3500 reads-mixed=false  submit-loop 80.8 ms  total 228.3 ms  (65.2 us/task incl. setImmediate)
gate n= 15000 reads-mixed=false  submit-loop 1138.7 ms  total 3478.5 ms  (231.9 us/task incl. setImmediate)
gate n= 15000 reads-mixed=true  submit-loop 17.6 ms  total 1299.8 ms  (86.7 us/task incl. setImmediate)
```

The per-task cost grows with queue length. Not live: `GLOBAL_GATE = false` (`requestFlags.ts:26`) and all current callers cap their own fan-out (mapLimit 16, 500-row chunks). It matters only if D165's global gate is turned on and a caller ever enqueues thousands of tasks. Fix before switching it on (two queues, no splice).

### CMP-05 (P3, CONFIRMED) — the post-Save book patch allocates for untouched lines

`savedSheetPatch.ts:29-60`: `patchPayments` filters the line's payments and builds a Map for every line, then returns `null` when nothing changed. MEASURED (`savedsheetpatch.bench.mjs`, synthetic):

```
applySavedSheetToBook lines=500 payments/line=200 (100000 payments) changedCosts=0 deletedContracts=0   median 13.3 ms
applySavedSheetToBook lines=500 payments/line=200 (100000 payments) changedCosts=3487 deletedContracts=40 median 19.4 ms
applySavedSheetToBook lines=1500 payments/line=200 (300000 payments) changedCosts=3487 deletedContracts=40 median 61.9 ms
```

Early-return when `costs.length === 0 && deleted.size === 0` gives the same result with no allocation.

### CMP-06 / CMP-07 (P3, recorded) — Add Cost first edit and load

- CMP-06: the first edit after a load runs the cell rules over every row (`SpreadSheet.tsx` `handleChange` comment). RECORDED in D140: 141–155 ms, vs 21–28 ms median afterwards (Edge, production build, 26,600 cells). Not re-measured.
- CMP-07: load chain 18.1 + 44.8 + 15.3 + 12.4 = 90.6 ms at 15,000 rows (§4.1), plus the vendor's two `Model` builds, RECORDED at about 25 ms each per 190k cells (FE-C1-05). The `gridToJson` + `outputRowsToSheetRows` round trip (27.7 ms of the 90.6) is the CA identity safeguard (`Screen.tsx` comment at `roundTripped`): it is the product, not waste.

### CMP-08 (P3, SUSPECTED, cross-reference) — municipality combobox

`generalData.ts:274-312`, `general-data/hooks.ts:179-193`. Server query per typed character, up to about 2,000 rows, `top: 5000` sent next to `maxPageSize` (D160 §8 OPT-19: possibly truncated at 500, unresolved). Mostly a data/rendering item; recorded because it is an open PRIOR item. Needs the DEV check in D160 §8.

### CMP-09 (P3, CONFIRMED) — pooled `Intl` helpers key through `JSON.stringify`

`domain/locale.ts:123,169,189`. MEASURED (`intlpool.bench.mjs`, 200,000 calls each):

```
raw cached Intl.NumberFormat.format                              0.69 us/call
numberFormat(locale, opts).format  (pool lookup w/ JSON.stringify key) 1.85 us/call
canvasNumberText(value, locale, opts)                            2.69 us/call
raw cached Intl.DateTimeFormat.format                            1.35 us/call
dateFormat(locale, opts).format                                  5.57 us/call
a.localeCompare(b) (no locale)                                   0.31 us/call
shared Intl.Collator.compare                                     0.22 us/call
```

Nothing to do (a screen formats hundreds of values, not tens of thousands).

## 6. Checked and found NOT to be a bottleneck

| Candidate | Why not | Evidence |
|---|---|---|
| Add Cost "prepare before Save" (`validateSheet`, `diffRows`, `prepareSheetSave`, identity round trip) at 15,000 rows | 1.3–34 ms each, whole prepare 27 ms; indexed, linear | MEASURED §4.1; UT-ADDPERF-002/003 read counts |
| `sheetRowsToGrid`, `outputRowsToSheetRows`, `buildInitialSheet` | Map-grouped once; the comment at `adapter.ts:181` records the 4.4 million reads removed | MEASURED §4.1; code read |
| Add Cost per-keystroke path | D140: 21–28 ms median; column widths cached per text (`columnWidths.ts`); the cache is per call | RECORDED D140; code read |
| `gridRows()` (CAPEX rows, totals, month sums) | One pass per payment, ancestors add child aggregates; 2.8–20 ms for up to 216,000 payments | MEASURED `gridrows.bench.mjs` |
| `loadPayments`, `loadContractCostSums`, `loadCostLines`, `loadCostAccounts`, `loadCapexTotals` mapping | Map-based, one pass, one sort per contract's payments; payload volume is a network matter | code read (`costBook.ts:684-766, 927-1135, 1247-1349`) |
| Cached payments memory | About 128 bytes per payment object; 100,000 payments ≈ 12 MiB per cached book | MEASURED `payments-memory.bench.mjs`: 60,000 → 7.3 MiB, 100,000 → 12.2 MiB, 300,000 → 36.6 MiB |
| `loadAddCostSheetData` account grouping (`filter` per account) | ≤ ~100 accounts × ≤ ~300 sub-accounts, once per load | `data/addCostSheet.ts:122-132` |
| `savePlan.buildSavePlan` contract loop, `savePlan.ts:284` row scan | The scan is on the conflict (error) path only; comment says so | code read |
| `leaseWriteTiers` (Land Lease) | Single pass with Sets, linear | `landLeaseRules.ts:2725-2750` |
| OPEX `groupChains`, `lastPeriodByName`, `chainLastPeriod`, `costsInScope` | O(roots × costs) per card of ≤ ~40 rows; card values are `useMemo`'d; D160 measured 3,040 → 76 `localeCompare` calls on a 40-row card | code read; RECORDED D160 §11 |
| Contracts `buildAccountTree` / `applyUsage` / `applySelection` | Map-based, linear; one `localeCompare` sort of about 1,000 nodes (about 3 ms) | code read `contracts/rules.ts:498-600`; memoised in `contracts/hooks.ts:242` |
| Generators catalogue cascade (`projectCatalog`, `cascadeOptions`, `resolveModel`) | Linear filters over the catalogue per panel render; `projected` is `useMemo`'d; catalogue size unknown but not evidenced above a few thousand | `rulesCore.ts:418-500`, `Screen.tsx:205`, `panelModels.ts:232,268` (memoised) |
| Revenues hedge validation (`validateHedgedVolume`) | months (≤ ~300) × overlapping contracts (≤ ~10), once per Save click | `revenues/rules.ts:1139-1202` |
| Finance rules | Per-field validators on 1–6 tranches and ≤ ~30 schedule rows | function list read; `financePerf` is a network model |
| `domain/yieldStats.ts` | 81 lines | read |
| `domain/dates.ts` `formatDate` (`toLocaleDateString`, about 200 µs/call) | No production caller: the only hits are props named `formatDate` | grep for imports |
| Overview rows (`toProjectRow` × 200), filters, sort | Server-side filter, sort and paging (D41–D46) | `data/projects.ts` read |
| `JSON.stringify` uses | Keys and logs only; `stableJson` runs on header creates; `domain/form.ts` dirty checks run on small forms | grep + code read |
| Query log, request log, App Insights per-request work | A few µs per request (`new URL`, `randomUUID`, one regexp); `keyText` stringifies the key before the Production gate, immaterial | `queryLog.ts`, `requestLog.ts`, `appInsights/sanitize.ts` read |
| `Array.shift` / `splice` / `push(...spread)` sites | Bounded queues, 5,000-row pages (spread limit not reached), loop with ≤ tens of entries | grep list reviewed |
| CAPEX `Screen.tsx` per-render derivations (`buildStandardOptions`, `synthesiseClusterDates`, about 10 `find`/`filter` over ≤ ~1,000 elements) | ESTIMATED < 0.2 ms; the panel-keystroke render cost is a rendering question (FE-C1-07, deferred) | code read `Screen.tsx:404-430, 617-636, 726-824` |
| CAPEX Summary vs grid totals computed from different sources | Deliberate canvas parity (`costBook.ts` comment at `loadCapexTotals`), not duplicated computation | code read |

## 7. D140–D165 items that already fixed computation hot spots (verified in current source)

| Decision | What | State in current code |
|---|---|---|
| D51 §11.12 | `prepareSheetSave` indexed, `diffRows` by identity | live; bench 27 ms |
| D140 | react-spreadsheet context selector replaced (`platform/useContextSelector.ts`), row/column windowing, pinned column widths | live; 21–28 ms keystroke recorded |
| D141–D144 | Generators: targeted reloads, parallel chunks, trimmed reload, wider groups | live per `generatorsPerfFlags.ts` (network, not CMP) |
| D145, D146, D149 | Production, Revenues and Finance write groups 16 wide; Revenues volume row memo | live (network) |
| D150, D156 | Check List reads in parallel, reference reads kept | live (network) |
| D160 B2/B3 | Cost read path waves, Land Lease and OPEX tiered writes | live (`LEASE_WRITE_PARALLEL`, `OPEX_IMPORT_PARALLEL` true) |
| D160 B4 (OPT-25, 26, 28) | `PcfGrid` repaint only on explicit deps and value comparison; OPEX/Land Lease cards memoised, warnings once per card; validation once per render; `closingSplit` | live; `PcfGrid.tsx:60-125` read |
| D160 B7 (OPT-27) | Admin gates `buildTaskIndex`, contracts grouping, CAPEX hierarchy | not re-read (admin) |
| D160 OPT-29, 31, 32, 33 | `Intl` pools, `dateOnly`/`localDayOf`, row-value coercers, `roundDown/Up` | live; costs re-measured in CMP-09 |
| D162 FE-SH-01 / D-1 | `structuralSharing` with Dates | live; cost measured in CMP-03 |
| D162 FE-C1-01 / D-2 | `fast-formula-parser` stubbed | live (bundle) |
| D162 FE-C1-02/04, CA-31 | Add Cost memo keyed on `hasProject`; first grid report not read back | live; `Screen.tsx:163-181, 262-285` read |
| D165 | Retry layer, global gate (OFF) | gate is dormant: CMP-04 |

Open and still true (deferred by those programmes): FE-C1-05, FE-C1-06, FE-C1-07, FE-C1-10, FE-P1-02b, OPT-19 / DEC-6, OPT-33 (d)(e)(f)(g).

## 8. Limitations

- No browser, no live Dataverse, no `pac`: DOM cost (CMP-02), React render cost, real record counts and real payload sizes could not be measured. All timings are Node on this machine with synthetic data; use them for ratios and scaling shape, not absolute budgets.
- The `checklistVisit` and `financePerf` benchmarks model round trips; neither yields a CPU number.
- The static scan is a heuristic (6-line window); a nested lookup written across more lines or through a helper would be missed. I did not read the bodies of the PM and admin `rules.ts` files listed in §2.
- Real data volumes (catalogue size, standard-assumption rows, payments per contract) are taken from repo documents, not from the environment.
- The register has 17 columns, as the header line in the brief names them (the brief's text says 15/16).

## 9. Files written

- `ProjectDocs/bottleneck-identification/05-business-logic-and-computation-bottlenecks.md` (this file)
- `ProjectDocs/bottleneck-identification/_register/CMP.md`
- `ProjectDocs/bottleneck-identification/_bench/CMP/`: `scan-nested.mjs` / `.out.txt`, `datasetparse.bench.mjs` / `.out.txt`, `datasetparse.count.mjs` / `.out.txt`, `gridrows.bench.mjs` / `.out.txt` (+ `gridRows.bundle.mjs`), `structshare.bench.mjs` / `.out.txt`, `gate.bench.mjs` / `.out.txt`, `savedsheetpatch.bench.mjs` / `.out.txt` (+ `savedSheetPatch.bundle.mjs`), `intlpool.bench.mjs` / `.out.txt`, `payments-memory.bench.mjs` / `.out.txt`, `prepare.bench.out.txt`, `financePerf.bench.out.txt`, `checklistVisit.bench.out.txt`, `checklistVisit.S6.out.txt`.

Re-run any `*.bench.mjs` with `node <file>` from `_bench/CMP/` (`payments-memory` needs `--expose-gc`).
