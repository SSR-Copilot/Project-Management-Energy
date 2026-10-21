# Gap analysis: Admin Contract Screen

- Canvas: `ProjectDocs/_extracted/msapp/projectmanagement/Src/Admin Contract Screen.pa.yaml` (4293 lines, read in full; commented formulas ignored). Below, Y:n means a line in that file.
- Code: `ProjectCosts-CodeApp/src/features/admin/admin-contract/` (`Screen.tsx` = S, `rules.ts` = R, `hooks.ts` = H).
- Shared code: `src/data/dataverseNames.ts` (DN), `src/features/admin/admin-gates-approvals/rules.ts` (GR), `src/features/admin/admin-cost/rules.ts` (CR), `src/components/CanvasFields.tsx` (CF), `src/components/CommandBar.tsx` (CB), `src/components/FormPanel.tsx` (FP).
- Schema sources: `ProjectDocs/reference/dataverse-entities.json` (ENT), `dataverse-attributes.json` (ATTR), `ProjectDocs/_extracted/VSBCloud/customizations.xml` (CX).
- Baseline (D14): hooks return `notConnected()` and every write is disabled. That state is not a gap in itself. A row is only marked MISSING where nothing models the behaviour yet, not even an unwired rule.

## Flows verdict

**The live canvas calls no flow.** The only flow reference is `SynchronizeStandardAssumptionCosts.Run("BoP", …)` at Y:4189-4201, inside the `Fabric Sync Jobs` Patch. Both sit inside a `/* … */` block (Y:4159-4208) in `cmp_PopUp_Confirmation_Apply_Tracking.OnConfirm`. Both Apply buttons are also hard-disabled (`DisplayMode: =DisplayMode.Disabled`, Y:664 and Y:1105).

The only live write on that path is the `Apply and Apply All Trackings` Patch (Y:4121-4148), and nothing can reach it.

Plan 005 has several statements that are wrong for live behaviour:
- Its status "INCOMPLETE - missing standard-assumption sync flow" and §12 "blocker" do not hold.
- `Fabric Job Types` and `Fabric Sync Jobs` are only referenced in commented code.
- Its PCF list (PowerCAT CommandBar, FluentDetailsList) does not match the screen. The screen uses only `cat_PowerCAT.Icon` (Save and Cancel, Y:3796 and Y:4014).
- Its feature path `src/features/admin/contract` is really `admin-contract`.

The code already treats the flow as dead (R:34-48, R:899-951).

## D15-d confirmed

`CHOICE_ADMIN.bopContractTypes` is defined at **DN:448** as `{ development: 952850000, construction: 952850001 }`.

The global option set `vsb_contracttypes`, display name "BoP Contract Types" (CX:162887), has these values:
- None 952850000
- Development Contract 952850001
- Construction Contract 952850002
- Project Rights Contract 952850003

`vsb_bopcontractsstandardassumptions.vsb_contracttypes` uses that set (CX:14221+843, `<OptionSetName>vsb_contracttypes`). `CHOICE_COST.bopContractTypes` at DN:524-527 already has the correct values.

Where the wrong values are consumed:
- R:134-137 `CONTRACT_TYPE_VALUE`, which feeds:
  - the caps (R:446-449);
  - the card's type derivation (S:302-303), so a real Development contract (952850001) would be treated as "construction";
  - the create payload (R:685).
- R:76 in the tests.

Note that D15 lists the location as `rules.ts`, but the definition is in `dataverseNames.ts`.

## Requirements vs implementation

Status: C = COVERED, P = PARTIAL, M = MISSING, W = WRONG.

### Data

