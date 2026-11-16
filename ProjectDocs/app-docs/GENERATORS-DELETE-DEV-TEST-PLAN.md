# Test plan - Generators delete hardening (D116)

Status: **draft, 16 Nov 2026.** The code is merged on `integration/generators-delete`, **not product-approved, not run against DEV**. Of the `GENERATORS_DELETE` flags only `tieredDeletes` is `true`; `verifyDeletes`, `parentOrder` and `guardedUpdates` are `false`. The hardened delete path has no flag and is live. Decision record: `02-OPEN-DECISIONS.md` **D116**. Plan: `GENERATORS-DELETE-HARDENING-PLAN.md` (scenarios S1 to S11, packages DEL-0 to DEL-9). Companion: `GENERATORS-BULK-DEV-TEST-PLAN.md` (D115; its setup, `[VSB]` reading guide, manifest and cleanup rules apply here and are not repeated in full).

This plan has three parts:
- **Part A** is automated and runs in `npm run verify`.
- **Part B0** is DEL-0: read-only facts from DEV, which size everything else. Run it first.
- **Part B** is the manual cases DT-01 onward against **VSBCloud_Dev** on the DEV test project, which only a person with a signed-in browser can run.

Do not flip a flag in a committed file until its cases pass and the result is recorded in D116.

## What is covered

| Package | Change | Needs (flag or setting) |
|---|---|---|
| DEL-1 | Tier limits behind a flag | `GENERATORS_DELETE.tieredDeletes` (`true` today; `false` = one group at limit 8) |
| DEL-2 | Hardened deletes: bounded retry, strict gone-check, read-back of "gone" rows, `DeleteNotConfirmedError` | none for the retry and the read-back of 404 rows (live); `verifyDeletes` for `confirm` rows that were deleted |
| DEL-3 | O&M clean-up for every bridge row and chain member, any status; `loadOpexDependency` checks every active bridge | none |
| DEL-4 | Allocation deletes of one land-lease cost run one after another | `parentOrder` (O&M head and period order is not built) |
| DEL-5 | Truthful rollback leftovers; partial-delete message for failed delete jobs | none for the delete message; `GENERATORS_BULK.createRollback` for the rollback |
| DEL-7(a) | Updates that must not re-create a deleted row are guarded | `guardedUpdates` |
| DEL-8 | `npm run orphans:generators`: orphan report, guarded clean-up | shell variables `DATAVERSE_URL`, `DATAVERSE_TOKEN` |
| Gate | `check:power` requires the `environment_<id>` entry | none |

