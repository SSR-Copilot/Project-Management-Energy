# Session handoff — 27 Oct 2026: Add Cost from Table bulk Save, DEV push of `2c7e6aa`

Start a new chat by reading this file. Then read `02-OPEN-DECISIONS.md` **D51** (§10, the
product-owner questions, and §11–§11.16, the performance wave) and **D52** (the DEV push), and
bugs **CA-9–CA-12** in `01-BUGS-FOUND.md`. Re-check the code before you trust any line here.
The previous handoff, `12-SESSION-HANDOFF-2026-10-26.md`, still holds the open items from 26 Oct.

## State at hand-off (27 Oct 2026)

| | |
|---|---|
| `master` (local and GitHub) | `2c7e6aa`. |
| `RounakDev1` (local and GitHub) | `2c7e6aa`, identical to `master` and to both `origin/*` branches (0 ahead, 0 behind). |
| Working tree | `02-OPEN-DECISIONS.md` (D52) and the doc updates of this handoff are uncommitted. `ProjectDocs/Capex Cost Screen/` exists locally only: it is excluded through `.git/info/exclude` and must not be committed (see "Lessons"). |
| Deployed to VSBCloud_Dev | App `807a2fba-665c-40f3-b158-ffe822aa7da4`, built from **`2c7e6aa`** on 27 Oct, profile `ServiceAccount_DEV`. The push was accepted (D52), with the agent's local smoke test waived. This supersedes `fceb336` (D46) and also ships the four 26 Oct master commits that were not deployed then (`717ced9`, `1b019ad`, `1ae9a14`, `a94ec68`). |
| Last `npm run verify` | 27 Oct on `2c7e6aa`, run twice: 157 files and 4,293 tests, all passing; build OK. `check:power`: 84 registered, 0 problems. knip lists 12 unused files, as expected (8 pre-existing, plus `UpsertMultipleService` and the three generated `*MultipleModel` stubs). |
| Dev servers | Stopped for `npm ci` before the DEV push. The user restarts them (see "Owed by the user"). |
| Since the DEV push (uncommitted) | The review leftovers (D51 §11.17), review E6's three findings (§11.18), and the UT-ADGATE-915 test race fix. A full run covered 157 files and 4,304 tests, all green; the 13 worker-start failures were re-run on their own. Build OK. Not on DEV. |

## Commits this session

| Commit | Author | What |
|---|---|---|
| `5d50e2b` | Rounak | Add Cost from Table bulk Save (`CreateMultiple` / `UpdateMultiple`), bugs CA-9–CA-12, D51, the test plan `13-ADDCOST-BULK-SAVE-TEST-PLAN.md`, and doc updates. It also committed `ProjectDocs/Capex Cost Screen/` by mistake. |
| `2c7e6aa` | Rounak | Removes `ProjectDocs/Capex Cost Screen/` from the branch. The files stay in the local working copy only. They remain in `5d50e2b`'s history. |

Both were fast-forwarded into `master` and pushed to GitHub. `2c7e6aa` was pushed to DEV (D52).

## What the bulk Save changed (all PROPOSED, not product-approved)

Code: `data/addCostSheet.ts`, `data/addCostSheetBulk.ts` (`executeSavePlan`), `data/bulkWrites.ts`,
`data/concurrency.ts`, `features/cost/add-costs-from-table/savePlan.ts`, `rules.ts`,
`spreadsheet/adapter.ts`, `Screen.tsx`, `features/cost/costing/useCostBook.ts`, and
`scripts/check-power-sources.mjs`.

- **Transport.** `CreateMultiple` for new rows and `UpdateMultiple` for existing rows, in parallel
  chunks (up to 4). A 501 falls back to per-row writes, remembered per action and per tab.
- **The 501 root cause.** `pa app add dataverse-api` adds an `environment_*` entry to
  `power.config.json`. Removing it caused the 501. The entry is kept, and `check:power` accepts it.
- **First attempts** skip the existence check. **Retries** keep stable ids, refresh the data before
  planning, and reconcile contract totals after a partial failure.
- **Deferred deletes.** Contract and cost deletes start after the writes settle, each in its own
  gate of 4 (writes share a gate of 16). On a fully successful write they finish in the
  background; a failure raises a toast and, for cost deletes, a background totals reconcile. This
  is a `DIVERGENCE` (D51 §11.14–§11.16).