| # | Canvas requirement (Control.Property, Y:line) | Code (file:line) | Status |
|---|---|---|---|
| D1 | `OnVisible` builds `col_cmpCountryPickerItems` from `Countries` with an `Order` Switch: Germany 1, France 2, Poland 3, Italy 4, Finland 5, Croatia 6, Spain 7, Greece 8, Romania 9 (Y:67-121). The picker's `Countries` excludes "Spain", "Greece" and "Romania" (Y:425). | GR:70-73, GR:93-106 order and exclude; S:148-151. H:11-14 says `$orderby=vsb_name`, which is harmless because the client re-sorts. | C |
| D2 | `cmp_AdminContraacts_NestedCountryPickerColumn.Nestings`: six countries, each nesting **Wind, PV and BESS** (Y:428-534). This overrides the component default of Wind/PV. | GR:87 `PICKER_TECHNOLOGIES = ["Wind","PV"]`. R:29-31 also says "nests Wind and PV only". | **W**: canvas `["Wind","PV","BESS"]`, code `["Wind","PV"]` |
| D3 | Picker initial selection: the gallery default selects the first row, so Germany / Wind (`Components/cmp_NestedCountryPickerColumn.pa.yaml:137-138`). | S:130, S:141, S:155: scope stays empty until the user clicks. | P |
| D4 | CAPEX tree: level 1 = `'Parent Account'.Number = "00001"` and `Not(Number = "10006")`; level 2 and level 3 are their children. Every node has Selected, Used, ContractDevCo, IsFolded and so on (Y:122-273). | R:296-300 `buildContractAccountTree`, which uses the shared `buildAccountTree`. | C |
| D5 | DevCo Cost Form: the header gallery is `Filter(col_Edit_DevCoCosts, Level = 1)` sorted by `Order` (Y:3046-3054). Its children are `Level = 3 && ParentId = ThisItem.Id`, where ParentId is the level-1 id (Y:3100-3107, Y:205). Level-2 rows are never shown. | S:199-201: the headers are **level-2** nodes that have children, and the leaves are their level-3 children. | **W**: canvas groups by level-1 category, code groups by level-2 account |
| D6 | Contracts: `colAdminContracts = AddColumns('BoP Contracts Standard Assumptions', IsFolded, true)`, a full table (Y:34-41). The gallery filters `Country.Name` and `Text(Technology)` for the scope and sorts `"vsb_contracttypes"` asc, then `"vsb_name"` asc (Y:817-830). | H:23-28 documents the filter, `$orderby` and `$select`. H:78-80 returns `notConnected`. S:299 renders in array order with no client sort. | P |
| D7 | Primary key `vsb_bopcontractsstandardassumptionsid` (Y:4259; ENT:70; ATTR:384). | R:85 `id: "vsb_bopcontractsstandardassumptionid"` | **W**: canvas `…assumptionsid`, code `…assumptionid` |
| D8 | DevCo table primary key `vsb_bopcontractsstandardassumptiondevcocostsid` (ENT:64; CX:12732+767). | R:102 `"vsb_bopcontractsstandardassumptiondevcocostid"` | **W**: canvas `…devcocostsid`, code `…devcocostid` |
| D9 | The DevCo child's `Country` and `Technology` columns are **`crc36_country`** (lookup) and **`crc36_technology`** (option set `vsb_technology`) (CX:12732+14-83). The canvas writes both (Y:3953-3954). The other lookups `vsb_bopcontractstandardassumption`, `vsb_capexaccount` and `vsb_rootcapexaccount` exist (CX:+801, +839, +917). | R:108-109 `_vsb_country_value` and `vsb_technology`. R:721-723 binds `vsb_Country@odata.bind`. R:715 writes `vsb_technology`. This table is not in ATTR, so the names were never verified. | **W**: canvas `crc36_country`/`crc36_technology`, code `vsb_country`/`vsb_technology` |
| D10 | `col_Costs_Flat_Cache`: ParentID = contract id, CategoryName = `'CAPEX Account'.Name`, ParentOrder/AccountName = `RootCapexAccount.Order/.Name` (Y:42-55, rebuilt at Y:4240-4253). `col_Global_DevCoCosts` (Y:56-65) and `colSelectedConratctWithDevCoCosts` (Y:130-133) are never read. | R:170-177 `DevCoCost`; H:30-34 (scoped, FormattedValue of both lookups). The dead collections are dropped. | C |
| D11 | `colApplyAndApplyAllTracking`, full table (Y:30-33, Y:4152-4156). LookUp on Country, Technology, `'Action?' = 'Apply All'` and `'Contract Type' = BoP` (Y:673-681, Y:776-796). | H:36-40 (server-filtered); CR:247-258 `findLastApply`; S:167-169. | C |
| D12 | `'BoP Contract Types'` values: Development 952850001, Construction 952850002 (CX:162887). Used at Y:281, Y:289, Y:584, Y:606, Y:4283, Y:4287. | DN:448 `{development: 952850000, construction: 952850001}`, consumed at R:134-137, S:302-303 and R:685 (D15-d). | **W**: canvas 952850001/952850002, code 952850000/952850001 |
| D13 | `Closing Date Reference`: Cluster 4 952850000, FID 952850001, Cluster 5 952850002 (CX:162676). | R:1027-1031 | C |
| D14 | `Contract Margin Type`: Percentage 952850000, Fixed Value 952850001 (CX:162856). | DN:450, R:1037-1040 | C |
| D15 | Parent `Patch` (Y:3884-3921) writes on every save, create or update:<br>- `Name = Text(type) & " - " & Description` (untrimmed)<br>- Description<br>- Country<br>- Technology<br>- Closing Date Reference<br>- signed Month Difference<br>- Margin<br>- Margin Type (Yes ? type : Blank)<br>- Margin Percentage<br>- Margin Fixed Value<br>- Comment<br>- `'Contract Types'` | R:666-692 `buildContractPayload`:<br>- Country, Technology and Contract Types are written **only on create** (R:684-690).<br>- Name and Description are trimmed (R:674-675).<br>- An empty comment is written as `null`.<br>- No `owningbusinessunit` on the parent (rule 4 asks for it on creates).<br>- Inherits the D12 value. | P |
| D16 | Save write order (Y:3884-3997):<br>1. Patch the parent.<br>2. `RemoveIf` children of this contract whose account was deselected (`Selected = false && !IsBlank(ContractDevCo)`).<br>3. `Patch(ForAll)` new children (`Selected && ContractDevCo = EmptyGUID && Level = 3`).<br>4. Local `Collect`/`UpdateIf`.<br>5. `Refresh` both tables. | R:752-819 `planSaveContract` (upsert, then deletes, then creates) and R:644-658 `reconcileDevCoCosts`. A create is two-phase (R:741-751). Not wired. | C |
| D17 | Child create payload (Y:3942-3957): `Name: $"{Nummer}-{Name}"`, the contract, `'CAPEX Account'`, Country, Technology. RootCapexAccount is **not** written. | R:703-729. Adds RootCapexAccount, a documented DIVERGENCE (R:694-702), and OBU. The Country/Technology names are wrong (D9). | P |
| D18 | Delete (`cmp_PopUp_Confirmation_Delete_Contract_Or_Period_1.OnConfirm`, Y:4060-4083): spinner, then `Remove` the parent **only**, `RemoveIf` the local row, clear the selection, then general reset. | R:829-848 also deletes the children (DIVERGENCE, R:821-828). S:593 confirm is a no-op. | P |
| D19 | `Apply and Apply All Trackings` upsert (Y:4121-4148): Name, Country, Technology, `'Action?'`, `'Applied By Email'`, `'Applied By Full Name'`, `'Contract Type' = BoP`, `'BoP Standard Contract'`. It is unreachable because both buttons are disabled. | Not planned (R:45-47); the shared CR builder supports `bopStandardContractId`. Column names match CX:179+ (`vsb_action`, `vsb_bopstandardcontract`, `vsb_contracttype`, …). | C (dead as shipped) |
| D20 | `Fabric Sync Jobs` Patch, flow call and Notify (Y:4159-4208) are commented out. | Not ported (R:34-44). | C |

