# Session handoff — 23–26 Oct 2026: CAPEX parity, Project Overview pagination, DEV push

Start a new chat by reading this file. Then read `02-OPEN-DECISIONS.md` **D41–D50** and bugs
**CA-2–CA-8** in `01-BUGS-FOUND.md`. Re-check the code before you trust any line here.

## State at hand-off (26 Oct 2026)

| | |
|---|---|
| `master` (local and GitHub) | `a94ec68`: Tanya's Land Lease sizing merge, the newest commit on top of this session's work. |
| `RounakDev1` (local and GitHub) | `a94ec68`, identical to `master` (0 ahead, 0 behind). The owner works on `RounakDev1` and merges into `master`. |
| Working tree | The doc updates of this handoff are uncommitted: this file, D46, and the four doc updates listed under "Docs updated with this handoff". `power.config.json` shows as modified with no content change, only LF line endings from `pac code push`. Restore it with `git checkout -- ProjectCosts-CodeApp/power.config.json`. |
| Deployed to VSBCloud_Dev | App `807a2fba-665c-40f3-b158-ffe822aa7da4`, built from **`fceb336`** on 26 Oct, profile `ServiceAccount_DEV`. The push was accepted (D46). **Not deployed:** the four later master commits (`717ced9`, `1b019ad`, `1ae9a14`, `a94ec68`): Land Lease warning text, Land Lease grid, panel and popup sizing, and `ConfirmDialog` changes. |
| Last `npm run verify` | 26 Oct on `fceb336`: 148 files and 3,998 tests. 3,997 passed; UT-ADGATE-910 is a known flake and passed 33/33 when its file was run alone. Build passed. 81 data sources, 0 problems. Not yet re-run on `a94ec68`. |
| Dev servers | Stopped for `npm ci` before the DEV push. Restart `npm run dev` and `pac code run` to work locally. |

## Commits this session

| Commit | Author | What |
|---|---|---|
| `ce81088`, `690e508` | Rounak | DEVEX/CAPEX parity: canvas strings, delete safety, dialog chrome; gap report, D38 and D39 (`11-CAPEX-PARITY-CHANGE-RECORD-2026-10-23.md`). |
| `e3c6179` | Rounak | D40: DEV push of `690e508`, with the local smoke test waived. |
| `e1dd777` | Rounak | Project Overview pagination, D41–D45 (see below). |
| `fceb336` | Rounak | Merge of `origin/master` into `RounakDev1` (Land Lease UI parity and the cost book data layer). No conflicts. Fast-forwarded into `master` and pushed. |
| `33c1a9d` (23 Oct) | Sourabh | OPEX UI parity: canvas column widths, panel geometry, date-picker text, the years list and Months default. Also O-5 corrected to period order, and blank-field messages removed (D47, D48). |
| `310c229` (25 Oct) | Sourabh | Merge of `feature` into `master`. Pushed to DEV on 26 Oct with no D-entry (noted in D46). |
| `4fc8cff` (26 Oct) | Sourabh | The commit is titled "cost book data layer", but the diff is small (14 files, +275/−51). It does three things: O&M cards keyed on the device row id (CA-5); the stored `vsb_name`, with O-5 reproduced again for the Add Period and Delete gates (D47); and CAPEX opening on the `App.OnStart` year (CA-6, D50). |
| `45a279a` (26 Oct) | Sourabh | One row of `01-BUGS-FOUND.md`: O-5 "reproduced again" at the product owner's request. |
| `d75ac4e` (26 Oct) | Sourabh | Merge of `feature` into `master`. |
| `5c64900`, `94b9a21` (26 Oct) | Tanya | Land Lease UI parity: the grid, the Add/Edit panel and four behaviour fixes (CA-7, CA-8). It also adds the opt-in `ConfirmDialog` `canvasFooter`, used only by Land Lease (D49). Deployed in `fceb336`. |
| `717ced9`, `1b019ad` (26 Oct) | Sourabh | The Land Lease footer hint on one line, at the PO's request (D49 §3), and its merge. Not deployed. |
| `1ae9a14`, `a94ec68` (26 Oct) | Tanya | Land Lease grid, panel and delete-popup sizing, and the `canvasFooter` sizes, with their merge. Not deployed. |

## What the pagination work changed (all PROPOSED, not product-approved)

