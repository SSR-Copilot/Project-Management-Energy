# 14 · PCF controls (code components) on the DEVEX/CAPEX Costs screen

Gap ID prefix: **GAP-PCF**. Analysis date: 27 Oct 2026, branch `RounakDev1`. All paths are
relative to the workspace root `C:\Personal\Code App Mordenization\Project-Management-Energy\`.
In this document, "YAML" means `ProjectDocs/_extracted/msapp/projectcosts/Src/Capex Costs Screen.pa.yaml`
unless another file is named.

---

## 1. Scope

This document covers every code component (PCF) that runs on the canvas **Capex Costs Screen**,
either placed on the screen directly or inside a canvas component that the screen hosts. For each
one it records the manifest, the bindings, the outputs and how the screen consumes them, the
internal behaviour, the CSS and any WebAPI use. It also records how the code app replaces each one.

Sibling files own the areas next to this one:
- 01 owns the header and nav behaviour.
- 07 owns the grid's load sequence and its hidden code buttons.
- 08 owns the Add/Edit panel.
- 09 owns the comments panel.
- 05 owns Tosca identities in general.

This file covers only the PCF contract and the vendored renderer.

### 1.1 Inventory: every `Control: CodeComponent` reachable from the screen

| # | Instance (YAML) | Component | Version¹ | Where | Live? |
|---|---|---|---|---|---|
| P1 | `DevexCapexSummaryPCF` (L7234) | `vsb_Dev.DevexCapexSummaryPCF` (custom) | 1.1.1 | `con_Costs_ContentCostsInMonths` | **Yes**: the cost grid |
| P2 | `cmp_Hotfix_CDN_FluentUI` (L2300) | `ckfix_CreatorKit.Hotfix.HotfixCDNFluentUI` | 0.0.1 | screen root, 10×10 | Yes (CSS only) |
| P3 | `cmd_Costs_ProjectCosts_TableCommandBar` (L3083) | `cat_PowerCAT.CommandBar` | 1.1.29 | `con_Costs_ProjectCosts_TableCommandBar` | **No**: control and container both `Visible: =false` (L3080, L3566) |
| P4 | `pcf_Costs_ProjectCosts_TableNavigation_NextYear` (L3599) | `cat_PowerCAT.Icon` | 1.1.29 | `con_Costs_ProjectCosts_GalleryNavigation` | **No**: container `Visible: =false` (L3595) |
| P5 | `pcf_Costs_ProjectCosts_TableNavigation_PreviousYear` (L3672) | `cat_PowerCAT.Icon` | 1.1.29 | same | **No** (same container) |
| P6 | `btn_Capex_Comment_Cancel` (L10224) | `cat_PowerCAT.Icon` | 1.1.29 | comments right panel | Yes |
| P7 | `btn_SaveCost_Execute____` (L17605) | `cat_PowerCAT.Icon` | 1.1.29 | Add/Edit panel buttons | **No**: `Visible: =false` (L17692), and the name occurs exactly once in `Src/` (never `Select`ed) |
| P8 | `pcf_btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Cancel_2` (L18155) | `cat_PowerCAT.Icon` | 1.1.29 | Add/Edit panel buttons | Yes |
| P9 | `pcf_HeaderContainerReportError_WarningIcon` (`cmp_Header.pa.yaml:491`) | `cat_PowerCAT.Icon` | 1.1.29 | inside `cmp_Costs_Header` (L2323) | Yes |
| P10 | `pcf_HeaderContainerReportError_CommandBar` (`cmp_Header.pa.yaml:507`) | `cat_PowerCAT.CommandBar` | 1.1.29 | inside `cmp_Costs_Header` | Yes |
| P11 | `pcf_cmpHeader_User_ContextMenu_Info` (`cmp_Header.pa.yaml:605`) | `cat_PowerCAT.ContextMenu` | 1.1.29 | inside `cmp_Costs_Header` | Yes |
| P12 | `pcf_Left_Navigation_Menu` (`cmp_Left_Navigation.pa.yaml:150`) | `cat_PowerCAT.Nav` | 1.1.29 | inside `cmp_Costs_Left_Navigation` (L2372) | Yes |
| P13 | `pcf_ico_Information_Button` (`cmp_Information_Button_PCF.pa.yaml:87`) | `cat_PowerCAT.Icon` | 1.1.29 | inside `cmp_ShowErrorInContract` (L19760) | Yes (conditional) |
| P14 | `pcf_PopUpConfirmation_BodyButtons_Confirm/_Cancel` (`cmp_PopUp_Confirmation.pa.yaml:200/228`) | `cat_PowerCAT.Icon` | 1.1.29 | `cmp_PopUp_Confirmation_1` (L303), `cmp_PopUp_SubaccountCostsDeletion_Confirmation` (L8088) | Yes |
| P15 | `pcf_PopUpConfirmation_BodyButtons_Confirm_1/_Cancel_1` (`cmp_PopUp_Confirmation_New.pa.yaml:239/267`) | `cat_PowerCAT.Icon` | 1.1.29 | `cmp_PopUp_Confirmation_For_SetasPaidUnpaidCostConfirmation` (L19864), `…_SetClusterLinkingConfirmationPopup` (L19884) | Yes |
| P16 | `pcf_ReportErrorRightPanel_BodyButtons_Cancel/_Save/_Clear` (`cmp_ReportErrorRightPanel.pa.yaml:333/373/428`) | `cat_PowerCAT.Icon` | 1.1.29 | `cmp_ReportErrorRightPanel_CapexCosts` (L8081) | Yes |

¹ Versions are read from the template records in
`ProjectDocs/_extracted/msapp/projectcosts/Controls/116.json` (the screen's control JSON, `"Template": {"Id": …, "Version": …}`).

**No comments PCF exists.** The comments right panel (L8156–10248) is built from canvas controls.
Its only code component is the PowerCAT Cancel icon P6. `Comments_PCF_CodeSnippets.txt` is
flattened canvas Power Fx: it is not a PCF.

### 1.2 Files read

**Canvas:**
- YAML ranges: L11–301, L452–721 (option builder, partly), L1014–2299, L2300–2415, L3060–3716, L7225–7768, L8226–8243, L10224–10248, L17605–17697, L18150–18205, L19760–19834.
- Components: `cmp_Header.pa.yaml:470–707`, `cmp_Left_Navigation.pa.yaml` (whole file), `cmp_Information_Button_PCF.pa.yaml` (whole file).
- `App.pa.yaml:205`: the `gblClusterDurations` definition, inside OnStart.

**PCF source** (clone at commit `5f12280`, "Control Version bumped to 1.1.1", from `.git-backup-clone`):
- `ProjectDocs/Existing Solution/PCF Git Repo Clones/DevexCapexSummaryPCF/TableConnectedToDataversePCF/`: `ControlManifest.Input.xml`, `index.ts`, `ui/GridRenderer.ts`, `ui/ActionDropdown.ts`, `services/DatasetParser.ts`, `css/…css`.

**Shipped artefacts:**
- `ProjectDocs/_extracted/VSBCustomComponents/Controls/vsb_Dev.DevexCapexSummaryPCF/` (`ControlManifest.xml`, `bundle.js`, the CSS), and `solution.xml`: `VSBCustomComponents` **1.0.0.115**.
- `ProjectDocs/_extracted/msapp/projectcosts/Resources/Controls/` (the bundles and CSS embedded in the .msapp).

**Code app:**
- `features/cost/capex-costs/`: `PcfGrid.tsx`, `pcf/ui/GridRenderer.js` and `.d.ts`, `pcf/ui/ActionDropdown.js` and `.d.ts`, `pcf/services/DatasetParser.js`, `pcf/css/TableConnectedToDataversePCF.css`, `gridRows.ts`, `gridRows.test.ts`, `pcfGridFormat.test.ts`, and the PCF-relevant parts of `Screen.tsx`, `rules.ts` and `standardContracts.ts`.
- `data/standardContracts.ts` and `data/costBook.ts` (the excerpts cited).
- `components/AppHeader.tsx`, `components/LeftNav.tsx`, `styles/canvas.css`, `styles/pcfCascade.test.ts`.
- `scripts/read-pcf-port.mjs`.

**Docs:** `ProjectDocs/app-docs/PCF-RENDERER-PORT.md`, `ProjectDocs/migration-plans/03-pcf-inventory.md`, `09-tosca-automation-conventions.md`, `02-OPEN-DECISIONS.md` D16, and `gap-analysis/cost-capex-costs.md` B7/U14.

---

## 2. Canvas implementation

### 2.1 P1 · `vsb_Dev.DevexCapexSummaryPCF`: the cost grid

#### 2.1.1 Identity and manifest

- **Namespace / constructor / version:** `namespace="Dev" constructor="DevexCapexSummaryPCF" version="1.1.1"`, `control-type="standard"` (`ControlManifest.Input.xml:3`). Canvas registers it as `vsb_Dev.DevexCapexSummaryPCF` (YAML L7236); `vsb_` is the publisher prefix.
- **The packaged manifest is the same contract.** `_extracted/VSBCustomComponents/Controls/vsb_Dev.DevexCapexSummaryPCF/ControlManifest.xml:3–33` has the same datasets and properties as the source manifest, and adds `api-version="1.3.18"` and `built-by pac 1.51.1`. The only real difference is that the resource is `bundle.js` instead of `index.ts`.
- **Bundles:** the msapp-embedded `Resources/Controls/Dev.DevexCapexSummaryPCF.bundle.js` and the managed-solution `bundle.js` are byte-identical: both 150,924 bytes, SHA-256 `D8529D27…`. Strings probed in the bundle match clone `5f12280`:
  - "Automatically distributed costs cannot be marked…"
  - `loadNextPage`, `CollapseResetKey` and `PCF_RE_RENDER`
  - `pcf-cell-total-paid`
  - "Total Planned"
  - "Add Standard Contract"
  - no `webAPI`, and no dummy data.

  This is consistent with the clone, not byte-proven, because the bundle is a webpack build.
- **External services:** `<external-service-usage enabled="false">` (`ControlManifest.Input.xml:14`).
- **WebAPI:** none. `index.ts:15` says "It must NEVER call Dataverse (no WebApi usage)". Grep of the clone finds no `webAPI`/`fetch(`, and the bundle has 0 `webAPI` hits.
- **Resources:** `index.ts` (order 1) and `css/TableConnectedToDataversePCF.css` (order 1) (`ControlManifest.Input.xml:106–108`).

Manifest properties (`ControlManifest.Input.xml:34–105`):

| Property | Kind | Type | Req. | Meaning (manifest comment) |
|---|---|---|---|---|
| `DevexCapexCostSummary` | data-set (input) | dataset | — | Main tree, one row per account / subaccount / contract |
| `StandardContractOptions` | data-set (input) | dataset | — | Standard contracts that can still be added, per subaccount |
| `ShowPlannedCost` | input | TwoOptions | yes | Show "Total Paid" + "Total Planned" columns |
| `StartYear` | input | Whole.None | yes | The year that M1..M12 represent |
| `ShowEmptyAccounts` | input | TwoOptions | no | When false, hide accounts/subaccounts with no visible cost |
| `CostPaidByFilter` | input | SingleLine.Text | no | "Show All Cost" \| "DevCo" \| "SPV" (UI-only filter) |
| `CollapseResetKey` | input | SingleLine.Text | no | "Bug 13472: change this value … to collapse all" |
| `Cluster1Date`…`Cluster6Date` | input | DateAndTime.DateOnly | no | Cluster start dates for the timeline header |
| `EditTriggered`, `CommentTriggered`, `DeleteTriggered`, `AddTriggered`, `AddStandardContractTriggered`, `SetCostPaidUnpaidTriggered` | output | TwoOptions | no | One pulse per user action |
| `SelectedRecordId` | output | SingleLine.Text | no | Subaccount RowId (Add / AddStandard) or contract RowId (Edit/Delete/Comment) |
| `SelectedStandardContractId` | output | SingleLine.Text | no | Chosen standard assumption id |
| `SelectedCostContractId`, `SelectedCostYear`, `SelectedCostMonth`, `SelectedCostPaid` | output | Text / Whole / Whole / TwoOptions | no | Paid-toggle payload. `SelectedCostPaid` is the **desired** new state |

#### 2.1.2 Input bindings, verbatim (YAML L7238–7277, L7651–7655)

```powerfx
Cluster1Date: =Date(
    Coalesce(LookUp(gblClusterDurations, Order = 1, StartYear), locNavigationMinYear, gblSelectedProjectYear),
    Coalesce(LookUp(gblClusterDurations, Order = 1, StartMonth), 1),
    1
)
// Cluster2Date … Cluster6Date (L7244–7273): identical shape with Order = 2 … 6
CollapseResetKey: =locSelectedCapexAccountCategory.'CAPEX Account List' & "|" & Text(locScreenVisitStamp)
CostPaidByFilter: =Coalesce(drp_Costs_ProjectCostbtn_ShowCostPaidBy.Selected.Value,"Show All Cost")
Height: =Parent.Height-45
Items: =colFinatCostDataOptimized
ShowEmptyAccounts: =tgl_Costs_ProjectCostbtn_ShowEmptyAccounts.Checked
ShowPlannedCost: =tgl_Costs_ProjectCostbtn_ShowPlannedPaid.Checked
StandardContractOptions_Items: =colStandardContractOptionsForPCF
StartYear: =gblSelectedProjectYear
Width: =Parent.Width-10
```

The canvas exposes the first dataset as `Items` and the second as `StandardContractOptions_Items`.
These are its property-panel names for `DevexCapexCostSummary` and `StandardContractOptions`.

**What each binding resolves to:**
- **`gblClusterDurations`** (`App.pa.yaml:205`, OnStart) always holds **six** records, `Order` 1–6. `StartMonth`/`StartYear` are `Month()`/`Year()` of the project milestones:
  - `'1-Feasibility studies'`
  - `'2-Project development started'`
  - `'3-Application submitted'`
  - `'4-Legally binding permits'`
  - `'5-Construction'`
  - `'Operations start date (COD)'`

  Because of the `Coalesce`, **every cluster input always receives a date**. A cluster whose milestone is blank falls back to 1 January of `locNavigationMinYear` (OnVisible L169–182), or of `gblSelectedProjectYear` (inferred: this depends on what `Year(Blank())` yields at run time; see §5).
- **`locScreenVisitStamp`** is a new `GUID()` on every `OnVisible` (L36). `locSelectedCapexAccountCategory` is the selected tab. So the key changes on screen entry and on every tab switch.
- **`colFinatCostDataOptimized`** is built by `btn_Capex_Cost_Refresh_Capex_Cost_Code` (L1014–2296). Its schema is in §2.1.3.
- **`colStandardContractOptionsForPCF`** is built by `btn_Capex_Cost_Build_StandardContractOptions_Code` (L452–718). One record per (assumption, subaccount), with:
  - `StandardContractId: Text(DCS.vsb_devexcapexstandardassumptionsid)`
  - `SubaccountId: Text(DCS.vsb_Subaccount.'CAPEX Account List')`
  - `Name: Coalesce(DCS.vsb_description, DCS.vsb_descriptioninput, "Standard Contract " & Text(DCS.vsb_autoid))`
  - `AutoId: DCS.vsb_autoid`
  - `ShowOption`

  The builder keeps only `ShowOption` rows and sorts them `"AutoId", SortOrder.Ascending` (L700–717). Its eligibility rules belong to 07/08.

#### 2.1.3 The `colFinatCostDataOptimized` row schema (what the canvas actually sends)

Built in six steps at L1021–2295:
1. Category collections (L1021–1056).
2. Comments, flattened to the latest message per thread: `colCapexCommentsLatest` (L1058–1190).
3. Contract rows: `colCapexContractCostGrouped_V1` (L1193–1339).
4. Account and subaccount rows: `colAllGroupedAccounts` (L1341–1399).
5. The merge: `colFinatCostDataOptimizedTemp` (L1401–1420). Each account or subaccount row is followed by its contracts, sorted by `"vsb_costdescription"` ascending.
6. Selected-year month mapping (`colFlatCostsMapped`, L1423–1529), contract all-years totals (`colContractTotalsForPCF`, L1530–1568) and the final `AddColumns` (L1570–2295).

Contracts are only those whose `Account` is a **subaccount** of the category (L1043–1048). A
contract filed directly on a level-2 account is in no collection, so it gets no row and is in no
total.

| Column(s) | Account / subaccount row | Contract row | Source |
|---|---|---|---|
| `RowId` | `vsb_capexaccountlistid` | `CPC.'CAPEX Project Contract'` | L1791–1792 |
| `ParentId` | `vsb_parentaccountid` (the account's parent; for an account that is the category) | the subaccount id | L1793–1794 |
| `Type` | `"account"` / `"subaccount"` | `"contract"` | L1795–1804 |
| `Number` | `Coalesce(R.vsb_number, "")` | `""` | L1805–1809 |
| `Name` | `R.vsb_name` (account `Name`) | `R.vsb_costdescription` = **`CPC.Name`** (`vsb_name`) | L1205, L1810–1815 |
| `SubLabel` | `Blank()` | `"[" & DevCo\|SPV\|Text('Cost Type') & "]"` & `" Link to Cluster " & 'Linked Cluster'.Order` & the distribution text (see below) | L1228–1330 |
| `CostPaidBy`, `CostPaidByText` | `""` | `"DevCo"` / `"SPV"` / `Text(CPC.'Cost Type')` (blank Cost Type gives `""`) | L1220–1226, L2240–2244 |
| `DistributionType`, `Distribution` | `""` | `Text(CPC.Distribution)` (e.g. "Equal Distribution") | L1227, L2245–2249 |
| `IsStandardContract`, `IsStandard`, `StandardCost`, `StandardContract` | `false` | `"true"`/`"false"` (**text**) from `'Is Standard Contract?' = …Ja` | L1331–1335, L2225–2239 |
| `M1`…`M12` | sum of the selected year's `CAPEX Costs.Cost` in month n, matched by `AccountId` / `SubaccountId` | same, matched by `ContractId` | L1575–1706 |
| `Month1Paid`…`Month12Paid` **and** `M1Paid`…`M12Paid` | `false` (`R.IsContract && …`) | any cost row in month n with `'Cost Paid' = true` | L1707–1790, L2141–2224 |
| `HasComments` | `false` | any unresolved **General Comment** thread | L1816–1822 |
| `CommentTooltip` | `""` | `LatestText` of the most recently active unresolved general thread | L1823–1840 |
| `M{n}HasComments`, `M{n}CommentTooltip` | `false` / `""` | unresolved **"Comments to payment date"** thread whose cost row is in `gblSelectedProjectYear`, month n | L1841–2140 |
| `TotalCost` | sum of child contracts' `varTotalCost` | `varTotalCost = Coalesce(C.'Total Cost', Sum(Filter('CAPEX Costs', Contract = C), Cost), 0)` | L1536–1546, L2251–2261 |
| `ActualCost` | sum of children | `varPaidCost` = sum of paid cost rows, **all years** | L1547–1556, L2278–2289 |
| `PlannedCost` | sum of children | `varTotalCost - varPaidCost` | L1563, L2262–2273 |
| extra, ignored by the PCF | `vsb_capexaccountlistid`, `vsb_parentaccountid`, `vsb_costdescription`, `vsb_name`, `vsb_number`, `IsAccount`, `IsContract`, `vsb_year`, `vsb_statusbool`, `vsb_CreatedOn`, `vsb_AccountCategory` | | L1205–1219, L1348–1392 |

`SubLabel` distribution text:
- **Cluster branch:** `If(linked, ", ", "") & "Distribution to Cluster " & Concat(selected, label, If(CountRows(selected) > 2, ", ", " & "))` (L1298–1310).
- **Date branch:** `If(linked, ", ", "") & $"Distribution from {mm/yyyy} to {mm/yyyy}"` (L1312–1325).
- **Commented-out, not live:** the `" " & Text(CPC.Distribution)` segment (L1235–1239).
- **No separator after `]`:** with no linked cluster, the label is `[SPV]Distribution to Cluster 1 & 2`, with nothing between `]` and `D`.

Notes:
- **Commented-out, not live:** two month-sum formulas for `PlannedCost` and `ActualCost` (L2274–2277, L2290–2293), and the `//F.MonthIndex1 = 12 &&` filters (L2267, L2283). All-years totals are therefore never derived from the months.
- `vsb_statusbool` is computed but the PCF never reads it, so inactive accounts are not hidden **by the PCF**.

