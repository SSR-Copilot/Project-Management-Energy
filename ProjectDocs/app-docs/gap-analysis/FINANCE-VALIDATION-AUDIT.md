# PM Finance: validation audit of the five panels (21 Oct 2026)

**Why.** The product owner compared the live canvas Finance screen with the code app (screenshots,
21 Oct 2026) and asked for every business validation of the Finance panels to be checked again, the
way the Revenues contract panel was (`REVENUES-CONTRACT-VALIDATION-AUDIT.md`). This audit goes
through each live formula of the Equity, VAT-Financing, Senior Debt tranche, Decommissioning and
DSRA/DSRF panels, their Save / Activate / Deactivate buttons and dialogs, and the Financing Options
cascade, one term at a time.

**Sources.**
- Canvas: `ProjectDocs/_extracted/msapp/projectmanagement/Src/Project Finance Screen.pa.yaml`
  (solution 1.21.709). `Y:` numbers are line numbers in that file.
- Code: `ProjectCosts-CodeApp/src/features/pm/finance/`. `rules.ts:N` and `Screen.tsx:N` are line
  numbers in those files as they stand after this change.
- Decisions: D34 (Finance connected), D35 (standard styling, command-bar alignment), D2 / X2 (the
  Fabric SQL sources `Assumptions Debt SQL`, `Assumptions Banks SQL`, `AssumptionsKfWTrancheSQL`
  are not connected), D1 (no SDK `DataSourceInfo` / `RecordInfo`).

**Rules followed.** Commented-out formulas are skipped (CONVENTIONS rule 10). Every fix is a rule in
`rules.ts` with a test in `rules.test.ts` (UT-FIN-234…241) or `Screen.test.tsx` (UT-FIN-913).

**Status values.**
- **MATCH**: the code does what the live formula does.
- **FIXED**: the code was different and is corrected now.
- **DIVERGENCE (documented)**: a recorded decision (D34 / D1 / D2, or the D34 addendum of 21 Oct
  2026), with a `…CanvasParity` twin where numbers are involved.
- **MISSING**: not implemented.

**Fabric (X2).** Rows marked *(Fabric)* depend on the unconnected SQL sources. Their rules are
ported and tested; today they run over no rows, and the SQL-based reset icons stay disabled.

## Summary

| Status | Rows |
|---|---|
| MATCH | 90 |
| FIXED | 27 |
| DIVERGENCE (documented) | 17 |
| MISSING | 0 |
| **Total** | **134** |

**The fixes (each changes what a user sees or what is saved):**
1. **Equity Save, Shareholder Loan** (Y:7943). The canvas stores `Value(<the shown text>)`, i.e. the
   Fixed Value loan rounded to the whole unit (`Text(…, "###,###,###,##0")`). The unrounded
   `CAPEX − value` was written. `shareholderLoanToSave` (the Percentage branch keeps D34's SOURCE
   DEFECT 6 fix, exact `100 − v`).
2. **Fixed Amount option on Add** (Y:2651, 10771). `locSelectedFixedAmount: []` — no option is
   selected on Add. The code pre-selected "% of Capex".
3. **Gearing change** (Y:10696). The Fixed Amount option goes blank (`locSelectedFixedAmount: []` +
   `Reset`). The code set "% of Capex".
4. **Fixed Amount value field** (Y:10835, 10860). It shows only once an option is chosen, and its
   error has no branch for a blank option. The code showed it (with the "% of Capex" caption) at once.
5. **Tranche month defaults** (Y:9935, 11273, 12245, 12863). A blank stored month reads `0` once the
   years are set (`If(Not(IsBlank(<YY>)), 0)`). `trancheMonthDefault`.
6. **Status change to / from Standard Assumption, later changes** (Y:9239). The canvas blanks
   `locSelectedSeniorDebtTranche`, so the stored status no longer counts. The code kept it, so a
   following Term Sheet ↔ Credit Agreement change reset the whole form a second time.
7. **…, Track Status** (Y:13837). After that blanking the Save writes
   `Coalesce(<blank>.'Track Status Active?', Yes)` = Yes. The code kept the stored value.
8. **…, panel title** (Y:9086). The title reads "Add Tranche" (the Save still patches the edited
   row through `locTempSelectedSeniorDebtTranche`). `trancheFormTitle`.
9. **Repayment schedule** (Y:9865 and the four copies). It is rebuilt only for the Individual
   profile with the tenor and start-repayment years AND months set; otherwise it is left alone.
   The code rebuilt it on every change, with blanks read as 0. `shouldRegenerateRepayments`.
10. **Add Step-Up Period with no row** (Y:13204). `IsBlank(Last(col).DurationYY.Name)` is true for
    an empty collection, so the button is disabled. It was enabled.
11. **Add / Remove Step-Up Period** (Y:13184, 13223). Both need the FIR years AND months set and no
    FIR error. The code checked the years only. `stepUpPeriodChangeAllowed`.
12. **Step-up margin error** (Y:13010). `Visible: Not(ThisItem.Valid)` — a new (blank) row shows
    "Numeric value with only two decimal is allowed" at once. The code hid it while blank.
