# 06 — Frontend optimisation strategy and prioritised backlog

Stage 2, 25 Nov 2026. Builds on `01`–`05`.

**Approved by the owner on 25 Nov 2026:**
- the scope, #1–#36 as proposed;
- decisions D-1 to D-5, all accepted;
- commits only after review at the end;
- the owner's own uncommitted D160 §13 edit is left out of every commit.

Stage 3 progress: `08`.

## 1. What the audit found

The front end is in better shape than a fresh codebase. Earlier rounds already memoised the heaviest lists, every screen
is lazy, and no memory leak was found. What remains has four recurring root causes:

1. **`Date`s in cached query data defeat TanStack's structural sharing.** An unchanged refetch therefore looks like new
   data, and re-renders the app on every tab return. In one place it **silently discards the user's unsaved Add Cost from
   Table edits** (FE-C1-02, the one P0).
2. **Lifted form drafts.** A keystroke in a side panel re-renders the whole screen behind it: Finance, Check List,
   Contracts, Admin Check List Settings, Production. The fix is the pattern the app already uses elsewhere: a draft local
   to the panel, or memoised siblings with stable handlers (`useStableCallback`).
3. **Non-memoised large tables that receive unstable props.** The admin gates table is redrawn 5–7 times per status-pill
   click.
4. **Startup bundle shape.** Measured: −16 % startup JavaScript from three configuration-level changes. Separately, the
   Add Cost from Table chunk drops from 360 kB to 69 kB because the spreadsheet's formula engine is never used.

## 2. Prioritisation framework

- **P0:** user-visible defect or data loss.
- **P1:** high frequency × high cost: renders of a whole screen or table per keystroke or click, a measured double-digit
  bundle saving, or a cross-cutting root cause.
- **P2:** a clear but smaller or rarer gain.
- **P3:** hygiene, robustness or a marginal gain, done only where it is L/L.
- **Deferred / held:** needs profiling first, carries more risk than its gain, or is a product decision.

## 3. Master backlog (50 findings: 1 P0, 10 P1, 15 P2, 15 P3, 9 deferred or held)

Duplicates were merged: FE-C1-03 into FE-SH-03, and FE-C1-08 into FE-C2-08. FE-C2-04 is resolved by FE-SH-01.