#### 2.1.4 Outputs and the screen's `OnChange` dispatch (YAML L7278–7650)

`index.ts:234–257` (`triggerAction`) sets **exactly one** trigger true, copies the payload, and
calls `notifyOutputChanged()`. Then `getOutputs()` (`index.ts:272–306`) returns the snapshot and
**resets every output** to its default. The canvas therefore sees one `false → true` pulse per
click, then a `true → false` reset, which its formula treats as a no-op.

`OnChange` runs these blocks in order. Each is guarded by `If(Self.<X>Triggered, …)`.

1. **Always** (L7279–7294):
   ```powerfx
   UpdateContext({locSelectedCostRow: LookUp(colFinatCostDataOptimized, vsb_capexaccountlistid = GUID(Self.SelectedRecordId)),
                  locMilestoneRelinkResetNeeded:false, locClusterLinkageChanged:false, locCostPaidByChanged:false
                  /*, locPCFSelectedContract: LookUp('CAPEX Project Contracts', …)*/ })
   ```
   The `locPCFSelectedContract` part is commented-out, not live.

   On a reset pulse `SelectedRecordId` is `""`, so `GUID("")` gives a blank `locSelectedCostRow` (inferred).
2. **`AddTriggered`** (L7295–7322). Sets:
   - the panel flags `locShowClusterLinkageConfirmation: false`, `locClusterLinkageChanged: false`, `locContinueToSavelinkedCluster: true` and `locCostPaidByChanged: false`;
   - `locInitialCostPaidBy: Coalesce(locSelectedProjectContract.'Cost Type', LookUp('SPVDevCo Mapping Capex Devexes', …).'DevCo/SPV')`;
   - then `locIsVisibleRightPanelAddContract: true`, `locPanelReady: false`, `locWarmupMode: "addContract"`, `locWarmupKick: true`, `locAllYearsCost: Blank()` and `locSelectedContractDescription: Blank()`.

   The panel itself is described in 08.
