# Gap analysis: Project General Milestones Screen → `src/features/pm/milestones`

Canvas: `ProjectDocs/_extracted/msapp/projectmanagement/Src/Project General Milestones Screen.pa.yaml` (5014 lines, read in full; `L` = YAML line). The extract is solution **1.21.709** (CONVENTIONS rule 16). Code paths are relative to `ProjectCosts-CodeApp/src/features/pm/milestones/` unless a path is given. The screen is "UI built, not connected" (D14). `hooks.ts` returns `notConnected()` and writes are disabled, so missing wiring is reported, but it is expected at this stage.

## Status counts

| Status | Data | Behaviour | State | UI | **Total** |
|---|---|---|---|---|---|
| COVERED | 19 | 6 | 8 | 11 | **44** |
| PARTIAL | 7 | 2 | 3 | 3 | **15** |
| WRONG | 7 | 2 | 1 | 5 | **15** |
| MISSING | 1 | 5 | 0 | 0 | **6** |
| | 34 | 15 | 12 | 19 | **80** |

## Flows verdict

The canvas makes **no live flow call**. Its only flow reference, `'ForaProjecttriggerFabricDEVEX/CAPEXrecalculation'.Run(gblRecordSelectedProject.Project, locActiveProjectFabricRecalculateJob.'Fabric Sync Job')` (L495–500), sits inside a `/* … */` block (L475–501) with the `Patch('Fabric Sync Jobs', Defaults(...), {'Job Status': Dirty, 'Job Type': "Project Milestones changed"})`. The only live Fabric dependency is read-only: `Icon3.Visible` filters `'Fabric Sync Jobs'` by `'Job Type'.Name = "Project Milestones changed"` and `'Job Status' in ['In Progress', Importing]` (L4180–4191).

Plan 010 says the screen is "INCOMPLETE - missing per-project Fabric recalculation flow" (§3, §12, §22). The live canvas does not support that blocker. The code handles it correctly with `FABRIC_SYNC_NOTE` (rules.ts:45–51).

Plan 010 has three other errors:
- It lists "Permits" and "PowerCAT CommandBar". Neither is on this screen; the only PCF here is `cat_PowerCAT.Icon`.
- §1.21.753 says the accessible labels are wired through `a11yFor("Project General Milestones Screen")` in Screen.tsx. No `a11yFor` exists in `src/`.

---

## 1. Data

