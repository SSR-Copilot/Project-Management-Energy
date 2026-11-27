# 24 — Rollback and contingency strategy

> Stage 2, 26 Nov 2026. Every Stage 3 task must be reversible without data repair and without touching another task. The repo's own pattern is used throughout: a behaviour change ships behind a named constant in a flags file (as D51's `BULK_SAVE`, D165's 13 switches and D144's `replaceLanes` do), a structural change is one reviewable commit.

## 1. Rollback principles

1. **Switch first, revert second.** A task that changes behaviour adds (or reuses) a switch whose OFF value is the current behaviour; rolling back is changing one constant and re-deploying. Structural tasks (imports, tests, splash) roll back by reverting their commit.
2. **One task, one commit group, no entanglement.** Doc 20's shared-file locks stop two tasks editing one function; a task can be reverted without conflict if it is the last change to its files.
3. **No schema and no flow changes exist to undo.** Data written by a changed write path (for example rows created by a bulk call) is the same rows the single-write path would have created, with the same owning business unit; rolling the code back does not orphan or alter them. The exception to check per task: a changed-rows-only write (T-B10/T-B11) leaves unchanged rows with an older `modifiedon`, which is its intended and owner-approved effect, so the rollback restores the old write pattern from then on only.
4. **Defaults follow the gate.** A switch whose gate (decision, probe, DEV check) has not passed ships OFF, as D165 did for 13 switches. Turning it ON is a separate, recorded step after the gate result.
5. **Never deploy to DEV or push without approval.** Rollback of a deployed task is the user's decision; the plan gives the exact constant or commit.

## 2. Per-task rollback

| Task | Title | Wave | Gate it must clear | Rollback |
|---|---|---|---|---|
| T-A08 | Check List harness: honest baseline, add S7/S8 flow scenarios | 0 | none (test file only) | revert the test |
| T-D00 | Browser measurement campaign (13 scenarios BM-01..13), no code | 0 | needs a signed-in Chrome on DEV, reference projects, about 3 h | n/a (results table only) |
| T-E08 | DEV probe pack (row counts, Fabric latency, cold/repeat HAR) and switch decisions | 0 | a developer on DEV | n/a |
| T-E01 | Import the pure helper, not the module (Generators barrel, shared project states, bulk descriptors) | 1 | none | revert commit |
| T-E02 | Split three small reads out of heavy data modules | 1 | none | revert commit |
| T-E03 | Import-direction guard test (data to features) | 1 | after T-E01/02 | delete the test |
| T-D04 | Gates fatal-state traced once, not per render | 1 | none | revert commit |
| T-C08 | Static splash in index.html | 1 | none | revert commit |
| T-E05 | Locks and clusters reads start with the tab list | 1 | none | revert commit |
| T-B07 | Clean-up unload guard (admin CAPEX Accounts) | 1 | none | revert commit |
| T-E06 | Keep comment dots while the category key changes (opt-in) | 1 | none | revert commit |
| T-A05 | General Data edit save: shareholder writes concurrent (width bounded) | 1 | tracking rebuild stays out until the QA-07 DEV order check | revert commit |
| T-C01 | Cost entry prefetch: shared Cost query options + boot prefetcher | 2 | probe P-0 and M-C01 to state the benefit in time | switch constant (default per DEV check) |
| T-C02 | Production and Revenues boot prefetchers (Finance: reference reads only) | 2 | none | switch constant |
| T-C03 | In-app hover/focus intent prefetch for every PM rail entry + admin loaders | 2 | bounded, with telemetry line | switch constant |
| T-A04 | Generators lazy warm-up and shared intent delegation | 2 | owner decision after a hit-rate capture; shares helper with T-C03 | switch GENERATORS_WARMUP_LAZY (exists, OFF) |
| T-C04 | Freshness tier 1: reference preset with gcTime = staleTime, has-contracts focus opt-out, chart memo | 2 | owner note for SCC-14 (5-minute chart staleness); DEC-F for the rest | per-constant revert |
| T-C05 | One read lane (width 16) for the 17 id-chunk reads | 2 | must land before write tasks touch the same data modules | switch constant |
| T-B05 | Land Lease panel Save: guards together, allocation tier 16 wide | 3 | DEV check of 16 in flight (no 429 on vsb_landleaseallocationwtgs) | switch (leaseOpexFlags) |
| T-B01 | Production first-save generation: groups 16 wide | 3 | DEV 16-wide check with [VSB] lines; rows and owning BU identical to the 8-wide run | WIDE_GROUP_CONCURRENCY back to 8 |
| T-B02 | Production allocations as one createMany | 3 | GENERATORS-BULK-DEV-TEST-PLAN GB-30/31/33/71 pass on DEV | new productionBulkFlags (OFF) |
| T-B03 | Generators size-gated bulk (allocations, turbines only) | 3 | GB-30/31/50-53/70-72 + B0 baseline; bulk wins from about 64 rows | GENERATORS_BULK.* switches |
| T-B04 | CAPEX panel delete: pool width 4 to 8 (cascade unchanged) | 3 | GB-13-style DEV table at 4/8/16 | tuning constant |
| T-A01 | Check List row action: patch rows cache from the landed write, no awaited reload | 3 | DEV check that no server flow reacts to checklist-row writes; owner wording on row freshness | switch in checklistPerfFlags |
| T-B08 | Background reload for Revenues and Finance saves (busy guard) | 3 | DECISION (canvas divergence); one per-job refresh API shared with T-A01/02/03 | switch |
| T-B09 | Background reload for Land Lease saves | 3 | DECISION; after T-B05 and T-B08 | switch |
| T-A02 | Move to next cluster: one pre-flight existence read and lean reload | 3 | DECISION on the Move write-order pin (UT-CHKPERF-004 split into write pin and read pin) | switch |
| T-A03 | Request Approval/Cancel: rows read beside the flow; measure flow ms | 3 | flow ms measured on DEV; non-modal UX is a separate DECISION | switch |
| T-B06 | Admin chunked existence guard | 4 | DEC-7 (race window of a one-chunk guard) | adminFlags switch |
| T-B10 | Revenues: write only changed Individual volumes | 4 | DECISION (canvas modifiedon/audit parity) | data/revenuesFlags |
| T-B11 | Finance: flip changedRowsOnly | 4 | DECISION; bulk stays OFF (adds rounds) | financeFlags (one line) |
| T-D01 | Municipality search (options O0-O5: debounce, client filter, windowing) | 4 | DEC-6; BM-01; probe P-1 truncation | gdPerfFlags |
| T-A09 | Flow outcome handling and poll-timeout message | 4 | owner wording (D165 T-08) | switch |
| T-E07 | Azure Maps token request beside the chunk download | 4 | DECISION (flow-call timing) | revert one effect |
| T-A06 | Flip ENV_VARS_TOGETHER after the QA-09 DEV check | 4 | QA-09 DEV check | ENV_VARS_TOGETHER = false |
| T-A07 | Entra mails off the critical path | 4 | DEV Entra measurement + D156 section 6 decision | switch |
| T-C06 | Chunk-level read retry and read deadline | 4 | after T-C05, probes P-4/P-5, M-C04 | requestFlags |
| T-C07 | Gate hygiene: O(1) pump | 4 | only together with enabling GLOBAL_GATE | revert commit |
| T-D02 | CAPEX grid: cache the parse, trim repaint | 5 | BM-03, BM-04 show it dominates; trap: applyStandardContractOptions mutates the cached tree | revert commit |
| T-D03 | Add Cost first-edit pre-pass off the first keystroke | 5 | BM-06 | revert commit |
| T-D05 | On-demand Tooltip | 5 | BM-08 | revert commit |
| T-D06 | Idle warm of the first panel/dialog/dropdown | 5 | BM-10 and the idle-work decisions | revert commit |
| T-E04 | Cost chunk decoupling spike (costBook split by scope) | 5 | stop if the saving is under 11 % | discard branch |

