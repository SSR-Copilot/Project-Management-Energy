# 10c - Screen-level audit: PM Production, Revenues, Finance, Generators (prefix SPB)

Read-only audit of the worktree at base `dde9e92`. Register: `_register/SPB.md` (17 findings). Throwaway timing script and its output: `_bench/SPB/` (`spb.bench.test.ts`, `vitest.spb.config.ts`, `spb.bench.out.txt`). Nothing under `ProjectCosts-CodeApp/` was edited.

## 1. Scope

**Read (code):**
- Production: `features/pm/production/hooks.ts` (whole), `Screen.tsx` (lines 380-700 plus a grep of the rest), `rules.ts` (planSaveYield, groupIntoWaves, planStandardContracts, GenerationInputs, headers), `data/production.ts` (whole).
- Revenues: `features/pm/revenues/hooks.ts`, `reload.ts` (whole), `Screen.tsx` (lines 640-1140), `rules.ts` (function index, planSaveContract, applyRevenueEngine, validateHedgedVolume, volume rows, card helpers), `data/revenues.ts` (reads), `data/revenuesFlags.ts`.
- Finance: `features/pm/finance/hooks.ts` (whole), `Screen.tsx` (lines 760-800, 1036-1232, 1398-1430), `rules.ts` (function index, regenerateRepaymentYears, repaymentDiff, planTrancheSave), `data/finance.ts` (reads), `data/financeFlags.ts`, `financeBulk.ts`.
- Generators: `queries.ts`, `loadGate.ts`, `hooks.ts` (lines 1-420), `Screen.tsx` (lines 100-345), `sections/WtgSection.tsx` (top), `plans.ts` (lines 80-360, 699-737), `rulesCore.ts` (catalogue, cascade, turbine, allocation helpers), `data/generators.ts` (reads), the three flag files, `data/bulkBackend.ts`, first 80 lines of `data/generatorsBulk.ts`.
- Shared: `data/usePlanWrite.ts` (196-262), `data/client.ts` (fetchAll), `data/concurrency.ts` (constants), `app/bootPrefetch.ts`, `app/pmScreenPrefetch.ts`, `app/generatorsWarmup.ts`, `data/bootDvoptFlags.ts`, `app/Providers.tsx` (defaults), `data/projectStates.ts`.
- Docs: D165 docs 03, 12, 28 (cited, not redone); `GENERATORS-READ-PERF-DEV-PROBE.md`; `17-ADDCOST-SAVE-PERF-PLAN.md` (first 60 lines); `02-OPEN-DECISIONS.md` D135, D136, D144, D145, D146, D160 (head); `GENERATORS-BULK-DATAVERSE-ANALYSIS-AND-PLAN.md` (grep).

**Not read in full (honest list):** `Screen.tsx` of Finance (2,191 lines), Generators (1,592) and Revenues (1,673) beyond the parts above; all Generators panels under `sections/panels/`; `rollback.ts`, `replacePlans.ts`, `panelPlans.ts`, `display.ts`; Finance `rules.ts` standard-assumption builders; Production `Screen.tsx` panel markup; `data/executePlan.ts` and `data/bulkSend.ts` bodies (relied on doc 03 and the D51 records). No browser, no live Dataverse, no Fabric.

## 2. Method and the one latency anchor

Every request count below is from reading the hooks, or from a repo test I ran. Seconds are DERIVED by multiplying awaited rounds by per-call times that **the repo itself recorded from live DEV** (the only measured per-call data in these four screens):

| Recorded live on DEV (D144 section 1, Generators, 4 types / 24 turbines / 1 all-WTG cost) | Value |
|---|---|
| Trivial call | about 0.18 s |
| Normal write | 0.25-0.5 s |
| Project roll-up PATCH (`vsb_projects`) | 0.45-0.85 s |
| Background reload after a save | 9-13 requests, 0.7-2.6 s |
| A bulk request (D51/D75, Add Cost) | at least 0.55 s; 0.6-1.9 s seen; model a = 0.5 s + b = 22-32 ms per row |

