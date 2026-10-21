# Gap analysis — Admin Cost Screen

- **Canvas:** `ProjectDocs/_extracted/msapp/projectmanagement/Src/Admin Cost Screen.pa.yaml` (10,977 lines). `Lnnnn` below means a line in this file. Also read: `Components/cmp_NestedCountryPickerColumn.pa.yaml`, and `App.pa.yaml` (`colYearsForDuration`, `colMonthsForDuration`, `colFrequencyInMonths` at L442–483).
- **Code:** `ProjectCosts-CodeApp/src/features/admin/admin-cost/`: `Screen.tsx`, `rules.ts`, `devexRules.ts`, `opexRules.ts` and `hooks.ts`.
- **Reference only:** plan `006-admin-cost.md`; skeleton `ProjectDocs/skeleton-reference/features/admin/admin-cost/`. The skeleton also has no hooks for SPV mapping, Currencies or Country Inflation Profiles.
- **Method:** canvas-yaml-to-codeapp §1–2. Every block scalar was read to its end, and commented-out formulas were skipped (rule 10).
- **Context:** the screen is UI-built and not connected (D14). Every hook returns `notConnected()`, so a missing write is expected. Rows below therefore judge the **requirement as captured in code** (rule, payload, UI binding, hook checklist), not live behaviour.

## 0. Flow verification (the plan's "blocked by missing flows")

| Where | What the canvas does | Live? |
|---|---|---|
| `btn_AdminCost_DevexCapex_Delete_StandardCost_Confirm.OnSelect` L413–480 | `Patch('Fabric Sync Jobs', …)` with `'Job Type': LookUp('Fabric Job Types', Name="Apply Standard Assumption for Cost")` and `'Job Status': Dirty`, then `SynchronizeStandardAssumptionCosts.Run('Cost Type', Country, Int(Technology), 'Fabric Sync Job')` (L458), then `Notify("Synchronization of … initiated.")` | **No.** The whole block sits inside `/* … */` |
| `cmp_PopUp_Confirmation_Apply_And_ApplyAll.OnConfirm` L4615–4681 | The same three steps; `.Run` is at L4659 | **No.** The whole block sits inside `/* … */` |
| Rest of the screen | A grep for `.Run(`, `Launch(` and `Back(` finds nothing else | — |
| `btn_Admin_Cost_Landlease_ApplyToLandlease_1.DisplayMode` L825 and `btn_Admin_Cost_Landlease_ApplyToLandlease.DisplayMode` L1165 | `=DisplayMode.Disabled` | Both Apply buttons are dead as shipped |

**Conclusion:**
- The only flow, `SynchronizeStandardAssumptionCosts`, is not in the solution export and is never called live.
- It blocks only the Apply / Apply to All feature, and that feature is already unreachable in the canvas.
- Every other CRUD path on the screen is plain Dataverse Patch/Remove and needs no flow.
- Two side effects still run, even with the flow commented out:
  - **Apply popup confirm:** the `Apply and Apply All Trackings` upsert runs. It is unreachable in practice, because both buttons are disabled.
  - **DEVEX delete confirm:** the same upsert runs. This one is **reachable**: every DEVEX delete writes an "Apply All" row (see W2).
- The code reproduces all of this correctly:
  - `rules.ts:45-57` and `rules.ts:388-445` document it.
  - `applyCommandState` (`rules.ts:380`) returns `enabled: false`.
  - `planApplyTracking` (`rules.ts:304`) writes nothing by default.
  - No flow client exists.
- The plan's table list is wrong in both directions:
  - It names Fabric Sync Jobs, Fabric Job Types, Generators and Opex Project Costs. All of them are referenced only inside comments or dead collections.
  - It omits the live tables `OPEX & Land Lease Standard Assumptions` and `Currencies`.

## 1. Requirements vs implementation

Status key: COVERED / PARTIAL / MISSING / WRONG. WRONG means the code differs from the canvas; both sides are quoted.

### 1a. Data (tables, filters, sort, lookups, writes)

