# 🧩 Canvas App Developer Guide — DEVEX/CAPEX Cost Screen & DevexCapexSummaryPCF

This document explains the **Power Apps Canvas App side** of the DEVEX/CAPEX cost screen: how data is prepared for the `DevexCapexSummaryPCF` control, every dropdown/toggle/button that drives it, the confirmation popups, and the full round-trip that turns a PCF click into a Dataverse mutation.

> 📚 Companion docs: [README.md](README.md) (PCF reference) · [VISUAL_GUIDE.md](VISUAL_GUIDE.md) (visual map of the PCF) · `CLAUDE_CODE_HANDOFF_CONTEXT.md` (history).
> 🔎 Source of truth for this doc: `Powerapps code/CapexScreenCode.txt` (screen export) and `Powerapps code/OnStart.txt` (app OnStart). Line numbers below refer to `CapexScreenCode.txt` at the time of writing — treat them as approximate landmarks, names are exact.

---

## 1. 🧭 Overview

The DEVEX/CAPEX cost screen replaces a legacy gallery with the custom PCF table. The split of responsibilities:

| Layer | Owns |
|---|---|
| **Canvas App** | Dataverse reads/writes, business rules, validation, duplicate checks, collection building, year/filter state, confirmation popups, the Add/Edit contract right panel |
| **PCF (`DevexCapexSummaryPCF`)** | Rendering the hierarchy, applying UI-only filters, and reporting user clicks back through output triggers |

The golden rule: **the PCF never touches Dataverse.** It raises a trigger; the Canvas screen's `OnChange` handler does the real work.

---

## 2. 🗂️ Where the PCF lives in the control tree

```text
con_Costs_Screen
└── con_Costs_Body
    └── con_Costs_BodyRightSide
        └── con_Costs_ContentAssignableAccountCategories
        │   └── tab_Costs_ContentAssignableAccountCategories   ← account-category tabs
        └── con_Costs_ContentCostsInMonths                      (Visible = a category tab is selected)
            ├── con_Costs_ProjectCosts_TableCommandBar_Toggles  ← year / filter / toggle controls
            └── DevexCapexSummaryPCF                            ← THE PCF (line ~7071)
```

Plus several **hidden “code” buttons** that live elsewhere on the screen and act as callable subroutines (see §8), and the **popups/panels** (see §7).

---

## 3. 📦 Data the Canvas App feeds the PCF

### 3.1 Collections built in `OnStart.txt`

`OnStart` loads the reference data the screen needs:

| Collection / Global | Built from | Purpose |
|---|---|---|
| `gblSelectedProject` | `Projects` (by `Param("projectId")`, with a test fallback GUID) | The project in context |
| `gblSelectedProjectYear` | `Year(...)` of acquisition/start/COD date (ignores blanks) | Initial selected year → PCF `StartYear` |
| `gblClusterDurations` | Project milestone dates (`1-Feasibility…`, `Operations start date (COD)`, `End Date`) | 6 cluster Start/End month+year rows → PCF `Cluster1Date..Cluster6Date` |
| `colCapexAccountsNew` / `colCapexSubaccountsNew` | `CAPEX Account Lists` (active) | Account/subaccount master |
| `colCapexProjectContracts` | `CAPEX Project Contracts` (this project) | Contract master |
| `colCapexCosts` | `CAPEX Costs` per contract (ungrouped) | Monthly cost rows incl. `Cost Paid` |
| `colContractDistributionTypes` / `…Scheme` | `Choices('Distribution Type' / 'Distribution Scheme')` | Distribution choices for the panel |
| `colCostPaidType` | `LastN(Choices('Cost paid type'), 2)` | DevCo / SPV choices |

### 3.2 The two datasets the PCF binds to

These are **rebuilt on demand** (not in OnStart) by the hidden code buttons in §8:

