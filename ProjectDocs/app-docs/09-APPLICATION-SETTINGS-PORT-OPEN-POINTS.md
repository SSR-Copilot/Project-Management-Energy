# Application Settings port: open points (22 Oct 2026)

Read this before changing anything under `src/features/admin/`. Re-check the code before you trust any line here.

## Progress (22 Oct 2026, later) — not committed

- **§1 done:** recorded as `02-OPEN-DECISIONS.md` **D36** (§1–§5), with pointers from D14, D18–D24 and D20. The behaviours that differ from the canvas still need the product owner's keep / revert.
- **§2 done for the six screens:** canvas-named ids 3 → 177, all verified by the gate. Verbatim citations and `DIVERGENCE` / `SOURCE DEFECT` markers restored. Results, the contradictions with D19 / D22 / D24 and the remaining id gaps (shared-component props) are in D36 §6.
- **§3 partly done:** `PROJECT-MAP.md`, `CONVENTIONS.md`, `TESTING-AND-HARNESS.md`, `APP-README.md`, `AGENT-GUIDE.md` updated; `03-STATUS.md` / `05-SCREEN-TRACKER.md` marked historical. The rest of the "about 22 docs" list needs the porting developer's alignment audit.
- **§4:** `ReorderList` unexported from `@/components` (the files `components/ReorderList.tsx` and `components/reorder.ts` are still on disk, awaiting deletion). The three test-only checklist-approval repository methods were removed. The admin-folder comments were read through. Hard-coded colours are listed in D36 §6. The `messages.ts` imports are not changed.

## What landed

Commit `864056b` on `master`, fast-forward from `9eb9e4d`. It replaces the six `/admin` screens with the versions developed on branch `RounakDev1`. The routes, left navigation, shell and header are unchanged.

| Route | Folder |
|---|---|
| `/admin/default-checklists` | `src/features/admin/admin-default-checklists/` |
| `/admin/gates-approvals` | `src/features/admin/admin-gates-approvals/` |
| `/admin/capex-accounts` | `src/features/admin/admin-capex-accounts/` |
| `/admin/milestones` | `src/features/admin/admin-milestones/` |
| `/admin/cost` | `src/features/admin/admin-cost/` |
| `/admin/contract` | `src/features/admin/admin-contract/` |

At commit time: `npm run verify` green (145 files, 3,859 tests, labels 0 missing, canvas C1 to C5 0, build OK). A manual smoke test of all six screens against VSBCloud_Dev passed in a local run. **No pull-request review took place before the push.**

Rollback: `git revert 864056b` reverses the whole change in one commit.

## 1. Decisions to record in `02-OPEN-DECISIONS.md` (D36 onwards)

None of these is written yet.

- **Replacement, not graft.** The six admin screens had already been redeveloped and connected on `master` (D18 to D24). The owner chose to replace them with the RounakDev1 screens instead of grafting improvements into them. D14, D18 to D24 and the admin parts of `CONVENTIONS.md` need updating to match.
- **No bulk Dataverse services.** `CreateMultiple`, `UpdateMultiple` and `UpsertMultiple` are deliberately absent. Every bulk path in the ported code is a per-row write (`src/data/adminRowWrites.ts`).
- **Component merge.** `FormPanel`, the field components and `PanelButtons` gained optional props for the settings screens; defaults reproduce the previous behaviour and are pinned by tests (`UT-FORMPANEL-*`, `UT-PANELBTN-*`, `UT-SETFIELDS-*`). Kept separate on purpose: `ReorderPanel` (different contract from `ReorderList`), the gates `PeoplePickerField` (owns the Entra search), and `useNotify`/`AppToaster` (toasts, not inline `WriteFeedback`).
- **Write-path exception (CONVENTIONS rule 17).** `executePlan` has an opt-in `guarded` update step: a PATCH to a row deleted meanwhile reports "record deleted" instead of recreating it. 14 single-request admin writes run as `WritePlan`s through `src/data/runPlan.ts`, each with a wire-equivalence test (`writes.test.ts` in the CAPEX accounts, default checklists, gates and cost folders; Milestones and Contracts moved no writes). These flows stay in the data layer and need the documented exception:
  - CAPEX: create, reorder, delete, deactivate account and subaccount (cascade and forecast clean-up)
  - Checklists: create-then-set-status, soft delete with renumber, reorder
  - Milestones: save
  - Contracts: save (ownership re-check, partial-save retry), delete
  - Costs: OPEX period save, OPEX contract delete, period delete with last-period flag repair
- **Behaviours that differ from the canvas.** Each needs a product decision (keep, or revert to canvas):
  - Panels stay open on a failed save (Checklists, Gates, Contracts); the canvas closes them first.
  - Gates: Reset Gate asks for confirmation; inactive and "To Delete" tasks are hidden; people search needs 2 characters; status toggles are optimistic.
  - CAPEX: paid costs are skipped on deactivate; Activate only when the parent is active; subaccount reorder needs 2 or more rows.
  - Milestones: only active countries are shown; durations have a column maximum; blanks show a "0" placeholder; duplicate-row warning.
  - Checklists: default tab is the left-most by order, not the first by name; the whole cluster header toggles, not only the chevron.

