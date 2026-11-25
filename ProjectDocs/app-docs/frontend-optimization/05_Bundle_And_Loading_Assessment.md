# 05 — Bundle and loading assessment

Stage 1, 25 Nov 2026. Optimisation area 6. **Every number here is measured**, from these sources:
- `vite build` of `ed4354e` (2,979 modules, 4.8 s);
- byte attribution from the source-map mappings: minified bytes per package, not source size;
- `gzip -9` of each file;
- three scratch builds with modified configs and a stub, kept in the session scratchpad and never in the repo.

"Startup" means the entry script plus every `modulepreload` in `dist/index.html`. That is what the browser fetches
before any screen chunk.

## 1. Baseline composition

**Startup: 1,352 kB minified / 383 kB gzip**, in 10 files:

| File | Min kB | Gzip kB | Main content (minified bytes) |
|---|---|---|---|
| `index` | 492 | 156 | react-dom 171, react-router 92, query-core 30, LeftNav 20, AppHeader 15, plus about 35–40 kB of barrel components the shell never renders (FE-SH-04) |
| `fluent` (manual chunk) | 760 | 199 | react-calendar-compat 70, tabster 70, combobox 53, tokens 50, menu 29, tabs 29, react-icons 28, button 28, avatar 22, toast 20, tags 18 … |
| `requestLog` | 70 | 16 | `@microsoft/power-apps` SDK, the `.power` schemas, request log, errors |
| 7 small data chunks | 30 | 12 | `odata`, `keys`, `client`, `powerFxNumeric`, `dates`, `projectStateLookup`, runtime |

Already right, so no change:
- every screen is `React.lazy`;
- App Insights (199 kB) is a dynamic import;
- Azure Maps (1.7 MB + 114 kB CSS) is in a lazy chunk that only General Data imports;
- the Generators panels are lazy (D143);
- react-router in the bundle is the production build (byte-identical to its `production` dist);
- the only image is a 3.9 kB inlined logo;
- there are no web fonts to load.

**Largest lazy chunks:**

| Chunk | Min kB | Gzip kB | Note |
|---|---|---|---|
| ProjectMap (General Data) | 1,698 | 443 | azure-maps-control; FE-P1-01 is about *when* it loads |
| Add Cost from Table screen | 360 | 105 | **278 kB of it is react-spreadsheet's formula engine** (chevrotain 110, fast-formula-parser 101, jstat 50, regexp-to-ast 11, bessel 5); FE-C1-01 |
| Finance screen | 135 | 34 | statically pulls `revenues` (51 kB) and `generators` (22 kB); FE-P2-05 |
| `useCostWriteFlight` (shared Cost) | 95 | 30 | really the `useCostBook.ts` + `costRepository` facade graph; FE-C2-08 |

## 2. Findings

