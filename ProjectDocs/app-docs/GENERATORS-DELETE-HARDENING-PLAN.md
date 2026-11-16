# Generators screen: delete behaviour, verified problems and hardening plan

| | |
|---|---|
| **Status** | **Proposed. Nothing is built or approved.** Every work package needs your go-ahead |
| **Date / base** | 16 Nov 2026, `RounakDev1` at `dbffa77` |
| **Method** | A read-only agent checked 10 claims about the delete behaviour against the code and the solution export `customizations.xml` (1.21.709; DEV may differ). It then listed the scenarios that are real in this code and drafted the work packages. Nothing was run against DEV |
| **Tags** | **[I]** an inference from the code, not observed. **UNVERIFIABLE** needs a DEV query. Paths are under `ProjectCosts-CodeApp/src` unless stated; GEN = `features/pm/generators` |
| **Plug-ins** | None exist for these functionalities (product owner), so none are considered. Flows are in scope |
| **Companion** | `GENERATORS-BULK-DATAVERSE-ANALYSIS-AND-PLAN.md`, `GENERATORS-BULK-IMPLEMENTATION-PLAN.md`, decision D115 |

---

## 1. Corrections to what was said earlier

The first answer on delete behaviour was written before the code was checked. Compared with the code:

| Earlier statement | Verdict | What the code shows |
|---|---|---|
| "A type can have a second bridge row, and the app clears the O&M costs of the first only" | **Partly** | The app does use only the first bridge. But **no code path creates a second bridge**: the only creator (`deviceTypeShadow`, rules.ts:3568) runs after a read says none exists. A second bridge could only come from two tabs racing (check-then-create is not atomic) or from old data. Whether any exists is unverifiable without a DEV query |
| "A delete sent to a wrong entity set would be reported as already gone" | **Partly** | A mistyped entity set cannot pass silently, because `primaryKeyOf` throws for an unregistered set, and all 12 delete targets are registered. A registered-but-wrong set would pass silently, but none exists today. The regex that decides "gone" (`0x80040217` or "does not exist") runs over the whole error text [I], so a 400 naming another missing object would pass |
| "Tiered delete limits are live with no flag" | **Confirmed** | `GENERATORS_BULK` has no tier key, so leaf 16 and cascade 4 are live |
| Everything else in my delete answer | Confirmed | See section 2 |

Three problems the first answer did not list are scenarios S1, S6 and S8 below.

---

## 2. The claims, checked

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Deleting a type cascades to its turbines and bridge rows but only **unlinks** land-lease allocations and O&M costs | **Confirmed** | customizations.xml: WTG and PV bridge and turbine/unit relationships are Cascade; allocation→generator is **RemoveLink** (line 159888); allocation→cost is Cascade (159923, periods too); O&M cost→bridge and O&M parent cost are **RemoveLink** (160343, 160378). Inverter, substructure, BESS, hydrogen and substation types have no child relationships |
| 2 | O&M clean-up uses the first bridge only | **Partly** | GEN/hooks.ts:359-366 uses `deviceTypes[0]`. Replace deletes **all** bridges but detaches and re-links only the first bridge's costs (hooks.ts:384-401; rules.ts:3814, 3836). Costs on a second bridge are unlinked by the cascade and re-read as "Other OPEX" (`data/costBook.ts:572-576`) |
| 3 | Delete a turbine: delete only its allocation if siblings share the cost, else the whole cost | **Confirmed, with a nuance** | `planTurbineDeletion` rules.ts:2163-2173; `planDeleteTurbine` 3753-3785. The count includes the turbine itself and **all allocation rows, null-generator orphans included** (`data/generators.ts:638-649`). No stored total depends on allocations (the cost table has no total column), so nothing is recomputed. Per-WTG amounts are derived at read time (Fabric or Power BI: unverifiable) |
| 4 | Replace deletes the old type before the new one exists | **Confirmed** | `replaceDetachAndDelete` rules.ts:4794-4813: detach O&M, delete units, bridges and the **old type**, then create the new type, turbines and roll-up. Job 2 re-points (Screen.tsx:1630-1647). The cancel flow runs after the input reads and before any write. Replace has no rollback (`rollbackApplies`, rules.ts:3930) |
| 5 | A delete answering 404 counts as done, and nothing reads back | **Partly** | `unwrapDelete` (platform/errors.ts:69-76, used at executePlan.ts:313-318). No post-delete read exists in any Generators plan. `verifyNotFound` exists only in Add Cost (`data/addCostSheet.ts:1285-1340`) |
| 6 | Tiered parallel deletes (leaf 16, cascade 4) are live, with no grouping by parent and no retry | **Confirmed** | concurrency.ts:104-105; rules.ts:3372-3379. Leaf (16): allocations, O&M costs, units, bridges, turbines (rollback). Cascade (4): land-lease costs, types (rollback). Up to 16 allocation deletes on one cost can run at once; an O&M head and its periods sit in one leaf group. No delete retry (executePlan.ts:416-465). After the first failure in a run the rest are still sent (`allSettled`) |
| 7 | The screen reads only `lastLanded()` and ignores the new `lastDeleted()` and `lastMaybeLanded()` | **Confirmed** | Screen.tsx:1370. To consume: `queueRollback` (1368-1372), `runRollback` (1341-1357), `retryCleanup` (1380-1383), and rules.ts `planRollbackCreate` (3947), `describeLeftovers` / `leftoversMessage` (4001-4026) |
| 8 | Single-row saves have no version check, so a stale save can recreate a deleted row | **Confirmed** | SDK 1.3.1: a PATCH without `If-Match` is an upsert (client.ts:399-404). No ETag support in the SDK. Generators plans use plain updates (rules.ts:3355), never the `guarded` form. Even guarded, a delete between the read and the PATCH remains |
| 9 | The decline path of the approval flow deletes the type and leaves allocations and O&M costs unlinked | **Confirmed** | `RequestModulePermission` flow: `Switch_delete_rejected_module` runs `DeleteRecord` on the generator type (and PV, inverter, substructure), then only recomputes `vsb_plantpvcost`. The cancellation flow deletes nothing |
| 10 | The delete guards are UI-only | **Confirmed** | The O&M guard needs an **active** type, the first **active** bridge and an **active** cost (`data/generators.ts:599-606`), so an inactive type bypasses it and its O&M costs of any status are removed. The last-capacity guard (`total - capacity === 0`) uses the cached project and is not re-checked in the plan |

