# Session handoff — 29 Oct 2026: CAPEX refresh after Save, Comments layout, Fabric SQL sources, VSBCloud solution

Start a new chat by reading this file. Then read these, in `02-OPEN-DECISIONS.md` unless stated:
- **D51** §11.17–§11.19 (the Add Cost from Table save, and the CAPEX refresh after it);
- **D53**, D55 (the two DEV pushes);
- **D54** (the Fabric SQL data sources);
- bugs **CA-13** and **CA-14** in `01-BUGS-FOUND.md`.

Re-check the code before you trust any line here. The previous handoff,
`14-SESSION-HANDOFF-2026-10-27.md`, still holds the open product questions of 27 Oct.

## State at hand-off (29 Oct 2026)

| | |
|---|---|
| `master` and `RounakDev1` (local and GitHub) | Both at **`70b4b7d`**, identical, 0 ahead and 0 behind. |
| **Working tree: uncommitted, decision owed** | `ProjectCosts-CodeApp/.gitignore` no longer ignores `.power/` (a local edit, not the agent's). `master`'s `70b4b7d` removed `.power/` from the root `.gitignore` too, so `ProjectCosts-CodeApp/.power/` now shows as untracked. CONVENTIONS rule 9 and the comment in that `.gitignore` still say `.power/` is pac output that must never be committed. Ask the user whether `.power/` should be tracked before staging anything. |
| `ProjectDocs/Capex Cost Screen/` | Local only, excluded through `.git/info/exclude`. **Never commit it.** |
| Deployed to VSBCloud_Dev | App `807a2fba-665c-40f3-b158-ffe822aa7da4` ("Project App", `vsb_projectapp_2f794`), built from **`644b486`** on 28 Oct (D55). It was pushed with `npx @microsoft/power-apps-cli@1.3.0 app push`, not pac. **DEV does NOT have** the 7 `pm-general` / `ui-changes` commits merged into `master` on 28 Oct (`e81eb37`…`8facef8`, 36 files of PM and OPEX/Land Lease UI work) or `70b4b7d`. |
| Solution | The code app is now a component of the unmanaged solution **VSBCloud** (`44aa38f9-6c1f-45e1-a963-5c51941fbe73`). It was added with `pac solution add-solution-component`, with the same app id and name (D55). |
| Last `npm run verify` | 28 Oct on `644b486`: 160 files, 4,357 tests, all green, build OK; `check:power` 89 registered, 0 problems; knip 22 unused files (12 known plus 10 SQL, D54). **Not run on `8facef8` / `70b4b7d`** (the merged `pm-general` work). Run it first. |
| Dev servers | Stopped by the agent for `npm ci`. The user restarts them. |

## Commits this session (27–28 Oct)

| Commit | What |
|---|---|
| `94eb07d` | **CA-13 / D51 §11.19.** DEVEX/CAPEX shows the saved state at once after an Add Cost from Table Save: an optimistic book patch (`features/cost/costing/savedSheetPatch.ts`), a pending-delete registry (`data/pendingDeletes.ts`), and `refetchType:"all"` plus cancelling in-flight reads. Also the §11.17–§11.18 review fixes and the UT-ADGATE-915 test race fix. |
| `897d734` | D53: the DEV push of `94eb07d`. |
| `30061f1` | **CA-14.** CAPEX Comments panel: Type/Year/Month aligned when Year shows "Required" (`alignItems: "start"` on `typeRow` in `CommentsPanel.tsx`). |
| `644b486` | **D54.** Five Fabric SQL tables registered as `shared_sql` data sources, consuming the existing connection reference and environment variables. |
| `527d094` | D55: the DEV push of `644b486`, and the app added to VSBCloud. |
| `e81eb37`…`8facef8`, `70b4b7d` | **Not from this session.** `ui-changes` / `pm-general` UI parity work and the root `.gitignore` change, merged into `master` by the user and fast-forwarded into `RounakDev1`. |

## The Fabric SQL data sources (D54): what is true

- **The chain in DEV.** All seven variables are in VSBCloud:
  - the table variables `vsb_AssumptionsBanksSQL`, `…RevenuesSQL`, `…KfWTrancheSQL`, `…DebtSQL` and
    `vsb_AssumptionsBoPContracts`;
  - their parent `vsb_FabricSQLDatabase` (`Lakehouse_Gold`);
  - its parent `vsb_FabricSQLServer` (the Fabric warehouse endpoint).
- **The connection reference** is `vsb_VSBCloudFabricSQL`, which both canvas apps also use.
- **`power.config.json` → `connectionReferences`** has one `shared_sql` entry:
  - `xrmConnectionReferenceLogicalName`;
  - a `tableNameOverride` per table (written by the CLI);
  - `datasetOverride: "vsb_FabricSQLServer,vsb_FabricSQLDatabase"`, added by hand and copied from
    the canvas `LocalConnectionReferences`.
- **No environment variable or connection reference was created or changed.** The user forbade it.
- **Generated files:** `src/generated/{models,services}/Assumptions*`. The columns match the canvas.
- **Open:**
  1. **The dataset override is unproven at runtime.** No code-app doc shows the two-variable form;
     Microsoft documents a single combined String variable (PowerAppsCodeApps issue #445).
  2. **No screen reads these tables yet.**
     - Finance (Debt, Banks, KfW), Revenues, Production and Milestones still return `notConnected()`.
     - Contracts still reads the Dataverse BoP copy (D2).
  3. **Read only.** The generated services include create/update/delete, but the canvas allows
     `get` only.
- **How to verify** (given to the user on 28 Oct): `check:power`, then
  `pa app list-environment-variables`, then app details in the maker portal. Then a real read in
  DEV, for example `AssumptionsBanksService.getAll(...)`: watch the request URL for
  `<server>,Lakehouse_Gold/tables/[dbo].[AssumptionsBanks]` versus a 404 or `%252C`. Then a second
  environment after solution import.
- **Re-adding on a fresh checkout:** the CONVENTIONS "Before pushing to DEV" step 2 command, then
  restore `datasetOverride`.

## Open, in priority order

1. **Run `npm run verify` on `70b4b7d`.** The merged `pm-general` work has not been gated in this
   workspace.
2. **Ask about `.power/` tracking** (see the state table) before any commit.
3. **The DEV smoke tests owed by the user:**
   - CA-13: Save on Add Cost from Table with an edited cell, a cleared cell and a removed contract;
     CAPEX must show all three at once.
   - CA-14: the Comments row is aligned with "Required".
   - D54: a runtime SQL read.
4. **A first real SQL consumer** to prove D54, suggested as Banks in the Finance bank picker. It
   needs the canvas formulas ported (`Project Finance Screen.pa.yaml:1877-1880`) and read-only use.
5. **Product decisions still open:**
   - D51 approval (the bulk Save, the deferral switches, the §11.19 optimistic display);
   - CA-12;
   - D2 (BoP from Fabric or Dataverse);
   - D45 G2;
   - removing the unused `UpsertMultiple` artifacts (keep the `environment_*` entry either way).

## Lessons from this session (cost real time)

- **Always run commands from `ProjectCosts-CodeApp/`.** The shell's cwd resets to the workspace
  root after some calls. From the root, `npx vitest` uses the forks pool ("Failed to start forks
  worker") and `npm` fails with ENOENT. Use `Set-Location` with an absolute path in each command.
- **Worker-start timeouts are environmental.** "Failed to start threads worker" for about 11–13
  jsdom files under a full `verify`, from this OneDrive path. Re-run those files alone, then
  `npm run build` (the aborted verify skipped it). A pre-filtered `Select-String` can hide the
  summary: write the verify log to a file and parse it.
- **`npm ci` takes 10+ minutes here.** Run it in the background, and stop the dev servers on
  3000/8080 first.
- **`pac org fetch --xml` breaks on quotes in PowerShell 5.1.** Write the FetchXML to a file and
  use `--xmlFile`.
- **The npm Power Apps CLI** (`npx @microsoft/power-apps-cli@1.3.0`):
  - It reads the environment from `power.config.json` in the app folder; `--environment-id` / `-e`
    are rejected there.
  - `app push` without `--solution-id` keeps the existing app; it did not rewrite
    `power.config.json`.
  - Prefer it over `pac code push` now that connector sources exist.
- **`pac code push`** rewrites `power.config.json` line endings. Restore it with
  `git checkout -- power.config.json`.
- **Adding the app to a solution:** use `pac solution add-solution-component --componentType 300`,
  which keeps the app id and name. `pa app push --solution-id` was avoided because it does not
  guarantee that the existing app record is kept.
- **Commit with a message file** (`git commit -F`), and list the exact scope before any commit.

## Docs updated with this handoff

- `ProjectDocs/instructions/AGENT-GUIDE.md`: "Start here" now points to this file; `14-…` moved to
  "Older context".