3. **`EditTriggered`** (L7323–7359). Opens the panel and resolves `locTempContract` with `LookUp(colCapexProjectContracts, 'CAPEX Project Contract' = locSelectedCostRow.vsb_capexaccountlistid)`. It sets `locSelectedProjectContract`, `locSelectedContractDescription` and `locWarmupMode: "edit"`, and sets `locAllYearsCost: locTempContract.'Total Cost'`.
4. **`AddStandardContractTriggered`** (L7360–7417). First `Clear(colOtherClusterHavingCost)`, then:
   - `varSelectedStandardGuid: GUID(Self.SelectedStandardContractId)`
   - `varSelectedRow: LookUp(colFinatCostDataOptimized, Text(RowId) = Self.SelectedRecordId || Text(vsb_capexaccountlistid) = Self.SelectedRecordId)`

   Then:
   - If the row is blank: `Notify("Please select a valid subaccount before adding a standard contract.", NotificationType.Warning, …)`.
   - Otherwise, if a `'CAPEX Project Contracts'` row already exists for the same project, subaccount and assumption (a **server** `LookUp`): `Notify("This standard contract is already created for this project and subaccount.", NotificationType.Information, …)` and `RemoveIf(colStandardContractOptionsForPCF, …)`.
   - Otherwise: set `locSelectedCostRow` and `locGUIDforLoadingStandardContract`, then `Select(btn_Capex_Cost_Add_Standard_Contract_Code)`. If `locSelectedProjectContract` is then non-blank:
     - remove the option;
     - `Refresh('CAPEX Project Contracts')` and `Refresh('CAPEX Costs')`;
     - `Select(btn_Capex_Cost_Refresh_Capex_Cost_Code)` and `Select(btn_Capex_Cost_Build_StandardContractOptions_Code)`.

   The comparison is text-to-text. The PCF lower-cases ids (`DatasetParser.normalizeId`), which matches because Dataverse GUID text is lower-case (inferred).
5. **`DeleteTriggered`** (L7418–7421): `UpdateContext({locIsVisibleSubaccountCostsDeletionDialog: true})`. The dialog is in 06.
6. **`SetCostPaidUnpaidTriggered`** (L7422–7437). `varPCFSelectedContract` is `LookUp('CAPEX Project Contracts', 'CAPEX Project Contract' = GUID(Self.SelectedCostContractId))`.
   - If it is an Individual Distribution with a linked cluster: `UpdateContext({locIsVisibleSetPaidCost: true})`, the confirmation popup (06).
   - Otherwise: `Select(Btn_CodeforSettingCostPaidUnpaid)`.
7. **Duplicate blocks.** `DeleteTriggered` again (L7438–7441, identical). `SetCostPaidUnpaidTriggered` again (L7442–7456), without the `else` branch. The duplicate re-sets the same flag, so it has no extra effect (idempotent), but it costs a second server `LookUp`.
8. **`CommentTriggered`** (L7457–7650). Runs `Refresh('Capex Comments')`, builds `colCapexComments` with sequence numbers and a trailing "button" row, and sets `locIsVisibleCapexComments: Self.CommentTriggered` and `locAvailebleCapexCosts`. This block is owned by 09.

`Btn_CodeforSettingCostPaidUnpaid` (L7656–7768, `Visible: =false`) is the paid worker:
1. It raises the spinner with `"Please wait, saving..."` (L7662–7667).
2. It maps `DevexCapexSummaryPCF.SelectedCostMonth` to the `[@Month]` choice and finds the cost row of `SelectedCostContractId` for that `Year`/`Month`.
3. If there is no row: `Notify("No monthly cost row found for selected contract/month/year.", NotificationType.Warning, …)` (L7740–7744).
4. Otherwise:
   ```powerfx
   IfError(Patch('CAPEX Costs', varCostRecord, {'Cost Paid': DevexCapexSummaryPCF.SelectedCostPaid});
           Refresh('CAPEX Costs'); Select(btn_Capex_Cost_Reload_PCF_After_Mutation_Code),
           Notify("Could not update paid status. Please refresh and try again.", NotificationType.Error, …))
   ```
   (L7745–7758)
5. It lowers the spinner.

#### 2.1.5 Internal behaviour (from `index.ts`, `GridRenderer.ts`, `DatasetParser.ts`, `ActionDropdown.ts`)

The line numbers below are those of the vendored `.js` copies under
`ProjectCosts-CodeApp/src/features/cost/capex-costs/pcf/`. §2.1.7 explains that they are
transpilations of the clone.

**Lifecycle (`index.ts`):**
- **`init` (L151–184):**
  - calls `trackContainerResize(true)`;
  - creates one `ActionDropdown` and one `GridRenderer`, and passes both the bound `triggerAction`;
  - listens for the `window` event `PCF_RE_RENDER`.
- **`updateView` (L190–219):**
  - clears the expanded-row set when `CollapseResetKey` changes (Bug 13472, inverted semantics: the set holds *expanded* ids, so empty means all collapsed);
  - pulls every remaining dataset page (`paging.loadNextPage()`) for both datasets;
  - then calls `render`.
- **`destroy`:** tears down both children and removes the `window` listener.

**Parsing (`DatasetParser.parseDatasetToTree`, L18–476):**
- **Alias resolution.** It resolves each logical field against the dataset's columns with `normalizeFieldName`, which lower-cases and strips non-alphanumerics, and with long alias lists:
  - RowId accepts `rowid`, `id`, `vsbcapexaccountlistid` and others (L58);
  - paid accepts 8 spellings per month (L137–146);
  - tooltips accept 17 spellings per month (L305–322).
- **Reading a value.** `firstAvailableValue` prefers `getValue`, then falls back to `getFormattedValue` (L639–654).
- **Type.** The type comes from `Type`. Without one, it falls back to `IsAccount`/`IsContract`, and the default is `"subaccount"` (L383–398).
- **Two-pass tree build:**
  - Pass 1 buckets rows into accounts, subaccounts and contracts by `normalizeId(RowId)`, which lower-cases.
  - Pass 2 attaches contracts to subaccounts and subaccounts to accounts, by `ParentId`.
  - Orphans are dropped silently (L458–475).
  - Order follows `sortedRecordIds`, so it is the canvas collection order.
- **Standard contracts.** A contract is standard if any of these is true (L218–233):
  - `parseBoolean` of the alias columns is true. The text `"true"`, `"yes"`/`"ja"`, or any label containing "standard" counts as true; "non-standard" counts as false.
  - a `||STD=1||` SubLabel token is present;
  - the name starts with `"standard "`.
- **Distribution type.** It comes from the column, or is parsed out of the SubLabel (L237–243, L711–720).
- **Paid months.** A month is paid if its `M{n}Paid` alias is true **or** a `||PAID=1,2||` token lists it (L256–273). `HasComments` is true if the flag is set, or if the tooltip is non-empty (L362–377). Each `M{n}HasComments` is also true if `M{n}CommentTooltip` is non-empty (L327–344).
- **Totals.** `TotalCost` is taken as given. It falls back to the sum of M1..M12 only when the column is absent or empty (L350–354). `PlannedCost` and `ActualCost` are taken as given.
- **Standard options.** `parseStandardContractOptionsDataset` (L494–550) groups options by the lower-cased `SubaccountId`. It accepts these columns:
  - `StandardContractId` / `vsb_devexcapexstandardassumptionsid` / `id`;
  - `SubaccountId`;
  - `Name` / `Description` / `vsb_description` / `descriptioninput` / `itemdisplayname`;
  - `AutoId`, from which it synthesises "Standard Contract {AutoId}" when Name is blank.

  It **drops** any row without an id, a subaccount or a name.
- **Cluster timeline.** `calculateClusterTimeline` (L904–979) maps each cluster date to a month of the selected year:
  - starts before `StartYear` → month 0;
  - starts in `StartYear` → its own month;
  - starts after `StartYear` → excluded.

  It then sorts by start month, then by cluster index. It sweeps January to December; when several clusters share a start month, the highest-indexed one claims the month. Months before the first visible start take the first cluster's index. The result is run-length encoded into spans. With no visible cluster, it returns one span with `clusterIndex 0` (no pill).

**Rendering (`GridRenderer.render`, L140–251):**
- **Teardown and loading.** It closes every body-mounted popup first. If `dataset.loading`, it shows *"Loading project budget..."* (L1413–1424).
- **UI-only filters:**
  - `applyCostPaidByFilter` (L354–376) keeps a contract when `"devco"`/`"spv"` appears in `CostPaidBy + " " + SubLabel`, then recalculates subaccount and account totals from the visible contracts (L417–454). Unknown filter values fail open.
  - `removeEmptyAccounts` (L392–402) runs when `ShowEmptyAccounts` is false. It drops subaccounts with no contracts and no cost in any total or month, then accounts left empty.
