# 08 — Functional: the Add/Edit Cost right panel and its save path

Gap ID prefix: **GAP-PNL**. Written 27 Oct 2026 from the source on disk (canvas solution 1.21.709;
code app working tree on branch `RounakDev1`). Nothing here was exercised against a live canvas or
against `VSBCloud_Dev`.

---

## 1. Scope

**Covers:** `con_cost_RightPanel_Form_AddContract`, the DEVEX/CAPEX Add/Edit Costs right panel, from
end to end:

- how it opens and its modes;
- every field in on-screen order;
- the Save path, with the hidden code buttons the panel owns;
- Cancel, the ✕, and the refresh after a save;
- the triggers (only) of the two confirmation pop-ups the panel raises.

**Does not cover** (owned by sibling files):

| Topic | File |
|---|---|
| The pop-ups' own content, chrome and copy | `06-POPUPS.md` |
| The grid, its 3-dots menu, the paid toggle, `btn_Capex_Cost_Reload_PCF_After_Mutation_Code`, the standard-contract creation button | `07-FUNCTIONAL-SCREEN-AND-GRID.md` |
| Every `loc*` / `col*` variable in full | `10-COLLECTIONS-VARIABLES.md` |
| Table and column inventory | `11-DATAVERSE-TABLES.md` |
| Layout, colours, typography, Tosca identities | `02`–`05` |

### Canvas source read (`ProjectDocs/_extracted/msapp/projectcosts/Src/`)

| Lines (`Capex Costs Screen.pa.yaml`) | What |
|---|---|
| L10249–10369 | panel root, header, ✕ icon |
| L10370–12503 | left column: every form field |
| L12504–17483 | right column: `gal_IndividualCost_Items_1`, year cards, the 12 month inputs (`…FirstMonth_24` … `_35`) |
| L17484–18205 | footer: Save, `btn_Reset_EditCost_Controls`, `btn_SaveCost_Execute____`, `btn_Right_Panel_Add_Contract_Calculate_Allocated_Cost`, Cancel |
| L3233–3563, L7278–7420 | who opens the panel: the command-bar dropdown and `DevexCapexSummaryPCF.OnChange` |
| L19136–19579 | `tmr_Capex_Cost_Cost_EnrichLoader` (fills the month gallery on Edit) |
| L19580–19741 | `tmr_Load_Contract_Gallery_Warmup` (builds the panel on open) |
| L19760–19834 | `cmp_ShowErrorInContract` (the in-panel error strip) |
| L19884–20177 | `cmp_PopUp_Confirmation_For_SetClusterLinkingConfirmationPopup` (`OnConfirm` and `OnCancel` only) |

Also read:

- `Components/fn_Numeric.pa.yaml` (the whole file);
- `App.pa.yaml` L161–187 (`colDistributionFrequency`) and `OnStart` L205 (`colContractDistributionTypes`, `colContractDistributionScheme`, `colCostPaidType`).

**Two single-line formulas.** The Save button's `OnSelect` (**L17574**, 91 256 characters) and
`btn_SaveCost_Execute____.OnChange` (**L17687**, 90 960 characters) are each stored as one escaped
YAML string. They were unescaped to plain text for reading. A citation such as **"L17574 ⟨x723⟩"**
means line 723 of the unescaped `OnSelect`. The unescaped Save `OnSelect` is 1 918 lines long.

### Code app read (`ProjectCosts-CodeApp/src/`)

- **The feature:** `features/cost/capex-costs/` — `Screen.tsx` (panel part), `rules.ts`, `panelRules.ts`, `writeSet.ts`, `distribution.ts`, `clusters.ts`, `standardContracts.ts`.
- **The hook:** `features/cost/costing/useCostBook.ts` (`useCapexWrites`) and `model.ts`.
- **Data:** `data/capexWrites.ts`, `data/comments.ts` (`deleteComment`), `data/costBook.ts` (`loadPayerDefaults`, `resolvePayer`), `data/executePlan.ts`, `data/writePlan.ts`, `data/concurrency.ts`.
- **Components:** `components/CanvasFields.tsx`, `FormPanel.tsx`, `standardValue.ts`, `discardGuard.tsx`.
- **Domain:** `domain/numeric.ts`. `domain/numberInput.ts`, `costStandards.ts` and `contractStandards.ts` were checked: **this panel imports none of them.**
- **Tests:** `rules.test.ts`, `panelRules.test.ts`, `writeSet.test.ts`, `distribution.test.ts`, `clusters.test.ts`, `Screen.test.tsx`, `data/capexWrites.test.ts`.

---

## 2. Canvas implementation

### 2.1 Opening the panel, and its modes

**Visibility.** The panel is one overlay container:

```
con_cost_RightPanel_Form_AddContract.Visible = locIsVisibleRightPanelAddContract   (L10263)
```

- It has a `Fill: RGBA(0,0,0,0.3)` scrim (L10255).
- It has no `OnSelect`, so clicking the scrim does nothing (inferred).
- The white body is `Width: Min(750, Parent.Width)` (L10280–10282).

Exactly four places set `locIsVisibleRightPanelAddContract: true`:

| # | Where | Trigger | Mode |
|---|---|---|---|
| 1 | `DevexCapexSummaryPCF.OnChange` L7295–7322 | `Self.AddTriggered` (PCF "Add" on a sub-account row) | **Add** |
| 2 | `DevexCapexSummaryPCF.OnChange` L7323–7359 | `Self.EditTriggered` (PCF "Edit" on a contract row) | **Edit** |
| 3 | command-bar `OnSelect` L3413–3479, `"addContract"` | menu item "Add New Cost" | **Add** |
| 4 | command-bar `OnSelect` L3481–3556, `"editProjectCostsInSubaccount"` | menu item "Edit" | **Edit** |

Before any of these, `OnChange` sets `locSelectedCostRow` to the clicked grid row and clears
`locMilestoneRelinkResetNeeded`, `locClusterLinkageChanged` and `locCostPaidByChanged` (L7279–7294).
The menu gates are owned by `07`:

- "Add New Cost" requires `!locSelectedCostRow.IsContract`;
- "Edit" requires `locSelectedCostRow.IsContract` (L3149–3196).

**Add** (L7297–7321) sets:

- `locShowClusterLinkageConfirmation: false`, `locClusterLinkageChanged: false`, `locContinueToSavelinkedCluster: true`, `locCostPaidByChanged: false`;
- `locInitialCostPaidBy: Coalesce(locSelectedProjectContract.'Cost Type', LookUp('SPVDevCo Mapping Capex Devexes', 'Name (Sub-Account)'.'CAPEX Account List' = locSelectedCostRow.vsb_capexaccountlistid).'DevCo/SPV')` (L7303–7309);
- then `locIsVisibleRightPanelAddContract: true, locPanelReady: false, locWarmupMode: "addContract", locWarmupKick: true, locAllYearsCost: Blank(), locSelectedContractDescription: Blank()`.

**Edit** (L7324–7358) opens the panel, then sets:

- `locTempContract = LookUp(colCapexProjectContracts, 'CAPEX Project Contract' = locSelectedCostRow.vsb_capexaccountlistid)`;
- the same four flags, with `locInitialCostPaidBy: Coalesce(locTempContract.'Cost Type', <mapping>)`;
- `locSelectedProjectContract: locTempContract, locSelectedContractDescription: locSelectedCostRow.vsb_costdescription, locPanelReady: false, locWarmupMode: "edit", locWarmupKick: true, locAllYearsCost: locTempContract.'Total Cost'`.

The command-bar branches (3, 4) also re-read the project with `LookUp(Projects, Project = gblSelectedProject.Project)`
and recompute `locProjectStartClusterNo` from `'Start Cluster'`, mapping Greenfield→0 … Cluster 6→6
(L3414–3454, L3482–3522). The PCF branches do not.

**"Add from standard contract" does not open the panel.** Both the PCF trigger
`AddStandardContractTriggered` (L7360–7417) and the menu items `addStandardContract` /
`AddStandardContractWithDesc` (L3238–3412) `Select(btn_Capex_Cost_Add_Standard_Contract_Code)`
(L18223). That button patches the contract (`'Is Standard Contract?': …Ja`, L18698) and its costs
directly, then `Select(btn_Capex_Cost_Reload_PCF_After_Mutation_Code)` (L18903). Detail is in `07`.

The panel's third mode is therefore **Edit on a standard contract**: a contract row with
`locSelectedCostRow.IsStandardContract = true`. Every field that carries the standard pair renders
blue and italic (§2.2.11), and any edit clears the flag (§2.2.12).

**`tmr_Load_Contract_Gallery_Warmup`** (L19580–19741) has `AutoStart: =locWarmupKick`,
`Duration: 1`. Its `OnTimerEnd`:

1. Sets `locWarmupKick: false, locStartBinding: false`, then `Select(btn_Reset_EditCost_Controls)` (L19592), which re-applies every field's Default.
2. Computes the year window (L19594–19630):
   - `varCostStartDate = Coalesce(If(locProjectStartClusterNo > 0, 'Acquisition date', 'Project Start Date'), 'Project Start Date', 'Acquisition date', Today())`;
   - `varCostEndDate = Coalesce('Operations start date (COD)', 'End Date', '5-Construction', Today())`;
   - `locCostAllowedStartDate = Date(Year(varCostStartDate), 1, 1)`;
   - `locProjectDuration = Year(varCostEndDate) - Year(varCostStartDate) + 4`, with an older `Max(…,15)` commented out (not live);
   - `locProjectStartyear = Year(varCostStartDate) - 1`.

   The gallery therefore lists the years **Year(costStart) … Year(costEnd)+3**.
3. Rebuilds `colNewEditPanelCost` (L19632–19671): one row per year, `IsFolded: true`, `IsValid: true`, and all `JanUI…DecUI`, `JanSave…DecSave`, `TotalUI`, `TotalSave` set to `0`.
4. Branches on `locWarmupMode` (L19672–19731):
   - `"addContract"` blanks `locSelectedProjectContract`, `locClusterRecord`, `locDistributionDatesRecord`, `locAllYearsCost` and `locSelectedContractDescription`, then `Reset(drp_AddContract_RightPanel_PaymentFrequency_1)`.
   - `"edit"` sets `locAllYearsCost = Coalesce(contract.'Total Cost', Sum(costs of contract))` and `locEditSaveButtonEnabled: false`. It parses `First(ParseJSON('By Cluster JSON'))` into `locClusterRecord {Cluster1..5}` and `First(ParseJSON('By Start & End Date JSON'))` into `locDistributionDatesRecord {StartDate, EndDate}`.
5. Sets `locPanelReady: true, locStartBinding: true` (L19733–19738).

**`tmr_Capex_Cost_Cost_EnrichLoader`** (L19136–19579) has `AutoStart: =locStartBinding`,
`Duration: 100`. It refills `colNewEditPanelCost` from `colCapexCosts` for the contract
(L19159–19574). Per month:

- **`% Values` contracts:** `JanUI = Round(mJan / 'Total Cost' * 100, 1)`, so the boxes show **percent**.
- **Otherwise:** `JanUI = Round(mJan, 0)`.

`Save` fields hold the absolute amounts, and `TotalUI` / `TotalSave` are summed (L19239–19566).
In Add mode `locSelectedCostRow.vsb_capexaccountlistid` is a sub-account id, so no cost matches and
the months stay empty (inferred).

`gal_IndividualCost_Items_1.Visible = locPanelReady` (L12551). The year gallery is hidden until the
warm-up finishes.

**What each mode pre-fills:**