---

## 3. Scenarios that are real today

All of these are reachable with every bulk flag false. (The tiered delete limits have no flag.)

| # | Scenario | What happens | State left | Severity |
|---|---|---|---|---|
| **S1** | **Declined approval.** An out-of-country type is saved: type, turbines, bridge and all-WTG allocations. The approver declines, so the flow deletes the type | The cascade removes turbines and the bridge. **N × L allocations stay with no turbine.** Those orphans later inflate sibling counts (claim 3) | Silent, permanent orphan allocations | **High** |
| **S2** | **Replace, create fails.** Detach O&M, delete units, bridges and the old type, then the new type's create fails (403, 429, network, validation) | No type at all. O&M costs read as "Other OPEX". Allocations unlinked. Roll-up still holds the old capacity. An open approval is already cancelled | No rollback is possible | **High** |
| **S3** | **Replace, second job fails.** New type and turbines exist | Manual allocations not re-pointed, old all-WTG allocations not deleted, O&M not re-linked | Duplicate-looking and unlinked rows | **High** |
| **S4** | **Type delete, one group fails.** 16 parallel deletes of allocations and O&M costs; one gets a 429 or timeout; the rest still go; the type stays | An active type may keep its structure while its O&M contracts are gone (reachable for an inactive type, or one with only inactive costs). Retry is idempotent | Partly deleted type | Medium |
| **S5** | **Type delete, roll-up fails (the last write)** | Type gone, plant WTG totals stale until another save | Stale totals | Medium |
| **S6** | **Same-parent parallel deletes.** (a) An O&M head and its periods in one group: the head delete updates every period while their own deletes run. (b) Two types share a land-lease cost, so up to 16 allocation deletes hit one cost at once | An error or timeout with no retry, or a swallowed 404. Mechanism [I]; D51 saw 6–11 s per request when cascades overlapped | Possible partial delete | Medium |
| **S7** | **Second bridge (unverified).** Its O&M costs survive a type delete as "Other OPEX"; Replace re-links only the first bridge's costs | Costs move into the wrong group in the totals | Needs the DEV query | Medium |
| **S8** | **Two users.** Anna deletes a type; Ben, on a stale page, saves or deletes a turbine of it | Ben's delete answers 404 and counts as success. **Ben's PATCH of the type totals re-creates the type as a phantom row** (a PATCH without `If-Match` is an upsert, with project and owner binds but no model lookup), and the roll-up is recomputed from Ben's cache. Same for status toggle and apply-to-all on deleted rows | Silent phantom type | **High (multi-user)** |
| **S9** | **Stale inputs.** A type delete uses the cached turbine list | A turbine another user added is cascaded and its allocations orphaned; a roll-up from cached types can drop another user's new type | Orphans or wrong totals | Medium |
| **S10** | **Turbine delete removes a whole contract.** A turbine holding the only allocation of a cost (the project's last turbine with all-WTG contracts) deletes the cost, its periods and payments by cascade | Deliberate canvas rule | By design | Medium |
| **S11** | `cancelIfOpen` runs before the writes. If they fail, the approval stays cancelled and the type stays | Pending approval lost | Low–Medium | Low–Medium |

---

## 4. Work packages (dependency order)

New test ids continue after the existing ones: UT-GEN-953 upward, UT-PLAN-911 upward, plus UT-RETRY-* and UT-ORPH-*. Each change also needs a file 13 entry and a D115 note. Effort figures are the verifying agent's rough estimates. Total about **17–19 days**.

### DEL-0: DEV facts (0.5 day, no code, test project only)
Record: the HTTP result of deleting a type that has an allocation (does RemoveLink null the required allocation→turbine lookup?); the duplicate-bridge query (B4); baseline orphan counts (B1–B3); the error text and code of a real 429 and of a lock timeout (capture them, do not guess); whether a create with `statecode = 1` is accepted. **Risk:** none.

### DEL-1: Flag for the tier limits (0.5 day)
New `data/generatorsDeleteFlags.ts`: `GENERATORS_DELETE = { tieredDeletes: true }`, live by default, without reshaping `GENERATORS_BULK`. `leafDeletes` / `cascadeDeletes` (rules.ts:3372-3373) read it; off means one `together()` at limit 8 (the shape before the tiers). Tests UT-GEN-953..956 for both halves (turbine, type, PV, Replace). **DEV:** delete a 20-turbine type both ways and compare the request waterfall. **Rollback:** the flag. **Risk:** low.

### DEL-2: Bounded delete retry and a gone-check (2.5 days)
- Move `retryDelay` / `retryAfterMs` from `generatorsBulk.ts` to `data/retry.ts` (rule 17).
- In `executePlan.sendWrite`'s delete branch (lines 313-318): up to 3 attempts on 429, 503 with `Retry-After`, 500/504 and network errors (a delete is idempotent; a 404 on retry means done). Add the deadlock text only after DEL-0 captures it.
- Narrow `unwrapDelete` (errors.ts:69-76) to status 404 or code `0x80040217`, returning `"deleted" | "gone"`.
- New `data/verifyGone.ts` (one read per 40 ids): after a run, every id that answered 404, and every write marked `confirm: true` (types, costs, units), is read back; a row still there throws `DeleteNotConfirmedError` inside `PlanError`.
- Stop launching new tasks in a run after a non-retryable failure (executePlan.ts:445).
- **Tests:** UT-RETRY-001..012, UT-PLAN-911..925. **DEV:** delete a row the user cannot delete; expect one `[VSB]` retry line and a clean PlanError. **Flag:** `GENERATORS_DELETE.verifyDeletes`. **Risk:** medium, because admin screens share `executePlan`, so keep it opt-in per write.

### DEL-3: O&M clean-up for every bridge (1 day)
`listOpexCostIds` becomes `listOpexCostIdsForBridges(projectId, bridgeIds[])` (chunked; select `_vsb_parentcost_value`; add chain members whose head is in the set). Use it in `loadTypeDeleteInputs`, `loadReplaceInputs` (re-link **all** costs to the new bridge) and `loadOpexDependency` (any active bridge). The builders keep taking id lists. **Tests:** UT-GEN-957..964. **DEV:** seed 2 bridges by hand on the test project (or use what DEL-0 finds), delete, expect no O&M row left. **Risk:** low–medium.

### DEL-4: Order deletes by parent (1.5 days)
Add `serialKey` to `together()` in `writePlan.ts`: the gate runs same-key tasks one after another and different keys in parallel. Apply it to allocations by land-lease cost, and to O&M deletes as two groups (periods first, heads last). **Flag:** `GENERATORS_DELETE.parentOrder`, switched on only after a timed DEV test shows it helps or is neutral. **Tests:** UT-PLAN-926..935, UT-GEN-965..970. **DEV:** 20 turbines × 3 shared costs; time and error count. **Risk:** low; speed may drop for shared costs (measure).

### DEL-5: Use `lastDeleted` and `lastMaybeLanded` (1.5 days)
- rules.ts: a pure `remainingRows(landed, deleted)`; unify `LandedRowRef` with `LandedRow`; `planRollbackCreate` takes `maybeLanded` as rows to undo (404-safe).
- Screen.tsx: `queueRollback` adds `writes.lastMaybeLanded()`; `runRollback` on failure sets `leftover.rows = remainingRows(target.rows, writes.lastDeleted())` and builds the message from those; show the rollback's own error; if nothing remains but the roll-up failed, say so.
- For delete jobs (`deleteType`, `deleteTurbine`, PV): on failure read `lastDeleted()` and show "Removed: …; not removed: …; press Delete again to finish" (a new `DELETE_PARTIAL_MSG`, marked NEW).
- **Tests:** UT-GEN-971..985, Screen.rollback UT-GEN-986..992. **DEV:** cut the network mid-run and compare the message with the B1–B3 queries. **Flag:** `createRollback` for the first part. **Risk:** low.

### DEL-6: Replace as a create-first saga (5 days)
Order: create the new type **inactive** (create then PATCH `statecode = 1` if DEL-0 says a create cannot set it) and its turbines; bridge; all-WTG back-fill; re-point manual allocations to the new units; re-link O&M **directly from the old to the new bridge** (removes the detached state); then delete the old all-WTG allocations, units, bridges and type; then activate the new type and turbines; roll-up last.
- **Failure before the delete phase:** delete the inactive new rows (extend `RollbackScenario` / `rollbackApplies` with `replaceGeneratorType` / `replacePvType`, reuse `planRollbackCreate`). The old type is untouched.
- **Failure in the delete phase:** roll forward (idempotent).
- **Why the data model allows it:** type `statecode` is Active/Inactive only, and the WTG roll-up and O&M lists already exclude inactive types.
- **Caveats:** the PV roll-up has no status filter (rules.ts:839-844), so roll-ups stay last; turbine names no longer reuse the old numbers unless the other turbines are kept (names are not unique); out of country the approval flow then targets the new type, so a decline deletes only it.
- **Files:** rules.ts `planReplaceGeneratorType`, `planReplacePvType`, both follow-ups, `replaceDetachAndDelete`; Screen.tsx `replaceGeneratorType`, `replacePvType`. **Flag:** `GENERATORS_DELETE.replaceSaga` (false until DEV). **Tests:** UT-GEN-993..1015 with a failure injected at every step. **DEV:** GB-60 plus failure injection after each phase; the old type must be intact in phases 1–3. **Risk:** **high**.
- "Deactivate first" for a plain Delete adds little: there is no "deleting" status and a user can re-activate. Not recommended.

### DEL-7: Concurrency guards (2 days, plus 2 optional)
(a) Mark Generators updates `guarded` where a resurrected row hurts: type totals (planDeleteTurbine, planSaveTurbine, planToggleStatus type), apply-to-all, O&M re-link. The roll-up needs none (the project is never deleted). Cost: one read each; bulk paths already guard per 40. (b) Add `versionnumber` to the type and turbine reads and refuse when it changed ("reload"); a true `If-Match` ETag is impossible on SDK 1.3.1. **Flag:** `GENERATORS_DELETE.guardedUpdates`. **Tests:** UT-GEN-1016..1030, UT-PLAN-936..940. **DEV:** delete the type in a second browser, save a turbine in the first, expect a refusal and no phantom row. **Risk:** medium (extra reads; the 404 text must map to `RECORD_GONE_TEXT`).

### DEL-8: Orphan detection and a one-off clean-up (2 days)
Read-only queries, all under `/api/data/v9.2/`:

| Id | Finds | Query |
|---|---|---|
| B1 | Allocations with no turbine | `vsb_landleaseallocationwtgs?$select=vsb_landleaseallocationwtgid,vsb_name,_vsb_projectcost_value&$filter=_vsb_generatorinproject_value eq null` |
| B2 | Allocations with no cost (expect 0) | the same with `_vsb_projectcost_value eq null` |
| B3 | O&M orphans | get the sub-account id from `vsb_opexsubaccounts?$select=vsb_opexsubaccountid&$filter=vsb_name eq 'Operation %26 Maintenance'`, then `vsb_opexprojectcosts?$select=vsb_opexprojectcostid,vsb_name,_vsb_project_value,_vsb_parentcost_value&$filter=_vsb_devicetypeinproject_value eq null and _vsb_subaccount_value eq <id>` |
| B4 | More than one bridge per type | `vsb_devicetypesinprojects?$select=vsb_devicetypesinprojectid,_vsb_typeinprojectid_value,createdon&$orderby=_vsb_typeinprojectid_value,createdon`, grouped in the script |
| B5 | Bridges with no type | `vsb_devicetypesinprojects?$filter=_vsb_typeinprojectid_value eq null` |
| B6 | Turbines with no type | `vsb_generatorinprojects?$filter=_vsb_moduletypeinprojectid_value eq null` |
| B7 | Phantom types | `vsb_generatortypeinprojects?$filter=_vsb_generator_value eq null or _vsb_project_value eq null` |
| B8 | Non-all-WTG costs with no allocation | FetchXML on `vsb_landleaseprojectcost` (`vsb_allwtgallocated = 0`) with an outer link to `vsb_landleaseallocationwtg` and a null-alias filter; also costs whose allocations all have a null generator (client side) |

Script `scripts/generators-orphans.mjs`: **report only by default** (CSV of ids and names, counts to the console, no values logged, no tokens). `--apply --class=<name> --manifest=<reviewed file>` deletes 4 at a time through `deleteRecord`, reads each row back, and first writes a JSON backup of the rows (local, untracked). The product owner reviews the report; nothing is deleted by default. **Tests:** UT-ORPH-001..010 (classification, dry-run default). **Risk:** low.

### DEL-9: Server-side options (a decision paper, 0.5 day; build only if you approve)

| Option | Pro | Con |
|---|---|---|
| **A.** Edit the decline flow to delete allocations and O&M costs before `DeleteRecord` | Fixes S1 at the source; small; flows are in scope | Needs a solution release and flow-run permissions |
| **B.** Change cascades: allocation→generator to Cascade; O&M→bridge to Restrict | The platform enforces it for every caller | Replace deletes units **before** re-pointing manual allocations, so it would delete them (reorder Replace first, DEL-6); Restrict breaks the decline flow and Delete unless children go first; it changes the canvas apps too |
| **C.** A custom API | One transactional call per delete or replace | New code, build, deployment and ownership (you said none exist today) |
| **D.** `ExecuteTransaction` through `pa app add dataverse-api` (as D51 did for `CreateMultiple`) | Atomic, no new code | Not proven through the host: probe first [I] |
| **E.** A Power Automate "delete type" flow | No code | Not transactional, asynchronous, and the run-only connection blockers already seen for the Generators flows |

### Order
DEL-0, DEL-1, DEL-2; then DEL-3 and DEL-8 in parallel; then DEL-4, DEL-5, DEL-7; DEL-6 last.

---

## 5. Recommended first steps (smallest risk, biggest effect)

1. **DEL-0 (DEV facts).** It settles whether the required lookup can be nulled, whether a second bridge exists, and how many orphans there already are. Everything else is sized by that.
2. **DEL-8 report (read-only).** It shows how big S1 already is, with no code risk.
3. **DEL-1 (flag the tiers).** The tiers are live today with no switch.
4. **DEL-5 (use the new lists).** It makes failed rollbacks and failed deletes tell the truth.
5. **DEL-3 (all bridges)** and **DEL-2 (retry and gone-check)**.

DEL-6 (Replace saga) and the server-side options should wait for your answers to the questions below.

---

## 6. Questions only the product owner can answer

1. A replaced **out-of-country** type is pending approval. If the approver declines, the flow deletes the **new** type and the old one is already gone. Should the old type stay until approval?
2. An **inactive** type with O&M contracts is deleted today and its contracts (all periods) go silently, while an active one is blocked. Is that intended?
3. The **last turbine** of a project with all-WTG land-lease contracts is deleted and the contracts, periods and payments go. Wanted, or keep the contract with no turbine?
4. Allocations with **no turbine** exist (from declined approvals or failed saves). Delete them, re-link them, or keep them? Who signs off the report?
5. A type delete fails half-way (30 of 40 rows removed). Is **"press Delete again to finish"** (roll forward) acceptable, since a delete cannot be undone?
6. A new Replace type is **invisible (inactive) for a few seconds** and, on failure, the old type is kept unchanged. Acceptable instead of today's partial state?
7. User A deletes a type while user B edits it. Is **"your change was not saved, reload"** (one extra read per update) acceptable, or must B's save win?
8. May the **managed solution** change (decline flow, relationship cascade), or must everything stay in the app?
