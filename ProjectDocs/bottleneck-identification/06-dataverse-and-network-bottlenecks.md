# 06 - Dataverse and network bottlenecks

Stage 1 audit, agent NET. Worktree `Project-Management-Energy-WorkDev1-BottleneckOptimization`, branch `feature/bottleneck-identification-optimization`, base `dde9e92`. Read-only: nothing under `ProjectCosts-CodeApp/` was changed and nothing was run against Dataverse. Register: `_register/NET.md` (22 findings, IDs `NET-01` to `NET-22`). The asynchronous and concurrency half of this audit is `07-asynchronous-execution-bottlenecks.md`; its section "Power Automate dependencies" is the separate flow section the brief asks for.

Evidence labels: **MEASURED** = I ran it (command given); **REPO-MEASURED** = a measurement recorded in a repo document (cited); **DERIVED** = counted from code; **ESTIMATED** = reasoning. Confidence: CONFIRMED / HIGH / SUSPECTED as in the brief. Source paths are relative to `ProjectCosts-CodeApp/src/` unless stated.

## 1. Headline

1. The D165 programme's shipped changes are real in the current source: every integrity and retry switch it describes as ON is `true`, and the 13 it describes as OFF are `false` (section 3). I found no P0. Nothing in the repo measures a severe runtime degradation, and the only runtime evidence for latency is the DEV measurements of earlier programmes (section 2.1).
2. What D165 did not look at is the request lifecycle as a whole. The additions of this audit are mostly **interactions between layers**: a query-level retry that re-sends a whole fan-out (NET-02), a fan-out whose width is bounded by no gate and that the planned global gate cannot see (NET-04, NET-05), the Cost route gate that delays the Cost reads by two sequential waves (NET-01), and a route that loads the same data twice (NET-06).
3. The dominant cost of this app, by its own measurements, is the **number of sequential waves**, not payload or client CPU: "77 to 92 % of every save is server wait, 0 % client JS" (REPO-MEASURED, D144, 20 Nov 2026). I re-measured the client-side parts I could (sections 7 and the async doc): they are small next to a single round trip.
4. Because no runtime baseline exists (D165 doc 28: every cell "not measured"), I rank by derived wave count and request count and say so; magnitudes in seconds are ESTIMATED from the recorded DEV figures.

## 2. Scope, method and limits

**Read in full or in the relevant part:**
- D165 docs 00, 12, 28, 34 and the first and last parts of 27 (the per-task switch tables); section E of doc 08 (flows and server automation); greps of docs 01, 03, 04, 09, 10, 20 for the claims I cite.
- Boot and shell: `main.tsx`, `App.tsx` (shell part), `app/Providers.tsx`, `app/SessionContext.tsx`, `app/bootPlan.ts`, `app/bootPrefetch.ts`, `app/startupFlags.ts`, `app/generatorsWarmup.ts`, `app/pmScreenPrefetch.ts`, `app/routes.tsx`, `app/queryLog.ts`, `app/useCurrentUser.ts`.
- Request core: `data/client.ts`, `data/requestPolicy.ts`, `data/concurrency.ts`, `data/retry.ts` (first 80 lines), `data/sharedRead.ts`, `data/odata.ts` (chunking), `data/flows.ts`, parts of `data/project.ts`, `data/currentUser.ts`, `data/costBook.ts`, `data/landLease.ts`, `data/bulkSend.ts` (gates), `data/adminCapexAccounts.ts` (gate and clean-up flag), `platform/powerClient.ts`, `platform/requestLog.ts`, `platform/consoleGate.ts`, `platform/telemetry.ts`, `appInsights/appInsights.ts`, `appInsights/sanitize.ts`, `platform/errors.ts` (`isRetryable`).
- All 13 flag modules (list in section 3.2) and parts of `features/cost/costing/useCostBook.ts`, `features/pm/checklist/hooks.ts`, `features/pm/general-data/hooks.ts`, `features/pm/project-main/hooks.ts`, `features/pm/generators/flowBesideReads.ts`.
- The SDK: `node_modules/@microsoft/power-apps/dist/internal/data/core/data/executors/dataverseDataOperationExecutor.js` (the `Prefer` header and defaults), a grep of the whole `dist/` for abort and timeout; TanStack `query-core` 5.102.8 `query.js`, `removable.js`, `queryClient.js` (cancel and gc behaviour).
- Earlier measurements: `GENERATORS-READ-PERF-DEV-PROBE.md`, `17-ADDCOST-SAVE-PERF-PLAN.md`, and the D51, D119, D144 sections of `02-OPEN-DECISIONS.md`.

