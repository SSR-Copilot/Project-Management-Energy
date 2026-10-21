# PM Revenues: Add / Edit Revenue Contract validation audit (20 Oct 2026)

**Why.** The product owner asked for every business validation in the Power Fx of this panel to be
checked again, because it is one of the most complex features. This audit goes through each live
formula of the panel and its Save button, one term at a time.

**Sources.**
- Canvas: `ProjectDocs/_extracted/msapp/projectmanagement/Src/Project Revenues Screen.pa.yaml`
  (solution 1.21.709). The `Y:` numbers below are line numbers in that file.
- Code: `ProjectCosts-CodeApp/src/features/pm/revenues/`. In the tables, `rules.ts:N` and
  `Screen.tsx:N` are line numbers in those files as they stand after this change.
- Decisions: D33, as answered by the product owner (V1 follow 1.21.753, V2/V3 fixes kept, V5
  parked, V6 card gallery). The Fabric source `Assumptions Revenues SQL` is not connected (D2/X2).

**Rules followed.** Commented-out formulas are skipped (CONVENTIONS rule 10). Every fix is in
`rules.ts`, with a test in `rules.test.ts` (UT-REV-141…155) or `Screen.test.tsx` (UT-REV-916).

**Status values.**
- **MATCH**: the code does what the live formula does.
- **FIXED**: the code was different and is corrected now.
- **DIVERGENCE (documented)**: a recorded decision. It is in D33 / `02-OPEN-DECISIONS.md` and has
  a canvas-parity twin where numbers are involved.
- **MISSING**: not implemented.

**Fabric (X2).** Rows marked *(Fabric)* depend on `Assumptions Revenues SQL`. Today the engine
runs over no rows, so `recStandardAssumptionExists` is always false. Each such rule is still ported
and tested.

## Summary

| Status | Rows |
|---|---|
| MATCH | 59 |
| FIXED | 29 |
| DIVERGENCE (documented) | 5 |
| MISSING | 0 |
| **Total** | **93** |

**How rows are counted:**
- A row with any corrected term counts as FIXED.
- Two of the FIXED rows also keep a documented divergence:
  - row 13: the hard-coded start-date flag, ambiguity 5;
  - row 89: the server-side overlap query.
- The 29 FIXED rows carry the 24 distinct fixes listed below. Row 40 adds one layout fix: the
  single Contract Duration caption.

**The fixes. Each one changed what a user sees or what gets saved:**
1. **New-contract start date** (`drp_…_Label_1.OnChange`, Y:5808-5833). With no standard, the start date is the project COD, or blank when the COD is blank. Before, it was **today**. This affects every contract while Fabric is unconnected.
2. **New-contract durations** (Y:5923-5977). With no standard they are blank. Before, they were 0 / 0, so "0 year" / "0 month" was pre-selected.
3. **Engine end date** (Y:6795-6851). It is `If(all three standard, start + term − 1 day, start)`, with no one-day guard.
4. **Engine Custom Inflation Profile** (Y:11038). It shows `Text(…, "0.00")` and is "0.00" without a standard. Before, it was blank.
5. **Years picker** (Y:7841-7845). Picking the years fills blank months with 0.
6. **Duration pickers** (Y:7836-7848, 8009-8018). Either picker makes both durations non-standard. Before, only the changed one.
7. **Start-date change** (Y:7598). When years or months are still blank and the term is longer than a day, the end date is blank.
8. **Reset to COD** (`ico_SetCODDate_RightPanelRevenue_1`, Y:7568).
   - The contract stays standard and keeps its "Standard " description.
   - The start date is re-derived as the engine does it.
   - The end date is standard when the start and both durations are.
   - Before, the reset made the contract non-standard and the end date non-standard.
9. **Edit: Correction Factor p50 / p90** (Y:8915-8922, 9133-9141). A blank value shows "1.000". Before, it was blank.
10. **Edit: German FiT Tariff / Price** (Y:9438-9461). It is `Text(Bidding × CF, "0.00")`. Before, it showed the stored tariff.
11. **Edit: Site Quality p50 / p90** (Y:8547-8552, 8716-8721). It uses `"#"` / `"#0.0#"`, so a stored 0 shows "".
12. **Edit: Hedged Volume [%]** (Y:11626-11640). It uses `"0"` / `"#0.0#"`.
13. **Edit: Custom Inflation Profile** (Y:11038). It uses `"0.00"`.
14. **Edit: Inflation Start Year** (Y:10719). It is `Value(stored)`, so a stored 0 shows "0".
15. **Country toggle on / off** (Y:10265-10394, 11009-11013). The value shows as "0.00". On an edited contract, switching the toggle off brings the stored profile back. Before, it went blank.
16. **Inflation Start Year change** (Y:10612-10705).
    - The country re-lookup runs on every change, even for an invalid year (a non-year finds 0).
    - An invalid year keeps its standardness.