### Behaviour

| # | Canvas requirement | Code | Status |
|---|---|---|---|
| B1 | `Screen.OnVisible` (Y:14-293):<br>1. `Concurrent`: reset 10 locals (incl. `locContractsCostsMax: 1000000000`) and run 4 ClearCollects.<br>2. Countries.<br>3. CAPEX tree.<br>4. Cap flags. | `useState` defaults S:157-164; R:125 `CONTRACT_COSTS_MAX`; H:68-90 `notConnected`. | P |
| B2 | Picker `OnSelect = Select(btnGeneralPurposeReset)` (Y:535). The reset (Y:4234-4290) refreshes both tables, rebuilds the cache, regenerates `colAdminContracts` **preserving each card's IsFolded**, and recomputes both caps. | A scope change re-keys the hooks (S:142-144). Caps are derived live (R:452-456). No fold-state preservation (see B6). | P |
| B3 | `btn_AdminContract_Add_*.OnSelect` (Y:584, Y:606):<br>- If the cap is reached, Notify.<br>- Otherwise open the panel with the type, a blank record, `locSelectedContractMarginType: 'Contract Margin Type'.Percentage`, and margin values blank.<br>- Build `col_Edit_DevCoCosts` sorted by Nummer, and mark every DevCo cost found in the scope `Used: true` (UsedInContractDevCo set). | S:171-176 `openPanel` plus R:313-339 `classifyAccounts(…, null)` mark everything found as Used. The margin-type default is not applied (S19). | P |
| B4 | `btn_Edit_AdminContracts.OnSelect` (Y:1057): Refresh, rebuild, then classify each scoped cost as Selected (= this contract) or Used (= another), set ContractDevCo, open the panel with the record's values, `Select(btn_Add_Edit_AdminContracts_Reset)`. | S:321-323 → S:171-176; R:313-339; R:480-497. | C |
| B5 | `btn_Delete_AdminContracts.OnSelect`: set `locIsVisiblePopUpDeleteContract` and the selection (Y:1070-1077). | S:324-326, S:586-595. | C |
| B6 | `ico_Chevron_Expand_Collapse_AdminContracrs.OnSelect`: `Patch(colAdminContracts, ThisItem, {IsFolded: !ThisItem.IsFolded})`. The source comment says "others will stay expanded" (Y:982-992). Default is IsFolded `true` (Y:39). | S:158 and S:315 `nextExpandedId` (R:422-423) give accordion behaviour, so only one card can be open. | **W**: canvas opens cards independently, code allows one at a time |
| B7 | After Save, the saved card is added or updated with `IsFolded: false`, i.e. expanded (Y:3964-3981). | Nothing. | M |
| B8 | `ico_Add_Edit_AdminContracts_Close.OnSelect`: close, set dirty false, reset form, general reset (Y:1901-1913). `ico_AdminContracts_Cancel.OnChange = Select(close)` (Y:4034). | S:188, S:401, S:405. | C |
| B9 | `ico_AdminContracts_Save.OnChange` (Y:3854-4007):<br>- Hide the panel and show the spinner "Please wait, saving...".<br>- `IfError(…)`, on failure `Notify("Error saving Contract: " & FirstError.Message, Error)`.<br>- Refresh, then reset and clear. | S:404 `onSave={closePanel}`. No mutation hook, spinner or error path, even as a stub. | M |
| B10 | DevCo header transparent button and chevrons: accordion (`UpdateIf(…, true, {IsFolded: true})`, then open the clicked one) (Y:3389, Y:3435, Y:3461). The selected header shows an `akzent1` left bar (`rec_…_Card_Selected.Fill`, Y:3596-3601). | Accordion is in S:550. The highlight bar is missing. | P |
| B11 | `chb_Contracts_RightPanel_NewEdit_CostssRow.OnCheck/OnUncheck` toggle Selected (Y:3182-3197). | R:406-415; S:569-572. | C |
| B12 | `img_Parent_TriState_Checkbox.OnSelect`: turn on only if no available child is selected, otherwise turn all available children off (Y:3636). | R:399-403; S:536-541. | C |
| B13 | `rad_Add_Edit_AdminContracts_RightPanel_NewEdit_Margin.OnChange`: dirty, set pct and fixed to **0**, Reset both inputs (Y:2872-2883). | S:466 only flips `margin`. | M |
| B14 | `rad_AddEdit_AdminContracts_RightPanel_MarginType.OnChange`: reset the other input, set both to 0, Reset both (Y:2908-2930). | S:475-477 only sets `marginType`. | M |
| B15 | Every input's `OnChange` sets `locContractDevCoCostsDirty: true` (Y:2030, 2240, 2391, 2403, 2998, 2550, 2783). | S:187 `update()` sets `dirty`. | C |
| B16 | Apply / Apply All `OnSelect` open the confirmation (Y:668-683, Y:1111-1130). Confirm upserts tracking (Y:4103-4222). | S:274-283, S:327-330 (disabled); S:597-609 (no-op). | C |
| B17 | `cmp_Admin_Contracts_Header.OnLogoClick = Navigate('Project Main Screen')` (Y:341). Left nav `OnSelect` navigates to `TargetScreen` (Y:391-405). | App shell: `src/app/navigation.ts:158` `/admin/contract`, `routes.tsx:156`. | C |
| B18 | Flow calls: none live (Y:4159-4208 is commented). | R:34-48, R:899-951. | C |