## 2. Canvas traceability (largest open job)

The port dropped most of master's canvas traceability on the admin screens:

| Item | Before the port | After |
|---|---|---|
| Canvas-named `data-testid` sites | 108 | about 3 |
| AccessibleLabels compared by the canvas gate | 4 | 0 |
| "verbatim" source citations on messages | about 92 | 4 |
| `DIVERGENCE` / `SOURCE DEFECT` markers | about 35 | near 0 |

`check-canvas-identities` stays green only because it exempts derived (kebab-case) ids, so this gap is **not flagged automatically**. Restore it screen by screen from the canvas YAML under `ProjectDocs/_extracted/`.

## 3. Docs that are now stale

- `PROJECT-MAP.md`, `CONVENTIONS.md`, `APP-README.md`: describe the old admin screens; some still say they are not connected to Dataverse.
- `03-STATUS.md`, `05-SCREEN-TRACKER.md`, `gap-analysis/README.md`: admin screen status, file lists and test counts.
- About 22 docs in total reference replaced admin code. A per-file list is in the alignment audit (kept outside this repo by the porting developer; ask for it).

## 4. Code cleanup

- `src/components/ReorderList.tsx` has no callers now. Delete or adopt.
- The repository methods `createChecklistApproval`, `updateChecklistApproval` and `deleteChecklistApproval` in `src/data/adminChecklistTables.ts` are called only by that module's own tests (the Gates writes moved onto `WritePlan`).
- About 340 comments were reworded by script during the port. Nobody has read them through.
- Some colours in the admin screens are still hard-coded because no matching token exists in `src/theme/` (listed per screen in the porting notes).
- `src/features/admin/*/messages.ts` still import error classes from the data layer (they are not `rules.ts`, so the layering rule is met, but it is untidy).

## 5. Known behaviour notes and risks

- **Admin gate cannot be tested in a local run.** `npm run dev` shows admin screens to everyone (the deliberate local-run bypass in `app/adminAccess.ts`). The non-admin read-only behaviour only shows in a deployed build. CAPEX keeps its command buttons enabled for non-admins and refuses on save (baseline behaviour); the Costs "Add Contract Type" menu button stays enabled while its items are disabled.
- **`UT-ADGATE-910`** waits for a dialog with `findByRole` because the dialog is briefly `aria-hidden` under load. Not proven to be pre-existing flakiness.
- **`PanelButtons` with `look="brand"`** now defaults its test ids to `panel-save` / `panel-cancel` (previously absent when unset).
- **Removed tests:** `UT-UNSAVED-007` and `008`, together with the dead navigation-guard code they covered.
- **`resolveRefs` in `executePlan.ts`** rewrites any string in a step's `data` that contains `@created#n`, including free text. Pre-existing; documented in a comment, not fixed.
- **`writeErrorMessage`** does not detect a 403 wrapped inside a `PlanError`. Admin screens are unaffected because `runPlan` rethrows the cause.
- **Deleting via the DevCo / checklist-approval path:** a thrown SDK error is no longer wrapped in `DataError` (a refused delete behaves as before).
- **Project Management** imports `Persona` and `entraSearchFilter` from `src/data/adminGatesApprovals.ts` (two import lines changed; behaviour unchanged).

## 6. Deployment

- The Dev app (`807a2fba-665c-40f3-b158-ffe822aa7da4`, "Project App") is owned by Shakti Singh Rajput and shared by every branch that deploys. Any push overwrites the others. Agree who deploys.
- The published Dev app had 47 data sources when last checked; the code now registers 81.
- Pushing with a service-account pac profile is untested; it may be refused if the account is not a co-owner.

## 7. Developer setup reminders

- `.power/` is git-ignored. On a fresh clone, re-add all 81 tables in `power.config.json` with `pac code add-data-source -a dataverse -t <logicalName>`, **one at a time**, checking `dataSourcesInfo.ts` after each (the command can drop earlier entries). `npm run check:power` must report 81 registered and 0 problems.
- pac's identity only affects CLI steps. The app's runtime user and admin access come from the account signed in to the player.

## 8. Not ported from RounakDev1 (candidates for later)

- Add Cost from Table save optimisation (in-flight limiter, wider delete pool, post-save cache removal). Its bulk-write parts are excluded by the no-bulk decision; the rest could be ported.
- Central fix for `$top` being ignored when the page-size header is sent (`fetchAll`/`fetchPage` in `src/data/client.ts`; affects about 40 call sites).
- Guarded updates on the cost screens (CAPEX, OPEX, Land Lease writes).
- Contracts locale-number and seed fixes; Land Lease unmapped-period refusal (needs product sign-off); approval colour keyed on the option value.
- Contract delete relying on the Dataverse cascade (contract to costs and comments is Cascade in VSBCloud_Dev) instead of deleting children one by one.
- `@microsoft/power-apps` 1.3.1 to 1.5.0 as a package bump only (adds `If-Match: *` to every PATCH).

## 9. Repository gaps noticed

No root README, no Node version pin (`.nvmrc` or `engines`), no CI running `npm run verify`, no CODEOWNERS or PR template, no release tags on the remote.