| Dataset (PCF) | Canvas collection | Built by |
|---|---|---|
| `DevexCapexCostSummary` (`Items`) | `colFinatCostDataOptimized` | `btn_Capex_Cost_Refresh_Capex_Cost_Code` |
| `StandardContractOptions` (`StandardContractOptions_Items`) | `colStandardContractOptionsForPCF` | `btn_Capex_Cost_Build_StandardContractOptions_Code` |

> ⚠️ The collection name `colFinatCostDataOptimized` contains a **legacy typo** (“Finat”). It is referenced everywhere — do not rename it.

---

## 4. 🔌 PCF property bindings (`DevexCapexSummaryPCF`, line ~7071)

Component: `dev_DEV.Controls.DevexCapexSummaryPCF`

| PCF property | Bound to | Notes |
|---|---|---|
| `Items` | `colFinatCostDataOptimized` | Main hierarchy dataset |
| `StandardContractOptions_Items` | `colStandardContractOptionsForPCF` | Per-subaccount standard options |
| `StartYear` | `gblSelectedProjectYear` | Year for the M1–M12 columns |
| `ShowPlannedCost` | `tgl_Costs_ProjectCostbtn_ShowPlannedPaid.Checked` | Planned/Actual columns |
| `ShowEmptyAccounts` | `tgl_Costs_ProjectCostbtn_ShowEmptyAccounts.Checked` | Hide empty accounts |
| `CostPaidByFilter` | `Coalesce(drp_Costs_ProjectCostbtn_ShowCostPaidBy.Selected.Value, "Show All Cost")` | DevCo / SPV / Show All |
| `Cluster1Date`…`Cluster6Date` | `Date(Coalesce(LookUp(gblClusterDurations, Order = N, StartYear), locNavigationMinYear, gblSelectedProjectYear), Coalesce(…StartMonth, 1), 1)` | Cluster timeline header |
| `Height` | `Parent.Height - 45` | |
| `Width` | `Parent.Width - 10` | |

All inputs are **reactive** — changing a toggle/dropdown re-flows into the PCF automatically. `StartYear` changes also trigger a data rebuild (see §6).

---

## 5. 🔁 The PCF `OnChange` handler — actions back into Canvas

`OnChange` (lines ~7114–7269) first resolves the clicked row, then branches on which trigger fired. Every branch ends by either opening a panel/popup or selecting a hidden code button.

```text
locSelectedCostRow = LookUp(colFinatCostDataOptimized, vsb_capexaccountlistid = GUID(Self.SelectedRecordId))
```

| Branch | Condition | What Canvas does |
|---|---|---|
| **Add** | `Self.AddTriggered` | Sets `locWarmupMode:"addContract"`, opens the right panel (`locIsVisibleRightPanelAddContract: true`), seeds `locInitialCostPaidBy` from the subaccount’s SPV/DevCo mapping |
| **Edit** | `Self.EditTriggered` | Loads the contract into `locSelectedProjectContract`, sets `locWarmupMode:"edit"`, `locAllYearsCost`, opens the right panel |
| **Add Standard** | `Self.AddStandardContractTriggered` | Validates the subaccount + duplicate check; if OK sets `locGUIDforLoadingStandardContract` and **Selects `btn_Capex_Cost_Add_Standard_Contract_Code`**; removes the chosen option from `colStandardContractOptionsForPCF`, refreshes, rebuilds |
| **Delete** | `Self.DeleteTriggered` | `locIsVisibleSubaccountCostsDeletionDialog: true` → shows the delete confirmation popup (§7.1) |
| **Set Paid/Unpaid** | `Self.SetCostPaidUnpaidTriggered` | If contract is **Individual Distribution AND has a Linked Cluster** → shows the cluster-link warning popup (`locIsVisibleSetPaidCost: true`, §7.2). Otherwise the popup path is skipped (see ⚠️ note below) |

