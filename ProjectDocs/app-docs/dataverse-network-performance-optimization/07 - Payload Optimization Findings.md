# 07 - Payload Optimization Findings

> Stage 1 audit, 25 Nov 2026. Branch `feature/dataverse-network-performance-optimization`, from `origin/RounakDev1` at `30afece`. Investigation only: no application source file was changed. Every request count is **code-derived**, not measured. 

Request bodies (changed fields vs whole record), response width, redundant binds. The SDK adds `Prefer: return=representation` to every POST/PATCH; it cannot be turned off from the app.

**5 findings name this area** (a finding naming several areas appears in each; its primary area is listed first in its block).

| ID | Pri | Conf | Title |
|---|---|---|---|
| PA-03 | P2 | High | Finance tranche Save rewrites every repayment and step-up row, changed or not |
| PA-06 | P2 | High | Revenues Save deletes every stored hedge volume and re-creates every volume |
| AD-10 | P3 | High | Period-1 edit propagates to every later period even when nothing changed (deferred S6-07, recorded for completeness) |
| CA-12 | P3 | Medium | A CAPEX Edit sends the whole contract column bag, including the unchanged Linked Cluster bind |
| PB-14 | P3 | High | Check List back-fill: up to 7 sequential, unguarded upserts; an update can bring a deleted tracking back without its project or owner |

## Findings

### PA-03 - Finance tranche Save rewrites every repayment and step-up row, changed or not

**Priority P2, confidence High.** Source scope: PM A: Generators, Production, Revenues, Finance.

- **Area**: payload / network · **Screen**: Finance · **File:line**: `features/pm/finance/rules.ts:1092-1112, 1258-1287, 3577-3603`
- **Function**: `repaymentDiff`, `stepUpWrites`, `planTrancheSave`
- **Problem**: `toUpsert` is EVERY row of the schedule. Each existing row gets a PATCH with name, amount, year and four binds (project, category, input, OBU), even when nothing in it changed (for example a header-only edit such as the bank or the margin).
- **Evidence**: `toUpsert: rows.map((r) => { … recordId: stored.find((s) => s.year === r.year)?.id ?? null, … })` (`rules.ts:1103-1111`); `writes.push(r.recordId ? update(ES_FINANCE.financingInputsRepaymentAmounts, r.recordId, data, …) : …)` (`:3584-3586`).
- **Impact**: a 25-year Individual tranche plus 4 step-ups is 31 write requests per Save. A header-only edit could be 1 (the tranche) plus only the changed rows. Each PATCH is an upsert with no `If-Match`, so it can also re-create a row another user deleted (platform fact).
- **Proposed solution**: in `rules.ts`, keep only the upserts whose stored values differ (amount, year, name; for step-ups duration, margin, start year, order). The stored rows are already passed in (`storedRepayments`, `storedStepUps` carry `amount` / `margin` …). Keep a `…CanvasParity` twin.
- **Behaviour change?** needs product decision (low): stored values are identical, but `modifiedon` and the audit history of the unchanged rows no longer move. The canvas `ForAll(Patch)` writes all rows.
- **Risk**: L · **Dependencies**: none · **Validation**: rules test (unchanged schedule gives 0 child writes; one changed amount gives 1); DEV row compare · **Priority**: P2 · **Confidence**: high.

### PA-06 - Revenues Save deletes every stored hedge volume and re-creates every volume

**Priority P2, confidence High.** Source scope: PM A: Generators, Production, Revenues, Finance.

- **Area**: bulk / payload · **Screen**: Revenues · **File:line**: `features/pm/revenues/rules.ts:2926-2970`; `Screen.tsx:825-835`
- **Function**: `planSaveContract`
- **Problem**: an Edit Save of an Individual contract sends V DELETEs and M POSTs, even if one value changed. That follows the canvas `RemoveIf` + `ForAll(Patch(Defaults))`.
- **Evidence**: `...together(volumeDeletes, { limit: LEAF_DELETE_CONCURRENCY }), ...together(volumeCreates, perf.wideCreateGroup ? { limit: WIDE_GROUP_CONCURRENCY } : undefined)` (`rules.ts:2965-2966`).
- **Impact**: V = M = 25 is 52 write requests in 5 waves; a diff would be the changed rows only. A failure between the groups leaves the contract with fewer volumes (D136 §2, accepted divergence).
- **Proposed solution**: option A, a diff by year: update a year that stayed (only when its value or dates changed), create new years, delete removed years. Option B, keep delete-and-recreate but send the creates as `createMany` (needs `registerBulkTables` for `vsb_revenueindividualhedgevolumes` and the OBU guard; D136 §4 deferred it pending a timing).
- **Behaviour change?** needs product decision (A keeps row ids and `createdon`; the canvas re-creates). No flow or plugin is on the table (`revenuesFlags.ts` header).
- **Risk**: M (A: PATCH upsert without `If-Match`; B: chunk partial landing) · **Dependencies**: PA-02 pattern for registration · **Validation**: writePerf tests (UT-REVPERF style), DEV row compare · **Priority**: P2 · **Confidence**: high.