Read latency through the host for these particular tables is **not measured anywhere**; I use 0.2-0.5 s per read round and say so. The Fabric SQL reads (`AssumptionsRevenue`, `AssumptionsDebt`, `AssumptionsBanks`, `AssumptionsKfWTranche`) are unmeasured in every repo document (doc 08 states their latency is outside the programme).

Measurements I ran (single vitest file each, from `ProjectCosts-CodeApp/`):

1. `npx vitest run src/features/pm/finance/financePerf.bench.test.ts --reporter=verbose` (MODELLED: fake SDK, 25 ms per call):

| Finance scenario | before D137 | defaults now | defaults + bulkSchedules |
|---|---|---|---|
| visit reads | 15 req / 30 rounds | 9 req / 3 rounds | - |
| tranche save edit (1 + 25 repayments + 4 step-ups) | 42 / 45 | 34 / 6 | 11 / 7 |
| tranche save new | 42 / 43 | 34 / 6 | 10 / 6 |
| tranche delete | 41 / 43 | 33 / 5 | - |
| option switch | 17 / 12 | 8 / 4 | - |
| visit seeds, new project | 72 / 38 | 8 / 2 | - |
| one toggle or panel save | 12 / 7 | 2 / 2 | - |

2. `npx vitest run src/features/pm/production/generationWaves.test.ts src/features/pm/production/saveWidth.test.ts --reporter=verbose` (MODELLED rounds): generation 4 land leases x 30 turbines = 151 requests in 22 rounds (UT-PRODPLAN-003); x 200 turbines = 831 requests, 8 steps, 109 rounds (UT-PRODPLAN-004); new-WTG yield save with a 15-year curve = 19 requests, write rounds 4 -> 3 at 16 wide; 28-year curve 5 -> 3.
3. `npx vitest run src/features/pm/generators/saveLatency.test.ts`: 46 pass; it prints nothing, so I rely on D144's own tables.
4. `_bench/SPB/spb.bench.test.ts` (SYNTHETIC inputs, one Node process on a laptop, relative only; command at the head of the file):

| Pure function (synthetic size) | ms per call |
|---|---|
| `planStandardContracts`, 30 turbines (136 writes) | 3.2 |
| same, 100 turbines (351 writes) | 3.5 |
| same, 800 turbines (2,471 writes) | 24.6 (7.0 with `waves: false`) |
| `groupIntoWaves` alone, 800 turbines | 8.1 |
| `validateHedgedVolume`, 432 months x 30 contracts | 2.0 |
| `applyRevenueEngine`, 3,000 assumption rows | 0.85 |
| `planSaveContract`, 36 stored + 36 new volumes | 0.27 |
| `regenerateRepaymentYears` / `repaymentDiff`, 40 years | 0.03 each |
| `projectCatalog`, 2,000 catalogue models | 1.9 |
| `cascadeOptions`, 2,000 models (per type-panel render) | 0.47 |
| `allocationCreates`, 200 turbines x 5 costs (1,000 rows) | 0.7 |
| `planToggleStatus`, 200 turbines | 0.07 |
| `planCreateGeneratorType`, N=200 over 800 existing | 0.24 |

Conclusion that the earlier programmes also reached and I confirm: **client-side calculation is not a bottleneck on any of the four screens.** The time is the number of awaited server rounds.