| ID | Pri | Where | Issue | Recommendation | Measured / expected effect | Cx/R | Conf |
|---|---|---|---|---|---|---|---|
| **FE-C1-01** | P1 | react-spreadsheet `dist/es/index.js:3`, `:1108`, `:1435`; `vite.config.ts` aliases | The sheet never evaluates formulas: month cells are forced to whole numbers (`SpreadSheet.tsx:87`), and read-back, Save and Copy Table read raw `cell.value`. Nothing in `src` uses evaluated data. But react-spreadsheet imports `fast-formula-parser` statically, builds a `DepParser` at module load, and **builds a new `FormulaParser` on every cell commit**: about 3 ms warm, 7 ms on the first commit. | Alias `fast-formula-parser` to a small stub in `src/platform/` (`FormulaParser.parse(f)` returns the text as typed; `DepParser.parse` returns `[]`). This is the same mechanism as the D140 `use-context-selector` alias. Add a test that a typed `=x` shows as typed. Record as a **DIVERGENCE**: today a text cell beginning with "=" displays its evaluated value (e.g. `#NAME?`) while the raw text is what is saved; with the stub it displays what is saved. | **Measured: the Add Cost chunk goes from 360 kB to 69 kB minified (105 kB to 23 kB gzip).** About 3 ms less per cell commit; one parser construction less per `Model` build. | L/L-M | C (scratch build) |
| **FE-SH-04** | P1 | `components/index.ts` barrel; `App.tsx:43`, `app/Providers.tsx:201`, `app/routes.tsx:16` | Barrel modules call `makeStyles(...)` at top level, which the bundler must treat as a side effect. So every barrel member lands in `index`: CountryTechnologyPicker 8.8 kB, PeoplePicker 6.5, InformationPopUp 3.7, ReorderItems 2.8, CountryFlag 2.7, `domain/countryPicker` 2.7, StatusPill 2.1 … | `build.rollupOptions.treeshake.moduleSideEffects`: `false` for `src/components/` and `src/domain/`. Griffel's `makeStyles` inserts nothing at module load. Gate it with the full test suite and a build check that every screen still renders (styles are created lazily on first use). | Measured together with FE-C1-01 (build A): **startup 1,352 → 1,289 kB min (383 → 364 kB gzip)**. | L/L-M | C (scratch build) |
| **FE-SH-05** | P1 | `vite.config.ts:52-55` | `manualChunks` puts **every** `@fluentui` and `@griffel` module used anywhere into one 760 kB chunk, preloaded at startup. Fluent parts used only by some screens (calendar/date picker, tabs, tags, accordion, radio, checkbox …) are therefore downloaded and parsed before the first paint. | Limit the manual chunk to the packages the shell and landing screens need (provider, tokens, griffel, tabster, utilities, positioning, button, menu, tooltip, dialog, drawer, toast, field, input, combobox/dropdown, table, avatar, badge, icons …). Let the bundler split the rest into shared lazy chunks. Requires FE-SH-04, otherwise the barrel pulls the calendar back in. The exact core list is decided in Stage 3 by build inspection. | Measured (build B, A + core-only Fluent): **startup 1,132 kB min / 326 kB gzip, i.e. −220 kB min / −56 kB gzip (−16 %)** against the baseline. The `fluent` chunk drops to 603 kB, and `index` to 442 kB. | M/M | C (scratch build) |
| FE-P1-01 | P2 | `general-data/Screen.tsx:80`, `:620-621`, `:983-989`; `ProjectMap.tsx:90` | The lazy `ProjectMap` is rendered only after the screen's early return for its 3 reads. So screen chunk, reads, **then** the 1.7 MB map chunk, Map init, the token flow and tiles all run in sequence, although the map always shows on General Data. | A named loader (`loadProjectMap`), called from a mount effect at the top of `GeneralDataScreen` before the early return, or from `bootPrefetch` for `/project/general`. Optionally warm `azureMapsToken()` in the same effect (it is cached and deduplicated). | The map chunk and token load in parallel with the reads on the first General Data visit of a tab; saves roughly the reads' duration (hundreds of ms to over 1 s). | L/L | C (path) |
| FE-P2-05 | P2 | `finance/rules.ts:78-81`; `data/finance.ts:32-41` | The Finance chunk statically imports `revenues` (50.5 kB) for `assumptionNumber`, `pageLock`/`isPageLocked`, `PROJECT_COL`/`PROJECT_SELECT`/`toRevenueProject`, and `generators` (21.6 kB) for a lazy turbine count. | Move those helpers into a shared PM module, re-exported from Revenues (rule 17: moved, not copied); `import()` the generators read. | About 50 (+22) kB less on a cold first Finance visit. | M/L | C (build graph) |
| FE-P2-06 | P2 | `data/production.ts:35`, `:351`; `data/landLease.ts:341-355` | The Production chunk statically imports `landLease` (44 kB) for one 15-line read, `loadCountryInflation`. | Move `loadCountryInflation` into its own small data module, re-exported from `landLease.ts`. | About 44 kB less on a cold Production visit. | L/L | C (build graph) |
| FE-AD-07 | P2 | `admin-contract/hooks.ts:13` | Admin Contracts imports `listCapexAccounts` from `data/contracts` (29 kB chunk with the Cost contracts rules and 4 services) for `loadCapexChartRows().map(toAccountRow)`. | Move the active-only CAPEX account read next to `data/capexChart.ts`; import it from both places. | One fewer 29 kB chunk for an admin who has not opened Cost Contracts. | L/L | C (source map) |
| FE-C2-08 | P3 | `data/costRepository.ts:19-58`; `costing/useCostBook.ts:17-29`; `contracts/hooks.ts:16` | The `costRepository` facade statically imports every Cost read and write module, so the shared chunk carries OPEX rules, period writes, CAPEX writes, `addCostSheet`, `savePlan`… for every Cost screen, and chains `landLease` and `contracts`. Also found as FE-C1-08. | Screens and hooks import the specific data module, or the facade methods use `await import()`. Weigh against the facade's "one implementation" role (rule 17) first. | About 35–55 kB gzip less on a cold deep link to Contracts, OPEX or Land Lease; nothing after CAPEX has loaded. | M/M | C (chunk graph) |
| FE-AD-08 | P3 (optional) | `app/routes.tsx:50-55`, `app/screenLoaders.ts` | The admin screens bypass `screenLoaders`. The cost is small: `/admin` has no session gate, so the chunk starts at the first render. | For consistency, move the 6 loaders into `screenLoaders.ts`. Optionally idle-prefetch the sibling admin chunks (about 245 kB in total). | One chunk round trip saved per further admin screen. | L/L | P |
| — | Note | `vite.config.ts` `sourcemap: true` | Source maps ship in `dist` (about 9.5 MB for `fluent` alone). Browsers fetch them only with DevTools open, so there is no runtime cost. This is a packaging and exposure question, not performance. | No change proposed. Recorded for the owner. | — | — | C |

## 3. Recommended loading architecture

1. **Critical path:** `index` (React, router, query client, shell) plus a **core** Fluent chunk plus the SDK chunk. No
   screen-only components or Fluent packages.
2. **Screen chunks:** as today. Each screen avoids static imports of other screens' rules and data modules (FE-P2-05,
   FE-P2-06, FE-AD-07, FE-C2-08).
3. **Heavy optional assets** start as soon as the screen that always needs them mounts, not after its data arrives
   (FE-P1-01).
4. **Vendor code the app never executes** is aliased out (FE-C1-01, following D140).
5. **Prefetch** stays with `bootPrefetch` and `screenLoaders` (D119, OPT-03). No new prefetch mechanism.

## 4. Gate for Stage 3

Add a small script that prints the startup bytes from `dist/index.html` and the size of each named chunk, so batches
B1 and B2 can show before and after numbers in `09`. It lives in `scripts/` and is not part of `verify`.
