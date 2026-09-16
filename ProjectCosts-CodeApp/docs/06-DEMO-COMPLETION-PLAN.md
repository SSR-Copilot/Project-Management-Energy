# Project Costs — functional parity plan

Updated: 15 September 2026. **This is the only plan document.** `05-SCREEN-TRACKER.md` remains the
screen checklist; `01-BUGS-FOUND.md` is the defect register; `03-STATUS.md` and
`04-SINGLE-APP-IMPLEMENTATION.md` are historical checkpoints.

## 1. Why this plan replaces the last one

The previous plan described *what* to build. It did not describe *how*, and the result was that
work proceeded reactively — a symptom was reported, I fixed that symptom, and the next symptom
appeared. One file, `data/costBook.ts`, produced three separate defects in two days:

| Defect | Cause | Both references already had it right |
|---|---|---|
| CAPEX grid entirely empty | Derived the category from `vsb_accountcategory`, which is empty on 77 of 80 rows | Canvas builds categories from the children of account `00001`; skeleton has `CAPEX_ROOT_NUMBER` |
| Contract names blank | Read `vsb_description` only; it is null on every contract | Skeleton `buildGrid`: `name: contract.description ?? contract.name` |
| Total Costs box wrong on Edit | Summed the monthly rows | Canvas binds `locAllYearsCost = contract.'Total Cost'`; skeleton has `totalCostForPercent` |

Every one was avoidable by reading first. **Contracts is the only screen built by porting rather
than by inventing, and it is the only screen that has not produced a stream of defects.** That is
the method this plan makes mandatory.

## 2. The method — non-negotiable, per feature

No feature is written from scratch. For each one, in this order:

1. **Read the canvas Power Fx.** `Existing Solution/PCF Git Repo Clones/DevexCapexSummaryPCF/Powerapps code/`
   — `CapexScreenCode.txt` (19,965 ln), `OpexCostScreenCode.txt` (8,932), `ContractsScreenCode.txt`
   (7,827), `LandLeaseCostScreenCode.txt` (6,132), `AddCostFromTableScreenCode.txt` (387),
   `OnStart.txt` (967). Plain text, greppable — always prefer these over the `.pa.yaml`.
2. **Read the skeleton rule and its tests.**
   `VSBCloud-Code-App-Skeleton/vsbcode/src/features/cost/<module>/rules.ts` + `rules.test.ts`.
3. **Verify every column and option-set value against the live environment** before writing code
   that reads or writes it — `pac org fetch --xmlFile <query>`. Assumptions about Dataverse
   content have been wrong three times out of three.
4. **Port the rule into our types, keeping the skeleton's function name.** Adapt types; never
   weaken an assertion to make a test pass.
5. **Port its tests**, renumbered into our `UT-` scheme, citing the skeleton id they came from.
6. **Wire the screen** — composition only, no logic in `Screen.tsx`.
7. **Log any canvas defect found** (§3). Do not fix it.

A feature is not done until its rules have tests and the screen renders from them.

## 3. Bug policy — reproduce, log, do not fix

Decided 15 Sep: **build it as the canvas has it, bug for bug.** When a defect is found:

- reproduce the canvas behaviour exactly;
- add it to `01-BUGS-FOUND.md` with the canvas file and line;
- mark the code `// SOURCE DEFECT: <id>` and, where the skeleton has one, keep its
  `…CanvasParity` twin;
- do **not** change behaviour without explicit approval.

This applies even to the data-loss ones (A-1, the bulk-edit contract deletion). They are logged
and reproduced. The decision to fix any of them is the client's, taken separately.

## 4. What exists, measured

| Module | Skeleton rules | Skeleton tests | Ours today |
|---|---|---|---|
| CAPEX | 1,517 ln · **72 exports** | 91 | `gridRows.ts` + `writeSet.ts` — 214 ln · 5 exports |
| Add Cost from Table | 554 ln · 30 | 40 | **nothing** — route is an `EmptyState` |
| OPEX | 798 ln · 52 | 57 | shared `periods/rules.ts` — 470 ln · 34, not OPEX-specific |
| Land Lease | 723 ln · 45 | 48 | same shared file; `Allocation`/`OTP` always blank |
| Contracts | 884 ln · 37 | 63 | `contracts/rules.ts` — 956 ln · 63 ✅ |

**236 rules and 299 tests exist in the skeleton. We have ported roughly 70 of them, nearly all
into Contracts.**