Realistic volumes are taken from repo fixtures, not from production data (I have none): Generators 4 types / 24 turbines / 1-2 all-WTG costs (D144), types up to 200 turbines (the screen's maximum, GB-50); Production 15-28 yearly negative-price rows, 12 seasonality months, up to a handful of yields; Revenues 5-15 contracts, volumes one row per calendar year up to 36-37; Finance up to 4-6 tranches, repayments one row per year (25 in the fixtures), 4 step-ups.

## 3. Switch state at this commit (verified in source)

| Switch | Value | File |
|---|---|---|
| GENERATORS_PERF: targetedReload, gateByList, prefetch, parallelChunks, relaneWrites, replaceLanes, trimReload, wideGroups, deleteReadWaves, countryFromSharedList, productionLeanReload, turbinesRefetchOnce, typeReadsLean | ON | `data/generatorsPerfFlags.ts:114-130` |
| GENERATORS_PERF: readsByProject, optimisticToggle, persistCatalogue, flowBesideReads, omGuardOneRead | OFF | same, `:118-120,127,131` |
| GENERATORS_BULK: allocations, status, applyAll, turbines, replace, createRollback | all OFF | `data/generatorsBulkFlags.ts:18-24` |
| GENERATORS_DELETE: tieredDeletes ON; verifyDeletes, parentOrder, guardedUpdates OFF | | `data/generatorsDeleteFlags.ts:32-36` |
| FINANCE: parallelReads, lazyReads, targetedReload, concurrentWrites, wideGroups ON; changedRowsOnly, bulkSchedules OFF | | `data/financeFlags.ts:37-43` |
| REVENUE_PERF: parallelVolumeWrites, wideCreateGroup | ON | `data/revenuesFlags.ts:33-36` |
| PRODUCTION_GENERATION_WAVES, PRODUCTION_WIDE_GROUPS | ON | `production/rules.ts:1625,1398` |
| BOOT_PREFETCH_SCREEN_READS ON (but only 5 screens implement it); GENERATORS_WARMUP_LAZY OFF; ENV_VARS_TOGETHER OFF | | `data/bootDvoptFlags.ts:31-37` |

Prior findings re-checked: PA-02 (Finance bulk backend never registered) is **fixed in source** (`data/financeBulk.ts` calls `registerDefaultBulkBackend`); PA-08 (Production lean reload), PA-09 (turbines refetched once) and PA-10 (lean type reads) are ON; PA-01, PA-03, PA-04, PA-05, PA-06, PA-07, PA-14, PA-15, PB-09 are **still open** (switch OFF or not built).

## 4. The 16 stages, per screen (what is true now)

Stage numbering: 1 initial loading, 2 component init, 3 state init, 4 data retrieval, 5 Dataverse requests, 6 business logic, 7 transformation, 8 calculations, 9 rendering, 10 user interaction, 11 save, 12 bulk, 13 refresh, 14 navigation, 15 error handling, 16 cleanup.

### 4.1 Production (`features/pm/production`)

| Stage | Finding |
|---|---|
| 1, 14 | Lazy chunk 72.7 kB (19.7 kB gz) (`dist/assets/Screen-CRiFdCfH.js`). A deep link or new tab prefetches only the session project and chunk (SPB-02). |
| 2, 3 | One component with 8 `useState`; derived view/modes/errors computed per render, all pure and sub-millisecond; seasonality and negative-price bases are memoized (FE-P2-03). |
| 4, 5 | Wave 1: project (17 columns, `data/production.ts:60`) in parallel with yields (20 columns). Wave 2: the Fabric standard-assumption read, which needs the project's country (`Screen.tsx:398`). `loading` waits only for wave 1 (`:536`), so the Fabric hop never blocks the list, but it is sent at load although only the edit panel uses it (SPB-12). Edit panel: seasonality + negative prices (2 reads, `qk.production(..., id)`). |
| 6-8 | `deriveYieldView`, `yieldErrors`, `canSaveYield`: pure, called every render of the screen; seasonality 12 rows, negative prices 15-28 rows. No expensive calculation exists on this screen except the generation plan (3.5 ms at 100 turbines). |
| 9 | Yield cards are a plain `yields.map` (a handful of rows). The row views inside the panel are memoized. Not a bottleneck. |
| 10 | Keystroke recomputes the view, nothing else; saveable gate is a pure function. |
| 11, 13 | Save = job 1 (`hooks.ts:237`): `plan()` reads 4 things in parallel (yields, revenues, stored seasonality, stored negative prices), yield write alone, one 16-wide group (seasonality, curve, revenue syncs, superseded yields), then `then` = `rollUp` (`:184`): fresh read of yields + project, then the roll-up PATCH. Reload runs in the background; `refreshing` holds commands. With the lean reload (PA-08) the yields query is filled from the roll-up read. Job 2, when `shouldGenerate`, is the one-shot generation (SPB-01). |
| 12 | No bulk: Production tables are not registered for it; D135 and D145 judged it a tie or loss at 15-30 rows. I agree (section 6). |
| 15 | Load error state present (`Screen.tsx:539`); a failed Fabric read leaves standards blank and the yield can still be saved. |
| 16 | Nothing held on unmount. |

Critical path to usable (DERIVED): gate, then one read round (project and yields together), about 0.2-0.5 s plus chunk. To save-complete (normal yield): about 1.6-3.4 s (SPB-10). First save of a project: plus the generation, about 6-12 s at 30 turbines (SPB-01).

### 4.2 Revenues (`features/pm/revenues`)

| Stage | Finding |
|---|---|
| 1, 14 | Chunk 43 kB (11 kB gz) plus the `revenues` data module 48 kB (14 kB gz); `rules.ts` is 173 kB of source but lands in the chunk at that size. Same prefetch gap as Production (SPB-02). |
| 4, 5 | Wave 1: project (with the project-states list taken from the shared 30-minute cache, D136/D159) in parallel with contracts, balancing prices, the negative-price check and the revenue subaccount. Wave 2: the Fabric country slice, the currency (waits for the project) and the country inflation profiles. `loading` waits for project, contracts and balancing only (`Screen.tsx:730`). The Fabric slice is also read by Milestones and, with different keys and filters, by Production (SPB-12). |
| 6-8 | `applyRevenueEngine` runs only when the revenue type changes (0.85 ms at 3,000 rows); `validateHedgedVolume` runs at Save for percentage hedges (2 ms at 36 years x 30 contracts). |
| 9, 10 | Contract cards: `ContractCardFields` and the Individual-volume `VolumeRow` are memoized (D146 C3: renders per keystroke 30 -> 1, commit 53-62 -> 30 ms, LOCAL-MOCK). Remaining: card headers, per-card `cardCommands(c)` and the panel's other fields re-render per keystroke (SPB-17, SUSPECTED). |
| 11 | Contract Save: [overlap read beside the stored-volume-id read for a percentage Edit (D146 C2)] -> contract write alone -> delete group (16) -> create group (16) -> awaited reload (SPB-07, SPB-09). Balancing Save/Delete: 1 write then awaited reload (needed: the plugin computes the dates). |
| 12 | `createMany` for volumes was weighed in D146 and rejected (no gain at 12-36 rows). Confirmed by my model in section 6. |
| 13 | Reload is narrow (contracts + volumes, or balancing, `reload.ts`) but awaited, unlike Production and Generators. |
| 15 | Load error state present (`loadError`, `Screen.tsx:731`). The hedge-check `catch {}` lets a Save go on after a failed overlap read (D146 "noticed, not changed"). |

Critical path to usable: gate, one read round, about 0.2-0.5 s. Add/Edit needs wave 2 (currency, subaccount): about two rounds. To save-complete: percentage edit about 0.65-1.5 s; Individual 12/12 about 1.2-2.5 s; 36/36 about 2-4.5 s (SPB-07).

### 4.3 Finance (`features/pm/finance`)

| Stage | Finding |
|---|---|
| 1, 14 | Largest PM screen chunk: 139 kB (35 kB gz) (`Screen-DpubSrou.js`). Same prefetch gap (SPB-02). |
| 4, 5 | Wave 1 (7 reads, one round): project (+states, cached), categories (30 min), inputs (not waiting for categories since D137), repayments, step-ups, banks and KfW (Fabric, whole tables). Wave 2: the debt assumptions (Fabric, needs the country). Four Dataverse reads re-run on every visit (`EVERY_VISIT`, `hooks.ts:74`, D109). `loading` waits for project, categories and inputs (`Screen.tsx:1066`); `loadError` also includes repayments and step-ups (`:1067`). The CAPEX total and the turbine count are lazy (D137 `lazyReads`): they start when the Equity panel or the Decommissioning card opens (SPB-13). |
| 6-8 | Standards are built with `useMemo` from the Fabric slice (`Screen.tsx:1075-1090`); repayment years regenerate in 0.03 ms. The first-visit seed effect waits for the Fabric read and for the visit's own inputs read (`inputsQ.fresh`), then sends ONE job (D137), then reloads. |
| 9, 10 | `FinanceCards` and `RepaymentAmountRow` are memoized with stable handlers (FE-P2-01/02/09); no render hot spot found. |
| 11 | Tranche Save: duplicate-key read -> tranche write -> one 16-wide group of repayments + step-ups + deletes -> awaited reload of inputs, repayments and step-ups: 34 requests / 6 rounds for 25 + 4 rows (MEASURED model above). |
| 12 | `bulkSchedules` OFF. Per the model it cuts requests 34 -> 11 but rounds do not fall (6 -> 7), and each bulk round costs more than a single write (SPB-08). |
| 13 | Targeted reload (D137) but awaited (SPB-09). |
| 15 | Seeds are withheld when the Fabric read fails (`seedsAllowed`); load error state present. |

Critical path to usable: gate, one read round. To save-complete: tranche about 1.5-3 s; toggle or panel save 2 rounds (about 0.5-1 s).

### 4.4 Generators (`features/pm/generators`)

| Stage | Finding |
|---|---|
| 1, 14 | Chunk 78 kB (23 kB gz) plus 8 lazy panel chunks preloaded when idle (D143). A deep link prefetches wave 1 (`queries.ts:128`, 10 reads); in-app navigation starts them at mount. |
| 2, 3 | `GeneratorsScreenBody` is keyed by project (fresh state per project). All forms and the selection live in it, but the seven family galleries and the WTG tables are memoized sections with stable handlers (D143). |
| 4, 5 | Wave 1 (project, planning, WTG types, PV catalogue (whole table), PV types, inverter, substructure, storage, hydrogen, substation). Wave 2: turbines (40 type ids per request, 4 chunks at once, 500 per page) and models. The list gate waits for 12 reads (`Screen.tsx:234-245`); the orderable catalogue, price index, device costs and AllWTG costs are lazy (D141). Row selection adds the 2-read O&M guard (SPB-14). See SPB-05 and SPB-06. |
| 6-8 | `projectCatalog` and `cascadeOptions` are memoized; 2 ms for 2,000 catalogue rows. No hot calculation. |
| 9 | Turbine grid paged 30 rows, expanded long lists use `content-visibility: auto` (D143). Not a bottleneck. |
| 11, 12 | Add type, Add turbine, Add PV, toggle, delete, replace: see SPB-03/04/15. Bulk flags all OFF. |
| 13 | Per-kind targeted reload; the session project is only marked stale and refetched when the screen unmounts (`trimReload`, `hooks.ts:271`). Background reload after a save: 9-13 requests in D144's baseline, 5-7 now per doc 03. |
| 15 | F1/F3/F7 guards: a failed lazy read blanks nothing it should not; writes are held while any read a plan needs is unsettled (`dataSettling`). |

Critical path to usable (DERIVED): two read rounds (types, then turbines and models), about 0.4-1 s plus chunk. Save-complete: toggle 1.4-1.7 s (measured before D144), Add type N=20 3.3-3.7 s (measured before D144), Replace 5.6-6.3 s (measured before D144).

## 5. Findings summary (full rows in `_register/SPB.md`)

| ID | P | One line |
|---|---|---|
| SPB-01 | P1 | Production first-save generation: 22 awaited rounds at 30 turbines, 109 at 200, single POSTs 8 wide (PRIOR:PA-07, open) |
| SPB-02 | P2 | Deep link / new tab to Production, Revenues, Finance does not prefetch the screen's own reads (PRIOR:PB-03, partial) |
| SPB-03 | P2 | Generators Add type / turbine / PV: N x L allocation POSTs, bulk OFF and never probed; D144 baseline 3.3-3.7 s at N=20 (PRIOR:PA-01) |
| SPB-04 | P2 | Generators Replace WTG/PV: 11-12 waves, 5.6-6.3 s / 4.5-4.9 s measured before D144 (PRIOR:PA-05) |
| SPB-05 | P2 | Generators first view is a two-wave chain; `readsByProject` OFF, probe never run (PRIOR:D142) |
| SPB-06 | P3 | Whole PV module catalogue gates the Generators list even for wind-only projects (NEW, SUSPECTED) |
| SPB-07 | P2 | Revenues Individual volumes: delete-all and re-create-all, 73 requests / 7 write rounds at 36/36 (PRIOR:PA-06) |
| SPB-08 | P2 | Finance tranche Save: 34 requests / 6 rounds, `changedRowsOnly` OFF; bulk would not cut rounds (PRIOR:PA-03) |
| SPB-09 | P2 | Revenues and Finance saves await the reload; Production and Generators do it in the background (NEW) |
| SPB-10 | P3 | Production yield Save is 5-7 sequential steps by design; remaining levers were cut in D145 (PRIOR:D145) |
| SPB-11 | P3 | Window-focus refetch on the four screens (Finance 4 + lazy CAPEX/turbine reads, Revenues 4, Production 2) (PRIOR:OPT-18) |
| SPB-12 | P3 | Reads only a panel or seed needs start at load; Fabric revenue slice read under three keys (NEW, SUSPECTED) |
| SPB-13 | P3 | Finance Equity CAPEX total and turbine count read every row to produce one number (NEW, SUSPECTED) |
| SPB-14 | P3 | Generators O&M guard: 2 sequential reads per type selection (PRIOR:PA-15) |
| SPB-15 | P3 | Generators roll-up PATCH on every save, the slowest single write, 0.45-0.85 s (PRIOR:PA-04) |
| SPB-16 | P3 | Generators warm-up starts 10-13 reads 1.5 s after any PM screen opens (PRIOR:PB-09) |
| SPB-17 | P3 | Revenues/Production panel state in the screen component; card headers re-render per keystroke (PRIOR:D146, SUSPECTED) |

Counts: P1 1, P2 7, P3 9. Confidence: CONFIRMED 2 (SPB-04 and SPB-15: numbers recorded live in D144; repo-recorded, not run by me), HIGH 11, SUSPECTED 4 (SPB-06, 12, 13, 17). NEW: SPB-06, 09, 12, 13; the rest extend or restate prior IDs with their current status.

## 6. Are Add Cost from Table and the Generators bulk path good reference patterns?

Short answer: **partly, and for a narrower set of cases than the brief assumes.** I examined the implementation and the repo-recorded measurements rather than assuming.

**Add Cost from Table (`data/addCostSheet.ts` 1,562 lines, `addCostSheetBulk.ts` 1,207, `bulkSend.ts` 1,007, `bulkWrites.ts` 439).**
- What is measured live and is genuinely good: moving from about 70 single requests to `CreateMultiple`/`UpdateMultiple` took a save from 9.5 s to about 1.6-1.9 s on DEV for 60-96 rows (02-OPEN-DECISIONS D51 section 11.16; `17-ADDCOST-SAVE-PERF-PLAN.md` section 1). The sheet is 800-3,500 rows in the L/XL shapes, where one bulk request replaces dozens of waves.
- What is not proven: the D75/D76/D77 follow-ups (chunk tuning, deep insert, background save) are "inferred, not measured"; the plan itself says the 2.5x target "is not reachable by the client changes", the floor being 0.5 s per request. The live DEV acceptance test is documented as still owed, and the whole bulk save is "not product-approved".
- What it costs: about 4,200 lines of orchestration, partial-failure reconciliation (`SavePlanError`), per-action 501 fallback flags in `sessionStorage`, a deferred-delete DIVERGENCE with a documented resurrection window, and standing risks (lock contention, 429, error classes that vary with timing, KNOWN-RISKS D51). A shallow copy would import the risks without the volume that justifies them.

**Generators bulk (`data/generatorsBulk.ts` 473 lines, `bulkBackend.ts`).**
- The backend design is sound and reusable: client-generated ids, fail-closed owning-BU check, per-table registry, guarded `updateMany`, exact failure counts, 429 retry. Finance already registers its schedule tables on it.
- But it has **never run against DEV**: every `GENERATORS_BULK` flag is false, the D115 probes are unrun, and `GENERATORS-BULK-DATAVERSE-ANALYSIS-AND-PLAN.md` says "No Generators save has ever been timed live" and that the polymorphic bind and `statecode` inside a bulk target are unproven. `updateMany` always pays a guard read (PA-13). So it is a design intent, not an evidenced pattern.

**When bulk pays here (ESTIMATED from the repo's own constants, not measured):** a single-write group of N rows costs about ceil(N/16) rounds x 0.25-0.5 s. One bulk request costs about 0.5 s + 27 ms x rows (or 8 parallel chunks of at least 10 rows, about a + b x c). Break-even is roughly 40-60 rows; at 15-36 rows grouped singles win or tie, which is what D135, D145, D146 and my Finance model (rounds 6 -> 7, each bulk round slower) say. Bulk clearly pays at 100+ rows: Generators allocations (N x L), Production generation allocations (80-2,400 rows), Land Lease, Add Cost.

**Recommendation for this scope:** reuse the Add Cost/Generators bulk transport only for the allocation steps (SPB-01, SPB-03). For Revenues volumes (12-36 rows) and Finance schedules (about 30 rows), the lever that cuts rounds is **writing only the changed rows** (SPB-07, SPB-08), not bulk. Do not copy Add Cost's reconcile, deferred-delete or fallback machinery into a screen whose saves are below 100 rows.

## 7. Critical user journeys (for doc 11)

Times are DERIVED from the D144 per-call anchor unless marked; reads 0.2-0.5 s per round is an assumption.

| Journey | Sequence (awaited rounds) | Estimated user-visible time | Main finding |
|---|---|---|---|
| Open Production (warm session, in-app) | chunk, [project, yields] | 1 read round plus chunk | SPB-02 for new-tab landing; SPB-12 |
| Open Production in a new tab (Edit Project) | context, [session project, env], gate, [project, yields], Fabric | gate + 1 round, Fabric not blocking | SPB-02 |
| Save a Production yield (15-year curve, seasonality, 2 syncs) | pre-reads(1), yield(1), group of 18 (2), roll-up read(1), roll-up PATCH(1) | 1.6-3.4 s | SPB-10 |
| First yield save of a project (generation) | the above + 2 read rounds + 22 write rounds at 30 turbines | about 6-12 s | SPB-01 |
| Open Revenues | chunk, [project(+cached states), contracts, balancing, negative-price check, subaccount], then [Fabric, currency, inflation] | usable after round 1; Add needs round 2 | SPB-02, SPB-12 |
| Add or Edit a percentage-hedge contract | [overlap read, id read], contract write, awaited reload | 0.65-1.5 s | SPB-09 |
| Edit an Individual-volume contract, 36 years | ids read, contract write, 3 delete rounds, 3 create rounds, awaited reload (9 steps, D146) | about 2-4.5 s | SPB-07, SPB-09 |
| Save a balancing price | write, awaited reload (plugin dates) | about 0.5-1 s | await is required |
| Open Finance | chunk, [7 reads], Fabric debt read, seed check | usable after round 1 | SPB-02, SPB-12 |
| Edit a tranche (25 repayments, 4 step-ups) | duplicate read, tranche write, group of 29 (2 rounds), awaited reload (6 rounds, modelled) | about 1.5-3 s | SPB-08, SPB-09 |
| Open the Equity panel | contracts read, cost chunks (2 waves), Save enabled | about 0.4-1 s | SPB-13 |
| Open Generators (cold) | [10 reads], [turbines, models] | 2 read rounds plus chunk | SPB-05, SPB-06 |
| Add WTG type N=20, L=2 | pre-read, type, 20 turbines (2 rounds), wave {device row, roll-up, 40 allocations} (3 rounds); 63 requests / 6 waves (doc 03) | about 2.2-4.5 s (measured 3.3-3.7 s at L=1 before D144) | SPB-03, SPB-15 |
| Toggle a type's status (N turbines) | wave {type, N turbines}, roll-up (5 waves at N=50, doc 03) | 1.4-1.7 s measured before D144 | SPB-15 |
| Replace a generator type | 11 waves (before D144); about 8-9 after | 5.6-6.3 s measured before D144 | SPB-04 |
| Select a type, then Delete | 2 sequential guard reads | Delete unavailable about 0.4-1 s | SPB-14 |

## 8. Checked and found NOT to be bottlenecks

- **Client calculation** on all four screens (section 2 table): worst case 24.6 ms for a 2,471-write generation plan at 800 turbines; everything else under 3 ms. The rule functions are pure and cheap; this matches D135 ("plan building is a few hundred operations, microseconds").
- **Revenue calculation engine** per type change (0.85 ms at 3,000 assumption rows) and the hedge check (2 ms).
- **Finance repayment/step-up arithmetic**: O(years squared) with 40 years is 0.03 ms.
- **Rendering of the lists**: Generators sections are memoized with `content-visibility`; Finance `FinanceCards`/`RepaymentAmountRow` memoized; Revenues `VolumeRow`/`ContractCardFields` memoized; Production lists are a handful of rows.
- **Bundles**: the four screens are lazy chunks of 43-139 kB (11-35 kB gz); not on any critical path beyond the first visit.
- **Id-chunk fan-out** (40 ids per request, 4 at once, D142) and **fetchAll paging** at these volumes: one page of 500 covers 4 types x 24 turbines, 15 contracts, 100 repayment rows; sequential paging only matters for tables above 500 rows (the PV catalogue, the orderable generator catalogue, Fabric tables), whose sizes are unmeasured (SPB-06, SPB-12).
- **Project-states list**: one shared 30-minute entry across Revenues, Finance, Milestones, General Data and Check List (D159).
- **Production pre-save reads** re-read yields and revenues that are in the cache: this is the canvas `Refresh` and the R-12 guard (a stale plan duplicates negative prices or resurrects a seasonality row); not to be removed.
- **Prior fixes confirmed ON in source**: PA-02 fixed, PA-08, PA-09, PA-10, trimReload, wideGroups (Generators 16, Production 16, Revenues 16, Finance 16), tiered deletes (16 leaf / 4 cascade).

## 9. Limitations

- No live environment: every timing is DERIVED or MODELLED except the figures D144/D51 recorded from DEV, which I cite and did not re-run. D144's baseline pre-dates its own wave merging, and the document says D144 is "not run on DEV"; I do not know whether it reached DEV.
- Per-call read latency for Production, Revenues, Finance and Generators tables and the Fabric SQL latency are unmeasured.
- Real data volumes (turbines per type, contracts, tranches, PV catalogue size, Fabric table sizes) are unknown; I used the repo's fixtures.
- Rendering was assessed by reading and by the repo's own jsdom measurements; no production-browser Profiler trace exists for these screens.
- The brief's register header names 17 columns although it says 15/16; I wrote the 17 named columns.