> 🚨 **No `Self.CommentTriggered` branch exists** in `OnChange`. The PCF emits `CommentTriggered` (from both the contract three-dot menu and the new month-cell Comments item), but Canvas currently does nothing with it — the comments panel is still to be built.
>
> ✅ **Set Paid (fixed — 13281, see §12):** the `SetCostPaidUnpaidTriggered` branch now has an `else` that `Select`s `Btn_CodeforSettingCostPaidUnpaid` for individual costs **without** a linked cluster, so the paid flag is patched directly. The cluster-linked case still shows the warning popup first. (The PCF blocks Equal/Cluster-distributed costs at the UI level.)

### Output → variable mapping the handler relies on

| PCF output | Used as |
|---|---|
| `SelectedRecordId` | Contract/subaccount RowId → `locSelectedCostRow` |
| `SelectedStandardContractId` | → `locGUIDforLoadingStandardContract` |
| `SelectedCostContractId` / `SelectedCostYear` / `SelectedCostMonth` / `SelectedCostPaid` | Consumed by `Btn_CodeforSettingCostPaidUnpaid` to find & patch the `CAPEX Costs` row |

---

## 6. 🎛️ Command bar — toggles, dropdowns & year navigation

Container `con_Costs_ProjectCosts_TableCommandBar_Toggles`. The whole costs section (`con_Costs_ContentCostsInMonths`) is only visible when a category tab is selected:
`Visible = Not(IsBlank(tab_Costs_ContentAssignableAccountCategories.Selected.'CAPEX Account List'))`.

### 6.1 Toggles

| Control | Label | Default | Visible | Feeds PCF |
|---|---|---|---|---|
| `tgl_Costs_ProjectCostbtn_ShowEmptyAccounts` | Show Empty Accounts | **On** | yes | `ShowEmptyAccounts` |
| `tgl_Costs_ProjectCostbtn_ShowPlannedPaid` | Show Total Planned/Paid | — | yes | `ShowPlannedCost` |
| `tgl_Costs_ProjectCosts_TableCommandBar_ShowInactiveAccounts` | Show inactive | `locShowInActive` | **false (hidden)** | — (logic intact for future) |
| `tgl_Costs_ProjectCosts_TableCommandBar_FiscalYear` | Show Fiscal year | — | **false (hidden)** | — (empty handlers) |
| `tgl_Costs_ProjectCostsbtn_…_ProjectTimeline` | Showing Cost for All Years | — | **false (hidden)** | — |

> The two cost-driving toggles use **pure data binding** (no OnCheck logic) — the PCF reacts to `.Checked` directly.

### 6.2 Cost Paid By dropdown — `drp_Costs_ProjectCostbtn_ShowCostPaidBy`

- **Items:** `["Show All Cost", "DevCo", "SPV"]`
- **Default:** `{Value:"Show All Cost"}`
- **No OnChange** — value flows straight into PCF `CostPaidByFilter` via the `Coalesce(...)` binding. Filtering is UI-only inside the PCF (totals recalculated from visible rows).

### 6.3 Year selector — dropdown + prev/next buttons

All three write `gblSelectedProjectYear` and then **`Select(btn_Capex_Cost_Refresh_Capex_Cost_Code)`** to rebuild the dataset for the new year.

| Control | Behavior |
|---|---|
| `drp_Costs_ProjectCostbtn_ShowSelectedYear` | **Items:** `SortByColumns(colProjectPeriods, "Year", Ascending)`. **Default:** `LookUp(colProjectPeriods, Year = gblSelectedProjectYear)`. **OnChange:** spinner on → `Set(gblSelectedProjectYear, Value(Self.Selected.Year))` → clear `locSelectedCostRow` → refresh → spinner off |
| `btn_Costs_ProjectCostbtn_ShowPreviousYear` | **DisplayMode:** enabled only if `gblSelectedProjectYear > Coalesce(locCostAllowedStartYear, Min(colProjectPeriods, Year), Year(Today()))`. **OnSelect:** `Set(gblSelectedProjectYear, Max(gblSelectedProjectYear - 1, varMinSelectableYear))` → refresh |
| `btn_Costs_ProjectCostbtn_ShowNextYear` | **DisplayMode:** enabled only if `gblSelectedProjectYear < locNavigationMaxYear`. **OnSelect:** `Set(gblSelectedProjectYear, Min(gblSelectedProjectYear + 1, locNavigationMaxYear))` → refresh |