| # | Requirement (canvas) | Code | Status |
|---|---|---|---|
| D1 | `OnVisible` re-reads the project with `LookUp(Projects, Project = gblRecordSelectedProject.Project)` (L51–57). Columns used: `'Project Name'` (L1018), `'Project ID'` (L1337), `'Erstellt von'`/`'Geändert von'`/`'Erstellt am'`/`'Geändert am'` (L4025–4139), and Country `'Business Unit'` (L417). | hooks.ts:83–85 (stub). The `$select` plan (hooks.ts:10–20) leaves out `vsb_projectname` ('Project Name'; `vsb_name` is 'Project ID'), the created/modified-by names, and the country's `vsb_businessunit`. | PARTIAL |
| D2 | `CanEditSelectedProject = DataSourceInfo(Projects, CreatePermission) && RecordInfo(EditPermission)` (L58–78), used by the Save gate (L4729–4739). | `canSaveMilestones` exists (rules.ts:332–344), but Screen.tsx:370 never calls it and passes no permissions. | PARTIAL |
| D3 | `locSelectedStartClusterNo` from the `'Start Cluster'` Switch (L83–107). | `startClusterNo` (re-exported, rules.ts:42) | COVERED |
| D4 | Labels: `Filter('Project States', Order > 0, 'Is Visible On Checklist')`, sorted by `Text(Order)`, projected to `'Cluster Description'` (L111–131). | `milestoneLabels` (rules.ts:598–604) sorts numerically; the SOURCE DEFECT is documented. hooks.ts:21–23 plans `vsb_order`/`vsb_isvisibleonchecklist`/`vsb_clusterdescription`, and all three are verified in dataverse-attributes.json. | COVERED |
| D5 | `locProjectCluster1..6Date` defaults to `'Acquisition date'` when the start cluster is n and `'End Date'` is blank (L143–190). | `initialDates` (rules.ts:218–235) | COVERED |
| D6 | `locProjectFidDate`, `locProjectEndDate`, `locSalesStartDate`, `locSalesEndDate` are read from the record (L191–194). | `initialDates` spreads `p.dates` (rules.ts:227) | COVERED |
| D7 | `locShareOfFarmdown = Coalesce(...,50)`; the standard flag is `Coalesce(..., Yes)` (L195–206). | `initialForm` (rules.ts:238–245) | COVERED |
| D8 | Nine `loc…StandardAssumption` flags are read from the record (L226–274). | `initialForm` copies `standardAssumption` (rules.ts:241) | COVERED |
| D9 | Assumption row: `colMilestonesAssumptions` (App.pa.yaml L1503–1506) filtered by `Name = "average duration [months]"` (App L1202), `Country.Country` and `Technology` (e.g. L1810–1819). The canvas reads the columns `'Cluster 1'..'Cluster 4'`, `'Final Investment Decision'`, `'Cluster 5'`, `'Operational Lifetime'`, `'Sales Start'` and `'Sales End'`. | `MilestoneAssumptionRow` = cluster1..**cluster6** (rules.ts:354–361); the `$select` is `vsb_cluster1 … vsb_cluster6` (hooks.ts:24–27). **`vsb_cluster6` does not exist.** The table has `vsb_cluster1..5`, `vsb_finalinvestmentdecision`, `vsb_operationallifetime`, `vsb_salesstart` and `vsb_salesduration` ("Sales End") (dataverse-attributes.json; `generated/models/Vsb_milestonesstandardassumptions*Model.ts:42–47`). | WRONG |
| D10a | Recalculate mapping: C2 ← C1 + `'Cluster 1'` (L1808–1820), C3 ← C2 + `'Cluster 2'` (L1978–1990), C4 ← C3 + `'Cluster 3'` (L2198–2210), FID ← C4 + `'Cluster 4'` (L2504–2531), **C5 ← FID + `'Final Investment Decision'`** (L2647–2659), **C6 ← C5 + `'Cluster 5'`** (L2816–2828). | rules.ts:388–389: `Construction ← FID + cluster5` and `OperationsStartDate ← C5 + cluster6`. Canvas uses `'Final Investment Decision'` and `'Cluster 5'`. | WRONG |
| D10b | End Date ← `DateAdd(DateAddMonths(C6, Coalesce('Operational Lifetime', 30*12)), -1, Days)` (L3849–3868). Sales Start ← C4 + `'Sales Start'` (L3066–3078). Sales End ← FID + `'Sales End'` (L3232–3244). | `recalculateMilestone` has no entry for EndDate, SalesStartDate or StartCompleted (rules.ts:383–391), so those three buttons do nothing. The canvas also sets the date (with flag = true) when the row is missing (`DateAdd` with blank months); the code returns early (rules.ts:392). | MISSING |
| D11 | Each recalculate sets its `…StandardAssumption: true` and marks the row dirty (e.g. L1836, L2666, L3094, L3271, L3871). | rules.ts:395–399; Screen.tsx:185–188 | COVERED |
| D12 | FID `OnChange` (L2338–2471): `locNeedPlantCostsRecalculation` is set; it then loads `GeneratorTypeInProjects` for the project (L2344–2353) and `'Estimation Price Inflations'` by `'FID Year'` for the current and previous year (L2368–2375). It computes the index (L2394) and the price ladder plus foundation (L2408–2450), then `Patch(colProjectGenerators, …, {'Generators Cost'})` (L2456–2463). | The rules exist: `accumulatedIndex` (rules.ts:512–523), `repriceGenerators` (540–552), `needsPlantCostRecalculation` (555–560). Screen.tsx never calls `useProjectGeneratorsForRepricing` or `usePriceInflation`, and no FID change triggers repricing. Divergences: a missing inflation row gives index 1 (canvas: Blank, so 0), and the code rounds to 2 dp with `pfxRound` (canvas: no rounding). | PARTIAL |
| D13 | Generator columns: `'Number of Generators'`, `Generator`, `'Generators Cost'`, `'1..5 WTG price'`, `'Additional foundation cost'`, `'Foundation cost included'` (L2405–2420, L2462). | hooks.ts:40–44 plans `vsb_count`, `_vsb_generatortype_value`, `vsb_totalcosteur` and `vsb_price1wtg…vsb_price5wtg`; rules.ts:1171 writes `vsb_totalcosteur`. The real names are `vsb_numberofgenerators`, `_vsb_generator_value` and `vsb_generatorscost` (`generated/models/Vsb_generatortypeinprojectsModel.ts:38,41,81`), and `vsb_wtgprice`, `vsb_wtgprice2..5` (`Vsb_generatorsModel.ts:58–62`). | WRONG |
| D14 | `Patch(Projects, …)` payload (L355–424): start/C1–C4 blanked at n ≥ 1..5, plus FID, C5, COD, End, Sales Start, `'Sales completed'`. Flags 2/3/4 are set to false at n ≥ 3/4/5; then FID/C5/COD/Sales/End flags. | `planSaveMilestones` (rules.ts:1113–1150) plus `clearSkippedMilestones` (general-data/rules.ts:1028–1043) | COVERED |
| D14b | `'Is 2-Project development Standard Assumption ?'` (L395–399, L229) | `PROJECT_COL.isProjectDevelopmentStd = "vsb_is2projectdevelopmentstandardassumption"` (general-data/rules.ts:84). This name appears in neither dataverse-attributes.json nor `generated/models/Vsb_projectsModel.ts` (that model has is3/is4/is5 at :151–153). It is unverified and probably guessed. | WRONG |
| D15 | `'Besitzer (Unternehmenseinheit)': gblRecordSelectedProjectCountry.'Business Unit'` (L417) | rules.ts:1148–1149 (`countryBusinessUnitId`) | COVERED |
| D16 | `'Operational Lifetime': $"{Years.Value} {Months.Value}"` (L416) | rules.ts:1144 | COVERED |
| D17 | `'Share of Farmdown': Value(txt…)` and `'Is Standard Share of Farmdown?'` (L421–422) | rules.ts:1145–1146 | COVERED |
| D18 | Write order when re-pricing: Patch Projects, then reload, then `Patch(GeneratorTypeInProjects, colProjectGenerators)`, then a second `Patch(Projects, {'Plant WTG Cost [EUR]': Sum(...)})` (L355–474). | The plant cost is folded into the first project patch, and the generators are written second (rules.ts:1152–1174). The order divergence is noted only in a code comment. | PARTIAL |
| D19 | Seed gate: `'Cluster State'.Name in ["Draft","Cluster 1"]` and `CountRows(Filter('Project Revenues', Project = …)) = 0`, plus a revenue type exists (L509–521, L587–588). | `buildDefaultRevenue` (rules.ts:964–975); `useRevenueRowCount` (hooks.ts:101–103) | COVERED |
| D20 | `recCountryAssumptions = Filter('Assumptions Revenues SQL', country = Country.Name)` (L527–530) | `isInRevenueSlice` uses `startsWith("Italy")` for Italy (rules.ts:658–659; hooks.ts:33–36). This follows 1.21.753 (plan 010 L236), not this extract. | WRONG (vs 1.21.709) |
| D21 | Italian region map uses `"Italy_Centre - South"` / `"Italy_Centre - North"` with spaces (L302–341). | `"Italy_Centre-South"` / `"Italy_Centre-North"` (rules.ts:623–646), per 1.21.753 | WRONG (vs 1.21.709) |
| D22 | `recFilteredPrices = Filter(recCountryAssumptions, valuetype = "price")` with no region filter (L833–836) | `revenuePricePool` keeps only the region's rows for Italy (rules.ts:666–675), per 1.21.753 | WRONG (vs 1.21.709) |
| D23 | The revenue type comes from the `revenuetype` row; the wind branch reads `.pv` (L558–577, defect). | `revenueLabelFor` keeps the defect by default (rules.ts:694–706) | COVERED |
| D24 | Sub-contract switch (L594–700). The decision year defaults to `Year(COD)` when no row exists (L643). | `subContractSwitch`/`effectiveTypeToken` (rules.ts:721–769). With no row, `decisionYearUp` is null and the base type is kept, so the `Year(COD)` default is lost. The Italy path `.trim()`s the token (rules.ts:786), which removes the canvas's double space. | PARTIAL |
| D25 | Description text: Italy `"Standard … Italy - <zone>"`, otherwise EEG/CfD/`<type> ` + country (L701–768) | `describeRevenue` (rules.ts:772–795) | COVERED |
| D26 | Price pick: exact COD year, clamp, nearest (L830–904) | `pickPrice` (rules.ts:824–852). The canvas compares a price to a year; the code corrects this as a SOURCE DEFECT and documents it. | COVERED |
| D27 | Contract start = COD; end = +years +months −1 day (L775–779, L1059–1072) | `contractDates` (rules.ts:801–811) | COVERED |
| D28 | Inflation flags, custom value and start-year token (L905–1011) | `inflationSettings` (rules.ts:862–890) | COVERED |
| D29 | `Patch('Project Revenues', Defaults(...), {…})` payload (L1013–1129). `Currency: LookUp(Currencies, 'Currency Code' = "EUR")` (L771–774). | `buildDefaultRevenue` data (rules.ts:1012–1050). `REVENUE_COL` (rules.ts:919–952) cannot be verified: vsb_projectrevenues is in neither the attributes JSON nor `generated/`. The currency binds to `ES.currencies = "vsb_currencies"` (rules.ts:1046; hooks.ts:37), but the registered source is `transactioncurrencies` (power.config.json `currencies`; `TransactioncurrenciesModel.ts`). Tariff is 0 where the canvas writes Blank. | PARTIAL |
| D30 | `Subaccount: First(colRevenueSubaccounts)`, sorted by `Order` (App L603–610) | hooks.ts:37–39 | COVERED |
| D31 | COD-guard query: `'Project Revenues'` with `'Hedge Type' = 'Individual Volumes'`, the project, and `'Is Contract Start Date Standard Assumption?' = Yes` (L4783–4790) | hooks.ts:28–30, 97–99 | COVERED |
| D32 | The `'Fabric Sync Jobs'` read (L4180–4191) and `'Estimation Price Inflations'` (L2368) | Both are stubbed (hooks.ts:117–125). `TABLES` (hooks.ts:68–77) lists neither, although `ES.fabricSyncJobs`/`ES.estimationPriceInflations` exist (dataverseNames.ts:21, 24). The JSDoc (hooks.ts:45, 49, 64–66) wrongly says they are "NOT in dataverseNames.ts". | PARTIAL |

