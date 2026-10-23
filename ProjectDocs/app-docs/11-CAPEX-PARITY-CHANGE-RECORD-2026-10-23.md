# DEVEX/CAPEX parity — change record, 23 Oct 2026

What was changed, why, what is still open, and whether a local run shows it.

**Status: nothing is committed, merged or pushed. Nothing is approved.** Every behavioural item
is recorded as *proposed* in `02-OPEN-DECISIONS.md` **D38**. This file is the record of the work,
not a sign-off.

| | |
|---|---|
| Branch | `RounakDev1`, working tree only |
| Canvas source read | solution **1.21.709** (`ProjectDocs/_extracted/msapp/projectcosts/`) |
| Deployed DEV app | **unchanged** — still the `6a73ffa` build of 22 Oct (D37) |
| Live Dataverse click-through | **not done** — `MIGRATION-STRATEGY.md` step 9 still owed |
| Companion documents | `gap-analysis/cost-capex-costs.md` (full gap report), `02-OPEN-DECISIONS.md` D38, `01-BUGS-FOUND.md` C-7 / D-7 |

---

## 1. Does this show up in a local `pa app run`?

**Yes for a local run, no for the deployed app.** The distinction matters:

| Where | Reflects these changes? | Why |
|---|---|---|
| `npm run dev` / `pa app run` + `pac code run` | **Yes** | Vite serves and transforms from `src/` on request; all eight changed files are under `src/` |
| The DEV app in VSBCloud_Dev (`807a2fba-…`) | **No** | It is the `dist/` of commit `6a73ffa`. Nothing was rebuilt or pushed |
| A colleague's checkout | **No** | The changes are uncommitted working-tree edits |

### Caveat found on 23 Oct — restart before you judge what you see

At the time of writing, a dev server and a pac host were already listening on **:3000** and
**:8080**, both started **22 Oct 22:34** — i.e. in a previous session, long before these edits.
A 13-hour-old Vite process on a OneDrive-synced path is exactly the situation where the file
watcher can be stale, so a page served from it may be a mix of old and new modules.

Before evaluating anything, stop both and restart:

```powershell
# stop the two stale node processes listening on 3000 / 8080, then, from ProjectCosts-CodeApp:
npm run dev                                    # :3000, strictPort
pac code run --appUrl http://localhost:3000    # :8080
```

Then open the `https://apps.powerapps.com/play/e/<env>/app/local?_localAppUrl=…&_localConnectionUrl=…`
URL that `pac` prints — **not** `http://localhost:3000`, which carries no Power context and
therefore has no user and no data.

### What you should actually be able to see, on a CAPEX tab of a real project

1. **Add/Edit Costs panel → Equal Distribution → By Start and End Date.** The two captions now
   read **"Start Date Distribution"** and **"End Date Distribution"**.
2. **Distribution Frequency dropdown** now offers **five** options — 1, 2, 3, 6, 12 months.
   "2 months" was previously impossible to pick.
3. **Delete on a contract row.** The dialog is now titled **"Delete Contract"**, the description
   names the contract and its sub-account in quotes, the buttons read **Confirm** / **Cancel**,
   and the Confirm button is the normal blue one, not red.
4. **Tab strip and Summary rows** are now read from Dataverse rather than from a literal. On
   today's `VSBCloud_Dev` data this should look **identical** — the hard-coded list still matches
   the org. A visible difference here means an admin has added or renamed a category, and is
   worth investigating rather than assuming a bug.

### What you will *not* see without provoking it

The delete-safety change (§2.2) is invisible on a successful delete. It only shows when Dataverse
**refuses** — a 403, or a cascade restriction. Before the change the refusal was swallowed and the
UI behaved as though the delete had worked. To exercise it you need an account without delete
privilege on `vsb_capexcost` / `vsb_capexprojectcontract`, or a restricted relationship.

---

## 2. Changes performed

Eight source files, one new test file, four documentation files.

