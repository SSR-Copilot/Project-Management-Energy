# Gap analysis: Project Finance Screen → `src/features/pm/finance/`

Read-only analysis, 19 Oct 2026. Method: `.claude/skills/canvas-yaml-to-codeapp/SKILL.md` sections 1–2.

**Sources read**
- Canvas: `ProjectDocs/_extracted/msapp/projectmanagement/Src/Project Finance Screen.pa.yaml` (17,073 lines, 604 controls). I read every behaviour and gate block scalar to its end and skipped commented formulas (`/* */`, `//`).
- Also read: `App.pa.yaml` (`colYearsForDuration`, `colMonthsForDuration`, `colFrequencyInMonths`).
- Components used, as black boxes: `cmp_Header`, `cmp_Left_Navigation`, `cmp_PopUp_Loading`, `cmp_PopUp_Confirmation`, `fn_Numeric`, PowerCAT `CommandBar` and `Icon`.
- Code: `Screen.tsx` (1,552 lines), `rules.ts` (2,477), `hooks.ts` (265), `rules.test.ts` and `Screen.test.tsx`.
- Reference: `migration-plans/screens/018-project-finance.md`, `skeleton-reference/features/pm/finance/hooks.ts`, `reference/dataverse-*.json`, `power.config.json`, and `app-docs/02-OPEN-DECISIONS.md` (D14, D15, D17).

**Context:** under D14 the screen is "UI built, not connected". Every hook returns `notConnected()` and every write is disabled.
- **PARTIAL** on a data row means the rule or query spec exists but nothing executes yet.
- **WRONG** means the code (or the spec it encodes) differs from the canvas. Both sides are quoted.

Abbreviations:
- `Y:<n>` is a line in the canvas YAML.
- `S:`, `R:` and `H:` are lines in `Screen.tsx`, `rules.ts` and `hooks.ts`.

## Summary

| Status | Count |
|---|---|
| COVERED | 50 |
| PARTIAL | 33 |
| MISSING | 12 |
| WRONG | 31 |
| **Total rows** | **126** |

**Top 5 gaps**

1. **The activate/deactivate memory columns are inverted (WRONG, high risk).**
   - The canvas writes `'Track Status Active?'` and `'DSRA/DSRF Original Status Active?'` equal to the *new* status:
     - deactivate → No;
     - activate → Yes.
   - `toggleTrancheStatus` (R:1610) and `toggleDsraStatus` (R:1625) write the inverse.
   - `toggleDsraStatus` also adds `IsDeactivatedByButton`, which the canvas never writes for DSRA.
   - The tests pin this inverted behaviour (`rules.test.ts:618-633`).
   - Effect: switching Financing Options back to Debt Financing (`applyFinancingOptionCascade`) would restore the wrong status.
2. **The Senior Debt Save gate checks the two swap fields the wrong way round (WRONG, high risk).**
   - `canSaveSeniorDebtTranche` (R:1518, R:1528) always requires `swapMargin`, and requires `swapRate` only under Swap-After-Fixed-Period.
   - The canvas does the opposite (Y:13595, Y:13603-13610):
     - `txt_SeniorDebtData_SwapMargin`, which carries **Swap Rate**, is always required;
     - `txt_SeniorDebtData_SwapRate`, which carries **Swap Margin**, is required only when the toggle is on.
   - Effect: Save stays disabled for every tranche without Swap-After, and that is the default.
3. **Standard-assumption flags and save payloads are missing.**
   - Nothing tracks or writes the standard flags:
     - `Is Standard Value` (Equity and VAT);
     - `DSRA/DRSF Standard Assumptions JSON`;
     - `Decommissioning Standard Assumption JSON`;
     - the senior-debt `FinancialCloseDate` flag.
   - No payload builder exists for the tranche, Equity, VAT or Decommissioning Patch.
4. **Validation is not canvas-verbatim and is incomplete.**
   - Every numeric error uses the invented `"Numeric value expected"` (R:686) or `"Please select a value between X and Y."` (R:714) instead of the field-specific canvas texts.
   - The DSCR message differs.
   - The six Decommissioning date validations are missing.
   - The DSRA "Percentage of future debt service" validation is missing.
   - The DSRA and Decommissioning Save gates lack several canvas conditions.
5. **Form-reset behaviours are missing or wrong.**
   - The tranche-status `OnChange` reset (`resetOnTrancheStatusChange` exists but is never called) is missing.
   - The DSRA Type `OnChange` re-standardisation is missing.
   - Add Tranche opens with `formDirty: false` (the canvas sets `locFormIsDirty: true`).
   - Category cards start unfolded (the canvas starts them folded).
   - The aria-labels use captions, not the canvas `AccessibleLabel` control names (rule 16).

---

## 1. Data: reads