### State gates, validation, Notify

| # | Canvas requirement | Code | Status |
|---|---|---|---|
| S1 | Add buttons are `DisplayMode.Disabled` when the type count for the scope is 10 or more (Y:575-580, Y:597-602; count at Y:274-293 and Y:4279-4290). The canvas **does** disable them, so the R:430-439 comment that the canvas "enforced [it] by a Notify toast, not by disabling" is inaccurate. | R:441-456, S:178-183. The logic is right but counts with the wrong option values (D12). | P |
| S2 | Notify, verbatim: `"Maximum 10 development contracts allowed for " & <country> & " - " & <tech>` (Y:584), and the same text with "construction" (Y:606). | R:234-235 `MSG.capReached`, identical text but unused because the button is disabled (also unreachable in the canvas). | C |
| S3 | `btn_AdminContract_ApplyAll.DisplayMode` and `btn_Apply_Individual_AdminContracts.DisplayMode` = `Disabled` (Y:664, Y:1105). | R:903-906; S:279, S:329. | C |
| S4 | `con_AdminContract_Apply_All_Last_Tracking.Visible = Len(label) > 0` (Y:740). The label is `Text(Modified On,"dd.mm.yyyy") & " Apply was made by " & 'Modified By'.'Full Name'` (Y:775-796). SOURCE DEFECT: it reads `cmp_Admin_Costs_Assumption_NestedCountryPickerColumn` (Y:781-782). | CR:265-275; S:288-295 (uses its own scope; fixed, R:923-939). | C |
| S5 | Per-card `con_Tracking_ApplySyncIndividual_AdminContract` (Visible when Len > 0) with `lbl_AdminContract_Info_Individual_AdminContracts_1`: the same text for `'Action?' = Apply` and `'BoP Standard Contract'` = this card (Y:1172-1258). | Not rendered. | M |
| S6 | `con_Body_Expanded.Visible = !ThisItem.IsFolded` (Y:1026). | S:318. | C |
| S7 | `con_MarginType_InfoGrid2.Visible` and `con_MarginFixedValuePercentage_InfoGrid2.Visible` = `ThisItem.Margin = Yes` (Y:1534, Y:1590). | S:357-368 always renders both. | **W**: canvas shows them only when Margin = Yes, code always |
| S8 | `lbl_MarginFixedValuePercentage_Heading.Text`: `"Margin Fixed Value [" & If(Not(IsBlank(SelectedCountry.'ISO Currency Code')), <ISO code>, "EUR") & "]"` when Yes and Fixed, otherwise `"Margin [%]"` (Y:1611-1623). | S:363 uses `marginCurrency(countryName)` = Poland → PLN, else EUR (R:1046-1047). That is the panel rule (Y:2506), not the card rule. | **W**: canvas card uses the ISO currency code, code uses the Poland test |
| S9 | `con_MonthDifference_InfoGrid1.Visible = false` (Y:1407). | S:350 (empty cell). | C |
| S10 | `con_AdminContracrt_RightPanel_NewEditContract.Visible = locIsVisibleBoPStandardAssumptionContract` (Y:1826). | S:398. | C |
| S11 | `lbl_Add_Edit_AdminContracts_Header.Text = If(IsBlank(sel),"New ","Edit ") & Text(type)`, i.e. "Development Contract" or "Construction Contract" (Y:1876-1881). | R:1000, S:399. The type for Edit comes from S:302-303 with the D12 values, so a real Development contract would show as "Edit Construction Contract". | P |
| S12 | `lbl_Add_Edit_AdminContracts_Description_ErrorMessage` is dead (Text commented, Y:2000-2019). | Not ported (R:251-286). | C |
| S13 | `lbl_…_Description_ErrorMessage_1`, verbatim "The Contract Closing Date cannot be empty.", visible on edit only (Y:2145-2157). | R:206, R:571-574; S:434-436. | C |
| S14 | `rad_Contracts_RightPanel_NewEdit_CostsUntilClosingDate.DefaultSelectedItems`: **Cluster 4** when the record's value is blank or the record is new (Y:2225-2236). | R:475 `closingDateReference: null`; R:485 keeps null. | **W**: canvas default Cluster 4 (952850000), code `null` |
| S15 | `lbl_…_MonthDifference_ErrorMessage`, verbatim "Only whole numbers with up to two digits are allowed.", visible when the value is non-blank and fails `^\d{1,2}$` (Y:2301-2312). | R:208, R:511-512; S:190-191. | C |
| S16 | `drp_…_MonthDifference_AddSub.DefaultSelectedItems`: on edit, `Value(Month Difference) > 0` gives "+", otherwise "-"; new gives "+" (Y:2380-2389). | R:486: `< 0` gives "−", otherwise "+". They differ only for 0, which saves the same value. | P |
| S17 | `txt_…_MonthDifference_Month.Value` reads `locSelectedBoPStandardContract.'BoP Projects Contracts'` (Y:2406-2414). That is **not** a column of `vsb_bopcontractsstandardassumptions` (ATTR:283-480), probably a relationship. On a new contract the field is blank. | R:487 prefills `Abs(monthDifference)` (sensible, undocumented DIVERGENCE). | P |
| S18 | Margin radio default **No** (Y:2860-2868). | R:476. | C |
| S19 | Margin Type default: new gives **Percentage** (Y:584/606 `locSelectedContractMarginType: 'Contract Margin Type'.Percentage`); edit gives the record's value (Y:1057), via `DefaultSelectedItems` (Y:2900-2904). | R:476 `marginType: null`. R:612 adds an invented "Select a margin type." error. | **W**: canvas Percentage (952850000), code `null` |
| S20 | Margin Type radio `Visible`/`Height` only when Margin = Yes (Y:2906, Y:2931). | S:468. | C |
| S21 | Percentage container visible when Yes and Percentage; Fixed container visible when Yes and Fixed (Y:2474-2478, Y:2643-2647). | S:480, S:491. | C |
| S22 | `lbl_…_MarginPercentage_ErrorMessage.Text` (Y:2676-2696): `gblAppResx.InputBlank` = "Input must not be blank", `NumericOneDecimals` = "Numeric value with maximum of one decimals", then `"Please select a value between 0 and " & Text(100,"###,###0.0")`. Strings are from `App.pa.yaml:1629-1633`. `Visible` requires a **non-blank** value (Y:2698-2711), so the blank message never shows. | R:213 "Enter a percentage between 0 and 100 with one decimal." (labelled "canvas message"). R:515/R:223 shows "Value cannot be blank." when blank (S:194-195). | **W**: the canvas texts above vs `"Enter a percentage between 0 and 100 with one decimal."` / `"Value cannot be blank."` |
| S23 | `lbl_…_MarginFixedValue_ErrorMessage.Text` (Y:2586-2621): InputBlank, `NumericTwoDecimals` = "Numeric value with maximum of two decimals", then `"Please select a value between 0 and " & Text(locContractsCostsMax,"###,###0,00")`. Visible only when non-blank. | R:218 "Enter a value between 0 and 1,000,000,000 with two decimals."; R:521-526. | **W**: same issue as S22 |
| S24 | `ico_AdminContracts_Save.DisplayMode` (Y:3800-3839) enables Save when all of these hold:<br>- dirty or changed, and the count of `Selected = true` is above 0 (parent rows included);<br>- the trimmed description is non-blank;<br>- the closing-date label is not visible;<br>- margin Yes → Percentage needs pct valid and non-blank; **any other type** needs fixed valid and non-blank;<br>- closing date non-blank;<br>- month **non-blank only** (the regex label is not in the conjunction);<br>- margin non-blank. | R:583-621 `validateContract` is stricter: month regex required (R:598-602), margin type required (R:612), and invented messages `MSG.noAccountSelected`/`notDirty` (R:228-233, labelled NEW). | P |
| S25 | `chb_Contracts_RightPanel_NewEdit_CostssRow`:<br>- `Checked = Or(Selected, Used)`<br>- `DisplayMode = Used ? View : Edit`<br>- `FontColor = Used ? gblAppColors.Warning`<br>- `rec_…_CostssRow_Used` warning square `Visible = Used`<br>(Y:3172-3212) | S:567 `checked={sel?.selected === true}`, so used rows render unchecked and disabled, with no warning styling. | **W**: canvas `Selected OR Used`, code `selected` |
| S26 | Parent tri-state SVG: LOCKED (grey filled with tick) / UNCHECKED / CHECKED (`_SelectedCount = _TotalCount`) / PARTIAL. Disabled when no child is available (Y:3615-3635, Y:3654-3668). | R:366-392; S:534-535. LOCKED renders as an unchecked, disabled box rather than a grey ticked box. | P |
| S27 | Hidden `chb_Add_Edit_AdminContract_Right_Panel_DevCoCostForm_Costs` (`Visible: false`, Y:3584-3586). | Not ported (R:58-59). | C |
| S28 | Delete confirmation, verbatim:<br>- Title "Delete BoP Standard Contract"<br>- Description `Are you sure that you want to permanently delete "<Name>" contract?`<br>- Buttons Cancel / Confirm, icons Cancel / Delete<br>(Y:4052-4085) | S:586-595 uses R:1015-1017. R:246 `MSG.deleteTitle` = "Delete this BoP standard contract?" is unused and wrong; remove it. | C |
| S29 | Apply confirmation Title `Apply to All` or `Apply to <Name>`, and Description `Are you sure you want to apply standard contracts to all contracts\|contracts to <Name> for "<country>" and "<tech>" ?` (Y:4093-4101, Y:4223-4228). | R:1019-1023; S:597-609. | C |
| S30 | `cmp_PopUp_Loading_AdminBoPContracts`, `Visible = locIsContractVisiblePopUpSpinner`. Texts: "Please wait, saving..." (Y:3860), "Please wait, deleting..." (Y:4063), "Applying Standard Contracts, Syncing Job in Progress....." (Y:4108). The `OnVisible` default "Saving Contract data..." (Y:23) is never shown. | No `LoadingOverlay`, no texts in R. | M |
| S31 | `Notify("Error saving Contract: " & FirstError.Message, NotificationType.Error)` (Y:3988-3991). | Not in R or S. | M |

