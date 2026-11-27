# 18 — Optimisation architecture

> Stage 2, 26 Nov 2026. Target architecture and the full task catalogue (43 tasks). The per-finding 12-field specifications (current implementation, root cause, proposed implementation, technical and user benefit, dependencies, functional and performance risk, complexity, required tests, acceptance criteria, rollback) are written for every P1 and every recommended action in `_stage2/A…E-rca-and-strategy.md`; this document summarises them and fixes the design rules that make the tasks consistent. Nothing here changes behaviour until Stage 3 is approved.

## 1. Design principles (apply to every task)

1. **Reuse before building.** Many remedies are an existing, tested switch (`GENERATORS_WARMUP_LAZY`, `ENV_VARS_TOGETHER`, `changedRowsOnly`, `WIDE_GROUP_CONCURRENCY`, the bulk backend). The work is a DEV check and a flip, not new code.
2. **One definition per helper** (CONVENTIONS rule 17): new shared pieces (`readChunks.ts`, `queryPolicy.ts`, `costQueries.ts`, an intent-prefetch helper) are added once and every screen uses them.
3. **Every behaviour-changing task ships behind a named switch constant** in the repo's flags-file pattern, with the default decided by the decision/probe gate, so rollback is one constant (doc 24).
4. **Canvas parity is a gate, not a casualty** (CONVENTIONS rules 7-8): a change that differs from the canvas carries `DIVERGENCE:`, a `…CanvasParity` twin, a test and an `02-OPEN-DECISIONS.md` entry, and waits for the owner.
5. **Benefits are stated in rounds, waves, requests, bytes or renders**, with seconds only where D144/D51 recorded a unit cost. Probe P-0 (cost of one read through the host) must run before any wave becomes a promised number, because D144 and D51 disagree by 4-10x.
6. **Preserve write guarantees**: existence guards, owning-business-unit bind, write-order pins (UT-CHKPERF-004), idempotency of retries, no blind retry of non-idempotent writes, no unbounded concurrency.

## 2. Target architecture by layer

| Layer | Today | Target |
|---|---|---|
| **Screen entry** | Boot prefetch covers the session project and five PM screens, for a boot deep link only; Cost reads wait behind `CostProjectGate` | One prefetch registry: Cost, Production, Revenues (Finance reference-only), PM screens and admin chunks; plus bounded hover/focus intent prefetch for in-app navigation. Not applied to keys that re-read on every mount |
| **Freshness** | One global policy: 30 s staleTime, refetch on visibility, default 5 min gcTime | Tiered query policy: reference data gets `gcTime = staleTime`; advisory checks opt out of focus refetch; the global policy itself (DEC-F / DEC-3) is NOT changed without the owner; measured first (M-C02) |
| **Reads** | 17 id-chunk fan-outs of width ceil(N/40) outside every gate; whole query re-run when one chunk fails | One bounded read lane (width 16 = 40 - 24); chunk-level retry; read deadlines only after probes P-4/P-5 (queries bypass `sendWithPolicy`) |
| **Writes** | One request per row, GET-then-PATCH guard, bulk switches OFF | Width increases where DEV shows no 429 (8 to 16); size-gated bulk where it wins (about 60+ rows); changed-rows-only writes after owner decisions; chunked existence guard after DEC-7 |
| **After-save reloads** | Many saves await a reload before the user can continue | Patch the cache from what landed; reload in the background behind a busy guard; one per-job `refresh` option in `usePlanWrite.ts` shared by Check List, Revenues, Finance and Land Lease |
| **Module boundaries** | `data/` imports 46 times from `features/`; barrels drag whole screens | Pure helpers imported from `domain/`; three small reads split out of heavy modules; an import-direction guard test (`importGraph.test.ts`) |
| **Rendering and CPU** | Mostly sound; few real hot spots | Nothing changes until the browser campaign (T-D00) shows a regression-free win of at least 20 % and 10 ms median with p90 within +5 % |
| **Flows** | Called inside blocking jobs | Unchanged flows; app-side only: start the rows read beside the flow, surface a timeout, measure flow time. A non-modal UX is the owner's decision |
| **Measurement** | No runtime baseline | Browser protocol BM-01..13 (doc 22), request/round pins in the repo's harness tests, `[VSB]` console lines, Application Insights (D161) |

## 3. Task catalogue

