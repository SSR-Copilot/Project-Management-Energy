# 03 — State and hooks assessment

Stage 1, 25 Nov 2026. Optimisation areas 2 (state) and 3 (hooks). Same columns and conventions as `02`.

## 1. State ownership map

| State | Owner | Consumers | Update triggers | Notes |
|---|---|---|---|---|
| Session, environment variables, session project | `SessionProvider` (3 TanStack queries) | 26 modules via `useSession()` | Navigation (the provider reads `useLocation`), project refetch or invalidation | The value is memoised on primitives, but **`project` has a new identity on every refetch** (FE-SH-01) |
| Current user | `useCurrentUser` (`staleTime ∞`) | `App` header | Once per session | Fine |
| Server data per screen | TanStack Query (`hooks.ts`/`queries.ts`) | the screen | Mount, focus after `staleTime`, invalidation | Data that contains `Date`s never keeps its identity (FE-SH-01, FE-C2-04) |
| Overview criteria | the URL (`useCriteria`) | the Overview | Every keystroke in the keyword and capacity boxes | FE-P1-04 |
| Form drafts | each `Screen.tsx`, apart from the admin panels that keep them local | the screen and all its children | Every keystroke | Root cause of FE-P2-01, FE-P1-03, FE-AD-02, FE-C2-02 |
| Command-bar slot | `AppShell` → `CommandSlotProvider` | Overview | Once per mount | FE-SH-06 |
| Telemetry / last error | module store `platform/telemetry.ts` | `App` (header icon), `ReportProblemPanel` | Every trace | Read without a subscription (FE-SH-08) |

There is no duplicated global store, no prop drilling deeper than screen → panel, and no unrelated state bundled in one
context. The recurring pattern is a **lifted form draft**: one keystroke re-renders siblings that do not use the draft.
It is fixed either by keeping the draft local, which 5 admin panels, `CommentsPanel` and the Generators panels already do,
or by memoising the siblings, as the D136/D143/OPT-26 cards already are.

## 2. Findings