## 2. Behaviour

| # | Requirement (canvas) | Code | Status |
|---|---|---|---|
| B1 | `OnVisible` sequence: re-read, permissions, start cluster, labels, local dates and flags, then `Select(Reset_Validation)` and `Reset(...)` of all pickers (L51–274) | `useMemo(initialForm)` (Screen.tsx:167); validation is recomputed on each render (Screen.tsx:176) | COVERED |
| B2 | `OnHidden` clears the locals and `colMilestonesFormValidation` (L21–49) | Component unmount | COVERED |
| B3 | Date `OnChange`: UpdateIf Valid/Dirty, then `If(SelectedDate <> loc, set loc; flag false; Select(Recalculate))` (L1587–1623, 1701–1713, 1862–1879, 2037–2054, 2161–2178, 2709–2727, 2869–2898, 3008–3026, 3159–3176, 3927–3939). The FID row's Dirty is `Not(stored FID = SelectedDate)` (L2335). | `setDate` / `editMilestone` (Screen.tsx:184; rules.ts:406–416). FID is always marked dirty, even when it is set back to the stored value. | PARTIAL |
| B4 | One validation pass: `btn_…_Recalculate` (L4384–4634) and `btn_…_Reset_Validation` (L4201–4344) | `validateMilestones` (rules.ts:261–312) | COVERED |
| B5 | Save (`pcf_btn_…_Save.OnChange`, L4774–4802): if the COD guard is hit, show the warning; otherwise `Select(btn_Project_Milestone_Save)`, which runs the whole save at L280–1158. | `onSave` (Screen.tsx:191–199) only opens the COD dialog; `planSaveMilestones` is never executed. Deferred by D14. | MISSING |
| B6 | COD review confirm: close, then `Select(btn_Project_Milestone_Save)` (L4993–4995) | Screen.tsx:407 only closes | MISSING |
| B7 | Saving overlay `cmp_PopUp_Milestones_Saving_Dialog` showing "The project is being saved, please wait.." (L285–286, L5007–5014) | `MILESTONES_MSG.saving` (rules.ts:1289) is defined but never rendered | MISSING |
| B8 | Success `Notify(Concat(colProcessingSteps, "{Value} \n"), Success)` (L501–508). The steps are "Project data was saved/updated successfully." (L428) and "Plant WTG Cost (WTG's: n), was recalculated and updated successfully." (L469–472). | Logs at rules.ts:1159 and 1166 match. rules.ts:1179 adds **"A default revenue contract was created."**, which the canvas does not have; it seeds silently after the Notify. | WRONG |
| B9 | Error `Notify("Error: Project could not be saved. " & "Internal error: originated on " & FirstError.Source & ". Message: " & FirstError.Message & FirstError.Details.HttpResponse, Error)` (L1140–1143) | Absent | MISSING |
| B10 | After saving: re-read the project (L430–436), `UpdateIf(..., {Valid: true, Dirty: false})` (L437–444), reset the local farmdown and flags (L1145–1157). | `resetValidationAfterSave` (rules.ts:1192) is a stub; the Screen does nothing after a save. | PARTIAL |
| B11 | Cancel (`pcf_btn_…_Reset.OnChange`, L4842–4916) restores the local dates to the **stored** values (not the acquisition default) and the nine flags, then resets 10 pickers. It does **not** reset farmdown or the `Dirty` rows. | `onCancel` (Screen.tsx:200) goes back to `initialForm`, which applies the acquisition default (rules.ts:224), resets farmdown and clears dirty. | WRONG |
| B12 | Farmdown reset icon: 50, standard = true, Reset, re-validate (L3564–3587) | `resetShareOfFarmdown` (rules.ts:451–453); Screen.tsx:308 | COVERED |
| B13 | Farmdown `OnChange`: standard = false, re-validate (L3520–3542) | Screen.tsx:293–296 | COVERED |
| B14 | Leave guard: header logo (L1192–1205) and left nav (L1262–1285) open `locLeaveMilestonesConfirmationDialog` when anything is dirty. Confirm navigates to `gblLeftNavigationSelected.TargetScreen` or `'Project Main Screen'` (L4953–4977). | `leaveOpen` is never set to true (only to false at Screen.tsx:397); `shouldConfirmLeave` (rules.ts:1199) is unused; there is no navigation blocker. | MISSING |
| B15 | Flow and Fabric job insert are commented out (L475–501) | Not ported; `FABRIC_SYNC_NOTE` (rules.ts:45–51) | COVERED |

