# 03 — Frontend rendering bottlenecks (cross-cutting)

Stage 1 audit, 26 Nov 2026. Worktree `feature/bottleneck-identification-optimization`, base `dde9e92`. Read-only: nothing under
`ProjectCosts-CodeApp/` was changed. Register: `_register/RND.md` (rendering findings are tagged `[RENDER]`; hook and state
findings tagged `[HOOKS/STATE]` are written up in `04-hooks-and-state-bottlenecks.md`). Per-screen detail belongs to the four
screen agents; this document covers the shared infrastructure and patterns countable across `src/`.

Paths are relative to `ProjectCosts-CodeApp/`. MEASURED = I ran it (command in §7); DERIVED = counted or traced in source;
ESTIMATED = reasoning.

## 1. Scope actually inspected

Read in full or in the relevant part: `src/main.tsx`, `src/App.tsx`, `src/app/{Providers,SessionContext,routes,queryLog,
queryStructuralSharing,useCurrentUser,useHasTracedError,generatorsWarmup,pmScreenPrefetch}.ts(x)`, `src/components/{AppShell,
AppHeader,LeftNav,CommandSlot,CommandBar,FormPanel,formPanelContext,discardGuard,CanvasFields,Fields,fieldSkin,standardValue,
RowActions,LoadingOverlay,QueryStates,useStableCallback,useQueryHealth,useNotify,AppToaster,index}.ts(x)`, `src/platform/
{requestLog,telemetry,renderProbe,useContextSelector}.ts`, `src/features/shared/{useDebouncedValue,usePanelState,useBusyRunner}.ts`,
`src/features/pm/project-main/{hooks.ts, Screen.tsx (grid and row)}`, `src/features/pm/general-data/{hooks.ts, Screen.tsx
(municipality path)}`, `src/data/{keys,usePlanWrite (part),persistedReference (header),generalData (search)}.ts`, `vite.config.ts`,
`src/styles/{canvas.css (selectors only),global.css}`, Fluent `react-drawer` source in `node_modules`. Prior programme: D162
`ProjectDocs/app-docs/frontend-optimization/02,03,04,06,08,09`.

NOT read in depth (other agents' scope): the bodies of the large screens (Finance, OPEX, Land Lease, Contracts, CAPEX, Revenues,
Generators, Check List, admin screens), `data/*` read paths, the PCF grid, the spreadsheet adapter, bundle output. Where I quote a
screen it is only to count a pattern.

## 2. Method

1. Read the shell, providers and shared kit; traced what re-renders on a URL change, on a session change and on a query refetch.
2. Counted patterns across `src` (§3).
3. Wrote throwaway jsdom render benchmarks under `_bench/RND/` to put numbers on the shared primitives. They run with a private
   Vitest config (`_bench/RND/vitest.config.mts`) so the app's own suite and config are untouched.
4. Re-checked every D162 item that belongs to shared infrastructure against the current source (§6).

**Read the numbers correctly.** The benchmarks run React 19's development build in jsdom. They are relative measurements
(Fluent Table vs plain table, Tooltip vs no Tooltip) and an upper bound on production milliseconds, not browser timings. No
signed-in browser was available (rule 3 of the brief).

## 3. Pattern counts across `src` (DERIVED, non-test files)