### UI

AccessibleLabel is set on **no** control in this YAML (0 hits), so every `aria-label` should equal the visible caption.

| # | Canvas requirement | Code | Status |
|---|---|---|---|
| U1 | Header `Project.Name: "Contracts"` (Y:342-350). | S:207 `T.title` (R:963). | C |
| U2 | `lbl_AdminContract_Selected_Country_Technology.Text = $"Contracts / {country} / {tech}"` (Y:565). | S:266-270, R:965. | C |
| U3 | `btn_AdminContract_Add_Development_Contract` and `btn_AdminContract_Add_Construction_Contract`: captions "Add Development Contract" / "Add Construction Contract", icon Add, inside the scope bar to the right of the scope label (Y:569-611). | Captions and aria-labels are right (R:967-969). The test id comes from CB:109 `command-${key}`, and the buttons sit in the header `CommandSlot` (S:209-219), not the scope bar. | **W**: test id `btn_AdminContract_Add_Development_Contract` vs `command-addDevelopment` (same for Construction) |
| U4 | `btn_AdminContract_ApplyAll` "Apply to All" (Checkmark), info icon, `lbl_AdminContract_ApplyAll_Info` "Apply standard contracts to all relevant projects, this will override existing standard assumption contracts" (Y:657-724). | S:274-287; R:971-974. | C |
| U5 | `lbl_Title = ThisItem.Name`, chevron `ChevronDown`/`ChevronUp`, `shp_AdminContracts_HeaderDivider` (Y:939-1016). | S:307-317. | C |
| U6 | `btn_Edit_AdminContracts` "Edit", `btn_Delete_AdminContracts` "Delete", `btn_Apply_Individual_AdminContracts` "Apply", `lbl_AdminContract_Info_Individual_AdminContracts` "Apply standard cost to relevant projects, this will override existing standard assumption contracts" (Y:1047-1171). | S:321-334. The info `<Text>` at S:333 has no `data-testid`. | P |
| U7 | Grid 1: "Description" / `ThisItem.Description`; "Closing Date Reference" / `ref & " " & ("- " \| "+ ") & Abs(n) & " months"` (Y:1289-1393). | S:336-351; R:992-993. | C |
| U8 | Grid 2: "Margin" / `ThisItem.Margin` (Yes/No); "Margin Type" / `Text('Margin Type')` (Y:1480-1576). | S:352-360. | C |
| U9 | `lbl_DevCoCostFrom_Heading` "DevCo Costs From". HTML groups by RootCapexAccount name ranked 1-5, else 99. Group header `AccountName & " :"`, tags = `'CAPEX Account'.Name` (Y:1669-1749). | S:370-382; R:857-890. The group header lacks the trailing `" :"`. | P |
| U10 | "Comments" / `If(IsBlank(Comment),"-",Comment)` (Y:1773-1813). | S:383-386. | C |
| U11 | Panel `Min(960, Parent.Width)`, right-docked; `themePrimary` header; `ico_Add_Edit_AdminContracts_Close` (Y:1829-1919). | `FormPanel width="wide"` (S:397-401). The close button test id is FP:18 `panel-close` and its aria-label is "Close panel". | **W**: test id `ico_Add_Edit_AdminContracts_Close` vs `panel-close` |
| U12 | `txt_Add_Edit_AdminContracts_Description`, label "Description" with `*`, `MaxLength 256` (Y:2023-2098). | S:414-422, no `maxLength`. | P |
| U13 | Radio group "Closing Date Reference" with `*` (Y:2161-2254). | S:423-433. The group aria-label is the control name (CF:160 `aria-label={name ?? label}`), not the caption (rule 16). This is a shared-component issue. | P |
| U14 | "Month Difference" `*`; dropdown `["+","-"]` (width 100); textbox (Y:2316-2417). | S:437-458 (both controls aria-labelled "Month Difference"). | C |
| U15 | "Margin" `*` radio, Yes/No (Y:2796-2896). | S:459-467. | C |
| U16 | `rad_AddEdit_AdminContracts_RightPanel_MarginType`, no caption, Percentage / Fixed Value (Y:2897-2944). | S:468-479. | C |
| U17 | "Margin [%]" `*`, `txt_…_MarginPercentage` `MaxLength 130` (Y:2715-2795). | S:480-490, no `maxLength`. | P |
| U18 | `"Margin Fixed Value [" & If(Name="Poland","PLN","EUR") & "]"` `*`, `MaxLength 130` (Y:2482-2560). | S:491-501 (caption right), no `maxLength`. | P |
| U19 | "Comment", multiline, `MaxLength 50`, counter `$"{Len(Trim(value))}/50"` (Y:2961-3015). | S:502-511. | C |
| U20 | "DevCo Cost Form" with `*` (Y:3693-3753). | S:515-517. | C |
| U21 | DevCo header `$"{Nummer} {Name}"`, live controls `btn_Add_Edit_AdminContract_Right_Panel_DevCoCostForm_Transparent`, `img_Parent_TriState_Checkbox` and `btn_Parent_TriState_Overlay` (Y:3346-3692). | S:532 gives the tri-state the **hidden** control's id `chb_Add_Edit_AdminContract_Right_Panel_DevCoCostForm_Costs`. S:549 appends `-${parent.id}` to the transparent-button id. | **W**: test id `img_Parent_TriState_Checkbox`/`btn_Parent_TriState_Overlay` vs `chb_…_DevCoCostForm_Costs`; `btn_…_Transparent` vs `btn_…_Transparent-<id>` |
| U22 | Leaf `lbl_Contracts_RightPanel_NewEdit_CostssRow_Name = $"{Nummer} {Name}"` (Y:3302). | S:559-565. | C |
| U23 | `ico_AdminContracts_Save` "Save" (CheckMark) and `ico_AdminContracts_Cancel` "Cancel" (Y:3796-4039). | S:403-409, CF:178-189. | C |
| U24 | No AccessibleLabel anywhere, so aria-label = caption. | Followed throughout S, except U13 (shared component). | C |
| U25 | Picker component: country rows with flag images (`'Flag Image'` Switch, Y:72-93), inner galleries `gal_Countries` / `gal_CountryNestedChilds` (component file). | S:223-263: nav test id right; no flags; inner ids are `cbx_CountrySelected-*` and `admin-contract-technology-*`. | P |
| U26 | Left nav, width 200 expanded / 32 collapsed (Y:366-407). | App shell `LeftNav`. | C |
| U27 | Body layout: left nav, then picker (200), then right content (scroll Y) (Y:352-544). | S:221-394 (picker 220px, responsive). | C |

