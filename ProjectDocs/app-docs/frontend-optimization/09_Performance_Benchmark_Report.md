# 09 — Performance benchmark report

Stage 3, 25 Nov 2026. Baseline = `ed4354e` (`origin/RounakDev1`). Optimised = the working tree of
`feature/frontend-performance-optimization` (uncommitted).

## How each number was measured

| Metric | Method | Comparable? |
|---|---|---|
| Bundle bytes | `vite build` of both trees, same machine and same `node_modules`. The baseline was built in a temporary worktree of `ed4354e`, removed afterwards. `npm run bundle:report` (startup) and a closure script (per screen) give minified bytes and `gzip -9` bytes. Sizes are KiB (1,024) | Yes, exact |
| Render counts | jsdom + React 19 dev build. Each optimised component reports its renders through `probeRender` (`platform/renderProbe.ts`). Each test was written first, run against the old code (where it failed), and kept as a guard | Yes, deterministic counts; not milliseconds |
| Commit counts | React `<Profiler>` in jsdom (OPEX) | Yes |
| Milliseconds, heap, long tasks, time to usable screen | **Not measured.** They need the signed-in Power Apps host (`01` §6) | Owner's DEV routine, `07` §4 |

## 1. Startup (what the browser fetches before any screen)

| | Baseline | Optimised | Change |
|---|---|---|---|
| Startup JavaScript, minified | 1,319.9 KiB (10 files) | **1,018.3 KiB** (7 files) | **−22.9 %** |
| Startup JavaScript, gzip | 373.9 KiB | **297.9 KiB** | **−20.3 %** |
| `index` (entry) | 480.4 / 152.9 | 433.3 / 140.0 | −47 KiB min: barrel members without side effects (FE-SH-04) |
| `fluent` (preloaded) | 742.3 / 194.3 | 499.4 / 135.4 | −243 KiB min: start-up packages only (FE-SH-05) |

Fluent packages used only by some screens now load with those screens. Examples are the date picker calendar (`DatePicker`
chunk, 76.8 / 20.0 KiB), tabs, tags, tables, avatars and accordions.

## 2. First visit to each screen (startup + everything the screen loads), gzip

Each row is a cold first visit to that screen: the startup files plus the screen's chunk and all its static imports. This
is the honest per-screen figure. Bytes that left the startup chunk are now counted against the screens that need them.