### AD-10 - Period-1 edit propagates to every later period even when nothing changed (deferred S6-07, recorded for completeness)

**Priority P3, confidence High.** Source scope: Admin screens and the shared write engine.

- **Area:** payload, network · **Screen:** Costs
- **File:line:** `data/adminCost.ts:833-845, 615-634`
- **Function:** `saveOpexPeriod`, `propagationFields`
- **Problem / Evidence:** `adminCost.ts:835-840`: `const later = after.filter((r) => r.id !== id && (r.period ?? 0) > 1); … await updateRowsEach("copy Period 1 values to later periods", …, later.map((r) => ({ [OPEX_PRIMARY_KEY]: r.id, ...fields })))`, i.e. 2k requests every time.
- **Impact:** up to 18 requests for a Period-1 edit that changed no contract-level field.
- **Proposed solution:** compare `propagationFields` of the saved Period 1 with each later row (needs those columns in `listContractRows`) and skip equal rows. **DEC-5 (canvas parity "copy always").**
- **Behaviour change?** needs product decision (DEC-5).
- **Risk:** Medium (a later period that differs in a hidden field would no longer be overwritten).
- **Dependencies:** DEC-5.
- **Validation approach:** differential test against the current function on generated contracts.
- **Priority:** P3 · **Confidence:** High.

### CA-12 - A CAPEX Edit sends the whole contract column bag, including the unchanged Linked Cluster bind

**Priority P3, confidence Medium.** Source scope: Cost A: CAPEX/DEVEX, Add Cost from Table, shared costing layer.

- **Area** payload. **Screen** CAPEX panel. **File:line** `data/capexWrites.ts:363-475` (`contractPayload`), `:485-494` (`updateContract`). **Function** `contractPayload`.
- **Problem** Every Edit PATCHes about 22 columns (name, description, cost type, VAT, depreciation, distribution, scheme, frequency, total, cluster and date JSON, standard flag, average payment) plus `"vsb_LinkedCluster@odata.bind"` (null when unlinked), even for a description-only edit. Add Cost already sends changed columns only for existing contracts (`CHANGED_COLUMNS_ONLY`, `savePlan.ts:143`). The Edit write also overwrites a column another user changed meanwhile (row-level last-writer-wins, R-12) where a changed-columns write would not.
- **Evidence** `capexWrites.ts:488-491`: `Vsb_capexprojectcontractsService.update(args.line.id, { ...fields, ...linkedCluster } as never)`.
- **Impact** Request size and server change tracking only; no extra requests. Small gain, moderate change cost (the stored contract values must be passed in to diff against, as `storedPayments` already is).
- **Proposed solution** Send changed columns only for an update; keep the full bag for a create. Record as a DIVERGENCE in the style of D75.
- **Behaviour change?** none when the snapshot equals the DB; concurrent edits become column-level (same note as D75). **Risk** low-medium. **Validation** differential test: final row equal for random edits. **Priority** P3. **Confidence** medium.

### PB-14 - Check List back-fill: up to 7 sequential, unguarded upserts; an update can bring a deleted tracking back without its project or owner

**Priority P3, confidence High.** Source scope: PM B: boot, Project Overview, PM screens, Cluster Checklist.

- **Area:** reliability, payload. **Screen:** Cluster Check List.
- **File:line:** `checklist/rules.ts:444-487`; `checklist/hooks.ts:393-403`.
- **Problem:** the update branch PATCHes `existing.id` with no `guarded` flag, and its payload carries no project or owning-business-unit bind (those are added only on the create branch, `:475-481`). The SDK PATCH is an upsert (no `If-Match`). A tracking deleted between the fresh read and the write would come back as an orphan with no project and no owner (the rule 4 shape). Most other checklist updates are `guarded: true` (`rules.ts:1503, 1527, 2017, 2120`). The writes also run one at a time.
- **Evidence:**

  ```
  if (existing) {
    plan.writes.push({
      op: "update", entitySet: ES.projectStateTrackings, id: existing.id, data,
      reason: `${state.name} → ${approvalStateLabel(target)}`,
    });
  ```
  (`:467-471`, no `guarded`)
- **Impact:** a narrow window (the read is fresh, `hooks.ts:396`), but silent orphan rows. Up to 7 sequential round trips on the first visit of a skipped-start project.
- **Proposed solution:** `guarded: true` on the update branch (+1 GET each, `updateRecordIfExists`). Grouping can come later, once the `SynchroniseProjectState` order is checked, as in PB-11.
- **Behaviour change?** None for the guard: a vanished row is reported instead of re-created. Concurrency needs the DEV check of PB-11.
- **Risk:** L. **Dependencies:** OPT-22 (guarded = 2 requests until the SDK sends `If-Match`).
- **Validation:** a plan test asserting `guarded`; the existing UT-CHKLST back-fill tests.
- **Priority:** P3. **Confidence:** High.

