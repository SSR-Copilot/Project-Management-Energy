# 19 - Transaction Management Strategy

> Stage 2 (design and planning only), 25 Nov 2026. Inputs: doc 08 (8 findings; every multi-operation save is classified there). Tasks: T-01, T-02, T-03, T-05, T-07, T-08, T-09, T-04.

## 1. The fact that decides everything

**No save in this app is transactional across requests.** The SDK cannot send a change set; each request commits alone. A bulk action is atomic per call only. So the design question is never 'make it a transaction' but 'in what order, with what guards, so that every partial state is one the user can recover from, and a retry cannot make it worse'.

The only atomic options left, both outside this workstream's constraints (no schema or server change): a Dataverse custom API for a multi-table save (the standing answer in `KNOWN-RISKS-AND-DECISIONS.md`, D6), and a server cascade delete (DEC-A, which already exists in the solution for the Land Lease header). They are listed for the owner and not planned.

## 2. Dependency classes (used in doc 08 for every save)

| Class | Meaning | Execution rule |
|---|---|---|
| Independent | no id or value from the other | together, inside the gate |
| Sequentially dependent | needs an id or value from the previous | one after the other; the dependent step starts only after the parent's success |
| Transactionally dependent | must all land or none | cannot be guaranteed; use ordering + reconcile + stable ids, or a server-side option |
| Conditionally dependent | depends on the outcome or data | decide at run time; a failure of the condition's read fails the save, never 'assume empty' |
| Needs compensation | a later failure leaves an earlier write wrong | a reconcile step or a clear 'what to do' message |

## 3. The six rules

| # | Rule | Gap it closes |
|---|---|---|
| X1 | **Parents before children; deletes children before parents** unless the server cascades (OPEX parent link is `RemoveLink`, so children first). | existing; kept |
| X2 | **Guard every update of a row another user could have deleted** (`updateRecordIfExists`, or one existence read per table per plan). A PATCH without `If-Match` is an upsert. | CB-01, PB-14 |
| X3 | **Creates carry a client id that survives a user retry**; 'already exists' is confirmed by a read, not trusted. | WE-04, CB-14, CA-07 |
| X4 | **Refresh on every outcome.** A save that fails half-way still invalidates what it may have changed, so the next click works from the server's state. | CB-02, AD-11 |
| X5 | **A write whose outcome is unknown is shown as unknown** (doc 21): no guess, no blind retry of a create, no restart of a flow. | PB-01, CA-02 |
| X6 | **Settle, then reconcile.** After any failure wait for every in-flight request to finish, re-read the touched parents and rewrite derived totals (Add Cost does this; the other bulk paths adopt it). | doc 17 section 4 |

## 4. Save-by-save plan (what changes)

| Save | Class today | Change | Task |
|---|---|---|---|
| Land Lease save / delete / import | sequentially dependent tiers, no guard, cache refreshed on success only | guard (X2), refresh in `finally` (X4), server duplicate check on import; header-only delete held for DEC-A | T-01, T-02, DEC-A |
| OPEX save / import | same | same; re-chain steps guarded | T-01, T-02 |
| Contracts save (D6) | 3 requests, non-transactional | unchanged shape; stable ids for creates | T-09 |
| CAPEX panel Add/Edit/Delete | no compensation after a partial failure (CA-07) | stable id, reconcile | T-09 |
| Add Cost from Table | settle-then-reconcile exists | tab-close hold for deferred deletes | T-06 |
| CAPEX clean-up (background) | fail-fast, un-retried | retry + continue + report; rerun safe | T-04 |
| Generators type add / delete / replace | rollback on create failure exists; deletes tiered | bulk path with `createRollback` incl. turbines | T-41 |
| Finance tranche | tranche + schedule rows, then roll-up | register the backend before `bulkSchedules` is ever on | T-05 |
| Cluster Check List flow steps | pre-flow patch, flow, follow-up | re-read after a failed call, restore state, show 'unknown' | T-08 |
| Planning first open | creates rows inside query functions | explicit once-guarded step | T-07 |
| General Data edit | tracking rebuild + shareholders sequential | together; after a DEV order check | T-42 |

## 5. Duplicate-submission guard (all saves)

A double click or a second tab must not start a second save of the same plan. Where a screen already blocks the button during a save (the shared `usePlanWrite` busy state), the audits found no gap; the gaps are retries after an ambiguous failure (X3) and a second tab (the cross-screen Cost lock, CA-15, protects Cost only). Stage 3 adds a test per create path that presses Save twice with the first response delayed.

## 6. Validation approach

Every task that touches a save carries four tests: success unchanged (differential against the old path as oracle, the D51 pattern); each step failing in turn leaves a recoverable state; a retry after an ambiguous failure creates no duplicate; the console shows the `[VSB]` lines for every write (CONVENTIONS rule 23). Then a DEV forced-failure run before the task is called done.
