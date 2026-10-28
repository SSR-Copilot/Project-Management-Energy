# Test plan — Add Cost from Table bulk Save (D51)

Status: **draft, 27 Oct 2026.** The change is uncommitted and not product-approved. Decision
record: `02-OPEN-DECISIONS.md` **D51**. Bugs fixed with it: **CA-9**, **CA-10**, **CA-11**; open:
**CA-12** (`01-BUGS-FOUND.md`).

This plan has two halves:
- **Part A** is automated and runs in `npm run verify`.
- **Part B** is a manual test against **VSBCloud_Dev**, which only a person with a browser can run.

Run Part B only after Part A is green.

## What changed, in one paragraph

Save on *Add Costs from Table* used to send one request per changed contract, one per changed
month cell, one per total, plus comment and cost deletes for every removed contract. It now runs
as four steps:
1. **Phase 1:** one `UpsertMultiple` for contracts, carrying each contract's final total.
2. **Phase 2:** one `UpsertMultiple` for cost rows.
3. **Phase 3:** one delete per cleared cell.
4. **Phase 4:** one delete per removed contract. The Dataverse cascade removes that contract's
   cost rows and comments.

Before any write, a check confirms that the rows being updated still exist. A retry after a failure
reuses the same row ids, so it can't create duplicates. The one exception: a new contract created
by a failed attempt and then removed from the sheet before the retry is left behind. If a step
fails after an earlier one saved, the contract totals are re-checked and corrected before the
error is shown.

The switch `BULK_SAVE` in `src/data/addCostSheet.ts` turns the old path back on.

**Performance wave (27 Oct 2026, D51 §11).** The list above is the first design. Since then:
- the writes go out as `CreateMultiple` (new rows) and `UpdateMultiple` (existing rows), the two
  sent in parallel, instead of `UpsertMultiple`. A 501 on an action's first request makes that
  action continue row by row (one `PATCH` per row) for the rest of the tab's session;
- the steps no longer wait for one another. The two existence checks run together. Then the
  contract deletes, the contract writes, the cost writes of existing contracts and the cost deletes
  all start at once, and the cost rows of new contracts start as soon as the contract writes
  succeed;
- Save no longer waits for the sheet to reload before it navigates away.

**Round-trip and prepare pass (27 Oct 2026, D51 §11.12).** The deletes start at once, beside the
existence check. A first Save in a tab with no 501 flag skips the existence check of the rows it
writes, so the writes start at once too. An unedited Save writes no contract (BS-31).

The step numbers 1–4 still name the four operations in the failure messages.

---

## Part A — automated (no environment needed)

From `ProjectCosts-CodeApp/`:

```powershell
npm run verify
```

Expected:
- every step passes;
- `check:power` reports **84 registered, 0 problems** (81 tables plus `CreateMultiple`,
  `UpdateMultiple` and `UpsertMultiple`; the `environment_<id>` entry in `power.config.json` is
  accepted and must stay, CONVENTIONS rule 9);
- the test count is higher than 4,129 (the 27 Oct run after the second fix wave).

What the suites pin:

| Suite | Ids | What it proves |
|---|---|---|
| `features/cost/add-costs-from-table/savePlan.test.ts` | UT-ACSAVE-* | The plan: four phases. No writes under a removed contract. Totals include deletions. Unchanged cells skipped. Owning-BU bind on new rows only. Conflicts rejected with a readable reason. Stable ids for the same row identity. 400-seed equivalence with the old save. A 10,000-row benchmark. |
| `features/cost/add-costs-from-table/rules.test.ts` | UT-ADDCOST-SAVEMSG-* | Every save-failure message. |
| `data/bulkWrites.test.ts` | UT-BULK-* | Request shape (`@odata.type`, primary key). Batches of 500. Validation before any send. A failed batch stops the phase and reports what landed. Every refused delete is reported. |
| `data/addCostSheetBulk.test.ts` | UT-ACBULK-* | The concurrent order: parallel existence checks, stage A started together (contract deletes first), new contracts' costs only after the contract step (031–033). Pre-write existence check, including a retried "new" row sent as an update (036). Every operation settles before reconciliation; the lowest failed step is named (034–035, 037). Total reconciliation after a failure. No reconciliation when nothing was sent. Timings (038). |
| `data/addCostSheet.bulk.test.ts` | UT-ACSHEET-BULK-* | End to end with a mocked SDK: new rows only to `CreateMultiple`, existing rows only to `UpdateMultiple`, the two in parallel (027–028); deletes through `deleteRecord`, no comment reads or deletes for a removed contract. The per-action 501 fallback and its `sessionStorage` flags (024–026, 029–030). One-group and mixed failures (031–032). The save's console line (033–034). A retry sends the same new ids. The existence check selects the primary key only, filters on the server, in chunks of 40. Error classification (`toSaveFailure`) and the conflict detail. The old path's total update now fails loudly when refused (CA-10, 022–023). |
| `features/cost/costing/useAddCostSheet.test.ts` | UT-ACSHEET-QUERY-* | No refetch on focus or reconnect (001). Save does not wait for the post-save reloads and never refetches the sheet (002). |
| `platform/errors.rootCause.test.ts` | UT-ERR-ROOT-* | The technical line's Dataverse reason (`rootCauseDetail`). |
| `data/addCostSheet.test.ts` | UT-ADDCOST-032…037, UT-ACSHEET-LEGACY-* | The old path still works as the rollback, and its refused deletes now fail loudly (CA-10). |
| Round-trip and prepare pass (D51 §11.12) | UT-ACBULK-040…050, UT-ACSHEET-BULK-035…040, UT-CONC-013/014, UT-ADDCOST-062…083, UT-ADDPERF-001…003, UT-ACSAVE-032…039 | Deletes at t = 0 and no upsert verify on a first attempt; a 404 delete counts as already gone, a 403 still fails; the mid-save `UpdateMultiple` 501 guard; the log line's gate peak and request times. The indexed prepare matches the code it replaced, with read counts and a 15,000-row bench (`prepare.bench.test.ts`). One `onDataChange` on mount (`spreadsheet/SpreadSheet.test.tsx`). `diffRows` reports only edited rows (CA-11). No contract target when nothing changed. |

To spot-check that a test really guards its fix: revert the fix locally, run that one file
(`npx vitest run <file> --maxWorkers=1`), see it fail, and restore the file.

---

## Part B — manual, VSBCloud_Dev

### Before you start

1. **Use a test project you can change freely.** Never use a live project such as Wirmighausen.
   It needs one CAPEX category with at least three contracts that have costs in several years.
   Note the project id.
2. **Stop any running dev servers and the local host.** The host reads `power.config.json` only
   when it starts, and it must see the `environment_<id>` entry. Then start the two local
   terminals from `ProjectCosts-CodeApp/`:
   ```powershell
   npm run dev
   npx @microsoft/power-apps-cli app run
   ```
   Use `npx @microsoft/power-apps-cli app run`, which Microsoft points to for Dataverse
   operations, instead of `pac code run --appUrl http://localhost:3000`.
   Open the `apps.powerapps.com/.../app/local?...` URL that it prints, **not** `localhost:3000`.
3. **Clear the tab's 501 flags.** Open the app in a **new tab**, or in the console run
   `sessionStorage.removeItem("vsb.addCostSheet.createMultiple501"); sessionStorage.removeItem("vsb.addCostSheet.updateMultiple501")`
   and reload. Otherwise a 501 seen earlier keeps that action on the row-by-row path.
4. **Open the browser's developer tools (F12).** On the Network tab, type `Multiple` in the
   filter (it matches `CreateMultiple` and `UpdateMultiple`). Keep the Console tab visible too:
   each Save writes one `Add Cost from Table save: … ms, … requests (…)` line. Leave the tools
   open for the whole test.
5. **Have a way to look at the raw rows.** Either:
   - the *CAPEX Costs* and *CAPEX Project Contracts* tables in make.powerapps.com
     (Tables → the table → Data); or
   - a Web API read in a signed-in browser tab, for example:
     `https://vsbclouddev.crm4.dynamics.com/api/data/v9.2/vsb_capexcosts?$select=vsb_year,vsb_month,vsb_cost&$filter=_vsb_contract_value eq <contract-id>`
6. **Open Edit Costs → Add Costs from Table** for the test project and category.

Record each result as Pass, Fail or Blocked, with a screenshot of the Network tab or the rows.

### B0. Are CreateMultiple and UpdateMultiple available? (read-only, 2 minutes)

