# 10 — Final QA and optimization report

25 Nov 2026. Branch `feature/frontend-performance-optimization` (from `origin/RounakDev1` at `ed4354e`).
**Uncommitted, unpushed, not run on DEV, not product-approved.**

## 1. Gates

| Gate | Result |
|---|---|
| `npm run verify` (final, after the review fixes) | **exit 0** |
| `check:power` | 96 registered, 0 problems |
| Typecheck | clean |
| Lint | no new warnings in changed files (the one `Providers.tsx` warning predates this change) |
| Control-label gate (UT-LABELS) | green |
| Canvas-identity gate (UT-CANVASID) | green |
| Full suite | **428 files passed (1 skipped), 7,478 tests passed**, 15 skipped, 3 todo. D160 §13 recorded 406 files and 7,405 tests on `ed4354e` |
| Build | green |
| knip (`PARITY_SCREEN=land-lease`) | 41 unused files, 40 of them in HEAD already. The one new file (`scripts/bundle-report.mjs`) is now an npm script (`bundle:report`). New unused export: `canSavePaymentTarget` (kept, D162 §4). The 4 duplicate exports predate this change |
| Duplicate-file check | no new byte-identical files (the moves were re-exported, not copied) |
| Line endings | no file switched between CRLF and LF |
| Dependencies | none added or changed; `package-lock.json` untouched |

## 2. Independent review (B6)

A reviewer who wrote none of the code read the full diff against the standing rules. It found **no blockers**:

| # | Severity | Finding | Outcome |
|---|---|---|---|
| 1 | should-fix | `useHasTracedError` was notified synchronously. A component that traces while it renders (`QueryStates` → `userErrorText`) made React update `App` mid-render, a dev console error that the DEV smoke test forbids | **Fixed.** The notification is deferred to a microtask. UT-SHELLRENDER-006 fails on the old hook and passes now |
| 2 | should-fix | Add Cost from Table: a pending 200 ms read-back from an edit could fire between a reload's two commits and put the old grid's edits back into `currentRows` | **Fixed.** The `[loaded]` effect clears the pending read-back |
| 3 | nit | UT-ADDCOST-FE-001 is circular. The claim behind FE-C1-04 (a decorated grid reads back as `roundTripped`) was not pinned directly | **Fixed:** UT-ADDCOST-FE-010 |
| 4 | nit (unverified) | The narrower `fluent` chunk could create circular chunk imports | Checked: the final build prints no circular-chunk warning, and all 428 test files pass. A browser load of `dist/` is part of the DEV smoke test |
| 5 | nit | The Check List Settings drawer keeps its values while it slides closed | Accepted; recorded in D162 §4 |
| 6 | info | Behaviour changes outside the approved four: CA-31, Azure Maps token, Grid Operator timer, CAPEX tooltip, Finance seed effect | All recorded in D162 and file 13 §1.6 |

The reviewer also confirmed:
- the structural sharing is equal to TanStack's apart from the Date rule;
- the moved modules are verbatim, with no second copy;
- `aria-label` / `data-testid` values are identical in the restructured screens;
- save payloads and write order are unchanged;
- no hook runs after an early return.

## 3. Completed improvements

See `08` for the per-finding table and `09` for the numbers. In brief:

| Area | What changed |
|---|---|
| Correctness | CA-31: unsaved Add Cost edits survive a project refetch |
| Startup | Start-up JavaScript −20 % gzip (374 → 298 KiB) |
| First screen visits | 6–27 % smaller for every screen |
| Rendering | Panel typing no longer redraws the screen behind it on Finance, Production, Check List, Contracts and the two admin screens. The Gates grid redraws one row per click. Land Lease and OPEX folding is cheaper. Unchanged refetches re-render nothing |
| Hygiene | Azure Maps token timer, Grid Operator timer, CAPEX tooltip, `[VSB]` scopes on cancel, header error icon and report details |
| Test fidelity | The Add Cost grid tests now run on the same react-spreadsheet build and aliases as the browser |

## 4. Deferred, withdrawn and skipped

| Item | Reason |
|---|---|
| FE-SH-03 CAPEX remount | **Withdrawn.** It does not happen (React unwraps the unkeyed Fragment); pinned by UT-CAPEXROUTE-FE-001…003 |
| FE-P1-04 Overview URL debounce (D-5) | **Skipped.** Not behaviour-identical: existing tests read the URL right after typing, and a reload inside the pause would lose characters |
| #37–#50 in `06` | Deferred with reasons: profiling needed, more risk than gain, vendor patch, or a product decision (FE-SH-09) |

## 5. Remaining issues and limits

- **Not measured in the real host:** commit milliseconds, heap, long tasks and time to a usable screen (`01` §6). The
  owner's DEV routine is in `07` §4.
- **CA-31 is confirmed by tests, not yet live.** Check it on DEV: edit the sheet, leave the tab for more than 5 min,
  return.
- **E2E parity suite:** not run. Asked on 25 Nov 2026 (AGENT-GUIDE item 6); **the owner chose to skip it**. The DEV smoke test (`07` §4) stands in for it.
- **Commits:** the owner chose not to commit yet (25 Nov 2026). Everything stays uncommitted for the owner's review of the diff.
- **Check List `ClusterActions`** still re-renders per comment keystroke. It is small and was not in scope.
- **The test seam is in production code.** `probeRender` calls in the optimised components cost one property read per
  render while no test is listening.
