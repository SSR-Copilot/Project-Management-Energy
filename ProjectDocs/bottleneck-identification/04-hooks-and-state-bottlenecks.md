# 04 — Hooks and state bottlenecks (cross-cutting)

Stage 1 audit, 26 Nov 2026. Read-only; base `dde9e92`. Register: `_register/RND.md` (rows tagged `[HOOKS/STATE]` here, `[RENDER]` in
`03-frontend-rendering-bottlenecks.md`). Paths relative to `ProjectCosts-CodeApp/`. MEASURED / DERIVED / ESTIMATED as in `03`.

## 1. Scope inspected

Read: `src/app/{Providers,SessionContext,queryLog,queryStructuralSharing,useCurrentUser,useHasTracedError,bootPrefetch (header),
generatorsWarmup,pmScreenPrefetch (header)}`, `src/data/{keys,adminQueryPresets,usePlanWrite (state and run parts),
persistedReference (header)}`, `src/features/shared/{useDebouncedValue,usePanelState,useBusyRunner}`, `src/components/
{useQueryHealth,useStableCallback,discardGuard,FormPanel,QueryStates,useNotify}`, `src/platform/{requestLog,telemetry,
userMessage}`, `src/features/pm/{project-main/hooks.ts, general-data/hooks.ts, team/hooks.ts (search)}`, the effect bodies listed in
§3, and `src/features/cost/costing/useCostBook.ts` (query definitions only). Counted patterns by grep over all non-test source.

Not read in depth: the `data/*` read paths, the other screens' `hooks.ts`, and the bodies of the large screens; those belong to the
network and per-screen agents. Prior programme: D162 `frontend-optimization/03_State_And_Hooks_Assessment.md` and `08`.

## 2. State ownership (current)

| State | Owner | Notes |
|---|---|---|
| Session, env variables, session project | `SessionProvider` (3 queries) | Value memoised on primitives and query data; project identity stable since D162 FE-SH-01. `useSession()` has 42 consumers |
| Server data | TanStack Query, per-screen `hooks.ts` | 139 `useQuery`; `select` option unused; `structuralSharing` global (RND-03); `gcTime` unset (RND-10) |
| Overview criteria | the URL (`useCriteria`) | One router navigation per keystroke (RND-01) |
| Form drafts | each `Screen.tsx`, except admin panels and Generators panels which keep them local | Cost of the pattern is small except where many Fluent controls repeat (`03` §5) |
| Panels, busy, writes | `usePanelState`, `useBusyRunner`, `usePlanWrite` | All return a fresh object per render (RND-12) |
| Trace buffer and last error | module store `platform/telemetry.ts` (ring of 200) | Read through `useSyncExternalStore` since D162 FE-SH-08 |
| Debounced search terms | `useDebouncedValue` | Used by 6 sites; the municipality search is the one typed search without it (RND-02) |

No duplicated global store, no prop drilling deeper than screen to panel, no unrelated state bundled in one context.

## 3. Effects audit (47 `useEffect`, 13 `useLayoutEffect` in non-test source)

Listed by file and checked for dependency problems and effect cascades.

| Group | Sites | Verdict |
|---|---|---|
| Latest-ref assignment (`useStableCallback`, `useBusyRunner`, `admin-contract/Screen.tsx:201`, `admin-default-checklists/Screen.tsx:356`, `contracts/Screen.tsx:358`, `generators/Screen.tsx:181`) | 12 | Correct; no deps array or exact deps; no cascade |
| Timers and listeners with cleanup (`useDebouncedValue`, `usePlanWrite` success timer, `planning/Screen.tsx:519`, `discardGuard.useBeforeUnload`, `UnsavedChangesGuard`, `generatorsWarmup`, `ReorderItems`) | 10 | Cleaned up |
| One-shot effects (`general-data/Screen.tsx:370` map chunk start, `generators/Screen.tsx:183` panel preload) | 4 | Fine |
| App Insights start (`SessionContext.tsx:87`) | 1 | Fires on `envQuery` success/error only |
| Prefetch next page (`project-main/hooks.ts:189`) | 1 | Timer re-armed per page change; cleared on cleanup |
| Copying query data into state (`CommentsPanel.tsx:321-330`) | 1 | 5 `setState` calls after commit, one extra panel render per open: RND-11. D162 03 said none existed |
| Per-render effect with no deps (`checklist/Screen.tsx:664`) | 1 | One ref read and a conditional focus; negligible |
| Spreadsheet, PCF grid, map | about 14 | Covered by D162 04 and the screen agents |

No effect loop was found; no effect depends on an unstable object other than FE-P2-09 (fixed, D162). `useLayoutEffect` is used only
for latest-ref assignment (`useStableCallback`) and the grid repaint.

## 4. Findings

### RND-02 (P2, HIGH) — German and French municipality search is not debounced