## 3. State gates and validation

| # | Requirement (canvas) | Code | Status |
|---|---|---|---|
| S1 | `con_Milestones_Page_LockMessage.Visible = IsBlank('Project ID')` (L1337) | `isPageLocked` (rules.ts:328); Screen.tsx:174, 258 | COVERED |
| S2 | Pickers, farmdown and reset icon are disabled when locked (L1583, 1699, 1858, 2032, 2157, 2320, 2705, 2865, 3004, 3155, 3923, 3517, 3557) | Screen.tsx:230, 292, 307 | COVERED |
| S3 | Recalculate `DisplayMode` depends only on the predecessor not being blank, **with no lock gate** (L1801, 1966–1971, 2191, 2490, 2640, 2809, 3053–3058 [C4], 3219–3224 [FID], 3831–3836 [C6]) | Screen.tsx:242 adds `!editable`, so the lock disables them too | PARTIAL |
| S4 | Recalculate `Visible` only for Wind/PV (L1838–1842 and so on); the two Sales buttons have no `Visible` | `isRecalculateVisible` (rules.ts:1228); Screen.tsx:213–214 | COVERED |
| S5 | Containers visible by start cluster: Start `= 0`, C1 `<= 1`, C2 `<= 2`, C3 `<= 3`, C4 `<= 4` (L1544, 1664, 1763, 1928, 2122) | `isMilestoneFieldVisible` (rules.ts:1208–1221) | COVERED |
| S6 | Field error labels, text verbatim (L1643, 1734, 1781, 1946, 2257, 2577, 2749, 2920, 3288, 3804), shown per their `Visible` formulas. The canvas hides "later than" when the predecessor is blank, e.g. L1742 and L2753 (`date <= Blank()` is false). | Texts match exactly (`MILESTONE_FIELD_ERROR`, rules.ts:1299–1310). Visibility comes from `validation[k].valid` (Screen.tsx:211), which also shows the error when the predecessor is blank. | PARTIAL |
| S7 | "Required fields" InfoButton content = `Text` of each invalid row (L4688–4696). The `Text` values (L4210–4341) are: "Check input for Project Start date.", "Check input for Cluster 1 date.", "…Cluster 2 date.", "…Cluster 3 date.", "…Cluster 4 date.", "Check input for Final Investment Decision date.", "…Cluster 5 date.", "Check input for Cluster 6 Date.", "Check input for End Date.", "Check input for Sales Start Date.", "Check input for Sales Completion Date.", "Check input for Share of Farmdown [%]." | `MILESTONE_CHAIN[].text` (rules.ts:127–157) uses `orderingMessage` for C1–C4, FID, C5, COD, End and Sales Completion, e.g. "The date needs to be later than Cluster 3 date." instead of "Check input for Cluster 4 date.". UT-MSTONE-047..053 (rules.test.ts:176–245) lock in the wrong text. | WRONG |
| S8 | Save enabled when permitted, no invalid rows, any row dirty, and not locked (L4726–4756) | Screen.tsx:370 checks everything except permission | PARTIAL |
| S9 | Cancel enabled when any row is dirty (L4814–4824) | Screen.tsx:380 | COVERED |
| S10 | Farmdown: `IsTwoDecimal` and `InRange(0, 100)`. Messages "Share of Farmdown cannot be blank" and "Please ensure the entry is a number using no more than two decimal places and within the range of 0 to 100" (L3628–3655) | rules.ts:315–318, 1255–1258, 1313–1316 | COVERED |
| S11 | Standard-assumption dates and farmdown render theme-blue italic (L1859–1860, 2028/2036, 2158–2159, 2321–2323, 2706–2707, 2866–2867, 3005–3006, 3156–3157, 3924–3925, 3518–3519) | `classifyDerivedMilestones` (rules.ts:439–443); Screen.tsx:139, 232, 297 | COVERED |
| S12 | `Icon3` shows "Currently recalculating this projects CAPEX costs." while a matching job exists (L4177–4191) | Screen.tsx:356; rules.ts:1264 | COVERED |

