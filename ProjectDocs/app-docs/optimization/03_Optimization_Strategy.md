# 03 — Optimization strategy

Stage 2. Companion to `02` (what) and `04` (when). This document is the "how": the principle, the target architecture and the patterns.

## 1. Principle

The app does **less unnecessary work** while keeping every business result identical. For this codebase that means, in order of payoff:

1. **Fewer and shallower round trips** — a request costs 1.2–1.9 s; CPU is almost never the constraint (`02` header).
2. **Reload what was written, nothing else.**
3. **Read each reference table once** and give every screen a view of it.
4. **Do not re-render or rebuild a 60k-row grid for a keystroke.**
5. **One definition per helper** (CONVENTIONS rule 17) — only where semantics are provably identical.

Not in scope: re-architecting state management, replacing TanStack Query, new abstractions beyond what the patterns below name, the vendored PCF renderer's internals, and any canvas-parity behaviour.

## 2. Target architecture (what changes, in the app's own terms)

The existing layering stays: `rules.ts` pure → `hooks.ts` TanStack wiring → `Screen.tsx` composition → `data/` I/O. Nothing is moved across layers. The additions are small and each has an existing precedent in the repo:

| Change | Today | Target | Precedent in repo |
|---|---|---|---|
| Shared reference reads | Countries ×5 keys, currencies ×5 readers, chart of accounts ×5 loaders, 3 project-state stragglers | One `queryOptions` per table with the union select; each screen takes a `select` view; single-row lookups use `ensureQueryData` | `data/projectStates.ts` (D159 §5, `UT-PSTATES-*`), `data/countries.ts` |
| Chunked id reads | `Promise.all(chunk(ids).map(fetchAll))` ×19, no cap | `readByIds(column, ids, opts, limit)` in `data/client.ts`/`odata.ts`: chunk 40, `mapLimit` 4–8, results flattened in input order | `mapLimit` (`concurrency.ts`), `adminCapexAccounts.ts:373`, `finance.ts:193` |
| Cost book scope | `loadCostBook(id, undefined)` loads accounts → lines → OPEX ‖ Land Lease | `loadCostBook` takes an explicit scope: `category`, or `periods: "opex"`; independent reads start together | `category`-scoped branch already skips periods (`costBook.ts:1236-1242`) |
| Project loader | One 2-round-trip load for every route | PM: row-only loader (+ formatted-value annotation for the state name); Cost: full load; Cost screens read country/technology from the session project | General Data already reads the annotation |
| Reload scope | `*All` invalidation after Team, Grid Operator, Planning, CAPEX paid/comment writes | Per-job `invalidate` / `staleOnly` listing exactly the keys the job wrote | Finance `perf.ts reloadKeys`, Revenues `reload.ts`, Generators `KIND_TABLES`/`withReload` |
| Sequential write loops | `for … await` over rows (Land Lease, OPEX cascade, admin gates) | Independent tiers through `mapLimit`/`together()`; dependent tiers stay ordered; first failure reported by index | `executePlan` `together()`, `adminCapexAccounts.ts:398-406`, `PRODUCTION_GENERATION_WAVES` |
| Render path | Fresh arrays/objects per render defeat memos; cards re-derive per keystroke | `useMemo` on derived collections, explicit deps for `PcfGrid`, `React.memo` on cards with stable props, warnings computed once per card | Generators D143 (`useMemo`, stable callbacks, `useExpandedIds`), Revenues `VolumeRow` memo (D146) |
| Shared helpers | `dateOnly` ×7, row coercers ×30, `groupBy` ×25, `startsWithStandard` ×5 … | `domain/dates.ts` (`dateOnly`), `data/rowValues.ts`, `domain/` `groupBy`, a standard predicate beside `standardValue.ts`; re-export from the old home so no importer changes | D159 §6 (`addMonths`, `dateOnlyOf`) |

**No new framework, store, cache library or service.** The only new files are `data/rowValues.ts` and (if the helper is not added to an existing file) a small `readByIds` module. Everything else edits existing files.

## 3. Optimization patterns (the recipe for each class of finding)

