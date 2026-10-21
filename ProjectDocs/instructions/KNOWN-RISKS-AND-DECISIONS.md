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
- **D13** — two hard-coded address lists (`REPORT_VIEWERS`-equivalent allow-lists) should both
  become environment variables before go-live; only one currently is.

## Lower-severity, worth knowing

- **R-9** — URLs read from a project row (SharePoint/Teams links) are opened without scheme
  validation before `window.open`.
- **R-10** — row/volume ceilings are untested at scale: `fetchAll` caps at 50 pages × 500 rows,
  `@odata.count` is capped at 5000 by the platform itself, there are no server-side aggregates.
  Fine today; revisit if a project's row counts grow materially.
- **R-11** — live performance is unmeasured; the Fluent UI chunk alone is ~570 kB gzipped, and
  some OPEX save paths do several sequential lookups rather than one batched read.
- **R-12** — no optimistic-concurrency check between two people or two tabs editing the same
  record; a save panel is a stale snapshot from when it opened.
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