Path: `general-data/Screen.tsx:699-702` sets `muniSearch` on every keystroke; `useMunicipalitySearch(muniMode, muniSearch, areaName)`
(`general-data/hooks.ts:182-195`) puts `search.trim()` into the query key `qk.germanMunicipalities(area, term)`; `enabled:
germany || france`; `searchGermanMunicipalities` issues `startsWith(state) and contains(municipality | uid)` with `top 5000`
(`data/generalData.ts:288-299`). Focusing the box with an empty term (`startMuniSearch`, `Screen.tsx:674`) also reads the whole Area.

Every other typed search is debounced: `useEntraSearch` (`hooks.ts:148`), `useMemberSearch` (`team/hooks.ts:99`), Overview keyword
and capacity (`project-main/hooks.ts:130-132`), Overview manager search (`:239`), Admin Gates people (`admin-gates-approvals/
hooks.ts:59`). France is only protected by `municipalitySearchIsSuppressed` (under 3 letters); per keystroke after that.

Consequence (DERIVED + MEASURED): up to one Dataverse read per character, each returning up to thousands of rows; each result adds a
cache entry for 5 minutes (no `gcTime`), a structural-sharing pass (5,000 rows = 5.9 ms) and an Option-list rebuild (RND-14: 2,000
Options 83 ms per commit in the dev build). In-flight reads are not cancelled (the SDK read path takes no abort signal).
Fix direction: `useDebouncedValue` on `muniSearch` before it reaches the key (same constant style as `ENTRA_SEARCH_DEBOUNCE_MS`) and
`placeholderData: keepPreviousData`. Behaviour is the same except request timing; the canvas calls the lookup per change too, so
this is a documented improvement, not a regression.

### RND-01 (P2, HIGH, PRIOR FE-P1-04) — the URL as the draft for Overview filters

`useCriteria` writes the URL on every keystroke (`project-main/hooks.ts:43-71`, `setFilter` at `Screen.tsx:983`); the 350 ms
debounce is applied only to the query key afterwards (`:130`). `SessionProvider` and `App` both call `useLocation`, so the whole
shell, the route table and the screen re-render per character. Measured with an AppShell + AppHeader + 200 memo-row table:
5.8-6.9 ms per keystroke vs 0.7-0.8 ms for local state, and the shell rendered on 7 of 7 keystrokes vs 0 of 7. D162 skipped the fix
because two tests read the URL right after typing (UT-OVUI-047, UT-OVFIX-060); it is still open. A smaller test-neutral step is
`memo(AppHeader)` / `memo(AppShell)` with stable handlers (a search-only navigation then stops re-rendering them).

### RND-03 (P3, HIGH) — structural sharing is not free on large payloads

`structuralSharingWithDates` is the global default (`Providers.tsx:32`) and no query opts out. Measured (node, rows of 11 fields,
one a `Date`): 1,000 rows 1.4 ms; 5,000 rows 5.9 ms; 15,000 rows 20.3 ms; 25,000 rows 50.7 ms per unchanged refetch (TanStack's
own `replaceEqualDeep`: 22.3 ms at 15k). It runs on every settled fetch and on every `setQueryData`, which the cost code uses on the
cost book (`useCostBook.ts:197`). Not a regression from D162, but the cost belongs on the list: a query that returns the
25,000-row `fetchAll` cap blocks the main thread for about 50 ms each time. Fix direction: `structuralSharing: false` (or a
version-stamp compare) on the few giant, rarely compared reads.

### RND-09 (P3, CONFIRMED) — a trace written during render

`QueryStates` computes `fatal.text(health.fatalError)` in render (`QueryStates.tsx:45-46`); Admin Gates passes
`userErrorText(error, "load the gate approvals")` (`admin-gates-approvals/Screen.tsx:410`), and `userErrorText` calls `trace("error",
…)` by default (`userMessage.ts:123`). Measured: 10 renders of one error state produced 10 trace entries and 10 `[VSB] ERROR`
console lines (`_bench/RND/rendertrace.bench.test.tsx`). Each trace also goes to the Application Insights sink
(`appInsights.ts:288-299`) and the ring buffer is 200 entries, so a re-rendering error screen can push the original error out of
the "Recent trace" in Report a problem. D162 FE-SH-08 already works around the symptom (notifications deferred to a microtask)
but not the cause. The other `userErrorText` call sites are in event handlers or pass `trace: false`
(`admin-cost/rules.ts:1350`, `project-main/Screen.tsx:568`), so only this site was found.

### RND-10 (P3, SUSPECTED) — `gcTime` never set

No `gcTime` option appears in `src` (grep). The default keeps every key for 5 minutes after its last observer unmounts. Candidates
for large retained payloads: `["add-cost-sheet", projectId, category]`, `["cost-book", projectId, category]`, one entry per typed
municipality term (RND-02), one per Entra search term. Not measured (no heap tooling); the repository's own limits suggest up to 25,000
rows per key (`data/client.ts:55-56`). Fix direction: a short `gcTime` for search keys and screen-scoped giants.

