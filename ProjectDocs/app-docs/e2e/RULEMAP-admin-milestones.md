# Rule map: Admin Milestones (Power Fx vs Code App TypeScript)

Pilot screen of the E2E parity suite (`ProjectDocs/instructions/E2E-PARITY-PROMPT.md`, section 5a). Canvas source:
`ProjectDocs/_extracted/msapp/projectmanagement/Src/Admin Milestones Screen.pa.yaml` (AMS; canvas solution 1.21.709 on disk).
Code: `ProjectCosts-CodeApp/src/features/admin/admin-milestones/` (`rules.ts`, `constants.ts`, `Screen.tsx`).

Written 28 Oct 2026 from a read of the YAML and `rules.ts`. Canvas formulas are quoted from the live lines only (commented-out ones skipped, CONVENTIONS rule 10).
"UT" is the existing Vitest file; "Playwright" is a test in `ProjectCosts-CodeApp/e2e/milestones.codeapp.spec.ts`.
**Canvas run done on 29 Oct 2026** (`E2E-PARITY-REPORT-2026-10-29.md`): the rules A9, A10, B2, B3, C1 to C7 are confirmed against the real Canvas app, and the divergences C2, C4 and A5/A6 behave as marked. **Code app side proven in a browser on 28 Oct 2026** (6 of 7 tests pass; see `E2E-PARITY-REPORT-2026-10-28.md`). **Not yet proven against the running Canvas app**: that needs the Canvas URL and a sign-in. Until then the Canvas side of every row is the YAML, not a browser run.

## A. Data and display

| # | Canvas control.property | Live Power Fx | Code location | UT | Playwright | Status |
|---|---|---|---|---|---|---|
| A1 | `Admin Milestones Screen.OnVisible` | `ClearCollect(colMilestoneStandardAssumptions, … AddColumns(Countries, …, IsFolded, true) … SortByColumns("Order", Ascending))` | `toMilestoneCountries`, `sortCountries` (`rules.ts:39,49`) | rules.test | E2E-MILESTONES-002 | Divergent, marked: only ACTIVE countries (`useActiveCountries`) |
| A2 | `gal_Countries….Items`, `IsFolded: true` | every country starts folded | `Screen.tsx` `openItems = []` | Screen.test | E2E-MILESTONES-002 | Matched |
| A3 | `lbl_ClusterName_….Text` | `ThisItem.Name` | `Screen.tsx` section title | Screen.test | E2E-MILESTONES-002 | Matched |
| A4 | `gal_MilestonesStandardAssumptions_AdminScreen.Items` | `Sort(GroupBy(Filter('Milestones Standard Assumptions', Country.Country = GUID(lbl_CountryGuid….Text)), Technology, Techs), vsb_technology, Ascending)`; rows "average duration [months]" and "success rate [-]" | `groupAssumptions` (`rules.ts:95`) | rules.test | E2E-MILESTONES-003 | Matched |
| A5 | `lbl_Cluster1Value…` to `lbl_Cluster4Value…` | `$"{Duration}\n{SuccessRate}"`, raw | `matrixCells`, `formatValue` | rules.test | E2E-MILESTONES-003 | Divergent, marked: locale-formatted, blank shows "-" |
| A6 | `lbl_FidValue…` | duration over literal 1; blank duration `Coalesce(Duration, 0.75)` | `matrixCells` (`fid`) | rules.test | E2E-MILESTONES-003 | Divergent, marked: blank FID shows "-" (product decision) |
| A7 | `lbl_Cluster5Value…` | `$"{Duration}\n1"` (the stored success value is ignored) | `matrixCells` (`cluster5`) | rules.test | E2E-MILESTONES-003 | Matched |
| A8 | `lbl_OperationalLifetimeValue…`, `lbl_SalesStartDateValue…`, `lbl_SalesCompletionDateValue…` | `Coalesce(Text(record.Duration), "-")` and `Coalesce(Text(record.SuccessRate), "-")`; Sales cells show "-" on the second line | `matrixCells` | rules.test | E2E-MILESTONES-003 | Matched |
| A9 | Header labels (Technology, Cluster 1 to 5, FID, Operational Lifetime, Sales Start, Sales End) in a 32 px `#FAFAFA` strip | literal texts | `MATRIX_COLUMNS`, `MATRIX_TEXT` | rules.test | E2E-MILESTONES-003 | Matched |
| A10 | Matrix text sizes: technology ExtraLarge, sub-labels and values Large (modern Text, px) | 14 px, 12 px, 12 px | `TYPOGRAPHY` | rules.test | E2E-MILESTONES-003 | Matched after D68 (28 Oct) |

## B. Commands and gates

