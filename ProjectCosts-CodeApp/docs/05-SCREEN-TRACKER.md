# Screen tracker — what is done, what is in progress, what is next

> Active execution plan: [`06-DEMO-COMPLETION-PLAN.md`](06-DEMO-COMPLETION-PLAN.md).
> `03-STATUS.md` and `04-SINGLE-APP-IMPLEMENTATION.md` are historical checkpoints.

Single source of truth for build state. Updated as work lands, not as work is planned.

**Visual specification:** `Existing Solution/UI Screenshots/` — 23 captures of the live Canvas
apps, each named for the screen and state it shows. These take precedence over the extracted
YAML and over the skeleton's older screenshot notes whenever they disagree.

Legend: **done** = built and matches the reference · **partial** = built, known deltas listed ·
**stub** = placeholder only · **—** = not started.

---

## Status at a glance

| # | Screen / state | Reference screenshot | State |
|---|---|---|---|
| 1 | Main Project Overview | `Main Overview Screen.png` | **partial** |
| 2 | Overview — filter dropdown open | `Main Overview Screen Dropdown.png` | **partial** |
| 3 | Overview — search + selected row | `Main Overview Screen Search and Selected Project.png` | **partial** |
| 4 | App loading / splash | `AppLoadingScreen.png` | **—** |
| 5 | DEVEX/CAPEX — Summary tab | `Cost App Landing Screen - Devex Capex Screen.png` | **partial** |
| 6 | DEVEX/CAPEX — category, collapsed | `… - Selected Category - Collapsed Accounts.png` | **partial** |
| 7 | DEVEX/CAPEX — expanded hierarchy | `… - Expanded Account Rows.png` | **partial** |
| 8 | DEVEX/CAPEX — Add/Edit Costs panel | `… - Add Cost Panel.png` | **partial** |
| 9 | Add Cost from Table — spreadsheet | `Cost App - Add Cost from table screen - After clicking….png` | **stub** |
| 10 | Add Cost from Table — saving | `… - Loading on Devex Capex Screen.png` | **stub** |
| 11 | OPEX — Operation & Maintenance | `Cost App - O & M Selected Tab….png` | **partial** |
| 12 | OPEX — Other OPEX Costs | `Cost App - Other opex - Tab selected.png` | **partial** |
| 13 | Land Lease | `Cost App - Landlease Tab selected.png` | **partial** |
| 14 | Add / Edit Period panel (shared 11–13) | `Cost App - Add & Edit ContractPeriod Panel….png` | **partial** |
| 15 | Contracts — expanded contract | `Cost App - Contracts Tab Selected - Expanded Contract.png` | **partial** |
| 16 | Contracts — Add/Edit panel | `Cost App - Contract Edit Add Panel Open.png` | **partial** |
| 17 | Contracts — panel, account expanded | `… - Expanded Devex Capex Account In panel.png` | **partial** |
| 18 | Project Rights contract panel | `Cost App - Project Rights Contract Add-Edit Panel.png` | **partial** |
| 19 | Add Costs panel — year cost inputs | `Cost App - Edit Contract - Year Cost Inputs.png` | **partial** |
| 20 | Comments panel — general comment | `Cost App - Comment Panel contract Row - General Comment.png` | **stub** |
| 21 | Comments panel — comment to payment date | `… - Comment to payment date.png` | **stub** |
| 22 | Comments panel — reply to comment | `… - Reply to comment.png` | **stub** |
| 23 | Comments panel — saving | `… - Saving.png` | **stub** |

---

## In progress

**P0: coherent demo data layer — mostly landed 14 Sep.**

Done:
- `src/data/costRepository.ts` is the single Cost boundary: one `CostRepository` interface,
  a `dataverseCostRepository` (the generated services, unchanged) and a `demoCostRepository`.
  `costRepository()` picks by mode.
- Contracts no longer calls `@/data/contracts` directly. Every query and mutation in
  `features/contracts/hooks.ts` goes through the repository, so the demo build cannot write to
  Dataverse from the Contracts screen.
- **Recalculation is connected.** `capexCosts` was a hard-coded `[]`; it now narrows the
  project's DevCo CAPEX rows to the contracts under the ticked level-3 accounts
  (`costRowsForAccounts`). In demo mode those rows are derived from the same `CostBook` the
  CAPEX screen edits, so a CAPEX change moves a contract's Plan figures. On the live build the
  repository still returns `[]` — `vsb_capexcosts` is not a declared data source — which is the
  same 0 as before, now in one documented place instead of inline in the screen.