1. **Waterfall → wave.** Draw the dependency graph of a load. Start every read whose inputs are known at t=0. Keep a read second only if it needs a row from the first. Done when the number of sequential stages equals the longest true dependency chain. *Proof:* a test with a fake client that records start order and asserts the independent reads start in the same tick (the `UT-ACBULK-031…038` concurrent-order tests are the template).
2. **Duplicate read → shared view.** Add the union `select` once, give each caller a `select` (TanStack) that reproduces its filter and **sort**, delete the old key, update the admin invalidation lists. *Proof:* one request in the `[VSB]` trace; unit test that each view equals the old function's output on a fixture (`UT-PSTATES` style).
3. **Over-invalidation → per-job reload.** List the tables a job writes (the plan already knows). Invalidate only the keys that read those tables. Add the safety-net test Generators has (`KIND_TABLES` vs `withReload`): a job that writes a table must invalidate every key that reads it.
4. **Sequential loop → bounded parallel.** `mapLimit` at the repo's existing widths (reads 4–8, writes 8/16; admin flow-triggering writes stay at 4). Preserve: result order, first-failure semantics (report by index), `RecordGoneError` attribution, trace lines. Only when the rows are provably independent.
5. **Over-wide read → narrow read.** `$select` only the columns consumed; `maxPageSize` 5000 only where the select is narrow; server filter instead of JS filter (`lookupIn`). Never raise the global page size.
6. **Render recomputation → memoised derivation.** Memoise at the highest stable owner; give a memo stable inputs; never put a fresh array/object literal in a dependency. Prove with a render-count or recompute-count test (`Screen.perf.test.tsx`, `UT-ADDPERF-002/003` count element reads — machine-independent), not wall-clock alone.
7. **Duplicate helper → one home.** Merge only if the two functions agree on the same inputs, the same rounding, the same null/NaN/empty handling and the same boundaries. Write the agreement as a **differential test** (both implementations over a table of edge values) before deleting either. Families that differ are listed in `02` §D and stay as they are.

## 4. Rules that keep behaviour identical (from the approved governance and the repo's conventions)

- **Business results do not move.** Rounding, ordering (`order, number, name`), null/blank handling, validation order and message text (`MSG`/`ADDCOST_MSG`, rule 7) are frozen. Any change here is a decision (`02` §D), recorded as `D160+` in `02-OPEN-DECISIONS.md` with a `…CanvasParity` twin where numbers are involved (rule 8).
- **Safety flows stay.** The ownership re-check, pre-write existence reads, `RowsGoneError`, Wirmighausen `identityRoundTripFailures`, `CANVAS_PARITY_DELETION`, `DEFER_*_DELETES`, `BULK_SAVE`, `SKIP_UNCHANGED_COSTS`, D157's loud cap, rule 4 (`OwningBusinessUnit@odata.bind`) and rule 14 (`deleteRecord`) are untouched. Pre-write reads that look redundant are deliberate unless a scan proved otherwise and the batch says so.
- **Every new/changed control keeps `aria-label` + `data-testid`** (rule 16); `UT-LABELS`/`UT-CANVASID` stay green. Moves of existing controls must not change their ids.
- **Tracing stays complete** (rule 23): any new or changed call goes through `data/client.ts` / `loggedCall`, and a test pins the `[VSB]` line. Batching a read changes the number of lines — the tests that pin lines are updated deliberately, not loosened.
- **Reuse over copy** (rule 17); search first; new helpers go to the named homes.
- **Docs** — every improvement over the canvas or earlier build gets an entry in `13-CODE-APP-IMPROVEMENTS-OVER-CANVAS.md` before any commit (AGENT-GUIDE item 5).

## 5. What "measured" means here

Nothing in `02` is measured. Stage 3 establishes baselines **before** a batch changes anything, using only instruments the repo already has, so numbers are reproducible:

| Metric | Instrument | Used for |
|---|---|---|
| Requests and sequential stages per user action | the `[VSB]` ACTION/HTTP/DATA trace (`platform/requestLog.ts`), counted in a vitest run against a fake SDK (`test/guardedSdkFake.ts`, `UT-ACSHEET-BULK-*` style) | all async/read/write findings (primary evidence) |
| Recomputation count (not time) | element-read counters on reference arrays as in `UT-ADDPERF-002/003`; render counters in jsdom (`Screen.perf.test.tsx`, `hooks.perf.test.tsx`) | render-path findings, algorithm findings |
| CPU time | the existing `*.bench.test.ts` / `*.perf.test.ts` suites run with `--reporter=verbose` (e.g. `prepare.bench.test.ts`, `checklistVisit.bench.test.tsx`, `rules.perf.test.ts`), plus new benches where none exist | calculation/transform findings; reported with machine noise caveats |
| Real wall-clock through the host | the `[VSB]` timings from a signed-in `pa app run` session on DEV, owner-run | the only truthful latency number; **requires the owner** (I cannot sign in) |

Reporting rule: a benefit is labelled **measured** only if produced by one of the first three on this machine in the repo's own tests; wall-clock numbers
from DEV are labelled **owner-measured**; everything else stays **estimated**. If a gain cannot be reliably measured, `06` says so and does not claim it.

## 6. Why this order of work

Value is concentrated in a few places and the files overlap. So: (1) shared foundations that others consume, (2) the Cost read path (OPT-04/05/06/07c/08/12 live in `costBook.ts` + `useCostBook.ts` and cannot be edited by two agents), (3) the Cost write path, then (4) four disjoint areas in parallel (Cost UI, PM, Generators/Check List, Admin), and (5) the repo-wide dedupe last because it touches the most files. Details and file-lock rules are in `04`.