> 🧮 **Year bounds:** lower = `locCostAllowedStartYear` / earliest `colProjectPeriods`; upper = `locNavigationMaxYear`. The older logic that **auto-extended `colProjectPeriods`** when paging past the max is **commented out** in `ShowNextYear` — new years must already exist in `colProjectPeriods`. This is the historical fix for the "1900–2021 / too many years" bug: periods are built only from valid project dates.

### 6.4 Add Cost from Table — `btn_Costs_ProjectCosts_TableCommandBar_AddCostFromTable`

Always visible. Builds bulk-entry collections (`colAddCostFromTable`, `colCombinedCostAccounts`, `colSubaccountMappedCostPaid`), serializes them to `varPCFInputData = JSON(...)`, and **navigates to the “Add Costs from Table” screen** (a separate bulk editor) — not part of the inline PCF round-trip.

---

## 7. 🪟 Confirmation popups & panels

### 7.1 Delete confirmation — `cmp_PopUp_SubaccountCostsDeletion_Confirmation` (line ~7697)

- Component: `cmp_PopUp_Confirmation`. **Visible:** `locIsVisibleSubaccountCostsDeletionDialog` (set true by the PCF Delete branch).
- **Title:** “Delete Contract”. **Description:** dynamic — *“Are you sure you want to delete the costs for "{description}" of the selected Subaccount "{account name}"?”*
- **OnCancel:** `locIsVisibleSubaccountCostsDeletionDialog: false`.
- **OnConfirm:** spinner on → `Remove('CAPEX Project Contracts', locContractToDelete)` (looked up by `locSelectedCostRow.vsb_capexaccountlistid`) → **`Select(btn_Capex_Cost_Reload_PCF_After_Mutation_Code)`** → clear `locSelectedCostRow` → spinner off. *(The direct `RemoveIf` on `CAPEX Costs` is commented out — cost rows are cascaded by the contract delete.)*

### 7.2 Set-as-Paid cluster warning — `cmp_PopUp_Confirmation_For_SetasPaidUnpaidCost` (line ~17463)

- Component: `cmp_PopUp_Confirmation`. **Visible:** `locIsVisibleSetPaidCost`.
- **Title:** “Cluster link cost”. **Description:** *“Setting the cluster-linked costs to 'Paid' will remove the cluster link for all the costs in contract. Do you want to proceed?”*
- **OnConfirm:** hides popup, spinner on → `Patch('CAPEX Project Contracts', varGetContract, {'Linked Cluster': Blank()})` (contract = `GUID(DevexCapexSummaryPCF.SelectedCostContractId)`) → **`Select(Btn_CodeforSettingCostPaidUnpaid)`**.
- **OnCancel (fixed — 13283, see §12):** now `=UpdateContext({locIsVisibleSetPaidCost: false})` so both the X and Cancel close the dialog (was a no-op `=true`).

### 7.3 The paid-flag worker — `Btn_CodeforSettingCostPaidUnpaid` (line ~7277)

Hidden button (sibling of the PCF). Reads `DevexCapexSummaryPCF.SelectedCostContractId / SelectedCostYear / SelectedCostMonth / SelectedCostPaid`, finds the matching `CAPEX Costs` row (contract + `vsb_year` + `Month` choice), then:
`Patch('CAPEX Costs', varCostRecord, {'Cost Paid': SelectedCostPaid})` → `Refresh('CAPEX Costs')` → **`Select(btn_Capex_Cost_Reload_PCF_After_Mutation_Code)`**. Notifies if no matching row is found.