17. **Bidding Price, Custom Inflation Profile, Hedged Volume [%]** (Y:8296, 10927, 11563). Their standardness only changes once the value is valid (`If(Not(<error>.Visible), …)`). Before, it changed on every keystroke.
18. **Site Quality p50 / p90** (Y:8543, 8712). They only mark the form dirty and do not make the contract non-standard.
19. **Fixed Volume and each Individual Volume** (Y:11792, 12029). The same: dirty only.
20. **Consider Negative Prices toggle** (Y:11136-11172). The same: dirty only.
21. **Negative-price re-sync icon** (`Icon1.OnSelect`, Y:11316). The same: dirty only.
22. **Negative-price toggle on a new contract** (Y:763-767). It is editable until a Type is chosen (`DisplayMode.Edit` seed).
23. **Country Inflation Profile toggle** (Y:10195-10263). It shows only while the Inflation Profile toggle is on: its container is 36 px high and clips it away. This corrects D33 S15, "always shown".
24. **Hedge 100 % check** (Y:4774). It reads the % with the locale-aware `Value()`.

## Audit table

### Opening, closing, Type and the standard-assumption engine

| # | Canvas control | Live formula (quoted, YAML line) | Code (file:line) | Status |
|---|---|---|---|---|
| 1 | `btn_Revenue_AddContract.DisplayMode` | `If(Or(IsBlank('Cluster State'.Name), … = "Draft", con_Milestones_Page_LockMessage_7.Visible), Disabled, Edit)` Y:712-717 | `isRevenuePageBlocked` / `contractCommandBar` rules.ts:2293 | MATCH |
| 2 | `btn_Revenue_AddContract.OnSelect`, subaccount | `If(IsBlank(locSelectedRevenueSubaccount), ClearCollect(colRevenuesFormValidationErrors, {Text: $"Revenue Subaccount cannot be empty! {Char(10)} Write to support team."}))` Y:745-754 | inline `MSG.subaccountMissing`, Screen.tsx:1154; Save gate rules.ts:1717 | DIVERGENCE (documented, U22/S4: inline, not in the info button) |
| 3 | `btn_Revenue_AddContract.OnSelect`, seeds | `locRevenueContractHedgeType: {…'Hedged Volume [%]'}`, `locRevenueContractFormDirty: false`, `Reset(…)` ×20 Y:755-790 | `newContractForm` rules.ts:3114 | MATCH |
| 4 | same, `locRevenueContractConsiderNegativePrice: {DisplayMode: Edit, ToggleState: false, ManualOverride: false}` | Y:763-767 | `negativePriceDisplayMode` rules.ts:2235; Screen.tsx:602 | FIXED (22) |
| 5 | `lbl_…_BodyHeader_1.Text` | `If(IsBlank(locSelectedRevenueContract), "Add Revenue Contract", "Edit Revenue Contract")` Y:5215 | `contractPanelTitle` rules.ts:2703 | MATCH |
| 6 | `ico_…_BodyHeaderCancel_1.OnSelect` / `pcf_…_Cancel_1.OnChange` | close, clear every `loc*`, `Reset(…)` Y:5231-5284, 12589-12643 | `closeContract` Screen.tsx:462 | MATCH |
| 7 | `pcf_…_ContractCommandBar_3.OnSelect` "editRevenueContract", standardness | `IsStandardAssumption: If(<stored flag> = Yes, true, false)` per field; end date `false`; `locRevenuePrice` = Bidding flag for German FiT `<> PV`, else Tariff flag; p90 only `= Wind` Y:995-1345 | `standardFromStored` rules.ts:2036 | MATCH |
| 8 | same, the shown values | CF `If(IsBlank(…), "1.000", Text(x, "#0.000"))` Y:8915/9133; Tariff `Text(Value(Bidding)*Value(CF), "0.00")` Y:9438; SQ `"#"`/`"#0.0#"` Y:8547; Hedged % `"0"`/`"#0.0#"` Y:11626; Inflation `Text(rec, "0.00")` Y:11038; Start Year `Value(stored)` Y:1279 | `editContractForm` rules.ts:3231 | FIXED (9-14) |
| 9 | same, Individual Volumes | `ClearCollect(colRevenueHedgeIndividualVolume, ForAll(Filter(RevenueIndividualHedgeVolumes, …), {…, InitialState: false}))` Y:1468-1497 | `listIndividualVolumes` data/revenues.ts:190; Screen.tsx:445 | MATCH |
| 10 | `drp_…_Label_1.Items` / `DefaultSelectedItems` | `Choices('Revenue Labels')`; `LookUp(Choices(…), Value = locSelectedRevenueContract.Label)` Y:5427-5435 | `REVENUE_LABELS`, Screen.tsx:843 | MATCH |
| 11 | `drp_…_Label_1.OnChange`, description | `Concatenate(If(And(recAll…, exists), "Standard "), …)`, Italy `" Italy - " & Substitute(locAreaWithRegion, "Italy_", "")` Y:5591-5735 | `descriptionFor` rules.ts:555 *(Fabric)* | MATCH |
| 12 | same, currency | `locRevenueCurrency` = EUR on every branch (Poland/Romania commented) Y:5737-5783 vs the control default PLN for Poland | `revenueCurrencyCode` rules.ts:605 | DIVERGENCE (documented, ambiguity 7) |
| 13 | same, start date | `Value: If(exists, Switch(true, PV, If(csd.pv = "operationstartdatecod", recProjectCODDate), Wind, …, Today()), DateAdd(COD, 0, Days))`; `IsStandardAssumption: /*…*/true` Y:5786-5863 | `contractStartDate` rules.ts:626 *(standard branch Fabric)* | FIXED (1); hard-coded flag kept (ambiguity 5) |
| 14 | same, hedge type / hedged volume | `{Value: 'Hedged Volume [%]'}`; `Value: If(exists, Text(<tech>), Blank())` Y:5864-5907 | `standardHedgedVolume` rules.ts:2262 *(Fabric)* | MATCH |
| 15 | same, durations | `Value: If(exists, Value(<tech>), Blank())`, `IsStandardAssumption: exists` Y:5908-5993 | `contractDuration` rules.ts:658 *(Fabric)* | FIXED (2) |
| 16 | same, price / price p90 | exact `category = Text(Year(COD))`, else the year-vs-PRICE fallback Y:5994-6461 | `priceForYear` rules.ts:749 / `priceForYearCanvasParity` rules.ts:799 *(Fabric)* | DIVERGENCE (documented, SOURCE DEFECT ambiguity 1, V5 parked) |
| 17 | same, correction factors | `{Value: 1, StandardAssumptionValue: 1, IsStandardAssumption: true}` ×2 Y:6462-6479 | `correctionFactorDefault`; engine rules.ts:3141 | MATCH |
| 18 | same, inflation (4 parts) | `useinflation` / `usecountryinflation` / `inflationprofile ×100` / `inflationstartyear` → milestone year Y:6480-6790 | `inflation` rules.ts:940 *(Fabric)* | MATCH |
| 19 | same, custom value when no standard | `Value: If(exists, …, 0)` Y:6638-6705, shown `Text(rec, "0.00")` Y:11038 | engine rules.ts:3141 (`fmtTwoDecimals`) | FIXED (4) |
| 20 | same, end date | `If(And(start.IsStd, years.IsStd, months.IsStd), DateAdd(DateAdd(DateAdd(start, y, Years), m, Months), -1, Days), start)` Y:6795-6851 | `engineEndDate` rules.ts:717 | FIXED (3) |
| 21 | same, fixed value | `locRevenueContractHedgeFixedValue: {Value: Blank(), …}` Y:6852-6862 | engine rules.ts:3141 | MATCH |
| 22 | same, `locRevenuePriceActual` | German FiT `<> PV`: `Text(price * CF p50, "0.00")`, else `Text(Value(price), "0.00")` Y:6864-6888 | engine (`germanFitTariff` / `fmtPrice`) | MATCH |
| 23 | same, negative prices | `DisplayMode: If(And(active, _ProductionExist), Edit, Disabled)`, `ToggleState: If(_StandardSync, _ProductionExist, _InitialState)` Y:6889-6984 | `negativePriceState` rules.ts:1058 *(Fabric)* | MATCH |
| 24 | same, country re-lookup | `If(tgl_…Country….Checked, Max(LookUp('Country Inflation Profiles', Country, Year = Value(<start year>)).Inflation, 0))` (no Area) Y:7006-7051 | engine rules.ts:3141 (`countryInflationValue(…, false)`) | MATCH |
| 25 | same, `If(locMode = "New" \|\| locMode = "Edit", …)` | re-runs on Edit, keeps the selected contract Y:5443-5444 | `onType` Screen.tsx:450 | MATCH |