**Not read (honest list):** the Screen and rules files of most features, `executePlan.ts` and `bulkSend.ts` internals, the admin data modules beyond the flag and gate, the Fabric SQL paths, `persistedReference.ts`, the e2e harness, and D165 docs 01-11 and 13-26 apart from the greps above. Findings about those areas are carried as D165's.

**Measured by me (all throwaway, under `_bench/NET/`):**
- `scan-fetchall.mjs` over `src/`: `node scan-fetchall.mjs <src>` printed `fetchAll call sites: 157; with maxPageSize 5000: 5; without any filter text: 17` and listed the 17 (saved to `scan-fetchall.out.txt`).
- `telemetry.bench.mjs` (section 7 of doc 07).
- `npx vitest run src/features/cost/add-costs-from-table/prepare.bench.test.ts --reporter=verbose` (existing benchmark, one file; section 8 of doc 07).
- Greps quoted where used (SDK abort/timeout, `gcTime`, `signal`).

### 2.1 Latency evidence available in the repo (everything else is ESTIMATED)

| Figure | Where | Notes |
|---|---|---|
| A trivial call about 0.18 s, a normal write 0.25-0.5 s, the project roll-up PATCH 0.45-0.85 s; "77 to 92 % of every save is server wait, 0 % client JS" | D144, 20 Nov 2026 (`02-OPEN-DECISIONS.md` ~8151-8213) | Playwright on DEV from a machine "far from the DEV region"; users nearer should see less; ratios said to hold |
| A bulk request through the host measured 0.6-1.9 s, never under about 0.5 s | D51 sections 11.1, 11.16 and `17-ADDCOST-SAVE-PERF-PLAN.md` | Applies to `CreateMultiple` / `UpdateMultiple`, not to single reads. `GENERATORS-READ-PERF-DEV-PROBE.md` quotes "1.2 to 1.9 seconds per request" for all requests, which is a generalisation of the bulk figure |
| 16 per-row deletes in one pool pushed every request to about 3 s (`req avg 2971 ms`, gate peak 16/16); the writes then queued about 4 s behind them; "the host runs far fewer than 16 requests at once" | D51 sections 11.1, 11.15 (`data/bulkSend.ts:402-415`) | REPO-MEASURED: more parallelism did not mean more throughput, which is why the per-pool limits are small |
| One contract delete with its cascade 5.2 s; overlapping cascades 6-11 s each | D51 sections 11.14-11.16 | Server-side cascade cost |
| Add WTG Type with 20 turbines 3.01 s and 44-45 requests after D144; Replace Generator Type 4.30 s, 8-9 waves | D144 | The best-measured large save |
| Save of 96 Add Cost rows 1.9 s / 5 requests; 60 rows 1.6 s / 3 | D51 section 11.16 | After the bulk and deferred-delete work |

There is no measurement of cold boot, of any read, of a flow run, or of a focus refetch in the repo. `scripts/request-census.mjs` (D165) summarises `[VSB]` console captures and is the tool to produce them.

## 3. D165 status verified against the current source

Method: I opened each switch file, then grepped each switch for non-test consumers (every one except `CURRENT_USER_BY_ENTRA` has at least one; that one is declared in `bootDvoptFlags.ts:33,52` and read by no code, consistent with PB-07 "not done"). Where a D165 document and the source disagree, the source is reported.

### 3.1 Every P0 and P1 of the D165 register

