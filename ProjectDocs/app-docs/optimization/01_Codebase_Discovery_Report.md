# 01 — Codebase discovery report

Stage 1, 23 Nov 2026. Index of the optimization initiative: `01` discovery · `02` findings register · `03` strategy · `04` roadmap ·
`05` tracker · `06` performance comparison · `07` regression and QA · `08` final summary (`05`–`08` are created at Stage 3).
Status of the initiative: **Stage 1 and Stage 2 complete, awaiting approval. No application code has been modified.**

## 1. What was examined

`ProjectCosts-CodeApp/` on branch `RounakDev1`. **Baseline = the D159 tree.** The scans started at `7216d9a` with 43 uncommitted owner edits
(D157–D159 work: `data/projectStates.ts`, `features/pm/generators/captions.ts` and the `rules.ts` split, hooks/queries edits in admin gates,
generators, project-main, finance, cost) and read that working tree. While they ran, the owner committed D159 (`1033c18`) and merged
`origin/master` (`b976a96`, the current `HEAD`; working tree now clean apart from `.claude/skills/ponytail*` and this folder).
`git diff 1033c18 b976a96 -- ProjectCosts-CodeApp/src` shows the merge changed only `features/admin/admin-cost/` (`ContractPeriodDrawer.tsx`,
`drawerStyles.ts`, `rules.ts` +8 lines, tests) and `styles/canvas.css`. So every finding still applies; **line numbers in `admin-cost/rules.ts`
(S6-10, S6-18) may be off by a few lines** and Stage 3 re-reads each file before editing anyway (`04` §6).

| Area | Files (non-test, non-generated) | Lines | Scanned by |
|---|---|---|---|
| `src/data/` | 70 | 23,671 | S1 (cost), S3 (platform/PM), S4 (generators/checklist/team), S6 (admin) |
| `src/features/cost/` | capex-costs 8.7k, periods 11.2k, contracts 4.2k, add-costs-from-table 3.7k, costing 1.9k | ≈30k | S1, S2 |
| `src/features/pm/` | generators 11.2k, finance 6.6k, checklist 5.5k, revenues 5.4k, general-data 4.3k, project-main 3.2k, production 3.1k, planning 2.7k, milestones 2.7k, grid-operator 1.3k, team 1.2k | ≈47k | S4, S5 |
| `src/features/admin/` | six Application Settings screens | ≈14k | S6 |
| `src/components/`, `domain/`, `theme/` | 55 + 22 + 4 | 7.3k + 2.5k + 0.3k | S7 |
| `src/app/`, `platform/`, `appInsights/` | 14 + 10 + 5 | 3.3k | S3 |
| Excluded | `src/generated/` and `.power/` (pac output, never hand-edited, CONVENTIONS rule 9) | 14k | — |

Tests: 342 test files exist (the docs record 4,304 tests in 157 files at the last verified run; that figure is older than the current tree — prefer a fresh run).
Dependencies relevant to computation: React 19, TanStack Query 5, Fluent UI v9, `react-spreadsheet` (with the D140 `use-context-selector` replacement), `azure-maps-control`, `@microsoft/power-apps` 1.3.1.

Method: seven independent reads, each tracing real call paths (callers by grep, row counts from code and docs), each told the app's standing rules
(`$select` everywhere, server-side filters, `unwrap`, pure `rules.ts`, canvas-parity quirks are product decisions, areas already optimized). Neither names nor keywords were trusted alone.

## 2. Execution architecture (how work actually flows)