| Field | Add | Edit (incl. standard) |
|---|---|---|
| Title | `"Add Costs - " & locSelectedCostRow.vsb_name` (the sub-account) | `"Edit Costs - " & locSelectedProjectContract.Account.Name` (L10310–10315) |
| Description | blank | `locSelectedCostRow.vsb_costdescription` |
| Distribution | `First(Choices('Distribution Type'))` | stored `Distribution` |
| Distribution Scheme | `First(colContractDistributionScheme)` if Individual, else blank | stored scheme |
| Equal Distribution | "By Cluster" | from the stored JSON |
| Total Costs | blank | `Coalesce('Total Cost', Sum(costs))` |
| Clusters | unticked | stored JSON, gated by the start cluster |
| Start/End | blank | stored JSON |
| Frequency | "1 month" | stored, else "1 month" |
| Link to Milestone | "None" | stored `'Linked Cluster'`, else "None" |
| Cost Paid By | the SPVDevCo mapping for the sub-account | stored `'Cost Type'`, else the mapping |
| Apply VAT / Depreciation | `true` / `true` | stored |
| Month boxes | `0` (screenshot `Cost App - Edit Contract - Year Cost Inputs.png` shows `0`) | stored, in % for `% Values` |

### 2.2 Every field, in on-screen order

All fields sit in `con_GeneratorData_RightPanel_Form_PvModuleType_Fields_3` (L10391). The column
height is
`If(IsBlank(DistributionType), 444, DistributionType = Equal, 988, 700)` (L10399–10400). Required
stars are `lbl_…_Asterisk_N` with `Text: "*"`, `Color: gblAppColors.Error`.

The standard-contract **"flag-clearing block"** below is shared, word for word, by nine controls:

```powerfx
If(
    locStandardContractChanged && locSelectedCostRow.IsStandardContract,
    UpdateContext({
        locIsStandardContractOriginal: locSelectedCostRow.IsStandardContract,
        locSelectedCostRow: Patch(locSelectedCostRow, {IsStandardContract: false}),
        locSelectedContractDescription: Trim(Substitute(txt_AddContract_RightPanel_Description_1.Value, "Standard", ""))
    });
    Reset(txt_AddContract_RightPanel_Description_1)
)
```

#### 2.2.1 Description — `txt_AddContract_RightPanel_Description_1` (TextInput, L10469)

- **Caption:** `"Description"` (L10517). **Required:** yes, the star at L10521 has no `Visible`, so it always shows.
- **AccessibleLabel:** `"txt_AddContract_RightPanel_Description_1"`. **MaxLength:** 512. **Placeholder:** none.
- **Value:** `locSelectedContractDescription`. The older `locSelectedCostRow.vsb_costdescription` binding is commented out (not live) (L10506–10508).
- **Standard pair:** `FontColor: If(locSelectedCostRow.IsStandardContract, themePrimary)`, `FontItalic: locSelectedCostRow.IsStandardContract` (L10475–10476).
- **OnChange:** sets `locEditSaveButtonEnabled: true, locStandardContractChanged: true`, then runs the flag-clearing block (L10478–10504).
- **Validation:** `lbl_GeneratorData_RightPanel_Form_PvModuleType_Fields_Label_ErrorMessage_2` (L10439). Its `Text`:
  - `$"The term ""Standard"" is applicable only for system-prefilled contracts."` when `Find("standard", Lower(value))` is non-blank;
  - otherwise `"There cannot be two contracts with the same name under the same sub-account"` when `CountIf(colCapexProjectContracts, Account.'CAPEX Account List' = If(IsContract, vsb_parentaccountid, vsb_capexaccountlistid), Lower(Trim(Name)) = Lower(Trim(value))) > 0`.
- **`Visible`:** `And(Not(Lower(Trim(value)) = Lower(Trim(locSelectedContractDescription))), <duplicate> || <contains "standard">)` (L10446–10465). An unchanged name never flags.
- **Effect on Save:** an empty description, or a visible error, disables Save (L17513, L17515).

#### 2.2.2 Distribution — `rad_AddContract_RightPanel_DistributionType_1` (Radio, L10592)

- **Caption:** `"Distribution"` (L10576). The star at L10581 is `Visible: false`, so it is **not shown**.
- **Items:** `colContractDistributionTypes` = `Choices('Distribution Type')` (`App.OnStart`). Two literal and `Choices` alternatives are commented out (not live) (L10614–10617).
- **DefaultSelectedItems:** `Coalesce(LookUp(Choices('Distribution Type'), Value = <contract>.Distribution), First(Choices('Distribution Type')))` (L10596–10611).
- **DisplayMode:** `If(Not(locSelectedCostRow.IsContract), Edit, View)` (L10612). It locks on an existing contract.
- **OnChange:**
  - the twelve month `Reset`s are commented out (not live);
  - live: `Reset(rad_…DistributionScheme_1); Reset(rad_…DistributionBy_1);`;
  - then `ClearCollect(colNewEditPanelCost, ForAll(Sequence(locProjectDuration), {Year, IsFolded: true, Jan: Blank() … Dec: Blank(), IsValid: true}))`, which **wipes every typed month** (L10619–10659).

  This rebuild uses the column names `Jan…Dec`, not `JanUI…`, so after a type switch the month boxes (bound to `ThisItem.JanUI`) read blank (inferred).

#### 2.2.3 Distribution Scheme — `rad_AddContract_RightPanel_DistributionScheme_1` (Radio, L10727)

- **Container:** `Visible` only for Individual (L10677). **Caption:** `"Distribution Scheme"` (L10712). **Required:** star shown (L10717).
- **Items:** `colContractDistributionScheme` = `Choices('Distribution Scheme')`. The option order is `% Values` (952850000), then `Absolute Values` (952850001), taken from the generated model; that Choices order follows option order is inferred.
- **DefaultSelectedItems** (L10731–10751):
  - stored `'% Values'` → `First(colContractDistributionScheme)`;
  - stored `'Absolute Values'` → `Last(colContractDistributionScheme)`;
  - no contract and Individual → `First(…)` = **% Values** (inferred).
- **DisplayMode:** same lock as Distribution (L10752).
- **OnChange:** the same blank `ClearCollect(colNewEditPanelCost, …)`, which wipes typed months (L10756–10779).

#### 2.2.4 Equal Distribution — `rad_AddContract_RightPanel_DistributionBy_1` (Radio, L10846)

- **Container:** `Visible` for Equal. A `&& Not(IsContract)` clause is commented out (not live) (L10797–10799). **Caption:** `"Equal Distribution"` (L10831). **Required:** star shown.
- **Items:** `["By Cluster","By Start and End Date"]` (L10868).
- **Default:** "By Cluster" if any `locClusterRecord.ClusterN` is true; else "By Start and End Date" if `StartDate & EndDate` is non-blank; else "By Cluster" (L10850–10863).
- **DisplayMode:** the `IsContract` lock is commented out (not live). Live is `DisplayMode.Edit` (L10864).
- **Standard pair:** yes (L10865–10866).
- **OnChange** (L10870–10907):
  - `Reset` both date boxes and all five cluster checkboxes;
  - set `locClusterRecord: Blank(), locDistributionDatesRecord: Blank(), locEditSaveButtonEnabled: true, locChangedDistribution: true, locAveragePaymentCost: Blank(), locStandardContractChanged: true`;
  - run the flag-clearing block.

#### 2.2.5 Total Costs — `txt_AddContract_RightPanel_TotalCost_1` (TextInput, L10961)

- **Container:** `Visible: Not(Individual && Absolute Values)` (L10925). **Caption:** `"Total Costs [" & Coalesce-ish(ISO code, "EUR") & "]"` (L11016). **Required:** the star follows the same condition (L11027).
- **AccessibleLabel:** `"txt_AddContract_RightPanel_TotalCost_1"`. **Appearance:** `FilledDarker`. **MaxLength:** 512. **Placeholder:** none.
- **Value:** `locAllYearsCost` (L11008).
- **DisplayMode:** an `IsContract` lock is commented out (not live). Live is `If(Absolute && Individual, View, Edit)` (L10968–10980), which is unreachable while the container hides it in exactly that case.
- **Standard pair:** yes (L10981–10982).
- **OnChange:** `locEditSaveButtonEnabled: true, loctotalCostChanged: true, locStandardContractChanged: true`, then the flag-clearing block (L10984–11006).
- **Validation:** `lbl_AddContract_RightPanel_TotalCost_ErrorMessage_1` (L10928).
  - `Text` (L10937): Poland → `"Value must be between 0 and " & If(Lower(First(Split(Language(),"-")).Value)="en", "2,250,000,000", "2.250.000.000")`; otherwise `"500,000,000"` / `"500.000.000"`. There is **no full stop**.
  - `Visible` (L10938–10956): `And(Not(IsBlank(v)), Or(Not(fn_Numeric_CC.IsInteger(v)), Not(fn_Numeric_CC.InRange(v, 1, Poland ? 2250000000 : 500000000))), container.Visible)`. The tested lower bound is **1**, while the message says 0.
  - `Color` is `Warning` for Individual+Absolute, else `Error` (L10931–10934).

#### 2.2.6 Select Cluster — `chk_AddContract_RightPanel_SelectCluster1_1` … `5_1` (CheckBox, L11097–11344)

- **Container:** `con_…_Label_18` (L11031). `Visible: Equal && (DistributionBy = "By Cluster" || Or(locClusterRecord.Cluster1..5))`. A `&& Not(IsContract)` clause is commented out (not live) (L11044–11052). **Caption:** `"Select Cluster"` (L11071). **Required:** star shown.
- **Labels, verbatim:**
  - `"Cluster 1: Feasibility Studies"`
  - `"Cluster 2: Pre-Permitting"`
  - `"	Cluster 3: Permitting"`. **Note the leading TAB character**, inside the string (L11215).
  - `"Cluster 4: Pre-Construction"`
  - `"Cluster 5: Construction"`
- **AccessibleLabel:** the control name, e.g. `"chk_AddContract_RightPanel_SelectCluster1_1"`.
- **Checked:** `Coalesce(locClusterRecord.ClusterN, false) && Coalesce(locProjectStartClusterNo, 0) <= N`.
- **DisplayMode:** `If(Coalesce(locProjectStartClusterNo,0) <= N, Edit, Disabled)`.
- **Standard pair:** yes.
- **OnSelect:** `locClusterChanged: true, locEditSaveButtonEnabled: true, locStandardContractChanged: true`, then the flag-clearing block. `OnCheck` / `OnUncheck` are empty.

#### 2.2.7 Link to Milestone — `drp_Add_Edit_Cost_Data_RightPanel_Form_Link_to_Cluster` (DropDown, L11399)

- **Container:** `Visible: Or(Individual, And(Equal, DistributionBy = "By Start and End Date"))` (L11359–11366). **Caption:** `"Link to Milestone"` (L11385). **Required:** star shown (L11389). The error label `…Link_to_Cluster_Label_ErrorMessage` has `Text: =` (empty).
- **AccessibleLabel:** the control name. **Display field:** `vsb_name` (L11506–11514).
- **Items** (L11412–11449): `Ungroup(Table({vsb_name:"None"}, Sort(Filter('Project States', Order in [1..6] && Order > gblSelectedProject.'Cluster State'.Order && Order >= Max(1, varStartClusterNo)), Order)), Name)`. Here `varStartClusterNo = Coalesce(locProjectStartClusterNo, Switch('Start Cluster', …))`.
- **DefaultSelectedItems:** `Coalesce(LookUp(colCapexProjectContracts, …).'Linked Cluster', {vsb_name:"None"})` (L11404–11411).
- **OnChange** (L11450–11501):
  - `locChangedFrequency: true` (so it forces an equal-distribution regeneration);
  - `locEditSaveButtonEnabled: true, locStandardContractChanged: true`;
  - `locClusterLinkageChanged: And(Selected.Name <> "None", Selected.Name <> locSelectedProjectContract.'Linked Cluster'.Name)`;
  - `locContinueToSavelinkedCluster: If(<same>, false, true)`;
  - `locMilestoneRelinkResetNeeded: And(Self.Selected.Name <> "None", Self.Selected.Name <> <stored>.Name, Or(CountRows(Filter('CAPEX Costs', Contract.'CAPEX Project Contract' = locSelectedCostRow.vsb_capexaccountlistid && 'Cost Paid' = true)) > 0))`. This is a **live server query**, with **no comment clause**;
  - then the flag-clearing block.