### 7.4 Add/Edit Contract right panel — `con_cost_RightPanel_Form_AddContract` (line ~7760)

- **Visible:** `locIsVisibleRightPanelAddContract` (opened by the PCF Add/Edit branches). Slides in from the right (max width 750).
- **Mode:** `locWarmupMode` (`"addContract"` vs `"edit"`) + `locSelectedProjectContract` drive header title and field pre-fill; `locWarmupKick`/`locPanelReady` gate the warm-up.
- **Key fields:** description (`txt_AddContract_RightPanel_Description_1`), cost type DevCo/SPV, distribution type/scheme radios (`rad_AddContract_RightPanel_DistributionType_1` / `…DistributionScheme_1` / `…DistributionBy_1`), cluster checkboxes (`chk_AddContract_RightPanel_SelectCluster1..5_1`), link-to-cluster dropdown (`drp_Add_Edit_Cost_Data_RightPanel_Form_Link_to_Cluster`), payment frequency (`drp_AddContract_RightPanel_PaymentFrequency_1`), start/end dates, VAT toggle (`tgl_AddContract_RightPanel_ApplyVAT_1`), depreciation toggle (`tgl_AddContract_RightPanel_Depreciation_1`), and the per-month individual-cost grid (`gal_IndividualCost_Items_1`).
- **`con_Warning_OnEditFromPCF`** (~9925): inline warning shown when editing a contract launched from the PCF (e.g. cluster-linkage / distribution changes that affect existing costs).

### 7.5 Save & Cancel

- **Save — `btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Save`** (~15005). `DisplayMode` is a large validation expression (description present, no error labels visible, distribution-specific completeness). `OnSelect` patches `CAPEX Project Contracts` + `CAPEX Costs` (two code paths — Individual vs Equal distribution) and on each path ends with **`Select(btn_Capex_Cost_Reload_PCF_After_Mutation_Code)`**, then closes the panel.
- **Cancel — `pcf_btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Cancel_2`** (~15654): resets `locIsVisibleRightPanelAddContract: false` and clears the working variables.

---

## 8. ⚙️ Hidden “code” buttons (callable subroutines)

These have `Visible = false` and exist purely to be `Select()`-ed.

| Button | Purpose (summary) |
|---|---|
| `btn_Capex_Cost_Refresh_Capex_Cost_Code` (~855) | **Rebuilds `colFinatCostDataOptimized`** for the selected category + year: category contracts → current-year contract rows → account/subaccount rows → merge hierarchy → map selected-year `M1..M12` and `MnPaid` from `colFlatCostsMapped` → all-years `TotalCost/PlannedCost/ActualCost` from `colContractTotalsForPCF` |
| `btn_Capex_Cost_Build_StandardContractOptions_Code` (~293) | **Rebuilds `colStandardContractOptionsForPCF`**: filters `Devex/Capex Standard Assumptions` by subaccount, country, technology, **not-already-created** (LookUp against `CAPEX Project Contracts`), and cluster eligibility; outputs `StandardContractId / SubaccountId / Name / AutoId / ShowOption`, sorted by `AutoId` |
| `btn_Capex_Cost_Reload_PCF_After_Mutation_Code` (~563) | **Post-mutation resync**: `Refresh('CAPEX Project Contracts')` + `Refresh('CAPEX Costs')` → rebuild `colCapexProjectContracts` + `colCapexCosts` → `Select(btn_Capex_Cost_Refresh_Capex_Cost_Code)` → `Select(btn_Capex_Cost_Build_StandardContractOptions_Code)` |
| `btn_Capex_Cost_Add_Standard_Contract_Code` (~15721) | **Creates a standard contract**: loads the assumption (`locGUIDforLoadingStandardContract`), computes total cost (per unit type × generators/MW), determines eligible clusters, `Patch`es one `CAPEX Project Contract` + distributed `CAPEX Costs`, then `Select(btn_Capex_Cost_Reload_PCF_After_Mutation_Code)` |
| `Btn_CodeforSettingCostPaidUnpaid` (~7277) | Patches the single `CAPEX Costs` paid flag (see §7.3) |
| `btn_Capex_Cost_Add_New_*_Calculate_Cluster_Range_*` (~629/~680) | Helpers that compute which clusters overlap costs being edited (equal vs individual distribution) |

