# 01 - Application architecture analysis (bottleneck identification, Stage 1)

Agent: Architecture + Bundle/Initialization audit (register prefix `BND`, file `_register/BND.md`).
Worktree `Project-Management-Energy-WorkDev1-BottleneckOptimization`, branch `feature/bottleneck-identification-optimization`, base `dde9e92`.
Read-only audit: nothing under `ProjectCosts-CodeApp/` was edited. Companion document: `09-bundle-and-initialization-bottlenecks.md`
(bundle and start-up measurements, the commands to reproduce them, and the D162 status table).

Evidence labels used below: **MEASURED** (I ran something; the command is in doc 09 section 2 or named inline), **DERIVED** (counted from
code), **ESTIMATED** (reasoning only). Findings carry their register id (`BND-nn`) and one of CONFIRMED / HIGH / SUSPECTED.

## 1. Scope inspected, and what was not

Read in full or in the relevant part:

| Area | Files read |
|---|---|
| Entry and shell | `index.html`, `src/main.tsx`, `src/App.tsx`, `src/app/Providers.tsx`, `src/app/SessionContext.tsx`, `src/app/routes.tsx`, `src/app/screenLoaders.ts`, `src/app/startupFlags.ts`, `src/app/bootPrefetch.ts`, `src/app/bootPlan.ts`, `src/app/pmScreenPrefetch.ts`, `src/app/generatorsWarmup.ts`, `src/app/queryLog.ts`, `src/app/useCurrentUser.ts` |
| Platform | `platform/powerClient.ts`, `consoleGate.ts`, `requestLog.ts` (hot path), `azureMapsToken.ts`, `renderProbe.ts`, `e2eHook.ts`, `globalErrors.ts` (heads) |
| Data layer (structure only) | `data/client.ts` (head and exports), `data/requestPolicy.ts` (head), `data/project.ts` (`loadProject`, `loadEnvironmentVariables`), `data/currentUser.ts` (`loadCurrentUser`), `data/projectStateLookup.ts`, `data/persistedReference.ts` (head), `data/bootDvoptFlags.ts`, `data/requestFlags.ts`, `data/generatorsPerfFlags.ts` (flags), import lines of the data modules named in the register |
| Telemetry | `appInsights/appInsights.ts` |
| Shared UI | import lines and `makeStyles` counts of `src/components`, `AppShell`/`AppHeader`/`LeftNav` (`memo`, `useLocation`), `FormPanel`, `ReportProblemPanel` |
| Build | `vite.config.ts`, `package.json`, `tsconfig.app.json`, `power.config.json` (head), `scripts/bundle-report.mjs`, the production build in `dist/` and its source maps, and a second build of the same commit into a scratch folder |
| Prior art | `ProjectDocs/app-docs/frontend-optimization/` (01, 05, 06, 08, 09), `ProjectDocs/app-docs/dataverse-network-performance-optimization/` (03 boot section, 12 register lines, 13 baseline lines), D119 in `02-OPEN-DECISIONS.md` |

Not read (and so not judged): the bodies of the 22 `Screen.tsx` files and their hooks beyond the import and lazy-loading structure,
`src/data/*` write paths, `features/**/rules.ts` bodies, `src/test`, `e2e/`, `src/generated/` and `.power/` (pac output: only their
size and their place in the bundle were measured). Rendering, memory and Dataverse behaviour of individual screens belong to the other
audit agents; where my evidence touches them I say so.

Throwaway scripts used for measurement live in `ProjectDocs/bottleneck-identification/_bench/BND/` (`closure.mjs`, `list-closure.mjs`,
`who-has.mjs`, `map-bytes.mjs`, `all-bytes.mjs`, `chunk-contents.mjs`, `route-table.mjs`, `dups.mjs`, `rebuild-diff.mjs`, `parse-time.mjs`,
`shorturl-bench.mjs`) and their saved outputs (`closure.out.txt`, `route-table.out.md`).

## 2. Stack