1. **Boot** — `app/bootPlan.ts` → `bootPrefetch.ts` (prefetch for `/projects`, `/project/general`, `/project/generators` only) → `SessionContext` (session + `loadProject`, 4 requests / 2 round trips) → `ProjectScreenGate` (`app/routes.tsx:125`) holds every `/project/*` route until the session project loads.
2. **Reads** — `data/client.ts` (`fetchAll`: 500/page, caps at 50 pages and now fails on the cap, D157; `fetchPage`; `countedPage` for Overview; token cache) with `odata.ts` filters; every screen has a `queries.ts`/`hooks.ts` over TanStack Query with global defaults `staleTime` 30 s, `refetchOnWindowFocus` true, retry rules (`app/Providers.tsx`). Reference reads opt into 30-minute stale times; some persist to IndexedDB (D142).
3. **Writes** — a plan (`WritePlan`) built by a pure `rules.ts`/`plans.ts` function and run by `executePlan`/`runPlan`/`usePlanWrite` (the admin and Cost periods have their own executors: `landLease.ts`, `periodWrites.ts`, `adminCost.ts` …). Add Cost from Table, Generators and Check List have bulk paths (`bulkWrites.ts`, `bulkSend.ts`, `generatorsBulk.ts`, `checklistBulk.ts`).
4. **Tracing** — every call is logged through `platform/requestLog.ts` (`[VSB] HTTP / DATA / ACTION`), which is also the measurement source for Stage 3 (request counts and timings per action).
5. **Constraint worth remembering** — the SDK has no `$expand`, no server aggregates, no changeset, and always sends `odata.include-annotations=*`; a request costs about 1.2–1.9 s through the host (D51). This is why the findings are measured in sequential round trips, not CPU.

## 3. Where business logic and computation live

| Concern | Locations |
|---|---|
| Cost calculations | `features/cost/contracts/rules.ts` (closing-date split, total chain, `recalculateForm`, margin patches); `add-costs-from-table/rules.ts` + `savePlan.ts` (totals, `diffRows`, `costWrites`); `data/costBook.ts` (payer resolution, category totals, chain linking); `costing/model.ts` (`total`, `distribute`, `periodEnd`) |
| Period (OPEX, Land Lease) rules | `periods/opexRules.ts` (3.3k lines), `periods/landLeaseRules.ts` (3.5k lines): chains, start dates, allocation diff, inflation, standard import, command gates, validation, write plans |
| CAPEX | `capex-costs/` `rules.ts`, `panelRules.ts`, `distribution.ts`, `gridRows.ts`, `comments.ts`, `savePlan.ts`; vendored PCF renderer `pcf/` |
| PM calculations | Finance `rules.ts` 4.1k (standards, equity/loan, repayment schedules); Revenues `rules.ts` 3.5k (price curve, inflation, hedge/volume engine); Production `rules.ts` 2.0k (yield, seasonality, negative prices, roll-up); Milestones `rules.ts`; shared `domain/priceCurve`, `yieldStats`, `foundationCost`, `dates`, `powerFxNumeric` |
| Generators / Check List | `generators/rulesCore.ts` 2.6k + `plans.ts`, `replacePlans.ts`, `panelPlans.ts`, `rollback.ts`; `checklist/rules.ts` 3.2k |
| Validation | per-screen `rules.ts` validators (`ADDCOST_MSG`, `contractErrors`, `canSave*`, `validate*`); `domain/numeric.ts`, `numberInput.ts`, `powerFxNumeric.ts` parsers; `data/bulkSend.ts` plan validation; `data/ownerBindGuard.ts` (owning-BU) |
| Transformation | Dataverse row → app model in each `data/*.ts`; `add-costs-from-table/spreadsheet/adapter.ts` (the deliberate grid round trip, a safety guard from the Wirmighausen incident); `gridRows.ts` (CAPEX grid) |
| Paging / reads | `data/client.ts`, `projects.ts` (Overview paging D41–46), `verifyGone.ts`, `concurrency.ts` (`mapLimit`, `createGate`) |
| Reference data | `data/projectStates.ts` (D159, the one shared read so far), `countries.ts`, `opexCatalog.ts`, `standardContracts.ts`, `persistedReference.ts` (D142) |

## 4. Aggregate result of Stage 1

