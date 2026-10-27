# Known risks and open decisions — `ProjectCosts-CodeApp/`

Distilled from `ProjectDocs/app-docs/01-BUGS-FOUND.md`, `02-OPEN-DECISIONS.md`, and
`codeapp-knowledge-base/17-gaps-risks-and-doc-drift.md`. Read before touching the Cost
module's save/delete paths, or before assuming a canvas behaviour you're about to "fix" hasn't
already been through a sign-off decision. Keep this file in sync as decisions resolve — a
decision that's been settled should move out of "open" and into
`ProjectDocs/app-docs/02-OPEN-DECISIONS.md`'s own resolved record, not just be deleted
from here.

## High-severity, live today

- **Canvas-parity bulk deletion is switched ON.** Add Cost from Table deletes a contract's
  *entire cost history* when it's removed from the sheet (`CANVAS_PARITY_DELETION = true`).
  This reproduces a canvas defect (A-1: the canvas's own guard against deleting contracts with
  historical costs is commented out) — it is the client's explicit, confirmed choice, not an
  oversight. A safety net (`identityRoundTripFailures`) was added after a real incident: a
  single save on project Wirmighausen silently removed ~168 CAPEX cost rows nobody had
  touched. Do not "clean up" this flag without re-confirming with whoever owns this decision.
- **Several delete paths discard the SDK's failure result silently.** The generated service's
  `delete()` method discards the `IOperationResult`, and the SDK never throws on failure — so
  a Dataverse refusal (403, a cascade restriction) looks exactly like success unless the call
  goes through `data/client.ts`'s `deleteRecord` (which checks the result) rather than calling
  the generated service directly. Only Delete Project is confirmed to use the safe pattern
  everywhere; audit other delete call sites before trusting them.
- **No Dataverse changeset / transactional batch exists on the SDK.** Every multi-request save
  (Contracts' linked writes, CAPEX standard-contract instantiation, Add Cost from Table's
  phased save, Land Lease's header+periods+allocations, OPEX's standard chain) can half-apply
  if a later request in the sequence fails. Where all-or-nothing genuinely matters, the
  documented answer is a Dataverse custom API, not a client-side retry.
  - *Add Cost from Table, 27 Oct 2026 (D51, proposed):* the bulk save uses native
    `CreateMultiple` (new rows) and `UpdateMultiple` (existing rows), sent in parallel
    (`UpsertMultiple` until the D51 §11 performance wave). Each chunk of up to 500 rows is
    all-or-nothing, but the save as a whole is still not, and its operations now run
    concurrently rather than as four strict phases. After a partial failure the orchestrator
    waits for every operation to settle, re-reads the touched contracts and rewrites any total
    that may be wrong (an existing contract whose own row did not land is always rewritten),
    then throws `SavePlanError` (`reconciled: true/false`, `failures` listing every failed
    operation). New rows keep their ids across a retry (D51 §3a), so pressing Save again does
    not duplicate them. One gap: a new contract created by a failed attempt, then removed from
    the sheet before the retry, is left behind as an orphan.

## Open decisions needing sign-off

From `ProjectDocs/app-docs/02-OPEN-DECISIONS.md` (check that file for the current state —
this is a snapshot, not a live sync):

- **D1** — how command greying/permission-checking should work with no SDK `DataSourceInfo`/
  `RecordInfo` equivalent: a role matrix, a Dataverse Custom API, or "server refuses, a 403
  becomes a message" (the current provisional choice).
- **D2** — the BoP margin source: Fabric SQL or Dataverse. **Contradictory record**:
  `02-OPEN-DECISIONS.md` says provisionally Dataverse; `06-DEMO-COMPLETION-PLAN.md` later
  states it's answered as Fabric SQL. Resolve which doc is current before building anything
  that depends on this.
- **D3** — the Margin="No" calculation (canvas bug C-6: still adds a fixed margin, and a bad
  percentage wipes the total to blank). Decided fixed in the rebuild, with the canvas kept as a
  `…CanvasParity` twin under test — needs final sign-off.
- **D6** — same shape as D1's third option: Contract save is non-transactional (3 separate
  requests); needs a decision on whether a Custom API is worth building for it.
- **D7** — payment date stored as free text (`nvarchar`, regex-parsed), not a real Dataverse
  date column. Flagged as a schema decision someone needs to own, not fixed in the app layer.
- **D12** — whether the Cost app should expose "Delete Project" at all; it's currently visible
  but permanently disabled. Depends on D1.
- **D41–D45, Project Overview pagination.** Built, deployed to DEV (`fceb336`, D46) and confirmed
  locally by the user, but **not product-approved**. Before touching `data/projects.ts` or
  `countedPage` in `data/client.ts`, keep these invariants:
  - the page size travels as `maxPageSize`, never `$top`;
  - pages are one continuous run (`named ++ blank`);
  - the count is `RoundUp(TotalRows / 200)`, as in the canvas;
  - Next follows the skip token.

  The suite pins each of them (UT-PROJPAGE-*, UT-PAGE-*).
- **D45 G2, inactive projects.** The canvas Project Overview lists inactive projects, because
  `Filter(Projects, …)` has no state condition. This app filters `statecode eq 0`, so its Total
  Rows can be lower than the canvas. This is a product question; there is no marker yet.
- **D13** — two hard-coded address lists (`REPORT_VIEWERS`-equivalent allow-lists) should both
  become environment variables before go-live; only one currently is.