| # | Requirement (canvas) | Canvas cite | Code cite | Status | Notes |
|---|---|---|---|---|---|
| D1 | `FinancingCategories` record built by `Order` (1 Equity, 2 VAT, 3 Senior Debt, 4 DSRA/DSRF, 5 Decommissioning, 6 Cash Sweep) from `colFinancingCategories` (App OnStart) | `OnVisible` Y:70-99 | R:120-134 `CATEGORY_ORDER`/`buildCategoryMap`; H:25-26, H:231 | PARTIAL | The rule is done. The hook is `notConnected`, spec'd as `vsb_financingcategories $orderby vsb_order`. |
| D2 | `Filter('Financing Inputs', Project = selected)`, loaded twice (Y:101 and Y:1881) | Y:100-107, Y:1881-1887 | H:34-36, H:247 | PARTIAL | Spec'd as `_vsb_project_value eq`, with `$select` = `INPUT_COL` + `statecode`. |
| D3 | `'Assumptions Debt SQL'` filtered by `country = Country.Name`, in three slices: `debttype` "debt facility" + "DSCR"; "decommissioning costs"; in ["DSRA_DSRF","DSRA","DSRF"] | Y:116-151 | R:138-163 `sliceDebtAssumptions`; H:27-29, H:235 | PARTIAL | A Fabric SQL source, not Dataverse (D2, D15j). One round trip, sliced client-side. |
| D4 | `Filter('Financing Inputs Repayment Amounts', Project)` | Y:153-159 | H:37-39, H:251 | PARTIAL | `vsb_repaymentyear` is a text column (noted). |
| D5 | `Filter('Financing Input Step Up margins', Project)` | Y:160-166 | H:40-41, H:255 | PARTIAL | The code adds `$orderby vsb_order`; the canvas sorts by `Id` in the gallery (Y:12981). Equivalent. |
| D6 | `ClearCollect(colAssumptionKfWs, AssumptionsKfWTrancheSQL)` and `ClearCollect(colAssumptionBanks, 'Assumptions Banks SQL')`, whole tables | Y:1872-1880 | H:30-33, H:239-245 | PARTIAL | Fabric SQL (D2). |
| D7 | `locTotalDevexCapexCost` = `Sum(Filter('CAPEX Costs', Contract in <project contracts>), Cost)`, or 0 when there are no contracts | Y:1888-1910 | R:744 `totalDevexCapex`; H:42-46, H:259 | PARTIAL | Pushed server-side (better than the canvas, which loads the whole table at app start). |
| D8 | Active turbine count = `CountRows(Filter(GeneratorInProjects, AsType(ModuleTypeInProject, GeneratorTypeInProjects).Project = project, Status = Active))` | `txt_Decommissioning_Data_Display_Card_Cost_of_Decommissioning_1.Value` Y:5239-5264 | H:47-49 | WRONG | The code filters `vsb_generatorinprojects` by `_vsb_project_value eq <id> and statecode eq 0`. The canvas goes through the **polymorphic** `ModuleTypeInProject` → `GeneratorTypeInProjects.Project`. The reference does not show a direct project lookup on `vsb_generatorinproject`, so verify it or use `_vsb_moduletypeinproject_value in (<generatortypeinproject ids>)`. |
| D9 | Column logical names for Financing Inputs, Repayment Amounts and Step-Up margins | — | H:94-188 `INPUT_COL`, `REPAYMENT_COL`, `STEPUP_COL` | PARTIAL | **UNVERIFIED.** `dataverse-attributes.json` holds only 23 entities, and none of the finance tables. The entity-set names are verified in `dataverse-entities.json:193-221`. The skill says never guess a logical name, so regenerate the schema after `pac code add-data-source`. |
| D10 | Tranche gallery `Sort(Filter(col, Category = SeniorDebt), 'Created On', Ascending)` | `gal_SeniorDebt_Data_Display_TrancheData_Card.Items` Y:3456 | S:420-422 (comment only) | PARTIAL | The hook JSDoc has no `$orderby createdon asc`. Add it. |
| D11 | Category gallery `Filter(colFinanceCategoriesInProject, Not(Order=6))` | `gal_ProjectFinance_..._FinancingInputs.Items` Y:2445-2447 | R:2083 `CATEGORY_CARD_ORDERS`; S:862 | COVERED | |
| D12 | Project columns used: Country, Technology, Cluster State, the 4-Legally binding permits / 5-Construction / End Date / COD dates, Total Capacity, Net Yield p50, Project ID, Financing Options, Owning BU | throughout | H:16-24 | PARTIAL | Verified names: `vsb_financingoptions`, `vsb_construction`, `vsb_enddate`, `vsb_operationsstartdatecod`, `vsb_legallybindingpermits` and `vsb_clusterstate`. `vsb_legallybindingpermits` is needed for D-validation S21, which is missing. |

## 1b. Data: writes (payloads and order)

| # | Requirement (canvas) | Canvas cite | Code cite | Status | Notes |
|---|---|---|---|---|---|
| W1 | Five seed `Patch(Defaults)` calls inside `Concurrent`, each guarded by `CountIf(...)=0`, each with its own `IfError` → `Notify("Error while creating <X> financing input: "…)`. Payloads for Equity (10/90, flags JSON), VAT (base rate by country, 1.5, Calculated), Senior Debt (27 standard fields, unique key `-SeniorDebt-StandardAssumption`, `FinancialCloseDate` JSON), DSRA (DSRF-only blanks, `Commitment Fee Period (Year)` = free period, Month 0, end of savings COD + tenor×12 − 1 day, MMYY pad) and Decommissioning | Y:1514-1870 | R:1861-2015 `planSeeds`; H:52-54 | PARTIAL | The payload rule matches field-for-field, including `OwningBusinessUnit`. It is not executed, and none of the five Notify texts are in `MSG`. |
| W2 | `Patch(Projects, …, {'Financing Options': 'Debt Financing'})` runs **unconditionally** on every visit | Y:1509-1513 | R:1655 `financingOptionOnVisit` | WRONG | A documented SOURCE DEFECT. The code patches only when the column is blank, so the canvas overwrites "All Equity" and the code does not. Needs PO sign-off (see Open questions). |
| W3 | `rad_ProjectFinance_FinancingOptions.OnChange` runs in this order: spinner "Please wait, Saving..."; `Patch(Projects)`; VAT status follows the option unless `'Is Deactivated By Button' = Yes`; all categories folded; All Equity sets every tranche and DSRA to Inactive; Debt Financing restores tranches from `Track Status Active?` and DSRA from `Original Status Active?` | Y:2402 | R:1570 `applyFinancingOptionCascade`; S:857 (no-op) | PARTIAL | The status rule is covered. Not modelled: the Project patch, the fold-all step and the spinner text. |
| W4 | VAT/Decommissioning activation (`cmp_PopUp_Confirmation_1.OnConfirm`) writes `{Status: toggle, 'Is Deactivated By Button': If(Active, Yes)}`, which writes **Blank** when activating | Y:8830-8848 | S:1531 comment "connected: toggleTrancheStatus PATCH" | WRONG | `toggleTrancheStatus` also writes `trackStatusActive` (the canvas does not for categories) and never blanks `IsDeactivatedByButton` on activate. A dedicated `toggleCategoryStatus` is needed. |
| W5 | Tranche activation (`cmp_PopUp_ActivationForSeniorDebtTranche.OnConfirm`): `'Track Status Active?' = If(Active, No, Yes)`, i.e. deactivate → **No** and activate → **Yes**; `'Is Deactivated By Button' = If(Active, Yes, <keep>)`; `IfError` → `Notify("{msg} : Error Occured while Tranche Status change")` | Y:8946-8973 | R:1610-1623 `toggleTrancheStatus` | WRONG | The code is inverted: activating → `trackStatusActive: no`, deactivating → `yes`. It is pinned by `rules.test.ts:618-626`, and the Notify text is absent. |
| W6 | DSRA activation (`cmp_PopUp_Confirmation_3.OnConfirm`): `'DSRA/DSRF Original Status Active?' = If(Active, No, Yes)`, then `ClearCollect` refresh. No `IsDeactivatedByButton` write. | Y:17042-17064 | R:1625-1640 `toggleDsraStatus` | WRONG | The code is inverted (activate → `no`, deactivate → `yes`) and adds `isDeactivatedByButton: yes`. Pinned by `rules.test.ts:629-633`. |
| W7 | Delete runs `Concurrent(RemoveIf(step-ups, input), RemoveIf(repayments, input))`, then `Remove('Financing Inputs')` | Y:8980-9000 | R:2042 `trancheDeletePlan`; S:1539 (no-op) | PARTIAL | The plan is done; executing it through `deleteRecord` (rule 14) is not. |
| W8 | Tranche Save payload: about 45 fields, including `Name = '<Project Name> - Senior Debt'` (with spaces, unlike the seed); `Bank = cmb.Selected.id`; `Other Bank Name` only when "other"; KfW Yes/No plus value; DSCR `Value(Left(text,4))`; the crossed swap columns (`Swap Margin [%]` ← `txt_SeniorDebtData_SwapRate`, `Swap Rate` ← `txt_SeniorDebtData_SwapMargin`, `Bank Rate` ← `txt_SeniorDebtData_BankMargin`); `IsFolded = true`; `Track Status Active? = Coalesce(existing, Yes)`; `Senior Debt Standard Assumption JSON = If(locIsFinancialCloseDateStandard, JSON([{FinancialCloseDate:true}]))`; `UniqueKeyString`; `OwningBusinessUnit` | `pcf_btn_..._SeniorDebt_Form_Buttons_Save_1.OnChange` Y:13760-13850 | R:781 `buildUniqueKey`, R:831 `parseDscr` only | MISSING | No `trancheSavePayload` exists in `rules.ts`. The FC-standard flag is not tracked in the UI. |
| W9 | Duplicate guard before the save: `LookUp('Financing Inputs', UniqueKeyString = key && Or(new, id <> current))` → `Notify("Same senior debt tranche already exists for this project.")`, then reset and close | Y:13733-13757 | R:801 `isDuplicateTranche`, R:712 `MSG.duplicateTranche` | PARTIAL | The rule checks only the local list. The canvas queries Dataverse (all projects, though the key carries the project id). Not wired. |
| W10 | Repayment amounts. Individual: `RemoveIf(not in years)`, then a `Patch` per row (`Name "{Year} - Value"`, `Repayment Year = Text(Year)`, category, input, project, BU). Otherwise: `RemoveIf(all)`. Runs `Concurrent` with the step-ups. | Y:13852-13885 | R:916 `repaymentDiff` | PARTIAL | The rule matches. The upsert payload has no Owning BU or category binds yet (hook). |
| W11 | Step-ups. Toggle on and rows > 0: a `Patch` per row keyed by `Order = Id` (`Name "{DurationYY} - Value"`, Duration, `Margin `, Start Year, Order, BU). Otherwise `RemoveIf(all)`. **Stored rows with `Order` > the new count are not deleted.** | Y:13886-13935 | R:1071 `stepUpWrites`, R:981 `stepUpToStorage` | WRONG | The code deletes stale rows, a silent improvement (log it as a DIVERGENCE). The `Name` is never produced; the skeleton used `"Step N"`, which is also wrong. |
| W12 | Equity Save: `{Name '<P>-Equity', category, 'Free Equity', 'Free Equity Value', 'Shareholder Loan Value' = Value(<computed text>), Project, 'Is Standard Value' = If(Percentage, JSON([flags]))}` | Y:7933-7949 | S:885 (no-op) | MISSING | No payload builder, no flags. |
| W13 | VAT Save: `{Name, category, Base Rate, Bank Margin, VAT Facility Amount, VAT Facility Amount Value = Value(text) (blank when Calculated), Project, Is Standard Value = JSON(Table(locVatFinancingStatndardValues))}` | Y:8676-8698 | S:931 (no-op) | MISSING | No payload builder, no flags. |
| W14 | Decommissioning Save: `{cost type, value, guarantee, dates, 'Duration of Saving (MMYY)' = Text(MM,"00")&Text(YY,"00"), 'Decommissioning Standard Assumption JSON' = JSON(Table(locMyRecord))}` | Y:15328-15350 | S:1317 (no-op); R:1129 `packMMYY` | MISSING | Only the MMYY packer exists. |
| W15 | DSRA Save: `{Name '<P>-DSRF/DSRA', category, Type, Base Rate, Margin, DSRF-only fields Blank for DSRA, POFDS, End of savings, MMYY, Project, flags JSON, Owning BU}` | Y:16873-16940 | R:1176 `dsrfOnlyFields`, R:1129; S:1433 (no-op) | PARTIAL | No full payload builder, no flags. |
| W16 | Refresh after each write (`ClearCollect` of inputs, repayments and step-ups) | Y:13936-13956, Y:16941-16947 | H:51-62 (JSDoc) | PARTIAL | To be done by query invalidation. |