| Pattern | Count | Reading |
|---|---|---|
| Non-test source files / lines | 402 files, 132,192 lines (112 `.tsx`) | |
| `useQuery` / `useMutation` call sites | 139 / 33 | `useQueries` 1; TanStack `select` option unused (all `$select` are OData columns) |
| `useState` / `useMemo` / `useCallback` / `useRef` | 74 / 171 / 68 / 37 | no `useReducer` |
| `useEffect` / `useLayoutEffect` | 47 / 13 | listed in `04` §3 |
| `memo(` | 36 (all in features; **0 in `src/components`**) | shared kit is unmemoised by design; screens memoise their own rows/cards |
| `useStableCallback` | 96 | the D143 tool for stable handlers |
| `makeStyles(` | 84 files | all at module scope (none inside a render) |
| `createContext` | 5 (Session, CommandSlot, FormPanel, SpreadSheet RowWindow, the D140 selector) | `useSession()` has 42 consumers |
| `.map(` in `.tsx` / explicit `key=` | 313 / 194 | index keys only in static, non-reorderable lists (CountryFlag, PanelMessages, Gallery cells, a checklist preview table) |
| `<FormPanel` sites / `<ConfirmDialog` sites | 45 / 36 | every FormPanel also builds a guard ConfirmDialog |
| `<Tooltip` sites | 52 | several inside rows that repeat 100-250 times |
| `startTransition` / `useDeferredValue` / `useTransition` | 1 / 0 / 0 | no concurrent-rendering mitigation for typing |
| `JSON.parse` or `JSON.stringify` in `.tsx` | 0 | none in render paths |
| Virtualisation library | none | only the Add Cost sheet windows its rows by hand |

Screens that keep form drafts in the root component and have no `memo(`: General Data (1,294 lines, 7 `useState`), Planning,
Milestones, Team, Grid Operator, CAPEX (9 `useState`) and its Comments panel. §5 shows why most of these are not worth changing.

## 4. How the shell re-renders (traced)

`main.tsx` → `Providers` (FluentProvider, `QueryClientProvider`, hash `RouterProvider`) → one splat route that holds
`ErrorBoundary > SessionProvider > App` → `AppShell` (header, rail, content) → `AppRoutes` (module-level `ROUTES` element, D162
FE-SH-02) → `<Routes>` → lazy screen.

- **Session context is stable.** `SessionProvider`'s value is memoised on primitives and on the query data identities; D162's
  Date-aware `structuralSharing` stops the project object changing identity on an unchanged refetch. Verified in
  `app/SessionContext.tsx:118-151` and `app/Providers.tsx:32`. Any future query result that holds a class instance other than
  `Date` would still break this.
- **Every URL change re-renders four things:** `SessionProvider` (`useLocation`), `App` (`useLocation`), `Routes`, and any screen
  that reads the location. `App` passes fresh inline closures (`onBack`, `onReportProblem`) to `AppShell`, which is not memoised,
  and `AppHeader` (two `Menu`s, a `Tooltip`, 3-4 `Button`s) is not memoised either. Most navigations are rare, so this is cheap.
  The one URL change that happens per keystroke is the Overview filter (RND-01).
- **`CommandSlot` portal** is correct after D162 FE-SH-06: one mount, no `ready` flag.
- **Closed panels are free in the DOM.** Fluent `OverlayDrawer` defaults `unmountOnClose` to true (read in
  `node_modules/@fluentui/react-drawer/lib/shared/useDrawerDefaultProps.js`), so none of the 45 panel bodies mount until opened.
  What remains is the hook tree of each panel (RND-06).

## 5. Measured cost of the shared primitives (MEASURED)

`_bench/RND/components.bench.test.tsx`, `tooltip`, `table`, `combo`, `cold`, `urlkeystroke` (jsdom + React 19 dev, one machine,
best or mean of several runs; see §7 to rerun).