| Layer | Library (installed version) | Notes |
|---|---|---|
| UI | React 19.2.8, `@fluentui/react-components` 9.74.7 (Griffel 1.7.7, tabster 8.8.1), `@fluentui/react-icons` 2.0.339, `@fluentui/react-datepicker-compat` 0.6.37 | Fluent is 14.6 % of all shipped JS output (714,666 of 4,907,249 chars, MEASURED by `all-bytes.mjs`) |
| Routing | `react-router(-dom)` 7.18.3, **hash data router** (`createHashRouter`) | needed for `useBlocker` and for host URLs that cannot rewrite paths (`Providers.tsx:66-76`) |
| Server state | `@tanstack/react-query` 5.102.8 | the only state library; screen state is `useState` per screen |
| Host SDK | `@microsoft/power-apps` 1.3.1 | in the `requestLog` chunk with the generated `dataSourcesInfo` registry |
| Telemetry | `@microsoft/applicationinsights-web` 3.4.5 | dynamic import, only when the connection string is set |
| Maps | `azure-maps-control` 3.7.4 | 33.6 % of all shipped JS output, in one lazy chunk used by General Data only |
| Grid | `react-spreadsheet` 0.9.5 | Add Cost from Table only; two aliases (`use-context-selector`, `fast-formula-parser`) replace parts of it |
| Build | Vite 8.2.2 (rolldown), `@vitejs/plugin-react` 6.1, TypeScript 6 (target ES2023) | Vitest 5 for tests |

Counts (DERIVED, non-test source): `useQuery(` 139, `queryOptions(` 39, `useMutation(` 33, `fetchQuery(` 58, `prefetchQuery(` 41,
`useEffect(` 46, `useMemo(` 171, `memo(` 36, `lazy(` 23, dynamic `import(` 51, `makeStyles(` 84.

## 3. Entry points and boot sequence

```
index.html  (empty #root; one <script type=module>, 7 modulepreload, 1 stylesheet)
  -> assets/index-*.js            (entry: main.tsx + react-dom + react-router + query-core + shell + data client)
       static deps (all modulepreloaded): rolldown-runtime, fluent, preload-helper, requestLog(SDK), odata, keys, tokens
main.tsx
  1-8   static imports: react, react-dom/client, App, Providers+queryClient, startBootPrefetch, 2 css files, globalErrors
  11    installGlobalErrorLog()                       -- 2 window listeners
  15    void startBootPrefetch(queryClient, {hash, search})   -- D119/OPT-03; not awaited
  20-27 createRoot(...).render(<StrictMode><Providers><App/></Providers></StrictMode>)
```

`startBootPrefetch` (`app/bootPrefetch.ts:131-157`): `ensureInitialized()` (SDK `setConfig` + `getContext()`), prefetches the session
query, and, only when the hash is empty (the normal launch from the player), awaits the host context for launch parameters before it
decides the target. It then preloads the target screen's chunk and starts its first reads (`prefetchTarget`): project list page +
countries + states; General Data row + lists; Generators ten reads; PM-screen reads (`pmScreenPrefetch.ts`); Cost: session project only.

Observations (all DERIVED unless noted):

1. ES modules evaluate only after their whole static graph has been fetched, so `main.tsx:15` runs after the 8 startup files
   (1,030.1 KiB min / 302.0 KiB gz, MEASURED) have downloaded and evaluated. The boot prefetch is "before React" but not "before the JS
   graph": **BND-01**.
2. `index.html:9` is an empty `<div id="root">`; the first thing on screen is React's "Please wait..." overlay (`App.tsx:75`): **BND-09**.
3. The environment-variable reads (`SessionContext.tsx:84`, `data/project.ts:76`) are not part of the boot prefetch: they start at the
   first render, and are two sequential reads while `ENV_VARS_TOGETHER` is OFF (`bootDvoptFlags.ts:34`): **BND-12** (PRIOR:PB-08).