- **Defaults:** `ShowEmptyAccounts` is `?? true`, `CostPaidByFilter` is `|| "Show All Cost"`, and `StartYear` is `|| 2026` (L158–167).
- **Columns** (`renderColGroup`, L474–509):
  - minimum widths: Number 100, Name 300, Total 100, Planned/Actual 120 each, 12 months of at least 65 px each, and a fixed 40 px action column;
  - growth: the table takes the larger of its minimum width and the allocated width, and the months share the surplus;
  - `--pcf-month-width` is set for the timeline CSS;
  - a second pass, `fitColumnsToScrollViewport` (Bug 13125), removes a spurious horizontal scrollbar;
  - a `ResizeObserver` re-fits the columns.
- **Header row 1:** the cluster timeline. A leading `th` spans the Number/Name/Total(/Paid/Planned) columns, followed by one `th` per span carrying a `Cluster N` pill (L521–554).
- **Header row 2** (L556–621):
  - captions "Number", "Account Name" and "Total Costs";
  - when `ShowPlannedCost` is on, **"Total Paid" then "Total Planned"** (Bug 13280), in that order;
  - then "Jan"…"Dec", with no year (Bug 13304);
  - plus boundary-tick classes and the timeline track span.
- **Body** (L207–242):
  - **Account rows:** bold, with a `+`/`−` toggle only when the account has subaccounts.
  - **Subaccount rows:** a T or L tree connector and a toggle.
  - **Contract rows:** only when the subaccount is expanded.
  - **Add row:** after every expanded subaccount, even an empty one.
  - Gap rows separate expanded account blocks.
  - Collapsing does not change any total.
- **Contract row** (L728–829):
  - the name line, with a red name dot when `HasComments`;
  - the SubLabel. The `[TAG]` gets its own span (`pcf-meta-tag-{tag}`), and the rest of the label is appended **with a leading space** (L781–795). So `[SPV]Distribution…` is displayed as `[SPV] Distribution…`, which the screenshot confirms.
  - the Total cell turns green (`pcf-cell-total-paid`) when `totalCost > 0 && |total - actual| < 0.005` (Bug 13453, L918–920);
  - the three-dot button `•••`, with a red badge if the contract has **any** comment, general or monthly (Bug 13888, L734–736, L808–826).
- **Month cells** (L942–984):
  - a zero, null or NaN value renders `"-"`, is **not clickable**, and still shows a comment dot if one is flagged;
  - a non-zero cell is either `pcf-paid-cell` (green, `title="Paid Cost"`, Bug 13284) or `pcf-unpaid-cell`;
  - it has `tabIndex 0` and `role=button`, and opens the month dropdown on click, Enter or Space.
- **Number format** (`formatCostValue`, L1371–1390): `Intl.NumberFormat(navigator.languages, {minimumFractionDigits: 0, maximumFractionDigits: 3})`. This uses the **browser** locale, so a value reads "1,000" in English and "1.000" in German. Zeros render as a blue dash (`pcf-val-dash`, L921–932).
- **Grand Total row** (L878–896): a "Grand Total" label spanning 2 columns, with sums over the **filtered** tree. It is sticky at the bottom, and a spacer row keeps it on the viewport floor (L301–330).
- **Empty state.** When the filtered tree is empty, `renderEmptyState` shows a **spinner and "Loading data…"** (L1427–1438). An empty grid therefore looks like a load that never finishes.

**Menus** (all mounted on `document.body`, one open at a time, light-dismiss on `window` click):
- **Three-dot menu** (`ActionDropdown.js:64–125`): one shared element with **Edit**, **Comments** and **Delete**. Comments carries a `#dropdown-comment-dot` badge, which `show()` toggles per row (L160–163). The menu is right-aligned to the button, flips above it near the viewport bottom, and toggles closed on a second click (L138–184). Each item fires `"Edit"`, `"Comment"` or `"Delete"` with the contract id.
- **Add menu** (`GridRenderer.js:1112–1177`):
  - "Add New Cost" always fires `"Add"` with the subaccount id.
  - The standard-contract entry depends on how many options the subaccount has:
    - **more than 1:** an "Add Standard Contract" parent with a hover submenu, one entry per option name;
    - **exactly 1:** a direct "Add Standard Contract" item;
    - **0:** no item at all ("intentionally NOT implemented" as a disabled item).

    Each standard-contract entry fires `"AddStandardContract"` with the subaccount id and the option id.
- **Month menu** (L1247–1325):
  - **Equal or cluster distribution:** `isEqualDistribution` substring-matches "equal", "cluster" or "distributed". The menu shows only *"Automatically distributed costs cannot be marked as paid or assigned payment date comments."*
  - **Otherwise:** "Set as paid" / "Set as unpaid", which fires `"SetCostPaidUnpaid"` with `{year: StartYear, month: monthIndex + 1, paid: !isPaid}`, and "Comments", which fires `"Comment"`, the same action as the three-dot menu.
- **Comment tooltips** (L1008–1077): the text is normalised to begin `"Comment:\n"`. The name dot uses a floating `div` on `document.body`. Month dots use a CSS `data-tooltip`.
- **Expand and collapse** (`toggleCollapse`, L1398–1410): updates the shared expanded set and dispatches `PCF_RE_RENDER`. Upstream dispatches it on `window` (`GridRenderer.ts:1678`).

**Accessibility as shipped:** only the month cell has `role`/`aria-label`
(`"<value>. Click to set as paid|unpaid."`). The comment dots have `aria-label` set to the comment
text. The toggles, the three-dot button, the Add button and every menu item carry only their
visible text or glyphs. The upstream code sets **no** `data-testid` anywhere.

#### 2.1.6 CSS (`css/TableConnectedToDataversePCF.css`, 1,270 lines)

Key rules (all values are in the file):

| Rule | Value |
|---|---|
| `.pcf-budget-grid` | Segoe UI, 12 px, `#242424` on white, and **no `line-height`** |
| `.pcf-table th` | 34 px, sticky top, `#595959`, weight 600 |
| `.pcf-row-account td` | 38 px, weight 700 |
| `.pcf-row-sub td` | 38 px, `#333` |
| `.pcf-row-contract td` | 40 px |
| `.pcf-paid-cell` | `#D6E7B3` |
| `.pcf-cell-total-paid` | `#a3c068` |
| standard contract (`.pcf-contract-standard`, `.pcf-row-contract.pcf-row-standard …`) | `#006EB9`, **blue but not italic** (L913–938) |
| `.pcf-val-dash` | `#006EB9` |
| comment dots (`.pcf-name-dot`, `.pcf-month-comment-dot`, `.pcf-dot-badge`) | 7 px, `#E23636` |
| `.pcf-cluster-pill` | `#E7E7E7` / `#595959`, 11 px |
| `.pcf-dots-btn` | 28×28, `#8ab6e8` border, `#f7fbff` fill |
| `.pcf-dropdown` | `position: fixed`, z-index 10000, and **no `font-family`** |
| `.pcf-dropdown-item` | `font-family: inherit` |

The three copies of the CSS are **byte-identical**: SHA-256 `3F63148A…` for the clone, the
managed solution `Controls/…/css/`, and the msapp
`Resources/Controls/css/Dev.DevexCapexSummaryPCF.TableConnectedToDataversePCF.css`.

#### 2.1.7 Screenshot cross-check

`UI Screenshots/Cost App - DevexCapex Screen Tab Selected - Showcasing dropdown for three dots clicked on contract.png`
shows:
- the "Cluster 2" pill;
- the Jan…Dec headers;
- the `+`/`−` toggles and tree connectors;
- the red name dots and the red badge on `•••`;
- the blue standard rows, which are **not** italic;
- the `••• Add` row;
- the Edit / Comments / Delete menu, right-aligned under the button.

All of this matches §2.1.5 and §2.1.6.

### 2.2 P2 · `ckfix_CreatorKit.Hotfix.HotfixCDNFluentUI` (L2300–2305)

```powerfx
- cmp_Hotfix_CDN_FluentUI:
    Control: CodeComponent
    ComponentName: ckfix_CreatorKit.Hotfix.HotfixCDNFluentUI
    Properties:
      Height: =10
      Width: =10
```

**Template.** `Controls/116.json` records template version **0.0.1**, namespace `CreatorKit.Hotfix`
and constructor `HotfixCDNFluentUI`. The only manifest property is `dummy` (SingleLine_Text). The
platform loads its resources:
- the bundle `PCFControls/ckfix_CreatorKit.Hotfix.HotfixCDNFluentUI/CreatorKit.Hotfix.HotfixCDNFluentUI.bundle.js`;
- the CSS `…/css/CreatorKit.Hotfix.HotfixCDNFluentUI.fonts.css`;
- the platform library `/PCF/fluentui-react.js`.

**JS.** `Resources/Controls/CreatorKit.Hotfix.HotfixCDNFluentUI.bundle.js` (5,886 bytes) is an
**empty control**: `init`, `updateView` and `destroy` do nothing, and `getOutputs` returns `{}`.

**CSS: this is the whole fix.** `Resources/Controls/css/CreatorKit.Hotfix.HotfixCDNFluentUI.fonts.css`:
- declares 19 `@font-face` entries for the family `'CustomFabricMDL2Icons'`, all pointing at `https://res.cdn.office.net/files/fabric-cdn-prod_20241209.001/assets/icons/fabric-icons-*.woff`;
- then forces, verbatim:
  ```css
  .ms-Icon, i[data-icon-name] { font-family: 'CustomFabricMDL2Icons' !important; }
  ```

**Why it exists (inferred from the name, the URL and the CSS).** The Creator Kit (PowerCAT) Fluent
UI v8 controls on this screen draw their icons with the Fabric MDL2 icon font:
- P3–P16: CommandBar, Icon, Nav and ContextMenu;
- for example `IconName: ="Next"`, `"Cancel"` and `"Warning"`, and the `ItemIconName`s.

When the font's original CDN location stopped serving, those icons rendered as empty boxes. The
hotfix re-points every Fabric icon glyph at a working Office CDN build dated 2024-12-09. Placing
the 10×10 control on a screen is enough to load the stylesheet. The same hotfix sits on the PM
app's `Project Main Screen.pa.yaml`. In this app it is placed only on the Capex screen.

Once loaded, a PCF's CSS stays in the document, so the fix probably covers the other screens after
the Capex screen has been visited (inferred, not verifiable from source).

### 2.3 P3 · `cmd_Costs_ProjectCosts_TableCommandBar`: `cat_PowerCAT.CommandBar`, hidden (L3083–3578)

**Items** (L3088–3232) are built over `'Devex/Capex Standard Assumptions'`, filtered by:
- the selected subaccount;
- country and technology;
- the start cluster;
- not yet created.