Measured facts about VSBCloud_Dev, for planning (15 Sep, via `pac org fetch`):

- 80 CAPEX accounts (76 active). `vsb_accountcategory` is empty on 77 — the tree is the only
  route to a category.
- 5,517 CAPEX contracts environment-wide; **12** on project `Wirmighausen`
  (`9f5aade5-2b7c-ef11-ac20-000d3a466ab7`), with **698** cost rows. Data volume is not a
  performance problem at this scale.
- `vsb_description`, `vsb_distributionfrequency`, `vsb_byclusterjson` and
  `vsb_bystartenddatejson` are **null on existing contracts**. Any panel field bound to them
  populates empty until a save writes them.
- `vsb_costtype`: None 952850000 · DevCo 952850001 · SPV 952850002. The skeleton's
  `CHOICE_ADMIN` has DevCo and SPV **swapped** — use `CHOICE_COST` only.

## 5. Stage A — DEVEX/CAPEX

The largest screen: 355 controls, 20,178 lines of Power Fx, 72 skeleton rules. Taken in the order
the client set: the grid, then the Add/Edit panel, then comments, then Add Cost from Table.

### A1 · Grid and toolbar
Ported: `buildGrid` (as `gridRows`), `capexWriteSet`, `contractLabel`, `resolvePayer`.

To port: `costAllowedStart` · `navigationWindow` · `clampSelectedYear` · `projectPeriods` ·
`canGoPreviousYear` / `canGoNextYear` · `visibleCategories` · `isSummaryTab` · `monthIndex` ·
`flattenCosts` · `contractTotals` · `rollupTotals` · `grandTotalRow` · `contractSubLabel` (ours
shows `[SPV]` only; the canvas adds `Link to Cluster N`) · `formatCostCell` · `summaryRows` ·
`activeWtgCount` · `capexCommands` · `CAPEX_TOOLBAR_LABELS` · `CAPEX_GRID_COLUMNS`.

Blocking gap: **cluster durations are an empty array** in our `PcfGrid` *and* in the skeleton
(`Screen.tsx:156`). `navigationWindow`, `eligibleClusters`, `clustersHavingCost` and
`buildStandardOptions` all degrade silently without them. Wire six `ClusterDuration` rows from
the project's milestones, with `synthesiseClusterDates` for 1–4, before anything that depends on
clusters.

### A2 · Add / Edit Costs panel
Ported: `totalCostForPercent` (inline), `DESCRIPTION_MAX_LENGTH`, `capexWriteSet`.

To port: `distributionSchedule` · `equalDistributionAmounts` · `planEqualDistribution` ·
`individualDistribution` · `canPersistIndividual` · `totalCostMax` · `validateTotalCost` ·
`validateMonthYear` · `canSaveContract` · `describeDescriptionError` · `byClusterJson` ·
`parseByClusterJson` · `parseStartEndJson` · `applyDescriptionChange` ·
`needsClusterLinkageConfirmation` · `clustersHavingCost` · `paidToggleNeedsConfirmation` ·
`resolvePaidTarget` · `planDeleteContract`.

Known mismatch to settle first: **`distribute()` works in cents with `Math.floor`; the canvas
uses `RoundDown(span / freq, 0) + 1` for the count and `RoundDown(total / n, 0)` for the amount,
on whole currency units.** Every distributed figure differs. Port
`distributionSchedule` + `equalDistributionAmounts` and delete our version.

Missing from our model entirely: `vsb_distributionscheme` (`% Values` / `Absolute Values`) — the
canvas panel has the radio, we have neither the field nor the control. Also the two confirmation
dialogs (cluster-link, cost-paid-by change) with their exact multi-condition text.

### A3 · Comments panel
Nothing ported. Our comments are `string[]`; the canvas is a threaded model on
`vsb_capexcommentses`.

To port: `commentThreads` · `renumberThreads` · `resolveThread` · `planDeleteRoot` ·
`sortComments` · `gridCommentFlags` · `paymentDateCommentsAllowed` · `canSaveComments` ·
`commentEditable` · `commentName` · `truncateComment` · `COMMENT_MAX_LENGTH` (250, done).

Data shape is verified: `vsb_comment` (250) · `vsb_commenttype` (1 General, 2 Payment date) ·
`vsb_capexcontract` · `vsb_capexcost` (where the year/month comes from — there is no year column
on the comment) · `vsb_parentcomment` / `vsb_rootcomment` · `vsb_resolved` · `vsb_resolvedby`
(→ **`aaduser`**, not `systemuser`). UI states are captures 20–23.

