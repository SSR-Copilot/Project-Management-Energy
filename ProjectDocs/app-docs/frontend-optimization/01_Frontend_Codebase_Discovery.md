# 01 — Frontend codebase discovery

Stage 1, 25 Nov 2026. Branch `feature/frontend-performance-optimization`, created from `origin/RounakDev1` at `ed4354e` (see `11`).
**Status: Stage 1 and Stage 2 complete, awaiting approval. No application code has been modified.**

Index: `01` discovery · `02` rendering and components · `03` state and hooks · `04` memory · `05` bundle and loading ·
`06` strategy and prioritised backlog · `07` roadmap · `11` git record. Files `08`–`10` are written in Stage 3.

## 1. Relation to the earlier programme (D160)

`ProjectDocs/app-docs/optimization/` (D160, `887fc4a`, 23–24 Nov 2026) optimised **server round trips and computation**.
It touched rendering in only four places: the CAPEX `PcfGrid` repaint (OPT-25), memoised OPEX / Land Lease cards (OPT-26),
the admin gates grid derivation (OPT-27) and a stable `useMediaQuery` (OPT-29). This initiative covers what D160 did not:
React rendering, state, hooks, component structure, memory and the bundle. Every D160 item was given to the auditors as
"done, do not re-report"; none of the findings below repeats one.

## 2. What was examined

`ProjectCosts-CodeApp/src`, excluding `src/generated/` and `.power/` (pac output).

| Area | Lines (non-test) | Audit slice |
|---|---|---|
| `main.tsx`, `App.tsx`, `app/`, `platform/`, `appInsights/`, `components/` (43 tsx), `theme/`, `styles/`, `features/shared/` | ≈ 11.0k | SH |
| `features/cost/capex-costs` (incl. vendored `pcf/` renderer), `costing`, `add-costs-from-table`, `land-lease`, `opex-costs` | ≈ 11.8k | C1 |
| `features/cost/periods` (OPEX, Land Lease), `contracts` | ≈ 15.6k | C2 |
| `features/pm/generators`, `checklist`, `general-data` (Azure Maps), `project-main` (Overview) | ≈ 24.2k | P1 |
| `features/pm/finance`, `revenues`, `production`, `planning`, `milestones`, `grid-operator`, `team` | ≈ 23.1k | P2 |
| `features/admin/*` (six Application Settings screens) | ≈ 14.5k | AD |
| `vite.config.ts`, `index.html`, `dist/` build, source maps | — | orchestrator (`05`) |

Method: six read-only auditors ran in parallel, one per slice, with the same brief. Each traced real callers (grep) and
read library source where behaviour depended on it (TanStack Query 5.102.8, react-router 7.18.3, react-spreadsheet 0.9.5,
Fluent Combobox 9.17.5). Each finding is labelled Confirmed, Potential or Requires profiling. The orchestrator re-read the
highest-impact claims (§5) and measured the bundle itself with a production build and source-map byte attribution.

## 3. Frontend architecture

**Stack:** React 19.2, TypeScript 6, Vite 8 (rolldown), Fluent UI v9 (9.74), TanStack Query 5, react-router 7 (hash
router), `@microsoft/power-apps` 1.3.1, `react-spreadsheet` 0.9.5 (Add Cost from Table), `azure-maps-control` 3.7
(General Data map), App Insights (dynamic import).

**Initialisation sequence:**
1. `main.tsx` calls `installGlobalErrorLog()`.
2. It starts `startBootPrefetch()` (D119, OPT-03), which loads the first screen's chunk and reads from the URL without
   being awaited.
3. It renders `createRoot` → `StrictMode` → `Providers`.

**Provider tree:** `Providers` (`app/Providers.tsx`) wraps everything in this order:
1. `FluentProvider(vsbTheme)`;
2. `QueryClientProvider`, with defaults `staleTime` 30 s, `refetchOnWindowFocus: true` and retry rules;
3. `RouterProvider` (hash router, created once);
4. `ErrorBoundary`;
5. `SessionProvider` (`app/SessionContext.tsx`), which holds three queries (session, environment variables, the session
   project) and subscribes to `useLocation`;
6. `App`.

`AppToaster` sits beside the router.

**Shell:** `App` renders `AppShell`, which holds:
- `CommandSlotProvider`;
- `AppHeader`;
- `LeftNav`;
- `<main>`, containing `AppRoutes` and `ReportProblemPanel`.

On non-Cost routes, a session load replaces the shell with a blocking `LoadingOverlay`.

**Routes (`app/routes.tsx`):** every screen is `React.lazy`.
- Cost and PM screens load through `screenLoaders.ts`, so boot prefetch and warm-up can start their chunks.
- The six admin screens import directly.
- `CostProjectGate` and `ProjectScreenGate` hold the screens until the session project has loaded.
- `/costs/add-from-table` renders `<><CapexCostsScreen/><AddCostsFromTableScreen/></>`; see FE-SH-03.

**Contexts:** there are only four:
- `SessionContext` has 26 consumer modules, including `App`, the gates, `NavItemLink`, `ReportProblemPanel` and the
  screens.
- `CommandSlot` has one consumer, Project Overview.
- `FormPanelContext` holds a memoised `{requestClose, busy}`.
- `platform/useContextSelector.ts` is the D140 replacement for react-spreadsheet's context library.

