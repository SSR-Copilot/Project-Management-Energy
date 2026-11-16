# Test plan - Generators bulk programme (D115)

Status: **draft, 16 Nov 2026.** The code is merged on `integration/generators-bulk`, **not product-approved, not run against DEV, every flag off**. Decision record: `02-OPEN-DECISIONS.md` **D115**. Analysis and plan: `GENERATORS-BULK-DATAVERSE-ANALYSIS-AND-PLAN.md` (request model §2.2, risks §6, probes §9) and `GENERATORS-BULK-IMPLEMENTATION-PLAN.md` (phases §3, decisions §9).

This plan has two halves:
- **Part A** is automated and runs in `npm run verify`.
- **Part B** is a manual test against **VSBCloud_Dev** on the DEV test project, which only a person with a signed-in browser can run.

Run Part B only after Part A is green. Do not flip a flag in a committed file until its cases pass and the result is recorded in D115.

## What is covered, in one paragraph

The Generators screen writes every save as a plan of single-row requests. The programme changes this in phases, each behind its own switch where it adds a new write path:

| Phase | Change | Needs |
|---|---|---|
| 1 | The turbine `statecode` updates of Activate / Deactivate run as one parallel group | nothing (no flag) |
| 1B | Deletes run in parallel tiers: leaf rows 16 at once, cascading deletes 4 | nothing (no flag) |
| 1C | A failed Add WTG type (A) or out-of-country type (B) is rolled back, with **Retry cleanup** | `GENERATORS_BULK.createRollback` |
| 2 | Allocation rows created with `CreateMultiple` | `GENERATORS_BULK.allocations` |
| 3 | Status toggle and apply-to-all with `UpdateMultiple`, guarded by an existence read | `GENERATORS_BULK.status`, `GENERATORS_BULK.applyAll` |
| 4 | The N new turbines created with one `CreateMultiple` | `GENERATORS_BULK.turbines` |
| 5 | Replace Generator / PV composed from the above | `GENERATORS_BULK.replace` |

The engine, the transport, the plan builders (R2) and the screen rollback (S) are all merged on `integration/generators-bulk`; every flag is `false`. Test the build you are given: `git log` shows the commit, and `src/data/generatorsBulkFlags.ts` the flags.

---

## Part A - automated (no environment needed)

From `ProjectCosts-CodeApp/`:

```powershell
npm run verify
```

Expected: every step passes; `check:power` reports no problems (the `environment_<id>` entry in `power.config.json` must stay, CONVENTIONS rule 9).

| Suite | Ids | What it proves |
|---|---|---|
| `data/executePlan.bulk.test.ts`, `data/executePlan.test.ts` | UT-PLAN-* | Bulk steps run in plan order and count per row; groups have their own limit and never merge; the landed-row record; the "rows gone" failure |
| `data/generatorsBulk.test.ts` | UT-GENBULK-001...047 | Fail-closed validation (owning business unit, ids, reserved keys); guarded `updateMany`; the 501 fallback and its `sessionStorage` flags; the 429 / 503 retry; exact row counts on failure |
| `data/concurrency.test.ts` | UT-CONC-* | The gate and the tier constants |
| `data/usePlanWrite.*.test.ts(x)` | UT-PLANWRITE-006...018 | `lastLanded()`, the "rows gone" message, the follow-up job |
| `features/pm/generators/rules.test.ts` | UT-GEN-123 (toggle) | `planToggleStatus` is one concurrent group between the type update and the roll-up |
| `features/pm/generators/rollback.test.ts` | UT-GEN-170...186 | `planRollbackCreate` order (allocations, bridge rows, turbines, types, roll-up last), `describeLeftovers`, `leftoversMessage` |