## 4. UI

| # | Requirement (canvas) | Code | Status |
|---|---|---|---|
| U1 | Lock banner: fill `RGBA(89,89,89,1)`, white lock icon, white text "This page is locked. To unlock it, please complete the following sections:" and "• General" (L1328, 1345, 1386, 1404) | Texts are verbatim (rules.ts:1236–1238), but the background is `palette.neutralLighter` with default text colour (Screen.tsx:127, 259–265) | PARTIAL |
| U2 | Captions: "Project Start" (L1570); cluster labels from `Index(locRecordMilestoneNames,n).vsb_clusterdescription` (L1690, 1892, 2066, 2148, 2630, 2799); "Final Investment Decision" (L2311), "Sales Start Date" (L3043), "Sales Completion Date" (L3193), "Share of Farmdown [%]" (L3404), "Operational Lifetime" (L3767), "Project End Date" (L3821) | rules.ts:123–159; `labelFor` (Screen.tsx:202–205). The fallback cluster labels come from the GUIDE, not the canvas. | COVERED |
| U3 | Placeholders: "Select a project start date..." (L1624), "Select a date..." (L2055), "Select a sales start date..." (L3027), "Select a sales completion date..." (L3177) | Screen.tsx:87–92; rules.ts:1240–1246 | COVERED |
| U4 | The 11 date pickers have `AccessibleLabel` = control name, e.g. "dtp_Milestones_DisplayProject_Body_General_Content_StartDate" (L1578, 1698, 1857, 2026, 2156, 2319, 2704, 2864, 3003, 3154, 3922) | `aria-label={label}` is the visible caption, and for clusters that caption is bound data from Project States (Screen.tsx:233). The `data-testid` is correct (Screen.tsx:234). | WRONG |
| U5 | Recalculate buttons: `AccessibleLabel` = name (L1799, 1964, 2189, 2488, 2638, 2807, 3051, 3217, 3829) | Screen.tsx:216, 245–246 | COVERED |
| U6 | Farmdown input (L3516), reset icon (L3551), Years (L3739) and Months (L3712) labels/test ids | Screen.tsx:298–299, 309–310, 334–335, 341–342 | COVERED |
| U7 | `Icon1_2.Tooltip` is three lines: "0%     : Project will remain fully at VSB⏎50%   : Standard farmdown approach⏎100% : Project will be fully sold" (L3613–3616). It is disabled when locked (L3603). | rules.ts:1252–1253 joins it into one line with spaces; it is used as the tooltip and aria-label (Screen.tsx:313–320); always enabled | WRONG |
| U8 | Farmdown value `Text(locShareOfFarmdown, "##0.0")`, so "50.0" (L3544) | `String(p.shareOfFarmdown ?? 50)`, so "50" (rules.ts:242) | WRONG |
| U9 | Years/Months view-only values (L3715–3758) | `operationalLifetime` (rules.ts:483–496); Screen.tsx:328–345 | COVERED |
| U10 | Footer: "Created By:" + `'Erstellt von'.'Full Name'` + `Text('Erstellt am', ShortDateTime24)`, and "Modified By:" + `'Geändert von'` + `'Geändert am'` (L4010, 4025–4026, 4058, 4091, 4106–4107, 4139) | Captions only (Screen.tsx:351–354). `formatAuditStamp` is imported but unused, and `MilestoneProject` has no user names. | PARTIAL |
| U11 | "Required fields" is an `InfoButton` (`ibtn_GeneralData_DisplayProject_Body_Buttons_Requered_Fileds_1`, error colour) plus a label (`…_ErrorMessage_5`, "Required fields") (L4684–4720) | The label has the test id and a tooltip (Screen.tsx:357–366). There is no InfoButton control or test id. | PARTIAL |
| U12 | Save: "Save" (L4803), tooltip "Save Milestone data." (L4806), CheckMark icon, `AccessibilityLabel` "pcf_btn_Milestones_DisplayProject_Body_Buttons_Save" (L4725) | `aria-label="Save"` (Screen.tsx:372); no icon | WRONG |
| U13 | Cancel: "Cancel" (L4917), tooltip "Reset values entered." (L4919), `AccessibilityLabel` "pcf_btn_Milestones_DisplayProject_Body_Buttons_Reset" (L4812) | `aria-label="Cancel"` (Screen.tsx:382) | WRONG |
| U14 | Leave dialog: "Unsaved data", "You have unsaved data. Do you really want to leave current form without saving?", Yes / Cancel (L4945–4978) | rules.ts:1276–1280; Screen.tsx:391–399 | COVERED |
| U15 | COD dialog: "Review Impact of COD Change", "Changing the COD may affect existing revenue contracts with individual volumes. Please review the affected revenue contracts.", Confirm / Cancel (L4985–4997) | rules.ts:1282–1287; Screen.tsx:400–409 | COVERED |
| U16 | Two separators (L2930–2942, L3659–3671) | Screen.tsx:273, 325 | COVERED |
| U17 | Layout: Start and C1–C3 \| C4, FID, C5, C6 (L1502–2106); the sales row; filler \| farmdown (L3326–3398); lifetime \| End (L3693–3946); footer (L3947–4920) | Screen.tsx:268–347, 350–389 | COVERED |
| U19 | Dead UI left out on purpose: `con_Milestones_Tip` (Visible false, L1435–1449), `InfoButtonCanvas1` (L3510), `…farmdown_Reset_1` (L3459), the hidden label at L3493, hidden buttons (L4346, 4373, 4636, 4658), and the Information/Loading pop-ups (their locals are never set to true) | Not rendered | COVERED |
| U20 | D14 not-connected notice | Screen.tsx:255 | COVERED |