### Left section

| # | Canvas control | Live formula (quoted, YAML line) | Code (file:line) | Status |
|---|---|---|---|---|
| 26 | `txt_…_Description_1.Value` | `If(Not(IsBlank(Label.Selected.Value)), If(locStandardAssumtionContract = false, Substitute(recValue, "Standard ", ""), recValue), Blank())` Y:7195-7222 | `shownDescription` rules.ts:2086 | MATCH |
| 27 | `txt_…_Description_1.OnChange` | `locStandardAssumtionContract: false`, dirty Y:7173-7192 | `editField` rules.ts:2093; Screen.tsx:851 | MATCH |
| 28 | `txt_…_Description_1.FontColor/FontItalic` | `If(locStandardAssumtionContract, themePrimary)` / italic Y:7162-7172 | `revenuePanelStandard` rules.ts:1674 | MATCH |
| 29 | `lbl_…_Description_ErrorMessage_1.Visible/Text` | `And(locStd… = false, Or(StartsWith(Lower(v), "standard"), "standard" in Lower(v)))`; "Standard is applicable only for system-prefilled contracts." Y:7251-7262 | `validateDescription` rules.ts:1500 | MATCH |
| 30 | `drp_…_Currency_1` | `DefaultSelectedItems: If(Poland, PLN, EUR)`, `DisplayMode.Disabled` Y:7351-7363 | Screen.tsx:860 (`useRevenueCurrency`) | MATCH |
| 31 | `con_…_AreaInflationProfile_2` / `_3` | `Visible: =//…` (blank) Y:7392; `Visible: =false` Y:10048 | not rendered | MATCH |
| 32 | `dte_…_ContractStartDate_1.SelectedDate` | `If(Not(IsBlank(Label.Selected.Value)), locRevenueContractStartDate.Value)` Y:7616-7622 | `newContractForm` (blank before Type), Screen.tsx:871 | MATCH |
| 33 | `dte_…_ContractStartDate_1.OnChange` | start non-std; `locRevenueInflationStartYear: {Value: Year(SelectedDate), IsStd: false}`; end: `If(DateDiff(start, calc, Days) > 1, {Value: If(Or(IsBlank(start), IsBlank(y), IsBlank(m)), Blank(), calc)}, start)`; regenerate volumes Y:7598 | `withTerm` rules.ts:2131 | MATCH; blank-end term FIXED (7) |
| 34 | `dte_…_ContractStartDate_1.FontColor/FontItalic` | `And(loc….Value = Self.SelectedDate, loc….IsStandardAssumption)` Y:7577-7593 | `revenuePanelStandard` | MATCH |
| 35 | `ico_SetCODDate_RightPanelRevenue_1.OnChange` | engine start-date rule + `IsStandardAssumption: true`; end `If(DateDiff > 1, {IsStd: And(start, y, m)}, {IsStd: false, Value: start})`; no `locStandardAssumtionContract`; regenerate volumes Y:7568 | `resetStartToCod` rules.ts:2198; Screen.tsx:885 | FIXED (8) |
| 36 | same, `recCalculatedEndDate` from `dte_….SelectedDate` read before its `Reset` | Y:7568 | `resetStartToCod` uses the reset date | DIVERGENCE (documented, evaluation order) |
| 37 | `drp_…_Years_1.Items/DefaultSelectedItems` | `ForAll(Sequence(36), {Name: Value-1 & If(Value-1 <= 1, " year", " years")})`; `If(Not(IsBlank(Label)), LookUp(Years, Value = loc….Value))` Y:7781-7814 | `durationYearOptions` / `contractYearsOption`, `DurationPicker` Screen.tsx:325, 893 | MATCH |
| 38 | `drp_…_Years_1.OnChange` | years non-std; months `{Value: Coalesce(months.Value, First(recMonthsAvailable).Value), IsStd: false}`; end with guard (non-std); regenerate Y:7815-7900 | `withTerm` | FIXED (5, 6) |
| 39 | `drp_…_Months_1.Items/Default/OnChange` | months non-std and years `{Value: years.Value, IsStd: false}`; end with guard Y:7965-8070 | `withTerm` | FIXED (6) |
| 40 | `con_…_ContractDuration_1` caption | one `lbl_…_ContractDuration_1` "Contract Duration" with `*` Y:7646-7701 | one `Field` over two pickers, Screen.tsx:890 | FIXED (layout: it had two captions) |
| 41 | `dte_…_ContractEndDate_1` | `DisplayMode.Disabled`; `FontItalic: If(loc…EndDate.IsStandardAssumption, …)`; `SelectedDate: Text(loc….Value, ShortDate)` Y:8144-8174 | Screen.tsx:909 | MATCH |
| 42 | `con_…_BiddingPrice_1.Visible` (and SQ, CF, Tariff p90) | `And(Germany, Label = FiT, Technology <> PV)` Y:8202-8206, 8458, 8811, 9690 | `showsGermanFitBlock` rules.ts:868 | MATCH |
| 43 | `lbl_…_BiddingPrice_1.Text` | `$"Bidding Price [{If(Not(IsBlank(<country>.'ISO Currency Code')), … & "/MWh", "EUR/MWh")}]"` Y:8266 | `biddingPriceCaption(form.currencyCode)` rules.ts:2732 | MATCH (the block only shows for Germany, so both are "EUR/MWh") |
| 44 | `txt_…_BiddingPrice_1.Value` | `Text(locRevenueStandardValues.BiddingPrice, "0.00")` Y:8358-8368 | `fmtPrice` (engine / edit) | MATCH |
| 45 | `txt_…_BiddingPrice_1.OnChange` | `If(Not(<error>.Visible), {locStd…: false, locRevenuePrice: {IsStd: false}, locRevenuePriceP90: {IsStd: false}, IsBiddingPrice: false})`; dirty Y:8296-8336 | `editFieldIfValid` rules.ts:2120; Screen.tsx:920 | FIXED (17) |
| 46 | `lbl_…_BiddingPrice_ErrorMessage_1` | `IsValidCurrency` → `gblAppResx.NumericTwoDecimals`; `0…100` → "Please select a value between 0 and 100." Y:8397-8433 | `validateBiddingPrice` rules.ts:1442 | MATCH |
| 47 | `lbl_…_SiteQuality_1.Text`, CF caption, Tariff caption | `$"Site Quality {If(Germany & FiT & Wind, "p50")}"` Y:8523; CF Y:8875; Tariff `"Tariff / Price" & If(…Wind, " p50") & " [" & If(Poland, "PLN", "EUR") & "/MWh]"` Y:9309-9321 | `siteQualityCaption` / `correctionFactorCaption` / `tariffPriceCaption` rules.ts:2714-2728 | MATCH |
| 48 | `txt_…_SiteQuality_1.Value` / `_p90.Value` | `If(Int(x) = x, Text(x, "#"), Text(x, "#0.0#"))` Y:8547, 8716 | `fmtSiteQualityCell` (edit) | FIXED (11) |
| 49 | `txt_…_SiteQuality_1.OnChange` / `_p90.OnChange` | `UpdateContext({locRevenueContractFormDirty: true})` only Y:8543, 8712 | `touchField` rules.ts:2107; Screen.tsx:934, 942 | FIXED (18) |
| 50 | `lbl_…_SiteQuality_ErrorMessage_1` / `_p90` | "Numeric value with maximum of two decimals" / "Please select a value between 0 and 100." Y:8581-8616, 8750-8785 | `validateSiteQuality` | MATCH |
| 51 | `con_…_SiteQuality_p90` / `con_…_CorrectionFactor_p90.Visible` | `And(Germany, FiT, Technology = Wind)` Y:8634, 9003 | `showsP90Block` rules.ts:1699 | MATCH |
| 52 | `txt_…_CorrectionFactor_1.Value` / `_p90.Value` | `If(IsBlank(<std value>), "1.000", Text(x, "#0.000"))` Y:8915-8922, 9133-9141 | engine `cfText`; `editContractForm` | FIXED (9) |
| 53 | `txt_…_CorrectionFactor_1.OnChange` / `_p90.OnChange` | `locStd…: false`, CF `IsStd: false`, `IsCorrectionp50/90: false` (no error guard) Y:8912, 9098-9130 | `editField`, Screen.tsx:950, 963 | MATCH |
| 54 | `lbl_…_CorrectionFactor_ErrorMessage_1` / `_p90` | `IsThreeDecimal` → `NumericThreeDecimals`; `< 0.5 or > 2` → "Please select a value between 0.5 and 2" Y:8952-8984, 9192-9230 | `validateCorrectionFactor` rules.ts:1453 | MATCH |
| 55 | `txt_…_CorrectionFactor_p90.FontItalic` | `If(IsCorrectionp90, …)` (the value test is commented out) Y:9087-9097 | `revenuePanelStandard` | MATCH |
| 56 | `txt_…_TariffPrice_1.Default` | German FiT `<> PV`: `Text(Value(Bidding) * Value(CF), "0.00")`, else `Text(locRevenuePrice.Value, "0.00")` Y:9438-9461 | engine / `editContractForm` / Screen.tsx:920, 950 | MATCH (new); edit FIXED (10) |
| 57 | `txt_…_TariffPrice_1.DisplayMode` | `If(And(Germany, FiT, <> PV), Disabled, Edit)` Y:9463-9471 | Screen.tsx:978 | MATCH |
| 58 | `txt_…_TariffPrice_1.OnChange` | 1. any text change (not disabled) → `locStd…: false`, price `IsStd: false`; 2. only a valid number updates the value Y:9515-9600 | `editField` + valid-only `tariffP90`, Screen.tsx:978 | MATCH |
| 59 | `lbl_…_TariffPrice_ErrorMessage_1` | `IsError(Value(text))` → `gblAppResx.Numeric`; range `0…If(Poland, 750, 150)`; `Visible` ends `If(DisplayMode = Disabled, false, true)` Y:9653-9671 | `validateTariff` rules.ts:1431 | MATCH |
| 60 | `txt_…_TariffPrice_p90` | `DisplayMode: If(And(Germany, FiT), Disabled, Edit)`; `Value: If(Germany & FiT, Text(Value(Bidding) * Value(CF_p90), "0.00"), Text(locRevenuePrice.Value, "0.00"))`; error suppressed while disabled Y:9767-10030 | `tariffP90Text` rules.ts:2068; Screen.tsx:992 | MATCH |
| 61 | `txt_…_TariffPrice_p90.FontColor/FontItalic` | German FiT: `And(locRevenuePrice.Value = Value(Bidding), locRevenuePrice.IsStd, locRevenueCorrectionFactorP50.IsStd)` Y:9774-9850 | `revenuePanelStandard` (`tariffP90 = tariff`) | MATCH |