On 27 Oct 2026 `UpsertMultiple` answered **HTTP 501 Not Implemented**, probably because the
`environment_<id>` entry had been removed from `power.config.json` (D51 §11.2). The Save no longer
uses `UpsertMultiple`: it relies on **`CreateMultiple`** and **`UpdateMultiple`**, and falls back to
per-row upserts for an action that answers 501. To find out whether the tables support those two
messages, open these four URLs in a browser tab signed in to VSBCloud_Dev:

```
https://vsbclouddev.crm4.dynamics.com/api/data/v9.2/sdkmessagefilters?$select=sdkmessagefilterid&$filter=sdkmessageid/name eq 'CreateMultiple' and primaryobjecttypecode eq 'vsb_capexprojectcontract'
https://vsbclouddev.crm4.dynamics.com/api/data/v9.2/sdkmessagefilters?$select=sdkmessagefilterid&$filter=sdkmessageid/name eq 'UpdateMultiple' and primaryobjecttypecode eq 'vsb_capexprojectcontract'
```

Repeat both with `vsb_capexcost`.
- **Every `value` array is non-empty:** the tables support both messages. If the app still logs a
  501, it comes from the Power Apps host route: check the host was restarted after the
  `power.config.json` change (Before you start, step 2), then re-test BS-01 on a deployed build.
- **Any `value` array is empty:** that table does not support that message, so the per-row
  fallback is the permanent path for that action on it.

When an action answers 501, the browser console shows
`CreateMultiple answered 501 Not Implemented; … continues row by row.` (or `UpdateMultiple …`),
once per action per tab session, and the Save's console line shows `per-row after 501` for it.

### B1. Core behaviour