| ID | Pri | Title (short) | Current status in source | Switch / evidence (current value) |
|---|---|---|---|---|
| AD-01 | P0 | CAPEX clean-up un-retried, fail-fast | **Fixed, ON** | `ADMIN_OPT.CLEANUP_RESILIENT = true` (`data/adminFlags.ts:40`); branch at `data/adminCapexAccounts.ts:453`. No Resume button (T-04 note) |
| CB-01 | P0 | Land Lease / OPEX unguarded upserts | **Fixed, ON** | `LEASE_GUARD = true`, `OPEX_GUARD = true` (`data/leaseOpexFlags.ts:20-21`) |
| CB-02 | P0 | Stale cache after partial failure | **Fixed, ON** | `COST_REFRESH_ON_FAILURE = true` (`leaseOpexFlags.ts:22`) |
| AD-02 | P1 | CAPEX clean-up volume (2 requests per zeroed row) | **Open** (T-43 not started; no bulk) | no switch; row counts never taken on DEV. Register NET-14 |
| AD-03 | P1 | `hasContracts` fan-out | **Fixed, ON** (pool of 6); focus part held (AD-04) | `ADMIN_HAS_CONTRACTS_POOL = true` (`adminFlags.ts:42`), `HAS_CONTRACTS_POOL_WIDTH = 6` (`:50`) |
| CA-01 | P1 | No retry on 429/503 for Add Cost / panel writes | **Fixed, ON** | `POLICY_CLIENT_WRITES`, `POLICY_PLAN_WRITES`, `POLICY_BULK_TRANSPORT`, `POLICY_VERIFY_READS`, `POLICY_ADMIN_WRITES` all `true` (`data/requestFlags.ts:36-48`) |
| CA-02 | P1 | No client deadline | **Switched OFF** (primitive built) | `REQUEST_DEADLINES = false` (`requestFlags.ts:20`); the SDK has no abort or timeout (MEASURED grep, section 5.3). Register NET-16 |
| CA-03 | P1 | Deferred deletes lost on tab close | **Fixed, ON** | `HOLD_TAB_FOR_DEFERRED_DELETES: true` (`data/capexOptFlags.ts:45`) |
| CA-04 | P1 | 40-id `or` chains | **Open** (T-30 needs probe P-1) | `CHUNK = 40` (`data/odata.ts:70`). Register NET-12 |
| CA-05 | P1 | Whole category book reload after a toggle/save | **Fixed, ON** | `CAPEX_PATCH_BOOK: true` (`capexOptFlags.ts:46`) |
| CB-03 | P1 | 404 on delete treated as failure | **Fixed, ON** | `GONE_AS_DONE_LEASE_OPEX = true` (`leaseOpexFlags.ts:19`); admin `ADMIN_DELETE_ALREADY_GONE_OK: true` (`adminFlags.ts:41`) |
| CB-04 | P1 | Land Lease contract delete sends every child delete | **Held (DEC-A)** | `planLeaseDelete` still emits allocation + period + header deletes (`features/cost/periods/landLeaseRules.ts:3050-3064`). Register NET-15 |
| OR-01 | P1 | `Retry-After` unreadable, 503 never retried | **Fixed, ON** (header still unreadable) | `RETRY_POLICY_V2 = true` (`requestFlags.ts:13`); `data/retry.ts:1-12` states the SDK exposes no headers |
| PA-01 | P1 | Generators bulk switches off | **Switched OFF** | all six `GENERATORS_BULK.*` false (`data/generatorsBulkFlags.ts:18-25`); `CHECKLIST_BULK.materialise = false` (`checklistBulkFlags.ts:9`). Register NET-13 |
| PA-02 | P1 | Finance bulk backend never registered | **Fixed** (dormant) | `registerDefaultBulkBackend(createGeneratorsBulkBackend)` at `data/financeBulk.ts:30`; `bulkSchedules: false` (`financeFlags.ts:43`) |
| PB-01 | P1 | Flow outcome unknown / duplicate approvals | **Open** (T-08 not started) | no switch. Register NET-17 |
| PB-02 | P1 | Municipality search cut short | **Open** (T-33 not started) | correctness, outside this audit |
| WE-02 | P1 | No retry of single-row writes | **Fixed, ON** | the five `POLICY_*` switches above |

### 3.2 The 13 switches that ship OFF, and their current values

