# 08 - Transaction and Dependency Analysis

> Stage 1 audit, 25 Nov 2026. Branch `feature/dataverse-network-performance-optimization`, from `origin/RounakDev1` at `30afece`. Investigation only: no application source file was changed. Every request count is **code-derived**, not measured. 

Atomicity, ordering, partial failure, compensation. No operation in this app is transactional across requests.

**8 findings name this area** (a finding naming several areas appears in each; its primary area is listed first in its block).

| ID | Pri | Conf | Title |
|---|---|---|---|
| CA-03 | P1 | High | Deferred deletes are not protected against closing or reloading the tab (live flags) |
| CB-04 | P1 | Medium | Land Lease contract delete sends every child delete although the header delete cascades them (and would be atomic) |
| PA-02 | P1 | High | Finance `bulkSchedules` relies on a bulk backend that Finance never registers (latent partial save) |
| CA-07 | P2 | Medium | CAPEX panel Add/Edit has no compensation after a partial failure, and its Add create is not idempotent |
| CA-14 | P2 | Medium | CAPEX panel Delete: four sequential phases of per-row deletes (re-raise of OPT-23 with new evidence) |
| PA-14 | P2 | High | Roll-ups are computed from the screen's snapshot, not from the server (lost update across users and tabs) |
| PB-05 | P2 | High | Planning writes rows from inside query functions |
| WE-04 | P2 | Medium | Creates are not idempotent: an ambiguous failure plus a user retry can duplicate a row |

## Classification of every multi-operation save

Independent, sequentially dependent, transactionally dependent, conditionally dependent, or needing compensation.

### Cost A: CAPEX/DEVEX, Add Cost from Table, shared costing layer

| Save | Operations | Classification | Notes |
|---|---|---|---|
| Add Cost, existing contracts only | contract UpdateMultiple, stage-A cost Create/UpdateMultiple, deferred cost deletes | **Independent** writes (disjoint rows, `claimCostId` guarantees no shared id) plus **conditionally dependent** totals (the contract total is written before the cost rows it sums change) and **needs compensation** (`reconcileTotals` after any failure) | `addCostSheetBulk.ts` module note; the reconcile runs only while the tab lives (CA-03) |
| Add Cost, with new contracts | contract CreateMultiple, then stage-B cost CreateMultiple | **Sequentially dependent** (a cost binds to the new contract id); overall **not transactional**, **needs compensation** (reconcile skips new contracts whose create is unverified: `unverifiedContractIds`) | residual, documented in D51: a new contract created by a failed attempt, then removed from the sheet before the retry, is left as an orphan |
| Add Cost, deferred deletes | contract deletes (cascade) and cost deletes after the writes settle | **Conditionally dependent** on the writes (late start so cascade locks never meet writes); cost deletes **need compensation** (background totals reconcile) | CA-03 |
| Add Cost, parallel chunks of one group | up to 8 requests of one CreateMultiple/UpdateMultiple | each request **atomic**, the group is **not**; `BulkPartialWriteError.landedIds` plus stable ids make a retry idempotent | `bulkWrites.ts:358-385` |
| CAPEX panel Edit | contract PATCH in parallel with the month Create/UpdateMultiple, then month deletes | contract and months **independent in order, dependent in meaning** (total versus rows), **needs compensation** (none today: CA-07); deletes **sequentially dependent** on the upsert (a failed upsert skips them, `capexWrites.ts:754-760`) | |
| CAPEX panel Add | contract POST, then month CreateMultiple | **Sequentially dependent**; **needs compensation** (orphan contract without months), no stable id (CA-07) | |
| CAPEX paid toggle on a linked contract | `clearLinkedCluster` PATCH, then `setCostPaid` PATCH | **Sequentially dependent** by design; **needs compensation** if the second fails (link cleared, month not paid) | `costRepository.ts:315-316` |
| CAPEX panel Delete | comments, then months, then contract | **Sequentially dependent** (children first) with fail-stop between phases; a partial failure leaves a smaller line, never an orphan comment (CA-18 rule) | |
| Comments panel Save | deletes, roots, replies | **Sequentially dependent** (parent ids, numbering); a partial failure keeps what landed and refetches | |
| Add Cost retry | refresh read, plan, verify, writes | **Conditionally dependent**: verify decides create versus update per row | `addCostSheetBulk.ts:896-940` |

Evaluation of the reference implementations (not assumed optimal):
- **Add Cost bulk orchestrator.** Strong on failure recovery: stable ids, verify-on-retry, reconcile, 404-as-gone with read-back, per-action 501 fallback, own delete gates so cascades never hold write slots. Weak points: no retry on 429/503 (CA-01), no deadline (CA-02), background work not protected on unload (CA-03), ungated verify reads (CA-17), a post-save refetch burst (CA-06). "Totals written before their rows exist, repaired by a reconcile" is a deliberate latency trade (one request fewer per contract) that depends on the tab staying alive; it is sound only together with CA-03.
- **Request tuning** (`TUNED_BULK_TUNING`: minChunk 10, parallel 8, write gate 24). The code calls it PROVISIONAL: "UNVERIFIED until the probe: that 8+ requests on one table in parallel keep a and b ... and that 24 in flight raises no 429s" (`bulkSend.ts:121-123`). No recorded probe result was found in the files read; this audit makes no timing claim (G5).
- **CAPEX panel bulk save.** Same primitives, smaller blast radius; lacks the compensation and idempotency of the sheet path (CA-07) and still pays the full category reload (CA-05).
- **Evaluated and rejected.** (1) Building the Add Cost sheet from the cached CAPEX book: the sheet's select is now a subset of `loadCostLines`' (the comment at `useCostBook.ts:543-545` that says the sheet "needs different columns" is outdated), but the sheet is the freshness anchor for no-op detection and R-12 protection, so a cached snapshot is unsafe; only the comment is stale. (2) Parallelising comment roots (breaks `createdOn` numbering). (3) A page size above 5,000 (platform maximum per the `costBook.ts` comment).

### Cost B: Contracts, OPEX, Land Lease, periods