### Right section

| # | Canvas control | Live formula (quoted, YAML line) | Code (file:line) | Status |
|---|---|---|---|---|
| 62 | `tgl_…_InflationProfile_1` | `Checked: If(Not(IsBlank(loc….Value)), loc….Value = "true", false)`; `DisplayMode: If(And(Germany, FiT), Disabled, Edit)`; `OnCheck/OnUncheck`: `locStd…: false`, `IsStd: false` Y:10403-10497 | Screen.tsx:1006 | MATCH |
| 63 | `con_…_InflationToggles_1.Height` + `tgl_…_CountryInflationProfile_1.Y` | `If(tgl_…_InflationProfile_1.Checked, 76, 36)`; country toggle at `Y: =40` Y:10195-10243 | `showsCountryInflationToggle` rules.ts:2245; Screen.tsx:1013 | FIXED (23) |
| 64 | `tgl_…_CountryInflationProfile_1.OnCheck` | `locStd…: false`; value `Max(LookUp(…, Country, Year = Value(<start year>)).Inflation, 0)`, `IsInflationValue: false` Y:10265-10342 | `toggleCountryInflation` rules.ts:3293 | MATCH; "0.00" FIXED (15) |
| 65 | `tgl_…_CountryInflationProfile_1.OnUncheck` + `txt_…_InflationProfile_1.Value` | `InflationValue: Blank()`; `rec: If(edit && Not(checked), <stored 'Inflation Profile'>, …)` Y:10343-10394, 11009-11013 | `toggleCountryInflation` (`storedInflationProfile`) | FIXED (15) |
| 66 | `con_…_InflationStartYear_1.Visible` | `tgl_…_InflationProfile_1.Checked` Y:10548 | Screen.tsx:1023 | MATCH |
| 67 | `txt_…_InflationStartYear_1.OnChange` | `If(Not(<error>.Visible), {locStd…: false, IsInflationStartYear: false})`; then, OUTSIDE that `If`, `If(country.Checked, <lookup>, Italy + Area)` Y:10612-10705 | `changeInflationStartYear` rules.ts:3312 | FIXED (16) |
| 68 | `txt_…_InflationStartYear_1.Value/Placeholder/FontColor` | `locRevenueInflationStartYear.Value`; "YYYY"; std pair Y:10595-10719 | Screen.tsx:1026 | MATCH |
| 69 | `lbl_…_InflationStartYear_ErrorMessage_1` | `Not(IsMatch(v, "^\d{4}$"))` → "Year value must be in format YYYY." Y:10577-10584 | `validateInflationStartYear` rules.ts:1490 | MATCH |
| 70 | `con_…_InflationProfile_1` caption, asterisk | `If(country.Checked, "Country Inflation Profile", "Custom Inflation Profile [%]")`; asterisk `Not(country.Checked)` Y:10831-10864 | `inflationProfileFieldCaption` rules.ts:2740 | MATCH |
| 71 | `txt_…_InflationProfileCountry_1` | `Visible: country.Checked`; `If(Italy, " Italy - " & Substitute(locAreaWithRegion, "Italy_", ""), Country.Name)`; Disabled Y:10869-10894 | Screen.tsx:1037 | MATCH |
| 72 | `txt_…_InflationProfile_1.Value` | `Text(rec, "0.00")` Y:11007-11040 | `fmtTwoDecimals` | FIXED (13, 4) |
| 73 | `txt_…_InflationProfile_1.OnChange` | `If(Not(<error>.Visible), {locStd…: false, IsInflationValue: false})`; dirty Y:10926-10959 | `editFieldIfValid`, Screen.tsx:1044 | FIXED (17) |
| 74 | `lbl_…_InflationProfile_ErrorMessage_1` | `IsTwoDecimal` → "Numeric value with maximum of two decimals."; `0…100` Y:11073-11108 | `validateInflationProfile` rules.ts:1483 | MATCH |
| 75 | `tgl_…_Consider_Negative_prices` | `Checked: ToggleState`, `DisplayMode: loc….DisplayMode`; `OnCheck/OnUncheck`: `ManualOverride: true`, dirty only Y:11133-11172 | `touchField`, Screen.tsx:1060 | FIXED (20, 22) |
| 76 | `ico_SyncNegativePrice_RightPanelRevenue` (PCF) | `Visible: =//And(…)` (blank, so not shown) Y:11291 | the visible icon is `Icon1`, rendered under this existing test id | MATCH |
| 77 | `Icon1.OnSelect / Visible / Tooltip` | re-sync (`ManualOverride: false`), dirty; `Visible: DisplayMode = Edit`; `If(Not(ManualOverride), "Any change of this option will remove the sync to the input from Production tab.", "Sync with input from Production tab.")` Y:11316-11427 | `resyncNegativePrice` rules.ts:2220; Screen.tsx:1065-1074 | FIXED (21); visibility / tooltip MATCH |
| 78 | `rad_ProjectRevenue_HedgeType.Items` | `If(And(start, years, months non-blank), Choices('Hedging Type'), Filter(…, Not(Value = 'Individual Volumes')))` Y:12276-12295 | `hedgeTypeOptions` rules.ts:1088 | MATCH |
| 79 | `rad_ProjectRevenue_HedgeType.Default/OnChange` | `LookUp(Choices, Value = loc….Value)`; % → clear volumes, fixed `InitialState: true`; fixed → clear %, `IsHedgedVolume: false`; individual → `Select(btn_…Recalculate)`, clear % and fixed Y:12256-12410 | `resetOnHedgeTypeChange` rules.ts:1106; Screen.tsx:1083 | MATCH |
| 80 | `txt_…_HedgedVolume_1.Value` | new: `locRevenueStandardValues.HedgedVolume`; edit: `If(Int(v) = Value(v), Text(v, "0"), Text(Value(v), "#0.0#"))` Y:11626-11640 | `editContractForm` | FIXED (12) |
| 81 | `txt_…_HedgedVolume_1.OnChange` | `If(Not(<error>.Visible), {locStd…: false, IsHedgedVolume: false})` Y:11562-11596 | `editFieldIfValid`, Screen.tsx:1100 | FIXED (17) |
| 82 | `lbl_…_HedgedVolume_ErrorMessage_1` | `IsOneDecimal` → "Numeric value with maximum of one decimals"; `0…100` Y:11669-11704 | `validateHedgedVolumePercent` rules.ts:1463 | MATCH |
| 83 | `txt_…_FixedVolume` | `Default: …ValueText`; `OnChange`: `{Value: If(IsMatch(Trim, "^[0-9]+$"), Value, Blank()), InitialState: false}`, dirty only Y:11788-11829 | `touchField`, Screen.tsx:1113 | FIXED (19) |
| 84 | `lbl_…_FixedVolume_ErrorMessage` | `Len(raw) > 0` and (not whole, or `> Coalesce(IfError(Value('Net Yield p50'), Blank()), 0)`): "Number with no decimals" / "The Hedged Volume may not exceed the project's Net Yield p50" Y:11860-11920 | `validateVolumeMwh` rules.ts:1475 | MATCH |
| 85 | `btn_IndividualHedgeVolumeDuration_Recalculate.OnSelect` | `ForAll(Sequence(EndYear - StartYear + 1, StartYear), {StartDate, EndDate (partial first / last year), InitialState: true})` Y:205-264 | `generateVolumeRows` rules.ts:1140 | MATCH |
| 86 | `gal_…_IndividualVolumeDetails` | `Items: Sort(col, StartDate)`; Year `Default`: full calendar year → `Text(Year)`, else `"dd.mm.yyyy - dd.mm.yyyy"`; Value `OnChange`: `InitialState: false`, dirty only; error as #84 Y:11939-12157 | `volumeRowLabel` rules.ts:1162; `touchField`, Screen.tsx:1126-1145 | MATCH; OnChange FIXED (19) |