| `features/pm/generators/bulkPlans.test.ts` | UT-GEN-186...209 | The delete tiers: leaf group of 16, cascade group of 4, a single bridge, unit or type delete a plain step, children before parents |
| `features/pm/generators/bulkAllocations.test.ts` | UT-GEN-210...220 | `allocations` on and off: one `createMany` of N*L rows, the same rows as the single creates |
| `features/pm/generators/bulkUpdates.test.ts` | UT-GEN-230...239 | `status` and `applyAll`: 3 and 4 steps, no repeated ids, the turbine edit outside the bulk |
| `features/pm/generators/bulkTurbines.test.ts` | UT-GEN-240...247 | `turbines`: type create, one `createMany` of N rows, roll-up; the `createdIds` contract |
| `features/pm/generators/bulkReplace.test.ts` | UT-GEN-250...263 | `replace`: job 1 and job 2 step counts, the O&M detach before every bridge delete, old-allocation deletes after the creates |
| `features/pm/generators/Screen.rollback.test.tsx` | UT-GEN-930...941 | The screen rollback: progress text, undone message, leftover message with **Retry cleanup**, no automatic retry, state cleared by a new run or a project change |

Two existing rules tests changed shape with the tiers: UT-GEN-127 (PV delete order) and UT-GEN-138 (Replace follow-up).

---

## Part B - manual, VSBCloud_Dev

### Before you start

1. **Use the DEV test project and nothing else.** Never use a live project. It needs **three all-WTG land-lease costs** (Land Lease, "Allocate to all WTGs" on), created for this test and removed afterwards, and one O&M cost on a device-type row for GB-14. The project id stays in your head and your session: **never write it, a token or a URL with a secret into a file, a screenshot caption or a commit**.
2. **Start the app against DEV** from `ProjectCosts-CodeApp/`: `pa app run` (or `npm run dev` plus `pac code run --appUrl http://localhost:3000`). Open the `apps.powerapps.com/.../app/local?...` URL it prints, **not** `localhost:3000`. Check `pac auth list` shows VSBCloud_Dev.
3. **Flags, one at a time.** Edit `GENERATORS_BULK` in `src/data/generatorsBulkFlags.ts` **locally** (a working-tree change you never commit), set the one flag the case names to `true`, leave the others `false`, and let the dev server reload. Revert the file when the case group is done (`git checkout -- src/data/generatorsBulkFlags.ts`).
4. **Clear the tab's 501 flags** before each bulk case: open the app in a new tab, or in the console run `sessionStorage.removeItem("vsb.generators.createMultiple501"); sessionStorage.removeItem("vsb.generators.updateMultiple501")` and reload.
5. **Open the developer tools (F12).** Console: filter `[VSB]`; keep **Preserve log** on. Network: filter `Multiple` for the bulk requests and keep the full list for counting. Leave them open for the whole test.
6. **A way to read raw rows**: make.powerapps.com (Tables, Data) or a Web API read in a signed-in browser tab, for example `https://vsbclouddev.crm4.dynamics.com/api/data/v9.2/vsb_landleaseallocationwtgs?$select=vsb_name,createdon,_owningbusinessunit_value&$filter=_vsb_projectcost_value eq <cost-id>`.
7. **Keep a manifest of created ids**, outside the repository (a file in your own temp folder). Each case appends one line per row it creates: `<case id>  <entity set>  <id>`. Turbine names are generated by the app (`WTG <Short>_<n>`), so a `PW-` prefix is not possible; cleanup uses the manifest. The manifest never goes into the repository or a commit.
8. **Record each result** as Pass, Fail or Blocked, with the `[VSB]` lines pasted (they carry counts and names, never row values) and the request count from the Network tab.

### What to read in the console

- `[VSB] HTTP <METHOD> <path> -> <status> · <ms> ms`: every request.
- `[VSB] DATA create|update|delete <entity set>: N rows, M calls, T ms in total ...`: one line per kind and table. A bulk request prints one line per request with its rows; a row-by-row write prints `N rows, N calls`.
- `[VSB] ACTION Mutation @ /project/generators: T ms, R requests ... [aN]`: one line per save, with the request count. A line ending `SLOW` is over 5 s.
- `[VSB] ERROR ...`: a failure with its root cause. After a 501 the console also shows `CreateMultiple answered 501 Not Implemented; ... continues row by row.` (or `UpdateMultiple ...`).