4. Telemetry is a dynamic import started from an effect the moment the env vars land (`SessionContext.tsx:87-94`,
   `appInsights.ts:217`): **BND-14**.

## 4. Provider tree and shell

```
FluentProvider(vsbTheme)                      Providers.tsx:75
 QueryClientProvider(queryClient)             defaults: staleTime 30 s, refetchOnWindowFocus true, retry<2 if retryable,
  RouterProvider(createHashRouter)            one splat route "*"
   ErrorBoundary                              (errorElement = RouteError -> ErrorBoundary)
    SessionProvider                           3 queries: session (Infinity), env vars (15 min), session project (5 min)
     App                                      useSession, useLocation, useCurrentUser (query "current-user")
      AppShell(AppHeader, LeftNav, CommandSlot, <main>)
       ROUTES = <AppRoutes/> (one element for the session, FE-SH-02) + <ReportProblemPanel/>
  AppToaster
```

- `SessionProvider` reads `useLocation()` but renders `{children}` (a stable element), so a location change re-runs its hooks and its
  memoised value, not the tree below it. The value is memoised on data, not on `location.search`.
- `App` and `LeftNav` read `useLocation()`; `App`, `AppShell`, `AppHeader`, `LeftNav` are **not** `memo`. Every location change (including
  the query string the Project Overview writes per keystroke) re-renders the shell: **BND-15** (SUSPECTED, unprofiled).
- `App` statically imports `ReportProblemPanel` (closed until Help is used), which pulls `FormPanel` -> Fluent Drawer/TextArea and the
  `ConfirmDialog`/`Fields`/`CanvasFields` chain into the entry: **BND-10**.
- Four contexts exist (D162 doc 01): `SessionContext` (26 consumer modules), `CommandSlot` (1), `FormPanelContext`, and the D140
  `useContextSelector` replacement for react-spreadsheet. No global store.

## 5. Routing and lazy-loading structure

`app/routes.tsx`: every screen is `React.lazy`. 16 Cost/PM loaders are named functions in `app/screenLoaders.ts` (shared with the boot
prefetch and the Generators warm-up); the six admin screens use inline `lazy(() => import(...))` (`routes.tsx:51-56`): **BND-17**
(PRIOR:FE-AD-08). `CostProjectGate` and `ProjectScreenGate` (`routes.tsx:81-148`) hold the screens until the session project has loaded.
`/costs/add-from-table` renders `<CapexCostsScreen/>` and `<AddCostsFromTableScreen/>` together (so its cold cost is the union).

### 5.1 Route inventory (MEASURED sizes from `dist/`, units KiB = 1024 bytes)

Cold total = the 8 startup files (1,030.1 min / 302.0 gz) + the lazy files Vite preloads or statically imports for that route
(`_bench/BND/route-table.mjs`, `route-table.out.md`). `LOC` is non-test lines of the feature folder (`Screen.tsx` in brackets).