## 3. Triggers that mean "roll back or stop"

| Trigger | Action |
|---|---|
| A browser or DEV measurement shows no gain by the doc 22 rule (median at least 20 % and 10 ms, p90 within +5 %) | Revert the task; record the result; the finding becomes ACCEPT |
| A 429 or lock stall appears on DEV after a width or bulk change | Set the width/bulk constant back; do not raise it again without probe P-4 |
| A write-order, owning-BU or row-content difference versus the old path on DEV | Switch OFF immediately; keep the failing sample for the test |
| `UnknownOutcomeError` appears for a write | Keep deadlines OFF; investigate with the read-back before any retry |
| The start-up closure grows | Revert the prefetch/barrel change that caused it |
| A bundle spike saves under 11 % (T-E04) | Discard the branch |
| A canvas-parity test fails | Treat as a defect in the task, not in the test; do not edit the test to pass |
| Another session changes a locked shared file | Stop, rebase plan agreed with the owner of that session; no automatic merge |

## 4. Contingency

- **If DEV access is not available**: Wave 0 browser/DEV items stay open, Waves 3-5 do not start; Waves 1-2 (structure, prefetch, reference tier) can proceed with request/round/byte pins only, and their benefit in seconds stays unclaimed.
- **If the owner declines a decision**: the dependent task is marked ACCEPT with the decision recorded, and nothing is built around it (no half-implementation behind a permanently OFF switch).
- **If a downgraded P1 turns out to matter in production telemetry** (Application Insights, D161): re-open it from doc 16; the validated priority is a statement about the evidence available now.
- **If Stage 3 is interrupted**: each wave ends with `npm run verify` green, so the last completed wave is a safe stopping point. Worktrees and branches are listed in doc 33 as they are created.