The **awaited waves** of a save are the groups of requests that start together: a wave ends when the last request of the group answers. Read them from the Network tab's waterfall (requests starting at the same time are one wave) and from the `[VSB]` timeline.

### Request model (N turbines, L all-WTG costs, S siblings, O O&M costs)

Two different things are counted, and the plan keeps both columns:
- **Steps**: entries of the write plan. A bulk step is one entry that carries many rows. The tests assert step counts.
- **HTTP requests**: what the Network tab shows. The transport sends under 20 rows as one request and from 20 rows in chunks of 10 to 500 rows, at most 8 in parallel (30 rows are 3 requests of 10; 200 rows are 8 requests of 25; 500 rows are 8 requests of 63). An `updateMany` also costs one existence read per 40 ids. Reads for the plan itself are extra.

**Today (flags off; analysis §2.2, computed):**

| Case (N = 10, L = 3) | Steps = writes = requests | Awaited steps |
|---|---|---|
| Add WTG type | N + N*L + 3 = **43** | 8 |
| Deactivate / Activate | N + 2 = **12** | 3 (type, one turbine group, roll-up) since phase 1 |
| Edit turbine with apply to all (S = 9 siblings) | S + 3 = **12** | |
| Delete WTG type | X + O + 2 plus reads (read X and O from the console) | |
| Replace Generator type | record it | |

**With the flag on (asserted in tests; HTTP figure from the splitter):**

| Case (N = 10, L = 3, S = 9) | Flag | Steps | HTTP requests |
|---|---|---|---|
| Allocations of Add type | `allocations` | one `createMany` of 30 rows instead of 30 creates | 3 (10 rows each) |
| Turbines of Add type | `turbines` | 3 (type create, one `createMany` of 10 rows, roll-up) instead of N + 2 = 12 | 1 for the turbines (10 rows) |
| Add type with both | `allocations` + `turbines` | type create, one turbine `createMany`, roll-up, device-type row, one allocation `createMany` | 1 + 1 + 1 + 1 + 3 = 7 |
| Status toggle | `status` | 3 (type update, one `updateMany` of 10 rows, roll-up) instead of 12 | 4 (type 1, existence read 1, `UpdateMultiple` 1, roll-up 1) |
| Apply to all | `applyAll` | 4 (turbine, one `updateMany` of 9 siblings, type totals, roll-up) instead of 12; the turbine edit itself is not in the bulk | 5 (turbine 1, read 1, `UpdateMultiple` 1, type totals 1, roll-up 1) |
| Replace job 1 (O O&M costs, 4 units, N turbines) | `replace`, `turbines` | (O>0?1:0) + 4 + 1 + 1 + 1 + 1 + 1 instead of O + 4 + 1 + 1 + 1 + N + 1 | record it |
| Replace job 2 | `replace` | 1 + (creates>0?1:0) + 1 + 1 + removals instead of 1 + N*L + moves + 3 + removals; the old-row deletes stay single requests | record it |

`planSaveTurbine` and the PV follow-up keep the canvas order, allocations after the roll-up, so their roll-up is not the last write (D115 divergence 6). Add type puts its allocations in its second job, after the first job's roll-up (analysis §2.2, row 1.1).

If a measured count differs from the model, explain the difference in the result; do not adjust the model silently.

---

### B0. Baseline timing (before any flag; the build as it is today)

Do this first, on the build you will compare against, with **every flag false**. Three runs of each of five cases on the DEV test project (3 all-WTG land-lease costs, N = 10). Between runs, restore the starting state: delete the type each run creates, or reuse it where the case needs an existing type.