## 2. Behaviour

| # | Requirement (canvas) | Canvas cite | Code cite | Status | Notes |
|---|---|---|---|---|---|
| B1 | `OnVisible` spinner: "Please wait, loading financing inputs for project..." | Y:42-47 | R `FIN_LABEL.loading`; S:1548 | COVERED | |
| B2 | Load sequence: `CanEditSelectedProject`; `Refresh`; `Concurrent` reads; standards; seeds; the second `Concurrent` (KfW, banks, inputs, total CAPEX); equity flags; spinner off | Y:41-1929 | S:354-392 | PARTIAL | The hooks are parallel queries (fine). Not done: the seeds-then-reload ordering and the `CanEditSelectedProject` permission. |
| B3 | Senior-debt standard: 27 fields. ×100 applies to: bank margins, swap rates 2025–2030, up-front fee, hedging, commitment-fee % of margin. DSCR is not ×100. Swap rate by `Year(Today())`. | Y:639-1396 | R:383-463 `buildSeniorDebtStandard` | COVERED | ×100 set verified line by line. The post-2030 swap rate is blank (documented). |
| B4 | DSRA standard: `MarginDSRA` reads `category = "margin dsrf"` (copy-paste) | Y:233-278 | R:504-530 `buildDsraStandard`; S:383-386 | WRONG | The code reads "margin dsra" and falls back to dsrf. `canvasParityMarginDsra` exists but is off in the Screen. A documented SOURCE DEFECT; needs a PO decision. |
| B5 | Decommissioning standard (8 categories, `"00" & duration_saving`, project dates) | Y:498-638 | R:548-572 | COVERED | |
| B6 | `locStandardFinancialClose = DateAdd('5-Construction', months_from_cluster_5_to_fc, Months)` | Y:1502-1506 | R:411 `financialClose` | COVERED | |
| B7 | Standard-assumption flag tracking. Every field `OnChange` sets its flag false and every reset icon sets it true. Read from JSON on open; written on save. Covers Equity (`locIsStandardFreeEquity`/`ShareholderLoan`), VAT (`locVatFinancingStatndardValues`), DSRA (9 flags), Decommissioning (`locMyRecord`, 7 flags) and Senior Debt (`locIsFinancialCloseDateStandard`). | e.g. Y:7547-7555, Y:8260-8268, Y:15725-15740, Y:14356-14365, Y:9667 | R:574-647 (types and parse/serialise only) | MISSING | `Screen.tsx` holds no flag state. |
| B8 | `OnHidden` clears 13 context variables and 9 collections | Y:14-39 | query keys by project (R header) | COVERED | By design. |
| B9 | Category cards start **folded** (`AddColumns(colFinancingCategories, IsFolded, true)`) | Y:108-115 | S:396 `useState(new Set())` | WRONG | Canvas: all folded. Code: all expanded. |
| B10 | Category fold Up/Down icons toggle `IsFolded` and also set every input of that category to `IsFolded = true` | `ico_Generators_..._Up_1` / `_Down_1.OnSelect` Y:7145-7212 | S:307-316, S:870-874 | PARTIAL | The tranche-fold cascade is missing. |
| B11 | Per-tranche fold icons `ico_FinancingInputs_DisplayProject_Body_Form_SeniorDebt_Up` / `_Down` toggle the tranche's `IsFolded` (visible on `IsFolded`) | Y:4770-4854 | S:681 (static chevron, no button) | MISSING | No control, aria-label or test id. |
| B12 | Tranche header click toggles the selection (click again deselects) and loads `locFinancialCloseToShow` and the FC-standard flag | Y:5013-5032 | S:683-689 | PARTIAL | The FC flag is not loaded. |
| B13 | Add Tranche: reset the form, clear repayments and step-ups, `locSelectedStandardAssumption = standard2`, **`locFormIsDirty: true`**, upfront and commitment from the standard | Y:2643-2661 | S:504-566 (`formDirty: false` at S:520) | WRONG | Canvas: Save is enabled immediately on Add. Code: Save is disabled until an edit. |
| B14 | Edit Tranche re-reads the record from Dataverse (`LookUp('Financing Inputs', id)`), then builds `colRepaymentProfileAmount` and `colStepUpBankMargins` (`DurationYY` formula) | Y:2663-2732 | S:504-518; R:1007 `stepUpFromStorage` | PARTIAL | The code uses the cached row (no re-read). |
| B15 | Activate / Deactivate / Delete open `cmp_PopUp_ActivationForSeniorDebtTranche` with the action | Y:2733-2753 | S:602-608 | COVERED | |
| B16 | Category command `OnSelect`. Order 1 loads equity value and flags; 2 loads VAT amount and flags, then Edit → panel or toggle → dialog; 5 toggle → dialog, Edit loads 7 decommissioning locals and flags, dirty=false | Y:2834-2938 | S:624-634 | PARTIAL | Panels and dialogs open; the flags are not loaded. |
| B17 | Equity radio `OnChange` resets the value | Y:7547-7555 | S:896-898 | COVERED | Flags: see B7. |
| B18 | Equity "Reset to 10%." (visible only for Percentage) | Y:7720-7748 | S:909-915 | COVERED | |
| B19 | VAT Base Rate default: `If(Poland, Wibor 3M, standardFlag, Euribor 3M)`, else the stored value. **Poland always shows Wibor 3M.** | `cmb_VATFinancingData_BaseRate.DefaultSelectedItems` Y:8235-8249 | S:457-464 | WRONG | The code always opens with the stored value. |
| B20 | VAT reset icons: base rate re-default; bank margin `Text(1.5,"0.0")` | Y:8199-8227, Y:8371-8400 | S:949-968 | COVERED | |
| B21 | VAT facility radio `OnChange` resets the amount | Y:8446-8449 | S:973 | COVERED | |
| B22 | Tranche Status `OnChange`. To Standard Assumption: reload `standard2`, reset every control, blank the selection and fixed/commitment/upfront locals. Leaving Standard Assumption: reset and blank `locSelectedStandardAssumption`. Always: `locFinancialCloseToShow = standard FC`, FC flag true. | `rad_SeniorDebt_Data_TrancheStatus.OnChange` Y:9239 | R:2021 `resetOnTrancheStatusChange` (unused); S:1004 | MISSING | The Screen only patches `trancheStatus`. |
| B23 | KfW toggle `OnUncheck` resets the KfW value | Y:9496 | S:1024 | PARTIAL | `kfwValue` is kept. Harmless for display, but the unique key uses the toggle only. |
| B24 | Financial Close reset: sets FC to the standard and the flag true; **disabled while the FC is standard**; hidden for Standard Assumption | Y:9679-9707 | S:1040-1045 | PARTIAL | The disabled-when-standard gate is missing. |
| B25 | Repayment regeneration on Tenor YY/MM, Start YY/MM and Profile `OnChange`, preserving values by index | Y:9848-9915 (and four copies) | R:880 `regenerateRepaymentYears`; S:576-586 | COVERED | The canvas regenerates only when Individual and all four are set; the code always does (rows are hidden otherwise). Benign. |
| B26 | Gearing `OnChange` clears the Fixed Amount option (`locSelectedFixedAmount: []`) and resets the value | Y:10696-10699 | S:1094 | PARTIAL | The code keeps `fixedAmountOption`. |
| B27 | Upfront Fee and Commitment Fee option `OnChange` blank their values | Y:11786-11788, Y:12019-12021 | S:1153, S:1165 | COVERED | |
| B28 | Step-up toggle `OnCheck` creates row 1 **only if FIR YY is set and there is no FIR error**; `OnUncheck` runs `Clear(colStepUpBankMargins)` | Y:12923-12953 | S:1216-1221 | PARTIAL | The FIR guard is missing and rows are kept on uncheck. `stepUpWrites` wipes them on save, so it is cosmetic. |
| B29 | FIR YY `OnChange` seeds step-up row 1 when the toggle is on and there are no rows | Y:12818-12843 | — | MISSING | |
| B30 | Add / Remove step-up period (FIR guard; Remove deletes the highest Id) | Y:13184-13262 | S:1262-1280; R:1048, R:1060 | COVERED | |
| B31 | Step-up margin `OnChange` sets `Valid` (two decimals, 0–100) | Y:13081-13099 | S:1250-1254; R:1064 | COVERED | |
| B32 | Repayment amount `OnChange` sets `Valid` (integer, 0 to the country cap) | Y:11648-11666 | S:1141-1146; R:944 | COVERED | |
| B33 | Decommissioning cost-type `OnChange` blanks the value | Y:14222-14233 | S:1329 | COVERED | |
| B34 | Decommissioning reset icons for cost, guarantee, issue (Cluster 5), start (COD), expiry (End Date) and **Duration of Saving** (`ico_DecommissioningData_Duration_of_Saving_Reset_to_Standard`) | Y:14403-15207 | S:1343-1424 | PARTIAL | The Duration of Saving reset icon is missing. |
| B35 | DSRA Type `OnChange` re-applies **all** standard values (`locStandardDSRA_DSRF_For_Edit = standard`), sets all 9 flags true, recomputes End of savings and resets 10 controls | Y:15593-15647 | S:1442-1446 | MISSING | |
| B36 | DSRA End-of-savings CalendarAdd button: COD + the longest active tenor − 1 day | Y:16729-16770 | R:1101; S:1507-1519 | COVERED | |
| B37 | DSRA card Edit opens the panel; `DisplayMode` is disabled when the toggle reads "Activate" | Y:5832-5889 | S:747-754 | COVERED | Flags: see B7. |
| B38 | DSRA card toggle: text Deactivate/Activate, icon `DismissCircle`/`CheckmarkCircle` | Y:5779-5827 | S:740-746 | PARTIAL | The icon is missing. |
| B39 | Header and left navigation (`cmp_Header.OnLogoClick` → Project Main; `cmp_Left_Navigation.OnSelect` → `Navigate`) | Y:2021-2124 | app shell (outside the feature) | COVERED | Not re-verified here. |
| B40 | Dialog title, description and confirm texts for the category, tranche (incl. the "Trache" typo) and DSRA dialogs | Y:8784-8882, Y:8884-9013, Y:17014-17072 | R:2428-2477 | COVERED | |
| B41 | Per-action spinner texts: "Please wait, Saving...", "Saving Financing Input for Equity...", "…for VAT Financing...", "…for Decommissioning Costs...", "Please wait, saving...", "Please wait, Deactivating/Activating Decommissioning Cost... / tranche...", "Please wait, deactivating/activating DSRA/DSRF..." | Y:2402, Y:7930, Y:8672, Y:15325, Y:16870, Y:8815-8827, Y:17035-17039 | — | MISSING | |
| B42 | Notify texts: 5 seed errors; "{msg} : Error Occured while Tranche Status change"; "Same senior debt tranche already exists for this project."; "Error while saving Senior Debt tranche: {msg}" | Y:1549…1864, Y:8972, Y:13743, Y:13985 | R:712 (duplicate only) | PARTIAL | |
| B43 | Panel header X icons: `ico_EditEquity_RightPanel_BodyHeaderCancel`, `…_1` (VAT), `…_2` (tranche), `Icon5` (Decommissioning), `ico_EditDSRA_DRSF_RightPanel_BodyHeaderCancel`. Each closes and resets its form. | Y:7459-7476, Y:8092-8114, Y:9088-9106, Y:14112-14132, Y:15497-15514 | `FormPanel.tsx:18` (`aria-label="Close panel"`, `data-testid="panel-close"`) | WRONG | Generic id and label instead of the canvas names. |