---

## Proposed changes

### (a) UI: `Screen.tsx`
1. **S:** Set the `aria-label` of the 11 date inputs to the canvas `AccessibleLabel`, which is `id(SEGMENT[k])` (U4). UT-MSTONE-902 (Screen.test.tsx:40–58), which uses `getByLabelText(caption)`, must be updated. This conflicts with rule 16's "never change an existing value" (see Q6).
2. **S:** Set the Save/Cancel `aria-label` to `pcf_btn_…_Save` / `pcf_btn_…_Reset` and add the CheckMark/Cancel icons (U12, U13), pending Q6.
3. **M:** Add the leave guard. Block shell navigation (header logo, left nav) while anything is dirty, open `ConfirmDialog`, and navigate on confirm (B14). This needs a shared shell hook, because none exists in `src/`.
4. **S:** Show the footer audit values (name plus `formatAuditStamp` date) (U10).
5. **S:** Add the Required-fields InfoButton with `data-testid="ibtn_GeneralData_DisplayProject_Body_Buttons_Requered_Fileds_1"` (U11).
6. **S:** Make the lock banner dark grey `RGBA(89,89,89)` with white text and icon (U1).
7. **S:** Pass permissions into `canSaveMilestones` instead of the inline gate at Screen.tsx:370 (S8, D2).
8. **S:** Remove the lock gate from the recalculate buttons, or log it as a divergence (S3, Q8).
9. **M (after connection):** Execute `planSaveMilestones`. Show the saving overlay (B7), the success toast (B8) and the error toast (B9). Re-read and reset after saving (B10). Make the COD-review Confirm proceed to the save (B6).
10. **M (after connection):** On a FID change, run `needsPlantCostRecalculation`, then `usePriceInflation` and `useProjectGeneratorsForRepricing`, then `repriceGenerators`, and feed the result to the save plan (D12). Mark FID dirty only when it differs from the stored value (B3).
11. **S:** Align Cancel with the canvas (stored dates, keep farmdown) or log it as a divergence (B11, Q5).