Carry over from the canvas: the client-side `LocalID` identity for unsaved drafts, and
`SequenceNumber` persisted into `Name` (**SOURCE DEFECT N-4** — renumbering after a delete
rewrites stored names; reproduce and log).

### A4 · Add Cost from Table
Nothing ported; the route is an `EmptyState`. All 30 rules and 40 tests to port, plus the grid
itself rebuilt in React (the PCF is `any`-typed with a dead validation flag — reproduce its
*behaviours*, not its code): pivot/un-pivot by contract-year, `"standard"` in the description
locks the row, account-header rows grey and locked, fill-down on save, DevCo/SPV pre-fill from
the nearest account header, non-numerics silently blanked, full-worksheet paste trims the sheet.

**SOURCE DEFECT A-1 lives here** — the orphan-contract deletion guard is commented out in the
canvas, so a save can delete contracts that still carry historical costs. Per §3: reproduce,
log, use `planContractDeletionsCanvasParity`.

## 6. Stages B–E

### Stage B · OPEX and Other OPEX (52 rules, 57 tests)
Split `features/periods` into shared period primitives plus OPEX-specific rules. O&M is scoped by
generator/device type, Other OPEX by account/sub-account. Order comes from master data, not
alphabetically — ours is a placeholder. Period chains, inherited next start date, numbering,
duration badges, cascade from period 1 to children, standard-assumption import, inflation
resolution, the Italy-only region→zone map, standard-row locks, exact delete text.

### Stage C · Land Lease (45 rules, 48 tests)
Contract header writable only through Period 1; progression stops at Period 9 and must not wrap;
three one-time payments; Secured and all-WTG allocation; allocation diffing including names;
technology-gated visibility; cascade delete across allocations, periods and costs. This is what
fills the permanently-blank `Allocation` and `OTP` columns.

### Stage D · Contracts (mostly done)
Layout deltas from captures 15–18: command bar into the content area, card accent/radio/chevron,
four-column read-only grid, Payment Targets sub-toolbar, `Sun, Apr 13, 2025` dates, the tri-state
DevCo tree with its amber "used by another contract" state, the narrow Project Rights panel.
Margin seed comes from the **Fabric SQL** source, not Dataverse — needs a connection reference.

### Stage E · Shell, Overview, loading
Nine of ten overview commands are hard-disabled by one expression
(`project-overview/Screen.tsx:199`) and privileges are hard-coded `true` — resolve D1. `pmAppUrl`
is computed and never rendered; the canvas puts it on the logo click. Both loading states exist
and both must: the branded splash (`guide3` r04 — VSB mark, "energy for you", "Project Costs",
progress rule) and the header-shell spinner (r05).

## 7. Verification

Per stage: `npm run typecheck`, `npm test`, `npm run build`, `npm run lint` clean, test count up
and never down. Then the two that actually prove parity:

- **Side-by-side** against the named capture at 1919×1018.
- **A walkthrough in the deployed player** — every command, panel and overlay on that screen.

A stage is done when its skeleton rules are ported with tests, its screen renders from them, and
the walkthrough passes. Not before.

## 8. Deployment

App `Project App` `807a2fba-665c-40f3-b158-ffe822aa7da4` in `VSBCloud_Dev`, solution
`VSBCloudCodeAppsMigration`. Push with
`pac code push --solutionName VSBCloudCodeAppsMigration` — **the flag is a no-op for an app that
already exists outside a solution, so it only worked because the app was re-pushed after the
solution existed.** Record build mode (live vs demo) in the tracker's deployment log at every
push; a live build over a demo build removes every cost screen's data, and that is invisible from
the outside.

`vsb_ProjectCostsAppID` stays pointed at the canvas app until parity is signed off.

## 9. Open decisions

D1 privileges · D3 `Margin = No` · D6 transactional contract save · D12 delete-project.
D2 is answered: the BoP margin source is Fabric SQL, not Dataverse.

Unresolved technical question carried from Stage A: the SDK has no changeset, so every multi-row
save can half-apply. The skeleton ships five Custom APIs and five C# plugins in `solution/`,
including `CreateCapexStandardContract.cs`. Whether we deploy those is a client decision, and
standard contracts cannot work without one.