## 3. State gates, validation and Notify

| # | Requirement (canvas) | Canvas cite | Code cite | Status | Notes |
|---|---|---|---|---|---|
| S1 | Page-lock `Visible` and five bullets; the 5th reads "• Change the project status from Draft" | Y:2195-2211, Y:2352 | R:98 (`revenues pageLock`); S:840-848 | WRONG | **D15f.** The shared rule renders "• Cluster State". |
| S2 | Financing Options `DisplayMode`: disabled when Cluster State is blank or "Draft", or the lock is visible | Y:2390-2399 | S:856 | COVERED | |
| S3 | Category gallery `Visible` only when Cluster State is set and not "Draft"; `DisplayMode` disabled under the same conditions as the lock | Y:2421-2456 | S:862-879 | WRONG | **D15b** (documented DIVERGENCE). The shells always render. |
| S4 | Senior-debt command bar `ItemEnabled`/`ItemVisible`: Add (create permission and not "only the Standard Assumption"); Edit (selected, edit permission, Active); Activate/Deactivate (in status; Deactivate needs more than one active); Delete (not Credit Agreement or Standard Assumption, more than one tranche) | Y:2512-2636 | R:1689-1736; S:590-600 | COVERED | Permission comes from the DTO once connected. |
| S5 | Category command bar: Edit always enabled; Activate/Deactivate visible only for `Order in [2,5]` by status; enabled by `EditPermission` | Y:2764-2830 | R:1738-1760; S:610-622 | COVERED | |
| S6 | Command-bar visibility: senior-debt bar `Order=3`; category bar `Not(Order in [3,4])` | Y:2756, Y:2941 | S:791, S:800-805 | COVERED | |
| S7 | Category status chip `Visible: Order in [2,4,5]` | Y:7239 | S:320-322 | COVERED | |
| S8 | Equity card Shareholder Loan visible only for Percentage | Y:3039-3044 | S:650 | COVERED | |
| S9 | VAT card amount visible only for Individual | Y:3366-3371 | S:664 | COVERED | |
| S10 | DSRA card DSRF-only fields `Visible` | Y:6075, Y:6208, Y:6590 | S:758-762 | COVERED | |
| S11 | Tranche form fields disabled (or View) for Standard Assumption; Other-bank, Fixed Amount option, repayment and step-up rows not gated | many | S:827-828 `tDisabled` | COVERED | |
| S12 | Tranche Status radio **entirely disabled** when the selected tranche is Credit Agreement | Y:9223-9228 | S:1002-1003; R:1413 | WRONG | The code keeps the radio enabled and disables only the two other options ("GUIDE q26"). |
| S13 | Bank required marker hidden for Standard Assumption | Y:9337 | S:1009 | COVERED | |
| S14 | "Standard Assumption Tranche can't be added" (another Standard Assumption tranche exists) | Y:9166-9200 | R:813; S:1006-1007 | COVERED | |
| S15 | Tranche Base Rate radio: `Items` all six options for Poland, else the first three; default Wibor 3M (PL) or Euribor 3M | Y:12373-12422 | R:337-341 `baseRateOptions`; S:1182-1185 | WRONG | The code offers only Wibor 1M/3M/6M for Poland ("GUIDE q26"). Canvas: all six. |
| S16 | Senior Debt Save `DisplayMode`: 108 lines, including `!IsBlank(txt_SeniorDebtData_SwapMargin)` (Swap **Rate**) always; Swap-After needs `txt_SeniorDebtData_BankMargin` (Bank Rate) and `txt_SeniorDebtData_SwapRate` (Swap **Margin**); every DSCR error label checked regardless of gearing; empty Individual list passes; `Not(locIsSavingSeniorDebtTranche)` | Y:13543-13648 | R:1474-1549 | WRONG | R:1518 `[form.swapMargin, …]` always and R:1528 `[form.bankRate, form.swapRate]` only under Swap-After. That is inverted against the S:1188-1206 bindings. Also: DSCR validated only under Debt Sizing (R:1533); empty Individual list blocked (R:1540). |
| S17 | Equity Save gate (mode set, value set, error not visible) | Y:7898-7907 | S:887-888 | COVERED | |
| S18 | VAT Save gate | Y:8632-8649 | S:933-935 | COVERED | |
| S19 | Decommissioning Save gate: dirty; 8 values non-blank (incl. guarantee and duration MM/YY); 7 error labels not visible | Y:15280-15302 | S:1319-1322 | PARTIAL | Missing: dirty, guarantee non-blank (`validateCostOfGuarantee` passes blank, R:1244, while the canvas error shows on blank), duration non-null, and the end-date/issue/start/expiry errors. |
| S20 | DSRA Save gate: type, POFDS, margin and base rate non-blank; for DSRF, upfront and commitment non-blank with no errors; end date non-blank, no error; duration error; margin and POFDS errors | Y:16821-16847 | S:1435-1439 | PARTIAL | Missing: margin and base-rate non-blank; the DSRF upfront/commitment non-blank and error checks; the POFDS error. |
| S21 | Decommissioning date validations: Date of Issue ≥ 4-Legally binding permits and ≤ End Date; Start of Saving ≥ COD, ≤ End Date, ≥ Issue; Expiry ≥ COD, ≤ End Date, > Issue. Texts verbatim, e.g. "Date of Issue must not be earlier than the cluster 4.", "Start Date of Saving must be later than Date of Issue.", "Date of Expiry must not be earlier than the COD Date" | Y:14678-14703, Y:14810-14838, Y:15220-15248 | — | MISSING | |
| S22 | "End Date of Saving must not be later than Project End Date" | Y:15019-15046 | S:1400-1411 | COVERED | Shown, but not in the Save gate (see S19). |
| S23 | "0 Year and 0 Months are not allowed to be selected" (Decommissioning and DSRA durations) | Y:14859-14877, Y:16463-16481 | S:1397, S:1493 | COVERED | |
| S24 | Tenor error: 0/0, or shorter than Start of repayment (Individual) | Y:9727-9756 | S:829-831; R:1339, R:1348 | COVERED | |
| S25 | FIR 0/0 error | Y:12753-12773 | S:1210 | COVERED | |
| S26 | "Step-up Bank Margin duration must be equal to the Fixed Interest Rate duration" | Y:13267-13288 | S:1282-1283; R:1024 | COVERED | |
| S27 | DSCR message "Enter a value between 1.00x and 2.50x with 2 decimals." (comma variant "1,00x…2,50x") | Y:10147-10211, Y:10307-10371 | R:851-856 `validateDscr` | WRONG | The code reads "Please enter a DSCR between 1.00x and 2.50x." The regex itself is correct. |
| S28a | Equity messages: "Input must not be blank" / "Number from 0 to 100, with up to two decimal places" / "Numeric value in range 0 to {100000000\|500000000}" / "Free Equity must not be higher than Total CAPEX." | Y:7613-7639 | R:686, R:714, R:724-737 | WRONG | Only the last text is verbatim; the rest are "Numeric value expected" or "Please select a value between …". |
| S28b | VAT messages: "Numeric value with maximum of two decimals" / "Please ensure Bank margin can be maximum 10" / "Input can not be blank" / "Numeric value must be between 0 and N" / "Preliminary - final numbers will apply after calculation of plant" (always shown for Calculated) | Y:8302, Y:8515-8532 | R:1252-1270 | WRONG | The two-decimal and amount texts differ. The "Preliminary…" note is never rendered in the Screen (S:975-982 hide the field for Calculated). |
| S28c | Senior Debt field messages: Fixed amount "value must be in range 0 to 100 with max one decimal." / "value must be integer in range 0 to 1,000,000,000."; Hedging "Value must be in range 0 to 100 with max one decimal."; Repayment "value must be numeric in range 0 to 100,000,000 without decimal place."; Upfront "value must be in range 0 to 100 with max two decimal." / "…without decimal."; Commitment "Value must be in a range 0 to 100 with maximum two decimal place."; Swap and bank margins "value must be in range 0 to 10 with max two decimal."; Step-up "Numeric value with only two decimal is allowed" | Y:10851-10856, Y:11554, Y:11633, Y:11858-11863, Y:12124, Y:12526 etc., Y:13009 | R:1284-1337, R:944, R:1064 | WRONG | All generic. Hedging also errors on **blank** in the canvas (Y:11557). |
| S28d | Decommissioning messages: "Numeric value must be integer without decimal." / "Value must be in range 0 to {10,000,000…}" / "Numeric value with maximum of one decimal in range 0 to 9.9" | Y:14292-14324, Y:14464-14482 | R:1230-1249 | WRONG | Generic. |
| S28e | DSRA messages: margin "Value must be in a range {-5\|0} to 10 with maximum two decimal place."; upfront "…0 to 10…"; commitment "…0 to 100…two…"; POFDS "…0 to 100 with maximum one decimal place."; "End of debt service savings must not be earlier than COD date" | Y:16202-16207, Y:16320, Y:15788, Y:16427, Y:16787 | R:1190-1201, R:1113 | WRONG | Only the end-of-savings text is verbatim. |
| S29 | POFDS validation (one decimal, 0–100) | `lbl_DSRA_DRSFData_POFDS_Fee_Percentage_ErrorMessage` Y:16414-16443 | S:1483-1487 | MISSING | |
| S30 | Drawdown default `Switch(Text(...), "Equity First", …, "Pro Rate", …, default Equity First)`. Because of the typo, a stored **Pro Rata** reopens as **Equity First**. | Y:10076-10093 | S:530 | WRONG | The code shows the stored value. Correct, but an undocumented divergence: log it as a SOURCE DEFECT. ("DSCR Sculpated" at Y:10988 falls back to DSCR Sculpted, so it has no effect.) |
| S31 | DSRA duration MM default `Coalesce(Value(0), …)` is **always 0** | Y:16572-16586 | S:469, S:479-480 | WRONG | The code reopens with the stored months. Undocumented SOURCE DEFECT. |
| S32 | DSRA commitment-fee-free MM default: 0 when its flag is standard, else stored; YY default from the standard when the type was re-standardised | Y:15880-15937 | S:473-474 | PARTIAL | Depends on B7 and B35. |
| S33 | VAT amount `DisplayMode` disabled when Calculated; the container is visible only for Individual | Y:8492, Y:8558-8563 | S:975-982 | COVERED | |