#### 2.2.8 Start / End Date Distribution — `txt_AddContract_RightPanel_StartDate_1` (L11666) / `…EndDate_1` (L11752)

- **Containers:** `Visible: DistributionBy = "By Start and End Date" && Equal` (L11532, L11717).
- **Captions:** `"Start Date Distribution"` (L11689), `"End Date Distribution"` (L11775). **Required:** both stars shown. **Placeholder:** `"MM/YYYY"`.
- **AccessibleLabel:** the control names.
- **Value:** `locDistributionDatesRecord.StartDate` / `.EndDate`. These are **free text**, persisted as `MM/YYYY` strings inside `'By Start & End Date JSON'` (an nvarchar column). It is the same class of decision as **D7**: dates as text, not Dataverse date columns.
- **DisplayMode:** the `IsContract` lock is commented out (not live). Live is `Edit`.
- **OnChange:** `locEditSaveButtonEnabled: true, locChangedByDate: true`. There is **no** standard flag-clearing here.
- **Start validation** (L11543–11662). The live formula is below; an older "must take place after the milestone Project Start" version is commented out (not live).

  ```powerfx
  If(Not(IsMatch(v, "^(0[1-9]|1[0-2])/[0-9]{4}$")), "Date must be in MM/YYYY format",
     If(Date(yyyy, mm, 1) < locCostAllowedStartDate,
        "Start Date must be in or after " & Text(locCostAllowedStartDate, "mm/yyyy")))
  ```

  `Visible = And(Not(IsBlank(v)), Or(<bad format>, <before allowed start>))`.
- **End validation** (L11728–11747). The message is `"Date must be in MM/YYYY format"`, or `"End Date must take place after Start Date"` when both match and `DateValue("01/"&Start) >= DateValue("01/"&End)`. `Visible` applies the same tests and requires a non-blank value.

#### 2.2.9 Distribution Frequency — `drp_AddContract_RightPanel_PaymentFrequency_1` (DropDown, L11838)

- **Container:** `Visible: Equal` (L11803). **Caption:** `"Distribution Frequency"` (L11824). **Required:** star shown.
- **Items:** `colDistributionFrequency` (`App.pa.yaml` L161–187): `1 month, 2 months, 3 months, 6 months, 12 months` (values 1/2/3/6/12). **Display field:** `Label`.
- **Default:** `Coalesce(LookUp(colDistributionFrequency, Value = <contract>.'Distribution Frequency'), {ID:1, Label:"1 month", Value:1})`.
- **OnChange:** `locChangedFrequency: true, locEditSaveButtonEnabled: true, locStandardContractChanged: true`, then the flag-clearing block.

#### 2.2.10 Average Amount per Payment — `txt_AddContract_RightPanel_AverageAmountPerPayment_1` (L11925)

- **Container:** `Visible: Equal`. **Caption:** `"Average Amount per Payment [" & ISO-or-EUR & "]"` (L12154). The star is `Visible: false`. **DisplayMode:** `Disabled`.
- **Value** (L11935–12145), **By Cluster:** with a total, no total error, at least one cluster ticked and a frequency set, it builds the five cluster windows (`'1-Feasibility studies'` … `DateAdd(next, -1, Months)`), filtered to the ticked clusters. For each window, `numPayments = RoundDown(((ey-sy)*12 + (em-sm)) / Max(Coalesce(freq,1),1), 0) + 1`. The counts are summed with **no de-duplication**, and the box shows `Text(total / locNumPayments, "########0.0#")`. This is a **plain division to two decimals, not `RoundDown`**.
- **Value, By Start and End Date:** blank on any missing or invalid input. Otherwise `Text(total / Max(Coalesce(RoundDown(span/freq,0)+1, 1), 1), "########0.0#")`.
- **Warning label:** `lbl_…_ErrorMessage_15` (`"Average Amount will be (re)calculated upon saving."`, Warning colour) is `Visible: false` (L11917–11920). It is dead.

#### 2.2.11 Cost Paid By (DevCo/SPV) — `rad_AddContract_RightPanel_CostPaidBy_1` (Radio, L12230)

- **Caption:** `"Cost Paid By"` (L12214). The star is `Visible: false`.
- **Items:** `colCostPaidType` = `LastN(Choices('Cost paid type'), 2)`, i.e. **DevCo, SPV**. "None" is dropped.
- **Default** (L12234–12254): `Coalesce(LookUp(Choices, Value = <contract>.'Cost Type'), LookUp(Choices, Value = LookUp('SPVDevCo Mapping Capex Devexes', 'Name (Sub-Account)'.'CAPEX Account List' = locSelectedCostRow.vsb_capexaccountlistid).'DevCo/SPV'))`. A `colCapexCosts` alternative is commented out (not live).
- **Standard pair:** yes (L12255–12256).
- **OnChange** (L12260–12292): `locEditSaveButtonEnabled`, `locStandardContractChanged`, the flag-clearing block, then:
  - `locCostPaidByChanged: locInitialCostPaidBy <> Self.Selected.Value`;
  - `locContinueToSavelinkedCluster: !(…)`.

  In **Add** mode `locInitialCostPaidBy` is the mapping value (§2.1), so moving off it in Add **also** sets `locCostPaidByChanged`.

#### 2.2.12 Apply VAT / Depreciation — `tgl_AddContract_RightPanel_ApplyVAT_1` (L12322), `tgl_…_Depreciation_1` (L12382)

- **Labels:** `"Apply VAT"`, `"Depreciation"`. `LabelPosition: Before`. **AccessibleLabel:** not set.
- **Checked:** `If(!IsContract, true, <contract>.'Apply VAT?')`, and likewise `'Depreciation?'`.
- **Standard pair:** yes.
- **OnSelect:** `locEditSaveButtonEnabled: true, locStandardContractChanged: true`, then the flag-clearing block.

**Rule 20 summary.** The standard pair (`FontColor themePrimary` + `FontItalic`, condition
`locSelectedCostRow.IsStandardContract`) is on:

- Description (L10475);
- Equal Distribution (L10865);
- Total Costs (L10981);
- the 5 cluster checkboxes (L11111 …);
- Cost Paid By (L12255);
- Apply VAT (L12334);
- Depreciation (L12394).

The flag-clearing block runs on 9 controls: Description, Equal Distribution, Total Costs, clusters,
Link to Milestone, Frequency, Cost Paid By, Apply VAT and Depreciation. It does **not** run on the
two date boxes, Distribution, Distribution Scheme or the month inputs.

#### 2.2.13 PCF-edit warning — `con_Warning_OnEditFromPCF` (L12426)

- **`Visible`:** `And('Is Edited from PCF?' = Yes, 'Initial Contract Source' = Powerapps, Not(IsBlank(locSelectedProjectContract)))`. Two further clauses are commented out (not live) (L12444–12451).
- **Fill:** orange `RGBA(245,145,30,0.5)`, with the `warning` image.
- **Text:** `html_Warning_OnEditFromPCF.HtmlText = "<b>Warning:</b> Distribution scheme changed to absolute values due to edits in the spreadsheet component."` (L12492). A `txt_…` twin is `Visible: false`.

#### 2.2.14 Year gallery and month cost inputs (right column, L12504–17483)

- **Gallery:** `gal_IndividualCost_Items_1.Items = colNewEditPanelCost`, `Visible: locPanelReady`, `TemplateSize: 42`, `Width: 400`.
- **Card header:**
  - the year (`ThisItem.Year`, bold);
  - `lbl_Production_CardHeader_LabelWithDescription_4.Text = $"Allocated Cost: {If(scheme = '% Values', Round(TotalUI,1) & " %", Round(TotalSave,0) & " " & Coalesce(ISO,"EUR"))}"` (L13211–13225).

  `TotalUI` / `TotalSave` are only refreshed by the ▲ collapse, by Recalculate and by Save. They do **not** update as you type (the per-month `UpdateIf` is commented out (not live)).
- **▼ `ico_Production_CardHeader_Down_3.OnSelect`:** `UpdateIf(colNewEditPanelCost, Year = ThisItem.Year, {IsFolded: false})` (L12706). Several years can be open at once.
- **▲ `ico_Production_CardHeader_Up_3.OnSelect`** (L12738–13174): the plain fold is commented out (not live). The live code runs the Recalculate maths (§2.3.3) **for this one year** and sets `IsFolded: true`.
- **Month inputs:** 12 `TextInput`s per year, `txt_Costs_RightPanel_EditCostsInSubaccount_BodyContent_FirstMonth_24` (Jan) … `_35` (Dec).
  - Labels: `="January "&ThisItem.Year` … `="December "&ThisItem.Year` (L13652 … L17480).
  - AccessibleLabel: the label text.
  - `Placeholder: "0.00"`; `TriggerOutput: Delayed`; `Type: Text`; `Value: ThisItem.JanUI` … `DecUI`.
  - `DisplayMode: If(Individual, Edit, View)` (L13436–13441).
  - **OnChange:** a large `UpdateIf` recalc is commented out (not live). Live is only `UpdateContext({locEditSaveButtonEnabled: true, locRangeValidation: Blank(), locContinueToSavelinkedCluster: If(And(link <> "None", link <> stored), false, true)})` (L13442–13622).
- **Month validation:** `lbl_…FirstMonth_ErrorMessage_24…35` (L13341–13427).
  - **Absolute:** non-blank and `Not(fn_Numeric_CC.IsInteger(v))` → `$"Value must be a numeric"`; `IsNumeric(v) && Not(InRange(v, 0, Poland?2250000000:500000000))` → `$"Value must be between 0 and {If(Poland, 2250000000, 500000000)}."`. That is a **number interpolated without grouping**, e.g. "…0 and 500000000.".
  - **%:** `Not(IsOneDecimal(v))` → `$"Value must be numeric upto one decimal"`; `Not(InRange(v,0,100))` → `$"Value must be between 0 and 100."`.
  - These labels only resize their row (`If(…Visible, LabelBeforeHeight+12, LabelBeforeHeightErr)`). **No Save or Recalculate DisplayMode reads them.**

#### 2.2.15 `fn_Numeric` (`Components/fn_Numeric.pa.yaml`)

| Function | Definition |
|---|---|
| `IsInteger(c)` | `IsNumeric(c) && Not(IsMatch(c, "[.,]", Contains))` (L92–102) |
| `InRange(c, min, max)` | `IsNumeric(c) && min <= Value(c) <= max` (L84–91) |
| `IsOneDecimal(c)` | `Language()` "en" → `IsMatch(c, "^((\+?)?\d+(|\.\d{0,1})?)")`, else the same with `,`. `IsMatch` is a complete match by default, so a negative fails (L115–139) |

### 2.3 The Save path

#### 2.3.1 Save `DisplayMode` — `btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Save` (Button, L17506)

`Text: "Save"`, `Icon: "Checkmark"`, `FontSize: 15`. **Enabled** when all of these hold (L17509–17569):

- `Not(IsBlank(Description))`;
- `Not(TotalCost error visible)` and `Not(Description error visible)`;
- `Not(IsBlank(DistributionType))`;
- **Individual + %:** Total non-blank and a scheme is chosen;
- **Individual + Absolute:** a scheme is chosen;
- **Equal:**
  - By Cluster: at least one cluster `Checked && DisplayMode = Edit`;
  - By Dates: both dates non-blank and neither date error visible;
  - and, either way, a frequency is chosen and the Total is non-blank;
- **`locEditSaveButtonEnabled`**, the dirty flag. Edit sets it `false` on open (L19700); every control's `OnChange` sets it `true`.