| Id | Steps | Expected | How to verify |
|---|---|---|---|
| **BS-01** Edit existing months | Change 3 month values that already have a cost on one existing contract. Save. | Saves without error. | Network: exactly **1** `UpdateMultiple` request to `vsb_capexcosts` and 1 to `vsb_capexprojectcontracts` for the total, sent in parallel, and no `CreateMultiple`. Rows: the 3 months show the new values. Each (contract, year, month) still has **exactly one** row, with no duplicates. **This confirms how existing rows are matched.** If you see duplicates, stop and report it: the fix is a one-line change in `identify()` (`data/bulkWrites.ts`). |
| **BS-02** New contract with costs | Add a new row (new description) under a sub-account. Type costs into 4 months. Save. | One new contract with 4 cost rows. | Network: 1 `CreateMultiple` to `vsb_capexprojectcontracts`, then, once it has answered, 1 `CreateMultiple` to `vsb_capexcosts`. Rows: the contract exists with the right sub-account and project, and **Owning Business Unit** set. Its 4 cost rows point at it and also have the Owning Business Unit. Its Total Cost equals the rounded sum of the 4 months. |
| **BS-03** Clear months | Clear 2 month cells on an existing contract. Save. | Those 2 cost rows are deleted. | Network: 2 `DELETE` requests to `vsb_capexcosts`. Rows: both gone. The contract's Total Cost equals the sum of the remaining months. |
| **BS-04** Remove a contract (cascade) | Pick a contract that has cost rows **and** at least one comment. One of them should be a payment-date comment on a cost row; add one in the CAPEX screen first if needed. Remove the contract's row from the sheet. Save, and confirm the deletion dialog. | The contract, all its cost rows and all its comments are gone. | Network: **1** `DELETE` for the contract, and **no** deletes for its cost rows or comments. Rows: the contract, its cost rows and its comments (*Capex Comments* table) no longer exist. **This confirms the cascade in the live environment.** If the delete is refused, the error message names step 4. |
| **BS-05** Mixed save | In one Save: edit months on contract A, clear a month on contract B, add contract C with costs, remove contract D. | Everything lands. | Network: for contracts, 1 `CreateMultiple` (C) and 1 `UpdateMultiple` (A and B's totals) in parallel; for costs, 1 `UpdateMultiple` and/or `CreateMultiple` for A's months, started **at the same time** as the contract requests, and 1 `CreateMultiple` for C's months, started only after the contract requests answered; deletes for B's cleared month and for D, which **overlap** the writes (D's delete starts first). Nothing else. (Before the performance wave this was 2 `UpsertMultiple` requests, contracts then costs, in strict order.) Rows: A, B and C are correct, D is gone, and the totals of A, B and C each equal the sum of their months. |
| **BS-06** Totals after reload | After BS-05, reload the screen (F5). | The sheet shows the same values. | The CAPEX grid totals match the sheet. |
| **BS-07** Nothing changed | Open the sheet. Save without editing. | No error. | Network: no `CreateMultiple`, no `UpdateMultiple` and no `DELETE`. |

### Expected failure messages (verbatim)

Every message starts with the canvas text `ADDCOST_MSG.saveFailed` (shown below as **[saveFailed]**). The
rest is new text with no canvas equivalent. The source is `ADDCOST_SAVE_MSG` in
`features/cost/add-costs-from-table/rules.ts`.

| Situation | Message |
|---|---|
| A step failed and an earlier step saved; totals checked | [saveFailed] The save stopped at step *N* of 4 (*step*). The changes written before it were saved. Press Save again to finish the save without duplicating anything. |
| A step failed and nothing had been saved before it | [saveFailed] The save stopped at step *N* of 4 (*step*). |
| A step failed and the totals could not be checked | [saveFailed] The save stopped at step *N* of 4 (*step*). Contract totals may not match the saved costs: reload the screen before saving again. |
| Rows were deleted by someone else | [saveFailed] Nothing was saved: *1 contract was* / *2 cost rows were* / *1 contract and 3 cost rows were* deleted by someone else after this sheet was loaded. Reload the screen and try again. |
| Conflicting sheet: two rows write one month | [saveFailed] Nothing was saved: "*description*" under account "*account*" has more than one row for *year*. |
| Conflicting sheet: one description twice under one sub-account | [saveFailed] Nothing was saved: "*description*" under account "*account*" is listed more than once. (Or: "*description*" is listed under "*account A*" and "*account B*", which are the same sub-account.) |
| Conflicting sheet: two rows point at one saved contract | [saveFailed] Nothing was saved: "*description 1*" and "*description 2*" under account "*account*" point to the same saved cost item. |
| Any other error | [saveFailed] |

The step names are: 1 saving contracts, 2 saving costs, 3 deleting costs, 4 deleting contracts.

**A second, technical line.** Under the message above, the screen currently also shows the raw
error text (`save.error.message` in `Screen.tsx`, an open UX question in D51 §3c). Expect it, and
record what it says; it is not part of the verbatim message. Since 27 Oct it also carries
Dataverse's own refusal reason after " Dataverse: " (`rootCauseDetail`), when the error chain has
one. The failed request's response in the Network tab remains the full record. The line is cleared
when the next Save starts.

### B2. Failures and retries

These use the developer tools' **request blocking**: in the Network tab, right-click a request →
*Block request URL*, or use the *Network request blocking* panel.

The play host may route Dataverse calls through its own frame. If you can't see or block the
individual requests, mark the test **Blocked** and say so. The automated suites cover the logic.

| Id | Steps | Expected | How to verify |
|---|---|---|---|
| **BS-10** Retry after a failed cost step | Block URLs containing `vsb_capexcosts/Microsoft.Dynamics.CRM.CreateMultiple` **and** `vsb_capexcosts/Microsoft.Dynamics.CRM.UpdateMultiple`. Add a new contract with costs, plus an edit on an existing contract. Save. | Error message: "The save stopped at step 2 of 4 (saving costs). The changes written before it were saved. Press Save again to finish the save without duplicating anything." | Rows: the new contract exists (step 1 landed) with **no** cost rows. Each touched contract's Total Cost equals the sum of its stored cost rows, because it was reconciled. That is 0 for the new contract, and for the edited one the sum of its rows as they were before this save. |
| **BS-11** Retry completes without duplicates | Unblock the URL. **Without reloading**, press Save again. | Saves without error. | Rows: **one** new contract, not two, with its cost rows exactly once each. The total is correct. |
| **BS-12** Refused delete | Block `DELETE` requests to `vsb_capexcosts`. Clear one month. Save. | The message names **step 3 of 4**. | After unblocking and saving again: the row is deleted and the total is correct. |
| **BS-13** Row deleted by someone else | Open the sheet in tab 1. In tab 2, or in the canvas app, delete one of the contracts the sheet shows. In tab 1, edit that contract's months and Save. | The message says **nothing was saved**, because rows were deleted by someone else after the sheet was loaded, and asks you to reload. It counts the contract, plus any of its cost rows that the edit touched (the cascade deleted them too), e.g. "1 contract and 3 cost rows were deleted …". | Rows: no contract was re-created (look for a contract with no project or sub-account), and no other change from tab 1 landed. |
| **BS-14** Conflicting sheet | Make two rows with the same account, description and year. | The sheet's own validation catches this first: Save is disabled and the canvas message ":- There cannot be two contracts with the same name under the same sub-account." is shown. The planner's "Nothing was saved: …" conflict message is a second safety net, and it can't be reached from the grid; UT-ACSAVE-027…029 cover it. **Known gap (CA-12, open):** two NEW rows added under one sub-account share a Row_ID, and the code app's check does not catch them, where the canvas does. Expect Save to stay enabled. If both rows have a value in the same month, the planner refuses with "… has more than one row for *year*". If their months differ, the save goes through and both rows land on one new contract. Record which you see. | Rows: unchanged (or, in the CA-12 case, record what landed). |
| **BS-15** No reload behind a failed save | Repeat BS-10. Then switch to another browser tab for at least 1 minute (also try toggling the network off and on). Come back. | The sheet still shows your edits, and BS-11 then completes without duplicates. | The grid is not re-hydrated. The fix is `useAddCostSheet`: no refetch on focus or reconnect (UT-ACSHEET-QUERY-001). |

### B3. Rollback

| Id | Steps | Expected |
|---|---|---|
| **BS-20** Old path still works | Set `BULK_SAVE = false` in `src/data/addCostSheet.ts`, let the dev server reload, and repeat BS-01 and BS-04. | Same final rows as before. The Network tab shows one request per changed cell instead of `CreateMultiple` / `UpdateMultiple`. Set the flag back to `true` afterwards. |

### B4. Speed

| Id | Steps | Expected | How to verify |
|---|---|---|---|
| **BS-30** One Save, about 40 changed cells | With the 501 flags cleared (Before you start, step 3), change about 40 month cells across a few contracts, ideally including one new contract and one cleared cell. Save once. | Save completes in **under 3 s** (target). | Copy **both** console lines into the result. First `Add Cost from Table prepare: <ms> ms (round-trip check …, align …, diff …, deletions …, orphans …; last edit's grid read-back …, validation …; <n> rows)`, the client side. Then `Add Cost from Table save: <ms> ms, <n> requests (…); gate peak <p>/16, req avg <a> ms max <m> ms, verify ran/skipped, <g> already gone`, with the per-step entries. Record the **gate peak**, the request average and maximum, and whether the verify says `skipped` (it should, on a first Save in a fresh tab). Record whether each upsert group says `bulk` or `per-row after 501`. Before the performance wave the same kind of save took 4,102 ms for 40 requests and 9,522 ms for 70 (D51 §11.1). Expected now, if both bulk actions work: about 1.0–1.3 s for 40 requests and about 2–2.5 s for 70; the per-row deletes bound the time (D51 §11.12, inferred, not measured). |
| **BS-31** An unedited Save writes no contract | Open the sheet in a fresh tab and wait for it to load. Change nothing. Save. Save navigates back to the CAPEX screen; open Add Costs from Table again, change one month on one existing contract, and Save. | First Save: **zero** contract writes. Second Save: one cost write and at most one contract write, for that contract's total only. | Network and the save's console line. First Save: no `CreateMultiple`, no `UpdateMultiple` and no `DELETE` for `vsb_capexprojectcontracts`. This checks two fixes: `diffRows` now reports only edited rows (CA-11), and an existing contract whose columns are unchanged and whose stored Total Cost already equals the new total makes **no request** at all (D51 §11.12). Second Save: the contract update appears only if its total changed. |

**For the record, not pass/fail:**

On the largest sheet you have, with one or two hundred changed cells, time the Save with
`BULK_SAVE = true` and with `false`. Record the request count from the Network tab and the
wall-clock time of each.

---

## After testing

- Record the results, with the date, the tester and the commit or working-tree state, in D51.
- Anything that failed goes into `01-BUGS-FOUND.md` as a new CA entry.
- Then the product owner answers the D51 questions.
- Commit, merge and DEV push each need their own explicit approval, following the CONVENTIONS
  "Before pushing to DEV" checklist.