### (b) `rules.ts` (and tests)
1. **S:** Change `MilestoneAssumptionRow` to `cluster1..cluster5`, `finalInvestmentDecision`, `operationalLifetime`, `salesStart` and `salesEnd`, and drop `cluster6` (D9).
2. **M:** Fix `recalculateMilestone`:
   - `Construction ← FID + finalInvestmentDecision`
   - `OperationsStartDate ← Construction + cluster5`
   - add `EndDate ← addDays(addMonths(COD, operationalLifetime ?? 360), -1)`
   - add `SalesStartDate ← LegallyBindingPermits + salesStart`
   - add `StartCompleted ← FID + salesEnd`
   - every one sets its flag to true

   Update the UT-MSTONE-017 fixture (rules.test.ts:281–283) and add a test per button (D10a, D10b).
3. **S:** Set `MILESTONE_CHAIN[].text` to the canvas "Check input for …" strings listed in S7, verbatim. Keep `orderingMessage` only for the field labels. Rewrite the `.text` assertions in UT-MSTONE-047..053.
4. **S:** Drop the invented log "A default revenue contract was created." (rules.ts:1179); use `log: null` (B8). Add `saveErrorMessage(source, message, http)` with the B9 text verbatim.
5. **S:** Add a farmdown display formatter for `"##0.0"` (U8). Restore the line breaks in `farmdownInfo` (U7).
6. **S:** Replace `toISOString().slice(0,10)` with `dateOnly` in `deriveNextDate` (rules.ts:366) and `contractDates` (rules.ts:810). This breaks rule 18 and is already logged as D15 n.
7. **S:** In `subContractSwitch`, default `decisionYearUp` to `Year(COD)` (L643) (D24).
8. **S, after Q7:** Decide the `accumulatedIndex` default and whether `repriceGenerators` should round (D12).
9. **S, optional:** Order the writes as generators first, then a separate plant-cost patch, if exact canvas order is needed (D18).
10. **S, optional:** Hide the "later than" field error while the predecessor is blank, matching the canvas (S6).