They are:
- `addContract` "Add New Cost", gated by `DataSourceInfo('CAPEX Costs', CreatePermission)`, `!locSelectedCostRow.IsContract`, not busy and not adding;
- `addStandardContract` "Add Standard Contract";
- `editProjectCostsInSubaccount` "Edit";
- `deleteCostsInSubaccount` "Delete Cost";
- one `AddStandardContractWithDesc` child per assumption, named `Coalesce(GSC.vsb_description, "Standard Contract " & Text(GSC.vsb_autoid))`.

**OnSelect** (L3233–3563) switches on `Self.Selected.ItemKey`. Each branch re-reads the project, recomputes `locProjectStartClusterNo`, and then either:
- opens the panel, or
- shows the delete dialog, or
- sets `locIsAddingStandardContract` and the spinner text `"Please wait, loading standard contract..."`, then calls `Select(btn_Capex_Cost_Add_Standard_Contract_Code)`.

Its message is `"Standard contract is already being created. Please wait."` (L3311, L3399).

The bar is **not live**: `Visible: =false` on both the bar (L3566) and `con_Costs_ProjectCosts_TableCommandBar` (L3080). Every one of its commands is reachable only through P1's menus. `gap-analysis/cost-capex-costs.md` B7 records the same.

### 2.4 P4 / P5 · Next Year / Previous Year PowerCAT icons, hidden (L3599–3716)

**Next Year** (`IconName: ="Next"`, Tooltip `"Show costs in next year"`, `Text: ="Next Year"`):
- `OnChange` sets `gblSelectedProjectYear` to `Min(+1, Max(colProjectPeriods, Year))`;
- it appends a period when the year is at the maximum;
- a `colCapexCostsInSelectedContracts` re-filter is commented-out, not live (L3654–3665).

**Previous Year** (`IconName: ="Previous"`, `Text: ="Previous Year"`):
- clamps the year to `Coalesce(locCostAllowedStartYear, Min(colProjectPeriods, Year), Year(Today()))` (L3680–3696);
- is `Visible` only above that floor (L3701–3714).

Both sit in `con_Costs_ProjectCosts_GalleryNavigation`, which is `Visible: =false` (L3595), so they are **not live**. The live year navigation is the classic controls next to `drp_Costs_ProjectCostbtn_ShowSelectedYear` (07).

### 2.5 P6, P8, P13–P16 · PowerCAT `Icon` action buttons

All are `IconType: ='PowerCAT.Icon.IconType'.ActionButton`, themed with `Theme: =gblAppThemeJson`.

- **P6 `btn_Capex_Comment_Cancel`** (L10224–10248):
  - `Text: ="Cancel"`, `IconName: ="Cancel"`, 96×32;
  - outlined in `themePrimary`, and its icon turns black when disabled;
  - `OnChange: =Select(Icon2)`. `Icon2` (L8226–8243, a classic icon) runs `UpdateContext({locIsVisibleCapexComments: false}); Clear(colCapexComments); Clear(colDeletedComments)`.
- **P8 `pcf_btn_…_Buttons_Cancel_2`** (L18155–18205): `Text: ="Cancel"`. `OnChange` (L18175–18199) closes the panel, clears `colNewEditPanelCost` and resets 17 panel controls (see 08).
- **P7 `btn_SaveCost_Execute____`** (L17605–17697): a `"CheckMark"` "Save" with a 90,960-character `OnChange` (L17687) and a long `DisplayMode` gate (L17609–17669). It is `Visible: =false` and is referenced nowhere else, so it is **dead**. The live Save is the `Save` button at L17506 (see 08).
- **P13 `pcf_ico_Information_Button`** (`cmp_Information_Button_PCF.pa.yaml:87–102`):
  - `AccessibilityLabel: ="Data Invalid"`, red `#d20532`, `IconName: ="Info"`;
  - `Text: =cmp_Information_Button_PCF.ErrorTitle`;
  - `OnChange: =cmp_Information_Button_PCF.OnSelect()`.

  The screen's instance `cmp_ShowErrorInContract` (L19760–19834) sets `ErrorTitle` (L19765–19794) to:
  - `"Total percentage is over 100%"` when the sum of `colNewEditPanelCost.TotalUI` is above 100, or `"Total percentage is below 100%"` when it is below 100, for a `'% Values'` scheme;
  - `"No cost is allocated."` when the sum of `TotalSave` is 0, for `'Absolute Values'`.

  The instance is `Visible` when `locEditSaveButtonEnabled`, Individual Distribution, `locShowErrorInContractCost` and a non-empty title all hold (L19814–19831). It has `ToolTipVisibility: =false`, so the HTML list never shows.
- **P14 / P15 / P16** are the confirm/cancel buttons inside the popup components and the report-error panel (described in 06).

### 2.6 P9–P11 · PCFs inside `cmp_Header` (instance `cmp_Costs_Header`, L2323–2337)

- **P9 `pcf_HeaderContainerReportError_WarningIcon`** (`cmp_Header.pa.yaml:491–506`):
  - `IconName: ="Warning"`, `IconColor: ="Red"`, 40×40;
  - `Visible: =!IsBlank(gblReportError)`;
  - **no `OnChange`**: the icon is not clickable;
  - `Tooltip`: "An error has occurred!" followed by the report-via-Help text (L499–504).
- **P10 `pcf_HeaderContainerReportError_CommandBar`** (L507–549):
  - Items `help` "Help", with the children `raiseBug` "Report Problem" (`bug` icon) and `goToInfoCenter` "VSB Cloud InfoCenter" (`Info` icon);
  - `OnSelect: Switch(Self.Selected.ItemKey, "raiseBug", Set(gblShowReportProblemPanel, true), "goToInfoCenter", Launch(gblInfoCenterLaunchUrl, Blank(), LaunchTarget.Replace), false)`.
- **P11 `pcf_cmpHeader_User_ContextMenu_Info`** (L605–667):
  - `AccessibilityLabel: ="User information"`, `Tooltip: ="User"`;
  - transparent colours: it is laid over the user pill;
  - `Items`:
    - `"Hi {User().FullName}"`;
    - the mail (`ItemVisible` when non-blank);
    - `"{Language}, [{Lang}]"`;
    - `CompanyName`;
    - the editable counties;
    - "Project Data All Countries" (`ItemVisible: gblCurrentUser.IsProjectDataAllCountries`);
    - `"version {gblAppVersion} ({gblEnvironmentName})"`;
  - **no `OnSelect`**: the menu is informational only.

### 2.7 P12 · `pcf_Left_Navigation_Menu`: `cat_PowerCAT.Nav` inside `cmp_Left_Navigation`

`cmp_Left_Navigation.pa.yaml:150–183`:
- `AccessibilityLabel: ="Left navigation"`, `Tooltip: ="Left navigation"`.
- `Items`: when the menu is not expanded, the items are re-projected with `ItemDisplayName: ""` (icons only). Otherwise they pass through.
- `SelectedKey: =cmp_Left_Navigation.Selected.ItemKey`.
- `OnChange: =cmp_Left_Navigation.OnSelect();`
- The component outputs `SelectedKey: =pcf_Left_Navigation_Menu.SelectedKey` (L88).

The hamburger above it is a classic icon (L134–149), with:
- `Tooltip: =$"{If(cmp_Left_Navigation.IsExpanded, "Decrease", "Expand")} left naviagtion panel"`
- `OnSelect: =cmp_Left_Navigation.OnExpand()`

The screen instance (L2372–2401) binds:
- `Items: =LeftNavigationMenu`;
- `IsExpanded: =gblLeftNavigationMenuIsExpanded`;
- `OnExpand`, which flips that global;
- `OnSelect`, which `Navigate`s to `gblLeftNavigationSelected.TargetScreen` when the key changed.

---

## 3. Code app implementation

### 3.1 P1: the grid is the **original PCF renderer, vendored** and driven by a React adapter

**Decision:** the code app does not rewrite the grid. It runs the upstream `GridRenderer`,
`ActionDropdown`, `DatasetParser` and CSS, transpiled to JS, inside
`ProjectCosts-CodeApp/src/features/cost/capex-costs/PcfGrid.tsx`. `index.ts` is **not** ported:
`PcfGrid` takes its place.

#### 3.1.1 Diff of the vendored files against the PCF source (read-only)

**Method.** `ProjectCosts-CodeApp/scripts/read-pcf-port.mjs` transpiles the four upstream files.
It uses `ts.transpileModule`, ESNext/ES2022, and keeps comments. It applies these replacements:
- `window.dispatchEvent(event)` → `this._container.dispatchEvent(event)`;
- `document.getElementById("dropdown-comment-dot")` → `this._dropdownElement.querySelector(...)`;
- for `GridRenderer` only, the pooled `Intl.NumberFormat`, through `replaceOnce`, which throws if upstream has moved.

I ran it to stdout into the scratchpad. That writes nothing in the repo. I compared its output
with the vendored files using `git diff --no-index --ignore-cr-at-eol`.

| Vendored file | vs. upstream source | vs. a fresh `read-pcf-port.mjs` regeneration |
|---|---|---|
| `pcf/css/TableConnectedToDataversePCF.css` | **Byte-identical** (SHA-256 `3F63148A…`) | identical |
| `pcf/services/DatasetParser.js` (989 lines) | transpile only (types stripped) | **identical** (CRLF/LF only) |
| `pcf/ui/ActionDropdown.js` (228 lines) | transpile, plus one scripted replacement: `ActionDropdown.ts:173` `document.getElementById` → `.js:160` `this._dropdownElement.querySelector("#dropdown-comment-dot")` | **identical** (CRLF/LF only) |
| `pcf/ui/GridRenderer.js` (1,452 lines) | transpile, the 3 scripted replacements, **and 4 hand edits** | **differs: 9 insertions, 5 deletions** |

Scripted replacements in `GridRenderer.js`:
- `.js:1408–1409` dispatches `PCF_RE_RENDER` on the container. Upstream dispatches on `window` (`GridRenderer.ts:1678`).
- `.js:29–32` and `.js:1375–1389` pool the formatter.

Hand edits in `GridRenderer.js` that **are not in the port script**:
- `.js:772`: the name dot gets `data-testid` `capex-comment-name-${contract.id}`.
- `.js:955`: the month dot gets `capex-comment-month-${contract.id}-${monthIndex}`.
- `.js:970`: `td.setAttribute("data-testid", \`capex-month-cell-${contract.id}-${monthIndex}\`)`.
- `.js:990`, `.js:996` and `.js:1008–1013`: a new `testId` parameter is threaded through `setMonthCellContent` / `createCommentDot`.