### Status counts (96 rows)

| Status | Data | Behaviour | State | UI | **Total** |
|---|---|---|---|---|---|
| COVERED | 9 | 9 | 15 | 17 | **50** |
| PARTIAL | 5 | 4 | 6 | 7 | **22** |
| WRONG | 6 | 1 | 7 | 3 | **17** |
| MISSING | 0 | 4 | 3 | 0 | **7** |

## Proposed changes

### (a) UI: `Screen.tsx`

1. **S. Leaf checkbox state.** Make it `checked = selected || used`, add warning styling for used rows, and keep it disabled when used (S25).
2. **M. DevCo form grouping.** Group the form by level-1 category with all level-3 descendants as rows (D5). Change S:199-201: `devCoParents = tree` and `accountsUnder = flatten level 3`. Show categories even when they have no children.
3. **S. Card expansion.** Let cards expand independently: use a `Set<string>` of open ids, default all collapsed, and expand the saved card after Save (B6, B7). `nextExpandedId` then applies only to the DevCo accordion.
4. **S. Card margin sections.** Render Margin Type and the value section only when `c.margin` is true (S7). Make the card heading use the country's ISO currency code with an "EUR" fallback. That needs `isoCurrencyCode` on `CountryRef`/scope (S8).
5. **S. Margin radio resets.** Margin and Margin Type changes set both values to "0" (B13, B14). Put the logic in `rules.ts` as a pure reducer.
6. **M. Test ids** (U3, U11, U21, U6):
   - Add a per-command `testId` to `CommandBar` (shared) and pass `btn_AdminContract_Add_Development_Contract` / `…_Construction_Contract`.
   - Optionally move both buttons into the scope bar next to the scope label, as in the canvas.
   - Add `closeTestId` to `FormPanel` → `ico_Add_Edit_AdminContracts_Close`.
   - Give the tri-state the id `img_Parent_TriState_Checkbox` and drop the `-${parent.id}` suffix, or record the suffix as an approved D15 item.
   - Add `lbl_AdminContract_Info_Individual_AdminContracts` to the info `<Text>`.