- About **130 raw findings** across 7 slices → **34 consolidated OPT entries** (38 counting the five sub-entries of OPT-07) + **9 product-decision items** (DEC-1…DEC-9) that are real but must not be acted on without sign-off.
- Distribution (by section of `02`): asynchronous / request shape 24 entries (A), render-path and algorithm 6 (B), calculation consolidation 4 (C). Several cross categories (the register names the secondary ones).
- Severity (38 items): **3 × P0**, 13 × P1, 11 × P2, 11 × P3 (framework and full list in `04` §1). P2 includes two decision-gated items (OPT-18, OPT-21).
- **No CPU-bound hot path** was found in Generators, Check List, Finance, Revenues, Production, Add Cost bulk save or the shared components. Their previous optimization rounds are intact.
- Already efficient and deliberately left alone (confirmed by the scans): `savePlan.ts`, `addCostSheetBulk`/`bulkSend`/`bulkWrites`, `adapter.ts`, `SpreadSheet.tsx` per-edit work, `countedPage`/Overview paging, `fetchAll`, `domain/locale.ts` pools, `PcfGrid`'s `onAction` ref, Generators `prefetchGenerators`/`gateByList`/`targetedReload`, Check List D138/D150/D156, Finance D137, Revenues D136/D146, Production D145, the `use-context-selector` replacement (D140), `useDebouncedValue`.
- Deliberate sequential flows and canvas-parity quirks (`CANVAS_PARITY_DELETION`, `DEFER_*_DELETES`, `BULK_SAVE`, ownership re-check, create-then-update for checklist tasks (D18), `ORDER_WRITE_CONCURRENCY = 4`, the Wirmighausen safety net, last-flag repair, the O-1/O-4/O-5/O-10, LL-D1/D4/D8 reproductions) are product decisions, not inefficiencies.

The three P0 items:
1. **OPT-04** the OPEX screen loads the Land Lease book and the CAPEX chart it never reads, in three serial stages, on every visit and save.
2. **OPT-10** Land Lease writes are strictly sequential (about 42–50 round trips for a 40-WTG contract).
3. **OPT-25** the CAPEX grid rebuilds and repaints its whole DOM on every keystroke in the side panel.

## 5. Dataset sizes used for judgement (from code and docs, not measured)

A few hundred contracts × about 200 monthly rows per CAPEX category (`capex-costs/gridRows.ts:10-14`), 579 cost rows on Wirmighausen
(`costBook.ts` comment), up to 15,000 rows on the Add Cost sheet (bench), 9 Land Lease sub-accounts and 27 headers on Project New Data,
about 15 countries, 10 project states, 100–250 default checklist tasks per country/technology, about 1,000–2,000 locking approvals in the environment (estimate). Real production counts per project were **not available** — items that depend on them are marked Potential / Requires profiling.

## 6. Orchestrator verification (rule: no recommendation without inspecting the implementation)

Re-read against source before the register was written:
- **OPT-04** `data/costBook.ts:1227-1245` — `loadCostBook(id, undefined)` is `await loadCostAccounts()` → `await loadCostLines(id, [] …)` → `await loadPeriods()` (OPEX ‖ Land Lease); `OpexScreen.tsx:872` reads only `book.periods`. Confirmed, and worse than reported: the three stages are fully serial.
- **DEC-1** `domain/numeric.ts:176` vs `domain/powerFxNumeric.ts:141` — the epsilon nudge exists in one and not the other. Confirmed.
- **OPT-25** `capex-costs/Screen.tsx:397` fresh `categoryAccounts` array; `PcfGrid.tsx:64-74` `useMemo` deps and `useLayoutEffect(…, [props, rows])`. Confirmed.
- **OPT-10** `data/landLease.ts:552-577` `for … await`. Confirmed.
- **OPT-29 (media query)** `components/useMediaQuery.ts` new `subscribe` closure per render. Confirmed.

All other entries carry the slice agent's evidence and are labelled with their confidence in `02`. Items from agent reports that I did not re-read are
**reported as evidenced by the scan, not independently verified**; Stage 3 re-reads the original code for every batch before changing it (`04`, §6).

## 7. Limits of this audit

- **No profiling was run**; no benefit in this documentation set is measured. `06` records baselines first.
- Dataset volumes are estimates (§5). A few findings flip from "worth it" to "not worth it" depending on real counts (OPT-08a, OPT-09).
- DEV behaviour was not exercised. Three items need a live check before they can be built (OPT-19 truncation, OPT-23 cascade, OPT-16 permit navigation filter).
- `HEAD` moved during the audit (see §1). The tree is now clean, so Stage 3 can start from a clean base; the one overlap is `admin-cost/` (OPT-27, OPT-20), re-read before editing.