| Route | Module (`src/features/...`) | LOC [Screen.tsx] | Lazy entry | Entry KiB min | Lazy files | Lazy KiB min / gz | Cold total KiB min / gz |
|---|---|---|---|---|---|---|---|
| `/projects` (landing) | `pm/project-main` | 3,251 [1,720] | Screen-BgDMkne6 | 59.3 | 26 | 159.6 / 55.6 | 1,189.7 / 357.6 |
| `/project/general` | `pm/general-data` | 4,380 [1,294] | Screen-DuQPl2yM | 36.2 | 50 | 374.4 / 118.0 | 1,404.5 / 420.0 (+ ProjectMap 1,701 / 443) |
| `/project/milestones` | `pm/milestones` | 2,766 [769] | Screen-m5F1Lqbr | 18.6 | 45 | 414.4 / 128.1 | 1,444.5 / 430.1 |
| `/project/generators` | `pm/generators` | 11,231 [1,592] | Screen-B-1GCA0X | 76.4 | 40 | 356.6 / 113.2 | 1,386.7 / 415.2 |
| `/project/production` | `pm/production` | 3,236 [852] | Screen-CRiFdCfH | 71.0 | 36 | 271.6 / 83.8 | 1,301.7 / 385.8 |
| `/project/checklist` | `pm/checklist` | 5,656 [1,285] | Screen-Ok0eTbgG | 53.9 | 28 | 288.4 / 88.1 | 1,318.5 / 390.2 |
| `/project/team` | `pm/team` | 1,231 [482] | Screen-D5Qd_ZEW | 13.9 | 22 | 97.2 / 37.4 | 1,127.3 / 339.4 |
| `/project/planning` | `pm/planning` | 2,836 [1,042] | Screen-Dn2K28V6 | 33.6 | 30 | 315.3 / 94.1 | 1,345.4 / 396.2 |
| `/project/grid-operator` | `pm/grid-operator` | 1,345 [430] | Screen-Dfbh8eqR | 13.3 | 16 | 169.1 / 52.1 | 1,199.2 / 354.1 |
| `/project/revenues` | `pm/revenues` | 5,288 [1,673] | Screen-QXbxUotO | 42.2 | 44 | 467.6 / 140.7 | 1,497.7 / 442.8 |
| `/project/finance` | `pm/finance` | 6,786 [2,191] | Screen-DpubSrou | 135.8 | 33 | 362.2 / 107.6 | 1,392.3 / 409.7 |
| `/costs/capex` | `cost/capex-costs` (+ `costing`) | 8,849 [1,408] | Screen-ni7tS4J9 | 86.4 | 43 | 441.7 / 138.6 | 1,471.8 / 440.6 |
| `/costs/contracts` | `cost/contracts` | 4,381 [2,038] | Screen-afgntddX | 30.9 | 38 | 383.9 / 119.1 | 1,414.0 / 421.1 |
| `/costs/opex/om`, `/costs/opex/other` | `cost/opex-costs` -> `cost/periods` | 23 + 11,425 shared | Screen-CkMzW0UK | 35.7 | 46 | 459.7 / 142.6 | 1,489.8 / 444.7 |
| `/costs/land-lease` | `cost/land-lease` -> `cost/periods` | 20 + shared | Screen-fxvg--mG | 34.4 | 46 | 458.4 / 142.0 | 1,488.4 / 444.0 |
| `/costs/add-from-table` | `cost/add-costs-from-table` over CAPEX | 3,746 [574] | Screen-DjBqOuyo + CAPEX | 154.1 | 44 | 509.5 / 160.7 | 1,539.6 / 462.8 |
| `/admin/default-checklists` | `admin/admin-default-checklists` | 1,963 [616] | Screen-8Bf0Dqoc | 27.2 | 39 | 210.8 / 74.7 | 1,240.9 / 376.7 |
| `/admin/gates-approvals` | `admin/admin-gates-approvals` | 2,832 [478] | Screen-Dgwg0-Cx | 39.3 | 39 | 202.3 / 70.3 | 1,232.4 / 372.3 |
| `/admin/capex-accounts` | `admin/admin-capex-accounts` | 2,084 [631] | Screen-MdqRc4Pr | 37.8 | 30 | 143.6 / 52.6 | 1,173.7 / 354.7 |
| `/admin/milestones` | `admin/admin-milestones` | 1,483 [308] | Screen-D5QLiMEH | 22.5 | 23 | 78.8 / 31.3 | 1,108.9 / 333.3 |
| `/admin/cost` | `admin/admin-cost` | 3,910 [545] | Screen-D-tfb6nZ | 75.1 | 37 | 188.0 / 64.5 | 1,218.1 / 366.6 |
| `/admin/contract` | `admin/admin-contract` | 2,490 [571] | Screen-BCiAxgJ7 | 74.4 | 28 | 149.0 / 49.5 | 1,179.1 / 351.5 |

Redirect-only routes (`/`, `/projects/new`, `/projects/:projectId/general`, `/costs` index, `/admin` index, `*`) load nothing of their own.
"PM App Loading Screen" is not ported (its job is `SessionContext` plus `Landing`).