### Wave 0: measurements, probes and test-only enablers (no behaviour change)

| Task | Title | Findings | Gate before it ships | Expected effect (basis in doc 22) | Rollback |
|---|---|---|---|---|---|
| **T-A08** | Check List harness: honest baseline, add S7/S8 flow scenarios | SPA-01/02/03/05 (enabler) | none (test file only) | Corrects the shipped Move baseline (about 34 requests, not 37) and gives Request Approval/Cancel a before/after | revert the test |
| **T-D00** | Browser measurement campaign (13 scenarios BM-01..13), no code | RND-01/14, CMP-01/02/06, MEM-03, RND-04/07/13, SAD-17, SCC-20, SPB-17 | needs a signed-in Chrome on DEV, reference projects, about 3 h | Turns 28 MEASURE-FIRST items into measured or closed | n/a (results table only) |
| **T-E08** | DEV probe pack (row counts, Fabric latency, cold/repeat HAR) and switch decisions | SAD-01, SPB-06, SPB-12, SPB-14, BND-11, BND-16 | a developer on DEV | Decides six findings; SPB-14 is a switch flip | n/a |

### Wave 1: behaviour-neutral fixes that need no decision or probe

| Task | Title | Findings | Gate before it ships | Expected effect (basis in doc 22) | Rollback |
|---|---|---|---|---|---|
| **T-E01** | Import the pure helper, not the module (Generators barrel, shared project states, bulk descriptors) | BND-03, BND-06, BND-07 | none | Cold-cache bytes only: landing -16 KiB gz; Planning, Grid Operator, Revenues about -20; Finance -22 (MEASURED in a scratch rebuild) | revert commit |
| **T-E02** | Split three small reads out of heavy data modules | BND-04 (+BND-18) | none | Milestones 128 to 68, General Data 118 to 77, Revenues 141 to 104 KiB gz (with T-E01) | revert commit |
| **T-E03** | Import-direction guard test (data to features) | BND-18 | after T-E01/02 | Keeps the savings from regressing | delete the test |
| **T-D04** | Gates fatal-state traced once, not per render | RND-09 | none | Telemetry correctness (no speed effect) | revert commit |
| **T-C08** | Static splash in index.html | BND-09 | none | Perceived first paint while the graph evaluates | revert commit |
| **T-E05** | Locks and clusters reads start with the tab list | SAD-02 | none | One fewer hop on a cold Check List Settings entry | revert commit |
| **T-B07** | Clean-up unload guard (admin CAPEX Accounts) | SAD-05 | none | Resilience (not speed) | revert commit |
| **T-E06** | Keep comment dots while the category key changes (opt-in) | SCC-16 | none | No flicker after create/delete contract | revert commit |
| **T-A05** | General Data edit save: shareholder writes concurrent (width bounded) | SPA-14 | tracking rebuild stays out until the QA-07 DEV order check | N sequential shareholder writes become concurrent | revert commit |

### Wave 2: entry, read path and freshness (shared infrastructure)

| Task | Title | Findings | Gate before it ships | Expected effect (basis in doc 22) | Rollback |
|---|---|---|---|---|---|
| **T-C01** | Cost entry prefetch: shared Cost query options + boot prefetcher | SCC-01 (SCC-11, SCC-15 supported) | probe P-0 and M-C01 to state the benefit in time | 2 waves off every Cost deep link (about 0.4-1.0 s, unmeasured); Edit Costs lands on Summary | switch constant (default per DEV check) |
| **T-C02** | Production and Revenues boot prefetchers (Finance: reference reads only) | SPB-02 | none | 1 wave off a Production/Revenues deep link | switch constant |
| **T-C03** | In-app hover/focus intent prefetch for every PM rail entry + admin loaders | BND-17, SPA-09 | bounded, with telemetry line | Removes the chunk+reads waterfall of a first in-app visit | switch constant |
| **T-A04** | Generators lazy warm-up and shared intent delegation | SPA-10, BND-13 group | owner decision after a hit-rate capture; shares helper with T-C03 | Stops speculative Generators traffic on every PM screen | switch GENERATORS_WARMUP_LAZY (exists, OFF) |
| **T-C04** | Freshness tier 1: reference preset with gcTime = staleTime, has-contracts focus opt-out, chart memo | NET-08, SAD-06 (part), SCC-14, BND-02 (measure) | owner note for SCC-14 (5-minute chart staleness); DEC-F for the rest | Reference data survives navigation for its stale time; no focus refetch of advisory checks | per-constant revert |
| **T-C05** | One read lane (width 16) for the 17 id-chunk reads | NET-04 group | must land before write tasks touch the same data modules | Bounds read fan-out; waves unchanged up to 16 chunks | switch constant |

