# Rule map: Land Lease (Power Fx vs Code App TypeScript)

Phase 1 of the Land Lease parity suite (`ProjectDocs/instructions/E2E-PARITY-PROMPT.md`, section 5a). Shape follows
`RULEMAP-admin-milestones.md`.

**Sources**
- Canvas (ground truth): `ProjectDocs/_extracted/msapp/projectcosts/Src/Land Lease Costs Screen.pa.yaml` (6,299 lines; canvas
  solution 1.21.709 on disk). Cited `PA:<line>`. The code's own comments cite the older `.txt` export as `LL:<line>`; those
  numbers do not match this file.
- Canvas components: `Src/Components/fn_Numeric.pa.yaml` (instance `fn_Numeric_LL`, PA:6293; Fix Costs calls the CAPEX
  instance `fn_Numeric_CC`), `cmp_PopUp_Confirmation`, `cmp_PopUp_Loading`. Globals: `Src/App.pa.yaml`
  (`colDistributionFrequency`, App.pa.yaml:161; the `LandLeaseKey` nav item, App.pa.yaml:111).
- Code: `ProjectCosts-CodeApp/src/features/cost/periods/landLeaseRules.ts` (rules), `LandLeaseScreen.tsx` (composition),
  routed by `src/features/cost/land-lease/Screen.tsx`; data `src/data/landLease.ts` (`loadLeaseBook`, `loadLeaseGenerators`,
  `loadLeaseAssumptions`, `loadCountryInflation`, `applyLeaseWrites`), reached through `costRepository()` and
  `features/cost/costing/useCostBook`. Numeric helpers `src/domain/numeric.ts` (`isDecimal`, `inRange`, `parseNumber`).
- Tests: `landLeaseRules.test.ts` (UT-LAND-001…129, UT-LEASE-NOSPIN-001…004, UT-LEASE-SEL-001…005),
  `LandLeaseScreen.test.tsx` (UT-LLUI-001…016, UT-LEASE-NOSPIN-005…007, UT-LEASE-BUSY-001/002, UT-LEASE-FLIGHT-001/002,
  UT-LEASE-SEL-010…012), `src/data/landLease.test.ts` (UT-LLDATA-001…013).
- Known divergences: `01-BUGS-FOUND.md` Part 1d (LL-D1…LL-D13, LL-A1), CA-7, CA-8, CA-15, CA-17; `02-OPEN-DECISIONS.md`
  D1, D49, D58, D60; `13-CODE-APP-IMPROVEMENTS-OVER-CANVAS.md` section H.

**Date:** 2 Nov 2026. **Method:** the YAML was read with layout properties stripped, every live formula quoted from it, and
commented-out code (`/* */`, `//`) skipped (CONVENTIONS rule 10). Every code reference was checked by grep in the files
above. Playwright ids `E2E-LANDLEASE-001…006` are the reserved smoke / logs / a11y / tooltips / deep-link / zoom tests;
new ids start at 007. "UT" is the Vitest id. **No browser run has been made for either app yet**; the Canvas side of
every row is the YAML.

**Status counts (97 mapped rules, A–H):** Matched **64** · Missing in code **3** · Extra in code **2** · Divergent **28**
(8 marked, 20 **unmarked**) · Not testable **8** (section 3).

Status words: *Matched*; *Missing in code* (a defect); *Extra in code* (for decision); *Divergent, marked* (a
`SOURCE DEFECT` / `DIVERGENCE` marker or a D/CA record exists); *Divergent, unmarked* (no marker; a defect under
CONVENTIONS rule 8 until decided).

---

## 2. Rule rows

### A. Load and galleries