| Screen | Before (min / gzip KiB) | After (min / gzip KiB) | Gzip change |
|---|---|---|---|
| Admin CAPEX Accounts | 1,383 / 398 | 1,159 / 349 | −12 % |
| Admin Contracts | 1,410 / 404 | 1,166 / 347 | −14 % (FE-AD-07: no longer loads Cost Contracts) |
| Admin Costs | 1,433 / 413 | 1,204 / 362 | −12 % |
| Admin Check List Settings | 1,423 / 411 | 1,227 / 372 | −10 % |
| Admin Project Gates | 1,443 / 417 | 1,217 / 367 | −12 % |
| Admin Milestones | 1,357 / 388 | 1,098 / 330 | −15 % |
| **Add Cost from Table** | 1,985 / 578 | 1,405 / 423 | **−27 %** (FE-C1-01: the screen's own chunk 351.5 → under 75 KiB) |
| CAPEX / DEVEX | 1,721 / 499 | 1,447 / 432 | −13 % |
| Contracts | 1,602 / 462 | 1,394 / 414 | −10 % |
| OPEX / Land Lease | 1,666 / 483 | 1,462 / 435 | −10 % |
| Cluster Check List | 1,503 / 430 | 1,300 / 383 | −11 % |
| **Finance** | 1,780 / 508 | 1,379 / 405 | **−20 %** (FE-P2-05: no Revenues, Generators or Land Lease modules) |
| General Data | 1,575 / 454 | 1,382 / 411 | −9 % (the 1.7 MB map chunk is excluded both times; FE-P1-01 makes it start earlier, not smaller) |
| Generators | 1,629 / 470 | 1,372 / 410 | −13 % |
| Grid Operator | 1,445 / 413 | 1,187 / 350 | −15 % |
| Milestones | 1,634 / 472 | 1,428 / 424 | −10 % |
| Planning | 1,455 / 415 | 1,332 / 391 | −6 % |
| **Production** | 1,594 / 456 | 1,288 / 381 | **−16 %** (FE-P2-06: no Land Lease module) |
| Project Overview (landing) | 1,423 / 409 | 1,178 / 353 | −14 % |
| Revenues | 1,622 / 465 | 1,482 / 437 | −6 % |
| Team | 1,378 / 394 | 1,110 / 332 | −16 % |

Every screen's first visit is smaller: by 6 % to 27 % gzip.

Chunk count went from 113 to 146 files, all small. They are fetched in parallel over HTTP/2 by the existing
`modulepreload` / `__vitePreload` mechanism.

## 3. Render counts (from the tests that guard them)

| Interaction | Before | After | Test |
|---|---|---|---|
| Add Cost from Table: equal session project refetched while edited | grid re-seeded, **edits lost**, Save sent 0 changed rows | 0 re-seeds, edit saved | UT-ACIDENT-001…003 |
| Any query: unchanged refetch of data holding `Date`s | new object, so every consumer re-rendered | same object, no re-render | UT-QSHARE-001, 007 |
| Report panel open (from the header) | active screen's routes re-rendered | 0 | UT-SHELLRENDER-002 |
| Project Overview visit: command bar mounts | 2 (in place, then in the header) | 1 | UT-SHELLRENDER-004 |
| Admin Gates: one task status-pill click | 2 full-table renders (every gate, task and add row) | the clicked row only | UT-ADGATE-FE-001…004 |
| Admin Gates: open and cancel the gate editor | 2 full-table renders | 0 | UT-ADGATE-FE-003 |
| Admin Check List Settings: 8 keystrokes in the drawer (2 clusters open) | 16 task-table renders | 0 | UT-ADCHK-FE-001 |
| Admin Check List Settings: open and cancel the status confirmation | 4 task-table renders | 0 | UT-ADCHK-FE-002 |
| Admin Contracts: 5 keystrokes in the edit panel | 10 card + 5 tree renders | 0 | UT-ADCONTR-FE-003 |
| Contracts: 3 keystrokes, 3 cards open | 3 picker + 9 card-body renders | 0 | UT-CONTRACTS-FE-001…004 |
| Land Lease: one fold click (9 cards) | 9 card renders | 1 | UT-LEASE-FE-001 |
| OPEX: mount and every O&M / Other rail switch | 2 commits | 1 | UT-OPEX-FE-001, 002 |
| Add Cost from Table: full grid read-backs per load | 2 | 1 | UT-ADDCOST-FE-001…003, 010 |
| Finance: one repayment keystroke (12-year schedule) | 12 rows + the gallery | 1 row, 0 gallery | UT-FIN-FE-002 |
| Finance: Equity panel keystroke | gallery renders | 0 | UT-FIN-FE-001 |
| Finance: seed effect over 3 keystrokes | 3 runs | 0 | UT-FIN-FE-004 |
| Production: keystroke in another field | 12 season + 15 negative-price rows | 0 | UT-PROD-FE-001…003 |
| Production: 2nd and later month edits / a negative-price edit | 12 / 15 rows | 1 / 1 | UT-PROD-FE-002, 003 |
| Check List: 3 comment keystrokes | 3 table + 3 stepper renders | 0 | UT-CHK-FE-001, 002 |
| General Data: 2 keystrokes, 2,000 municipalities | 2 option-list rebuilds | 0 | UT-GDATA-FE-001 |
| Azure Maps token, no map mounted, 4 h | 3 flow calls | 1 | UT-MAPTOKEN-FE-001…003 |
| CAPEX grid unmount with a focused comment dot | 1 tooltip left on screen | 0 | UT-CAPEX-FE-001, 002 |

## 4. Not measured here

These need the owner's DEV routine (`07` §4):
- commit milliseconds per keystroke;
- browser heap and memory growth;
- long tasks;
- time to a usable screen inside the Power Apps host;
- navigation timing.

Render counts and bytes are proxies, and both moved in the right direction everywhere. The magnitude in milliseconds is
not claimed.