| ID | Pri | File:line | Current behaviour → inefficiency (root cause) | Recommendation | Expected benefit | Cx/R | Conf |
|---|---|---|---|---|---|---|---|
| **FE-C1-02** | **P0 (bug)** | `add-costs-from-table/Screen.tsx:154-172`; `SpreadSheet.tsx:461-467`; `app/SessionContext.tsx:76`; `app/Providers.tsx:26`; `data/project.ts:262-283` | The sheet's `loaded` memo depends on the **identity** of `project`, although it only checks that a project exists. `project` holds `Date`s, so each refetch returns a new object even when nothing changed: on window focus after 5 min, or on any `qk.project` invalidation. The memo then rebuilds the whole sheet, `SpreadSheetComp` re-hydrates from the server snapshot, and **the user's unsaved edits are silently discarded**. It also costs a full rebuild, two `Model` builds, a read-back and a validation. The sheet query's own `NO_FOCUS_REFETCH` was added to prevent exactly this, but the project query bypasses it. | Depend on `Boolean(project)` instead of `project` (`years.start` and `years.end` already cover a real date change). Add a reproduction test first: a new but equal `project` must keep `initialGrid`. Log as **CA-31** in `01-BUGS-FOUND.md`. FE-SH-01 removes the trigger app-wide as well. | No silent loss of edits. No full sheet rebuild (tens to over 100 ms at the largest sheet) on a tab return. | L/L | C |
| **FE-SH-01** | P1 | `app/SessionContext.tsx:118-151`; `data/project.ts:262-283`; `app/Providers.tsx:20-30`; TanStack `query-core/utils.js:77-105` | TanStack's `replaceEqualDeep` keeps only plain objects and arrays, so **query data that contains `Date`s gets a new reference on every refetch even when unchanged**. For the session project this means: a new context value → all 26 `useSession` consumers → `App` → `AppRoutes` → the active screen (CAPEX grid host, Contracts, Finance…) re-render. Other affected data: Contracts (FE-C2-04), comments, revenues, and the cost model. | One `structuralSharing` function that compares `Date`s by `getTime()` and otherwise behaves like `replaceEqualDeep`, set as the `QueryClient` default in `Providers.tsx`. Pure, with its own unit tests (equal Dates keep the old reference, a changed Date or field breaks it, arrays and nested objects as before). | An unchanged refetch re-renders nothing. The trigger behind FE-C1-02, FE-C2-04 and part of FE-C2-07 disappears. | L/M (global default; needs tests across all date-bearing queries) | C |
| FE-C2-04 | P1 (via FE-SH-01) | `data/contracts.ts:85`; `contracts/hooks.ts:33-41` | `closingDate` is a `Date`. The contracts query has `staleTime: 0`, refetches on every focus, and so re-renders the whole Contracts screen on every return to the tab, even with unchanged data. It would also defeat FE-C2-02's memo. | Covered by FE-SH-01. A per-query `structuralSharing` is the fallback if the global default is not approved. | Zero re-renders on an unchanged focus refetch. | L/L | C |
| FE-SH-08 | P2 (visible change: confirm) | `features/shared/report-problem/ReportProblemPanel.tsx:37-51`; `App.tsx:169` | The report's `detail` memo is keyed on the session, not on `open`, so "Last error / Recent trace" is a snapshot from the last session change and **usually misses the error that made the user open it**. The header error icon reads `lastError()` during render with no subscription, so it appears only when `App` happens to re-render. | Build `detail` when the panel opens. Read the flag through `useSyncExternalStore` with a boolean snapshot, which re-renders once when it flips. | A correct report and an error icon that appears on time; at most one extra render per session. | L/L | C |
| FE-C1-04 | P2 | `add-costs-from-table/Screen.tsx:188-192`, `:246-253`; `SpreadSheet.tsx:628-631` | On load, the grid's first `onDataChange` triggers a full read-back (`gridToJson` + `outputRowsToSheetRows`) whose result equals `loaded.roundTripped`, which the parent sets anyway. On re-hydration this means two renders and two `validateSheet` passes. | Skip the read-back on the first report. Record `latestGrid` only, since `currentRows` already equals `roundTripped`. Add a test pinning that `currentRows === roundTripped` after load. This is on the path next to the Wirmighausen safety net, so review carefully. | One full read-back per sheet open. | L/M | C (path) |
| FE-C2-05 | P3 | `periods/OpexScreen.tsx:799-811` | An effect resets `openCards` after commit when the mode changes (O&M ↔ Other reuse one instance). Every rail switch and every O&M mount renders twice, the first time with the wrong folds. | Adjust state during render, keyed on `${mode}|${projectId}` (the React-documented pattern). | One full-screen render fewer per switch or mount; possibly no wrong-fold frame. | L/L | C |
| FE-C2-03 | P3 | `contracts/Screen.tsx:844-850`, `:1375-1381`; `rules.ts:1385-1409` | `paymentTargetErrors` and `canSavePaymentTarget` (literally `errors.length === 0`) run with the same arguments on every render, even with the panel closed. This is the same "validated twice" pattern OPT-28 fixed for contracts. | `disabled={… || targetErrors.length > 0}`. Behaviour is identical by definition. | Tiny. | L/L | C |
| FE-P2-09 | P3 | `finance/Screen.tsx:752-781`; `data/usePlanWrite.ts:314` | The seed effect depends on `writes`, a new object every render, so the effect body runs after every commit, including every keystroke. Only the `visited` ref guard keeps it from writing again. | Read `writes.run` through a ref or `useStableCallback`, and drop `writes` from the deps. | Robustness: removes a single point of failure. | L/L | C |
| FE-AD-06 | P3 | `admin-gates-approvals/GateTable.tsx:207-210` | The people-JSON parser cache is recreated whenever `dataset` changes identity (optimistic toggle, rollback, refetch), so every participant string is re-parsed. | Keep the parser in a `useRef` (it is pure per string). | A few ms per toggle. | L/L | P |
| FE-P1-04 (state side) | P2 (gated) | `project-main/hooks.ts:105-110` | `criteria.filter` is re-parsed from the URL per keystroke, so `filter` and `pageKey` change identity each time. | Key the memo on scalar fields; see `02` for the main change. | — | — | C |

## 3. Hooks audit summary

- **`useEffect` (45 in the app):** no effect loops; no effect that copies query data into state. Planning, Grid Operator
  and Milestones use `edited ?? baseline`, while Finance and Revenues set state during render behind a guard. Effects
  with problems: FE-C2-05 (should be state set during render), FE-P2-09 (unstable dep, guarded), and the timers in `04`.
- **`useMemo`:** memos defeated by a non-stable dependency:
  - FE-C1-02, on the `project` identity;
  - FE-C2-06, the fold flag baked into card objects;
  - FE-AD-06, keyed on `dataset` identity.

  A missing memo on a heavy rebuild: FE-P1-02a (5,000 options).
- **`useCallback`:** dead `useCallback`s with unstable deps and no memoised consumer in admin-milestones (FE-AD-04).
  Elsewhere, the missing pieces are stable handlers for children that should become memoised (FE-AD-01, FE-C2-02,
  FE-P1-03, FE-P2-01/02/03). The shared `useStableCallback` (`@/components`) is the tool, and `useCallback` is not.
- **Custom hooks:** `useBusyRunner`, `usePanelState`, `useToggleSet`, `useQueryHealth`, `useDebouncedValue`,
  `useMediaQuery` and `useNotify` are stable and correct. `usePlanWrite` returns a new object per render (FE-P2-09); that
  is acceptable as long as no consumer uses it as an effect dependency.
- **`useLayoutEffect`:** two, both correct "latest ref" uses (admin checklist reorder, `PcfGrid` repaint).
- **`useSyncExternalStore`:** used by the D140 context-selector replacement; proposed for FE-SH-08.
- **Stale closures:** Grid Operator's success flash reads `writes.success` from a stale render (FE-P2-08, `04`). It is
  harmless today because the text is a constant. No other stale closure was found.