### (c) `hooks.ts`
1. **S:** `useMilestoneAssumption` `$select`: `vsb_cluster1..vsb_cluster5`, `vsb_finalinvestmentdecision`, `vsb_operationallifetime`, `vsb_salesstart` and `vsb_salesduration` (D9). The table is registered (`milestonesstandardassumptions`).
2. **S:** `useProjectGeneratorsForRepricing`: use `vsb_numberofgenerators`, `_vsb_generator_value` and `vsb_generatorscost`; on generators, use `vsb_wtgprice`, `vsb_wtgprice2..5`, `vsb_additionalfoundationcost` and `vsb_foundationcostincluded`. Change the write in rules.ts:1171 to `vsb_generatorscost` (D13). Both tables are registered.
3. **S:** `useMilestoneProject`: add `vsb_projectname`, the formatted `_createdby_value` / `_modifiedby_value`, and the country's `_vsb_businessunit_value`; `vsb_countries` is registered (D1, D15).
4. **S:** Add `ES.fabricSyncJobs` and `ES.estimationPriceInflations` to `TABLES` and correct the stale JSDoc (hooks.ts:45, 49, 64–66) (D32).
5. **Blocked:** Resolve the real logical name of the "Is 2-Project development Standard Assumption ?" flag (D14b, Q2).
6. **L in total:** Tables **not yet in power.config.json**:
   - `vsb_projectrevenues` (seed and COD guard)
   - `vsb_revenuesubaccounts`
   - `vsb_estimationpriceinflations`
   - `vsb_fabricsyncjobs`, plus Fabric Job Types for the `'Job Type'.Name` filter
   - `Assumptions Revenues SQL`, which is a Fabric SQL source, not Dataverse (D15 j / D2)
   - the currency table, if it is really `vsb_currencies` (only `transactioncurrencies` is registered; Q3)

   Each one needs `pac code add-data-source`, then a diff of `dataSourcesInfo.ts`, and then the `REVENUE_COL` names (rules.ts:919–952) checked against the generated model.

   Already registered: `vsb_projects`, `vsb_projectstates`, `vsb_milestonesstandardassumptionses`, `vsb_generatortypeinprojects`, `vsb_generators`, `vsb_countries`, `transactioncurrencies` and `businessunits`.

## Open questions for the product owner
1. **Source version.** The extract is 1.21.709, but the code applies 1.21.753's Italy changes (D20–D22). Is 1.21.753 the target? If so, refresh the `_extracted` YAML so these rows can be re-verified.
2. **The "Is 2-Project development Standard Assumption ?" column** is not in the solution metadata or the generated `vsb_projects` model. Does it exist, and what is its logical name?
3. **Project Revenues `Currency`:** is the lookup target `transactioncurrency` (the registered source) or a custom `vsb_currency`?
4. **Fabric recalculation** (the `Fabric Sync Jobs` insert and the `ForaProject…` flow) is commented out in the canvas. Should it stay off? If so, plan 010's "INCOMPLETE — missing flow" status should be cleared.
5. **Cancel semantics.** The canvas keeps rows dirty and keeps the farmdown value, and it restores stored dates without the acquisition default. Should the canvas behaviour be kept, or is it a defect?
6. **Tosca labels.** The date pickers and the Save/Cancel PCFs have canvas labels equal to their control names. Rule 16 requires `AccessibleLabel`, but also says "never change an existing value". Which wins?
7. **Re-pricing edge cases.** Should missing `Estimation Price Inflations` rows give index 0 (canvas, zero cost) or 1 (code)? Should generator costs be rounded to 2 dp?
8. Should the recalculate buttons stay usable while the page is locked, as in the canvas?
9. Should the wind revenue-type defect (reads `.pv`, L570–574) be fixed, using `fixWindDefect`?