| # | Canvas control.property | Live Power Fx | Code location | UT | Playwright | Status |
|---|---|---|---|---|---|---|
| B1 | `cmd_…CommandBar.Items`, Edit | `ItemEnabled: true` | `Screen.tsx`: `enabled: canEdit && groups.length > 0 && !preparing` | Screen.test | E2E-MILESTONES-004 | Divergent, marked: needs the admin rule and at least one stored row |
| B2 | `cmd_…CommandBar.Items`, Apply | `ItemEnabled: false` | not rendered | Screen.test | E2E-MILESTONES-001 | Divergent, marked: removed (D67) |
| B3 | `CommandBar1`, Apply All | `DisplayMode.Disabled` | not rendered | Screen.test | E2E-MILESTONES-001 | Divergent, marked: removed (D67) |
| B4 | `cmd_….OnSelect`, Edit | `UpdateContext({locSelectedMilestoneAssumptions: Filter('Milestones Standard Assumptions', Country.Country = ThisItem.Country)}); locIsVisibleMilestoneAssumptionsRightPanel: true` | `openEdit` | Screen.test | E2E-MILESTONES-004 | Divergent, marked: refetches first; a failure shows a message and does not open |
| B5 | Screen entry (no check on the screen) | the nav item is hidden unless `Or(IsApplicationAdministrator, IsControllerOwnData)` | `useAdminAccess` | Screen.test | E2E-MILESTONES-007 | SOURCE DEFECT documented; a client-side gate is added |

## C. Edit panel validation

| # | Canvas control.property | Live Power Fx | Code location | UT | Playwright | Status |
|---|---|---|---|---|---|---|
| C1 | `lblAdmin_ProjectGates_Approvals_Form_Title_2.Text` | `$"Edit Milestones for {LookUp(Countries, …).Name}"` | `MSG.panelTitle` | EditMilestonesPanel.test | E2E-MILESTONES-004 | Matched |
| C2 | `txt_…Durations_<field>_Input.OnChange` | `!IsMatch(Self.Value, "^\d+$")` gives `"invalid duration"` | `validateDuration` (`rules.ts:189`) | rules.test | E2E-MILESTONES-005 | Divergent, marked: also the column maximum (100 / 1000), and spaces are trimmed |
| C3 | `lbl_…Durations_InvalidMessage` | text "Enter a positive value without decimals", visible while any cell is `"invalid duration"` | `MSG.durationInvalid`, `evaluatePanel` | EditMilestonesPanel.test | E2E-MILESTONES-005 | Matched; 0 is accepted although the text says "positive" (canvas parity, D21) |
| C4 | `txt_…SuccessRates_<field>_Input.OnChange` | `And(Not(IsBlank(v)), fn_Numeric_MS.IsTwoDecimal(v), fn_Numeric_MS.InRange(v, 0, 1))` (the `IsMatch` variant is commented out) | `validateSuccessRate` (`rules.ts:206`) | rules.test | E2E-MILESTONES-005 | Divergent, marked: "." and "," both accepted (the canvas used `Language()`) |
| C5 | `lbl_…SuccessRates_InvalidMessage` | text "Enter a value between 0 and 1 with a maximum of 2 decimals" | `MSG.rateInvalid` | EditMilestonesPanel.test | E2E-MILESTONES-005 | Matched |
| C6 | Input error state (`BorderThickness`, `BasePaletteColor`) | red while it fails, including a blank stored value on open | `evaluateCell` | rules.test | E2E-MILESTONES-005 | Divergent, marked: only a changed cell is validated |
| C7 | `pcf_but_…_Save.DisplayMode` | `If(Durations_InvalidMessage.Visible || SuccessRates_InvalidMessage.Visible || IsEmpty(col_MilestoneAssumtionsUpdates…), Disabled, Edit)` | `evaluatePanel.canSave` | rules.test | E2E-MILESTONES-005 | Matched |
| C8 | `but_…_Buttons_Reset` (hidden, run by Close, Cancel and Save through `Select()`) | `Clear(col_MilestoneAssumtionsUpdates); Reset(both galleries); locSelectedMilestoneAssumptions: []` | `closePanel` drops the draft | Screen.test | E2E-MILESTONES-006 | Matched; a dirty close first asks "Discard changes?" (new, no canvas text) |

## D. Save

| # | Canvas control.property | Live Power Fx | Code location | UT | Playwright | Status |
|---|---|---|---|---|---|---|
| D1 | `pcf_but_…_Save.OnChange`, loading text | `$"Milestone Standart Assumptions for '{Name}' will be saved, please wait..."` | `MSG.saving` | Screen.test | not automated (writes data) | Divergent, marked: "Standart" typo corrected, original recorded |
| D2 | Patch payload | `ForAll(Patch('Milestones Standard Assumptions', Assumption, If(!IsBlank(LookUp(varUpdates, … field = "Cluster 1").value), {'Cluster 1': Value(…)})))` for every row, then the panel always closes | `buildPatches`, `useSaveMilestones` | rules.test, writes.test | not automated (writes data) | Divergent, marked: only changed rows and columns; on failure the panel stays and lists what saved |
| D3 | Owning Business Unit, flows and plugins | none written; `SynchronizeStandardAssumptionCosts` is only called from commented-out Apply code | n/a | `rules.ts` header | n/a | Matched |

## E. Counts

- Rules mapped: 26 (A 10, B 5, C 8, D 3).
- Matched: 13. Divergent and marked: 13 (A1, A5, A6, B1 to B5, C2, C4, C6, D1, D2).
- Missing in code: 0.
- Extra in code (all marked DIVERGENCE, CONVENTIONS rule 19): the loading, empty, stale-data and Edit-refetch states, the duplicate-row warning (`duplicatesWarning`) and the save toasts.
- Canvas formulas with no code mapping: none found.
- `rules.ts` functions with no canvas source: `duplicatesWarning`, `saveFailureMessage` (both marked as new).