These hand edits came in with commit `9eb9e4d` (the restructure). They are documented in
`migration-plans/09-tosca-automation-conventions.md` §"Secondary findings", but **not** in
`PCF-RENDERER-PORT.md` or the script. Regenerating the port with the documented tool would
silently drop them.

**Tests:**
- `ProjectCosts-CodeApp/src/styles/pcfCascade.test.ts:41–53` ("is identical to the vendor control's stylesheet") pins the CSS against the clone.
- `pcfCascade.test.ts:56–69` pins the type ramp.
- `pcfGridFormat.test.ts:34–67` (3 cases) pins the pooled formatter against the upstream one.

Neither file has `UT-` ids (CONVENTIONS rule 13).

#### 3.1.2 The adapter (`PcfGrid.tsx`)

- **Datasets.** `dataset(rows)` (L11–15) fakes a PCF dataset:
  - `loading: false`;
  - `columns` = the union of the row keys;
  - `sortedRecordIds` = the RowIds;
  - `getValue` returns the raw value, and `getFormattedValue` returns `String(value ?? "")`.

  `standardDataset` (L18–28) emits **only** `StandardContractId`, `SubaccountId` and `Name` (no `AutoId`).
- **Inputs** (L76–85), passed to `grid.render`:

  | Canvas input | Code app value |
  |---|---|
  | `mode.allocatedWidth` | `Math.max(element.clientWidth, 1)` |
  | `mode.allocatedHeight` | `Math.max(element.clientHeight, 300)` |
  | `StartYear` | `{raw: year}` |
  | `ShowEmptyAccounts` | `{raw: showEmpty}` |
  | `ShowPlannedCost` | `{raw: showPlanned}` |
  | `CostPaidByFilter` | `{raw: payer}` |
  | `Cluster{n}Date` | `new Date(\`${clusterDates[i]}T12:00:00\`)`, **or `null`** when the boundary is unknown |
  | `CollapseResetKey` | **not passed** |
- **Lifecycle** (L69–92):
  - one `ActionDropdown` and one `GridRenderer` per mount, with a fresh `new Set()` for expanded rows;
  - `PCF_RE_RENDER` is heard on the host element;
  - a `ResizeObserver` repaints;
  - cleanup destroys both and empties the host.

  Rows are memoised on accounts, lines, year and commentFlags (L58–61), so a resize only repaints.
- **Host:** `<div className="canvas-pcf-host" aria-label="DEVEX/CAPEX cost grid">` (L93). `styles/canvas.css:212` gives it `flex: 1; min-height: 300px; margin: 0 5px`.
- **Host-cascade compensation:** `canvas.css:246–247` sets `line-height: normal` on the host and the body-mounted popups, and `font-family: 'Segoe UI'` on `.pcf-dropdown`. These replace what the Power Apps host used to provide.
- **Type boundary:** `GridRenderer.d.ts` declares `render(context: unknown)`, so the `parameters` object PcfGrid builds is not type-checked against the manifest.
- **Collapse reset:** `Screen.tsx:744` renders `<PcfGrid key={category} …>`. A tab switch therefore remounts the grid with an empty expanded set, and so does leaving and re-entering the route. This reproduces `CollapseResetKey` (category plus visit stamp) without the input. A year change or a data refresh keeps the user's expansions, as in the canvas.
- **Paging:** not needed. The adapter hands over every row at once, so the `loadNextPage` fix in `index.ts:203–215` has nothing to do.

#### 3.1.3 Building the main dataset (`gridRows.ts`)

`gridRows(accounts, lines, year, commentFlags)` (L127–228) emits one pass of `FlatRow`s:

- **Account and subaccount rows** (L183–190): `RowId`, `ParentId` (`""` for a level-2 account), `Type`, `Number`, `Name`, and the money fields. An account carries its own lines **plus** its subaccounts' (L177–181).
- **Contract rows** are emitted only under subaccounts, sorted by `description.localeCompare` (L110–112, L194–195). Each has (L198–223):
  - `RowId`, `ParentId`, `Type: "contract"`, `Number: ""`;
  - `Name: line.description`, which `costBook.ts:1088` builds as `contractLabel(vsb_description, vsb_name)`;
  - `SubLabel: contractSubLabel(line)` (`rules.ts:764–787`, a canvas-exact transcription of L1228–1330, conditional separator included);
  - `CostPaidBy: line.payer`, which is `resolvePayer`: `costBook.ts:1118–1127`, falling back to the subaccount mapping, then to `"SPV"`;
  - `IsStandardContract: line.standard` (a boolean);
  - `DistributionType`: `"Individual Distribution"` or `"Equal Distribution"`;
  - `HasComments` / `CommentTooltip`, and per month `M{n}HasComments` / `M{n}CommentTooltip` / `M{n}Paid`.
- **Money** (L72–88, L115–125):
  - `TotalCost` = the stored `vsb_totalcost`, falling back to the sum of cost rows (the canvas `varTotalCost`);
  - `ActualCost` = paid, all years;
  - `PlannedCost` = total minus actual;
  - `M1..M12` = the selected year.
- **Not emitted:** the canvas's alias duplicates (`Month{n}Paid`, `IsStandard`, `StandardCost`, `StandardContract`, `CostPaidByText`, `Distribution`) and its extra `vsb_*` columns. The parser does not need them.
- **Comment flags** come from `gridCommentIndicators(commentThreads(...), commentCosts(book?.lines), year)` (`Screen.tsx:296–299`, owned by 09).

**Tests:** `gridRows.test.ts` has UT-GRID-001 … UT-GRID-020. They cover:
- the tree shape (001);
- roll-ups (002, 007, 015);
- an account-level line (003);
- paid / planned (004, 006, 016);
- all-years totals against selected-year months (005);
- display fields (008);
- comments (008b–008f);
- an out-of-range month (009);
- equivalence and speed (010, 011);
- the stored total (012–014, 017);
- the description sort (018);
- sub-labels (019, 020).

#### 3.1.4 Event dispatch (`Screen.tsx:423–452`)

`onAction: GridCallback` stands in for `getOutputs`/`OnChange`. The callback signature in
`GridRenderer.d.ts:2` matches `triggerAction`: action, recordId, standardContractId, and the paid
payload.

| PCF action | Canvas `OnChange` branch | Code app |
|---|---|---|
| `Add` | L7295–7322 | `open(id)`: a new line under the subaccount (`Screen.tsx:327–343`) |
| `Edit` | L7323–7359 | finds the line by id, then `open(line.accountId, line)` |
| `AddStandardContract` | L7360–7417 | `addStandardContract(id, stdId)` (L388–421): `checkStandardContractClick` (`standardContracts.ts:139–150`, the two canvas strings verbatim), then the amount and payments, then `writes.saveLine.mutate`. Messages appear through **`globalThis.alert`** (L395). "Already exists" means "not in the client-built option list" (`alreadyExists: !option`), not a server `LookUp` |
| `Delete` | L7418–7421 | `setDeleting(id)` → `ConfirmDialog` (L977–987) |
| `Comment` | L7457–7650 | `setCommentFor(id)` → `CommentsPanel` (09) |
| `SetCostPaidUnpaid` | L7422–7437 + `Btn_CodeforSettingCostPaidUnpaid` | `resolvePaidTarget` (`rules.ts:846–855`). On a miss it sets the error **"No monthly cost row found for the selected contract/month/year."** as an inline `role="alert"` banner (L1050). `paidToggleNeedsConfirmation` (`rules.ts:839–843`, Individual + linked) leads to the paid `ConfirmDialog` (L1028–1036, UT-CAPEXS-007); otherwise `writes.setPaid.mutate`. While busy: `LoadingOverlay` with `SAVING_COSTS` = "Please wait, saving costs..." (L1045–1048). On failure: the raw `Error.message` (L1051–1053) |

`Screen.test.tsx:126–131` **mocks `PcfGrid`**, which drives `onAction` directly. No test in the
code app renders `PcfGrid` or `GridRenderer` into a DOM.

#### 3.1.5 The standard-option dataset

`Screen.tsx:384–386` maps `buildStandardOptions(...)` (`standardContracts.ts:108–128`) to
`{id: assumption.id, subaccountId, name: assumption.description}`.

`assumption.description` is `r.vsb_description ?? ""` (`data/standardContracts.ts:41`). The query
selects neither `vsb_descriptioninput` nor `vsb_autoid` (`:27–32`) and has no `$orderby`.

#### 3.1.6 DOM identities in the vendored renderer, checked by hand

`check-control-labels.mjs` / `check-canvas-identities.mjs` do not parse `.js`, so these were
checked by hand against `09-tosca-automation-conventions.md` (§Secondary findings) and against D16(a).

| DOM control | `aria-label` | `data-testid` | Rule 16 |
|---|---|---|---|
| Month cell with a non-zero value (`GridRenderer.js:967–970`) | `"<amount>. Click to set as paid\|unpaid."` (bound data, unchanged from upstream) | `capex-month-cell-{contractId}-{monthIndex}`, 0-based | id OK; label carries data (accepted in 09) |
| Name comment dot (`:772`, `:1016`) | the comment text (bound) | `capex-comment-name-{contractId}` | id OK |
| Month comment dot on a **non-zero** cell (`:955`) | the comment text | `capex-comment-month-{contractId}-{monthIndex}` | id OK |
| Month comment dot on a **zero / "-"** cell (`:950`) | the comment text | **none**: `setMonthCellContent` is called without `testId` | **missing** |
| Account/subaccount `+`/`−` toggle (`:636–640`, `:689–693`) | none (text "+"/"−") | none | missing |
| Contract `•••` button (`:808–826`) | none | none | missing |
| `••• Add` button (`:855–861`) | none | none | missing |
| Add menu items "Add New Cost", "Add Standard Contract", option names (`:1183–1195`) | none | none | missing |
| Month menu items "Set as paid/unpaid", "Comments" (`:1281–1310`) | none | none | missing |
| `ActionDropdown` items Edit / Comments / Delete (`ActionDropdown.js:68–114`) | none | none | missing |

D16(a) (`02-OPEN-DECISIONS.md:317`) lists exactly these as open. `09-tosca…md` lists only the two
data-bound labels, as fixed.

### 3.2 P2: the Creator Kit CDN hotfix

**Not ported, and no port is needed.** The code app draws icons with `@fluentui/react-icons` SVGs.
The vendored renderer uses inline SVG. Grep of `ProjectCosts-CodeApp` (excluding `node_modules`)
finds no `ms-Icon`, `data-icon-name`, `FabricMDL2` or `initializeIcons`. No Fabric icon font is
loaded, so there is nothing to re-point.