A `Not(cmp_ShowErrorInContract.Visible)` clause and a sum = 100 / sum = Total block are both
commented out (not live) (L17512, L17549–17565). The sum check happens at **click time** instead
(§2.3.2).

#### 2.3.2 Save `OnSelect` (L17574)

A `locConfirmCostPaidByChange` / `locConfirmClusterLinkChange` preamble is commented out (not live)
(⟨1–20⟩). The live body is one `If` on the distribution type.

**A. Individual Distribution** (⟨21–1231⟩)

1. **⟨23–39⟩** Sets `locIsVisiblePopUpSpinner: true`, `locSpinnerInformationText: "Please wait, checking validation"` and `locSelectedSubAccount = Coalesce(LookUp(colCapexSubaccountsNew, …), <contract>.Account)`.
2. **⟨42–471⟩** The **Recalculate maths**, run over `gal_IndividualCost_Items_1.AllItems`, identical to §2.3.3. `ClearCollect(colNewEditPanelCost, colNewEditPanelCostProcessed)`.
3. **⟨473–486⟩** Absolute only: `locAllYearsCost = Round(Sum(colNewEditPanelCost, TotalSave), 1)`.
4. **⟨487–520⟩** `locValidCostInContract`:
   - %: `Round(Sum(TotalUI),1) = 100`;
   - Absolute: `Sum(TotalSave) > 0`.
5. **⟨522–690⟩** `colOtherClusterHavingCost = Filter(gblClusterDurations As CL, !IsEmpty(Filter(colNewEditPanelCost As C, any month with Coalesce(C.<M>Save,0) > 0 and Date(C.Year, m, 1) in [Date(CL.StartYear, CL.StartMonth,1), Date(CL.EndYear, CL.EndMonth,1)))))`. The interval is **half-open** (`< e`).
6. **⟨692–1231⟩** `If(locValidCostInContract, …, <invalid>)`:
   - **Confirmation trigger ⟨694–714⟩:** `If(Or(And(CountRows(Filter(colOtherClusterHavingCost, Order <> link.Selected.Order)) > 0, locClusterLinkageChanged), locCostPaidByChanged, locMilestoneRelinkResetNeeded), UpdateContext({locIsVisiblePopUpSpinner: false, locSpinnerInformationText: "", locShowClusterLinkageConfirmation: true}), <save>)`.
   - **Save ⟨716–733⟩:** spinner on with `"Please wait, saving the cost..."`, **`locIsVisibleRightPanelAddContract: false`** (the panel closes before any write), `locShowErrorInContractCost: false`, and `locSelectedSubAccount` recomputed.
   - **⟨734–950⟩** When `Value(Value(Total)) <> locAllYearsCost` and the scheme is %, every month's `<M>Save` is recomputed against the **typed** total: `If(!IsBlank(JanUI) && JanUI <> 0, Round(Round(Value(JanUI),1) * typedTotal / 100, 0), Blank())`, and `TotalSave` is re-summed.
   - **⟨951–1010⟩ Write 1** — `locSelectedProjectContract = Patch('CAPEX Project Contracts', If(Not(IsContract), Defaults(…), LookUp(colCapexProjectContracts, …)), {…})`. Payload:
     - `Account: locSelectedSubAccount`;
     - `Name` and `Description`: both the Description box;
     - `Distribution`;
     - `Project: gblSelectedProject`;
     - `'Distribution Scheme'`: Absolute / % / default Absolute;
     - `'Total Cost': Coalesce(Value(Total), locAllYearsCost)`;
     - `'Apply VAT?'` / `'Depreciation?'`: Yes/No;
     - `'Cost Type'`: the radio;
     - **`'Owning Business Unit': gblSelectedProject.'Besitzer (Unternehmenseinheit)'`**;
     - `'Initial Contract Source': Coalesce(<existing>, Powerapps)`;
     - `'Is Standard Contract?': locSelectedCostRow.IsStandardContract`;
     - `'Capex Standard Assumption Contract': If(IsStandardContract, Blank())`. That is Blank on **both** arms, so the lookup is cleared on every save (inferred);
     - `'Linked Cluster': If(Selected.Name <> "None", Selected, Blank())`.

     It is **not** wrapped in `IfError`. It writes no `'Distribution Frequency'`, `'Average Payment'` or JSON columns. It also sets `locDistributionSchemeByPercentage`.
   - **⟨1011–1093⟩** `colCapexEditContract` holds 12 rows per year: `{Contract, Cost: <M>Save, Year, Month: [@Month].<M>}`.
   - **⟨1094–1118⟩** `colCapexFinalDataToPatch` gives each row `'CAPEX Cost'` = the existing `colCapexCosts` row (matched on contract, year and month), else `Defaults('CAPEX Costs')`.
   - **⟨1119–1156⟩ Write 2** — `IfError(Patch('CAPEX Costs', ForAll(Filter(colCapexFinalDataToPatch, And(Not(IsBlank(Cost)), Or(Cost <> 0, Not(IsBlank('CAPEX Cost'.'CAPEX Cost'))))), {Contract, 'CAPEX Cost', Cost, Month, Year, 'Owning Business Unit'})), Trace("Error While Trying to Patch Data to Capex Cost: " & Concat(AllErrors, Message, ", "), Error); Notify("Something went wrong saving the Capex data. Please refresh the page and verify your changes were saved correctly.", Error, 5000))`. A typed 0 on a new month creates no row; a 0 on an existing row updates it.
   - **⟨1157–1170⟩ Write 3** — `colCapexToDelete = Filter(…, IsBlank(Cost) && !IsBlank('CAPEX Cost'.'CAPEX Cost'))`; `ForAll(colCapexToDelete As D, Remove('CAPEX Costs', D.'CAPEX Cost'))`. This is **not** wrapped in `IfError`.
   - **⟨1171–1220⟩ Refresh and reset:**
     - set `locSelectedCapexAccountCategory: tab_….Selected` and `locSelectedCostRow: Blank()`; clear `locShowInActive`, `locChangedByDate`, `locChangedDistribution`, `locClusterChanged` and `locChangedFrequency`;
     - **`Select(btn_Capex_Cost_Reload_PCF_After_Mutation_Code)`**;
     - spinner off;
     - `Concurrent(Reset(...17 controls))`;
     - blank `locAllYearsCost`, `locSelectedContractDescription`, `locSelectedCostRow` and `locSelectedProjectContract`;
     - `Clear(colOtherClusterHavingCost)`.

     `loctotalCostChanged` is never reset.
   - **Invalid ⟨1224–1230⟩:** a `Notify("false run")` is commented out (not live). Live: spinner off, `locShowErrorInContractCost: true`, which shows `cmp_ShowErrorInContract` (§2.4).

**B. Equal Distribution** (⟨1233–1917⟩)

1. **⟨1234–1250⟩** Spinner on with `"Please wait, checking validations"` (plural); set `locSelectedSubAccount`.
2. **⟨1251–1358⟩** `colSelectedClusters`:
   - By Cluster: the 5 cluster windows as `MM/YYYY` text (`Start: Text(milestone, "[$-en-US]mm/yyyy")`, `End: Text(DateAdd(next, -1, Months), …)`), filtered by `ChkN.Checked`;
   - By Dates: one row `{Cluster:1, Start: txtStart, End: txtEnd}`.
3. **⟨1359–1419⟩** `colCapexCostDataToPatch`: per cluster, `numPayments = RoundDown(Max((ey-sy)*12+(em-sm), 0) / Coalesce(freq,1), 0) + 1`; `Year = sy + RoundDown((sm-1+(i-1)*freq)/12, 0)`, `Month = Mod(sm-1+(i-1)*freq, 12)+1`.
4. **⟨1421–1463⟩** `colOtherClusterHavingCost`: clusters in `gblClusterDurations` containing any scheduled month. The interval is **inclusive** (`m <= em`). Any scheduled month counts, not only a positive amount.
5. **⟨1466–1487⟩** The same confirmation trigger as A.
6. **⟨1488–1494⟩** Spinner `"Please wait, saving costs..."` (plural); `locIsVisibleRightPanelAddContract: false`.
7. **⟨1495–1578⟩ Write 1** — `Patch('CAPEX Project Contracts', Defaults | existing, {…})`. Payload:
   - `Account`, `Name`, `Distribution`, `Project`, `Description`;
   - `'Total Cost': Value(Total)`;
   - `'Apply VAT?'`, `'Depreciation?'`, `'Cost Type'`;
   - `'By Cluster JSON': JSON([{Cluster1: Chk1.Checked && Chk1.DisplayMode = Edit, … Cluster5}])`;
   - `'By Start & End Date JSON': JSON([{StartDate: txtStart, EndDate: txtEnd}])`;
   - `'Distribution Frequency'`;
   - `'Owning Business Unit'`;
   - `'Initial Contract Source': Coalesce(existing, Powerapps)`;
   - `'Is Standard Contract?'`;
   - `'Capex Standard Assumption Contract': If(…, Blank())`.

   `'Distribution Scheme'` is commented out (not live), and carries the typo `'Absolut Values'`. There is no `'Linked Cluster'` here, and no `IfError`.
8. **⟨1579–1864⟩** Only when `Or(locChangedByDate, locChangedDistribution, locChangedFrequency, locClusterChanged, loctotalCostChanged) && !IsBlank(locSelectedProjectContract)`:
   - rebuild `colSelectedClusters` and `colCapexCostDataToPatch` (as steps 2–3, now bound to the new contract);
   - **`Distinct(colCapexCostDataToPatch, ThisRecord)`** (de-duplicate);
   - `locNumPayments = CountIf(…, true)`, `locLastCost = Last(…)`;
   - **Write 2:** `RemoveIf('CAPEX Costs', Contract.'CAPEX Project Contract' = locSelectedProjectContract.'CAPEX Project Contract')`. It deletes **every** cost row of the contract (paid flags included), with no `IfError`;
   - **Write 3:** `IfError(Patch('CAPEX Costs', ForAll(colCapexCostDataToPatch As Item, {'CAPEX Cost', Contract, Name: Item.Contract.Name, Year, Cost: If(last, Total - RoundDown(Total/n,0)*(n-1), RoundDown(Total/n,0)), Month: Switch(1→[@Month].January …), 'Owning Business Unit'})), Trace(…); Notify(<same message>))`;
   - **Write 4:** `Patch('CAPEX Project Contracts', LookUp(colCapexProjectContracts, 'CAPEX Project Contract' = locSelectedCostRow.vsb_capexaccountlistid), {'Average Payment': RoundDown(Total / locNumPayments, 0), 'Linked Cluster': If(<> "None", Selected, Blank())})`, with no `IfError`. **SOURCE DEFECT (C-7):** in Add mode `locSelectedCostRow.vsb_capexaccountlistid` is the sub-account, so the `LookUp` is blank and a new contract never gets `Average Payment` or `Linked Cluster` (`01-BUGS-FOUND.md` C-7).
9. **⟨1865–1914⟩** The same refresh and reset as A.

**Error handling, both branches:**

- only the `CAPEX Costs` Patch sits in `IfError`;
- the contract Patches, `RemoveIf` and `Remove` fall through to `App.OnError`, whose `Notify` is commented out (not live), so they only set `gblReportError`;
- after any failure the code still continues, reloads the grid and resets the form.

**Half-apply.** There is no changeset. The worst case is the Equal branch: `RemoveIf` runs **before** the re-`Patch`.

#### 2.3.3 `btn_Right_Panel_Add_Contract_Calculate_Allocated_Cost` (Button, L17698–18154)

- **Text:** `"Recalculate Allocated Cost "` (with a trailing space). `Width: 220`, `BorderRadius: 5`.
- **Visible:** Individual (L18153).
- **DisplayMode:** `And(Or(Not(IsBlank(Value(Total))), And(Individual, Absolute)), locEditSaveButtonEnabled)` (L17702–17716).
- **OnSelect:** `Clear(colNewEditPanelCostProcessed)`. Then:
  - `allYearsCost = Coalesce(locSelectedProjectContract.'Total Cost', Sum(costs), Value(Total))`;
  - `isPctScheme = scheme = '% Values'`. The `contractRec`-based alternatives are commented out (not live).