| Primitive | Result | Use |
|---|---|---|
| Fluent `TextField` (Field + Input) | 5.1 ms for 50 instances = 0.10 ms per instance per re-render | vs `CostField` (plain `<input>`) 0.66 ms for 50 = 0.013 ms |
| `CostSelect` (Fluent Dropdown, 10 options) | 0.13 ms per instance per re-render | |
| `DateField` (DatePicker) | 0.21 ms per instance per re-render | |
| Closed `FormPanel` / closed `ConfirmDialog` | 0.15 ms / 0.06 ms per parent re-render | RND-06 |
| `AppHeader` | 0.67 ms per re-render | RND-01 |
| `Tooltip` + `Button` vs `Button` vs `<button>` | 110 ms vs 25 ms vs 11 ms for 250 | RND-04, about 0.34 ms per Tooltip |
| Fluent `Table` 200 rows x 12 cells vs plain `<table>` | 114-165 ms vs 40-55 ms mount | RND-05 |
| Open `Combobox`, N Options | 200: 81-88 ms; 1,000: 181-257 ms; 2,000: 326-407 ms; 5,000: 762-859 ms | RND-02, RND-14 |
| URL-driven vs local-state text box (shell + 200 memo rows) | 5.8-6.9 ms vs 0.7-0.8 ms per keystroke | RND-01 |
| First-ever mount vs 2nd (FormPanel open) | 116 ms vs 22-24 ms | RND-07 |

**What this says about the "lifted draft" pattern.** A re-render of an unmemoised form root costs about 0.1 ms per Fluent field
plus 0.15 ms per closed panel. General Data's ~16 Fluent fields are about 2 ms per keystroke in the dev build, below one frame,
and under that in production. So the D162 memoisation of Finance, Contracts, Production, Gates and Check List was justified by
their 50-250 repeated Fluent controls; **memoising the small form screens (General Data, Planning, Milestones, Team, Grid
Operator) would not pay for itself** and is not recommended.

## 6. Prior items (D140, D162): current status

| Prior item | Status in current source |
|---|---|
| D140 context selector for react-spreadsheet | Holds: alias in `vite.config.ts`, `platform/useContextSelector.ts`, its test present |
| FE-SH-01 Date-aware structural sharing | Holds (`Providers.tsx:32`); cost note RND-03 |
| FE-SH-02 stable `AppRoutes` element | Holds (`App.tsx:31`). Note `Routes` still re-renders on any URL change |
| FE-SH-06 command bar mounts once | Holds (`CommandSlot.tsx:40-44`) |
| FE-SH-08 error icon subscription | Holds (`useHasTracedError.ts`) |
| FE-SH-07 cancelled loads close their ACTION | Holds (`queryLog.ts:62-82`) |
| FE-SH-09 shell replaced by blocking overlay | **Open (held for product)**: RND-08 |
| FE-P1-04 Overview URL write per keystroke | **Open (skipped D162)**: RND-01, now measured |
| FE-P1-02a municipality options memoised | Holds (`general-data/Screen.tsx:630`) |
| FE-P1-02b windowed municipality listbox | **Open (deferred)**: RND-14, now measured |
| FE-C2-06, FE-P2-01/02/03, FE-AD-01/02/03, FE-C2-01/02, FE-P1-03 (memoised cards, rows, tables) | Hold (spot-checked `memo(` at `finance/Screen.tsx:701,764`, `GateTable.tsx:224,312,386,433`, `contracts/Screen.tsx:1619,1730`, `LandLeaseScreen.tsx:1277`, `OpexScreen.tsx:1448`, `checklist/Screen.tsx:468`) |
| Deferred and still open: FE-C2-07, FE-P2-04, FE-AD-04, FE-C1-05/06/07/10, FE-P2-07, FE-AD-09, FE-C2-08/09, FE-AD-08 | Not re-evaluated; screen agents own them |

## 7. Reproducing the measurements

From `ProjectCosts-CodeApp/`:

```
VITE_CONFIG_NATIVE_IGNORE_WARNING=true npx vitest run --reporter=verbose --silent=false \
  --config ../ProjectDocs/bottleneck-identification/_bench/RND/vitest.config.mts <name>
```

where `<name>` is `components`, `tooltip`, `table`, `combo`, `cold`, `urlkeystroke`, `sharing` or `rendertrace`. One file per run;
the whole suite was never run. The files are under `ProjectDocs/bottleneck-identification/_bench/RND/` and nothing in `src/` was
touched. The config re-uses the app's aliases and plugins and maps bare imports to the app's `node_modules`.

## 8. Findings (register `RND.md`; rendering side)