### Save

| # | Canvas control | Live formula (quoted, YAML line) | Code (file:line) | Status |
|---|---|---|---|---|
| 87 | `pcf_…_BodyButtons_Save_1.DisplayMode` | subaccount; no Tariff error; Label, `Trim(Description)`, Currency, Tariff, Start, Years, Months, End non-blank; the hedge-type `Switch`; the German FiT `<> PV` and `= Wind` blocks; no Description error; the inflation block; `locRevenueContractFormDirty = true` Y:12438-12536 | `canSaveRevenueContract` rules.ts:1717 | MATCH |
| 88 | `pcf_…_Save_1.OnChange` + `cmp_PopUp_Confirmation_PopUp_AddEdit_Individual_Volume` | Individual Volumes → confirmation "Confirm Individual Volumes", else `Select(btn_…SaveFunctionality)` Y:12551-12560, 12726-12742 | `needsIndividualVolumesConfirmation` rules.ts:1774; Screen.tsx:501, 1288 | MATCH |
| 89 | `btn_ProjectRevenue_AddEdit_SaveFunctionality`, 100 % check | per month `Sum(Filter(varAllContractsInTimeframe, start <= EOMonth(m), end >= Date(Y, M, 1)), 'Hedged Volume') + Value(txt_…HedgedVolume_1.Value) > 100`, only for the % type Y:4705-4787 | `validateHedgedVolume` rules.ts:1238 (overlaps in ONE server query) | MATCH; the query is DIVERGENCE (documented, D33); `Value()` parse FIXED (24) |
| 90 | same, the failure | `"Hedged Volume exceeds 100% in total in a specific timeframe." & Char(10) & "From  " & Text(First, "mm.yyyy") & "  to  " & … & "."`; the panel stays open Y:5115-5141 | `hedgeExceededMessage` rules.ts:1222; Screen.tsx:1298 | MATCH |
| 91 | same, the `Patch('Project Revenues', …)` columns | Name, Project, Subaccount, Label, Description, Currency, the German FiT numbers (0 when hidden), Tariff `Value(.Text)`, Tariff p90, dates / durations, the inflation group (0 when off), `'Inflation Country Area'`, the Owning Business Unit, the fourteen flags, Consider Negative Prices, the override, Hedge Type, Hedged Volume (% or 0), FixedContractedmwhpa Y:4806-4994 | `buildRevenuePayload` rules.ts:1915, `revenueContractRecord` | MATCH |
| 92 | same, `'Is Use Custom Inflation Standard Assumption?'` | `And(tgl.Visible, locRevenueInflationCountryProfile.StandardAssumptionValue)` Y:4932-4939 | `buildStandardFlags` / `…CanvasParity` rules.ts:1824-1829 | DIVERGENCE (documented, D33 SOURCE DEFECT 1) |
| 93 | same, the volume writes, refresh, error | `RemoveIf(RevenueIndividualHedgeVolumes, …)` for EVERY type, then one `Patch` per row with the owner; reselect and unfold; `Notify("Error: Contract could not be saved correctly. Internal error: originated on " & FirstError.Source & …)` Y:4997-5061 | `planSaveContract` rules.ts:2956; `saveErrorText` rules.ts:3083; Screen.tsx:464 | MATCH |

**Also documented, not a separate row:** `cmp_Information_Button_RevenueEditForm_1` collects the
errors in an info button (Y:5147-5159), while this app shows each error inline (D33 U22). The
balancing-price panel (`…_NewEditContract_2`) is out of this audit's scope. It was audited in D33.

## Open questions (product owner)

1. **Fixed Volume `AccessibleLabel`.** On the canvas, `txt_…_FixedVolume` carries the
   `AccessibleLabel` `"txt_ProjectRevenues_RightPanel_NewEditCost_BodyContent_HedgedVolume_1"`
   (Y:11786), a copy-paste. This app keeps its existing `aria-label`, the control's own name,
   because rule 16 says "never change an existing value". Should Tosca get the canvas label instead?
2. **Reset to COD evaluation order** (row 36). The end date is computed from the reset date, not
   from the date the picker showed before it reset. Please confirm.
3. **Layout values.** These were taken from the PO screenshot where it differs from the 1.21.709
   YAML. Please confirm them:
   - the panel is 860 wide (the YAML has `Min(760, …)`);
   - the add buttons have a 1-px outline (the YAML has 2 px);
   - the card header rule is dark (the YAML uses the theme blue).