### 3.3 P3–P5, P7: the hidden canvas PCFs

These are not ported, which is correct: none is live.
- **P3:** the CAPEX command bar's commands are reached through the grid menus (B7, COVERED).
- **P4 / P5:** year navigation is the Fluent ◀ / ▶ buttons `btn_Costs_ProjectCostbtn_ShowPreviousYear` / `_ShowNextYear` (`Screen.tsx:728–742`), which are a different canvas control (07).
- **P7:** dead, so nothing to port.

### 3.4 P6, P8, P13–P16: the PowerCAT Icon buttons

- **P6:** `CommentsPanel.tsx:527` uses `PanelButtons` with `saveTestId="btn_Capex_Comment_Save" cancelTestId="btn_Capex_Comment_Cancel"`.
- **P8:** `Screen.tsx:752–755` uses `PanelButtons` with `cancelTestId="pcf_btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Cancel_2"`. The PowerCAT ActionButton look is transcribed in `components/CanvasFields.tsx` (comments at L46 and L56).
- **P14 / P15:** `components/ConfirmDialog.tsx`, with the `variant="info"`, `confirmIcon` and `cancelIcon` options (06).
- **P13:** `cmp_ShowErrorInContract` is **not rendered**. Grep of `src/` finds none of "Total percentage is over 100%", "Total percentage is below 100%" or "No cost is allocated.". `rules.ts` `canPersistIndividual` (L824–830, UT-CAPEXR-055/056/069) blocks the save instead. Owned by 08.

### 3.5 P9–P11: header PCFs → `components/AppHeader.tsx`

| Canvas PCF | Code app | Identity |
|---|---|---|
| P9, the warning icon (`Visible: =!IsBlank(gblReportError)`, no `OnChange`) | `hasError` shows a `WarningFilled` transparent **Button** with a Fluent `Tooltip` = `ERROR_TOOLTIP` (verbatim, L149–153); **`onClick={onReportProblem}`** (L320–330) | `aria-label="An error has occurred"`, `data-testid="header-error"` |
| P10, the Help CommandBar | Fluent `Menu` "Help" ▸ "Report Problem" (`onReportProblem`) / "VSB Cloud InfoCenter". InfoCenter opens with `window.open(…, "_blank")`, not `LaunchTarget.Replace`, marked as D8 (L351–364) | `header-help`, `header-help-report-problem`, `header-help-infocenter` |
| P11, the user ContextMenu | Fluent `Menu` on the user pill: Application Settings (code-app row), then Mail, Language, Business unit, Countries, Data scope and Version, each omitted when it has no value (L369–439) | trigger `aria-label="User"`, `data-testid="header-user"`; rows `header-user-*` |

The theme (`gblAppThemeJson`) and the layout are in 03 and 02.

### 3.6 P12: Nav → `components/LeftNav.tsx`

The rail is a `<nav>` of `NavLink`s:
- the `aria-label` is `RAIL_LABEL` = **"Cost sections"** for the Cost rail (L79, L166–169);
- each link has `data-testid={\`rail-${item.key}\`}` and `aria-label={item.label}` (L305–322);
- OPEX is a group with a chevron (L215–250);
- the expanded state is a local `useState(true)` (L138), not the `gblLeftNavigationMenuIsExpanded` global.

The Cost rail's hamburger has `data-testid="icon_Left_Navigation_Expand"` and
`aria-label`/tooltip **"Collapse menu" / "Expand menu"** (L178–190). The PM rail uses the canvas
tooltip verbatim, `collapseTooltip` (L74), with the "naviagtion" typo kept.

---

## 4. Gaps: code app vs canvas

| ID | Area | Canvas behaviour (cite) | Code app behaviour (cite) | Type | Status | Severity | Notes |
|---|---|---|---|---|---|---|---|
| GAP-PCF-01 | P1 renderer behaviour | Tree with expand/collapse, Jan–Dec headers, cluster timeline, totals, sticky Grand Total, browser-locale number format, dash for 0, paid green cell and total, standard blue, comment dots and tooltips, ••• menu, Add menu (0/1/n options), month menu with the equal-distribution message, all-rows paging (`GridRenderer.ts`, `DatasetParser.ts`, `ActionDropdown.ts`, `index.ts`) | The same code, vendored (`pcf/ui/*.js`, `pcf/services/DatasetParser.js`) and driven by `PcfGrid.tsx:69–92`. The empty filtered tree shows "Loading data…" (`GridRenderer.js:1427–1438`), as in the canvas | UI | Covered | Low | Parity by construction. The empty state looking like a load is inherited canvas behaviour |
| GAP-PCF-02 | P1 dataset schema | `colFinatCostDataOptimized` (L1570–2295), §2.1.3 | `gridRows.ts:127–228`. Same logical fields; the alias duplicates are omitted (not needed by the parser) | Data | Covered | Low | UT-GRID-001…020 |
| GAP-PCF-03 | P1 event dispatch | `OnChange` L7278–7650; trigger pulse and reset (`index.ts:234–306`) | `Screen.tsx:423–452`, a direct callback (`GridRenderer.d.ts:2`) | Functional | Covered | Low | Paid confirmation for Individual + linked: UT-CAPEXS-007 (sizes). The rest is pinned only through the mocked grid (`Screen.test.tsx:126–176`) |
| GAP-PCF-04 | `CollapseResetKey` | Key = category & `locScreenVisitStamp` (L7274, L36) | Not passed. `key={category}` remount and route remount give the same reset (`Screen.tsx:744`, `PcfGrid.tsx:73`) | UX | Covered | Low | D-2 in `01-BUGS-FOUND.md` asked whether to inherit the prop: the behaviour is kept, the prop is not |
| GAP-PCF-05 | Dataset paging | `loadNextPage()` loop (`index.ts:203–215`) | All rows handed over at once (`PcfGrid.tsx:11–15`) | Perf | Covered | Low | — |
| GAP-PCF-06 | P1 CSS | 1,270-line stylesheet; host supplied line-height and the body font | Byte-identical copy, plus `canvas.css:246–247` compensation | UI | Covered | Low | `pcfCascade.test.ts:41–98` |
| GAP-PCF-07 | Port integration fixes | `PCF_RE_RENDER` on `window` (`GridRenderer.ts:1678`); `getElementById` (`ActionDropdown.ts:173`); `Intl.NumberFormat` per cell | Container-scoped event (`GridRenderer.js:1409`), scoped query (`ActionDropdown.js:160`), pooled formatter (`:1381–1389`) | Perf | Divergent-marked | Low | `PCF-RENDERER-PORT.md`, `read-pcf-port.mjs:7–72`, `pcfGridFormat.test.ts` (no UT ids). No D-entry |
| GAP-PCF-08 | Port reproducibility | Upstream sets no `data-testid` | 4 hand edits add test ids (`GridRenderer.js:772, 955, 970, 990–1013`) that `read-pcf-port.mjs` does not apply: a regeneration differs by 9+/5− and would drop them | Functional | Divergent-unmarked | Med | Documented only in `09-tosca…md`. `PCF-RENDERER-PORT.md` calls the port reproducible |
| GAP-PCF-09 | DOM control identities (rule 16) | Shipped PCF: toggles, •••, Add, and every menu item carry only their text (`GridRenderer.ts`, `ActionDropdown.ts`) | Unchanged: no `aria-label` and no `data-testid` (§3.1.6) | UX | Missing | Med | D16(a) (`02-OPEN-DECISIONS.md:317`). Outside both label gates. Tosca cannot key these controls |
| GAP-PCF-10 | Comment dot on a "-" month | Dot is rendered on zero cells too (`GridRenderer.ts` `appendContractMonthCell`) | Rendered, but **without** a test id (`GridRenderer.js:950`) | UX | Missing | Low | The hand edit only covered non-zero cells |
| GAP-PCF-11 | Cluster timeline inputs | Every `Cluster{n}Date` always gets a date. A blank milestone falls back to `Date(Coalesce(StartYear, locNavigationMinYear, gblSelectedProjectYear), Coalesce(StartMonth,1), 1)` (L7238–7273, `App.pa.yaml:205`), which the parser places at month 0 | `null` for an unknown boundary, so the band is omitted (`PcfGrid.tsx:81–84`, `clusters.ts:85–99`) | UI | Divergent-unmarked | Med | (inferred) In the canvas, blank later milestones make the highest-indexed blank cluster claim January onward (`DatasetParser.js:948–959`); the code app shows the real last cluster. The comment at `PcfGrid.tsx:79–80` states the behaviour but carries no DIVERGENCE marker or D-entry. Needs a live check (§5) |
| GAP-PCF-12 | Standard option names | `Name: Coalesce(vsb_description, vsb_descriptioninput, "Standard Contract " & Text(vsb_autoid))` (L703–707) | `name: assumption.description` only (`Screen.tsx:385`, `data/standardContracts.ts:41`). No `AutoId` column, so the parser **drops** an option whose description is blank (`DatasetParser.js:539–544`) | Data | Divergent-unmarked | Med | Data-dependent: needs a check for assumptions with a blank `vsb_description` |
| GAP-PCF-13 | Standard option order | `SortByColumns(…, "AutoId", SortOrder.Ascending)` (L715–716) | Fetch order; no `$orderby` (`data/standardContracts.ts:23–35`) | UI | Divergent-unmarked | Low | The submenu order can differ from the canvas |
| GAP-PCF-14 | Paid toggle, missing row | `Notify("No monthly cost row found for selected contract/month/year.", Warning)` (L7740–7744) | "No monthly cost row found for **the** selected contract/month/year.", shown as an inline alert banner (`rules.ts:854`, `Screen.tsx:441, 1050`) | UX | Divergent-unmarked | Low | Rule 7: string reworded without a comment |
| GAP-PCF-15 | Paid toggle, write failure | `Notify("Could not update paid status. Please refresh and try again.", Error)` (L7753–7757) | The raw `Error.message` in a banner (`Screen.tsx:1051–1053`) | UX | Divergent-unmarked | Low | The canvas string is absent from `src/` |
| GAP-PCF-16 | Paid toggle spinner | `locSpinnerInformationText: "Please wait, saving..."` (L7665) | `SAVING_COSTS` "Please wait, saving costs..." (`Screen.tsx:1048`, `panelRules.ts:237`) | UX | Divergent-unmarked | Low | — |
| GAP-PCF-17 | AddStandardContract feedback | `Notify(…, Warning)` / `Notify(…, Information)` toasts, plus a server `LookUp` duplicate check and `RemoveIf` (L7373–7393) | `globalThis.alert(message)` (`Screen.tsx:395`). The duplicate check is "not in the client option list" (`alreadyExists: !option`, L392) | UX | Divergent-unmarked | Low | The strings are verbatim (`standardContracts.ts:144, 149`). A blocking browser alert is not the canvas toast (`useNotify` exists in `components/`) |
| GAP-PCF-18 | Contract name on the grid | `Name` = `CPC.Name` (`vsb_name`) (L1205, L1810–1815) | `contractLabel(vsb_description, vsb_name)`: the description wins (`costBook.ts:1083–1088`) | Data | Divergent-unmarked | Low | `gridRows.ts:105–107` claims the canvas field is `Coalesce(Description, Name)`, which is wrong. Same on DEV only while `vsb_description` is empty |
| GAP-PCF-19 | Account-level contracts | Contracts must sit on a subaccount of the category (L1043–1048). A contract on a level-2 account is excluded from every row and total | Counted in the account total and the Grand Total (`gridRows.ts:162–181`), pinned by UT-GRID-003 | Data | Divergent-unmarked | Low | The test comment claims canvas parity, which is wrong. Data-dependent |
| GAP-PCF-20 | Blank `Cost Type` | `CostPaidBy` `""`, `SubLabel` `"[]"` (L1220–1234); hidden under both the DevCo and SPV filters (`GridRenderer.js:382–385`) | `resolvePayer` → mapping, else "SPV" (`costBook.ts:1118–1127`), so the contract shows `[SPV]`/`[DevCo]` and is filtered as such | Data | Divergent-unmarked | Low | The comment at `costBook.ts:1089–1090` cites the panel's `locInitialCostPaidBy` rule, not the grid's |
| GAP-PCF-21 | Renderer test coverage | — | No DOM test of `PcfGrid` or `GridRenderer`: `Screen.test.tsx:126–131` mocks the grid. `render(context: unknown)` is untyped (`GridRenderer.d.ts:6`). `pcfGridFormat.test.ts` and `pcfCascade.test.ts` have no UT ids | Functional | Partial | Med | The adapter's parameter names (`Cluster{n}Date`, `StandardContractOptions`, …) are unchecked. A typo would fail silently |
| GAP-PCF-22 | P2 CDN hotfix | Empty PCF whose CSS re-points the Fabric MDL2 icon font (§2.2) | Not ported: no Fabric icon font in use | UI | Covered | Low | Not needed |
| GAP-PCF-23 | P3–P5 hidden PCFs | CommandBar and year Icons, `Visible: =false` (L3080, L3566, L3595) | Not ported; their functions are reached through the grid menus and the toolbar | Functional | Covered | Low | gap-analysis B7 |
| GAP-PCF-24 | P7 dead Save icon | `btn_SaveCost_Execute____`, `Visible: =false`, never selected (L17692) | Not ported | Functional | Covered | Low | — |
| GAP-PCF-25 | P6, P8, P14–P16 Icon buttons | PowerCAT ActionButtons with canvas names | `PanelButtons` / `ConfirmDialog` with canvas test ids (`CommentsPanel.tsx:527`, `Screen.tsx:754–755`) | UI | Covered | Low | Details in 06 / 08 / 09 |
| GAP-PCF-26 | P12 Nav identity | `AccessibilityLabel: ="Left navigation"`; hamburger tooltip `"{Decrease\|Expand} left naviagtion panel"` (`cmp_Left_Navigation.pa.yaml:148, 154`) | `aria-label="Cost sections"` (`LeftNav.tsx:79`); Cost-rail button "Collapse menu"/"Expand menu" (`:178–189`) | UX | Divergent-unmarked | Low | The PM rail uses the canvas tooltip (`:74`). Rule 16 asks for the canvas label |
| GAP-PCF-27 | P9–P11 header identities | ContextMenu `AccessibilityLabel: ="User information"`; canvas names `pcf_HeaderContainerReportError_WarningIcon`, `…_CommandBar`, `pcf_cmpHeader_User_ContextMenu_Info` | `aria-label="User"`; test ids `header-error`, `header-help`, `header-user` (`AppHeader.tsx:324–371`) | UX | Divergent-unmarked | Low | Rule 16 says never change existing ids, so this needs a decision rather than a silent rename |
| GAP-PCF-28 | P9 warning icon | Not clickable (no `OnChange`) (`cmp_Header.pa.yaml:491–506`) | A Button that opens Report Problem (`AppHeader.tsx:322–328`) | UX | Code-app-only | Low | — |
| GAP-PCF-29 | P10 InfoCenter | `Launch(gblInfoCenterLaunchUrl, Blank(), LaunchTarget.Replace)` (`cmp_Header.pa.yaml:541–545`) | `window.open(url, "_blank", "noopener")` (`AppHeader.tsx:356–361`) | UX | Divergent-marked | Low | D8 |
| GAP-PCF-30 | P13 panel error badge | `cmp_ShowErrorInContract`: "Total percentage is over 100%" / "…below 100%" / "No cost is allocated." (L19765–19831) | Not rendered; the save is blocked by `canPersistIndividual` (`rules.ts:824–830`) | UX | Missing | Med | Owned by 08; listed here because the badge is a PCF host |