## 4. UI

| # | Requirement (canvas) | Canvas cite | Code cite | Status | Notes |
|---|---|---|---|---|---|
| U1 | Card captions verbatim ("Free Equity [%]", "Bank Margin [%]", "General", "Conditions", "Tenor", "Step-Up Margin", "Total Costs of Decommissioning [EUR]", …) | Y:2977-7098 | R:2112-2298 `FIN_LABEL`; S:641-787 | COVERED | |
| U2 | Card number formats: Commitment Fee `"##0.0"`, Hedging `"##0.0"`, Swap Rate and both bank margins `"#0.0#"`, Cost of Guarantee `"0.0"`; DSRA commitment `"##0.0#"`, margin and upfront `"#0.0#"`, POFDS `"##0.0"` | Y:4363, Y:4511, Y:4555, Y:4599, Y:4643, Y:5374, Y:6163-6175, Y:6550, Y:6678, Y:6800 | S:716-722, S:758-763, S:780 (`text()`, raw) | WRONG | E.g. hedging 80 shows "80", not "80.0". |
| U3 | Financial Close `Text(…, DateTimeFormat.LongDate)` | Y:3816 | S:702 `formatDate` (`dd MMM yyyy`) | WRONG | |
| U4 | Commitment Fee Free Period card is blank when either part is blank | Y:4407-4425 | S:717 `yearMonthLabel` → "00 Year 00 Month" | WRONG | |
| U5 | DSRA Commitment Fee Free Period card unpadded: `Y & " Year(s) " & M & " Month " / " Months"` | Y:6296-6313 | S:759 (`yearMonthLabel`, zero-padded) | WRONG | |
| U6 | DSRA Duration card: `<= 1` gives the singular, so 0 reads "0 Year" | Y:6923-6961 | R:1148-1151 `mmyyLabel` (`=== 1`) | WRONG | |
| U7 | Tranche display name ("Standard Assumptions" / "Term Sheet - \*bank\*[ - kfw]" / "Credit Agreement - …") | Y:4917-4953, Y:8891-8937 | R:1803-1814 | COVERED | |
| U8 | Tranche card: 9 General and 15 Conditions fields, tags and separators | Y:3492-4757 | S:693-726 | COVERED | |
| U9 | Decommissioning card fields (Total cost = per turbine × active turbines; dates `dd.mm.yyyy`; duration "Y Years M Months") | Y:5143-5728 | S:771-787 | COVERED | Data caveat D8. |
| U10 | Panel titles: "Edit Equity", "Add Tranche" (VAT panel, sic), "Add Tranche"/"Edit Tranche", "Edit Decommissioning Cost", "Edit DSRF/DSRA" | Y:7457, Y:8090, Y:9086, Y:14110, Y:15495 | S:883, S:930, S:990, S:1315, S:1432 | COVERED | |
| U11 | Panel field labels verbatim (incl. "Tenor [Years after COD]", "Start Repayment [Years from COD]", "Swap After Fixed Period ", "Year {n} to") | Y:9258-13459, Y:14241-15216, Y:15665-16670 | `TRANCHE_FORM_LABEL`, `FIN_LABEL` | COVERED | The DSCR hint is used as a `placeholder`; in the canvas it is the error-label tooltip (minor). |
| U12 | `aria-label` = canvas `AccessibleLabel` (the control name, e.g. `"rad_EquityData_FreeEquity"`, `"txt_VATFinancingData_BankMargin"`, `"pcf_btn_..._Save_1"`, `"pcf_FinancingInputs_Content_SeniroDebtTranche_CommandBar"`) (rule 16) | all `AccessibleLabel` / `AccessibilityLabel` | S:185, S:214, S:262; `Fields.tsx:69`, `Fields.tsx:141`; `CanvasFields.tsx:186-189`; S:794, S:802 | WRONG | Radios, dropdowns, text fields, read-only fields, Save/Cancel and the command bars use captions. Only the switches, reset icons and DSRA buttons use the canvas names. |
| U13 | `data-testid` = canvas control name | all | most inputs ✓ | PARTIAL | Not canvas names: `panel-close`, `command-<ItemKey>` (repeated across cards), `finance-category-N` (canvas `con_ProjectFinance_DisplayProject_Body_Form_FinancingInputs_Card`), the status chip (`lbl_Generator_GeneratorStatus_1` / `lbl_FinancingInputs_SeniorDebt_Status`), the lock labels (`lbl_ProjectRevenues_…_VisibilityMessage_39…44`), the category command bar (`pcf_ProjectRevenues_Content_ContractCommandBar_2`) and the tranche command bar. |
| U14 | Hidden or decoy controls correctly not ported: `lbl_ColumnsToShowValue*`, `btn_*_Form_Button_Reset*` (`Visible=false`), `con_FinancingInput_SeniorDebtCalculationStatus` (`Visible=false`), the duplicate `drp_SeniorDebt_Data_Bank`, the invisible DSRA reset icons | Y:1931-2000, Y:5043-5110, Y:15996, Y:16645 | — | COVERED | |
| U15 | Not-connected notice and disabled writes | (D14) | S:837 | COVERED | |
| U16 | 320-px responsive field columns (`locColumnsInContainer`) | Y:1959-1983 | S:131-135 | COVERED | |
| U17 | Required asterisks. Many canvas asterisks are effectively hidden (`Visible = rad_ProductionDataWTG_Lossessp50…="Input losses"`, a copy-paste): VAT Base Rate, Bank Margin, Facility Amount; tranche Drawdown, Gearing, Upfront, Commitment, Base Rate; Energy Yield, Spot Curve and Repayment Profile `Visible=false` | Y:8196, Y:8368, Y:8475, Y:8599, Y:10127, Y:10726, Y:11825, Y:12048, Y:12448, Y:10527, Y:10633, Y:11096 | S:942, S:958, S:971, S:977 (`required`) | WRONG | The code shows asterisks the canvas never shows. Decide whether to keep them (UX) or keep canvas parity. |
| U18 | Loading overlay (`cmp_ProjectFinanceScreen_PopUp_Loading`) | Y:8775-8782 | S:1548 | COVERED | |

