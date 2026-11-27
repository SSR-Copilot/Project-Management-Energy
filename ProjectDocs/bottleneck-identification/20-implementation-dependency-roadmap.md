# 20 — Implementation dependency roadmap

> Stage 2, 26 Nov 2026. Dependency-aware order for Stage 3. The brief's suggested sequence was adapted to the actual dependencies: measurement comes first because 28 findings are measure-first and 21 wait on a probe or a decision; structure-only bundle work needs nothing and can start at once; shared-file tasks are serialised.

## Wave 0: measurements, probes and test-only enablers (no behaviour change)

| Task | Specialist | Gate | Shared files (one owner at a time) |
|---|---|---|---|
| T-A08 Check List harness: honest baseline, add S7/S8 flow scenarios | Independent QA | none (test file only) | features/pm/checklist/checklistVisit.bench.test.tsx |
| T-D00 Browser measurement campaign (13 scenarios BM-01..13), no code | Independent QA | needs a signed-in Chrome on DEV, reference projects, about 3 h | - |
| T-E08 DEV probe pack (row counts, Fabric latency, cold/repeat HAR) and switch decisions | Dataverse and Network | a developer on DEV | - |

## Wave 1: behaviour-neutral fixes that need no decision or probe

| Task | Specialist | Gate | Shared files (one owner at a time) |
|---|---|---|---|
| T-E01 Import the pure helper, not the module (Generators barrel, shared project states, bulk descriptors) | Bundle and Initialization | none | data/projectStates.ts, data/generalData.ts, pm/*/rules.ts |
| T-E02 Split three small reads out of heavy data modules | Bundle and Initialization | none | data/revenues.ts, data/costBook.ts, pm/milestones, pm/general-data/hooks.ts |
| T-E03 Import-direction guard test (data to features) | Bundle and Initialization | after T-E01/02 | src/test/importGraph.test.ts |
| T-D04 Gates fatal-state traced once, not per render | React Performance | none | admin-gates-approvals/Screen.tsx |
| T-C08 Static splash in index.html | Bundle and Initialization | none | index.html, styles/global.css |
| T-E05 Locks and clusters reads start with the tab list | Dataverse and Network | none | admin-default-checklists/Screen.tsx |
| T-B07 Clean-up unload guard (admin CAPEX Accounts) | Screen-Level | none | admin-capex-accounts/Screen.tsx |
| T-E06 Keep comment dots while the category key changes (opt-in) | State Management | none | useCostBook.ts, capex-costs/Screen.tsx |
| T-A05 General Data edit save: shareholder writes concurrent (width bounded) | Async and Concurrency | tracking rebuild stays out until the QA-07 DEV order check | pm/general-data/rules.ts |

## Wave 2: entry, read path and freshness (shared infrastructure)

| Task | Specialist | Gate | Shared files (one owner at a time) |
|---|---|---|---|
| T-C01 Cost entry prefetch: shared Cost query options + boot prefetcher | Bundle and Initialization | probe P-0 and M-C01 to state the benefit in time | app/bootPrefetch.ts, bootPlan.ts, useCostBook.ts, contracts/hooks.ts |
| T-C02 Production and Revenues boot prefetchers (Finance: reference reads only) | Bundle and Initialization | none | app/pmScreenPrefetch.ts, pm/{production,revenues,finance}/hooks.ts |
| T-C03 In-app hover/focus intent prefetch for every PM rail entry + admin loaders | Bundle and Initialization | bounded, with telemetry line | app/screenLoaders.ts, routes.tsx, components/LeftNav.tsx |
| T-A04 Generators lazy warm-up and shared intent delegation | Bundle and Initialization | owner decision after a hit-rate capture; shares helper with T-C03 | app/generatorsWarmup.ts |
| T-C04 Freshness tier 1: reference preset with gcTime = staleTime, has-contracts focus opt-out, chart memo | State Management | owner note for SCC-14 (5-minute chart staleness); DEC-F for the rest | data/queryPolicy.ts (new), capexChart.ts, admin-capex-accounts/hooks.ts |
| T-C05 One read lane (width 16) for the 17 id-chunk reads | Async and Concurrency | must land before write tasks touch the same data modules | data/readChunks.ts (new), costBook.ts, contracts.ts, landLease.ts, +6 more |

## Wave 3: write-path and reload changes (each needs a DEV check or decision first)

| Task | Specialist | Gate | Shared files (one owner at a time) |
|---|---|---|---|
| T-B05 Land Lease panel Save: guards together, allocation tier 16 wide | Dataverse and Network | DEV check of 16 in flight (no 429 on vsb_landleaseallocationwtgs) | data/landLease.ts, landLeaseRules.ts |
| T-B01 Production first-save generation: groups 16 wide | Dataverse and Network | DEV 16-wide check with [VSB] lines; rows and owning BU identical to the 8-wide run | pm/production/rules.ts |
| T-B02 Production allocations as one createMany | Dataverse and Network | GENERATORS-BULK-DEV-TEST-PLAN GB-30/31/33/71 pass on DEV | pm/production/rules.ts, hooks.ts, data/productionBulk.ts (new) |
| T-B03 Generators size-gated bulk (allocations, turbines only) | Dataverse and Network | GB-30/31/50-53/70-72 + B0 baseline; bulk wins from about 64 rows | pm/generators/plans.ts, data/generatorsBulkFlags.ts |
| T-B04 CAPEX panel delete: pool width 4 to 8 (cascade unchanged) | Dataverse and Network | GB-13-style DEV table at 4/8/16 | data/capexWrites.ts |
| T-A01 Check List row action: patch rows cache from the landed write, no awaited reload | Screen-Level | DEV check that no server flow reacts to checklist-row writes; owner wording on row freshness | pm/checklist/hooks.ts, reload.ts, data/usePlanWrite.ts |
| T-B08 Background reload for Revenues and Finance saves (busy guard) | State Management | DECISION (canvas divergence); one per-job refresh API shared with T-A01/02/03 | data/usePlanWrite.ts, pm/{revenues,finance}/hooks.ts |
| T-B09 Background reload for Land Lease saves | State Management | DECISION; after T-B05 and T-B08 | useCostBook.ts |
| T-A02 Move to next cluster: one pre-flight existence read and lean reload | Screen-Level | DECISION on the Move write-order pin (UT-CHKPERF-004 split into write pin and read pin) | pm/checklist/hooks.ts, rules.ts |
| T-A03 Request Approval/Cancel: rows read beside the flow; measure flow ms | Async and Concurrency | flow ms measured on DEV; non-modal UX is a separate DECISION | pm/checklist/hooks.ts |

## Wave 4: decision-gated and reliability work

| Task | Specialist | Gate | Shared files (one owner at a time) |
|---|---|---|---|
| T-B06 Admin chunked existence guard | Dataverse and Network | DEC-7 (race window of a one-chunk guard) | data/adminRowWrites.ts, adminFlags.ts, adminCost.ts, +3 |
| T-B10 Revenues: write only changed Individual volumes | Dataverse and Network | DECISION (canvas modifiedon/audit parity) | pm/revenues/rules.ts, data/revenues.ts |
| T-B11 Finance: flip changedRowsOnly | Dataverse and Network | DECISION; bulk stays OFF (adds rounds) | data/financeFlags.ts |
| T-D01 Municipality search (options O0-O5: debounce, client filter, windowing) | React Performance | DEC-6; BM-01; probe P-1 truncation | pm/general-data/hooks.ts, Screen.tsx, data/generalData.ts |
| T-A09 Flow outcome handling and poll-timeout message | Async and Concurrency | owner wording (D165 T-08) | pm/checklist/hooks.ts:535-640, rules.ts (MSG) |
| T-E07 Azure Maps token request beside the chunk download | Bundle and Initialization | DECISION (flow-call timing) | pm/general-data/Screen.tsx |
| T-A06 Flip ENV_VARS_TOGETHER after the QA-09 DEV check | Dataverse and Network | QA-09 DEV check | data/bootDvoptFlags.ts |
| T-A07 Entra mails off the critical path | Async and Concurrency | DEV Entra measurement + D156 section 6 decision | data/checklist.ts, hooks.ts |
| T-C06 Chunk-level read retry and read deadline | Async and Concurrency | after T-C05, probes P-4/P-5, M-C04 | data/readChunks.ts, client.ts |
| T-C07 Gate hygiene: O(1) pump | Async and Concurrency | only together with enabling GLOBAL_GATE | data/concurrency.ts |

## Wave 5: measure-first items (only if the Wave 0 measurements justify them)

| Task | Specialist | Gate | Shared files (one owner at a time) |
|---|---|---|---|
| T-D02 CAPEX grid: cache the parse, trim repaint | Business Logic and Algorithm | BM-03, BM-04 show it dominates; trap: applyStandardContractOptions mutates the cached tree | capex-costs/pcf/ui/GridRenderer.js |
| T-D03 Add Cost first-edit pre-pass off the first keystroke | Business Logic and Algorithm | BM-06 | add-costs-from-table/spreadsheet/SpreadSheet.tsx |
| T-D05 On-demand Tooltip | React Performance | BM-08 | components/RowActions.tsx, GateTable.tsx |
| T-D06 Idle warm of the first panel/dialog/dropdown | React Performance | BM-10 and the idle-work decisions | components/FormPanel.tsx |
| T-E04 Cost chunk decoupling spike (costBook split by scope) | Bundle and Initialization | stop if the saving is under 11 % | data/costBook.ts, costRepository.ts |


## Ordering constraints (the reasons)

1. **T-A08 first** among the Check List tasks: it corrects the bench so T-A01/02/03 have an honest before/after.
2. **T-C05 before the write tasks that touch the same data modules** (`costBook.ts`, `contracts.ts`, `landLease.ts`): they edit the same files.
3. **One `usePlanWrite.ts` API**: T-A01, T-A02, T-A03 and T-B08 all need a per-job `refresh` option; it is designed and implemented once (owner: T-A01), then T-B08 reuses it.
4. **`pm/checklist/hooks.ts`** (T-A01, T-A02, T-A03, T-A09, T-A07) has a single owner and the order A08, A01, A02, A03, A09, A07.
5. **T-E01 and T-E02 before T-E03**, and T-E04 only after T-E02.
6. **T-C07 only together with turning on `GLOBAL_GATE`**; the gate also needs a read-side answer (T-C05) first.
7. **T-B02 and T-B03 after the Generators bulk DEV test plan** (GB-30/31/33/50-53/70-72); T-B01 does not need bulk, only the DEV check that 16 in flight causes no 429.
8. **Deadlines (T-C06) after T-C05 and probes P-4/P-5**; if enabled, a timed-out bulk request becomes `UnknownOutcomeError` and Production's hook must read `maybeLanded`.
9. **T-C03 and T-A04 share the intent-delegation helper** (`app/generatorsWarmup.ts`): one implementation.
10. **Wave 5 items start only if Wave 0's browser measurements show their finding dominates.**

## After the waves (the brief's steps 11-14)

Integrated performance testing, functional regression, validation against the Wave 0 baselines, final documentation: tracked in docs 25-33 (Stage 3). Each wave ends with `npm run verify` green in its worktree before the next starts.