Everything is in `data/client.ts` (`countedPage`), `data/projects.ts` (`loadProjectPage`),
`data/executePlan.ts` and `features/pm/project-main/`. The user confirmed it works locally
against VSBCloud_Dev ("working perfectly", 26 Oct).

| Decision | Problem | Fix |
|---|---|---|
| **D41**, **D42** (CA-2) | Page 2 came back blank and Next was then disabled. `top` was sent as `$top`, which in Dataverse caps the whole result, so no skip token came back. | Page size goes as `maxPageSize`. The token cache is keyed by table and signature and invalidated after every accepted write. The walk cap is reported as `limited`. |
| **D43** | Next took too long. | `@odata.count` is fetched once per query, the blank probe runs at the same time as the named read, page N+1 is prefetched, and grid rows are memoised. |
| **D44** (CA-3) | "Page 6 of 7" with Next disabled. | A `vsb_projectid asc` tie-breaker on `$orderby`. At the end of the walk, the page reached is the last page. |
| **D45** (CA-4) | The code app showed 7 pages where the canvas shows 6: each segment was rounded up separately. | Pages are one continuous run of 200 over named rows followed by blank ones, and the count is the canvas `RoundUp(TotalRows / PageSize)`. Stale counts no longer leave the pager stuck or hidden. |
| **D46** | — | Record of the DEV push of `fceb336`, with the agent's smoke test waived. |

Tests: UT-PAGE-001..018, UT-PROJPAGE-001..056, UT-PLAN-025..031, UT-OVUI-038..046 and
UT-OV-092..096. An independent property check of 2,704 page-size and row-count cases against the
canvas formula found 0 failures.

## Colleague feature work this session (26 Oct)

Documented after the fact from the diffs and the current code. None of these commits updated the
docs, apart from `45a279a`. Nothing here is product-approved unless stated.

- **OPEX** (`33c1a9d`, `4fc8cff`), `features/cost/periods/OpexScreen.tsx` / `opexRules.ts`:
  - **The "last period" sort.** O-5 was corrected to period order on 23 Oct, then reproduced again
    on 26 Oct for the Add Period and Delete gates. The product owner asked for this: "code app must
    behave like canvas". The chain display and the Other-OPEX warning icon still use period order,
    which is an unmarked divergence. See **D47**.
  - **Panel messages.** Blank required fields are silent again. The corrected O-12 start-date
    message is no longer rendered. A duplicate-description message taken from a commented-out
    canvas formula is still shown. O-11 was re-read: the canvas years list is correct. See **D48**.
  - **Same-named devices.** Cards are now keyed on the device row id (**CA-5**).
- **CAPEX** (`4fc8cff`): the screen opens on the `App.OnStart` year (**CA-6**, **D50**). The gap
  report's D1 and B1 rows are amended.
- **Land Lease** (`5c64900`, `717ced9`, `1ae9a14`), `LandLeaseScreen.tsx`:
  - **The parity pass.** Grid and panel geometry, plus behaviour fixes: case-insensitive row order,
    an editable later-period Start Date (**CA-8**), allocation refill from this contract only
    (**CA-7**), the `54` rate format and the Allocation list order. See **D49**.
  - **The footer hint** is on one line, at the PO's request (D49 §3).
- **Shared component:** `ConfirmDialog` has a new `canvasFooter` prop. It is opt-in and off by
  default. The one Land Lease dialog is the only caller (verified 26 Oct). See D49 §1.
- **Tracker:** `05-SCREEN-TRACKER.md` §11–14 was rewritten to the current code, and a CAPEX note
  was added under §5–8. `gap-analysis/README.md` gains rows for OPEX and Land Lease; neither has a
  gap report.

## Open, in priority order

1. **Product approval** of D38–D45. The deployed build shows unapproved behaviour.
2. **D45 G2, a product question.** The code app filters `statecode eq 0`, while the canvas
   `Filter(Projects, …)` lists inactive projects too. If the page counts still differ from the
   canvas, check this first.
3. **Smoke-test DEV** (`fceb336`): the Project Overview pager against the canvas, and the
   Land Lease and OPEX screens from master, which nobody tested in this session.
4. **Deploy the four newer master commits** if wanted. Run `npm run verify` on `a94ec68` first:
   the shared `ConfirmDialog` changed after the last verify.
5. **Pager edge cases recorded but not fixed** (D44 §3a and D45 §3b):
   - an empty page behind a stale token after another user deletes rows;
   - a page past the end goes to the last page, not page 1 as in the canvas (D41 P-3);
   - another tab's writes (Edit Project) and window-focus refetches do not refresh the cached
     total.