| # | Canvas requirement (citation) | Code (file:line) | Status | Note |
|---|---|---|---|---|
| D1 | `OnVisible` L15–219: a `Concurrent` of ClearCollects (tracking, LL subaccounts by `Order`, Other-OPEX / O&M split, countries + `Order` switch, 4 categories, `'OPEX & Land Lease Standard Assumptions'` sorted by `Description`, CAPEX categories, accounts and subaccounts, `'SPVDevCo Mapping Capex Devexes'`), then `Select(btn_Filter_Devex_Capex_Assumptions)` | `hooks.ts:11-52` checklist; `hooks.ts:78-110` stubs; `TABLES` `hooks.ts:68-76` | PARTIAL | Not connected by design. The checklist and `TABLES` **omit** three tables: `SPVDevCo Mapping Capex Devexes`, `Currencies` and `Country Inflation Profiles` |
| D2 | Picker: `cmp_Admin_Costs_Assumption_NestedCountryPickerColumn.Countries` L639 excludes Spain, Greece and Romania; `Nestings` L650 gives Wind and PV to 6 countries; order Germany 1 … Croatia 6 (`OnVisible`) | `Screen.tsx:138-141`, `admin-gates-approvals/rules.ts:70-106` | COVERED | |
| D3 | Blank scope defaults to `Coalesce(SelectedCountry.Country, First(col_cmpCountryPickerItems).Country)` and `Coalesce(SelectedNestedValue,"Wind")` (`btn_Filter_Devex_Capex_Assumptions.OnSelect` L223). The picker gallery also preselects its first row | `emptyScope` `Screen.tsx:131`; `isScopeChosen` `devexRules.ts:154`; `defaultScopeCanvasParity` `devexRules.ts:158` | WRONG | Canvas: always shows a scope (first country, Wind). Code: nothing until the user picks. This is an intentional SOURCE DEFECT fix, but it is **not logged in 02-OPEN-DECISIONS** (rule 8) |
| D4 | Categories: `Filter('CAPEX Account Lists', 'Parent Account'.Number="00001", Not(Name="Overleveraging"))` sorted by `vsb_order` (`OnVisible`, colCapexAccountCategories) | `hooks.ts:14-18` | COVERED | Checklist only |
| D5 | `colCapexSubaccounts`: `AggregatedName = Parent.Name & " / " & Name & " " & Number`, plus `CategoryOrder` and `AccountOrder`; sorted by CategoryOrder, AccountOrder, vsb_order | `aggregatedSubaccountName` `rules.ts:204`; `hooks.ts:19-20` | PARTIAL | No sort helper; `AggregatedName` is not used as the Sub-Account combo label (the combo has no options) |
| D6 | DEVEX list (`btn_Filter…OnSelect` L223, gallery `Items` L3921): only categories with ≥1 cost in scope; a parent row, then children sorted by `Category.Order`, `Subaccount.'Parent Account'.Order`, `Subaccount.Order`; `Filter(Not(IsFolded) Or IsParent)` | `groupByCategory` `devexRules.ts:119-136` | WRONG | Canvas sorts children by category / account / subaccount order. Code sorts by `description.localeCompare` (`devexRules.ts:128`) |
| D7 | OPEX grid `gal_LandLease_Content_Subaccounts_CardBody_Costs_1.Items` L1893: country, `Text(Technology)=SelectedNestedValue` and `'Type Of Contract'=ThisItem.TypeOfCategory`, sorted by `Description` ascending | `filterByScope` `opexRules.ts:211-222`; `hooks.ts:27-39` | COVERED | |
| D8 | Period rows: Period 1 always shows; other rows show when `Not('IsCollapsed?') && Period<>'Period 1'` (`con_OpexCosts_…_CostsTableRow_2.Visible` L2787). The `Button2_1` +/− toggle runs `UpdateIf(… IsCollapsed?)` per subaccount (L2739), and Save resets `IsCollapsed?` to false for that subaccount (Save handler) | `Screen.tsx:362-399` renders every row | MISSING | No collapse toggle and no Period-1/child distinction. `opexRules.ts:19-20` says it moved to a Set, but no Set exists |
| D9 | Apply-history tags: the **Apply All** tag `lbl_Admin_Cost_Landlease_ApplyToLandlease_ApplyTag_Info_1.Text` L933 looks up country + technology + `'Action?'='Apply All'` (no contract type). The per-category tag `…ApplyTag_Info.Text` L1299 adds `'Contract Type'` and `Action=Apply`. Text: `"{dd.mm.yyyy} Apply was made by {'Modified By'.'Full Name'}"` | `findLastApply` `rules.ts:247-258`, `lastAppliedLabel` `rules.ts:265-275`, `Screen.tsx:241-243,264-268` | PARTIAL | Per-category tag: COVERED. The top-level Apply All tag (`con_…Apply_History_Tag_1`) is **missing**, and `findLastApply` always requires a contract type |
| D10 | Area dropdown `drp_LandLease_RightPanel_NewEditCost_BodyContent_AreaInflationProfile_1.Items` L7310: `Distinct(Filter('Country Inflation Profiles', Country=selected).Area)` | `Screen.tsx:525-528` (no options); no hook | MISSING | |
| D11 | Currency `drp_LandLease_RightPanel_NewEditCost_BodyContent_Currency_1`: `Items: Currencies`; Default `LookUp(Currencies,'Currency Code'= If(Poland,"PLN","EUR"))`; `DisplayMode.Disabled` (L5583–5602) | `Screen.tsx:467-470` | WRONG | Canvas: disabled, preset PLN or EUR. Code: empty dropdown, enabled once connected. `ES.currencies = "vsb_currencies"` (`dataverseNames.ts:51`, UNVERIFIED) is wrong. Canvas `Currencies` with `currencyname`/`isocurrencycode` is the system `transactioncurrencies`, which is already registered |
| D12 | Cost Paid By default `rad_AdminCost_RightPanel_Form_AddCost_Fields_Cost_Paid_By.DefaultSelectedItems` L10485: the existing value, else the SPV/DevCo mapping (tested by `'Account Number' = Subaccount.Number`, value fetched by `'Name (Sub-Account)' = Subaccount` — two different keys, a SOURCE DEFECT) | none | MISSING | No mapping hook or rule |
| D13 | Cost Paid By items `Filter(Choices('Cost paid type'), Not(Value=None))` L10511. Real option set: None 952850000, **DevCo 952850001, SPV 952850002** (`src/generated/models/Vsb_devexcapexstandardassumptionsesModel.ts:14-18`) | `costPaidByChoices` `devexRules.ts:251-255` and `costPaidLabel` `devexRules.ts:281-288` use `CHOICE_ADMIN.costPaidType` `{spv:952850001, devCo:952850002, shared:952850003}` | WRONG | Canvas offers "DevCo, SPV". Code offers "SPV, DevCo, Shared": SPV and DevCo are swapped and Shared does not exist, so saving "DevCo" stores SPV. Already flagged in `dataverseNames.ts:496-511`, but not in D15 |
| D14 | Unit items `cmb_AdminCost_RightPanel_Form_AddCost_Fields_Unit.Items` L10567: Wind gets 3 units, non-Wind 2; Poland gets PLN units. Default `Coalesce(existing, Poland→PLN, else EUR)` L10554 | `unitChoices` `devexRules.ts:195`, `defaultUnit` `devexRules.ts:208`, `Screen.tsx:840-848` | COVERED | `unitLabel` returns "EUR/MW", but the generated enum key `EUR_MW_p_` suggests the real label is "EUR/MW p.a." — verify |
| D15 | Category combo `Items` L10215: categories that have ≥1 subaccount with <50 costs. Sub-Account combo `Items` L10352: filtered by the selected category and <50 costs; label `AggregatedName` | `isSubaccountSelectable` `devexRules.ts:262`; `Screen.tsx:821-829` (no options) | PARTIAL | The rule exists; the UI has no options and no category rule |
| W1 | DEVEX save `pcf_btn_AdminCost_RightPanel_Form_AddStandardCost_Button_Save.OnChange` L10878 writes: `Name` "Standard Cost : {country}-{tech}-{sub.Name}"; Cluster 1–5; `Description` "Standard {sub.Name} - {text}"; `Description Input`; Country; Technology; Unit; **`'Apply VAT'`** (checkbox, always true); **`Depreciation`** (always true); Distribution Frequency (always 3); `Cost Amount`; Comment; Cost Paid By; **Subaccount**; **Category**. No OBU and no `IfError`. Then sets `locSelectedDevexCapexCategory`, `Select(btn_Filter…)` and resets | `buildStandardCostPayload` `devexRules.ts:437-484`; `planSaveStandardCost` `devexRules.ts:487-525` | WRONG | (1) `vsb_applyvat` and `vsb_depreciation` are never written (the columns exist, model :51,:63). (2) Country, Category, Subaccount and Technology are written **only on create** (`devexRules.ts:465-478`). The canvas re-writes them on edit, and both combos are editable (`DisplayMode.Edit` L10208, L10345), so an edited subaccount or category is silently lost. (3) The OBU key is `owningbusinessunit@odata.bind` (`DEVEX_LOOKUP` :56). The generated model uses `"OwningBusinessUnit@odata.bind"` (model :46), as rule 4 requires; the canvas writes no OBU at all, and that divergence is not logged. (4) The code trims text and nulls a blank comment (minor) |
| W2 | DEVEX delete `btn_AdminCost_DevexCapex_Delete_StandardCost_Confirm.OnSelect` L314, invoked from `cmp_PopUp_Confirmation_Delete_Contract_Or_Period.OnConfirm` L4738: `RemoveIf` by id; `IfError` → `Notify($"Error : {FirstError.Message}, standard cost could not be deleted")`. Then it clears `locSelectedCategory` and **upserts an `Apply and Apply All Trackings` row as "Apply All"** (L346-385), then re-collects | `planDeleteStandardCost` `devexRules.ts:528-552` | PARTIAL | Delete: COVERED. Omitting the tracking row is a documented fix (UT-ADCOST-041) but **not in 02-OPEN-DECISIONS**. The Notify text is not captured in rules |
| W3 | OPEX save `pcf_LandLease_RightPanel_NewEditPeriod_BodyButtons_Save_1.OnChange` L9376. Patch fields: Name "{desc} - {country} - {tech}"; **`'Start Date String'`** (from the start-date textbox); Description; AllWTGAllocated; LL Subaccount; Opex Subaccount (by category); Type Of Contract; **Currency**; Due Date / Amount OTP 1–3; Secured; Period (10-arm Switch); `'Inflation Country Area'` = **Area text**; `'Inflation Profile'` only if not country; `'Inflation Start Year (String)'` = "Cluster 6 : Operation"; Use Inflation; Use Country Inflation; Fix Costs; % of Revenues; Aggregation; durations; EUR/MWh, /MW, /WTG; Distribution Frequency; Country; Technology; `'IsLastPeriod?'` = `Coalesce(existing, Yes)`; Threshold Individual / ?/ Type; Align; `'Inflation Area'` = Area text; **`'External Contract?'`**; OBU **commented out**. Then: reference row → `IsLastPeriod? No`; a Period-1 edit cascades 17 fields to later periods (ForAll); refresh; `IsCollapsed? false`; on error `Notify("Error: Land Lease Standard Contract could not be saved correctly. Internal error: originated on … Message: …", Error)` | `buildOpexPayload` `opexRules.ts:518-595`; `planSaveOpexPeriod` `opexRules.ts:606-687`; `CASCADE_COLUMNS` `opexRules.ts:329-347` | WRONG | Cascade and tail flag: COVERED. **Missing columns:** `vsb_startdatestring`, `vsb_Currency@odata.bind` and `vsb_externalcontract` (no `OPEX_COL` entry). **Wrong values:** `vsb_inflationcountryarea` gets `form.useCountryInflationProfile`, a boolean (`opexRules.ts:557`), but the canvas writes the Area text and the column is a string (model :91); `vsb_inflationarea` gets an "id" (`inflationAreaProfileId`), but the canvas writes the Area text. **OBU** has the same casing problem as W1, and the canvas does not write it. The save-error Notify text is missing. The period-10 block is a documented fix, not logged in D15 |
| W4 | OPEX delete `cmp_PopUp_Confirmation_Delete_Contract_Or_Period.OnConfirm` L4738. Period 1: `RemoveIf` every row of subaccount + country + tech + type. Otherwise: remove the row and set `locSecondLastPeriod` (by **Description** sort) to `IsLastPeriod? Yes`. On error `Notify("Error: Standard Contract could not be deleted correctly. Internal error: originated on "&Source&". Message: "&Message&HttpResponse, Error)` | `planDeleteOpexPeriodOrContract` `opexRules.ts:709-746`; `newTailCanvasParity` `opexRules.ts:749` | PARTIAL | Logic: COVERED. The tail is chosen by period, a documented fix not logged in D15. Notify text missing |
| W5 | Apply tracking upsert `cmp_PopUp_Confirmation_Apply_And_ApplyAll.OnConfirm` L4560: Name "{Country} - {Tech} - {Action}", Country, Technology, `Action?`, `Applied By Email`=`User().Email`, `Applied By Full Name`, `Contract Type`; then ClearCollect | `planApplyTracking` `rules.ts:304-356` (no write by default) | COVERED | Unreachable as shipped (S1). `vsb_applyandapplyalltrackings` is **not** in `power.config.json` |

