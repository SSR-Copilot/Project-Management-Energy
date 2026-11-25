# 02 — Rendering and component findings

Stage 1, 25 Nov 2026. Optimisation areas 1 (React rendering) and 4 (components). Findings whose main category is state or
hooks are in `03`, memory in `04`, bundle in `05`. Priorities are assigned in `06`; they are repeated here for reading.
Paths are relative to `ProjectCosts-CodeApp/src/`. Cx = complexity, R = risk (L/M/H). Conf = C (Confirmed),
P (Potential) or RP (Requires profiling).

## A. App shell

| ID | Pri | File:line | Current behaviour → inefficiency (root cause) | Recommendation | Expected benefit | Cx/R | Conf |
|---|---|---|---|---|---|---|---|
| FE-SH-02 | P2 | `App.tsx:191`, `components/AppShell.tsx:74` | `<AppRoutes/>` is a new element on every `App` render, so the active screen (not memoised) re-renders for shell-only changes: report panel open/close, current user arriving, and every session value change (FE-SH-01). | `memo(AppRoutes)` or hoist the element. Routing still reaches it through router context. | Limits the blast radius of FE-SH-01; the screen no longer re-renders for shell state. | L/L | C |
| FE-SH-03 | **Withdrawn (wrong; disproved in Stage 3).** React unwraps an unkeyed top-level Fragment, so CAPEX stays the first child with the same type and is **not** remounted. UT-CAPEXROUTE-FE-001…003 now pin this against the real `AppRoutes`. The original text follows | `app/routes.tsx:177` vs `:183`; react-router `_renderMatches` (unkeyed `RenderedRoute`) | `capex` renders `<CapexCostsScreen/>`; `add-from-table` renders a Fragment holding CAPEX and the sheet. The element type at the same position changes, so **CAPEX unmounts and remounts when Add Cost from Table opens and again when it closes**. Each time this rebuilds the PCF grid DOM, drops the expand set, year, Show Empty / Show Planned and payer filters, and refetches stale queries. Also found as FE-C1-03. | A pathless layout route `<><CapexCostsScreen/><Outlet/></>` with children `capex` (null) and `add-from-table`. Check D51 §11.19 / CA-13 first (they worked around CAPEX queries going inactive during the remount) and `useSavePaintMark`. | Two full CAPEX mounts and grid builds saved per sheet visit. Grid state survives, as in the canvas (the sheet is a modal over an unchanged screen). | M/M | C |
| FE-SH-06 | P2 | `components/CommandSlot.tsx:40-44` | `ready` starts `false` although the slot element already exists, so on every Project Overview mount the command bar paints one frame in the content area. It then switches to a portal: a different element type, so the whole Toolbar/Menu/Tooltip subtree unmounts and remounts. | `useState(() => element !== null)`, or portal whenever `element` is set. | One mount instead of two per `/projects` visit; no one-frame layout shift. | L/L | C |
| FE-SH-09 | Held (product) | `App.tsx:92` | On non-Cost routes, a session load replaces `AppShell` with a blocking overlay. Header and rail remount, and `LeftNav` loses its expand state. | Product decision: lay the overlay over a mounted shell. Not for Stage 3 without sign-off. | One header/rail remount per project open. | L/M | C |

## B. Cost: CAPEX and Add Cost from Table

| ID | Pri | File:line | Current behaviour → inefficiency (root cause) | Recommendation | Expected benefit | Cx/R | Conf |
|---|---|---|---|---|---|---|---|
| FE-C1-05 | P3 (deferred) | react-spreadsheet `index.js:2376-2381`, `:2497-2502` | Each grid handoff (load, paste, add or delete row) builds **two** `Model`s, each walking every cell: about 25 ms per Model at 190k cells in Node. | (a) Comes partly with FE-C1-01, because parser construction leaves each build. (b) Patching the vendor package to build the initial state lazily is deferred: maintenance cost. | ≈25 ms per paste or row change (b). | M/M | C (source) |
| FE-C1-06 | P3 (deferred) | `capex-costs/pcf/ui/GridRenderer.js:165`, `:197`, `:259`, `:300-330`, `:1421-1432` | Each expand/collapse re-parses the whole dataset and rebuilds every visible row, forcing layout twice. | Cache the parsed tree per dataset (WeakMap). Caveat: `applyStandardContractOptions` mutates the tree. Deferred until a profile shows a cost. | DOM work only per toggle. | M/M | P |
| FE-C1-07 | P3 (deferred) | `capex-costs/Screen.tsx:548-1396` | A panel keystroke renders the whole CAPEX screen: toolbar dropdowns, closed CommentsPanel, dialogs, and O(lines) derivations. `PcfGrid` is already cheap after OPT-25. | Move the panel and its ~12 state variables into a `CapexEditPanel` child, only if a profile shows more than ~8 ms per keystroke. | Typing renders only the panel. | H/M | RP |