7. **S. Max lengths** (U12, U17, U18): `maxLength` 256 on Description, 130 on Margin % and Margin Fixed Value.
8. **S. Per-card tracking** (S5): add the per-card last-Apply label `lbl_AdminContract_Info_Individual_AdminContracts_1`, using `findLastApply` with action Apply and contract id. This needs the `bopStandardContract` field on `ApplyTrackingRow`.
9. **S. Spinner and error path** (S30, S31, B9): add a `LoadingOverlay` with the three canvas texts, and an error message bar "Error saving Contract: <message>" ready for when hooks connect.
10. **S. DevCo highlight and group header** (B10, U9): add the selected-header left bar, and the `" :"` suffix on DevCo group headers.
11. **S. Default scope** (D3): pick Germany / Wind (the first picker row) when countries load.
12. **S. Shared `Choices`** (U13): use `label` for `aria-label` and keep `name` as the test id. This is shared, so check the other screens.

### (b) `rules.ts` (+ `rules.test.ts`)

1. **S. Fix D15-d** in `dataverseNames.ts:448`: `bopContractTypes: { none: 952850000, development: 952850001, construction: 952850002, projectRights: 952850003 }`. Better still, point `CHOICE_ADMIN` at the `CHOICE_COST` copy. Update the fixture at test line 76. Add a test that a 952850001 row counts as development and shows the "Development Contract" title (S1, S11, D12).
2. **S. Primary-key names** (D7, D8): R:85 → `vsb_bopcontractsstandardassumptionsid`, R:102 → `vsb_bopcontractsstandardassumptiondevcocostsid`.
3. **S. DevCo Country/Technology columns** (D9): `DEVCO_COST_COL.country = "_crc36_country_value"`, `technology = "crc36_technology"`. Add a separate `DEVCO_LOOKUP.country = "crc36_Country"` for the bind in `buildDevCoCostPayload`. Confirm the navigation-property name against the generated schema after `pac` add.
4. **S. Picker technologies** (D2): give Contract its own nesting `["Wind","PV","BESS"]`. Do not change the shared GR:87 used by Gates and Cost unless their YAML also says BESS. Correct the R:29-31 and GR:82-86 comments.
5. **S. Form defaults** (S14, S19): `emptyContractForm()` gets `closingDateReference: 952850000` (Cluster 4) and `marginType: CHOICE_ADMIN.contractMarginType.percentage`. In `toContractForm`, a blank closing date falls back to Cluster 4. Remove "Select a margin type.", or follow the canvas: a non-Percentage type means the Fixed branch.
6. **M. Margin validation texts** (S22, S23): add `MSG.inputBlank = "Input must not be blank"`, `numericOneDecimals = "Numeric value with maximum of one decimals"`, `numericTwoDecimals = "Numeric value with maximum of two decimals"` and `outOfRange(max, fmt) = "Please select a value between 0 and …"`, all from `App.pa.yaml:1629-1633`. Add a visibility predicate that is false for blank input. Retest UT cases at test lines 284-308.
7. **S. Save gate** (S24): month validity is not part of the canvas Save gate. Either drop the regex term from `validateContract` or log a DIVERGENCE in D15. Also log `noAccountSelected` / `notDirty` as display-only.
8. **S. Parent payload** (D15): write Country, Technology and Contract Types on update too, as the canvas does, or log a divergence. Decide on trimming (canvas does not trim). Add `owningbusinessunit@odata.bind` on create (rule 4).
9. **S. Cleanup:** fix the R:430-439 comment (the canvas does disable the Add buttons and recomputes caps in `btnGeneralPurposeReset`). Delete the unused, wrong `MSG.deleteTitle` (R:246). Note that `MSG.capReached` is unreachable.
10. **S. Month-sign tests:** record the S16 zero-case and the S17 prefill divergence in tests.