### 1b. Behaviour (load, events, navigation)

| # | Canvas requirement (citation) | Code (file:line) | Status | Note |
|---|---|---|---|---|
| B1 | Picker `OnSelect` L734: `Select(btn_Filter…)` and clear `locSelectedDevexCapexCategory`. In the component, a country row expands to show its Wind/PV children (flag image, `cbx_CountrySelected`) | `Screen.tsx:149-179` (`setScope` :169) | PARTIAL | Technology click: COVERED. The country button has no `onClick` (:156-159), there is no expand/collapse, and no flag |
| B2 | Category accordion: `colAdminCostCategories` seeds **`IsFolded: true`** for all 4 rows (`OnVisible`; `Container5.Height` L974); the chevrons `ico_Generators_DisplayProject_Body_Form_GeneratorType_Up_2` / `_Down_2` (L4495/L4525) toggle | `CategoryCard` `useState(true)` `Screen.tsx:240`, toggle :247-258 | WRONG | Canvas: all cards **collapsed** on load. Code: all cards **open** |
| B3 | Add Contract Type `cmp_Admin_Cost_LandLease_AddStandardContractType_CommandBar.Items` L1009: root item plus one child per family subaccount (Other-OPEX labels "TCMA" / "E&CM"); a child is enabled only when no contract exists in scope. `OnSelect` L1109 sets the subaccount, `locSelectedCategory`, opens the panel and resets it | `Screen.tsx:333-343` | MISSING | Single command; opens "Add Contract Type : " with no subaccount. `subaccountMenuLabel` `opexRules.ts:167` and `canAddContractType` `opexRules.ts:183` are unused. The CommandBar has no sub-menus (D15c) |
| B4 | OPEX row Edit `btn_ICON_OpexCosts_…_Edit` L2697 / `_Edit_1` L3493: loads the row and the subaccount lookups; title "Edit Contract : {sub}" / "Edit Period : {sub}" (L4912) | `Screen.tsx:363,378-386` | PARTIAL | `subaccountName` is hard-coded `""` (:363), and the form is never pre-filled from the row |
| B5 | Add Period `btn_OpexCosts_Content_Subaccounts_CardBody_AddPeriod.OnSelect` L3571: reference row; show 2nd/3rd payment from the reference; `locParentPeriod`; `Visible = Not(IsCollapsed?)` (L3562) | `Screen.tsx:387-395` | PARTIAL | `canAddPeriod` wired; `paymentSectionsFor` (`opexRules.ts:293`) unused; reference row not passed to the panel |
| B6 | OPEX Delete icon: always on the Period-1 row; on child rows only `Or(Period 1, 'IsLastPeriod?')` (`ico_…_Delete_1.Visible` L3479) | `Screen.tsx:368-377` | WRONG | Canvas: only the last child period can be deleted. Code: every row has Delete |
| B7 | Add Cost `btn_Admin_Cost_DevexCapex_AddCost.OnSelect` L1235: opens the panel, clears selection, amount and cost-paid-by, `Select(…Reset)` | `Screen.tsx:659-661,675` | PARTIAL | Opens the panel; the form never resets because its state persists across opens (:774) |
| B8 | DEVEX row Edit `btn_DevexCapex_…_Action_Edit.OnSelect` L4305: loads the record, category, subaccount, amount and cost-paid-by into the panel | `Screen.tsx:728-731`; `CostPanel` `Screen.tsx:774` | MISSING | The panel never receives the record |
| B9 | Comment icon `img_DevexCapex_…_Comment`: `OnSelect` L4249 opens the edit panel; `Tooltip` "Comment:{text}" or "Add Comment"; `Visible=Not(IsParent)` | `Screen.tsx:726` (plain text cell) | PARTIAL | |
| B10 | DEVEX parent +/− `Button2_2.OnSelect` L4392. After save or delete, the touched category re-opens (`locSelectedDevexCapexCategory`, L10625/L4738) | `Screen.tsx:663-667,703-706` | PARTIAL | Toggle: COVERED. Re-open after a write: missing |
| B11 | Delete dialog `Title` L4860 / `Description` L4723; Apply dialog `Title` L4695 / `Description` L4545 | `rules.ts:697-733`; `Screen.tsx:214-223,414-423,752-761` | COVERED | Confirm only closes (not connected) |
| B12 | Loading popup `cmp_PopUp_Loading_Admin_Cost` (L4709) texts: "Please wait, deleting...", "Applying standard contracts, syncing job in progress.....", `$"Please wait, saving ""{description}""..."`, "Please wait, saving..." | `Screen.tsx:146` (countries only) | MISSING | |
| B13 | Panel close and cancel reset the form: `ico_LandLease_…_BodyheaderCancel_1` L4949 and Cancel L9615 run `btn_LandLease_NewEditPeriod_ResetButton`; `ico_btn_AdminCost_…_Header_Cancel` L9790 and Cancel L10973 run `…Button_Reset` | `Screen.tsx:436,774` (state persists) | PARTIAL | |
| B14 | Header `cmp_Admin_ProjectGatest_Approvals_Header_1` (Name "Costs"; logo → Project Main) and left admin nav | app shell | COVERED | |

