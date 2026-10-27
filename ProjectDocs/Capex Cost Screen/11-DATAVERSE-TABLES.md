# 11 · DEVEX/CAPEX Costs screen: Dataverse tables, columns, writes, flows and plugins

Gap prefix **GAP-DV**. Sibling files own the rest: variables and collections are in `10-COLLECTIONS-VARIABLES.md`, the save path's UI flow in `08-FUNCTIONAL-ADD-EDIT-COST-PANEL.md`, the comment panel's behaviour in `09-COMMENTS-PANEL.md`, round-trips in `12-NETWORK-CALLS.md`, and performance in `13-OPTIMIZATION-AREAS.md`. This file covers only the data contract: which tables, which columns, which filters, which writes, and what the server does by itself.

---

## 1. Scope

**What it covers.** Every Dataverse table the canvas "Capex Costs Screen" reads or writes. That includes tables it reads directly and tables whose data it takes from `App.OnStart`. For each table it lists the columns, choices, filters, delegation status, write payloads and owning-business-unit (BU) handling. It also lists the relationships between the tables and the server-side logic (flows, plugins, formula columns, cascades) that the screen's writes trigger. The canvas is then compared with the code app's data layer.

**Canvas sources read:**
- `ProjectDocs/_extracted/msapp/projectcosts/Src/Capex Costs Screen.pa.yaml`. Every line that quotes a data source was found by grep and read in context:
  - L11–301 (OnVisible), L303–434 (`cmp_PopUp_Confirmation_1`), L452–777 (the two hidden code buttons), L782 (`tmr_Capex_Initial_Load`);
  - L1014–1600 (`btn_Capex_Cost_Refresh_Capex_Cost_Code`), L2560–2620, L3060–3570 (the hidden command bar);
  - L7180–7768 (the PCF `OnChange` and `Btn_CodeforSettingCostPaidUnpaid`), L8088–8155 (the delete dialog);
  - L9366–9390, L9835–9915 and L10088–10223 (comments), L11425–11495 and L12235–12265 (the panel's dropdown and radio), L12436–12451;
  - L17506–17575 (the Save button), L17605–17697 (`btn_SaveCost_Execute____`), L18223–18927 (`btn_Capex_Cost_Add_Standard_Contract_Code`), L19860–20082 (the two confirmation popups).
- The two 90 KB one-line formulas, L17574 (Save `OnSelect`) and L17687 (`btn_SaveCost_Execute____.OnChange`), were unescaped and read in full. They are cited below as `L17574 (formula line N)`.
- `App.pa.yaml`: L12–187 (`Formulas`) and L205 (`OnStart`, a single escaped line, read in full).
- `References/DataSources.json`: the data-source list and every relevant `OptionSetInfo` value map. `Properties.json`: `DefaultConnectedDataSourceMaxGetRowsCount`. `AppCheckerResult.sarif`: every result whose location is this screen.

**Solution sources read:**
- `ProjectDocs/_extracted/VSBCloud/customizations.xml`: every `<EntityRelationship>` touching the CAPEX tables, with its cascade configuration, and all 14 `SdkMessageProcessingStep` entries.
- `…/Workflows/*.json`: all 15, grepped for `vsb_capex*` / `vsb_devexcapex*`. `LoadDevexCapexCostTotalCapacityTrigger-*.json` was read in full.
- `…/Formulas/vsb_spvdevcomappingcapexdevex-FormulaDefinitions.yaml` and `vsb_project-FormulaDefinitions.yaml`.
- `ProjectDocs/Existing Solution/VSBCloud (3).zip`, `PluginAssemblies/`: string tables of `vsb_InitialCapexContractCreation.dll`, `vsb_InitialCapexCostsCreation.dll` and `VSB_CapexAssumptionDeletion.dll`. These were read in memory only; nothing was extracted to disk.
- `ProjectDocs/skeleton-reference/solution/customapi/vsb_CreateCapexStandardContract.json` and `…/plugins/CreateCapexStandardContract.cs` (existence only; see §2.13).
- `ProjectDocs/reference/dataverse-entities.json` and `dataverse-attributes.json`.

**Code app sources read (`ProjectCosts-CodeApp/`):**
- `power.config.json`, and `.power/schemas/appschemas/dataSourcesInfo.ts` (grep only).
- `src/data/`:
  - `dataverseNames.ts`, `costBook.ts`, `capexWrites.ts`, `costRepository.ts`, `comments.ts`, `standardContracts.ts` and `project.ts` (L128–246), all read in full or in the relevant part;
  - `client.ts` (L40–200), `odata.ts` (L30–110 and the export list);
  - the test titles in `capexWrites.test.ts`, `comments.test.ts` and `costBook.test.ts`.
- `src/features/cost/costing/useCostBook.ts` (L376–615).
- `src/features/cost/capex-costs/`: `standardContracts.ts` (full), plus targeted reads of `Screen.tsx` (L336–460, L560–669, L1020–1036) and `rules.ts` (L160–223, L839–842, L1220).

---

## 2. Canvas implementation

### 2.0 Data-source inventory

`References/DataSources.json` lists the canvas's connected sources. The ones this screen uses, directly or through `App.OnStart` data, are listed below. Counts are from a grep of the screen YAML: `Filter` / `LookUp` / `Patch` / `Remove` / `RemoveIf` / `UpdateIf` / `Defaults` calls whose first argument is the quoted name.

| Canvas name | Logical name | Entity set | R/W on this screen | Direct calls in screen YAML |
|---|---|---|---|---|
| `'CAPEX Costs'` | `vsb_capexcost` | `vsb_capexcosts` | **R/W** | Filter 8, Defaults 8, Patch 4, UpdateIf 2, RemoveIf 1, LookUp 1, Remove (inside L17574) |
| `'CAPEX Project Contracts'` | `vsb_capexprojectcontract` | `vsb_capexprojectcontracts` | **R/W** | LookUp 6, Defaults 5, Patch 2 (+3 inside L17574), Remove 2, Filter 1 |
| `'Capex Comments'` | `vsb_capexcomments` | `vsb_capexcommentses` | **R/W** | RemoveIf 4, LookUp 2, Filter 2, Patch 1, Defaults 1 |
| `'CAPEX Account Lists'` | `vsb_capexaccountlist` | `vsb_capexaccountlists` | R (via `App.OnStart` collections only) | 0 |
| `'Devex/Capex Standard Assumptions'` | `vsb_devexcapexstandardassumptions` | `vsb_devexcapexstandardassumptionses` | R | Filter 2, LookUp 1 |
| `'SPVDevCo Mapping Capex Devexes'` | `vsb_spvdevcomappingcapexdevex` | `vsb_spvdevcomappingcapexdevexes` | R | LookUp 5, Filter 1 |
| `Projects` | `vsb_project` | `vsb_projects` | R | LookUp 3 (+2 in `App.OnStart`) |
| `'Project States'` | `vsb_projectstate` | `vsb_projectstates` | R | Filter 1 |
| `'Milestones Standard Assumptions'` | `vsb_milestonesstandardassumptions` | `vsb_milestonesstandardassumptionses` | R | LookUp 1 |
| `GeneratorTypeInProjects` | `vsb_generatortypeinproject` | `vsb_generatortypeinprojects` | R | Filter 1 (inside `Sum`) |
| `'Microsoft Entra IDs'` | `aaduser` (virtual) | `aadusers` | R | LookUp 1 (+1 in `App.OnStart`) |
| (Business Units) | `businessunit` | `businessunits` | bind target only | via `gblSelectedProject.'Besitzer (Unternehmenseinheit)'` |

**App-level `App.OnStart` sources** feed globals this screen uses, but the screen never filters them. They are documented in `01-EDIT-COST-MODULE.md`:
- `'Environment Variable Values'` / `'Environment Variable Definitions'` (`gblAppVersion` etc.);
- `Users` (`systemuser`), with its teams and security roles;
- `Countries_1` (`vsb_country`);
- the `Office365Groups` connector (not Dataverse);
- `'Opex Accounts'`, `'Opex Subaccounts'` and `'Land Lease Subaccounts'` (not CAPEX).

**Dead source.** `'Capex Project Cost Margins'` appears only in commented-out code, not live, at L2840, L2855, L8145, L19024 and L19128 (`//locSelectedProjectCostsMargin:LookUp('Capex Project Cost Margins',…)`). It is **not** in `References/DataSources.json` at all, so the canvas has no connection to it. The code app records the same finding (`src/data/dataverseNames.ts:629-649`, `DEAD_CAPEX_MARGIN`).

**Global settings.** `Properties.json` sets `DefaultConnectedDataSourceMaxGetRowsCount: 2000`, so any non-delegable query is evaluated over at most 2,000 rows. App Checker raises `app-DataSourceDefaultMaxRowsLimit` ("Data row limit for non-delegable queries is more than 500") at the App level.

---

### 2.1 `CAPEX Costs` (`vsb_capexcost` / `vsb_capexcosts`): monthly cost rows

**Purpose.** One row per contract per year and month, holding the monthly amount and the paid flag. It drives the grid's M1–M12 cells, the Total / Planned / Actual columns, the Summary tab and the comment indicators.

**Columns used** (from `dataverse-attributes.json`, entity `vsb_CAPEXCost`):

| Display name (canvas) | Logical | Type | Notes |
|---|---|---|---|
| `'CAPEX Cost'` | `vsb_capexcostid` | primary key | |
| `Contract` | `vsb_contract` | lookup → `vsb_capexprojectcontract` | nav property `vsb_Contract` |
| `Year` | `vsb_year` | int | the canvas compares `Value(Text(Year))` (L1428-1431) |
| `Month` | `vsb_month` | picklist, global set `yearlymonth_options` | |
| `Cost` | `vsb_cost` | decimal | |
| `'Cost Paid'` | `vsb_costpaid` | bit (`vsb_capexcost_vsb_costpaid`) | the canvas compares it to `true` (L392) **and** to `'Cost Paid (CAPEX Costs)'.Yes` (L1551) |
| `Name` | `vsb_name` | nvarchar | written only on the equal-distribution and standard paths |
| `'Capex Contract Standard Assumption'` | `vsb_capexcontractstandardassumption` | lookup → `vsb_devexcapexstandardassumptions` | written only by the standard path (L18886) |
| `'Owning Business Unit'` | `owningbusinessunit` | lookup → `businessunit` | written on every Patch |
| (Status) | `statecode` | state | never filtered by the canvas |

**Choices.**
- `yearlymonth_options`: 1 January … 12 December. The values are the month numbers (`DataSources.json`).
- `vsb_capexcost_vsb_costpaid`: 1 = Yes, 0 = No.

**Reads (live formulas).**

1. `App.pa.yaml:L205`, `OnStart`. This is the seed of `colCapexCosts`: one server query **per contract** (N+1), with `ShowColumns` narrowing.

   ```powerfx
   ClearCollect(colCapexCosts, Defaults('CAPEX Costs'));
   Collect(colCapexCosts, Ungroup(ShowColumns(AddColumns(colCapexProjectContracts As Item, Value,
       ShowColumns(Filter('CAPEX Costs', Contract.'CAPEX Project Contract' = Item.'CAPEX Project Contract'),
           Year, Name, Month, Cost, Contract, 'CAPEX Cost', 'Cost Paid')), Value), Value))
   ```

   The leading `Defaults(...)` row is a blank placeholder that stays in the collection.
2. `Capex Costs Screen.pa.yaml:L737-766`, `btn_Capex_Cost_Reload_PCF_After_Mutation_Code.OnSelect`. Runs `Refresh('CAPEX Costs')`, then the same rebuild as OnStart. It runs after every mutation.
3. `L1050-1056`, `btn_Capex_Cost_Refresh_Capex_Cost_Code.OnSelect`. Builds `colCapexCostsInSelectedContracts = Filter(colCapexCosts, Contract.'CAPEX Project Contract' in colCapexContractsInSelectedCategory.'CAPEX Project Contract')`. This is local, not a server read.
4. `L1530-1556`, same button, `colContractTotalsForPCF`. These are **direct server aggregates per contract**:

   ```powerfx
   varTotalCost: Coalesce(C.'Total Cost', Sum(Filter('CAPEX Costs', Contract.'CAPEX Project Contract' = C.'CAPEX Project Contract'), Cost), 0),
   varPaidCost: Coalesce(Sum(Filter('CAPEX Costs', Contract.'CAPEX Project Contract' = C.'CAPEX Project Contract' && 'Cost Paid' = 'Cost Paid (CAPEX Costs)'.Yes), Cost), 0)
   ```
5. `L7636-7646`, PCF `OnChange` (`CommentTriggered`). `locAvailebleCapexCosts = ShowColumns(Filter('CAPEX Costs', Contract.'CAPEX Project Contract' = locSelectedProjectContract.'CAPEX Project Contract'), Year, Month, 'CAPEX Cost', Contract, Cost)`.
6. `L7697-7736`, `Btn_CodeforSettingCostPaidUnpaid.OnSelect`. `Filter('CAPEX Costs', Contract = GUID(DevexCapexSummaryPCF.SelectedCostContractId))`, then a local `LookUp` on `Year`/`Month`.
7. `L9375-9382`, the comment panel's month picker. `LookUp('CAPEX Costs', And(Year = _year, Month = _monthEnum, Contract.'CAPEX Project Contract' = _contractId))`.
8. `L11472-11477`, `drp_Add_Edit_Cost_Data_RightPanel_Form_Link_to_Cluster.OnChange`. `CountRows(Filter('CAPEX Costs', Contract.'CAPEX Project Contract' = locSelectedCostRow.vsb_capexaccountlistid && 'Cost Paid' = true)) > 0` feeds `locMilestoneRelinkResetNeeded`.
9. `L17574 (formula lines 50-58, 1094-1117)`, Save. These read the local `colCapexCostsInSelectedContracts` / `colCapexCosts` to decide create-or-update.

**Sorts.** None on the server. Local sorts are in `10-COLLECTIONS-VARIABLES.md`.

**Writes.**

| # | Where | Payload | Notes |
|---|---|---|---|
| W1 | `Btn_CodeforSettingCostPaidUnpaid.OnSelect` `L7745-7751` | `Patch('CAPEX Costs', varCostRecord, {'Cost Paid': DevexCapexSummaryPCF.SelectedCostPaid})`, then `Refresh`, then `Select(btn_…_Reload_PCF_After_Mutation_Code)` | inside `IfError` → Notify "Could not update paid status. Please refresh and try again." |
| W2 | Save, individual branch, `L17574 (1119-1142)` | `Patch('CAPEX Costs', ForAll(Filter(colCapexFinalDataToPatch, Not(IsBlank(Cost)) && (Cost <> 0 \|\| existing)) As Data, {Contract, 'CAPEX Cost': Data.'CAPEX Cost'.'CAPEX Cost', Cost, Month, Year: Value(Data.Year), 'Owning Business Unit': gblSelectedProject.'Besitzer (Unternehmenseinheit)'}))` | a bulk upsert. A blank id means create. **Name is not written.** `IfError` → Trace + Notify "Something went wrong saving the Capex data. …" |
| W3 | Save, individual branch, `L17574 (1157-1170)` | `ForAll(colCapexToDelete As D, Remove('CAPEX Costs', D.'CAPEX Cost'))` where `IsBlank(Cost) && !IsBlank('CAPEX Cost'.'CAPEX Cost')` | not inside `IfError` |
| W4 | Save, equal branch, `L17574 (1776-1779)` | `RemoveIf('CAPEX Costs', Contract.'CAPEX Project Contract' = locSelectedProjectContract.'CAPEX Project Contract')` | runs only when `Or(locChangedByDate, locChangedDistribution, locChangedFrequency, locClusterChanged, loctotalCostChanged) && !IsBlank(locSelectedProjectContract)` (formula lines 1579-1586). It **deletes every month, including paid ones** |
| W5 | Save, equal branch, `L17574 (1780-1831)` | `Patch('CAPEX Costs', ForAll(colCapexCostDataToPatch As Item, {'CAPEX Cost', Contract, Name: Item.Contract.Name, Year, Cost: RoundDown(total/n,0) (last = remainder), Month: Switch(…[@Month]…), 'Owning Business Unit'}))` | every row is a create (the ids come from `Defaults`). `'Cost Paid'` is not written, so all months come back unpaid |
| W6 | Add Standard Contract `L18849-18889` | `Patch('CAPEX Costs', ForAll(colCapexCostDataToPatch As r, {Contract, Name: r.Contract.Name, Year, Month: Switch(…), Cost, 'Owning Business Unit', 'Capex Contract Standard Assumption': locStandardContractAssumption}))` | **the only writer of `vsb_capexcontractstandardassumption`** |
| W7 | `cmp_PopUp_Confirmation_For_SetClusterLinkingConfirmationPopup.OnConfirm` `L20052-20059` (live) | `If(locMilestoneRelinkResetNeeded, UpdateIf('CAPEX Costs', Contract.'CAPEX Project Contract' = locSelectedCostRow.vsb_capexaccountlistid && 'Cost Paid' = true, {'Cost Paid': false}))` | a server-side `UpdateIf` |
| W7′ | `cmp_PopUp_Confirmation_1.OnConfirm` `L387-394` | same `UpdateIf` | **unreachable**: the instance's `Visible` is `=//locShowClusterLinkageConfirmation` / `false` (`L425-427`) |
| — | Delete dialog `L8122-8126` | `RemoveIf('CAPEX Costs', Contract.'CAPEX Project Contract' = locContractToDelete.'CAPEX Project Contract')` | **commented-out, not live**. The cost rows go through the Dataverse cascade (§3) |

`btn_SaveCost_Execute____.OnChange` (`L17687`) carries a near-identical copy of W2–W5. The control is a PowerCAT Icon with `Visible: =false` (`L17692`), and nothing `Select`s it (grep), so the copy is effectively dead code.

**Project scope and BU.** The table is project-scoped through `Contract` → `Project`. `'Owning Business Unit'` is written on **every** Patch, both creates and updates (W2, W5, W6).

---

### 2.2 `CAPEX Project Contracts` (`vsb_capexprojectcontract` / `vsb_capexprojectcontracts`): cost lines

**Purpose.** One row per cost line (the grid's "contract" row, `IsContract: true`) under a level-3 subaccount. It carries the distribution settings, the payer, the stored total and the cluster link.

**Columns used** (entity `vsb_CAPEXProjectContract`):

| Display name | Logical | Type | Lookup target / notes |
|---|---|---|---|
| `'CAPEX Project Contract'` | `vsb_capexprojectcontractid` | primary key | |
| `Project` | `vsb_project` | lookup | `vsb_project`, nav `vsb_Project` |
| `Account` | `vsb_account` | lookup | `vsb_capexaccountlist` (the level-3 subaccount), nav `vsb_Account` |
| `Name` | `vsb_name` | nvarchar | grid text (`vsb_costdescription: CPC.Name`, L1205) |
| `Description` | `vsb_description` | nvarchar | written with the same value as `Name` |
| `'Cost Type'` | `vsb_costtype` | picklist, global `vsb_costpaidtype` | |
| `Distribution` | `vsb_distribution` | picklist, global `vsb_distributiontype` | |
| `'Distribution Scheme'` | `vsb_distributionscheme` | picklist, global `vsb_distributionscheme` | |
| `'Distribution Frequency'` | `vsb_distributionfrequency` | int | read at L11847 |
| `'Total Cost'` | `vsb_totalcost` | **int** | the grid's total (`Coalesce('Total Cost', Sum(...))`, L1536) |
| `'Average Payment'` | `vsb_averagepayment` | **nvarchar** | the canvas writes a number into a text column |
| `'Apply VAT?'` | `vsb_applyvat` | bit | |
| `'Depreciation?'` | `vsb_depreciation` | bit | |
| `'By Cluster JSON'` | `vsb_byclusterjson` | nvarchar | `[{"Cluster1":…,…,"Cluster5":…}]` |
| `'By Start & End Date JSON'` | `vsb_bystartenddatejson` | nvarchar | `[{"StartDate":"mm/yyyy","EndDate":"mm/yyyy"}]` |
| `'Is Standard Contract?'` | `vsb_isstandardcontract` | bit, labelled `Ja`/`Nein` | |
| `'Capex Standard Assumption Contract'` | `vsb_capexstandardassumptioncontract` | lookup | `vsb_devexcapexstandardassumptions`, nav `vsb_CapexStandardAssumptionContract` |
| `'Linked Cluster'` | `vsb_linkedcluster` | lookup | `vsb_projectstate`, nav `vsb_LinkedCluster`; `.Order` / `.Name` read |
| `'Initial Contract Source'` | `vsb_initialcontractsource` | picklist (local) | |
| `'Is Edited from PCF?'` | `vsb_iseditedfrompcf` | bit | read only (L12446) |
| `'Created On'` | `createdon` | datetime | `vsb_CreatedOn` in the grid row (L1218) |
| `'Owning Business Unit'` | `owningbusinessunit` | lookup | `businessunit` |
| — | `vsb_autoid` | nvarchar | not used by this screen |

**Choices** (from `DataSources.json`):
- `vsb_costpaidtype`: 952850000 None · 952850001 DevCo · 952850002 SPV. The panel offers only `LastN(Choices('Cost paid type'), 2)` = DevCo/SPV (`App.pa.yaml:L205`, `colCostPaidType`).
- `vsb_distributiontype`: 952850000 Equal Distribution · 952850001 Individual Distribution.
- `vsb_distributionscheme`: 952850000 % Values · 952850001 Absolute Values. The commented-out code at `L17574 (1513-1520)` uses the old label `'Absolut Values'`.
- `vsb_capexprojectcontract_vsb_initialcontractsource`: **95285 PCF · 95289 Powerapps** (out-of-band values).
- `vsb_capexprojectcontract_vsb_isstandardcontract`: 1 Ja · 0 Nein.
- `…_vsb_applyvat`, `…_vsb_depreciation` and `…_vsb_iseditedfrompcf`: 1 Yes · 0 No.

**Filters (live).**
- `App.pa.yaml:L205`: `ClearCollect(colCapexProjectContracts, Filter('CAPEX Project Contracts', Project.Project = gblSelectedProject.Project))`. Project only; **no statecode condition and no account condition**.
- `L729-736`, reload: `Filter('CAPEX Project Contracts', Account.'CAPEX Account List' in colCapexSubaccountsNew.'CAPEX Account List', Project.Project = gblSelectedProject.Project)`. Project **and** active level-3 subaccounts.
- `L1043-1049`, refresh: a local filter to the selected category's subaccounts.
- Server look-ups:
  - `L7380-7383`, the standard-contract click-time duplicate check: `LookUp('CAPEX Project Contracts', Project.Project = gblSelectedProject.Project && Account.'CAPEX Account List' = varSelectedRow.vsb_capexaccountlistid && 'Capex Standard Assumption Contract'.'Devex/Capex Standard Assumptions' = varSelectedStandardGuid)`;
  - `L7426-7429` and `L7446-7449`, the paid toggle: `LookUp('CAPEX Project Contracts', 'CAPEX Project Contract' = GUID(Self.SelectedCostContractId))`;
  - `L19875`, the paid confirm: the same `LookUp`.
- `L3139-3145`: a `LookUp` in the hidden command bar `cmd_Costs_ProjectCosts_TableCommandBar.Items`. Its container is `Visible: =false` (L3080). The formula is live but not rendered.

**Writes.**

| # | Where | Payload |
|---|---|---|
| C1 | Save, individual branch `L17574 (951-1010)` | `Patch('CAPEX Project Contracts', If(Not(locSelectedCostRow.IsContract), Defaults(...), LookUp(colCapexProjectContracts, …)), {Account: locSelectedSubAccount, Name, Description (both = txt_AddContract_RightPanel_Description_1.Value), Distribution, Project: gblSelectedProject, 'Distribution Scheme': If(… Absolute / % …), 'Total Cost': Coalesce(Value(txt…TotalCost), locAllYearsCost), 'Apply VAT?', 'Depreciation?', 'Cost Type': rad_…CostPaidBy.Selected.Value, 'Owning Business Unit', 'Initial Contract Source': Coalesce(locSelectedProjectContract.'Initial Contract Source', 'Initial Contract Source (CAPEX Project Contracts)'.Powerapps), 'Is Standard Contract?': locSelectedCostRow.IsStandardContract, 'Capex Standard Assumption Contract': If(locSelectedCostRow.IsStandardContract, Blank()), 'Linked Cluster': If(drp….Selected.Name <> "None", drp….Selected, Blank())})`. No `'Distribution Frequency'`, no JSON columns |
| C2 | Save, equal branch `L17574 (1495-1578)` | the same as C1 **minus** `'Distribution Scheme'` (commented out, formula lines 1513-1520) and `'Linked Cluster'`, **plus** `'By Cluster JSON': JSON([{Cluster1: chk1.Checked && chk1.DisplayMode = DisplayMode.Edit, …}])`, `'By Start & End Date JSON': JSON([{StartDate: txt…StartDate.Value, EndDate: txt…EndDate.Value}])` and `'Distribution Frequency': drp_…PaymentFrequency.Selected.Value` |
| C3 | Save, equal branch `L17574 (1846-1863)` | `Patch('CAPEX Project Contracts', LookUp(colCapexProjectContracts, 'CAPEX Project Contract' = locSelectedCostRow.vsb_capexaccountlistid), {'Average Payment': RoundDown(total / locNumPayments, 0), 'Linked Cluster': If(… <> "None", Selected, Blank())})`. On an **Add**, `locSelectedCostRow` is the subaccount row, so the base record is blank (inferred; this is the canvas defect C-7 recorded in `01-BUGS-FOUND.md` / D38 §8) |
| C4 | Add Standard Contract `L18636-18703` | `Patch(…, If(Not(locSelectedCostRow.IsContract), Defaults(...), LookUp(...)), {Account: locStandardContractAssumption.Subaccount, Name/Description: assumption.Description, Distribution: 'Equal Distribution', Project, 'Total Cost': locTotalCostToDistribute, 'Apply VAT?' / 'Depreciation?' from the assumption, 'Cost Type': assumption.'Cost Paid By', 'Distribution Frequency': assumption.'Distribution Frequency', 'Owning Business Unit', 'Initial Contract Source': Coalesce(…, Powerapps), 'By Cluster JSON': JSON([{ClusterN: CountIf(colEligibleStandardCostClusters, Cluster = N) > 0}]), 'Is Standard Contract?': Ja, 'Capex Standard Assumption Contract': locStandardContractAssumption})` |
| C5 | Add Standard Contract `L18890-18900` | `Patch(…, locSelectedProjectContract, {'Average Payment': Value(avgPay), 'Total Cost': Sum(colCapexCostDataToPatch, Cost)})`. The total is **re-stated as the sum of the eligible rows only** (§2.5) |
| C6 | Add Standard Contract `L18758-18771` | `Remove('CAPEX Project Contracts', locSelectedProjectContract)` when no payment row lands in an eligible cluster |
| C7 | Paid confirm `cmp_PopUp_Confirmation_For_SetasPaidUnpaidCostConfirmation.OnConfirm` `L19875` | `Patch('CAPEX Project Contracts', varGetContract, {'Linked Cluster': Blank()})`, then `Select(Btn_CodeforSettingCostPaidUnpaid)` |
| C8 | Delete dialog `cmp_PopUp_SubaccountCostsDeletion_Confirmation.OnConfirm` `L8114-8140` | `IfError(With({locContractToDelete: LookUp(colCapexProjectContracts, …)}, RemoveIf('Capex Comments', 'Capex Contract'.'CAPEX Project Contract' = locContractToDelete.'CAPEX Project Contract'); Remove('CAPEX Project Contracts', locContractToDelete)), Notify("Error: Costs could not be deleted. " & …))` |

**Project scope and BU.** The table is project-scoped through `Project`. `'Owning Business Unit'` is written on every Patch: C1, C2 and C4, whether creating or updating.

---

### 2.3 `Capex Comments` (`vsb_capexcomments` / `vsb_capexcommentses`)

The UI and its behaviour are owned by `09-COMMENTS-PANEL.md`. Only the data contract is covered here.

**Columns used:**

| Display | Logical | Type | Target |
|---|---|---|---|
| `'Capex Comments (vsb_capexcommentsid)'` | `vsb_capexcommentsid` | primary key | |
| `Name` | `vsb_name` | nvarchar | `$"Comment - {SequenceNumber} - {User().FullName}"` |
| `Comment` | `vsb_comment` | nvarchar | |
| `'Comment Type'` | `vsb_commenttype` | picklist, global `vsb_capexcommenttype` | **1** General Comment · **2** Comments to payment date |
| `'Capex Contract'` | `vsb_capexcontract` | lookup | `vsb_capexprojectcontract` |
| `'Capex Cost'` | `vsb_capexcost` | lookup | `vsb_capexcost` |
| `'Parent Comment'` / `'Root Comment'` | `vsb_parentcomment` / `vsb_rootcomment` | lookup | `vsb_capexcomments` (self) |
| `Resolved` | `vsb_resolved` | bit (1 Yes / 0 No) | |
| `'Resolved By'` | `vsb_resolvedby` | lookup | **`aaduser`** (`vsb_capexcomments_ResolvedBy_aaduser`) |
| `'Created On'` | `createdon` | datetime | sort key |
| `'Owning Business Unit'` | `owningbusinessunit` | lookup | `businessunit` |

**Reads.**
- `L1058-1064`, refresh: `Filter('Capex Comments', 'Capex Contract'.'CAPEX Project Contract' in colCapexContractsInSelectedCategory.'CAPEX Project Contract' || 'Capex Cost'.'CAPEX Cost' in colCapexCostsInSelectedContracts.'CAPEX Cost')`.
- `L7459-7472`, PCF `CommentTriggered`: `Refresh('Capex Comments')`, then `Filter('Capex Comments', 'Capex Contract'.'CAPEX Project Contract' = locSelectedCostRow.vsb_capexaccountlistid)`, sorted by `'Created On'` ascending (L7563-7564).
- `L9894-9897`, reply: `LookUp('Capex Comments', id = GUID(ThisItem.id))`.
- `L10172-10175`, save: `LookUp('Capex Comments', id = _currentComment.ParentCommentID)`.

**Writes.**
- `btn_Capex_Comment_Save.OnSelect`, `L10144-10215`:
  - `ForAll(colDeletedComments, RemoveIf('Capex Comments', id = _Item.id))`;
  - then `ForAll(Filter(colCapexComments, IsButton <> true), Patch('Capex Comments', If(IsBlank(id), Defaults(...), {id}), {Name, Comment, 'Capex Contract': locSelectedProjectContract, 'Comment Type', Resolved, 'Resolved By': _currentComment.Resolver, 'Parent Comment', 'Capex Cost', 'Root Comment', 'Owning Business Unit': gblSelectedProject.'Besitzer (Unternehmenseinheit)'}))`.
  - Every row is patched on every save, and **`'Owning Business Unit'` is written on every Patch**.
  - The block is wrapped in `IfError` → "An error occurred while saving. Please try again."
- Delete dialog, `L8127-8130`: `RemoveIf('Capex Comments', 'Capex Contract'.'CAPEX Project Contract' = locContractToDelete.'CAPEX Project Contract')`. This is redundant with the cascade (§3).
- `L396-399`: `RemoveIf('Capex Comments', … && 'Comment Type' = 'Capex Comment Type'.'Comments to payment date')`. It sits inside the **unreachable** `cmp_PopUp_Confirmation_1.OnConfirm` (`Visible: false`).
- `L20061-20065`: the same `RemoveIf` in the **live** relink popup is **commented-out, not live**.

---

### 2.4 `CAPEX Account Lists` (`vsb_capexaccountlist` / `vsb_capexaccountlists`): the chart of accounts

**Purpose.** A self-referencing tree with four levels:
- root `"00001"`;
- level 1: the categories (tabs);
- level 2: the accounts;
- level 3: the subaccounts, which contracts hang from.

The screen reads it only through `App.OnStart` collections.

**Columns:**
- `'CAPEX Account List'` (`vsb_capexaccountlistid`, primary key);
- `Name` (`vsb_name`, nvarchar);
- `Number` (`vsb_number`, nvarchar);
- `Order` (`vsb_order`, decimal; the canvas sorts by `Order` **and** by `"vsb_order"`);
- `'Parent Account'` (`vsb_parentaccount`, lookup → `vsb_capexaccountlist`; delete `RemoveLink`);
- `Status` (`statecode`, `vsb_capexaccountlist_statecode` 0 Active / 1 Inactive);
- `'Account Category'` (`vsb_accountcategory`) is **not** used by the screen.

**Filters (`App.pa.yaml:L205`).**
- Categories: `SortByColumns(Filter('CAPEX Account Lists', And(Not(IsBlank('Parent Account')), 'Parent Account'.Number = "00001")), "vsb_order", Ascending)`, with a synthetic `{Name: "DEVEX/CAPEX Summary", Order: 0}` prepended. **No status filter.**
- Accounts: `Sort(Filter('CAPEX Account Lists', 'Parent Account'.'CAPEX Account List' in <categories>, Status = 'Status (CAPEX Account Lists)'.Active), Order, Ascending)`.
- Subaccounts: the same shape, one level down, also `Status = Active`.
- The tab strip drops `Name = "Overleveraging"` (OnVisible L270).

**Writes.** None on this screen.

**Scope.** Global master data (not project-scoped).

---

### 2.5 `Devex/Capex Standard Assumptions` (`vsb_devexcapexstandardassumptions` / `…es`)

**Purpose.** The catalogue behind "Add Standard Contract".

**Columns used:**

| Display | Logical | Type |
|---|---|---|
| `'Devex/Capex Standard Assumptions'` | `vsb_devexcapexstandardassumptionsid` | primary key |
| `Subaccount` | `vsb_subaccount` | lookup → `vsb_capexaccountlist` |
| `Category` | `vsb_category` | lookup → `vsb_capexaccountlist` (projected only, L499) |
| `Country` | `vsb_country` | lookup → `vsb_country` |
| `Technology` | `vsb_technology` | picklist, global `vsb_technology` (952850000 Wind … 952850006 Substation) |
| `Description` / `'Description Input'` | `vsb_description` / `vsb_descriptioninput` | nvarchar |
| `'Auto ID'` | `vsb_autoid` | nvarchar (sort key and name fallback) |
| `'Cluster 1'…'Cluster 5'` | `vsb_cluster1…5` | bit, 1 Yes / 0 No |
| `'Cost Amount'` | `vsb_costamount` | decimal |
| `Unit` | `vsb_unit` | picklist, global `vsb_costunit`: 952850000 EUR · 952850001 EUR/MW(p) · 952850002 EUR/WTG · 952850003 PLN · 952850004 PLN/MW(p) · 952850005 PLN/WTG |
| `'Cost Paid By'` | `vsb_costpaidby` | picklist, `vsb_costpaidtype` |
| `'Distribution Frequency'` | `vsb_distributionfrequency` | int |
| `'Apply VAT'` / `Depreciation` | `vsb_applyvat` / `vsb_depreciation` | bit |
| `Name` | `vsb_name` | nvarchar (projected only) |

**Reads.**
1. `btn_Capex_Cost_Build_StandardContractOptions_Code.OnSelect`, `L456-718`. Runs `Refresh('CAPEX Project Contracts')`, then:

   ```powerfx
   Filter('Devex/Capex Standard Assumptions' As InnerDCS,
       InnerDCS.Subaccount.'CAPEX Account List' in colCapexSubaccountsInSelectedCategoryNew.'CAPEX Account List',
       InnerDCS.Country.Country = gblSelectedProject.Country.Country,
       Lower(Text(InnerDCS.Technology)) = Lower(Text(gblSelectedProject.Technology)),
       IsBlank(LookUp(colCapexProjectContracts, Project.Project = gblSelectedProject.Project
           && Account.'CAPEX Account List' = InnerDCS.Subaccount.'CAPEX Account List'
           && 'Capex Standard Assumption Contract'.'Devex/Capex Standard Assumptions' = InnerDCS.'Devex/Capex Standard Assumptions')))
   ```

   It then keeps the options with at least one eligible cluster and sorts by `"AutoId"` ascending. The name is `Coalesce(vsb_description, vsb_descriptioninput, "Standard Contract " & Text(vsb_autoid))` (L703-707).
2. `L18230-18233`: `LookUp('Devex/Capex Standard Assumptions', 'Devex/Capex Standard Assumptions' = locGUIDforLoadingStandardContract)`.
3. `L3093-3131`: the same catalogue filtered per subaccount, inside the hidden command bar.

**Money** (`L18240-18279`). `Switch(Unit, EUR|PLN → 'Cost Amount', EUR/WTG|PLN/WTG → Round(activeWTGs × amount, 0), EUR/MW(p)|PLN/MW(p) → Round('Total Capacity' × amount, 0))`.

**Distribution** (`L18521-18900`).
- `colStandardCostAllSelectedClusters` holds every **ticked** cluster with a valid span, using the back-computed milestone dates.
- `colEligibleStandardCostClusters` is that set filtered to `Cluster >= varApplicableStartCostClusterNo`.
- Payments are generated over **all** selected clusters (`locClustersForFullDistribution: colStandardCostAllSelectedClusters`, L18705). `avgPay = RoundDown(total / count(all), 0)`, and the last payment takes the remainder.
- **Only the eligible clusters' rows are written** (L18839-18848). `'Total Cost'` is then re-stated as `Sum(written rows)` (C5).

**Writes.** None to this table.

**Scope.** Global master data.

---

### 2.6 `SPVDevCo Mapping Capex Devexes` (`vsb_spvdevcomappingcapexdevex` / `…es`)

**Purpose.** The default payer (DevCo/SPV) per subaccount.

**Columns:**
- `'Name (Sub-Account)'` (`vsb_namesubaccount`, lookup → `vsb_capexaccountlist`);
- `'DevCo/SPV'` (`vsb_devcospv`, picklist `vsb_costpaidtype`);
- `'Account Number'` (`vsb_accountnumber`, nvarchar, **formula column** `=vsb_NameSubAccount.vsb_number`);
- `'Related Account (Name)'` (`vsb_relatedaccountname`, formula `=vsb_NameSubAccount.vsb_ParentAccount.vsb_name`; not used).

**Reads.**
- `LookUp('SPVDevCo Mapping Capex Devexes', 'Name (Sub-Account)'.'CAPEX Account List' = locSelectedCostRow.vsb_capexaccountlistid).'DevCo/SPV'`, as the `Coalesce` fallback for `locInitialCostPaidBy` (L7305-7308, L7341-7344, and in the hidden bar L3464, L3540).
- The same lookup as the default of `rad_AddContract_RightPanel_CostPaidBy_1` (L12247-12253).
- `L2577-2587`, "Add Cost from Table" button: `ShowColumns(Filter('SPVDevCo Mapping Capex Devexes', 'Account Number' in colCapexSubaccountsInSelectedCategoryNew.Number), 'Account Number', 'DevCo/SPV')`. It filters on the **formula column**; the collection is consumed by the Add Costs from Table screen.

**Writes.** None. **Scope.** Global master data.

---

### 2.7 `Projects` (`vsb_project` / `vsb_projects`)

**Purpose.** `gblSelectedProject`: dates, start cluster, country, technology, capacity and owning BU.

**Reads.**
- `OnVisible`, L40-56: `LookUp(Projects, Project = GUID(Param("projectId")))`, with a hard-coded test GUID fallback `33b9cc79-…`. This repeats `App.OnStart` and has **no statecode condition**.
- The hidden command bar re-reads it (L3484-3490).

**Columns (display → logical, type):**
- `Project` → `vsb_projectid`;
- `'Acquisition date'` → `vsb_acquisitiondate`, datetime;
- `'Project Start Date'` → `vsb_projectstartdate`;
- `'1-Feasibility studies'` → `vsb_feasibilitystudies`;
- `'2-Project development started'` → `vsb_projectdevelopmentstarted`;
- `'3-Application submitted'` → `vsb_applicationsubmitted`;
- `'4-Legally binding permits'` → `vsb_legallybindingpermits`;
- `'5-Construction'` → `vsb_construction`;
- `'Operations start date (COD)'` → `vsb_operationsstartdatecod`;
- `'End Date'` → `vsb_enddate`;
- `'Start Cluster'` → `vsb_startcluster`, picklist `vsb_clusterstates` (0 Greenfield, 1–6 Cluster N);
- `'Cluster State'` → `vsb_clusterstate`, lookup → `vsb_projectstate`, `.Order` read at L11440;
- `Country` → `vsb_country`, lookup;
- `Technology` → `vsb_technology`, picklist;
- `'Total Capacity'` → `vsb_totalcapacity`, decimal. This is a **formula column**: `=vsb_plantwtgcapacity + vsb_plantpvcapacitymwp + vsb_plantstoragecapacity + vsb_plantsubstationcapacity + vsb_planthydrogencapacity` (`vsb_project-FormulaDefinitions.yaml`);
- `'Besitzer (Unternehmenseinheit)'` → `owningbusinessunit`. This is the German display name, and it is the source of every BU write on this screen.

**Writes.** None.

---

### 2.8 `Project States` (`vsb_projectstate` / `vsb_projectstates`)

**Purpose.** It is the target of `'Linked Cluster'`, and the Items of `drp_Add_Edit_Cost_Data_RightPanel_Form_Link_to_Cluster`.

**Columns:**
- `'Project State'` (`vsb_projectstateid`);
- `Name` (`vsb_name`);
- `Order` (`vsb_order`, int).

**Read** (`L11433-11448`):

```powerfx
Ungroup(Table({vsb_name: "None"},
    Sort(Filter('Project States', Order in [1, 2, 3, 4, 5, 6] && Order > gblSelectedProject.'Cluster State'.Order && Order >= Max(1, varStartClusterNo)), Order, SortOrder.Ascending)), Name)
```

There is no statecode condition. **Writes:** none. **Scope:** global master data.

---

### 2.9 `Milestones Standard Assumptions` (`vsb_milestonesstandardassumptions` / `…es`)

**Read** (`L18300-18303`): `LookUp('Milestones Standard Assumptions', Name = "average duration [months]" && Country.Country = gblSelectedProject.Country.Country && Technology = gblSelectedProject.Technology)`.

**Columns:**
- `'Cluster 1'…'Cluster 5'` (`vsb_cluster1…5`, decimal, months);
- `'Final Investment Decision'` (`vsb_finalinvestmentdecision`, decimal);
- `Name`;
- `Country`;
- `Technology`.

The values back-compute the cluster start dates for the standard-contract path (L18345-18519), each `Coalesce`d to 0. **Writes:** none.

---

### 2.10 `GeneratorTypeInProjects` (`vsb_generatortypeinproject` / `vsb_generatortypeinprojects`)

**Read** (`L18243-18250`): `Sum(Filter(GeneratorTypeInProjects, Project.Project = gblSelectedProject.Project, Status = 'Status (GeneratorTypeInProjects)'.Active), 'Number of Generators')`. This is the per-WTG multiplier.

The entity is **not** in `ProjectDocs/reference/dataverse-attributes.json`. Its columns are taken from the generated service the code app selects: `vsb_project`, `statecode` and `vsb_numberofgenerators`. This is the **only** CAPEX read on which the canvas applies an Active filter apart from the account tree. **Writes:** none.

---

### 2.11 `Microsoft Entra IDs` (`aaduser` / `aadusers`, virtual)

**Read** (`L9843-9846`, `img_Read_Comment_Check.OnSelect`): `LookUp('Microsoft Entra IDs', Id = User().EntraObjectId)`. It becomes `Resolver`, which is written to `'Resolved By'`. `App.OnStart` also reads `'Company Name'` (owned by 01).

---

### 2.12 Delegation (App Checker, filtered to `Capex Costs Screen`)

Rule text for `app-SuggestRemoteExecutionHint`: *"Delegation warning. The "{0}" part of this formula might not work correctly on large data sets."* All results are level **Medium**.

| Location | Argument / snippet | Table affected |
|---|---|---|
| `btn_Capex_Cost_Build_StandardContractOptions_Code.OnSelect` @647 | `"Lower"` — `Lower(Text(InnerDCS.Technology))` | Devex/Capex Standard Assumptions. The whole `Filter` runs locally over ≤ 2,000 rows |
| same @680 | `"Filter"` — `=` | same |
| `cmd_Costs_ProjectCosts_TableCommandBar.Items` @369 | `"Lower"` — `Lower(DCS.Technology)` | same (hidden bar) |
| same @391 | `"Filter"` | same |
| `DevexCapexSummaryPCF.OnChange` @3561 | `app-SuggestRemoteExecutionHint-OpNotSupportedByColumn`, column `"varSelectedRow.vsb_capexaccountlistid"` — *"The highlighted part of this formula might not work correctly with column "{0}" on large data sets."* | CAPEX Project Contracts (the L7380 click-time `LookUp`) |
| same @3513, @3545, @3585 | `"LookUp"` (`&&`, `=`, `&&`) | same |
| `drp_Add_Edit_Cost_Data_RightPanel_Form_Link_to_Cluster.Items` @939 | `"Max"` — `Max(1, varStartClusterNo)` | Project States (10 rows; harmless) |
| same @936, @907 | `"Filter"` (`>=`, `&&`) | same |

These are non-delegation findings on screen formulas that read these tables:
- `app-CollectingReadOnlyTable` ×6 on `btn_Capex_Cost_Refresh_Capex_Cost_Code.OnSelect` and ×3 on `btn_Costs_ProjectCosts_TableCommandBar_AddCostFromTable.OnSelect` (*"Collection is initialized but never updated"*);
- `app-ForAllWithMutation` on the PCF `OnChange`, the comment Save and deletes, `btn_…_Buttons_Save.OnSelect` and `btn_SaveCost_Execute____.OnChange`.

No warning is raised for the `in` filters over the comment and cost tables, or for the per-contract `Sum(Filter('CAPEX Costs', …))`. App Checker treats those as delegable to Dataverse.

---

### 2.13 Server-side logic triggered by, or relevant to, this screen's writes

**Cascades** (`customizations.xml`, `<EntityRelationship>`). These are the server behaviours the canvas depends on.

| Relationship | Referencing → referenced | Delete | Assign |
|---|---|---|---|
| `vsb_capexcost_Contract_vsb_capexprojectcontract` | cost.`vsb_Contract` → contract | **Cascade** | Cascade |
| `vsb_capexcomments_CapexContract_vsb_capexprojectcontract` | comment.`vsb_CapexContract` → contract | **Cascade** | Cascade |
| `vsb_capexprojectcontract_Account_vsb_capexaccountlist` | contract.`vsb_Account` → account | **Cascade** | Cascade |
| `vsb_capexcomments_CapexCost_vsb_capexcost` | comment.`vsb_CapexCost` → cost | RemoveLink | — |
| `vsb_capexcomments_ParentComment` / `_RootComment` | comment → comment | RemoveLink | — |
| `vsb_capexcomments_ResolvedBy_aaduser` | comment → aaduser | RemoveLink | — |
| `vsb_capexprojectcontract_Project_vsb_project` | contract → project | **RemoveLink** (deleting a project orphans its contracts) | — |
| `vsb_capexprojectcontract_LinkedCluster_vsb_projectstate` | contract → project state | RemoveLink | — |
| `vsb_capexprojectcontract_CapexStandardAssumptionContract_…` | contract → assumption | RemoveLink | — |
| `vsb_capexcost_CapexContractStandardAssumption_…` | cost → assumption | RemoveLink | — |
| `vsb_capexaccountlist_ParentAccount_vsb_capexaccountlist` | account → parent | RemoveLink | — |
| `vsb_spvdevcomappingcapexdevex_NameSubAccount_…` | mapping → account | RemoveLink | — |
| `business_unit_*` (every CAPEX table) | `OwningBusinessUnit` → BusinessUnit | Restrict | NoCascade |

This has three consequences:
- Deleting a contract deletes its cost rows **and** its comments on the server. The canvas therefore leaves the cost delete commented out (L8122-8126), and its explicit comment `RemoveIf` (L8127) is redundant.
- Deleting a cost row (the equal-branch `RemoveIf`, W4) **unlinks** any payment-date comment from that month rather than deleting it.
- An `Assign` on a contract re-assigns its costs and comments.

**Plugin steps.** There are 14 in the solution, and **none is registered on `vsb_capexcost`, `vsb_capexprojectcontract` or `vsb_capexcomments`** (all 14 `SdkMessageProcessingStep` entries were read). The CAPEX-related ones are:

| Step | Trigger | What the DLL strings show | Fired by this screen? |
|---|---|---|---|
| `CapexContractPlugin.Plugins.InitialP50StandardCapexContractCreatePlugin` (`vsb_InitialCapexContractCreation.dll`) | `vsb_project` Update `vsb_initialp50trigger` (async) | Builds standard CAPEX contracts server-side: it reads assumptions, milestone durations and an aggregated generator count, and writes `vsb_capexprojectcontract` with `vsb_byclusterjson`, `vsb_totalcost`, `vsb_capexstandardassumptioncontract`, `vsb_initialcontractsource`, `vsb_isstandardcontract` and `owningbusinessunit`. It also logs `"Purge Capex Standard Contracts for Project {0} (Excluding Batch {1})"` and sets `vsb_capexstandardcontractscreated` | **No.** The screen never writes `vsb_project` |
| `vsb_InitialCapexCostsCreation.Plugins.InitialCapexCostsCreatePlugin` | `vsb_project` Update `vsb_capexstandardcontractscreated` (async) | Writes the `vsb_capexcost` rows and `vsb_averagepayment` for those contracts (`"Phase 4: Bulk Committing {0} Capex Costs & {1} Average Payment Updates"`, `UpdateMultiple`), then sets `vsb_capexstandardcostscreated` | No |
| `vsb_InitialP50StandardBOPContractsCreatePlugin` | `vsb_project` Update (3 flags) | BoP contracts | No |
| `VSB.Plugins.Capex.VSB_CapexAssumptionDeletion` | `vsb_devexcapexstandardassumptions` Delete (pre-validation) | Strings name `vsb_capexprojectcontract` and `vsb_capexstandardassumptioncontract`: it deletes the contracts linked to the deleted assumption, and their costs go by cascade (inferred from the strings plus §3) | No; it is fired from the Admin Cost screen |

**Flows.** None of the 15 workflow JSONs references `vsb_capexcost`, `vsb_capexprojectcontract`, `vsb_capexcomments` or `vsb_devexcapexstandardassumptions` (grep).

`LoadDevexCapexCostTotalCapacityTrigger` triggers on **`vsb_project`** Modified, with filtering attributes `vsb_planthydrogencapacity, vsb_plantpvcapacitymwp, vsb_plantstoragecapacity, vsb_plantwtgcapacity, vsb_plantsubstationcapacity`, at Organization scope. It creates a `vsb_fabricsyncjobs` row with the job type `"Recalculate Capex Standard Cost"`. The CAPEX screen writes none of those columns, so **its writes never fire this flow**.

**Formula columns.**
- `vsb_spvdevcomappingcapexdevex.vsb_accountnumber = vsb_NameSubAccount.vsb_number`, and `vsb_relatedaccountname = vsb_NameSubAccount.vsb_ParentAccount.vsb_name`.
- `vsb_project.vsb_totalcapacity` (see §2.7).

Both are read-only.

**Custom API.** `ProjectDocs/skeleton-reference/solution/customapi/vsb_CreateCapexStandardContract.json` and `…/plugins/CreateCapexStandardContract.cs` exist **only in the skeleton archive**. The real solution has:
- 0 occurrences of `CreateCapexStandardContract` in `customizations.xml`;
- no `customapi` entry in `VSBCloud (3).zip`;
- no `CustomApis` folder in `_extracted/VSBCloud/`.

The canvas never calls a custom API. It builds standard contracts in Power Fx (`btn_Capex_Cost_Add_Standard_Contract_Code`, L18223).

**What the client must NOT redo.**
1. Delete cost rows or comments of a deleted contract: the cascades do it.
2. Queue a Fabric recalculation, or write `vsb_fabricsyncjobs`, after a CAPEX edit. The canvas does not, and the only flow that does is keyed to project capacity.
3. Compute `vsb_accountnumber`, `vsb_relatedaccountname` or `vsb_totalcapacity`. These are formula columns, so read them, never write them.
4. Set `vsb_initialp50trigger` / `vsb_capexstandardcontractscreated` / `vsb_capexstandardcostscreated`, or re-implement the initial-P50 plugin batch. The screen's "Add Standard Contract" is a separate, per-assumption client path.
5. Delete contracts built from a removed assumption: `VSB_CapexAssumptionDeletion` does it on the Admin side.

---

### 2.14 Relationships (ER view)

```
vsb_project (Projects) ──1:N── vsb_capexprojectcontract.vsb_project            [RemoveLink]
   │ owningbusinessunit ─────────► businessunit  (source of every BU write)
   │ vsb_clusterstate ───────────► vsb_projectstate (.Order gates Link-to-Cluster list)
   │ vsb_country ────────────────► vsb_country
   └─(project) 1:N vsb_generatortypeinproject (vsb_numberofgenerators, statecode)

vsb_capexaccountlist (self-tree: 00001 → category → account → subaccount)
   │ vsb_parentaccount ──────────► vsb_capexaccountlist                          [RemoveLink]
   ├─1:N vsb_capexprojectcontract.vsb_account  (subaccount level)               [Cascade]
   ├─1:N vsb_spvdevcomappingcapexdevex.vsb_namesubaccount (DevCo/SPV default)  [RemoveLink]
   └─1:N vsb_devexcapexstandardassumptions.vsb_subaccount / vsb_category        [RemoveLink]

vsb_capexprojectcontract (cost line / "contract")
   ├─1:N vsb_capexcost.vsb_contract                                             [Cascade]
   ├─1:N vsb_capexcomments.vsb_capexcontract                                    [Cascade]
   ├─ vsb_linkedcluster ─────────► vsb_projectstate                             [RemoveLink]
   └─ vsb_capexstandardassumptioncontract ► vsb_devexcapexstandardassumptions   [RemoveLink]

vsb_capexcost (monthly row: year, month, cost, paid)
   ├─1:N vsb_capexcomments.vsb_capexcost  (payment-date comments)               [RemoveLink]
   └─ vsb_capexcontractstandardassumption ► vsb_devexcapexstandardassumptions   [RemoveLink]

vsb_capexcomments (threaded; one level of replies)
   ├─ vsb_parentcomment / vsb_rootcomment ► vsb_capexcomments                   [RemoveLink]
   └─ vsb_resolvedby ────────────► aaduser (Entra object id)                    [RemoveLink]

vsb_devexcapexstandardassumptions ── vsb_country ► vsb_country; vsb_technology (choice)
vsb_milestonesstandardassumptions  (Name = "average duration [months]", per country+technology)
```

---

## 3. Code app implementation

**Registration.** Every table above is in `ProjectCosts-CodeApp/power.config.json`, under `databaseReferences.default.cds.dataSources`, with its entity set:

| Key | Entity set |
|---|---|
| `capexcosts` | `vsb_capexcosts` |
| `capexprojectcontracts` | `vsb_capexprojectcontracts` |
| `capexcomments` | `vsb_capexcommentses` |
| `capexaccountlists` | `vsb_capexaccountlists` |
| `devex_capexstandardassumptions` | `vsb_devexcapexstandardassumptionses` |
| `spvdevcomappingcapexdevexes` | `vsb_spvdevcomappingcapexdevexes` |
| `projects` | `vsb_projects` |
| `projectstates` | `vsb_projectstates` |
| `milestonesstandardassumptions` | `vsb_milestonesstandardassumptionses` |
| `generatortypeinprojects` | `vsb_generatortypeinprojects` |
| `microsoftentraids` | `aadusers` |
| `businessunits` | `businessunits` |

`.power/schemas/appschemas/dataSourcesInfo.ts` carries them keyed by entity set (e.g. L99 `vsb_capexcommentses`, L106 `vsb_capexcosts`, L344, L449, L526). `connectionReferences` is `{}`, so the code app cannot call a flow. None is needed for this screen (§2.13).

**Names.**
- `src/data/dataverseNames.ts`:
  - `ES.capexProjectContracts` (L24), `ES.projects` (L30), `ES.projectStates` (L32), `ES.generatorTypeInProjects` (L41) and `ES.aadUsers` (L59);
  - `ES_ADMIN.devexCapexStandardAssumptions`, `.milestonesStandardAssumptions`, `.capexAccountLists`, `.capexCosts` and `.spvDevCoMapping` (L432-453).
  - There is **no `ES` entry for `vsb_capexcommentses`**: `data/comments.ts` uses the generated service and the literal set name in `bind(...)`.
- Option sets in `CHOICE_COST` (L547-605) match `DataSources.json` exactly:
  - `distributionType` {equal 952850000, individual 952850001};
  - `distributionScheme` {percentValues 952850000, absoluteValues 952850001};
  - `costPaidType` {none, devCo 952850001, spv 952850002};
  - `costUnit`;
  - `initialContractSource` {pcf 95285, powerapps 95289};
  - `capexCommentType` {1, 2};
  - `bit` (true/false).
- `CAPEX_MONTH_VALUES` 1–12 (L613), `DISTRIBUTION_FREQUENCY` (L621-627) and `CAPEX_SUMMARY_TAB_NAME` / `OVERLEVERAGING` (L658-661).

**Reads**, each with `$select` (rule 1), a server `$filter` built with `f.*`/`odata.ts` helpers (rule 2), and every page through `fetchAll` → `unwrap` (`client.ts:50-82`; rule 3):

| Canvas read | Code | `$select` | `$filter` | Tests |
|---|---|---|---|---|
| Accounts / subaccounts (`App.OnStart`) | `costBook.ts:767-822` `loadCostAccounts` | `vsb_capexaccountlistid, vsb_number, vsb_name, vsb_order, _vsb_parentaccount_value` | `statecode eq 0` (whole table), tree built client-side | UT-BOOK-001…007 |
| Categories | `costBook.ts:744-765` `loadCapexCategories` | same | `statecode eq 0` | UT-BOOK-047…049 |
| Contracts (`colCapexProjectContracts`) | `costBook.ts:1013-1115` `loadCostLines` | `vsb_capexprojectcontractid, _vsb_account_value, vsb_name, vsb_description, vsb_costtype, vsb_totalcost, vsb_depreciation, vsb_applyvat, vsb_isstandardcontract, vsb_distribution, vsb_distributionscheme, vsb_distributionfrequency, vsb_byclusterjson, vsb_bystartenddatejson, _vsb_capexstandardassumptioncontract_value, _vsb_linkedcluster_value` | `_vsb_project_value eq …` **and** `_vsb_account_value` in (the category's level-2 **and** level-3 ids, 40 per chunk) **and** `statecode eq 0` | UT-BOOK-008…015, 042-045 |
| Cost rows (`colCapexCosts`) | `costBook.ts:1130-1166` `loadPayments` | `vsb_capexcostid, _vsb_contract_value, vsb_year, vsb_month, vsb_cost, vsb_costpaid` | `_vsb_contract_value` in (contracts), `statecode eq 0` | UT-BOOK-025…031 |
| Summary totals | `costBook.ts:1216-1303` `loadCapexTotals` / `loadContractCostSums` | `vsb_capexprojectcontractid, _vsb_account_value`; `_vsb_contract_value, vsb_cost` | project + ACTIVE; contract-in + ACTIVE, `maxPageSize: 5000` | UT-BOOK-032…038 |
| SPV/DevCo mapping | `costBook.ts:155-173` `loadPayerDefaults` | `vsb_spvdevcomappingcapexdevexid, _vsb_namesubaccount_value, vsb_devcospv` | `statecode eq 0` (whole table) | UT-BOOK-012…015 |
| Project States | `costBook.ts:859-875` `loadProjectStates` | `vsb_projectstateid, vsb_name, vsb_order` | `statecode eq 0` | UT-BOOK-046 |
| Milestones Standard Assumptions | `costBook.ts:951-988` | the six duration columns + 3 others | `vsb_name eq 'average duration [months]'` and country and technology and ACTIVE, `top: 1` | UT-BOOK-050…053 |
| Standard assumptions | `data/standardContracts.ts:19-56` `loadStandardAssumptions` | id, `vsb_description, _vsb_subaccount_value, _vsb_country_value, vsb_technology, vsb_costamount, vsb_unit, vsb_costpaidby, vsb_distributionfrequency, vsb_applyvat, vsb_depreciation, vsb_cluster1…5` | **`statecode eq 0` only**. The subaccount, country and technology narrowing is client-side (`standardContracts.ts:36-38`, `features/…/standardContracts.ts:121-127`) | — |
| GeneratorTypeInProjects | `data/standardContracts.ts:59-69` `loadActiveWtgCount` | `vsb_generatortypeinprojectid, vsb_numberofgenerators, statecode` | project + ACTIVE | — |
| Comments | `data/comments.ts:64-96` `loadComments` | `vsb_capexcommentsid, vsb_comment, _vsb_capexcontract_value, _vsb_capexcost_value, _vsb_parentcomment_value, _vsb_rootcomment_value, vsb_commenttype, vsb_resolved, _vsb_resolvedby_value, createdon, _createdby_value` | `_vsb_capexcontract_value` in (contracts), ACTIVE. The canvas's `|| 'Capex Cost' in …` half is deliberately dropped (L41-63) | UT-CMT-* (panel) |
| Projects | `data/project.ts:128-225` | including `_owningbusinessunit_value`, `vsb_startcluster`, `_vsb_clusterstate_value`, `vsb_totalcapacity`, the 7 date columns and `_vsb_country_value` | `vsb_projectid eq … and statecode eq 0`, `top: 1` | UT-PROJ-001…005 |

**Writes** (`src/data/capexWrites.ts`, reached through `costRepository.ts:317-324` and `useCostBook.ts:382-424`):

- **`setCostPaid`** (`:53-58`): `Vsb_capexcostsService.update(costId, {vsb_costpaid})` through `unwrap`. It is the canvas's W1. The month is resolved client-side by `resolvePaidTarget` (`Screen.tsx:438-442`); a missing row shows "No monthly cost row found for the selected contract/month/year."
- **`saveCostLine`** (`:107-294`), the canvas's C1/C2/C3 and W2–W5:
  - Contract fields:
    - `vsb_name` and `vsb_description` (both = description);
    - `vsb_costtype` (DevCo/SPV only);
    - `vsb_applyvat`, `vsb_depreciation`, `vsb_distribution`;
    - `vsb_distributionscheme` and `vsb_distributionfrequency`, both **always**;
    - `vsb_totalcost` when set;
    - for equal distributions only: `vsb_byclusterjson`, `vsb_bystartenddatejson` and `vsb_averagepayment` (`String(...)`);
    - `vsb_isstandardcontract`;
    - `vsb_CapexStandardAssumptionContract@odata.bind` **on create only**;
    - `vsb_LinkedCluster@odata.bind`: a bind, or `null` on update.
  - On create it adds `vsb_Project@odata.bind`, `vsb_Account@odata.bind` and `owningbusinessunit@odata.bind` (`:224-238`). On update it sends none of those three (`:215-222`).
  - Cost rows go through `capexWriteSet` (`features/…/writeSet.ts`). An existing row gets update `{vsb_cost}` only. A new row is created with `{vsb_cost, vsb_year, vsb_month, vsb_Contract@odata.bind, owningbusinessunit@odata.bind}` (`:262-282`). Deletes go through `deleteRecord` (`:289-291`; rule 14).
  - The relink reset (`:244-252`) sets every paid month unpaid **and deletes every payment-date comment** (`deleteComment`). Tests: UT-BOOK-058, UT-BOOK-059.
- **`deleteCostLine`** (`:329-343`): the contract's comments (`deleteComment`, raw generated `delete`), then each cost row (`deleteRecord`), then the contract (`deleteRecord`). It is marked `DIVERGENCE:` at `:315-328`. Tests: UT-CAPEXW-001…003, UT-BOOK-039…041.
- **Standard contract** (`Screen.tsx:388-421`): a client-side money calculation (`standardAssumptionAmount`, `features/…/standardContracts.ts:45-60`) and distribution over the **eligible clusters only** (`clusterPayments`, `rules.ts:198-223`). It is saved through `saveCostLine` with `isNew: true`, `standard: true`, `standardAssumptionId` and `totalCost: amt`.
- **Comments** (`data/comments.ts:155-216`): a create/update split.
  - All nine canvas fields are written, plus `owningbusinessunit@odata.bind` on create.
  - `vsb_ResolvedBy@odata.bind` → `/aadusers(<Entra id>)`.
  - Updates send `null` binds to clear lookups.
  - `deleteComment` (`:218-220`) calls `Vsb_capexcommentsesService.delete(id)` directly.
  - Tests UT-CMT-079…086 pin the payload.

**BU** (rule 4). `owningBusinessUnitId` comes from `project._owningbusinessunit_value` (`project.ts:168, 211`) through `useCostBook.ts:413` and `:610`. It is written in the bound-navigation form `owningbusinessunit@odata.bind` on every create: contract (`capexWrites.ts:233-235`), cost (`:275-277`) and comment (`comments.ts:209-211`, UT-CMT-079).

---

## 4. Gaps: Code app vs Canvas

| ID | Area | Canvas behaviour (cite) | Code app behaviour (cite) | Type | Status | Severity | Notes |
|---|---|---|---|---|---|---|---|
| GAP-DV-01 | Paid toggle on an Individual + cluster-linked contract | After the confirm, it first runs `Patch('CAPEX Project Contracts', varGetContract, {'Linked Cluster': Blank()})`, then `Select(Btn_CodeforSettingCostPaidUnpaid)` (`L19875`; gate `L7431-7434`) | The dialog is shown (`Screen.tsx:449`, `:1028-1036`), but `onConfirm` only calls `writes.setPaid.mutate`. `setCostPaid` writes `vsb_costpaid` alone (`capexWrites.ts:53-58`). **`vsb_linkedcluster` is never cleared** | Data | Missing | High | The dialog text promises the link is removed. The contract stays linked, so the next paid toggle asks again and the grid keeps "Link to Cluster N". There is no D-entry. D39 §3 / gap-analysis UX-3 cite this `OnConfirm` but did not check the code's write |
| GAP-DV-02 | Standard contract money | Payments are generated over **all** ticked clusters with valid spans (`L18705-18757`), with avg/last based on that count (`L18810-18819`). **Only the eligible clusters' rows are written** (`L18839-18889`), and `'Total Cost'` is re-stated as their sum (`L18890-18899`), which is less than the computed amount when the start cluster > 1 | The whole computed amount is distributed over the eligible clusters only (`Screen.tsx:397-405`; `rules.ts:198-223`), with `totalCost: amt` (`Screen.tsx:413`) and `vsb_averagepayment` from the eligible count (`capexWrites.ts:174-180`) | Data / Functional | Divergent-unmarked | High | Changes the stored `vsb_cost`, `vsb_totalcost` and `vsb_averagepayment` for any acquired project whose assumption ticks clusters before its start cluster. Needs a D-entry and a `…CanvasParity` twin (rule 8) |
| GAP-DV-03 | Standard-contract cost rows | Each row writes `'Capex Contract Standard Assumption': locStandardContractAssumption` (`L18886`) | The cost create payload has no `vsb_CapexContractStandardAssumption@odata.bind` (`capexWrites.ts:270-279`). No code path writes the column (grep) | Data | Missing | Med | Any downstream consumer (Fabric, reports) that ties a cost row to its assumption sees blanks for code-app rows (inferred). `VSB_CapexAssumptionDeletion` keys on the contract lookup instead, so the cascade still works |
| GAP-DV-04 | `Initial Contract Source` on create | C1/C2/C4 write `Coalesce(existing, 'Initial Contract Source (…)'.Powerapps)` (`L17574 (992-995, 1565-1568)`, `L18668-18671`) | Never written by `saveCostLine` (`capexWrites.ts:115-190`), so contracts created from DEVEX/CAPEX have a blank source. Add Cost from Table does read and write it (`addCostSheet.ts:71, 120, 177`) | Data | Missing | Med | Breaks the canvas warning in GAP-DV-05 for code-created rows. The server plugin also writes this column (DLL strings), so it is used |
| GAP-DV-05 | `$select` of `vsb_iseditedfrompcf` / `vsb_initialcontractsource` | The panel's warning container is `Visible` when `'Is Edited from PCF?' = Yes && 'Initial Contract Source' = Powerapps && Not(IsBlank(locSelectedProjectContract))` (`L12444-12451`) | `loadCostLines` selects neither column (`costBook.ts:1025-1035`), so the condition cannot be evaluated. `useCostBook.ts:430-431` states the grid "never reads" them | Data / UI | Missing | Med | The UI half belongs to `08-…PANEL.md`. The data half is here |
| GAP-DV-06 | `Capex Standard Assumption Contract` on a panel save | C1 and C2 write `If(locSelectedCostRow.IsStandardContract, Blank())`. **Both arms are blank**, so every panel save clears the link (`L17574 (997-1000, 1570-1573)`). That makes the assumption offerable again for that subaccount (`L472-477`) | Bound once on create, never cleared (`capexWrites.ts:184-189`) | Data | Divergent-unmarked | Med | Probably a canvas defect. Its effects: after an edit, (a) the canvas lets the user add the same standard contract twice; (b) the canvas contract survives `VSB_CapexAssumptionDeletion`, while a code-app one does not (inferred from the DLL strings). Needs an owner decision and a `SOURCE DEFECT:` marker |
| GAP-DV-07 | Relink reset deletes payment-date comments | The **live** relink popup runs only `UpdateIf('CAPEX Costs', … 'Cost Paid' = true, {'Cost Paid': false})` (`L20055-20059`). Its `RemoveIf('Capex Comments', … 'Comments to payment date')` is commented out (`L20061-20065`). The only live copy is in `cmp_PopUp_Confirmation_1`, which is `Visible: false` (`L396-399`, `L425-427`) | Deletes every payment-date comment of the contract (`capexWrites.ts:248-251`). The header comment `:82-92` claims the canvas does this | Data | Divergent-unmarked | Med | Deletes user data the canvas keeps. UT-BOOK-058 pins the code's behaviour, so the test would change too. The code comment cites the `.txt` flattening (`CapexScreenCode.txt:19906-19925`), not the `.pa.yaml` ground truth |
| GAP-DV-08 | Comment delete error surfacing (rule 14) | The canvas uses `RemoveIf` inside the Save's `IfError` (`L10144-10157`) | `deleteComment` calls the generated `Vsb_capexcommentsesService.delete(id)` (`comments.ts:218-220`), whose result is discarded. Used by `deleteCostLine` (`capexWrites.ts:336`), the relink reset (`:250`) and the comments panel (`useCostBook.ts:612`) | Data | Missing | Med | A refused comment delete looks like success. The contract and cost deletes were moved to `deleteRecord`, so D38 §2 / H-2 is now only half true |
| GAP-DV-09 | Contract delete order | `RemoveIf` comments, then `Remove` contract. The cost delete is commented out, so costs (and comments) go by cascade (`L8122-8134`; cascades in §2.13) | Comments, then every cost row, then the contract (`capexWrites.ts:329-343`). It is marked `DIVERGENCE:` at `:315-328`, but its rationale ("a server-side relationship setting no test or type here can pin") is answered by `customizations.xml`: both relationships are `CascadeDelete = Cascade` | Perf / Data | Divergent-marked | Low | D38 §7 (L-7). It costs one request per cost row; one contract can have hundreds of months. It also redoes server work (§2.13, item 1) |
| GAP-DV-10 | `statecode` filters on cost and master tables | No status condition on contracts (`App.pa.yaml:L205`, `L729-736`), costs (`L205`, `L749-752`), comments (`L1060-1063`), categories (`L205`), the SPV mapping, project states (`L11437-11442`), standard assumptions (`L463-477`) or milestone assumptions (`L18300-18303`). A status filter is applied only to accounts and subaccounts (`L205`) and to `GeneratorTypeInProjects` (`L18247`) | `ACTIVE` (`odata.ts:103`) on every one of those reads (`costBook.ts:163, 753, 776, 866, 969, 1036, 1141, 1227, 1280`; `standardContracts.ts:33, 65`; `comments.ts:78`) | Data | Divergent-unmarked | Low | No app path deactivates CAPEX cost or contract rows (Admin zeroes or deletes them, `adminCapexAccounts.ts:391-396`), so the visible effect today is limited to an inactive category, project state or assumption (inferred). It mirrors D45 G2 (Overview). Not marked |
| GAP-DV-11 | Project read filter | `LookUp(Projects, Project = GUID(Param("projectId")))`, no status (`L40-56`; `App.pa.yaml:L205`) | `vsb_projectid eq … and statecode eq 0` (`project.ts:170`). An inactive project yields `undefined` | Data | Divergent-unmarked | Low | The CAPEX screen cannot open on an inactive project; the canvas can. Overlaps with `01-EDIT-COST-MODULE.md` |
| GAP-DV-12 | Standard-assumption query not narrowed on the server (rule 2) | Non-delegable (`Lower(Text(Technology))`, sarif @647/@680), so it is evaluated locally over ≤ 2,000 rows (`Properties.json`) | Fetches **every active assumption** in all pages and filters by subaccount (`standardContracts.ts:23-38`), then by country and technology (`features/…/standardContracts.ts:121-125`). `useStandardAssumptions`' doc comment says it is "scoped" (`useCostBook.ts:483-487`) | Perf | Partial | Low | Unlike the canvas, there is no 2,000-row truncation. Server filters on `_vsb_country_value`, `vsb_technology` and `_vsb_subaccount_value` (`lookupIn`) are all available in `odata.ts` |
| GAP-DV-13 | Standard-option name and order | Options sorted by `"AutoId"` (`L715`). The name is `Coalesce(vsb_description, vsb_descriptioninput, "Standard Contract " & Text(vsb_autoid))` (`L703-707`; hidden bar `L3214-3217`) | `vsb_autoid` and `vsb_descriptioninput` are not selected (`standardContracts.ts:27-32`). The name is `description` only and the order is the catalogue order (`Screen.tsx:384-386`) | Data / UI | Missing | Low | An assumption with a blank Description shows an empty menu item; the canvas shows "Standard Contract N" |
| GAP-DV-14 | Click-time duplicate check | A server `LookUp('CAPEX Project Contracts', project && account && assumption)` at click (`L7379-7389`), plus `Refresh` and rebuild (`L7409-7412`) | `alreadyExists: !option`, worked out from the same in-memory list the menu was built from (`Screen.tsx:389-393`). `checkStandardContractClick`'s doc claims it is a re-check against staleness (`features/…/standardContracts.ts:133-138`) | Data | Partial | Low | Two tabs or two users can create the same standard contract twice |
| GAP-DV-15 | Standard contract `Cost Type` | `'Cost Type': locStandardContractAssumption.'Cost Paid By'`, written as-is, including None 952850000 (`L18665`) | `payer: costPaidBy === 952850001 ? "DevCo" : "SPV"` (`Screen.tsx:408`), then `vsb_costtype` DevCo/SPV only (`capexWrites.ts:122`) | Data | Divergent-unmarked | Low | An assumption with None gets SPV stored |
| GAP-DV-16 | Cost-row `Name` | `Name: Item.Contract.Name` on equal re-creates (`L17574 (1788)`) and on standard rows (`L18855`). Not written by the individual branch | `vsb_name` is never written on `vsb_capexcost` (`capexWrites.ts:270-279`) | Data | Missing | Low | A cosmetic or reporting column; the screen itself does not read it |
| GAP-DV-17 | Equal save: delete-all-then-recreate | `RemoveIf('CAPEX Costs', contract)`, then create every month (`L17574 (1776-1831)`), gated on the change flags (`:1579-1586`). This loses `Cost Paid`, and payment-date comments lose their `vsb_capexcost` link (RemoveLink) | Reconciles in place on every save (`Screen.tsx:614-628`; `capexWrites.ts:254-291`) | Data / Perf | Divergent-marked | Low | D38 §6 (L-6). The code keeps paid flags and comment links |
| GAP-DV-18 | New equal contract: `Average Payment` / `Linked Cluster` | C3 patches `LookUp(colCapexProjectContracts, … locSelectedCostRow.vsb_capexaccountlistid)`, which is blank on Add (inferred), so neither is stored | Both written on create (`capexWrites.ts:174-180, 207-238`) | Data | Divergent-marked | Low | D38 §8 / C-7. The marker sits in `Screen.tsx:629-640`, not at the write site (D38 §8 follow-up) |
| GAP-DV-19 | Comment load filter | `'Capex Contract' in … \|\| 'Capex Cost' in …` (`L1060-1063`) | Contract clause only (`comments.ts:64-81`), with the narrowing documented in place (`:41-63`) | Data | Divergent-marked | Low | Documented as "DELIBERATE NARROWING", not with the `DIVERGENCE:` keyword, and there is no D-entry. A RemoveLink'ed payment-date comment (GAP-DV-17's canvas side) keeps its contract link, so it is still loaded |
| GAP-DV-20 | Contract update payload | C1 and C2 re-send `Account`, `Project` and `'Owning Business Unit'` on every edit (`L17574 (964, 968, 991)`) | An update sends neither the `vsb_Project`/`vsb_Account` binds nor `owningbusinessunit` (`capexWrites.ts:215-222`) | Data | Divergent-unmarked | Low | Account and project cannot change from the panel (inferred). The canvas edit also re-homes a contract to the project's current BU; the code does not |
| GAP-DV-21 | Contract query scope | Contracts are shown only under level-3 subaccounts (`L1043-1049`; reload `L733`) | `lookupIn("vsb_account", …)` over the category's level-2 accounts **and** level-3 subaccounts (`costBook.ts:1183-1186, 1036`) | Data | Code-app-only | Low | Whether a contract filed on a level-2 account then renders in the grid was not verified (`gridRows.ts` not read) |
| GAP-DV-22 | Columns written beyond the canvas | Individual Patch: no `'Distribution Frequency'` (`L17574 (963-1006)`). Equal Patch: no `'Distribution Scheme'` (commented out, `:1513-1520`). Standard Patch: neither scheme nor the start/end JSON (`L18648-18700`) | `vsb_distributionfrequency` and `vsb_distributionscheme` are always written; `vsb_bystartenddatejson` is written as an empty-date JSON on an equal save in cluster mode, including standard contracts (`capexWrites.ts:138-164`) | Data | Code-app-only | Low | The scheme superset is explained in place (`:127-137`); the frequency is not |
| GAP-DV-C | **Covered (group)** | (a) every table registered and named; (b) BU bound on every create, in write form; (c) every read paged through `fetchAll`/`unwrap` with `$select` and a server `$filter`; (d) cost and contract deletes through `deleteRecord`; (e) individual-distribution upsert/delete rule (`Not(IsBlank(Cost)) && (Cost <> 0 \|\| existing)`); (f) `Linked Cluster` write and clear; (g) the comment Patch field set, the `aaduser` resolver, and the OBU on comments; (h) payer fallback `Coalesce('Cost Type', mapping.'DevCo/SPV')`; (i) the milestone-duration lookup; (j) the active WTG sum; (k) Summary totals from cost rows floored at 0, against the grid total from `vsb_totalcost`; (l) option-set values | (a) `power.config.json`, `dataverseNames.ts`; (b) `capexWrites.ts:233-235, 275-277`, `comments.ts:209-211`; (c) §3 table; (d) `capexWrites.ts:289-291, 337-342`; (e) `writeSet.ts`; (f) `capexWrites.ts:207-238`; (g) `comments.ts:155-216`; (h) `costBook.ts:1091, 1118-1127`; (i) `costBook.ts:951-988`; (j) `standardContracts.ts:59-69`; (k) `costBook.ts:1270-1303`; (l) `CHOICE_COST` | Data | Covered | — | UT-CAPEXW-001…003, UT-CMT-079…086, UT-BOOK-012…015, 025…059 |

**There are 22 non-Covered rows.**

| Status | Count | Rows |
|---|---|---|
| Missing | 7 | 01, 03, 04, 05, 08, 13, 16 |
| Divergent-unmarked | 7 | 02, 06, 07, 10, 11, 15, 20 |
| Divergent-marked | 4 | 09, 17, 18, 19 |
| Partial | 2 | 12, 14 |
| Code-app-only | 2 | 21, 22 |

| Severity | Count | Rows |
|---|---|---|
| High | 2 | 01, 02 |
| Med | 6 | 03–08 |
| Low | 14 | 09–22 |

---

## 5. Open questions / not verifiable from source

1. **GAP-DV-02 intent.** Is the canvas's "distribute over all ticked clusters, then keep the eligible share" deliberate? It books a pro-rata cost for an acquired project. Or is it a defect? Only the product owner can say. The server plugin `InitialCapexCostsCreatePlugin` faces the same question, and its algorithm can be read only from the DLL, not from its strings.
2. **GAP-DV-06.** Is clearing `Capex Standard Assumption Contract` on edit intended (an "it is no longer standard once edited" semantics)? Note that `Is Standard Contract?` is also flipped to false on edit (L11483-11490, owned by `08-…`). This needs a live canvas run to confirm the duplicate-offer effect.
3. **`vsb_totalcost` is `int`.** The panel accepts decimals: the canvas uses `Value(txt.Value)` and the code `Number(costValue)`. What Dataverse does with a fractional value (reject or round) needs a live write.
4. **C3 on Add (GAP-DV-18).** Whether `Patch(DS, Blank(), {...})` errors or silently no-ops was inferred, not observed.
5. **`VSB_CapexAssumptionDeletion` scope.** Its string table names only the contract lookup. Whether it also scans `vsb_capexcost.vsb_capexcontractstandardassumption` cannot be read from strings.
6. **The initial-P50 plugin's "Purge Capex Standard Contracts".** Whether it removes standard contracts added through this screen, when `vsb_initialp50trigger` fires again, needs a decompile or a live test (inferred risk).
7. **Inactive rows.** No live query was run to see whether any `statecode = 1` CAPEX contract, cost, comment, project state or assumption exists in VSBCloud_Dev (GAP-DV-10 impact).
8. **GAP-DV-21.** Whether a contract filed directly on a level-2 account exists in live data, and whether `gridRows.ts` renders it.
9. **`yearlymonth_options`.** The values 1–12 were taken from `DataSources.json`. `dataverseNames.ts:607-612` itself still says "confirm against the metadata endpoint".

---

## 6. Doc disagreements

| Doc / place | Claim | Source says |
|---|---|---|
| `ProjectDocs/app-docs/gap-analysis/cost-capex-costs.md` D11 | The individual save is COVERED, "Initial Contract Source … Capex Standard Assumption Contract" included | `saveCostLine` writes neither `vsb_initialcontractsource` nor the canvas's clearing of `vsb_capexstandardassumptioncontract` (GAP-DV-04, GAP-DV-06) |
| same, D13 | Paid toggle COVERED | The `'Linked Cluster': Blank()` Patch of the cluster-linked branch (`L19875`) is not implemented (GAP-DV-01) |
| same, D15 and `02-OPEN-DECISIONS.md` D38 §2 (H-2) | `capexWrites.ts` calls the generated `delete()` directly for costs and contracts | Fixed: both go through `deleteRecord` (`capexWrites.ts:289-291, 337-342`; UT-CAPEXW-001/002). The comment delete is still raw (`comments.ts:218-220`; GAP-DV-08) |
| same, D18 | Tables used: 7 | Plus `vsb_spvdevcomappingcapexdevexes`, `vsb_milestonesstandardassumptionses`, `vsb_generatortypeinprojects` and `aadusers` (§2.0) |
| `ProjectCosts-CodeApp/src/data/capexWrites.ts:82-92` | The canvas relink `OnConfirm` runs `RemoveIf('Capex Comments', … payment date)` | Commented out in the live popup (`L20061-20065`). The live copy sits only in the invisible `cmp_PopUp_Confirmation_1` (`L396-399`, `Visible: false` `L425-427`) |
| `capexWrites.ts:315-328` | The cascade "is a server-side relationship setting no test or type here can pin" | `customizations.xml` pins it: `vsb_capexcost_Contract_…` and `vsb_capexcomments_CapexContract_…` are both `CascadeDelete = Cascade` |
| `ProjectCosts-CodeApp/src/data/comments.ts:147-149` | "the canvas has … no `owningbusinessunit`" on comments | The canvas comment Patch writes `'Owning Business Unit': gblSelectedProject.'Besitzer (Unternehmenseinheit)'` (`L10203`) |
| `ProjectCosts-CodeApp/src/features/cost/costing/useCostBook.ts:483-487` | `useStandardAssumptions` "scopes the assumptions query to the sub-accounts on screen" | The query is `statecode eq 0` only. Scoping is client-side after fetching every row (`standardContracts.ts:23-38`) |
| `features/cost/capex-costs/standardContracts.ts:9-12` | "the canvas' equivalent (`vsb_CreateCapexStandardContract`) does not exist in this environment" | It is not the canvas's equivalent. The canvas never calls a custom API; the API exists only in `skeleton-reference/` (§2.13). The conclusion (no custom API) is right |
| `ProjectDocs/migration-plans/04-flow-inventory.md` L80 | `LoadDevexCapexCostTotalCapacityTrigger` owners include "Capex Costs" ("after project cost edits") | The flow triggers only on `vsb_project` plant-capacity columns, and the CAPEX screen writes none of them. The verified map at the top of the same file (L29) is correct |
| `ProjectDocs/instructions/PROJECT-MAP.md` and `04-flow-inventory.md` L49-51 | `VSBCloud (3).zip` is "not in this workspace" / only in the WorkDev1 sibling | It is present at `ProjectDocs/Existing Solution/VSBCloud (3).zip`, with all 11 plugin DLLs under `PluginAssemblies/` |
| `features/cost/capex-costs/standardContracts.ts:133-138` | `checkStandardContractClick` is re-checked "at the moment of the click rather than trusted from the menu build" | `alreadyExists` comes from the same in-memory options list (`Screen.tsx:389-393`). Nothing is re-read (GAP-DV-14) |