- For each year row `G`:
  - `<M>UIv = If(IsBlank(box) || !IsNumeric(box), Blank(), Value(box))`;
  - `<M>Sv = If(IsBlank(UIv), Blank(), If(isPctScheme && totalCostForPct <> 0, Round(totalCostForPct * UIv / 100, 0), Round(UIv, 0)))`;
  - `TotalUI = Sum(Coalesce(UIv,0))`, `TotalSave = Sum(Coalesce(Sv,0))`.
- It ends with `ClearCollect(colNewEditPanelCost, colNewEditPanelCostProcessed)`. It sanitises and rounds; **nothing moves between months**.

The ▲ collapse icon and Save step A.2 run the same arithmetic.

#### 2.3.4 `btn_Reset_EditCost_Controls` (Button, L17576)

- `Visible: false`, `Text: "Reset"`.
- `OnSelect: Concurrent(Reset(...))` of 18 controls: Average, Frequency, Cost Paid By, Distribution By, Scheme, Type, Description, End, Start, Total, VAT, Depreciation, Cluster 1–5 and Link to Milestone. Then `UpdateContext({locClusterLinkageChanged: false})`.
- Invoked only from the warm-up timer (L19592).

#### 2.3.5 `btn_SaveCost_Execute____` (PowerCAT `Icon`, L17605–17697)

- `Visible: false`. It has a copy of the Save `DisplayMode` (L17609–17669) and an `OnChange` (L17687) that is a near-copy of the Save `OnSelect`. Its confirmation trigger is narrower: `And(link <> "None", CountRows(Filter(colOtherClusterHavingCost, Order <> sel)) > 0, !locContinueToSavelinkedCluster)`. It also filters clusters by `Cluster >= Coalesce(locProjectStartClusterNo,0)`.
- **It is dead code.** No formula in `Src/` contains `Select(btn_SaveCost_Execute____)` (searched: the control name occurs only at its own definition). A code component's `OnChange` cannot be fired by `Select()` anyway. The relink pop-up's `OnConfirm` re-selects the **visible Save button** (L20070) instead. Its writes are the same `Patch` / `RemoveIf` / `Remove` set as §2.3.2.

#### 2.3.6 Cancel and the ✕ — closing and discarding

