# 05 — Implementation tracker

Final state, 24 Nov 2026. Branch `optimization/stage3` (from `origin/RounakDev1` at `b976a96`). **Everything below is uncommitted in the working tree; nothing is pushed.**
Test status = the tests the batch added or changed passed in the batch's own runs; the whole tree is gated by the combined `npm run verify` (see `07`).
Agents: one implementer per batch (B3 also fixed its own finding after review; B4–B7 ran in parallel worktrees and were merged by patch).

| Batch | Finding | Pri | Status | Main files | Agent | Tests |
|---|---|---|---|---|---|---|
| B0 | Wave-recorder harness | — | **Done** | `test/waveClient.ts` (+test) | orchestrator | UT-WAVE-001…005 |
| B2 | OPT-04 OPEX-only `loadCostBook` scope | **P0** | **Done** | `data/costBook.ts`, `useCostBook.ts`, `OpexScreen.tsx` | B2 | UT-COSTWAVE-OPT-001…004 |
| B2 | OPT-05 CAPEX tab: payer defaults at t=0 | P1 | **Done** (comment corrected after review: one extra parallel request for a category with no accounts) | `data/costBook.ts` | B2 | UT-COSTWAVE-OPT-005, 006, 010 |
| B2 | OPT-06 OPEX read waterfall + catalogue reuse | P1 | **Done** | `costBook.ts`, `opexCatalog.ts`, `costRepository.ts`, `inflationAreas.ts` | B2 | UT-COSTREAD-OPT-015/016, UT-INFAREA-OPT-001…003 |
| B2 | OPT-07b/c/d Cost-side shared reads (currencies, chart of accounts, project states) | P1/P2 | **Done** | `sharedRead.ts`, `capexChart.ts`, `currencies.ts`, `costBook.ts`, `contracts.ts`, `landLease.ts` | B2 | UT-SHARED-OPT-001…008, UT-COSTREAD-OPT-009…017 |
| B2 | OPT-08 (a) 5,000-row pages, (b) standard assumptions server filter | P1 | **Done** | `costBook.ts`, `addCostSheet.ts` (page size only), `contracts.ts`, `standardContracts.ts` | B2 | UT-COSTREAD-OPT-001…008 |
| B2 | OPT-12 invalidation fan-out; S1-07 DevCo contracts once | P1 | **Done** (`staleTime: 0` made explicit after review) | `useCostBook.ts`, `capexInvalidation.ts`, `contracts/hooks.ts`, `keys.ts` | B2 | UT-CAPEXINV-OPT-001…008, 101…106, UT-CONTR-OPT-001…006 |
| B2 | OPT-26 (device-type gate to `om`), OPT-25 (comments key) | P2 | **Done** | `useCostBook.ts`, `OpexScreen.tsx` | B2 | UT-OPEXLOAD-005…007, UT-CAPEXINV-OPT-106 |
| B3 | OPT-10 Land Lease tiered writes | **P0** | **Done**, rule **corrected after the independent review** (only same-kind allocation writes in parallel) | `data/landLease.ts`, `landLeaseRules.ts` (`leaseWriteTiers`), `concurrency.ts` | B3 (+fix) | UT-LLWRITE-010…013, 020…025, 030…042 |
| B3 | OPT-11 OPEX save / delete / import | P1 | **Done**; (v) plan pass-through and "execute the pure planner" skipped on purpose | `data/periodWrites.ts`, `currencies.ts`, `useCostBook.ts` | B3 | UT-PWOPEX-001…014 |
| B3 | OPT-34 dead Land Lease write path | P3 | **Done** (≈450 lines; default `"all"` scope kept) | `periodWrites.ts`, `costBook.ts`, `costRepository.ts`, `useCostBook.ts` | B3 | UT-PWRITE-050 |
| B4 | OPT-25 CAPEX grid repaint / dataset / comments | **P0** | **Done** | `PcfGrid.tsx`, `Screen.tsx`, `comments.ts` | B4 | UT-PCFGRID-OPT-001…006, UT-CAPEX-OPT-001, UT-CMT-OPT-001…004 |
| B4 | OPT-26 period cards, warnings once per card | P2 | **Done** (allocation-dropdown `includes` not done) | `OpexScreen.tsx`, `LandLeaseScreen.tsx`, `opexRules.ts`, `landLeaseRules.ts` | B4 | UT-OPEX-OPT-001…006, UT-OPEXUI-OPT-001/002, UT-LLUI-OPT-001/002, UT-LLRULES-OPT-001 |
| B4 | OPT-28 (Cost) validation twice, closing split | P3 | **Done**; tree-memo split and cost-row indexing not done (outside B4's files, no gain expected); Add Cost validation **skipped** (bench: 13 ms / 6 ms) | `contracts/rules.ts`, `contracts/Screen.tsx`, period rules | B4 | UT-CONTR-OPT-001…004, UT-OPEX-OPT-007/008, UT-LLRULES-OPT-002/003 |
| B5a | OPT-13 PM reload scope | P1 | **Done** (S5-08 not applied: see D160 §8) | `team`, `grid-operator`, `planning`, `general-data` hooks + `reload.ts` files | B5a | UT-TEAM-OPT-201…203, UT-GRIDOP-OPT-201…203, UT-PLAN-OPT-201…205, UT-GDATA-OPT-101…103 |
| B5a | OPT-14 Team person cache + descriptions | P1 | **Done**; empty answers no longer remembered after review | `data/personCache.ts`, `data/team.ts`, `team/hooks.ts` | B5a | UT-TEAM-OPT-001…010, 102, 901, 902 |
| B5a | OPT-16 Planning read chain | P2 | **Done** | `planning/hooks.ts`, `Screen.tsx` | B5a | UT-PLAN-OPT-101…106 |
| B5a | OPT-19 Team search debounce | P3 | **Done**; municipality search **untouched** (DEC-6; evidence recorded) | `team/hooks.ts` | B5a | UT-TEAM-OPT-103 |
| B5a | OPT-07a/e small reads, OPT-08a Finance, OPT-24 Production | P1–P3 | **Done**; Milestones business unit now uses `fetchQuery` after review | `milestones.ts`, `production.ts`, `finance.ts`, hooks | B5a | UT-MSTONE-OPT-001…012, 101…104, 901, 902, UT-PROD-OPT-001…004, 101, UT-FIN-OPT-001…011 |
| B5b | OPT-01 PM row-only session load | P1 | **Done** (switch `PM_ROW_ONLY_PROJECT_LOAD`); country-keyed reads re-keying **not done** | `data/project.ts`, `SessionContext.tsx`, `keys.ts` | B5b | UT-PROJLOAD-OPT-001…041, UT-SESSION-OPT-001…007 |
| B5b | OPT-03 boot prefetch coverage | P2 | **Done** | `bootPlan.ts`, `bootPrefetch.ts`, `screenLoaders.ts`, `routes.tsx` | B5b | UT-BOOT-OPT-001…016 |
| B5b | OPT-07d project-state stragglers | P2 | **Done** (costBook `loadProjectStates` stays) | `projectStateLookup.ts`, `project.ts`, `projects.ts` | B5b | UT-PROJLOAD-OPT-030…041 |
| B6 | OPT-15 type delete read waves | P2 | **Done**; S4-07 supplier join and S4-08 warm-up **skipped** (need profiling) | `generators/hooks.ts`, `generatorsPerfFlags.ts` | B6 | UT-GENWAVE-OPT-001…007, 901, 902 |
| B6 | OPT-07a Generators country from the shared list | P1 | **Done** (comment corrected after review) | `data/generators.ts`, `generators/queries.ts` | B6 | UT-GENCOUNTRY-OPT-001…005, 101…104 |
| B6 | OPT-24 Check List narrow reads; OPT-30 micro-fixes | P3 | **Done** | `data/checklist.ts`, `checklistPeople.ts`, `checklist/hooks.ts`, `checklist/rules.ts`, `generators/plans.ts` | B6 | UT-CHKNARROW-OPT-001…022, UT-CHKMAT-OPT-001…004, UT-GENPLAN-OPT-001…003 |
| B7 | OPT-08c locks narrow select | P1 | **Done** | `adminChecklistTables.ts`, `adminDefaultChecklists.ts` | B7 | UT-ADCHKTBL-OPT-001…003 |
| B7 | OPT-17 gates reads, people reuse, `getEntraPeople` bound | P1 | **Done**; blank-name entries no longer reused after review | `adminGatesApprovals.ts`, `adminChecklistTables.ts`, gates `hooks.ts` | B7 | UT-ADGATE-OPT-001…015, 901, 902 |
| B7 | OPT-27 admin render derivation | P2 | **Done** | `GateTable.tsx`, gates `rules.ts`, `admin-cost`, `admin-contract`, `adminCost.ts` | B7 | UT-ADGATE-OPT-020…024, UT-ADCOST-OPT-001…004, UT-ADCONTR-OPT-001…003 |
| B7 | OPT-20 (S6-14 only), OPT-07c constants, OPT-07d clusters | P3/P2 | **Done**; S6-13 **skipped** (failure-mode change) | `adminCapexAccounts.ts`, `admin-default-checklists/hooks.ts` | B7 | UT-ADCAPEX-OPT-001…006, UT-ADCHK-OPT-001…003 |
| B8 | OPT-02 Cost screens take country/technology from the session project | P2 | **Done** | `data/project.ts`, `contracts/hooks.ts` | B8 | UT-PROJEXTRAS-OPT-002, 003, 010…016, 020…024 |
| B8 | OPT-31 `dateOnly` + `localDayOf` | P2 | **Done** (7 copies + 3 parsers) | `domain/dates.ts`, `odata.ts`, cost rules, finance, revenues | B8 | UT-DATES-OPT-001…005 |
| B8 | OPT-33 (a) `roundDown/Up`, (b) Power Fx text formatters, (c) `startsWithStandard` | P3 | **Done**; (d) `groupBy`, (e) OData `eqId`, (f) `durationMonths`, (g) dd.mm.yyyy **deferred** | `domain/numeric.ts`, `powerFxNumeric.ts`, `costStandards.ts`, `rulesCore.ts` | B8 | UT-NUMERIC-OPT-001/002, UT-PFXTEXT-OPT-001…005, UT-STANDARD-OPT-001/002 |
| B8 | OPT-29 Intl pool, `useMediaQuery`, lazy `trackMetric`, pooled collator | P3 | **Partly done** (collator only where locale/options are given) | `domain/locale.ts`, `useMediaQuery.ts`, `appInsights.ts` | B8 | UT-INTLPOOL-OPT-001…003, UT-MEDIAQUERY-OPT-001…003, UT-AI-OPT-001…003, UT-COLLATOR-OPT-001…004 |
| B8 | OPT-32 row-value coercers | P3 | **Done** (identical set only) | `data/rowValues.ts` + 11 data modules | B8 | UT-ROWVALUES-OPT-001/002 |
| B8 | OPT-34 leftovers | P3 | **Done** (`qk.adminChecklistClusters`, `loadCountryInflationAreas`; `useStableCallback` to `components/`) | `keys.ts`, `costBook.ts`, `costRepository.ts` | B8 | — |
| B9 | Independent review (3 reviewers), fixes, final verify, docs | — | **Done** — see `07` | — | 3 reviewers + orchestrator | UT-GENWAVE-OPT-901/902, UT-MSTONE-OPT-901/902, UT-TEAM-OPT-901/902, UT-ADGATE-OPT-901/902, UT-LLWRITE-038…042 |

## Not implemented

| Item | Status | Reason |
|---|---|---|
| OPT-09 `readByIds` shared bounded read helper and its ~19 call sites | **Deferred** | changes failure behaviour (`mapLimit` stops launching after the first failure, `Promise.all` lets siblings finish); wide surface; no measured 429 yet |
| OPT-33 (d)(e)(f)(g), admin helper dedupe | **Deferred** | maintainability only, wide surface |
| OPT-18 refocus policy | **Held — DEC-3** | multi-user freshness protection by design |
| OPT-21 bulk switches | **Held — DEC-4** | DEV test plan not run |
| OPT-22 guarded-update batching / SDK | **Held — DEC-7** | SDK 1.3.1 sends no `If-Match` |
| OPT-23 CAPEX panel cascade delete | **Held — DEC-5** | needs a DEV check |
| S6-07 Period-1 propagation skip, S2-05b allocation name skip | **Held — DEC-5** | canvas parity |
| S5-12 municipality debounce | **Held — DEC-6** | documented divergence of 3 Nov |
| `round` vs `pfxRound`, `Math.round` money, `asDate`, inflation twins, numeric parse stacks | **Held — DEC-1, 1b, 2, 8, 9** | change numbers or stored values |
| S4-07, S4-08 Generators supplier join / warm-up | **Skipped** | need profiling |
| S6-13 contract save removals and additions together | **Skipped** | would let additions land after failed removals |
| Add Cost from Table validation passes (S1-18, S7-16) | **Skipped** | bench shows 13 ms / 6 ms |
| OPT-01 sub-part: re-key PM country-dependent reads onto the session project | **Not done** | smaller gain, higher risk |