---

## Proposed changes

### (a) UI layer: `Screen.tsx`

1. **S:** Start the category cards folded. Folding a category also folds its tranches (B9, B10).
2. **S:** Add per-tranche fold buttons named `ico_FinancingInputs_DisplayProject_Body_Form_SeniorDebt_Up` / `_Down`, toggling local fold state (B11).
3. **S:** Open Add Tranche with `formDirty: true` (B13).
4. **M:** Wire `resetOnTrancheStatusChange` into the Status radio. Disable the whole radio when the stored status is Credit Agreement (B22, S12; see Open question 3).
5. **M:** Hold the standard-flag state for each panel (Equity, VAT, DSRA, Decommissioning, Senior Debt FC):
   - an edit sets the flag false and a reset sets it true;
   - read the flags on open with `parseStandardFlags`;
   - pass them to the payload builders;
   - disable the FC reset while the FC is standard (B7, B24).
6. **M:** DSRA Type `OnChange` re-applies `dsraStandard`, the new end-of-savings and all flags true (B35).
7. **S:** Decommissioning: add the Duration-of-Saving reset icon (B34). Render the six date-validation errors (S21). Extend the Decommissioning and DSRA Save gates to the canvas conditions (S19, S20).
8. **S:** Card formatting: `"##0.0"` / `"#0.0#"` / `"0.0"` through `fmtPercent`-style helpers, `LongDate`, blank Commitment-Fee-Free-Period, and the unpadded DSRA period (U2–U5).
9. **S:** VAT Base Rate default per Y:8235 (Poland → Wibor 3M) (B19). Add the "Preliminary - final numbers…" note for Calculated (S28b).
10. **M:** Labelling (rule 16): pass the canvas `AccessibleLabel` as `aria-label` on `RadioChoice`, `SelectChoice`, `DateBox`, `TextField`, `ReadOnlyField` and `PanelButtons`. This needs an `ariaLabel` prop on the kit fields (shared, D16). Give panel X icons, command bars, status chips and lock labels their canvas `data-testid`s (U12, U13, B43).
11. **S:** Per-action spinner texts (B41). Add the DSRA toggle icon (B38). Reset `fixedAmountOption` on a Gearing change (B26). Clear `kfwValue` on uncheck (B23). FIR-YY seeds the first step-up row (B29).
12. **S:** Required markers: decide parity versus UX (U17).