The landing screen is the cheapest of the heavy-data screens (357.6 KiB gz cold); the three heaviest cold visits are Add Cost from Table,
OPEX/Land Lease and Revenues (443-463 KiB gz). Part of that weight is coupling, not screen code: BND-03, BND-04, BND-06, BND-07, BND-08.

### 5.2 Feature map and layer sizes (non-test lines, DERIVED)

| Layer | Files | Lines | Role |
|---|---|---|---|
| `src/app` | 17 | 1,824 | routes, session, boot plan/prefetch, deep links, query logging |
| `src/components` | 56 | 7,299 | shared UI kit (barrel `index.ts`; 36 of the 84 `makeStyles` calls) |
| `src/data` | 89 | 26,315 | repository/data layer: reads, write plans, bulk, flags, keys (largest: `addCostSheet.ts` 1,562, `costBook.ts` 1,349) |
| `src/domain` | 22 | 2,568 | pure helpers (dates, Power Fx numeric helpers, session, locale) |
| `src/platform` | 13 | 1,677 | SDK client, errors, console gate, request log, privileges, shims for two npm aliases |
| `src/appInsights` | 5 | 575 | telemetry (lazy SDK) |
| `src/features/admin` (6) | - | 14,762 | Application Settings screens |
| `src/features/cost` (7 folders) | - | about 30,700 | CAPEX, Contracts, OPEX, Land Lease (two 20-line wrappers over `periods` 11,425), Add Cost, `costing` shared |
| `src/features/pm` (12 folders) | - | about 48,000 | ten PM screens, Overview, `shared` |
| `src/generated` | 194 | 14,284 | pac output (96 services, 97 models): not audited |
| `src/styles` | 2 | 862 | `canvas.css` (72.6 kB source, 31.9 kB min / 6.2 kB gz, render-blocking) and `global.css` |

## 6. State management

- **Server state**: TanStack Query with one `QueryClient` (`Providers.tsx:21-38`). `structuralSharing` is the Date-aware function
  (D162 FE-SH-01), `retry` skips non-retryable errors, `retryDelay` is jittered (dvopt T-10), `staleTime` is 30 s default,
  `refetchOnWindowFocus: true` default (only some hooks opt out): **BND-02** (PRIOR:OPT-18, held by DEC-3).
- **Keys**: `data/keys.ts` is a key factory; `qk.projectPm(id)` is a child of `qk.project(id)` so a save invalidates both scopes.
- **Query logging**: `attachQueryLog` subscribes to the query and mutation caches (every cache event), opening/closing an ACTION line;
  O(1) per event with two Maps (`queryLog.ts:62-104`); not a bottleneck (section 12).
- **Local state**: `useState` per `Screen.tsx` (CAPEX about 30 setters, Contracts about 17); the render side is covered by the D162
  rendering audit and the other agents.
- **Persisted state**: only the Generators catalogue cache (IndexedDB, `GENERATORS_PERF.persistCatalogue` OFF) and the Azure Maps SAS token
  (`localStorage`). Nothing is read from IndexedDB at start-up.

## 7. Data layer (structure, no write-path audit)

Every read goes through `data/client.ts` (`fetchAll`, `fetchPage`, `countedPage`), every write through `executePlan`/`runPlan`/bulk modules,
with `requestPolicy.ts` (retry/backoff/deadline/gate, mostly switched by `requestFlags.ts`). The generated services and
`.power/schemas/appschemas/dataSourcesInfo.ts` (24 kB source, 93 data sources; 14.4 k output chars) are in the SDK chunk loaded at start-up
because `client.ts` imports the registry.

Switches that shape start-up and bundle (CONVENTIONS rule 15: live product decisions, not dead code), current values in the source:

| Switch | File:line | Value | Effect |
|---|---|---|---|
| `startupFlags.envVarsBlockFirstPaint` | `app/startupFlags.ts:17` | false | env vars do not hold first paint (D119 S1) |
| `startupFlags.bootPrefetch` | `:26` | true | boot prefetch active |
| `startupFlags.parallelUserLookups` | `:42` | true | user chain 3 deep |
| `startupFlags.nextPagePrefetchDelayMs` | `:33` | 1500 | next Overview page after 1.5 s |
| `BOOT_PREFETCH_SCREEN_READS` (PB-03) | `data/bootDvoptFlags.ts:30` | true | PM screen reads at boot |
| `COUNTRIES_ONE_KEY` (PB-06) | `:31` | true | one countries entry |
| `ENV_VARS_TOGETHER` (PB-08) | `:34` | **false** | env vars stay 2 sequential reads (QA-09). The doc comment at `:18-20` still says "default ON" (stale) |
| `PM_PROJECT_ROW_SHARED` (PB-10) | `:35` | true | |
| `GENERATORS_WARMUP_LAZY` (PB-09) | `:37` | **false** | the 1.5 s Generators warm-up runs on every PM screen |
| `GENERATORS_PERF.prefetch` / `persistCatalogue` | `data/generatorsPerfFlags.ts:116,120` | true / false | |
| `REQUEST_DEADLINES`, `GLOBAL_GATE` | `data/requestFlags.ts:20,26` | false / false | |
| `PROJECT PM row-only load` | `data/project.ts` (`projectLoadSwitch.pmRowOnly`) | on | PM routes read the row only |

## 8. Third-party weight (MEASURED, all chunks, `_bench/BND/all-bytes.mjs`, output characters by source package)

| Package / area | Output chars | Share of 4,907,249 | Where |
|---|---|---|---|
| `azure-maps-control` | 1,648,906 | 33.6 % | ProjectMap chunk (lazy, General Data) |
| `src/features/pm` | 771,193 | 15.7 % | screen chunks |
| Fluent family (`@fluentui/*`, `@griffel/*`, `tabster`, `keyborg`) | 714,666 | 14.6 % | 499 KiB in the startup `fluent` chunk; the rest splits with screens (DatePicker/calendar 77, Tab 29, Table, Switch, Radio, Checkbox ...) |
| `src/features/cost` | 344,216 | 7.0 % | |
| `src/features/admin` | 201,941 | 4.1 % | |
| `react-dom` | 178,298 | 3.6 % | entry |
| Application Insights packages (incl. `@nevware21/ts-utils`) | about 188,000 | about 3.8 % | lazy chunk |
| `react-router` | 94,456 | 1.9 % | entry (21 % of the entry chunk) |
| `src/generated` + `.power` | 74,203 | 1.5 % | many tiny service chunks plus the registry in the SDK chunk |
| `@microsoft/power-apps` | 51,683 | 1.1 % | startup |
| `react-spreadsheet` | 39,721 | 0.8 % | Add Cost only; formula engine absent (stub) |
| `@tanstack/query-core` | 35,099 | 0.7 % | entry |

Startup `fluent` chunk by output (source-map attribution): tabster 14.0 %, react-combobox 10.6 %, tokens 10.0 %, react-menu 5.8 %,
react-icons 5.6 %, react-button 5.6 %, react-toast 4.1 %, react-drawer 3.4 %, react-positioning 3.4 %, griffel/core 3.2 %, react-dialog 3.0 %.
Startup `index`: react-dom 39.4 %, react-router 21.3 %, query-core 7.0 %, LeftNav 4.7 %, AppHeader 3.4 %, ConfirmDialog 1.5 %,
CanvasFields 1.5 %, routes 1.4 %.

No package appears under two install paths and no source file appears in two chunks (MEASURED, `dups.mjs`: 1,412 sources, 76 packages, 0
duplicates). Code is not duplicated across chunks; it is, however, **over-shared** (section 10).

## 9. Build configuration (`vite.config.ts`)

- `base: "./"`, `build.outDir: dist`, `build.sourcemap: true` (26.1 MB of maps in `dist` next to 5.05 MB of JS; browsers fetch maps only with
  DevTools open: no runtime cost, a package-size and exposure question, as D162 already noted).