There is no global state library. Server state lives in TanStack Query; screen state lives in each `Screen.tsx`.

**Per screen:** `rules.ts` holds pure rules, `hooks.ts` / `queries.ts` the TanStack wiring, and `Screen.tsx` the
composition. Shared UI comes from the `@/components` barrel (`components/index.ts`).

**Hook usage (non-test):**

| Hook / API | Count |
|---|---|
| `useEffect` | 45 |
| `useMemo` | 134 |
| `useCallback` | 28 |
| `memo(` | 21 |

These are moderate numbers. Earlier rounds (D136, D138, D140, D143, D146, OPT-25/26) already memoised the heaviest
lists: Revenues volume rows, Generators sections and panels, Overview grid rows, the Add Cost sheet cells, and the OPEX and
Land Lease cards.

## 4. Component hierarchy (by screen; details per slice in `02`)

| Screen | Root holds | Heavy children | Memoised already |
|---|---|---|---|
| Project Overview | criteria in the URL (`useCriteria`) | 200-row grid, filter row, CommandBar via CommandSlot | `ProjectGridRow`, commands |
| CAPEX/DEVEX | ~30 `useState` (panel, dialogs, filters) | `PcfGrid` (vendored DOM renderer), CommentsPanel, FormPanel | grid repaint gated (OPT-25) |
| Add Cost from Table | `loaded` memo, `originalRows`/`currentRows` | `SpreadSheetComp` → react-spreadsheet (≈190k cells, windowed) | cells (D140), `SpreadSheetComp` |
| OPEX / Land Lease | folds, selection, panel form | cards × N, FormPanel | cards (OPT-26) |
| Contracts | ~17 `useState` incl. 3 panel forms | card list, `DevCoAccountPicker` tree | — |
| General Data | form state | ~40 fields, municipality Combobox (≤5,000), lazy `ProjectMap` | `baseline`, `mapPin` |
| Generators | all form state in `GeneratorsScreenBody` | 7 sections, 8 lazy panels | sections, panels (D143) |
| Check List | panel and comment form | task table (inline rows), `ProjectStates`, history | derivations (D138), not rendering |
| Finance | 5 panel drafts + repayment rows, folds | tranche cards, 5 FormPanels, 3 dialogs | standards only |
| Revenues | contract and balancing forms | contract cards, volume rows | `ContractCardFields`, `VolumeRow` (D136/D146) |
| Production | yield form, season/negative edits | 12 + 15 editable rows | — |
| Admin gates | toggles, editor, dialogs | `GateTable` (gates + 100–250 task rows, ~5 Tooltips each) | row derivation (OPT-27) |
| Admin checklists | drawer form in the screen | `TaskTable` per open cluster | derivations |

## 5. Orchestrator verification

These claims were re-read against source before they entered the register.

- **FE-C1-02, data loss.** It was found by C1 and confirmed independently from the session side by SH (FE-SH-01) and C2
  (FE-C2-04). The source:
  - `add-costs-from-table/Screen.tsx:154-172`: the `loaded` memo depends on `project`.
  - `data/project.ts:262-283`: `ProjectContext` carries `Date`s.
  - `SessionContext.tsx:76`: `staleTime` is 5 min, and the global `refetchOnWindowFocus` is true.
  - TanStack `replaceEqualDeep` keeps only plain objects and arrays.
  - `SpreadSheet.tsx:461-467`: a new `initialData` calls `setData(decorateGrid(initialData))`.

  Confirmed: when an unchanged project is refetched while the sheet is open, the sheet re-hydrates from the server
  snapshot and the user's unsaved edits are lost.
- **FE-C1-01.** `node_modules/react-spreadsheet/dist/es/index.js:3` statically imports `fast-formula-parser`. Line 1108
  constructs `new DepParser()` at module load. Nothing in `src` reads evaluated data or `createFormulaParser`. Confirmed.
  A scratch build with a stub cut the screen chunk from 360 kB to 69 kB minified (`05`).
- **FE-SH-03 = FE-C1-03.** Two slices found it independently: `routes.tsx:177` vs `:183` (lazy element vs Fragment at the
  same position), and react-router's unkeyed `RenderedRoute`. Confirmed by two code reads. Interaction with D51 §11.19 /
  CA-13 is noted in `06`.
- **Bundle.** Every number in `05` was measured, not estimated.

Other entries carry their auditor's evidence and confidence label. Stage 3 re-reads each file before changing it.

## 6. Limits of this audit

- **No browser profiling was possible.** The app needs a signed-in Power Apps host (`pac code run` plus an authenticated
  browser), which this session cannot provide. That rules out commit milliseconds, heap snapshots, detached DOM and long
  tasks in the real host. Instead:
  - Render **counts** will be measured in Stage 3 in jsdom with `<Profiler>`, the existing pattern of
    `checklistVisit.bench.test.tsx` and `generators/Screen.renders.test.tsx`.
  - Bundle bytes are exact.
  - Each finding lists what a browser profile would still have to confirm (`02`–`05`, "Requires profiling").
- **Dataset sizes are taken from code and docs, not from production:** up to 15,000-row sheets, a few hundred contracts,
  100–250 gate tasks, and up to 5,000 municipalities.
- **The OPEX O&M / Other rail switch** reuses one component instance, so selection and banner carry over and the book is
  not re-read. This is a canvas-parity question (D123), not a performance one. It is recorded in `06` §5 and not acted on.