### (b) Business logic: `rules.ts` and tests

1. **S (high):** Fix `toggleTrancheStatus` so `trackStatusActive` equals the new status. Fix `toggleDsraStatus` so `dsraOriginalStatusActive` equals the new status, and drop `isDeactivatedByButton`. Update the tests at `rules.test.ts:618-633` (W5, W6).
2. **S:** Add `toggleCategoryStatus` (VAT and Decommissioning): `{status, isDeactivatedByButton: deactivating ? yes : null}`. Add a test (W4).
3. **S (high):** Swap the swap-field terms in `canSaveSeniorDebtTranche`:
   - always require `swapRate` (bound to `txt_SeniorDebtData_SwapMargin`);
   - require `swapMargin` and `bankRate` only under Swap-After;
   - validate DSCR regardless of gearing;
   - let an empty Individual list pass, as the canvas does (or log the divergence).

   Fix UT-FIN-095 and the `seniorForm` fixture (S16).
4. **M:** Add payload builders `trancheSavePayload`, `equitySavePayload`, `vatSavePayload`, `decommissioningSavePayload` and `dsraSavePayload`. Each mirrors the canvas fields exactly, including:
   - Name `" - Senior Debt"`;
   - DSCR `Left(…,4)`;
   - the crossed swap columns;
   - `IsFolded`;
   - `Track Status = Coalesce(existing, Yes)`;
   - the SD JSON only when FC is standard;
   - Equity `Is Standard Value` only for Percentage;
   - MMYY packing;
   - BU binding.

   Add step-up `Name = "{DurationYY} - Value"` to `stepUpToStorage`. Add UT tests (W8, W11–W15).