- `treeshake.moduleSideEffects`: `false` for `src/components` and `src/domain` only (`:72`, D162 FE-SH-04). Feature modules
  (`src/features/**`, `src/data/**`) keep the default (side effects assumed), which is why a barrel such as
  `features/pm/generators/rules.ts` ships whole to anyone who imports one of its helpers (BND-03).
- `manualChunks`: only the Fluent start-up subset (`STARTUP_FLUENT`, `:14-18`, `isStartupFluent`, `:85`). React, react-dom,
  react-router and query-core sit in the entry chunk with the app shell and the preload map of every lazy chunk (BND-11).
- Aliases: `@`, `use-context-selector` -> `platform/useContextSelector.ts` (D140), `fast-formula-parser` -> `platform/formulaParserStub.ts`
  (D162 FE-C1-01; verified: no chevrotain/jstat in any chunk, the Add Cost chunk is 67.7 KiB).
- `define: { __APP_BUILD__: new Date().toISOString() }` (`:34`) is inlined in the Generators screen chunk and makes every build differ
  (BND-11).
- No `build.target` override (Vite 8 default), no `chunkSizeWarningLimit` override (Vite warns for ProjectMap > 500 kB).

## 10. Dependency and architecture map

```
                     index.html
                         |
                  main.tsx (entry chunk "index")
        +----------------+-----------------------------------------------+
        |                |                                               |
   Providers.tsx    bootPrefetch.ts --> bootPlan.ts, screenLoaders.ts     App.tsx --> AppShell/AppHeader/LeftNav
   (QueryClient,        |   (dynamic) pmScreenPrefetch, */queries          |        ReportProblemPanel (static, BND-10)
    router,             |                                                  |
    SessionContext) ----+--> platform/powerClient (SDK chunk "requestLog") app/routes.tsx --lazy--> 22 screen chunks
        |                                                                         |
        +--> data/project.ts, currentUser.ts, client.ts, retry/requestPolicy      +--> per screen: Screen.tsx -> hooks.ts/queries.ts
             (entry chunk)                                                              -> data/*.ts -> generated/services (tiny chunks)
                                                                                        -> features/<x>/rules.ts (pure)
   Heavy lazy leaves:  ProjectMap (azure-maps, 1.7 MB)   applicationinsights-web (194 KiB)   react-spreadsheet (Add Cost)

   Layering as built:    features/*/Screen -> features/*/hooks -> data/*  ==>  data/* -> features/*/rules   (inversion, BND-18)
```

Cross-feature import edges through the `@/features/` alias (DERIVED; relative imports not counted): `data -> cost/capex-costs` 9,
`data -> cost/costing` 7, `data -> cost/periods` 6, `data -> cost/contracts` 4, `data -> pm/general-data` 3,
`data -> cost/add-costs-from-table` 3, `data -> pm/milestones` 2, `data -> pm/generators` 2, `pm/milestones -> pm/general-data` 5,
`cost/periods -> cost/costing` 5, `cost/costing -> cost/capex-costs` 4, and Revenues/Production/Planning/Grid Operator -> `pm/generators`.
The data layer owning imports from screens' `rules.ts` is the structural cause of most bundle findings below.

## 11. Architectural patterns that add execution overhead (summary; detail in doc 09 and the register)