| Switch | File:line | Value | Gates |
|---|---|---|---|
| `REQUEST_DEADLINES` | `data/requestFlags.ts:20` | false | CA-02, WE-05 |
| `GLOBAL_GATE` | `data/requestFlags.ts:26` | false | WE-03, CA-17 (see NET-05) |
| `STABLE_CREATE_IDS` | `data/leaseOpexFlags.ts:23` | false | CB-14 |
| `PANEL_STABLE_ID` | `data/capexOptFlags.ts:52` | false | CA-07 (QA-02 open) |
| `ADMIN_SCOPE_READS_ONCE` | `data/adminFlags.ts:45` | false | AD-09 |
| `ENV_VARS_TOGETHER` | `data/bootDvoptFlags.ts:34` | false | PB-08 |
| `CURRENT_USER_BY_ENTRA` | `data/bootDvoptFlags.ts:33` | false (unused) | PB-07 |
| `GENERATORS_WARMUP_LAZY` | `data/bootDvoptFlags.ts:37` | false | PB-09, PA-11 |
| `CHECKLIST_BACKFILL_TOGETHER` | `data/checklistPerfFlags.ts:74` | false | PB-14 |
| `changedRowsOnly` (Finance) | `data/financeFlags.ts:42` | false | PA-03 |
| `flowBesideReads` | `data/generatorsPerfFlags.ts:127` | false | PA-05 |
| `omGuardOneRead` | `data/generatorsPerfFlags.ts:131` | false | PA-15 |
| `PLAN_PERMISSION_LOOKUP` | `data/writePlan.ts:89` | false | WE-07 |

D165's own tracker (doc 27, "engine" section) says `PLAN_PERMISSION_LOOKUP` defaults to true; the source says false (the integration commit turned it off), which matches doc 34's "shipped OFF" list. The older, separate OFF switches (`GENERATORS_BULK.*`, `CHECKLIST_BULK.materialise`, `bulkSchedules`, Generators `readsByProject`, `optimisticToggle`, `persistCatalogue`, `GENERATORS_DELETE.verifyDeletes/parentOrder/guardedUpdates`) are not part of the 13 but also OFF.

## 4. The request lifecycle, end to end

`Screen -> hook (useQuery / useMutation / usePlanWrite) -> data module -> client helper or generated service -> SDK -> host (postMessage) -> Dataverse -> response -> row mapping -> TanStack cache -> render`

| Stage | What the code does | Where time or work is lost | Evidence | Finding |
|---|---|---|---|---|
| 1. Screen mounts | Lazy chunk, then route gates. PM gate `ProjectScreenGate` (`app/routes.tsx:130-150`) and Cost gate `CostProjectGate` (`:84-118`) render a spinner until the session project exists | Cost gate blocks the screen's queries behind the full project load | DERIVED | NET-01 |
| 2. Hook | `useQuery` with app defaults: `staleTime` 30 s, `refetchOnWindowFocus` true, retry 2 for 5xx/429/no status, default `gcTime` 5 min (`app/Providers.tsx:21-36`) | Focus re-runs whole chains; reference data is dropped after 5 min | DERIVED | NET-11, NET-08 |
| 3. Data module | Builds `$select` / `$filter` (`odata.ts`), chunks ids by 40, fans out with `Promise.all` | Width ceil(N/40) unbounded; one chunk failure fails the query | `costBook.ts:949,1079,1255` | NET-04, NET-02, NET-12 |
| 4. Client helper | `fetchAll`: 500 rows per page (`client.ts:55-56`), sequential skip-token pages, one DATA log line; `sendWithPolicy` only for writes and a few verify reads | Sequential pages; reads bypass the policy and the gate | `client.ts:58-108`, `requestPolicy.ts:184-227` | NET-07, NET-05 |
| 5. SDK | Adds `Prefer: odata.maxpagesize=<n>,odata.include-annotations=*` to every read; no abort, no timeout, no batching | Annotation payload; no cancellation; no `$batch` | `dataverseDataOperationExecutor.js:207,234`; grep of `dist/` | NET-21, NET-03, NET-16 |
| 6. Host and Dataverse | The host runs far fewer than 16 requests at once (D51); each normal request 0.2-0.5 s, a bulk one 0.6-1.9 s | Server wait is 77-92 % of a save | REPO-MEASURED (D51, D144) | all |
| 7. Response mapping | Row to view-model mapping, `rows.push(...page)`, `Map` grouping | Small: client prepare of a 15,000-row Add Cost sheet is 3-146 ms per step | MEASURED (doc 07 section 8) | none |
| 8. State | `structuralSharingWithDates` compares the new result with the cache (`app/queryStructuralSharing.ts`) | Part of the frontend audit | not mine | - |
| 9. Render | React render of the grids | Frontend audit | not mine | - |

The telemetry layer that wraps stages 4-6 (`[VSB]` console lines, App Insights dependencies) costs about 10-26 microseconds per request in Production (MEASURED, doc 07 section 7) and is not a bottleneck.