- **Cancel:** `pcf_btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Cancel_2` (PowerCAT `Icon`, L18155). `Text: "Cancel"`, `IconName: "Cancel"`, `Width: 96`.
  - `OnChange` (L18175–18199): `UpdateContext({locIsVisibleRightPanelAddContract: false, locShowErrorInContractCost: false, locSelectedCostRow: Blank(), locAllYearsCost: Blank(), locSelectedContractDescription: "", locSelectedProjectContract: Blank()})`;
  - `Clear(colNewEditPanelCost)`;
  - `Reset` of 17 controls (all of `btn_Reset_EditCost_Controls`' except Link to Milestone).
- **✕:** `ico_GeneratorData_RightPanel_Form_PvModuleType_Header_Cancel_2` (L10317). `Tooltip: "Cancel"`.
  - `OnSelect` (L10330–10353): the same, minus `locAllYearsCost` and `locSelectedContractDescription`, and minus the VAT / Depreciation resets.
- **No discard prompt.** Both close immediately and nothing is written.

#### 2.3.7 Refresh after save

`Select(btn_Capex_Cost_Reload_PCF_After_Mutation_Code)` (§2.3.2 ⟨1182⟩, ⟨1876⟩) runs on **every**
save completion, including after a failed cost Patch. Its body is owned by `07`.

### 2.4 Confirmation pop-ups and error strip this panel raises (triggers only)

| Pop-up | Raised by | Trigger | Content owner |
|---|---|---|---|
| `cmp_PopUp_Confirmation_For_SetClusterLinkingConfirmationPopup` (L19884, `Visible: locShowClusterLinkageConfirmation` L20171) | Save `OnSelect` ⟨694–714⟩ / ⟨1466–1487⟩ | `Or(And(<money in a cluster other than the linked one>, locClusterLinkageChanged), locCostPaidByChanged, locMilestoneRelinkResetNeeded)`. The **DevCo/SPV-changed** case is `locCostPaidByChanged` (§2.2.11); **cluster linking** is `locClusterLinkageChanged` (§2.2.7); the **relink reset** is `locMilestoneRelinkResetNeeded`. | `06` |
| …its `OnConfirm` (L20040–20070) | — | Clears the flags (`locContinueToSavelinkedCluster: true`, `locIsVisibleRightPanelAddContract: false`). If `locMilestoneRelinkResetNeeded`: **`UpdateIf('CAPEX Costs', contract && 'Cost Paid' = true, {'Cost Paid': false})`** (L20055–20059). **`RemoveIf('Capex Comments', … 'Comments to payment date')` is commented out (not live)** (L20061–20065). Then `locMilestoneRelinkResetNeeded: false` ("Bug 13772"), then `Select(btn_…_Buttons_Save)`. | `06` |
| …its `OnCancel` (L20031–20039) | — | Clears the flags, `locContinueToSavelinkedCluster: false`. The panel stays open. | `06` |
| `cmp_ShowErrorInContract` (L19760, `cmp_Information_Button_PCF`) | Save `OnSelect` ⟨1224–1230⟩ | `Visible: And(locEditSaveButtonEnabled, Individual, locShowErrorInContractCost, Len(ErrorTitle) > 0)`. `ErrorTitle`: %: `"Total percentage is over 100%"` / `"Total percentage is below 100%"`; Absolute with `Sum(TotalSave)=0`: `"No cost is allocated."` | `06` |
| `cmp_Costs_PopUpLoading` (spinner) | Save `OnSelect` | the four texts in §2.3.2 | `06` |

---

## 3. Code app implementation

### 3.1 Opening and modes

**The one state.** `Screen.tsx` keeps the whole panel in `edit: CostLine | null`
(`features/cost/capex-costs/Screen.tsx:243`), plus `costValue` (the Total box text, `:244`),
`startText` / `endText` (`:250-251`), `originalDescription` (`:253`) and `linkConfirmOpen`
(`:260`).

**Opening, `open(accountId, line?)`** (`Screen.tsx:327-343`):

- It clones the stored line, or calls `newCostLine` for an Add.
- It filters clusters through `enabledClusters` (`panelRules.ts:49`).
- It seeds the date boxes with `isoToMonthYear` (`panelRules.ts:108`) and the Total with `initialCostValue` (`rules.ts:142`).
- It closes any relink dialog.
- There is no warm-up timer and no `locPanelReady`. The year list renders synchronously.

**Triggers.** `onAction` (`Screen.tsx:423-452`) receives PCF `"Add"` → `open(id)` and `"Edit"` → `open(line.accountId, line)`.

**Standard contracts.** `"AddStandardContract"` → `addStandardContract` (`Screen.tsx:388-421`) writes directly through `writes.saveLine` (`isNew: true`, `standard: true`) and does not open the panel, as in the canvas.

**Title.** `panelTitle(isEdit, accountName)` gives `"Edit Costs - …"` / `"Add Costs - …"` (`rules.ts:310`), where `isEdit = book.lines.some(c => c.id === edit?.id)` (`Screen.tsx:460`).

**Add defaults.** `newCostLine` (`rules.ts:111-119`):

- `payer: "SPV"`;
- `depreciation: true, vat: true, standard: false`;
- `distribution: "equal", equalMode: "cluster", distributionScheme: "absolute"`;
- **`startDate: "2025-04-01", endDate: "2027-07-31"`**;
- `frequency: 1`.

Pinned by UT-CAPEXR-034 (that test does not pin the dates or the scheme).

**Edit defaults.** These come from the cost book's `CostLine`:

- `payer = resolvePayer(vsb_costtype, SPVDevCo mapping)` (`data/costBook.ts:1091`, `:155`);
- clusters and dates from `parseByClusterJson` / `parseStartEndJson` (`rules.ts:630`, `:682`);
- the equal mode from `resolveEqualMode` (`rules.ts:713`, UT-CAPEXR-073..075);
- the Total from the stored `vsb_totalcost`, else the sum (`rules.ts:129-146`, UT-CAPEXR-006);
- **the month payments are the stored money amounts, with no conversion to percent.**

**Year list.** `projectPeriods(window.min, window.max)` (`Screen.tsx:902`), the **grid's** navigation window (`clusters.ts:127`), not `Year(costStart)…Year(costEnd)+3`.

### 3.2 Fields (`Screen.tsx:770-950`)

| Canvas field | Code | Notes |
|---|---|---|
| Description | `CostField label="Description" name="txt_AddContract_RightPanel_Description_1" required maxLength={512}` (`:773-776`) | The error is `describeDescriptionError` (`rules.ts:559`; UT-CAPEXR-044/045). `onChange` → `applyDescriptionChange` (`rules.ts:578`; UT-CAPEXR-047/048). No `standard` prop is passed. |
| Distribution | `Choices name="rad_…DistributionType_1" disabled={distributionLocked(isEdit)}` (`:785-791`) | `onChange` sets `payments: proposed`, which **carries the current proposal** instead of blanking. |
| Distribution Scheme | `Choices … required disabled={…}` with options `["Absolute Values", "% Values"]` (`:800-806`) | `onChange` changes only the scheme. |
| Total Costs (Individual %) | `CostField … name="txt_AddContract_RightPanel_TotalCost_1" type="number"` (`:807-812`) | `validateTotalCost` (`rules.ts:401`; UT-CAPEXR-035..037). |
| Link to Milestone | `CostSelect label="Link to Milestone" testId="drp_…Link_to_Cluster"` (`:578-588`) | `milestoneOptions` (`rules.ts:923`; UT-CAPEXR-099..102); `linkToMilestoneVisible` (`rules.ts:884`; UT-CAPEXR-098). |
| Equal Distribution | `Choices name="rad_…DistributionBy_1" required` (`:819-823`) | `onChange` changes only `equalMode`. |
| Total Costs (Equal) | `CostField` (`:825-828`) | The same validator. |
| Select Cluster | 5 Fluent `Checkbox`es (`:829-852`) | Checked/enabled come from `clusterCheckboxState` (`panelRules.ts:33`). Label `` `Cluster ${n}: ${label}` `` (`CLUSTERS`, `costing/model.ts:8`). `aria-label` is the caption. `standardClass(edit.standard)` styles the label. `onChange` clears the standard flag. |
| Start/End Date Distribution | `CostField label={MSG.startDateLabel}`, `placeholder="MM/YYYY"` (`:869-876`) | `validateStartMonthYear` / `validateEndMonthYear` (`rules.ts:518`, `:543`; UT-CAPEXR-039..046). Converted with `monthYearToIso` (`panelRules.ts:117`). |
| Distribution Frequency | `CostSelect testId="drp_AddContract_RightPanel_PaymentFrequency_1"` (`:878-882`) | `FREQUENCY_OPTIONS` = `DISTRIBUTION_FREQUENCY` values 1/2/3/6/12 (`rules.ts:60`; UT-CAPEXR-114/115). D38 §1 H-1 is fixed. |
| Average Amount per Payment | `CostField … disabled` (`:883-885`) | `averagePayment` = `RoundDown(total/n, 0)` over the **de-duplicated** proposal (`rules.ts:242`), formatted by `amount()` (`en-GB` grouping, `"-"` for 0; `costing/model.ts:279`). |
| Cost Paid By | `Choices name="rad_…CostPaidBy_1" options={["DevCo","SPV"]}` (`:887-889`) | No standard style; it does not clear the flag. |
| Apply VAT / Depreciation | Fluent `Switch labelPosition="before"`, with `aria-label` = the caption (`:891-897`) | No standard style; it does not clear the flag. |
| PCF-edit warning | — | **Not implemented.** |
| Year cards | `button` with the year and `allocatedCostLabel` (`panelRules.ts:70`), `data-testid="btn_Production_CardHeader_TransparentButton_3-<year>"` (`:910-919`) | Only **one** year is open at a time (`openYear`, `:248`). The label is **live**, from `rawProposed` (%) or `proposed` (money) (`:674-680`). |
| Month inputs | Fluent `Input type="number" min={0}`, `aria-label={monthYearLabel(m, y)}`, `data-testid="txt_…FirstMonth_${23+m}-${y}"`, `disabled` unless individual (`:921-943`) | `onChange` stores `Number(d.value)`, so an **empty box becomes 0**. The error is `monthAmountErrors` (`rules.ts:467`; UT-CAPEXR-060..070, duplicated ids). No `"0.00"` placeholder. For Equal the boxes show the **live computed** schedule. |

**Standard style and flag (rule 20).** The shared primitives carry a `standard` prop
(`components/CanvasFields.tsx:132`, `:157`; `components/standardValue.ts:65`). The CAPEX panel
passes it **nowhere**. The only standard styling in the panel is the cluster labels (`Screen.tsx:842`).

**Confirmation flags** (`Screen.tsx:533-565`):

- `clusterLinkageChanged` (`rules.ts:947`; UT-CAPEXR-103).
- `costPaidByChanged = Boolean(storedLine) && edit.payer !== storedLine.payer`, so it is **never true in Add**.
- `milestoneRelinkResetNeeded` (`rules.ts:970`; UT-CAPEXR-104) adds a **payment-date-comment count** that the live canvas formula does not have.
- `clustersHavingCost` (`rules.ts:994`; UT-CAPEXR-105/106) is inclusive for both branches.
- `needsClusterLinkageConfirmation` (`rules.ts:1023`; UT-CAPEXR-107/108).
- `clusterLinkageConfirmation` (`rules.ts:1093`; UT-CAPEXR-109..119).

### 3.3 The Save path

**Gate.** `valid` (`Screen.tsx:513-516`) combines:

- `canSaveContract` (`rules.ts:260`; UT-CAPEXR-025..027): a description; at least one proposed month; no negative or NaN month; Individual uses `canPersistIndividual`, which needs % to sum to 100 (1 dp) or Absolute to be > 0 (`rules.ts:824`; UT-CAPEXR-055..057); Equal needs a typed total ≥ 0;
- no description, total or date error;
- **no month range error** (`hasMonthRangeError`, `rules.ts:491`).

There is **no dirty flag**. The comment at `Screen.tsx:501-512` says Save "IS NOT GATED ON
`monthErrors`" and that a % month above 100 can still be saved, but `:515-516` does gate on range
errors. That comment is stale.

The footer is `PanelButtons` (`components/CanvasFields.tsx:251`) with
`disabled={!valid || busy}`, `saveTestId="btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Save"`
and `cancelTestId="pcf_btn_…_Cancel_2"` (`Screen.tsx:752-755`).

**Click.** `commit()` (`Screen.tsx:667-671`) opens the relink dialog when
`needsLinkConfirmation`, otherwise calls `persist()`. The dialog's Confirm calls `persist()`
directly (`:1016`). Its Cancel only closes the dialog (`:1015`).

**`persist()`** (`Screen.tsx:590-658`):

1. Sets the spinner label (`savingCostLabel`, `panelRules.ts:239`; "the cost" for individual, "costs" for equal) and **closes the panel first**, as in the canvas.
2. Calls `writes.saveLine.mutateAsync({ line: {...edit, totalCost: Number(costValue) or undefined}, isNew: !isEdit, payments: reconcilePayments(stored, proposed), resetPaidAndPaymentDateComments: relinkResetNeeded })`.

   `proposed = resolvedPayments(edit, costValue, rawProposed)` (`:458`). For Individual % it converts percent to money against **`edit.totalCost` (the stored total), not the typed `costValue`** (`rules.ts:290-305`). That function has no direct test.
3. Swallows the error; it is rendered as a banner instead (`:1051-1053`).

**`saveCostLine`** (`data/capexWrites.ts:107-294`):

- **Write order:**
  1. contract `update` (existing) or `create` (new) (`:215-240`);
  2. if the relink was accepted on an existing contract: `setCostPaid(false)` for each paid month **and `deleteComment` for every "Comments to payment date" comment** (`:244-252`);
  3. cost upserts (`:262-282`);
  4. cost deletes, last (`:289-291`).
- **Contract fields** (`:115-190`):
  - `vsb_name` and `vsb_description`, `vsb_costtype`, `vsb_applyvat`, `vsb_depreciation`, `vsb_distribution`;
  - `vsb_distributionscheme` (**always**, including on Equal);
  - `vsb_distributionfrequency` (always);
  - `vsb_totalcost` when defined;
  - Equal only: `vsb_byclusterjson` (`byClusterJson`, `rules.ts:614`; UT-CAPEXR-062..065), `vsb_bystartenddatejson` (`startEndJson`, `rules.ts:668`; UT-CAPEXR-067..072) and `vsb_averagepayment = String(RoundDown(total/n))`;
  - `vsb_isstandardcontract`;
  - `vsb_CapexStandardAssumptionContract@odata.bind`, on create only;
  - `vsb_LinkedCluster@odata.bind`: a bind or **`null` on update** (`:207-222`).
- **Create only:** `vsb_Project@odata.bind`, `vsb_Account@odata.bind` and **`owningbusinessunit@odata.bind`**. The last is written only `if (owningBusinessUnitId)` (`:231-235`).
- **Never written:** `vsb_initialcontractsource`, and cost-row `vsb_name`.
- **Cost rows:** `capexWriteSet` (`writeSet.ts:40-56`; UT-CWS-001..009). A null with an id is deleted; a null with no id or a 0 with no id writes nothing; anything else is upserted. Creates bind `vsb_Contract` and `owningbusinessunit` (`:270-280`). Updates write only `vsb_cost`, so the paid flag survives.
- **Deletes** go through `deleteRecord` (rule 14, `:289-291`; D38 §2 H-2 is fixed for cost rows). **`deleteComment`** (`data/comments.ts:218-220`) still calls the generated `Vsb_capexcommentsesService.delete()` directly.
- **Error handling:** every create and update goes through `unwrap` (rule 3). The first failure throws and stops the sequence. There is no `PlanError` / `executePlan` reporting of how many writes landed (`data/executePlan.ts` and `concurrency.ts` are not used by this path). Updates are not `guarded`, and per the `writePlan.ts` doc an SDK PATCH is an upsert (inferred: it could recreate a row another user deleted).

**Equal arithmetic** (`distribution.ts:33-71`, `rules.ts:164-239`):

- `distributionSchedule` gives `RoundDown(Max(span,0)/freq,0)+1`;
- `equalDistributionAmounts` gives `RoundDown` per payment with the remainder on the last;
- `clusterPayments` de-duplicates months across clusters (UT-CAPEXR-080/081, UT-DIST-*).

**Recalculate.** `PanelExtraButton label="Recalculate Allocated Cost"` (no trailing space,
`panelRules.ts:351`), visible via `recalculateVisible` (`:343`) and enabled via
`recalculateEnabled` (`:369`). `recalculatedPayments` (`:411`) rounds Absolute months and keeps
% months raw. Tests are in `panelRules.test.ts` "Recalculate Allocated Cost" (no UT ids) and
`Screen.test.tsx:655-699`.

**Cancel / ✕ / Escape / backdrop.** `FormPanel onDismiss={closePanel}`
(`components/FormPanel.tsx:83-138`) receives no `dirty`, so every close is immediate, matching the
canvas. The ✕ keeps the default `data-testid="panel-close"` and `aria-label="Close panel"`, and
Escape and backdrop clicks also close (`FormPanel.tsx:114`, `:119-121`).

**Refresh.** `useCapexWrites.invalidate` (`features/cost/costing/useCostBook.ts:386-396`) refetches
the cost book, the CAPEX totals, the Contracts DevCo queries and the comments. It runs
**`onSuccess` only** (`:415`), so after a failure nothing is refetched. The spinner is
`LoadingOverlay` while `busy` (`Screen.tsx:1045-1049`). The error is a raw `Error.message` banner
(`:1051-1053`).

---

## 4. Gaps: code app vs canvas

Severity is given for every row. Covered groups are marked Low for completeness.

| ID | Area | Canvas behaviour (cite) | Code app behaviour (cite) | Type | Status | Severity | Notes |
|---|---|---|---|---|---|---|---|
| GAP-PNL-001 | Opening and modes | Add / Edit from PCF `AddTriggered` / `EditTriggered` and the menu (L7295–7359, L3413–3556); title "Add/Edit Costs - …" (L10310); Distribution and Scheme locked on an existing contract (L10612, L10752); standard-contract add bypasses the panel (L7360–7417) | `onAction` / `open` (`Screen.tsx:327-343`, `:423-433`); `panelTitle` (`rules.ts:310`); `distributionLocked` (`panelRules.ts:440`); `addStandardContract` (`Screen.tsx:388-421`) | Functional | Covered | Low | Group |
| GAP-PNL-002 | Captions, required stars, Items, Edit defaults | §2.2 captions and stars; frequency 1/2/3/6/12 (`App.pa.yaml` L161); Link Items filter (L11412); cluster Checked/DisplayMode gate (L11102–11110); Edit defaults from the stored contract / JSON (L19703–19727) | `Screen.tsx:773-897`; `FREQUENCY_OPTIONS` (`rules.ts:60`); `milestoneOptions`; `clusterCheckboxState`; `resolveEqualMode`; `resolvePayer` | UI/Functional | Covered | Low | Group. D38 §1 H-1 is closed in the code |
| GAP-PNL-003 | Inline validations | Description (L10445), Total (L10937–10956), Start / End (L11574–11606, L11728), month format and % range (L13341–13389) | `describeDescriptionError`, `validateTotalCost`, `validateStartMonthYear`, `validateEndMonthYear`, `validateMonthAmount` (`rules.ts:401-572`) | Functional | Covered | Low | Group. Exceptions are GAP-PNL-019/020 |
| GAP-PNL-004 | Equal arithmetic, JSON columns, writes, spinner | Schedule and `RoundDown` + remainder, `Distinct` (⟨1386–1411⟩, ⟨1756–1765⟩, ⟨1790–1800⟩); JSON shapes (⟨1544–1562⟩); `Linked Cluster` blank-clear (⟨1001–1005⟩); OBU on create (⟨991⟩, ⟨1139⟩); spinner texts and close-before-save (⟨716–733⟩, ⟨1488–1494⟩); Recalculate semantics (L17719–18151); `btn_SaveCost_Execute____` is dead (never selected) | `distribution.ts`, `clusterPayments`, `byClusterJson`, `startEndJson`, `capexWrites.ts:207-235`, `persist()` `:605-606`, `recalculatedPayments`; the Execute button is correctly not ported | Functional/Data | Covered | Low | Group. Rule 4 holds on create; rule 14 holds on cost deletes |
| GAP-PNL-005 | Add: date boxes | Add leaves the dates blank (`locDistributionDatesRecord: Blank()` L19679), and `DistributionBy.OnChange` resets them (L10871–10872) | `newCostLine` pre-fills `2025-04-01` / `2027-07-31`, which show as `04/2025` / `07/2027` (`rules.ts:116`, `Screen.tsx:335-336`) | Data | Divergent-unmarked | Med | Can save a schedule the user never typed; UT-CAPEXR-034 does not pin the dates |
| GAP-PNL-006 | Add: Cost Paid By default | `Coalesce(contract 'Cost Type', SPVDevCo mapping for the sub-account)` (L12234–12254) | Add is always `"SPV"` (`rules.ts:113`); the mapping is applied to stored lines only (`costBook.ts:1091`) | Data | Partial | Med | A DevCo-mapped sub-account gets SPV contracts unless the user notices |
| GAP-PNL-007 | Add: payer-change confirmation | `locInitialCostPaidBy` = the mapping on Add (L7303–7309); changing it sets `locCostPaidByChanged` (L12287–12292), which triggers the relink pop-up | `costPaidByChanged = Boolean(storedLine) && …` (`Screen.tsx:536`), so it is never true on Add | UX | Divergent-unmarked | Med | Canvas asks "switch the 'Cost Paid by'…" on Add too |
| GAP-PNL-008 | Edit of a `% Values` contract | The enrich loader shows months as `Round(m / 'Total Cost' * 100, 1)` (L19239–19253) | Months open as stored **money** (`open()` clones `line.payments`; no conversion anywhere). Every month > 100 shows "Value must be between 0 and 100.", the sum ≠ 100 disables Save, and any save would multiply money by Total / 100 (inferred) | Functional/Data | Missing | High | An existing % contract cannot be edited correctly. Related to D38 §5 R4 |
| GAP-PNL-009 | Panel year list | `Year(costStart) … Year(costEnd)+3` (L19606–19627) | The grid navigation window (`Screen.tsx:902`, `clusters.ts:127`) | UI | Divergent-unmarked | Low | D38 §9 Q6 (open question, no marker) |
| GAP-PNL-010 | New Individual: default scheme and order | `First(colContractDistributionScheme)` = `% Values` first (L10747–10749; order inferred from option values 952850000/952850001) | Defaults to `absolute`; options listed Absolute then % (`rules.ts:115`, `Screen.tsx:803`) | UI | Divergent-unmarked | Low | (inferred) |
| GAP-PNL-011 | Distribution type change | Resets Scheme and By, and blanks every month (L10619–10659) | Keeps the scheme and carries the equal proposal into `payments` (`Screen.tsx:789-791`) | Functional | Divergent-unmarked | Med | Switching Equal→Individual pre-fills money the canvas would clear |
| GAP-PNL-012 | Scheme change | Blanks every month (L10756–10779) | Keeps the typed months (`Screen.tsx:804-806`) | Functional | Divergent-unmarked | Low | Typed % values reinterpreted as money, or the reverse |
| GAP-PNL-013 | Equal Distribution (By) change | Resets dates and clusters, blanks `locClusterRecord` / `locDistributionDatesRecord`, sets `locChangedDistribution`, clears the standard flag (L10870–10907) | Only `equalMode` changes (`Screen.tsx:823`) | Functional | Divergent-unmarked | Low | |
| GAP-PNL-014 | Clearing a month box | A blank box becomes `Blank()`, so an existing row is `Remove`d (⟨1157–1170⟩, `IsBlank(Cost)`) | `Number("")` = 0, so the existing row is **updated to 0**, not deleted (`Screen.tsx:937`; `writeSet.ts:50`) | Data | Divergent-unmarked | Med | The `null`→delete path of `capexWriteSet` is unreachable from the panel |
| GAP-PNL-015 | Standard flag clearing | 9 controls run the flag-clearing block (§2.2.12) | Only Description and the cluster checkboxes (`Screen.tsx:776`, `:846`) | Data | Partial | Med | Rule 20: editing Total / Frequency / Link / Payer / VAT / Depreciation keeps `vsb_isstandardcontract = true` |
| GAP-PNL-016 | Standard blue + italic | On Description, Equal Distribution, Total, clusters, Cost Paid By, VAT and Depreciation (L10475, L10865, L10981, L11111, L12255, L12334, L12394) | Only the cluster labels (`Screen.tsx:842`). The `standard` prop exists but is unused (`CanvasFields.tsx:132`, `:157`) | UI | Partial | Med | Rule 20 |
| GAP-PNL-017 | Average Amount display | `Text(total/n, "########0.0#")`, no `RoundDown`, cluster count **not** de-duplicated (L11935–12145) | `RoundDown(total/n,0)` over de-duplicated months, `en-GB` grouping, `"-"` for 0 (`rules.ts:242`, `model.ts:279`) | UI | Divergent-unmarked | Low | Stored `Average Payment` matches (`RoundDown`); only the display differs |
| GAP-PNL-018 | Month input chrome | `Placeholder "0.00"`; Add shows `0` (L13623, L19641) | No placeholder; an empty month shows `""` (`Screen.tsx:928-933`) | UI | Partial | Low | |
| GAP-PNL-019 | Month absolute range message | `$"Value must be between 0 and {If(Poland,2250000000,500000000)}."`, an ungrouped number (L13364–13368) | `"Value must be between 0 and 500,000,000."` (`rules.ts:461`) | UI | Divergent-unmarked | Low | Rule 7 |
| GAP-PNL-020 | Total message separators | Commas when `Language()` is "en", dots otherwise (L10937) | `validateTotalCost(costValue, countryName)` passes no locale, so it is always `en-GB` (`Screen.tsx:481`) | UI | Partial | Low | The same applies to `IsOneDecimal`'s comma branch |
| GAP-PNL-021 | PCF-edit warning | `con_Warning_OnEditFromPCF`: "**Warning:** Distribution scheme changed to absolute values due to edits in the spreadsheet component." (L12426–12495) | Not rendered | UI | Missing | Low | |
| GAP-PNL-022 | Year accordion | Several years open at once (L12706); ▲ recalculates and rounds that year (L12738–13174) | Only one open year; collapsing does nothing else (`Screen.tsx:248`, `:913`) | UX | Divergent-unmarked | Low | |
| GAP-PNL-023 | Live preview | The gallery shows stored values / 0 for Equal; Allocated Cost refreshes only on ▲ / Recalculate / Save | Month boxes and Allocated Cost recompute live, including the Equal schedule (`Screen.tsx:454-458`, `:674-680`, `:923`) | UX | Code-app-only | Low | An improvement, but undocumented |
| GAP-PNL-024 | Cluster 3 caption | `"	Cluster 3: Permitting"` with a leading TAB (L11215) | `"Cluster 3: Permitting"` (`model.ts:8`, `Screen.tsx:843`) | UI | Divergent-unmarked | Low | Rule 7. Probably a canvas typo; needs a decision |
| GAP-PNL-025 | Checkbox identities | `AccessibleLabel` = the control name (L11100 …) | `aria-label` = the caption (`Screen.tsx:840`); the gate only reports C5 (advisory) | UX | Divergent-unmarked | Low | Rule 16. Defer to `05` |
| GAP-PNL-026 | Link dropdown identity | `AccessibleLabel = "drp_Add_Edit_Cost_Data_RightPanel_Form_Link_to_Cluster"` (L11402) | `CostSelect` `aria-label` = "Link to Milestone" (`CanvasFields.tsx:163`) | UX | Divergent-unmarked | Low | Rule 16; the same for the frequency dropdown (L11841). Defer to `05` |
| GAP-PNL-027 | ✕ identity and close paths | `ico_GeneratorData_RightPanel_Form_PvModuleType_Header_Cancel_2`, `Tooltip "Cancel"` (L10317–10356) | `data-testid="panel-close"`, `aria-label="Close panel"` (`FormPanel.tsx:119-121`) | UX | Divergent-unmarked | Low | Pass `closeTestId` / `closeLabel` |
| GAP-PNL-028 | % total changed on Edit | Typed total ≠ `locAllYearsCost` → every `<M>Save` is recomputed with the **typed** total (⟨734–950⟩) | `resolvedPayments` converts against `edit.totalCost` (the **stored** total) while writing the new `vsb_totalcost` (`rules.ts:296`, `Screen.tsx:458`, `:644`) | Data | Divergent-unmarked | High | Stored months disagree with the stored total. No test covers `resolvedPayments` |
| GAP-PNL-029 | Individual Absolute: Total Cost | `locAllYearsCost = Round(Sum(TotalSave),1)` → `'Total Cost': Coalesce(Value(txt), locAllYearsCost)` (⟨473–486⟩, ⟨976–979⟩) | `costValue` is never updated (the box is hidden): Add writes no `vsb_totalcost`, Edit writes the stale stored total (`Screen.tsx:644`, `capexWrites.ts:145`) | Data | Divergent-unmarked | Med | |
| GAP-PNL-030 | Relink reset scope | `OnConfirm` resets `'Cost Paid'` only. The `RemoveIf('Capex Comments', …)` is commented out (not live) (L20054–20065), and the trigger has **no** comment clause (L11468–11479) | Deletes every "Comments to payment date" comment and counts comments in the trigger (`capexWrites.ts:248-251`, `rules.ts:970-978`), citing the older `CapexScreenCode.txt` | Data | Divergent-unmarked | High | Deletes user data the canvas keeps. Also routed through a raw `delete()` (GAP-PNL-041). See §6 |
| GAP-PNL-031 | Invalid individual distribution | Save stays enabled; on click `locShowErrorInContractCost` shows `cmp_ShowErrorInContract`: "Total percentage is over 100%" / "…below 100%" / "No cost is allocated." (⟨1224–1230⟩, L19765–19794) | Save is disabled silently (`canPersistIndividual`) | UX | Missing | Med | D38 §9 Q5; gap-analysis S15 |
| GAP-PNL-032 | Save failure message | `Notify("Something went wrong saving the Capex data. Please refresh the page and verify your changes were saved correctly.", Error, 5000)` (⟨1151–1155⟩, ⟨1840–1844⟩) | A raw `Error.message` banner (`Screen.tsx:1051-1053`) | UX | Missing | Med | The string exists already for Add Cost from Table (`add-costs-from-table/rules.ts:95`), so reuse it |
| GAP-PNL-033 | Refresh after a failed save | The reload runs unconditionally after the patches (⟨1182⟩, ⟨1876⟩) | Invalidation is `onSuccess` only (`useCostBook.ts:415`), so a half-applied save leaves the grid stale | Data | Divergent-unmarked | Med | |
| GAP-PNL-034 | Dirty gate | Save needs `locEditSaveButtonEnabled` (L17548); Edit opens with it `false` (L19700) | No dirty requirement; Save is enabled at once on a valid Edit (`Screen.tsx:513`) | UX | Divergent-unmarked | Low | |
| GAP-PNL-035 | Month range errors gate Save | The month error labels drive layout only; no Save DisplayMode reads them (L13302–13306) | `hasMonthRangeError` disables Save (`Screen.tsx:515-516`); the comment at `:501-512` says the opposite | Functional | Divergent-unmarked | Low | No `SOURCE DEFECT:` marker, no D-entry, no twin |
| GAP-PNL-036 | `Initial Contract Source` | `Coalesce(existing, Powerapps)` on every contract Patch (⟨992–995⟩, ⟨1565–1568⟩) | Never written (`capexWrites.ts:115-190`) | Data | Missing | Low | The canvas PCF-edit warning (L12447) keys on it |
| GAP-PNL-037 | `Capex Standard Assumption Contract` | `If(IsStandardContract, Blank())` is Blank on both arms, so it is cleared on every panel save (⟨997–1000⟩, ⟨1570–1573⟩) | Bound on create only, never cleared (`capexWrites.ts:187-189`) | Data | Divergent-unmarked | Low | (inferred: Blank-patch semantics). Affects whether the standard option re-appears (L3135–3147). Verify live |
| GAP-PNL-038 | Distribution Scheme on Equal | Not written on Equal; commented out (not live) (⟨1513–1520⟩) | Always written (`capexWrites.ts:138-140`) | Data | Divergent-unmarked | Low | The comment explains it, but there is no marker |
| GAP-PNL-039 | Cost row `Name` | Equal Patch writes `Name: Item.Contract.Name` (⟨1788⟩) | `vsb_name` is not written on cost rows (`capexWrites.ts:270-278`) | Data | Missing | Low | |
| GAP-PNL-040 | Other-cluster interval | Individual: half-open `[s, e)` on `<M>Save > 0` (⟨548–684⟩); Equal: inclusive on scheduled months (⟨1430–1461⟩) | Inclusive and money > 0 for both (`rules.ts:994-1006`) | Functional | Divergent-unmarked | Low | Acknowledged in a comment, with no marker |
| GAP-PNL-041 | Rule 14 on the relink reset | No comment delete runs in the canvas | `deleteComment` calls the generated `delete()` (`data/comments.ts:218-220`), so a refusal resolves as success | Data | Partial | Med | Also used by `deleteCostLine`. Route it through `deleteRecord` |
| GAP-PNL-042 | Owning Business Unit | Written on every contract and cost Patch, create **and** update (⟨991⟩, ⟨1139⟩, ⟨1564⟩, ⟨1828⟩) | Bound on create only, and silently omitted when `owningBusinessUnitId` is undefined (`capexWrites.ts:233-235`, `:275-277`) | Data | Partial | Low | Rule 4: the "nothing throws" failure shape |
| GAP-PNL-043 | Half-apply and partial-failure reporting | Not transactional; Equal runs `RemoveIf` **before** the re-`Patch` (⟨1776–1781⟩) | Not transactional; ordered contract → resets → upserts → deletes; stops at the first failure with no count of applied writes and no `PlanError` (`capexWrites.ts:213-291`) | Data | Partial | Med | Safer than the canvas but unreported. KNOWN-RISKS "no changeset" |
| GAP-PNL-044 | Equal save always recomputes | Recomputes only on `locChangedByDate` / `…Distribution` / `…Frequency` / `locClusterChanged` / `loctotalCostChanged` (⟨1579–1586⟩) | Reconciles on every save (`Screen.tsx:614-628`) | Perf | Divergent-marked | Low | D38 §6 |
| GAP-PNL-045 | Delete-all vs reconcile | `RemoveIf` the whole contract cost set, then re-`Patch`, losing paid flags (⟨1776–1781⟩) | `reconcilePayments` keeps the ids and paid flags (`rules.ts:358-376`; UT-CAPEXR-076..079) | Data | Divergent-marked | Low | D38 §6 / §8. Marked in the comment |
| GAP-PNL-046 | C-7 Average / Link on Add | Never written for a new Equal contract (⟨1846–1863⟩) | Written on create (`capexWrites.ts:174-181`, `:230`) | Data | Divergent-marked | Low | `SOURCE DEFECT` marker in `Screen.tsx:629-640`; D38 §8; bug C-7 |
| GAP-PNL-047 | Escape / backdrop close | Only ✕ and Cancel close; the scrim has no `OnSelect` (L10249–10264) | Escape and backdrop click also close (`FormPanel.tsx:114`) | UX | Code-app-only | Low | No data loss risk beyond the canvas' own no-prompt close |

### Verbatim validation and feedback messages, side by side

| Control (canvas) | Canvas text (verbatim) | Code text (`rules.ts` / `Screen.tsx`) | Match |
|---|---|---|---|
| `lbl_…_ErrorMessage_2` | `The term "Standard" is applicable only for system-prefilled contracts.` | the same (`rules.ts:567`) | ✓ |
| `lbl_…_ErrorMessage_2` | `There cannot be two contracts with the same name under the same sub-account` | the same (`rules.ts:571`) | ✓ |
| `lbl_AddContract_RightPanel_TotalCost_ErrorMessage_1` | `Value must be between 0 and 2,250,000,000` · `…2.250.000.000` · `…500,000,000` · `…500.000.000` | `Value must be between 0 and ${en-GB or de-DE}` (`rules.ts:411`); the locale is always en-GB in practice | partial (GAP-PNL-020) |
| `lbl_AddContract_RightPanel_StartDate_ErrorMessage_1` | `Date must be in MM/YYYY format` · `Start Date must be in or after ` & `mm/yyyy` | the same (`rules.ts:520`, `:524`) | ✓ |
| `lbl_AddContract_RightPanel_EndDate_ErrorMessage_1` | `Date must be in MM/YYYY format` · `End Date must take place after Start Date` | the same (`rules.ts:545`, `:551`) | ✓ |
| `lbl_…_ErrorMessage_15` (`Visible: false`) | `Average Amount will be (re)calculated upon saving.` | — (dead in the canvas) | n/a |
| `lbl_…FirstMonth_ErrorMessage_24…35`, Absolute | `Value must be a numeric` · `Value must be between 0 and 2250000000.` / `…500000000.` | `Value must be a numeric` · `Value must be between 0 and 500,000,000.` (`rules.ts:457`, `:461`) | partial (GAP-PNL-019) |
| `lbl_…FirstMonth_ErrorMessage_*`, % | `Value must be numeric upto one decimal` · `Value must be between 0 and 100.` | the same (`rules.ts:448`, `:451`) | ✓ |
| `cmp_ShowErrorInContract.ErrorTitle` | `Total percentage is over 100%` · `Total percentage is below 100%` · `No cost is allocated.` | — | missing (GAP-PNL-031) |
| Save `Notify` (IfError) | `Something went wrong saving the Capex data. Please refresh the page and verify your changes were saved correctly.` | raw `Error.message` | missing (GAP-PNL-032) |
| Spinner | `Please wait, checking validation` (Individual) · `Please wait, checking validations` (Equal) | — (validation is synchronous) | n/a |
| Spinner | `Please wait, saving the cost...` · `Please wait, saving costs...` | the same (`panelRules.ts:236-237`) | ✓ |
| `html_Warning_OnEditFromPCF` | `<b>Warning:</b> Distribution scheme changed to absolute values due to edits in the spreadsheet component.` | — | missing (GAP-PNL-021) |

### `SOURCE DEFECT` / `DIVERGENCE` markers in scope, checked against D38, D39 and D50

| Marker (code) | Says | Recorded in | Verdict |
|---|---|---|---|
| `Screen.tsx:614-628` `DIVERGENCE:` | Equal recomputes on every save | D38 §6 | consistent |
| `Screen.tsx:629-640` `SOURCE DEFECT (canvas), fixed here` | C-7: Average Payment / Linked Cluster on create | D38 §8, bug C-7 | consistent. D38 §8 itself asks for the marker to move to `capexWrites.ts`; not done yet |
| `rules.ts:349-354` (reconcile, "deliberate divergence", no keyword) | Reconcile instead of delete-all | D38 §6 | prose only, no `DIVERGENCE:` keyword |
| `Screen.tsx:501-512` "That is a SOURCE DEFECT" | The month range is not gated | none | **contradicted by `:515-516`**; no D-entry, no twin |
| `panelRules.ts:270-278` `SOURCE DEFECT:` | Paid dialog title / body wording | D38 / D39 §3 (UX-3) | consistent (06 owns the dialog) |
| `capexWrites.ts:315-327` `DIVERGENCE:` | Delete removes cost rows explicitly | D38 §7 L-7 | consistent. Delete is out of panel scope; 07 owns it |
| none | GAP-PNL-005, 007, 011, 014, 028, 029, 030, 033 | none in D38 / D39 / D50 | unmarked. They need D-entries per rule 8 |

D50 (the `App.OnStart` year) affects the grid year only. It does not touch the panel's year list
(GAP-PNL-009, which is D38 §9 Q6).

---

## 5. Open questions / not verifiable from source

1. **Which canvas version is authoritative for the relink reset (GAP-PNL-030)?** The `.pa.yaml` (1.21.709) has both the comment clause and the comment `RemoveIf` removed or commented out, and carries a "Bug 13772" note (L20067), which suggests it is the newer edit. `CapexScreenCode.txt` (L11311–11314, L19917–19919) still has them live. The code follows the `.txt`. Product needs to confirm against 1.21.753 (`VSBCloud_managed (2).zip`).
2. **`Patch` with `If(cond, Blank())` on a lookup (GAP-PNL-037).** Whether the canvas really clears `Capex Standard Assumption Contract` on every save depends on Blank-patch semantics. This needs a live check: open a standard contract, save it unchanged, then inspect `_vsb_capexstandardassumptioncontract_value`.
3. **Choices order (GAP-PNL-010).** Is `First(Choices('Distribution Scheme'))` really `% Values` in the running app? It is inferred from the option values.
4. **Add-mode `locSelectedProjectContract` at `AddTriggered`.** `locInitialCostPaidBy` is computed before the warm-up blanks `locSelectedProjectContract` (L7303 vs L19677). After a previous Edit that was not cleared by Save or Cancel, it could coalesce to the old contract's payer (inferred). This needs a live sequence test.
5. **Hidden input values.** GAP-PNL-029 assumes `txt_AddContract_RightPanel_TotalCost_1.Value` (inside a hidden container) tracks `locAllYearsCost` after it changes. That is inferred from `Value: =locAllYearsCost` with no user typing.
6. **Canvas behaviour after a failed contract Patch.** It is outside `IfError`, so the canvas continues with a possibly errored `locSelectedProjectContract`. The resulting cost writes are not determinable from source.
7. **`PATCH`-as-upsert on cost updates** (`writePlan.ts` doc). Could a concurrent delete followed by our update recreate the row? This needs a live two-tab test (R-12).
8. **Test hygiene (rule 13).**
   - `rules.test.ts` reuses UT ids: `UT-CAPEXR-042`, `-044`, `-045` and `-060`…`-070` each appear on more than one `it()`.
   - `panelRules.test.ts` (51 `it()`s) has no UT ids at all.
   - `resolvedPayments` has no direct test (GAP-PNL-028).

## 6. Doc disagreements

| Doc | Claim | Source says |
|---|---|---|
| `app-docs/gap-analysis/cost-capex-costs.md` L72 | `btn_SaveCost_Execute____` is a hidden subroutine "invoked by `Select()`" | Nothing selects it. The relink `OnConfirm` selects the visible Save button (L20070). It is dead code |
| same, B11 (L127), COVERED | The relink `OnConfirm` "optionally resets paid rows **and payment-date comments**" | Only paid rows. The comment `RemoveIf` is commented out (not live) (L20061–20065). `data/capexWrites.ts:84-97` and `rules.ts:955-966` repeat the same claim from `CapexScreenCode.txt` |
| same, D11 (L104), COVERED | The individual save writes Initial Contract Source and Capex Standard Assumption Contract | `saveCostLine` writes neither (GAP-PNL-036/037) |
| same, D15 / H-2 (L108), WRONG | CAPEX deletes bypass `deleteRecord` | Fixed for cost rows and the contract (`capexWrites.ts:289-291`, `:338-342`). `deleteComment` still bypasses it (GAP-PNL-041). The doc lags |
| same, D17 / H-1 (L110), and D38 §1 | `FREQUENCY_OPTIONS = [1,3,6,12]` | Now derived from `DISTRIBUTION_FREQUENCY` (1/2/3/6/12; `rules.ts:60`; UT-CAPEXR-114). The doc lags |
| same, S1 (L137), COVERED | The Save gate is covered | The code adds a month-range gate and drops the dirty flag (GAP-PNL-034/035). Click-time validation and its strip are missing (GAP-PNL-031) |
| same, S8 (L144) and `Screen.tsx:501-512` | "Save is not gated on" month errors; a % month over 100 can be saved | `Screen.tsx:515-516` gates on range errors |
| same, B9 (L125), PARTIAL "behaviourally equivalent for the panel's content" | — | Not equivalent for `% Values` contracts: the canvas shows percent and the code shows money (GAP-PNL-008) |
| `panelRules.ts` and `CanvasFields.tsx` citations | `CapexScreenCode.txt:<n>` line numbers | These are a different extraction and do not line up with the `.pa.yaml`. `rules.ts:1061-1062` already says so |
| D38 §8 | The C-7 marker should move to `capexWrites.ts` | Still only in `Screen.tsx:629-640` |