```
 ProjectCosts-CodeApp/src/data/capexWrites.ts                       | 27 ++-
 ProjectCosts-CodeApp/src/data/costBook.test.ts                     | 12 ++
 ProjectCosts-CodeApp/src/features/cost/capex-costs/Screen.test.tsx | 113 +++++
 ProjectCosts-CodeApp/src/features/cost/capex-costs/Screen.tsx      | 99 ++++--
 ProjectCosts-CodeApp/src/features/cost/capex-costs/panelRules.ts   | 57 ++++
 ProjectCosts-CodeApp/src/features/cost/capex-costs/rules.test.ts   | 24 ++-
 ProjectCosts-CodeApp/src/features/cost/capex-costs/rules.ts        | 17 +-
 ProjectCosts-CodeApp/src/features/cost/costing/useCostBook.ts      | 21 ++-
 ProjectCosts-CodeApp/src/data/capexWrites.test.ts                  | NEW
```

### 2.1 H-1 · Distribution Frequency was missing "2 months"

**File:** `features/cost/capex-costs/rules.ts`

The canvas control `drp_AddContract_RightPanel_PaymentFrequency_1` binds
`Items: =colDistributionFrequency`, and `colDistributionFrequency` is declared in the Cost app's
`App.pa.yaml` under `Formulas` with **five** rows — ID 1→1, 2→2, 3→3, 4→6, 5→12 months. This app
declared four.

```diff
-/** `colDistributionFrequency` — the canvas offers these four on this panel. */
-export const FREQUENCY_OPTIONS = [1, 3, 6, 12] as const;
+export const FREQUENCY_OPTIONS: readonly number[] = DISTRIBUTION_FREQUENCY.map((f) => f.value);
```

Two defects in one. The **functional** one: a bi-monthly CAPEX contract could not be created, and
a contract stored with `vsb_distributionfrequency = 2` had *no matching option at all* — the
canvas `DefaultSelectedItems` matches on `Value`, not `ID`. The **structural** one: this was a
second, diverging copy of a list that already existed as `DISTRIBUTION_FREQUENCY` in
`data/dataverseNames.ts`, which OPEX and Land Lease both use correctly — a CONVENTIONS rule 17
violation. Deriving from the shared definition means the two can no longer drift.

`Screen.tsx` needed no edit: the export keeps its name and `readonly number[]` shape.

**Tests:** `UT-CAPEXR-114` (the five values, and equality with the shared list),
`UT-CAPEXR-115` (`frequencyLabel(2) === "2 months"`).

### 2.2 H-2 · Delete paths swallowed Dataverse refusals

**File:** `data/capexWrites.ts` — three call sites

The generated service's `delete()` discards the `IOperationResult`, and the SDK never throws. A
403 or a cascade restriction therefore resolved **exactly like success**: the UI reported a
deleted contract, or a shrunk schedule, that Dataverse never applied. This is CONVENTIONS rule 14
and the live risk named in `KNOWN-RISKS-AND-DECISIONS.md`; every admin data module already routed
through `deleteRecord`, and CAPEX was the outlier.

```diff
-    await Vsb_capexcostsService.delete(costId);                        // saveCostLine
+    await deleteRecord("delete CAPEX cost", "vsb_capexcosts", costId);
-    if (payment.id) await Vsb_capexcostsService.delete(payment.id);    // deleteCostLine
+    if (payment.id) await deleteRecord("delete CAPEX cost", "vsb_capexcosts", payment.id);
-  await Vsb_capexprojectcontractsService.delete(plan.contractId);
+  await deleteRecord("delete CAPEX contract", "vsb_capexprojectcontracts", plan.contractId);
```

Payloads, ordering and the existing explanatory comments are unchanged.

**Tests (new file `data/capexWrites.test.ts`):** `UT-CAPEXW-001` a refused cost-row delete
rejects and stops at the refusal; `UT-CAPEXW-002` a refused contract delete rejects;
`UT-CAPEXW-003` the order stays comments → cost rows → contract.

### 2.3 M-3 · Four visible strings were invented, not transcribed

**Files:** `features/cost/capex-costs/panelRules.ts` (new `MSG` + `deleteContractDescription`),
`Screen.tsx` (consumption)

CONVENTIONS rule 7 requires visible strings to be transcribed verbatim with a citation. These
four were not:

| Canvas control / property | Canvas text | Was |
|---|---|---|
| `lbl_…_Fields_Label_17.Text` | `Start Date Distribution` | "Start Date" |
| `lbl_…_Fields_Label_18.Text` | `End Date Distribution` | "End Date" |
| `cmp_PopUp_SubaccountCostsDeletion_Confirmation.Title` | `Delete Contract` | "Delete Cost" |
| `…TextConfirmButton` | `Confirm` | "Delete", styled `destructive` |
| `…Description` | `Are you sure you want to delete the costs for "{contract}" of the selected Subaccount "{sub-account}"?` | "Delete this cost and its monthly values?" |

`Char(34)` in the canvas formula is a double quote, so both values are quoted in the sentence.
The old description named neither the contract nor the sub-account whose costs were about to go.

**On removing `destructive`:** this turned out to be *more* faithful than assumed. The canvas
component sets `IconConfirmButton: ="CheckMark"` and `IconCancelButton: ="Cancel"`, which are
already `ConfirmDialog`'s own defaults — so Confirm renders as the themePrimary button with a ✓,
exactly as the canvas does, with no extra props. `ConfirmDialog`'s own comment notes that
`destructive` "has no canvas counterpart". The canvas conveyed the risk through wording, not
colour. **This is still a product decision (D38 §3) and is reversible in one prop.**

**Two identity traps, both avoided and pinned by test:**

- The `aria-label` on the date fields is the canvas *control name*
  (`txt_AddContract_RightPanel_StartDate_1`), not the caption. `CostField` puts `label` in the
  visible span and `name` on both `aria-label` and `data-testid`, so changing a caption cannot
  move the identity — and `UT-CAPEXS-001` asserts that explicitly, so a future edit cannot
  silently re-couple them.
- The new description carries record data. That is fine for *copy* but would break rule 16 as a
  *label*. `ConfirmDialog` builds its accessible name from `aria-label={title}`, and `title` is a
  constant, so the bound data never reaches a label.

### 2.4 M-4 · Categories — now **partially** Dataverse-driven

**Files:** `costing/useCostBook.ts` (new `useCapexCategories()`), `Screen.tsx` (wiring)

The canvas builds the tab strip and Summary from
`SortByColumns(Filter(colCapexAccountCategoriesNew, Not(Name = "Overleveraging")), "vsb_order")`.
`Screen.tsx` called `categoryTabs()` and `resolveCategory(raw)` with no argument, so both fell
back to the hard-coded list — even though `rules.ts` had supported the argument all along and
`loadCapexCategories()` already existed and was tested (`UT-BOOK-047`).

Now wired through the tab strip, `resolveCategory`, the Summary rows and the comments breadcrumb.
The empty-list fallback to `CATEGORY_LABELS` already lived in `rules.ts` (so a transient query
failure cannot blank the navigation) and was reused, not reimplemented.

> **This is half the fix, and the remainder has a visible consequence.**
> `loadCostAccounts` (`data/costBook.ts:806-807`) still derives `CostAccount.category` with
> `CATEGORIES.indexOf(level1.name)` and `continue`s past any level-1 account whose name is not in
> the hard-coded list. So a category an admin adds now gets **a tab and a Summary row with no
> accounts behind them** — which reads as "configured but unused" rather than "missing". That is
> arguably a worse failure mode than the silent omission it replaced, and it is a **behaviour
> change a reviewer should weigh before approving**.
>
> Closing it means re-basing the category index off the loaded list, which moves four consumers
> at once — `accountsInCategory`, `useCostBook`'s fetch scoping, `CapexCategoryTotal.category`,
> and the `?category=` URL contract — plus a loading-state question. Deliberately out of scope
> here; tracked in D38 §4 and in the gap report's follow-ups.

### 2.5 L-6, L-7, L-8 · Divergences recorded (comments only, no behaviour change)

CONVENTIONS rule 8 requires a divergence to be marked where a reader will meet it.