## 5. Startup, navigation and refetch behaviour

### 5.1 Cold boot waterfall (DERIVED from code; no timing exists)

`main.tsx` starts `startBootPrefetch` before the first render (`app/bootPrefetch.ts:131-157`) and the host session in parallel.

| Entry route | Critical path to first useful data | Parallel side work | Note |
|---|---|---|---|
| `#/projects` (default landing) | host context; then `projectPageOptions` page 1 (2 requests on a named page, 3-4 into the blank tail, D45), countries, project states, all prefetched together with the chunk | environment variables (2 sequential reads), current user (user row, teams, team roles: depth 3), next page after 1.5 s | prefetch is by design; PB-08 / PB-07 chains are off the content path (NET-09) |
| `#/project/<pm screen>?projectId=` | session project (PM scope = the row only, 1 request) beside the screen's own first reads (`pmScreenPrefetch.ts`, PB-03, flag ON) | the Generators warm-up 1.5 s later (10-13 reads, NET-20) | the best-prefetched route |
| `#/costs/<screen>?projectId=` (Edit Costs, new tab) | host context; project row (wave 1); country + cluster state + area (wave 2, `data/project.ts:275-279`); the gate opens; then the screen's reads: chart, contracts + payer defaults, payments + comments | env vars, current user | **5 sequential waves, 2 of them before any Cost read starts** (NET-01). Only the chunk and the session project are prefetched for a `cost` target (`bootPrefetch.ts:45-58`) |

ESTIMATED: the two project waves cost about 0.4-1.0 s of a cold Cost entry using the DEV figures in section 2.1. Each Edit Costs / Edit Project click is a new tab and repeats the whole cold boot (PB-04, held; NET-22).

### 5.2 Query policy table (what each class of query does on navigation, mount and focus)

| Class | staleTime | focus refetch | mount refetch | Examples (file) |
|---|---|---|---|---|
| App default | 30 s | yes | when stale | everything not listed (`app/Providers.tsx:27-30`) |
| Session / current user | Infinity | n/a | no | `app/SessionContext.tsx:56`, `app/useCurrentUser.ts:19` |
| Env vars / project | 15 min / 5 min | yes after staleness | when stale | `SessionContext.tsx:61-77` |
| Reference data | 15-30 min (8 separate constants) | yes after staleness | when stale | countries, project states, catalogues, gates, descriptions |
| Re-read every visit (canvas `OnVisible`) | 0, `refetchOnMount: "always"` | yes | always | OPEX book (D123), Contracts `REREAD_ON_VISIT` (`features/cost/contracts/hooks.ts:34`), Finance `EVERY_VISIT`, admin `FRESH_ON_ENTRY` (`data/adminQueryPresets.ts:14`; 0 ms stale, so also every focus: AD-04) |
| Editors | default but `NO_FOCUS_REFETCH`, `refetchOnReconnect: false` | no | when stale | Add Cost sheet (`useCostBook.ts:670`), Check List with `quietFocus` |

There is no polling (no `refetchInterval`, no `setInterval` in `src/`). `gcTime` is never set (MEASURED grep, 0 matches), so every entry is dropped 5 minutes after its last observer unmounts (NET-08). "Re-read every visit" is deliberate canvas parity (D123) and is not a finding.

### 5.3 What the SDK does not give (MEASURED)

`grep -rln "AbortController\|AbortSignal\|signal" node_modules/@microsoft/power-apps/dist` returns no files and `grep -rn timeout` returns nothing: SDK 1.3.1 has no abort, no timeout and no retry, which is also D165's claim (doc 01, point 6). The same grep over `src/` (non-test) finds only a comment. A deadline can stop waiting but cannot cancel (`data/requestPolicy.ts:10`).

## 6. Duplicated reads and over-fetching

**Duplicated reads across screens (MEASURED grep of `Service.getAll(` sites):** `vsb_projects` is read by 11 data modules (15 sites) with 11 different `$select` lists; `vsb_countries` by 7 files; `vsb_projectstates` by 3. D165 consolidated countries (`COUNTRIES_ONE_KEY` ON) and the project states (D159) and the Planning / Grid Operator row (`PM_PROJECT_ROW_SHARED` ON). Every other PM screen still reads its row separately beside the session project (NET-10). The Add Cost route duplicates the whole contract and cost read under two keys (NET-06).