5. **M:** Make the validation messages verbatim per field. Replace `MSG.numeric`/`between()` with per-validator canvas texts. Fix the DSCR text. Add `validatePofds`. Add the six Decommissioning date validators, which need `legallyBindingPermits` and `endDate` on `FinanceProject`. Make `validateCostOfGuarantee` and `validateHedging` fail on blank, as the canvas does (S21, S27–S29).
6. **S:** Make `mmyyLabel` singular for ≤ 1 and add a DSRA unpadded period formatter (U5, U6).
7. **S:** Revisit `baseRateOptions` (Poland: 6 options, per the canvas) versus GUIDE q26, and `trancheStatusOptionDisabled` (S12, S15). Needs a PO decision.
8. **S:** Log the new divergences in `02-OPEN-DECISIONS.md` D15:
   - the Drawdown "Pro Rate" typo (S30);
   - the DSRA duration MM always 0 (S31);
   - the step-up orphan delete (W11);
   - the turbine-count path (D8).

### (c) Data layer: `hooks.ts` (needed to connect)

1. **M:** Register the tables that are **not yet in `power.config.json`**:
   - `vsb_financingcategories`
   - `vsb_financinginputs`
   - `vsb_financinginputsrepaymentamounts`
   - `vsb_financinginputstepupmarginses`

   Already registered: `vsb_projects`, `vsb_capexprojectcontracts`, `vsb_capexcosts`, `vsb_generatorinprojects`, `vsb_generatortypeinprojects`.

   Then regenerate the schema and **verify every `INPUT_COL` / `REPAYMENT_COL` / `STEPUP_COL` logical name**. The finance attributes are absent from `dataverse-attributes.json` (D9).
2. **L:** Fabric SQL sources (D2, D15j): `Assumptions Debt SQL`, `Assumptions Banks SQL`, `AssumptionsKfWTrancheSQL`. A connector or proxy decision is needed before the standard assumptions, seeds and bank/KfW pickers can work.
3. **M:** Read hooks:
   - project, categories, inputs (add `$orderby createdon asc` for tranches), repayments, step-ups, total CAPEX;
   - turbine count via `GeneratorTypeInProjects` (project) → `GeneratorInProjects` (`ModuleTypeInProject` in ids, `statecode eq 0`) unless a direct project lookup is verified (D8).
4. **L:** Mutations:
   - seeds as one `$batch`, or the `vsb_EnsureFinancingInputs` custom API;
   - the guarded Financing-Options patch plus cascade batch;
   - the three toggle PATCHes;
   - the tranche save as one changeset (tranche upsert, then repayment diff and step-up writes, with the server-side duplicate `UniqueKeyString` check first);
   - the delete cascade through `deleteRecord`;
   - the four panel PATCHes;
   - `OwningBusinessUnit@odata.bind` on every create (rule 4; settle omit vs null, D17c);
   - Notify texts mapped to the error banners (rule 19).
5. **S:** Use `isLoading` and `error` from every hook in the Screen (D17i).

---

## Open questions for the product owner

1. **OnVisible "Debt Financing" overwrite (W2).** The canvas resets All Equity → Debt Financing on every visit. Keep the code's guard (set only when blank), or match the canvas?
2. **DSRA margin standard (B4).** The canvas uses the "margin dsrf" row for DSRA as well. Does the SQL table have a "margin dsra" row, and which one should a DSRA seed use?
3. **Tranche Status radio (S12) and Base Rate options (S15).** The code follows "GUIDE q26": individual options are disabled, and Poland gets only Wibor terms. The canvas disables the whole radio for Credit Agreement and offers all six base rates in Poland. Which is right?
4. **Source defects to reproduce or fix:**
   - the Drawdown "Pro Rate" typo, which reopens Pro Rata as Equity First (S30);
   - the DSRA duration months always resetting to 0 on edit (S31);
   - the step-up orphan rows left after "Remove Last Period" (W11);
   - the swap-rate cliff after 2030 (R:350).
5. **Empty Individual repayment schedule (S16).** The canvas allows a save with an Individual profile and zero rows; the code blocks it. Keep the block?
6. **Required asterisks (U17).** Show them where the canvas hides them (copy-paste `Visible` formulas)?
7. **Validation wording (S27–S28).** Confirm that the canvas texts, typos included ("decimal place.", "Occured"), must be kept verbatim. The code currently invents generic texts.
8. **Active turbine count (D8).** Confirm the relationship path: `GeneratorInProjects.ModuleTypeInProject` → `GeneratorTypeInProjects.Project`, versus a direct project lookup.
9. **Fabric SQL (D2).** How will the code app reach the three `Assumptions … SQL` sources?

## Existing D15 / D17 items for this screen

- **D15b.** Five card shells render with no rows (S3). DIVERGENCE, open.
- **D15f.** The shared `pageLock` 5th bullet reads "• Cluster State" instead of "• Change the project status from Draft" (S1). Unchanged; fix before connecting.
- **D15j.** The Assumptions SQL sources are Fabric SQL, not Dataverse (D3, D6). Undecided (D2).
- **D17 (finance-related):**
  - fixed: `dateOnly` for Finance dates;
  - backlog e: the local Dropdown wrapper in finance (`SelectChoice`, S:203);
  - backlog f: the page-lock banner, 8 renderings;
  - backlog h: error notices;
  - backlog i: the screen ignores `error`/`isLoading`;
  - backlog a: two numeric libraries (finance uses `domain/powerFxNumeric.ts`).
- The migration plan 018 "G-A11Y" note says aria-labels go through `a11yFor("Project Finance Screen")`. No `a11yFor` exists anywhere in `src/`, so the note is stale (see U12).