**Counts:**
- **By status (30 rows):** Covered 10 (01–06, 22–25), Divergent-marked 2 (07, 29), Divergent-unmarked 13 (08, 11–20, 26, 27), Missing 3 (09, 10, 30), Partial 1 (21), Code-app-only 1 (28).
- **By severity:** High 0, Med 6 (08, 09, 11, 12, 21, 30), Low 24.

---

## 5. Open questions / not verifiable from source

1. **What `Year()` and `Month()` return for a blank milestone in the live canvas** (`App.pa.yaml:205`), and so what the timeline header shows for a project with blank later milestones (GAP-PCF-11). This needs a live canvas run on a project whose `'5-Construction'` / `'Operations start date (COD)'` are blank.
2. **Whether the deployed bundle is exactly clone `5f12280`.** It is consistent on string probes (§2.1.1), but the webpack bundle cannot be byte-compared with the TS.
3. **Data-dependent divergences.** Do any of these exist in `VSBCloud_Dev` or production?
   - contracts filed on a level-2 account (GAP-PCF-19);
   - contracts with a blank `vsb_costtype` (GAP-PCF-20);
   - contracts whose `vsb_description` differs from `vsb_name` (GAP-PCF-18);
   - standard assumptions with a blank `vsb_description` (GAP-PCF-12).

   Each needs a Dataverse query.
4. **Sort collation.** Power Fx `SortByColumns(…, "vsb_costdescription")` against `localeCompare` (UT-GRID-018) for mixed case or umlauts. This needs a live comparison.
5. **Whether the hotfix CDN path** `res.cdn.office.net/files/fabric-cdn-prod_20241209.001/…` still serves, and whether its CSS stays active on other screens after the Capex screen has loaded it (§2.2).
6. **Whether the duplicated `SetCostPaidUnpaidTriggered` block** (L7442–7456) causes a visible double render of the confirmation popup. It is idempotent on paper.

---

## 6. Doc disagreements

1. **Namespace and component name.** `migration-plans/03-pcf-inventory.md:36` says "namespace `DEV.Controls`", and `:47` says "component `dev_DEV.Controls.DevexCapexSummaryPCF`". The manifest says `namespace="Dev"` (`ControlManifest.Input.xml:3`) and the YAML says `ComponentName: vsb_Dev.DevexCapexSummaryPCF` (L7236). The upstream `index.ts:3` header has the same "DEV.Controls" error.
2. **Native rewrite.** `03-pcf-inventory.md:7–8` and `:411` say the grid is "recreated natively with the shared `DataGrid`". The code app vendors the original renderer (`PcfGrid.tsx:2–3`, `PCF-RENDERER-PORT.md`). `01-BUGS-FOUND.md` S-4 ("The two PCF replacements do not exist") is likewise stale.
3. **The second paid block.** `03-pcf-inventory.md:115–117` calls the second `SetCostPaidUnpaidTriggered` block "dead". It is live but redundant: for Individual + linked contracts it re-sets `locIsVisibleSetPaidCost` (L7451–7454).
4. **Port reproducibility.** `PCF-RENDERER-PORT.md` lists "two integration fixes" plus the formatter pooling, and says the script "prints the reproducible port". `GridRenderer.js` carries four further hand edits (the test ids) that the script does not produce (GAP-PCF-08).
5. **Stale paths.**
   - `09-tosca-automation-conventions.md:152` and `:156` link `ProjectCosts-CodeApp/src/features/capex-costs/pcf/ui/GridRenderer.js`. The file is now under `features/cost/capex-costs/`.
   - `styles/pcfCascade.test.ts:5` cites the same old path.
6. **Coverage claim for the grid menus.** `09-tosca…md:21` ("Dropdowns, toolbar buttons, nav … Static `aria-label` … No change") reads as if every menu is labelled. The PCF's DOM menus have no `aria-label` or `data-testid`, which `02-OPEN-DECISIONS.md` D16(a) states correctly.
7. **The canvas description field.** `gridRows.ts:105–107` says the canvas `vsb_costdescription` is "the contract's `Coalesce(Description, Name)`". The canvas has `vsb_costdescription: CPC.Name` (L1205).
8. **UT-GRID-003.** Its comment (`gridRows.test.ts:117–118`) says money on a level-2 account "still has to appear in that account's totals", as canvas parity. The canvas excludes such contracts (L1043–1048).
9. **Stale dummy-data comments.** `GridRenderer.js:131` (the render JSDoc: "fallback to sample data when empty") and `:1425` ("even the test fallback") describe dummy data that clone commit `b729b70` "Remove dummy-data fallback entirely" deleted. These are upstream comments, carried into the vendored copy.
10. **Help bar control name.** `AppHeader.tsx:15` cites `pcf_HeaderContainerReportError_CommandBar_1`. That name exists only in the PM app (`projectmanagement/Src/Project Main Screen.pa.yaml`). The Cost app's `cmp_Header` control is `pcf_HeaderContainerReportError_CommandBar` (`cmp_Header.pa.yaml:507`).
11. **Packaged vs source manifest.** `03-pcf-inventory.md:18–19` says the packaged and source manifests are "byte-identical in property/dataset shape". They are identical in shape, but not byte-identical: the packaged one adds `api-version="1.3.18"`, `built-by pac 1.51.1` and the `bundle.js` resource. This is minor.