| Operation | Steps | Classification | Notes |
|---|---|---|---|
| Contract save (Dev/Constr.) | contract (GET + PATCH, or POST) → link creates → link deletes | **sequentially dependent** (creates need the contract id) and **needs compensation** | Non-transactional (D6). On link failure `ContractLinksError` carries the id so the retry updates (`contracts.ts:553-561`, `Screen.tsx:803-804`). Creates before deletes so a failure never leaves zero links |
| Contract save (Project Rights) | contract only | single request | `hooks.ts:263` |
| Contract delete | 1 DELETE | atomic (server cascade to targets and links, §6) | |
| Payment target save / delete | 1 request (+ guard GET) | independent | |
| Land Lease save (panel) | header → allocation creates → updates → deletes → period → followers | header→children **sequentially dependent** for a new contract (`parentRef`); the three steps are **independent by design** (`independentSteps`, FT-BR-LEASE-089); followers **conditionally dependent** on the period update | Partial application is the canvas behaviour. A retry re-runs the diff (idempotent for allocations). The D118 followers heal on the next save |
| Land Lease delete, Period 1 | allocations → periods → header | **transactionally dependent** in intent, executed as a non-transactional sequence; **needs compensation** on partial failure (retry, blocked by CB-03) | A server cascade would make it atomic (CB-04) |
| Land Lease delete, Period 2+ | 1 DELETE | single | |
| Land Lease import | header(s) → allocations, periods (bound to the header ref) | **sequentially dependent** on the header id; **needs compensation** (a header without periods, a duplicate on retry: CB-02) | |
| OPEX save | row → (head) child read → cascade → re-chain; (child) siblings read | cascade and re-chain **conditionally dependent** (a head with children; a start/months change or drift) | Cascade and re-chain failures are non-fatal warnings (canvas `IfError`), so the row can be saved while some children are not |
| OPEX delete | child read → children → head | **sequentially dependent** and required: `vsb_ParentCost` is `RemoveLink` (§6), so deleting only the head would turn children into heads | Children first keeps an interrupted delete renderable |
| OPEX import | existence → assumptions → head → rest (bound to the head) | **sequentially dependent** on the head id; partial failure **needs compensation** (the user deletes the partial chain; the server check blocks a re-import) | `OPEX_IMPORT_PARALLEL` changes the `createdon` order only |

### PM A: Generators, Production, Revenues, Finance

No save is transactional (no changeset on the SDK). "Compensation" names what the app does after a partial failure.

| Save | Steps (order) | Dependencies | Partial-failure behaviour | Compensation |
|---|---|---|---|---|
| Generators Add WTG Type | type POST → turbines group → [flow, out of country] → [device type + allocations + roll-up] wave | turbines bind `createdRowRef(0)`; allocations bind turbine ids; device row needs the autonumber (from the POST response) | type with fewer turbines / no allocations; roll-up may be missing | `createRollback` **off**: none, error text only. On: delete landed + maybe-landed rows, "Retry cleanup" |
| Turbine save | turbine → (siblings group) → type totals → roll-up (edit); turbine → one wave (new) | allocations bind the new turbine | totals and roll-up may be stale | none |
| Delete turbine / WTG type / PV type | [cancel flow] → Identify reads → leaf group (16) → cascade group (4) → type/turbine delete (`confirm`) → roll-up | plan built from the reads | DEL-5 message lists removed / not removed | none (re-run is safe: 404 counts as gone) |
| Toggle status | [type + turbines] wave → roll-up | none between rows | some turbines toggled | none |
| Replace WTG / PV | Identify → cancel flow → detach updates → leaf deletes → old type delete → new type + units → `then`: flow → device row, allocations, O&M re-links, roll-up | new rows bind created ids; delete lane never overlaps create lane (D115 decision 5) | old type gone, new one partial | none |
| Simple / inverter / substructure | row write → roll-up (→ flow for an Other Supplier) | none | roll-up missing | none |
| Production yield Save | 4 reads → yield → group (children, revenue sync, superseded) → `then`: 2 reads → roll-up → job 2: generation | children bind the yield | roll-up / generation not run | none; generation runs at the next qualifying save (`shouldGenerate`) |
| Production generation | 2 read waves → dependency waves of creates (`stopOnFailure`) → flags PATCH (barrier; fires 3 async plugins) | periods / allocations bind created costs | some standard contracts created, flags not set | none; the existing-count guard (`countStandardContracts`) then skips the families that already exist at the next run |
| Revenues contract Save | ids read → contract → delete group → create group | volumes bind the contract | contract updated, fewer volumes (D136 §2) | none |
| Revenues balancing | one write | plugin computes the dates | — | — |
| Finance tranche Save | dup check → tranche → one group (`stopOnFailure`) [→ bulk steps, off] | children bind the tranche | tranche saved, schedule partial | none (PA-02 adds a latent case) |
| Finance tranche Delete | children group (`stopOnFailure`) → tranche | tranche only after its children | children partly deleted, tranche kept | none |
| Finance option cascade | project PATCH → inputs status group | — | partial cascade | none |
| Finance visit seeds | option + seeds one group, no `stopOnFailure` | independent rows | each failure named | none (next visit re-seeds what is missing) |

---

### PM B: boot, Project Overview, PM screens, Cluster Checklist

None of these is transactional. The SDK offers no `$batch` or changeset, and the host wraps each request in its own batch envelope. All-or-nothing would need a custom API.