Not built, so not tested here: DEL-0 as code (it is this plan's Part B0), DEL-6 (Replace saga), DEL-7(b), DEL-9, O&M head and period ordering, rollback allocation ordering by parent, `stopOnFailure` use, a roll-up-only retry.

---

## Part A - automated (no environment needed)

From `ProjectCosts-CodeApp/`:

```powershell
npm run verify
```

Expected: every step passes; `check:power` reports no problems (the `environment_<id>` entry in `power.config.json` must stay, CONVENTIONS rule 9).

| Suite | Ids | What it proves |
|---|---|---|
| `data/retry.test.ts` | UT-RETRY-002..015 | Which statuses retry (429, 503 with `Retry-After`, 500, 504, no status), which never do (400, 401, 403, 404, 409), the waits, one log line per retry |
| `platform/errors.unwrapDeleteStrict.test.ts` | UT-PLAN-911..914 | Only 404 or `0x80040217` is "gone"; free text is a failure |
| `data/verifyGone.test.ts` | UT-PLAN-916..921 | One read per 40 ids, a failed read throws, `DeleteNotConfirmedError` carries counts only |
| `data/executePlan.hardened.test.ts` | UT-PLAN-922..947 | Hardened path in the engine: retry, read-back of 404 rows, `confirm` with `verifyDeletes`, `deleted` and `done` after a refusal |
| `data/concurrency.serial.test.ts` | UT-CONC-020..024 | `createSerialRunner`: same key in order, other keys in parallel, a queue holds no gate slot |
| `data/generatorsDeleteFlags.test.ts` | UT-DELFLAG-001..003 | The flag file's defaults |
| `features/pm/generators/deleteHardening*.test.ts` | UT-GEN-953..998 | Plans: tiers on and off, `serialKey` only with `parentOrder`, `confirm` marks, `guardedUpdates`, `remainingRows`, `plannedDeleteRows`, `deletePartialMessage`, rollback with `maybeLanded` |
| `data/generators.opex.test.ts`, `hooks.deleteLoaders.test.ts` | UT-GENDATA-OPEX-001..023 | `listOpexCostIdsForBridges` (every bridge, chains, any status), `loadOpexDependency`, the loaders |
| `Screen.rollback.test.tsx` | UT-GEN-1100..1109 | The rollback reports only rows really left, its own error, the roll-up-only text, Retry on the reduced list |
| `Screen.delete.test.tsx` | UT-GEN-1110..1153 | The partial-delete text on each delete job; cleared by a new command or a project change |
| `test/generatorsOrphans.test.ts` | UT-ORPH-001..043 | The orphan script offline: classification, report-only default, `--apply` guards, backup before delete |
| `test/powerSources.test.ts` | UT-POWERSRC-001..006 | The `check:power` environment entry gate |

---

## Part B0 - DEL-0: facts from DEV (read-only except where stated; no code)

Use the DEV test project and nothing else. **Never write the project id, a token, the tenant or the org host name into a file, a screenshot caption or a commit.** Below, `<org>` is your DEV org URL, `<project>` the test project id, typed into your own shell or browser only.

### Before you start

1. Start the app against DEV as in the bulk plan (B1 "Before you start", steps 2 and 5). Check `pac auth list` shows VSBCloud_Dev.
2. A way to read raw rows: make.powerapps.com (Tables, Data) or a Web API read in a signed-in browser tab: `<org>/api/data/v9.2/...`.
3. Keep a manifest of created ids outside the repository (one line per row: `<case id>  <entity set>  <id>`), as in the bulk plan.
4. The shell for the orphan script: set the variables **in the shell only**, never in a script or file, and clear them at the end:

   ```powershell
   $env:DATAVERSE_URL = "https://<org-host>"          # the DEV org URL, https
   $env:DATAVERSE_TOKEN = "<bearer token>"             # from your own token source; never printed by the script
   # ... run the script ...
   Remove-Item Env:DATAVERSE_URL, Env:DATAVERSE_TOKEN  # when done
   ```

### DEL-0.1 Baseline orphan counts (queries B1 to B8)

Run the script read-only first, from `ProjectCosts-CodeApp/`:

```powershell
npm run orphans:generators -- --project <project>      # scoped to the test project; skips B4, B5, B6 (no project column)
npm run orphans:generators                              # all of DEV: B1 to B8
```

The console prints counts only. One CSV per class and `summary.json` go to a new folder under the OS temp directory (it holds ids and names: confidential, keep it out of the repository). Exit code 0 = done, 1 = a request failed, 2 = usage or configuration error.

Cross-check each count with the raw query (the script's filters have never run live; if they disagree, the script is wrong, not DEV):

| Id | Finds | Query (after `<org>/api/data/v9.2/`) |
|---|---|---|
| B1 | Allocations with no turbine | `vsb_landleaseallocationwtgs?$select=vsb_landleaseallocationwtgid,vsb_name,_vsb_projectcost_value&$filter=_vsb_generatorinproject_value eq null` |
| B2 | Allocations with no cost (expect 0) | the same with `_vsb_projectcost_value eq null` |
| B3 | O&M costs with no bridge | first `vsb_opexsubaccounts?$select=vsb_opexsubaccountid&$filter=vsb_name eq 'Operation %26 Maintenance'`, then `vsb_opexprojectcosts?$select=vsb_opexprojectcostid,vsb_name,_vsb_project_value,_vsb_parentcost_value&$filter=_vsb_devicetypeinproject_value eq null and _vsb_subaccount_value eq <sub-account id>` |
| B4 | More than one bridge per type | `vsb_devicetypesinprojects?$select=vsb_devicetypesinprojectid,_vsb_typeinprojectid_value,createdon&$orderby=_vsb_typeinprojectid_value,createdon`; group by `_vsb_typeinprojectid_value` and look for a value that appears twice |
| B5 | Bridges with no type | `vsb_devicetypesinprojects?$filter=_vsb_typeinprojectid_value eq null` |
| B6 | Turbines with no type | `vsb_generatorinprojects?$filter=_vsb_moduletypeinprojectid_value eq null` |
| B7 | Phantom types | `vsb_generatortypeinprojects?$filter=_vsb_generator_value eq null or _vsb_project_value eq null` |
| B8 | Non-all-WTG land-lease costs with no allocation | the plan's FetchXML on `vsb_landleaseprojectcost` (`vsb_allwtgallocated = 0`, outer link to `vsb_landleaseallocationwtg`, null-alias filter). The script reads it client side instead: `vsb_landleaseprojectcosts?$select=vsb_landleaseprojectcostid,vsb_name,_vsb_project_value,vsb_allwtgallocated,statecode&$filter=_vsb_project_value eq <project> and statecode eq 0 and vsb_allwtgallocated ne true`, then the allocations of those costs in chunks of 40 ids; also costs whose allocations all have a null turbine |

Record: the count per class, the date, and whether script and raw query agree. B4 greater than 0 means a second bridge exists (scenario S7) and DT-09 can use it.

### DEL-0.2 Does deleting a type null the allocation lookup (S1)

Same setup as GB-14 of the bulk plan: a type with 2 turbines, a bridge row, **one allocation** (one all-WTG cost) and **one O&M cost** on the bridge, all on the DEV test project; add each row to the manifest. Then delete the **type row alone** in make.powerapps.com (not through the app). Record:
- the HTTP result or the error text shown (does the delete succeed, or is it refused because the allocation's turbine lookup is required?);
- the allocation row afterwards (`vsb_landleaseallocationwtgs(<id>)?$select=_vsb_generatorinproject_value`): is the lookup null, or is the allocation gone?
- the O&M cost row afterwards (`_vsb_devicetypeinproject_value`).

Expected by the plan (claim 1): turbines and bridge go by cascade; allocation and O&M cost are only unlinked. If the delete is refused, S1 allocations cannot exist from a declined approval; record that.

### DEL-0.3 Duplicate bridge query

B4 above is the whole check. If B4 is 0 and DT-09 needs a second bridge, create one by hand in make.powerapps.com (a row of `vsb_devicetypesinprojects` pointing at the test type), and add it to the manifest.

### DEL-0.4 Capture a real 429 or lock timeout (do not guess)

Provoke one on the test project only: delete 1,000 allocation rows or a type with 200 turbines (the load of GB-13), or delete overlapping cascades from two browsers. In the Network tab record, for any failed request: the HTTP status, the `Retry-After` response header (present or not), and the error `code` and `message` text from the response body (text only, no ids). If none occurs, write **Not observed**; a deadlock or lock text is only added to `retry.ts` once it is captured. Also note whether the `[VSB]` retry line (DT-03) shows the same status.

### DEL-0.5 `statecode` on create

For the DEL-6 design: whether a create with `statecode = 1` is accepted. On a row type the test project may own (for example one bridge row from DEL-0.3), POST it through the Web API in a signed-in tab with `"statecode": 1` in the body, then read the row's `statecode`. Record the HTTP status and the stored value. If the required fields are unknown, mark **Blocked** and ask the data owner. Delete the row afterwards and list it in the manifest.

---

## Part B - manual cases, VSBCloud_Dev

### Before you start

Use the setup of the bulk plan (B1 "Before you start") and these additions:

1. **Flags, one at a time.** Edit `GENERATORS_DELETE` in `src/data/generatorsDeleteFlags.ts` **locally** (a working-tree change you never commit), set only the flag the case names, and let the dev server reload. Revert it after the case group: `git checkout -- src/data/generatorsDeleteFlags.ts`. For DT-08 also edit `LEAF_DELETE_CONCURRENCY` and `CASCADE_DELETE_CONCURRENCY` in `src/data/concurrency.ts` locally and revert.
2. **Failing a request without code**: the Network tab's **Request blocking**. A pattern with a key (for example `vsb_landleaseallocationwtgs(*`) matches a DELETE of one row but not a read or a create. A pattern ending `...wtgs?*` matches reads with a query string. Remove the pattern after each case. A blocked request is a network error with **no HTTP status**; note the status the `[VSB]` line really shows.
3. **Reading the console**: filter `[VSB]`, keep **Preserve log** on. New lines of this work:
   - a retry: `[VSB] ACTION <entity set>: delete try 1 of 3 failed (HTTP 429); trying again in 1000 ms` (a warning; with no status it reads `no HTTP status, network error`). Ids and values never appear.
   - the rest as in the bulk plan: `[VSB] HTTP DELETE ...`, `[VSB] DATA delete <entity set>: N rows, M calls, T ms ...`, `[VSB] ACTION Mutation @ /project/generators: ...`, `[VSB] ERROR ...`.
4. **Count requests** from the Network tab, filtered `vsb_`: DELETEs, and reads whose URL selects only the key (the read-back of `verifyGone`, `$filter` of up to 40 ids).
5. **Record each result** as Pass, Fail, Blocked or Not observed, with the `[VSB]` lines and counts.

### Request model for the read-back

A hardened delete adds a read **only** when: (a) it answered 404 or `0x80040217` ("gone"), or (b) it has `confirm: true` and `verifyDeletes` is on. One read per 40 ids per entity set, after the step ends. `confirm` deletes: type, PV type, land-lease cost, unit, inverter, substructure, BESS, hydrogen, substation. No `confirm`: allocation, O&M cost, bridge row, single-turbine delete.

---

### B1. Cases

#### DEL-2 hardened deletes (live; no flag unless stated)

| Id | Needs | Steps | Expected | How to verify |
|---|---|---|---|---|
| **DT-01** Happy path | none | Delete a type with 2 turbines, one bridge, one shared allocation (the DEL-0.2 shape, built through the app). | Everything goes as before; no retry line; no read-back request (nothing answered 404); roll-up last. | Console: `DATA delete` lines per table, no `delete try` line, no `ERROR`. Network: DELETEs only, no key-only read of a deleted set. DELETE count = X + O + 2 (state X and O as in GB-10). Orphan queries B1 and B3 stay clean. |
| **DT-02** Refused delete (403, never retried) | none; a test user whose role lacks delete on `vsb_landleaseallocationwtgs` | As that user, delete a turbine whose allocation is not shared, or a type with allocations. | The delete fails at once with a clean error; the user's other deletes of the group still go; **no `delete try` line** (403 is not retried). The partial-delete text of DT-12 follows the error. | Console: one failed `HTTP DELETE ... 403`, no retry line. Network: exactly one DELETE per row, none repeated. If no such user exists, mark **Blocked**. |
| **DT-03** Retry line | none | Open the type delete's confirmation, then add a block on `vsb_landleaseallocationwtgs(*`, confirm. After the first `delete try 1 of 3` line, remove the block. | The failed DELETE is sent again after about 1 s (try 2) and succeeds; the save completes. With the block left on: three tries in all, waits 1000 ms then 2000 ms, then the plan fails. | Console: the exact `delete try N of 3 failed (...)` lines with their wait. Record whether the status shown is "no HTTP status" or an HTTP code (the SDK may attach one to a blocked request). A real 429 or 503 with `Retry-After` is **Not observed** unless DEL-0.4 produced one. |
| **DT-04** The gone read-back | none | Open a type delete's confirmation, delete one of the type's allocations in a second tab, then confirm in the first. | The first tab's delete of that allocation answers 404 and counts as gone; the save ends cleanly. | Network: one DELETE answering 404 for that row only (a 404 on every id of a table would mean a wrong entity set: report it, as GB-12); then **one** key-only read of `vsb_landleaseallocationwtgs` for that id, answered empty. No `ERROR`. |
| **DT-05** Read-back fails, and `DeleteNotConfirmedError` | none (a); `verifyDeletes` (b) | (a) As DT-04, but after the confirmation opens also block `vsb_landleaseallocationwtgs?*` (reads). (b) Not provokable live: no delete is silently ignored on DEV. | (a) The plan fails closed: the row is not counted as deleted, the error bar shows the failure and the partial-delete text lists the row under "Not removed". Never "gone". (b) **Blocked by design**: `DeleteNotConfirmedError` (cause text "N row(s) of <entity set> is/are still present after the delete", counts only) is pinned by UT-PLAN-916..921 and UT-PLAN-922..947. | (a) Console `ERROR` with the root cause; Network: the blocked read. Remove the block, press Delete again: it finishes. |
| **DT-06** `confirm` rows with `verifyDeletes` | `verifyDeletes` = `true` | Delete a type (a `confirm` row) with the flag on, then with it off. | On: one extra key-only read of `vsb_generatortypeinprojects` (and of `vsb_landleaseprojectcosts` when a cost is deleted) after the step, answered empty. Off: no read, as DT-01. Request count differs by exactly those reads. | Network, both runs. Record the seconds of both (the read-back costs one request per entity set per step). |

#### DEL-4 parent order (flag `parentOrder`)

| Id | Needs | Steps | Expected | How to verify |
|---|---|---|---|---|
| **DT-07** `serialKey` timing | `parentOrder` | Load: one type with **20 turbines** and **3 all-WTG land-lease costs**, plus a second type with 1 turbine so the costs stay shared. The type delete then sends 60 allocation DELETEs (20 x 3) and deletes no cost (state the counts you read in the console). Delete the type three times with the flag **off** and three times **on** (rebuild the load each time; add rows to the manifest). | Same 60 DELETEs both ways. On: the 60 are three chains of 20, one chain per cost, so at most 3 allocation DELETEs in flight; the other leaf rows and every cascade step are unchanged. Speed may drop (the plan calls this out): the flag is switched on only if on is not slower in a way you accept. | Seconds (the `ACTION` line), requests, the maximum DELETEs in flight at once (waterfall), error count (`ERROR`, 429), slowest request, for each of the six runs. Fill the table below. |

DT-07 result table (fill in):

| Run | `parentOrder` | Seconds | DELETEs | Max in flight | 429 or error | Verdict |
|---|---|---|---|---|---|---|
| 1 | off | | | | | |
| 2 | off | | | | | |
| 3 | off | | | | | |
| 4 | on | | | | | |
| 5 | on | | | | | |
| 6 | on | | | | | |

#### DEL-1 tier limits (flag `tieredDeletes`)

| Id | Needs | Steps | Expected | How to verify |
|---|---|---|---|---|
| **DT-08** Limits 4, 8, 16, tiers on and off | `tieredDeletes` on, then off; local edit of `concurrency.ts` | Use the loads of GB-13: (a) 100 allocation rows, (b) 1,000 allocation rows, (c) a type with 200 turbines. With `tieredDeletes` **on**, run each load at leaf and cascade limits **4, 8 and 16** (change the two constants; each plan imports both). With `tieredDeletes` **off**, run each once: all deletes are one group at limit 8. | Same requests every time. Record which setting is fastest with no 429 or lock failure; the tier numbers of D115 (16 and 4) are confirmed or replaced. | Fill the table below, then record the final numbers in D116 and D115. |

DT-08 result table (fill in):

| Load | `tieredDeletes` | Limit | Seconds | Requests | Slowest request (ms) | 429 or error | Verdict |
|---|---|---|---|---|---|---|---|
| 100 allocations | on | 4 | | | | | |
| 100 allocations | on | 8 | | | | | |
| 100 allocations | on | 16 | | | | | |
| 100 allocations | off | 8 (one group) | | | | | |
| 1,000 allocations | on | 4 | | | | | |
| 1,000 allocations | on | 8 | | | | | |
| 1,000 allocations | on | 16 | | | | | |
| 1,000 allocations | off | 8 (one group) | | | | | |
| Type with 200 turbines | on | 4 | | | | | |
| Type with 200 turbines | on | 8 | | | | | |
| Type with 200 turbines | on | 16 | | | | | |
| Type with 200 turbines | off | 8 (one group) | | | | | |

#### DEL-3 all-bridge O&M clean-up

| Id | Needs | Steps | Expected | How to verify |
|---|---|---|---|---|
| **DT-09** Two bridges | none | Seed **two bridge rows** for one type on the DEV test project: use a second bridge found by B4, or create one by hand (DEL-0.3). Put an O&M cost on each bridge; give one of them a period row (a chain member whose parent cost is the head); make one head **inactive**. Delete the type through the app. | Every O&M head and chain member of both bridges is deleted, active or not: O DELETEs on `vsb_opexprojectcosts`, where O counts all of them. No O&M row is left with an empty bridge lookup. | Console `DATA delete vsb_opexprojectcosts: O rows`. Query B3 afterwards: 0 rows for the test project's cost ids. Compare with the old behaviour (first bridge only: the second bridge's costs survive as "Other OPEX"). |
| **DT-10** Guard sees every bridge | none | With the DT-09 setup (an **active** O&M cost on the **second** active bridge only, none on the first), try to deactivate or delete the **active** type. | The O&M guard blocks it (any active bridge counts), with the screen's existing guard text. Before DEL-3 only the first bridge was checked. | Screen text unchanged from the canvas wording; no request sent. |
| **DT-11** Replace re-links all | none | With the DT-09 setup, Replace the type. | Every O&M cost of both old bridges (heads and period rows) now points at the new bridge. | Read each cost's `_vsb_devicetypeinproject_value`: all equal the new bridge id. B3 clean. |

#### DEL-5 truthful messages

| Id | Needs | Steps | Expected | How to verify |
|---|---|---|---|---|
| **DT-12** Partial-delete message | none | Open a type delete's confirmation (type with allocations, an O&M cost and a land-lease cost), add a block on `vsb_opexprojectcosts(*`, confirm. Remove the block, press Delete again. | The error bar shows the job's own error, then `Removed: <counts>. Not removed: <counts>. Press Delete again to finish.` The counts are taken from the plan: "Removed" lists what answered, "Not removed" lists the failed rows and every later delete never sent (types, land-lease costs). Family order: generator types, PV types, generators, land-lease allocations, land-lease costs, O&M costs, device-type rows, other rows (inverter, substructure, storage, hydrogen and substation rows read "other row"). The second press removes the rest (rows already gone answer 404 and are read back). | Compare the numbers with the DELETEs in the Network tab and with queries B1 and B3. A new command or a project change clears the text. No text when every attempted row went, or the plan was refused. |
| **DT-13** Rollback leftovers | `GENERATORS_BULK.createRollback` | As GB-22 of the bulk plan: block `vsb_landleaseallocationwtgs`, then also `vsb_generatortypeinprojects(*`, Add a type with 10 turbines. The rollback deletes the turbines and the bridge row but cannot delete the type. | The bar says what is really left: the type's name, `0 generators`, `0 land-lease allocations` (not the 10 turbines that were deleted), the rollback's own error (cut at 240 characters) and **Retry cleanup**. Retry cleanup, after removing the block, deletes **only the type** (1 DELETE) and a second press is harmless. | Network: the DELETEs of the first rollback and the one of Retry. Compare the message with B1, B6, B7. D115's old text listed every recorded row. |
| **DT-14** Rollback undoes `maybeLanded` | `createRollback` + `GENERATORS_BULK.turbines` (or `allocations`) | Make one bulk create chunk fail so some rows may have landed (a Request blocking pattern for `CreateMultiple` on a large Add type; adjust to the URL the Network tab shows). | The rollback also sends DELETEs for the rows that may have landed; those that never existed answer 404 and read as gone. Nothing is left. | Orphan queries B1, B6, B7 clean. Mark **Not observed** if no chunk can be made to fail; UT-GEN-953..998 pin it. |
| **DT-15** Roll-up-only failure | `createRollback` | Only if timing allows: let the rollback's rows delete, then fail the final project update. | The text says the generator rows were removed but the project totals could not be updated; no Retry cleanup button. | Mark **Blocked** if the timing cannot be hit; UT-GEN-1100..1109 pin it. |

#### DEL-7(a) guarded updates (flag `guardedUpdates`)

| Id | Needs | Steps | Expected | How to verify |
|---|---|---|---|---|
| **DT-16** Stale save after a delete | `guardedUpdates` | Two browsers on the DEV test project. Browser A opens Generators and shows a type with 2 turbines. Browser B deletes that type. In browser A (stale, no reload) save a turbine edit, or Deactivate the type. Repeat once with the flag **off**. | On: the save is refused with the screen's "record gone" text; no PATCH re-creates the type. Off (scenario S8): a phantom type row may be re-created by the PATCH; record what you see. | Network in A: a read, then no PATCH on `vsb_generatortypeinprojects`. Query B7 and the type's id after both runs. Delete any phantom row via the manifest. |
| **DT-17** Apply to all and Replace re-link | `guardedUpdates` | Browser B deletes one sibling turbine; browser A (stale) edits a turbine with apply to all. For Replace: delete an O&M cost in B, then Replace in A. | The deleted row is not re-created; the save reports the row gone. | Network: reads then no PATCH of the deleted id; rows queried by id after the run. |

#### DEL-8 orphan script

| Id | Needs | Steps | Expected | How to verify |
|---|---|---|---|---|
| **DT-18** Report, then guarded clean-up | shell variables; an orphan seeded as in DEL-0.2 | (1) Run the report (DEL-0.1) and note the B1 count. (2) Review the CSV; copy only the ids you confirm into a manifest file (one id per line, `#` for comments) **outside the repository**. (3) `npm run orphans:generators -- --apply --dry-run --class B1 --manifest <file>` (reads only). (4) The real run: `npm run orphans:generators -- --apply --class B1 --manifest <file> --yes-delete`. (5) Repeat the report. | (3) prints what (4) would do, deletes nothing. (4) refuses the whole run if an id is not currently in B1 (try one extra id first: nothing may be deleted, exit 2); otherwise writes a JSON backup into `--out` **before the first delete**, deletes 4 at a time (a 404 is already gone), reads every id back, exits 0 with none present. (5) shows B1 reduced by the manifest size. Without `--yes-delete`: refused, exit 2. Class B4 or B8: refused (report-only, exit 2). | Console counts only, no ids; the backup file exists with the full rows; Network (or the script's output) shows at most 4 DELETEs at a time; the raw query B1 agrees. |

#### Cross-cutting

| Id | Needs | Steps | Expected | How to verify |
|---|---|---|---|---|
| **DT-19** Owner and totals | any | After every case read the project's plant WTG capacity and cost and the number of `vsb_fabricsyncjobs` rows (GB-70 and GB-73 of the bulk plan). | Totals equal the sum of the active types; one sync-job row per save (a rollback adds one). | As the bulk plan. |
| **DT-20** Console trace | any | Read the console of each case. | Every delete, retry, read-back and rollback step has a `[VSB]` line with counts and times, no ids or values (CONVENTIONS rule 23). | Console. |

---

### B2. Results (fill in)

| Id | Flag or setting | Date | Result (Pass / Fail / Blocked / Not observed) | Requests | Seconds | Notes (`[VSB]` lines, counts against expectation) |
|---|---|---|---|---|---|---|
| DEL-0.1 | | | | | | B1: ... B2: ... B3: ... B4: ... B5: ... B6: ... B7: ... B8: ... |
| DEL-0.2 | | | | | | status of the type delete; allocation lookup; O&M lookup |
| DEL-0.3 | | | | | | |
| DEL-0.4 | | | | | | status, `Retry-After`, error code and text |
| DEL-0.5 | | | | | | |
| DT-01 | none | | | | | |
| DT-02 | none | | | | | |
| DT-03 | none | | | | | |
| DT-04 | none | | | | | |
| DT-05 | none / `verifyDeletes` | | | | | |
| DT-06 | `verifyDeletes` | | | | | |
| DT-07 | `parentOrder` | | | | | table above |
| DT-08 | `tieredDeletes` | | | | | table above |
| DT-09 | none | | | | | |
| DT-10 | none | | | | | |
| DT-11 | none | | | | | |
| DT-12 | none | | | | | |
| DT-13 | `createRollback` | | | | | |
| DT-14 | `createRollback` + bulk flag | | | | | |
| DT-15 | `createRollback` | | | | | |
| DT-16 | `guardedUpdates` | | | | | |
| DT-17 | `guardedUpdates` | | | | | |
| DT-18 | shell variables | | | | | |
| DT-19 | any | | | | | |
| DT-20 | any | | | | | |

### B3. Cleanup

1. Revert every local flag and constant change (`git status` must show neither `generatorsDeleteFlags.ts`, `generatorsBulkFlags.ts` nor `concurrency.ts`). Remove every Request blocking pattern.
2. Delete everything in the manifest, **children before parents**: allocations, O&M costs, bridge rows (including the ones made by hand), turbines, types, then the land-lease costs created for the test, then any phantom row from DT-16. Use the app's Delete where it exists, or make.powerapps.com. Rows seeded for DEL-0.2 and DEL-0.5 are in the manifest too.
3. Run the orphan report again for the test project: B1, B2, B3, B7, B8 must match the DEL-0.1 baseline.
4. Run one **final roll-up** (a type edit and revert, or a Deactivate then Activate of a remaining type) so the project's plant totals are restored.
5. Clear the shell variables (`Remove-Item Env:DATAVERSE_URL, Env:DATAVERSE_TOKEN`), delete the temp report folder and the manifest file once the results are recorded, and check `git status` shows no id, URL, token or manifest in the repository.

### B4. Recording the result

Put the outcome per case in D116 (`02-OPEN-DECISIONS.md`): Pass, Fail, Blocked or Not observed, the measured counts against the expectation, the DT-07 and DT-08 tables, and the DEL-0 facts (the HTTP result of DEL-0.2, B1 to B8 counts, the 429 or lock text). Then act on the answers: a captured lock text is added to `retry.ts` in its own change; a flag changes in code only in its own commit with the DEV result recorded; DEL-6 and DEL-9 wait for the product questions of the plan.