## C. Cost: OPEX, Land Lease, Contracts

| ID | Pri | File:line | Current behaviour → inefficiency (root cause) | Recommendation | Expected benefit | Cx/R | Conf |
|---|---|---|---|---|---|---|---|
| FE-C2-01 | P2 | `contracts/Screen.tsx:1253-1262`, `:1659-1762`; `rules.ts:642-701` | `DevCoAccountPicker` is not memoised. Each keystroke in the contract panel re-renders every level-1 row and the open parent's leaves, with 3 full-tree scans per parent. Its props are already stable across keystrokes. | `memo(DevCoAccountPicker)`; optionally a `parentId → leaves` map per tree. | The picker is skipped on every panel keystroke. | L/L | C |
| FE-C2-02 | P2 | `contracts/Screen.tsx:238`, `:904-1012`, `:969-1007`, `:1765` | The three panel forms live in `ContractsScreenBody` and the card list is inline JSX with new handlers and `?? []` per render. Every keystroke re-renders every card header (`contractCardTitle` ×2) and every open `ContractCardBody`. | A memoised `ContractList` / `ContractCardBody`, handlers through `useStableCallback`, and a module-level empty array. Test ids and labels move unchanged. | A panel keystroke stops re-rendering N cards. | M/L | C |
| FE-C2-06 | P2 | `periods/LandLeaseScreen.tsx:759-764` | A fold toggle recreates every card object (`{...c, isFolded}`), so every memoised `SubaccountCard` re-renders and each open card rebuilds its rows. | Keep the card objects and pass `open` as a separate boolean. | A fold click renders 1 card instead of all. | L/L | C |
| FE-C2-07 | P3 | `OpexScreen.tsx:1354-1355`, `:1476-1491`; `LandLeaseScreen.tsx:1137-1140`, `:1302-1313` | Every row click passes the global selection to every card, so every open card recomputes gates and rebuilds row models. | Land Lease: compute owner-only values before the memo (identical behaviour). OPEX needs `{ownSelection, anySelected}` (O-1 parity). | 1–2 cards instead of all open cards; usually only 1–3 cards are open. | L-M/L-M | P |

## D. PM: Overview, General Data, Generators, Check List

| ID | Pri | File:line | Current behaviour → inefficiency (root cause) | Recommendation | Expected benefit | Cx/R | Conf |
|---|---|---|---|---|---|---|---|
| FE-P1-02a | P2 | `general-data/Screen.tsx:635`, `:645`, `:650-686` | For German projects, `muniOptions` (up to 5,000 `<Option>` elements) and two linear `.find`s are rebuilt on **every render of the screen**: every keystroke in any field, and every save-progress tick. | `useMemo` on `[municipalities.data, storedMunicipality]`. | Removes an N-element rebuild per keystroke. | L/L | C |
| FE-P1-02b | P3 (deferred) | `@fluentui/react-combobox` `useCombobox.js:87` | Focusing the box mounts up to N Fluent `Option`s; about 2,000 for Bavaria. | Windowed listbox, only if a profile confirms the open delay (keyboard active-descendant must keep working). | Faster open. | M-H/M | RP |
| FE-P1-03 | P2 | `checklist/Screen.tsx:829-967`, `:1029`, `:1145`; `ProjectStates.tsx:282` | Comment text lives in screen state. Each keystroke re-renders every task row (3–5 Fluent Buttons, Tooltip, inline ref callbacks), the non-memo `ProjectStates` stepper and the history list. D138 memoised the derivations, not the rendering. | A memoised `ChecklistTaskTable` with stable handlers (`useStableCallback`), and `memo(ProjectStates)`. Alternatively, keep the comment draft in a small panel child. | A comment keystroke renders only the textarea and panel. | M/L-M | C (path) |
| FE-P1-04 | P2 (gated) | `project-main/Screen.tsx:~976-984`; `hooks.ts:43-71`, `:130-150` | The keyword and capacity boxes are controlled from the URL. Each keystroke is a router navigation inside a transition, so `SessionProvider`, `LeftNav` and the whole Overview re-render, and the prefetch timer re-arms. React advises against transition-priority updates for text inputs. | A local draft, with the URL written after the typing pause (move the existing 350/300 ms debounce). The URL stays the source of truth. Tests PO-001/007/025 pin the behaviour. | Route-level renders drop from one per keystroke to one per pause. | M/M | C (path) |