### Wave 3: write-path and reload changes (each needs a DEV check or decision first)

| Task | Title | Findings | Gate before it ships | Expected effect (basis in doc 22) | Rollback |
|---|---|---|---|---|---|
| **T-B05** | Land Lease panel Save: guards together, allocation tier 16 wide | SCC-06, SCC-09 | DEV check of 16 in flight (no 429 on vsb_landleaseallocationwtgs) | 5 to 3 rounds at 40 allocations | switch (leaseOpexFlags) |
| **T-B01** | Production first-save generation: groups 16 wide | SPB-01 (part 1) | DEV 16-wide check with [VSB] lines; rows and owning BU identical to the 8-wide run | 30 turbines: 22 to 5 (+1) rounds (about 8.8 to 2.9 s derived) | WIDE_GROUP_CONCURRENCY back to 8 |
| **T-B02** | Production allocations as one createMany | SPB-01 (part 2) | GENERATORS-BULK-DEV-TEST-PLAN GB-30/31/33/71 pass on DEV | 200 turbines: 109 to 5 (+1) rounds, 831 to 39 requests | new productionBulkFlags (OFF) |
| **T-B03** | Generators size-gated bulk (allocations, turbines only) | NET-13 | GB-30/31/50-53/70-72 + B0 baseline; bulk wins from about 64 rows | Large Add Type/Turbine saves; keep status/applyAll/replace OFF | GENERATORS_BULK.* switches |
| **T-B04** | CAPEX panel delete: pool width 4 to 8 (cascade unchanged) | SCC-02 | GB-13-style DEV table at 4/8/16 | 17 to 10 rounds at 58 months | tuning constant |
| **T-A01** | Check List row action: patch rows cache from the landed write, no awaited reload | SPA-01 | DEV check that no server flow reacts to checklist-row writes; owner wording on row freshness | 3 to 2 rounds and 3 to 2 requests per click | switch in checklistPerfFlags |
| **T-B08** | Background reload for Revenues and Finance saves (busy guard) | SPB-09 | DECISION (canvas divergence); one per-job refresh API shared with T-A01/02/03 | One read round off every save | switch |
| **T-B09** | Background reload for Land Lease saves | SCC-07 | DECISION; after T-B05 and T-B08 | One reload wave (2 waves, 4 requests) off the save | switch |
| **T-A02** | Move to next cluster: one pre-flight existence read and lean reload | SPA-02 | DECISION on the Move write-order pin (UT-CHKPERF-004 split into write pin and read pin) | 11 to 10 rounds, about 4 fewer requests | switch |
| **T-A03** | Request Approval/Cancel: rows read beside the flow; measure flow ms | SPA-03 (steps 1-2) | flow ms measured on DEV; non-modal UX is a separate DECISION | About 1 round; flow time itself unchanged | switch |

### Wave 4: decision-gated and reliability work