- **L-6** (`Screen.tsx`, save path) — the canvas recomputes an equal distribution's cost rows only
  when `Or(locChangedByDate, locChangedDistribution, locChangedFrequency, locClusterChanged,
  loctotalCostChanged)`; this app recomputes and reconciles on **every** save. The resulting rows
  are identical — reconciliation is idempotent, and unlike the canvas it does not delete-and-
  recreate, so paid flags and payment-date comments survive — but it issues requests the canvas
  would not.
- **L-7** (`capexWrites.ts`, `deleteCostLine`) — the canvas's own
  `RemoveIf('CAPEX Costs', …)` is **commented out** (`Capex Costs Screen.pa.yaml:8122-8134`); it
  deletes comments, then the contract, and leaves the cost rows to the Dataverse cascade. This
  app deletes them explicitly, which makes the outcome identical whether the relationship is
  Cascade or Restrict.
- **L-8** (`Screen.tsx`, save path) — a canvas **SOURCE DEFECT this app silently fixes**, now
  stated: on an *Add* of an equal-distribution contract the canvas never stores `Average Payment`
  or `Linked Cluster`, because its final `Patch` resolves the contract through
  `LookUp(colCapexProjectContracts, … = locSelectedCostRow.vsb_capexaccountlistid)` and on an Add
  the selected row is the *sub-account*, so the lookup is blank. Only a later Edit fills them in.
  `saveCostLine` writes both on create.

> **Follow-up:** L-8's marker sits in `Screen.tsx`, where the defect was found, but
> `saveCostLine` in `data/capexWrites.ts` is where the two fields are actually written — a reader
> auditing the write path would not see it. Worth moving. Recorded in D38 §8.

### 2.6 Integration fix (not a parity item)

**File:** `data/costBook.test.ts`

`costBook.test.ts` partially mocks `./client`. Once `capexWrites.ts` imported `deleteRecord` from
there, `UT-BOOK-030/039/040/041` failed with *No "deleteRecord" export is defined on the
"./client" mock*. Added to the mock, recording into the same `deleted` array with the same
`cost:` / `contract:` prefixes, so the existing ordering assertions read unchanged.

Note: `UT-CAPEXW-003` now partly duplicates `UT-BOOK-039` — both pin the delete order. Harmless;
worth collapsing when someone next owns these files.

---

## 3. Verification

`npm run verify`, from `ProjectCosts-CodeApp/`:

| Step | Result |
|---|---|
| `check:power` | 81 registered, **0 problems** |
| typecheck | clean |
| lint (`oxlint`) | clean |
| control-labels | **0 missing, 0 duplicate**, 47 aria-label warnings + 2 ignored (all pre-existing) |
| canvas-identities | **C1–C5 all 0**; `capex-costs` 38 ids / 38 verified / 2 derived / 15 labels compared — byte-identical to baseline |
| tests | **146 files passed (146), 3,891 tests passed (3,891), 0 failures** |
| build | `✓ built in 7.67s` |

**Final run: exit 0, fully green, zero worker flakes** — `passed + failed-to-start = 146 = total`,
so nothing was concealed (see §4 on why that reconciliation is the check that matters).

The counts reconcile exactly against the documented baseline of 145 files / 3,859 tests:
**+1 file** (`capexWrites.test.ts`) and **+32 tests** — Wave 1 nine (A1 2 + A2 3 + A5 4) and
Wave 2 twenty-three (U1 8 + U2 3 + U3 3 + U4 4 + U6 5).

### Wave 2 — the UI/UX pass (same day, after the above)

A second pass covered the popup and dialog-chrome layer, which this record's §2 does not. It
changed `components/ConfirmDialog.tsx` (opt-in `boxHeight` / `textHeight`; plain description band
corrected to top 16 / left-right 20 / bottom 0; ⓘ block squared and un-padded),
`components/LoadingOverlay.tsx` (spinner 120 px with no label), and the CAPEX
`rules.ts` / `panelRules.ts` / `Screen.tsx` (the relink dialog's single-vs-multi description, six
verbatim strings, both canvas height formulas, and a corrected four-arm `Title`).