## E. PM: Finance, Production, Milestones

| ID | Pri | File:line | Current behaviour → inefficiency (root cause) | Recommendation | Expected benefit | Cx/R | Conf |
|---|---|---|---|---|---|---|---|
| FE-P2-01 | P1 | `finance/Screen.tsx:815-823`, `:984`, `:1020-1101`, `:1269-1285` | The 5 panel drafts live in the 2,079-line root and nothing below is memoised. Every keystroke, radio or dropdown change re-renders all unfolded tranche cards (25 `ReadOnlyField` + Tooltip + 3 Buttons each), the Equity/VAT/DSRA/Decommissioning bodies, 5 `FormPanel`s and 3 dialogs, and re-runs `financeCardStandard` (4 `JSON.parse`) and per-tranche parses. | Step 1: a memoised `FinanceCards` gallery with stable props (`useStableCallback`). Step 2 (optional): each panel owns its draft (the D136/D143 pattern). `rules.ts`, labels and test ids unchanged. | About 50–70 Fluent field instances, plus ~10 Buttons and Tooltips, skipped per panel keystroke (Senior Debt, 2 tranches open). | M/M | C (path) |
| FE-P2-02 | P1 | `finance/Screen.tsx:887-888`, `:1587-1600`, `:1686-1726` | A repayment keystroke copies the array, creates a new tranche even when `formDirty` is already set, and re-renders all 26–31 repayment `TextField`s (inline closures). | A memoised `RepaymentRow` with a stable functional setter (the Revenues `VolumeRow` pattern) and no unchanged-value tranche update. | 25–30 row renders skipped per keystroke. | L/L | C |
| FE-P2-03 | P2 | `production/Screen.tsx:386-399`, `:502-564`, `:691-753`; `rules.ts:980-985` | Any panel keystroke re-renders 12 season rows and 15 negative-price rows (~80 Fluent components). The base rows are rebuilt every render, `canSaveYield` recomputes `yieldErrors`, and `applyMonthEdit` returns new objects for every row. | `useMemo` the base rows; memoised `SeasonalityRow` / `NegativePriceRow` with stable setters; `applyMonthEdit` keeps unchanged rows (pure rule, UT added); pass `errors` into `canSaveYield`. | ~27 rows skipped per keystroke; a cell edit renders 1 row instead of 12–15. | L-M/L | C (path) |
| FE-P2-04 | P3 | `milestones/Screen.tsx:487-540`, `:571-581` | A Share of Farmdown keystroke re-renders all 17–19 DatePickers. | Memoised `MilestoneDateRow`. Low value: the field takes 1–5 characters. | ~18 DatePicker renders per keystroke. | L-M/L-M | P |
| FE-P2-07 | P3 (deferred) | `finance/Screen.tsx:1287-2028` | All 5 panels ship in the first Finance chunk. | Lazy panels after FE-P2-01. Deferred: estimated 15–25 kB, with Suspense timing risk in tests. | Small. | M/M | P |

## F. Admin (Application Settings)