- A CAPEX save invalidates the contract-facing derived queries, so the two screens cannot drift.
- The demo contract book (`src/demo/contracts.ts`) seeds two contracts, three payment targets
  and the DevCo links that tie them to the seeded CAPEX lines. Deleting a contract cascades to
  its targets and links, as the Dataverse relationships do.
- 27 tests (`UT-REPO-001…023`), including a guard that asserts no `src/demo/*` module imports a
  generated service or the Power Apps SDK.

Still open in P0:
- Seed **comments and Land Lease allocations** — the rest of the deterministic project is seeded.
- The **smoke test** walking Overview → new tab → every Cost route.

Then implement **Add Cost from Table (items 9–10)** from `vsbcloud-pcf-spreadsheet`, complete
the missing CAPEX behavior — starting with the comments panel now that items 20–23 specify it —
close Contracts and Period-screen deltas, and finish loading and Overview parity. See
`06-DEMO-COMPLETION-PLAN.md` for gates and sequencing.

---

## Implemented — detail

### 5–8 · DEVEX/CAPEX
The real PCF is ported, not reimplemented: `DatasetParser.js` (989 lines), `GridRenderer.js`
(1,433), `ActionDropdown.js` (228) and the original 1,416-line stylesheet, behind a 59-line
React host (`PcfGrid.tsx`) that maps domain rows in and typed callbacks out. Screen carries the
category tabs, the toolbar (Add Cost from Table, the two toggles, the payer filter, the year
stepper), the summary table, the Add/Edit Costs panel with cluster and date distribution, the
comments panel, delete confirmation and the saving overlay.

This is now classified **partial**, not done: years and cluster dates are hard-coded, standard
options are empty, assumptions/permissions/threaded comments are incomplete, and no dedicated
CAPEX test suite exists in the current app. A rendered 1919×1018 comparison also found visible
header, rail, typography, and table deltas.

### 19–23 · Added 14 Sep — the comments panel and the year column

Five captures arrived after this tracker was first written. They do not add new screens; they
specify two things that were being carried as finished.

**19 · The Add Costs panel's year column is confirmed correct.** One collapsible block per year
reading `2015  Allocated Cost: 0 EUR`, the open one listing twelve month rows with a numeric
input each, its own scrollbar. `canvas-year-list` already renders this. Two deltas: month rows
are labelled `January 2020` in the reference and `Jan` in ours, and empty months show `0` in the
reference where ours render an empty input.

**20–23 · The comments panel is a stub, not a finished panel.** What exists is
`capex-costs/Screen.tsx` lines 108–114 — a narrow panel listing `<p>` strings over one
255-character textarea appending to `CostLine.comments: string[]`. The reference shows a
threaded, typed, sortable, resolvable system:

- Blue title `Comments : <account, truncated>`, then a breadcrumb `Wind Turbine / Panels /
  Turbine / PV Supply Agreem…` — category / account / subaccount.
- A toolbar: `Sort by` (`Date added [Oldest]`), a checked `Pin general comments to top`, an
  unchecked `Show resolved comments`.
- Saved comments are read-only blocks headed `Comment #01 [Shakti Singh Rajput - 14.09.2026]`
  with four row actions — reply, resolve (✓), edit, delete. So a comment carries an ordinal, an
  author, a date and a resolved flag; a `string` holds none of them.
- The editor card carries a `Type` dropdown — `General Comment` or `Comments to payment date` —
  and for the latter a `Year` and a `Month` dropdown appear beside it, binding the comment to
  one payment cell.
- Reply inserts an indented `Reply to comment` card under its parent, with no Type dropdown.
  Comments are a two-level tree.
- The counter is **`n / 250`**. The Contracts panel's counter is `/255` (`COMMENT_MAX_LENGTH`).
  Two different limits on two different fields — they must not be unified by accident.
- `+ Add Comment` adds another editor, so several save at once; hence the centred overlay
  reading `Saving comments...`, plural.
- Save is disabled until something is entered, filled blue once it is.
- A grid row that owns comments is marked with a red dot after the account name.

