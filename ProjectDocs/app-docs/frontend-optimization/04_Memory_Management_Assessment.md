# 04 — Memory management assessment

Stage 1, 25 Nov 2026. Optimisation area 5. Same columns and conventions as `02`.

**Overall: no real memory leak was found.** Listeners, observers, timers and the Azure Maps instance are cleaned up. The
module caches are bounded. React 19 makes a `setState` after unmount a no-op that holds no subscription, so the async
continuations that outlive a screen only hold small closures until they settle. The findings below are hygiene items and
one bounded log-scope growth.

## 1. Findings

| ID | Pri | File:line | Current behaviour → issue | Recommendation | Expected benefit | Cx/R | Conf |
|---|---|---|---|---|---|---|---|
| FE-SH-07 | P3 | `app/queryLog.ts:44-55`; `platform/requestLog.ts:62`, `:285-300` | A `Load` action scope opens on `fetch` and closes only on `success` or `error`. A fetch cancelled with `revert` (the `cancelQueries` default, used in 4 places) dispatches `setState`, and query removal is not handled. The scope stays open, later HTTP/DATA lines are counted into it and tagged with its id, and it closes only if that same query settles again. | Also end the scope on `setState` when `fetchStatus === "idle"`, and on `removed`, marked "cancelled". The line format is part of the D74 contract, so record any change there. | Bounded `scopes`; correct `[aN]` tags and ACTION summaries. | L/L | C |
| FE-P1-05 | P3 | `platform/azureMapsToken.ts:113-123` | The proactive SAS-token refresh timer is module-level and re-arms itself after each fetch. Once General Data has been opened, the tab keeps calling the "Get Azure Maps SAS Token" flow every (token lifetime − 11 min) for the rest of the session, also on Cost screens. | Arm the timer only while a map is mounted (a ref count from `ProjectMap`'s effect), or drop the proactive refresh (`getToken` already fetches on demand). | No background flow runs or timer without a map on screen. | L/L | C |
| FE-P2-08 | P3 | `grid-operator/Screen.tsx:231-232` | `window.setTimeout(() => setFlash(null), 1000)` has no cleanup, and `setFlash(writes.success ?? …)` reads a stale closure. | The Planning pattern: an effect keyed on `flash` with `clearTimeout`, and `setFlash(SAVE_SUCCESS)`. | Hygiene. | L/L | C |
| FE-C1-09 | P3 | `capex-costs/pcf/ui/GridRenderer.js:1025-1054`, `:1459-1466` | The name-dot tooltip is appended to `document.body`, and `destroy()` does not hide it. If the grid unmounts while a dot has keyboard focus (Tab, then Back), the tooltip `div` stays over the next screen. | Call `this.hideCommentTooltip()` in `destroy()`. The vendored file already carries CA-16 edits. | No stranded DOM node. | L/L | C (rare) |

## 2. Resource lifecycle: checked and fine

| Resource | Where | Verdict |
|---|---|---|
| Azure Maps instance | `general-data/ProjectMap.tsx` | Created once (`[]` effect). `map.dispose()` on unmount removes handlers, sources, layers and controls; refs are nulled; the follow-pin `setTimeout` is cleared |
| PCF grid | `capex-costs/PcfGrid.tsx:140`, `GridRenderer.js` | `ResizeObserver`s are disconnected; rAF cancelled; `PCF_RE_RENDER` listener removed; `grid.destroy()` removes both dropdowns and their `window` click listeners; `menu.destroy()`; `replaceChildren`. The only gap is FE-C1-09 |
| Add Cost sheet | `spreadsheet/SpreadSheet.tsx` | Scroll, resize, observer and paste listeners are removed; the read-back timer is cleared on unmount; token effects are StrictMode-safe |
| Global listeners | `platform/globalErrors.ts`, `UnsavedChangesGuard`, `beforeUnload`, `useMediaQuery` | Installed once behind a guard, or ref-counted and removed |
| Timers | `useDebouncedValue`, `generatorsWarmup`, Planning flash, Overview prefetch | Cleared. Exceptions: FE-P2-08, FE-P1-05 |
| Polling | Check List `waitForClusterTransition` | Not an interval: an awaited loop inside a write job, at most 20 × 1.5 s, sets no React state |
| Module caches | telemetry ring (200), `requestLog` recent (5) and batches (flushed), `personCache` / `checklistPeople` (TTL, bounded by people seen), `sharedRead` (1), `generatorsWarmup.warmed` (1 per project), Intl pools (1 per locale), `data/client.ts` token cache (cleared on writes to the table), `persistedReference` (IndexedDB, keyed, dropped per build) | All bounded. The token cache can grow during a long, write-free filtering session, but each entry is a small token array |
| Object URLs | none created without revoke | — |
| Async after unmount | Finance seeds, Revenues `saveContract`, Team/Production saves, CAPEX `persist` | React 19 no-ops. Failures already go to the toast (CA-15). Not worth `AbortController` plumbing |

## 3. What could not be validated here

No heap snapshots or detached-DOM checks were possible (no signed-in browser; `01` §6). To be confirmed in a browser:

- Whether `atlas.Map.dispose()` releases its WebGL context after repeated General Data ↔ other screen navigation.
  Browsers cap live contexts at about 16. Check `chrome://gpu` or a heap snapshot after 20 round trips.
- Heap growth over a long Cost session (repeated CAPEX ↔ Add Cost from Table, which today remounts CAPEX, FE-SH-03).

The suggested routine for the DEV smoke test is in `07` §4.