| # | Canvas control.property | Live Power Fx | Code location | UT | Playwright | Status |
|---|---|---|---|---|---|---|
| A1 | `Land Lease Costs Screen.OnVisible` (PA:14), sub-accounts | `ClearCollect(colLandLeaseSubaccounts, Sort(AddColumns('Land Lease Subaccounts', IsFolded, true), Order, SortOrder.Ascending))` | `loadLeaseBook` (`filter: ACTIVE`), `orderedSubaccounts` | UT-LAND-005, UT-LLUI-001 | E2E-LANDLEASE-001, -007 | Divergent, unmarked: code adds `statecode eq 0`; the canvas has no state filter |
| A2 | `OnVisible`, contracts | `ClearCollect(colLandLeaseProjectCosts, Filter('Land Lease Project Costs', Project.Project = gblSelectedProject.Project))` | `loadLeaseBook` (`and(lookupEq("vsb_project", …), ACTIVE)`) | UT-LLDATA-002, -005 | E2E-LANDLEASE-007 | Divergent, unmarked: inactive contracts are hidden (same shape as D45 G2) |
| A3 | `OnVisible`, periods | `ClearCollect(colLandLeasePeriods, Filter('Land Lease Periods', 'Project Cost'.'Land Lease Project Cost' in colLandLeaseProjectCosts.'Land Lease Project Cost'))` | `loadLeaseBook` (`lookupIn("vsb_projectcost", ids)`, chunked) | UT-LLDATA-004 | E2E-LANDLEASE-008 | Matched (server-side, no state filter) |
| A4 | `OnVisible`, `colGeneratorsInProject` | `AddColumns(Filter(GeneratorInProjects, AsType(ModuleTypeInProject, GeneratorTypeInProjects).Project.Project = gblSelectedProject.Project), Label, $"{Name} - {Status}", Order, Value(Last(Split(Name, "_")).Value))`, then `Collect(…, AddColumns(Filter(… PVModuleTypeInProjects …), Label, AsType(ModuleTypeInProject, PVModuleTypeInProjects).Label))` (trimmed) | `loadLeaseGenerators`, `generatorOptions` | UT-LLDATA-006/007, UT-LAND-056 | E2E-LANDLEASE-011 | Divergent, unmarked: the two type tables are filtered `ACTIVE`, so generators of an inactive type drop out |
| A5 | `OnVisible`, allocations | `ClearCollect(colAllocatedWtgsInSelectedLandLeaseCost, Blank())`; refilled by Add Period / Edit with `Filter('Land Lease Allocation WTGS', 'Project Cost'.'Land Lease Project Cost' = locSelectedLandLeaseCost.'Land Lease Project Cost')` | `loadLeaseBook` (all allocations of the project's contracts), filtered per cost in `landLeaseFormFrom` / `planLeaseSave` | UT-LLDATA-003 | E2E-LANDLEASE-025 | Matched (read once instead of per command) |
| A6 | `gal_LandLease_Content_Subaccounts.Items`; card `Height`; `ico_…_Up_2` / `ico_…_Down_2.OnSelect` | `=colLandLeaseSubaccounts`; `Height: =If(ThisItem.IsFolded, CardHeader.Height, CardHeader.Height+CardBody.Height)` (trimmed); `UpdateIf(colLandLeaseSubaccounts, 'Land Lease Subaccount' = gal_LandLease_Content_Subaccounts.Selected.'Land Lease Subaccount', {IsFolded: Not(gal_LandLease_Content_Subaccounts.Selected.IsFolded)})` | `cards`, `toggleFold`, `SubaccountCard` (`open = !card.isFolded`) | UT-LAND-006, UT-LLUI-001 | E2E-LANDLEASE-007 | Matched |
| A7 | `con_LandLease_Content.Visible` (PA:124) | `=Not(IsBlank(gblSelectedProject))` | session `projectId` (no project, no book) | none | E2E-LANDLEASE-005 | Matched (not re-verified in code; the no-project path was not read) |
| A8 | `gal_LandLease_Content_Subaccounts_CardBody_Costs_1.Items` (PA:927) | `With({varLandLeaseCostInSubaccount: Sort(Filter(colLandLeaseProjectCosts, Subaccount.'Land Lease Subaccount' = ThisItem.'Land Lease Subaccount'), 'Created On', SortOrder.Ascending).'Land Lease Project Cost'}, Sort(Sort(Filter(colLandLeasePeriods As Period, Period.'Project Cost'.'Land Lease Project Cost' in varLandLeaseCostInSubaccount.'Land Lease Project Cost'), 'Start Date', SortOrder.Ascending), Name, SortOrder.Ascending))` | `subaccountPeriodRows`, re-sorted in `SubaccountCard` with `localeCompare(…, { sensitivity: "accent" })` | UT-LAND-011 | E2E-LANDLEASE-008 | Matched (case-insensitive name order per D49 §2; the rule function alone is case-sensitive) |
| A9 | `lbl_…_CostsTableHeader_*` (PA:454–906) | literal texts; `$"Fix Costs p.a. [{If(Not(IsBlank(gblRecordSelectedProjectCountry.'ISO Currency Code')), gblRecordSelectedProjectCountry.'ISO Currency Code', "EUR")}]"`; `$"{If(…, "Cur.")}/MWh p.a."` (and `/MW`, `/WTG`); `="Share of Revenues [%]"` | `LAND_LEASE_COLUMNS`, `landLeaseColumns` | UT-LAND-024/025, UT-LLUI-002 | E2E-LANDLEASE-009 | Matched |
| A10 | row cells, formats (PA:1144–1611) | `Text(ThisItem.'Start Date', "dd.mm.yy")`; End Date `Text(DateAdd(DateAdd(ThisItem.'Start Date', years*12 + months, TimeUnit.Months), -1, TimeUnit.Days), "dd.mm.yy")`; `$"{…'Land Lease duration years'} years"`, `$"{…months} months"`; `Text(…'Fixed Costs', "###,###,###,###")`; `Text(…'EUR/MWh', "###,###,###,###.0#")`; `Text(…'% of Revenues', "###,###,###,##0.00 %")` | `toLeaseGridRow`, `formatLeaseDate`, `leasePeriodEnd`, `formatDurationYears`, `formatFixCosts`, `formatEurPerMwh`, `formatPercentOfRevenues` | UT-LAND-026…031 | E2E-LANDLEASE-010 | Matched (LL-A1 non-scaling `%`, client-confirmed) |
| A11 | Secured / Allocation / OTP / Currency / Inflation cells (PA:1009–1438) | OTP `If(Not(IsBlank(varLandLeaseCost.'Due Date One-Time Payment')) && Not(IsBlank(varLandLeaseCost.'Amount One-Time Payment')), "Yes", "No")`; `If(varLandLeaseCost.AllWTGAllocated, "Yes", "No")`; `varLandLeaseCost.Secured`; `ThisItem.'Project Cost'.Currency.'Currency Name'`; inflation `If(locProjectCost.'Use Country Inflation Profile', If(gblSelectedProject.Country.Name = "Italy", "Italy - " & Substitute(gblAreaWithRegion, "Italy_", ""), gblSelectedProject.Country.Name), Text(locProjectCost.'Inflation Profile', "###,###,###.0 %"))` | `otpCell`, `allocationCell`, `securedCell`, `inflationProfileCell` | UT-LAND-032…036, UT-LLUI-003 | E2E-LANDLEASE-010 | Matched |
| A12 | row label `Color` / `Italic` / `FontWeight` (PA:981, 1000, 1632) | `Color: =If(StartsWith(ThisItem.Name,"Standard"), ColorValue(gblAppTheme.palette.themePrimary), gblAppStyles.Label.Color)`; `Italic: =StartsWith(ThisItem.Name,"Standard")`; Description `FontWeight: =If(ThisItem.Period='Land Lease Period'.'Period 1', FontWeight.Bold, FontWeight.Normal)` | `isStandardPeriodName`, `toLeaseGridRow` (`standard`, `bold`), `useStandardValueClass` | UT-LAND-037/038 | E2E-LANDLEASE-010 | Matched (CONVENTIONS rule 20) |
| A13 | `img_…_RadioSelection_2.Image`; `inf_OpexCost_AlignWithDuration_2.Visible` (PA:1786) | `ImageName = If(ThisItem.'Land Lease Period' = locSelectedLandLeasePeriod.'Land Lease Period', "CircleDotBlue", "CircleEmpty")`; `Visible: =false` (the `And(…)` is commented out) | row `<input type="radio" checked={row.selected}>`; no info button rendered | UT-LLUI-005 | E2E-LANDLEASE-012 | Matched |

### B. Commands and gates

| # | Canvas control.property | Live Power Fx | Code location | UT | Playwright | Status |
|---|---|---|---|---|---|---|
| B1 | `btn_OpexCosts_…_CostsTableRow_TransparentButton_2.OnSelect` (PA:1752) | `If(locSelectedLandLeasePeriod.'Land Lease Period' = ThisItem.'Land Lease Period', UpdateContext({locSelectedLandLeaseSubaccount: Blank(), locSelectedLandLeasePeriod: Blank()}), UpdateContext({locSelectedLandLeaseSubaccount: gal_LandLease_Content_Subaccounts.Selected, locSelectedLandLeasePeriod: ThisItem, locSelectedLandLeaseCost: ThisItem.'Project Cost'}))` | `toggleLeaseSelection`; twin `toggleLeaseSelectionCanvasParity` | UT-LAND-039, UT-LLUI-005 | E2E-LANDLEASE-012 | Divergent, marked: SOURCE DEFECT LL-D5 (the deselect also clears the cost) |
| B2 | CommandBar `Items`, "Add Contract Type" (PA:224) | `ItemEnabled: And(DataSourceInfo('Land Lease Project Costs', DataSourceInfo.CreatePermission), If(locSelectedLandLeaseSubaccount.'Land Lease Subaccount' = ThisItem.'Land Lease Subaccount', IsBlank(locSelectedLandLeasePeriod), true), IsBlank(LookUp('Land Lease Project Costs', And(Project.Project = …, 'Is Standard Contract?' = …Yes, Subaccount.'Land Lease Subaccount' = ThisItem.'Land Lease Subaccount'))))` | `leaseCommands` (`addContractType`) | UT-LAND-107, -111, UT-LLUI-004 | E2E-LANDLEASE-013 | Matched |
| B3 | "Add Period" (PA:250) | `And(DataSourceInfo('Land Lease Periods', CreatePermission), Not(locSelectedLandLeaseCost.'Is Standard Contract?' = …Yes), Not(StartsWith(locSelectedLandLeasePeriod.Name, "Standard")), Not(IsBlank(locSelectedLandLeasePeriod)), Not(IsBlank(locSelectedLandLeaseCost)), locSelectedLandLeaseSubaccount… = ThisItem…, With({varLandLeasePeriods: Sort(Filter(colLandLeasePeriods, …), Period)}, With({varLast…: Last(…), varFirst…: First(…)}, And(locSelectedLandLeasePeriod.'Land Lease Period' = varLastLandLeasePeriod.'Land Lease Period', Or(Not(IsBlank(varFirst….'Fixed Costs')), … '% of Revenues', 'EUR/MW', 'EUR/MWh', 'EUR/WTG')))))` (trimmed) | `leaseCommands` (`addPeriod`), `firstPeriodHasRate`, `nextPeriod` | UT-LAND-103…105, UT-LLUI-006 | E2E-LANDLEASE-013 | Divergent, marked: `DIVERGENCE (product owner, 27 Oct 2026)` drops "selected is the last period"; SOURCE DEFECT LL-D1 caps Period 9. **No D-entry and no twin for the dropped clause** |
| B4 | "Add Standard Contract" (PA:298) | `And(Not(IsBlank(LookUp('OPEX & Land Lease Standard Assumptions', And(Country.Country = …, Technology = …, 'Type Of Contract' = 'Contract Types'.Landlease, 'Land Lease Subaccount'.'Land Lease Subaccount' = ThisItem…)))), IsBlank(LookUp(… 'Is Standard Contract?' = Yes …)), IsBlank(LookUp('Land Lease Project Costs', And(Project.Project = …, Subaccount… = ThisItem…))))` (the commented-out standard clause skipped) | `leaseCommands` (`addStandardContract`), `loadLeaseAssumptions` | UT-LAND-106, -113 | E2E-LANDLEASE-013 | Matched (no create-permission term, as on the canvas) |
| B5 | "Edit" (PA:338) | `And(Not(IsBlank(locSelectedLandLeasePeriod)), RecordInfo(locSelectedLandLeasePeriod, RecordInfo.EditPermission), locSelectedLandLeaseSubaccount… = ThisItem…, Not(locSelectedLandLeaseCost.'Is Standard Contract?' = …Yes), Not(StartsWith(locSelectedLandLeasePeriod.Name, "Standard")))` | `leaseCommands` (`edit`), `isStandardPeriodName` | UT-LAND-108 | E2E-LANDLEASE-013 | Matched |
| B6 | "Delete" (PA:358) | `And(Not(IsBlank(locSelectedLandLeasePeriod)), RecordInfo(…, DeletePermission), … = ThisItem…, If(StartsWith(Lower(locSelectedLandLeasePeriod.Name), "standard"), locSelectedLandLeasePeriod.Period = 'Land Lease Period'.'Period 1', Or(locSelectedLandLeasePeriod.Period = 'Period 1', With({locLastPeriod: Last(Sort(Filter(colLandLeasePeriods, …), Name, SortOrder.Ascending))}, locLastPeriod.'Land Lease Period' = locSelectedLandLeasePeriod.'Land Lease Period'))))` (trimmed) | `leaseCommands` (`del`), `isStandardPeriodNameLower`, `lastPeriod`; `lastPeriodByName` kept | UT-LAND-109, -110 | E2E-LANDLEASE-013 | Divergent, marked: `DIVERGENCE (product owner, 27 Oct 2026)`, last by period number, not by Name (LL-D4). No D-entry |
| B7 | CommandBar `OnSelect`, `"newLandLeaseContractKey"` (PA:396) | `Clear(colAllocatedWtgsInSelectedLandLeaseCost); UpdateContext({locSelectedLandLeasePeriod: Blank(), locSelectedLandLeaseCost: Blank(), locShowSecondPayment: false, locShowThirdPayment: false, locRightPanelState: "New", …, locSelectAllWTG: false, locIsVisibleRightPanelNewEditPeriod: true}); UpdateContext({locCODDate: gblSelectedProject.'Operations start date (COD)', locIsStartDateStandardAssumption: …No, locResetStartDate: true})` (trimmed) | `openAddContract`, `emptyLandLeaseForm` | UT-LAND-126, UT-LLUI-008 | E2E-LANDLEASE-014 | Matched |
| B8 | `OnSelect`, `"newLandLeasePeriodKey"` | `UpdateContext({…, locSelectedLandLeasePeriod: Blank(), locLandLeaseNextPeriod: varLandLeasePeriod, locParentLandLeasePeriod: varLandLeasePeriod, locRightPanelState: "New", …, locCODDate: Blank()})`; `locNewPeriodDesc: If(And(CountRows(Filter(colLandLeasePeriods, 'Land Lease Period' = locLandLeaseNextPeriod.'Land Lease Period' && Period = [@'Land Lease Period'].'Period 1')) = 0, IsMatch(locLandLeaseNextPeriod.Name, " - \d+", MatchOptions.EndsWith)), Left(…, Find(" - " & Last(Split(…, " - ")).Value, …) - 1) & " - " & Value(Last(Split(…, " - ")).Value) + 1, locLandLeaseNextPeriod.Name & " - 2")`; `locShowSecondPayment`/`locShowThirdPayment` from the cost; `locIsStartDateStandardAssumption: locSelectedLandLeaseCost.IsStartDateStandardAssumption` (trimmed) | `openAddPeriod` (parent = `lastPeriod(selectedContract)`), `nextPeriodName`, `landLeaseFormFrom` | UT-LAND-020…022, -128, UT-LLUI-006 | E2E-LANDLEASE-015 | Divergent, marked: `DIVERGENCE (27 Oct 2026)` in `openAddPeriod`, the parent is the contract's last period, not the selected one. LL-D3 reproduced |
| B9 | `OnSelect`, `"EditLandLeasePeriodKey"` | `ClearCollect(colAllocatedWtgsInSelectedLandLeaseCost, Filter(…))`; `UpdateContext({… locSelectedLandLeasePeriod: varLandLeasePeriod, locLandLeaseNextPeriod: Blank(), locRightPanelState: "Edit", locIsVisibleRightPanelNewEditPeriod: true})`; payments flags; `locResetStartDate: false` (trimmed) | `openEdit`, `landLeaseFormFrom`, `canvasRate` | UT-LAND-127, UT-LLUI-007 | E2E-LANDLEASE-016 | Matched |
| B10 | `OnSelect`, `"deleteLandLeasePeriodKey"` | `UpdateContext({locIsVisiblePopUpDeleteLandLeasePeriod: locSelectedLandLeasePeriod.Period <> 'Land Lease Period'.'Period 1', locIsVisiblePopUpDeleteLandLeaseCost: locSelectedLandLeasePeriod.Period = 'Land Lease Period'.'Period 1'})`; then `Select(btn_LandLease_NewEditPeriod_ResetButton)` for every key | `onCommand` → `setDeleting`, `deleteDialog`, `planLeaseDelete` | UT-LAND-099…101, UT-LLUI-011 | E2E-LANDLEASE-045 | Matched |
| B11 | `cmp_LandLease_PopUpLoading.Visible` (PA:6291) | `=locIsVisiblePopUpSpinner` (a full-screen scrim while a write runs) | `guardLeaseCommands`, `writeCommandsDisabled`, `<WriteStatus testId="land-lease-write-status">` | UT-LEASE-NOSPIN-001…007, UT-LEASE-BUSY-001/002, UT-LEASE-FLIGHT-001 | E2E-LANDLEASE-046 | Divergent, marked: `DIVERGENCE (D58, PROPOSED)`, D60 (no scrim; commands guarded) |
| B12 | `DataSourceInfo(…CreatePermission)`, `RecordInfo(…Edit/DeletePermission)` | as in B2, B3, B5, B6 | `serverEnforcedProvider.forTable` / `.forRecord` in `LandLeaseScreen` | UT-LAND-111 | not automated (needs a limited-role user) | Divergent, marked: D1 ("server refuses, a 403 becomes a message") |

### C. Period panel

| # | Canvas control.property | Live Power Fx | Code location | UT | Playwright | Status |
|---|---|---|---|---|---|---|
| C1 | `lbl_LandLease_RightPanel_NewEditPeriod_BodyHeader_1.Text` (PA:2034) | `If(IsBlank(locSelectedLandLeaseCost) && IsBlank(locSelectedLandLeasePeriod), "Add Contract", IsBlank(locSelectedLandLeasePeriod), "Add Period", Not(IsBlank(…)) && locSelectedLandLeasePeriod.Period<>'Land Lease Period'.'Period 1',"Edit Period", Not(IsBlank(…)) && …Period='Land Lease Period'.'Period 1',"Edit Contract") &" - "&locSelectedLandLeaseSubaccount.Name` | `leasePanelTitle` | UT-LAND-017, UT-LLUI-007/008 | E2E-LANDLEASE-014…016 | Matched |
| C2 | `txt_LandLease_RightPanel_NewEditCost_BodyContent_Description_1` (PA:2204–2214); asterisk (PA:2275) | `DisplayMode: =If(locSelectedLandLeasePeriod.Period='Land Lease Period'.'Period 1' \|\| IsBlank(locSelectedLandLeaseCost), DisplayMode.Edit, DisplayMode.Disabled)`; `MaxLength: =55`; `Value: =If(locRightPanelState="New",locNewPeriodDesc,locSelectedLandLeasePeriod.Name)`; asterisk `Visible: =IsBlank(locSelectedLandLeasePeriod)` | `CostField name="txt_…_Description_1"`, `headerEditable`, `LEASE_DESCRIPTION_MAX_LENGTH`, `landLeaseFormFrom` | UT-LAND-015, -128, UT-LLUI-009 | E2E-LANDLEASE-015 | Matched |
| C3 | `dte_LandLease_RightPanel_NewEditCost_BodyContent_StartDate_1.SelectedDate` (PA:2350) | `Coalesce(If(IsBlank(locSelectedLandLeaseCost) \|\| locResetStartDate, locCODDate, Not(IsBlank(locSelectedLandLeaseCost)) && Not(IsBlank(locSelectedLandLeasePeriod)), Coalesce(locCODDate, locSelectedLandLeasePeriod.'Start Date'), locRightPanelState = "New", Coalesce(locCODDate, DateAdd(locParentLandLeasePeriod.'Start Date', locParentLandLeasePeriod.'Land Lease duration years' * 12 + locParentLandLeasePeriod.'Land Lease duration months', TimeUnit.Months))), locCODDate)`; `Format: LongAbbreviated`; no `DisplayMode` | `resolveStartDate`, `DateInput format="LongAbbreviated"` | UT-LAND-040…042, UT-LLUI-008/009 | E2E-LANDLEASE-014, -015, -017 | Matched (CA-8 fixed: stays editable on later periods) |
| C4 | `dte_…_StartDate_1.OnChange` (PA:2342); `FontColor`/`FontItalic` (PA:2339–2340) | `UpdateContext({locIsStartDateStandardAssumption: 'IsStartDateStandardAssumption (Land Lease Project Costs)'.No, locCODDate: Self.SelectedDate})`; italic/blue while `locIsStartDateStandardAssumption = …Yes` | `onStartDate` in `LandLeaseScreen` sets `workingDate` and `startDate` only | none | E2E-LANDLEASE-017 | **Missing in code**: picking a date does not clear `isStartDateStandardAssumption`, so the date stays blue/italic and the flag is re-saved as Yes (rule 20) |
| C5 | `ico_ResetStartDay_NewEditCost_LandLease_1` (PA:2509–2525) | `OnChange: UpdateContext({locCODDate: gblSelectedProject.'Operations start date (COD)', locResetStartDate: true, locIsStartDateStandardAssumption: If(locSelectedLandLeasePeriod.Period = 'Period 1', …Yes, IsBlank(locSelectedLandLeaseCost) && IsBlank(locSelectedLandLeasePeriod), …Yes, …No)}); Reset(dte_…)`; `Visible: =Or(locSelectedLandLeasePeriod.Period='Land Lease Period'.'Period 1',IsBlank(locSelectedLandLeaseCost))` | `resetStartDate`, `resetStartDateVisible`, `onResetStartDate` | UT-LAND-043 | E2E-LANDLEASE-017 | Matched |
| C6 | `drp_…_DurationYears_1` (PA:2618–2646) | `Items: =ForAll(Sequence(36), {Name: ThisRecord.Value-1 & If(ThisRecord.Value-1 = 1, " year", " years"), Value: ThisRecord.Value-1})`; `DefaultSelectedItems: =If(Not(IsBlank(locSelectedLandLeasePeriod.'Land Lease duration years')), LookUp(ForAll(Sequence(36), {Name: ThisRecord.Value - 1 & If(ThisRecord.Value = 1, " year", " years"), Value: ThisRecord.Value - 1}), Value = …), Blank())` | `DURATION_YEAR_OPTIONS`, `durationYearLabel`, `defaultDurationYears`; twin `durationYearLabelCanvasParityDefault` is not used by the screen | UT-LAND-045/046 | E2E-LANDLEASE-018 | Divergent, unmarked in the screen: LL-D2 is recorded as "reproduced", but the dropdown shows the corrected label ("1 year", not "1 years"). Confirm in the Canvas run which label the canvas shows |
| C7 | `drp_…_DurationMonths_1` (PA:2556–2592) | `Items: =ForAll(Sequence(12), {Name: ThisRecord.Value-1 & If(ThisRecord.Value-1 = 1, " month", " months"), Value: ThisRecord.Value-1})`; default: stored months, else `First(varColMonths)` when years are selected, else `Blank()` | `DURATION_MONTH_OPTIONS`, `durationMonthLabel`, `defaultDurationMonths`, years `onOptionSelect` (`durationMonths ?? 0`) | UT-LAND-045, -047 | E2E-LANDLEASE-018 | Matched |
| C8 | rate inputs `Value` (PA:2996, 3122, 3254, 3385, 3516) | Fix Costs `=Text(locSelectedLandLeasePeriod.'Fixed Costs', "#0.00")`; % / EUR/MWh / EUR/MW / EUR/WTG `=If(Int(v) = v, Text(v, "#"), Text(v, "#0.0#"))` | `landLeaseFormFrom` (`money2`, `percent`), `canvasRate` in `openEdit` | UT-LAND-127 | E2E-LANDLEASE-019 | Matched (screen overrides the rules' `toFixed(2)` for the three rates) |
| C9 | `drp_…_Aggregation_1` (PA:3579–3585); asterisk (PA:3656) | `DefaultSelectedItems: =If(Not(IsBlank(locSelectedLandLeasePeriod.Aggregation)), LookUp(Choices('Land Lease Aggregation'), Value = …), LookUp(Choices('Land Lease Aggregation'), Value = 952850000))`; `Items: =Choices('Land Lease Aggregation')`; asterisk `Visible: =false` | `defaultAggregation`, `AGGREGATION_OPTIONS` (SUM, MAX, MIN), `AGGREGATION_LABELS` | UT-LAND-003, -048 | E2E-LANDLEASE-020 | Matched |
| C10 | `drp_…_DistributionFrequency_Month_1` (PA:3687–3694); `colDistributionFrequency` (App.pa.yaml:161) | `DefaultSelectedItems: =LookUp(colDistributionFrequency, Value = locSelectedLandLeasePeriod.'Distribution Frequency')`; `Items: =colDistributionFrequency` = `{1,"1 month"}, {2,"2 months"}, {3,"3 months"}, {6,"6 months"}, {12,"12 months"}` | `DISTRIBUTION_FREQUENCIES`, `defaultDistributionFrequency` | UT-LAND-049 | E2E-LANDLEASE-020 | Matched |
| C11 | dynamic asterisks: Start Date (PA:2481), Duration (PA:2726), Distribution Frequency (PA:3765) | `If(tgl_…_OneTimePayment.Checked && IsBlank(locSelectedLandLeaseCost), Or(<any of the five rate boxes not blank>), Not(IsBlank(locSelectedLandLeaseCost)) && locSelectedLandLeasePeriod.Period='Land Lease Period'.'Period 1', Or(<five rates>), true)` | `periodBlockRequired` (in `LandLeaseScreen`, not in `rules.ts`) | none | E2E-LANDLEASE-021 | Matched (the rule lives in `Screen.tsx`, against CONVENTIONS rule 5; documented at its site) |
| C12 | `ico_…_BodyheaderCancel_1.OnSelect`, `pcf_…_Cancel_1.OnChange`, hidden `btn_LandLease_NewEditPeriod_ResetButton.OnSelect` (PA:6159) | `UpdateContext({locIsVisibleRightPanelNewEditPeriod: false}); Select(btn_LandLease_NewEditPeriod_ResetButton)`; the reset button `Reset(…)`s 20 controls (Description, the five rates, Aggregation, both durations, Start Date, Area, Frequency, three toggles + two inflation toggles, Amount 1, Due Date 1, the WTG picker) | `closePanel`; the form is rebuilt by `emptyLandLeaseForm` / `landLeaseFormFrom` on every open | none | E2E-LANDLEASE-022 | Matched |

### D. Contract-header fields of the panel ("cost panel")

All header fields share the gate `DisplayMode: =If(locSelectedLandLeasePeriod.Period='Land Lease Period'.'Period 1' || IsBlank(locSelectedLandLeaseCost), DisplayMode.Edit, DisplayMode.Disabled)` → `headerEditable` (UT-LAND-015, UT-LLUI-009).

| # | Canvas control.property | Live Power Fx | Code location | UT | Playwright | Status |
|---|---|---|---|---|---|---|
| D1 | `drp_…_Currency_1` (PA:2774–2788) | `DefaultSelectedItems: =Switch(gblSelectedProject.Country.Name, "Poland", LookUp(Currencies, 'Currency Code' = "PLN"), LookUp(Currencies, 'Currency Code' = "EUR"))`; `DisplayMode: =DisplayMode.Disabled`; Save writes `Currency: drp_…_Currency_1.Selected` | `defaultCurrencyCode`, `currencyEditable`, `commit` (`form.currencyId ?? defaultCurrencyId`) | UT-LAND-048 | E2E-LANDLEASE-023 | Divergent, unmarked: the canvas re-points every header save to PLN/EUR; the code keeps a stored currency (comment in `commit`, no marker) |
| D2 | `tgl_…_BodyContent_Secured` (PA:3833–3847) | `Checked: =If(locSelectedLandLeaseCost.Secured = 'Land Lease Secured'.No, false, locSelectedLandLeaseCost.Secured = 'Land Lease Secured'.Yes, true, false)`; `Label: ="Secured"` | `securedChecked`, `securedValue` | UT-LAND-002, -063 | E2E-LANDLEASE-024 | Matched |
| D3 | `con_…_AlignWithProjectDuration_2.Visible`; `tgl_…_AllocationToAllWTGs` (PA:3861–3886) | `Visible: =Or(gblSelectedProject.Technology = Technology.PV, gblSelectedProject.Technology = Technology.Wind)`; `Checked: =locSelectedLandLeaseCost.AllWTGAllocated`; `OnCheck: =UpdateContext({locSelectAllWTG: true}); Reset(cmb_…)`; `OnUncheck: =UpdateContext({locSelectAllWTG: false}); Reset(cmb_…)` | `allocationVisible`, `allocationEditable`, `defaultAllocatedGenerators` (this contract's rows only, CA-7) | UT-LAND-053, -055, UT-LLUI-010 | E2E-LANDLEASE-025 | Matched |
| D4 | `cmb_LandLease_RightPanel_NewEditCost_BodyContent_AllocationWtg_1` (PA:3921–3959) | `DefaultSelectedItems: =If(locSelectAllWTG, colGeneratorsInProject, Filter(colGeneratorsInProject, GeneratorInProject in ForAll(colAllocatedWtgsInSelectedLandLeaseCost As AllocatedGeneratorRecord, {Value: AllocatedGeneratorRecord.'Generator In Project'.GeneratorInProject})))`; `Items: =Sort(colGeneratorsInProject, Order, SortOrder.Ascending)`; `SelectMultiple: =true`; container `Visible` PV or Wind (PA:3904) | `allocationList` (blank order last), `defaultAllocatedGenerators`, `generatorOptions` | UT-LAND-054…056 | E2E-LANDLEASE-011, -025 | Matched (order per D49 §2 screenshot; `generatorOptions` alone puts PV rows first) |
| D5 | `cmb_…_AllocationWtg_1.OnChange` (PA:3945) | `UpdateContext({locAllWTGAllocated: CountIf(Self.SelectedItems, true) = CountIf(colGeneratorsInProject, true), locSelectAllWTG: false})` (the toggle `Reset` is commented out); Save writes `AllWTGAllocated: tgl_…_AllocationToAllWTGs.Checked`, never `locAllWTGAllocated` | `onOptionSelect` sets `allWtgAllocated` from the count; `planLeaseSave` then selects every generator | UT-LAND-052 | E2E-LANDLEASE-025 | Divergent, unmarked: selecting every WTG by hand flips the toggle on and writes `AllWTGAllocated = true`; on the canvas the toggle, and the saved flag, do not change |
| D6 | `lbl_…_AllocationWtgAsterisk_1.Visible` (PA:4040) | `If(tgl_…_OneTimePayment.Checked, Or(<five rates not blank>), true)` (no contract term) | `periodBlockRequired` reused for the Allocation marker | none | E2E-LANDLEASE-021 | Divergent, unmarked (cosmetic): on Period 1 / an existing contract with One-Time Payment off and no rate the canvas shows `*`, the code does not |
| D7 | `tgl_…_InflationProfile_1` (PA:4173–4209) | `Checked: =If(locSelectedLandLeaseCost.'Use Inflation Profile' = …No, false, … = …Yes, true, false)`; `Label: ="Inflation Profile"`; `OnUncheck: =Concurrent(Reset(tgl_…_CountryInflationProfile_1), Reset(txt_…_InflationStartYear_1), Reset(drp_…_AreaInflationProfile_1), Reset(txt_…_InflationProfile_1))` | `landLeaseFormFrom` (`inflationChecked`), `inflationSectionVisible` | UT-LAND-065 | E2E-LANDLEASE-026 | Matched |
| D8 | `tgl_…_CountryInflationProfile_1` (PA:4141–4165) | `Checked: =If(locSelectedLandLeaseCost.'Use Country Inflation Profile' = …No, false, … = …Yes, true, false)`; `Visible: =tgl_…_InflationProfile_1.Checked`; its asterisk `Visible: =//If(…)` (a comment only, so blank) | `countryInflationChecked`, `LEASE_LABELS.countryInflationProfile` | UT-LAND-065 | E2E-LANDLEASE-026 | Matched |
| D9 | `txt_…_InflationStartYear_1.Value` (PA:4328); container `Visible` (PA:4261) | `Coalesce(locSelectedLandLeaseCost.'Inflation Start Year',Year(dte_LandLease_RightPanel_NewEditCost_BodyContent_StartDate_1.SelectedDate)+1)`; `Placeholder: ="YYYY"` | `inflationStartYearDefault` (on open), `emptyLandLeaseForm`, the inflation toggle's `onChange` | UT-LAND-067 | E2E-LANDLEASE-027 | Divergent, unmarked: the canvas value follows the Start Date live while nothing is stored; the code computes it once |
| D10 | `drp_…_AreaInflationProfile_1` (PA:4420–4446); container `Visible` (PA:4407) | `DefaultSelectedItems: =Distinct(Filter('Country Inflation Profiles', Area = Substitute(gblAreaWithRegion, "Italy_", "")).Area, Area)`; `DisplayMode: =//If(…)` (comment only → Edit); `Items: =Distinct(Filter('Country Inflation Profiles', Country.Country = gblSelectedProject.Country.Country).Area, Area)`; `Visible: =And(inflation.Checked, country.Checked, gblSelectedProject.Country.Name = "Italy")` | `areaInflationVisible`, `areaOptions`; default = stored `inflationCountryArea` | UT-LAND-066 | E2E-LANDLEASE-028 | Divergent, unmarked: the canvas pre-selects the project's own region; the code pre-selects the stored area (none on a new contract) and disables it with the header gate |
| D11 | `txt_…_InflationProfile_1.Value`/`Visible`/`DisplayMode` (PA:4621–4634); `txt_…_InflationProfile_2` (PA:4712–4733); label (PA:4661) | `If(And(Not(IsBlank(locSelectedLandLeaseCost)), Not(country.Checked)), Text(cost.'Inflation Profile', "0.0"), And(Country.Name = "Italy", country.Checked), Text(Max(LookUp('Country Inflation Profiles', And(Country…, Year = Value(startYear), Area = drp_Area.Selected.Value)).Inflation, 0), "0.0"), country.Checked, Text(Max(LookUp(…, And(Country…, Year = Value(startYear))).Inflation, 0), "0.0"))` (trimmed); `_2.Value` `If(Country.Name = "Italy", "Italy - " & Substitute(gblAreaWithRegion, "Italy_", ""), Country.Name)`; label `If(country.Checked, "Country Inflation Profile", "Custom Inflation Profile [%]")` | `resolveInflationProfileValue`, `countryInflationDisplay`, `inflationProfileLabel`, `countryProfile` | UT-LAND-068 | E2E-LANDLEASE-026 | Matched |
| D12 | `tgl_…_BodyContent_OneTimePayment` (PA:4750–4778) | `Checked: =If(Not(IsBlank(cost.'Amount One-Time Payment')) && Not(IsBlank(cost.'Due Date One-Time Payment')), true, false)`; `OnUncheck: =Concurrent(Reset(DueDate_1), Reset(DueDate2_1), Reset(DueDate3_1), Reset(Amount_1), Reset(Amount2_1), Reset(Amount3_1), UpdateContext({locShowSecondPayment: false, locShowThirdPayment: false}))` | `oneTimePaymentChecked`, the toggle's `onChange` | UT-LAND-058, -060 | E2E-LANDLEASE-029 | Matched |
| D13 | payment 1 containers (PA:4796, 4934), inputs (PA:4845–4855, 5011–5020) | `Visible: =tgl_…_OneTimePayment.Checked`; `Value: =locSelectedLandLeaseCost.'Due Date One-Time Payment'`, `Placeholder: ="MM/YYYY"`; amount `Value: =Text(locSelectedLandLeaseCost.'Amount One-Time Payment', "##0.00")` | `PaymentBlock n={1}`, `landLeaseFormFrom` (`money2`) | UT-LAND-064 | E2E-LANDLEASE-029 | Matched |
| D14 | `btn_OneTimePayment2_NewEditCost_BodyContent_1` / `…3_…` (PA:5092–5136, 5448–5492) | `DisplayMode: =If(Or(lbl_…_Amount_ErrorMessage_1.Visible, lbl_…_DueDate_ErrorMessage_1.Visible, IsBlank(txt_…_Amount_1.Value), IsBlank(txt_…_DueDate_1.Value), locSelectedLandLeasePeriod.Period <> 'Land Lease Period'.'Period 1' && Not(IsBlank(locParentLandLeasePeriod))), DisplayMode.Disabled, DisplayMode.Edit)`; `Text: =If(locShowSecondPayment,"Delete One-Time payment","Add One-Time payment")`; `Visible: =!locShowThirdPayment` (3rd: `=locShowSecondPayment`); `OnSelect` blanks payment 2 in the collection only (LL-D13), `Reset`s both inputs, flips the flag | `addPaymentButton`, `togglePaymentBlock` | UT-LAND-062 | E2E-LANDLEASE-029 | Matched (LL-D13 noted; the code blanks the boxes, so the next save writes blank, the same end state) |
| D15 | payment 2/3 containers `Visible` (PA:5152, 5290, 5508, 5647) | `=locShowSecondPayment` / `=locShowThirdPayment` (no toggle term) | `form.oneTimePaymentsOn && form.showSecondPayment` | none | E2E-LANDLEASE-029 | Divergent, unmarked (edge): a contract with payment 2 stored but payment 1 blank opens with the toggle off; the canvas still shows block 2, the code hides it |

### E. Validation

`fn_Numeric` (`Components/fn_Numeric.pa.yaml`): `IsTwoDecimal` = `Switch(varLang, "en", IsMatch(candidate, "^((\+|-?)?\d+(|\.\d{0,2})?)"), IsMatch(candidate, "^((\+|-?)?\d+(|\,\d{0,2})?)"))` with `varLang = Lower(First(Split(Language(), "-")).Value)`; `IsOneDecimal` the same with `^((\+?)?\d+(|\.\d{0,1})?)` (no minus); `InRange = And(IsNumeric(candidate), And(Value(candidate) >= min, Value(candidate) <= max))`. `IsMatch` defaults to `MatchOptions.Complete`, so the patterns are anchored at both ends. Every numeric error label has `Visible: And(Not(IsBlank(v)), Or(Not(IsTwoDecimal(v)), Not(InRange(v, min, max))))`. Code: `validateLeaseNumber` + `LEASE_NUMERIC_SPEC` over `isDecimal` / `inRange` (`domain/numeric.ts`).

| # | Canvas control.property | Live Power Fx | Code location | UT | Playwright | Status |
|---|---|---|---|---|---|---|
| E1 | `lbl_…_Description_ErrorMessage_1` (PA:2150, 2186) | `Text: $"The term ""Standard"" is applicable only for system-prefilled contracts."`; `Visible: And(Not(IsBlank(txt_…_Description_1.Value)), Not(IsBlank(Find("standard", Lower(txt_…_Description_1.Value)))))` | `validateLeaseDescription`, `LEASE_MSG.descriptionStandardReserved` | UT-LAND-075, UT-LLUI-014 | E2E-LANDLEASE-030 | Matched |
| E2 | `lbl_…_StartDate_ErrorMessage_1` (PA:2326–2332) | `Text: =If(IsBlank(dte_….SelectedDate), $"Value cannot be blank")`; `Visible: =Not(IsBlank(dte_….SelectedDate))` | `validateStartDate` (correction), `startDateErrorVisibleCanvasParity` (twin) | UT-LAND-044 | E2E-LANDLEASE-031 | Divergent, marked: SOURCE DEFECT LL-D6 "corrected". **But `validateStartDate` is not called by the screen or by `leaseFieldErrors`**, so the code behaves like the canvas (no message, Save offered) |
| E3 | `lbl_…_FixedCosts_ErrorMessage_1` (PA:2946) | `If(And(Not(IsBlank(v)), Not(fn_Numeric_CC.IsTwoDecimal(v))), "Value must be a numeric with two decimal place.", And(IsNumeric(v), Not(fn_Numeric_CC.InRange(v, 0, 1000000000))), $"Value must be between 0 and {Text(1000000000, "#,###.0#")}.")` | `LEASE_NUMERIC_SPEC.fixedCosts`, `LEASE_MSG.twoDecimal` | UT-LAND-069/070 | E2E-LANDLEASE-032 | Matched (LL-D12: `fn_Numeric_CC`) |
| E4 | `lbl_…_PercentOfRevenues_ErrorMessage_1` (PA:3075) | `If(And(Not(IsBlank(v)), Not(fn_Numeric_LL.IsTwoDecimal(v))), $"Enter a number with no more than two decimal places.", Not(fn_Numeric_LL.InRange(v, 0, 10000)), $"Please select a value between 0 and {Text(10000, "#,##0.0#")}.")` | `LEASE_NUMERIC_SPEC.percentOfRevenues`, `LEASE_MSG.percentTwoDecimal` | UT-LAND-071 | E2E-LANDLEASE-033 | Matched (LL-D10 wording) |
| E5 | `lbl_…_EuroMWh_ErrorMessage_1` (PA:3206) | `If(…Not(fn_Numeric_LL.IsTwoDecimal(v)), "Value must be a numeric with two decimal place.", Not(fn_Numeric_LL.InRange(v, 0, 100000000)), $"Please select a value between 0 and {Text(100000000, "#,##0.0#")}.")` | `LEASE_NUMERIC_SPEC.eurPerMwh` | UT-LAND-069 | E2E-LANDLEASE-034 | Matched |
| E6 | `lbl_…_EuroMW_ErrorMessage_1` (PA:3338) | same as E5 | `LEASE_NUMERIC_SPEC.eurPerMw` | UT-LAND-069 | E2E-LANDLEASE-035 | Matched |
| E7 | `lbl_…_EuroWTG_ErrorMessage_1` (PA:3469) | same as E5 | `LEASE_NUMERIC_SPEC.eurPerWtg` | UT-LAND-069 | E2E-LANDLEASE-036 | Matched |
| E8 | `lbl_…_Amount_ErrorMessage_1` / `Amount2_…` / `Amount3_…` (PA:4968, 5324, 5682) | `If(…Not(fn_Numeric_LL.IsTwoDecimal(v)), $"Value must be a number", Not(fn_Numeric_LL.InRange(v, 0, 1000000000)), $"Please select a value between 0 and {Text(1000000000, "#,##0.0#")}.")` | `LEASE_NUMERIC_SPEC.amount`, `LEASE_MSG.amountNotANumber` | UT-LAND-071, -076 | E2E-LANDLEASE-037 | Matched (LL-D11 wording) |
| E9 | `lbl_…_DueDate_ErrorMessage_1` / `2` / `3` (PA:4830, 5186, 5543) | `Text: ="Due Date must be in format MM/YYYY."`; `Visible: And(Not(IsBlank(v)), Not(IsMatch(v, "^(0[1-9]\|1[0-2])\/\d{4}$")))` | `validateDueDate`, `LEASE_MSG.dueDateFormat` | UT-LAND-072 | E2E-LANDLEASE-038 | Matched |
| E10 | `lbl_…_InflationStartYear_ErrorMessage_1` (PA:4290–4296) | `Text: ="Year value must be in format YYYY."`; `Visible: And(Not(IsBlank(v)), Not(IsMatch(v, "^\d{4}$")))` | `validateInflationStartYear` | UT-LAND-073 | E2E-LANDLEASE-039 | Matched |
| E11 | `lbl_…_InflationProfile_ErrorMessage_1` (PA:4568–4613) | `If(country.Checked, "", If(And(Not(IsBlank(v)), Not(fn_Numeric_LL.IsOneDecimal(v))), $"Value must be a numeric with 1 decimal place", And(IsNumeric(v), Not(And(Value(v) >= 0, Value(v) <= 100))), $"Please select a value between 0 and 100.", Not(IsNumeric(v)), "Value must be a number with 1 decimal place"))`; `Visible` false while the country toggle is on | `validateInflationProfile` | UT-LAND-074 | E2E-LANDLEASE-040 | Matched |
| E12 | all text inputs | `IsBlank(" ")` is false and `IsMatch` does not trim: a space, or a value with a leading/trailing space, fails the pattern and shows the format message; a description of `" "` passes `Not(IsBlank(…))` | `isBlankValue`, `isDecimal`, `validateDueDate`, `validateInflationStartYear` all `trim()` | none | E2E-LANDLEASE-032…040 | Divergent, unmarked: the code accepts `" 2027"`, `" 01/2027"`, `" 5"` and treats `" "` as blank (no message; a `" "` description blocks Save) |
| E13 | `fn_Numeric_LL.IsTwoDecimal` / `IsOneDecimal` + `InRange` | `\.\d{0,2}` accepts `"1."`; `InRange` then needs `IsNumeric("1.")` | `isDecimal` accepts `"1."`, `parseNumber` rejects it (`^[+-]?\d*\.?\d+$`) | none | E2E-LANDLEASE-034 | Divergent, unmarked (derived, to be confirmed): the code shows the range message (rates) or "Value must be a number with 1 decimal place" (profile) for `"1."`; the canvas most likely shows nothing |
| E14 | `fn_Numeric.*` `Language()` switch; `Text(max, "#,##0.0#")` | the decimal separator is `.` only when the user language is `en`, `,` otherwise; the range figure is formatted in the user's locale | `isDecimal` / `parseNumber` use `localeInfo(locale)`; `LEASE_NUMERIC_SPEC` range texts are fixed English strings ("100,000,000.0") | UT-LAND-069…071 | E2E-LANDLEASE-041 (non-en run) | Divergent, unmarked: in a German session the canvas reads "…zwischen 0 und 100.000.000,0."-style figures and the code keeps "100,000,000.0" (to be confirmed by a de-DE Canvas run) |
| E15 | `lbl_LandLease_RightPanel_NewEditPeriod_BodyButtons_Hint_1` (PA:6127–6151) | `Text: ="Please fill in at least one commercial figure"`; `Visible: If(IsBlank(locSelectedLandLeaseCost) \|\| locSelectedLandLeasePeriod.Period = 'Period 1', And(<five rates blank>, IsBlank(Amount_1), IsBlank(DueDate_1)), And(<five rates blank>))` | `hintVisible`, `LEASE_MSG.atLeastOneFigure` | UT-LAND-077 | E2E-LANDLEASE-042 | Matched (one line per D49 §3) |
| E16 | `con_LandLease_WarningOnSaveWithCost.Visible` (PA:5818) | `If(Or(<five rate boxes not blank>), false, If(And(Or(<five stored rates on locSelectedLandLeasePeriod not blank>), With({varLastPeriod: Last(Sort(Filter(colLandLeasePeriods, 'Project Cost'… = locSelectedLandLeaseCost…), Period))}, If(locSelectedLandLeasePeriod.Period < varLastPeriod.Period, true, false))), true, false))` | `additionalPeriodsWarningVisible` | UT-LAND-078, -079, -089 | E2E-LANDLEASE-043 | Matched |
| E17 | `pcf_LandLease_RightPanel_NewEditPeriod_BodyButtons_Save_1.DisplayMode` (PA:5896–6047) | `If(And(Not(IsBlank(Description)), And(Not(<15 error labels>.Visible) incl. Hint and Description error), If(inflation.Checked, Not(IsBlank(StartYear)), true), If(Italy && inflation && country, Not(IsBlank(drp_Area.Selected.Value)), true), If(inflation && Not(country), Not(IsBlank(Profile)), true), If(OTP.Checked, And(Not(IsBlank(DueDate_1)), Not(IsBlank(Amount_1))), And(<months, years chosen>, Not(And(years = 0, months = 0)), If(PV or Wind, And(Not(IsBlank(Aggregation)), Not(IsBlank(cmb.Selected.Name))), true), Not(IsBlank(Frequency)))), If(locShowSecondPayment, …), If(locShowThirdPayment, …), If(And(OTP.Checked, Or(<rates>)), <period block>, If(And(Not(IsBlank(cost)), IsBlank(period), locRightPanelState = "New"), <period block>, true)), Not(con_LandLease_WarningOnSaveWithCost.Visible)), DisplayMode.Edit, DisplayMode.Disabled)` (trimmed) | `canSaveLandLease`, `periodBlockComplete`, `leaseFieldErrors` | UT-LAND-080…089, UT-LLUI-013 | E2E-LANDLEASE-044 | Matched (LL-D7 reproduced; hidden payment-block errors are gated, a documented narrowing in `leaseFieldErrors`) |
| E18 | Save gate allocation clause | `Not(IsBlank(cmb_…_AllocationWtg_1.Selected.Name))` | `periodBlockComplete`: `allocatedGeneratorIds.length === 0 && !form.allWtgAllocated` | UT-LAND-084 | E2E-LANDLEASE-044 | Divergent, unmarked (edge): with "Allocate to all WTGs" on and no generator in the project, the code offers Save; the canvas does not |

### F. Writes

| # | Canvas control.property | Live Power Fx | Code location | UT | Playwright | Status |
|---|---|---|---|---|---|---|
| F1 | `pcf_…_Save_1.OnChange` (PA:6062), first step | `UpdateContext({locSpinnerInformationText: "Saving Land Lease Contract...", locIsVisiblePopUpSpinner: true, locIsVisibleRightPanelNewEditPeriod: false})` | `commit` (`setBusy(LEASE_MSG.savingContract)`, `closePanel()` before the await) | UT-LEASE-NOSPIN-007 | E2E-LANDLEASE-046 (writes data) | Matched |
| F2 | Patch 1 of the save: `'Land Lease Project Costs'` (only when `IsBlank(locSelectedLandLeaseCost) \|\| locSelectedLandLeasePeriod.Period = 'Period 1'`) | `Patch('Land Lease Project Costs', If(IsBlank(cost), Defaults(…), LookUp(…)), {Project, Subaccount, Name: gblSelectedProject.'Project Name' & "-" & locSelectedLandLeaseSubaccount.Name & "-" & Description.Value, Description, Currency: drp_Currency.Selected, 'Due Date One-Time Payment': If(OTP.Checked, DueDate_1.Value, Blank()), 'Amount One-Time Payment': If(OTP.Checked, Value(Amount_1.Value), Blank()), Secured: If(tgl.Checked, 'Land Lease Secured'.Yes, …No), 'Owning Business Unit': gblSelectedProject.'Besitzer (Unternehmenseinheit)', … payments 2 and 3 …, AllWTGAllocated: tgl_AllWTG.Checked, 'Inflation Country Area': drp_Area.Selected.Value, 'Inflation Profile': Value(txt_Profile_1.Value), 'Inflation Start Year': Value(txt_StartYear.Value), 'Use Inflation Profile', 'Use Country Inflation Profile', IsStartDateStandardAssumption: locIsStartDateStandardAssumption})` (trimmed; `'Land Owner'` commented out) | `writesContractHeader`, `buildCostPayload`, `landLeaseCostName`, `oneTimePaymentPayload` | UT-LAND-012…014, -016, -092 | E2E-LANDLEASE-046 | Matched (Currency: see D1) |
| F3 | Patch 2 of the save: `ForAll(cmb.SelectedItems As SelectedGenerator, Patch('Land Lease Allocation WTGS', …))` | `{Name: locSelectedLandLeaseCost.'Land Owner' & "-" & locSelectedLandLeaseCost.Description & "-" & SelectedGenerator.Name, 'Project Cost': locSelectedLandLeaseCost, 'Generator In Project': SelectedGenerator, 'Owning Business Unit': …}`; `locSelectedLandLeaseCost` is the record the header `Patch` just returned | `planLeaseSave` (`diffAllocation`, `costForName`), `buildAllocationPayload`, `allocationName` | UT-LAND-050, -057, -095, -097, -098 | E2E-LANDLEASE-046 | Divergent, unmarked: on a renamed existing contract the code builds `Name` from the OLD description (`args.selectedCost?.description`); the canvas uses the just-saved one |
| F4 | Remove of the save: `ForAll(colAllocatedWtgsInSelectedLandLeaseCost As AllocatedWtgRecord, If(Not(… in ShowColumns(cmb.SelectedItems, GeneratorInProject)), Remove('Land Lease Allocation WTGS', AllocatedWtgRecord)))` | as quoted | `diffAllocation.toDelete` → `applyLeaseWrites` | UT-LAND-051 | E2E-LANDLEASE-046 | Matched (failure handling: F9) |
| F5 | Patch 3 of the save: `'Land Lease Periods'` (always) | `Patch('Land Lease Periods', If(IsBlank(locSelectedLandLeasePeriod), Defaults(…), locSelectedLandLeasePeriod), {Name: Description.Value, 'Project Cost': LookUp(…), Period: If(locRightPanelState = "New", Switch(locParentLandLeasePeriod.Period, 'Period 1', 'Period 2', … 'Period 8', 'Period 9', 'Land Lease Period'.'Period 1'), locSelectedLandLeasePeriod.Period), 'Fixed Costs': Value(…), '% of Revenues': Value(…), Aggregation: drp.Selected.Value, 'Land Lease duration years', 'Land Lease duration months', 'Start Date': DateValue(dte_….SelectedDate), 'Owning Business Unit': …, 'EUR/MWh', 'EUR/MW', 'EUR/WTG', 'Distribution Frequency'})` (trimmed) | `buildPeriodPayload`, `nextPeriod` (twin `nextPeriodCanvasParity`) | UT-LAND-093, -094, -096 | E2E-LANDLEASE-046 | Matched (LL-D1 is B3's row). A blank Start Date is sent as `""` by the code; Dataverse's answer is unverified |
| F6 | the two `IfError(…, Notify(…))` of the save | `Notify("Error: Land Lease Contract could not be saved correctly. " & "Internal error: originated on " & FirstError.Source & ". Message: " & FirstError.Message & FirstError.Details.HttpResponse, NotificationType.Error)` and the same for "Land Lease Period"; the two `IfError`s are independent, so a failed header still runs the allocation loops and the period `Patch` | `commit` `catch` → `reportFailure(leaseSaveError.contract/period(source, messageOf(e)))`; `applyLeaseWrites` stops at the first failure | UT-LAND-090, UT-LEASE-BUSY-002, UT-LEASE-FLIGHT-002 | not automated (needs a forced failure) | Divergent, unmarked: the code stops after the first failed write, shows one message, passes a fixed table name as "Source" and omits `HttpResponse`. The display channel (banner / toast) is CA-15 |
| F7 | end of the save and of both deletes | `ClearCollect(colLandLeaseProjectCosts, …); ClearCollect(colLandLeasePeriods, …); UpdateContext({locSelectedLandLeaseCost: Blank(), locSelectedLandLeasePeriod: Blank()}); Select(btn_LandLease_NewEditPeriod_ResetButton); UpdateContext({locSpinnerInformationText: "", locIsVisiblePopUpSpinner: false})` | `useLeaseWrites` invalidation, `leaseSelectionAfterWrite`, `clearsSelectionAfterSave` | UT-LAND-091, UT-LEASE-SEL-001…005, -010…012 | E2E-LANDLEASE-046 | Divergent, marked: `DIVERGENCE (D58, CA-17)` keeps a row picked mid-write |
| F8 | `"AddLandLeaseStandardContractKey"` (PA:396): 3 Patches | `If(CountRows(recFilteredStandardContractsForProject) = 0, …)`: per Period-1 assumption `Patch('Land Lease Project Costs', Defaults(…), {Project, Subaccount, Name: 'Project Name' & "-" & subaccount.Name & "-" & assumption.Name, Description, Currency, payments via Value(Text(x, "##0.00")), Secured, 'Owning Business Unit', AllWTGAllocated, inflation flags, 'Inflation Profile': Switch(…), 'Inflation Start Year': recCODYear, IsStartDateStandardAssumption: Yes, 'Is Standard Contract?': Yes})`; per generator `Patch('Land Lease Allocation WTGS', …, {Name: recLandLeaseContractCost.'Land Owner' & "-" & Description & "-" & Name, …, 'Owning Business Unit'})`; per assumption (Description order) `Patch('Land Lease Periods', …, {…, 'Start Date': recStartDate, 'Owning Business Unit'})` (trimmed) | `importStandard`, `planStandardImport`, `standardPeriodStarts`, `mapAssumptionPeriod`, `mapAggregation`, `roundTwoDecimals`, `resolveStandardInflationProfile` | UT-LAND-113…125 | E2E-LANDLEASE-048 (writes data) | Matched (LL-D8, LL-D9 reproduced; Period 10 → Period 1 reproduced) |
| F9 | `Remove('Land Lease Periods', locSelectedLandLeasePeriod)` (PA:6208); `RemoveIf(…)` x3 (PA:6243–6254); the F4 `Remove` | no `IfError` on the canvas (App `OnError` records the error; its `Notify` is commented out) | `applyLeaseWrites` delete arm: `await writer.remove(bound.id)` → generated `Vsb_…Service.delete()`, which returns `Promise<void>` and discards the result | UT-LLDATA-013 | E2E-LANDLEASE-047 (writes data) | **Missing in code** (CONVENTIONS rule 14): a refused delete (403, cascade) resolves as success. Use `deleteRecord` from `data/client.ts` |
| F10 | `cmp_LandLease_PopUpConfirmation_DeleteLandLeaseCost.OnConfirm` order | `RemoveIf('Land Lease Allocation WTGS', …); RemoveIf('Land Lease Periods', …); RemoveIf('Land Lease Project Costs', …)`, then the three local `RemoveIf`s | `planLeaseDelete` (allocations → periods → cost), `confirmDelete` | UT-LAND-100, UT-LLUI-012 | E2E-LANDLEASE-047 | Matched |
| F11 | `'Owning Business Unit': gblSelectedProject.'Besitzer (Unternehmenseinheit)'` on all six creates | as quoted | `LEASE_BIND.owningBusinessUnit` in every payload | UT-LAND-004, -123 | E2E-LANDLEASE-046 | Matched (CONVENTIONS rule 4) |
| F12 | server flows / plugins on the three tables | none: `04-flow-inventory.md` lists no server-triggered flow or plugin step on `vsb_landlease*` | n/a | n/a | n/a | Matched |

### G. Messages and pop-ups

| # | Canvas control.property | Live Power Fx | Code location | UT | Playwright | Status |
|---|---|---|---|---|---|---|
| G1 | the two save `Notify` texts | quoted in F6 | `leaseSaveError.contract`, `leaseSaveError.period` | UT-LAND-090 | not automated (needs a forced failure) | Matched (text; behaviour is F6) |
| G2 | `cmp_LandLease_PopUpConfirmation_DeletePeriod` (PA:6195–6222) | `Title: ="Delete Period?"`; `Description: ="Are you sure that you want to permanently delete " & locSelectedLandLeasePeriod.Period & " expense in the """ & locSelectedLandLeasePeriod.Name & """  Land Lease?"`; buttons `"Delete"` / `"Cancel"` | `deleteDialog`, `LEASE_MSG.deletePeriodTitle`, `ConfirmDialog canvasFooter` | UT-LAND-101, UT-LLUI-011 | E2E-LANDLEASE-045 (Cancel only) | Matched |
| G3 | `cmp_LandLease_PopUpConfirmation_DeleteLandLeaseCost` (PA:6229–6282) | `Title: ="Delete Land Lease?"`; `Description: ="Are you sure that you want to permanently delete Land Lease """& locSelectedLandLeasePeriod.Name & """ and all related Periods?"` | `deleteDialog`, `LEASE_MSG.deleteContractTitle` | UT-LAND-101, UT-LLUI-011 | E2E-LANDLEASE-045 | Matched |
| G4 | spinner texts | `"Please wait, loading Standard Assumption Contract..."`, `"Saving Land Lease Contract..."`, `"Deleting Land Lease Period..."`, `"Deleting Land Lease cost..."` | `LEASE_MSG.loadingStandardContract`, `.savingContract`, `.deletingPeriod`, `.deletingContract` via `WriteStatus` | UT-LEASE-NOSPIN-006/007 | E2E-LANDLEASE-046 | Matched (shown without a scrim: B11) |
| G5 | `htm_LandLease_WarningOnSaveWithCost.HtmlText` (PA:5868) | `="<b>Warning:</b> Saving is not possible, because additional periods exist, Please delete them first."` | `LEASE_MSG.additionalPeriodsWarning` (markup stripped, `data-testid="lease-periods-warning"`) | UT-LAND-089 | E2E-LANDLEASE-043 | Matched (text; "Warning:" is not bold) |
| G6 | Hint text | quoted in E15 | `LEASE_MSG.atLeastOneFigure` | UT-LAND-077 | E2E-LANDLEASE-042 | Matched |
| G7 | read failure | none (the canvas shows empty galleries) | `EmptyState` "Cost data is unavailable" | UT-LLUI-016 | not automated (needs a failed read) | Extra in code (CONVENTIONS rule 19) |
| G8 | first load | `LoadingSpinner: =LoadingSpinner.Data` | `LoadingOverlay label="Loading Land Lease…" testId="land-lease-loading"` | UT-LEASE-NOSPIN-005 | E2E-LANDLEASE-001 | Extra in code (D60, D58 table row B10) |

### H. Accessibility and hints

| # | Canvas control.property | Live Power Fx | Code location | UT | Playwright | Status |
|---|---|---|---|---|---|---|
| H1 | `drp_LandLease_RightPanel_NewEditPeriod_BodyContent_DurationMonths_1.AccessibleLabel` (PA:2554) | `="Month"` | `aria-label={`${LEASE_LABELS.duration} months`}` ("Duration months"), `data-testid="lease-months"` | none | E2E-LANDLEASE-003 | Divergent, unmarked (CONVENTIONS rule 16: aria-label = canvas `AccessibleLabel`) |
| H2 | `drp_…_DurationYears_1.AccessibleLabel` (PA:2618) | `="Year"` | "Duration years", `data-testid="lease-years"` | none | E2E-LANDLEASE-003 | Divergent, unmarked |
| H3 | `drp_…_DistributionFrequency_Month_1.AccessibleLabel` (PA:3685) | `="Month"` | "Distribution Frequency", `data-testid="lease-frequency"` | none | E2E-LANDLEASE-003 | Divergent, unmarked |
| H4 | `ico_ResetStartDay_NewEditCost_LandLease_1.Tooltip` (PA:2524) | `="Reset to current project COD date."` | `Tooltip content={LEASE_MSG.resetStartDateTooltip}`, same `aria-label`, `data-testid="lease-reset-start"` | none | E2E-LANDLEASE-004 | Matched |
| H5 | `ico_LandLease_RightPanel_NewEditPeriod_BodyheaderCancel_1.Tooltip` (PA:2060) | `="Cancel"` | `FormPanel` ✕: `title={HINTS.cancel}` ("Cancel"), `aria-label="Close panel"`, `data-testid="panel-close"` | none | E2E-LANDLEASE-004 | Matched |
| H6 | row button `Tooltip: =ThisItem.Name` (PA:1777); every caption `Tooltip: =Self.Text` | as quoted | the row `<tr>` has `aria-label="Select period"` and no `title` | none | E2E-LANDLEASE-004 | Missing in code (minor): no hover text with the period name |
| H7 | canvas names of the panel dropdowns and toggles (`drp_…_DurationYears_1`, `drp_…_Aggregation_1`, `tgl_…_Secured`, `tgl_…_OneTimePayment`, …) | n/a | `data-testid="lease-years"`, `lease-aggregation`, `lease-secured`, `lease-otp`, `lease-<commandKey>`, `leasecard-<name>` | UT-LABELS, UT-CANVASID | E2E-LANDLEASE-003 | Divergent, unmarked (rule 16 asks for the canvas name where one exists; text inputs, Save, Cancel, the WTG picker and the row button do use canvas names). Rule 16 also forbids changing existing ids, so this needs a decision |

---

## 3. Fabric / not testable

| # | What | Why | How to cover |
|---|---|---|---|
| N1 | Fabric SQL | none: no `Fabric`, `SQL` or `.Run(` in the screen YAML (grep, 2 Nov 2026) | nothing to test |
| N2 | Power Automate flows / plugins | none fire on the Land Lease tables (F12) | nothing to test |
| N3 | Save, delete, standard import (F1–F11) | write real Dataverse rows | DEV test project only, with cleanup; E2E-LANDLEASE-046…048 behind an opt-in flag |
| N4 | Save failure messages (F6, G1) | need a refused write | unit tests only (UT-LAND-090, UT-LEASE-BUSY-002) |
| N5 | Permission gates (B12) | need a user without create / write / delete on the tables | manual, or a second test account |
| N6 | Period 9 cap (B3, LL-D1) | needs a contract with nine periods | unit tests (UT-LAND-019, -105) |
| N7 | Add Standard Contract (B4, F8) | needs a matching `OPEX & Land Lease Standard Assumptions` row and an empty sub-account; writes | DEV seed data |
| N8 | Italy-only Area and inflation (D10, D11, A11) and non-PV/Wind hiding (D3, D4) | need an Italian project and a non-PV/Wind project | pick suitable DEV projects, else unit tests |
| — | App shell: `cmp_Header`, `cmp_Left_Navigation`, `lbl_LandLease_FooterVersion` (`"Version " & gblAppVersion`), `cmp_ReportErrorRightPanel` (`Visible: =gblShowReportProblemPanel`) | shared shell, not this screen's code | the shell's own suite |

---

## 4. Inputs for the browser layer

**All expected canvas outcomes are derived from the YAML by hand, to be confirmed by the Canvas run.** They assume an
English (`en`) user language; E14 covers other languages.

Baselines (type the input into the field under test only):
- **B-rate:** "Edit Contract" on Period 1 of a non-standard contract with one period, on a Wind or PV project:
  Duration 20 years 0 months, Aggregation SUM, Distribution Frequency 12 months, at least one WTG allocated, One-Time
  Payment off, Inflation off, **EUR/WTG = 1000** (when the field under test is EUR/WTG: Fix Costs = 1000 instead).
- **B-otp:** B-rate plus One-Time Payment on, Due Date 1 = `12/2027`, Amount 1 = `1000`.
- **B-infl:** B-rate plus Inflation on, Country Inflation off, Inflation Start Year `2027`, Custom profile `2.0`.

"Code differs" flags a row where the code's outcome (read from `landLeaseRules.ts` / `domain/numeric.ts`) is expected to
differ; those are the unmarked rows E12–E14.

### 4.1 EUR/MWh, EUR/MW, EUR/WTG (B-rate) — decimal message "Value must be a numeric with two decimal place.", range message "Please select a value between 0 and 100,000,000.0."

| Input | Canvas message | Save enabled | Code differs |
|---|---|---|---|
| `abc` | decimal | no | |
| `-1` | range | no | |
| `0` | none | yes | |
| `1` | none | yes | |
| `1.5` | none | yes | |
| `1,5` | decimal | no | |
| `0.555` | decimal | no | |
| `1e3` | decimal | no | |
| `␠` (one space) | decimal | no | yes: no message, Save yes (E12) |
| empty | none | yes | |
| `100000000` (max) | none | yes | |
| `100000001` (max+1) | range | no | |
| `100000000.01` | range | no | |
| `1.` | none (to confirm) | yes (to confirm) | yes: range message, Save no (E13) |
| `+1` | none | yes | |

### 4.2 Fix Costs (B-rate) — decimal "Value must be a numeric with two decimal place.", range "Value must be between 0 and 1,000,000,000.0."

| Input | Canvas message | Save enabled | Code differs |
|---|---|---|---|
| `abc` | decimal | no | |
| `-1` | range | no | |
| `0` | none | yes | |
| `1` | none | yes | |
| `1.5` | none | yes | |
| `1,5` | decimal | no | |
| `0.555` | decimal | no | |
| `1e3` | decimal | no | |
| `␠` | decimal | no | yes (E12) |
| empty | none | yes | |
| `1000000000` (max) | none | yes | |
| `1000000001` (max+1) | range | no | |
| `1000000000.01` | range | no | |
| `1.` | none (to confirm) | yes (to confirm) | yes (E13) |

### 4.3 Share of Revenues [%] (B-rate) — decimal "Enter a number with no more than two decimal places.", range "Please select a value between 0 and 10,000.0."

| Input | Canvas message | Save enabled | Code differs |
|---|---|---|---|
| `abc` | decimal | no | |
| `-1` | range | no | |
| `0` | none | yes | |
| `1` | none | yes | |
| `1.5` | none | yes | |
| `1,5` | decimal | no | |
| `0.555` | decimal | no | |
| `1e3` | decimal | no | |
| `␠` | decimal | no | yes (E12) |
| empty | none | yes | |
| `10000` (max) | none | yes | |
| `10001` (max+1) | range | no | |
| `10000.01` | range | no | |
| `1.` | none (to confirm) | yes (to confirm) | yes (E13) |

### 4.4 One-Time Payment Amount 1 (B-otp; 2 and 3 are identical once their block is shown) — decimal "Value must be a number", range "Please select a value between 0 and 1,000,000,000.0."

| Input | Canvas message | Save enabled | Code differs |
|---|---|---|---|
| `abc` | decimal | no | |
| `-1` | range | no | |
| `0` | none | yes | |
| `1` | none | yes | |
| `1.5` | none | yes | |
| `1,5` | decimal | no | |
| `0.555` | decimal | no | |
| `1e3` | decimal | no | |
| `␠` | decimal | no | yes: no message, Save no (clause F sees blank) |
| empty | none | no (clause F; the "Add One-Time payment" button is disabled too) | |
| `1000000000` (max) | none | yes | |
| `1000000001` (max+1) | range | no | |
| `1000000000.01` | range | no | |
| `1.` | none (to confirm) | yes (to confirm) | yes (E13) |

### 4.5 Custom Inflation Profile [%] (B-infl) — one-decimal "Value must be a numeric with 1 decimal place", range "Please select a value between 0 and 100."

| Input | Canvas message | Save enabled | Code differs |
|---|---|---|---|
| `abc` | one-decimal | no | |
| `-1` | one-decimal (`IsOneDecimal` has no minus) | no | |
| `0` | none | yes | |
| `1` | none | yes | |
| `1.5` | none | yes | |
| `1,5` | one-decimal | no | |
| `0.555` | one-decimal | no | |
| `1e3` | one-decimal | no | |
| `␠` | one-decimal | no | yes: no message, Save no (clause E) |
| empty | none | no (clause E) | |
| `100` (max) | none | yes | |
| `100.1` | range | no | |
| `101` | range | no | |
| `1.` | none (to confirm) | yes (to confirm) | yes: "Value must be a number with 1 decimal place", Save no (E13) |
| any value, Country Inflation on | none (label suppressed; box disabled) | per other clauses | |

### 4.6 Inflation Start Year (B-infl) — "Year value must be in format YYYY."

| Input | Canvas message | Save enabled | Code differs |
|---|---|---|---|
| `abc` | yes | no | |
| `-1` | yes | no | |
| `0` | yes | no | |
| `1` | yes | no | |
| `2027` | none | yes | |
| `0000` | none (no range check; writes 0) | yes | |
| `99999` | yes | no | |
| `2027.5` | yes | no | |
| `␠2027` | yes | no | yes: no message, Save yes (E12) |
| `␠` | yes | no | yes: no message (Save still no, clause C) |
| empty | none | no (clause C) | |

### 4.7 One-Time Payment Date 1 (B-otp; 2 and 3 identical) — "Due Date must be in format MM/YYYY."

| Input | Canvas message | Save enabled | Code differs |
|---|---|---|---|
| `01/2027` | none | yes | |
| `12/2027` | none | yes | |
| `1/2027` | yes | no | |
| `13/2027` | yes | no | |
| `00/2027` | yes | no | |
| `01-2027` | yes | no | |
| `abc` | yes | no | |
| `29/02/2028` (leap day typed as a date) | yes | no | |
| `02/0000` | none (no year range) | yes | |
| `␠01/2027` | yes | no | yes: no message, Save yes (E12) |
| empty | none | no (clause F) | |

### 4.8 Description (B-rate)

| Input | Canvas message | Save enabled | Code differs |
|---|---|---|---|
| `Lease A` | none | yes | |
| `standard` | 'The term "Standard" is applicable only for system-prefilled contracts.' | no | |
| `Non-standard lease` | same | no | |
| `STANDARD` | same | no | |
| `␠` | none | **yes** (`IsBlank(" ")` is false; writes `" "`) | yes: Save no (E12) |
| empty | none | no | |
| 56 characters | input stops at 55 (`MaxLength: =55`) | yes | |

### 4.9 Start Date (B-rate unless stated)

| Input | Canvas outcome | Save enabled | Code differs |
|---|---|---|---|
| cleared (empty) | no message (LL-D6: the label is visible only when a date exists, and then its text is blank) | yes; writes a blank Start Date | the code also shows nothing and offers Save; it sends `""` (Dataverse answer unverified) |
| invalid text typed into the picker | no message; `SelectedDate` keeps or loses its value (to confirm on `DatePicker@0.0.46`) | yes | to confirm |
| a date before the project start | no message (`inf_OpexCost_AlignWithDuration_2.Visible: =false`) | yes | |
| a date after the project end | no message | yes | |
| `29 Feb 2028`, duration 1 year 0 months | grid End Date `27.02.29` (DateAdd to 28 Feb 2029, then −1 day) | yes | |
| Add Period after a parent starting `31 Jan 2027` with 1 year 1 month | new Start Date `29 Feb 2028` (month-end clamp) | yes | |
| pick any date, then reopen | date no longer blue/italic; saved `IsStartDateStandardAssumption = No` | yes | yes: stays blue/italic, saves the old flag (C4) |

### 4.10 Duration (B-rate)

| Input | Canvas outcome | Save enabled | Code differs |
|---|---|---|---|
| 0 years, 0 months | no message | no | |
| 0 years, 1 month | none | yes | |
| 35 years, 11 months (max) | none | yes | |
| Add Contract: pick years only | months pre-select "0 months" | yes (if the rest is valid) | |

**Input rows: 112** (15 + 14 + 14 + 14 + 15 + 11 + 11 + 7 + 7 + 4).

---

## 5. Known differences for the KNOWN list

Only differences that carry a marker or a D / CA record. Ready to paste into `e2e/landlease.compare.codeapp.spec.ts`:

```ts
const KNOWN: Record<string, string> = {
  "commands.addPeriod.enabledOnNonLastPeriod": "DIVERGENCE (product owner, 27 Oct 2026, leaseCommands): Add Period on any period; the canvas only on the last by Period",
  "commands.addPeriod.disabledAtPeriod9": "SOURCE DEFECT LL-D1: Period 9 cannot be extended; the canvas wraps to a second Period 1",
  "commands.delete.lastByPeriodNotName": "DIVERGENCE (product owner, 27 Oct 2026) / SOURCE DEFECT LL-D4: Delete on the last period by number, not by Name",
  "addPeriod.parentIsLastPeriod": "DIVERGENCE (27 Oct 2026, openAddPeriod): the new period's name and start date continue the contract's LAST period",
  "selection.deselectClearsCost": "SOURCE DEFECT LL-D5: deselecting a row also clears the stale cost",
  "selection.keptWhenPickedMidWrite": "DIVERGENCE (D58, CA-17): a row picked while a write runs is kept",
  "writes.noScrim": "DIVERGENCE (D58) / D60: no full-screen scrim; WriteStatus text plus the write guard",
  "load.busyText": "D60 (D58 table row B10): 'Loading Land Lease…' inline spinner",
  "permissions.commandGates": "D1: gates use serverEnforcedProvider; the server refuses, not DataSourceInfo/RecordInfo",
  "saveError.channel": "CA-15: a failed write shows a banner (toast once the screen is left), not Notify",
  "panel.hint.singleLine": "D49 §3 (PO, 26 Oct 2026): the hint on one line",
  "allocation.allWtg.zeroGenerators": "allWtgSelected guard (landLeaseRules.ts, deliberate, twin allWtgSelectedCanvasParity): an empty project never counts as 'all WTGs'",
};
```

**KNOWN entries: 12.**

Not in KNOWN on purpose: these differ but have no marker or record, so the compare test should report them as
*unexpected* until someone decides (CONVENTIONS rule 8):
`load.subaccounts.inactive` (A1), `load.costs.inactive` (A2), `allocation.list.inactiveTypes` (A4),
`panel.startDate.onChangeClearsStandard` (C4), `durationYears.defaultLabel` (C6, LL-D2 recorded as reproduced),
`currency.repointedOnSave` (D1), `allocation.manualAllSelectsToggle` (D5), `allocation.asterisk` (D6),
`inflationStartYear.followsStartDate` (D9), `area.defaultFromRegion` (D10), `payments.block2WithoutToggle` (D15),
`validation.<field>[" "].*` and leading/trailing spaces (E12), `validation.<field>["1."].*` (E13),
`validation.*.rangeMessage.locale` (E14), `saveGate.allocation.zeroGenerators` (E18),
`writes.allocationName.afterRename` (F3), `writes.saveContinuesAfterHeaderError` (F6),
`a11y.durationMonths` / `a11y.durationYears` / `a11y.distributionFrequency` (H1–H3), `tooltip.rowName` (H6),
`testIds.canvasNames` (H7).

---

## 6. Open questions

**Canvas rules with no code (or not wired):**
1. `dte_…_StartDate_1.OnChange` sets `locIsStartDateStandardAssumption` to No (C4). The code never clears it.
2. `validateStartDate` (LL-D6 "corrected") exists but nothing calls it (E2). Is LL-D6 corrected or reproduced? The bugs
   register and `13-CODE-APP-IMPROVEMENTS-OVER-CANVAS.md` H both say corrected.
3. The Area default from `gblAreaWithRegion` (D10) and the live Inflation Start Year (D9) have no code.
4. The three canvas `AccessibleLabel`s ("Month", "Year", "Month") are not used (H1–H3), and canvas control names are not
   used as `data-testid` on the panel dropdowns and toggles (H7). Rule 16 asks for both, and also forbids changing
   existing ids.
5. Deletes go through the generated `delete()` (F9), against CONVENTIONS rule 14 and KNOWN-RISKS "several delete paths
   discard the SDK's failure result silently".
6. The row tooltip `=ThisItem.Name` (H6).
7. The canvas keeps saving after a failed header write (F6). Should the code copy that, or is stopping a decision to
   record?

**Code rules with no canvas source:**
1. `ACTIVE` (`statecode eq 0`) on sub-accounts, contracts, generator types, assumptions and country inflation
   (A1, A2, A4; `loadLeaseAssumptions`, `loadCountryInflation`).
2. Keeping a stored currency instead of the PLN/EUR default (D1); a comment in `commit`, no marker.
3. The picker's `onOptionSelect` writing `allWtgAllocated` (D5); the canvas only sets `locAllWTGAllocated`, which nothing
   reads.
4. `trim()` in every validator (E12), and `parseNumber` rejecting `"1."` (E13).
5. The 27 Oct 2026 product-owner divergences (B3, B6, B8) have `DIVERGENCE` comments and tests but **no entry in
   `02-OPEN-DECISIONS.md`** and no `…CanvasParity` twin for the dropped "last period" clause (rule 8).
6. `EmptyState` (G7) and the inline loading text (G8): extra, by rule 19 and D60.
7. `periodBlockRequired` lives in `LandLeaseScreen.tsx`, not `landLeaseRules.ts` (CONVENTIONS rule 5).

**Inconsistencies to resolve:**
1. Defect numbering: `landLeaseRules.ts` calls the `fn_Numeric_CC` call "LL-D9" and the import's column-name lookup
   "LL-D10", while `01-BUGS-FOUND.md` has LL-D9 = the leading `-` in allocation names, LL-D10 = the % wording,
   LL-D12 = `fn_Numeric_CC`. The code also uses "LL-D9" and "LL-D10" twice each.
2. Rules vs screen: `generatorOptions` puts PV rows first and `subaccountPeriodRows` sorts case-sensitively;
   `LandLeaseScreen` re-sorts both (blank order last, case-insensitive) per D49 §2. UT-LAND-056 pins the rules order, which
   the screen does not show.
3. `landLeaseFormFrom` gives `"54.00"` for the three rates; `openEdit` overrides it with `canvasRate`. The rules function
   alone is not the canvas format.
4. `lbl_…_CostsTableRow_OTP.FontWeight` and `…_StartDate_2.FontWeight` read `con_Costs_ProjectCostsInAccount.Visible`, a
   control that is not on this screen (PA:990, PA:1592). Which weight does the canvas show?
5. Counts in the brief: the YAML has 8 `Patch(` (6 on tables, 2 on `colLandLeaseProjectCosts`), 3 `Remove(`,
   7 `RemoveIf(`, 2 `Notify(`, 3 `AccessibleLabel`s and 2 non-empty literal `Tooltip`s, not "4 Patch, 1 Notify".
6. The panel `Description` field is written to both the contract's `vsb_description` and the period's `vsb_name` on
   Period 1; on Period 2+ it is disabled and only the period name is written. Matched, but worth one browser check
   (E2E-LANDLEASE-015/016).