**Over-fetching:**
- Every `fetchAll` and `fetchPage` call carries a `$select` (`FetchAllOptions.select` is a required field, `data/client.ts:36`, enforced by the type checker); I did not audit the roughly 250 direct generated-service calls the G-REQ gate baselines. Payload width is therefore not an app-level bottleneck except through the SDK's `include-annotations=*` (NET-21; REPO-MEASURED 106 role rows = 46 kB in D119, about 430 B per row).
- Page size is 500 at 152 of 157 `fetchAll` sites; 5 raise it to 5000 (cost rows, `costBook.ts:1093,1267`, `contracts.ts:266`, `addCostSheet.ts:224`, `finance.ts:193`). Each page is a sequential round trip, so a table of R rows costs ceil(R/500) waits at the default (NET-07, SUSPECTED because no row counts are recorded). The cap of 50 pages is 25,000 rows at 500 and a breach throws (D157, `client.ts:87-97`); it can only matter for the 5000-row reads, where it is 250,000.
- 17 whole-table reads (no filter): `adminCapexAccounts.ts:72`, `adminGatesApprovals.ts:176,189`, `contracts.ts:295`, `currencies.ts:38`, `currentUser.ts:184`, `finance.ts:74,288,301`, `generalData.ts:120,168`, `generators.ts:380,523,530`, `team.ts:100`, plus two helpers inside `bulkSend.ts:180,183`. Most are small reference tables; the three Generators catalogues and the Team descriptions are the ones whose size is unknown.

## 7. Request-count formulas (code-derived; A = accounts of a category, C = contracts in it, S = standard assumptions, P = periods, W = WTG allocations)

| Operation | Requests | Waves on the critical path | Source |
|---|---|---|---|
| Cold Cost entry, session part | 1 (row) + up to 3 (country, cluster state if not in the shared list, area) | 2 | `data/project.ts:204-285` |
| CAPEX tab load | 1 (payer defaults) + ceil(A/40) (contracts) + ceil(C/40) (payments, each page up to 5000 rows) + ceil(C/40) (comments) + ceil(S/40) (standard assumptions) + chart (30 s memo) + project states (0-1) | 3 (chart, contracts, payments), comments in wave 3 (CA-09) | `costBook.ts:949-1100`, `useCostBook.ts:121` |
| Same, one focus event after 30 s | the same formula (NET-11) | 3 | `Providers.tsx:27-30` |
| `/costs/add-from-table` cold load | CAPEX tab load + sheet load (ceil(A/40) + ceil(C/40) again) | 3 (parallel) | NET-06 |
| Land Lease contract delete | A_alloc + P + 1 deletes, in ceil(A_alloc/16) + ceil(P/16) + 1 waves (`LEASE_TIER_WIDER` ON); with it OFF the periods are one wave each: ceil(A_alloc/16) + P + 1 | see left | `landLeaseRules.ts:3036-3069`, `landLease.ts:610-614` |
| Land Lease period delete (not period 1) | 1 | 1 | `landLeaseRules.ts:3041-3048` |
| Check List "wait for the gate flow" | up to 20 reads of 1 row | up to 30 s | `checklist/hooks.ts:72-90` |
| Generators warm-up | 10-13 reads + 1 chunk, once per project | background | D165 PB-09 |

## 8. Findings summary (register `_register/NET.md`)