| Pattern | Evidence | Finding |
|---|---|---|
| First data request starts after the whole startup JS graph | `main.tsx:3-15`, ES-module evaluation order; 302 KiB gz / 1.0 MB | BND-01 (HIGH) |
| Empty `#root` until React renders | `index.html:9`, `App.tsx:75` | BND-09 |
| Static import of a closed panel into the entry | `App.tsx:24,176` | BND-10 |
| Helper imported through a screen barrel (`export *`), screens not marked side-effect free | `planning/rules.ts:42`, `grid-operator/rules.ts:42`, `revenues/rules.ts:69`; 69.6 KiB chunk | BND-03 |
| Data module imports another screen's data/rules for one function | `milestones/hooks.ts:40`, `data/revenues.ts:34`, `general-data/hooks.ts:40,43` | BND-04 |
| Shared reference data (project states) lives in a screen's data module | `data/projectStates.ts:14` | BND-06 |
| Generic transport imports a screen-specific descriptor | `data/bulkSend.ts:48` | BND-07 |
| Facade that imports every Cost module | `data/costRepository.ts:19-58` | BND-08 (PRIOR:FE-C2-08) |
| Map token flow waits for the 1.7 MB chunk and map init | `ProjectMap.tsx:84-92` | BND-05 (PRIOR:FE-P1-01) |
| Entry chunk holds vendor code and the preload map of every chunk: any change cascades to 77 of 155 file names | rebuild diff | BND-11 (CONFIRMED) |
| Focus refetch on every re-focus after 30 s | `Providers.tsx:27,30` | BND-02 (PRIOR:OPT-18) |
| Shell re-render on every location change | `App.tsx:35`, `LeftNav.tsx:215,384` | BND-15 |
| Layering inversion `data -> features/*/rules` | section 10 | BND-18 |

## 12. Checked and found NOT to be a bottleneck

- **Import-time work.** No module computes anything heavy at import: top-level `makeStyles` calls are lazy in Griffel; one top-level
  `RegExp` (`data/ownerBindGuard.ts:37`); `installE2EHook` reads one `localStorage` flag; `installGlobalErrorLog` adds two listeners.
  `createLightTheme` runs once (`theme/fluent.ts:40`).
- **JS parse cost of the startup graph.** V8 parse-only time of the 8 startup files is 31.7 ms (median) / 34 ms (first run) on this machine
  (Node `vm.SourceTextModule`, MEASURED); the 1.66 MB map chunk 36 ms and the Application Insights chunk 6.3 ms. Bytes and round trips
  matter more than parse; evaluation was not measurable here.
- **Duplicate dependencies / duplicated modules.** None (section 8).
- **Formula engine in Add Cost.** Aliased out; the screen chunk is 67.7 KiB (D162 FE-C1-01 still true).
- **Request logging.** `logHttp` builds a string per request before the console gate decides to drop it in Production: MEASURED
  1.5 us per call for the URL work (200,000 calls in 300 ms, `shorturl-bench.mjs`); negligible even for hundreds of requests. The held
  buffer is capped at 1,000 lines (`consoleGate.ts:HELD_MAX`).
- **Query-cache subscription (`attachQueryLog`).** Two Map lookups per cache event; no serialisation except `keyText` at fetch start.
- **Session context fan-out.** The provider value is memoised on data; navigation does not re-render the consumers of `useSession`.
- **react-router weight.** 94 kB output is the price of the data router (`useBlocker`); the build is the production one (no dev warnings
  strings found in the entry).
- **Fonts and images.** No web fonts; the only image is the 3.9 kB inlined logo.
- **Source maps in `dist`.** No runtime cost.
- **Persisted reference data at start-up.** Not used: no IndexedDB read on the first-paint path.
- **App Insights in the entry.** It is not: a lazy 194 KiB chunk started only when a connection string exists (D119 S5 still true).

## 13. Limitations

- No browser, no signed-in Power Apps host, no Dataverse: time to usable screen, long tasks, JS evaluation time, request timing through the
  host, HTTP protocol version and caching headers were not measurable. Everything labelled MEASURED is a byte count, a file-name comparison or a
  Node-side V8 parse time. The one HAR cited by D119 is git-ignored and not in this worktree.
- Rendering findings (BND-15) are DERIVED from the component tree, not profiled.
- `src/generated` and `.power` were measured only as bytes in chunks.
- Per-screen bodies, write paths and tests were not read; a bundle finding does not say the screen's own code is efficient.
- The brief lists the register header as 15 columns and then names 17; the register uses the 17 named columns.