6. **Smaller loose ends from the pagination evaluations:**
   - **No test of the local name.** `projects.ts` uses its own `ES_PROJECTS = "vsb_projects"`
     instead of `ES.projects`.
   - **Stale page cache after PM saves.** The React Query `["projectPage"]` cache is not
     invalidated by PM screen saves; up to 30 s stale.
   - **Duplicate test ids, with no gate checking them.** Pre-existing: UT-PLAN-001..031 (in both
     `executePlan.test.ts` and `pm/planning/rules.test.ts`), UT-OV-054..058, UT-OVUI-033..035.
   - **A flaky test.** UT-ADGATE-910 fails under load in nearly every full run.
   - **No record of the earlier push.** The earlier 26 Oct DEV push of `310c229` has no
     D-entry; it is noted in D46.
7. **Doc/code disagreements found on 26 Oct, from the colleague commits.** Each is resolved in the
   docs in favour of the code, but the items below still need a product or code decision:
   - **O-5 remainder (D47 §4).** The Other-OPEX warning icon and the chain order still use period
     order. Does "behave like canvas" cover them too? Either way, the code needs a `DIVERGENCE:`
     marker or the canvas sort.
   - **Duplicate-description message (D48 §3).** It comes from a commented-out canvas formula
     (rule 10) and has no marker.
   - **O-11 (D48 §4).** Does the canvas render the defective `DefaultSelectedItems` label on edit?
     OPEX does not reproduce it; Land Lease (LL-D2) does. Only a canvas run can settle this.
   - **Footer hint (D49 §3).** It is on one line at the PO's request, with no `DIVERGENCE:` marker
     and no test.
   - **No tests (D49 §1–§2).** Five Land Lease behaviour fixes and `canvasFooter` have none. The
     `onStartSelectedYear` tests have no `UT-` ids.
   - **Stale prop comment.** The `canvasFooter` prop comment says 16 px icons; the style sets
     20 px.
   - **Stale docs.** `05-SCREEN-TRACKER.md` §11–14 had described a demo-mode, single-screen
     layout. `cost-capex-costs.md` D1 / B1 marked the opening year COVERED when it was not. O-11 and
     O-12 in `01-BUGS-FOUND.md` no longer matched the code. All four are now amended.

## Lessons from this session (cost real time)

- **Stop the dev servers before `npm ci`.** A running `npm run dev` holds the rolldown native
  binding open, so `npm ci` fails with EPERM half-way and leaves `node_modules` broken.
- **An aborted verify skips the build.** One flaky test or worker-start failure aborts `vitest`,
  so reconcile: passed, plus failed, plus failed-to-start, equals 148 files. Re-run the failed
  files alone, then run `npm run build` separately.
- **Never use `git commit -m` with quotes in PowerShell 5.1.** It splits the message on embedded
  `"`. Write the message to a file and use `git commit -F <file>`.
- **Edit docs with the Edit tool, never PS 5.1 `Get-Content`/`Set-Content`.** One agent
  double-encoded `02-OPEN-DECISIONS.md` that way.
- **Fetch before every merge or push.** Colleagues pushed to `master` four times on 26 Oct.

## Docs updated with this handoff

- `ProjectDocs/instructions/AGENT-GUIDE.md`: "Start here" now points to this file.
- `ProjectDocs/instructions/TESTING-AND-HARNESS.md`: last verified run updated to 148 files and
  3,998 tests.
- `ProjectDocs/instructions/KNOWN-RISKS-AND-DECISIONS.md`: D45 G2 and the pager residuals added.
- `05-SCREEN-TRACKER.md`: the Main Project Overview pager status.
- `10-SESSION-HANDOFF-2026-10-22.md`: its 26 Oct note is marked as superseded by this file.
- Colleague commits, documented later on 26 Oct:
  - `02-OPEN-DECISIONS.md`: D47–D50.
  - `01-BUGS-FOUND.md`: CA-5–CA-8; O-5, O-11 and O-12 amended; file paths in Parts 1c and 1d.
  - `05-SCREEN-TRACKER.md`: §11–14 rewritten, plus a CAPEX note.
  - `gap-analysis/README.md`: OPEX and Land Lease rows.
  - `gap-analysis/cost-capex-costs.md`: D1 / B1 amendment.