Full detail, the UX-1 … UX-12 register and the open questions are in
`gap-analysis/cost-capex-costs.md` §5 and `02-OPEN-DECISIONS.md` **D39**. Two consequences of that
wave reach screens outside CAPEX and are recorded there: **PM Revenues** (`Screen.tsx:1302`, the
only `variant="info"` outside Cost) and the **Application Settings error MessageBar**, which now
sits flush against the actions row on 7 admin screens.

---

## 4. `UT-ADGATE-910` — investigated, and NOT broken

**Corrected 23 Oct 2026, after the Wave 2 verification run.** An earlier draft of this section
stated that `UT-ADGATE-910` (`features/admin/admin-gates-approvals/Screen.test.tsx`) failed
*deterministically*. **That was wrong, and the reasoning built on it was wrong.** The record is
kept here rather than deleted, because the mistake is instructive.

**What is actually true.** The test **passes** whenever its file runs:

| Invocation | Result |
|---|---|
| Full `npm run verify` | pass |
| Whole file, `--maxWorkers=2 --testTimeout=60000`, ×4 | 33 / 33 every time |
| `-t "UT-ADGATE-910" --maxWorkers=1 --testTimeout=120000` | fails |

It fails **only** when isolated to that single test with `-t`. In that mode its `renderScreen()`
is the first React mount in the worker, and tabster's modalizer handover races the assertion;
with the file's other 32 tests having mounted first, the global setup is warm and the dialog is
in the accessibility tree by the time the query runs.

**How the wrong conclusion was reached.** Two runs were taken as proof: one whole-file run that
failed, and one `-t` run that failed. Only the `-t` result is reproducible. The whole-file
failure was itself the load-sensitive flake — the very thing the section went on to warn about.
Two data points, one of them an artefact, were generalised into "deterministic".

**Status:** nothing to fix and nothing to waive. `{ hidden: true }` — the remedy
`08-SESSION-HANDOFF-2026-10-19.md` records for the 004/005/006 screen tests — would still be
correct hardening against the `-t` fragility, and this test never received it. It is D36 admin
territory and blocks nothing, so it is left alone.

### What does still hold

> **A file that fails to start is not counted as a failure, so a green-looking run can be short
> of files.** This session's Phase 0 baseline demonstrated it directly: 132 files passed, 13
> failed to start, and 132 + 13 = 145, the full count. The run reported "132 passed" and exit 1.
> Any "verify is green" claim in this repo is only as strong as the **file count** beside it.

What does **not** follow from that, and was previously asserted here without evidence, is that
the 22 Oct green run in `10-SESSION-HANDOFF-2026-10-22.md` had *concealed* this particular test.
There is no evidence either way, and the test is not in fact failing. The mechanism is real; this
was not an instance of it.

---

## 5. Gaps identified but **not** closed

| Id | Gap | Status |
|---|---|---|
| **M-4 (rest)** | `loadCostAccounts` still maps accounts to categories via `CATEGORIES.indexOf` — admin-added category gets an empty tab | Partial; follow-up scoped in D38 §4 |
| **M-5 / R2** | 1.21.753 uses `RoundDown` for `% Values`; this app uses `Round` | Open — needs PO, newer than the YAML on disk |
| **M-5 / R3** | 1.21.753 hands the flooring remainder to the latest month carrying a positive amount | Open — needs PO |
| **M-5 / R4** | 1.21.753 opens a contract in percent mode only when `Total Cost <> 0` | Open — needs PO |
| **Q6** | The Add/Edit panel's year span (`locProjectDuration = endYear − startYear + 4`, `locProjectStartyear = startYear − 1`) could not be reconciled from the canvas alone | Open question in the gap report |
| **UT-ADGATE-910** | Not broken — passes whenever its file runs; fragile only under `-t` isolation (§4) | Nothing to fix or waive; `{ hidden: true }` would still be useful hardening |
| **Rendered dialog geometry** | Every Wave 2 height is verified only as "the right number reaches the right prop". jsdom cannot measure it — Fluent's `.fui-DialogSurface { height: fit-content }` wins in its flat cascade | **Owed to a real browser** (§8) |
| **PM Revenues ⓘ dialog** | Collateral of the shared-component fix; green but unseen | Owed a visual check |
| **Admin error bar** | Faithful `paddingBottom: 0` removed the gap above the actions row | Open product question, D39 |
| **L-8 marker** | Sits in `Screen.tsx`; belongs in `capexWrites.ts` | Recorded, D38 §8 |
| **`loadCapexCategories` doc** | Its comment at `costBook.ts:718-724` now describes the old behaviour | Not corrected |
| **Comments panel** | Not re-examined in this pass beyond confirming canvas test ids are present | Out of scope |
| **`GridRenderer.js`** | The vendored PCF renderer is outside both label gates; identities maintained by hand | Pre-existing, documented |