---

## 9. 🔂 Round-trip flows

### Add Standard Contract
```text
PCF: click Add Standard Contract
  → OnChange (AddStandardContractTriggered): validate + duplicate check
  → set locGUIDforLoadingStandardContract
  → Select(btn_Capex_Cost_Add_Standard_Contract_Code)   → creates contract + costs
  → Select(btn_Capex_Cost_Reload_PCF_After_Mutation_Code) → refresh + rebuild both collections
  → PCF rebinds; option disappears from the dropdown
```

### Edit / Add cost
```text
PCF: click Edit (or Add)
  → OnChange opens con_cost_RightPanel_Form_AddContract (locIsVisibleRightPanelAddContract)
  → user edits → Save (btn_..._Buttons_Save): Patch contract + costs
  → Select(btn_Capex_Cost_Reload_PCF_After_Mutation_Code)
  → PCF rebinds with fresh data
```

### Delete
```text
PCF: click Delete
  → OnChange: locIsVisibleSubaccountCostsDeletionDialog = true
  → cmp_PopUp_SubaccountCostsDeletion_Confirmation.OnConfirm
  → Remove('CAPEX Project Contracts', …)
  → Select(btn_Capex_Cost_Reload_PCF_After_Mutation_Code)
```

### Set paid / unpaid (cluster-linked individual costs)
```text
PCF: click Set as paid/unpaid on a month cell
  → OnChange (SetCostPaidUnpaidTriggered): if Individual + Linked Cluster
  → cmp_PopUp_Confirmation_For_SetasPaidUnpaidCost (warn cluster link removed)
  → OnConfirm: Patch contract {Linked Cluster: Blank()} → Select(Btn_CodeforSettingCostPaidUnpaid)
  → Patch('CAPEX Costs', …, {Cost Paid}) → Select(btn_Capex_Cost_Reload_PCF_After_Mutation_Code)
```

### Year change
```text
Year dropdown / prev / next → Set(gblSelectedProjectYear) → clear locSelectedCostRow
  → Select(btn_Capex_Cost_Refresh_Capex_Cost_Code) → PCF gets new-year M1..M12
```

---

## 10. 🔑 Key variables & collections reference

| Name | Kind | Role |
|---|---|---|
| `gblSelectedProject` | global | Project in context |
| `gblSelectedProjectYear` | global | Selected year → PCF `StartYear`; written by year controls |
| `gblClusterDurations` | global | 6 cluster Start/End month+year → PCF `ClusterNDate` |
| `colFinatCostDataOptimized` | collection | **PCF main dataset** (the “Finat” typo is intentional) |
| `colStandardContractOptionsForPCF` | collection | **PCF standard-options dataset** |
| `colProjectPeriods` | collection | Year list for the year dropdown / bounds |
| `colCapexProjectContracts` / `colCapexCosts` | collection | Contract & cost masters |
| `colFlatCostsMapped` / `colContractTotalsForPCF` | collection | Selected-year months & all-years totals used to build the PCF dataset |
| `locSelectedCostRow` | context | Row chosen in the PCF (resolved from `SelectedRecordId`) |
| `locSelectedCapexAccountCategory` | context | Active account-category tab |
| `locGUIDforLoadingStandardContract` | context | Input to the standard-contract creator |
| `locSelectedProjectContract` / `locWarmupMode` / `locAllYearsCost` | context | Add/Edit panel state |
| `locIsVisibleRightPanelAddContract` | context | Shows the Add/Edit panel |
| `locIsVisibleSubaccountCostsDeletionDialog` | context | Shows the delete popup |
| `locIsVisibleSetPaidCost` | context | Shows the set-paid cluster-warning popup |
| `locIsVisibleLoadingCostSpinner` / `locIsVisiblePopUpSpinner` | context | Loading spinners during refresh/mutation |
| `locNavigationMaxYear` / `locCostAllowedStartYear` / `locNavigationMinYear` | context | Year navigation bounds |