| # | ID | Pri | Category | Area | One line | Cx/R | Gate | Batch |
|---|---|---|---|---|---|---|---|---|
| 1 | FE-C1-02 | **P0** | State (bug) | Add Cost from Table | Unsaved sheet edits are lost when an unchanged project refetches | L/L | — | B1 |
| 2 | FE-SH-01 | P1 | State | App-wide | Date-aware structural sharing as the `QueryClient` default | L/M | **D-1** | B1 |
| 3 | FE-C2-04 | P1 | State | Contracts | Screen re-renders on every focus (resolved by #2) | L/L | via D-1 | B1 |
| 4 | FE-C1-01 | P1 | Bundle | Add Cost from Table | Alias out the unused formula engine: 360 → 69 kB | L/L-M | **D-2** | B2 |
| 5 | FE-SH-04 | P1 | Bundle | Startup | Barrel modules without side effects | L/L-M | — | B2 |
| 6 | FE-SH-05 | P1 | Bundle | Startup | Fluent manual chunk limited to core; with #4 and #5: −16 % startup | M/M | — | B2 |
| 7 | FE-SH-03 | ~~P1~~ withdrawn | Component | CAPEX ↔ Add Cost | ~~CAPEX remounts when the sheet opens and closes~~ **Disproved in Stage 3.** It does not remount (React unwraps the unkeyed Fragment); now pinned by tests, no code change | M/M | D-3 (moot) | B3 |
| 8 | FE-P2-01 | P1 | Rendering | Finance | Panel keystroke re-renders the whole screen: memoised gallery | M/M | — | B4 |
| 9 | FE-P2-02 | P1 | Rendering | Finance | Memoised repayment rows (26–31 per keystroke) | L/L | — | B4 |
| 10 | FE-AD-01 | P1 | Rendering | Admin gates | 5–7 full-table renders per pill click: memoised rows | M/L | — | B5 |
| 11 | FE-AD-02 | P1 | State | Admin checklists | Drawer form kept local; stops redrawing all open tables | M/L-M | — | B5 |
| 12 | FE-SH-02 | P2 | Rendering | Shell | Stable `AppRoutes` element | L/L | — | B1 |
| 13 | FE-SH-06 | P2 | Component | Overview | Command bar mounts twice per visit | L/L | — | B1 |
| 14 | FE-SH-08 | P2 | State | Report a problem | Stale report details; header error icon late | L/L | **D-4** | B1 |
| 15 | FE-P1-01 | P2 | Loading | General Data | Start the map chunk and token in parallel with the reads | L/L | — | B2 |
| 16 | FE-P2-05 | P2 | Bundle | Finance | Stop pulling Revenues and Generators modules | M/L | — | B2 |
| 17 | FE-P2-06 | P2 | Bundle | Production | Stop pulling the Land Lease module | L/L | — | B2 |
| 18 | FE-AD-07 | P2 | Bundle | Admin Contracts | Stop pulling the Cost contracts module | L/L | — | B2 |
| 19 | FE-C1-04 | P2 | Hooks | Add Cost from Table | Redundant first full read-back | L/M | — | B3 |
| 20 | FE-C2-01 | P2 | Rendering | Contracts | `memo(DevCoAccountPicker)` | L/L | — | B3 |
| 21 | FE-C2-02 | P2 | Rendering | Contracts | Memoised card list | M/L | — | B3 |
| 22 | FE-C2-06 | P2 | Rendering | Land Lease | A fold toggle re-renders every card | L/L | — | B3 |
| 23 | FE-P1-02a | P2 | Rendering | General Data | Memoise 5,000 municipality options | L/L | — | B4 |
| 24 | FE-P1-03 | P2 | Rendering | Check List | Memoised task table and stepper | M/L-M | — | B4 |
| 25 | FE-P1-04 | P2 → **skipped** | Rendering/State | Overview | URL write per keystroke: local draft, debounced URL. Not behaviour-identical: UT-OVUI-047 and UT-OVFIX-060 (PO-007) read the URL right after typing, and a reload inside the pause would lose the last characters | M/M | D-5 | B4 |
| 26 | FE-P2-03 | P2 | Rendering | Production | Memoised season and negative-price rows | L-M/L | — | B4 |
| 27 | FE-SH-07 | P3 | Memory | Request log | Cancelled-fetch scopes never close | L/L | — | B1 |
| 28 | FE-C1-09 | P3 | Memory | CAPEX grid | Stranded tooltip node | L/L | — | B3 |
| 29 | FE-C2-03 | P3 | Hooks | Contracts | Payment target validated twice | L/L | — | B3 |
| 30 | FE-C2-05 | P3 | Hooks | OPEX | Fold reset effect: double render | L/L | — | B3 |
| 31 | FE-P1-05 | P3 | Memory | Azure Maps | Token refresh timer outlives the map | L/L | — | B4 |
| 32 | FE-P2-08 | P3 | Memory | Grid Operator | Uncleared flash timer, stale closure | L/L | — | B4 |
| 33 | FE-P2-09 | P3 | Hooks | Finance | Seed effect runs after every commit | L/L | — | B4 |
| 34 | FE-AD-03 | P3 | Rendering | Admin checklists | `memo(TaskTable)` | L/L | — | B5 |
| 35 | FE-AD-05 | P3 | Rendering | Admin Contracts | `memo(ContractCard)` | L/L | — | B5 |
| 36 | FE-AD-06 | P3 | Hooks | Admin gates | People parser survives dataset changes | L/L | — | B5 |
| 37 | FE-C2-07 | P3 | Rendering | OPEX / Land Lease | Selection fan-out to every card | L-M/L-M | — | deferred |
| 38 | FE-C2-08 | P3 | Bundle | Cost | `costRepository` facade chunk graph | M/M | — | deferred |
| 39 | FE-P2-04 | P3 | Rendering | Milestones | DatePicker rows on farmdown keystroke | L-M/L-M | — | deferred |
| 40 | FE-AD-04 | P3 | Hooks | Admin Milestones | Dead `useCallback`s; draft local | L/L | — | deferred |
| 41 | FE-AD-08 | P3 | Loading | Admin | Admin loaders into `screenLoaders` | L/L | — | deferred |
| 42 | FE-SH-09 | Held | Component | Shell | Overlay replaces the shell during a session load | L/M | product | held |
| 43 | FE-C1-05 | Deferred | Rendering | Add Cost from Table | Patch react-spreadsheet's double `Model` build | M/M | — | deferred |
| 44 | FE-C1-06 | Deferred | Rendering | CAPEX grid | Cache the parsed tree per dataset | M/M | profile | deferred |
| 45 | FE-C1-07 | Deferred | Component | CAPEX | Split the edit panel out of the screen | H/M | profile | deferred |
| 46 | FE-C1-10 | Deferred | Rendering | Add Cost from Table | Column-width text cache per font (a few ms per edit) | L/L | profile | deferred |
| 47 | FE-C2-09 | Deferred | Rendering | Land Lease | Allocation dropdown sort (microseconds) | L/L | — | deferred |
| 48 | FE-P1-02b | Deferred | Rendering | General Data | Windowed municipality listbox | M-H/M | profile | deferred |
| 49 | FE-P2-07 | Deferred | Bundle | Finance | Lazy Finance panels | M/M | — | deferred |
| 50 | FE-AD-09 | Deferred | Rendering | Admin Cost | Memoise trees and tables | L/L | profile | deferred |

**Proposed for Stage 3: #1–#36 (36 findings).** Deferred or held: #37–#50 (14), each with its reason in `02`–`05`.

## 4. Decisions needed before Stage 3

| Gate | Item | Question | Recommendation |
|---|---|---|---|
| **D-1** | FE-SH-01 | Make the Date-aware `structuralSharing` the **global** `QueryClient` default, or apply it per query (session project, contracts)? | **Global.** It is one pure function with its own tests and removes the root cause for every Date-bearing query. Per-query is the fallback. |
| **D-2** | FE-C1-01 | Accept the DIVERGENCE: a sheet text cell beginning with "=" shows the text as typed (and saved), instead of an evaluated value such as `#NAME?`. | **Accept.** The sheet saves raw text anyway, so the new display is what is stored. |
| **D-3** | FE-SH-03 | Keep the CAPEX screen mounted under Add Cost from Table. Its expand state, year and filters then survive opening and closing the sheet (canvas-like). | **Accept, after checking D51 §11.19 / CA-13** in Stage 3. If that path relies on the remount, defer it. |
| **D-4** | FE-SH-08 | The header error icon appears as soon as an error is traced, instead of at the next unrelated re-render. | **Accept.** It is the documented intent of the icon. |
| **D-5** | FE-P1-04 | The Overview keyword and capacity boxes keep a local draft and write the URL after the existing typing pause (the URL stays the source of truth). | **Accept**, or defer if Overview should not change before the D41–D46 product approval. |

## 5. Not acted on (observations for the owner)

- **OPEX O&M / Other rail switch.** It reuses one component instance, so selection, banner and busy label carry over,
  and the book is not re-read (the canvas `OnVisible` re-reads on every visit). This is a parity question for D123, not
  performance.
- **Source maps ship in `dist`.** There is no runtime cost; it is a packaging and exposure decision.

## 6. Target architecture (principles, no new libraries)

1. **Server data keeps its identity when unchanged.** This uses one `structuralSharing` at the `QueryClient`. No
   screen-level workarounds.
2. **Form drafts live with the panel that edits them.** Where a draft must stay at screen level (scope prompts, dirty
   guards), the siblings are `memo` components fed by `useStableCallback` handlers and primitive or memoised props.
   Tables render row components, not inline row JSX.
3. **Route elements keep their tree shape across sibling routes** that share a screen.
4. **Startup carries only the shell.** That means core Fluent, a barrel without side effects, and no screen pulling
   another screen's modules.
5. **No `React.memo`, `useMemo` or `useCallback` without a named re-render it prevents.** Every Stage 3 change has a
   render-count test showing it.
6. **Every timer, listener and module-level subscription** is tied to a mounted owner.

No state library, component library or other runtime dependency is introduced.