| Case | Steps |
|---|---|
| BL-1 | Add a WTG type with 10 turbines |
| BL-2 | Deactivate that type, then activate it (two timings) |
| BL-3 | Edit one turbine with **apply to all** (change capacity or hub height) |
| BL-4 | Delete that type |
| BL-5 | Replace that type (Replace Generator Type) |

For each run record from the console: **requests** (the `ACTION` line), **awaited waves** (waterfall), **seconds** (the `ACTION` line's total, or from clicking Save to the spinner closing), and any `SLOW` or `ERROR` line. Add every created row to the manifest. Fill the acceptance table at the end of this file with the average of the three runs.

At today's small sizes the single-row saves cannot improve by 50%; those are out of the criterion (plan §9.6).

---

### B1. Cases per phase

Check on every case, unless it says otherwise: no `[VSB] ERROR` line; one `ACTION` line for the save; **exactly one** `vsb_projects` update for the roll-up (last, except in Add turbine, Add PV type and the Add type follow-up, where the allocations follow it); after the case, run the orphan query (GB-72) and the sync-job count (GB-70).

#### Phase 1 - status toggle in parallel (no flag)

| Id | Needs | Steps | Expected | How to verify |
|---|---|---|---|---|
| **GB-01** Deactivate | none | Deactivate the type of BL-2 (N = 10). | Every turbine becomes inactive; one roll-up. | Network: 1 update to `vsb_generatortypeinprojects`, then 10 updates to `vsb_generatorinprojects` starting together (8 in flight, then 2), then 1 update to `vsb_projects`. `[VSB] DATA update vsb_generatorinprojects: 10 rows, 10 calls`. Rows: every turbine of the type has `statecode` 1. Time against BL-2. |
| **GB-02** Activate | none | Activate it again. | Every turbine active; the project's plant totals count the type again. | As GB-01 with `statecode` 0. Project plant WTG capacity and cost equal the pre-test values plus the type. |

#### Phase 1B - tiered parallel deletes (no flag; implemented: leaf group 16, cascade group 4, a single bridge, unit or type delete is a plain step)

| Id | Needs | Steps | Expected | How to verify |
|---|---|---|---|---|
| **GB-10** Delete type | none | Delete the type of BL-4 (N = 10, 3 all-WTG costs). | Type, turbines, allocations, bridge row gone; children before parents; roll-up last. | Console `DATA delete` lines per table; request count equals X + O + 2 plus reads (state the X and O you read). Waterfall: allocation, O&M cost, unit, bridge and turbine deletes are a leaf group of up to 16 at once (only when there are 2 or more; a single bridge, unit or type delete is a plain request); land-lease cost and type deletes are a cascade group of up to 4; the roll-up is last. |
| **GB-11** 404 as gone | none | Delete a type; in a second tab delete one of its allocations first. | The save still ends cleanly. | A delete answering 404 counts as already gone; no `ERROR` line. |
| **GB-12** Wrong entity set is not hidden | read-only check | Look at the 404 lines of GB-11 in the Network tab. | Only the row you deleted answered 404. | A 404 on every id of a table would mean a wrong entity set and must be reported as a failure. |
| **GB-13** Timed delete concurrency | none; edit `concurrency.ts` locally | Build the same load three times and delete it at **4, 8 and 16** in flight: (a) 100 allocation rows, (b) 1,000 allocation rows, (c) a type with 200 turbines. Loads (a) and (b) run on the leaf group, load (c) on the cascade group for its type delete: change `LEAF_DELETE_CONCURRENCY` or `CASCADE_DELETE_CONCURRENCY` in `src/data/concurrency.ts` locally for each run (never commit). The delete plans import both constants, so no other edit is needed. | The tier with the shortest total time and no `429` or lock failure; note every `SLOW` request (over 3 s). | Fill the table below. These runs set the final tier numbers; record them in D115. |

Delete concurrency table (fill in):

| Load | Limit | Seconds | Requests | Slowest request (ms) | 429 or error | Verdict |
|---|---|---|---|---|---|---|
| 100 allocations | 4 | | | | | |
| 100 allocations | 8 | | | | | |
| 100 allocations | 16 | | | | | |
| 1,000 allocations | 4 | | | | | |
| 1,000 allocations | 8 | | | | | |
| 1,000 allocations | 16 | | | | | |
| Type with 200 turbines | 4 | | | | | |
| Type with 200 turbines | 8 | | | | | |
| Type with 200 turbines | 16 | | | | | |

| Id | Needs | Steps | Expected | How to verify |
|---|---|---|---|---|
| **GB-14** Cascade and orphans | none | Create a type with **2 turbines**, a device-type (O&M bridge) row, **one allocation** (one all-WTG cost) and **one O&M cost** on the bridge. Delete the type through the screen (or, to test the platform alone, delete the type row in make.powerapps.com). Then query for orphans. | Turbines and bridge row gone by the cascade. Allocation and O&M cost are only **unlinked** (analysis §5.3) unless the screen deleted them. Record the HTTP status of the type delete (does RemoveLink null the required allocation to turbine lookup?). | Allocations: `.../vsb_landleaseallocationwtgs?$select=vsb_name&$filter=_vsb_generatorinproject_value eq null and _vsb_projectcost_value eq <cost-id>` for each of the test project's costs. O&M cost: read the cost you created by its id, `.../vsb_opexprojectcosts(<cost-id>)?$select=vsb_name,_vsb_devicetypeinproject_value`; it is an orphan if the row exists and the lookup is null. Through the screen the allocation query must return **0** rows and the O&M cost must be gone; through the platform alone expect 1 allocation and the O&M cost left over, and delete them. |

#### Phase 1C - rollback of a failed create (flag `createRollback`; scenario A and B only; progress text "Undoing the failed save, please wait...")

To make a save fail without changing code, use the Network tab's **Request blocking** (a pattern of the entity set as the Network tab shows it, for example `vsb_landleaseallocationwtgs`) and remove the pattern afterwards. The block applies to every method, so a pattern without a key blocks creates and deletes alike.

| Id | Needs | Steps | Expected | How to verify |
|---|---|---|---|---|
| **GB-20** Nothing landed | `createRollback` | Block the URL pattern of `vsb_generatortypeinprojects` and Add a WTG type. | Today's error only; no delete request is sent. | Network: no DELETE; the error bar shows the original reason, not "undone". |
| **GB-21** Fails after the type and turbines | `createRollback` | Block `vsb_landleaseallocationwtgs` (3 all-WTG costs) and Add a type with 10 turbines. | The type, the turbines and any bridge row are deleted; the project roll-up is recomputed; the spinner reads "Undoing the failed save, please wait..."; the bar then shows the original reason followed by "This save failed and was undone. Nothing was kept." | Network: deletes in order allocations (if any), bridge row, turbines, type, then one `vsb_projects` update. Rows: none of them exist; the project's plant WTG capacity and cost equal the pre-test values. |
| **GB-22** Cleanup refused | `createRollback` | As GB-21, and also block the delete of the type: a pattern with a key, `vsb_generatortypeinprojects(*`, matches a DELETE of one row but not the create (adjust the pattern to the URL the Network tab shows). | The bar names the type, the number of generators, allocations and bridge rows left, and shows **Retry cleanup**. | The **Retry cleanup** button (`generators-retry-cleanup`) is disabled while refreshing or writing. The text matches `leftoversMessage` and may list every recorded row even if some deletes landed (a known limit; Retry is safe): "This save failed and could not be fully undone. Left behind: ... Press Retry cleanup to remove them." |
| **GB-23** Retry cleanup | `createRollback` | Remove the block and press **Retry cleanup**; press it again afterwards if it is still shown. | Only the recorded ids are deleted; a row already gone (404) counts as gone; a second press is harmless. The commands stay disabled until it ends. | Network: DELETEs of the recorded ids only. Orphan query clean. |
| **GB-24** Scenario B | `createRollback` | Save an out-of-country type so the Request Module Permission flow is called. Note: in DEV the two Generators flows wait for a run-only connection change (D81), so the call may fail on its own. | If the flow fails to start, the rows of the save are deleted as in GB-21. | Mark **Blocked** if the flow cannot be reached either way; do not start a real approval without the test plan of `16-PM-FLOWS-IN-THE-CODE-APP.md` section 7 (D81). |
| **GB-25** Not covered | `createRollback` | Make a new turbine alone, a new PV type, an apply-to-all, and a Replace fail (block an entity set). | No rollback for any of them: today's message, no extra deletes. | Network: no undo DELETEs. |
| **GB-26** Roll-up and a clean second save | `createRollback` | After GB-21, Save the same type again with nothing blocked. | The roll-up was recomputed once by the rollback (one extra `vsb_fabricsyncjobs` row); the second save starts clean. | Sync-job count (GB-70); rows of the second save as GB-30. |

#### Phase 2 - bulk allocation creates (flag `allocations`)

| Id | Needs | Steps | Expected | How to verify |
|---|---|---|---|---|
| **GB-30** Add type, N = 10, L = 3 | `allocations` | Add a WTG type with 10 turbines. | One `createMany` step of 30 rows, sent as 3 `CreateMultiple` requests (10 rows each); the type and turbines stay single creates, so about 16 HTTP requests in all (1 + 10 + 1 + 1 + 3). | `[VSB] DATA create vsb_landleaseallocationwtgs: ... rows`, Network `CreateMultiple` x 3. Rows: names exactly as in the BL-1 baseline rows (same string pattern), `vsb_projectcost` and `vsb_generatorinproject` set, `_owningbusinessunit_value` set, owner set. |
| **GB-31** Larger case | `allocations` | 100 turbines and 5 all-WTG costs (500 rows). | 8 requests of 63 rows, no 429. Record the seconds. | As GB-30; Network shows no 429. |
| **GB-32** One bad row | `allocations` | Open Generators, delete one all-WTG land-lease cost in a second tab, then Save an Add type in the first tab (the allocation of that cost binds to a missing id). If the screen reads the costs fresh at save time this cannot be induced: mark **Blocked** and rely on UT-GENBULK. | The chunk holding the bad row fails whole; rows of chunks that landed stay; the message counts rows ("N of M"); nothing is deleted unless `createRollback` is also on. | Compare the number of allocation rows in Dataverse with the number in the message. A retry sends the same ids and does not duplicate. |
| **GB-33** 501 fallback | `allocations` | Set `sessionStorage.setItem("vsb.generators.createMultiple501","1")` in the console, reload, Add a type. | Allocations go row by row: `N rows, N calls`; the same rows result. | Console: `DATA create vsb_landleaseallocationwtgs: 30 rows, 30 calls`. If the host answers 501 for real, the console shows the `CreateMultiple answered 501 ...` warning once. |
| **GB-34** 429 behaviour | `allocations` | Only if observable: run GB-31 twice in quick succession. | A 429 is retried after its `Retry-After` (at most three tries in all, wait at most 30 s) and the save completes; any other failure is not retried. | Network shows the 429 and the repeat; mark **Not observed** if none occurs. |
| **GB-35** Add turbine | `allocations` | Add one turbine to an existing type with 3 all-WTG costs. | 3 allocation rows in one `CreateMultiple`; type totals and roll-up as today. | Rows as GB-30. |
| **GB-36** Flag off | none | Set `allocations` back to `false`, reload, Add a type. | Allocations go as single creates, 43 requests for N = 10, L = 3, as in the baseline. | Request count equals BL-1. |

#### Phase 3 - bulk updates (flags `status`, `applyAll`)

| Id | Needs | Steps | Expected | How to verify |
|---|---|---|---|---|
| **GB-40** Bulk toggle | `status` | Deactivate and activate the N = 10 type. | One existence read and one `UpdateMultiple` of 10 rows (`statecode` only) for the turbines; type update first, one roll-up last. | Network: 1 read of `vsb_generatorinprojects` with only the key selected, then 1 `UpdateMultiple`. Rows: every turbine has the new `statecode`. If `statecode` in a bulk target is refused, record it: the screen must then keep GB-01's path. |
| **GB-41** Apply to all | `applyAll` | Edit one turbine of the type and apply capacity, hub height and plinth to all. | One `UpdateMultiple` of the 9 siblings, each with its own total height; one roll-up. | Rows: every sibling's capacity, hub height, plinth and total height; type totals and project totals match the rows. Record whether the per-row `owningbusinessunit@odata.bind` on update was accepted. |
| **GB-42** Guard | `status` or `applyAll` | Open the type, delete one of its turbines in a second tab, then Deactivate in the first tab. | Nothing is sent to `UpdateMultiple`; the user is told to reload; no turbine is re-created. | Network: no `UpdateMultiple` and no PATCH; the deleted turbine is still gone. |
| **GB-43** 501 fallback | `status` | Set `sessionStorage.setItem("vsb.generators.updateMultiple501","1")`, reload, Deactivate. | One guarded PATCH per turbine; the same rows result. | Console: `DATA update vsb_generatorinprojects: 10 rows, 10 calls`; no second read per row. |
| **GB-44** Flags off | none | Both flags `false`. | GB-01's path and counts. | Request count equals BL-2 / BL-3 after phase 1. |

#### Phase 4 - bulk turbine creates (flag `turbines`; drop the phase if GB-52 fails)

| Id | Needs | Steps | Expected | How to verify |
|---|---|---|---|---|
| **GB-50** Add type, 10 then 200 turbines | `turbines` | Add a type with 10 turbines, then one with 200 (the maximum). | The type is one single create; the turbines go in the bulk requests of the splitter (1 for 10; 200 rows in 8 chunks of 25); the roll-up is last. | Network and `[VSB] DATA create vsb_generatorinprojects: ...`. Record seconds and the sync-job count. |
| **GB-51** Names and order | `turbines` | Read the turbines of GB-50. | Names `WTG <Short>_1` to `WTG <Short>_N` continue from the project-wide maximum index; each allocation row binds to the right turbine (the screen no longer relies on response order). | Compare turbine names with their allocation rows (`vsb_name` and `_vsb_generatorinproject_value`). |
| **GB-52** Polymorphic bind read-back | `turbines` | For 3 turbines created in bulk, read them back with the expanded navigation property. | The type lookup points at the generator type, not a PV type. | `.../vsb_generatorinprojects?$select=vsb_name&$filter=<turbine ids>&$expand=vsb_ModuleTypeInProjectId_vsb_generatortypeinproject($select=vsb_name)`: the expand is non-null for every row. Repeat for a PV unit with `vsb_ModuleTypeInProjectId_vsb_pvmoduletypeinproject`. The device-type bridge row (`vsb_TypeInProjectId_vsb_generatortypeinproject`) is still a single create. |
| **GB-53** Failure after the type | `turbines` (+ `createRollback`) | Block `vsb_generatorinprojects` and Add a type. | The type exists (as today) unless `createRollback` is on, in which case it is deleted. A retry reuses the same ids. | Rows and request log. |

#### Phase 5 - Replace (flag `replace`)

| Id | Needs | Steps | Expected | How to verify |
|---|---|---|---|---|
| **GB-60** Replace Generator Type | `replace` (+ the flags it composes) | Replace the type of BL-5 (N = 10, L = 3, one O&M cost). | New type, N new turbines, N·L new allocations, old allocations deleted **after** the creates settle, O&M cost re-linked to the new bridge row. | Waterfall: the deletes start after the last create answered. Rows: counts, all links, no orphans (GB-72 before and after). Time against BL-5. |
| **GB-61** Order rules | `replace` | Read the request order of GB-60. | The cancel of an open approval request (if any) finishes first; the O&M cost is detached from the old bridge row **before** that row is deleted; the re-link comes after the new bridge row exists. | Network order. |
| **GB-62** Failure | `replace` | Block `vsb_landleaseallocationwtgs` during a Replace. | No rollback (the old rows are already gone); the message reports what saved. | Rows left are as reported; clean them through the manifest. |
| **GB-63** New type with fewer turbines | `replace` | Replace with a type that has fewer turbines. | The note about unmatched allocations appears as today. | Screen text unchanged. |

#### Cross-cutting

| Id | Needs | Steps | Expected | How to verify |
|---|---|---|---|---|
| **GB-70** Fabric sync-job rows | any | Before each case read the newest `vsb_fabricsyncjobs` rows; after it read them again. | **One** new row per save (a rollback adds one more, GB-26). The bulk requests themselves add none. | `.../vsb_fabricsyncjobs?$select=createdon&$orderby=createdon desc&$top=20`. Record the count per case. |
| **GB-71** Owning business unit | `allocations`, `turbines` | Read the first and last row created by each bulk case. | `_owningbusinessunit_value` and `_ownerid_value` are set on every created row. | Web API read of the created ids from the manifest. A row without a business unit is a Fail. |
| **GB-72** Orphan query | any | After every case, and before and after GB-60. | Zero allocations with no turbine on the test project's costs; none of the O&M costs in the manifest left with an empty bridge lookup. | The two queries of GB-14. |
| **GB-73** Project totals | any | After each case compare the project's plant WTG capacity and cost with the sum of its active types. | Equal. | Project row against the type rows. |
| **GB-74** Console trace | any | Read the console of each case. | Every bulk request, delete and rollback step has a `[VSB]` line, with counts and times and no row values or ids. | CONVENTIONS rule 23. |

---

### B2. Acceptance: at least 50% faster than today

Average of three runs per case, from the `[VSB]` timeline, same project, same data. A phase passes when its case is at least 50% faster with no regression elsewhere; one that misses is reported and the product owner decides (D115 §2 item 6).

| Case | Baseline (s) | HTTP requests | Waves | After (s) | HTTP requests | Waves | Faster by | Phase | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| BL-1 Add type, 10 turbines, 3 costs | | 43 (model) | | | | | | 2, 4 | |
| BL-2a Deactivate | | 12 (model) | 12 | | | | | 1, 3 | |
| BL-2b Activate | | 12 (model) | 12 | | | | | 1, 3 | |
| BL-3 Apply to all | | 12 (model) | | | | | | 3 | |
| BL-4 Delete type | | | | | | | | 1B | |
| BL-5 Replace type | | | | | | | | 5 | |

Each baseline cell is the average of the three BL runs; each "After" cell the average of three runs with the phase's flag on. Out of the criterion: single-row saves that cannot improve by 50%.

---

### B3. Cleanup

1. Turn every flag back to `false` and revert local changes to `generatorsBulkFlags.ts` and `concurrency.ts` (`git status` must show neither).
2. Delete everything in the manifest, **children before parents**: allocations, O&M costs created for the test, bridge rows, turbines, types, then the three land-lease costs created for the test. Use the app's own Delete where it exists, or make.powerapps.com.
3. Run the orphan queries (GB-14, GB-72): zero rows.
4. Run one **final roll-up** (for example Save a type edit and revert it, or a Deactivate then Activate of a remaining type) so the project's plant totals are restored; accept the extra `vsb_fabricsyncjobs` rows it creates.
5. Check `git status` shows no id, URL or manifest in the repository. Delete the manifest file when the results are recorded.

### B4. Recording the result

Put the outcome, per case, in D115 (`02-OPEN-DECISIONS.md`): Pass / Fail / Blocked, the measured request counts against the model, the acceptance table, and the final tier numbers of GB-13. Only then change a flag in code, in its own commit with the DEV result recorded.