### 1c. State gates, validation and Notify

| # | Canvas requirement (citation) | Code (file:line) | Status | Note |
|---|---|---|---|---|
| S1 | Both Apply buttons `DisplayMode.Disabled` (L825, L1165) | `Screen.tsx:186-195,280-289`; `rules.ts:380` | COVERED | |
| S2 | Add Cost `DisplayMode` = `If(DataSourceInfo('Devex/Capex Standard Assumptions', CreatePermission), Edit, View)` L1231 | `Screen.tsx:660` (`enabled: live`) | PARTIAL | The SDK has no DataSourceInfo (D1) |
| S3 | DEVEX row Edit/Delete `DisplayMode` = `RecordInfo(Edit/DeletePermission)`, fail-open when the lookup misses (L4281, L4330) | `Screen.tsx:729,733`; `rowActionEnabled` `devexRules.ts:562` unused | PARTIAL | |
| S4 | DEVEX Save `DisplayMode` L10860: `locEditSaveButtonEnabled`, Distribution Frequency, Subaccount, Category, Description, Cost, Cost Paid By, any cluster, Unit, and no cost/unit/subaccount error | `validateDevexForm` `devexRules.ts:387-407`; `Screen.tsx:784` (`disabled={off}`) | PARTIAL | The rule exists but is not wired. Its messages ("Select a subaccount." …) are invented, not canvas text (rule 7) |
| S5 | Cost error `lbl_…_Cost_ErrorMessage` L10649: "Value must be a number without decimal" / "Value must be between 0 and 100,000,000" | `devexRules.ts:227-245` | PARTIAL | Rule: COVERED. Not rendered |
| S6 | Unit error `lbl_AdminCost_RightPanel_Form_AddCost_Fields_Unit_ErrorMessage.Text` L10545: `If(Poland,"PLN","EUR") & "/WTG only applicable for Wind"`; `Visible` L10546 | `UNIT_ERROR` `devexRules.ts:222` = "A per-WTG unit can only be used for Wind." | WRONG | D15 i. The comment at :219 claims it is "the canvas message" |
| S7 | "Standard cost already exists for this subaccount" is `Visible: false` (L10321) | `devexRules.ts:20-21` | COVERED | Correctly omitted |
| S8 | Fixed DEVEX fields: Distribution Frequency `Disabled`, default `LookUp(colFrequencyInMonths, Value=3)` (L10083-10084); Apply VAT and Depreciation `Checked: true`, `Disabled` (L10148-10163) | `Screen.tsx:809-819` | WRONG | Canvas: disabled, preset "3 Months" and checked. Code: an empty dropdown and **unchecked, editable** checkboxes |
| S9 | MaxLength: Description 30 (L9863), Cost 10 (L10676), Comment 55 + `{len}/55` (L10752, L10801) | `Screen.tsx:789-791,850-858`; `COST_MAX_LENGTH` `devexRules.ts:66` | PARTIAL | Only Comment has its limit |
| S10 | Combo side effects: Unit change clears the cost (L10580). Category change clears the subaccount and resets cost-paid-by (L10240). Subaccount change back-fills the category (L10379) | `Screen.tsx:845`; `applySubaccountSelection` `devexRules.ts:358` (unused) | PARTIAL | Unit: COVERED; the other two are not wired |
| S11 | OPEX period gate: inflation toggles, Area, Inflation Profile, OTP due dates and amounts 1–3, and External Contract are Edit only for Period 1 or a new contract, Disabled otherwise (L7001, L7059, L7298, L7481, L7758, L7929, L8117, L8288, L8473, L8644, L9198) | `Screen.tsx:441` (`off = !connected`) | MISSING | |
| S12 | Hard-wired OPEX toggles: Secured `Checked:false`, `Disabled` (L6642-6654); Allocate to all WTGs `Checked:true`, `Disabled` (L6687-6690); One-Time Payment `Checked:false`, `Disabled` (L7665-7669), so the OTP 1 fields are never visible; Threshold `Checked:false`, `Disabled` (L9054-9061); Align with Project Duration `Checked:false`, `Disabled` (L9103-9133). Allocation combo hidden (`Visible: false` L6731) | `Screen.tsx:499-506,539-542,583-586,606-609`; `emptyOpexForm` `opexRules.ts:402-412` (`allWtgAllocated:false`) | WRONG | Canvas: these five are fixed values. Code: user-editable switches, and AllWTG defaults false where the canvas has true |
| S13 | Derived read-only OPEX fields. Description `DisplayMode.Disabled`, value L5098: Add Period → `"{parent.Description} - {n+1}"`; edit → stored; new → `"Standard{''/' Opex'/' LL'} {subaccount}"`; MaxLength 130. Start Date `Disabled`, value L5321: `"COD + {y} Years {m} Months"` (cumulative) or stored / "Cluster 6: Operation". Inflation Start Year `DisplayMode.View`, value "Cluster 6 : Operation + 1 Year" (L7177-7195) | `Screen.tsx:455-458,520-523`; `validateOpexPeriod` `opexRules.ts:440,470-473` | WRONG | Canvas: computed and locked. Code: Description and Inflation Start Year are free-typed **required** inputs; Start Date shows "" |
| S14 | OPEX defaults: Aggregation 952850000 (L6405). Inflation and Country Inflation default Yes for O&M/Other and No for LL (L6973, L7024). External Contract default true, except false when Other-OPEX subaccount order 1 contains "tcma" (L9157). Duration months default 0 once years are picked (L5430) | `emptyOpexForm` `opexRules.ts:402-412` | WRONG | Every default is false or null |
| S15 | Option lists: Years `Filter(colYearsForDuration, Value<36)` (L5472), so 0–35 "n year(s)"; Months 0–11 (L5442); Distribution Frequency `colFrequencyInMonths` 1/2/3/6/12 Months (L6518); Aggregation `Choices('Opex Aggregation')` | `Screen.tsx:461-465,482-494` | PARTIAL | Only Aggregation has options |
| S16 | Field errors (text verbatim). Fix Costs L5760: "Value must be a numeric with two decimal places." / `"Value must be between 0 and {Text(1000000000,"#,###.0#")}."`. % of Revenues L5891: "Value must be a numeric with two decimal place." / "Please select a value between 0 and 10,000.0.". EUR/MWh, /MW, /WTG L6024/L6160/L6293: "…two decimal places." / "Please select a value between 0 and 100,000,000.0.". Inflation Profile L7436: "Value must be a numeric with 1 decimal place." / "Please select a value between 0 and 100.". OTP amounts L7887/L8246/L8602: "Value must be a number" / "Please select a value between 0 and 1,000,000,000.0.". Due dates L7743/L8102/L8458: "Due Date must be in format MM/YYYY." (`^(0[1-9]\|1[0-2])\/\d{4}$`). Duration L5415: "0 year 0 months can't be selected". Threshold Individual L8818: "Numeric value with maximum of one decimals" / "Please select a value between 0 and …". Threshold radio L9045: "Please select a threshold option." | `validateOpexPeriod` `opexRules.ts:433-490` | MISSING | None of these is ported or rendered. The code's own messages ("The duration cannot be zero.", "Inflation needs a start year." …) are not canvas text (rule 7) |
| S17 | OPEX Save `DisplayMode` L9236: dirty; description; **no error label visible, including the hint**; inflation-start / Area / profile; the OTP-vs-duration branch; threshold; 2nd and 3rd payments | `validateOpexPeriod`/`canSaveOpexPeriod` `opexRules.ts:433-495`; `Screen.tsx:450` (`disabled={off}`) | PARTIAL | Structure: COVERED. Field-error terms and the "at least one commercial figure" blocker are missing; not wired |
| S18 | Hint "Please fill in at least one commercial figure", `Visible` L9652 (all five figures blank) | `Screen.tsx:615-617` (always shown) | PARTIAL | |
| S19 | Threshold block `Visible = locSelectedCategory='Opex O&M'` (L8745); Individual field when `Thresholds.Individual` (L8788) | `Screen.tsx:581-602` | COVERED | Unusable anyway in the canvas (S12) |
| S20 | Live Notify texts L349, L4838, L9505 (see W2–W4) | none | MISSING | No message constants or error surface (rule 19) |
| S21 | Security: one `DataSourceInfo` on the whole screen (S2); OPEX has no check; entry is gated by nav `ItemVisible` only | `rules.ts:14-36`; `canEditScope` `rules.ts:158`; D15 a | PARTIAL | The OPEX tightening and route guard are documented. `canEditScope` is not used by `Screen.tsx` |