Gap severities, evidence and the full 65-row requirements table are in
`gap-analysis/cost-capex-costs.md` (51 COVERED / 7 PARTIAL / 2 MISSING / 5 WRONG).

---

## 6. What needs a decision before any of this is committed

From **D38**, all currently *proposed*:

1. **M-3** — the four verbatim strings, and whether the delete dialog keeps `destructive`.
2. **M-4** — accept the partial fix with its empty-tab consequence, or hold until the full
   re-basing is done.
3. **M-5** — the three 1.21.753 behaviour changes.
4. **Q6** — the panel year span.
5. **UT-ADGATE-910** — apply the one-line `hidden: true`, or route it to the D36 owner.

Then, per `CONVENTIONS.md`: approval → `npm run verify` → commit. And per `MIGRATION-STRATEGY.md`
step 9, **a real click-through against `VSBCloud_Dev` before this is called done** — every defect
fixed here is in the class that only a live environment confirms.

---

## 7. Rollback

Nothing is committed, so rollback is discarding working-tree changes. The code and the docs are
separable:

```powershell
# code only — keeps the gap report, D38 and the bug entries
git checkout -- ProjectCosts-CodeApp/src
Remove-Item ProjectCosts-CodeApp/src/data/capexWrites.test.ts

# docs only — keeps the code fixes
git checkout -- ProjectDocs/app-docs/01-BUGS-FOUND.md ProjectDocs/app-docs/02-OPEN-DECISIONS.md `
                ProjectDocs/app-docs/gap-analysis/README.md
Remove-Item ProjectDocs/app-docs/gap-analysis/cost-capex-costs.md
```

`ProjectDocs/app-docs/10-SESSION-HANDOFF-2026-10-22.md` also shows as modified. That edit predates
this work and was not made by it — leave it alone.

---

## 8. Owed to a real browser

**No pixel of Wave 2 has been seen by a browser or a human.** Every height is verified only as
"the right number reaches the right prop" — which is necessary but is not parity. jsdom cannot
settle it: Fluent's own `.fui-DialogSurface { height: fit-content }` wins in jsdom's flat cascade,
so a computed height assertion there is meaningless. Padding, colour and border-radius *are*
sound in jsdom and are covered.

These need the CDP technique `10-SESSION-HANDOFF-2026-10-22.md` records — a throwaway page under
the gitignored `out/`, served by Vite, driven over Edge:

| # | Measure | Expect |
|---|---|---|
| 1 | Relink dialog `DialogSurface` height at 1 / 2 / 3 messages | **200 / 250 / 280** |
| 2 | Relink description band at 1 / 2 / 3 messages | **60 / 120 / 150** |
| 3 | Paid dialog surface and band | **200** and **75** |
| 4 | Gap between the admin error MessageBar's bottom and the actions row's top | currently **0 px** — the judgement call |
| 5 | PM Revenues ⓘ dialog (`Screen.tsx:1302`) | squared, un-padded ⓘ block — visual check |

Also correct in source but **untested**, so a future edit could change any of them silently:
header height 42 px, actions row 60 px, Cancel width 96 px, scrim `rgba(0,0,0,.10)`, card
`Min(450, …)`, ⓘ fill `#E1ECF4`. Four assertions in `ConfirmDialog.test.tsx` would close it.

> **Do not measure against the dev server currently on :3000.** Those processes started
> 22 Oct 22:34, before any of this work. A stale module graph yields a confidently wrong number,
> which is worse than no number. Restart both first.