### (c) `hooks.ts`

`power.config.json` registers `vsb_bopcontractsstandardassumptionses` (line 29), `vsb_capexaccountlists` (33) and `vsb_countries` (73). It does **not** register:
- `vsb_bopcontractsstandardassumptiondevcocostses`
- `vsb_applyandapplyalltrackings`

Run `pac code add-data-source -a dataverse -t vsb_bopcontractsstandardassumptiondevcocosts` and `-t vsb_applyandapplyalltracking` before connecting, and diff `.power/schemas/appschemas/dataSourcesInfo.ts`.

1. **S. Countries.** `useContractCountries`: `$select vsb_countryid, vsb_name` and the ISO-currency column (needed for S8; logical name to be verified in ATTR `vsb_Country`).
2. **S. Account tree.** `useContractAccountTree`: as H:16-21. It shares the Admin CAPEX Accounts key.
3. **M. Contracts.** `useBopContracts(scope)`: filter `_vsb_country_value` and `vsb_technology`, `$orderby vsb_contracttypes asc, vsb_name asc` (D6), with the corrected PK.
4. **M. DevCo costs.** `useDevCoCosts(scope)`: filter on **`_crc36_country_value` / `crc36_technology`**, or through the parent lookup (`vsb_BoPContractStandardAssumption/_vsb_country_value`, which matches the canvas filter `'BoP Contract Standard Assumption'.Country.Name`, Y:584). `$select` with FormattedValue for `_vsb_capexaccount_value` and `_vsb_rootcapexaccount_value`. Blocked on registration.
5. **S. Apply tracking.** `useContractApplyTracking(scope)`: as H:36-40, plus `_vsb_bopstandardcontract_value` and the modified-by name (S5). Blocked on registration.
6. **L. Save mutation.** `useSaveContract`: two-phase create (POST the parent, then a `$batch` of child deletes and creates), then invalidate the contracts and DevCo keys. Surface errors as "Error saving Contract: …" (B9, S31) and drive the spinner.
7. **M. Delete mutation.** `useDeleteContract`: decide on deleting the parent only versus the R:829-848 child cascade (open question 3). Rule 14: surface SDK failures.
8. Apply / Apply-All mutation: **none.** Stays disabled (canvas parity).

## Open questions for the product owner

1. **BESS.** This screen's canvas offers Wind, PV and BESS under every country (Y:428-534), but the shared picker (and possibly Gates and Cost) offers Wind and PV only. Should Contract show BESS, and should the other two admin screens show it too?
2. **DevCo Cost Form grouping.** The canvas groups by level-1 category and lists level-3 accounts flat, hiding level 2 (D5). Keep that, or show the three-level tree?
3. **Delete.** The canvas deletes only the contract row (Y:4068-4071). Does Dataverse cascade-delete the `BoP Contracts Standard Assumption DevCo Costs` children? If not, orphaned children keep accounts "Used" for ever. Is the code's explicit child delete approved?
4. **Card expansion.** Canvas cards expand independently (Y:982-992). Keep that, or is the code's accordion (one open at a time) an accepted change?
5. **Margin error texts.** The canvas validation messages are generic `gblAppResx` strings ("Input must not be blank", "Numeric value with maximum of two decimals", "Please select a value between 0 and …"). The fixed-value range text uses `Text(1000000000,"###,###0,00")`, which renders oddly. Keep the canvas texts verbatim, or approve clearer ones?
6. **Month difference.** The canvas Save accepts a non-numeric month value, because only `IsBlank` is in the Save gate (Y:3834). Also, the edit prefill reads `'BoP Projects Contracts'`, which is not a column of this table (Y:2408). Approve the code's stricter validation and the prefill from `vsb_monthdifference`?
7. **Apply / Apply to All.** Both are disabled and the sync flow is commented out. Should the plan-005 "blocked by flow" status be withdrawn, and is Apply permanently out of scope?
8. **Card currency heading.** The card heading uses the country's ISO currency code (Y:1618-1620), while the panel uses a hard-coded Poland → PLN rule (Y:2506). Should both follow one rule?
9. **Ownership.** Should contract creates write `owningbusinessunit`, as CONVENTIONS rule 4 asks, even though the canvas does not?