### 1d. UI (controls, captions, aria-label, data-testid, layout)

| # | Canvas requirement (citation) | Code (file:line) | Status | Note |
|---|---|---|---|---|
| U1 | `Label1.Text` L779: `$"Standard Assumptions / Costs / {Country} / {Tech}"` | `costBreadcrumbText` `rules.ts:485`; `Screen.tsx:182` | COVERED | Blank segments are dropped (documented) |
| U2 | "Apply to All" (L844) and info "Apply standard cost to relevant projects, this will override existing standard assumption cost." (L881, L1221) | `Screen.tsx:186-198,290-292`; `rules.ts:196` | COVERED | |
| U3 | `btn_Admin_Cost_Landlease_ApplyToLandlease.AccessibleLabel` L1160 "Apply standard costs to all relevant projects, this will override existing standard assumption cost"; Text "Apply" | `Screen.tsx:284-288` | COVERED | |
| U4 | Card header `Label1_2.Text = ThisItem.Category` (L4476); chevrons `ico_Generators_DisplayProject_Body_Form_GeneratorType_Up_2` / `_Down_2` | `Screen.tsx:247-258` (`data-testid="Label1_2"`) | PARTIAL | The chevron control names are not used as testids |
| U5 | OPEX headers in X order (L1360–1838): Description, Start Date, Duration, End Date, Currency, Inflation Profile [%], `Fix Costs p.a. [EUR/PLN]`, % of Revenues, `EUR/MWh p.a.`, `/MW p.a.`, `/WTG p.a.`, Aggregation, Secured \| Distribution Frequency, Allocation \| External Contract, OTP. **OTP `Visible` only for Land Lease** (L1804) | `opexColumnHeaders` `rules.ts:514-533`; `Screen.tsx:357` | PARTIAL | Order and texts: COVERED. OTP is shown for every family |
| U6 | OPEX cell formats (L1999–2643): OTP "Yes"/"No"; Allocation `Text(AllWTGAllocated)` or `Text('External Contract?')`; EUR/WTG and EUR/MW `"###,###,###,###"`; MWh `"###,###,###,###.0#"`; % `"###,###,###,##0.00 %"`; Fix Costs `"###,###,###,###"`; Inflation "No" / "Country Inflation" / `"###,###,###.0 %"`; Currency name; End Date cumulative "COD + {y} Years {m} Months"; Duration "{n} years" and "{n} months"; Start Date `Text('Start Date String',"dd.mm.yy")`; Description tooltip | `opexCellValues` `Screen.tsx:300-313` | MISSING | Raw `String(x)`. Start, End and Currency are always "". Duration shows years only; OTP and Inflation are raw |
| U7 | DEVEX headers L3649–3897: Category / Account, Account, Sub-Account, Description, Cost, Cluster, "" (Comment), Action | `DEVEX_COLUMN_HEADERS` `rules.ts:539-541` | COVERED | |
| U8 | DEVEX cells (L4011–4231). Parent row: `Category.vsb_name`. Child "Category / Account" and "Account": `Subaccount.'Parent Account'.Name`. Sub-Account `$"{Subaccount.Name} - {Number}"`. Description `vsb_descriptioninput`. Cost `$"{Text(amount,"###,###,###,###")} {unit}"`. Cluster `Concat(IDs, ",")`. Tooltips `Self.Text` | `Screen.tsx:711-737`; `subAccountColumnLabel` `devexRules.ts:315-317` | WRONG | Sub-Account canvas: "{Name} - {Number}"; code: "{Parent} / {Name} - {Number}". Cluster canvas: "1,2"; code: "1, 2". No tooltips |
| U9 | Period panel title (L4912), four variants | `periodPanelTitle` `rules.ts:546-553` | COVERED | The subaccount name is never passed (B4) |
| U10 | Period panel captions L5158–L9211 (Description … "Please fill in at least one commercial figure") | `periodPanelLabels` `rules.ts:560-626` | COVERED | Spot-checked all labels and placeholders |
| U11 | Cost panel title L9774 and captions L9874–L10765, including placeholders "Find Distribution Frequency", "Find Category", "Find supplier", "Find Cost Unit" and `Cost [{unit or "EUR"}]`; Cluster labels (Cluster 3 starts with a TAB) | `costPanelTitle` `rules.ts:556`; `COST_PANEL_LABELS` `rules.ts:629-673` | COVERED | TAB trimmed (documented) |
| U12 | Save/Cancel `pcf_LandLease_RightPanel_NewEditPeriod_BodyButtons_Save_1` / `_Cancel_1` and `pcf_btn_AdminCost_RightPanel_Form_AddStandardCost_Button_Save` / `_Cancel` | `Screen.tsx:450-452,784-786` | COVERED | |
| U13 | Close icons `ico_LandLease_RightPanel_NewEditPeriod_BodyheaderCancel_1` and `ico_btn_AdminCost_RightPanel_Form_AddStandardCost_Header_Cancel` (Tooltip "Cancel") | `FormPanel.tsx:18` (`aria-label="Close panel"`, `data-testid="panel-close"`) | WRONG | Canvas name and caption "Cancel" vs "Close panel" / `panel-close` |
| U14 | AccessibleLabels on the screen (only four): the Apply button (U3); `drp_…DurationYears_1` "Year" (L5469); `drp_…DurationMonths_1` "Month" (L5428); `drp_…DistributionFrequency_Month_1` "Month" (L6511) | `Screen.tsx:461-464,493` | COVERED | |
| U15 | testid = control name: `btn_Admin_Cost_DevexCapex_AddCost` (a Button) and `cmp_Admin_Cost_LandLease_AddStandardContractType_CommandBar` | `CommandBar` → `data-testid="command-AddCost"` / `"command-AddStandardContractType"` (`CommandBar.tsx:109`) | WRONG | Rule 16: the canvas control name exists but is not used. Literal row testids repeat per row and card (D16 c) |
| U16 | Layout: header, admin nav, picker column, right content (breadcrumb, Apply All row, Apply All tag, 4-card gallery); right panels; three pop-ups | `Screen.tsx:143-226` | PARTIAL | Structure: COVERED. Apply All tag missing (D9) |