| ID | Pri | One line | Confidence |
|---|---|---|---|
| RND-01 | P2 | Overview filter boxes navigate per keystroke: shell, session, routes and screen re-render (PRIOR FE-P1-04, now measured 8x) | HIGH |
| RND-14 | P2 | Municipality Combobox mounts up to 5,000 Options: 330-860 ms in dev-jsdom (PRIOR FE-P1-02b) | HIGH |
| RND-04 | P3 | One Fluent Tooltip per row control: 0.34 ms each, thousands on the admin and Check List screens | HIGH |
| RND-05 | P3 | Overview 200 x 12 Fluent Table cells: 2.5x the mount cost of plain markup | HIGH |
| RND-06 | P3 | Closed FormPanel / ConfirmDialog hook trees re-render with their parent | HIGH |
| RND-07 | P3 | First overlay use per session pays style and tabster start-up (only Generators is warmed) | SUSPECTED |
| RND-08 | P3 | Shell replaced by overlay on project open (PRIOR FE-SH-09) | HIGH |
| RND-11 | P3 | CAPEX Comments panel copies query data into state in an effect | HIGH |
| RND-13 | P3 | `:has(:disabled)` descendant selectors on panel roots | SUSPECTED |

## 9. Checked and found NOT to be bottlenecks

- **Shared kit render cost.** `CostField`, `CanvasFields`, `Fields`, `CommandBar`, `LeftNav`, `ExpandChevron`, `StatusPill`,
  `RowActions` do no expensive work per render: no `JSON`, no sorting, no `Intl` construction (`toLocaleString`/`Intl.` appear
  once in all `.tsx`), no effects except `ReorderItems`. `RowActions` defaults to `tooltip="reason-only"`, which avoids a Tooltip
  per icon.
- **`makeStyles` inside render.** None; all 84 call sites are module-level hooks. `useStandardValueClass` and
  `useFieldControlClass` return closures built per render, which is a few allocations.
- **Keys.** 313 `.map(` and 194 explicit `key=`; the ten index keys are in static or non-reorderable lists. No component is
  defined inside another component (checked by D162 and by grep of the shared kit).
- **Context fan-out.** One app-wide context (`SessionCtx`, 42 consumers). Its value changes only on session, environment-variable,
  project or load-state change. `FormPanelContext` value is memoised (`FormPanel.tsx:141`). `CommandSlot` carries one element.
- **Request log and query log in Production.** `logHttp`, `logData`, `beginAction` format strings before `consoleOutput` drops
  them in Prod, but each is a few string operations per request; the per-request cost is microseconds against network latency.
  `keyText` runs `JSON.stringify` of a query key once per fetch start; keys are small (`data/keys.ts`).
- **Toasts, error boundary, `useNotify`.** `useNotify` memoises its object on the toaster functions; `AppToaster` is mounted once.
- **`LoadingOverlay`.** Fluent Spinner only; no timers or measuring.
- **Hidden-but-mounted panels.** Not mounted (§4). Element creation for a closed panel's children is cheap; any heavy inline
  computation in those children belongs to the screen agents.
- **Virtualisation.** The largest unvirtualised lists are Overview (200 rows per page, `PAGE_SIZE`), Gates and Check List
  Settings (100-250 rows), and the municipality listbox (up to 5,000 Options, RND-14). Only the municipality list is large enough
  to warrant windowing; the Add Cost sheet already windows its rows.

## 10. Limitations

- jsdom + React dev build, not a browser; no commit times in a production build, no layout or paint cost, no GPU. RND-07 and
  RND-13 are SUSPECTED for that reason.
- I did not open the large screen bodies, so a screen-specific hot path (for example the CAPEX PCF grid, the Revenues volume
  rows) is not in this document.
- The Overview benchmark models the shell and a memoised table; the real screen adds its own render cost on every keystroke,
  so the real keystroke cost is larger than 7 ms.
- No heap or long-task data (needs a browser).