13. **Stored step-up margin** (Y:13102). It reopens as `Text(Margin, "##0.00")` ("1.50", not "1.5").
14. **DSCR inputs** (Y:10216, 10376). The canvas inputs have no placeholder (the text is the error
    label's `Tooltip`). The invented placeholder is removed.
15. **View-mode radios** (Y:10094, 10495, 10585, 10690, 10996). Drawdown, Energy Yield, Spot Curve,
    Gearing and Repayment Profile are `DisplayMode.View` for a Standard Assumption tranche — not
    changeable, but not greyed. They were Disabled (greyed). `RadioChoice readOnly`.
16. **MaxLength** (Y:7680, 8330, 8565, 14356 and the others, MISSING before). Free Equity 9, the VAT
    bank margin 6, the decommissioning value 15, every other panel input 20. `PANEL_MAX_LENGTH`.
17. **Placeholders** (Y:9387, 14915, 14950, 15890, 15940, 16536, 16589). "Find Bank" on the bank
    picker, "Year" / "Month" on the `cmb_…` duration pairs (MISSING before).
18. **Shareholder Loan** (Y:7794) and **End Date of Saving** (Y:15057) are `DisplayMode.Disabled`:
    white box, grey border, grey text. They rendered as View-mode filled boxes.
19. **Disabled Save look** (Y:7915, 8657, 13665, 15316, 16861). `IconType: ActionButton` with
    `IconColor: If(Disabled, black, white)`: a disabled Save is a transparent text button with a
    black ✓ (PO screenshot). Enabled it stays primary. `PanelButtons subtleWhenDisabled`.
20. **`cmb_…` ComboBoxes** keep their bottom underline (PO screenshot): VAT base rate, bank, the
    decommissioning and DSRA/DSRF duration pairs.

## Audit table

### Financing Options and the cascade

| # | Canvas control | Live formula (quoted, YAML line) | Code (file:line) | Status |
|---|---|---|---|---|
| 1 | `rad_ProjectFinance_FinancingOptions.DefaultSelectedItems` | `Coalesce(gblRecordSelectedProject.'Financing Options', 'Debt Financing')` Y:2381 | `financingOption`, Screen.tsx:1006 (the visit write fills a blank) | MATCH |
| 2 | same, `DisplayMode` | `If(Or(IsBlank('Cluster State'.Name), = "Draft", con_Milestones_Page_LockMessage_8.Visible), Disabled, Edit)` Y:2390 | `isPageLocked`, Screen.tsx:1006 | MATCH |
| 3 | same, `OnChange`, project | `Patch(Projects, gblRecordSelectedProject, {'Financing Options': Selected.Value})`, spinner "Please wait, Saving..." Y:2402 | `planFinancingOption` rules.ts:3066, `financingOptionJob` | MATCH |
| 4 | same, VAT | `If(varVAT.'Is Deactivated By Button' <> Yes, Patch(… Status: If(All Equity, Inactive, Debt Financing, Active)); UpdateIf(colFinanceCategoriesInProject, true, {IsFolded: true}))` Y:2402 | `applyFinancingOptionCascade` rules.ts:1863; fold-all Screen.tsx:709 | MATCH |
| 5 | same, tranches | All Equity → every tranche Inactive; Debt Financing → `If(Item.'Track Status Active?' = Yes, Active, Inactive)` Y:2402 | rules.ts:1863 | MATCH |
| 6 | same, DSRA/DSRF | All Equity → Inactive; Debt Financing → `If('DSRA/DSRF Original Status Active?' = Yes, Active, Inactive)` Y:2402 | rules.ts:1863 | MATCH |
| 7 | `OnVisible`, the project write | `Patch(Projects, …, {'Financing Options': 'Debt Financing'})` on every visit Y:1509 | `planFinancingOptionOnVisit` (only while blank) | DIVERGENCE (documented, D34 SOURCE DEFECT 2, twin `unconditionalDebtFinancingCanvasParity`) |
| 8 | `OnVisible`, Equity / VAT seeds | `Patch(Defaults(…), {… 'Free Equity Value': 10, 'Shareholder Loan Value': 90, …})`, VAT `If(Poland, Wibor 3M, Euribor 3M)`, 1.5, Calculated, flags JSON, owner, `UniqueKeyString`; `Notify("Error while creating <X> financing input: " …)` Y:1514-1602 | `planSeeds` / `seedJobs` rules.ts | MATCH |
| 9 | `OnVisible`, Senior Debt / DSRA / Decommissioning seeds | built from `locStandardAssumption…` Y:1603-1870 *(Fabric)* | `seedsAllowed` | DIVERGENCE (documented, D34 X2: withheld) |

### Category command bars, cards and dialogs

| # | Canvas control | Live formula (quoted, YAML line) | Code (file:line) | Status |
|---|---|---|---|---|
| 10 | `pcf_ProjectRevenues_Content_ContractCommandBar_2.Items`, labels | `"Edit " & Switch(Order, 1, "Equity", 2, "Tranche", ThisItem.Name)` (and Activate / Deactivate) Y:2764 | `categoryCommandLabel` | MATCH |
| 11 | same, Edit `ItemEnabled` | `true` Y:2777 (the gallery `DisplayMode` disables it while locked) | Screen.tsx:681 | MATCH |
| 12 | same, Activate / Deactivate `ItemVisible` / `ItemEnabled` | `And(Status = Inactive/Active, Order in [2,5])`; `RecordInfo(…, EditPermission)` Y:2790-2829 | `categoryCommandBar` rules.ts:2030 | MATCH (RecordInfo: DIVERGENCE, D1, row 124) |
| 13 | same, `Visible` | `Not(ThisItem.Order in [3,4])` Y:2941 | Screen.tsx `body` | MATCH |
| 14 | same, `OnSelect` Order 1 | `locFreeEquity: 'Free Equity Value'`, flags from `locIsEquityStandardAssunption` Y:2848-2862 | `openEquityForm` rules.ts:3788 | MATCH |
| 15 | same, Order 2 | `locVatAmount: 'VAT Facility Amount Value'`, `locVatFinancingStatndardValues` from `'Is Standard Value'`; Edit → panel, else the activation dialog Y:2863-2889 | `openVatForm` rules.ts:3798; Screen.tsx `onCategoryCommand` | MATCH |
| 16 | same, Order 5 | Activate / Deactivate → dialog; Edit → `locMyRecord` from the JSON, `locIsDirtyDecommissiongForm: false`, the stored values Y:2890-2937 | `openDecommissioningForm` rules.ts:3817 | MATCH |
| 17 | `cmp_PopUp_Confirmation_1` texts | Title `If(Active, "Deactivate", "Activate") & Switch(Order, 5, " Decommissioning Cost", " Tranche")`; Description `… & Switch(Name, "Decommissioning Costs", " Decommissioning Cost?", " tranche for VAT Financing Input?")`; Confirm `If(Active, "Deactivate", "Activate")` Y:8788-8881 | `categoryToggleDialog` rules.ts:2726 | MATCH |
| 18 | same, `OnConfirm` | Status flips; `'Is Deactivated By Button': If(Active, Yes)` (Blank on activate); spinner `"Please wait, " & <Deactivating/Activating> & <" Decommissioning Cost..." / " tranche...">` Y:8810-8870 | `toggleCategoryStatus` rules.ts:1930, `planCategoryToggle` :3097, `categoryToggleSpinner` :2956 | MATCH |
| 19 | `con_Generator_GeneratorStatus_1` | `Visible: Order in [2,4,5]`; Fill / Border `If(Status = 0, SuccessLight / Green, Grayscale40 / Grayscale10)`; label = Status Y:7216-7268 | `StatusChip`, Screen.tsx | MATCH |
| 20 | `ico_…_Up_1` / `_Down_1.OnSelect` | toggle the category's `IsFolded`; `UpdateIf(colFinancingInputInProject, category, {IsFolded: true})` Y:7145-7208 | `toggleCategoryFold` | MATCH |
| 21 | `gal_…_FinancingInputs` | `Items: Filter(…, Not(Order = 6))`; `Visible: !IsBlank(Cluster State) && <> "Draft"`; `DisplayMode` = the lock Y:2415-2456 | Screen.tsx gallery | MATCH |

### Equity panel

| # | Canvas control | Live formula (quoted, YAML line) | Code (file:line) | Status |
|---|---|---|---|---|
| 22 | `lbl_con_…_Equity_FormHeader.Text` | `"Edit Equity"` Y:7457 | `FIN_LABEL.equityTitle` | MATCH |
| 23 | `ico_EditEquity_RightPanel_BodyHeaderCancel.OnSelect` | close + `Select(btn_…_Equity_Form_Button_Reset)` Y:7472 | `closePanel` (the draft is rebuilt on open) | MATCH |
| 24 | `rad_EquityData_FreeEquity.DefaultSelectedItems` | `Coalesce([locSelectedFinancingInput.'Free Equity'], [Percentage])` Y:7538 | `openEquityForm` rules.ts:3788 | MATCH |
| 25 | same, `OnChange` | `Reset(txt_…FreeEquityEUR); locFreeEquity: Blank(), both flags false` Y:7547 | Screen.tsx:1054 | MATCH |
| 26 | `lbl_EquityData_Required_FreeEquity` / `…FreeEquityEUR` | `"*"`, always visible Y:7567, 7703 | `required` Screen.tsx:1054, 1066 | MATCH |
| 27 | `txt_EquityData_FreeEquityEUR` | `Value: locFreeEquity`; `OnChange`: both flags false; `FontColor` / `FontItalic` = `locIsStandardFreeEquity`; `MaxLength: 9` Y:7671-7692 | Screen.tsx:1066 | FIXED (MaxLength, fix 16) |
| 28 | `lbl_EquityData_FreeEquityEUR.Text` | `"Free Equity " & If(Percentage, "[%]", If(Poland, "[PLN]", "[EUR]"))` Y:7697 | `freeEquityLabel` | MATCH |
| 29 | `lbl_EquityData_FreeEquityEUR_ErrorMessage.Visible` | Percentage: `Not(And(Not(IsBlank), IsTwoDecimal, InRange(0, 100)))`; Fixed: `Not(And(Not(IsBlank), IsInteger, InRange(0, If(Poland, 500000000, 100000000)), Not(Value > locTotalDevexCapexCost)))` Y:7640 | `validateFreeEquity` rules.ts:883 | MATCH |
| 30 | same, `Text` | `"Input must not be blank"` / `"Number from 0 to 100, with up to two decimal places"` / `"Numeric value in range 0 to " & <cap>` / `"Free Equity must not be higher than Total CAPEX."` Y:7613 | `MSG.*`, rules.ts:883 | MATCH |
| 31 | `but_…_farmdown_Reset_2` | `Visible: Percentage`; `OnSelect: locFreeEquity: 10, both flags true`; Tooltip `"Reset to 10%."` Y:7720-7751 | Screen.tsx:1076 | MATCH |
| 32 | `con_EquityData_ShareholderLoanEUR.Visible` | `Free Equity = Percentage` Y:7766 | Screen.tsx:1086 | MATCH |
| 33 | `txt_EquityData_ShareholderLoanEUR.Value` | Percentage: `If(And(Not(IsBlank), IsInteger, InRange(0,100)), 100 − v, Blank())`, `Text(…, "###,###,###,##0")` Y:7800 | `shareholderLoan` rules.ts:730 | DIVERGENCE (documented, D34 SOURCE DEFECT 6, twin `shareholderLoanCanvasParity`) |
| 34 | same, `DisplayMode` | `DisplayMode.Disabled` Y:7794 | `disabledBox` + `disabled`, Screen.tsx:1086 | FIXED (18) |
| 35 | `lbl_EquityData_Required_ShareholderLoanEUR.Visible` | `rad_ProductionDataWTG_Lossessp50.Selected.Value = "Input losses"` (another screen's control: never true) Y:7866 | no asterisk | MATCH |
| 36 | `pcf_btn_…_Equity_Form_Buttons_Save.DisplayMode` | `And(Not(IsBlank(rad.Selected.Value)), Not(IsBlank(txt.Value)), Not(lbl_…ErrorMessage.Visible))` Y:7898 | Screen.tsx:1049 | MATCH |
| 37 | same, `OnChange` Patch | Name `<Project> & "-Equity"`, Category, Free Equity, `Value(txt)`, `'Shareholder Loan Value': Value(txt_…ShareholderLoanEUR.Value)`, Project, `'Is Standard Value': If(Percentage, JSON([{…}]))`; spinner "Saving Financing Input for Equity..." Y:7925-7980 | `planEquitySave` rules.ts:3153, `shareholderLoanToSave` :766 | FIXED (1) |
| 38 | same, the card refresh | `locIsEquityStandardAssunption` re-read from the collection Y:7963 | the query refresh after the write | MATCH |
| 39 | `IconColor` / look | `IconType: ActionButton`, `IconColor: If(Disabled, black, white)` Y:7915 | `PanelButtons subtleWhenDisabled` | FIXED (19) |

### VAT-Financing panel

| # | Canvas control | Live formula (quoted, YAML line) | Code (file:line) | Status |
|---|---|---|---|---|
| 40 | `lbl_con_…_VATFinancing_FormHeader.Text` | `"Add Tranche"` Y:8090 | `FIN_LABEL.vatTitle` | MATCH (reproduced, D34) |
| 41 | `ico_EditEquity_RightPanel_BodyHeaderCancel_1.OnSelect` | close, `locStandardBankMarginValue: Blank()`, reset Y:8105 | `closePanel` | MATCH |
| 42 | `cmb_VATFinancingData_BaseRate.Items` | `If(Poland, Choices('Base Rate Options'), FirstN(…, 3))` Y:8254 | `baseRateOptions` rules.ts:355 | MATCH |
| 43 | same, `DefaultSelectedItems` | `Coalesce(If(Poland, [Wibor 3M], flag = true, [Euribor 3M]), LookUp(…, stored))` Y:8235 | `vatBaseRateDefault` rules.ts:3182 | MATCH |
| 44 | same, `OnChange` / `FontColor` / `FontItalic` | flag false; style = `locIsStandardBaseRate` Y:8250-8268 | Screen.tsx:1118 | MATCH |
| 45 | `but_…_farmdown_Reset_3.OnSelect` | `Reset(cmb); flag true`; Tooltip "Reset to standard assumption." Y:8214 | Screen.tsx:1127 | MATCH |
| 46 | `lbl_VATFinancingData_Required_*` (four) | `rad_ProductionDataWTG_Lossessp50 … = "Input losses"` — never true Y:8196, 8368, 8475, 8599 | no asterisks | MATCH (D34 U17) |
| 47 | `txt_VATFinancingData_BankMargin` | `Value: Coalesce(locStandardBankMarginValue, Text(stored))`; `OnChange`: flag false; `MaxLength: 6` Y:8321-8344 | Screen.tsx:1137 | FIXED (MaxLength, fix 16) |
| 48 | `lbl_VATFinancingData_BankMargin_ErrorMessage` | `Visible: And(Not(IsBlank), Or(Not(IsTwoDecimal), Not(InRange(0, 10))))`; `Text`: two-decimals branch first ("Numeric value with maximum of two decimals"), then "Please ensure Bank margin can be maximum 10" Y:8302 | `validateVatBankMargin` rules.ts:1511 | MATCH |
| 49 | `but_…_farmdown_Reset_4.OnSelect` | `locStandardBankMarginValue: Text(Value(1.5), "0.0")`, flag true Y:8386 | Screen.tsx:1146 | MATCH |
| 50 | `rad_VATFinancingData_VATfacilityAmount` | `DefaultSelectedItems: [stored]`; `OnChange: Reset(txt_…AmountEUR); locVatAmount: Blank()` Y:8437-8449 | Screen.tsx:1152 | MATCH |
| 51 | `con_VATFinancingData_VATFacilityAmountEUR.Visible` | `= Individual` Y:8492 | Screen.tsx:1159 | MATCH |
| 52 | `lbl_…VATFacilityAmountEUR_ErrorMessage` | Calculated → the Preliminary note (container hidden); Individual → `IsBlank` → "Input can not be blank", else `Not(And(IsInteger, InRange(0, cap)))` → `"Numeric value must be between 0 and " & cap` Y:8515-8547 | `validateVatFacilityAmount` rules.ts:1522 | MATCH |
| 53 | `txt_VATFinancingData_VATFacilityAmountEUR` | `Value: locVatAmount`; `DisplayMode: If(Calculated, Disabled, Edit)` (hidden then); `MaxLength: 20` Y:8552-8575 | Screen.tsx:1159 | MATCH |
| 54 | `pcf_btn_…_VATFinancing_Form_Buttons_Save.DisplayMode` | base rate, margin, radio not blank; no margin error; Individual → amount not blank and no error (no dirty term) Y:8632 | `canSaveVatFinancing` rules.ts:3189 | MATCH |
| 55 | same, `OnChange` Patch | Name `"-VAT-Financing"`, `LookUp(categories, Order = 2)`, base rate, `Value(margin)`, radio, `locVatAmount = Value(txt_…AmountEUR.Value)`, Project, `JSON(Table(locVatFinancingStatndardValues), Compact)`; spinner "Saving Financing Input for VAT Financing..." Y:8667-8719 | `planVatSave` rules.ts:3203 | MATCH |
| 56 | Save / Cancel look and labels | Save: no `AccessibilityLabel`; Cancel: none either (the hidden reset carries `btn_…_VATFinancing_Form_Button_Reset`) Y:8628-8764 | Screen.tsx footer (D34 kept the Cancel label) | FIXED (Save look, 19) |

### Senior Debt: command bar, dialog and delete

| # | Canvas control | Live formula (quoted, YAML line) | Code (file:line) | Status |
|---|---|---|---|---|
| 57 | `pcf_FinancingInputs_Content_SeniroDebtTranche_CommandBar` Add | `And(CreatePermission, Not(And(CountIf(SA) = 1, CountIf(true) = 1)))` Y:2513 | `seniorDebtCommandBar` rules.ts:1989 | MATCH |
| 58 | same, Edit | `And(Not(IsBlank(sel)), RecordInfo(…), sel.Status = Active)` Y:2553 | rules.ts:1989 | MATCH |
| 59 | same, Activate / Deactivate | visible by status; Deactivate needs `CountIf(Order 3, Active) > 1` (the Credit Agreement terms are commented out) Y:2562-2601 | rules.ts:1989 | MATCH |
| 60 | same, Delete | `Not(Credit Agreement)`, `Not(Standard Assumption)`, `Not(CountIf(true) = 1)` Y:2604-2634 | rules.ts:1989 | MATCH |
| 61 | same, `OnSelect` Add | Reset; clear both collections; `locSelectedStandardAssumption: standard2`, `locFormIsDirty: true`, `locSelectedFixedAmount: []`, the fee values from standard2 Y:2642-2661 | `openTrancheForm` rules.ts:3577 | MATCH (option FIXED, row 78) |
| 62 | same, `OnSelect` Edit | `LookUp` the row; statuses, `locFinancialCloseToShow`, `locIsFinancialCloseDateStandard` from the JSON, the repayment and step-up collections Y:2663-2732 | `openTrancheForm`, `repaymentRowsOf`, `stepUpRowsOf` | MATCH (the re-read: DIVERGENCE, D34) |
| 63 | `cmp_PopUp_ActivationForSeniorDebtTranche` texts | Title `$"{Deactivate/Activate} Trache"` / "Delete Tranche"; Description with `""<name>""`; Confirm "Confirm" Y:8888-9012 | `trancheActionDialog` rules.ts:2747 | MATCH |
| 64 | same, `OnConfirm` activation | Status flips; `'Is Deactivated By Button': If(Active, Yes, <unchanged>)`; `'Track Status Active?': If(Active, No, Yes)`; `Notify($"{FirstError.Message} : Error Occured while Tranche Status change")` Y:8946-8973 | `toggleTrancheStatus` rules.ts:1895, `planTrancheToggle` :3083 | MATCH |
| 65 | same, deletion | `RemoveIf(step-ups)`, `RemoveIf(repayments)`, then `Remove(tranche)` Y:8980-9000 | `planTrancheDelete` rules.ts:3125 (checked deletes, rule 14) | MATCH |

### Senior Debt: Add / Edit Tranche panel

| # | Canvas control | Live formula (quoted, YAML line) | Code (file:line) | Status |
|---|---|---|---|---|
| 66 | `lbl_con_…_SeniorDebt_FormHeader_1.Text` | `If(IsBlank(locSelectedSeniorDebtTranche), "Add Tranche", "Edit Tranche")` Y:9086 | `trancheFormTitle` rules.ts:1681 | FIXED (8) |
| 67 | `ico_…_BodyHeaderCancel_2` / Cancel | close, reset, `Reset(rad_…TrancheStatus)` Y:9101, 14032 | `closePanel` | MATCH |
| 68 | `lbl_SeniorDebtData_TrancheStatus_ErrorMessage` | `And(CountIf(SA, Order 3) >= 1, selected = SA, Not(locCheckForStandardAssumption = <the SA row>))`; "Standard Assumption Tranche can't be added" Y:9166-9200 | `standardAssumptionConflict` rules.ts:974; Screen.tsx:1204 | MATCH |
| 69 | `rad_SeniorDebt_Data_TrancheStatus` default / `DisplayMode` | stored status, else SA; `If(sel.'Tranche Status' = Credit Agreement, Disabled, Edit)` Y:9209-9228 | `openTrancheForm`; `trancheStatusRadioDisabled` rules.ts:1721 | MATCH |
| 70 | same, `OnChange` to SA | dirty; `locSelectedStandardAssumption: standard2`; reset; `locSelectedSeniorDebtTranche: Blank()`; the fee values from standard2 Y:9239 | `applyTrancheStatusChange` rules.ts:3662 | MATCH |
| 71 | same, from SA | `Or(sel = SA && new <> SA, previous = SA && new <> SA)`: reset, selection Blank, standard Blank, fee / fixed values Blank Y:9239 | rules.ts:3662 | FIXED (6) |
| 72 | same, the selection blanking | the title and `'Track Status Active?': Coalesce(<blank>…, Yes)` follow from `locSelectedSeniorDebtTranche: Blank()` Y:9239, 13837 | rules.ts:3662, `trancheRecord` :3374 | FIXED (7) |
| 73 | same, every branch | `locFinancialCloseToShow: locStandardFinancialClose, locIsFinancialCloseDateStandard: true; Reset(dte…)` Y:9239 | rules.ts:3662 | MATCH |
| 74 | Bank (`cmb_SeniorDebt_Data_Bank`, over `drp_…`) | `Items: colAssumptionBanks` *(Fabric)*; default by stored id; `DisplayMode: If(SA, Disabled, Edit)`; `InputTextPlaceholder: "Find Bank"`; asterisk `Not(SA)` Y:9337-9393 | Screen.tsx:1206 | FIXED (placeholder, fix 17) |
| 75 | Other Bank | `Visible: cmb.Selected.bankname = "Other"`; `Value: stored`; `DisplayMode` blank (Edit); asterisk; `MaxLength: 20` Y:9404-9459 | `isOtherBank`; Screen.tsx:1212 | MATCH |
| 76 | `tgl_SeniorDebt_Data_KfW_Tranche` / `drp_…_KfW_Tranche_Value` | `Checked: stored = Yes`; `DisplayMode: If(SA, Disabled)`; `OnUncheck: Reset(value)`; value `DisplayMode: If(SA Or Not(Checked), Disabled)`, asterisk `Not(SA)` Y:9480-9576 | Screen.tsx:1218-1222 | MATCH |
| 77 | `dte_SeniorDebt_Data_Financial_Close` and its reset | `DisplayMode: If(SA, Disabled)`; style = `locIsFinancialCloseDateStandard`; `OnChange`: dirty + flag false; reset: `DisplayMode: If(flag, Disabled)`, `Visible: Not(SA)`, `locFinancialCloseToShow: locStandardFinancialClose`, flag true; Tooltip "Reset to current project Cluster 5 date minus 3 months." Y:9654-9707 | Screen.tsx:1232-1245 (reset also needs Fabric) | MATCH *(Fabric)* |
| 78 | `rad_SeniorDebt_Fixed_Amount_Options.DefaultSelectedItems` | `locSelectedFixedAmount` (`[]` on Add) Y:10771 | `openTrancheForm` rules.ts:3577 | FIXED (2) |
| 79 | Tenor | YY `Items: Value <= 25`, default `Coalesce(stored, std)`; MM default `Coalesce(stored, std, If(Not(IsBlank(YY)), 0))`; `DisplayMode: If(SA, Disabled)` Y:9786-9953 | `trancheMonthDefault` rules.ts:1690 | FIXED (5) |
| 80 | `lbl_SeniorDebtData_Tenor_ErrorMessage` | `Visible: Or(And(YY = 0, MM = 0), Individual && TenorYY < StartRepaymentYY)`; Text: zero → "0 Year and 0 Months can't be selected", else "The Tenor duration must not be shorter than the Start of repayment." Y:9727-9756 | `validateYearMonthPair` rules.ts:1591, `validateTenorAgainstRepaymentStart` :1600 | MATCH |
| 81 | Tenor / start / profile `OnChange` | dirty; indexed backup; rebuild only `If(And(Individual, all four not blank), …)`: years `Year(COD + startYY + startMM)` … `Year(COD + tenorYY + tenorMM)`, values by index, `Valid: Coalesce(old, false)` Y:9849-9915 (and four copies) | `shouldRegenerateRepayments` rules.ts:1699, `regenerateRepaymentYears` :1042 | FIXED (9) |
| 82 | `rad_SeniorDebt_Data_Drawdown` | `Switch(Text(Coalesce(stored, std)), "Equity First", …, "Pro Rate", Pro Rata, Equity First)` Y:10076 | `drawdownDefault` rules.ts:3535 | DIVERGENCE (documented, D34 SOURCE DEFECT 5, twin `drawdownDefaultCanvasParity`) |
| 83 | Drawdown, Energy Yield, Spot Curve, Gearing, Repayment Profile `DisplayMode` | `If(SA, DisplayMode.View, DisplayMode.Edit)` Y:10094, 10495, 10585, 10690, 10996 | `RadioChoice readOnly`, Screen.tsx:1254-1317 | FIXED (15) |
| 84 | Energy Yield / Spot Curve / Gearing / Repayment Profile defaults | `Switch(Text(Coalesce(…)), …)` with p90 / Low Curve / Debt Sizing / DSCR Sculpted fall-backs ("DSCR Sculpated" never matches, same result) Y:10480, 10570, 10677, 10981 | `energyYieldDefault`, `spotCurveDefault`, `repaymentProfileDefault` | MATCH |
| 85 | DSCR Contracted / Uncontracted | `Value: $"{Text(Coalesce(…), "#.00")}{If(IsBlank, "", "x")}"`; `DisplayMode: If(SA, Disabled)`; asterisk `Gearing = Debt Sizing`; `MaxLength: 20`; no placeholder Y:10216-10437 | `formatDscr` rules.ts:1002; Screen.tsx:1262, 1271 | FIXED (14) |
| 86 | DSCR error labels | `Visible: And(Not(IsBlank), Not(IsMatch(…, "^(?:1\.[0-9]{2}|2\.(?:[0-4][0-9]|50))x$")))`, comma variant outside "en"; the en / comma texts Y:10147-10211 | `validateDscr` rules.ts:1011 | MATCH |
| 87 | Gearing `OnChange` | dirty; `locSelectedFixedAmount: []`; `Reset(rad_SeniorDebt_Fixed_Amount_Options)` Y:10696 | Screen.tsx:1290 | FIXED (3) |
| 88 | Fixed Amount option / value | option `DisplayMode` blank (Edit), `OnChange`: value Blank + Reset; value container `Visible: Fixed Amount && !IsBlank(option.Selected)`; `Value: Text(locFixedAmount, If(%, "##0.0", "#"))`; label `If(%, "% of Capex", "Fixed Value " & <unit>)` Y:10767-10920 | Screen.tsx:1292-1312 | FIXED (4) |
| 89 | `lbl_SeniorDebtData_FixedAmountValue_ErrorMessage` | `If(%, And(Not(IsBlank), Or(Not(IsOneDecimal), Not(InRange(0,100)))), Fixed, And(…, Or(Not(IsInteger), Not(InRange(0, cap)))))`; texts "value must be in range 0 to 100 with max one decimal." / `"value must be integer in range 0 to " & "1,000,000,000" & "."` Y:10838-10887 | `validateFixedAmount` rules.ts:1577 | FIXED (blank option, 4) |
| 90 | Start Repayment | YY `Value < 6`; MM default as row 79; the start error is `Visible: false` (formula commented out) Y:11116-11284 | Screen.tsx:1320 | FIXED (month default, fix 5) |
| 91 | Frequency of Repayment | `colFrequencyInMonths`, `Coalesce(stored, std)`, `If(SA, Disabled)`, asterisk Y:11435-11454 | `FREQUENCY_OPTIONS`; Screen.tsx:1326 | MATCH |
| 92 | Hedging | `Value: Text(Coalesce(…), "##0.0")`; error `Visible: Not(And(Not(IsBlank), IsOneDecimal, InRange(0,100)))` (shows on blank); "Value must be in range 0 to 100 with max one decimal." Y:11486-11567 | `validateHedging` rules.ts:1543 | MATCH |
| 93 | Repayment amounts | label `$"{Year} - Repayment Amount " & <unit>`; `OnChange`: `Valid: And(Not(IsBlank), IsInteger, InRange(0, If(Poland, 500000000, 100000000)))`, dirty; error `Visible: Not(ThisItem.Valid)`, `"value must be numeric in range 0 to " & "100,000,000" & " without decimal place."` Y:11620-11696 | `validateRepaymentAmount` rules.ts:1106; Screen.tsx:1342 | MATCH |
| 94 | Upfront Fee | radio `Coalesce`, `If(SA, Disabled)`, `OnChange`: value Blank + Reset; value `Text(locUpfrontFee, If(Fixed, "##########", "##0.0#"))`, label `$"Upfront fee {[%] / unit}"`; error per option Y:11758-11950 | `validateUpfrontFee` rules.ts:1561; Screen.tsx:1357-1368 | MATCH |
| 95 | Commitment Fee | radio as above; value `Text(locCommitmentFee, "##0.0#")`; error `And(Not(IsBlank), Or(Not(IsTwoDecimal), Not(InRange(0,100))))`, "Value must be in a range 0 to 100 with maximum two decimal place." Y:11991-12140 | `validateCommitmentFeeValue` rules.ts:1549 | MATCH |
| 96 | Commitment Fee Free Period | YY `Value < 4`; MM default as row 79; error `Visible` commented out (false); asterisk `Visible: false` Y:12161-12259 | Screen.tsx:1383 | FIXED (month default, fix 5) |
| 97 | `rad_SeniorDebtData_BaseRate_2` | `Items: If(Poland, Choices, FirstN(…, 3))`; default `Switch(…, If(Poland, Wibor 3M, Euribor 3M))`; `If(SA, Disabled)` Y:12373-12422 | `baseRateDefault` rules.ts:2125; Screen.tsx:1390 | MATCH |
| 98 | Swap Rate (`txt_SeniorDebtData_SwapMargin`), both Bank Margins | `Text(Coalesce(…), "##0.0#")`; `If(SA, Disabled)`; error `And(Not(IsBlank), Or(Not(IsTwoDecimal), Not(InRange(0,10))))`, "value must be in range 0 to 10 with max two decimal."; the Operational-phase input has no `OnChange` Y:12468-12732 | `validateRateField` rules.ts:1534 | MATCH (no-dirty: DIVERGENCE, row 127) |
| 99 | Fixed Interest Rate | YY `Value <= 25`, MM default as row 79; error `And(Not(IsBlank(YY)), Not(IsBlank(MM)), YY = 0, MM = 0)`; YY `OnChange`: seed row 1 when the toggle is on and no row Y:12753-12877 | `validateYearMonthPair`; Screen.tsx:1416 | FIXED (month default, fix 5) |
| 100 | `tgl_SeniorDebtData_Step_Up_Bank_Margin` | `Checked: Coalesce(stored, std)`; `If(SA, Disabled)`; `OnCheck`: seed row 1 if `Not(IsBlank(FIR YY))` and no FIR error (the MM term is commented out); `OnUncheck: Clear` Y:12907-12953 | `canSeedStepUp` rules.ts:3908; Screen.tsx:1427 | MATCH |
| 101 | Step-up rows | year label `$"Year {If(prev.DurationYY = FIR, "", Coalesce(prev.DurationYY + 1, 1))} to"`; YY `Filter(Or(IsBlank(prev), Value > prev), Value <= FIR, Value <> 0)`; margin `Text(Margin, "##0.00")`, `OnChange`: `Valid: And(Not(IsBlank), IsTwoDecimal, InRange(0,100))`; error `Visible: Not(ThisItem.Valid)` Y:12994-13115 | `stepUpYearOptions` rules.ts:1198, `stepUpFromStorage` :1168; Screen.tsx:1446-1470 | FIXED (12, 13) |
| 102 | `btn_SeniorDebt_BankMargin_Remove_StepUp_LastPeriod` | `DisplayMode: If(Or(SA, CountRows <= 1), Disabled)`; `OnSelect: If(And(FIR YY, FIR MM, no FIR error), RemoveIf(last))` Y:13148-13193 | `stepUpRemoveEnabled` :1225, `stepUpPeriodChangeAllowed` :1712; Screen.tsx:1477 | FIXED (11) |
| 103 | `btn_SeniorDebt_BankMargin_Add_StepUp_Period_1` | `DisplayMode: If(Or(SA, IsBlank(Last.DurationYY.Name), IsBlank(Last.Margin), Not(Last.Valid), Last.DurationYY = FIR), Disabled)`; `OnSelect: If(And(FIR YY, FIR MM, no error), Collect({Id: last + 1, …}))` Y:13197-13263 | `stepUpAddEnabled` rules.ts:1213; Screen.tsx:1488 | FIXED (10, 11) |
| 104 | `lbl_SeniorDebtData_SUB_ErrorMessage_1` | `Or(Not(Last.DurationYY = FIR), CountIf(DurationYY = FIR) > 1) && Toggle.Checked`; "Step-up Bank Margin duration must be equal to the Fixed Interest Rate duration" Y:13267-13288 | `stepUpScheduleValid` rules.ts:1186; Screen.tsx:1501 | MATCH |
| 105 | Swap After Fixed Period | `Checked: Coalesce(stored, std)`; `If(SA, Disabled)`; label "Swap After Fixed Period "; the two fields `Visible: Checked`, values from the stored row only, "Swap Rate [%]" / "Bank Margin [%]", rate errors Y:13308-13511 | Screen.tsx:1505-1527 | MATCH |
| 106 | `pcf_btn_…_SeniorDebt_Form_Buttons_Save_1.DisplayMode` | the 40-term `And(locFormIsDirty, …, Not(locIsSavingSeniorDebtTranche))` Y:13543-13651 | `canSaveSeniorDebtTranche` rules.ts:1790 | MATCH (bank id: DIVERGENCE, row 125) |
| 107 | same, `OnChange`, duplicate check | key `<Project>-SeniorDebt-<status>-<bank>-<kfw>` / `-StandardAssumption`; `LookUp('Financing Inputs', key && Or(IsBlank(cur), id <> cur))` → `Notify("Same senior debt tranche already exists for this project.")`, close, reset Y:13681-13755 | `buildUniqueKey` rules.ts:942, `planTrancheSave` :3441; Screen.tsx:717 | MATCH |
| 108 | same, the tranche Patch | the 45 columns, the crossed swap names, owner, category, `IsFolded: true`, `Coalesce(Track Status, Yes)`, `If(locIsFinancialCloseDateStandard, JSON([{FinancialCloseDate: true}]))`, `UniqueKeyString`; base = `locTempSelectedSeniorDebtTranche` when the selection was blanked Y:13756-13847 | `trancheRecord` rules.ts:3374 | MATCH |
| 109 | same, repayments and step-ups | Individual: `RemoveIf(years not in col)` + Patch per row (Name `{Year} - Value`, Year as text, category, tranche, project, owner); else `RemoveIf(all)`; step-ups: toggle on with rows → Patch per row (Duration, Start Year, Order, `Value(Margin)`), else `RemoveIf(all)`; "Error while saving Senior Debt tranche: " & FirstError.Message Y:13850-13997 | `repaymentDiff` rules.ts:1078, `stepUpWrites` :1244 | MATCH (Remove Last Period: DIVERGENCE, D34 SOURCE DEFECT 7) |

### Decommissioning panel

| # | Canvas control | Live formula (quoted, YAML line) | Code (file:line) | Status |
|---|---|---|---|---|
| 110 | `rad_DecommissioningData_CostsOfDecommissioning_1` | default by stored type; `OnChange`: dirty, value Blank, `CostsofDecommissioningValue: false`, Reset; asterisk `Visible: false`; title "Edit Decommissioning Cost" Y:14110, 14203-14259 | Screen.tsx:1553 | MATCH |
| 111 | value field and error | label `If(Per Turbine, "Costs of Decommissioning [" & EUR & "/WTG]", "Total Costs of Decommissioning " & [EUR])`; `OnChange`: dirty + flag false; `MaxLength: 15`; error: integer branch "Numeric value must be integer without decimal.", range `$"Value must be in range 0 to {Text(cap, "###,###,###,###")}"` (10,000,000 / 1,000,000; Poland 50,000,000 / 5,000,000) Y:14279-14398 | `validateDecommissioningValue` rules.ts:1435; Screen.tsx:1563 | FIXED (MaxLength, fix 16) |
| 112 | value / guarantee / duration resets | `locStandardAssumptionDecommissioning.…`, flag true, dirty; Tooltip "Reset to standard assumption." Y:14403-14431, 14550-14567, 14976-14999 *(Fabric)* | Screen.tsx:1572, 1591, 1637 (disabled without Fabric) | DIVERGENCE (documented, D34 X2) |
| 113 | Cost of Guarantee | `Value: Text(loc, "0.0")`; flag; error `Visible: Not(And(Not(IsBlank), IsOneDecimal, 0 <= v < 10))` (shows on blank), `$"Numeric value with maximum of one decimal in range 0 to 9{"." / ","}9"` Y:14451-14520 | `validateCostOfGuarantee` rules.ts:1448 | MATCH |
| 114 | Date of Issue | `Format: "dd.mm.yyyy"`, `IsEditable`, Monday; flag; reset to `'5-Construction'` ("Reset to current Cluster 5 date."); error `< '4-Legally binding permits'` / `> 'End Date'` with the two texts Y:14588-14703 | `validateDateOfIssue` rules.ts:1465; Screen.tsx:1598 | MATCH |
| 115 | Start Date of Saving | reset to COD ("Reset to current project COD date."); error `< COD`, `> End Date`, `< Date of Issue` with the three texts Y:14725-14838 | `validateStartDateOfSaving` rules.ts:1472 | MATCH |
| 116 | Duration of Saving | `cmb_…` pair (`Value <= 35`, placeholders "Year" / "Month"), defaults `Right` / `Left` of the MMYY; flag; error `YY = 0 And MM = 0`, "0 Year and 0 Months are not allowed to be selected" Y:14859-14967 | `unpackMMYY`; Screen.tsx:1628 | FIXED (placeholders, fix 17) |
| 117 | End Date of Saving | `DisplayMode.Disabled`; `Text(DateAdd(DateAdd(DateAdd(start, MM, Months), YY, Years), -1, Days), "dd.mm.yyyy")` when all three set; error `> 'End Date'`, "End Date of Saving must not be later than Project End Date" Y:15019-15082 | `endDateOfSaving` rules.ts:1419; Screen.tsx:1647 | FIXED (18, the Disabled look) |
| 118 | Date of Expiry | reset to `'End Date'` ("Reset to current project end date."); error `Visible` `<= Issue` but `Text` `< Issue` Y:15130-15248 | `validateDateOfExpiry` rules.ts:1489 | DIVERGENCE (documented, D34 SOURCE DEFECT 9, twin `dateOfExpiryMessageCanvasParity`) |
| 119 | Save `DisplayMode` / `OnChange` | dirty, radio, value, three dates, guarantee, MM, YY not blank and the seven error labels; Patch: type, values, the three dates, `Text(MM, "00") & Text(YY, "00")`, `JSON(Table(locMyRecord), Compact)`; spinner "Saving Financing Input for Decommissioning Costs..." Y:15280-15376 | `canSaveDecommissioning` rules.ts:3233, `planDecommissioningSave` :3254 | MATCH |

### DSRA/DSRF card and panel

| # | Canvas control | Live formula (quoted, YAML line) | Code (file:line) | Status |
|---|---|---|---|---|
| 120 | `con_DSRA_DSRF_Data_Deactivate` / `_Edit` | Text / Icon by status; toggle `DisplayMode` blank; Edit `DisplayMode: If(<toggle>.Text = "Activate", Disabled, Edit)`; Edit `OnSelect`: the flags from the JSON, the stored end date, `locStandardDSRA_DSRF_For_Edit: Blank()` Y:5779-5888 | `dsraCardToggle` rules.ts:2061, `openDsraForm` :3841; Screen.tsx:854, 863 | MATCH |
| 121 | `cmp_PopUp_Confirmation_3` | Title `"Deactivate DSRA/DSRF..."` / `"Activate DSRA/DSRF..."`; Description `"Are you sure you want to " & "deactivate DSRA/DSRF ?"`; Confirm "Confirm"; Patch Status + `'DSRA/DSRF Original Status Active?': If(Active, No, Yes)`; spinner `$"Please wait, {deactivating/activating} DSRA/DSRF..."` Y:17018-17071 | `dsraToggleDialog` rules.ts:2768, `toggleDsraStatus` :1915, `dsraToggleSpinner` :2961 | MATCH |
| 122 | panel fields | Type radio (`OnChange`: all flags true, the SQL standard, end date = COD + longest active tenor − 1 day) *(Fabric)*; Commitment Fee, free period (`Value <= 3`, MM `If(flag, 0, Coalesce(stored, 0))`, error commented out), Base Rate (`Coalesce(std.BaseRateDSRF, stored)`), Margin (`InRangeAbs(If(DSRA, -5, 0), 10)`), Upfront (0…10), POFDS (one decimal, 0…100), Duration (`Value <= 10`, MM `Coalesce(Value(0), …)`), End of Debt Service Savings (CalendarAdd recompute, error `< COD`); title "Edit DSRF/DSRA" Y:15495-16788 | `applyDsraTypeChange` rules.ts:3872, `validateDsraMargin` :1380, `validateDsraUpfrontFee` :1390, `validatePofds` :1396, `defaultEndOfDebtServiceSavings` :1287, `validateEndOfDebtServiceSavings` :1299; Screen.tsx:1690-1765 | MATCH (Type change without Fabric and the duration months: DIVERGENCE, D34 X2 / SOURCE DEFECT 6) |
| 123 | Save `DisplayMode` / `OnChange` | type, POFDS not blank; DSRF → upfront and commitment fee not blank, their errors; end date not blank, its error, the duration error, margin not blank and no error, base rate, the POFDS error; Patch: Name `"-DSRF/DSRA"`, category, type, base rate, margin, the DSRF-only fields Blank for DSRA, POFDS, end date, MMYY, Project, flags JSON, owner; spinner "Please wait, saving..." Y:16821-16955 | `canSaveDsra` rules.ts:3298, `planDsraSave` :3319 | MATCH |

### Documented divergences not tied to one row above

| # | Canvas | Code | Status |
|---|---|---|---|
| 124 | `DataSourceInfo` / `RecordInfo` in every `ItemEnabled` (Y:2518-2612, 2797-2829) | pass; Dataverse decides (D1) | DIVERGENCE (documented, D1) |
| 125 | Save needs `cmb_SeniorDebt_Data_Bank.Selected.bankname` (Fabric names) Y:13551 | the stored bank id is checked | DIVERGENCE (documented, D34) |
| 126 | `locFormIsDirty` is never set back to false on the screen (only `true` is ever written) | Edit opens clean; Add opens dirty | DIVERGENCE (documented, D34 addendum 21 Oct 2026: SOURCE DEFECT, not reproduced) |
| 127 | `cmb_SeniorDebt_Data_Bank`, `txt_SeniorDebtData_BankName` and `txt_SeniorDebtData_BankMargin_OperationalPhase` have no `OnChange` (no dirty) Y:9377, 9429, 12666 | every field change marks the form dirty | DIVERGENCE (documented, D34 addendum: SOURCE DEFECT, not reproduced) |
| 128 | after a Gearing change the hidden fixed value keeps `Text(locFixedAmount, "#")` and is saved Y:10908, 13809 | Blank is saved | DIVERGENCE (documented, D34 addendum) |
| 129 | Add does not reset `locFinancialCloseToShow` / `locIsFinancialCloseDateStandard` (stale from the last Edit) Y:2646-2661 | Add shows the standard FC, flagged standard | DIVERGENCE (documented, D34 addendum) |
| 130 | `lbl_DSRA_DRSFData_Base_Rate_Required.Visible: Not(rad_SeniorDebt_Data_TrancheStatus.Selected.Value = SA)` (the tranche panel's radio, a copy-paste) Y:16058 | the asterisk always shows | DIVERGENCE (documented, D34) |
| 131 | Add Tranche without Fabric: `Value(<missing SQL row>)` is Blank | the standard builders read 0 (`z()`), so a new tranche opens with 0-year tenor etc. *(Fabric)* | DIVERGENCE (documented, D34 X2; open question 3) |
| 132 | `MarginDSRA` reads "margin dsrf" Y:233 *(Fabric)* | `marginDsraCanvasParity` | DIVERGENCE (documented, D34 SOURCE DEFECT 1) |
| 133 | the fold state (`colFinanceCategoriesInProject`, `IsFolded`) | local to the visit; the Save still writes `IsFolded = true` | DIVERGENCE (documented, D34) |
| 134 | numbers follow `Language()` | en-US notation, as the other PM screens | DIVERGENCE (documented, D34) |

**How rows are counted.** Rows 1–123 are one canvas control or formula each; rows 124–134 are the
cross-cutting divergences. A row with any corrected term counts as FIXED (so rows 27, 47, 56, 74, 89,
90, 96, 99, 111 and 116 are FIXED for their MaxLength, placeholder, month-default or Save-look term).
The 27 FIXED rows carry the 20 fixes listed above. Rows 12, 62, 98, 106, 109 and 122 keep their main
status and point to a divergence counted once, in its own row or in D34.

## Layout changes from the PO screenshots (same change)

Only layout; no caption, `aria-label` or `data-testid` changed.
1. The page fills the content area and does not scroll; Financing Options stays at the top and the
   category list scrolls on its own (`Height: Parent.Height - 130`, Y:2432), with a subtle shadow on
   its right edge.
2. Card headers 46 px (canvas 42), title Regular 15 px at X 10, status pill 28 × ≥90 (canvas 24 × 80),
   radius 34, the canvas Green / SuccessLight and Grayscale10 / Grayscale40; themePrimary chevron; the
   1 px RGBA(0, 120, 212) rule.
3. Equity and VAT tiles are 320 wide with a ~290 filled grey box (the View-mode `TextInput@0.0.54`);
   values blue italic when standard. D34's "no box" look is undone.
4. Decommissioning, the tranches and DSRA/DSRF use 320-px columns, at most four (4 at 1919 px, 3 at
   1366 px).
5. DSRA/DSRF values are plain text (`Appearance: FilledLighter`) in Semibold, captions Regular
   Grayscale10.
6. The command bars keep D35 §7 (first icon over the first caption, 20 px).

## Open questions (product owner)

1. **Command bar edge.** The PO asked for "✎ Edit Equity" aligned with the card title (X 10). D35 §7
   aligned it with the first caption (X 20). It stays at X 20; confirm.
2. **Header and pill sizes.** The screenshot (46 px header, 28 px pill) is followed over the canvas
   (42 / 24). The DSRA captions use the canvas Grayscale10 (#6C6C6C), not the ~#595959 read off the
   screenshot. Confirm.
3. **Add Tranche without Fabric.** The canvas would open a new tranche with blank tenor, DSCR, fees and
   margins; this app opens it with 0 values from the empty standard (row 131). Blank them instead?
4. **Stale tranche dirty flag / no-dirty fields** (rows 126, 127). The canvas enables Save on every
   Edit after the first change of a visit, and ignores bank / other-bank / operational-margin edits on
   a fresh visit. This app does neither. Confirm.
5. **Gearing → Debt Sizing** (row 128): the canvas keeps writing the old fixed value, rounded; this app
   writes Blank. Confirm.