**Counts (71 rows):** COVERED 19 · PARTIAL 26 · MISSING 10 · WRONG 16.

## 2. Proposed changes

### (a) UI: `Screen.tsx`
1. **S. Cards.** Collapse all cards on load (B2) and give the chevrons their canvas testids (U4).
2. **S. Apply All tag.** Render the top-level tag `con_Admin_Cost_LandLease_AddStandardContractType_CommandBar_Apply_History_Tag_1` (D9).
3. **S. Add Cost button.** Render Add Cost as a `Button` with `data-testid="btn_Admin_Cost_DevexCapex_AddCost"`, and give Add Contract Type its canvas testid (U15).
4. **S. Close icons.** Add `closeTestId` and `closeLabel` props to `FormPanel` (shared, `components/FormPanel.tsx`), and pass the two canvas close-icon names with "Cancel" (U13).
5. **S. Loading and errors.** Show `LoadingOverlay` with the four canvas spinner texts for save, delete and apply (B12). Add an error message bar for the three Notify texts (S20, rule 19).
6. **M. Add Contract Type sub-menu.** Use `subaccountMenuLabel` and `canAddContractType` for the items, and pass the chosen subaccount into the panel (B3). This needs CommandBar sub-menus, a shared component change (D15 c).
7. **M. Panel state.**
   - Reset each form on open.
   - Prefill from the selected row (DEVEX edit B8, OPEX edit B4) or from the reference row (Add Period B5, `paymentSectionsFor`).
   - Pass the subaccount name for titles.
   - Re-open the touched DEVEX category after a write (B10).