- **D51, Add Cost from Table bulk save** (27 Oct 2026). Uncommitted and **not product-approved**.
  Save keeps four numbered operations (contract writes, cost writes, per-record cost deletes,
  contract deletes), but since the performance wave (D51 §11) they run concurrently: the deletes
  and phase 0's existence reads at t = 0, then contracts and the costs of existing contracts
  (at t = 0 as well when the verify is skipped, §11.12), and the costs of new contracts as soon as
  the contract step succeeds. Writes go out as `CreateMultiple` / `UpdateMultiple` in parallel (no longer
  `UpsertMultiple`); a 501 on an action's first chunk falls back to per-row PATCH for that
  action, remembered per tab in `sessionStorage`. A deleted contract's costs and comments go by
  the Dataverse cascade. The rollback is `BULK_SAVE = false` in `data/addCostSheet.ts`; treat it
  like `CANVAS_PARITY_DELETION`, a live product decision. It lifts D36 §1 (no bulk services) for
  this screen only. `verify` and an adversarial review ran after the second fix wave (D51
  status); no `verify` result is recorded for the performance wave yet. Measured before it: 9.5 s
  for 70 requests, 4.1 s for 40 (D51 §11.1); the new path is not yet measured live.
  `power.config.json` must keep its `environment_<id>` entry (the probable cause of the 501,
  CONVENTIONS rule 9). Still owed: the live DEV test
  (`ProjectDocs/app-docs/13-ADDCOST-BULK-SAVE-TEST-PLAN.md`), which must confirm the
  `identify()` form and the cascade. Open UX question: the screen still shows the raw
  technical error under the mapped failure message (D51 §3c).
  New risks from the concurrent order (D51 §11.8):
  - **Lock contention** between parallel contract updates and cost writes on the same
    contracts. No plugin or flow exists on these tables today; one added later could deadlock
    or serialise the save.
  - **Throttling** from contract-delete cascades running in parallel with the other writes
    (service protection, HTTP 429).
  - **Failure details vary with timing.** Whether the new contracts' costs run, and so which
    operations appear in `SavePlanError.failures`, depends on whether a failure arrived before
    the contract step succeeded.

  Round-trip and prepare pass (D51 §11.12, uncommitted, no `verify` result recorded): contract and
  cost deletes now start at t = 0 beside the verify, and a delete answering 404 counts as already
  gone. A first attempt with no per-row 501 flag skips the upsert verify, so the upserts start at
  t = 0 too. The Save's client prepare is now `prepareSheetSave`, without the quadratic scans.
  `diffRows` pairs rows by identity (CA-11), so an unedited Save sends no contract write. An
  unchanged contract whose stored `vsb_totalcost` already matches gets no write at all. Expected,
  not yet measured live: about 1.0–1.3 s for 40 requests and 2–2.5 s for 70; per-row deletes now
  bound the critical path. Open: CA-12, two new same-named rows under one sub-account in one year
  pass validation, where the canvas refuses them. New risks:
  - **Lock and 429 pressure.** Deletes at t = 0 overlap the upserts, cascades included. The shared
    gate of 16 caps the requests in flight.
  - **404 as success relies on the entity set being right.** A delete sent to the wrong entity
    set would answer 404 for every id and be counted as "already gone", not as a failure.
  - **Error classes vary with timing.** A row deleted by someone else ends as `RowsGoneError` when
    the verify ran (a retry), and as a `SavePlanError` when it was skipped (a first attempt). A
    skipped, unchanged contract deleted mid-save ends as a reconcile error, not as "gone".

## Lower-severity, worth knowing

- **R-9** — URLs read from a project row (SharePoint/Teams links) are opened without scheme
  validation before `window.open`.
- **R-10** — row/volume ceilings are untested at scale: `fetchAll` caps at 50 pages × 500 rows,
  `@odata.count` is capped at 5000 by the platform itself, there are no server-side aggregates.
  Fine today; revisit if a project's row counts grow materially.
- **R-11** — live performance is unmeasured; the Fluent UI chunk alone is ~570 kB gzipped, and
  some OPEX save paths do several sequential lookups rather than one batched read.
- **R-12** — no optimistic-concurrency check between two people or two tabs editing the same
  record; a save panel is a stale snapshot from when it opened. **Upsert resurrection** (D51): if
  another user deleted a contract or a cost row after the Add Cost from Table sheet loaded, the
  bulk save upserted its id and re-created it, without the owning BU and without its parent binds.
  **Mitigated** (D51 §3b): a pre-write existence check refuses the save with nothing written.
  Residual: a row deleted between that check and the write can still be re-created (only
  `If-Match` would close it), and inactive rows count as existing.
- **R-16** — several canvas defects are intentionally reproduced rather than fixed (see
  `ProjectDocs/app-docs/01-BUGS-FOUND.md` for the full register, including the OPEX and Land Lease defect
  lists — roughly a dozen items each). These need client sign-off before anyone "fixes" them,
  per the standing divergence rule.

## Skeleton-lineage bugs (relevant only if porting code from `ProjectDocs/skeleton-reference/`, the archive of the removed skeleton)

- **S-2** — 12 of 20 Cost tables were never correctly registered in the skeleton's
  `dataSources.ts` (wrong entity-set names; 3 disagree outright). Resolves itself in that repo
  via `pac code add-data-source`, but don't copy its entity-set spellings into this app without
  re-verifying against `ProjectDocs/reference/dataverse-entities.json`.
- **S-3** — 22 entity sets in the skeleton had primary keys wrongly derived by naive string-
  stripping (`...s` → `...id`). Same caveat: re-verify, don't copy.

## This app's own bug register

Add newly discovered bugs to `ProjectDocs/app-docs/01-BUGS-FOUND.md`, not here — this
file is for risks and decisions that affect *how you should approach new work*, not a running
defect log. Cross-reference, don't duplicate.