| ID | Pri | File:line | Current behaviour → inefficiency (root cause) | Recommendation | Expected benefit | Cx/R | Conf |
|---|---|---|---|---|---|---|---|
| FE-AD-01 | P1 | `admin-gates-approvals/GateTable.tsx:202-347`; `Screen.tsx:147`, `:349-362` | One non-memo component renders every gate and task row (all expanded; ~5 Tooltips per task row). The screen passes inline lambdas, a fresh `collapsed` Set and `runner.isPending`. **One status-pill click causes about 5–7 full-table renders** (track, pending, optimistic set, success, refetch, untrack), roughly 1,000–1,500 Tooltip instances each time. Opening the editor, a dialog or the busy overlay also re-renders it. | Memoised `GateRowView` / `TaskRowView` with primitive props (`pending: boolean` from a pending-id Set, `collapsed: boolean`), stable `(row) =>` handlers, and a memoised `collapsed` Set. No markup or test-id change. | A pill toggle renders **one row**; opening an editor or dialog renders 0 rows. | M/L | C (path) |
| FE-AD-02 | P1 | `admin-default-checklists/Screen.tsx:523`; `TaskEditorDrawer.tsx` | The drawer form lives in the screen's `usePanelState`. Each keystroke re-renders the screen, `SettingsAccordion` and every open cluster's `TaskTable` (up to 100–250 rows with Buttons and Tooltips). | Keep the form local in `TaskEditorDrawer`, seeded on open and keyed by `editor.key`. Four other admin panels already do this. `dirty` is computed in the drawer; the `TaskStatusNotSetError` retry keeps working. | Typing renders only the drawer. | M/L-M | C |
| FE-AD-03 | P3 | `admin-default-checklists/Screen.tsx:190`, `:492-505`; `TaskTable.tsx:79` | `TaskTable` is not memoised and gets a new `lockTip` and handlers per render. | `memo(TaskTable)`, `useCallback` for `lockTip`, stable handlers, after FE-AD-02. | 2–4 full-table renders fewer per status or delete action. | L/L | P |
| FE-AD-04 | P3 (optional) | `admin-milestones/Screen.tsx:146-163`, `:292` | The draft lives in the screen and re-renders the open matrices (small). Its `useCallback`s never hold (deps on query objects) and have no memoised consumer. | Optional: move the draft into the panel. Drop the dead `useCallback`s only if the file is touched anyway. | Minor. | L/L | C |
| FE-AD-05 | P3 | `admin-contract/Screen.tsx:441`, `:503`, `:520` | Each keystroke re-renders up to 20 non-memo `ContractCard`s and `DevCoCostForm`, with a new Set and a tree pass. | `memo(ContractCard)` with id-taking stable callbacks; `useMemo` the selected Set. | Small. | L/L | P |
| FE-AD-09 | P3 (deferred) | `admin-cost/Screen.tsx:376`, `:408`, `:475` | `DevexCostTree` and `OpexContractTable` re-render on discrete clicks only; typing is already local to the drawers. | Only if a profile shows more than 16 ms. | Small. | L/L | RP |

## G. Checked and fine (no change)

- **Shell:** the `SessionProvider` value is memoised on primitives; the router is created once; `useCurrentUser`
  renders once; `LeftNav`'s `navItemsFor` returns constants; `CanvasFields`, `Fields` and `CommandBar` have no
  render-time cost worth memoising.
- **Overview:** `ProjectGridRow` is memoised with stable props; rows are keyed by id; `keepPreviousData` is used.
- **Generators (D143):** sections and all 8 panels are memoised; handlers are stable; panels are lazy with idle preload.
- **Revenues (D136/D146):** `ContractCardFields` and `VolumeRow` are memoised with stable props.
- **OPEX / Land Lease (OPT-26):** every card prop stays stable during panel typing; folded cards compute nothing.
- **Add Cost from Table:** `SpreadSheetComp` is memoised with stable props; rows are windowed; per-edit row reuse;
  `alreadyShown` skips library reloads.
- **CAPEX:** `PcfGrid` repaint deps are correct after OPT-25; `commentFlags` and `contractIds` are memoised.
- **Admin:** form state is local in 5 of the 6 panel types; folded accordions unmount; derivations are memoised per
  dataset.
- **Everywhere:** no component is defined inside another component (inner helpers are called as functions); no index
  keys on reorderable lists. One static `taskRows` table uses index keys, which is fine.
- **Virtualisation:** no list outside the Add Cost sheet, which is already windowed, is large enough to need it. The
  largest are Overview at 200 memoised rows, gates at 100–250, and the municipality listbox (FE-P1-02b).