8. **M. OPEX grid.**
   - Port the cell formats and the Start / End / Currency / Duration texts (U6).
   - Add the per-subaccount +/− collapse (D8).
   - Show Delete only on Period 1 or the last period (B6).
   - Show the OTP column only for Land Lease (U5).
9. **M. DEVEX grid.**
   - Sub-Account label "{Name} - {Number}" and Cluster joined with "," (U8).
   - Comment icon with tooltip that opens the edit panel (B9).
   - Gate row actions through `rowActionEnabled` (S3).
10. **M. Cost panel.**
    - Distribution Frequency: disabled, preset "3 Months".
    - Apply VAT and Depreciation: checked and disabled (S8).
    - Category and Sub-Account options and handlers (D15, S10).
    - MaxLength 30 and 10 (S9).
    - Render the cost and unit errors (S5, S6).
    - Save disabled from `canSaveStandardCost` (S4).
    - Cost Paid By default from the SPV mapping (D12).
11. **L. Period panel.**
    - Read-only derived Description, Start Date and Inflation Start Year (S13).
    - Currency disabled with its PLN/EUR default (D11).
    - The five hard-wired toggles disabled at their canvas values (S12).
    - Period-1/new gate on the inflation, OTP and External Contract fields (S11).
    - Canvas defaults (S14) and option lists for years, months and frequency (S15).
    - Area options (D10).
    - Render every field error (S16) and the hint (S18).
    - Save disabled from `canSaveOpexPeriod` (S17).

### (b) Rules: `rules.ts`, `devexRules.ts`, `opexRules.ts` and `rules.test.ts`
1. **S. Unit error.** Make `UNIT_ERROR` a function: `` `${costCurrency(country)}/WTG only applicable for Wind` ``. Fix the misleading comment, and add tests for PLN and EUR (S6, D15 i).
2. **S. Cost Paid By.** Base `costPaidByChoices` and `costPaidLabel` on the real option set (DevCo 952850001, SPV 952850002, no Shared), using `CHOICE_COST.costPaidType` or a corrected `CHOICE_ADMIN`. Add a test pinning the values (D13).
3. **S. DEVEX payload.**
   - Write `vsb_applyvat: true` and `vsb_depreciation: true`.
   - Write Category, Subaccount, Country and Technology on update as well as create.
   - Decide on OBU: either use the `OwningBusinessUnit@odata.bind` key or omit it (the canvas writes none) and log the divergence.
   - Add tests for create and update (W1).