This is P2 work in `06-DEMO-COMPLETION-PLAN.md` ("Comments are a flat string list, not
threaded/resolvable Canvas comments"), now with a concrete specification.

---

## Partial — known deltas against the reference

### 1–3 · Main Project Overview
Built: four-column two-row filter grid, funnel buttons, server-side filter/sort/paging by skip
token, command bar in the header band, no left rail, accent bar, alternating rows, approval
glyph, `Total Rows` + pager.

Deltas still to close:
- Next-page button in the reference is a **filled blue square**; First/Previous are subtle grey.
- Reference shows a scrollbar track on the grid's right edge at all times.
- Selected-row and dropdown-open states not yet compared against screenshots 2 and 3.

### 11–14 · OPEX · Land Lease · Other OPEX · Add/Edit Period

Built as ONE screen for all three rail destinations — which is what the canvas did (`Opex Costs
Screen` served both OPEX items) and what the reference filenames say ("Almost same for Landlease
and other Opex also"). `features/periods/rules.ts` holds every decision, `Screen.tsx` only
composes; `opex-costs/Screen.tsx` and `land-lease/Screen.tsx` are now three-line route entries.

Built: collapsible group cards with the first open, the per-card toolbar (Add Period · Add
Standard Contract · Edit · Delete, plus Add Contract Type on Land Lease's `Locations` card with
Add Period disabled there), the 15-column period table with a radio-select column and a
horizontal scrollbar, Land Lease's three extra columns, italic blue standard-contract rows,
blank-not-zero numeric cells, `dd.mm.yy` dates, the two-column Add/Edit Period panel with its
conditional inflation fields and computed end date, Add Contract Type, and the delete
confirmation. 47 rule tests + 10 render tests.

Deltas still to close:
- **Group order is alphabetical** for O&M and Other OPEX. The live app almost certainly orders
  by subaccount number; the reference screenshot shows too few groups to tell. Needs one look at
  `vsb_opexsubaccounts` before it can be called right.
- **Inflation Profile shows blank for a country profile.** `toPeriodRow` takes a `countryName`
  and the screen does not pass one yet — the project's country is not on the session. The custom
  `2.0 %` form renders correctly.
- **Land Lease `Allocation` and `OTP` are always blank**, and `Secured` is derived from
  `standard` as a placeholder. All three need `vsb_landleaseallocationwtgs`, which is also the
  S-5 owning-business-unit defect.
- **Add Standard Contract seeds a row** rather than importing from
  `vsb_opexlandleasestandardassumptionses`. The imported-group naming (`… [Imported]`) is
  reproduced, the import is not.
- Same demo-mode gate as CAPEX: the periods live in the demo cost book, not in Dataverse.

### 15–18 · Contracts
Built: contract list, payment targets, all three add panels, both delete confirmations, the
recalculation chain and its tests.

Deltas still to close:
- Command bar belongs at the **top of the content area**, not in the header slot. The reference
  shows "+ Add Development Contract · + Add Construction Contract · + Add Project Rights
  Contract · Edit · Delete" above the first card.
- Contract cards need the **blue left accent bar**, a radio, and a chevron at the far right.
- Expanded body is a **four-column grid of read-only grey boxes**, not a form.
- "Payment Targets" is a heading followed by its own **sub-toolbar** (Add Period · Edit ·
  Delete), not a table with per-row icon buttons.
- Closing date renders as `Sun, Apr 13, 2025`.
- The edit panel is a fixed two-column right panel with a blue title bar; the DevCo account
  picker is a **tree with tri-state checkboxes**, and Comment carries an `0/255` counter.
- **Recalculation still reads an empty cost array** (`Screen.tsx`, `capexCosts`). Now that the
  cost book exists this is wire-up, not new work. Plan Phase 3 item 3.

---

## Not started

### 4 · App loading / splash
`AppLoadingScreen.png`. Shown while the Cost tab boots.

### 9–10 · Add Cost from Table
Modal over a dark scrim, blue title bar `<Project> - <Category>`, toolbar (Add Row · Delete Row ·
Copy Table), a spreadsheet with A/B/C column letters and numbered rows, header row 1, account and
subaccount rows with **locked grey month cells**, contract rows editable, `Version 1.0.77`
bottom-left, Save / Cancel bottom-right. Source: `vsbcloud-pcf-spreadsheet`.

---

## Cross-cutting, still open

| Item | Where | Note |
|---|---|---|
| ~~CAPEX works only in demo mode~~ | `useCostBook` | **Closed 15 Sep.** The hook goes through `costRepository()`; the live path reads Dataverse via `data/costBook.ts`. |
| O&M / Land Lease / Other OPEX show no rows on the live build | `data/costBook.ts` | `periods: []` — the OPEX and Land Lease tables are registered and typed but not mapped yet. Group cards render empty rather than erroring. |
| Cost edits cannot be saved on the live build | `dataverseCostRepository.saveCostBook` | Throws a clear message instead of silently discarding the edit. Demo build still saves to session storage. |
| ~~Contracts recalculation is 0 on the live build~~ | `data/contracts.ts` | **Closed 14 Sep.** `vsb_capexcosts` is registered and `listCapexCostRows` queries it for real, filtered to the project's DevCo CAPEX contracts. Not yet exercised against live data. |
| ~~Demo mode is hybrid~~ | `data/costRepository.ts` | **Closed 14 Sep.** One repository boundary; Contracts runs on demo storage in the demo build. |
| ~~19 of 37 Cost tables not generated~~ | `power.config.json` | **Closed 14 Sep.** All 18 missing Cost tables registered with `pac code add-data-source`; **36 data sources** and 36 schemas now generated. |
| Deployed player never smoke-tested | — | New-tab launch and iframe refresh unverified in a real browser. |
| Decisions D1, D2, D3, D6, D12 | `02-OPEN-DECISIONS.md` | Unanswered. |
| First push deferred | — | Decided 14 Sep: push as **"VSB Project App"** to `vsbclouddev.crm4.dynamics.com` (env `be41add6-…`, already configured) as `shakti.singh@vsb.energy` — but only on a **live** build, not a demo one. So the push is gated on the 19 undeclared tables. `appId` is `null`, so it will create a new app. Note this is stricter than plan §6, which puts live wiring in the post-demo backlog. |

---

## Verification log

| Date | typecheck | tests | build | lint |
|---|---|---|---|---|
| 14 Sep (Codex checkpoint, per `04-…`) | pass | 271 / 10 files | pass | 0 errors, 8 warnings |
| 14 Sep (this session, on open) | **FAIL** | — | — | — |
| 14 Sep (after repair) | pass | 271 / 10 files | pass | 0 errors, 10 warnings |
| 14 Sep (periods screen landed) | pass | **328 / 12 files** | pass | 0 errors, 10 warnings |
| 14 Sep (P0 cost repository landed) | pass | **355 / 13 files** | pass | 0 errors, 10 warnings |
| 14 Sep (Stage 0.1 — 18 tables registered) | pass | **357 / 13 files** | pass | 0 errors, 10 warnings |
| 15 Sep (Stage 0.4 — CAPEX on live Dataverse) | pass | **357 / 13 files** | pass | 0 errors, 10 warnings |
| 15 Sep (Stage 1a — CAPEX load optimisation) | pass | **368 / 14 files** | pass | 0 errors, 10 warnings |
| 15 Sep (account tree fix) | pass | **375 / 15 files** | pass | 0 errors, 10 warnings |
| 15 Sep (CAPEX writes) | pass | 388 / 16 files | pass | 0 errors, 10 warnings |
| 15 Sep (Edit-panel fixes) | pass | 392 / 16 files | pass | 0 errors, 10 warnings |
| 15 Sep (canvas distribution arithmetic) | pass | 404 / 17 files | pass | 0 errors, 10 warnings |
| 15 Sep (**demo mode removed**) | pass | **381 / 17 files** | pass | 0 errors, 10 warnings |
| 15 Sep (Stage 2.0 — CAPEX rules extracted) | pass | **415 / 18 files** | pass | 0 errors, 10 warnings |
| 15 Sep (Stage 2.1 — real cluster timeline) | pass | **435 / 19 files** | pass | 0 errors, 10 warnings |
| 15 Sep (Stage 2.2 — panel validation + Distribution Scheme) | pass | 462 / 19 files | pass | 0 errors, 10 warnings |
| 15 Sep (Stage 2.3 — standard contracts, client-side) | pass | **486 / 20 files** | pass | 0 errors, 10 warnings |

**Repairs made on opening this session.** The tree did not compile; three edits had been left
mid-flight:

1. `features/costing/model.ts:3` — a literal `+` from a diff had leaked into the source
   (`"Other CAPEX",+] as const;`). One character; it broke every downstream import.
2. `demo/projects.ts` — the demo manager seed used `displayName`; `PersonOption` declares `label`.
3. `data/projects.ts` — the demo branch of `searchProjectManagers` read the same absent field.

All three were unambiguous corruption rather than design choices, so they were corrected rather
than raised.

**Note on the test run.** On a cold cache the jsdom workers can exceed vitest's 60 s worker
start-up timeout on this OneDrive path and report "Failed to start threads worker" for two or
three files. A second `npm test` on a warm cache passes all twelve. It is an environment
symptom, not a test failure — but it does mean a green run should be confirmed, not assumed.

---

## Stage 0 progress — the parity plan

`06-DEMO-COMPLETION-PLAN.md` is now the **canvas-parity** plan. Stage 0 is the foundation work.

| Step | State |
|---|---|
| 0.1 Register the missing Cost tables | **done** — 18 added, 36 data sources total |
| 0.2 Confirm the two non-Dataverse sources | Fabric SQL identified (answers D2); connection reference not yet created |
| 0.3 Verify option sets on the live environment | **partly done** — `vsb_costtype` confirmed as None 952850000 / DevCo 952850001 / SPV 952850002, i.e. the skeleton's `CHOICE_ADMIN` really does have DevCo and SPV swapped. `vsb_distribution`, `vsb_distributionscheme` and `vsb_accountcategory` also captured. The margin/closing-date sets remain. |
| 0.4 Widen the repository to the whole Cost surface | **CAPEX done** — `data/costBook.ts` reads accounts + cost lines + monthly payments from Dataverse; `useCostBook` no longer throws outside demo mode. Periods and comments still to map; writes not implemented. |
| 0.5 Owning-business-unit create guard | not started |
| 0.6 Settle styling ownership | not started |
| 0.7 Housekeeping (logo, dead PCF parser, unused deps) | not started |

**What 0.1 proved.** `pac` generated entity set `vsb_capexcommentses` with primary id
`vsb_capexcommentsid`. The skeleton's derivation (`entitySet.replace(/s$/,"") + "id"`) would have
produced `vsb_capexcommenteid` — a 404 on every read. Registering rather than hand-deriving was
the right call, and the same trap applies to `vsb_devexcapexstandardassumptionses` and
`vsb_opexlandleasestandardassumptionses`.

**Also fixed in passing.** The `UT-REPO-023` guard imported `node:fs`, which typechecks only with
Node types the app tsconfig does not carry — it passed under vitest and failed `npm run typecheck`.
It now reads the demo modules through Vite's raw glob, so it needs no Node types **and** covers any
new file added under `src/demo/` without anyone remembering to list it.

---

## Deployment log

| When | Build | Solution | Note |
|---|---|---|---|
| 14 Sep 12:04 | unknown (not by me) | none | First push; created app `807a2fba-665c-40f3-b158-ffe822aa7da4` "Project App". Almost certainly a **demo** build — the cost screens showed data. |
| 15 Sep | live | none | Pushed the live build. Cost screens went blank: `useCostBook` threw outside demo mode. **This is the regression the client reported.** |
| 15 Sep | live | `VSBCloudCodeAppsMigration` | Solution created by the client; `--solutionName` on push is a **no-op** for an app that already exists outside a solution — verified by exporting the solution and finding `RootComponents` empty. |
| 15 Sep | live | `VSBCloudCodeAppsMigration` | Stage 0.4: DEVEX/CAPEX now reads real Dataverse data. |

**Lesson recorded.** Pushing a live build over a demo build removes every cost screen's data, and
the difference is invisible from the outside. Build mode must be stated in this log at every push.

**Still unexplained:** `pac canvas list` reports Project App's *Modified on* as 14-09-2026 despite
several successful pushes on 15-09. The app does update — the client confirmed the new build runs —
so the column appears not to track code-app pushes. Noted rather than guessed at.

---

## Stage 1 — DEVEX/CAPEX

Working order agreed with the client: **the screen and its load time first**, then the Add/Edit
Costs panel, then the comments panel, then Add Cost from Table.

### 1a · Load time — done

Two independent causes, both fixed.

**The grid rebuilt itself on every repaint, quadratically.** `gridRows` was inline in
`PcfGrid.tsx` and, per account, filtered the whole account list, filtered the whole line list
with an `Array.includes` inside the predicate, then made **15 separate passes** over every
payment. Work grew as `accounts x lines x payments x 15`, and it ran again on every
`ResizeObserver` fire. It is now `features/capex-costs/gridRows.ts`: one pass per payment,
lookups by index, account totals accumulated from their children rather than recomputed — and
memoised in `PcfGrid` on `(accounts, lines, year)`, so a resize is a repaint and nothing more.

`gridRows.test.ts` keeps the ORIGINAL implementation verbatim as `reference()` and asserts the
two agree on generated data (`UT-GRID-010`), so the rewrite is equivalence-checked rather than
eyeballed. `UT-GRID-011` is a complexity smoke alarm on a 500-contract, 96,000-payment set.

**The fetch ignored the open tab.** `loadCostBook` pulled every contract and every monthly cost
row for the whole project, then the screen rendered one category. Now:

| Tab | What is fetched |
|---|---|
| A category | that category's accounts only — contracts server-filtered by account, plus their cost rows (all years, because Total/Planned/Actual are all-years figures) |
| Summary | `loadCapexTotals` — contract `vsb_totalcost` grouped by category. **No monthly rows at all.** |
| OPEX / Land Lease screens | no cost lines at all (`category` omitted) |

This is the canvas's own shape — it rebuilt `colCapexContractsInSelectedCategory` per tab — and
the skeleton's (`capexCostKeys.contracts(projectId, categoryId)`). react-query caches per
category, so revisiting a tab is free.

**Not yet measured against the live environment.** The complexity change is provable; the
wall-clock improvement is not, until someone opens it on a real project.

### 1b · Add / Edit Costs panel — in progress

Traced against `CapexScreenCode.txt` (the canvas export) and the skeleton's `capex-costs/rules.ts`.

**Fixed 15 Sep:**

| Symptom | Cause | Canvas reference |
|---|---|---|
| Nothing could be saved or marked paid | The live `saveCostBook` threw by design | — |
| Total Costs box wrong or empty on Edit | We summed the monthly rows; the canvas binds `locAllYearsCost = contract.'Total Cost'` (`vsb_totalcost`), which we never mapped | `CapexScreenCode.txt:7212`, control value `:10841`; skeleton `totalCostForPercent` |
| A contract with no `Cost Type` read as SPV | Missing the `SPVDevCo Mapping Capex Devexes` fallback | `CapexScreenCode.txt:7196` `Coalesce('Cost Type', mapping.'DevCo/SPV')` |
| Currency hardcoded `[EUR]` | Label is `"Total Costs [" & ISO Currency Code & "]"` | `CapexScreenCode.txt:10849` |
| Comment counter 255 | CAPEX comments are 250; 255 is the Contracts limit | Harness §19 |

**Still open on this panel:**

- `vsb_byclusterjson`, `vsb_bystartenddatejson` and `vsb_distributionfrequency` are **null on
  every existing contract** in VSBCloud_Dev, so clusters, start/end dates and frequency do not
  populate on edit. What the canvas does with those nulls has not been traced yet.
- **`vsb_distributionscheme`** (`% Values` / `Absolute Values`) is not in our model at all; the
  canvas panel has a Distribution Scheme radio that we do not render.
- **`RoundDown` vs cents.** `distribute()` works in cents with `Math.floor`; the canvas uses
  `RoundDown(total / n, 0)` on whole currency units. Unreconciled — see §6.0 of the plan.
- The canvas strips the word `Standard` from a description on save
  (`CapexScreenCode.txt:10829`); we do not.

### 1c · Comments panel — after that
### 1c · Comments panel — after that
### 1d · Add Cost from Table — last

---

## Measured facts about VSBCloud_Dev

Taken with `pac org fetch` on 15 Sep. **Recorded because every performance assumption made
before this was wrong**, and because the numbers are small enough to change what is worth
optimising.

| Thing | Count |
|---|---|
| CAPEX accounts, whole chart | **80** (76 active, 4 inactive) |
| Accounts with `vsb_accountcategory` set | **3**, all `BoP`. The other 77 are empty. |
| CAPEX project contracts, whole environment | 5,517 |
| CAPEX cost rows, whole environment | **> 50,000** (aggregate cap refused to count) |
| Contracts for project `Wirmighausen` | **12** |
| Cost rows for `Wirmighausen` | **698** |

Project `Wirmighausen` = `9f5aade5-2b7c-ef11-ac20-000d3a466ab7`.

### The account-category bug — cause of "no data on DEVEX/CAPEX"

`loadCostAccounts` derived a category from `vsb_accountcategory`. With 77 of 80 rows empty and
the remaining 3 `BoP` (deliberately excluded), **every account was filtered out**; the grid had
nothing to render. A fallback that mapped option VALUES was added on top, which did not help —
the column is empty, not mis-typed.

The canvas never used that column. It builds the category list from the children of account
number `00001` and excludes `10006`. The real hierarchy confirms it:

```
00001 Root
  10000 Wind Turbine / Panels  ->  80000 ...  ->  80000_0 ...
  10001 Development Expenses   ->  81000 ...  ->  81000_0 ...
  10002 Construction Expenses      10003 Substation / Grid Connection
  10004 Other CAPEX                10006 Overleveraging  (never shown)
10005 BoP  (no parent — outside the CAPEX tree)
```

`loadCostAccounts` now walks that tree: level 2 becomes an account row, level 3 a subaccount, and
the category comes from the level-1 ancestor's name matched against `CATEGORIES`. A level-1 name
outside those five (`Overleveraging`) drops its whole branch, which is what the canvas achieved
with its magic number.

`data/costBook.test.ts` pins this with a fixture transcribed from the real environment —
including `vsb_accountcategory` being absent on every row, which is the detail that broke it.

### On the "slow to load" report

At 12 contracts and 698 cost rows per project, data volume cannot explain a slow screen. The
Stage 1a work (linear `gridRows`, per-category fetching) is still correct and worth keeping, but
it was aimed at a problem this environment does not have. If the screen is still slow once data
renders, the next things to measure are the SDK round-trip count during bootstrap and the 591 kB
Fluent chunk — not the row counts.

---

## Stage 1 — demo mode removed (15 Sep)

Decided by the client: one implementation per feature, live data only.

Deleted `src/demo/` (6 files), `.env.demo`, the `dev:demo` / `build:demo` scripts, and every
`if (DEMO_MODE)` branch in `data/projects.ts`, `data/project.ts` and `platform/powerClient.ts`.
`costRepository()` now returns the Dataverse implementation unconditionally; `isDemo` and
`saveCostBook` are gone from the interface.

**The test count fell, 404 → 381, and that was expected and sanctioned in the plan.** The 23 cases
removed (`UT-REPO-005…019`, `UT-REPO-023`) tested a second runtime that no longer exists. What
survives is the pure narrowing rule (`UT-REPO-001…004`) plus two guards that the single
implementation still exposes every operation the screens call. Real coverage of the Dataverse
reads lives in `data/costBook.test.ts`, which drives actual row shapes through a mocked
`fetchAll` — a better test than a parallel implementation ever was.

**`useCostBook.save` now throws.** It backed demo storage. The screens still calling it are
writing things with no Dataverse path yet — the CAPEX comments panel (stage 2.4) and the OPEX /
Land Lease period screens (stages 3–4). CAPEX's own writes bypass it through `useCapexWrites`. It
throws rather than resolving, so an unsaved edit cannot look successful.

| When | Build | Solution | Note |
|---|---|---|---|
| 15 Sep | live | `VSBCloudCodeAppsMigration` | Demo mode removed. There is no demo build any more, so the live/demo push hazard is gone with it. |

---

## Stage 2.0 — CAPEX rules extracted (15 Sep)

`features/capex-costs/rules.ts` now holds every decision the screen makes; `Screen.tsx` is
composition. This is the convention both references use and the one that worked for Contracts —
and the direct answer to why this feature shipped three defects: all three were in logic that sat
inline in the component, where no test could reach it.

Moved out of the screen and given tests (`UT-CAPEXR-001…034`, 34 cases):

| Rule | What it settles |
|---|---|
| `resolveCategory` | A stale or hand-edited `?category=` falls back to Summary instead of breaking the screen |
| `totalCostForPercent` | `Coalesce('Total Cost', Sum(existing), typed)` — the Edit-panel defect, now pinned, including that a stored **0** is not the same as "no total" |
| `proposedPayments` / `equalPayments` / `clusterPayments` | Cluster money splits across ALL ticked clusters at once, so the remainder lands on the last month overall and the payments sum to the total |
| `canSaveContract` | An individual distribution needs no total; an equal one does |
| `paymentIdsByMonth` | Carries existing cost-row ids so `capexWriteSet` can tell an update from a create |
| `newCostLine`, `panelTitle`, `frequencyLabel`, `allocatedForYear`, `formatSummaryAmount` | Labels and defaults, out of the JSX |

`CLUSTER_DATES`, `YEAR_MIN` and `YEAR_MAX` are named placeholders with the real source documented
(the project's own milestone columns). Stage 2.1 replaces them; keeping them in one place means
there is a single thing to delete.

**Test-runner warning.** One `npm test` run this session reported `Test Files 14 passed (14)` with
no error — it had silently collected 14 of the 18 files on disk. A re-run gave 18/18 and 415 tests.
A green run is only meaningful if the FILE COUNT matches `find src -name "*.test.ts*" | wc -l`;
check both numbers before believing a pass.

---

## Stage 2.1 — real cluster timeline and year window (15 Sep)

Replaced the six hard-coded cluster dates and the fixed 2015-2030 stepper with the project's own
data. `gblClusterDurations` in the canvas chains six milestone columns on the PROJECT row itself
(no separate milestones table): `vsb_feasibilitystudies` -> `vsb_projectdevelopmentstarted` ->
`vsb_applicationsubmitted` -> `vsb_legallybindingpermits` -> `vsb_construction` ->
`vsb_operationsstartdatecod` -> `vsb_enddate`. All six are now selected in `loadProject` and
exposed as `ProjectContext.milestones`.

New `features/capex-costs/clusters.ts` (`clusterDurations`, `clusterBoundaries`,
`costAllowedStart`, `navigationWindow`, `clampSelectedYear`, `canGoPreviousYear/NextYear`,
`projectPeriods`) ports the skeleton's equivalents. **Every function treats a missing milestone as
absent, not zero** — the canvas' `Year(Blank())` is 0, which would file a cost in year 0; a real
project with a gap in its chain now simply gets fewer cluster bands and a narrower window instead
of corrupted dates. 20 tests (`UT-CLU-001…020`) exercise exactly that: a mid-chain gap, the
year-1 sentinel, a fully empty project.

`PcfGrid` now receives real cluster dates (or `null` for a missing one) instead of the six
literals; the Add/Edit panel's cluster mode spreads over the real boundaries; the year stepper's
range and its Previous/Next disabling both come from `navigationWindow`.

One lint warning surfaced and was fixed in the same pass: `navigationWindow` re-read
`project.milestones?.operationsStartCod` after narrowing it with `live()`, re-introducing the
optional chain the narrowing had just resolved — `no-unsafe-optional-chaining`. Bound to a local
first; warning count back to 10.

**435 tests / 19 files** — file count matches `find src -name "*.test.ts*"` this time.


---

## Stage 2.2 — Add/Edit panel validation and Distribution Scheme (15 Sep)

Ported validateTotalCost/totalCostMax (2.25bn Poland, 500m elsewhere), validateMonthYear,
describeDescriptionError (reserved word Standard, duplicate name under a sub-account),
applyDescriptionChange (editing a standard contract description strips the word and clears the
flag), byClusterJson/parseByClusterJson, individualDistribution/canPersistIndividual,
paidToggleNeedsConfirmation, resolvePaidTarget, planDeleteContract — 27 new tests.

Added the missing Distribution Scheme field (vsb_distributionscheme: percent Values / Absolute
Values), previously absent from both the model and the panel. resolvedPayments is the one place
a percent rows raw percentage becomes real money; everything else (month boxes, canSaveContract)
works on the raw values the user typed.

## Stage 2.3 — standard contracts, client-side (15 Sep)

Per the 15 Sep decision: no Dataverse Custom API. features/capex-costs/standardContracts.ts
ports standardAssumptionAmount (flat / per-WTG / per-MW(p) units), activeWtgCount,
applicableStartCluster, eligibleClusters, buildStandardOptions, showStandardSubMenu,
checkStandardContractClick — 24 tests.

vsb_devexcapexstandardassumptionses and vsb_generatortypeinprojects are now read
(data/standardContracts.ts); the PCFs StandardContractOptions dataset -- an empty placeholder
since the port began -- now carries real options, filtered by category, country, technology and
already-created status. Clicking an option creates a real CostLine: amount computed from the
assumptions unit, distributed across whichever of the projects own clusters the assumption
applies to, written as one contract create plus its monthly cost rows.

Added CostLine.standardAssumptionId (_vsb_capexstandardassumptioncontract_value) so a
sub-accounts already-created standard contracts can be told apart correctly.

Known risk, accepted by the 15 Sep decision: the contract create and its cost-row creates are
separate calls with no changeset between them -- a failure between the two leaves a contract
with no cost rows. docs/06-DEMO-COMPLETION-PLAN.md section 9 carries this.

486 tests / 20 files.


---

## Stage 2.4 -- CAPEX comments panel, threaded (15 Sep)

Replaced CostLine.comments (a flat string[]) with the canvas model: threads on
vsb_capexcommentses, one reply level, typed (General / Comments to payment date), resolvable,
sortable, with a client-side draft identity because unsaved comments have no Dataverse id.

features/capex-costs/comments.ts ports commentThreads, renumberThreads (SOURCE DEFECT N-4:
sequence number persisted into Name, reproduced not fixed), gridCommentFlags, resolveThread,
reopenThread, planDeleteRoot, sortComments, paymentDateCommentsAllowed (refused on an
equal-distributed contract), canSaveComments, commentEditable, commentName, truncateComment
(n / 250, not the Contracts panel's /255) -- 27 tests.

data/comments.ts reads and writes vsb_capexcommentses. No year/month column on the comment
itself -- a payment-date comment points at the CAPEX cost row for that month via vsb_CapexCost.
vsb_resolvedby targets aadusers, not systemuser.

features/capex-costs/CommentsPanel.tsx is the new panel: sort, pin-general-to-top,
show-resolved, per-thread read/draft cards, reply, resolve/reopen, delete (cascades a root to
its replies), plus Add Comment. Root comments save first so a same-session reply can bind to
its parent's real id rather than a temp one.

gridRows() now takes an optional commentFlags parameter (default empty map) for the grid's red
dot, replacing the dead CostLine.comments read. Known gap, noted rather than silently left: the
grid does not yet FETCH those flags -- wiring a live per-category comments query for the dot
indicator is deferred; the panel itself is fully functional.

514 tests / 21 files. One new lint warning (react(set-state-in-effect) in CommentsPanel.tsx) --
same pattern already accepted in contracts/Screen.tsx for re-seeding local state on data load.