---

## 11. 🧪 Developer notes & gotchas

- **Always refresh after a mutation.** Every create/edit/delete/paid path ends in `btn_Capex_Cost_Reload_PCF_After_Mutation_Code`. Skipping it leaves the PCF blank/stale until the tab is reselected (the historical “PCF goes blank” bug).
- **`CommentTriggered` is unhandled.** Wiring it up (open a comments panel) is the main outstanding Canvas task. The PCF already emits it and supports comment red dots/tooltips once Canvas populates `HasComments`/`CommentTooltip`/`MnHasComments`/`MnCommentTooltip` (snippets in `Powerapps code/Comments_PCF_CodeSnippets.txt`).
- **Set-paid only handles the cluster-linked individual case** in `OnChange` — confirm whether non-cluster individual costs should also patch (see §5 ⚠️).
- **Year list is static per build of `colProjectPeriods`.** The auto-extend-on-next-year logic is commented out; build periods only from valid project dates (avoids the 1900-year explosion).
- **Standard-option dedup is Canvas-side.** The PCF only hides the “Add Standard Contract” item when its dataset has zero options; removing already-created options from `colStandardContractOptionsForPCF` (and rebuilding it) is the Canvas responsibility — done in the AddStandardContract branch and the build button.
- **Keep names exact.** `colFinatCostDataOptimized`, the trigger output names, and the input property names form the PCF↔Canvas contract; renaming either side silently breaks the round-trip.

---

## 12. 🛠️ Bug fixes — Sprint 66 (June 2026)

Canvas-side fixes for the DEVEX/CAPEX cost screen. Format: **component · property · change**. Line numbers are approximate landmarks in `CapexScreenCode.txt`; names are exact.

### 13121 — Default value not displayed in the two command-bar dropdowns
A `ModernDropdown`'s `Default` only shows a selection when it resolves to a **row taken from the same table expression as `Items`** (a hand-built record or a differently-ordered `LookUp` won't match). Mirror the working pattern (see the comment-sort dropdown, `Default: =First([...])`).
- `drp_Costs_ProjectCostbtn_ShowCostPaidBy` · `Default` (~2750): `={Value:"Show All Cost"}` → `=First(["Show All Cost","DevCo","SPV"])`
- `drp_Costs_ProjectCostbtn_ShowSelectedYear` · `Default` (~2765): `=LookUp(colProjectPeriods, Year = gblSelectedProjectYear)` → `=LookUp(SortByColumns(colProjectPeriods, "Year", SortOrder.Ascending), Year = gblSelectedProjectYear)`

### 13226 — SubLabel spacing & casing ("…cluster 3Distribution from…")
In the `colFinatCostDataOptimized` build inside `btn_Capex_Cost_Refresh_Capex_Cost_Code`, the two identifier parts were concatenated with no separator and lowercase "cluster".
- `" Link to cluster "` (~1083) → `" Link to Cluster "`
- `"Distribution to Cluster …"` (~1140) → prefix `If(Not(IsBlank(CPC.'Linked Cluster')), ", ", "") & "Distribution to Cluster …"`
- `$"Distribution from …"` (~1151) → prefix `If(Not(IsBlank(CPC.'Linked Cluster')), ", ", "") & $"Distribution from …"`

Separator lives **inside** each distribution branch so it only appears when both parts exist → `Link to Cluster 4, Distribution from 01/2020 to 01/2021`. PCF needs no change (it strips the `[tag]` and renders the rest).