- **Switches** in `data/addCostSheet.ts`: `BULK_SAVE`, `DEFER_CONTRACT_DELETES`,
  `DEFER_COST_DELETES`. Each `false` restores the earlier behaviour.
- **Bugs fixed:** CA-9 (stale contract totals), CA-10 (unchecked deletes, rule 14), CA-11
  (`diffRows` marking almost every row as changed), CA-12 (the duplicate-contract rule now ports the
  canvas `CostCountRows`).

### Live DEV timings of the Save (D51 §11–§11.16, D52)

| Run | Time | Requests | Note |
|---|---|---|---|
| Baseline | 9.5 s | 70 | Per-row writes, phases one after another. |
| Bulk | 5.2 s | 3 | `CreateMultiple` accepted; the contract-delete cascade took 5.2 s. |
| — | 7.3 s | 23 | Cost deletes took every slot of the shared gate (§11.15). |
| — | 13.4 s | 8 | Deferred deletes still started at t = 0, alongside the writes: lock contention (§11.16). |
| Deferred deletes start after the writes (§11.16) | 1.9 s | 5 | — |
| — | 1.6 s | 3 | — |

The floor is about 1.2–1.9 s per bulk request through the Power Apps host. A 10× or 20× gain is
only possible with a fully background save (the screen returns at once, the result arrives as a
notification). That is not built; it is a product decision.

## Open, in priority order

1. **D51 approval** by the product owner (§10): the bulk Save, the two deferral switches, and the
   `DIVERGENCE`s. The deployed DEV build already shows this unapproved behaviour.
2. **CA-12, the duplicate-contract rule** (D51 §10 item 11): keep the canvas `CostCountRows` port,
   or go back to the earlier check as a recorded divergence.
3. **The resurrection window** after a background delete (D51 §11.14, E5 finding 5): saving the
   contract from the CAPEX Edit Cost panel within those seconds re-creates it. Options: delay the
   CAPEX invalidation, or filter out ids pending deletion. A product decision.
4. **Remove the unused `UpsertMultiple` artifacts or not** (D51 §11.3). The user's call. The
   `environment_*` entry in `power.config.json` must stay either way.
5. **Commit the §11.17–§11.18 fixes** to `RounakDev1`. They are done and verified. Merging to
   `master` and a DEV push each need separate approval.
6. **Still open from 26 Oct** (`12-SESSION-HANDOFF-2026-10-26.md`, "Open"): product approval of
   D38–D45, D45 G2 (inactive projects), the pager edge cases, and the D47–D49 doc/code
   disagreements.

## Owed by the user

- **The DEV smoke test of `2c7e6aa`** (D52 step 7): an Add Cost from Table Save, plus the other
  Cost, PM and Admin screens. Read the `save …` and `background deletes …` console lines.
- **Restart the local dev servers**, which the agent stopped for `npm ci`. For local runs use
  `npx @microsoft/power-apps-cli app run`, in a fresh tab so no earlier 501 flag in
  `sessionStorage` is remembered.

## Lessons from this session (cost real time)

- **Stop the dev servers before `npm ci`.** A running dev server holds the rolldown native binding
  open, and `npm ci` fails half-way with EPERM.
- **Commit with a message file** (`git commit -F <file>`), never `-m` with quotes in PowerShell 5.1.
- **Before any commit, list the scope and confirm every folder the user names: include or
  exclude.** `ProjectDocs/Capex Cost Screen/` went into `5d50e2b` and needed the `2c7e6aa` revert.
- **`pac code push` rewrites `power.config.json` line endings only.** Restore it with
  `git checkout -- ProjectCosts-CodeApp/power.config.json`, and check the `environment_*` entry is
  still there.

## Docs updated with this handoff

- `ProjectDocs/instructions/AGENT-GUIDE.md`: "Start here" now points to this file and to D51/D52;
  `12-…` moved to "Older context".
- `ProjectDocs/instructions/TESTING-AND-HARNESS.md`: last verified run updated to 157 files and
  4,293 tests on `2c7e6aa`, 84 data sources; the D51 test sections are marked committed.
- `ProjectDocs/instructions/KNOWN-RISKS-AND-DECISIONS.md`: the D51 entry brought up to date
  (committed, deployed, deferred deletes, live timings, the resurrection window, CA-12 fixed).
- `02-OPEN-DECISIONS.md`: D52, written before this handoff.