| Task | Title | Findings | Gate before it ships | Expected effect (basis in doc 22) | Rollback |
|---|---|---|---|---|---|
| **T-B06** | Admin chunked existence guard | SAD-07, SAD-08, SAD-09 (part), NET-14 (zero phase) | DEC-7 (race window of a one-chunk guard) | Requests 2n to n + n/40; latency 2*ceil(n/8) to 1 + ceil(n/8) | adminFlags switch |
| **T-B10** | Revenues: write only changed Individual volumes | SPB-07 | DECISION (canvas modifiedon/audit parity) | 73 requests / 7 rounds today (36 volumes) reduced to the changed rows | data/revenuesFlags |
| **T-B11** | Finance: flip changedRowsOnly | SPB-08 | DECISION; bulk stays OFF (adds rounds) | 34 requests / 6 rounds reduced to the changed rows | financeFlags (one line) |
| **T-D01** | Municipality search (options O0-O5: debounce, client filter, windowing) | RND-02 group, RND-14 | DEC-6; BM-01; probe P-1 truncation | Per typed word requests k to about 1 (debounce) or 0 (client filter) | gdPerfFlags |
| **T-A09** | Flow outcome handling and poll-timeout message | NET-17, SPA-04 | owner wording (D165 T-08) | Reliability: no silent timeout; ambiguous flow outcome surfaced | switch |
| **T-E07** | Azure Maps token request beside the chunk download | BND-05 | DECISION (flow-call timing) | Removes the serial flow round trip after the 1.7 MB chunk | revert one effect |
| **T-A06** | Flip ENV_VARS_TOGETHER after the QA-09 DEV check | BND-12 group | QA-09 DEV check | One read round off boot (small) | ENV_VARS_TOGETHER = false |
| **T-A07** | Entra mails off the critical path | SPA-05, SPA-08 | DEV Entra measurement + D156 section 6 decision | 1-2 Entra rounds on a cold Check List visit | switch |
| **T-C06** | Chunk-level read retry and read deadline | NET-02, NET-16 | after T-C05, probes P-4/P-5, M-C04 | A failed chunk no longer restarts the whole fan-out; hung reads end | requestFlags |
| **T-C07** | Gate hygiene: O(1) pump | CMP-04 | only together with enabling GLOBAL_GATE | Hygiene (invisible below 3,500 queued writes) | revert commit |

### Wave 5: measure-first items (only if the Wave 0 measurements justify them)

| Task | Title | Findings | Gate before it ships | Expected effect (basis in doc 22) | Rollback |
|---|---|---|---|---|---|
| **T-D02** | CAPEX grid: cache the parse, trim repaint | CMP-01, CMP-02 | BM-03, BM-04 show it dominates; trap: applyStandardContractOptions mutates the cached tree | Removes 6.8-112 ms per fold (Node figure) | revert commit |
| **T-D03** | Add Cost first-edit pre-pass off the first keystroke | CMP-06 (CMP-05) | BM-06 | About 120 ms off the first edit (Edge, D140) | revert commit |
| **T-D05** | On-demand Tooltip | RND-04 | BM-08 | Fewer Tooltip mounts on Gates and Check List | revert commit |
| **T-D06** | Idle warm of the first panel/dialog/dropdown | RND-07 | BM-10 and the idle-work decisions | First-open cost moved to idle | revert commit |
| **T-E04** | Cost chunk decoupling spike (costBook split by scope) | BND-08, SCC-19 | stop if the saving is under 11 % | Unknown until the spike | discard branch |


## 4. Per-task specifications

For each task the full 12-field specification is in the owning agent's document:

| Task prefix | Document | Sections |
|---|---|---|
| T-A* (Check List, PM core, flows) | `_stage2/A-rca-and-strategy.md` | section 5 onward, tasks table at line 190 |
| T-B* (writes, deletes, reloads) | `_stage2/B-rca-and-strategy.md` | sections 5.1-5.10, tasks table section 7 |
| T-C* (entry, freshness, reads) | `_stage2/C-rca-and-strategy.md` | sections 3-5, tasks table at line 262 |
| T-D* (render, CPU, memory) + measurement protocol | `_stage2/D-rca-and-strategy.md` | section 3, tasks at line 270 |
| T-E* (reads, bundle, coupling) | `_stage2/E-rca-and-strategy.md` | section 4, tasks at line 245, measured first-wave table section 3 |

## 5. Alternatives rejected on evidence

| Alternative | Why not |
|---|---|
| Enable every D165 bulk switch | Bulk is slower than singles below about 60-100 rows (Generators), adds rounds on Finance, and was never run on DEV |
| Delete children via the server cascade (CAPEX, Land Lease) | The cascade took 5.2 s for one contract (D51) and the canvas deletes children explicitly; the saving is not proven (DEC-A) |
| Short `gcTime` on the cost book or Add Cost sheet | Fights the D51 design (patching an unmounted book, `refetchType: "all"`) and D165 rule C6 |
| Add the environment-variable read to the boot prefetch | A no-op (the first render follows in the same turn) |
| Lazy-load `costRepository` members | Measured +1.5 to +6 KiB gz worse |
| A vendor chunk to reduce chunk churn | Changed files 80 to 78 of 149: nothing |
| Request deadlines on reads via `REQUEST_DEADLINES` | Query reads never go through `sendWithPolicy` |
| Memoise the small form screens (General Data, Planning, Milestones, Team) | About 2 ms per keystroke in the dev build: not worth it |