### RND-11 (P3, HIGH) — effect that copies query data into state

`CommentsPanel.tsx:321-330` seeds five pieces of local state from `query.data` in an effect when the panel opens. The first commit
renders the panel empty, the effect then triggers a second full render. D162 reported "no effect copies query data into state"; this
is the exception. Fix direction: key the panel by the contract id and seed with `useState` initialisers, or use the
state-from-props pattern as D162 did for OPEX (FE-C2-05).

### RND-12 (P3, SUSPECTED) — hooks that return a new object each render

`usePanelState` (`:44`), `useBusyRunner` (`:63`), `usePlanWrite` (`:344`), `useQueryHealth` (`:56`) and `useCriteria`
return an object literal built per render. Their members are stable (`useCallback`) but the object is not. Today consumers destructure
or read members, and D162 passed primitives to the memoised rows it added, so nothing is wrong now; the risk is that the next
`memo(Child)` given `panels` or `runner` silently renders on every parent render. `useStableCallback` (96 uses) exists to compensate
for this class of problem.

## 5. Query defaults review (DERIVED)

| Option | Setting | Verdict |
|---|---|---|
| `staleTime` | 30 s default; 108 explicit overrides: 30 min reference data (`REFERENCE_STALE`, 27+ sites), 5 min, 15 min, `Infinity` for session | Reasonable and deliberate; `0` on Contracts and Admin Contracts with `refetchOnMount: "always"` by design (D162 FE-C2-04 note) |
| `refetchOnWindowFocus` | `true` globally; off on a handful of editing queries via `NO_FOCUS_REFETCH` | Intentional (second-user changes); network agent owns the request volume after a long tab absence |
| `retry` / `retryDelay` | 2 retries only when `isRetryable`, jittered delay | Fine |
| `structuralSharing` | Date-aware, global | RND-03 |
| `gcTime` | default 5 min everywhere | RND-10 |
| `select` | unused | Consumers derive with `useMemo`; fine |
| `placeholderData: keepPreviousData` | 5 sites (Overview paging, others) | Absent from the municipality search (RND-02) |
| Query keys | built through `data/keys.ts`; a few inline arrays in `useCostBook.ts` | Hashing cost is negligible (`JSON.stringify` of small keys) |
| Duplicate loading | `useCurrentUser` is shared by header and admin access (one request); session project shared by the gate and the screens | No duplicated reads found in the shared layer |

## 6. Prior items: current status

| Prior | Status |
|---|---|
| FE-SH-01 / FE-C2-04 / FE-C1-02 (CA-31) | Hold: global default present, `Boolean(project)` guard present (`add-costs-from-table/Screen.tsx:162-181`) |
| FE-SH-08 error icon | Holds |
| FE-P2-09 Finance seed effect | Fixed per D162 08; not re-opened |
| FE-C2-05 OPEX fold reset | Fixed (`OpexScreen.tsx:800-813`, state set during render) |
| FE-P1-04 | Open: RND-01 |
| FE-AD-04 admin-milestones dead `useCallback`s | Deferred, not re-checked |

## 7. Checked and found NOT to be bottlenecks

- **Session context churn.** Value deps are primitives and query data; `loading` toggles once per load. Measured indirectly: with
  D162's sharing, a refetch of an equal project does not re-render consumers (UT-QSHARE).
- **Query and mutation log subscription (`attachQueryLog`).** One subscriber per cache; per event it does a map lookup, and at fetch
  start a `JSON.stringify` of a short key. Negligible next to a network call.
- **`requestLog` in Production.** Strings are formatted before `consoleOutput` discards them, a few microseconds per request.
- **`useDebouncedValue`.** The only effect that sets state; it clears its timer on every change.
- **`useNotify` / `AppToaster`.** Memoised; one toaster.
- **Stale closures.** `useStableCallback` assigns the latest function in a layout effect, so handlers called from events see
  current state; no stale closure found in the shared hooks.
- **Hidden-mounted panels.** Not a state problem: the Fluent Drawer unmounts content when closed (`03` §4).
- **No effect cascades** found in the shared layer; `SessionProvider`'s effect fires on env-query state only.

## 8. Limitations

No browser: nothing here is a measured production time, and request counts for RND-02 are DERIVED from the code path, not seen on
the wire. `gcTime` memory impact (RND-10) is reasoning, not a heap measurement. I did not read other screens' `hooks.ts` beyond
those named, so a per-screen duplicate of RND-02 (a typed search that skips the debounce) may exist: the grep for
`useDebouncedValue` shows all typed searches I could identify, and the municipality hook is the only one without it.