4. **S. DEVEX order and labels.**
   - `groupByCategory`: sort children by category order, then account order, then subaccount order. This needs the orders on `CapexSubaccountRef` (D6).
   - `subAccountColumnLabel`: canvas form "{Name} - {Number}"; a cluster concat helper joining with "," (U8).
5. **S. Small helpers.**
   - `findLastApplyAll` (country + technology + Apply All, no contract type), with a test (D9).
   - OPEX cell formatters with tests (U6).
   - A `MSG` object holding the three Notify texts and the four spinner texts (S20, B12).
   - `defaultCostPaidBy(mapping, subaccount)`, with a SOURCE DEFECT note on the two mismatched keys (D12).
6. **M. OPEX payload.**
   - Add `vsb_startdatestring`, `vsb_Currency@odata.bind` → `/transactioncurrencies(id)` and `vsb_externalcontract` (new `OPEX_COL` entries).
   - Write `vsb_inflationcountryarea` and `vsb_inflationarea` as the Area **text**.
   - Fix the OBU key, or drop it and log the divergence.
   - Tests (W3).
7. **M. OPEX derived values and defaults as pure functions.**
   - `derivedDescription(mode, parent, refPeriod, category, subaccount)`.
   - `startDateText` and `endDateText` ("COD + y Years m Months", cumulative across periods).
   - The Inflation Start Year display.
   - Category defaults: inflation toggles, External Contract with the TCMA exception, Aggregation Sum.
   - `isPeriodOneOrNew` gate, and the five fixed toggle values as constants.
   - Drop the "description required" and "start year required" checks, which make no sense for computed fields (S11–S14).
8. **M. OPEX field validators.**
   - Port the validators with **verbatim** canvas texts: two-decimal and range checks, one-decimal, MM/YYYY, "0 year 0 months can't be selected", the threshold texts.
   - Add the "at least one commercial figure" save blocker to `validateOpexPeriod`.
   - Replace the invented messages in `validateOpexPeriod` and `validateDevexForm` with canvas text, or mark them `DIVERGENCE:` (S16, S17, S4).
9. **S (docs). Log the unlogged divergences in `02-OPEN-DECISIONS.md` (rule 8):**
   - the defaulted-scope fix (D3);
   - no tracking row on DEVEX delete (W2);
   - the tail chosen by period (W4);
   - the period-10 block (W3);
   - the OBU writes the canvas does not make (W1, W3);
   - the OPEX privilege tightening (S21).

### (c) Data: `hooks.ts` (L overall)
1. **Registration.**
   - Already in `power.config.json`, with generated models present: `vsb_countries`, `vsb_capexaccountlists`, `vsb_opexsubaccounts` (+ `vsb_opexaccounts` for `Account.Order`), `vsb_landleasesubaccounts`, `vsb_opexlandleasestandardassumptionses`, `vsb_devexcapexstandardassumptionses`, `vsb_spvdevcomappingcapexdevexes`, `vsb_countryinflationprofiles` and `transactioncurrencies`.
   - **Not registered:** `vsb_applyandapplyalltrackings`, the only one this screen needs. The Fabric tables are not needed (commented out).
   - `ES.currencies = "vsb_currencies"` should become `transactioncurrencies`.
2. **M. Implement the 8 existing hooks** over the generated services. Add `$select` per the checklist; the opex subaccounts need the account order, through an expand or a join on `vsb_opexaccounts`.
3. **S. Add three hooks:** `useSpvDevCoMapping`, `useInflationAreas(countryId)` and `useCurrencies`. Add their tables to `TABLES` (D1, D10–D12).
4. **M. Mutations.** One `WritePlan` executor for save and delete on both families, with query invalidation and `unwrap` / `deleteRecord` (rule 14).
5. **Permissions.** Follow D1: no DataSourceInfo or RecordInfo in the SDK, so either the server refuses or a custom API is built.
6. **Apply.** Keep Apply disabled until a custom API replaces `SynchronizeStandardAssumptionCosts`.

## 3. Open questions for the product owner
1. **Hard-wired fields.** Secured off, Allocate to all WTGs on, One-Time Payment off, Threshold off, Align off, Apply VAT and Depreciation on, Distribution Frequency 3 months, Inflation Start Year "Cluster 6 : Operation + 1 Year". Are these deliberate business rules to keep locked, or temporary canvas switches the code app should re-enable?
2. **Default scope.** The canvas always shows the first country and Wind when nothing is picked. The code shows nothing until a pick. Confirm the code behaviour.
3. **DEVEX delete tracking row.** Every DEVEX delete writes an "Apply All" tracking row in the canvas. Confirm that the code app drops this, so the "last applied" badges show only real applies.
4. **Apply / Apply to All.** Both are disabled and the flow is missing. Should the code app keep Apply hidden or disabled until a custom API exists? Who owns the `SynchronizeStandardAssumptionCosts` replacement and its contract (cost type as a string, the Fabric job row)?
5. **Cost Paid By.** The real choices are DevCo and SPV only. Is "Shared" a planned new option-set value, or an error? Should the default use the SPV mapping by account number or by subaccount lookup, given that the canvas mixes the two?
6. **Period limits.** Should an 11th period stay blocked (the code) rather than silently creating a second Period 1 (the canvas)? Should the new tail after a delete be chosen by period (the code) rather than by description (the canvas)?
7. **Owning Business Unit.** The canvas writes none on either standard-assumption table, and the OPEX write is commented out. Should the code app write the country's BU, and from which source?
8. **Unit label.** "EUR/MW" or "EUR/MW p.a."? The generated enum key `EUR_MW_p_` suggests the latter.
9. **Picker technologies.** The picker offers Wind and PV only, though every save switch handles BESS and Hydro. Keep it to Wind and PV?