| ID | Pri | Conf | One line | Origin |
|---|---|---|---|---|
| NET-01 | P2 | HIGH | Cost gate delays the Cost reads by two project waves; Cost reads not prefetched | NEW |
| NET-02 | P2 | HIGH | Query-level retry re-sends a whole fan-out when one chunk fails; D165 enabled it on the heaviest reads | NEW |
| NET-03 | P3 | HIGH | No abort path anywhere; cancel and invalidate discard results only | NEW |
| NET-04 | P2 | HIGH | 17 read fan-outs, width ceil(N/40), outside every gate | NEW (OPT-09) |
| NET-05 | P2 | HIGH | The global gate cannot see query reads; pools add up | NEW (WE-03) |
| NET-06 | P2 | HIGH | `/costs/add-from-table` loads book and sheet twice | NEW |
| NET-07 | P3 | SUSPECTED | 500-row pages at 152 sites; 17 whole-table reads | NEW |
| NET-08 | P3 | HIGH | `gcTime` 5 min makes 30-min staleTimes ineffective across navigation | NEW |
| NET-09 | P3 | HIGH | Env vars and current user are not in the boot prefetch | PRIOR:PB-08 |
| NET-10 | P3 | HIGH | Eleven modules re-read the project row | PRIOR:PB-10 |
| NET-11 | P2 | HIGH | Focus refetch re-runs whole chains | PRIOR:CA-10 |
| NET-12 | P2 | SUSPECTED | 40-id chunks (probe P-1 pending) | PRIOR:CA-04 |
| NET-13 | P1 | CONFIRMED | Generators bulk OFF; 3.0 s / 45 requests for 20 turbines (D144) | PRIOR:PA-01 |
| NET-14 | P1 | HIGH | CAPEX clean-up volume unmeasured | PRIOR:AD-02 |
| NET-15 | P2 | HIGH | Land Lease delete A + P + 1 requests | PRIOR:CB-04 |
| NET-16 | P2 | CONFIRMED | No timeout or abort; deadlines OFF | PRIOR:CA-02 |
| NET-17 | P1 | HIGH | Flow outcome unknown; blocking overlay | PRIOR:PB-01 |
| NET-18 | P3 | HIGH | 30 s poll for a gate flow | NEW |
| NET-19 | P2 | HIGH | Flow before Identify reads (switch OFF) | PRIOR:PA-05 |
| NET-20 | P3 | SUSPECTED | Generators warm-up on every PM screen | PRIOR:PB-09 |
| NET-21 | P3 | HIGH | `include-annotations=*` on every read | PRIOR:D119-F6 |
| NET-22 | P2 | HIGH | New tab repeats the cold boot | PRIOR:PB-04 |

Counts: P0 0, P1 3, P2 11, P3 8. CONFIRMED 2, HIGH 17, SUSPECTED 3.

## 9. Checked and found NOT to be a bottleneck

- **Client-side CPU after a response.** The Add Cost prepare on 15,000 rows is 3-146 ms per step (MEASURED, doc 07 section 8) against round trips of 200-500 ms; a 2,668-character URL costs 10-26 microseconds to log (MEASURED, doc 07 section 7).
- **`rows.push(...page)`** in `fetchAll`: at most 5,000 spread arguments per page, far below the engine limit.
- **Missing `$select` on `fetchAll`.** Not possible by type (see section 6); not checked for direct service calls.
- **Project Overview paging.** `maxPageSize` not `$top`, count asked once per walk, forward-only token cache: D41-D46 invariants are intact in `data/client.ts:257-409`; the walk to page N is inherent to a forward-only cursor and capped at 100 pages.
- **Retry stacking on writes.** `insideOwnRetry` and the `policy` option keep one retry layer per request (D165 UT-COSTSTACK-*); I found no second layer on the write paths. The stacking I found is between the query retry and the chunked reads (NET-02), a layer D165's test does not cover.
- **Polling.** There is exactly one polling loop (NET-18); no `setInterval` or `refetchInterval` exists.
- **Timers I opened** (the next-page prefetch at `features/pm/project-main/hooks.ts:204-206` and the Generators warm-up at `app/generatorsWarmup.ts:72-87`) clear themselves on unmount; none is a bottleneck.
- **Console and App Insights gates.** Prod prints nothing and drops the lines; the held-line buffer is capped at 1,000 and the telemetry queue at 100 before the connection string is known.
- **Persisted reference cache.** Present only for the generator catalogue and OFF; nothing to fix, it is a candidate (NET-08, NET-22).

## 10. Limitations

- No live Dataverse, host or browser was used. Every request count is derived; every latency in seconds is borrowed from the REPO-MEASURED table above and applies to one machine and one DEV region.
- The number of contracts, accounts, periods, allocations and catalogue rows per project is not recorded in the repo. NET-04, NET-06, NET-07 and NET-15 depend on those counts, and I give formulas, not totals.
- D165's probes P-1 to P-5 have not been run (doc 28). Statements about `In`, navigation filters, `UpdateMultiple` with `statecode`, throttling behaviour and host timeouts stay unproven.
- Where the brief said 15 columns and listed 17, I used the 17 listed names in the register.