### 13281 — Unable to set cost as paid/unpaid (individual cost with no milestone link)
PCF `OnChange` · `SetCostPaidUnpaidTriggered` branch (~7265): the inner `If` had no `else`, so a cost **without** a linked cluster fell through and nothing ran. Add the else to run the existing patch worker directly:
```
If(
    varPCFSelectedContract.Distribution = 'Distribution Type'.'Individual Distribution' && Not(IsBlank(varPCFSelectedContract.'Linked Cluster')),
    UpdateContext({locIsVisibleSetPaidCost: true}),
    Select(Btn_CodeforSettingCostPaidUnpaid)          // ← added else
)
```
`Btn_CodeforSettingCostPaidUnpaid` (§7.3) already finds the `CAPEX Costs` row and patches `Cost Paid` without needing a cluster link, so the cost turns green and lands under "Total Paid".

### 13283 — Set-as-Paid popup won't close on X / Cancel
`cmp_PopUp_Confirmation_For_SetasPaidUnpaidCost` · `OnCancel` (~17743): was `=true` (no-op). Both the X and the Cancel button route to `OnCancel`, so the dialog never hid.
- `OnCancel`: `=true` → `=UpdateContext({locIsVisibleSetPaidCost: false})` (mirrors the other `cmp_PopUp_Confirmation` instances).

### 13291 — No confirmation when re-linking a (paid) cost to a milestone
**Reuses the existing milestone/cluster-linking popup** `cmp_PopUp_Confirmation_1` (`Visible: =locShowClusterLinkageConfirmation`) — no new component. The dropdown `OnChange` already detects the re-link and the popup already re-runs `Select(Save)`; it just never fired for the "paid, no other-cluster costs" case.
- `drp_Add_Edit_Cost_Data_RightPanel_Form_Link_to_Cluster` · `OnChange` (~9239): add flag
  `locMilestoneRelinkResetNeeded: And(Self.Selected.Name <> "None", Self.Selected.Name <> locSelectedProjectContract.'Linked Cluster'.Name, Or(<contract has any Cost Paid = true>, <contract has unresolved "Comments to payment date">))`
- `btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Save` · `OnSelect`: add `locMilestoneRelinkResetNeeded` as a third term to the existing `Or(...)` show-gate that sets `locShowClusterLinkageConfirmation: true`.
- `cmp_PopUp_Confirmation_1` · `Description` (~17634): add a branch for the flag → *"Payment date comments and 'Paid' markers are not supported for milestone-linked costs. Linking this cost to a milestone will remove all payment date comments and reset all costs to unpaid. Do you want to continue?"*
- `cmp_PopUp_Confirmation_1` · `OnConfirm` (~17663): before the existing `Select(Save)`, when the flag is set, `ForAll(Filter('CAPEX Costs', … && 'Cost Paid' = true), Patch(… {'Cost Paid': false}))` and `Remove('Capex Comments', Filter(… CommentTypeText = "Comments to payment date"))`; also clear the flag in `OnConfirm`/`OnCancel`.

### 13125 (Canvas half) — unnecessary horizontal scrollbar
The PCF's parent container forced a 1590px minimum, so on screens narrower than ~1795px the scroll container (`con_Costs_BodyRightSide`, `LayoutOverflowX: Scroll`) overflowed regardless of the PCF's own responsive layout.
- `con_Costs_ContentCostsInMonths` · `Width` (~2377): `=Max(1590, Parent.Width)` → `=Parent.Width`

The 1590 floor was a leftover from the old fixed-width native table (`con_Costs_ProjectCosts_TableHeader`, `Width: =1570`, now hidden). The PCF scrolls internally below its own minimum, so the container no longer needs the floor. (The PCF-side fix — re-fit columns to the wrapper's `clientWidth` + a `ResizeObserver` — shipped in control **v1.0.30**.)

---

*Doc generated from `CapexScreenCode.txt` + `OnStart.txt`. Canvas formulas summarized — open the export at the cited line numbers for the verbatim source. Bug-fix section last updated June 2026.*