| Save | Steps (in order) | Dependency class | On a partial failure |
|---|---|---|---|
| **GD edit save** (`Screen.tsx:552-569`) | ① PATCH project (+② Patch #2) → [③ cancellation flow, `IfError` swallowed, logged] → ④ PATCH project (Draft return) → ⑤ tracking upserts ×~7 → ⑥ shareholder upserts ×M → ⑦ Draft tracking create | ①→④ order is canvas parity; ⑤ depends on ④ (the canvas order, `SynchroniseProjectState`); ⑤ rows are independent of each other; ⑥ is independent of ⑤; ③ is independent and its result ignored | `PartlySavedJobError` ("N of M saved", `usePlanWrite.ts:236-264`). The reload runs on every outcome (`onSettled`). No compensation. A failure in ⑤ leaves the trackings half-rebuilt, with the project already back on Draft |
| **GD create** (`Screen.tsx:519-545`) | POST project (server: `CreatingTeamsandSPOSite`) → GET re-read (autonumber) → Patch #2 + children `concurrent` | The re-read depends on the POST; the children are independent | The project exists either way; the form switches to it (`:542-544`), so a retry cannot create it twice |
| **GD cluster panel + save** (`:584-597`) | job 1 PATCH project (milestone dates; `staleOnly` reload) → job 2 = the edit save | job 2 only if job 1 succeeded | A failed job 1 → `reloadAll()`, and the main save does not run |
| **Milestones save** (`rules.ts:1402-1440`) | PATCH project → N × PATCH generator type → PATCH project (plant cost) → POST default revenue | The plant cost is computed in the client (no read dependency on the type writes); the revenue seed is independent | Sequential prefix landed; reported. The plugins (COD, construction, end date) fire on the first PATCH |
| **Planning visit seeds** (`hooks.ts:100-149`) | POST planning row → GET; N × POST acquisition statuses → GET | independent creates | Traced and swallowed (canvas parity); PB-05 |
| **Check List Move** (`rules.ts:1498-1565`) | (GET+PATCH) current → Completed; (GET+PATCH or POST) next → In Progress; POST note (refers to the current tracking, `createdRowRef(0)`); PATCH project cluster state + Approved | The note depends on ①'s id; the project PATCH is canvas order. Server: `SynchroniseProjectState` on ② (In Progress), `UpdateTeamsandSPOSite` on the project PATCH | Analysis issue 7: a failure after ① leaves no In Progress cluster; reported as "N of M", no resume step |
| **Check List Reset / Terminal** (`hooks.ts:479-505`) | fresh GET → tracking writes (+ project for Terminal) → note | sequential, canvas order | as above |
| **Check List Request Approval** (cluster) (`hooks.ts:535-566`) | GET → guarded PATCH/POST tracking → **flow** → [poll ≤ 30 s] → GET rows → POST note | the flow needs the tracking id (`first.createdIds[0]`) | A flow failure → `PartlySavedJobError`; PB-01 |
| **Check List Request Approval** (task) (`:512-533`) | GET task → guarded PATCH (In Progress) → **flow** → guarded PATCH (write-back if `runid`) + POST note | The write-back depends on the flow's `runid` | PB-01 dead end |
| **Check List Cancel gate approval** (`:570-593`) | GET → guarded PATCH (In Progress, `FlowRunId` blank) → **flow** → POST note | The payload uses the tracking read *before* the patch (keeps `FlowRunId`) | Analysis issue 9: the cancel button disappears when the flow fails |
| **Check List first-visit copy** (`:411-444`) | GET ×2 → (templates) → N × POST (16 wide) | independent creates | D158 `completeCopy` finishes an interrupted copy on the next visit, if the cluster is untouched |
| **Check List back-fill** (`:393-403`) | GET → ≤7 tracking upserts (sequential) | independent rows; the flow fires on In Progress | PB-14 |
| **Team / Grid Operator / Planning job / Overview delete** | 1 write | — | single request: atomic |

---

### Admin screens and the shared write engine

No admin flow is transactional: the SDK has no changeset and the host wraps each request alone, so all-or-nothing needs a custom API (platform constraint).

| Flow | Ops (in order) | Dependency | Classification | Compensation / reporting today |
|---|---|---|---|---|
| CAPEX create | number ‖ order reads → POST → G+P Inactive | POST needs both reads; PATCH needs id | strict sequence, 2 writes | `inactiveError` → warning "still Active"; no rollback |
| CAPEX deactivate account (status) | child list → account G+P → S subaccount G+P (8 wide) | children independent of each other | sequential phases, parallel leaf | `PartialStepError` with steps and in-step count (`adminCapexAccounts.ts:454-469`); gone child skipped |
| CAPEX clean-up | contract reads → cost reads → zero ‖ delete | zero and delete disjoint rows (`:373-379`) | independent leaf pools, idempotent on rerun | `PartialStepError` per phase; **no resume** (AD-01) |
| CAPEX delete account | children ‖ contracts guards → DELETE | guards before delete | check-then-act (narrow race) | `DeleteBlockedError` |
| CAPEX reorder / Milestones save | n × G+P | independent rows | independent; Milestones collects all, reorder fail-fast | `RowWriteError.partial` / per-row outcome |
| Costs OPEX save (edit P1) | G+P → re-read → k × G+P → flag G+P (seq) | propagation after a successful P1 write and from saved values | sequential phases + independent leaf | `OpexFollowUpError`; `repairLastFlags` re-reads and repairs once (`adminCost.ts:725-743`) |
| Costs OPEX add period | read → POST → flag G+P | flag after create | strict sequence | `normaliseLastFlags` → repair |
| Costs OPEX delete contract | read → m DELETE one by one, tail first | contiguity (deliberate order) | strict sequence | `ContractDeleteError(deleted, total, flagIssue)` + repair |
| Costs OPEX delete period | read (last-period check) → DELETE → re-read → flag | sequence | strict sequence | `OpexFollowUpError` |
| Contracts save | DevCo ownership read → parent → R deletes (16) → A creates (8) | removals before additions (S6-13 kept, D160 §10) | sequential phases, parallel leaf | `ContractSaveError(phase, contractId)`; retry updates the same parent and re-plans from a fresh read (idempotent) |
| Check List add task | POST → G+P status | flow copies status on update only (D18) | strict sequence (server-dependent order) | `TaskStatusNotSetError` → drawer switches to edit |
| Check List delete | G+P `todelete` → renumber (4 wide) | renumber only if step 1 landed | sequence + independent leaf | `RenumberAfterDeleteError` |
| Gates / DEVEX / Milestones single writes | 1 write (2 requests if guarded) | — | single | typed error via `runPlan` |
| Engine generic plan | plan order; `together()` groups parallel; bulk steps whole | plan-defined | sequential steps, parallel runs | `PlanError(done,total,landed,deleted,maybeLanded,failures)`; `PartlySavedJobError` for `then` |

---

## Server-side, plug-in and Power Automate dependencies (documentation only; no flow is to be modified)

### Cost A: CAPEX/DEVEX, Add Cost from Table, shared costing layer

From `ProjectDocs/migration-plans/04-flow-inventory.md`:
- `vsb_devexcapexstandardassumptions` Delete (pre-validation): `VSB_CapexAssumptionDeletion` batch-deletes every `vsb_capexprojectcontract` and `vsb_capexcost` built from that standard cost (`04-flow-inventory.md:66`). Not triggered by these screens' writes, but relevant to any cascade-timing assumption (CA-14).
- `vsb_project` Update of `vsb_capexstandardcontractscreated` triggers InitialCapexCostsCreate (`:59-61`): project-level, not fired by Cost-screen writes.
- `LoadDevexCapexCostTotalCapacityTrigger` (`:29`, `:83`): "keep callable ... after project cost edits when existing Canvas behavior requires it" lists Capex Costs as a caller. No code in this scope calls a flow (grep of the scope found none), so any recalculation is not requested by these saves.
- `KNOWN-RISKS-AND-DECISIONS.md` (D51 section 11.8): "No plugin or flow exists on these tables today"; lock contention and cascade timing (about 5.2 s per contract on DEV, D51 section 11.14) would change if one is added.
- `vsb_capexcosts` has no project lookup (`generated/models/Vsb_capexcostsModel.ts:87-89` shows only `_vsb_contract_value` and `_vsb_capexcontractstandardassumption_value`), which is why every cost read goes through contract-id chunks (CA-04).

### Cost B: Contracts, OPEX, Land Lease, periods

- **Flows and plugins:** none on these tables. The verified inventory (`04-flow-inventory.md`, "Verified 2026-10-19") lists the
  server-triggered flows on `vsb_projectdefaultchecklists`, `vsb_projectstatetracking` and `vsb_project`. Its plugin steps are on
  `vsb_project`, `vsb_balancingprice`, `vsb_devexcapexstandardassumptions`, `vsb_bopcontractsstandardassumptions` (pre-validation
  delete) and `vsb_bopcontractsstandardassumptiondevcocosts`. None of them fires on a write of `vsb_bopprojectscontracts`,
  `vsb_bopcontractspaymenttargets`, `vsb_bopcontractsdevcocosts`, `vsb_landlease*` or `vsb_opexprojectcosts`. So bulk messages
  (CB-06, CB-10) have no plugin to re-check. An admin delete of a BoP standard assumption deletes project BoP contracts server-side
  (`VSB.BoPContractAssumptionDeletion`), which the Contracts screen sees on its next re-read (staleTime 0).
- **Relationship cascades** (`ProjectDocs/_extracted/VSBCloud/customizations.xml`, solution 1.21.709; re-check live):

  | Relationship | line | CascadeDelete |
  |---|---|---|
  | `vsb_bopcontractsdevcocosts_BoPContract_vsb_bopprojectscontracts` | 157963 | Cascade |
  | `vsb_bopcontractspaymenttargets_BoPProjectContract_vsb_bopprojectscontracts` | 158033 | Cascade |
  | `vsb_landleaseallocationwtg_ProjectCost_vsb_la` | 159923 | Cascade |
  | `vsb_landleaseperiod_ProjectCost_vsb_landlease` | 159958 | Cascade |
  | `vsb_opexprojectcost_ParentCost_vsb_opexprojec` | 160378 | **RemoveLink** |
  | `vsb_*_Project_vsb_project` (contracts, lease costs, OPEX costs) | 158243, 160028, 160413 | Cascade |

- `vsb_vsb_fabricsyncjob_vsb_opexprojectcost_vsb_RegardingObjectId` (`:162128`) is a relationship only; no flow writes it from
  these screens.

### PM A: Generators, Production, Revenues, Finance

- **`LoadDevexCapexCostTotalCapacityTrigger`** (flow, `vsb_project` Modified on the plant capacity columns → `vsb_fabricsyncjobs` row). Fired by every Generators roll-up (PA-04).
- **`RequestModulePermission`** (`483a3074-…`) and **`Requestpermissioncancellation`** (`1a8b4be8-…`), through `data/flows.ts:175,193` (`runFlow`: logged, unwrapped, **no app-level timeout, no retry**, correct for a non-idempotent flow). Both write the type row's request fields themselves. A slow flow holds the one-job guard (`Screen.tsx:641-660`). `16-PM-FLOWS-IN-THE-CODE-APP.md` notes a run-only connection issue for the Generators flows (§3b); check it before measuring.
- **Production plugins** on `vsb_project` Update: `InitialP50StandardCapexContractCreate`, `InitialP50StandardBOPContractsCreate`, `InitialCapexCostsCreate` (async), fired by the generation's flags PATCH only (`production/hooks.ts:17-20`). `SynchroniseRecalculationCapexStandardCost` is NOT called (commented out in the canvas).
- **Revenues**: "Balancing-price period date sync" plugin on `vsb_balancingprice` Create/Update (dates computed server-side, so the balancing reload must stay).
- **Finance**: no flow or plugin on the four Finance tables (`finance/hooks.ts:26-36`); the project plugins that read financing inputs fire from other screens.
- **Dataverse cascades relied on**: type delete → turbines and device-type rows; yield delete → seasonality and negative prices; contract delete → hedge volumes.
- **Fabric SQL connectors** (D54): `AssumptionsRevenue` (Production, Revenues), `AssumptionsDebt` / `AssumptionsBanks` / `AssumptionsKfWTranche` (Finance). Read-only, cached 30 min; their latency is outside the app's control.
- **Needs a Dataverse custom API** (not implementable client-side): an atomic Generators type create (type + turbines + allocations + roll-up), an atomic Revenues contract + volumes save, and a server-side roll-up (would also solve PA-14).

---

### PM B: boot, Project Overview, PM screens, Cluster Checklist

##### E.1 Flows the code app calls (`data/flows.ts`, D81). Each is started under the signed-in user; its actions run under the solution's connection references (`16-PM-FLOWS…md` §3)

| Flow (DEV id) | Called from | Inputs (`flows.ts`) | Returns | What the flow writes server-side (from the docs and comments) | Client must NOT | Client guards today |
|---|---|---|---|---|---|---|
| Perform Common Request of Gate Approval (`7235fad7-…`) | Check List, Request Approval, cluster mode (`hooks.ts:551-553`) | `text_1` ProjectGUID, `text_2` StateGUID, `text_3` StateTrackingGUID, `text_4` DefaultApprovalGUID (`flows.ts:118-130`) | `runid`, `approvalid` | Updates the tracking row itself (FlowRunId / approval fields; `16-PM-FLOWS…md` §5). For an "Only Notifications" gate it moves the cluster on by itself seconds after it answers (`hooks.ts:554-559`). Calls a child flow (`04-flow-inventory.md`). Sends approvals, mails and Teams cards | Write the tracking's flow fields or move the cluster for an Only-Notifications gate (the client polls instead, `waitForClusterTransition`, ≤ 20 × top-1 reads) | Busy gate + blocking overlay; fresh-read stale refusal (`rules.ts:3139-3143`); no timeout; PB-01 |
| Perform Common Request of Check List Approval (`b0b35f43-…`) | Check List, Request Approval, task mode (`hooks.ts:528-531`) | `text_1` ProjectGUID, `text_2` ProjectChecklistGUID, `text_4` DefaultApprovalGUID, `text` CurrentProjectStateGUID | `runid`, `approvalid` | Starts the task approval; the canvas (and the code app) writes FlowRunId / FlowApprovalId back only when `runid` comes back (`rules.ts:2186-2199`) | Write the write-back without a `runid` | Stale refusal on In Progress / Completed; PB-01 dead end |
| Perform Request of Gate Approval Cancellation (`d68b3a66-…`) | Check List, Cancel Approval Request (`hooks.ts:584-589`); General Data start-cluster change while the Draft approval runs (`general-data/hooks.ts:255`) | `text` AppId (`vsb_ProjectManagementAppID`), `text_1` 13-field JSON (Check List) or the 15-field variant (General Data) | nothing | Cancels the approval named by `FlowApprovalId` (which the pre-patch keeps) | Clear `FlowApprovalId` before the flow (it does not) | C7 blank-AppId refusal before any write (`hooks.ts:575-577`); General Data swallows a failure (`IfError(…, false)`, logged, `hooks.ts:256-258`) |
| Perform Request of Check List Approval Cancellation (`67e2929f-…`; **not in the 1.21.709 export**) | Check List row ✕ (`hooks.ts:596-605`) | `text` CheckList GUID | `success` | Cancels the task approval | — | A `success: false` raises an error (DIVERGENCE from the canvas, `hooks.ts:601-602`); busy gate |
| Get Azure Maps SAS Token (`5ebce9d1-…`) | General Data map (`platform/azureMapsToken.ts:164`) | none | `sastoken`, `expiresutc` or `errorcode` | ARM `listSas`; no Dataverse write | — | One call per token lifetime per browser (memory + `localStorage`, background refresh, `azureMapsToken.ts:11,118-130`) |
| Request Module Permission / Request permission cancellation | Generators only | — | — | Out of this scope (Generators auditor) | — | — |

##### E.2 Server-triggered automation this scope's writes fire (`04-flow-inventory.md`, verified 19 Oct 2026)

| Automation | Trigger | Fired by (this scope) | What it does | Implication for the client |
|---|---|---|---|---|
| `SynchroniseProjectState` | `vsb_projectstatetracking` Added/Modified on `vsb_approvalclusterstate`, acts when the new value is In Progress | GD tracking rebuild and Draft tracking; Check List back-fill, ensure-tracking, Move (next → In Progress), Reset, Activate, the gate-cancel patch (In Progress) | Sets the project's Cluster State to that tracking's cluster | The Check List Move **also** PATCHes the project's cluster state itself (`rules.ts:1554-1564`, canvas parity): two writers of the same value. Do not remove it (parity) and do not add more. A reload after these jobs must include the session row (it does: `checklistWriteKeys` includes `qk.project`) |
| `UpdateTeamsandSPOSite` | `vsb_project` Modified on `vsb_clusterstate` | Every GD save (Patch #1 writes `vsb_clusterstate` via `Coalesce`, `general-data/hooks.ts:13-16`); Check List Move, Terminal changes; the `SynchroniseProjectState` update itself | Teams / SharePoint update, Croatia only, only when the value really changed (audit log) | It can fire twice on a Move (client PATCH + flow); harmless by its own audit-log check |
| `CreatingTeamsandSPOSite-ProjectCreation` | `vsb_project` Added | GD New Project create | Creates the Teams/SharePoint site, updates the project | The client re-reads the row after the create (`Screen.tsx:534`) and must not write the SPO/Teams URL columns |
| `SynchroniseProjectTaskList-Add_Update` | `vsb_projectdefaultchecklists` Added/Modified (Business Unit scope) | Admin screens only (not this scope); it writes `vsb_projectchecklists` for projects tracking that cluster | Copies template changes into project rows | It can add rows to a project cluster that the Check List copy also fills; D158 `completeCopy` compares template ids, so it does not duplicate |
| Plugins on `vsb_project` Update (`vsb_operationsstartdatecod`, `vsb_construction`, `vsb_enddate`) | column filters | Every Milestones save (`milestones/hooks.ts:10-16`) | Senior-debt rebalancing, balancing-price sync, decommissioning sync (some async) | The client re-reads, never recomputes; the Finance / Revenues caches are invalidated (`qk.revenuesAll`, `milestones/hooks.ts:288`) |
| `WhenProjectDatagetsupdated-SendE-MailCardtoPortfolioManagers` | unknown (missing from the export) | possibly every project update | mail cards | **Unknown.** Any extra project PATCH (for example GD Patch #2, now skipped when a no-op) could send a mail. Treat project PATCH count reductions as behaviour-relevant until this is located |

Team (`vsb_projectmembers`), Planning (`vsb_projectplanning`, `vsb_permit`, `vsb_aquisition*`) and Grid Operator (`vsb_gridoperator`) fire no flow and no plugin (`team/hooks.ts:15-19`, `planning/hooks.ts:24-29`, `grid-operator/hooks.ts:17-20`).

---

### Admin screens and the shared write engine

| Admin write | Server automation | Consequence for this audit |
|---|---|---|
| Check List Settings: any create/update on `vsb_projectdefaultchecklists` | Flow `SynchroniseProjectTaskList-Add_Update` (Added or Modified, all columns, BU scope): copies fields to every eligible project checklist; status only on Update; hard-deletes when `vsb_todelete = true` | Every order PATCH (AD-07), the create-then-update pair (2 runs per add) and every edit fan out server-side. The write order must be kept (create then update). Do not batch these into a form the flow cannot see. |
| Costs: DELETE `vsb_devexcapexstandardassumptions` | Plugin `VSB_CapexAssumptionDeletion` (pre-validation, synchronous): batch-deletes every project `vsb_capexprojectcontract` and `vsb_capexcost` built from the row | A single click can be a long server transaction; an ambiguous 504 is reported as failure while the server may finish. Project caches are not invalidated (AD-11). |
| Contracts: DELETE `vsb_bopcontractsstandardassumptions` | Plugin `VSB.BoPContractAssumptionDeletion` (pre-validation): deletes template DevCo costs, every project `vsb_bopcontractsdevcocosts` and every `vsb_bopprojectscontracts` built from it | Same as above (AD-11). |
| Contracts: create / update of `vsb_bopcontractsstandardassumptiondevcocosts.vsb_capexaccount` | Plugin `DevCoCostRootCapexPlugin` (pre-operation): sets `vsb_rootcapexaccount` | The app never writes the root (`adminContract.ts:203-210`); keep it that way if a bulk path is ever approved. |
| CAPEX accounts, Milestones, Gates, OPEX/Land Lease standards, `vsb_capexcosts` | none registered in the solution export | No server fan-out; the cost is the client request count. |
| Request flows `SynchronizeStandardAssumptionCosts`, `ForCountriestriggerFabricrecalculationsforProjects`, `SynchroniseRecalculationCapexStandardCost` | Commented out in every canvas caller (Admin Cost / Contract / Milestones) | Not called by the code app (D20); nothing to optimise. |

---

## Findings

### CA-03 - Deferred deletes are not protected against closing or reloading the tab (live flags)

**Priority P1, confidence High.** Source scope: Cost A: CAPEX/DEVEX, Add Cost from Table, shared costing layer.

- **Area** transaction / reliability. **Screen** Add Cost from Table. **File:line** `data/addCostSheet.ts:320,338` (flags true), `data/addCostSheetBulk.ts:714-734` (early return), `features/cost/costing/useCostBook.ts` (`followBackgroundDeletes`), `features/cost/costing/backgroundSave.ts:49,132` (the only `holdBeforeUnload` use). **Function** `executeSavePlan`, `followBackgroundDeletes`.
- **Problem** The unload prompt is taken only by the WS-F background save, which is OFF (`BACKGROUND_SAVE = false`). With the live `DEFER_*` flags the Save resolves and the screen navigates while cost and contract deletes still run (5-20 s according to D51 section 11.17, quoted from the log, not re-measured here). The cost deletes feed totals: the contract totals are written before the cost rows they sum change, and the reconcile on failure runs only while the tab lives. If the tab closes in that window the deletes stop, no reconcile runs, totals stay as if the deletes had landed, and the removed contracts remain, with no toast possible.
- **Evidence** `data/addCostSheetBulk.ts` module note: "(1) writes the plan's FINAL totals before the cost rows they sum exist ... That is repaired only after EVERY operation has settled"; `grep holdBeforeUnload` under `src/features/cost` and `src/data` returns `backgroundSave.ts` only.
- **Impact** Silent integrity gap: the grid (stored total) and the Summary (sum of rows) disagree until a later save rewrites them, or a removal the user believes done is not done.
- **Proposed solution** Take `holdBeforeUnload()` for the lifetime of `result.background` in `followBackgroundDeletes` (release in `finally`; the helper is reference-counted).
- **Behaviour change?** needs product decision (a browser close prompt for the length of the deferred deletes; WS-F already chose that prompt for its own flow). **Risk** low. **Dependencies** none. **Validation** unit test in the style of UT-ACSHEET-BULK-066/067 with a pending `background` promise and a `beforeunload` event; on DEV close the tab during a deferred delete. **Priority** P1 (P0 if totals integrity is treated as critical). **Confidence** high.

### CB-04 - Land Lease contract delete sends every child delete although the header delete cascades them (and would be atomic)

**Priority P1, confidence Medium.** Source scope: Cost B: Contracts, OPEX, Land Lease, periods.

- **Area** transaction · **Screen** Land Lease
- **File:line** `features/cost/periods/landLeaseRules.ts:3009-3040`; `data/landLease.ts:529-532, 571-579`
- **Function** `planLeaseDelete`, `runLeaseWritesInTiers`
- **Problem** The plan deletes the allocations (16 wide), then each period alone, then the header: A + P + 1 requests in
  ceil(A/16) + P + 1 waves, non-transactional. The solution metadata declares both child relationships `CascadeDelete = Cascade`,
  so the header delete alone removes them, inside one server operation.
- **Evidence**
  - `writes: [...allocationIds.map(... "delete" ...), ...periodIds.map(...), ...costIds.map(...)]` (`landLeaseRules.ts:3030-3037`).
  - `ProjectDocs/_extracted/VSBCloud/customizations.xml:159923` `vsb_landleaseallocationwtg_ProjectCost_vsb_la`: `<CascadeDelete>Cascade</CascadeDelete>`.
  - `:159958` `vsb_landleaseperiod_ProjectCost_vsb_landlease`: `<CascadeDelete>Cascade</CascadeDelete>`.
- **Impact** For A = 40 and P = 3: 44 requests and 7 waves (D160 §6), against 1 request and 1 wave. Today an interrupted delete
  leaves a header with some of its children. A cascade delete is all-or-nothing on the server.
- **Proposed solution** Behind a switch (like `LEASE_WRITE_PARALLEL`), plan a Period-1 delete as the single header DELETE. Keep
  `periodIds` / `allocationIds` in the plan for the selection clean-up (`LandLeaseScreen.tsx:1053-1056`). D51 already relies on the
  cascade for CAPEX contracts.
- **Behaviour change?** needs product decision. It is the same class as OPT-23 / DEC-5 (canvas parity: the canvas deletes the
  children explicitly, LL:6076-6087). The end state is identical if the live relationship still cascades.
- **Risk** Medium: the metadata is solution 1.21.709, so the live DEV relationship must be confirmed. A cascade delete of very
  many children can run asynchronously on the server or hit limits; that is not the case for a few dozen rows.
- **Dependencies** DEC-5 decision; DEV check of the relationship.
- **Validation** DEV: delete a 40-WTG contract with the switch on, then read the periods and allocations by `_vsb_projectcost_value`
  and find 0 rows. Unit: the plan has 1 write when the switch is on.
- **Priority** P1 · **Confidence** Medium (metadata High; live configuration unverified)

### PA-02 - Finance `bulkSchedules` relies on a bulk backend that Finance never registers (latent partial save)

**Priority P1, confidence High.** Source scope: PM A: Generators, Production, Revenues, Finance.

> QUALIFIED by orchestrator: `financeBulk.ts` registers tables only; the default backend is registered by `generators.ts:53` and `checklistBulk.ts:23`, but `finance.ts:219` lazily imports `./generators`, which would register it if that path runs first. Dormant (flag off); confidence Medium until the load order is tested.

- **Area**: reliability / transaction · **Screen**: Finance · **File:line**: `data/financeBulk.ts:12-25`; `data/bulkBackend.ts:84-95`; `data/executePlan.ts:413`; `data/generators.ts:53`; `data/checklistBulk.ts:23`; `features/pm/finance/perf.ts:185-189`
- **Function**: `registerBulkTables` (Finance), `getBulkBackend`, `sendBulk`
- **Problem**: `financeBulk.ts` only adds tables (`registerBulkTables(FINANCE_BULK_TABLES)`). The DEFAULT backend factory is registered only by `data/generators.ts:53` and `data/checklistBulk.ts:23`. `getBulkBackend()` throws when no factory exists, and it is called when the bulk STEP runs. In the tranche plan that step comes after the tranche write and the concurrent group (`perf.ts:185-189`).
- **Evidence**: `if (defaultFactory === null) { throw new Error("No bulk backend is installed. Import \`@/data/generators\` …") }` (`bulkBackend.ts:87-91`); `const backend = getBulkBackend();` (`executePlan.ts:413`, after `stepIds.push`); `writes: [tranche, ...together(grouped…), ...bulkSteps]` (`perf.ts:185-189`).
- **Impact**: today none (flag off). Once `bulkSchedules` is on, a tranche Save fails half-applied in a page load where neither the Generators data module nor `checklistBulk` has loaded: the tranche is saved, deletes and small sets have landed, the bulk schedule has not. When the module loads depends on timing. It usually arrives through the 1.5 s warm-up import (`app/generatorsWarmup.ts:50`), but not with `prefetch` off, and not for a Save started before the warm-up ran.
- **Proposed solution**: in `financeBulk.ts`, also call `registerDefaultBulkBackend(createGeneratorsBulkBackend)`, the same way `checklistBulk.ts:23` does. Alternatively, resolve the backend when the plan is built, so a missing backend refuses the plan before anything is sent.
- **Behaviour change?** none · **Risk**: L · **Dependencies**: none · **Validation**: unit test with a fresh module graph (no `data/generators` import): a tranche plan with a bulk step must either run or be refused before the first write · **Priority**: P1 (becomes P0 the moment `bulkSchedules` is flipped) · **Confidence**: high.

### CA-07 - CAPEX panel Add/Edit has no compensation after a partial failure, and its Add create is not idempotent

**Priority P2, confidence Medium.** Source scope: Cost A: CAPEX/DEVEX, Add Cost from Table, shared costing layer.

- **Area** transaction. **Screen** CAPEX panel. **File:line** `data/capexWrites.ts:738-755` (`saveCostLineBulk`), `:496-511` (`createContract`), `features/cost/capex-costs/Screen.tsx:901-957`. **Function** `saveCostLineBulk`.
- **Problem** (a) Edit runs the contract PATCH and the month upsert in parallel with `Promise.allSettled` and throws the first rejection; there is no reconcile. If only the months fail, the contract's stored `vsb_totalcost` already holds the new total while the month rows still sum to the old one, so the grid (stored total wins) and the Summary (sum of rows) disagree until the next save; if only the contract fails, the months are new and the total old. Add Cost has exactly this scenario handled by `reconcileTotals`. (b) Add creates the contract without a client-chosen id (`createContract` returns the server id) and then writes the months; a failed or ambiguous (CA-02) month write leaves a contract with no months and nothing lets a retry recognise it. Add Cost solved that with stable ids (D51 section 3a). The panel closes before the write starts (`Screen.tsx:901-903`), so the user's input is gone when it fails.
- **Evidence** `capexWrites.ts:753-754`: `const failed = settled.find((s): s is PromiseRejectedResult => s.status === "rejected"); if (failed) throw failed.reason;`; `capexWrites.ts:739-741`: `contractId = await log.step("contract create", () => gatedWrite(() => createContract(args), meter), ...)` (server-generated id).
- **Impact** A visible grid/Summary mismatch after a failed save, or an orphan contract without months on Add. The error banner and the post-failure refetch show the truth, so it is detectable, not silent.
- **Proposed solution** (a) Say in the error text which half landed (the `SaveLog` already knows), and optionally write the contract total after the months so that a month failure leaves the old, consistent total. (b) Pass a client-generated `vsb_capexprojectcontractid` on create (months already get `crypto.randomUUID()`, `:701`) and keep it for a retry; a duplicate-key answer then means "already created". A truly atomic Add needs a Dataverse custom API (platform constraint).
- **Behaviour change?** (a) needs product decision (write order shows only on failure); (b) none. **Risk** medium (contract-last changes when the equal-distribution total is written). **Dependencies** CA-02. **Validation** failing-transport unit tests per branch (`capexWrites.bulk.test.ts` style). **Priority** P2. **Confidence** medium.

### CA-14 - CAPEX panel Delete: four sequential phases of per-row deletes (re-raise of OPT-23 with new evidence)

**Priority P2, confidence Medium.** Source scope: Cost A: CAPEX/DEVEX, Add Cost from Table, shared costing layer.

- **Area** bulk / transaction. **Screen** CAPEX Delete line. **File:line** `data/capexWrites.ts:845-870`, `:645-658` (gate 4). **Function** `deleteCostLineBulk`.
- **Problem** Comments read, comment deletes, month deletes, contract delete, each phase 4 wide: `1 + ceil(K/4) + ceil(M_c/4) + 1` waves, then the awaited reload (CA-05). A 120-month line is about 30 delete rounds (register OPT-23). The register parked it because "this code deliberately avoids relying on" the cascade. New evidence: the Add Cost bulk Save already relies on the contract-to-cost and contract-to-comment cascade for every removed contract in live use (`data/addCostSheet.ts:564`: "their cost rows and comments go by the Dataverse cascade"; measured at about 5.2 s per contract on DEV per D51 section 11.14, quoted from the log), and the canvas deletes only the comments and the contract (code comment in `capexWrites.ts` above `deleteCostLine`).
- **Evidence** `capexWrites.ts:864-867`: `await log.step("contract delete", () => deleteRecord("delete CAPEX contract", "vsb_capexprojectcontracts", plan.contractId), ...)` after the two `deleteMany` phases.
- **Impact** About `ceil(M_c/4)` delete waves removed for a long line, at the price of one cascading server delete (lock duration) instead of `M_c` small ones.
- **Proposed solution** Follow the canvas: keep the comment deletes (CA-18 behaviour), skip the explicit month deletes and rely on the cascade, behind a switch like `PANEL_BULK_SAVE`.
- **Behaviour change?** needs product decision (DEC-5). **Risk** medium (cascade lock time on large lines; a Restrict setting in another environment would fail the delete visibly through `deleteRecord`). **Validation** DEV: delete a 120-month line with the switch on, compare `[VSB]` timings, confirm the months are gone. **Priority** P2. **Confidence** medium.

### PA-14 - Roll-ups are computed from the screen's snapshot, not from the server (lost update across users and tabs)

**Priority P2, confidence High.** Source scope: PM A: Generators, Production, Revenues, Finance.

- **Area**: transaction / reliability · **Screen**: Generators (Production re-reads, Finance has no roll-up) · **File:line**: `features/pm/generators/plans.ts:339-343, 533-534, 708`; `rollback.ts:573`; `Screen.tsx:804-808`
- **Problem**: `projectWtgRollup` sums `existingTypes` / `allTypes` as loaded in the browser. Two people (or two tabs) saving different types of one project each write totals that miss the other's change; the last writer wins. Production does it right: `rollUp` re-reads the yields before its roll-up (`production/hooks.ts:181`). The canvas also sums its collection (parity, so not a regression).
- **Evidence**: `const rollup = projectWtgRollup(args.project.id, [...args.existingTypes, { … }]);` (`plans.ts:339-343`).
- **Impact**: wrong plant capacity / cost on the project (which feeds the Cost screens' `totalCapacity`) until the next Generators save.
- **Proposed solution**: read the types (one GET, PA-OP-07) in the plan step of jobs that roll up, as Production does. It costs 1 request per save; pairs with PA-04.
- **Behaviour change?** needs product decision (divergence from the canvas, more correct) · **Risk**: L · **Priority**: P2 · **Confidence**: high (mechanism); low frequency.

### PB-05 - Planning writes rows from inside query functions

**Priority P2, confidence High.** Source scope: PM B: boot, Project Overview, PM screens, Cluster Checklist.

- **Area:** reliability, transaction. **Screen:** Planning.
- **File:line:** `features/pm/planning/hooks.ts:70-78, 100-113, 132-149`.
- **Function:** `seed`, `useProjectPlanning`, `useAquisitionStatuses`.
- **Problem:** the `OnVisible` seeds (1 planning-row create, N acquisition-status creates) run inside `queryFn`s. Three consequences:
  - A query function can run more than once: a retry on a retryable read error (`Providers.tsx:23`), a focus refetch, a remount after `gcTime`, a second tab.
  - The guard is "the read found no row". A row the user cannot read (another business unit's row) looks absent, so every visit creates another one.
  - A refused seed is traced and swallowed, so the screen then shows "no row" with no message. The canvas has the same `Patch` without `IfError` (`hooks.ts:13-14`).
- **Evidence:**
  - `return (await seed(planEnsurePlanning(project, null))) ? loadProjectPlanning(projectId!) : null;` (`:108`)
  - `return (await seed(planAquisitionSeed(types, rows, project))) ? listAquisitionStatuses(projectId!, types) : rows;` (`:144`)
  - `} catch (e) { trace("warning", "Project Planning: the OnVisible seed was refused", e); }` (`:74-76`)
- **Impact:** possible duplicate `vsb_projectplannings` / `vsb_aquisitionstatuses` rows: two tabs, or two users at once, or invisible rows. The writes do not show in the mutation log as writes (they are logged as a "Load" action, `app/queryLog.ts:75-77`).
- **Proposed solution:**
  - Move the seeds into a once-per-visit orchestration with an in-flight guard, as the Check List's `useChecklistOrchestration` does (`checklist/hooks.ts:629-677`). The reads become pure.
  - Optionally, product and schema: an alternate key on `vsb_projectplanning(vsb_project)` so a duplicate create fails on the server.
- **Behaviour change?** Moving them is none (the same writes, once). The alternate key needs a product decision and a schema change.
- **Risk:** L-M. **Dependencies:** none. The client cannot make an atomic "create if missing" (SDK).
- **Validation:** a hook test that a retried query function does not seed twice; a DEV check with two tabs opened at once on a project without a planning row.
- **Priority:** P2. **Confidence:** High (code). Medium on how often it happens.

### WE-04 - Creates are not idempotent: an ambiguous failure plus a user retry can duplicate a row

**Priority P2, confidence Medium.** Source scope: Admin screens and the shared write engine.

- **Area:** reliability, transaction · **Engine**, Contracts, Costs, Gates, Check List Settings, CAPEX
- **File:line:** `data/executePlan.ts:317-331`, `data/adminContract.ts:353-362`, `data/adminChecklistTables.ts:308-312`, `data/adminCost.ts:803-806`
- **Function:** `sendWrite` (create), `saveStandardContract`, `createDefaultChecklist`, `saveOpexPeriod`
- **Problem:** single creates let the server assign the id. If a POST times out or the connection drops after Dataverse committed, the user sees a failure and presses Save again, which creates a second row. Bulk creates already avoid this with caller-generated ids (`newRowId.ts`, `executePlan.ts:53-59`). Mitigated today: CAPEX create (number uniqueness re-check, `adminCapexAccounts.ts:244-246`), Contracts after a partial save (contract id kept, `Screen.tsx:343`). Not mitigated: a failed parent create of a standard contract (`ContractSaveError("parent", input.contractId, …)` with `contractId` undefined, `adminContract.ts:362`), DEVEX standard cost, gate/task approval, checklist task (the OPEX new contract re-checks "one contract per sub-account", `adminCost.ts:777-780`).
- **Evidence:** `executePlan.ts:319-322`: `await client.createRecordAsync(write.entitySet, data)`, with no primary key in `data`.
- **Impact:** low-frequency duplicate master data (a duplicate standard cost or contract is copied into every new project).
- **Proposed solution:** an optional `id` on a plan `create`: send the pre-generated primary key in the body (Dataverse accepts a client-supplied key on POST), keep it across a retry, and map a duplicate-key answer to "already created".
- **Behaviour change?** none on success; on an ambiguous failure the retry no longer duplicates.
- **Risk:** Medium (needs a live check that each admin table accepts a client key; plugins on create see the same row).
- **Dependencies:** live DEV check.
- **Validation approach:** DEV test: POST with a supplied key twice and check the second answer; unit tests on the mapping.
- **Priority:** P2 · **Confidence:** Medium.

